/**
 * @file widgets/extrude.js
 * @description Solid op · extrude profile to solid. Generates a transformed BufferGeometry
 *   from a base profile. Stage 2 scaffold — full B-rep arrives via OCCT later.
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const target = opts.target || opts.scene;
  if (!target) throw new Error('extrude: opts.target required');

  const created = [];
  const listeners = { change: [], op: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  function run(params = {}) {
    const w = params.w||4, h = params.h||4, d = params.d||4; const geom = new THREE.BoxGeometry(w, d, h);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: params.color || 0x10b981 }));
    mesh.name = 'pt-extrude';
    if (params.position) mesh.position.set(...params.position);
    target.add(mesh);
    created.push(mesh);
    emit('op', { op: 'extrude', mesh, params });
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
