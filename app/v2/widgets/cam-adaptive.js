/**
 * @file widgets/cam-adaptive.js
 * @description CAM · adaptive clearing — trochoidal roughing demo.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `adaptive`).
 *   Generates a sequence of small trochoidal loops marching along a line
 *   inside the boundary box. Real adaptive paths require an offset-curve /
 *   medial-axis kernel (OCCT WASM, Phase 2) — this synthesises the visual
 *   signature so the simulator and post can be driven end-to-end.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'adaptive';
const WIDGET = 'cam-adaptive';

/**
 * Build a trochoidal-loop motion stream marching along +X.
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  const c  = Array.isArray(p.boundary) ? p.boundary : [0, 0, 0];
  const so = Number(p.stepOver || 1.5);
  const sd = Number(p.stepDown || 4);
  const f  = Number(p.feedrate || 1500);
  const rpm = Number(p.spindleRpm || 12000);
  const loops = 12;
  const loopR = so * 0.8;

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `adaptive · stepover=${so} stepdown=${sd} engagement=${p.engagementAngle}°` },
    { kind: 'tool-change', toolNumber: 5, description: '6 mm 3-flute carbide (HSM)' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm, dir: 'cw' },
    { kind: 'coolant', mode: 'mist' },
    { kind: 'rapid', X: c[0], Y: c[1], Z: 5 },
    { kind: 'rapid', Z: 0.5 },
    { kind: 'linear', Z: c[2] - sd, F: 400 },
  ];
  for (let i = 0; i < loops; i++) {
    const x = c[0] + i * so * 1.6;
    // Trochoidal loop = forward + circular sweep.
    m.push({ kind: 'linear', X: x, Y: c[1], F: f });
    m.push({ kind: 'arc', dir: 'cw', X: x, Y: c[1], I: 0, J: loopR, F: f });
  }
  m.push({ kind: 'rapid', Z: 5 });
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
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);
  const desc = getStrategy(STRATEGY_ID) || fallbackStrategy(STRATEGY_ID);
  const machineId = opts.params?.machineId || defaultMachine().id;

  const dom = document.createElement('div');
  dom.className = 'pt-cam-adaptive';
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
