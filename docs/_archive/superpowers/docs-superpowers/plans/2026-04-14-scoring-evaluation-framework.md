# Scoring Evaluation Framework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline evaluation framework (`etl/analytics/evaluation/`) that lets any analytics model be evaluated against a historical holdout / walk-forward split, producing reproducible markdown + JSON reports in git. Ship with `tfidf_matcher` as the reference evaluator + first baseline run.

**Architecture:** New Python package in `etl/analytics/evaluation/`. Core abstraction is an `Evaluable` ABC with 4 methods (`train`, `predict`, `ground_truth`, `compute_metrics`). A `runner` orchestrates: splits.py generates train/test windows → the evaluable trains + predicts + produces ground truth → metrics.py computes scores → reporter.py writes `.md` + `.json`. A registry maps model names to Evaluable classes. Minimal refactor to `data_loader.py` (add `max_date` parameter) and `tfidf_matcher.py` (add `max_date` + hyperparameter kwargs) keeps current production pipeline identical.

**Tech Stack:** Python 3.11, Polars (data), scikit-learn (existing TF-IDF), PyYAML (variant configs), pytest (testing), joblib (artifact serialization — existing).

**Spec reference:** `docs/superpowers/specs/2026-04-14-scoring-evaluation-framework-design.md` (commit `0d1ff42`).

---

## File structure

### New files
- `etl/pytest.ini` — pytest config for etl tests
- `etl/conftest.py` — path setup so `from analytics.evaluation import ...` works in tests
- `etl/analytics/evaluation/__init__.py`
- `etl/analytics/evaluation/base.py` — `SplitWindow`, `VariantConfig`, `EvaluationResult`, `Evaluable` ABC
- `etl/analytics/evaluation/metrics.py` — `ndcg_at_k`, `hit_at_k`, `mrr`, `coverage_at_k` + G2/G3 stubs
- `etl/analytics/evaluation/splits.py` — `build_holdout_split`, `build_walk_forward_splits`
- `etl/analytics/evaluation/registry.py` — `REGISTRY` dict + `register` helper
- `etl/analytics/evaluation/reporter.py` — `write_result_json`, `write_result_markdown`, `write_comparison_markdown`
- `etl/analytics/evaluation/runner.py` — `run_evaluation`, `_assert_no_future_leakage`
- `etl/analytics/evaluation/cli.py` — `build_parser`, `main`
- `etl/analytics/evaluation/__main__.py` — entry for `python -m etl.analytics.evaluation`
- `etl/analytics/evaluation/evaluators/__init__.py` — imports all evaluators to trigger registration
- `etl/analytics/evaluation/evaluators/tfidf_matcher.py` — `TfidfMatcherEvaluable`
- `etl/analytics/evaluation/variants/tfidf_baseline.yaml` — reference variant config
- `etl/tests/__init__.py`
- `etl/tests/analytics/__init__.py`
- `etl/tests/analytics/evaluation/__init__.py`
- `etl/tests/analytics/evaluation/conftest.py` — small DF fixtures + synthetic parquets fixture
- `etl/tests/analytics/evaluation/test_metrics.py`
- `etl/tests/analytics/evaluation/test_splits.py`
- `etl/tests/analytics/evaluation/test_data_loader_max_date.py`
- `etl/tests/analytics/evaluation/test_tfidf_matcher_refactor.py`
- `etl/tests/analytics/evaluation/test_registry.py`
- `etl/tests/analytics/evaluation/test_reporter.py`
- `etl/tests/analytics/evaluation/test_runner.py`
- `etl/tests/analytics/evaluation/test_cli.py`
- `etl/tests/analytics/evaluation/test_harness_smoke.py`

### Modified files
- `etl/analytics/data_loader.py` — add `max_date: date | None = None` to 4 functions (`iter_oc_parquets`, `iter_lic_parquets`, `scan_oc`, `scan_lic`)
- `etl/analytics/tfidf_matcher.py` — add `max_date` to `build_provider_corpus`; add `output_dir` + `**vectorizer_kwargs` to `train_tfidf_model`

### Generated (at end of implementation, by running the CLI)
- `docs/analytics/evals/tfidf_matcher/<YYYY-MM-DD>_baseline.md`
- `etl/data/analytics/evals/tfidf_matcher/<YYYY-MM-DD>_baseline.json`

---

## Task 1: Package skeleton + test infrastructure

**Goal:** empty package tree + pytest infrastructure so subsequent tasks can TDD without friction.

**Files:**
- Create: `etl/pytest.ini`
- Create: `etl/conftest.py`
- Create: `etl/analytics/evaluation/__init__.py`
- Create: `etl/analytics/evaluation/evaluators/__init__.py`
- Create: `etl/analytics/evaluation/variants/.gitkeep`
- Create: `etl/tests/__init__.py`
- Create: `etl/tests/analytics/__init__.py`
- Create: `etl/tests/analytics/evaluation/__init__.py`

- [ ] **Step 1.1: Create empty package markers**

```bash
mkdir -p etl/analytics/evaluation/evaluators etl/analytics/evaluation/variants
mkdir -p etl/tests/analytics/evaluation
touch etl/analytics/evaluation/__init__.py
touch etl/analytics/evaluation/evaluators/__init__.py
touch etl/analytics/evaluation/variants/.gitkeep
touch etl/tests/__init__.py
touch etl/tests/analytics/__init__.py
touch etl/tests/analytics/evaluation/__init__.py
```

- [ ] **Step 1.2: Create pytest config**

File: `etl/pytest.ini`

```ini
[pytest]
testpaths = tests
pythonpath = .
addopts = -ra
```

- [ ] **Step 1.3: Create etl/conftest.py for sys.path setup**

File: `etl/conftest.py`

```python
"""Ensure `etl/` is on sys.path so tests can import `analytics.evaluation.*`."""
import sys
from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parent
if str(ETL_ROOT) not in sys.path:
    sys.path.insert(0, str(ETL_ROOT))
```

- [ ] **Step 1.4: Verify pytest discovers zero tests without error**

Run: `cd etl && python -m pytest --collect-only`
Expected: "no tests ran" (exit 5) or "0 tests collected" — no import errors.

- [ ] **Step 1.5: Commit**

```bash
git add etl/pytest.ini etl/conftest.py etl/analytics/evaluation etl/tests
git commit -m "scaffold evaluation package structure and pytest infrastructure"
```

---

## Task 2: Base dataclasses and Evaluable ABC

**Files:**
- Create: `etl/analytics/evaluation/base.py`
- Create: `etl/tests/analytics/evaluation/test_base.py`

- [ ] **Step 2.1: Write failing test for dataclass construction and ABC**

File: `etl/tests/analytics/evaluation/test_base.py`

```python
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
```

- [ ] **Step 2.2: Run test — expect ImportError**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_base.py -v`
Expected: collection error — module doesn't exist.

- [ ] **Step 2.3: Implement base.py**

File: `etl/analytics/evaluation/base.py`

```python
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
```

- [ ] **Step 2.4: Run test — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_base.py -v`
Expected: 5 passed.

- [ ] **Step 2.5: Commit**

```bash
git add etl/analytics/evaluation/base.py etl/tests/analytics/evaluation/test_base.py
git commit -m "define Evaluable ABC and core dataclasses"
```

---

## Task 3: Test fixtures for metrics

**Goal:** reusable tiny Polars DataFrames fixtures so metrics tests read clearly.

**Files:**
- Create: `etl/tests/analytics/evaluation/conftest.py`

- [ ] **Step 3.1: Write the conftest with predictable synthetic data**

File: `etl/tests/analytics/evaluation/conftest.py`

```python
"""Fixtures for evaluation tests.

Two kinds:
1. Tiny in-memory DataFrames for unit tests of metrics/splits/reporter.
2. Synthetic on-disk parquets (OC + LIC) for integration tests that exercise
   data_loader, tfidf_matcher, and the end-to-end CLI.
"""
from datetime import date, datetime

import polars as pl
import pytest


# ─── Tiny fixtures for metrics tests ──────────────────────────────────────────

@pytest.fixture
def preds_two_queries() -> pl.DataFrame:
    """
    Two queries q1 and q2. Each has top-3 predicted items with ranks 1..3.

    q1: A (rank 1, score 0.9), B (rank 2, score 0.7), C (rank 3, score 0.5)
    q2: X (rank 1, score 0.8), Y (rank 2, score 0.6), Z (rank 3, score 0.4)
    """
    return pl.DataFrame({
        "query_id": ["q1", "q1", "q1", "q2", "q2", "q2"],
        "item_id":  ["A",  "B",  "C",  "X",  "Y",  "Z"],
        "rank":     [1,    2,    3,    1,    2,    3],
        "score":    [0.9,  0.7,  0.5,  0.8,  0.6,  0.4],
    })


@pytest.fixture
def truth_graded() -> pl.DataFrame:
    """
    Ground truth with graded relevance (winner=2, loser=1).

    q1: winner=B (rel=2), loser=A (rel=1), C not in truth (rel=0 implicit)
    q2: winner=Y (rel=2), X and Z not in truth (rel=0 implicit)
    """
    return pl.DataFrame({
        "query_id":  ["q1", "q1", "q2"],
        "item_id":   ["B",  "A",  "Y"],
        "relevance": [2,    1,    2],
    })


@pytest.fixture
def truth_binary() -> pl.DataFrame:
    """Binary-relevance fallback ground truth (all rel=2 = winners only)."""
    return pl.DataFrame({
        "query_id":  ["q1", "q2"],
        "item_id":   ["B",  "Y"],
        "relevance": [2,    2],
    })


@pytest.fixture
def empty_preds() -> pl.DataFrame:
    return pl.DataFrame({
        "query_id": [],
        "item_id":  [],
        "rank":     [],
        "score":    [],
    }, schema={"query_id": pl.Utf8, "item_id": pl.Utf8, "rank": pl.Int64, "score": pl.Float64})
```

- [ ] **Step 3.2: Verify fixture imports don't crash**

Run: `cd etl && python -m pytest tests/analytics/evaluation/ --collect-only`
Expected: collection succeeds with no import errors.

- [ ] **Step 3.3: Commit**

```bash
git add etl/tests/analytics/evaluation/conftest.py
git commit -m "add synthetic DataFrame fixtures for metrics tests"
```

---

## Task 4: Metrics — NDCG@k, Hit@k

**Files:**
- Create: `etl/analytics/evaluation/metrics.py`
- Create: `etl/tests/analytics/evaluation/test_metrics.py`

- [ ] **Step 4.1: Write failing tests for ndcg_at_k and hit_at_k**

File: `etl/tests/analytics/evaluation/test_metrics.py`

```python
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
```

- [ ] **Step 4.2: Run test — expect ImportError**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_metrics.py -v`
Expected: collection error.

- [ ] **Step 4.3: Implement ndcg_at_k and hit_at_k**

File: `etl/analytics/evaluation/metrics.py`

```python
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
            pl.int_range(1, pl.count() + 1).over("query_id").alias("ideal_rank")
        )
        .with_columns(
            ((2 ** pl.col("relevance") - 1) / (pl.col("ideal_rank") + 1).log(2))
            .alias("ideal_gain")
        )
        .group_by("query_id")
        .agg(pl.col("ideal_gain").sum().alias("idcg"))
    )

    per_query = dcg.join(ideal, on="query_id", how="outer_coalesce").with_columns([
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
```

- [ ] **Step 4.4: Run test — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_metrics.py -v`
Expected: 7 passed.

- [ ] **Step 4.5: Commit**

```bash
git add etl/analytics/evaluation/metrics.py etl/tests/analytics/evaluation/test_metrics.py
git commit -m "implement ndcg_at_k and hit_at_k with graded relevance"
```

---

## Task 5: Metrics — MRR, Coverage@k, G2/G3 stubs

**Files:**
- Modify: `etl/analytics/evaluation/metrics.py`
- Modify: `etl/tests/analytics/evaluation/test_metrics.py`

- [ ] **Step 5.1: Add failing tests for mrr and coverage_at_k**

Append to `etl/tests/analytics/evaluation/test_metrics.py`:

```python
def test_mrr_winner_at_rank_2(preds_two_queries, truth_graded):
    # q1: first relevant (rel>=1) is A at rank 1 → 1/1 = 1.0
    # q2: first relevant (rel>=1) is Y at rank 2 → 1/2 = 0.5
    # Average = 0.75
    value = metrics.mrr(preds_two_queries, truth_graded, k=100)
    assert value == pytest.approx(0.75)


def test_mrr_no_relevant_in_topk():
    preds = pl.DataFrame({
        "query_id": ["q1"] * 3, "item_id": ["A", "B", "C"],
        "rank": [1, 2, 3], "score": [0.9, 0.7, 0.5],
    })
    truth = pl.DataFrame({"query_id": ["q1"], "item_id": ["Z"], "relevance": [2]})
    # No relevant in top-3 → 0
    assert metrics.mrr(preds, truth, k=3) == 0.0


def test_coverage_at_k_all_distinct(preds_two_queries):
    # 6 distinct items across both queries top-3: A,B,C,X,Y,Z
    # If catalog is exactly these 6, coverage = 1.0
    value = metrics.coverage_at_k(preds_two_queries, k=3, catalog_size=6)
    assert value == pytest.approx(1.0)


def test_coverage_at_k_half_catalog(preds_two_queries):
    # 6 items retrieved in top-3; catalog of 12
    value = metrics.coverage_at_k(preds_two_queries, k=3, catalog_size=12)
    assert value == pytest.approx(0.5)


def test_g2_stub_raises():
    with pytest.raises(NotImplementedError, match="spec G2"):
        metrics.spearman([], [])


def test_g3_stub_raises():
    with pytest.raises(NotImplementedError, match="spec G3"):
        metrics.mae([], [])
```

- [ ] **Step 5.2: Run tests — expect failures**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_metrics.py -v`
Expected: 5 failures / errors on new tests.

- [ ] **Step 5.3: Extend metrics.py with mrr, coverage, and stubs**

Append to `etl/analytics/evaluation/metrics.py`:

```python
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
```

Note: update `coverage_at_k` signature change in the test file if needed — the test calls `coverage_at_k(preds_two_queries, k=3, catalog_size=6)` which matches the new signature.

- [ ] **Step 5.4: Run tests — expect all pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_metrics.py -v`
Expected: 12 passed.

- [ ] **Step 5.5: Commit**

```bash
git add etl/analytics/evaluation/metrics.py etl/tests/analytics/evaluation/test_metrics.py
git commit -m "implement mrr, coverage_at_k, and G2/G3 metric stubs"
```

---

## Task 6: Temporal splits

**Files:**
- Create: `etl/analytics/evaluation/splits.py`
- Create: `etl/tests/analytics/evaluation/test_splits.py`

- [ ] **Step 6.1: Write failing tests**

File: `etl/tests/analytics/evaluation/test_splits.py`

```python
from datetime import date

import pytest

from analytics.evaluation.splits import (
    build_holdout_split,
    build_walk_forward_splits,
)


def test_holdout_default_is_12_months_back():
    splits = build_holdout_split(today=date(2026, 4, 14), test_months=12)
    assert len(splits) == 1
    w = splits[0]
    assert w.test_start == date(2025, 4, 14)
    assert w.test_end == date(2026, 4, 14)
    assert w.train_start == date(2018, 1, 1)
    assert w.train_end == date(2025, 4, 13)


def test_holdout_custom_test_months():
    splits = build_holdout_split(today=date(2026, 4, 14), test_months=6)
    assert splits[0].test_start == date(2025, 10, 14)


def test_walk_forward_yields_4_folds():
    splits = build_walk_forward_splits(today=date(2026, 4, 14), n_folds=4, fold_months=6)
    assert len(splits) == 4
    # Last fold: test [HOY-6m..HOY]
    assert splits[-1].test_start == date(2025, 10, 14)
    assert splits[-1].test_end == date(2026, 4, 14)
    # First fold test window ends 18m before HOY, starts 24m before
    assert splits[0].test_start == date(2024, 4, 14)
    assert splits[0].test_end == date(2024, 10, 14)


def test_walk_forward_folds_are_contiguous():
    splits = build_walk_forward_splits(today=date(2026, 4, 14), n_folds=4, fold_months=6)
    for prev, nxt in zip(splits, splits[1:]):
        assert prev.test_end == nxt.test_start


def test_walk_forward_train_grows_monotonically():
    splits = build_walk_forward_splits(today=date(2026, 4, 14), n_folds=4, fold_months=6)
    for prev, nxt in zip(splits, splits[1:]):
        assert nxt.train_end > prev.train_end
```

- [ ] **Step 6.2: Run — expect errors**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_splits.py -v`
Expected: collection error.

- [ ] **Step 6.3: Implement splits.py**

File: `etl/analytics/evaluation/splits.py`

```python
"""Temporal splits for offline evaluation.

See spec §5 for rationale.
"""
from __future__ import annotations

from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from .base import EVAL_MIN_YEAR, SplitWindow


def build_holdout_split(
    today: date,
    test_months: int = 12,
    train_start: date | None = None,
) -> list[SplitWindow]:
    """Single train/test split with test window = [today - test_months, today]."""
    ts = train_start or date(EVAL_MIN_YEAR, 1, 1)
    test_start = today - relativedelta(months=test_months)
    return [
        SplitWindow(
            train_start=ts,
            train_end=test_start - timedelta(days=1),
            test_start=test_start,
            test_end=today,
        )
    ]


def build_walk_forward_splits(
    today: date,
    n_folds: int = 4,
    fold_months: int = 6,
    train_start: date | None = None,
) -> list[SplitWindow]:
    """n_folds test windows of `fold_months` duration, ending at `today`.

    Fold i (1-indexed):
      test_end   = today - (n_folds - i) * fold_months
      test_start = test_end - fold_months
      train_end  = test_start - 1 day
    """
    ts = train_start or date(EVAL_MIN_YEAR, 1, 1)
    folds: list[SplitWindow] = []
    for i in range(n_folds):
        months_back_end = (n_folds - 1 - i) * fold_months
        test_end = today - relativedelta(months=months_back_end)
        test_start = test_end - relativedelta(months=fold_months)
        folds.append(
            SplitWindow(
                train_start=ts,
                train_end=test_start - timedelta(days=1),
                test_start=test_start,
                test_end=test_end,
            )
        )
    return folds
```

Note: uses `python-dateutil`. Confirm it's installed; if not, add to `etl/requirements.txt` or equivalent. If `dateutil` isn't a dep, replace with manual month arithmetic (see fallback below).

**Fallback without dateutil (if install is blocked):**

```python
def _minus_months(d: date, months: int) -> date:
    total = d.year * 12 + (d.month - 1) - months
    year, month0 = divmod(total, 12)
    # Clamp day to month length
    import calendar
    max_day = calendar.monthrange(year, month0 + 1)[1]
    return date(year, month0 + 1, min(d.day, max_day))
```

- [ ] **Step 6.4: Run — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_splits.py -v`
Expected: 5 passed.

- [ ] **Step 6.5: Commit**

```bash
git add etl/analytics/evaluation/splits.py etl/tests/analytics/evaluation/test_splits.py
git commit -m "add holdout and walk-forward temporal split generators"
```

---

## Task 7: Refactor data_loader.py — add max_date parameter

**Files:**
- Modify: `etl/analytics/data_loader.py`
- Create: `etl/tests/analytics/evaluation/test_data_loader_max_date.py`

- [ ] **Step 7.1: Add synthetic parquets fixture**

Append to `etl/tests/analytics/evaluation/conftest.py`:

```python
# ─── Synthetic OC/LIC parquets for integration tests ──────────────────────────

@pytest.fixture
def synthetic_oc_parquets(tmp_path, monkeypatch):
    """Write 3 tiny OC parquets to a tmp dir and point OC_PARQUET_DIR to it.

    Returns the tmp dir path.
    """
    from analytics import config as analytics_config

    oc_dir = tmp_path / "oc"
    oc_dir.mkdir()

    # 2024-1: 3 OCs with different dates
    pl.DataFrame({
        "Codigo": ["OC-001", "OC-002", "OC-003"],
        "FechaCreacion": [
            datetime(2024, 1, 5), datetime(2024, 1, 15), datetime(2024, 1, 28),
        ],
        "CodigoProveedor": ["P1", "P2", "P1"],
        "NombreProveedor": ["Prov1", "Prov2", "Prov1"],
        "NombreroductoGenerico": ["papel", "limpieza", "papel higienico"],
        "Nombre": ["resma papel A4", "detergente industrial", "papel higienico"],
        "CodigoLicitacion": ["L-001", None, "L-002"],
    }).write_parquet(oc_dir / "2024-1.parquet")

    # 2024-2
    pl.DataFrame({
        "Codigo": ["OC-004", "OC-005"],
        "FechaCreacion": [datetime(2024, 2, 10), datetime(2024, 2, 20)],
        "CodigoProveedor": ["P3", "P2"],
        "NombreProveedor": ["Prov3", "Prov2"],
        "NombreroductoGenerico": ["computadores", "limpieza"],
        "Nombre": ["notebooks oficina", "servicio aseo"],
        "CodigoLicitacion": ["L-003", "L-004"],
    }).write_parquet(oc_dir / "2024-2.parquet")

    # 2024-3
    pl.DataFrame({
        "Codigo": ["OC-006"],
        "FechaCreacion": [datetime(2024, 3, 15)],
        "CodigoProveedor": ["P1"],
        "NombreProveedor": ["Prov1"],
        "NombreroductoGenerico": ["papel"],
        "Nombre": ["resma"],
        "CodigoLicitacion": [None],
    }).write_parquet(oc_dir / "2024-3.parquet")

    monkeypatch.setattr(analytics_config, "OC_PARQUET_DIR", oc_dir)
    return oc_dir
```

- [ ] **Step 7.2: Write failing tests for max_date**

File: `etl/tests/analytics/evaluation/test_data_loader_max_date.py`

```python
from datetime import date

import polars as pl
import pytest

from analytics.data_loader import iter_oc_parquets


def test_iter_without_max_date_returns_all(synthetic_oc_parquets):
    rows = 0
    for periodo, df in iter_oc_parquets(columns=["Codigo", "FechaCreacion"], min_year=2024):
        rows += len(df)
    assert rows == 6


def test_iter_with_max_date_filters_out_future(synthetic_oc_parquets):
    cutoff = date(2024, 2, 15)
    rows_after = []
    for periodo, df in iter_oc_parquets(
        columns=["Codigo", "FechaCreacion"], min_year=2024, max_date=cutoff
    ):
        # Every row must have FechaCreacion <= cutoff
        if not df.is_empty():
            max_fc = df["FechaCreacion"].max()
            assert max_fc.date() <= cutoff
            rows_after.extend(df["Codigo"].to_list())
    # Expected: OC-001, OC-002 (jan), OC-004 (feb 10). OC-005 (feb 20) and OC-006 (mar) filtered.
    assert set(rows_after) == {"OC-001", "OC-002", "OC-004"}


def test_iter_with_max_date_can_yield_empty_frames(synthetic_oc_parquets):
    # cutoff before all data → every yielded df is empty or no yield at all
    cutoff = date(2023, 12, 31)
    total = 0
    for periodo, df in iter_oc_parquets(
        columns=["Codigo", "FechaCreacion"], min_year=2024, max_date=cutoff
    ):
        total += len(df)
    assert total == 0
```

- [ ] **Step 7.3: Run — expect failures (`max_date` param doesn't exist)**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_data_loader_max_date.py -v`
Expected: TypeError "unexpected keyword argument 'max_date'".

- [ ] **Step 7.4: Modify `iter_oc_parquets` in data_loader.py**

In file `etl/analytics/data_loader.py`, replace the `iter_oc_parquets` function (lines 105–124) with:

```python
def iter_oc_parquets(
    columns: Optional[list[str]] = None,
    min_year: int = MIN_YEAR,
    max_date: Optional["date"] = None,
):
    """
    Iterador que yield un DataFrame a la vez (para procesamiento batch
    cuando no se puede materializar todo en memoria).

    Si `max_date` está seteado, filtra in-place cada DF a FechaCreacion <= max_date.
    """
    from datetime import date as _date  # local import, lazy

    cols = columns or OC_COLS_CORE
    # Ensure FechaCreacion is loaded if we need to filter by it
    if max_date is not None and "FechaCreacion" not in cols:
        cols = list(cols) + ["FechaCreacion"]

    for p in sorted(OC_PARQUET_DIR.glob("*.parquet")):
        year, _ = _parse_periodo(p.stem)
        if year < min_year:
            continue
        try:
            schema = pl.read_parquet_schema(p)
            avail = [c for c in cols if c in schema]
            df = pl.read_parquet(p, columns=avail)
            if max_date is not None and "FechaCreacion" in df.columns:
                df = df.filter(pl.col("FechaCreacion") <= pl.lit(max_date).cast(pl.Datetime))
            yield p.stem, df
        except Exception as e:
            logger.warning(f"Skip {p.name}: {e}")
```

Make the identical change (add `max_date: Optional[date] = None` + post-read filter) to `iter_lic_parquets`, `scan_oc`, and `scan_lic`. For the lazy `scan_*` variants, append `.filter(pl.col("FechaCreacion") <= ...)` to each per-file LazyFrame.

Also add `from datetime import date` to the module-level imports.

- [ ] **Step 7.5: Run — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_data_loader_max_date.py -v`
Expected: 3 passed.

- [ ] **Step 7.6: Verify existing callers unaffected**

Run: `cd etl && python -c "from analytics.data_loader import iter_oc_parquets, scan_oc, iter_lic_parquets, scan_lic; print('ok')"`
Expected: `ok`.

- [ ] **Step 7.7: Commit**

```bash
git add etl/analytics/data_loader.py etl/tests/analytics/evaluation/test_data_loader_max_date.py etl/tests/analytics/evaluation/conftest.py
git commit -m "add max_date parameter to data_loader iterators and scanners"
```

---

## Task 8: Refactor tfidf_matcher.py — max_date + hyperparameter kwargs

**Files:**
- Modify: `etl/analytics/tfidf_matcher.py`
- Create: `etl/tests/analytics/evaluation/test_tfidf_matcher_refactor.py`

- [ ] **Step 8.1: Write failing tests**

File: `etl/tests/analytics/evaluation/test_tfidf_matcher_refactor.py`

```python
from datetime import date
from pathlib import Path

import polars as pl
import pytest

from analytics import tfidf_matcher


def test_build_provider_corpus_accepts_max_date(synthetic_oc_parquets):
    # Corpus with max_date cutting off Feb/Mar should only consider Jan OCs
    corpus = tfidf_matcher.build_provider_corpus(max_date=date(2024, 1, 31))
    # Prov1 appeared in Jan with 2 products ("papel", "papel higienico")
    # Prov2 appeared in Jan with 1 product ("limpieza")
    # Min products = 3 → both filtered OUT
    assert corpus.is_empty() or len(corpus) == 0


def test_train_tfidf_model_accepts_hyperparameter_kwargs(tmp_path):
    corpus = pl.DataFrame({
        "CodigoProveedor": ["P1", "P2", "P3"],
        "NombreProveedor": ["Prov1", "Prov2", "Prov3"],
        "corpus_text": [
            "papel limpieza oficina escritorio cuaderno",
            "computadores notebooks teclado mouse pantalla",
            "servicio limpieza aseo detergente hospitalario",
        ],
        "n_oc": [5, 3, 4],
    })
    result = tfidf_matcher.train_tfidf_model(
        corpus,
        output_dir=tmp_path,
        ngram_range=(1, 3),
        max_features=50,
        min_df=1,
        max_df=1.0,
    )
    vectorizer = result["vectorizer"]
    assert vectorizer.ngram_range == (1, 3)
    assert vectorizer.max_features == 50


def test_train_tfidf_model_defaults_preserved(tmp_path):
    """Calling without kwargs must use the historical defaults."""
    corpus = pl.DataFrame({
        "CodigoProveedor": ["P1", "P2", "P3"] * 5,
        "NombreProveedor": [f"P{i}" for i in range(15)],
        "corpus_text": ["papel limpieza escritorio"] * 15,
        "n_oc": [5] * 15,
    })
    result = tfidf_matcher.train_tfidf_model(corpus, output_dir=tmp_path)
    v = result["vectorizer"]
    assert v.ngram_range == (1, 2)
    assert v.max_features == 20000
    assert v.sublinear_tf is True
```

- [ ] **Step 8.2: Run — expect failures**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_tfidf_matcher_refactor.py -v`
Expected: TypeError or similar.

- [ ] **Step 8.3: Modify `build_provider_corpus`**

In `etl/analytics/tfidf_matcher.py`, replace the function signature and loop (lines 47–120) with:

```python
def build_provider_corpus(max_date: "date | None" = None) -> pl.DataFrame:
    """
    Construye corpus de texto por proveedor.

    `max_date`: si está seteado, solo usa OCs con FechaCreacion <= max_date
    (usado por el harness de evaluación para evitar data leakage).
    """
    logger.info("Construyendo corpus de texto por proveedor...")

    cols_needed = [
        "CodigoProveedor", "NombreProveedor",
        "Nombre", "NombreroductoGenerico", "Categoria",
        "FechaCreacion",  # needed for max_date filter in iter_oc_parquets
    ]

    prov_products: dict[str, dict] = {}

    for periodo, df in iter_oc_parquets(
        columns=cols_needed, min_year=2018, max_date=max_date
    ):
        if "CodigoProveedor" not in df.columns:
            continue

        text_col = "NombreroductoGenerico" if "NombreroductoGenerico" in df.columns else None
        if text_col is None:
            continue

        pairs = (
            df.filter(
                pl.col("CodigoProveedor").is_not_null()
                & (pl.col("CodigoProveedor") != "null")
                & pl.col(text_col).is_not_null()
                & (pl.col(text_col) != "null")
            )
            .select(["CodigoProveedor", "NombreProveedor", text_col])
            .unique(subset=["CodigoProveedor", text_col])
        )

        for row in pairs.iter_rows():
            prov_id, prov_name, product = row[0], row[1], row[2]
            if prov_id not in prov_products:
                prov_products[prov_id] = {"nombre": prov_name or "", "products": set(), "n_oc": 0}
            prov_products[prov_id]["products"].add(product)
            prov_products[prov_id]["n_oc"] += 1

    if not prov_products:
        return pl.DataFrame()

    logger.info(f"  {len(prov_products):,} proveedores con datos de producto")

    records = []
    for prov_id, data in prov_products.items():
        if len(data["products"]) < 3:
            continue
        corpus = _clean_text(" ".join(data["products"]))
        if len(corpus) > 20:
            records.append({
                "CodigoProveedor": prov_id,
                "NombreProveedor": data["nombre"],
                "corpus_text": corpus[:10000],
                "n_oc": data["n_oc"],
            })

    corpus_df = pl.DataFrame(records)
    del prov_products
    logger.info(f"Corpus construido: {len(corpus_df):,} proveedores con perfil textual")
    return corpus_df
```

Add `from datetime import date` near the top if not already present.

- [ ] **Step 8.4: Modify `train_tfidf_model` to accept hyperparameter kwargs**

Replace the function (lines 123–195) with:

```python
def train_tfidf_model(
    corpus_df: pl.DataFrame,
    output_dir: Path | None = None,
    *,
    max_features: int = 20000,
    ngram_range: tuple = (1, 2),
    min_df: int = 5,
    max_df: float = 0.8,
    sublinear_tf: bool = True,
    strip_accents: str = "unicode",
    token_pattern: str = r"(?u)\b\w{3,}\b",
) -> dict:
    """
    Entrena TF-IDF Vectorizer y genera vectores por proveedor.

    Hyperparameters passed as keyword args with defaults equal to the
    historical production values.

    `output_dir`: directorio donde persistir artefactos. Default = OUTPUT_DIR (producción).
    Llamadores del harness de eval pasan un tempdir para no contaminar.
    """
    from scipy import sparse
    from sklearn.feature_extraction.text import TfidfVectorizer

    if output_dir is None:
        output_dir = OUTPUT_DIR
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Entrenando modelo TF-IDF...")

    texts = corpus_df["corpus_text"].to_list()
    provider_ids = corpus_df["CodigoProveedor"].to_list()

    vectorizer = TfidfVectorizer(
        max_features=max_features,
        ngram_range=tuple(ngram_range),
        min_df=min_df,
        max_df=max_df,
        sublinear_tf=sublinear_tf,
        strip_accents=strip_accents,
        token_pattern=token_pattern,
    )

    tfidf_matrix = vectorizer.fit_transform(texts)

    logger.info(f"  Vocabulario: {len(vectorizer.vocabulary_):,} términos")
    logger.info(f"  Matriz: {tfidf_matrix.shape[0]:,} proveedores × {tfidf_matrix.shape[1]:,} features")
    logger.info(f"  Sparsity: {1 - tfidf_matrix.nnz / (tfidf_matrix.shape[0] * tfidf_matrix.shape[1]):.4f}")

    import joblib

    model_path = output_dir / "tfidf_model.joblib"
    joblib.dump(vectorizer, model_path)
    logger.info(f"Modelo guardado: {model_path.name}")

    vectors_path = output_dir / "tfidf_provider_vectors.npz"
    sparse.save_npz(vectors_path, tfidf_matrix)
    logger.info(f"Vectores guardados: {vectors_path.name}")

    index_df = pl.DataFrame({
        "CodigoProveedor": provider_ids,
        "NombreProveedor": corpus_df["NombreProveedor"].to_list(),
        "n_oc": corpus_df["n_oc"].to_list(),
        "matrix_row": list(range(len(provider_ids))),
    })
    index_path = output_dir / "tfidf_provider_index.parquet"
    index_df.write_parquet(index_path, compression="snappy")

    feature_names = vectorizer.get_feature_names_out()
    idf_scores = vectorizer.idf_
    vocab_stats = pl.DataFrame({
        "termino": feature_names,
        "idf": idf_scores,
        "n_docs": [int(tfidf_matrix.shape[0] / np.exp(idf - 1)) for idf in idf_scores],
    }).sort("idf")
    vocab_path = output_dir / "tfidf_vocabulary_stats.parquet"
    vocab_stats.write_parquet(vocab_path, compression="snappy")

    return {
        "vectorizer": vectorizer,
        "matrix": tfidf_matrix,
        "index": index_df,
        "vocab_stats": vocab_stats,
    }
```

- [ ] **Step 8.5: Run — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_tfidf_matcher_refactor.py -v`
Expected: 3 passed.

- [ ] **Step 8.6: Verify run_tfidf() still works unchanged**

Run: `cd etl && python -c "from analytics.tfidf_matcher import run_tfidf, train_tfidf_model, build_provider_corpus; print('ok')"`
Expected: `ok`.

- [ ] **Step 8.7: Commit**

```bash
git add etl/analytics/tfidf_matcher.py etl/tests/analytics/evaluation/test_tfidf_matcher_refactor.py
git commit -m "add max_date and hyperparameter kwargs to tfidf_matcher"
```

---

## Task 9: Registry

**Files:**
- Create: `etl/analytics/evaluation/registry.py`
- Create: `etl/tests/analytics/evaluation/test_registry.py`

- [ ] **Step 9.1: Write failing tests**

File: `etl/tests/analytics/evaluation/test_registry.py`

```python
import pytest

from analytics.evaluation import registry
from analytics.evaluation.base import Evaluable, VariantConfig


class _FakeEvaluable(Evaluable):
    name = "_fake"
    default_variant = VariantConfig(name="baseline", params={})
    supported_splits = ["holdout"]
    primary_metric = "x"
    secondary_metrics = []

    def train(self, window, variant): return {}
    def predict(self, artifact, window): return None
    def ground_truth(self, window): return None
    def compute_metrics(self, predictions, truth): return {"x": 0.5}


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
```

- [ ] **Step 9.2: Run — expect errors**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_registry.py -v`

- [ ] **Step 9.3: Implement registry.py**

File: `etl/analytics/evaluation/registry.py`

```python
"""Registry of Evaluable implementations."""
from __future__ import annotations

from .base import Evaluable

_REGISTRY: dict[str, type[Evaluable]] = {}


def register(cls: type[Evaluable]) -> type[Evaluable]:
    """Register an Evaluable subclass. Returns the class so it can be used as a decorator."""
    if not issubclass(cls, Evaluable):
        raise TypeError(f"{cls.__name__} is not an Evaluable subclass")
    if not hasattr(cls, "name") or not cls.name:
        raise ValueError(f"{cls.__name__} must set a non-empty class attribute `name`")
    _REGISTRY[cls.name] = cls
    return cls


def get(name: str) -> type[Evaluable]:
    if name not in _REGISTRY:
        raise KeyError(f"Model '{name}' is not registered. Known: {list_models()}")
    return _REGISTRY[name]


def list_models() -> list[str]:
    return sorted(_REGISTRY.keys())
```

- [ ] **Step 9.4: Run — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_registry.py -v`
Expected: 3 passed.

- [ ] **Step 9.5: Commit**

```bash
git add etl/analytics/evaluation/registry.py etl/tests/analytics/evaluation/test_registry.py
git commit -m "add evaluable registry with register/get/list_models"
```

---

## Task 10: Reporter — JSON and markdown writers

**Files:**
- Create: `etl/analytics/evaluation/reporter.py`
- Create: `etl/tests/analytics/evaluation/test_reporter.py`

- [ ] **Step 10.1: Write failing tests**

File: `etl/tests/analytics/evaluation/test_reporter.py`

```python
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
    # Winner (variant) has higher NDCG@10
    assert "**0.438**" in text  # bolded winner
    assert "+6.3%" in text or "+6.31%" in text
```

- [ ] **Step 10.2: Run — expect errors**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_reporter.py -v`

- [ ] **Step 10.3: Implement reporter.py**

File: `etl/analytics/evaluation/reporter.py`

```python
"""Writers for evaluation results (JSON + markdown)."""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from .base import EvaluationResult

HARNESS_VERSION = "0.1.0"


def _to_jsonable(obj: Any) -> Any:
    """Convert Python objects to JSON-serializable equivalents."""
    if isinstance(obj, tuple):
        return [_to_jsonable(x) for x in obj]
    if isinstance(obj, list):
        return [_to_jsonable(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, Path):
        return str(obj)
    return obj


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True
        ).strip()
    except Exception:
        return "unknown"


def _git_branch() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"], text=True
        ).strip()
    except Exception:
        return "unknown"


def _aggregate(results: list[EvaluationResult]) -> dict[str, dict[str, float | None]]:
    """Compute mean and std per metric across splits."""
    if not results:
        return {}
    all_keys = sorted({k for r in results for k in r.metrics.keys()})
    agg = {}
    for k in all_keys:
        values = [r.metrics[k] for r in results if k in r.metrics]
        if not values:
            continue
        mean = sum(values) / len(values)
        if len(values) > 1:
            var = sum((v - mean) ** 2 for v in values) / len(values)
            std = var ** 0.5
        else:
            std = None
        agg[k] = {"mean": mean, "std": std}
    return agg


def _build_payload(results: list[EvaluationResult], split_strategy: str) -> dict:
    first = results[0]
    return {
        "model_name": first.model_name,
        "variant": {
            "name": first.variant.name,
            "params": _to_jsonable(first.variant.params),
        },
        "run_metadata": {
            "run_at": datetime.now().astimezone().isoformat(),
            "git_commit": _git_commit(),
            "git_branch": _git_branch(),
            "python_version": sys.version.split()[0],
            "harness_version": HARNESS_VERSION,
        },
        "split_strategy": split_strategy,
        "splits": [
            {
                "split_id": r.split_id,
                "metrics": _to_jsonable(r.metrics),
                **_to_jsonable(r.metadata),
            }
            for r in results
        ],
        "aggregate_metrics": _to_jsonable(_aggregate(results)),
        "warnings": [],
    }


def write_result_json(
    results: list[EvaluationResult], base_dir: Path, split_strategy: str
) -> Path:
    assert results, "results must be non-empty"
    first = results[0]
    today = datetime.now().strftime("%Y-%m-%d")
    out_dir = Path(base_dir) / first.model_name
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{today}_{first.variant.name}.json"
    path = out_dir / filename
    payload = _build_payload(results, split_strategy)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def write_result_markdown(
    results: list[EvaluationResult], base_dir: Path, split_strategy: str
) -> Path:
    assert results, "results must be non-empty"
    first = results[0]
    today = datetime.now().strftime("%Y-%m-%d")
    out_dir = Path(base_dir) / first.model_name
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{today}_{first.variant.name}.md"
    path = out_dir / filename

    agg = _aggregate(results)
    lines = []
    lines.append(f"# Evaluation — {first.model_name} / {first.variant.name}")
    lines.append(
        f"**Fecha**: {today} · **Git**: {_git_commit()} · "
        f"**Split**: {split_strategy} · **Variante**: {first.variant.name}"
    )
    lines.append("")
    lines.append("## Configuración")
    lines.append("| Parámetro | Valor |")
    lines.append("|---|---|")
    for k, v in first.variant.params.items():
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append("## Métricas (agregadas)")
    lines.append("| Métrica | Valor |")
    lines.append("|---|---|")
    for k, stats in agg.items():
        mean = stats["mean"]
        std = stats["std"]
        if std is not None:
            lines.append(f"| {k} | {mean:.4f} ± {std:.4f} |")
        else:
            lines.append(f"| {k} | {mean:.4f} |")
    lines.append("")

    if len(results) > 1:
        lines.append("## Por split")
        lines.append("| Split | " + " | ".join(agg.keys()) + " |")
        lines.append("|---|" + "|".join(["---"] * len(agg)) + "|")
        for r in results:
            cells = " | ".join(f"{r.metrics.get(k, float('nan')):.4f}" for k in agg.keys())
            lines.append(f"| {r.split_id} | {cells} |")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def write_comparison_markdown(
    baseline_results: list[EvaluationResult],
    variant_results: list[EvaluationResult],
    primary_metric: str,
    base_dir: Path,
) -> Path:
    assert baseline_results and variant_results
    first_b = baseline_results[0]
    first_v = variant_results[0]
    today = datetime.now().strftime("%Y-%m-%d")

    out_dir = Path(base_dir) / first_b.model_name
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{today}_compare_{first_b.variant.name}_vs_{first_v.variant.name}.md"
    path = out_dir / filename

    agg_b = _aggregate(baseline_results)
    agg_v = _aggregate(variant_results)
    metric_names = sorted(set(agg_b.keys()) | set(agg_v.keys()))
    # Put primary metric first
    if primary_metric in metric_names:
        metric_names.remove(primary_metric)
        metric_names.insert(0, primary_metric)

    lines = [
        f"# Comparison — {first_b.model_name}",
        f"**{first_b.variant.name}** vs **{first_v.variant.name}** · Fecha: {today} · Git: {_git_commit()}",
        "",
        "| Métrica | " + first_b.variant.name + " | " + first_v.variant.name + " | Δ | Δ% |",
        "|---|---|---|---|---|",
    ]
    for m in metric_names:
        b = agg_b.get(m, {}).get("mean")
        v = agg_v.get(m, {}).get("mean")
        if b is None or v is None:
            continue
        delta = v - b
        delta_pct = (delta / b * 100) if b != 0 else float("inf")
        significant = abs(delta_pct) >= 1.0

        def fmt(x):
            return f"{x:.4f}"

        if significant and v > b:
            cell_b, cell_v = fmt(b), f"**{fmt(v)}**"
        elif significant and v < b:
            cell_b, cell_v = f"**{fmt(b)}**", fmt(v)
        else:
            cell_b, cell_v = fmt(b), fmt(v)

        label = f"**{m}**" if m == primary_metric else m
        lines.append(f"| {label} | {cell_b} | {cell_v} | {delta:+.4f} | {delta_pct:+.2f}% |")

    path.write_text("\n".join(lines), encoding="utf-8")
    return path
```

- [ ] **Step 10.4: Run — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_reporter.py -v`
Expected: 4 passed.

- [ ] **Step 10.5: Commit**

```bash
git add etl/analytics/evaluation/reporter.py etl/tests/analytics/evaluation/test_reporter.py
git commit -m "add reporter for json + markdown + comparison outputs"
```

---

## Task 11: TfidfMatcherEvaluable — class attributes + ground_truth

**Files:**
- Create: `etl/analytics/evaluation/evaluators/tfidf_matcher.py`
- Modify: `etl/analytics/evaluation/evaluators/__init__.py`
- Create: `etl/tests/analytics/evaluation/test_tfidf_matcher_evaluable.py`

- [ ] **Step 11.1: Add synthetic LIC parquets fixture**

Append to `etl/tests/analytics/evaluation/conftest.py`:

```python
@pytest.fixture
def synthetic_lic_parquets(tmp_path, monkeypatch):
    """Write 2 tiny LIC parquets with winners + losers."""
    from analytics import config as analytics_config

    lic_dir = tmp_path / "lic"
    lic_dir.mkdir()

    # 2026-3: L-100 with 2 offers (winner + loser), L-101 winner only
    pl.DataFrame({
        "CodigoExterno":       ["L-100", "L-100", "L-101"],
        "Nombre":              ["servicio limpieza oficinas", "servicio limpieza oficinas", "notebooks"],
        "FechaCreacion":       [datetime(2026, 3, 5)] * 3,
        "CodigoProveedor":     ["P2", "P1", "P3"],
        "NombreProveedor":     ["Prov2", "Prov1", "Prov3"],
        "Oferta seleccionada": [True, False, True],
    }).write_parquet(lic_dir / "2026-3.parquet")

    # 2026-4: L-200 with 3 offers
    pl.DataFrame({
        "CodigoExterno":       ["L-200", "L-200", "L-200"],
        "Nombre":              ["papel oficina"] * 3,
        "FechaCreacion":       [datetime(2026, 4, 1)] * 3,
        "CodigoProveedor":     ["P1", "P2", "P3"],
        "NombreProveedor":     ["Prov1", "Prov2", "Prov3"],
        "Oferta seleccionada": [True, False, False],
    }).write_parquet(lic_dir / "2026-4.parquet")

    monkeypatch.setattr(analytics_config, "LIC_PARQUET_DIR", lic_dir)
    return lic_dir


@pytest.fixture
def synthetic_test_window_ocs(tmp_path, synthetic_oc_parquets, monkeypatch):
    """Add OCs in the test window (Mar-Apr 2026) that link to the synthetic LICs."""
    from analytics import config as analytics_config

    oc_dir = synthetic_oc_parquets
    # 2026-3
    pl.DataFrame({
        "Codigo": ["OC-100", "OC-101"],
        "FechaCreacion": [datetime(2026, 3, 10), datetime(2026, 3, 12)],
        "CodigoProveedor": ["P2", "P3"],
        "NombreProveedor": ["Prov2", "Prov3"],
        "NombreroductoGenerico": ["limpieza", "notebooks"],
        "Nombre": ["servicio aseo", "notebook hp"],
        "CodigoLicitacion": ["L-100", "L-101"],
    }).write_parquet(oc_dir / "2026-3.parquet")
    # 2026-4
    pl.DataFrame({
        "Codigo": ["OC-200"],
        "FechaCreacion": [datetime(2026, 4, 5)],
        "CodigoProveedor": ["P1"],
        "NombreProveedor": ["Prov1"],
        "NombreroductoGenerico": ["papel"],
        "Nombre": ["resma"],
        "CodigoLicitacion": ["L-200"],
    }).write_parquet(oc_dir / "2026-4.parquet")
    return oc_dir
```

- [ ] **Step 11.2: Write failing test for class attributes and ground_truth**

File: `etl/tests/analytics/evaluation/test_tfidf_matcher_evaluable.py`

```python
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
    assert set(zip(losers["query_id"].to_list(), losers["item_id"].to_list())) == {
        ("L-100", "P1"), ("L-200", "P2"), ("L-200", "P3"),
    }
```

- [ ] **Step 11.3: Run — expect import error**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_tfidf_matcher_evaluable.py -v`

- [ ] **Step 11.4: Implement class skeleton + ground_truth + train stub**

File: `etl/analytics/evaluation/evaluators/tfidf_matcher.py`

```python
"""Evaluable implementation for the TF-IDF semantic matcher.

See spec §8 for ground truth definition and edge-case handling.
"""
from __future__ import annotations

import logging
import tempfile
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

from analytics import tfidf_matcher as model
from analytics.data_loader import iter_lic_parquets, iter_oc_parquets
from analytics.evaluation import metrics
from analytics.evaluation.base import Evaluable, SplitWindow, VariantConfig
from analytics.evaluation.registry import register

logger = logging.getLogger(__name__)


@register
class TfidfMatcherEvaluable(Evaluable):
    name = "tfidf_matcher"
    default_variant = VariantConfig(
        name="baseline",
        params={
            "ngram_range": (1, 2),
            "max_features": 20000,
            "min_df": 5,
            "max_df": 0.8,
            "sublinear_tf": True,
            "strip_accents": "unicode",
            "token_pattern": r"(?u)\b\w{3,}\b",
        },
    )
    supported_splits = ["holdout", "walk_forward"]
    primary_metric = "ndcg_at_10"
    secondary_metrics = [
        "hit_at_10_winner", "hit_at_10_participant",
        "mrr", "ndcg_at_20", "coverage_at_10",
    ]

    # ─── Public interface ────────────────────────────────────────────────────

    def train(self, window: SplitWindow, variant: VariantConfig) -> dict[str, Any]:
        corpus = model.build_provider_corpus(max_date=window.train_end)
        if corpus.is_empty():
            raise RuntimeError(
                f"Training corpus empty for window ending {window.train_end}"
            )
        tmpdir = Path(tempfile.mkdtemp(prefix="eval_tfidf_"))
        params = dict(variant.params)
        # Ensure ngram_range is a tuple (yaml serializes as list)
        if "ngram_range" in params:
            params["ngram_range"] = tuple(params["ngram_range"])
        return model.train_tfidf_model(corpus, output_dir=tmpdir, **params)

    def predict(self, artifact: dict[str, Any], window: SplitWindow, top_k: int = 50) -> pl.DataFrame:
        # Implemented in next task
        raise NotImplementedError

    def ground_truth(self, window: SplitWindow) -> pl.DataFrame:
        """Build graded-relevance ground truth: winners (rel=2) + losers (rel=1)."""
        # Step 1: winners from OC in test window that link to a licitación
        winners = self._winners_from_oc(window.test_start, window.test_end)

        # Step 2: all participants (winners + losers) from LIC in test window
        participants = self._participants_from_lic(window.test_start, window.test_end)

        if winners.is_empty() and participants.is_empty():
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8, "relevance": pl.Int64}
            )

        # Step 3: merge — winners override any relevance
        if participants.is_empty():
            return winners.with_columns(pl.lit(2).alias("relevance"))
        if winners.is_empty():
            # No winner observable — cannot tell which participant won. Skip.
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8, "relevance": pl.Int64}
            )

        winners_marked = winners.with_columns(pl.lit(2).alias("relevance"))
        participants_marked = participants.with_columns(pl.lit(1).alias("relevance"))

        # Winners first, then participants filtered to avoid duplicates
        combined = pl.concat(
            [winners_marked, participants_marked], how="vertical_relaxed"
        ).unique(subset=["query_id", "item_id"], keep="first")
        return combined.select(["query_id", "item_id", "relevance"])

    def compute_metrics(self, preds: pl.DataFrame, truth: pl.DataFrame) -> dict[str, float]:
        if preds.is_empty():
            return {m: 0.0 for m in [self.primary_metric] + self.secondary_metrics}

        catalog_size = preds["item_id"].n_unique()  # approx: items in top-K universe
        return {
            "ndcg_at_10":            metrics.ndcg_at_k(preds, truth, k=10),
            "ndcg_at_20":            metrics.ndcg_at_k(preds, truth, k=20),
            "hit_at_5_winner":       metrics.hit_at_k(preds, truth, k=5,  relevance_min=2),
            "hit_at_10_winner":      metrics.hit_at_k(preds, truth, k=10, relevance_min=2),
            "hit_at_20_winner":      metrics.hit_at_k(preds, truth, k=20, relevance_min=2),
            "hit_at_10_participant": metrics.hit_at_k(preds, truth, k=10, relevance_min=1),
            "mrr":                   metrics.mrr(preds, truth, k=100),
            "coverage_at_10":        metrics.coverage_at_k(preds, k=10, catalog_size=catalog_size),
        }

    # ─── Helpers ─────────────────────────────────────────────────────────────

    def _winners_from_oc(self, start: date, end: date) -> pl.DataFrame:
        rows: list[dict] = []
        for _periodo, df in iter_oc_parquets(
            columns=["CodigoLicitacion", "CodigoProveedor", "FechaCreacion"],
            min_year=start.year,
        ):
            if df.is_empty():
                continue
            filt = df.filter(
                pl.col("FechaCreacion").cast(pl.Date).is_between(start, end, closed="both")
                & pl.col("CodigoLicitacion").is_not_null()
                & pl.col("CodigoProveedor").is_not_null()
            )
            for r in filt.iter_rows(named=True):
                rows.append({"query_id": r["CodigoLicitacion"], "item_id": r["CodigoProveedor"]})
        if not rows:
            return pl.DataFrame(schema={"query_id": pl.Utf8, "item_id": pl.Utf8})
        return pl.DataFrame(rows).unique(subset=["query_id", "item_id"])

    def _participants_from_lic(self, start: date, end: date) -> pl.DataFrame:
        rows: list[dict] = []
        for _periodo, df in iter_lic_parquets(
            columns=["CodigoExterno", "CodigoProveedor", "FechaCreacion", "Oferta seleccionada"],
            min_year=start.year,
        ):
            if df.is_empty() or "CodigoProveedor" not in df.columns:
                continue
            filt = df.filter(
                pl.col("FechaCreacion").cast(pl.Date).is_between(start, end, closed="both")
                & pl.col("CodigoProveedor").is_not_null()
            )
            for r in filt.iter_rows(named=True):
                rows.append({"query_id": r["CodigoExterno"], "item_id": r["CodigoProveedor"]})
        if not rows:
            return pl.DataFrame(schema={"query_id": pl.Utf8, "item_id": pl.Utf8})
        return pl.DataFrame(rows).unique(subset=["query_id", "item_id"])
```

- [ ] **Step 11.5: Ensure registration is triggered by import**

File: `etl/analytics/evaluation/evaluators/__init__.py`

```python
"""Import all evaluators to register them in the global registry."""
from . import tfidf_matcher  # noqa: F401 — import for side effects (registration)
```

- [ ] **Step 11.6: Run — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_tfidf_matcher_evaluable.py -v`
Expected: 2 passed.

- [ ] **Step 11.7: Commit**

```bash
git add etl/analytics/evaluation/evaluators etl/tests/analytics/evaluation/test_tfidf_matcher_evaluable.py etl/tests/analytics/evaluation/conftest.py
git commit -m "add TfidfMatcherEvaluable with ground_truth and graded relevance"
```

---

## Task 12: TfidfMatcherEvaluable — predict + end-to-end metrics

**Files:**
- Modify: `etl/analytics/evaluation/evaluators/tfidf_matcher.py`
- Modify: `etl/tests/analytics/evaluation/test_tfidf_matcher_evaluable.py`

- [ ] **Step 12.1: Write failing test for predict + compute_metrics end-to-end**

Append to `etl/tests/analytics/evaluation/test_tfidf_matcher_evaluable.py`:

```python
def test_predict_returns_topk_schema(
    synthetic_test_window_ocs, synthetic_lic_parquets
):
    e = TfidfMatcherEvaluable()
    window = SplitWindow(
        train_start=date(2018, 1, 1),
        train_end=date(2024, 3, 31),   # Only Jan-Mar 2024 OCs in training
        test_start=date(2026, 3, 1),
        test_end=date(2026, 4, 30),
    )
    # Training corpus will be tiny; each proveedor needs ≥3 products to enter corpus.
    # Our synthetic data only has ≤3 products per proveedor, so corpus may be empty.
    # Skip if so.
    from analytics import tfidf_matcher as model
    corpus = model.build_provider_corpus(max_date=window.train_end)
    if corpus.is_empty():
        pytest.skip("synthetic corpus too sparse for realistic predict test")

    artifact = e.train(window, e.default_variant)
    preds = e.predict(artifact, window, top_k=5)
    # Every row should have the standard schema
    assert set(preds.columns) >= {"query_id", "item_id", "rank", "score"}


def test_compute_metrics_returns_all_keys(synthetic_test_window_ocs, synthetic_lic_parquets):
    e = TfidfMatcherEvaluable()
    # Hand-crafted predictions and truth with known outcomes
    preds = pl.DataFrame({
        "query_id": ["L-100"] * 3,
        "item_id":  ["P2", "P1", "P3"],
        "rank":     [1, 2, 3],
        "score":    [0.9, 0.7, 0.3],
    })
    truth = pl.DataFrame({
        "query_id":  ["L-100", "L-100"],
        "item_id":   ["P2",    "P1"],
        "relevance": [2,       1],
    })
    out = e.compute_metrics(preds, truth)
    expected_keys = {
        "ndcg_at_10", "ndcg_at_20",
        "hit_at_5_winner", "hit_at_10_winner", "hit_at_20_winner",
        "hit_at_10_participant",
        "mrr", "coverage_at_10",
    }
    assert set(out.keys()) == expected_keys
    # Winner P2 at rank 1 → hit@5_winner = 1.0
    assert out["hit_at_5_winner"] == 1.0
```

- [ ] **Step 12.2: Run — first test expects NotImplementedError; second should already pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_tfidf_matcher_evaluable.py -v`
Expected: `test_predict_returns_topk_schema` skipped or fails; `test_compute_metrics_returns_all_keys` passes.

- [ ] **Step 12.3: Implement predict() via batched cosine similarity**

Replace the `predict` method in `etl/analytics/evaluation/evaluators/tfidf_matcher.py`:

```python
    def predict(self, artifact: dict[str, Any], window: SplitWindow, top_k: int = 50) -> pl.DataFrame:
        """Batch retrieval: vectorize all test licitación names, compute cosine
        similarity against the provider matrix, emit top-k per query.
        """
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = artifact["vectorizer"]
        prov_matrix = artifact["matrix"]
        index = artifact["index"]  # DataFrame with CodigoProveedor, matrix_row

        lics = self._load_test_licitaciones(window.test_start, window.test_end)
        if lics.is_empty():
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8,
                        "rank": pl.Int64, "score": pl.Float64}
            )

        # Clean texts
        query_ids = lics["CodigoExterno"].to_list()
        texts = [model._clean_text(t or "") for t in lics["Nombre"].to_list()]

        # Filter out queries whose cleaned text is too short
        mask = [len(t.split()) >= 3 for t in texts]
        query_ids = [q for q, ok in zip(query_ids, mask) if ok]
        texts = [t for t, ok in zip(texts, mask) if ok]
        if not texts:
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8,
                        "rank": pl.Int64, "score": pl.Float64}
            )

        query_matrix = vectorizer.transform(texts)  # shape: (n_queries, n_features)
        sims = cosine_similarity(query_matrix, prov_matrix)  # (n_queries, n_providers)

        # For each query, pick top-k indices by similarity
        prov_codes = index.sort("matrix_row")["CodigoProveedor"].to_list()
        rows: list[dict] = []
        top_k_clipped = min(top_k, sims.shape[1])
        for qi, qid in enumerate(query_ids):
            scores = sims[qi]
            top_idx = np.argsort(scores)[-top_k_clipped:][::-1]
            for rank, idx in enumerate(top_idx, start=1):
                s = float(scores[idx])
                if s < 0.01:
                    break
                rows.append({
                    "query_id": qid,
                    "item_id": prov_codes[int(idx)],
                    "rank": rank,
                    "score": s,
                })
        if not rows:
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8,
                        "rank": pl.Int64, "score": pl.Float64}
            )
        return pl.DataFrame(rows)
```

- [ ] **Step 12.4: Add `_load_test_licitaciones` helper**

Append method to the class:

```python
    def _load_test_licitaciones(self, start: date, end: date) -> pl.DataFrame:
        """Unique licitaciones in test window with Nombre and CodigoExterno."""
        rows: list[dict] = []
        seen: set[str] = set()
        for _periodo, df in iter_lic_parquets(
            columns=["CodigoExterno", "Nombre", "FechaCreacion"],
            min_year=start.year,
        ):
            if df.is_empty():
                continue
            filt = df.filter(
                pl.col("FechaCreacion").cast(pl.Date).is_between(start, end, closed="both")
                & pl.col("CodigoExterno").is_not_null()
                & pl.col("Nombre").is_not_null()
            )
            for r in filt.iter_rows(named=True):
                if r["CodigoExterno"] in seen:
                    continue
                seen.add(r["CodigoExterno"])
                rows.append({"CodigoExterno": r["CodigoExterno"], "Nombre": r["Nombre"]})
        if not rows:
            return pl.DataFrame(schema={"CodigoExterno": pl.Utf8, "Nombre": pl.Utf8})
        return pl.DataFrame(rows)
```

- [ ] **Step 12.5: Run — expect pass (predict test may skip due to sparse synthetic data; compute_metrics passes)**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_tfidf_matcher_evaluable.py -v`
Expected: 3 passed (or 2 passed + 1 skipped for predict on sparse corpus).

- [ ] **Step 12.6: Commit**

```bash
git add etl/analytics/evaluation/evaluators/tfidf_matcher.py etl/tests/analytics/evaluation/test_tfidf_matcher_evaluable.py
git commit -m "implement batched predict for TfidfMatcherEvaluable"
```

---

## Task 13: Runner + leakage assertion

**Files:**
- Create: `etl/analytics/evaluation/runner.py`
- Create: `etl/tests/analytics/evaluation/test_runner.py`

- [ ] **Step 13.1: Write failing test for runner**

File: `etl/tests/analytics/evaluation/test_runner.py`

```python
from datetime import date

import polars as pl
import pytest

from analytics.evaluation import registry
from analytics.evaluation.base import Evaluable, SplitWindow, VariantConfig
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
        return pl.DataFrame({
            "query_id": ["q1"], "item_id": ["A"], "rank": [1], "score": [0.9],
        })

    def ground_truth(self, window):
        return pl.DataFrame({"query_id": ["q1"], "item_id": ["A"], "relevance": [2]})

    def compute_metrics(self, preds, truth):
        return {"score": 0.42, "aux": 0.1}


def setup_module(_m):
    registry.register(_StubModel)


def test_runner_holdout_returns_one_result(monkeypatch):
    today = date(2026, 4, 14)
    results = run_evaluation(
        model_name="_stub_runner",
        variant=_StubModel.default_variant,
        split_strategy="holdout",
        today=today,
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
    )
    assert len(results) == 4
    for i, r in enumerate(results):
        assert r.split_id == f"fold_{i+1}_of_4"


def test_runner_unknown_split_strategy():
    with pytest.raises(ValueError, match="unsupported"):
        run_evaluation(
            model_name="_stub_runner",
            variant=_StubModel.default_variant,
            split_strategy="bogus",
            today=date(2026, 4, 14),
        )
```

- [ ] **Step 13.2: Run — expect import error**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_runner.py -v`

- [ ] **Step 13.3: Implement runner.py**

File: `etl/analytics/evaluation/runner.py`

```python
"""Runner: dispatches Evaluable across temporal splits and aggregates results."""
from __future__ import annotations

import logging
import time
from datetime import date

import polars as pl

from .base import EvaluationResult, SplitWindow, VariantConfig
from .registry import get as get_evaluable
from .splits import build_holdout_split, build_walk_forward_splits

logger = logging.getLogger(__name__)


def _split_id(strategy: str, i: int, n: int, window: SplitWindow) -> str:
    if strategy == "holdout":
        return f"holdout_{window.test_start:%Y-%m-%d}_{window.test_end:%Y-%m-%d}"
    return f"fold_{i+1}_of_{n}"


def _assert_no_future_leakage(
    evaluable, artifact, window: SplitWindow
) -> None:
    """Probe: iterate training data and verify max FechaCreacion <= window.train_end.

    Relies on the evaluable having a `_probe_training_dates(window)` hook if it
    needs custom verification. For tfidf_matcher we probe iter_oc_parquets directly.
    """
    from analytics.data_loader import iter_oc_parquets

    max_seen: date | None = None
    for _p, df in iter_oc_parquets(columns=["FechaCreacion"], min_year=2018, max_date=window.train_end):
        if df.is_empty():
            continue
        m = df["FechaCreacion"].max()
        if m is None:
            continue
        mdate = m.date() if hasattr(m, "date") else m
        if max_seen is None or mdate > max_seen:
            max_seen = mdate

    if max_seen is not None and max_seen > window.train_end:
        raise RuntimeError(
            f"FUTURE LEAKAGE: iter_oc_parquets(max_date={window.train_end}) "
            f"yielded row with FechaCreacion={max_seen}"
        )


def run_evaluation(
    model_name: str,
    variant: VariantConfig,
    split_strategy: str,
    today: date,
    n_folds: int = 4,
    fold_months: int = 6,
    test_months: int = 12,
    skip_leakage_check: bool = False,
) -> list[EvaluationResult]:
    evaluable_cls = get_evaluable(model_name)
    evaluable = evaluable_cls()

    if split_strategy == "holdout":
        windows = build_holdout_split(today=today, test_months=test_months)
    elif split_strategy == "walk_forward":
        windows = build_walk_forward_splits(today=today, n_folds=n_folds, fold_months=fold_months)
    else:
        raise ValueError(f"unsupported split_strategy: {split_strategy!r}")

    results: list[EvaluationResult] = []
    for i, window in enumerate(windows):
        logger.info("[split %d/%d] train→%s, test %s→%s",
                    i + 1, len(windows), window.train_end,
                    window.test_start, window.test_end)
        t0 = time.time()
        artifact = evaluable.train(window, variant)
        train_s = time.time() - t0

        if not skip_leakage_check:
            _assert_no_future_leakage(evaluable, artifact, window)

        t1 = time.time()
        preds = evaluable.predict(artifact, window)
        predict_s = time.time() - t1

        truth = evaluable.ground_truth(window)
        metrics = evaluable.compute_metrics(preds, truth)

        results.append(
            EvaluationResult(
                model_name=model_name,
                variant=variant,
                split_id=_split_id(split_strategy, i, len(windows), window),
                metrics=metrics,
                metadata={
                    "train_window": {"start": window.train_start.isoformat(),
                                     "end": window.train_end.isoformat()},
                    "test_window":  {"start": window.test_start.isoformat(),
                                     "end": window.test_end.isoformat()},
                    "train_duration_s": round(train_s, 2),
                    "predict_duration_s": round(predict_s, 2),
                    "n_predictions": 0 if preds is None else len(preds),
                    "n_truth_rows": 0 if truth is None else len(truth),
                },
            )
        )
    return results
```

- [ ] **Step 13.4: Run — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_runner.py -v`
Expected: 3 passed. Note: leakage check won't fire for `_StubModel` because iter_oc_parquets returns empty without synthetic fixtures — add `skip_leakage_check=True` to stub test if needed. Adjust if a test fails because of this.

- [ ] **Step 13.5: Commit**

```bash
git add etl/analytics/evaluation/runner.py etl/tests/analytics/evaluation/test_runner.py
git commit -m "add runner and leakage assertion for evaluation harness"
```

---

## Task 14: CLI + variant loading

**Files:**
- Create: `etl/analytics/evaluation/cli.py`
- Create: `etl/analytics/evaluation/__main__.py`
- Create: `etl/analytics/evaluation/variants/tfidf_baseline.yaml`
- Create: `etl/tests/analytics/evaluation/test_cli.py`

- [ ] **Step 14.1: Write reference variant YAML**

File: `etl/analytics/evaluation/variants/tfidf_baseline.yaml`

```yaml
# Baseline variant for tfidf_matcher.
# Loaded by CLI via --variant-file.
# See spec §4.3.

name: baseline
params:
  ngram_range: [1, 2]
  max_features: 20000
  min_df: 5
  max_df: 0.8
  sublinear_tf: true
  strip_accents: unicode
  token_pattern: "(?u)\\b\\w{3,}\\b"
```

- [ ] **Step 14.2: Write failing tests**

File: `etl/tests/analytics/evaluation/test_cli.py`

```python
from pathlib import Path

import pytest

from analytics.evaluation import cli


def test_parser_defaults():
    args = cli.build_parser().parse_args(["--model", "tfidf_matcher"])
    assert args.model == "tfidf_matcher"
    assert args.variant == "baseline"
    assert not args.walk_forward
    assert args.test_months == 12


def test_parser_walk_forward_flag():
    args = cli.build_parser().parse_args([
        "--model", "tfidf_matcher", "--walk-forward",
    ])
    assert args.walk_forward is True


def test_load_variant_from_yaml(tmp_path):
    yaml_path = tmp_path / "v.yaml"
    yaml_path.write_text(
        "name: custom\nparams:\n  ngram_range: [1, 3]\n  min_df: 10\n",
        encoding="utf-8",
    )
    variant = cli.load_variant_yaml(yaml_path)
    assert variant.name == "custom"
    assert variant.params["ngram_range"] == [1, 3]
    assert variant.params["min_df"] == 10


def test_load_default_variant_of_registered_model():
    variant = cli.resolve_variant(model_name="tfidf_matcher", variant_arg="baseline", variant_file=None)
    assert variant.name == "baseline"
    assert variant.params["ngram_range"] == (1, 2)
```

- [ ] **Step 14.3: Run — expect failures**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_cli.py -v`

- [ ] **Step 14.4: Implement cli.py**

File: `etl/analytics/evaluation/cli.py`

```python
"""CLI entry for the evaluation harness.

Usage:
  python -m etl.analytics.evaluation --model tfidf_matcher
  python -m etl.analytics.evaluation --model tfidf_matcher --walk-forward
  python -m etl.analytics.evaluation --model tfidf_matcher --variant-file path/to/v.yaml
  python -m etl.analytics.evaluation --model tfidf_matcher --compare baseline:baseline other.yaml
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

import yaml

# Trigger evaluator registration by importing the package
from analytics.evaluation import evaluators  # noqa: F401
from analytics.evaluation import registry, reporter, runner
from analytics.evaluation.base import VariantConfig

logger = logging.getLogger(__name__)

EVAL_OUTPUT_JSON_BASE = Path("etl/data/analytics/evals")
EVAL_OUTPUT_MD_BASE = Path("docs/analytics/evals")
VARIANTS_DIR = Path(__file__).parent / "variants"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="etl.analytics.evaluation")
    p.add_argument("--model", required=True, help="Registered model name")
    p.add_argument("--variant", default="baseline", help="Named variant (default: baseline)")
    p.add_argument("--variant-file", type=Path, help="YAML with {name, params}")
    p.add_argument("--walk-forward", action="store_true", help="Use walk-forward split")
    p.add_argument("--test-months", type=int, default=12, help="Holdout test window length")
    p.add_argument("--n-folds", type=int, default=4)
    p.add_argument("--fold-months", type=int, default=6)
    p.add_argument("--compare", nargs=2, metavar=("A", "B"),
                   help="Compare two variants: A B. Each is 'name' or path to YAML.")
    p.add_argument("--dry-run", action="store_true",
                   help="Validate config and print plan without running.")
    p.add_argument("--keep-artifacts", action="store_true",
                   help="Do not delete temp artifacts from train().")
    p.add_argument("-v", "--verbose", action="store_true")
    return p


def load_variant_yaml(path: Path) -> VariantConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return VariantConfig(name=data["name"], params=data.get("params", {}))


def resolve_variant(
    model_name: str, variant_arg: str | None, variant_file: Path | None
) -> VariantConfig:
    if variant_file is not None:
        return load_variant_yaml(variant_file)
    if variant_arg == "baseline":
        cls = registry.get(model_name)
        return cls.default_variant
    # Try to find a named YAML in the variants dir
    candidate = VARIANTS_DIR / f"{model_name}_{variant_arg}.yaml"
    if candidate.exists():
        return load_variant_yaml(candidate)
    raise FileNotFoundError(
        f"Variant '{variant_arg}' not found; looked for "
        f"{candidate} and no --variant-file passed."
    )


def _resolve_compare_arg(model: str, arg: str) -> VariantConfig:
    # Either "name" or "path/to/yaml"
    p = Path(arg)
    if p.suffix in (".yaml", ".yml") and p.exists():
        return load_variant_yaml(p)
    # Interpret as named: 'name:label' means use default_variant but relabel
    if ":" in arg:
        parts = arg.split(":", 1)
        cls = registry.get(model)
        base = cls.default_variant
        return VariantConfig(name=parts[1], params=base.params)
    return resolve_variant(model, arg, None)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    split_strategy = "walk_forward" if args.walk_forward else "holdout"
    today = date.today()

    if args.compare:
        variant_a = _resolve_compare_arg(args.model, args.compare[0])
        variant_b = _resolve_compare_arg(args.model, args.compare[1])
        if args.dry_run:
            print(f"[dry-run] would compare {variant_a.name} vs {variant_b.name}")
            return 0
        res_a = runner.run_evaluation(
            args.model, variant_a, split_strategy, today,
            n_folds=args.n_folds, fold_months=args.fold_months, test_months=args.test_months,
        )
        res_b = runner.run_evaluation(
            args.model, variant_b, split_strategy, today,
            n_folds=args.n_folds, fold_months=args.fold_months, test_months=args.test_months,
        )
        reporter.write_result_json(res_a, EVAL_OUTPUT_JSON_BASE, split_strategy)
        reporter.write_result_json(res_b, EVAL_OUTPUT_JSON_BASE, split_strategy)
        reporter.write_result_markdown(res_a, EVAL_OUTPUT_MD_BASE, split_strategy)
        reporter.write_result_markdown(res_b, EVAL_OUTPUT_MD_BASE, split_strategy)
        cls = registry.get(args.model)
        md_path = reporter.write_comparison_markdown(
            res_a, res_b,
            primary_metric=cls.primary_metric,
            base_dir=EVAL_OUTPUT_MD_BASE,
        )
        print(f"Comparison written: {md_path}")
        return 0

    variant = resolve_variant(args.model, args.variant, args.variant_file)

    if args.dry_run:
        print(f"[dry-run] model={args.model} variant={variant.name} split={split_strategy}")
        print(f"[dry-run] params={variant.params}")
        return 0

    results = runner.run_evaluation(
        args.model, variant, split_strategy, today,
        n_folds=args.n_folds, fold_months=args.fold_months, test_months=args.test_months,
    )
    json_path = reporter.write_result_json(results, EVAL_OUTPUT_JSON_BASE, split_strategy)
    md_path = reporter.write_result_markdown(results, EVAL_OUTPUT_MD_BASE, split_strategy)
    print(f"JSON:     {json_path}")
    print(f"Markdown: {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 14.5: Write `__main__.py`**

File: `etl/analytics/evaluation/__main__.py`

```python
"""Entry for: python -m etl.analytics.evaluation"""
from .cli import main
import sys

if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 14.6: Check if PyYAML is installed; add to requirements if not**

Run: `cd etl && python -c "import yaml; print(yaml.__version__)"`

If ImportError: add `PyYAML>=6.0` to `etl/requirements.txt` (or wherever the ETL's dependencies live) and install.

- [ ] **Step 14.7: Run tests — expect pass**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_cli.py -v`
Expected: 4 passed.

- [ ] **Step 14.8: Dry-run smoke test**

Run: `cd etl && python -m analytics.evaluation --model tfidf_matcher --dry-run`
Expected: prints `[dry-run] model=tfidf_matcher variant=baseline split=holdout` + params.

- [ ] **Step 14.9: Commit**

```bash
git add etl/analytics/evaluation/cli.py etl/analytics/evaluation/__main__.py etl/analytics/evaluation/variants/tfidf_baseline.yaml etl/tests/analytics/evaluation/test_cli.py
git commit -m "add CLI with holdout/walk-forward/compare/dry-run modes"
```

---

## Task 15: End-to-end smoke test with synthetic data

**Files:**
- Create: `etl/tests/analytics/evaluation/test_harness_smoke.py`

- [ ] **Step 15.1: Write the smoke test**

File: `etl/tests/analytics/evaluation/test_harness_smoke.py`

```python
"""End-to-end smoke test: run the full harness against synthetic parquets
and verify all output files are produced with valid structure.
"""
import json
from datetime import date
from pathlib import Path

import polars as pl
import pytest

from analytics.evaluation.base import VariantConfig


@pytest.fixture
def rich_synthetic_data(tmp_path, monkeypatch):
    """Generate synthetic OC + LIC parquets rich enough for end-to-end eval.

    20 proveedores, each with 4-10 distinct products across 6 rubros,
    spanning 2022-2026.
    """
    import random
    from datetime import datetime

    from analytics import config as analytics_config

    random.seed(42)

    oc_dir = tmp_path / "oc"
    lic_dir = tmp_path / "lic"
    oc_dir.mkdir()
    lic_dir.mkdir()

    rubros_productos = {
        "01_agricultura":  ["semillas", "fertilizantes", "riego goteo", "maquinaria agricola"],
        "14_mineria":      ["explosivos", "brocas", "cascos mineros", "equipos topografia"],
        "43_tecnologia":   ["notebooks", "servidores", "switches red", "licencias software"],
        "56_oficina":      ["papel bond", "resmas A4", "tinta impresora", "carpetas"],
        "76_limpieza":     ["detergente industrial", "mopas", "bolsas basura", "desinfectante"],
        "85_salud":        ["mascarillas", "guantes latex", "gasa estéril", "termometros"],
    }
    all_proveedores = [f"P{i:03d}" for i in range(20)]

    # Each proveedor focuses on 1-2 rubros
    prov_focus = {}
    rubros = list(rubros_productos.keys())
    for p in all_proveedores:
        prov_focus[p] = random.sample(rubros, k=random.choice([1, 2]))

    def gen_oc_row(year, month, lic_count):
        p = random.choice(all_proveedores)
        rubro = random.choice(prov_focus[p])
        prod = random.choice(rubros_productos[rubro])
        lic = f"L-{year}{month:02d}-{lic_count:04d}" if random.random() > 0.2 else None
        return {
            "Codigo": f"OC-{year}{month:02d}-{lic_count:04d}",
            "FechaCreacion": datetime(year, month, random.randint(1, 28)),
            "CodigoProveedor": p,
            "NombreProveedor": f"Prov {p}",
            "NombreroductoGenerico": prod,
            "Nombre": prod + " producto",
            "CodigoLicitacion": lic,
        }

    # Generate 24 months of OC (2024-2026) with ~80 OCs/month
    for year in [2024, 2025, 2026]:
        for month in range(1, 13):
            if year == 2026 and month > 4:
                continue
            rows = [gen_oc_row(year, month, i) for i in range(80)]
            pl.DataFrame(rows).write_parquet(oc_dir / f"{year}-{month}.parquet")

    # LIC parquets: every OC with CodigoLicitacion becomes a LIC entry (winner)
    # + add 2-4 losers per LIC
    lic_rows_by_month: dict[tuple[int, int], list[dict]] = {}
    for year in [2024, 2025, 2026]:
        for month in range(1, 13):
            p = oc_dir / f"{year}-{month}.parquet"
            if not p.exists():
                continue
            df = pl.read_parquet(p)
            winners = df.filter(pl.col("CodigoLicitacion").is_not_null())
            lic_rows = []
            for r in winners.iter_rows(named=True):
                # Winner row
                lic_rows.append({
                    "CodigoExterno": r["CodigoLicitacion"],
                    "Nombre": r["Nombre"],
                    "FechaCreacion": r["FechaCreacion"],
                    "CodigoProveedor": r["CodigoProveedor"],
                    "NombreProveedor": r["NombreProveedor"],
                    "Oferta seleccionada": True,
                })
                # 2-3 random losers (different proveedores)
                losers = [
                    q for q in random.sample(all_proveedores, k=3)
                    if q != r["CodigoProveedor"]
                ][:2]
                for lp in losers:
                    lic_rows.append({
                        "CodigoExterno": r["CodigoLicitacion"],
                        "Nombre": r["Nombre"],
                        "FechaCreacion": r["FechaCreacion"],
                        "CodigoProveedor": lp,
                        "NombreProveedor": f"Prov {lp}",
                        "Oferta seleccionada": False,
                    })
            if lic_rows:
                pl.DataFrame(lic_rows).write_parquet(lic_dir / f"{year}-{month}.parquet")

    monkeypatch.setattr(analytics_config, "OC_PARQUET_DIR", oc_dir)
    monkeypatch.setattr(analytics_config, "LIC_PARQUET_DIR", lic_dir)
    return {"oc_dir": oc_dir, "lic_dir": lic_dir}


def test_end_to_end_tfidf_matcher_holdout(rich_synthetic_data, tmp_path, monkeypatch):
    from analytics.evaluation import reporter, runner
    from analytics.evaluation.evaluators.tfidf_matcher import TfidfMatcherEvaluable  # noqa

    # Point reporter at tmp
    json_base = tmp_path / "json"
    md_base = tmp_path / "md"

    results = runner.run_evaluation(
        model_name="tfidf_matcher",
        variant=TfidfMatcherEvaluable.default_variant,
        split_strategy="holdout",
        today=date(2026, 4, 14),
    )
    assert len(results) == 1
    r = results[0]
    # All expected metric keys present
    expected = {
        "ndcg_at_10", "ndcg_at_20",
        "hit_at_5_winner", "hit_at_10_winner", "hit_at_20_winner",
        "hit_at_10_participant",
        "mrr", "coverage_at_10",
    }
    assert set(r.metrics.keys()) == expected
    # Metrics within sane range (0..1)
    for k, v in r.metrics.items():
        assert 0.0 <= v <= 1.0, f"{k} out of [0,1]: {v}"

    # Write artifacts and verify schemas
    json_path = reporter.write_result_json(results, json_base, "holdout")
    md_path = reporter.write_result_markdown(results, md_base, "holdout")

    data = json.loads(json_path.read_text(encoding="utf-8"))
    assert data["model_name"] == "tfidf_matcher"
    assert data["splits"][0]["metrics"]["ndcg_at_10"] == pytest.approx(r.metrics["ndcg_at_10"])
    assert "ngram_range" in str(md_path.read_text(encoding="utf-8"))
```

- [ ] **Step 15.2: Run the smoke test**

Run: `cd etl && python -m pytest tests/analytics/evaluation/test_harness_smoke.py -v -s`
Expected: 1 passed (may take 30-60 seconds). Metrics will be low (synthetic data is sparse) but non-crashing.

- [ ] **Step 15.3: Commit**

```bash
git add etl/tests/analytics/evaluation/test_harness_smoke.py
git commit -m "add end-to-end smoke test for evaluation harness"
```

---

## Task 16: Verify production pipeline unchanged

**Files:** none changed — verification task.

**Goal:** Confirm that existing `run_all.py --modulo tfidf_matcher` produces byte-identical artifacts to what it produced before the refactor.

- [ ] **Step 16.1: Capture "before" state (if possible)**

If the user has existing `etl/data/analytics/tfidf_model.joblib` from a prior production run, back it up:

```bash
cp etl/data/analytics/tfidf_model.joblib etl/data/analytics/tfidf_model.joblib.backup
cp etl/data/analytics/tfidf_provider_vectors.npz etl/data/analytics/tfidf_provider_vectors.npz.backup
cp etl/data/analytics/tfidf_provider_index.parquet etl/data/analytics/tfidf_provider_index.parquet.backup
cp etl/data/analytics/tfidf_vocabulary_stats.parquet etl/data/analytics/tfidf_vocabulary_stats.parquet.backup
```

If no prior artifacts exist, skip this step and just verify the new run succeeds in 16.2.

- [ ] **Step 16.2: Run production pipeline**

Run: `cd etl && python -m analytics.run_all --modulo tfidf_matcher`
Expected: completes without error. Logs should show same vocab size, same # providers as prior run.

- [ ] **Step 16.3: Verify artifacts (sanity diff)**

For joblib: the TfidfVectorizer's `.vocabulary_` dict should be identical. Write a quick inline comparison:

```bash
cd etl && python - <<'EOF'
import joblib
v_new = joblib.load("data/analytics/tfidf_model.joblib")
try:
    v_old = joblib.load("data/analytics/tfidf_model.joblib.backup")
    print(f"Vocab size — new: {len(v_new.vocabulary_)}, old: {len(v_old.vocabulary_)}")
    print(f"Same vocab: {v_new.vocabulary_ == v_old.vocabulary_}")
    print(f"Same params: ngram={v_new.ngram_range==v_old.ngram_range}, min_df={v_new.min_df==v_old.min_df}")
except FileNotFoundError:
    print("No backup — skipping diff. Vocab size of new model:", len(v_new.vocabulary_))
EOF
```

Expected: `Same vocab: True` (or if no backup: just the size logged).

- [ ] **Step 16.4: Cleanup backups**

```bash
rm -f etl/data/analytics/*.backup
```

- [ ] **Step 16.5: Commit verification note (only if anything changed)**

If the diff revealed any difference (it shouldn't), investigate before proceeding. If all clean, no commit needed.

---

## Task 17: First real baseline run + commit artifacts

**Files:**
- Create: `docs/analytics/evals/tfidf_matcher/<YYYY-MM-DD>_baseline.md`
- Create: `etl/data/analytics/evals/tfidf_matcher/<YYYY-MM-DD>_baseline.json`

**Goal:** Execute the harness against real production data. This is the baseline that spec G1 will improve against.

- [ ] **Step 17.1: Run baseline (from repo root)**

Run: `cd etl && python -m analytics.evaluation --model tfidf_matcher --variant baseline`

Expected runtime: 5-15 minutes.
Expected output: prints paths to generated `.json` and `.md`.

- [ ] **Step 17.2: Verify metrics are in spec's guard-rail range (§8.5)**

Open the generated markdown. Check:
- `NDCG@10` ∈ [0.30, 0.55]
- `hit_at_10_winner` ∈ [0.25, 0.45]
- `hit_at_10_participant` ∈ [0.40, 0.65]
- `mrr` ∈ [0.15, 0.30]

If any metric is outside its range, **DO NOT COMMIT** the generated files. Instead:
- Re-read spec §8.5 for the expected ranges and why they were chosen.
- Check `run_metadata.exclusions` in the JSON — very high cold-start or short-text counts may explain outlying metrics.
- If LIC data has only winners (no losers), the fallback to binary relevance will shift `hit_at_10_participant` closer to `hit_at_10_winner`. The markdown should document this fallback — verify.
- File a debugging task; surface the issue before continuing.

- [ ] **Step 17.3: Commit generated baseline**

```bash
git add docs/analytics/evals/tfidf_matcher/*.md etl/data/analytics/evals/tfidf_matcher/*.json
git commit -m "add first baseline evaluation for tfidf_matcher"
```

- [ ] **Step 17.4: Walk-forward baseline (optional but recommended)**

Run: `cd etl && python -m analytics.evaluation --model tfidf_matcher --variant baseline --walk-forward`

Expected runtime: ~4× holdout (~30-60 min). Produces one markdown + JSON with 4 folds + aggregated mean/std.

- [ ] **Step 17.5: Commit walk-forward baseline if values are stable**

```bash
git add docs/analytics/evals/tfidf_matcher/*.md etl/data/analytics/evals/tfidf_matcher/*.json
git commit -m "add walk-forward baseline evaluation for tfidf_matcher"
```

If std/mean > 0.3 on primary metric, skip commit and note the instability in a follow-up task — the spec's child G1 will need to address drift before tuning.

---

## Task 18: Update CLAUDE.md with new commands

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 18.1: Add eval harness commands under "ETL" section**

In `CLAUDE.md`, find the `### ETL` section (around line ~60 in the "Common Commands" block) and append:

```bash
# Scoring evaluation harness
cd etl && python -m analytics.evaluation --model tfidf_matcher --variant baseline         # holdout
cd etl && python -m analytics.evaluation --model tfidf_matcher --walk-forward              # walk-forward
cd etl && python -m analytics.evaluation --model tfidf_matcher --compare baseline:baseline variants/custom.yaml
cd etl && python -m pytest tests/analytics/evaluation/ -v                                   # run eval tests
```

- [ ] **Step 18.2: Commit**

```bash
git add CLAUDE.md
git commit -m "document scoring evaluation harness commands in CLAUDE.md"
```

---

## Acceptance criteria from spec §12

Verify each before declaring the plan complete:

- [ ] `python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline` runs and produces files in both `etl/data/analytics/evals/tfidf_matcher/` and `docs/analytics/evals/tfidf_matcher/`.
- [ ] `python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline --walk-forward` runs and produces 4 folds + aggregated metrics.
- [ ] `python -m etl.analytics.run_all --modulo tfidf_matcher` produces artifacts matching pre-refactor output (Task 16).
- [ ] `docs/analytics/evals/tfidf_matcher/<date>_baseline.md` is committed with metrics inside the guard-rail ranges from spec §8.5.
- [ ] `pytest etl/tests/analytics/evaluation/` passes including `test_harness_smoke.py`.
- [ ] `etl/analytics/evaluation/variants/tfidf_baseline.yaml` exists and is loadable via `--variant-file`.
- [ ] `_assert_no_future_leakage` function exists in `runner.py` and runs without failing on the real baseline.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-14-scoring-evaluation-framework.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatches a fresh subagent per task, reviews between tasks, fast iteration. Best for long plans like this one (18 tasks).

**2. Inline Execution** - Executes tasks in the current session using `executing-plans`. Batch with checkpoints for review. Use this if you want to read and approve each step as it happens.

**Which approach?**
