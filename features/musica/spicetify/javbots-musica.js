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
  // Un salto mayor que esto entre lo esperado y la posición real es que alguien adelantó o regresó la canción.
  const SEEK_JUMP_MS = 2500;
  const CONTROL_RETRY_MS = 5000;
  /** Cuánto sube o baja el volumen cada botón (0..1). */
  const VOLUME_STEP = 0.1;

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
      // La más grande: otras pantallas la usan de fondo.
      image: meta.image_xlarge_url || meta.image_large_url || meta.image_url || '',
      isPaused: Boolean(data.isPaused),
      positionMs: Player.getProgress(),
      durationMs: Player.getDuration(),
      device: remoteDevice(),
      volume: volumeNow(),
      tempo: item.uri && item.uri === tempoFor ? tempo : undefined,
    };
  }

  function volumeNow() {
    try {
      const v = Player.getVolume();
      return typeof v === 'number' && isFinite(v) ? v : undefined;
    } catch (e) {
      return undefined;
    }
  }

  /** Pulsos por minuto de la canción (para que las mascotas de otras pantallas se muevan al ritmo). */
  let tempo;
  let tempoFor = '';
  async function loadTempo() {
    const item = Player.data && Player.data.item;
    if (!item || !item.uri || item.uri === tempoFor) return;
    tempoFor = item.uri;
    tempo = undefined;
    let bpm;
    try {
      const analysis = await globalThis.Spicetify.getAudioData(item.uri);
      bpm = analysis && analysis.track && analysis.track.tempo;
    } catch (e) {
      // Sin análisis de audio para esta canción: se intenta con sus características.
    }
    if (!bpm) {
      try {
        const id = item.uri.split(':')[2];
        const features = await globalThis.Spicetify.CosmosAsync.get('https://api.spotify.com/v1/audio-features/' + id);
        bpm = features && features.tempo;
      } catch (e) {
        // Spotify no lo da: las mascotas se mueven a su paso de siempre.
      }
    }
    if (tempoFor !== item.uri || typeof bpm !== 'number' || !(bpm > 0)) return;
    tempo = Math.round(bpm * 10) / 10;
    send();
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

  /** Botones de la oficina (anterior / play-pausa / siguiente): llegan por un WebSocket que se reabre solo. */
  const ACTIONS = {
    previous: function () {
      Player.back();
    },
    togglePlay: function () {
      Player.togglePlay();
    },
    next: function () {
      Player.next();
    },
    volumeUp: function () {
      changeVolume(VOLUME_STEP);
    },
    volumeDown: function () {
      changeVolume(-VOLUME_STEP);
    },
  };
  function changeVolume(delta) {
    const v = volumeNow();
    if (v === undefined) return;
    Player.setVolume(Math.max(0, Math.min(1, Math.round((v + delta) * 100) / 100)));
    setTimeout(send, 300); // que las pantallas vean el volumen nuevo sin esperar al latido
  }
  function connectControl() {
    let socket;
    try {
      socket = new WebSocket(
        SERVER.replace(/^http/, 'ws') + '/api/music/control?token=' + encodeURIComponent(TOKEN),
      );
    } catch (e) {
      setTimeout(connectControl, CONTROL_RETRY_MS);
      return;
    }
    socket.onmessage = function (event) {
      let command;
      try {
        command = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (command && Object.prototype.hasOwnProperty.call(ACTIONS, command.action)) {
        ACTIONS[command.action]();
      }
    };
    socket.onclose = function () {
      setTimeout(connectControl, CONTROL_RETRY_MS);
    };
  }
  connectControl();

  Player.addEventListener('songchange', send);
  Player.addEventListener('songchange', sendLyrics);
  Player.addEventListener('songchange', loadTempo);
  Player.addEventListener('onplaypause', send);

  // Adelantar o regresar no tiene evento propio: se nota porque la posición brinca. Se avisa en ese momento
  // para que la letra en otras pantallas no se quede atrás hasta el siguiente latido.
  let lastProgress = { at: Date.now(), ms: Player.getProgress() };
  Player.addEventListener('onprogress', function () {
    const at = Date.now();
    const ms = Player.getProgress();
    const expected = lastProgress.ms + (Player.data && Player.data.isPaused ? 0 : at - lastProgress.at);
    lastProgress = { at: at, ms: ms };
    if (Math.abs(ms - expected) > SEEK_JUMP_MS) send();
  });
  setInterval(function () {
    send();
    sendLyrics();
  }, HEARTBEAT_MS);
  send();
  sendLyrics();
  loadTempo();
})();
