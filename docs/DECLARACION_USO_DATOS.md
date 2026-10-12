# Declaración de Uso de Datos Oficiales

**Última actualización:** [[fecha de publicación]] · **Sustituye a:**
`Declaración de Uso de Datos Oficiales.pdf` (misma carpeta), escrita para la etapa
SaaS. Se conserva el PDF como registro; **la vigente es ésta**.

> No es asesoría legal. La fecha se pone al publicar.

Este sitio utiliza información pública proveniente de fuentes oficiales del Estado
de Chile, en cumplimiento de los términos establecidos por la Dirección de Compras y
Contratación Pública (DCCP) y la plataforma Mercado Público (ChileCompra).

## Fuentes de datos

Los datos se obtienen de:

- La **API pública de Mercado Público** (`https://api.mercadopublico.cl`), incluida
  la API de Compra Ágil.
- Los **archivos de datos abiertos de ChileCompra** (descargas masivas de órdenes de
  compra y licitaciones) y el Portal de Datos Abiertos del Estado (datos.gob.cl).

Toda la información procesada y publicada por el sitio proviene de estas fuentes
oficiales, que la publican bajo el principio de transparencia y libre acceso a la
información pública.

## Condiciones de uso

- El acceso a la API se realiza con un ticket autorizado por la DCCP, respetando las
  cuotas y la frecuencia establecidas (máximo 10.000 solicitudes diarias por
  usuario).
- **La información no se modifica en su contenido original.** Se aplican procesos de
  normalización técnica —formato de fechas, tipificación, mayúsculas, unidades,
  agregación estadística— que no alteran su significado ni su valor oficial.
- **Omisión de datos de personas naturales.** Los nombres, RUT y códigos que
  identifican a proveedores que son personas naturales se **omiten** y se sustituyen
  por la etiqueta «Persona natural» y un seudónimo no reversible (ver más abajo).
- Se declara expresamente que **la Dirección de Compras y Contratación Pública
  (ChileCompra) no participa ni respalda este proyecto**, y que no asume
  responsabilidad sobre los análisis, interpretaciones, indicadores o servicios
  derivados del uso de los datos.

### Por qué omitir no es modificar

La versión anterior de esta declaración decía que los datos «no son modificados en su
contenido original». El enmascarado de personas naturales sigue siendo compatible
con eso, y conviene decir por qué:

- **Se quita un dato; no se cambia ninguno.** Ninguna cifra, fecha, monto, comprador
  ni producto cambia de valor. Lo que se retira es la identidad de un proveedor que
  es una persona, igual que una tabla publicada puede omitir una columna sin falsear
  las demás.
- **Los agregados no cambian.** Cada persona recibe un seudónimo propio y estable
  dentro de cada cálculo, en vez de colapsar todas en una sola fila. Por eso las
  cuotas de mercado, el índice de concentración (HHI) y las bandas de precio dan el
  mismo resultado que con los nombres a la vista. El seudónimo cambia en cada
  actualización y no se puede invertir.
- **El dato original sigue donde estaba.** ChileCompra lo publica con su finalidad
  —la transparencia de cada compra—, y quien necesite el nombre puede consultarlo en
  Mercado Público. Lo que este sitio evita es republicarlo, indexarlo en buscadores
  y cruzarlo en análisis, que es un tratamiento distinto y no está cubierto por esa
  finalidad (Ley N° 19.628, modificada por la Ley N° 21.719).

**Criterio:** RUT inferior a 50.000.000 → persona natural. Si un proveedor no tiene un
RUT legible en los datos de origen, también se omite: ante la duda, la omisión. Las
EIRL y las sociedades unipersonales son personas jurídicas y se muestran. El detalle
técnico está en `etl/analytics/personas.py` y en el §8 de
[`PIVOTE_PUBLICO_2026-10.md`](PIVOTE_PUBLICO_2026-10.md).

## Derechos y atribución

- Conforme a las condiciones de la API de Mercado Público, toda publicación o
  visualización de los datos cita su fuente original:

  > **Fuente: Dirección de Compras y Contratación Pública (ChileCompra / Mercado Público)**

  La cita aparece **en el pie de cada página del sitio** y **en la primera línea de
  cada archivo CSV** que se descarga, porque el archivo circula sin la página.
  La frase es literal y vive en `frontend/lib/atribucion.ts` y
  `backend/app/services/exportar.py`; dos tests fijan que no cambie
  (`frontend/__tests__/legal-enlazado.test.tsx`, `backend/tests/test_exportar.py`).
- Los derechos sobre el software, los algoritmos y la presentación del sitio son de su
  responsable. El contenido de los datos es información pública de ChileCompra.

## Responsabilidad y propósito

El uso de estos datos tiene fines informativos y analíticos: facilitar la búsqueda, el
seguimiento y la comprensión de las compras públicas para empresas, organizaciones y
cualquier persona. El sitio es **gratuito y no tiene cuentas**.

No se manipulan los datos oficiales ni se actúa en representación de ningún organismo
del Estado.

**Responsable:** el que identifica la política de privacidad del sitio (`/privacidad`) · **Contacto:** hola@tordo.cl
