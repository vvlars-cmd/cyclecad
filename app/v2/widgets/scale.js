/**
 * @file widgets/scale.js
 * @description Solid op · uniform scale. Generates a transformed BufferGeometry
 *   from a base profile. Stage 2 scaffold — full B-rep arrives via OCCT later.
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const target = opts.target || opts.scene;
  if (!target) throw new Error('scale: opts.target required');

  const created = [];
  const listeners = { change: [], op: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  function run(params = {}) {
    const s = params.s||3; const geom = new THREE.BoxGeometry(s, s, s);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: params.color || 0x10b981 }));
    mesh.name = 'pt-scale';
    if (params.position) mesh.position.set(...params.position);
    target.add(mesh);
    created.push(mesh);
    emit('op', { op: 'scale', mesh, params });
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
