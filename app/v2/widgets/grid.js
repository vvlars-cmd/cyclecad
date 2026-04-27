/**
 * @file widgets/grid.js
 * @description Configurable grid plane (THREE.GridHelper) on the viewport floor.
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const scene = opts.scene;
  if (!scene) throw new Error('grid: opts.scene required');

  let size  = opts.size  ?? 50;
  let div   = opts.div   ?? 50;
  let color1= opts.color1 ?? 0xb0b0b0;
  let color2= opts.color2 ?? 0xe0e0e0;
  let visible = opts.visible !== false;

  let helper = new THREE.GridHelper(size, div, color1, color2);
  helper.name = 'pt-grid';
  helper.visible = visible;
  scene.add(helper);

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  function rebuild() {
    scene.remove(helper);
    helper.geometry.dispose();
    helper.material.dispose();
    helper = new THREE.GridHelper(size, div, color1, color2);
    helper.name = 'pt-grid';
    helper.visible = visible;
    scene.add(helper);
  }

  return {
    api: {
      setSize(n)  { size = n; rebuild(); emit('change', { size }); },
      setDivisions(n) { div = n; rebuild(); emit('change', { div }); },
      setColors(c1, c2) { color1 = c1; color2 = c2; rebuild(); emit('change', {}); },
      show()      { visible = true;  helper.visible = true;  emit('change', { visible }); },
      hide()      { visible = false; helper.visible = false; emit('change', { visible }); },
      toggle()    { visible = !visible; helper.visible = visible; emit('change', { visible }); return visible; },
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
