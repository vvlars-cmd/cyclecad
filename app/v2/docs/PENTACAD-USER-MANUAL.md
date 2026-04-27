# Pentacad — User Manual

> The CAM workspace inside the cycleCAD Suite. Pentacad turns 3D models into
> Kinetic-Control-compatible NGC G-code for **Penta Machine** 5-axis mills
> (Solo, Pocket NC V2-50 / V2-10 / V2-8L, V1) — all in the browser tab,
> no install, no Fusion 360 license required.
>
> Companion to the canonical [Kinetic Control User Resources](https://pentamachine.atlassian.net/wiki/spaces/KCUR).
> When Pentacad and Kinetic Control disagree, **the machine wins**: cross-check
> any new program in the Kinetic Control simulator before you cut metal.

---

## Table of contents

1. **Manuals & Instructions**
    1.1 What Pentacad is (and isn't)
    1.2 Supported machines
    1.3 First-run setup
    1.4 Installing the Fusion 360 post processor
    1.5 Connecting to your Penta machine
2. **Tutorials**
    2.1 Your first NGC program (browser only)
    2.2 Round-trip from cycleCAD model to running spindle
    2.3 5-axis demo with TCPC
    2.4 Reverse-engineer + post (DUO Inventor → NGC)
3. **Software Updates**
    3.1 Update channels (cyclecad.com vs self-host)
    3.2 Pinned post version & how to upgrade
    3.3 Kinetic Control compatibility matrix
4. **Troubleshooting**
    4.1 Common errors at post time
    4.2 Common errors on the machine
    4.3 Envelope warnings — what they mean
    4.4 TCPC misconfiguration
    4.5 Where to file a bug
5. **G & M code reference**
    5.1 Pentacad's emitted dialect
    5.2 Code-by-code mapping
    5.3 Differences from generic LinuxCNC
6. **User resources**
    6.1 Help inside the app
    6.2 In-suite tutorials (`docs/tutorials/`)
    6.3 The token economy ($CYCLE) and CAM ops
    6.4 Where to next

---

## 1. Manuals & Instructions

### 1.1 What Pentacad is (and isn't)

Pentacad is **the CAM workspace** inside the cycleCAD Suite — one of three
front-of-app tabs (cycleCAD parametric design · ExplodeView assembly viewer ·
**Pentacad CAM**). It exists so a designer can take a model that was just
parametrically defined, drop it onto a machine fixture, and walk out with an
NGC file ready to feed Kinetic Control.

**Pentacad does:**

- 5-axis CAM operation editing (`cam-contour`, `cam-pocket`, `cam-drill`,
  `cam-adaptive`, `cam-face`, `cam-chamfer`, `cam-bore`)
- Tool-table management
- Post-processing to NGC via the bundled **`shared/postprocessors/penta-machine.cps`**
  (the official Autodesk Fusion 360 post, vendored verbatim)
- A browser-side NGC emitter for quick previews without leaving the tab
- Toolpath simulation (`sim-executor`) and machine-envelope validation
- A jog pad (`jog-pad`) and gcode editor (`gcode-editor`) for live-edit-and-run
  workflows
- An optional websocket bridge (`rockhopper-bridge`) to a real Kinetic Control
  instance for run-from-the-browser

**Pentacad does NOT:**

- Replace Kinetic Control on the machine itself
- Generate motion that bypasses KC's safety checks
- Move the machine on its own; even when bridged, every motion is a request
  the controller can refuse
- Guarantee identical output to Fusion 360 — for safety-critical programs,
  verify in the Kinetic Control simulator first

### 1.2 Supported machines

The bundled catalog (`shared/machines/penta.json`) ships with five Penta
Machine models. The default is **Pocket NC V2-50** because Matt @ Penta
Machine confirmed its envelope verbatim (see `_source` in the catalog file).

| Model               | TCPC      | Notes                                                          |
| ------------------- | --------- | -------------------------------------------------------------- |
| **Pocket NC V2-50** | yes       | Default. Envelope: X 115.5 mm, Y 128.3 mm, Z 90.1 mm, A −25..135°, B continuous |
| Penta Solo          | yes       | Flagship. Envelope per Penta Machine spec sheet                |
| Pocket NC V2-10     | yes       | Smaller table, same controller, same post                      |
| Pocket NC V2-8L     | optional  | Long-Z. TCPC defaults OFF; needs advanced-software-upgrade     |
| Pocket NC V1        | optional  | Legacy. TCPC needs Kinetic Control upgrade                     |

If your machine isn't listed, file an issue with the official Penta envelope
PDF and we'll add it. The `envelope: "see-vendor"` placeholder is a deliberate
nudge to the Penta spec sheets — Pentacad refuses to fabricate axis limits.

### 1.3 First-run setup

```bash
# 1. clone the suite
git clone https://github.com/vvlars-cmd/cyclecad-suite ~/cyclecad-suite
cd ~/cyclecad-suite

# 2. dev mode — pure static, no docker required
make serve
# → http://localhost:8765/apps/pentacad/

# 3. (optional) bring up the docker stack for the meter, audit, drawings
make up
# → meter on :8787, MinIO on :9001, postgres on :5432, bridge on :9090
```

When the page loads:

1. From the menu bar, open **Library → Browse library** to load any
   parametric model. Or go straight to **Tools → Pentacad** to start with an
   imported STEP / GLB.
2. The status bar at the bottom shows `Suite: cycleCAD-Suite · mm · Grid On
   · Snap On · Selection None · $CYCLE 0`. The `$CYCLE` pill is your meter
   balance. Admin-key holders see ∞.
3. Open **CAM → Machine** to confirm the active machine. Default is
   **Pocket NC V2-50**.

### 1.4 Installing the Fusion 360 post processor

The Fusion 360 post is the canonical NGC emitter — vendored verbatim from
Autodesk at:

```
shared/postprocessors/penta-machine.cps
```

To install in Fusion 360:

1. In Fusion, **Manufacture** workspace → **Manage** → **Post Library**.
2. Right-click in the Local tab → **Import**.
3. Pick `~/cyclecad-suite/shared/postprocessors/penta-machine.cps`.
4. The post appears as **Penta Machine** under Local.

Alternative: download it from inside the Pentacad app — the **machine-picker**
widget has a `⬇ Download Fusion 360 post (.cps)` button right under the
envelope summary.

The post is signed against `minimumRevision = 45917`. If your Fusion 360 is
older, upgrade Fusion first.

### 1.5 Connecting to your Penta machine

Two transports:

**Sneakernet (recommended for first runs).** Post in Pentacad → save the
`.ngc` file → copy onto a USB stick → load on Kinetic Control.

**Live bridge.** Pentacad's `rockhopper-bridge` widget opens a websocket to a
[Rockhopper](https://github.com/madwasp79/Rockhopper)-style adapter inside
Kinetic Control. With the bridge live, you can run, pause, jog, MDI, and
monitor from the Pentacad tab. Default URL: `ws://localhost:9090/ws` (set by
`server/bridge/pentabridge.py`). Configure the URL in **Tools → Settings →
Bridge**.

**Safety:** The bridge is dev-only by default. Production deploys at
`bridge.cyclecad.com` route through Caddy with a token gate; see
`deploy/Caddyfile` and `DEPLOYMENT-CYCLECAD-COM.md`.

---

## 2. Tutorials

### 2.1 Your first NGC program (browser only)

Goal: 25 lines of NGC, no machine required, just to validate the toolchain.

1. Open `http://localhost:8765/apps/pentacad/`.
2. Click **CAM → Post processor**.
3. Click the big purple **⚙ Post demo program** button.
4. Read the output:

```
%
O1001
(cycleCAD-suite — designed by cycleCAD)
(machine: Pocket NC V2-50 · Kinetic Control)
(envelope: X 115.5 mm · Y 128.3 mm · Z 90.1 mm · A -25..135° · B continuous)
(units: mm · TCPC: on)
N10 G21
N15 G90 G94
N20 G43.4 H1
N25 G54
(cycleCAD demo program — 5-axis exercise)
N30 M700 T1 (6 mm flat endmill)
N35 T1 M6
N40 G54
N45 S8000 M3
N50 M7
N55 G0 X10.0000 Y10.0000 Z5.0000
…
```

Click **⬇ Download .ngc** to save it. Rename to anything. You just emitted a
real Kinetic-Control-compatible program.

### 2.2 Round-trip from cycleCAD model to running spindle

1. **cycleCAD → solid model.** Sketch a 30 × 20 mm rectangle. Extrude 5 mm.
2. **Pentacad → CAM op.** Switch to the Pentacad workspace. Select the part.
   **Solid → Pocket** with a 6 mm flat endmill, 3 mm depth, 2 mm step-down.
3. **Toolpath simulation.** Click **Simulate**. Confirm no clashes against
   stock or fixture.
4. **Machine pick.** Confirm **Pocket NC V2-50** in **CAM → Machine**.
5. **Post.** **CAM → Post processor → Post**. Validation panel appears with
   per-motion envelope checks — green means every motion fits.
6. **Save → load on machine.** Copy the .ngc onto USB → load on Kinetic
   Control → home the machine → set work offset → run.

### 2.3 5-axis demo with TCPC

TCPC (Tool Centre Point Control) lets the controller interpolate XYZ + AB so
the tool tip stays on the programmed surface even as the rotaries swing. The
post enables it via `G43.4 H1` in the prologue.

To verify:

1. Pick **Pocket NC V2-50** (TCPC = ✓ in the picker).
2. Post the demo program — the prologue includes the `G43.4 H1` line.
3. Cross-check in Kinetic Control simulator: program plays without
   "tool too far from surface" warnings.

For Pocket NC V1 / V2-8L without the TCPC upgrade, **un-tick** TCPC in the
post-processor options. The post will emit `G43 H1` (basic length offset)
and won't include rotary-tool compensation.

### 2.4 Reverse-engineer + post (DUO Inventor → NGC)

This tutorial demonstrates the full Suite, not just Pentacad — but Pentacad
is the last step.

1. Follow `docs/tutorials/05-reverse-engineer-duo.md` Steps 1–6 to import the
   DUO project, browse it, and pick a part (e.g. `TrägerWB2.ipt`).
2. Use **Library → Reverse engineer** to synthesise the build sequence.
3. Switch to Pentacad. The active model is now the reverse-engineered part.
4. Add CAM ops (`cam-contour` for the outer profile, `cam-drill` for the
   mount holes).
5. Post and download. Verify in the Kinetic Control simulator.

---

## 3. Software updates

### 3.1 Update channels

| Channel        | What it is                                     | Update via                  |
| -------------- | ---------------------------------------------- | --------------------------- |
| **cyclecad.com** | Public hosted version                        | Auto-updates with each push |
| **Self-host**    | `git clone` of the Suite repo                | `git pull origin main`      |
| **Docker**       | `docker-compose` deploy (`make up`)          | `make rebuild`              |

The Pentacad workspace is a static-HTML app — every page reload pulls the
latest. No service-worker pinning today, so a hard refresh always wins.

### 3.2 Pinned post version

The vendored Fusion 360 post is pinned to:

- **Vendor:** Penta Machine
- **Description:** Penta Machine
- **Revision:** `44221 b726d042f4ff491778a5644fb3dc3d931aa51946`
- **Date:** 2026-04-09 06:41:28
- **Minimum Fusion revision:** 45917

To upgrade: download the latest from Penta Machine → drop it into
`shared/postprocessors/penta-machine.cps` → commit. The browser-side emitter
in `widgets/post-processor.js` is independent and is bumped manually.

### 3.3 Kinetic Control compatibility matrix

| Kinetic Control | Pentacad emitter | Notes                              |
| --------------- | ---------------- | ---------------------------------- |
| ≥ 5.1.0         | full             | M700 popup tool change works       |
| 4.x             | full             | M700 ignored; falls back to T/M6   |
| 3.x             | partial          | TCPC OFF; Pentacad omits `G43.4`   |
| ≤ 2.x           | unsupported      | Use the legacy Fusion post instead |

---

## 4. Troubleshooting

### 4.1 Common errors at post time

| Symptom                                              | Likely cause                                                | Fix                                              |
| ---------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Post button greyed out                               | No active model, or no CAM ops                              | Add at least one CAM op                          |
| Validation panel: `motion #N: X=… outside envelope`  | Toolpath exits machine travel                               | Re-orient stock; check WCS                       |
| Validation: `motion #N: A=… outside [-25, 135]°`     | A-axis swept past the V2-50 limit                           | Use `cam-nav` to flip toolpath orientation       |
| `unknown machine: …`                                 | `setActive(id)` was called with an unknown machine id       | Use `listMachines()` to see valid ids            |
| File downloads with .txt extension                   | Browser MIME guess                                          | Rename to `.ngc` after download                  |

### 4.2 Common errors on the machine

| Symptom                                          | Likely cause                                          | Fix                                          |
| ------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------- |
| Kinetic Control: `out of soft limits`            | Pentacad's envelope catalog is more permissive       | Re-zero, recheck WCS, use the KC simulator   |
| `tool too far from surface` mid-program          | TCPC enabled in post but not on machine               | Disable TCPC in post-processor settings      |
| Machine stops at `M700`                          | Kinetic Control < 5.1.0 doesn't recognise M700        | See compat matrix; fall back to T/M6 only    |
| Z plunge collides with fixture                   | No fixture geometry in simulation                     | Define fixture in cycleCAD before posting    |

### 4.3 Envelope warnings — what they mean

When the post-processor finds a motion that's outside the active machine's
envelope, the validation panel shows it as **error** (red) — the program
will likely abort on the controller.

When the post finds an axis with a vendor note (e.g. Z is tool-dependent
on V2-50), it shows a **warning** (amber) — the program may still run, but
double-check the actual Z reach with the tool you're using.

### 4.4 TCPC misconfiguration

Symptom: program plays in the KC simulator with rotary-tool errors, or the
tool tip wanders during 4+1 ops.

Causes & fixes:

1. **TCPC enabled in post but disabled in machine config.** Open Fusion 360
   Manage → Machine Configuration → Kinematics → uncheck TCP for both rotary
   axes. Or untick TCPC in Pentacad's post options.
2. **Stale tool length offset.** Re-touch the tool, save the new offset,
   reload program.
3. **Wrong A/B work-offset.** Use **Setting Work Offsets** procedure on the
   KCUR wiki: <https://pentamachine.atlassian.net/wiki/spaces/KCUR/pages/2037383169/>

### 4.5 Where to file a bug

- **Pentacad / Suite issues:** <https://github.com/vvlars-cmd/cyclecad-suite/issues>
- **Penta Machine post / firmware:** <https://www.pentamachine.com/support>
- **Kinetic Control software:** see the KCUR wiki [Software Updates](https://pentamachine.atlassian.net/wiki/spaces/KCUR/pages/580976641/Software+Updates) page

---

## 5. G & M code reference

### 5.1 Pentacad's emitted dialect

Pentacad emits **a strict subset** of the codes the official Penta post can
produce. The subset is enough for 95% of typical 3+2 and full-5-axis jobs and
is explicitly chosen to be inspectable by humans.

For the canonical list, the source of truth is:
**[Kinetic Control — G Code Overview](https://pentamachine.atlassian.net/wiki/spaces/KCUR/pages/1774551045/Kinetic+Control+-+G+Code+Overview)**

### 5.2 Code-by-code mapping

| Code   | Meaning                                       | Pentacad emits when                          |
| ------ | --------------------------------------------- | -------------------------------------------- |
| `%`    | Program start / end marker                    | Always (first and last line)                 |
| `O####`| Program number                                | Always (default 1001, configurable)          |
| `G0`   | Rapid move                                    | `kind: 'rapid'` motion record                |
| `G1`   | Linear (feed) move                            | `kind: 'linear'` motion record               |
| `G2`   | Clockwise arc                                 | `kind: 'arc', dir: 'cw'`                     |
| `G3`   | Counter-clockwise arc                         | `kind: 'arc', dir: 'ccw'`                    |
| `G4`   | Dwell                                         | `kind: 'dwell'`                              |
| `G20`  | Inch units                                    | `units: 'inch'`                              |
| `G21`  | Millimetre units                              | `units: 'mm'` (default)                      |
| `G43.4`| Tool length compensation with TCPC            | `tcpc: true` (default)                       |
| `G53`  | Machine coordinate move                       | `kind: 'home'` (G53 G0 Z0; G53 G0 X0 Y0)     |
| `G54`–`G59` | Work coordinate system                   | `kind: 'workCoord'`                          |
| `G90`  | Absolute positioning                          | Prologue                                     |
| `G94`  | Feed per minute                               | Prologue                                     |
| `M3`   | Spindle on, clockwise                         | `kind: 'spindle', mode: 'on', dir: 'cw'`     |
| `M4`   | Spindle on, counter-clockwise                 | `kind: 'spindle', mode: 'on', dir: 'ccw'`    |
| `M5`   | Spindle stop                                  | `kind: 'spindle', mode: 'off'`               |
| `M6`   | Tool change                                   | `kind: 'tool-change'` (after `T#`)           |
| `M7`   | Mist coolant                                  | `kind: 'coolant', mode: 'mist'`              |
| `M8`   | Flood coolant                                 | `kind: 'coolant', mode: 'flood'`             |
| `M9`   | Coolant off                                   | `kind: 'coolant', mode: 'off'`               |
| `M30`  | Program end                                   | `kind: 'end'`                                |
| `M700` | Tool change popup (KC ≥ 5.1.0)                | Always before `M6` when KC supports it       |
| `T#`   | Select tool                                   | `kind: 'tool-change'`                        |
| `S#`   | Spindle RPM                                   | `kind: 'spindle', mode: 'on'`                |
| `F#`   | Feedrate                                      | `linear` or `arc` with `F`                   |
| `H#`   | Tool length offset table index                | `G43.4 H1` in prologue                       |
| `N#`   | Sequence number                               | When `sequenceNumbers: true` (default)       |

### 5.3 Differences from generic LinuxCNC

Pentacad targets the Kinetic Control dialect specifically. Notable
deviations from upstream LinuxCNC:

- **`M700` popup** is unique to KC ≥ 5.1.0. Pentacad always emits it; older
  controllers ignore unknown M-codes.
- **`G43.4` TCPC** uses Penta's tool table convention (H1 = active tool). On
  a generic LinuxCNC, you'd reference `H<tool#>`.
- **No `G64` smoothing** by default. The Fusion post can emit it; the
  browser-side emitter omits it. Add manually in `gcode-editor` if needed.
- **No subroutines (`O… sub … endsub`)** in the browser-side emitter. The
  Fusion post supports them; for now, in-tab programs are linear.

---

## 6. User resources

### 6.1 Help inside the app

- **Help menu → Quick reference (HELP.md)** — keyboard shortcuts, every
  menu, every action
- **Help menu → Tutorials → 01..06** — the in-suite walkthroughs, opening
  in a new tab
- **Help → Show help panel** — slide-in panel with Library + this manual
  table of contents

### 6.2 In-suite tutorials

| Tutorial | Topic |
|----------|-------|
| `01-quickstart.md`              | 10-minute first-launch walkthrough |
| `02-build-a-widget.md`          | Ship a widget in 30 minutes |
| `03-token-economy.md`           | Watch the meter charge in action |
| `04-admin-dashboard.md`         | Operator workflows |
| `05-reverse-engineer-duo.md`    | Inventor → work package |
| `06-ai-agent-driven-build.md`   | Drive the suite via REST / MCP |

### 6.3 Token economy ($CYCLE) and CAM ops

Every Pentacad operation is metered. Charges follow the Claude-style model
documented in `docs/TOKEN-ENGINE.md`:

```
charge = (tokensIn × rate_in[tier]) + (tokensOut × rate_out[tier])
       × (cache_hit ? 0.9 : 1)
       × (batchSize ≥ 10 ? 0.5 : batchSize ≥ 2 ? 0.75 : 1)
```

Typical Pentacad costs:

| Operation              | Tier   | Notes                                |
| ---------------------- | ------ | ------------------------------------ |
| Pick machine           | haiku  | Cheap; includes envelope render      |
| Generate CAM op        | sonnet | Toolpath synthesis                   |
| Post-process to NGC    | haiku  | Per-line + per-motion charges        |
| Simulate toolpath      | sonnet | Heavy 3D                             |
| FEA / analysis on op   | opus   | Reserved for full-physics simulation |

Admin-key holders bypass charges (`localStorage.cyclecad.adminKey =
'rk_dev_local'` in dev). See `docs/ADMIN-GUIDE.md`.

### 6.4 Where to next

- **Live the full DUO build:** `docs/tutorials/05-reverse-engineer-duo.md`
- **Drive Pentacad from an AI agent:** `scripts/AGENT-RUNBOOK.md` +
  `demos/transcripts/03-section-and-pdf.md`
- **Deploy Pentacad on cyclecad.com:** `DEPLOYMENT-CYCLECAD-COM.md`
- **Penta Machine canonical docs:** <https://pentamachine.atlassian.net/wiki/spaces/KCUR>
- **Penta Machine vendor:** <https://www.pentamachine.com/>

---

## Appendix A — Catalog ground truth

Snippet from `shared/machines/penta.json` (V2-50, sourced from Matt @ Penta
Machine on 2026-04-27):

```json
{
  "id": "v2-50",
  "name": "Pocket NC V2-50",
  "envelope": {
    "X": { "travel_in": 4.55, "travel_mm": 115.5, "min_in": -2.00, "max_in":  2.55 },
    "Y": { "travel_in": 5.00, "travel_mm": 128.3, "min_in": -2.50, "max_in":  2.50 },
    "Z": { "travel_in": 3.55, "travel_mm":  90.1, "note": "tool/holder/spindle dependent" },
    "A": { "min_deg":  -25, "max_deg":   135, "kind": "limited" },
    "B": { "min_deg": -9999, "max_deg":  9999, "kind": "continuous" }
  },
  "spindle": { "max_rpm": 10000, "taper": "ER11" },
  "feedrate": { "max_xy_mm_min": 1500, "max_z_mm_min": 1000, "max_a_deg_min": 6000, "max_b_deg_min": 36000 }
}
```

Other models ship as `envelope: "see-vendor"` until their official spec
sheets land. **Pentacad refuses to fabricate axis limits.**

---

## Appendix B — How this manual was written

This manual mirrors the [Kinetic Control User Resources](https://pentamachine.atlassian.net/wiki/spaces/KCUR/overview)
top-level structure:

| KCUR section          | Pentacad section                          |
| --------------------- | ----------------------------------------- |
| Manuals & Instructions | §1 Manuals & Instructions                |
| Tutorials             | §2 Tutorials                              |
| Software Updates      | §3 Software Updates                       |
| Troubleshooting       | §4 Troubleshooting                        |
| User Resources        | §6 User resources                         |
| (G Code Overview)     | §5 G & M code reference (with deep-link to KCUR) |

When a Pentacad section claims something Kinetic Control says differently,
**file a bug** — we want both manuals to converge.
