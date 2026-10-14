// Tráiler 2: graba la oficina aislada (HOME temporal, otro puerto) con agentes
// de mentira, cuadro por cuadro con el screencast de Chromium (PNG sin pérdida).
//
// Uso: node docs/trailer/v2/grabar.mjs --version completa|publica [--puerto 3199] [--segundos 162]
//   completa: el plano local y los pixeles de arte/privado (mascotas, busto...).
//   publica:  el plano que viene con el proyecto, sin nada privado (para el README).
// Salida (docs/trailer/salida/v2-<version>/): cuadros/*.png, cuadros.json,
// pistas.json (dónde está cada personaje y mascota) y eventos.json (marcas del
// guion). Luego: python docs/trailer/v2/editar.py --version <version>
//
// Nunca toca ~/.claude ni ~/.pixel-agents reales: el servidor corre con HOME y
// USERPROFILE apuntando a una carpeta temporal que se borra al final.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { correr, SEGUNDOS as SEGUNDOS_GUION } from './guion.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..', '..');
const CLI = path.join(REPO, 'dist', 'cli.js');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const VERSION = opt('--version', 'publica');
if (!['completa', 'publica'].includes(VERSION)) throw new Error('--version completa|publica');
const PUERTO = Number(opt('--puerto', '3199'));
const SEGUNDOS = Number(opt('--segundos', SEGUNDOS_GUION));
if (PUERTO === 3100) throw new Error('El 3100 es la oficina de todos los días: usa otro puerto.');
const SALIDA = path.join(AQUI, '..', 'salida', `v2-${VERSION}`);
const CUADROS = path.join(SALIDA, 'cuadros');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Oficina aislada ─────────────────────────────────────────────

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-trailer2-home-'));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-trailer2-ws-'));
fs.mkdirSync(path.join(home, '.pixel-agents'), { recursive: true });
let privados = [];
if (VERSION === 'completa') {
  // El plano local (con las piezas privadas colocadas): solo se LEE.
  const plano = path.join(os.homedir(), '.pixel-agents', 'layout.json');
  if (fs.existsSync(plano)) fs.copyFileSync(plano, path.join(home, '.pixel-agents', 'layout.json'));
  privados = [path.join(REPO, 'arte', 'privado')].filter((d) => fs.existsSync(d));
}
fs.writeFileSync(
  path.join(home, '.pixel-agents', 'config.json'),
  JSON.stringify(
    {
      standalone: {
        soundEnabled: false,
        lastSeenVersion: '1.4',
        alwaysShowLabels: true,
        watchAllSessions: true,
        hooksInfoShown: true,
        shadowsEnabled: true,
        particlesEnabled: true,
        dayNightMode: 'day',
        introCompleted: true,
      },
      // Sin hooks instalados: todo sale de los transcripts (así hay becarios y
      // temporizadores). El "pensando" se manda a mano al endpoint de hooks.
      hooksConsent: { claude: 'declined' },
      hooksEnabled: { claude: false },
      externalAssetDirectories: privados,
    },
    null,
    2,
  ),
);

let servidorLog = '';
const servidor = spawn(process.execPath, [CLI, '--port', String(PUERTO), '--host', '127.0.0.1'], {
  cwd: workspace,
  env: { ...process.env, HOME: home, USERPROFILE: home },
  stdio: 'pipe',
});
servidor.stdout.on('data', (c) => (servidorLog += c));
servidor.stderr.on('data', (c) => (servidorLog += c));

async function urlImpresa() {
  const limite = Date.now() + 20_000;
  while (Date.now() < limite) {
    const m = /Pixel Agents server running at (\S+)\s/.exec(servidorLog);
    if (m) return m[1];
    await espera(100);
  }
  throw new Error('El servidor no imprimió su URL:\n' + servidorLog);
}

/** Manda un evento de hook al servidor aislado, como lo haría el script de Claude Code. */
async function hook(evento) {
  const { port, token } = JSON.parse(
    fs.readFileSync(path.join(home, '.pixel-agents', 'server.json'), 'utf8'),
  );
  const r = await fetch(`http://127.0.0.1:${port}/api/hooks/claude`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(evento),
  }).catch((e) => ({ status: e.message }));
  console.log(`[trailer] hook ${evento.hook_event_name}: ${r.status}`);
}

// ── Agentes de mentira (transcripts JSONL) ─────────────────────

const PROYECTOS = path.join(home, '.claude', 'projects');

/** Un agente de mentira: escribe su transcript como lo haría Claude Code. */
class Agente {
  constructor(carpeta) {
    this.cwd = `C:\\proyectos\\${carpeta}`;
    this.sesion = crypto.randomUUID();
    const dir = path.join(PROYECTOS, this.cwd.replace(/[:\\/]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    this.archivo = path.join(dir, `${this.sesion}.jsonl`);
    this.n = 0;
  }
  escribir(registro) {
    const r = {
      cwd: this.cwd,
      sessionId: this.sesion,
      timestamp: new Date().toISOString(),
      ...registro,
    };
    fs.appendFileSync(this.archivo, JSON.stringify(r) + '\n');
  }
  /** Aparece: el escáner global adopta archivos de más de 3 KB tocados hace poco. */
  llegar() {
    this.escribir({
      type: 'user',
      message: { role: 'user', content: 'Hola' },
      relleno: 'x'.repeat(3500),
    });
  }
  /** Le escribes un mensaje: se queda pensando hasta su primera herramienta. */
  async pensar() {
    // El transcript primero: al leer un mensaje nuevo el servidor limpia la
    // actividad, y eso borraría el "pensando" si llegara después del hook.
    this.escribir({
      type: 'user',
      message: { role: 'user', content: 'Escribe la siguiente entrada' },
    });
    await espera(1200);
    return hook({
      session_id: this.sesion,
      hook_event_name: 'UserPromptSubmit',
      cwd: this.cwd,
      transcript_path: this.archivo,
    });
  }
  id() {
    return `toolu_trailer_${this.sesion.slice(0, 8)}_${++this.n}`;
  }
  herramienta(nombre, input) {
    const id = this.id();
    this.escribir({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id, name: nombre, input }] },
    });
    return id;
  }
  resultado(id, { error = false } = {}) {
    this.escribir({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: id,
            content: error ? 'Error: falló' : 'ok',
            ...(error ? { is_error: true } : {}),
          },
        ],
      },
    });
  }
  /** Herramienta de un becario (sub-agente) dentro de la Task `padre`. */
  becario(padre, nombre, input) {
    const id = this.id();
    this.escribir({
      type: 'progress',
      parentToolUseID: padre,
      data: {
        type: 'agent_progress',
        message: {
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id, name: nombre, input }] },
        },
      },
    });
    return id;
  }
  terminarTurno() {
    this.escribir({ type: 'system', subtype: 'turn_duration', durationMs: 4000 });
  }
  /** Fin de turno por hook (para el agente que ya recibió hooks). */
  pararHook() {
    return hook({
      session_id: this.sesion,
      hook_event_name: 'Stop',
      cwd: this.cwd,
      transcript_path: this.archivo,
    });
  }
}

// ── Grabación ──────────────────────────────────────────────────

/** Esconde la columna de botones, el zoom y la versión: en el video solo va la
 *  oficina con las etiquetas. Los botones escondidos siguen funcionando con .click(). */
async function ocultarInterfaz(pagina) {
  await pagina.evaluate(() => {
    const contenedor = (el) => {
      let n = el;
      while (n && n !== document.body) {
        const pos = getComputedStyle(n).position;
        if (pos === 'absolute' || pos === 'fixed') return n;
        n = n.parentElement;
      }
      return el;
    };
    const esconder = () => {
      for (const b of document.querySelectorAll('button')) {
        if (b.closest('[role="dialog"]')) continue;
        const t = (b.textContent ?? '').trim();
        const titulo = b.getAttribute('title') ?? '';
        if (
          /^(Oficina|Ajustes)$/.test(t) ||
          /^(Acercar|Alejar|Ver toda)/.test(titulo) ||
          /Captura|Siempre de|Luz según|Ajustes|Oficina|Pizarrón|Nuevo agente/i.test(titulo)
        ) {
          contenedor(b).style.visibility = 'hidden';
        }
      }
      for (const el of document.querySelectorAll('div,span')) {
        if (el.children.length === 0 && /^v\d+\.\d+/.test((el.textContent ?? '').trim()))
          el.style.visibility = 'hidden';
      }
    };
    esconder();
    setInterval(esconder, 300);
  });
}

/** El Chromium que Playwright ya bajó (cualquier versión). */
function chromiumInstalado() {
  const raiz = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  try {
    for (const d of fs
      .readdirSync(raiz)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .reverse()) {
      const exe = path.join(raiz, d, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {
    // sin navegadores de Playwright
  }
  return undefined;
}

const clicBoton = (pagina, prefijo) =>
  pagina.evaluate((p) => {
    [...document.querySelectorAll('button')]
      .find((b) => (b.getAttribute('title') ?? '').startsWith(p))
      ?.click();
  }, prefijo);

let navegador;
try {
  const url = await urlImpresa();
  fs.rmSync(CUADROS, { recursive: true, force: true });
  fs.mkdirSync(CUADROS, { recursive: true });

  navegador = await chromium.launch({ executablePath: chromiumInstalado() });
  const pagina = await navegador.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  // Ganchos e2e (window.__pixelAgentsTestHooks) para seguir personajes y mascotas.
  await pagina.addInitScript(() => {
    window.__PIXEL_AGENTS_E2E = true;
  });
  await pagina.goto(url);
  await pagina.getByRole('button', { name: 'Ajustes' }).waitFor({ timeout: 30_000 });
  await ocultarInterfaz(pagina);
  await espera(2000);

  const cdp = await pagina.context().newCDPSession(pagina);
  const cuadros = [];
  cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    const nombre = `c${String(cuadros.length).padStart(5, '0')}.png`;
    fs.writeFileSync(path.join(CUADROS, nombre), Buffer.from(data, 'base64'));
    cuadros.push({ nombre, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const t0 = Date.now();
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1,
  });

  const pistas = [];
  const muestrear = setInterval(async () => {
    try {
      const t = Date.now() / 1000;
      const muestra = await pagina.evaluate(() => {
        const h = window.__pixelAgentsTestHooks;
        return {
          chars: (h?.getCharacters?.() ?? []).map((c) => ({
            id: c.id,
            x: c.x,
            y: c.y,
            palette: c.palette,
            sub: c.isSubagent,
          })),
          pets: (h?.getPets?.() ?? []).map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y })),
          carpetas: Object.fromEntries(
            (h?.getAgentSeats?.() ?? []).map((a) => [a.id, a.folderName]),
          ),
        };
      });
      pistas.push({ t, ...muestra });
    } catch {
      // página ocupada: se salta la muestra
    }
  }, 100);

  const seg = () => (Date.now() - t0) / 1000;
  const eventos = [];
  const ctx = {
    Agente,
    version: VERSION,
    espera,
    seg,
    marca: (nombre) => {
      eventos.push({ nombre, t: Date.now() / 1000 });
      console.log(`[trailer] ${seg().toFixed(1)} s · ${nombre}`);
    },
    noche: () => clicBoton(pagina, 'Siempre de día'),
    abrirPizarron: () => clicBoton(pagina, 'Pizarrón'),
    // Clic en el fondo oscuro del panel (Escape no lo cierra).
    cerrarPizarron: () => pagina.mouse.click(20, 20),
    /** Clic en un punto del mundo (px del juego) sobre la oficina a zoom 2. */
    clicMundo: (x, y) => pagina.mouse.click(256 + x * 2, 60 + y * 2),
  };
  await correr(ctx);
  const resto = SEGUNDOS * 1000 - (Date.now() - t0);
  if (resto > 0) await espera(resto);
  clearInterval(muestrear);
  await cdp.send('Page.stopScreencast');
  await espera(300);

  const base = cuadros[0].t;
  const rel = (t) => +(t - base).toFixed(3);
  fs.writeFileSync(
    path.join(SALIDA, 'cuadros.json'),
    JSON.stringify(cuadros.map((c) => ({ nombre: c.nombre, t: rel(c.t) }))),
  );
  fs.writeFileSync(
    path.join(SALIDA, 'pistas.json'),
    JSON.stringify(pistas.map((p) => ({ ...p, t: rel(p.t) }))),
  );
  fs.writeFileSync(
    path.join(SALIDA, 'eventos.json'),
    JSON.stringify(
      eventos.map((e) => ({ ...e, t: rel(e.t) })),
      null,
      2,
    ),
  );
  const total = cuadros.at(-1).t - base;
  console.log(
    `[trailer] ${cuadros.length} cuadros en ${total.toFixed(1)} s (${(cuadros.length / total).toFixed(1)} fps), ${pistas.length} muestras`,
  );
} finally {
  await navegador?.close();
  servidor.kill();
  await espera(500);
  fs.mkdirSync(SALIDA, { recursive: true });
  fs.writeFileSync(path.join(SALIDA, 'servidor.log'), servidorLog);
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
}
