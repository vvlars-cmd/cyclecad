# Tutorial 02 — Pocket with drilled holes

*~20 minutes · adds a second operation and a tool change*

You'll build a cover plate: a rectangular pocket (1.5″ × 1.0″ × 0.1″ deep) with four M3 mounting holes at the corners. This introduces multi-operation setups and tool changes.

## Stock

Same V2-50 preset (3″ × 2″ × 1″). WCS at centre-top.

## Operation 1 — Pocket

**+ Add operation → Pocket**

- Region: rectangle, 1.5″ × 1.0″, centred
- Depth: 0.1″
- Tool: T2 — 1/8″ flat endmill 2FL
- Stepover: 40 %
- Stepdown: 0.02″
- Finish allowance: 0.005″
- Entry: helical, 0.1″ diameter
- Speed: 20 000 RPM (auto for 1/8″ Al)
- Feed: 25 ipm (auto)

Click **Generate**.

Notice the offset-ring pattern: the toolpath spirals inward from the outer boundary toward the centre, peeling 40 % of the tool diameter per ring. This is what "pocket" means in Pentacad — classic offset roughing. If you want constant engagement, use Adaptive Clear (tutorial 03).

## Operation 2 — Drill 4 corners

**+ Add operation → Drill**

- Points: 4 corners of a 2.0″ × 1.2″ rectangle (so each hole is 0.25″ inside from the pocket edge)
- Through-depth: 0.2″
- Tool: T5 — 3 mm HSS-Co drill
- Cycle: G83 peck
- Peck depth: 0.05″
- Retract plane: 0.1″
- Speed: 3 500 RPM
- Feed: 4 ipm

Click **Generate**.

## Post

Click **Post-to-G-code**. The downloaded file has both operations in sequence:

```
( Pentacad — cover-plate )
G20 G90 G94 G17 G40 G54

( Op 1: Pocket, T2 )
T2 M6
S20000 M3
G0 Z0.2
... pocket motion ...

( Op 2: Drill, T5 )
T5 M6
S3500 M3
G0 X-1.0 Y-0.6
G83 X-1.0 Y-0.6 Z-0.2 R0.1 Q0.05 F4
G83 X1.0 Y-0.6 Z-0.2 R0.1 Q0.05 F4
G83 X1.0 Y0.6 Z-0.2 R0.1 Q0.05 F4
G83 X-1.0 Y0.6 Z-0.2 R0.1 Q0.05 F4
G80
M5 M30
```

## Simulate

Watch the tool-change transition. When T5 is selected, the viewport tool visualisation switches to a drill (cone with point) and the DRO tool indicator updates.

Canned cycle G83 shows the peck pattern: down-retract-down-retract-retract-to-start-plane. Each hole takes 4 pecks × 2 moves = 8 moves.

## Common pitfall: tool change with spindle on

Look closely at the G-code. Between Op 1 and Op 2, there's a **T5 M6** but no **M5** first. That's fine here because the post inserts the M5 before M6 automatically — but if you hand-edit G-code, always M5 before M6 to protect the spindle motor.

Pentacad's simulator flags this as a warning in the Issues tab when it detects T... M6 without a preceding M5.

---

## What you learned

- Multiple operations in one setup
- Tool changes (M6) and why the order matters
- Canned cycle G83 for peck drilling
- Issues tab surface warnings, not hard errors — your judgment still matters

## Next

- [Tutorial 03 — Adaptive clearing](./03-adaptive-clearing.md)
- [Tutorial 04 — Chamfer and deburr](./04-chamfer.md)
