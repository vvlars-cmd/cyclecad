# B-Rep Live Test — Pre-Deployment Checklist

## Files Created
- [x] `/app/tests/brep-live-test.html` — Main test page (848 lines, 31KB)
- [x] `/docs/BREP-LIVE-TEST-GUIDE.md` — Complete guide (453 lines, 16KB)
- [x] `/app/tests/TESTING-CHECKLIST.md` — This file

## Test Page Validation Checklist

### WASM Loading
- [ ] CDN URL resolves: `https://cdn.jsdelivr.net/npm/opencascade.js@2.0.0-beta.b5ff984/dist/`
- [ ] Progress bar shows 0-100% during download
- [ ] "Ready" message appears when complete
- [ ] "Run All Tests" button enables

### Three.js Setup
- [ ] Canvas renders in viewport
- [ ] Grid floor visible
- [ ] Lights casting shadows
- [ ] OrbitControls respond to mouse (rotate, pan, zoom)

### Test Execution

#### Primitives (5 tests)
- [ ] Box: Renders cube, 12 edges shown in log
- [ ] Cylinder: Renders cylinder, circular face visible
- [ ] Sphere: Renders sphere, smooth surface
- [ ] Cone: Renders cone, tapered shape visible
- [ ] Torus: Renders doughnut shape

#### Operations (6 tests)
- [ ] Fillet: Box edges are rounded/smooth
- [ ] Chamfer: Box edges are beveled
- [ ] Union: Box and cylinder merged together
- [ ] Cut: Cylindrical hole visible in box
- [ ] Intersect: Overlapping region only visible
- [ ] Extrude: 2D face becomes 3D solid

#### Analysis (3 tests)
- [ ] Mass: Displays volume and area in log
- [ ] Edges: Displays edge count (box = 12)
- [ ] Faces: Displays face count (box = 6)

### UI Behavior
- [ ] Individual test click runs that test
- [ ] "Run All Tests" runs 14 tests in sequence
- [ ] Status indicators update: pending → running → passed/failed
- [ ] Timing displays in milliseconds
- [ ] Log panel auto-scrolls to latest message
- [ ] Stats overlay updates (FPS, triangles, vertices)
- [ ] Test list groups by category (Primitives/Operations/Analysis)

### Error Handling
- [ ] Network error shows clear message
- [ ] WASM init failure displays suggestion
- [ ] Tessellation failure logged without crashing app
- [ ] Missing OCP API falls back gracefully

### Performance
- [ ] FPS ≥ 30 during rotation
- [ ] Primitives render in <100ms each
- [ ] Boolean ops render in <200ms each
- [ ] No memory leaks over multiple test runs

## Deployment Steps

### Local Testing
```bash
# Ensure directory exists
mkdir -p ~/cyclecad/app/tests

# Files should already exist:
ls -l ~/cyclecad/app/tests/brep-live-test.html
ls -l ~/cyclecad/docs/BREP-LIVE-TEST-GUIDE.md

# Start local server
cd ~/cyclecad
python -m http.server 8000

# Open in browser (may need HTTPS for some features):
http://localhost:8000/app/tests/brep-live-test.html
```

### Git Commit
```bash
cd ~/cyclecad
rm -f .git/HEAD.lock .git/index.lock

git add app/tests/brep-live-test.html
git add docs/BREP-LIVE-TEST-GUIDE.md
git add app/tests/TESTING-CHECKLIST.md

git commit -m "Add B-Rep live test page with OpenCascade.js WASM + Three.js visualization

- brep-live-test.html: Interactive test harness for 14 B-Rep operations
- BREP-LIVE-TEST-GUIDE.md: Complete documentation with API reference
- WASM download progress tracking (50MB OpenCascade.js binary)
- Real tessellation pipeline: BRepMesh -> TopExp_Explorer -> THREE.BufferGeometry
- 5 primitives + 6 operations + 3 analysis tests
- Dark VS Code-style UI with sidebar, viewport, stats, logging
"

git push origin main
```

### GitHub Pages Deployment
Once pushed to main, test page is automatically available at:
```
https://vvlars-cmd.github.io/cyclecad/app/tests/brep-live-test.html
```

## Known Issues & Workarounds

### Issue: WASM Download Hangs
**Symptom:** Progress bar stuck at 0% or freezes browser
**Workaround:**
1. Wait 2-3 minutes (first load takes time)
2. Check DevTools Network tab (F12)
3. Refresh page and try again

### Issue: "BRepFilletAPI_MakeFillet is not a function"
**Symptom:** Test fails with API not found error
**Workaround:**
1. Check OpenCascade.js version in CDN_BASE
2. Try alternative API or simpler operation
3. Verify WASM loaded successfully

### Issue: Black Screen (No Geometry Visible)
**Symptom:** Canvas renders but no shape appears
**Workaround:**
1. Check console (F12 → Console) for tessellation errors
2. Try smaller deflection value (0.05 instead of 0.1)
3. Verify shape was created before tessellation

### Issue: Tests Run Very Slowly
**Symptom:** Each test takes >1 second
**Workaround:**
1. Close other browser tabs
2. Restart browser
3. Check if WASM is still downloading (Network tab)

## Extending the Test Suite

### Add New Test
1. Add entry to `tests` array (line ~270)
2. Add implementation in `runTest()` function (line ~550)
3. Follow pattern: create shape → tessellate → render

### Example: Add a Wedge Test
```javascript
// In tests array:
{ id: 'wedge', name: 'Wedge (inclined plane)', category: 'Primitives' },

// In runTest():
else if (testId === 'wedge') {
    const shape = new oc.BRepPrimAPI_MakeWedge_3(100, 50, 30, 20).Shape();
    const tessData = tessellateShape(shape);
    if (!tessData) throw new Error('Tessellation failed');
    const { triangleCount } = renderGeometry(tessData.vertices, tessData.indices);
    log(`Wedge: ${elapsed.toFixed(1)}ms, ${triangleCount} triangles`, 'success');
    updateTestStatus(testId, 'passed', elapsed);
}
```

## Success Criteria

✅ All 14 tests pass without errors
✅ WASM loads in <3 minutes
✅ Geometry renders correctly in 3D viewport
✅ Stats overlay shows FPS ≥30
✅ Log panel shows all operations with timing
✅ UI is responsive and visually correct

---

**Status:** Ready for testing
**Last checked:** 2026-03-31
