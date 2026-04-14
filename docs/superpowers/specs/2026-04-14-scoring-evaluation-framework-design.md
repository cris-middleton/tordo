# Scoring & Analytics Evaluation Framework — Design Spec

**Fecha**: 2026-04-14
**Autor**: brainstorming session con Claude Code
**Status**: Diseño aprobado, pendiente de plan de implementación
**Sub-proyecto**: C (Modelos de ML / scoring) — meta-spec del framework
**Specs hijas que lo consumen**: G1 (Matching v2), G2 (Weighted scores v2), G3 (Predictive analytics v2)

---

## 1. Contexto y motivación

TORDO tiene ~10 modelos analíticos predictivos/descriptivos agrupables por técnica:

- **G1 — Matching/Ranking**: `tfidf_matcher`, `word_clustering` (retrieval TF-IDF).
- **G2 — Weighted scores**: `opportunity_scorer`, `buyer_scoring`, `provider_diversification` (suma ponderada con pesos fijos + min-max).
- **G3 — Predicción/Forecast**: `trend_analysis` (CAGR), `competitor_predictor`, `preparation_window`, `discount_optimizer`.
- **G4 — Descriptivos puros** (fuera de scope de esta iniciativa): `seasonality`, `price_benchmarking`, `competitor_analysis`, `sector_intelligence`, `buyer_transparency`, `product_price_bands`.

Todos los modelos de G1/G2/G3 tienen margen de mejora técnica real. Antes de tocarlos, el equipo decidió construir primero un **framework común de evaluación offline** que permita:

1. Establecer baselines reproducibles.
2. Comparar variantes antes de mergear (tuning de hiperparámetros, features nuevas, ensembles).
3. Commitear evidencia en git para que cualquier cambio de modelo deje trazabilidad auditable.

Sin este framework, cada spec hija reimplementaría su propio train/test split, métricas y formato de resultados, y las mejoras no serían comparables entre sí ni en el tiempo.

**Decisión previa tomada en brainstorming** (ruta β): esta spec es upstream; después de ella, G1/G2/G3 se escriben y ejecutan de forma independiente reutilizando lo que se construye acá.

---

## 2. Objetivos (scope in)

1. Paquete nuevo `etl/analytics/evaluation/` con: protocolo `Evaluable`, biblioteca de métricas, particionador temporal, registry, runner, reporter, CLI.
2. Refactor mínimo de `etl/analytics/data_loader.py` — parámetro `max_date` en iteradores de parquets.
3. Refactor mínimo de `etl/analytics/tfidf_matcher.py` — `max_date` en builder de corpus + kwargs de hiperparámetros en trainer.
4. Evaluator de referencia: `TfidfMatcherEvaluable`, registrado, ejecutable.
5. Primer baseline ejecutado y commiteado: `docs/analytics/evals/tfidf_matcher/<fecha>_baseline.md` + `.json`. Este archivo es el punto de partida objetivo para G1.
6. Carpeta `etl/analytics/evaluation/variants/` con YAML de ejemplo.
7. Un smoke test pytest del harness end-to-end sobre parquet sintético.

## 3. No-objetivos (scope out)

Los siguientes se posponen explícitamente. Cada uno tiene su home claro.

**Spec G1 — Matching v2** (separada):
- Tuning de hiperparámetros TF-IDF (ngram_range, max_df, min_df, max_features).
- BM25 como segundo ranker; ensemble TF-IDF + BM25 (RRF o ponderación lineal).
- Expansión del corpus de training: incluir `Nombre` de OC, `RubroN1/N2/N3`, `Categoria`, y oferentes perdedores desde LIC.
- Features adicionales: recency decay, regional match, organismo-affinity priors.
- Evaluación offline de `sentence-transformers/paraphrase-multilingual-MiniLM-L6-v2` contra el baseline.
- Recalibración de umbrales `alto/medio/bajo` basada en percentiles del score en test.
- Evaluator para `word_clustering` si G1 lo necesita como input.

**Spec G2 — Weighted scores v2** (separada):
- Evaluators para `opportunity_scorer`, `buyer_scoring`, `provider_diversification`.
- Definición e implementación concreta de los proxies predictivos declarados en §5.2.
- Normalización robusta (quantile-based en lugar de min-max).
- Pesos data-driven via regresión/ranking contra el proxy.
- Convertir stubs de métricas G2 (`spearman`, `reliability_diagram`, `brier_score`, `calibration_error`) en implementaciones reales.

**Spec G3 — Predictive analytics v2** (separada):
- Evaluators para `trend_analysis`, `competitor_predictor`, `preparation_window`, `discount_optimizer`.
- Convertir stubs de métricas G3 (`mae`, `mape`, `interval_coverage`) en implementaciones reales.
- Concept drift detection usando walk-forward.

**Nunca en scope de ninguna de estas specs**:
- Integración con CI/CD (no existe CI hoy; discusión separada cuando se monte).
- Monitoring en producción / alertas cuando métricas degradan.
- Endpoint `/api/bi/model_health`.
- Sentence-transformers *en producción* — solo evaluado offline en G1; migración a producción requeriría análisis de OPEX aparte.
- Cambios a los 6 módulos descriptivos de G4.

---

## 4. Arquitectura

### 4.1 Layout del paquete

```
etl/analytics/evaluation/
├── __init__.py
├── base.py            # Protocol Evaluable + dataclasses (SplitWindow, VariantConfig, EvaluationResult)
├── metrics.py         # ndcg_at_k, hit_at_k, mrr, coverage_at_k (impl); spearman, brier, mae (stubs)
├── splits.py          # build_holdout_split(), build_walk_forward_splits()
├── registry.py        # REGISTRY: dict[str, type[Evaluable]] — mapeo nombre → clase
├── runner.py          # orquestador: carga modelo, corre splits, agrega métricas
├── reporter.py        # escribe .md + .json a docs/ y etl/data/
├── cli.py             # entry point `python -m etl.analytics.evaluation`
├── variants/
│   └── tfidf_baseline.yaml
└── evaluators/
    ├── __init__.py
    └── tfidf_matcher.py   # único implementado en esta spec
```

### 4.2 Contrato `Evaluable`

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import Any

@dataclass
class SplitWindow:
    train_start: date
    train_end: date     # inclusivo
    test_start: date
    test_end: date

@dataclass
class VariantConfig:
    """Hiperparámetros del modelo. Dict arbitrario; cada Evaluable decide qué usa."""
    name: str
    params: dict

@dataclass
class EvaluationResult:
    model_name: str
    variant: VariantConfig
    split_id: str
    metrics: dict[str, float]
    metadata: dict

class Evaluable(ABC):
    name: str
    default_variant: VariantConfig
    supported_splits: list[str]     # ["holdout", "walk_forward"]
    primary_metric: str             # métrica principal para decisión de merge (ej. "ndcg_at_10")
    secondary_metrics: list[str]    # métricas secundarias monitoreadas para regresión

    @abstractmethod
    def train(self, window: SplitWindow, variant: VariantConfig) -> Any:
        """Entrena con datos cuya FechaCreacion <= window.train_end. Retorna artefacto opaco."""

    @abstractmethod
    def predict(self, artifact: Any, window: SplitWindow) -> "pl.DataFrame":
        """Aplica artefacto a eventos en [window.test_start, window.test_end].
        Columnas esperadas por tipo de modelo:
          - Retrieval (G1): [query_id, item_id, rank, score]
          - Weighted score (G2): [entity_id, score_predicted]
          - Forecast (G3): [entity_id, prediction, prediction_std]
          - Clasificación: [entity_id, class_predicted, prob_predicted]
        """

    @abstractmethod
    def ground_truth(self, window: SplitWindow) -> "pl.DataFrame":
        """Construye ground truth observado en el test window. Columnas complementarias a predict()."""

    @abstractmethod
    def compute_metrics(
        self, predictions: "pl.DataFrame", truth: "pl.DataFrame"
    ) -> dict[str, float]:
        """Calcula métricas usando funciones de evaluation.metrics."""
```

### 4.3 CLI

```bash
# Baseline holdout simple (default)
python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline

# Walk-forward (4 folds por default)
python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline --walk-forward

# Variante custom (archivo YAML)
python -m etl.analytics.evaluation --model tfidf_matcher --variant-file variants/tfidf_ngram13.yaml

# Comparación directa de dos variantes
python -m etl.analytics.evaluation --model tfidf_matcher \
    --compare baseline:baseline variants/tfidf_ngram13.yaml

# Debugging: mantiene artefactos temporales
python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline --keep-artifacts

# Validar config sin entrenar
python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline --dry-run
```

### 4.4 Fork arquitectónico resuelto

**Refactor in-place** de los módulos analíticos (no adapter pattern). Los builders existentes reciben `max_date: date | None = None` como nuevo parámetro con default preservando el comportamiento actual. Razón: el código ya filtra parcialmente por tiempo (`iter_oc_parquets(min_year=2018)`); agregar `max_date` son una o dos líneas. Un adapter pattern duplicaría la lógica de corpus-building y entrenamiento, y cada cambio futuro habría que replicarlo en dos lugares.

---

## 5. Data flow y splits temporales

### 5.1 Regla base

El filtro temporal se aplica sobre `FechaCreacion` del registro, **no** sobre el nombre del archivo parquet. Un parquet `2024-3.parquet` puede contener OCs con `FechaCreacion` tardía de febrero por ingesta lenta; usar nombre de archivo introduciría leakage de futuro.

### 5.2 Holdout simple (default)

```
HOY = fecha de ejecución del harness
T = HOY - 12 meses  (parametrizable vía --test-months N)

train_window: FechaCreacion ∈ [2018-01-01, T - 1 día]
test_window:  FechaCreacion ∈ [T, HOY]
```

**Constantes en `evaluation/base.py`** (override vía CLI):

- `EVAL_MIN_YEAR = 2018` — datos 2010-2017 son ruidosos para modelos predictivos (cambios estructurales grandes en Mercado Público, datos incompletos).
- `EVAL_TEST_MONTHS = 12` — asegura ~500K eventos en test (Chile genera ~500K OCs/año), suficiente incluso estratificando por rubro.

### 5.3 Walk-forward (flag `--walk-forward`)

```
HOY = fecha de ejecución
n_folds = 4, fold_duration = 6 meses  (parametrizables)

fold_1: train [2018..HOY-30m] → test [HOY-30m..HOY-24m]
fold_2: train [2018..HOY-24m] → test [HOY-24m..HOY-18m]
fold_3: train [2018..HOY-18m] → test [HOY-18m..HOY-12m]
fold_4: train [2018..HOY-12m] → test [HOY-12m..HOY]
```

**Agregación**: media ± desviación estándar por métrica. Cada fold individual se guarda en el JSON para inspección de drift.

**Alerta de variancia alta**: si `std > 0.3 * mean` en cualquier métrica principal, el harness imprime warning en stderr ("métrica inestable entre folds") pero no aborta. Queda documentado en el markdown.

### 5.4 Flujo de ejecución

```
CLI recibe: --model M --variant V [--walk-forward]
 │
 ├─ runner.py carga REGISTRY[M] → instancia Evaluable
 ├─ splits.py genera lista de SplitWindow (1 para holdout, 4 para walk-forward)
 │
 └─ por cada SplitWindow:
     ├─ evaluable.train(window, variant)        → artefacto opaco
     ├─ _assert_no_future_leakage(artifact, window)  # smoke test invariante
     ├─ evaluable.predict(artefacto, window)    → DataFrame predicciones
     ├─ evaluable.ground_truth(window)          → DataFrame ground truth
     ├─ evaluable.compute_metrics(preds, truth) → dict de métricas
     └─ EvaluationResult(...) → lista acumulada
 │
 ├─ reporter.py agrega, escribe .md + .json
 └─ stdout: tabla resumida (comparativa si --compare)
```

### 5.5 Costo y artefactos temporales

Entrenamiento de `tfidf_matcher` sobre ~7 años de historial toma ~3-5 min (corpus ~100K proveedores, vocab 20K). Holdout = ~5 min. Walk-forward de 4 folds = ~20 min. Aceptable — es herramienta de tuning, no loop iterativo.

**Artefactos temporales**: `train()` escribe a un `tempfile.mkdtemp()`. **No toca** `etl/data/analytics/` (producción). Se descartan al finalizar salvo `--keep-artifacts`.

---

## 6. Biblioteca de métricas

### 6.1 Implementadas en esta spec (G1 / retrieval)

```python
# evaluation/metrics.py
def ndcg_at_k(preds: pl.DataFrame, truth: pl.DataFrame, k: int) -> float
def hit_at_k(preds: pl.DataFrame, truth: pl.DataFrame, k: int, relevance_min: int = 1) -> float
def mrr(preds: pl.DataFrame, truth: pl.DataFrame, k: int = 100) -> float
def coverage_at_k(preds: pl.DataFrame, truth: pl.DataFrame, k: int) -> float
    # Cobertura de catálogo: items distintos en top-K / total items en catálogo.
```

### 6.2 Declaradas como stubs (G2 / G3)

Stubs lanzan `NotImplementedError` con docstring que indica la spec que los implementará:

```python
def spearman(score, proxy): raise NotImplementedError("Implementar en spec G2")
def reliability_diagram(score, binary_outcome, n_bins=10): raise NotImplementedError("Implementar en spec G2")
def brier_score(prob, binary_outcome): raise NotImplementedError("Implementar en spec G2")
def calibration_error(score_bins, observed_rates): raise NotImplementedError("Implementar en spec G2")

def mae(pred, actual): raise NotImplementedError("Implementar en spec G3")
def mape(pred, actual, epsilon=1.0): raise NotImplementedError("Implementar en spec G3")
def interval_coverage(low, high, actual): raise NotImplementedError("Implementar en spec G3")
```

Justificación: fijar las firmas y nombres ahora evita que G2/G3 reinventen naming, y el stub con docstring es autodocumentación.

---

## 7. Formato de resultados

**Nota sobre serialización**: los hiperparámetros que en Python son tuplas (ej. `ngram_range=(1, 2)`) se almacenan como arrays JSON/YAML (`[1, 2]`) y se reconstruyen como tuplas al cargarse desde archivo. El evaluator es responsable de esta conversión — el usuario que escribe `variants/*.yaml` usa sintaxis de array nativo de YAML.

### 7.1 JSON (consumible por máquina)

Ruta: `etl/data/analytics/evals/<model>/<YYYY-MM-DD>_<variant>.json`

```json
{
  "model_name": "tfidf_matcher",
  "variant": {
    "name": "baseline",
    "params": {
      "ngram_range": [1, 2],
      "max_features": 20000,
      "min_df": 5,
      "max_df": 0.8,
      "sublinear_tf": true
    }
  },
  "run_metadata": {
    "run_at": "2026-04-14T15:30:22-03:00",
    "git_commit": "a1b2c3d",
    "git_branch": "feature/scoring-v2-framework",
    "host": "dev-local",
    "python_version": "3.11.7",
    "harness_version": "0.1.0",
    "exclusions": {
      "cold_start_winner": 12384,
      "short_text": 2891,
      "no_winner_observed": 4502,
      "n_valid_queries": 47123
    }
  },
  "split_strategy": "holdout",
  "splits": [
    {
      "split_id": "holdout_2025-04-14_2026-04-14",
      "train_window": {"start": "2018-01-01", "end": "2025-04-13"},
      "test_window":  {"start": "2025-04-14", "end": "2026-04-14"},
      "n_train_events": 3421567,
      "n_test_events": 512394,
      "train_duration_s": 287.4,
      "predict_duration_s": 124.8,
      "metrics": {
        "ndcg_at_10": 0.412,
        "ndcg_at_20": 0.458,
        "hit_at_10_winner": 0.371,
        "hit_at_10_participant": 0.489,
        "mrr": 0.194,
        "coverage_at_10": 0.683
      },
      "metrics_by_segment": {
        "by_rubro_n1": {
          "01_agricultura": {"ndcg_at_10": 0.51, "n": 12384},
          "43_tecnologia":  {"ndcg_at_10": 0.34, "n": 45219}
        }
      }
    }
  ],
  "aggregate_metrics": {
    "ndcg_at_10": {"mean": 0.412, "std": null},
    "hit_at_10_winner": {"mean": 0.371, "std": null}
  },
  "warnings": []
}
```

Walk-forward: array `splits` con 4 entradas; `aggregate_metrics` incluye `std` real.

### 7.2 Markdown (auditable en PR)

Ruta: `docs/analytics/evals/<model>/<YYYY-MM-DD>_<variant>.md`. Plantilla auto-generada por `reporter.py` con: header (fecha, git, split, variante), tabla de configuración, tabla de métricas principales, desglose por RubroN1 (top/bottom 5), ventana de evaluación, cuenta de exclusiones, warnings del harness.

### 7.3 Markdown de comparación (`--compare`)

Ruta: `docs/analytics/evals/<model>/<YYYY-MM-DD>_compare_<A>_vs_<B>.md`. Tabla lado-a-lado con Δ y Δ%:

| Métrica | baseline | ngram13 | Δ | Δ% |
|---|---|---|---|---|
| **NDCG@10** | 0.412 | **0.438** | +0.026 | +6.3% |
| Hit@10_winner | 0.371 | 0.384 | +0.013 | +3.5% |

Regla de highlighting: **bold** en la columna ganadora si `|Δ%| ≥ 1%`; sin bold y con nota "diferencia no significativa" si `< 1%`.

---

## 8. Evaluator de referencia: `tfidf_matcher`

### 8.1 Ground truth con relevancia graduada

Para cada **licitación** con `FechaCreacion ∈ [test_start, test_end]`:

| Proveedor | Relevancia | Criterio |
|---|---|---|
| Ganó una OC derivada de la licitación (OC en test window con `CodigoLicitacion == CodigoExterno`) | **2** | Prueba máxima de encaje |
| Ofertó y perdió (fila en LIC con `Oferta seleccionada = false`) | **1** | Compitió realmente |
| No participó | 0 | Sin señal |

NDCG con relevancia graduada: numerador `2^rel - 1` (ganador pesa 3, perdedor pesa 1).

**Dos sabores de Hit@k**:
- `hit_at_10_winner` — solo cuenta si un ganador (rel=2) está en top-10.
- `hit_at_10_participant` — cuenta si cualquier relevante (rel≥1) está en top-10.

**Assumption check runtime**: en el primer baseline, el evaluator verifica que `lic/*.parquet` contiene filas con `Oferta seleccionada = false`. Si no (solo están los ganadores), hace fallback a relevancia binaria y lo documenta en el markdown.

### 8.2 Casos de borde

| Caso | Criterio | Manejo |
|---|---|---|
| Cold-start winner | proveedor ganador sin OC en training window | **Incluido en eval, contabilizado como miss** (rank = ∞, contribuye 0 a NDCG y hit@k). Cuenta reportada en `metadata.exclusions.cold_start_winner`. |
| Texto de licitación muy corto | después de `_clean_text()`, <3 tokens útiles | Excluido del set de queries. Cuenta en `short_text`. |
| Licitación sin OC en test window | no hay ganador observable | Excluida. Cuenta en `no_winner_observed`. |
| OC directa (sin licitación) | `CodigoLicitacion` is null | No aplica a retrieval. |

**Justificación de mantener cold-start como miss** (no excluirlos): refleja el comportamiento real que vive el usuario final — el producto pierde silenciosamente a proveedores nuevos. Excluirlos del denominador le daría al baseline una confianza ficticia.

### 8.3 Cambios concretos en código existente

**`etl/analytics/data_loader.py`**:
- `iter_oc_parquets(columns, min_year, max_date: date | None = None)`: filtra `df.filter(pl.col("FechaCreacion") <= max_date)` después del read.
- `iter_lic_parquets(columns, min_year, max_date: date | None = None)`: ídem.
- `scan_oc`, `scan_lic`: mismo cambio (para no romper otros consumidores).

**`etl/analytics/tfidf_matcher.py`**:
- `build_provider_corpus(max_date: date | None = None)`: pasa `max_date` a `iter_oc_parquets`.
- `train_tfidf_model(corpus_df, output_dir: Path = OUTPUT_DIR, **vectorizer_kwargs)`: acepta overrides de hiperparámetros; los defaults actuales (max_features=20000, ngram_range=(1,2), min_df=5, max_df=0.8, sublinear_tf=True, strip_accents="unicode", token_pattern=r"(?u)\b\w{3,}\b") se exponen como kwargs con sus valores actuales.

Sin cambios para `run_all.py` ni Celery tasks: comportamiento idéntico si se llama sin los nuevos kwargs.

### 8.4 `TfidfMatcherEvaluable` — esqueleto

```python
# etl/analytics/evaluation/evaluators/tfidf_matcher.py
from datetime import date
from pathlib import Path
import tempfile
from typing import Any

import polars as pl

from etl.analytics import tfidf_matcher as model
from etl.analytics.evaluation import metrics
from etl.analytics.evaluation.base import Evaluable, SplitWindow, VariantConfig

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
        tmpdir = Path(tempfile.mkdtemp(prefix="eval_tfidf_"))
        return model.train_tfidf_model(corpus, output_dir=tmpdir, **variant.params)

    def predict(self, artifact, window, top_k: int = 50) -> pl.DataFrame:
        lic_df = _load_test_licitaciones(window.test_start, window.test_end)
        # Vectorizar batch completo de queries y calcular cosine similarity una sola vez
        # (no loop Python por query) — eficiencia clave en walk-forward.
        ...

    def ground_truth(self, window) -> pl.DataFrame:
        # Unión de (winners desde OC) + (losers desde LIC.Oferta seleccionada = false)
        ...

    def compute_metrics(self, preds, truth) -> dict[str, float]:
        return {
            "ndcg_at_10": metrics.ndcg_at_k(preds, truth, k=10),
            "ndcg_at_20": metrics.ndcg_at_k(preds, truth, k=20),
            "hit_at_5_winner":      metrics.hit_at_k(preds, truth, k=5,  relevance_min=2),
            "hit_at_10_winner":     metrics.hit_at_k(preds, truth, k=10, relevance_min=2),
            "hit_at_20_winner":     metrics.hit_at_k(preds, truth, k=20, relevance_min=2),
            "hit_at_10_participant": metrics.hit_at_k(preds, truth, k=10, relevance_min=1),
            "mrr": metrics.mrr(preds, truth, k=100),
            "coverage_at_10": metrics.coverage_at_k(preds, truth, k=10),
        }
```

### 8.5 Rangos esperables del baseline

Valores aproximados derivados de literatura de retrieval no-supervisado sobre corpora de procurement público. Son **guard-rail** para detectar bugs de harness, no objetivos.

- NDCG@10 ≈ 0.30 – 0.55
- Hit@10_winner ≈ 0.25 – 0.45
- Hit@10_participant ≈ 0.40 – 0.65
- MRR ≈ 0.15 – 0.30

Si el primer baseline sale fuera de rango (ej. NDCG@10 < 0.05 o > 0.95), el harness imprime warning crítico y el resultado **no** se commitea sin debugging previo.

---

## 9. Contrato de handoff a specs hijas

Cualquier spec hija (G1/G2/G3) debe:

1. **Citar baseline vigente** al inicio: ruta a `docs/analytics/evals/<model>/<fecha>_baseline.md` y el valor numérico de la métrica principal.
2. **Implementar `Evaluable` subclass** si agrega modelos nuevos (ej. `TfidfBM25EnsembleEvaluable`). Los modelos existentes se modifican in-place.
3. **Correr `--compare`** baseline vs. variant propuesto y commitear el markdown resultante en el mismo PR que propone el cambio.
4. **Usar los nombres de métricas ya declarados** en `metrics.py`. Si necesita una métrica G2/G3 que hoy es stub, esa spec la implementa y documenta.
5. **Correr `--walk-forward`** obligatoriamente antes de mergear cualquier cambio con claim de mejora ≥ +0.5%. El holdout simple no basta para cambios sustantivos.

---

## 10. Criterio de merge de variantes

En lugar de un umbral numérico único, se adopta un **árbol de decisión** explícito:

| Situación | Acción |
|---|---|
| Métrica principal mejora ≥ +0.5% **y** walk-forward confirma (`std < 0.3 × mean`) **y** ninguna secundaria regresa > -2% | **Merge directo.** |
| Métrica principal regresa sin historia compensatoria (sin otra secundaria subiendo que justifique el trade-off) | **Rechazo.** |
| Cualquier otro caso (la mayoría real) | **Juicio humano**: el autor del PR escribe un párrafo en la descripción explicando por qué el cambio vale, el reviewer decide. Documentado explícitamente en el PR. |

Justificación de descartar umbral fijo (+1% original): las mejoras reales de ML se stackean — cada hiperparámetro puede aportar +0.3% a +0.5% y el combinado +1.5%. Una regla de "+1% por PR" bloquea la iteración compuesta y empuja a la gente a "pegarle al número" en vez de pensar. Las métricas secundarias son además naturalmente ruidosas; -2% de tolerancia en ellas respeta ese ruido.

**"Métrica principal" y "secundarias" son atributos declarados por cada `Evaluable`** (ver §4.2). Para `tfidf_matcher` la principal es `ndcg_at_10` y las secundarias son el resto. Cada spec hija declara las suyas al agregar evaluators nuevos.

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Refactor de `train_tfidf_model` rompe llamados existentes (`run_all.py`, Celery tasks) | Los kwargs nuevos tienen exactamente los defaults actuales → comportamiento idéntico para llamadores no modificados. Smoke test manual: `python -m etl.analytics.run_all --modulo tfidf_matcher` produce los mismos artefactos que antes del refactor. |
| El baseline sale fuera de rango esperable | Harness imprime warning crítico si NDCG@10 está fuera de [0.05, 0.95]; bloquea el commit de resultados hasta debugging. |
| `lic/*.parquet` no tiene filas de perdedores (solo ganadores) | Evaluator detecta ausencia de filas con `Oferta seleccionada = false` en el primer run, degrada a relevancia binaria, documenta el fallback en el markdown y el JSON. |
| Eval corre 5-20 min y bloquea laptop | Aceptable — es herramienta de tuning, no de loop. `--dry-run` para validar config sin entrenar. |
| Framework over-engineered para un solo consumidor al momento de shipear | Aceptado como apuesta explícita de la ruta β — el diseño se valida con tfidf_matcher y G2/G3 lo reutilizan sin rediseño. Si G2 descubre que necesita una primitiva que el framework no provee, la agrega; no es un fracaso. |
| Paso de `max_date` no se propaga correctamente y el harness entrena con datos del futuro (leakage) | Función `_assert_no_future_leakage(artifact, window)` ejecutada después de cada `train()` verifica que el vocabulario y los registros usados tienen fechas ≤ `train_end`. Falla ruidosa, no silenciosa. |

---

## 12. Criterio de aceptación

La spec está implementada cuando:

1. El comando `python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline` corre sin error y produce archivos en las dos rutas esperadas.
2. El comando `python -m etl.analytics.evaluation --model tfidf_matcher --variant baseline --walk-forward` corre sin error y produce 4 folds + agregado.
3. El comando `python -m etl.analytics.run_all --modulo tfidf_matcher` (producción) produce artefactos idénticos a los producidos antes del refactor (verificado con `diff` de joblib/npz/parquet).
4. `docs/analytics/evals/tfidf_matcher/2026-04-XX_baseline.md` está committed con métricas dentro del rango esperable.
5. Un smoke test pytest (`tests/analytics/evaluation/test_harness_smoke.py`) corre el harness sobre un parquet sintético de <100 filas y verifica que el JSON tiene las keys esperadas.
6. `etl/analytics/evaluation/variants/tfidf_baseline.yaml` existe y se puede cargar desde el CLI.
7. La función `_assert_no_future_leakage` existe y se ejecuta; corre sin fallar en el baseline.

## 13. Handoff a writing-plans

La siguiente spec (`writing-plans`) debe descomponer este diseño en pasos de implementación con:

- Orden de tareas (primero biblioteca base, después reporter, después evaluator de referencia).
- Puntos de checkpoint (después de cada fase grande, correr smoke test).
- Tests incluidos por paso.
- Criterios de "done" explícitos por paso.
