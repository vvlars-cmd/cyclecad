/**
 * @file widgets/post-processor.js
 * @description CAM · Penta Machine post-processor — emits Kinetic-Control-
 *   compatible NGC G-code from a toolpath description. The full Autodesk
 *   Fusion 360 post is vendored at `shared/postprocessors/penta-machine.cps`
 *   (2,874 LOC) and is the canonical emitter when running in Fusion. This
 *   widget provides a browser-side subset that produces the same prologue,
 *   tool-change blocks, work-coordinate setup, motion blocks, and epilogue
 *   so cycleCAD users can preview G-code without leaving the tab.
 *
 *   Output dialect: Kinetic Control / Pocket NC. References:
 *     - https://pentamachine.atlassian.net/wiki/spaces/KCUR/pages/1774551045
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { defaultMachine, getMachine, envelopeSummary, checkEnvelope } from '../shared/machines/index.js';

/**
 * @typedef {{ kind: 'rapid', X?: number, Y?: number, Z?: number, A?: number, B?: number }
 *         | { kind: 'linear', X?: number, Y?: number, Z?: number, A?: number, B?: number, F?: number }
 *         | { kind: 'arc', dir: 'cw' | 'ccw', X: number, Y: number, I: number, J: number, F?: number }
 *         | { kind: 'tool-change', toolNumber: number, description?: string }
 *         | { kind: 'spindle', mode: 'on' | 'off', rpm?: number, dir?: 'cw'|'ccw' }
 *         | { kind: 'coolant', mode: 'flood' | 'mist' | 'off' }
 *         | { kind: 'comment', text: string }
 *         | { kind: 'dwell', seconds: number }
 *         | { kind: 'workCoord', code: 'G54' | 'G55' | 'G56' | 'G57' | 'G58' | 'G59' }
 *         | { kind: 'home' }
 *         | { kind: 'end' }
 *         } MotionRecord
 *
 * @typedef {{
 *   programNumber?: number,
 *   programName?:   string,
 *   designer?:      string,
 *   units?:         'inch' | 'mm',
 *   tcpc?:          boolean,
 *   sequenceNumbers?: boolean,
 *   sequenceStart?: number,
 *   sequenceIncrement?: number,
 *   includeWorkCoord?: boolean,
 * }} EmitOptions
 */

const DEFAULT_OPTIONS = Object.freeze({
  programNumber: 1001,
  programName: 'cycleCAD-suite',
  designer: 'cycleCAD',
  units: 'mm',
  tcpc: true,
  sequenceNumbers: true,
  sequenceStart: 10,
  sequenceIncrement: 5,
  includeWorkCoord: true,
});

const DEMO_MOTION = /** @type {MotionRecord[]} */ ([
  { kind: 'comment', text: 'cycleCAD demo program — 5-axis exercise' },
  { kind: 'tool-change', toolNumber: 1, description: '6 mm flat endmill' },
  { kind: 'workCoord', code: 'G54' },
  { kind: 'spindle', mode: 'on', rpm: 8000, dir: 'cw' },
  { kind: 'coolant', mode: 'mist' },
  { kind: 'rapid', X: 10, Y: 10, Z: 5 },
  { kind: 'rapid', Z: 0.5 },
  { kind: 'linear', Z: -1, F: 200 },
  { kind: 'linear', X: 30, Y: 10, F: 600 },
  { kind: 'arc', dir: 'cw', X: 30, Y: 30, I: 0, J: 10, F: 400 },
  { kind: 'linear', X: 10, Y: 30 },
  { kind: 'linear', X: 10, Y: 10 },
  { kind: 'rapid', Z: 5 },
  { kind: 'dwell', seconds: 0.5 },
  { kind: 'coolant', mode: 'off' },
  { kind: 'spindle', mode: 'off' },
  { kind: 'home' },
  { kind: 'end' },
]);

/**
 * Render a single motion record as one or more NGC lines.
 *
 * @param {MotionRecord} m
 * @returns {string[]}
 */
function renderMotion(m) {
  const f3 = (n) => Number(n).toFixed(3);
  const f4 = (n) => Number(n).toFixed(4);
  switch (m.kind) {
    case 'comment':
      return [`(${m.text.replace(/[()]/g, '')})`];
    case 'tool-change': {
      const tag = m.description ? ` (${m.description.replace(/[()]/g, '')})` : '';
      return [`M700 T${m.toolNumber}${tag}`, `T${m.toolNumber} M6`];
    }
    case 'workCoord':
      return [m.code];
    case 'spindle':
      if (m.mode === 'off') return ['M5'];
      return [`S${m.rpm ?? 8000} ${m.dir === 'ccw' ? 'M4' : 'M3'}`];
    case 'coolant':
      if (m.mode === 'flood') return ['M8'];
      if (m.mode === 'mist')  return ['M7'];
      return ['M9'];
    case 'rapid': {
      const parts = ['G0'];
      if (m.X != null) parts.push(`X${f4(m.X)}`);
      if (m.Y != null) parts.push(`Y${f4(m.Y)}`);
      if (m.Z != null) parts.push(`Z${f4(m.Z)}`);
      if (m.A != null) parts.push(`A${f3(m.A)}`);
      if (m.B != null) parts.push(`B${f3(m.B)}`);
      return [parts.join(' ')];
    }
    case 'linear': {
      const parts = ['G1'];
      if (m.X != null) parts.push(`X${f4(m.X)}`);
      if (m.Y != null) parts.push(`Y${f4(m.Y)}`);
      if (m.Z != null) parts.push(`Z${f4(m.Z)}`);
      if (m.A != null) parts.push(`A${f3(m.A)}`);
      if (m.B != null) parts.push(`B${f3(m.B)}`);
      if (m.F != null) parts.push(`F${f3(m.F)}`);
      return [parts.join(' ')];
    }
    case 'arc': {
      const code = m.dir === 'ccw' ? 'G3' : 'G2';
      const parts = [code, `X${f4(m.X)}`, `Y${f4(m.Y)}`, `I${f4(m.I)}`, `J${f4(m.J)}`];
      if (m.F != null) parts.push(`F${f3(m.F)}`);
      return [parts.join(' ')];
    }
    case 'dwell':
      return [`G4 P${m.seconds}`];
    case 'home':
      return ['G53 G0 Z0', 'G53 G0 X0 Y0'];
    case 'end':
      return ['M30'];
    default: {
      const k = /** @type {{kind:string}} */ (m).kind;
      return [`(unsupported: ${k})`];
    }
  }
}

/**
 * Emit a complete Kinetic-Control-compatible NGC program.
 *
 * @param {string} machineId
 * @param {MotionRecord[]} motions
 * @param {Partial<EmitOptions>} [emitOpts]
 * @returns {{ ngc: string, lineCount: number, errors: string[], warnings: string[] }}
 */
export function emitProgram(machineId, motions, emitOpts = {}) {
  const opts = /** @type {Required<EmitOptions>} */ ({ ...DEFAULT_OPTIONS, ...emitOpts });
  const machine = getMachine(machineId) || defaultMachine();
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const lines = [];

  lines.push(`%`);
  lines.push(`O${String(opts.programNumber).padStart(4, '0')}`);
  lines.push(`(${opts.programName} — designed by ${opts.designer})`);
  lines.push(`(machine: ${machine.name} · ${machine.controller})`);
  lines.push(`(envelope: ${envelopeSummary(machine.id)})`);
  lines.push(`(units: ${opts.units} · TCPC: ${opts.tcpc ? 'on' : 'off'})`);
  lines.push(opts.units === 'inch' ? 'G20' : 'G21');
  lines.push('G90 G94');
  if (opts.tcpc) lines.push('G43.4 H1');
  if (opts.includeWorkCoord) lines.push('G54');

  for (let i = 0; i < motions.length; i++) {
    const m = motions[i];
    if (m.kind === 'rapid' || m.kind === 'linear') {
      const env = checkEnvelope(machine.id, /** @type {any} */({
        ...m, units: opts.units === 'inch' ? 'in' : 'mm',
      }));
      env.errors.forEach(e => errors.push(`motion #${i + 1}: ${e}`));
      env.warnings.forEach(w => warnings.push(`motion #${i + 1}: ${w}`));
    }
    for (const block of renderMotion(m)) lines.push(block);
  }

  if (opts.sequenceNumbers) {
    let n = opts.sequenceStart;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^[GMSTFXYZAB]/.test(line)) {
        lines[i] = `N${n} ${line}`;
        n += opts.sequenceIncrement;
      }
    }
  }

  lines.push('%');
  return { ngc: lines.join('\n'), lineCount: lines.length, errors, warnings };
}

/**
 * @param {{
 *   mount: string | HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function },
 *   params?: { machineId?: string, units?: 'inch'|'mm' }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     post:        (machineId: string, motions: MotionRecord[], emitOpts?: Partial<EmitOptions>) => Promise<ReturnType<typeof emitProgram>>,
 *     postDemo:    () => Promise<ReturnType<typeof emitProgram>>,
 *     getActive:   () => string,
 *     setActive:   (id: string) => void,
 *     downloadCps: () => void,
 *     downloadNgc: () => void,
 *   },
 *   on: (event: 'post'|'change'|'error', fn: (p: unknown) => void) => void,
 *   destroy: () => void,
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('post-processor: mount not found');

  /** @type {Record<string, Function[]>} */
  const listeners = { post: [], change: [], error: [] };
  /** @param {string} ev @param {*} p */
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch (e) { /* swallow */ } });

  let activeId = opts.params?.machineId || defaultMachine().id;
  let lastNgc = '';

  const dom = document.createElement('div');
  dom.className = 'pt-post-processor';
  dom.style.cssText = `
    padding: 18px 20px; font: 13px Inter, sans-serif;
    background: #fff; color: #0F172A;
    border: 1px solid #E5E7EB; border-radius: 8px; max-width: 720px;
  `;
  dom.innerHTML = `
    <div style="font:600 11px Inter; color:#7C3AED; letter-spacing:.18em; margin-bottom:6px">
      POST · PROCESSOR
    </div>
    <div style="font:600 21px Georgia, serif; margin-bottom:4px">Penta Machine NGC emitter</div>
    <div style="color:#6B7280; font-size:12px; margin-bottom:14px" data-machine-meta></div>

    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px">
      <button data-post-demo style="
        background: #7C3AED; color: #fff; border: none; padding: 8px 16px;
        border-radius: 5px; font:600 12px Inter; cursor: pointer;
      ">⚙ Post demo program</button>
      <button data-download-ngc disabled style="
        background: #fff; color: #0F172A; border: 1px solid #D1D5DB;
        padding: 8px 14px; border-radius: 5px; font:600 12px Inter;
        cursor: pointer;
      ">⬇ Download .ngc</button>
      <a data-download-cps download="penta-machine.cps"
         href="../shared/postprocessors/penta-machine.cps" style="
        background: #0EA5E9; color: #fff; padding: 8px 14px;
        border-radius: 5px; font:600 12px Inter; text-decoration: none;
        display: inline-block;
      ">⬇ Fusion 360 post (.cps)</a>
    </div>

    <div data-status style="margin-bottom:8px; color:#6B7280; font-size:12px">idle</div>

    <pre data-ngc style="
      margin: 0; padding: 14px; background: #0F172A; color: #E2E8F0;
      font: 12px JetBrains Mono, ui-monospace, monospace; border-radius: 6px;
      max-height: 320px; overflow: auto; line-height: 1.5;
      display: none;
    "></pre>

    <div data-validation style="margin-top:10px; display:none"></div>
  `;
  root.appendChild(dom);

  const metaEl   = /** @type {HTMLElement}        */ (dom.querySelector('[data-machine-meta]'));
  const postBtn  = /** @type {HTMLButtonElement}  */ (dom.querySelector('[data-post-demo]'));
  const dlNgcBtn = /** @type {HTMLButtonElement}  */ (dom.querySelector('[data-download-ngc]'));
  const statusEl = /** @type {HTMLElement}        */ (dom.querySelector('[data-status]'));
  const ngcEl    = /** @type {HTMLPreElement}     */ (dom.querySelector('[data-ngc]'));
  const valEl    = /** @type {HTMLElement}        */ (dom.querySelector('[data-validation]'));

  function renderMeta() {
    const m = getMachine(activeId) || defaultMachine();
    metaEl.textContent = `${m.name} · post: penta-machine.cps · ext: .${m.extension} · controller: ${m.controller}`;
  }
  renderMeta();

  /**
   * @param {MotionRecord[]} motions
   * @param {Partial<EmitOptions>} [emitOpts]
   */
  async function post(motions, emitOpts = {}) {
    statusEl.textContent = 'posting…';
    try {
      const result = emitProgram(activeId, motions, emitOpts);
      lastNgc = result.ngc;
      ngcEl.textContent = result.ngc;
      ngcEl.style.display = 'block';
      dlNgcBtn.disabled = false;

      if (result.errors.length || result.warnings.length) {
        valEl.style.display = 'block';
        valEl.innerHTML = `
          ${result.errors.length ? `
            <div style="background:#FEE2E2; color:#991B1B; padding:8px 12px;
                        border-radius:5px; font-size:12px; margin-bottom:6px">
              <b>${result.errors.length} envelope error${result.errors.length === 1 ? '' : 's'}:</b>
              <ul style="margin:4px 0 0 16px">${result.errors.slice(0, 8).map(e => `<li>${esc(e)}</li>`).join('')}</ul>
            </div>` : ''}
          ${result.warnings.length ? `
            <div style="background:#FEF3C7; color:#92400E; padding:8px 12px;
                        border-radius:5px; font-size:12px">
              <b>${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}:</b>
              <ul style="margin:4px 0 0 16px">${result.warnings.slice(0, 6).map(w => `<li>${esc(w)}</li>`).join('')}</ul>
            </div>` : ''}
        `;
      } else {
        valEl.style.display = 'none';
      }

      statusEl.innerHTML = `<span style="color:#10B981">✓ posted</span> · ${result.lineCount} lines · ${motions.length} motion records`;
      opts.meter?.charge?.({
        widget: 'post-processor', method: 'post',
        tokensIn: motions.length * 8, tokensOut: result.lineCount * 4,
        modelTier: 'haiku',
      }).catch(() => { /* meter unreachable in standalone */ });
      emit('post', { ngc: result.ngc, motions, machineId: activeId, errors: result.errors });
      emit('change', { kind: 'post', lineCount: result.lineCount });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusEl.innerHTML = `<span style="color:#E11D48">✗ ${esc(msg)}</span>`;
      emit('error', { error: msg });
      throw err;
    }
  }

  postBtn.addEventListener('click', () => { post(DEMO_MOTION).catch(() => {}); });
  dlNgcBtn.addEventListener('click', () => {
    if (!lastNgc) return;
    const blob = new Blob([lastNgc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cyclecad-program.ngc'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return {
    api: {
      post(machineId, motions, emitOpts) {
        if (machineId && machineId !== activeId) {
          activeId = machineId;
          renderMeta();
        }
        return post(motions, emitOpts);
      },
      postDemo() { return post(DEMO_MOTION); },
      getActive() { return activeId; },
      setActive(id) {
        if (!getMachine(id)) throw new Error(`unknown machine: ${id}`);
        activeId = id;
        renderMeta();
        emit('change', { kind: 'machine', id });
      },
      downloadCps() {
        /** @type {HTMLAnchorElement} */ (dom.querySelector('[data-download-cps]')).click();
      },
      downloadNgc() { dlNgcBtn.click(); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}

/** @param {string} s */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
