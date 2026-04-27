/**
 * @file widgets/obj-export.js
 * @description Export Three.js scene / object to Wavefront OBJ.
 * @author Sachin Kumar
 * @license MIT
 */

import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';

export async function init(opts) {
  const target = opts.target;
  if (!target) throw new Error('obj-export: opts.target required');

  const exporter = new OBJExporter();
  const listeners = { change: [], export: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      /** @returns {string} */
      generate() { return exporter.parse(target); },
      /** @returns {Promise<{filename: string, bytes: number}>} */
      async download(filename = 'cyclecad-export.obj') {
        const data = exporter.parse(target);
        const blob = new Blob([data], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        emit('export', { filename, bytes: blob.size });
        return { filename, bytes: blob.size };
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { /* nothing */ },
  };
}
