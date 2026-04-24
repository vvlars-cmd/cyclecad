# What we still need from Pentamachine (Matt)

> Based on everything shipped in Pentacad v1.0.0.
> Updated: 2026-04-24 after session 5 (Kinetic Control disk image decoded + suite positioning locked).

**Strategic note.** Matt is a **neutral ecosystem supplier** (he said "we provide feedback for 4+ companies working on similar CAM concepts"). He is not a partner. All asks below are technical only — nothing exclusive, nothing that depends on a partnership discussion.

We are **not blocked** waiting for any of this. Every item has a workaround. The asks are for quality improvements, not showstoppers.

---

## Priority A — would significantly improve Pentacad quality

### A1. Native 3D models (GLB) for V1, V2-10, V2-50, Solo
**Status:** we auto-fetch GLBs from the connected machine's `/opt/penta-ui-builds/gltf/` — works for the machine in front of you, but not for showing other variants on the website.

**Workaround we built:** simplified Three.js proxy (column + spindle head + trunnion + rotary table) is generated from machine JSON. Acceptable for simulation, unimpressive for marketing.

**Ask:**
- V1, V2-10, V2-50, Solo GLBs as standalone downloads (we'd host them in the repo or the suite CDN)
- V2 vise accessory GLB as a separate file (we see `v2-vise.glb` on the machine but not on pentamachine.com)

**Why now:** the suite's `/pentacad.html` marketing page is missing proper visuals of all 4 variants.

### A2. Confirmed envelope + rapid + feed values per variant
**Status:** machine JSON has estimated values with `_confirmed: false` flags. We'll validate against the physical V2-50 tomorrow, but the other three variants will remain speculation.

**Workaround we built:** everything not confirmed is labeled as estimated in the UI. Soft-limit check uses the spec-sheet values as a conservative envelope.

**Ask:** for each of V1, V2-10, V2-50, Solo, the active `PocketNC.ini` or at least the `[AXIS_X/Y/Z/A/B]` sections showing:
- `MIN_LIMIT` / `MAX_LIMIT`
- `MAX_VELOCITY`
- `MAX_ACCELERATION`
- `HOME_OFFSET`

Doesn't have to be from hardware — the INI templates at `/opt/pocketnc/Settings/versions/<boardRev>/PocketNC.ini` would be enough.

### A3. Post-processor validation
**Status:** our `server/pentamachine-v2.cps` (Fusion-post) and the Pentacad internal post both emit what we think is the Pentamachine V2 dialect. We verified it against the one reference file we have (bottle-opener ring).

**Workaround we built:** diff-test infrastructure — any PR that changes the post runs the reference program through both and compares byte-for-byte.

**Ask:** 3–5 additional `.ngc` samples Matt has around. Different part types, different strategies — anything with A or B motion would be especially valuable for verifying G93 inverse-time handling. Ideally with the source CAD (Fusion or STEP) so we can reverse-engineer what CAM generated it.

### A4. Tool library — what ships stock with each variant
**Status:** we hardcoded a small tool library from Matt's marketing page (ER20 with 1/4″ flat, 1/8″ flat, 1/8″ ball, 90° V-bit, 3 mm drill). We're guessing on the V2-10 / V1 stock loadout.

**Ask:** the actual tool list shipped with each machine, with diameters, flute counts, and max RPM. A JSON or CSV would be perfect.

---

## Priority B — nice to have, not urgent

### B1. Rockhopper CORS — add a config flag instead of hardcoded regex
**Status:** Rockhopper's origin check regex is hardcoded to `https?://([a-z0-9]+\.)?pocketnc.com`. Pentacad served from anywhere else gets rejected.

**Workaround we built:** serve from `localhost` (empty Origin header passes). Documented in PRE-FLIGHT-CHECKLIST.md.

**Ask:** expose the allowed-origins list as a config option in Rockhopper. A `ROCKHOPPER_ALLOWED_ORIGINS` env var would be ideal. Not a blocker for shop-floor use; matters for SaaS-style deployment.

### B2. halui pin documentation
**Status:** we read the pin names from the disk image strings dump (that's how we found that `.value` pins are read-only and `.direct-value` are the correct setters).

**Workaround we built:** documented the correct pins in `docs/pentacad/kinetic-control-facts.md` and the comments in `rockhopper-client.js`.

**Ask:** an official halui pin reference for the Pentamachine HAL config. Not a full HAL tutorial — just the list of settable pins with their legal ranges.

### B3. G-code dialect spec
**Status:** we inferred the dialect from reference files (G20, G90, G94, G54 default; G93 inverse-time for A/B moves; 4-decimal linear, 3-decimal rotary).

**Ask:** a one-page spec or a link to the LinuxCNC interpreter docs page that describes the Pentamachine variant. Would prevent ambiguities like "does the post need G40 explicitly or is it assumed?".

### B4. Kinematics module details
**Status:** the `pocketnckins` kinematics module is the one that does the A-tilt + B-rotary forward/inverse kinematics in LinuxCNC. Our forward-kinematics JS code matches what we reverse-engineered, but there might be subtleties (axis offsets, calibration overlays from `CalibrationOverlay.inc`).

**Ask:** a quick walkthrough of the kinematics math. If there's a PDF or a slide deck already, that's perfect. If not, pointing at the authoritative source code file is enough.

### B5. Singularity handling
**Status:** when A is near 0°, the B-axis gimbals — small XY motion requires huge B rotation. We log a warning in the limits tab but don't do anything clever.

**Workaround we built:** post-processor favours non-zero A when reachable.

**Ask:** is there a standard handling in PocketNC's post that does "if abs(A) < ε then force A to ε before commanding B"? That's what we're about to implement if we don't hear otherwise.

---

## Priority C — only if super easy

### C1. Tolerance / calibration constants
**Status:** we assume zero offsets in `CalibrationOverlay.inc`. Every real machine has a few thousandths of an inch of offset from nominal kinematics.

**Ask:** a representative `CalibrationOverlay.inc` example file — we can parse it and apply the offsets in the simulator so the DRO matches what the real machine reads back.

### C2. Spindle VFD behaviour
**Status:** we animate the spindle by reading the S-commanded RPM. Real VFDs ramp up and down — the actual RPM lags the command.

**Ask:** does Rockhopper expose the actual RPM separately from the commanded RPM? (I think it does — `spindle_speed` vs. `spindle_cmd` — but haven't confirmed.) Knowing the real VFD accel/decel time would let us show that ramp in the simulator.

### C3. Coolant details
**Status:** M7 = mist, M8 = flood, M9 = off. We assume flood isn't supported on most Pentamachines (it's a desktop 5-axis, flood makes a mess).

**Ask:** which M-codes are wired to which coolant outputs on each variant? A sentence per variant is enough.

---

## Priority D — future roadmap, not needed for launch

### D1. Tool probe integration
Matt's M6 probe feature is available via the `m6_tool_probe` feature flag in `PocketNC/Settings/features/`. Full integration with Pentacad's tool-change workflow is Phase 3. We'd welcome early conversation about how the probe cycle is exposed to G-code (G38.2? A custom M-code?).

### D2. Wrapped-rotary feature
`wrapped_rotary` is another Settings feature. Lets B exceed ±360° without violating soft limits. We mark our machine JSONs with `continuous: true` but the exact interaction with the INI override is unclear.

**Ask:** one sentence confirming that `continuous: true` in our JSON is semantically equivalent to `wrapped_rotary` enabled in INI.

### D3. Probe calibration
Not Phase 1 scope — just capturing that this will matter eventually.

### D4. Multi-machine fleet view
Not an ask — capturing that if a shop runs 4 Pentamachines, Pentacad's Production tab should show all 4 DROs simultaneously. Phase 4.

---

## What we explicitly don't need

- **NDAs** — Matt already said no, and we don't need them for any of the above.
- **Exclusivity** — Pentacad is AGPL + commercial. Matt can tell his other CAM-developing partners the same things. We just want the facts, not the protection.
- **Equity partnership** — off the table per the pilot intelligence brief. Not on this list.
- **Marketing co-op** — later. Not on this list.

---

## Suggested message to Matt

> Hi Matt —
>
> We're about to hit our first real-hardware milestone on Pentacad (the CAM module of the cycleCAD Suite). Everything below is for quality improvements, not showstoppers; we've built workarounds for all of them and can ship without any of them.
>
> **Highest value, lowest effort:**
> 1. Standalone GLBs for V1, V2-10, V2-50, Solo (we can only fetch from a connected machine right now)
> 2. Representative `PocketNC.ini` per variant (envelope + feeds + accel) — or even just the template at `/opt/pocketnc/Settings/versions/<boardRev>/`
> 3. 3–5 reference `.ngc` files with A or B motion (we have the bottle-opener-ring already — just need a few more)
> 4. The stock tool list per variant (diameter, type, flutes, max RPM)
>
> **If time permits:**
> 5. Confirmation on singularity-handling convention in your post (force small non-zero A?)
> 6. Whether `continuous: true` in our machine JSON is equivalent to `wrapped_rotary` feature flag
>
> Pentacad is AGPL + commercial; none of the above creates any exclusivity obligation on your end. Your other CAM partners can get the same info.
>
> We'll be publicly launching this summer. Happy to send you a preview of the suite site and the `/pentacad.html` marketing page once #1 is sorted — until then the visuals are placeholders.
>
> Thanks,
> Sachin

---

## Current state of each ask

Track by editing this table when Matt responds:

| ID | Ask | Requested | Received | Status |
|---|---|---|---|---|
| A1 | GLBs (4 variants + vise) | not yet | — | pending |
| A2 | INI templates per variant | not yet | — | pending |
| A3 | 3–5 reference .ngc files | partial (1 file) | bottle-opener-ring | partial |
| A4 | Stock tool list per variant | not yet | — | pending |
| B1 | Rockhopper CORS config flag | not yet | — | pending (low priority) |
| B2 | halui pin reference | not yet | — | workaround shipped |
| B3 | G-code dialect spec | not yet | — | inferred ✓ |
| B4 | Kinematics walkthrough | not yet | — | inferred ✓ |
| B5 | Singularity handling convention | not yet | — | our heuristic shipped |
| C1 | CalibrationOverlay.inc example | not yet | — | not needed for v1 |
| C2 | Actual vs commanded spindle RPM | not yet | — | not needed for v1 |
| C3 | Coolant M-codes per variant | not yet | — | assumed |
| D1 | Tool probe | not yet | — | Phase 3 |
| D2 | wrapped_rotary ↔ continuous mapping | not yet | — | assumed equivalent |
