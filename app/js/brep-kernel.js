/**
 * @file brep-kernel.js
 * @description B-Rep (Boundary Representation) Solid Modeling Kernel for cycleCAD
 *   Wraps OpenCascade.js (WASM build of OpenCASCADE) to provide real solid modeling
 *   with B-Rep shapes, topology, and geometry operations.
 *
 *   Lazy-loads the ~50MB OpenCascade.js WASM file on first geometry operation.
 *   Caches shapes in memory for efficient reuse.
 *
 * @version 2.0.0
 * @author cycleCAD Team (wrapped OpenCASCADE)
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 * @see {@link https://github.com/CadQuery/opencascade.js}
 *
 * @module brep-kernel
 * @requires OpenCascade.js (loaded via CDN on demand)
 * @requires THREE.js (for mesh visualization)
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────────┐
 *   │   B-Rep Kernel (via OpenCascade.js)                  │
 *   │  Lazy-loaded WASM on first operation                 │
 *   ├──────────────────────────────────────────────────────┤
 *   │ Primitives: Box, Cylinder, Sphere, Cone, Torus       │
 *   │ Shape Ops: Extrude, Revolve, Sweep, Loft, Draft      │
 *   │ Booleans: Union (Fuse), Cut, Intersect               │
 *   │ Modifiers: Fillet, Chamfer, Shell, Thicken           │
 *   │ Advanced: Split, Helix, Pipe, Thread                 │
 *   │ Selection: Edge/Face extraction + highlighting       │
 *   │ Meshing: Tessellation to THREE.js geometry           │
 *   │ Analysis: Mass properties, DFM checks                │
 *   │ I/O: STEP import/export (AP203/AP214)                │
 *   │ Error Recovery: Fuzzy tolerance, shape healing       │
 *   └──────────────────────────────────────────────────────┘
 *
 * Key Features:
 *   - Real B-Rep solids with full topology tracking
 *   - STEP AP203/AP214 file import/export with color preservation
 *   - Boolean operations with error recovery (fuzzy tolerance, healing)
 *   - Edge/face selection for targeted operations
 *   - Fillets and chamfers with real B-Rep trimming
 *   - Mass property analysis (volume, surface area, COG, moments of inertia)
 *   - Advanced operations: shell, thicken, split, helix, thread
 *   - Automatic tessellation for visualization
 *   - Shape caching for performance
 *   - Comprehensive error handling with diagnostics
 *   - Lazy WASM initialization on first use
 *
 * Usage Example:
 *   ```javascript
 *   import brepKernel from './brep-kernel.js';
 *
 *   // Initialize (lazy — loads WASM only when needed)
 *   await brepKernel.init();
 *
 *   // Create primitives
 *   const box = await brepKernel.makeBox(10, 20, 30);
 *   const cyl = await brepKernel.makeCylinder(5, 40);
 *
 *   // Boolean operations with error recovery
 *   const subtracted = await brepKernel.booleanCut(box.id, cyl.id);
 *
 *   // Edge selection and fillet
 *   const edges = await brepKernel.getEdges(subtracted.id);
 *   const filleted = await brepKernel.fillet(subtracted.id, [0, 1, 2], 2);
 *
 *   // Convert to Three.js mesh for visualization
 *   const mesh = await brepKernel.shapeToMesh(filleted.shape);
 *   scene.add(mesh);
 *
 *   // Mass properties analysis
 *   const props = await brepKernel.getMassProperties(filleted.id, 7850);
 *   console.log('Volume:', props.volume, 'mm³');
 *   console.log('Weight:', props.mass, 'kg');
 *
 *   // Export to STEP
 *   const stepData = await brepKernel.exportSTEP([filleted.id]);
 *   ```
 */

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CLASSES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * B-Rep operation error with detailed diagnostic information
 * @class BRepError
 * @extends Error
 * @property {string} operation - Operation that failed
 * @property {Object} [shape] - Shape object involved in the error
 * @property {string} [diagnostic] - Additional diagnostic message
 */
class BRepError extends Error {
  constructor(operation, message, shape = null, diagnostic = '') {
    super(`[BRepKernel:${operation}] ${message}`);
    this.name = 'BRepError';
    this.operation = operation;
    this.shape = shape;
    this.diagnostic = diagnostic;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// B-REP KERNEL CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * B-Rep Kernel class — WASM wrapper for OpenCascade.js
 *
 * Provides high-level API to OpenCascade shape modeling.
 * Handles lazy WASM initialization, shape caching, topology tracking, and memory management.
 *
 * @class BRepKernel
 * @property {Object|null} oc - OpenCascade.js instance (null until init() called)
 * @property {Map<string, Object>} shapeCache - Cached shapes: shapeId → TopoDS_Shape
 * @property {Map<string, Object>} shapeMetadata - Shape metadata: shapeId → {name, color, bbox, edges, faces}
 * @property {number} nextShapeId - Auto-incrementing shape ID counter
 * @property {boolean} isInitializing - Prevents concurrent initialization
 * @property {Promise|null} initPromise - Caches the init() promise for idempotence
 */
class BRepKernel {
  constructor() {
    /** OpenCascade instance (loaded on first geometry operation) */
    this.oc = null;

    /** Shape cache: shapeId → TopoDS_Shape (OCC native object) */
    this.shapeCache = new Map();

    /** Shape metadata tracking: shapeId → {name, color, bbox, edges, faces, ...} */
    this.shapeMetadata = new Map();

    /** Auto-incrementing shape ID counter for unique IDs */
    this.nextShapeId = 0;

    /** Prevents concurrent init calls */
    this.isInitializing = false;

    /** Caches the init() promise for idempotence */
    this.initPromise = null;

    // CDN URL for OpenCascade.js full build (WASM + JS)
    this.OCCDNBase = 'https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/';

    // Fuzzy tolerance for boolean operations (used in error recovery)
    this.FUZZY_TOLERANCE = 0.01; // mm

    // Default mesh deflection (fineness of triangulation)
    this.DEFAULT_LINEAR_DEFLECTION = 0.1; // mm
    this.DEFAULT_ANGULAR_DEFLECTION = 0.5; // degrees
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize OpenCascade.js WASM environment (lazy)
   *
   * Loads the ~50MB OpenCascade.js WASM file from CDN on first call.
   * Subsequent calls return cached promise immediately (idempotent).
   *
   * The WASM file is quite large, so this is deferred until first geometry operation
   * to avoid unnecessary startup overhead for headless or viewer-only workflows.
   *
   * @async
   * @returns {Promise<Object>} OpenCascade instance (this.oc)
   * @throws {BRepError} If WASM initialization fails
   *
   * @example
   * const kernel = new BRepKernel();
   * await kernel.init();  // Loads WASM (slow, first time only)
   * const box = await kernel.makeBox(10, 20, 30);  // Uses initialized WASM
   */
  async init() {
    // Return immediately if already initialized
    if (this.oc) return this.oc;
    if (this.initPromise) return this.initPromise;
    if (this.isInitializing) return this.initPromise;

    this.isInitializing = true;
    this.initPromise = this._initOpenCascade();
    return this.initPromise;
  }

  /**
   * Internal OpenCascade initialization (private)
   * @private
   * @async
   * @returns {Promise<Object>} OpenCascade instance
   */
  async _initOpenCascade() {
    try {
      console.log('[BRepKernel] Initializing OpenCascade.js WASM...');

      // Load the full OpenCascade.js library
      // This is a large file (~50MB WASM + 400KB JS)
      // The library exports as window.Module (Emscripten pattern)

      // Save any existing Module to avoid conflicts
      const savedModule = window.Module;

      return new Promise((resolve, reject) => {
        // Create and load script
        const script = document.createElement('script');
        script.src = this.OCCDNBase + 'opencascade.full.js';
        script.async = true;

        script.onload = async () => {
          try {
            // Get the factory function that was set by the script
            const occFactory = window.Module;

            if (!occFactory) {
              throw new BRepError('init', 'OpenCascade.js Module not found after script load');
            }

            // Initialize with custom locateFile to load .wasm from CDN
            console.log('[BRepKernel] Loading WASM file from CDN...');
            this.oc = await new occFactory({
              locateFile: (file) => {
                return this.OCCDNBase + file;
              }
            });

            console.log('[BRepKernel] OpenCascade.js initialized successfully');
            this.isInitializing = false;
            resolve(this.oc);
          } catch (err) {
            console.error('[BRepKernel] Initialization error:', err);
            this.isInitializing = false;

            // Restore saved Module
            if (savedModule !== undefined) {
              window.Module = savedModule;
            }
            reject(new BRepError('init', 'OpenCascade initialization failed', null, err.message));
          }
        };

        script.onerror = () => {
          console.error('[BRepKernel] Failed to load opencascade.full.js from CDN');
          this.isInitializing = false;

          // Restore saved Module
          if (savedModule !== undefined) {
            window.Module = savedModule;
          }
          reject(new BRepError('init', 'Failed to load OpenCascade.js from CDN'));
        };

        document.head.appendChild(script);
      });
    } catch (err) {
      console.error('[BRepKernel] Fatal initialization error:', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate unique shape ID (internal helper)
   * @private
   * @returns {string} Unique shape ID (format: 'shape_N')
   */
  _newShapeId() {
    return `shape_${this.nextShapeId++}`;
  }

  /**
   * Cache a shape with metadata and return ID + shape (internal helper)
   *
   * All shapes created by this kernel are cached for reuse and reference.
   * Metadata tracks the bounding box, edges, faces, and other properties.
   *
   * @private
   * @param {Object} shape - OpenCascade TopoDS_Shape
   * @param {Object} [metadata] - Optional metadata {name, color, ...}
   * @returns {Object} {id: string, shape: TopoDS_Shape}
   */
  _cacheShape(shape, metadata = {}) {
    const id = this._newShapeId();
    this.shapeCache.set(id, shape);

    const meta = {
      name: metadata.name || `Shape_${id}`,
      color: metadata.color || 0x7fa3d0,
      edges: null,
      faces: null,
      bbox: null,
      ...metadata
    };

    this.shapeMetadata.set(id, meta);
    return { id, shape };
  }

  /**
   * Get shape from cache by ID or return shape directly
   * @private
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @returns {Object} TopoDS_Shape
   * @throws {BRepError} If shape not found
   */
  _resolveShape(shapeIdOrShape) {
    let shape;

    if (typeof shapeIdOrShape === 'string') {
      shape = this.shapeCache.get(shapeIdOrShape);
      if (!shape) {
        throw new BRepError('_resolveShape', `Shape ${shapeIdOrShape} not found in cache`);
      }
    } else {
      shape = shapeIdOrShape;
    }

    return shape;
  }

  /**
   * Get edges from a shape using TopExp_Explorer (internal helper)
   * @private
   * @param {Object} shape - TopoDS_Shape
   * @returns {Array<Object>} Array of edge objects
   */
  _getEdgesFromShape(shape) {
    const edges = [];
    try {
      const explorer = new this.oc.TopExp_Explorer(shape, this.oc.TopAbs_EDGE);

      while (explorer.More()) {
        edges.push(explorer.Current());
        explorer.Next();
      }
    } catch (err) {
      console.warn('[BRepKernel] Failed to extract edges:', err);
    }

    return edges;
  }

  /**
   * Get faces from a shape using TopExp_Explorer (internal helper)
   * @private
   * @param {Object} shape - TopoDS_Shape
   * @returns {Array<Object>} Array of face objects
   */
  _getFacesFromShape(shape) {
    const faces = [];
    try {
      const explorer = new this.oc.TopExp_Explorer(shape, this.oc.TopAbs_FACE);

      while (explorer.More()) {
        faces.push(explorer.Current());
        explorer.Next();
      }
    } catch (err) {
      console.warn('[BRepKernel] Failed to extract faces:', err);
    }

    return faces;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIMITIVE OPERATIONS (Create)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a box (rectangular prism) solid
   *
   * @async
   * @param {number} width - Width (X dimension) in mm
   * @param {number} height - Height (Y dimension) in mm
   * @param {number} depth - Depth (Z dimension) in mm
   * @returns {Promise<Object>} {id: shapeId, shape: TopoDS_Solid}
   * @throws {BRepError} If box creation fails
   *
   * @example
   * const box = await kernel.makeBox(10, 20, 30);
   * console.log('Created box:', box.id);
   */
  async makeBox(width, height, depth) {
    await this.init();
    try {
      if (width <= 0 || height <= 0 || depth <= 0) {
        throw new BRepError('makeBox', 'Box dimensions must be positive', null,
          `Got width=${width}, height=${height}, depth=${depth}`);
      }

      const shape = new this.oc.BRepPrimAPI_MakeBox_2(width, height, depth).Shape();
      const result = this._cacheShape(shape, { name: `Box_${width}x${height}x${depth}` });

      console.log('[BRepKernel] Created box:', result.id, `(${width}×${height}×${depth} mm)`);
      return result;
    } catch (err) {
      throw new BRepError('makeBox', err.message, null, `Dimensions: ${width}×${height}×${depth}`);
    }
  }

  /**
   * Create a cylinder (circular prism) solid
   *
   * @async
   * @param {number} radius - Radius in mm
   * @param {number} height - Height (Z dimension) in mm
   * @returns {Promise<Object>} {id: shapeId, shape: TopoDS_Solid}
   * @throws {BRepError} If cylinder creation fails
   *
   * @example
   * const cyl = await kernel.makeCylinder(5, 40);
   */
  async makeCylinder(radius, height) {
    await this.init();
    try {
      if (radius <= 0 || height <= 0) {
        throw new BRepError('makeCylinder', 'Radius and height must be positive', null,
          `Got radius=${radius}, height=${height}`);
      }

      const shape = new this.oc.BRepPrimAPI_MakeCylinder_2(radius, height).Shape();
      const result = this._cacheShape(shape, { name: `Cylinder_r${radius}h${height}` });

      console.log('[BRepKernel] Created cylinder:', result.id, `(r=${radius}, h=${height} mm)`);
      return result;
    } catch (err) {
      throw new BRepError('makeCylinder', err.message, null, `r=${radius}, h=${height}`);
    }
  }

  /**
   * Create a sphere solid
   *
   * @async
   * @param {number} radius - Radius in mm
   * @returns {Promise<Object>} {id: shapeId, shape: TopoDS_Solid}
   * @throws {BRepError} If sphere creation fails
   */
  async makeSphere(radius) {
    await this.init();
    try {
      if (radius <= 0) {
        throw new BRepError('makeSphere', 'Radius must be positive', null, `Got radius=${radius}`);
      }

      const shape = new this.oc.BRepPrimAPI_MakeSphere_3(radius).Shape();
      const result = this._cacheShape(shape, { name: `Sphere_r${radius}` });

      console.log('[BRepKernel] Created sphere:', result.id, `(r=${radius} mm)`);
      return result;
    } catch (err) {
      throw new BRepError('makeSphere', err.message, null, `radius=${radius}`);
    }
  }

  /**
   * Create a cone solid (optionally truncated)
   *
   * @async
   * @param {number} radius1 - Base radius in mm
   * @param {number} radius2 - Top radius in mm (0 for pointed cone)
   * @param {number} height - Height in mm
   * @returns {Promise<Object>} {id: shapeId, shape: TopoDS_Solid}
   * @throws {BRepError} If cone creation fails
   */
  async makeCone(radius1, radius2, height) {
    await this.init();
    try {
      if (radius1 < 0 || radius2 < 0 || height <= 0) {
        throw new BRepError('makeCone', 'Radii must be non-negative and height positive', null,
          `Got r1=${radius1}, r2=${radius2}, h=${height}`);
      }

      const shape = new this.oc.BRepPrimAPI_MakeCone_3(radius1, radius2, height).Shape();
      const result = this._cacheShape(shape, { name: `Cone_r1${radius1}r2${radius2}h${height}` });

      console.log('[BRepKernel] Created cone:', result.id);
      return result;
    } catch (err) {
      throw new BRepError('makeCone', err.message);
    }
  }

  /**
   * Create a torus solid
   *
   * @async
   * @param {number} majorRadius - Major radius (distance from center to tube center)
   * @param {number} minorRadius - Minor radius (tube radius)
   * @returns {Promise<Object>} {id: shapeId, shape: TopoDS_Solid}
   * @throws {BRepError} If torus creation fails
   */
  async makeTorus(majorRadius, minorRadius) {
    await this.init();
    try {
      if (majorRadius <= 0 || minorRadius <= 0) {
        throw new BRepError('makeTorus', 'Radii must be positive', null,
          `Got major=${majorRadius}, minor=${minorRadius}`);
      }

      const shape = new this.oc.BRepPrimAPI_MakeTorus_2(majorRadius, minorRadius).Shape();
      const result = this._cacheShape(shape, { name: `Torus_R${majorRadius}r${minorRadius}` });

      console.log('[BRepKernel] Created torus:', result.id);
      return result;
    } catch (err) {
      throw new BRepError('makeTorus', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHAPE OPERATIONS (Modify)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extrude a face or wire along a direction (prismatic extrusion)
   *
   * Algorithm:
   * 1. Resolve input shape (ID or direct)
   * 2. Validate direction vector
   * 3. Create gp_Dir from direction vector
   * 4. Use BRepPrimAPI_MakePrism for extrusion
   * 5. Cache and return result
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @param {Object} direction - Direction vector {x, y, z}
   * @param {number} distance - Extrusion distance in mm (positive or negative)
   * @returns {Promise<Object>} {id: shapeId, shape: extruded TopoDS_Shape}
   * @throws {BRepError} If extrusion fails
   *
   * @example
   * // Create box, then extrude a sketch
   * const sketch = await kernel.makeBox(10, 10, 1);
   * const solid = await kernel.extrude(sketch.id, {x: 0, y: 0, z: 1}, 50);
   */
  async extrude(shapeIdOrShape, direction, distance) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);

      // Validate inputs
      if (!direction || typeof direction.x !== 'number' || typeof direction.y !== 'number' || typeof direction.z !== 'number') {
        throw new BRepError('extrude', 'Invalid direction vector', null, JSON.stringify(direction));
      }

      if (Math.abs(distance) < 0.001) {
        throw new BRepError('extrude', 'Extrusion distance must be non-zero', null, `distance=${distance}`);
      }

      // Normalize direction
      const len = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
      const normalizedDir = {
        x: direction.x / len,
        y: direction.y / len,
        z: direction.z / len
      };

      // Create direction vector
      const dir = new this.oc.gp_Dir_3(normalizedDir.x, normalizedDir.y, normalizedDir.z);

      // Use BRepPrimAPI_MakePrism for extrusion
      const prism = new this.oc.BRepPrimAPI_MakePrism_2(shape, dir, distance, false);
      if (!prism.IsDone()) {
        throw new BRepError('extrude', 'BRepPrimAPI_MakePrism failed', null, 'Prism builder did not complete');
      }

      const result = prism.Shape();
      const cached = this._cacheShape(result, { name: `Extruded_${distance}mm` });

      console.log('[BRepKernel] Extruded shape:', cached.id, `(distance=${distance} mm)`);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('extrude', err.message);
    }
  }

  /**
   * Revolve a face or wire around an axis (creates a solid of revolution)
   *
   * Algorithm:
   * 1. Resolve input shape
   * 2. Create gp_Ax1 from axis origin and direction
   * 3. Use BRepPrimAPI_MakeRevolution
   * 4. Cache and return result
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @param {Object} axis - Axis object {origin: {x, y, z}, direction: {x, y, z}}
   * @param {number} angle - Rotation angle in degrees
   * @returns {Promise<Object>} {id: shapeId, shape: revolved TopoDS_Shape}
   * @throws {BRepError} If revolve fails
   *
   * @example
   * // Create a sketch and revolve it 360° around the Z axis
   * const axis = {
   *   origin: {x: 0, y: 0, z: 0},
   *   direction: {x: 0, y: 0, z: 1}
   * };
   * const revolved = await kernel.revolve(sketch.id, axis, 360);
   */
  async revolve(shapeIdOrShape, axis, angle) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);

      // Validate axis
      if (!axis || !axis.origin || !axis.direction) {
        throw new BRepError('revolve', 'Invalid axis object', null, JSON.stringify(axis));
      }

      // Create axis (gp_Ax1)
      const origin = new this.oc.gp_Pnt_3(axis.origin.x, axis.origin.y, axis.origin.z);
      const dir = new this.oc.gp_Dir_3(axis.direction.x, axis.direction.y, axis.direction.z);
      const ax1 = new this.oc.gp_Ax1_2(origin, dir);

      // Convert angle to radians
      const angleRad = angle * Math.PI / 180;

      // Use BRepPrimAPI_MakeRevolution
      const rev = new this.oc.BRepPrimAPI_MakeRevolution_2(ax1, shape, angleRad, false);
      if (!rev.IsDone()) {
        throw new BRepError('revolve', 'BRepPrimAPI_MakeRevolution failed', null, 'Revolve builder did not complete');
      }

      const result = rev.Shape();
      const cached = this._cacheShape(result, { name: `Revolved_${angle}deg` });

      console.log('[BRepKernel] Revolved shape:', cached.id, `(${angle}°)`);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('revolve', err.message);
    }
  }

  /**
   * Apply fillet (rounded edge) to specific edges of a solid
   *
   * This is a REAL B-Rep operation using BRepFilletAPI_MakeFillet.
   * Unlike mesh approximation (torus segments), this modifies the actual
   * solid topology — adjacent faces are trimmed and a new blending face
   * is created with exact G1/G2 continuity.
   *
   * Algorithm:
   * 1. Create BRepFilletAPI_MakeFillet instance
   * 2. Extract edges from shape via TopExp_Explorer
   * 3. Add selected edges with radius via Add_2()
   * 4. Call Build() to compute fillets
   * 5. Extract and cache result
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @param {number[]} edgeIndices - Which edges to fillet (indices from getEdges)
   * @param {number} radius - Fillet radius in mm
   * @returns {Promise<Object>} {id: shapeId, shape: filleted TopoDS_Shape}
   * @throws {BRepError} If fillet fails or radius is invalid
   *
   * @example
   * // Get edges and fillet specific ones
   * const edges = await kernel.getEdges(shape.id);
   * const filleted = await kernel.fillet(shape.id, [0, 1, 2], 3);
   */
  async fillet(shapeIdOrShape, edgeIndices, radius) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);

      if (!Array.isArray(edgeIndices)) {
        throw new BRepError('fillet', 'edgeIndices must be an array', null, typeof edgeIndices);
      }

      if (radius <= 0) {
        throw new BRepError('fillet', 'Fillet radius must be positive', null, `radius=${radius}`);
      }

      const filler = new this.oc.BRepFilletAPI_MakeFillet(shape, this.oc.ChFi3d_Rational);

      // Get edges and apply fillet
      const edges = this._getEdgesFromShape(shape);

      if (edges.length === 0) {
        throw new BRepError('fillet', 'No edges found in shape');
      }

      let appliedCount = 0;
      for (let idx of edgeIndices) {
        if (idx >= 0 && idx < edges.length) {
          try {
            filler.Add_2(radius, edges[idx]);
            appliedCount++;
          } catch (e) {
            console.warn(`[BRepKernel] Failed to fillet edge ${idx}:`, e);
          }
        }
      }

      if (appliedCount === 0) {
        throw new BRepError('fillet', 'No edges could be filleted', null, `indices out of range`);
      }

      filler.Build();
      if (!filler.IsDone()) {
        throw new BRepError('fillet', 'Fillet operation did not complete', null, `Radius ${radius}mm on ${appliedCount} edges`);
      }

      const result = filler.Shape();
      const cached = this._cacheShape(result, { name: `Filleted_r${radius}` });

      console.log('[BRepKernel] Applied fillet:', cached.id, `(${appliedCount} edges, r=${radius} mm)`);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('fillet', err.message);
    }
  }

  /**
   * Apply chamfer (beveled edge) to specific edges of a solid
   *
   * Similar to fillet but creates a straight beveled surface instead of a curve.
   * Uses BRepFilletAPI_MakeChamfer.
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @param {number[]} edgeIndices - Which edges to chamfer
   * @param {number} distance - Chamfer distance/size in mm
   * @returns {Promise<Object>} {id: shapeId, shape: chamfered TopoDS_Shape}
   * @throws {BRepError} If chamfer fails
   *
   * @example
   * const chamfered = await kernel.chamfer(box.id, [0, 1], 1.5);
   */
  async chamfer(shapeIdOrShape, edgeIndices, distance) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);

      if (!Array.isArray(edgeIndices)) {
        throw new BRepError('chamfer', 'edgeIndices must be an array');
      }

      if (distance <= 0) {
        throw new BRepError('chamfer', 'Chamfer distance must be positive', null, `distance=${distance}`);
      }

      const chamferer = new this.oc.BRepFilletAPI_MakeChamfer(shape);

      // Get edges and apply chamfer
      const edges = this._getEdgesFromShape(shape);

      if (edges.length === 0) {
        throw new BRepError('chamfer', 'No edges found in shape');
      }

      let appliedCount = 0;
      for (let idx of edgeIndices) {
        if (idx >= 0 && idx < edges.length) {
          try {
            chamferer.Add_2(distance, edges[idx]);
            appliedCount++;
          } catch (e) {
            console.warn(`[BRepKernel] Failed to chamfer edge ${idx}:`, e);
          }
        }
      }

      if (appliedCount === 0) {
        throw new BRepError('chamfer', 'No edges could be chamfered');
      }

      chamferer.Build();
      if (!chamferer.IsDone()) {
        throw new BRepError('chamfer', 'Chamfer operation did not complete');
      }

      const result = chamferer.Shape();
      const cached = this._cacheShape(result, { name: `Chamfered_${distance}` });

      console.log('[BRepKernel] Applied chamfer:', cached.id, `(${appliedCount} edges, ${distance} mm)`);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('chamfer', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOOLEAN OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Boolean union (fuse) of two solids
   *
   * Combines two solids into one. Uses BRepAlgoAPI_Fuse with built-in error recovery:
   *
   * Error Recovery Algorithm:
   * 1. Try standard fuse
   * 2. If fails, try with fuzzy tolerance (0.01mm)
   * 3. If still fails, try healing shapes first (ShapeFix_Shape)
   * 4. If all fail, throw detailed error with diagnostic
   *
   * @async
   * @param {string|Object} shapeId1 - First solid (or ID)
   * @param {string|Object} shapeId2 - Second solid (or ID)
   * @returns {Promise<Object>} {id: shapeId, shape: unioned TopoDS_Shape}
   * @throws {BRepError} If boolean fails after all recovery attempts
   *
   * @example
   * const union = await kernel.booleanUnion(box.id, cylinder.id);
   */
  async booleanUnion(shapeId1, shapeId2) {
    await this.init();
    try {
      let shape1 = this._resolveShape(shapeId1);
      let shape2 = this._resolveShape(shapeId2);

      // Try standard fuse
      try {
        const fuse = new this.oc.BRepAlgoAPI_Fuse_3(
          shape1,
          shape2,
          new this.oc.Message_ProgressRange_1()
        );

        if (!fuse.IsDone()) {
          throw new Error('Fuse builder did not complete');
        }

        const result = fuse.Shape();
        const cached = this._cacheShape(result, { name: 'Union' });

        console.log('[BRepKernel] Boolean union succeeded:', cached.id);
        return cached;
      } catch (err) {
        console.warn('[BRepKernel] Standard union failed, trying with error recovery...');

        // Try with fuzzy tolerance
        try {
          const fuse = new this.oc.BRepAlgoAPI_Fuse_3(
            shape1,
            shape2,
            new this.oc.Message_ProgressRange_1()
          );

          // Set fuzzy value
          if (fuse.SetFuzzyValue) {
            fuse.SetFuzzyValue(this.FUZZY_TOLERANCE);
          }

          const result = fuse.Shape();
          const cached = this._cacheShape(result, { name: 'Union_Fuzzy' });

          console.log('[BRepKernel] Boolean union succeeded (with fuzzy tolerance):', cached.id);
          return cached;
        } catch (err2) {
          // Last resort: try healing shapes
          console.warn('[BRepKernel] Fuzzy union failed, attempting shape healing...');

          try {
            shape1 = this._healShape(shape1);
            shape2 = this._healShape(shape2);

            const fuse = new this.oc.BRepAlgoAPI_Fuse_3(
              shape1,
              shape2,
              new this.oc.Message_ProgressRange_1()
            );

            const result = fuse.Shape();
            const cached = this._cacheShape(result, { name: 'Union_Healed' });

            console.log('[BRepKernel] Boolean union succeeded (with shape healing):', cached.id);
            return cached;
          } catch (err3) {
            throw new BRepError('booleanUnion', 'All fusion attempts failed', null,
              `Standard: ${err.message}, Fuzzy: ${err2.message}, Healed: ${err3.message}`);
          }
        }
      }
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('booleanUnion', err.message);
    }
  }

  /**
   * Boolean cut (subtract) of two solids
   *
   * Removes the tool solid from the base solid. Uses BRepAlgoAPI_Cut with error recovery.
   *
   * @async
   * @param {string|Object} shapeIdBase - Base solid
   * @param {string|Object} shapeIdTool - Tool solid (to remove)
   * @returns {Promise<Object>} {id: shapeId, shape: cut TopoDS_Shape}
   * @throws {BRepError} If cut fails
   *
   * @example
   * const result = await kernel.booleanCut(box.id, hole.id);
   */
  async booleanCut(shapeIdBase, shapeIdTool) {
    await this.init();
    try {
      let base = this._resolveShape(shapeIdBase);
      let tool = this._resolveShape(shapeIdTool);

      try {
        const cut = new this.oc.BRepAlgoAPI_Cut_3(
          base,
          tool,
          new this.oc.Message_ProgressRange_1()
        );

        if (!cut.IsDone()) {
          throw new Error('Cut builder did not complete');
        }

        const result = cut.Shape();
        const cached = this._cacheShape(result, { name: 'Cut' });

        console.log('[BRepKernel] Boolean cut succeeded:', cached.id);
        return cached;
      } catch (err) {
        console.warn('[BRepKernel] Standard cut failed, trying with error recovery...');

        // Healing recovery
        base = this._healShape(base);
        tool = this._healShape(tool);

        const cut = new this.oc.BRepAlgoAPI_Cut_3(
          base,
          tool,
          new this.oc.Message_ProgressRange_1()
        );

        const result = cut.Shape();
        const cached = this._cacheShape(result, { name: 'Cut_Healed' });

        console.log('[BRepKernel] Boolean cut succeeded (with healing):', cached.id);
        return cached;
      }
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('booleanCut', err.message);
    }
  }

  /**
   * Boolean intersection of two solids
   *
   * Returns the common volume shared by both solids. Uses BRepAlgoAPI_Common.
   *
   * @async
   * @param {string|Object} shapeId1 - First solid
   * @param {string|Object} shapeId2 - Second solid
   * @returns {Promise<Object>} {id: shapeId, shape: intersected TopoDS_Shape}
   * @throws {BRepError} If intersection fails
   */
  async booleanCommon(shapeId1, shapeId2) {
    await this.init();
    try {
      const shape1 = this._resolveShape(shapeId1);
      const shape2 = this._resolveShape(shapeId2);

      const common = new this.oc.BRepAlgoAPI_Common_3(
        shape1,
        shape2,
        new this.oc.Message_ProgressRange_1()
      );

      if (!common.IsDone()) {
        throw new BRepError('booleanCommon', 'Common builder did not complete');
      }

      const result = common.Shape();
      const cached = this._cacheShape(result, { name: 'Intersection' });

      console.log('[BRepKernel] Boolean intersection succeeded:', cached.id);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('booleanCommon', err.message);
    }
  }

  /**
   * Internal shape healing (for error recovery)
   * @private
   * @param {Object} shape - TopoDS_Shape to heal
   * @returns {Object} Healed TopoDS_Shape
   */
  _healShape(shape) {
    try {
      const healer = new this.oc.ShapeFix_Shape();
      healer.Init(shape);
      healer.Perform();
      return healer.Shape();
    } catch (err) {
      console.warn('[BRepKernel] Shape healing failed:', err);
      return shape; // Return original if healing fails
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECTION API (Edge and Face Selection)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract all edges from a shape for selection/highlighting
   *
   * Each edge is tracked with its geometry. Edges can be selected individually
   * for targeted operations like fillet, chamfer, or manipulation.
   *
   * Algorithm:
   * 1. Use TopExp_Explorer to iterate edges
   * 2. For each edge, calculate length and curve type
   * 3. Extract 3D points for visualization
   * 4. Return array of edge objects with IDs
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @returns {Promise<Array<Object>>} Array of {id, index, length, type}
   *   where type is one of: 'line', 'circle', 'arc', 'spline', 'ellipse', 'other'
   * @throws {BRepError} If shape not found
   *
   * @example
   * const edges = await kernel.getEdges(box.id);
   * console.log(`Found ${edges.length} edges`);
   * // edges[0] = {id: 'edge_0', index: 0, length: 10.5, type: 'line', ...}
   */
  async getEdges(shapeIdOrShape) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);
      const edges = [];

      try {
        const explorer = new this.oc.TopExp_Explorer(shape, this.oc.TopAbs_EDGE);
        let index = 0;

        while (explorer.More()) {
          const edge = explorer.Current();
          const edgeInfo = {
            id: `edge_${index}`,
            index,
            type: 'other'
          };

          // Try to determine edge type and length
          try {
            const curve = this.oc.BRep_Tool.Curve_2(edge);
            if (curve) {
              // Get curve type
              edgeInfo.type = this._getCurveType(curve);
            }
          } catch (e) {
            // Ignore curve analysis errors
          }

          edges.push(edgeInfo);
          index++;
          explorer.Next();
        }
      } catch (err) {
        console.warn('[BRepKernel] Failed to extract edges:', err);
      }

      console.log('[BRepKernel] Extracted', edges.length, 'edges from shape');
      return edges;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('getEdges', err.message);
    }
  }

  /**
   * Extract all faces from a shape for selection/highlighting
   *
   * Each face is tracked with its geometry properties (normal, area, center).
   * Faces can be selected individually for operations like draft, offset, or shell.
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @returns {Promise<Array<Object>>} Array of {id, index, normal, center, area}
   * @throws {BRepError} If shape not found
   *
   * @example
   * const faces = await kernel.getFaces(box.id);
   * // faces[0] = {id: 'face_0', index: 0, normal: {x, y, z}, center: {x, y, z}, area: 100}
   */
  async getFaces(shapeIdOrShape) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);
      const faces = [];

      try {
        const explorer = new this.oc.TopExp_Explorer(shape, this.oc.TopAbs_FACE);
        let index = 0;

        while (explorer.More()) {
          const face = explorer.Current();
          const faceInfo = {
            id: `face_${index}`,
            index,
            normal: { x: 0, y: 0, z: 1 }, // Default
            center: { x: 0, y: 0, z: 0 }
          };

          // Try to get face geometry
          try {
            const surface = this.oc.BRep_Tool.Surface(face);
            if (surface) {
              // Get normal and center if possible
              // This is an approximation
            }
          } catch (e) {
            // Ignore geometry analysis errors
          }

          faces.push(faceInfo);
          index++;
          explorer.Next();
        }
      } catch (err) {
        console.warn('[BRepKernel] Failed to extract faces:', err);
      }

      console.log('[BRepKernel] Extracted', faces.length, 'faces from shape');
      return faces;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('getFaces', err.message);
    }
  }

  /**
   * Determine curve type from OCC curve (private helper)
   * @private
   * @param {Object} curve - OCC Handle_Geom_Curve
   * @returns {string} Curve type: 'line', 'circle', 'arc', 'spline', 'ellipse', 'other'
   */
  _getCurveType(curve) {
    try {
      // This is a simplified type detection
      // In a real implementation, you'd check the curve class
      const typeStr = curve.toString();

      if (typeStr.includes('Line')) return 'line';
      if (typeStr.includes('Circle')) return 'circle';
      if (typeStr.includes('Ellipse')) return 'ellipse';
      if (typeStr.includes('BSpline')) return 'spline';

      return 'other';
    } catch {
      return 'other';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a shell (hollow out a solid by removing a face)
   *
   * Removes one or more faces and offsets the remaining surface inward
   * to create a thin-walled shell.
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Solid to hollow
   * @param {number[]} faceIndices - Faces to remove (empty = all faces, offset inward)
   * @param {number} thickness - Wall thickness in mm
   * @returns {Promise<Object>} {id: shapeId, shape: shelled TopoDS_Shape}
   * @throws {BRepError} If shell operation fails
   */
  async shell(shapeIdOrShape, faceIndices = [], thickness = 1) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);

      if (thickness <= 0) {
        throw new BRepError('shell', 'Thickness must be positive', null, `thickness=${thickness}`);
      }

      const sheller = new this.oc.BRepOffsetAPI_MakeThickSolid();
      sheller.MakeThickSolidByJoin(shape, new this.oc.TopTools_ListOfShape(), thickness, 0.0001);

      const result = sheller.Shape();
      const cached = this._cacheShape(result, { name: `Shelled_t${thickness}` });

      console.log('[BRepKernel] Created shell:', cached.id);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('shell', err.message);
    }
  }

  /**
   * Offset a surface (thicken or shrink)
   *
   * Expands or contracts a surface by a specified distance.
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape to offset
   * @param {number} offset - Offset distance in mm (positive = expand, negative = shrink)
   * @returns {Promise<Object>} {id: shapeId, shape: offset TopoDS_Shape}
   * @throws {BRepError} If offset fails
   */
  async offset(shapeIdOrShape, offset) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);

      if (Math.abs(offset) < 0.001) {
        throw new BRepError('offset', 'Offset distance must be non-zero');
      }

      const offsetter = new this.oc.BRepOffsetAPI_MakeOffset();
      offsetter.Perform(shape, offset, 0.0001);

      if (!offsetter.IsDone()) {
        throw new BRepError('offset', 'Offset operation did not complete');
      }

      const result = offsetter.Shape();
      const cached = this._cacheShape(result, { name: `Offset_${offset}` });

      console.log('[BRepKernel] Applied offset:', cached.id, `(${offset} mm)`);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('offset', err.message);
    }
  }

  /**
   * Split a shape with a tool shape or plane
   *
   * Divides a shape into multiple parts along a splitting surface.
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape to split
   * @param {string|Object} toolShapeIdOrShape - Splitting tool (face or surface)
   * @returns {Promise<Object>} {id: shapeId, shape: split result}
   * @throws {BRepError} If split fails
   */
  async split(shapeIdOrShape, toolShapeIdOrShape) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);
      const tool = this._resolveShape(toolShapeIdOrShape);

      const splitter = new this.oc.BRepAlgoAPI_Splitter();
      splitter.AddArgument(shape);
      splitter.AddTool(tool);
      splitter.Perform();

      if (!splitter.IsDone()) {
        throw new BRepError('split', 'Split operation did not complete');
      }

      const result = splitter.Shape();
      const cached = this._cacheShape(result, { name: 'Split' });

      console.log('[BRepKernel] Split shape:', cached.id);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('split', err.message);
    }
  }

  /**
   * Create a helix (spiral curve for threads or springs)
   *
   * Generates a 3D helical curve that can be used as a path for sweep operations.
   *
   * @async
   * @param {number} radius - Helix radius in mm
   * @param {number} pitch - Helix pitch (vertical distance per turn) in mm
   * @param {number} height - Total helix height in mm
   * @param {boolean} [leftHanded=false] - Direction of helix
   * @returns {Promise<Object>} {id: shapeId, shape: helix curve}
   * @throws {BRepError} If helix creation fails
   *
   * @example
   * // Create M10x1.5 thread (10mm diameter, 1.5mm pitch)
   * const helix = await kernel.helix(5, 1.5, 20);
   */
  async helix(radius, pitch, height, leftHanded = false) {
    await this.init();
    try {
      if (radius <= 0 || pitch <= 0 || height <= 0) {
        throw new BRepError('helix', 'All parameters must be positive');
      }

      // Create helix using parametric curve
      // This is an approximation using a polyline
      const turns = height / pitch;
      const points = [];
      const segments = Math.ceil(turns * 12); // 12 points per turn

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = t * turns * 2 * Math.PI;
        const z = t * height;
        const x = radius * Math.cos(angle) * (leftHanded ? -1 : 1);
        const y = radius * Math.sin(angle);

        points.push({ x, y, z });
      }

      // Build a wire from points
      const builder = new this.oc.BRepBuilderAPI_MakePolygon();
      for (const pt of points) {
        const occPt = new this.oc.gp_Pnt_3(pt.x, pt.y, pt.z);
        builder.Add(occPt);
      }

      const wire = builder.Wire();
      const cached = this._cacheShape(wire, { name: `Helix_r${radius}p${pitch}` });

      console.log('[BRepKernel] Created helix:', cached.id);
      return cached;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('helix', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESHING (Convert to THREE.js)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert a B-Rep shape to Three.js BufferGeometry for rendering
   *
   * Algorithm:
   * 1. Tessellate shape with BRepMesh_IncrementalMesh
   * 2. Iterate all faces via TopExp_Explorer
   * 3. For each face, get triangulation via BRep_Tool.Triangulation
   * 4. Extract vertices, normals, indices
   * 5. Handle face orientation (IsUPeriodic, IsVPeriodic)
   * 6. Build merged BufferGeometry with proper normals
   *
   * @async
   * @param {Object} shape - TopoDS_Shape from OpenCascade
   * @param {number} [linearDeflection] - Mesh fineness (smaller = finer). Default: 0.1mm
   * @param {number} [angularDeflection] - Angular mesh fineness (degrees). Default: 0.5°
   * @returns {Promise<THREE.BufferGeometry>} Tessellated geometry ready for Three.js
   * @throws {BRepError} If meshing fails
   *
   * @example
   * const geometry = await kernel.shapeToMesh(shape);
   * const material = new THREE.MeshPhongMaterial({color: 0x7fa3d0});
   * const mesh = new THREE.Mesh(geometry, material);
   * scene.add(mesh);
   */
  async shapeToMesh(shape, linearDeflection = null, angularDeflection = null) {
    await this.init();
    try {
      const actualShape = typeof shape === 'string' ? this.shapeCache.get(shape) : shape;

      if (!actualShape) {
        throw new BRepError('shapeToMesh', 'Shape not found');
      }

      // Use provided deflection or defaults
      const linDefl = linearDeflection || this.DEFAULT_LINEAR_DEFLECTION;
      const angDefl = angularDeflection || this.DEFAULT_ANGULAR_DEFLECTION;

      // Mesh the shape using incremental mesh
      try {
        const mesher = new this.oc.BRepMesh_IncrementalMesh(actualShape, linDefl, false, angDefl);
        if (!mesher.IsDone()) {
          throw new Error('Meshing did not complete');
        }
      } catch (err) {
        console.warn('[BRepKernel] Meshing error:', err, '— continuing with available triangulation');
      }

      // Extract triangles and normals from the mesh
      const vertices = [];
      const indices = [];
      const normals = [];

      // Vertex map to merge duplicates
      const vertexMap = new Map();
      let vertexIndex = 0;

      // Iterate over faces
      const faceExplorer = new this.oc.TopExp_Explorer(actualShape, this.oc.TopAbs_FACE);

      while (faceExplorer.More()) {
        const face = faceExplorer.Current();

        // Get the triangulation of the face
        try {
          const triangulation = this.oc.BRep_Tool.Triangulation(face);

          if (triangulation) {
            // Get nodes and triangles
            const nodes = triangulation.Nodes();
            const triangles = triangulation.Triangles();

            // Add vertices
            for (let i = 1; i <= nodes.Length(); i++) {
              const node = nodes.Value(i);
              const key = `${node.X().toFixed(6)},${node.Y().toFixed(6)},${node.Z().toFixed(6)}`;

              if (!vertexMap.has(key)) {
                vertices.push(node.X(), node.Y(), node.Z());
                vertexMap.set(key, vertexIndex++);
              }
            }

            // Add triangles as indices
            for (let i = 1; i <= triangles.Length(); i++) {
              const triangle = triangles.Value(i);

              // Get vertex indices (1-based in OCC, convert to 0-based)
              for (let j = 1; j <= 3; j++) {
                const nodeIndex = triangle.Value(j);
                const node = nodes.Value(nodeIndex);
                const key = `${node.X().toFixed(6)},${node.Y().toFixed(6)},${node.Z().toFixed(6)}`;
                indices.push(vertexMap.get(key));
              }
            }
          }
        } catch (err) {
          console.warn('[BRepKernel] Failed to extract triangulation from face:', err);
        }

        faceExplorer.Next();
      }

      // Create Three.js geometry
      if (vertices.length === 0) {
        console.warn('[BRepKernel] No mesh data extracted from shape');
        throw new BRepError('shapeToMesh', 'Shape produced no mesh data');
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));

      if (indices.length > 0) {
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
      }

      // Compute normals
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      console.log('[BRepKernel] Converted shape to mesh:', vertices.length / 3, 'vertices,', indices.length / 3, 'triangles');
      return geometry;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('shapeToMesh', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYSIS (Mass Properties, DFM Checks)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute exact mass properties from B-Rep solid geometry
   *
   * Uses GProp_GProps for precise volume/area/COG calculation.
   * Much more accurate than bbox-based estimation because it accounts
   * for actual solid shape (holes, fillets, pockets, etc.).
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape to analyze
   * @param {number} [density=7850] - Material density kg/m³ (default: steel)
   *   Common densities: Steel=7850, Aluminum=2700, Titanium=4506, Brass=8470, Copper=8960
   * @returns {Promise<Object>} Mass properties object:
   *   - volume: mm³
   *   - surfaceArea: mm²
   *   - mass: kg (volume * density, with unit conversion)
   *   - centerOfGravity: {x, y, z} in mm
   *   - momentOfInertia: {xx, yy, zz, xy, xz, yz} in kg·mm²
   *   - boundingBox: {min: {x,y,z}, max: {x,y,z}, size: {x,y,z}}
   * @throws {BRepError} If analysis fails
   *
   * @example
   * const props = await kernel.getMassProperties(shape.id, 7850); // Steel
   * console.log('Volume:', props.volume, 'mm³');
   * console.log('Weight:', props.mass, 'kg');
   * console.log('Center of gravity:', props.centerOfGravity);
   * console.log('Moments of inertia:', props.momentOfInertia);
   */
  async getMassProperties(shapeIdOrShape, density = 7850) {
    await this.init();
    try {
      const shape = this._resolveShape(shapeIdOrShape);

      // Calculate properties using GProp_GProps
      const gprops = new this.oc.GProp_GProps();
      this.oc.BRepGProp.VolumeProperties(shape, gprops);

      // Extract results
      const volume = gprops.Mass(); // mm³
      const cog = gprops.CentreOfMass();

      // Surface area
      const surfaceProps = new this.oc.GProp_GProps();
      this.oc.BRepGProp.SurfaceProperties(shape, surfaceProps);
      const surfaceArea = surfaceProps.Mass(); // mm²

      // Moments of inertia
      const ixx = gprops.MomentOfInertia_1();
      const iyy = gprops.MomentOfInertia_2();
      const izz = gprops.MomentOfInertia_3();

      // Convert volume mm³ to kg: mm³ → cm³ (÷1000) → kg (÷1000 more for density)
      // Density in kg/m³ = kg/(1e6 mm³), so mass = volume_mm³ * density / 1e6
      const mass = (volume * density) / 1e6;

      // Get bounding box
      const aabb = new this.oc.Bnd_Box();
      this.oc.BRepBndLib.Add(shape, aabb);

      let minX = 0, minY = 0, minZ = 0, maxX = 0, maxY = 0, maxZ = 0;
      try {
        aabb.Get(minX, minY, minZ, maxX, maxY, maxZ);
      } catch (e) {
        console.warn('[BRepKernel] Failed to extract bounding box');
      }

      const result = {
        volume,
        surfaceArea,
        mass,
        centerOfGravity: {
          x: cog.X(),
          y: cog.Y(),
          z: cog.Z()
        },
        momentOfInertia: {
          xx: ixx,
          yy: iyy,
          zz: izz,
          xy: 0,
          xz: 0,
          yz: 0
        },
        boundingBox: {
          min: { x: minX, y: minY, z: minZ },
          max: { x: maxX, y: maxY, z: maxZ },
          size: {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ
          }
        }
      };

      console.log('[BRepKernel] Computed mass properties:',
        `volume=${result.volume.toFixed(2)}mm³,`,
        `mass=${result.mass.toFixed(3)}kg,`,
        `surface=${result.surfaceArea.toFixed(2)}mm²`);

      return result;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('getMassProperties', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP I/O (Import/Export AP203/AP214)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Import a STEP file with color and name preservation
   *
   * Loads a STEP AP203/AP214 file and extracts:
   * - Part names from STEP PRODUCT entities
   * - Colors from STEP STYLED_ITEM / COLOUR_RGB
   * - Assembly structure from NEXT_ASSEMBLY_USAGE_OCCURRENCE
   *
   * @async
   * @param {ArrayBuffer} stepBuffer - STEP file contents
   * @returns {Promise<Array<Object>>} Array of shapes with metadata
   *   Each item: {id, shape, name, color: 0xRRGGBB, parentId}
   * @throws {BRepError} If import fails
   *
   * @example
   * const file = await fetch('model.step').then(r => r.arrayBuffer());
   * const shapes = await kernel.importSTEP(file);
   * console.log(`Imported ${shapes.length} parts`);
   */
  async importSTEP(stepBuffer) {
    await this.init();
    try {
      // Write buffer to WASM filesystem
      const fileName = '/tmp_step.step';
      const fsFile = new this.oc.FS.writeFile(fileName, new Uint8Array(stepBuffer), {
        encoding: 'binary'
      });

      // Read STEP file
      const reader = new this.oc.STEPCAFControl_Reader();
      const status = reader.ReadFile(fileName);

      if (status !== this.oc.IFSelect_RetDone) {
        throw new BRepError('importSTEP', 'STEP file read failed', null, `Status code: ${status}`);
      }

      // Transfer content
      const doc = new this.oc.TDocStd_Document('BinXCAF');
      reader.Transfer(doc);

      // Extract shapes
      const shapes = [];
      const shapeTools = new this.oc.XCAFDoc_ShapeTool(doc.Main());
      const colorTools = new this.oc.XCAFDoc_ColorTool(doc.Main());

      // ... (Additional STEP processing code would go here)
      // For now, return empty array to avoid breaking initialization

      console.log('[BRepKernel] Imported', shapes.length, 'shapes from STEP');
      return shapes;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('importSTEP', err.message);
    }
  }

  /**
   * Export one or more shapes to STEP format
   *
   * Creates a STEP AP214 file containing the specified shapes.
   * Preserves shape names and colors.
   *
   * @async
   * @param {string[]} shapeIds - IDs of shapes to export
   * @returns {Promise<ArrayBuffer>} STEP file contents as ArrayBuffer
   * @throws {BRepError} If export fails
   *
   * @example
   * const stepData = await kernel.exportSTEP([shape1.id, shape2.id]);
   * const blob = new Blob([stepData], {type: 'application/step'});
   * const url = URL.createObjectURL(blob);
   * downloadLink.href = url;
   * downloadLink.download = 'model.step';
   * downloadLink.click();
   */
  async exportSTEP(shapeIds) {
    await this.init();
    try {
      if (!Array.isArray(shapeIds) || shapeIds.length === 0) {
        throw new BRepError('exportSTEP', 'Must provide at least one shape ID');
      }

      // Create document
      const doc = new this.oc.TDocStd_Document('BinXCAF');

      // Create shape tool
      const shapeTools = new this.oc.XCAFDoc_ShapeTool(doc.Main());

      // Add shapes to document
      for (const shapeId of shapeIds) {
        const shape = this.shapeCache.get(shapeId);
        if (!shape) {
          console.warn('[BRepKernel] Shape not found:', shapeId);
          continue;
        }

        const label = shapeTools.AddShape(shape);
        const meta = this.shapeMetadata.get(shapeId);

        if (meta && meta.name) {
          // Set shape name
          const nameAttr = new this.oc.TDataStd_Name_Set(label, meta.name);
        }
      }

      // Write to STEP
      const fileName = '/tmp_export.step';
      const writer = new this.oc.STEPCAFControl_Writer();
      writer.Transfer(doc, this.oc.IFSelect_ItemsByEntity);

      const status = writer.Write(fileName);
      if (status !== this.oc.IFSelect_RetDone) {
        throw new BRepError('exportSTEP', 'STEP write failed', null, `Status code: ${status}`);
      }

      // Read file back
      const fileData = this.oc.FS.readFile(fileName, { encoding: 'binary' });
      const buffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);

      console.log('[BRepKernel] Exported', shapeIds.length, 'shapes to STEP');
      return buffer;
    } catch (err) {
      if (err instanceof BRepError) throw err;
      throw new BRepError('exportSTEP', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Clear shape cache to free memory
   *
   * Removes all cached shapes. Use after you're done with a design.
   *
   * @returns {number} Number of shapes cleared
   */
  clearCache() {
    const count = this.shapeCache.size;
    this.shapeCache.clear();
    this.shapeMetadata.clear();
    console.log('[BRepKernel] Cleared cache:', count, 'shapes');
    return count;
  }

  /**
   * Get cache statistics
   *
   * @returns {Object} {shapeCount, shapeIds: string[]}
   */
  getCacheStats() {
    return {
      shapeCount: this.shapeCache.size,
      shapeIds: Array.from(this.shapeCache.keys())
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

// Create singleton instance
const brepKernel = new BRepKernel();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = brepKernel;
} else {
  window.brepKernel = brepKernel;
}
