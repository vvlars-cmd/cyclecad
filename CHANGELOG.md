# cycleCAD Suite — Changelog

Semantic versioning applies to the `cyclecad` npm package. The suite as a whole
shares a rolling history below.

## 3.14.0 — 2026-04-24 · Pentacad is a real product

### Pentacad Phase 1A + 1B (new)

Pentacad went from scaffold to a working CAM + simulator + bridge with 7 of 12 strategies implemented.

**CAM** (`app/js/modules/pentacad-cam.js`, ~1,000 lines):
- **Phase 1A**: 2D Contour (offset + ramp-in), Pocket (zig-zag scanlines), Drill (G83/G73 peck cycles), Face (stock-top zig-zag)
- **Phase 1B**: Adaptive Clear (concentric-ring approximation), Chamfer/Deburr (V-bit engagement depth math), Bore/Thread (straight-bore + helix-bore + thread-mill)
- Real offset-polygon geometry in pure JS (parallel-line + line-line intersect)
- Post-processor emits valid Pentamachine V2 `.ngc`: G20 inch default, G93 inverse-time for 5-axis, G54 WCS, 4-decimal coords, tool-change `Tn M6`
- 12-entry feeds-and-speeds table (endmill × material combos)
- 12/12 self-tests pass

**Simulator** (`app/js/modules/pentacad-sim.js`, ~1,033 lines):
- Full G-code parser with N-numbers, `()` and `;` comments, block-delete, decimal-only values
- Modal executor: G20/G21, G90/G91, G17/18/19, G54-59, G93 inverse-time, G94 per-minute, G28 home
- Forward kinematics for A-tilt + B-rotary table (T_aToTable · R_A · T_bToA · R_B)
- Soft-limit check per axis with violation reports
- Three.js animation helper (play/pause/seek/stop)
- 11/11 self-tests pass

**Bridge** (`app/js/modules/pentacad-bridge.js`, ~530 lines):
- JSON-over-WebSocket protocol v1.0 (14 ops, 9 events)
- Auto-reconnect with exponential backoff (1s → 30s cap)
- Streaming window flow control (8 lines in-flight)
- Resume-on-reconnect
- Mock mode for demos without hardware
- 6/6 self-tests pass

**UI** (`app/pentacad.html`, ~1,445 lines):
- 5 functional workspace tabs: Machine / Design / CAM / Simulate / Control
- Three.js viewport with machine + stock + toolpath preview + tool marker
- Status strip: X/Y/Z/A/B + feed + spindle + bridge state dot
- Auto-loads V2-50CHB + demo pocket on startup

**Machines** — three JSONs with honest `_confirmed: false` markers:
- `machines/v2-10/kinematics.json`
- `machines/v2-50-chb/kinematics.json`
- `machines/v2-50-chk/kinematics.json`
- `machines/index.json` — registry

**Reference daemon** (`server/pentabridge.py`, ~350 lines):
- Python 3 implementation of the protocol spec
- Translates WS ops → halcmd / linuxcncrsh / MDI
- `--mock` for dev, `--config INI` for real hardware
- systemd unit file included

**Docs**:
- `docs/pentacad/README.md` — install + quickstart + roadmap
- `docs/pentacad/bridge-protocol.md` — full protocol spec (shareable)
- `docs/pentacad/machine-config-schema.json` — JSON schema

### AI Engineering Analyst — RAG wiring

`ai-engineer.js` now shows a "Sources" block after every analysis, powered by the RAG module. Each tab uses a tailored query (bolt / gear / shaft / bearing / weld). Degrades silently if IndexedDB or CDN unavailable.

---

## 3.13.0 — 2026-04-24 · AI Engineer v2 complete + Text-to-CAD live preview

### AI Engineering Analyst v2 — all 5 analyses

- **bearingLifeAnalysis** — ISO 281 L10, 14-entry catalog (6200 series + NJ rollers), Weibull reliability
- **filletWeldAnalysis** — AWS D1.1 throat stress, 6-entry electrode table (E60-E110), cyclic derate
- **UI tab switcher** — pill row swaps fields + presets + result renderer across 5 analyses
- 28/28 self-tests pass

### AI Engineer v3 — RAG scaffold

- `app/js/modules/ai-engineer-rag.js` (689 lines)
- @xenova/transformers MiniLM-L6-v2 via CDN
- IndexedDB persistence, cosine similarity, 10 seed passages
- `buildCitationUI()` renders MecAgent-style footnote links

### Text-to-CAD live preview

- 400ms-debounced rendering as user types
- 3-tier priority: template match (instant) → local NLP → LLM (Enter)
- Dedicated 360×280 preview scene with orbit controls
- "Insert into scene" button clones preview meshes into main scene
- STL export of preview

### Docker fix

- `server/converter.py` now exists (was only `converter-enhanced.py`)
- `docker-compose up` builds cleanly

---

## 3.12.0 — 2026-04-24 · Suite product pages + AI Engineer gears + shafts

- `/cyclecad.html` (gold) + `/explodeview.html` (teal) — 1,000+ line product marketing pages
- Cross-linked nav across all 4 suite pages
- AI Engineer v2: spur gears (AGMA bending + pitting) + shaft fatigue (Goodman + Soderberg + yield)
- Dynamic version badge (fetches from `/package.json`)
- Splash screen buttons wired (New Sketch / Open-Import / Inventor Project)

---

## 3.11.0 — 2026-04-24 · AI Engineering Analyst v1

- `app/js/modules/ai-engineer.js` (570 lines) — bolted-joint analysis (VDI 2230 / Shigley)
- 7 self-tests pass against MecAgent screenshot reference values
- KaTeX-rendered equations, 3 preset buttons, natural-language prompt parser
- Tools menu entry: 🔩 AI Engineering Analyst

---

## 3.10.5 — 2026-04-24 · AI Copilot polyline + 4 templates

- `sketch.polyline` in AI Copilot mini-executor (enables custom 2D profiles, gear teeth)
- Ball bearing template — 20 ISO 15 / DIN 625 designations
- Bearing housing template — with OD lookup from bearing code
- T-slot aluminum extrusion (2020/3030/4040/4080)
- U-bracket / channel bracket

---

## 3.10.4 — 2026-04-23 · Spur gear / pulley / shaft templates

- AGMA spur gear (m × Z math, OD = m × (Z+2))
- V-belt / timing pulley (disc + center bore)
- Shaft (simple + stepped)

---

## 3.10.3 — 2026-04-23 · 5 basic templates

- DIN 125 washer (M3-M12)
- Flange with configurable bolt circle
- Threaded rod / stud
- Mounting plate (with 4-hole corner or evenly-spaced)
- Generic box

---

## 3.10.2 — 2026-04-23 · AI Copilot v1.1 (Pi case + hex nut + L-bracket)

- Raspberry Pi 4B case template with USB / HDMI / Ethernet cutouts
- Hex nut (DIN 934) M3-M12
- L-bracket with configurable hole count + centers
- Real CSG booleans via three-bvh-csg (vendored locally)
- Click-pin menus, draggable dialogs
- Cmd+Shift modifiers for shortcuts (no more Copy hijack)

---

# ExplodeView — sibling product

## 1.0.24 — 2026-04-24 · Compositing render auto-install

- `docs/demo/composite-render.js` (~370 lines) injects a "Composite Render" button into the AI panel
- Pipeline: render 3D with transparent background → send scene-only prompt to Gemini → composite 3D foreground onto generated background in canvas
- Guarantees pixel-perfect CAD preservation

## 1.0.23 — 2026-04-24 · Compositing render scaffold

- New module at `docs/demo/composite-render.js`
- Exposes `window.ExplodeView.compositeRender()`
- Bypasses "generative ≠ inpainting" limitation

## 1.0.22 — 2026-04-24 · Preservation-first AI Render (v304)

- `buildPrompt()` rewritten with preservation-first logic
- Auto-detects "do not change" cues and strengthens reference-image anchor
- Suppresses Product Photo preset suffixes when scene prompt is outdoor
- New "No Style" preset for raw scene prompts

---

# Suite website

- **2026-04-24** — `/pentacad.html` product marketing page ships (1,097 lines, emerald tokens)
- **2026-04-24** — Suite landing page ports from mockup to production `/` (3 product cards, cross-linked)
- **2026-04-24** — `/cyclecad.html` + `/explodeview.html` product pages ship (gold + teal)
