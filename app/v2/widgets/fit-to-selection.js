/**
 * @file widgets/fit-to-selection.js
 * @description Animate camera to fit a target object's bounding box.
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  if (!opts.camera) throw new Error('fit-to-selection: opts.camera required');

  const camera   = opts.camera;
  const root     = opts.root || opts.scene;
  let padding    = opts.padding ?? 1.5;
  let durationMs = opts.duration ?? 600;

  const listeners = { change: [], fit: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  let raf = 0;

  function fit(target) {
    const obj = target || root;
    if (!obj) return false;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return false;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * Math.PI / 180;
    const dist = (maxDim / 2) / Math.tan(fov / 2) * padding;

    const dir = new THREE.Vector3().copy(camera.position).sub(center).normalize();
    if (dir.lengthSq() < 0.0001) dir.set(1, 1, 1).normalize();
    const finalPos = new THREE.Vector3().copy(center).addScaledVector(dir, dist);

    if (durationMs <= 0) {
      camera.position.copy(finalPos);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      emit('fit', { target: obj });
      return true;
    }

    cancelAnimationFrame(raf);
    const startPos = camera.position.clone();
    const startTime = performance.now();
    const animate = () => {
      const t = Math.min((performance.now() - startTime) / durationMs, 1);
      const k = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      camera.position.lerpVectors(startPos, finalPos, k);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      if (t < 1) {
        raf = requestAnimationFrame(animate);
      } else {
        emit('fit', { target: obj });
      }
    };
    animate();
    return true;
  }

  return {
    api: {
      fit,
      reset() {
        camera.position.set(35, 25, 40);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        emit('change', { kind: 'reset' });
      },
      setPadding(p) { padding = p; },
      setDuration(ms) { durationMs = ms; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { cancelAnimationFrame(raf); },
  };
}
