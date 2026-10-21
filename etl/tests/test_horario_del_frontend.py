"""El horario del cron `frecuente` que conoce el sitio es el del cron.

`frontend/lib/compraAgil.ts` copia `HORAS_HABILES` y `HORAS_FIN_DE_SEMANA` para
saber cuándo debió correr la última pasada (`ultimaCorridaEsperada`) y avisar
sólo si se saltó una, y `lib/portada.ts` escribe con ellas cuántas veces al día
se actualiza el catálogo. Si el cron cambia de horario y el frontend no, el
aviso saltaría en lo normal (o callaría en lo raro) y la portada diría una
frecuencia que ya no es la suya.
"""

from __future__ import annotations

import re
from pathlib import Path

from etl.cron import HORAS_FIN_DE_SEMANA, HORAS_HABILES

COMPRA_AGIL = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "compraAgil.ts"


def _horas(nombre: str) -> tuple[int, ...]:
    encontrada = re.search(
        rf"export const {nombre} = \[([\d,\s]*)\] as const;", COMPRA_AGIL.read_text()
    )
    assert encontrada, f"no se encontró {nombre} en frontend/lib/compraAgil.ts"
    return tuple(int(h) for h in encontrada.group(1).split(",") if h.strip())


def test_las_horas_de_lunes_a_viernes_son_las_del_cron():
    assert _horas("HORAS_HABILES") == HORAS_HABILES


def test_las_horas_del_fin_de_semana_son_las_del_cron():
    assert _horas("HORAS_FIN_DE_SEMANA") == HORAS_FIN_DE_SEMANA
