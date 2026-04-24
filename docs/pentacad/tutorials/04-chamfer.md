# Tutorial 04 — Chamfer and deburr

*~10 minutes · V-bit engagement math explained*

Every part coming off the machine has sharp edges. A 0.010″ chamfer at 45° is the tiny detail that makes the part look professional. Pentacad's Chamfer strategy uses correct V-bit engagement math — not a fudge factor.

## The math

A 90° V-bit's effective cutting diameter depends on how deep you plunge:

```
engagement_dia = 2 × depth_plunge × tan(angle / 2)
```

For a 90° V-bit at 0.020″ plunge:
```
= 2 × 0.020 × tan(45°)
= 2 × 0.020 × 1
= 0.040″ wide chamfer
```

If you want a 0.030″ chamfer with the same 90° V-bit:
```
depth = 0.030 / (2 × tan(45°)) = 0.015″
```

Pentacad Chamfer asks for chamfer width + V-bit angle, and solves for plunge depth automatically.

## Build the operation

Prereq: a part with a closed boundary. Use the cover plate from tutorial 02, or import any STEP file with a top outline.

**+ Add operation → Chamfer / Deburr**

- Boundary: top edge of the pocket
- Chamfer width: 0.020″
- V-bit angle: 90°
- Tool: T4 — 90° V-bit engraver, 0.125″ dia
- Feed: 15 ipm
- Speed: 18 000 RPM

Pentacad computes plunge depth = 0.010″ (for a 0.020″ chamfer with a 90° V-bit). It follows the boundary with lead-in/lead-out arcs so the V-bit enters and exits cleanly.

## Simulate

The plunge looks small — 0.010″ — but the visible chamfer (width) is 0.020″ because the V-bit is 90°. This is why the math matters.

If you used a 60° V-bit instead, the same 0.020″ width needs a plunge of:
```
depth = 0.020 / (2 × tan(30°)) = 0.020 / 1.155 = 0.0173″
```

Pentacad re-computes automatically if you change the tool angle.

## Common mistakes

- **Plunging too deep.** A 0.050″ plunge with a 0.125″ dia V-bit will hit the shank and break the tool. Pentacad caps plunge at `tool_dia / 2 × cos(angle/2)` and warns you.
- **V-bit listed as flat.** If your tool library has the V-bit listed as type `flat`, the chamfer math will be wrong. Always use `type: vbit` and set `angle_deg` in the tool definition.
- **Wrong direction.** Chamfer usually wants climb-mill (same direction as pocket). Conventional-mill can chatter.

---

## What you learned

- V-bit engagement is geometric, not empirical
- Pentacad does the plunge-depth math from chamfer-width + V-bit-angle
- Two safety checks (max plunge, tool-type validation) prevent the common ways to break the V-bit

## Next

- [Tutorial 05 — Bore and thread-mill](./05-bore-thread.md)
- [Tutorial 06 — Bottle-opener ring](./06-bottle-opener-ring.md)
