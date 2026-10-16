/**
 * El repositorio del código, para el enlace «Código» (spec del rediseño §6.1, §6.5).
 *
 * Sale de `REPOSITORIO_URL`, variable de SERVIDOR y opcional: el repositorio
 * estuvo privado hasta que su historia quedó limpia (R8; público desde el
 * 2026-10-15), y el sitio tenía que poder desplegarse antes sin enseñar un
 * enlace roto. Sigue siendo opcional (un despliegue propio, un fork). Sin la
 * variable —o con algo que no sea `https://`— devuelve `null` y no se pinta
 * nada: el mismo criterio que los medios de `/apoyar` (`urlSegura`).
 *
 * **Sólo lo importan componentes de servidor.** En un componente cliente la
 * variable no existe y «Código» no aparecería nunca, sin error
 * (`__tests__/repositorio.test.ts` lo vigila). Las páginas que la leen se
 * prerenderizan: en Vercel tiene que estar definida al construir.
 */
import { urlSegura } from './donaciones';

type Entorno = Record<string, string | undefined>;

export function urlRepositorio(entorno: Entorno = process.env): string | null {
  return urlSegura(entorno.REPOSITORIO_URL);
}

/**
 * Un fichero del repositorio en su rama principal, `<repositorio>/blob/main/<ruta>`,
 * o `null` sin repositorio. Lo usan las notas («El script», las fuentes) y los
 * pies de método («Código»): sin `REPOSITORIO_URL` no se enlaza nada.
 */
export function urlEnRepositorio(repositorio: string | null, ruta: string): string | null {
  return repositorio ? `${repositorio.replace(/\/+$/, '')}/blob/main/${ruta}` : null;
}

/** El commit del que salió este despliegue: lo corto para leer y, con repositorio, su URL. */
export interface CommitDelSitio {
  corto: string;
  url: string | null;
}

/**
 * «Sitio en el commit `abc1234`» del pie (spec PORTADA_V7 §6). Sale de
 * `VERCEL_GIT_COMMIT_SHA`, que Vercel pone sola en el build; sin ella (en local,
 * en los E2E) no sale nada. Con `REPOSITORIO_URL`, enlaza al commit.
 */
export function commitDelSitio(entorno: Entorno = process.env): CommitDelSitio | null {
  const sha = entorno.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase();
  if (!sha || !/^[0-9a-f]{7,40}$/.test(sha)) return null;
  const repositorio = urlRepositorio(entorno);
  return {
    corto: sha.slice(0, 7),
    url: repositorio ? `${repositorio.replace(/\/+$/, '')}/commit/${sha}` : null,
  };
}
