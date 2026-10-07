// Graba un borrador del tráiler: una oficina aislada (HOME temporal, otro puerto)
// con agentes de mentira que escriben transcripts JSONL, capturada cuadro por
// cuadro con el screencast de Chromium (PNG, sin pérdida: el pixel art no se
// emborrona como con el video de Playwright).
//
// Uso: node docs/trailer/grabar.mjs [--puerto 3199] [--segundos 60]
// Salida (docs/trailer/salida/): cuadros/*.png, cuadros.json (hora de cada
// cuadro), pistas.json (dónde está cada personaje, para que la cámara los siga)
// y marcas.json (cuándo empezó cada escena). Luego: python docs/trailer/editar.py
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

import { escenas } from './guion.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const CLI = path.join(REPO, 'dist', 'cli.js');
const SALIDA = path.join(AQUI, 'salida');
const CUADROS = path.join(SALIDA, 'cuadros');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const PUERTO = Number(opt('--puerto', '3199'));
const SEGUNDOS = Number(opt('--segundos', '60'));
if (PUERTO === 3100) throw new Error('El 3100 es la oficina de todos los días: usa otro puerto.');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Oficina aislada ─────────────────────────────────────────────

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-trailer-home-'));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-trailer-ws-'));
fs.mkdirSync(path.join(home, '.pixel-agents'), { recursive: true });
// El plano local (con las piezas privadas colocadas): solo se LEE.
const PLANO_REAL = path.join(os.homedir(), '.pixel-agents', 'layout.json');
if (fs.existsSync(PLANO_REAL)) fs.copyFileSync(PLANO_REAL, path.join(home, '.pixel-agents', 'layout.json'));
const PRIVADOS = [path.join(REPO, 'arte', 'privado')].filter((d) => fs.existsSync(d));
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
      },
      // Sin hooks: todo sale de los transcripts (así hay becarios y temporizadores).
      hooksConsent: { claude: 'declined' },
      hooksEnabled: { claude: false },
      // Muebles y mascotas privados (carpeta externa, fuera de git).
      externalAssetDirectories: PRIVADOS,
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
    const r = { cwd: this.cwd, sessionId: this.sesion, timestamp: new Date().toISOString(), ...registro };
    fs.appendFileSync(this.archivo, JSON.stringify(r) + '\n');
  }
  /** Aparece: el escáner global adopta archivos de más de 3 KB tocados hace poco. */
  llegar() {
    this.escribir({ type: 'user', message: { role: 'user', content: 'Hola' }, relleno: 'x'.repeat(3500) });
  }
  id() {
    return `toolu_trailer_${this.sesion.slice(0, 8)}_${++this.n}`;
  }
  herramienta(nombre, input) {
    const id = this.id();
    this.escribir({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: nombre, input }] } });
    return id;
  }
  resultado(id, { error = false } = {}) {
    this.escribir({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: id, content: error ? 'Error: falló' : 'ok', ...(error ? { is_error: true } : {}) }] },
    });
  }
  /** Herramienta de un becario (sub-agente) dentro de la Task `padre`. */
  becario(padre, nombre, input) {
    const id = this.id();
    this.escribir({
      type: 'progress',
      parentToolUseID: padre,
      data: { type: 'agent_progress', message: { type: 'assistant', message: { content: [{ type: 'tool_use', id, name: nombre, input }] } } },
    });
    return id;
  }
  terminarTurno() {
    this.escribir({ type: 'system', subtype: 'turn_duration', durationMs: 4000 });
  }
}

// ── Grabación ──────────────────────────────────────────────────

/** Esconde la barra de abajo, el zoom (+/−) y la versión: en el video solo va la
 *  oficina con las etiquetas de los personajes. Se repite por si React los vuelve
 *  a montar. Los botones escondidos siguen funcionando con .click(). */
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
        const t = (b.textContent ?? '').trim();
        const titulo = b.getAttribute('title') ?? '';
        if (/^(Oficina|Ajustes)$/.test(t) || /Captura|Día|Noche|Auto/.test(t) || /^(Acercar|Alejar)/.test(titulo)) {
          contenedor(b).style.visibility = 'hidden';
        }
      }
      for (const el of document.querySelectorAll('div,span')) {
        if (el.children.length === 0 && /^v\d+\.\d+/.test((el.textContent ?? '').trim())) {
          el.style.visibility = 'hidden';
        }
      }
    };
    esconder();
    setInterval(esconder, 500);
  });
}

/** El Chromium que Playwright ya bajó (cualquier versión): la de @playwright/test
 *  puede pedir otra que no está. */
function chromiumInstalado() {
  const raiz = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  let dirs = [];
  try {
    dirs = fs.readdirSync(raiz).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  } catch {
    return undefined;
  }
  for (const d of dirs) {
    const exe = path.join(raiz, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

let navegador;
try {
  const url = await urlImpresa();
  fs.rmSync(CUADROS, { recursive: true, force: true });
  fs.mkdirSync(CUADROS, { recursive: true });

  navegador = await chromium.launch({ executablePath: chromiumInstalado() });
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  // Ganchos e2e (window.__pixelAgentsTestHooks.getCharacters) para seguir personajes.
  await pagina.addInitScript(() => {
    window.__PIXEL_AGENTS_E2E = true;
  });
  await pagina.goto(url);
  await pagina.getByRole('button', { name: 'Ajustes' }).waitFor({ timeout: 30_000 });
  await ocultarInterfaz(pagina);
  await espera(1500);

  // Screencast: cada cuadro con su hora, para armar el video a velocidad real.
  const cdp = await pagina.context().newCDPSession(pagina);
  const cuadros = [];
  cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
    const nombre = `c${String(cuadros.length).padStart(5, '0')}.png`;
    fs.writeFileSync(path.join(CUADROS, nombre), Buffer.from(data, 'base64'));
    cuadros.push({ nombre, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  const t0 = Date.now();
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

  // Pistas: dónde está cada personaje (px del mundo, pies), ~10 veces por segundo.
  const pistas = [];
  const muestrear = setInterval(async () => {
    try {
      const t = Date.now() / 1000;
      const chars = await pagina.evaluate(() =>
        (window.__pixelAgentsTestHooks?.getCharacters?.() ?? []).map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          palette: c.palette,
          sub: c.isSubagent,
          fx: c.matrixEffect ?? null,
        })),
      );
      pistas.push({ t, chars });
    } catch {
      // página ocupada: se salta la muestra
    }
  }, 100);

  // Día → noche con el botón de la barra (escondido, pero sigue funcionando).
  const noche = () =>
    pagina.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('Día'));
      b?.click();
    });
  const ctx = { Agente, espera, pagina, noche, seg: () => (Date.now() - t0) / 1000 };
  const marcas = [];
  for (const escena of escenas) {
    marcas.push({ escena: escena.nombre, t: Date.now() / 1000 });
    console.log(`[trailer] ${escena.nombre}`);
    await escena.correr(ctx);
  }
  const resto = SEGUNDOS * 1000 - (Date.now() - t0);
  if (resto > 0) await espera(resto);
  clearInterval(muestrear);
  await cdp.send('Page.stopScreencast');
  await espera(300);

  // Todo en segundos desde el primer cuadro.
  const base = cuadros[0].t;
  const rel = (t) => +(t - base).toFixed(3);
  fs.writeFileSync(path.join(SALIDA, 'cuadros.json'), JSON.stringify(cuadros.map((c) => ({ nombre: c.nombre, t: rel(c.t) }))));
  fs.writeFileSync(path.join(SALIDA, 'pistas.json'), JSON.stringify(pistas.map((p) => ({ t: rel(p.t), chars: p.chars }))));
  fs.writeFileSync(path.join(SALIDA, 'marcas.json'), JSON.stringify(marcas.map((m) => ({ escena: m.escena, t: rel(m.t) })), null, 2));
  const total = cuadros.at(-1).t - base;
  console.log(`[trailer] ${cuadros.length} cuadros en ${total.toFixed(1)} s (${(cuadros.length / total).toFixed(1)} fps), ${pistas.length} muestras`);
} finally {
  await navegador?.close();
  servidor.kill();
  await espera(500);
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
}
