/**
 * @file widgets/gltf-export.js
 * @description Export Three.js scene / object to glTF 2.0 — JSON + binary.
 * @author Sachin Kumar
 * @license MIT
 */

import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export async function init(opts) {
  const target = opts.target;
  if (!target) throw new Error('gltf-export: opts.target required');

  const exporter = new GLTFExporter();
  const listeners = { change: [], export: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  /**
   * @param {{ binary?: boolean }} [o]
   * @returns {Promise<ArrayBuffer|Object>}
   */
  function generate(o = {}) {
    return new Promise((resolve, reject) => {
      exporter.parse(target,
        (result) => resolve(result),
        (err) => reject(err),
        { binary: !!o.binary }
      );
    });
  }

  return {
    api: {
      generate,
      async download(filename, o = {}) {
        const binary = !!o.binary;
        if (!filename) filename = binary ? 'cyclecad-export.glb' : 'cyclecad-export.gltf';
        const result = await generate({ binary });
        let blob;
        if (binary) {
          blob = new Blob([result], { type: 'model/gltf-binary' });
        } else {
          blob = new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' });
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        emit('export', { filename, bytes: blob.size, binary });
        return { filename, bytes: blob.size };
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { /* nothing */ },
  };
}
