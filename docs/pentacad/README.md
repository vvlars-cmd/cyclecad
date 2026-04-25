# Pentacad — Browser-native 5-axis CAM

Pentacad is the CAM stage of the cycleCAD Suite. It takes a cycleCAD model, generates 3+2 toolpaths tuned to the Pentamachine V2 kinematics, simulates the whole job with A/B-axis forward kinematics, posts to the exact Pentamachine `.ngc` dialect, and streams G-code to a Kinetic Control box over WebSocket.

All in one browser tab. Open-source, AGPL-3.0.

## What is Kinetic Control?

**Confirmed from the v5.8.4 disk image (build 2025-04-01):**

- **Hardware**: BeagleBone Black (BBB) running Debian Buster
- **Software**: LinuxCNC (the `emcapplication` fork maintained by pocketnc / Pentamachine)
- **Source**: <https://bitbucket.org/pocketnc/kinetic-control>
- **Install root**: `/opt/source/pocketnc/emcapplication/`
- **Pentamachine UI**: `/opt/penta-ui-builds/`
- **Machine 3D models** (GLB): `/opt/penta-ui-builds/gltf/v2-10.glb` and `v2-50.glb` — we'd love to bundle these in the Pentacad viewport with Matt's permission
- **Author**: John Allwine <john@pentamachine.com>

Pentacad talks to Kinetic Control via the `pentabridge` Python daemon (see below), which translates the WebSocket protocol to standard LinuxCNC `halui.*` pins. Every pin name in `pentabridge.py` was confirmed against the halui list extracted from the v5.8.4 image.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Pentacad (browser)                        │
│                                                                  │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐  │
│   │ pentacad │──▶│ pentacad │──▶│ pentacad │──▶│  pentacad-   │  │
│   │   .js    │   │  -cam.js │   │  -sim.js │   │  bridge.js   │  │
│   │ (coord)  │   │ strategies│  │  parser  │   │   WS client   │  │
│   │          │   │ + post   │   │ + kinems │   │               │  │
│   └──────────┘   └──────────┘   └──────────┘   └──────┬───────┘  │
└────────────────────────────────────────────────────────│──────────┘
                                                 WebSocket (JSON)
                                                         │
                                                         ▼
                                         ┌──────────────────────────┐
                                         │ pentabridge.py (Python)  │
                                         │ ~350 lines,  LAN daemon  │
                                         │ halcmd/MDI bridge        │
                                         └───────┬──────────────────┘
                                                 │ IPC
                                                 ▼
                                      ┌───────────────────────────┐
                                      │ Kinetic Control           │
                                      │ (LinuxCNC + HAL)          │
                                      │ Pentamachine V2 hardware  │
                                      └───────────────────────────┘
```

## Modules

| File | Lines | Purpose |
|------|-------|---------|
| `app/js/modules/pentacad.js` | ~245 | Coordinator, machine loader, UI mount point |
| `app/js/modules/pentacad-cam.js` | 897 | 12 CAM strategies (4 real, 8 stubs) + Pentamachine V2 post |
| `app/js/modules/pentacad-sim.js` | 1033 | G-code parser, modal executor, A/B kinematics, soft-limit, Three.js animation |
| `app/js/modules/pentacad-bridge.js` | 530 | WS client, JSON-RPC protocol, reconnect, streaming, mock mode |
| `app/pentacad.html` | 1445 | Workspace UI with 5 tabs (Machine / Design / CAM / Simulate / Control) |
| `server/pentabridge.py` | 350 | Reference Python daemon for the machine side |
| `server/pentabridge.service` | 27 | systemd unit file |
| `machines/v2-10/kinematics.json` | 70 | V2-10 machine definition |
| `machines/v2-50-chb/kinematics.json` | 95 | V2-50CHB machine definition (standard head) |
| `machines/v2-50-chk/kinematics.json` | 90 | V2-50CHK machine definition (K-frame + probe) |
| `machines/index.json` | 30 | Machine registry (machine picker reads this) |
| `docs/pentacad/bridge-protocol.md` | ~130 | Full protocol spec |
| `docs/pentacad/README.md` | This file | |

## Quick start (browser demo)

1. Load `cyclecad.com/app/pentacad.html` — auto-loads the V2-50CHB machine + a demo bottle-opener-ring pocket operation.
2. Click **Simulate** tab → **Play**. Toolpath animates with A/B axis rotation.
3. Click **Control** tab → **Post** to download a real `.ngc` file.
4. Optional: run `pentabridge --mock` locally and click **Connect**. DRO + stream work over fake-WS — no hardware needed.

## Quick start (real hardware)

On the Pentamachine controller box (running Kinetic Control / LinuxCNC):

```bash
# Install deps
sudo apt install python3-pip
sudo pip3 install websockets

# Install bridge
sudo cp server/pentabridge.py /usr/local/bin/pentabridge
sudo chmod +x /usr/local/bin/pentabridge
sudo cp server/pentabridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pentabridge

# Check it's running
systemctl status pentabridge
sudo journalctl -u pentabridge -f
```

In the browser on any LAN device, open `cyclecad.com/app/pentacad.html`, go to **Control** → enter `ws://<controller-ip>:7777` → **Connect**. DRO starts updating, stream/jog/probe work.

## CAM strategies — Phase 1A + 1B status

| Strategy | Status | Notes |
|----------|--------|-------|
| 2D Contour | ✅ real (1A) | Offset polygon + lead-in ramp + per-Z stepdown |
| Adaptive Clear | ✅ real (1B) | Concentric-ring approximation (stepover-based). True trochoidal arcs = Phase 2. |
| Pocket | ✅ real (1A) | Zig-zag scanlines, multi-island ready |
| Drill | ✅ real (1A) | G83 / G73 peck cycles emitted as explicit moves |
| Parallel | 🚧 stub | Phase 2 |
| Radial | 🚧 stub | Phase 2 |
| Scallop | 🚧 stub | Phase 2 |
| Projection | 🚧 stub | Phase 2 |
| Flow | 🚧 stub | Phase 2 |
| Bore / Thread | ✅ real (1B) | 3 modes: straight bore (exact Ø), helix-bore (oversize), thread-mill (configurable pitch) |
| Chamfer / Deburr | ✅ real (1B) | V-bit or ball edge-follow at computed engagement depth |
| Face | ✅ real (1A) | Stock-top surfacing, zig-zag |

## Simulator — Phase 1A status

- ✅ Full G-code parser: N-numbers, `(...)` and `;` comments, block-delete `/`, multi-word lines, decimal-only values
- ✅ Modal state machine: G20/G21 units, G90/G91 distance, G17/18/19 plane, G54–G59 WCS, G93 inverse-time, G94 per-minute, G28 home
- ✅ Forward kinematics: A-tilt + B-rotary table chain `T_aToTable · R_A · T_bToA · R_B`
- ✅ Soft-limit check per axis with detailed violation report
- ✅ Three.js animation helper with play/pause/seek/stop
- 🚧 Stock-removal rendering — Phase 2 (shows toolpath lines only right now)
- 🚧 Collision detection against fixtures — Phase 2

## Bridge — Phase 1A status

- ✅ JSON-over-WebSocket protocol v1.0 (see `bridge-protocol.md`)
- ✅ All 14 ops: ping / jog / home / stream-line / pause / resume / abort / mdi / feedOverride / spindleOverride / coolant / probe / clearEstop
- ✅ All 9 events: dro / spindle / line / complete / alarm / estop / probe / tool-change / coolant
- ✅ Auto-reconnect with exponential backoff (1s → 30s cap)
- ✅ Streaming flow control with 8-line window
- ✅ Resume-on-reconnect (re-sends from last acked line)
- ✅ Mock mode for dev without hardware
- ✅ Reference Python daemon

## Testing

Each module self-tests on load:

```
[pentacad-cam:selftest] overall: PASS (12/12)
[pentacad-sim:selftest] overall: PASS (11/11)
[pentacad-bridge:selftest] overall: PASS (6/6)
```

End-to-end smoke test (from `/tmp/pentacad-e2e.js`):

```
pocket 40×30mm → 210 toolpath points
emitGCode → 220 lines of valid Pentamachine V2 .ngc
parseGCode → 220 lines, 0 errors
exec.run → 208 moves
summariseMoves → 4105mm total, 6.14 min @ default feeds
checkSoftLimits → PASS
```

## Licensing

- **Pentacad** is AGPL-3.0 (commercial dual-license available).
- The browser client is free for non-commercial + open-source use.
- Production shops using Pentacad in a proprietary toolchain need a commercial license. Contact sachin.kumar@cyclewash.com.
- `pentabridge.py` is AGPL-3.0.
- Machine JSONs are CC-BY.

## Known gaps / future work

- **Real Pentamachine kinematics JSON values** — current values are estimated from Matt's marketing kit. Mark `"_confirmed": true` field-by-field as he confirms each measurement.
- **Tool-length probing cycle** — Phase 1B. Issued today as raw MDI via `mdi("G38.2 Z-2 F2")`.
- **Stock-removal rendering** — Phase 2.
- **Adaptive clearing** — trochoidal material removal is its own planner; Phase 1B.
- **5-axis finishing strategies** — scallop / projection / flow — Phase 2, require a surface-sampling approach.
- **Kinetic Control HAL inspection** — the 900MB `.img.xz` Matt shipped includes the exact HAL + INI + Python lib layout. Extract it (needs >4GB disk) to confirm the `halcmd` / `linuxcncrsh` pipe names the bridge actually needs.

## Handoff

This doc + the files listed above are the Phase 1A delivery. The next agent picking this up should:
1. Extract the `kinetic-control-v5.8.4` disk image on a machine with more disk space.
2. Walk `/home/pmc/linuxcnc/configs/` for real INI/HAL.
3. Confirm the halcmd pin names used by `pentabridge.py` (currently educated guesses: `halui.axis.<axis>.pos-feedback`, `halui.machine.is-on`, `halui.program.pause`, etc.).
4. Run the Python daemon in `--mock` mode first, then drop it on a real controller.
5. Phase 1B pick: Adaptive clearing + Bore/Thread + Chamfer.
