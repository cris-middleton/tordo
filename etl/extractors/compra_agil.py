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
from typing import Any, Dict, Iterator, List

import requests

from etl.config import config as etl_config
from etl.extractors.base import BaseExtractor
from etl.utils import now_santiago

#: La API v2 vive en otro host que la clásica.
URL_BASE = "https://api2.mercadopublico.cl"

#: La API acepta entre 10 y 50 (lo dice su propio 400). **Con 50 responde 504**
#: «Endpoint request timed out» — medido el 2026-09-24 sobre ventanas de 3 h y de
#: 24 h —, y con 25 no. Se usa 25.
TAMANO_PAGINA_MAX = 25

#: Cada consulta cubre como mucho esto. Una ventana de 24 h devolvía
#: `total_resultados = 10000` exacto —un tope del buscador, no el número real— y
#: además caía en 504: la sincronización diaria de un día entero era INCOMPLETA
#: sin avisar. Una hora de cambios son unos cientos, lejos de ambos límites.
VENTANA_MAXIMA = timedelta(hours=1)

#: Lo que cubre una pasada sin ventana explícita. Es la horaria, y se solapa una
#: hora con la anterior: un registro que se cae de una pasada entra en la otra.
VENTANA_POR_DEFECTO = timedelta(hours=2)

#: Formato de las fechas de la consulta. La API las marca con `Z`, pero sus
#: horas son de Chile: los cierres llegan a las 10:00 «Z», que en UTC serían las
#: 07:00 en Chile. Se consulta en hora de Chile, igual que responde.
FORMATO_CONSULTA = "%Y-%m-%dT%H:%M:%SZ"

#: Cortafuegos: si la paginación se descontrolara, esto evita un bucle infinito
#: contra una API con cuota diaria.
MAX_PAGINAS = 400


def _a_datetime(valor: str | datetime | None) -> datetime | None:
    if valor is None or isinstance(valor, datetime):
        return valor
    return datetime.strptime(valor.replace("Z", ""), "%Y-%m-%dT%H:%M:%S")


def tramos(desde: datetime, hasta: datetime) -> Iterator[tuple[datetime, datetime]]:
    """La ventana [desde, hasta) en tramos de como mucho `VENTANA_MAXIMA`."""
    inicio = desde
    while inicio < hasta:
        fin = min(inicio + VENTANA_MAXIMA, hasta)
        yield inicio, fin
        inicio = fin


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

    def _pedir(
        self, params: Dict[str, Any], intento: int = 0, url: str | None = None
    ) -> Dict[str, Any] | None:
        try:
            respuesta = requests.get(
                url or self.api_url,
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
                return self._pedir(params, intento + 1, url)
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
        cambio_desde: str | datetime | None = None,
        cambio_hasta: str | datetime | None = None,
        estados: str | None = None,
        **kwargs,
    ) -> List[Dict[str, Any]]:
        """Todas las Compras Ágiles con cambios en la ventana indicada.

        Sin ventana, las últimas `VENTANA_POR_DEFECTO`. La ventana se parte en
        tramos de `VENTANA_MAXIMA`: ver ahí por qué una consulta ancha pierde
        datos en silencio.
        """
        hasta = _a_datetime(cambio_hasta) or now_santiago().replace(tzinfo=None)
        desde = _a_datetime(cambio_desde) or hasta - VENTANA_POR_DEFECTO

        registros: List[Dict[str, Any]] = []
        vistos: set[str] = set()
        for inicio, fin in tramos(desde, hasta):
            for registro in self._extraer_tramo(
                inicio.strftime(FORMATO_CONSULTA), fin.strftime(FORMATO_CONSULTA), estados
            ):
                # Un registro que cambia justo en el borde sale en dos tramos.
                codigo = registro.get("codigo")
                if codigo in vistos:
                    continue
                vistos.add(codigo)
                registros.append(registro)
        self.logger.info("Compra Ágil: %d registros entre %s y %s", len(registros), desde, hasta)
        return registros

    def _extraer_tramo(
        self, cambio_desde: str, cambio_hasta: str, estados: str | None
    ) -> List[Dict[str, Any]]:
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

    def extract_detalle(self, codigo: str) -> Dict[str, Any] | None:
        """El detalle de una Compra Ágil: descripción e ítems, que el listado no trae.

        Trae además cada cotización con su precio y quién fue seleccionado
        (`proveedores_cotizando`) — verificado en vivo. Hoy se usa la
        descripción y los ítems; el resto queda en `informacion_adicional`.
        """
        cuerpo = self._pedir({}, url=f"{self.api_url}/{codigo}")
        return self._payload(cuerpo)

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
