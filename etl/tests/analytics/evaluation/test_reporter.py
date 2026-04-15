import json
from datetime import date, datetime
from pathlib import Path

import pytest

from analytics.evaluation.base import EvaluationResult, SplitWindow, VariantConfig
from analytics.evaluation import reporter


def _fake_result() -> EvaluationResult:
    return EvaluationResult(
        model_name="tfidf_matcher",
        variant=VariantConfig(name="baseline", params={"ngram_range": (1, 2), "min_df": 5}),
        split_id="holdout_2025-04_2026-04",
        metrics={
            "ndcg_at_10": 0.412,
            "hit_at_10_winner": 0.371,
            "mrr": 0.194,
        },
        metadata={
            "train_window": {"start": "2018-01-01", "end": "2025-04-13"},
            "test_window": {"start": "2025-04-14", "end": "2026-04-14"},
            "n_train_events": 100,
            "n_test_events": 50,
        },
    )


def test_write_result_json_produces_parseable_json(tmp_path):
    path = reporter.write_result_json(
        [_fake_result()], base_dir=tmp_path, split_strategy="holdout"
    )
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["model_name"] == "tfidf_matcher"
    assert data["variant"]["name"] == "baseline"
    assert data["splits"][0]["metrics"]["ndcg_at_10"] == 0.412


def test_write_result_json_serializes_tuples_as_arrays(tmp_path):
    path = reporter.write_result_json(
        [_fake_result()], base_dir=tmp_path, split_strategy="holdout"
    )
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["variant"]["params"]["ngram_range"] == [1, 2]


def test_write_result_markdown_contains_metric_values(tmp_path):
    path = reporter.write_result_markdown(
        [_fake_result()], base_dir=tmp_path, split_strategy="holdout"
    )
    text = path.read_text(encoding="utf-8")
    assert "tfidf_matcher" in text
    assert "0.412" in text
    assert "ngram_range" in text


def test_write_comparison_markdown_highlights_winner(tmp_path):
    baseline = _fake_result()
    variant = EvaluationResult(
        model_name="tfidf_matcher",
        variant=VariantConfig(name="ngram13", params={"ngram_range": (1, 3)}),
        split_id=baseline.split_id,
        metrics={"ndcg_at_10": 0.438, "hit_at_10_winner": 0.384, "mrr": 0.201},
        metadata=baseline.metadata,
    )
    path = reporter.write_comparison_markdown(
        [baseline], [variant],
        primary_metric="ndcg_at_10",
        base_dir=tmp_path,
    )
    text = path.read_text(encoding="utf-8")
    assert "**0.4380**" in text  # bolded winner
    assert "+6.3" in text  # percent improvement
