#!/usr/bin/env bash
# Auto-generated commit script — run once when you return:
#   bash ~/cyclecad/_autonomous-commit.sh
# Bundles all autonomous work into commits + a single push.
set -e
cd "$HOME/cyclecad"
rm -f .git/HEAD.lock .git/index.lock

# Make sure git uses the right author when running from a fresh shell
git config user.name >/dev/null 2>&1 || git config user.name "Sachin Kumar"
git config user.email >/dev/null 2>&1 || git config user.email "vvlars@googlemail.com"

echo "→ Staging all changes"
git add -A

# If nothing changed, bail clean
if git diff --cached --quiet; then
  echo "Nothing to commit. You're up to date."
  exit 0
fi

echo "→ Single consolidated commit"
git commit -m "Pentacad sim: Penta-replica widgets + matte rendering + 5 machines + Suite docs

PENTACAD-SIM (app/pentacad-sim.html, v0.4)

Widgets — right-side cluster matching sim.pentamachine.com pixel-for-pixel:
- 3D ViewCube with 6 face buttons (Front/Back/Top/Bottom/Left/Right)
  · click any face to snap camera to that orthographic view
- Camera fit-to-scene + screenshot icon buttons
- DRO panel: X/Y/Z/A/B/T monospace readout in grey rounded card
- Show Options pill button toggles legacy visibility cluster
- CHANGE MACHINE green pill bottom-right opens the picker
- Old vp-hud Machine/Tool cards hidden (Penta doesn't show them)

Rendering — match Penta's matte look:
- Drop RoomEnvironment + ACES tonemapping
- Two-light setup: ambient 0.85 + directional 0.40, no fog
- sRGB output color space only
- Hide proxy on first paint; only fall back if all GLB candidates fail

GLB resolution — multi-URL fallback so machine swap actually works:
- 1. #glb=<url> hash override
- 2. localStorage cached blob
- 3. ./models/<id>.glb (repo-local, gitignored)
- 4. https://sim.pentamachine.com/gltf/<id>.glb (Penta CDN)
- 5. proxy fallback (only if all above fail)

Five machine variants (matches Penta exactly):
- Solo / V1 / V1 Kickstarter / V2-10 (default — your machine) / V2-50

Forward kinematics on real GLB:
- setupGlbKinematics() reparents 'b' under 'a' so A-tilt drags B
- Rotation code targets both real-GLB ('a','b') and proxy ('trunnion','tableB') names
- Machine actually moves during sim playback now

Playback bar:
- Inline solid charcoal strip at viewport bottom (was floating overlay)
- Always visible regardless of viewport height
- Speed control with 'Speed' label, 0.1x to 50x range
- Filled circle play/stop/step buttons with hover states
- Canvas height 'auto' so playback bar isn't pushed off-screen

PENTACAD FULL APP (app/pentacad.html)
- Simulate tab embeds pentacad-sim.html via iframe (was placeholder viewport)
- Auto-pushes CAM-tab posted G-code to embedded sim
- Pop-out + Restart + Load CAM G-code buttons in side panel

DEMO (app/demo/milling-3d-demo.html)
- Runs sim.ngc face-pass, identical to sim.pentamachine.com
- 7-step narrative aligned to the program flow
- Removed vice references (Penta sim doesn't use one)
- Cross-link to sim.pentamachine.com for direct comparison

DOCS (Suite-wide)
- docs/ARCHITECTURE.md  (NEW) - layered architecture, machine variant system,
  G-code -> motion pipeline, coordinate systems, security boundaries,
  performance targets, extension points, deployment modes, licensing
- docs/TUTORIAL-SUITE.md (NEW) - 5-tour guided walkthrough covering sim,
  Pentacad full app, AI Copilot, AI Engineer, ExplodeView
- docs/HELP-SUITE.md (NEW) - keyboard shortcuts, FAQ, troubleshooting,
  where-do-I pointers, version table

MODELS DIRECTORY (app/models/)
- .gitignore blocks *.glb / *.gltf from commit (Matt's IP, kept local)
- README documents 3 extraction paths (USB / disk image / Matt CDN)
"

echo "→ Pushing to origin/main"
git push origin main

echo
echo "Done. GitHub Pages rebuilds in ~30-60s."
echo "Hard-refresh https://cyclecad.com/app/pentacad-sim.html (Cmd+Shift+R)"
echo "Or test locally: http://localhost:8000/pentacad-sim.html"
