"""Dónde viven los parquets entre corridas: el disco local o un bucket de R2.

Spec del pivote §3 y §5.2. El cron semanal de Railway arranca en un contenedor
nuevo con el disco vacío, así que la historia —`consolidated/`, toda la descarga
masiva desde 2010, y `analytics/`— tiene que vivir fuera de él.

**Se sincroniza el directorio entero, no se lee del bucket.** Al empezar la
corrida se baja `consolidated/` y `analytics/` a `ETL_DATA_DIR`; al terminar, se
sube lo que cambió. Todo lo demás —`data_loader`, los 16 módulos, `materialize`—
sigue leyendo disco, sin una línea distinta entre local y producción. Leer
directo del bucket obligaría a cambiar cada `glob` y cada `read_parquet` del
pipeline, y un bug ahí sólo se vería en producción.

Lo que NO se sube: `raw/`. Los ZIPs vienen de ChileCompra, que es su fuente, y
la corrida semanal sólo necesita los tres meses que vuelve a descargar.

**`ETL_ALMACEN` es obligatoria y no tiene valor por defecto** (`r2` o `disco`).
Un despliegue que la olvidara y cayera a disco no fallaría: reconstruiría el
análisis sólo con los tres meses recién bajados, y lo publicaría, sin que nada
avisara. Por la misma razón, en `r2` falta una credencial ⇒ falla al
construirse, nombrando lo que falta, antes de tocar nada.

**R2 guarda sólo lo que la corrida lee** (`conservar`): los meses de
`consolidated/` que caen en la ventana de analytics, más un margen. La descarga
masiva entera (2007 en adelante) son ~26 GB —medido: 18 GB de OC y 8 GB de LIC—,
y la capa gratuita de R2 son 10 GB; la ventana, ~4,5 GB. `bajar` no trae lo que
quedó fuera y `subir` lo borra del bucket. Lo decide `etl.cron`, que conoce la
ventana; aquí sólo se aplica. `analytics/` se conserva siempre.

Un archivo se transfiere sólo si cambió: se compara el MD5 local con el ETag del
objeto, que en una subida de una sola parte ES el MD5. Por eso las subidas no se
parten (`MULTIPART_DESDE`): un parquet mensual pesa ~100 MB.
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, Protocol

import boto3
from boto3.s3.transfer import TransferConfig

logger = logging.getLogger(__name__)

#: Decide, por clave (`consolidated/oc/2026-3.parquet`), si un archivo se queda.
Conservar = Callable[[str], bool]

#: Lo que se conserva entre corridas.
SUBDIRECTORIOS = ("consolidated", "analytics")
#: Ni se suben ni se bajan.
SUFIJOS_IGNORADOS = (".log", ".tmp")

VARIABLE_MODO = "ETL_ALMACEN"
VARIABLES_R2 = ("R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")

#: R2 admite hasta 5 GB en una sola petición. Por debajo, el ETag es el MD5.
MULTIPART_DESDE = 4 * 1024**3


class AlmacenMalConfigurado(RuntimeError):
    """Falta o sobra configuración. El mensaje dice qué."""


class Almacen(Protocol):
    def bajar(self) -> int: ...
    def subir(self) -> int: ...


def _md5(ruta: Path) -> str:
    h = hashlib.md5()  # noqa: S324 — es el ETag de S3, no seguridad
    with ruta.open("rb") as f:
        for bloque in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(bloque)
    return h.hexdigest()


def _ignorado(nombre: str) -> bool:
    return nombre.endswith(SUFIJOS_IGNORADOS)


class AlmacenDisco:
    """Los datos se quedan donde están. Para local y para los tests."""

    def bajar(self) -> int:
        logger.info("almacén: disco local, nada que bajar")
        return 0

    def subir(self) -> int:
        logger.info("almacén: disco local, nada que subir")
        return 0


class AlmacenR2:
    def __init__(self, cliente: Any, bucket: str, raiz: Path, conservar: Conservar | None = None):
        self.cliente = cliente
        self.bucket = bucket
        self.raiz = Path(raiz)
        self.transferencia = TransferConfig(multipart_threshold=MULTIPART_DESDE)
        self.conservar = conservar or (lambda _clave: True)

    def _remotos(self, subdirectorio: str) -> dict[str, str]:
        """clave → ETag sin comillas."""
        remotos: dict[str, str] = {}
        paginas = self.cliente.get_paginator("list_objects_v2").paginate(
            Bucket=self.bucket, Prefix=f"{subdirectorio}/"
        )
        for pagina in paginas:
            for objeto in pagina.get("Contents", []):
                remotos[objeto["Key"]] = objeto["ETag"].strip('"')
        return remotos

    def bajar(self) -> int:
        bajados = 0
        for subdirectorio in SUBDIRECTORIOS:
            for clave, etag in self._remotos(subdirectorio).items():
                if _ignorado(clave) or not self.conservar(clave):
                    continue
                local = self.raiz / clave
                if local.exists() and _md5(local) == etag:
                    continue
                local.parent.mkdir(parents=True, exist_ok=True)
                # A un temporal y luego se renombra: un corte a medias no deja
                # un parquet truncado que la corrida siguiente daría por bueno.
                temporal = local.with_name(local.name + ".tmp")
                self.cliente.download_file(self.bucket, clave, str(temporal))
                temporal.replace(local)
                bajados += 1
        logger.info("almacén: %d archivos bajados de %s", bajados, self.bucket)
        return bajados

    def subir(self) -> int:
        subidos = 0
        for subdirectorio in SUBDIRECTORIOS:
            remotos = self._remotos(subdirectorio)
            base = self.raiz / subdirectorio
            locales = sorted(p for p in base.rglob("*") if p.is_file()) if base.exists() else []
            for local in locales:
                if _ignorado(local.name):
                    continue
                clave = local.relative_to(self.raiz).as_posix()
                if not self.conservar(clave) or remotos.get(clave) == _md5(local):
                    continue
                self.cliente.upload_file(str(local), self.bucket, clave, Config=self.transferencia)
                subidos += 1
            # Después de subir, no antes: si la subida falla a medias, el bucket
            # conserva la versión anterior entera.
            self._borrar([c for c in remotos if not self.conservar(c)])
        logger.info("almacén: %d archivos subidos a %s", subidos, self.bucket)
        return subidos

    def _borrar(self, claves: list[str]) -> None:
        # `delete_objects` admite hasta 1.000 claves por petición.
        for i in range(0, len(claves), 1000):
            lote = claves[i : i + 1000]
            self.cliente.delete_objects(
                Bucket=self.bucket, Delete={"Objects": [{"Key": c} for c in lote]}
            )
        if claves:
            logger.info(
                "almacén: %d archivos fuera de la ventana borrados de %s", len(claves), self.bucket
            )


def desde_entorno(
    raiz: Path,
    entorno: Mapping[str, str] = os.environ,
    crear_cliente: Callable[..., Any] = boto3.client,
    conservar: Conservar | None = None,
) -> Almacen:
    """El almacén que pide `ETL_ALMACEN`. Falla aquí, antes de tocar nada."""
    modo = (entorno.get(VARIABLE_MODO) or "").strip().lower()
    if modo == "disco":
        return AlmacenDisco()
    if modo != "r2":
        raise AlmacenMalConfigurado(
            f"{VARIABLE_MODO} tiene que ser «r2» o «disco» (vale «{modo or 'vacía'}»). "
            "Sin valor por defecto a propósito: caer a disco en producción "
            "reconstruiría el análisis sólo con los tres meses recién bajados."
        )
    faltan = [v for v in VARIABLES_R2 if not (entorno.get(v) or "").strip()]
    if faltan:
        raise AlmacenMalConfigurado(
            f"{VARIABLE_MODO}=r2 pero faltan: {', '.join(faltan)}. "
            "Están en el panel de Cloudflare → R2 → Manage API tokens."
        )
    cliente = crear_cliente(
        "s3",
        endpoint_url=entorno["R2_ENDPOINT_URL"],
        aws_access_key_id=entorno["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=entorno["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    return AlmacenR2(cliente, entorno["R2_BUCKET"], raiz, conservar)
