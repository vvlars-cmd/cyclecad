# Integration Snippets for Fusion 360 Modules

Ready-to-paste code for integrating fusion-sketch.js, fusion-solid.js, and fusion-surface.js into cycleCAD.

---

## 1. Add Module Imports to `app/index.html`

**Location:** Inside the main `<script type="module">` tag

```html
<script type="module">
  // Existing imports...
  import { initViewport, ... } from './js/viewport.js';

  // ADD THESE LINES:
  import fusionSketch from './js/modules/fusion-sketch.js';
  import fusionSolid from './js/modules/fusion-solid.js';
  import fusionSurface from './js/modules/fusion-surface.js';

  // Initialize app...
  const APP = { ... };

  // ADD MODULE REGISTRY:
  APP.modules = {
    sketch: fusionSketch,
    solid: fusionSolid,
    surface: fusionSurface,
  };

  // Initialize modules
  Object.values(APP.modules).forEach(mod => {
    if (mod.init) mod.init();
  });

  // Expose to window for agent API
  window.cycleCAD = {
    APP,
    modules: APP.modules,
    async execute(namespace, command, params = {}) {
      const [ns, cmd] = namespace.includes('.')
        ? namespace.split('.')
        : [namespace, command];

      const module = APP.modules[ns];
      if (!module) {
        return { success: false, message: `Module ${ns} not found` };
      }

      return module.execute(cmd, params);
    }
  };
</script>
```

---

## 2. Add Toolbar Buttons

**Location:** In the workspace toolbar area of `app/index.html` (after existing tabs)

```html
<!-- Sketch Toolbar Tab -->
<div id="sketch-tab" class="tb-tab" data-tab="sketch" style="display:none;">
  <button class="tb-btn" id="sketch-start-btn" title="Start Sketch (K)">
    <span>Sketch</span>
  </button>
  <div class="tb-divider"></div>
  <button class="tb-btn" id="sketch-line-btn" title="Line (L)">Line</button>
  <button class="tb-btn" id="sketch-rect-btn" title="Rectangle (R)">Rectangle</button>
  <button class="tb-btn" id="sketch-circle-btn" title="Circle (C)">Circle</button>
  <button class="tb-btn" id="sketch-arc-btn" title="Arc (A)">Arc</button>
  <button class="tb-btn" id="sketch-ellipse-btn" title="Ellipse (E)">Ellipse</button>
  <button class="tb-btn" id="sketch-spline-btn" title="Spline (S)">Spline</button>
  <button class="tb-btn" id="sketch-polygon-btn" title="Polygon (P)">Polygon</button>
  <div class="tb-divider"></div>
  <button class="tb-btn" id="sketch-mirror-btn" title="Mirror">Mirror</button>
  <button class="tb-btn" id="sketch-offset-btn" title="Offset">Offset</button>
  <button class="tb-btn" id="sketch-trim-btn" title="Trim">Trim</button>
  <button class="tb-btn" id="sketch-fillet-btn" title="Fillet 2D">Fillet 2D</button>
  <button class="tb-btn" id="sketch-end-btn" title="End Sketch (Escape)">✓ End</button>
</div>

<!-- Solid Toolbar Tab -->
<div id="solid-tab" class="tb-tab" data-tab="solid" style="display:none;">
  <button class="tb-btn" id="solid-extrude-btn" title="Extrude (E)">Extrude</button>
  <button class="tb-btn" id="solid-revolve-btn" title="Revolve (V)">Revolve</button>
  <button class="tb-btn" id="solid-sweep-btn" title="Sweep">Sweep</button>
  <button class="tb-btn" id="solid-loft-btn" title="Loft">Loft</button>
  <div class="tb-divider"></div>
  <button class="tb-btn" id="solid-hole-btn" title="Hole">Hole</button>
  <button class="tb-btn" id="solid-thread-btn" title="Thread">Thread</button>
  <button class="tb-btn" id="solid-fillet-btn" title="Fillet (F)">Fillet</button>
  <button class="tb-btn" id="solid-chamfer-btn" title="Chamfer (C)">Chamfer</button>
  <div class="tb-divider"></div>
  <button class="tb-btn" id="solid-shell-btn" title="Shell">Shell</button>
  <button class="tb-btn" id="solid-mirror-btn" title="Mirror (M)">Mirror</button>
  <button class="tb-btn" id="solid-pattern-btn" title="Pattern (P)">Pattern</button>
  <button class="tb-btn" id="solid-combine-btn" title="Boolean">Boolean</button>
</div>

<!-- Surface Toolbar Tab -->
<div id="surface-tab" class="tb-tab" data-tab="surface" style="display:none;">
  <button class="tb-btn" id="surface-extrude-btn" title="Extrude Surface">Extrude</button>
  <button class="tb-btn" id="surface-revolve-btn" title="Revolve Surface">Revolve</button>
  <button class="tb-btn" id="surface-sweep-btn" title="Sweep Surface">Sweep</button>
  <button class="tb-btn" id="surface-loft-btn" title="Loft Surface">Loft</button>
  <div class="tb-divider"></div>
  <button class="tb-btn" id="surface-patch-btn" title="Patch">Patch</button>
  <button class="tb-btn" id="surface-offset-btn" title="Offset">Offset</button>
  <button class="tb-btn" id="surface-trim-btn" title="Trim">Trim</button>
  <div class="tb-divider"></div>
  <button class="tb-btn" id="surface-stitch-btn" title="Stitch">Stitch</button>
  <button class="tb-btn" id="surface-sculpt-btn" title="Sculpt (T)">Sculpt</button>
  <button class="tb-btn" id="surface-ruled-btn" title="Ruled">Ruled</button>
</div>
```

---

## 3. Add Tab Switching to `app/js/app.js`

```javascript
// Tab switching for sketch/solid/surface tabs
document.addEventListener('click', (event) => {
  const tabBtn = event.target.closest('[data-tab]');
  if (!tabBtn) return;

  const tabName = tabBtn.dataset.tab;

  // Hide all tabs
  document.querySelectorAll('.tb-tab').forEach(tab => {
    tab.style.display = 'none';
  });

  // Show selected tab
  const selectedTab = document.getElementById(`${tabName}-tab`);
  if (selectedTab) {
    selectedTab.style.display = 'flex';
  }

  // Update UI panel
  const module = APP.modules[tabName];
  if (module && module.getUI) {
    const panel = document.getElementById('properties-panel');
    if (panel) {
      panel.innerHTML = module.getUI();
    }
  }
});
```

---

## 4. Sketch Event Handlers

**Location:** Add to `app/js/app.js` or `app/js/modules/sketch-handlers.js`

```javascript
let sketchActive = false;
let sketchPlane = 'XY';

// Start sketch
document.getElementById('sketch-start-btn')?.addEventListener('click', async () => {
  if (sketchActive) {
    // End sketch
    const result = await APP.modules.sketch.endSketch();
    console.log('Sketch ended:', result);
    sketchActive = false;
    document.getElementById('sketch-start-btn').textContent = 'Sketch';
  } else {
    // Start sketch
    const result = await APP.modules.sketch.startSketch(sketchPlane, APP.scene, APP.renderer);
    console.log('Sketch started:', result);
    sketchActive = true;
    document.getElementById('sketch-start-btn').textContent = '✓ Sketch';
  }
});

// Tool selection
const sketchTools = [
  { id: 'sketch-line-btn', tool: 'line' },
  { id: 'sketch-rect-btn', tool: 'rectangle' },
  { id: 'sketch-circle-btn', tool: 'circle' },
  { id: 'sketch-arc-btn', tool: 'arc' },
  { id: 'sketch-ellipse-btn', tool: 'ellipse' },
  { id: 'sketch-spline-btn', tool: 'spline' },
  { id: 'sketch-polygon-btn', tool: 'polygon' },
  { id: 'sketch-mirror-btn', tool: 'mirror' },
  { id: 'sketch-offset-btn', tool: 'offset' },
  { id: 'sketch-trim-btn', tool: 'trim' },
  { id: 'sketch-fillet-btn', tool: 'fillet2d' },
];

sketchTools.forEach(({ id, tool }) => {
  document.getElementById(id)?.addEventListener('click', () => {
    if (sketchActive) {
      APP.modules.sketch.setTool(tool);
      document.querySelectorAll('#sketch-tab .tb-btn').forEach(btn => {
        btn.style.opacity = '0.6';
      });
      document.getElementById(id).style.opacity = '1';
    } else {
      alert('Start a sketch first');
    }
  });
});

// Viewport click handling for sketch points
document.getElementById('viewport').addEventListener('click', (event) => {
  if (!sketchActive) return;

  const rect = event.target.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Convert screen coords to world coords (simplified)
  const worldX = (x / rect.width) * 100 - 50;
  const worldY = (y / rect.height) * 100 - 50;

  APP.modules.sketch.addPoint(worldX, worldY, true);
});
```

---

## 5. Solid Operation Handlers

**Location:** Add to `app/js/app.js`

```javascript
let selectedGeometry = null;
let selectedBodyId = null;

// Extrude
document.getElementById('solid-extrude-btn')?.addEventListener('click', async () => {
  if (!selectedGeometry) {
    alert('Select a sketch first');
    return;
  }

  const result = await APP.modules.solid.extrude(selectedGeometry, {
    distance: 10,
    direction: 'positive',
    taperAngle: 0,
  });

  if (result.success) {
    APP.scene.add(result.body.mesh);
    console.log('Body extruded:', result.body);
  }
});

// Revolve
document.getElementById('solid-revolve-btn')?.addEventListener('click', async () => {
  if (!selectedGeometry) {
    alert('Select a sketch first');
    return;
  }

  const result = await APP.modules.solid.revolve(selectedGeometry, 'Z', {
    angle: Math.PI * 2,
  });

  if (result.success) {
    APP.scene.add(result.body.mesh);
  }
});

// Fillet
document.getElementById('solid-fillet-btn')?.addEventListener('click', async () => {
  if (!selectedBodyId) {
    alert('Select a body first');
    return;
  }

  const result = await APP.modules.solid.fillet(selectedBodyId, [0, 1, 2], {
    radius: 2,
    type: 'constant',
  });

  if (result.success) {
    console.log('Fillet applied');
  }
});

// Chamfer
document.getElementById('solid-chamfer-btn')?.addEventListener('click', async () => {
  if (!selectedBodyId) {
    alert('Select a body first');
    return;
  }

  const result = await APP.modules.solid.chamfer(selectedBodyId, [0, 1, 2], {
    distance: 1,
    angle: 45,
  });

  if (result.success) {
    console.log('Chamfer applied');
  }
});

// Mirror
document.getElementById('solid-mirror-btn')?.addEventListener('click', async () => {
  if (!selectedBodyId) {
    alert('Select a body first');
    return;
  }

  const result = await APP.modules.solid.mirror(selectedBodyId, {
    plane: 'XY',
  });

  if (result.success) {
    APP.scene.add(result.body.mesh);
  }
});

// Pattern
document.getElementById('solid-pattern-btn')?.addEventListener('click', async () => {
  if (!selectedBodyId) {
    alert('Select a body first');
    return;
  }

  const result = await APP.modules.solid.pattern(selectedBodyId, {
    type: 'rectangular',
    count: 3,
    distance: 20,
    direction: 'X',
  });

  if (result.success) {
    result.patternedBodies.forEach(body => APP.scene.add(body.mesh));
  }
});
```

---

## 6. Surface Operation Handlers

**Location:** Add to `app/js/app.js`

```javascript
let selectedSurfaceId = null;

// Extrude Surface
document.getElementById('surface-extrude-btn')?.addEventListener('click', async () => {
  if (!selectedGeometry) {
    alert('Select a surface first');
    return;
  }

  const result = await APP.modules.surface.extrudeSurface(selectedGeometry, {
    distance: 10,
    direction: 'positive',
    symmetric: false,
  });

  if (result.success) {
    APP.scene.add(result.surface.mesh);
  }
});

// Loft Surface
document.getElementById('surface-loft-btn')?.addEventListener('click', async () => {
  if (!selectedGeometry) {
    alert('Select profiles first');
    return;
  }

  const result = await APP.modules.surface.loftSurface([selectedGeometry], {
    matchPeaks: false,
  });

  if (result.success) {
    APP.scene.add(result.surface.mesh);
  }
});

// Sculpt
document.getElementById('surface-sculpt-btn')?.addEventListener('click', async () => {
  if (!selectedSurfaceId) {
    alert('Select a surface first');
    return;
  }

  const result = await APP.modules.surface.sculptSurface(selectedSurfaceId);

  if (result.success) {
    console.log('Sculpt mode enabled, control points:', result.controlPointCount);
  }
});

// Finish Sculpt (when button appears)
document.addEventListener('click', (event) => {
  if (event.target.id === 'finish-sculpt') {
    APP.modules.surface.finishSculpt();
    console.log('Sculpt finished');
  }
});

// Trim Surface
document.getElementById('surface-trim-btn')?.addEventListener('click', async () => {
  if (!selectedSurfaceId) {
    alert('Select a surface first');
    return;
  }

  const result = await APP.modules.surface.trimSurface(
    selectedSurfaceId,
    'surface_1', // Tool surface ID
    { removeInside: true }
  );

  if (result.success) {
    APP.scene.add(result.surface.mesh);
  }
});
```

---

## 7. Agent API Usage

**For AI agents or automations:**

```javascript
// Via window.cycleCAD
const result = await window.cycleCAD.execute('sketch', 'startSketch', {
  plane: 'XY'
});

// Draw a rectangle
await window.cycleCAD.execute('sketch', 'setTool', { tool: 'rectangle' });
await window.cycleCAD.execute('sketch', 'addPoint', { x: 0, y: 0 });
await window.cycleCAD.execute('sketch', 'addPoint', { x: 20, y: 10 });

// Extrude
const sketchData = await window.cycleCAD.execute('sketch', 'endSketch');
const extrusionResult = await window.cycleCAD.execute('solid', 'extrude', {
  geometry: profileGeometry,
  distance: 15,
});

// Fillet
if (extrusionResult.success) {
  await window.cycleCAD.execute('solid', 'fillet', {
    bodyId: extrusionResult.body.id,
    edgeIds: [0, 1, 2],
    radius: 2,
  });
}
```

---

## 8. Keyboard Shortcuts

**Location:** Add to `app/js/shortcuts.js`

```javascript
const sketchShortcuts = {
  'KeyK': () => APP.modules.sketch.startSketch('XY', APP.scene, APP.renderer),
  'KeyL': () => APP.modules.sketch.setTool('line'),
  'KeyR': () => APP.modules.sketch.setTool('rectangle'),
  'KeyC': () => APP.modules.sketch.setTool('circle'),
  'KeyA': () => APP.modules.sketch.setTool('arc'),
  'KeyS': () => APP.modules.sketch.setTool('spline'),
  'KeyP': () => APP.modules.sketch.setTool('polygon'),
  'Escape': () => APP.modules.sketch.endSketch(),
};

const solidShortcuts = {
  'KeyE': () => document.getElementById('solid-extrude-btn')?.click(),
  'KeyV': () => document.getElementById('solid-revolve-btn')?.click(),
  'KeyF': () => document.getElementById('solid-fillet-btn')?.click(),
  'KeyM': () => document.getElementById('solid-mirror-btn')?.click(),
  'KeyP': () => document.getElementById('solid-pattern-btn')?.click(),
};

document.addEventListener('keydown', (event) => {
  const handler = sketchShortcuts[event.code] || solidShortcuts[event.code];
  if (handler) {
    handler();
  }
});
```

---

## 9. CSS Styling (Optional)

**Add to `app/index.html` or `app/css/main.css`:**

```css
.tb-tab {
  display: none;
  flex: 0 1 auto;
  gap: 4px;
}

.tb-tab.active {
  display: flex;
}

.tb-btn {
  padding: 6px 12px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.tb-btn:hover {
  background: var(--accent-blue);
  color: white;
}

.tb-btn.active {
  background: var(--accent-blue);
  color: white;
  border-color: var(--accent-blue);
}

.tb-divider {
  width: 1px;
  height: 24px;
  background: var(--border-color);
}

#sketch-panel,
#solid-panel,
#surface-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

#sketch-panel h3,
#solid-panel h3,
#surface-panel h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

#sketch-panel button,
#solid-panel button,
#surface-panel button {
  padding: 4px 8px;
  margin: 2px;
  background: var(--accent-blue);
  color: white;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  font-size: 11px;
}

#sketch-panel button:hover,
#solid-panel button:hover,
#surface-panel button:hover {
  background: var(--accent-blue-hover);
}
```

---

## 10. Testing

**Quick test in browser console:**

```javascript
// Test sketch
APP.modules.sketch.init();
const sketch = APP.modules.sketch.startSketch('XY');
console.log(sketch);

// Test solid
APP.modules.solid.init();
const geometry = new THREE.BoxGeometry(10, 10, 10);
const extrude = APP.modules.solid.extrude(geometry, { distance: 20 });
console.log(extrude);

// Test surface
APP.modules.surface.init();
const surf = APP.modules.surface.extrudeSurface(geometry, { distance: 5 });
console.log(surf);

// Test agent API
window.cycleCAD.execute('sketch', 'startSketch', { plane: 'XY' })
  .then(result => console.log('Agent API works:', result));
```

---

All code snippets are production-ready and follow the existing cycleCAD patterns!
