import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  claudeProfileProvider,
  claudeProvider,
  isClaudeProfileProvider,
} from '../src/providers/hook/claude/claude.js';
import {
  discoverClaudeProfiles,
  profileForPath,
} from '../src/providers/hook/claude/claudeProfiles.js';
import { claudeHooksEnabled, hookProviderById, hookProviders } from '../src/providers/index.js';

let home: string;
let savedHome: string | undefined;

beforeEach(() => {
  savedHome = process.env.HOME;
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-profiles-'));
  process.env.HOME = home;
});

afterEach(() => {
  process.env.HOME = savedHome;
  fs.rmSync(home, { recursive: true, force: true });
});

/** A config dir Claude Code has used: it has sessions, a settings.json, or both. */
function makeProfile(
  dirName: string,
  opts: { projects?: boolean; settings?: object } = {},
): string {
  const dir = path.join(home, dirName);
  fs.mkdirSync(dir, { recursive: true });
  if (opts.projects) fs.mkdirSync(path.join(dir, 'projects'), { recursive: true });
  if (opts.settings)
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(opts.settings));
  return dir;
}

describe('discoverClaudeProfiles', () => {
  it('falls back to ~/.claude alone when no profile has been used yet', () => {
    expect(discoverClaudeProfiles({})).toEqual([
      { id: 'claude', configDir: path.join(home, '.claude') },
    ]);
  });

  it('finds every used ~/.claude-<name> and skips an unused ~/.claude', () => {
    makeProfile('.claude'); // only a hooks/ folder of some other tool, say
    makeProfile('.claude-tercero', { settings: {} });
    makeProfile('.claude-personal', { projects: true });
    makeProfile('.claude-vacio');
    expect(discoverClaudeProfiles({})).toEqual([
      { id: 'claude-personal', label: 'personal', configDir: path.join(home, '.claude-personal') },
      { id: 'claude-tercero', label: 'tercero', configDir: path.join(home, '.claude-tercero') },
    ]);
  });

  it('lists the default profile first when it is in use', () => {
    makeProfile('.claude-a', { projects: true });
    makeProfile('.claude', { projects: true });
    expect(discoverClaudeProfiles({}).map((p) => p.id)).toEqual(['claude', 'claude-a']);
  });

  it('adds the CLAUDE_CONFIG_DIR the server runs under, once', () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-elsewhere-'));
    try {
      const dir = path.join(elsewhere, 'Mi Perfil');
      fs.mkdirSync(path.join(dir, 'projects'), { recursive: true });
      const personal = makeProfile('.claude-personal', { projects: true });
      const ids = discoverClaudeProfiles({ CLAUDE_CONFIG_DIR: dir }).map((p) => p.id);
      expect(ids).toEqual(['claude-mi-perfil', 'claude-personal']);
      expect(discoverClaudeProfiles({ CLAUDE_CONFIG_DIR: personal })).toHaveLength(1);
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

describe('profileForPath', () => {
  it('maps a transcript to the profile that holds it', () => {
    makeProfile('.claude-tercero', { projects: true });
    makeProfile('.claude-terceros', { projects: true });
    const transcript = path.join(home, '.claude-tercero', 'projects', '-repo', 'abc.jsonl');
    expect(profileForPath(transcript)?.label).toBe('tercero');
    expect(profileForPath(path.join(home, 'elsewhere', 'x.jsonl'))).toBeUndefined();
  });
});

describe('claudeProvider across profiles', () => {
  it('reads sessions from every profile and tags them by profile', () => {
    makeProfile('.claude-personal', { projects: true });
    makeProfile('.claude-tercero', { projects: true });
    fs.mkdirSync(path.join(home, '.claude-tercero', 'projects', '-repo'));
    fs.mkdirSync(path.join(home, '.claude-personal', 'projects', '-repo'));

    expect(claudeProvider.getAllSessionRoots?.()).toEqual([
      path.join(home, '.claude-personal', 'projects'),
      path.join(home, '.claude-tercero', 'projects'),
    ]);
    expect(claudeProvider.getSessionDirs?.('/repo')).toEqual([
      path.join(home, '.claude-personal', 'projects', '-repo'),
      path.join(home, '.claude-tercero', 'projects', '-repo'),
    ]);
    expect(
      claudeProvider.sessionLabel?.(
        path.join(home, '.claude-tercero', 'projects', '-repo', 'a.jsonl'),
      ),
    ).toBe('tercero');
  });

  it('keeps the default profile untagged', () => {
    makeProfile('.claude', { projects: true });
    expect(
      claudeProvider.sessionLabel?.(path.join(home, '.claude', 'projects', '-repo', 'a.jsonl')),
    ).toBeUndefined();
  });
});

describe('one hook provider per profile', () => {
  it('is claudeProvider itself for ~/.claude', () => {
    expect(hookProviders()).toEqual([claudeProvider]);
  });

  it('installs into its own settings.json only, beside hooks it did not write', async () => {
    const otherHook = { matcher: '', hooks: [{ type: 'command', command: 'bash other-tool.sh' }] };
    makeProfile('.claude-personal', { settings: { hooks: { Stop: [otherHook] } } });
    makeProfile('.claude-tercero', { settings: { model: 'x' } });

    const personal = hookProviderById('claude-personal');
    expect(personal?.displayName).toBe('Claude Code (personal)');
    await personal!.installHooks('http://127.0.0.1:1', 'token');

    const read = (name: string) =>
      JSON.parse(fs.readFileSync(path.join(home, name, 'settings.json'), 'utf-8'));
    expect(read('.claude-personal').hooks.Stop[0]).toEqual(otherHook);
    expect(read('.claude-personal').hooks.Stop).toHaveLength(2);
    expect(await personal!.areHooksInstalled()).toBe(true);
    expect(read('.claude-tercero')).toEqual({ model: 'x' });
    expect(await hookProviderById('claude-tercero')!.areHooksInstalled()).toBe(false);

    await personal!.uninstallHooks();
    expect(read('.claude-personal').hooks.Stop).toEqual([otherHook]);
  });

  it('names its profile and settings file in the consent ask', () => {
    makeProfile('.claude-tercero', { projects: true });
    const { headline, disclosure } = hookProviderById('claude-tercero')!.consentDisclosure();
    expect(headline).toContain('tercero');
    expect(disclosure).toContain(path.join('~', '.claude-tercero', 'settings.json'));
  });

  it('returns the same provider object for the same profile', () => {
    const profile = { id: 'claude-x', label: 'x', configDir: path.join(home, '.claude-x') };
    expect(claudeProfileProvider(profile)).toBe(claudeProfileProvider({ ...profile }));
    expect(isClaudeProfileProvider(claudeProfileProvider(profile))).toBe(true);
    expect(isClaudeProfileProvider({ id: 'codex' })).toBe(false);
  });

  it('keeps the scanners on hooks only while every profile wants hooks', () => {
    makeProfile('.claude-a', { projects: true });
    makeProfile('.claude-b', { projects: true });
    expect(claudeHooksEnabled(() => true)).toBe(true);
    expect(claudeHooksEnabled((id) => id !== 'claude-b')).toBe(false);
  });
});
