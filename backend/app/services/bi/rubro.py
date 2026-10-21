"""El panorama de un rubro, agregado al nivel en que el usuario piensa.

**El hueco que tapa este módulo.** Todo el BI estaba construido alrededor del par
*(organismo, rubro)*: cada tabla, cada score, cada gráfico. Pero un dueño de PYME
no llega preguntando por un par — llega preguntando *«¿cómo está mi rubro?»*. Al
no existir esa vista, la pantalla resolvía la pregunta enseñando **el primer
organismo de una lista ordenada por otra cosa**, y presentaba sus números como si
fueran los del mercado. De ahí salieron los dos errores que este PR corrige: el
«líder del rubro» que era el líder de un comprador, y la «posición» que era la
posición en una fila suelta.

Todo lo de aquí se calcula con tablas que ya existían y nadie agregaba:

- **Tamaño y ticket** — `time_series`, sumando el último año completo.
- **Concentración real** — cuota de cada proveedor sobre el monto del rubro
  entero, y el HHI de esas cuotas.
- **Estacionalidad del rubro** — `seasonality_patterns` sumado por mes. Antes
  sólo existía la de un organismo, que para decidir cuándo prepararse no sirve.
- **Compradores con banderas** — `buyer_risk_flags` no se consultaba desde
  ninguna pantalla del dashboard, teniendo 203 filas de avisos concretos.

Todas las consultas van con el filtro empujado y con la lista de columnas
acotada: `competitors_by_market` tiene 4,2 millones de filas y
`seasonality_patterns` 1,78 millones.
"""

from __future__ import annotations

import logging

import polars as pl

from app.services.bi._base import _agregado, _distintos, _load, _totales, clasificar_hhi
from app.services.bi.temporal import anios_completos, ventana_de_los_datos

logger = logging.getLogger(__name__)

#: Cuántos proveedores y compradores se devuelven en los rankings. Más de diez
#: no se leen en una pantalla y sí cuestan en la respuesta.
TOP = 10

#: Meses en el orden en que se muestran.
MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _tamano_del_mercado(rubro: str) -> dict:
    """Monto y órdenes del último año COMPLETO, más el ticket típico.

    El último año completo y no el corriente: en enero, el año en curso lleva un
    mes y compararlo con el anterior sugiere un desplome que no existe. Es el
    mismo criterio que usa el cálculo del CAGR (`anios_completos`).
    """
    ts = _load(
        "time_series.parquet",
        filtros={"RubroN2": rubro},
        columnas=["anio", "mes", "n_oc", "monto_total"],
    )
    if ts is None or ts.is_empty():
        return {"disponible": False}

    completos = anios_completos(ts, ventana_de_los_datos())
    if not completos:
        return {"disponible": False}

    ultimo = max(completos)
    anual = (
        ts.filter(pl.col("anio") == ultimo)
        .select(
            pl.col("monto_total").sum().alias("monto"),
            pl.col("n_oc").sum().alias("oc"),
        )
        .row(0, named=True)
    )
    oc = int(anual["oc"] or 0)
    monto = float(anual["monto"] or 0)
    return {
        "disponible": oc > 0,
        "anio": int(ultimo),
        "monto_clp": monto,
        "n_oc": oc,
        # Ticket PROMEDIO y no mediano porque `time_series` viene ya agregado por
        # mes: no quedan órdenes individuales sobre las que sacar una mediana.
        # Se nombra como lo que es para que nadie lo lea como «lo que suele
        # costar una orden».
        "ticket_promedio_clp": round(monto / oc) if oc else None,
    }


def _competencia_del_rubro(rubro: str) -> dict:
    """Quién gana en el rubro, con qué cuota, y cuán concentrado está.

    Agregado por proveedor en SQL (`_agregado`, `_totales`): antes se traían a
    la API todas las filas del rubro en `competitors_by_market` —una por
    organismo y proveedor— para devolver diez, y `/mercado` lo hacía tres veces
    al abrir un rubro (aquí, en los compradores a vigilar y en el resumen).
    """
    filtros = {"RubroN2": rubro}
    sumas = ["monto_total", "n_oc"]
    total = _totales(
        "competitors_by_market.parquet",
        "CodigoProveedor",
        filtros=filtros,
        sumas=sumas,
        distintos=["CodigoOrganismoPublico"],
    )
    if total is None or not total["grupos"]:
        return {"disponible": False}

    monto_rubro = float(total["monto_total"] or 0)
    if monto_rubro <= 0:
        return {"disponible": False}

    oc_rubro = int(total["n_oc"] or 0)

    top = _agregado(
        "competitors_by_market.parquet",
        "CodigoProveedor",
        filtros=filtros,
        sumas=sumas,
        distintos=["CodigoOrganismoPublico"],
        primeros=["NombreProveedor"],
        limite=TOP,
    )
    lideres = [
        {
            "nombre": r["NombreProveedor"],
            "share_pct": (r["monto_total"] or 0) / monto_rubro * 100,
            # **Cuota por ÓRDENES, no sólo por monto.** El monto lo puede
            # dominar una sola compra enorme: en «Suministros de oficina» un
            # proveedor tiene el 85 % del monto y la lectura ingenua es «este
            # mercado está tomado». La cuota por órdenes dice contra qué se
            # compite de verdad — cuántas veces gana alguien, no cuánto factura
            # — y es la cifra que le sirve a una PYME que pelea compras chicas.
            "share_oc_pct": (r["n_oc"] or 0) / max(oc_rubro, 1) * 100,
            "oc": r["n_oc"] or 0,
            "compradores": r["distintos_CodigoOrganismoPublico"],
        }
        for r in top.iter_rows(named=True)
    ]

    # El HHI es la suma de los cuadrados de las cuotas: Σ(mᵢ/M·100)² =
    # Σmᵢ² / M² · 10.000, y `cuadrados` es Σmᵢ² sobre TODOS los proveedores.
    hhi = float(total["cuadrados"] or 0) / monto_rubro**2 * 10_000

    return {
        "disponible": True,
        "n_proveedores": int(total["grupos"]),
        "n_compradores": int(total["distintos_CodigoOrganismoPublico"]),
        "monto_clp": monto_rubro,
        "n_oc": oc_rubro,
        "hhi": round(hhi),
        "tipo_mercado": clasificar_hhi(hhi),
        # Cuánto se llevan los cinco primeros. Es más legible que el HHI y dice
        # lo mismo: «entre cinco se llevan el 80 %» se entiende sin explicación.
        "share_top5_pct": round(sum(lider["share_pct"] for lider in lideres[:5]), 1),
        "lideres": [
            {
                "nombre": r["nombre"],
                "share_pct": round(float(r["share_pct"]), 2),
                "share_oc_pct": round(float(r["share_oc_pct"]), 2),
                "n_oc": int(r["oc"]),
                "n_compradores": int(r["compradores"]),
            }
            for r in lideres
        ],
    }


def _estacionalidad_del_rubro(rubro: str) -> dict:
    """En qué meses compra este rubro, sumando todos sus compradores.

    La estacionalidad que existía era la de UN organismo, y para decidir cuándo
    tener el equipo disponible eso no sirve: lo que importa es cuándo se mueve
    el mercado.
    """
    df = _load(
        "seasonality_patterns.parquet",
        filtros={"RubroN2": rubro},
        columnas=["mes", "compras_mes"],
    )
    if df is None or df.is_empty():
        return {"disponible": False}

    por_mes = df.group_by("mes").agg(pl.col("compras_mes").sum().alias("compras")).sort("mes")
    total = float(por_mes.select(pl.col("compras").sum()).item() or 0)
    if total <= 0:
        return {"disponible": False}

    meses = [
        {
            "mes": int(r["mes"]),
            "nombre": MESES[int(r["mes"]) - 1] if 1 <= int(r["mes"]) <= 12 else "?",
            "pct": round(float(r["compras"]) / total * 100, 1),
        }
        for r in por_mes.iter_rows(named=True)
    ]
    if not meses:
        return {"disponible": False}

    ordenados = sorted(meses, key=lambda m: m["pct"], reverse=True)
    # «Concentración» aquí es cuánto del año se juega en los tres meses más
    # activos. Con reparto perfectamente plano serían 25 %; muy por encima
    # significa que el rubro tiene temporada.
    top3 = round(sum(m["pct"] for m in ordenados[:3]), 1)

    return {
        "disponible": True,
        "meses": meses,
        "mes_pico": ordenados[0]["nombre"],
        "pct_pico": ordenados[0]["pct"],
        "pct_top3": top3,
        "tiene_temporada": top3 >= 35,
    }


def _compradores_a_vigilar(rubro: str) -> dict:
    """Los compradores del rubro que tienen banderas de riesgo.

    `buyer_risk_flags` existía y **ninguna pantalla del dashboard la miraba**.
    Son avisos concretos —cancela mucho, declara desierto, compra a saltos— y es
    justo lo que un proveedor quiere saber antes de invertir en una oferta.
    """
    # Los compradores distintos del rubro, en SQL: antes se traía una fila por
    # (organismo, proveedor) del rubro para quedarse con los códigos.
    distintos = _distintos(
        "competitors_by_market.parquet", "CodigoOrganismoPublico", filtros={"RubroN2": rubro}
    )
    if not distintos:
        return {"disponible": False}
    codigos = [str(c) for c in distintos]

    # La tabla de banderas tiene ~200 filas: se trae entera y se cruza en
    # memoria. Filtrar por una lista de miles de códigos en SQL sería una
    # consulta peor que leer doscientas filas.
    flags = _load("buyer_risk_flags.parquet")
    if flags is None or flags.is_empty():
        return {"disponible": True, "n_con_banderas": 0, "compradores": []}

    del_rubro = flags.filter(pl.col("CodigoOrganismoPublico").cast(pl.Utf8).is_in(codigos)).sort(
        "n_flags", descending=True
    )

    etiquetas = {
        "flag_aceptacion_lenta": "sus órdenes tardan en aceptarse",
        "flag_aceptacion_impredecible": "los plazos de tramitación varían mucho",
        "flag_cancelaciones": "cancela órdenes con frecuencia",
        "flag_licitaciones_fallidas": "declara desierto a menudo",
        "flag_baja_calificacion": "recibe baja calificación de proveedores",
        "flag_compras_irregulares": "compra a saltos, sin regularidad",
        # Nombres antiguos: sobreviven hasta que se re-materialice analytics.
        "flag_pago_lento": "sus órdenes tardan en aceptarse",
        "flag_pago_impredecible": "los plazos de tramitación varían mucho",
    }

    compradores = []
    for fila in del_rubro.head(TOP).iter_rows(named=True):
        motivos = [
            texto
            for columna, texto in etiquetas.items()
            if fila.get(columna) and columna in del_rubro.columns
        ]
        compradores.append(
            {
                "codigo": str(fila["CodigoOrganismoPublico"]),
                "nombre": fila.get("NombreOrganismo"),
                "n_banderas": int(fila.get("n_flags") or 0),
                "motivos": sorted(set(motivos)),
            }
        )

    return {
        "disponible": True,
        "n_con_banderas": del_rubro.height,
        "n_compradores_rubro": len(codigos),
        "compradores": compradores,
    }


def get_panorama(rubro: str) -> dict:
    """Todo el panorama del rubro en una sola llamada.

    Una llamada y no cinco a propósito: la pantalla las necesita todas juntas
    para pintar la cabecera, y cinco peticiones significan cinco estados de
    carga distintos, cinco formas de fallar a medias y cinco descuentos de cuota
    por una sola pregunta del usuario.
    """
    if not rubro:
        return {"disponible": False, "motivo": "rubro requerido"}

    mercado = _tamano_del_mercado(rubro)
    competencia = _competencia_del_rubro(rubro)
    estacionalidad = _estacionalidad_del_rubro(rubro)
    vigilar = _compradores_a_vigilar(rubro)

    # Si ninguna de las cuatro tiene datos, el rubro no existe en el histórico y
    # decirlo una vez es mejor que devolver cuatro bloques vacíos que el
    # frontend tiene que interpretar.
    if not any(b.get("disponible") for b in (mercado, competencia, estacionalidad, vigilar)):
        return {
            "disponible": False,
            "motivo": f"sin datos históricos para el rubro '{rubro}'",
        }

    return {
        "disponible": True,
        "rubro": rubro,
        "mercado": mercado,
        "competencia": competencia,
        "estacionalidad": estacionalidad,
        "vigilar": vigilar,
    }
