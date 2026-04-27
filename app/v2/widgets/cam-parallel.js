/**
 * @file widgets/cam-parallel.js
 * @description CAM · 3D parallel finishing — Phase 2 3D strategy.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `parallel`).
 *   The Generate button synthesises a parallel scallop-line sweep across a
 *   demo Z=f(x,y) surface (sinusoidal undulation). The `angle` param rotates
 *   the sweep direction in the XY plane; `stepOver` controls scallop spacing.
 *   Each row is sampled at fixed XY intervals and the synthetic surface
 *   height drives Z. The motion stream is fed through the post-processor.
 *
 *   This is parametric — real surface offsetting requires OCCT WASM. The
 *   sinusoidal stand-in surface produces a credible-looking, deterministic
 *   tool path so the modal executor, simulator and bridge daemon all have
 *   real 3D motion to chew through.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'parallel';
const WIDGET = 'cam-parallel';

/**
 * Synthetic surface: gentle undulation centred at the origin.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function surfaceZ(x, y) {
  return -1.5 + 0.8 * Math.sin(x * 0.18) + 0.6 * Math.cos(y * 0.22);
}

/**
 * Build the parallel scallop-line motion stream.
 *
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
export function buildMotions(p) {
  const stepOver = Math.max(0.5, Number(p.stepOver || 1.0));
  const angleDeg = Number(p.angle || 0);
  const a = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const f = 600;
  const rpm = 9500;
  const w = 24, h = 24;            // demo bbox half-extents (mm)
  const sampleSpacing = 1.0;       // along-row XY sample step

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `3D parallel · stepover=${stepOver} angle=${angleDeg}°` },
    { kind: 'tool-change', toolNumber: 5, description: '6 mm ball endmill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm, dir: 'cw' },
    { kind: 'coolant', mode: 'mist' },
    { kind: 'rapid', X: -w, Y: -h, Z: 8 },
  ];

  const rows = Math.max(2, Math.ceil((2 * h) / stepOver));
  for (let r = 0; r <= rows; r++) {
    const localY = -h + r * stepOver;
    const dir = r % 2 === 0 ? 1 : -1; // zig-zag
    /** @type {Array<{x:number,y:number}>} */
    const pts = [];
    const samples = Math.max(2, Math.ceil((2 * w) / sampleSpacing));
    for (let s = 0; s <= samples; s++) {
      const localX = -w + s * sampleSpacing;
      // Rotate (localX, localY) by angle so sweep runs at the requested heading
      const wx = localX * cosA - localY * sinA;
      const wy = localX * sinA + localY * cosA;
      pts.push({ x: wx, y: wy });
    }
    if (dir < 0) pts.reverse();
    const lead = pts[0];
    m.push({ kind: 'rapid', X: lead.x, Y: lead.y, Z: 5 });
    m.push({ kind: 'linear', X: lead.x, Y: lead.y, Z: surfaceZ(lead.x, lead.y), F: f * 0.5 });
    for (let i = 1; i < pts.length; i++) {
      const pt = pts[i];
      m.push({ kind: 'linear', X: pt.x, Y: pt.y, Z: surfaceZ(pt.x, pt.y), F: f });
    }
    m.push({ kind: 'rapid', Z: 5 });
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
  const desc = getStrategy(STRATEGY_ID) || fallbackStrategy(STRATEGY_ID);
  const machineId = opts.params?.machineId || defaultMachine().id;

  const dom = document.createElement('div');
  dom.className = 'pt-cam-parallel';
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
