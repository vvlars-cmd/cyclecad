/**
 * @file shared/cam/widget-base.js
 * @description Shared scaffolding for the eight `cam-*` operation-defining
 *   widgets. Each widget reads its descriptor from
 *   `shared/strategies/index.json`, renders a parameter form, and posts a
 *   synthetic motion stream through `widgets/post-processor.js`'s
 *   `emitProgram()`. The chrome (panel style, Penta-yellow accent, dark
 *   NGC preview pre) is centralised here so every cam-* file stays small
 *   and consistent.
 *
 *   Pure ESM, no DOM in import-time code path. Used only in browser context.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import STRATEGIES from '../strategies/index.json' with { type: 'json' };
import { emitProgram } from '../../widgets/post-processor.js';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: string,
 *   phase: number,
 *   widget: string,
 *   description: string,
 *   params: string[],
 *   axes: string[],
 *   minimumMachine: string,
 * }} StrategyDescriptor
 */

/**
 * Per-parameter UI metadata. Keys follow the `params` list in the registry
 * descriptor; values supply input type, default value, and a human label.
 *
 * @type {Record<string, { type: 'number'|'select'|'vec3'|'text', label: string,
 *   default: number|string|number[], step?: number, min?: number, max?: number,
 *   options?: string[], unit?: string }>}
 */
export const PARAM_META = {
  // 2D contour
  profile:        { type: 'vec3',   label: 'profile origin (x,y,z)', default: [0, 0, 0] },
  side:           { type: 'select', label: 'side', default: 'outside', options: ['inside', 'outside', 'on'] },
  stockToLeave:   { type: 'number', label: 'stock to leave', default: 0.2, step: 0.1, unit: 'mm' },
  stepDown:       { type: 'number', label: 'step-down', default: 1.0, step: 0.1, min: 0.05, unit: 'mm' },
  passes:         { type: 'number', label: 'passes', default: 3, step: 1, min: 1 },
  leadIn:         { type: 'number', label: 'lead-in', default: 2, step: 0.1, unit: 'mm' },
  leadOut:        { type: 'number', label: 'lead-out', default: 2, step: 0.1, unit: 'mm' },
  feedrate:       { type: 'number', label: 'feedrate', default: 600, step: 10, unit: 'mm/min' },
  spindleRpm:     { type: 'number', label: 'spindle RPM', default: 8000, step: 100 },
  // 2D pocket
  boundary:       { type: 'vec3',   label: 'boundary centre (x,y,z)', default: [10, 10, 0] },
  islands:        { type: 'number', label: 'island count', default: 0, step: 1, min: 0 },
  stepOver:       { type: 'number', label: 'step-over', default: 2.5, step: 0.1, unit: 'mm' },
  rampType:       { type: 'select', label: 'ramp type', default: 'helix', options: ['helix', 'plunge', 'zigzag'] },
  rampAngle:      { type: 'number', label: 'ramp angle', default: 5, step: 0.5, unit: '°' },
  plungeFeed:     { type: 'number', label: 'plunge feed', default: 200, step: 10, unit: 'mm/min' },
  // drill
  points:         { type: 'number', label: 'pattern points', default: 4, step: 1, min: 1 },
  depth:          { type: 'number', label: 'depth', default: 6, step: 0.5, unit: 'mm' },
  peckIncrement:  { type: 'number', label: 'peck increment', default: 1.5, step: 0.1, unit: 'mm' },
  dwell:          { type: 'number', label: 'dwell at bottom', default: 0.2, step: 0.1, unit: 's' },
  cycle:          { type: 'select', label: 'cycle', default: 'G83', options: ['G81', 'G82', 'G83', 'G84'] },
  retractType:    { type: 'select', label: 'retract', default: 'G98', options: ['G98', 'G99'] },
  // face
  stockToLeaveTop:{ type: 'number', label: 'stock-to-leave (top)', default: 0.0, step: 0.05, unit: 'mm' },
  pattern:        { type: 'select', label: 'pattern', default: 'zigzag', options: ['zigzag', 'spiral', 'parallel'] },
  // adaptive
  engagementAngle:{ type: 'number', label: 'engagement angle', default: 35, step: 1, unit: '°' },
  // chamfer
  edges:          { type: 'number', label: 'edge count', default: 4, step: 1, min: 3 },
  tool:           { type: 'select', label: 'tool', default: 'vee', options: ['vee', 'bullnose', 'lollipop', 'flat', 'ball'] },
  width:          { type: 'number', label: 'width', default: 0.5, step: 0.05, unit: 'mm' },
  angle:          { type: 'number', label: 'angle', default: 45, step: 1, unit: '°' },
  // bore
  centre:         { type: 'vec3',   label: 'hole centre (x,y,z)', default: [20, 20, 0] },
  diameter:       { type: 'number', label: 'diameter', default: 12, step: 0.1, unit: 'mm' },
  ramp:           { type: 'number', label: 'ramp pitch', default: 0.5, step: 0.05, unit: 'mm/rev' },
  finishingPass:  { type: 'select', label: 'finishing pass', default: 'on', options: ['on', 'off'] },
  // thread
  pitch:          { type: 'number', label: 'thread pitch', default: 1.5, step: 0.1, unit: 'mm/rev' },
  type:           { type: 'select', label: 'thread type', default: 'internal-RH', options: ['internal-RH', 'internal-LH', 'external-RH', 'external-LH'] },
};

/**
 * Resolve the descriptor for a strategy id from the bundled registry.
 *
 * @param {string} id
 * @returns {StrategyDescriptor|null}
 */
export function getStrategy(id) {
  try {
    const found = STRATEGIES.strategies.find(s => s.id === id);
    return found || null;
  } catch {
    return null;
  }
}

/**
 * Fallback descriptor — used if the registry import fails (e.g. JSON imports
 * disabled in some bundler). Keeps the widget mountable even off-line.
 *
 * @param {string} id
 * @returns {StrategyDescriptor}
 */
export function fallbackStrategy(id) {
  return {
    id,
    name: id.replace(/^./, c => c.toUpperCase()),
    kind: '2d', phase: 1, widget: `cam-${id}`,
    description: `Fallback descriptor for ${id} — registry unavailable.`,
    params: [], axes: ['X', 'Y', 'Z'], minimumMachine: 'v1',
  };
}

/**
 * Build the parameter form for a descriptor. Returns the form HTML and a
 * map from param-name → reader function.
 *
 * @param {StrategyDescriptor} desc
 * @returns {{ html: string }}
 */
export function paramFormHtml(desc) {
  const rows = desc.params.map(p => {
    const meta = PARAM_META[p] || { type: 'number', label: p, default: 0 };
    const id = `p-${p}`;
    if (meta.type === 'select') {
      const opts = (meta.options || []).map(o => `<option ${o === meta.default ? 'selected' : ''}>${o}</option>`).join('');
      return `<label style="display:block;margin-bottom:8px">
        <span style="display:block;font:600 10px Inter;color:#4B5563;letter-spacing:.12em;margin-bottom:2px">${meta.label.toUpperCase()}</span>
        <select data-param="${p}" id="${id}" style="width:100%;padding:5px 6px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px">${opts}</select>
      </label>`;
    }
    if (meta.type === 'vec3') {
      const def = /** @type {number[]} */ (meta.default);
      return `<label style="display:block;margin-bottom:8px">
        <span style="display:block;font:600 10px Inter;color:#4B5563;letter-spacing:.12em;margin-bottom:2px">${meta.label.toUpperCase()}</span>
        <span style="display:flex;gap:4px">
          <input data-param="${p}" data-axis="0" type="number" step="0.1" value="${def[0]}" style="width:33%;padding:5px 6px;font:12px JetBrains Mono,monospace;border:1px solid #d1d5db;border-radius:3px">
          <input data-param="${p}" data-axis="1" type="number" step="0.1" value="${def[1]}" style="width:33%;padding:5px 6px;font:12px JetBrains Mono,monospace;border:1px solid #d1d5db;border-radius:3px">
          <input data-param="${p}" data-axis="2" type="number" step="0.1" value="${def[2]}" style="width:33%;padding:5px 6px;font:12px JetBrains Mono,monospace;border:1px solid #d1d5db;border-radius:3px">
        </span>
      </label>`;
    }
    const def = meta.default;
    const step = meta.step ?? 1;
    const unit = meta.unit ? ` <em style="color:#9CA3AF;font-style:normal">(${meta.unit})</em>` : '';
    return `<label style="display:block;margin-bottom:8px">
      <span style="display:block;font:600 10px Inter;color:#4B5563;letter-spacing:.12em;margin-bottom:2px">${meta.label.toUpperCase()}${unit}</span>
      <input data-param="${p}" type="number" step="${step}" value="${def}" style="width:100%;padding:5px 6px;font:12px JetBrains Mono,monospace;border:1px solid #d1d5db;border-radius:3px">
    </label>`;
  }).join('');
  return { html: rows };
}

/**
 * Read parameters from the form back into a key/value object.
 *
 * @param {HTMLElement} dom
 * @param {StrategyDescriptor} desc
 * @returns {Object<string, number | string | number[]>}
 */
export function readParams(dom, desc) {
  /** @type {Object<string, any>} */
  const out = {};
  for (const p of desc.params) {
    const meta = PARAM_META[p] || { type: 'number', default: 0 };
    if (meta.type === 'vec3') {
      /** @type {NodeListOf<HTMLInputElement>} */
      const els = dom.querySelectorAll(`[data-param="${p}"]`);
      const v = [0, 0, 0];
      els.forEach(el => { v[Number(el.dataset.axis)] = Number(el.value || 0); });
      out[p] = v;
    } else if (meta.type === 'select') {
      /** @type {HTMLSelectElement | null} */
      const el = dom.querySelector(`select[data-param="${p}"]`);
      out[p] = el ? el.value : meta.default;
    } else {
      /** @type {HTMLInputElement | null} */
      const el = dom.querySelector(`input[data-param="${p}"]`);
      out[p] = el ? Number(el.value) : Number(meta.default);
    }
  }
  return out;
}

/**
 * Apply a params object back to the form DOM.
 *
 * @param {HTMLElement} dom
 * @param {StrategyDescriptor} desc
 * @param {Object<string, any>} params
 */
export function writeParams(dom, desc, params) {
  for (const p of desc.params) {
    const v = params[p];
    if (v == null) continue;
    const meta = PARAM_META[p] || { type: 'number' };
    if (meta.type === 'vec3' && Array.isArray(v)) {
      /** @type {NodeListOf<HTMLInputElement>} */
      const els = dom.querySelectorAll(`[data-param="${p}"]`);
      els.forEach(el => { el.value = String(v[Number(el.dataset.axis)] ?? 0); });
    } else if (meta.type === 'select') {
      /** @type {HTMLSelectElement | null} */
      const el = dom.querySelector(`select[data-param="${p}"]`);
      if (el) el.value = String(v);
    } else {
      /** @type {HTMLInputElement | null} */
      const el = dom.querySelector(`input[data-param="${p}"]`);
      if (el) el.value = String(v);
    }
  }
}

/**
 * Common widget chrome — Penta-yellow accent strip, panel + form + preview.
 *
 * @param {{ widget:string, name:string, kind:string, description:string,
 *   formHtml:string }} args
 * @returns {string}
 */
export function panelHtml({ widget, name, kind, description, formHtml }) {
  return `
    <div style="font:600 11px Inter;color:#FFB800;letter-spacing:.18em;margin-bottom:6px">${widget.toUpperCase()} · ${kind.toUpperCase()}</div>
    <div style="font:600 21px Georgia,serif;margin-bottom:4px">${name}</div>
    <div style="color:#6B7280;font-size:12px;margin-bottom:14px">${description}</div>

    <div data-form style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">${formHtml}</div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button data-generate style="background:#7C3AED;color:#fff;border:none;padding:8px 16px;border-radius:5px;font:600 12px Inter;cursor:pointer">Generate G-code</button>
      <button data-download disabled style="background:#fff;color:#0F172A;border:1px solid #D1D5DB;padding:8px 14px;border-radius:5px;font:600 12px Inter;cursor:pointer">Download .ngc</button>
      <span data-status style="margin-left:6px;font:11px JetBrains Mono,monospace;color:#6B7280;align-self:center">idle</span>
    </div>

    <pre data-ngc style="margin:0;padding:14px;background:#0F172A;color:#E2E8F0;font:12px JetBrains Mono,ui-monospace,monospace;border-radius:6px;max-height:280px;overflow:auto;line-height:1.5;display:none"></pre>
    <div data-validation style="margin-top:8px;display:none"></div>
  `;
}

/**
 * Bind generate / download / change events to the panel chrome and wire up
 * the meter charge call. Returns the public api shape used by every cam-*
 * widget.
 *
 * @param {{
 *   strategyId: string,
 *   widget: string,
 *   desc: StrategyDescriptor,
 *   dom: HTMLElement,
 *   meter?: { charge: Function },
 *   machineId: string,
 *   buildMotions: (params: Object<string,any>) => import('../../widgets/post-processor.js').MotionRecord[],
 *   listeners: Record<string, Function[]>,
 * }} args
 */
export function wirePanel(args) {
  const { strategyId, widget, desc, dom, meter, machineId, buildMotions, listeners } = args;
  /** @param {string} ev @param {any} p */
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch { /* swallow */ } });

  /** @type {HTMLButtonElement} */
  const genBtn = dom.querySelector('[data-generate]');
  /** @type {HTMLButtonElement} */
  const dlBtn  = dom.querySelector('[data-download]');
  /** @type {HTMLElement}       */
  const status = dom.querySelector('[data-status]');
  /** @type {HTMLPreElement}    */
  const pre    = dom.querySelector('[data-ngc]');
  /** @type {HTMLElement}       */
  const valEl  = dom.querySelector('[data-validation]');

  /** @type {string} */
  let lastNgc = '';

  /**
   * Generate G-code from the current form state. Returns the result to the
   * caller and updates the preview.
   *
   * @returns {{ ngc:string, motions:any[], errors:string[] }}
   */
  function generate() {
    const params = readParams(dom, desc);
    const motions = buildMotions(params);
    const result = emitProgram(machineId, motions, {
      programName: `pentacad ${desc.name}`,
      designer: 'cycleCAD',
      sequenceNumbers: true,
    });
    lastNgc = result.ngc;
    pre.textContent = result.ngc;
    pre.style.display = 'block';
    dlBtn.disabled = false;
    status.innerHTML = `<span style="color:#10B981">ok</span> · ${result.lineCount} lines`;
    if (result.errors.length || result.warnings.length) {
      valEl.style.display = 'block';
      valEl.innerHTML = `
        ${result.errors.length ? `<div style="background:#FEE2E2;color:#991B1B;padding:6px 10px;border-radius:4px;font-size:12px;margin-bottom:4px"><b>${result.errors.length} envelope error${result.errors.length === 1 ? '' : 's'}:</b><ul style="margin:4px 0 0 16px">${result.errors.slice(0, 6).map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
        ${result.warnings.length ? `<div style="background:#FEF3C7;color:#92400E;padding:6px 10px;border-radius:4px;font-size:12px"><b>${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}:</b><ul style="margin:4px 0 0 16px">${result.warnings.slice(0, 4).map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>` : ''}
      `;
    } else {
      valEl.style.display = 'none';
    }
    try {
      meter?.charge?.({
        widget, method: 'generate',
        tokensIn:  motions.length * 6,
        tokensOut: result.lineCount * 4,
        modelTier: 'sonnet',
      })?.catch?.(() => { /* ignore */ });
    } catch { /* meter unreachable */ }
    const out = { ngc: result.ngc, motions, errors: result.errors };
    emit('generate', out);
    emit('change', { kind: 'generate', strategyId });
    return out;
  }

  genBtn.addEventListener('click', () => {
    try { generate(); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      status.innerHTML = `<span style="color:#E11D48">err: ${escapeHtml(msg)}</span>`;
      emit('error', { error: msg });
    }
  });
  dlBtn.addEventListener('click', () => {
    if (!lastNgc) return;
    const blob = new Blob([lastNgc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${strategyId}.ngc`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Re-emit on any input change.
  dom.querySelectorAll('[data-param]').forEach(el => {
    el.addEventListener('change', () => emit('change', { kind: 'param', strategyId, params: readParams(dom, desc) }));
  });

  return {
    api: {
      generate,
      setParams(p) { writeParams(dom, desc, p); emit('change', { kind: 'set', strategyId }); },
      getParams() { return readParams(dom, desc); },
      getStrategy() { return desc; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
