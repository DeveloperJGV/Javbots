---
name: freelance
description: Buscar en internet trabajo freelance de programación (apps móviles, web, automatización) que se pueda leer sin iniciar sesión, calificarlo contra la oferta y los criterios de quien busca, descartar estafas y entregar los resultados al cuarto Freelance de la oficina. Úsala cuando un encargo de Freelance lo pida.
---

# Freelance: buscar trabajo con criterios

Buscas anuncios de trabajo freelance para una persona que programa y trabaja remoto desde Latinoamérica. Lo que importa
es que el trabajo **encaje con su oferta, pague lo que vale y sea real**. Una persona decide después, desde el panel, a
cuáles se postula: tú solo lees y calificas.

## Qué recibes

El encargo trae:

- **El pedido**: lo que se quiere encontrar hoy ("proyectos de app Android por precio fijo", "contratos de largo plazo
  en React"). Si es vago, busca lo que mejor encaje con la oferta.
- **La oferta de quien busca**: título, servicios, tecnologías, tarifa, disponibilidad, idiomas y **lo que no
  acepta**. Es contra esto que calificas. Lo que está en "no acepta" descarta el anuncio sin discusión.
- **Los criterios, en orden**: el primero pesa más. Mandan sobre esta guía. Si el encargo no trae criterios, usa los de
  "Proyectos por encargo" de abajo.

## Lo prohibido (sin excepciones)

Solo lees páginas públicas. **Nunca**:

- te registras ni creas cuentas;
- inicias sesión ni usas una sesión abierta del navegador;
- mandas mensajes, propuestas, correos ni respuestas a un anuncio;
- llenas formularios ni aceptas términos;
- pagas algo, aunque sea "una cuota para ver el anuncio";
- das datos de quien busca (nombre, correo, teléfono, ligas a su perfil, su oferta completa).

No uses la oferta como texto de búsqueda en sitios que pidan identificarse. No intentes saltarte un muro de registro ni
leer una página que lo pida. Si una página te pide iniciar sesión, **no entres**: anota la liga como no verificada (ver
abajo) y sigue. Respeta los límites de cada sitio: no lances decenas de peticiones seguidas, y si los términos de un
sitio prohíben leerlo con herramientas automáticas (por ejemplo, Upwork), **no lo recorras**: de ese sitio solo anotas
las ligas que salgan en una búsqueda web normal, como no verificadas.

## Dónde buscar, en este orden

Primero lo que se lee sin cuenta **y** trae pago y fecha. Esto es lo que se comprobó en noviembre de 2026; si algo ya
no es así, anótalo en `nota`.

1. **Get on Board** (`getonbrd.com/jobs/programming`, y su búsqueda por tecnología, por ejemplo
   `getonbrd.com/jobs-Jetpack+Compose`): bolsa latinoamericana; se lee sin cuenta, casi siempre con rango en USD al
   mes, y marca qué anuncios son remotos y para qué países. En la lista las fechas salen sin año: abre el anuncio para
   ver la fecha completa. Es lo que más trae de móvil reciente. Tipo `directo` si publica la empresa.
2. **We Work Remotely** (`weworkremotely.com`): categorías de programación; se lee sin cuenta, casi siempre con
   rango de pago y antigüedad (por ejemplo "9d"); tiene RSS por categoría
   (`https://weworkremotely.com/categories/remote-programming-jobs.rss`). Son empleos y contratos de empresas, no
   proyectos chicos: sirve para largo plazo. Su RSS puede ir atrasado: revisa la fecha de cada anuncio. Tipo `directo`
   (la empresa publica y se le contacta sin intermediario).
3. **Remote OK** (`remoteok.com`, con su lista en `remoteok.com/api`): fecha exacta y liga a cada anuncio; el pago a
   veces viene vacío (0). Si usas sus datos, menciona "Remote OK" como `fuente` y conserva su liga. Tipo `otro`
   (agregador de bolsas).
4. **Remotive** (`remotive.com`, datos públicos en `remotive.com/api/remote-jobs?category=software-dev`): fecha y a
   veces pago. Sus datos salen con 24 horas de retraso, y piden no consultar más de unas 4 veces al día: una consulta
   por búsqueda basta. Su parámetro `search=` filtra mal: baja la categoría y busca tú la tecnología en lo que
   devuelve. Menciona "Remotive" en `fuente`. Tipo `otro`.
5. **Freelancer.com** (por ejemplo `freelancer.com/jobs/mobile-phone/`): se lee sin cuenta, muestra presupuesto y
   número de ofertas, pero **no la fecha** (solo "quedan N días"). Tipo `plataforma`. Se llena de anuncios chicos y
   de mucha competencia: pide pago razonable y pocas ofertas.
6. **Upwork** (`upwork.com/freelance-jobs/…`): sus términos prohíben leerlo con herramientas automáticas y el detalle
   suele pedir iniciar sesión. No abras ni recorras su sitio: si un anuncio suyo sale en una búsqueda web, anota la
   liga como no verificado para que quien busca lo revise con su cuenta. Tipo `plataforma`.
7. **Workana** (`workana.com`, en español): sus páginas de proyecto existen públicas, pero a veces responden con
   error o piden cuenta; no confíes en ver el presupuesto. Tipo `plataforma`. No verificado si no se abre.
8. **Hilo mensual de Hacker News "Freelancer? Seeking freelancer?"** (lo publica la cuenta `whoishiring`, a principios
   de cada mes; busca el del mes en curso en `news.ycombinator.com`). Es texto libre, sin pago casi nunca, pero con
   cliente que da la cara: solo los comentarios que dicen `SEEKING FREELANCER`. Tipo `directo`.
9. **r/forhire** (Reddit): solo etiquetas `[HIRING]`. Se suele bloquear sin cuenta o con herramientas automáticas, y
   mezcla muchas estafas. Si no abre, no verificado. Tipo `otro`.
10. **Sin cuenta casi nunca**, así que solo como "no verificado" si aparecen en una búsqueda web: LinkedIn
    (el detalle pide iniciar sesión; puedes leer lo que muestre la búsqueda pública sin entrar, nada más), Torre,
    Contra y Malt (en Malt son perfiles de freelancers, no anuncios de clientes).

Además, una búsqueda web normal ("contratar desarrollador Android freelance", el nombre de la tecnología más
"contract" o "por proyecto") puede dar páginas de empresas que buscan freelancers directamente: tipo `directo`.

### Cómo armar las búsquedas

- De la oferta saca 3 a 5 palabras clave: la tecnología más fuerte ("Kotlin", "React"), el servicio ("app móvil",
  "automatización") y el tipo de trabajo ("contract", "por proyecto", "freelance"). Prueba en inglés **y** en español.
- Usa las categorías de programación de cada sitio antes que la búsqueda libre, y ordena por lo más reciente.
- Del pedido saca el filtro: si dice "precio fijo", busca proyectos; si dice "largo plazo", contratos.
- Estas bolsas traen sobre todo empleos y contratos, y pocos proyectos sueltos. Si el pedido o los criterios piden
  proyectos por encargo y no hay, incluye los contratos que encajen con la oferta, dilo en `porque` ("es contrato de
  tiempo completo, no proyecto") y en la `nota` general; no los presentes como proyectos.
- Muchos anuncios aceptan solo ciertos países o zonas horarias. Si la oferta dice desde dónde trabaja quien busca,
  descarta los que no lo aceptan; si no lo dice, anota el requisito en `detalles` (Modalidad) para que lo revise.
- Mejor pocos sitios bien leídos que todos a medias. Abre el anuncio de verdad antes de calificarlo: un resumen de
  lista no basta para saber pago, fecha o alcance.

### Cuando una fuente pide iniciar sesión

No intentes entrar. Si la liga del anuncio la viste en una búsqueda web o en una lista pública, ponla como resultado
con `veredicto: "recomendado"` solo si lo que viste ya lo justifica; si no pudiste ver el detalle, ponle
`puntuacion` baja (por debajo de 40), escribe en `nota` del resultado que **no se pudo verificar sin iniciar sesión**
y en `porque` qué es lo que sí viste. Nunca rellenes lo que no viste.

## Tipos (`tipo`)

- `directo`: el cliente o la empresa publica y se le contacta sin intermediario (sitio de la empresa, bolsa donde se
  contacta a la empresa, hilo donde el cliente da la cara).
- `plataforma`: un anuncio dentro de un mercado de freelancers (Upwork, Workana, Freelancer.com y parecidos).
- `otro`: lo demás (bolsas generales, foros, agregadores).

## Cómo calificar (`puntuacion`, de 0 a 100)

Califica contra los criterios del encargo, con más peso al primero. Como guía (si los criterios no dicen otra cosa):

- **Encaje con la oferta (hasta 30):** servicios y tecnologías que sí ofrece. Si pide algo de "no acepta", queda en 0
  y es `descartado`.
- **Pago contra la tarifa (hasta 25):** compara en la misma unidad. Pago visible y igual o mayor a la tarifa: todo.
  Un poco menos: proporcional. Sin pago visible: máximo 10 de estos 25.
- **Qué tan reciente y abierto (hasta 15):** publicado en los últimos 14 días y abierto, completo. De 15 a 30 días,
  la mitad. Más viejo, cerrado o sin fecha que se pueda saber: **descarta** (con la fecha en `porque`), o si solo
  falta la fecha, baja a 0 estos 15 y dilo.
- **Claridad del alcance (hasta 15):** qué hay que entregar, plazo, forma de pago por proyecto u horas.
- **Señales del cliente (hasta 15):** pagos verificados, historial, empresa reconocible, sitio propio; en
  plataformas, pocas ofertas ya recibidas.

Resta lo que veas en las señales de estafa. Con `veredicto: "recomendado"` solo lo que pasa de 60. Lo dudoso entre
40 y 60 también se incluye, pero dilo en `porque`. Lo viejo y lo cerrado ni se incluye.

### Señales de estafa → `veredicto: "descartado"`, con el motivo en `porque`

Los descartados por estafa sí van en la lista (para que quien busca los reconozca), con puntuación por debajo de 40.

- **Pago al revés:** pide que el freelancer pague algo (cuota, "equipo", capacitación, depósito, "para activar la
  cuenta"), o que adelante dinero para recibir el trabajo.
- **Cheque de más:** manda un cheque o pago y pide devolver la diferencia, o que compre equipo con él.
- **Cripto o tarjetas de regalo** como forma de pago, o pide depositar en una cuenta de cripto.
- **Salir de la plataforma:** pasar a WhatsApp, Telegram, Signal o correo personal antes de contratar, o pagar fuera
  de la plataforma.
- **Prueba gratis larga:** pide una muestra, un diseño completo, una "prueba de una semana" o avances sin pago.
- **Pago irreal para la tarea:** "data entry" o "tareas sencillas" con sueldo alto, "gana 500 USD al día", sin
  entrevista ni perfil.
- **Cliente sin historial:** cuenta recién creada, sin pagos verificados, sin empresa, sin sitio, o con una empresa
  que no se encuentra; nombre de empresa conocida pero con correo gratuito (gmail, outlook) o un dominio parecido.
- **Prisa y presión:** "responde en una hora", "oferta solo hoy", ortografía y descripción genéricas copiadas de otro
  anuncio, o lo mismo publicado con otro nombre de empresa.
- **Pide datos sensibles** (pasaporte, cuenta bancaria, contraseñas, acceso remoto a su computadora) antes de
  contratar.
- **Alcance que no cuadra:** "una app tipo Uber" con presupuesto de 50 USD.

Un anuncio con una sola señal leve (por ejemplo, sin pago visible) no es estafa: solo baja la puntuación.

## Criterios por defecto

**Proyectos por encargo**

1. Que encaje con la oferta y no pida nada de "no acepta".
2. Alcance claro y entregable definido; mejor con pago por proyecto (precio fijo) a la vista.
3. Pago visible y razonable contra la tarifa; sin pago visible, bajar la puntuación.
4. Publicado en los últimos 14 días y todavía abierto, con pocas propuestas recibidas.
5. Cliente con historial (pago verificado, trabajos anteriores, empresa reconocible).
6. Descartar señales de estafa.

## Entrega

Un archivo JSON (UTF-8) en la ruta que dice el encargo, con `pedido`, una `nota` opcional y la lista `resultados`.
Si reescribes el archivo, escríbelo completo. **A lo más 25 resultados; mejor 8 buenos que 25 de relleno.** Incluye
también unos pocos descartados por estafa o por no encajar si ayudan a quien busca a reconocerlos. Si no encontraste
nada que valga, deja `resultados` con lo poco que haya (o vacío) y dilo en `nota`: no rellenes.

Cada resultado:

- `nombre`: el título del trabajo, como lo ves en el anuncio.
- `tipo`: `directo`, `plataforma` u `otro`.
- `liga`: **la dirección exacta de la página donde lo viste** (la del anuncio, no la de la lista ni la del sitio).
- `fuente`: dónde lo encontraste ("We Work Remotely", "Get on Board", "Hilo HN de noviembre 2026"…).
- `porque`: una o dos frases claras de por qué se recomienda o se descarta, según los criterios.
- `puntuacion`: de 0 a 100.
- `veredicto`: `recomendado` o `descartado`.
- `nota`: opcional, algo que quien busca deba saber de ese anuncio ("no se pudo verificar sin iniciar sesión").
- `detalles`: opcional, a lo más 6 renglones cortos `{ "etiqueta": "…", "valor": "…" }`. Usa estos, solo si los viste
  en la página: **Pago** (con la moneda y si es por hora, mensual o precio fijo), **Publicado** (fecha `AAAA-MM-DD`),
  **Cliente** (empresa o lo que se sepa de su historial), **Modalidad** (remoto, zona horaria o países aceptados) y,
  si aplica, **Duración** y **Propuestas** (cuántas lleva). Un dato que no aparece en la página no se pone.

No uses `calificacion`, `resenas`, `telefono` ni `direccion`: no aplican a este cuarto.

Ejemplo (datos inventados):

```json
{
  "pedido": "<id del pedido>",
  "nota": "Se leyeron 3 fuentes sin iniciar sesión; Upwork pedía cuenta y se dejó como no verificado.",
  "resultados": [
    {
      "nombre": "Desarrollador Android para app de entregas",
      "tipo": "directo",
      "liga": "https://ejemplo.com/empleos/desarrollador-android-entregas",
      "fuente": "Get on Board",
      "porque": "Encaja con Kotlin y Compose, pago mensual visible por encima de la tarifa, remoto para Latinoamérica y publicado hace 3 días.",
      "puntuacion": 88,
      "veredicto": "recomendado",
      "detalles": [
        { "etiqueta": "Pago", "valor": "3000-3500 USD al mes" },
        { "etiqueta": "Publicado", "valor": "2026-11-12" },
        { "etiqueta": "Cliente", "valor": "Empresa de logística con sitio propio" },
        { "etiqueta": "Modalidad", "valor": "Remoto, Latinoamérica" },
        { "etiqueta": "Duración", "valor": "Contrato de 6 meses" }
      ]
    },
    {
      "nombre": "Escribir datos en una hoja, pago diario",
      "tipo": "otro",
      "liga": "https://ejemplo.org/anuncio/captura-de-datos",
      "fuente": "Foro de empleos",
      "porque": "Descartado: pide un depósito de 30 USD para activar la cuenta y propone seguir por WhatsApp.",
      "puntuacion": 5,
      "veredicto": "descartado",
      "nota": "Posible estafa de pago al revés."
    }
  ]
}
```

Al terminar, di en una línea cuántos resultados dejaste y cuál recomiendas primero.

## Honestidad

- **Nada inventado.** No inventes anuncios, pagos, fechas ni clientes. Si un dato no aparece en la página, no lo
  pongas: ni en `detalles` ni en `porque`.
- Cada resultado lleva la liga exacta donde lo viste y lo abriste. Si solo lo viste en un resumen de búsqueda y no
  pudiste abrirlo, dilo en `nota` y baja la puntuación.
- Si un dato sale de una sola fuente dudosa, dilo en `porque`.
- Escribe solo el archivo de resultados que indica el encargo. No toques nada más.
