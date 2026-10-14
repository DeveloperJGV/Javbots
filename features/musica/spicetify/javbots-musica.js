// NAME: Javbots música
// DESCRIPTION: Le cuenta a la oficina de Javbots qué canción suena (título, artista, álbum, carátula).
//
// Javbots la instala desde Ajustes → Música, con la dirección y el token ya puestos. Para instalarla a mano:
// llena SERVER (p. ej. http://127.0.0.1:3100) y TOKEN (el de Ajustes → Música) aquí abajo, cópiala a la carpeta
// que da `spicetify path userdata` + `/Extensions` y corre:
//   spicetify config extensions javbots-musica.js
//   spicetify apply
//
// Solo manda datos a tu propia computadora. Si la oficina está cerrada, no pasa nada.

(function javbotsMusica() {
  const SERVER = '__JAVBOTS_URL__';
  const TOKEN = '__JAVBOTS_TOKEN__';
  const HEARTBEAT_MS = 15000;

  // Spicetify carga las extensiones antes de que el reproductor esté listo.
  if (!globalThis.Spicetify?.Player?.addEventListener || !globalThis.Spicetify?.Player?.data) {
    setTimeout(javbotsMusica, 300);
    return;
  }
  const Player = globalThis.Spicetify.Player;

  /** Spotify Connect: nombre del dispositivo donde suena cuando no es esta computadora (API sin documentar). */
  function remoteDevice() {
    try {
      const device = globalThis.Spicetify.Platform.ConnectAPI.state.activeDevice;
      return device && !device.isLocal && device.name ? String(device.name) : '';
    } catch (e) {
      return '';
    }
  }

  function current() {
    const data = Player.data;
    const item = data && data.item;
    if (!item) return null;
    const meta = item.metadata || {};
    return {
      title: item.name || meta.title || '',
      artist: meta.artist_name || (item.artists && item.artists[0] && item.artists[0].name) || '',
      album: meta.album_title || (item.album && item.album.name) || '',
      image: meta.image_url || meta.image_large_url || '',
      isPaused: Boolean(data.isPaused),
      positionMs: Player.getProgress(),
      durationMs: Player.getDuration(),
      device: remoteDevice(),
    };
  }

  function send() {
    fetch(SERVER + '/api/music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ track: current() }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (answer) {
        // La oficina no tiene la letra de esta canción (se reinició a media canción): se manda otra vez.
        if (answer && answer.needLyrics) {
          lyricsSentFor = '';
          sendLyrics();
        }
      })
      .catch(function () {
        // La oficina está cerrada: se reintenta en el siguiente latido.
      });
  }

  /** La letra de Spotify (la misma que enseña la app), línea por línea. Se manda una vez por canción. */
  let lyricsSentFor = '';
  async function sendLyrics() {
    const item = Player.data && Player.data.item;
    const now = current();
    if (!item || !item.uri || !now || item.uri === lyricsSentFor) return;
    lyricsSentFor = item.uri;
    let synced = false;
    let lines = null;
    try {
      const id = item.uri.split(':')[2];
      const body = await globalThis.Spicetify.CosmosAsync.get(
        'https://spclient.wg.spotify.com/color-lyrics/v2/track/' +
          id +
          '?format=json&vocalRemoval=false&market=from_token',
      );
      const lyrics = body && body.lyrics;
      if (lyrics && lyrics.lines && lyrics.lines.length) {
        synced = lyrics.syncType === 'LINE_SYNCED';
        lines = lyrics.lines.map(function (l) {
          return { timeMs: Number(l.startTimeMs), text: String(l.words || '') };
        });
      }
    } catch (e) {
      // Spotify no tiene letra para esta canción (o cambió su dirección): la oficina le pregunta a LRCLIB.
    }
    fetch(SERVER + '/api/music/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ title: now.title, artist: now.artist, synced: synced, lines: lines }),
    }).catch(function () {
      lyricsSentFor = ''; // la oficina está cerrada: se reintenta en el siguiente latido
    });
  }

  Player.addEventListener('songchange', send);
  Player.addEventListener('songchange', sendLyrics);
  Player.addEventListener('onplaypause', send);
  setInterval(function () {
    send();
    sendLyrics();
  }, HEARTBEAT_MS);
  send();
  sendLyrics();
})();
