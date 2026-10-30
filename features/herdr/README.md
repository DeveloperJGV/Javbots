# Nombres de pestaña de herdr

Cada personaje lleva el **nombre de su pestaña de [herdr](https://herdr.dev)** (por ejemplo, "MI-JUEGO-2") en vez del
nombre de la carpeta. Así se distinguen dos agentes que trabajan en la misma carpeta. Se usa en el letrero del
personaje, en el de sus becarios ("Becario de MI-JUEGO-2") y en el pizarrón de actividad. Un agente que no está en
herdr se queda con el nombre de la carpeta.

## De dónde salen los datos

- **El hook** (`claude-hook.js`) corre dentro de la sesión de Claude, así que ve `HERDR_PANE_ID`, que herdr le pone a
  cada panel. Lo agrega a cada evento como `herdr_pane_id`. Es la fuente buena: dice en qué panel está la sesión
  **actual**.
- **Mientras no llegue un hook** (por ejemplo, justo después de reiniciar la oficina), se usa la sesión que herdr
  recuerda para cada panel (`agent_session` en `herdr pane list`). Esa puede ser vieja (herdr guarda la primera sesión
  del panel), así que solo sirve cuando coincide.
- **El nombre**: el servidor corre `herdr pane list` y `herdr tab list` cada 5 s mientras hay una página abierta. Si
  renombras la pestaña, el personaje cambia en unos segundos.

## Notas

- Sin herdr (o con herdr cerrado) no manda nada y la oficina se queda con los últimos nombres que conoció.
- Busca `herdr` en el PATH, luego en `HERDR_BIN_PATH`, en la instalación de Windows
  (`~/.herdr/packages/standalone/releases/<versión>/herdr.exe`, la más nueva primero) y en las rutas de Homebrew: la
  consola de la oficina no trae el PATH de herdr.
- Solo páginas con la clave (`privileged`), como las demás conexiones.
- Solo la oficina del navegador (`server/src/cli.ts`); la extensión de VS Code no lo carga.
- La carpeta sigue siendo la que decide el área y el asiento: el nombre de la pestaña solo cambia lo que se lee.
