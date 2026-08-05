"""CLI entry for the evaluation harness.

Usage:
  python -m analytics.evaluation --model tfidf_matcher
  python -m analytics.evaluation --model tfidf_matcher --walk-forward
  python -m analytics.evaluation --model tfidf_matcher --variant-file path/to/v.yaml
  python -m analytics.evaluation --model tfidf_matcher --compare baseline:baseline other.yaml
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date
from pathlib import Path

import yaml

from analytics.evaluation import (
    evaluators,  # noqa: F401 — triggers registration
    registry,
    reporter,
    runner,
)
from analytics.evaluation.base import VariantConfig

logger = logging.getLogger(__name__)

EVAL_OUTPUT_JSON_BASE = Path("etl/data/analytics/evals")
EVAL_OUTPUT_MD_BASE = Path("docs/analytics/evals")
VARIANTS_DIR = Path(__file__).parent / "variants"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="analytics.evaluation")
    p.add_argument("--model", required=True, help="Registered model name")
    p.add_argument("--variant", default="baseline", help="Named variant (default: baseline)")
    p.add_argument(
        "--variant-file", type=Path, dest="variant_file", help="YAML with {name, params}"
    )
    p.add_argument("--walk-forward", action="store_true", help="Use walk-forward split")
    p.add_argument("--test-months", type=int, default=12, dest="test_months")
    p.add_argument("--n-folds", type=int, default=4, dest="n_folds")
    p.add_argument("--fold-months", type=int, default=6, dest="fold_months")
    p.add_argument("--compare", nargs=2, metavar=("A", "B"))
    p.add_argument("--dry-run", action="store_true", dest="dry_run")
    p.add_argument("--keep-artifacts", action="store_true", dest="keep_artifacts")
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
    candidate = VARIANTS_DIR / f"{model_name}_{variant_arg}.yaml"
    if candidate.exists():
        return load_variant_yaml(candidate)
    raise FileNotFoundError(
        f"Variant '{variant_arg}' not found; looked for {candidate} and no --variant-file passed."
    )


def _resolve_compare_arg(model: str, arg: str) -> VariantConfig:
    p = Path(arg)
    if p.suffix in (".yaml", ".yml") and p.exists():
        return load_variant_yaml(p)
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
            args.model,
            variant_a,
            split_strategy,
            today,
            n_folds=args.n_folds,
            fold_months=args.fold_months,
            test_months=args.test_months,
        )
        res_b = runner.run_evaluation(
            args.model,
            variant_b,
            split_strategy,
            today,
            n_folds=args.n_folds,
            fold_months=args.fold_months,
            test_months=args.test_months,
        )
        reporter.write_result_json(res_a, EVAL_OUTPUT_JSON_BASE, split_strategy)
        reporter.write_result_json(res_b, EVAL_OUTPUT_JSON_BASE, split_strategy)
        reporter.write_result_markdown(res_a, EVAL_OUTPUT_MD_BASE, split_strategy)
        reporter.write_result_markdown(res_b, EVAL_OUTPUT_MD_BASE, split_strategy)
        cls = registry.get(args.model)
        md_path = reporter.write_comparison_markdown(
            res_a,
            res_b,
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
        args.model,
        variant,
        split_strategy,
        today,
        n_folds=args.n_folds,
        fold_months=args.fold_months,
        test_months=args.test_months,
    )
    json_path = reporter.write_result_json(results, EVAL_OUTPUT_JSON_BASE, split_strategy)
    md_path = reporter.write_result_markdown(results, EVAL_OUTPUT_MD_BASE, split_strategy)
    print(f"JSON:     {json_path}")
    print(f"Markdown: {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
