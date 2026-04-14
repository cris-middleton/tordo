"""Tests for evaluation metrics.

NDCG math reference (for q1 with preds [A, B, C], rel={B:2, A:1, C:0}):
  gain at each rank = 2^rel - 1
  discount at each rank = 1 / log2(rank + 1)
  DCG@3 = (2^1-1)/log2(2) + (2^2-1)/log2(3) + 0
        = 1/1 + 3/1.585 + 0 = 1 + 1.893 = 2.893
  IDCG@3 (ideal order B, A, C) = 3/log2(2) + 1/log2(3) + 0
                               = 3 + 0.631 = 3.631
  NDCG@3(q1) = 2.893 / 3.631 = 0.7967

For q2 with preds [X, Y, Z], rel={Y:2}:
  DCG@3 = 0 + 3/log2(3) + 0 = 1.893
  IDCG@3 = 3/log2(2) = 3
  NDCG@3(q2) = 0.631

Average NDCG@3 = (0.7967 + 0.631) / 2 = 0.7138
"""
import math

import polars as pl
import pytest

from analytics.evaluation import metrics


def test_ndcg_at_3_graded_relevance(preds_two_queries, truth_graded):
    value = metrics.ndcg_at_k(preds_two_queries, truth_graded, k=3)
    assert value == pytest.approx(0.7138, abs=1e-3)


def test_ndcg_at_1_perfect(preds_two_queries):
    truth = pl.DataFrame({
        "query_id":  ["q1", "q2"],
        "item_id":   ["A",  "X"],  # predicted #1 for both
        "relevance": [2,    2],
    })
    value = metrics.ndcg_at_k(preds_two_queries, truth, k=1)
    assert value == pytest.approx(1.0)


def test_ndcg_with_no_relevant_items_in_topk():
    preds = pl.DataFrame({
        "query_id": ["q1"], "item_id": ["Z"], "rank": [1], "score": [1.0],
    })
    truth = pl.DataFrame({"query_id": ["q1"], "item_id": ["A"], "relevance": [2]})
    assert metrics.ndcg_at_k(preds, truth, k=3) == 0.0


def test_ndcg_empty_predictions(empty_preds, truth_graded):
    # No queries to score → NaN or 0. We choose 0 (document in docstring).
    assert metrics.ndcg_at_k(empty_preds, truth_graded, k=10) == 0.0


def test_hit_at_2_winner_only(preds_two_queries, truth_graded):
    # q1: B (winner) is at rank 2 → hit
    # q2: Y (winner) is at rank 2 → hit
    # Average = 1.0
    value = metrics.hit_at_k(preds_two_queries, truth_graded, k=2, relevance_min=2)
    assert value == pytest.approx(1.0)


def test_hit_at_1_winner_only(preds_two_queries, truth_graded):
    # q1: A at rank 1, winner is B → miss
    # q2: X at rank 1, winner is Y → miss
    # Average = 0.0
    value = metrics.hit_at_k(preds_two_queries, truth_graded, k=1, relevance_min=2)
    assert value == pytest.approx(0.0)


def test_hit_at_1_participant(preds_two_queries, truth_graded):
    # q1: A at rank 1, A is a loser (rel=1) → hit (rel >= 1)
    # q2: X at rank 1, X has rel=0 → miss
    # Average = 0.5
    value = metrics.hit_at_k(preds_two_queries, truth_graded, k=1, relevance_min=1)
    assert value == pytest.approx(0.5)
