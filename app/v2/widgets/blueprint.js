/**
 * @file widgets/blueprint.js
 * @description Toggle blueprint theme on the viewport — white-on-blue
 *   wireframe override. Restores on disable.
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  if (!opts.scene)    throw new Error('blueprint: opts.scene required');
  if (!opts.renderer) throw new Error('blueprint: opts.renderer required');

  const original = new Map();   // material → { color, wireframe, transparent, opacity }
  const originalBg = opts.scene.background?.clone?.() || null;
  let enabled = false;

  function apply() {
    if (enabled) {
      opts.scene.background = new THREE.Color(0x0b3d91);
      opts.scene.traverse(obj => {
        if (!obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (!('wireframe' in m)) return;
          if (!original.has(m)) {
            original.set(m, {
              color: m.color?.clone?.(), wireframe: m.wireframe,
              transparent: m.transparent, opacity: m.opacity,
            });
          }
          if (m.color) m.color.set(0xffffff);
          m.wireframe = true;
          m.transparent = true;
          m.opacity = 0.85;
          m.needsUpdate = true;
        });
      });
    } else {
      opts.scene.background = originalBg;
      original.forEach((orig, m) => {
        if (orig.color && m.color) m.color.copy(orig.color);
        m.wireframe   = orig.wireframe;
        m.transparent = orig.transparent;
        m.opacity     = orig.opacity;
        m.needsUpdate = true;
      });
      original.clear();
    }
  }

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      enable()  { enabled = true;  apply(); emit('change', { enabled }); },
      disable() { enabled = false; apply(); emit('change', { enabled }); },
      toggle()  { enabled = !enabled; apply(); emit('change', { enabled }); return enabled; },
      isEnabled() { return enabled; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      enabled = false;
      apply();
    },
  };
}
