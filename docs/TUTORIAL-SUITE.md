# cycleCAD Suite — Tutorial

*Updated 2026-04-25*

Five short tours, ~5 minutes each. They build on each other.

---

## Tour 1 — Run a G-code program in the Pentacad sim

**URL:** `http://localhost:8000/pentacad-sim.html`
*(Or `https://cyclecad.com/app/pentacad-sim.html` for the public version.)*

What you'll see: the Pentamachine V2-10 (your machine) with a small face-pass
program already loaded. Behaviour matches sim.pentamachine.com.

1. **Press Space** (or click the green ▶ in the bottom bar) to play.
2. Watch the trunnion tilt to A=90° at line 14, then trace a 2"×2" square.
3. **Drag the timeline** to scrub anywhere in the program.
4. **Change Speed** with the chip on the right of the playback bar — try 0.25× to slow-mo, 10× to fast-forward.
5. **Click the machine picker** (top bar) and try `V2-50` or `Solo`. Each
   loads a different real GLB model from sim.pentamachine.com's CDN.

**Behind the scenes:** the parser turns G-code into a list of
`{from, to, mode, duration}` moves. The animation loop interpolates
`pos.x/y/z/a/b` per frame and rotates the GLB's `a` and `b` mesh nodes.

---

## Tour 2 — Generate G-code from CAM, send to sim

**URL:** `http://localhost:8000/pentacad.html`

The full Pentacad app with five workspace tabs across the top.

1. Click **CAM** tab.
2. Pick `2D Pocket` from the operations list. Default params — leave them.
3. Click **▶ Generate toolpaths**. The CAM viewport draws a concentric pocket.
4. Click **↓ Post to G-code**. Right card shows lines / moves / cut distance / est. time.
5. Switch to **Simulate** tab. The same G-code is auto-loaded into the
   embedded Pentacad sim. Press Space to play.

If you don't see the embedded sim, click **↗ Pop out** in the side panel —
opens the standalone sim in a new tab.

---

## Tour 3 — Ask the AI Copilot to design a part

**URL:** `http://localhost:8000/index.html` (cycleCAD main app)

1. **Tools menu → 🛠 AI Copilot** (or Cmd+Shift+K).
2. Type: `M8 hex nut`. Click **Run**.
3. The Copilot creates the geometry directly in the cycleCAD viewport —
   correct DIN 934 across-flats and thickness for M8 (13 mm AF, 6.5 mm thick).
4. Try other prompts:
   - `spur gear 20 teeth module 2 bore 10mm`
   - `L-bracket 60mm 4 holes 12mm centers`
   - `pulley 80mm bore 12mm`
   - `bearing housing for 6204`
   - `bottle-opener ring`

**Behind the scenes:** if the prompt matches a built-in template,
the Copilot bypasses the LLM and runs the deterministic geometry plan.
Otherwise the configured LLM (Claude Sonnet 4.6 by default, fall-back to
Gemini 2.0 Flash or Groq Llama 3.3 70B) emits a JSON plan that the
mini-executor renders.

---

## Tour 4 — Verify a bolted joint with the AI Engineer

**URL:** `http://localhost:8000/index.html` → **Tools → 🔩 AI Engineering Analyst**

1. Click the **MecAgent demo** preset button.
2. Form fills with the exact problem from MecAgent's website:
   - 4 × M12 bolts class 10.9
   - Shear 18 kN, axial 18 kN, moment 420 Nm
   - Friction 0.16, preload 39 kN, BCD 96 mm, safety factor 1.5
3. Verdict banner reads `SAFE (bearing-type)` because slip resistance fails
   (24960 N < 39000 N) but stress check passes (σ_vm 559 MPa < proof 936 MPa).
4. Switch the **analysis tab** to:
   - **Spur gears** — AGMA bending + pitting per Shigley Ch 14
   - **Shaft fatigue** — Goodman / Soderberg / first-cycle yield
   - **Rolling bearings** — ISO 281 L10 = (C/P)^a × 10^6 rev
   - **Fillet welds** — AWS D1.1 throat stress

Every number is computed by pure JS analytical functions. The LLM only
parses your prompt and writes the narrative. Math is deterministic and
verifiable. 28/28 self-tests pass on module load.

---

## Tour 5 — Render a CAD model in ExplodeView

**URL:** `https://explodeview.com`

1. Drag-drop a STEP file (or click "Try the demo" for the bundled
   cycleWASH bike-washing-machine assembly).
2. Click **Explode**. The 399 components fan out.
3. Click any component — info card with material, weight, McMaster-Carr search.
4. Click **AI Render**. Pick `Industrial / studio`. Type a scene prompt.
5. Wait ~10 s — Gemini Nano Banana 2 returns a photorealistic image with
   your CAD model preserved (preservation-first prompt logic in v304).
6. Click **AR Mode** on a phone. WebXR places the assembly on your floor.

ExplodeView uses RoomEnvironment lighting (PBR) for photoreal reflections,
unlike the Pentacad sim which uses bare matte lighting.

---

## Where to next

- `docs/HELP-SUITE.md` — keyboard shortcuts + FAQ + troubleshooting
- `docs/ARCHITECTURE.md` — how it's all built
- `app/demo/index.html` — pre-canned showcases of all five tours
- `app/tests/all-tests.html` — run the full test suite
