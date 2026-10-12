"""La API no carga el modelo TF-IDF, ni la librería que lo lee.

El TF-IDF costaba ~165 MB por proceso de la API (`make medir-memoria`: 126 MiB de
pico sin él, 289 MiB con él, con un worker). Salió en el paso 8 del pivote
público: el orden por relevancia lo hace Postgres (`ts_rank_cd`) y el matching
por texto libre se retiró.

Lo que este test impide es que vuelva por la puerta de atrás: un import de
`sklearn` en cualquier módulo que arranque con la app devuelve el coste aunque
nadie llame al modelo. Se mira en un proceso limpio, como
`test_modulos_importables`, porque dentro de pytest el ETL ya pudo importarlas.
"""

from __future__ import annotations

import pathlib
import subprocess
import sys

BACKEND = pathlib.Path(__file__).resolve().parents[1]

#: Lo que sólo usa el entrenamiento del ETL. `scipy` y `joblib` leían los
#: artefactos (`.npz`, `.joblib`); `sklearn` calculaba el coseno.
PROHIBIDAS = ("sklearn", "scipy", "joblib")


def test_arrancar_la_api_no_importa_nada_del_tfidf():
    codigo = (
        "import sys, app.main\n"
        f"cargadas = sorted({{m.split('.')[0] for m in sys.modules}} & set({PROHIBIDAS!r}))\n"
        "print('CARGADAS=' + ','.join(cargadas))\n"
    )
    resultado = subprocess.run(
        [sys.executable, "-c", codigo],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert resultado.returncode == 0, resultado.stderr[-2000:]
    # La app escribe sus logs por stdout; la respuesta va en su propia línea.
    marcadas = [ln for ln in resultado.stdout.splitlines() if ln.startswith("CARGADAS=")]
    assert marcadas, resultado.stdout[-2000:]
    cargadas = marcadas[-1].removeprefix("CARGADAS=")
    assert cargadas == "", (
        f"Arrancar la API importa {cargadas}: el TF-IDF es del ETL. "
        "Ver docs/PIVOTE_PUBLICO_2026-10.md §7.3."
    )


def test_el_servicio_tfidf_ya_no_existe_en_la_api():
    assert not (BACKEND / "app" / "services" / "tfidf_matcher.py").exists()
