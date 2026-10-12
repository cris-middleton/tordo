"""El catálogo no sirve el payload crudo de la API ni la lista de oferentes.

Publicaban nombre y RUT de personas naturales —también de las que no ganaron—
y nada los usaba. Ver docs/API_PUBLICA.md, «Personas naturales».
"""

from types import SimpleNamespace

from app.schemas.tender import LicitacionDetalleResponse

CAMPOS_RETIRADOS = {"datos_completos", "participantes"}


def test_el_esquema_no_los_declara():
    assert not CAMPOS_RETIRADOS & set(LicitacionDetalleResponse.model_fields)


def test_aunque_la_fila_los_tenga_no_salen():
    fila = SimpleNamespace(
        id=1,
        licitacion_id=1,
        codigo_externo="1234-5-LE26",
        datos_completos={"Listado": [{"Participantes": [{"Nombre": "JUAN PÉREZ"}]}]},
        participantes=[{"Rut": "12.708.987-6", "Nombre": "JUAN PÉREZ"}],
        items=None,
        documentos=None,
        proveedor_adjudicado="Persona natural",
    )
    salida = LicitacionDetalleResponse.model_validate(fila, from_attributes=True).model_dump()
    assert not CAMPOS_RETIRADOS & set(salida)
    assert "JUAN" not in repr(salida)
