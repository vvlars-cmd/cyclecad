/**
 * @file widgets/viewport.js
 * @description Universal 3D substrate — the architectural keystone.
 *
 *   Owns: Scene · PerspectiveCamera · WebGLRenderer · render loop ·
 *         resize observer · ambient + key lights · root group.
 *
 *   Other 3D widgets (cam-nav, grid, axes, lights, section-cut, …) attach
 *   to this widget's scene/camera/renderer instead of creating their own.
 *
 *   Apps mount one viewport per page. Dispose on `destroy()`.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

/**
 * @typedef {Object} ViewportOpts
 * @property {string|HTMLElement} mount
 * @property {string}   [app]
 * @property {Object}   [meter]
 * @property {number}   [fov]               default 45
 * @property {number}   [near]              default 0.1
 * @property {number}   [far]               default 5000
 * @property {string}   [bg]                hex color, default '0xfafafa'
 * @property {boolean}  [shadows]           default false
 * @property {boolean}  [antialias]         default true
 * @property {Function} [onTick]            called every frame
 */

const FOG_COLOR = 0xeaeef2;
const DEFAULT_BG = 0xfafafa;

export async function init(opts) {
  const root = typeof opts.mount === 'string'
    ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('viewport: mount not found');

  // Make sure host has a positioned context for absolute children
  if (!root.style.position || root.style.position === 'static') {
    root.style.position = 'relative';
  }

  // ---- canvas + renderer ----
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  canvas.className = 'pt-viewport-canvas';
  root.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias:    opts.antialias !== false,
    preserveDrawingBuffer: true,    // for screenshot widget
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  if (opts.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  // ---- scene ----
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.bg || DEFAULT_BG);

  // ---- camera ----
  const camera = new THREE.PerspectiveCamera(
    opts.fov  || 45,
    1,
    opts.near || 0.1,
    opts.far  || 5000,
  );
  camera.position.set(35, 25, 40);
  camera.lookAt(0, 0, 0);

  // ---- default lights (the lights widget can replace these) ----
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  ambient.name = 'pt-viewport-ambient';
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.name = 'pt-viewport-key';
  key.position.set(10, 20, 12);
  if (opts.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
  }
  scene.add(key);

  // ---- root group (widgets attach geometry here, not directly to scene) ----
  const rootGroup = new THREE.Group();
  rootGroup.name = 'pt-viewport-root';
  scene.add(rootGroup);

  // ---- resize ----
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();
  function resize() {
    const r = root.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }

  // ---- render loop ----
  const listeners = { render: [], resize: [], change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => {
    try { fn(p); } catch (e) { /* swallow */ }
  });

  let raf = 0;
  let alive = true;
  function tick() {
    if (!alive) return;
    if (typeof opts.onTick === 'function') opts.onTick();
    renderer.render(scene, camera);
    emit('render');
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // ---- API ----
  const api = {
    getScene()    { return scene; },
    getCamera()   { return camera; },
    getRenderer() { return renderer; },
    getRoot()     { return rootGroup; },

    /** Add an Object3D to the root group. */
    attach(obj) { rootGroup.add(obj); emit('change', { kind: 'attach' }); },

    /** Remove an Object3D from the root. */
    detach(obj) { rootGroup.remove(obj); emit('change', { kind: 'detach' }); },

    /** Compute bounding box of root group. */
    bbox() {
      const box = new THREE.Box3().setFromObject(rootGroup);
      if (box.isEmpty()) return null;
      return box;
    },

    /** Animate camera to fit the root group. */
    fit(opts2 = {}) {
      const box = api.bbox();
      if (!box) return false;
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * Math.PI / 180;
      const dist = (maxDim / 2) / Math.tan(fov / 2) * (opts2.padding || 1.5);
      camera.position.copy(center).add(new THREE.Vector3(dist, dist, dist).multiplyScalar(0.6));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      emit('change', { kind: 'fit' });
      return true;
    },

    /** PNG data URL of the current frame. */
    screenshot(opts2 = {}) {
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png', opts2.quality || 0.92);
    },

    /** Force a single render outside the loop. */
    render() { renderer.render(scene, camera); emit('render'); },

    /** Set background color. */
    setBackground(color) {
      scene.background = new THREE.Color(color);
      emit('change', { kind: 'bg' });
    },
  };

  return {
    api,
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      // dispose Three.js
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => m.dispose && m.dispose());
        }
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}
