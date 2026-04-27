/**
 * @file widgets/glb-loader.js
 * @description Drop-zone GLB / glTF loader. Parses .glb / .gltf files
 *   from a URL or a File and attaches the result to the viewport root.
 *
 * @author Sachin Kumar
 * @license MIT
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function init(opts) {
  if (!opts.scene) throw new Error('glb-loader: opts.scene required');
  const target = opts.target || opts.scene;

  const loader = new GLTFLoader();
  const loaded = [];   // groups we've added — for cleanup

  const listeners = { change: [], load: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  /**
   * @param {string} url
   * @returns {Promise<THREE.Group>}
   */
  function loadFromUrl(url) {
    return new Promise((resolve, reject) => {
      loader.load(url,
        gltf => {
          const root = gltf.scene || gltf.scenes?.[0];
          if (!root) return reject(new Error('no scene in gltf'));
          target.add(root);
          loaded.push(root);
          emit('load', { url, root, animations: gltf.animations?.length || 0 });
          resolve(root);
        },
        undefined,
        err => { emit('error', { url, error: err }); reject(err); }
      );
    });
  }

  /**
   * @param {File|Blob|ArrayBuffer} input
   * @returns {Promise<THREE.Group>}
   */
  function loadFromFile(input) {
    return new Promise((resolve, reject) => {
      const onBuf = (buf) => {
        loader.parse(buf, '',
          gltf => {
            const root = gltf.scene || gltf.scenes?.[0];
            if (!root) return reject(new Error('no scene in gltf'));
            target.add(root);
            loaded.push(root);
            emit('load', { root, animations: gltf.animations?.length || 0 });
            resolve(root);
          },
          err => { emit('error', { error: err }); reject(err); }
        );
      };
      if (input instanceof ArrayBuffer) onBuf(input);
      else if (input.arrayBuffer) input.arrayBuffer().then(onBuf, reject);
      else reject(new Error('unsupported input'));
    });
  }

  function unloadAll() {
    loaded.forEach(root => {
      root.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => m.dispose && m.dispose());
        }
      });
      target.remove(root);
    });
    loaded.length = 0;
    emit('change', { kind: 'unload-all' });
  }

  return {
    api: {
      loadFromUrl,
      loadFromFile,
      unloadAll,
      getLoaded() { return [...loaded]; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { unloadAll(); },
  };
}
