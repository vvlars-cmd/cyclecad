# cycleCAD — Master Plan

## Vision
**The first open-source, browser-based parametric CAD modeler with native Inventor file support and AI-powered design tools.** No install, no license fees, no vendor lock-in. Opens your existing Inventor projects directly in the browser.

## Competitive Landscape

| Competitor | What They Do | Our Edge |
|-----------|-------------|----------|
| **Fusion 360** | Cloud CAD, $$$, Autodesk lock-in | Free, open-source, no install, opens Inventor natively |
| **MecAgent (MIT)** | AI agent that learns CAD from demos, LLM + CAD API | We ship a real product, not a research paper. AI is a feature, not the whole product |
| **VideoCAD** | 41K video dataset training AI to do CAD UI interactions | Dataset/model only — no user-facing product. We can integrate similar AI |
| **AurorInCAD** | AI-powered CAD startup | Closed-source, early stage. We're open-source with real Inventor parsing |
| **OnShape** | Browser CAD (PTC) | Expensive, enterprise-only. We're free and open-source |
| **FreeCAD** | Desktop open-source CAD | Desktop-only, Python-heavy, no AI, no Inventor import. We're browser-native |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    cyclecad.com                               │
├─────────────────────────────────────────────────────────────┤
│  Landing Page (/) → App (/app/) → Docs (/app/docs/)        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Project   │  │  3D Viewport │  │  Properties Panel     │ │
│  │ Browser   │  │  (Three.js)  │  │  - Parameters         │ │
│  │           │  │              │  │  - Materials           │ │
│  │ Model     │  │  Sketch      │  │  - Operations         │ │
│  │ Tree      │  │  Canvas      │  │  - AI Chat            │ │
│  │           │  │  (2D overlay) │  │  - Rebuild Guide     │ │
│  └──────────┘  └──────────────┘  └───────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Core Modules (ES Modules, zero deps)                 │   │
│  │                                                        │   │
│  │  viewport.js ─── sketch.js ─── operations.js          │   │
│  │  tree.js ─── params.js ─── export.js                  │   │
│  │  inventor-parser.js ─── assembly-resolver.js          │   │
│  │  project-loader.js ─── project-browser.js             │   │
│  │  rebuild-guide.js ─── reverse-engineer.js             │   │
│  │  ai-chat.js ─── shortcuts.js ─── app.js              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AI Layer (Gemini Flash + Groq Llama 3.1)             │   │
│  │  - Natural language → CAD commands                     │   │
│  │  - Part identification from geometry                   │   │
│  │  - Assembly instructions generation                    │   │
│  │  - Smart search with synonyms                          │   │
│  │  - Offline fallback (local NLP parser)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Feature Roadmap

### Phase 1: Foundation ✅ DONE
- [x] Three.js r170 viewport with OrbitControls
- [x] 2D sketch engine (line, rect, circle, arc, polyline)
- [x] Grid snapping + constraint detection
- [x] Extrude operation (parametric)
- [x] Feature tree panel
- [x] Parameter editor with materials
- [x] Export: STL, OBJ, glTF, JSON
- [x] AI chatbot (Gemini + Groq + offline fallback)
- [x] Keyboard shortcuts (25+)
- [x] Dark theme UI (VS Code-style)
- [x] Welcome splash with quick actions

### Phase 2: Inventor Integration ✅ DONE
- [x] OLE2/CFB binary parser for .ipt/.iam files
- [x] Feature detection (26 types: extrude, revolve, hole, fillet, etc.)
- [x] Assembly constraint detection (mate, flush, angle, insert, etc.)
- [x] Part type classification (solid, sheet metal, weldment)
- [x] Project loader (.ipj parser, folder indexing)
- [x] Project browser (folder tree, file categorization, search)
- [x] Assembly resolver (reference extraction, path resolution, BOM)
- [x] Rebuild guide generator (cycleCAD + Fusion 360 steps)

### Phase 3: Parametric Operations ✅ DONE
- [x] Revolve (with partial angle support)
- [x] Fillet (edge-based, parametric radius)
- [x] Chamfer (edge-based, parametric distance)
- [x] Boolean Union (geometry merge)
- [x] Boolean Cut (visual indicator + intersection)
- [x] Boolean Intersect (overlap volume)
- [x] Shell (hollow body generation)
- [x] Rectangular Pattern (N×M grid)
- [x] Circular Pattern (N copies around axis)
- [x] Undo/Redo (history snapshots)
- [x] Grid toggle, wireframe toggle, fit-to-all

### Phase 4: Real Project Testing 🔄 IN PROGRESS
- [ ] Test parser against all 393 DUO .ipt files
- [ ] Test assembly resolver against 80 .iam files
- [ ] Validate rebuild guides for real parts
- [ ] Performance testing (482 files, batch operations)
- [ ] Fix edge cases in OLE2 parsing

### Phase 5: Advanced Modeling (Next)
- [ ] **Constraint solver** — parametric sketch constraints (parallel, perpendicular, tangent, coincident, equal, fixed)
- [ ] **Dimension-driven design** — change a dimension, model updates
- [ ] **Sweep** — extrude along a path
- [ ] **Loft** — blend between profiles
- [ ] **Thread** — cosmetic + modeled threads
- [ ] **Sheet metal tools** — flange, bend, hem, fold, flat pattern, K-factor
- [ ] **Work features** — construction planes, axes, points
- [ ] **3D sketch** — sketch in 3D space, not just on planes
- [ ] **Direct edit** — push/pull faces without feature tree
- [ ] **Hole wizard** — counterbore, countersink, tapped holes with standard sizes

### Phase 6: Assembly Modeling
- [ ] **Assembly workspace** — place components, define joints
- [ ] **Joint types** — rigid, revolute, slider, cylindrical, planar, ball
- [ ] **Mate constraints** — Inventor-style mates (compatible with parsed .iam data)
- [ ] **Motion simulation** — animate joints, check interference
- [ ] **Exploded views** — automatic + manual explosion
- [ ] **Assembly BOM** — auto-generated from tree, export to CSV/Excel
- [ ] **Cross-references** — "where used" for any part

### Phase 7: AI-Powered Features
- [ ] **AI sketch-to-3D** — describe a part in words → get a parametric model
- [ ] **Smart autocomplete** — predict next operation based on context
- [ ] **Part recognition** — upload photo → identify standard part → suggest McMaster-Carr
- [ ] **Design validation** — check for manufacturability issues
- [ ] **Cost estimation** — estimate manufacturing cost from geometry + material
- [ ] **Natural language editing** — "make the hole 2mm larger" → parametric change
- [ ] **Assembly instructions** — auto-generate step-by-step from assembly tree
- [ ] **Maintenance scheduling** — predict part wear from material + usage patterns

### Phase 8: Manufacturing Integration
- [ ] **DXF/DWG export** — 2D drawings from 3D models
- [ ] **STEP export** — via OpenCascade.js or server-side
- [ ] **3D print slicer** — built-in G-code generation
- [ ] **CNC toolpath** — basic 2.5D milling paths
- [ ] **Laser/waterjet** — flat pattern → DXF for cutting
- [ ] **Kiri:Moto integration** — send to Kiri for advanced slicing
- [ ] **McMaster-Carr links** — direct purchase links for standard parts
- [ ] **Tolerance analysis** — GD&T annotations

### Phase 9: Collaboration & Sharing
- [ ] **Real-time collaboration** — multiple users editing same model (WebRTC)
- [ ] **Version control** — git-like branching for design iterations
- [ ] **Comments/annotations** — pin notes to features/faces
- [ ] **Share links** — public URL for any model
- [ ] **Embed widget** — `<iframe>` embed for websites/docs
- [ ] **PDF reports** — auto-generate technical documentation

### Phase 10: Platform
- [ ] **Plugin API** — extend cycleCAD with custom tools
- [ ] **Model library** — browse/search community models
- [ ] **Template gallery** — start from common templates
- [ ] **Multi-language** — EN, DE, FR, ES, IT, NL (already in ExplodeView)
- [ ] **Mobile/tablet** — responsive touch UI
- [ ] **PWA** — installable, works offline
- [ ] **Desktop app** — Electron wrapper for local file access

## Tech Stack
- **Rendering**: Three.js r170 (WebGL)
- **Geometry**: Custom + BufferGeometryUtils
- **File parsing**: Custom OLE2/CFB parser (zero deps)
- **AI**: Gemini Flash API + Groq (Llama 3.1 8B) + local NLP fallback
- **Hosting**: GitHub Pages (cyclecad.com)
- **Package**: npm `cyclecad`
- **License**: MIT

## Metrics (Current)
- npm: cyclecad v0.1.3
- 15 JS modules, ~10,000+ lines
- 482 real Inventor files in example project
- 393 .ipt parts, 80 .iam assemblies
- Zero dependencies (CDN only)

## What Makes cycleCAD Different
1. **Opens existing Inventor projects** — no other browser CAD does this
2. **Reverse engineers parts** — generates rebuild guides for Fusion 360 + cycleCAD
3. **AI-native** — not bolted on, integrated from day 1
4. **Zero install** — open a URL, start working
5. **Open source** — MIT license, community-driven
6. **Real-world tested** — built for the cycleWASH DUO (473 parts, production machine)
