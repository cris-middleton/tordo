"""Evaluation metrics library.

Retrieval metrics (G1) are implemented here. G2 and G3 metric functions are
declared as stubs that raise NotImplementedError to fix their names/signatures
before the child specs fill them in.
"""
from __future__ import annotations

import math

import polars as pl

# ─── Retrieval metrics (G1) ──────────────────────────────────────────────────


def _join_preds_with_relevance(
    preds: pl.DataFrame, truth: pl.DataFrame, k: int
) -> pl.DataFrame:
    """Keep top-k preds per query and left-join graded relevance (0 if unmatched)."""
    if preds.is_empty():
        return preds
    top_k = preds.filter(pl.col("rank") <= k)
    joined = top_k.join(
        truth.select(["query_id", "item_id", "relevance"]),
        on=["query_id", "item_id"],
        how="left",
    ).with_columns(pl.col("relevance").fill_null(0))
    return joined


def ndcg_at_k(preds: pl.DataFrame, truth: pl.DataFrame, k: int) -> float:
    """Normalized DCG at rank k, with graded relevance.

    Gain: 2^rel - 1. Discount: 1 / log2(rank + 1).
    Returns 0.0 when preds is empty or no query has any relevant item.
    """
    if preds.is_empty():
        return 0.0

    joined = _join_preds_with_relevance(preds, truth, k)
    # DCG per query
    dcg = (
        joined
        .with_columns(
            ((2 ** pl.col("relevance") - 1) / (pl.col("rank") + 1).log(2))
            .alias("gain")
        )
        .group_by("query_id")
        .agg(pl.col("gain").sum().alias("dcg"))
    )

    # IDCG per query: ideal ranking of all truth items for that query, top-k
    ideal = (
        truth
        .sort(["query_id", "relevance"], descending=[False, True])
        .group_by("query_id", maintain_order=True)
        .head(k)
        .with_columns(
            pl.int_range(1, pl.len() + 1).over("query_id").alias("ideal_rank")
        )
        .with_columns(
            ((2 ** pl.col("relevance") - 1) / (pl.col("ideal_rank") + 1).log(2))
            .alias("ideal_gain")
        )
        .group_by("query_id")
        .agg(pl.col("ideal_gain").sum().alias("idcg"))
    )

    per_query = dcg.join(ideal, on="query_id", how="full", coalesce=True).with_columns([
        pl.col("dcg").fill_null(0),
        pl.col("idcg").fill_null(0),
    ]).with_columns(
        pl.when(pl.col("idcg") > 0)
        .then(pl.col("dcg") / pl.col("idcg"))
        .otherwise(0.0)
        .alias("ndcg")
    )

    # Use union of queries: all queries in preds OR truth
    all_queries = set(preds["query_id"].unique().to_list()) | set(truth["query_id"].unique().to_list())
    if not all_queries:
        return 0.0
    total = per_query["ndcg"].sum()
    return float(total) / len(all_queries)


def hit_at_k(
    preds: pl.DataFrame, truth: pl.DataFrame, k: int, relevance_min: int = 1
) -> float:
    """Fraction of queries where at least one predicted top-k item has rel >= relevance_min.

    relevance_min=2 → only winners count as hit.
    relevance_min=1 → any participant (winner or loser) counts.
    """
    if preds.is_empty():
        return 0.0

    joined = _join_preds_with_relevance(preds, truth, k)
    per_query = (
        joined
        .group_by("query_id")
        .agg((pl.col("relevance") >= relevance_min).any().alias("hit"))
    )
    all_queries = set(preds["query_id"].unique().to_list()) | set(truth["query_id"].unique().to_list())
    if not all_queries:
        return 0.0
    # Queries with no predictions contribute 0
    hits = per_query.filter(pl.col("hit"))["query_id"].n_unique()
    return hits / len(all_queries)
