"""
Transformer for Órdenes de Compra data
Normalizes API response to database schema
"""
from typing import Dict, Any
from datetime import datetime
from etl.utils import now_santiago
from etl.transformers.base import BaseTransformer


class OrdenCompraTransformer(BaseTransformer):
    """Transform Órdenes de Compra data from API format to database schema"""
    
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
        Transform a single orden de compra record
        
        Args:
            data: Raw data record from API
            
        Returns:
            Transformed data record matching database schema
        """
        # Extract basic information
        # The API uses "Codigo" not "CodigoOC"
        codigo_oc = data.get("Codigo") or data.get("CodigoOC") or data.get("codigoOC") or data.get("codigo_oc")
        codigo_licitacion = data.get("CodigoLicitacion") or data.get("codigoLicitacion") or data.get("codigo_licitacion")
        
        # Extract dates
        fecha_publicacion = self._parse_date(
            data.get("FechaPublicacion") or 
            data.get("fechaPublicacion") or 
            data.get("fecha_publicacion") or
            data.get("FechaCreacion") or
            data.get("fechaCreacion")
        )
        
        fecha_aceptacion = self._parse_date(
            data.get("FechaAceptacion") or 
            data.get("fechaAceptacion") or 
            data.get("fecha_aceptacion")
        )
        
        fecha_entrega = self._parse_date(
            data.get("FechaEntrega") or 
            data.get("fechaEntrega") or 
            data.get("fecha_entrega")
        )
        
        fecha_estimada_entrega = self._parse_date(
            data.get("FechaEstimadaEntrega") or 
            data.get("fechaEstimadaEntrega") or 
            data.get("fecha_estimada_entrega")
        )
        
        # Extract financial information
        monto_total = self._parse_decimal(
            data.get("MontoTotal") or 
            data.get("montoTotal") or 
            data.get("monto_total")
        )
        
        monto_neto = self._parse_decimal(
            data.get("MontoNeto") or 
            data.get("montoNeto") or 
            data.get("monto_neto")
        )
        
        monto_iva = self._parse_decimal(
            data.get("MontoIva") or 
            data.get("montoIva") or 
            data.get("monto_iva") or
            data.get("IVA")
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
        
        # Extract supplier information
        proveedor = data.get("Proveedor") or data.get("proveedor") or {}
        if isinstance(proveedor, dict):
            codigo_proveedor = proveedor.get("CodigoProveedor") or proveedor.get("codigoProveedor")
            nombre_proveedor = proveedor.get("NombreProveedor") or proveedor.get("nombreProveedor")
            rut_proveedor = proveedor.get("RutProveedor") or proveedor.get("rutProveedor")
        else:
            codigo_proveedor = data.get("CodigoProveedor") or data.get("codigoProveedor")
            nombre_proveedor = data.get("NombreProveedor") or data.get("nombreProveedor")
            rut_proveedor = data.get("RutProveedor") or data.get("rutProveedor")
        
        # Extract location
        region = data.get("Region") or data.get("region")
        comuna = data.get("Comuna") or data.get("comuna")
        
        # Build transformed record
        transformed = {
            "codigo_oc": codigo_oc,
            "codigo_licitacion": codigo_licitacion,
            "nombre": data.get("Nombre") or data.get("nombre") or "",
            "descripcion": data.get("Descripcion") or data.get("descripcion") or data.get("Detalle") or "",
            "fecha_publicacion": fecha_publicacion or now_santiago(),
            "fecha_aceptacion": fecha_aceptacion,
            "fecha_entrega": fecha_entrega,
            "fecha_estimada_entrega": fecha_estimada_entrega,
            "monto_total": monto_total or 0,
            "monto_neto": monto_neto,
            "monto_iva": monto_iva,
            "moneda": data.get("Moneda") or data.get("moneda") or "CLP",
            "estado": data.get("Estado") or data.get("estado") or data.get("EstadoPublicacion"),
            "estado_proveedor": data.get("EstadoProveedor") or data.get("estadoProveedor"),
            "codigo_organismo": codigo_organismo,
            "nombre_organismo": nombre_organismo,
            "rut_organismo": rut_organismo,
            "codigo_proveedor": codigo_proveedor,
            "nombre_proveedor": nombre_proveedor,
            "rut_proveedor": rut_proveedor,
            "region": region,
            "comuna": comuna,
            "items": data.get("Items") or data.get("items") or [],
            "url_oc": data.get("UrlOC") or data.get("urlOC") or data.get("Link"),
            "url_acta": data.get("UrlActa") or data.get("urlActa"),
            "informacion_adicional": {
                k: v for k, v in data.items() 
                if k not in [
                    "CodigoOC", "CodigoLicitacion", "Nombre", "Descripcion",
                    "FechaPublicacion", "FechaAceptacion", "FechaEntrega", "FechaEstimadaEntrega",
                    "MontoTotal", "MontoNeto", "MontoIva", "Moneda", "Estado", "EstadoProveedor",
                    "Organismo", "CodigoOrganismo", "NombreOrganismo", "RutOrganismo",
                    "Proveedor", "CodigoProveedor", "NombreProveedor", "RutProveedor",
                    "Region", "Comuna", "Items", "UrlOC", "UrlActa"
                ]
            }
        }
        
        return transformed
    
    def validate_transformed(self, data: Dict[str, Any]) -> bool:
        """Validate transformed data"""
        required_fields = ["codigo_oc", "nombre", "fecha_publicacion", "monto_total"]
        return all(field in data and data[field] is not None for field in required_fields)

