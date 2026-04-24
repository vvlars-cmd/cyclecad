# Tutorial 01 — Your first face-mill

*~15 minutes · no hardware required · uses Pentacad CAM module*

Goal: take a rectangular stock block, use Pentacad's CAM tab to skim 0.05″ off the top with a 1/4″ endmill, simulate it, and export the G-code.

## Step 1. Open Pentacad CAM

`app/pentacad.html` → click the **CAM** tab.

## Step 2. Define the stock

Sidebar on the right → **Setup 1** card → **Stock**.

For this tutorial use the V2-50 preset:
- X: 3.0″
- Y: 2.0″
- Z: 1.0″
- Unit: inch

Origin is at the centre of the top face (that's the default for V2-50).

## Step 3. Add the face operation

Click **+ Add operation** → pick **Face**.

Parameters:
- Tool: T1 — 1/4″ flat endmill 2FL
- Stepover: 70 %
- Stepdown: 0.02″
- Total depth: 0.05″
- Direction: climb
- Speed: 15 000 RPM (auto)
- Feed: 30 ipm (auto)

Leave "Engagement angle" and "Lead-in length" at defaults. Click **Apply**.

## Step 4. Generate

Click **Generate**. In the CAM viewport you'll see:
- Green lines: raster-plane feed passes across the stock top
- Grey dashed lines: rapid returns between passes
- Blue dots: tool-change / retract points

Summary card below the viewport:
- Moves: ~18
- Feed distance: ~6 in
- Rapid distance: ~4 in
- Estimated time: ~0.4 min

## Step 5. Post to G-code

Click **Post-to-G-code**. Pentacad runs the post-processor and downloads `setup-1.ngc`. The Posted summary card shows line count (~35 lines) and a **Run** button.

Open the `.ngc` file in a text editor — you'll see:

```
( Pentacad 3.14.0 — setup-1 face-mill )
G20 G90 G94 G17 G40 G54
T1 M6
S15000 M3
G0 Z0.2
G0 X-0.9 Y-0.6
G1 Z-0.02 F30
G1 X0.9
G1 Y-0.385
G1 X-0.9
... (continues)
M5 M30
```

Note the Pentamachine V2 dialect: G20 imperial, G94 feed-per-minute, G54 WCS, 4-decimal coordinates.

## Step 6. Simulate it

Click the **Simulate** tab. The just-posted G-code is already loaded.

Press **Space** and watch. Things to check:
- Tool doesn't plunge through stock — Z stays at or above -0.02 during cutting
- Z retracts to 0.2 between passes and before the final M5
- Stats tab shows the numbers match what CAM reported (maybe ±2 % due to rapid-move duration estimation)
- Limits tab: all green ✓ (well within V2-50 envelope)

## Step 7. Iterate

Go back to CAM. Change stepdown to 0.01″ (half as deep per pass). Regenerate. Post. Simulate. You'll see:
- Move count roughly doubles
- Feed distance roughly doubles
- Estimated time roughly doubles

This is how you find the right balance between tool load and machining time without touching the real machine.

---

## What you learned

- CAM → Sim → Post is the daily workflow
- Every parameter change is cheap — iterate freely
- The post-processor emits Pentamachine V2 dialect exactly (inch + G94 + G54)

## Next

- [Tutorial 02 — Pocket with drilled holes](./02-pocket-and-drill.md)
- [Tutorial 03 — Adaptive clearing](./03-adaptive-clearing.md)
