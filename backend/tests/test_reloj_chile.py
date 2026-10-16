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

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.tiempo import ZONA_CHILE, en_hora_de_chile, hoy_chile, inicio_del_dia

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


class TestInicioDelDia:
    """El borde de un «hoy» de Chile, en UTC: lo usan los tramos de cierre y las
    publicadas del día de la portada (`repositories/licitaciones.py`)."""

    def test_en_invierno_el_dia_empieza_a_las_cuatro_utc(self):
        assert inicio_del_dia(date(2026, 8, 15)) == datetime(2026, 8, 15, 4, 0, tzinfo=UTC)

    def test_en_verano_a_las_tres_utc(self):
        assert inicio_del_dia(date(2026, 12, 1)) == datetime(2026, 12, 1, 3, 0, tzinfo=UTC)

    def test_el_dia_del_cambio_de_hora_empieza_en_su_primer_instante_real(self):
        """El 6 de septiembre de 2026 las 00:00 no existen en Santiago: el día empieza a la
        01:00 (-03), que son las 04:00 UTC, y dura 23 horas."""
        inicio = inicio_del_dia(date(2026, 9, 6))
        fin = inicio_del_dia(date(2026, 9, 7))
        assert inicio == datetime(2026, 9, 6, 4, 0, tzinfo=UTC)
        assert fin - inicio == timedelta(hours=23)

    def test_el_instante_conflictivo_cae_en_el_dia_de_chile(self):
        assert inicio_del_dia(date(2026, 8, 15)) <= INSTANTE_CONFLICTIVO
        assert inicio_del_dia(date(2026, 8, 16)) > INSTANTE_CONFLICTIVO


class TestEnHoraDeChile:
    """Las fechas sin zona de Mercado Público son hora de pared de Chile. La usan
    los transformadores de las dos APIs (`etl/tests/test_hora_chile_api_clasica.py`)."""

    def test_sin_zona_es_hora_de_chile_y_sale_en_utc(self):
        resultado = en_hora_de_chile(datetime(2026, 10, 20, 15, 0))
        assert resultado.utcoffset() == timedelta(0)
        assert resultado == datetime(2026, 10, 20, 18, 0, tzinfo=UTC)
        assert en_hora_de_chile(datetime(2026, 6, 20, 15, 0)) == datetime(
            2026, 6, 20, 19, 0, tzinfo=UTC
        )

    def test_con_zona_se_respeta_el_instante(self):
        fecha = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)
        assert en_hora_de_chile(fecha) == fecha

    def test_la_hora_que_no_existe_lleva_el_desfase_de_antes_del_salto(self):
        assert en_hora_de_chile(datetime(2026, 9, 6, 0, 30)) == datetime(
            2026, 9, 6, 4, 30, tzinfo=UTC
        )

    def test_la_hora_repetida_es_la_primera_vez(self):
        assert en_hora_de_chile(datetime(2027, 4, 3, 23, 30)) == datetime(
            2027, 4, 4, 2, 30, tzinfo=UTC
        )
