# Pentacad ↔ Kinetic Control · Bridge Protocol v1.0

> Wire-level spec for the WebSocket bridge between Pentacad (browser /
> Suite-server) and a Kinetic-Control-controlled Penta machine. Phase 2
> deliverable per the Pentacad roadmap.

| Field | Value |
| --- | --- |
| Transport | WebSocket (`ws://` dev / `wss://` prod) |
| Default endpoint | `ws://localhost:9090/ws` (dev) · `wss://bridge.cyclecad.com/ws` (prod) |
| Sub-protocol header | `Sec-WebSocket-Protocol: pentacad.bridge.v1` |
| Encoding | UTF-8 JSON, one envelope per WebSocket frame |
| Authentication | bearer token in `Authorization` HTTP header during the upgrade handshake — token issued by the Suite meter |
| Heartbeat | server pings every 5 s; client pongs within 2 s; idle close after 30 s |

## 1. Envelope shape

Every message — both directions — is a JSON object with this exact shape:

```jsonc
{
  "v":  1,                  // protocol version, must equal 1 for v1.x
  "id": "abc123",           // client-chosen request id (echoed in response)
  "ts": 1777320000000,      // sender's wall clock, milliseconds since epoch
  "type": "<message-type>", // one of the types listed below
  "data": { /* per-type payload */ }
}
```

Server responses to a client request reuse the same `id`. Server-initiated
events (state, alarm, log) generate fresh ids prefixed `srv-`.

## 2. Lifecycle

```
   client                                                 server
     |                                                      |
     |-- HTTP/1.1 101 Switching Protocols  -----------------|
     |                                                      |
     |-- { type:"hello",  v:1, capabilities:[...] } ------->|
     |<-- { type:"welcome", machineId, fwVersion, ... } ----|
     |                                                      |
     |   ---------- application messages ----------         |
     |                                                      |
     |-- { type:"close", reason:"client" }    ------------->|
     |<-- HTTP/WS close frame                            ---|
```

The `welcome` payload includes:

```jsonc
{
  "machineId":      "v2-50",
  "fwVersion":      "5.1.3",
  "controllerUuid": "1c08e94d-...",
  "capabilities":   ["jog","stream","probe","tcpc","tool-change-popup"],
  "envelope":       { "X":{...}, "Y":{...}, "Z":{...}, "A":{...}, "B":{...} }
}
```

## 3. Client → server messages

### 3.1 `state.request`
Ask for a single state snapshot. Server replies with one `state.snapshot`.

```jsonc
{ "type":"state.request", "data": {} }
```

### 3.2 `state.subscribe`
Subscribe to live state. Server pushes `state.snapshot` at the requested rate
(default 10 Hz, max 30 Hz).

```jsonc
{ "type":"state.subscribe", "data": { "rate_hz": 10 } }
```

### 3.3 `jog.start`
Continuous jog. Auto-stops on `jog.stop`, socket close, or 3-second silence.

```jsonc
{ "type":"jog.start", "data": {
    "axis": "X",
    "direction": 1,
    "rate_units_per_min": 600,
    "units": "mm"
}}
```

### 3.4 `jog.stop`
Stops every in-progress jog.

```jsonc
{ "type":"jog.stop", "data": {} }
```

### 3.5 `program.load` + `program.chunk`
Stream NGC bytes. Large programs split across `program.chunk` keyed by the
same `programId`.

```jsonc
{ "type":"program.load", "data": {
    "programId":   "p-2026-04-27-001",
    "totalBytes":  18234,
    "totalLines":  427,
    "metadata":    { "designer": "Sachin", "machine": "v2-50chb", "tool": "T1" }
}}
```

```jsonc
{ "type":"program.chunk", "data": {
    "programId":   "p-2026-04-27-001",
    "seq":         0,
    "bytesBase64": "JTAxMDAw...",
    "final":       false
}}
```

### 3.6 `program.run`

```jsonc
{ "type":"program.run", "data": {
    "programId":      "p-2026-04-27-001",
    "fromLine":       1,
    "tcpc":           true,
    "feedOverride":   1.0,
    "spindleOverride":1.0
}}
```

### 3.7 `program.pause` / `program.resume` / `program.abort`

```jsonc
{ "type":"program.pause",  "data": {} }
{ "type":"program.resume", "data": {} }
{ "type":"program.abort",  "data": { "reason": "operator" } }
```

`program.abort` performs a controlled stop: spindle off, retract Z to safe,
state goes to `aborted`.

### 3.8 `mdi.execute`
Single MDI block, out-of-band. Rejected while a program is running (`error.code = "busy"`).

```jsonc
{ "type":"mdi.execute", "data": { "block": "G53 G0 Z0" } }
```

### 3.9 `home.axes`

```jsonc
{ "type":"home.axes", "data": { "axes": ["X","Y","Z","A","B"] } }
```

### 3.10 `probe.go`
G38.x probing. Returns `probe.result`.

```jsonc
{ "type":"probe.go", "data": {
    "axis":        "Z",
    "direction":   -1,
    "feedrate":    100,
    "maxDistance": 25,
    "type":        "G38.2"
}}
```

### 3.11 `tool.set` / `tool.change`

```jsonc
{ "type":"tool.set",    "data": { "toolNumber": 1, "lengthOffset_mm": 33.5 } }
{ "type":"tool.change", "data": { "toolNumber": 2 } }
```

### 3.12 `wcs.set`
Set work-coordinate offset.

```jsonc
{ "type":"wcs.set", "data": {
    "code":     "G54",
    "axis":     "X",
    "value_mm": 0
}}
```

## 4. Server → client messages

### 4.1 `state.snapshot`
Live machine state. On request or at the subscribed rate.

```jsonc
{ "type":"state.snapshot", "data": {
    "ts":          1777320001000,
    "mode":        "auto",
    "running":     true,
    "paused":      false,
    "position":    { "X": 12.345, "Y": -3.210, "Z": 5.000, "A": 12.5, "B": 90.0 },
    "machinePos":  { "X": 13.000, "Y":  0.000, "Z": 5.000, "A": 12.5, "B": 90.0 },
    "feed":        { "actual_mm_min": 642, "command_mm_min": 800, "override": 0.8 },
    "spindle":     { "actual_rpm": 7980, "command_rpm": 8000, "override": 1.0, "running": true, "direction": "cw" },
    "coolant":     "mist",
    "tool":        { "number": 1, "lengthOffset_mm": 33.5 },
    "programLine": 142,
    "wcs":         "G54",
    "tcpc":        true,
    "alarm":       null
}}
```

### 4.2 `program.progress`

```jsonc
{ "type":"program.progress", "data": {
    "programId":            "p-2026-04-27-001",
    "line":                 142,
    "block":                "G1 X10.000 Y10.000 F600",
    "remaining_lines":      285,
    "estimated_remaining_s": 712
}}
```

### 4.3 `program.complete`
Sent exactly once when the program reaches `M30` (or aborts).

```jsonc
{ "type":"program.complete", "data": {
    "programId":  "p-2026-04-27-001",
    "outcome":    "ok",
    "duration_s": 1842,
    "alarm":      null
}}
```

### 4.4 `probe.result`

```jsonc
{ "type":"probe.result", "data": {
    "axis":     "Z",
    "touched":  true,
    "position": { "X": 0, "Y": 0, "Z": -8.43, "A": 0, "B": 0 }
}}
```

### 4.5 `alarm`

```jsonc
{ "type":"alarm", "data": {
    "code":         "AX-200",
    "axis":         "Z",
    "severity":     "hard",
    "message":      "Z soft limit exceeded",
    "blockingLine": 167
}}
```

Hard alarms force the controller to stop. The bridge **must** suppress all
client motion commands until cleared at the panel (or via `alarm.clear`
where the controller exposes that capability).

### 4.6 `log`

```jsonc
{ "type":"log", "data": { "level": "info", "msg": "homed Z" } }
```

### 4.7 `error`
Sent in response to any client request that cannot be served. Reuses the
client's request `id`.

```jsonc
{ "id":"abc123", "type":"error", "data": {
    "code":    "envelope",
    "message": "Z=120 outside envelope [-90,0]",
    "details": { "axis": "Z", "value": 120 }
}}
```

Defined error codes:

| Code | Meaning |
| --- | --- |
| `auth`        | bearer token invalid / expired |
| `unsupported` | controller does not implement the requested capability |
| `busy`        | controller is in a state that forbids the request |
| `envelope`    | request would violate a soft / hard limit |
| `parse`       | JSON or NGC parse error |
| `timeout`     | request exceeded the controller's reply window |
| `internal`    | bridge daemon crashed or lost the controller |

## 5. Reference daemon (Phase 2 deliverable)

The reference Python daemon ships at `server/bridge/pentabridge.py`. It
implements both sides against Kinetic Control's LinuxCNC HAL via a subset
of the [Rockhopper](https://github.com/madwasp79/Rockhopper) WebSocket API,
translating Pentacad's stable v1.0 envelopes into LinuxCNC's per-version
internal commands.

Invariants:

- Daemon is **stateless** — every connection re-reads the controller's
  reported envelope and capabilities on `welcome`.
- `program.load` writes to the controller's local NGC directory; the
  controller's own auto-load mechanism then picks it up.
- Soft-limit checks are belt-and-suspenders: Pentacad checks before send,
  the daemon checks before write, the controller checks before motion.
- All times are wall-clock millis since epoch — the daemon never reports
  controller-local timestamps.

## 6. Versioning & forward-compat

Minor versions (v1.1, v1.2) MUST stay backwards compatible — clients
declaring `v: 1` continue to work. New event types may be added; new
fields on existing events are allowed; existing field semantics are
frozen.

The Suite locks the protocol via `shared/bridge/types.js` (Phase 2 build):
JSDoc shapes that both the browser client and the Node test harness import.

## 7. Security notes

- The bridge token is single-tenant. Pentacad widgets pass
  `Authorization: Bearer <token>` during upgrade; the daemon validates
  against an HMAC shared with the meter.
- The dev daemon at `ws://localhost:9090/ws` has no auth and **must not**
  be exposed to the public internet. Production deploys gate it behind
  Caddy with a per-token allow-list (see `deploy/Caddyfile`).
- All `mdi.execute` blocks are logged with the bearer token's actor id
  so every operator action is traceable.
- Hard alarms always propagate; the bridge MUST NOT suppress them even
  if the client unsubscribes.

---

**Status:** v1.0 frozen 2026-04-27. Next revision target: v1.1 adds
tool-life telemetry + multi-program queue. See Phase 3 in the Pentacad
roadmap.
