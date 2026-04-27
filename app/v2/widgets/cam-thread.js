/**
 * @file widgets/cam-thread.js
 * @description CAM · thread mill — internal thread-mill helix.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `thread`).
 *   Generates a helix at the minor (or major) diameter for the requested
 *   pitch, with one full turn per pitch climb. RH / LH and internal /
 *   external are flipped via the arc direction and the radial offset sign.
 *
 *   The single-tooth or full-form distinction is captured in the comment
 *   stream; the geometry of the tool itself is not rendered here.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'thread';
const WIDGET = 'cam-thread';

/**
 * Build an internal thread-mill helix motion stream.
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  const c = Array.isArray(p.centre) ? p.centre : [25, 25, 0];
  const dia   = Number(p.diameter || 10);
  const depth = Number(p.depth || 8);
  const pitch = Number(p.pitch || 1.5);
  const passes = Math.max(1, Math.floor(Number(p.passes) || 2));
  const type   = String(p.type || 'internal-RH');
  const internal = type.startsWith('internal');
  const rh = type.endsWith('RH');
  const r = (dia / 2) - (internal ? 0 : 0); // tool centre runs at half-diameter
  const turns = Math.max(1, Math.ceil(depth / Math.max(0.1, pitch)));
  const arcDir = rh ? 'ccw' : 'cw';

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `thread · ${type} · ⌀${dia} pitch=${pitch} d=${depth} passes=${passes}` },
    { kind: 'tool-change', toolNumber: 8, description: 'thread mill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: 6000, dir: 'cw' },
    { kind: 'coolant', mode: 'flood' },
  ];
  for (let pass = 1; pass <= passes; pass++) {
    const radius = r * (pass / passes);
    m.push({ kind: 'comment', text: `thread pass ${pass}/${passes} r=${radius.toFixed(3)}` });
    m.push({ kind: 'rapid', X: c[0], Y: c[1], Z: 5 });
    m.push({ kind: 'rapid', Z: c[2] + 0.5 });
    // Lead in to start of helix at +X side
    m.push({ kind: 'linear', X: c[0] + radius, Y: c[1], Z: c[2], F: 200 });
    // Helix: one half-turn descends pitch/2.
    let z = c[2];
    for (let t = 1; t <= turns; t++) {
      z -= pitch / 2;
      m.push({ kind: 'arc', dir: arcDir, X: c[0] - radius, Y: c[1], I: -radius, J: 0, F: 350 });
      z -= pitch / 2;
      m.push({ kind: 'arc', dir: arcDir, X: c[0] + radius, Y: c[1], I:  radius, J: 0, F: 350 });
      m.push({ kind: 'linear', Z: z, F: 350 });
    }
    m.push({ kind: 'rapid', X: c[0], Y: c[1] });
    m.push({ kind: 'rapid', Z: 5 });
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
  dom.className = 'pt-cam-thread';
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
