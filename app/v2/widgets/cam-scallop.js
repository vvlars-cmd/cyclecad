/**
 * @file widgets/cam-scallop.js
 * @description CAM · 3D constant-scallop finishing — Phase 2 3D strategy.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `scallop`).
 *   The Generate button synthesises a constant-scallop spiral. Step-over is
 *   curvature-adaptive: where the synthetic surface has higher curvature
 *   the spiral packs tighter; on flat regions it relaxes. Real scallop
 *   finishing requires OCCT WASM and a true offset-curve solver — the
 *   curvature term here is a proxy that produces visibly varying spacing
 *   so the simulator and post-processor exercise the parametric shape.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'scallop';
const WIDGET = 'cam-scallop';

/**
 * Synthetic surface — twin gaussian peaks. Curvature ramps up near the
 * peaks; the spiral step-over shrinks accordingly.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function surfaceZ(x, y) {
  const a = Math.exp(-((x - 6) ** 2 + y ** 2) / 90);
  const b = Math.exp(-((x + 6) ** 2 + y ** 2) / 90);
  return -2 + 3 * a + 2.4 * b;
}

/**
 * Curvature proxy — derivative of the height field; tighter step-over
 * where the slope is steeper.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function curvatureProxy(x, y) {
  const eps = 0.5;
  const dx = (surfaceZ(x + eps, y) - surfaceZ(x - eps, y)) / (2 * eps);
  const dy = (surfaceZ(x, y + eps) - surfaceZ(x, y - eps)) / (2 * eps);
  return Math.hypot(dx, dy);
}

/**
 * Build the constant-scallop spiral motion stream.
 *
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
export function buildMotions(p) {
  const scallopH = Math.max(0.005, Number(p.scallopHeight ?? 0.05));
  const baseStep = 1.8;             // mm — stepover at zero curvature
  const radius = 18;                // demo bbox half-extent
  const f = 500;
  const rpm = 9500;

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `3D scallop · h=${scallopH}mm adaptive=true` },
    { kind: 'tool-change', toolNumber: 5, description: '4 mm ball endmill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm, dir: 'cw' },
    { kind: 'coolant', mode: 'mist' },
    { kind: 'rapid', X: 0, Y: 0, Z: 8 },
    { kind: 'linear', X: 0, Y: 0, Z: surfaceZ(0, 0), F: f * 0.5 },
  ];

  // Walk an outward spiral; vary angular step and radial step using the
  // curvature proxy as a multiplier (clamped). Higher curvature => smaller
  // step => tighter spacing.
  let r = 0.5;
  let theta = 0;
  let lastX = 0, lastY = 0;
  while (r < radius) {
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const c = Math.min(1.5, 0.4 + curvatureProxy(x, y));
    const dTheta = (8 / Math.max(0.5, r)) / c; // tighter where curve high
    const dR = (baseStep / c) * (scallopH / 0.05);
    theta += dTheta;
    if (theta - Math.atan2(lastY, lastX) > Math.PI * 2 - 0.001) {
      r += dR * 0.18; // every full turn add a wedge of radius
    }
    if (theta > Math.PI * 12) {
      // also grow over many turns, in case threshold above didn't fire.
      r += dR * 0.04;
    }
    m.push({ kind: 'linear', X: x, Y: y, Z: surfaceZ(x, y), F: f });
    lastX = x; lastY = y;
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
  dom.className = 'pt-cam-scallop';
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
