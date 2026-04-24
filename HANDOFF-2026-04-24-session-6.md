# Handoff — session 6 end (2026-04-24, late)

> Pick this up in the next chat. Read me first, then scan the latest session 6 block in `~/cyclecad/CLAUDE.md` for full detail.

---

## TL;DR

- **Everything for Pentacad v1.0 shipped** — commit `cb41310` pushed clean to `origin/main`.
- **One thing couldn't ship:** sim.pentamachine.com styling-pass on our standalone simulator, because the Cowork sandbox allowlist is session-snapshotted and the user's mid-session allowlist changes never propagated to my fetch tool. Fresh chat fixes it.
- **Tomorrow (2026-04-25):** user runs the pre-flight checklist against a real Pentamachine V2-50. Everything they need is in `docs/pentacad/PRE-FLIGHT-CHECKLIST.md`.

---

## What was delivered this session (8 files, ~5,500 lines)

All committed under commit `cb41310`:

```
app/pentacad-sim.html                          ← standalone 5-axis simulator (1,550 lines)
app/tests/pentacad-all-tests.html              ← master test dashboard (~60 tests)
app/tests/pentacad-sim-tests.html              ← focused sim drill-down
app/tests/pentacad-cam-tests.html              ← focused cam drill-down
docs/pentacad/ARCHITECTURE.md                  ← full system architecture (~700 lines)
docs/pentacad/HELP.md                          ← user help guide (~550 lines)
docs/pentacad/PRE-FLIGHT-CHECKLIST.md          ← tomorrow's hardware test script
docs/pentacad/MATT-REQUEST-LIST.md             ← prioritised asks + workarounds shipped
docs/pentacad/tutorials/00-getting-started.md
docs/pentacad/tutorials/01-first-face-mill.md
docs/pentacad/tutorials/02-pocket-and-drill.md
docs/pentacad/tutorials/03-adaptive-clearing.md
docs/pentacad/tutorials/04-chamfer.md
docs/pentacad/tutorials/05-bore-thread.md
docs/pentacad/tutorials/06-bottle-opener-ring.md   ← full 6-op 5-axis workflow
docs/pentacad/tutorials/07-simulator-tour.md
```

---

## The standalone simulator (`app/pentacad-sim.html`)

Feature-parity against sim.pentamachine.com was the goal, but since I never successfully fetched their page (see allowlist issue below), the **styling is approximation, not a pixel match**. Feature set is complete based on general 5-axis CAM simulator industry standards.

Shipped: 3-panel layout (syntax-highlighted editor / Three.js viewport / tabbed side panel), 7 example programs, 4 machine variants with bundled kinematics, drag-drop files, shareable hash URLs, 7 visibility toggles, full keyboard shortcuts, DRO + Stats + Limits + Issues tabs, Kinetic Control colour tokens.

Loads existing `app/js/modules/pentacad-sim.js` for parser + executor + kinematics so no core logic duplication.

---

## The allowlist issue (blocker for styling pass)

**What happened.** User tried three different allowlist configurations during the session. Every fetch of any `*.pentamachine.com` subdomain returned the same cached allowlist error from my sandbox — package managers + Anthropic/Claude domains only, zero pentamachine entries.

**Root cause.** Cowork sandbox allowlists are snapshotted at session start. Live settings changes do not apply to the running session.

**Fix.** Start a fresh chat. First fetch in the new session picks up the current allowlist.

---

## How to resume in the new chat

Paste this:

> Resume pentacad sim styling pass. Read ~/cyclecad/HANDOFF-2026-04-24-session-6.md first. Then fetch https://sim.pentamachine.com and do a styling diff against app/pentacad-sim.html — I want our simulator to match their UI exactly (layout, colour palette, HUD positioning, toolpath colour conventions, font choices). Ship the result as app/pentacad-sim.html v0.3.

Expected workflow in that session:
1. Fetch sim.pentamachine.com with `mcp__workspace__web_fetch`
2. Inspect HTML structure + CSS
3. If they use Three.js + GLB like we suspect, check their network requests to see exactly which GLB + config they load
4. Apply 3–5 targeted Edit calls to `app/pentacad-sim.html` — colour token swap, HUD layout match, toolpath colour match, font match
5. Commit + push, bump the version string in the file header to `v0.3.0`

---

## The user's real-world test tomorrow

User will physically connect a Pentamachine V2-50 via USB and run through `docs/pentacad/PRE-FLIGHT-CHECKLIST.md`. The checklist is the bible for this test.

Things to watch for during the test (in priority order):

### Likely first-hit issue: Rockhopper CORS
Rockhopper hardcodes origin regex `https?://([a-z0-9]+\.)?pocketnc.com`. Pentacad served from `cyclecad.com` will fail.
- **Fix documented in the checklist §0.2** — serve from `localhost` via `python3 -m http.server 8000`.

### Likely second-hit issue: BBB USB gadget subnet
- macOS assigns `192.168.6.2`
- Linux/Win assigns `192.168.7.2`
- Checklist §2.2 walks the user through both.

### Likely third-hit issue: default credentials
- Rockhopper defaults: `default` / `default`
- If someone changed them, they're on the machine's `/var/opt/pocketnc/userdict`
- User will have to ssh in or ask Matt.

### Likely fourth-hit issue: GLB path
- Expected: `http://<machine-ip>/opt/penta-ui-builds/gltf/v2-50.glb`
- If 404: use the simplified proxy model, note in Matt ask list A1
- Pentacad already falls back automatically — not a session-killer.

### The halui pin corrections (session 5 discovery)
Already baked into `rockhopper-client.js`:
- Feed override: `halui.feed-override.direct-value` (NOT `.value` — read-only)
- Spindle override: `halui.spindle.0.override.direct-value` (per-index)
- Jog: `halui.axis.jog-speed` + `.increment-plus/minus` pins, not G91 G1

If the user's sliders don't work, these are the first places to check.

---

## What to ship when hardware validation passes

1. Measured values → update `machines/v2-50/kinematics.json` with `_confirmed: true` flags
2. Tag release `v3.15.0`, bump `pentacad.js` VERSION to `1.1.0`
3. `npm publish`
4. LinkedIn: "First Pentacad-generated toolpath running on a Pentamachine V2-50."

---

## Matt asks (prioritised, all have workarounds shipped)

Priority A (would significantly improve quality):
1. Native GLBs for V1/V2-10/V2-50/Solo as standalone downloads
2. Representative `PocketNC.ini` per variant
3. 3–5 more reference `.ngc` files with A/B motion
4. Stock tool list per variant

Priorities B/C/D: see `docs/pentacad/MATT-REQUEST-LIST.md` for full list + suggested message to send him.

---

## Pending task inbox (from session 5 + earlier, still open)

- **#10** AI Engineering Analyst v1 (MecAgent-parity bolted-joint analysis) — shipped in 3.11.0 but needs RAG content expansion
- **#11** AI Engineer v2 extensions (bearings / welds / gears already shipped in 3.13.0) — keep adding analyses
- **#12** RAG textbook content beyond the 10 seed passages
- **#13** More AI Copilot templates (partial — bearings/T-slots shipped)
- **#14** polyline → geometry ✅ shipped
- **#15** Dynamic version badge in cyclecad status bar
- **#16** Wire cyclecad splash buttons (New Sketch / Open / Text-to-CAD / Inventor)
- **#17** Run `app/test-agent.html` (113 tests) and fix failures
- **#18** Text-to-CAD live preview
- **#19** Photo-to-CAD reverse engineering
- **#20** Server-side 138MB STEP converter deployment
- **#21** Docker compose local test
- **#22** ExplodeView compositing render (shipped scaffold in 1.0.24, needs real testing)
- **#23** ExplodeView killer-features-test
- **#24** `block-only-in-chrome` bug repro
- **NEW** Pentacad sim styling pass against sim.pentamachine.com (this is the resume task)
- **NEW** Phase 2 CAM strategies: 3D contour, parallel, scallop, morphed-spiral, project
- **NEW** `server/pentamachine-v2.cps` Fusion post — verify byte-for-byte against Matt's reference `.ngc`

---

## Git state

```
a5b3e94..cb41310  main -> main  (clean, pushed)
```

No stale locks. No pending local commits. npm at `cyclecad@3.14.0`.

---

## One last note

Matt is ecosystem-neutral (per `pilot-intelligence-brief.md`). Don't resurrect the JV framing. The Matt request list is intentionally technical-only and framed so he can treat Pentacad same as his other CAM partners. Build in silence, ship polished demos, public launch before he asks for exclusivity.

---

*Good luck tomorrow with the V2-50. The pre-flight checklist has got you.*
