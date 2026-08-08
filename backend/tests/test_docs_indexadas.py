"""Todo documento de `docs/` está clasificado en su índice.

Doce documentos en un directorio no dicen cuáles describen el sistema de hoy y
cuáles son la foto de un martes de abril. Y **una documentación desfasada es peor
que ninguna**: la de hoy se lee con desconfianza y la de abril se cree.

Este test es el mismo trinquete que `test_superficie_publica.py` o el de
tenancy: un documento nuevo hace fallar hasta que alguien decide si está vivo o
es histórico. Sin él, el índice se queda atrás en el primer PR con prisa — que es
exactamente lo que le pasó a `development-guide.md`, que sobrevivió a la limpieza
de F0 describiendo una arquitectura que ya no existía.
"""

from __future__ import annotations

from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[2]
DOCS = RAIZ / "docs"
INDICE = DOCS / "README.md"

#: El propio índice no se indexa a sí mismo.
EXENTOS = {"README.md"}


def _documentos() -> list[str]:
    """Los `.md` de `docs/`, sin recursión.

    `_archive/` y `decisiones/` se quedan fuera a propósito: el primero tiene su
    propia advertencia, y el segundo su propio índice numerado.
    """
    return sorted(p.name for p in DOCS.glob("*.md") if p.name not in EXENTOS)


DOCUMENTOS = _documentos()


def test_hay_documentos_que_indexar():
    """La guarda de siempre: sin ella, el test de abajo pasaría con cero casos si
    alguien moviera el directorio, y diría que todo está en orden."""
    assert len(DOCUMENTOS) >= 5, f"se esperaban ≥5 documentos, hay {len(DOCUMENTOS)}"


@pytest.mark.parametrize("documento", DOCUMENTOS, ids=DOCUMENTOS)
def test_cada_documento_esta_en_el_indice(documento: str):
    indice = INDICE.read_text(encoding="utf-8")

    assert documento in indice, (
        f"«{documento}» no aparece en docs/README.md. Clasifícalo:\n"
        f"  🟢 vivo      — describe el sistema actual, y se corrige cuando el código cambia\n"
        f"  🟡 histórico — la foto de un momento; añade su aviso al principio del fichero\n"
        f"  🔵 externo   — documentación de terceros"
    )


@pytest.mark.parametrize("documento", DOCUMENTOS, ids=DOCUMENTOS)
def test_lo_historico_lo_avisa_en_su_primera_linea(documento: str):
    """Quien abre un fichero suelto no pasa por el índice.

    El aviso tiene que estar **en el documento**: es lo único que ve alguien que
    llega por un enlace o por una búsqueda.
    """
    indice = INDICE.read_text(encoding="utf-8")
    seccion_historico = indice.split("## 🟡 Histórico", 1)[-1].split("## 🔵", 1)[0]
    if documento not in seccion_historico:
        pytest.skip("clasificado como vivo o externo")

    cabecera = (DOCS / documento).read_text(encoding="utf-8")[:400]
    assert "🟡" in cabecera and "Histórico" in cabecera, (
        f"«{documento}» está clasificado como histórico en el índice pero no lo avisa "
        f"en su cabecera. Quien llegue por un enlace lo leerá como vigente."
    )


def test_el_indice_no_nombra_documentos_que_no_existen():
    """Un enlace roto en el mapa es peor que no tener mapa: manda a buscar algo
    que no está y deja la duda de si el mapa entero está mal."""
    import re

    indice = INDICE.read_text(encoding="utf-8")
    enlaces = re.findall(r"\]\((?!https?://)([^)#]+)\)", indice)

    rotos = sorted(
        {destino for destino in enlaces if not (INDICE.parent / destino).resolve().exists()}
    )
    assert not rotos, f"enlaces rotos en docs/README.md: {rotos}"
