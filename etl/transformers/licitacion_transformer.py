"""
Transformer for Licitaciones data
Normalizes API response to database schema
"""
from typing import Dict, Any
from datetime import datetime
from etl.utils import now_santiago
from etl.transformers.base import BaseTransformer


class LicitacionTransformer(BaseTransformer):
    """Transform Licitaciones data from API format to database schema"""

    # Mercado Público CodigoEstado → text mapping for licitaciones
    ESTADO_MAP = {
        "5": "Publicada",
        "6": "Cerrada",
        "7": "Desierta",
        "8": "Adjudicada",
        "15": "Revocada",
        "16": "Suspendida",
    }

    def _parse_date(self, date_str: Any) -> Any:
        """Parse date string to datetime object"""
        if not date_str:
            return None
        
        if isinstance(date_str, datetime):
            return date_str
        
        # Try different date formats
        date_formats = [
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%d-%m-%Y"
        ]
        
        for fmt in date_formats:
            try:
                return datetime.strptime(str(date_str), fmt)
            except (ValueError, TypeError):
                continue
        
        return None
    
    def _parse_decimal(self, value: Any) -> Any:
        """Parse decimal value"""
        if value is None:
            return None
        try:
            # Remove currency symbols and spaces
            if isinstance(value, str):
                value = value.replace("$", "").replace(".", "").replace(",", ".").strip()
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform a single licitacion record
        
        Args:
            data: Raw data record from API
            
        Returns:
            Transformed data record matching database schema
        """
        # Extract basic information
        codigo_externo = data.get("CodigoExterno") or data.get("codigoExterno") or data.get("codigo_externo")
        codigo_interno = data.get("CodigoInterno") or data.get("codigoInterno") or data.get("codigo_interno")
        
        # Extract dates
        fecha_publicacion = self._parse_date(
            data.get("FechaPublicacion") or 
            data.get("fechaPublicacion") or 
            data.get("fecha_publicacion") or
            data.get("FechaCreacion") or
            data.get("fechaCreacion")
        )
        
        fecha_cierre = self._parse_date(
            data.get("FechaCierre") or 
            data.get("fechaCierre") or 
            data.get("fecha_cierre")
        )
        
        fecha_inicio = self._parse_date(
            data.get("FechaInicio") or 
            data.get("fechaInicio") or 
            data.get("fecha_inicio")
        )
        
        fecha_final = self._parse_date(
            data.get("FechaFinal") or 
            data.get("fechaFinal") or 
            data.get("fecha_final")
        )
        
        # Extract financial information
        monto_estimado = self._parse_decimal(
            data.get("MontoEstimado") or 
            data.get("montoEstimado") or 
            data.get("monto_estimado") or
            data.get("MontoTotal") or
            data.get("montoTotal")
        )
        
        monto_total = self._parse_decimal(
            data.get("MontoTotal") or 
            data.get("montoTotal") or 
            data.get("monto_total")
        )
        
        # Extract organization information
        organismo = data.get("Organismo") or data.get("organismo") or {}
        if isinstance(organismo, dict):
            codigo_organismo = organismo.get("CodigoOrganismo") or organismo.get("codigoOrganismo")
            nombre_organismo = organismo.get("NombreOrganismo") or organismo.get("nombreOrganismo")
            rut_organismo = organismo.get("RutOrganismo") or organismo.get("rutOrganismo")
        else:
            codigo_organismo = data.get("CodigoOrganismo") or data.get("codigoOrganismo")
            nombre_organismo = data.get("NombreOrganismo") or data.get("nombreOrganismo")
            rut_organismo = data.get("RutOrganismo") or data.get("rutOrganismo")
        
        # Extract location
        region = data.get("Region") or data.get("region")
        comuna = data.get("Comuna") or data.get("comuna")
        
        # Build transformed record
        transformed = {
            "codigo_externo": codigo_externo,
            "codigo_interno": codigo_interno,
            "nombre": data.get("Nombre") or data.get("nombre") or "",
            "descripcion": data.get("Descripcion") or data.get("descripcion") or data.get("Detalle") or "",
            "fecha_publicacion": fecha_publicacion or now_santiago(),
            "fecha_cierre": fecha_cierre,
            "fecha_inicio": fecha_inicio,
            "fecha_final": fecha_final,
            "monto_estimado": monto_estimado,
            "monto_total": monto_total,
            "moneda": data.get("Moneda") or data.get("moneda") or "CLP",
            "tipo_moneda": data.get("TipoMoneda") or data.get("tipoMoneda") or "CLP",
            "estado": (
                data.get("Estado") or data.get("estado") or data.get("EstadoPublicacion")
                or self.ESTADO_MAP.get(str(data.get("CodigoEstado", "")))
            ),
            "tipo_licitacion": data.get("TipoLicitacion") or data.get("tipoLicitacion") or data.get("Tipo"),
            "codigo_organismo": codigo_organismo,
            "nombre_organismo": nombre_organismo,
            "rut_organismo": rut_organismo,
            "region": region,
            "comuna": comuna,
            "items": data.get("Items") or data.get("items") or [],
            "url_licitacion": data.get("UrlLicitacion") or data.get("urlLicitacion") or data.get("Link"),
            "url_acta": data.get("UrlActa") or data.get("urlActa"),
            "informacion_adicional": {
                k: v for k, v in data.items() 
                if k not in [
                    "CodigoExterno", "CodigoInterno", "Nombre", "Descripcion",
                    "FechaPublicacion", "FechaCierre", "FechaInicio", "FechaFinal",
                    "MontoEstimado", "MontoTotal", "Moneda", "Estado", "TipoLicitacion",
                    "Organismo", "CodigoOrganismo", "NombreOrganismo", "RutOrganismo",
                    "Region", "Comuna", "Items", "UrlLicitacion", "UrlActa"
                ]
            }
        }
        
        return transformed
    
    def validate_transformed(self, data: Dict[str, Any]) -> bool:
        """Validate transformed data"""
        required_fields = ["codigo_externo", "nombre", "fecha_publicacion"]
        return all(field in data and data[field] for field in required_fields)

