import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { ConcertsStatus } from '../../../../core/src/messages.js';
import type { ConcertsConfig } from '../../server/concertsConfig.js';
import { createConcertsFeature } from '../../server/concertsFeature.js';
import { parseConcertEvents, parseConcertTitle } from '../../server/googleCalendar.js';
import { normalizeName, parseTicketmasterEvents } from '../../server/ticketmaster.js';

describe('the "Concierto:" rule', () => {
  it('takes only titles that start with the prefix, in any case, and guesses the artist', () => {
    expect(parseConcertTitle('Concierto: Daft Punk – Alive Tour')).toEqual({
      title: 'Daft Punk – Alive Tour',
      artist: 'Daft Punk',
    });
    expect(parseConcertTitle('concierto: Muse - Live')).toEqual({
      title: 'Muse - Live',
      artist: 'Muse',
    });
    expect(parseConcertTitle('Concierto:Daft Punk')).toEqual({
      title: 'Daft Punk',
      artist: 'Daft Punk',
    });
    expect(parseConcertTitle('Daft Punk – Alive Tour')).toBeNull();
    expect(parseConcertTitle('Concierto:   ')).toBeNull();
  });

  it('reads calendar events: concerts only, no cancelled ones, soonest first', () => {
    const concerts = parseConcertEvents({
      items: [
        {
          id: 'b',
          summary: 'Concierto: Muse',
          start: { date: '2027-07-01' },
          htmlLink: 'https://calendar/b',
        },
        {
          id: 'a',
          summary: 'Concierto: Daft Punk – Alive Tour',
          start: { dateTime: '2027-06-12T20:30:00-06:00' },
          location: 'Foro Sol',
        },
        {
          id: 'c',
          summary: 'Juego con los amigos',
          start: { dateTime: '2027-01-01T20:00:00-06:00' },
        },
        {
          id: 'd',
          summary: 'Concierto: Cancelado',
          status: 'cancelled',
          start: { date: '2027-03-01' },
        },
      ],
    });
    expect(concerts.map((c) => c.id)).toEqual(['a', 'b']);
    expect(concerts[0]).toMatchObject({ artist: 'Daft Punk', allDay: false, location: 'Foro Sol' });
    expect(concerts[1]).toMatchObject({ allDay: true, link: 'https://calendar/b' });
  });
});

describe('Ticketmaster', () => {
  const event = (
    id: string,
    name: string,
    attractions: string[],
    date = '2027-06-12',
    time?: string,
  ) => ({
    id,
    name,
    url: `https://tm/${id}`,
    dates: { start: { localDate: date, ...(time ? { localTime: time } : {}) } },
    _embedded: {
      attractions: attractions.map((n) => ({ name: n })),
      venues: [{ name: 'Foro Sol', city: { name: 'Ciudad de México' } }],
    },
  });

  it('keeps the artist own concerts and drops tributes that only mention the name', () => {
    const found = parseTicketmasterEvents(
      {
        _embedded: {
          events: [
            event('1', 'DaftPunk: Alive World Tour', ['DaftPunk'], '2027-06-12', '20:30:00'),
            event('2', 'Tributo a Daft Punk', ['Banda Tributo']),
          ],
        },
      },
      'Daft Punk',
    );
    expect(found).toEqual([
      {
        id: '1',
        artist: 'Daft Punk',
        name: 'DaftPunk: Alive World Tour',
        start: '2027-06-12T20:30:00',
        allDay: false,
        venue: 'Foro Sol',
        city: 'Ciudad de México',
        url: 'https://tm/1',
      },
    ]);
  });

  it('compares names without spaces, accents or case', () => {
    expect(normalizeName('Daft Punk')).toBe(normalizeName('DAFTPUNK'));
    expect(normalizeName('Café Tacvba')).toBe('cafetacvba');
  });
});

describe('concerts feature', () => {
  let dir: string;
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function setup(config: ConcertsConfig) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conciertos-'));
    const file = path.join(dir, 'conciertos.json');
    fs.writeFileSync(file, JSON.stringify(config));
    const calls: string[] = [];
    // A fake Google session: it answers the Calendar API like Google would.
    const google = {
      configured: true,
      connected: true,
      hasScope: () => true,
      reconnectInDays: () => undefined,
      forget: () => calls.push('forget'),
      onChange: () => () => {},
      download: async () => Buffer.alloc(0),
      api: async (url: string, init?: { method?: string; body?: unknown }) => {
        if (url.includes('/calendarList')) {
          calls.push('find');
          return { items: [{ id: 'cal-1', summary: 'Conciertos' }] };
        }
        if (init?.method === 'POST') {
          calls.push(`add ${(init.body as { summary: string }).summary}`);
          return {};
        }
        return {
          items: [
            {
              id: 'a',
              summary: 'Concierto: Daft Punk – Tour',
              start: { dateTime: '2027-06-12T20:30:00-06:00' },
            },
          ],
        };
      },
    };
    const sent: ConcertsStatus[] = [];
    const feature = createConcertsFeature({
      google,
      topArtists: async () => ['Daft Punk', 'Muse'],
      configFile: file,
      now: () => Date.parse('2026-11-03T00:00:00Z'),
      search: async (_key, artists) => {
        calls.push(`search ${artists.join(',')}`);
        return [
          {
            id: 'tm1',
            artist: 'Daft Punk',
            name: 'DaftPunk',
            start: '2027-06-12T20:30:00',
            allDay: false,
          },
          {
            id: 'tm2',
            artist: 'Muse',
            name: 'Muse en México',
            start: '2027-04-10',
            allDay: true,
            city: 'CDMX',
          },
        ];
      },
    });
    const client = {
      privileged: true,
      send: (m: Record<string, unknown>) => sent.push(m as unknown as ConcertsStatus),
    };
    feature.connect?.(client);
    return { feature, client, sent, calls, file };
  }

  it('reads the configured calendar (by default "Conciertos") and remembers its id', async () => {
    const { feature, sent, calls, file } = setup({ ticketmasterKey: 'k' });
    await feature.refresh();
    expect(calls).toContain('find');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(saved).toMatchObject({ calendarId: 'cal-1', ticketmasterKey: 'k' });
    expect(sent.at(-1)?.concerts.map((c) => c.artist)).toEqual(['Daft Punk']);
  });

  it('searches the top artists, hides what is already in the calendar and adds a found one', async () => {
    const { feature, client, sent, calls } = setup({ ticketmasterKey: 'k' });
    await feature.refresh();
    feature.handleClientMessage?.({ type: 'searchConcerts' }, client);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toContain('search Daft Punk,Muse');
    expect(sent.at(-1)?.found.map((c) => c.id)).toEqual(['tm2']);
    feature.handleClientMessage?.({ type: 'addConcert', id: 'tm2' }, client);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toContain('add Concierto: Muse en México');
    expect(sent.at(-1)?.found).toEqual([]);
  });

  it('tells nothing to pages without the office token', () => {
    const { feature } = setup({});
    const sent: unknown[] = [];
    const stranger = { privileged: false, send: (m: unknown) => sent.push(m) };
    feature.connect?.(stranger);
    expect(feature.handleClientMessage?.({ type: 'searchConcerts' }, stranger)).toBe(false);
    expect(sent).toEqual([]);
  });
});
