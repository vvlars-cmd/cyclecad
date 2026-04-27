/**
 * tests/integration/workflow-runner.test.mjs
 *
 * Black-box tests against server/workflow/runner.mjs by spawning it as a
 * child process. The runner is a CLI tool with top-level side effects
 * (parses argv, calls process.exit) so it's not import-friendly — we test
 * the real binary via `node server/workflow/runner.mjs ...`.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os   from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync }     from 'node:child_process';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE      = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const RUNNER    = path.join(REPO_ROOT, 'server', 'workflow', 'runner.mjs');
const NODE      = process.execPath;

/**
 * Run the workflow runner CLI and capture stdout/stderr/exit.
 * @param {string[]} args
 * @param {{cwd?:string}} [opts]
 */
function runRunner(args, opts = {}) {
  const r = spawnSync(NODE, [RUNNER, ...args], {
    cwd: opts.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    combined: (r.stdout || '') + (r.stderr || ''),
    error:  r.error || null,
  };
}

/**
 * Write a JSON workflow to a temp file under os.tmpdir().
 * Returns the absolute path. Caller is responsible for cleanup.
 * @param {object} body
 * @param {string} [filename]
 */
async function writeTempWorkflow(body, filename = 'flow.json') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-runner-'));
  const p = path.join(dir, filename);
  await fs.writeFile(p, JSON.stringify(body, null, 2), 'utf8');
  return { path: p, dir };
}

/* ────────────────────────────────────────────────────────────────────────
   tests
   ──────────────────────────────────────────────────────────────────── */

test('runner exists at server/workflow/runner.mjs', async () => {
  const stat = await fs.stat(RUNNER);
  assert(stat.isFile(), 'runner.mjs is a file');
});

test('--help exits 0 and prints usage', () => {
  const r = runRunner(['--help']);
  assertEq(r.status, 0, `expected 0, got ${r.status}\n${r.combined}`);
  assert(r.stdout.includes('runner.mjs'), 'usage banner missing');
  assert(r.stdout.includes('--dry-run'),  'dry-run flag mention missing');
});

test('missing workflow argument exits 2 with clear error', () => {
  const r = runRunner([]);
  assertEq(r.status, 2, `expected exit 2, got ${r.status}`);
  assert(r.stderr.includes('missing workflow path'),
    `stderr should mention missing workflow path; got: ${r.stderr}`);
});

test('non-existent workflow file exits 1 with clear error', () => {
  const r = runRunner(['/tmp/__definitely_does_not_exist__.json', '--dry-run']);
  assert(r.status !== 0, `expected non-zero, got ${r.status}`);
  assert(/cannot read workflow/i.test(r.combined),
    `error message should mention cannot read workflow; got: ${r.combined}`);
});

test('invalid JSON workflow exits 1 with parse error', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-runner-bad-'));
  const p = path.join(dir, 'bad.json');
  try {
    await fs.writeFile(p, '{ this is not json', 'utf8');
    const r = runRunner([p, '--dry-run']);
    assert(r.status !== 0, `expected non-zero, got ${r.status}`);
    assert(/not valid JSON/i.test(r.combined),
      `expected JSON parse error; got: ${r.combined}`);
  } finally {
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
  }
});

test('dry-run validates the bundled workflows/build-duo.json', () => {
  const wf = path.join(REPO_ROOT, 'workflows', 'build-duo.json');
  const r = runRunner([wf, '--dry-run']);
  // Build-duo declares a for-each over `captures.components` which is
  // undefined in dry-run. The runner treats an undefined items list as an
  // empty array (renders to []), so the for-each completes with 0 items.
  // The runner's exit code reflects whether any phase aborted.
  assert(r.status === 0 || r.status === 1,
    `unexpected exit ${r.status}: ${r.combined.slice(0, 400)}`);
  assert(/validated workflow/i.test(r.combined),
    `should print "validated workflow"; got: ${r.combined.slice(0, 400)}`);
});

test('custom 2-phase workflow dry-run mentions both phase IDs', async () => {
  const wf = {
    id: 'test-2phase',
    version: 1,
    title: 'two phase smoke',
    phases: [
      { id: 'note-one', kind: 'note', message: 'first phase' },
      { id: 'note-two', kind: 'note', message: 'second phase' },
    ],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run']);
    assertEq(r.status, 0, `expected 0, got ${r.status}\n${r.combined}`);
    assert(r.combined.includes('note-one'), 'note-one phase id should appear');
    assert(r.combined.includes('note-two'), 'note-two phase id should appear');
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('template interpolation: {{tenantId}} is substituted in dry-run output', async () => {
  const wf = {
    id: 'tpl-test',
    version: 1,
    inputs: { tenantId: { type: 'string', default: 'default' } },
    phases: [
      {
        id: 'fetch-foo',
        kind: 'http',
        method: 'GET',
        path: '/api/foo/{{tenantId}}',
      },
    ],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run', '--input.tenantId=acme', '--verbose']);
    assertEq(r.status, 0, `expected 0, got ${r.status}\n${r.combined}`);
    assert(r.combined.includes('/api/foo/acme'),
      `expected rendered path /api/foo/acme; got:\n${r.combined.slice(0, 500)}`);
    // and the literal `{{tenantId}}` should NOT appear in the dry-run line
    assert(!/GET .*\{\{tenantId\}\}/.test(r.combined),
      'literal template should not survive in rendered output');
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('template interpolation: a single-token body preserves array shape', async () => {
  // Using verbose + a body that is an array reference. We just validate
  // the runner accepts it and dry-runs without crashing.
  const wf = {
    id: 'array-tpl',
    version: 1,
    inputs: {
      kinds: { type: 'array', default: ['a', 'b', 'c'] },
    },
    phases: [
      {
        id: 'post-arr',
        kind: 'http',
        method: 'POST',
        path: '/api/x',
        body: { kinds: '{{kinds}}' },
      },
    ],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run', '--verbose']);
    assertEq(r.status, 0, `expected 0, got ${r.status}\n${r.combined}`);
    // body is logged as JSON when verbose; expect to see the array literal
    assert(/"kinds":\s*\["a","b","c"\]/.test(r.combined.replace(/\s+/g, ' ')) ||
           r.combined.includes('"a","b","c"'),
      `expected array body in dry-run output; got:\n${r.combined.slice(0, 500)}`);
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('for-each over inputs array: enters & exits per item in dry-run (verbose)', async () => {
  const wf = {
    id: 'foreach-test',
    version: 1,
    inputs: { items: { type: 'array', default: [{ id: 1 }, { id: 2 }, { id: 3 }] } },
    phases: [
      {
        id: 'loop',
        kind: 'for-each',
        items: '{{items}}',
        as: 'c',
        phases: [
          { id: 'inner-note', kind: 'note', message: 'item-{{c.id}}' },
        ],
      },
    ],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run', '--verbose']);
    assertEq(r.status, 0, `expected 0, got ${r.status}\n${r.combined}`);
    // verbose mode logs "enter note inner-note" once per iteration
    const enterCount = (r.combined.match(/enter note inner-note/g) || []).length;
    assertEq(enterCount, 3, `expected 3 inner-note enters; got ${enterCount}\n${r.combined.slice(0, 600)}`);
    // notes should resolve {{c.id}} for each item
    assert(r.combined.includes('item-1'), 'item-1 missing');
    assert(r.combined.includes('item-2'), 'item-2 missing');
    assert(r.combined.includes('item-3'), 'item-3 missing');
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('onError=continue: a failing phase does NOT abort the run', async () => {
  // We provoke a failure by giving a synthesize-tutorial phase an empty
  // componentId after rendering (the runner throws for that).
  const wf = {
    id: 'onerror-test',
    version: 1,
    inputs: { compId: { type: 'string', default: '' } },
    phases: [
      {
        id: 'will-fail',
        kind: 'synthesize-tutorial',
        componentId: '{{compId}}',
        onError: 'continue',
      },
      { id: 'after',  kind: 'note', message: 'still running' },
    ],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run']);
    // run should NOT exit non-zero because onError is 'continue'
    assertEq(r.status, 0, `expected exit 0 with onError=continue; got ${r.status}\n${r.combined}`);
    assert(r.combined.includes('still running'),
      `subsequent phase should run; got:\n${r.combined.slice(0, 400)}`);
    // and the warn line should mention `continue`
    assert(/continue/i.test(r.combined),
      `expected a "continue" warning; got:\n${r.combined.slice(0, 400)}`);
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('onError=abort (default): a failing phase aborts the run', async () => {
  const wf = {
    id: 'abort-test',
    version: 1,
    phases: [
      { id: 'will-fail', kind: 'synthesize-tutorial', componentId: '' },
      { id: 'never-runs', kind: 'note', message: 'should not appear' },
    ],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run']);
    assert(r.status !== 0, `expected non-zero exit on default abort; got ${r.status}`);
    assert(!r.combined.includes('should not appear'),
      'subsequent phase ran despite abort');
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('schema validation: missing kind on a phase exits 1', async () => {
  const wf = {
    id: 'bad-phase',
    version: 1,
    phases: [{ id: 'orphan' /* no kind */ }],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run']);
    assert(r.status !== 0, `expected non-zero, got ${r.status}`);
    assert(/missing kind|structural problem/i.test(r.combined),
      `error should mention missing kind; got:\n${r.combined.slice(0, 400)}`);
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('schema validation: unknown kind exits 1', async () => {
  const wf = {
    id: 'bad-kind',
    version: 1,
    phases: [{ id: 'mystery', kind: 'mystery-kind' }],
  };
  const t = await writeTempWorkflow(wf);
  try {
    const r = runRunner([t.path, '--dry-run']);
    assert(r.status !== 0, `expected non-zero, got ${r.status}`);
    assert(/unknown kind/i.test(r.combined),
      `expected "unknown kind"; got:\n${r.combined.slice(0, 400)}`);
  } finally {
    try { await fs.rm(t.dir, { recursive: true, force: true }); } catch {}
  }
});

test('retry-on-5xx logic: SKIPPED — needs a live HTTP server to assert', () => {
  // The runner only retries when retry.count > 1 AND the response status is
  // 5xx. Exercising that branch requires a fixture HTTP server we don't want
  // to stand up in the integration suite. Validated indirectly by the build
  // smoke runs against the meter; flagged here so the gap is visible.
  console.warn('  ! skipped: retry-on-5xx requires a live HTTP fixture server');
});

await summary();
