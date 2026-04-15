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


def mrr(preds: pl.DataFrame, truth: pl.DataFrame, k: int = 100) -> float:
    """Mean Reciprocal Rank: average of 1/rank of first relevant item (rel>=1) in top-k.

    Query contributes 0 if no relevant item appears in its top-k.
    """
    if preds.is_empty():
        return 0.0

    joined = _join_preds_with_relevance(preds, truth, k)
    relevants = (
        joined.filter(pl.col("relevance") >= 1)
        .sort(["query_id", "rank"])
        .group_by("query_id", maintain_order=True)
        .agg(pl.col("rank").first().alias("first_rel_rank"))
    )
    all_queries = set(preds["query_id"].unique().to_list()) | set(truth["query_id"].unique().to_list())
    if not all_queries:
        return 0.0
    rr_sum = float((1.0 / relevants["first_rel_rank"]).sum())
    return rr_sum / len(all_queries)


def coverage_at_k(
    preds: pl.DataFrame,
    k: int,
    catalog_size: int,
    truth: pl.DataFrame | None = None,  # unused; kept for signature compat
) -> float:
    """Catalog coverage: distinct items appearing in any top-k list / catalog_size.

    Note: `truth` argument accepted for uniform call signature but not used.
    """
    if preds.is_empty() or catalog_size <= 0:
        return 0.0
    distinct_items = preds.filter(pl.col("rank") <= k)["item_id"].n_unique()
    return distinct_items / catalog_size


# ─── G2 stubs ────────────────────────────────────────────────────────────────


def spearman(score, proxy) -> float:
    raise NotImplementedError(
        "spearman is a stub — implemented in spec G2 (Weighted scores v2)."
    )


def reliability_diagram(score, binary_outcome, n_bins: int = 10) -> dict:
    raise NotImplementedError(
        "reliability_diagram is a stub — implemented in spec G2 (Weighted scores v2)."
    )


def brier_score(prob, binary_outcome) -> float:
    raise NotImplementedError(
        "brier_score is a stub — implemented in spec G2 (Weighted scores v2)."
    )


def calibration_error(score_bins, observed_rates) -> float:
    raise NotImplementedError(
        "calibration_error is a stub — implemented in spec G2 (Weighted scores v2)."
    )


# ─── G3 stubs ────────────────────────────────────────────────────────────────


def mae(pred, actual) -> float:
    raise NotImplementedError(
        "mae is a stub — implemented in spec G3 (Predictive analytics v2)."
    )


def mape(pred, actual, epsilon: float = 1.0) -> float:
    raise NotImplementedError(
        "mape is a stub — implemented in spec G3 (Predictive analytics v2)."
    )


def interval_coverage(low, high, actual) -> float:
    raise NotImplementedError(
        "interval_coverage is a stub — implemented in spec G3 (Predictive analytics v2)."
    )
