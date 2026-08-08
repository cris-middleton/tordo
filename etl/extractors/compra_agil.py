"""Extractor de Compra Ágil.

Compra Ágil **no está en la API clásica de Mercado Público**. Tiene la suya,
publicada por ChileCompra en mayo de 2026, y se diferencia en tres cosas que
importan al escribir el cliente:

1. **Otro host**: `api2.mercadopublico.cl`, no `api.mercadopublico.cl`.
2. **El ticket va en una cabecera HTTP**, no como parámetro de la URL. Sin él la
   API responde 401, no 203 como la clásica.
3. **Hay cuota diaria.** Al agotarla responde 429 y *no se restablece hasta el
   día siguiente*: reintentar dentro del mismo día sólo gasta el resto de la
   cuota de otros procesos.

Referencia: «Guía de uso API Compra Ágil v3» (ChileCompra, mayo 2026).

Sobre la sincronización
-----------------------
Se usa `cambio_desde`/`cambio_hasta` y no la fecha de publicación. Una Compra
Ágil cambia de estado varias veces después de publicarse —cierra, se declara
desierta, se selecciona proveedor— y sincronizar por publicación dejaría el
estado congelado en el de la primera vez que se vio.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any, Dict, List

import requests

from etl.config import config as etl_config
from etl.extractors.base import BaseExtractor
from etl.utils import now_santiago

#: La API v2 vive en otro host que la clásica.
URL_BASE = "https://api2.mercadopublico.cl"

#: Tope que impone la propia API (§5.1, grupo 6). Pedir más no da más.
TAMANO_PAGINA_MAX = 50

#: Cortafuegos: si la paginación se descontrolara, esto evita un bucle infinito
#: contra una API con cuota diaria.
MAX_PAGINAS = 400


class CuotaDiariaAgotada(RuntimeError):
    """La API respondió 429. No se reintenta: la cuota vuelve mañana."""


class CompraAgilExtractor(BaseExtractor):
    """Lee Compras Ágiles de la API v2 de Mercado Público."""

    def __init__(self, config_dict: Dict[str, Any] | None = None):
        super().__init__(config_dict)

        entrada = config_dict or {}
        # El ticket de la v2 se pide en el mismo sitio que el de la clásica, así
        # que normalmente es el mismo. Se deja una variable propia por si
        # ChileCompra separa las cuotas.
        self.ticket = (
            entrada.get("COMPRA_AGIL_TICKET")
            or getattr(etl_config, "COMPRA_AGIL_TICKET", None)
            or entrada.get("MERCADO_PUBLICO_TICKET")
            or etl_config.MERCADO_PUBLICO_TICKET
        )
        self.base_url = entrada.get("COMPRA_AGIL_URL", URL_BASE)
        self.api_url = f"{self.base_url}/v2/compra-agil"
        self.max_retries = int(entrada.get("MAX_RETRIES", 3))
        self.retry_delay = int(entrada.get("RETRY_DELAY", 2))

    def validate(self, data: Dict[str, Any]) -> bool:
        """Un registro sirve si tiene código y fecha de publicación.

        Son las dos cosas sin las que la fila no entra: el código es la clave de
        negocio y la fecha es NOT NULL en el modelo.
        """
        if not isinstance(data, dict):
            return False
        fechas = data.get("fechas") or {}
        return bool(data.get("codigo")) and bool(fechas.get("fecha_publicacion"))

    # ── HTTP ─────────────────────────────────────────────────────────────────

    def _pedir(self, params: Dict[str, Any], intento: int = 0) -> Dict[str, Any] | None:
        try:
            respuesta = requests.get(
                self.api_url,
                params=params,
                # La cabecera, no la query. Es la diferencia con la API clásica
                # que más veces se escribe mal.
                headers={"ticket": self.ticket, "Accept": "application/json"},
                timeout=30,
            )
        except requests.exceptions.RequestException as exc:
            if intento < self.max_retries:
                self.logger.warning(
                    "Compra Ágil: fallo de red, reintento %d/%d: %s",
                    intento + 1,
                    self.max_retries,
                    exc,
                )
                time.sleep(self.retry_delay)
                return self._pedir(params, intento + 1)
            self.logger.error(
                "Compra Ágil: sin respuesta tras %d intentos: %s", self.max_retries, exc
            )
            return None

        if respuesta.status_code == 429:
            # No se reintenta a propósito: la cuota es DIARIA. Insistir hoy sólo
            # consume lo que quede para el resto de procesos.
            raise CuotaDiariaAgotada(
                "La API de Compra Ágil agotó su cuota diaria. Se restablece mañana."
            )
        if respuesta.status_code == 401:
            self.logger.error(
                "Compra Ágil: 401. El ticket va en la CABECERA `ticket`, no en la URL."
            )
            return None

        try:
            respuesta.raise_for_status()
        except requests.exceptions.HTTPError as exc:
            self.logger.error("Compra Ágil: %s", exc)
            return None

        return respuesta.json()

    @staticmethod
    def _payload(cuerpo: Dict[str, Any] | None) -> Dict[str, Any] | None:
        """Desenvuelve `{"success": "OK", "payload": {...}, "errors": ...}`.

        La v2 SÍ usa envelope, al contrario que nuestra propia API. Un
        `success != "OK"` con HTTP 200 es posible, así que se comprueba.
        """
        if not isinstance(cuerpo, dict):
            return None
        if cuerpo.get("success") != "OK":
            return None
        payload = cuerpo.get("payload")
        return payload if isinstance(payload, dict) else None

    # ── Extracción ───────────────────────────────────────────────────────────

    def extract(
        self,
        cambio_desde: str | None = None,
        cambio_hasta: str | None = None,
        estados: str | None = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """Todas las Compras Ágiles con cambios en la ventana indicada.

        Sin ventana, se toman las últimas 24 horas: es la cadencia con la que
        corre el ETL y evita pedir el histórico entero en cada pasada.
        """
        if not cambio_desde:
            cambio_desde = (now_santiago() - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        if not cambio_hasta:
            cambio_hasta = now_santiago().strftime("%Y-%m-%dT%H:%M:%SZ")

        self.logger.info("Compra Ágil: cambios entre %s y %s", cambio_desde, cambio_hasta)

        registros: List[Dict[str, Any]] = []
        pagina = 1
        while pagina <= MAX_PAGINAS:
            params: Dict[str, Any] = {
                "cambio_desde": cambio_desde,
                "cambio_hasta": cambio_hasta,
                "tamano_pagina": TAMANO_PAGINA_MAX,
                "numero_pagina": pagina,
            }
            if estados:
                params["estado"] = estados

            payload = self._payload(self._pedir(params))
            if payload is None:
                if pagina == 1:
                    # Distinguir "no hay Compras Ágiles" de "no se pudo
                    # preguntar". Sin esto, un ticket inválido se registra como
                    # «0 registros» y la integración parece funcionar mientras
                    # no trae nada.
                    self.logger.error(
                        "Compra Ágil: la consulta falló (¿ticket inválido o API caída?). "
                        "No es que no haya resultados."
                    )
                break

            items = payload.get("items") or []
            registros.extend(items)

            paginacion = payload.get("paginacion") or {}
            total_paginas = int(paginacion.get("total_paginas") or 0)
            if pagina >= total_paginas or not items:
                break
            pagina += 1
        else:
            self.logger.warning(
                "Compra Ágil: se alcanzó el tope de %d páginas. ¿Ventana demasiado ancha?",
                MAX_PAGINAS,
            )

        self.logger.info("Compra Ágil: %d registros en %d página(s)", len(registros), pagina)
        return registros

    def extract_por_fecha_publicacion(
        self, desde: datetime, hasta: datetime, **kwargs
    ) -> List[Dict[str, Any]]:
        """Carga histórica por fecha de PUBLICACIÓN.

        Sólo para rellenar hacia atrás. Para la operación diaria se usa
        `extract`, que sincroniza por cambios: una Compra Ágil sigue cambiando
        de estado después de publicarse.
        """
        registros: List[Dict[str, Any]] = []
        pagina = 1
        while pagina <= MAX_PAGINAS:
            payload = self._payload(
                self._pedir(
                    {
                        "publicado_desde": desde.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "publicado_hasta": hasta.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "tamano_pagina": TAMANO_PAGINA_MAX,
                        "numero_pagina": pagina,
                        "ordenar_por": "FechaPublicacion",
                    }
                )
            )
            if payload is None:
                break
            items = payload.get("items") or []
            registros.extend(items)
            total_paginas = int((payload.get("paginacion") or {}).get("total_paginas") or 0)
            if pagina >= total_paginas or not items:
                break
            pagina += 1
        return registros
