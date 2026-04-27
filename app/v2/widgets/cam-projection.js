/**
 * @file widgets/cam-projection.js
 * @description CAM · 3D projection — Phase 2 3D strategy.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `projection`).
 *   The Generate button picks a 2D pattern (star / spiral / text outline)
 *   and projects it onto a curved Z=f(x,y) demo surface — the engraving
 *   sits at the configured `depth` below the surface. Real projection
 *   needs a true OCCT surface query; the synthetic surface here keeps the
 *   demo deterministic and lets the simulator and bridge daemon exercise
 *   the resulting NGC.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'projection';
const WIDGET = 'cam-projection';

/**
 * Synthetic curved bowl: gentle inward dish so the projected pattern
 * visibly tracks Z as XY moves outward.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function surfaceZ(x, y) {
  return -1.0 - 0.012 * (x * x + y * y);
}

/**
 * Build a 2D pattern as a list of XY points. `pattern` selects star /
 * spiral / text-stub.
 *
 * @param {string} pattern
 * @returns {Array<{x:number,y:number}>}
 */
function buildPattern(pattern) {
  /** @type {Array<{x:number,y:number}>} */
  const out = [];
  if (pattern === 'spiral') {
    for (let t = 0; t < Math.PI * 6; t += 0.06) {
      const r = 1 + t * 1.2;
      out.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
    }
  } else if (pattern === 'parallel') {
    // Simple text-stub: the letters "PT" rendered as 3-segment polylines.
    const P = [[-8, -6], [-8, 6], [-3, 6], [-3, 0], [-8, 0]];
    const T = [[1, 6], [9, 6], [9, 6], [5, 6], [5, -6]];
    P.forEach(([x, y]) => out.push({ x, y }));
    T.forEach(([x, y]) => out.push({ x, y }));
  } else {
    // 'zigzag' / default → star outline (5-point)
    const pts = 10; // alternating outer/inner
    for (let i = 0; i <= pts; i++) {
      const r = i % 2 === 0 ? 12 : 5;
      const t = (i / pts) * Math.PI * 2 - Math.PI / 2;
      out.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
    }
  }
  return out;
}

/**
 * Build the projection-engraving motion stream.
 *
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
export function buildMotions(p) {
  const depth = Math.max(0.05, Number(p.depth ?? 0.5));
  const f = 500;
  const rpm = 12000;
  const patternKind = String(p.pattern || 'star');
  const pts = buildPattern(patternKind);

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `3D projection · pattern=${patternKind} depth=${depth}` },
    { kind: 'tool-change', toolNumber: 7, description: 'engraver / vee tool' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm, dir: 'cw' },
    { kind: 'coolant', mode: 'mist' },
  ];

  if (pts.length === 0) {
    m.push({ kind: 'comment', text: 'no pattern points' });
  } else {
    const lead = pts[0];
    const safeZ = 6;
    m.push({ kind: 'rapid', X: lead.x, Y: lead.y, Z: safeZ });
    m.push({ kind: 'rapid', X: lead.x, Y: lead.y, Z: surfaceZ(lead.x, lead.y) + 1 });
    m.push({ kind: 'linear', X: lead.x, Y: lead.y, Z: surfaceZ(lead.x, lead.y) - depth, F: f * 0.4 });
    for (let i = 1; i < pts.length; i++) {
      const pt = pts[i];
      const z = surfaceZ(pt.x, pt.y) - depth;
      m.push({ kind: 'linear', X: pt.x, Y: pt.y, Z: z, F: f });
    }
    m.push({ kind: 'rapid', Z: safeZ });
  }

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
  const desc = getStrategy(STRATEGY_ID) || fallbackStrategy(STRATEGY_ID);
  const machineId = opts.params?.machineId || defaultMachine().id;

  const dom = document.createElement('div');
  dom.className = 'pt-cam-projection';
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
