/**
 * Los datos que siembra `backend/scripts/sembrar_e2e.py`.
 *
 * Duplicados a propósito: el frontend no importa nada del backend para correr
 * sus tests. Si cambian allí, este fichero falla ruidosamente — los tests no
 * encuentran nada — que es mejor que un acoplamiento entre los dos lenguajes.
 */

export const USUARIO = 'e2e';
export const CONTRASENA = 'contrasena-de-prueba-e2e';
export const EMPRESA = 'Comercial Zafiro Ltda.';
/** `.cl` y no `.test`: `EmailStr` rechaza los TLD reservados. */
export const COLEGA = 'colega@tordo-pruebas.cl';

/** Aparece en dos licitaciones sembradas y en ninguna real. */
export const TERMINO = 'Zafiro';

/** Lleva tilde en la base; los tests la buscan SIN ella. */
export const CODIGO_VALVULAS = 'E2E-1001-LR24';

/** Ya adjudicada y SIN el término: sirve para comprobar que la búsqueda filtra. */
export const CODIGO_ADJUDICADA = 'E2E-1003-LE23';

export const COOKIE_ACCESO = 'tordo_acceso';
export const COOKIE_REFRESCO = 'tordo_refresco';
