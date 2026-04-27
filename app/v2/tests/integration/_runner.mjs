/**
 * tests/integration/_runner.mjs
 *
 * Tiny zero-dep test runner for the Use Case 1 integration suite.
 * Pure ES module, no `node:test` — works on Node 18+.
 *
 * Usage:
 *   import { test, assert, assertEq, summary } from './_runner.mjs';
 *   test('my test', async () => { assert(true, 'ok'); });
 *   await summary();   // exits non-zero on any failure
 */

/** @type {Array<{name:string, fn:()=>any}>} */
const REGISTRY = [];
let RAN = false;

/**
 * Register a test. Tests run sequentially when summary() is called.
 *
 * @param {string} name
 * @param {() => any | Promise<any>} fn
 */
export function test(name, fn) {
  REGISTRY.push({ name, fn });
}

/**
 * Reset the singleton state — used by run.mjs between files so each
 * suite starts with a clean registry.
 */
export function resetRunner() {
  REGISTRY.length = 0;
  RAN = false;
}

/**
 * @param {boolean} cond
 * @param {string} [msg]
 */
export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

/**
 * Strict equality assertion.
 *
 * @param {any} a
 * @param {any} b
 * @param {string} [msg]
 */
export function assertEq(a, b, msg) {
  if (a !== b) {
    throw new Error(`${msg || 'assertEq failed'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

/**
 * Deep-equality assertion via JSON canonicalization.
 *
 * @param {any} a
 * @param {any} b
 * @param {string} [msg]
 */
export function assertDeep(a, b, msg) {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) {
    throw new Error(`${msg || 'assertDeep failed'}: expected ${jb}, got ${ja}`);
  }
}

/**
 * Run every registered test sequentially. Prints results + summary.
 * Exits non-zero on any failure.
 */
export async function summary() {
  if (RAN) return { ran: 0, passed: 0, failed: 0 };
  RAN = true;
  let passed = 0;
  let failed = 0;
  const ran = REGISTRY.length;
  for (const { name, fn } of REGISTRY) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${name} (${err && err.message ? err.message : err})`);
      failed++;
    }
  }
  console.log(`\n${ran} tests · ${passed} passed · ${failed} failed`);
  const result = { ran, passed, failed };
  globalThis.__LAST_SUMMARY__ = result;
  // When invoked standalone (no orchestrator), exit non-zero on failure.
  if (failed > 0 && !globalThis.__INTEGRATION_ORCHESTRATED__) {
    process.exit(1);
  }
  return result;
}

/**
 * Auto-run when the runner file is imported but the caller forgets to call
 * summary() — keeps single-file `node x.test.mjs` invocations working.
 */
process.on('beforeExit', () => { if (!RAN && REGISTRY.length) summary(); });
