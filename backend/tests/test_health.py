import os

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# GitHub Actions define CI=true. Ahí la base siempre está levantada, así que no
# se permite saltar: si readiness falla en CI, es una regresión de verdad.
IN_CI = os.getenv("CI", "").lower() in ("1", "true")


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()


def test_health_check():
    response = client.get("/health/")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_readiness_check():
    """Readiness comprueba conectividad real con la base de datos.

    En local, sin la base levantada, el endpoint devuelve 503 correctamente y el
    test se salta: no poder ejecutarse en este entorno no es lo mismo que una
    regresión. En CI no se salta nunca — Postgres está arriba y el 503 sería un
    fallo real.
    """
    response = client.get("/health/ready")
    if response.status_code == 503 and not IN_CI:
        pytest.skip("sin base de datos disponible — levanta el stack con `make dev-up-d`")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


@pytest.mark.parametrize("ruta", ["/health/", "/health/ready"])
def test_un_monitor_puede_preguntar_con_head(ruta):
    """Muchos monitores de disponibilidad mandan HEAD; un 405 se lee como caído."""
    assert client.head(ruta).status_code in (200, 503)
