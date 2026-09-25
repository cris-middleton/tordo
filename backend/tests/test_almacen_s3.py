"""El almacenamiento S3 funciona con lo que declara `pyproject.toml`.

`boto3` no estaba declarado: el servicio lo importaba en diferido («not
required in dev») y con STORAGE_BACKEND=s3 —el del compose y el de
producción— subir un documento terminaba en `ModuleNotFoundError`, un 500
para el cliente. Los tests y el E2E usan almacenamiento local, así que nada lo
veía. Se encontró recorriendo el producto contra la pila del compose.
"""

from __future__ import annotations

import socket
import uuid

import pytest

from app.services.storage_service import S3StorageService


def test_el_cliente_s3_se_construye_con_las_dependencias_declaradas():
    servicio = S3StorageService(
        bucket="tordo-docs", region="us-east-1", endpoint_url="http://minio:9000"
    )
    cliente = servicio._client()
    assert cliente.meta.endpoint_url == "http://minio:9000"


def _minio_local() -> bool:
    try:
        with socket.create_connection(("localhost", 9000), timeout=0.5):
            return True
    except OSError:
        return False


@pytest.mark.skipif(not _minio_local(), reason="sin MinIO local (make dev-up-d lo levanta)")
def test_sube_y_borra_contra_minio(monkeypatch):
    """Contra el MinIO del compose, con sus credenciales de desarrollo."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "minioadmin")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "minioadmin")
    servicio = S3StorageService(
        bucket="tordo-docs", region="us-east-1", endpoint_url="http://localhost:9000"
    )
    clave = f"tests/{uuid.uuid4().hex}.pdf"

    guardado = servicio.upload(b"%PDF-1.4\n%%EOF", clave, "application/pdf")

    assert guardado.key == clave
    servicio.delete(clave)
