# Colección de juegos

Un estante en la oficina, junto a la tele del cuarto de juegos. Al abrirlo, la colección sale en **repisas por
consola**, del Atari 2600 al Switch 2 (portátiles y PC incluidas), con cada caja o cartucho dibujado por código y
el nombre en el lomo. Se llena a mano: arranca vacía.

Es una función normal de la oficina: reglas y código. Lo único que sale a internet son las **portadas** (abajo):
solo el nombre del juego y la consola, a dos fuentes fijas.

## Qué hace

- **Repisas por consola:** una por consola que tenga algo, en el orden del riel de la izquierda (agrupado por época
  y, dentro de cada época, por año de salida en América; con cuántos juegos hay en cada una). El riel enseña solo
  las consolas con juegos; «+ Otra consola» abre las demás (con la colección vacía salen todas). Cada repisa se
  recorre sola con sus flechas, con la rueda de lado (o Shift + rueda) o arrastrando. Cada una dice cuántos tiene, cuántos busca y cuántos van a medias; la consola con más juegos
  (5 o más) se ilumina.
- **Caja abierta:** la caja sale de la repisa y se abre como estuche. Atrás, su ficha: región, completo / suelto /
  sellado, cómo va, última vez que se jugó, jugadores, cuánto dura una partida, de quién es, cuándo llegó, su serie
  (con los demás de la serie en todas las consolas, los que faltan punteados) y notas. Adentro, el disco girando o el
  cartucho. Botones: anterior / siguiente de la repisa, Editar, «Lo jugamos hoy» y Borrar (en dos pasos).
- **Agregar a mano:** solo el nombre y la consola son obligatorios. Pensado para meter muchos seguidos: Enter guarda
  y deja la consola (y la región y el dueño) puestos, con el cursor otra vez en el nombre.
- **«Se busca»:** huecos punteados en su repisa con el precio que se vio (y dónde, si se quiere). «¡Ya lo tengo!» lo
  convierte en juego (entra a la colección ese día). «Solo «se busca»» deja iluminados solo los huecos.
- **Buscador** por juego o por serie: una serie se ilumina en todas las repisas; un juego se abre. **Agrupar por
  serie** junta en cada repisa los de una misma serie, con su placa.
- **«¿Qué jugamos hoy?»:** quiénes (solo, dos, 3-4), cuánto tiempo, qué se antoja (terminar uno a medias, uno sin
  jugar, uno de siempre, sorpréndeme) y qué consola. Propone tres, con el porqué; «Otras tres» sigue con la lista.
- **Vacía** enseña una repisa con huecos y «Agrega el primero».

Teclado: `/` busca, `N` agrega, las flechas recorren las cajas (izquierda / derecha en la repisa, arriba / abajo a la
otra repisa), Inicio / Fin, Enter abre, Esc regresa un paso (y cierra). Con la caja abierta, las flechas pasan a la
siguiente.

Se abre con un clic en el estante o con `#coleccion` al final de la dirección de la oficina. Solo la página con la
llave de la oficina ve la colección y puede guardar, editar o borrar.

## Dónde viven los datos

Todo en un archivo: `~/.pixel-agents/coleccion.json`. Se escribe de forma atómica (archivo temporal y renombrar), y
la oficina ve sola los cambios hechos a mano antes de escribir encima.

```json
{
  "version": 1,
  "games": [
    {
      "id": "k3x9q2ab",
      "title": "Capitán Cohete 2",
      "platform": "n64",
      "wanted": false,
      "region": "ntsc-u",
      "condition": "completo",
      "progress": "a-medias",
      "players": 2,
      "coop": true,
      "length": "1h",
      "series": "Capitán Cohete",
      "owner": "",
      "notes": "",
      "price": "",
      "seenAt": "",
      "addedAt": "2026-11-13",
      "lastPlayed": "2026-11-01",
      "updatedAt": "2026-11-13T20:15:00.000Z"
    }
  ],
  "trash": []
}
```

- Texto vacío y 0 quieren decir «sin anotar». Un hueco «se busca» es un juego con `"wanted": true` y su `price`.
- `platform`, en el orden del riel (`core/platforms.ts`):
  - Clásicas: `a2600` Atari 2600, `intv` Intellivision, `coleco` ColecoVision, `a7800` Atari 7800.
  - 8 y 16 bits: `nes`, `sms` Master System, `gb` Game Boy, `genesis`, `tg16` TurboGrafx-16, `neogeo`, `gg` Game
    Gear, `snes`, `segacd`, `32x`, `gbc` Game Boy Color.
  - 32 y 64 bits: `3do`, `jaguar`, `saturn`, `vboy` Virtual Boy, `ps1`, `n64`, `ngpc` Neo Geo Pocket Color.
  - 128 bits: `dreamcast`, `ps2`, `gba` Game Boy Advance, `xbox`, `gc`.
  - HD: `ds`, `psp`, `x360`, `ps3`, `wii`, `3ds`, `psvita`, `wiiu`, `ps4`, `xone`.
  - Ahora: `switch`, `xsx`, `ps5`, `switch2`.
  - Computadora: `pc` (no tiene generación: su propio grupo, al final).

  Otra escrita a mano sale en su propia repisa después de todas.

- `region`: `ntsc-u`, `pal`, `ntsc-j`, `otra`. `condition`: `completo`, `suelto`, `sellado`. `progress`: `sin-jugar`,
  `a-medias`, `terminado`, `de-siempre`. `length`: `rato`, `1h`, `tarde`.
- `externalId`, `barcode` y `cover` (opcionales) quedan listos para la etapa 2 y todavía no se usan (`cover` es
  texto libre viejo: no es la portada).
- `coverArt` (opcional, lo escribe **solo el servidor**): la portada del juego,
  `{ "source": "libretro" | "igdb" | "subida", "key": "<archivo de libretro o image_id de IGDB>", "at": "<fecha ISO>",
"type": "png" | "jpg" | "webp" }`. Nunca una ruta. Lo que mande la página en ese campo al guardar se ignora.
  Si al guardar cambia el **nombre o la consola** (no solo mayúsculas o puntuación), una portada que encontró una
  fuente se quita (ya no es de ese juego) y la ficha dice que hay que buscarla de nuevo; una **subida a mano** se
  queda.
- `coverNone` (opcional, lo escribe **solo el servidor**): la fecha ISO en que la persona contestó «Ninguna» a
  «elige una». «Buscar las que faltan» ya no busca ese juego hasta que se busque a mano («Buscar otra vez»), cambie
  de nombre o consola, o tenga portada. Archivos sin este campo se leen igual.
- Al leer, lo que no se entiende toma su valor de fábrica y sale como aviso abajo de las repisas; al guardar se
  conservan los campos desconocidos.
- **Borrar** no pierde nada: el juego pasa a `trash` dentro del mismo archivo (los 100 más recientes).
- Un archivo que no se puede leer se aparta como `coleccion.danado-<fecha>.json` al guardar el siguiente juego. Uno
  de más de 8 MB no se lee ni se escribe encima. Como mucho 5000 juegos.

## Portadas

Cada juego puede tener su portada (la caja). Se busca de uno en uno («Buscar portada») o para toda la colección
(«Buscar las que faltan», con avance, se puede detener). **Nunca se pone en silencio una dudosa.** Cada búsqueda
termina en:

- **encontrada**: el nombre completo, normalizado, es igual al de un archivo de la fuente. Se baja y se pone.
- **elige una**: algo parecido (sin el subtítulo, un nombre dentro del otro, casi las mismas palabras): hasta 4
  candidatas con su nombre y región; la persona escoge. Las miniaturas se bajan solo al verlas. «Ninguna» se guarda
  en el juego (`coverNone`).
- **no encontrada**, con el motivo: `sin-cobertura`, `pocas` (la fuente casi no tiene esa consola), `sin-llave`,
  `sin-respuesta` (una fuente no contestó: vuelve a intentar; aunque la otra no haya encontrado nada, nunca se
  cuenta como «no hubo coincidencia»), `sin-coincidencia` o `cambio` (cambió el nombre o la consola).

**«Cambiar»** (un juego que ya tiene portada) nunca pone una sola: siempre enseña las candidatas de todas las
fuentes (otras regiones y las parecidas), con la actual marcada, y «Dejar la que tiene». **Una portada subida a
mano nunca se reemplaza sin que la persona lo escoja.**

**«Buscar las que faltan»** salta lo que ya se sabe: los juegos con una elección esperando, los que tienen
«Ninguna» y los que una búsqueda ya supo que no están (`sin-coincidencia`, `sin-cobertura`, y `sin-llave` / `pocas`
mientras no haya llave). Vuelve a intentar los que no contestaron y, con llave nueva, los que la necesitaban. Lo
cuenta aparte («sin respuesta», «se saltaron»). El número del botón usa la misma regla (`runSearches` en
`core/cover.ts`).

Para emparejar (`core/coverMatch.ts`, sin Node): minúsculas, sin acentos, `&` = «and», `:` / `-` / `_` / `/`
como separadores, el artículo del final al frente («Legend of Zelda, The» = «The Legend of Zelda»), sin puntuación,
números romanos I a XX como dígitos en los dos sentidos («Space Saga 13» = «Space Saga XIII»; solo si así queda un
único juego), y las palabras pegadas («Spiderman» = «Spider-Man»; los números nunca se pegan). Una **letra sola**
(«X», «V», «I») nunca basta para «encontrada» contra un número («Rocket Man X» contra «Rocket Man 10»): a lo más
«elige una». Se descartan hacks `[...]`, y las copias que no son de tienda aunque la palabra no vaya al inicio:
`(Unl)`, `(Beta …)`, `(… Demo)`, `(Proto)`, `(Kiosk)`, `(… Sample)`, `(Promo)`, `(Preview)`, `(Trial)`,
`(Taikenban)`, «Not For Resale» y «Action Replay». En IGDB también cuentan los otros nombres del juego
(`alternative_names`, p. ej. el título en español), y lo que IGDB regresó para esa consola sale al menos como
«elige una». Entre copias del mismo
juego: la región del juego (`ntsc-u` USA, `pal` Europa, `ntsc-j` Japón; sin región: USA, Europa, Japón), luego la
que tenga menos etiquetas extra, luego **sin «Rev»** (una reimpresión trae la misma caja; entre revisiones, la más
alta), luego el disco 1.

### Las fuentes

1. **libretro-thumbnails** (`https://thumbnails.libretro.com/<Carpeta>/Named_Boxarts/`), sin llave. El listado de
   la carpeta de cada consola se baja una vez y se guarda una semana en
   `~/.pixel-agents/coleccion/portadas/.listados/<consola>.json`. Cubre todas las consolas de la lista menos Xbox
   One, Xbox Series, PS5, Switch, Switch 2 y PC; de Xbox 360 y PS3 tiene muy pocas («pocas»). Las imágenes son
   del proyecto libretro-thumbnails (github.com/libretro-thumbnails): revisa sus condiciones de uso.
2. **IGDB** (la base de juegos de Twitch), con la llave gratuita de la persona: solo para las consolas que libretro
   no tiene o casi no tiene, y para lo que libretro no encontró. Es gratis para uso no comercial bajo el
   [acuerdo de desarrolladores de Twitch](https://www.twitch.tv/p/legal/developer-agreement/). La llave se saca así:
   cuenta de Twitch con verificación en dos pasos → registrar una app en
   <https://dev.twitch.tv/console/apps/create> (OAuth Redirect URL `http://localhost`, Client Type «Confidential»)
   → copiar el Client ID y sacar un Client Secret con «New Secret». Se pega en el panel y se guarda aparte, en
   `~/.pixel-agents/coleccion-igdb.json` (0600 al crearlo); nunca en `coleccion.json` ni de vuelta a la página
   (solo «llave puesta»). La forma de la API (token de Twitch, `POST /v4/games` con Apicalypse, imágenes
   `t_cover_big` / `t_cover_big_2x`) sale de la documentación oficial, <https://api-docs.igdb.com/>.
   **Sin comprobar contra IGDB de verdad**: los nombres de consola de IGDB (`server/covers/constants.ts`) se
   escribieron sin poder consultarlos; un resultado cuya consola no coincide con ninguno nunca se usa. Probado
   solo con respuestas grabadas.
3. **A mano**: la persona sube una imagen (PNG, JPEG o WEBP, hasta 4 MB). El servidor nunca baja direcciones que
   le manden.

### Seguridad

- Un solo camino a la red (`server/covers/net.ts`): solo `https`, solo `thumbnails.libretro.com`, `id.twitch.tv`,
  `api.igdb.com` e `images.igdb.com`, sin seguir redirecciones (una es error), 10 s por petición (30 s un
  listado), tope de bytes contado al leer (4 MB una imagen, 6 MB un listado). `User-Agent` genérico. Los errores
  nunca dicen la dirección. El secreto de Twitch va en el **cuerpo** del POST (`x-www-form-urlencoded`), nunca en
  la dirección.
- Una cola por fuente, compartida por el botón de cada juego y la búsqueda de todas: a lo más 1 petición por
  segundo.
- El tipo de imagen se comprueba por sus primeros bytes, nunca por el nombre, y su **tamaño en pixeles por la
  cabecera** (PNG IHDR, JPEG SOF, WebP VP8/VP8L/VP8X) antes de que nada la decodifique: más de 8192 px de lado o de
  24 millones de pixeles se rechaza (subidas, descargas y candidatas). La página además la dibuja ya reducida
  (1200 px como mucho) antes de pixelarla.
- Las rutas de imagen responden con `Content-Security-Policy: default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: same-origin` y `X-Content-Type-Options: nosniff`. La subida manda la llave de la
  oficina en `Authorization: Bearer`, no en la dirección. Dos peticiones a la misma miniatura comparten una sola
  descarga.
- Una portada nueva se escribe aparte, luego se guarda `coleccion.json` y **solo entonces** se borra la anterior: si
  el archivo no se puede escribir, el juego se queda con su portada y su imagen de antes.

### Dónde quedan y cómo se sirven

Las imágenes, solo en la máquina de la persona: `~/.pixel-agents/coleccion/portadas/<id del juego>.<png|jpg|webp>`
(las miniaturas de «elige una», en `.candidatas/` hasta que se elige). Quitar la portada, mandar el juego a la
papelera o borrarlo borra su imagen. **Al arrancar** se vacía `.candidatas/` y se borran las imágenes de juegos que
ya no están en la colección (y escrituras a medias `.tmp`), solo si `coleccion.json` existe y se leyó entero; nunca
se toca `.listados/`. Rutas (con la llave de la oficina, `?token=` o `Authorization: Bearer`):

| Método | Ruta                                | Qué                                                                                                                   |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/coleccion/portada/<id>`       | La portada (solo un id de juego, nunca un nombre de archivo). Añade `&v=<coverArt.at>` para no ver la vieja de caché. |
| GET    | `/api/coleccion/candidata/<id>/<n>` | Miniatura `n` (0 a 3) de la última búsqueda «elige una».                                                              |
| POST   | `/api/coleccion/portada/<id>`       | Subir una imagen: el cuerpo es la imagen (`image/png`, `image/jpeg`, `image/webp` u `application/octet-stream`).      |

Mensajes (`core/asyncapi.yaml`, solo clientes con la llave): `coleccionCoverFind {id}`,
`coleccionCoverRun {action: start|stop}`, `coleccionCoverPick {requestId, id, n, stamp}`,
`coleccionCoverDismiss {requestId, id, stamp}` («Ninguna», o «Dejar la que tiene» si ya tiene portada),
`coleccionCoverRemove {requestId, id}`, `coleccionIgdbKey {requestId, clientId, clientSecret}`,
`coleccionIgdbKeyRemove {requestId}`. `coleccionStatus` trae además `igdbKey`, `covers` (la última búsqueda de cada
juego desde que arrancó la oficina) y `coverRun` (avance y resumen).

## Caja o suelto

`condition` vacío se dibuja con el de fábrica de su consola (`defaultCondition` en `core/cover.ts`): **suelto** para
los cartuchos anteriores al DS (Atari a GBA, Virtual Boy, N64, Neo Geo Pocket, Jaguar, 32X…) y **completo** (con
caja) para las portátiles de DS en adelante y todas las consolas de disco. `shownCondition(juego)` da el que se
dibuja; el archivo no cambia (vacío sigue vacío). `coleccionSetCondition {requestId, ids, condition}` cambia varios
juegos a la vez en una sola escritura (los «se busca» no se tocan).

## Cómo se ven

- **En la repisa**, cada juego es la pieza que tienes (`webview/pieces.ts`): con caja (`completo`, `sellado` o el de
  fábrica de su consola), la **caja de frente** con su portada en pixel art y el plástico de su consola alrededor
  (el sellado con su brillito); sin portada, la caja de un juego de disco se ve por el lomo como siempre y la de
  un cartucho, de frente con su escena dibujada. **Suelto**: el cartucho o la tarjeta con la forma de su consola
  (NES, SNES, N64, Game Boy y Color, GBA, Genesis y 32X, Master System, Atari, Virtual Boy, DS, 3DS con su
  pestaña, Switch, y uno genérico para el resto), con la etiqueta recortada de la portada (la parte de arriba, donde
  suele estar el logo); o el disco solo. Los dibuja `webview/art.ts`, por código.
- **El pixel art** (`core/pixelate.ts`, sin DOM): la portada se recorta a la forma de la caja, se reduce tomando un
  pixel por bloque (vecino más cercano) y se deja en pocos colores (median cut). Se hace una vez por juego y
  portada (cambia con `coverArt.at`), así la repisa no parpadea mientras «Buscar las que faltan» manda la colección
  una y otra vez. Una caja de DVD mide 40 pixeles de ancho con 32 colores y cada pixel se ve de 2×2: con 24 o 32
  pixeles la portada se volvía ruido; con 40 todavía se lee el logo y la figura. La etiqueta de un cartucho (de 7 a
  14 pixeles) promedia cada bloque en vez de tomar uno, por la misma razón.
- **Para comparar** otras medidas, se abre la oficina con `?portadas=<ancho>x<colores>` en la dirección (por
  ejemplo `?portadas=24x8`, `?portadas=40x32`; una `m` al final promedia cada bloque en vez de tomar un pixel:
  `?portadas=32x16m`). Ancho de 12 a 64, de 2 a 64 colores. El tamaño en pantalla casi no cambia: cambia el
  tamaño del pixel (24 → 4×4, 32 → 3×3, 40 → 2×2).
- **En la ficha**, la portada completa y nítida (la imagen original), con su fuente y fecha en letra chica, y el
  disco o cartucho en la esquina. «Con caja / Suelto» se cambia con un clic (dice cuando es solo el de fábrica);
  cada repisa tiene «Todos con caja / Todos sueltos» (pide confirmar). Solo cuenta y escribe los que se verían
  distinto (uno de NES sin estado ya es suelto de fábrica), y «Todos sueltos» no saca a los sellados de su caja: los
  salta y lo dice.
- **Sin portada**, la etiqueta de un cartucho o tarjeta es una etiqueta clara del color del juego, con una barra de
  título y una marca (nunca el fondo oscuro de la escena grande).
- **Al abrir el panel** solo bajan y se pixelan las piezas cerca de lo que se ve (un margen de 400 px), de dos en
  dos, y se guarda solo el resultado pixelado (como mucho 400). Una portada que no bajó se reintenta unas veces
  (3 s, 15 s, 1 min).
- **«Portadas»** (arriba): «Buscar las que faltan», su avance con «Detener» y el resumen por motivo (con un botón a
  la siguiente por elegir), y la llave de IGDB. Sobre las repisas, la cajita del avance se hace chica a una línea
  (▾) en cualquier momento, y la lista deja espacio abajo para llegar a lo que tapa.

## Dónde vive cada cosa

```
features/coleccion/
  core/        TypeScript puro, sin la oficina: formato del archivo, consolas, repisas, buscador, «¿Qué jugamos hoy?»
  server/      La oficina: el archivo coleccion.json, los mensajes y las rutas de portadas
    covers/    Portadas: red segura y cola, libretro, IGDB, archivos de imagen, búsqueda y «buscar las que faltan»
  webview/     El panel (repisas, estuche, cartel de «se busca», formulario, «¿Qué jugamos hoy?») y su store
  arte/        El estante dibujado por código (armar.py) y el script que lo pone en un plano (poner.cjs)
  assets/      COLECCION_SHELF (2×2)
  test/        Pruebas del núcleo, del servidor y del panel
```

`core/` no importa nada de Node ni de la oficina, para poder usarlo en una página de teléfono o una app.

## El mueble

`COLECCION_SHELF` (2×2, la fila de arriba es fondo) se dibuja con `python features/coleccion/arte/armar.py`: un
estante de madera con lomos de cajas de colores, cartuchos y un control encima. Para ponerlo en un plano:
`node features/coleccion/arte/poner.cjs [plano.json] [--piso <id>] [--en <col>,<fila>]`. Sin `--en` lo pone a la
derecha de la tele del cuarto Becarios (planta baja) y, si ahí no cabe, en el primer lugar libre que no corte el
paso. No lo duplica si ya está y no toca la carpeta real de la persona sin `--real`.

## Lo que sigue (etapa 2, no está)

Autocompletar desde una base de juegos, código de barras con el celular, importar listas, logros y búsqueda
automática de precios.

## Pruebas

```bash
npm run test:server -- coleccion
npm run test:webview
```
