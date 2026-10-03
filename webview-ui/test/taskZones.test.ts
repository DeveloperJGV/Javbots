import assert from 'node:assert/strict';

import { test } from 'vitest';

import { zoneForCommand, zoneForStatus } from '../src/office/zones/taskZones.js';

test('maps tool statuses to their zone', () => {
  assert.equal(zoneForStatus('Editing foo.ts'), 'code');
  assert.equal(zoneForStatus('Writing bar.md'), 'code');
  assert.equal(zoneForStatus('Editing notebook'), 'code');
  assert.equal(zoneForStatus('Reading foo.ts'), 'library');
  assert.equal(zoneForStatus('Searching code'), 'library');
  assert.equal(zoneForStatus('Searching files'), 'library');
  assert.equal(zoneForStatus('Searching the web'), 'web');
  assert.equal(zoneForStatus('Fetching web content'), 'web');
  assert.equal(zoneForStatus('Using mcp__claude-in-chrome__navigate'), 'web');
  assert.equal(zoneForStatus('Running: ls -la'), 'commands');
});

test('activities that belong at the desk have no zone', () => {
  assert.equal(zoneForStatus('Subtask: Explore code'), null);
  assert.equal(zoneForStatus('Running subtask'), null);
  assert.equal(zoneForStatus('Planning'), null);
  assert.equal(zoneForStatus('Waiting for your answer'), null);
  assert.equal(zoneForStatus('Using TodoWrite'), null);
  assert.equal(zoneForStatus('-> lead'), null);
});

test('recognizes test runners', () => {
  for (const cmd of [
    'npm test',
    'npm run test:server',
    'npm run e2e -- --grep x',
    'npx vitest run foo',
    'pnpm exec jest',
    'pytest -q',
    'python -m pytest tests',
    'cargo test',
    'go test ./...',
    'cd server && npm test',
    'CI=1 npm test 2>&1 | tail -20',
  ]) {
    assert.equal(zoneForCommand(cmd), 'tests', cmd);
  }
});

test('recognizes commits and pushes, which beat tests', () => {
  assert.equal(zoneForCommand('git commit -m "x"'), 'commit');
  assert.equal(zoneForCommand('git -C repo commit --amend'), 'commit');
  assert.equal(zoneForCommand('git push origin main'), 'commit');
  assert.equal(zoneForCommand('npm test && git commit -m x'), 'commit');
});

test('anything else is a plain command', () => {
  for (const cmd of ['git status', 'git log --oneline', 'npm install', 'echo test', 'ls tests/']) {
    assert.equal(zoneForCommand(cmd), 'commands', cmd);
  }
});
