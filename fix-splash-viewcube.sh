#!/bin/bash
# cycleCAD Fix: Welcome Splash + ViewCube + Dialog Selectors + Remove Demo Geometry
# Run from ~/cyclecad: bash fix-splash-viewcube.sh

set -e
cd "$(dirname "$0")"

echo "=== Fix 1: text-to-cad.js syntax error (line 215) ==="
sed -i.bak 's/    if \/(array|repeat|pattern)\/.test(lower)) return '\''pattern'\'';/    if (\/(array|repeat|pattern)\/.test(lower)) return '\''pattern'\'';/' app/js/modules/text-to-cad.js
rm -f app/js/modules/text-to-cad.js.bak

echo "=== Fix 2: Replace .dialog-content with #dialog-body in all 12 tool handlers ==="
sed -i.bak "s/document.querySelector('.dialog-content')/document.getElementById('dialog-body')/g" app/index.html
rm -f app/index.html.bak

echo "=== Fix 3: Remove demo geometry (box + cylinder) ==="
# Remove the demo geometry block between "Demo geometry" and "Ground plane"
python3 -c "
import re
with open('app/index.html', 'r') as f:
    content = f.read()

# Remove demo geometry block
content = re.sub(
    r'  // Demo geometry.*?scene\.add\(cyl\);\n\n  // Ground plane',
    '  // Ground plane',
    content,
    flags=re.DOTALL
)
with open('app/index.html', 'w') as f:
    f.write(content)
print('Demo geometry removed')
"

echo "=== Fix 4: Add welcome splash panel ==="
python3 -c "
with open('app/index.html', 'r') as f:
    content = f.read()

splash = '''<!-- Welcome Splash Screen -->
<div id=\"welcome-panel\" style=\"position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;\">
  <div style=\"background:var(--bg-secondary,#252526);border:1px solid var(--border-color,#3c3c3c);border-radius:12px;padding:40px 48px;max-width:560px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);\">
    <div style=\"font-size:36px;margin-bottom:4px;\">
      <span style=\"color:#0284C7;font-weight:700;\">cycle</span><span style=\"color:#e0e0e0;font-weight:300;\">CAD</span>
    </div>
    <div style=\"color:#888;font-size:13px;margin-bottom:28px;\">Agent-First Parametric 3D CAD Modeler</div>
    <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;\">
      <button data-action=\"new-sketch\" style=\"background:#0284C7;color:#fff;border:none;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;\" onmouseover=\"this.style.background='#0369a1'\" onmouseout=\"this.style.background='#0284C7'\">
        <div style=\"font-size:24px;margin-bottom:6px;\">&#9999;&#65039;</div>
        New Sketch
        <div style=\"font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;\">Start with a 2D sketch</div>
      </button>
      <button data-action=\"import\" style=\"background:#374151;color:#fff;border:1px solid #4b5563;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;\" onmouseover=\"this.style.background='#4b5563'\" onmouseout=\"this.style.background='#374151'\">
        <div style=\"font-size:24px;margin-bottom:6px;\">&#128194;</div>
        Open / Import
        <div style=\"font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;\">STEP, STL, Inventor, JSON</div>
      </button>
      <button data-action=\"ai-generate\" style=\"background:#374151;color:#fff;border:1px solid #4b5563;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;\" onmouseover=\"this.style.background='#4b5563'\" onmouseout=\"this.style.background='#374151'\">
        <div style=\"font-size:24px;margin-bottom:6px;\">&#129302;</div>
        Text-to-CAD
        <div style=\"font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;\">Describe a part in English</div>
      </button>
      <button data-action=\"load-inventor\" style=\"background:#374151;color:#fff;border:1px solid #4b5563;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;\" onmouseover=\"this.style.background='#4b5563'\" onmouseout=\"this.style.background='#374151'\">
        <div style=\"font-size:24px;margin-bottom:6px;\">&#127981;</div>
        Inventor Project
        <div style=\"font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;\">Load .ipj / .ipt / .iam</div>
      </button>
    </div>
    <div style=\"color:#666;font-size:11px;\">v0.9.0 &middot; 12 killer features &middot; 46 modules &middot; <a href=\"https://github.com/vvlars-cmd/cyclecad\" target=\"_blank\" style=\"color:#0284C7;text-decoration:none;\">GitHub</a></div>
  </div>
</div>

'''

# Insert before modal dialogs
content = content.replace('<!-- Modal Dialogs -->', splash + '<!-- Modal Dialogs -->')
with open('app/index.html', 'w') as f:
    f.write(content)
print('Welcome splash added')
"

echo "=== Fix 5: Add ViewCube to viewport ==="
python3 -c "
with open('app/index.html', 'r') as f:
    content = f.read()

# Add position:relative and viewcube div to viewport-container
content = content.replace(
    '<div id=\"viewport-container\">',
    '<div id=\"viewport-container\" style=\"position:relative;\">'
)
content = content.replace(
    '</canvas>\n    </div>\n\n    <!-- Right Panel',
    '</canvas>\n      <div id=\"viewcube\" style=\"position:absolute;top:12px;right:12px;width:90px;height:90px;pointer-events:auto;z-index:100;\"></div>\n    </div>\n\n    <!-- Right Panel'
)

# Add ViewCube JS before animation loop
viewcube_js = '''  // ===== ViewCube =====
  const vcContainer = document.getElementById('viewcube');
  const vcScene = new THREE.Scene();
  const vcCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  vcCamera.position.set(0, 0, 3.5);
  const vcRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  vcRenderer.setSize(90, 90);
  vcRenderer.setPixelRatio(window.devicePixelRatio);
  vcContainer.appendChild(vcRenderer.domElement);
  const faceLabels = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'];
  const faceColors = [0x3b82f6, 0x3b82f6, 0x10b981, 0x10b981, 0x0284C7, 0x0284C7];
  const cubeMats = faceLabels.map((label, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + faceColors[i].toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, 126, 126);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
  });
  const vcCube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), cubeMats);
  vcScene.add(vcCube);
  const axLen = 1.3;
  const axMat = (c) => new THREE.LineBasicMaterial({ color: c });
  const axGeo = (v) => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), v]);
  vcScene.add(new THREE.Line(axGeo(new THREE.Vector3(axLen, 0, 0)), axMat(0xff4444)));
  vcScene.add(new THREE.Line(axGeo(new THREE.Vector3(0, axLen, 0)), axMat(0x44ff44)));
  vcScene.add(new THREE.Line(axGeo(new THREE.Vector3(0, 0, axLen)), axMat(0x4444ff)));
  const vcViews = { Right:{x:3,y:0,z:0}, Left:{x:-3,y:0,z:0}, Top:{x:0,y:3,z:0}, Bottom:{x:0,y:-3,z:0}, Front:{x:0,y:0,z:3}, Back:{x:0,y:0,z:-3} };
  const vcRay = new THREE.Raycaster(); const vcMouse = new THREE.Vector2();
  vcRenderer.domElement.addEventListener('click', (e) => {
    const rect = vcRenderer.domElement.getBoundingClientRect();
    vcMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    vcMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    vcRay.setFromCamera(vcMouse, vcCamera);
    const hits = vcRay.intersectObject(vcCube);
    if (hits.length > 0) {
      const v = vcViews[faceLabels[hits[0].face.materialIndex]];
      if (v) { const s = camera.position.length() / 3; camera.position.set(v.x*s, v.y*s, v.z*s); camera.lookAt(controls.target); controls.update(); }
    }
  });
  vcRenderer.domElement.style.cursor = 'pointer';

'''

content = content.replace(
    '  // Animation loop\n  function animate() {\n    requestAnimationFrame(animate);\n    controls.update();\n    renderer.render(scene, camera);\n  }',
    viewcube_js + '  // Animation loop\n  function animate() {\n    requestAnimationFrame(animate);\n    controls.update();\n    renderer.render(scene, camera);\n    vcCube.quaternion.copy(camera.quaternion).invert();\n    vcRenderer.render(vcScene, vcCamera);\n  }'
)

# Add welcome splash wiring before menu handler
splash_js = '''  // ===== Welcome Splash =====
  const welcomePanel = document.getElementById('welcome-panel');
  if (welcomePanel) {
    const dismissWelcome = () => { welcomePanel.style.display = 'none'; };
    const wb1 = welcomePanel.querySelector('[data-action=\"new-sketch\"]');
    if (wb1) wb1.onclick = () => { dismissWelcome(); handleMenuAction('sketch-new'); };
    const wb2 = welcomePanel.querySelector('[data-action=\"import\"]');
    if (wb2) wb2.onclick = () => { dismissWelcome(); handleMenuAction('file-import'); };
    const wb3 = welcomePanel.querySelector('[data-action=\"ai-generate\"]');
    if (wb3) wb3.onclick = () => { dismissWelcome(); handleMenuAction('tools-text-to-cad'); };
    const wb4 = welcomePanel.querySelector('[data-action=\"load-inventor\"]');
    if (wb4) wb4.onclick = () => { dismissWelcome(); handleMenuAction('file-import'); };
  }

'''

content = content.replace('  // ===== Menu Actions Handler =====', splash_js + '  // ===== Menu Actions Handler =====')

with open('app/index.html', 'w') as f:
    f.write(content)
print('ViewCube + welcome wiring added')
"

echo ""
echo "=== All fixes applied! ==="
echo ""
echo "Now run:"
echo "  git add app/index.html app/js/modules/text-to-cad.js"
echo "  git commit -m 'Fix: welcome splash, ViewCube, dialog selectors, remove demo geometry'"
echo "  git push origin main"
echo "  npm version patch && npm publish"
