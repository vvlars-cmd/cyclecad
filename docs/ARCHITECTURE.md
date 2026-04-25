# cycleCAD Suite — Architecture

*Updated 2026-04-25 · Living document.*

The cycleCAD Suite is a browser-native open-source set of tools for the
mechanical-design → manufacture → present pipeline. Three products share a
common rendering core and live at one domain (`cyclecad.com`):

| Product       | Stage           | License        | Repo path                     |
|---------------|-----------------|----------------|-------------------------------|
| **cycleCAD**  | Design (CAD)    | MIT            | `app/index.html`              |
| **ExplodeView** | Present (viewer / AR / AI render) | MIT | `~/explodeview` (separate repo) |
| **Pentacad**  | Manufacture (CAM + sim + bridge)  | AGPL-3 / commercial | `app/pentacad.html` |

Plus an **AI layer** (Copilot + Engineering Analyst + RAG) shared by all three,
and a standalone simulator (`app/pentacad-sim.html`) that runs without the rest
of the Pentacad app.

---

## 1. Layered model

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Users + AI agents                                                       │
│  • Engineers (browser, mouse + keyboard)                                 │
│  • Field techs (BeagleBone-attached Pentamachine)                        │
│  • LLM agents (Claude / Gemini / Groq via window.cycleCAD.execute())    │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│  Entry points (HTML pages, all under /app/)                              │
│   index.html         — cycleCAD main app (CAD modeller)                  │
│   pentacad.html      — Pentacad full app (Machine/Design/CAM/Sim/Prod)   │
│   pentacad-sim.html  — Standalone 5-axis G-code simulator                │
│   demo/*.html        — Pre-canned showcases of each tool                 │
│   tests/*.html       — Browser test runners                              │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│  Coordinator modules (window.CycleCAD.*)                                 │
│   .Pentacad           — module registry, machine picker UI, public API   │
│   .PentacadCAM        — toolpath strategies, post-processor              │
│   .PentacadSim        — G-code parser, executor, kinematics              │
│   .PentacadBridge     — Rockhopper WebSocket client                      │
│   .Rockhopper         — typed wrapper over the LinuxCNC API              │
│   .AICopilot          — multi-step CAD generator (templates + LLM)       │
│   .AIEngineer         — bolted-joint / gear / shaft / bearing / weld    │
│   .ExplodeView        — viewer mode + AR + AI render                     │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│  Rendering core (shared across all entry points)                         │
│   • Three.js r170 (loaded via importmap from jsDelivr CDN)               │
│   • GLTFLoader + RoomEnvironment (PBR) — used by ExplodeView + cycleCAD  │
│   • Bare ambient + directional lighting (matte) — used by Pentacad sim   │
│     to match sim.pentamachine.com look                                   │
│   • Three.js scene with: machine GLB / proxy + stock + tool + toolpath  │
│     + grid + axes + origin marker + (optional) vice                      │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
┌──────────────────────────────────────────────────────────────────────────┐
│  Data + integration layer                                                │
│   • Local app/models/<machine-id>.glb   — Pentamachine 3D models         │
│     (gitignored — extracted from Kinetic Control disk image)             │
│   • https://sim.pentamachine.com/gltf/  — Public CDN fallback for GLBs  │
│   • Connected machine over USB at 192.168.6.2 / 192.168.7.2 (Rockhopper) │
│   • localStorage 'pentacad.*' — user settings, cached blob URLs          │
│   • IndexedDB pentacad.rag — RAG embeddings cache (AI Engineer v3)       │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Machine variant system

Five Pentamachine variants are registered in `pentacad-sim.html` `MACHINES`:

| ID              | Name                       | Linear travel        | Spindle      |
|-----------------|----------------------------|----------------------|--------------|
| `solo`          | Pentamachine Solo          | ±4 × ±3 × ±2 in     | 30k ER16     |
| `v1`            | Pentamachine V1 (legacy)   | ±3 × ±2 × ±1.5 in   | 24k ER11     |
| `v1kickstarter` | V1 Kickstarter             | (same as V1)        | 24k ER11     |
| `v2-10`         | V2-10                      | ±3.25 × ±2.25 × ±1.75 in | 24k ER11 |
| `v2-50`         | V2-50 (flagship)           | ±5 × ±3.5 × ±2.5 in | 40k ER20     |

GLB resolution order (`resolveMachineGlbCandidates(m)`):

1. `#glb=<url>` — explicit URL hash override
2. `localStorage['pentacad.sim.glb.<id>']` — previously cached blob URL
3. `./models/<id>.glb` — repo-local file
4. `https://sim.pentamachine.com/gltf/<id>.glb` — Penta's public CDN
5. (no proxy by default; only shown if all candidates fail)

Each GLB has a known mesh inventory:

```
Base_1, Base_2          — machine base plate
x_1, x_2, y, z          — linear carriage parts
a, b                    — A-tilt trunnion + B-rotary platter (rotated by sim)
SHORT, LONG, collet, collet001  — tool holders
buttons, cycle_start_led, estop_led  — pendant controls
```

After GLB load, `setupGlbKinematics()` reparents `b` under `a` so A-tilt
drags B with it. `b` rotates around its own Y axis for B motion.

---

## 3. G-code → motion pipeline

```
G-code text
   │
   ▼
PentacadSim.parseGCode(text)
   │ ↳ tokenized lines + modal state per line
   ▼
PentacadSim.createExecutor(machine).run(gcode)
   │ ↳ array of { from, to, mode:'rapid'|'feed', duration, distance }
   ▼
Three.js animation loop (advancePlayback dt)
   │ ↳ interpolates pos.x/y/z/a/b for current move
   ▼
applyToolPosition(pos)
   │ ↳ updates app.three.tool.position
   │ ↳ rotates machine.getObjectByName('a').rotation.x
   │ ↳ rotates machine.getObjectByName('b').rotation.y
```

---

## 4. Coordinate systems (units crossed at every boundary)

| Layer                       | Units  | Notes                                |
|-----------------------------|--------|--------------------------------------|
| User G-code                 | inch (G20) or mm (G21) | Per program declaration |
| Internal exec moves         | mm     | All distances normalized to mm       |
| DRO display                 | inch   | Converted at render time             |
| Three.js world              | unitless authored ≈ 1 inch | scaled to render units |
| GLB scene from Penta        | mm in source, normalized via frameMachineModel | |
| Stock dimensions            | from `m.stock.x/y/z` in inches | Sized realistic |

---

## 5. Security / safety boundaries

- **Browser sandbox** — all rendering + parsing is client-side. No server
  contact except CDN fetches (Three.js, GLBs).
- **CORS** — Rockhopper over WebSocket hardcodes origin allowlist. Pentacad
  served from `cyclecad.com` is **NOT** in that list — must serve from
  `localhost:8000` for hardware control. See `docs/pentacad/PRE-FLIGHT-CHECKLIST.md`.
- **G-code as input** — parser is safe (deterministic), but executing
  generated G-code on real hardware is the user's call.
- **Agent auth** — `window.cycleCAD.execute()` accepts JSON-RPC commands
  with no auth. Only safe in same-origin browser context.

---

## 6. Performance targets

| Target                          | Limit          |
|---------------------------------|----------------|
| Parse 10k-line G-code           | < 200 ms       |
| Executor run for typical pgm    | < 500 ms       |
| Three.js viewport @ 60 fps      | hardware-bound |
| DRO repaint                     | 30 Hz          |
| GLB load + scene rebuild        | < 3 s          |

---

## 7. Out of scope (deliberate)

- Generic G-code interpreters for non-Pentamachine kinematics
- 3D free-form modelling (cycleCAD is parametric only — Phase 3 would add this)
- Fusion-post byte-for-byte parity (we approximate the dialect)
- Native CAD kernel (we use Three.js geometry primitives + STEP import)

---

## 8. Extension points

| To add...                | Edit...                                      |
|--------------------------|----------------------------------------------|
| New machine variant      | `pentacad-sim.html` `MACHINES` + picker      |
| New CAM strategy         | `app/js/modules/pentacad-cam.js`             |
| New post-processor       | `server/pentamachine-v2.cps` (Fusion side)   |
| New AI Engineer analysis | `app/js/modules/ai-engineer.js`              |
| New AI Copilot template  | `matchTemplate()` in `ai-copilot.js`         |
| New controller bridge    | implement WebSocket/HTTP wrapper alongside Rockhopper |

---

## 9. Deployment modes

| Mode                  | Hosting                          | Use case                  |
|-----------------------|----------------------------------|---------------------------|
| Static                | GitHub Pages (cyclecad.com)      | Default, public           |
| Localhost dev         | `python3 -m http.server 8000`    | Dev + Rockhopper CORS      |
| Embedded in Pentacad  | nginx on Pentamachine itself     | Live at machine address   |
| Docker                | `docker compose up`              | Self-hosted enterprise    |

---

## 10. Licensing

- cycleCAD core: MIT
- ExplodeView: MIT
- Pentacad: AGPL-3.0-only with optional commercial license for closed-source
  integrators (the controller-bridge is the part most likely to want a
  commercial license)
- Three.js + dependencies: MIT (CDN-loaded, not vendored)

---

## See also

- `docs/TUTORIAL.md` — guided walkthrough of each tool
- `docs/HELP.md` — keyboard shortcuts, FAQ, troubleshooting
- `docs/pentacad/README.md` — Pentacad-specific deep dive
- `docs/pentacad/bridge-protocol.md` — Rockhopper WebSocket protocol spec
- `docs/pentacad/PRE-FLIGHT-CHECKLIST.md` — first-time hardware test
