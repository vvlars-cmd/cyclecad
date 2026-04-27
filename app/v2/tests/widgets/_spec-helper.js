/**
 * Shared helper for widget spec pages. Sets up a host viewport, runs the
 * tests array, posts spec-result to parent.
 *
 * Usage:
 *   <script type="module">
 *   import { runSpec } from './_spec-helper.js';
 *   import { init as initWidget } from '../../widgets/<name>.js';
 *   runSpec({
 *     widget: '<name>',
 *     tests:  (ctx) => [
 *       { n: 'init returns handle', fn: async () => { ctx.handle = await initWidget(...); } },
 *       ...
 *     ]
 *   });
 *   </script>
 */

import * as THREE from 'three';
import { init as initViewport } from '../../widgets/viewport.js';

export async function runSpec({ widget, tests, needsViewport = true }) {
  const stage = document.getElementById('stage');
  const sumEl = document.getElementById('summary');
  const rowsEl = document.getElementById('rows');

  const ctx = { stage, THREE };
  if (needsViewport) {
    ctx.viewport = await initViewport({ mount: stage });
    ctx.scene    = ctx.viewport.api.getScene();
    ctx.camera   = ctx.viewport.api.getCamera();
    ctx.renderer = ctx.viewport.api.getRenderer();
    ctx.root     = ctx.viewport.api.getRoot();
  }

  const list = await tests(ctx);
  let passed = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const tr = document.createElement('tr');
    let cell = `<td>${i + 1}</td><td>${esc(t.n)}</td>`;
    try {
      await t.fn();
      cell += `<td class="r pass">PASS</td><td></td>`;
      passed++;
    } catch (e) {
      cell += `<td class="r fail">FAIL</td><td>${esc(String(e.message || e))}</td>`;
    }
    tr.innerHTML = cell;
    rowsEl.appendChild(tr);
  }

  if (needsViewport && ctx.viewport) ctx.viewport.destroy();

  const ok = passed === list.length;
  sumEl.className = `summary ${ok ? 'pass' : 'fail'}`;
  sumEl.textContent = `${ok ? '✓' : '✗'}  ${passed} / ${list.length} passed`;

  if (window.parent !== window) {
    window.parent.postMessage({
      type: 'spec-result', widget,
      pass: ok, passed, total: list.length,
    }, '*');
  }
}

function esc(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
}

export const SPEC_HEAD = `<style>
  body { margin: 0; padding: 24px; background: #FAFAFA; font: 13px Inter, sans-serif; }
  h1 { font: 600 22px Georgia, serif; margin: 0 0 12px; }
  .summary { padding: 10px 14px; border-radius: 4px; margin-bottom: 16px; font-weight: 500; }
  .summary.pass { background: #E7F8EE; color: #166534; }
  .summary.fail { background: #FEE2E2; color: #991B1B; }
  table { border-collapse: collapse; width: 100%; max-width: 900px; }
  td, th { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { background: #fff; font-size: 11px; text-transform: uppercase; }
  td.r { font-weight: 500; }
  td.pass { color: #166534; }
  td.fail { color: #991B1B; }
  #stage { position: fixed; left: -2000px; top: 0; width: 800px; height: 600px; }
</style>`;
