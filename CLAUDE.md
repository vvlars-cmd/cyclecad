# Memory — cycleCAD

## Me
SACHIN (vvlars@googlemail.com, GitHub: vvlars-cmd). Building cycleCAD — open-source browser-based parametric 3D CAD modeler. Also maintains ExplodeView (separate repo). Company: cycleWASH (bicycle washing machines).

## Two Repos — CRITICAL DISTINCTION
| Repo | Local Path | GitHub | npm | What |
|------|-----------|--------|-----|------|
| **ExplodeView** | `~/explodeview` | `vvlars-cmd/explodeview` | `explodeview` v1.0.5 | 3D CAD **viewer** for STEP files. 19,000+ line monolith app.js |
| **cycleCAD** | `~/cyclecad` | `vvlars-cmd/cyclecad` | `cyclecad` v0.1.3 | Parametric 3D CAD **modeler**. 19 modular JS files, 18,800+ lines. This is the active project. |

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
- `cycleCAD-Investor-Deck.pptx` — 14-slide investor pitch deck: Title, Problem, Solution, Market ($25.3B TAM), Product, Competitive Landscape, Feature Comparison, Traction, Business Model (Free/Pro $19/mo/Enterprise), Technology & Moat, Roadmap, Team, The Ask ($1.5M Seed), Closing

**Strategic decisions made:**
- ExplodeView merges into cycleCAD as "Viewer Mode" (shared Three.js scene, unified toolbar)
- npm packages stay separate: `cyclecad` (platform) + `explodeview` (standalone widget)
- Open-core business model: Free (full modeling + AI), Pro $19/mo (collab + STEP + cloud), Enterprise (self-hosted + SSO)
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
- **npm**: `cyclecad` v0.1.7 published, `explodeview` v1.0.2
- **GitHub**: https://github.com/vvlars-cmd/cyclecad
- **Domain**: cyclecad.com → GitHub Pages (CNAME in repo)
- **Hero image**: `screenshot.png` — 2x retina UI mockup, renders on npm + GitHub README
- **Investor deck**: `cycleCAD-Investor-Deck.pptx` — 14 slides, dark theme, $1.5M seed ask
- **Competitive analysis**: `competitive-analysis.html` — interactive 5-tab analysis

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
- [ ] Pro tier: $19/mo (collab + STEP + cloud + priority AI)
- [ ] Enterprise tier: custom (self-hosted + SSO + SLA)
- [ ] Plugin API (FeatureScript equivalent — JS custom features)
- [ ] Plugin marketplace

### Near-term Tasks
- [ ] Test live site at cyclecad.com/app/ and cyclecad.com/app/mobile.html
- [ ] Add DUO project as downloadable demo (ZIP or separate hosting, too big for git)
- [ ] LinkedIn launch post for cycleCAD
- [ ] Clean up ExplodeView repo lock files
- [ ] Start OpenCascade.js integration research (Chili3D and bitbybit.dev as references)
- [ ] Consider: commit competitive-analysis.html and investor deck to repo?

# currentDate
Today's date is 2026-03-24.
