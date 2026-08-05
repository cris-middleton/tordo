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
