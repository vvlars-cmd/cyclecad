/**
 * tests/integration/run.mjs
 *
 * Orchestrator. Imports each test file in series — the runner module is a
 * singleton so we flip an orchestrator flag (suppress per-file process.exit)
 * and reset the registry between files. Aggregates a final pass/fail tally.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resetRunner, summary } from './_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const FILES = [
  'walker.test.mjs',
  'tutorial-schema.test.mjs',
  'build-step-templates.test.mjs',
  'pdf-writer.test.mjs',
  'inventor-parsers.test.mjs',
  'ipj-parser-node.test.mjs',
  'mcp-server.test.mjs',
  'zip-writer.test.mjs',
  'workflow-runner.test.mjs',
  'server-endpoints.test.mjs',
  'modal-executor.test.mjs',
  'cam-3d-widgets.test.mjs',
  'phase3.test.mjs',
  'pentacad-engine.test.mjs',
];

globalThis.__INTEGRATION_ORCHESTRATED__ = true;

let totalRan = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const f of FILES) {
  console.log(`\n— ${f} —`);
  resetRunner();
  try {
    const mod = await import(pathToFileURL(path.join(HERE, f)).href);
    // The test file calls summary() itself at the bottom (await). After
    // the import resolves, register results from the module-level call.
    void mod;
  } catch (err) {
    totalFailed++;
    console.error(`✗ ${f} crashed:`, err && err.stack ? err.stack : err);
    continue;
  }
  // Each file has already printed its own summary line; aggregate by
  // re-running summary() — but it's flagged RAN so it returns 0/0/0.
  // Instead, we read the side-effect via a global the runner exposes.
  const last = globalThis.__LAST_SUMMARY__ || { ran: 0, passed: 0, failed: 0 };
  totalRan += last.ran;
  totalPassed += last.passed;
  totalFailed += last.failed;
}

console.log(`\n=================================`);
console.log(`TOTAL · ${totalRan} tests · ${totalPassed} passed · ${totalFailed} failed`);
if (totalFailed > 0) process.exit(1);

void summary; // keep import live
