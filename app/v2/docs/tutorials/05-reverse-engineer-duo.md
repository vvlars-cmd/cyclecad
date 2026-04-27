# Tutorial 5 — Reverse-engineer the DUO project (30 minutes)

> Take a real-world Inventor project on disk, turn it into a complete
> work package: imported library, reverse-engineered build plans,
> step-by-step tutorials, A3 drawing sheets for every part, and a
> single `.zip` you can hand to a manufacturer. The DUO bicycle-wash
> machine ships in this repo as the running example — 473 components,
> 234 custom + 79 standard + 160 vendor. By the end of this tutorial
> you will have driven it through the whole pipeline yourself.

**Estimated time:** 30 minutes (5 + 5 + 5 + 5 + 3 + 4 + 3)
**Prerequisites:**

- `make up` running with Postgres healthy (`make health` is green).
  Static-only mode (`make serve`) works for everything except the
  server-side persistence calls in Parts 6 and 7.
- A Chromium-based browser (Chrome, Edge, Arc, Brave). The importer
  uses the File System Access API which Safari does not yet ship.
- The DUO project at `~/cyclecad/cycleCAD-Suite/DUO/Workspaces/Arbeitsbereich/`.
  This is in the repo — you do not have to download anything.
- Familiarity with the basic suite layout from
  [`01-quickstart.md`](01-quickstart.md). 10 minutes.

You will end up with a `.zip` bundle on your Downloads folder containing
`manifest.json`, every drawing in SVG and PDF, every BOM line, every STL
export, and one tutorial per component. That's the deliverable.

---

## Part 1 — Import the DUO project (5 min)

Open `http://localhost:8080/apps/cyclecad/`.

1. *File → Import Inventor project…*
   The `inventor-project-loader` widget opens in a dialog. It shows
   three buttons: *Pick folder*, *Drop a folder here*, and *Use
   server-side path…* (only when `make up` is running).
2. Click *Pick folder*. The browser shows an OS folder picker.
3. Navigate to `~/cyclecad/cycleCAD-Suite/DUO/`. Click *Open*.
4. The first phase is *Walking* — the loader recursively scans for
   `.ipj`, `.iam`, `.ipt`, `.idw` files. Status text says
   `walked 1247 entries · found 473 Inventor files`.
5. The second phase is *Parsing*. Each file is opened with
   `shared/inventor/ole-cfb-reader.js` to extract metadata, JPG
   thumbnails, the sheet-metal flag, and child-file references. This
   takes 10-30 seconds for 473 components on a modern laptop.

When parsing finishes the preview panel fills in:

```
DUO Anlage
├── 473 components total
│   ├── 234 custom parts (.ipt + Custom in path)
│   ├──  79 standard parts (DIN / ISO / EN in name)
│   └── 160 vendor parts (under Zukaufteile/)
├──  87 assemblies (.iam)
├──  12 sheet-metal parts (sheet-metal flag set)
└──   3 top-level project files (.ipj)
```

Cross-check: the same numbers appear in the bottom of the dialog as
KPI tiles. If anything is zero, check the *Errors* tab — most often
it's a non-Inventor file that snuck into the picker.

6. Click *Import to library*.
   The loader posts the manifest to
   `POST /api/library/projects/import` with header `x-tenant-id`
   defaulted to `default`. The server creates rows in `projects` +
   `components` in a single transaction and lays out the on-disk
   tree:

```
library/
└── default/
    └── 17/                          ← the new project id
        ├── source/                  ← original .ipt / .iam bytes
        │   └── DUO Anlage/
        │       ├── Lenkerhalterung/
        │       ├── Gestell/
        │       └── …
        ├── derived/                 ← STL / GLB / SVG produced later
        │   └── (empty for now)
        ├── attachments/             ← PDFs / photos / specs
        └── exports/                 ← work-package .zip lands here
```

Watch the status bar at the bottom of the dialog tick through
`creating project row → inserting 473 components → done`. The toast
that pops at the end has a *Browse library* button — click it.

> **No Postgres?** The static-only mode skips the persistence step
> and stops after the preview. You still get a fully populated
> in-memory tree you can use for Parts 2-5; Parts 6 and 7 will
> tell you to run `make up` and try again.

---

## Part 2 — Browse the imported library (5 min)

The *Browse library* button took you to `widgets/library-browser.js`.
The widget renders a Fusion-style tree on the left, an icon-coded
file row for every leaf, and a debounced search box at the top.

1. Notice the breadcrumbs: `DUO Anlage › Workspaces › Arbeitsbereich`.
2. Click the disclosure triangle next to *DUO Anlage* in the tree.
3. Expand *Gestell*. You should see `Anschraubplatte3.ipt`,
   `Anschraubplatte11.ipt`, `Anschraubplatte3_1.ipt` — three custom
   plate variants, each shown as a cube icon (kind=`part`,
   category=`custom`).
4. Expand *Seitenwand → Blech*. The two rows
   `SBG_Unterteil_hinten.iam` and `SBG_Unterteil_vorne_1.iam` use the
   folded-paper icon (kind=`sheet-metal`). The flag was lifted from
   the binary stream by `shared/inventor/iam-parser.js`.
5. Expand *Lenkerhalterung*. `BG-Sattelhalterung-Klemme.iam` is a box
   icon (assembly), `Gewindestange.ipt` is a cube.

### Filter pills

At the top of the panel: *All · Custom · Standard · Vendor*. Click
*Standard*. The tree collapses everything that isn't classified as
`standard`. Notice that DIN and ISO parts inside *Lenkerhalterung*
remain visible (e.g. `DIN EN 10305-4 - E235 - 15 x 1.ipt`) but the
custom plates in *Gestell* hide.

Click *Vendor*. The tree pivots to *Zukaufteile* — Ganter, Kipp-Norelem,
igus, Blickle, WEG Motor, mink, Ventilator. Every leaf is a vendor
catalog part.

Click *All* to restore the full view.

### Live search

Type `riemen` in the search box. The tree narrows to
`Waschbürsten/Riemen1.ipt` and `Waschbürsten/starrer Riemen2.ipt`.
The match is debounced at 180 ms — try mashing keys, the redraw is
smooth.

Clear the search.

---

## Part 3 — Reverse-engineer one part (5 min)

Pick `TrägerWB2.ipt` under *Waschbürsten* — a structural carrier in
the brush sub-assembly.

1. Right-click the row. The context menu offers, top to bottom:
   *Open · Show in viewport · Reverse engineer… · Create tutorial… ·
   Run tutorial · Generate drawings · Build work package · Versions ·
   Attachments · Export bundle… · Copy path · Reveal in finder*.
2. Click *Reverse engineer…*. The `reverse-engineer` widget opens.

The widget shows three columns:

```
┌─────────────┬──────────────────────────┬────────────────┐
│ Component   │ Synthesized step plan    │ Hints / refine │
│ properties  │ (sketch → extrude → …)   │                │
└─────────────┴──────────────────────────┴────────────────┘
```

3. The middle column is the synthesized build plan. For
   `TrägerWB2.ipt` it lands roughly:

```
1.  Sketch1 on XY     —  rectangle 240 × 60 mm           confidence 0.78
2.  Extrude1          —  symmetric, 6 mm                 confidence 0.71
3.  Sketch2 on +Z face — slot pattern 4×                 confidence 0.62
4.  Extrude-cut       —  through-all                     confidence 0.59
5.  Fillet1           —  R3 on outer top edges          confidence 0.55
6.  Pattern1          —  2 instances along X            confidence 0.52
```

The numbers come from bbox dimensions, sheet-metal flag, and
property heuristics — see the *Limitations* note in
`HANDOFF-2026-04-27-evening.md` for what's not real Inventor data
yet. Confidence is **honest** — anything under 0.5 is highlighted
amber so you know to eyeball it.

4. The right column has a *Hints* text area. Type:

```
This is a structural T-beam carrier for the brush motor mount.
Material is S235JR. The 4 holes pattern is for M8 mounting bolts.
```

5. Click *Refine*. The widget bills `meter.charge({ tier: 'sonnet' })`
   (a future LLM-narrator hook) and the step list updates: confidence
   on steps 3–6 climbs from ~0.6 to ~0.85, hole spacings populate
   with the M8 standard (`Ø8.5 thru, 4× pattern, 60 mm pitch`), and
   step 5's fillet radius narrows.

6. Click *Save plan*. The plan persists to the component's `imeta`
   blob via `PATCH /api/library/components/:id`.

---

## Part 4 — Author a tutorial (5 min)

From the *reverse-engineer* widget, click *Export to tutorial*. The
`tutorial-author` widget opens with the step plan pre-loaded.

1. The author panel shows a horizontal step strip at the top, a
   narration card on the left, and an editable viewport on the right.
2. Each step has three editable fields: *title*, *narration*,
   *snapshot*.

   Step 1's narration is templated: *"Start with a rectangle on the
   XY plane, 240 × 60 mm. This is the footprint of the carrier."*

3. Click *Step 3* in the strip. The narration says *"Sketch 4 slots
   on the top face, evenly spaced."* Edit it to:

   *"Sketch 4 mounting slots on the top face. Centers are 30, 90,
   150, 210 mm from the left edge. Slot length matches the M8
   washer OD plus 2 mm tolerance for misalignment during install."*

4. With Step 3 selected, position the viewport (orbit + zoom) so the
   top face is clearly visible. Click *Capture viewport snapshot*.
   A 320 × 240 PNG is grabbed via `host.renderer.domElement.toDataURL`
   and stored on the step.

5. Click *Validate*. The author runs `shared/tutorial-schema.js`
   validation — the DAG has no orphan steps, every `dependsOn` resolves,
   media references are reachable. Status: `valid · 6 steps · 1
   snapshot`.

6. Click *Save*. The tutorial posts to
   `POST /api/library/tutorials` and links to the component. The
   *Run tutorial* action on the right-click menu now lights up.

---

## Part 5 — Run the tutorial (3 min)

Right-click `TrägerWB2.ipt` again. Click *Run tutorial*. The
`tutorial-player` widget mounts.

1. The player has a top-bar progress strip (one segment per step), a
   center narration card, and a viewport that auto-syncs to the
   captured snapshots.
2. Click *Play*. The player advances every 12 seconds (configurable
   in the *Settings* gear). The narration fades cross-fade between
   steps. The viewport tween-eases between captured camera positions.
3. At Step 3 the narration text matches what you edited in Part 4.
4. At any time, drag the scrubber on the progress strip to jump to
   any step. Click the replay icon next to the narration to replay
   only the current step. Click *Pause* to freeze.
5. The player records a row in `tutorial_runs` (start, finish, last
   step reached) so the admin dashboard can show completion stats.

Close the dialog when you're done.

---

## Part 6 — Auto-generate every drawing (4 min)

> Postgres required. If `make up` isn't running this step still
> renders the SVG previews but cannot persist them.

1. *Library → Batch drawings*. The `drawing-batch` widget opens.
2. Configure scope:

```
Scope:    [✓] Parts   [✓] Sub-assemblies   [✓] Top assemblies
Sheet:    A3
Views:    [✓] Front  [✓] Top  [✓] Right  [✓] Iso
Sections: [ ] off
Details:  auto when a face is closer than 1/8 of the sheet
Title block: cycleCAD default
```

3. The *Estimate* tile updates live:

```
473 components × 4 views   = 1892 sheets
Cost (sonnet tier)          ≈ 9,460 $CYCLE
Batch discount (≥ 10)       50%
─────────────────────────
Estimated charge             4,730 $CYCLE
```

The 50% kicks in via the rule in `docs/TOKEN-ENGINE.md`
(`batchSize >= 10 → ×0.5`).

4. Click *Start*. The widget streams progress: a live results table
   fills in row by row, one per (component × view). Each row shows
   the part name, view, sheet number, render time, and a thumbnail.
5. Drift detection: after each render, the widget calls
   `widgets/drawing-link.js` to compare the SVG-derived bounding
   box with the cached one from a previous run. New rows are tagged
   `new`, modified rows `changed`, untouched rows `clean`. On a fresh
   import every row is `new`.
6. When the run completes, the *Open project drawings* button takes
   you to a gallery of all 1892 sheets, grouped by component and
   filterable by view.

Pause / resume works. The widget persists progress every 25 sheets
so a refresh recovers state.

---

## Part 7 — Build the complete work package (3 min)

This is the headline action — run the whole pipeline end-to-end with
one click.

1. *Library → Build complete work package…*. The
   `work-package-builder` widget opens.
2. Options form:

```
Tenant:           default
Project name:     DUO Anlage
Sheet size:       A3
Narration tier:   sonnet      ↓ (haiku · sonnet · opus)
Include exports:  [✓] STL  [✓] GLB  [✓] BOM CSV  [✓] PDF drawings
Bundle name:      duo-workpackage-2026-04-27.zip
```

3. Click *Run*. The 5-phase progress bar shows:

```
[1/5] Import           ████████████ done · 473 components
[2/5] Reverse-engineer ████████░░░░ 312/473 plans · ~1.8 min remaining
[3/5] Tutorials        ░░░░░░░░░░░░ queued
[4/5] Drawings         ░░░░░░░░░░░░ queued
[5/5] Bundle           ░░░░░░░░░░░░ queued
```

Phase 2 reverse-engineers every component (using the same logic you
ran by hand in Part 3). Phase 3 auto-authors a tutorial per
component. Phase 4 drives `drawing-batch` headless. Phase 5 calls
`widgets/export-bundle.js` to assemble the ZIP.

4. The summary tile lights up:

```
Bundle ready
─────────
Components       473
Tutorials        473
Drawings        1892
Attachments       12
Total charge   4,830 $CYCLE  (4,730 batch + 100 narration)
Wall time      14 min 22 s
```

5. Click *Download bundle*. The browser saves
   `duo-workpackage-2026-04-27.zip` to your Downloads folder.

---

## What's in the .zip

```
duo-workpackage-2026-04-27.zip
├── manifest.json                 ← project + component + drawing index
├── README.md                     ← human-readable summary
├── source/                       ← original Inventor bytes (verbatim)
│   ├── DUO Anlage/
│   ├── Zukaufteile/
│   └── Übernommen/
├── derived/
│   ├── stl/                      ← one per part (when geometry resolves)
│   ├── glb/                      ← one per part — viewer-ready
│   └── svg/                      ← drawing views, raw
├── drawings/
│   ├── pdf/                      ← A3 PDF, one per (component × view)
│   └── sheets.csv                ← drawing index
├── tutorials/
│   ├── <componentId>.json        ← step plan + narration + snapshot refs
│   └── snapshots/                ← captured PNGs
├── bom/
│   ├── full.csv                  ← every component, every assembly
│   └── flat.csv                  ← unrolled to leaf parts only
└── attachments/                  ← any PDFs / specs that came with import
```

`manifest.json` is the single source of truth — it cross-references
every other file, lists token spend per phase, and includes a
SHA-256 over the bundle contents for tamper detection.

---

## Where to next

- [`04-admin-dashboard.md`](04-admin-dashboard.md) — monitor the
  charges and audit the chain produced by your build run.
- [`docs/API-REFERENCE.md`](../API-REFERENCE.md) — drive the same
  pipeline over REST without opening the GUI.
- [`06-ai-agent-driven-build.md`](06-ai-agent-driven-build.md) —
  let an AI agent drive the whole thing end-to-end. Same outcome,
  no human at the keyboard.
- [`scripts/build-duo.sh`](../../scripts/build-duo.sh) — a shell
  script that walks the same path via curl. Bonus: `LIBRARY_INGEST_ROOT`
  override so you can point it at any Inventor project.
- [`scripts/AGENT-RUNBOOK.md`](../../scripts/AGENT-RUNBOOK.md) — the
  step-by-step AI-agent runbook with example prompts.

---

## Troubleshooting

- **Import phase fails immediately.** No Postgres. Run
  `make up && make health` and try again. The static fallback skips
  persistence but Parts 6 and 7 need the DB.
- **"Pick folder" button does nothing.** You're on Safari or
  Firefox. Switch to Chrome / Edge / Arc / Brave — the File System
  Access API is Chromium-only today. Or use the server-side path:
  *Use server-side path…* with `/Users/sachin/cyclecad/cycleCAD-Suite/DUO`.
- **Sheet-metal parts come up as plain `part`.** The flag was missed
  in the binary parse — happens occasionally on older Inventor
  versions. Right-click the row → *Properties → Override kind →
  sheet-metal*.
- **Reverse-engineer confidence is mostly amber.** Add a domain
  hint and click *Refine*. The widget bumps confidence when the
  hint matches a build template in `shared/build-step-templates.js`.
- **Drawing batch shows `view extraction failed`** for a few rows.
  Geometry didn't resolve to a tessellation that
  `THREE.EdgesGeometry` could project. Open the part, run
  *File → Import* on its `.ipt`, and re-run just that row from the
  drawing-batch results panel.
- **Bundle download starts but the zip is empty / 0 bytes.** Browser
  popup-blocker or out-of-disk. Check the toast — the builder
  writes the bundle path on disk before triggering the download.
  Copy that path and `cp` it manually if needed.
- **Tutorial player won't open from right-click.** No tutorial saved
  yet. Run Part 4 first, or click *Library → Author tutorial…*
  from the menu.
- **`Bundle is ready` but the link 404s.** The
  `library/<tenant>/<id>/exports/` directory is not statically
  served by the meter. With `make up` it's mounted at
  `/files/library/...`; with `make serve` you need to copy the
  bundle path from the toast and `open` it from the shell.
