# ExplodeView → cycleCAD Merge Plan: Viewer Mode Integration

**Status:** RESEARCH + PLANNING
**Date:** 2026-03-25
**Scope:** Integrate ExplodeView's 57 feature modules into cycleCAD as "Viewer Mode"
**Goal:** One unified platform (CAD + Viewer), two separate npm packages

---

## Executive Summary

ExplodeView is a 19,000+ line monolith (`app.js`) with 57 IIFE-based feature modules. cycleCAD is a modular parametric CAD system with 19 ES modules. The merge strategy:

1. **Keep ExplodeView as standalone npm package** — no breaking changes for existing users
2. **Port high-value ExplodeView features into cycleCAD as ES modules** — split the monolith into ~10 focused viewer modules
3. **Share the Three.js scene** — one renderer, mode toggle (Edit Mode ↔ Viewer Mode)
4. **Unified toolbar with tabs** — ExplodeView tools become new tab groups in cycleCAD's tabbed toolbar
5. **Data bridge** — cycleCAD models load in Viewer Mode, viewer files (STL/Inventor) load in Viewer Mode

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  cycleCAD.com (unified platform)                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  EDIT MODE                        │    VIEWER MODE          │
│  ├─ 2D Sketch                     │    ├─ Assembly Tree     │
│  ├─ 3D Operations                 │    ├─ Explode/Collapse  │
│  ├─ Constraints                   │    ├─ Section Cut       │
│  ├─ Assembly                      │    ├─ BOM Export       │
│  └─ Parameters                    │    ├─ Annotations      │
│                                   │    ├─ AI Identification │
│  Shared Three.js Scene            │    └─ Export STL/etc   │
│  (camera, renderer, lights)       │                         │
│                                   │                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │ Tabbed Toolbar (View|Analyze|Create|Export|AI|...)│    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Mode Toggle Button (top-right): "Edit Mode" → "Viewer"    │
└─────────────────────────────────────────────────────────────┘

npm packages (stay separate):
┌──────────────────────────┐  ┌──────────────────────────┐
│   cyclecad v1.0          │  │  explodeview v1.0.5      │
│ (modeler + viewer)       │  │ (standalone viewer)      │
│ Uses viewer-mode.js      │  │ Uses app.js monolith     │
│ 30+ modules             │  │ 57 IIFE modules         │
└──────────────────────────┘  └──────────────────────────┘
```

---

## Phase 1: Critical Features (Sprint 1 — 2 weeks)

These 8 features are foundation-level and unlock the most value. Estimated: **40 hours**.

| Feature | Module | ExplodeView Lines | LoC to Port | Priority | Effort |
|---------|--------|-------------------|------------|----------|--------|
| **Assembly Tree** | `viewer-assembly-tree.js` | 11270–13159 | 800 | P0 | 8h |
| **Explode/Collapse** | `viewer-explode.js` | 8173–8477 | 600 | P0 | 8h |
| **Section Cut** | `viewer-section-cut.js` | 10268–10445 | 400 | P1 | 6h |
| **BOM + Export** | `viewer-bom.js` | 9444–9672 | 400 | P1 | 5h |
| **Annotations** | `viewer-annotations.js` | (from initMarkup) | 350 | P2 | 5h |
| **AI Part Identifier** | `viewer-ai-identify.js` | 17460+ | 700 | P1 | 7h |
| **Context Menu** | `viewer-context-menu.js` | 8477–9184 | 300 | P2 | 4h |
| **Part Info Card** | `viewer-part-info.js` | 9928–10268 | 500 | P2 | 6h |

**Subtotal Phase 1:** ~8 new ES modules, ~4,050 LoC, 40 hours, **1-2 week sprint**

---

## Phase 2: Enhancement Features (Sprint 2 — 1 week)

Medium-value features that round out the Viewer experience. Estimated: **20 hours**.

| Feature | Module | Priority | Effort |
|---------|--------|----------|--------|
| **Section Measurements** | `viewer-measurements.js` (reuse from cycleCAD) | P2 | 3h |
| **Transparency Control** | `viewer-transparency.js` | P2 | 2h |
| **Screenshot Export** | `viewer-screenshot.js` | P2 | 3h |
| **Grid + Floor** | `viewer-grid.js` (enhance existing viewport) | P2 | 2h |
| **Keyboard Shortcuts** | `viewer-shortcuts.js` | P3 | 2h |
| **Part Comparison** | `viewer-comparison.js` | P3 | 4h |
| **Weight Estimator** | `viewer-weight.js` | P3 | 2h |

**Subtotal Phase 2:** ~7 new modules, ~2,000 LoC, 20 hours, **1 week sprint**

---

## Phase 3: Advanced Features (Sprint 3+ — ongoing)

Lower-priority features that enhance but aren't critical to launch. Estimated: **30+ hours**.

| Feature | Priority | Effort |
|---------|----------|--------|
| **3D Print Slicer** | P3 | 6h |
| **Technical Drawings** | P3 | 8h |
| **Maintenance Schedule** | P3 | 4h |
| **Voice Commands** | P4 | 6h |
| **Collab View** | P4 | 8h |
| **Blueprint Theme** | P4 | 3h |
| **Smart Filters** | P4 | 4h |

---

## Feature Prioritization Rationale

### P0 (Must Have for Launch)
- **Assembly Tree:** Users need to understand model structure
- **Explode/Collapse:** Core cycleWASH differentiator (bike washing machine exploded views)

### P1 (Should Have)
- **Section Cut:** Inspection use case (showing internal structure)
- **BOM:** Export data for procurement, manufacturing
- **AI Identifier:** Competitive advantage (parts ↔ supplier matching)

### P2 (Nice to Have)
- **Annotations:** User comments, collaborative feedback
- **Context Menu:** Right-click convenience (select, hide, isolate)
- **Part Info Card:** Detailed view of individual parts
- **Measurements:** Service technician workflow

### P3+ (Future)
- Voice, collab, advanced rendering, DFM analysis

---

## Module Architecture: Splitting the Monolith

### Naming Convention
All viewer modules live in `/app/js/viewer-*.js`. Each module:
- Imports `{ getScene, getCamera, getControls }` from `viewport.js`
- Exports feature-specific init function (e.g., `initViewerAssemblyTree()`)
- Is self-contained with minimal global state
- Uses existing cycleCAD patterns (event delegation, CSS modules)

### Key Patterns to Adopt

**1. IIFE to ES Module**
```javascript
// ExplodeView (IIFE)
(function initClickExplode() {
  // ... 300 lines of self-contained code
})();

// cycleCAD (ES Module)
export function initViewerExplode(scene, camera, controls) {
  // ... same logic, but imported scene/camera/controls
}
```

**2. Shared Global State**
ExplodeView uses globals:
- `window.allParts` — array of part meshes
- `window.ASSEMBLIES` — array of assembly definitions
- `window.manifest` — metadata (names, sizes, file refs)
- `window._partHighlightActive` — flag for animation loop

cycleCAD pattern:
```javascript
// In viewer-mode.js
const viewerState = {
  allParts: [],
  assemblies: [],
  manifest: [],
  selectedPart: null,
  explodeAmount: 0,
  isViewerMode: false
};

// Access via accessor functions
export function getViewerState() { return viewerState; }
export function getPartByIndex(idx) { return viewerState.allParts[idx]; }
```

**3. Panel System**
ExplodeView uses fixed-position overlays with `data-close-panel` buttons.
cycleCAD uses tabbed right panel. Strategy:
- Move "Assembly Tree" → right panel, "Model Tree" tab
- Move "Section Cut" → right panel, "Tools" tab
- Move "Annotations" → floating overlay (or right panel)
- Move "Part Info" → floating card (keep ExplodeView behavior)
- Move "BOM" → right panel, "Data" tab

---

## File Organization

```
/app/js/
├─ viewport.js                 [EXISTING] — shared Three.js scene
├─ viewer-mode.js              [NEW] Core — mode switching, state mgmt
├─ viewer-loader.js            [NEW] — STL/OBJ/STEP loading
├─ viewer-assembly-tree.js     [NEW] — tree navigation, part selection
├─ viewer-explode.js           [NEW] — explode slider, animation
├─ viewer-section-cut.js       [NEW] — clipping planes, visualization
├─ viewer-bom.js               [NEW] — BOM panel, CSV export
├─ viewer-part-info.js         [NEW] — info card, 3D export
├─ viewer-annotations.js       [NEW] — pins, comments
├─ viewer-ai-identify.js       [NEW] — Gemini Vision, McMaster-Carr
├─ viewer-context-menu.js      [NEW] — right-click actions
├─ viewer-measurements.js      [NEW] — distance/angle (reuse from ops)
├─ viewer-transparency.js      [NEW] — opacity slider
├─ viewer-screenshot.js        [NEW] — PNG/JPG export
├─ viewer-grid.js              [NEW] — grid + floor plane
├─ viewer-shortcuts.js         [NEW] — keyboard bindings
├─ [... more viewer-*.js ...]
│
├─ app.js                      [MODIFY] — add viewer mode toggle
├─ index.html                  [MODIFY] — add viewer panels, import viewer modules
├─ [... existing modules ...]
└─ js/viewer-*.js              [all viewer features]
```

---

## Data Flow: Model Loading

### Edit Mode (current cycleCAD)
```
User sketch → Extrude → Add constraint → Tree updates → 3D renders
```

### Viewer Mode (new)
```
User loads STL/OBJ/STEP/Inventor
    ↓
viewer-loader.js parses file
    ↓
Creates THREE.Mesh for each part
    ↓
Populates viewerState.allParts[]
    ↓
viewerState.manifest[] = part metadata (name, size, center)
    ↓
Assembly Tree renders from viewerState.assemblies[]
    ↓
User clicks part → Part Info Card, Highlight, Selection
    ↓
User right-click → Context menu (hide, explode, export, etc.)
```

### Mode Switching
```
Edit Mode (parametric CAD) ← Toggle Button → Viewer Mode (static assembly)

When switching TO Viewer Mode:
  - Hide left tree (features), hide sketch canvas
  - Show Assembly Tree in right panel
  - Show Explode slider in right panel
  - Load viewer context menus + shortcuts

When switching TO Edit Mode:
  - Hide Assembly Tree, hide explode controls
  - Show feature tree, show sketch canvas
  - Load CAD context menus + shortcuts
```

---

## Implementation Checklist: Phase 1

### Week 1
- [ ] Create `viewer-mode.js` base module (mode switching, state management)
- [ ] Create `viewer-loader.js` (STL/OBJ loading, manifest parsing)
- [ ] Create `viewer-assembly-tree.js` (port from initAssemblyTree)
- [ ] Add mode toggle button to toolbar
- [ ] Wire into `index.html` inline script
- [ ] Test: load STL, see assembly tree, switch modes

### Week 2
- [ ] Create `viewer-explode.js` (port from initClickExplode)
- [ ] Create `viewer-section-cut.js` (port from initSectionCut)
- [ ] Create `viewer-bom.js` (port from initBOMExport + initBOM)
- [ ] Create `viewer-part-info.js` (port from showPartInfoCard IIFE)
- [ ] Test: explode assembly, section cut, BOM export, part info
- [ ] Performance check: 400 parts, smooth interaction

---

## Breaking Changes: NONE

### ExplodeView npm package
- Remains at `v1.0.5+` with monolith `app.js`
- No imports from cycleCAD
- Fully standalone, works in separate `<script>` context
- Users can continue embedding ExplodeView on their own sites

### cycleCAD npm package
- New exports: `initViewerMode()`, `loadViewerFile()`, `toggleViewerMode()`
- New peer dependency: none (Three.js already required)
- Backwards compatible: existing Edit Mode features unchanged
- New optional feature set: Viewer Mode

---

## Shared Three.js Scene Design

Both Edit Mode and Viewer Mode use the **same** Three.js scene/camera/renderer.

**Why?**
- Single animation loop, one GPU context
- Camera position preserved when switching modes
- Lighting, fog, shadows consistent
- Memory efficient

**How?**
```javascript
// viewport.js (existing)
export function getScene() { return scene; }
export function getRenderer() { return renderer; }

// viewer-mode.js (new)
import { getScene, getRenderer, getCamera, getControls } from './viewport.js';

const scene = getScene();  // Shared reference
const renderer = getRenderer();

// Add viewer objects to shared scene
viewer.Mesh.forEach(m => scene.add(m));

// When mode changes, show/hide groups
const editModeGroup = new THREE.Group();
const viewerModeGroup = new THREE.Group();
scene.add(editModeGroup);
scene.add(viewerModeGroup);

// Toggle visibility
function switchMode(mode) {
  editModeGroup.visible = (mode === 'edit');
  viewerModeGroup.visible = (mode === 'viewer');
}
```

---

## Toolbar Integration: Tabbed Design

cycleCAD already has tabbed toolbar. ExplodeView features map as follows:

```
┌─ View ─────────────────────────────────────────┐
│ Grid | Wireframe | Fit All | Reset | ViewCube │
│ [NEW] Explode | Section | Transparency        │
└─────────────────────────────────────────────────┘

┌─ Analyze ──────────────────────────────────────┐
│ [NEW] Assembly Tree | BOM | Part Info         │
│ [NEW] Measurements | Weight | Comparison      │
└─────────────────────────────────────────────────┘

┌─ Create ───────────────────────────────────────┐
│ [EXISTING] Sketch | Extrude | Revolve | etc   │
│ [NEW] Annotations | Markup                    │
└─────────────────────────────────────────────────┘

┌─ Export ───────────────────────────────────────┐
│ [EXISTING] STL | OBJ | glTF | DXF            │
│ [NEW] BOM CSV | Screenshot | 3D Export       │
└─────────────────────────────────────────────────┘

┌─ AI Tools ─────────────────────────────────────┐
│ [EXISTING] Chatbot | Reverse Engineer         │
│ [NEW] Part Identifier | Batch Scan            │
└─────────────────────────────────────────────────┘

┌─ Settings ─────────────────────────────────────┐
│ [EXISTING] Theme | API Keys | Language        │
│ [NEW] Viewer Presets | Shortcuts              │
└─────────────────────────────────────────────────┘
```

**Implementation:**
```html
<!-- In index.html tabs section -->
<div class="tb-group" data-tab="View">
  <!-- existing: Grid, Wireframe -->
  <!-- new: Explode slider, Section Cut toggle -->
</div>

<div class="tb-group" data-tab="Analyze">
  <!-- new: Assembly Tree button opens panel -->
  <!-- new: BOM button opens panel -->
</div>
```

---

## Estimated Effort Summary

| Phase | Modules | LoC | Hours | Weeks |
|-------|---------|-----|-------|-------|
| **Phase 1** (critical) | 8 | 4,050 | 40 | 2 |
| **Phase 2** (enhancement) | 7 | 2,000 | 20 | 1 |
| **Phase 3** (advanced) | 6+ | 3,000+ | 30+ | 2+ |
| **TOTAL** | 21+ | 9,050+ | 90+ | 5+ |

**To launch (P0 + P1):** 15 modules, ~6,050 LoC, **60 hours, 3 weeks**

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Breaking ExplodeView** | HIGH | Keep ExplodeView repo 100% unchanged. Merge only adds to cycleCAD. |
| **Scene conflicts** | MEDIUM | Strict namespacing: `viewerGroup`, `editModeGroup` with clear visibility rules. |
| **Performance (400 parts)** | MEDIUM | Phase 1 testing with real DUO Inventor data (342 parts). Use LOD if needed. |
| **UI clutter** | MEDIUM | Tab-based toolbar prevents UI overload. Modular CSS per feature. |
| **Porting bugs** | MEDIUM | Each module tested independently before integration. Port ExplodeView tests as reference. |

---

## Success Metrics (MVP Definition)

**Phase 1 Complete = MVP:**
1. ✅ Can toggle between Edit Mode and Viewer Mode
2. ✅ Can load STL file into Viewer Mode
3. ✅ Assembly Tree shows all parts with hierarchy
4. ✅ Explode/collapse works smoothly (400 parts)
5. ✅ Section cut works (3 axis, flip)
6. ✅ Right-click context menu works (select, hide, export)
7. ✅ BOM can be exported to CSV
8. ✅ Part info card shows dimensions, materials, weight
9. ✅ No performance degradation in Edit Mode
10. ✅ ExplodeView npm package still works standalone

---

## Post-Merge: npm Publishing Strategy

### cycleCAD v1.1.0 (first Viewer Mode release)
```json
{
  "name": "cyclecad",
  "version": "1.1.0",
  "description": "Parametric 3D CAD modeler + STL/STEP viewer",
  "exports": {
    "./modeler": "./app/js/app.js",
    "./viewer": "./app/js/viewer-mode.js",
    "./agent-api": "./app/js/agent-api.js"
  }
}
```

### ExplodeView v1.0.5+ (unchanged)
- No breaking changes
- Continues as standalone embed widget
- Link from cycleCAD docs: "Advanced Viewer Features → ExplodeView Widget"

### Marketing Angle
- "cycleCAD: The CAD tool you build in AND the viewer you share with"
- One platform for design + inspection + collaboration
- Open-core + plugin architecture ready

---

## Next Steps

1. **Review Plan** — Sachin's feedback on priorities, timeline, architecture
2. **Proof of Concept** — Build `viewer-mode.js` base module (this task)
3. **Phase 1 Sprint** — Week 1-2, port top 8 features
4. **Integration Test** — Real DUO Inventor data (342 parts)
5. **Publishing** — npm cyclecad@1.1.0, GitHub tag, blog post
6. **LinkedIn Launch** — Unified platform announcement

---

**Document Version:** 1.0
**Last Updated:** 2026-03-25
**Author:** Claude (Agent)
**Status:** READY FOR REVIEW
