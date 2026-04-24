# Kinetic Control v5.8.4 — Confirmed Facts

Extracted from the `kinetic-control-v5.8.4-20250401-bbb.img` disk image on 2026-04-24, plus the public GitHub repos of the same codebase.

Raw dump (`kc-dump.txt`, 7.6 MB) is gitignored — re-generate with the commands in `HANDOFF-2026-04-24-session-3.md` if needed.

## The big discovery: Rockhopper already does what we were building

Kinetic Control ships **Rockhopper**, a Tornado-based WebSocket server that exposes the full LinuxCNC API over JSON. It's been around since the original Pocket NC (2013). Pentacad doesn't need to install anything on the machine — it just connects to `ws://<machine>:8000/websocket/` and speaks the protocol.

**This replaces `pentabridge.py` as the primary integration path.** We keep `pentabridge.py` as a fallback for non-Rockhopper LinuxCNC setups, but Pentamachine owners get zero-install.

### Rockhopper source

- Repo: **https://github.com/PocketNC/Rockhopper**
- Main file: `LinuxCNCWebSktSvr.py` (~3000 lines, 150+ status items, 50+ commands)
- License: GPL-3.0-or-later

### Protocol (WebSocket + JSON)

| Phase | Message shape | Notes |
|---|---|---|
| Connect | `new WebSocket(url, ['linuxcnc'])` | Subprotocol `linuxcnc` is REQUIRED. Empty string also accepted. |
| Login | `{id, user, password, date?}` | No `command` field. Server MD5s the password and compares against userdict. |
| After login | `{id, command, name, ...params}` | `command` ∈ `get`/`watch`/`unwatch`/`put`/`list_get`/`list_put`. Params are flat at top level. |
| Reply | `{id, code, data}` | `code` is always a `?OK`/`?ERR`/`?...` token, never a numeric status. |
| Push | `{id, code: '?OK', name, data}` | Unsolicited status updates for watched items. |

### Status items (subset — 150+ total)

| Name | Type | Purpose |
|---|---|---|
| `actual_position` | float[9] | X Y Z A B C U V W in machine units |
| `task_state` | int | 1=estop, 2=estop_reset, 3=off, 4=on |
| `task_mode` | int | 1=manual, 2=auto, 3=mdi |
| `exec_state` | int | 1..10 (error, done, waiting-for-*) |
| `estop` | int | 0/1 |
| `homed` | int[] | per-joint 0/1 |
| `feedrate` | float | override factor |
| `tool_in_spindle` | int | tool ID |
| `ini_filename` | string | active .ini path |
| `file` | string | loaded program |

### Command items (subset — 50+ total)

| Name | Params | Purpose |
|---|---|---|
| `mdi` | `{mdi: string}` | One-line G-code via MDI |
| `mode` | `{mode: 'MODE_AUTO'/'MODE_MANUAL'/'MODE_MDI'}` | Switch control mode |
| `state` | `{state: 'STATE_ESTOP'/'STATE_ESTOP_RESET'/'STATE_ON'/'STATE_OFF'}` | Task state |
| `jog` | `{jog: 'JOG_INCREMENT'/'JOG_CONTINUOUS'/'JOG_STOP', axis: int, velocity?, distance?}` | Jog one joint |
| `home` / `unhome` | `{axis: int}` | Home/unhome one joint (0..N) |
| `feedrate` | `{rate: float}` | Feed override |
| `spindle` | `{spindle: 'SPINDLE_FORWARD'/...}` | Spindle direction |
| `flood` / `mist` | `{onoff: 'FLOOD_ON'/'FLOOD_OFF'}` | Coolant |
| `abort` | `{}` | Stop task |
| `auto` | `{auto: 'AUTO_RUN'/'AUTO_STEP'/'AUTO_PAUSE'/'AUTO_RESUME', run_from?: int}` | Auto-mode control |
| `program_open` | `{filename: string}` | Open NGC file |
| `program_upload_chunk` | `{filename, data, start, end, ovw}` | Chunked upload |

### Default credentials

- User: `default`
- Password: `default`
- MD5 hash stored in `/var/opt/pocketnc/Rockhopper/userdict` (or similar — set by AddUser.py)

### CORS restriction (important!)

Rockhopper has a hardcoded CORS origin regex:
```python
originRE = re.compile("https?://([a-z0-9]+\.)?pocketnc.com")
```
Pentacad served from `cyclecad.com` will be REJECTED at origin-check time. Three workarounds:

1. **Patch Rockhopper** — tiny PR to PocketNC/Rockhopper adding our origins, or local sed on the shop's copy.
2. **nginx reverse-proxy** on the machine that strips the `Origin` header.
3. **Run Pentacad from localhost** — empty Origin is allowed.

We document this in `docs/pentacad/rockhopper-notes.md` for shops setting up the integration.

## Real Pentamachine product line (confirmed)

The earlier session drafts invented "V2-50CHB" and "V2-50CHK" sub-variants. Those DO NOT exist. The actual product line is:

| Consumer name | Board revision key | GLB model | Spindle | Status |
|---|---|---|---|---|
| V1 | `v1revH` | `v1.glb` + `v1kickstarter.glb` | 24k RPM ER11 | Legacy-supported |
| V2-10 | `v2revP` | `v2-10.glb` | 24k RPM ER11 | Production |
| V2-50 | `v2revR` | `v2-50.glb` | 40k RPM ER20 | Production flagship |
| Solo | (to confirm) | `solo.glb` (7.9 MB) | (unknown) | New SKU, Phase 0 |

Plus one accessory GLB: `v2-vise.glb` (13 MB — the V2 workholding vise).

The `boardRevision` field is what Rockhopper/generateINI.py reads to pick the right INI template. Pentacad's machine JSONs now include it.

## Platform

| Field | Value |
|-------|-------|
| Hardware | BeagleBone Black (`bbb/prod` build target) |
| OS | Debian Buster |
| Build date | 2025-04-01 |
| Kinetic Control version | 5.8.4 |
| Build ID | `0.0.1-dev+61` |
| Upstream | LinuxCNC (pocketnc `emcapplication` fork) |
| Source repo | <https://bitbucket.org/pocketnc/kinetic-control> |
| Install root | `/opt/source/pocketnc/emcapplication/` |
| Pentamachine UI builds | `/opt/penta-ui-builds/` |
| Author | John Allwine <john@pentamachine.com> |
| Upload target | `s3://devops.pentamachine.com` |

## Machine models on the disk

Both variants ship with pre-built GLB models — we could embed them in the Pentacad viewport (ask Matt about license first):

| File | MD5 | Purpose |
|------|-----|---------|
| `/opt/penta-ui-builds/gltf/v2-10.glb` | `89e658df51765e79ec932bd42cf5a1cf` | V2-10 3D geometry for the Kinetic Control UI |
| `/opt/penta-ui-builds/gltf/v2-50.glb` | `fbbdcb1b84602e7e836b1cd17afde9b3` | V2-50 family (CHB + CHK) 3D geometry |

## Variant differences (confirmed from source)

> "ball_dia needs to be provided as it differs between V2-10 and V2-50 machines."
> "The V2-10 routine requires a 1/2" ball to be inserted into the spindle. The V2-50 routines requires the 6mm ball…"

| Variant | Probing ball | Spindle |
|---------|-------------|---------|
| V2-10 | 12.7 mm (1/2") | ER11, ~24,000 RPM |
| V2-50 (CHB + CHK) | 6 mm | ER20, 40,000 RPM |

## LinuxCNC configuration structure

Standard INI section headers detected (as expected for LinuxCNC):

- `[EMC]`, `[EMCIO]`, `[EMCMOT]`
- `[DISPLAY]`, `[TASK]`, `[RS274NGC]`
- `[HAL]`, `[TRAJ]`
- `[AXIS_X]`, `[AXIS_Y]`, `[AXIS_Z]`, `[AXIS_A]`, `[AXIS_B]`, `[AXIS_C]`
- `[JOINT_0]` through `[JOINT_9]` (V2 uses 0–4 for X/Y/Z/A/B)
- `[SPINDLE]`, `[KINS]`

Key `[TRAJ]` keys observed: `ANGULAR_UNITS`, `COORDINATES`, `LINEAR_UNITS`.

Key `[JOINT_n]` keys observed: `SCALE`, `STEPGEN_MAXACCEL`, `STEPGEN_MAXVEL` (confirming PRU step-gen, not servo).

## halui pins available (confirmed subset)

Every pin we use in `pentabridge.py` was cross-referenced against the dump. See `bridge-protocol.md` → "HAL pin mapping" for the full translation table.

Highlights:

- `halui.machine.is-on` / `.on` / `.off`
- `halui.estop.activate` / `.is-activated` / `.reset`
- `halui.program.run` / `.pause` / `.resume` / `.step` / `.stop` / `.is-running` / `.is-paused` / `.is-idle`
- `halui.axis.<c>.pos-feedback` / `.pos-commanded` / `.plus` / `.minus` / `.increment` / `.increment-plus` / `.increment-minus`
- `halui.axis.jog-speed` / `.jog-deadband`
- `halui.joint.<n>.home` / `.unhome` / `.is-homed`
- `halui.feed-override.direct-value` (**setter**) / `.value` (reader) / `.increase` / `.decrease`
- `halui.spindle.<i>.override.direct-value` / `.value` / `.start` / `.stop` / `.forward` / `.reverse` / `.is-on`
- `halui.tool.number` / `.diameter` / `.length_offset.{x,y,z,a,b,c}`
- `halui.mode.auto` / `.mdi` / `.manual` / `.is-auto` / `.is-mdi` / `.is-manual`
- `halui.max-velocity.direct-value` / `.value`

## Corrections applied to `pentabridge.py`

Two bugs caught by cross-referencing:

1. **Feed override** previously used `halui.feed-override.value <n>`. That pin is **read-only** in halui. Correct setter is `halui.feed-override.direct-value`. **Fixed.**
2. **Spindle override** previously used `halui.spindle-override.value`. That pin does not exist — spindle overrides are per-spindle-index. Correct setter is `halui.spindle.0.override.direct-value` (V2 has one spindle at index 0). **Fixed.**

Jog path changed from MDI incremental (`G91 G1 X<d> F<feed>`) to direct halui pins (`halui.axis.jog-speed` + `.increment` + `.increment-plus/minus`). Faster (no parser round-trip) and works in any control mode.

## Still-unknown (blocks full production push)

- **Exact INI/HAL filenames** per machine. Location is `/opt/source/pocketnc/emcapplication/configs/` but the Pentamachine-specific subdir/filename (e.g. `pocketnc.ini`, `v2-50.ini`, `machine.hal`) isn't visible in the string dump — those are data files, not embedded literals. Needs a filesystem listing (e.g. `debugfs` or `ls` inside a mounted image).
- **Mesa card vs PRU stepgen**: the dump contains drivers for 7i43 and 7i90 Mesa cards, but also references PRU. Likely the BBB build uses PRU — confirm by reading HAL file.
- **Fusion post-processor location**: expected to be in `/opt/source/pocketnc/emcapplication/` or `/opt/penta-ui-builds/` but a specific `.cps` path wasn't in the dump. Either Matt ships it separately or it's data-only (we'd need a file listing).

## Re-extraction command

If this doc gets stale, regenerate the raw dump on the user's Mac:

```bash
cd "/Users/.../uploads"
strings -n 8 kinetic-control-v5.8.4-20250401-bbb.img | \
  grep -E '^(halui\.|hm2_|motion\.|axis\.|joint\.|pyvcp\.|iocontrol\.|spindle\.|estop|tool-number)' | \
  sort -u > ~/cyclecad/kc-halui.txt
```

A `debugfs` or `7z x` pass on the same image will enumerate actual files inside the ext4 partition (offset 4,194,304 bytes / sector 8192) — useful for recovering the specific INI filenames.
