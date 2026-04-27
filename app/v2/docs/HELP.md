# cycleCAD Suite — Quick Reference

> Keep this open in a second tab while you work. Mirrors the in-app
> help panel (top-right `?` icon). Last revised 2026-04-27.

---

## Keyboard shortcuts

### Sketch tools

| Key | Action |
|-----|--------|
| `L` | Line |
| `R` | Rectangle |
| `C` | Circle |
| `A` | Arc |
| `P` | Polyline |
| `K` | Add constraint |
| `F` | Finish sketch |

### Solid tools

| Key | Action |
|-----|--------|
| `E` | Extrude |
| `V` | Revolve |
| `F` | Fillet (when not in sketch) |
| `H` | Chamfer |
| `S` | Shell |

### View / camera

| Key | Action |
|-----|--------|
| `F5` | Fit all |
| `I` | Iso view |
| `M` | Measure |
| `Esc` | Cancel current tool |

### Workspace tabs

| Key | Action |
|-----|--------|
| `1` | Design workspace |
| `2` | Sketch workspace |
| `3` | Assembly workspace |

(Numeric tabs cycle through the visible workspace bar — Drawing,
Simulation, Manufacture, Render, Animation, ExplodeView are reachable
by clicking. Future revs will extend the number-key shortcuts.)

### App

| Key | Action |
|-----|--------|
| `?` | Show / hide this help panel |
| `Cmd+S` | Save (todo — local persistence) |
| `Cmd+Z` | Undo (history widget — todo) |

### Mouse

| Button | Action |
|--------|--------|
| Left | Select |
| Middle | Rotate |
| Right | Pan / context menu |
| Scroll | Zoom |

---

## Top-level menus

The top-bar menus (in order):

| Menu | One-line description |
|------|----------------------|
| **File** | New / Open / Save / Import / Export / Recent. Includes *Import Inventor project…*. |
| **Library** | Use Case 1 — import projects, browse, reverse-engineer, build work packages. |
| **Edit** | Undo / Redo / Copy / Paste / Delete / Preferences. |
| **Sketch** | Line, Rect, Circle, Arc, Polyline, Constraint, Finish. |
| **Solid** | Extrude, Revolve, Sweep, Loft, Fillet, Chamfer, Shell, Boolean. |
| **Surface** | Trim, Patch, Stitch, Offset surface. |
| **Assembly** | Place component, Joints, Mate, Pattern, BOM. |
| **Manufacture** | CAM setup, Toolpath, Post, Kiri:Moto export. |
| **Drawing** | New sheet, Title block, Annotate, Dimension, Hatch. |
| **Render** | Materials, Lights, AI render, Background. |
| **Animation** | Keyframe, Timeline, Constraint anim, Export. |
| **Inspect** | Measure, Section, Interfere check, Mass props. |
| **ExplodeView** | Explode steps, Trail, BOM bubble, Animate explode. |
| **Tools** | AI Copilot, McMaster, Standards Identifier, Kiri:Moto, QR, Marketplace, Settings. |
| **Help** | Documentation, Shortcuts, Tutorials 01–06, About, Hard reset. |

---

## Library menu (Use Case 1)

Every entry in *Library* and what it does. All enter through
`loadWidget(<name>)` from the kernel.

| Menu entry | Widget | What it does |
|------------|--------|--------------|
| Import Inventor project… | `inventor-project-loader` | Pick a folder, parse `.ipj/.iam/.ipt`, push to the library. |
| Browse library | `library-browser` | Fusion-style tree, search, filter pills, right-click actions. |
| Project tree | `project-tree` | Hierarchical project + sub-assembly view with quick KPIs. |
| Attachments | `attachment-manager` | Upload / preview / link PDFs and specs to components. |
| Version history | `version-history` | Timeline of every component revision with diff. |
| Reverse engineer… | `reverse-engineer` | Synthesize a probable build sequence from imported geometry. |
| Rebuild guide | `rebuild-guide` | Step-by-step rebuild walkthrough using the synthesized plan. |
| Author tutorial… | `tutorial-author` | Edit narration, capture viewport snapshots, validate DAG, save. |
| Run tutorial | `tutorial-player` | Play a saved tutorial with viewport sync and scrubber. |
| Generate drawing | `drawing-generator` | Project base / iso / section / detail views to SVG. |
| Batch drawings… | `drawing-batch` | Generate every (component × view) sheet in one run. |
| Drawing templates | `drawing-template` | Title-block templates, sheet sizes, branding. |
| Drawing ↔ source link | `drawing-link` | Detect drift between a drawing and its source geometry. |
| Work package summary | `work-package-summary` | 6 KPI tiles + recent activity for a project. |
| Build complete work package… | `work-package-builder` | Run all 5 phases (import → bundle) end-to-end. |

The two flagship entries are *Import Inventor project…* and *Build
complete work package…*. Everything else is a piece of the same
pipeline you can run by hand.

---

## Right-click actions in `library-browser`

Right-click any row in *Browse library*. Items gate by `kind` —
e.g. *Build work package* only on a project node, *Run tutorial*
only after a tutorial exists.

| Action | What it does |
|--------|--------------|
| Open | Open the component in its native editor (sketch / solid). |
| Show in viewport | Load the GLB into the main viewport via `glb-loader`. |
| Reverse engineer… | Open `reverse-engineer` for this component. |
| Create tutorial… | Open `tutorial-author` seeded with the synthesized plan. |
| Run tutorial | Open `tutorial-player` with this component's saved tutorial. |
| Generate drawings | Open `drawing-generator` scoped to this component. |
| Build work package | Open `work-package-builder` with this project preselected. |
| Versions | Open `version-history` filtered to this component. |
| Attachments | Open `attachment-manager` filtered to this component. |
| Export bundle… | Open `export-bundle` to ship a `.zip` of this component. |
| Copy path | Copy the on-disk path to the clipboard. |
| Reveal in finder | Open the containing folder (desktop only). |

---

## Token economy at a glance

Full reference: [`docs/TOKEN-ENGINE.md`](TOKEN-ENGINE.md). The
short version:

### Rate card ($CYCLE per million tokens)

| Tier | `rate_in` | `rate_out` | Use for |
|------|-----------|------------|---------|
| Haiku | 0.25 | 1.25 | Cheap fast widgets, chrome / utility calls. |
| Sonnet | 1.0 | 5.0 | Pro / standard widgets — drawing batch, tutorial author. |
| Opus | 5.0 | 25.0 | Heavy compute — FEA, OCCT, AI Render. |

Pricing mirrors Anthropic's per-million-token ratio. Editable from
`admin-widget-registry`.

### Batch discount

| `batchSize` | Multiplier |
|-------------|------------|
| 1 | 1.00 (no discount) |
| 2 – 9 | 0.75 (25 % off) |
| 10 + | 0.50 (50 % off) |

Auto-applied server-side by `meter.charge`. The drawing-batch and
work-package-builder pipelines both push `batchSize` ≥ 10 by design.

### Free quotas

- New tenants get a `welcome` ledger row of 10,000 $CYCLE.
- All scaffold-phase widget calls are free until the widget is
  flipped to `priced: true` in `admin-widget-registry`.
- Audit / health / verify endpoints are always free.

### Charge formula

```
raw  = tokens_in × rate_in[tier] + tokens_out × rate_out[tier]
cost = raw × (cache_hit ? 0.1 : 1) × batchMultiplier
```

`cache_hit` (10 %-of-rate prompt-cache reuse) lands as part of the
LLM-narration roadmap.

---

## Common tasks

### 1. How do I import a real Inventor project?

*File → Import Inventor project…*. Pick the project folder. Confirm
the preview. Click *Import to library*. See
[`05-reverse-engineer-duo.md`](tutorials/05-reverse-engineer-duo.md)
Part 1 for screenshots and field-by-field walkthrough.

### 2. How do I generate one drawing for one part?

Right-click the part in *Library → Browse library*. Choose
*Generate drawings*. Pick A3 / A4 / A2 / A1, choose your views, click
*Render*. Save the SVG (or PDF — exports are stamped with the project
title block).

### 3. How do I build a `.zip` of every drawing for a project?

*Library → Build complete work package…*. Tick all 5 phases. Click
*Run*. Wait for the progress bar to finish. Click *Download bundle*.
The `.zip` lands in your Downloads folder.

### 4. How do I reverse-engineer a part with low confidence?

Open `reverse-engineer`. Type a domain hint in the right-hand pane
("structural T-beam, S235JR, M8 mounting"). Click *Refine*. The
widget rebills under sonnet tier and bumps confidence on any step
matched to a known build template.

### 5. How do I run the same pipeline from a script?

`POST /api/library/projects/import-from-path`, then iterate
`GET /api/library/components/:id/features` per component, then
`POST /api/library/tutorials` and `POST /api/library/drawings`. See
[`06-ai-agent-driven-build.md`](tutorials/06-ai-agent-driven-build.md)
for the full sequence with curl examples.

### 6. How do I monitor what a build run is costing?

*admin* dashboard → *$CYCLE Token → Audit*. Filter by `actor` (the
agent or user that ran the pipeline). Sum the `cost` column. Or
hit `GET /api/meter/ledger?actor=…&limit=2000` and `jq` it.

### 7. How do I refund an accidental click?

*admin → Balances → Refund tx*. Paste the `tx_id` from the audit
ledger, give a reason, click *Refund*. Refunds are column updates
and do not break the audit chain.

### 8. How do I clear all local state and start fresh?

*Help → Hard Reset (Clear Cache)*. Clears `localStorage` for the
suite (settings, draft sketches, in-flight work). It does **not**
touch the server-side library or ledger — for that, run
`make down && docker volume rm cyclecad_pgdata && make up`.

---

## When something goes wrong

- **Footer goes red.** Check which of `meter / db / chain / actor` is
  red. The first three are health checks — anything red there is the
  only thing you should be looking at.
- **Audit chain mismatched.** Don't restart anything. Snapshot the
  ledger. See [`04-admin-dashboard.md`](tutorials/04-admin-dashboard.md)
  Step 5 for the incident response drill.
- **Widget fails to load.** Hard reset (Help menu) and try again. If
  it persists, check the browser devtools network tab — the kernel
  fetches widget JS at `/widgets/<name>.js`; a 404 there means the
  registry is pointing at a missing file.
- **Build run stalls.** Open `work-package-summary`. Recent activity
  shows the last successful phase. The `import_jobs` table has the
  most recent status; the `tutorial_runs` and `drawing_views` tables
  reveal which row hung.

---

## Where to read more

- [`tutorials/01-quickstart.md`](tutorials/01-quickstart.md) — boot
  the suite, build your first part, run the test agent.
- [`tutorials/02-build-a-widget.md`](tutorials/02-build-a-widget.md)
  — ship your own widget into the registry.
- [`tutorials/03-token-economy.md`](tutorials/03-token-economy.md) —
  Claude-style billing under the hood.
- [`tutorials/04-admin-dashboard.md`](tutorials/04-admin-dashboard.md)
  — operate the suite as an admin.
- [`tutorials/05-reverse-engineer-duo.md`](tutorials/05-reverse-engineer-duo.md)
  — the headline 30-minute Use Case 1 walkthrough.
- [`tutorials/06-ai-agent-driven-build.md`](tutorials/06-ai-agent-driven-build.md)
  — drive the same pipeline from an AI agent.
- [`API-REFERENCE.md`](API-REFERENCE.md) — every REST endpoint.
- [`TOKEN-ENGINE.md`](TOKEN-ENGINE.md) — billing math, audit chain.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the kernel, meter,
  registry, and widgets fit together.
