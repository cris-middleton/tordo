"""El CSV que se lleva el usuario.

Lo que se prueba aquí parece cosmético y no lo es: **un CSV que Excel abre mal no
es un entregable**. Sin BOM, cada tilde sale como dos caracteres raros y el
archivo parece corrupto; con coma como separador, Excel en configuración regional
chilena mete las doce columnas en una sola.

Son dos detalles que nadie recuerda y que un refactor bienintencionado —«usemos
la coma, que es el estándar»— rompe sin que falle nada más.
"""

from __future__ import annotations

from pathlib import Path

from app.services import exportar

RAIZ = Path(__file__).resolve().parents[2]

#: La frase exacta de la Declaración de Uso de Datos Oficiales. Escrita aquí y
#: no importada: si alguien la «mejora» en `exportar.py`, este test se entera.
CITA_LITERAL = "Fuente: Dirección de Compras y Contratación Pública (ChileCompra / Mercado Público)"


def test_lleva_bom_para_que_excel_lea_las_tildes():
    csv = exportar.a_csv([{"a": "Mantención de climatización"}], [("a", "Descripción")])
    assert csv.startswith(exportar.BOM)
    assert "Mantención" in csv


def test_separa_con_punto_y_coma():
    """Con coma, Excel en Chile mete todo en una columna: ahí la coma es el
    separador decimal."""
    csv = exportar.a_csv([{"a": "x", "b": "y"}], [("a", "A"), ("b", "B")])
    assert "A;B" in csv
    assert "x;y" in csv


def test_los_decimales_van_con_coma():
    """Un punto se interpretaría como separador de miles y multiplicaría el
    precio por mil — el peor error posible en una banda de precio."""
    csv = exportar.a_csv([{"p": 2400000.5}], [("p", "Precio")])
    assert "2400000,50" in csv


def test_las_columnas_se_declaran_y_no_se_deducen():
    """Con `dict.keys()`, un cambio de orden en un servicio cambiaría el orden
    del archivo y una fila con una clave de menos lo dejaría desalineado."""
    filas = [{"b": "2", "a": "1"}, {"a": "3"}]
    csv = exportar.a_csv(filas, [("a", "A"), ("b", "B")])
    lineas = csv.replace(exportar.BOM, "").strip().splitlines()
    assert lineas[1] == "A;B"
    assert lineas[2] == "1;2"
    assert lineas[3] == "3;"


def test_los_nulos_quedan_vacios_y_no_dicen_none():
    csv = exportar.a_csv([{"a": None}], [("a", "A")])
    assert "None" not in csv


def test_sin_filas_deja_al_menos_los_encabezados():
    """Un archivo de cero bytes parece un fallo de descarga. Uno con
    encabezados dice «no hay datos», que es distinto."""
    csv = exportar.a_csv([], [("a", "A"), ("b", "B")])
    assert "A;B" in csv


def test_el_nombre_lleva_la_fecha():
    """Estos archivos acaban en carpetas compartidas: sin fecha, dos
    exportaciones del mismo producto en meses distintos se pisan."""
    nombre = exportar.nombre_archivo("precio", "41116000")
    assert nombre.startswith("tordo-precio-41116000-")
    assert nombre.endswith(".csv")


def test_el_nombre_no_admite_lo_que_rompa_una_ruta():
    """La referencia viene de la URL. Sin limpiar, un `../` o una barra
    convertirían el nombre del adjunto en una ruta."""
    nombre = exportar.nombre_archivo("precio", "../../etc/passwd")
    assert "/" not in nombre
    assert ".." not in nombre


def test_la_primera_linea_es_la_cita_de_la_fuente():
    """La Declaración exige citar a ChileCompra en toda publicación de sus datos.
    El CSV es lo que sale del sitio y se reenvía sin él: la cita tiene que viajar
    dentro del archivo, y en la primera línea, que es la que se ve al abrirlo."""
    csv = exportar.a_csv([{"a": "x"}], [("a", "A")])
    assert csv.startswith(exportar.BOM), "la cita no puede desplazar al BOM"
    primera = csv.removeprefix(exportar.BOM).splitlines()[0]
    assert primera == CITA_LITERAL


def test_la_cita_va_tambien_sin_filas():
    csv = exportar.a_csv([], [("a", "A")])
    assert csv.removeprefix(exportar.BOM).splitlines() == [CITA_LITERAL, "A"]


def test_la_cita_del_csv_es_la_misma_del_pie_de_la_web():
    """Vive en dos sitios (aquí y `frontend/lib/atribucion.ts`). Si se
    desincronizan, uno de los dos deja de citar lo que exige la Declaración."""
    atribucion_web = (RAIZ / "frontend" / "lib" / "atribucion.ts").read_text(encoding="utf-8")
    assert exportar.ATRIBUCION == CITA_LITERAL
    assert f"'{CITA_LITERAL}'" in atribucion_web


def test_el_codigo_de_proveedor_no_se_rotula_como_rut():
    """`CodigoProveedor` es el identificador interno de Mercado Público: ninguno
    de los 4,2 millones de registros lleva guion. Rotularlo «RUT» invitaba a
    cruzarlo con RUT reales."""
    encabezados = dict(exportar.COLUMNAS_COMPETIDORES)
    assert encabezados["CodigoProveedor"] != "RUT"


def test_corta_en_el_tope_y_lo_dice_en_la_ultima_linea():
    """Spec del pivote §7.4: sin cuota, el tope es lo que acota el coste.
    Recortar en silencio haría creer a quien sume la columna que tiene el total."""
    filas = [{"a": i} for i in range(exportar.MAX_FILAS_CSV + 7)]
    lineas = exportar.a_csv(filas, [("a", "A")]).splitlines()

    # Cita + encabezados + las filas del tope + el aviso.
    assert len(lineas) == 2 + exportar.MAX_FILAS_CSV + 1
    assert lineas[-1] == f"# recortado a {exportar.MAX_FILAS_CSV} filas"
    assert lineas[-2] == str(exportar.MAX_FILAS_CSV - 1)


def test_en_el_tope_justo_no_avisa_de_nada():
    filas = [{"a": i} for i in range(exportar.MAX_FILAS_CSV)]
    lineas = exportar.a_csv(filas, [("a", "A")]).splitlines()
    assert len(lineas) == 2 + exportar.MAX_FILAS_CSV
    assert not lineas[-1].startswith("#")
