/**
 * @file widgets/stl-export.js
 * @description Export a Three.js scene / object to STL — ASCII + binary.
 * @author Sachin Kumar
 * @license MIT
 */

import { STLExporter } from 'three/addons/exporters/STLExporter.js';

/**
 * @typedef {Object} StlExportOpts
 * @property {THREE.Object3D} target
 */

export async function init(opts) {
  const target = opts.target;
  if (!target) throw new Error('stl-export: opts.target required');

  const exporter = new STLExporter();

  const listeners = { change: [], export: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      /**
       * @param {{ binary?: boolean }} [opts2]
       * @returns {string|DataView}
       */
      generate(opts2 = {}) {
        return exporter.parse(target, { binary: !!opts2.binary });
      },
      /**
       * @param {string} filename
       * @param {{ binary?: boolean }} [opts2]
       * @returns {Promise<{ filename: string, bytes: number }>}
       */
      async download(filename = 'cyclecad-export.stl', opts2 = {}) {
        const data = exporter.parse(target, { binary: !!opts2.binary });
        const blob = opts2.binary
          ? new Blob([data], { type: 'application/octet-stream' })
          : new Blob([data], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        emit('export', { filename, bytes: blob.size, binary: !!opts2.binary });
        return { filename, bytes: blob.size };
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { /* nothing */ },
  };
}
