"""
Script de debug para inspeccionar respuestas de la API de Mercado Público
Verifica qué campos devuelve realmente la API vs qué esperamos en el transformer
"""
import sys
import os
import json
from pathlib import Path
from datetime import datetime
from etl.utils import now_santiago

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from etl.config import config
from etl.extractors.mercado_publico_ordenes import MercadoPublicoOrdenesExtractor
from etl.extractors.mercado_publico_licitaciones import MercadoPublicoLicitacionesExtractor
from etl.transformers.orden_compra_transformer import OrdenCompraTransformer
from etl.transformers.licitacion_transformer import LicitacionTransformer


def debug_orden_compra(sample_size: int = 3, with_details: bool = True):
    """Debug: Ver qué devuelve la API para órdenes de compra (básicos y opcionalmente detalles)"""
    print("=" * 80)
    print("DEBUG: ÓRDENES DE COMPRA - DATOS BÁSICOS (muestra pequeña)")
    print("=" * 80)
    
    extractor_config = {
        "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
        "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
        "MAX_RETRIES": config.MAX_RETRIES,
        "RETRY_DELAY": config.RETRY_DELAY
    }
    
    extractor = MercadoPublicoOrdenesExtractor(extractor_config)
    transformer = OrdenCompraTransformer()
    
    # Extraer una orden de compra de hoy
    hoy = now_santiago().strftime("%Y-%m-%d")
    print(f"\n📅 Extrayendo órdenes de compra del {hoy} (máx {sample_size})...")
    
    raw_data = extractor.extract(fecha_desde=hoy, fecha_hasta=hoy)
    
    if not raw_data:
        print("❌ No se encontraron órdenes de compra para hoy")
        return
    
    # Limitar a muestra pequeña
    sample = raw_data[:sample_size]
    detalles_guardados = []
    basicos_guardados = []
    print(f"✅ Se encontraron {len(raw_data)} órdenes. Analizando {len(sample)}...")
    for idx, registro in enumerate(sample, start=1):
        codigo_oc = registro.get("Codigo") or registro.get("CodigoOC") or "N/A"
        print(f"\n🔍 [{idx}/{len(sample)}] OC: {codigo_oc}")
        # Mostrar campos de primer nivel
        print("- Campos de primer nivel:")
        for key, value in registro.items():
            if not isinstance(value, (dict, list)):
                value_str = str(value)[:100] if value is not None else "None"
                print(f"  {key}: {value_str}")
        # Transformación
        transformed = transformer.transform(registro)
        null_count = sum(1 for v in transformed.values() if v is None)
        print(f"- Transformación OK. Campos NULL: {null_count}/{len(transformed)}")
        basicos_guardados.append({
            "codigo_oc": codigo_oc,
            "raw": registro,
            "transformed": transformed
        })
        # Detalles
        if with_details and codigo_oc and codigo_oc != "N/A":
            print("  → Extrayendo detalle...")
            detalle = extractor.extract_detalle_orden_compra(codigo_oc)
            if detalle:
                print("    ✓ Detalle obtenido")
                detalles_guardados.append({"codigo_oc": codigo_oc, "detalle": detalle})
            else:
                print("    ✗ No se obtuvo detalle")
    
    # Guardar JSONs
    output_file = PROJECT_ROOT / "etl" / "scripts" / "debug_orden_muestra.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            "ordenes_basicas": basicos_guardados,
            "ordenes_detalles": detalles_guardados
        }, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n✅ Guardado resumen en: {output_file}")
    print("💡 Usa este archivo para comparar campos faltantes o nulos.")


def debug_licitaciones(sample_size: int = 3, with_details: bool = True):
    """Debug: Ver qué devuelve la API para licitaciones (básicos y opcionalmente detalles)"""
    print("=" * 80)
    print("DEBUG: LICITACIONES - DATOS BÁSICOS (muestra pequeña)")
    print("=" * 80)
    
    extractor_config = {
        "MERCADO_PUBLICO_URL": config.MERCADO_PUBLICO_URL,
        "MERCADO_PUBLICO_TICKET": config.MERCADO_PUBLICO_TICKET,
        "MAX_RETRIES": config.MAX_RETRIES,
        "RETRY_DELAY": config.RETRY_DELAY
    }
    
    extractor = MercadoPublicoLicitacionesExtractor(extractor_config)
    transformer = LicitacionTransformer()
    
    hoy = now_santiago().strftime("%Y-%m-%d")
    print(f"\n📅 Extrayendo licitaciones del {hoy} (máx {sample_size})...")
    raw_data = extractor.extract(fecha_desde=hoy, fecha_hasta=hoy)
    if not raw_data:
        print("❌ No se encontraron licitaciones para hoy")
        return
    sample = raw_data[:sample_size]
    detalles_guardados = []
    basicos_guardados = []
    print(f"✅ Se encontraron {len(raw_data)} licitaciones. Analizando {len(sample)}...")
    for idx, registro in enumerate(sample, start=1):
        codigo_externo = registro.get("CodigoExterno") or registro.get("codigoExterno") or "N/A"
        print(f"\n🔍 [{idx}/{len(sample)}] Licitación: {codigo_externo}")
        # Campos primer nivel
        print("- Campos de primer nivel:")
        for key, value in registro.items():
            if not isinstance(value, (dict, list)):
                value_str = str(value)[:100] if value is not None else "None"
                print(f"  {key}: {value_str}")
        # Transformación
        transformed = transformer.transform(registro)
        null_count = sum(1 for v in transformed.values() if v is None)
        print(f"- Transformación OK. Campos NULL: {null_count}/{len(transformed)}")
        basicos_guardados.append({
            "codigo_externo": codigo_externo,
            "raw": registro,
            "transformed": transformed
        })
        # Detalles
        if with_details and codigo_externo and codigo_externo != "N/A":
            print("  → Extrayendo detalle...")
            detalle = extractor.extract_detalle_licitacion(codigo_externo)
            if detalle:
                print("    ✓ Detalle obtenido")
                detalles_guardados.append({"codigo_externo": codigo_externo, "detalle": detalle})
            else:
                print("    ✗ No se obtuvo detalle")
    
    # Guardar JSONs
    output_file = PROJECT_ROOT / "etl" / "scripts" / "debug_licitaciones_muestra.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            "licitaciones_basicas": basicos_guardados,
            "licitaciones_detalles": detalles_guardados
        }, f, indent=2, ensure_ascii=False, default=str)
    print(f"\n✅ Guardado resumen en: {output_file}")
    print("💡 Usa este archivo para comparar campos faltantes o nulos.")


if __name__ == "__main__":
    # Ejecuta ambos debugs con muestras pequeñas y extracción de detalles
    debug_orden_compra(sample_size=3, with_details=True)
    print("\n" + "=" * 80 + "\n")
    debug_licitaciones(sample_size=3, with_details=True)