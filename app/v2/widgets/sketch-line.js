/**
 * @file widgets/sketch-line.js
 * @description Sketch · 2D line on the XY plane. Emits `entity` event.
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const scene = opts.scene;
  if (!scene) throw new Error('sketch-line: opts.scene required');

  const entities = [];   // THREE.Line meshes added by this widget
  const listeners = { change: [], entity: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  function makeShape(params) {
    let geom;
    const a = params.a || [0,0]; const b = params.b || [10,0]; const pts = [new THREE.Vector3(a[0],a[1],0), new THREE.Vector3(b[0],b[1],0)]; geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color: 0xffd000 }));
    line.name = 'pt-sketch-line';
    scene.add(line);
    entities.push(line);
    emit('entity', { shape: 'line', line, params });
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
