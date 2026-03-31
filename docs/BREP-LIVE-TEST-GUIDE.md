# B-Rep Live Test Guide — OpenCascade.js WASM + Three.js

**File location:** `/app/tests/brep-live-test.html`

**Status:** Live testing tool for B-Rep (Boundary Representation) geometry operations using OpenCascade.js WASM binary and Three.js visualization.

---

## Overview

This test page downloads the full OpenCascade.js WASM library (~50MB) directly in the browser and runs real B-Rep geometry operations (primitives, boolean operations, fillets, tessellation) with live 3D visualization.

### Key Features:
- **Live WASM Loading** — Downloads OpenCascade.js WASM with progress bar
- **14 Test Categories** — Primitives (5), Operations (6), Analysis (3)
- **Real B-Rep Geometry** — Not meshes or approximations — actual topological shapes
- **Tessellation Pipeline** — `BRepMesh_IncrementalMesh` → triangle extraction → Three.js rendering
- **Interactive Testing** — Click tests individually or run all
- **Real-time Stats** — FPS, triangle count, vertex count, operation time
- **Dark Theme UI** — VS Code-style sidebar, viewport, and log panel

---

## How to Run

### Option 1: Local Browser
```bash
cd ~/cyclecad
# Open in browser (needs HTTPS for Web APIs):
python -m http.server 8000
# Navigate to: https://localhost:8000/app/tests/brep-live-test.html
# (or http://localhost:8000 for test purposes)
```

### Option 2: GitHub Pages
```bash
# After pushing to repo:
https://vvlars-cmd.github.io/cyclecad/app/tests/brep-live-test.html
```

### What to Expect:
1. **Page loads** — Header shows "WASM: Loading..." with progress bar
2. **WASM downloads** — ~50MB download (1-3 minutes on typical connection)
3. **Initialization** — OpenCascade.js factory function instantiated with WASM binary
4. **Ready state** — "Run All Tests" button enables, status shows "Ready"
5. **Click any test** or **Click "Run All Tests"**
6. **3D viewport** shows rendered geometry
7. **Log panel** shows timing and geometry stats

---

## Test Categories

### Primitives (5 tests)
Tests basic shape creation from OpenCascade.js WASM APIs.

| Test | API | What It Validates |
|------|-----|-------------------|
| **Box** | `BRepPrimAPI_MakeBox_3(100, 50, 30)` | Basic rectangular solid creation |
| **Cylinder** | `BRepPrimAPI_MakeCylinder_2(25, 60)` | Circular solid with radius and height |
| **Sphere** | `BRepPrimAPI_MakeSphere_1(30)` | Spherical solid with radius |
| **Cone** | `BRepPrimAPI_MakeCone_3(20, 5, 50)` | Tapered solid, two radii + height |
| **Torus** | `BRepPrimAPI_MakeTorus_3(30, 8)` | Doughnut shape, major and minor radius |

**Expected results:** All should tessellate into 1,000–5,000 triangles and render in blue.

---

### Operations (6 tests)
Tests edge and boolean operations on B-Rep shapes.

| Test | API | What It Validates |
|------|-----|-------------------|
| **Fillet** | `BRepFilletAPI_MakeFillet` + edge iterator | Smooth all edges of a box with 5mm radius |
| **Chamfer** | `BRepFilletAPI_MakeChamfer` + edge iterator | Beveled edges of a box with 3mm chamfer |
| **Union** | `BRepAlgoAPI_Fuse(box, cylinder)` | Boolean sum — combines two solids |
| **Cut** | `BRepAlgoAPI_Cut(box, cylinder)` | Boolean subtraction — removes cylinder from box |
| **Intersect** | `BRepAlgoAPI_Common(box, sphere)` | Boolean intersection — overlapping region only |
| **Extrude** | `BRepPrimAPI_MakePrism(face, direction)` | Extrude a 2D face into 3D solid |

**Expected results:**
- **Fillet/Chamfer:** Edges round/bevel smoothly
- **Union:** Two shapes merge into one
- **Cut:** Cylindrical hole through box
- **Intersect:** Partial overlap of box and sphere
- **Extrude:** Face extruded 50mm in Z direction

---

### Analysis (3 tests)
Tests topological analysis and mass properties.

| Test | API | What It Validates |
|------|-----|-------------------|
| **Mass Properties** | `BRepGProp_GProps` (volume + area) | Volume and surface area calculation |
| **Edge Count** | `TopExp_Explorer(shape, TopAbs_EDGE)` | Topological iterator counts edges |
| **Face Count** | `TopExp_Explorer(shape, TopAbs_FACE)` | Topological iterator counts faces |

**Expected results:**
- **Mass:** Box (100×50×30) = 150,000 mm³, area = 22,000 mm²
- **Edges:** Box = 12 edges (rectangular solid)
- **Faces:** Box = 6 faces (rectangular solid)

---

## UI Layout

```
┌────────────────────────────────────────────────────────────────┐
│  B-Rep Live Test — OpenCascade.js WASM + Three.js              │
│  [WASM: 100%]                                  [Run All Tests]  │
├──────────────┬──────────────────────────────────────────────────┤
│ Tests (14)   │  3D Viewport                                     │
│ [Run All]    │  ┌────────────────────────────────────────────┐  │
│              │  │                                            │  │
│ ✓ Box        │  │         [Blue Box — tessellated]          │  │
│ ✓ Cylinder   │  │                                            │  │
│ ✓ Fillet     │  │  FPS: 60                                   │  │
│ ✕ Union      │  │  Triangles: 8,423                         │  │
│ ⏳ Cut       │  │  Vertices: 4,521                          │  │
│              │  │  Operation: Fillet (box + 5mm edges)      │  │
│              │  └────────────────────────────────────────────┘  │
├──────────────┴──────────────────────────────────────────────────┤
│ [14:32:15] Box: 45.3ms, 2834 triangles                          │
│ [14:32:16] Cylinder: 28.1ms, 1204 triangles                    │
│ [14:32:17] Fillet: 89.2ms, 4521 triangles                      │
│ [14:32:18] Union: FAILED — BRepAlgoAPI_Fuse not found          │
└────────────────────────────────────────────────────────────────┘
```

### Sidebar (Left)
- **Test List** — All 14 tests grouped by category
- **Status Indicators:**
  - `—` = Pending (not yet run)
  - `⟳` = Running (in progress)
  - `✓` = Passed (green border, time shown)
  - `✕` = Failed (red border, time shown)
- **Click to run individual test**

### Viewport (Center/Right)
- **3D view** of current geometry
- **OrbitControls** — left-click drag to rotate, right-click drag to pan, scroll to zoom
- **Grid floor** for reference
- **Stats overlay** (top-right):
  - FPS (frames per second)
  - Triangle count
  - Vertex count
  - Current operation name

### Footer (Bottom)
- **Log panel** with timestamps
- Shows operation names, timings, and results
- Color-coded: green = success, red = error, yellow = warning
- Auto-scrolls to latest entry

---

## Understanding the Tests

### Tessellation Pipeline

Each geometry operation follows this pipeline:

```
1. Create B-Rep Shape (OCP API)
   └─ BRepPrimAPI_MakeBox, BRepAlgoAPI_Fuse, etc.

2. Mesh the Shape
   └─ BRepMesh_IncrementalMesh(shape, linearDeflection=0.1)

3. Extract Triangles
   └─ TopExp_Explorer → iterate faces → BRep_Tool.Triangulation
   └─ Each face yields nodes[] and triangles[]

4. Build Three.js Geometry
   └─ BufferGeometry with vertices, indices, normals

5. Render
   └─ MeshStandardMaterial (blue, metallic)
   └─ Fit camera to bounding box
```

### Deflection Parameter
- **`linearDeflection = 0.1`** — Controls mesh coarseness
- Smaller = finer mesh (more triangles, slower)
- Larger = coarser mesh (fewer triangles, faster)
- **0.1** is good balance for visualization

---

## Adding New Tests

### Step 1: Add Test Definition
In the `tests` array at the top of the script:

```javascript
const tests = [
    // ... existing tests ...
    { id: 'mytest', name: 'My Test (description)', category: 'NewCategory' },
];
```

### Step 2: Add Test Implementation
In the `runTest()` function, add an `else if` block:

```javascript
else if (testId === 'mytest') {
    // Create B-Rep shape using OCP API
    const shape = new oc.BRepPrimAPI_MakeSomething(...).Shape();

    // Tessellate
    const tessData = tessellateShape(shape);
    if (!tessData) throw new Error('Tessellation failed');

    // Render
    const { triangleCount, vertexCount } = renderGeometry(tessData.vertices, tessData.indices);

    // Log result
    const elapsed = performance.now() - startTime;
    log(`${test.name}: ${elapsed.toFixed(1)}ms, ${triangleCount} triangles`, 'success');
    updateTestStatus(testId, 'passed', elapsed);
}
```

### Step 3: Find the Right OCP API
Consult OpenCascade.js documentation or OCCT source:

**Common patterns:**
- `new oc.BRepPrimAPI_MakeSomething(params).Shape()`
- `new oc.BRepAlgoAPI_Operation(shape1, shape2).Shape()`
- `new oc.BRepFilletAPI_Make*(shape).Add(...).Shape()`

**Overload naming:**
- `_1`, `_2`, `_3` suffixes = different parameter combinations
- Try variants if one doesn't work

**Example — Finding overloads for Box:**
```javascript
// Try these in order:
new oc.BRepPrimAPI_MakeBox_1(aXmin, aYmin, aZmin, aXmax, aYmax, aZmax)
new oc.BRepPrimAPI_MakeBox_2(aCorner, aX, aY, aZ)  // position + dimensions
new oc.BRepPrimAPI_MakeBox_3(aX, aY, aZ)  // origin (0,0,0) + dimensions
```

---

## Troubleshooting

### WASM Download Fails
**Error:** `Failed to fetch WASM: 404`

**Cause:** CDN URL changed or WASM file moved

**Fix:** Update `CDN_BASE` in the script:
```javascript
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/';
```

Verify latest beta version:
```bash
npm view opencascade.js dist-tags
```

---

### WASM Hangs During Load
**Error:** Page freezes, no progress update

**Cause:** WASM is very large (~50MB) and browser tab may become unresponsive

**Fix:** Wait 1-3 minutes. Check network tab in DevTools (F12 → Network). If nothing is downloading, refresh and try again.

---

### Test Shows "Tessellation Failed"
**Error:** Operation creates shape but tessellation returns null

**Cause:** Shape has no faces or bad topology

**Fix:**
1. Check operation result with `TopExp_Explorer` to count faces
2. Verify linear deflection is reasonable (0.05–1.0)
3. Some operations may require `ShapeUpgrade_ShapeFix`

**Code to debug:**
```javascript
const faceExplorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE);
let faceCount = 0;
while (faceExplorer.More()) {
    faceCount++;
    faceExplorer.Next();
}
console.log('Face count:', faceCount);
```

---

### Test Fails: "BRepSomethingAPI Not Found"
**Error:** `new oc.BRepSomethingAPI_MakeThing is not a function`

**Cause:** API doesn't exist in this version of OpenCascade.js or wrong overload

**Fix:**
1. Check spelling (case-sensitive)
2. Try `_1`, `_2`, `_3` overloads
3. Some APIs may not be bound in WASM yet

**Workaround:** Simplify the test or use alternative API:
```javascript
// Instead of complex operation, use primitive
const shape = new oc.BRepPrimAPI_MakeSphere_1(30).Shape();
```

---

### Viewport Shows Black Screen
**Error:** Nothing renders, no error in log

**Cause:** Camera positioned inside mesh

**Fix:** Already handled by auto-fit logic:
```javascript
const bbox = new THREE.Box3().setFromObject(currentMesh);
const size = bbox.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
camera.position.z = cameraZ;
```

If still black, check console (F12 → Console) for errors.

---

## Performance Notes

### Expected Timings (on modern machine)
- **Primitives:** 10–50ms per shape
- **Fillet/Chamfer:** 50–150ms (depends on edge count)
- **Boolean ops:** 20–100ms (depends on complexity)
- **Tessellation:** 5–30ms (included in total)
- **Rendering:** 1–5ms per frame (60 FPS target)

### Memory Usage
- **WASM binary:** ~50MB (loaded once)
- **Per shape:** 1–10MB depending on tessellation detail

---

## API Reference — Common OCP Methods

### Primitive Creation
```javascript
new oc.BRepPrimAPI_MakeBox_3(sizeX, sizeY, sizeZ)
new oc.BRepPrimAPI_MakeCylinder_2(radius, height)
new oc.BRepPrimAPI_MakeSphere_1(radius)
new oc.BRepPrimAPI_MakeCone_3(radius1, radius2, height)
new oc.BRepPrimAPI_MakeTorus_3(majorRadius, minorRadius)
```

### Boolean Operations
```javascript
new oc.BRepAlgoAPI_Fuse(shape1, shape2)           // Union
new oc.BRepAlgoAPI_Cut(shape1, shape2)            // Subtraction
new oc.BRepAlgoAPI_Common(shape1, shape2)         // Intersection
```

### Edge/Face Operations
```javascript
new oc.BRepFilletAPI_MakeFillet(shape)            // Fillet edges
new oc.BRepFilletAPI_MakeChamfer(shape)           // Chamfer edges
makeFillet.Add(radius, edge)                      // Add edge to fillet
```

### Tessellation
```javascript
new oc.BRepMesh_IncrementalMesh(shape, deflection)
oc.BRep_Tool.Triangulation(face)                  // Get mesh data from face
```

### Topology Iteration
```javascript
new oc.TopExp_Explorer(shape, shapeType)  // shapeType: TopAbs_EDGE, TopAbs_FACE, etc.
explorer.More()                           // Check if more elements
explorer.Current()                        // Get current element
explorer.Next()                           // Move to next
```

### Properties
```javascript
new oc.GProp_GProps()
oc.BRepGProp.VolumeProperties(shape, props)
oc.BRepGProp.SurfaceProperties(shape, props)
props.Mass()                              // Get mass (volume or area)
```

---

## Debugging Tips

### Enable Console Logging
Open browser DevTools (F12) and check the **Console** tab for:
- WASM download progress
- Initialization messages
- Operation timings
- Error messages from OCP API

### Check Network Tab
**F12 → Network** to see:
- `opencascade.full.js` (404KB, should complete in <1s)
- `opencascade.full.wasm` (50MB, should complete in 1–3 minutes depending on connection)

### Inspect 3D Geometry
In browser console, access globals:
```javascript
// Inspect scene
console.log(window.scene);
console.log(window.currentMesh);

// Check geometry stats
console.log(window.currentMesh.geometry);
console.log(window.currentMesh.geometry.attributes.position.count);
```

---

## Next Steps

### Integration with cycleCAD
This test page validates that OpenCascade.js WASM works in the browser. Next:

1. **Integrate into cycleCAD app** — Add real B-Rep operations to `operations.js`
2. **STEP import** — Use `occt-import-js` or OpenCascade.js to read STEP files
3. **Export** — Implement STEP/IGES/BREP export via OCP API

### Known Limitations
- Some advanced OCP APIs may not be bound in WASM
- Very large shapes (100k+ faces) may be slow
- Linear deflection can be adjusted per operation
- No constraint solving (2D sketch → 3D part)

---

## References

- **OpenCascade.js**: https://github.com/donalffons/opencascade.js
- **OCCT API Docs**: https://dev.opencascade.org/doc/refman/latest/html/
- **Three.js r170**: https://threejs.org/docs/
- **BRepMesh Guide**: https://dev.opencascade.org/doc/refman/latest/html/class_b_rep_mesh___incremental_mesh.html

---

**Last updated:** 2026-03-31
**Status:** Ready for testing and extension
