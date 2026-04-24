# Tutorial 05 — Bore and thread-mill

*~20 minutes · precision holes and internal threads without taps*

Drilled holes are good for clearance holes (tolerance ±0.005″). For press-fit bores or dowel-pin holes (±0.0005″) or for internal threads, you need to bore and thread-mill. Pentacad supports three bore strategies + single-tooth thread-milling.

## Bore strategies

### Straight bore
Plunge, feed down, retract. Simple but leaves a mark at entry. Use for through-bores where entry finish doesn't matter.

### Helix-bore
Helical interpolation down to depth. Continuous cut, no entry mark. Use for blind bores.

### Spiral-bore
Helical in, then helical out. Finishes both walls. Use for precision bores where roundness matters.

## Build a straight bore

**+ Add operation → Bore → Straight**

- Point: (0, 0)
- Diameter: 0.250″
- Depth: 0.500″
- Tool: T2 — 1/8″ endmill (we'll interpolate)
- Feed: 15 ipm
- Speed: 20 000 RPM
- Stepdown: full depth (single plunge)

This plunges the 1/8″ tool at X=0, Y=0, down to Z=-0.5, then retracts.

For a 0.250″ dia with a 1/8″ tool, Pentacad's helix-bore is better — no plunge, spiral down.

## Build a helix-bore

**+ Add operation → Bore → Helix**

Same params. Pentacad generates:
```
G2 X0 Y0 I-0.0625 J0 Z-0.0625 F15
G2 X0 Y0 I-0.0625 J0 Z-0.125 F15
... continues down to Z=-0.5
```

G2 is CW helical interpolation. I/J gives centre offset; the Z argument causes the helical descent. This is how you bore with a tool smaller than the hole — set hole_dia then helix around it.

## Thread-mill an M6 × 1.0 internal thread

M6 is a 6 mm major diameter with 1 mm pitch. Internal threads = minor ~ 5 mm. A thread mill with a 1/8″ (3.175 mm) tooth fits inside a 5 mm minor.

**+ Add operation → Thread-mill**

- Hole: M6 × 1.0 (pre-drilled to 5.0 mm — separate drill op)
- Depth: 6 mm (full thread)
- Tool: T6 — single-tooth thread mill, 0.125″ dia
- Direction: right-hand (standard)
- Speed: 12 000 RPM
- Feed: 100 mm/min

Pentacad generates a helical interpolation with pitch = 1.0 mm:
```
G21          ( switch to mm for M6 )
G0 X0 Y0 Z2
G0 Z-6       ( plunge to bottom )
G1 X1.5 Y0 F80     ( move to thread radius )
G3 X1.5 Y0 I-1.5 J0 Z-5 F100  ( turn 1, climb 1mm )
G3 X1.5 Y0 I-1.5 J0 Z-4 F100  ( turn 2 )
G3 X1.5 Y0 I-1.5 J0 Z-3 F100
G3 X1.5 Y0 I-1.5 J0 Z-2 F100
G3 X1.5 Y0 I-1.5 J0 Z-1 F100
G3 X1.5 Y0 I-1.5 J0 Z0 F100   ( turn 6, at surface )
G1 X0 Y0 F200    ( retract to centre )
G0 Z5
```

Six turns × 1 mm pitch = 6 mm climb. The thread forms as the single tooth traces a helix at the thread minor radius.

## Why thread-mill instead of tap?

- **Tap limits.** A 6 mm tap needs ~60 mm × 6 mm = 360 mm torque. Pentamachine V2-10 (24 k RPM ER11 spindle) can't deliver that. V2-50 (40 k RPM ER20) also can't — tapping is a low-RPM, high-torque operation.
- **Thread-mill flexibility.** Same tool makes M3–M12, LH or RH, partial threads, blind threads without a plunge at the bottom.
- **Broken tool recovery.** A broken tap stuck in a hole is nightmare to remove. A broken thread-mill pulls out with tweezers.

## Simulate the helix

In the Pentacad simulator, the helical descent looks like a spring. Count the turns: 6 for M6×1.0 at 6 mm depth. If you see 5.something turns, your Z-climb-per-turn is off — check your math.

---

## What you learned

- Three bore strategies: straight (through), helix (blind), spiral (precision)
- Thread-milling replaces tapping on lightly-loaded spindles like Pentamachine
- Every turn of a thread mill = 1 pitch of Z climb (must match exactly)

## Next

- [Tutorial 06 — Bottle-opener ring (full workflow)](./06-bottle-opener-ring.md)
- [Tutorial 07 — Simulator tour](./07-simulator-tour.md)
