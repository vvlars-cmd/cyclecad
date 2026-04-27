/**
 * @file widgets/sketch-polyline.js
 * @description Sketch · 2D polyline on the XY plane. Emits `entity` event.
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const scene = opts.scene;
  if (!scene) throw new Error('sketch-polyline: opts.scene required');

  const entities = [];   // THREE.Line meshes added by this widget
  const listeners = { change: [], entity: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  function makeShape(params) {
    let geom;
    const pts = (params.points || [[0,0],[5,0],[5,5],[0,5]]).map(p=>new THREE.Vector3(p[0],p[1],0)); geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.LineLoop(geom, new THREE.LineBasicMaterial({ color: 0xffd000 }));
    line.name = 'pt-sketch-polyline';
    scene.add(line);
    entities.push(line);
    emit('entity', { shape: 'polyline', line, params });
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
