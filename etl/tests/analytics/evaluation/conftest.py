"""Fixtures for evaluation tests.

Two kinds:
1. Tiny in-memory DataFrames for unit tests of metrics/splits/reporter.
2. Synthetic on-disk parquets (OC + LIC) for integration tests that exercise
   data_loader, tfidf_matcher, and the end-to-end CLI.
"""

from datetime import datetime

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
    return pl.DataFrame(
        {
            "query_id": ["q1", "q1", "q1", "q2", "q2", "q2"],
            "item_id": ["A", "B", "C", "X", "Y", "Z"],
            "rank": [1, 2, 3, 1, 2, 3],
            "score": [0.9, 0.7, 0.5, 0.8, 0.6, 0.4],
        }
    )


@pytest.fixture
def truth_graded() -> pl.DataFrame:
    """
    Ground truth with graded relevance (winner=2, loser=1).

    q1: winner=B (rel=2), loser=A (rel=1), C not in truth (rel=0 implicit)
    q2: winner=Y (rel=2), X and Z not in truth (rel=0 implicit)
    """
    return pl.DataFrame(
        {
            "query_id": ["q1", "q1", "q2"],
            "item_id": ["B", "A", "Y"],
            "relevance": [2, 1, 2],
        }
    )


@pytest.fixture
def truth_binary() -> pl.DataFrame:
    """Binary-relevance fallback ground truth (all rel=2 = winners only)."""
    return pl.DataFrame(
        {
            "query_id": ["q1", "q2"],
            "item_id": ["B", "Y"],
            "relevance": [2, 2],
        }
    )


@pytest.fixture
def empty_preds() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "query_id": [],
            "item_id": [],
            "rank": [],
            "score": [],
        },
        schema={"query_id": pl.Utf8, "item_id": pl.Utf8, "rank": pl.Int64, "score": pl.Float64},
    )


# ─── Synthetic OC/LIC parquets for integration tests ──────────────────────────


@pytest.fixture
def synthetic_oc_parquets(tmp_path, monkeypatch):
    """Write 3 tiny OC parquets to a tmp dir and point OC_PARQUET_DIR to it."""
    from analytics import config as analytics_config

    oc_dir = tmp_path / "oc"
    oc_dir.mkdir()

    pl.DataFrame(
        {
            "Codigo": ["OC-001", "OC-002", "OC-003"],
            "FechaCreacion": [
                datetime(2024, 1, 5),
                datetime(2024, 1, 15),
                datetime(2024, 1, 28),
            ],
            "CodigoProveedor": ["P1", "P2", "P1"],
            "NombreProveedor": ["Prov1", "Prov2", "Prov1"],
            "NombreroductoGenerico": ["papel", "limpieza", "papel higienico"],
            "Nombre": ["resma papel A4", "detergente industrial", "papel higienico"],
            "CodigoLicitacion": ["L-001", None, "L-002"],
        }
    ).write_parquet(oc_dir / "2024-1.parquet")

    pl.DataFrame(
        {
            "Codigo": ["OC-004", "OC-005"],
            "FechaCreacion": [datetime(2024, 2, 10), datetime(2024, 2, 20)],
            "CodigoProveedor": ["P3", "P2"],
            "NombreProveedor": ["Prov3", "Prov2"],
            "NombreroductoGenerico": ["computadores", "limpieza"],
            "Nombre": ["notebooks oficina", "servicio aseo"],
            "CodigoLicitacion": ["L-003", "L-004"],
        }
    ).write_parquet(oc_dir / "2024-2.parquet")

    pl.DataFrame(
        {
            "Codigo": ["OC-006"],
            "FechaCreacion": [datetime(2024, 3, 15)],
            "CodigoProveedor": ["P1"],
            "NombreProveedor": ["Prov1"],
            "NombreroductoGenerico": ["papel"],
            "Nombre": ["resma"],
            "CodigoLicitacion": [None],
        }
    ).write_parquet(oc_dir / "2024-3.parquet")

    monkeypatch.setattr(analytics_config, "OC_PARQUET_DIR", oc_dir)
    from analytics import data_loader as _dl

    monkeypatch.setattr(_dl, "OC_PARQUET_DIR", oc_dir)
    return oc_dir


@pytest.fixture
def synthetic_lic_parquets(tmp_path, monkeypatch):
    """Write 2 tiny LIC parquets with winners + losers."""
    import analytics.data_loader as _dl
    from analytics import config as analytics_config

    lic_dir = tmp_path / "lic"
    lic_dir.mkdir()

    # 2026-3: L-100 with 2 offers (winner + loser), L-101 winner only
    pl.DataFrame(
        {
            "CodigoExterno": ["L-100", "L-100", "L-101"],
            "Nombre": ["servicio limpieza oficinas", "servicio limpieza oficinas", "notebooks"],
            "FechaCreacion": [datetime(2026, 3, 5)] * 3,
            "CodigoProveedor": ["P2", "P1", "P3"],
            "NombreProveedor": ["Prov2", "Prov1", "Prov3"],
            "Oferta seleccionada": [True, False, True],
        }
    ).write_parquet(lic_dir / "2026-3.parquet")

    # 2026-4: L-200 with 3 offers
    pl.DataFrame(
        {
            "CodigoExterno": ["L-200", "L-200", "L-200"],
            "Nombre": ["papel oficina"] * 3,
            "FechaCreacion": [datetime(2026, 4, 1)] * 3,
            "CodigoProveedor": ["P1", "P2", "P3"],
            "NombreProveedor": ["Prov1", "Prov2", "Prov3"],
            "Oferta seleccionada": [True, False, False],
        }
    ).write_parquet(lic_dir / "2026-4.parquet")

    monkeypatch.setattr(analytics_config, "LIC_PARQUET_DIR", lic_dir)
    monkeypatch.setattr(_dl, "LIC_PARQUET_DIR", lic_dir)
    return lic_dir


@pytest.fixture
def synthetic_test_window_ocs(tmp_path, synthetic_oc_parquets, monkeypatch):
    """Add OCs in the test window (Mar-Apr 2026) that link to the synthetic LICs."""

    oc_dir = synthetic_oc_parquets
    # 2026-3
    pl.DataFrame(
        {
            "Codigo": ["OC-100", "OC-101"],
            "FechaCreacion": [datetime(2026, 3, 10), datetime(2026, 3, 12)],
            "CodigoProveedor": ["P2", "P3"],
            "NombreProveedor": ["Prov2", "Prov3"],
            "NombreroductoGenerico": ["limpieza", "notebooks"],
            "Nombre": ["servicio aseo", "notebook hp"],
            "CodigoLicitacion": ["L-100", "L-101"],
        }
    ).write_parquet(oc_dir / "2026-3.parquet")
    # 2026-4
    pl.DataFrame(
        {
            "Codigo": ["OC-200"],
            "FechaCreacion": [datetime(2026, 4, 5)],
            "CodigoProveedor": ["P1"],
            "NombreProveedor": ["Prov1"],
            "NombreroductoGenerico": ["papel"],
            "Nombre": ["resma"],
            "CodigoLicitacion": ["L-200"],
        }
    ).write_parquet(oc_dir / "2026-4.parquet")
    return oc_dir
