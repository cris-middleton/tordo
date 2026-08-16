"""«Tu posición»: la traducción de RUT a código de proveedor y sus bordes.

El test que había aquí comprobaba `_normalize_rut`, una función que dejaba el
RUT en `12345678-9` para compararlo con `CodigoProveedor`. Pasaba siempre, y
mientras tanto **la comparación que autorizaba no acertaba nunca**: en la tabla
real ningún `CodigoProveedor` tiene esa forma. Un test verde sobre la mitad
equivocada del problema.
"""

from __future__ import annotations

from app.repositories.proveedores import variantes_rut


class TestVariantesRut:
    """Un mismo RUT puede estar escrito de tres formas en `ordenes_compra`."""

    def test_cubre_las_tres_escrituras(self):
        assert variantes_rut("12345678-9") == ["12345678-9", "123456789", "12.345.678-9"]

    def test_da_igual_como_lo_escriba_el_usuario(self):
        esperado = variantes_rut("12345678-9")
        assert variantes_rut("12.345.678-9") == esperado
        assert variantes_rut("123456789") == esperado
        assert variantes_rut(" 12.345.678-9 ") == esperado

    def test_el_digito_verificador_k_se_normaliza_en_mayuscula(self):
        assert "12345678-K" in variantes_rut("12345678-k")

    def test_un_rut_corto_agrupa_bien_los_puntos(self):
        assert variantes_rut("1234567-8") == ["1234567-8", "12345678", "1.234.567-8"]

    def test_lo_vacio_no_produce_candidatos(self):
        """Devolver una lista vacía importa: un `IN ()` con basura dentro
        recorrería la tabla para no encontrar nada."""
        assert variantes_rut("") == []
        assert variantes_rut("   ") == []
        assert variantes_rut("9") == []


class TestMiPosicion:
    def test_sin_codigo_o_sin_rubro_no_consulta(self):
        from app.services import bi as bi_service

        assert bi_service.get_mi_posicion("", "Equipos médicos")["disponible"] is False
        assert bi_service.get_mi_posicion("1451428", "")["disponible"] is False

    def test_sin_tablas_materializadas_lo_dice(self, monkeypatch):
        from app.repositories import analytics_sync
        from app.services import bi as bi_service

        monkeypatch.setattr(analytics_sync, "consultar", lambda *a, **k: None)
        monkeypatch.setattr(analytics_sync, "buscar_texto", lambda *a, **k: None)
        monkeypatch.setattr(analytics_sync, "existe_tabla", lambda *a, **k: False)

        resultado = bi_service.get_mi_posicion("1451428", "Algún rubro")
        assert resultado["disponible"] is False
