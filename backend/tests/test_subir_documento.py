"""Subir un documento pasa por la cuota del plan de la EMPRESA.

`enforce_doc_quota` recibía el `User`, y desde F3 el plan vive en la empresa
(ADR 0002): `User` ya no tiene `plan_tier`, así que TODA subida terminaba en
500 con `AttributeError`. Ningún test llamaba al endpoint — los de cuotas
probaban las funciones sueltas con un `SimpleNamespace`, que acepta cualquier
atributo y por eso no podía ver el error. Estos van por HTTP.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import get_db
from app.main import app
from app.models.empresa import DocumentoEmpresa, Empresa

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@pytest.fixture(autouse=True)
def almacenamiento_local(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_backend", "local")
    # Ruta relativa y corta: el almacenamiento local guarda su ruta base en
    # `s3_bucket` (varchar 100), y la de `tmp_path` no cabe.
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(settings, "local_storage_path", "almacen")


@pytest_asyncio.fixture
async def cliente(async_db):
    async def _get_db():
        yield async_db

    app.dependency_overrides[get_db] = _get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def _subir(cliente, empresa_id, cabeceras):
    return await cliente.post(
        f"/api/v1/empresas/{empresa_id}/documentos",
        headers=cabeceras,
        files={"file": ("certificado.pdf", PDF, "application/pdf")},
        data={"tipo_documento": "certificado_vigencia", "fecha_vencimiento": "2026-12-31"},
    )


async def test_una_empresa_en_trial_puede_subir(cliente, sample_empresa, cabeceras_owner):
    r = await _subir(cliente, sample_empresa.id, cabeceras_owner)

    assert r.status_code == 201, r.text
    assert r.json()["nombre"] == "certificado.pdf"


async def test_la_cuota_que_se_aplica_es_la_del_plan_de_la_empresa(
    cliente, async_db, sample_empresa: Empresa, cabeceras_owner
):
    """Sin trial y en basico (5 documentos), el sexto se rechaza con 402 — no 500."""
    sample_empresa.trial_ends_at = None
    sample_empresa.subscription_status = "active"
    sample_empresa.plan_tier = "basico"
    for i in range(5):
        async_db.add(
            DocumentoEmpresa(
                empresa_id=sample_empresa.id,
                nombre=f"doc-{i}.pdf",
                tipo_documento="otro",
                s3_key=f"k/{i}",
                s3_bucket="b",
                tamano_bytes=10,
            )
        )
    await async_db.flush()

    r = await _subir(cliente, sample_empresa.id, cabeceras_owner)

    assert r.status_code == 402, r.text
