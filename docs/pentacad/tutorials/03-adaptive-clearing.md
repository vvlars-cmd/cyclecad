# Tutorial 03 — Adaptive clearing

*~15 minutes · the "fast rough" strategy*

Offset-ring pocketing (tutorial 02) is simple but not efficient — the tool engages the full stepover on every cut. Adaptive Clearing keeps the tool engagement constant (~30–40 %), which lets you run much faster feed rates with the same chip load.

Pentacad 1B ships a **concentric-ring approximation** of adaptive clearing: true adaptive requires a medial-axis transform which is coming in Phase 2. For now, concentric rings cover 80 % of use cases and give roughly 2× faster run times than pocket.

## When to use it

| Use | Strategy |
|---|---|
| Shallow pocket, soft material, aesthetic bottom | Pocket |
| Heavy material removal, tough material (tool steel, Inconel), long runs | Adaptive |
| Odd-shaped region (not a rectangle) | Adaptive |
| Finish pass | 2D Contour |

## Build the operation

Stock 3″ × 2″ × 1″. Single region: 2.0″ × 1.0″ rectangle centred on origin.

**+ Add operation → Adaptive Clear**

- Region: same 2″ × 1″ rectangle
- Depth: 0.25″
- Tool: T2 — 1/8″ flat endmill
- Engagement: 35 %
- Stepdown: 0.05″ (5× what Pocket would use — we can because the load stays constant)
- Trochoidal retract: on
- Speed: 24 000 RPM
- Feed: 80 ipm (3× Pocket's feed — Adaptive lets us)

Generate. The toolpath is a series of concentric rings that shrink toward the centre, with trochoidal retracts connecting them. Run time estimate: ~0.6 min vs. ~1.8 min for the equivalent Pocket.

## Simulate

In the simulator, watch how the tool never lifts — it's always in the stock, always engaged, always at the same RPM. This is what doubles your tool life.

Compare the Stats tab against the Pocket version:
- Adaptive: fewer rapid moves, more continuous feed
- Adaptive: higher peak spindle load (check machine's spindle tab), but lower peak tool deflection

## Limitations of the concentric-ring approximation

The real adaptive clearing algorithm (Emuge, HSMWorks, Fusion) computes the **medial axis** of the remaining stock and walks it outward. Our ring approximation works well for convex regions but can leave small uncut corners in concave regions (like an L-shape).

Workaround: use Adaptive for bulk removal, then a finishing Pocket or 2D Contour pass at low stepdown to clean up.

Phase 2 replaces the ring approximation with a true medial-axis algorithm.

---

## What you learned

- Adaptive is ~2× faster than Pocket for roughing
- Constant engagement = constant tool load = longer tool life + faster feeds
- Ring approximation covers convex shapes perfectly; concave shapes may need a finishing pass

## Next

- [Tutorial 04 — Chamfer and deburr](./04-chamfer.md)
- [Tutorial 06 — Bottle-opener ring (full workflow)](./06-bottle-opener-ring.md)
