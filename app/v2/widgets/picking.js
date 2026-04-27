/**
 * @file widgets/picking.js
 * @description Mouse / touch hit-test on the viewport. Wraps THREE.Raycaster.
 *   Emits 'pick' { object, point, distance, event } on click.
 *
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  const root = typeof opts.mount === 'string'
    ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('picking: mount not found');
  if (!opts.scene)  throw new Error('picking: opts.scene required');
  if (!opts.camera) throw new Error('picking: opts.camera required');

  const raycaster = new THREE.Raycaster();
  const ndc       = new THREE.Vector2();
  const target    = opts.target || opts.scene;
  let enabled = opts.enabled !== false;
  let recursive = opts.recursive !== false;

  const listeners = { pick: [], hover: [], change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  // resolve click target — the viewport canvas inside the mount, fallback to mount itself
  const canvas = root.querySelector('canvas') || root;

  function pickAt(clientX, clientY, evType, ev) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width)  *  2 - 1;
    ndc.y = ((clientY - rect.top)  / rect.height) * -2 + 1;
    raycaster.setFromCamera(ndc, opts.camera);
    const hits = raycaster.intersectObject(target, recursive);
    if (hits.length > 0) {
      const hit = hits[0];
      const payload = {
        object:   hit.object,
        point:    hit.point.clone(),
        distance: hit.distance,
        event:    evType,
      };
      emit(evType, payload);
      return payload;
    }
    return null;
  }

  function onClick(ev) {
    if (!enabled) return;
    pickAt(ev.clientX, ev.clientY, 'pick', ev);
  }
  function onMove(ev) {
    if (!enabled) return;
    if (listeners.hover.length === 0) return;
    pickAt(ev.clientX, ev.clientY, 'hover', ev);
  }

  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMove);

  return {
    api: {
      enable()  { enabled = true;  emit('change', { enabled }); },
      disable() { enabled = false; emit('change', { enabled }); },
      isEnabled() { return enabled; },
      pick(x, y) { return pickAt(x, y, 'pick', null); },
      setTarget(obj) { /* allow re-pointing */ Object.assign({ target }, { target: obj }); },
      setRecursive(b) { recursive = !!b; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMove);
    },
  };
}
