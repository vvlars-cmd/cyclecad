/**
 * @file widgets/cam-contour.js
 * @description CAM · 2D contour milling — Phase 1 real CAM widget.
 *
 *   Reads its descriptor from `shared/strategies/index.json` (id `contour`).
 *   The form is built from the registry's `params` list. On Generate the
 *   widget synthesises a rectangular profile at constant Z, broken into
 *   per-pass step-downs, and pushes the resulting MotionRecord stream
 *   through `widgets/post-processor.js`'s `emitProgram()` to produce a
 *   Kinetic-Control-flavoured NGC preview.
 *
 *   The motion stream is parametric — Pentacad's true CAM kernel needs an
 *   OCCT WASM build to convert real CAD profiles into offset toolpaths.
 *   For Phase 1 we sample a rectangle around the supplied profile origin
 *   so the post-processor and simulator can be exercised end-to-end.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine } from '../shared/machines/index.js';
import {
  getStrategy, fallbackStrategy, paramFormHtml, panelHtml, wirePanel,
} from '../shared/cam/widget-base.js';

const STRATEGY_ID = 'contour';
const WIDGET = 'cam-contour';

/**
 * Synthesise a rectangular contour at constant Z, repeating per pass with a
 * per-pass step-down. Honours `side` (inside / outside / on) by inflating
 * the rectangle by `stockToLeave`.
 *
 * @param {Object<string,any>} p
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function buildMotions(p) {
  /** @type {number[]} */
  const origin = Array.isArray(p.profile) ? p.profile : [0, 0, 0];
  const w = 30, h = 20;                 // demo profile size (mm)
  const sideOffset = p.side === 'inside' ? -p.stockToLeave : p.side === 'outside' ? p.stockToLeave : 0;
  const x0 = origin[0] + sideOffset;
  const y0 = origin[1] + sideOffset;
  const x1 = origin[0] + w - sideOffset;
  const y1 = origin[1] + h - sideOffset;
  const passes = Math.max(1, Number(p.passes || 1));
  const stepDown = Number(p.stepDown || 1);
  const f = Number(p.feedrate || 600);
  const rpm = Number(p.spindleRpm || 8000);

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const m = [
    { kind: 'comment', text: `2D contour · ${p.side} · ${passes}x${stepDown}mm` },
    { kind: 'tool-change', toolNumber: 1, description: 'flat endmill' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm, dir: 'cw' },
    { kind: 'coolant', mode: 'flood' },
    { kind: 'rapid', X: x0 - p.leadIn, Y: y0, Z: 5 },
    { kind: 'rapid', Z: 0.5 },
  ];

  for (let i = 1; i <= passes; i++) {
    const z = origin[2] - i * stepDown;
    m.push({ kind: 'comment', text: `pass ${i}/${passes} · Z=${z.toFixed(3)}` });
    m.push({ kind: 'linear', X: x0 - p.leadIn, Y: y0, Z: z, F: f * 0.5 });
    m.push({ kind: 'linear', X: x0, Y: y0, F: f });
    m.push({ kind: 'linear', X: x1, Y: y0 });
    m.push({ kind: 'linear', X: x1, Y: y1 });
    m.push({ kind: 'linear', X: x0, Y: y1 });
    m.push({ kind: 'linear', X: x0, Y: y0 });
    m.push({ kind: 'linear', X: x0 - p.leadOut, Y: y0 });
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
 * @returns {Promise<{ api:object, on:Function, destroy:Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);
  const desc = getStrategy(STRATEGY_ID) || fallbackStrategy(STRATEGY_ID);
  const machineId = opts.params?.machineId || defaultMachine().id;

  const dom = document.createElement('div');
  dom.className = 'pt-cam-contour';
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
