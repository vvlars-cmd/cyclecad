# Pentacad Tutorial — Make Your First Part

This walkthrough takes you from "empty browser tab" to "posted G-code running on a Pentamachine V2" in about 15 minutes. Works in browser mock mode if you don't have the hardware yet.

## 0. Open Pentacad

Visit **https://cyclecad.com/app/pentacad.html**.

On first load you'll see:
- Top bar: Pentacad logo + "Machine: V2-50CHB ▼" + "Setup 1 ▼" + ⚙
- Left rail: 5 tab pills (Machine · Design · CAM · Simulate · Control)
- Centre: Three.js viewport showing the machine + a demo bottle-opener-ring pocket
- Right: side panel (contents change per tab)
- Bottom: DRO strip with X/Y/Z/A/B/feed/RPM + bridge state dot

Pentacad auto-loads V2-50CHB and generates a demo pocket toolpath so you see something immediately.

## 1. Pick your machine (Machine tab)

Click the **Machine** tab.

You'll see three choices:
- V2-10 — entry 5-axis, 24k RPM ER11
- **V2-50CHB** — standard head, 40k RPM ER20 (default)
- V2-50CHK — K-frame with integrated probe

Pick yours. The viewport updates to show that machine's axes + envelope. Each kinematics definition has an `_confirmed` flag per field — values you see are estimated from Matt's marketing kit until he confirms each measurement.

Below the picker you see:
- Linear travel X/Y/Z
- Rotary range A/B
- Spindle RPM range
- Coolant support (mist/flood)
- Tool library

## 2. Define your stock + WCS (Design tab)

Click **Design**.

Three inputs:
1. **Import part** — drop a `.step`, `.iam`, or `.stl`. If you skip this, the viewport just shows a stock box with no part.
2. **Stock box** — defaults 100×100×10mm aluminum. Adjust X/Y/Z extents + material dropdown (aluminum / steel / wood / acrylic / brass).
3. **WCS origin + rotation** — where machine zero is on your part. Default: centre of stock, top surface, A=0 B=0.

Click "Apply to setup". The stock appears in the viewport at the chosen WCS.

## 3. Add operations (CAM tab)

Click **CAM**.

You'll see the "Setup 1" card with an empty operation list (unless you kept the demo pocket).

Click **+ Add operation**. A modal pops up:

1. **Strategy** — pick one of 12:
   - **2D Contour** — follow a boundary (for outer profile cuts)
   - **Pocket** — clear out an enclosed area
   - **Drill** — G83/G73 peck cycles at (x,y) locations
   - **Adaptive Clear** — high-feed roughing (concentric rings)
   - **Chamfer/Deburr** — V-bit edge follow
   - **Bore/Thread** — straight bore / helix-bore / thread-mill
   - **Face** — stock-top surfacing
   - (plus 5 Phase-2 stubs: Parallel / Radial / Scallop / Projection / Flow)

2. **Tool** — pick from the machine's tool library, or add a custom tool (dia / flutes / max RPM / type).

3. **Feeds & speeds** — defaults auto-populate from the feeds table based on (tool × material). Override anything.

4. **Parameters** — strategy-specific inputs:
   - Pocket: boundary, depth, stepdown, stepover
   - Drill: hole list, depth, peck depth
   - Bore: center, finalDiameter, mode, pitch
   - etc.

Click **Add** — operation appears in the list.

Repeat for every operation you need. Typical part: Face → Adaptive Clear → Pocket → Drill → Chamfer.

Click **Generate toolpaths**. Toolpaths render in the viewport — green for rapids, blue for feeds, red if any move violates soft limits.

## 4. Simulate (Simulate tab)

Click **Simulate**.

You get a full playback controller:
- **Play / Pause / Stop**
- **Speed slider** — 0.25× to 8×
- **Timeline scrubber** — drag to any point in the program
- **Soft-limit readout** — green "OK" or red "N violations"
- **Motion summary** — total distance, rapid distance, cut distance, estimated time

Hit **Play**. The tool marker cone animates through the toolpath. The stock box is animated to match the A/B rotations (forward kinematics of `T_aToTable · R_A · T_bToA · R_B`).

Watch for:
- **Red moves** — soft-limit violations. Fix by reducing stepdown, trimming boundary, or choosing a smaller tool.
- **Wild A/B swings** — near the 0° gimbal singularity. Post should handle but simulate to confirm.
- **Rapid through material** — if the tool cone goes through the stock during a rapid, your setup WCS is probably wrong.

## 5. Post to G-code (Control tab)

Click **Control**.

Top panel:
1. Click **Post → G-code**. Pentacad emits the full program in Pentamachine V2 `.ngc` dialect. Inspect it in the preview, or **Download** to save `program.ngc`.

The output will look something like:
```
%
(AXIS,stop)
(PROGRAM: 1001)
(PENTACAD v1.0.0 — machine: v2-50-chb — units: inch)
(CREATED: 2026-04-24T13:00:00Z)
N10 G20 G17 G90 G40 G54
N15 G94
N20 T1 M6 (T1: 1/4" flat endmill 2FL carbide)
N25 M3 S18000 M7
N30 (OP1: Pocket)
N35 G0 X0.0000 Y0.0000 Z0.2500
N40 G1 X1.5000 Y0.0000 Z-0.0393 F28.3
... 4,200 more lines ...
N9000 G94 M9 M5
N9005 M30
%
```

## 6. Stream to machine (Control tab, bottom)

Bottom panel:
1. **Bridge URL** — enter `ws://<controller-ip>:7777` (or use mock mode if no hardware)
2. Click **Connect**. The bridge state dot should turn green.
3. DRO starts updating live from the machine.
4. Click **Stream**. Pentacad pushes your G-code line-by-line with an 8-line window. Line counter ticks as each line completes.
5. Use **Pause / Resume / Abort** as needed. Abort triggers safe-Z + spindle-off + coolant-off.
6. **Jog pad** — X+/-/Y+/-/Z+/-/A+/-/B+/- for manual positioning. Each click is an incremental move at the set jog feed rate.

No hardware? Click **Use mock bridge** instead. You get a fake machine that acks every command and emits jittered DRO — useful for demos and dev.

## 7. Save / share

- **Save setup** — stores your setup + operation list in localStorage.
- **Export .ngc** — you already did this in step 5.
- **Share URL** — Phase 2. Planned feature to generate a cloud-backed link so you can send a setup to a colleague.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Toolpath is red / soft-limit violations | Stepdown or depth too large | Reduce stepdown; check WCS origin |
| Spindle speed clamped at 24000 RPM on V2-10 | V2-10 max spindle is 24k (the 40k ER20 is on V2-50 only) | Switch to V2-50CHB, or lower RPM |
| Bridge won't connect | Daemon not running or wrong port | `systemctl status pentabridge` on the controller. Default port 7777. |
| DRO stuck at 0,0,0 | Bridge in mock mode, or LinuxCNC not responding | Check connect returned `connected`; check `journalctl -u pentabridge` |
| Posted G-code rejected by machine | Pentamachine dialect mismatch | Compare our output to Matt's sample `.ngc`. Report any divergence. |
| `G93` inverse-time errors | Machine not in G93 mode when A/B moves issued | Post should auto-switch; verify `useInverseTime` in post properties |

## Where to go next

- **Load a real STEP file** — Design tab → Import → select `.step`. Our server-side converter at `/server/converter.py` handles files up to ~150MB.
- **Tune feeds for your material** — `window.CycleCAD.PentacadCAM.recommendFeeds({type, dia}, material)` returns our defaults. Override per-operation.
- **Write a custom tool library** — edit `machines/<your-machine>/kinematics.json` tools array.
- **Fusion 360 integration** — use `server/pentamachine-v2.cps` as a Fusion post, then open the output in Pentacad for sim.

Questions → `github.com/vvlars-cmd/cyclecad/issues` or `sachin.kumar@cyclewash.com`.
