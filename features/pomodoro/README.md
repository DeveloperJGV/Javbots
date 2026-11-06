# Pomodoro de la azotea (feature opcional)

El rincón de descanso del **Roof garden** (features/jardin) tiene un reloj de jitomate en la pared, el letrero de
**DESCANSO**, un reloj de arena grande, tapete, agua y pesas. Con esta feature el reloj funciona:

- **Un clic en el jitomate** (`POMODORO_TIMER_WALL`, también el de mesa `POMODORO_TIMER`) **o en un reloj de arena**
  abre el panel: **Enfoque 25 min**, **Descanso 5 min**, **Descanso largo 15 min**, **Pausar** / **Seguir**,
  **Parar** y cuántos pomodoros llevas hoy. El botón resaltado es el que toca: enfoque, o el descanso que sigue a un
  enfoque terminado (el largo después de 4).
- **El tiempo lo lleva el servidor**, no la página: al terminar un bloque manda un aviso de escritorio (Mac o Windows)
  ("Terminó tu pomodoro: toma 5 minutos", "Se acabó el descanso: ¿otro pomodoro?") aunque la página esté cerrada. Nunca
  empieza el siguiente bloque solo. **Parar** no cuenta el bloque.
- **Sobrevive a un reinicio**: el bloque que corría sigue; uno que terminó con la oficina cerrada cuenta al arrancar
  (y avisa solo si terminó hace menos de 5 minutos).
- **El rincón sigue al reloj**: el jitomate de pared cuenta hacia atrás MM:SS (minutos arriba, segundos abajo) mientras
  hay un bloque, y marca la hora cuando no; el letrero de DESCANSO solo se prende en los descansos
  (`POMODORO_BREAK_SIGN_OFF` el resto del tiempo); un grano de arena cae por el cuello del reloj de arena grande
  mientras corre un enfoque; la lámpara de enfoque (`POMODORO_FOCUS_LAMP_OFF`, si la pones) se prende en el enfoque.
- El conteo es del día local: a medianoche vuelve a cero, y también la cuenta hacia el descanso largo.
- **No depende de la azotea**: las piezas se reconocen por su tipo, así que funcionan en cualquier oficina o piso
  donde se pongan (con el editor). El temporizador es uno solo, compartido por todas las oficinas.

## Archivos

- `server/pomodoroFeature.ts`: el `ServerFeature` (mensajes, el temporizador, el aviso de escritorio, `server/src/notifyDesktop.ts`).
- `server/pomodoroData.ts`: `~/.pixel-agents/pomodoro.json` (600, escritura atómica): el bloque (`endsAt` si corre,
  `remainingMs` si está en pausa), los pomodoros del día y la racha hacia el descanso largo.
- `server/constants.ts`: duraciones (25 / 5 / 15 min) y cada cuántos va el largo (4).
- `webview/PomodoroPanel.tsx`, `webview/pomodoroStore.ts`, `webview/usePomodoro.ts`, `webview/pomodoroText.ts`.
- `webview/pomodoroFurniture.ts`: el reloj, el letrero, la lámpara y el reloj de arena (corre después del paso de
  relojes de `ambientFurniture.ts`, así pinta la cuenta encima de la hora).
- Protocolo (`core/asyncapi.yaml`): `pomodoroStatus` (servidor → página) y `startPomodoro`, `pausePomodoro`,
  `resumePomodoro`, `stopPomodoro` (página → servidor). Solo páginas con la clave (`?token=`), como el resto de la
  azotea.
- Pruebas: `test/server/pomodoro.test.ts`, `test/webview/pomodoro.test.ts`.

Los agentes no van a hacer yoga ni pesas en los descansos: su tiempo libre es solo en la sala de descanso de la
planta baja, y la azotea es otro piso.
