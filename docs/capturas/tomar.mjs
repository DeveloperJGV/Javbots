// Capturas para el README: oficina aislada (HOME temporal, puerto 3198), el plano
// que viene con el proyecto, SIN arte privado, con agentes de ejemplo.
// Uso: node tomar.mjs <repo> <salida>
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const [REPO, SALIDA] = process.argv.slice(2).map((p) => path.resolve(p));
const require = createRequire(path.join(REPO, 'package.json'));
const { chromium } = require('@playwright/test');

const PUERTO = 3198;
const CLI = path.join(REPO, 'dist', 'cli.js');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(SALIDA, { recursive: true });

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-capturas-home-'));
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-capturas-ws-'));
fs.mkdirSync(path.join(home, '.pixel-agents'), { recursive: true });
fs.writeFileSync(
  path.join(home, '.pixel-agents', 'config.json'),
  JSON.stringify({
    standalone: {
      soundEnabled: false,
      lastSeenVersion: '9.9',
      alwaysShowLabels: true,
      watchAllSessions: true,
      hooksInfoShown: true,
      shadowsEnabled: true,
      particlesEnabled: true,
      dayNightMode: 'day',
      introCompleted: true,
    },
    hooksConsent: { claude: 'declined' },
    hooksEnabled: { claude: false },
    externalAssetDirectories: [],
  }),
);

let log = '';
const servidor = spawn(process.execPath, [CLI, '--port', String(PUERTO), '--host', '127.0.0.1'], {
  cwd: workspace,
  env: { ...process.env, HOME: home, USERPROFILE: home },
  stdio: 'pipe',
});
servidor.stdout.on('data', (c) => (log += c));
servidor.stderr.on('data', (c) => (log += c));

const PROYECTOS = path.join(home, '.claude', 'projects');
class Agente {
  constructor(carpeta) {
    this.cwd = `C:\\proyectos\\${carpeta}`;
    this.sesion = crypto.randomUUID();
    const dir = path.join(PROYECTOS, this.cwd.replace(/[:\\/]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    this.archivo = path.join(dir, `${this.sesion}.jsonl`);
    this.n = 0;
  }
  escribir(r) {
    fs.appendFileSync(
      this.archivo,
      JSON.stringify({ cwd: this.cwd, sessionId: this.sesion, timestamp: new Date().toISOString(), ...r }) + '\n',
    );
  }
  llegar() {
    this.escribir({ type: 'user', message: { role: 'user', content: 'Hola' }, relleno: 'x'.repeat(3500) });
  }
  herramienta(nombre, input) {
    const id = `toolu_cap_${this.sesion.slice(0, 8)}_${++this.n}`;
    this.escribir({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: nombre, input }] } });
    return id;
  }
  resultado(id) {
    this.escribir({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
  }
  becario(padre, nombre, input) {
    const id = `toolu_cap_${this.sesion.slice(0, 8)}_${++this.n}`;
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

/** Esconde barra, zoom y versión; solo queda la oficina con etiquetas. */
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
        if (/^(Oficina|Ajustes)$/.test(t) || /Captura|Día|Noche|Auto/.test(t) || /^(Acercar|Alejar|Ver toda)/.test(titulo) || /Captura|Siempre de|Luz según|Ajustes|Oficina/i.test(titulo)) {
          contenedor(b).style.visibility = 'hidden';
        }
      }
      for (const el of document.querySelectorAll('div,span')) {
        if (el.children.length === 0 && /^v\d+\.\d+/.test((el.textContent ?? '').trim())) el.style.visibility = 'hidden';
      }
    };
    esconder();
    setInterval(esconder, 300);
  });
}

function chromiumInstalado() {
  const raiz = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  try {
    for (const d of fs.readdirSync(raiz).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      const exe = path.join(raiz, d, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {}
  return undefined;
}

// Plano 44×30; viewport 1500×1050 CSS a DPR 2 → zoom 4 (1 tile = 32 px CSS).
const COLS = 44, ROWS = 30, W = 1500, H = 1050, T = 32;
const OX = Math.floor((W * 2 - COLS * 64) / 2) / 2;
const OY = Math.floor((H * 2 - ROWS * 64) / 2) / 2;
/** Recorte de cuartos (col0,row0,col1,row1); una fila extra arriba para la pared. */
const cuarto = (c0, r0, c1, r1) => ({ x: OX + c0 * T, y: OY + (r0 - 1) * T, width: (c1 - c0 + 1) * T, height: (r1 - r0 + 2) * T });
const CUARTOS = {
  jedi: cuarto(1, 2, 12, 9),
  codigo: cuarto(14, 2, 27, 9),
  lightlabs: cuarto(29, 2, 35, 9),
  delorean: cuarto(1, 18, 13, 28),
  aperture: cuarto(15, 18, 24, 28),
  becarios: cuarto(26, 18, 35, 28),
  arriba: cuarto(1, 2, 42, 9),
};
const TODA = { x: OX, y: OY - T, width: COLS * T, height: (ROWS + 1) * T };

let navegador;
try {
  const limite = Date.now() + 20000;
  let url;
  while (!url && Date.now() < limite) {
    url = /Pixel Agents server running at (\S+)\s/.exec(log)?.[1];
    await espera(100);
  }
  if (!url) throw new Error('sin URL:\n' + log);

  navegador = await chromium.launch({ executablePath: chromiumInstalado() });
  const pagina = await navegador.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await pagina.goto(url);
  await pagina.getByRole('button', { name: 'Ajustes' }).waitFor({ timeout: 30000 });
  await ocultarInterfaz(pagina);
  await espera(1500);

  const t0 = Date.now();
  const seg = () => (Date.now() - t0) / 1000;
  const hasta = async (t) => {
    const f = t - seg();
    if (f > 0) await espera(f * 1000);
  };
  const foto = async (nombre, clip, opts = {}) => {
    await pagina.screenshot({ path: path.join(SALIDA, `${nombre}.png`), clip, ...opts });
    console.log(`[capturas] ${nombre} @ ${seg().toFixed(1)} s`);
  };
  const PASO = 4.5;
  const tanda = async (agente, t, pasos) => {
    for (let i = 0; i < pasos.length; i++) {
      await hasta(t + i * PASO);
      const id = agente.herramienta(...pasos[i]);
      await hasta(t + (i + 1) * PASO - 0.2);
      agente.resultado(id);
    }
  };
  const repetir = (n, paso) => Array.from({ length: n }, () => paso);

  const tienda = new Agente('tienda-online');
  const api = new Agente('api-pagos');
  const blog = new Agente('blog');
  const juego = new Agente('mi-juego');
  const clima = new Agente('app-clima');
  const notas = new Agente('app-notas');
  const todos = [tienda, api, blog, juego, clima, notas];
  for (let i = 0; i < todos.length; i++) {
    await hasta(1 + i * 0.4);
    todos[i].llegar();
  }

  const N = 9; // 9 × 4.5 s ≈ 40 s de trabajo
  const trabajo = Promise.all([
    tanda(tienda, 8, repetir(N, ['Edit', { file_path: 'src/carrito.ts' }])),
    tanda(api, 8, repetir(N, ['Bash', { command: 'npm run build' }])),
    tanda(blog, 8, repetir(N, ['Read', { file_path: 'docs/guia.md' }])),
    tanda(clima, 8, repetir(N, ['WebFetch', { url: 'https://example.com/clima' }])),
    tanda(notas, 8, repetir(N, ['Bash', { command: 'npx vitest run' }])),
    (async () => {
      await hasta(8);
      const task = juego.herramienta('Task', { description: 'Revisar los niveles', subagent_type: 'general-purpose' });
      for (let i = 0; i < N; i++) {
        await hasta(10 + i * PASO);
        juego.becario(task, i % 2 ? 'Edit' : 'Read', { file_path: 'niveles/nivel1.json' });
      }
      await hasta(8 + N * PASO);
      juego.resultado(task);
    })(),
  ]);

  await hasta(24);
  await foto('dia-oficina', TODA);
  for (const [n, clip] of Object.entries(CUARTOS)) await foto(`dia-${n}`, clip);

  await hasta(30);
  await pagina.evaluate(() => [...document.querySelectorAll('button')].find((x) => (x.getAttribute('title') ?? '').startsWith('Siempre de día'))?.click());
  await hasta(34);
  await foto('noche-oficina', TODA);
  for (const [n, clip] of Object.entries(CUARTOS)) await foto(`noche-${n}`, clip);

  await trabajo;
  for (const a of todos) a.terminarTurno();
  // Fiesta: se juntan en Becarios (hasta 15 s) y bailan 8 s.
  for (let i = 0; i < 24; i++) {
    await hasta(seg() + 1);
    await foto(`fiesta-${String(i).padStart(2, '0')}`, CUARTOS.becarios);
  }
} finally {
  await navegador?.close();
  servidor.kill();
  await espera(500);
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
}
