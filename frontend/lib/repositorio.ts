/**
 * El repositorio del código, para el enlace «Código» (spec del rediseño §6.1, §6.5).
 *
 * Sale de `REPOSITORIO_URL`, variable de SERVIDOR y opcional: el repositorio
 * sigue privado hasta que su historia esté limpia (R8), y el sitio tiene que
 * poder desplegarse antes sin enseñar un enlace roto. Sin la variable —o con
 * algo que no sea `https://`— devuelve `null` y no se pinta nada: el mismo
 * criterio que los medios de `/apoyar` (`urlSegura`).
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
