/**
 * @file widgets/token-balance.js
 * @description Tiny inline badge that shows the current actor's $CYCLE
 *   balance. Mounts into a status-bar slot or any container. Polls every
 *   30s. Click → opens token-recharge widget when the user is admin.
 *
 *   Contract:
 *     init({ mount, app, meter, params? }) → { api, on, destroy }
 *     api.refresh()           re-fetch balance
 *     api.setPollInterval(ms) override default 30s
 *     on('change', fn)        fires when balance changes
 *
 *   Visual: dark pill, gold accent matching the suite brand.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { token } from '../shared/token.js';
import { auth }  from '../shared/auth.js';

export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('token-balance: mount not found');

  const wrap = document.createElement('span');
  wrap.className = 'pt-token-balance';
  wrap.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    background: #0E1117; color: #D4A843; padding: 3px 10px;
    border-radius: 12px; font: 600 11px Inter, sans-serif;
    border: 1px solid #1d242e; cursor: pointer; user-select: none;
    transition: filter .15s;
  `;
  wrap.title = 'Click to recharge (admin) or view balance';
  wrap.innerHTML = `
    <span style="font-size:13px">∞</span>
    <span data-amount>—</span>
    <span style="opacity:.6;font-weight:400">$CYCLE</span>
  `;
  wrap.addEventListener('mouseenter', () => wrap.style.filter = 'brightness(1.3)');
  wrap.addEventListener('mouseleave', () => wrap.style.filter = '');
  root.appendChild(wrap);

  const amountEl = wrap.querySelector('[data-amount]');
  const isAdmin = !!auth.adminKey();
  if (isAdmin) {
    amountEl.textContent = '∞';
    wrap.querySelector('span').textContent = '🔑';
    wrap.title = 'Admin bypass — no charges. Click to issue $CYCLE.';
  }

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });
  let lastBalance = null;
  let pollMs = 30000;
  let timer = null;

  async function refresh() {
    if (isAdmin) {
      // Admins always see infinite — but we still call balance() so the
      // server sees a heartbeat and the audit log captures admin reads.
      await token.balance();
      return;
    }
    const b = await token.balance();
    if (b !== lastBalance) {
      lastBalance = b;
      amountEl.textContent = formatNumber(b);
      // Color hint: red if < 100, amber if < 1000, gold otherwise
      wrap.style.color = b < 100 ? '#E11D48' : b < 1000 ? '#F59E0B' : '#D4A843';
      emit('change', { balance: b });
    }
  }

  function formatNumber(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  // Click → dispatch a custom event the host can wire to token-recharge
  wrap.addEventListener('click', () => {
    wrap.dispatchEvent(new CustomEvent('token-balance:click', {
      bubbles: true,
      detail: { isAdmin, balance: lastBalance },
    }));
  });

  function startPolling() {
    if (timer) clearInterval(timer);
    timer = setInterval(refresh, pollMs);
  }

  await refresh();
  startPolling();

  return {
    api: {
      refresh,
      setPollInterval(ms) { pollMs = Math.max(5000, ms); startPolling(); },
      currentBalance() { return lastBalance; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      if (timer) clearInterval(timer);
      wrap.remove();
    },
  };
}
