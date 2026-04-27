/**
 * @file widgets/annotations.js
 * @description Click-to-place 3D annotation pins. Each pin is a small
 *   sphere + screen-space label. Persists via localStorage by default.
 *
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

const STORAGE_KEY = 'cyclecad.annotations';

export async function init(opts) {
  if (!opts.scene)  throw new Error('annotations: opts.scene required');
  if (!opts.camera) throw new Error('annotations: opts.camera required');
  if (!opts.mount)  throw new Error('annotations: opts.mount required');

  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('annotations: mount not found');
  const canvas = root.querySelector('canvas') || root;
  const target = opts.target || opts.scene;

  // overlay holding screen-space labels
  const overlay = document.createElement('div');
  overlay.className = 'pt-annotations';
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:25';
  root.appendChild(overlay);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let active = false;

  /** @type {{id:string, point:THREE.Vector3, text:string, marker:THREE.Mesh, label:HTMLDivElement}[]} */
  const pins = [];

  const listeners = { change: [], add: [], remove: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  function makeMarker(point, text) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff0066 })
    );
    sphere.position.copy(point);
    sphere.name = 'pt-annotation-marker';
    opts.scene.add(sphere);

    const label = document.createElement('div');
    label.className = 'pt-annotation-label';
    label.style.cssText = `
      position: absolute; transform: translate(-50%, -120%);
      background: rgba(0,0,0,0.8); color: #fff;
      padding: 4px 8px; border-radius: 4px;
      font: 11px Inter, sans-serif; pointer-events: auto; cursor: pointer;
      white-space: nowrap;
    `;
    label.textContent = text;
    overlay.appendChild(label);

    return { sphere, label };
  }

  function add(point, text = 'note') {
    const id = 'a_' + Math.random().toString(36).slice(2, 9);
    const { sphere, label } = makeMarker(point, text);
    label.addEventListener('click', () => {
      const next = prompt('Edit annotation:', text);
      if (next !== null) {
        label.textContent = next;
        const p = pins.find(x => x.id === id);
        if (p) { p.text = next; saveLocal(); emit('change', { id, kind: 'edit', text: next }); }
      }
    });
    label.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      remove(id);
    });
    pins.push({ id, point: point.clone(), text, marker: sphere, label });
    saveLocal();
    emit('add', { id, point, text });
    return id;
  }

  function remove(id) {
    const idx = pins.findIndex(p => p.id === id);
    if (idx < 0) return false;
    const p = pins[idx];
    opts.scene.remove(p.marker);
    p.marker.geometry.dispose(); p.marker.material.dispose();
    p.label.remove();
    pins.splice(idx, 1);
    saveLocal();
    emit('remove', { id });
    return true;
  }

  function clear() {
    while (pins.length) remove(pins[0].id);
  }

  function saveLocal() {
    try {
      const data = pins.map(p => ({ id: p.id, x: p.point.x, y: p.point.y, z: p.point.z, text: p.text }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      data.forEach(d => add(new THREE.Vector3(d.x, d.y, d.z), d.text));
    } catch { /* ignore */ }
  }

  if (opts.persist !== false) loadLocal();

  function onClick(ev) {
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width)  *  2 - 1;
    ndc.y = ((ev.clientY - rect.top)  / rect.height) * -2 + 1;
    raycaster.setFromCamera(ndc, opts.camera);
    const hits = raycaster.intersectObject(target, true);
    if (hits.length === 0) return;
    add(hits[0].point);
  }
  canvas.addEventListener('click', onClick);

  // 2D label placement loop
  const v = new THREE.Vector3();
  function updateLabels() {
    if (!root.isConnected) return;
    const rect = canvas.getBoundingClientRect();
    pins.forEach(p => {
      v.copy(p.point).project(opts.camera);
      const x = (v.x *  0.5 + 0.5) * rect.width;
      const y = (v.y * -0.5 + 0.5) * rect.height;
      const inFront = v.z < 1;
      p.label.style.display = inFront ? 'block' : 'none';
      p.label.style.left = `${x}px`;
      p.label.style.top  = `${y}px`;
    });
  }
  let raf = requestAnimationFrame(loop);
  function loop() { updateLabels(); raf = requestAnimationFrame(loop); }

  return {
    api: {
      enable()  { active = true;  canvas.style.cursor = 'crosshair'; emit('change', { active }); },
      disable() { active = false; canvas.style.cursor = ''; emit('change', { active }); },
      toggle()  { active ? this.disable() : this.enable(); return active; },
      isActive() { return active; },
      add, remove, clear,
      list() { return pins.map(p => ({ id: p.id, x: p.point.x, y: p.point.y, z: p.point.z, text: p.text })); },
      count() { return pins.length; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('click', onClick);
      pins.forEach(p => {
        opts.scene.remove(p.marker);
        p.marker.geometry.dispose(); p.marker.material.dispose();
      });
      pins.length = 0;
      overlay.remove();
    },
  };
}
