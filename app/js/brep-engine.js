/**
 * brep-engine.js — Real B-rep kernel for cycleCAD using OpenCascade.js
 *
 * Provides true solid modeling operations:
 *   - Primitive creation (box, cylinder, sphere, cone)
 *   - Boolean operations (cut, fuse, intersect)
 *   - Fillet and chamfer on real edges
 *   - Shape → Three.js BufferGeometry conversion
 *
 * Uses opencascade.js v2.0.0-beta (modular WASM build)
 *
 * MIT License — cycleCAD (c) 2026
 */

// ============================================================================
// STATE
// ============================================================================

let oc = null;           // OpenCascade.js instance
let _loading = false;    // Prevent double-init
let _ready = false;      // True when WASM is loaded
let _currentShape = null; // Active TopoDS_Shape (the "document")
const _shapeStack = [];  // Undo stack of shapes

// CDN for opencascade.js 2.0.0-beta
const OCC_CDN = 'https://unpkg.com/opencascade.js@2.0.0-beta.533428a/dist/';

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load and initialize the OpenCascade.js WASM kernel.
 * Returns a promise that resolves when ready.
 * Subsequent calls return immediately if already loaded.
 */
export async function initBRep() {
  if (_ready && oc) return oc;
  if (_loading) {
    // Wait for in-progress load
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (_ready && oc) { clearInterval(check); resolve(oc); }
      }, 200);
    });
  }

  _loading = true;
  console.log('[BRep] Loading OpenCascade.js WASM kernel...');

  try {
    // Dynamic import from CDN
    const module = await import(/* webpackIgnore: true */ OCC_CDN + 'opencascade.full.js');
    const factory = module.default || module;

    // Initialize WASM — factory returns a promise
    oc = await factory({
      locateFile: (file) => OCC_CDN + file,
    });

    _ready = true;
    _loading = false;
    console.log('[BRep] OpenCascade.js ready ✓');
    return oc;
  } catch (err) {
    console.error('[BRep] Failed to load OpenCascade.js:', err);
    _loading = false;

    // Fallback: try loading via script tag
    return new Promise((resolve, reject) => {
      console.log('[BRep] Trying script tag fallback...');
      const savedModule = window.Module;
      const script = document.createElement('script');
      script.src = OCC_CDN + 'opencascade.full.js';
      script.onload = async () => {
        try {
          const occFactory = window.Module;
          window.Module = savedModule; // restore
          oc = await new occFactory({
            locateFile: (file) => OCC_CDN + file,
          });
          _ready = true;
          _loading = false;
          console.log('[BRep] OpenCascade.js ready (script fallback) ✓');
          resolve(oc);
        } catch (e2) {
          _loading = false;
          reject(e2);
        }
      };
      script.onerror = () => { _loading = false; reject(new Error('Script load failed')); };
      document.head.appendChild(script);
    });
  }
}

/** Check if the B-rep kernel is ready */
export function isReady() { return _ready && oc !== null; }

// ============================================================================
// HELPER: gp_Pnt constructor
// ============================================================================

function pnt(x, y, z) {
  return new oc.gp_Pnt_3(x, y, z);
}

function ax2(origin, dir) {
  return new oc.gp_Ax2_3(
    pnt(origin[0], origin[1], origin[2]),
    new oc.gp_Dir_4(dir[0], dir[1], dir[2])
  );
}

function progress() {
  return new oc.Message_ProgressRange_1();
}

// ============================================================================
// PRIMITIVES
// ============================================================================

/**
 * Create a B-rep box centered at origin
 * @param {number} width - X dimension in mm
 * @param {number} height - Y dimension in mm
 * @param {number} depth - Z dimension in mm
 * @returns {TopoDS_Shape}
 */
export function makeBox(width, height, depth) {
  const w = width, h = height, d = depth;
  // Create box at (-w/2, -h/2, -d/2) so it's centered
  const builder = new oc.BRepPrimAPI_MakeBox_3(
    pnt(-w / 2, -h / 2, -d / 2), w, h, d
  );
  const shape = builder.Shape();
  builder.delete();
  return shape;
}

/**
 * Create a B-rep cylinder centered at origin, axis along Y
 * @param {number} radius - Radius in mm
 * @param {number} height - Height in mm
 * @returns {TopoDS_Shape}
 */
export function makeCylinder(radius, height) {
  const axis = ax2([0, -height / 2, 0], [0, 1, 0]);
  const builder = new oc.BRepPrimAPI_MakeCylinder_2(axis, radius, height);
  const shape = builder.Shape();
  builder.delete();
  return shape;
}

/**
 * Create a B-rep sphere centered at origin
 * @param {number} radius - Radius in mm
 * @returns {TopoDS_Shape}
 */
export function makeSphere(radius) {
  const builder = new oc.BRepPrimAPI_MakeSphere_1(radius);
  const shape = builder.Shape();
  builder.delete();
  return shape;
}

/**
 * Create a B-rep cone centered at origin, axis along Y
 * @param {number} bottomRadius
 * @param {number} topRadius
 * @param {number} height
 * @returns {TopoDS_Shape}
 */
export function makeCone(bottomRadius, topRadius, height) {
  const axis = ax2([0, -height / 2, 0], [0, 1, 0]);
  const builder = new oc.BRepPrimAPI_MakeCone_2(axis, bottomRadius, topRadius, height);
  const shape = builder.Shape();
  builder.delete();
  return shape;
}

// ============================================================================
// BOOLEAN OPERATIONS
// ============================================================================

/**
 * Boolean cut: result = base - tool
 * @param {TopoDS_Shape} base - Shape to cut from
 * @param {TopoDS_Shape} tool - Shape to subtract
 * @returns {TopoDS_Shape}
 */
export function booleanCut(base, tool) {
  const cutter = new oc.BRepAlgoAPI_Cut_3(base, tool, progress());
  cutter.Build(progress());
  if (!cutter.IsDone()) {
    console.warn('[BRep] Boolean cut failed');
    cutter.delete();
    return base;
  }
  const result = cutter.Shape();
  cutter.delete();
  return result;
}

/**
 * Boolean fuse (union): result = base + tool
 * @param {TopoDS_Shape} base
 * @param {TopoDS_Shape} tool
 * @returns {TopoDS_Shape}
 */
export function booleanFuse(base, tool) {
  const fuser = new oc.BRepAlgoAPI_Fuse_3(base, tool, progress());
  fuser.Build(progress());
  if (!fuser.IsDone()) {
    console.warn('[BRep] Boolean fuse failed');
    fuser.delete();
    return base;
  }
  const result = fuser.Shape();
  fuser.delete();
  return result;
}

/**
 * Boolean intersect: result = base ∩ tool
 * @param {TopoDS_Shape} base
 * @param {TopoDS_Shape} tool
 * @returns {TopoDS_Shape}
 */
export function booleanIntersect(base, tool) {
  const common = new oc.BRepAlgoAPI_Common_3(base, tool, progress());
  common.Build(progress());
  if (!common.IsDone()) {
    console.warn('[BRep] Boolean intersect failed');
    common.delete();
    return base;
  }
  const result = common.Shape();
  common.delete();
  return result;
}

// ============================================================================
// FILLET & CHAMFER
// ============================================================================

/**
 * Apply fillet (round) to ALL edges of a shape
 * @param {TopoDS_Shape} shape - Input shape
 * @param {number} radius - Fillet radius in mm
 * @returns {TopoDS_Shape}
 */
export function filletAll(shape, radius) {
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_Rational);
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  let edgeCount = 0;
  while (explorer.More()) {
    const edge = oc.TopoDS.Edge_1(explorer.Current());
    fillet.Add_2(radius, edge);
    edgeCount++;
    explorer.Next();
  }
  explorer.delete();

  if (edgeCount === 0) {
    console.warn('[BRep] No edges found for fillet');
    fillet.delete();
    return shape;
  }

  try {
    const result = fillet.Shape();
    console.log(`[BRep] Fillet applied to ${edgeCount} edges (r=${radius}mm)`);
    fillet.delete();
    return result;
  } catch (e) {
    console.warn('[BRep] Fillet failed (radius may be too large):', e.message);
    fillet.delete();
    return shape;
  }
}

/**
 * Apply chamfer to ALL edges of a shape
 * @param {TopoDS_Shape} shape - Input shape
 * @param {number} distance - Chamfer distance in mm
 * @returns {TopoDS_Shape}
 */
export function chamferAll(shape, distance) {
  const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  let edgeCount = 0;
  while (explorer.More()) {
    const edge = oc.TopoDS.Edge_1(explorer.Current());
    chamfer.Add_2(distance, edge);
    edgeCount++;
    explorer.Next();
  }
  explorer.delete();

  if (edgeCount === 0) {
    chamfer.delete();
    return shape;
  }

  try {
    const result = chamfer.Shape();
    console.log(`[BRep] Chamfer applied to ${edgeCount} edges (d=${distance}mm)`);
    chamfer.delete();
    return result;
  } catch (e) {
    console.warn('[BRep] Chamfer failed:', e.message);
    chamfer.delete();
    return shape;
  }
}

// ============================================================================
// TRANSFORM
// ============================================================================

/**
 * Translate a shape by (dx, dy, dz)
 * @param {TopoDS_Shape} shape
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @returns {TopoDS_Shape}
 */
export function translate(shape, dx, dy, dz) {
  const trsf = new oc.gp_Trsf_1();
  trsf.SetTranslation_1(new oc.gp_Vec_4(dx, dy, dz));
  const transform = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  const result = transform.Shape();
  transform.delete();
  trsf.delete();
  return result;
}

// ============================================================================
// SHAPE → THREE.JS CONVERSION
// ============================================================================

/**
 * Convert a TopoDS_Shape to Three.js BufferGeometry
 * Tessellates the B-rep surface and extracts vertex/normal/index arrays
 *
 * @param {TopoDS_Shape} shape - OCC shape to convert
 * @param {number} deflection - Mesh quality (smaller = finer). Default 0.5mm
 * @returns {THREE.BufferGeometry}
 */
export function shapeToGeometry(shape, deflection = 0.5) {
  // Tessellate the shape
  new oc.BRepMesh_IncrementalMesh_2(shape, deflection, false, deflection * 5, false);

  const positions = [];
  const normals = [];
  const indices = [];
  let vertexOffset = 0;

  // Iterate over all faces
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  while (faceExplorer.More()) {
    const face = oc.TopoDS.Face_1(faceExplorer.Current());
    const location = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, location);

    if (!triangulation.IsNull()) {
      const tri = triangulation.get();
      const nbNodes = tri.NbNodes();
      const nbTriangles = tri.NbTriangles();

      // Get the transformation from the face location
      const trsf = location.Transformation();

      // Extract vertices
      for (let i = 1; i <= nbNodes; i++) {
        const node = tri.Node(i);
        const transformed = node.Transformed(trsf);
        positions.push(transformed.X(), transformed.Y(), transformed.Z());
      }

      // Compute face normal orientation
      const orientation = face.Orientation_1();
      const reversed = (orientation === oc.TopAbs_Orientation.TopAbs_REVERSED);

      // Extract triangles
      for (let i = 1; i <= nbTriangles; i++) {
        const triangle = tri.Triangle(i);
        let n1 = triangle.Value(1);
        let n2 = triangle.Value(2);
        let n3 = triangle.Value(3);

        // Flip winding if face is reversed
        if (reversed) { [n2, n3] = [n3, n2]; }

        indices.push(
          vertexOffset + n1 - 1,
          vertexOffset + n2 - 1,
          vertexOffset + n3 - 1
        );
      }

      vertexOffset += nbNodes;
    }

    location.delete();
    faceExplorer.Next();
  }
  faceExplorer.delete();

  // Build Three.js BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Convert a TopoDS_Shape to a full Three.js Mesh with material
 *
 * @param {TopoDS_Shape} shape - OCC shape
 * @param {object} options - { color, metalness, roughness, opacity, wireframe }
 * @param {number} deflection - Mesh quality
 * @returns {{ mesh: THREE.Mesh, wireframe: THREE.LineSegments, shape: TopoDS_Shape }}
 */
export function shapeToMesh(shape, options = {}, deflection = 0.5) {
  const {
    color = 0x4488cc,
    metalness = 0.3,
    roughness = 0.6,
    opacity = 1.0,
    wireframe = false,
  } = options;

  const geometry = shapeToGeometry(shape, deflection);

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    wireframe,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Wireframe edges overlay
  const edges = new THREE.EdgesGeometry(geometry, 15);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.3, transparent: true });
  const wireframeLines = new THREE.LineSegments(edges, lineMat);

  return { mesh, wireframe: wireframeLines, shape };
}

// ============================================================================
// HIGH-LEVEL COPILOT API
// ============================================================================

/**
 * Execute a full copilot command sequence using real B-rep operations.
 * Manages the current shape state and converts to Three.js.
 *
 * @param {Array} commands - Array of { type, params } objects
 * @returns {Promise<{ mesh, wireframe, shape, description }>}
 */
export async function executeCommands(commands) {
  if (!_ready) {
    await initBRep();
  }

  const SCALE = 0.1; // mm to scene units
  let description = '';

  for (const cmd of commands) {
    const { type, params = {} } = cmd;

    try {
      switch (type) {
        case 'box': {
          const w = params.width || 100;
          const h = params.height || 100;
          const d = params.depth || 100;
          _pushUndo();
          _currentShape = makeBox(w, h, d);
          description += `Box ${w}×${h}×${d}mm`;
          break;
        }

        case 'cylinder': {
          const r = params.radius || 25;
          const h = params.height || 50;
          _pushUndo();
          _currentShape = makeCylinder(r, h);
          description += `Cylinder r${r} h${h}mm`;
          break;
        }

        case 'sphere': {
          const r = params.radius || 25;
          _pushUndo();
          _currentShape = makeSphere(r);
          description += `Sphere r${r}mm`;
          break;
        }

        case 'cone': {
          const br = params.bottomRadius || params.radius || 25;
          const tr = params.topRadius || 0;
          const h = params.height || 50;
          _pushUndo();
          _currentShape = makeCone(br, tr, h);
          description += `Cone r${br}/${tr} h${h}mm`;
          break;
        }

        case 'hole': {
          if (!_currentShape) {
            console.warn('[BRep] No shape to cut hole in — create a shape first');
            break;
          }
          const r = params.radius || 5;
          const depth = params.depth || params.height || 200;
          const count = params.count || 1;

          _pushUndo();

          for (let i = 0; i < count; i++) {
            // Position holes at corners for count=4, or center for count=1
            let dx = 0, dz = 0;
            if (count === 4) {
              const spread = (params.spread || 30);
              const corners = [[-spread, -spread], [spread, -spread], [spread, spread], [-spread, spread]];
              [dx, dz] = corners[i % 4];
            } else if (count > 1) {
              const angle = (i / count) * Math.PI * 2;
              const spread = (params.spread || 20);
              dx = Math.cos(angle) * spread;
              dz = Math.sin(angle) * spread;
            }

            // Create cylinder tool at position, axis along Y
            let tool = makeCylinder(r, depth);
            if (dx !== 0 || dz !== 0) {
              tool = translate(tool, dx, 0, dz);
            }

            _currentShape = booleanCut(_currentShape, tool);
          }

          description += ` + ${count} hole${count > 1 ? 's' : ''} (r${r}mm)`;
          break;
        }

        case 'fillet': {
          if (!_currentShape) break;
          const r = params.radius || 5;
          _pushUndo();
          _currentShape = filletAll(_currentShape, r);
          description += ` + fillet r${r}mm`;
          break;
        }

        case 'chamfer': {
          if (!_currentShape) break;
          const d = params.distance || 3;
          _pushUndo();
          _currentShape = chamferAll(_currentShape, d);
          description += ` + chamfer ${d}mm`;
          break;
        }

        case 'fuse': {
          if (!_currentShape || !params._toolShape) break;
          _pushUndo();
          _currentShape = booleanFuse(_currentShape, params._toolShape);
          description += ' + fuse';
          break;
        }

        default:
          console.warn(`[BRep] Unknown command type: ${type}`);
      }
    } catch (err) {
      console.error(`[BRep] Command "${type}" failed:`, err);
    }
  }

  // Convert final shape to Three.js
  if (!_currentShape) {
    return null;
  }

  const result = shapeToMesh(_currentShape, { color: 0x4488cc }, 0.5);
  // Scale mesh to scene units
  result.mesh.scale.set(SCALE, SCALE, SCALE);
  result.wireframe.scale.set(SCALE, SCALE, SCALE);
  result.description = description;

  return result;
}

// ============================================================================
// UNDO SUPPORT
// ============================================================================

function _pushUndo() {
  if (_currentShape) {
    _shapeStack.push(_currentShape);
    if (_shapeStack.length > 20) _shapeStack.shift(); // limit memory
  }
}

export function undo() {
  if (_shapeStack.length > 0) {
    _currentShape = _shapeStack.pop();
    return true;
  }
  return false;
}

export function getCurrentShape() { return _currentShape; }
export function clearShape() { _currentShape = null; _shapeStack.length = 0; }

// ============================================================================
// REGISTER ON WINDOW FOR COPILOT ACCESS
// ============================================================================

window.brepEngine = {
  initBRep,
  isReady,
  makeBox,
  makeCylinder,
  makeSphere,
  makeCone,
  booleanCut,
  booleanFuse,
  booleanIntersect,
  filletAll,
  chamferAll,
  translate,
  shapeToGeometry,
  shapeToMesh,
  executeCommands,
  undo,
  getCurrentShape,
  clearShape,
};
