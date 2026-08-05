from datetime import date

import polars as pl
import pytest
from analytics.evaluation import registry
from analytics.evaluation.base import Evaluable, VariantConfig
from analytics.evaluation.runner import run_evaluation


class _StubModel(Evaluable):
    name = "_stub_runner"
    default_variant = VariantConfig(name="baseline", params={"alpha": 0.5})
    supported_splits = ["holdout", "walk_forward"]
    primary_metric = "score"
    secondary_metrics = ["aux"]

    def train(self, window, variant):
        return {"alpha": variant.params["alpha"], "trained_until": window.train_end}

    def predict(self, artifact, window):
        return pl.DataFrame(
            {
                "query_id": ["q1"],
                "item_id": ["A"],
                "rank": [1],
                "score": [0.9],
            }
        )

    def ground_truth(self, window):
        return pl.DataFrame({"query_id": ["q1"], "item_id": ["A"], "relevance": [2]})

    def compute_metrics(self, preds, truth):
        return {"score": 0.42, "aux": 0.1}


def setup_module(_m):
    registry.register(_StubModel)


def test_runner_holdout_returns_one_result():
    today = date(2026, 4, 14)
    results = run_evaluation(
        model_name="_stub_runner",
        variant=_StubModel.default_variant,
        split_strategy="holdout",
        today=today,
        skip_leakage_check=True,
    )
    assert len(results) == 1
    r = results[0]
    assert r.model_name == "_stub_runner"
    assert r.metrics["score"] == 0.42
    assert r.split_id.startswith("holdout_")


def test_runner_walk_forward_returns_four_results():
    today = date(2026, 4, 14)
    results = run_evaluation(
        model_name="_stub_runner",
        variant=_StubModel.default_variant,
        split_strategy="walk_forward",
        today=today,
        skip_leakage_check=True,
    )
    assert len(results) == 4
    for i, r in enumerate(results):
        assert r.split_id == f"fold_{i + 1}_of_4"


def test_runner_unknown_split_strategy():
    with pytest.raises(ValueError, match="unsupported"):
        run_evaluation(
            model_name="_stub_runner",
            variant=_StubModel.default_variant,
            split_strategy="bogus",
            today=date(2026, 4, 14),
            skip_leakage_check=True,
        )
