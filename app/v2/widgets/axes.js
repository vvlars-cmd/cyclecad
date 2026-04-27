/**
 * @file widgets/axes.js
 * @description XYZ gizmo at origin (THREE.AxesHelper).
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const scene = opts.scene;
  if (!scene) throw new Error('axes: opts.scene required');

  let size = opts.size ?? 5;
  let visible = opts.visible !== false;

  let helper = new THREE.AxesHelper(size);
  helper.name = 'pt-axes';
  helper.visible = visible;
  scene.add(helper);

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      setSize(n) {
        size = n;
        scene.remove(helper);
        helper.geometry.dispose();
        helper.material.dispose();
        helper = new THREE.AxesHelper(size);
        helper.name = 'pt-axes';
        helper.visible = visible;
        scene.add(helper);
        emit('change', { size });
      },
      show()   { visible = true;  helper.visible = true;  emit('change', { visible }); },
      hide()   { visible = false; helper.visible = false; emit('change', { visible }); },
      toggle() { visible = !visible; helper.visible = visible; emit('change', { visible }); return visible; },
      isVisible() { return visible; },
      getMesh()   { return helper; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      scene.remove(helper);
      helper.geometry.dispose();
      helper.material.dispose();
    },
  };
}
