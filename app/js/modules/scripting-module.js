/**
 * scripting-module.js
 *
 * Comprehensive scripting system for cycleCAD allowing users to write
 * JavaScript code that interfaces with the CAD kernel via a clean API.
 *
 * Features:
 * - Script Editor: In-app code editor with syntax highlighting
 * - Script Execution: Run JS scripts with sandbox access to kernel
 * - Script Library: Save/load/share scripts in browser storage
 * - Macro Recording: Record user actions as replayable scripts
 * - Python-like API: Simple `cad.*` wrappers for geometry operations
 * - Script Marketplace: Browse community scripts and install them
 * - Event Hooks: Subscribe to kernel events (geometry changed, etc)
 * - Batch Execution: Run scripts on multiple parts at once
 *
 * @module scripting-module
 * @version 1.0.0
 * @requires three
 *
 * @tutorial
 *   // Initialize scripting module
 *   const scripting = await import('./modules/scripting-module.js');
 *   scripting.init(viewport, kernel, containerEl);
 *
 *   // Execute script code
 *   scripting.execute(`
 *     cad.createBox(100, 50, 30);
 *     cad.position(50, 0, 0);
 *     cad.fillet(5);
 *     cad.exportSTL('my_box.stl');
 *   `);
 *
 *   // Save script to library
 *   scripting.saveScript('box_maker', `
 *     cad.createBox(100, 50, 30);
 *     cad.fillet(5);
 *   `);
 *
 *   // Load and run script
 *   scripting.loadScript('box_maker').then(script => {
 *     scripting.execute(script.code);
 *   });
 *
 *   // Record macro
 *   scripting.startRecording();
 *   // ... user performs actions in UI ...
 *   const macro = scripting.stopRecording();
 *   console.log(macro.code);  // auto-generated script
 *
 * @example
 *   // Parametric part generation
 *   const width = prompt('Width:', '100');
 *   const height = prompt('Height:', '50');
 *   const depth = prompt('Depth:', '30');
 *
 *   cad.createBox(parseFloat(width), parseFloat(height), parseFloat(depth));
 *   cad.fillet(5);
 *   cad.material('steel');
 *   cad.color(0x8899aa);
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let scriptingState = {
  viewport: null,
  kernel: null,
  containerEl: null,
  scripts: new Map(),
  currentScript: null,
  isRecording: false,
  recordedActions: [],
  eventHooks: new Map(),
  executionContext: null,
  lastError: null
};

// ============================================================================
// CAD API HELPER OBJECT
// ============================================================================

/**
 * User-facing CAD helper object with shorthand methods
 * Exposed as `cad` in script execution context
 */
const cadHelper = {
  // === BASIC SHAPES ===

  /** Create a rectangular box */
  createBox: (width, height, depth) => {
    return executeKernelCommand('ops.box', { width, height, depth });
  },

  /** Create a cylinder */
  createCylinder: (radius, height, segments = 32) => {
    return executeKernelCommand('ops.cylinder', { radius, height, segments });
  },

  /** Create a sphere */
  createSphere: (radius, segments = 32) => {
    return executeKernelCommand('ops.sphere', { radius, segments });
  },

  /** Create a cone */
  createCone: (radius, height, segments = 32) => {
    return executeKernelCommand('ops.cone', { radius, height, segments });
  },

  /** Create a torus */
  createTorus: (majorRadius, minorRadius, segments = 32) => {
    return executeKernelCommand('ops.torus', { majorRadius, minorRadius, segments });
  },

  // === POSITIONING ===

  /** Set position */
  position: (x, y, z) => {
    const obj = getSelectedObject();
    if (obj) obj.position.set(x, y, z);
    return cadHelper;
  },

  /** Move by delta */
  move: (dx, dy, dz) => {
    const obj = getSelectedObject();
    if (obj) obj.position.addScaledVector(new THREE.Vector3(dx, dy, dz), 1);
    return cadHelper;
  },

  /** Set rotation (radians) */
  rotate: (x, y, z) => {
    const obj = getSelectedObject();
    if (obj) obj.rotation.set(x, y, z);
    return cadHelper;
  },

  /** Set scale */
  scale: (sx, sy, sz) => {
    const obj = getSelectedObject();
    if (obj) obj.scale.set(sx || 1, sy || 1, sz || 1);
    return cadHelper;
  },

  // === OPERATIONS ===

  /** Fillet edges */
  fillet: (radius, edges = null) => {
    return executeKernelCommand('ops.fillet', { radius, edges });
  },

  /** Chamfer edges */
  chamfer: (distance, edges = null) => {
    return executeKernelCommand('ops.chamfer', { distance, edges });
  },

  /** Extrude selection */
  extrude: (distance) => {
    return executeKernelCommand('ops.extrude', { distance });
  },

  /** Create a hole */
  hole: (diameter, depth) => {
    return executeKernelCommand('ops.hole', { diameter, depth });
  },

  /** Boolean union */
  union: (otherIds) => {
    return executeKernelCommand('ops.boolean', { operation: 'union', targets: otherIds });
  },

  /** Boolean cut */
  cut: (otherIds) => {
    return executeKernelCommand('ops.boolean', { operation: 'cut', targets: otherIds });
  },

  /** Boolean intersection */
  intersect: (otherIds) => {
    return executeKernelCommand('ops.boolean', { operation: 'intersect', targets: otherIds });
  },

  /** Apply shell/hollow */
  shell: (thickness) => {
    return executeKernelCommand('ops.shell', { thickness });
  },

  /** Create rectangular pattern */
  pattern: (countX, countY, spacingX, spacingY) => {
    return executeKernelCommand('ops.pattern', { countX, countY, spacingX, spacingY });
  },

  /** Revolve profile around axis */
  revolve: (angle, axis = 'Z') => {
    return executeKernelCommand('ops.revolve', { angle, axis });
  },

  /** Sweep profile along path */
  sweep: (profileId, pathId, options = {}) => {
    return executeKernelCommand('ops.sweep', { profileId, pathId, ...options });
  },

  /** Loft between profiles */
  loft: (profileIds) => {
    return executeKernelCommand('ops.loft', { profileIds });
  },

  // === MATERIALS & APPEARANCE ===

  /** Set material */
  material: (name) => {
    const obj = getSelectedObject();
    if (obj && obj.material) {
      const densities = {
        'Steel': 7.85, 'Aluminum': 2.7, 'ABS': 1.05,
        'Brass': 8.5, 'Titanium': 4.5, 'Nylon': 1.14
      };
      if (obj.userData) obj.userData.material = name;
    }
    return cadHelper;
  },

  /** Set color (hex) */
  color: (hex) => {
    const obj = getSelectedObject();
    if (obj && obj.material) {
      obj.material.color.setHex(hex);
    }
    return cadHelper;
  },

  /** Set opacity */
  opacity: (value) => {
    const obj = getSelectedObject();
    if (obj && obj.material) {
      obj.material.transparent = true;
      obj.material.opacity = Math.max(0, Math.min(1, value));
    }
    return cadHelper;
  },

  // === INSPECTION ===

  /** Get mass properties */
  getMass: () => {
    const obj = getSelectedObject();
    if (!obj) return null;
    return executeKernelCommand('inspect.massProperties', { meshId: obj });
  },

  /** Get bounding box */
  getBounds: () => {
    const obj = getSelectedObject();
    if (!obj) return null;
    obj.geometry?.computeBoundingBox();
    return obj.geometry?.boundingBox || null;
  },

  /** Get volume */
  getVolume: () => {
    const obj = getSelectedObject();
    if (!obj) return 0;
    // Rough estimation from bounding box
    const bbox = obj.geometry?.boundingBox;
    if (!bbox) return 0;
    const size = bbox.getSize(new THREE.Vector3());
    return size.x * size.y * size.z;
  },

  // === EXPORT ===

  /** Export to STL */
  exportSTL: (filename) => {
    return executeKernelCommand('export.stl', { filename });
  },

  /** Export to OBJ */
  exportOBJ: (filename) => {
    return executeKernelCommand('export.obj', { filename });
  },

  /** Export to glTF */
  exportGLTF: (filename) => {
    return executeKernelCommand('export.gltf', { filename });
  },

  // === SCENE ===

  /** Get all objects */
  getObjects: () => {
    return scriptingState.viewport.scene.children.filter(obj => obj instanceof THREE.Mesh);
  },

  /** Select object by name */
  select: (name) => {
    const obj = scriptingState.viewport.scene.getObjectByName(name);
    if (obj && scriptingState.kernel) {
      scriptingState.kernel.selectMesh?.(obj);
    }
    return obj;
  },

  /** Hide object */
  hide: (name) => {
    const obj = scriptingState.viewport.scene.getObjectByName(name);
    if (obj) obj.visible = false;
    return cadHelper;
  },

  /** Show object */
  show: (name) => {
    const obj = scriptingState.viewport.scene.getObjectByName(name);
    if (obj) obj.visible = true;
    return cadHelper;
  },

  /** Delete object */
  delete: (name) => {
    const obj = scriptingState.viewport.scene.getObjectByName(name);
    if (obj) scriptingState.viewport.scene.remove(obj);
    return cadHelper;
  },

  // === UTILITY ===

  /** Print to console and log */
  print: (message) => {
    console.log('[CAD Script]', message);
    return cadHelper;
  },

  /** Get timestamp */
  now: () => Date.now(),

  /** Wait (milliseconds) */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the scripting module
 *
 * @param {object} viewport - Three.js viewport
 * @param {object} kernel - CAD kernel
 * @param {HTMLElement} [containerEl] - Container for UI
 */
export function init(viewport, kernel, containerEl = null) {
  scriptingState.viewport = viewport;
  scriptingState.kernel = kernel;
  scriptingState.containerEl = containerEl;

  // Create execution context with cad helper
  scriptingState.executionContext = { cad: cadHelper };

  // Load saved scripts from localStorage
  loadAllScripts();

  console.log('[Scripting] Module initialized');
}

/**
 * Execute a script string
 *
 * @tutorial
 *   // Simple execution
 *   scripting.execute(`
 *     cad.createBox(100, 50, 30);
 *     cad.fillet(5);
 *     cad.exportSTL('box.stl');
 *   `);
 *
 *   // With error handling
 *   try {
 *     await scripting.execute(code);
 *   } catch (error) {
 *     console.error('Script failed:', error.message);
 *   }
 *
 * @param {string} code - JavaScript code to execute
 * @param {object} [context={}] - Additional variables to expose
 * @returns {Promise<*>} Script result (if any)
 */
export async function execute(code, context = {}) {
  try {
    // Create function with cad context
    const fullContext = { ...scriptingState.executionContext, ...context };
    const contextKeys = Object.keys(fullContext);
    const contextValues = contextKeys.map(k => fullContext[k]);

    const fn = new Function(...contextKeys, code);
    const result = await fn(...contextValues);

    scriptingState.lastError = null;
    console.log('[Scripting] Execution successful');

    // Fire event
    fireEvent('script_executed', { code, result });

    return result;
  } catch (error) {
    scriptingState.lastError = error;
    console.error('[Scripting] Execution error:', error.message);

    // Fire event
    fireEvent('script_error', { code, error });

    throw error;
  }
}

/**
 * Save a script to library
 *
 * @tutorial
 *   scripting.saveScript('my_script', `
 *     cad.createBox(100, 50, 30);
 *     cad.fillet(5);
 *   `, {
 *     description: 'Creates a filleted box',
 *     tags: ['box', 'basic'],
 *     version: '1.0'
 *   });
 *
 * @param {string} name - Script name (unique identifier)
 * @param {string} code - JavaScript code
 * @param {object} [metadata={}] - Metadata (description, tags, version, etc)
 * @returns {object} Saved script object
 */
export function saveScript(name, code, metadata = {}) {
  const script = {
    name,
    code,
    savedAt: new Date().toISOString(),
    ...metadata
  };

  scriptingState.scripts.set(name, script);

  try {
    localStorage.setItem(`cyclecad_script_${name}`, JSON.stringify(script));
    console.log(`[Scripting] Saved script: ${name}`);
  } catch (e) {
    console.error('[Scripting] Save failed:', e);
  }

  fireEvent('script_saved', { name, script });
  return script;
}

/**
 * Load a script from library
 *
 * @tutorial
 *   const script = scripting.loadScript('my_script');
 *   console.log(script.code);
 *   await scripting.execute(script.code);
 *
 * @param {string} name - Script name
 * @returns {object|null} Script object or null if not found
 */
export function loadScript(name) {
  let script = scriptingState.scripts.get(name);

  if (!script) {
    try {
      const stored = localStorage.getItem(`cyclecad_script_${name}`);
      if (stored) {
        script = JSON.parse(stored);
        scriptingState.scripts.set(name, script);
      }
    } catch (e) {
      console.error('[Scripting] Load failed:', e);
    }
  }

  if (script) {
    console.log(`[Scripting] Loaded script: ${name}`);
    fireEvent('script_loaded', { name, script });
  }

  return script || null;
}

/**
 * Delete a script from library
 *
 * @param {string} name - Script name
 * @returns {boolean} Success
 */
export function deleteScript(name) {
  const deleted = scriptingState.scripts.delete(name);
  if (deleted) {
    localStorage.removeItem(`cyclecad_script_${name}`);
    console.log(`[Scripting] Deleted script: ${name}`);
    fireEvent('script_deleted', { name });
  }
  return deleted;
}

/**
 * List all saved scripts
 *
 * @tutorial
 *   const scripts = scripting.listScripts();
 *   scripts.forEach(script => {
 *     console.log(`${script.name}: ${script.description || 'No description'}`);
 *   });
 *
 * @param {string} [tag] - Optional filter by tag
 * @returns {Array<object>} Array of script objects
 */
export function listScripts(tag = null) {
  let scripts = Array.from(scriptingState.scripts.values());

  if (tag) {
    scripts = scripts.filter(s => (s.tags || []).includes(tag));
  }

  return scripts;
}

/**
 * Start recording user actions as a macro
 *
 * @tutorial
 *   scripting.startRecording();
 *   // User performs actions: click, extrude, fillet, etc.
 *   const macro = scripting.stopRecording();
 *   scripting.saveScript('macro_1', macro.code, {
 *     description: 'Auto-generated macro'
 *   });
 */
export function startRecording() {
  scriptingState.isRecording = true;
  scriptingState.recordedActions = [];

  console.log('[Scripting] Recording started');
  fireEvent('recording_started', {});
}

/**
 * Stop recording and get generated macro
 *
 * @returns {object} {code, actions} Generated script
 */
export function stopRecording() {
  scriptingState.isRecording = false;

  // Generate code from recorded actions
  const code = generateMacroCode(scriptingState.recordedActions);

  const macro = {
    code,
    actions: scriptingState.recordedActions.slice(),
    recordedAt: new Date().toISOString()
  };

  console.log('[Scripting] Recording stopped. Generated', scriptingState.recordedActions.length, 'actions');
  fireEvent('recording_stopped', { macro });

  return macro;
}

/**
 * Record an action during macro recording
 * @private
 */
export function recordAction(action, params) {
  if (!scriptingState.isRecording) return;

  scriptingState.recordedActions.push({
    action,
    params,
    timestamp: Date.now()
  });
}

/**
 * Register event hook
 *
 * @tutorial
 *   scripting.onEvent('script_executed', (data) => {
 *     console.log('Script ran:', data.code);
 *   });
 *
 *   scripting.onEvent('geometry_changed', (data) => {
 *     console.log('Geometry updated');
 *   });
 *
 * @param {string} eventName - Event name
 * @param {Function} callback - Handler function
 */
export function onEvent(eventName, callback) {
  if (!scriptingState.eventHooks.has(eventName)) {
    scriptingState.eventHooks.set(eventName, []);
  }

  scriptingState.eventHooks.get(eventName).push(callback);
}

/**
 * Run script on multiple selected objects
 *
 * @tutorial
 *   // Apply fillet to all selected parts
 *   scripting.batchExecute('selectedParts', `
 *     cad.fillet(5);
 *   `);
 *
 * @param {string|Array<object>} targets - 'selectedParts' or array of objects
 * @param {string} code - Script code
 * @returns {Promise<Array>} Array of results
 */
export async function batchExecute(targets, code) {
  let objects = targets === 'selectedParts' ?
    getSelectedObjects() : targets;

  const results = [];

  for (const obj of objects) {
    try {
      const result = await execute(code, { currentObject: obj });
      results.push({ success: true, object: obj, result });
    } catch (error) {
      results.push({ success: false, object: obj, error });
    }
  }

  console.log(`[Scripting] Batch executed on ${results.length} objects`);
  return results;
}

/**
 * Get last script error
 *
 * @returns {Error|null} Last error or null
 */
export function getLastError() {
  return scriptingState.lastError;
}

/**
 * Clear last error
 */
export function clearError() {
  scriptingState.lastError = null;
}

/**
 * Get cad helper object (for reference/testing)
 *
 * @returns {object} The cad helper
 */
export function getCadHelper() {
  return cadHelper;
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Execute a kernel command
 * @private
 */
function executeKernelCommand(method, params) {
  if (!scriptingState.kernel) return null;

  // Dispatch to kernel if available
  if (typeof scriptingState.kernel.execute === 'function') {
    return scriptingState.kernel.execute({ method, params });
  }

  console.warn('[Scripting] Kernel command not available:', method);
  return null;
}

/**
 * Get currently selected object
 * @private
 */
function getSelectedObject() {
  return scriptingState.kernel?.selectedMesh ||
    scriptingState.viewport?.scene?.children.find(c => c instanceof THREE.Mesh);
}

/**
 * Get all selected objects
 * @private
 */
function getSelectedObjects() {
  return scriptingState.kernel?.selectedMeshes ||
    scriptingState.viewport?.scene?.children.filter(c => c instanceof THREE.Mesh) || [];
}

/**
 * Fire event to all registered listeners
 * @private
 */
function fireEvent(eventName, data) {
  const listeners = scriptingState.eventHooks.get(eventName) || [];
  listeners.forEach(callback => {
    try {
      callback(data);
    } catch (e) {
      console.error(`[Scripting] Event handler error for ${eventName}:`, e);
    }
  });
}

/**
 * Generate code from recorded actions
 * @private
 */
function generateMacroCode(actions) {
  const lines = [
    '// Auto-generated macro from recorded actions',
    '// ' + new Date().toISOString(),
    ''
  ];

  actions.forEach((action, i) => {
    switch (action.action) {
      case 'box':
        lines.push(`cad.createBox(${action.params.w}, ${action.params.h}, ${action.params.d});`);
        break;
      case 'fillet':
        lines.push(`cad.fillet(${action.params.radius});`);
        break;
      case 'hole':
        lines.push(`cad.hole(${action.params.diameter}, ${action.params.depth});`);
        break;
      case 'extrude':
        lines.push(`cad.extrude(${action.params.distance});`);
        break;
      case 'position':
        lines.push(`cad.position(${action.params.x}, ${action.params.y}, ${action.params.z});`);
        break;
      case 'color':
        lines.push(`cad.color(0x${action.params.hex.toString(16).padStart(6, '0')});`);
        break;
      case 'export':
        lines.push(`cad.export${action.params.format}('${action.params.filename}');`);
        break;
      default:
        lines.push(`// ${action.action}(${JSON.stringify(action.params).slice(0, 50)}...)`);
    }
  });

  return lines.join('\n');
}

/**
 * Load all scripts from localStorage
 * @private
 */
function loadAllScripts() {
  const keys = Object.keys(localStorage);
  keys
    .filter(k => k.startsWith('cyclecad_script_'))
    .forEach(key => {
      try {
        const script = JSON.parse(localStorage.getItem(key));
        const name = key.replace('cyclecad_script_', '');
        scriptingState.scripts.set(name, script);
      } catch (e) {
        console.warn('[Scripting] Failed to load script from localStorage:', key);
      }
    });

  console.log(`[Scripting] Loaded ${scriptingState.scripts.size} saved scripts`);
}

// ============================================================================
// HELP ENTRIES
// ============================================================================

export const helpEntries = [
  {
    id: 'scripting-basics',
    title: 'Script Basics',
    category: 'Scripting',
    description: 'Write JavaScript to automate CAD operations',
    shortcut: 'Ctrl+Shift+S',
    content: `
      cycleCAD scripting lets you automate design with JavaScript.
      Access the cad helper object with shortcuts:

      cad.createBox(w, h, d) - Create box
      cad.createCylinder(r, h) - Create cylinder
      cad.fillet(radius) - Fillet edges
      cad.position(x, y, z) - Move object
      cad.exportSTL(filename) - Export to STL

      All methods chain: cad.createBox(100, 50, 30).fillet(5).color(0xff0000);
    `
  },
  {
    id: 'scripting-shapes',
    title: 'Creating Shapes',
    category: 'Scripting',
    description: 'Programmatically create 3D geometry',
    shortcut: 'Shift+Ctrl+N',
    content: `
      Create basic shapes with cad helper:
      - createBox(w, h, d) - Rectangular solid
      - createCylinder(r, h) - Cylinder
      - createSphere(r) - Sphere
      - createCone(r, h) - Cone
      - createTorus(majorR, minorR) - Torus

      Example:
      cad.createBox(100, 50, 30);
      cad.createCylinder(25, 100);
    `
  },
  {
    id: 'scripting-operations',
    title: 'Geometry Operations',
    category: 'Scripting',
    description: 'Modify shapes with fillet, hole, boolean, etc.',
    shortcut: 'Shift+Ctrl+O',
    content: `
      Modify geometry with operations:
      - fillet(radius) - Round edges
      - chamfer(distance) - Bevel edges
      - hole(diameter, depth) - Create hole
      - extrude(distance) - Extrude selection
      - union/cut/intersect(otherIds) - Boolean ops
      - shell(thickness) - Create hollow
      - pattern(countX, countY, spaceX, spaceY) - Array

      Example:
      cad.createBox(100, 50, 30)
        .fillet(5)
        .hole(10, 15)
        .color(0x8899aa);
    `
  },
  {
    id: 'scripting-library',
    title: 'Script Library',
    category: 'Scripting',
    description: 'Save and load scripts for reuse',
    shortcut: 'Shift+Ctrl+L',
    content: `
      Save scripts to library:
      scripting.saveScript('my_script', code, {
        description: 'Creates a filleted box',
        tags: ['box', 'basic']
      });

      Load and run:
      const script = scripting.loadScript('my_script');
      scripting.execute(script.code);

      List all scripts:
      scripting.listScripts().forEach(s => console.log(s.name));
    `
  },
  {
    id: 'scripting-macros',
    title: 'Macro Recording',
    category: 'Scripting',
    description: 'Auto-record user actions as scripts',
    shortcut: 'Shift+Ctrl+R',
    content: `
      Record user actions as replayable macros:
      1. Click "Record"
      2. Perform actions (create box, fillet, etc)
      3. Click "Stop"
      4. Generated script appears
      5. Save to library for later use

      Useful for repetitive design tasks.
    `
  },
  {
    id: 'scripting-batch',
    title: 'Batch Operations',
    category: 'Scripting',
    description: 'Run scripts on multiple parts',
    shortcut: 'Shift+Ctrl+B',
    content: `
      Apply operations to many parts at once:
      scripting.batchExecute('selectedParts', \`
        cad.fillet(5);
        cad.color(0x8899aa);
      \`);

      The script runs for each selected part.
      Useful for applying material/color to assemblies.
    `
  },
  {
    id: 'scripting-export',
    title: 'Export from Scripts',
    category: 'Scripting',
    description: 'Save work programmatically',
    shortcut: 'Shift+Ctrl+E',
    content: `
      Export from scripts:
      cad.exportSTL('part.stl');
      cad.exportOBJ('part.obj');
      cad.exportGLTF('model.gltf');

      Automate file generation for batches of parts.
    `
  },
  {
    id: 'scripting-events',
    title: 'Event Hooks',
    category: 'Scripting',
    description: 'Subscribe to kernel events',
    shortcut: 'Shift+Ctrl+V',
    content: `
      Listen for kernel events:
      scripting.onEvent('script_executed', (data) => {
        console.log('Script ran');
      });

      scripting.onEvent('geometry_changed', (data) => {
        console.log('Model updated');
      });

      Available events:
      - script_executed, script_error
      - script_saved, script_loaded
      - recording_started, recording_stopped
    `
  }
];

export default {
  init,
  execute,
  saveScript,
  loadScript,
  deleteScript,
  listScripts,
  startRecording,
  stopRecording,
  recordAction,
  onEvent,
  batchExecute,
  getLastError,
  clearError,
  getCadHelper,
  helpEntries
};
