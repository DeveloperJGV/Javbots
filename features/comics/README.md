# Cómics y manga

Un estante para la colección de cómics y manga, hermano del librero (`features/libros`) y del estante de juegos
(`features/coleccion`). Aquí **la serie es la unidad**: un manga o un cómic con sus tomos (o números), y dentro, cuáles
están y cuáles faltan. Los que faltan son el «se busca» natural: se ven como huecos en la repisa.

Es una función normal de la oficina: reglas y código. Sale a internet solo para **AniList** (manga) y **Open
Library** (cómics y el ISBN de un tomo): el título de la serie, el primer autor o un ISBN.

## Qué hace

- **Repisas por tipo** (de fábrica): Manga, Cómic, Novela gráfica, y al final las series sin tipo. «Repisas por»
  cambia a **editorial** (la de aquí si se anotó, si no la original) o **género** (shōnen, seinen, superhéroes…).
  Dentro, las series por título, cada una como una fila de sus tomos **en orden**, todos del mismo color con su
  número abajo y la serie en una placa. Los que faltan son **huecos punteados** con su número; cuatro o más seguidos
  se juntan en uno ancho («13–27»). Los tomos ya leídos llevan una marquita verde. Una novela gráfica de un solo
  tomo es una serie de 1 y se ve como un lomo suelto. Los formatos cambian el lomo: grapa delgada, tomo, integral y
  de lujo anchos; el manga es más bajo que el cómic.
- **Tarjeta de la serie** (clic en un tomo o un hueco): portada, tipo, género, guion y dibujo, cuántos tiene
  («12 de 27 · faltan 15»), si la serie terminó, editorial original y de aquí, formato, año, idioma, «voy en» y qué
  se busca. Abajo, **todos los números**: en modo «Lo tengo» un clic pone o quita un tomo; en «Leí hasta» marca hasta
  dónde va la lectura. «+» agrega un tomo más a la serie (salió otro). Editar, Borrar (dos pasos).
- **Agregar rápido:** solo el título es obligatorio. Los tomos van **juntos**, nunca uno por uno: «Tengo 1-12, 15»
  de 27 (también «17 a 20»), y abajo dice lo que entendió («13 tomos: 1-12, 15»). Enter guarda y deja puesto tipo,
  formato, idioma, editoriales, género y de quién, para la siguiente serie.
- **«Buscar datos»** junto al título: para un manga (o sin tipo) pregunta a **AniList**; para un cómic o novela
  gráfica, a **Open Library**. Enseña hasta 4 resultados (título y el otro título, autores, año, tomos, si terminó,
  géneros) y solo con un clic los pasa a la ficha.
- **Buscador** por serie, autor (guion o dibujo) o editorial: un autor o una editorial se iluminan en todas las
  repisas; una serie se abre. **«Solo lo que falta»** ilumina los huecos.
- **Portadas** (una por serie), con las reglas de la colección: nunca una dudosa en silencio (abajo).

Teclado: `/` busca, `N` agrega, las flechas pasan de serie en serie, Enter abre, Esc regresa un paso. Se abre con un
clic en el estante o con `#comics` al final de la dirección. Solo la página con la llave de la oficina la ve.

## Dónde viven los datos

`~/.pixel-agents/comics.json`, con las garantías del librero (es una copia de su `libraryStore.ts` para series):
escritura atómica, papelera (100), campos desconocidos conservados, tope de 8 MB, archivo dañado apartado como
`comics.danado-<fecha>.json`. Como mucho 5000 series y 2000 tomos anotados por serie: guardar más **no se recorta en
silencio**, se rechaza y lo dice. La tarjeta pinta hasta 400 números (los demás, con «Tengo» al editar), y lo que
falta de cada serie se calcula una vez por cambio, no en cada dibujo.

```json
{
  "version": 1,
  "series": [
    {
      "id": "k3x9q2ab",
      "title": "Puerto Niebla",
      "writers": ["Rin Kaze"],
      "artists": [],
      "publisher": "Editorial Faro",
      "localPublisher": "Panel",
      "kind": "manga",
      "genre": "Seinen",
      "year": 2004,
      "language": "Español",
      "format": "tomo",
      "totalVolumes": 27,
      "finished": true,
      "readUpTo": 5,
      "owner": "",
      "notes": "",
      "volumes": [
        { "number": 1, "owned": true, "isbn": "", "addedAt": "2026-11-23", "price": "" },
        { "number": 13, "owned": false, "isbn": "", "addedAt": "", "price": "$129 MXN" }
      ],
      "addedAt": "2026-11-23",
      "updatedAt": "2026-11-23T20:15:00.000Z"
    }
  ],
  "trash": []
}
```

- `kind`: `manga`, `comic`, `novela-grafica`. `format`: `tomo`, `grapa`, `integral`, `lujo`.
- `totalVolumes`: cuántos tiene la serie (0 = no se sabe todavía); `finished`: ya terminó.
- `volumes`: solo los que dicen algo: los que están (`owned`, con el día que llegaron, que pone el guardado) y los que
  faltan con un precio visto o un ISBN. Los demás números entre 1 y el último simplemente **faltan**.
- `artists` vacío = las mismas personas escribieron y dibujaron.
- `coverArt` (solo el servidor): `{ "source": "anilist" | "openlibrary" | "subida", "key": "al:<id>" |
"isbn:<isbn>" | "id:<id>" | "", "at", "type" }`. Si cambia el título o el primer guionista, una portada de una
  fuente se quita; una subida a mano se queda.

## Fuentes: lo que probé de verdad (2026-11-23, pocas llamadas, espaciadas)

- **AniList** (`https://graphql.anilist.co`, GraphQL por POST, sin llave): manga, manhwa y manhua con título en
  inglés y romaji, autores por rol (guion / dibujo; los traductores no cuentan), tomos (a veces `null` mientras sigue
  saliendo), estado, año, géneros y portada. Contestó en menos de un segundo. Sus portadas vienen directo de
  `s4.anilist.co` (sin redirecciones). **No tiene cómics occidentales** («Watchmen»: nada). Es gratis para uso no
  comercial y pide no pasar de 90 peticiones por minuto: aquí va una por segundo como mucho.
- **Open Library** (la misma del librero, compartida): su búsqueda por título y autor sí encuentra cómics
  («Watchmen», Alan Moore: 8 resultados con portada), pero ese día tardó 22 s y cortó dos conexiones; la portada por
  el ISBN de un tomo de manga en inglés redirigió a archive.org (se sigue, revisada). La edición mexicana de un manga
  probablemente no esté: queda **subir a mano**.
- Fuentes descartadas sin llave: Google Books (cuota 0), y las bases de cómics que piden cuenta o llave (no las usé).

### Portadas

«Buscar portada» en la tarjeta y «Portadas → Buscar las que faltan»:

1. Si algún tomo tiene **ISBN** (el de número más bajo con un ISBN válido): la portada de esa edición en Open
   Library, que se pone sola.
2. Si no: **AniList** por título (manga o sin tipo) y **Open Library** por título y primer guionista (cómic o sin
   tipo) solo se **ofrecen**, hasta 4, y la persona escoge o dice «Ninguna».
3. **A mano:** subir o arrastrar una imagen (PNG, JPEG, WEBP, hasta 4 MB).

Seguridad: el mismo camino a la red de la colección (`features/coleccion/server/covers/net.ts`), con los hosts de
Open Library, `archive.org` y sus servidores, `graphql.anilist.co` y `s4.anilist.co`; una dirección de imagen que
AniList mande se usa solo si es de `s4.anilist.co` (patrón fijo en `core/lookup.ts`). Las imágenes se revisan por
cabecera, viven en `~/.pixel-agents/comics/portadas/<id>.<tipo>` y se sirven con la llave de la oficina. Igual que
en el librero, después de cada espera de la red se revisa que siga siendo la misma búsqueda y la misma serie (título,
primer guionista, ISBN de sus tomos, tipo); una portada subida mientras tanto nunca se reemplaza; una miniatura de una
búsqueda vieja no se guarda; si la imagen no se puede poner, queda la de antes; un aviso que falle no corta nada; y un
archivo leído solo en parte no borra portadas al arrancar.

| Método | Ruta                             | Qué                                             |
| ------ | -------------------------------- | ----------------------------------------------- |
| GET    | `/api/comics/portada/<id>`       | La portada de la serie (`&v=<coverArt.at>`).    |
| GET    | `/api/comics/candidata/<id>/<n>` | Miniatura `n` (0 a 3) de la última «elige una». |
| POST   | `/api/comics/portada/<id>`       | Subir una imagen.                               |

Mensajes (`core/asyncapi.yaml`, bloque «Comics and manga»): `comicsOpen`, `comicsSave {requestId, series}`,
`comicsDelete`, `comicsLookup {requestId, title, kind}` (contesta `comicsLookupResult`, nunca guarda),
`comicsCoverFind`, `comicsCoverRun`, `comicsCoverPick`, `comicsCoverDismiss`, `comicsCoverRemove`. `comicsStatus`
trae las series, `covers` y `coverRun` (con la forma de los del librero).

## Qué se comparte

Con el librero: el ISBN, la lectura de autores, la búsqueda y las portadas de Open Library (`createOpenLibrary`,
`pickCandidates`), la regla de «Buscar las que faltan» (`runSearches`, que ahora acepta cualquier tipo de portada),
los colores de lomo, los estilos del panel (`LIBROS_CSS`, clases `lib-`) y las ayudas de subida. Con la colección:
la red segura, la cola, los archivos de imagen, la limpieza de texto, los ids. Copiado (y anotado): el almacén del
archivo y el servicio de portadas, que en el librero están hechos para libros.

## Dónde vive cada cosa

```
features/comics/
  core/        TypeScript puro: series y tomos, «1-12, 15», repisas, buscador, qué contesta AniList
  server/      La oficina: comics.json, AniList, portadas y mensajes
  webview/     El panel (repisas de tomos, tarjeta de la serie, formulario, portadas)
  arte/        El estante dibujado por código (armar.py) y el script que lo pone en un plano (poner.cjs)
  assets/      COMICS_SHELF (2×2)
  test/        Pruebas del núcleo y servidor, y del panel
```

## El mueble

`COMICS_SHELF` (2×2) se dibuja con `python features/comics/arte/armar.py`: estante rojo de tienda de cómics con
series de manga en orden (y un hueco), un cómic de frente, grapas, integrales y un cómic abierto encima. Para ponerlo
en un plano: `node features/comics/arte/poner.cjs [plano.json] [--piso <id>] [--en <col>,<fila>]`; sin `--en` lo pone
en Becarios cerca del estante de juegos (32,26 del plano de fábrica) o en el primer lugar libre que no corte el paso.
No toca la carpeta real sin `--real`.

## Lo que sigue (no está)

Precio por tomo desde la tarjeta, portada por tomo, importar una lista, y avisar cuando sale un tomo nuevo de una
serie que sigue saliendo.

## Pruebas

```bash
npm run test:server -- comics
npm run test:webview -- comics
```
