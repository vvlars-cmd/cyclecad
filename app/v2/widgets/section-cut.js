/**
 * @file widgets/section-cut.js
 * @description X/Y/Z clipping plane on the renderer. Toggleable.
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

const AXES = { x: [1,0,0], y: [0,1,0], z: [0,0,1] };

export async function init(opts) {
  if (!opts.renderer) throw new Error('section-cut: opts.renderer required');
  if (!opts.scene)    throw new Error('section-cut: opts.scene required');

  let axis    = opts.axis    || 'x';
  let offset  = opts.offset  ?? 0;
  let flipped = opts.flipped ?? false;
  let enabled = opts.enabled ?? false;

  const plane = new THREE.Plane();
  function rebuild() {
    const a = AXES[axis] || AXES.x;
    plane.normal.set(a[0], a[1], a[2]);
    if (flipped) plane.normal.negate();
    plane.constant = -offset * (flipped ? -1 : 1);
  }
  rebuild();

  function apply() {
    opts.renderer.localClippingEnabled = enabled;
    opts.scene.traverse(obj => {
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (!m) return;
          m.clippingPlanes = enabled ? [plane] : [];
          m.clipShadows = enabled;
          m.side = enabled ? THREE.DoubleSide : THREE.FrontSide;
          m.needsUpdate = true;
        });
      }
    });
  }

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  apply();

  return {
    api: {
      enable()  { enabled = true;  apply(); emit('change', { enabled }); },
      disable() { enabled = false; apply(); emit('change', { enabled }); },
      toggle()  { enabled = !enabled; apply(); emit('change', { enabled }); return enabled; },
      isEnabled() { return enabled; },
      setAxis(a) { axis = a; rebuild(); apply(); emit('change', { axis }); },
      setOffset(n) { offset = n; rebuild(); apply(); emit('change', { offset }); },
      flip() { flipped = !flipped; rebuild(); apply(); emit('change', { flipped }); },
      getState() { return { axis, offset, flipped, enabled }; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      enabled = false;
      apply();
    },
  };
}
