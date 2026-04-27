# CODE-REUSE.md — cycleCAD Suite

> Per-widget code-reuse analysis for Stage 2. How much of the existing
> cycleCAD / ExplodeView / Pentacad monolith maps directly to each widget,
> the 7-step extraction methodology, and the aggregate dedup math.
>
> Companion to [`IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) and
> [`TODOS.md`](../TODOS.md).

## Headline numbers

| | Lines today | Lines after Stage 2 | Δ |
|---|---|---|---|
| cycleCAD `app.js` + 10 fusion modules + extras | ~33,000 | shell + manifest, ~150 | -99 % |
| ExplodeView `app.js` | ~22,000 | shell + manifest, ~150 | -99 % |
| Pentacad sim + modules | ~5,000 | shell + manifest, ~150 | -97 % |
| **Total monolith** | **~60,000** | **~450** | **-99 %** |
| Stage 2 widgets total | 0 | **~28,000** | new |
| `shared/lib/` extracted libraries | 0 | **~3,500** | new |
| **Net repo size after migration** | **~60,000** | **~32,000** | **-47 %** |

The dedupe story: `cam-nav` exists in cycleCAD AND ExplodeView AND Pentacad
today (~500 lines × 3 = 1,500 lines duplicated). After Stage 2 it's ONE
widget at ~512 lines. Multiply that across ~30 cross-app widgets and ~50 %
of the codebase disappears.

---

## How each widget is produced — the 7-step extraction

```
1.  FIND      grep the monolith for the feature: function names,
              event handlers, DOM selectors

2.  BOUND     identify entry/exit points and global state it touches

3.  EXTRACT   copy the code into widgets/<name>.js
              (NO rewrite yet — bit-identical)

4.  WRAP      wrap it in init(opts) → {api, on, destroy} contract

5.  DECOUPLE  replace global `_scene`, `_camera`, etc.
              with opts.scene, opts.camera

6.  TEST      write demo + 5+ test spec, dashboard goes green

7.  DELETE    remove the original from monolith app.js,
              app stays shipping
```

`cam-nav` is the worked example — 512 lines lifted out of cycleCAD /
Pentacad / ExplodeView, decoupled from globals, wrapped in the contract,
7 / 7 tests passing. `dro` same pattern, 194 lines, 10 / 10 tests.

---

## Per-category reuse breakdown

| Cat | Widgets | Source monolith | Source LOC | Final widget LOC | Reuse % | Effort |
|---|---|---|---|---|---|---|
| **1 · Universal 3D** | 6 | all 3 apps (dedup) | ~2,800 | ~1,200 | 65 % | 1.5 wk |
| **2 · Visualization** | 8 | all 3 apps (dedup) | ~2,500 | ~1,400 | 75 % | 1 wk |
| **3 · I/O** | 10 | cycleCAD `dxf-export.js` 1,174 + others | ~3,500 | ~3,000 | 80 % | 1.5 wk |
| **4 · Sketch** | 7 | cycleCAD `sketch.js` 899 + `constraint-solver.js` 1,047 | ~2,500 | ~1,800 | 85 % | 1 wk |
| **5 · Solid ops** | 15 | cycleCAD `operations.js` 1,078 + `advanced-ops.js` 763 + `fusion-solid.js` 1,095 | ~3,500 | ~2,800 | 80 % | 2 wk |
| **6 · Assembly** | 6 | cycleCAD `assembly.js` 1,103 + `fusion-assembly.js` 1,200 | ~2,300 | ~1,700 | 75 % | 1 wk |
| **7 · Surface / sheet** | 5 | cycleCAD `fusion-surface.js` 949 | ~1,000 | ~1,200 | 85 % | 1 wk |
| **8 · CAM** | 14 | Pentacad `cam.js` 1,000 + `sim.js` 1,033 + `bridge.js` 530 + cycleCAD `fusion-cam.js` 1,200 | ~4,500 | ~3,200 | 70 % | 2 wk |
| **9 · Analysis** | 10 | cycleCAD `fusion-simulation.js` 1,200 + `ai-engineer.js` 1,400 | ~3,000 | ~2,500 | 80 % | 1.5 wk |
| **10 · AI** | 7 | cycleCAD `ai-chat.js` 992 + `killer-features.js` 1,508 + ExplodeView AI features | ~3,500 | ~3,500 | 90 % | 1.5 wk |
| **11 · Documentation** | 8 | ExplodeView `app.js` | ~1,800 | ~2,250 | 70 % | 1 wk |
| **12 · Admin** | 18 | mostly NEW (some from `token-engine.js` 743 + `marketplace.js` 1,994) | ~2,700 | ~5,000 | 30 % | 3 wk |
| **TOTAL** | **115** | | **~33,600 reused** | **~29,550 final** | **75 % avg** | **~17 wk** |

---

## Top 10 high-reuse extractions

These are the widgets where existing code maps almost 1 : 1 to a widget —
biggest wins.

| Widget | Source file | Source LOC | Reuse % | Final LOC |
|---|---|---|---|---|
| **dxf-export** | `cycleCAD/app/js/dxf-export.js` | 1,174 | 90 % | ~1,000 |
| **sketch-constraint-solver** | `cycleCAD/app/js/constraint-solver.js` | 1,047 | 90 % | ~900 |
| **ai-engineering-analyst** | `cycleCAD/app/js/modules/ai-engineer.js` | 1,400 | 95 % | ~1,300 |
| **step-import** (uses inventor-parser lib) | `cycleCAD/app/js/inventor-parser.js` | 1,138 | 80 % | ~900 |
| **ai-chatbot** | `cycleCAD/app/js/ai-chat.js` | 992 | 90 % | ~900 |
| **rockhopper-bridge** | `Pentacad/app/js/modules/pentacad-bridge.js` | 530 | 90 % | ~500 |
| **sim-executor** | `Pentacad/app/js/modules/pentacad-sim.js` | 1,033 | 85 % | ~900 |
| **fea + thermal + modal + buckling** (4 widgets) | `cycleCAD/fusion-simulation.js` | 1,200 | 75 % | ~1,500 across 4 |
| **mate-constraint + joint + motion-study** (3 widgets) | `cycleCAD/fusion-assembly.js` | 1,200 | 75 % | ~1,200 across 3 |
| **explode-slider** (cross-app dedup) | ExplodeView `app.js` portion | ~300 | 80 % | ~250 |

---

## Code that becomes `shared/lib/` (NOT widgets)

Some of the existing code isn't widget-shaped — it's library. Lifts
cleanly into `shared/lib/`.

| Existing | Becomes | LOC |
|---|---|---|
| `cycleCAD/app/js/inventor-parser.js` | `shared/lib/inventor-parser.js` (used by step-import widget) | 1,138 |
| Three.js + GLTFLoader bundles | `shared/lib/three-imports.js` (already in Stage 1) | ~50 |
| OCCT WASM 50MB binary | `shared/lib/occt/` (loaded lazily by occt-wasm widget) | ~300 |
| `cycleCAD/app/js/reverse-engineer.js` | `shared/lib/geometry-analysis.js` (shared by analysis widgets) | 1,275 |
| Hash-chain crypto helpers | `shared/lib/crypto.js` (used by meter + audit) | ~100 |
| Math / vector helpers | `shared/lib/math.js` | ~200 |
| **Total library code** | | **~3,500** |

That's ~3,500 lines lifted into libraries — counted separately, not in the
widget total.

---

## What's actually NEW code (no monolith source)

About 3,250 lines of genuinely new code across Stage 2:

| New | Lines |
|---|---|
| Admin widgets — 16 of 18 are net-new | ~2,500 |
| `widgets/viewport.js` — combines fragments, redesigns kernel hooks | ~400 |
| `picking` widget — new abstraction over Three.js raycast | ~150 |
| `kb-article` widget — no monolith source | ~200 |
| **Total new** | **~3,250** |

The other ~26,300 lines come from extraction.

---

## Effort per widget (averages)

| Type | Time | Why |
|---|---|---|
| **Direct extract** — e.g. dxf-export, ai-chatbot | 30 min – 2 h | Code exists clean — wrap in contract, decouple globals, write spec |
| **Cross-app dedupe** — cam-nav, section-cut, explode-slider | 2 – 4 h | Compare 2 – 3 implementations, pick winning behaviour, document diff |
| **New code** — admin widgets, picking | 4 – 8 h | Design + implement + test from scratch |
| **Heavy lift** — viewport, sim-executor, ai-copilot, occt-wasm | 1 – 2 days | Foundation work, careful API design, lots of testing |

---

## The migration math

Stage 2 produces ~29,550 lines of widget code from a starting monolith of
~60,000 lines. The savings come from three places:

1. **Cross-app dedupe** — `cam-nav`, `section-cut`, `explode-slider`,
   `screenshot`, `transparency`, `measure`, `ai-render`, `ai-chatbot` exist
   multiple times today. After dedup, each is one widget.
   **~12,000 lines saved.**
2. **Wrapping vs duplicating** — same logic, leaner shell after the
   contract wrap. **~5,000 lines saved.**
3. **Library extraction** — utility code moves to `shared/lib/` and is
   imported, not duplicated. **~3,500 lines saved.**

**Total: 60,000 → 29,550 widget + 3,500 lib + 450 shells = ~33,500 lines**
of code in the new architecture, vs **60,000** today. **About 44 % smaller.**

And every line is testable in isolation, gated through the meter, exposable
to AI agents via MCP.

---

## How this maps to the build order

For each widget in [`TODOS.md`](../TODOS.md), the per-widget cycle is:

```
1.  Read this file's per-category row to find the source monolith
2.  grep the monolith for entry points
3.  Extract → wrap → decouple
4.  Write demo + spec
5.  Push, user tests, green-light
6.  Delete the source from monolith
7.  Move to next widget
```

Cam-nav and dro are the worked examples — both already live, both extracted
from the monolith, both with ≥ 5 passing tests, both green on the dashboard.
The rest of Stage 2 follows the same pattern, ~115 times.
