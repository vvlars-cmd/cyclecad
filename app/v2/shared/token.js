/**
 * @file shared/token.js
 * @description $CYCLE token engine — client SDK.
 *
 *   Wraps the meter REST surface so widgets and apps don't talk to /api
 *   directly. Pairs with shared/meter.js (which handles the per-call charge
 *   path) by adding the read-side primitives + admin-gated recharge.
 *
 *   Endpoints used:
 *     GET  /api/meter/balance?actor=
 *     GET  /api/meter/plans
 *     GET  /api/meter/usage?actor=&days=
 *     POST /api/meter/recharge       (admin key required)
 *
 *   The admin key (if present in localStorage:`cyclecad.adminKey`) is sent
 *   in the `x-admin-key` header for any privileged call. Identity defaults:
 *     - actor: localStorage:`cyclecad.actor` || 'anon'
 *     - tenant: shared/auth.tenantId()
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { auth } from './auth.js';

const ACTOR_KEY = 'cyclecad.actor';

/** Resolve the current actor (display name / id used in the ledger). */
export function actor() {
  if (auth.adminKey()) return 'admin_root';
  try { return localStorage.getItem(ACTOR_KEY) || 'anon'; } catch { return 'anon'; }
}

/** Set the current actor — typically called after sign-in. */
export function setActor(name) {
  try { localStorage.setItem(ACTOR_KEY, name); } catch {}
}

function adminHeaders() {
  const h = { 'content-type': 'application/json' };
  const k = auth.adminKey();
  if (k) h['x-admin-key'] = k;
  const t = auth.tenantId();
  if (t) h['x-tenant'] = t;
  return h;
}

/**
 * Return the actor's current $CYCLE balance.
 * @param {{actor?: string}} [opts]
 * @returns {Promise<number>}
 */
export async function balance(opts = {}) {
  const a = opts.actor || actor();
  try {
    const r = await fetch(`/api/meter/balance?actor=${encodeURIComponent(a)}`, {
      headers: adminHeaders(),
    });
    if (!r.ok) return 0;
    const j = await r.json();
    return typeof j.balance === 'number' ? j.balance : 0;
  } catch {
    return 0;
  }
}

/**
 * List available plans + pricing tiers.
 * @returns {Promise<{ok: boolean, plans: Array<Object>}>}
 */
export async function plans() {
  try {
    const r = await fetch('/api/meter/plans');
    if (!r.ok) return { ok: false, plans: [] };
    return r.json();
  } catch {
    return { ok: false, plans: [] };
  }
}

/**
 * Daily usage rollup for the last N days.
 * @param {{actor?: string, days?: number}} [opts]
 * @returns {Promise<{ok: boolean, usage: Array<{day: string, calls: number, spent: number}>}>}
 */
export async function usage(opts = {}) {
  const a = opts.actor || actor();
  const d = opts.days || 30;
  try {
    const r = await fetch(`/api/meter/usage?actor=${encodeURIComponent(a)}&days=${d}`);
    if (!r.ok) return { ok: false, usage: [] };
    return r.json();
  } catch {
    return { ok: false, usage: [] };
  }
}

/**
 * Issue $CYCLE credit to an actor. Requires admin key.
 *
 * @param {{actor: string, credit: number, source?: string, reference?: string, tenant?: string}} payload
 * @returns {Promise<{ok: boolean, balance?: number, error?: string}>}
 */
export async function recharge(payload) {
  if (!auth.adminKey()) {
    return { ok: false, error: 'admin key required (set localStorage.cyclecad.adminKey)' };
  }
  if (!payload || !payload.actor || !payload.credit) {
    return { ok: false, error: 'payload requires { actor, credit }' };
  }
  try {
    const r = await fetch('/api/meter/recharge', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Walk the hash chain (admin-only).
 * @returns {Promise<{ok: boolean, total: number, mismatched: number}>}
 */
export async function auditVerify() {
  try {
    const r = await fetch('/api/meter/audit/verify', { headers: adminHeaders() });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return r.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Fetch admin-only ledger rows.
 * @param {{actor?: string, tenant?: string, limit?: number}} [opts]
 */
export async function ledger(opts = {}) {
  const params = new URLSearchParams();
  if (opts.actor)  params.set('actor',  opts.actor);
  if (opts.tenant) params.set('tenant', opts.tenant);
  if (opts.limit)  params.set('limit',  String(opts.limit));
  try {
    const r = await fetch(`/api/meter/ledger?${params.toString()}`, { headers: adminHeaders() });
    if (!r.ok) return { ok: false, ledger: [], error: `HTTP ${r.status}` };
    return r.json();
  } catch (e) {
    return { ok: false, ledger: [], error: e.message };
  }
}

/**
 * Current per-tier $CYCLE rates (Claude-style haiku / sonnet / opus).
 * @returns {Promise<{ok: boolean, rates: Object<string,{in:number,out:number,notes?:string}>}>}
 */
export async function rates() {
  try {
    const r = await fetch('/api/meter/rates');
    if (!r.ok) return { ok: false, rates: {} };
    return r.json();
  } catch {
    return { ok: false, rates: {} };
  }
}

/**
 * Earnings for a creator (Phase 10 turns this into payout flow).
 * @param {{creator: string, since?: string}} opts
 */
export async function earnings(opts) {
  if (!opts?.creator) return { ok: false, error: 'creator required' };
  const params = new URLSearchParams({ creator: opts.creator });
  if (opts.since) params.set('since', opts.since);
  try {
    const r = await fetch(`/api/meter/earnings?${params.toString()}`, { headers: adminHeaders() });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return r.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Estimate the cost of a call before placing it. Mirrors Claude's
 * `count_tokens` endpoint pattern: lets the UI surface "this will cost ~N
 * $CYCLE" before the user clicks.
 *
 * @param {{tokensIn?: number, tokensOut?: number, modelTier?: string, batchSize?: number, cacheHit?: boolean}} call
 * @param {Object<string,{in:number,out:number}>} [rateTable] from rates()
 * @returns {number}
 */
export function estimate(call, rateTable) {
  const tier = (call.modelTier || 'sonnet').toLowerCase();
  const t    = (rateTable && rateTable[tier]) || { in: 1, out: 5 };
  const tin  = Math.max(1, call.tokensIn  || 1);
  const tout = Math.max(1, call.tokensOut || 1);
  let raw = (tin * t.in) + (tout * t.out);
  let mult = 1;
  if (call.cacheHit)               mult *= 0.9;
  if ((call.batchSize || 1) >= 10) mult *= 0.5;
  else if ((call.batchSize || 1) >= 2) mult *= 0.75;
  return Math.round(raw * mult);
}

/** Public surface */
export const token = {
  actor, setActor,
  balance, plans, usage, rates, earnings, estimate,
  recharge, auditVerify, ledger,
};
