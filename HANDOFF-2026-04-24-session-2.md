# Handoff — 2026-04-24, session 2 → next chat

Drop this file into the next chat (or tell Claude to read it). Continues the earlier handoff from the same day; read both.

## Who I am
- **SACHIN** (vvlars@googlemail.com, GitHub vvlars-cmd)
- Building the **cycleCAD Suite** — now three products: cycleCAD + ExplodeView + Pentacad
- Working style: fast iteration, minimal clarifying questions, clipboard-paste commands via terminal, Safari private window for testing
- Full persistent memory: `~/cyclecad/CLAUDE.md` and `~/explodeview/CLAUDE.md`

---

## THE BIG STRATEGIC UPDATES THIS SESSION

### 1. Suite positioning crystallised
**cycleCAD Suite** is the umbrella brand at cyclecad.com. Three products under it:

| Product | What | License | Status |
|---|---|---|---|
| **cycleCAD** | Parametric 3D CAD modeller (the core) | MIT | Live |
| **ExplodeView** | 3D viewer, AI render, AR, analysis | MIT | Live |
| **Pentacad** | CAM + 5-axis simulator + Kinetic Control bridge | AGPL-3 / commercial dual | Phase 0 scaffolded |

**Key decision**: Pentacad is built as a **cycleCAD module**, NOT a separate repo. Lives at `~/cyclecad/app/js/modules/pentacad*.js`. Follows the existing `window.CycleCAD.ModuleName` IIFE pattern used by every other cycleCAD module.

### 2. Pentamachine / Matt status — CRITICAL
**Matt agreed to send files without NDA**, but his reply included a red flag:

> "We do provide feedback for 4+ companies that are working on similar CAM concepts to yours."

**What this means:**
- Matt is a **neutral ecosystem supplier**, not a partner candidate
- He legally has no confidentiality obligation toward us
- Ideas we share with him will influence his feedback to other teams (whether he means to or not)

**Revised strategy:**
- **Do not lead with JV** — the equity/partnership proposal is dead until Pentacad is a proven product
- **Pilot-first**: build cycleCAD Suite Pentacad extension in silence, ship polished demos (not source, not architecture docs), public launch before Matt asks for exclusivity
- Commercial conversation sequence: Phase 0-1 = silent, Phase 2 = open license discussion, Phase 3 = exclusive EU resale if warranted, JV only if Matt proactively offers equity

**Full tactical playbook**: `~/Documents/Penta/pentacad-notes/pilot-intelligence-brief.md` (private, DO NOT share with Matt)

---

## What shipped this session

### Pentacad extension inside cycleCAD (`~/cyclecad/`)
New files, follow the existing cycleCAD IIFE module pattern (`window.CycleCAD.Pentacad*`):

| File | Purpose |
|---|---|
| `app/js/modules/pentacad.js` | Coordinator module — registers sub-modules, machine picker UI, public API |
| `app/js/modules/pentacad-cam.js` | 12 CAM strategies (stubs), post-processor skeleton for Pentamachine .ngc dialect |
| `app/js/modules/pentacad-sim.js` | G-code parser skeleton, forward-kinematics stub for 5-axis A/B tables |
| `app/js/modules/pentacad-bridge.js` | WebSocket client for controller bridge — jog/stream/DRO/pause/abort scaffolding |
| `app/pentacad.html` | Dedicated UI entry point — split-screen viewport + machine picker + workspace tabs |
| `machines/v2-50-chb/kinematics.json` | Template values marked `_confirmed: false` until Matt sends real data |

Load via `<script src="./js/modules/pentacad-cam.js"></script>` etc. in `app/pentacad.html`. Coordinator auto-initialises on DOMContentLoaded unless `window.CycleCAD.SkipPentacadInit` is set.

### cyclecad.com suite landing mockup (`~/cyclecad/mockups/`)
- `cyclecad-suite-mockup.html` — full animated wireframe for the new suite landing page
- `index-agent-first.html.bak` — backup of the previous index.html (agent-first OS-of-manufacturing framing)

**Page structure** (top to bottom):
1. **Hero** — "From idea to finished part. One browser tab." Staggered fade-up, animated kicker dot, drifting orbs, spinning logo
2. **Lifecycle strip** — 5 stages (Ideate / Design / Present / CAM / Produce). Rainbow gradient line draws across all 5 chips when it scrolls into view
3. **End-to-End Journeys section** — 3 animated product examples:
   - 🔔 Custom bike bell (consumer, 6 days, €345, 23 pre-orders)
   - ⚙️ Precision flange (B2B, 3 days, €2,400, 50-unit PO)
   - 🍺 Branded bottle-opener ring (promo, 2 days, €1,900, 100 units)
   - Each cycles through 6 lifecycle steps (idea → design → market → sell → manufacture → feedback) on a 15s loop with 2.5s per step, rows offset by one step, hover to pause, click step to jump
4. **5 stage deep-dive sections** — each with SVG animations (typing terminal, line-draw CAD, exploded parts, toolpath tracing, data flow arrows)
5. **Products grid** — 3 cards (cycleCAD gold / ExplodeView teal / Pentacad emerald)
6. **Stats, CTA, founder note, footer**

Production version **not yet written** — the mockup is the design spec. When approved, port into real `/index.html`.

### Pentamachine deliverables (`~/Documents/Penta/pentacad-deliverables/`)
- `ARCHITECTURE.md` — full Pentacad system architecture (repo doc, shareable)
- `Pentacad-Complete.pptx` — 25-slide deck (16 architecture + 8 private intelligence brief + dividers)
- `Pentacad-Complete.pdf` — same content, non-editable
- `pilot-intelligence-brief.md` — full tactical playbook for managing Matt

**Separate** private notes at `~/Documents/Penta/pentacad-notes/pilot-intelligence-brief.md`.

### Standalone pentacad repo (SUPERSEDED but preserved)
- Located at `~/Documents/Penta/pentacad/`
- Full monorepo scaffold I built before the user pivoted to the "cycleCAD module" approach
- Keep as reference — useful pieces (LICENSE, .gitignore, README, CLAUDE.md, web-app main.js, CAM module index, strategies registry) can be copied if ever needed
- Do not commit as a separate repo

### Emails drafted (for Matt, Penta Machine Company)
1. **Short JV proposal** — not used; user went pilot-first instead
2. **Long-form detailed proposal** — kept in reserve
3. **Follow-up acknowledging 4+ competitors** — softer tone, pilot framing
4. **Phase 0-3 file request** — the canonical list of what Matt needs to send

---

## What Matt already sent vs still missing

**In `~/Documents/Penta/` right now:**
- Marketing kit (logos, spec PDFs, product videos, photos)
- Installation guides (.docx) for V2-10 and V2-50
- **One real technical artifact**: `Sample Part for Demonstration/Ring Aluminum V2-50/`
  - Fusion 360 archive (`.f3z`) with CAM setup
  - 3 × `.ngc` files — 5-axis G-code confirming A/B kinematics, G20 imperial, G93 inverse-time feed, 40000 RPM spindle

**Still blocking Phase 0 (the foundation work):**
1. Native 3D models of V2-10, V2-50CHB, V2-50CHK (STEP or Fusion/Inventor) — need for digital twin
2. Machine kinematics JSON (A/B offsets, travel, home, tool-length zero, soft limits)

**Needed for later phases:**
3. LinuxCNC version / Kinetic Control fork reference + HAL / INI files
4. Fusion 360 post-processor (`.cps`) — to match the dialect exactly
5. Tool library (ER11/ER40 holders, tool numbers, max RPM)
6. Feeds & speeds defaults per material
7. Kinetic Control IPC/WebSocket API surface
8. Simulator source (if separate from control)

**Status**: Matt agreed to send items 1-8, awaiting delivery. Safe to continue cycleCAD and ExplodeView work in parallel.

---

## Pending task inbox (15 items, from tracker #10-24)

### Priority strategic work
- **#10** · AI Engineering Analyst v1 — bolted-joint analysis. Biggest competitive gap vs MecAgent. Target: `app/js/modules/ai-engineer.js` (~800-1200 lines). Analytical-core-first (pure JS math, unit-tested against MecAgent screenshot numbers: F_friction=24960N, F_max_tensile=6687.5N, σ_vm=558MPa), then KaTeX rendering, then LLM tool-use layer, then RAG.
- **#11** · AI Engineering Analyst v2 — gears (AGMA), shafts (Goodman/Soderberg), bearings (L10), welds (throat stress)
- **#12** · AI Engineering Analyst — RAG + citations (@xenova/transformers MiniLM-L6-v2, IndexedDB, MecAgent-style "Open Document" footnotes)

### cycleCAD quick wins
- **#13** · Ship 3.10.5 — more AI Copilot templates (mounting brackets, T-slot extrusions 40/40 + 80/40, ball/roller bearings, bearing cutouts). Same pattern as gear/pulley/shaft block in 3.10.4.
- **#14** · Polyline → geometry support in mini-executor. Unblocks true involute gear teeth.

### cycleCAD
- **#15** · Dynamic version badge in status bar (currently hardcoded v0.9.0)
- **#16** · Wire splash screen buttons (New Sketch / Open-Import / Text-to-CAD / Inventor Project)
- **#17** · Run `app/test-agent.html` (113 tests, 15 categories), fix failures
- **#18** · Text-to-CAD with live preview
- **#19** · Photo-to-CAD reverse engineering
- **#20** · Server-side 138MB STEP import (FastAPI converter path, safer than opencascade.js v293)
- **#21** · Docker compose local test

### ExplodeView
- **#22** · Compositing render for guaranteed CAD preservation. Post-v304 follow-up. Render 3D with transparent background, send only cropped background region to Nano Banana, composite 3D foreground over generated background in canvas. Bypasses "generative ≠ inpainting" limitation entirely.
- **#23** · Run `docs/demo/killer-features-test.html`, fix failures
- **#24** · Repro `block-only-in-chrome` ExplodeView bug (user report, unclear trigger)

### Suite website
- Port the `mockups/cyclecad-suite-mockup.html` design into production `/index.html` once motion is approved
- Build dedicated `/pentacad.html` product marketing page in the same style

---

## Recommended next sprint

**Cheap high-impact**: #13 + #14. Ships 3.10.5, unlocks real gear teeth.
**Strategic**: #10 — AI Engineering Analyst v1. Biggest competitive moat, direct MecAgent parity.
**While waiting on Matt**: #22 (compositing render for ExplodeView) and #17 (run cycleCAD test agent).

Do #13 + #14 as warm-up, then go big on #10.

---

## Critical operational context (unchanged from earlier handoff)

- **Git lock dance**: VM commits leave stale `.git/*.lock` files. Always give ONE combined command:
  ```bash
  rm -f ~/REPO/.git/index.lock ~/REPO/.git/HEAD.lock && cd ~/REPO && git add ... && git commit -m "..." && git push origin main
  ```
- **Clipboard delivery**: Commands via `mcp__computer-use__write_clipboard` → user pastes in Terminal. Must switch OFF Terminal (make Chrome or another app frontmost) before writing — Terminal is tier-"click" and blocks clipboard writes when frontmost.
- **Egress allowlist**: `explodeview.com` and `cyclecad.com` are NOT on the allowlist. Use `npm registry` (allowed) for version verification. For live-site checks, ask user to add domain or use Claude-in-Chrome MCP.
- **Deferred tools**: Schemas load on demand. Load computer-use in bulk `{query: "computer-use", max_results: 30}`, chrome `{query: "chrome", max_results: 20}`.
- **GitHub Pages concurrent-deploy fix**: shipped 2026-04-24 in `.github/workflows/pages.yml` with `concurrency: group: pages, cancel-in-progress: true`.

---

## Current npm versions

- `cyclecad`: **3.10.4** (next: 3.10.5 with AI Copilot templates, OR 3.11.0 with AI Engineering Analyst)
- `explodeview`: **1.0.22** / v304 (preservation-first `buildPrompt()` rewrite shipped earlier this session)

## Latest commits

- ExplodeView: `41471f3` v1.0.22 tag, `b47d6a9` v304 code
- cycleCAD: HEAD clean before session; **unstaged changes this session** in:
  - `app/js/modules/pentacad.js` + `pentacad-cam.js` + `pentacad-sim.js` + `pentacad-bridge.js` (new)
  - `app/pentacad.html` (new)
  - `machines/v2-50-chb/kinematics.json` (new)
  - `mockups/cyclecad-suite-mockup.html` (new)
  - `index-agent-first.html.bak` (new)
  - `HANDOFF-2026-04-24-session-2.md` (this file, new)

Nothing pushed yet — waiting on user to commit.

---

## Suggested commit + push

```bash
rm -f ~/cyclecad/.git/index.lock ~/cyclecad/.git/HEAD.lock && \
  cd ~/cyclecad && \
  git add app/js/modules/pentacad.js \
          app/js/modules/pentacad-cam.js \
          app/js/modules/pentacad-sim.js \
          app/js/modules/pentacad-bridge.js \
          app/pentacad.html \
          machines/v2-50-chb/kinematics.json \
          mockups/cyclecad-suite-mockup.html \
          HANDOFF-2026-04-24-session-2.md \
          index-agent-first.html.bak && \
  git commit -m "Pentacad extension scaffold + suite landing mockup

- app/js/modules/pentacad*.js: 4 new modules (coordinator, CAM, sim, bridge)
- app/pentacad.html: dedicated Pentacad UI entry point
- machines/v2-50-chb/: template kinematics JSON (awaiting real data from Matt)
- mockups/cyclecad-suite-mockup.html: animated suite landing page with 3 end-to-end journey examples
- HANDOFF-2026-04-24-session-2.md: session handoff" && \
  git push origin main
```

---

## How to resume in the next chat

1. Read `~/cyclecad/CLAUDE.md` (has been updated with suite positioning + Matt status + Pentacad extension)
2. Read `~/explodeview/CLAUDE.md` (not modified this session, earlier context still current)
3. Read `~/cyclecad/HANDOFF-2026-04-24.md` (the earlier session today — AI Render fix, GitHub Pages workflow)
4. Read **this file** for session-2 context
5. Read `~/Documents/Penta/pentacad-notes/pilot-intelligence-brief.md` if anything Matt-related comes up
6. Open `~/cyclecad/mockups/cyclecad-suite-mockup.html` in Chrome to see the suite landing design
7. Review deliverables at `~/Documents/Penta/pentacad-deliverables/`
8. Ask me which of tasks #10-24 to start with, or just kick off #13 + #14 + #10 as the recommended sprint

---

*File generated at end of session 2 on 2026-04-24. Next chat picks up from here.*
