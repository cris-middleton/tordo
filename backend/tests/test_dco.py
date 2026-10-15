"""`scripts/dco.sh`: cada commit de un PR desde un fork lleva el Signed-off-by de su autor.

Se prueba sobre repos de git de juguete: un script de CI que nadie corre en local se rompe
sin que nadie lo vea hasta el primer PR externo.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SCRIPT = RAIZ / "scripts" / "dco.sh"


def _git(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    resultado = subprocess.run(
        ["git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", *args],
        cwd=repo,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    return resultado.stdout.strip()


def _commit(repo: Path, mensaje: str, nombre: str = "Ana", correo: str = "ana@example.com") -> str:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": nombre,
        "GIT_AUTHOR_EMAIL": correo,
        "GIT_COMMITTER_NAME": nombre,
        "GIT_COMMITTER_EMAIL": correo,
    }
    (repo / "f.txt").write_text(mensaje, encoding="utf-8")
    _git(repo, "add", "f.txt", env=env)
    _git(repo, "commit", "-q", "-m", mensaje, env=env)
    return _git(repo, "rev-parse", "HEAD")


def _repo(tmp_path: Path) -> Path:
    _git(tmp_path, "init", "-q", "-b", "main")
    return tmp_path


def _dco(repo: Path, base: str, head: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(SCRIPT), base, head], cwd=repo, capture_output=True, text=True
    )


def test_acepta_commits_firmados_por_su_autor(tmp_path: Path):
    repo = _repo(tmp_path)
    base = _commit(repo, "base")
    head = _commit(repo, "cambio\n\nSigned-off-by: Ana <ana@example.com>")
    resultado = _dco(repo, base, head)
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr


def test_rechaza_un_commit_sin_firma_y_dice_cual(tmp_path: Path):
    repo = _repo(tmp_path)
    base = _commit(repo, "base")
    sin_firma = _commit(repo, "cambio sin firma")
    resultado = _dco(repo, base, sin_firma)
    assert resultado.returncode == 1
    assert sin_firma[:7] in resultado.stdout
    assert "git commit -s" in resultado.stdout


def test_rechaza_la_firma_de_otra_persona(tmp_path: Path):
    repo = _repo(tmp_path)
    base = _commit(repo, "base")
    head = _commit(repo, "cambio\n\nSigned-off-by: Beto <beto@example.com>")
    assert _dco(repo, base, head).returncode == 1


def test_un_rango_sin_commits_pasa(tmp_path: Path):
    repo = _repo(tmp_path)
    base = _commit(repo, "base")
    assert _dco(repo, base, base).returncode == 0
