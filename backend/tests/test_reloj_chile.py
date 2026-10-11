"""El día del producto es el de Chile, no el del servidor.

TORDO es sólo para Chile y todo lo que se cuenta «por día» —entonces la cuota de
BI, el vencimiento de un documento, lo que cierra hoy— se cuenta en
`America/Santiago`. Las cuotas y los documentos se fueron con las cuentas en el
pivote público; la regla y `hoy_chile()` se quedan para lo que venga (paso 5).
Siete sitios usaban `date.today()`, que devuelve la fecha local del proceso: UTC
dentro del contenedor. Con Chile en UTC-4 eso adelanta el cambio de día a las
20:00 de Santiago, así que durante las últimas cuatro horas de cada jornada:

- la cuota diaria de BI ya se había renovado (quien la gastó por la mañana
  esperaba hasta el anochecer; quien la gastó a las 19:00 recibía tres más una
  hora después);
- un documento que vencía HOY se daba por vencido.

Ninguna prueba lo habría notado corriendo en una máquina configurada en Chile:
`date.today()` y `hoy_chile()` coinciden salvo en esa franja. Por eso estos
tests fijan un instante concreto en vez de mirar el reloj.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.core.tiempo import ZONA_CHILE, hoy_chile

#: 16 de agosto de 2026, 01:30 UTC = 21:30 del día 15 en Santiago.
#: La franja en la que las dos fechas discrepan.
INSTANTE_CONFLICTIVO = datetime(2026, 8, 16, 1, 30, tzinfo=UTC)


class TestZona:
    def test_la_zona_es_la_de_chile(self):
        assert ZoneInfo("America/Santiago") == ZONA_CHILE

    def test_en_la_franja_conflictiva_utc_ya_cambio_de_dia_y_chile_no(self):
        """La premisa del bug, escrita como test para que no se discuta."""
        assert INSTANTE_CONFLICTIVO.date() == date(2026, 8, 16)
        assert INSTANTE_CONFLICTIVO.astimezone(ZONA_CHILE).date() == date(2026, 8, 15)

    def test_hoy_chile_devuelve_la_fecha_de_santiago(self, monkeypatch):
        class RelojFijo(datetime):
            @classmethod
            def now(cls, tz=None):
                return INSTANTE_CONFLICTIVO.astimezone(tz) if tz else INSTANTE_CONFLICTIVO

        monkeypatch.setattr("app.core.tiempo.datetime", RelojFijo)
        assert hoy_chile() == date(2026, 8, 15)
