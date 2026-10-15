# Cómo contribuir

Gracias por querer mejorar TORDO. Es un proyecto personal, público y gratuito, mantenido por
una sola persona: los PR pequeños y bien explicados se revisan antes.

## Antes de empezar

- Para algo más grande que un arreglo, **abre primero una Discussion o un issue** y cuenta qué
  quieres cambiar. Ahorra trabajo a los dos.
- Lee `CLAUDE.md`: describe el estado real del código y sus reglas (capas, migraciones,
  convenciones de modelo, tokens de color). Lo que dice es lo que el CI comprueba.

## Montar el entorno

Necesitas Python 3.11–3.12 con [`uv`](https://docs.astral.sh/uv/), Node 20+, Docker y `make`.

    cp .env.example .env    # y rellena lo que pida tu cambio
    make setup              # dependencias y hooks de pre-commit
    make help               # todos los comandos

Para el ETL hace falta un ticket propio de la API de Mercado Público
(<https://api.mercadopublico.cl>); el sitio y la API funcionan sin él contra una base local.

## Flujo

1. Una rama por cambio. Si trabajas en el repo principal, en un worktree:
   `make worktree NOMBRE=mi-cambio`.
2. **`make ci` en verde antes de abrir el PR.** Corre en local lo mismo que GitHub Actions
   (lint, migraciones, tests de backend, ETL y frontend). `make e2e` corre además los extremo a
   extremo.
3. Abre el PR contra `main`. Los checks de Actions tienen que quedar en verde: `main` está
   protegida y no admite merges en rojo.
4. Nunca `git commit --no-verify`: si un hook falla, arregla la causa.

## Firma de los commits (DCO)

Cada commit lleva una línea `Signed-off-by` con tu nombre y tu correo, la misma identidad que
el autor del commit. Con ella declaras que tienes derecho a aportar ese código bajo la licencia
del proyecto, según el [Developer Certificate of Origin 1.1](https://developercertificate.org/).

    git commit -s -m "fix(api): …"

Si se te olvidó: `git rebase --signoff main` y `git push --force-with-lease` en **tu** rama.
El job «✍️ DCO» del CI lo comprueba en los PR que vienen de un *fork*.

Puedes firmar con el correo *noreply* que te da GitHub
(`<id>+<tu-usuario>@users.noreply.github.com`) si no quieres publicar el tuyo: lo único que se
exige es que la firma coincida con el autor del commit.

## Licencia de lo que aportas

El código se publica bajo la **GNU AGPL, versión 3 o (a tu elección) cualquier versión
posterior** (`AGPL-3.0-or-later`, ver `LICENSE`). Al aportar, aceptas que tu contribución se
publique bajo esa misma licencia.

## Lo que no se acepta

- Cuentas, cobros o cualquier cosa que dependa de quién llama: es una decisión del proyecto
  (`docs/decisiones/0011-sitio-publico-sin-cuentas.md`).
- Datos de personas naturales en cualquier salida (ver «personas naturales» en `CLAUDE.md`).
- Dependencias nuevas sin pasar antes `make audit`.

## Conducta

Este proyecto sigue el [Código de Conducta](CODE_OF_CONDUCT.md). Para reportar un problema de
seguridad, mira [SECURITY.md](SECURITY.md).
