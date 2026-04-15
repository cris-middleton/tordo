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
        if not df.is_empty():
            max_fc = df["FechaCreacion"].max()
            assert max_fc.date() <= cutoff
            rows_after.extend(df["Codigo"].to_list())
    # OC-001, OC-002, OC-003 (jan), OC-004 (feb 10). OC-005 (feb 20) and OC-006 (mar) filtered.
    assert set(rows_after) == {"OC-001", "OC-002", "OC-003", "OC-004"}


def test_iter_with_max_date_can_yield_empty_frames(synthetic_oc_parquets):
    cutoff = date(2023, 12, 31)
    total = 0
    for periodo, df in iter_oc_parquets(
        columns=["Codigo", "FechaCreacion"], min_year=2024, max_date=cutoff
    ):
        total += len(df)
    assert total == 0
