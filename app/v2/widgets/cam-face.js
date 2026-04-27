/**
 * @file widgets/cam-face.js
 * @description CAM · top-face mill — zig-zag pattern.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `face`).
 *   Generates a zig-zag (or parallel-line) facing pass over a rectangular
 *   stock around `boundary`.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'face';
const WIDGET = 'cam-face';

/**
 * Build a zig-zag (or parallel) facing motion stream.
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  const c  = Array.isArray(p.boundary) ? p.boundary : [10, 10, 0];
  const so = Number(p.stepOver || 6);
  const f  = Number(p.feedrate || 800);
  const stockLeave = Number(p.stockToLeaveTop || 0);
  const w = 60, h = 40;
  const x0 = c[0] - w / 2;
  const x1 = c[0] + w / 2;
  const y0 = c[1] - h / 2;
  const y1 = c[1] + h / 2;
  const z = c[2] - 0.3 + stockLeave;
  const pattern = String(p.pattern || 'zigzag');

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `face · ${pattern} · stepover=${so} stock-left=${stockLeave}` },
    { kind: 'tool-change', toolNumber: 4, description: '12 mm face mill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: 7000, dir: 'cw' },
    { kind: 'coolant', mode: 'flood' },
    { kind: 'rapid', X: x0, Y: y0, Z: 5 },
    { kind: 'rapid', Z: 0.5 },
    { kind: 'linear', Z: z, F: 200 },
  ];
  let direction = 1;
  for (let y = y0; y <= y1; y += so) {
    const xStart = direction > 0 ? x0 : x1;
    const xEnd   = direction > 0 ? x1 : x0;
    m.push({ kind: 'linear', X: xStart, Y: y, F: f });
    m.push({ kind: 'linear', X: xEnd,   Y: y });
    if (pattern === 'zigzag') direction *= -1;
    else if (pattern === 'parallel') {
      m.push({ kind: 'rapid', Z: 5 });
      m.push({ kind: 'rapid', X: xStart, Y: y + so });
      m.push({ kind: 'linear', Z: z, F: 200 });
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
  dom.className = 'pt-cam-face';
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
