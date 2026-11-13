# Música (feature opcional)

La oficina muestra lo que suena en **Spotify**: una columna a la derecha con la carátula, la canción, el
artista, el álbum y el tiempo; un **reproductor** en la sala de música que suelta notitas mientras suena, y un
**cuadro** en la pared con la carátula en pixel art. Sin música, todo se queda quieto y la columna se quita.

**Un clic en el reproductor** abre su menú: escoges cómo se ve (tocadiscos, que gira; rockola clásica, setentera o
digital, que muestra la carátula en su pantalla) y escondes o muestras la columna (el navegador lo recuerda).

**Letras:** karaoke en la columna (línea anterior, la que se canta y la siguiente) y la línea actual en un globito
arriba del reproductor del piso que estás viendo (una ♪ entre líneas y en las instrumentales, que LRCLIB marca así);
si el reproductor no se ve en pantalla, el globito se queda chico arriba al centro. Se apaga en Ajustes (lo recuerda
el navegador). Cada piso puede tener su propio reproductor: la Planta baja, el piso Personal y el Roof garden traen
uno. La extensión manda la letra de Spotify (la misma de la app, endpoint no oficial que puede
cambiar); si Spotify no tiene, o no contesta en 4 s, el servidor la busca en [LRCLIB](https://lrclib.net)
(comunitaria: se descartan las que traen casi nada). Solo se muestran; no se guardan. Mientras se buscan, Hunter y
Tango (los perros del autor) cruzan la columna corriendo; si no aparece, sale "No encontré la letra". La tira de los
perros se arma con `arte/perros.py`.

**Botones:** anterior, pausa/play y siguiente. Viajan por un WebSocket que la extensión mantiene abierto
(`/api/music/control`, con el token de música); solo los manda quien abrió la oficina con su token.
La extensión contesta cada orden por el mismo canal y la consola de la oficina lo anota (`[Musica] Spotify hizo
"next"`, o `Spotify no pudo "previous": <motivo de Spotify>`; si no contesta en 2.5 s, `no confirmó`: una
extensión instalada antes de este cambio). Los botones del panel no esperan esa respuesta; las otras pantallas sí
(ver abajo), y el último resultado sale en `lastControl` de `GET /api/music/now`.

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
  reproducción, incluido el nombre del dispositivo cuando no es la computadora. Con Spotify cerrado en la
  computadora, la oficina puede seguir viendo lo que suena si la conectas a tu cuenta (sección siguiente).

## Sin Spotify abierto en la computadora (opcional)

La oficina puede preguntarle directamente a tu cuenta de Spotify qué suena (en el celular, una bocina, otra
computadora…) con la API web de Spotify. Hace falta una app en el
[panel de desarrollador de Spotify](https://developer.spotify.com/dashboard) (gratis, con tu misma cuenta):

1. Crea la app (Web API) y en sus _Redirect URIs_ agrega `http://127.0.0.1:3100/api/music/spotify/callback`
   (con el puerto en que corre la oficina).
2. Pon su _Client ID_ en `~/.pixel-agents/music.json` y reinicia la oficina:

   ```json
   { "enabled": true, "token": "…", "spotifyClientId": "…" }
   ```

3. En Ajustes → Música, **Conectar con Spotify**: se abre la página de Spotify, aceptas y listo. La sesión queda
   en `music.json` (`spotifyRefreshToken`); **Desconectar de Spotify** la borra.

No hay _client secret_: el inicio de sesión usa PKCE, así que nada de la app queda expuesto. Mientras el Spotify de
la computadora esté abierto y sonando, la extensión sigue siendo la fuente (trae la letra de Spotify, el tempo y
avisa al instante); la cuenta se consulta cada 4 s solo cuando la extensión no reporta nada o reporta pausa, y si
en otro aparato sí suena algo, gana ese. La letra entonces viene de LRCLIB. Los botones de la música (también los
de otras pantallas) funcionan igual sin la extensión, a través de la API.

## Playlist del día (opcional, con la cuenta conectada)

Un clic en la **prensa de vinilos** de la sala de música (o en el neón "Hoy suena") abre el panel **Playlist del
día**. Todo se arma por reglas: no hay modelo de IA de por medio.

**Dime qué quieres** (lo primero del panel): escribes lo que quieres oír ("rock en español de los 90 para manejar de
noche"), escoges 30 min, 1 h o 2 h y das **Buscar y armar**. Del texto se entiende, sin importar mayúsculas ni
acentos: la duración ("media hora", "2 horas"; siempre queda en 30 min, 1 h o 2 h, y lo escrito gana a los botones),
décadas o años ("de los 80", "noventas", "2005", "del 1990 al 1995"), géneros comunes ("rock en español", "cumbia",
"jazz"…), "solo lo mío" / "mis me gusta" y "para descubrir" / "nuevas". Con eso busca en Spotify: tus listas cuyo
nombre se parece, listas públicas parecidas (cuenta las canciones que se repiten entre ellas), canciones que casan
con las palabras (con filtros de género y año) y discos de los artistas que nombres. Lo tuyo (lo que más oyes, tus
me gusta, tus listas) sube; lo del bote nunca sale. La vista previa dice de dónde salió ("De 3 listas públicas
parecidas, 5 canciones que casan con lo que pediste y 4 canciones tuyas"); si no encontró nada lo dice y propone
quitar palabras. Las llamadas tienen tope (`PLAYLIST_SEARCH_MAX_CALLS`) y lo que Spotify no deja leer se salta.
Palabras de ánimo ("más movida") no se entienden: no hay de dónde sacarlo sin IA.

Ojo: desde 2026 Spotify solo deja leer las canciones de **tus** listas (o colaborativas); las de otras personas
responden 403. La oficina lo intenta una vez por sesión y, si Spotify dice que no, sigue con búsqueda de canciones y
artistas y lo avisa.

Debajo siguen las recetas y "A mi gusto", con botones:

- **De dónde:** lo que más escuchas, tus "me gusta", cualquiera de tus listas, una sorpresa (tres de tus listas al
  azar) o artistas de entre los que más oyes (sus discos más nuevos y alguno más).
- **Década** (por la fecha del álbum), **duración** (30 min, 1 h o 2 h) y **mezcla:** solo lo tuyo o con algo para
  descubrir (canciones que no tienes, de discos de los artistas que salieron), sin repetir lo de las listas de estos
  días. Nunca pone el mismo artista dos veces seguidas si hay con qué evitarlo.
- **Recetas rápidas:** combinaciones con nombre que arman con un clic ("Lo de siempre", "Para trabajar"…). Se editan,
  se quitan y puedes guardar las tuyas.

Antes de crear nada ves la **vista previa** (canciones y duración). Ahí hay **Otra tirada** y, en cada canción,
**Esta no**: la manda al bote (no vuelve a salir en ninguna lista) y pone otra en su lugar. El bote se revisa en su
pestaña, o con un clic en el **bote** que está junto a la prensa; de ahí se pueden sacar.

**Crear en Spotify** la crea en tu cuenta como "Hoy suena · 12 nov · Para trabajar" (o con las primeras palabras de
lo que escribiste; tu texto va en la descripción de la lista) y, si quieres, la pone a sonar (necesita Spotify
abierto en algún aparato). Con cada lista se guarda qué se pidió (texto o receta) para poder mejorarla después.

**Mis listas** muestra todas las que hizo la oficina: nombre, fecha, canciones, duración (en medias horas) y con qué
se hizo. En cada una:

- **Tocar**, y **Guardar** si todavía no la decides.
- **Modificar:** cambiar el nombre, ver sus canciones, quitar las que quieras, buscar y agregar otras; **Guardar
  cambios** lo manda a Spotify.
- **Mejorar:** un cuadro "¿qué le cambio?" con las mismas reglas, y botones que siempre se pueden cumplir: **Más
  canciones (+30 min)**, **Cambia las que mandé al bote**, **Otra tirada con la misma idea** y **Más para
  descubrir**. Primero enseña qué quita y qué agrega; solo cambia algo cuando dices **Sí, aplicar**.
- **Borrar** en dos pasos (se quita de tu biblioteca).

Si quitaste una lista desde Spotify, al abrir "Mis listas" sale marcada ("Ya no está en tu Spotify") y se quita de
aquí sin error. Al día siguiente el panel pregunta por las que quedaron sin decidir; la oficina **nunca borra una
lista por su cuenta** y solo toca las que ella creó (guarda sus ids en `~/.pixel-agents/playlists.json`, junto con
las recetas y el bote).

Permisos: además de los de arriba pide `playlist-read-private`, `playlist-modify-private`,
`playlist-modify-public`, `user-library-read` y `user-library-modify` (este último porque hoy Spotify quita una
lista de la biblioteca con `DELETE /me/library`). Si conectaste la cuenta antes de que existiera esta función, el
panel lo dice y trae el botón **Reconectar Spotify**.

Lo que Spotify ya no deja (2026): recomendaciones, géneros de un artista, "lo más popular" de un artista, leer
listas ajenas, y la búsqueda da 10 resultados por página. Por eso "descubrir" sale de los discos de tus artistas y
el género solo funciona como filtro de búsqueda (`genre:`). Los
discos de un artista gastan rápido la cuota de la API; si Spotify pide esperar, la lista sale solo con lo tuyo y el
panel lo avisa. Una lista creada con `public: false` no aparece en tu perfil, pero Spotify ya no la marca como
privada del todo: eso se cambia a mano en Spotify.

## Pantallas en la red (opcional)

Otra pantalla de la casa (una tablet que muestra la letra, por ejemplo) puede leer lo que suena y usar los botones
de la música. La oficina sigue escuchando solo en `127.0.0.1`; esto abre **otro puerto** que nada más da la
canción, la letra y la carátula, y recibe los botones de reproducción. Viene apagado. Para prenderlo, agrega `screenPort` a `~/.pixel-agents/music.json` y reinicia la oficina:

```json
{ "enabled": true, "token": "…", "screenPort": 3101 }
```

| Ruta                      | Qué hace                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/music/now`      | `{ track, lyrics, lyricsLoading, lastControl? }`. `track.positionMs` ya viene adelantada al momento de pedirla; `track.volume` (0..1) y `track.tempo` (pulsos por minuto) si la fuente los sabe. `lastControl` (desde el primer botón): `{ action, ok, reason?, unconfirmed?, at }`                                             |
| `GET /api/music/cover`    | La carátula (imagen)                                                                                                                                                                                                                                                                                                            |
| `POST /api/music/control` | `{ "action": "previous" \| "togglePlay" \| "next" \| "volumeUp" \| "volumeDown" }`. Espera a Spotify (2.5 s como mucho): 200 `{ ok: true }` si lo hizo; 502 `{ error: "spotify", reason }` si no pudo; 200 `{ ok: true, unconfirmed: true }` si nadie contestó a tiempo. 409 si no hay extensión conectada ni cuenta de Spotify |

Todas piden `Authorization: Bearer <token de música>`. Cualquiera en tu red que tenga ese token puede ver qué
escuchas y cambiar de canción o de volumen (nada más): no lo compartas. Windows puede pedir permiso en el firewall la primera vez.

La extensión avisa también cuando adelantas o regresas la canción (antes solo al cambiar de canción, al pausar y
cada 15 s), así la letra en otras pantallas no se queda atrás. También cuenta el volumen y el tempo, y obedece los
botones de volumen. Para tenerlo, vuelve a instalar la extensión desde Ajustes.

## Carpetas

| Carpeta                                   | Qué hay                                                                                                                                                                             |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/`                                 | Ruta `/api/music`, token, carátulas, instalación en Spicetify, puerto de pantallas (`screenServer.ts`), API web de Spotify (`spotifyApi.ts`)                                        |
| `webview/`                                | Columna, sección de Ajustes, estado, tocadiscos que gira, cuadro y notas                                                                                                            |
| `spicetify/`                              | La extensión que corre dentro de Spotify                                                                                                                                            |
| `assets/furniture/`                       | Muebles `TURNTABLE` y `ALBUM_FRAME` (esbuild los copia a `dist/assets`)                                                                                                             |
| `arte/`                                   | Originales de PixelLab, `armar.py` (muebles) y `poner-en-plano.cjs` (los pone en un `layout.json`)                                                                                  |
| `test/`                                   | Pruebas del servidor y de la página (corren con `npm test`)                                                                                                                         |
| `server/playlists/`, `webview/playlists/` | Playlist del día: reglas (`generator.ts`), el texto (`describe.ts`) y su búsqueda (`describeSearch.ts`), llamadas a Spotify, `playlists.json` y el panel                            |
| `test/dobles/`                            | Spotify de mentira para pruebas (`fakeSpotify.ts`) y para una oficina aislada (`servidor.ts`, con `JAVBOTS_SPOTIFY_API_URL` y `JAVBOTS_SPOTIFY_ACCOUNTS_URL` apuntando a 127.0.0.1) |

Puntos donde toca al resto del proyecto (todos chicos y marcados con `features/musica`): mensajes en
`core/asyncapi.yaml`, `features` en `server/src/httpServer.ts` + `cli.ts`, la columna en `App.tsx`, la sección
en `SettingsModal.tsx`, el tocadiscos y las notas en `officeState.ts`, el tipo de partícula `note`, el ancho en
"ver toda la oficina" y la configuración de compilación (`esbuild.js`, `tsconfig`, `vitest`, lint).
