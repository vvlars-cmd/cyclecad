# GLBs converted from Sachin's STEP uploads

Converted via `cascadio.step_to_glb` from the v19/v11 STEP files at
`~/cycleCAD-Suite/shared/lib/penta-machines/`. Saved here as reference
assets, NOT live machine models.

| File | Source STEP | Nodes | Meshes |
|---|---|--:|--:|
| `v2-50-simplified.glb`        | `V2-50 Machine Model - Simplified v11.step`              | 43 | 31 |
| `v2-pocketnc-kinematic.glb`   | `V2PocketNC_both_toolholders_Kinematic_Assembly v19.step`| 15 | 12 |

## Why these aren't loaded yet

`pentacad-sim.html` rigs the kinematic chain in `setupGlbKinematics()` by
looking up nodes by exact lowercase names — `x`, `y`, `z`, `a`, `b`,
plus tool-holder names matching `LONG`, `SHORT`, `collet*`. The Pentamachine
GLBs that ship at `app/models/<id>.glb` follow that convention; the
STEP-converted GLBs above use descriptive CAD names instead.

## Node-name mapping (for the future swap)

To make `v2-50-simplified.glb` (or the kinematic variant) work as a
drop-in replacement, the conversion pipeline needs to:

1. Group nodes hierarchically as `Base → y → a → b` and `Base → x → z`.
2. Rename — eyeballing from the v11 file's labels:

   | STEP label | Target node name |
   |---|---|
   | `X Carriage:1`           | parent group `x` |
   | `X Rail:1`, `X Rail (1):1`, `_SRS9XM1905 Track:*` | children of `x` |
   | `Y Rail:1`, `Y Rail (1):1`, `_SRS9XM22613 Track:*` | parent group `y` |
   | `Trunnion:1`, `A Axis Backing Plate:1`, `Main Block:1`, `L Bracket:1` | parent group `a` |
   | `B Disc:1`               | parent group `b` |
   | `Z Rail:1`, `_SRS15WMSS1 Slider:1`, `10083 - V2-50 Spindle Mount:1` | parent group `z` |
   | `X Motor:1`, `Y Motor:1`, `Z Motor:1`, `A Motor:1`, `B Motor:1`, all `Nema 17 *` children | static — leave at scene root or attach to whichever axis they ride with |
   | `Tool Probe:1`           | left at scene root, can be hidden by default |

3. Author each group's local origin so:
   - Translation along the group axis matches Pentamachine kinematics
     (X = horizontal, Y = vertical, Z = depth — see `DEFAULT_KIN_AXES`
     in pentacad-sim.html line ~2258).
   - The home pose puts the spindle outside the trunnion bore, not
     inside it — this is what the per-machine `homeNudge` knob currently
     compensates for empirically.

## Pipeline ideas

- **Manual** — open the GLB in Blender, rebuild the hierarchy, re-export.
  Highest fidelity, takes ~30 minutes per machine.
- **Scripted** — pythonocc-core can read the STEP assembly hierarchy,
  including nested transformations, and emit a structured glTF. Would
  preserve assembly joints which `cascadio` flattens.
- **Hybrid** — use `cascadio` for geometry, then a Python `pygltflib`
  pass to rename + nest nodes per the table above.

## V2-PocketNC kinematic file

The `V2PocketNC_both_toolholders_Kinematic_Assembly v19.step` file is
much smaller (12 meshes) and already groups the kinematic moving parts:
`X_Carriage_Kinematic1:1`, `Main_Block_Kinematic2:1`, `simulation spindle
extended:1`, `V2 B housing kinematic only v8:1`, `V2PocketNC_A housing
v3:1`, `motor mount:1`, `motor:1`, etc. The `Kinematic_Assembly` naming
suggests it was set up in CAD with proper joint placement — the
spindle/trunnion alignment in this file is likely the canonical pose
Penta's runtime aims for.

This is the file to focus on for the GLB swap — it's smaller, cleaner,
and already has the right joint geometry.

## See also

- `~/cycleCAD-Suite/HANDOVER-PENTACAD-V2.md` §"What you have to start the next attempt"
- `~/cycleCAD-Suite/PENTACAD-V1-VS-PENTA-DIFF.md`
- `pentacad-sim.html` `setupGlbKinematics()` and `MACHINES.<id>.homeNudge`

---

## v0.5.7 — automated rename pipeline shipped

`~/cycleCAD-Suite/scripts/step-to-pentacad-glb.py` now does the rename
+ re-parent pass automatically. Run it on either uploaded STEP and
get a GLB whose hierarchy matches v1's `Base → x → z` / `Base → y → a → b`
convention. Two outputs land here:

| File | Source STEP | Total nodes | x/y/z/a/b children counts |
|---|---|--:|---|
| `v2-50-renamed.glb`        | `v2-50-simplified-v11.step`              | 49 | 5 / 4 / 4 / 4 / 1 |
| `v2-pocketnc-renamed.glb`  | `v2-pocketnc-kinematic-v19.step`         | 21 | 2 / 1 / 1 / 0 / 2 |

`v2-50-renamed.glb` has the cleaner kinematic chain — every named
sub-mesh from the v11 STEP file landed in the right group. To make it
the live model:

```bash
cp ~/cyclecad-website/app/models/from-step/v2-50-renamed.glb \
   ~/cyclecad-website/app/models/v2-50.glb
```

Note that the renamed GLB still doesn't include the `LONG`/`SHORT`/`collet`
holders — those came from the original Pentamachine GLBs. To preserve
holder geometry, the next iteration should merge the two: keep
authoritative kinematic geometry from the renamed STEP-GLB, splice in
the LONG/SHORT/collet meshes from the original Pentamachine GLB.

To regenerate from a fresh STEP:

```bash
python3 ~/cycleCAD-Suite/scripts/step-to-pentacad-glb.py \
  /path/to/source.step \
  /path/to/output.glb \
  --variant v2-50 --verbose
```

Dependencies: `pip install cascadio pygltflib`.
