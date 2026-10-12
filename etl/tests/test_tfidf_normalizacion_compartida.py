"""El contrato de la limpieza de texto del TF-IDF.

Hasta el paso 8 del pivote público la limpieza estaba escrita DOS veces —aquí y
en `backend/app/services/tfidf_matcher.py`, que normalizaba las consultas contra
el vocabulario del modelo— y este archivo comprobaba que no divergieran. La API
dejó de cargar el modelo y esa copia se borró: queda una sola implementación, y
lo que hay que fijar ya no es la igualdad sino lo que hace.

Si alguna vez vuelve a haber un consumidor del modelo fuera del ETL, que importe
esta función en vez de copiarla.
"""

from __future__ import annotations

from etl.analytics.tfidf_matcher import _clean_text as limpiar


def test_la_limpieza_hace_lo_que_promete():
    assert limpiar("Servicio de MANTENCIÓN, S.A.") == "servicio mantención"
    assert limpiar("null") == ""
    assert limpiar("None") == ""
    assert limpiar("a de la") == ""
    assert limpiar("Ñuble, Peñalolén y Til Til") == "ñuble peñalolén til til"
