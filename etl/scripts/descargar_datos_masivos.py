"""
Descarga masiva de datos desde datos-abiertos.chilecompra.cl

Descarga ZIPs de Órdenes de Compra y Licitaciones por año-mes,
extrae los CSVs, y genera un parquet consolidado por tipo para
análisis histórico completo.

URLs directas:
  OC:  https://transparenciachc.blob.core.windows.net/oc-da/{Año}-{Mes}.zip
  LIC: https://transparenciachc.blob.core.windows.net/lic-da/{Año}-{Mes}.zip

Uso:
  python etl/scripts/descargar_datos_masivos.py [--tipo oc|lic|ambos] [--desde 2007-01] [--hasta 2026-03] [--solo-descarga] [--solo-consolidar]
"""

import argparse
import io
import logging
import zipfile
from datetime import datetime
from pathlib import Path

import polars as pl
import requests

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

BASE_URLS = {
    "oc": "https://transparenciachc.blob.core.windows.net/oc-da",
    "lic": "https://transparenciachc.blob.core.windows.net/lic-da",
}

MIN_YEAR_KNOWN = 2007  # Año mínimo conocido con datos
MIN_YEAR_PROBE = 2004  # Probar desde aquí para detectar datos anteriores
CHUNK_SIZE = 8192  # Bytes por chunk en streaming download
REQUEST_TIMEOUT = 120  # Segundos
CSV_ENCODINGS = ["latin-1", "utf-8", "cp1252"]  # Encodings a intentar

# Paths relativos a la raíz del proyecto
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "etl" / "data"
RAW_DIR = DATA_DIR / "raw"
CONSOLIDATED_DIR = DATA_DIR / "consolidated"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("descargar_datos_masivos")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def generar_periodos(desde: str, hasta: str) -> list[tuple[int, int]]:
    """Genera lista de (año, mes) entre desde y hasta inclusive."""
    y0, m0 = map(int, desde.split("-"))
    y1, m1 = map(int, hasta.split("-"))
    periodos = []
    y, m = y0, m0
    while (y, m) <= (y1, m1):
        periodos.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return periodos


def url_existe(url: str) -> bool:
    """HEAD request para verificar si un recurso existe."""
    try:
        r = requests.head(url, timeout=30, allow_redirects=True)
        return r.status_code == 200
    except requests.RequestException:
        return False


def detectar_anio_minimo(tipo: str) -> int:
    """
    Busca hacia atrás desde MIN_YEAR_KNOWN para detectar si hay datos
    anteriores a los conocidos. Retorna el año mínimo con datos.
    """
    base = BASE_URLS[tipo]
    anio_min = MIN_YEAR_KNOWN

    # Probar años anteriores al mínimo conocido
    for year in range(MIN_YEAR_KNOWN - 1, MIN_YEAR_PROBE - 1, -1):
        url = f"{base}/{year}-1.zip"
        if url_existe(url):
            logger.info(f"Datos anteriores detectados: {tipo.upper()} tiene datos en {year}")
            anio_min = year
        else:
            break

    if anio_min < MIN_YEAR_KNOWN:
        logger.warning(
            f"Se encontraron datos de {tipo.upper()} desde {anio_min}, "
            f"antes del mínimo conocido ({MIN_YEAR_KNOWN}). "
            f"Actualizá MIN_YEAR_KNOWN en el script."
        )
    return anio_min


def descargar_zip(url: str, destino: Path) -> bool:
    """Descarga un ZIP con streaming. Retorna True si exitoso."""
    if destino.exists():
        logger.info(f"  Ya existe: {destino.name} — saltando")
        return True

    try:
        r = requests.get(url, stream=True, timeout=REQUEST_TIMEOUT)
        if r.status_code == 404:
            return False
        r.raise_for_status()

        destino.parent.mkdir(parents=True, exist_ok=True)
        size = 0
        with open(destino, "wb") as f:
            for chunk in r.iter_content(chunk_size=CHUNK_SIZE):
                f.write(chunk)
                size += len(chunk)

        logger.info(f"  Descargado: {destino.name} ({size / 1024 / 1024:.1f} MB)")
        return True

    except requests.RequestException as e:
        logger.error(f"  Error descargando {url}: {e}")
        if destino.exists():
            destino.unlink()
        return False


def leer_csv_desde_zip(zip_path: Path) -> pl.DataFrame | None:
    """Extrae y lee el primer CSV dentro de un ZIP usando Polars.

    Polars requiere UTF-8, así que decodificamos con el encoding del archivo
    y re-codificamos a UTF-8 antes de pasar a pl.read_csv.
    """
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            csv_files = [f for f in zf.namelist() if f.lower().endswith(".csv")]
            if not csv_files:
                logger.warning(f"  No se encontró CSV en {zip_path.name}")
                return None

            raw_bytes = zf.read(csv_files[0])

            fallos: list[str] = []
            for enc in CSV_ENCODINGS:
                for sep in [";", ",", "\t"]:
                    try:
                        # Normalizar a UTF-8 para Polars
                        utf8_bytes = raw_bytes.decode(enc).encode("utf-8")
                        df = pl.read_csv(
                            io.BytesIO(utf8_bytes),
                            separator=sep,
                            # Todo como string: evita conflictos de tipos entre años.
                            # OJO: es `infer_schema_length=0`, no `infer_schema=False`.
                            # Ese segundo parámetro sólo existe desde Polars 1.x y aquí
                            # el pin es 0.20.x: lanzaba TypeError en cada intento, el
                            # `except` se lo tragaba, y el script reportaba un problema
                            # de encoding que no existía. Los 6 ZIPs "no parseables"
                            # eran en realidad este TypeError.
                            infer_schema_length=0,
                            truncate_ragged_lines=True,
                            ignore_errors=True,
                        )
                        if len(df.columns) > 1:
                            return df
                        fallos.append(f"{enc}/{sep!r}: sólo {len(df.columns)} columna(s)")
                    except Exception as e:
                        # Registrar el motivo. Tragarse la excepción en silencio fue
                        # justamente lo que ocultó el error durante meses.
                        fallos.append(f"{enc}/{sep!r}: {type(e).__name__}: {e}")
                        continue

            logger.error(f"  No se pudo parsear {zip_path.name}. Intentos:")
            for f in fallos:
                logger.error(f"    - {f}")
            return None

    except zipfile.BadZipFile:
        logger.error(f"  ZIP corrupto: {zip_path.name}")
        return None


# ---------------------------------------------------------------------------
# Descarga
# ---------------------------------------------------------------------------


def descargar_tipo(tipo: str, periodos: list[tuple[int, int]]) -> dict:
    """Descarga todos los ZIPs de un tipo para los periodos dados."""
    base = BASE_URLS[tipo]
    destino_dir = RAW_DIR / tipo
    destino_dir.mkdir(parents=True, exist_ok=True)

    resultados = {"ok": 0, "skip_404": 0, "error": 0}

    for year, month in periodos:
        nombre = f"{year}-{month}.zip"
        url = f"{base}/{nombre}"
        destino = destino_dir / nombre

        ok = descargar_zip(url, destino)
        if ok:
            resultados["ok"] += 1
        elif not destino.exists():
            # 404 o futuro: no existe aún
            resultados["skip_404"] += 1
        else:
            resultados["error"] += 1

    logger.info(
        f"{tipo.upper()}: {resultados['ok']} descargados, "
        f"{resultados['skip_404']} no disponibles, "
        f"{resultados['error']} errores"
    )
    return resultados


# ---------------------------------------------------------------------------
# Consolidación
# ---------------------------------------------------------------------------


def consolidar_tipo(tipo: str) -> Path | None:
    """
    Escribe un parquet por mes en consolidated/{tipo}/YYYY-M.parquet (Polars).

    Idempotente: salta archivos ya procesados. Para leer el histórico completo:
        pl.scan_parquet("etl/data/consolidated/{tipo}/*.parquet").collect()
    """
    raw_dir = RAW_DIR / tipo
    if not raw_dir.exists():
        logger.error(f"No existe directorio raw para {tipo.upper()}: {raw_dir}")
        return None

    zips = sorted(raw_dir.glob("*.zip"))
    if not zips:
        logger.warning(f"No hay ZIPs para {tipo.upper()} en {raw_dir}")
        return None

    out_dir = CONSOLIDATED_DIR / tipo
    out_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Consolidando {len(zips)} ZIPs de {tipo.upper()} → {out_dir}/")

    procesados = saltados = errores = 0

    for zip_path in zips:
        periodo = zip_path.stem
        out_path = out_dir / f"{periodo}.parquet"

        if out_path.exists():
            saltados += 1
            continue

        logger.info(f"  {zip_path.name}...")
        df = leer_csv_desde_zip(zip_path)
        if df is None:
            errores += 1
            continue

        df = df.with_columns(pl.lit(periodo).alias("_periodo_archivo"))
        df.write_parquet(out_path, compression="snappy")
        logger.info(f"    → {len(df):,} filas, {out_path.stat().st_size / 1024 / 1024:.1f} MB")
        procesados += 1
        del df

    total_parquets = len(list(out_dir.glob("*.parquet")))
    total_size_mb = sum(p.stat().st_size for p in out_dir.glob("*.parquet")) / 1024 / 1024
    logger.info(
        f"{tipo.upper()} listo: {total_parquets} parquets "
        f"({procesados} nuevos, {saltados} saltados, {errores} errores) "
        f"— {total_size_mb:.1f} MB total"
    )
    logger.info(f"  Leer todo: pl.scan_parquet('{out_dir}/*.parquet').collect()")
    return out_dir


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Descarga masiva de datos ChileCompra (OC y Licitaciones)"
    )
    parser.add_argument(
        "--tipo",
        choices=["oc", "lic", "ambos"],
        default="ambos",
        help="Tipo de datos a descargar (default: ambos)",
    )
    parser.add_argument(
        "--desde",
        default=None,
        help="Periodo inicio YYYY-MM (default: detecta automáticamente)",
    )
    parser.add_argument(
        "--hasta",
        default=None,
        help="Periodo fin YYYY-MM (default: mes actual)",
    )
    parser.add_argument(
        "--solo-descarga",
        action="store_true",
        help="Solo descargar ZIPs, no consolidar",
    )
    parser.add_argument(
        "--solo-consolidar",
        action="store_true",
        help="Solo consolidar ZIPs ya descargados, no descargar",
    )
    args = parser.parse_args()

    tipos = ["oc", "lic"] if args.tipo == "ambos" else [args.tipo]

    # Periodo hasta: mes actual por defecto
    now = datetime.now()
    hasta = args.hasta or f"{now.year}-{now.month:02d}"

    for tipo in tipos:
        logger.info(f"{'=' * 60}")
        logger.info(f"Procesando: {tipo.upper()}")
        logger.info(f"{'=' * 60}")

        if not args.solo_consolidar:
            # Detectar año mínimo real
            if args.desde:
                desde = args.desde
            else:
                anio_min = detectar_anio_minimo(tipo)
                desde = f"{anio_min}-01"

            periodos = generar_periodos(desde, hasta)
            logger.info(f"Rango: {desde} → {hasta} ({len(periodos)} periodos)")

            descargar_tipo(tipo, periodos)

        if not args.solo_descarga:
            consolidar_tipo(tipo)

    logger.info("Proceso completado.")
    logger.info(f"  Raw ZIPs: {RAW_DIR}")
    logger.info(f"  Consolidados: {CONSOLIDATED_DIR}")


if __name__ == "__main__":
    main()
