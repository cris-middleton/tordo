"""
Seed plantillas_checklist with checklist templates for Chilean public tenders.

Idempotent: only inserts rows for tipos that have 0 existing records.
Run with:  python scripts/seed_plantillas.py

Requires DATABASE_URL (or DATABASE_URL_SYNC) in environment / .env file.
"""
import os
import sys
import uuid

# Allow running from backend/ or backend/scripts/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.getenv("DATABASE_URL_SYNC") or os.getenv("DATABASE_URL", "")
# Normalise asyncpg/postgresql+asyncpg URLs to plain postgresql
DATABASE_URL = (
    DATABASE_URL
    .replace("postgresql+asyncpg://", "postgresql://")
    .replace("postgresql+psycopg2://", "postgresql://")
)

# ---------------------------------------------------------------------------
# Plantilla definitions
# Each entry: (nombre_item, es_obligatorio, orden)
# ---------------------------------------------------------------------------

PLANTILLAS: dict[str, list[tuple[str, bool, int]]] = {
    # ── GENERICO — items included in EVERY checklist regardless of tender type ──
    "GENERICO": [
        ("Leer bases técnicas completas antes de preparar la oferta", True, 1),
        ("Verificar estado hábil en ChileProveedores", True, 2),
        ("Confirmar modalidad de presentación (portal MP / física / email)", True, 3),
        ("Anotar fecha y hora exacta de cierre de la licitación", True, 4),
        ("Guardar comprobante de envío de oferta", True, 5),
    ],

    # ── L1 — Licitación Pública menor a 100 UTM (más comunes para PYMES pequeñas) ──
    "L1": [
        ("Formulario de postulación firmado", True, 1),
        ("Identificación del oferente (RUT + razón social)", True, 2),
        ("Declaración jurada de habilidad (estado hábil vigente)", True, 3),
        ("Oferta económica detallada", True, 4),
        ("Especificaciones técnicas del producto/servicio", True, 5),
        ("Plazo de entrega confirmado", True, 6),
        ("Condiciones de garantía (si exigida en bases)", False, 7),
    ],

    # ── LE — Licitación Pública entre 100 y 1.000 UTM ──
    "LE": [
        ("Formulario de postulación firmado", True, 1),
        ("Identificación del oferente (RUT + razón social)", True, 2),
        ("Declaración jurada de habilidad (estado hábil vigente)", True, 3),
        ("Certificado de inscripción ChileProveedores vigente", True, 4),
        ("Oferta económica detallada con impuestos", True, 5),
        ("Especificaciones técnicas completas", True, 6),
        ("Experiencia acreditable en rubros similares (si exigida)", False, 7),
        ("Plazo de entrega con hitos", True, 8),
        ("Garantía de seriedad de oferta (si exigida en bases)", False, 9),
        ("Certificado SII sin deuda (si exigido en bases)", False, 10),
    ],

    # ── LP — Licitación Pública mayor a 1.000 UTM ──
    "LP": [
        ("Formulario de postulación firmado y notariado", True, 1),
        ("Identificación del oferente (RUT + razón social)", True, 2),
        ("Declaración jurada de habilidad notariada", True, 3),
        ("Certificado de inscripción ChileProveedores vigente", True, 4),
        ("Oferta económica detallada con impuestos y desglose por ítem", True, 5),
        ("Especificaciones técnicas con certificaciones requeridas", True, 6),
        ("Experiencia comprobable en rubros similares (últimos 3 años)", True, 7),
        ("Plan de trabajo y metodología de ejecución", True, 8),
        ("Equipo profesional con CVs y títulos (si exigido)", False, 9),
        ("Garantía de seriedad de oferta", True, 10),
        ("Certificado SII sin deuda tributaria", True, 11),
        ("Certificado Dirección del Trabajo sin deuda laboral", True, 12),
        ("Garantía de fiel cumplimiento del contrato (si adjudicado)", False, 13),
    ],

    # ── LQ — Licitación Pública mayor a 2.000 UTM ──
    "LQ": [
        ("Formulario de postulación firmado y notariado", True, 1),
        ("Identificación del oferente (RUT + razón social + estatutos)", True, 2),
        ("Declaración jurada de habilidad notariada", True, 3),
        ("Certificado de inscripción ChileProveedores vigente", True, 4),
        ("Oferta económica con desglose completo y análisis de precios", True, 5),
        ("Especificaciones técnicas certificadas", True, 6),
        ("Experiencia comprobable últimos 5 años en contratos equivalentes", True, 7),
        ("Plan de trabajo, metodología y cronograma de hitos", True, 8),
        ("Equipo profesional con CVs, títulos y acreditaciones", True, 9),
        ("Garantía de seriedad de oferta (boleta bancaria)", True, 10),
        ("Certificado SII sin deuda tributaria", True, 11),
        ("Certificado Dirección del Trabajo sin deuda laboral", True, 12),
        ("Balance y estados financieros del último año", False, 13),
        ("Garantía de fiel cumplimiento del contrato", True, 14),
    ],

    # ── CO — Convenio Marco ──
    "CO": [
        ("Formulario de adhesión al convenio marco firmado", True, 1),
        ("Identificación del proveedor (RUT + razón social)", True, 2),
        ("Certificado de inscripción ChileProveedores vigente", True, 3),
        ("Declaración de conformidad con condiciones del convenio", True, 4),
        ("Catálogo de productos/servicios con precios unitarios", True, 5),
        ("Ficha técnica por producto/servicio incluido", True, 6),
        ("Plazo de despacho y condiciones de entrega", True, 7),
        ("Política de garantía y devoluciones", False, 8),
    ],

    # ── E2 — Trato o Contratación Directa ──
    "E2": [
        ("Formulario de cotización o propuesta directa firmada", True, 1),
        ("Identificación del oferente (RUT + razón social)", True, 2),
        ("Declaración jurada de habilidad (estado hábil vigente)", True, 3),
        ("Oferta económica con precio unitario y total", True, 4),
        ("Especificaciones del producto/servicio ofertado", True, 5),
        ("Plazo de entrega", True, 6),
        ("Justificación del trato directo (si solicitada por el organismo)", False, 7),
    ],
}


def seed(conn) -> None:
    cur = conn.cursor()

    # Count existing records per tipo
    cur.execute("SELECT tipo_licitacion, COUNT(*) FROM plantillas_checklist GROUP BY tipo_licitacion")
    existing = {row[0]: row[1] for row in cur.fetchall()}

    inserted_total = 0
    for tipo, items in PLANTILLAS.items():
        count = existing.get(tipo, 0)
        if count > 0:
            print(f"  {tipo}: {count} items already exist — skipping")
            continue

        rows = [
            (str(uuid.uuid4()), tipo, nombre_item, es_obligatorio, orden, True)
            for nombre_item, es_obligatorio, orden in items
        ]
        execute_values(
            cur,
            "INSERT INTO plantillas_checklist (id, tipo_licitacion, nombre_item, es_obligatorio, orden, activo) VALUES %s",
            rows,
        )
        print(f"  {tipo}: inserted {len(rows)} items")
        inserted_total += len(rows)

    conn.commit()
    cur.close()

    if inserted_total == 0:
        print("Nothing to insert — all types already seeded.")
    else:
        print(f"\nDone. Inserted {inserted_total} items total.")


def main() -> None:
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set. Copy .env.example to .env first.", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"ERROR: Could not connect — {e}", file=sys.stderr)
        sys.exit(1)

    print("Seeding plantillas_checklist...\n")
    try:
        seed(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
