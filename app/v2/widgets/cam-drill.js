/**
 * @file widgets/cam-drill.js
 * @description CAM · drill — peck drilling pattern (G83-style synthesised
 *   from G0/G1 because Kinetic Control's canned G83 cycle is reproduced
 *   inline in the post.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `drill`).
 *   Generates a square grid of `points × points` holes around the WCS
 *   origin and pecks each one to `depth`, rapid-retracting between pecks.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'drill';
const WIDGET = 'cam-drill';

/**
 * Build a peck-drill motion stream over a square grid pattern.
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  const n = Math.max(1, Math.floor(Number(p.points) || 4));
  const depth = Number(p.depth || 6);
  const peck  = Number(p.peckIncrement || 1.5);
  const dwell = Number(p.dwell || 0.2);
  const cycle = String(p.cycle || 'G83');
  const spacing = 8;

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `drill · ${n}x${n} grid · ${cycle} d=${depth} q=${peck}` },
    { kind: 'tool-change', toolNumber: 3, description: '5 mm carbide drill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: 5000, dir: 'cw' },
    { kind: 'coolant', mode: 'flood' },
  ];
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = ix * spacing;
      const y = iy * spacing;
      m.push({ kind: 'comment', text: `hole (${ix + 1},${iy + 1})` });
      m.push({ kind: 'rapid', X: x, Y: y, Z: 5 });
      m.push({ kind: 'rapid', Z: 0.5 });
      let z = 0;
      while (z < depth) {
        const next = Math.min(z + peck, depth);
        m.push({ kind: 'linear', Z: -next, F: 150 });
        if (cycle === 'G83') m.push({ kind: 'rapid', Z: 0.5 });   // peck retract
        z = next;
      }
      if (cycle === 'G82' || cycle === 'G84') m.push({ kind: 'dwell', seconds: dwell });
      m.push({ kind: 'rapid', Z: 5 });
    }
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
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);
  const desc = getStrategy(STRATEGY_ID) || fallbackStrategy(STRATEGY_ID);
  const machineId = opts.params?.machineId || defaultMachine().id;

  const dom = document.createElement('div');
  dom.className = 'pt-cam-drill';
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
