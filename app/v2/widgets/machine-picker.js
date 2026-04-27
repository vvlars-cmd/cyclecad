/**
 * @file widgets/machine-picker.js
 * @description CAM · Penta Machine selector. Picks the active 5-axis target
 *   from the catalog at `shared/machines/penta.json` (Pocket NC V2-50 by
 *   default, plus Solo, V2-10, V2-8L, V1) and surfaces the chosen machine's
 *   envelope, spindle, and feedrate caps for downstream CAM widgets to
 *   consume. Emits `'pick'` whenever the operator changes the target so
 *   `post-processor`, `sim-executor`, and `cam-*` widgets can re-validate.
 *
 *   The official Penta Machine post-processor (`shared/postprocessors/
 *   penta-machine.cps`) is exposed for download — install it in Fusion 360
 *   under Manage → Post Library → Import to use Fusion's native NGC
 *   emitter against the same machine config.
 *
 *   References:
 *     - Kinetic Control wiki: https://pentamachine.atlassian.net/wiki/spaces/KCUR
 *     - G & M code overview:  https://pentamachine.atlassian.net/wiki/spaces/KCUR/pages/1774551045
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import {
  CATALOGS,
  listMachines,
  getMachine,
  defaultMachine,
  envelopeSummary,
  checkEnvelope,
} from '../shared/machines/index.js';

/**
 * @typedef {{
 *   mount: string | HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function },
 *   params?: { machineId?: string, units?: 'in'|'mm' }
 * }} MachinePickerOpts
 *
 * @typedef {{
 *   api: {
 *     pick:           (id: string) => void,
 *     getMachine:     () => ReturnType<typeof getMachine>,
 *     getEnvelope:    () => string,
 *     setUnits:       (u: 'in'|'mm') => void,
 *     checkPosition:  (pos: object) => ReturnType<typeof checkEnvelope>,
 *     listMachines:   () => ReturnType<typeof listMachines>,
 *     downloadPost:   () => void,
 *   },
 *   on: (event: 'pick'|'change'|'units', fn: (p: unknown) => void) => void,
 *   destroy: () => void,
 * }} MachinePickerHandle
 */

/**
 * @param {MachinePickerOpts} opts
 * @returns {Promise<MachinePickerHandle>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('machine-picker: mount not found');

  /** @type {Record<string, Function[]>} */
  const listeners = { pick: [], change: [], units: [] };
  /** @param {string} ev @param {*} p */
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch (e) { /* swallow */ } });

  let units = opts.params?.units === 'mm' ? 'mm' : 'in';
  let active = getMachine(opts.params?.machineId || '') || defaultMachine();

  const dom = document.createElement('div');
  dom.className = 'pt-machine-picker';
  dom.style.cssText = `
    padding: 18px 20px; font: 13px Inter, sans-serif;
    background: #fff; color: #0F172A;
    border: 1px solid #E5E7EB; border-radius: 8px; max-width: 640px;
  `;
  dom.innerHTML = `
    <div style="font:600 11px Inter; color:#7C3AED; letter-spacing:.18em; margin-bottom:6px">
      MACHINE · PICKER
    </div>
    <div style="font:600 21px Georgia, serif; margin-bottom:4px" data-machine-name></div>
    <div style="color:#6B7280; font-size:12px; margin-bottom:14px" data-vendor></div>

    <div style="display:flex; gap:12px; align-items:center; margin-bottom:14px">
      <label style="font:600 11px Inter; color:#374151; text-transform:uppercase; letter-spacing:.08em">
        Machine
        <select data-machine-select style="
          margin-left:8px; padding:7px 10px; border:1px solid #D1D5DB;
          border-radius:5px; font:13px Inter; min-width:200px;
        "></select>
      </label>
      <label style="font:600 11px Inter; color:#374151; text-transform:uppercase; letter-spacing:.08em">
        Units
        <select data-units style="
          margin-left:8px; padding:7px 10px; border:1px solid #D1D5DB; border-radius:5px;
        ">
          <option value="in"${units === 'in' ? ' selected' : ''}>inch</option>
          <option value="mm"${units === 'mm' ? ' selected' : ''}>mm</option>
        </select>
      </label>
    </div>

    <div data-envelope style="
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px;
      padding: 12px 14px; margin-bottom: 14px;
    "></div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px">
      <a data-download-post download="penta-machine.cps"
         href="../shared/postprocessors/penta-machine.cps" style="
        background: #0EA5E9; color: #fff; border: none; padding: 8px 14px;
        border-radius: 5px; font:600 12px Inter; cursor: pointer;
        text-decoration: none; display: inline-block;
      ">⬇ Download Fusion 360 post (.cps)</a>
      <a data-wiki target="_blank" rel="noopener" style="
        background: #fff; color: #0F172A; border: 1px solid #D1D5DB;
        padding: 8px 14px; border-radius: 5px; font:600 12px Inter;
        text-decoration: none; display: inline-block;
      ">📖 Kinetic Control wiki</a>
      <a data-gcode target="_blank" rel="noopener" style="
        background: #fff; color: #0F172A; border: 1px solid #D1D5DB;
        padding: 8px 14px; border-radius: 5px; font:600 12px Inter;
        text-decoration: none; display: inline-block;
      ">📜 G & M codes</a>
    </div>

    <div data-notes style="color:#6B7280; font-size:11px; line-height:1.5"></div>
  `;
  root.appendChild(dom);

  const select   = /** @type {HTMLSelectElement} */ (dom.querySelector('[data-machine-select]'));
  const unitsEl  = /** @type {HTMLSelectElement} */ (dom.querySelector('[data-units]'));
  const nameEl   = /** @type {HTMLElement}       */ (dom.querySelector('[data-machine-name]'));
  const vendEl   = /** @type {HTMLElement}       */ (dom.querySelector('[data-vendor]'));
  const envEl    = /** @type {HTMLElement}       */ (dom.querySelector('[data-envelope]'));
  const notesEl  = /** @type {HTMLElement}       */ (dom.querySelector('[data-notes]'));
  const wikiEl   = /** @type {HTMLAnchorElement} */ (dom.querySelector('[data-wiki]'));
  const gcodeEl  = /** @type {HTMLAnchorElement} */ (dom.querySelector('[data-gcode]'));

  // Populate machines
  for (const m of listMachines()) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name}${m.default ? '  (default)' : ''}`;
    if (m.id === active.id) opt.selected = true;
    select.appendChild(opt);
  }
  wikiEl.href  = CATALOGS.penta.kineticControlWiki;
  gcodeEl.href = CATALOGS.penta.gCodeReference;

  /** Render the active machine's envelope + metadata. */
  function render() {
    nameEl.textContent = active.name;
    vendEl.textContent = `${active.vendor} · controller: ${active.controller} · post: penta-machine.cps · ext: .${active.extension}`;
    envEl.innerHTML    = `
      <div style="font:600 11px Inter; color:#475569; letter-spacing:.08em; text-transform:uppercase; margin-bottom:6px">
        Travel envelope
      </div>
      <div style="font: 14px JetBrains Mono, ui-monospace, monospace; color:#0F172A; line-height:1.7" data-env-line>
        ${envelopeSummary(active.id)}
      </div>
      ${active.tcpc === true ? '<div style="margin-top:6px; font-size:11px; color:#10B981">✓ TCPC enabled</div>'
        : active.tcpc === 'optional' ? '<div style="margin-top:6px; font-size:11px; color:#F59E0B">⚠ TCPC optional — see wiki</div>'
        : ''}
    `;
    notesEl.textContent = active.notes || '';
  }
  render();

  /** @param {Event} _e */
  const onPick = (_e) => {
    const id = select.value;
    const next = getMachine(id);
    if (!next) return;
    active = next;
    render();
    opts.meter?.charge?.({
      widget: 'machine-picker', method: 'pick', tokensIn: 50, tokensOut: 50,
      modelTier: 'haiku',
    }).catch(() => { /* meter unreachable in standalone */ });
    emit('pick', { id, machine: active });
    emit('change', { kind: 'pick', id });
  };
  /** @param {Event} _e */
  const onUnits = (_e) => {
    units = unitsEl.value === 'mm' ? 'mm' : 'in';
    emit('units', { units });
    emit('change', { kind: 'units', units });
  };
  select.addEventListener('change', onPick);
  unitsEl.addEventListener('change', onUnits);

  return {
    api: {
      pick(id) {
        if (!getMachine(id)) throw new Error(`unknown machine: ${id}`);
        select.value = id;
        onPick(new Event('change'));
      },
      getMachine() { return active; },
      getEnvelope() { return envelopeSummary(active.id); },
      setUnits(u) {
        if (u !== 'in' && u !== 'mm') throw new Error(`bad units: ${u}`);
        unitsEl.value = u;
        onUnits(new Event('change'));
      },
      /** @param {object} pos */
      checkPosition(pos) { return checkEnvelope(active.id, /** @type {any} */(pos)); },
      listMachines() { return listMachines(); },
      downloadPost() {
        const a = /** @type {HTMLAnchorElement} */ (dom.querySelector('[data-download-post]'));
        a.click();
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      select.removeEventListener('change', onPick);
      unitsEl.removeEventListener('change', onUnits);
      dom.remove();
    },
  };
}
