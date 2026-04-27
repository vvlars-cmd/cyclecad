# Penta Machine Post · Install + Maintenance Guide

> Vendored at: `shared/postprocessors/penta-machine.cps`
> Mirrors the Pentacad user manual section on Fusion / Inventor / Mastercam
> integration. Pinned version + minimumRevision are read straight from the
> .cps header (see § 4 below).

---

## 1. Fusion 360

Fusion 360's post library accepts the .cps file as-is — no wrapper, no
package, no signature.

1. **Drag-drop install.** From a finder/explorer window, drag
   `shared/postprocessors/penta-machine.cps` onto the Fusion 360 window's
   *Manage* tab → *Post Library* panel. Fusion places it in
   `%APPDATA%/Autodesk/Fusion/CAM/Posts/local` (Windows) or
   `~/Library/Application Support/Autodesk/Fusion 360/CAM/Posts/local`
   (macOS).

2. **Wire it to a Setup.** Open the CAM workspace, edit a Setup, and under
   *Post Process* choose **Penta Machine**. Fusion will detect the
   `extension = "ngc"` declaration in the header and write `.ngc` files.

3. **Pick a machine variant.** The `longDescription` block in the .cps lists
   every supported model — Solo, Pocket NC V1, V2-8L, V2-10, V2-50. The
   Machine Configuration drives TCPC: the V2-8L and V1 default to **off**;
   tick the *TCP* box per rotary axis only if the machine has the Kinetic
   Control upgrade.

4. **Run *Test Post*.** Right-click any toolpath and choose *Post Process*.
   Fusion drops a console at the bottom — successful posts say
   `Post processing completed successfully`. Non-zero exit codes flag a
   parameter mismatch; the most common cause is the wrong post version (see
   § 4) or a Setup that uses a tool the Penta library doesn't define.

---

## 2. Inventor (HSM / CAM module)

Inventor's CAM module is built on the same Autodesk post-processor engine —
the same .cps file works without modification.

1. **Drop the .cps into the Inventor post folder.**
   - Windows: `%APPDATA%/Autodesk/CAM/posts/penta-machine.cps`
   - macOS:   `~/Library/Application Support/Autodesk/CAM/posts/penta-machine.cps`

2. **Refresh the post list.** In Inventor's CAM ribbon, expand
   *Setup* → *Post Process Properties*. The *Posts* combobox should now show
   *Penta Machine*. If not, restart Inventor — the CAM module caches the
   post directory on first launch.

3. **Tool library.** Penta's stock tool library (`shared/tools/penta.json`)
   has matching numbers for the same tools the Fusion library ships. Import
   the .json into Inventor with *CAM → Manage → Tool Library → Import*.

---

## 3. Mastercam

Mastercam uses .pst (Mastercam Post Text), not .cps. We ship a converter
script:

1. **Run the converter.**
   ```bash
   node scripts/cps2pst.mjs \
     shared/postprocessors/penta-machine.cps \
     --out shared/postprocessors/penta-machine.pst
   ```
2. **Drop the .pst into Mastercam's posts folder.** Default location is
   `C:\Users\Public\Documents\Shared Mcam2024\mill\Posts\`.
3. **Wire it to a Machine Definition.** *File → Open* the .mcam-mmd
   file and assign the new .pst as the active post.

> Mastercam's NCI → MMD conversion table differs from Fusion's. Check the
> Penta toolchanger M-codes after the first post — the converter script
> emits a stub for `M6 T#` but Mastercam's macro library may already
> provide one.

---

## 4. Bumping the post version

Every Penta Machine post update bumps two header fields:

```cps
$Revision: 44221 b726d042f4ff491778a5644fb3dc3d931aa51946 $
$Date:     2026-04-09 06:41:28 $
minimumRevision = 45917;
```

`$Revision:` is the canonical version pin. The admin-fusion-post widget
parses the integer prefix and renders it as a pill (`r44221`). Bump the
revision number in the .cps header; the widget will pick up the new value
on its next mount.

`minimumRevision` is the **lowest** Fusion 360 build that still understands
this post. If you raise this number, Fusion users on older builds will see
*"Post processor requires a newer version"* — bump deliberately.

---

## 5. Differences from generic LinuxCNC

The Penta post is a Kinetic-Control-flavoured emitter — broadly compatible
with LinuxCNC, with these targeted differences:

| Topic                   | Generic LinuxCNC          | Penta Machine post                             |
|-------------------------|---------------------------|------------------------------------------------|
| File extension          | `.ngc`                    | `.ngc` (same)                                  |
| Tool change             | `M6 T#`                   | `M6 T#` + `M700` prep (KC-specific)            |
| TCPC enable             | `G43.4 H#`                | `G43.4 H#` (same; respects Setup TCP toggle)   |
| Probing                 | `G38.2..5` standard       | `G38.2..5` (G38.4/5 await firmware r45917+)    |
| Spindle ramp            | `M3 S#`                   | `M3 S#` + KC ramp delay parameter              |
| Coolant                 | `M7` mist · `M8` flood    | same                                           |
| Block-skip              | `/`                       | `/` (KC honours block-skip on `Pause`)         |

Pentacad's user manual mirrors this table — keep them in sync when bumping
the post.

---

## 6. Verifying the install

Fusion's *Test Post* workflow is the canonical verifier:

1. Open *Manage* → *Post Library*. Right-click *Penta Machine* → *Edit*.
2. Click *Test Post*. Fusion runs an internal example tape and surfaces any
   parameter / capability mismatch.
3. Inspect the generated NGC. The first non-comment line should read
   `G21 G90 G94 G54` (Penta's default modal prologue). If you see anything
   else, the post or the Machine Configuration is mis-paired.

For Inventor, repeat the steps above from the CAM workspace's
*Edit Post Properties* dialog. Mastercam's verification is built into
*Operation → Post* — a green checkmark means the .pst loaded; a red one
means the converter failed mid-translation (re-run § 3).
