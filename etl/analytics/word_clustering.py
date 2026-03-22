"""
Agrupación de Tipos de Compra por Similitud Textual

Agrupa productos/servicios similares usando TF-IDF + K-Means clustering.
Útil para:
1. Descubrir categorías naturales de compra (más allá de los rubros oficiales)
2. Detectar nombres inconsistentes para el mismo producto
3. Sugerir rubros/categorías a usuarios durante onboarding
4. Enriquecer la taxonomía de TORDO vs la taxonomía oficial de ChileCompra

Output:
  - product_clusters.parquet: productos agrupados en clusters con labels
  - cluster_taxonomy.parquet: taxonomía de clusters (top keywords, tamaño, rubro dominante)
"""

import logging
import re
from collections import Counter

import numpy as np
import polars as pl

from .config import OUTPUT_DIR
from .data_loader import iter_oc_parquets

logger = logging.getLogger(__name__)


def _clean(text: str) -> str:
    if not text or text == "null":
        return ""
    text = text.lower()
    text = re.sub(r'[^\w\sáéíóúñü]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def build_product_vocabulary() -> pl.DataFrame:
    """
    Construye vocabulario de productos/servicios con frecuencias.
    Usa operaciones vectorizadas de Polars (no iter_rows).
    """
    logger.info("Construyendo vocabulario de productos...")

    cols_needed = ["NombreroductoGenerico", "RubroN2"]

    vocab_frames = []

    for periodo, df in iter_oc_parquets(columns=cols_needed):
        if "NombreroductoGenerico" not in df.columns:
            continue

        batch = (
            df
            .filter(
                pl.col("NombreroductoGenerico").is_not_null() &
                (pl.col("NombreroductoGenerico") != "null") &
                (pl.col("NombreroductoGenerico").str.len_chars() > 5)
            )
            .with_columns([
                pl.col("NombreroductoGenerico").str.to_lowercase()
                .str.replace_all(r'[^\w\sáéíóúñü]', ' ')
                .str.replace_all(r'\s+', ' ')
                .str.strip_chars()
                .alias("producto"),
            ])
            .filter(pl.col("producto").str.len_chars() > 5)
            .group_by(["producto", "RubroN2"])
            .agg(pl.len().alias("freq"))
        )
        vocab_frames.append(batch)

    if not vocab_frames:
        return pl.DataFrame()

    combined = pl.concat(vocab_frames, how="diagonal_relaxed")

    # Agregar frecuencias y encontrar rubro dominante
    product_freq = (
        combined
        .group_by("producto")
        .agg(pl.col("freq").sum().alias("frecuencia"))
        .filter(pl.col("frecuencia") >= 10)
    )

    product_rubro = (
        combined
        .group_by(["producto", "RubroN2"])
        .agg(pl.col("freq").sum().alias("rubro_freq"))
        .sort(["producto", "rubro_freq"], descending=[False, True])
        .group_by("producto")
        .first()
        .select(["producto", pl.col("RubroN2").alias("rubro_dominante")])
    )

    vocab = (
        product_freq
        .join(product_rubro, on="producto", how="left")
        .sort("frecuencia", descending=True)
    )

    logger.info(f"Vocabulario: {len(vocab):,} productos únicos (freq >= 10)")
    return vocab


def cluster_products(vocab: pl.DataFrame, n_clusters: int = 100) -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Agrupa productos usando TF-IDF + K-Means.

    n_clusters adaptado al tamaño del vocabulario.
    """
    from sklearn.cluster import MiniBatchKMeans
    from sklearn.feature_extraction.text import TfidfVectorizer

    logger.info(f"Clustering {len(vocab):,} productos en ~{n_clusters} clusters...")

    texts = vocab["producto"].to_list()
    freqs = vocab["frecuencia"].to_numpy()

    # TF-IDF sobre nombres de productos
    vectorizer = TfidfVectorizer(
        max_features=10000,
        ngram_range=(1, 3),
        min_df=3,
        max_df=0.5,
        sublinear_tf=True,
        strip_accents="unicode",
    )
    tfidf = vectorizer.fit_transform(texts)

    # Ajustar n_clusters al tamaño del dataset
    actual_clusters = min(n_clusters, len(texts) // 5)
    actual_clusters = max(actual_clusters, 10)

    # MiniBatchKMeans es más eficiente para datasets grandes
    kmeans = MiniBatchKMeans(
        n_clusters=actual_clusters,
        random_state=42,
        batch_size=1024,
        n_init=3,
    )
    labels = kmeans.fit_predict(tfidf)

    # Agregar labels al vocabulario
    clustered = vocab.with_columns([
        pl.Series("cluster_id", labels),
    ])

    # Construir taxonomía de clusters
    feature_names = vectorizer.get_feature_names_out()
    taxonomy_records = []

    for cid in range(actual_clusters):
        mask = labels == cid
        cluster_size = int(mask.sum())
        if cluster_size == 0:
            continue

        # Top keywords del centroide
        centroid = kmeans.cluster_centers_[cid]
        top_indices = centroid.argsort()[-5:][::-1]
        keywords = [feature_names[i] for i in top_indices if centroid[i] > 0]

        # Rubro dominante en este cluster
        cluster_products = clustered.filter(pl.col("cluster_id") == cid)
        rubros = cluster_products["rubro_dominante"].drop_nulls().to_list()
        rubros = [r for r in rubros if r and r != "null"]
        top_rubro = Counter(rubros).most_common(1)[0][0] if rubros else ""

        # Frecuencia total
        total_freq = int(cluster_products["frecuencia"].sum())

        # Label descriptivo (top 3 keywords)
        label = " | ".join(keywords[:3]) if keywords else f"cluster_{cid}"

        taxonomy_records.append({
            "cluster_id": cid,
            "label": label,
            "keywords": ", ".join(keywords),
            "n_productos": cluster_size,
            "frecuencia_total": total_freq,
            "rubro_dominante": top_rubro,
        })

    taxonomy = pl.DataFrame(taxonomy_records).sort("frecuencia_total", descending=True)

    logger.info(f"Clusters generados: {actual_clusters}")
    logger.info(f"Top 10 clusters por frecuencia:")
    for row in taxonomy.head(10).iter_rows(named=True):
        logger.info(f"  [{row['cluster_id']}] {row['label']} — {row['n_productos']} productos, {row['frecuencia_total']:,} OC")

    return clustered, taxonomy


def run_word_clustering() -> dict[str, pl.DataFrame]:
    """Ejecuta pipeline de clustering de productos."""
    logger.info("=" * 60)
    logger.info("CLUSTERING DE TIPOS DE COMPRA")
    logger.info("=" * 60)

    vocab = build_product_vocabulary()
    if vocab.is_empty():
        return {}

    vocab_path = OUTPUT_DIR / "product_vocabulary.parquet"
    vocab.write_parquet(vocab_path, compression="snappy")
    logger.info(f"Guardado: {vocab_path.name}")

    clustered, taxonomy = cluster_products(vocab)

    prod_path = OUTPUT_DIR / "product_clusters.parquet"
    clustered.write_parquet(prod_path, compression="snappy")
    logger.info(f"Guardado: {prod_path.name}")

    tax_path = OUTPUT_DIR / "cluster_taxonomy.parquet"
    taxonomy.write_parquet(tax_path, compression="snappy")
    logger.info(f"Guardado: {tax_path.name}")

    return {"clustered": clustered, "taxonomy": taxonomy}
