/**
 * @file widgets/admin-overview.js
 * @description Admin dashboard's primary view — KPI cards + recent ledger
 *   table. Reads from the meter's /api/meter/ledger endpoint when admin
 *   key is present; falls back to graceful empty state otherwise.
 *
 * @author Sachin Kumar
 * @license MIT
 */

const ENDPOINT_LEDGER  = '/api/meter/ledger';
const ENDPOINT_HEALTH  = '/api/health';
const ADMIN_KEY_NAME   = 'cyclecad.adminKey';

/**
 * @typedef {Object} KpiCounts
 * @property {number} txCount24h
 * @property {number} actorCount24h
 * @property {number} cycleSpent24h
 * @property {number} bypassCount24h
 *
 * @typedef {Object} LedgerRow
 * @property {string} tx_id
 * @property {string} ts
 * @property {string} actor
 * @property {string} widget
 * @property {string} method
 * @property {number} cost
 * @property {boolean} bypass
 */

const PALETTE = {
  sky:     '#3B82F6',
  emerald: '#10B981',
  purple:  '#7C3AED',
  gold:    '#D4A843',
  rose:    '#E11D48',
};

export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('admin-overview: mount not found');

  const wrap = document.createElement('div');
  wrap.className = 'pt-admin-overview';
  wrap.style.cssText = `
    font: 13px/1.5 Inter, -apple-system, sans-serif; color: #1A1A1A;
    padding: 24px; max-width: 1200px;
  `;
  wrap.innerHTML = renderShell();
  root.appendChild(wrap);

  const adminKey = (() => { try { return localStorage.getItem(ADMIN_KEY_NAME); } catch { return null; }})();

  const listeners = { change: [], refresh: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  let pollTimer = null;

  async function fetchLedger(limit = 50) {
    if (!adminKey) return { ok: false, ledger: [], error: 'no admin key' };
    try {
      const r = await fetch(`${ENDPOINT_LEDGER}?limit=${limit}`, {
        headers: { 'X-Admin-Key': adminKey },
      });
      if (!r.ok) return { ok: false, ledger: [], error: `HTTP ${r.status}` };
      return r.json();
    } catch (e) { return { ok: false, ledger: [], error: e.message }; }
  }

  async function fetchHealth() {
    try {
      const r = await fetch(ENDPOINT_HEALTH);
      return r.ok ? r.json() : { ok: false };
    } catch { return { ok: false }; }
  }

  async function refresh() {
    const [{ ok, ledger, error }, health] = await Promise.all([fetchLedger(200), fetchHealth()]);
    paint(ok ? ledger : [], error, health);
    emit('refresh', { ok, count: ledger?.length || 0, health });
  }

  function paint(rows, error, health) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recent = (rows || []).filter(r => new Date(r.ts).getTime() > cutoff);
    const txCount24h     = recent.length;
    const actorCount24h  = new Set(recent.map(r => r.actor)).size;
    const cycleSpent24h  = recent.reduce((a, r) => a + (r.bypass ? 0 : (r.cost || 0)), 0);
    const bypassCount24h = recent.filter(r => r.bypass).length;

    const kpis = wrap.querySelector('[data-kpis]');
    kpis.innerHTML = [
      kpi('Tx · 24h',        txCount24h.toLocaleString(),     PALETTE.sky),
      kpi('Actors · 24h',    actorCount24h.toLocaleString(),  PALETTE.emerald),
      kpi('$CYCLE spent',    cycleSpent24h.toLocaleString(),  PALETTE.purple),
      kpi('Admin bypass',    bypassCount24h.toLocaleString(), PALETTE.rose),
    ].join('');

    const status = wrap.querySelector('[data-status]');
    status.innerHTML = error ? `<span style="color:${PALETTE.rose}">⚠ ${error}</span>` :
      `<span style="color:${health?.ok?PALETTE.emerald:PALETTE.rose}">${health?.ok?'●':'●'} db: ${health?.db||'?'} · redis: ${health?.redis||'?'} · s3: ${health?.s3||'?'}</span>`;

    const tbody = wrap.querySelector('[data-rows]');
    tbody.innerHTML = (rows || []).slice(0, 30).map(r => `
      <tr>
        <td style="font:11px Menlo,monospace;color:#64748B">${esc(r.tx_id || '')}</td>
        <td>${formatTs(r.ts)}</td>
        <td>${esc(r.actor || '')}</td>
        <td style="font:11px Menlo,monospace">${esc(r.widget || '')}.${esc(r.method || '')}</td>
        <td style="text-align:right;color:${r.bypass ? PALETTE.rose : '#1A1A1A'}">${r.bypass ? 'BYPASS' : (r.cost ?? 0)}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;padding:24px;color:#9CA3AF">no ledger entries — make a charge to populate</td></tr>`;
  }

  function kpi(label, value, color) {
    return `
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid ${color};border-radius:6px;padding:14px 18px">
        <div style="font:600 10px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase">${label}</div>
        <div style="font:700 28px Georgia;color:#1A1A1A;margin-top:4px">${value}</div>
      </div>`;
  }

  function renderShell() {
    return `
      <header style="display:flex;align-items:end;justify-content:space-between;margin-bottom:18px">
        <div>
          <h2 style="font:600 22px Georgia;margin:0">Overview</h2>
          <div style="color:#9CA3AF;font:italic 12px Inter;margin-top:2px">last 24h · admin bypass logged ·
          ${adminKey ? '' : '<span style="color:#E11D48">⚠ admin key not set in localStorage.cyclecad.adminKey</span>'}</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <span data-status style="font:11px Menlo,monospace"></span>
          <button data-refresh style="background:#10B981;color:#fff;border:none;padding:6px 12px;border-radius:4px;font:600 11px Inter;cursor:pointer">REFRESH</button>
        </div>
      </header>
      <div data-kpis style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px"></div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px">
        <div style="font:600 12px Inter;color:#4B5563;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">RECENT LEDGER · 30</div>
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="text-align:left;color:#9CA3AF;font:10px Inter;text-transform:uppercase;letter-spacing:1px">
            <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">tx_id</th>
            <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">ts</th>
            <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">actor</th>
            <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">widget.method</th>
            <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right">cost</th>
          </tr></thead>
          <tbody data-rows></tbody>
        </table>
      </div>
    `;
  }

  function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function formatTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d)) return ts;
    return d.toLocaleTimeString();
  }

  wrap.querySelector('[data-refresh]').addEventListener('click', refresh);
  await refresh();

  return {
    api: {
      refresh,
      startPolling(intervalMs = 5000) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(refresh, intervalMs);
      },
      stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { if (pollTimer) clearInterval(pollTimer); wrap.remove(); },
  };
}
