from datetime import date

import pytest

from analytics.evaluation.base import (
    Evaluable,
    EvaluationResult,
    SplitWindow,
    VariantConfig,
)


def test_split_window_roundtrip():
    w = SplitWindow(
        train_start=date(2018, 1, 1),
        train_end=date(2025, 1, 1),
        test_start=date(2025, 1, 2),
        test_end=date(2026, 1, 1),
    )
    assert w.train_end < w.test_start


def test_variant_config_holds_arbitrary_params():
    v = VariantConfig(name="baseline", params={"ngram_range": [1, 2], "min_df": 5})
    assert v.params["min_df"] == 5


def test_evaluation_result_has_required_fields():
    r = EvaluationResult(
        model_name="x",
        variant=VariantConfig(name="v", params={}),
        split_id="holdout_2025-01_2026-01",
        metrics={"ndcg_at_10": 0.5},
        metadata={},
    )
    assert r.metrics["ndcg_at_10"] == 0.5


def test_evaluable_cannot_be_instantiated_directly():
    with pytest.raises(TypeError):
        Evaluable()


def test_evaluable_subclass_with_all_methods_works():
    class Dummy(Evaluable):
        name = "dummy"
        default_variant = VariantConfig(name="baseline", params={})
        supported_splits = ["holdout"]
        primary_metric = "score"
        secondary_metrics = []

        def train(self, window, variant): return {}
        def predict(self, artifact, window): return None
        def ground_truth(self, window): return None
        def compute_metrics(self, predictions, truth): return {"score": 1.0}

    d = Dummy()
    assert d.name == "dummy"
