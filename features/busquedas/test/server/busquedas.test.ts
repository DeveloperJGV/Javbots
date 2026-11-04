import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cleanCriteria, createCriteriaStore } from '../../server/criteria.js';
import { createHerdrLauncher, type HerdrExec, paneIdOf } from '../../server/herdrLauncher.js';
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

  it('solo deja ligas http(s)', () => {
    expect(safeLink('https://ejemplo.mx/x')).toBe('https://ejemplo.mx/x');
    expect(safeLink('file:///C:/x')).toBeUndefined();
    expect(safeLink('no es liga')).toBeUndefined();
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

  it('sin herdr no está disponible', async () => {
    const exec: HerdrExec = async () => {
      throw Object.assign(new Error('no'), { code: 'ENOENT' });
    };
    expect(await createHerdrLauncher(exec).check()).toMatchObject({ available: false });
    expect(paneIdOf('no json')).toBeNull();
  });
});
