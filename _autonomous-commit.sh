#!/usr/bin/env bash
# Auto-generated commit script — run when you return:
#   bash ~/cyclecad/_autonomous-commit.sh
set -e
cd "$HOME/cyclecad"
rm -f .git/HEAD.lock .git/index.lock

git config user.name >/dev/null 2>&1 || git config user.name "Sachin Kumar"
git config user.email >/dev/null 2>&1 || git config user.email "vvlars@googlemail.com"

echo "→ Staging all changes"
git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit. Up to date."
  exit 0
fi

git commit -m "Pentacad sim v0.20+ — kinematics revert, widget integrations, polish

PENTACAD-SIM v0.20 — kinematics revert (fix 'floating spindle / perpendicular tool')
- setupGlbKinematics no longer attach()es 'b' under 'a'. The Penta GLB
  authors them as flat siblings; reparenting was rotating the whole
  cube into a weird local frame, producing the perpendicular tool.
- applyToolPosition: linear-axis translation (x_1, x_2, y, z) DISABLED.
  Translating these without knowing the GLB's authored axis-rail layout
  produced 'spindle floating in air' artefacts. Static GLB position
  is correct enough for Penta's default render.

PENTA-NAV WIDGET INTEGRATION (cycleCAD + ExplodeView)
- app/js/widgets/penta-nav.js drops in to any Three.js viewport
- Now wired into:
    cycleCAD app (app/index.html)
    ExplodeView (~/explodeview/docs/demo/index.html — handled in
      explodeview repo)

DOCS / DEMOS / TESTS (carried forward from earlier)
- docs/ARCHITECTURE.md, TUTORIAL-SUITE.md, HELP-SUITE.md
- app/demo/index.html (Suite hub) and app/demo/all-machines.html
  (5-pane synchronized playback)
- app/tests/all-tests.html (master runner, 6 suites)
- vs-mecagent.html (head-to-head landing page)
"

echo "→ Pushing"
git push origin main
echo
echo "Done. GitHub Pages rebuilds in ~30-60s."
