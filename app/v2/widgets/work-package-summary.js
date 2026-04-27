/**
 * @file widgets/work-package-summary.js
 * @description Operator's-eye dashboard for a single project's work package —
 *   live KPIs (components / drawings / tutorials / attachments / bundles /
 *   revisions), an activity timeline, and a quick-action row that routes
 *   into the cycleCAD ACTION_MAP.
 *
 *   Each KPI tile is clickable and emits `'drillDown'` so a parent shell
 *   can route to the matching detail widget. The four quick-action
 *   buttons emit `'action'` with the canonical action name.
 *
 *   Billing: one `meter.charge` per refresh at the `haiku` tier — refreshes
 *   are read-only fan-outs across summary endpoints and don't justify
 *   sonnet pricing.
 *
 *   Visual style mirrors `widgets/admin-overview.js`: 24px outer padding,
 *   1200px max width, KPI cards with 4px colored top border, Inter for
 *   labels and Georgia for numbers.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const ENDPOINT_KPI      = (id) => `/api/library/projects/${encodeURIComponent(id)}/kpis`;
const ENDPOINT_TIMELINE = (id) => `/api/library/projects/${encodeURIComponent(id)}/activity?limit=50`;

const PALETTE = {
  sky:     '#3B82F6',
  emerald: '#10B981',
  purple:  '#7C3AED',
  gold:    '#D4A843',
  rose:    '#E11D48',
  cyan:    '#0EA5E9',
  ink:     '#1A1A1A',
  mute:    '#9CA3AF',
};

const TILE_DEFS = [
  { kind: 'components',  label: 'COMPONENTS',  color: PALETTE.sky },
  { kind: 'drawings',    label: 'DRAWINGS',    color: PALETTE.purple },
  { kind: 'tutorials',   label: 'TUTORIALS',   color: PALETTE.emerald },
  { kind: 'attachments', label: 'ATTACHMENTS', color: PALETTE.gold },
  { kind: 'bundles',     label: 'BUNDLES',     color: PALETTE.cyan },
  { kind: 'revisions',   label: 'REVISIONS',   color: PALETTE.rose },
];

const ACTION_DEFS = [
  { name: 'build-work-package',  label: 'Build work package', color: PALETTE.purple },
  { name: 'generate-drawings',   label: 'Generate drawings',  color: PALETTE.sky },
  { name: 'author-tutorial',     label: 'Author tutorial',    color: PALETTE.emerald },
  { name: 'run-import',          label: 'Run import',         color: PALETTE.gold },
];

const DEFAULT_REFRESH_MS = 15_000;

/**
 * Mount the work-package summary dashboard.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { projectId?: string|number, refreshMs?: number }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     setProject: (projectId: string|number) => Promise<void>,
 *     refresh: () => Promise<void>,
 *     getKpis: () => Record<string, number>,
 *     getTimeline: () => Array<object>,
 *     setRefreshInterval: (ms: number) => void
 *   },
 *   on: (event: 'change'|'drillDown'|'action'|'refresh'|'error', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('work-package-summary: mount not found');

  const wrap = document.createElement('div');
  wrap.className = 'pt-work-package-summary';
  wrap.style.cssText = `
    font: 13px/1.5 Inter, -apple-system, sans-serif; color: ${PALETTE.ink};
    padding: 24px; max-width: 1200px;
  `;
  wrap.innerHTML = renderShell();
  root.appendChild(wrap);

  const listeners = { change: [], refresh: [], drillDown: [], action: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  /** @type {ReturnType<typeof setInterval>[]} */
  const tracked = [];

  const state = {
    projectId:    null,
    refreshMs:    DEFAULT_REFRESH_MS,
    kpis:         emptyKpis(),
    timeline:     [],
    sparklines:   {},        // kind → number[] (rolling history)
    lastFetch:    0,
    inflight:     false,
  };

  // ─────────────────── billing ───────────────────
  async function billRefresh() {
    if (!opts.meter) return;
    try {
      await opts.meter.charge({
        widget:    'work-package-summary',
        kind:      'refresh',
        actor:     opts.app,
        modelTier: 'haiku',
        tokensIn:  200,
        tokensOut: 600,
        cache_hit: false,
      });
    } catch { /* swallow */ }
  }

  // ─────────────────── data fetch ───────────────────
  async function fetchKpis(projectId) {
    try {
      const r = await fetch(ENDPOINT_KPI(projectId));
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }
  async function fetchTimeline(projectId) {
    try {
      const r = await fetch(ENDPOINT_TIMELINE(projectId));
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : (j.events || []);
    } catch { return []; }
  }

  // ─────────────────── core refresh ───────────────────
  async function refresh() {
    if (!state.projectId || state.inflight) return state.kpis;
    state.inflight = true;
    try {
      await billRefresh();
      const [kpis, timeline] = await Promise.all([
        fetchKpis(state.projectId),
        fetchTimeline(state.projectId),
      ]);
      state.kpis     = mergeKpis(state.kpis, kpis);
      state.timeline = timeline.slice(0, 50);
      state.lastFetch = Date.now();
      pushSparklines(state.kpis, state.sparklines);
      paintKpis();
      paintTimeline();
      paintMeta();
      emit('refresh', { kpis: state.kpis, count: state.timeline.length });
      emit('change',  { kind: 'refresh' });
    } finally {
      state.inflight = false;
    }
    return state.kpis;
  }

  // ─────────────────── api ───────────────────
  function setProject(projectId) {
    state.projectId  = projectId;
    state.sparklines = {};
    $('[data-proj]').textContent = projectId || '—';
    refresh();
    return { ok: true, projectId };
  }
  function getKpis()     { return JSON.parse(JSON.stringify(state.kpis)); }
  function getTimeline() { return state.timeline.slice(); }
  function setRefreshInterval(ms) {
    const next = Math.max(2000, ms | 0);
    state.refreshMs = next;
    restartPolling();
    emit('change', { kind: 'interval', ms: next });
    return next;
  }

  function restartPolling() {
    while (tracked.length) clearInterval(tracked.pop());
    if (!state.refreshMs) return;
    const id = setInterval(refresh, state.refreshMs);
    tracked.push(id);
  }

  // ─────────────────── ui paint ───────────────────
  const $ = sel => wrap.querySelector(sel);

  function paintKpis() {
    const grid = $('[data-kpis]');
    const tiles = TILE_DEFS.map(def => {
      const summary = summarizeKpi(def.kind, state.kpis);
      const spark = sparkSvg(state.sparklines[def.kind] || [], def.color);
      return `
        <button data-tile="${def.kind}" type=button style="
          all:unset;cursor:pointer;display:block;text-align:left;
          background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${def.color};
          border-radius:6px;padding:14px 18px;transition:transform .12s ease,box-shadow .12s ease">
          <div style="font:600 10px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase">${def.label}</div>
          <div style="display:flex;align-items:end;justify-content:space-between;gap:8px;margin-top:4px">
            <div style="font:700 28px Georgia;color:${PALETTE.ink};line-height:1">${summary.big}</div>
            <div style="opacity:.85">${spark}</div>
          </div>
          <div style="font:11px Inter;color:${PALETTE.mute};margin-top:6px">${summary.sub}</div>
        </button>`;
    }).join('');
    grid.innerHTML = tiles;
    Array.from(grid.querySelectorAll('[data-tile]')).forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = '0 4px 12px rgba(15,23,42,0.06)'; });
      btn.addEventListener('mouseleave', () => { btn.style.transform = '';                btn.style.boxShadow = ''; });
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-tile');
        emit('drillDown', { kind, kpi: state.kpis[kind] || null });
      });
    });
  }

  function paintTimeline() {
    const list = $('[data-timeline]');
    if (!state.timeline.length) {
      list.innerHTML = `<div style="text-align:center;padding:28px;color:${PALETTE.mute}">no recent activity — kick off an import or a build</div>`;
      return;
    }
    list.innerHTML = state.timeline.map(ev => {
      const ts = formatTs(ev.ts || ev.timestamp);
      const actor = ev.actor || ev.user || 'system';
      const action = ev.action || ev.kind || 'event';
      const target = ev.target || ev.label || '';
      const dot = colorForAction(action);
      return `
        <div style="display:grid;grid-template-columns:14px 96px 110px 1fr;gap:10px;padding:8px 4px;border-bottom:1px solid #f1f5f9;align-items:center">
          <span style="width:8px;height:8px;border-radius:50%;background:${dot};display:inline-block;margin-left:3px"></span>
          <span style="font:11px Menlo,monospace;color:${PALETTE.mute}">${ts}</span>
          <span style="font:600 11px Inter;color:${PALETTE.ink}">${escapeHtml(actor)}</span>
          <span style="font:13px Inter;color:#374151"><strong style="color:${dot}">${escapeHtml(action)}</strong> ${escapeHtml(target)}</span>
        </div>`;
    }).join('');
  }

  function paintMeta() {
    const since = state.lastFetch ? `${Math.max(0, Math.round((Date.now() - state.lastFetch) / 1000))}s ago` : '—';
    $('[data-meta]').textContent = `polling every ${(state.refreshMs / 1000)|0}s · last refresh ${since}`;
  }

  // ─────────────────── wire actions ───────────────────
  $('[data-actions]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const name = btn.getAttribute('data-action');
    emit('action', { action: name, projectId: state.projectId });
  });
  $('[data-refresh]').addEventListener('click', refresh);

  // ─────────────────── boot ───────────────────
  paintKpis();
  paintTimeline();
  paintMeta();
  restartPolling();

  // refresh `last refresh` clock once a second so the operator can see polling tick
  const metaTick = setInterval(paintMeta, 1000);
  tracked.push(metaTick);

  return {
    api: {
      setProject,
      refresh,
      getKpis,
      getTimeline,
      setRefreshInterval,
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      while (tracked.length) clearInterval(tracked.pop());
      wrap.remove();
    },
  };

  // ─────────────────── shell template ───────────────────
  function renderShell() {
    return `
      <header style="display:flex;align-items:end;justify-content:space-between;margin-bottom:18px">
        <div>
          <h2 style="font:600 22px Georgia;margin:0">Work package — <span data-proj style="font-family:Menlo,monospace;font-size:14px;color:${PALETTE.mute}">—</span></h2>
          <div data-meta style="color:${PALETTE.mute};font:italic 12px Inter;margin-top:2px">polling every —s</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <button data-refresh style="background:${PALETTE.emerald};color:#fff;border:none;padding:6px 12px;border-radius:4px;font:600 11px Inter;cursor:pointer">REFRESH</button>
        </div>
      </header>

      <div data-kpis style="display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:24px"></div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px 18px;margin-bottom:18px">
        <div style="font:600 11px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">ACTIVITY · LAST 50</div>
        <div data-timeline style="max-height:340px;overflow:auto"></div>
      </div>

      <div data-actions style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${ACTION_DEFS.map(a => `
          <button data-action="${a.name}" type=button style="
            all:unset;cursor:pointer;text-align:center;
            background:${a.color};color:#fff;padding:14px 16px;border-radius:6px;
            font:600 12px Inter;letter-spacing:1px;text-transform:uppercase;
            transition:filter .12s ease"
            onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter=''">
            ${a.label}
          </button>`).join('')}
      </div>
    `;
  }
}

// ─────────────────── pure helpers ───────────────────
function emptyKpis() {
  return {
    components:  { total: 0, parsed: 0, failed: 0, pendingDerive: 0 },
    drawings:    { total: 0, generated: 0, failed: 0 },
    tutorials:   { total: 0, draft: 0, published: 0, runs: 0 },
    attachments: { total: 0, sizeMB: 0 },
    bundles:     { total: 0, lastBuiltAt: null, lastSizeMB: 0 },
    revisions:   { total: 0, last24h: 0 },
  };
}

function mergeKpis(prev, next) {
  if (!next) return prev;
  const out = emptyKpis();
  for (const k of Object.keys(out)) {
    out[k] = { ...out[k], ...(prev[k] || {}), ...(next[k] || {}) };
  }
  return out;
}

function summarizeKpi(kind, kpis) {
  const k = kpis[kind] || {};
  switch (kind) {
    case 'components':
      return { big: fmt(k.total), sub: `${fmt(k.parsed)} parsed · ${fmt(k.failed)} failed · ${fmt(k.pendingDerive)} pending` };
    case 'drawings':
      return { big: fmt(k.total), sub: `${fmt(k.generated)} generated · ${fmt(k.failed)} failed` };
    case 'tutorials':
      return { big: fmt(k.total), sub: `${fmt(k.published)} pub · ${fmt(k.draft)} draft · ${fmt(k.runs)} runs` };
    case 'attachments':
      return { big: fmt(k.total), sub: `${fmt(k.sizeMB)} MB total` };
    case 'bundles': {
      const ago = k.lastBuiltAt ? formatTs(k.lastBuiltAt) : '—';
      return { big: fmt(k.total), sub: `last ${ago} · ${fmt(k.lastSizeMB)} MB` };
    }
    case 'revisions':
      return { big: fmt(k.total), sub: `${fmt(k.last24h)} in 24h` };
    default:
      return { big: '—', sub: '' };
  }
}

function pushSparklines(kpis, store) {
  const map = {
    components:  kpis.components.total,
    drawings:    kpis.drawings.total,
    tutorials:   kpis.tutorials.total,
    attachments: kpis.attachments.total,
    bundles:     kpis.bundles.total,
    revisions:   kpis.revisions.total,
  };
  for (const [k, v] of Object.entries(map)) {
    const arr = store[k] || (store[k] = []);
    arr.push(Number(v) || 0);
    if (arr.length > 24) arr.shift();
  }
}

function sparkSvg(values, color) {
  const w = 70, h = 22;
  if (!values.length) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - min) / range) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function colorForAction(action) {
  const a = String(action || '').toLowerCase();
  if (a.includes('import'))  return PALETTE.gold     || '#D4A843';
  if (a.includes('drawing')) return PALETTE.purple   || '#7C3AED';
  if (a.includes('tutorial'))return PALETTE.emerald  || '#10B981';
  if (a.includes('bundle'))  return PALETTE.cyan     || '#0EA5E9';
  if (a.includes('fail') || a.includes('error')) return PALETTE.rose || '#E11D48';
  return PALETTE.sky || '#3B82F6';
}

function fmt(n) { return Number(n || 0).toLocaleString(); }

function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(+d)) return String(ts);
  const now = Date.now();
  const dt = (now - +d) / 1000;
  if (dt < 60)         return `${Math.max(1, dt | 0)}s ago`;
  if (dt < 3600)       return `${(dt / 60) | 0}m ago`;
  if (dt < 86400)      return `${(dt / 3600) | 0}h ago`;
  if (dt < 86400 * 7)  return `${(dt / 86400) | 0}d ago`;
  return d.toLocaleDateString();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}
