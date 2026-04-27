/**
 * @file widgets/cam-radial.js
 * @description CAM · 3D radial finishing — Phase 2 3D strategy.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `radial`).
 *   The Generate button synthesises a stack of concentric arcs around the
 *   `centre` param. Each ring sits at a slightly lower Z so the synthesised
 *   stream looks like a finishing pass spiralling down a hemispherical
 *   boss. `innerRadius`, `outerRadius` and `angularStep` drive the sweep
 *   density.
 *
 *   Real radial finishing requires OCCT WASM to project arcs onto the
 *   actual surface; the synthetic dome here provides a deterministic
 *   end-to-end demo for the simulator and bridge stub.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'radial';
const WIDGET = 'cam-radial';

/**
 * Synthetic dome: Z = z0 - r²/k. Used by the radial sweep for a credible
 * descending profile as the radius grows.
 *
 * @param {number} r
 * @returns {number}
 */
function domeZ(r) {
  return -0.5 - (r * r) / 60;
}

/**
 * Build the radial-sweep motion stream.
 *
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
export function buildMotions(p) {
  const c = Array.isArray(p.centre) ? p.centre : [0, 0, 0];
  const innerR = Math.max(0.5, Number(p.innerRadius ?? 2));
  const outerR = Math.max(innerR + 1, Number(p.outerRadius ?? 18));
  const angularStep = Math.max(2, Number(p.angularStep ?? 6));
  const radialStep = 1.5;
  const f = 550;
  const rpm = 9500;

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `3D radial · r=[${innerR},${outerR}] step=${angularStep}°` },
    { kind: 'tool-change', toolNumber: 5, description: '6 mm ball endmill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm, dir: 'cw' },
    { kind: 'coolant', mode: 'mist' },
    { kind: 'rapid', X: c[0] + outerR, Y: c[1], Z: 8 },
  ];

  const rings = Math.max(2, Math.ceil((outerR - innerR) / radialStep));
  for (let i = 0; i <= rings; i++) {
    const r = innerR + i * radialStep;
    if (r > outerR) break;
    const z = c[2] + domeZ(r);
    // Lead in at top of ring
    const startX = c[0] + r;
    const startY = c[1];
    m.push({ kind: 'rapid', X: startX, Y: startY, Z: z + 2 });
    m.push({ kind: 'linear', X: startX, Y: startY, Z: z, F: f * 0.5 });
    const steps = Math.max(8, Math.ceil(360 / angularStep));
    for (let s = 1; s <= steps; s++) {
      const theta = (s * 360 / steps) * Math.PI / 180;
      const x = c[0] + r * Math.cos(theta);
      const y = c[1] + r * Math.sin(theta);
      m.push({ kind: 'linear', X: x, Y: y, Z: z, F: f });
    }
    m.push({ kind: 'rapid', Z: z + 4 });
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
  dom.className = 'pt-cam-radial';
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
