"""Tests de las tareas Celery del dashboard.

Estas tareas son SÍNCRONAS (usan `SyncSessionLocal`), así que necesitan una
sesión sync. El esquema lo aplican las migraciones, igual que el resto de los
tests: este archivo mantenía su propio DDL de SQLite —el tercero del repo— y se
desincronizaba con cada columna nueva.
"""

from datetime import UTC, datetime, timedelta
from uuid import uuid4


def test_precompute_dashboard_matches_skips_when_feature_off(monkeypatch):
    from app.tasks import dashboard_tasks

    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", False)
    result = dashboard_tasks.precompute_dashboard_matches()
    assert result == {"skipped": True}


def _empresa_con_perfil(session):
    from app.models.empresa import Empresa, TFIDFPerfil

    empresa = Empresa(
        id=uuid4(),
        rut_empresa="11111111-1",
        nombre_empresa="Test ETL",
        estado_habil="habil",
    )
    session.add(empresa)
    session.flush()
    session.add(
        TFIDFPerfil(
            id=uuid4(),
            empresa_id=empresa.id,
            vector_bytes=b"fake",
            modelo_version="v1",
        )
    )
    session.flush()
    return empresa


def _licitacion(session, codigo: str):
    from app.models.licitacion import Licitacion

    lic = Licitacion(
        codigo_externo=codigo,
        nombre=f"Servicios {codigo}",
        fecha_publicacion=datetime.now(UTC) - timedelta(days=1),
        fecha_cierre=datetime.now(UTC) + timedelta(days=10),
        estado="Publicada",
        activo=True,
    )
    session.add(lic)
    session.flush()
    return lic


def test_el_job_escribe_una_fila_por_licitacion_puntuada(sync_task_db, monkeypatch):
    from app.models.match import MatchEmpresaLicitacion
    from app.tasks import dashboard_tasks

    session, SessionLocal = sync_task_db
    empresa = _empresa_con_perfil(session)
    lic = _licitacion(session, "LIC-X")

    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", True)
    monkeypatch.setattr(dashboard_tasks, "SyncSessionLocal", SessionLocal)
    monkeypatch.setattr(
        dashboard_tasks, "_puntuar_empresa", lambda db, vector: [(lic.id, 80, "alto")]
    )

    resultado = dashboard_tasks.precompute_dashboard_matches()

    assert resultado["processed"] == 1
    assert resultado["failed"] == 0

    fila = session.query(MatchEmpresaLicitacion).filter_by(empresa_id=empresa.id).one()
    assert fila.licitacion_id == lic.id
    assert fila.score == 80
    assert fila.nivel == "alto"


def test_recalcular_reemplaza_lo_anterior_en_vez_de_acumular(sync_task_db, monkeypatch):
    """Una licitación que deja de puntuar tiene que DESAPARECER.

    Con un upsert sin borrado previo, las filas de licitaciones ya cerradas —o
    caídas por debajo del umbral— se quedarían para siempre, y la tabla sólo
    crecería. Peor: la portada seguiría ofreciendo licitaciones cerradas.
    """
    from app.models.match import MatchEmpresaLicitacion
    from app.tasks import dashboard_tasks

    session, SessionLocal = sync_task_db
    empresa = _empresa_con_perfil(session)
    vieja = _licitacion(session, "LIC-VIEJA")
    nueva = _licitacion(session, "LIC-NUEVA")

    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", True)
    monkeypatch.setattr(dashboard_tasks, "SyncSessionLocal", SessionLocal)

    monkeypatch.setattr(
        dashboard_tasks, "_puntuar_empresa", lambda db, vector: [(vieja.id, 90, "alto")]
    )
    dashboard_tasks.precompute_dashboard_matches()

    monkeypatch.setattr(
        dashboard_tasks, "_puntuar_empresa", lambda db, vector: [(nueva.id, 70, "medio")]
    )
    dashboard_tasks.precompute_dashboard_matches()

    filas = session.query(MatchEmpresaLicitacion).filter_by(empresa_id=empresa.id).all()
    assert [f.licitacion_id for f in filas] == [nueva.id]


def test_una_empresa_que_falla_no_arrastra_a_las_demas(sync_task_db, monkeypatch):
    """El commit es por empresa. Con uno solo al final, un fallo en la última
    tiraba el trabajo de todas."""
    from app.models.empresa import Empresa, TFIDFPerfil
    from app.models.match import MatchEmpresaLicitacion
    from app.tasks import dashboard_tasks

    session, SessionLocal = sync_task_db
    buena = _empresa_con_perfil(session)
    lic = _licitacion(session, "LIC-OK")

    mala = Empresa(
        id=uuid4(), rut_empresa="22222222-2", nombre_empresa="Rota", estado_habil="habil"
    )
    session.add(mala)
    session.flush()
    session.add(
        TFIDFPerfil(id=uuid4(), empresa_id=mala.id, vector_bytes=b"rota", modelo_version="v1")
    )
    session.flush()

    def puntuar(db, vector):
        if vector == b"rota":
            raise RuntimeError("modelo corrupto")
        return [(lic.id, 60, "medio")]

    monkeypatch.setattr(dashboard_tasks.settings, "feature_tfidf", True)
    monkeypatch.setattr(dashboard_tasks, "SyncSessionLocal", SessionLocal)
    monkeypatch.setattr(dashboard_tasks, "_puntuar_empresa", puntuar)

    resultado = dashboard_tasks.precompute_dashboard_matches()

    assert resultado["processed"] == 1
    assert resultado["failed"] == 1
    assert session.query(MatchEmpresaLicitacion).filter_by(empresa_id=buena.id).count() == 1


# ── Encaje incremental ───────────────────────────────────────────────────────
#
# El recálculo completo corre a las 06:00, así que una licitación ingerida a las
# 10:00 salía sin encaje hasta el día siguiente: no aparecía ordenada, no entraba
# en el correo y no se veía en el panel. Estos tests fijan las dos propiedades
# que hacen que el camino incremental sea seguro — que NO borra y que actualiza.


def test_el_camino_incremental_puntua_lo_recien_ingerido(sync_task_db, monkeypatch):
    from app.models.match import MatchEmpresaLicitacion
    from app.tasks import dashboard_tasks

    session, _ = sync_task_db
    empresa = _empresa_con_perfil(session)
    lic = _licitacion(session, "LIC-NUEVA-HORA")

    monkeypatch.setattr(
        dashboard_tasks, "score_empresa_licitacion", lambda vector, texto: (0.82, "alto")
    )

    filas = dashboard_tasks.actualizar_matches_de_licitaciones(session, [lic.id])

    assert filas == 1
    fila = session.query(MatchEmpresaLicitacion).filter_by(empresa_id=empresa.id).one()
    assert fila.licitacion_id == lic.id
    assert fila.score == 82
    assert fila.nivel == "alto"


def test_el_camino_incremental_no_borra_lo_que_ya_habia(sync_task_db, monkeypatch):
    """Es la diferencia con el recálculo completo, y la que puede romperlo todo.

    El job de las 06:00 hace DELETE+INSERT para limpiar lo que dejó de puntuar.
    Si este camino hiciera lo mismo, cada corrida horaria dejaría a cada empresa
    con el encaje de las dos o tres licitaciones de esa hora y borraría el resto.
    """
    from app.models.match import MatchEmpresaLicitacion
    from app.tasks import dashboard_tasks

    session, _ = sync_task_db
    empresa = _empresa_con_perfil(session)
    vieja = _licitacion(session, "LIC-DE-AYER")
    nueva = _licitacion(session, "LIC-DE-AHORA")

    session.add(
        MatchEmpresaLicitacion(
            empresa_id=empresa.id,
            licitacion_id=vieja.id,
            score=95,
            nivel="alto",
            calculado_en=datetime.now(UTC),
        )
    )
    session.flush()

    monkeypatch.setattr(
        dashboard_tasks, "score_empresa_licitacion", lambda vector, texto: (0.60, "medio")
    )
    dashboard_tasks.actualizar_matches_de_licitaciones(session, [nueva.id])

    filas = {
        f.licitacion_id: f.score
        for f in session.query(MatchEmpresaLicitacion).filter_by(empresa_id=empresa.id).all()
    }
    assert filas == {vieja.id: 95, nueva.id: 60}


def test_revisitar_una_licitacion_actualiza_su_encaje(sync_task_db, monkeypatch):
    """El ETL horario revisita licitaciones que cambiaron de nombre o descripción,
    y ahí el score cambia. Con `DO NOTHING` se quedaría el primero para siempre."""
    from app.models.match import MatchEmpresaLicitacion
    from app.tasks import dashboard_tasks

    session, _ = sync_task_db
    empresa = _empresa_con_perfil(session)
    lic = _licitacion(session, "LIC-QUE-CAMBIA")

    monkeypatch.setattr(
        dashboard_tasks, "score_empresa_licitacion", lambda vector, texto: (0.30, "bajo")
    )
    dashboard_tasks.actualizar_matches_de_licitaciones(session, [lic.id])

    monkeypatch.setattr(
        dashboard_tasks, "score_empresa_licitacion", lambda vector, texto: (0.90, "alto")
    )
    dashboard_tasks.actualizar_matches_de_licitaciones(session, [lic.id])

    fila = session.query(MatchEmpresaLicitacion).filter_by(empresa_id=empresa.id).one()
    assert fila.score == 90
    assert fila.nivel == "alto"


def test_lo_que_no_llega_al_umbral_no_se_guarda(sync_task_db, monkeypatch):
    """Guardar los ceros multiplicaría la tabla por el catálogo entero sin que
    ninguna pantalla los muestre."""
    from app.models.match import MatchEmpresaLicitacion
    from app.tasks import dashboard_tasks

    session, _ = sync_task_db
    _empresa_con_perfil(session)
    lic = _licitacion(session, "LIC-IRRELEVANTE")

    monkeypatch.setattr(
        dashboard_tasks, "score_empresa_licitacion", lambda vector, texto: (0.001, "bajo")
    )
    filas = dashboard_tasks.actualizar_matches_de_licitaciones(session, [lic.id])

    assert filas == 0
    assert session.query(MatchEmpresaLicitacion).count() == 0


def test_sin_licitaciones_no_hace_nada(sync_task_db):
    from app.tasks import dashboard_tasks

    session, _ = sync_task_db
    assert dashboard_tasks.actualizar_matches_de_licitaciones(session, []) == 0
