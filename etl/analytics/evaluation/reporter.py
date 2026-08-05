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
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
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
    all_keys = sorted({k for r in results for k in r.metrics})
    agg = {}
    for k in all_keys:
        values = [r.metrics[k] for r in results if k in r.metrics]
        if not values:
            continue
        mean = sum(values) / len(values)
        if len(values) > 1:
            var = sum((v - mean) ** 2 for v in values) / len(values)
            std = var**0.5
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


def write_result_json(results: list[EvaluationResult], base_dir: Path, split_strategy: str) -> Path:
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
            cells = " | ".join(f"{r.metrics.get(k, float('nan')):.4f}" for k in agg)
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
