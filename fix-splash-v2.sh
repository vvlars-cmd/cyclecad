#!/bin/bash
# Fix splash screen buttons - v2 (uses global onclick + inline handlers)
# Run from ~/cyclecad: bash fix-splash-v2.sh

set -e
cd "$(dirname "$0")"

echo "=== Replacing welcome splash with working version ==="

python3 << 'PYEOF'
with open('app/index.html', 'r') as f:
    content = f.read()

# Remove old welcome panel if it exists
import re
content = re.sub(
    r'<!-- Welcome Splash Screen -->.*?</div>\s*</div>\s*</div>\s*\n\n',
    '',
    content,
    flags=re.DOTALL
)

# Remove old welcome splash JS wiring if it exists
content = content.replace(
    """  // ===== Welcome Splash =====
  const welcomePanel = document.getElementById('welcome-panel');
  if (welcomePanel) {
    const dismissWelcome = () => { welcomePanel.style.display = 'none'; };
    const wb1 = welcomePanel.querySelector('[data-action="new-sketch"]');
    if (wb1) wb1.onclick = () => { dismissWelcome(); handleMenuAction('sketch-new'); };
    const wb2 = welcomePanel.querySelector('[data-action="import"]');
    if (wb2) wb2.onclick = () => { dismissWelcome(); handleMenuAction('file-import'); };
    const wb3 = welcomePanel.querySelector('[data-action="ai-generate"]');
    if (wb3) wb3.onclick = () => { dismissWelcome(); handleMenuAction('tools-text-to-cad'); };
    const wb4 = welcomePanel.querySelector('[data-action="load-inventor"]');
    if (wb4) wb4.onclick = () => { dismissWelcome(); handleMenuAction('file-import'); };
  }

""",
    ""
)

# New splash with INLINE onclick handlers that use a global function
new_splash = '''<!-- Welcome Splash Screen -->
<div id="welcome-panel" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;">
  <div style="background:#252526;border:1px solid #3c3c3c;border-radius:12px;padding:40px 48px;max-width:560px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
    <div style="font-size:36px;margin-bottom:4px;">
      <span style="color:#0284C7;font-weight:700;">cycle</span><span style="color:#e0e0e0;font-weight:300;">CAD</span>
    </div>
    <div style="color:#888;font-size:13px;margin-bottom:28px;">Agent-First Parametric 3D CAD Modeler</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <button onclick="window._dismissSplash('sketch')" style="background:#0284C7;color:#fff;border:none;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;">
        <div style="font-size:24px;margin-bottom:6px;">&#9999;&#65039;</div>
        New Sketch
        <div style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;">Start with a 2D sketch</div>
      </button>
      <button onclick="window._dismissSplash('import')" style="background:#374151;color:#fff;border:1px solid #4b5563;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;">
        <div style="font-size:24px;margin-bottom:6px;">&#128194;</div>
        Open / Import
        <div style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;">STEP, STL, Inventor, JSON</div>
      </button>
      <button onclick="window._dismissSplash('textcad')" style="background:#374151;color:#fff;border:1px solid #4b5563;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;">
        <div style="font-size:24px;margin-bottom:6px;">&#129302;</div>
        Text-to-CAD
        <div style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;">Describe a part in English</div>
      </button>
      <button onclick="window._dismissSplash('inventor')" style="background:#374151;color:#fff;border:1px solid #4b5563;border-radius:8px;padding:18px 16px;cursor:pointer;font-size:14px;font-weight:600;">
        <div style="font-size:24px;margin-bottom:6px;">&#127981;</div>
        Inventor Project
        <div style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:4px;">Load .ipj / .ipt / .iam</div>
      </button>
    </div>
    <div style="color:#666;font-size:11px;">v0.9.0 &middot; 12 killer features &middot; 46 modules &middot; <a href="https://github.com/vvlars-cmd/cyclecad" target="_blank" style="color:#0284C7;text-decoration:none;">GitHub</a></div>
  </div>
</div>
<script>
window._dismissSplash = function(action) {
  document.getElementById('welcome-panel').style.display = 'none';
  if (action === 'sketch') {
    // Will be handled by module script once loaded
    window._pendingSplashAction = 'sketch-new';
  } else if (action === 'import' || action === 'inventor') {
    window._pendingSplashAction = 'file-import';
  } else if (action === 'textcad') {
    window._pendingSplashAction = 'tools-text-to-cad';
  }
};
</script>

'''

# Insert before modal dialogs
content = content.replace('<!-- Modal Dialogs -->', new_splash + '<!-- Modal Dialogs -->')

# Add pending action handler inside the module script, right after menu handler definition
# Find the end of handleMenuAction and add a check for pending splash action
old_menu_end = "  // ===== Workspace Switching ====="
new_menu_end = """  // ===== Handle pending splash action =====
  if (window._pendingSplashAction) {
    const pa = window._pendingSplashAction;
    window._pendingSplashAction = null;
    handleMenuAction(pa);
  }
  // Process splash actions dispatched after module load
  Object.defineProperty(window, '_pendingSplashAction', {
    set(v) { if (v) { setTimeout(() => handleMenuAction(v), 100); } },
    get() { return null; },
    configurable: true
  });

  // ===== Workspace Switching ====="""

content = content.replace(old_menu_end, new_menu_end, 1)

with open('app/index.html', 'w') as f:
    f.write(content)

print('Splash v2 applied successfully!')
PYEOF

echo ""
echo "=== Done! Now run: ==="
echo "  git add app/index.html && git commit -m 'Fix splash buttons with global onclick handlers' && git push origin main"
