# Pentacad Bridge Protocol v1.0

> Browser ↔ machine communication for Pentacad. JSON-over-WebSocket.
>
> **HAL pin names confirmed** against Kinetic Control v5.8.4-20250401-bbb disk image (2025-04-01 build). See `HAL pin mapping` section at the end.

## Topology

```
┌─────────────────────┐   WebSocket   ┌────────────────────────┐   IPC    ┌─────────────────┐
│  Pentacad (browser) │ <───────────> │  pentabridge (daemon)  │ <──────> │  Kinetic Control │
│  pentacad-bridge.js │    JSON       │  Python, LAN-only      │ halcmd   │  (LinuxCNC + HAL)│
└─────────────────────┘               └────────────────────────┘          └─────────────────┘
```

The daemon runs on the machine itself (or a box on the same LAN). Browser never talks to LinuxCNC directly — it talks to the daemon, which translates to halcmd / MDI / linuxcncrsh.

## Security model

- **E-stop is ALWAYS hardware-first.** The daemon cannot override it. If E-stop is engaged, the daemon refuses every motion op and emits an `estop` event.
- **No internet exposure.** Bridge binds to LAN interface only by default. Port 7777/ws.
- **Optional token auth.** Config sets `auth_token: "..."`; client includes it in `connect()` query string: `ws://.../connect?token=...`.
- **TLS.** Recommended: front with nginx + Let's Encrypt for `wss://` in production shops.

## Message shape

### Client → daemon (request)

```json
{
  "id": 42,
  "op": "jog",
  "args": { "axis": "X", "direction": 1, "distance": 0.1, "feedRate": 200 }
}
```

- `id` — integer, increments per call. Used to correlate responses.
- `op` — operation name (see Ops Reference).
- `args` — op-specific parameters.

### Daemon → client (response)

```json
{
  "id": 42,
  "ok": true,
  "data": { "done": true }
}
```

On error:
```json
{ "id": 42, "ok": false, "error": "X-axis is at soft limit (-5.0000 in)" }
```

### Daemon → client (unsolicited event)

```json
{
  "event": "dro",
  "data": {
    "pos": { "x": 1.2345, "y": -0.5000, "z": 0.0000, "a": 0, "b": 0 },
    "feedRate": 240
  }
}
```

## Ops reference (client → daemon)

| op | args | returns | notes |
|----|------|---------|-------|
| `ping` | `{ts}` | `{pong, ts}` | 5-second keepalive. |
| `jog` | `{axis, direction, distance, feedRate}` | `{done}` | Incremental move. `axis` ∈ X/Y/Z/A/B. |
| `home` | `{axis?}` | `{homed}` | `axis` default `"ALL"`. Long-running (up to 2 min). |
| `stream-line` | `{index, line}` | — | One G-code line. Daemon acks with `event:line`. |
| `pause` | `{}` | `{acknowledged}` | Feed-hold. |
| `resume` | `{}` | `{acknowledged}` | Release feed-hold. |
| `abort` | `{}` | `{aborted}` | Cycle-stop + safe-Z + spindle-off + coolant-off. |
| `mdi` | `{line}` | `{done}` | One-off G-code line, executed immediately. |
| `feedOverride` | `{factor}` | `{acknowledged}` | 0..2 multiplier. |
| `spindleOverride` | `{factor}` | `{acknowledged}` | 0..1.5 multiplier. |
| `coolant` | `{mist, flood}` | `{acknowledged}` | Either or both. |
| `probe` | `{axis, direction, distance, feedRate}` | `{pos}` | G38.2 probing. Long-running. |
| `clearEstop` | `{}` | `{cleared}` | After hardware reset on machine side. |

## Events (daemon → client, unsolicited)

| event | data | emitted when |
|-------|------|--------------|
| `dro` | `{pos, feedRate}` | Every 100ms during motion, 1 Hz idle. |
| `spindle` | `{rpm, load, on}` | Every 500ms when spindle is on. |
| `line` | `{lineNumber}` | Each G-code line completes. |
| `complete` | `{totalLines}` | Stream finishes. |
| `alarm` | `{level, kind, message}` | Any LinuxCNC alarm. |
| `estop` | `{message}` | E-stop asserted. |
| `probe` | `{contact, pos}` | Probe cycle completes. |
| `tool-change` | `{toolId}` | After T-M6. |
| `coolant` | `{mist, flood}` | Coolant state changes. |

## State machine (client-side)

```
disconnected ──connect()──> connecting ──ws.open──> connected
        ↖                                                │
        │                                         stream()
  ws.close (auto-retry with exp. backoff)                │
        │                                                ▼
        │                                           streaming
        │                                    pause() ↕ resume()
        │                                                │
        │                                           paused
        │                                                │
        │                                         abort() / complete
        │                                                │
        └────────────── back to connected ───────────────┘

any state ──hardware estop──> estop (latched)
  estop ──clearEstop()──> connected
```

## Reconnect semantics

- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s…
- On reconnect, if a stream was active, `stream.resumable=true`; client re-sends from the last acked `lineNumber + 1`.
- Pending RPC calls are rejected with `"connection lost"` on disconnect.

## Streaming flow

1. Client calls `stream(gcode)`. Client-side fields fill: `total`, `cursor=0`, `inFlight=0`.
2. Client pumps up to `STREAM_WINDOW` (default 8) `stream-line` messages.
3. Daemon executes each line; sends `event:line {lineNumber}` on completion.
4. Client decrements `inFlight`, advances `cursor`, sends more.
5. When `cursor == total` and `inFlight == 0`, daemon sends `event:complete`.
6. Client emits `stream` event with `kind: 'complete'`.

Back-pressure: if daemon's buffer is full, it replies `{ok: false, error: "buffer-full"}`; client pauses and retries after 100ms.

## Mock mode

`window.CycleCAD.PentacadBridge.startMock()` injects a fake WebSocket that acks every op and emits jittered DRO at 10Hz. Enables UI development without hardware. Activate via `init({ mock: true })`.

## Sample daemon (reference implementation)

See `server/pentabridge.py` — ~200-line Python 3 script using `websockets` + `subprocess` calls to `halcmd` and `linuxcncrsh`. Licensed AGPL-3 (matching Pentacad). Drop on the machine, systemd-enable, and you're running.

## Versioning

| version | date | notes |
|---------|------|-------|
| 1.0.0 | 2026-04-24 | Initial schema — ops + events above. HAL pins confirmed against Kinetic Control v5.8.4. |

When adding ops: bump minor. Breaking changes: bump major. Client advertises supported version on connect via `{op:'hello', args:{clientVersion:'1.0.0'}}`.

---

## HAL pin mapping (reference)

Confirmed from Kinetic Control v5.8.4 disk image (2025-04-01). This is how each bridge op translates to LinuxCNC halui pins on the controller side.

| Bridge op | halui pin used by daemon | Notes |
|-----------|--------------------------|-------|
| `connect` / `ping` | *(no HAL call — WS only)* | Keepalive every 5s. |
| `jog X+ 0.1mm @ 200mm/min` | `setp halui.axis.jog-speed 200` + `setp halui.axis.x.increment 0.1` + `setp halui.axis.x.increment-plus TRUE` | Direct jog, no MDI mode required. Axis letter lowercased. |
| `home ALL` | `setp halui.joint.0.home TRUE` … `.4.home TRUE` in sequence | No home-all pin in LinuxCNC — each joint separately. Joints: 0=X 1=Y 2=Z 3=A 4=B for V2. |
| `home X` | `setp halui.joint.0.home TRUE` | |
| `stream-line <G>` | `linuxcncrsh -c "<G>"` | One G-code line via MDI socket. Daemon also emits `event:line` on ack. |
| `pause` | `setp halui.program.pause TRUE` | Feed-hold. |
| `resume` | `setp halui.program.resume TRUE` | |
| `abort` | `setp halui.program.stop TRUE` | Cycle-stop. |
| `mdi <G>` | `linuxcncrsh -c "<G>"` | One-off G-code. |
| `feedOverride 1.25` | `setp halui.feed-override.direct-value 1.25` | **Note**: `.value` is read-only. Setter is `.direct-value`. |
| `spindleOverride 0.9` | `setp halui.spindle.0.override.direct-value 0.9` | Per-spindle-index. V2 has one spindle at index 0. |
| `coolant mist=true` | `linuxcncrsh -c "M7"` | (flood = M8, off = M9) |
| `probe Z -10 F2` | `linuxcncrsh -c "G38.2 Z-10 F2"` | |
| `clearEstop` | `setp halui.estop.reset TRUE` | User must also clear the hardware latch. |

### DRO broadcaster

Reads on a 10Hz loop:
```
halcmd getp halui.axis.x.pos-feedback
halcmd getp halui.axis.y.pos-feedback
halcmd getp halui.axis.z.pos-feedback
halcmd getp halui.axis.a.pos-feedback
halcmd getp halui.axis.b.pos-feedback
```

### Alarm / estop detection

Polled every 500ms:
```
halcmd getp halui.estop.is-activated   → bool, emits `event:estop` on rising edge
halcmd getp halui.program.is-running   → bool, for state-machine checks
halcmd getp halui.program.is-paused    → bool, ditto
halcmd getp halui.machine.is-on        → bool
```

### Additional pins available (for Phase 2)

Useful pins we don't yet use but will for future features:
- `halui.tool.number` — currently loaded tool ID
- `halui.tool.diameter` — loaded tool diameter
- `halui.tool.length_offset.{x,y,z,a,b}` — tool-length compensation
- `halui.spindle.0.is-on` / `.runs-forward` / `.runs-backward` — spindle state
- `halui.mode.is-auto` / `.is-mdi` / `.is-manual` — current control mode
- `halui.program.block-delete.is-on` — for optional-block toggle
- `halui.max-velocity.direct-value` — global velocity clamp

### Platform notes

- Kinetic Control is built on **LinuxCNC** (the pocketnc `emcapplication` fork).
- The bridge daemon must be reachable at a POSIX path that runs `halcmd` and `linuxcncrsh` (typical: `/usr/bin/halcmd`, `/usr/bin/linuxcncrsh`). These live inside the LinuxCNC runtime environment — usually means running the daemon with `halrun` or inside the same realtime session as the controller.
- On the BeagleBone Black specifically: step generation uses the **PRU** (Programmable Realtime Units) on-chip, not an external Mesa card. This affects the HAL file structure but NOT the halui pins the bridge touches — halui is an abstraction layer above the step generator.

If Matt confirms a specific pin set differs on his build, only `pentabridge.py` needs to change — the protocol itself is stable.
