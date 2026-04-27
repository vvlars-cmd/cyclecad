/**
 * @file widgets/sketch-arc.js
 * @description Sketch · 2D arc on the XY plane. Emits `entity` event.
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const scene = opts.scene;
  if (!scene) throw new Error('sketch-arc: opts.scene required');

  const entities = [];   // THREE.Line meshes added by this widget
  const listeners = { change: [], entity: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  function makeShape(params) {
    let geom;
    const r = params.r || 5; const a0 = params.a0 || 0; const a1 = params.a1 || Math.PI; const pts = []; for (let i=0;i<=32;i++) {{ const t = a0 + (a1-a0)*i/32; pts.push(new THREE.Vector3(Math.cos(t)*r, Math.sin(t)*r, 0)); }} geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color: 0xffd000 }));
    line.name = 'pt-sketch-arc';
    scene.add(line);
    entities.push(line);
    emit('entity', { shape: 'arc', line, params });
    return line;
  }

  function clear() {
    entities.forEach(l => { scene.remove(l); l.geometry.dispose(); l.material.dispose(); });
    entities.length = 0;
    emit('change', { kind: 'clear' });
  }

  return {
    api: {
      add(params) { return makeShape(params || {}); },
      clear,
      count() { return entities.length; },
      list() { return [...entities]; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { clear(); },
  };
}
