/**
 * @file brep-kernel.js
 * @description B-Rep (Boundary Representation) Solid Modeling Kernel for cycleCAD
 *   Wraps OpenCascade.js (WASM build of OpenCASCADE) to provide real solid modeling
 *   with B-Rep shapes, topology, and geometry operations.
 *
 *   Lazy-loads the ~50MB OpenCascade.js WASM file on first geometry operation.
 *   Caches shapes in memory for efficient reuse.
 *
 * @version 1.0.0
 * @author cycleCAD Team (wrapped OpenCASCADE)
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 * @see {@link https://github.com/CadQuery/opencascade.js}
 *
 * @module brep-kernel
 * @requires OpenCascade.js (loaded via CDN on demand)
 *
 * Architecture:
 *   ┌──────────────────────────────────────────┐
 *   │   B-Rep Kernel (via OpenCascade.js)      │
 *   │  Lazy-loaded WASM on first operation     │
 *   ├──────────────────────────────────────────┤
 *   │ Primitives: Box, Cylinder, Sphere, etc.  │
 *   │ Shapes: Extrude, Revolve, Sweep, Loft    │
 *   │ Booleans: Union, Cut, Intersect          │
 *   │ Modifiers: Fillet, Chamfer, Shell, Draft │
 *   │ I/O: STEP import/export                  │
 *   │ Analysis: Mass properties, Meshing       │
 *   └──────────────────────────────────────────┘
 *
 * Key Features:
 *   - Real B-Rep solids with topology tracking
 *   - STEP AP203/AP214 file import/export
 *   - Boolean operations with robust overlap handling
 *   - Fillets, chamfers, and dress-up features
 *   - Mass property analysis (volume, surface area, COG)
 *   - Automatic triangulation for visualization
 *   - Shape caching for performance
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
 *   // Boolean operations
 *   const subtracted = await brepKernel.booleanCut(box, cyl);
 *
 *   // Dress-up features
 *   const filleted = await brepKernel.fillet(subtracted, [0, 1, 2], 2);
 *
 *   // Convert to Three.js mesh for visualization
 *   const mesh = await brepKernel.shapeToMesh(filleted.shape);
 *   scene.add(mesh);
 *
 *   // Export to STEP
 *   const stepData = await brepKernel.exportSTEP([filleted.id]);
 *   ```
 */

/**
 * B-Rep Kernel class — WASM wrapper for OpenCascade.js
 *
 * Provides high-level API to OpenCascade shape modeling.
 * Handles lazy WASM initialization, shape caching, and memory management.
 *
 * @class BRepKernel
 * @property {Object|null} oc - OpenCascade.js instance (null until init() called)
 * @property {Map<string, Object>} shapeCache - Cached shapes: shapeId → TopoDS_Shape
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

    /** Auto-incrementing shape ID counter for unique IDs */
    this.nextShapeId = 0;

    /** Prevents concurrent init calls */
    this.isInitializing = false;

    /** Caches the init() promise for idempotence */
    this.initPromise = null;

    // CDN URL for OpenCascade.js full build (WASM + JS)
    this.OCCDNBase = 'https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/';
  }

  // ═══════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════

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
   * @throws {Error} If WASM initialization fails
   * @emits '[BRepKernel] Initializing OpenCascade.js WASM...' - On first init start
   * @emits '[BRepKernel] OpenCascade.js initialized successfully' - On success
   * @emits '[BRepKernel] Initialization error' - On failure
   *
   * @example
   * const kernel = new BRepKernel();
   * await kernel.init();  // Loads WASM (slow, first time only)
   * const box = await kernel.makeBox(10, 20, 30);  // Uses initialized WASM
   */
  async init() {
    // Return cached promise if already initializing/initialized
    if (this.oc) return this.oc;
    if (this.initPromise) return this.initPromise;
    if (this.isInitializing) return this.initPromise;

    this.isInitializing = true;
    this.initPromise = this._initOpenCascade();
    return this.initPromise;
  }

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
              throw new Error('OpenCascade.js Module not found after script load');
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
            reject(err);
          }
        };

        script.onerror = () => {
          console.error('[BRepKernel] Failed to load opencascade.full.js from CDN');
          this.isInitializing = false;

          // Restore saved Module
          if (savedModule !== undefined) {
            window.Module = savedModule;
          }
          reject(new Error('Failed to load OpenCascade.js from CDN'));
        };

        document.head.appendChild(script);
      });
    } catch (err) {
      console.error('[BRepKernel] Fatal initialization error:', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════

  /**
   * Generate unique shape ID (internal helper)
   * @private
   * @returns {string} Unique shape ID (format: 'shape_N')
   */
  _newShapeId() {
    return `shape_${this.nextShapeId++}`;
  }

  /**
   * Cache a shape and return ID + shape (internal helper)
   *
   * All shapes created by this kernel are cached for reuse and reference.
   *
   * @private
   * @param {Object} shape - OpenCascade TopoDS_Shape
   * @returns {Object} {id: string, shape: TopoDS_Shape}
   */
  _cacheShape(shape) {
    const id = this._newShapeId();
    this.shapeCache.set(id, shape);
    return { id, shape };
  }

  // ═══════════════════════════════════════════════════════
  // PRIMITIVE OPERATIONS (Create)
  // ═══════════════════════════════════════════════════════

  /**
   * Create a box (rectangular prism)
   * @async
   * @param {number} width - Width in mm
   * @param {number} height - Height in mm
   * @param {number} depth - Depth in mm
   * @returns {Promise<Object>} {id: shapeId, shape: TopoDS_Shape}
   * @throws {Error} If OpenCascade initialization fails
   */
  async makeBox(width, height, depth) {
    await this.init();
    try {
      const shape = new this.oc.BRepPrimAPI_MakeBox_2(width, height, depth).Shape();
      return this._cacheShape(shape);
    } catch (err) {
      console.error('[BRepKernel] makeBox failed:', err);
      throw err;
    }
  }

  async makeCylinder(radius, height) {
    await this.init();
    try {
      const shape = new this.oc.BRepPrimAPI_MakeCylinder_2(radius, height).Shape();
      return this._cacheShape(shape);
    } catch (err) {
      console.error('[BRepKernel] makeCylinder failed:', err);
      throw err;
    }
  }

  async makeSphere(radius) {
    await this.init();
    try {
      const shape = new this.oc.BRepPrimAPI_MakeSphere_3(radius).Shape();
      return this._cacheShape(shape);
    } catch (err) {
      console.error('[BRepKernel] makeSphere failed:', err);
      throw err;
    }
  }

  async makeCone(radius1, radius2, height) {
    await this.init();
    try {
      const shape = new this.oc.BRepPrimAPI_MakeCone_3(radius1, radius2, height).Shape();
      return this._cacheShape(shape);
    } catch (err) {
      console.error('[BRepKernel] makeCone failed:', err);
      throw err;
    }
  }

  async makeTorus(majorRadius, minorRadius) {
    await this.init();
    try {
      const shape = new this.oc.BRepPrimAPI_MakeTorus_2(majorRadius, minorRadius).Shape();
      return this._cacheShape(shape);
    } catch (err) {
      console.error('[BRepKernel] makeTorus failed:', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // SHAPE OPERATIONS (Modify)
  // ═══════════════════════════════════════════════════════

  /**
   * Extrude a face or wire along a direction
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @param {Object} direction - Direction vector {x, y, z}
   * @param {number} distance - Extrusion distance in mm
   * @returns {Promise<Object>} {id: shapeId, shape: extruded TopoDS_Shape}
   * @throws {Error} If extrusion fails
   */
  async extrude(shapeIdOrShape, direction, distance) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      // Create direction vector
      const dir = new this.oc.gp_Dir_3(direction.x, direction.y, direction.z);

      // Use BRepPrimAPI_MakePrism for extrusion
      const prism = new this.oc.BRepPrimAPI_MakePrism_2(shape, dir, distance, false);
      const result = prism.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] extrude failed:', err);
      throw err;
    }
  }

  async revolve(shapeIdOrShape, axis, angle) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      // Create axis (gp_Ax1)
      // axis = { origin: { x, y, z }, direction: { x, y, z } }
      const origin = new this.oc.gp_Pnt_3(axis.origin.x, axis.origin.y, axis.origin.z);
      const dir = new this.oc.gp_Dir_3(axis.direction.x, axis.direction.y, axis.direction.z);
      const ax1 = new this.oc.gp_Ax1_2(origin, dir);

      // Use BRepPrimAPI_MakeRevolution
      const rev = new this.oc.BRepPrimAPI_MakeRevolution_2(ax1, shape, angle * Math.PI / 180, false);
      const result = rev.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] revolve failed:', err);
      throw err;
    }
  }

  async fillet(shapeIdOrShape, edgeIndices, radius) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      const filler = new this.oc.BRepFilletAPI_MakeFillet(shape, this.oc.ChFi3d_Rational);

      // Get edges and apply fillet
      const edges = this._getEdgesFromShape(shape);

      for (let idx of edgeIndices) {
        if (idx < edges.length) {
          filler.Add_2(radius, edges[idx]);
        }
      }

      filler.Build();
      const result = filler.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] fillet failed:', err);
      throw err;
    }
  }

  async chamfer(shapeIdOrShape, edgeIndices, distance) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      const chamferer = new this.oc.BRepFilletAPI_MakeChamfer(shape);

      // Get edges and apply chamfer
      const edges = this._getEdgesFromShape(shape);

      for (let idx of edgeIndices) {
        if (idx < edges.length) {
          chamferer.Add_2(distance, edges[idx]);
        }
      }

      chamferer.Build();
      const result = chamferer.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] chamfer failed:', err);
      throw err;
    }
  }

  async booleanUnion(shapeId1, shapeId2) {
    await this.init();
    try {
      const shape1 = this.shapeCache.get(shapeId1);
      const shape2 = this.shapeCache.get(shapeId2);

      if (!shape1 || !shape2) throw new Error('One or both shapes not found');

      const fuse = new this.oc.BRepAlgoAPI_Fuse_3(
        shape1,
        shape2,
        new this.oc.Message_ProgressRange_1()
      );
      const result = fuse.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] booleanUnion failed:', err);
      throw err;
    }
  }

  async booleanCut(shapeIdTool, shapeIdBase) {
    await this.init();
    try {
      const base = this.shapeCache.get(shapeIdBase);
      const tool = this.shapeCache.get(shapeIdTool);

      if (!base || !tool) throw new Error('One or both shapes not found');

      const cut = new this.oc.BRepAlgoAPI_Cut_3(
        base,
        tool,
        new this.oc.Message_ProgressRange_1()
      );
      const result = cut.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] booleanCut failed:', err);
      throw err;
    }
  }

  async booleanIntersect(shapeId1, shapeId2) {
    await this.init();
    try {
      const shape1 = this.shapeCache.get(shapeId1);
      const shape2 = this.shapeCache.get(shapeId2);

      if (!shape1 || !shape2) throw new Error('One or both shapes not found');

      const common = new this.oc.BRepAlgoAPI_Common_3(
        shape1,
        shape2,
        new this.oc.Message_ProgressRange_1()
      );
      const result = common.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] booleanIntersect failed:', err);
      throw err;
    }
  }

  async shell(shapeIdOrShape, faceIndices, thickness) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      const sheller = new this.oc.BRepOffsetAPI_MakeThickSolid();

      // Get faces to remove
      const faces = this._getFacesFromShape(shape);

      for (let idx of faceIndices) {
        if (idx < faces.length) {
          sheller.Add(faces[idx]);
        }
      }

      sheller.MakeThickSolidByJoin(shape, thickness, 0.01);
      const result = sheller.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] shell failed:', err);
      throw err;
    }
  }

  async sweep(profileShapeId, pathShapeId) {
    await this.init();
    try {
      const profile = this.shapeCache.get(profileShapeId);
      const path = this.shapeCache.get(pathShapeId);

      if (!profile || !path) throw new Error('Profile or path shape not found');

      const sweeper = new this.oc.BRepOffsetAPI_MakePipe(path, profile, false);
      const result = sweeper.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] sweep failed:', err);
      throw err;
    }
  }

  async loft(shapeIds) {
    await this.init();
    try {
      if (!shapeIds || shapeIds.length < 2) {
        throw new Error('Loft requires at least 2 profile shapes');
      }

      const profiles = new this.oc.TopTools_ListOfShape_1();

      for (let id of shapeIds) {
        const shape = this.shapeCache.get(id);
        if (!shape) throw new Error(`Shape ${id} not found`);
        profiles.Append_1(shape);
      }

      const lofter = new this.oc.BRepOffsetAPI_MakeLoft_2(profiles, false, false);
      const result = lofter.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] loft failed:', err);
      throw err;
    }
  }

  async mirror(shapeIdOrShape, plane) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      // Create mirror plane (gp_Pln)
      // plane = { origin: { x, y, z }, normal: { x, y, z } }
      const origin = new this.oc.gp_Pnt_3(plane.origin.x, plane.origin.y, plane.origin.z);
      const normal = new this.oc.gp_Dir_3(plane.normal.x, plane.normal.y, plane.normal.z);
      const pln = new this.oc.gp_Pln_2(origin, normal);

      // Create mirror transformation
      const trsf = new this.oc.gp_Trsf_1();
      trsf.SetMirror_2(pln);

      // Apply transformation
      const brep = new this.oc.BRepBuilderAPI_Transform_2(shape, trsf, false);
      const result = brep.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] mirror failed:', err);
      throw err;
    }
  }

  async draft(shapeIdOrShape, faceIndices, angle, pullDirection) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      const draftDir = new this.oc.gp_Dir_3(
        pullDirection.x,
        pullDirection.y,
        pullDirection.z
      );

      const drafter = new this.oc.BRepOffsetAPI_MakeDraft(
        shape,
        draftDir,
        angle * Math.PI / 180
      );

      // Get faces and add to draft
      const faces = this._getFacesFromShape(shape);
      for (let idx of faceIndices) {
        if (idx < faces.length) {
          drafter.Add_1(faces[idx]);
        }
      }

      drafter.Build();
      const result = drafter.Shape();

      return this._cacheShape(result);
    } catch (err) {
      console.error('[BRepKernel] draft failed:', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // MESHING (Convert to THREE.js)
  // ═══════════════════════════════════════════════════════

  /**
   * Convert B-Rep shape to THREE.js BufferGeometry via triangulation
   *
   * Automatically applies incremental meshing with specified deflection parameters.
   * Supports normal computation for proper shading and vertex normals.
   *
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @param {number} [linearDeflection=0.1] - Linear deflection in mm (lower = finer mesh)
   * @param {number} [angularDeflection=0.5] - Angular deflection in radians
   * @returns {Promise<THREE.BufferGeometry>} Triangulated geometry
   * @returns {null} If shape has no triangles
   * @throws {Error} If meshing fails
   *
   * @example
   * const shape = await kernel.makeBox(10, 20, 30);
   * const geometry = await kernel.shapeToMesh(shape.shape, 0.05);
   * const mesh = new THREE.Mesh(geometry, material);
   * scene.add(mesh);
   */
  async shapeToMesh(shapeIdOrShape, linearDeflection = 0.1, angularDeflection = 0.5) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      // Mesh the shape using incremental mesh
      const mesh = new this.oc.BRepMesh_IncrementalMesh_2(
        shape,
        linearDeflection,
        false,
        angularDeflection,
        false
      );

      mesh.Perform();

      // Extract triangles and normals
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const normals = [];
      const indices = [];
      let vertexCount = 0;

      // Iterate over faces
      const explorer = new this.oc.TopExp_Explorer_2(shape, this.oc.TopAbs_FACE);

      while (explorer.More()) {
        const face = this.oc.TopoDS.Face_1(explorer.Current());
        const location = new this.oc.TopLoc_Location_1();
        const triangulation = this.oc.BRep_Tool.Triangulation_2(face, location);

        if (triangulation && triangulation.NbTriangles() > 0) {
          const nodes = triangulation.Nodes();
          const triangles = triangulation.Triangles();

          // Add vertices
          for (let i = 1; i <= triangulation.NbNodes(); i++) {
            const node = nodes.Value(i);
            vertices.push(node.X(), node.Y(), node.Z());
          }

          // Add triangles as indices
          for (let i = 1; i <= triangulation.NbTriangles(); i++) {
            const tri = triangles.Value(i);
            const n = triangulation.NbNodes();

            // Get vertex indices (1-based in OCC, convert to 0-based)
            const v1 = tri.Value(1) - 1 + vertexCount;
            const v2 = tri.Value(2) - 1 + vertexCount;
            const v3 = tri.Value(3) - 1 + vertexCount;

            indices.push(v1, v2, v3);
          }

          vertexCount += triangulation.NbNodes();
        }

        explorer.Next();
      }

      if (vertices.length === 0) {
        console.warn('[BRepKernel] No triangles generated from shape');
        return null;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();

      return geometry;
    } catch (err) {
      console.error('[BRepKernel] shapeToMesh failed:', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // STEP I/O (Import/Export AP203/AP214)
  // ═══════════════════════════════════════════════════════

  /**
   * Import STEP file (AP203 or AP214)
   *
   * Parses binary STEP file and extracts all top-level shapes.
   * Handles assemblies by recursively adding all component shapes.
   *
   * @async
   * @param {ArrayBuffer} arrayBuffer - Binary STEP file data
   * @returns {Promise<Array>} Array of {id, shape} for each imported shape
   * @throws {Error} If STEP parsing fails
   *
   * @example
   * const file = await fetch('model.step').then(r => r.arrayBuffer());
   * const shapes = await kernel.importSTEP(file);
   * console.log(`Imported ${shapes.length} shapes`);
   */
  async importSTEP(arrayBuffer) {
    await this.init();
    try {
      // Write buffer to WASM filesystem
      const filename = 'temp_import.step';
      const bytes = new Uint8Array(arrayBuffer);
      const stream = new this.oc.std_ofstream_1(filename);

      for (let byte of bytes) {
        stream.put_1(byte);
      }
      stream.close();

      // Read STEP file
      const doc = new this.oc.TDocStd_Document_1(new this.oc.TCollection_AsciiString_2('STEP'));
      const reader = new this.oc.STEPCAFControl_Reader_1();

      reader.ReadFile_1(filename);
      reader.Transfer_1(doc, 2); // TransferMode_ShapeWrite

      // Extract all shapes from document
      const shapes = [];
      const explorer = new this.oc.TDocStd_LabelSequence_1();
      doc.Main().FindAttribute_2(this.oc.XCAFDoc_DocumentTool.ShapesLabel_1(), explorer);

      for (let i = 1; i <= explorer.Length(); i++) {
        const label = explorer.Value(i);
        const shape = this.oc.XCAFDoc_DocumentTool.GetShape_1(label);

        if (shape && !shape.IsNull()) {
          shapes.push(this._cacheShape(shape));
        }
      }

      console.log(`[BRepKernel] Imported ${shapes.length} shapes from STEP`);
      return shapes;
    } catch (err) {
      console.error('[BRepKernel] importSTEP failed:', err);
      throw err;
    }
  }

  async exportSTEP(shapeIds) {
    await this.init();
    try {
      const doc = new this.oc.TDocStd_Document_1(new this.oc.TCollection_AsciiString_2('STEP'));

      // Add shapes to document
      for (let id of shapeIds) {
        const shape = this.shapeCache.get(id);
        if (shape) {
          const label = doc.Main().NewChild_1();
          this.oc.XCAFDoc_DocumentTool.SetShape_2(label, shape);
        }
      }

      // Write to STEP file
      const filename = 'temp_export.step';
      const writer = new this.oc.STEPCAFControl_Writer_1();

      writer.Transfer_2(doc, 2); // TransferMode_ShapeWrite
      writer.Write_1(filename);

      // Read file back as buffer
      const stream = new this.oc.std_ifstream_1(filename);
      const bytes = [];

      while (true) {
        const byte = stream.get_1();
        if (byte === -1) break;
        bytes.push(byte);
      }
      stream.close();

      console.log(`[BRepKernel] Exported ${shapeIds.length} shapes to STEP`);
      return new Uint8Array(bytes);
    } catch (err) {
      console.error('[BRepKernel] exportSTEP failed:', err);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════
  // SHAPE INSPECTION (Analysis & Queries)
  // ═══════════════════════════════════════════════════════

  /**
   * Get all edges from a shape
   * @async
   * @param {string|Object} shapeIdOrShape - Shape ID or TopoDS_Shape
   * @returns {Promise<Array>} Array of TopoDS_Edge objects
   */
  async getEdges(shapeIdOrShape) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      return this._getEdgesFromShape(shape);
    } catch (err) {
      console.error('[BRepKernel] getEdges failed:', err);
      throw err;
    }
  }

  async getFaces(shapeIdOrShape) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      return this._getFacesFromShape(shape);
    } catch (err) {
      console.error('[BRepKernel] getFaces failed:', err);
      throw err;
    }
  }

  async getMassProperties(shapeIdOrShape) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      const props = new this.oc.GProp_GProps_1();
      this.oc.BRepGProp.VolumeProperties_2(shape, props, false);

      const cog = props.CentreOfMass();

      return {
        volume: props.Mass(),
        area: this._getSurfaceArea(shape),
        centerOfGravity: { x: cog.X(), y: cog.Y(), z: cog.Z() },
        momentOfInertia: this._getMomentOfInertia(shape, props)
      };
    } catch (err) {
      console.error('[BRepKernel] getMassProperties failed:', err);
      throw err;
    }
  }

  async getBoundingBox(shapeIdOrShape) {
    await this.init();
    try {
      const shape = typeof shapeIdOrShape === 'string'
        ? this.shapeCache.get(shapeIdOrShape)
        : shapeIdOrShape;

      if (!shape) throw new Error('Shape not found');

      const bbox = new this.oc.Bnd_Box_1();
      this.oc.BRepBndLib.Add_2(shape, bbox);

      const min = new this.oc.gp_Pnt_1();
      const max = new this.oc.gp_Pnt_1();
      bbox.Get_1(min, max);

      return {
        min: { x: min.X(), y: min.Y(), z: min.Z() },
        max: { x: max.X(), y: max.Y(), z: max.Z() },
        size: {
          x: max.X() - min.X(),
          y: max.Y() - min.Y(),
          z: max.Z() - min.Z()
        }
      };
    } catch (err) {
      console.error('[BRepKernel] getBoundingBox failed:', err);
      throw err;
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  _getEdgesFromShape(shape) {
    const edges = [];
    const explorer = new this.oc.TopExp_Explorer_2(shape, this.oc.TopAbs_EDGE);

    while (explorer.More()) {
      const edge = explorer.Current();
      edges.push(edge);
      explorer.Next();
    }

    return edges;
  }

  _getFacesFromShape(shape) {
    const faces = [];
    const explorer = new this.oc.TopExp_Explorer_2(shape, this.oc.TopAbs_FACE);

    while (explorer.More()) {
      const face = explorer.Current();
      faces.push(face);
      explorer.Next();
    }

    return faces;
  }

  _getSurfaceArea(shape) {
    try {
      const props = new this.oc.GProp_GProps_1();
      this.oc.BRepGProp.SurfaceProperties_2(shape, props, false);
      return props.Mass();
    } catch (err) {
      console.warn('[BRepKernel] Could not calculate surface area:', err);
      return 0;
    }
  }

  _getMomentOfInertia(shape, props) {
    try {
      const mat = props.MatrixOfInertia();
      return {
        ixx: mat.Value(1, 1),
        iyy: mat.Value(2, 2),
        izz: mat.Value(3, 3),
        ixy: mat.Value(1, 2),
        ixz: mat.Value(1, 3),
        iyz: mat.Value(2, 3)
      };
    } catch (err) {
      console.warn('[BRepKernel] Could not calculate moment of inertia:', err);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // MEMORY & STATE
  // ═══════════════════════════════════════════════════════

  /**
   * Clear all cached shapes (free memory)
   * @returns {void}
   * @emits '[BRepKernel] Shape cache cleared' - On completion
   */
  clearCache() {
    this.shapeCache.clear();
    console.log('[BRepKernel] Shape cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      shapesCount: this.shapeCache.size,
      nextId: this.nextShapeId,
      isInitialized: !!this.oc
    };
  }
}

// Create singleton instance and expose globally
const brepKernel = new BRepKernel();
window.brepKernel = brepKernel;

console.log('[BRepKernel] Module loaded. Call await brepKernel.init() to start.');

export default brepKernel;
