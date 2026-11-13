# Cómo agregar pixeles nuevos

Guía corta para meter muebles, personajes y mascotas a la oficina. Todo el arte es pixel art a escala
**1 cuadro = 16 × 16 px**, en PNG con transparencia.

Hay dos lugares donde puede vivir el arte:

| Dónde                                | Para qué                                                      | Cómo se carga                                                                        |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `webview-ui/public/assets/`          | Lo que trae el proyecto (todos lo ven)                        | Se copia a `dist/assets/` al compilar (`npm run compile`)                            |
| Una carpeta tuya, fuera del proyecto | Arte personal (tus mascotas, cuadros, fotos hechas pixel art) | **Ajustes → Agregar carpeta de pixeles**. Se guarda en `~/.pixel-agents/config.json` |

La carpeta externa usa la misma estructura que `webview-ui/public/assets/`:

```
mi-carpeta/
  assets/
    furniture/MI_MUEBLE/{manifest.json, MI_MUEBLE.png}
    pets/mi-perro/{manifest.json, pet.png}
    avatar/{manifest.json, avatar.png}
```

## Muebles

Cada mueble va en su propia carpeta con un PNG y un `manifest.json`:

```json
{
  "id": "MI_LAMPARA",
  "name": "Mi lámpara",
  "category": "decor",
  "type": "asset",
  "file": "MI_LAMPARA.png",
  "width": 16,
  "height": 32,
  "footprintW": 1,
  "footprintH": 1,
  "canPlaceOnWalls": false,
  "canPlaceOnSurfaces": false,
  "backgroundTiles": 1
}
```

- **`width` / `height`**: el tamaño del PNG. Un mueble puede ser más alto que su base: una lámpara de 16 × 32
  ocupa un solo cuadro de piso (`footprintW/H`) y sobresale hacia arriba.
- **`backgroundTiles`**: cuántas filas de arriba del mueble se pueden pisar o tapar con otros muebles (para lo alto).
- **`category`**: `desks`, `chairs`, `electronics`, `storage`, `decor`, `misc` o `wall` (pestaña "Pared").
- **`canPlaceOnWalls`**: cuadros, ventanas, relojes; solo se pueden poner en la pared.
- **`canPlaceOnSurfaces`**: cosas que van encima de una mesa (laptop, taza).
- **`isDesk: true`**: mesas sobre las que se pueden poner esas cosas.
- **Sillas** (`category: "chairs"`): cada cuadro de la silla se vuelve un asiento para los agentes. Si la silla trae
  `orientation` (`front`, `back`, `left`, `right`), el agente se sienta mirando hacia ese lado.

Los grupos de **rotación** (frente/lado/atrás, tecla R) y de **estado** (prendido/apagado, tecla T) están explicados,
con ejemplos completos, en [external-assets.md](external-assets.md) (en inglés, del proyecto original). Para ver y
editar manifests sin escribirlos a mano está `scripts/asset-manager.html` (ábrelo en el navegador).

### Animaciones y luces de los muebles

Los muebles no se animan desde el manifest: se animan por código, según su `id`.

- **Animación** (`webview-ui/src/office/effects/ambientFurniture.ts`): agrega tu `id` a la tabla de efectos con
  uno de estos tipos: `cycle` (colores que giran, como los portales o la lluvia de Matrix), `pulse` (algo que
  parpadea), `sway` (plantas que se mecen) o `clock` (manecillas de reloj).
- **Luz de noche** (`webview-ui/src/office/effects/lighting.ts`, en `collectLights`): agrega tu `id` con su color,
  radio e intensidad. Los colores y medidas van en `webview-ui/src/constants.ts` (el lint no deja poner colores en
  otro lado).

## Personajes

Hay 21 hojas en `webview-ui/public/assets/characters/`: `char_0.png` a `char_5.png` son los **jefes** (los agentes),
`char_6.png` a `char_16.png` son los **becarios** de cada jefe y `char_17.png` a `char_20.png` son los **comodines**
(becarios que cualquier jefe manda cuando ya no tiene libres los suyos). El servidor carga las hojas seguidas desde
`char_0`: no dejes huecos en la numeración.

Cada hoja mide **192 × 132**:

- 3 filas de 44 px: **abajo**, **arriba** y **derecha** (la izquierda es la derecha volteada).
- 8 cuadros de 24 px por fila: caminar ×4, teclear ×2, leer ×2.
- Los pies van abajo y centrados en su cuadro; el personaje debe dejar aire arriba para que quepa el globo.

Qué becarios manda cada jefe está en `BOSS_INTERNS` y los comodines en `WILDCARD_INTERNS` (los dos en
`webview-ui/src/constants.ts`); los que flotan en vez de caminar, en `FLOATING_CHARACTERS`. Para cambiar un personaje,
reemplaza su PNG con uno del mismo tamaño y recompila.

> Las hojas de personajes de una carpeta externa se agregan después de las 21 del proyecto y hoy ningún jefe las
> usa: para cambiar personajes hay que reemplazar los del proyecto.

## Mascotas

Las mascotas solo se cargan desde una carpeta (el proyecto no trae ninguna). Cada una va en
`assets/pets/<nombre>/` con dos archivos:

```json
{ "id": "mi-perro", "name": "Firulais", "lightColor": "#8fd3ff" }
```

- **`lightColor`** (opcional): el color de la lucecita que la sigue de noche, en `#rrggbb`. Sin él, la luz es cálida.
- **`pet.png`** mide **96 × 96**:

| Fila (32 px de alto) | Qué va                                                                         |
| -------------------- | ------------------------------------------------------------------------------ |
| 1                    | Caminando hacia abajo (3 cuadros de 16 px) y quieta mirando abajo (3 de 16 px) |
| 2                    | Lo mismo mirando hacia arriba                                                  |
| 3                    | Caminando a la derecha (3 cuadros de 32 px; la izquierda se voltea sola)       |

Las mascotas se ordenan por el nombre de su carpeta. Para ponerlas en la oficina, colócalas con el editor.

## El dueño de la oficina (`avatar/`)

Es opcional: un personaje que pasea por la oficina y **no es un agente** (no ocupa escritorio ni cuenta como
agente). Va en `<carpeta de pixeles>/assets/avatar/` con un `manifest.json` y su hoja:

```json
{ "sheet": "avatar.png", "name": "La jefa" }
```

- **`sheet`** (opcional, por defecto `avatar.png`): el nombre del PNG dentro de la misma carpeta, sin subcarpetas.
- **`name`** (opcional): el nombre que se muestra (se recortan los espacios y se corta si es muy largo).
- La hoja mide **192 × 132**, igual que la de un personaje: 8 cuadros de 24 × 44 por fila, en 3 filas (**frente**,
  **espaldas** y **lado derecho**; la izquierda es el lado volteado). En cada fila: caminar ×4, teclear ×2, leer ×2.
- Si varias carpetas traen uno, **gana la última** de la lista (una carpeta tuya pisa al del proyecto). Si la hoja
  no es válida, no aparece y la oficina sigue igual.
- Aparece en el piso que la página está mostrando. Se apaga en **Ajustes**.

### Gestos del dueño (`emotes`, opcional)

Animaciones cortas en una hoja aparte. Se agregan al mismo `manifest.json`:

```json
{
  "sheet": "avatar.png",
  "emotes": {
    "sheet": "emotes.png",
    "cellW": 32,
    "cellH": 48,
    "list": [
      { "id": "greet", "row": 0, "frames": 8, "fps": 8, "loops": 1 },
      { "id": "dance", "row": 1, "frames": 8, "fps": 8, "loops": 3, "idle": true },
      { "id": "cheer", "row": 2, "frames": 8, "fps": 10, "loops": 1 },
      { "id": "drink", "row": 3, "frames": 8, "fps": 6, "loops": 1, "idle": true }
    ]
  }
}
```

- **La hoja** (`sheet`, por defecto `emotes.png`) es una rejilla: **una fila por gesto**, con sus cuadros de
  `cellW` × `cellH` desde la izquierda. Las filas pueden tener distinto número de cuadros; la hoja mide `cellW` × el
  mayor número de cuadros por `cellH` × el número de filas.
- **La celda** (por defecto 32 × 48) se dibuja con **su centro de abajo sobre el centro de abajo** del cuadro normal
  de 24 × 44: con 32 × 48 es el cuadro normal con 4 px de margen a cada lado y 4 arriba. Los gestos miran al frente.
- Por gesto: `id`, `row` (su fila, desde 0), `frames` (1 a 16), `fps` (1 a 30, por defecto 8), `loops` (veces que se
  repite, 1 a 10, por defecto 1) e `idle` (si `true`, lo hace de vez en cuando mientras está parado).
- **Cuándo los hace:** `greet` al terminar de entrar a un piso y cuando le das clic a él; `cheer` cuando un agente
  termina su turno y él está libre (con un descanso de unos 20 s entre uno y otro); `dance` mientras dura la fiesta;
  y los que traen `"idle": true` (con cualquier `id`), de vez en cuando cuando lleva un rato parado sin un panel
  abierto, sin repetir el mismo dos veces seguidas. Mientras dura un gesto no camina; si tiene que irse (cambio de
  piso, se abre un panel, se apaga en Ajustes) lo corta.
- Todo es opcional: sin `emotes`, o sin alguno de los gestos, no pasa nada. Si el bloque está mal (tamaños fuera de
  rango, una fila fuera de la hoja, ids repetidos, la hoja no existe…), el dueño carga **sin gestos** y el servidor
  lo avisa en su registro.

## Ponerlo en la oficina

1. Abre la oficina y entra a **Oficina** (el editor). Tu mueble aparece en su pestaña.
2. Colócalo (R gira, T prende/apaga) y guarda. Se guarda en `~/.pixel-agents/layout.json`.
3. **Cuartos por tarea:** con la herramienta de áreas pintas el cuarto y le escoges su zona (Código, Biblioteca,
   Comandos, Internet, Pruebas, Commit, Permiso, Becarios o Error). Los agentes caminan al cuarto de lo que están
   haciendo.

El plano que trae el proyecto se genera con un script; si lo cambias, vuelve a generarlo en lugar de editar el
JSON a mano:

```bash
node arte/provisionales/oficina.cjs webview-ui/public/assets/default-layout-1.json
```

## Cómo se hizo el arte de esta versión

El arte nuevo se generó con [PixelLab](https://www.pixellab.ai) y se ajustó a mano con scripts de Python
(necesitan `pip install pillow`), uno por cuarto en `arte/pixellab/<cuarto>/armar.py`:

- `arte/pixellab/ver.py`: baja un resultado de PixelLab y hace una vista ampliada para revisarlo.
- `arte/pixellab/muebles.py`: `guardar(...)` escribe el PNG y el `manifest.json` de un mueble y revisa que el
  tamaño cuadre con su base.
- `arte/pixellab/integrar.py <cuarto>`: aplica el `plano.json` de un cuarto (qué muebles se quitan, ponen o mueven)
  al plano de la oficina.
- `arte/pixellab/personajes/armar.py`: arma las hojas de personajes de 24 × 44.

Consejos que funcionaron:

- Genera directo al tamaño final y recorta; escalar después emborrona los pixeles.
- Revisa siempre la vista ampliada antes de meterlo: PixelLab a veces deja manchas o pixeles sueltos.
- Si un mueble es arte personal (fotos tuyas, tus mascotas), ponlo en tu carpeta externa, no en el proyecto.
