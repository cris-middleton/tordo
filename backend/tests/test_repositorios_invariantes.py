"""Los filtros que estaban repetidos por los routers, ahora en un solo sitio.

Cada uno de estos tres se escribía a mano en varios endpoints, y ninguno tenía
test. Fallar en ellos **no rompe nada visible**, que es exactamente lo que los
hace peligrosos:

- un documento borrado que reaparece con su enlace de descarga,
- una postulación abierta sobre una licitación ya retirada,
- un ítem de checklist de otra postulación marcado desde la propia.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio

from app.models.empresa import DocumentoEmpresa, Empresa
from app.models.licitacion import Licitacion
from app.models.postulacion import ChecklistPostulacion, Postulacion
from app.repositories import documentos as repo_documentos
from app.repositories import licitaciones as repo_licitaciones
from app.repositories import postulaciones as repo_postulaciones


@pytest_asyncio.fixture
async def empresa(async_db) -> Empresa:
    emp = Empresa(
        rut_empresa=f"6{uuid.uuid4().int % 10_000_000}-4",
        nombre_empresa="Invariantes SpA",
        estado_habil="habil",
    )
    async_db.add(emp)
    await async_db.flush()
    return emp


async def _licitacion(db, codigo: str, *, activo: bool = True) -> Licitacion:
    lic = Licitacion(
        codigo_externo=codigo,
        nombre=f"Servicio {codigo}",
        fecha_publicacion=datetime.now(UTC) - timedelta(days=1),
        fecha_cierre=datetime.now(UTC) + timedelta(days=10),
        estado="Publicada",
        activo=activo,
    )
    db.add(lic)
    await db.flush()
    return lic


# ── Documentos: el borrado es lógico ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_un_documento_borrado_no_vuelve_a_aparecer(async_db, empresa):
    vigente = DocumentoEmpresa(
        empresa_id=empresa.id,
        nombre="vigente.pdf",
        tipo_documento="otro",
        s3_bucket="pruebas",
        s3_key="k1",
        eliminado=False,
    )
    borrado = DocumentoEmpresa(
        empresa_id=empresa.id,
        nombre="borrado.pdf",
        tipo_documento="otro",
        s3_bucket="pruebas",
        s3_key="k2",
        eliminado=True,
    )
    async_db.add_all([vigente, borrado])
    await async_db.flush()

    lista = await repo_documentos.listar_de_empresa(async_db, empresa.id)
    assert [d.nombre for d in lista] == ["vigente.pdf"]

    # Y tampoco por id: es el camino de la descarga, donde reaparecer significa
    # entregar el archivo que el usuario creía eliminado.
    assert await repo_documentos.obtener_vigente(async_db, borrado.id, empresa.id) is None
    assert await repo_documentos.obtener_vigente(async_db, vigente.id, empresa.id) is not None


@pytest.mark.asyncio
async def test_borrar_dos_veces_no_da_404(async_db, empresa):
    """Por eso hay una función que SÍ ve los eliminados, y lo dice en su nombre."""
    doc = DocumentoEmpresa(
        empresa_id=empresa.id,
        nombre="doc.pdf",
        tipo_documento="otro",
        s3_bucket="pruebas",
        s3_key="k3",
        eliminado=True,
    )
    async_db.add(doc)
    await async_db.flush()

    assert await repo_documentos.obtener_incluso_eliminado(async_db, doc.id, empresa.id) is not None


@pytest.mark.asyncio
async def test_un_documento_de_otra_empresa_no_se_alcanza(async_db, empresa):
    otra = Empresa(
        rut_empresa=f"5{uuid.uuid4().int % 10_000_000}-5",
        nombre_empresa="Ajena",
        estado_habil="habil",
    )
    async_db.add(otra)
    await async_db.flush()
    ajeno = DocumentoEmpresa(
        empresa_id=otra.id,
        nombre="ajeno.pdf",
        tipo_documento="otro",
        s3_bucket="pruebas",
        s3_key="k4",
        eliminado=False,
    )
    async_db.add(ajeno)
    await async_db.flush()

    assert await repo_documentos.obtener_vigente(async_db, ajeno.id, empresa.id) is None


# ── Licitaciones: `activo` es lo que decide que existan ──────────────────────


@pytest.mark.asyncio
async def test_una_licitacion_retirada_no_se_puede_postular(async_db):
    """Mercado Público retira licitaciones y el ETL las marca `activo=False`.

    El endpoint que crea postulaciones NO filtraba por esto: se podía abrir una
    postulación sobre algo retirado y preparar documentos para nada.
    """
    retirada = await _licitacion(async_db, "INV-RETIRADA", activo=False)
    vigente = await _licitacion(async_db, "INV-VIGENTE")

    assert await repo_licitaciones.obtener_para_postular(async_db, retirada.id) is None
    assert await repo_licitaciones.obtener_para_postular(async_db, vigente.id) is not None


@pytest.mark.asyncio
async def test_ni_se_lista_ni_se_abre_por_codigo(async_db):
    retirada = await _licitacion(async_db, "INV-RETIRADA-2", activo=False)

    assert await repo_licitaciones.obtener(async_db, retirada.id) is None
    assert await repo_licitaciones.obtener_por_codigo(async_db, "INV-RETIRADA-2") is None

    filas, _total = await repo_licitaciones.buscar(
        async_db, repo_licitaciones.Filtros(terminos=["INV-RETIRADA-2"]), limite=100
    )
    assert not filas


# ── Checklist: el ítem pertenece a SU postulación ────────────────────────────


@pytest.mark.asyncio
async def test_un_item_de_otra_postulacion_no_se_alcanza(async_db, empresa):
    """El acceso se comprueba sobre la postulación de la URL.

    Sin acotar el ítem a esa postulación, bastaría un id de ítem de otra —de la
    misma empresa o no— para marcarlo como completado.
    """
    lic_a = await _licitacion(async_db, "INV-A")
    lic_b = await _licitacion(async_db, "INV-B")
    p_a = Postulacion(empresa_id=empresa.id, licitacion_id=lic_a.id)
    p_b = Postulacion(empresa_id=empresa.id, licitacion_id=lic_b.id)
    async_db.add_all([p_a, p_b])
    await async_db.flush()

    item_de_b = ChecklistPostulacion(
        postulacion_id=p_b.id, descripcion="item de B", es_obligatorio=True, orden=1
    )
    async_db.add(item_de_b)
    await async_db.flush()

    assert await repo_postulaciones.obtener_item_checklist(async_db, item_de_b.id, p_a.id) is None
    assert (
        await repo_postulaciones.obtener_item_checklist(async_db, item_de_b.id, p_b.id) is not None
    )


@pytest.mark.asyncio
async def test_una_postulacion_por_empresa_y_licitacion(async_db, empresa):
    lic = await _licitacion(async_db, "INV-UNICA")
    p = Postulacion(empresa_id=empresa.id, licitacion_id=lic.id)
    async_db.add(p)
    await async_db.flush()

    encontrada = await repo_postulaciones.buscar_de_empresa_para_licitacion(
        async_db, empresa.id, lic.id
    )
    assert encontrada is not None and encontrada.id == p.id
