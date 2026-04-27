/**
 * @file widgets/cam-flow.js
 * @description CAM · 3D flow-line finishing — Phase 2 3D strategy (deferred).
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `flow`).
 *   Note: the registry lists `flow` in the `deferred[]` block — real
 *   flow-line finishing requires OCCT u/v parameter extraction from a
 *   parametric surface representation Pentacad doesn't ship until OCCT
 *   WASM lands. We ship a credible demo here so the widget slot is filled
 *   end-to-end. The synthetic surface uses fake (u, v) parameters laid
 *   out as a unit-square grid; flow-lines run along constant-v rows then
 *   constant-u columns.
 *
 *   When OCCT WASM lands the body of `buildMotions()` will switch to a
 *   real `surface.uvLines()` query — the public widget contract stays
 *   unchanged. Marked clearly here so future maintainers don't mistake
 *   this for a finished implementation.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'flow';
const WIDGET = 'cam-flow';

/**
 * Local descriptor — the public registry has `flow` under `deferred[]`
 * (no `params`), so we synthesise a usable shape here and clearly mark
 * its origin.
 *
 * @returns {{
 *   id:string, name:string, kind:string, phase:number, widget:string,
 *   description:string, params:string[], axes:string[], minimumMachine:string
 * }}
 */
function flowDescriptor() {
  return {
    id: STRATEGY_ID,
    name: '3D Flow',
    kind: '3d',
    phase: 2,
    widget: WIDGET,
    description: 'Flow-line finishing along surface u/v parameter lines (demo — OCCT WASM required for real surface u/v).',
    params: ['stepOver', 'feedrate', 'spindleRpm'],
    axes: ['X', 'Y', 'Z'],
    minimumMachine: 'v2-50',
  };
}

/**
 * Synthetic parametric surface — saddle-ish bowl in (u,v) ∈ [0,1]².
 * Maps (u,v) → (x,y,z). Real flow-line finishing would replace this with
 * an OCCT u/v parameter query.
 *
 * @param {number} u
 * @param {number} v
 * @returns {{x:number,y:number,z:number}}
 */
function surfaceUV(u, v) {
  const x = (u - 0.5) * 32;
  const y = (v - 0.5) * 32;
  const z = -1.0 + 1.5 * Math.sin(u * Math.PI) * Math.cos(v * Math.PI * 2);
  return { x, y, z };
}

/**
 * Build the flow-line motion stream — sweep along constant-v then
 * constant-u parameter lines, alternating directions.
 *
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
export function buildMotions(p) {
  const stepOver = Math.max(0.5, Number(p.stepOver ?? 1.5));
  const f = Number(p.feedrate ?? 550);
  const rpm = Number(p.spindleRpm ?? 9500);

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `3D flow · uv-grid · stepover=${stepOver}` },
    { kind: 'tool-change', toolNumber: 5, description: '4 mm ball endmill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm, dir: 'cw' },
    { kind: 'coolant', mode: 'mist' },
  ];

  // Constant-v rows
  const rows = Math.max(2, Math.ceil(32 / stepOver));
  const samples = 28;
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const dir = r % 2 === 0 ? 1 : -1;
    /** @type {Array<{x:number,y:number,z:number}>} */
    const row = [];
    for (let s = 0; s <= samples; s++) {
      const u = s / samples;
      row.push(surfaceUV(u, v));
    }
    if (dir < 0) row.reverse();
    m.push({ kind: 'rapid', X: row[0].x, Y: row[0].y, Z: 6 });
    m.push({ kind: 'linear', X: row[0].x, Y: row[0].y, Z: row[0].z, F: f * 0.5 });
    for (let i = 1; i < row.length; i++) {
      m.push({ kind: 'linear', X: row[i].x, Y: row[i].y, Z: row[i].z, F: f });
    }
    m.push({ kind: 'rapid', Z: 6 });
  }

  m.push({ kind: 'rapid', Z: 8 });
  m.push({ kind: 'spindle', mode: 'off' });
  m.push({ kind: 'coolant', mode: 'off' });
  m.push({ kind: 'home' });
  m.push({ kind: 'end' });
  return m;
}

/**
 * @param {{ mount:string|HTMLElement, app?:string,
 *           meter?:{ charge:Function },
 *           params?:{ machineId?:string } }} opts
 * @returns {Promise<{ api:object, on:Function, destroy:Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);
  const desc = flowDescriptor();
  const machineId = opts.params?.machineId || defaultMachine().id;

  const dom = document.createElement('div');
  dom.className = 'pt-cam-flow';
  dom.style.cssText = 'padding:18px 20px;font:13px Inter,sans-serif;background:#fff;color:#0F172A;border:1px solid #E5E7EB;border-radius:8px;max-width:780px';
  const { html: formHtml } = paramFormHtml(desc);
  dom.innerHTML = panelHtml({ widget: WIDGET, name: desc.name, kind: desc.kind, description: desc.description, formHtml });
  root.appendChild(dom);

  /** @type {Record<string, Function[]>} */
  const listeners = { change: [], generate: [], error: [] };
  return wirePanel({
    strategyId: STRATEGY_ID, widget: WIDGET, desc, dom,
    meter: opts.meter, machineId, buildMotions, listeners,
  });
}
