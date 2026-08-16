"""El día del producto es el de Chile, no el del servidor.

TORDO es sólo para Chile y todo lo que se cuenta «por día» —la cuota de BI, el
vencimiento de un documento, lo que cierra hoy— se cuenta en `America/Santiago`.
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

from app.core import plan_limits
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


class TestCuotaDiaria:
    def test_la_clave_del_contador_se_fecha_en_chile(self, monkeypatch):
        """Si se fecha en UTC, la cuota diaria se renueva a las 20:00 locales."""
        monkeypatch.setattr(plan_limits, "hoy_chile", lambda: date(2026, 8, 15))
        assert plan_limits._bi_redis_key("emp-1") == "bi_queries:emp-1:2026-08-15"

    def test_a_las_21_de_santiago_el_contador_sigue_siendo_el_del_mismo_dia(self, monkeypatch):
        """Es lo que garantiza que «3 consultas al día» sean 3 y no 6.

        Se fija el reloj en el instante conflictivo y se comprueba que la clave
        NO es la que habría dado la fecha UTC: con `date.today()` el contador
        saltaba a `2026-08-16` a las 21:30 del día 15 en Chile, y la empresa
        estrenaba cuota tres horas antes de que terminara su jornada.
        """

        class RelojFijo(datetime):
            @classmethod
            def now(cls, tz=None):
                return INSTANTE_CONFLICTIVO.astimezone(tz) if tz else INSTANTE_CONFLICTIVO

        monkeypatch.setattr("app.core.tiempo.datetime", RelojFijo)

        clave = plan_limits._bi_redis_key("emp-1")
        assert clave == "bi_queries:emp-1:2026-08-15"
        assert clave != f"bi_queries:emp-1:{INSTANTE_CONFLICTIVO.date().isoformat()}"


class TestVigenciaDeDocumento:
    def test_un_documento_que_vence_hoy_sigue_vigente(self, monkeypatch):
        """El caso que se rompía cada noche a partir de las 20:00."""
        from app.models import empresa as modelo_empresa

        monkeypatch.setattr(modelo_empresa, "hoy_chile", lambda: date(2026, 8, 15))

        doc = modelo_empresa.DocumentoEmpresa(fecha_vencimiento=date(2026, 8, 15))
        assert doc.esta_vigente is True

    def test_un_documento_vencido_ayer_no_lo_esta(self, monkeypatch):
        from app.models import empresa as modelo_empresa

        monkeypatch.setattr(modelo_empresa, "hoy_chile", lambda: date(2026, 8, 15))

        doc = modelo_empresa.DocumentoEmpresa(fecha_vencimiento=date(2026, 8, 14))
        assert doc.esta_vigente is False

    def test_sin_fecha_de_vencimiento_está_vigente(self, monkeypatch):
        from app.models import empresa as modelo_empresa

        monkeypatch.setattr(modelo_empresa, "hoy_chile", lambda: date(2026, 8, 15))

        doc = modelo_empresa.DocumentoEmpresa(fecha_vencimiento=None)
        assert doc.esta_vigente is True
