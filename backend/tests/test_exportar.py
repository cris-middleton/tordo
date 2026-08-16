"""El CSV que se lleva el usuario.

Lo que se prueba aquí parece cosmético y no lo es: **un CSV que Excel abre mal no
es un entregable**. Sin BOM, cada tilde sale como dos caracteres raros y el
archivo parece corrupto; con coma como separador, Excel en configuración regional
chilena mete las doce columnas en una sola.

Son dos detalles que nadie recuerda y que un refactor bienintencionado —«usemos
la coma, que es el estándar»— rompe sin que falle nada más.
"""

from __future__ import annotations

from app.services import exportar


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
    assert lineas[0] == "A;B"
    assert lineas[1] == "1;2"
    assert lineas[2] == "3;"


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
