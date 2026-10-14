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

  /** Spotify Connect: name of the device it plays on when it isn't this computer (no typed API: best effort). */
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
    }).catch(function () {
      // La oficina está cerrada: se reintenta en el siguiente latido.
    });
  }

  Player.addEventListener('songchange', send);
  Player.addEventListener('onplaypause', send);
  setInterval(send, HEARTBEAT_MS);
  send();
})();
