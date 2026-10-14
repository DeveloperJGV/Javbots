# Música (feature opcional)

La oficina muestra lo que suena en **Spotify**: una columna a la derecha con la carátula, la canción, el
artista, el álbum y el tiempo; un **tocadiscos** en Becarios que gira y suelta notitas mientras suena, y un
**cuadro** arriba de él con la carátula en pixel art. Sin música, todo se queda quieto y la columna se quita.
**Un clic en el tocadiscos** esconde o muestra la columna (el navegador lo recuerda).

**Letras:** karaoke en la columna (línea anterior, la que se canta y la siguiente) y la línea actual en un globito
arriba del tocadiscos. La extensión manda la letra de Spotify (la misma de la app, endpoint no oficial que puede
cambiar); si Spotify no tiene, o no contesta en 4 s, el servidor la busca en [LRCLIB](https://lrclib.net)
(comunitaria: se descartan las que traen casi nada). Solo se muestran; no se guardan. Mientras se buscan, Hunter y
Tango (los perros del autor) cruzan la columna corriendo; si no aparece, sale "No encontré la letra". La tira de los
perros se arma con `arte/perros.py`.

**Botones:** anterior, pausa/play y siguiente. Viajan por un WebSocket que la extensión mantiene abierto
(`/api/music/control`, con el token de música); solo los manda quien abrió la oficina con su token.

**Apagada sin Spicetify:** mientras nadie elija en Ajustes, la música se prende sola solo donde Spicetify está instalado.

Necesita [Spicetify](https://spicetify.app) (Spotify de escritorio con extensiones). Sin Spicetify, Javbots
funciona igual.

## Instalar

1. Instala Spicetify y abre la oficina.
2. **Ajustes → Mostrar música de Spotify → Instalar la extensión en Spotify.** Javbots copia
   `javbots-musica.js` a la carpeta de extensiones de Spicetify (con la dirección de la oficina y su token ya
   puestos), la activa y corre `spicetify apply` (Spotify se cierra y se vuelve a abrir).

A mano: copia `spicetify/javbots-musica.js`, llena `SERVER` y `TOKEN` (Ajustes → "Copiar el token"), ponla en
`<spicetify path userdata>/Extensions` y corre `spicetify config extensions javbots-musica.js` y `spicetify apply`.

## Cómo funciona

```
Spotify + Spicetify ── javbots-musica.js ──POST /api/music──▶ servidor ──musicNowPlaying──▶ página
                                         ──POST /api/music/lyrics──▶   ──musicLyrics────▶
                     (cambio de canción,       (token de música)   (baja la carátula   (columna, tocadiscos,
                      pausa, latido 15 s)                           de Spotify)          cuadro)
```

- **Privacidad:** todo se queda en tu computadora. La canción no se guarda en disco. El servidor solo descarga
  carátulas de los servidores de imágenes de Spotify.
- **Token:** `~/.pixel-agents/music.json` guarda un token solo para la música (no sirve para nada más) y si el
  feature está prendido. El token de la oficina cambia en cada arranque; este no, para que la extensión siga
  funcionando.
- Si pasan 90 s sin noticias de la extensión (Spotify cerrado), la canción desaparece.
- **Otros dispositivos (Echo, bocinas):** la extensión manda lo que el Spotify de escritorio sabe de la
  reproducción, incluido el nombre del dispositivo cuando no es la computadora. Solo funciona con el Spotify de
  escritorio abierto.

## Carpetas

| Carpeta             | Qué hay                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `server/`           | Ruta `/api/music`, token, carátulas, instalación en Spicetify (se conecta al servidor como `ServerFeature`) |
| `webview/`          | Columna, sección de Ajustes, estado, tocadiscos que gira, cuadro y notas                                    |
| `spicetify/`        | La extensión que corre dentro de Spotify                                                                    |
| `assets/furniture/` | Muebles `TURNTABLE` y `ALBUM_FRAME` (esbuild los copia a `dist/assets`)                                     |
| `arte/`             | Originales de PixelLab, `armar.py` (muebles) y `poner-en-plano.cjs` (los pone en un `layout.json`)          |
| `test/`             | Pruebas del servidor y de la página (corren con `npm test`)                                                 |

Puntos donde toca al resto del proyecto (todos chicos y marcados con `features/musica`): mensajes en
`core/asyncapi.yaml`, `features` en `server/src/httpServer.ts` + `cli.ts`, la columna en `App.tsx`, la sección
en `SettingsModal.tsx`, el tocadiscos y las notas en `officeState.ts`, el tipo de partícula `note`, el ancho en
"ver toda la oficina" y la configuración de compilación (`esbuild.js`, `tsconfig`, `vitest`, lint).
