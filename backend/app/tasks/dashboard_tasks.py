"""Precómputo diario del encaje TF-IDF entre cada empresa y las licitaciones abiertas.

Corre a las 06:00 SCL. Para cada empresa con `TFIDFPerfil`, puntúa las
licitaciones abiertas y deja el resultado en `match_empresa_licitacion`.

Antes escribía un blob JSON en `dashboard_home_cache` con el top-20 y los datos
de cada licitación **copiados dentro**. Se cambió por dos motivos, y ninguno es
estético:

- El blob **mentía en cuanto la licitación cambiaba**: nombre, monto y fecha de
  cierre eran una foto de las 06:00.
- **Sólo servía a la portada.** Cualquier otra pantalla que quisiera el encaje
  tenía que recalcularlo en tiempo de request, y eso significa cargar el modelo
  TF-IDF (~105 MB) dentro del proceso de la API.

El modelo sigue viviendo aquí, en el worker, que es donde debe estar.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.celery_app import celery_app
from app.config import settings
from app.db import SyncSessionLocal
from app.models.empresa import TFIDFPerfil
from app.models.licitacion import Licitacion
from app.models.match import MatchEmpresaLicitacion
from app.services.tfidf_matcher import score_empresa_licitacion

logger = logging.getLogger(__name__)

# Por debajo de esto no se guarda nada. Es el mismo umbral que tenía el job
# anterior: guardar los ceros multiplicaría la tabla por el catálogo entero sin
# que ninguna pantalla los muestre.
UMBRAL_MINIMO = 0.05

# Cuántas se guardan por empresa. Más que el top-20 que pintaba la portada,
# porque ahora la tabla también alimenta el enriquecimiento del listado: si sólo
# hubiera 20 filas, la mayoría de los resultados saldrían sin score.
TOPE_POR_EMPRESA = 200


def _puntuar_empresa(db, vector_bytes: bytes) -> list[tuple[int, int, str]]:
    """`[(licitacion_id, score 0-100, nivel)]` para las licitaciones abiertas."""
    ahora = datetime.now(UTC)
    licitaciones = (
        db.query(Licitacion)
        .filter(
            Licitacion.activo.is_(True),
            Licitacion.estado == "Publicada",
            Licitacion.fecha_cierre.isnot(None),
            Licitacion.fecha_cierre > ahora,
        )
        .all()
    )

    puntuadas: list[tuple[float, int, str]] = []
    for lic in licitaciones:
        texto = " ".join(filter(None, [lic.nombre or "", lic.descripcion or ""]))
        if not texto.strip():
            continue
        score, nivel = score_empresa_licitacion(vector_bytes, texto)
        if score < UMBRAL_MINIMO:
            continue
        puntuadas.append((score, lic.id, nivel))

    puntuadas.sort(key=lambda t: t[0], reverse=True)
    return [
        (lic_id, max(0, min(100, round(score * 100))), nivel)
        for score, lic_id, nivel in puntuadas[:TOPE_POR_EMPRESA]
    ]


def _guardar(db, empresa_id, filas: list[tuple[int, int, str]], calculado_en: datetime) -> None:
    """Reemplaza el encaje de una empresa por el recién calculado.

    Se borra y se inserta en la MISMA transacción. Un upsert sin borrado dejaría
    para siempre las filas de licitaciones que ya no puntúan —cerradas, o caídas
    por debajo del umbral— y la tabla sólo crecería.
    """
    db.query(MatchEmpresaLicitacion).filter(MatchEmpresaLicitacion.empresa_id == empresa_id).delete(
        synchronize_session=False
    )

    if not filas:
        return

    # `ON CONFLICT DO NOTHING` por si el catálogo trajera un id repetido: sin
    # esto, una sola fila duplicada aborta la transacción entera y esa empresa
    # se queda sin encaje hasta el día siguiente.
    db.execute(
        pg_insert(MatchEmpresaLicitacion)
        .values(
            [
                {
                    "empresa_id": empresa_id,
                    "licitacion_id": lic_id,
                    "score": score,
                    "nivel": nivel,
                    "calculado_en": calculado_en,
                }
                for lic_id, score, nivel in filas
            ]
        )
        .on_conflict_do_nothing(index_elements=["empresa_id", "licitacion_id"])
    )


def actualizar_matches_de_licitaciones(db, licitacion_ids: list[int]) -> int:
    """Puntúa un puñado de licitaciones recién ingeridas contra todos los perfiles.

    **Por qué existe.** El recálculo completo corre una vez al día a las 06:00, así
    que una licitación ingerida a las 10:00 salía **sin encaje hasta el día
    siguiente** — y sin encaje no aparece ordenada, no entra en el correo y no se
    ve en el panel. En un producto donde la competencia vende «revisamos cada 10
    minutos», esperar veinte horas es la diferencia entera.

    Tres decisiones que el código no explica solo:

    - **Aquí no se borra nada.** El recálculo completo hace `DELETE`+`INSERT` para
      limpiar lo que dejó de puntuar; este camino sólo añade. Un borrado por
      empresa aquí tiraría el encaje de todas las demás licitaciones cada hora.
    - **No se aplica el tope por empresa.** No se puede sin recorrer la tabla
      entera, y unas pocas filas de más por hora las recorta la corrida de las
      06:00. Elegir entre "un poco por encima del tope durante unas horas" y "sin
      encaje durante veinte" no es difícil.
    - **Se actualiza si ya existía** (`DO UPDATE`): el ETL horario revisita
      licitaciones que cambiaron de nombre o descripción, y ahí el score cambia.
    """
    if not licitacion_ids:
        return 0

    licitaciones = db.query(Licitacion).filter(Licitacion.id.in_(licitacion_ids)).all()
    if not licitaciones:
        return 0

    textos = {
        lic.id: " ".join(filter(None, [lic.nombre or "", lic.descripcion or ""])).strip()
        for lic in licitaciones
    }

    ahora = datetime.now(UTC)
    filas: list[dict] = []
    for perfil in db.query(TFIDFPerfil).all():
        if not perfil.vector_bytes:
            continue
        for lic_id, texto in textos.items():
            if not texto:
                continue
            score, nivel = score_empresa_licitacion(perfil.vector_bytes, texto)
            if score < UMBRAL_MINIMO:
                continue
            filas.append(
                {
                    "empresa_id": perfil.empresa_id,
                    "licitacion_id": lic_id,
                    "score": max(0, min(100, round(score * 100))),
                    "nivel": nivel,
                    "calculado_en": ahora,
                }
            )

    if not filas:
        return 0

    insert = pg_insert(MatchEmpresaLicitacion).values(filas)
    db.execute(
        insert.on_conflict_do_update(
            index_elements=["empresa_id", "licitacion_id"],
            set_={
                "score": insert.excluded.score,
                "nivel": insert.excluded.nivel,
                "calculado_en": insert.excluded.calculado_en,
            },
        )
    )
    db.commit()
    return len(filas)


@celery_app.task(name="app.tasks.dashboard_tasks.precompute_dashboard_matches")
def precompute_dashboard_matches() -> dict:
    """06:00 SCL: recalcula `match_empresa_licitacion` para cada perfil TF-IDF."""
    if not settings.feature_tfidf:
        logger.info("[Matches] feature_tfidf apagada — no se hace nada")
        return {"skipped": True}

    db = SyncSessionLocal()
    procesadas = 0
    fallidas = 0
    filas_totales = 0
    try:
        perfiles = db.query(TFIDFPerfil).all()
        for perfil in perfiles:
            try:
                filas = _puntuar_empresa(db, perfil.vector_bytes)
                _guardar(db, perfil.empresa_id, filas, datetime.now(UTC))
                # Commit por empresa: con uno solo al final, un fallo en la
                # última tiraba el trabajo de todas las demás.
                db.commit()
                procesadas += 1
                filas_totales += len(filas)
            except Exception as exc:
                db.rollback()
                fallidas += 1
                logger.error("[Matches] empresa=%s falló: %s", perfil.empresa_id, exc)
        logger.info(
            "[Matches] empresas=%d filas=%d fallidas=%d", procesadas, filas_totales, fallidas
        )
        return {"processed": procesadas, "rows": filas_totales, "failed": fallidas}
    finally:
        db.close()
