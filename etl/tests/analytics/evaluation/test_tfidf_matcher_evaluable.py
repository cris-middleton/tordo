from datetime import date

import polars as pl
import pytest
from analytics.evaluation.base import SplitWindow
from analytics.evaluation.evaluators.tfidf_matcher import TfidfMatcherEvaluable


def test_class_attributes():
    e = TfidfMatcherEvaluable()
    assert e.name == "tfidf_matcher"
    assert e.default_variant.name == "baseline"
    assert e.default_variant.params["ngram_range"] == (1, 2)
    assert e.primary_metric == "ndcg_at_10"
    assert "hit_at_10_winner" in e.secondary_metrics
    assert "holdout" in e.supported_splits


def test_ground_truth_combines_winners_and_losers(
    synthetic_test_window_ocs, synthetic_lic_parquets
):
    e = TfidfMatcherEvaluable()
    window = SplitWindow(
        train_start=date(2018, 1, 1),
        train_end=date(2026, 2, 28),
        test_start=date(2026, 3, 1),
        test_end=date(2026, 4, 30),
    )
    truth = e.ground_truth(window)
    # Expected rows:
    #   L-100: P2 (winner, rel=2), P1 (loser, rel=1)
    #   L-101: P3 (winner, rel=2), no losers present (only 1 proveedor in LIC)
    #   L-200: P1 (winner, rel=2), P2 (loser, rel=1), P3 (loser, rel=1)
    assert len(truth) == 6
    winners = truth.filter(pl.col("relevance") == 2)
    losers = truth.filter(pl.col("relevance") == 1)
    assert set(winners["query_id"].to_list()) == {"L-100", "L-101", "L-200"}
    assert set(zip(losers["query_id"].to_list(), losers["item_id"].to_list(), strict=False)) == {
        ("L-100", "P1"),
        ("L-200", "P2"),
        ("L-200", "P3"),
    }


def test_predict_returns_topk_schema(synthetic_test_window_ocs, synthetic_lic_parquets):
    e = TfidfMatcherEvaluable()
    window = SplitWindow(
        train_start=date(2018, 1, 1),
        train_end=date(2024, 3, 31),
        test_start=date(2026, 3, 1),
        test_end=date(2026, 4, 30),
    )
    from analytics import tfidf_matcher as model

    corpus = model.build_provider_corpus(max_date=window.train_end)
    if corpus.is_empty():
        pytest.skip("synthetic corpus too sparse for realistic predict test")

    artifact = e.train(window, e.default_variant)
    preds = e.predict(artifact, window, top_k=5)
    assert set(preds.columns) >= {"query_id", "item_id", "rank", "score"}


def test_compute_metrics_returns_all_keys(synthetic_test_window_ocs, synthetic_lic_parquets):
    e = TfidfMatcherEvaluable()
    preds = pl.DataFrame(
        {
            "query_id": ["L-100"] * 3,
            "item_id": ["P2", "P1", "P3"],
            "rank": [1, 2, 3],
            "score": [0.9, 0.7, 0.3],
        }
    )
    truth = pl.DataFrame(
        {
            "query_id": ["L-100", "L-100"],
            "item_id": ["P2", "P1"],
            "relevance": [2, 1],
        }
    )
    out = e.compute_metrics(preds, truth)
    expected_keys = {
        "ndcg_at_10",
        "ndcg_at_20",
        "hit_at_5_winner",
        "hit_at_10_winner",
        "hit_at_20_winner",
        "hit_at_10_participant",
        "mrr",
        "coverage_at_10",
    }
    assert set(out.keys()) == expected_keys
    assert out["hit_at_5_winner"] == 1.0
