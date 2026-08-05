import pytest
from analytics.evaluation import registry
from analytics.evaluation.base import Evaluable, VariantConfig


class _FakeEvaluable(Evaluable):
    name = "_fake"
    default_variant = VariantConfig(name="baseline", params={})
    supported_splits = ["holdout"]
    primary_metric = "x"
    secondary_metrics = []

    def train(self, window, variant):
        return {}

    def predict(self, artifact, window):
        return None

    def ground_truth(self, window):
        return None

    def compute_metrics(self, predictions, truth):
        return {"x": 0.5}


def test_register_and_retrieve():
    registry.register(_FakeEvaluable)
    assert registry.get("_fake") is _FakeEvaluable


def test_unknown_model_raises():
    with pytest.raises(KeyError, match="not registered"):
        registry.get("does-not-exist")


def test_list_registered_names():
    registry.register(_FakeEvaluable)
    names = registry.list_models()
    assert "_fake" in names
