/**
 * @file widgets/weight-estimator.js
 * @description Estimate part weight from bounding-box volume × material density.
 *   Stage 1 ships 9 common materials; can be extended via api.addMaterial().
 *
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

/** density in g/cm³ — multiply by volume in cm³ to get grams */
const MATERIALS = {
  steel:    { density: 7.85, label: 'Steel' },
  aluminum: { density: 2.70, label: 'Aluminum' },
  brass:    { density: 8.50, label: 'Brass' },
  bronze:   { density: 8.80, label: 'Bronze' },
  copper:   { density: 8.96, label: 'Copper' },
  titanium: { density: 4.51, label: 'Titanium' },
  abs:      { density: 1.04, label: 'ABS plastic' },
  pla:      { density: 1.24, label: 'PLA plastic' },
  nylon:    { density: 1.15, label: 'Nylon' },
};

export async function init(opts) {
  const target = opts.target;
  if (!target) throw new Error('weight-estimator: opts.target required');

  let unitMm = opts.unit !== 'inch';   // true = mm-based, false = inch-based
  const materials = { ...MATERIALS };
  if (opts.materials) Object.assign(materials, opts.materials);

  const listeners = { change: [], estimate: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  /**
   * @param {string} material
   * @param {THREE.Object3D} [target2]
   * @returns {{mass: number, volume: number, density: number, mat: string, unit: string}|null}
   */
  function estimate(material = 'steel', target2 = target) {
    const cfg = materials[material];
    if (!cfg) throw new Error(`unknown material: ${material}`);
    const box = new THREE.Box3().setFromObject(target2);
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    // Convert scene units → cm (assume scene is mm if unitMm, else inches)
    const toCm = unitMm ? 0.1 : 2.54;
    const vol_cm3 = (size.x * toCm) * (size.y * toCm) * (size.z * toCm);
    const mass_g = vol_cm3 * cfg.density;
    const result = {
      mass:    +mass_g.toFixed(2),     // grams
      volume:  +vol_cm3.toFixed(2),     // cm³
      density: cfg.density,
      mat:     material,
      unit:    unitMm ? 'mm' : 'inch',
    };
    emit('estimate', result);
    return result;
  }

  return {
    api: {
      estimate,
      materials() { return Object.keys(materials); },
      getMaterial(name) { return materials[name] || null; },
      addMaterial(name, density, label) { materials[name] = { density, label: label || name }; emit('change', { kind: 'material', name }); },
      setUnit(u) { unitMm = u !== 'inch'; emit('change', { unit: u }); },
      getUnit() { return unitMm ? 'mm' : 'inch'; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { /* nothing */ },
  };
}
