/**
 * @file widgets/token-recharge.js
 * @description Admin-gated $CYCLE recharge dialog. Mounts a form with:
 *   actor · credit amount · source · reference; calls token.recharge().
 *
 *   Non-admin users see a read-only "request top-up" form that emits a
 *   `recharge-request` event the host can route to support.
 *
 *   Contract:
 *     init({ mount, app, meter }) → { api, on, destroy }
 *     api.fillFor(actor)   pre-fill the form for a target actor
 *     api.run()            submit current form values
 *     on('change', fn)     fires after a successful recharge
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { token } from '../shared/token.js';
import { auth }  from '../shared/auth.js';

export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('token-recharge: mount not found');

  const isAdmin = !!auth.adminKey();
  const wrap = document.createElement('div');
  wrap.className = 'pt-token-recharge';
  wrap.style.cssText = `
    font: 13px/1.5 Inter, sans-serif; color: #1A1A1A; padding: 18px;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 6px;
    max-width: 540px;
  `;
  wrap.innerHTML = `
    <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px">$CYCLE · RECHARGE</div>
    <div style="font:600 20px Georgia;margin-bottom:12px">Issue $CYCLE credits</div>
    <div style="color:#6B7280;font-size:12px;margin-bottom:14px">
      ${isAdmin
        ? 'Admin · this writes a row to the <code>credits</code> table. The hash-chained ledger remains untouched.'
        : 'Read-only · submit a request and a Suite admin will issue credit.'}
    </div>
    ${formGrid(isAdmin)}
    <div style="margin-top:14px;display:flex;gap:10px;align-items:center">
      <button data-run style="background:${isAdmin ? '#7C3AED' : '#9CA3AF'};color:#fff;border:none;padding:8px 18px;border-radius:4px;font:600 12px Inter;cursor:pointer">
        ${isAdmin ? 'ISSUE CREDIT' : 'SUBMIT REQUEST'}
      </button>
      <span data-status style="font:11px Menlo,monospace;color:#6B7280">idle</span>
    </div>
    <pre data-out style="margin-top:14px;background:#0F172A;color:#E2E8F0;padding:10px;border-radius:4px;font:11px Menlo,monospace;max-height:160px;overflow:auto;display:none"></pre>
  `;
  root.appendChild(wrap);

  const status = wrap.querySelector('[data-status]');
  const out    = wrap.querySelector('[data-out]');
  const inputs = {
    actor:     wrap.querySelector('[name=actor]'),
    credit:    wrap.querySelector('[name=credit]'),
    source:    wrap.querySelector('[name=source]'),
    reference: wrap.querySelector('[name=reference]'),
  };
  inputs.actor.value = token.actor();
  inputs.source.value = isAdmin ? 'manual' : 'self-request';

  const listeners = { change: [], result: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  async function run() {
    const payload = {
      actor:     inputs.actor.value || token.actor(),
      credit:    parseInt(inputs.credit.value || '0', 10),
      source:    inputs.source.value || 'manual',
      reference: inputs.reference.value || null,
    };
    if (!payload.actor || !payload.credit) {
      status.textContent = 'actor + credit required';
      return { ok: false, error: 'invalid' };
    }

    if (!isAdmin) {
      // Non-admin path: emit an event the host can pipe to support / Stripe
      const reqId = 'req_' + Math.random().toString(36).slice(2, 10);
      const result = { ok: true, requestId: reqId, queued: true, payload };
      out.style.display = 'block';
      out.textContent = JSON.stringify(result, null, 2);
      status.textContent = 'queued — admin will action';
      emit('result', result);
      emit('change', { kind: 'request', payload });
      return result;
    }

    status.textContent = 'issuing…';
    const r = await token.recharge(payload);
    if (!r.ok) {
      status.textContent = `error · ${r.error || 'unknown'}`;
      out.style.display = 'block';
      out.textContent = JSON.stringify(r, null, 2);
      return r;
    }
    status.textContent = `done · new balance ${r.balance}`;
    out.style.display = 'block';
    out.textContent = JSON.stringify(r, null, 2);
    emit('result', r);
    emit('change', { kind: 'recharge', payload, result: r });
    return r;
  }

  wrap.querySelector('[data-run]').addEventListener('click', () => run());

  return {
    api: {
      run,
      fillFor(actor) { inputs.actor.value = actor; },
      currentForm() { return {
        actor: inputs.actor.value, credit: parseInt(inputs.credit.value || '0', 10),
        source: inputs.source.value, reference: inputs.reference.value,
      }; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { wrap.remove(); },
  };
}

function formGrid(isAdmin) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px">
      <label style="font-size:11px;color:#4B5563">actor
        <input name=actor type=text value="" style="width:100%;padding:6px 8px;font:13px monospace;border:1px solid #d1d5db;border-radius:3px;${isAdmin?'':'background:#f9fafb'}" ${isAdmin?'':'disabled'}>
      </label>
      <label style="font-size:11px;color:#4B5563">credit ($CYCLE, integer)
        <input name=credit type=number value="1000" min="1" style="width:100%;padding:6px 8px;font:13px monospace;border:1px solid #d1d5db;border-radius:3px">
      </label>
      <label style="font-size:11px;color:#4B5563">source
        <select name=source style="width:100%;padding:6px 8px;font:13px Inter;border:1px solid #d1d5db;border-radius:3px">
          <option value="manual">manual</option>
          <option value="plan">plan</option>
          <option value="stripe">stripe</option>
          <option value="usdc">usdc</option>
          <option value="refund">refund</option>
          <option value="self-request">self-request</option>
        </select>
      </label>
      <label style="font-size:11px;color:#4B5563">reference (optional)
        <input name=reference type=text placeholder="invoice / tx hash / ticket"
          style="width:100%;padding:6px 8px;font:12px monospace;border:1px solid #d1d5db;border-radius:3px">
      </label>
    </div>
  `;
}
