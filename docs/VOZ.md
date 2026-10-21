# Cómo escribe TORDO

> 🟢 **Vivo.** La guía de los textos del sitio desde el 2026-10-21. Sustituye a la §6.1 de
> `IDENTIDAD_Y_PORTADA_2026-10.md`, que la resumía en cinco líneas. Lo mecánico lo fija
> `frontend/__tests__/voz-textos.test.ts`; lo demás se revisa leyendo, con esta página al lado.

Dos referencias, elegidas por el dueño:

- **PixelFrame** (`~/Documents/GitHub/pixel-frame`, brief §1): frases cortas y afirmativas, sin
  signos de exclamación, con la seguridad de quien sabe lo que hace y no necesita gritarlo.
- **El newsletter de Fintual** (*Fintualist*, fintualist.com): conversa. Parte por un caso concreto
  y después da la cifra, traduce la jerga a algo cotidiano en la misma frase («39 de 100 es como un
  3,0»), dice qué no sabe y se ríe de vez en cuando, nunca del lector.

TORDO toma lo seco de la primera y lo conversado de la segunda: **precisa como una tabla,
hablada como una persona.**

---

## 1. Quién habla y a quién

- **Habla «nosotros»**: el sitio, que hace una persona (Cris). En las notas de datos, la primera
  persona del plural es la de quien se equivocó y lo arregló.
- **Le habla a «tú»**: alguien que le vende al Estado, casi siempre una pyme. Tutea, en chileno
  neutro («postular», «cotizar», «la pega», «plata» cuando cae natural; nunca «vos» ni «usted»).
- **Nunca** «el usuario», «los proveedores», «nuestros clientes» para referirse al lector.

## 2. Las seis reglas

1. **Primero la respuesta.** Cada título dice lo que la página contesta, no el tema. «Cuánto
   paga el Estado por lo que vendes», no «Precios». Una pregunta como título sólo si es la que el
   lector se haría con sus palabras («¿Me conviene postular?»), nunca una que el sitio le hace al
   lector sin decir para qué (**«¿Qué le vendes al Estado?»: ¿me pregunta?, ¿me quiere vender?**).
2. **Cada cifra dice qué cuenta, de cuándo y de cuántos.** «87 compras de 63 organismos, nov 2025
   a oct 2026». Una cifra sin su base se lee como «de siempre» y «de todos».
3. **La jerga se traduce en la misma frase, la primera vez.** «La mediana: la mitad pagó menos de
   $214.000 y la otra mitad, más.» Después se puede usar sola. En una ficha, la traducción va una
   vez, no en cada fila.
4. **Concreto antes que abstracto.** Un producto con nombre, un monto, un plazo, un comprador.
   «Una resma carta se pagó a $3.498», no «los precios del papel son estables».
5. **Corto.** Título de hasta ocho palabras. Bajada de hasta 25. Botón: verbo y objeto («Ver las
   610 abiertas», «Buscar precios»). Si una frase se puede partir en dos, se parte.
6. **Carácter, con medida.** Una frase con gracia por pantalla como mucho, y siempre en lo
   secundario: un estado vacío, un error, el 404, el cierre de una nota, la página de aportes.
   **Nunca sobre una cifra**: con la plata del lector no se bromea.

## 3. Lo que suena a máquina (y se borra)

Los cuatro vicios de siempre:

1. *La antítesis*: «no es X, es Y», «más que X, Y».
2. *El par vacío*: dos o tres negaciones seguidas («sin cuentas, sin planes y sin publicidad»).
3. *El cierre que resume*: la última frase repite lo que el párrafo ya dijo.
4. *La frase que hay que releer*: una cláusula para lo que cabe en cuatro palabras.

Y las muletillas de folleto, que no dicen nada:

| se borra | por qué | en su lugar |
|---|---|---|
| «Descubre», «Explora», «Potencia», «Optimiza» | Verbos de anuncio | Lo que se hace: «Busca», «Mira», «Compara» |
| «información», «datos», «insights» como sustantivo suelto | No dicen cuáles | El dato: «precios pagados», «licitaciones abiertas» |
| «de forma rápida y sencilla», «a un clic», «en un solo lugar» | Promesas que nadie mide | Nada, o el número: «en 3 segundos» |
| «clave», «robusto», «integral», «completo» | Adjetivos sin contenido | La cifra que los justificaría |
| Tríadas por ritmo («claro, simple y útil») | Suena a plantilla | Una palabra, la verdadera |
| Raya (—) para meter un inciso | Tic de texto generado | Punto, coma o paréntesis |
| Dos puntos en cada título («Precios: lo que…») | Un título, una idea | Una frase |
| «¡», emojis | Grita | Nada |

## 4. Las palabras del sitio

Una sola palabra por cosa, en todo el sitio. Si cambia aquí, cambia en todas partes.

| se dice | no se dice | nota |
|---|---|---|
| **comprador** | organismo, institución, entidad (al lector) | «organismo» sólo cuando se cuenta: «63 organismos» |
| **unidad de compra** | unidad (a secas) | La oficina que compra dentro del comprador. «Unidad» a secas se confunde con la unidad de medida del precio |
| **compra** | transacción, registro, observación | Una línea de una orden de compra |
| **orden de compra** | OC | |
| **licitación**, **Compra Ágil** | convocatoria, oportunidad, proceso | «Compra Ágil» con mayúsculas: es el nombre del mecanismo |
| **precio por unidad** | precio unitario (en la interfaz) | |
| **la mitad de las compras** | la mitad central, rango intercuartil | La franja del gráfico |
| **mediana** | precio típico, promedio | Con su traducción la primera vez (regla 3) |
| **8 de cada 10 compras** | percentil 10 a 90 | |
| **mercado** | segmento, nicho | Un rubro visto desde un comprador |
| **rubro** | categoría, sector (salvo «sector» del Estado: Salud, Municipalidades) | |
| **postular**, **cotizar** | ofertar, participar | |
| **abierta** | vigente, activa | Lo que aún recibe ofertas |
| **cierra** | vence, finaliza | |

## 5. Antes y después

| dónde | antes | después |
|---|---|---|
| Portada, `h1` | ¿Qué le vendes al Estado? | Cuánto paga el Estado por lo que vendes |
| Portada, bajada | Antes de cotizar, mira a qué precio se compró en los últimos 12 meses, quién lo compra y qué puedes postular hoy. | Escribe tu producto. Te mostramos a qué precio lo compró el Estado en los últimos 12 meses, quién lo compra y dónde postular hoy. |
| Lectura de precio | Impresora multifuncional: la mitad se pagó entre $167.227 y $320.900 | Impresora multifuncional: la mitad de las compras se pagó entre $167.227 y $320.900 |
| «Lo mejor de hoy» | Abiertas, de compradores que compran seguido por Compra Ágil, de monto mayor y con tiempo para preparar la oferta. El orden sale de esas tres reglas y de nada más. | Ordenadas por tres cosas: cuánto compra ese comprador por Compra Ágil, el monto y el tiempo que queda para cotizar. Nada más. |
| Notas de datos | Lo que encontramos al revisar los datos de compras públicas: qué vimos, cómo lo medimos y qué cambió en el sitio. | Errores que encontramos en los datos, algunos nuestros, y cómo los arreglamos. |
| `/abierto` | Úsalo como quieras | Los mismos datos, para tu código o tu asistente |

## 6. Cómo se revisa un texto

Antes de darlo por bueno, se lee en voz alta con estas cinco preguntas:

1. ¿Alguien que nunca vio el sitio entiende qué le estoy diciendo **y qué puede hacer**?
2. ¿Cada cifra trae su base y su periodo?
3. ¿Hay una palabra de la tabla del §4 dicha de otra forma?
4. ¿Hay algo de la tabla del §3?
5. ¿Lo dice ya la ficha de al lado, a doscientos píxeles? Entonces sobra.

Y dos que vienen de antes y siguen: **no se describe lo que el sitio no hace** (no se promete un
aviso, una alerta ni un dato que no existe), y **no se repite la ficha de al lado**.

Es regla y no gusto: una frase difícil de leer se juzga menos verdadera, no sólo menos agradable
(fluidez de procesamiento, Reber y Schwarz, 1999).
