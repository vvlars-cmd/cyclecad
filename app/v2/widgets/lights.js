/**
 * @file widgets/lights.js
 * @description Lighting modes — studio, sun, sketch. Replaces the
 *   default lights baked into the viewport with a richer setup.
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

const MODES = {
  studio: { ambient: 0.5, key: 0.8, fill: 0.4, rim: 0.3, keyPos: [10, 20, 12], fillPos: [-10, 8, -8], rimPos: [0, 5, -15] },
  sun:    { ambient: 0.3, key: 1.2, fill: 0.0, rim: 0.0, keyPos: [20, 30, 10] },
  sketch: { ambient: 0.9, key: 0.3, fill: 0.0, rim: 0.0, keyPos: [10, 20, 12] },
};

export async function init(opts) {
  const scene = opts.scene;
  if (!scene) throw new Error('lights: opts.scene required');

  // remove the viewport's default lights if they exist
  const toRemove = ['pt-viewport-ambient', 'pt-viewport-key'];
  toRemove.forEach(name => {
    const found = scene.getObjectByName(name);
    if (found) scene.remove(found);
  });

  const lights = {};
  let mode = opts.mode || 'studio';

  function build(modeName) {
    Object.values(lights).forEach(l => scene.remove(l));
    const cfg = MODES[modeName] || MODES.studio;
    lights.ambient = new THREE.AmbientLight(0xffffff, cfg.ambient);
    lights.ambient.name = 'pt-lights-ambient';
    scene.add(lights.ambient);

    lights.key = new THREE.DirectionalLight(0xffffff, cfg.key);
    lights.key.name = 'pt-lights-key';
    lights.key.position.set(...cfg.keyPos);
    scene.add(lights.key);

    if (cfg.fill > 0) {
      lights.fill = new THREE.DirectionalLight(0xeef3ff, cfg.fill);
      lights.fill.name = 'pt-lights-fill';
      lights.fill.position.set(...cfg.fillPos);
      scene.add(lights.fill);
    }
    if (cfg.rim > 0) {
      lights.rim = new THREE.DirectionalLight(0xffffff, cfg.rim);
      lights.rim.name = 'pt-lights-rim';
      lights.rim.position.set(...cfg.rimPos);
      scene.add(lights.rim);
    }
  }
  build(mode);

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      setMode(m) {
        if (!MODES[m]) throw new Error(`unknown mode: ${m}`);
        mode = m;
        build(m);
        emit('change', { mode });
      },
      getMode() { return mode; },
      setIntensity(scale) {
        Object.values(lights).forEach(l => {
          if (l.intensity !== undefined) l.intensity *= scale;
        });
        emit('change', { intensity: scale });
      },
      modes() { return Object.keys(MODES); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      Object.values(lights).forEach(l => scene.remove(l));
    },
  };
}
