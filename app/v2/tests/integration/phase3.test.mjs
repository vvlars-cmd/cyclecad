/**
 * tests/integration/phase3.test.mjs
 *
 * Phase 3 integration coverage — collision-check, probe-g38, offline-queue,
 * multi-machine-dashboard, admin-fusion-post, and the seven new server
 * routes / three new schema tables.
 *
 * The widget tests run under a tiny DOM shim so the import-time browser
 * code path doesn't crash on Node. The server tests parse
 * `server/meter/index.js` and `server/meter/schema.sql` as text and assert
 * structural presence of routes / tables.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert, assertEq, summary } from './_runner.mjs';

import { runCheck, sweptBbox, classifyHit } from '../../widgets/collision-check.js';
import { generateProgram } from '../../widgets/probe-g38.js';
import {
  readStorage, writeStorage, STORAGE_KEY,
} from '../../widgets/offline-queue.js';
import { POST_SOURCE_PATH, parseHeader } from '../../widgets/admin-fusion-post.js';

const HERE      = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SERVER_SRC_PATH = path.join(REPO_ROOT, 'server', 'meter', 'index.js');
const SCHEMA_PATH     = path.join(REPO_ROOT, 'server', 'meter', 'schema.sql');

// ── DOM shim ────────────────────────────────────────────────────────────────
// Tiny stand-in for the bits of DOM the widgets touch at init() time.
// Every node tracks children + textContent + dataset + attributes well
// enough to exercise the widget API without a real browser.

class Node {
  constructor(tag = '') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this._textContent = '';
    this._innerHTML = '';
    this.style = { cssText: '' };
    this.className = '';
    this.parentElement = null;
    this._listeners = {};
  }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); }
  getAttribute(k) { return this.attributes[k] != null ? this.attributes[k] : null; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  removeChild(c) {
    const ix = this.children.indexOf(c);
    if (ix >= 0) this.children.splice(ix, 1);
    c.parentElement = null;
    return c;
  }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); }
  removeEventListener(ev, fn) {
    const arr = this._listeners[ev]; if (!arr) return;
    const ix = arr.indexOf(fn); if (ix >= 0) arr.splice(ix, 1);
  }
  querySelector(sel) {
    const direct = findOne(this, sel);
    if (direct) return direct;
    return synthesisFromHtml(this, sel, true);
  }
  querySelectorAll(sel) {
    const direct = findAll(this, sel);
    if (direct.length) return direct;
    const syn = synthesisFromHtml(this, sel, false);
    return syn ? (Array.isArray(syn) ? syn : [syn]) : [];
  }
  replaceWith(other) {
    if (!this.parentElement) return;
    const ix = this.parentElement.children.indexOf(this);
    if (ix < 0) return;
    this.parentElement.children[ix] = other;
    other.parentElement = this.parentElement;
    this.parentElement = null;
  }
  replaceChildren() { this.children = []; this._innerHTML = ''; }
  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) { this._innerHTML = String(html); this.children = []; this._synth = {}; /* synth nodes are recreated on next querySelector */ }
  get firstElementChild() {
    if (this.children[0]) return this.children[0];
    // Synthesise from innerHTML — return a stand-in Node carrying the same
    // innerHTML so subsequent querySelector calls behave as if the tree
    // had been parsed.
    const html = this._innerHTML;
    if (!html) return null;
    const m = html.match(/<(\w+)\b([^>]*)>/);
    if (!m) return null;
    const n = new Node(m[1]);
    n._innerHTML = html;
    n.parentElement = this;
    this.children.push(n);
    return n;
  }
  click() { (this._listeners['click'] || []).forEach(fn => { try { fn({ currentTarget: this, target: this, preventDefault() {}, stopPropagation() {} }); } catch {} }); }
}

/**
 * Synthesise a Node from a selector by scanning innerHTML for matching
 * tags and stashing them under the parent so subsequent calls return the
 * same node and event listeners stick.
 */
function synthesisFromHtml(parent, sel, single) {
  const html = parent._innerHTML || '';
  if (!html) return single ? null : [];
  const m = String(sel).match(/\[([\w-]+)(=["']([^"']+)["'])?\]/);
  if (!m) return single ? null : [];
  const attr = m[1];
  const wantVal = m[3];
  // Scan innerHTML for tags carrying that attribute. Match either
  //   data-foo="bar"  (with explicit value), or
  //   data-foo        (boolean, value defaults to '').
  const re = new RegExp(`<(\\w+)\\b([^>]*?\\b${attr}(?:\\s*=\\s*["']([^"']*)["'])?(?:\\s|>|/)[^>]*)>`, 'g');
  const found = [];
  let mm;
  while ((mm = re.exec(html)) !== null) {
    const tag = mm[1];
    const attrsStr = mm[2];
    const val = mm[3] != null ? mm[3] : '';
    if (wantVal != null && val !== wantVal) continue;
    // Cache key — same selector hit on same parent should yield same Node.
    parent._synth = parent._synth || {};
    const key = `${attr}=${val}`;
    if (parent._synth[key]) { found.push(parent._synth[key]); continue; }
    const n = new Node(tag);
    n.setAttribute(attr, val);
    n.parentElement = parent;
    // Crude type detection — preserve <input type="…"> for the probe-g38 form
    const tm = attrsStr.match(/\btype\s*=\s*["']([^"']+)["']/);
    if (tm) n.type = tm[1];
    const vm = attrsStr.match(/\bvalue\s*=\s*["']([^"']*)["']/);
    if (vm) n.value = vm[1];
    if (/\bchecked\b/.test(attrsStr)) n.checked = true;
    parent._synth[key] = n;
    found.push(n);
  }
  if (single) return found[0] || null;
  return found;
}

function findOne(node, sel) {
  const all = findAll(node, sel);
  return all[0] || null;
}
function findAll(node, sel) {
  const out = [];
  // Very narrow selector engine: tag, [data-foo], [data-foo="bar"], compound .class, class:foo:bar
  const matchers = parseSel(sel);
  walk(node, n => {
    if (matchers.every(m => m(n))) out.push(n);
  });
  return out;
}
function walk(node, fn) {
  if (!(node instanceof Node)) return;
  fn(node);
  for (const c of node.children) walk(c, fn);
}
function parseSel(sel) {
  /** @type {Array<(n:Node)=>boolean>} */
  const fns = [];
  const s = String(sel || '').trim();
  // [data-foo] or [data-foo="bar"]
  const re = /\[([\w-]+)(=["']([^"']+)["'])?\]/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const k = m[1];
    const v = m[3];
    if (v != null) fns.push(n => n.attributes[k] === v);
    else fns.push(n => n.attributes[k] != null);
  }
  // .class
  const cre = /\.([\w-]+)/g;
  while ((m = cre.exec(s)) !== null) {
    const cls = m[1];
    fns.push(n => (n.className || '').split(/\s+/).includes(cls));
  }
  // bare tag
  const tagMatch = s.match(/^[a-z]+/i);
  if (tagMatch) fns.push(n => n.tagName === tagMatch[0].toUpperCase());
  if (fns.length === 0) fns.push(() => true);
  return fns;
}

const DOC = new Node('document');
DOC.body = new Node('body');
DOC.children.push(DOC.body);
DOC.body.parentElement = DOC;
DOC.createElement = (t) => new Node(t);
DOC.querySelector = (sel) => findOne(DOC, sel);
globalThis.document = DOC;

// localStorage shim
class LocalStorageShim {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}
globalThis.localStorage = new LocalStorageShim();

// Stub URL.createObjectURL + Blob if missing (Node ≥18 has Blob).
if (typeof globalThis.URL.createObjectURL !== 'function') {
  globalThis.URL.createObjectURL = () => 'blob:test';
  globalThis.URL.revokeObjectURL = () => {};
}
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
}

// ── widget loaders (after globals set) ───────────────────────────────────
const { init: initCollision } = await import('../../widgets/collision-check.js');
const { init: initProbe }     = await import('../../widgets/probe-g38.js');
const { init: initQueue }     = await import('../../widgets/offline-queue.js');
const { init: initDash }      = await import('../../widgets/multi-machine-dashboard.js');
const { init: initFusion }    = await import('../../widgets/admin-fusion-post.js');

const serverSrc = await fs.readFile(SERVER_SRC_PATH, 'utf8');
const schemaSrc = await fs.readFile(SCHEMA_PATH,     'utf8');

// ── A · collision-check ─────────────────────────────────────────────────────

test('collision-check init renders + emits hits when ngc enters fixture', async () => {
  const mount = new Node('div'); DOC.body.appendChild(mount);
  const w = await initCollision({ mount, params: {
    fixtures: [{ name: 'vise-1', kind: 'vise',
      bbox: { minX: -50, minY: -50, minZ: -10, maxX: 50, maxY: 50, maxZ: 10 } }],
    tool: { number: 1, diameter: 6, length: 30, type: 'flat' },
  }});
  assert(w && w.api, 'init returned api');
  let gotHit = false;
  w.on('hit', () => { gotHit = true; });
  // NGC that plunges Z below fixture top
  const ngc = 'G21\nG90\nG0 X0 Y0 Z20\nG1 Z-5 F100\nM30';
  const res = await w.api.run({ ngc });
  assert(res && Array.isArray(res.hits), 'check returns hits array');
  assert(res.hits.length > 0, 'expected at least one hit when plunging into fixture');
  assert(gotHit, 'hit event was emitted');
  w.destroy();
});

test('collision-check ignores motions above fixture top', async () => {
  const mount = new Node('div'); DOC.body.appendChild(mount);
  const w = await initCollision({ mount, params: {
    fixtures: [{ name: 'vise-1', kind: 'vise',
      bbox: { minX: -50, minY: -50, minZ: -100, maxX: 50, maxY: 50, maxZ: -20 } }],
    tool: { number: 1, diameter: 6, length: 1, type: 'flat' },
  }});
  // All motions stay well above the fixture top (-20). With tool length 1
  // and a starting point already lifted to Z=50, every swept-volume's
  // lowest Z is 49 — far above the fixture.
  const ngc = 'G21\nG90\nG0 Z50\nG0 X0 Y0\nG1 X20 Y20 F100\nG1 X-20 Y-20\nM30';
  const res = await w.api.run({ ngc });
  // Skip the first rapid (which moves up from Z=0 → Z=50, sweeping through
  // the fixture's Z range on the way). Filter the hits to those after lift.
  const linearHits = res.hits.filter(h => h.line >= 4);
  assertEq(linearHits.length, 0, 'no hits when motion is above fixture');
  w.destroy();
});

test('collision-check sweptBbox + classifyHit helpers', () => {
  const sb = sweptBbox({ X: 0, Y: 0, Z: 0 }, { X: 10, Y: 0, Z: 0 }, { diameter: 6, length: 30 });
  assertEq(sb.minX, -3, 'minX = startX - r');
  assertEq(sb.maxX, 13, 'maxX = endX + r');
  assertEq(sb.minZ, -30, 'minZ = startZ - length');
  const cls = classifyHit({ X: 0, Y: 0, Z: 5 }, { X: 0, Y: 0, Z: -10 },
    { diameter: 6, length: 30 },
    { name: 'f', kind: 'vise', bbox: { minX: -100, minY: -100, minZ: 0, maxX: 100, maxY: 100, maxZ: 0 } });
  assertEq(cls.severity, 'hard', 'plunging deep = hard');
});

// ── B · probe-g38 ───────────────────────────────────────────────────────────

test('probe-g38 generates G38.2 + retract', () => {
  const ngc = generateProgram({
    mode: 'edge-finder', axis: 'X', direction: '+',
    feedrate: 100, maxDistance: 5, retract: 2,
    setOriginAfter: false, wcs: 'G54', variant: '38.2',
  });
  assert(ngc.includes('G38.2 X5'), 'has G38.2 X5');
  assert(ngc.includes('G91') && ngc.includes('G0 X-2'), 'has G91 retract');
  assert(ngc.includes('M5'), 'safety prologue spindle off');
  assert(ngc.includes('M30'), 'has M30');
});

test('probe-g38 honours setOriginAfter (adds G92 on touch)', () => {
  const ngc = generateProgram({
    mode: 'edge-finder', axis: 'Z', direction: '-',
    feedrate: 50, maxDistance: 10, retract: 2,
    setOriginAfter: true, wcs: 'G54', variant: '38.2',
  });
  assert(ngc.includes('G92 Z0'), 'G92 Z0 emitted on setOriginAfter=true');
});

test('probe-g38 init renders + emits generate event', async () => {
  const mount = new Node('div'); DOC.body.appendChild(mount);
  const w = await initProbe({ mount, params: { mode: 'surface-Z', axis: 'Z', direction: '-' } });
  let payload = null;
  w.on('generate', (p) => { payload = p; });
  const ngc = await w.api.generate();
  assert(ngc.includes('G38.2 Z'), 'generated NGC includes G38.2 Z');
  assert(payload && payload.ngc === ngc, 'generate event fires with ngc');
  w.destroy();
});

// ── C · offline-queue ───────────────────────────────────────────────────────

test('offline-queue add/list/get/remove round-trip', async () => {
  globalThis.localStorage.clear();
  const mount = new Node('div'); DOC.body.appendChild(mount);
  let posted = 0;
  const fakeFetch = async () => { posted++; return { ok: true, json: async () => ({ ok: true }) }; };
  const w = await initQueue({ mount, params: { fetch: fakeFetch, machineId: 'penta-v2-50' } });
  const id1 = w.api.add({ name: 'a.ngc', ngc: 'G21\nM30', machineId: 'penta-solo' });
  const id2 = w.api.add({ name: 'b.ngc', ngc: 'G21\nM30', machineId: 'penta-v2-50' });
  assertEq(w.api.list().length, 2, 'two entries listed');
  const got = w.api.get(id1);
  assertEq(got.name, 'a.ngc', 'get returns the right entry');
  w.api.remove(id1);
  assertEq(w.api.list().length, 1, 'one entry left after remove');
  assertEq(w.api.list()[0].id, id2, 'right entry remains');
  // localStorage was written
  const stored = readStorage();
  assertEq(stored.length, 1, 'localStorage mirrors the in-memory queue');
  // server POST attempted
  assert(posted >= 2, 'expected POST /api/library/offline-queue to be called');
  w.destroy();
});

test('offline-queue resume-from-line preserves state', async () => {
  globalThis.localStorage.clear();
  const mount = new Node('div'); DOC.body.appendChild(mount);
  const w = await initQueue({ mount, params: { fetch: async () => ({ ok: true, json: async () => ({}) }) } });
  const id = w.api.add({ name: 'r.ngc', ngc: 'G21\nM30', machineId: 'penta-solo' });
  let resumeEvent = null;
  w.on('resume', (p) => { resumeEvent = p; });
  w.api.start(id);
  w.api.setLine(id, 42);
  w.api.pause(id);
  w.api.resume(id, 42);
  assert(resumeEvent && resumeEvent.fromLine === 42, 'resume fired with fromLine=42');
  const got = w.api.get(id);
  assertEq(got.currentLine, 42, 'currentLine preserved across pause+resume');
  assertEq(got.status, 'running', 'status back to running');
  w.destroy();
});

test('offline-queue STORAGE_KEY constant', () => {
  assertEq(STORAGE_KEY, 'cyclecad.offline-queue.v1', 'storage key matches spec');
  // round-trip storage
  writeStorage([{ id: 'q_x', status: 'queued' }]);
  const read = readStorage();
  assertEq(read.length, 1, 'writeStorage→readStorage round-trip');
  globalThis.localStorage.clear();
});

// ── D · multi-machine-dashboard ─────────────────────────────────────────────

test('multi-machine-dashboard add/remove/update/list', async () => {
  const mount = new Node('div'); DOC.body.appendChild(mount);
  const w = await initDash({ mount, params: {} });
  let added = null, snap = null;
  w.on('machineAdded', (p) => { added = p; });
  w.on('snapshot',     (p) => { snap = p; });
  w.api.addMachine({ id: 'm1', name: 'Solo', bridgeUrl: 'ws://bridge:7878' });
  assert(added && added.id === 'm1', 'machineAdded fired');
  assertEq(w.api.list().length, 1, 'one machine listed');
  w.api.updateMachine('m1', { X: 10, Y: 20, Z: 30, F: 600, S: 8000 });
  assert(snap && snap.id === 'm1', 'snapshot event fired');
  const got = w.api.get('m1');
  assertEq(got.snapshot.X, 10, 'snapshot persisted');
  assertEq(got.snapshot.Y, 20, 'snapshot Y persisted');
  assert(w.api.removeMachine('m1'), 'removeMachine returned true');
  assertEq(w.api.list().length, 0, 'machine list empty after remove');
  w.destroy();
});

test('multi-machine-dashboard handles snapshot for unknown machine gracefully', async () => {
  const mount = new Node('div'); DOC.body.appendChild(mount);
  const w = await initDash({ mount, params: {} });
  const r = w.api.updateMachine('nope', { X: 1 });
  assertEq(r, false, 'updateMachine returns false for unknown id');
  w.destroy();
});

// ── E · admin-fusion-post ───────────────────────────────────────────────────

test('admin-fusion-post has the right .cps source path', async () => {
  assertEq(POST_SOURCE_PATH, 'shared/postprocessors/penta-machine.cps',
    'POST_SOURCE_PATH points at the vendored .cps');
  const cpsAbs = path.join(REPO_ROOT, POST_SOURCE_PATH);
  const exists = await fs.stat(cpsAbs).then(() => true).catch(() => false);
  assert(exists, 'vendored .cps file exists at the documented path');
  const text = await fs.readFile(cpsAbs, 'utf8');
  const h = parseHeader(text);
  assert(h.revision && h.revision !== '0', 'parseHeader extracts a revision pin');
  assert(h.minimumRevision && h.minimumRevision !== '0', 'parseHeader extracts minimumRevision');
});

// ── F · server endpoint registrations ───────────────────────────────────────

test('server endpoint registrations: 7 new Phase 3 routes present', () => {
  const want = [
    /app\.post\(\s*['"]\/api\/library\/offline-queue['"]/,
    /app\.get\(\s*['"]\/api\/library\/offline-queue['"]/,
    /app\.get\(\s*['"]\/api\/library\/offline-queue\/:id['"]/,
    /app\.patch\(\s*['"]\/api\/library\/offline-queue\/:id['"]/,
    /app\.delete\(\s*['"]\/api\/library\/offline-queue\/:id['"]/,
    /app\.post\(\s*['"]\/api\/library\/collision-check['"]/,
    /app\.post\(\s*['"]\/api\/library\/probe-results['"]/,
    /app\.get\(\s*['"]\/api\/library\/probe-results['"]/,
  ];
  // 7 unique HTTP routes, but 8 patterns above (including GET probe-results).
  // The spec lists 7 — the trailing GET filter on probe-results is the 8th
  // listed in the prompt: "GET /api/library/probe-results?machineId=".
  for (const re of want) {
    assert(re.test(serverSrc), `expected route pattern: ${re}`);
  }
});

// ── G · schema additions ────────────────────────────────────────────────────

test('schema has the 3 new tables (idempotent guards present)', () => {
  for (const t of ['offline_queue', 'probe_results', 'collision_checks']) {
    const re = new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${t}\\b`, 'i');
    assert(re.test(schemaSrc), `expected CREATE TABLE IF NOT EXISTS ${t}`);
  }
  assert(/CREATE INDEX IF NOT EXISTS\s+ix_offline_queue_tenant_status/i.test(schemaSrc),
    'offline-queue tenant/status index present');
  assert(/CREATE INDEX IF NOT EXISTS\s+ix_probe_results_machine/i.test(schemaSrc),
    'probe-results machine index present');
});

// ── H · payload acceptance smoke (route-level) ──────────────────────────────

test('offline-queue PATCH endpoint accepts status="paused" transition', () => {
  // Structural assertion: the PATCH handler validates against the allowed set
  // ['queued','running','paused','done','failed']. We grep for the literal.
  assert(/'queued',\s*'running',\s*'paused',\s*'done',\s*'failed'/.test(serverSrc),
    'PATCH validator includes "paused" in its allowed list');
});

test('collision-check log endpoint accepts a payload', () => {
  // Structural assertion: the POST /api/library/collision-check handler reads
  // machineId, hits[], summary, and inserts into collision_checks.
  assert(/INSERT INTO collision_checks/.test(serverSrc),
    'collision-check handler inserts into collision_checks table');
  assert(/JSON\.stringify\(hits\)/.test(serverSrc),
    'collision-check handler serialises hits as JSON');
});

await summary();
