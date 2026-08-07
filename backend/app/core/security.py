from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.user import User

# Password hashing
#
# bcrypt directo, sin passlib. passlib no publica una versión desde 2020 (70
# meses) y era lo que obligaba a mantener bcrypt clavado en 4.0.1: las 4.1+
# rompieron su detección de versión. Una librería sin mantenimiento en el camino
# de las contraseñas es justo donde no conviene tenerla.
#
# El formato no cambia: passlib con `schemes=["bcrypt"]` produce hashes `$2b$`
# estándar, que es lo que genera y verifica bcrypt. Los hashes ya guardados
# siguen valiendo — hay test que lo fija con uno emitido por passlib.

# bcrypt ignora todo lo que pase de 72 bytes. passlib truncaba en silencio; las
# versiones nuevas de bcrypt LANZAN. Se trunca a mano para conservar el
# comportamiento anterior: si no, quien tuviera una contraseña más larga se
# quedaría fuera, porque su hash se calculó sobre los primeros 72 bytes.
LIMITE_BCRYPT = 72


def _recortar(password: str) -> bytes:
    return password.encode()[:LIMITE_BCRYPT]


# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
# Igual, pero sin lanzar 401 cuando no hay cabecera. Lo usa la detección de
# empresa fijada, que sólo mira si la credencial es una clave de API — la
# autenticación en sí sigue siendo cosa de `get_current_active_user`.
oauth2_opcional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_recortar(plain_password), hashed_password.encode())
    except ValueError:
        # Hash con formato inválido. passlib devolvía False; bcrypt lanza. Se
        # conserva lo primero: un registro corrupto no debe tumbar el login.
        return False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_recortar(password), bcrypt.gensalt()).decode()


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except jwt.PyJWTError as e:
        import logging

        logging.getLogger(__name__).debug("JWT decode error: %s", e)
        return None


@dataclass(frozen=True)
class Autenticacion:
    """Quién hace la petición, y si viene con una empresa ya fijada.

    Hay dos formas de autenticarse y no son equivalentes:

    - **JWT de sesión** — un usuario en el navegador. Puede pertenecer a varias
      empresas, así que cuál aplica se decide por petición.
    - **Clave de API** — un cliente sin navegador (MCP, ERP, script). La clave
      pertenece a UNA empresa y la fija: nombrar otra da 403, aunque quien creó
      la clave pertenezca a las dos. Una credencial de integración con alcance
      ambiguo es una credencial que alguien va a usar mal.

    `empresa_fijada` es lo único que distingue una vía de la otra aguas abajo.
    """

    usuario: User
    empresa_fijada: UUID | None = None


async def autenticar(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Autenticacion:
    """Acepta un JWT de sesión o una clave de API en el mismo `Bearer`.

    Se distinguen por el prefijo `tordo_`, sin consultar la base: un JWT nunca
    empieza así.
    """
    from app.services import api_keys

    if api_keys.parece_clave(token):
        try:
            clave = await api_keys.verificar(db, token)
        except api_keys.ErrorDeClave as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

        # La identidad de usuario sale de quien creó la clave. Si esa cuenta se
        # desactiva o se borra, la clave deja de servir — que es lo correcto:
        # una integración no debería sobrevivir a la salida de quien la montó
        # sin que nadie lo revise.
        usuario = None
        if clave.creada_por is not None:
            usuario = (
                await db.execute(select(User).where(User.id == clave.creada_por))
            ).scalar_one_or_none()
        if usuario is None or not usuario.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="La cuenta que creó esta clave ya no está activa.",
            )
        return Autenticacion(usuario=usuario, empresa_fijada=clave.empresa_id)

    return Autenticacion(usuario=await _usuario_de_jwt(token, db))


async def get_current_user(auth: Autenticacion = Depends(autenticar)) -> User:
    """Compatibilidad: todo lo que ya existía sigue pidiendo un `User`."""
    return auth.usuario


async def empresa_fijada_por_clave(
    token: str | None = Depends(oauth2_opcional),
    db: AsyncSession = Depends(get_db),
) -> UUID | None:
    """La empresa que fija una clave de API, o None si no se usó una.

    **No autentica ni lanza errores**: si la credencial falta o no vale, devuelve
    None y la autenticación de verdad se encarga.

    Existe separada por una razón concreta: si `empresa_facturable` dependiera de
    `autenticar`, dejaría de pasar por `get_current_active_user` — y los tests que
    sustituyen esa dependencia (que son casi todos) empezarían a recibir 401 en
    vez de lo que comprueban. Lo detectó test_contrato_bi.py.
    """
    if not token:
        return None
    from app.services import api_keys

    if not api_keys.parece_clave(token):
        return None
    try:
        return (await api_keys.verificar(db, token)).empresa_id
    except api_keys.ErrorDeClave:
        return None


async def _usuario_de_jwt(token: str, db: AsyncSession) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        raise credentials_exception

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive"
        )
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive"
        )
    return current_user


async def get_current_superuser(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return current_user
