/**
 * @file widgets/hero-shot.js
 * @description Capture N angles of the scene as PNGs for marketing.
 *   Costs 50 $CYCLE per render set (paid widget).
 *
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

const ANGLES = [
  { name: 'iso',   pos: [1, 0.8, 1] },
  { name: 'front', pos: [0, 0, 1] },
  { name: 'top',   pos: [0, 1, 0.001] },
  { name: 'side',  pos: [1, 0, 0] },
];

export async function init(opts) {
  if (!opts.scene)    throw new Error('hero-shot: opts.scene required');
  if (!opts.camera)   throw new Error('hero-shot: opts.camera required');
  if (!opts.renderer) throw new Error('hero-shot: opts.renderer required');

  const target = opts.target || opts.scene;

  const listeners = { change: [], render: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  /**
   * @returns {Promise<{angle:string, url:string}[]>}
   */
  async function render(angles = ANGLES) {
    if (opts.meter) {
      try { await opts.meter.charge({ widget: 'hero-shot', method: 'render', cost: 50, actor: opts.app }); } catch {}
    }

    const cam = opts.camera;
    const origin = cam.position.clone();

    // bbox for fit
    const box = new THREE.Box3().setFromObject(target);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = cam.fov * Math.PI / 180;
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.6;

    const out = [];
    for (const a of angles) {
      const dir = new THREE.Vector3(...a.pos).normalize();
      cam.position.copy(center).addScaledVector(dir, dist);
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      opts.renderer.render(opts.scene, cam);
      const url = opts.renderer.domElement.toDataURL('image/png', 0.92);
      out.push({ angle: a.name, url });
      emit('render', { angle: a.name, url });
      // yield to the browser between angles
      await new Promise(r => setTimeout(r, 30));
    }

    // restore
    cam.position.copy(origin);
    cam.updateProjectionMatrix();
    return out;
  }

  return {
    api: {
      render,
      angles() { return ANGLES.map(a => a.name); },
      async download(prefix = 'cyclecad-hero') {
        const set = await render();
        for (const { angle, url } of set) {
          const blob = dataUrlToBlob(url);
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${prefix}-${angle}.png`;
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        }
        return set.length;
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { /* nothing */ },
  };
}

function dataUrlToBlob(url) {
  const [head, body] = url.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'image/png';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
