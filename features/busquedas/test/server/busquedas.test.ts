import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanCriteria, createCriteriaStore } from '../../server/criteria.js';
import {
  agentStatusOf,
  createHerdrLauncher,
  type HerdrExec,
  paneIdOf,
  paneRunCommand,
  tabIdOf,
} from '../../server/herdrLauncher.js';
import { briefLine, createSearchRoom, readResults, safeLink } from '../../server/searchRoom.js';

const KINDS = ['oficial', 'establecido', 'otro'] as const;
const SETS = [{ id: 'tecnicos', label: 'Técnicos', rules: ['Oficial primero'] }];

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'busquedas-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('readResults', () => {
  it('ordena recomendados primero, por puntuación y reseñas, y limpia lo raro', () => {
    const { results, note } = readResults(
      {
        nota: 'Busqué en Puebla',
        resultados: [
          { nombre: 'Barato WhatsApp', tipo: 'otro', puntuacion: 95, veredicto: 'descartado' },
          { nombre: 'Taller Uno', tipo: 'establecido', puntuacion: 70, resenas: 80 },
          { nombre: 'Centro Oficial', tipo: 'OFICIAL', puntuacion: '91', calificacion: '4,7' },
          { nombre: 'Taller Dos', tipo: 'raro', puntuacion: 70, resenas: 200 },
          { nombre: 'Malo', liga: 'javascript:alert(1)', puntuacion: 400 },
          { tipo: 'oficial' }, // sin nombre: fuera
        ],
      },
      KINDS,
    );
    expect(note).toBe('Busqué en Puebla');
    expect(results.map((r) => r.name)).toEqual([
      'Malo',
      'Centro Oficial',
      'Taller Dos',
      'Taller Uno',
      'Barato WhatsApp',
    ]);
    const malo = results[0];
    expect(malo.score).toBe(100);
    expect(malo.link).toBeUndefined();
    expect(results[1]).toMatchObject({ kind: 'oficial', rating: 4.7, id: 'centro-oficial' });
    expect(results[2].kind).toBe('otro'); // un tipo desconocido cae en el último
  });

  it('da ids estables aunque se repita el nombre', () => {
    const { results } = readResults(
      { resultados: [{ nombre: 'Servicio Ñandú' }, { nombre: 'Servicio Ñandú' }] },
      KINDS,
    );
    expect(results.map((r) => r.id).sort()).toEqual(['servicio-nandu', 'servicio-nandu-2']);
  });

  it('reconoce "dudoso" en cualquier mayúscula y lo ordena entre recomendados y descartados', () => {
    const { results } = readResults(
      {
        resultados: [
          { nombre: 'Descartado', puntuacion: 99, veredicto: 'descartado' },
          { nombre: 'Dudoso bajo', puntuacion: 40, veredicto: 'Dudoso' },
          { nombre: 'Dudoso alto', puntuacion: 75, veredicto: 'DUDOSO' },
          { nombre: 'Recomendado', puntuacion: 61, veredicto: 'recomendado' },
        ],
      },
      KINDS,
    );
    expect(results.map((r) => [r.name, r.verdict])).toEqual([
      ['Recomendado', 'recomendado'],
      ['Dudoso alto', 'dudoso'],
      ['Dudoso bajo', 'dudoso'],
      ['Descartado', 'descartado'],
    ]);
  });

  it('con minRecommended, un recomendado de menos pasa a dudoso; sin él (Directorio) no cambia', () => {
    const file = {
      resultados: [
        { nombre: 'Justo', puntuacion: 60, veredicto: 'recomendado' },
        { nombre: 'Casi', puntuacion: 59, veredicto: 'recomendado' },
        { nombre: 'Sin veredicto', puntuacion: 10 },
        { nombre: 'Malo', puntuacion: 5, veredicto: 'descartado' },
      ],
    };
    const verdicts = (min?: number) =>
      Object.fromEntries(readResults(file, KINDS, min).results.map((r) => [r.name, r.verdict]));
    expect(verdicts(60)).toEqual({
      Justo: 'recomendado',
      Casi: 'dudoso',
      'Sin veredicto': 'dudoso',
      Malo: 'descartado',
    });
    expect(verdicts()).toEqual({
      Justo: 'recomendado',
      Casi: 'recomendado',
      'Sin veredicto': 'recomendado',
      Malo: 'descartado',
    });
  });

  it('la nota general guarda los saltos de renglón (pocos) y se recorta', () => {
    const { note } = readResults(
      { nota: 'Primero\r\nSegundo\u0007 dato\n\n\n\nTercero', resultados: [] },
      KINDS,
    );
    expect(note).toBe('Primero\nSegundo  dato\n\nTercero');
    const long = readResults({ nota: 'x'.repeat(5000) }, KINDS).note ?? '';
    expect(long.length).toBe(1500);
    const lines = readResults({ nota: Array(40).fill('r').join('\n') }, KINDS).note ?? '';
    expect(lines.split('\n')).toHaveLength(12);
  });

  it('solo deja ligas http(s)', () => {
    expect(safeLink('https://ejemplo.mx/x')).toBe('https://ejemplo.mx/x');
    expect(safeLink('file:///C:/x')).toBeUndefined();
    expect(safeLink('no es liga')).toBeUndefined();
    expect(safeLink('https://usuario:clave@ejemplo.mx/x')).toBeUndefined();
    expect(safeLink('https://ejemplo.mx@otro.example/x')).toBeUndefined();
  });

  it('quita caracteres invisibles y de dirección, y U+2028 cuenta como renglón', () => {
    const got = readResults(
      {
        nota: 'uno\u2028dos',
        resultados: [{ nombre: 'Tra\u202ebajo\u200b', porque: 'a\u2066b', puntuacion: 70 }],
      },
      KINDS,
    );
    expect(got.note).toBe('uno\ndos');
    expect(got.results[0]!.name).toBe('Tra bajo');
    expect(got.results[0]!.why).toBe('a b');
  });
});

describe('criterios', () => {
  it('usa los de fábrica sin escribir nada, y guarda los del panel con claves en español', () => {
    const file = path.join(tmp, 'sala.json');
    const store = createCriteriaStore(file, SETS);
    expect(store.read()).toEqual(SETS);
    expect(fs.existsSync(file)).toBe(false);
    const saved = store.save([
      { id: 'tecnicos', label: 'Técnicos', rules: ['  Oficial primero ', ''] },
      { label: 'Doctores Ñ', rules: ['Cédula'] },
      { label: 'Vacío', rules: [] },
    ]);
    expect(saved?.map((s) => s.id)).toEqual(['tecnicos', 'doctores-n']);
    const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(disk.criterios[0]).toEqual({
      id: 'tecnicos',
      nombre: 'Técnicos',
      reglas: ['Oficial primero'],
    });
    expect(store.read()).toHaveLength(2);
  });

  it('rechaza una lista sin nada válido', () => {
    expect(cleanCriteria('x')).toEqual([]);
    expect(createCriteriaStore(path.join(tmp, 'c.json'), SETS).save([{ label: '' }])).toBeNull();
  });
});

function room(launcher?: Parameters<typeof createSearchRoom>[0]['launcher']) {
  let n = 0;
  return createSearchRoom({
    room: 'sala',
    label: 'Sala',
    dir: path.join(tmp, 'sala'),
    criteria: createCriteriaStore(path.join(tmp, 'sala.json'), SETS),
    kinds: KINDS,
    brief: (req, set, p) => `# ${req.text}\n${set?.label}\n${p.resultsFile}`,
    launcher,
    now: () => new Date(2026, 10, 3, 9).getTime(),
    pollMs: 60_000,
    newId: () => `abc12${n++}`,
  });
}

describe('createSearchRoom', () => {
  it('guarda el pedido con su encargo y lee los resultados que deja el agente', () => {
    const r = room();
    const id = r.create({
      text: 'Reparar refrigerador',
      place: 'Puebla',
      when: 'esta semana',
    });
    expect(id).toBe('abc120');
    const brief = fs.readFileSync(path.join(tmp, 'sala', 'pedidos', 'abc120.md'), 'utf8');
    expect(brief).toContain('Reparar refrigerador');
    expect(brief).toContain('Técnicos');
    let status = r.statusParts();
    expect(status.requests[0]).toMatchObject({ state: 'nuevo', place: 'Puebla', results: [] });
    expect(status.requests[0].brief).toBe(
      briefLine(`${path.join(tmp, 'sala').replace(/\\/g, '/')}/pedidos/abc120.md`),
    );
    expect(status.requests[0].brief).not.toContain('\n');

    fs.writeFileSync(
      path.join(tmp, 'sala', 'resultados', 'abc120.json'),
      JSON.stringify({
        pedido: 'abc120',
        resultados: [{ nombre: 'Centro Oficial', tipo: 'oficial', puntuacion: 90 }],
      }),
    );
    r.poll();
    status = r.statusParts();
    expect(status.requests[0].state).toBe('listo');
    expect(status.requests[0].results[0].name).toBe('Centro Oficial');

    expect(r.mark({ requestId: id, resultId: 'centro-oficial', mark: 'contactado' })).toBe(true);
    expect(r.mark({ requestId: id, resultId: 'centro-oficial', mark: 'agendado' })).toBe(false);
    expect(r.statusParts().requests[0].results[0].mark).toBe('contactado');
    r.dispose();

    // Survives a restart (estado.json)
    const again = room();
    expect(again.statusParts().requests[0]).toMatchObject({ id: 'abc120', state: 'listo' });
    expect(again.statusParts().requests[0].results[0].mark).toBe('contactado');
    again.remove('abc120');
    expect(again.statusParts().requests).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'sala', 'resultados', 'abc120.json'))).toBe(false);
    again.dispose();
  });

  it('ignora resultados de otro pedido y mensajes de otro cuarto', () => {
    const r = room();
    const id = r.create({ text: 'Algo' }) as string;
    fs.writeFileSync(
      path.join(tmp, 'sala', 'resultados', `${id}.json`),
      JSON.stringify({ pedido: 'otro', resultados: [{ nombre: 'X' }] }),
    );
    r.poll();
    expect(r.statusParts().requests[0].state).toBe('nuevo');
    expect(r.handleMessage({ type: 'deleteSearchRequest', room: 'freelance', id })).toBe(false);
    expect(r.statusParts().requests).toHaveLength(1);
    r.dispose();
  });

  it('lanza el agente con el encargo de una línea y su carpeta, y recuerda si espera', async () => {
    const calls: unknown[] = [];
    let ready = false;
    const r = room({
      check: async () => ({ available: true }),
      launch: async (o) => {
        calls.push(o);
        return { agent: o.agent ?? o.name, ready };
      },
    });
    const id = r.create({ text: 'Doctor' }) as string;
    await r.launch(id);
    expect(calls[0]).toMatchObject({
      name: 'sala-abc120',
      label: 'Sala',
      cwd: path.join(tmp, 'sala'),
    });
    expect((calls[0] as { prompt: string }).prompt).toMatch(
      /^Lee el encargo en .*pedidos\/abc120\.md/,
    );
    expect(r.statusParts().requests[0].state).toBe('esperando');
    ready = true;
    await r.launch(id);
    expect(calls[1]).toMatchObject({ agent: 'sala-abc120' });
    expect(r.statusParts().requests[0].state).toBe('buscando');
    r.dispose();
  });

  it('si no se puede lanzar, queda en error con el porqué', async () => {
    const r = room({
      check: async () => ({ available: true }),
      launch: async () => {
        throw new Error('herdr cerrado');
      },
    });
    const id = r.create({ text: 'Doctor' }) as string;
    await r.launch(id);
    const req = r.statusParts().requests[0];
    expect(req.state).toBe('error');
    expect(req.note).toContain('herdr cerrado');
    r.dispose();
  });
});

describe('herdr', () => {
  it('abre una pestaña, arranca Claude sin saltarse permisos y le da el encargo', async () => {
    const calls: string[][] = [];
    const exec: HerdrExec = async (args) => {
      calls.push(args);
      if (args[0] === 'tab') return JSON.stringify({ result: { root_pane: { pane_id: 'w1:p9' } } });
      return '{}';
    };
    const got = await createHerdrLauncher(exec).launch({
      name: 'sala-abc',
      label: 'Sala',
      cwd: 'C:/x/sala',
      prompt: 'Lee el encargo en C:/x/sala/pedidos/abc.md y síguelo paso a paso.',
    });
    expect(got).toEqual({ agent: 'sala-abc', ready: true });
    expect(calls[0]).toEqual([
      'tab',
      'create',
      '--cwd',
      'C:/x/sala',
      '--label',
      'Sala',
      '--no-focus',
    ]);
    expect(calls[1].slice(0, 6)).toEqual([
      'agent',
      'start',
      'sala-abc',
      '--kind',
      'claude',
      '--pane',
    ]);
    expect(calls[1]).toContain('w1:p9');
    expect(calls[2]).toEqual([
      'agent',
      'prompt',
      'sala-abc',
      expect.stringContaining('Lee el encargo'),
    ]);
    expect(calls.flat().join(' ')).not.toContain('dangerously');
  });

  it('si Claude espera al dueño, lo dice en vez de fallar', async () => {
    const exec: HerdrExec = async (args) => {
      if (args[0] === 'tab') return JSON.stringify({ result: { root_pane: { pane_id: 'w1:p2' } } });
      if (args[1] === 'start') throw new Error('{"error":"agent_not_ready"}');
      return '{}';
    };
    const got = await createHerdrLauncher(exec).launch({
      name: 'a',
      label: 'S',
      cwd: '.',
      prompt: 'p',
    });
    expect(got.ready).toBe(false);
  });

  it('el camino normal no abre plan B ni cierra la pestaña', async () => {
    const calls: string[][] = [];
    const exec: HerdrExec = async (args) => {
      calls.push(args);
      if (args[0] === 'tab')
        return JSON.stringify({
          result: { tab: { tab_id: 'w1:t9' }, root_pane: { pane_id: 'w1:p9' } },
        });
      return '{}';
    };
    await createHerdrLauncher(exec).launch({ name: 'a', label: 'S', cwd: '.', prompt: 'p' });
    expect(calls.map((c) => `${c[0]} ${c[1]}`)).toEqual([
      'tab create',
      'agent start',
      'agent prompt',
    ]);
  });

  it('sin herdr no está disponible', async () => {
    const exec: HerdrExec = async () => {
      throw Object.assign(new Error('no'), { code: 'ENOENT' });
    };
    expect(await createHerdrLauncher(exec).check()).toMatchObject({ available: false });
    expect(paneIdOf('no json')).toBeNull();
  });
});

describe('herdr: plan B cuando agent start no ve el shell libre', () => {
  const BUSY =
    '{"error":{"code":"agent_pane_busy","message":"agent target pane w1:p7 is not an available shell"}}';
  const TAB = JSON.stringify({
    result: { tab: { tab_id: 'w1:t7' }, root_pane: { pane_id: 'w1:p7' } },
  });
  const agentIs = (status: string) =>
    JSON.stringify({ result: { agent: { pane_id: 'w1:p7', agent_status: status } } });

  /** A herdr double: answers per subcommand; `wait` answers in order (an Error is thrown). */
  function herdr(
    waits: (string | Error)[] = [agentIs('working')],
    extra: Record<string, string | Error> = {},
  ) {
    const calls: string[][] = [];
    const exec: HerdrExec = async (args) => {
      calls.push(args);
      const key = `${args[0]} ${args[1]}`;
      if (key in extra) {
        const v = extra[key];
        if (v instanceof Error) throw v;
        return v;
      }
      if (key === 'tab create') return TAB;
      if (key === 'agent start') throw new Error(BUSY);
      if (key === 'agent wait') {
        const next = waits.shift() ?? new Error('timeout');
        if (next instanceof Error) throw next;
        return next;
      }
      return '{}';
    };
    return { calls, exec };
  }
  const open = {
    name: 'freelance-abc',
    label: 'Freelance',
    cwd: 'C:/Users/Ana María/.pixel-agents/freelance',
    prompt:
      'Lee el encargo en C:/Users/Ana María/.pixel-agents/freelance/pedidos/abc.md y síguelo paso a paso.',
  };
  const instant = { sleep: async () => {} };

  it('escribe claude con el encargo en el mismo panel y espera a verlo trabajando', async () => {
    const { calls, exec } = herdr();
    const got = await createHerdrLauncher(exec, Date.now, instant).launch(open);
    expect(got).toEqual({ agent: 'w1:p7', ready: true });
    const run = calls.find((c) => c[0] === 'pane' && c[1] === 'run');
    expect(run).toEqual(['pane', 'run', 'w1:p7', `claude '${open.prompt}'`]);
    expect(calls.find((c) => c[1] === 'wait')).toEqual([
      'agent',
      'wait',
      'w1:p7',
      '--until',
      'working',
      '--until',
      'blocked',
      '--timeout',
      expect.stringMatching(/^\d+$/),
    ]);
    expect(calls.some((c) => c[1] === 'close')).toBe(false);
    expect(calls.flat().join(' ')).not.toContain('dangerously');
  });

  it('con modelo: claude --model X; un modelo raro no pasa', async () => {
    const a = herdr();
    await createHerdrLauncher(a.exec, Date.now, { ...instant, model: () => 'sonnet' }).launch(open);
    expect(a.calls.find((c) => c[1] === 'run')?.[3]).toBe(`claude --model sonnet '${open.prompt}'`);
    const b = herdr();
    await createHerdrLauncher(b.exec, Date.now, { ...instant, model: () => "x'; rm -rf ~" }).launch(
      open,
    );
    expect(b.calls.find((c) => c[1] === 'run')?.[3]).toBe(`claude '${open.prompt}'`);
  });

  it('paneRunCommand: comillas sencillas y renglones no se escriben en la terminal', () => {
    expect(paneRunCommand('Lee C:\\x y\\a.md', undefined)).toBe("claude 'Lee C:\\x y\\a.md'");
    expect(paneRunCommand('a $(rm -rf ~) `b` "c"', 'opus')).toBe(
      `claude --model opus 'a $(rm -rf ~) \`b\` "c"'`,
    );
    expect(() => paneRunCommand("Lee O'Brien", undefined)).toThrow();
    expect(() => paneRunCommand('uno\ndos', undefined)).toThrow();
    expect(() => paneRunCommand('   ', undefined)).toThrow();
  });

  it('si Claude pregunta algo al arrancar, espera al dueño y no le repite el encargo', async () => {
    const { calls, exec } = herdr([agentIs('blocked')], { 'agent get': agentIs('working') });
    const launcher = createHerdrLauncher(exec, Date.now, instant);
    const got = await launcher.launch(open);
    expect(got).toMatchObject({ agent: 'w1:p7', ready: false });
    expect(got.detail).toContain('confías');
    // "Mandar encargo" after answering: Claude already works on it, so nothing is typed again.
    calls.length = 0;
    expect(await launcher.launch({ ...open, agent: 'w1:p7' })).toEqual({
      agent: 'w1:p7',
      ready: true,
    });
    expect(calls.map((c) => `${c[0]} ${c[1]}`)).toEqual(['agent get']);
  });

  it('reintenta agent wait mientras Claude todavía no aparece en el panel', async () => {
    const { calls, exec } = herdr([new Error('agent_not_found'), agentIs('working')]);
    const got = await createHerdrLauncher(exec, Date.now, instant).launch(open);
    expect(got.ready).toBe(true);
    expect(calls.filter((c) => c[1] === 'wait')).toHaveLength(2);
  });

  it('si nada funcionó, cierra solo la pestaña que abrió y dice por qué', async () => {
    let t = 0;
    const { calls, exec } = herdr([]); // every wait fails
    const launcher = createHerdrLauncher(exec, () => t, {
      sleep: async (ms) => {
        t += ms * 30; // the clock runs out after a couple of tries
      },
    });
    await expect(launcher.launch(open)).rejects.toThrow();
    expect(calls.filter((c) => c[1] === 'close')).toEqual([['tab', 'close', 'w1:t7']]);

    const failRun = herdr([], { 'pane run': new Error('pane gone') });
    await expect(createHerdrLauncher(failRun.exec, Date.now, instant).launch(open)).rejects.toThrow(
      'pane gone',
    );
    expect(failRun.calls.at(-1)).toEqual(['tab', 'close', 'w1:t7']);

    // Another start error (not "busy") is not retried with pane run, but the tab is closed too.
    const other = herdr([], { 'agent start': new Error('kaboom') });
    await expect(createHerdrLauncher(other.exec, Date.now, instant).launch(open)).rejects.toThrow(
      'kaboom',
    );
    expect(other.calls.some((c) => c[1] === 'run')).toBe(false);
    expect(other.calls.at(-1)).toEqual(['tab', 'close', 'w1:t7']);
  });

  it('un encargo con comilla sencilla no se escribe: cierra la pestaña', async () => {
    const { calls, exec } = herdr();
    await expect(
      createHerdrLauncher(exec, Date.now, instant).launch({ ...open, prompt: "Lee O'Brien" }),
    ).rejects.toThrow('caracteres');
    expect(calls.some((c) => c[1] === 'run')).toBe(false);
    expect(calls.at(-1)).toEqual(['tab', 'close', 'w1:t7']);
  });

  it('tabIdOf y agentStatusOf leen lo que herdr devuelve', () => {
    expect(tabIdOf(TAB)).toBe('w1:t7');
    expect(tabIdOf('{}')).toBeNull();
    expect(agentStatusOf(agentIs('blocked'))).toBe('blocked');
    expect(agentStatusOf('nope')).toBeNull();
  });
});
