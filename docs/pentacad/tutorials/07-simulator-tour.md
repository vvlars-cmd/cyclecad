# Tutorial 07 — Simulator tour

*~15 minutes · every feature of the standalone simulator*

The standalone simulator at `app/pentacad-sim.html` is the fastest way to verify G-code before running it on hardware. This tutorial covers every feature.

## Layout

```
┌────────────────────────────────────────────────────────────────┐
│  TOP BAR  [Machine picker] [Open] [Examples] [Help] [Share]   │
├──────────────┬────────────────────────────────────┬─────────────┤
│              │                                    │ TABS:       │
│  G-CODE      │         3D VIEWPORT                │ DRO Stats   │
│  EDITOR      │                                    │ Limits Iss. │
│              │                                    │             │
│  (syntax-    │         ┌─ vis toggles ─┐          │ DRO:        │
│   high-      │         │               │          │  X  0.0000  │
│   lighted)   │                                    │  Y  0.0000  │
│              │         ┌─ HUD cards ──┐           │  Z  0.0000  │
│              │         │ Machine      │           │  A  0.000°  │
│              │         │ Tool         │           │  B  0.000°  │
│              │         │ Warnings     │           │             │
│              │                                    │ Modal:      │
│              │  ───────────────────────           │ G0 G20 G17  │
│              │  [⏮][▶][⏭] ── timeline ── [1×]     │ G90 G94 G54 │
├──────────────┴────────────────────────────────────┴─────────────┤
│  STATUS:  ● Ready │ X 0.0 Y 0.0 Z 0.0 │ FEED │ line — │ 0%     │
└─────────────────────────────────────────────────────────────────┘
```

## Top bar

**Machine picker** — V1 / V2-10 / V2-50 / Solo. Envelope + stock preset update when you switch. Viewport rebuilds the machine proxy.

**📂 Open** — file picker for `.nc` / `.ngc` / `.gcode` / `.tap` / `.txt`. Also: drag-drop anywhere on the page.

**📑 Examples** — 7 samples, covering every major strategy.

**❓ Help** — keyboard shortcuts + supported codes.

**🔗 Share** — copies a URL with the G-code base64'd in the hash. Recipient opens the URL, sees your exact program. No server involved.

## G-code editor

- **Line numbers** left of each line (grey).
- **Syntax highlighting:** G orange, M orange, N grey, F/S purple, T pink, A/B/C teal, X/Y/Z default white, comments grey italic.
- **Current-line highlight:** green bar + green stripe on the left. Auto-scrolls during playback if the current line goes off-screen.
- **Error lines:** red-tinted background + red stripe on the left. Click the Issues tab to see what the parser complained about.

**Editor actions (bottom toolbar):**
- **✏️ Edit** — prompt dialog for quick text edits (not a full code editor — use an external one for big changes).
- **🗑 Clear** — wipes the program.
- **📋 Copy** — copies all G-code to clipboard.
- **⬇ Save** — downloads as `.ngc`.

## 3D viewport

**HUD cards (top-left):**
- **Machine** — which Pentamachine is active
- **Tool** — T-number + description (blank until first T M6)
- **Warnings** — only appears if there are parse errors or envelope violations

**Visibility toggles (top-right):**
| Toggle | Shows |
|---|---|
| Machine | Column, spindle, trunnion, rotary table |
| Stock | Translucent amber bounding box |
| Toolpath | Green feed lines (+ grey dashed rapids if the rapid toggle is also on) |
| Rapid moves | Dashed grey lines for G0 (default off to reduce clutter) |
| Grid | Floor grid, 1 square per inch |
| Axes | X/Y/Z world axes helper |
| Origin | Red/green/blue axis arrows at the WCS origin |

**Camera controls:**
- **Left-drag** — rotate
- **Right-drag** — pan
- **Scroll** — zoom
- **Keys:** `F` fit · `R` reset iso · `1` front · `3` right · `7` top

## Playback bar

```
[⏮ Stop][▶ Play][⏭ Step]  0.00s ── timeline ── 6.14s   [1× ▾]
```

**⏮ Stop** — reset to start + pause. DRO goes back to (0,0,0,0,0).

**▶/⏸ Play** — Space bar. Plays from current position. When it reaches the end, stops automatically.

**⏭ Step** — `→` key. Advance one move (or one line). Use for inspecting specific transitions.

**Timeline scrubber** — drag to any point in the program. Viewport + DRO update in real time.

**Speed chip** — 0.25× 0.5× 1× 2× 4× 10× 50×. 50× is useful for long programs where you want to zoom past the boring bits; watch the DRO move too fast to read but the 3D motion is still clear.

## Side panel — DRO tab

**Axis readout** — X/Y/Z in inches (4 decimals), A/B in degrees (3 decimals). Updates at 30 Hz during playback.

**Active modal state chips** — which codes are currently in effect. Chips are grey when inactive, green when active. The chips update as the executor reads each line.

**Feed / speed / tool / coolant** — current commanded values (from F/S/T and coolant M-codes).

## Side panel — Stats tab

**Motion summary:**
- Total lines (from the parser)
- Moves (from the executor — fewer because non-motion lines don't emit moves)
- Rapid (G0) count
- Feed (G1/G2/G3) count
- Tool changes (M6)

**Distance / time:**
- Feed distance (mm of G1/G2/G3)
- Rapid distance (mm of G0)
- Estimated run time (sum of per-move durations)

**Envelope used:**
- Per-axis min → max of the motion. Tells you how much of the machine envelope the program actually exercises.

## Side panel — Limits tab

Per-axis rows:
- **OK (green)** — all moves within envelope
- **Fail (red)** — count of moves outside envelope

Also lists the machine envelope at the bottom for reference.

The limit check is pure math — no simulation needed. As soon as you load a program, the Limits tab is accurate.

## Side panel — Issues tab

All parser warnings + envelope violations + heuristic warnings:
- "Feed moves present but no M3/M4 spindle-on command"
- "No M2 or M30 program-end marker"
- "N moves outside machine envelope"
- "Unparsed text on line N"

These are suggestions, not hard errors. The simulator always tries to play the program.

## Status bar (bottom)

- **Status dot + text** — Ready / Running / Paused / Completed / Error
- **Live position** — last-rendered X/Y/Z/A/B
- **Mode** — RAPID / FEED depending on current move type
- **Current line** — the source-G-code line being executed
- **Progress** — percentage through the program

## Keyboard shortcuts (summary)

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `→` | Step one move |
| `←` | Step one move back |
| `Home` | Jump to start |
| `End` | Jump to end |
| `F` | Fit view |
| `R` | Reset camera |
| `1 / 3 / 7` | Front / right / top view |
| `Cmd/Ctrl + O` | Open file |
| `Cmd/Ctrl + E` | Examples |

## What it doesn't do (yet)

- **Material removal simulation.** The stock block doesn't actually get carved. We'd need a voxel-grid and boolean subtraction for every move; that's a Phase 2 feature.
- **Collision detection against fixtures.** No fixture model loaded by default.
- **Spindle-holder clearance at extreme A.** No tool-stackup check.
- **Multi-setup viewer.** One setup at a time. Multi-setup is in the full `pentacad.html` CAM tab, not the standalone sim.

---

## What you learned

- Every feature of the standalone simulator
- How to read the four side-panel tabs
- What the simulator explicitly doesn't check (so you don't get lulled into thinking it's a full virtual machine)

## Next

- **Tutorial 06** — Bottle-opener ring end-to-end (CAM → Sim → Post)
- **Tutorial 09** (coming) — Running your first job on real hardware
- **Help guide** — [HELP.md](../HELP.md) for the full feature reference
