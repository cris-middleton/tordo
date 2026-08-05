"""Core protocol + dataclasses for offline model evaluation.

See docs/superpowers/specs/2026-04-14-scoring-evaluation-framework-design.md §4.2.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Any

EVAL_MIN_YEAR = 2018
EVAL_TEST_MONTHS = 12


@dataclass(frozen=True)
class SplitWindow:
    train_start: date
    train_end: date
    test_start: date
    test_end: date


@dataclass
class VariantConfig:
    name: str
    params: dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationResult:
    model_name: str
    variant: VariantConfig
    split_id: str
    metrics: dict[str, float]
    metadata: dict[str, Any] = field(default_factory=dict)


class Evaluable(ABC):
    """Protocol for any evaluable analytics model."""

    name: str
    default_variant: VariantConfig
    supported_splits: list[str]
    primary_metric: str
    secondary_metrics: list[str]

    @abstractmethod
    def train(self, window: SplitWindow, variant: VariantConfig) -> Any:
        """Train on data with FechaCreacion <= window.train_end. Return opaque artifact."""

    @abstractmethod
    def predict(self, artifact: Any, window: SplitWindow):
        """Apply artifact to events in [window.test_start, window.test_end].
        Returns a Polars DataFrame with model-type-specific columns (see spec §4.2).
        """

    @abstractmethod
    def ground_truth(self, window: SplitWindow):
        """Build observed ground truth in the test window. Returns a Polars DataFrame."""

    @abstractmethod
    def compute_metrics(self, predictions, truth) -> dict[str, float]:
        """Compute metrics from predictions + ground truth."""
