/**
 * @file widgets/bom-csv.js
 * @description Generate a Bill-of-Materials CSV from the scene's meshes.
 *   Reads name, dimensions, material colour, and optional userData.weight.
 *   Triggers a browser download.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';

/**
 * @typedef {Object} BomCsvOpts
 * @property {THREE.Object3D} target  root group to walk for parts
 * @property {Object}        [meter]  token meter (optional)
 * @property {string}        [app]
 *
 * @typedef {Object} BomRow
 * @property {number} idx
 * @property {string} name
 * @property {string} type
 * @property {number} width
 * @property {number} height
 * @property {number} depth
 * @property {string} color
 * @property {number} [weight]
 */

export async function init(opts) {
  const target = opts.target;
  if (!target) throw new Error('bom-csv: opts.target required');

  const listeners = { change: [], export: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  /**
   * @returns {BomRow[]}
   */
  function collect() {
    /** @type {BomRow[]} */
    const rows = [];
    let idx = 0;
    target.traverse(obj => {
      if (!obj.isMesh) return;
      idx++;
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const colorHex = obj.material?.color?.getHexString?.() || '888888';
      rows.push({
        idx,
        name:   obj.name || `mesh_${idx}`,
        type:   obj.geometry?.type || 'unknown',
        width:  +size.x.toFixed(3),
        height: +size.y.toFixed(3),
        depth:  +size.z.toFixed(3),
        color:  '#' + colorHex,
        weight: obj.userData?.weight,
      });
    });
    return rows;
  }

  /**
   * @param {BomRow[]} rows
   * @returns {string}
   */
  function toCsv(rows) {
    const headers = ['idx', 'name', 'type', 'width', 'height', 'depth', 'color', 'weight'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const cells = headers.map(h => {
        const v = r[h];
        if (v === undefined || v === null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(','));
    }
    return lines.join('\n');
  }

  return {
    api: {
      /** @returns {BomRow[]} */
      collect,
      /** @returns {string} */
      toCsv() {
        const rows = collect();
        const csv  = toCsv(rows);
        emit('change', { rowCount: rows.length });
        return csv;
      },
      /** @returns {Promise<{rows: number, filename: string}>} */
      async export(filename = 'cyclecad-bom.csv') {
        if (opts.meter) {
          try { await opts.meter.charge({ widget: 'bom-csv', method: 'export', cost: 50, actor: opts.app }); } catch {}
        }
        const rows = collect();
        const csv  = toCsv(rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        emit('export', { filename, rows: rows.length });
        return { rows: rows.length, filename };
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { /* no DOM, nothing to clean */ },
  };
}
