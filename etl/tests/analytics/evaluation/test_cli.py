from analytics.evaluation import cli


def test_parser_defaults():
    args = cli.build_parser().parse_args(["--model", "tfidf_matcher"])
    assert args.model == "tfidf_matcher"
    assert args.variant == "baseline"
    assert not args.walk_forward
    assert args.test_months == 12


def test_parser_walk_forward_flag():
    args = cli.build_parser().parse_args(
        [
            "--model",
            "tfidf_matcher",
            "--walk-forward",
        ]
    )
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
    # Import evaluators to trigger registration
    import analytics.evaluation.evaluators  # noqa

    variant = cli.resolve_variant(
        model_name="tfidf_matcher", variant_arg="baseline", variant_file=None
    )
    assert variant.name == "baseline"
    assert variant.params["ngram_range"] == (1, 2)
