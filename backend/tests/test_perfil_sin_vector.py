"""Un perfil guardado sin vector se reconstruye, no se queda roto para siempre.

Si el modelo TF-IDF no estaba disponible al guardar el perfil —y en los
contenedores no lo estaba, por la ruta de `ANALYTICS_DATA_PATH` (#119)—, el
endpoint guardaba `b""` «para reconstruirlo después». Nada lo reconstruía: el
job de las 06:00 fallaba en CADA empresa con «No data left in file» y
«Oportunidades para ti» quedaba vacío. En la base de desarrollo, 8 de 8
perfiles estaban así.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from app.models.empresa import Empresa, TFIDFPerfil
from app.services import tfidf_matcher
from app.tasks import dashboard_tasks


def _modelo_disponible(monkeypatch, vector=b"VEC"):
    monkeypatch.setattr(tfidf_matcher, "is_available", lambda: True)
    monkeypatch.setattr(tfidf_matcher, "build_empresa_vector", lambda texto: vector)


def test_un_vector_vacio_con_descripcion_se_reconstruye(monkeypatch):
    _modelo_disponible(monkeypatch)
    perfil = SimpleNamespace(vector_bytes=b"", descripcion="aseo industrial", rubros_usados=[])

    assert tfidf_matcher.vector_o_reconstruido(perfil) == b"VEC"
    assert perfil.vector_bytes == b"VEC"  # queda en el perfil para guardarse


def test_sin_texto_no_hay_nada_que_reconstruir(monkeypatch):
    _modelo_disponible(monkeypatch)
    perfil = SimpleNamespace(vector_bytes=b"", descripcion="", rubros_usados=[])

    assert tfidf_matcher.vector_o_reconstruido(perfil) is None


def test_la_descripcion_pesa_el_doble_al_guardar_y_al_reconstruir():
    assert tfidf_matcher.texto_de_perfil("aseo", ["Limpieza"]) == "aseo aseo Limpieza"


def test_el_job_reconstruye_y_puntua_en_vez_de_fallar(sync_task_db, monkeypatch):
    session, SessionLocal = sync_task_db
    empresa = Empresa(id=uuid4(), rut_empresa="22222222-2", nombre_empresa="Sin vector")
    session.add(empresa)
    session.flush()
    session.add(
        TFIDFPerfil(
            id=uuid4(),
            empresa_id=empresa.id,
            vector_bytes=b"",
            descripcion="artículos de aseo",
            modelo_version="v1",
        )
    )
    session.flush()

    _modelo_disponible(monkeypatch)
    vistos = []
    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", True)
    monkeypatch.setattr(dashboard_tasks, "SyncSessionLocal", SessionLocal)
    monkeypatch.setattr(
        dashboard_tasks, "_puntuar_empresa", lambda db, vector: vistos.append(vector) or []
    )

    resultado = dashboard_tasks.precompute_dashboard_matches()

    assert resultado["failed"] == 0
    assert b"VEC" in vistos
    perfil = session.query(TFIDFPerfil).filter_by(empresa_id=empresa.id).one()
    assert perfil.vector_bytes == b"VEC"
