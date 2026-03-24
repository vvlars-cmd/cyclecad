/**
 * agent-api.js — The Agent-First API for cycleCAD
 *
 * This is the core differentiator: cycleCAD is not a GUI app with an API bolted on.
 * The API IS the product. AI agents are the only interface.
 *
 * Any LLM (GPT, Claude, Gemini, Llama, Mistral) can design, validate, and
 * manufacture through this API. Every operation is a JSON command.
 * Every command returns a structured result.
 *
 * Architecture:
 *   Agent sends JSON command → agent-api.js dispatches → cycleCAD modules execute
 *   → structured JSON result returned → agent decides next action
 *
 * Protocol: JSON-RPC 2.0 style
 *   { method: "sketch.rect", params: { width: 50, height: 30 } }
 *   → { ok: true, result: { entityId: "rect_1", ... } }
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// Module references — set during init
// ============================================================================
let _viewport = null;
let _sketch = null;
let _ops = null;
let _advancedOps = null;
let _exportMod = null;
let _appState = null;

// ============================================================================
// Session state
// ============================================================================
let sessionId = null;
let commandLog = [];
let featureIndex = 0;

/**
 * Initialize the Agent API with references to all cycleCAD modules
 */
export function initAgentAPI({ viewport, sketch, operations, advancedOps, exportModule, appState }) {
  _viewport = viewport;
  _sketch = sketch;
  _ops = operations;
  _advancedOps = advancedOps;
  _exportMod = exportModule;
  _appState = appState;
  sessionId = crypto.randomUUID();
  commandLog = [];
  featureIndex = 0;
  console.log(`[Agent API] Initialized. Session: ${sessionId}`);

  // Expose globally for external agent access
  window.cycleCAD = { execute, executeMany, getSchema, getState, getSession };

  return { sessionId };
}

// ============================================================================
// COMMAND DISPATCH
// ============================================================================

/**
 * Execute a single agent command
 * @param {Object} cmd - { method: string, params: object }
 * @returns {Object} - { ok: boolean, result?: any, error?: string }
 */
export function execute(cmd) {
  const start = performance.now();
  try {
    if (!cmd || !cmd.method) {
      return err('Missing "method" field');
    }
    const handler = COMMANDS[cmd.method];
    if (!handler) {
      return err(`Unknown method: "${cmd.method}". Use getSchema() to see available commands.`);
    }
    const result = handler(cmd.params || {});
    const elapsed = Math.round(performance.now() - start);
    const entry = { method: cmd.method, params: cmd.params, elapsed, ok: true };
    commandLog.push(entry);
    return { ok: true, result, elapsed };
  } catch (e) {
    const elapsed = Math.round(performance.now() - start);
    commandLog.push({ method: cmd.method, params: cmd.params, elapsed, ok: false, error: e.message });
    return err(e.message);
  }
}

/**
 * Execute a sequence of commands (pipeline)
 * Stops on first error unless continueOnError is set
 * @param {Array<Object>} cmds - Array of { method, params }
 * @param {Object} opts - { continueOnError: false }
 * @returns {Object} - { ok, results: Array, errors: Array }
 */
export function executeMany(cmds, opts = {}) {
  const results = [];
  const errors = [];
  for (let i = 0; i < cmds.length; i++) {
    const r = execute(cmds[i]);
    results.push(r);
    if (!r.ok) {
      errors.push({ index: i, method: cmds[i].method, error: r.error });
      if (!opts.continueOnError) break;
    }
  }
  return { ok: errors.length === 0, results, errors };
}

function err(msg) { return { ok: false, error: msg }; }
function nextId(prefix) { return `${prefix}_${++featureIndex}`; }

// ============================================================================
// HELPER: get mesh from features
// ============================================================================
function getFeatureMesh(id) {
  if (!_appState) return null;
  const features = _appState.getFeatures ? _appState.getFeatures() : (_appState.features || []);
  const f = features.find(f => f.id === id || f.name === id);
  return f ? f.mesh : null;
}

function getAllFeatures() {
  if (!_appState) return [];
  return _appState.getFeatures ? _appState.getFeatures() : (_appState.features || []);
}

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

const COMMANDS = {

  // ==========================================================================
  // SKETCH — 2D drawing on a plane
  // ==========================================================================

  'sketch.start': ({ plane = 'XY' }) => {
    const cam = _viewport.getCamera();
    const ctrl = _viewport.getControls();
    _sketch.startSketch(plane, cam, ctrl);
    return { plane, status: 'active' };
  },

  'sketch.end': () => {
    const entities = _sketch.getEntities();
    _sketch.endSketch();
    return { entityCount: entities.length, entities: entities.map(summarizeEntity) };
  },

  'sketch.line': ({ x1, y1, x2, y2 }) => {
    requireAll({ x1, y1, x2, y2 });
    const entities = _sketch.getEntities();
    entities.push({ type: 'line', x1, y1, x2, y2, id: nextId('line') });
    return { id: entities[entities.length - 1].id, type: 'line', from: [x1, y1], to: [x2, y2] };
  },

  'sketch.rect': ({ x = 0, y = 0, width, height }) => {
    requireAll({ width, height });
    const entities = _sketch.getEntities();
    const id = nextId('rect');
    // Rectangle = 4 lines
    entities.push({ type: 'line', x1: x, y1: y, x2: x + width, y2: y, id: id + '_t' });
    entities.push({ type: 'line', x1: x + width, y1: y, x2: x + width, y2: y + height, id: id + '_r' });
    entities.push({ type: 'line', x1: x + width, y1: y + height, x2: x, y2: y + height, id: id + '_b' });
    entities.push({ type: 'line', x1: x, y1: y + height, x2: x, y2: y, id: id + '_l' });
    return { id, type: 'rect', origin: [x, y], width, height, edges: 4 };
  },

  'sketch.circle': ({ cx = 0, cy = 0, radius }) => {
    requireAll({ radius });
    const entities = _sketch.getEntities();
    const id = nextId('circle');
    entities.push({ type: 'circle', cx, cy, radius, id });
    return { id, type: 'circle', center: [cx, cy], radius };
  },

  'sketch.arc': ({ cx = 0, cy = 0, radius, startAngle = 0, endAngle = Math.PI }) => {
    requireAll({ radius });
    const entities = _sketch.getEntities();
    const id = nextId('arc');
    entities.push({ type: 'arc', cx, cy, radius, startAngle, endAngle, id });
    return { id, type: 'arc', center: [cx, cy], radius, startAngle, endAngle };
  },

  'sketch.clear': () => {
    _sketch.clearSketch();
    return { cleared: true };
  },

  'sketch.entities': () => {
    return { entities: _sketch.getEntities().map(summarizeEntity) };
  },

  // ==========================================================================
  // OPERATIONS — 3D modeling
  // ==========================================================================

  'ops.extrude': ({ height, symmetric = false, material = 'steel' }) => {
    requireAll({ height });
    const entities = _sketch.getEntities();
    if (entities.length === 0) throw new Error('No sketch entities to extrude. Use sketch.* commands first.');
    const mesh = _ops.extrudeProfile(entities, height, { symmetric, material: _ops.createMaterial(material) });
    const id = nextId('extrude');
    mesh.name = id;
    _viewport.addToScene(mesh);
    addFeature(id, 'extrude', mesh, { height, symmetric, material });
    return { id, type: 'extrude', height, material, bbox: getBBox(mesh) };
  },

  'ops.revolve': ({ axis = 'Y', angle = 360, material = 'steel' }) => {
    const entities = _sketch.getEntities();
    if (entities.length === 0) throw new Error('No sketch entities to revolve.');
    const mesh = _ops.revolveProfile(entities, { type: axis }, { angle: THREE.MathUtils.degToRad(angle), material: _ops.createMaterial(material) });
    const id = nextId('revolve');
    mesh.name = id;
    _viewport.addToScene(mesh);
    addFeature(id, 'revolve', mesh, { axis, angle, material });
    return { id, type: 'revolve', axis, angle, material, bbox: getBBox(mesh) };
  },

  'ops.primitive': ({ shape, width, height, depth, radius, segments, material = 'steel' }) => {
    requireAll({ shape });
    const mesh = _ops.createPrimitive(shape, { width, height, depth, radius, segments }, { material: _ops.createMaterial(material) });
    const id = nextId(shape);
    mesh.name = id;
    _viewport.addToScene(mesh);
    addFeature(id, 'primitive', mesh, { shape, width, height, depth, radius, material });
    return { id, type: 'primitive', shape, material, bbox: getBBox(mesh) };
  },

  'ops.fillet': ({ target, radius = 0.1 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const result = _ops.fillet(mesh, 'all', radius);
    return { target, radius, applied: true };
  },

  'ops.chamfer': ({ target, distance = 0.1 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    _ops.chamfer(mesh, 'all', distance);
    return { target, distance, applied: true };
  },

  'ops.boolean': ({ operation, targetA, targetB }) => {
    requireAll({ operation, targetA, targetB });
    const meshA = getFeatureMesh(targetA);
    const meshB = getFeatureMesh(targetB);
    if (!meshA) throw new Error(`Feature "${targetA}" not found`);
    if (!meshB) throw new Error(`Feature "${targetB}" not found`);
    let result;
    if (operation === 'union') result = _ops.booleanUnion(meshA, meshB);
    else if (operation === 'cut') result = _ops.booleanCut(meshA, meshB);
    else if (operation === 'intersect') result = _ops.booleanIntersect(meshA, meshB);
    else throw new Error(`Unknown boolean op: "${operation}". Use union|cut|intersect.`);
    const id = nextId('bool');
    result.name = id;
    addFeature(id, 'boolean', result, { operation, targetA, targetB });
    return { id, operation, bbox: getBBox(result) };
  },

  'ops.shell': ({ target, thickness = 0.1 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    _ops.createShell(mesh, thickness);
    return { target, thickness, applied: true };
  },

  'ops.pattern': ({ target, type = 'rect', count = 3, spacing = 1 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const clones = _ops.createPattern(mesh, type, count, spacing);
    return { target, type, count, spacing, created: clones.length };
  },

  'ops.material': ({ target, material }) => {
    requireAll({ target, material });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    mesh.material = _ops.createMaterial(material);
    return { target, material, applied: true };
  },

  // ==========================================================================
  // ADVANCED OPS — sweep, loft, sheet metal, spring, thread
  // ==========================================================================

  'ops.sweep': ({ profile, path, twist = 0, scale = 1 }) => {
    requireAll({ profile, path });
    const mesh = _advancedOps.createSweep(profile, path, { twist, scale });
    const id = nextId('sweep');
    mesh.name = id;
    _viewport.addToScene(mesh);
    addFeature(id, 'sweep', mesh, { profile, path, twist, scale });
    return { id, type: 'sweep', bbox: getBBox(mesh) };
  },

  'ops.loft': ({ profiles }) => {
    requireAll({ profiles });
    const mesh = _advancedOps.createLoft(profiles);
    const id = nextId('loft');
    mesh.name = id;
    _viewport.addToScene(mesh);
    addFeature(id, 'loft', mesh, { profiles });
    return { id, type: 'loft', bbox: getBBox(mesh) };
  },

  'ops.spring': ({ radius = 5, wireRadius = 0.5, height = 20, turns = 5, material = 'steel' }) => {
    const mesh = _advancedOps.createSpring(radius, wireRadius, height, turns, { material: _ops.createMaterial(material) });
    const id = nextId('spring');
    mesh.name = id;
    _viewport.addToScene(mesh);
    addFeature(id, 'spring', mesh, { radius, wireRadius, height, turns, material });
    return { id, type: 'spring', bbox: getBBox(mesh) };
  },

  'ops.thread': ({ outerRadius = 5, innerRadius = 4.2, pitch = 1, length = 10, material = 'steel' }) => {
    const mesh = _advancedOps.createThread(outerRadius, innerRadius, pitch, length, { material: _ops.createMaterial(material) });
    const id = nextId('thread');
    mesh.name = id;
    _viewport.addToScene(mesh);
    addFeature(id, 'thread', mesh, { outerRadius, innerRadius, pitch, length, material });
    return { id, type: 'thread', bbox: getBBox(mesh) };
  },

  'ops.bend': ({ target, angle = 90, radius = 2 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    _advancedOps.createBend(mesh, null, THREE.MathUtils.degToRad(angle), radius);
    return { target, angle, radius, applied: true };
  },

  // ==========================================================================
  // TRANSFORM — move, rotate, scale
  // ==========================================================================

  'transform.move': ({ target, x = 0, y = 0, z = 0 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    mesh.position.set(
      mesh.position.x + x,
      mesh.position.y + y,
      mesh.position.z + z
    );
    return { target, position: [mesh.position.x, mesh.position.y, mesh.position.z] };
  },

  'transform.rotate': ({ target, x = 0, y = 0, z = 0 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    mesh.rotation.x += THREE.MathUtils.degToRad(x);
    mesh.rotation.y += THREE.MathUtils.degToRad(y);
    mesh.rotation.z += THREE.MathUtils.degToRad(z);
    return { target, rotation: [
      THREE.MathUtils.radToDeg(mesh.rotation.x),
      THREE.MathUtils.radToDeg(mesh.rotation.y),
      THREE.MathUtils.radToDeg(mesh.rotation.z)
    ] };
  },

  'transform.scale': ({ target, x = 1, y = 1, z = 1 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    mesh.scale.set(mesh.scale.x * x, mesh.scale.y * y, mesh.scale.z * z);
    return { target, scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z] };
  },

  // ==========================================================================
  // VIEWPORT — camera, view, display
  // ==========================================================================

  'view.set': ({ view = 'isometric' }) => {
    _viewport.setView(view);
    return { view };
  },

  'view.fit': ({ target }) => {
    if (target) {
      const mesh = getFeatureMesh(target);
      if (mesh) _viewport.fitToObject(mesh);
    } else {
      _viewport.setView('isometric');
    }
    return { fitted: true };
  },

  'view.wireframe': ({ enabled = true }) => {
    _viewport.toggleWireframe(enabled);
    return { wireframe: enabled };
  },

  'view.grid': ({ visible = true }) => {
    _viewport.toggleGrid(visible);
    return { grid: visible };
  },

  // ==========================================================================
  // EXPORT — STL, OBJ, glTF, JSON
  // ==========================================================================

  'export.stl': ({ filename = 'agent-output.stl', binary = true }) => {
    const features = getAllFeatures();
    if (features.length === 0) throw new Error('No features to export');
    if (binary) {
      _exportMod.exportSTLBinary(features, filename);
    } else {
      _exportMod.exportSTL(features, filename);
    }
    return { format: 'stl', binary, filename, featureCount: features.length };
  },

  'export.obj': ({ filename = 'agent-output.obj' }) => {
    const features = getAllFeatures();
    if (features.length === 0) throw new Error('No features to export');
    _exportMod.exportOBJ(features, filename);
    return { format: 'obj', filename, featureCount: features.length };
  },

  'export.gltf': ({ filename = 'agent-output.gltf' }) => {
    const features = getAllFeatures();
    if (features.length === 0) throw new Error('No features to export');
    _exportMod.exportGLTF(features, filename);
    return { format: 'gltf', filename, featureCount: features.length };
  },

  'export.json': ({ filename = 'agent-output.cyclecad.json' }) => {
    const features = getAllFeatures();
    if (features.length === 0) throw new Error('No features to export');
    _exportMod.exportJSON(features, filename);
    return { format: 'json', filename, featureCount: features.length };
  },

  // ==========================================================================
  // QUERY — inspect the model, features, dimensions
  // ==========================================================================

  'query.features': () => {
    const features = getAllFeatures();
    return {
      count: features.length,
      features: features.map(f => ({
        id: f.id,
        type: f.type,
        name: f.name || f.id,
        bbox: f.mesh ? getBBox(f.mesh) : null,
        params: f.params || {}
      }))
    };
  },

  'query.bbox': ({ target }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    return getBBox(mesh);
  },

  'query.materials': () => {
    return { materials: Object.keys(_ops.getMaterialPresets()) };
  },

  'query.session': () => {
    return getSession();
  },

  'query.log': ({ last = 20 }) => {
    return { commands: commandLog.slice(-last) };
  },

  // ==========================================================================
  // VALIDATE — DFM checks, measurements, analysis
  // ==========================================================================

  'validate.dimensions': ({ target }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const bbox = getBBox(mesh);
    const volume = bbox.width * bbox.height * bbox.depth;
    return {
      target,
      width: bbox.width,
      height: bbox.height,
      depth: bbox.depth,
      volume: round(volume),
      diagonal: round(Math.sqrt(bbox.width ** 2 + bbox.height ** 2 + bbox.depth ** 2)),
      fitsInPrintBed: bbox.width <= 250 && bbox.height <= 250 && bbox.depth <= 250,
      printBedSize: [250, 250, 250]
    };
  },

  'validate.wallThickness': ({ target, minWall = 0.8 }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const bbox = getBBox(mesh);
    const minDim = Math.min(bbox.width, bbox.height, bbox.depth);
    return {
      target,
      minDimension: round(minDim),
      minWallRequired: minWall,
      passes: minDim >= minWall,
      recommendation: minDim < minWall ? `Minimum dimension ${round(minDim)}mm is below ${minWall}mm wall threshold` : 'OK'
    };
  },

  'validate.printability': ({ target, process = 'FDM' }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const bbox = getBBox(mesh);
    const volume = bbox.width * bbox.height * bbox.depth;
    const issues = [];

    // Size checks
    const maxPrint = process === 'FDM' ? 250 : process === 'SLA' ? 150 : 300;
    if (bbox.width > maxPrint || bbox.height > maxPrint || bbox.depth > maxPrint) {
      issues.push(`Exceeds ${process} build volume (${maxPrint}mm)`);
    }

    // Wall thickness
    const minDim = Math.min(bbox.width, bbox.height, bbox.depth);
    const minWall = process === 'FDM' ? 0.8 : process === 'SLA' ? 0.3 : 1.0;
    if (minDim < minWall) {
      issues.push(`Min dimension ${round(minDim)}mm below ${minWall}mm ${process} minimum`);
    }

    // Aspect ratio (stability)
    const maxDim = Math.max(bbox.width, bbox.height, bbox.depth);
    if (maxDim / Math.max(minDim, 0.1) > 15) {
      issues.push('High aspect ratio — may need supports or orientation change');
    }

    return {
      target, process,
      printable: issues.length === 0,
      issues,
      estimatedTime: `${Math.ceil(volume / 1000)}min`,
      estimatedMaterial: `${round(volume * 0.0012)}g`,
      orientation: bbox.height > bbox.width ? 'Consider rotating 90° for better bed adhesion' : 'OK'
    };
  },

  'validate.cost': ({ target, process = 'FDM', material = 'PLA' }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const bbox = getBBox(mesh);
    const volume = bbox.width * bbox.height * bbox.depth;

    // Cost estimation per process
    const rates = {
      FDM: { perCm3: 0.05, setup: 2, perHour: 3 },
      SLA: { perCm3: 0.15, setup: 5, perHour: 8 },
      CNC: { perCm3: 0.30, setup: 25, perHour: 45 },
      injection: { perCm3: 0.02, setup: 5000, perHour: 100 }
    };
    const rate = rates[process] || rates.FDM;
    const volumeCm3 = volume / 1000;
    const hours = volumeCm3 / 10;
    const materialCost = round(volumeCm3 * rate.perCm3);
    const machineCost = round(hours * rate.perHour);
    const totalUnit = round(materialCost + machineCost + rate.setup);

    return {
      target, process, material,
      volumeCm3: round(volumeCm3),
      materialCost,
      machineCost,
      setupCost: rate.setup,
      unitCost: totalUnit,
      batchOf100: round((materialCost + machineCost) * 100 + rate.setup),
      recommendation: process === 'injection' && volumeCm3 < 50
        ? 'Volume too low for injection molding — consider FDM or CNC'
        : 'OK'
    };
  },

  // ==========================================================================
  // SCENE — full scene management
  // ==========================================================================

  'scene.clear': () => {
    const features = getAllFeatures();
    features.forEach(f => {
      if (f.mesh) _viewport.removeFromScene(f.mesh);
    });
    if (_appState.clearFeatures) _appState.clearFeatures();
    else if (_appState.features) _appState.features.length = 0;
    _sketch.clearSketch();
    featureIndex = 0;
    return { cleared: true, removed: features.length };
  },

  'scene.snapshot': () => {
    const renderer = _viewport.getRenderer();
    if (!renderer) throw new Error('Renderer not available');
    renderer.render(_viewport.getScene(), _viewport.getCamera());
    const dataUrl = renderer.domElement.toDataURL('image/png');
    return { format: 'png', dataUrl, width: renderer.domElement.width, height: renderer.domElement.height };
  },

  // ==========================================================================
  // RENDER — Visual feedback loop (CAD Agent pattern)
  // Agent sends commands → gets PNG renders back → evaluates → iterates
  // ==========================================================================

  'render.snapshot': ({ width = 800, height = 600 }) => {
    const renderer = _viewport.getRenderer();
    const scene = _viewport.getScene();
    const cam = _viewport.getCamera();
    if (!renderer) throw new Error('Renderer not available');
    // Render at requested resolution
    const origW = renderer.domElement.width;
    const origH = renderer.domElement.height;
    renderer.setSize(width, height);
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    // Restore
    renderer.setSize(origW, origH);
    cam.aspect = origW / origH;
    cam.updateProjectionMatrix();
    return { format: 'png', width, height, dataUrl };
  },

  'render.multiview': ({ width = 400, height = 300 }) => {
    const renderer = _viewport.getRenderer();
    const scene = _viewport.getScene();
    const cam = _viewport.getCamera();
    if (!renderer) throw new Error('Renderer not available');
    const origPos = cam.position.clone();
    const origTarget = new THREE.Vector3();
    // Capture 6 standard views
    const views = {
      front: [0, 0, 3000], back: [0, 0, -3000],
      right: [3000, 0, 0], left: [-3000, 0, 0],
      top: [0, 3000, 0], isometric: [2000, 1500, 2000]
    };
    const renders = {};
    const origW = renderer.domElement.width;
    const origH = renderer.domElement.height;
    renderer.setSize(width, height);
    cam.aspect = width / height;
    cam.updateProjectionMatrix();
    for (const [name, pos] of Object.entries(views)) {
      cam.position.set(...pos);
      cam.lookAt(0, 0, 0);
      renderer.render(scene, cam);
      renders[name] = renderer.domElement.toDataURL('image/png');
    }
    // Restore camera
    cam.position.copy(origPos);
    renderer.setSize(origW, origH);
    cam.aspect = origW / origH;
    cam.updateProjectionMatrix();
    return { viewCount: 6, width, height, views: Object.keys(renders), renders };
  },

  // ==========================================================================
  // ENGINEERING CALCS — mass, surface area, center of mass
  // ==========================================================================

  'validate.mass': ({ target, material = 'steel' }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const bbox = getBBox(mesh);
    const volumeCm3 = (bbox.width * bbox.height * bbox.depth) / 1000;
    // Material densities (g/cm³)
    const densities = { steel: 7.85, aluminum: 2.70, plastic: 1.04, brass: 8.50, titanium: 4.51, nylon: 1.14, copper: 8.96, wood: 0.6, pla: 1.24, abs: 1.05 };
    const density = densities[material] || densities.steel;
    // Approximate fill factor (solid shapes ~0.65 of bbox, complex shapes less)
    const fillFactor = 0.65;
    const massG = round(volumeCm3 * density * fillFactor);
    return {
      target, material,
      density: density + ' g/cm³',
      bboxVolumeCm3: round(volumeCm3),
      estimatedFill: fillFactor,
      massGrams: massG,
      massKg: round(massG / 1000),
      massLbs: round(massG / 453.592)
    };
  },

  'validate.surfaceArea': ({ target }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    // Calculate surface area from mesh triangles
    const geo = mesh.geometry;
    if (!geo) throw new Error('No geometry on mesh');
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex();
    let area = 0;
    const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    for (let i = 0; i < triCount; i++) {
      if (idx) {
        vA.fromBufferAttribute(pos, idx.getX(i * 3));
        vB.fromBufferAttribute(pos, idx.getX(i * 3 + 1));
        vC.fromBufferAttribute(pos, idx.getX(i * 3 + 2));
      } else {
        vA.fromBufferAttribute(pos, i * 3);
        vB.fromBufferAttribute(pos, i * 3 + 1);
        vC.fromBufferAttribute(pos, i * 3 + 2);
      }
      const edge1 = new THREE.Vector3().subVectors(vB, vA);
      const edge2 = new THREE.Vector3().subVectors(vC, vA);
      area += edge1.cross(edge2).length() * 0.5;
    }
    // Apply world transforms
    const scale = mesh.scale;
    area *= scale.x * scale.y; // approximate for uniform scale
    return {
      target,
      surfaceAreaMm2: round(area),
      surfaceAreaCm2: round(area / 100),
      surfaceAreaM2: round(area / 1000000),
      triangles: triCount
    };
  },

  'validate.centerOfMass': ({ target }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const geo = mesh.geometry;
    if (!geo) throw new Error('No geometry on mesh');
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox.getCenter(center);
    // Apply mesh world transform
    center.applyMatrix4(mesh.matrixWorld);
    return {
      target,
      centerOfMass: [round(center.x), round(center.y), round(center.z)],
      note: 'Assumes uniform density — geometric centroid of mesh'
    };
  },

  // ==========================================================================
  // DESIGN REVIEW — auto-analyze CAD for issues (Matsuo Lab pattern)
  // ==========================================================================

  'validate.designReview': ({ target }) => {
    requireAll({ target });
    const mesh = getFeatureMesh(target);
    if (!mesh) throw new Error(`Feature "${target}" not found`);
    const bbox = getBBox(mesh);
    const issues = [];
    const warnings = [];
    const passed = [];
    const volume = bbox.width * bbox.height * bbox.depth;
    const minDim = Math.min(bbox.width, bbox.height, bbox.depth);
    const maxDim = Math.max(bbox.width, bbox.height, bbox.depth);
    const aspectRatio = maxDim / Math.max(minDim, 0.01);

    // 1. Geometry sanity
    const geo = mesh.geometry;
    const triCount = geo.getIndex() ? geo.getIndex().count / 3 : geo.getAttribute('position').count / 3;
    if (triCount < 4) issues.push({ severity: 'error', check: 'geometry', msg: 'Too few triangles — degenerate geometry' });
    else passed.push('Geometry: valid mesh');

    if (triCount > 500000) warnings.push({ severity: 'warn', check: 'complexity', msg: `High triangle count (${triCount}) — may impact performance` });
    else passed.push(`Complexity: ${triCount} triangles OK`);

    // 2. Dimensions
    if (minDim < 0.1) issues.push({ severity: 'error', check: 'dimensions', msg: `Minimum dimension ${round(minDim)}mm — likely too thin to manufacture` });
    else if (minDim < 0.8) warnings.push({ severity: 'warn', check: 'wallThickness', msg: `Min dimension ${round(minDim)}mm — below FDM minimum (0.8mm)` });
    else passed.push(`Wall thickness: ${round(minDim)}mm OK`);

    // 3. Aspect ratio
    if (aspectRatio > 20) issues.push({ severity: 'error', check: 'aspectRatio', msg: `Extreme aspect ratio ${round(aspectRatio)}:1 — part will be fragile or warp` });
    else if (aspectRatio > 10) warnings.push({ severity: 'warn', check: 'aspectRatio', msg: `High aspect ratio ${round(aspectRatio)}:1 — consider supports` });
    else passed.push(`Aspect ratio: ${round(aspectRatio)}:1 OK`);

    // 4. Size
    if (maxDim > 500) warnings.push({ severity: 'warn', check: 'size', msg: `Part exceeds 500mm (${round(maxDim)}mm) — check build volume for your process` });
    else passed.push(`Size: ${round(maxDim)}mm max dimension OK`);

    // 5. Volume check
    if (volume < 1) issues.push({ severity: 'error', check: 'volume', msg: 'Near-zero volume — possibly a surface, not a solid' });
    else passed.push(`Volume: ${round(volume / 1000)}cm³ OK`);

    // 6. Origin check (center of mass far from origin)
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox.getCenter(center);
    const distFromOrigin = center.length();
    if (distFromOrigin > maxDim * 5) warnings.push({ severity: 'warn', check: 'origin', msg: `Part center is ${round(distFromOrigin)}mm from origin — may cause precision issues` });
    else passed.push('Origin: part near world origin');

    // Score
    const score = issues.length === 0 && warnings.length === 0 ? 'A'
      : issues.length === 0 && warnings.length <= 2 ? 'B'
      : issues.length === 0 ? 'C'
      : 'F';

    return {
      target,
      score,
      summary: `${passed.length} passed, ${warnings.length} warnings, ${issues.length} errors`,
      passed,
      warnings,
      issues,
      recommendation: issues.length > 0
        ? 'Fix errors before manufacturing'
        : warnings.length > 0
          ? 'Review warnings — part may need adjustments'
          : 'Design review passed — ready for manufacturing'
    };
  },

  // ==========================================================================
  // META — API info, health, schema
  // ==========================================================================

  'meta.ping': () => {
    return { pong: true, timestamp: Date.now(), session: sessionId };
  },

  'meta.version': () => {
    return {
      product: 'cycleCAD',
      tagline: 'The Agent-First OS for Manufacturing',
      apiVersion: '1.0.0',
      modules: ['sketch', 'operations', 'advanced-ops', 'export', 'viewport', 'validate'],
      commandCount: Object.keys(COMMANDS).length
    };
  },

  'meta.schema': () => {
    return getSchema();
  },
};

// ============================================================================
// SCHEMA — self-describing API for agent discovery
// ============================================================================

export function getSchema() {
  return {
    description: 'cycleCAD Agent API — The Agent-First OS for Manufacturing',
    version: '1.0.0',
    protocol: 'JSON commands via window.cycleCAD.execute({ method, params })',
    namespaces: {
      sketch: {
        description: '2D drawing on a construction plane',
        methods: {
          'sketch.start': { params: { plane: 'XY|XZ|YZ' }, description: 'Start sketch mode' },
          'sketch.end': { params: {}, description: 'End sketch, return entities' },
          'sketch.line': { params: { x1: 'number', y1: 'number', x2: 'number', y2: 'number' }, description: 'Draw a line' },
          'sketch.rect': { params: { x: 'number?', y: 'number?', width: 'number', height: 'number' }, description: 'Draw a rectangle' },
          'sketch.circle': { params: { cx: 'number?', cy: 'number?', radius: 'number' }, description: 'Draw a circle' },
          'sketch.arc': { params: { cx: 'number?', cy: 'number?', radius: 'number', startAngle: 'number?', endAngle: 'number?' }, description: 'Draw an arc' },
          'sketch.clear': { params: {}, description: 'Clear all sketch entities' },
          'sketch.entities': { params: {}, description: 'List current sketch entities' },
        }
      },
      ops: {
        description: '3D modeling operations',
        methods: {
          'ops.extrude': { params: { height: 'number', symmetric: 'bool?', material: 'string?' }, description: 'Extrude sketch into 3D solid' },
          'ops.revolve': { params: { axis: 'X|Y|Z?', angle: 'degrees?', material: 'string?' }, description: 'Revolve sketch around axis' },
          'ops.primitive': { params: { shape: 'box|sphere|cylinder|cone|torus', width: 'n?', height: 'n?', depth: 'n?', radius: 'n?', material: 'string?' }, description: 'Create a primitive shape' },
          'ops.fillet': { params: { target: 'featureId', radius: 'number?' }, description: 'Fillet edges' },
          'ops.chamfer': { params: { target: 'featureId', distance: 'number?' }, description: 'Chamfer edges' },
          'ops.boolean': { params: { operation: 'union|cut|intersect', targetA: 'featureId', targetB: 'featureId' }, description: 'Boolean operation' },
          'ops.shell': { params: { target: 'featureId', thickness: 'number?' }, description: 'Shell (hollow) a solid' },
          'ops.pattern': { params: { target: 'featureId', type: 'rect|circular?', count: 'number?', spacing: 'number?' }, description: 'Pattern repeat' },
          'ops.material': { params: { target: 'featureId', material: 'string' }, description: 'Change material' },
          'ops.sweep': { params: { profile: 'object', path: 'object', twist: 'number?', scale: 'number?' }, description: 'Sweep profile along path' },
          'ops.loft': { params: { profiles: 'array' }, description: 'Loft between profiles' },
          'ops.spring': { params: { radius: 'n?', wireRadius: 'n?', height: 'n?', turns: 'n?', material: 'string?' }, description: 'Generate a spring' },
          'ops.thread': { params: { outerRadius: 'n?', innerRadius: 'n?', pitch: 'n?', length: 'n?', material: 'string?' }, description: 'Generate a thread' },
          'ops.bend': { params: { target: 'featureId', angle: 'degrees?', radius: 'number?' }, description: 'Sheet metal bend' },
        }
      },
      transform: {
        description: 'Move, rotate, scale features',
        methods: {
          'transform.move': { params: { target: 'featureId', x: 'n?', y: 'n?', z: 'n?' }, description: 'Translate' },
          'transform.rotate': { params: { target: 'featureId', x: 'deg?', y: 'deg?', z: 'deg?' }, description: 'Rotate' },
          'transform.scale': { params: { target: 'featureId', x: 'n?', y: 'n?', z: 'n?' }, description: 'Scale' },
        }
      },
      view: {
        description: 'Camera and display',
        methods: {
          'view.set': { params: { view: 'front|back|left|right|top|bottom|isometric' }, description: 'Set camera view' },
          'view.fit': { params: { target: 'featureId?' }, description: 'Fit view to object' },
          'view.wireframe': { params: { enabled: 'bool?' }, description: 'Toggle wireframe' },
          'view.grid': { params: { visible: 'bool?' }, description: 'Toggle grid' },
        }
      },
      export: {
        description: 'Export model files',
        methods: {
          'export.stl': { params: { filename: 'string?', binary: 'bool?' }, description: 'Export STL' },
          'export.obj': { params: { filename: 'string?' }, description: 'Export OBJ' },
          'export.gltf': { params: { filename: 'string?' }, description: 'Export glTF' },
          'export.json': { params: { filename: 'string?' }, description: 'Export cycleCAD JSON' },
        }
      },
      validate: {
        description: 'DFM checks, cost estimation, engineering analysis, design review',
        methods: {
          'validate.dimensions': { params: { target: 'featureId' }, description: 'Get part dimensions' },
          'validate.wallThickness': { params: { target: 'featureId', minWall: 'mm?' }, description: 'Check wall thickness' },
          'validate.printability': { params: { target: 'featureId', process: 'FDM|SLA|CNC?' }, description: 'Check printability' },
          'validate.cost': { params: { target: 'featureId', process: 'FDM|SLA|CNC|injection?', material: 'string?' }, description: 'Estimate manufacturing cost' },
          'validate.mass': { params: { target: 'featureId', material: 'string?' }, description: 'Estimate part mass (weight)' },
          'validate.surfaceArea': { params: { target: 'featureId' }, description: 'Calculate surface area from mesh' },
          'validate.centerOfMass': { params: { target: 'featureId' }, description: 'Get center of mass (geometric centroid)' },
          'validate.designReview': { params: { target: 'featureId' }, description: 'Auto-analyze for manufacturing issues — scored A/B/C/F' },
        }
      },
      render: {
        description: 'Visual feedback loop — agents see what they built',
        methods: {
          'render.snapshot': { params: { width: 'number?', height: 'number?' }, description: 'Render current view as PNG at specified resolution' },
          'render.multiview': { params: { width: 'number?', height: 'number?' }, description: 'Render 6 standard views (front/back/left/right/top/isometric) as PNGs' },
        }
      },
      query: {
        description: 'Inspect model state',
        methods: {
          'query.features': { params: {}, description: 'List all features' },
          'query.bbox': { params: { target: 'featureId' }, description: 'Get bounding box' },
          'query.materials': { params: {}, description: 'List available materials' },
          'query.session': { params: {}, description: 'Session info' },
          'query.log': { params: { last: 'number?' }, description: 'Recent command log' },
        }
      },
      scene: {
        description: 'Scene management',
        methods: {
          'scene.clear': { params: {}, description: 'Clear all features' },
          'scene.snapshot': { params: {}, description: 'Capture viewport as PNG (legacy — use render.snapshot)' },
        }
      },
      meta: {
        description: 'API info',
        methods: {
          'meta.ping': { params: {}, description: 'Health check' },
          'meta.version': { params: {}, description: 'Version info' },
          'meta.schema': { params: {}, description: 'Full API schema' },
        }
      }
    },
    example: {
      description: 'Design a bracket with 4 bolt holes',
      commands: [
        { method: 'sketch.start', params: { plane: 'XY' } },
        { method: 'sketch.rect', params: { width: 80, height: 40 } },
        { method: 'ops.extrude', params: { height: 5, material: 'aluminum' } },
        { method: 'validate.printability', params: { target: 'extrude_1', process: 'CNC' } },
        { method: 'validate.cost', params: { target: 'extrude_1', process: 'CNC', material: 'aluminum' } },
        { method: 'export.stl', params: { filename: 'bracket.stl' } },
      ]
    }
  };
}

// ============================================================================
// SESSION STATE
// ============================================================================

export function getState() {
  return {
    session: sessionId,
    featureCount: getAllFeatures().length,
    commandCount: commandLog.length,
    features: getAllFeatures().map(f => ({
      id: f.id, type: f.type, bbox: f.mesh ? getBBox(f.mesh) : null
    }))
  };
}

export function getSession() {
  return {
    sessionId,
    commandsExecuted: commandLog.length,
    featureCount: getAllFeatures().length,
    uptime: Math.round(performance.now() / 1000),
    api: `window.cycleCAD.execute({ method: "meta.ping" })`
  };
}

// ============================================================================
// UTILS
// ============================================================================

function requireAll(params) {
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null) {
      throw new Error(`Required parameter "${key}" is missing`);
    }
  }
}

function getBBox(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return {
    width: round(size.x),
    height: round(size.y),
    depth: round(size.z),
    center: [round(center.x), round(center.y), round(center.z)],
    min: [round(box.min.x), round(box.min.y), round(box.min.z)],
    max: [round(box.max.x), round(box.max.y), round(box.max.z)]
  };
}

function round(n) { return Math.round(n * 100) / 100; }

function summarizeEntity(e) {
  const s = { type: e.type, id: e.id };
  if (e.type === 'line') { s.from = [e.x1, e.y1]; s.to = [e.x2, e.y2]; }
  if (e.type === 'circle') { s.center = [e.cx, e.cy]; s.radius = e.radius; }
  if (e.type === 'arc') { s.center = [e.cx, e.cy]; s.radius = e.radius; }
  return s;
}

function addFeature(id, type, mesh, params) {
  if (_appState.addFeature) {
    _appState.addFeature({ id, type, name: id, mesh, params });
  } else if (_appState.features) {
    _appState.features.push({ id, type, name: id, mesh, params });
  }
}
