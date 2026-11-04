import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SearchRoomStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import type { GoogleSession } from '../../../google/server/googleFeature.js';
import { DEFAULT_CRITERIA } from '../../server/constants.js';
import { createDirectorioFeature, serviceTitle } from '../../server/directorioFeature.js';

interface Call {
  url: string;
  method: string;
  body?: Record<string, unknown>;
}

/** A GoogleSession double: answers by URL, records every call, no network. */
function fakeGoogle(connected = true) {
  const calls: Call[] = [];
  const session = {
    configured: true,
    connected,
    hasScope: () => true,
    api: async (url: string, init: { method?: string; body?: unknown } = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body as Record<string, unknown> });
      if (url.includes('/calendarList')) return { items: [{ id: 'cal-1', summary: 'Familia' }] };
      return {};
    },
    download: async () => Buffer.alloc(0),
    reconnectInDays: () => undefined,
    forget: () => {},
    onChange: () => () => {},
  } satisfies GoogleSession;
  return { session, calls };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'directorio-'));
  fs.writeFileSync(path.join(tmp, 'SKILL.md'), '# Skill de prueba\nBusca en el sitio de la marca.');
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function setup(connected = true) {
  const google = fakeGoogle(connected);
  const feature = createDirectorioFeature({
    google: google.session,
    home: tmp,
    skillFile: path.join(tmp, 'SKILL.md'),
    calendarName: () => 'Familia',
    pollMs: 60_000,
  });
  const sent: SearchRoomStatus[] = [];
  const client: FeatureClient = {
    privileged: true,
    send: (m) => sent.push(m as unknown as SearchRoomStatus),
  };
  feature.connect?.(client);
  const last = () => sent[sent.length - 1];
  return { feature, google, client, sent, last };
}

describe('Directorio', () => {
  it('manda su estado a las páginas con token, con los criterios de fábrica', () => {
    const { feature, client, last } = setup();
    feature.handleClientMessage?.({ type: 'webviewReady' }, client);
    expect(last()).toMatchObject({
      type: 'searchRoomStatus',
      room: 'directorio',
      calendar: 'Familia',
    });
    expect(last().criteria.map((c) => c.id)).toEqual(['tecnicos', 'doctores', 'restaurantes']);
    expect(last().criteria[0].rules[0]).toMatch(/oficial o autorizado/);
    const guest: FeatureClient = { privileged: false, send: () => {} };
    expect(
      feature.handleClientMessage?.(
        { type: 'createSearchRequest', room: 'directorio', text: 'x', criteriaId: 'tecnicos' },
        guest,
      ),
    ).toBe(false);
    feature.dispose?.();
  });

  it('el encargo lleva el pedido, los criterios en orden, la entrega y la skill', () => {
    const { feature, client, last } = setup();
    feature.handleClientMessage?.(
      {
        type: 'createSearchRequest',
        room: 'directorio',
        text: 'Reparar refrigerador Samsung que no enfría',
        place: 'Puebla',
        when: 'esta semana',
        criteriaId: 'tecnicos',
      },
      client,
    );
    const req = last().requests[0];
    const brief = fs.readFileSync(path.join(tmp, 'directorio', 'pedidos', `${req.id}.md`), 'utf8');
    expect(brief).toContain('Reparar refrigerador Samsung que no enfría');
    expect(brief).toContain('Dónde: Puebla');
    expect(brief).toContain(`1. ${DEFAULT_CRITERIA[0].rules[0]}`);
    expect(brief).toContain(`directorio/resultados/${req.id}.json`);
    expect(brief).toContain('Busca en el sitio de la marca.');
    expect(fs.existsSync(path.join(tmp, 'directorio.json'))).toBe(false);
    feature.dispose?.();
  });

  it('Agendar crea el evento con Servicio:, dirección y teléfono, y marca el resultado', async () => {
    const { feature, client, google, last } = setup();
    feature.handleClientMessage?.(
      {
        type: 'createSearchRequest',
        room: 'directorio',
        text: 'Refrigerador',
        criteriaId: 'tecnicos',
      },
      client,
    );
    const id = last().requests[0].id;
    fs.writeFileSync(
      path.join(tmp, 'directorio', 'resultados', `${id}.json`),
      JSON.stringify({
        pedido: id,
        resultados: [
          {
            nombre: 'Centro de Servicio Ejemplo',
            tipo: 'oficial',
            telefono: '33 0000 0000',
            direccion: 'Av. Ejemplo 123',
            liga: 'https://ejemplo.mx',
            porque: 'Autorizado por la marca',
            puntuacion: 92,
          },
        ],
      }),
    );
    feature.room.poll();
    const result = last().requests[0].results[0];
    feature.handleClientMessage?.(
      {
        type: 'scheduleSearchResult',
        room: 'directorio',
        requestId: id,
        resultId: result.id,
        title: 'Centro de Servicio Ejemplo',
        date: '2026-11-05',
        time: '10:00',
      },
      client,
    );
    await flush();
    const post = google.calls.find((c) => c.method === 'POST');
    expect(post?.url).toContain('/calendars/cal-1/events');
    expect(post?.body).toMatchObject({
      summary: 'Servicio: Centro de Servicio Ejemplo',
      location: 'Av. Ejemplo 123',
      start: { dateTime: '2026-11-05T10:00:00' },
    });
    expect(String(post?.body?.description)).toContain('33 0000 0000');
    expect(last().requests[0].results[0].mark).toBe('agendado');
    expect(last().saving).toBe(false);
    feature.dispose?.();
  });

  it('sin Google no agenda ni ofrece calendario', async () => {
    const { feature, client, google, last } = setup(false);
    feature.handleClientMessage?.({ type: 'webviewReady' }, client);
    expect(last().calendar).toBeUndefined();
    feature.handleClientMessage?.(
      {
        type: 'scheduleSearchResult',
        room: 'directorio',
        requestId: 'x',
        resultId: 'y',
        title: 'A',
        date: '2026-11-05',
      },
      client,
    );
    await flush();
    expect(google.calls).toEqual([]);
    feature.dispose?.();
  });

  it('el título siempre lleva el prefijo una sola vez', () => {
    expect(serviceTitle('Taller')).toBe('Servicio: Taller');
    expect(serviceTitle('servicio: Taller')).toBe('servicio: Taller');
  });
});
