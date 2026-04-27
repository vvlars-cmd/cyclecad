/**
 * @file widgets/cam-bore.js
 * @description CAM · bore — helical bore down to depth.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `bore`).
 *   Generates a helix at the requested diameter, ramping down at the
 *   `ramp` pitch, plus a final clean-up circle when `finishingPass` is on.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'bore';
const WIDGET = 'cam-bore';

/**
 * Build a helical bore motion stream.
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  const c = Array.isArray(p.centre) ? p.centre : [20, 20, 0];
  const dia   = Number(p.diameter || 12);
  const depth = Number(p.depth || 8);
  const pitch = Number(p.ramp || 0.5);
  const rampType = String(p.rampType || 'helix');
  const finish   = String(p.finishingPass || 'on') === 'on';
  const r = dia / 2;
  const turns = Math.max(1, Math.ceil(depth / Math.max(0.05, pitch)));
  const startX = c[0] + r;
  const startY = c[1];

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `bore · ${rampType} · ⌀${dia} d=${depth} pitch=${pitch}` },
    { kind: 'tool-change', toolNumber: 7, description: 'boring tool' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: 4500, dir: 'cw' },
    { kind: 'coolant', mode: 'flood' },
    { kind: 'rapid', X: startX, Y: startY, Z: 5 },
    { kind: 'rapid', Z: 0.5 },
  ];
  // Helical ramp — emit a CW arc per turn, decrementing Z.
  for (let i = 1; i <= turns; i++) {
    const z = c[2] - Math.min(i * pitch, depth);
    // Half-turn from (cx+r, cy) to (cx-r, cy)
    m.push({ kind: 'arc', dir: 'cw', X: c[0] - r, Y: c[1], I: -r, J: 0, F: 250 });
    // Half-turn back to (cx+r, cy) at the descended Z
    m.push({ kind: 'arc', dir: 'cw', X: c[0] + r, Y: c[1], I: r, J: 0, F: 250 });
    m.push({ kind: 'linear', Z: z, F: 250 });
  }
  if (finish) {
    m.push({ kind: 'comment', text: 'finishing pass' });
    m.push({ kind: 'arc', dir: 'cw', X: c[0] - r, Y: c[1], I: -r, J: 0, F: 400 });
    m.push({ kind: 'arc', dir: 'cw', X: c[0] + r, Y: c[1], I:  r, J: 0, F: 400 });
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
  dom.className = 'pt-cam-bore';
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
