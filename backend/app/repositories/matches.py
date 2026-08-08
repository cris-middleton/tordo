"""Lectura del encaje precomputado empresa × licitación.

Es el único sitio que sabe cómo se consulta `match_empresa_licitacion`. Los
routers piden por aquí y no arman su propio SELECT: cuando el modelo cambie
—porque el score pase a tener más dimensiones, o porque haya que ignorar las
licitaciones ya cerradas de otra forma— hay un solo sitio que tocar.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, asc, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.licitacion import Licitacion
from app.models.match import MatchEmpresaLicitacion


async def top_licitaciones(
    db: AsyncSession,
    empresa_id: UUID,
    *,
    limite: int = 20,
) -> tuple[list[tuple[Licitacion, MatchEmpresaLicitacion]], datetime | None]:
    """Las licitaciones que mejor encajan con la empresa, con su fila de licitación.

    Devuelve además cuándo se calculó. Ese dato es de la corrida, no de la fila:
    todas las de una empresa se recalculan juntas, así que basta con la primera.

    El join contra `licitaciones` es lo que hace que el nombre, el monto y la
    fecha de cierre estén **al día**. La versión anterior los guardaba copiados
    dentro de un blob JSON y se quedaban congelados hasta la corrida siguiente.

    Se filtran las que ya cerraron: el job puntúa lo que estaba abierto a las
    06:00, y una licitación puede cerrar durante el día. Mostrarla sería invitar
    a postular a algo que ya no admite ofertas.
    """
    ahora = datetime.now(UTC)

    filas = (
        await db.execute(
            select(Licitacion, MatchEmpresaLicitacion)
            .join(
                MatchEmpresaLicitacion,
                MatchEmpresaLicitacion.licitacion_id == Licitacion.id,
            )
            .where(
                MatchEmpresaLicitacion.empresa_id == empresa_id,
                Licitacion.activo.is_(True),
                Licitacion.fecha_cierre.is_not(None),
                Licitacion.fecha_cierre > ahora,
            )
            .order_by(desc(MatchEmpresaLicitacion.score))
            .limit(limite)
        )
    ).all()

    calculado_en = filas[0][1].calculado_en if filas else None
    return [(lic, m) for lic, m in filas], calculado_en


async def encaje_por_licitacion(
    db: AsyncSession,
    empresa_id: UUID,
    licitacion_ids: list[int],
) -> dict[int, tuple[int, str]]:
    """`{licitacion_id: (score, nivel)}` para las licitaciones pedidas.

    Sirve para enriquecer una página de resultados sin cargar el modelo TF-IDF
    en el proceso de la API — que cuesta ~105 MB por worker y era el motivo por
    el que la API no cabía en un contenedor de 512 MB con varios workers.

    Lo que NO aparece aquí es lo que el job todavía no ha puntuado: una
    licitación ingerida hoy no tiene fila hasta las 06:00 siguientes. Quien
    llame decide qué hacer con esa ausencia; aquí simplemente no está.
    """
    if not licitacion_ids:
        return {}

    filas = (
        await db.execute(
            select(
                MatchEmpresaLicitacion.licitacion_id,
                MatchEmpresaLicitacion.score,
                MatchEmpresaLicitacion.nivel,
            ).where(
                MatchEmpresaLicitacion.empresa_id == empresa_id,
                MatchEmpresaLicitacion.licitacion_id.in_(licitacion_ids),
            )
        )
    ).all()
    return {lic_id: (score, nivel) for lic_id, score, nivel in filas}


def ordenar_por_encaje(stmt: Select, empresa_id: UUID, *, ascendente: bool = False) -> Select:
    """Añade a una consulta de licitaciones el orden por encaje con la empresa.

    Join **externo** y `NULLS LAST` a propósito: lo que el job todavía no ha
    puntuado tiene que seguir apareciendo, al final. Con un join interno,
    "ordenar por encaje" se convertiría en "filtrar por encaje" — el usuario
    ordenaría una columna y vería desaparecer resultados.
    """
    orden = asc if ascendente else desc
    return stmt.outerjoin(
        MatchEmpresaLicitacion,
        (MatchEmpresaLicitacion.licitacion_id == Licitacion.id)
        & (MatchEmpresaLicitacion.empresa_id == empresa_id),
    ).order_by(orden(MatchEmpresaLicitacion.score).nullslast())
