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
    # 15 rows with varied text so min_df=5 / max_df=0.8 don't prune everything.
    # "papel" appears 8 times (53 % of docs): passes both thresholds.
    texts = [
        "papel limpieza escritorio cuaderno marcador",
        "papel oficina resma impresora",
        "papel higienico dispensador",
        "papel carta formato",
        "papel bond blanco",
        "papel continuo formulario",
        "papel kraft embalaje",
        "papel filtro laboratorio",
        "limpieza aseo detergente industrial",
        "limpieza hospitalaria desinfectante cloro",
        "computadores notebooks pantalla teclado",
        "computadores laptops procesador memoria",
        "servicio mantención equipos maquinaria",
        "insumos medicos guantes mascarilla",
        "mobiliario escritorios sillas oficina",
    ]
    corpus = pl.DataFrame({
        "CodigoProveedor": [f"P{i}" for i in range(15)],
        "NombreProveedor": [f"Prov{i}" for i in range(15)],
        "corpus_text": texts,
        "n_oc": [5] * 15,
    })
    result = tfidf_matcher.train_tfidf_model(corpus, output_dir=tmp_path)
    v = result["vectorizer"]
    assert v.ngram_range == (1, 2)
    assert v.max_features == 20000
    assert v.sublinear_tf is True
