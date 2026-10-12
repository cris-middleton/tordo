"""Configuración compartida para el módulo de analytics."""

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

#: Raíz de los datos: `raw/`, `consolidated/` y `analytics/`. `ETL_DATA_DIR` la
#: mueve sin tocar código — para correr el pipeline sobre los datos de otro
#: checkout, o sobre un directorio de prueba.
DATA_DIR = Path(os.environ.get("ETL_DATA_DIR") or PROJECT_ROOT / "etl" / "data")

# Datos consolidados (parquets por mes)
OC_PARQUET_DIR = DATA_DIR / "consolidated" / "oc"
LIC_PARQUET_DIR = DATA_DIR / "consolidated" / "lic"

# Salida de analytics
OUTPUT_DIR = DATA_DIR / "analytics"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Columnas clave — OC
OC_COLS_CORE = [
    "Codigo",
    "FechaCreacion",
    "CodigoOrganismoPublico",
    "OrganismoPublico",
    "MontoTotalOC_PesosChilenos",
    "TipoMonedaOC",
    "CodigoProveedor",
    "NombreProveedor",
    "RubroN1",
    "RubroN2",
    "RubroN3",
    "Nombre",
    "NombreroductoGenerico",
    "Categoria",
    "codigoCategoria",
    "codigoProductoONU",
    "RegionUnidadCompra",
    "sector",
    "Estado",
    "Tipo",
    "CodigoLicitacion",
    "_periodo_archivo",
]

# Columnas clave — LIC
LIC_COLS_CORE = [
    "CodigoExterno",
    "Nombre",
    "Descripcion",
    "CodigoEstado",
    "Estado",
    "CodigoOrganismo",
    "NombreOrganismo",
    "sector",
    "RegionUnidad",
    "CodigoTipo",
    "Tipo",
    "FechaCreacion",
    "FechaCierre",
    "FechaAdjudicacion",
    "MontoEstimado",
    "CodigoMoneda",
    "NumeroOferentes",
    "CodigoProductoONU",
    "Rubro1",
    "Rubro2",
    "Rubro3",
    "Nombre producto genrico",
    "CodigoProveedor",
    "RutProveedor",
    "NombreProveedor",
    "MontoLineaAdjudica",
    "Oferta seleccionada",
    "_periodo_archivo",
]

# Mínimo de observaciones para considerar un par (organismo, rubro) estadísticamente válido
MIN_OBSERVATIONS = 5

# Origen del índice temporal `t` de `trend_analysis` (meses desde enero de este
# año). NO filtra datos: cuánta historia lee analytics lo decide
# `data_loader.VENTANA_ANALYTICS_MESES`.
MIN_YEAR = 2010
