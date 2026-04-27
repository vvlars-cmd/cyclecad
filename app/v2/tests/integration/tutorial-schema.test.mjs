/**
 * tests/integration/tutorial-schema.test.mjs
 *
 * Direct tests for shared/tutorial-schema.js — the tutorial DSL validator,
 * topo-sort, and step template factory.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'shared', 'tutorial-schema.js');

const schema = await import(pathToFileURL(SCHEMA_PATH).href);
const {
  STEP_KINDS,
  SCOPE_KINDS,
  templateForKind,
  validateTutorial,
  topoSortSteps,
  summarizeTutorial,
  emptyTutorial,
} = schema;

/* ────────────────────────────────────────────────────────────────────── */

test('STEP_KINDS exports 17 kinds', () => {
  assert(Array.isArray(STEP_KINDS), 'STEP_KINDS must be array');
  assertEq(STEP_KINDS.length, 17, 'expected 17 step kinds');
});

test('every STEP_KIND has a working template', () => {
  // The "note" template renders the user-supplied text verbatim, so its
  // default narration is empty by design — tolerate that one case.
  const NARRATION_MAY_BE_EMPTY = new Set(['note']);
  for (const kind of STEP_KINDS) {
    const step = templateForKind(kind);
    assert(step, `templateForKind(${kind}) returned falsy`);
    assertEq(step.kind, kind);
    assert(typeof step.id === 'string' && step.id.length > 0, `${kind}: id required`);
    assert(typeof step.title === 'string' && step.title.length > 0, `${kind}: title required`);
    assert(typeof step.narration === 'string', `${kind}: narration must be string`);
    if (!NARRATION_MAY_BE_EMPTY.has(kind)) {
      assert(step.narration.length > 0, `${kind}: narration must be non-empty`);
    }
    assert(step.params && typeof step.params === 'object', `${kind}: params must be object`);
    assert(Array.isArray(step.inputs), `${kind}: inputs must be array`);
  }
});

test('templateForKind("extrude") has default params and substituted narration', () => {
  const step = templateForKind('extrude');
  assertEq(step.kind, 'extrude');
  assertEq(step.params.distance, 10);
  assertEq(step.params.direction, 'normal');
  assertEq(step.params.operation, 'add');
  assert(/10/.test(step.narration), 'narration must include the substituted distance');
  assert(/normal/.test(step.narration), 'narration must include direction');
});

test('templateForKind("fillet") substitutes radius', () => {
  const step = templateForKind('fillet');
  assertEq(step.params.radius, 1);
  assert(/1 mm/.test(step.narration) || /\b1\b/.test(step.narration),
    `narration should mention radius 1, got: ${step.narration}`);
});

test('templateForKind throws on unknown kind', () => {
  let threw = false;
  try { templateForKind('not-a-kind'); } catch (_) { threw = true; }
  assert(threw, 'expected templateForKind to throw on unknown kind');
});

test('validateTutorial({}) returns ok:false with errors', () => {
  const r = validateTutorial({});
  assertEq(r.ok, false);
  assert(Array.isArray(r.errors) && r.errors.length > 0, 'expected at least one error');
});

test('validateTutorial(null) handles gracefully', () => {
  const r = validateTutorial(null);
  assertEq(r.ok, false);
  assert(r.errors.length > 0);
});

test('a well-formed tutorial validates ok', () => {
  const t = emptyTutorial({
    id: 'tut1',
    componentId: 'c1',
    title: 'Test tutorial',
    scope: 'part',
    steps: [
      { ...templateForKind('sketch'),  id: 's1', inputs: [] },
      { ...templateForKind('extrude'), id: 's2', inputs: ['s1'] },
      { ...templateForKind('fillet'),  id: 's3', inputs: ['s2'] },
    ],
  });
  const r = validateTutorial(t);
  assert(r.ok, `expected ok, got errors: ${JSON.stringify(r.errors)}`);
});

test('cycle detection: a→b→a fails validation', () => {
  const t = emptyTutorial({
    id: 'tut-cycle',
    componentId: 'c1',
    title: 'Cycle',
    scope: 'part',
    steps: [
      { ...templateForKind('sketch'),  id: 'a', inputs: ['b'] },
      { ...templateForKind('extrude'), id: 'b', inputs: ['a'] },
    ],
  });
  const r = validateTutorial(t);
  assertEq(r.ok, false, 'expected ok=false for cyclic graph');
  assert(r.errors.some(e => /cycle/i.test(e)), `expected a cycle error, got: ${JSON.stringify(r.errors)}`);
});

test('unresolved input fails validation', () => {
  const t = emptyTutorial({
    id: 'tut-orphan',
    componentId: 'c1',
    title: 'Orphan',
    scope: 'part',
    steps: [
      { ...templateForKind('sketch'),  id: 's1', inputs: ['ghost'] },
    ],
  });
  const r = validateTutorial(t);
  assertEq(r.ok, false);
  assert(r.errors.some(e => /unresolved input/i.test(e)),
    `expected an unresolved input error, got: ${JSON.stringify(r.errors)}`);
});

test('duplicate step id fails validation', () => {
  const t = emptyTutorial({
    id: 'tut-dup',
    componentId: 'c1',
    title: 'Dup',
    scope: 'part',
    steps: [
      { ...templateForKind('sketch'),  id: 's1', inputs: [] },
      { ...templateForKind('extrude'), id: 's1', inputs: [] },
    ],
  });
  const r = validateTutorial(t);
  assertEq(r.ok, false);
  assert(r.errors.some(e => /duplicate/i.test(e)),
    `expected duplicate step id error, got: ${JSON.stringify(r.errors)}`);
});

test('topoSortSteps linearises a 3-step DAG correctly', () => {
  const t = emptyTutorial({
    id: 'tut',
    componentId: 'c1',
    title: 't',
    scope: 'part',
    steps: [
      { ...templateForKind('fillet'),  id: 's3', inputs: ['s2'] },
      { ...templateForKind('sketch'),  id: 's1', inputs: [] },
      { ...templateForKind('extrude'), id: 's2', inputs: ['s1'] },
    ],
  });
  const sorted = topoSortSteps(t);
  assertEq(sorted.length, 3);
  const ids = sorted.map(s => s.id);
  // s1 must come before s2; s2 before s3
  assert(ids.indexOf('s1') < ids.indexOf('s2'), `s1 must precede s2: ${ids}`);
  assert(ids.indexOf('s2') < ids.indexOf('s3'), `s2 must precede s3: ${ids}`);
});

test('SCOPE_KINDS has 5 entries', () => {
  assertEq(SCOPE_KINDS.length, 5);
  assert(SCOPE_KINDS.includes('part'));
  assert(SCOPE_KINDS.includes('assembly'));
});

test('summarizeTutorial produces a non-empty string', () => {
  const t = emptyTutorial({
    id: 'tut', componentId: 'c1', title: 't', scope: 'part',
    steps: [
      { ...templateForKind('sketch'),  id: 's1', inputs: [] },
      { ...templateForKind('extrude'), id: 's2', inputs: ['s1'] },
    ],
    estimatedTime: { minutes: 12, complexity: 'low' },
  });
  const s = summarizeTutorial(t);
  assert(typeof s === 'string' && s.length > 0);
  assert(/2 steps/.test(s), `expected "2 steps" in summary, got: ${s}`);
});

await summary();
