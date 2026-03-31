# cycleCAD Fusion Test Suite

Comprehensive visual test pages for all cycleCAD features. Each test page loads the app in an iframe and runs automated tests against it, with live visualization and detailed logging.

## Test Files

### 1. **fusion-sketch-tests.html** (15 KB)
Tests for all 2D sketch features:
- **Basic Shapes**: Line, Rectangle, Circle, Ellipse, Arc, Spline, Slot, Polygon
- **Advanced Tools**: Mirror, Pattern, Offset, Trim, Extend, Fillet 2D, Chamfer 2D
- **Constraints**: All 12 constraint types (Coincident, Horizontal, Vertical, Parallel, Perpendicular, Tangent, Equal, Fixed, Concentric, Symmetric, Distance, Angle)

**Test Categories**:
- Basic Shapes (8 tests)
- Advanced Operations (8 tests)
- Constraint System (12 tests)
- Export Formats (2 tests)

### 2. **fusion-solid-tests.html** (13 KB)
Tests for all 3D solid modeling operations:
- **Basic Operations**: Extrude, Revolve, Hole, Pocket, Pad
- **Advanced Operations**: Sweep, Loft, Boolean Union/Cut/Intersect, Shell, Draft
- **Features**: Fillet, Chamfer, Thread, Rib, Web, Scale
- **Patterns**: Rectangular Pattern, Circular Pattern, Mirror Body, Copy Body

**Test Categories**:
- Basic Operations (5 tests)
- Advanced Operations (7 tests)
- Feature Tools (6 tests)
- Pattern Operations (4 tests)

### 3. **fusion-assembly-tests.html** (12 KB)
Tests for assembly and multi-body workflows:
- **Joint Types**: Fixed, Revolute, Slider, Ball, Screw, Cylindrical, Planar
- **Component Management**: Insert, Ground, Suppress, Hide, Show
- **Analysis**: Interference Detection, Assembly Explode/Collapse, Motion Study, Drive Joint

**Test Categories**:
- Joint Creation (7 tests)
- Component Workflows (5 tests)
- Assembly Analysis (5 tests)

### 4. **fusion-cam-tests.html** (10 KB)
Tests for CAM and toolpath generation:
- **Setup**: Create Setup, Stock Setup, Coordinate System, Post Configuration
- **Operations**: Facing, Pocket, Contour, Drilling, 2D Adaptive, 3D Adaptive, Turning
- **Toolpath**: Tool Library, Tool Selection, Feed & Speed Calculator, Toolpath Simulation, G-code Generation, Setup Sheets

**Test Categories**:
- Setup Operations (4 tests)
- Machining Operations (7 tests)
- Toolpath & G-code (6 tests)

### 5. **fusion-simulation-tests.html** (10 KB)
Tests for structural and thermal analysis:
- **Stress Analysis**: Create Study, Apply Load, Apply Constraint, Mesh, Solve, Stress Results, Strain Results
- **Thermal Analysis**: Thermal Study, Initial Temperature, Thermal Load, Thermal Constraint, Thermal Mesh, Thermal Results
- **Other**: Modal Frequency, Buckling Analysis, Shape Optimization, Fatigue Analysis

**Test Categories**:
- Static Stress Analysis (7 tests)
- Thermal Analysis (6 tests)
- Advanced Analysis (4 tests)

### 6. **fusion-all-tests.html** (18 KB) — Master Test Runner
Master test orchestration page that:
- Loads all 5 test suites in sequence
- Aggregates results across all suites
- Displays overall progress and statistics
- Exports combined results as JSON or HTML report
- Tracks elapsed time
- Shows pass/fail/skip counts per suite

**Features**:
- Run All Tests button
- Individual suite result cards
- Overall progress bar (linear gradient)
- Stat cards showing total Pass/Fail/Skip
- Export to JSON or HTML
- Real-time progress updates
- Category breakdown per suite

## Usage

### Running Individual Test Suites

Open any individual test HTML file in a browser:
```
cyclecad.com/app/tests/fusion-sketch-tests.html
cyclecad.com/app/tests/fusion-solid-tests.html
cyclecad.com/app/tests/fusion-assembly-tests.html
cyclecad.com/app/tests/fusion-cam-tests.html
cyclecad.com/app/tests/fusion-simulation-tests.html
```

Each test page:
1. Loads the cycleCAD app in an iframe (left side, 70%)
2. Shows test log and controls on the right (30%)
3. Displays Pass/Fail/Skip counters
4. Shows progress bar
5. Allows running all tests or individual categories

### Running Master Test Suite

Open the master runner:
```
cyclecad.com/app/tests/fusion-all-tests.html
```

This will:
1. Load all 5 test suites sequentially
2. Capture results from each suite
3. Display overall statistics
4. Allow exporting combined report as JSON or HTML

## Test Architecture

### Split-Screen Layout
```
┌─────────────────────────────────────────────────┐
│  cycleCAD App (70%)      │  Test Log (30%)       │
│  (loads in iframe)       │  - Pass/Fail counts   │
│                          │  - Category buttons   │
│                          │  - Test entries       │
│                          │  - Progress bar       │
└─────────────────────────────────────────────────┘
```

### Test Execution Flow
1. Iframe loads the app at `../index.html`
2. Wait for onload event
3. Access app via `iframe.contentWindow`
4. Call test functions sequentially
5. Each test returns `{ pass: boolean, error?: string, skip?: boolean }`
6. Results logged in real-time with color coding
7. Stats updated after each test

### Color Coding
- **Green**: Pass (✓)
- **Red**: Fail (✗)
- **Yellow**: Skip (○)
- **Blue**: Info

## Test Categories (All Suites)

### Sketch Tests
- **Basic Shapes** (8 tests): Line, Rect, Circle, Ellipse, Arc, Spline, Slot, Polygon
- **Advanced** (8 tests): Mirror, Pattern, Offset, Trim, Extend, Fillet 2D, Chamfer 2D, Project
- **Constraints** (12 tests): All 12 constraint types
- **Export** (2 tests): DXF, SVG

### Solid Tests
- **Basic Ops** (5 tests): Extrude, Revolve, Hole, Pocket, Pad
- **Advanced** (7 tests): Sweep, Loft, Boolean Union/Cut/Intersect, Shell, Draft
- **Features** (6 tests): Fillet, Chamfer, Thread, Rib, Web, Scale
- **Patterns** (4 tests): Rectangular, Circular, Mirror, Copy

### Assembly Tests
- **Joints** (7 tests): Fixed, Revolute, Slider, Ball, Screw, Cylindrical, Planar
- **Components** (5 tests): Insert, Ground, Suppress, Hide, Show
- **Analysis** (5 tests): Interference, Explode, Collapse, Motion, Drive

### CAM Tests
- **Setup** (4 tests): Create, Stock, Coordinate, Post
- **Operations** (7 tests): Facing, Pocket, Contour, Drilling, 2D Adaptive, 3D Adaptive, Turning
- **Toolpath** (6 tests): Tool Library, Tool Selection, Feed/Speed, Simulation, G-code, Setup Sheet

### Simulation Tests
- **Stress** (7 tests): Study, Load, Constraint, Mesh, Solve, Stress/Strain Results
- **Thermal** (6 tests): Study, Temperature, Load, Constraint, Mesh, Results
- **Other** (4 tests): Modal, Buckling, Shape Optimization, Fatigue

## Statistics

| Suite | Total Tests | Categories | Status |
|-------|------------|-----------|--------|
| Sketch | 30 | 4 | Ready |
| Solid | 22 | 4 | Ready |
| Assembly | 17 | 3 | Ready |
| CAM | 17 | 3 | Ready |
| Simulation | 17 | 3 | Ready |
| **Total** | **103** | **17** | **Ready** |

## Features

### Per-Suite Test Page
- ✓ Split-screen layout (app + log)
- ✓ Pass/Fail/Skip counters
- ✓ Progress bar with color gradient
- ✓ Run All Tests button
- ✓ Run Category buttons
- ✓ Real-time test logging
- ✓ Color-coded results
- ✓ Elapsed time tracking

### Master Test Runner
- ✓ Load all 5 suites sequentially
- ✓ Aggregate results across all suites
- ✓ Overall progress bar
- ✓ Per-suite stat cards
- ✓ Export to JSON format
- ✓ Export to HTML report
- ✓ Elapsed time tracking
- ✓ Visual status badges (running/completed/failed)

## Development Patterns

### Test Function Signature
```javascript
async function testFeatureName() {
  try {
    const module = appWindow.cycleCAD?.moduleNamespace;
    if (!module) return { skip: true };

    const result = await module.featureCall();
    return { pass: result !== null };
  } catch (e) {
    return { pass: false, error: e.message };
  }
}
```

### Adding New Tests
1. Create test function with same signature
2. Add to appropriate `tests` object category
3. Return `{ pass, error?, skip? }`
4. Tests run sequentially with 300ms delay between each

### Dark Theme
All test pages use consistent dark theme:
- Background: `#0f172a`
- Cards: `#1a202c`
- Text: `#e2e8f0`
- Accent (blue): `#38bdf8`
- Success (green): `#10b981`
- Error (red): `#ef4444`
- Warning (amber): `#f59e0b`

## File Sizes

```
fusion-sketch-tests.html      15 KB
fusion-solid-tests.html       13 KB
fusion-assembly-tests.html    12 KB
fusion-cam-tests.html         10 KB
fusion-simulation-tests.html  10 KB
fusion-all-tests.html         18 KB
────────────────────────────────
Total                         78 KB
```

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- All modern browsers with ES6+ support

## Notes

- Tests access app via `iframe.contentWindow`
- Each test isolated in try-catch for reliability
- Skip tests that require external dependencies
- Detailed error messages logged for failed tests
- Results export available in JSON and HTML formats
- Master runner sequences suites to avoid parallel load issues
