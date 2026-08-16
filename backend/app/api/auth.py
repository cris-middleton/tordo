import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import (
    create_access_token,
    get_current_active_user,
    get_password_hash,
    verify_password,
)
from app.db import get_db
from app.models.user import User
from app.repositories import usuarios as repo
from app.schemas.user import (
    PasswordChange,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services import auth_tokens, password_reset

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["authentication"])


# El reverse-trial ya no arranca aquí: pertenece a la empresa, y la empresa
# se crea en el onboarding. Ver app/api/empresas.py::aplicar_trial_inicial
# y docs/decisiones/0002-suscripcion-por-empresa.md.


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing_user = await repo.existe_email_o_username(db, user_data.email, user_data.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email or username already registered"
        )

    db_user = User(
        email=user_data.email,
        username=user_data.username,
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await repo.buscar_por_username(db, credentials.username)
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive"
        )

    user.last_login = datetime.now(UTC)
    await db.commit()

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    refresh = await auth_tokens.emitir(db, user.id)
    await db.commit()
    return {"access_token": access_token, "token_type": "bearer", "refresh_token": refresh}


@router.post("/refresh", response_model=Token)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Renueva el acceso sin volver a pedir la contraseña.

    **Rota**: el token entregado deja de valer y se devuelve otro. Presentar uno
    ya canjeado revoca la sesión entera — ver `services/auth_tokens.py`.

    No exige el access token: la gracia es poder renovar justamente cuando ha
    caducado.
    """
    try:
        nuevo, user_id = await auth_tokens.rotar(db, payload.refresh_token)
    except auth_tokens.ErrorDeRefresco as exc:
        await db.commit()  # la revocación por reutilización tiene que persistir
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user = await repo.obtener(db, user_id)
    if user is None or not user.is_active:
        await auth_tokens.revocar(db, nuevo)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="La cuenta ya no está activa."
        )

    access_token = create_access_token(
        data={"sub": str(user_id)},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    await db.commit()
    return {"access_token": access_token, "token_type": "bearer", "refresh_token": nuevo}


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Cierra la sesión revocando la familia de tokens.

    Devuelve 200 aunque el token no exista: decirle a quien pregunta si un token
    era válido es información que no necesita, y cerrar sesión dos veces no es un
    error.
    """
    await auth_tokens.revocar(db, payload.refresh_token)
    await db.commit()
    return {"message": "Sesión cerrada"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.get("/google")
async def google_login():
    from app.services.oauth_service import build_auth_url

    return RedirectResponse(build_auth_url())


@router.get("/google/callback")
async def google_callback(
    request: Request,
    db: AsyncSession = Depends(get_db),
    code: str = "",
    error: str = "",
):
    if error or not code:
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_denied")

    from app.services.oauth_service import exchange_code, find_or_create_user, get_userinfo

    try:
        tokens = await exchange_code(code)
    except Exception:
        logger.exception("Google OAuth: token exchange failed")
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_token_exchange_failed")
    try:
        user_info = await get_userinfo(tokens["access_token"])
    except Exception:
        logger.exception("Google OAuth: userinfo fetch failed")
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_userinfo_failed")
    try:
        user = await find_or_create_user(db, user_info)
    except Exception:
        logger.exception(
            "Google OAuth: find_or_create_user failed (email=%s)", user_info.get("email")
        )
        return RedirectResponse(f"{settings.frontend_url}/login?error=google_db_error")

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )
    return RedirectResponse(f"{settings.frontend_url}/auth/callback?token={access_token}")


@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    password_data: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )
    current_user.hashed_password = get_password_hash(password_data.new_password)
    # Cambiar la contraseña sin echar a las sesiones abiertas deja dentro a quien
    # la hubiera robado, que suele ser justo el motivo del cambio.
    await auth_tokens.revocar_todo_del_usuario(db, current_user.id)
    await db.commit()
    await db.refresh(current_user)
    return {"message": "Contraseña cambiada. Se cerraron las demás sesiones."}


@router.post("/password-reset/solicitar", status_code=status.HTTP_200_OK)
async def solicitar_recuperacion(
    payload: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Manda el enlace de recuperación.

    **Responde 200 siempre**, exista o no el correo. Distinguir los dos casos
    convierte este formulario en un verificador de cuentas: se prueba una lista
    de correos y se aprende cuáles están registrados. Por eso el correo se
    agenda con `background_tasks` en vez de mandarse aquí: un `smtplib`
    síncrono tarda un round-trip SMTP completo, y sólo la rama del correo
    conocido lo paga — esa diferencia de tiempo sería el mismo oráculo por
    otra vía. Ver `services/password_reset.solicitar`.
    """
    await password_reset.solicitar(db, payload.email, background_tasks=background_tasks)
    await db.commit()
    return {
        "message": (
            "Si ese correo tiene una cuenta, te enviamos un enlace para restablecer la contraseña."
        )
    }


@router.post("/password-reset/confirmar", status_code=status.HTTP_200_OK)
async def confirmar_recuperacion(payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    """Canjea el enlace por una contraseña nueva y cierra las sesiones abiertas."""
    try:
        await password_reset.restablecer(db, payload.token, payload.new_password)
    except password_reset.ErrorDeRecuperacion as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    await db.commit()
    return {"message": "Contraseña actualizada. Entra con la nueva."}
