"""Los campos de `licitaciones` que sólo trae el detalle.

**Por qué existe.** El listado diario de la API clásica devuelve cuatro cosas por
licitación: código, nombre, estado y fecha de cierre. Fecha de publicación,
monto, comprador, región e ítems vienen sólo en el detalle, que se guardaba
íntegro en `licitaciones_detalle.datos_completos` — y nada los copiaba a
`licitaciones`, que es la tabla que lee todo lo demás. Medido sobre la base de
desarrollo: 0 de 4.379 licitaciones con monto, región u organismo, y la fecha de
publicación era la hora de ingesta (`LicitacionTransformer` rellena con
`now_santiago()` lo que no viene). Consecuencias: toda tarjeta decía «Sin monto»,
los filtros por monto y región no podían encontrar nada y el panel de BI de una
licitación respondía «organismo_id no disponible». Las órdenes de compra tenían
esto resuelto desde siempre (`_sync_orden_compra_base_from_detalle`); a las
licitaciones les faltaba el gemelo.

**La forma SÍ está verificada contra respuestas reales** (detalles guardados en
2026-09, ver `tests/test_licitacion_base.py`): las fechas vienen anidadas en
`Fechas`, y la `FechaCierre` plana de la raíz existe pero llega **nula** — al
revés de lo que suponía `adjudicacion.py`. Por eso aquí la anidada va primero.
Un monto oculto (`VisibilidadMonto = 0`) llega como `null`, nunca como 0.

Las fechas se parsean igual que en el transformer —ingenuas, hora de Chile tal
cual—, para que todas las fechas de una misma fila sigan la misma convención.
"""

from __future__ import annotations

from typing import Any

from etl.utils.adjudicacion import _a_float, _items_de, _parsear_fecha, _primero


def objeto_principal(datos: Any) -> dict:
    """La respuesta llega como `{"Listado": [ {...} ]}`; a veces, el objeto a secas."""
    if not isinstance(datos, dict):
        return {}
    listado = datos.get("Listado")
    if isinstance(listado, list) and listado and isinstance(listado[0], dict):
        return listado[0]
    return datos


def campos_base_desde_detalle(datos: Any) -> dict[str, Any]:
    """Columnas de `licitaciones` presentes en el detalle, sólo las que traen valor.

    Lo que el detalle no trae no aparece en el resultado: quien aplica esto no
    debe pisar un dato bueno con un vacío.
    """
    main = objeto_principal(datos)
    fechas = main.get("Fechas") if isinstance(main.get("Fechas"), dict) else {}
    comprador = main.get("Comprador") if isinstance(main.get("Comprador"), dict) else {}

    def fecha(campo: str):
        return _parsear_fecha(_primero(fechas.get(campo), main.get(campo)))

    codigo_organismo = _primero(comprador.get("CodigoOrganismo"))

    campos = {
        "fecha_publicacion": fecha("FechaPublicacion"),
        "fecha_cierre": fecha("FechaCierre"),
        "fecha_inicio": fecha("FechaInicio"),
        "fecha_final": fecha("FechaFinal"),
        "monto_estimado": _a_float(main.get("MontoEstimado")),
        "moneda": main.get("Moneda"),
        "tipo_licitacion": main.get("Tipo"),
        "estado": main.get("Estado"),
        "descripcion": main.get("Descripcion"),
        # Puede llegar como número; la columna es texto y el BI compara texto.
        "codigo_organismo": str(codigo_organismo) if codigo_organismo is not None else None,
        "nombre_organismo": comprador.get("NombreOrganismo"),
        "rut_organismo": comprador.get("RutUnidad"),
        "region": comprador.get("RegionUnidad"),
        "comuna": comprador.get("ComunaUnidad"),
        # Lista plana de ítems: es lo que lee el panel de BI (`CodigoProducto`).
        "items": _items_de(main),
    }
    # La API rellena con espacios: «Región del Biobío », «Región de Tarapacá  ».
    # Guardadas así, filtrar por región no encontraba 9 de las 16.
    campos = {k: v.strip() if isinstance(v, str) else v for k, v in campos.items()}
    return {k: v for k, v in campos.items() if v not in (None, "", [])}
