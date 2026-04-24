# Tutorial 06 — Bottle-opener ring (full workflow)

*~45 minutes · CAM → Sim → Post → (Run) · the Pentamachine reference part*

This is the classic Pentamachine demo part — a wearable bottle-opener ring machined from a solid block of aluminium. Matt distributes the finished reference `.ngc` files with every machine; we'll reproduce one end-to-end in Pentacad.

## The part

A ring with:
- 0.6″ outer dia, 0.5″ inner dia
- 0.1″ thickness
- Bottle-opener notch cut into the rim
- Small hanging hole at the top
- Chamfered outer + inner edges

Machined from 0.75″ × 0.75″ × 0.2″ aluminium stock in one setup. Uses B-rotary indexing for the chamfer passes.

## Setup

Stock: 0.75″ × 0.75″ × 0.2″ aluminium. Sits on the B-rotary table, fastened with double-sided tape (vendor recommended for this part). WCS origin at the centre of the top face.

Operations (6 in sequence):
1. Face-mill the top flat
2. Pocket the inner bore (0.5″ dia)
3. Profile the outer dia (0.6″)
4. Cut the bottle-opener notch
5. Drill the hanging hole
6. Chamfer all edges (with B-rotary indexing)

## Operation 1 — Face top

- Tool: T1 — 1/4″ flat endmill
- Stepdown: 0.01″
- Total: 0.02″
- Speed/feed: 15 000 / 30 ipm

## Operation 2 — Bore the inner

- Tool: T2 — 1/8″ flat endmill
- Strategy: Helix-bore, 0.5″ dia
- Depth: 0.10″ (halfway through)
- Speed/feed: 20 000 / 25 ipm

## Operation 3 — Profile the outer

- Tool: T2 — 1/8″ flat endmill (same tool, no M6 needed)
- Strategy: 2D Contour, 0.6″ dia
- Stepdown: 0.025″
- Total depth: 0.10″ (cuts ring free when combined with Op 2)
- Tabs: 4, 0.020″ tall (holds the ring to the stock until chamfer is done)

## Operation 4 — Bottle-opener notch

- Tool: T2 — 1/8″ flat endmill
- Strategy: Pocket, 0.08″ × 0.15″ rect on the rim
- Depth: 0.05″
- Speed/feed: 20 000 / 25 ipm

## Operation 5 — Hanging hole

- Tool: T5 — 3 mm drill
- Strategy: G83 peck
- Point: (0, 0.28) — centred on top
- Depth: 0.08″ (through)
- Speed/feed: 3 500 / 4 ipm

## Operation 6 — Chamfer (5-axis)

This is the interesting one. We need to chamfer the outer rim all the way around. Doing it at A=0 leaves the chamfer only on the top edge. To chamfer the side, we need to tilt the workpiece.

- Tool: T4 — 90° V-bit
- Strategy: Chamfer
- Boundary: outer 0.6″ dia
- Width: 0.015″

Indexing: Pentacad automatically generates a multi-step toolpath:
- Step 1: A=30° (tilt 30° so V-bit hits side)
- Step 2: B=0° → B=90° → B=180° → B=270° (rotate in 4 steps, re-approaching with G93 inverse-time feed)
- Step 3: A back to 0°

```
G93                ( inverse-time for A/B moves )
G1 A30 F3
G94
G0 X-0.6 Y0 Z0.05
G1 Z-0.015 F10
G2 X-0.6 Y0 I0.6 J0 F15
G0 Z0.1

G93
G1 B90 F3
G94
... same chamfer arc ...

G93
G1 B180 F3
G94
... chamfer ...

( etc. )
```

## Post and simulate

Click Post-to-G-code. Resulting file: ~380 lines.

Open the simulator. Play at 10× speed. Watch:
- Tool change from T2 → T4 happens after the tabs
- A tilts to 30° (trunnion lifts in the viewport)
- B rotates in 90° steps (stock spins on the rotary table)
- Chamfer is cut on all 4 quadrants
- A returns to 0° before final retract

Estimated time: ~8 min at normal feeds.

## Run (if hardware available)

If connected to a real V2-50:
- Machine tab → verify connection (green dot)
- Production tab → CYCLE / START
- First air-cut: set Z offset 0.5″ above stock to dry-run
- Watch DRO, FEED HOLD if anything looks wrong
- Second run: actual Z, cut a part

Expected finish part: a wearable ring with a bottle-opener notch. Fits a US men's ring size 9–10. Hang it on a carabiner via the top hole.

## Compare against Matt's reference

Matt's canonical bottle-opener-ring `.ngc` is in `docs/pentacad/examples/bottle-opener-ring.ngc`. Diff your Pentacad-generated version against his:

```bash
diff matt-reference.ngc pentacad-output.ngc
```

Expected differences:
- N-numbering may differ
- Comment style may differ
- Our version uses 4-decimal; Matt uses 4-decimal too — should match
- Our feed rates may be slightly different (12-entry lookup vs. his hand-tuned)
- Motion geometry should be identical to ±0.001″

If motion differs by more than ±0.005″, there's a post-processor bug — file a GitHub issue.

---

## What you learned

- 6-operation setup with a tool change and 5-axis indexing
- 3+2 indexing = A tilt + B rotate + 3-axis cut at that orientation
- G93 inverse-time for rotary moves (mandatory in Pentamachine dialect)
- Tabs hold the part during contouring until chamfer finishes
- Validate by diffing against Matt's reference

## Next

- [Tutorial 07 — Simulator tour](./07-simulator-tour.md)
- (Future) Tutorial 08 — Running your first job on hardware
