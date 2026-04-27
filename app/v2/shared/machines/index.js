/**
 * @file shared/machines/index.js
 * @description Loader and helpers for the Suite's machine catalog. Each
 *   vendor file under `shared/machines/<vendor>.json` describes one or more
 *   machine models (envelope, spindle, feedrate caps, post-processor path,
 *   controller). Widgets like `machine-picker`, `post-processor`,
 *   `sim-executor`, and `cam-*` consume this catalog so a CAM operation
 *   knows whether the planned toolpath fits the chosen machine.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import penta from './penta.json' with { type: 'json' };

/**
 * @typedef {{ travel_in?: number, travel_mm?: number,
 *             min_in?: number, max_in?: number,
 *             min_deg?: number, max_deg?: number,
 *             kind?: 'limited'|'continuous', note?: string }} AxisSpec
 *
 * @typedef {{ id: string, name: string, kind: string, default?: boolean,
 *             tcpc?: boolean | 'optional',
 *             envelope: { X?: AxisSpec, Y?: AxisSpec, Z?: AxisSpec, A?: AxisSpec, B?: AxisSpec } | 'see-vendor',
 *             spindle?: object, feedrate?: object, notes?: string }} MachineModel
 *
 * @typedef {{ vendor: string, vendorUrl: string, post: string, extension: string,
 *             controller: string, models: MachineModel[] }} VendorCatalog
 */

/** All machine catalogs, keyed by vendor id. */
export const CATALOGS = Object.freeze({
  penta,
});

/**
 * List every machine across every vendor, flattened.
 *
 * @returns {Array<MachineModel & { vendor: string, vendorUrl: string,
 *                                  post: string, extension: string,
 *                                  controller: string }>}
 */
export function listMachines() {
  const out = [];
  for (const [, cat] of Object.entries(CATALOGS)) {
    for (const m of cat.models) {
      out.push({
        ...m,
        vendor: cat.vendor,
        vendorUrl: cat.vendorUrl,
        post: cat.post,
        extension: cat.extension,
        controller: cat.controller,
      });
    }
  }
  return out;
}

/**
 * Find a machine by id (e.g. `'v2-50'`, `'solo'`).
 *
 * @param {string} id
 * @returns {ReturnType<typeof listMachines>[number] | null}
 */
export function getMachine(id) {
  return listMachines().find(m => m.id === id) || null;
}

/**
 * Default machine — the one used when no explicit pick is made. Today this
 * is Pocket NC V2-50 (the model whose envelope was confirmed by Matt).
 *
 * @returns {ReturnType<typeof listMachines>[number]}
 */
export function defaultMachine() {
  const def = listMachines().find(m => m.default);
  if (!def) throw new Error('machine catalog has no default');
  return def;
}

/**
 * Validate that an XYZ + AB target sits inside the machine envelope.
 *
 * @param {string} machineId
 * @param {{ X?: number, Y?: number, Z?: number, A?: number, B?: number,
 *           units?: 'in' | 'mm' }} pos
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 *   `ok` is true only when every supplied axis fits the envelope; missing
 *   axis values are not validated.
 */
export function checkEnvelope(machineId, pos) {
  const m = getMachine(machineId);
  if (!m) return { ok: false, errors: [`unknown machine: ${machineId}`], warnings: [] };
  if (m.envelope === 'see-vendor') {
    return { ok: true, errors: [], warnings: [`envelope for ${m.name} is not yet bundled — see ${m.vendor} spec sheet`] };
  }
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const u = pos.units || 'in';

  /**
   * @param {string} ax
   * @param {AxisSpec | undefined} env
   * @param {number | undefined} v
   */
  const checkLinear = (ax, env, v) => {
    if (env == null || v == null) return;
    const min = env.min_in;
    const max = env.max_in;
    if (min == null || max == null) return;
    const val_in = u === 'mm' ? v / 25.4 : v;
    if (val_in < min || val_in > max) {
      errors.push(`${ax}=${v.toFixed(3)} ${u} outside envelope [${min}, ${max}] in`);
    }
  };
  /**
   * @param {string} ax
   * @param {AxisSpec | undefined} env
   * @param {number | undefined} deg
   */
  const checkRotary = (ax, env, deg) => {
    if (env == null || deg == null) return;
    if (env.kind === 'continuous') return;
    const min = env.min_deg, max = env.max_deg;
    if (min == null || max == null) return;
    if (deg < min || deg > max) errors.push(`${ax}=${deg.toFixed(2)}° outside envelope [${min}, ${max}]°`);
  };

  checkLinear('X', m.envelope.X, pos.X);
  checkLinear('Y', m.envelope.Y, pos.Y);
  checkLinear('Z', m.envelope.Z, pos.Z);
  checkRotary('A', m.envelope.A, pos.A);
  checkRotary('B', m.envelope.B, pos.B);

  if (m.envelope.Z?.note) warnings.push(`Z: ${m.envelope.Z.note}`);
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Pretty one-line envelope summary, e.g. `'X 115.5 mm · Y 128.3 mm · Z 90.1 mm · A −25..135° · B continuous'`.
 *
 * @param {string} machineId
 * @returns {string}
 */
export function envelopeSummary(machineId) {
  const m = getMachine(machineId);
  if (!m || m.envelope === 'see-vendor') return 'envelope: see vendor';
  /** @type {string[]} */
  const parts = [];
  for (const ax of /** @type {const} */ (['X', 'Y', 'Z'])) {
    const a = m.envelope[ax];
    if (a?.travel_mm) parts.push(`${ax} ${a.travel_mm} mm`);
  }
  if (m.envelope.A) {
    const a = m.envelope.A;
    parts.push(`A ${a.min_deg}..${a.max_deg}°`);
  }
  if (m.envelope.B) {
    const b = m.envelope.B;
    parts.push(b.kind === 'continuous' ? 'B continuous' : `B ${b.min_deg}..${b.max_deg}°`);
  }
  return parts.join(' · ');
}
