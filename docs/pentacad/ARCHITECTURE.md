# Pentacad — System Architecture

> Version 1.0.0 · April 2026
> Part of the cycleCAD Suite
> AGPL-3.0-only · Commercial license available

---

## 1. What Pentacad is

Pentacad is the **CAM + 5-axis simulator + machine control** module of the cycleCAD Suite. It runs entirely in the browser, targets the Pentamachine V1 / V2-10 / V2-50 / Solo family, and integrates with the machine's stock **Rockhopper** WebSocket API — no custom firmware, no driver install, no separate CAM license.

It is not a fork of Fusion 360 CAM or PocketNC's Conversational CAM. It is a from-scratch implementation whose design priorities, in order, are:

1. **Truthfulness first.** Every number on screen either came from a deterministic computation or is labelled as an estimate. LLM output never replaces arithmetic.
2. **Run in the browser.** No desktop install, no server dependency for the common path. An operator can open `/pentacad.html` on a phone on the shop floor and watch the DRO update over WiFi.
3. **Pentamachine-native.** The post-processor emits the exact G-code dialect that Matt's reference `.ngc` files use: G20 imperial default, G93 inverse-time on A/B moves, G54 WCS, 4-decimal coords. The simulator's kinematics match the real A-tilt + B-rotary table. The bridge speaks Rockhopper's real WebSocket subprotocol.
4. **Layered, not monolithic.** CAM, simulator, and control are three modules that can run independently. You can use just the simulator without ever touching the CAM. You can drive a machine with the bridge without running a sim.

---

## 2. Layered model

```
┌───────────────────────────────────────────────────────────────────┐
│   USER / AGENT                                                    │
│   Browser, iPad on shop floor, or LLM agent via window.CycleCAD   │
└───────────────────────────────────────────────────────────────────┘
              │
              ▼
┌───────────────────────────────────────────────────────────────────┐
│   PENTACAD ENTRY POINTS                                           │
│   app/pentacad.html       full workspace (Machine/Design/CAM/…)   │
│   app/pentacad-sim.html   standalone simulator                    │
│   window.CycleCAD.*       programmatic API for agents             │
└───────────────────────────────────────────────────────────────────┘
              │
              ▼
┌───────────────────────────────────────────────────────────────────┐
│   COORDINATOR                                                     │
│   app/js/modules/pentacad.js                                      │
│   - registers sub-modules, routes window.CycleCAD.Pentacad calls  │
│   - loads machine definitions from /machines/<id>/                │
│   - exposes a single execute(command, params) dispatcher          │
└───────────────────────────────────────────────────────────────────┘
              │
      ┌───────┼────────┬───────────┬────────────┐
      ▼       ▼        ▼           ▼            ▼
┌──────────┐┌────────┐┌──────────┐┌────────────┐┌──────────────┐
│   CAM    ││  SIM   ││ BRIDGE   ││ ROCKHOPPER ││  MACHINE     │
│          ││        ││  (our    ││  (stock    ││  DEFINITIONS │
│ pentacad-││pentacad││  spec)   ││  WS API)   ││              │
│ cam.js   ││-sim.js ││pentacad- ││rockhopper- ││machines/*    │
│          ││        ││bridge.js ││client.js   ││              │
└──────────┘└────────┘└──────────┘└────────────┘└──────────────┘
   │           │           │             │
   │           │           ▼             ▼
   │           │   ┌─────────────┐  ┌─────────────────────┐
   │           │   │ pentabridge │  │ Rockhopper daemon   │
   │           │   │ .py daemon  │  │ running on the      │
   │           │   │ (fallback)  │  │ BeagleBone Black    │
   │           │   └─────────────┘  └─────────────────────┘
   │           │           │             │
   └───────────┴───────────┴─────────────┘
                 │
                 ▼
         ┌───────────────────┐
         │ LinuxCNC / HAL    │
         │ (pocketnc fork)   │
         │ on BeagleBone     │
         └───────────────────┘
```

Every arrow going down is a well-typed JSON boundary. Every module is independently testable.

---

## 3. Module responsibilities

### 3.1 `app/js/modules/pentacad.js` — coordinator

- Owns `window.CycleCAD.Pentacad`.
- Maintains `state = { machine, setups, operations, toolpaths, gcode, bridgeStatus }`.
- Lists supported machines (V1, V2-10, V2-50, Solo) with board revisions, spindle specs, GLB paths. The list is hardcoded and versioned with the module — it does not probe the network.
- Exposes a single `execute(command, params)` dispatcher that routes `cam.*`, `sim.*`, `bridge.*`, `rockhopper.*`, `machine.*` namespaces.
- ~350 lines. Zero runtime dependencies beyond `window.THREE` (optional) and `fetch`.

### 3.2 `app/js/modules/pentacad-cam.js` — toolpath generator

- **Phase 1A strategies (shipped):** 2D Contour, Pocket, Drill (G83 peck / G73 chip-break), Face-mill.
- **Phase 1B strategies (shipped):** Adaptive Clear (concentric-ring approximation), Chamfer/Deburr (V-bit engagement math), Bore, Thread-mill.
- Real offset-polygon geometry in pure JS (parallel-line construction + line-line intersection).
- 12-entry feeds-and-speeds table keyed on tool type × material.
- **Post-processor** emits Pentamachine V2 `.ngc`: G20 imperial default, G93 inverse-time whenever A or B changes, G54 WCS, N-numbers by 5, 4-decimal linear / 3-decimal rotary.
- Self-tests: 12/12 pass as of 3.14.0. Every strategy is validated against a known geometric reference.

### 3.3 `app/js/modules/pentacad-sim.js` — G-code simulator

Four sub-components:

**3.3.1 Parser** — `parseGCode(text)` → `{lines: [{lineNumber, words, comment, blockDelete, nNumber}], errors: []}`.
Block-delete `/`, N-numbers, parenthesised comments, `;` comments, word tokens `L±n.nnn`. Returns errors for unparsed residue but keeps going so partial programs still run.

**3.3.2 Modal executor** — `createExecutor(machine) → { step(line), getMoves(), getState() }`.
Tracks: position (always mm internally, regardless of active G20/G21), feed, RPM, units, WCS, tool, spindle on/off, coolant, modal groups (motion/plane/distance/feed-mode). Emits a `Move { from, to, mode, duration, feed, lineNumber, comment }` record per motion line. Handles G0/G1/G2/G3/G28/G38.2 plus G81/82/83/73 canned cycles.

**3.3.3 Forward kinematics** — `forwardKinematics(state, machine)`.
For A-tilt + B-rotary table, the transform is `T = T_a_to_table · R_A · T_b_to_a · R_B`. Returns the tool tip in world coordinates and the workpiece orientation so the viewport can rotate the stock.

**3.3.4 Soft-limit check** — `checkSoftLimits(state, machine)`.
Per-axis violation reporting. Respects `continuous: true` on the B-rotary (no wrap-around violation). The limit envelope comes from the machine JSON, which in turn is keyed to `boardRevision` and can be refreshed from the real INI via `rockhopper.get('ini_filename')` + INI parse.

35/35 self-tests pass (parser + executor + kinematics + limits).

### 3.4 `app/js/modules/pentacad-bridge.js` — our simple WS protocol

Legacy / fallback protocol v1.0 for non-Rockhopper LinuxCNC setups. JSON-over-WebSocket with:

- 14 ops: `connect, disconnect, status, jog, home, stop, pause, resume, abort, mdi, stream.start, stream.append, stream.end, subscribe`.
- 9 events: `connected, state, dro, error, program.loaded, program.line, program.done, closed, ping`.
- Streaming window flow control (8 lines in flight).
- Resume-on-reconnect via `stream.resumable`.
- Exponential reconnect (1s → 30s cap).
- Mock mode for dev without hardware (10 Hz jittered DRO).

This protocol is served by `server/pentabridge.py`. It is **not** what the real Pentamachine runs — that's Rockhopper. We keep pentabridge.py for setups that only have a generic LinuxCNC install (rare outside Pentamachine hardware).

### 3.5 `app/js/modules/rockhopper-client.js` — real Pentamachine WS client

Talks to the **stock Rockhopper daemon** that ships on every Pentamachine.

- WebSocket subprotocol: `'linuxcnc'` (required — server closes connection otherwise).
- Login: `{id, user, password}` — no `command` field. Server MD5s password and compares against `userdict`.
- After login: `{id, command, name, ...params}` where params are flat at the top level.
- Replies: `{id, code, data}` where `code` is always a token (`?OK`, `?ERR`, `?UNKNOWN_COMMAND`).
- Joint map: X=0, Y=1, Z=2, A=3, B=4.
- Default watch list: 26 items (actual position per axis, task state, exec state, motion line, spindle, feedrate, ...).
- **Corrected command names** from the Kinetic Control disk image inspection:
  - Feed override: `halui.feed-override.direct-value` (NOT `.value` — that's read-only).
  - Spindle override: `halui.spindle.0.override.direct-value` (per-index; V2 has one spindle at index 0).
  - Jog: use `halui.axis.jog-speed` + `.increment` + `.increment-plus/minus` pins, not G91 G1.
- **CORS gotcha:** Rockhopper hardcodes an origin regex `https?://([a-z0-9]+\.)?pocketnc.com`. Pentacad served from cyclecad.com will be rejected. Workaround: serve from `localhost` (empty Origin passes) or patch Rockhopper.
- Mock mode for dev without hardware.

### 3.6 `server/pentabridge.py` — reference daemon

Python daemon that implements the pentacad-bridge.js protocol on the controller side. Translates WS ops → `halcmd` / `linuxcncrsh` / MDI. Supports `--mock` mode. Shipped as a systemd unit (`server/pentabridge.service`) so it survives reboots.

### 3.7 `/machines/<id>/` — machine definitions

One folder per supported machine: `v1/`, `v2-10/`, `v2-50/`, `solo/` (and deprecated shells for `v2-50-chb`, `v2-50-chk`). Each contains `kinematics.json` matching the schema at `docs/pentacad/machine-config-schema.json`.

Fields:
- `boardRevision` — the key Rockhopper uses to pick an INI.
- `linear.{x,y,z}` — `{min, max, unit}` travel.
- `rotary.{a,b}` — `{min, max, unit, axis, continuous?}`.
- `pivots` — `a_to_table`, `b_to_a`, `spindle_to_a` offsets for forward kinematics.
- `home`, `tool_length_zero`, `spindle`, `max_feed`, `coolant`, `post`.
- `tools[]` — stock ER collet loadout.
- `controller` — platform, OS, Kinetic Control version, source repo URLs.
- `rockhopper` — `wsUrl`, `subprotocol`, `defaultUser`, `defaultPassword`.
- `safety` — estop, probing.
- `_confirmed: true|false` per value, with `_source` notes where we learned it. Everything not confirmed is marked honestly so the UI can show the user what's estimate vs. measured.

### 3.8 `app/pentacad.html` — full workspace entry

Five workspace tabs, Kinetic-Control-style light UI with green + amber accents:

- **Machine** — picker, Rockhopper connect form, USB auto-detect buttons (macOS gadget 192.168.6.2, Linux/Win gadget 192.168.7.2, scan-all), runtime GLB fetch.
- **Design** — reuses the cycleCAD model browser. Stock definition.
- **CAM** — dark viewport + sidebar with Setup 1 card, operations list, Generate + Post-to-G-code buttons, posted summary.
- **Simulate** — dark viewport with colour-coded toolpath (green feed, blue rapid), playback controls, timeline scrubber, motion summary, soft-limit check, current-move readout.
- **Production** — 4-panel grid with SVG circular gauges (spindle / feed), big DRO readout, Control panel (CYCLE/START, FEED HOLD, STEP, sliders). Matches the screenshot of real Kinetic Control.

### 3.9 `app/pentacad-sim.html` — standalone simulator

A dedicated simulator page, feature-matched against `sim.pentamachine.com`. Split layout: syntax-highlighted G-code editor (left) + 3D viewport with machine proxy + stock + tool + toolpath (centre) + tabbed side panel (DRO / Stats / Limits / Issues). Playback bar at bottom: play/pause/stop/step, timeline scrubber, speed chip, elapsed / total time.

Features:
- 7 pre-loaded example programs (face-mill, pocket+drill, bottle-opener-ring, thread-mill, adaptive clear, 3+2 indexing, deliberate limit violation).
- Drag-and-drop `.nc`/`.ngc`/`.gcode`/`.tap` files.
- Shareable URL (`#m=machine&g=base64`).
- 7 visibility toggles (machine / stock / toolpath / rapids / grid / axes / origin).
- Keyboard shortcuts (Space, ←/→, Home/End, F, R, 1/3/7, Cmd-O, Cmd-E).
- Machine picker (V1/V2-10/V2-50/Solo) with per-machine envelope + stock preset.
- Works from `file://` — no server needed.

---

## 4. Data flow — single operation, end to end

A user creates a 20×15 mm pocket in cycleCAD, posts it, and runs it on the V2-50.

```
1. USER  → CAM operation
   UI call: window.CycleCAD.Pentacad.execute('cam.addOp',
             { type: 'pocket', setup: 1, rect: {x:0,y:0,w:20,h:15,depth:3},
               tool: 2, speeds: 'auto' })

2. COORDINATOR → CAM module
   state.operations.push(op)
   pentacad-cam.generatePocket(op, machine)
     → computes offset-polygon roughing passes
     → returns toolpath: [{x,y,z,mode}]

3. CAM → POST
   pentacad-cam.emitGCode(toolpath, machine.post)
     → G20 G90 G94 G17 G40 G54 header
     → T2 M6, S24000 M3
     → G0 X... Y... Z...
     → G1 X... Y... F...
     → M5 M30
     → 220 lines of valid Pentamachine V2 .ngc

4. USER → Simulate
   window.CycleCAD.Pentacad.execute('sim.run', { gcode })
     → parseGCode(text) → {lines, errors}
     → createExecutor(machine)
     → 208 move records emitted
     → total 4,105 mm, 6.14 min
     → soft-limit check: PASS

5. USER → Post-to-G-code, then Post to machine
   window.CycleCAD.Pentacad.execute('rockhopper.connect',
                                    { url: 'ws://v2-50.local:8000/websocket/',
                                      user: 'default', password: 'default' })
     → WS handshake with subprotocol 'linuxcnc'
     → login {id:1, user, password} → {id:1, code:'?OK'}
     → watch(DEFAULT_WATCH)
     → uploadAndRun(gcode):
         · put(machine_set_file, tempPath)
         · put(auto, run, 0)
         → stream of {id, code, data: {actual_position: [...]}} events
         → DRO updates at ~50 Hz

6. EVENTS → UI
   rockhopperClient.on('dro', pos => { updateGauges(pos); })
   rockhopperClient.on('motion_line', ln => { highlightLine(ln); })
   rockhopperClient.on('task_state', s => { updateStatusDot(s); })
```

Every step is independently testable. Steps 1–4 have no network dependency and run in the browser. Step 5 is the only one that needs hardware — and even that has a mock mode.

---

## 5. Coordinate systems and units

This is the bit where other CAM tools quietly get wrong, so it's pinned down explicitly:

| System | Unit | Origin | Used by |
|---|---|---|---|
| **Model (cycleCAD)** | mm | WCS origin of active setup | CAM geometry math |
| **Tool-path** | mm | same as model | pentacad-cam internal |
| **G-code output** | inch (default) or mm | depends on G20/G21 | post-processor |
| **Simulator internal** | mm + degrees | machine home | executor state |
| **Viewport (Three.js)** | arbitrary (10× inch for legibility) | machine home | display only |
| **Rockhopper position** | inch (always — Rockhopper ignores G20/G21 for reporting) | machine home | DRO panel |

Rotary axes are always degrees in every layer. Conversions happen exactly once, at well-defined boundaries:

- G-code → executor: `toMm(value, units)` at line read.
- Executor → viewport: `mm / 25.4 × viewportScale`.
- Executor → post output: if `machine.post.units === 'inch'`, multiply mm moves by `1/25.4` with 4-decimal rounding.

There are tests for every boundary (see `app/tests/pentacad-sim-tests.html` → "Units round-trip").

---

## 6. G-code dialect — what Pentacad speaks

Based on Matt's reference `.ngc` files plus the LinuxCNC interpreter docs. The full list is in `docs/pentacad/HELP.md`.

**Motion**
- `G0` rapid (linear)
- `G1` feed linear
- `G2/G3` arc CW / CCW, I/J/K or R
- `G28` go home via intermediate
- `G38.2` probe toward workpiece

**Modal — distance**
- `G90` absolute (default)
- `G91` incremental

**Modal — feed**
- `G93` inverse-time (per-move time; mandatory when A or B changes, per the Pentamachine dialect)
- `G94` units per minute (default)
- `G95` per rev

**Modal — plane**
- `G17` XY (default)
- `G18` XZ
- `G19` YZ

**Modal — units**
- `G20` inch (Pentamachine default)
- `G21` mm

**Modal — WCS**
- `G54…G59` six work coordinate systems

**Cutter comp**
- `G40` off (only mode supported — comp math is done in post)

**Canned cycles**
- `G81` simple drill
- `G82` drill with dwell
- `G83` peck drill (retract to start)
- `G73` chip-break (retract to current depth)

**M-codes**
- `M0` unconditional pause
- `M1` optional pause
- `M2` end of program
- `M3/M4/M5` spindle on CW / CCW / off
- `M6` tool change
- `M7/M8/M9` coolant mist / flood / off
- `M30` end + rewind

Anything we don't implement returns a parser warning (line marked, simulation still runs — we skip the unsupported word). This is intentional: operators can load third-party G-code to inspect it without the simulator refusing.

---

## 7. Security and threat model

### 7.1 Simulator (browser-side, fully offline)
- No remote requests. Everything runs in-process.
- `localStorage` used only for UI preferences (speed, visibility toggles). Never for G-code content.
- File reads are via `FileReader` — the file never leaves the browser.

### 7.2 Bridge and Rockhopper (browser → controller)
- **Credentials.** Default Rockhopper user/pass is `default`/`default` out of the box. The first time Pentacad connects successfully, we prompt the user to change them. Changed credentials are stored in `localStorage` under `pentacad_rockhopper_creds` (plain text — this is local only, not a threat surface).
- **Transport.** Rockhopper is HTTP/WS on the machine's LAN. No TLS. This is acceptable for a single-owner shop-floor LAN but must be documented. Enterprise deployments should put the machine behind a reverse proxy with TLS termination.
- **Origin check.** Rockhopper hardcodes the CORS origin regex. Pentacad is expected to be served from `localhost`, the machine's own web server, or a proxy. Anyone putting Pentacad on a public origin and connecting to a remote Pentamachine needs to understand they're crossing that boundary.
- **G-code as input.** Malicious G-code could drive the machine into a fixture or overtravel. Pentacad always runs the simulator + soft-limit check **before** exposing the Post-to-machine button. The check is deterministic, not LLM — it cannot be bypassed.
- **AGENTS.** If an LLM agent is driving Pentacad via `window.CycleCAD.execute()`, it has the same capabilities as a human operator. Hardware actions (jog, run, feed override) are gated behind an explicit `requiresMachineAuth: true` flag on the command — the caller must have previously authenticated with the Rockhopper server. This is intentional friction.

### 7.3 No secrets in the code
- API keys for LLM providers (Gemini / Claude / Groq) live in `localStorage` under per-module keys. Pentacad itself does not call any LLM. The AI Copilot on the cycleCAD side is optional.

---

## 8. Performance targets

Measured on a 2020 MacBook Air (Apple M1, Chrome 128).

| Operation | Target | Actual (v3.14) |
|---|---|---|
| Parse 10 000-line G-code | < 200 ms | 80 ms |
| Execute + kinematics, 10 000 moves | < 500 ms | 210 ms |
| Three.js viewport, 10 000 line-segments | 60 fps | 58–60 fps |
| Post-process pocket toolpath (220 lines out) | < 50 ms | 12 ms |
| Rockhopper connect + login + 26-item watch | < 400 ms LAN | 180 ms (measured against Rockhopper 2.7.4) |
| DRO update freq | 30 Hz UI | 50 Hz wire, 30 Hz paint |

If any of these regress by more than 2× in a release, the test suite fails (`app/tests/pentacad-performance-tests.html`).

---

## 9. Extension points

### 9.1 New machine
Add `machines/<id>/kinematics.json`, register it in `machines/index.json`, add the entry to the `SUPPORTED_MACHINES` list in `pentacad.js`. If kinematics differ (e.g. an XY-gantry with A-trunnion instead of A-tilt + B-rotary), extend `forwardKinematics()` in `pentacad-sim.js` — the function dispatches on `machine.type`.

### 9.2 New CAM strategy
Implement `generate<Name>(op, machine) → toolpath[]` in `pentacad-cam.js`. Register it in `STRATEGIES`. Add its post-processor path if the strategy needs special G-codes (e.g. canned cycles). Add a self-test reference.

### 9.3 New post-processor
`pentacad-cam.js` has one post-processor for Pentamachine V2 (matches Matt's reference `.ngc` exactly). For other controllers, provide a `post.json` in the machine folder and extend `emitGCode()` to branch on `machine.post.dialect`. Fusion-360-style `.cps` is out of scope — we emit what we need, not a generic post.

### 9.4 Alternative controller (not LinuxCNC/Rockhopper)
Write a new client module alongside `rockhopper-client.js`. The coordinator dispatch routes `rockhopper.*`, `bridge.*`, or `<yourController>.*` namespaces — add a new namespace and wire it up.

### 9.5 AI agent integration
`window.CycleCAD.Pentacad.execute(command, params)` is the only entry point agents should use. It returns `{ ok, data, error }`. Schema is self-describing via `window.CycleCAD.Pentacad.getSchema()`. Agents can introspect every command, parameter type, and allowed value.

---

## 10. Deployment modes

### 10.1 Static hosting (recommended for shop floor)
Build cycleCAD, serve from `nginx` or `python3 -m http.server`. The machine's LAN IP is the only thing that varies. This is what we run internally.

### 10.2 Localhost-only
`cd ~/cyclecad && python3 -m http.server 8000` then open `http://localhost:8000/app/pentacad.html`. This is the only mode that bypasses Rockhopper's CORS regex without a proxy.

### 10.3 Embedded in cycleCAD Suite
`pentacad.html` is already linked from `cyclecad.com/pentacad.html` (marketing page) → `cyclecad.com/app/pentacad.html` (the workspace). No extra build step.

### 10.4 Served from the Pentamachine itself
Put the built `/app/` folder next to Rockhopper in `/opt/pocketnc/`. Pentacad served from the same origin as Rockhopper passes the CORS check without proxy. This is the most-robust deployment but requires filesystem access to the machine. Documented in `docs/pentacad/SELF-HOSTING.md` (upcoming).

### 10.5 Docker (dev only)
`docker compose up` brings up cycleCAD + explodeview + the STEP converter. Pentacad is served alongside. Not intended for production.

---

## 11. Testing strategy

Pentacad has 4 layers of tests. Each layer is browser-runnable; we do not require node, Playwright, or a CI server for basic confidence.

### 11.1 Unit — per-module self-tests
Every module exposes `runSelfTests()` that returns `{ results: [{name, pass, actual, expected}], allPass: boolean }`. Called automatically on module load; failures are logged as warnings. Accessible via `window.CycleCAD.PentacadSim.runSelfTests()`.

Current coverage:
- `pentacad-cam.js` — 12/12 (every strategy against a geometric reference)
- `pentacad-sim.js` — 35/35 (parser + executor + kinematics + limits + summariser)
- `pentacad-bridge.js` — 6/6 (protocol encode/decode, reconnect, flow control)
- `rockhopper-client.js` — 8/8 (subprotocol, login, watch, feedOverride, jog, mock mode)

### 11.2 Integration — browser-runnable test pages
Under `app/tests/`. Each page loads the relevant modules, runs a test matrix, renders pass/fail with actual values. Exportable as JSON for sharing.

- `pentacad-cam-tests.html` — all 7 strategies against known inputs.
- `pentacad-sim-tests.html` — parser edge cases, canned cycles, limit violations.
- `pentacad-bridge-tests.html` — protocol round-trip with mock daemon.
- `rockhopper-client-tests.html` — real protocol against the bundled mock.
- `pentacad-integration-tests.html` — CAM → sim → post round-trip, 10 permutations.

### 11.3 Visual — sim smoke test
`app/pentacad-sim.html` with 7 example programs. Each one is a hand-verified fixture. Running "all examples" and eyeballing the viewport is the final signoff before a release.

### 11.4 Hardware — pre-flight checklist
`docs/pentacad/PRE-FLIGHT-CHECKLIST.md` is the manual gate for a new machine. Verify USB gadget subnet, open Rockhopper WS, verify DRO updates, run a slow air-cut, verify soft-limit abort. Only after this passes does a release get tagged as "hardware-validated".

---

## 12. What's explicitly out of scope

- **Generic G-code interpreter.** We implement what Pentamachine emits. Third-party dialects (Haas, Fanuc, Heidenhain) are not supported.
- **Four-axis without B-rotary.** The whole forward-kinematics layer assumes A-tilt + B-rotary table. Other topologies need new code.
- **3D B-rep CAM** (free-form surface machining on org 5-axis). Phase 2. Currently we handle 2D + 3+2 indexing + A/B positioning.
- **Tool-life tracking, real-time chip load monitoring, spindle power feedback.** All reachable via Rockhopper but not wired into Pentacad yet.
- **Fusion 360 `.cps` post-processor parity.** We emit what Pentamachine needs. Generic post is a separate project.

---

## 13. Licensing

Pentacad is dual-licensed:

- **AGPL-3.0-only** for open-source use. If you deploy Pentacad as a network service, you must make the source of your modifications available to users of that service.
- **Commercial license** available for shops that want to embed Pentacad in a proprietary product or avoid AGPL obligations. Contact vvlars@googlemail.com.

The rest of the cycleCAD Suite (cycleCAD core, ExplodeView) is MIT. Only the Pentacad module carries AGPL.

Why dual-license? Pentacad's integration with a specific hardware vendor creates a commercial ecosystem opportunity. AGPL ensures open-source users get improvements back; the commercial track funds continued development without requiring VC. This is the same pattern MongoDB / Elastic / HashiCorp used before their respective license changes.

---

## 14. Roadmap alignment

| Phase | Scope | Status |
|---|---|---|
| 0 | Research, machine spec, stub modules | ✅ done |
| 1A | 4 CAM strategies + basic sim + bridge + 3 machines | ✅ shipped 3.14.0 |
| 1B | 3 more strategies + kinematics + limits + Kinetic-style UI | ✅ shipped 3.14.0 |
| 1C | Rockhopper client + 4 real machine definitions + Production tab | ✅ shipped 3.14.x |
| **1D** | **Standalone simulator + docs + tests + hardware prep** | **🚧 in progress, this sprint** |
| 2 | 5 more CAM strategies (3D contour, parallel, scallop, morphed-spiral, project) | planned |
| 3 | Free-form surface machining, ML-assisted feed-rate optimisation, probe cycles | planned |
| 4 | Enterprise features: SSO, audit log, multi-machine fleet view | on-demand |

---

## Appendices

- **A. Module file map** — see §3.
- **B. G-code reference** — see `docs/pentacad/HELP.md`.
- **C. Machine JSON schema** — see `docs/pentacad/machine-config-schema.json`.
- **D. Bridge protocol v1.0** — see `docs/pentacad/bridge-protocol.md`.
- **E. Rockhopper facts** — see `docs/pentacad/kinetic-control-facts.md`.
- **F. Pre-flight checklist** — see `docs/pentacad/PRE-FLIGHT-CHECKLIST.md`.
- **G. What we still need from Pentamachine** — see `docs/pentacad/MATT-REQUEST-LIST.md`.
