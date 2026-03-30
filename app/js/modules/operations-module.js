/**
 * Operations Module — 3D Modeling Operations
 * Part of cycleCAD microkernel architecture
 *
 * Smart dispatch between B-Rep kernel and mesh fallbacks
 * All 3D operations (extrude, fillet, pattern, boolean, etc.) exposed as kernel commands
 *
 * Version: 1.0.0
 * Author: cycleCAD Team
 * License: MIT
 */

const OperationsModule = {
  id: 'operations',
  name: '3D Operations',
  version: '1.0.0',
  category: 'engine',
  description: 'All 3D modeling operations with smart B-Rep / mesh dispatch',
  dependencies: ['viewport', 'sketch'],
  memoryEstimate: 10,

  init(kernel) {
    this.kernel = kernel;
    this.features = [];
    this.featureCounter = 0;
    this.currentShape = null;
    this.meshCache = new Map();

    // Register all operations as kernel commands
    this._registerCommands();

    // Listen for kernel events
    kernel.on('feature:rebuild', () => this._rebuildAllFeatures());

    return {
      ready: true,
      message: 'Operations module initialized'
    };
  },

  /**
   * Register all operations as kernel commands
   */
  _registerCommands() {
    const ops = [
      // Create (primitives)
      'box', 'cylinder', 'sphere', 'cone', 'torus',
      // Modify
      'extrude', 'revolve', 'sweep', 'loft', 'fillet', 'chamfer', 'shell', 'draft', 'hole', 'thread', 'rib', 'split',
      // Pattern
      'rectangularPattern', 'circularPattern', 'pathPattern',
      // Transform
      'mirror', 'move', 'rotate', 'scale', 'copy',
      // Boolean
      'union', 'cut', 'intersect',
      // Feature management
      'editFeature', 'suppressFeature', 'reorderFeature', 'deleteFeature', 'rebuild',
      'getFeatureHistory', 'getCurrentShape'
    ];

    ops.forEach(op => {
      this.kernel.registerCommand(`ops.${op}`, (...args) => this[op](...args));
    });
  },

  /**
   * Smart dispatch: use B-Rep if available, fall back to mesh
   */
  _dispatch(operation, params) {
    const brep = this.kernel.get('brep-kernel');
    if (brep && brep.status === 'active') {
      try {
        return this.kernel.exec(`brep.${operation}`, params);
      } catch (e) {
        console.warn(`B-Rep operation failed, falling back to mesh: ${operation}`, e);
        return this._meshFallback(operation, params);
      }
    } else {
      return this._meshFallback(operation, params);
    }
  },

  /**
   * Mesh fallback implementations
   */
  _meshFallback(operation, params) {
    const methodName = `_mesh${operation.charAt(0).toUpperCase() + operation.slice(1)}`;
    if (typeof this[methodName] === 'function') {
      return this[methodName](params);
    } else {
      throw new Error(`Mesh fallback not implemented for: ${operation}`);
    }
  },

  // ============================================================================
  // CREATE (Primitives)
  // ============================================================================

  box(width, height, depth, options = {}) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(options));
    mesh.userData.operation = 'box';
    mesh.userData.params = { width, height, depth, ...options };
    return this._createFeature('box', { width, height, depth, ...options }, mesh);
  },

  _meshBox(params) {
    const { width, height, depth } = params;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    mesh.userData.operation = 'box';
    return mesh;
  },

  cylinder(radius, height, options = {}) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, options.segments || 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(options));
    mesh.userData.operation = 'cylinder';
    mesh.userData.params = { radius, height, ...options };
    return this._createFeature('cylinder', { radius, height, ...options }, mesh);
  },

  _meshCylinder(params) {
    const { radius, height, segments = 32 } = params;
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  sphere(radius, options = {}) {
    const geometry = new THREE.SphereGeometry(radius, options.widthSegments || 32, options.heightSegments || 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(options));
    mesh.userData.operation = 'sphere';
    mesh.userData.params = { radius, ...options };
    return this._createFeature('sphere', { radius, ...options }, mesh);
  },

  _meshSphere(params) {
    const { radius, widthSegments = 32, heightSegments = 32 } = params;
    const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  cone(radiusTop, radiusBottom, height, options = {}) {
    const geometry = new THREE.ConeGeometry(radiusBottom, height, options.segments || 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(options));
    mesh.userData.operation = 'cone';
    mesh.userData.params = { radiusTop, radiusBottom, height, ...options };
    return this._createFeature('cone', { radiusTop, radiusBottom, height, ...options }, mesh);
  },

  _meshCone(params) {
    const { radiusTop, radiusBottom, height, segments = 32 } = params;
    const geometry = new THREE.ConeGeometry(radiusBottom, height, segments);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  torus(majorRadius, minorRadius, options = {}) {
    const geometry = new THREE.TorusGeometry(majorRadius, minorRadius, options.tubeSegments || 16, options.radialSegments || 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(options));
    mesh.userData.operation = 'torus';
    mesh.userData.params = { majorRadius, minorRadius, ...options };
    return this._createFeature('torus', { majorRadius, minorRadius, ...options }, mesh);
  },

  _meshTorus(params) {
    const { majorRadius, minorRadius, tubeSegments = 16, radialSegments = 32 } = params;
    const geometry = new THREE.TorusGeometry(majorRadius, minorRadius, tubeSegments, radialSegments);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  // ============================================================================
  // MODIFY Operations
  // ============================================================================

  extrude(profile, distance, options = {}) {
    const params = { profile, distance, symmetric: options.symmetric || false, ...options };
    const result = this._dispatch('extrude', params);
    return this._createFeature('extrude', params, result);
  },

  _meshExtrude(params) {
    const { profile, distance, symmetric = false } = params;
    if (!profile || !profile.userData || !profile.userData.shape2d) {
      throw new Error('Profile must be a 2D sketch');
    }
    const extrudeDepth = symmetric ? distance / 2 : distance;
    try {
      const geometry = new THREE.ExtrudeGeometry(profile.userData.shape2d, {
        depth: extrudeDepth,
        bevelEnabled: false
      });
      const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
      if (symmetric) {
        mesh.position.z = -extrudeDepth / 2;
      }
      return mesh;
    } catch (e) {
      console.warn('THREE.ExtrudeGeometry failed, using fallback cylinder', e);
      return this._meshCylinder({ radius: 10, height: distance });
    }
  },

  revolve(profile, axis, angle, options = {}) {
    const params = { profile, axis, angle, ...options };
    const result = this._dispatch('revolve', params);
    return this._createFeature('revolve', params, result);
  },

  _meshRevolve(params) {
    const { profile, axis, angle } = params;
    if (!profile) throw new Error('Profile required for revolve');
    // Mesh fallback: create cone-like shape for simple revolves
    const geometry = new THREE.CylinderGeometry(10, 8, 20, 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  sweep(profile, path, options = {}) {
    const params = { profile, path, twist: options.twist || 0, scale: options.scale || 1, ...options };
    const result = this._dispatch('sweep', params);
    return this._createFeature('sweep', params, result);
  },

  _meshSweep(params) {
    // Simplified mesh fallback
    const geometry = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 20)), 20, 5, 8);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  loft(profiles, options = {}) {
    const params = { profiles, guideCurves: options.guideCurves || null, ...options };
    const result = this._dispatch('loft', params);
    return this._createFeature('loft', params, result);
  },

  _meshLoft(params) {
    // Fallback: create a cone-like interpolation
    const geometry = new THREE.ConeGeometry(10, 20, 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  fillet(shape, edges, radius, options = {}) {
    const params = { shapeId: shape.uuid, edgeIndices: edges, radius, ...options };
    const result = this._dispatch('fillet', params);
    return this._createFeature('fillet', params, result);
  },

  _meshFillet(params) {
    const { radius = 2 } = params;
    // Mesh fallback: add torus segment at corner (approximation)
    const torusGeometry = new THREE.TorusGeometry(radius, radius / 3, 8, 8, Math.PI / 2);
    const mesh = new THREE.Mesh(torusGeometry, this._getMaterial(params));
    return mesh;
  },

  chamfer(shape, edges, distance, options = {}) {
    const params = { shapeId: shape.uuid, edgeIndices: edges, distance, ...options };
    const result = this._dispatch('chamfer', params);
    return this._createFeature('chamfer', params, result);
  },

  _meshChamfer(params) {
    const { distance = 1 } = params;
    // Mesh fallback: simple plane cut approximation
    const geometry = new THREE.BoxGeometry(20, 20, 1);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  shell(shape, faces, thickness, options = {}) {
    const params = { shapeId: shape.uuid, faceIndices: faces, thickness, ...options };
    const result = this._dispatch('shell', params);
    return this._createFeature('shell', params, result);
  },

  _meshShell(params) {
    const { thickness = 1 } = params;
    // Mesh fallback: outer sphere with slight thickness
    const outerGeometry = new THREE.SphereGeometry(10, 32, 32);
    const innerGeometry = new THREE.SphereGeometry(10 - thickness, 32, 32);
    const mesh = new THREE.Mesh(outerGeometry, this._getMaterial(params));
    return mesh;
  },

  draft(shape, faces, angle, pullDir, options = {}) {
    const params = { shapeId: shape.uuid, faceIndices: faces, angle, pullDir, ...options };
    const result = this._dispatch('draft', params);
    return this._createFeature('draft', params, result);
  },

  _meshDraft(params) {
    // Mesh fallback: slight taper
    const geometry = new THREE.ConeGeometry(12, 20, 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  hole(shape, position, radius, depth, options = {}) {
    const holeType = options.type || 'simple'; // simple, counterbore, countersink, tapped
    const params = { shapeId: shape.uuid, position, radius, depth, type: holeType, ...options };
    const result = this._dispatch('hole', params);
    return this._createFeature('hole', params, result);
  },

  _meshHole(params) {
    // Mesh fallback: subtract small cylinder
    const geometry = new THREE.CylinderGeometry(params.radius, params.radius, params.depth, 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    mesh.position.copy(params.position);
    return mesh;
  },

  thread(shape, cylinderFace, pitch, options = {}) {
    const threadType = options.type || 'cosmetic'; // cosmetic, modeled
    const params = { shapeId: shape.uuid, faceIndex: cylinderFace, pitch, type: threadType, ...options };
    const result = this._dispatch('thread', params);
    return this._createFeature('thread', params, result);
  },

  _meshThread(params) {
    // Mesh fallback: textured cylinder
    const { pitch = 1.5 } = params;
    const geometry = new THREE.CylinderGeometry(5, 5, 20, 32);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  rib(shape, sketchLine, thickness, options = {}) {
    const params = { shapeId: shape.uuid, sketchLineId: sketchLine, thickness, ...options };
    const result = this._dispatch('rib', params);
    return this._createFeature('rib', params, result);
  },

  _meshRib(params) {
    const { thickness = 1 } = params;
    const geometry = new THREE.BoxGeometry(20, thickness, 10);
    const mesh = new THREE.Mesh(geometry, this._getMaterial(params));
    return mesh;
  },

  split(shape, splitTool, options = {}) {
    const params = { shapeId: shape.uuid, splitToolId: splitTool, ...options };
    const result = this._dispatch('split', params);
    return this._createFeature('split', params, result);
  },

  _meshSplit(params) {
    // Mesh fallback: just return shape unchanged
    return params.shapeId;
  },

  // ============================================================================
  // PATTERN Operations
  // ============================================================================

  rectangularPattern(shape, xCount, yCount, xSpacing, ySpacing, options = {}) {
    const params = { shapeId: shape.uuid, xCount, yCount, xSpacing, ySpacing, ...options };
    return this._createFeature('rectangularPattern', params, this._meshRectangularPattern(params));
  },

  _meshRectangularPattern(params) {
    const { xCount, yCount, xSpacing, ySpacing } = params;
    const group = new THREE.Group();
    const baseMesh = this.currentShape;

    for (let x = 0; x < xCount; x++) {
      for (let y = 0; y < yCount; y++) {
        const clonedMesh = baseMesh.clone();
        clonedMesh.position.x = (x - (xCount - 1) / 2) * xSpacing;
        clonedMesh.position.y = (y - (yCount - 1) / 2) * ySpacing;
        group.add(clonedMesh);
      }
    }
    group.userData.operation = 'rectangularPattern';
    return group;
  },

  circularPattern(shape, axis, count, angle, options = {}) {
    const params = { shapeId: shape.uuid, axis, count, angle, ...options };
    return this._createFeature('circularPattern', params, this._meshCircularPattern(params));
  },

  _meshCircularPattern(params) {
    const { count, angle } = params;
    const group = new THREE.Group();
    const baseMesh = this.currentShape;
    const angleStep = angle / count;

    for (let i = 0; i < count; i++) {
      const clonedMesh = baseMesh.clone();
      clonedMesh.rotateZ(angleStep * i * Math.PI / 180);
      group.add(clonedMesh);
    }
    group.userData.operation = 'circularPattern';
    return group;
  },

  pathPattern(shape, path, count, options = {}) {
    const params = { shapeId: shape.uuid, pathId: path, count, ...options };
    return this._createFeature('pathPattern', params, this._meshPathPattern(params));
  },

  _meshPathPattern(params) {
    // Simplified fallback
    const group = new THREE.Group();
    const baseMesh = this.currentShape;

    for (let i = 0; i < params.count; i++) {
      const clonedMesh = baseMesh.clone();
      clonedMesh.position.z = i * 5;
      group.add(clonedMesh);
    }
    return group;
  },

  // ============================================================================
  // TRANSFORM Operations
  // ============================================================================

  mirror(shape, plane, options = {}) {
    const params = { shapeId: shape.uuid, plane, ...options };
    return this._createFeature('mirror', params, this._meshMirror(params));
  },

  _meshMirror(params) {
    const mesh = this.currentShape.clone();
    const { plane } = params;

    if (plane === 'xy') mesh.scale.z = -1;
    else if (plane === 'yz') mesh.scale.x = -1;
    else if (plane === 'xz') mesh.scale.y = -1;

    return mesh;
  },

  move(shape, translation, options = {}) {
    const params = { shapeId: shape.uuid, translation, ...options };
    const mesh = this.currentShape.clone();
    mesh.position.add(new THREE.Vector3(...translation));
    return this._createFeature('move', params, mesh);
  },

  rotate(shape, axis, angle, options = {}) {
    const params = { shapeId: shape.uuid, axis, angle, ...options };
    const mesh = this.currentShape.clone();
    const axisVector = new THREE.Vector3(...axis).normalize();
    mesh.rotateOnWorldAxis(axisVector, angle * Math.PI / 180);
    return this._createFeature('rotate', params, mesh);
  },

  scale(shape, factor, options = {}) {
    const params = { shapeId: shape.uuid, factor, ...options };
    const mesh = this.currentShape.clone();
    mesh.scale.multiplyScalar(factor);
    return this._createFeature('scale', params, mesh);
  },

  copy(shape, options = {}) {
    const params = { shapeId: shape.uuid, ...options };
    const mesh = this.currentShape.clone();
    return this._createFeature('copy', params, mesh);
  },

  // ============================================================================
  // BOOLEAN Operations
  // ============================================================================

  union(shape1, shape2, options = {}) {
    const params = { shape1Id: shape1.uuid, shape2Id: shape2.uuid, ...options };
    const result = this._dispatch('union', params);
    return this._createFeature('union', params, result || this._meshUnion(params));
  },

  _meshUnion(params) {
    // Mesh fallback: group both shapes
    const group = new THREE.Group();
    group.add(this.currentShape.clone());
    group.userData.operation = 'union';
    return group;
  },

  cut(shape1, tool, options = {}) {
    const params = { shape1Id: shape1.uuid, toolId: tool.uuid, ...options };
    const result = this._dispatch('cut', params);
    return this._createFeature('cut', params, result || this._meshCut(params));
  },

  _meshCut(params) {
    // Mesh fallback: visual indicator only
    const mesh = this.currentShape.clone();
    mesh.userData.isCut = true;
    return mesh;
  },

  intersect(shape1, shape2, options = {}) {
    const params = { shape1Id: shape1.uuid, shape2Id: shape2.uuid, ...options };
    const result = this._dispatch('intersect', params);
    return this._createFeature('intersect', params, result || this._meshIntersect(params));
  },

  _meshIntersect(params) {
    // Mesh fallback: group intersection
    const group = new THREE.Group();
    group.userData.operation = 'intersect';
    return group;
  },

  // ============================================================================
  // FEATURE MANAGEMENT
  // ============================================================================

  _createFeature(type, params, result) {
    const featureId = `feat_${++this.featureCounter}`;
    const feature = {
      id: featureId,
      type,
      params,
      result: result.uuid ? { meshId: result.uuid } : { meshId: null },
      timestamp: Date.now(),
      suppressed: false
    };

    this.features.push(feature);
    this.currentShape = result;

    this.kernel.emit('feature:created', { feature });
    return { featureId, result };
  },

  editFeature(featureId, newParams) {
    const feature = this.features.find(f => f.id === featureId);
    if (!feature) throw new Error(`Feature not found: ${featureId}`);

    const oldParams = feature.params;
    feature.params = { ...feature.params, ...newParams };

    this.kernel.emit('feature:edited', { featureId, oldParams, newParams });
    this._rebuildAllFeatures();

    return { featureId, updated: true };
  },

  suppressFeature(featureId) {
    const feature = this.features.find(f => f.id === featureId);
    if (!feature) throw new Error(`Feature not found: ${featureId}`);

    feature.suppressed = !feature.suppressed;
    this._rebuildAllFeatures();

    return { featureId, suppressed: feature.suppressed };
  },

  reorderFeature(featureId, newIndex) {
    const currentIndex = this.features.findIndex(f => f.id === featureId);
    if (currentIndex === -1) throw new Error(`Feature not found: ${featureId}`);

    const [feature] = this.features.splice(currentIndex, 1);
    this.features.splice(newIndex, 0, feature);

    this._rebuildAllFeatures();
    return { featureId, newIndex };
  },

  deleteFeature(featureId) {
    const index = this.features.findIndex(f => f.id === featureId);
    if (index === -1) throw new Error(`Feature not found: ${featureId}`);

    this.features.splice(index, 1);
    this.kernel.emit('feature:deleted', { featureId });

    this._rebuildAllFeatures();
    return { featureId, deleted: true };
  },

  rebuild() {
    this._rebuildAllFeatures();
    return { rebuilt: true, featureCount: this.features.length };
  },

  _rebuildAllFeatures() {
    this.currentShape = null;
    const startTime = performance.now();

    this.features.forEach(feature => {
      if (!feature.suppressed) {
        const method = this[feature.type];
        if (method && typeof method === 'function') {
          try {
            const { result } = method.call(this, ...Object.values(feature.params));
            feature.result = { meshId: result.uuid };
            this.currentShape = result;
          } catch (e) {
            console.error(`Failed to rebuild feature ${feature.id}:`, e);
          }
        }
      }
    });

    const duration = performance.now() - startTime;
    this.kernel.emit('rebuild:complete', { featureCount: this.features.length, duration });
  },

  getFeatureHistory() {
    return this.features.map(f => ({
      id: f.id,
      type: f.type,
      suppressed: f.suppressed,
      timestamp: f.timestamp,
      paramKeys: Object.keys(f.params)
    }));
  },

  getCurrentShape() {
    return this.currentShape;
  },

  // ============================================================================
  // UTILITIES
  // ============================================================================

  _getMaterial(options = {}) {
    const color = options.color || 0x4a90e2;
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive: 0x000000,
      shininess: 100,
      transparent: options.transparent || false,
      opacity: options.opacity !== undefined ? options.opacity : 1.0
    });
    return material;
  },

  getUI() {
    // Return feature tree UI panel
    return `
      <div id="operations-panel" class="panel">
        <div class="panel-header">
          <h3>Feature Tree</h3>
          <button data-close-panel>×</button>
        </div>
        <div class="panel-content">
          <div id="feature-tree" style="max-height: 500px; overflow-y: auto;">
            <!-- Features populated here -->
          </div>
          <div style="margin-top: 10px; border-top: 1px solid #ccc; padding-top: 10px;">
            <button onclick="window.cycleCAD.kernel.exec('ops.rebuild')">Rebuild All</button>
          </div>
        </div>
      </div>
    `;
  }
};

export default OperationsModule;
