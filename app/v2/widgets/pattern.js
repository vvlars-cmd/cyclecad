/**
 * @file widgets/pattern.js
 * @description Solid op · rectangular + circular pattern. Generates a transformed BufferGeometry
 *   from a base profile. Stage 2 scaffold — full B-rep arrives via OCCT later.
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const target = opts.target || opts.scene;
  if (!target) throw new Error('pattern: opts.target required');

  const created = [];
  const listeners = { change: [], op: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  function run(params = {}) {
    const r = params.r||1.5; const geom = new THREE.BoxGeometry(r, r, r);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: params.color || 0x10b981 }));
    mesh.name = 'pt-pattern';
    if (params.position) mesh.position.set(...params.position);
    target.add(mesh);
    created.push(mesh);
    emit('op', { op: 'pattern', mesh, params });
    return mesh;
  }

  function clear() {
    created.forEach(m => { target.remove(m); m.geometry.dispose(); m.material.dispose(); });
    created.length = 0;
    emit('change', { kind: 'clear' });
  }

  return {
    api: {
      run, clear,
      count() { return created.length; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { clear(); },
  };
}
