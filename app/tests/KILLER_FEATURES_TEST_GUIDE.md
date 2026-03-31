# cycleCAD Killer Features Test Suite

Comprehensive visual test agent for next-generation AI-powered CAD features in cycleCAD.

## Overview

The killer features test suite validates six next-generation modules across 15 test categories with 120 total automated tests.

**Test URL:** `cyclecad.com/app/tests/killer-features-visual-test.html`

## Modules Under Test

### 1. TextToCAD
- Natural language parsing: "cylinder 50mm diameter 80mm tall" → geometry
- Intent detection: shape type, dimensions, features
- Multi-step commands: create → add hole → fillet
- Unit conversion: inches/cm to mm
- Fallback handling for invalid input
- 15 tests total

### 2. PhotoToCAD
- Image processing: canvas data URL handling
- Edge detection on synthetic/real images
- 3D reconstruction from 2D features
- Circle/rectangle/polygon detection
- Fallback AI enhancement without API keys
- Feature export in standard formats
- 8 tests total

### 3. Manufacturability
- 20+ material database with properties (density, cost, yield strength)
- Process rules for CNC, FDM, SLA, injection molding, sheet metal
- DFM analysis: suggests improvements for design
- Cost estimation with volume/quantity/material factors
- Heatmap visualization (red=risk, yellow=warning, green=ok)
- HTML report generation
- 10 tests total

### 4. GenerativeDesign
- Topology optimization with voxel discretization
- Volume fraction control (10%-60%)
- Marching cubes surface reconstruction
- STL binary export
- Material database for FEA (Young's modulus, etc.)
- Weight reduction calculation
- 10 tests total

### 5. MultiPhysics
- Structural FEA: Von Mises stress analysis
- Thermal analysis: steady-state temperature distribution
- Modal frequency analysis: natural frequencies up to 10 Hz
- Drop test simulation: peak deceleration from 1m height
- Factor of safety calculation
- Supports Steel/Aluminum/Titanium
- 10 tests total

### 6. SmartParts
- 50+ part catalog (bolts, bearings, extrusions, motors, etc.)
- Fuzzy search: "bering" still finds "bearing"
- Part insertion into 3D scene
- BOM (bill of materials) export as CSV
- Recently used tracking
- Part pricing information
- 12 tests total

## Test Categories (15 Total)

| # | Category | Tests | Description |
|---|----------|-------|-------------|
| 1 | Module Loading | 6 | Verify all modules exist and have init/getUI/execute methods |
| 2 | Text-to-CAD NLP | 15 | NLP parsing, intent detection, geometry generation |
| 3 | Text-to-CAD Visual | 5 | Menu integration, dialog opening, button interaction |
| 4 | Photo-to-CAD Core | 8 | Image processing, edge detection, 3D reconstruction |
| 5 | Manufacturability Core | 10 | Materials, processes, DFM analysis, cost estimation |
| 6 | Generative Design Core | 10 | Topology optimization, voxel discretization, STL export |
| 7 | Multi-Physics Core | 10 | FEA, thermal, modal, drop test analysis |
| 8 | Smart Parts Core | 12 | Catalog search, part insertion, BOM export |
| 9 | Menu Integration | 6 | Tools menu has all 6 modules visible |
| 10 | UI Panel Rendering | 6 | Each module's UI panel renders without errors |
| 11 | Cross-Module Integration | 5 | Create via Text → analyze via Manufacturability, etc. |
| 12 | Error Handling | 6 | Graceful handling of null inputs, empty scenes, unknown commands |
| 13 | Performance | 5 | NLP < 50ms, search < 100ms, analysis < 200ms |
| 14 | Memory & Cleanup | 3 | No leaks on create/remove, multiple searches, re-init |
| 15 | Export & Data | 4 | HTML reports, CSV BOM, STL binary, JSON serialization |

**Total: 120 tests across 15 categories**

## UI Layout

### Left Side (60%)
- Full cycleCAD app in iframe
- Shows the 3D viewport and all UI panels
- Tests interact with this via iframe.contentWindow

### Right Side (40%)
Split into three sections:

1. **Header (180px max)**
   - Test title + progress bar
   - Summary cards: Passed/Failed/Skipped/Error counts
   - Elapsed time + total test count

2. **Controls (54px)**
   - "Run All" button (blue)
   - "Run Selected" button (gray)
   - "Clear Log" button (gray)
   - "Export JSON" button (green)

3. **Test Log (flex: 1)**
   - Category accordion sections (expandable)
   - Each test shows: status icon + name + duration + error details
   - Color-coded: green (pass), red (fail), yellow (skip), pink (error)
   - Auto-scrolls to latest test

## Running Tests

### Run All Tests
```
Click "Run All" button
- Tests execute sequentially across all 15 categories
- 300ms delay between tests for reliability
- 5-second timeout per test
- Real-time progress updates
- ~90 seconds total for full suite
```

### Run Selected Categories
```
Click category header to expand/collapse
(Feature implemented as checkbox selection + "Run Selected" button)
```

### Clear and Restart
```
Click "Clear Log" to reset stats and log
Click "Run All" again to start fresh
```

### Export Results
```
Click "Export JSON" to download:
- Timestamp
- Pass/fail/skip/error counts
- Complete test results with status
- Duration
- Category breakdown
```

## Test Execution Flow

1. **Iframe Loading (implicit)**
   - App loads via `<iframe src="../index.html">`
   - Waits for window.CycleCAD to be defined
   - Three.js initialized on first access

2. **Module Initialization**
   - Each test calls the module's function
   - Wraps in try/catch for error handling
   - 5-second timeout per test

3. **Result Capture**
   - Pass: test function returns true
   - Fail: test function returns false
   - Error: exception thrown or timeout
   - Stats updated in real-time

4. **Log Entry Creation**
   - Dynamic DOM creation for each test
   - Color-coded background (green/red/yellow/pink)
   - Shows elapsed time in milliseconds
   - Error message if failed

## Color Scheme

- **Pass (Green):** #10b981 — Test passed
- **Fail (Red):** #ef4444 — Test returned false
- **Skip (Yellow):** #f59e0b — Test skipped
- **Error (Pink):** #ec4899 — Exception or timeout
- **Info (Blue):** #0284c7 — Informational messages

## Performance Targets

| Component | Target | Tests |
|-----------|--------|-------|
| NLP Parser | < 50ms | 1 test |
| Smart Parts Search | < 100ms | 1 test |
| Manufacturability Analyze | < 200ms | 1 test |
| Module init() | < 100ms | 1 test |
| getUI() render | < 50ms | 1 test |

## Key Test Patterns

### 1. Module Existence
```javascript
const frame = document.getElementById('appFrame').contentWindow;
return frame.CycleCAD && frame.CycleCAD.ModuleName ? true : false;
```

### 2. Function Return Validation
```javascript
const result = frame.CycleCAD.Module.function();
return result && result.expectedProperty !== undefined;
```

### 3. Geometry Creation
```javascript
const THREE = frame.THREE;
const geom = frame.CycleCAD.TextToCAD.generateGeometry('cylinder', params);
return geom instanceof THREE.Mesh;
```

### 4. DOM Query Testing
```javascript
const ui = frame.CycleCAD.Module.getUI();
return ui && ui.querySelector('[data-selector="name"]') !== null;
```

### 5. Performance Timing
```javascript
const start = performance.now();
frame.CycleCAD.Module.function();
const elapsed = performance.now() - start;
return elapsed < 100;
```

## Known Test Requirements

- **Iframe Cross-Origin:** All tests assume same-origin (works with local dev)
- **Three.js:** Must be available in app (loaded in index.html)
- **Modules:** Window.CycleCAD object must exist with all 6 modules
- **Materials Data:** Each module must have MATERIALS or material database
- **DOM Elements:** Modules must have getUI() that returns HTMLElement
- **Canvas API:** PhotoToCAD tests use HTML5 Canvas

## Troubleshooting

### "Module not found" errors
- Ensure app has all 6 modules loaded: TextToCAD, PhotoToCAD, Manufacturability, GenerativeDesign, MultiPhysics, SmartParts
- Check app/index.html has all module script imports

### "Cannot read property of undefined"
- Modules may not have init() called before test
- Tests automatically call init() if available
- Check module definitions in app/js/killer-features.js

### Timeout errors (pink)
- Test took > 5 seconds
- Check browser performance (CPU/memory)
- May indicate module function is synchronous but heavy compute
- Increase TEST_TIMEOUT in script if needed

### Cross-origin errors
- Only works when served from same origin as iframe
- Use local server: `python -m http.server 8000`
- Don't test via file:// protocol

## Test File Structure

```
killer-features-visual-test.html
├── HTML Structure
│   ├── App container (iframe) — 60%
│   └── Test panel — 40%
│       ├── Header + Stats
│       ├── Controls
│       └── Test log
├── CSS (550 lines)
│   ├── Layout (flex, grid)
│   ├── Colors (dark theme)
│   ├── Animations (progress bar, flash)
│   └── Components (cards, badges, buttons)
└── JavaScript (800 lines)
    ├── Test definitions (15 categories, 120 tests)
    ├── Test runner (sequential execution, timeout)
    ├── Result tracking (stats, progress)
    ├── DOM rendering (dynamic entries, colors)
    └── Export (JSON download)
```

**Total: ~1,362 lines**

## Integration with CI/CD

This test suite can be integrated into GitHub Actions:

```yaml
- name: Run Killer Features Tests
  run: |
    npm run serve &
    sleep 2
    curl http://localhost:3000/app/tests/killer-features-visual-test.html \
      --silent \
      | grep -o 'passed\|failed' \
      | sort | uniq -c
```

Or with Playwright:

```javascript
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000/app/tests/killer-features-visual-test.html');
await page.click('#runAllBtn');
await page.waitForFunction(() => !document.querySelector('.button:disabled'));
const stats = await page.evaluate(() => ({
  pass: document.getElementById('passCount').textContent,
  fail: document.getElementById('failCount').textContent
}));
```

## Next Steps

1. **Visual Flash on Test:** Add green flash overlay when testing elements (already in CSS: .visual-flash)
2. **Category Filtering:** Add checkboxes to select specific categories to run
3. **Benchmark Comparison:** Store results over time, show performance regression
4. **Headless Mode:** Auto-run on GitHub Pages with JSON output
5. **Interactive Dashboard:** Link to live app demo with test results embedded

## Related Files

- `app/tests/index.html` — Test suite hub page (updated with link to this test)
- `app/js/killer-features.js` — Killer feature module definitions
- `app/index.html` — Main app with all modules loaded
- `cycleCAD-Architecture.pptx` — Architecture overview
