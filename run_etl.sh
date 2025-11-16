#!/bin/bash
# Script wrapper para ejecutar el ETL desde cualquier lugar
# Uso: ./run_etl.sh --full-pipeline

# Obtener el directorio donde está este script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Cambiar al directorio del proyecto
cd "$SCRIPT_DIR"

# Ejecutar el ETL como módulo de Python
python -m etl.main "$@"

