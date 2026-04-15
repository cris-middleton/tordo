"""
Motor de Matching Semántico TF-IDF

Construye perfiles de proveedores basados en los productos/servicios que han
vendido históricamente, y permite matchear contra nuevas oportunidades.

Pipeline:
1. Construir corpus: extraer textos de (Nombre + NombreroductoGenerico + Categoria)
   de OC históricas, agrupados por proveedor
2. Entrenar TF-IDF Vectorizer sobre el corpus completo
3. Generar vector por proveedor (promedio de sus OC)
4. Para una nueva licitación, calcular cosine similarity vs todos los proveedores
5. Retornar top-N proveedores más afines

Output:
  - tfidf_model.joblib: modelo TF-IDF serializado
  - tfidf_provider_vectors.npz: vectores por proveedor (sparse matrix)
  - tfidf_provider_index.parquet: mapeo CodigoProveedor → row index
  - tfidf_vocabulary_stats.parquet: estadísticas del vocabulario
"""

import logging
import re
from datetime import date
from pathlib import Path

import numpy as np
import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_oc_parquets

logger = logging.getLogger(__name__)


def _clean_text(text: str) -> str:
    """Limpia y normaliza texto para TF-IDF."""
    if not text or text == "null" or text == "None":
        return ""
    text = text.lower()
    text = re.sub(r'[^\w\sáéíóúñü]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # Remover tokens muy cortos
    tokens = [t for t in text.split() if len(t) > 2]
    return " ".join(tokens)


def build_provider_corpus(max_date: "date | None" = None) -> pl.DataFrame:
    """
    Construye corpus de texto por proveedor, concatenando los nombres
    de productos/servicios de todas sus OC.

    Usa operaciones vectorizadas de Polars (no iter_rows).

    `max_date`: si está seteado, solo usa OCs con FechaCreacion <= max_date
    (usado por el harness de evaluación para evitar data leakage).

    Retorna DataFrame con columnas:
    - CodigoProveedor, NombreProveedor
    - corpus_text: texto concatenado de todos sus productos
    - n_oc: número de OC del proveedor
    """
    logger.info("Construyendo corpus de texto por proveedor...")

    cols_needed = [
        "CodigoProveedor", "NombreProveedor",
        "Nombre", "NombreroductoGenerico", "Categoria",
        "FechaCreacion",  # needed for max_date filter in iter_oc_parquets
    ]

    # Paso 1: recolectar nombres de producto ÚNICOS por proveedor (no repetir)
    # Esto reduce el volumen de texto de ~100M a ~2-5M únicos
    prov_products: dict[str, dict] = {}

    for periodo, df in iter_oc_parquets(columns=cols_needed, min_year=2018, max_date=max_date):
        if "CodigoProveedor" not in df.columns:
            continue

        text_col = "NombreroductoGenerico" if "NombreroductoGenerico" in df.columns else None
        if text_col is None:
            continue

        # Extraer pares únicos (proveedor, producto) por archivo
        pairs = (
            df
            .filter(
                pl.col("CodigoProveedor").is_not_null() &
                (pl.col("CodigoProveedor") != "null") &
                pl.col(text_col).is_not_null() &
                (pl.col(text_col) != "null")
            )
            .select(["CodigoProveedor", "NombreProveedor", text_col])
            .unique(subset=["CodigoProveedor", text_col])
        )

        for row in pairs.iter_rows():
            prov_id, prov_name, product = row[0], row[1], row[2]
            if prov_id not in prov_products:
                prov_products[prov_id] = {"nombre": prov_name or "", "products": set(), "n_oc": 0}
            prov_products[prov_id]["products"].add(product)
            prov_products[prov_id]["n_oc"] += 1

    if not prov_products:
        return pl.DataFrame()

    logger.info(f"  {len(prov_products):,} proveedores con datos de producto")

    # Paso 2: construir corpus limpio por proveedor
    records = []
    for prov_id, data in prov_products.items():
        if len(data["products"]) < 3:
            continue
        corpus = _clean_text(" ".join(data["products"]))
        if len(corpus) > 20:
            records.append({
                "CodigoProveedor": prov_id,
                "NombreProveedor": data["nombre"],
                "corpus_text": corpus[:10000],  # Truncar
                "n_oc": data["n_oc"],
            })

    corpus_df = pl.DataFrame(records)
    del prov_products  # Liberar memoria
    logger.info(f"Corpus construido: {len(corpus_df):,} proveedores con perfil textual")
    return corpus_df


def train_tfidf_model(
    corpus_df: pl.DataFrame,
    output_dir: "Path | None" = None,
    *,
    max_features: int = 20000,
    ngram_range: tuple = (1, 2),
    min_df: int = 5,
    max_df: float = 0.8,
    sublinear_tf: bool = True,
    strip_accents: str = "unicode",
    token_pattern: str = r"(?u)\b\w{3,}\b",
) -> dict:
    """
    Entrena TF-IDF Vectorizer y genera vectores por proveedor.

    Hyperparameters passed as keyword args with defaults equal to the
    historical production values.

    `output_dir`: directorio donde persistir artefactos. Default = OUTPUT_DIR (producción).
    Llamadores del harness de eval pasan un tempdir para no contaminar.
    """
    from scipy import sparse
    from sklearn.feature_extraction.text import TfidfVectorizer

    if output_dir is None:
        output_dir = OUTPUT_DIR
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Entrenando modelo TF-IDF...")

    texts = corpus_df["corpus_text"].to_list()
    provider_ids = corpus_df["CodigoProveedor"].to_list()

    vectorizer = TfidfVectorizer(
        max_features=max_features,
        ngram_range=tuple(ngram_range),
        min_df=min_df,
        max_df=max_df,
        sublinear_tf=sublinear_tf,
        strip_accents=strip_accents,
        token_pattern=token_pattern,
    )

    tfidf_matrix = vectorizer.fit_transform(texts)

    logger.info(f"  Vocabulario: {len(vectorizer.vocabulary_):,} términos")
    logger.info(f"  Matriz: {tfidf_matrix.shape[0]:,} proveedores × {tfidf_matrix.shape[1]:,} features")
    logger.info(f"  Sparsity: {1 - tfidf_matrix.nnz / (tfidf_matrix.shape[0] * tfidf_matrix.shape[1]):.4f}")

    # Guardar modelo
    import joblib
    model_path = output_dir / "tfidf_model.joblib"
    joblib.dump(vectorizer, model_path)
    logger.info(f"Modelo guardado: {model_path.name}")

    # Guardar vectores sparse
    vectors_path = output_dir / "tfidf_provider_vectors.npz"
    sparse.save_npz(vectors_path, tfidf_matrix)
    logger.info(f"Vectores guardados: {vectors_path.name}")

    # Guardar índice proveedor → fila
    index_df = pl.DataFrame({
        "CodigoProveedor": provider_ids,
        "NombreProveedor": corpus_df["NombreProveedor"].to_list(),
        "n_oc": corpus_df["n_oc"].to_list(),
        "matrix_row": list(range(len(provider_ids))),
    })
    index_path = output_dir / "tfidf_provider_index.parquet"
    index_df.write_parquet(index_path, compression="snappy")

    # Estadísticas de vocabulario (top términos)
    feature_names = vectorizer.get_feature_names_out()
    idf_scores = vectorizer.idf_
    vocab_stats = pl.DataFrame({
        "termino": feature_names,
        "idf": idf_scores,
        "n_docs": [int(tfidf_matrix.shape[0] / np.exp(idf - 1)) for idf in idf_scores],
    }).sort("idf")
    vocab_path = output_dir / "tfidf_vocabulary_stats.parquet"
    vocab_stats.write_parquet(vocab_path, compression="snappy")

    return {
        "vectorizer": vectorizer,
        "matrix": tfidf_matrix,
        "index": index_df,
        "vocab_stats": vocab_stats,
    }


def match_text_to_providers(
    query_text: str,
    vectorizer,
    tfidf_matrix,
    index_df: pl.DataFrame,
    top_n: int = 20,
) -> pl.DataFrame:
    """
    Dado un texto (e.g. nombre de licitación), encuentra los proveedores
    más afines por cosine similarity.

    Uso:
      from etl.analytics.tfidf_matcher import load_model, match_text_to_providers
      model = load_model()
      results = match_text_to_providers(
          "Servicio de limpieza hospitalaria",
          model["vectorizer"], model["matrix"], model["index"]
      )
    """
    from sklearn.metrics.pairwise import cosine_similarity

    clean = _clean_text(query_text)
    query_vec = vectorizer.transform([clean])
    similarities = cosine_similarity(query_vec, tfidf_matrix).flatten()

    top_indices = np.argsort(similarities)[-top_n:][::-1]
    top_scores = similarities[top_indices]

    results = []
    for idx, score in zip(top_indices, top_scores):
        if score > 0.01:  # Umbral mínimo de relevancia
            row = index_df.filter(pl.col("matrix_row") == int(idx))
            if len(row) > 0:
                results.append({
                    "CodigoProveedor": row["CodigoProveedor"][0],
                    "NombreProveedor": row["NombreProveedor"][0],
                    "n_oc": row["n_oc"][0],
                    "similarity_score": round(float(score), 4),
                })

    return pl.DataFrame(results)


def load_model() -> dict:
    """Carga modelo TF-IDF y vectores desde disco."""
    import joblib
    from scipy import sparse

    return {
        "vectorizer": joblib.load(OUTPUT_DIR / "tfidf_model.joblib"),
        "matrix": sparse.load_npz(OUTPUT_DIR / "tfidf_provider_vectors.npz"),
        "index": pl.read_parquet(OUTPUT_DIR / "tfidf_provider_index.parquet"),
    }


def run_tfidf() -> dict:
    """Ejecuta pipeline completo de TF-IDF."""
    logger.info("=" * 60)
    logger.info("TF-IDF SEMANTIC MATCHING")
    logger.info("=" * 60)

    corpus = build_provider_corpus()
    if corpus.is_empty():
        return {}

    corpus_path = OUTPUT_DIR / "tfidf_corpus.parquet"
    corpus.write_parquet(corpus_path, compression="snappy")
    logger.info(f"Guardado: {corpus_path.name} ({corpus_path.stat().st_size / 1024 / 1024:.1f} MB)")

    model = train_tfidf_model(corpus)

    # Test de sanidad: buscar algo genérico
    logger.info("Test de matching:")
    for query in ["servicio limpieza", "computadores notebooks", "medicamentos insumos médicos"]:
        results = match_text_to_providers(
            query, model["vectorizer"], model["matrix"], model["index"], top_n=3
        )
        if len(results) > 0:
            top = results[0]
            logger.info(f"  '{query}' → {top['NombreProveedor'][0]} (score={top['similarity_score'][0]})")

    return model
