/**
 * @file widgets/admin-audit.js
 * @description Admin · hash-chained ledger viewer + verifier.
 *
 *   Calls /api/meter/audit/verify and /api/meter/ledger to render:
 *     - chain-status banner (ok / mismatched count)
 *     - latest 30 ledger rows
 *     - per-row hash preview, click to copy
 *     - drill-down on any tx_id
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { token } from '../shared/token.js';
import { auth }  from '../shared/auth.js';

export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('admin-audit: mount not found');
  if (!auth.adminKey()) {
    root.innerHTML = `<div style="padding:16px;font:13px Inter;color:#E11D48;background:#fff;border-radius:6px;border:1px solid #fee2e2;max-width:520px">
      admin key required — set <code>localStorage.cyclecad.adminKey</code></div>`;
    return { api: {}, on: () => {}, destroy: () => root.replaceChildren() };
  }

  const dom = document.createElement('div');
  dom.className = 'pt-admin-audit';
  dom.style.cssText = 'padding:18px;font:13px Inter,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:6px;max-width:1100px';
  dom.innerHTML = `
    <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px">ADMIN · LEDGER AUDIT</div>
    <div style="font:600 22px Georgia;margin-bottom:10px">hash-chained ledger viewer + verifier</div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <button data-verify style="background:#7C3AED;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">VERIFY CHAIN</button>
      <button data-refresh style="background:#10B981;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">REFRESH LEDGER</button>
      <input data-filter-actor type=text placeholder="filter actor (optional)" style="padding:6px 8px;font:11px monospace;border:1px solid #d1d5db;border-radius:3px;width:200px">
      <span data-status style="font:11px Menlo,monospace;color:#6B7280;margin-left:auto">idle</span>
    </div>

    <div data-banner style="padding:10px 12px;border-radius:4px;font:11px Menlo,monospace;margin-bottom:14px;display:none"></div>

    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="text-align:left;color:#9CA3AF;font:10px Inter;text-transform:uppercase;letter-spacing:1px;background:#f9fafb">
        <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">tx_id</th>
        <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">ts</th>
        <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">actor</th>
        <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">widget.method</th>
        <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:right">cost</th>
        <th style="padding:8px 6px;border-bottom:1px solid #e5e7eb">hash</th>
      </tr></thead>
      <tbody data-rows></tbody>
    </table>
  `;
  root.appendChild(dom);

  const $ = sel => dom.querySelector(sel);
  const status  = $('[data-status]');
  const banner  = $('[data-banner]');
  const tbody   = $('[data-rows]');

  const listeners = { change: [], result: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  function fmtTs(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return isNaN(d) ? ts : d.toLocaleString();
  }
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  async function verify() {
    status.textContent = 'walking chain…';
    const r = await token.auditVerify();
    if (r.ok) {
      banner.style.display = 'block';
      banner.style.background = '#ECFDF5';
      banner.style.color      = '#065F46';
      banner.style.border     = '1px solid #A7F3D0';
      banner.textContent = `✓ chain OK · ${r.total} rows · 0 mismatched`;
    } else {
      banner.style.display = 'block';
      banner.style.background = '#FEF2F2';
      banner.style.color      = '#991B1B';
      banner.style.border     = '1px solid #FCA5A5';
      banner.textContent = `✗ chain BROKEN · ${r.mismatched}/${r.total} mismatched · ${(r.mismatches || []).map(m => '#' + m.id).join(', ')}`;
    }
    status.textContent = `verified · ${new Date().toLocaleTimeString()}`;
    emit('result', r);
  }

  async function refresh() {
    status.textContent = 'fetching…';
    const actorFilter = $('[data-filter-actor]').value.trim();
    const r = await token.ledger({ limit: 50, actor: actorFilter || undefined });
    if (!r.ok) {
      tbody.innerHTML = `<tr><td colspan=6 style="padding:20px;text-align:center;color:#9CA3AF">${esc(r.error || 'no rows')}</td></tr>`;
      status.textContent = `error · ${r.error}`;
      return;
    }
    if (!r.ledger || !r.ledger.length) {
      tbody.innerHTML = `<tr><td colspan=6 style="padding:20px;text-align:center;color:#9CA3AF">no ledger entries — make a charge first</td></tr>`;
      status.textContent = `0 rows`;
      return;
    }
    tbody.innerHTML = r.ledger.map(row => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:6px;font:11px Menlo,monospace;color:#64748B">${esc(row.tx_id)}</td>
        <td style="padding:6px;font:11px Menlo,monospace">${esc(fmtTs(row.ts))}</td>
        <td style="padding:6px">${esc(row.actor)}</td>
        <td style="padding:6px;font:11px Menlo,monospace">${esc(row.widget)}.${esc(row.method)}</td>
        <td style="padding:6px;text-align:right;color:${row.bypass ? '#E11D48' : '#1A1A1A'}">${row.bypass ? 'BYPASS' : (row.cost ?? 0)}</td>
        <td style="padding:6px;font:10px Menlo,monospace;color:#6B7280" title="${esc(row.hash)}">${esc((row.hash || '').slice(0, 12))}…</td>
      </tr>
    `).join('');
    status.textContent = `${r.ledger.length} rows · ${new Date().toLocaleTimeString()}`;
    emit('change', { kind: 'refresh', count: r.ledger.length });
  }

  $('[data-verify]')      .addEventListener('click', verify);
  $('[data-refresh]')     .addEventListener('click', refresh);
  $('[data-filter-actor]').addEventListener('change', refresh);

  await refresh();
  await verify();

  return {
    api: { verify, refresh },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
