/**
 * @file widgets/cam-pocket.js
 * @description CAM · 2D pocket — spiral pocket clearing.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `pocket`).
 *   The Generate button synthesises a spiralling-in toolpath inside a
 *   square pocket centred on `boundary` with the registry-supplied
 *   stepOver / stepDown / rampAngle. Motion stream is fed through the
 *   post-processor.
 *
 *   Real adaptive island-avoidance + offset-curve generation requires
 *   OCCT WASM (Phase 2). The synthetic spiral here lets the simulator
 *   and modal-executor exercise a meaningful program.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'pocket';
const WIDGET = 'cam-pocket';

/**
 * Build a spiralling-in pocket-clearing motion stream.
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  const c = Array.isArray(p.boundary) ? p.boundary : [10, 10, 0];
  const so = Number(p.stepOver || 2.5);
  const sd = Number(p.stepDown || 1);
  const f  = Number(p.feedrate || 600);
  const pf = Number(p.plungeFeed || 200);
  const passes = 3;
  const halfW = 25, halfH = 18;

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `pocket · stepover=${so} stepdown=${sd} ramp=${p.rampType}` },
    { kind: 'tool-change', toolNumber: 2, description: 'flat endmill (pocket)' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: 9000, dir: 'cw' },
    { kind: 'coolant', mode: 'flood' },
    { kind: 'rapid', X: c[0], Y: c[1], Z: 5 },
    { kind: 'rapid', Z: 0.5 },
  ];

  for (let i = 1; i <= passes; i++) {
    const z = c[2] - i * sd;
    m.push({ kind: 'comment', text: `pocket pass ${i} · Z=${z.toFixed(3)}` });
    if (p.rampType === 'helix') {
      const r = Math.min(halfW, halfH) * 0.4;
      const ringZ = z + sd * 0.5;
      m.push({ kind: 'linear', X: c[0] + r, Y: c[1], Z: ringZ, F: pf });
      m.push({ kind: 'arc', dir: 'cw', X: c[0] + r, Y: c[1], I: -r, J: 0, F: pf });
    }
    m.push({ kind: 'linear', X: c[0], Y: c[1], Z: z, F: pf });
    const rings = Math.max(1, Math.ceil(Math.min(halfW, halfH) / so));
    for (let r = 1; r <= rings; r++) {
      const dx = Math.min(r * so, halfW);
      const dy = Math.min(r * so, halfH);
      m.push({ kind: 'linear', X: c[0] - dx, Y: c[1] - dy, F: f });
      m.push({ kind: 'linear', X: c[0] + dx, Y: c[1] - dy });
      m.push({ kind: 'linear', X: c[0] + dx, Y: c[1] + dy });
      m.push({ kind: 'linear', X: c[0] - dx, Y: c[1] + dy });
      m.push({ kind: 'linear', X: c[0] - dx, Y: c[1] - dy });
    }
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
  dom.className = 'pt-cam-pocket';
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
