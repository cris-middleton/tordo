"""Extractor de Compra Ágil.

Compra Ágil **no está en la API clásica de Mercado Público**. Tiene la suya,
publicada por ChileCompra en mayo de 2026, y se diferencia en tres cosas que
importan al escribir el cliente:

1. **Otro host**: `api2.mercadopublico.cl`, no `api.mercadopublico.cl`.
2. **El ticket va en una cabecera HTTP**, no como parámetro de la URL. Sin él la
   API responde 401, no 203 como la clásica.
3. **Limita la tasa de peticiones.** Pasado el límite responde 429 con «Se ha
   superado el límite de tasa de solicitudes. Intente nuevamente más tarde.», y
   vuelve a responder minutos u horas después, el mismo día (`ESPERAS_TRAS_429`).

Referencia: «Guía de uso API Compra Ágil v3» (ChileCompra, mayo 2026).

Sobre la sincronización
-----------------------
Se usa `cambio_desde`/`cambio_hasta` y no la fecha de publicación. Una Compra
Ágil cambia de estado varias veces después de publicarse —cierra, se declara
desierta, se selecciona proveedor— y sincronizar por publicación dejaría el
estado congelado en el de la primera vez que se vio.
"""

from __future__ import annotations

import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, Iterator, List

import requests

from etl.config import config as etl_config
from etl.extractors.base import BaseExtractor, ConsultaFallida, CredencialRechazada
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
#: contra una API que limita la tasa.
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


class LimiteDeTasa(RuntimeError):
    """La API siguió respondiendo 429 después de esperar lo que se espera en una corrida."""


#: Lo que se espera antes de cada reintento tras un 429, en segundos (si la API
#: pide más con `Retry-After`, se le da). **Es un límite de tasa, no una cuota
#: diaria**, como se creyó hasta el 2026-10-24: el 429 dice «Se ha superado el
#: límite de tasa de solicitudes», y el 2026-10-23 la API cortó a las 13 UTC tras
#: 141 peticiones y a las 16 tras 4, dejó pasar 605 a las 19 y una corrida entera a
#: las 22. El código lo tomaba por la cuota del día y no volvía a pedir hasta la
#: corrida siguiente: perdió el listado de dos corridas y los detalles de otra.
ESPERAS_TRAS_429 = (30, 60, 120)

#: Lo que una corrida espera, sumando todos sus 429. Agotado, el siguiente 429
#: corta: la corrida siguiente (unas 3 h después, con ventana solapada) lo vuelve
#: a intentar, y la tarea no se alarga sin techo.
ESPERA_MAXIMA_POR_CORRIDA_S = 10 * 60


def _segundos_pedidos(cabeceras: Any) -> float | None:
    """`Retry-After` en segundos, si viene y es un número (no se lee la forma con fecha)."""
    for clave, valor in (cabeceras or {}).items():
        if clave.lower() == "retry-after":
            try:
                return max(0.0, float(valor))
            except (TypeError, ValueError):
                return None
    return None


#: Cabeceras de respuesta que podrían decir cuánta cuota queda. No se conoce el
#: límite de la API (docs/deploy_steps/tareas_manuales.md §2): el
#: 2026-10-21 la corrida de las 16 h recibió 429 en su primera petición y no
#: había cómo saber cuántas se habían gastado. Se registra lo que venga.
CABECERAS_DE_CUOTA = re.compile(r"ratelimit|rate-limit|quota|cuota|remaining|retry-after", re.I)


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
        #: Peticiones que respondió la API en esta corrida (listado y detalles):
        #: lo único que se sabe del gasto de cuota mientras no se conozca.
        self.peticiones = 0
        self._cuota_vista: Dict[str, str] = {}
        #: Segundos esperados por 429 en esta corrida (tope `ESPERA_MAXIMA_POR_CORRIDA_S`).
        self.esperado_429 = 0.0

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
        self,
        params: Dict[str, Any],
        intento: int = 0,
        url: str | None = None,
        reintentos_429: int = 0,
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
                return self._pedir(params, intento + 1, url, reintentos_429)
            self.logger.error(
                "Compra Ágil: sin respuesta tras %d intentos: %s", self.max_retries, exc
            )
            return None

        self.peticiones += 1
        cuota = self._anotar_cuota(respuesta)
        if respuesta.status_code == 429:
            espera = self._espera_tras_429(reintentos_429, respuesta)
            if espera is not None:
                self.logger.warning(
                    "Compra Ágil: 429 (límite de tasa), se espera %d s y se reintenta (%d/%d)",
                    espera,
                    reintentos_429 + 1,
                    len(ESPERAS_TRAS_429),
                )
                time.sleep(espera)
                self.esperado_429 += espera
                return self._pedir(params, intento, url, reintentos_429 + 1)
            # El mensaje lleva lo que se sabe —cuántas pidió esta corrida, cuánto
            # esperó, las cabeceras y lo que dijo la API— porque es lo que llega al
            # log y al /fail del latido.
            cuerpo = (getattr(respuesta, "text", "") or "")[:200].strip()
            raise LimiteDeTasa(
                "La API de Compra Ágil sigue en su límite de tasa tras "
                f"{reintentos_429} reintento(s); esta corrida esperó {self.esperado_429:.0f} s "
                f"por 429 y llevaba {self.peticiones} petición(es)"
                + (f"; cabeceras de cuota: {cuota}" if cuota else "")
                + (f"; la API dijo: {cuerpo}" if cuerpo else "")
                + "."
            )
        if respuesta.status_code in (401, 403):
            # Verificado en vivo (2026-10-12): un ticket inválido responde 401 con
            # «El ticket no existe, es inválido o no tiene permisos». Antes se
            # registraba y se devolvía None, y la corrida terminaba bien.
            raise CredencialRechazada(
                f"API de Compra Ágil: HTTP {respuesta.status_code}. El ticket va en la "
                "CABECERA `ticket`, no en la URL; si ya va ahí, es inválido o venció."
            )

        # 500 y 504 intermitentes, vistos en la API real: el mismo tramo
        # responde bien al reintentar. Sin esto se perdía el resto del tramo
        # hasta la pasada siguiente.
        if respuesta.status_code >= 500 and intento < self.max_retries:
            self.logger.warning(
                "Compra Ágil: %d, reintento %d/%d",
                respuesta.status_code,
                intento + 1,
                self.max_retries,
            )
            time.sleep(self.retry_delay)
            return self._pedir(params, intento + 1, url, reintentos_429)

        try:
            respuesta.raise_for_status()
        except requests.exceptions.HTTPError as exc:
            self.logger.error("Compra Ágil: %s", exc)
            return None

        return respuesta.json()

    def _espera_tras_429(self, reintentos: int, respuesta: Any) -> float | None:
        """Cuánto esperar antes de reintentar, o `None` si ya no se reintenta."""
        if reintentos >= len(ESPERAS_TRAS_429):
            return None
        espera = float(ESPERAS_TRAS_429[reintentos])
        pedida = _segundos_pedidos(getattr(respuesta, "headers", None))
        if pedida is not None:
            espera = max(espera, pedida)
        if self.esperado_429 + espera > ESPERA_MAXIMA_POR_CORRIDA_S:
            return None
        return espera

    def _anotar_cuota(self, respuesta: Any) -> Dict[str, str]:
        """Las cabeceras de cuota de la respuesta; se registran cuando cambian."""
        cabeceras = getattr(respuesta, "headers", None) or {}
        cuota = {k: str(v) for k, v in cabeceras.items() if CABECERAS_DE_CUOTA.search(k)}
        if cuota and cuota != self._cuota_vista:
            self.logger.info("Compra Ágil: cabeceras de cuota %s", cuota)
            self._cuota_vista = cuota
        return cuota

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

        Si la primera página de TODOS los tramos falla, lanza `ConsultaFallida`:
        es la API caída, no una ventana sin cambios. Un tramo suelto que falla
        se registra en ERROR y se sigue; lo recoge la primera corrida del día
        siguiente, que vuelve a mirar hacia atrás (`etl/cron.py`).
        """
        hasta = _a_datetime(cambio_hasta) or now_santiago().replace(tzinfo=None)
        desde = _a_datetime(cambio_desde) or hasta - VENTANA_POR_DEFECTO

        registros: List[Dict[str, Any]] = []
        vistos: set[str] = set()
        n_tramos = sin_respuesta = 0
        for inicio, fin in tramos(desde, hasta):
            n_tramos += 1
            del_tramo = self._extraer_tramo(
                inicio.strftime(FORMATO_CONSULTA), fin.strftime(FORMATO_CONSULTA), estados
            )
            if del_tramo is None:
                sin_respuesta += 1
                continue
            for registro in del_tramo:
                # Un registro que cambia justo en el borde sale en dos tramos.
                codigo = registro.get("codigo")
                if codigo in vistos:
                    continue
                vistos.add(codigo)
                registros.append(registro)
        if n_tramos and sin_respuesta == n_tramos:
            raise ConsultaFallida(
                f"API de Compra Ágil: falló la primera página de los {n_tramos} tramo(s) "
                f"entre {desde} y {hasta} (¿API caída?)"
            )
        self.logger.info("Compra Ágil: %d registros entre %s y %s", len(registros), desde, hasta)
        return registros

    def _extraer_tramo(
        self, cambio_desde: str, cambio_hasta: str, estados: str | None
    ) -> List[Dict[str, Any]] | None:
        """Los registros de un tramo, o `None` si ni la primera página respondió."""
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
                        "Compra Ágil: la consulta de %s a %s falló (¿API caída?). "
                        "No es que no haya resultados.",
                        cambio_desde,
                        cambio_hasta,
                    )
                    return None
                # Lo de las páginas anteriores vale, pero el tramo queda a medias.
                self.logger.error(
                    "Compra Ágil: la página %d de %s a %s falló; el tramo queda incompleto",
                    pagina,
                    cambio_desde,
                    cambio_hasta,
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
