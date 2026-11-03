# Conexiones

Un rack en el Sótano con un foco por cada servicio de fuera con el que habla la oficina: APIs web (Spotify, LRCLIB,
Google Calendar, Ticketmaster…) y programas locales (`gh`, `claude`, `herdr`). Un clic abre la lista agrupada por
la parte de la oficina que lo usa, con para qué sirve, cómo entra (OAuth, llave, el login del programa, sin llave),
su estado y cuándo se usó por última vez.

| Foco                | Estado | Quiere decir                          |
| ------------------- | ------ | ------------------------------------- |
| Verde               | `ok`   | Funciona                              |
| Amarillo (parpadea) | `warn` | Hay que atenderlo: por vencer o falló |
| Rojo                | `off`  | Falta la llave o conectar la cuenta   |
| Azul                | `idea` | Planeado, todavía sin código          |

Nunca muestra llaves ni tokens, solo si están puestos.

## Cómo se mantiene sola la lista

Cada feature del servidor reporta sus conexiones con el método opcional `connections()` de `ServerFeature`
(`server/src/serverFeature.ts`). Este feature las junta cada 30 s y manda `connectionsStatus` (en
`core/asyncapi.yaml`) a las páginas con token, solo cuando algo cambió. Una conexión nueva aparece en el tablero
con solo agregarla al `connections()` de su feature.

## Archivos

- `server/connectionsFeature.ts`: junta y manda la lista.
- `webview/rackFurniture.ts`: prende los focos del rack (en el orden en que llegan, hasta 12).
- `webview/ConnectionsPanel.tsx`: el panel del clic.
- `arte/armar.py`: dibuja `CONNECTIONS_RACK`; `arte/poner-en-plano.cjs` lo pone en el Sótano.
