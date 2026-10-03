import assert from 'node:assert/strict';

import { test } from 'vitest';

import { translateStatus } from '../src/office/statusText.js';

test('translates tool statuses and keeps the detail after the prefix', () => {
  assert.equal(translateStatus('Reading foo.ts'), 'Leyendo foo.ts');
  assert.equal(translateStatus('Running: npm test'), 'Ejecutando: npm test');
  assert.equal(translateStatus('Subtask: Explore code'), 'Subtarea: Explore code');
  assert.equal(translateStatus('Searching the web'), 'Buscando en internet');
  assert.equal(translateStatus('Using SomeTool'), 'Usando SomeTool');
});

test('matches whole words only and leaves unknown text alone', () => {
  assert.equal(translateStatus('Readingfoo'), 'Readingfoo');
  assert.equal(translateStatus('-> lead'), '-> lead');
  assert.equal(translateStatus('Pensando…'), 'Pensando…');
});
