# El dueño de la oficina

Un personaje que **no es un agente**: representa a quien tiene la oficina y anda por el piso que la página
muestra. No tiene escritorio, no entra a la fiesta, no sale en el pizarrón ni en los contadores, y no se guarda
con los asientos.

## Cómo se prende

Aparece solo si una carpeta de pixeles trae `assets/avatar/` con un `manifest.json` y su hoja de personaje
(los detalles están en [`docs/agregar-pixeles.md`](../../../../docs/agregar-pixeles.md), sección "El dueño de la
oficina"). Si la carpeta no está, o la hoja no carga, no hay dueño.

En Ajustes, **"Mi personaje en la oficina"** lo muestra u oculta. Al apagarlo se desvanece donde está; al
prenderlo vuelve a entrar.

## Cómo se comporta

- **Entra por el elevador:** aparece frente a la primera pieza cuyo tipo empieza con `ELEVATOR` (o, si no hay,
  en la loseta caminable más cercana a la esquina superior izquierda), con un desvanecido corto, y camina unas
  losetas hacia adentro.
- **Pasea y descansa:** camina por el piso y toma los mismos ratos libres que un agente que terminó su turno,
  sin quitarle el lugar a nadie.
- **Va al mueble que abres:** si un panel se abre justo después de un clic en la oficina, camina a la loseta libre
  más cercana a ese punto (de preferencia enfrente) y se queda mirándolo mientras haya un panel abierto. Al
  cerrarlo vuelve a pasear.
- **Sale al cambiar de piso u oficina:** camina aprisa al elevador, se desvanece y luego la página cambia. Si
  tarda, la página cambia de todos modos (pestaña oculta, por ejemplo). En esa página ya no vuelve a entrar.
- Al pasar el cursor sobre él se ve su nombre: el del perfil si existe, si no el del `manifest.json`, si no "Tú".
- **Entra y pasea donde se le ve:** al entrar y al pasear escoge losetas que no tape la placa del elevador ni queden
  fuera de la vista (si no hay ninguna así, cualquiera).

## Gestos (opcionales)

Si el `manifest.json` trae `emotes` (formato en [`docs/agregar-pixeles.md`](../../../../docs/agregar-pixeles.md)),
hace gestos con su propia hoja. Mientras dura uno se queda quieto y mira al frente; luego sigue con lo suyo.

| Gesto          | Cuándo                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `greet`        | Al terminar de entrar a un piso, y al darle clic a él (el clic no lo selecciona ni abre nada)    |
| `cheer`        | Un agente termina su turno y él está libre (paseando o parado), con un descanso entre uno y otro |
| `dance`        | Mientras baila la fiesta, donde esté parado (no cuenta como invitado)                            |
| `"idle": true` | Lleva un rato parado sin panel abierto: a veces uno al azar, sin repetir el anterior             |

Se corta si tiene que irse: cambio de piso, un panel que lo hace caminar, o el ajuste apagado. Sin gestos todo
queda como antes. La oficina no tiene un ajuste de "reducir movimiento"; si un día lo tiene, aquí se respeta.

## Para ajustar a ojo

Todas al final de `webview-ui/src/constants.ts`:

| Constante                                                            | Qué cambia                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `OWNER_EXIT_TYPE_PREFIXES`                                           | Tipos de pieza por donde entra y sale                                   |
| `OWNER_ENTER_MIN_TILES`, `OWNER_ENTER_MAX_TILES`                     | Cuánto camina hacia adentro al llegar                                   |
| `OWNER_FADE_SEC`                                                     | Duración del desvanecido                                                |
| `OWNER_PANEL_CLICK_WINDOW_SEC`                                       | Cuánto después de un clic un panel cuenta como abierto por ese clic     |
| `OWNER_FRONT_BIAS_PX`, `OWNER_VISIT_CANDIDATES`                      | Qué tanto prefiere pararse enfrente del mueble y cuántas losetas prueba |
| `OWNER_HURRY_MULT`, `OWNER_LEAVE_MAX_SEC`                            | Qué tan aprisa y cuánto tiempo camina al salir                          |
| `OWNER_LEAVE_FAILSAFE_MS`                                            | Cuánto espera la página como máximo antes de cambiar de piso            |
| `OWNER_CHEER_COOLDOWN_SEC`                                           | Descanso mínimo entre dos `cheer`                                       |
| `OWNER_IDLE_EMOTE_SEC`, `OWNER_IDLE_EMOTE_CHANCE`                    | Cuánto parado antes de un gesto `idle` y con qué probabilidad           |
| `OWNER_LABEL_FONT_PX`, `OWNER_LABEL_RAISE_PX`, `OWNER_DEFAULT_LABEL` | La etiqueta con su nombre                                               |

## Archivos

- `ownerPresence.ts`: toda la lógica (entrar, pasear, visitar, salir). La usa `OfficeState`, que lo mantiene fuera
  de `characters` y solo lo agrega a lo que se dibuja (`getCharacters()`).
- `ownerEmotes.ts`: los gestos (duración, cuadro que toca) y el cuadro que dibuja el renderer mientras hace uno.
- `ownerStore.ts`: la hoja, el nombre, los gestos y el ajuste; `ownerLabel()` da el nombre de la etiqueta.
- `panelPresence.ts`: cuenta los paneles abiertos (cada `ui/Modal` se cuenta solo).
- `wireOwner.ts`: hace que el cambio de piso espere a que salga (`setBeforeLeave` de `offices.ts`).
- `OwnerLabel.tsx`: la etiqueta con su nombre sobre la cabeza.
- Pruebas: `webview-ui/test/owner.test.ts` y `webview-ui/test/ownerEmotes.test.ts`.
