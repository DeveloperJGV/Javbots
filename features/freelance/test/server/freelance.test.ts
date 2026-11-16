import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FreelanceStatus, SearchRoomStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import {
  type AgentLauncher,
  createHerdrLauncher,
  type HerdrExec,
  modelArgs,
} from '../../../busquedas/server/herdrLauncher.js';
import { readDetails, readResults } from '../../../busquedas/server/searchRoom.js';
import { FREELANCE_KINDS, FREELANCE_MIN_RECOMMENDED } from '../../server/constants.js';
import { FREELANCE_DEFAULT_CRITERIA, FREELANCE_DEFAULT_OFFER } from '../../server/defaults.js';
import { createFreelanceFeature } from '../../server/freelanceFeature.js';
import { offerFromWire, offerToWire } from '../../server/offer.js';

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'freelance-'));
  fs.writeFileSync(path.join(tmp, 'SKILL.md'), '# Skill de prueba\nSolo páginas públicas.');
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A launcher double: records what it was asked, never opens anything. */
function fakeLauncher(available = true) {
  const launches: Parameters<AgentLauncher['launch']>[0][] = [];
  const launcher: AgentLauncher = {
    check: async () => ({ available }),
    launch: async (o) => {
      launches.push(o);
      return { agent: o.name, ready: true };
    },
  };
  return { launcher, launches };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function setup(launcher: AgentLauncher | false = fakeLauncher().launcher) {
  const feature = createFreelanceFeature({
    home: tmp,
    skillFile: path.join(tmp, 'SKILL.md'),
    launcher,
    pollMs: 60_000,
  });
  const sent: Record<string, unknown>[] = [];
  const client: FeatureClient = { privileged: true, send: (m) => sent.push(m) };
  feature.connect?.(client);
  const lastOf = <T>(type: string) => sent.filter((m) => m.type === type).pop() as T;
  return {
    feature,
    client,
    sent,
    room: () => lastOf<SearchRoomStatus>('searchRoomStatus'),
    offer: () => lastOf<FreelanceStatus>('freelanceStatus'),
  };
}

const config = () =>
  JSON.parse(fs.readFileSync(path.join(tmp, 'freelance.json'), 'utf8')) as Record<string, unknown>;

describe('Freelance', () => {
  it('al conectar manda el cuarto (criterios de fábrica) y la oferta de ejemplo marcada como ejemplo', () => {
    const { feature, client, room, offer } = setup();
    feature.handleClientMessage?.({ type: 'webviewReady' }, client);
    expect(room()).toMatchObject({ type: 'searchRoomStatus', room: 'freelance' });
    expect(room().criteria.map((c) => c.id)).toEqual(FREELANCE_DEFAULT_CRITERIA.map((c) => c.id));
    expect(offer()).toEqual({
      type: 'freelanceStatus',
      offer: offerToWire(FREELANCE_DEFAULT_OFFER),
      offerIsExample: true,
      model: 'sonnet',
    });
    expect(fs.existsSync(path.join(tmp, 'freelance.json'))).toBe(false);
    feature.dispose?.();
  });

  it('una página sin token no ve ni cambia nada', () => {
    const { feature } = setup();
    const sent: unknown[] = [];
    const guest: FeatureClient = { privileged: false, send: (m) => sent.push(m) };
    feature.connect?.(guest);
    expect(feature.handleClientMessage?.({ type: 'webviewReady' }, guest)).toBe(false);
    expect(
      feature.handleClientMessage?.(
        { type: 'saveFreelanceOffer', offer: offerToWire(FREELANCE_DEFAULT_OFFER) },
        guest,
      ),
    ).toBe(false);
    expect(sent).toEqual([]);
    expect(fs.existsSync(path.join(tmp, 'freelance.json'))).toBe(false);
    feature.dispose?.();
  });

  it('guardar la oferta la escribe en freelance.json con claves en español, sin borrar criterios ni modelo', () => {
    const { feature, client, offer, room } = setup();
    fs.writeFileSync(
      path.join(tmp, 'freelance.json'),
      JSON.stringify({
        modelo: 'opus',
        criterios: [{ id: 'mios', nombre: 'Míos', reglas: ['Uno'] }],
      }),
    );
    feature.handleClientMessage?.(
      {
        type: 'saveFreelanceOffer',
        offer: {
          title: '  Apps Android  ',
          services: ['Apps de cero', '', 'Mejoras'],
          technologies: ['Kotlin'],
          rate: 'desde 30 USD/h',
          availability: 'remoto',
          languages: ['Español'],
          notWanted: ['Trabajo gratis'],
        },
      },
      client,
    );
    expect(offer()).toMatchObject({ offerIsExample: false, model: 'opus' });
    expect(offer().offer.title).toBe('Apps Android');
    expect(offer().offer.services).toEqual(['Apps de cero', 'Mejoras']);
    const file = config();
    expect(file.modelo).toBe('opus');
    expect(file.criterios).toEqual([{ id: 'mios', nombre: 'Míos', reglas: ['Uno'] }]);
    expect(file.oferta).toMatchObject({ titulo: 'Apps Android', tarifa: 'desde 30 USD/h' });
    // and the criteria editor keeps the offer in turn
    feature.handleClientMessage?.(
      {
        type: 'saveSearchCriteria',
        room: 'freelance',
        criteria: [{ id: 'otros', label: 'Otros', rules: ['Dos'] }],
      },
      client,
    );
    expect(room().criteria.map((c) => c.id)).toEqual(['otros']);
    expect(config().oferta).toMatchObject({ titulo: 'Apps Android' });
    feature.dispose?.();
  });

  it('una oferta vacía no se guarda; la de ejemplo guardada tal cual sigue siendo ejemplo', () => {
    const { feature, client, offer } = setup();
    expect(offerFromWire({ title: ' ', services: [] })).toBeNull();
    feature.handleClientMessage?.(
      { type: 'saveFreelanceOffer', offer: { title: '', services: [] } },
      client,
    );
    expect(fs.existsSync(path.join(tmp, 'freelance.json'))).toBe(false);
    feature.handleClientMessage?.(
      { type: 'saveFreelanceOffer', offer: offerToWire(FREELANCE_DEFAULT_OFFER) },
      client,
    );
    expect(offer().offerIsExample).toBe(true);
    feature.dispose?.();
  });

  it('la oferta de ejemplo guardada antes de que existiera "desde" sigue siendo ejemplo', () => {
    const old: Record<string, unknown> = { ...FREELANCE_DEFAULT_OFFER };
    delete old.desde;
    fs.writeFileSync(path.join(tmp, 'freelance.json'), JSON.stringify({ oferta: old }));
    const { feature, client, offer } = setup();
    feature.handleClientMessage?.({ type: 'webviewReady' }, client);
    expect(offer().offer.basedIn).toBe('');
    expect(offer().offerIsExample).toBe(true);
    feature.dispose?.();
  });

  it('el encargo lleva el pedido, la oferta, los criterios en orden, la entrega y la skill', () => {
    const { feature, client, room } = setup();
    feature.handleClientMessage?.(
      {
        type: 'createSearchRequest',
        room: 'freelance',
        text: 'Proyectos de apps Android, remoto, 500 USD o más',
        criteriaId: 'largo-plazo',
      },
      client,
    );
    const req = room().requests[0];
    expect(req.state).toBe('nuevo');
    const brief = fs.readFileSync(path.join(tmp, 'freelance', 'pedidos', `${req.id}.md`), 'utf8');
    expect(brief).toContain('Proyectos de apps Android, remoto, 500 USD o más');
    expect(brief).toContain(FREELANCE_DEFAULT_OFFER.titulo);
    expect(brief).toContain('oferta de ejemplo');
    expect(brief).toContain(`1. ${FREELANCE_DEFAULT_CRITERIA[1].rules[0]}`);
    expect(brief).toContain(`freelance/resultados/${req.id}.json`);
    expect(brief).toContain('`directo`, `plataforma`, `otro`');
    expect(brief).toContain('"detalles"');
    expect(brief).toContain('Solo páginas públicas.');
    expect(brief).toMatch(/nunca te registras/);
    feature.dispose?.();
  });

  it('Buscar lanza el agente en la carpeta del cuarto con la pestaña Freelance', async () => {
    const fake = fakeLauncher();
    const { feature, client, room } = setup(fake.launcher);
    feature.handleClientMessage?.(
      { type: 'createSearchRequest', room: 'freelance', text: 'Apps', criteriaId: 'proyectos' },
      client,
    );
    const id = room().requests[0].id;
    feature.handleClientMessage?.({ type: 'launchSearchAgent', room: 'freelance', id }, client);
    await flush();
    expect(fake.launches[0]).toMatchObject({
      label: 'Freelance',
      cwd: path.join(tmp, 'freelance'),
      prompt: expect.stringContaining(`pedidos/${id}.md`),
    });
    expect(room().requests[0].state).toBe('buscando');
    feature.dispose?.();
  });

  it('lee los resultados con detalles y nota, ordenados, y Postulé usa la marca común', () => {
    const { feature, client, room } = setup();
    feature.handleClientMessage?.(
      { type: 'createSearchRequest', room: 'freelance', text: 'Apps', criteriaId: 'proyectos' },
      client,
    );
    const id = room().requests[0].id;
    fs.writeFileSync(
      path.join(tmp, 'freelance', 'resultados', `${id}.json`),
      JSON.stringify({
        pedido: id,
        resultados: [
          { nombre: 'Estafa', tipo: 'otro', puntuacion: 5, veredicto: 'descartado' },
          {
            nombre: 'App de entregas',
            tipo: 'plataforma',
            liga: 'https://ejemplo.com/a',
            puntuacion: 70,
            nota: 'No verificado sin cuenta',
            detalles: [{ etiqueta: 'Pago', valor: '800 USD, precio fijo' }],
          },
          { nombre: 'Empresa directa', tipo: 'directo', puntuacion: 88, calificacion: 4 },
        ],
      }),
    );
    feature.room.poll();
    const results = room().requests[0].results;
    expect(results.map((r) => r.name)).toEqual(['Empresa directa', 'App de entregas', 'Estafa']);
    expect(results[1]).toMatchObject({
      kind: 'plataforma',
      note: 'No verificado sin cuenta',
      details: [{ label: 'Pago', value: '800 USD, precio fijo' }],
    });
    feature.handleClientMessage?.(
      {
        type: 'markSearchResult',
        room: 'freelance',
        requestId: id,
        resultId: results[0].id,
        mark: 'contactado',
      },
      client,
    );
    expect(room().requests[0].results[0].mark).toBe('contactado');
    feature.dispose?.();
  });

  it('"desde": ida y vuelta panel ↔ archivo ↔ encargo; un archivo viejo sin "desde" sigue sirviendo', () => {
    const { feature, client, offer, room } = setup();
    feature.handleClientMessage?.(
      {
        type: 'saveFreelanceOffer',
        offer: {
          ...offerToWire(FREELANCE_DEFAULT_OFFER),
          title: 'Apps',
          basedIn: '  País de ejemplo (UTC-6),\nremoto  ',
        },
      },
      client,
    );
    expect(config().oferta).toMatchObject({ desde: 'País de ejemplo (UTC-6), remoto' });
    expect(offer().offer.basedIn).toBe('País de ejemplo (UTC-6), remoto');
    feature.handleClientMessage?.(
      { type: 'createSearchRequest', room: 'freelance', text: 'Apps', criteriaId: 'proyectos' },
      client,
    );
    const id = room().requests[0].id;
    const brief = fs.readFileSync(path.join(tmp, 'freelance', 'pedidos', `${id}.md`), 'utf8');
    expect(brief).toContain('**Desde dónde trabaja:** País de ejemplo (UTC-6), remoto');
    expect(brief).toMatch(/descarta los anuncios que no acepten ese país/);
    feature.dispose?.();

    // an old file, written before "desde" existed
    fs.writeFileSync(
      path.join(tmp, 'freelance.json'),
      JSON.stringify({ oferta: { titulo: 'Viejo', servicios: ['Web'] } }),
    );
    const old = setup();
    old.feature.handleClientMessage?.({ type: 'webviewReady' }, old.client);
    expect(old.offer().offer).toMatchObject({ title: 'Viejo', basedIn: '' });
    expect(old.offer().offerIsExample).toBe(false);
    old.feature.handleClientMessage?.(
      { type: 'createSearchRequest', room: 'freelance', text: 'Web', criteriaId: 'proyectos' },
      old.client,
    );
    const oldId = old.room().requests[0].id;
    const oldBrief = fs.readFileSync(path.join(tmp, 'freelance', 'pedidos', `${oldId}.md`), 'utf8');
    expect(oldBrief).toContain('**Desde dónde trabaja:** (no lo dijo)');
    expect(offerFromWire({ title: 'Sin desde', services: [] })?.desde).toBe('');
    old.feature.dispose?.();
  });

  it('la oferta de fábrica trae un "desde" de ejemplo y hay cinco juegos de criterios', () => {
    expect(FREELANCE_DEFAULT_OFFER.desde).toMatch(/^Ejemplo: /);
    expect(FREELANCE_DEFAULT_CRITERIA.map((c) => c.id)).toEqual([
      'proyectos',
      'largo-plazo',
      'directos',
      'automatizacion',
      'consultoria',
    ]);
    for (const set of FREELANCE_DEFAULT_CRITERIA) {
      expect(set.label.length).toBeGreaterThan(0);
      expect(set.rules.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('el encargo pide varias consultas y explica los tres veredictos con el mínimo de 60', () => {
    const { feature, client, room } = setup();
    feature.handleClientMessage?.(
      {
        type: 'createSearchRequest',
        room: 'freelance',
        text: 'Apps',
        criteriaId: 'automatizacion',
      },
      client,
    );
    const id = room().requests[0].id;
    const brief = fs.readFileSync(path.join(tmp, 'freelance', 'pedidos', `${id}.md`), 'utf8');
    expect(brief).toContain('## Cómo buscar');
    expect(brief).toMatch(/\*\*varias\*\* consultas/);
    expect(brief).toMatch(/en inglés y en español/);
    expect(brief).toContain('"Dónde buscar"');
    expect(brief).toContain(`recomendado\` es solo de ${FREELANCE_MIN_RECOMMENDED}`);
    expect(brief).toContain('"veredicto": "recomendado | dudoso | descartado"');
    expect(brief).toContain(`1. ${FREELANCE_DEFAULT_CRITERIA[3].rules[0]}`);
    feature.dispose?.();
  });

  it('un "recomendado" de menos de 60 llega al panel como dudoso', () => {
    const { feature, client, room } = setup();
    feature.handleClientMessage?.(
      { type: 'createSearchRequest', room: 'freelance', text: 'Apps', criteriaId: 'proyectos' },
      client,
    );
    const id = room().requests[0].id;
    fs.writeFileSync(
      path.join(tmp, 'freelance', 'resultados', `${id}.json`),
      JSON.stringify({
        pedido: id,
        nota: 'Upwork pide sesión.\nTe dejo las ligas armadas.',
        resultados: [
          { nombre: 'Bajo', puntuacion: 59, veredicto: 'recomendado' },
          { nombre: 'Bueno', puntuacion: 60, veredicto: 'recomendado' },
        ],
      }),
    );
    feature.room.poll();
    const req = room().requests[0];
    expect(req.results.map((r) => [r.name, r.verdict])).toEqual([
      ['Bueno', 'recomendado'],
      ['Bajo', 'dudoso'],
    ]);
    expect(req.resultsNote).toBe('Upwork pide sesión.\nTe dejo las ligas armadas.');
    feature.dispose?.();
  });

  it('reporta herdr y Claude Code en Conexiones, con el modelo', async () => {
    const { feature, client } = setup(fakeLauncher(true).launcher);
    expect(feature.connections().map((c) => [c.id, c.state])).toEqual([
      ['freelance-herdr', 'off'],
      ['freelance-claude', 'off'],
    ]);
    feature.handleClientMessage?.({ type: 'webviewReady' }, client);
    await flush();
    const [herdr, claude] = feature.connections();
    expect(herdr).toMatchObject({ state: 'ok', feature: 'Freelance' });
    expect(claude).toMatchObject({ state: 'ok', detail: 'Modelo: sonnet' });
    feature.dispose?.();
    const off = setup(fakeLauncher(false).launcher);
    off.feature.handleClientMessage?.({ type: 'webviewReady' }, off.client);
    await flush();
    expect(off.feature.connections()[0].state).toBe('warn');
    off.feature.dispose?.();
  });
});

describe('Pieza común: detalles y modelo', () => {
  it('detalles: a lo más 6, recortados, sin los incompletos; el Directorio sin detalles no cambia', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      etiqueta: `E${i}`,
      valor: 'v'.repeat(500),
    }));
    const details = readDetails([{ etiqueta: 'Sin valor' }, 'raro', ...many]);
    expect(details).toHaveLength(6);
    expect(details[0].label).toBe('E0');
    expect(details[0].value.length).toBeLessThanOrEqual(160);
    const { results } = readResults(
      { resultados: [{ nombre: 'Taller', tipo: 'oficial', puntuacion: 80 }] },
      ['oficial', 'otro'],
    );
    expect(results[0]).not.toHaveProperty('details');
    expect(results[0]).not.toHaveProperty('note');
    const typed = readResults({ resultados: [{ nombre: 'X', tipo: 'raro' }] }, FREELANCE_KINDS)
      .results[0];
    expect(typed.kind).toBe('otro');
  });

  it('el modelo va después de "--" al arrancar; sin modelo o raro, nada', async () => {
    expect(modelArgs('sonnet')).toEqual(['--', '--model', 'sonnet']);
    expect(modelArgs('')).toEqual([]);
    expect(modelArgs(undefined)).toEqual([]);
    expect(modelArgs('sonnet; rm -rf /')).toEqual([]);
    expect(modelArgs('--dangerously-skip-permissions')).toEqual([]);
    const calls: string[][] = [];
    const exec: HerdrExec = async (args) => {
      calls.push(args);
      if (args[0] === 'tab') return JSON.stringify({ result: { root_pane: { pane_id: 'w1:p3' } } });
      return '{}';
    };
    const open = { name: 'f-1', label: 'Freelance', cwd: '.', prompt: 'p' };
    await createHerdrLauncher(exec, Date.now, { model: () => 'opus' }).launch(open);
    const start = calls.find((c) => c[1] === 'start') ?? [];
    expect(start.slice(-3)).toEqual(['--', '--model', 'opus']);
    calls.length = 0;
    await createHerdrLauncher(exec).launch(open);
    expect(calls.find((c) => c[1] === 'start')).not.toContain('--model');
  });
});
