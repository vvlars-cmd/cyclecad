# cycleCAD User Guide

> The cycleCAD app at `/apps/cyclecad/` is the parametric modeller. This
> guide walks through the whole interface and the most common workflows.

## 1. Opening the app

```
http://localhost:8765/apps/cyclecad/        # static
http://localhost:8080/apps/cyclecad/        # full Docker stack
```

A welcome splash offers six entry points:

- **New Sketch** — start drawing a 2D profile
- **AI Copilot** — describe what you want in English
- **Photo to CAD** — upload a sketch / photo
- **Open / Import** — STEP / STL / GLB
- **AI Engineer** — bolted-joint analyser
- **ExplodeView** — jump to the viewer

Click any one to dismiss the splash and trigger the corresponding action.
The other apps in the suite are linked from the bar at the very top.

## 2. Anatomy of the screen

```
┌── Suite bar ────────────────────────────────────────── cycleCAD · ExplodeView · Pentacad · admin · tests ─┐
├── Menu bar      File · Edit · Sketch · Solid · Surface · Assembly · Manufacture · Drawing · Render ·    │
│                  Animation · Inspect · ExplodeView · Tools · Help                                          │
├── Workspace bar Design · Sketch · Assembly · Drawing · Simulation · Manufacture · Render · Animation ·   │
│                  ExplodeView    [tool icons for the active workspace]    [view fit / iso / wireframe …]  │
├── Left panel  ┌── viewport ───────────────────────────────┐  Right panel                                 │
│  Model tree   │                                            │  Properties / Parameters / Material         │
│  Assembly     │     3D scene (Three.js)                    │                                              │
│  Search       │     ViewCube top-right                     │                                              │
│               └────────────────────────────────────────────┘                                              │
├── Timeline   Feature history                                                                              │
└── Status     Units · Grid · Snap · Selection · FPS · Widgets · $CYCLE pill · Build version              ─┘
```

## 3. The five workspaces (in order of typical usage)

1. **Design** — the default. Sketch + Solid tools combined.
2. **Sketch** — pure 2D entry; constraints; finish to return to 3D.
3. **Assembly** — components, mates, joints, motion studies.
4. **Drawing** — base view, section view, dimensions, PDF export.
5. **Simulation** — FEA, thermal, modal, buckling.
6. **Manufacture** — CAM toolpaths, simulator, Rockhopper bridge.
7. **Render** — hero shots, screenshots, AI render.
8. **Animation** — explode + motion playback.
9. **ExplodeView** — embedded viewer mode.

Click a workspace tab to swap the visible toolbar group. The keyboard
shortcuts work in any workspace.

## 4. Keyboard shortcuts

```
L · R · C · A · P     line · rect · circle · arc · polyline
E · V · F · H · S      extrude · revolve · fillet · chamfer · shell
M                      measure
F5                     fit all
I                      isometric view
?                      help
Cmd / Ctrl + Z         undo
Cmd / Ctrl + Y         redo
Esc                    cancel current op / close dialog
```

Mouse: **left** select · **middle** rotate · **right** pan · **scroll** zoom.

## 5. Common workflows

### 5.1 Build your first part

1. **Sketch** → click *New Sketch* on the splash, or hit `L`.
2. Draw a rectangle (`R`) by clicking two corners.
3. Hit `Esc` to drop the rect tool, then *Sketch → Finish Sketch (F)*.
4. *Solid → Extrude (E)* — distance 20mm, click OK.
5. Done. The model tree shows `Sketch1` → `Extrude1`.

### 5.2 Use AI Copilot

1. *Tools → ✨ AI Copilot* (or `Cmd+K`).
2. Type *"M8 hex nut"* — the copilot builds it.
3. Type *"add a 3mm chamfer on the top edge"* — it edits the result.

The copilot widget needs a Claude / Gemini / Groq key in
`localStorage` (the dialog walks you through setting it up).

### 5.3 Import an Inventor project

1. *File → Import (STEP/STL/GLB)*.
2. Pick the project root or any `.ipt` / `.iam`.
3. The import widget parses the OLE2/CFB binary, builds a feature tree,
   and surfaces a BOM in the right panel.

For very large STEP files (>80 MB), the server-side converter runs
automatically (full Docker stack only).

### 5.4 Run a manufacturability check

1. Select a feature in the model tree.
2. *Inspect → DFM Check*.
3. Read the report — wall-thickness warnings, draft-angle issues,
   undercuts. Each warning links to the offending face.

### 5.5 Pose a bolted joint analysis

1. *Tools → 🔩 AI Engineering Analyst*.
2. Pick the *bolted-joint* tab, pre-fill with the *MecAgent demo* preset,
   click *Run*.
3. Read the verdict — slip-resistance / max tensile / combined stress.
4. Tweak `boltCount` or `friction`, watch the report recompute live.

## 6. The right-panel tabs

| Tab | What |
|---|---|
| **Properties** | Selected feature's name, type, visibility, transform |
| **Parameters** | User-named expressions (`Width = 100mm`, `Height = Width / 2`) |
| **Material** | Steel · Aluminum · Titanium · Brass · ABS · Nylon — drives mass / FEA |

## 7. The status bar

| Cell | Source |
|---|---|
| Units | always `mm` (Stage 2) — Pentacad widgets convert to inches as needed |
| Grid / Snap | toggled by the cam-nav widget |
| Selection | last-clicked object name |
| FPS | viewport widget render-loop hook |
| Widgets | how many widgets are currently mounted |
| **$CYCLE pill** | live balance — gold ≥ 1k, amber ≥ 100, red < 100, ∞ for admin |
| Build | `Stage 2 · 115 widgets live · token engine wired` |

Click the $CYCLE pill to open the recharge dialog (admin only — others
get the queue-a-request form).

## 8. ExplodeView mode (inside cycleCAD)

The bottom-left **Viewer Mode** button opens a floating ExplodeView
control panel — explode slider, section-cut buttons, BOM export, screenshot.
Useful for sales demos without leaving cycleCAD.

For the full ExplodeView UI, click `ExplodeView` in the suite bar.

## 9. Hard reset

If the app gets stuck (cached service worker, broken localStorage, weird
Safari state):

*Help → Hard Reset (Clear Cache)* — clears caches, service workers,
localStorage, sessionStorage, and reloads with a fresh query string.

## 10. Where data lives

| Data | Location |
|---|---|
| Recent files | localStorage `cyclecad.recent` |
| User parameters | localStorage `cyclecad.params.<projectId>` |
| Admin key | localStorage `cyclecad.adminKey` |
| Actor name | localStorage `cyclecad.actor` |
| Tenant ID | localStorage `cyclecad.tenantId` or `?t=` URL param |
| AI keys | localStorage `cyclecad.ai.<provider>Key` |
| $CYCLE balance | server-side (Postgres `credits` + `ledger` tables) |

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| Black viewport | Check console for kernel widget errors. Try `Cmd+Shift+R` to hard-reload. |
| `$CYCLE` pill says "—" | Meter is unreachable. Run `make health` or `docker compose ps`. |
| AI Copilot won't respond | Set your provider's key in the dialog. Free Gemini key at console.cloud.google.com. |
| ViewCube doesn't sync | The cam-nav widget watches the camera every frame; if it's frozen, the renderer crashed — hard reset. |
| Menu doesn't pin open | Click the menu-item label, not its dropdown items. |
| Import hangs on 100MB STEP | Switch to the full Docker stack so the server-side converter runs. |

## 12. Export targets

```
File → Export
   ↓
STL · OBJ · glTF / GLB · DXF · PDF · BOM CSV · STEP (Phase 3)
```

PDF export uses the `pdf-export` widget; DXF uses `dxf-export`. Both honour
the current active drawing view.

## 13. Working with the test runner

Hit `tests/` in the suite bar to open the dashboard. Click *Run all
tests* — the tutorial agent walks every widget, posts results, then the
dashboard goes green. Useful before filing a PR.

## 14. Workflows (preview — Phase 5)

A workflow is a JSON file that snaps widgets together. Once Phase 5 lands:

```
hero-shot.json:
  step 1 → glb-loader      load model.glb
  step 2 → fit-to-selection
  step 3 → blueprint
  step 4 → screenshot      out.png
```

The CLI / MCP runner runs them sequentially; tokens are charged per-step.

## 15. Library — reverse-engineer an Inventor project

Stage 2.6 added a complete library layer for importing Autodesk Inventor
projects (`.ipj` + `.iam` + `.ipt`), reverse-engineering each component
into a build plan, authoring tutorials, generating drawings, and
packaging the whole thing as a downloadable zip.

### Step 1 — Open the importer

Either:

- *File > Import Inventor project...*
- *Library > Import Inventor project...*
- the splash screen shortcut on a fresh boot

Both open the **inventor-project-loader** widget in a modal.

### Step 2 — Pick the project folder

Click the drop zone (or drag a folder onto it). On Chrome the
File-System-Access picker opens; on Safari the fallback `<input
type=file webkitdirectory>` is used. Point at the project root that
contains exactly one `.ipj` and any number of `.iam` / `.ipt` files —
the importer auto-detects which is which.

The widget walks the tree, parses every Inventor file with the pure-JS
parsers in `shared/inventor/`, and shows a live counter while it works.
Errors per file go into a collapsible log; one bad file never aborts the
import. When parsing finishes the panel switches to the **preview**
state with stats (parts / sub-assemblies / vendor / standard / unknown),
the inferred project name, and a tree preview.

Click **Import** to ship the manifest + per-file bytes to the server.
Without the full Docker stack the meter is unreachable and the import
falls back to localStorage so you can still browse the parsed tree.

### Step 3 — Browse what was imported

Open *Library > Browse library*. The **library-browser** renders the
project tree Fusion-style, with disclosure triangles and kind-coded
icons (assembly / part / sheet-metal / sketch / drawing). The header has:

- a filter pill row (All / Custom / Standard / Vendor)
- a debounced search box
- a refresh button

### Step 4 — Right-click a part

Right-click on any node to open the context menu. The available actions
depend on the node kind:

| Action | What it opens | Works on |
|---|---|---|
| Reverse engineer... | `reverse-engineer` widget — synthesizes a probable feature tree (sketch -> extrude -> fillet -> ...) with confidence scores | parts, sub-assemblies, sheet-metal |
| Create tutorial... | `tutorial-author` widget — drafts a tutorial from the reverse-engineer plan, lets you reorder / edit steps and capture viewport snapshots | parts, assemblies |
| Run tutorial | `tutorial-player` widget — replays a saved tutorial with viewport sync, narration card, scrubber timeline | any node with a tutorial |
| Generate drawings | `drawing-generator` widget — produces base / iso / section / detail SVG views via real 3D edge extraction | parts, assemblies |
| Build work package | `work-package-builder` orchestrator — runs the full 5-phase pipeline | the project root |
| Export bundle... | `export-bundle` widget — STORE-only ZIP with manifest + drawings + BOM + parts | project root |

Plus the always-on actions: **Open**, **Show in viewport**, **Versions**
(opens `version-history`), **Attachments...** (opens
`attachment-manager`), **Copy path**, **Reveal in finder**.

### Step 5 — Build the complete work package

The fastest path through the whole flow is the **work-package-builder**
orchestrator. Open it from *Library > Build complete work package...*.
The widget walks all five phases:

```
1. import           (calls inventor-project-loader)
2. reverse-engineer (iterates every component)
3. tutorials        (auto-authors a tutorial per component)
4. drawings         (drawing-batch over component x sheet x view)
5. bundle           (export-bundle assembles a STORE-only ZIP)
```

Phase progress is reported live; failures of single components don't
abort the run. When all phases finish the summary tile shows the KPIs
(parts parsed, drawings generated, tutorials authored, bundle size) and
a download link.

### Step 6 — Open the bundle

The downloaded `work-package.zip` is a STORE-only PKWARE archive (no
compression — opens with any unzipper) containing:

```
manifest.json          summary of the project + all linked artifacts
parts/<id>/*.glb       each component as a web-3D model
drawings/<id>/*.svg    every generated drawing
drawings/<id>/*.pdf    PDF export of every drawing
tutorials/<id>.json    every tutorial DSL document
bom.csv                bill of materials
```

Hand the zip over to a colleague or an AI agent — every artifact is
self-contained.

### Reference

Walkthrough: [`docs/tutorials/05-reverse-engineer-duo.md`](tutorials/05-reverse-engineer-duo.md).

## 16. Where to learn more

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — full system architecture
- [`docs/TOKEN-ENGINE.md`](TOKEN-ENGINE.md) — billing model
- [`docs/ADMIN-GUIDE.md`](ADMIN-GUIDE.md) — admin dashboard reference
- [`docs/DEVELOPER-GUIDE.md`](DEVELOPER-GUIDE.md) — building a widget
- [`tests/tutorial.html`](../tests/tutorial.html) — interactive tour with
  an autonomous agent that walks every widget
