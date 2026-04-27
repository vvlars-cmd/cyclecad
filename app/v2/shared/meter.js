/**
 * Token meter.
 *
 * - Online (default): hits POST /api/meter/charge → server ledger.
 * - Self-hosted: same path, served by the meter Docker container.
 * - Local dev: writes to localStorage ledger when no /api/meter is reachable.
 *
 * Admin keys (in localStorage:`cyclecad.adminKey` or env ADMIN_KEY) bypass
 * the charge; the call is still appended to the audit ledger with
 * actor = admin_root.
 */

// Resolve the API base. In production, apps/cyclecad/config.js sets
// window.CYCLECAD_CONFIG.apiBase = 'https://api.cyclecad.com'. When
// served behind the same origin (dev nginx + Caddy reverse-proxy) the
// path is relative and nothing changes.
function apiBase() {
  try {
    if (typeof window !== 'undefined' && window.CYCLECAD_CONFIG && window.CYCLECAD_CONFIG.apiBase) {
      return window.CYCLECAD_CONFIG.apiBase;
    }
  } catch { /* SSR / non-browser */ }
  return '';
}

const ENDPOINT = '/api/meter/charge';
const ADMIN_KEY_NAME = 'cyclecad.adminKey';

function adminKey() {
  try { return localStorage.getItem(ADMIN_KEY_NAME) || null; } catch { return null; }
}

async function postCharge(payload) {
  try {
    const res = await fetch(apiBase() + ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`meter ${res.status}`);
    return res.json();
  } catch (err) {
    // Fall through to the local ledger so dev still works without server.
    return localCharge(payload);
  }
}

function localCharge(payload) {
  const key = 'cyclecad.ledger';
  let log = [];
  try { log = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  const tx = {
    id: 'tx_' + Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
    cost: payload.adminBypass ? 0 : (payload.cost || 0),
    actor: payload.adminBypass ? 'admin_root' : (payload.actor || 'anon'),
    widget: payload.widget,
    kind:   payload.kind,
    bypass: !!payload.adminBypass,
  };
  log.push(tx);
  try { localStorage.setItem(key, JSON.stringify(log.slice(-1000))); } catch {}
  return { ok: true, tx };
}

/** @type {{ charge: Function, refund: Function }} */
export const meter = {
  /**
   * Pre-flight a widget call — Claude-style metering.
   *
   * Cost is computed server-side as:
   *     (tokensIn × rate_in[tier]) + (tokensOut × rate_out[tier])
   *   × (cache_hit ? 0.9 : 1)
   *   × (batchSize ≥ 10 ? 0.5 : batchSize ≥ 2 ? 0.75 : 1)
   *
   * @param {{
   *   widget: string,
   *   kind?: string,
   *   actor?: string,
   *   tokensIn?: number,    // sized input units, default 1
   *   tokensOut?: number,   // sized output units, default 1
   *   modelTier?: 'haiku'|'sonnet'|'opus',
   *   batchSize?: number,
   *   params?: object       // hashed server-side, never echoed back
   * }} payload
   */
  async charge(payload) {
    const ak = adminKey();
    return postCharge({
      tokensIn:  1,
      tokensOut: 1,
      modelTier: payload?.modelTier || 'sonnet',
      batchSize: 1,
      ...payload,
      adminBypass: !!ak,
      adminKey: ak,
    });
  },

  /**
   * Refund a transaction (e.g. on widget destroy or workflow rollback).
   * @param {{ tx?: { id: string }}} txRef
   */
  async refund(txRef) {
    if (!txRef || !txRef.tx) return;
    try {
      await fetch(apiBase() + '/api/meter/refund', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: txRef.tx.id }),
      });
    } catch { /* local-only mode: refunds are no-ops */ }
  },
};
