/**
 * @file widgets/collision-check.js
 * @description Bbox-vs-fixture sweep collision check for Pentacad CAM output.
 *
 *   Walks an NGC program through `shared/cam/modal-executor.js` to obtain a
 *   linear motion event stream, then for each motion segment builds a
 *   swept-volume AABB (a sphere-of-tool-radius swept from start→end, expanded
 *   downward by the tool length). For each fixture in the workholding
 *   inventory we run an AABB-vs-AABB intersection test and record any hit.
 *
 *   A hit is classified as `hard` when the toolpath crosses below the
 *   fixture top, and `soft` when the swept-volume merely overlaps the
 *   fixture envelope (proximity warning).
 *
 *   Pure ESM. No DOM in the import-time path. Browser-only at runtime.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { executeProgram } from '../shared/cam/modal-executor.js';

const WIDGET = 'collision-check';

/**
 * @typedef {{ minX:number, minY:number, minZ:number,
 *             maxX:number, maxY:number, maxZ:number }} Bbox
 *
 * @typedef {{ name:string, kind:'vise'|'softjaw'|'chuck'|'tombstone', bbox:Bbox }} Fixture
 *
 * @typedef {{ number:number, diameter:number, length:number,
 *             type?:'flat'|'ball'|'vee'|'bullnose'|'drill' }} Tool
 *
 * @typedef {{ line:number, motion:'rapid'|'linear'|'arc',
 *             fixture:string, severity:'hard'|'soft', dz:number }} Hit
 */

/**
 * AABB-vs-AABB intersection test.
 * @param {Bbox} a
 * @param {Bbox} b
 * @returns {boolean}
 */
function aabbHits(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX
      && a.minY <= b.maxY && a.maxY >= b.minY
      && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

/**
 * Swept-volume AABB for a tool moving from p0 → p1.
 * @param {{X:number,Y:number,Z:number}} p0
 * @param {{X:number,Y:number,Z:number}} p1
 * @param {Tool} tool
 * @returns {Bbox}
 */
export function sweptBbox(p0, p1, tool) {
  const r = (Number(tool.diameter) || 0) / 2;
  const len = Number(tool.length) || 0;
  return {
    minX: Math.min(p0.X, p1.X) - r,
    maxX: Math.max(p0.X, p1.X) + r,
    minY: Math.min(p0.Y, p1.Y) - r,
    maxY: Math.max(p0.Y, p1.Y) + r,
    minZ: Math.min(p0.Z, p1.Z) - len,
    maxZ: Math.max(p0.Z, p1.Z) + r,
  };
}

/**
 * Classify a hit. Hard = toolpath dips below the fixture top by more than
 * the tool radius; soft = mere proximity overlap.
 *
 * @param {{X:number,Y:number,Z:number}} p0
 * @param {{X:number,Y:number,Z:number}} p1
 * @param {Tool} tool
 * @param {Fixture} fix
 * @returns {{ severity:'hard'|'soft', dz:number }}
 */
export function classifyHit(p0, p1, tool, fix) {
  const lowestZ = Math.min(p0.Z, p1.Z) - (Number(tool.length) || 0);
  const dz = fix.bbox.maxZ - lowestZ;
  const r = (Number(tool.diameter) || 0) / 2;
  if (lowestZ < fix.bbox.maxZ - r) return { severity: 'hard', dz };
  return { severity: 'soft', dz };
}

/**
 * Run the full collision check for an NGC program against an array of
 * fixtures and a single tool.
 *
 * @param {string} ngc
 * @param {Fixture[]} fixtures
 * @param {Tool} tool
 * @returns {{ ok:boolean, hits:Hit[], summary:string,
 *            motionCount:number, fixtureCount:number }}
 */
export function runCheck(ngc, fixtures, tool) {
  const { events } = executeProgram(String(ngc || ''));
  /** @type {Hit[]} */
  const hits = [];
  let motionCount = 0;
  /** @type {{X:number,Y:number,Z:number}} */
  let prev = { X: 0, Y: 0, Z: 0 };

  for (const e of events) {
    if (e.kind !== 'rapid' && e.kind !== 'linear' && e.kind !== 'arc') continue;
    motionCount++;
    const p1 = { X: e.target.X, Y: e.target.Y, Z: e.target.Z };
    const sb = sweptBbox(prev, p1, tool);
    for (const fx of fixtures || []) {
      if (!fx || !fx.bbox) continue;
      // Skip motions that stay above the fixture top by more than a tool length.
      const minMotionZ = Math.min(prev.Z, p1.Z) - (Number(tool.length) || 0);
      if (minMotionZ > fx.bbox.maxZ + 0.001) continue;
      if (aabbHits(sb, fx.bbox)) {
        const cls = classifyHit(prev, p1, tool, fx);
        hits.push({
          line: e.line,
          motion: e.kind === 'arc' ? 'arc' : (e.kind),
          fixture: fx.name,
          severity: cls.severity,
          dz: cls.dz,
        });
      }
    }
    prev = p1;
  }

  const hard = hits.filter(h => h.severity === 'hard').length;
  const soft = hits.length - hard;
  const summary = hits.length === 0
    ? `clean — ${motionCount} motion${motionCount === 1 ? '' : 's'} clear of ${(fixtures || []).length} fixture${(fixtures || []).length === 1 ? '' : 's'}`
    : `${hits.length} hit${hits.length === 1 ? '' : 's'} (${hard} hard · ${soft} soft) across ${motionCount} motions`;

  return { ok: hits.length === 0, hits, summary, motionCount, fixtureCount: (fixtures || []).length };
}

const STYLE = `
:host,.pt-collision-check{display:block}
.pt-collision-check{padding:18px 20px;font:13px Inter,sans-serif;color:#0F172A;background:#fff;border:1px solid #E5E7EB;border-radius:8px;max-width:780px}
.pt-collision-check h2{font:600 22px Georgia;margin:0 0 4px 0}
.pt-collision-check .kicker{font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px}
.pt-collision-check .desc{font-size:12px;color:#475569;margin-bottom:14px}
.pt-collision-check .row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.pt-collision-check .pill{display:inline-block;padding:2px 8px;border-radius:999px;font:600 10px Inter;letter-spacing:1px;text-transform:uppercase}
.pt-collision-check .pill.ok{background:#dcfce7;color:#166534}
.pt-collision-check .pill.hard{background:#fee2e2;color:#991b1b}
.pt-collision-check .pill.soft{background:#fef3c7;color:#92400e}
.pt-collision-check button{background:#0F172A;color:#fff;border:0;border-radius:4px;padding:8px 14px;font:600 12px Inter;cursor:pointer}
.pt-collision-check button.run{background:#7C3AED}
.pt-collision-check table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
.pt-collision-check th,.pt-collision-check td{padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:left}
.pt-collision-check th{font:600 10px Inter;color:#475569;letter-spacing:1px;text-transform:uppercase;background:#F8FAFC}
.pt-collision-check .summary{font:600 13px Inter;margin-top:10px;padding:10px 12px;border-radius:6px;background:#F1F5F9}
.pt-collision-check .summary.ok{background:#dcfce7;color:#166534}
.pt-collision-check .summary.bad{background:#fef2f2;color:#991b1b}
.pt-collision-check textarea{width:100%;min-height:120px;font:11px Menlo,monospace;border:1px solid #d1d5db;border-radius:4px;padding:8px}
`;

/**
 * @param {{ mount:string|HTMLElement,
 *           app?:string,
 *           meter?:{ charge:Function },
 *           params?:{ fixtures?:any[], tool?:any, ngc?:string } }} opts
 * @returns {Promise<{ api:object, on:Function, destroy:Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);

  let fixtures = Array.isArray(opts?.params?.fixtures) ? [...opts.params.fixtures] : [];
  let tool = opts?.params?.tool || { number: 1, diameter: 6, length: 30, type: 'flat' };
  /** @type {Hit[]} */
  let hits = [];
  let lastSummary = '';
  let lastNgc = String(opts?.params?.ngc || '');

  /** @type {Record<string, Function[]>} */
  const listeners = { change: [], check: [], hit: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const dom = document.createElement('div');
  dom.className = 'pt-collision-check';
  dom.innerHTML = `
    <style>${STYLE}</style>
    <div class="kicker">CAM · COLLISION CHECK</div>
    <h2>swept-volume vs fixtures</h2>
    <div class="desc">Walks NGC, builds an AABB per motion using the tool radius + length, then tests each fixture for overlap.</div>
    <div class="row">
      <div><div style="font:600 10px Inter;color:#475569;letter-spacing:1px">FIXTURES</div><div data-kpi="fx" style="font:700 22px Georgia">0</div></div>
      <div><div style="font:600 10px Inter;color:#475569;letter-spacing:1px">TOOL D · L</div><div data-kpi="tool" style="font:700 22px Georgia">${tool.diameter} · ${tool.length}</div></div>
      <div><div style="font:600 10px Inter;color:#475569;letter-spacing:1px">HITS</div><div data-kpi="hits" style="font:700 22px Georgia">—</div></div>
    </div>
    <label style="display:block;font-size:11px;color:#475569;margin-top:8px">NGC source</label>
    <textarea data-ngc placeholder="(post-processor output here)">${lastNgc}</textarea>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="run" data-run>RUN CHECK</button>
      <button data-clear>CLEAR</button>
    </div>
    <div data-summary class="summary">no check run yet</div>
    <table data-table style="display:none">
      <thead><tr><th>line</th><th>motion</th><th>fixture</th><th>severity</th><th>Δz</th></tr></thead>
      <tbody data-tbody></tbody>
    </table>
  `;
  root.appendChild(dom);

  const $ = sel => dom.querySelector(sel);
  const setKpi = (k, v) => { const el = dom.querySelector(`[data-kpi="${k}"]`); if (el) el.textContent = v; };

  function render() {
    setKpi('fx', String(fixtures.length));
    setKpi('tool', `${tool.diameter} · ${tool.length}`);
    setKpi('hits', hits.length === 0 ? '—' : String(hits.length));
    const summaryEl = $('[data-summary]');
    summaryEl.textContent = lastSummary || 'no check run yet';
    summaryEl.className = 'summary' + (lastSummary
      ? (hits.length === 0 ? ' ok' : ' bad') : '');
    const tbody = $('[data-tbody]');
    if (hits.length === 0) {
      $('[data-table]').style.display = 'none';
      tbody.innerHTML = '';
      return;
    }
    $('[data-table]').style.display = '';
    tbody.innerHTML = hits.map(h => `
      <tr>
        <td>${h.line}</td>
        <td>${h.motion}</td>
        <td>${escapeHtml(h.fixture)}</td>
        <td><span class="pill ${h.severity}">${h.severity}</span></td>
        <td>${Number(h.dz).toFixed(3)}</td>
      </tr>
    `).join('');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  async function bill(method, tokensIn, tokensOut) {
    if (!opts.meter || typeof opts.meter.charge !== 'function') return;
    try {
      await opts.meter.charge({
        widget: WIDGET, method,
        tokensIn: tokensIn || 1,
        tokensOut: tokensOut || 1,
        modelTier: 'sonnet',
        actor: opts.app,
      });
    } catch (err) {
      emit('error', err);
    }
  }

  async function run(call) {
    const ngc = (call && call.ngc != null) ? String(call.ngc) : ($('[data-ngc]').value || '');
    if (call && Array.isArray(call.fixtures)) fixtures = call.fixtures;
    if (call && call.tool) tool = call.tool;
    lastNgc = ngc;
    try {
      const res = runCheck(ngc, fixtures, tool);
      hits = res.hits;
      lastSummary = res.summary;
      render();
      emit('check', res);
      for (const h of hits) emit('hit', h);
      await bill('check', Math.max(1, ngc.length / 4 | 0), Math.max(1, hits.length * 16));
      return res;
    } catch (err) {
      emit('error', err);
      throw err;
    }
  }

  $('[data-run]').addEventListener('click', () => { run(null).catch(() => {}); });
  $('[data-clear]').addEventListener('click', () => {
    hits = []; lastSummary = ''; render();
    emit('change', { kind: 'clear' });
  });

  render();

  return {
    api: {
      setFixtures(arr) { fixtures = Array.isArray(arr) ? arr : []; render(); emit('change', { kind: 'fixtures', fixtures }); },
      setTool(t) { tool = t || tool; render(); emit('change', { kind: 'tool', tool }); },
      run(call) { return run(call || {}); },
      getHits() { return [...hits]; },
      clear() { hits = []; lastSummary = ''; render(); emit('change', { kind: 'clear' }); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
