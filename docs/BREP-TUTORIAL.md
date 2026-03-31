# B-Rep (Boundary Representation) Modeling in cycleCAD

A comprehensive tutorial on real solid modeling using OpenCascade.js WASM in the browser.

## Table of Contents

1. [What is B-Rep and Why It Matters](#what-is-brep-and-why-it-matters)
2. [How OpenCascade.js Works in the Browser](#how-opencascadejs-works-in-the-browser)
3. [Getting Started with the B-Rep Kernel](#getting-started-with-the-brep-kernel)
4. [Step-by-Step: Your First Solid](#step-by-step-your-first-solid)
5. [Boolean Operations](#boolean-operations)
6. [Advanced Operations](#advanced-operations)
7. [STEP Import and Export](#step-import-and-export)
8. [Analyzing Your Models](#analyzing-your-models)
9. [Performance and Optimization](#performance-and-optimization)
10. [Troubleshooting](#troubleshooting)
11. [Complete API Reference](#complete-api-reference)

---

## What is B-Rep and Why It Matters

### B-Rep Definition

**B-Rep** (Boundary Representation) is a solid modeling technique that represents 3D objects using their boundary surfaces. Unlike voxel grids or point clouds, B-Rep captures complete topological information:

- **Vertices** — 0D points (corners)
- **Edges** — 1D curves connecting vertices
- **Faces** — 2D surfaces bounded by edges
- **Shells** — Collections of faces forming closed volumes
- **Solids** — Complete 3D shapes with topology

### Why B-Rep is Powerful

1. **Precision** — Geometry is defined mathematically (NURBS curves, analytical surfaces) rather than approximations
2. **Topology-Aware** — Knows which edges and faces belong to which solid, enabling intelligent operations
3. **Manufacturing-Ready** — Compatible with CAM (CNC, 3D printing, laser cutting) because it captures exact geometry
4. **Editable** — Can fillet specific edges, chamfer specific faces, or cut holes at precise locations
5. **Interoperable** — STEP (ISO 10303) is the universal CAD format, and B-Rep is its native representation

### B-Rep vs. Mesh

| Feature | B-Rep | Mesh |
|---------|-------|------|
| Topology | Full (edges, faces, vertices tracked) | Implicit (just triangles) |
| Precision | Infinite (mathematical surfaces) | Limited (tessellation dependent) |
| Editable | Can modify specific features | Difficult to modify cleanly |
| File Size | Compact (few curves) | Large (many triangles) |
| STEP Compatible | Yes (native) | No (conversion required) |
| Manufacturing | Direct CAM export | Requires healing/repair |

---

## How OpenCascade.js Works in the Browser

### What is OpenCascade.js?

OpenCascade.js is a **WebAssembly (WASM) compilation** of the OpenCASCADE 3D geometry kernel — the same library used by FreeCAD, Salome, and many professional CAD systems.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│  Your cycleCAD Code (JavaScript)                     │
├─────────────────────────────────────────────────────┤
│  BRepKernel (wrapper providing high-level API)      │
├─────────────────────────────────────────────────────┤
│  OpenCascade.js (WASM module, ~50MB)                │
├─────────────────────────────────────────────────────┤
│  Browser's WASM Runtime (V8, SpiderMonkey, etc.)    │
├─────────────────────────────────────────────────────┤
│  System Libraries (POSIX, memory management)        │
└─────────────────────────────────────────────────────┘
```

### Loading the WASM File

The first time you use the B-Rep kernel, it downloads the OpenCascade.js library:

1. **JavaScript** (~400KB) — loaded as a script tag, defines the Emscripten factory function
2. **WASM binary** (~50MB) — downloaded on demand, provides the actual geometry algorithms
3. **Initialization** — factory function creates an instance with proper memory setup

This happens **once per browser session** and is cached in IndexedDB if available.

### Why Lazy Loading?

Because 50MB is large, the kernel uses **lazy initialization**:
- If you only load a model and don't create new geometry, WASM is never downloaded
- If you start modeling, WASM loads automatically (users see a progress message)
- Subsequent operations are fast (WASM stays in memory)

---

## Getting Started with the B-Rep Kernel

### Initialization

```javascript
import BRepKernel from '/app/js/brep-kernel.js';

// Create an instance
const kernel = new BRepKernel();

// Initialize (lazy — loads WASM only when needed)
await kernel.init();

// Or with progress feedback
await kernel.init((loaded, total, percent) => {
  console.log(`Downloading: ${percent}%`);
});
```

### Basic Pattern

All B-Rep operations follow this pattern:

```javascript
// Create a shape
const result = await kernel.makeBox({width: 100, height: 50, depth: 30});
console.log('Shape ID:', result.id);          // 'shape_0'
console.log('Shape object:', result.shape);   // OCC TopoDS_Solid

// Apply an operation
const filleted = await kernel.fillet({
  shapeId: result.id,
  edgeIndices: [0, 1, 2, 3],
  radius: 5
});
// filleted = {id: 'shape_1', shape: <OCC object>}

// Convert to Three.js for visualization
const geometry = await kernel.shapeToMesh(filleted.id);
const mesh = new THREE.Mesh(
  geometry,
  new THREE.MeshStandardMaterial({color: 0x888888})
);
scene.add(mesh);
```

### Key Concepts

1. **Shape IDs** — Every operation returns a new shape with a unique ID (`shape_0`, `shape_1`, etc.)
2. **Immutability** — Operations don't modify the original; they return new shapes
3. **Caching** — All shapes are cached internally for reuse and memory efficiency
4. **Async/Await** — All operations are asynchronous (WASM can be slow for large geometries)

---

## Step-by-Step: Your First Solid

### 1. Create a Box and Add a Rounded Edge

```javascript
// Step 1: Create a box
const box = await kernel.makeBox({
  width: 100,   // X dimension
  height: 50,   // Y dimension
  depth: 30     // Z dimension
});

// Step 2: Get the edges (to see what we can fillet)
const edges = await kernel.getEdges(box.id);
console.log(`Box has ${edges.length} edges`);
// Output: Box has 12 edges

// Step 3: Fillet the top 4 edges with a 5mm radius
const filleted = await kernel.fillet({
  shapeId: box.id,
  edgeIndices: [0, 1, 2, 3],  // First 4 edges are typically the top edges
  radius: 5                     // 5mm radius
});

// Step 4: Visualize
const geometry = await kernel.shapeToMesh(filleted.id);
const material = new THREE.MeshStandardMaterial({
  color: 0xcccccc,
  metalness: 0.3,
  roughness: 0.7
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
```

### 2. Add a Beveled Edge

```javascript
// Chamfer bottom edges with a 2mm bevel
const chamfered = await kernel.chamfer({
  shapeId: filleted.id,  // Use the filleted shape as input
  edgeIndices: [8, 9, 10, 11],  // Bottom edges
  distance: 2
});
```

### 3. Create a Hollow Shell

```javascript
// Remove the top face and create a hollow box with 2mm walls
const hollow = await kernel.shell({
  shapeId: chamfered.id,
  removeFaceIndices: [4],  // Remove top face
  thickness: 2             // 2mm wall thickness
});

// Check the hollow box properties
const props = await kernel.getMassProperties({
  shapeId: hollow.id,
  density: 2.7  // Aluminum: 2.7 g/cm³
});

console.log(`Volume: ${props.volume} mm³`);
console.log(`Surface area: ${props.area} mm²`);
console.log(`Weight (aluminum): ${props.mass} grams`);
console.log(`Center of gravity:`, props.centerOfGravity);
```

---

## Boolean Operations

Boolean operations combine two or more solids. They are the foundation of solid modeling.

### Union (Fuse)

Combine two solids into one:

```javascript
// Create a base box
const box = await kernel.makeBox({width: 100, height: 50, depth: 30});

// Create a cylindrical feature to add
const cyl = await kernel.makeCylinder({radius: 15, height: 40});

// Union them
const combined = await kernel.booleanUnion({
  shapeA: box.id,
  shapeB: cyl.id
});

// Visualize the combined shape
const geometry = await kernel.shapeToMesh(combined.id);
// ...render as before
```

### Cut (Difference)

Subtract one solid from another:

```javascript
// Create a hole by subtracting a cylinder from the box
const withHole = await kernel.booleanCut({
  shapeA: combined.id,  // Base shape (box + cylinder)
  shapeB: cyl.id        // Tool shape (cylinder to subtract)
});

// Visualize
const geometry = await kernel.shapeToMesh(withHole.id);
// ...render
```

### Intersection (Common)

Keep only the overlapping region:

```javascript
// Find the intersection of two spheres
const sphere1 = await kernel.makeSphere({radius: 30});
const sphere2 = await kernel.makeSphere({radius: 30});

// Move sphere2 (would need translation if they're at same position)
const intersection = await kernel.booleanIntersect({
  shapeA: sphere1.id,
  shapeB: sphere2.id
});

// This creates a lens-shaped solid where they overlap
const geometry = await kernel.shapeToMesh(intersection.id);
// ...render
```

### Error Recovery

Boolean operations can fail if shapes have:
- Tiny gaps (numerical precision issues)
- Overlapping surfaces
- Degenerate geometry

The B-Rep kernel uses **3-tier error recovery**:

```javascript
try {
  const result = await kernel.booleanCut({
    shapeA: box.id,
    shapeB: tool.id
  });
} catch (err) {
  if (err.name === 'BRepError') {
    console.error('Operation failed:', err.message);
    console.error('Diagnostic:', err.diagnostic);
    // The error message will tell you which recovery tier failed
  }
}
```

The three tiers are:
1. **Standard** — Normal operation without tolerance adjustments
2. **Fuzzy Tolerance** — Allows small gaps/overlaps (0.01mm)
3. **Shape Healing** — Repairs degenerate geometry before retrying

---

## Advanced Operations

### Sweep (Profile Along Path)

Sweep a 2D profile along a 3D path:

```javascript
// Create a circular profile
const profile = await kernel.makeSphere({radius: 5});

// Create a path (would be a wire in production)
// For this example, we'll use the axis of extrusion
const swept = await kernel.sweep({
  profileId: profile.id,
  pathId: lineWire.id  // pathId should be a wire/curve
});

// Creates a shape that "drags" the profile along the path
const geometry = await kernel.shapeToMesh(swept.id);
// ...render
```

### Loft (Between Profiles)

Create a surface flowing between multiple 2D profiles:

```javascript
// Create profiles at different sizes
const base = await kernel.makeBox({width: 50, height: 50, depth: 1});
const mid = await kernel.makeBox({width: 40, height: 40, depth: 1});
const top = await kernel.makeBox({width: 20, height: 20, depth: 1});

// Loft between them
const lofted = await kernel.loft({
  profileIds: [base.id, mid.id, top.id],
  isSolid: true  // Create a solid, not just a shell
});

const geometry = await kernel.shapeToMesh(lofted.id);
// ...render
```

### Mirroring

Reflect a shape across a plane:

```javascript
// Mirror a box across the YZ plane
const mirrored = await kernel.mirror({
  shapeId: box.id,
  plane: {
    originX: 0,     // Plane passes through (0, 0, 0)
    originY: 0,
    originZ: 0,
    normalX: 1,     // Normal points in X direction (mirror across YZ)
    normalY: 0,
    normalZ: 0
  }
});

const geometry = await kernel.shapeToMesh(mirrored.id);
// ...render
```

---

## STEP Import and Export

### Export to STEP

Save your model as a standard STEP file (readable by any CAD software):

```javascript
// Export a single shape
const box = await kernel.makeBox({width: 100, height: 50, depth: 30});
const stepData = await kernel.exportSTEP([box.id], {
  fileName: 'mybox.stp',
  writeAscii: false  // Binary format (smaller file)
});

// Download the file
const blob = new Blob([stepData], {type: 'model/step'});
const url = URL.createObjectURL(blob);
const link = document.createElement('a');
link.href = url;
link.download = 'mybox.stp';
link.click();
URL.revokeObjectURL(url);
```

### Export Multiple Shapes

```javascript
// Export an assembly of multiple shapes
const box1 = await kernel.makeBox({width: 100, height: 50, depth: 30});
const box2 = await kernel.makeBox({width: 50, height: 50, depth: 50});

const stepData = await kernel.exportSTEP([box1.id, box2.id], {
  fileName: 'assembly.stp'
});

// ...download as shown above
```

### Import from STEP

Load a STEP file into cycleCAD:

```javascript
// User selects a .stp file
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.stp,.step';
fileInput.onchange = async (event) => {
  const file = event.target.files[0];
  const arrayBuffer = await file.arrayBuffer();

  // Import the shape
  const imported = await kernel.importSTEP(new Uint8Array(arrayBuffer));
  console.log('Imported shape:', imported.id);

  // Visualize it
  const geometry = await kernel.shapeToMesh(imported.id);
  const material = new THREE.MeshStandardMaterial({color: 0x888888});
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
};
fileInput.click();
```

### Workflow: Edit a CAD Model

```javascript
// 1. Import a model from STEP
const imported = await kernel.importSTEP(stepData);

// 2. Analyze it
const props = await kernel.getMassProperties({shapeId: imported.id, density: 7.85});
console.log('Original weight:', props.mass, 'grams');

// 3. Modify it (e.g., add fillets)
const edges = await kernel.getEdges(imported.id);
const improved = await kernel.fillet({
  shapeId: imported.id,
  edgeIndices: edges.slice(0, 4).map(e => e.index),
  radius: 2
});

// 4. Analyze the result
const newProps = await kernel.getMassProperties({shapeId: improved.id, density: 7.85});
console.log('Improved weight:', newProps.mass, 'grams');

// 5. Export back to STEP
const outputData = await kernel.exportSTEP([improved.id], {fileName: 'improved.stp'});
// ...download
```

---

## Analyzing Your Models

### Mass Properties

Calculate volume, area, weight, center of gravity, and moments of inertia:

```javascript
const shape = await kernel.makeBox({width: 100, height: 50, depth: 30});

const props = await kernel.getMassProperties({
  shapeId: shape.id,
  density: 2.7  // g/cm³ (aluminum)
});

console.log(`Volume: ${props.volume.toFixed(2)} mm³`);
console.log(`Surface area: ${props.area.toFixed(2)} mm²`);
console.log(`Weight: ${props.mass.toFixed(2)} grams (${(props.mass / 1000).toFixed(2)} kg)`);
console.log(`Center of gravity:`, {
  x: props.centerOfGravity.x.toFixed(2),
  y: props.centerOfGravity.y.toFixed(2),
  z: props.centerOfGravity.z.toFixed(2)
});
console.log(`Moments of inertia (kg·mm²):`, {
  Ixx: props.momentOfInertia.xx.toFixed(0),
  Iyy: props.momentOfInertia.yy.toFixed(0),
  Izz: props.momentOfInertia.zz.toFixed(0)
});
```

### Bounding Box

Get the extents of a shape:

```javascript
const bbox = await kernel.getBoundingBox(shape.id);

console.log(`Extents:`);
console.log(`  X: ${bbox.minX.toFixed(2)} to ${bbox.maxX.toFixed(2)} (width: ${bbox.width.toFixed(2)} mm)`);
console.log(`  Y: ${bbox.minY.toFixed(2)} to ${bbox.maxY.toFixed(2)} (height: ${bbox.height.toFixed(2)} mm)`);
console.log(`  Z: ${bbox.minZ.toFixed(2)} to ${bbox.maxZ.toFixed(2)} (depth: ${bbox.depth.toFixed(2)} mm)`);
```

### Topology Analysis

Examine the structure of a shape:

```javascript
const edges = await kernel.getEdges(shape.id);
const faces = await kernel.getFaces(shape.id);

console.log(`Shape has ${edges.length} edges and ${faces.length} faces`);

// Iterate over edges
edges.forEach((edgeObj) => {
  console.log(`Edge ${edgeObj.index}: ${edgeObj.name}`);
});

// Iterate over faces
faces.forEach((faceObj) => {
  console.log(`Face ${faceObj.index}: ${faceObj.name}`);
});
```

---

## Performance and Optimization

### Mesh Fineness

The `linearDeflection` parameter controls how fine the tessellation is:

```javascript
// Fine mesh (slower, more triangles)
const fineMesh = await kernel.shapeToMesh(shape.id, 0.01);  // 0.01mm deflection

// Coarse mesh (faster, fewer triangles)
const coarseMesh = await kernel.shapeToMesh(shape.id, 1.0);  // 1.0mm deflection
```

For visualization, `0.1mm` is usually a good balance. For 3D printing, use `0.01mm`.

### Memory Management

The kernel caches all shapes. For long sessions, clean up:

```javascript
// Get cache statistics
const stats = kernel.getCacheStats();
console.log(`Cached shapes: ${stats.shapeCount}`);

// Delete a specific shape
kernel.deleteShape(shape.id);

// Clear all shapes
kernel.clearCache();  // WARNING: invalidates all shape IDs
```

### Async Best Practices

```javascript
// DON'T wait for each operation sequentially
const box = await kernel.makeBox({width: 100, height: 50, depth: 30});
const cyl = await kernel.makeCylinder({radius: 15, height: 60});
const sphere = await kernel.makeSphere({radius: 25});

// DO create them in parallel
const [box, cyl, sphere] = await Promise.all([
  kernel.makeBox({width: 100, height: 50, depth: 30}),
  kernel.makeCylinder({radius: 15, height: 60}),
  kernel.makeSphere({radius: 25})
]);
```

---

## Troubleshooting

### WASM Loading Fails

**Problem**: "Failed to load OpenCascade.js from CDN"

**Solutions**:
1. Check internet connection
2. Verify CDN is not blocked by firewall/proxy
3. Check browser console for 404 errors
4. Try a different CDN or host locally
5. Use browser DevTools to debug network issues

### Boolean Operation Fails

**Problem**: "Cut failed at all recovery levels"

**Causes & Solutions**:
1. **Shapes don't overlap** — Verify the shapes actually intersect with bounding box check
2. **Self-intersecting faces** — Use shape healing: `kernel.shell()` or `kernel.fillet()` can clean up
3. **Tolerance issues** — Try scaling the model larger (1000mm instead of 1mm)
4. **Coplanar faces** — Ensure faces aren't exactly coplanar; translate one shape slightly

### Mesh Rendering is Slow

**Problem**: Visualization stutters when displaying large tessellations

**Solutions**:
1. Use coarser mesh deflection (0.5-1.0mm instead of 0.1mm)
2. Use instanced rendering for many identical shapes
3. Reduce lighting quality (fewer lights, lower shadow resolution)
4. Use THREE.js LOD (Level of Detail) system
5. Profile with Chrome DevTools to find bottleneck

### Fillet/Chamfer Produces Empty Shape

**Problem**: Operation returns a valid shape ID but mesh is empty

**Causes & Solutions**:
1. **Fillet radius too large** — Radius must be smaller than local edge curvature
2. **Wrong edge indices** — Verify edge count with `kernel.getEdges()`
3. **Invalid shape** — Check that input shape is valid solid (not a wire or shell)

---

## Complete API Reference

### Initialization

| Method | Returns | Description |
|--------|---------|-------------|
| `init([onProgress])` | `Promise<Object>` | Load WASM from CDN. Call once per session. |

### Primitives

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `makeBox(options)` | `{width, height, depth, x?, y?, z?}` | `{id, shape}` | Create rectangular box |
| `makeCylinder(options)` | `{radius, height, angle?}` | `{id, shape}` | Create cylinder (360° or wedge) |
| `makeSphere(options)` | `{radius}` | `{id, shape}` | Create sphere |
| `makeCone(options)` | `{radius1, radius2, height}` | `{id, shape}` | Create cone or frustum |
| `makeTorus(options)` | `{majorRadius, minorRadius}` | `{id, shape}` | Create torus |

### Transformations

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `extrude(options)` | `{shapeId, dirX, dirY, dirZ, depth}` | `{id, shape}` | Extrude profile along vector |
| `revolve(options)` | `{shapeId, axisX, axisY, axisZ, dirX, dirY, dirZ, angle?}` | `{id, shape}` | Revolve profile around axis |
| `sweep(options)` | `{profileId, pathId}` | `{id, shape}` | Sweep profile along path |
| `loft(options)` | `{profileIds, isSolid?}` | `{id, shape}` | Loft between profiles |
| `mirror(options)` | `{shapeId, plane}` | `{id, shape}` | Mirror across plane |

### Boolean Operations

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `booleanUnion(options)` | `{shapeA, shapeB}` | `{id, shape}` | Union of two shapes (3-tier recovery) |
| `booleanCut(options)` | `{shapeA, shapeB}` | `{id, shape}` | Cut shapeB from shapeA (3-tier recovery) |
| `booleanIntersect(options)` | `{shapeA, shapeB}` | `{id, shape}` | Intersection of two shapes (3-tier recovery) |

### Modifiers

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `fillet(options)` | `{shapeId, edgeIndices, radius}` | `{id, shape}` | Round edges with real B-Rep |
| `chamfer(options)` | `{shapeId, edgeIndices, distance}` | `{id, shape}` | Bevel edges with sharp angle |
| `shell(options)` | `{shapeId, removeFaceIndices?, thickness}` | `{id, shape}` | Create hollow shell |

### Topology

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getEdges(shapeId)` | `shapeId: string` | `Promise<Array>` | Get all edges with indices |
| `getFaces(shapeId)` | `shapeId: string` | `Promise<Array>` | Get all faces with indices |

### Visualization & Analysis

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `shapeToMesh(shapeId, deflection?)` | `shapeId, deflection?` | `THREE.BufferGeometry` | Tessellate to Three.js mesh |
| `getMassProperties(options)` | `{shapeId, density?}` | `{volume, area, mass, cog, moi}` | Compute mass properties |
| `getBoundingBox(shapeId)` | `shapeId: string` | `{minX, minY, minZ, maxX, maxY, maxZ, width, height, depth}` | Get bounds |

### File I/O

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `exportSTEP(shapeIds, options?)` | `[shapeIds], {fileName?, writeAscii?}` | `Uint8Array` | Export to STEP format |
| `importSTEP(stepData)` | `ArrayBuffer \| Uint8Array` | `{id, shape, count}` | Import from STEP |

### Utility

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getShapeInfo(shapeId)` | `shapeId: string` | `Object \| null` | Get cached metadata |
| `deleteShape(shapeId)` | `shapeId: string` | `boolean` | Remove shape from cache |
| `clearCache()` | (none) | (none) | Clear all cached shapes |
| `getCacheStats()` | (none) | `{shapeCount, memoryEstimate}` | Get cache statistics |

---

## Examples

### Example 1: Manufacturing a Bracket

```javascript
// 1. Create the base plate
const plate = await kernel.makeBox({width: 100, height: 50, depth: 10});

// 2. Create mounting holes
const hole1 = await kernel.makeCylinder({radius: 5, height: 15});
const hole2 = await kernel.makeCylinder({radius: 5, height: 15});

// 3. Subtract holes from plate
let bracket = await kernel.booleanCut({shapeA: plate.id, shapeB: hole1.id});
bracket = await kernel.booleanCut({shapeA: bracket.id, shapeB: hole2.id});

// 4. Round edges for safety
const edges = await kernel.getEdges(bracket.id);
bracket = await kernel.fillet({
  shapeId: bracket.id,
  edgeIndices: [0, 1, 2, 3],  // Top edges
  radius: 2
});

// 5. Analyze
const props = await kernel.getMassProperties({
  shapeId: bracket.id,
  density: 2.7  // Aluminum
});
console.log(`Weight: ${(props.mass / 1000).toFixed(2)} kg`);

// 6. Export for machining
const stepData = await kernel.exportSTEP([bracket.id]);
```

### Example 2: Organic Shape via Loft

```javascript
// 1. Create profiles at different Z heights
const base = await kernel.makeBox({width: 50, height: 50, depth: 1});
const mid = await kernel.makeBox({width: 40, height: 40, depth: 1});
const top = await kernel.makeBox({width: 20, height: 20, depth: 1});

// 2. Loft between them
const organic = await kernel.loft({
  profileIds: [base.id, mid.id, top.id],
  isSolid: true
});

// 3. Visualize with smooth shading
const geometry = await kernel.shapeToMesh(organic.id, 0.1);
const material = new THREE.MeshStandardMaterial({
  color: 0x6fa3d0,
  metalness: 0.2,
  roughness: 0.8
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
```

---

## Performance Tips

1. **Lazy load** — WASM only loads when first geometry op happens
2. **Batch operations** — Use `Promise.all()` for parallel shape creation
3. **Cache meshes** — Don't regenerate THREE.js geometries; cache them
4. **Reduce precision** — Use 0.5-1.0mm deflection for viewport, 0.1mm for export
5. **Clean up** — Call `kernel.deleteShape()` or `kernel.clearCache()` in long sessions
6. **Monitor memory** — Use DevTools to watch for memory leaks

---

## Next Steps

1. **Try the test suite** — Run `/app/tests/brep-tests.html` to see all features
2. **Integrate into cycleCAD** — Wire `BRepKernel` into the main CAD app
3. **Build importers** — Parse Inventor .ipt files and convert to B-Rep shapes
4. **Implement CAM export** — Generate G-code from B-Rep shapes for 3D printing/CNC
5. **Add collaboration** — Share B-Rep models via WebSockets or IndexedDB

---

## Resources

- **OpenCascade Documentation**: https://dev.opencascade.org/cdoc
- **OpenCascade.js GitHub**: https://github.com/CadQuery/opencascade.js
- **STEP Format (ISO 10303)**: https://en.wikipedia.org/wiki/ISO_10303
- **B-Rep Theory**: *An Introduction to NURBS* by Rogers & Adams

---

**Last Updated**: 2026-03-31
**B-Rep Kernel Version**: 3.0.0
