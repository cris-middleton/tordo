"""El almacén de parquets: disco o R2, explícito y sin transferir lo que no cambió."""

import hashlib
import os
import subprocess
import sys
from pathlib import Path

import pytest

from etl import almacen
from etl.almacen import AlmacenDisco, AlmacenMalConfigurado, AlmacenR2


class S3Falso:
    """Lo justo de un cliente de boto3. El ETag es el MD5, como en una subida simple."""

    def __init__(self):
        self.objetos: dict[str, bytes] = {}
        self.subidas: list[str] = []
        self.bajadas: list[str] = []

    def get_paginator(self, nombre):
        assert nombre == "list_objects_v2"
        return self

    def paginate(self, Bucket, Prefix):  # noqa: N803 — firma de boto3
        contenidos = [
            {"Key": k, "ETag": f'"{hashlib.md5(v).hexdigest()}"'}  # noqa: S324
            for k, v in sorted(self.objetos.items())
            if k.startswith(Prefix)
        ]
        # Dos páginas, para que nadie se olvide de paginar.
        mitad = len(contenidos) // 2
        return [{"Contents": contenidos[:mitad]}, {"Contents": contenidos[mitad:]}, {}]

    def download_file(self, bucket, clave, ruta):
        self.bajadas.append(clave)
        with open(ruta, "wb") as f:
            f.write(self.objetos[clave])

    def upload_file(self, ruta, bucket, clave, Config=None):  # noqa: N803
        assert Config.multipart_threshold >= 1024**3, "una subida partida no tiene el MD5 de ETag"
        self.subidas.append(clave)
        with open(ruta, "rb") as f:
            self.objetos[clave] = f.read()


def _escribir(raiz, ruta, contenido: bytes):
    p = raiz / ruta
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(contenido)


def test_bajar_trae_lo_que_falta_o_cambio_y_no_lo_demas(tmp_path):
    s3 = S3Falso()
    s3.objetos = {
        "consolidated/oc/2026-1.parquet": b"enero",
        "consolidated/oc/2026-2.parquet": b"febrero",
        "analytics/market_concentration.parquet": b"hhi",
        "raw/oc/2026-1.zip": b"no se baja",
        "analytics/analytics.log": b"tampoco",
    }
    _escribir(tmp_path, "consolidated/oc/2026-1.parquet", b"enero")  # igual
    _escribir(tmp_path, "consolidated/oc/2026-2.parquet", b"viejo")  # distinto

    AlmacenR2(s3, "b", tmp_path).bajar()

    assert sorted(s3.bajadas) == [
        "analytics/market_concentration.parquet",
        "consolidated/oc/2026-2.parquet",
    ]
    assert (tmp_path / "consolidated/oc/2026-2.parquet").read_bytes() == b"febrero"
    assert not (tmp_path / "raw").exists()
    assert not list(tmp_path.rglob("*.tmp"))


def test_subir_lleva_lo_nuevo_o_cambiado_y_nunca_raw(tmp_path):
    s3 = S3Falso()
    s3.objetos = {"consolidated/oc/2026-1.parquet": b"enero"}
    _escribir(tmp_path, "consolidated/oc/2026-1.parquet", b"enero")
    _escribir(tmp_path, "consolidated/oc/2026-2.parquet", b"febrero")
    _escribir(tmp_path, "analytics/compra_agil_mensual.parquet", b"tasa")
    _escribir(tmp_path, "analytics/analytics.log", b"log")
    _escribir(tmp_path, "raw/oc/2026-2.zip", b"zip")

    AlmacenR2(s3, "b", tmp_path).subir()

    assert sorted(s3.subidas) == [
        "analytics/compra_agil_mensual.parquet",
        "consolidated/oc/2026-2.parquet",
    ]


def test_ida_y_vuelta(tmp_path):
    s3 = S3Falso()
    origen, destino = tmp_path / "a", tmp_path / "b"
    _escribir(origen, "consolidated/lic/2025-12.parquet", b"diciembre")
    AlmacenR2(s3, "b", origen).subir()
    AlmacenR2(s3, "b", destino).bajar()
    assert (destino / "consolidated/lic/2025-12.parquet").read_bytes() == b"diciembre"


# ── Configuración ────────────────────────────────────────────────────────────

R2_COMPLETO = {
    "ETL_ALMACEN": "r2",
    "R2_ENDPOINT_URL": "https://cuenta.r2.cloudflarestorage.com",
    "R2_ACCESS_KEY_ID": "id",
    "R2_SECRET_ACCESS_KEY": "secreto",
    "R2_BUCKET": "tordo-parquets",
}


@pytest.mark.parametrize("valor", [None, "", "s3", "R2 "])
def test_sin_modo_explicito_no_arranca(tmp_path, valor):
    entorno = {} if valor is None else {"ETL_ALMACEN": valor}
    if valor == "R2 ":
        # Mayúsculas y espacios se toleran; lo que falta entonces son las credenciales.
        with pytest.raises(AlmacenMalConfigurado, match="R2_BUCKET"):
            almacen.desde_entorno(tmp_path, entorno)
        return
    with pytest.raises(AlmacenMalConfigurado, match="ETL_ALMACEN"):
        almacen.desde_entorno(tmp_path, entorno)


def test_disco_es_explicito(tmp_path):
    assert isinstance(almacen.desde_entorno(tmp_path, {"ETL_ALMACEN": "disco"}), AlmacenDisco)


@pytest.mark.parametrize(
    "falta", ["R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
)
def test_r2_sin_una_credencial_falla_nombrandola(tmp_path, falta):
    entorno = {k: v for k, v in R2_COMPLETO.items() if k != falta}
    with pytest.raises(AlmacenMalConfigurado, match=falta):
        almacen.desde_entorno(
            tmp_path,
            entorno,
            crear_cliente=lambda *a, **k: pytest.fail("no debía construir el cliente"),
        )


def test_r2_completo_construye_el_cliente_con_sus_credenciales(tmp_path):
    vistos = {}

    def crear(servicio, **kw):
        vistos.update(kw, servicio=servicio)
        return S3Falso()

    resultado = almacen.desde_entorno(tmp_path, R2_COMPLETO, crear_cliente=crear)
    assert isinstance(resultado, AlmacenR2)
    assert resultado.bucket == "tordo-parquets"
    assert vistos["servicio"] == "s3"
    assert vistos["endpoint_url"] == R2_COMPLETO["R2_ENDPOINT_URL"]
    assert vistos["aws_secret_access_key"] == "secreto"


def test_el_script_de_descarga_y_analytics_usan_la_misma_raiz(tmp_path):
    """La regla de `ETL_DATA_DIR` está escrita dos veces (el script corre suelto)."""
    raiz = Path(__file__).resolve().parents[2]
    codigo = (
        "from etl.analytics.config import DATA_DIR;"
        "from etl.scripts.descargar_datos_masivos import DATA_DIR as D;"
        "print(DATA_DIR == D, DATA_DIR)"
    )
    for entorno in ({"ETL_DATA_DIR": str(tmp_path)}, {}):
        env = {k: v for k, v in os.environ.items() if k != "ETL_DATA_DIR"} | entorno
        salida = subprocess.run(
            [sys.executable, "-c", codigo],
            cwd=raiz,
            env=env,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        assert salida.startswith("True"), salida
