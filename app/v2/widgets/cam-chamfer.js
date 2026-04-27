/**
 * @file widgets/cam-chamfer.js
 * @description CAM · chamfer — single-pass edge break along a polygon
 *   contour.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `chamfer`).
 *   Synthesises a regular polygon (n = `edges`) and runs the V-bit along
 *   it at a Z that matches `width`/2 / tan(angle).
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'chamfer';
const WIDGET = 'cam-chamfer';

/**
 * Build a single-pass chamfer motion stream around a regular polygon.
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  const edges = Math.max(3, Math.floor(Number(p.edges) || 4));
  const w = Number(p.width || 0.5);
  const ang = Number(p.angle || 45);
  const passes = Math.max(1, Math.floor(Number(p.passes) || 1));
  // Z at which a V-bit reaches a chamfer of `w` half-width:
  //   z = -w / tan(angle)
  const zChamfer = -w / Math.tan((ang * Math.PI) / 180);
  const r = 20;            // demo polygon radius (mm)
  const cx = 0, cy = 0;

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `chamfer · ${edges}-edge · w=${w} ang=${ang}° passes=${passes}` },
    { kind: 'tool-change', toolNumber: 6, description: `${ang}° vee bit` },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: 12000, dir: 'cw' },
    { kind: 'coolant', mode: 'mist' },
  ];
  for (let pass = 1; pass <= passes; pass++) {
    const z = zChamfer * (pass / passes);
    m.push({ kind: 'comment', text: `chamfer pass ${pass}/${passes} z=${z.toFixed(3)}` });
    // Rapid to first vertex
    const v0x = cx + r * Math.cos(0);
    const v0y = cy + r * Math.sin(0);
    m.push({ kind: 'rapid', X: v0x, Y: v0y, Z: 5 });
    m.push({ kind: 'linear', Z: z, F: 200 });
    for (let i = 1; i <= edges; i++) {
      const t = (i / edges) * Math.PI * 2;
      const x = cx + r * Math.cos(t);
      const y = cy + r * Math.sin(t);
      m.push({ kind: 'linear', X: x, Y: y, F: 800 });
    }
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
  dom.className = 'pt-cam-chamfer';
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
