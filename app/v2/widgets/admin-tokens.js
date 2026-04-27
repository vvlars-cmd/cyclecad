/**
 * @file widgets/admin-tokens.js
 * @description Admin · $CYCLE balance browser + credit/refund.
 *
 *   Phase 1 surface (now live):
 *     - actor lookup → balance + 30d usage rollup
 *     - issue credit (calls token.recharge)
 *     - refund tx by id (calls /api/meter/refund)
 *
 *   Pairs with widgets/token-recharge.js (which is the leaner recharge
 *   modal used inside the cycleCAD app). This widget is the operator's
 *   workbench — it surfaces the raw mechanics.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { token } from '../shared/token.js';
import { auth }  from '../shared/auth.js';

export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('admin-tokens: mount not found');
  if (!auth.adminKey()) {
    root.innerHTML = `<div style="padding:16px;font:13px Inter;color:#E11D48;background:#fff;border-radius:6px;border:1px solid #fee2e2;max-width:520px">
      admin key required — set <code>localStorage.cyclecad.adminKey</code></div>`;
    return { api: {}, on: () => {}, destroy: () => root.replaceChildren() };
  }

  const dom = document.createElement('div');
  dom.className = 'pt-admin-tokens';
  dom.style.cssText = 'padding:18px;font:13px Inter,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:6px;max-width:780px';
  dom.innerHTML = `
    <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px">ADMIN · $CYCLE TOKENS</div>
    <div style="font:600 22px Georgia;margin-bottom:10px">balance browser · credit · refund</div>
    <div style="display:flex;gap:10px;align-items:end;margin-bottom:14px">
      <label style="font-size:11px;color:#4B5563;flex:1">actor
        <input data-actor type=text value="anon" style="width:100%;padding:6px 8px;font:13px monospace;border:1px solid #d1d5db;border-radius:3px">
      </label>
      <button data-lookup style="background:#10B981;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">LOOKUP</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px">
      <div data-kpi="balance"  style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid #7C3AED;border-radius:6px;padding:14px"><div style="font:600 10px Inter;color:#4B5563;letter-spacing:2px">BALANCE</div><div style="font:700 26px Georgia;margin-top:4px">—</div></div>
      <div data-kpi="calls30d" style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid #3B82F6;border-radius:6px;padding:14px"><div style="font:600 10px Inter;color:#4B5563;letter-spacing:2px">CALLS · 30D</div><div style="font:700 26px Georgia;margin-top:4px">—</div></div>
      <div data-kpi="spent30d" style="background:#fff;border:1px solid #e5e7eb;border-top:4px solid #E11D48;border-radius:6px;padding:14px"><div style="font:600 10px Inter;color:#4B5563;letter-spacing:2px">SPENT · 30D</div><div style="font:700 26px Georgia;margin-top:4px">—</div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <fieldset style="border:1px solid #e5e7eb;border-radius:6px;padding:12px">
        <legend style="font:600 11px Inter;color:#7C3AED;padding:0 6px">issue credit</legend>
        <div style="display:flex;gap:8px;align-items:end">
          <label style="font-size:11px;color:#4B5563;flex:1">amount
            <input data-credit type=number value="10000" min="1" style="width:100%;padding:6px 8px;font:13px monospace;border:1px solid #d1d5db;border-radius:3px">
          </label>
          <label style="font-size:11px;color:#4B5563">source
            <select data-source style="padding:6px 8px;font:13px Inter;border:1px solid #d1d5db;border-radius:3px">
              <option>manual</option><option>plan</option><option>stripe</option>
              <option>usdc</option><option>refund</option>
            </select>
          </label>
          <button data-credit-go style="background:#7C3AED;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">ISSUE</button>
        </div>
      </fieldset>

      <fieldset style="border:1px solid #e5e7eb;border-radius:6px;padding:12px">
        <legend style="font:600 11px Inter;color:#E11D48;padding:0 6px">refund tx</legend>
        <div style="display:flex;gap:8px;align-items:end">
          <label style="font-size:11px;color:#4B5563;flex:1">tx_id
            <input data-tx-id type=text placeholder="tx_xxxxxxxxxxxx" style="width:100%;padding:6px 8px;font:11px Menlo,monospace;border:1px solid #d1d5db;border-radius:3px">
          </label>
          <label style="font-size:11px;color:#4B5563;flex:1">reason
            <input data-tx-reason type=text placeholder="reason" style="width:100%;padding:6px 8px;font:11px Inter;border:1px solid #d1d5db;border-radius:3px">
          </label>
          <button data-refund-go style="background:#E11D48;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">REFUND</button>
        </div>
      </fieldset>
    </div>

    <pre data-out style="margin-top:14px;background:#0F172A;color:#E2E8F0;padding:10px;border-radius:4px;font:11px Menlo,monospace;max-height:200px;overflow:auto;display:none"></pre>
  `;
  root.appendChild(dom);

  const $ = sel => dom.querySelector(sel);
  const out = $('[data-out]');
  const setKpi = (k, v) => { dom.querySelector(`[data-kpi="${k}"] div:last-child`).textContent = v; };
  const log = (label, payload) => {
    out.style.display = 'block';
    out.textContent = `${label}\n${JSON.stringify(payload, null, 2)}`;
  };

  const listeners = { change: [], result: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  async function lookup() {
    const a = $('[data-actor]').value.trim() || 'anon';
    const [bal, use] = await Promise.all([
      token.balance({ actor: a }),
      token.usage({ actor: a, days: 30 }),
    ]);
    setKpi('balance',  Number(bal).toLocaleString());
    if (use && use.usage) {
      const calls = use.usage.reduce((s, r) => s + parseInt(r.calls || 0, 10), 0);
      const spent = use.usage.reduce((s, r) => s + parseInt(r.spent || 0, 10), 0);
      setKpi('calls30d', calls.toLocaleString());
      setKpi('spent30d', spent.toLocaleString());
    } else {
      setKpi('calls30d', '—');
      setKpi('spent30d', '—');
    }
    log('lookup', { actor: a, balance: bal, usage: use });
    emit('change', { kind: 'lookup', actor: a, balance: bal });
  }

  async function issue() {
    const a = $('[data-actor]').value.trim();
    if (!a) return log('error', 'actor required');
    const credit = parseInt($('[data-credit]').value || '0', 10);
    const source = $('[data-source]').value;
    const r = await token.recharge({ actor: a, credit, source });
    log('recharge', r);
    if (r.ok) lookup();
    emit('result', r);
  }

  async function refund() {
    const id     = $('[data-tx-id]').value.trim();
    const reason = $('[data-tx-reason]').value.trim() || 'admin manual';
    if (!id) return log('error', 'tx_id required');
    try {
      const res = await fetch('/api/meter/refund', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-key': auth.adminKey() },
        body: JSON.stringify({ id, reason }),
      });
      const j = await res.json();
      log('refund', j);
      emit('result', j);
    } catch (e) {
      log('refund-error', e.message);
    }
  }

  $('[data-lookup]')   .addEventListener('click', lookup);
  $('[data-credit-go]').addEventListener('click', issue);
  $('[data-refund-go]').addEventListener('click', refund);

  await lookup();

  return {
    api: { lookup, issue, refund },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
