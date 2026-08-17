"""La limpieza de texto del TF-IDF está escrita DOS veces. Que no diverjan.

`etl/analytics/tfidf_matcher.py` construye el vocabulario y entrena el modelo;
`backend/app/services/tfidf_matcher.py` lo consume para puntuar una licitación
contra el perfil de una empresa. Cada uno tiene su propio `_clean_text`, y el
del backend lo dice en su docstring: «identical to ETL for vocabulary
consistency».

**Lo que pasa si divergen no es que falle: es que empeora en silencio.** Un
token que el ETL guarda como «mantencion» y el backend produce como «mantención»
no está en el vocabulario del vectorizador, así que se descarta. El encaje
seguiría dando un número, sólo que más bajo y sin motivo visible — y el encaje
es lo que decide qué llega al correo de cada usuario.

Es el mismo riesgo que la versión de la API duplicada entre `versionado.py` y
`versionApi.ts`, y se trata igual: con un test que compara las dos.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from etl.analytics.tfidf_matcher import _clean_text as limpiar_etl

RAIZ = Path(__file__).resolve().parents[2]


def _limpiar_backend():
    """Carga la función del backend sin importar el paquete `app` entero.

    Importarlo arrastraría la configuración y la base de datos, que no hacen
    falta para comparar dos funciones de texto puro.
    """
    ruta = RAIZ / "backend" / "app" / "services" / "tfidf_matcher.py"
    if not ruta.exists():  # pragma: no cover
        pytest.skip(f"no está {ruta}")
    spec = importlib.util.spec_from_file_location("_tfidf_backend", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo._clean_text


#: Casos elegidos por lo que aparece de verdad en el catálogo de ChileCompra:
#: tildes, ñ, códigos alfanuméricos, signos, palabras de dos letras y los
#: centinelas que el dato trae como texto.
CASOS = [
    "Servicio de mantención de equipos médicos",
    "SEÑALÉTICA VIAL Y DEMARCACIÓN",
    "Adquisición de insumos - Hospital Dr. Sótero del Río",
    "null",
    "None",
    "",
    "   ",
    "OC 1234-56-LP26 / ítem 3",
    "de la el un y o a",
    "Ñuble, Peñalolén y Til Til",
    "Reactivos (kit) 100 un. c/u",
    "AGUA POTABLE\ty\nALCANTARILLADO",
    "Máquina retroexcavadora 4x4 — arriendo mensual",
]


@pytest.mark.parametrize("texto", CASOS, ids=lambda t: t[:28] or "vacío")
def test_las_dos_implementaciones_coinciden(texto):
    limpiar_backend = _limpiar_backend()
    assert limpiar_etl(texto) == limpiar_backend(texto), (
        "El `_clean_text` del ETL y el del backend divergieron. El vocabulario "
        "del modelo se entrena con el primero y las consultas se normalizan con "
        "el segundo: cualquier diferencia tira tokens al vacío y baja el encaje "
        "sin que nada falle."
    )


def test_la_limpieza_hace_lo_que_promete():
    """Fija el contrato, no sólo la igualdad: dos implementaciones idénticas y
    ambas rotas también pasarían el test de arriba."""
    assert limpiar_etl("Servicio de MANTENCIÓN, S.A.") == "servicio mantención"
    assert limpiar_etl("null") == ""
    assert limpiar_etl("a de la") == ""
