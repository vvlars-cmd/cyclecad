# B-Rep Live Test Suite

**Quick start:** Open `brep-live-test.html` in a web browser.

## What is This?

A standalone interactive test page that downloads OpenCascade.js WASM (a full 3D CAD geometry kernel compiled to WebAssembly) and demonstrates real B-Rep (Boundary Representation) geometry operations with live 3D visualization in Three.js.

## Files

| File | Purpose |
|------|---------|
| `brep-live-test.html` | Main test page (all-in-one, no build needed) |
| `BREP-LIVE-TEST-GUIDE.md` | Complete documentation + API reference |
| `TESTING-CHECKLIST.md` | Pre-deployment validation steps |
| `README.md` | This file |

## Run Locally

```bash
cd ~/cyclecad
python -m http.server 8000
# Then open: http://localhost:8000/app/tests/brep-live-test.html
```

## What It Tests

**14 tests across 3 categories:**

- **Primitives (5):** Box, Cylinder, Sphere, Cone, Torus
- **Operations (6):** Fillet, Chamfer, Boolean Union/Cut/Intersect, Extrude
- **Analysis (3):** Mass Properties, Edge Count, Face Count

## How It Works

1. **Downloads OpenCascade.js WASM** — ~50MB binary (1-3 min on first load)
2. **Initializes Three.js scene** — Camera, lights, grid, OrbitControls
3. **Creates B-Rep geometry** — Using real OCP APIs (`BRepPrimAPI_MakeBox`, `BRepAlgoAPI_Fuse`, etc.)
4. **Tessellates to triangles** — `BRepMesh_IncrementalMesh` → extract faces → build THREE.BufferGeometry
5. **Renders in real-time** — 3D viewport with shadows, lighting, interaction

## Key Features

- Real B-Rep geometry (not mesh approximations)
- Interactive 3D camera (rotate, pan, zoom)
- Live FPS, triangle count, vertex count display
- Timestamped logging of all operations
- Dark VS Code-style UI
- Click individual tests or "Run All Tests"
- Status indicators (pending/running/passed/failed)
- Error handling with helpful messages

## Why This Matters

Validates that:
- OpenCascade.js WASM works in modern browsers
- Complex geometry operations execute in-browser
- Tessellation pipeline produces valid meshes
- Three.js can render large triangle counts (5k-10k per shape)
- B-Rep APIs are accessible and reliable

## Next Steps

1. Test locally and verify all 14 tests pass
2. Review `BREP-LIVE-TEST-GUIDE.md` for detailed API reference
3. Add new tests by following the pattern in `brep-live-test.html`
4. Deploy to GitHub Pages (automatic once pushed to main)
5. Integrate real B-Rep operations into cycleCAD `operations.js`

## Troubleshooting

See `BREP-LIVE-TEST-GUIDE.md` for common issues and solutions.

---

**Status:** Ready for testing
**Created:** 2026-03-31
