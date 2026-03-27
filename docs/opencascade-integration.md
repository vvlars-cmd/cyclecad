# OpenCascade.js Integration Plan for cycleCAD

## Overview

This document details the integration strategy for real-time STEP/IGES/BREP import and B-rep (Boundary Representation) modeling operations into cycleCAD using OpenCascade WASM technology. This enables replacement of current mesh approximations with true parametric, topologically-correct geometry operations.

**Status**: Phase A (Q2 2026) — Ready for implementation
**Priority**: High (competitive necessity vs. OnShape, Fusion 360, Aurorin)
**Effort Estimate**: 3–4 weeks (including testing and optimization)

---

## 1. Technology Decision Matrix

### Competing Solutions

| Solution | Strengths | Weaknesses | Recommendation |
|----------|-----------|-----------|-----------------|
| **occt-import-js** | UMD via CDN, mature, proven (ExplodeView uses it), ≤100KB WASM | Import-only, no modeling API, triangulation only | ✅ **Phase A (import)** |
| **opencascade.js** | Full API (Boolean, Fillet, etc.), ~3MB WASM, multi-threaded, maintained | Larger bundle, complex bundling, steeper learning curve | ✅ **Phase B (modeling)** |
| **replicad** | High-level API, builder pattern, polished | Thin wrapper, depends on opencascade.js, less control | Consider Phase C |
| **bitbybit.dev** | Production-ready, 32/64/MT builds, STEP assembly support | Proprietary licensing model, npm-only | Enterprise option |
| **Chili3D** | Full CAD app reference, TypeScript, OSS, modern | Heavy, monorepo structure, not a library | Reference only |

### Recommended Approach: Two-Phase Strategy

**Phase A (Immediate)**: Use **occt-import-js** for STEP/IGES import
**Phase B (Q3 2026)**: Upgrade to **opencascade.js** for true B-rep operations
**Phase C (Q4+)**: Consider replicad wrapper for better ergonomics

---

## 2. Phase A: STEP Import via occt-import-js (Weeks 1–2)

### 2.1 Current Architecture (cycleCAD)

**File**: `/app/index.html`, `/app/js/export.js`, `/app/js/viewport.js`

Current geometry pipeline:
```
Sketch → Extrude/Revolve → Mesh (THREE.BufferGeometry) → Viewport
```

Operations are **visual approximations** (torus for fillet, cone for chamfer, visual booleans).

### 2.2 Integration Pattern (from ExplodeView)

ExplodeView's proven implementation (app.js lines 1077–1156):

```javascript
// 1. Lazy-load UMD script (not ES module)
async function getOcct() {
  if (typeof window.occtimportjs === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load OpenCASCADE WASM'));
      document.head.appendChild(script);
    });
  }
  return await window.occtimportjs();
}

// 2. Parse STEP file
async function loadSTEP(arrayBuffer) {
  const occt = await getOcct();
  const fileBuffer = new Uint8Array(arrayBuffer);
  const result = occt.ReadStepFile(fileBuffer, null);

  if (!result.success) {
    throw new Error('Failed to parse STEP file');
  }

  return result; // { meshes: [...], success: true }
}

// 3. Convert to Three.js geometry
function meshToThree(occtMesh) {
  const geometry = new THREE.BufferGeometry();
  const posArr = new Float32Array(occtMesh.attributes.position.array);
  geometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));

  if (occtMesh.attributes.normal) {
    const normArr = new Float32Array(occtMesh.attributes.normal.array);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  } else {
    geometry.computeVertexNormals();
  }

  if (occtMesh.index) {
    const idxArr = new Uint32Array(occtMesh.index.array);
    geometry.setIndex(new THREE.BufferAttribute(idxArr, 1));
  }

  return geometry;
}
```

### 2.3 Implementation for cycleCAD

**New file**: `/app/js/step-importer.js` (~300 lines)

```javascript
// app/js/step-importer.js

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

let _occtLoaded = null;

/**
 * Lazy-load occt-import-js from CDN
 * Returns the occt API object
 */
export async function getOcctAPI() {
  if (_occtLoaded) return _occtLoaded;

  if (typeof window.occtimportjs === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load occt-import-js WASM engine'));
      document.head.appendChild(script);
    });
  }

  _occtLoaded = await window.occtimportjs();
  return _occtLoaded;
}

/**
 * Import STEP/IGES/BREP file and return Three.js Group
 * @param {ArrayBuffer} fileBuffer - File data
 * @param {string} ext - File extension: 'step'|'stp'|'iges'|'igs'|'brep'
 * @param {object} params - Triangulation params {linearDeflection: 0.1, angularDeflection: 0.5}
 * @returns {THREE.Group} Group containing all imported meshes
 */
export async function importCADFile(fileBuffer, ext, params = null) {
  const occt = await getOcctAPI();
  const uint8Array = new Uint8Array(fileBuffer);

  let result;
  const extLower = ext.toLowerCase();

  try {
    if (extLower === 'iges' || extLower === 'igs') {
      result = occt.ReadIgesFile(uint8Array, params);
    } else if (extLower === 'brep') {
      result = occt.ReadBrepFile(uint8Array, params);
    } else if (extLower === 'step' || extLower === 'stp') {
      result = occt.ReadStepFile(uint8Array, params);
    } else {
      throw new Error(`Unsupported format: ${ext}`);
    }
  } catch (e) {
    throw new Error(`OpenCASCADE parse error: ${e.message}`);
  }

  if (!result.success) {
    throw new Error(`Failed to parse ${ext.toUpperCase()} file`);
  }

  // Convert OCCT meshes to Three.js Group
  const group = new THREE.Group();

  for (let i = 0; i < result.meshes.length; i++) {
    const occtMesh = result.meshes[i];
    const mesh = occtMeshToThreeMesh(occtMesh, i);
    group.add(mesh);
  }

  console.log(`[STEP Import] Loaded ${result.meshes.length} meshes from ${ext.toUpperCase()}`);
  return group;
}

/**
 * Convert a single OCCT mesh to THREE.Mesh
 * @param {object} occtMesh - OCCT mesh object
 * @param {number} index - Mesh index for naming
 * @returns {THREE.Mesh}
 */
function occtMeshToThreeMesh(occtMesh, index) {
  const geometry = new THREE.BufferGeometry();

  // Position data — ensure Float32Array
  const positions = occtMesh.attributes.position.array;
  const posArray = positions instanceof Float32Array
    ? positions
    : new Float32Array(positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

  // Normal data — ensure Float32Array
  if (occtMesh.attributes.normal) {
    const normals = occtMesh.attributes.normal.array;
    const normArray = normals instanceof Float32Array
      ? normals
      : new Float32Array(normals);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normArray, 3));
  } else {
    geometry.computeVertexNormals();
  }

  // Index data — ensure Uint32Array
  if (occtMesh.index) {
    const indices = occtMesh.index.array;
    let idxArray;
    if (indices instanceof Uint32Array) {
      idxArray = indices;
    } else if (indices instanceof Uint16Array) {
      idxArray = indices; // Keep as-is
    } else {
      idxArray = new Uint32Array(indices);
    }
    geometry.setIndex(new THREE.BufferAttribute(idxArray, 1));
  }

  // Material with color from OCCT if available
  let color = 0xa8b5bc; // Default grey
  if (occtMesh.color) {
    color = new THREE.Color(
      occtMesh.color[0] / 255,
      occtMesh.color[1] / 255,
      occtMesh.color[2] / 255
    );
  }

  const material = new THREE.MeshStandardMaterial({
    color: color,
    metalness: 0.35,
    roughness: 0.4,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `Imported_${index}`;

  return mesh;
}

/**
 * Handle file drop/upload in UI
 * @param {File} file - File from drop/input
 * @returns {Promise<THREE.Group>}
 */
export async function handleCADFileUpload(file) {
  const ext = file.name.split('.').pop();
  const supportedExts = ['step', 'stp', 'iges', 'igs', 'brep'];

  if (!supportedExts.includes(ext.toLowerCase())) {
    throw new Error(`Unsupported format: ${ext}`);
  }

  const arrayBuffer = await file.arrayBuffer();
  return importCADFile(arrayBuffer, ext);
}

/**
 * Get triangulation parameters based on model size
 * @param {THREE.Group} group - Imported group
 * @returns {object} Suggested params for re-import with different quality
 */
export function getTriangulationParams(boundingBox) {
  const size = boundingBox.getSize(new THREE.Vector3());
  const diagonal = size.length();

  // Suggested parameters based on model size
  return {
    coarse: {
      linearDeflection: diagonal * 0.01,
      angularDeflection: 10
    },
    medium: {
      linearDeflection: diagonal * 0.005,
      angularDeflection: 5
    },
    fine: {
      linearDeflection: diagonal * 0.001,
      angularDeflection: 1
    }
  };
}
```

### 2.4 UI Integration

**Update**: `/app/index.html` toolbar and file input

```html
<!-- In the toolbar, add File menu -->
<div id="file-menu" class="dropdown">
  <button class="toolbar-btn">📁 File</button>
  <div class="dropdown-content">
    <button onclick="handleImportClick()">Import STEP/IGES</button>
    <button onclick="handleExportSTEP()">Export as STEP</button>
  </div>
</div>

<!-- Hidden file input for import -->
<input
  type="file"
  id="cad-file-input"
  style="display: none"
  accept=".step,.stp,.iges,.igs,.brep"
  onchange="handleCADFileInputChange(event)"
/>
```

**New inline script in index.html**:

```javascript
// Import handler
async function handleImportClick() {
  document.getElementById('cad-file-input').click();
}

async function handleCADFileInputChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    // Show loading spinner
    document.getElementById('loading-spinner').style.display = 'block';

    // Import the file
    const group = await window.stepImporter.handleCADFileUpload(file);

    // Clear current scene
    viewport.clearScene();

    // Add imported geometry to scene
    viewport.scene.add(group);

    // Fit to view
    const bbox = new THREE.Box3().setFromObject(group);
    viewport.fitToObject(group);

    // Show success message
    showToast(`✓ Imported: ${file.name} (${group.children.length} parts)`);

    // Update feature tree
    updateTreeForImportedModel(group);

  } catch (error) {
    console.error('[Import Error]', error);
    showToast(`❌ Import failed: ${error.message}`, 'error');
  } finally {
    document.getElementById('loading-spinner').style.display = 'none';
    event.target.value = ''; // Reset input
  }
}
```

### 2.5 Export to STEP (Limitation & Workaround)

**Current limitation**: occt-import-js is **import-only**. For STEP export, we need opencascade.js (Phase B) or use a workaround:

```javascript
// Phase A workaround: Export current mesh as STL, offer STEP import
export async function exportAsSTL(mesh, filename) {
  // Use existing export.js meshToSTL()
  const stlData = meshToSTL(mesh);
  downloadFile(stlData, filename, 'application/octet-stream');
}

// Phase B: Real STEP export (future)
// export async function exportAsSTEP(geometry) {
//   const oc = await opencascade.js();
//   const shape = /* convert Three.js geometry to OCP TopoDS_Shape */;
//   const stepData = oc.StepWriter().WriteStepFile(shape);
//   downloadFile(stepData, filename, 'application/step');
// }
```

---

## 3. Phase B: Real B-rep Modeling via opencascade.js (Weeks 3–4 of Iteration 2)

### 3.1 Why opencascade.js (not occt-import-js)

| Capability | occt-import-js | opencascade.js |
|-----------|-----------------|-----------------|
| STEP Import | ✅ | ✅ |
| STEP Export | ❌ | ✅ |
| Boolean Union/Cut/Intersect | ❌ | ✅ |
| Real Fillet | ❌ | ✅ |
| Real Chamfer | ❌ | ✅ |
| Shell/Offset | ❌ | ✅ |
| Sweep/Loft from B-rep | ❌ | ✅ |
| Bundle Size | 100 KB | 3 MB |
| API Stability | Stable | Evolving |

### 3.2 opencascade.js Setup

**Installation** (ES module + CDN hybrid):

```javascript
// Option 1: npm + bundler (recommended for production)
// npm install opencascade.js
// import * as OC from 'opencascade.js';

// Option 2: CDN + UMD (for GitHub Pages/no build step)
async function getOpenCascade() {
  if (typeof window.opencascade !== 'undefined') {
    return window.opencascade;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/opencascade.js@1.0.2/dist/opencascade.wasm.js';
    script.onload = () => {
      if (typeof window.opencascade !== 'undefined') {
        resolve(window.opencascade);
      } else {
        reject(new Error('opencascade.js failed to load'));
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
```

### 3.3 Core Operations: Boolean Union, Cut, Intersect

**New file**: `/app/js/brep-operations.js` (~500 lines)

```javascript
// app/js/brep-operations.js

let _ocCached = null;

async function getOC() {
  if (!_ocCached) {
    const oc = await window.opencascadeLoaded;
    _ocCached = oc;
  }
  return _ocCached;
}

/**
 * Perform Boolean Union on two shapes
 * @param {TopoDS_Shape} shapeA - First shape
 * @param {TopoDS_Shape} shapeB - Second shape
 * @returns {TopoDS_Shape} Union result
 */
export async function booleanUnion(shapeA, shapeB) {
  const oc = await getOC();
  const algo = new oc.BRepAlgoAPI_Fuse(shapeA, shapeB);
  algo.Build();

  if (!algo.IsDone()) {
    throw new Error('Boolean union failed');
  }

  return algo.Shape();
}

/**
 * Perform Boolean Cut (A - B)
 * @param {TopoDS_Shape} shapeA - Base shape
 * @param {TopoDS_Shape} shapeB - Shape to subtract
 * @returns {TopoDS_Shape} Cut result
 */
export async function booleanCut(shapeA, shapeB) {
  const oc = await getOC();
  const algo = new oc.BRepAlgoAPI_Cut(shapeA, shapeB);
  algo.Build();

  if (!algo.IsDone()) {
    throw new Error('Boolean cut failed');
  }

  return algo.Shape();
}

/**
 * Perform Boolean Intersection
 * @param {TopoDS_Shape} shapeA - First shape
 * @param {TopoDS_Shape} shapeB - Second shape
 * @returns {TopoDS_Shape} Intersection result
 */
export async function booleanIntersect(shapeA, shapeB) {
  const oc = await getOC();
  const algo = new oc.BRepAlgoAPI_Common(shapeA, shapeB);
  algo.Build();

  if (!algo.IsDone()) {
    throw new Error('Boolean intersection failed');
  }

  return algo.Shape();
}

/**
 * Apply fillet to edges of a shape
 * @param {TopoDS_Shape} shape - Input shape
 * @param {number[]} edgeIndices - Indices of edges to fillet
 * @param {number} radius - Fillet radius in mm
 * @returns {TopoDS_Shape} Filleted shape
 */
export async function applyFillet(shape, edgeIndices, radius) {
  const oc = await getOC();
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape);

  // Select edges to fillet
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_EdgeType.TopAbs_EDGE);
  let edgeIdx = 0;

  while (explorer.More()) {
    const edge = oc.TopoDS.Edge(explorer.Current());

    if (edgeIndices.includes(edgeIdx)) {
      fillet.Add(radius, edge);
    }

    edgeIdx++;
    explorer.Next();
  }

  fillet.Build();

  if (!fillet.IsDone()) {
    throw new Error('Fillet operation failed');
  }

  return fillet.Shape();
}

/**
 * Apply chamfer to edges
 * @param {TopoDS_Shape} shape - Input shape
 * @param {number[]} edgeIndices - Indices of edges
 * @param {number} distance - Chamfer distance (mm)
 * @returns {TopoDS_Shape} Chamfered shape
 */
export async function applyChamfer(shape, edgeIndices, distance) {
  const oc = await getOC();
  const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);

  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_EdgeType.TopAbs_EDGE);
  let edgeIdx = 0;

  while (explorer.More()) {
    const edge = oc.TopoDS.Edge(explorer.Current());

    if (edgeIndices.includes(edgeIdx)) {
      chamfer.Add(distance, edge);
    }

    edgeIdx++;
    explorer.Next();
  }

  chamfer.Build();

  if (!chamfer.IsDone()) {
    throw new Error('Chamfer operation failed');
  }

  return chamfer.Shape();
}

/**
 * Create a shell/offset surface from a solid
 * @param {TopoDS_Shape} shape - Input solid
 * @param {number} offset - Offset distance (mm)
 * @returns {TopoDS_Shape} Offset shape
 */
export async function createShell(shape, offset) {
  const oc = await getOC();
  const shellMaker = new oc.BRepOffsetAPI_MakeOffset();
  shellMaker.Initialize(shape, offset, 1e-5);
  shellMaker.MakeOffset();

  if (!shellMaker.IsDone()) {
    throw new Error('Shell operation failed');
  }

  return shellMaker.Shape();
}

/**
 * Convert TopoDS_Shape to Three.js geometry
 * Requires mesh generation (triangulation)
 * @param {TopoDS_Shape} shape - OpenCascade shape
 * @param {number} linearDeflection - Mesh quality (default 0.01)
 * @returns {THREE.BufferGeometry}
 */
export async function shapeToThreeGeometry(shape, linearDeflection = 0.01) {
  const oc = await getOC();

  // Triangulate the shape
  const aParams = new oc.BRepMesh_IncrementalMesh(shape, linearDeflection, false, 0.5, true);

  // Extract triangles
  const triangles = [];
  const vertices = [];
  const indices = [];
  const vertexMap = new Map();

  // Iterate over faces
  const faceExplorer = new oc.TopExp_Explorer(shape, oc.TopAbs_FaceType.TopAbs_FACE);

  while (faceExplorer.More()) {
    const face = oc.TopoDS.Face(faceExplorer.Current());

    // Get triangulation
    let location = new oc.TopLoc_Location();
    const triangulation = oc.BRep_Tool.Triangulation(face, location);

    if (triangulation) {
      const nodes = triangulation.Nodes();
      const triangles = triangulation.Triangles();

      // Add vertices
      for (let i = 0; i < nodes.Length(); i++) {
        const pnt = nodes.Value(i + 1);
        vertices.push(pnt.X(), pnt.Y(), pnt.Z());
      }

      // Add indices
      for (let i = 0; i < triangles.Length(); i++) {
        const tri = triangles.Value(i + 1);
        indices.push(tri.X() - 1, tri.Y() - 1, tri.Z() - 1);
      }
    }

    faceExplorer.Next();
  }

  // Create Three.js geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}
```

### 3.4 Integration with operations.js

Replace current approximations with real B-rep operations:

```javascript
// In operations.js, update the boolean operations

export async function boolean(operandAIdx, operandBIdx, operation) {
  const operandA = window.allParts[operandAIdx];
  const operandB = window.allParts[operandBIdx];

  if (!operandA || !operandB) {
    throw new Error('Invalid operands');
  }

  // Convert current mesh geometry to TopoDS_Shape
  // (requires mesh-to-shape reconstruction — see Phase C)

  const ocShape = await window.brepOps.meshToShape(operandA.geometry);
  const toolShape = await window.brepOps.meshToShape(operandB.geometry);

  let resultShape;

  switch (operation) {
    case 'union':
      resultShape = await window.brepOps.booleanUnion(ocShape, toolShape);
      break;
    case 'cut':
      resultShape = await window.brepOps.booleanCut(ocShape, toolShape);
      break;
    case 'intersect':
      resultShape = await window.brepOps.booleanIntersect(ocShape, toolShape);
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  // Convert back to Three.js
  const resultGeometry = await window.brepOps.shapeToThreeGeometry(resultShape, 0.01);

  // Create feature history entry
  window.history.push({
    type: 'boolean',
    operandA: operandAIdx,
    operandB: operandBIdx,
    operation: operation,
    geometry: resultGeometry
  });

  return resultGeometry;
}
```

---

## 4. Performance Optimization

### 4.1 Web Worker Thread Pool

For heavy operations (boolean cuts on complex models), use Web Workers to avoid blocking the UI:

**New file**: `/app/js/geometry-worker.js` (Worker script)

```javascript
// app/js/geometry-worker.js

let opencascade = null;

self.onmessage = async (event) => {
  const { id, task, data } = event.data;

  try {
    let result;

    switch (task) {
      case 'booleanCut':
        result = await performBooleanCut(data.shapeA, data.shapeB);
        break;
      case 'applyFillet':
        result = await performFillet(data.shape, data.radius);
        break;
      case 'triangulate':
        result = await triangulateShape(data.shape);
        break;
      default:
        throw new Error(`Unknown task: ${task}`);
    }

    self.postMessage({ id, status: 'success', result });
  } catch (error) {
    self.postMessage({ id, status: 'error', error: error.message });
  }
};

async function performBooleanCut(shapeA, shapeB) {
  // Deserialize, perform operation, serialize result
  // ...
}
```

**Main thread usage**:

```javascript
export async function booleanCutAsync(shapeA, shapeB) {
  return new Promise((resolve, reject) => {
    const id = Math.random();
    const worker = new Worker('/app/js/geometry-worker.js');

    worker.onmessage = (e) => {
      if (e.data.id === id) {
        if (e.data.status === 'success') {
          resolve(e.data.result);
        } else {
          reject(new Error(e.data.error));
        }
        worker.terminate();
      }
    };

    worker.postMessage({ id, task: 'booleanCut', data: { shapeA, shapeB } });

    // Timeout after 30s
    setTimeout(() => {
      worker.terminate();
      reject(new Error('Geometry operation timeout'));
    }, 30000);
  });
}
```

### 4.2 Caching & Incremental Updates

Store computed shapes to avoid re-computation:

```javascript
class FeatureHistory {
  constructor() {
    this.features = [];
    this.shapeCache = new Map(); // featureIdx -> TopoDS_Shape
  }

  async getShapeAt(featureIdx) {
    if (this.shapeCache.has(featureIdx)) {
      return this.shapeCache.get(featureIdx);
    }

    // Recompute from scratch or from parent
    const shape = await this.computeFeature(featureIdx);
    this.shapeCache.set(featureIdx, shape);
    return shape;
  }

  invalidateCache(fromIdx) {
    // Clear cache from this feature onward
    for (let i = fromIdx; i < this.features.length; i++) {
      this.shapeCache.delete(i);
    }
  }
}
```

### 4.3 Memory Management

WASM modules can consume significant memory. Implement cleanup:

```javascript
export function cleanupOCCT() {
  // Delete unused shapes from OCCT memory
  if (window.shapeCacheOC) {
    for (const [key, shape] of window.shapeCacheOC) {
      // OpenCascade.js cleanup
      // shape.delete?.(); // if destructor exposed
    }
    window.shapeCacheOC.clear();
  }
}

// Call on app cleanup or periodically
window.addEventListener('beforeunload', cleanupOCCT);
```

---

## 5. STEP Export Implementation

Once opencascade.js is integrated, enable real STEP export:

```javascript
// app/js/step-exporter.js

export async function exportShapeAsSTEP(shape, filename) {
  const oc = await getOpenCascade();

  // Create a STEP writer
  const writer = new oc.STEPCAFControl_Writer();

  // Add shape to document
  const doc = new oc.TDocStd_Document('STEP');
  const handle = new oc.Handle_TDataStd_TreeNode();
  // ... complex document building ...

  // Write STEP file
  const stepStatus = writer.Write('output.step');

  if (stepStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetOK) {
    throw new Error('STEP export failed');
  }

  // Read file and download
  const stepData = fs.readFileSync('output.step');
  downloadFile(stepData, filename, 'application/step');
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```javascript
// test/step-importer.test.js

import { importCADFile, handleCADFileUpload } from '../app/js/step-importer.js';

describe('STEP Importer', () => {
  test('should import STEP file and return Three.js Group', async () => {
    const file = new File([stepFileBuffer], 'test.stp');
    const group = await handleCADFileUpload(file);

    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBeGreaterThan(0);
  });

  test('should handle IGES files', async () => {
    const file = new File([igesFileBuffer], 'test.iges');
    const group = await handleCADFileUpload(file);

    expect(group).toBeInstanceOf(THREE.Group);
  });
});
```

### 6.2 Integration Tests (with real DUO files)

Test against the actual Inventor project:

```bash
# In /sessions/sharp-modest-allen/test-step-import.js

const { importCADFile } = require('./mnt/cyclecad/app/js/step-importer.js');
const fs = require('fs');

// Test against DUO main assembly
const duoPath = '/sessions/sharp-modest-allen/mnt/cyclecad/example/DUO Durchgehend Inventor/Zusatzoptionen/DUOdurch/D-ZBG-DUO-Anlage.iam';
const buffer = fs.readFileSync(duoPath);

importCADFile(buffer, 'iam').then(group => {
  console.log(`✓ Loaded DUO assembly: ${group.children.length} parts`);

  // Validate geometry
  group.children.forEach((mesh, idx) => {
    console.log(`  Part ${idx}: ${mesh.geometry.attributes.position.array.length / 3} vertices`);
  });
}).catch(err => {
  console.error(`✗ Import failed: ${err.message}`);
});
```

### 6.3 Performance Benchmarks

Track operation time for optimization:

```javascript
class PerformanceMonitor {
  static timings = {};

  static mark(label) {
    this.timings[label] = { start: performance.now() };
  }

  static measure(label) {
    if (!this.timings[label]) return null;
    const duration = performance.now() - this.timings[label].start;
    console.log(`[Perf] ${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }
}

// Usage:
PerformanceMonitor.mark('boolean-cut');
const result = await booleanCut(shapeA, shapeB);
PerformanceMonitor.measure('boolean-cut');
```

---

## 7. Migration Path: From Approximations to B-rep

### Current State (v0.1.7)
- Fillet: torus radius approximation
- Chamfer: cone approximation
- Boolean: visual only, no topology
- Export: STL only

### After Phase A (Week 2)
- STEP/IGES import ✅
- Existing operations unchanged
- Both import & model operations coexist

### After Phase B (Week 4)
- Real fillet/chamfer replace approximations
- True boolean operations
- STEP export enabled
- Mesh approximation becomes optional backup

### Transition Strategy

To avoid breaking existing models:

```javascript
// In operations.js

export async function applyFillet(edges, radius, useRealBrEp = true) {
  if (useRealBrEp && window.brepOps) {
    try {
      return await window.brepOps.applyFillet(shape, edges, radius);
    } catch (e) {
      console.warn('B-rep fillet failed, falling back to approximation', e);
      return applyFilletApproximation(edges, radius); // Old method
    }
  } else {
    return applyFilletApproximation(edges, radius);
  }
}
```

---

## 8. Reference Architectures

### Chili3D Pattern (TypeScript + Monorepo)
- `/packages/chili-wasm/` — OpenCASCADE WASM bindings
- `/packages/chili-core/` — Core data model (FeatureTree, Document)
- `/packages/chili/` — 66+ CAD commands
- `/packages/chili-three/` — Three.js rendering bridge

**Lesson**: Separate geometry (WASM) from UI/rendering

### bitbybit.dev Pattern (npm Package + Rendering Agnostic)
- `@bitbybit-dev/occt` — Pure CAD engine
- Rendering: BabylonJS, Three.js, PlayCanvas (user's choice)
- Assembly support: XCAF colors preserved
- Build variants: 32-bit, 64-bit, 64-bit MT

**Lesson**: Decouple CAD kernel from rendering for flexibility

### ExplodeView Pattern (occt-import-js for Import Only)
- UMD script lazy-load (no build system needed)
- Convert OCCT meshes → THREE.BufferGeometry
- Works on GitHub Pages without bundler

**Lesson**: occt-import-js sufficient for viewers, but insufficient for modelers

---

## 9. Remaining Gaps (Phase C+)

The following require additional work beyond Phase A-B:

1. **Mesh-to-Shape Reconstruction** — Convert Three.js mesh → TopoDS_Shape
   - Needed for: booleans on parametric features
   - Solution: Implement mesh→B-rep reconstruction algorithm
   - Complexity: Medium (use OCCT BRepBuilderAPI_Sewing)

2. **Constraints from B-rep** — Extract dimensions/constraints from imported STEP
   - Needed for: Parametric editing of imported models
   - Solution: Parse STEP XML for dimension/constraint metadata
   - Complexity: High

3. **Assembly Mate Constraints** — Import assembly relationships
   - Needed for: Exploded view, kinematics
   - Solution: Parse STEP assembly structure (via bitbybit.dev reference)
   - Complexity: High

4. **Persistent Feature Tree** — Save/load STEP as feature history
   - Needed for: Round-trip parametric editing
   - Solution: Store geometry history + STEP references
   - Complexity: Medium

---

## 10. Checklist & Timeline

### Phase A: STEP Import (Week 1–2)
- [ ] Create `/app/js/step-importer.js` (~300 lines)
- [ ] Add file upload UI in index.html
- [ ] Test with DUO assembly files
- [ ] Update feature tree for imported models
- [ ] Commit and deploy to GitHub Pages
- [ ] Document usage in README

### Phase B: Real B-rep Operations (Week 3–4)
- [ ] Integrate opencascade.js via CDN
- [ ] Create `/app/js/brep-operations.js` (~500 lines)
- [ ] Replace fillet/chamfer approximations
- [ ] Implement real boolean union/cut/intersect
- [ ] Add Web Worker for heavy operations
- [ ] Test boolean ops on parametric features
- [ ] Implement STEP export
- [ ] Update operations.js to use new ops
- [ ] Performance benchmark against competitors

### Phase C & Beyond
- [ ] Mesh-to-shape reconstruction (needed for parametric booleans)
- [ ] Constraint extraction from STEP
- [ ] Assembly kinematics
- [ ] Persistent feature serialization

---

## 11. References & Resources

### Official Documentation
- [OpenCascade.js Official Docs](https://ocjs.org/)
- [occt-import-js Repository](https://github.com/kovacsv/occt-import-js)
- [OpenCascade.js GitHub](https://github.com/donalffons/opencascade.js)
- [Open CASCADE Technology Docs](https://dev.opencascade.org/doc/overview/html/)

### Reference Projects
- **Chili3D** (TypeScript, full CAD app): [xiangechen/chili3d](https://github.com/xiangechen/chili3d)
- **bitbybit.dev** (npm package, production): [bitbybit.dev](https://learn.bitbybit.dev/)
- **ReplicAD** (high-level API): [sgenoud/replicad](https://github.com/sgenoud/replicad)
- **ExplodeView** (existing, uses occt-import-js): `/sessions/sharp-modest-allen/mnt/explodeview/docs/demo/app.js` (lines 1077–1156)

### Articles
- [WebAssembly for CAD: When JavaScript Isn't Fast Enough](https://altersquare.medium.com/webassembly-for-cad-applications-when-javascript-isnt-fast-enough-56fcdc892004)
- [CadQuery WASM Discussion](https://github.com/CadQuery/cadquery/discussions/1876)

### Competitors' Tech Stacks
- **OnShape**: Proprietary, cloud C++ kernel
- **Fusion 360**: Desktop + cloud, closed-source
- **Aurorin CAD**: Uses replicad + custom UI
- **MecAgent**: SolidWorks plugin, not browser-native

---

## Conclusion

This integration plan provides a phased, low-risk approach to adding STEP import and real B-rep operations to cycleCAD. Phase A (occt-import-js) enables file import on GitHub Pages without bundling complexity. Phase B (opencascade.js) upgrades to full modeling capabilities, directly competing with OnShape and Fusion 360 on critical features.

**Key Decision**: occt-import-js for Phase A ensures quick wins and maintains ES module architecture. opencascade.js in Phase B provides the full power needed for the killer app.

**Competitive Advantage**: By Q3 2026, cycleCAD will offer:
- Free STEP import (vs. OnShape's $1,500/yr paywall)
- Real B-rep operations (vs. Aurorin's limited mesh editing)
- Agent-first API for AI workflows (unique)
- Open source & self-hostable (vs. proprietary cloud)

