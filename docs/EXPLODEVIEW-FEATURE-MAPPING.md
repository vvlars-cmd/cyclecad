# ExplodeView → cycleCAD Feature Mapping

## Executive Summary

ExplodeView contains 57 features in a 19,000-line monolith. This document maps each feature to:
1. Whether it's worth porting (priority)
2. Which cycleCAD module it belongs in
3. Estimated lines of code and effort
4. Dependencies and blockers

---

## Feature Priority Matrix

```
    ╔═══════════════════════════════════════════════════════╗
    ║        EFFORT (estimate)                              ║
    ║   Low       Medium      High       Very High          ║
    ║  (<100)  (100-300)  (300-600)     (600+)             ║
╔═══╬═══════════════════════════════════════════════════════╣
║ P │  Quick    Medium    Big         Major                ║
║ 0 │  Wins     Value     Value       Systems              ║
║   ├─────────────────────────────────────────────────────┤
║   │ Tree      Explode   Section     AI Identify          ║
║   │           Animation Cut         Assembly Res         ║
║ P │ Shortcuts Selection  BOM        Inventor Parse       ║
║ 1 │           Context    Measure    Collab View         ║
║   │           Menu       3D Print                        ║
╠═══╣─────────────────────────────────────────────────────┤
║ P │ Part      Annot      Part Info   Smart Filters       ║
║ 2 │ Compare   Pins       Card        Maintenance         ║
║   │           Markup     3D Export   Timeline            ║
║   │ Wireframe Grid       Screenshot  Voice Commands      ║
║ P │ Hero      Transpare  Weight      Technical Drawings  ║
║ 3 │ Shots     ncy        Estimator   Tech Reports        ║
║   │ QR Code   Fit All    Int Check   DFM Analysis        ║
╚═══╩═════════════════════════════════════════════════════╝
```

---

## Phase 0: Foundation (In Progress)

### ✅ viewer-mode.js (BASE SYSTEM)
- **ExplodeView:** N/A (new architecture)
- **cycleCAD:** `/app/js/viewer-mode.js`
- **Lines of Code:** 600
- **Effort:** Already done (PoC)
- **Description:** Mode switching, state management, shared scene
- **Dependencies:** viewport.js
- **Blockers:** None
- **Status:** COMPLETE

---

## Phase 1: Critical Features (Weeks 1-2)

### 1. ✅ Assembly Tree UI
- **ExplodeView:** `initAssemblyTree()` (lines 11270-13159, 1,890 lines)
- **cycleCAD:** `viewer-assembly-tree.js`
- **LoC to Port:** 800
- **Effort:** 8 hours
- **Description:** Tree view of parts, collapsible assemblies, click to select, color-code by assembly
- **Dependencies:** viewer-mode.js, viewport.js
- **Blockers:** None
- **Priority:** P0 (user needs structure)
- **Status:** PLANNED

### 2. ✅ Explode/Collapse Animation
- **ExplodeView:** `initClickExplode()` (lines 8173-8477, 304 lines) + animation logic
- **cycleCAD:** `viewer-explode.js`
- **LoC to Port:** 600
- **Effort:** 8 hours
- **Description:** Interactive slider to explode/collapse parts, smooth animation, direction from center
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P0 (core differentiator for cycleWASH)
- **Status:** PLANNED

### 3. ✅ Section Cut / Clipping Plane
- **ExplodeView:** `initSectionCut()` (lines 10268-10445, 177 lines) + Three.js clipping
- **cycleCAD:** `viewer-section-cut.js`
- **LoC to Port:** 400
- **Effort:** 6 hours
- **Description:** X/Y/Z clipping planes, flip direction, position slider, per-material
- **Dependencies:** viewer-mode.js, renderer.localClippingEnabled
- **Blockers:** None
- **Priority:** P1 (inspection use case)
- **Status:** PLANNED

### 4. ✅ Part Selection & Context Menu
- **ExplodeView:** `initPartContextMenu()` (lines 8477-9184, 707 lines)
- **cycleCAD:** `viewer-context-menu.js`
- **LoC to Port:** 300
- **Effort:** 4 hours
- **Description:** Right-click menu (select, hide, isolate, move, export), hover highlight
- **Dependencies:** viewer-mode.js, raycasting
- **Blockers:** None
- **Priority:** P1 (user interaction)
- **Status:** PLANNED (partial in viewer-mode.js)

### 5. ✅ BOM Export
- **ExplodeView:** `initBOMExport()` + `initBOM()` (lines 9444-9672, 228 lines)
- **cycleCAD:** `viewer-bom.js`
- **LoC to Port:** 400
- **Effort:** 5 hours
- **Description:** Generate BOM with part names, dimensions, volume, material; export to CSV
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P1 (manufacturing workflow)
- **Status:** PLANNED (partial in viewer-mode.js)

### 6. ✅ Part Info Card & 3D Export
- **ExplodeView:** `initPartInfoCard()` + `showPartInfoCard()` IIFE (lines 9928-10268, 340 lines) + `meshToSTL()` etc
- **cycleCAD:** `viewer-part-info.js`
- **LoC to Port:** 500
- **Effort:** 6 hours
- **Description:** Float card with part dims, bbox, volume, material, weight; export to STL/OBJ/glTF/PLY
- **Dependencies:** viewer-mode.js, Three.js STL/OBJ exporters
- **Blockers:** Need STL exporter library
- **Priority:** P1 (detail view)
- **Status:** PLANNED

### 7. ✅ AI Part Identifier
- **ExplodeView:** `initAIVisionIdentifier()` (lines 17460+, 800+ lines) + Gemini Vision API
- **cycleCAD:** `viewer-ai-identify.js`
- **LoC to Port:** 700
- **Effort:** 7 hours
- **Description:** Render isolated part, send to Gemini Vision, auto-search McMaster-Carr, show alternatives
- **Dependencies:** viewer-mode.js, Gemini API, localStorage for keys
- **Blockers:** None (already in cycleCAD)
- **Priority:** P1 (competitive advantage)
- **Status:** PLANNED

### 8. ✅ Keyboard Shortcuts
- **ExplodeView:** `initKeyboardShortcuts()` (lines 14226+, 160 lines)
- **cycleCAD:** `viewer-shortcuts.js` (or integrate into existing shortcuts.js)
- **LoC to Port:** 100
- **Effort:** 2 hours
- **Description:** T=toggle explode, E=export, R=reset, S=section cut, etc
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P2 (convenience)
- **Status:** PLANNED

**Phase 1 Subtotal:** 8 modules, 4,050 LoC, 40 hours, 2 weeks

---

## Phase 2: Enhancement Features (Week 3)

### 9. Assembly Tree Animations
- **ExplodeView:** `initAnimationSequence()` (lines 2834-4672, 1,838 lines)
- **cycleCAD:** Extend `viewer-explode.js`
- **LoC to Port:** 400
- **Effort:** 6 hours
- **Description:** Record/playback explode sequences, timeline UI, auto-save
- **Dependencies:** viewer-explode.js
- **Blockers:** None
- **Priority:** P2 (marketing/docs)
- **Status:** PLANNED

### 10. Measurements
- **ExplodeView:** Measurement tool (lines 3207+, 150 lines)
- **cycleCAD:** Reuse existing `constraint-solver.js` measurement logic
- **LoC to Port:** 200
- **Effort:** 3 hours
- **Description:** 2-point distance, 3-point angle, dimension display, snap to parts
- **Dependencies:** raycasting, viewer-mode.js
- **Blockers:** None
- **Priority:** P2 (service technician workflow)
- **Status:** PLANNED

### 11. Transparency/Opacity Control
- **ExplodeView:** `initTransparencyControl()` (lines 13980+, 95 lines)
- **cycleCAD:** `viewer-transparency.js`
- **LoC to Port:** 150
- **Effort:** 2 hours
- **Description:** Slider for per-part or all-parts opacity, reset button
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P2 (visualization)
- **Status:** PLANNED

### 12. Grid & Floor Plane
- **ExplodeView:** `initGridFloor()` (lines 13860+, 70 lines)
- **cycleCAD:** Enhance existing `viewport.js` or `viewer-grid.js`
- **LoC to Port:** 100
- **Effort:** 2 hours
- **Description:** Auto-sized grid, shadow plane, toggle visibility
- **Dependencies:** viewport.js
- **Blockers:** None
- **Priority:** P2 (aesthetics)
- **Status:** PLANNED

### 13. Screenshot Export
- **ExplodeView:** `initScreenshotExport()` (lines 13830+, 50 lines)
- **cycleCAD:** `viewer-screenshot.js`
- **LoC to Port:** 120
- **Effort:** 2 hours
- **Description:** PNG/JPG/WebP export, transparent background, 2x resolution
- **Dependencies:** renderer.domElement
- **Blockers:** None
- **Priority:** P2 (sharing)
- **Status:** PLANNED

### 14. Part Comparison
- **ExplodeView:** `initPartComparison()` (lines 14823-14863, 40 lines)
- **cycleCAD:** `viewer-comparison.js`
- **LoC to Port:** 250
- **Effort:** 3 hours
- **Description:** Select 2 parts, compare dimensions, volume, size, weight
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P3 (analysis)
- **Status:** PLANNED

### 15. Weight Estimator
- **ExplodeView:** `initWeightEstimator()` (lines 14180+, 90 lines)
- **cycleCAD:** `viewer-weight.js`
- **LoC to Port:** 180
- **Effort:** 2 hours
- **Description:** Material selector (15 types), bbox-based volume estimation, density lookup
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P2 (manufacturing)
- **Status:** PLANNED

**Phase 2 Subtotal:** 7 modules, 1,890 LoC, 20 hours, 1 week

---

## Phase 3: Advanced Features (Weeks 4+)

### 16. 3D Print Slicer
- **ExplodeView:** `initSlicer()` (lines 10445-11267, 822 lines)
- **cycleCAD:** `viewer-slicer.js`
- **LoC to Port:** 600
- **Effort:** 6 hours
- **Description:** G-code generation, layer height, nozzle diameter, supports preview
- **Dependencies:** viewer-mode.js, g-code generator lib
- **Blockers:** May need external library
- **Priority:** P3 (niche use case)
- **Status:** PLANNED

### 17. Annotations / Pins
- **ExplodeView:** `initAnnotations()` (lines 3730+, 500+ lines) + `initMarkup()` (lines 15835+, 234 lines)
- **cycleCAD:** `viewer-annotations.js`
- **LoC to Port:** 400
- **Effort:** 5 hours
- **Description:** Click-to-place pins, click-to-edit, draggable, saved with model
- **Dependencies:** viewer-mode.js, localStorage
- **Blockers:** None
- **Priority:** P2 (collaboration)
- **Status:** PLANNED

### 18. Technical Drawings
- **ExplodeView:** `initTechDrawings()` (lines 16069+, 103 lines)
- **cycleCAD:** Reuse DXF export from existing dxf-export.js
- **LoC to Port:** 200
- **Effort:** 3 hours
- **Description:** Auto-generate 2D drawings from 3D model, front/top/side views
- **Dependencies:** dxf-export.js, viewport.js
- **Blockers:** None
- **Priority:** P3 (documentation)
- **Status:** PLANNED

### 19. QR Code per Part
- **ExplodeView:** `initQRCode()` (lines 9673-9788, 115 lines)
- **cycleCAD:** `viewer-qr.js`
- **LoC to Port:** 120
- **Effort:** 2 hours
- **Description:** Generate QR per part, links to #part={idx}, shareable
- **Dependencies:** qrcode-generator library (already used in cycleCAD)
- **Blockers:** None
- **Priority:** P3 (field service)
- **Status:** PLANNED

### 20. Hero Shots
- **ExplodeView:** `initHeroShots()` (lines 9791-9925, 134 lines)
- **cycleCAD:** `viewer-hero-shots.js`
- **LoC to Port:** 150
- **Effort:** 2 hours
- **Description:** Pre-set camera angles, save favorite views, 360° rotate
- **Dependencies:** viewport.js
- **Blockers:** None
- **Priority:** P2 (marketing)
- **Status:** PLANNED

### 21. Voice Commands
- **ExplodeView:** `initVoiceCommands()` (lines 15104+, 373 lines)
- **cycleCAD:** `viewer-voice.js`
- **LoC to Port:** 350
- **Effort:** 4 hours
- **Description:** Web Speech API, text-to-explode, "show part X", "section cut"
- **Dependencies:** viewer-mode.js, Web Speech API
- **Blockers:** HTTPS required for mic
- **Priority:** P4 (nice-to-have)
- **Status:** PLANNED

### 22. Smart Filters
- **ExplodeView:** `initSmartFilters()` (lines 15477+, 183 lines)
- **cycleCAD:** `viewer-smart-filters.js`
- **LoC to Port:** 200
- **Effort:** 3 hours
- **Description:** Show/hide by size, weight, material, color-code by property
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P3 (analytics)
- **Status:** PLANNED

### 23. BOM Costing
- **ExplodeView:** `initBOMCosting()` (lines 15660+, 93 lines)
- **cycleCAD:** Extend `viewer-bom.js`
- **LoC to Port:** 150
- **Effort:** 2 hours
- **Description:** Look up part cost from McMaster-Carr, total BOM cost
- **Dependencies:** viewer-ai-identify.js, McMaster API
- **Blockers:** API access
- **Priority:** P3 (manufacturing)
- **Status:** PLANNED

### 24. Assembly Instructions
- **ExplodeView:** `initAssemblyInstructions()` + `initAsmInstructions()` (lines 15753+, 18400+, 300+ lines)
- **cycleCAD:** `viewer-asm-instructions.js` (also mirrors rebuild-guide.js)
- **LoC to Port:** 350
- **Effort:** 4 hours
- **Description:** Auto-generate step-by-step disassembly guide, export to HTML/PDF
- **Dependencies:** viewer-mode.js, template engine
- **Blockers:** None
- **Priority:** P3 (service docs)
- **Status:** PLANNED

### 25. Maintenance Heatmap
- **ExplodeView:** `initMaintHeatmap()` (lines 18250+, 150 lines)
- **cycleCAD:** `viewer-maint-heatmap.js`
- **LoC to Port:** 200
- **Effort:** 3 hours
- **Description:** Color parts red/yellow/green by maintenance urgency, export schedule
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P3 (service)
- **Status:** PLANNED

### 26. Wear Timeline
- **ExplodeView:** `initWearTimeline()` (lines 18550+, 150 lines)
- **cycleCAD:** `viewer-wear-timeline.js`
- **LoC to Port:** 200
- **Effort:** 3 hours
- **Description:** Gantt chart, 5-year replacement schedule, part lifecycle
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P3 (maintenance planning)
- **Status:** PLANNED

### 27. Collaboration View
- **ExplodeView:** `initCollabView()` (lines 16428+, 100+ lines)
- **cycleCAD:** `viewer-collab.js` + use existing real-time collab system (Phase D)
- **LoC to Port:** 300
- **Effort:** 6 hours
- **Description:** Shared viewport, cursor tracking, comment threads, version history
- **Dependencies:** WebRTC, CRDT library
- **Blockers:** Needs Phase D infrastructure
- **Priority:** P4 (enterprise)
- **Status:** PLANNED

### 28. Interference Check
- **ExplodeView:** `initInterferenceCheck()` (lines 16322+, 106 lines)
- **cycleCAD:** `viewer-clash.js`
- **LoC to Port:** 300
- **Effort:** 5 hours
- **Description:** Detect clashing/overlapping parts, highlight in red, generate report
- **Dependencies:** viewer-mode.js, CSG library
- **Blockers:** Needs CSG (constructive solid geometry)
- **Priority:** P3 (DFM analysis)
- **Status:** PLANNED

### 29. Standards Identifier
- **ExplodeView:** `initStandardsIdentifier()` (lines 13812+, 307 lines)
- **cycleCAD:** `viewer-standards.js` + link to build-in parts library (future)
- **LoC to Port:** 250
- **Effort:** 3 hours
- **Description:** Identify DIN/ISO standard parts, link to supplier, auto-replace with catalog
- **Dependencies:** viewer-mode.js, parts database
- **Blockers:** Parts database not yet built
- **Priority:** P3 (manufacturing)
- **Status:** PLANNED

### 30. Blueprint Theme
- **ExplodeView:** `initBlueprintTheme()` (lines 16418+, 60 lines)
- **cycleCAD:** CSS module or theme system
- **LoC to Port:** 80
- **Effort:** 1 hour
- **Description:** White background + blue wireframe toggle
- **Dependencies:** CSS variables
- **Blockers:** None
- **Priority:** P4 (aesthetics)
- **Status:** PLANNED

### 31. AI Chat / Chatbot
- **ExplodeView:** `initModelChatbot()` (lines 16492+, 600+ lines)
- **cycleCAD:** Reuse existing `ai-chat.js` + enhance for viewer context
- **LoC to Port:** 300
- **Effort:** 3 hours
- **Description:** Ask questions about model, get smart answers, part recommendations
- **Dependencies:** Gemini Flash API, ai-chat.js
- **Blockers:** None
- **Priority:** P2 (user experience)
- **Status:** PLANNED (already in cycleCAD)

### 32. Help System
- **ExplodeView:** `initHelpSystem()` (lines 17049+, 600+ lines)
- **cycleCAD:** `viewer-help.js` + enhance existing help
- **LoC to Port:** 400
- **Effort:** 3 hours
- **Description:** 43 features, searchable help, categorized display, tooltips
- **Dependencies:** viewer-mode.js
- **Blockers:** None
- **Priority:** P2 (discoverability)
- **Status:** PLANNED

### 33. AI Render / Gallery
- **ExplodeView:** `initAIRender()` (lines 4672+, 1,625 lines)
- **cycleCAD:** `viewer-ai-render.js`
- **LoC to Port:** 800
- **Effort:** 8 hours
- **Description:** Generate realistic renders via Stable Diffusion/Midjourney, material detection, style presets
- **Dependencies:** Viewer context, API keys, image processing
- **Blockers:** External API calls (not free)
- **Priority:** P3 (showcase)
- **Status:** PLANNED

### 34. Model Library / Import
- **ExplodeView:** `initModelImport()` (lines 947+, 642 lines)
- **cycleCAD:** Extend `viewer-loader.js`
- **LoC to Port:** 300
- **Effort:** 4 hours
- **Description:** Browse library, import multiple models, model manager
- **Dependencies:** viewer-loader.js, localStorage
- **Blockers:** None
- **Priority:** P3 (workflow)
- **Status:** PLANNED

### 35. AR Scanner
- **ExplodeView:** `initARMode()` (lines 6297+, 241 lines) + `initCameraScan()` (lines 8012+, 161 lines)
- **cycleCAD:** `viewer-ar.js`
- **LoC to Port:** 400
- **Effort:** 5 hours
- **Description:** WebXR, point camera at subassembly, identify via vision, 3D overlay
- **Dependencies:** WebXR API, Gemini Vision
- **Blockers:** WebXR requires HTTPS + compatible device
- **Priority:** P4 (mobile/field service)
- **Status:** PLANNED

### 36-57. Other Features
- AI Render Test, Theme System (duplicate), Image Editor, Shape Drawing, Recording, Embed Settings, Docs Mode, Sidebar Collapse, Menu Collapse, Snipper Tool, Visualization Tools, etc.
- **Total Remaining:** ~2,500+ LoC, 20+ hours
- **Priority:** P4+ (duplicates or niche)

**Phase 3 Subtotal:** 20+ modules, 6,000+ LoC, 60+ hours, 2+ weeks

---

## Module Dependencies

```
viewer-mode.js (base)
  ├─→ viewport.js (shared scene)
  ├─→ Three.js (core)
  │
  ├─ viewer-assembly-tree.js
  ├─ viewer-explode.js
  ├─ viewer-section-cut.js
  ├─ viewer-context-menu.js
  ├─ viewer-bom.js
  ├─ viewer-part-info.js
  │   ├─→ STL exporter (external lib needed)
  │   ├─→ OBJ exporter (external lib needed)
  │   └─→ glTF exporter (Three.js built-in)
  ├─ viewer-ai-identify.js
  │   └─→ Gemini Vision API
  │   └─→ McMaster-Carr API
  ├─ viewer-shortcuts.js
  ├─ viewer-animation.js
  ├─ viewer-measurements.js
  ├─ viewer-transparency.js
  ├─ viewer-grid.js
  ├─ viewer-screenshot.js
  ├─ viewer-comparison.js
  ├─ viewer-weight.js
  │
  ├─ viewer-slicer.js
  │   └─→ g-code generator (external lib)
  ├─ viewer-annotations.js
  ├─ viewer-technical-drawings.js
  │   └─→ dxf-export.js (existing)
  ├─ viewer-qr.js
  │   └─→ qrcode-generator (existing in cycleCAD)
  ├─ viewer-hero-shots.js
  ├─ viewer-voice.js
  ├─ viewer-smart-filters.js
  ├─ viewer-bom-costing.js
  ├─ viewer-asm-instructions.js
  ├─ viewer-maint-heatmap.js
  ├─ viewer-wear-timeline.js
  ├─ viewer-collab.js
  │   └─→ WebRTC + CRDT (Phase D)
  ├─ viewer-clash.js
  │   └─→ CSG library
  ├─ viewer-standards.js
  ├─ viewer-blueprint-theme.js
  ├─ viewer-help.js
  ├─ viewer-ai-render.js
  │   └─→ Stable Diffusion/Midjourney API
  ├─ viewer-library.js
  └─ viewer-ar.js
      └─→ WebXR API

Shared with Edit Mode:
  ├─ ai-chat.js (enhanced)
  ├─ dxf-export.js (existing)
  ├─ export.js (enhanced)
  └─ viewport.js (existing)
```

---

## Blocking Dependencies

| Blocker | Feature | Workaround | Phase |
|---------|---------|-----------|-------|
| STL Exporter Library | Part Info 3D Export | Use trimesh.js or three-stl-exporter | Phase 1 or 2 |
| g-code Generator | 3D Print Slicer | Use Cura.js or download library | Phase 3 |
| CSG Library | Clash Detection | Use CSGjs or OpenJSCAD | Phase 3 |
| WebXR | AR Scanner | Polyfill or fallback to camera view | Phase 3 |
| External APIs | AI Render, Gemini, McMaster | Already integrated in cycleCAD | Phase 1 |
| CRDT Library | Real-time Collaboration | Yjs or Automerge | Phase D |
| DIN/ISO Database | Standards Identifier | Scrape or import manually | Phase 3 |
| PDF Export | Assembly Instructions | Use pdfkit or wkhtmltopdf | Phase 3 |

---

## External Libraries Needed

| Library | Purpose | Phase | Status |
|---------|---------|-------|--------|
| `three-stl-exporter` or `trimesh.js` | Export parts to STL | Phase 1 | TBD |
| `cura.js` | 3D print slicing | Phase 3 | TBD |
| `csgjs` | Constructive Solid Geometry | Phase 3 | TBD |
| `qrcode-generator` | QR codes | Phase 2 | ✅ Already in cycleCAD |
| `yjs` | Real-time collaboration | Phase D | TBD |
| `pdfkit` | PDF export | Phase 3 | TBD |
| `three-gltf-exporter` | glTF export | Phase 1 | ✅ Built-in to Three.js |

---

## Estimated Total Effort

| Phase | Modules | LoC | Hours | Weeks | Start |
|-------|---------|-----|-------|-------|-------|
| **0** (Done) | 1 | 600 | 4 | 0.5 | Now |
| **1** (Critical) | 8 | 4,050 | 40 | 2 | Week 1 |
| **2** (Enhancement) | 7 | 1,890 | 20 | 1 | Week 3 |
| **3** (Advanced) | 20+ | 6,000+ | 60+ | 2-3 | Week 4 |
| **D** (Enterprise) | 5+ | 2,000+ | 20+ | 1+ | Week 7+ |
| **TOTAL** | 40+ | 14,500+ | 140+ | 7+ weeks | |

**MVP (Phases 0-1):** 60 hours, 2 weeks, ship with cycleCAD v1.1.0

---

## Decision Points

### Must Port
1. Assembly Tree — users need structure
2. Explode/Collapse — cycleWASH differentiator
3. Section Cut — inspection workflow
4. AI Identify — competitive advantage

### Should Port
5. BOM Export — manufacturing workflow
6. Part Info — detail inspection
7. Context Menu — user convenience
8. Measurements — technician workflow
9. Annotations — collaboration prep

### Could Port Later
- Advanced rendering, AR, video generation, etc.
- Only if time + resources allow

### Don't Port (Low ROI)
- Kiri:Moto (external tool)
- Snipper tool (built in to browsers)
- Embed settings (legacy feature)
- Theme system (CSS is enough)

---

**Document:** EXPLODEVIEW-FEATURE-MAPPING.md
**Status:** COMPLETE
**Date:** 2026-03-25
**Author:** Claude (Agent)
