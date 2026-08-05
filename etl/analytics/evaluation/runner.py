"""Runner: dispatches Evaluable across temporal splits and aggregates results."""

from __future__ import annotations

import logging
import time
from datetime import date

from .base import EvaluationResult, SplitWindow, VariantConfig
from .registry import get as get_evaluable
from .splits import build_holdout_split, build_walk_forward_splits

logger = logging.getLogger(__name__)


def _split_id(strategy: str, i: int, n: int, window: SplitWindow) -> str:
    if strategy == "holdout":
        return f"holdout_{window.test_start:%Y-%m-%d}_{window.test_end:%Y-%m-%d}"
    return f"fold_{i + 1}_of_{n}"


def _assert_no_future_leakage(evaluable, artifact, window: SplitWindow) -> None:
    """Probe iter_oc_parquets and verify max FechaCreacion <= window.train_end."""
    from analytics.data_loader import iter_oc_parquets

    max_seen: date | None = None
    for _p, df in iter_oc_parquets(
        columns=["FechaCreacion"], min_year=2018, max_date=window.train_end
    ):
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
        logger.info(
            "[split %d/%d] train→%s, test %s→%s",
            i + 1,
            len(windows),
            window.train_end,
            window.test_start,
            window.test_end,
        )
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
                    "train_window": {
                        "start": window.train_start.isoformat(),
                        "end": window.train_end.isoformat(),
                    },
                    "test_window": {
                        "start": window.test_start.isoformat(),
                        "end": window.test_end.isoformat(),
                    },
                    "train_duration_s": round(train_s, 2),
                    "predict_duration_s": round(predict_s, 2),
                    "n_predictions": 0 if preds is None else len(preds),
                    "n_truth_rows": 0 if truth is None else len(truth),
                },
            )
        )
    return results
