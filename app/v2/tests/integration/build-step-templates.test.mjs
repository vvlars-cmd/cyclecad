/**
 * tests/integration/build-step-templates.test.mjs
 *
 * Direct tests for shared/build-step-templates.js — the reverse-engineer
 * step library: 15 templates, deterministic instantiation, narration
 * substitution, time estimates, complexity score.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const BST_PATH = path.join(REPO_ROOT, 'shared', 'build-step-templates.js');

const mod = await import(pathToFileURL(BST_PATH).href);
const {
  TEMPLATE_KINDS,
  TEMPLATES,
  instantiateStep,
  narrationFor,
  timeEstimateMin,
  complexityScore,
} = mod;

const EXPECTED_KINDS = [
  'sketch', 'extrude', 'revolve', 'sweep', 'loft',
  'fillet', 'chamfer', 'hole', 'shell', 'mate',
  'place', 'mirror', 'pattern', 'split', 'note',
];

/* ────────────────────────────────────────────────────────────────────── */

test('15 template kinds registered', () => {
  assert(Array.isArray(TEMPLATE_KINDS), 'TEMPLATE_KINDS must be array');
  assertEq(TEMPLATE_KINDS.length, 15);
  for (const k of EXPECTED_KINDS) {
    assert(TEMPLATE_KINDS.includes(k), `missing kind: ${k}`);
    assert(TEMPLATES[k], `missing TEMPLATES[${k}]`);
  }
});

test('every template has the expected shape', () => {
  for (const k of TEMPLATE_KINDS) {
    const t = TEMPLATES[k];
    assertEq(t.kind, k);
    assert(typeof t.icon === 'string' && t.icon.length > 0, `${k}: icon required`);
    assert(typeof t.timeEstimateMin === 'number', `${k}: timeEstimateMin required`);
    assert(t.cost && t.cost.tier, `${k}: cost.tier required`);
    assert(typeof t.narrationTemplate === 'function', `${k}: narrationTemplate must be function`);
    assert(t.paramsShape && typeof t.paramsShape === 'object', `${k}: paramsShape required`);
  }
});

test('instantiateStep("sketch") returns valid shape', () => {
  const s = instantiateStep('sketch');
  assert(s.id && typeof s.id === 'string', 'id required');
  assertEq(s.kind, 'sketch');
  assert(typeof s.narration === 'string' && s.narration.length > 0, 'narration must be non-empty');
  assert(s.params && typeof s.params === 'object', 'params required');
  assert(typeof s.title === 'string' && s.title.length > 0, 'title required');
  assert(s.cost && s.cost.tier, 'cost.tier required');
});

test('instantiateStep throws on unknown kind', () => {
  let threw = false;
  try { instantiateStep('not-real'); } catch (_) { threw = true; }
  assert(threw, 'expected throw on unknown kind');
});

test('narrationFor substitutes distance for extrude', () => {
  const s = instantiateStep('extrude', { distance: 42, direction: 'one-side', operation: 'join' });
  const n = narrationFor(s);
  assert(n.length > 0, 'narration must be non-empty');
  assert(/42/.test(n), `expected "42" in narration, got: ${n}`);
});

test('narrationFor substitutes radius for fillet', () => {
  const s = instantiateStep('fillet', { radius: 7.5, edges: ['e1', 'e2'] });
  const n = narrationFor(s);
  assert(/7\.5/.test(n), `expected "7.5" in narration, got: ${n}`);
});

test('narrationFor returns "" for empty / unknown step', () => {
  assertEq(narrationFor(null), '');
  assertEq(narrationFor({}), '');
  assertEq(narrationFor({ kind: 'no-such-kind' }), '');
});

test('timeEstimateMin is monotonic in step count', () => {
  const one    = [instantiateStep('sketch')];
  const three  = [instantiateStep('sketch'), instantiateStep('extrude'), instantiateStep('fillet')];
  const seven  = [...three, instantiateStep('hole'), instantiateStep('chamfer'), instantiateStep('shell'), instantiateStep('note')];
  const a = timeEstimateMin(one);
  const b = timeEstimateMin(three);
  const c = timeEstimateMin(seven);
  assert(a < b, `expected ${a} < ${b}`);
  assert(b < c, `expected ${b} < ${c}`);
});

test('timeEstimateMin honours per-step override', () => {
  const steps = [{ kind: 'sketch', timeEstimateMin: 999 }];
  assertEq(timeEstimateMin(steps), 999);
});

test('complexityScore increases with step diversity', () => {
  const homogeneous = [
    instantiateStep('sketch'),
    instantiateStep('sketch', {}, { index: 1 }),
    instantiateStep('sketch', {}, { index: 2 }),
  ];
  const diverse = [
    instantiateStep('sketch'),
    instantiateStep('extrude'),
    instantiateStep('fillet'),
    instantiateStep('hole'),
    instantiateStep('chamfer'),
    instantiateStep('shell'),
    instantiateStep('mirror'),
    instantiateStep('pattern'),
  ];
  const a = complexityScore(homogeneous);
  const b = complexityScore(diverse);
  assert(b > a, `expected diverse (${b}) > homogeneous (${a})`);
});

test('complexityScore returns 0 for empty input', () => {
  assertEq(complexityScore([]), 0);
  assertEq(complexityScore(null), 0);
});

test('instantiateStep ids deterministic for identical inputs (FNV-1a)', () => {
  const a = instantiateStep('extrude', { distance: 25, direction: 'one-side', operation: 'join', taper: 0 }, { seed: 7, index: 3 });
  const b = instantiateStep('extrude', { distance: 25, direction: 'one-side', operation: 'join', taper: 0 }, { seed: 7, index: 3 });
  assertEq(a.id, b.id, 'identical inputs must produce identical ids');
});

test('instantiateStep ids differ for different params', () => {
  const a = instantiateStep('extrude', { distance: 25 }, { seed: 1, index: 0 });
  const b = instantiateStep('extrude', { distance: 26 }, { seed: 1, index: 0 });
  assert(a.id !== b.id, 'different params should yield different ids');
});

test('instantiateStep ids differ for different seed/index', () => {
  const a = instantiateStep('sketch', {}, { seed: 1, index: 0 });
  const b = instantiateStep('sketch', {}, { seed: 1, index: 1 });
  assert(a.id !== b.id);
});

await summary();
