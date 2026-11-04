# Jardín de la azotea (feature opcional)

Un piso de **azotea** que siempre va hasta arriba del edificio principal (botón **R** del elevador, "Roof garden"), con un jardín.
Un clic en la **pantalla de control**, el **cobertizo**, el **tablero de herramientas** o la **placa de planta** abre
el panel del jardín:

- **Hoy en el jardín:** los cuidados de hoy y los atrasados, con el botón **Hecho**, y lo que viene en la semana.
- **Plantas:** nombre, especie, lugar, fotos, notas y sus cuidados (regar, abonar, limpiar, podar), cada uno
  "cada N días" y con la hora de su aviso. **El siguiente cuidado se calcula desde la última vez que de verdad se
  hizo**, no con un ritmo fijo.
- **Inventario:** plantas, herramientas, tierra, abono y macetas, con cantidad, unidad y mínimo.
- **Del celular:** lo que llegó por Drive y la oficina no entendió sola, para acomodarlo con un clic.
- **Conexión:** si falta el calendario, el permiso de Drive, la carpeta, etc., y cómo arreglarlo.

Antes de guardar algo que va a Google, el panel enseña qué se va a crear y pide confirmar ("¿Lo agrego así?").

Si una planta dice cuál es su mueble (su tipo, por ejemplo `JARDIN_MONSTERA`), ese mueble **se ve sediento** (más
gris y un poco caído) mientras su riego esté atrasado, y un clic en él abre el panel con esa planta primero
(`webview/jardinFurniture.ts`, sirve para cualquier dibujo de planta).

## Avisos en Google

Usa la sesión de Google de la oficina ([features/google](../google/README.md)): permisos de **Calendar**, **Tasks** y
**leer Drive**.

- **Calendario "Plantas"** (lo creas tú): un evento por cuidado pendiente, a su hora y con aviso, por ejemplo
  `Jardín: regar Monstera`. **La oficina nunca crea calendarios**: si no existe, el panel dice cómo crearlo y,
  mientras, los avisos solo van a Tasks.
- **Google Tasks, lista "Jardín"** (la oficina la crea si falta): una tarea por cuidado pendiente, para palomearla
  desde el celular.

La oficina los mantiene de acuerdo cada 5 minutos (y al arrancar se pone al día):

- **Palomeaste la tarea:** el cuidado queda hecho ese día; se quita el evento y se agendan el siguiente evento y la
  siguiente tarea.
- **Pasó el día y no se hizo:** el evento y la tarea se recorren al día siguiente, hasta que se haga.
- **Hecho en el panel:** igual que palomear (la tarea queda palomeada).
- **Falta algo del inventario** (cantidad debajo del mínimo): una tarea "Comprar tierra" en la lista, una sola vez;
  cuando la cantidad vuelve a alcanzar, la oficina la palomea.

Guarda los ids de lo que crea para no duplicar, y marca sus eventos (propiedad privada `javbotsJardin`) y sus tareas
(al final de la nota) para encontrarlos si se perdieran. **Nunca toca eventos ni tareas que no creó.** De Drive solo
lee: nunca escribe, mueve ni borra.

### Por qué `drive.readonly`

`drive.file` solo deja ver los archivos que creó esta misma app (o que abriste con ella). Las notas y las fotos las
crea otra app (el Claude del celular o la app de Drive), así que con `drive.file` la oficina no las vería. El mínimo
que sirve es **`drive.readonly`**: ver (no cambiar) los archivos de tu Drive. La oficina solo abre la carpeta del
jardín. Al cambiar los permisos hay que **volver a conectar Google** y aceptar el de Drive; en Google Cloud activa
también la **Google Drive API**.

## Del celular a la oficina (instrucción para el Claude del celular)

Copia esto en las instrucciones del Claude del celular:

> Para el jardín usa la carpeta **"Jardín"** de mi Google Drive (en Mi unidad, con ese nombre exacto). Nunca
> borres ni cambies archivos que ya estén ahí: la oficina lee cada archivo nuevo una sola vez.
>
> - **Notas:** un archivo de texto (`.txt`) o un documento de Google por nota, con nombre `AAAA-MM-DD nota.txt`.
>   Una cosa por renglón, con el nombre de la planta tal como está en el jardín y el verbo en pasado:
>   - `ya regué la monstera` · `ayer aboné el limonero` · `limpié las hojas de la orquídea` · `podé la lavanda`
>   - Varias plantas con el mismo cuidado: `regué la monstera y la lavanda`.
>   - Planta nueva: `nueva planta: lavanda (Lavandula angustifolia), en la maceta azul; regar cada 3 días; podar cada 60 días`
>     (la especie entre paréntesis y la hora del aviso, `a las 7:30`, son opcionales).
>   - No escribas dudas ni planes ("¿ya toca regar?", "mañana riego"): eso no cuenta como hecho.
> - **Fotos:** con el nombre de la planta en el nombre del archivo: `monstera 2026-11-03.jpg`. Una planta por foto.

Lo claro se aplica solo ("ya regué la monstera" marca el riego de ese día). Lo que no se entienda, una foto sin
planta o una planta nueva, queda en **Del celular**, en el panel, para acomodarlo con un clic. Las fotos se copian a
`~/.pixel-agents/jardin/fotos/` y se ligan a su planta. **No hay IA en el servidor**: son reglas simples (nombre de
planta + verbo).

## Desde la compu

`~/.pixel-agents/jardin/entrada/` funciona igual que la carpeta de Drive (mismas notas y fotos): la oficina las lee y
las mueve a `entrada/leidos/`. La skill (`skill/SKILL.md`) escribe ahí.

## Archivos y ajustes

Todo es personal y vive en tu computadora, fuera de git:

| Archivo                           | Qué hay                                                               |
| --------------------------------- | --------------------------------------------------------------------- |
| `~/.pixel-agents/jardin.json`     | Plantas, inventario, bandeja, ids de lo que la oficina creó en Google |
| `~/.pixel-agents/jardin/fotos/`   | Las fotos (solo las ve una página abierta con el token de la oficina) |
| `~/.pixel-agents/jardin/entrada/` | Notas y fotos dejadas en la compu                                     |

Los nombres se cambian en `jardin.json`, en `"ajustes"` (si falta, los de abajo):

```json
{
  "ajustes": {
    "calendario": "Plantas",
    "listaDeTareas": "Jardín",
    "carpetaDrive": "Jardín",
    "prefijo": "Jardín:",
    "horaPorDefecto": "09:00"
  }
}
```

## Carpetas

| Carpeta    | Qué hay                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/`  | `jardinFeature.ts` (panel, Drive, entrada, piso), `jardinSync.ts` (eventos y tareas), `jardinGoogle.ts`, `jardinNotes.ts` (reglas de las notas), `jardinData.ts` |
| `webview/` | `JardinPanel.tsx`, `jardinText.ts`, `jardinFurniture.ts` (plantas sedientas), `jardinStore.ts`                                                                   |
| `arte/`    | `plano.cjs` arma el plano de la azotea                                                                                                                           |
| `planos/`  | `azotea.json`: el plano por defecto del piso                                                                                                                     |
| `skill/`   | La skill del jardín                                                                                                                                              |
| `test/`    | Pruebas del servidor (con un doble de Google: Calendar, Tasks y Drive, sin red) y de la página                                                                   |

Toca al resto del proyecto en: el piso de azotea (`roof` en `core/src/offices.ts` y `server/src/officeRegistry.ts`),
mensajes en `core/asyncapi.yaml` (`jardinStatus` y los que empiezan con `Jardin`), el registro en `server/src/cli.ts`,
el permiso de Drive en `features/google`, el clic en los muebles (`officeState.ts`, `OfficeCanvas.tsx`) y el panel en
`App.tsx`.
