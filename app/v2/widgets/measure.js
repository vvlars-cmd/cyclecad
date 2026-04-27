/**
 * @file widgets/measure.js
 * @description Click two points in the viewport to measure distance.
 *   Renders a yellow line + labels the result.
 *
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

export async function init(opts) {
  if (!opts.scene)  throw new Error('measure: opts.scene required');
  if (!opts.camera) throw new Error('measure: opts.camera required');
  if (!opts.mount)  throw new Error('measure: opts.mount required');

  const root = typeof opts.mount === 'string'
    ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('measure: mount not found');

  const canvas = root.querySelector('canvas') || root;
  const target = opts.target || opts.scene;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const points = [];
  let lineMesh = null;
  let active = false;

  // overlay readout
  const readout = document.createElement('div');
  readout.style.cssText = `
    position: absolute; left: 16px; bottom: 16px;
    background: rgba(0,0,0,0.78); color: #fff;
    padding: 8px 12px; border-radius: 4px;
    font: 12px Menlo, monospace; z-index: 30;
    display: none; pointer-events: none;
  `;
  readout.className = 'pt-measure-readout';
  root.appendChild(readout);

  const listeners = { change: [], measure: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  canvas.addEventListener('click', onClick);

  function onClick(ev) {
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width)  *  2 - 1;
    ndc.y = ((ev.clientY - rect.top)  / rect.height) * -2 + 1;
    raycaster.setFromCamera(ndc, opts.camera);
    const hits = raycaster.intersectObject(target, true);
    if (hits.length === 0) return;
    points.push(hits[0].point.clone());
    if (points.length === 2) {
      drawLine();
      const dist = points[0].distanceTo(points[1]);
      readout.style.display = 'block';
      readout.textContent = `distance: ${dist.toFixed(3)} units · click again to reset`;
      emit('measure', { p1: points[0], p2: points[1], distance: dist });
    } else if (points.length > 2) {
      // start over
      reset();
      points.push(hits[0].point.clone());
    }
  }

  function drawLine() {
    if (lineMesh) opts.scene.remove(lineMesh);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd000, linewidth: 2 });
    lineMesh = new THREE.Line(geo, mat);
    lineMesh.name = 'pt-measure-line';
    opts.scene.add(lineMesh);
  }

  function reset() {
    points.length = 0;
    if (lineMesh) {
      opts.scene.remove(lineMesh);
      lineMesh.geometry.dispose();
      lineMesh.material.dispose();
      lineMesh = null;
    }
    readout.style.display = 'none';
    emit('change', { kind: 'reset' });
  }

  return {
    api: {
      enable()  { active = true;  canvas.style.cursor = 'crosshair'; emit('change', { active }); },
      disable() { active = false; canvas.style.cursor = ''; emit('change', { active }); },
      toggle()  { active ? this.disable() : this.enable(); return active; },
      isActive() { return active; },
      reset,
      getResult() {
        if (points.length < 2) return null;
        return { p1: points[0], p2: points[1], distance: points[0].distanceTo(points[1]) };
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      canvas.removeEventListener('click', onClick);
      reset();
      readout.remove();
    },
  };
}
