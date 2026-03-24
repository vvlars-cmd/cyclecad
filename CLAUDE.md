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

### Session 2026-03-24 — Hero Image + Major Feature Build

**Problem evolution:**
1. Started: Previous session crashed, needed to resume
2. Task 1: Create polished hero image for npm/GitHub → Built HTML mockup of full cycleCAD UI, rendered to 2x retina PNG (2560×1440) with Playwright
3. Task 2: Commit and push → Hit stale git lock files from crash, needed Sachin to remove locally
4. Task 3: Push to npm → Found merge conflict in package.json (had `<<<<<<<` markers), fixed
5. Task 4: Import DUO Inventor project → Sachin copied full production Inventor project (482 files) into `~/cyclecad/example/`
6. Task 5: Build features using the real project data → Massive build session

**What was built (this session):**

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

**Git state at end of session:**
- Commit ready but BLOCKED by stale `.git/index.lock` — Sachin needs to run:
  ```
  cd ~/cyclecad
  rm -f .git/index.lock
  git add .gitignore MASTERPLAN.md app/index.html app/js/app.js app/js/operations.js app/js/viewport.js app/js/assembly-resolver.js app/js/project-browser.js app/js/project-loader.js app/js/rebuild-guide.js
  git commit -m "feat: Major update — project loader, assembly resolver, rebuild guides, parametric ops"
  git push origin main
  ```
- npm publish v0.1.4 after push

## Key Files
| File | Lines | What |
|------|-------|------|
| `index.html` | 14K | Landing page for cyclecad.com |
| `app/index.html` | 3,156 | Main CAD app — HTML + inline script wiring all 17 modules |
| `app/js/app.js` | 794 | App state, mode management, history, save/load |
| `app/js/viewport.js` | 751 | Three.js r170 scene, camera, lights, shadows, grid, selection highlight, OrbitControls, views |
| `app/js/sketch.js` | 899 | 2D canvas overlay, line/rect/circle/arc, grid snapping, constraints |
| `app/js/operations.js` | 1,078 | Extrude, revolve, fillet, chamfer, boolean, shell, pattern |
| `app/js/constraint-solver.js` | 1,047 | 2D constraint solver: 12 types, iterative relaxation, DOF analysis |
| `app/js/advanced-ops.js` | 763 | Sweep, loft, sheet metal (bend/flange/tab/slot/unfold), spring, thread |
| `app/js/assembly.js` | 1,103 | Assembly workspace: components, mate constraints, joints, explode/collapse |
| `app/js/dxf-export.js` | 1,174 | DXF export: 2D sketch, 3D projection, multi-view engineering drawing |
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
| `CNAME` | — | cyclecad.com domain |
| `package.json` | — | npm config, v0.1.3 |

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

## Competitive Landscape
| Competitor | What | Our Edge |
|-----------|------|----------|
| Fusion 360 | Cloud CAD, $$$, Autodesk | Free, open-source, opens Inventor natively |
| MecAgent (MIT) | AI learns CAD from demos | We ship product, not research |
| VideoCAD | 41K video dataset, AI training | Dataset only, no product. 186-action sequences |
| AurorInCAD | AI CAD startup | Closed-source, early stage |
| OnShape | Browser CAD (PTC) | Expensive, enterprise-only |
| FreeCAD | Desktop open-source | Desktop-only, no AI, no Inventor import |

## Publishing
- **npm**: `cyclecad` v0.1.3 published (v0.1.4 pending push)
- **GitHub**: https://github.com/vvlars-cmd/cyclecad
- **Domain**: cyclecad.com → GitHub Pages (CNAME in repo)
- **Hero image**: `screenshot.png` — 2x retina UI mockup, renders on npm + GitHub README

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

## Pending / Next Steps
- [ ] **IMMEDIATE**: Remove git lock, commit, push (commands above)
- [ ] **npm publish** v0.1.4 after push
- [ ] Bump package.json to 0.1.4 before publish
- [ ] Test live site at cyclecad.com/app/ with new features
- [ ] Add DUO project as downloadable demo (ZIP or separate hosting, too big for git)
- [ ] Phase 5 from MASTERPLAN: Constraint solver, sweep, loft, sheet metal tools
- [ ] Phase 6: Assembly workspace with joint placement
- [ ] Phase 7: AI sketch-to-3D, smart autocomplete, design validation
- [ ] LinkedIn launch post for cycleCAD
- [ ] Clean up ExplodeView repo lock files too
