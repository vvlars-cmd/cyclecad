/**
 * @file shared/auth.js
 * @description Browser-side identity primitives.
 *
 *   Stage 1 scope:
 *     - admin HMAC bypass key (already worked via meter.js localStorage)
 *     - API-key generation + verification helpers
 *     - tenant_id resolution from URL or localStorage
 *     - OAuth route stubs (return 501 to remind callers it's not wired)
 *
 *   Stage 1 OUT of scope:
 *     - real Argon2 hashing (sha256 here, upgraded in Phase 3)
 *     - real OAuth provider flows (Google · GitHub) — Phase 3
 *     - SAML / OIDC SSO — Phase 9
 *
 *   Server-side validation lives in server/meter — this file is the client
 *   surface only. The meter is the single enforcement point.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const ADMIN_KEY_NAME    = 'cyclecad.adminKey';
const TENANT_NAME       = 'cyclecad.tenantId';
const API_KEY_NAME      = 'cyclecad.apiKey';
const ROLE_NAME         = 'cyclecad.role';
const KEY_PREFIX        = 'cyclecad_';        // per-key prefix for display

// ---------------------------------------------------------------------------
// admin HMAC
// ---------------------------------------------------------------------------

/** Read the stored admin key (if any). Local-storage only — never sent
 *  to the network without user action. */
export function adminKey() {
  try { return localStorage.getItem(ADMIN_KEY_NAME) || null; } catch { return null; }
}

/** Set the admin key. Used by `cyclecad-admin-set-key` UI action. */
export function setAdminKey(key) {
  try { localStorage.setItem(ADMIN_KEY_NAME, key); } catch { /* private mode */ }
}

/** Remove the admin key (for revocation / sign-out flows). */
export function clearAdminKey() {
  try { localStorage.removeItem(ADMIN_KEY_NAME); } catch { /* nothing */ }
}

// ---------------------------------------------------------------------------
// tenant_id
// ---------------------------------------------------------------------------

/** Resolve tenant_id in this priority:
 *    1. URL query param ?t=<tenant>
 *    2. localStorage['cyclecad.tenantId']
 *    3. 'default'
 */
export function tenantId() {
  try {
    const u = new URL(window.location.href);
    const t = u.searchParams.get('t');
    if (t) { localStorage.setItem(TENANT_NAME, t); return t; }
    return localStorage.getItem(TENANT_NAME) || 'default';
  } catch {
    return 'default';
  }
}

// ---------------------------------------------------------------------------
// role
// ---------------------------------------------------------------------------

/** Read the current actor's role. Real OAuth/SSO will set this; for
 *  Stage 1 it's manually set or defaults to 'viewer'. */
export function role() {
  if (adminKey()) return 'admin';
  try { return localStorage.getItem(ROLE_NAME) || 'viewer'; } catch { return 'viewer'; }
}

export function setRole(r) {
  try { localStorage.setItem(ROLE_NAME, r); } catch { /* nothing */ }
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

/**
 * Generate a new API key. Returns the key (shown ONCE) plus a sha256 hash
 * suitable for storing on the server.
 *
 * Stage 1 uses Web Crypto sha256. Phase 3 upgrades to Argon2 server-side.
 *
 * @param {{label?: string, scopes?: string[]}} [opts]
 * @returns {Promise<{key: string, hash: string, label: string, scopes: string[]}>}
 */
export async function generateApiKey(opts = {}) {
  const label  = opts.label  || 'unnamed';
  const scopes = opts.scopes || ['widgets:call'];
  const random = crypto.getRandomValues(new Uint8Array(32));
  const key    = KEY_PREFIX + base64UrlEncode(random);
  const hash   = await sha256Hex(key);
  return { key, hash, label, scopes };
}

/** Verify an API key string against a stored hash. */
export async function verifyApiKey(key, expectedHash) {
  if (!key || !expectedHash) return false;
  const got = await sha256Hex(key);
  return got === expectedHash;
}

/** Read the current user's API key from localStorage (if any). */
export function currentApiKey() {
  try { return localStorage.getItem(API_KEY_NAME) || null; } catch { return null; }
}

export function setApiKey(key) {
  try { localStorage.setItem(API_KEY_NAME, key); } catch { /* nothing */ }
}

// ---------------------------------------------------------------------------
// OAuth — STUBS (Phase 3 wires the real flows)
// ---------------------------------------------------------------------------

/** Begin OAuth login. Stage 1 returns a 501 promise so callers see "not
 *  wired" instead of failing silently. */
export function loginWithGoogle() {
  return Promise.reject(new Error(
    'OAuth (Google) is stubbed in Stage 1. Use admin key for now. ' +
    'Real flow wires in Phase 3.'
  ));
}

export function loginWithGitHub() {
  return Promise.reject(new Error(
    'OAuth (GitHub) is stubbed in Stage 1. Use admin key for now. ' +
    'Real flow wires in Phase 3.'
  ));
}

export function loginWithSSO() {
  return Promise.reject(new Error(
    'SSO (SAML/OIDC) is stubbed — enterprise self-host only · Phase 9.'
  ));
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function sha256Hex(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export const auth = {
  // identity
  adminKey, setAdminKey, clearAdminKey,
  tenantId,
  role, setRole,
  currentApiKey, setApiKey,

  // API keys
  generateApiKey, verifyApiKey,

  // OAuth (stubs)
  loginWithGoogle, loginWithGitHub, loginWithSSO,
};
