#!/usr/bin/env bash
# Autonomous progress checkpoint — run when you return:
#   bash ~/cyclecad/_autonomous-commit.sh
#
# Bundles all v0.20–0.21+ work into one consolidated commit.
set -e
cd "$HOME/cyclecad"
rm -f .git/HEAD.lock .git/index.lock

git config user.name >/dev/null 2>&1 || git config user.name "Sachin Kumar"
git config user.email >/dev/null 2>&1 || git config user.email "vvlars@googlemail.com"

echo "→ Staging cyclecad repo"
git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit in cyclecad."
else
  git commit -m "Pentacad sim v0.21 + Suite widget integration

PENTACAD SIM v0.21 (after v0.20 already pushed)
- ViewCube: brighter multi-light setup (ambient + key + fill + rim)
  + default 3/4 iso rotation so cube reads as 3D from first paint
- Un-hide 'collet' mesh — the simple collet nut terminates the spindle
  motor body so it no longer floats. Still hide SHORT/LONG/collet001
  (those were the perpendicular tool holders).
- Body materials lifted: 0x1E1F22 -> 0x32353A (was crushing under softer
  lighting). Accent: 0x36383B -> 0x4A4D51.
- KINEMATICS REVERT (carried from v0.20):
  · setupGlbKinematics no longer attach()es 'b' under 'a' (was producing
    perpendicular-tool bug).
  · applyToolPosition: linear-axis translation (x_1, x_2, y, z) DISABLED
    (was producing floating-spindle artefact). Static GLB position
    matches Penta's default render adequately.

CYCLECAD APP — Penta nav widget integration (app/index.html)
- Imports PentaNavWidget after Three.js scene is ready
- Registers DRO panel (X/Y/Z, 3-axis CAD), screenshot button, fit-to-scene
- Skips own ViewCube (cycleCAD already renders one)
- window._cyclecadNav exposed for module use
- window._updateCyclecadDRO(x,y,z) helper for DRO updates from selection

EXPLODEVIEW — Penta nav widget integration (in /Users/sachin/explodeview)
- Adds <script type=module> block to docs/demo/index.html that waits for
  app.js to expose window._scene/_camera/_renderer, then mounts a
  screenshot-only PentaNavWidget overlay. Loads the widget from
  https://cyclecad.com/app/js/widgets/penta-nav.js so explodeview
  doesn't need to vendor it.
" || echo "(commit skipped)"

  echo "→ Pushing cyclecad"
  git push origin main
fi

echo
echo "→ Staging explodeview repo"
if [ -d "$HOME/explodeview/.git" ]; then
  cd "$HOME/explodeview"
  rm -f .git/HEAD.lock .git/index.lock
  git add -A
  if git diff --cached --quiet; then
    echo "Nothing to commit in explodeview."
  else
    git commit -m "Suite: integrate cyclecad PentaNavWidget overlay

Adds a small <script type=module> block at the bottom of
docs/demo/index.html that waits for app.js to expose window._scene /
_camera / _renderer / _controls, then loads the shared
PentaNavWidget from https://cyclecad.com/app/js/widgets/penta-nav.js
and mounts a screenshot-only overlay.

Same widget powers cycleCAD app's DRO and Pentacad sim's ViewCube +
DRO + Show Options + camera-projection / parenting menus. ExplodeView
opts out of the cube + DRO since the existing UI already covers those
— gets the screenshot button + fit-to-scene only.
"
    git push origin main
  fi
else
  echo "(no explodeview repo found at ~/explodeview)"
fi

echo
echo "Done. GitHub Pages rebuilds in ~30-60s for both sites."
echo "Hard-refresh:"
echo "  https://cyclecad.com/app/pentacad-sim.html"
echo "  https://cyclecad.com/app/index.html"
echo "  https://cyclecad.com/app/demo/index.html"
echo "  https://cyclecad.com/vs-mecagent.html"
echo "  https://explodeview.com"
