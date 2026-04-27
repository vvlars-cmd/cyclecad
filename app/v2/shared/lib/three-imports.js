/**
 * @file shared/lib/three-imports.js
 * @description Single source of truth for the THREE.js + addons version
 *   used across the entire suite. Every widget that needs three should
 *   import from here, not from a CDN URL directly.
 *
 *   Why: prevents version drift between widgets (one loads r170, another
 *   r172 with a different API surface, suddenly geometry.computeBoundsTree
 *   doesn't exist on shared meshes). Pinning here means upgrading is one
 *   line in one file.
 *
 *   Used by: every 3D widget. See app shell <script type="importmap"> for
 *   the cdn URL pin — this file just re-exports for convenience.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

// Re-exports — widgets import from this file:
//   import { THREE, TrackballControls } from '../shared/lib/three-imports.js';
import * as THREE                from 'three';
import { TrackballControls }     from 'three/addons/controls/TrackballControls.js';
import { OrbitControls }         from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }            from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter }          from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter }           from 'three/addons/exporters/STLExporter.js';
import { OBJExporter }           from 'three/addons/exporters/OBJExporter.js';
import { TransformControls }     from 'three/addons/controls/TransformControls.js';

export {
  THREE,
  TrackballControls,
  OrbitControls,
  GLTFLoader,
  GLTFExporter,
  STLExporter,
  OBJExporter,
  TransformControls,
};

/**
 * Pinned CDN URLs for the importmap. App shells use these so the kernel +
 * every widget end up on the exact same Three.js build.
 */
export const PINS = Object.freeze({
  THREE_VERSION: '0.170.0',
  THREE_BASE:    'https://cdn.jsdelivr.net/npm/three@0.170.0',
  THREE_MODULE:  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
  THREE_ADDONS:  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/',
});

/**
 * Returns an HTMLScriptElement-string with a valid importmap. App shells
 * inject this into their <head> so every widget that does
 * `import 'three'` resolves to the same pinned URL.
 *
 * @returns {string}
 */
export function importMapScript() {
  return `<script type="importmap">
{ "imports": {
  "three":          "${PINS.THREE_MODULE}",
  "three/addons/":  "${PINS.THREE_ADDONS}"
}}
</script>`;
}
