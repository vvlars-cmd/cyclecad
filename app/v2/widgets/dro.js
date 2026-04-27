/**
 * @file widgets/dro.js
 * @description Digital Read-Out — translucent overlay showing live machine
 *   coordinates (X / Y / Z / A / B / T) over a 3D viewport.
 *
 *   - Mounts an absolutely-positioned card on top of the host's mount.
 *   - Updates via `handle.api.update({x,y,z,a,b,t})` — the host pushes
 *     state every frame; the widget owns no clock of its own.
 *   - Optional unit toggle: 'inch' (default, Pentamachine dialect) or 'mm'.
 *
 * Matches the cycleCAD Suite widget contract — single `init(opts)`
 * export returning a teardown handle.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const AXES = Object.freeze(['x', 'y', 'z', 'a', 'b']);
const MM_PER_INCH = 25.4;

/**
 * @typedef {Object} DroState
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [z]
 * @property {number} [a]   degrees
 * @property {number} [b]   degrees
 * @property {number} [t]   active tool number
 *
 * @typedef {Object} DroOpts
 * @property {string|HTMLElement} mount    Host element (positioned).
 * @property {'inch'|'mm'}        [units]  Display units. Default 'inch'.
 * @property {{top?:string,right?:string,bottom?:string,left?:string}} [position]
 *   Override the default top:96px/right:20px placement.
 * @property {boolean}            [showUnitToggle]  Show inch/mm switch.
 *   Default true.
 *
 * @typedef {Object} DroHandle
 * @property {() => void} destroy
 * @property {(event: 'change'|'units', fn: Function) => void} on
 * @property {{
 *   update: (state: DroState) => void,
 *   setUnits: (u: 'inch'|'mm') => void,
 *   getState: () => DroState,
 * }} api
 */

/**
 * @param {DroOpts} opts
 * @returns {Promise<DroHandle>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string'
    ? document.querySelector(opts.mount)
    : opts.mount;
  if (!root) throw new Error('dro: mount not found');
  if (!root.style.position || root.style.position === 'static') {
    root.style.position = 'relative';
  }

  const state = {
    units: opts.units === 'mm' ? 'mm' : 'inch',
    pos:   { x: 0, y: 0, z: 0, a: 0, b: 0, t: 0 },
  };
  const listeners = { change: [], units: [] };
  const emit = (ev, payload) => {
    (listeners[ev] || []).forEach(fn => {
      try { fn(payload); } catch (e) { /* swallow */ }
    });
  };

  const dom = buildDom(root, opts);
  paint(dom, state);

  if (opts.showUnitToggle !== false && dom.unitBtn) {
    dom.unitBtn.addEventListener('click', () => {
      const next = state.units === 'inch' ? 'mm' : 'inch';
      setUnits(state, dom, next);
      emit('units', { units: next });
    });
  }

  /** @type {DroHandle} */
  const handle = {
    api: {
      /** @param {DroState} next */
      update(next) {
        if (!next) return;
        for (const k of AXES) if (typeof next[k] === 'number') state.pos[k] = next[k];
        if (typeof next.t === 'number') state.pos.t = next.t;
        paint(dom, state);
        emit('change', { state: { ...state.pos }, units: state.units });
      },
      /** @param {'inch'|'mm'} u */
      setUnits(u) { setUnits(state, dom, u); emit('units', { units: u }); },
      /** @returns {DroState} */
      getState() { return { ...state.pos, units: state.units }; },
    },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    destroy() { dom.wrap.remove(); },
  };
  return handle;
}

// ──────────────────────────────────────────────────────────────────────
// DOM
// ──────────────────────────────────────────────────────────────────────

function buildDom(root, opts) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-dro';
  const placement = opts.position || {};
  const inline = [
    placement.top    ? `top: ${placement.top};`       : 'top: 96px;',
    placement.right  ? `right: ${placement.right};`   : 'right: 20px;',
    placement.bottom ? `bottom: ${placement.bottom};` : '',
    placement.left   ? `left: ${placement.left};`     : '',
  ].join('');
  wrap.innerHTML = `
<style>
.pt-dro {
  position: absolute; ${inline}
  background: rgba(100, 100, 100, 0.75);
  color: #FFFFFF;
  border-radius: 10px;
  padding: 10px 12px 8px;
  font-family: 'Source Code Pro', Menlo, Monaco, 'Ubuntu Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 16px;
  letter-spacing: 0.02em;
  z-index: 12;
  user-select: none;
  pointer-events: auto;
  min-width: 116px;
}
.pt-dro-row { display: flex; gap: 6px; }
.pt-dro-key { width: 16px; opacity: 0.95; }
.pt-dro-val { flex: 1; min-width: 60px; text-align: right; font-variant-numeric: tabular-nums; }
.pt-dro-unit-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 6px; padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.18);
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
}
.pt-dro-unit-row button {
  background: rgba(255,255,255,0.14); color: #FFFFFF;
  border: none; border-radius: 3px;
  padding: 2px 8px; font: 600 10px Roboto, sans-serif; letter-spacing: 0.06em;
  cursor: pointer;
}
.pt-dro-unit-row button:hover { background: rgba(255,255,255,0.22); }
</style>
<div class="pt-dro-row"><span class="pt-dro-key">X:</span><span class="pt-dro-val" data-axis="x">0.0000</span></div>
<div class="pt-dro-row"><span class="pt-dro-key">Y:</span><span class="pt-dro-val" data-axis="y">0.0000</span></div>
<div class="pt-dro-row"><span class="pt-dro-key">Z:</span><span class="pt-dro-val" data-axis="z">0.0000</span></div>
<div class="pt-dro-row"><span class="pt-dro-key">A:</span><span class="pt-dro-val" data-axis="a">0.0000</span></div>
<div class="pt-dro-row"><span class="pt-dro-key">B:</span><span class="pt-dro-val" data-axis="b">0.0000</span></div>
<div class="pt-dro-row"><span class="pt-dro-key">T:</span><span class="pt-dro-val" data-axis="t">0</span></div>
${opts.showUnitToggle !== false
  ? `<div class="pt-dro-unit-row"><span data-units></span><button data-unit-btn>switch</button></div>`
  : ''}
`;
  root.appendChild(wrap);
  return {
    wrap,
    cells: Object.fromEntries(AXES.map(k => [k, wrap.querySelector(`[data-axis="${k}"]`)])
      .concat([['t', wrap.querySelector('[data-axis="t"]')]])),
    unitsLabel: wrap.querySelector('[data-units]'),
    unitBtn:    wrap.querySelector('[data-unit-btn]'),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Painting + units
// ──────────────────────────────────────────────────────────────────────

function paint(dom, state) {
  const k = state.units === 'mm' ? MM_PER_INCH : 1;
  for (const ax of AXES) {
    const cell = dom.cells[ax];
    if (!cell) continue;
    let v = state.pos[ax] || 0;
    if (ax === 'x' || ax === 'y' || ax === 'z') v = v * k;
    cell.textContent = v.toFixed(4);
  }
  if (dom.cells.t) dom.cells.t.textContent = String(state.pos.t || 0);
  if (dom.unitsLabel) dom.unitsLabel.textContent = state.units;
}

function setUnits(state, dom, units) {
  if (units !== 'inch' && units !== 'mm') return;
  state.units = units;
  paint(dom, state);
}
