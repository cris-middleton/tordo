"""Evaluable implementation for the TF-IDF semantic matcher."""
from __future__ import annotations

import logging
import tempfile
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

from analytics import tfidf_matcher as model
from analytics.data_loader import iter_lic_parquets, iter_oc_parquets
from analytics.evaluation import metrics
from analytics.evaluation.base import Evaluable, SplitWindow, VariantConfig
from analytics.evaluation.registry import register

logger = logging.getLogger(__name__)


@register
class TfidfMatcherEvaluable(Evaluable):
    name = "tfidf_matcher"
    default_variant = VariantConfig(
        name="baseline",
        params={
            "ngram_range": (1, 2),
            "max_features": 20000,
            "min_df": 5,
            "max_df": 0.8,
            "sublinear_tf": True,
            "strip_accents": "unicode",
            "token_pattern": r"(?u)\b\w{3,}\b",
        },
    )
    supported_splits = ["holdout", "walk_forward"]
    primary_metric = "ndcg_at_10"
    secondary_metrics = [
        "hit_at_10_winner", "hit_at_10_participant",
        "mrr", "ndcg_at_20", "coverage_at_10",
    ]

    def train(self, window: SplitWindow, variant: VariantConfig) -> dict[str, Any]:
        corpus = model.build_provider_corpus(max_date=window.train_end)
        if corpus.is_empty():
            raise RuntimeError(
                f"Training corpus empty for window ending {window.train_end}"
            )
        tmpdir = Path(tempfile.mkdtemp(prefix="eval_tfidf_"))
        params = dict(variant.params)
        if "ngram_range" in params:
            params["ngram_range"] = tuple(params["ngram_range"])
        return model.train_tfidf_model(corpus, output_dir=tmpdir, **params)

    def predict(self, artifact: dict[str, Any], window: SplitWindow, top_k: int = 50) -> pl.DataFrame:
        """Batch retrieval: vectorize all test licitación names, compute cosine
        similarity against the provider matrix, emit top-k per query.
        """
        from sklearn.metrics.pairwise import cosine_similarity

        vectorizer = artifact["vectorizer"]
        prov_matrix = artifact["matrix"]
        index = artifact["index"]

        lics = self._load_test_licitaciones(window.test_start, window.test_end)
        if lics.is_empty():
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8,
                        "rank": pl.Int64, "score": pl.Float64}
            )

        query_ids = lics["CodigoExterno"].to_list()
        texts = [model._clean_text(t or "") for t in lics["Nombre"].to_list()]

        mask = [len(t.split()) >= 3 for t in texts]
        query_ids = [q for q, ok in zip(query_ids, mask) if ok]
        texts = [t for t, ok in zip(texts, mask) if ok]
        if not texts:
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8,
                        "rank": pl.Int64, "score": pl.Float64}
            )

        query_matrix = vectorizer.transform(texts)
        sims = cosine_similarity(query_matrix, prov_matrix)

        prov_codes = index.sort("matrix_row")["CodigoProveedor"].to_list()
        rows: list[dict] = []
        top_k_clipped = min(top_k, sims.shape[1])
        for qi, qid in enumerate(query_ids):
            scores = sims[qi]
            top_idx = np.argsort(scores)[-top_k_clipped:][::-1]
            for rank, idx in enumerate(top_idx, start=1):
                s = float(scores[idx])
                if s < 0.01:
                    break
                rows.append({
                    "query_id": qid,
                    "item_id": prov_codes[int(idx)],
                    "rank": rank,
                    "score": s,
                })
        if not rows:
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8,
                        "rank": pl.Int64, "score": pl.Float64}
            )
        return pl.DataFrame(rows)

    def ground_truth(self, window: SplitWindow) -> pl.DataFrame:
        """Build graded-relevance ground truth: winners (rel=2) + losers (rel=1)."""
        winners = self._winners_from_oc(window.test_start, window.test_end)
        participants = self._participants_from_lic(window.test_start, window.test_end)

        if winners.is_empty() and participants.is_empty():
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8, "relevance": pl.Int64}
            )

        if participants.is_empty():
            return winners.with_columns(pl.lit(2).alias("relevance"))
        if winners.is_empty():
            return pl.DataFrame(
                schema={"query_id": pl.Utf8, "item_id": pl.Utf8, "relevance": pl.Int64}
            )

        winners_marked = winners.with_columns(pl.lit(2).alias("relevance"))
        participants_marked = participants.with_columns(pl.lit(1).alias("relevance"))

        combined = pl.concat(
            [winners_marked, participants_marked], how="vertical_relaxed"
        ).unique(subset=["query_id", "item_id"], keep="first")
        return combined.select(["query_id", "item_id", "relevance"])

    def compute_metrics(self, preds: pl.DataFrame, truth: pl.DataFrame) -> dict[str, float]:
        if preds.is_empty():
            return {m: 0.0 for m in [self.primary_metric] + self.secondary_metrics}

        catalog_size = preds["item_id"].n_unique()
        return {
            "ndcg_at_10":            metrics.ndcg_at_k(preds, truth, k=10),
            "ndcg_at_20":            metrics.ndcg_at_k(preds, truth, k=20),
            "hit_at_5_winner":       metrics.hit_at_k(preds, truth, k=5,  relevance_min=2),
            "hit_at_10_winner":      metrics.hit_at_k(preds, truth, k=10, relevance_min=2),
            "hit_at_20_winner":      metrics.hit_at_k(preds, truth, k=20, relevance_min=2),
            "hit_at_10_participant": metrics.hit_at_k(preds, truth, k=10, relevance_min=1),
            "mrr":                   metrics.mrr(preds, truth, k=100),
            "coverage_at_10":        metrics.coverage_at_k(preds, k=10, catalog_size=catalog_size),
        }

    def _winners_from_oc(self, start: date, end: date) -> pl.DataFrame:
        rows: list[dict] = []
        for _periodo, df in iter_oc_parquets(
            columns=["CodigoLicitacion", "CodigoProveedor", "FechaCreacion"],
            min_year=start.year,
        ):
            if df.is_empty():
                continue
            filt = df.filter(
                pl.col("FechaCreacion").cast(pl.Date).is_between(start, end, closed="both")
                & pl.col("CodigoLicitacion").is_not_null()
                & pl.col("CodigoProveedor").is_not_null()
            )
            for r in filt.iter_rows(named=True):
                rows.append({"query_id": r["CodigoLicitacion"], "item_id": r["CodigoProveedor"]})
        if not rows:
            return pl.DataFrame(schema={"query_id": pl.Utf8, "item_id": pl.Utf8})
        return pl.DataFrame(rows).unique(subset=["query_id", "item_id"])

    def _participants_from_lic(self, start: date, end: date) -> pl.DataFrame:
        rows: list[dict] = []
        for _periodo, df in iter_lic_parquets(
            columns=["CodigoExterno", "CodigoProveedor", "FechaCreacion", "Oferta seleccionada"],
            min_year=start.year,
        ):
            if df.is_empty() or "CodigoProveedor" not in df.columns:
                continue
            filt = df.filter(
                pl.col("FechaCreacion").cast(pl.Date).is_between(start, end, closed="both")
                & pl.col("CodigoProveedor").is_not_null()
            )
            for r in filt.iter_rows(named=True):
                rows.append({"query_id": r["CodigoExterno"], "item_id": r["CodigoProveedor"]})
        if not rows:
            return pl.DataFrame(schema={"query_id": pl.Utf8, "item_id": pl.Utf8})
        return pl.DataFrame(rows).unique(subset=["query_id", "item_id"])

    def _load_test_licitaciones(self, start: date, end: date) -> pl.DataFrame:
        """Unique licitaciones in test window with Nombre and CodigoExterno."""
        rows: list[dict] = []
        seen: set[str] = set()
        for _periodo, df in iter_lic_parquets(
            columns=["CodigoExterno", "Nombre", "FechaCreacion"],
            min_year=start.year,
        ):
            if df.is_empty():
                continue
            filt = df.filter(
                pl.col("FechaCreacion").cast(pl.Date).is_between(start, end, closed="both")
                & pl.col("CodigoExterno").is_not_null()
                & pl.col("Nombre").is_not_null()
            )
            for r in filt.iter_rows(named=True):
                if r["CodigoExterno"] in seen:
                    continue
                seen.add(r["CodigoExterno"])
                rows.append({"CodigoExterno": r["CodigoExterno"], "Nombre": r["Nombre"]})
        if not rows:
            return pl.DataFrame(schema={"CodigoExterno": pl.Utf8, "Nombre": pl.Utf8})
        return pl.DataFrame(rows)
