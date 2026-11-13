# Decks: cajas de deck de Yu-Gi-Oh!

Una repisa con cajas de deck en la oficina. Al abrirla, los decks salen en una fila de cajas en diagonal: la
escogida pasa al frente y enseña su portada, y el fondo toma su color. Se abre una caja para ver la lista.

Es una función normal de la oficina: reglas y código, sin cuentas ni servicios de pago.

## Qué hace

- **Fila de cajas:** se recorre arrastrando, con la rueda, con las flechas o con la regla de abajo. «Escoge uno»
  recorre la fila y cae en uno al azar. Sigue fluida con cientos de decks (solo se dibujan las cajas cercanas).
- **Caja abierta:** Main, Extra y Side, la lista por grupos (monstruos, magias, trampas, extra, side) con imagen
  chica y ×N, y un clic enseña la carta en grande con su texto. Arriba, los **avisos de reglas**: Main 40-60, Extra y
  Side hasta 15, máximo 3 copias, prohibidas y limitadas. Son avisos: no impiden guardar.
- **Nuevo y editar:** nombre, dueño, color de la caja y carta de portada. Las cartas se agregan por **nombre con
  autocompletar** (la base está en inglés) o por **código de 8 dígitos** (el número impreso en la carta, igual en
  todos los idiomas). Cantidad con + y −, y se pasan entre Main, Extra y Side.
- **Importar y exportar:** `.ydk` (EDOPro, YGOPRODeck), `ydke://` y listas de texto (`3 Dark Magician`,
  `2x 89631139`, con encabezados `Main` / `Extra` / `Side`). Antes de guardar se ve el borrador con lo que no se
  encontró.
- **Borrar** en dos pasos. El deck va a `.borrados/` dentro de la carpeta de decks, no se pierde.

Se abre con un clic en la repisa o con `#decks` al final de la dirección de la oficina.

## Dónde viven los datos

- **Decks:** un archivo `<id>.json` por deck. De fábrica en `~/.pixel-agents/decks/`; otra carpeta se configura en
  `~/.pixel-agents/decks.json`:

  ```json
  { "folder": "D:\\mis-decks" }
  ```

  La oficina ve sola los cambios hechos por fuera (otro programa o a mano).

- **Caché de cartas:** `~/.pixel-agents/decks-cache/` (`cards.json` y las imágenes en `img/`). Se puede borrar sin
  perder decks: se vuelve a bajar.

Formato de un deck:

```json
{
  "version": 1,
  "id": "k3x9q2",
  "name": "Dragones",
  "owner": "Ana",
  "createdAt": "2026-11-13",
  "updatedAt": "2026-11-13T20:15:00.000Z",
  "cover": 89631139,
  "box": { "color": "#7a1f2b" },
  "notes": "",
  "main": [89631139, 89631139, 46986414],
  "extra": [],
  "side": []
}
```

Los códigos son los de 8 dígitos; un código repetido es una copia más. `cover` en 0 = sin portada (usa la primera
carta). Al leer, lo que falte toma su valor de fábrica; al guardar se conservan los campos desconocidos.

## Datos de cartas: YGOPRODeck

Fuente: <https://ygoprodeck.com/api-guide/> (pública, sin cuenta). Los textos y las imágenes son de Konami; este
repositorio no trae ninguno: se bajan a la máquina de quien usa la oficina.

- La base completa se baja **una vez** (unos 21 MB, unas 14 000 cartas), se guarda recortada (unos 7,5 MB) y se
  revisa cada 7 días si cambió. Las búsquedas son locales.
- Cada imagen se baja **una sola vez** y se guarda; la página la pide a la oficina, nunca a YGOPRODeck.
- Como mucho 10 peticiones por segundo y 2 a la vez (el tope del sitio es 20 por segundo).
- La base no tiene español: para cartas en español, el código de 8 dígitos.

Aparece en el rack de Conexiones.

## Para otras pantallas (teléfono, app)

Con la llave de la oficina (`?token=` o `Authorization: Bearer`):

| Ruta                                                | Respuesta                                         |
| --------------------------------------------------- | ------------------------------------------------- |
| `GET /api/decks`                                    | Lista: id, nombre, dueño, portada, color, conteos |
| `GET /api/decks/:id`                                | Deck, sus cartas y sus avisos de reglas           |
| `GET /api/decks/:id.ydk`                            | El deck en `.ydk`                                 |
| `GET /api/decks/img/:codigo?size=small\|full\|crop` | La imagen (de la caché)                           |

## Dónde vive cada cosa

```
features/decks/
  core/        TypeScript puro, sin la oficina: deck, .ydk, ydke://, listas de texto, grupos, avisos de reglas
  server/      La oficina: archivos de decks, base e imágenes de YGOPRODeck, mensajes y rutas
  webview/     El panel (fila, caja abierta, editor, importar) y su store
  arte/        La repisa dibujada por código (armar.py) y el script que la pone en un plano (poner.cjs)
  assets/      DECKS_SHELF (2×2) y DECKS_SHELF_ON
  test/        Pruebas sin red (doble de YGOPRODeck)
```

`core/` no importa nada de Node ni de la oficina, para poder usarlo en una página de teléfono o una app.

## El mueble

`DECKS_SHELF` (2×2, la fila de arriba es fondo) se dibuja con `python features/decks/arte/armar.py`. Viene en el
plano de fábrica de la planta baja, en el cuarto Becarios. Para ponerlo en un plano:
`node features/decks/arte/poner.cjs [plano.json] [--piso <id>] [--en <col>,<fila>]`. No lo duplica si ya está y no
toca la carpeta real de la persona sin `--real`.

## Pruebas

```bash
npm run test:server -- decks
npm run test:webview
```
