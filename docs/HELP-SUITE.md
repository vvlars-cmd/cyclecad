# cycleCAD Suite — Help

*Updated 2026-04-25*

Keyboard shortcuts, FAQ, troubleshooting, and "where do I…" pointers.

---

## Keyboard shortcuts

### Pentacad sim (`pentacad-sim.html`)

| Key            | Action                                       |
|----------------|----------------------------------------------|
| `Space`        | Play / pause playback                        |
| `→`            | Step one move forward                        |
| `←`            | Step one move back                           |
| `Home`         | Jump to start (line 1)                       |
| `End`          | Jump to end (last move)                      |
| `R`            | Reset camera to iso                          |
| `F`            | Fit camera to scene                          |
| `1`            | Front view                                   |
| `3`            | Right view                                   |
| `7`            | Top view                                     |
| `Cmd/Ctrl + O` | Open G-code file                             |
| `Cmd/Ctrl + S` | Download current G-code                      |
| `?`            | Toggle help dialog                           |

### cycleCAD app (`index.html`)

| Key            | Action                                       |
|----------------|----------------------------------------------|
| `Cmd/Ctrl + Shift + K` | Open AI Copilot                      |
| `Cmd/Ctrl + Shift + E` | Open AI Engineering Analyst          |
| `Cmd/Ctrl + Shift + C` | Copy selection                       |
| `Cmd/Ctrl + Z` / `Y` | Undo / redo                            |
| `S`            | Sketch mode                                  |
| `E`            | Extrude                                      |
| `H`            | Hole                                         |
| `Cmd/Ctrl + ,` | Settings                                     |

### Pentacad full app (`pentacad.html`)

| Key            | Action                                       |
|----------------|----------------------------------------------|
| `Cmd/Ctrl + 1..5` | Switch to tab 1..5 (Machine / Design / CAM / Simulate / Production) |
| `Space`        | Cycle Start / Feed Hold (in Production tab)  |
| `Esc`          | Abort                                        |

### ExplodeView

| Key            | Action                                       |
|----------------|----------------------------------------------|
| `E`            | Toggle exploded state                        |
| `T`            | Wireframe                                    |
| `M`            | Measure                                      |
| `Shift + A`    | AR Mode                                      |
| `Ctrl/Cmd + N` | AI Part Narrator                             |
| `Shift + I`    | Animated Assembly Instructions               |

---

## FAQ

### Why does the Pentacad sim show a different machine to the one I'm on?

The picker defaults to V2-10. Click the dropdown in the top bar and choose
your variant (V1, V1 Kickstarter, V2-10, V2-50, Solo). Your selection is
remembered across reloads.

### Why is the machine matte black with no reflections?

That matches sim.pentamachine.com. We deliberately removed RoomEnvironment
+ ACES tonemapping in this app to avoid the "showroom car" look on what
should be a working machine. ExplodeView uses the photoreal pipeline.

### Where do the 3D models come from?

`pentacad-sim.html` tries these sources in order:
1. `#glb=<url>` URL hash override
2. `localStorage` blob URL cache
3. `./models/<id>.glb` repo-local (gitignored — drop your own files in)
4. `https://sim.pentamachine.com/gltf/<id>.glb` (Penta's public CDN)
5. Procedural proxy fallback (matte grey approximation)

On the public site, source #4 is used because we don't ship the GLBs.
On localhost with extracted GLBs in `app/models/`, source #3 wins.

### How do I get the real GLBs?

Three options, in order of how well they work:
1. Plug a Pentamachine in via USB and visit
   `http://192.168.6.2/opt/penta-ui-builds/gltf/v2-50.glb`
2. Extract from the Kinetic Control disk image with Docker + debugfs
   (script in CLAUDE.md session 5)
3. Use the public CDN — no extraction needed

### Why is my AI Copilot returning a "no API key" error?

Click the key icon in the Copilot panel and paste an API key for one of:
Claude (Anthropic), Gemini (Google), or Groq. Gemini and Groq have free
tiers with daily quotas; Claude is paid only.

### Can I use the AI Engineer without an API key?

Yes — the math is pure JS, all computed deterministically. The LLM is
only used to parse your prompt into structured params. If the LLM is
unavailable, fill the form fields manually and click "Analyze".

### Pentacad WebSocket can't connect to my machine

The Rockhopper bridge hardcodes a CORS origin allowlist that **does not
include cyclecad.com**. Serve Pentacad from `localhost`:

```
cd ~/cyclecad/app && python3 -m http.server 8000
# open http://localhost:8000/pentacad.html
```

Localhost passes Rockhopper's origin check.

### Why is the G-code editor showing "untitled.ngc / 0 lines" on the live site?

The hash parameter `#ex=sim-ngc` requires the bundled `sim-ngc` example
which only exists in v0.3+ of the sim. If the live site hasn't redeployed
since the last commit, hard-refresh with Cmd+Shift+R. GitHub Pages takes
30-60 s to rebuild after each push.

### My machine doesn't move in the sim during playback

Two causes:
1. **Old code path** — earlier sims rotated `getObjectByName('trunnion')`
   which only existed in the proxy. Fixed in v0.3+ to also try `'a'` (real
   GLB name).
2. **GLB hierarchy** — `b` (B-platter) needs to be a child of `a` (A-trunnion)
   for kinematics. Auto-reparented by `setupGlbKinematics()` after GLB load.

If you're on v0.3+ and the machine still doesn't move, check the browser
console — `[pentacad-sim] loaded GLB from: <url>` confirms a real model
loaded, not the proxy.

---

## Troubleshooting

### The sim won't load (blank page)

1. Open DevTools → Console. Look for red errors.
2. Common: `GLTFLoader is not defined` — three.js importmap broken.
   Hard-refresh.
3. Common: `Failed to load module script` — wrong MIME type. Use a real
   web server (`python3 -m http.server`), not `file://`.

### Toolpath renders in the wrong place

The toolpath is computed from G-code in inch (G20) or mm (G21) and scaled
to viewport units. If the program declares G21 (mm) but you expect inch,
the path will be 25.4× off. Check line 1-3 of your G-code.

### CAM viewport is empty after Generate

Check console for `[pentacad-cam]` errors. Often: stock dimensions are 0.
Set them in the Setup card on the right of the CAM tab.

### Rockhopper says "auth failed"

Default credentials are `default` / `default`. If they've been changed,
SSH into the machine: `ssh pocketnc@192.168.6.2`, check
`/var/opt/pocketnc/userdict` for the override.

### Live site has stale code

GitHub Pages CDN caches aggressively. Hard refresh: `Cmd+Shift+R` (Mac)
or `Ctrl+F5` (Win). For full reset, append `?v=<timestamp>` to the URL.

---

## Where do I find...

| If you want to...                          | Go to...                                |
|--------------------------------------------|-----------------------------------------|
| Run the sim                                | `http://localhost:8000/pentacad-sim.html` |
| Run the full Pentacad workflow             | `pentacad.html`                         |
| Design parts with AI                       | cycleCAD app → Tools → AI Copilot       |
| Verify a mechanical analysis               | cycleCAD app → Tools → AI Engineer      |
| View / explode / render assemblies         | `https://explodeview.com`               |
| See the architecture                       | `docs/ARCHITECTURE.md`                  |
| Walk through tutorials                     | `docs/TUTORIAL-SUITE.md`                |
| Run all tests                              | `app/tests/all-tests.html`              |
| Watch curated demos                        | `app/demo/index.html`                   |
| Connect a Pentamachine                     | `docs/pentacad/PRE-FLIGHT-CHECKLIST.md` |
| Add a new machine variant                  | `pentacad-sim.html` `MACHINES` block    |
| Add a new AI Copilot template              | `app/js/modules/ai-copilot.js` `matchTemplate()` |

---

## Versions

| Component            | Current       |
|----------------------|---------------|
| cycleCAD npm         | 3.14.0+       |
| Pentacad sim         | 0.3.0         |
| ExplodeView npm      | 1.0.24        |
| Three.js             | r170          |
| Penta sim reference  | v0.9.20       |

---

## See also

- `docs/ARCHITECTURE.md` — how it all fits together
- `docs/TUTORIAL-SUITE.md` — guided walkthroughs
- `docs/pentacad/HELP.md` — Pentacad-specific help (older, narrower)
- `docs/pentacad/PRE-FLIGHT-CHECKLIST.md` — first-time hardware test
