# Librero

Un librero en la oficina, hermano del estante de juegos (`features/coleccion`). Al abrirlo, los libros salen en
**repisas por género**, cada uno de lomo y dibujado por código, con el título en el lomo. Se llena a mano (con ayuda
de Open Library si tiene ISBN). Arranca vacío.

Es una función normal de la oficina: reglas y código. Lo único que sale a internet son las consultas a
**Open Library** (abajo): un ISBN, o el título y el primer autor.

## Qué hace

- **Repisas por género** (de fábrica), en un orden de librero: novela, cuento, poesía, teatro, ciencia ficción,
  fantasía, terror, policiaca, histórica, romance, cómic y manga, infantil y juvenil, biografía, ensayo, historia,
  ciencia, filosofía, psicología, negocios, tecnología, arte y diseño, viajes, cocina, religión, referencia
  (`core/genres.ts`). Un género escrito a mano tiene su repisa después, y los libros sin género van al final.
  «Repisas por» cambia a **autor** (el primero), **editorial** o **saga**. Dentro de cada repisa: por autor, luego
  saga y número, luego título; los libros de una misma saga quedan juntos con su placa.
- **Los lomos** (`webview/spine.ts`): pasta dura más alta con franjas doradas, pasta blanda más baja con la marca de
  su editorial, digital como una tableta delgada. El grueso sale de las páginas (un libro que no lo dice tiene uno
  suyo); el color, de su título y autor, siempre el mismo. Marcas: separador rojo si se está leyendo, papelito
  amarillo si está prestado, estrellita si llegó esta semana.
- **El libro abierto:** sale de la repisa y se abre. En la guarda: ex libris (de quién es), a quién se prestó y desde
  cuándo (con «Ya lo devolvió»; a los tres meses dice que ya va siendo hora), la portada y sus botones, y las notas.
  En la primera página: género, título, autores, edición (editorial, año, páginas, idioma), formato, cómo va (con la
  fecha en que se terminó), saga, ISBN, y botones para cambiar «cómo va» de un clic. La saga se ve como lomitos por
  número, con los que faltan punteados. Abajo: anterior / siguiente de la repisa (también con las flechas),
  Editar, Prestar, Borrar (en dos pasos).
- **Agregar a mano, rápido:** solo el título es obligatorio. Enter guarda y deja puesto lo que se repite (género,
  formato, idioma, dueño, «se busca»); si el libro era de una saga, deja también el autor, la editorial y la saga con
  el **número siguiente**, para meter una saga completa seguida. El cursor vuelve al título, o al ISBN si el anterior
  se llenó con el ISBN.
- **Con el ISBN** (o un lector de código de barras, que teclea el ISBN y Enter): Enter en el ISBN le pregunta a Open
  Library y enseña lo que dice (título, autores, editorial, año, páginas) **antes** de tocar la ficha. «Pasar a la
  ficha» lo copia para revisarlo; «Pasar y guardar» lo copia y guarda; «No es este» lo descarta. Si Open Library
  tiene la portada de ese ISBN, se pone al guardar. Un ISBN cuyo dígito de control no cuadra se avisa (se guarda
  igual: puede ser un ISBN mal impreso).
- **«Se busca»:** huecos punteados en su repisa con el precio que se vio (y dónde). «¡Ya lo tengo!» lo convierte en
  libro (llega ese día).
- **Buscador** por título, autor, saga o editorial: un autor, saga o editorial se ilumina en todas las repisas; un
  libro se abre.
- **«¿Qué leo ahora?»:** qué se antoja (seguir uno empezado, el que sigue de una saga, uno que espera en la repisa,
  sorpréndeme), qué tan largo (corto: menos de 220 páginas; medio; largo: más de 480) y qué género. Propone tres con
  el porqué; «Otros tres» sigue. **Los prestados no cuentan** (no están en casa). «El que sigue de una saga» es, en
  cada saga con algo leído (o leyéndose), el de número más bajo después del último leído que esté en casa y sin leer.

Teclado: `/` busca, `N` agrega, las flechas recorren los libros, Enter abre, Esc regresa un paso (y cierra). Con un
libro abierto, izquierda / derecha pasan al de al lado.

Se abre con un clic en el librero o con `#libros` al final de la dirección de la oficina. Solo la página con la llave
de la oficina lo ve y puede guardar, editar o borrar.

## Dónde viven los datos

Todo en un archivo: `~/.pixel-agents/libros.json`, con las mismas garantías que la colección de juegos: escritura
atómica (temporal y renombrar), la oficina ve sola los cambios hechos a mano, los campos que no conoce se conservan,
un archivo que no se puede leer se aparta como `libros.danado-<fecha>.json` al guardar el siguiente libro, uno de
más de 8 MB no se lee ni se escribe encima. Como mucho 10 000 libros. **Borrar** no pierde nada: el libro pasa a
`trash` dentro del mismo archivo (los 100 más recientes).

```json
{
  "version": 1,
  "books": [
    {
      "id": "k3x9q2ab",
      "title": "El faro de niebla",
      "authors": ["Marta Olmo"],
      "publisher": "Editorial Brújula",
      "genre": "Novela",
      "year": 2019,
      "isbn": "9780306406157",
      "language": "Español",
      "format": "pasta-blanda",
      "pages": 320,
      "series": "Crónicas del Faro",
      "seriesNumber": 1,
      "reading": "leido",
      "owner": "",
      "lentTo": "Luis",
      "lentAt": "2026-11-02",
      "notes": "",
      "wanted": false,
      "price": "",
      "seenAt": "",
      "addedAt": "2026-11-23",
      "finishedAt": "2026-11-20",
      "updatedAt": "2026-11-23T20:15:00.000Z"
    }
  ],
  "trash": []
}
```

- Texto vacío y 0 quieren decir «sin anotar». Solo el título es obligatorio.
- `authors`: lista, en el orden del libro (el primero decide su repisa por autor). En el formulario se escriben
  separados por comas; nunca se parte por « y » («José Ortega y Gasset» es uno).
- `genre`: texto libre; los de la lista se escriben como ella («ciencia ficcion» → «Ciencia ficción»).
- `isbn`: solo dígitos (y una X final), 10 o 13; los guiones eran solo cómo venía impreso.
- `format`: `pasta-dura`, `pasta-blanda`, `digital`. `reading`: `sin-leer`, `leyendo`, `leido`, `a-medias` (uno que
  se dejó, no el que se lee ahora).
- `seriesNumber`: su número en la saga (sin saga no hay número).
- `lentAt` lo pone el guardado el día que se anota a alguien en `lentTo` (y se borra al devolverlo); `finishedAt`, el
  día que «cómo va» pasa a «leído». Los dos se pueden corregir a mano en el archivo.
- Un «se busca» es un libro con `"wanted": true` y su `price`: no tiene lectura, préstamo ni fecha de terminado.
- `coverArt` (opcional, lo escribe **solo el servidor**): `{ "source": "openlibrary" | "subida", "key":
"isbn:<isbn>" | "id:<id de portada>" | "", "at": "<fecha ISO>", "type": "png" | "jpg" | "webp" }`. Nunca una ruta.
  Si al guardar cambia el **título, el primer autor o el ISBN**, una portada de Open Library se quita (ya no es de
  ese libro); una **subida a mano** se queda. `coverNone`: la fecha en que se contestó «Ninguna».

## Open Library

[Open Library](https://openlibrary.org) es del Internet Archive, sin llave. Probado de verdad el 2026-11-23 (pocas
llamadas, espaciadas):

- `https://openlibrary.org/api/books?bibkeys=ISBN:<isbn>&jscmd=data&format=json` da la edición de ese ISBN: título,
  autores, editoriales, fecha, páginas y portada (`{}` si no lo conoce). Los datos vienen como vienen (un título con
  «4. edición» pegado, una editorial con un espacio al principio): por eso se enseñan y la persona decide.
  No lo conoce todo: un ISBN mexicano (prefijo 607) que probé dio `{}`; uno español y uno inglés, sí.
- `https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false` da la portada de ese ISBN o 404.
- `https://openlibrary.org/search.json?title=…&author=…` busca por título y autor (con `cover_i`, el id de portada).
- `https://covers.openlibrary.org/b/id/<id>-M.jpg` (o `-L`) da la portada por id; muchas veces **redirige** a
  `archive.org`, que redirige a uno de sus servidores `ia<n>.us.archive.org`.
- A ratos **corta la conexión** (visto con curl y con Node el mismo día) o tarda varios segundos: cada petición que no
  obtuvo respuesta se intenta una vez más, y si no, se dice «no contestó, intenta en un rato».
- Google Books **sin llave no sirve**: contestó 429 (cuota diaria 0 para clientes sin proyecto).

### Portadas: nunca una dudosa en silencio

«Buscar portada» (en cada libro) y «Portadas → Buscar las que faltan» (todos, con avance y «Detener»):

1. **Por su ISBN:** la portada de esa edición. Es la única que se pone sola.
2. **Por título y primer autor:** solo se **ofrecen**, hasta 4 («elige una», con su título, autores y año de la
   primera edición), y la persona escoge o dice «Ninguna» (queda anotado y «Buscar las que faltan» ya no lo busca). Un
   resultado de **otro autor nunca se ofrece**. Parecido = el mismo título, el mismo sin el subtítulo, uno dentro del
   otro, o casi las mismas palabras (`core/lookup.ts`).
3. **A mano:** subir una imagen (PNG, JPEG o WEBP, hasta 4 MB), o arrastrarla a la guarda.

Sobre un libro que ya tiene portada, buscar nunca la cambia: siempre enseña las opciones con la actual marcada y
«Dejar la que tiene». «Buscar las que faltan» salta lo que ya se sabe (una elección esperando, «Ninguna», o «nada
parecido») y vuelve a intentar lo que no contestó (`runSearches` en `core/cover.ts`; el número del botón usa la misma
regla).

### Seguridad

- Un solo camino a la red, **el de la colección** (`features/coleccion/server/covers/net.ts`, compartido): solo
  `https`, solo `openlibrary.org`, `covers.openlibrary.org`, `archive.org` y `ia<n>.us.archive.org`; hasta 3
  redirecciones en un GET, **cada una revisada** con la misma lista (a otro sitio, o a `http`, es error). 20 s por
  petición, tope de bytes contado al leer (4 MB una imagen, 1 MB una respuesta). `User-Agent` genérico. Los errores
  nunca dicen la dirección. La colección de juegos sigue sin seguir ninguna redirección (su política no cambió).
- Una cola para Open Library: **una petición cada 3 s** como mucho (Open Library pide no pasar de 100 portadas por
  ISBN cada 5 minutos).
- Las imágenes se revisan por sus primeros bytes y su tamaño en pixeles por la cabecera (8192 px de lado, 24
  millones de pixeles) antes de guardarlas, igual que en la colección (`checkImage`, compartido).
- Rutas de imagen con la llave de la oficina (`?token=` o `Authorization: Bearer`) y `Content-Security-Policy:
default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`:

| Método | Ruta                             | Qué                                                         |
| ------ | -------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/libros/portada/<id>`       | La portada (solo un id de libro). Añade `&v=<coverArt.at>`. |
| GET    | `/api/libros/candidata/<id>/<n>` | Miniatura `n` (0 a 3) de la última «elige una».             |
| POST   | `/api/libros/portada/<id>`       | Subir una imagen: el cuerpo es la imagen.                   |

- Una portada nueva se escribe aparte, luego se guarda `libros.json` y **solo entonces** reemplaza a la anterior.
- Las imágenes viven en `~/.pixel-agents/libros/portadas/<id>.<png|jpg|webp>` (las miniaturas de «elige una» en
  `.candidatas/`). Al arrancar se vacía `.candidatas/` y se borran las de libros que ya no están, solo si
  `libros.json` existe y se leyó entero.

Mensajes (`core/asyncapi.yaml`, bloque «Book library», solo clientes con la llave): `librosOpen`, `librosSave
{requestId, book}`, `librosDelete {requestId, id}`, `librosLookup {requestId, isbn}` (contesta `librosLookupResult`:
`found` o `reason` `invalido` / `desconocido` / `sin-respuesta`; nunca guarda), `librosCoverFind {id}`,
`librosCoverRun {action: start|stop}`, `librosCoverPick {requestId, id, n, stamp}`, `librosCoverDismiss {requestId,
id, stamp}`, `librosCoverRemove {requestId, id}`. `librosStatus` trae los libros, `covers` (la última búsqueda de cada
uno desde que arrancó la oficina) y `coverRun`.

## Qué se comparte con la colección de juegos

Sin copiar: el camino seguro a la red y su cola (`net.ts`, con una política propia por feature: la de la colección
quedó igual, por defecto), los archivos de imagen (`coverFiles.ts`, ahora con la carpeta como parámetro, por defecto
la de la colección), la revisión de imágenes por cabecera, la limpieza de texto, los ids, `fold` (comparar sin acentos)
y los textos de tiempo («hace 3 meses»). Las pruebas de la colección siguen pasando; hay una nueva que comprueba que
su política sigue sin seguir redirecciones.

## Dónde vive cada cosa

```
features/libros/
  core/        TypeScript puro: formato del archivo, ISBN, géneros, repisas, buscador, «¿Qué leo ahora?»,
               qué contesta Open Library y cuál portada se parece
  server/      La oficina: libros.json, los mensajes y las rutas de portadas
    covers/    Open Library (datos y portadas) y la búsqueda de portadas
  webview/     El panel (repisas, libro abierto, cartel de «se busca», formulario, «¿Qué leo ahora?», portadas)
  arte/        El librero dibujado por código (armar.py) y el script que lo pone en un plano (poner.cjs)
  assets/      LIBROS_SHELF (2×2)
  test/        Pruebas del núcleo, del servidor y del panel
```

## El mueble

`LIBROS_SHELF` (2×2, la fila de arriba es fondo) se dibuja con `python features/libros/arte/armar.py`: un librero de
nogal con tres repisas de libros de colores (pasta dura con franjas doradas, una pila acostada, uno ladeado, un
sujetalibros) y encima una lámpara de lectura verde y dos libros. Para ponerlo en un plano:
`node features/libros/arte/poner.cjs [plano.json] [--piso <id>] [--en <col>,<fila>]`. Sin `--en` lo pone en Becarios
(planta baja) contra la pared de arriba (30,18 en el plano de fábrica) y, si ahí no cabe, en el primer lugar libre
que no corte el paso. No lo duplica y no toca la carpeta real de la persona sin `--real`.

## Lo que sigue (no está)

Importar una lista (CSV, Goodreads), leer el código de barras con la cámara del celular, estadísticas de lectura por
año, y portadas en pixel art en la repisa (de frente), como las cajas de juegos.

## Pruebas

```bash
npm run test:server -- libros
npm run test:webview -- libros
```
