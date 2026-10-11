"""
TFIDFMatcher — Matching semántico para el API backend.

Lee artefactos pre-entrenados por el pipeline ETL de analytics:
  - tfidf_model.joblib           → TfidfVectorizer (scikit-learn)
  - tfidf_provider_vectors.npz   → Matriz sparse 97K proveedores × 20K features
  - tfidf_provider_index.parquet → Mapeo CodigoProveedor → matrix_row

Expone:
  match(query_text, top_n)               → proveedores más afines al texto
  score_texts(query, texts)              → cosine sim batch query vs lista de textos
  get_clusters(limit)                    → taxonomía de clusters de productos
  is_available()                         → True si el modelo está entrenado

Lazy-loads con TTL de 24h igual que BIService.
"""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ─── In-process model cache ───────────────────────────────────────────────────
_model: dict[str, Any] | None = None
_model_loaded_at: float = 0.0
_MODEL_TTL = 86_400  # 24h


# ─── Text normalization (identical to ETL for vocabulary consistency) ─────────


def _clean_text(text: str) -> str:
    if not text or text in ("null", "None"):
        return ""
    text = text.lower()
    text = re.sub(r"[^\w\sáéíóúñü]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = [t for t in text.split() if len(t) > 2]
    return " ".join(tokens)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _analytics_path() -> Path:
    from app.config import settings  # avoid circular import at module level

    return Path(settings.analytics_data_path)


def _load_model() -> dict[str, Any] | None:
    """Carga el modelo TF-IDF con cache de 24h. Retorna None si no existe."""
    global _model, _model_loaded_at

    now = time.time()
    if _model is not None and (now - _model_loaded_at) < _MODEL_TTL:
        return _model

    try:
        import joblib
        import polars as pl
        from scipy import sparse
    except ImportError as exc:
        logger.error("TF-IDF dependencies not installed: %s", exc)
        return None

    base = _analytics_path()
    model_path = base / "tfidf_model.joblib"
    vectors_path = base / "tfidf_provider_vectors.npz"
    index_path = base / "tfidf_provider_index.parquet"

    if not (model_path.exists() and vectors_path.exists() and index_path.exists()):
        # La ruta RESUELTA: la por defecto es relativa, y en un contenedor lo
        # que falla casi siempre es dónde se busca, no que falte el modelo.
        logger.warning(
            "TF-IDF artifacts not found at %s (ANALYTICS_DATA_PATH) — run: "
            "python -m etl.analytics.run_all --modulo tfidf_matcher",
            base.resolve(),
        )
        return None

    _model = {
        "vectorizer": joblib.load(model_path),
        "matrix": sparse.load_npz(vectors_path),
        "index": pl.read_parquet(index_path),
    }
    _model_loaded_at = now
    logger.info("TF-IDF model loaded — %d proveedores en índice", len(_model["index"]))
    return _model


def _require_tfidf() -> dict[str, Any]:
    """Lanza ValueError si el modelo no está disponible."""
    from app.config import settings

    if not settings.feature_tfidf:
        raise ValueError("feature_tfidf deshabilitado")
    model = _load_model()
    if model is None:
        raise ValueError("Artefactos TF-IDF no encontrados — ejecute el pipeline ETL")
    return model


# ─── Public API ───────────────────────────────────────────────────────────────


def match(query_text: str, top_n: int = 20) -> list[dict]:
    """
    Dado un texto (nombre de licitación, descripción de producto), retorna
    los top-N proveedores históricos más afines por cosine similarity.

    Tolerante a variantes ortográficas porque el vectorizador aplica
    strip_accents="unicode" y el índice usa unigramas+bigramas, por lo que
    "computadores" y "computadoras" comparten términos suficientes.

    Retorna lista de dicts con {CodigoProveedor, NombreProveedor, n_oc, similarity_score}.
    """
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity

    try:
        model = _require_tfidf()
    except ValueError:
        return []

    clean = _clean_text(query_text)
    if not clean:
        return []

    vectorizer = model["vectorizer"]
    matrix = model["matrix"]
    index_df = model["index"]

    query_vec = vectorizer.transform([clean])
    sims = cosine_similarity(query_vec, matrix).flatten()

    top_n_clipped = min(top_n, len(sims))
    top_indices = np.argsort(sims)[-top_n_clipped:][::-1]

    results = []
    for idx in top_indices:
        score = float(sims[idx])
        if score < 0.01:
            break  # argsort is descending — no need to continue
        rows = index_df.filter(index_df["matrix_row"] == int(idx))
        if rows.is_empty():
            continue
        row = rows.row(0, named=True)
        results.append(
            {
                "CodigoProveedor": row["CodigoProveedor"],
                "NombreProveedor": row.get("NombreProveedor") or "",
                "n_oc": int(row.get("n_oc") or 0),
                "similarity_score": round(score, 4),
            }
        )

    return results


def score_texts(query_text: str, texts: list[str]) -> list[float]:
    """
    Vectoriza `query_text` y cada elemento de `texts`, retorna cosine similarity
    en el mismo orden. Útil para re-rankear una lista de candidatos contra una
    consulta de búsqueda.

    Retorna [0.0] * len(texts) si el modelo no está disponible o la consulta
    queda vacía tras normalización.
    """
    from sklearn.metrics.pairwise import cosine_similarity

    try:
        model = _require_tfidf()
    except ValueError:
        return [0.0] * len(texts)

    clean_query = _clean_text(query_text)
    if not clean_query:
        return [0.0] * len(texts)

    cleaned = [_clean_text(t or "") for t in texts]
    vectorizer = model["vectorizer"]
    query_vec = vectorizer.transform([clean_query])
    # transform handles empty strings gracefully — resulting row is all zeros.
    doc_vecs = vectorizer.transform(cleaned)
    sims = cosine_similarity(query_vec, doc_vecs).flatten()
    return [float(s) for s in sims]


def get_clusters(limit: int = 100) -> list[dict]:
    """
    Retorna la taxonomía de clusters de productos generada por word_clustering.

    Retorna [] si cluster_taxonomy.parquet no existe (requiere run_all).
    """
    import polars as pl

    path = _analytics_path() / "cluster_taxonomy.parquet"
    if not path.exists():
        return []

    df = pl.read_parquet(path).head(limit)
    return df.to_dicts()


def is_available() -> bool:
    """True si los tres artefactos del modelo TF-IDF existen en disco."""
    from app.config import settings

    if not settings.feature_tfidf:
        return False
    base = _analytics_path()
    return all(
        (base / name).exists()
        for name in (
            "tfidf_model.joblib",
            "tfidf_provider_vectors.npz",
            "tfidf_provider_index.parquet",
        )
    )
