/**
 * @file widgets/drawing-batch.js
 * @description Drawing batch — runs `drawing-generator` across an entire
 *   project: every part, sub-assembly, and assembly gets a sheet of standard
 *   views (front / top / side / iso). Reports progress, supports
 *   pause/resume/cancel, and persists each drawing through the
 *   /api/library/drawings endpoint pair.
 *
 *   Billing: one `meter.charge` per component at the `sonnet` tier. The
 *   batch sets `batchSize` to the total component count so the meter
 *   automatically applies the existing batch discount (≥10 → 50% off).
 *   Cache is NOT discounted at the batch level — drawing-generator can
 *   apply its own internal cache discount per view if it wants to.
 *
 *   Widget shell: matches `widgets/admin-overview.js` aesthetic — same
 *   palette, same KPI tile spacing, same Inter/Georgia font hierarchy.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { loadWidget } from '../shared/loader.js';

const ENDPOINT_COMPONENTS = (id) => `/api/library/projects/${encodeURIComponent(id)}/components`;
const ENDPOINT_DRAWINGS   = '/api/library/drawings';
const ENDPOINT_VIEWS      = (id) => `/api/library/drawings/${encodeURIComponent(id)}/views`;

const PALETTE = {
  sky:     '#3B82F6',
  emerald: '#10B981',
  purple:  '#7C3AED',
  gold:    '#D4A843',
  rose:    '#E11D48',
  ink:     '#1A1A1A',
  mute:    '#9CA3AF',
};

const TIER_TOKENS_IN  = 1000;
const TIER_TOKENS_OUT = 5000;
const RATE_SONNET     = 0.012;   // synthetic display rate · cycle/1k tokens
const SECONDS_PER_VIEW = 0.4;    // optimistic per-view render estimate

const DEFAULT_SCOPE = Object.freeze({
  parts:         true,
  subAssemblies: true,
  assemblies:    true,
  sheets:        ['A3'],
  views:         ['front', 'top', 'side', 'iso'],
});

/**
 * Mount the drawing batch runner.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { projectId?: string|number, scope?: object }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     setProject: (projectId: string|number) => Promise<void>,
 *     setScope: (scope: { parts?: boolean, subAssemblies?: boolean, assemblies?: boolean, sheets?: string[], views?: string[] }) => void,
 *     estimate: () => { components: number, views: number, cost: number, seconds: number },
 *     start: () => Promise<void>,
 *     pause: () => void,
 *     resume: () => void,
 *     cancel: () => void,
 *     getProgress: () => { phase: string, done: number, total: number, errors: number },
 *     getResults: () => Array<{ componentId: string, drawingId: string }>
 *   },
 *   on: (event: 'change'|'progress'|'done'|'error'|'cancel', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('drawing-batch: mount not found');

  const wrap = document.createElement('div');
  wrap.className = 'pt-drawing-batch';
  wrap.style.cssText = `
    font: 13px/1.5 Inter, -apple-system, sans-serif; color: ${PALETTE.ink};
    padding: 24px; max-width: 1200px;
  `;
  wrap.innerHTML = renderShell();
  root.appendChild(wrap);

  // hidden mount point for transient drawing-generator instances
  const hiddenHost = document.createElement('div');
  hiddenHost.setAttribute('aria-hidden', 'true');
  hiddenHost.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
  wrap.appendChild(hiddenHost);

  const listeners = {
    change: [], start: [], progress: [], componentDone: [], componentFailed: [],
    paused: [], resumed: [], complete: [], cancel: [],
  };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const tracked = []; // intervals/timeouts for cleanup

  const state = {
    projectId:  null,
    projectName: '—',
    components: [],   // [{ id, name, kind, source_format }]
    scope:      { ...DEFAULT_SCOPE, sheets: [...DEFAULT_SCOPE.sheets], views: [...DEFAULT_SCOPE.views] },
    queue:      [],
    cursor:     0,
    running:    false,
    paused:     false,
    cancelled:  false,
    errors:     [],
    results:    [],
    startedAt:  0,
  };

  // ─────────────────── DOM helpers ───────────────────
  const $ = sel => wrap.querySelector(sel);
  const setHeader = (name, count) => {
    $('[data-title]').textContent = `Drawing batch — ${name || '—'}`;
    $('[data-count]').textContent = `${count.toLocaleString()} components`;
  };

  // ─────────────────── data fetch ───────────────────
  async function fetchComponents(projectId) {
    try {
      const r = await fetch(ENDPOINT_COMPONENTS(projectId));
      if (!r.ok) return { ok: false, components: [], error: `HTTP ${r.status}` };
      const j = await r.json();
      return { ok: true, components: j.components || j || [], name: j.project?.name };
    } catch (e) {
      return { ok: false, components: [], error: e.message };
    }
  }

  async function persistDrawing(componentId, sheet, views, svg) {
    try {
      const r = await fetch(ENDPOINT_DRAWINGS, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          projectId:   state.projectId,
          componentId,
          sheet_size:  sheet,
          template:    'default',
          status:      'generated',
          svg_preview: svg ? svg.slice(0, 200) : null,
        }),
      });
      if (!r.ok) return { ok: false, drawingId: null, error: `HTTP ${r.status}` };
      const { id: drawingId } = await r.json();
      // persist views in parallel
      await Promise.all(views.map(v => fetch(ENDPOINT_VIEWS(drawingId), {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ kind: v, json: { dir: v } }),
      }).catch(() => null)));
      return { ok: true, drawingId };
    } catch (e) {
      return { ok: false, drawingId: null, error: e.message };
    }
  }

  // ─────────────────── scope filtering ───────────────────
  function buildQueue() {
    const { scope, components } = state;
    const filtered = components.filter(c => {
      if (c.kind === 'part'      && !scope.parts)         return false;
      if (c.kind === 'assembly'  && !scope.assemblies)    return false;
      // anything between part and assembly counts as a sub-assembly:
      const isSub = c.kind === 'sub-assembly' || (c.kind === 'assembly' && c.parent_assembly_id);
      if (isSub && !scope.subAssemblies)                  return false;
      return true;
    });
    const queue = [];
    for (const c of filtered) {
      for (const sheet of scope.sheets) {
        queue.push({ component: c, sheet, views: scope.views.slice() });
      }
    }
    return queue;
  }

  function estimate() {
    const queue = state.queue.length > 0 && !state.running ? state.queue : buildQueue();
    const sheets = queue.length;
    const views  = queue.reduce((s, q) => s + q.views.length, 0);
    const tokens = views * (TIER_TOKENS_IN + TIER_TOKENS_OUT);
    const baseCost = (tokens / 1000) * RATE_SONNET;
    // batch discount mirrors meter logic: ≥10 → 50% off
    const discount = sheets >= 10 ? 0.5 : sheets >= 2 ? 0.75 : 1;
    const estCostCycle = Math.round(baseCost * discount);
    const estTimeMin = Math.max(0.1, (views * SECONDS_PER_VIEW) / 60);
    return { count: sheets, views, estCostCycle, estTimeMin: Math.round(estTimeMin * 10) / 10 };
  }

  function paintEstimate() {
    const { count, estCostCycle, estTimeMin } = estimate();
    const human = `${count.toLocaleString()} sheets · ~${estCostCycle.toLocaleString()} $CYCLE · ~${estTimeMin} min`;
    $('[data-est]').textContent = `→ ${human}`;
  }

  // ─────────────────── core run loop ───────────────────
  async function chargeOne(componentId) {
    if (!opts.meter) return;
    const totalBatch = state.queue.length || 1;
    try {
      await opts.meter.charge({
        widget:    'drawing-batch',
        kind:      'component',
        actor:     opts.app,
        modelTier: 'sonnet',
        tokensIn:  TIER_TOKENS_IN  * state.scope.views.length,
        tokensOut: TIER_TOKENS_OUT * state.scope.views.length,
        cache_hit: false,
        batchSize: totalBatch,
        meta:      { projectId: state.projectId, componentId },
      });
    } catch { /* swallow */ }
  }

  async function runOne(item) {
    const { component, sheet, views } = item;
    let drawingId = null;
    let status = 'failed';
    let svg = null;
    let dgHandle = null;
    try {
      await chargeOne(component.id);
      // load a fresh drawing-generator instance for each component
      dgHandle = await loadWidget('drawing-generator', {
        mount:    hiddenHost,
        app:      opts.app,
        meter:    opts.meter,
        scene:    opts.scene,
        camera:   opts.camera,
        renderer: opts.renderer,
        root:     opts.root,
      });
      const out = await dgHandle.api.generateForComponent(component.id, { sheet, views });
      svg = out?.sheetSvg || null;
      const persisted = await persistDrawing(component.id, sheet, views, svg);
      if (persisted.ok) {
        drawingId = persisted.drawingId;
        status    = 'generated';
      } else {
        state.errors.push({ componentId: component.id, error: persisted.error || 'persist failed' });
      }
    } catch (e) {
      state.errors.push({ componentId: component.id, error: e?.message || String(e) });
    } finally {
      try { dgHandle?.destroy?.(); } catch {}
    }
    const row = {
      componentId: component.id,
      componentName: component.name || component.id,
      drawingId, sheet, views, status,
    };
    state.results.push(row);
    appendResultRow(row);
    if (status === 'generated') emit('componentDone',   row);
    else                        emit('componentFailed', row);
    return row;
  }

  async function loop() {
    while (state.running && state.cursor < state.queue.length) {
      if (state.cancelled) break;
      if (state.paused) { await sleep(120); continue; }
      const item = state.queue[state.cursor];
      $('[data-current]').textContent = item.component.name || item.component.id || '—';
      await runOne(item);
      state.cursor += 1;
      paintProgress();
      emit('progress', getProgress());
    }
    state.running = false;
    if (state.cancelled) {
      emit('cancel', { done: state.cursor, total: state.queue.length });
    } else {
      emit('complete', { done: state.cursor, total: state.queue.length, errors: state.errors.length });
    }
    paintProgress();
  }

  function sleep(ms) { return new Promise(r => { const t = setTimeout(r, ms); tracked.push(t); }); }

  // ─────────────────── public API ───────────────────
  async function setProject(projectId) {
    state.projectId = projectId;
    state.components = [];
    setHeader('loading…', 0);
    const { ok, components, name, error } = await fetchComponents(projectId);
    if (!ok) {
      setHeader('load failed', 0);
      $('[data-est]').innerHTML = `<span style="color:${PALETTE.rose}">⚠ ${escapeHtml(error || 'fetch failed')}</span>`;
      return { ok: false, error };
    }
    state.components  = components;
    state.projectName = name || projectId;
    setHeader(state.projectName, components.length);
    state.queue = buildQueue();
    paintEstimate();
    emit('change', { kind: 'project', projectId, count: components.length });
    return { ok: true, count: components.length };
  }

  function setScope(partial) {
    if (partial.parts         != null) state.scope.parts         = !!partial.parts;
    if (partial.subAssemblies != null) state.scope.subAssemblies = !!partial.subAssemblies;
    if (partial.assemblies    != null) state.scope.assemblies    = !!partial.assemblies;
    if (Array.isArray(partial.sheets)) state.scope.sheets        = partial.sheets.slice();
    if (Array.isArray(partial.views))  state.scope.views         = partial.views.slice();
    state.queue = buildQueue();
    syncScopeUi();
    paintEstimate();
    emit('change', { kind: 'scope', scope: { ...state.scope } });
    return { ...state.scope };
  }

  async function start() {
    if (state.running) return { ok: false, error: 'already running' };
    if (!state.projectId) return { ok: false, error: 'no project' };
    state.queue = buildQueue();
    if (state.queue.length === 0) return { ok: false, error: 'empty queue' };
    state.cursor    = 0;
    state.errors    = [];
    state.results   = [];
    state.cancelled = false;
    state.paused    = false;
    state.running   = true;
    state.startedAt = Date.now();
    clearResultsTable();
    emit('start', { total: state.queue.length });
    loop();   // fire-and-forget
    return { ok: true, total: state.queue.length };
  }

  function pause()  { if (state.running && !state.paused) { state.paused = true;  emit('paused',  null); } }
  function resume() { if (state.running &&  state.paused) { state.paused = false; emit('resumed', null); } }
  function cancel() { if (state.running) { state.cancelled = true; state.paused = false; } }

  function getProgress() {
    return {
      done:  state.cursor,
      total: state.queue.length,
      currentComponent: state.queue[state.cursor]?.component?.name || null,
      errors: state.errors.slice(),
    };
  }
  function getResults() { return state.results.slice(); }

  // ─────────────────── ui paint ───────────────────
  function paintProgress() {
    const { done, total } = getProgress();
    const pct  = total ? Math.round((done / total) * 100) : 0;
    $('[data-bar-fill]').style.width = `${pct}%`;
    $('[data-pct]').textContent      = `${pct}% · ${done}/${total}`;
    $('[data-start]').disabled  = state.running;
    $('[data-pause]').disabled  = !state.running;
    $('[data-cancel]').disabled = !state.running;
    $('[data-pause]').textContent = state.paused ? 'RESUME' : 'PAUSE';
  }

  function appendResultRow(row) {
    const tbody = $('[data-rows]');
    const tr = document.createElement('tr');
    const pillBg = row.status === 'generated' ? PALETTE.emerald : PALETTE.rose;
    tr.innerHTML = `
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${escapeHtml(row.componentName)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font:11px Menlo,monospace;color:#64748B">${escapeHtml(row.sheet)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font:11px Menlo,monospace;color:#64748B">${row.views.join(', ')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${pillBg};color:#fff;font:600 10px Inter;letter-spacing:1px">${row.status.toUpperCase()}</span>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right">
        ${row.drawingId ? `<a href="#" data-open="${escapeAttr(row.drawingId)}" style="color:${PALETTE.purple};text-decoration:none;font:600 11px Inter">Open →</a>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  }

  function clearResultsTable() {
    $('[data-rows]').innerHTML = '';
  }

  function syncScopeUi() {
    $('[data-scope-parts]').checked         = !!state.scope.parts;
    $('[data-scope-sub]').checked           = !!state.scope.subAssemblies;
    $('[data-scope-asm]').checked           = !!state.scope.assemblies;
    $('[data-scope-sheet]').value           = state.scope.sheets[0] || 'A3';
    Array.from(wrap.querySelectorAll('[data-scope-view]')).forEach(cb => {
      cb.checked = state.scope.views.includes(cb.value);
    });
  }

  function readScopeFromUi() {
    const sheet = $('[data-scope-sheet]').value;
    const views = Array.from(wrap.querySelectorAll('[data-scope-view]:checked')).map(cb => cb.value);
    setScope({
      parts:         $('[data-scope-parts]').checked,
      subAssemblies: $('[data-scope-sub]').checked,
      assemblies:    $('[data-scope-asm]').checked,
      sheets:        [sheet],
      views,
    });
  }

  // ─────────────────── wire scope ui ───────────────────
  ['data-scope-parts', 'data-scope-sub', 'data-scope-asm', 'data-scope-sheet'].forEach(attr => {
    $(`[${attr}]`).addEventListener('change', readScopeFromUi);
  });
  Array.from(wrap.querySelectorAll('[data-scope-view]')).forEach(cb => {
    cb.addEventListener('change', readScopeFromUi);
  });
  $('[data-start]').addEventListener('click',  start);
  $('[data-pause]').addEventListener('click',  () => state.paused ? resume() : pause());
  $('[data-cancel]').addEventListener('click', cancel);
  $('[data-rows]').addEventListener('click', e => {
    const a = e.target.closest('[data-open]');
    if (!a) return;
    e.preventDefault();
    emit('change', { kind: 'open-drawing', drawingId: a.getAttribute('data-open') });
  });

  syncScopeUi();
  paintEstimate();
  paintProgress();

  // ─────────────────── return handle ───────────────────
  return {
    api: {
      setProject,
      setScope,
      estimate,
      start,
      pause,
      resume,
      cancel,
      getProgress,
      getResults,
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      state.cancelled = true;
      state.running   = false;
      tracked.forEach(t => clearTimeout(t));
      tracked.length = 0;
      hiddenHost.remove();
      wrap.remove();
    },
  };

  // ─────────────────── shell template ───────────────────
  function renderShell() {
    return `
      <header style="display:flex;align-items:end;justify-content:space-between;margin-bottom:18px">
        <div>
          <h2 data-title style="font:600 22px Georgia;margin:0">Drawing batch — —</h2>
          <div style="color:${PALETTE.mute};font:italic 12px Inter;margin-top:2px">
            <span data-count>0 components</span> · sonnet tier · batch discount auto-applied
          </div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <span data-current style="font:11px Menlo,monospace;color:${PALETTE.mute}"></span>
        </div>
      </header>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px 18px;margin-bottom:14px">
        <div style="font:600 11px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">SCOPE</div>
        <div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center">
          <label style="display:flex;align-items:center;gap:6px"><input type=checkbox data-scope-parts checked> parts</label>
          <label style="display:flex;align-items:center;gap:6px"><input type=checkbox data-scope-sub checked> sub-assemblies</label>
          <label style="display:flex;align-items:center;gap:6px"><input type=checkbox data-scope-asm checked> assemblies</label>
          <label style="display:flex;align-items:center;gap:6px">sheet
            <select data-scope-sheet style="padding:5px 8px;font:13px Inter;border:1px solid #d1d5db;border-radius:3px">
              ${['A4','A3','A2','A1','A0','letter','tabloid'].map(s => `<option ${s==='A3'?'selected':''}>${s}</option>`).join('')}
            </select>
          </label>
          <span style="display:flex;align-items:center;gap:10px">views:
            ${['front','top','side','iso'].map(v =>
              `<label style="display:flex;align-items:center;gap:4px"><input type=checkbox data-scope-view value="${v}" checked> ${v}</label>`
            ).join('')}
          </span>
        </div>
        <div data-est style="margin-top:10px;font:600 13px Menlo,monospace;color:${PALETTE.purple}"></div>
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px 18px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <button data-start  style="background:${PALETTE.purple};color:#fff;border:none;padding:8px 16px;border-radius:4px;font:600 12px Inter;cursor:pointer">START</button>
          <button data-pause  style="background:${PALETTE.gold};color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer" disabled>PAUSE</button>
          <button data-cancel style="background:${PALETTE.rose};color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer" disabled>CANCEL</button>
          <span data-pct style="margin-left:8px;font:600 12px Menlo,monospace;color:${PALETTE.ink}">0% · 0/0</span>
        </div>
        <div style="height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden">
          <div data-bar-fill style="height:100%;width:0%;background:${PALETTE.emerald};transition:width .25s ease"></div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px 18px">
        <div style="font:600 11px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">RESULTS</div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="text-align:left;color:${PALETTE.mute};font:10px Inter;text-transform:uppercase;letter-spacing:1px">
            <th style="padding:8px 8px;border-bottom:1px solid #e5e7eb">component</th>
            <th style="padding:8px 8px;border-bottom:1px solid #e5e7eb">sheet</th>
            <th style="padding:8px 8px;border-bottom:1px solid #e5e7eb">views</th>
            <th style="padding:8px 8px;border-bottom:1px solid #e5e7eb">status</th>
            <th style="padding:8px 8px;border-bottom:1px solid #e5e7eb;text-align:right">link</th>
          </tr></thead>
          <tbody data-rows></tbody>
        </table>
      </div>
    `;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}
function escapeAttr(s) {
  return String(s ?? '').replace(/["&<>]/g, c => ({ '"':'&quot;', '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}
