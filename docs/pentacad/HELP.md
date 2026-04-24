# Pentacad — Help Guide

> Version 1.0.0 · Quick reference for operators and developers

This is the user-facing help. For the system architecture see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For step-by-step walkthroughs see [`tutorials/`](./tutorials/).

---

## Contents

1. [Workspaces at a glance](#workspaces-at-a-glance)
2. [Machine tab — connecting to a Pentamachine](#machine-tab)
3. [Design tab — preparing the model](#design-tab)
4. [CAM tab — creating operations](#cam-tab)
5. [Simulate tab — verify before you cut](#simulate-tab)
6. [Production tab — run the job](#production-tab)
7. [Standalone simulator (pentacad-sim.html)](#standalone-simulator)
8. [Keyboard shortcuts](#keyboard-shortcuts)
9. [Supported G-code and M-code](#supported-g-code-and-m-code)
10. [Common errors and fixes](#common-errors-and-fixes)
11. [FAQ](#faq)

---

## Workspaces at a glance

Pentacad has five workspaces, each a tab along the top of `/app/pentacad.html`:

| Tab | When to use it |
|---|---|
| **Machine** | First thing you do in a session — pick a machine, connect to hardware. |
| **Design** | Import or reference the cycleCAD model and define stock + WCS. |
| **CAM** | Add toolpath operations (pocket, drill, face, etc.), generate G-code. |
| **Simulate** | Play the generated G-code against the machine's kinematics. Find problems here, not at the machine. |
| **Production** | Big DRO, gauges, CYCLE/START, FEED HOLD. This is what you look at while the machine runs. Matches the real Kinetic Control pendant UI. |

The tabs are independent — the simulator will run G-code even without a machine selected; the Production tab will show DRO without a model loaded. You can work in any order.

---

## Machine tab

### Pick a machine
Select from V1 / V2-10 / V2-50 / Solo. The envelope, spindle range, and default stock update automatically.

### USB auto-detect
Pentamachine ships with BeagleBone Black configured as a USB Ethernet gadget. Plug the USB cable from the BeagleBone into your computer and click one of:

- **macOS gadget** — tries `192.168.6.2` (the subnet macOS assigns to USB gadgets).
- **Linux/Win gadget** — tries `192.168.7.2`.
- **Scan** — probes the full 192.168.x.2 range (can take 10–15 seconds).

### Connect to Rockhopper
Rockhopper is the WebSocket API shipped on every Pentamachine. Default credentials are `default` / `default` — change these on the machine's web UI on first boot.

URL format: `ws://<machine-ip>:8000/websocket/`. The subprotocol string `linuxcnc` is added automatically.

### Fetch machine GLB
Each Pentamachine has a 3D model (`v2-50.glb`, etc.) in `/opt/penta-ui-builds/gltf/`. Click "Fetch from connected machine" to pull it over HTTP and use it as the viewport visual. Blob-cached so it only downloads once per session.

### Bridge state indicator
The small dot in the status bar:
- **Grey** — disconnected
- **Green (steady)** — connected and idle
- **Green (pulsing)** — streaming G-code
- **Amber** — feed hold or M0 pause
- **Red** — error or e-stop active

---

## Design tab

### Import model
Pentacad reuses cycleCAD's model import: STEP (.step/.stp), STL, Fusion 360 .f3d, Inventor .ipt/.iam, glTF. Files over 80 MB route through the server-side converter (`server/converter.py`).

### Define stock
Stock is a bounding box around the part. You can:
- Let Pentacad pick automatically (adds 2 mm padding to the model's bbox).
- Specify X/Y/Z extents manually.
- Pick one of the per-machine presets (3″ × 2″ × 1″ for V2-50, 2″ × 1.5″ × 0.75″ for V2-10, etc.).

### Work coordinate system (WCS)
Default is G54 at the model origin. You can place the WCS at any vertex, face centre, or edge midpoint. Pentacad writes the WCS origin into the post-processor header.

---

## CAM tab

Sidebar on the left has **Setup 1** as the active card. Each setup is a fixturing + WCS combo. Click **+ Add operation** to pick a strategy.

### Available strategies (Phase 1A + 1B)

| Strategy | What it does | Typical use |
|---|---|---|
| **Face** | Raster-plane skim on the top surface | Clean up stock top before the real work starts |
| **2D Contour** | Follow the edge of a closed region | Profile cuts, cutouts |
| **Pocket** | Remove material inside a closed region with offset rings | Cover plates, housings |
| **Adaptive Clear** | Concentric-ring roughing with constant engagement (approximation) | Heavy material removal, extends tool life |
| **Drill** | G83 peck or G73 chip-break cycles | Bolt holes, dowel holes |
| **Chamfer / Deburr** | V-bit engagement-depth math | Break sharp edges |
| **Bore / Thread-mill** | Straight bore, helix-bore, or thread-mill helical interp | Precision holes, tapped holes |

### Per-operation params
- Tool (from machine tool library or custom)
- Stepover (as % of tool Ø)
- Stepdown (mm or inch)
- Finish allowance
- Cut direction (climb / conventional)
- Lead-in / lead-out style
- Feeds/speeds (auto from the 12-entry lookup table, or override)

### Generate toolpath
Click **Generate**. Toolpath appears as coloured lines in the viewport: green = feed, dashed grey = rapid. Below the viewport: move count, total distance, estimated time.

### Post-to-G-code
Click **Post-to-G-code**. Pentacad runs the post-processor and downloads a `.ngc` file. A "Posted summary" card shows lines / moves / distance / time and gives a direct **Run** button if a machine is connected.

---

## Simulate tab

### Loading the program
The Simulate tab auto-loads whatever CAM posted most recently. You can also drag-drop any `.ngc`/`.nc`/`.gcode` file or click **Open** to use a file picker.

### Viewport
- **Green lines** — feed moves (G1/G2/G3)
- **Dashed grey lines** — rapid moves (G0) — toggle with the "Rapid moves" visibility button
- **Small green sphere** — current tool position
- **Amber outline box** — stock remaining (visual hint, not a full material-removal sim)

### Playback controls (bottom of viewport)
- **⏮ Stop** — reset to beginning, pause
- **▶/⏸ Play** — play or pause (Space)
- **⏭ Step** — advance one move (→)
- **Timeline scrubber** — drag to any point in the program
- **Speed chip** — 0.25× to 50×

### Side-panel tabs
- **DRO** — live X/Y/Z/A/B readout, active modal state (G17/G20/G90/G94/G54), feed, RPM, tool, coolant.
- **Stats** — total moves, rapid vs. feed, tool changes, distances, estimated time, per-axis envelope used.
- **Limits** — soft-limit check per axis. Green ✓ if the program stays within the envelope; red ⚠ with count of violations otherwise.
- **Issues** — parser errors, envelope violations, missing spindle-on, missing program-end. Empty list means "looks clean".

### Soft-limit check details
The limit check compares every executed move's `to` position against the machine envelope from the JSON. It runs once after the executor finishes, not at playback time — the verdict is available before you press Play.

It catches:
- Over-travel on X/Y/Z (linear axis past `min`/`max`)
- A-axis out of range (unless rotary is marked `continuous`)
- B-axis out of range (continuous B-rotary is never a violation)

It does NOT currently catch:
- Collisions with the stock itself (we'd need a material-removal sim for that)
- Collisions with fixtures (no fixture model is loaded by default)
- Spindle-holder collisions at extreme A tilts (no tool-length or Z-stackup check yet)

---

## Production tab

Matches the real Kinetic Control pendant layout.

### DRO (big readout)
X/Y/Z in inches, A/B in degrees. Updates at 30 Hz from the Rockhopper watch stream. The readout is position-only — **machine position**, not **tool tip** (the tool tip differs by tool length; use the Simulate tab if you need tool tip in WCS).

### Circular gauges
- **Spindle** — RPM vs. commanded. Fills green.
- **Feed** — actual feed-rate vs. commanded, as percentage.

### Control panel
- **CYCLE / START** — run the loaded program. Disabled if no program is loaded or machine not homed.
- **FEED HOLD** — pause motion. Spindle keeps spinning. Click again to resume.
- **STEP** — single-step mode for dry-running a program line at a time.
- **Optional Stop** (checkbox) — honour M1 pauses.
- **Sliders:**
  - *Max Velocity* — overall velocity scaling 0–120 %.
  - *Max Rapid* — G0 speed 0–120 %.
  - *Feed Rate* — G1 feed override 0–200 %.
  - *Spindle Rate* — S-command override 0–150 %.

Sliders send to `halui.*.direct-value` pins via Rockhopper's `put` command. Changes take effect immediately.

### Status bar
Running timer · current block/line · connection dot · alert pills if anything needs attention (over-travel, spindle fault, coolant low, etc.).

### RESET
Amber button at the top-right of the status bar. Clears soft errors and returns the machine to idle. For hardware e-stops you need the physical red button on the enclosure.

---

## Standalone simulator

`/app/pentacad-sim.html` is a dedicated simulator — no workspace tabs, no machine control, just G-code → 3D playback. Designed to work offline (no server needed — open it from `file://`).

### Three-panel layout
- **Left** — syntax-highlighted G-code editor. Current line highlights in green. Parse errors flash red.
- **Centre** — 3D viewport with machine proxy, stock, tool, and toolpath.
- **Right** — tabbed DRO / Stats / Limits / Issues.

### Loading programs
- **Drag-drop** any `.nc`/`.ngc`/`.gcode`/`.tap` onto the page.
- **Open button** in the top bar.
- **Examples** — 7 pre-built samples (face-mill, pocket+drill, bottle-opener-ring, thread-mill, adaptive, 3+2 indexing, deliberate limit-violation test).
- **Shareable URL** — click 🔗 to copy a link that includes the G-code in the hash.

### Machine picker (top bar)
Switch between V1 / V2-10 / V2-50 / Solo. Envelope + stock preset change automatically. The previously-loaded program is re-checked against the new envelope.

### Visibility toggles (viewport top-right)
Machine · Stock · Toolpath · Rapid moves · Grid · Axes · Origin. Each can be toggled independently.

---

## Keyboard shortcuts

### Global (any Pentacad page)
| Shortcut | Action |
|---|---|
| `F1` | Open this help |
| `Cmd/Ctrl + O` | Open G-code file |
| `Cmd/Ctrl + E` | Examples |
| `Cmd/Ctrl + S` | Download current G-code |
| `Esc` | Close any modal |

### Simulator
| Shortcut | Action |
|---|---|
| `Space` | Play / pause |
| `→` | Step one move forward |
| `←` | Step one move back |
| `Home` | Jump to start |
| `End` | Jump to end |
| `F` | Fit camera to model |
| `R` | Reset camera (isometric) |
| `1` | Front view |
| `3` | Right view |
| `7` | Top view |
| `+` / `-` | Speed up / slow down |

### CAM workspace
| Shortcut | Action |
|---|---|
| `G` | Generate toolpath for active op |
| `P` | Post-to-G-code |
| `N` | New operation |
| `Del` | Delete selected operation |

---

## Supported G-code and M-code

### Motion
| Code | Meaning |
|---|---|
| `G0` | Rapid (linear interpolation, machine rapid speed) |
| `G1` | Feed linear |
| `G2 / G3` | Arc CW / CCW. Accepts I/J/K (centre offsets) or R (radius). |
| `G28` | Go home via intermediate waypoint |
| `G38.2` | Probe toward workpiece (error on no-contact) |

### Modal — distance
| Code | Meaning |
|---|---|
| `G90` | Absolute (default) |
| `G91` | Incremental |

### Modal — feed
| Code | Meaning |
|---|---|
| `G93` | Inverse-time — F = 1 / (move-time-in-minutes). **Required when A or B changes** per Pentamachine dialect. |
| `G94` | Units per minute (default) |
| `G95` | Per rev |

### Modal — plane
| Code | Meaning |
|---|---|
| `G17` | XY (default) |
| `G18` | XZ |
| `G19` | YZ |

### Modal — units
| Code | Meaning |
|---|---|
| `G20` | Inch (Pentamachine default) |
| `G21` | Millimetre |

### Modal — WCS
`G54 G55 G56 G57 G58 G59` — six work coordinate systems.

### Canned cycles
| Code | Meaning |
|---|---|
| `G81` | Simple drill (feed down → retract) |
| `G82` | Drill with dwell at bottom |
| `G83` | Peck drill — retract to R-plane between pecks |
| `G73` | Chip-break — retract slightly between pecks (faster than G83) |
| `G80` | Cancel canned cycle |

### M-codes
| Code | Meaning |
|---|---|
| `M0` | Unconditional pause (operator must press resume) |
| `M1` | Optional pause (ignored unless "Optional Stop" is enabled) |
| `M2` | End of program |
| `M3 / M4` | Spindle on CW / CCW |
| `M5` | Spindle off |
| `M6` | Tool change |
| `M7` | Coolant mist on |
| `M8` | Coolant flood on |
| `M9` | Coolant off |
| `M30` | End of program + rewind |

### Arguments supported
- `X Y Z A B C` — axis targets
- `I J K` — arc centre offsets
- `R` — arc radius (canned-cycle retract plane)
- `P` — dwell time, or parameter for some codes
- `Q` — peck depth (G83)
- `F` — feed rate
- `S` — spindle RPM
- `T` — tool number
- `N` — line number
- `L` — loop count (for some canned cycles)

### Not yet supported (parser warns, execution continues)
- `G41 / G42` — cutter radius compensation (we do comp in post)
- `G43 / G49` — tool-length offset (tool length is in machine JSON)
- `G76` — tapping cycle
- `G84` — right-hand tapping
- Macros, O-words, named parameters (`#<var>`)

---

## Common errors and fixes

### "pentacad-sim.js not loaded"
The simulator page couldn't find `/app/js/modules/pentacad-sim.js`. Either serve from a proper HTTP server (`python3 -m http.server 8000` in the repo root) or make sure you're opening `app/pentacad-sim.html` not a copy from Downloads.

### "WebSocket closed: code 1006"
Rockhopper rejected the connection. Most likely causes:
1. **Wrong subprotocol.** Must be `'linuxcnc'`. The client adds this automatically — if you're calling raw, check your `new WebSocket(url, ['linuxcnc'])` call.
2. **CORS origin check.** Serving Pentacad from `cyclecad.com` when connecting to a Pentamachine? Rockhopper's hardcoded regex allows only `*.pocketnc.com`. Serve from `localhost` or patch the regex on the machine.
3. **Machine off.** Check the IP with `ping`. Verify Rockhopper is running: `ssh machine && sudo systemctl status rockhopper`.

### "Login failed: ?ERR unknown_user"
Default credentials are `default` / `default`. If someone changed them on the machine's web UI, they're in `/var/opt/pocketnc/userdict`. Ask Matt or the shop owner.

### Soft-limit check: "42 violations"
Your program wants to move outside the machine envelope. Click the Limits tab to see which axis, then look at the specific lines in the G-code editor (the violating lines are highlighted red). Most common cause: wrong WCS origin in the CAM setup, or CAM stock was bigger than what the machine can actually reach.

### G-code runs in simulator but machine never starts
Check the Production tab status bar. If it says "not homed", click the Home button (homes all axes sequentially — takes 30–60 s). Rockhopper refuses to start a program on an un-homed machine.

### Feed override slider has no effect
You probably used `halui.feed-override.value` somewhere in your custom code — that pin is read-only. Use `halui.feed-override.direct-value`. The bundled `rockhopper-client.js` does this correctly.

### "Module not found: pentacad" when loading in another page
`app/js/modules/pentacad.js` sets `window.CycleCAD.Pentacad` via an IIFE. It must be loaded **after** three.js (or without three.js — it's optional) but **before** any code that uses `window.CycleCAD.Pentacad`. Load order matters; use `<script src="./js/modules/pentacad.js"></script>` in the `<head>` not deferred.

### STEP file > 100 MB hangs the browser
The WASM STEP importer has a 2 GB memory limit and practical failure point around 100 MB. Route through the server-side converter: set `localStorage.setItem('ev_converter_url', 'http://localhost:8787')` then retry. The converter runs CadQuery / OCP server-side and returns a GLB.

### Safari private window — "Your changes will be lost"
Safari aggressively caches. Pentacad sets `Cache-Control: no-cache, no-store, must-revalidate` headers but Safari sometimes ignores them. Workaround: add `?v=<timestamp>` to the URL, or open in a fresh private window, or use the "Hard Reset" button in the Help menu (clears Service Worker + Cache API + localStorage + IndexedDB + sessionStorage + OPFS).

---

## FAQ

### Is Pentacad a Fusion 360 replacement?
For 2D + 2.5D + 3+2 indexed work on a Pentamachine — yes. For 3D free-form surface machining on arbitrary machines — no. That's the Phase 3 roadmap, and even then the goal is not Fusion parity but "run Pentamachine jobs end-to-end in a browser".

### Does it run offline?
The simulator does — `app/pentacad-sim.html` is fully offline-capable once loaded. The CAM module does too. Only the machine-control part needs a network connection to the machine.

### Can I use Pentacad with a non-Pentamachine CNC?
The simulator works with any G-code if you give it a `kinematics.json` for your machine. The CAM module's post-processor emits Pentamachine-V2 dialect only right now. Adding another dialect is a ~300-line extension in `pentacad-cam.js:emitGCode()`.

### Is it safe to run Pentacad-generated G-code on my machine?
Pentacad always runs the simulator + soft-limit check before exposing the Run button. If the check fails, the Run button is disabled. That said, soft-limit check does not yet detect fixture collisions or tool-holder crashes at extreme A angles. Always air-cut a new program first.

### Where does my G-code go?
Nowhere. The simulator parses it in-process. Rockhopper uploads happen over your own LAN to your own machine. Pentacad does not phone home.

### Can I script it from an LLM agent?
Yes. Every action is exposed via `window.CycleCAD.Pentacad.execute(command, params) → {ok, data, error}`. Get the full schema with `getSchema()`. Agents have the same capability surface as a human operator — including the 2-second friction on hardware actions (they must authenticate with Rockhopper just like a person would).

### How do I change the machine's credentials?
The Pentamachine's built-in web UI at `http://<machine-ip>/` has a user-management page. Pentacad respects whatever `default` password you set there.

### How do I back up my CAM setups?
File → Save in the CAM tab downloads a `.cyclecad.json` file with model reference, setups, operations, and feeds/speeds. Versioned, human-readable, diff-able.

### I'm seeing jitter / jumpy DRO at 50 Hz.
`rockhopper-client.js` paints at 30 Hz (every other wire update averaged) to stay below 60 fps. If you're still seeing jitter, the machine's network is probably lossy — check for WiFi interference or switch to Ethernet.

### Does AGPL mean I can't use Pentacad commercially?
No. You can use it commercially. AGPL just means if you modify it and host it as a network service for others, you have to make your modifications available. For most shops running Pentacad on their own machines for their own jobs, AGPL has no practical effect. For CNC OEMs wanting to bundle Pentacad, a commercial license is available.

---

## Getting support

- **Docs** — you're reading them. Also see `tutorials/` for step-by-step walkthroughs.
- **GitHub issues** — [github.com/vvlars-cmd/cyclecad/issues](https://github.com/vvlars-cmd/cyclecad/issues)
- **Email** — vvlars@googlemail.com
- **LinkedIn** — [linkedin.com/in/sachinkumar](https://linkedin.com/in/sachinkumar) (DMs open)
