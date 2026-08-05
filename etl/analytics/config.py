"""Configuración compartida para el módulo de analytics."""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Datos consolidados (parquets por mes)
OC_PARQUET_DIR = PROJECT_ROOT / "etl" / "data" / "consolidated" / "oc"
LIC_PARQUET_DIR = PROJECT_ROOT / "etl" / "data" / "consolidated" / "lic"

# Salida de analytics
OUTPUT_DIR = PROJECT_ROOT / "etl" / "data" / "analytics"
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

# Años a incluir en análisis (filtrar datos muy antiguos si hay ruido)
MIN_YEAR = 2010
