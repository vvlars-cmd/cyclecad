# Tutorial 00 — Getting started with Pentacad

*~10 minutes · no hardware required · starts from a fresh browser*

This tutorial gets you from nothing to a running simulator with your first toolpath posted as G-code. We don't touch the real machine yet — that's in tutorial 09.

## Prerequisites

- A browser (Chrome or Safari 16+ recommended, Firefox works)
- A local copy of cycleCAD, or access to `cyclecad.com/app/pentacad.html`

If you don't have cycleCAD locally:

```bash
git clone https://github.com/vvlars-cmd/cyclecad
cd cyclecad
python3 -m http.server 8000
# open http://localhost:8000/app/pentacad.html
```

## Step 1. Open Pentacad

You'll see a Kinetic-Control-style UI with five tabs along the top:
**Machine · Design · CAM · Simulate · Production**

The landing tab is **Machine**. That's where you pick which Pentamachine variant you're targeting.

## Step 2. Pick a machine (no hardware needed)

Click the machine picker and select **Pentamachine V2-50**. The envelope (X ±5 in, Y ±3.5 in, Z ±2.5 in, A −35° to +135°, B continuous) updates in the status bar.

You don't need to connect to anything yet — Pentacad works entirely offline for CAM and simulation.

## Step 3. Open the standalone simulator

In a new tab, open `app/pentacad-sim.html`. This is the dedicated simulator — faster to iterate in than the full workspace.

You'll see:
- Left: G-code editor (pre-loaded with a face-mill example)
- Centre: 3D viewport with a simplified V2-50 model
- Right: DRO panel showing X/Y/Z/A/B = 0

## Step 4. Play the example

Press **Space** (or click ▶).

Watch:
- The tool moves across the stock in raster passes
- The DRO updates in real time
- The current line highlights in green in the editor
- The timeline scrubber advances

Press **Space** again to pause. Press **Home** to reset to the start.

## Step 5. Try another example

Click **📑 Examples** in the top bar. Pick **"Pocket + drill — cover plate"**.

This is a two-operation program: a 1.5″ × 1.0″ pocket, then four corner drill holes with peck cycles. Play it. Notice:
- Two tool changes (M6) — the status bar shows T2 → T5
- Peck cycles (G83) retract between pecks — the tool "chatters" up and down
- The Stats tab shows ~6 moves of rapid, ~40 of feed

## Step 6. Try a limit violation

Load the **"Soft-limit test"** example. This one deliberately commands moves outside the machine envelope.

Click the **Limits** tab on the right. You'll see red rows for X and Y with "2 violations" / "1 violation". The viewport still plays — the simulator doesn't stop at a violation, it just reports it. On a real machine, Rockhopper would refuse to start this program.

## Step 7. Write your own

Click **✏️ Edit** and replace the G-code with:

```
G20 G90 G94 G17 G40 G54
T1 M6
S15000 M3
G0 X-1 Y0 Z0.1
G1 Z-0.05 F20
G1 X1 F30
G1 Y0.5
G1 X-1
G1 Y-0.5
G1 X1
G0 Z0.5
M5 M30
```

Press OK. The editor syntax-highlights it; the simulator auto-runs; the stats update. If you introduced a typo, the bad line flashes red and the Issues tab lists the parser error.

## Step 8. Save it

Click **⬇ Save** to download a `.ngc` file. You can re-open it anytime with **📂 Open** or drag-drop.

---

## What you just learned

- Pentacad has five workspaces — you used the standalone simulator
- G-code is parsed, executed, and played back against machine kinematics entirely in the browser
- The soft-limit check runs automatically and reports per-axis violations
- Example programs let you try features without needing your own G-code

## Next

- [Tutorial 01 — Your first face-mill](./01-first-face-mill.md)
- [Tutorial 02 — Pocket with drilled holes](./02-pocket-and-drill.md)
- [Tutorial 07 — Simulator tour](./07-simulator-tour.md) (deeper dive into the simulator itself)
