"""End-to-end smoke test: run the full harness against synthetic parquets
and verify all output files are produced with valid structure.
"""
import json
import random
from datetime import date, datetime
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
    from analytics import config as analytics_config
    import analytics.data_loader as _dl

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
        "85_salud":        ["mascarillas", "guantes latex", "gasa esteril", "termometros"],
    }
    all_proveedores = [f"P{i:03d}" for i in range(20)]

    prov_focus = {}
    rubros = list(rubros_productos.keys())
    for p in all_proveedores:
        prov_focus[p] = random.sample(rubros, k=random.choice([1, 2]))

    def gen_oc_row(year, month, idx):
        p = random.choice(all_proveedores)
        rubro = random.choice(prov_focus[p])
        prod = random.choice(rubros_productos[rubro])
        lic = f"L-{year}{month:02d}-{idx:04d}" if random.random() > 0.2 else None
        return {
            "Codigo": f"OC-{year}{month:02d}-{idx:04d}",
            "FechaCreacion": datetime(year, month, random.randint(1, 28)),
            "CodigoProveedor": p,
            "NombreProveedor": f"Prov {p}",
            "NombreroductoGenerico": prod,
            "Nombre": prod + " producto",
            "CodigoLicitacion": lic,
        }

    # Generate 28 months of OC (2024-01 through 2026-04) with ~80 OCs/month
    for year in [2024, 2025, 2026]:
        for month in range(1, 13):
            if year == 2026 and month > 4:
                continue
            rows = [gen_oc_row(year, month, i) for i in range(80)]
            pl.DataFrame(rows).write_parquet(oc_dir / f"{year}-{month}.parquet")

    # LIC parquets: winners from OC + 2-3 losers each
    for year in [2024, 2025, 2026]:
        for month in range(1, 13):
            p = oc_dir / f"{year}-{month}.parquet"
            if not p.exists():
                continue
            df = pl.read_parquet(p)
            winners = df.filter(pl.col("CodigoLicitacion").is_not_null())
            lic_rows = []
            for r in winners.iter_rows(named=True):
                lic_rows.append({
                    "CodigoExterno": r["CodigoLicitacion"],
                    "Nombre": r["Nombre"],
                    "FechaCreacion": r["FechaCreacion"],
                    "CodigoProveedor": r["CodigoProveedor"],
                    "NombreProveedor": r["NombreProveedor"],
                    "Oferta seleccionada": True,
                })
                losers = [q for q in random.sample(all_proveedores, k=3) if q != r["CodigoProveedor"]][:2]
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
    monkeypatch.setattr(_dl, "OC_PARQUET_DIR", oc_dir)
    monkeypatch.setattr(_dl, "LIC_PARQUET_DIR", lic_dir)
    return {"oc_dir": oc_dir, "lic_dir": lic_dir}


def test_end_to_end_tfidf_matcher_holdout(rich_synthetic_data, tmp_path):
    from analytics.evaluation import reporter, runner
    from analytics.evaluation.evaluators.tfidf_matcher import TfidfMatcherEvaluable  # noqa

    json_base = tmp_path / "json"
    md_base = tmp_path / "md"

    results = runner.run_evaluation(
        model_name="tfidf_matcher",
        variant=VariantConfig(name="baseline", params={
            **TfidfMatcherEvaluable.default_variant.params,
            "min_df": 1,  # relax for sparse synthetic data
        }),
        split_strategy="holdout",
        today=date(2026, 4, 14),
        skip_leakage_check=True,
    )
    assert len(results) == 1
    r = results[0]
    expected = {
        "ndcg_at_10", "ndcg_at_20",
        "hit_at_5_winner", "hit_at_10_winner", "hit_at_20_winner",
        "hit_at_10_participant",
        "mrr", "coverage_at_10",
    }
    assert set(r.metrics.keys()) == expected
    for k, v in r.metrics.items():
        assert 0.0 <= v <= 1.0, f"{k} out of [0,1]: {v}"

    json_path = reporter.write_result_json(results, json_base, "holdout")
    md_path = reporter.write_result_markdown(results, md_base, "holdout")

    data = json.loads(json_path.read_text(encoding="utf-8"))
    assert data["model_name"] == "tfidf_matcher"
    assert data["splits"][0]["metrics"]["ndcg_at_10"] == pytest.approx(r.metrics["ndcg_at_10"])
    assert "ngram_range" in md_path.read_text(encoding="utf-8")
