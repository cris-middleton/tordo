"""Sin ticket de Mercado Público, el ETL falla al construirse y no al usarse.

**El caso que motivó esto.** `infra/docker-compose.yml` traía un ticket de
demostración como valor por defecto:

    MERCADO_PUBLICO_TICKET: ${MERCADO_PUBLICO_TICKET:-F8537A18-...}

Así que un despliegue que olvidara la variable **no fallaba**: salía a la API con
la credencial compartida de pruebas y traía datos limitados, pareciendo que
funcionaba. Es la peor forma de fallar — la que no se nota hasta que alguien
compara las cifras con Mercado Público.

Quitado el respaldo, quedaba el otro extremo: con la variable vacía el extractor
se construía igual y reventaba en la primera petición con un error genérico de
la API, indistinguible de una caída del servicio, después de tres reintentos.
Ahora falla al construirse, diciendo qué falta y dónde se pide.
"""

from __future__ import annotations

import pytest

from etl.extractors.mercado_publico_licitaciones import MercadoPublicoLicitacionesExtractor

CONFIG_BASE = {
    "MERCADO_PUBLICO_URL": "https://api.mercadopublico.cl",
    "MAX_RETRIES": 1,
    "RETRY_DELAY": 0,
}


class TestTicketObligatorio:
    def test_sin_ticket_no_se_construye(self):
        with pytest.raises(ValueError, match="MERCADO_PUBLICO_TICKET"):
            MercadoPublicoLicitacionesExtractor({**CONFIG_BASE, "MERCADO_PUBLICO_TICKET": ""})

    def test_el_mensaje_dice_dónde_se_pide(self):
        """Un error que no dice cómo arreglarlo obliga a leer el código."""
        with pytest.raises(ValueError) as exc:
            MercadoPublicoLicitacionesExtractor({**CONFIG_BASE, "MERCADO_PUBLICO_TICKET": ""})
        mensaje = str(exc.value)
        assert "api.mercadopublico.cl" in mensaje
        assert ".env" in mensaje

    def test_con_ticket_se_construye_normal(self):
        extractor = MercadoPublicoLicitacionesExtractor(
            {**CONFIG_BASE, "MERCADO_PUBLICO_TICKET": "un-ticket-cualquiera"}
        )
        assert extractor.ticket == "un-ticket-cualquiera"
        assert extractor.api_url.endswith("/servicios/v1/publico/licitaciones.json")
