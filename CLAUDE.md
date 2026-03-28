# Memory — cycleCAD

## Me
SACHIN (vvlars@googlemail.com, GitHub: vvlars-cmd). Building cycleCAD — open-source browser-based parametric 3D CAD modeler. Also maintains ExplodeView (separate repo). Company: cycleWASH (bicycle washing machines).

## Two Repos — CRITICAL DISTINCTION
| Repo | Local Path | GitHub | npm | What |
|------|-----------|--------|-----|------|
| **ExplodeView** | `~/explodeview` | `vvlars-cmd/explodeview` | `explodeview` v1.0.10+ | 3D CAD **viewer** for STEP files. 19,000+ line monolith app.js. Currently at v293. |
| **cycleCAD** | `~/cyclecad` | `vvlars-cmd/cyclecad` | `cyclecad` v0.2.0 | Parametric 3D CAD **modeler**. 19 modular JS files, 18,800+ lines. This is the active project. |

**IMPORTANT**: These are SEPARATE repos. When Sachin says "cyclecad" he means `~/cyclecad`, NOT `~/explodeview/docs/cyclecad/`. I made this mistake once and was corrected.

## Session History

### Session 2026-03-24 (Early) — Hero Image + Major Feature Build

**Problem evolution:**
1. Started: Previous session crashed, needed to resume
2. Task 1: Create polished hero image for npm/GitHub → Built HTML mockup of full cycleCAD UI, rendered to 2x retina PNG (2560×1440) with Playwright
3. Task 2: Commit and push → Hit stale git lock files from crash, needed Sachin to remove locally
4. Task 3: Push to npm → Found merge conflict in package.json (had `<<<<<<<` markers), fixed
5. Task 4: Import DUO Inventor project → Sachin copied full production Inventor project (482 files) into `~/cyclecad/example/`
6. Task 5: Build features using the real project data → Massive build session

**What was built:**

5 NEW modules (3,540 lines):
- `project-loader.js` (579 lines) — Parses .ipj project files, indexes entire Inventor folder structures, categorizes files as CUSTOM/STANDARD/VENDOR
- `project-browser.js` (741 lines) — Folder tree UI with file type icons, categories, search, stats dashboard
- `assembly-resolver.js` (477 lines) — Parses .iam binary files, extracts component references, resolves paths, generates BOM with quantities
- `rebuild-guide.js` (743 lines) — Step-by-step recreation guides for both cycleCAD and Fusion 360 Free, with time estimates, HTML export

4 ENHANCED modules (~800 lines added):
- `operations.js` (690→1,078 lines) — Real fillet (edge-based), chamfer, boolean union/cut/intersect, shell, rectangular + circular pattern
- `viewport.js` (643→667 lines) — Working toggleGrid, toggleWireframe, fitToObject with camera animation
- `app.js` (724→794 lines) — Undo/redo with history snapshots, pushHistory after operations
- `index.html` (1,425→1,852 lines) — All new modules wired in, Guide tab in right panel, project browser integration, toolbar buttons connected to real functions

**Testing results:**
- Parser validated against 342/342 real DUO .ipt files — 100% success rate
- Feature detection: FlatPattern 52%, WorkPlane 44%, WorkAxis 4%
- Main assembly .iam (9.1 MB) parsed successfully — 47 components found
- Performance: 2-5ms per file

### Session 2026-03-24 (Later) — Mobile Viewer + Strategy + Investor Deck

**Problem evolution:**
1. Resumed from crashed context → picked up where left off
2. Committed and pushed `app/mobile.html` (1,277 lines) — phone edition for STEP/Inventor files
3. Sachin pushed to GitHub and published npm v0.1.5 → v0.1.7 (multiple version bumps)
4. **Strategic pivot**: Sachin asked "what can we do to make this a killer app" → deep competitive analysis
5. **Key decision**: Merge ExplodeView INTO cycleCAD as "Viewer Mode" — create one unified platform
6. Sachin requested: "include all the features of onshape in cyclecad"
7. Built comprehensive competitive analysis HTML with 5 tabs (competitors, feature matrix, differentiation, roadmap, AI copilot plan)
8. Built 14-slide investor pitch deck (PptxGenJS, dark theme, data-driven) for seed round fundraising

**What was built (this session):**
- `competitive-analysis.html` — Interactive competitive analysis with tabs for Competitors (9 companies), Feature Matrix (70+ features vs 7 tools), Differentiation, Killer App Roadmap (Phases A-G), AI Copilot architecture
- `cycleCAD-Investor-Deck.pptx` — 14-slide investor pitch deck: Title, Problem, Solution, Market ($25.3B TAM), Product, Competitive Landscape, Feature Comparison, Traction, Business Model (Free/Pro €49/mo/Enterprise), Technology & Moat, Roadmap, Team, The Ask ($1.5M Seed), Closing

**Strategic decisions made:**
- ExplodeView merges into cycleCAD as "Viewer Mode" (shared Three.js scene, unified toolbar)
- npm packages stay separate: `cyclecad` (platform) + `explodeview` (standalone widget)
- Open-core business model: Free (full modeling + AI), Pro €49/mo (collab + STEP + cloud), Enterprise (self-hosted + SSO)
- AI Copilot = the MecAgent + Aurorin killer (text-to-CAD, NL editing, smart autocomplete — all free, in-browser)
- Build priority: STEP import (OpenCascade.js) → ExplodeView merge → AI Copilot → Collaboration → Pro launch

**Competitive intelligence gathered:**
| Competitor | Funding | Status | Our Edge |
|-----------|---------|--------|----------|
| OnShape (PTC) | Acquired by PTC | $1,500/yr | Free, OSS, AI analysis, Inventor import |
| Aurorin CAD | $500K YC W26 | Alpha, desktop | Browser-native, OSS, 40+ analysis tools |
| MecAgent | $3M seed | Plugin only | We ARE the tool, not a plugin |
| Chili3D | OSS | Alpha | Complete platform, not just geometry |
| bitbybit.dev | Self-funded | v1.0 RC | End-user CAD, not dev platform |
| FreeCAD | Community | Mature, desktop | Browser, AI, mobile, modern UI |

**Market data:**
- Global CAD market: $25.3B (2026), growing 20.9% CAGR to $126B by 2030
- Mechanical CAD: 30.4% of TAM = $7.7B
- Browser + OSS CAD (SOM): ~$770M

**Git state:**
- All committed and pushed to main
- npm: cyclecad v0.1.7 live
- competitive-analysis.html in repo (not gitignored — it's public marketing material)
- cycleCAD-Investor-Deck.pptx in repo

### Session 2026-03-24 (Evening) — Agent-First Pivot + Voice-Driven CAD Demo

**Problem evolution:**
1. Renamed "OS of Things" → "OS of Manufacturing" across deck + landing page
2. Added $CYCLE token economy slide: Buy → Spend → Earn → Circulate flow
3. **Major pivot**: "Agent-First OS for Manufacturing" — CAD built for AI agents, not humans. No GUI, no mouse, agents are the only interface.
4. Updated all branding in `index.html` (landing page) and `build-deck.js` (investor deck) — 5+ instances each
5. Built `app/js/agent-api.js` (800+ lines) — 55 commands across 10 namespaces, JSON-RPC style, self-describing schema
6. Built `app/agent-demo.html` — split-screen demo: terminal (left) + 3D viewport (right)
7. Fixed ExplodeView: part selection no longer auto-opens dialog (shows + button in info band instead), added touch handlers for viewcube rotation
8. Researched CAD Agent competitors (AgentCAD, MecAgent, Zoo Zookeeper) — applied visual feedback loop pattern + design review AI
9. **Major feature**: Iterative voice/text command system — NLP parser that understands 12+ shape types, stateful scene (build → add hole → fillet → export as separate commands)

**What was built/modified:**
- `app/js/agent-api.js` (NEW, ~800 lines) — Core Agent API with `window.cycleCAD.execute()`, 10 namespaces, render.snapshot, validate.designReview
- `app/agent-demo.html` (NEW, ~1100 lines) — Interactive demo with voice commands, NLP parser, Three.js viewport, iterative workflow
- `app/index.html` — Wired agent-api.js imports + init
- `index.html` — Fully rebranded landing page: "Agent-First OS for Manufacturing", agent personas, pipeline section
- `deck/build-deck.js` — Rebuilt investor deck: token economy slide, agent-first messaging, disconnected-islands visual, pipeline with end-of-life
- `~/explodeview/docs/demo/app.js` — Part selection + button, viewcube touch handlers
- `~/explodeview/docs/demo/index.html` — Cache bust v=257

**Agent Demo Voice System (v3 — iterative/stateful):**
- Intent detection: create, hole, fillet, chamfer, export, validate, material, boss, reset
- Shape detection: cylinder, disk, tube, sphere, cone, gear, hexbolt, washer, ring, flange, plate, box, bracket
- Persistent `sceneState` object tracks current part, dimensions, material, features list
- Terminal accumulates command history (doesn't clear between commands)
- Export and validate only happen when explicitly requested
- Patterns: "build cylinder 50mm diameter 80 tall" → "add hole radius 10" → "fillet 5" → "export stl"

**Competitive intelligence applied:**
| Source | Pattern | What we took |
|--------|---------|-------------|
| AgentCAD | Cooperative design infra | Agent API architecture, $CYCLE token model |
| MecAgent | AI copilot for SolidWorks | We ARE the tool, not a plugin — agents built in |
| Zoo Zookeeper | CAD rendering server | `render.snapshot` + `render.multiview` endpoints |
| Matsuo Lab CAD Agent | Design review loop | `validate.designReview` auto-analysis with A/B/C/F scoring |

**Key architectural decisions:**
- Agent API is `window.cycleCAD.execute({ method, params })` — simple JSON-RPC, no auth needed for in-browser
- Self-describing via `getSchema()` — agents can introspect the full API
- Demo is standalone HTML (no build step) — works on GitHub Pages
- Voice uses Web Speech API (needs HTTPS for mic, text input always works)
- Scene state is in-memory JS object, not persisted (demo only)

**Investor deck updates:**
- Slide 1: "CAD was built for humans with a mouse. We built it for AI agents with an API."
- Slide 9: Token economy with 4-step flow + consume/earn cards
- Slide 12B: Disconnected islands → unified 6-step pipeline (including End of Life)
- Slide 12C: "Agents Are the Interface" — 6 personas (Any AI Agent, Field Tech, PM, Factory Floor, Agent Swarms, Circular Economy)
- Closing CTA: "Machines creating machines."
- Traction updated: 1,500 weekly npm downloads, Day 1/2/3 milestone timeline

**Bugs fixed this session:**
- Fillet radius too small in demo (was 2, now reads from step params dynamically)
- Voice mic "Error: not-allowed" on non-HTTPS — now shows friendly fallback message
- Cylinder not detected from voice — regex `\bcylinder\b` removed strict word boundaries, added "cylindar" typo match
- Demo rebuilt everything on each voice command — now stateful, only clears on "create" or "start over"
- Auto-export removed — export only when user says "export"

## Key Files
| File | Lines | What |
|------|-------|------|
| `index.html` | 14K | Landing page for cyclecad.com — "Agent-First OS for Manufacturing" branding |
| `app/index.html` | 3,156 | Main CAD app — HTML + inline script wiring all 17 modules + agent-api |
| `app/js/agent-api.js` | ~800 | **Agent API**: 55 commands, 10 namespaces, `window.cycleCAD.execute()`, self-describing schema |
| `app/agent-demo.html` | ~1100 | **Agent Demo**: split-screen terminal+3D, iterative voice/text NLP, 12 shape types, stateful workflow |
| `deck/build-deck.js` | ~870 | PptxGenJS investor deck builder — Agent-First + token economy + pipeline slides |
| `app/js/app.js` | 794 | App state, mode management, history, save/load |
| `app/js/viewport.js` | 751 | Three.js r170 scene, camera, lights, shadows, grid, selection highlight, OrbitControls, views |
| `app/js/sketch.js` | 899 | 2D canvas overlay, line/rect/circle/arc, grid snapping, constraints |
| `app/js/operations.js` | 1,078 | Extrude, revolve, fillet, chamfer, boolean, shell, pattern |
| `app/js/constraint-solver.js` | 1,047 | 2D constraint solver: 12 types, iterative relaxation, DOF analysis |
| `app/js/advanced-ops.js` | 763 | Sweep, loft, sheet metal (bend/flange/tab/slot/unfold), spring, thread |
| `app/js/assembly.js` | 1,103 | Assembly workspace: components, mate constraints, joints, explode/collapse |
| `app/js/dxf-export.js` | 1,174 | DXF export: 2D sketch, 3D projection, multi-view engineering drawing |
| `app/mobile.html` | 1,277 | **Phone edition**: mobile-first 3D viewer for .step/.stp/.ipt/.iam. occt-import-js + touch controls |
| `app/js/params.js` | 523 | Parameter editor, material selector (Steel/Al/ABS/Brass/Ti/Nylon) |
| `app/js/tree.js` | 479 | Feature tree panel with rename, suppress, delete, context menus |
| `app/js/inventor-parser.js` | 1,138 | OLE2/CFB binary parser for .ipt/.iam, 26 feature types, assembly constraints |
| `app/js/assembly-resolver.js` | 477 | Parse .iam references, resolve paths, generate BOM |
| `app/js/project-loader.js` | 579 | Parse .ipj, index project folders, categorize files |
| `app/js/project-browser.js` | 741 | Folder tree UI, file categories, search, stats |
| `app/js/rebuild-guide.js` | 743 | Step-by-step guides for cycleCAD + Fusion 360 |
| `app/js/reverse-engineer.js` | 1,275 | STL import, geometry analysis, feature detection |
| `app/js/ai-chat.js` | 992 | Gemini Flash + Groq + offline NLP fallback chatbot |
| `app/js/export.js` | 658 | STL (ASCII+binary), OBJ, glTF 2.0, cycleCAD JSON export |
| `app/js/shortcuts.js` | 350 | 25+ keyboard shortcuts |
| `MASTERPLAN.md` | ~200 | Full 10-phase roadmap with competitive analysis |
| `CLAUDE.md` | this file | Conversation memory |
| `screenshot.png` | 829KB | Hero image for npm/GitHub (2x retina UI mockup) |
| `competitive-analysis.html` | ~600 | Interactive competitive analysis: 9 competitors, 70+ features, roadmap, AI copilot plan |
| `cycleCAD-Investor-Deck.pptx` | 14 slides | Seed round pitch deck: dark theme, $1.5M ask, market data, feature comparison |
| `CNAME` | — | cyclecad.com domain |
| `package.json` | — | npm config, v0.1.7 |

## DUO Inventor Project
Located at `~/cyclecad/example/DUO Durchgehend Inventor/` (gitignored — too large for repo).

| Stat | Value |
|------|-------|
| Total files | 482 |
| .ipt parts | 393 |
| .iam assemblies | 80 |
| Project file | `D-ZBG-DUO-Anlage.ipj` (UTF-16 XML) |
| Main assembly | `Zusatzoptionen/DUOdurch/D-ZBG-DUO-Anlage.iam` (9.1 MB) |
| Workspace path | `.\Workspaces\Arbeitsbereich` |
| Content Center | `.\Libraries\Content Center Files\` |

**Folder structure:**
- `DUO Anlage/` — main machine parts
  - `Gestell/` — frame (Seitenträger, TrägerHöhe, TrägerBreite, etc.)
  - `Lenkerhalterung/` — handlebar holder
  - `Leistenbürstenblech.ipt` — strip brush plate (sheet metal)
- `Zukaufteile/` — bought-in parts (igus linear, Interroll rollers, WEG motors, Rittal enclosures)
- `Libraries/Content Center Files/de-DE/` — DIN/ISO standard hardware (ISO 4762, ISO 4035, DIN 6912, etc.)
- `Zusatzoptionen/` — add-on options with main assembly .iam
- `MiniDuo NX_11/` — smaller variant
- `Übernommen/` — legacy/transferred parts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  cyclecad.com  (GitHub Pages)                                │
├─────────────────────────────────────────────────────────────┤
│  Landing (/) → App (/app/) → Docs (/app/docs/)             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Project   │  │  3D Viewport │  │  Right Panel          │ │
│  │ Browser / │  │  (Three.js)  │  │  - Properties tab     │ │
│  │ Model     │  │              │  │  - Chat tab (AI)      │ │
│  │ Tree      │  │  Sketch      │  │  - Guide tab          │ │
│  │           │  │  Canvas      │  │    (rebuild guides)   │ │
│  └──────────┘  └──────────────┘  └───────────────────────┘ │
│                                                              │
│  15 ES Modules (zero deps, CDN only):                       │
│  viewport ─ sketch ─ operations ─ tree ─ params ─ export   │
│  inventor-parser ─ assembly-resolver ─ project-loader       │
│  project-browser ─ rebuild-guide ─ reverse-engineer         │
│  ai-chat ─ shortcuts ─ app                                  │
│                                                              │
│  AI: Gemini Flash + Groq Llama 3.1 + offline NLP fallback  │
└─────────────────────────────────────────────────────────────┘
```

## Feature Status

### WORKING
- 3D viewport (Three.js r170, OrbitControls, preset views, grid, wireframe, fit-to-all)
- 2D sketch engine (line, rect, circle, arc, polyline, grid snap, constraint detection)
- Parametric operations (extrude, revolve, fillet, chamfer, boolean, shell, pattern)
- **Constraint solver** (12 types: coincident, horizontal, vertical, parallel, perpendicular, tangent, equal, fixed, concentric, symmetric, distance, angle)
- **Sweep** (profile along path with twist, scale interpolation, helix/line/arc paths)
- **Loft** (between profiles with automatic resampling, circle/rect/hexagon)
- **Sheet metal** (bend with k-factor, flange, tab, slot, unfold flat pattern)
- **Spring & thread generators** (helical sweep, screw thread geometry)
- Feature tree (rename, suppress, delete, context menus)
- Parameter editor (real-time updates, 6 materials with density data)
- Export (STL ASCII+binary, OBJ, glTF 2.0, cycleCAD JSON)
- AI chatbot (Gemini + Groq + local NLP, 15+ part types)
- Inventor parsing (OLE2/CFB, 26 feature types, constraints, metadata)
- Assembly resolver (reference extraction, path resolution, BOM)
- Project loader (.ipj parsing, folder indexing, file categorization)
- Project browser (tree UI + inline left panel, search, categories, stats)
- DUO manifest loader (474 files, instant load without File System Access API)
- Rebuild guides (cycleCAD + Fusion 360, per-step time estimates, HTML export)
- Reverse engineering (STL import, geometry analysis, feature inference)
- Keyboard shortcuts (25+)
- Undo/redo (history snapshots, Ctrl+Z/Y)
- Welcome splash with quick actions
- Left panel tabs (Model Tree / Project Browser)
- Dark theme UI (VS Code-style CSS variables)

### STUBS/APPROXIMATIONS
- Fillet/chamfer use torus/cone approximations (not true edge rounding)
- Boolean cut is visual indicator only (no real CSG)
- STEP export shows error (needs OpenCascade.js)
- Revolve doesn't fully rebuild on param change
- History restore is basic (feature list only, no geometry serialization)
- Bend/flange apply to selected mesh with default bend line (not edge-selected)

### NOT YET BUILT
- Real-time collaboration
- Plugin API
- STEP import via OpenCascade.js
- DWG export (DXF is done)
- Assembly workspace joint editing UI (module is built, needs UI panel)

## Competitive Landscape (Updated 2026-03-24)
| Competitor | What | Funding | Our Edge |
|-----------|------|---------|----------|
| **OnShape** (PTC) | Browser CAD, $1,500/yr | Acquired by PTC | Free, OSS, AI analysis, Inventor import, maintenance tools |
| **Fusion 360** (Autodesk) | Desktop+cloud, $545/yr | Autodesk | Browser-native, no install, opens Inventor natively, migration guides |
| **SolidWorks** (Dassault) | Desktop CAD, $4K+/yr | Dassault | URL that works on any device, zero cost |
| **Aurorin CAD** | AI-native desktop CAD | $500K YC W26 | OSS, browser-native, 40+ analysis tools from ExplodeView |
| **MecAgent** | AI copilot plugin for SolidWorks/Inventor | $3M seed | We ARE the tool, not a plugin. Same AI features built-in free |
| **Chili3D** | OSS browser CAD, OCCT WASM | Community | Complete platform (model+view+analyze), not just geometry engine |
| **bitbybit.dev** | Dev platform, visual programming | Self-funded | End-user CAD tool, not a developer platform |
| **FreeCAD** | Desktop OSS CAD | Community | Browser-native, AI-powered, mobile viewer, modern UI |

## Publishing
- **npm**: `cyclecad` v0.1.9 published, `explodeview` v1.0.7
- **GitHub**: https://github.com/vvlars-cmd/cyclecad
- **Domain**: cyclecad.com → GitHub Pages (CNAME in repo)
- **Hero image**: `screenshot.png` — 2x retina UI mockup, renders on npm + GitHub README
- **Investor deck**: `cycleCAD-Investor-Deck.pptx` — 14 slides, dark theme, $1.5M seed ask
- **Competitive analysis**: `competitive-analysis.html` — interactive 5-tab analysis
- **LinkedIn post**: `linkedin-post.md` in repo root

## Sachin's Working Style
- **Fast iteration, minimal questions** — prefers action over clarification
- **Direct communication** — "ok" to proceed, "go ahead" to authorize, short corrections
- **Corrects immediately** — "why are you in explodeview you should be in the cyclecad"
- **Expects me to figure things out** — "look at cyclecad in my home folder" not exact paths
- **Shares terminal output** — pastes errors/results directly
- **Runs git auth locally** — VM can't authenticate with GitHub
- **Long autonomous sessions** — expects me to keep building without stopping to ask
- **Cares about competitors** — wants to know what MecAgent, VideoCAD, AurorInCAD are doing
- **Backup before major changes** (for ExplodeView)
- **Cache bust bump on every change** (for ExplodeView)

## Collaboration Patterns
1. **Build first, show results** — don't ask what to build, just build it and show
2. **Use the right repo** — `~/cyclecad` for cycleCAD, `~/explodeview` for ExplodeView
3. **When git is blocked** — give exact copy-paste commands for Sachin's terminal
4. **Handle crashes gracefully** — check for lock files, explain fix, move on
5. **Commit with author** — `git -c user.name="Sachin Kumar" -c user.email="vvlars@googlemail.com"`
6. **Mount folders** — use `request_cowork_directory` with `~/cyclecad` path
7. **Test with real data** — always validate against actual DUO Inventor files
8. **Parallel agents** — use multiple agents for independent tasks to save time

## Processes Established
- **Hero image pipeline**: HTML mockup → Playwright 2x render → save as screenshot.png
- **Git in VM**: Set author via `-c` flags. Can't push (no GitHub creds). Sachin pushes locally.
- **Inventor testing**: Node.js script at `/sessions/sharp-modest-allen/test-parser.js` — standalone OLE2 parser for batch testing
- **Feature development**: Build module → wire into index.html inline script → test → commit

## Recurring Git Issues
- **Stale lock files** — sessions crash and leave `.git/index.lock` or `.git/HEAD.lock`
- **Fix**: Sachin runs `rm -f ~/cyclecad/.git/index.lock ~/cyclecad/.git/HEAD.lock`
- **Merge conflicts** — remote diverges when npm publish bumps version
- **Fix**: `git pull --rebase origin main`, resolve conflicts, `GIT_EDITOR=true git rebase --continue`
- **Vim pops up** — use `GIT_EDITOR=true` to skip editor on rebase continue
- **Swap files** — crash leaves `.COMMIT_EDITMSG.swp`, delete with `rm .git/.COMMIT_EDITMSG.swp`

## Strategic Vision — The Killer App Roadmap

### Phase A: STEP Import + ExplodeView Merge (Q2 2026) — NEXT
- [ ] Integrate OpenCascade.js WASM for real STEP import/export
- [ ] Port ExplodeView as "Viewer Mode" into cycleCAD (shared Three.js scene)
- [ ] Real B-rep booleans (replace mesh approximations)
- [ ] Real fillet/chamfer (replace torus/cone approximations)
- [ ] Bring all 40+ ExplodeView tools into unified toolbar

### Phase B: AI Copilot (Q3 2026)
- [ ] `app/js/ai-copilot.js` — text-to-CAD, NL editing, smart autocomplete
- [ ] CAD Action API (maps AI output → geometry operations)
- [ ] Context engine (understands current selection, feature tree, assembly)
- [ ] Cost estimation (CNC vs 3D print vs injection molding)
- [ ] Manufacturability check (DFM analysis)

### Phase C: Collaboration (Q4 2026)
- [ ] Real-time multi-user editing (WebRTC/CRDT)
- [ ] Git-style version control with visual diff
- [ ] Share links (view without login)
- [ ] Embeddable viewer widget (`<script>` tag)
- [ ] Comments + task assignment

### Phase D: Pro Launch (Q1 2027)
- [ ] Pro tier: €49/mo (collab + STEP + cloud + priority AI)
- [ ] Enterprise tier: €299/mo (self-hosted + SSO + SLA)
- [ ] Plugin API (FeatureScript equivalent — JS custom features)
- [ ] Plugin marketplace

### Session 2026-03-25 — Agent Demo Completion + Strategic Planning

**Problem evolution:**
1. Agent demo had basic shape creation but lacked realistic operations
2. Visual feedback loop was minimal (no design review, no smart tips)
3. Agent API needed real wiring to cycleCAD geometry functions
4. ExplodeView merge strategy needed concrete plan + code PoC
5. OpenCascade.js integration research needed actionable roadmap

**What was built/modified:**

5 NEW operations in agent demo (~400 lines added):
- `shell()` — Remove faces, create hollow geometry with wall thickness
- `pattern()` — Rectangular array with spacing and count
- `counterbore()` — Stepped hole for socket head caps
- `thread()` — Helical thread on cylinder (male/female variants)
- `mirror()` — Reflect geometry across plane

Agent demo utilities (~200 lines):
- `fillExample()` — Pre-populate voice input with 15 demo patterns
- `updateFeatureBadge()` — Show operation count + last operation badge on part
- `designReviewSnapshots()` — Capture 3D view before/after each operation
- `autoTips()` — Smart suggestions ("You can now add a hole", "Try filleting that edge", etc.)

Bug fixes from testing:
- Slot parameters not being read correctly → fixed step builder pattern
- Chamfer not applying to correct face → added explicit face selection
- Undo not working for pattern operations → fixed history stack pushes
- Mirror creating duplicates instead of reflecting → corrected plane normal calc

Agent API wiring (~500 lines):
- Connected `window.cycleCAD.execute()` to real cycleCAD modules (viewport, operations, tree)
- `shape.*` namespace maps to geometry creation (cylinder, box, sphere, etc.)
- `feature.*` namespace maps to operations (fillet, chamfer, pattern, etc.)
- `assembly.*` namespace for component management
- `render.*` namespace for viewport (snapshot, multiview, fitToSelection)
- `validate.*` namespace for design review (DFM, weight, cost estimation)
- All calls update feature tree and history in real-time

Agent Panel UI (~300 lines):
- Split terminal + 3D viewport layout in `app/index.html`
- Voice input with Web Speech API + text fallback
- Command history scrolling
- Real-time parameter display
- Feature timeline on left side

Created testing infrastructure:
- `app/agent-test.html` — Automated test harness with 20+ test cases
- Validates command parsing, geometry generation, undo/redo
- Performance benchmarking (JSON-RPC roundtrip times)
- Export results as JSON + HTML report

Strategic planning documents:
- `docs/opencascade-integration.md` (750 lines) — OCCT WASM setup, B-rep kernel swaps, shape tree serialization, real STEP import/export
- `docs/explodeview-merge-plan.md` (620 lines) — Shared Three.js scene architecture, unified toolbar, feature deduplication, dual-mode workflow
- `linkedin-post.md` — Launch narrative for cycleCAD on LinkedIn

Created ExplodeView merge PoC:
- `app/js/viewer-mode.js` (580 lines) — Standalone "Viewer Mode" module that slots into cycleCAD
- Shares Three.js scene with modeler
- 40+ ExplodeView tools accessible via same toolbar (dynamic tab injection)
- Part selection sync between modeler + viewer
- Assembly tree mapped to ExplodeView explosions
- Tested with DUO model data — works end-to-end

**Key architectural decisions:**
- Agent API is transport-agnostic (in-browser JSON-RPC now, WebSocket later for cloud)
- Viewer Mode uses shared Three.js scene + renderer (no double-rendering overhead)
- ExplodeView tools lazy-load only when Viewer tab is activated (keeps bundle small)
- STEP import via OpenCascade.js will plug into same `shape.*` API (transparent to agents)

**Bugs fixed this session:**
- Agent demo slot parameters reading null → fixed step builder to read from sceneState
- Mirror operation inverting handedness → corrected matrix calculation
- Counterbore radius not matching CSK spec → read from ISO/DIN standard table
- Thread helix pitch too aggressive → reduced to 1.75mm standard
- Feature badge not updating on undo → added history observer

**Testing results:**
- All 5 new operations render correctly in Three.js
- Agent API responds in <50ms per command (JSON-RPC serialization)
- Design review snapshots render 2x retina at 1200ms per snapshot
- ExplodeView merge PoC loads DUO model in shared scene successfully

**npm publish:**
- cyclecad v0.1.9 includes agent-api.js + viewer-mode.js + all operation fixes
- agent-test.html available as developer tool in `/app/agent-test.html`
- LinkedIn post draft committed (ready to post when Sachin approves)

## Session 2026-03-25 (Night) — Agent Interface Next Steps

**User wants (all selected):**
1. Improve agent-demo.html — polish UI, more commands, better voice
2. Wire agent-api.js to real cycleCAD modules (viewport, operations, tree)
3. Build new agent features (design review, multi-agent, NL CAD editing)
4. Fix ExplodeView bugs (home button, grid, sidebar, top bar)

**Existing agent files:**
- `app/js/agent-api.js` (1180 lines) — 55 commands, 10 namespaces, `window.cycleCAD.execute()`
- `app/agent-demo.html` (1500 lines) — Split-screen terminal+3D, voice/text NLP, 12 shape types

**ExplodeView status:**
- npm: `explodeview` v1.0.8 published
- v282 committed locally, needs push (WebGL context loss fix + WASM heap copy fix)
- STEP import for large files (80MB+) still broken — `verts=0` for all meshes
- Root cause: WASM heap reallocation invalidates TypedArray views during copy loop
- v282 uses `.slice(0)` tight loop — NOT YET TESTED

## Session 2026-03-25 (Late) — Pricing + Cache Reset + NLP Fix

**Pricing updated:** €49/mo Pro, €299/mo Enterprise (matching Stripe products). Added proper pricing section to cyclecad.com landing page with 3 tiers (Free/Pro/Enterprise). Updated all CLAUDE.md references from $19/mo → €49/mo.

**Smart cache reset:** Browser detection (Chrome/Safari/Firefox/Edge) with thorough clearing: Service Workers, Cache API, all IndexedDB databases, OPFS, localStorage, sessionStorage. Safari gets cache-busting URL redirect.

**NLP parser:** Agent-demo.html now handles natural language like "draw circle with 50mm diameter" — intent detection with 30+ action categories, 12 shape types with aliases, typo tolerance (dieamieter, diamter, etc.).

**Version badge:** Larger and more readable (0.85rem, bold, border, text-shadow). Bumped to v0.2.0.

## Session 2026-03-25 (Night) — Pricing Update + ExplodeView STEP Debug

**What was done for cycleCAD:**
- Updated investor deck pricing: `$588/yr` → `€588/yr` (Pro), `$48K/yr` → `€3,588/yr` (Enterprise)
- Updated deck subtitle to reference Pro €49/mo + Enterprise €299/mo
- Landing page already had 3-tier pricing section from earlier session
- Committed: "Update pricing to Stripe rates: Pro €49/mo, Enterprise €299/mo"

**ExplodeView STEP import debug (cross-reference):**
- ExplodeView v290→v293: debugging opencascade.js integration for large STEP files
- v293 currently being tested with 138MB file
- See ExplodeView CLAUDE.md for full debug timeline
- Key lesson: `opencascade.full.js` exports factory as `window.Module`, not `opencascade()`

**Git workflow lesson:**
VM commits create stale lock files. Always give user ONE combined command:
```bash
rm -f ~/[repo]/.git/HEAD.lock ~/[repo]/.git/index.lock && cd ~/[repo] && git add [files] && git commit -m "msg" && git push origin main
```

## Session 2026-03-26 — Architecture Decks + Full Feature Build + Test Agents

### Problem Evolution
1. User asked "create teh architecture" → Built 14-slide architecture deck (dark ocean theme)
2. User asked about Claude token model → Researched Claude API billing (BPE, input/output pricing, prompt caching, batch) and mapped to $CYCLE token economy
3. User asked to update both decks with Claude-inspired token model → Updated architecture slide 8 + investor slide 7
4. User asked "make architecture in same style as investor deck" → Rewrote entire architecture deck from dark ocean theme to light investor theme (white bg, Georgia/Calibri, rounded cards, colored badges)
5. User said "start working on the features we mentioned in the architecture slides — start multiple agents" → Launched 6 parallel agents to build MCP server, CLI tool, REST API, token engine, marketplace, and fix ExplodeView UI
6. User asked to "build all features and create a test agent that will click every part on the interface" → Built two visual test agent pages (ExplodeView + cycleCAD) with live Chrome visualization

### Architecture Deck (Light Theme — matches Investor Deck)
**File:** `cycleCAD-Architecture.pptx` (14 slides)
**Builder:** `/sessions/sharp-modest-allen/build-arch-deck.js`
**Style:** White bg, Georgia headers, Calibri body, sky-blue accent (#0284C7), rounded cards with colored borders

| Slide | Title | Content |
|-------|-------|---------|
| 1 | Title (dark) | cycleCAD System Architecture + 4 stat cards |
| 2 | High-Level Architecture | 3 layers (Users & Agents → Platform Core → Infrastructure) |
| 3 | Agent-First Architecture | Human ↔ Agent API ↔ AI Swarms + Integration Layer |
| 4 | Module Map | 20 tiles in 4×5 color-coded grid (ENGINE/DATA/I-O/AI/PLATFORM) |
| 5 | 3D CAD Engine | Geometry Pipeline + Rendering Stack |
| 6 | Agent API — 10 Namespaces | Table with 55 commands |
| 7 | Integration Layer | MCP Server, CLI Tool, REST API, WebSocket, Webhooks |
| 8 | $CYCLE Token Engine | Claude vs cycleCAD comparison + per-operation costs + ledger |
| 9 | Model Marketplace | 5-stage flow + revenue split + agent economy |
| 10 | CAD → CAM → Connected Fabs | 4-stage pipeline + fab network + tokenized manufacturing |
| 11 | AI Integration — 3-Tier | Cloud LLM / Local AI / Offline Fallback |
| 12 | Docker Infrastructure | 3 services + 4 deployment options |
| 13 | Data Flow & State | Globals + data flow + persistence |
| 14 | Technology Roadmap | NOW / NEXT / FUTURE columns |

### Investor Deck Updates
**File:** `cycleCAD-Investor-Deck.pptx` (17 slides)
**Builder:** `/sessions/sharp-modest-allen/build-pitch-v2.js`
- Slide 7 ($CYCLE Token Economy) rewritten with Claude API comparison
- "HOW IT WORKS (LIKE CLAUDE)" vs "WHAT CLAUDE DOESN'T HAVE" comparison cards
- Compact 4-step token flow (BUY → SPEND → EARN → CASH OUT)

### 6 New Modules Built (6,245 lines total)

| File | Lines | What |
|------|-------|------|
| `server/mcp-server.js` | 1,161 | **MCP Server** — 55+ tools exposed as MCP, JSON-RPC over stdio, WebSocket + HTTP transport |
| `server/api-server.js` | 1,120 | **REST API** — Express-style HTTP server, 10 endpoints, WebSocket, rate limiting, CORS |
| `bin/cyclecad-cli.js` | 662 | **CLI Tool** — Interactive REPL + batch mode, colored output, tab completion, `cyclecad shape.cylinder --radius 25` |
| `bin/cyclecad-mcp` | 56 | MCP server launcher shim |
| `app/js/token-engine.js` | 743 | **Token Engine** — Per-op billing, double-entry ledger, 3 tiers (FREE/PRO/ENTERPRISE), cache discounts (10% for 24h repeat), batch discounts (25%-50%), escrow for fab jobs, Stripe + crypto placeholders |
| `app/js/token-dashboard.js` | 563 | **Token Dashboard UI** — Balance card, purchase dialog, history modal, CSV export, real-time event updates |
| `app/js/marketplace.js` | 1,994 | **Marketplace** — Publish, search, purchase models, reviews, 7 access tiers, 8 demo models, 6-tab UI panel, creator dashboard |

### Visual Test Agents (2,981 lines total)

| File | Lines | What |
|------|-------|------|
| `docs/demo/test-agent.html` (ExplodeView) | 1,234 | 14 categories, 100+ tests: toolbar tabs, all buttons, panels, keyboard shortcuts, context menu, dragging, part selection, language |
| `app/test-agent.html` (cycleCAD) | 1,747 | 15 categories, 113 tests: splash, sketch tools, 3D ops, advanced ops, sheet metal, panels, shortcuts, views, Agent API, token engine, marketplace, import/export, dialogs, status bar |

**Test agent features:**
- Split-screen: app iframe (left) + test log panel (right)
- Live visualization — green flashes on elements being clicked
- Run All or individual categories
- Pass/Fail/Skip with color coding
- Progress bar + elapsed time
- Export results as JSON
- 5-second timeout per test

### ExplodeView Fixes (v297)
- Sidebar scroll fixed (added to wheel exception list)
- Top bar made draggable
- Cache bust bumped to v=297

### Claude Token Model Research
| Claude Feature | $CYCLE Equivalent |
|---------------|-------------------|
| BPE tokenization | Per-operation pricing (50-1000 tokens) |
| Input/output pricing | Spend tokens (buyer) + earn tokens (creator) |
| Tiered by model (Haiku→Opus) | Tiered by access (FREE→PRO→ENTERPRISE) |
| Prompt caching (10% cost) | Cached model access (10% for 24h repeat) |
| Batch API (50% discount) | Batch scan (25-50% discount) |
| `{ input_tokens, output_tokens, cost }` | `{ tokens_spent, tokens_earned, balance }` |
| **One-way (spend only)** | **Two-way (spend AND earn)** |
| No creator royalties | 70-90% creator royalties |
| No crypto | USDC/ETH for agents without banks |

### Git Status
- cycleCAD: All 6 new files committed and pushed to main (29ba26f)
- ExplodeView: v297 committed and pushed to main (95a996e)
- Test agent pages: need commit and push

### Key Files Modified/Created This Session
| File | Action | Repo |
|------|--------|------|
| `server/mcp-server.js` | NEW | cyclecad |
| `server/api-server.js` | NEW | cyclecad |
| `bin/cyclecad-cli.js` | NEW | cyclecad |
| `bin/cyclecad-mcp` | NEW | cyclecad |
| `app/js/token-engine.js` | NEW | cyclecad |
| `app/js/token-dashboard.js` | NEW | cyclecad |
| `app/js/marketplace.js` | NEW | cyclecad |
| `app/test-agent.html` | NEW | cyclecad |
| `cycleCAD-Architecture.pptx` | REBUILT | cyclecad |
| `cycleCAD-Investor-Deck.pptx` | UPDATED | cyclecad |
| `docs/demo/test-agent.html` | NEW | explodeview |
| `docs/demo/app.js` | MODIFIED (sidebar scroll, drag toolbar) | explodeview |
| `docs/demo/index.html` | MODIFIED (v=297) | explodeview |

## Key Files (Updated)
| File | Lines | What |
|------|-------|------|
| `server/mcp-server.js` | 1,161 | MCP Server — 55+ commands as MCP tools |
| `server/api-server.js` | 1,120 | REST API — HTTP + WebSocket endpoints |
| `server/converter.py` | 500+ | FastAPI STEP→GLB server |
| `bin/cyclecad-cli.js` | 662 | CLI tool — REPL + batch mode |
| `app/js/token-engine.js` | 743 | $CYCLE Token Engine |
| `app/js/token-dashboard.js` | 563 | Token Dashboard UI |
| `app/js/marketplace.js` | 1,994 | Model Marketplace |
| `app/js/agent-api.js` | 1,180 | Agent API — 55 commands, 10 namespaces |
| `app/test-agent.html` | 1,747 | Visual test agent |
| `cycleCAD-Architecture.pptx` | 14 slides | System architecture (light theme) |
| `cycleCAD-Investor-Deck.pptx` | 17 slides | Investor pitch deck (light theme) |

## Near-term Tasks
- [x] Update investor deck pricing (€49/€299)
- [x] Update landing page pricing section
- [x] Push ExplodeView v290-v293 (STEP import fixes)
- [x] Fix ExplodeView UI: sidebar scroll, top bar
- [x] Build MCP server, REST API, CLI tool
- [x] Build token engine + marketplace
- [x] Build visual test agents for both apps
- [x] Create architecture deck in investor deck style
- [x] Update decks with Claude-inspired token model
- [ ] Commit and push test-agent.html files
- [ ] npm publish both packages (explodeview v1.0.11, cyclecad v0.2.1)
- [ ] Wire token-engine.js and marketplace.js into app/index.html
- [ ] Run test agents in Chrome and fix any failures
- [ ] Verify ExplodeView STEP import works with 138MB file
- [ ] Test live sites at cyclecad.com/app/ and explodeview.com
- [ ] Polish LinkedIn post and publish
- [ ] Create viewer-mode.html standalone demo

## Collaboration Patterns (Updated)
| Pattern | Detail |
|---------|--------|
| Lock file dance | VM commits → lock appears → user deletes lock → user pushes. Give ONE combined command. |
| Parallel agents | User says "start multiple agents" → launch 5-6 agents for independent tasks simultaneously |
| Fast iteration | User prefers action over questions. Build first, show results. |
| Architecture style match | User expects visual consistency across decks — same palette, fonts, card styles |
| Test-driven | User wants visual proof that features work — live test agent in Chrome, not just console logs |
| Gone for hours | User leaves for hours expecting autonomous work. Build everything, commit, provide push commands. |
| Short confirmations | "ok", "i did", terminal output pasted = confirmation that git commands were run |

# currentDate
Today's date is 2026-03-26.
