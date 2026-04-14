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
