# cycleCAD Developer Guide

Complete reference for building with and extending cycleCAD's LEGO microkernel architecture.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Getting Started for Developers](#getting-started-for-developers)
3. [Module Lifecycle](#module-lifecycle)
4. [Creating a Custom Module](#creating-a-custom-module)
5. [Kernel API Reference](#kernel-api-reference)
6. [Core Modules Reference](#core-modules-reference)
7. [Event Catalog](#event-catalog)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### The LEGO Microkernel Concept

cycleCAD is built on a **LEGO microkernel architecture** — a tiny immutable core with pluggable, swappable modules. Unlike monolithic CAD systems, every feature (sketching, 3D operations, drawings, simulations) is a separate module that can be:

- **Loaded** on demand (lazy-loading for fast startup)
- **Activated** to inject UI and start processing
- **Deactivated** to pause (state preserved in memory)
- **Unloaded** to free memory
- **Hot-swapped** to replace with alternative implementations

### Why LEGO Modules?

| Problem | LEGO Solution |
|---------|---------------|
| Monolithic 5MB+ bundle | Modules load only when needed |
| Feature coupling | Events, not imports — no direct dependencies |
| Multiple backends (B-Rep vs mesh) | Smart dispatch: try B-Rep, fall back to mesh |
| Memory on low-end devices | Auto-eviction: unload least-used modules when budget exceeded |
| Plugin developers stuck | Standard interface: anyone can write modules |

### Core Architecture

```
┌─────────────────────────────────────────────────────────┐
│           The Immutable Kernel (~50KB)                  │
├─────────────────────────────────────────────────────────┤
│  Module Registry • Event Bus • Command Dispatcher      │
│  State Manager • Memory Manager • Smart Dispatch       │
└─────────────────────────────────────────────────────────┘
         ↕  (events only, no direct calls)
┌─────────────────────────────────────────────────────────┐
│               LEGO Modules (pluggable)                  │
├─────────────────────────────────────────────────────────┤
│  Viewport  │  Sketch  │  Ops  │  Drawing  │  Sim  │    │
│  Assembly  │  AI Chat │ STEP  │ B-Rep Core│...    │    │
└─────────────────────────────────────────────────────────┘
```

### Smart Dispatch Pattern

When a user requests a feature (e.g., "fillet"), the kernel:

1. **Checks availability:** Is B-Rep initialized? → Yes
2. **Routes to preferred:** Call `brep.fillet(edges, radius)`
3. **Falls back gracefully:** If B-Rep unavailable → Call `mesh.fillet()` (visual approximation)
4. **Loads on-demand:** If module not loaded → `kernel.load('brep')` then retry

This ensures the app **never breaks** — users always get something, even if the premium backend is unavailable.

---

## Getting Started for Developers

### Prerequisites

- Node.js 18+
- Git
- A text editor (VS Code recommended)
- Chrome or Chromium for testing

### Clone and Install

```bash
git clone https://github.com/vvlars-cmd/cyclecad.git
cd cyclecad
npm install
```

### Directory Structure

```
cyclecad/
├── app/
│   ├── index.html              # Main app entry point
│   ├── js/
│   │   ├── kernel.js           # Immutable microkernel (~50KB)
│   │   ├── app.js              # App state and initialization
│   │   ├── modules/
│   │   │   ├── viewport.js     # Core: 3D scene, camera, rendering
│   │   │   ├── sketch.js       # Core: 2D sketcher
│   │   │   ├── ops.js          # Core: extrude, revolve, fillet, etc.
│   │   │   ├── drawing.js      # Engineering drawings + DXF export
│   │   │   ├── assembly.js     # Components + mates + explosions
│   │   │   ├── simulation.js   # FEA, kinematics, thermal
│   │   │   ├── step.js         # STEP import/export
│   │   │   ├── brep-core.js    # B-Rep geometry engine (OCCT WASM)
│   │   │   ├── ai-chat.js      # AI copilot (Gemini + Groq)
│   │   │   ├── token-engine.js # $CYCLE token accounting
│   │   │   └── marketplace.js  # Model marketplace
│   │   ├── agent-api.js        # Public API for agents
│   │   ├── token-engine.js     # Token ledger system
│   │   └── shared/
│   │       ├── three-utils.js  # Three.js helpers
│   │       ├── geometry.js     # Math: vectors, planes, intersections
│   │       └── storage.js      # localStorage helpers
│   └── styles/
│       └── app.css
├── docs/
│   ├── DEVELOPER-GUIDE.md      # This file
│   ├── TUTORIAL.md             # Getting-started tutorial
│   ├── ARCHITECTURE.md         # Detailed architecture
│   └── KERNEL-API.md           # Kernel API reference
├── server/
│   ├── mcp-server.js           # MCP protocol server
│   ├── api-server.js           # REST API (HTTP + WebSocket)
│   └── converter.py            # STEP→GLB server (FastAPI)
├── bin/
│   └── cyclecad-cli.js         # Command-line interface
├── test/
│   ├── kernel.test.js
│   ├── modules/
│   │   ├── sketch.test.js
│   │   ├── ops.test.js
│   │   └── ...
│   └── agent-api.test.js
├── package.json
├── kernel.config.js            # Kernel configuration
└── README.md
```

### Run the App Locally

```bash
# Development server with live reload
npm run dev
# Opens http://localhost:5173

# Production build
npm run build

# Run tests
npm test

# Run with debug logging
npm run dev -- --debug
```

### View the Architecture

The microkernel structure is visualized at:

```
http://localhost:5173/app/?view=architecture
```

This shows:
- All 20 modules with status (loaded/active/dormant/unloaded)
- Event connections between modules
- Memory usage per module
- Auto-eviction history

### Run the Visual Test Agent

```bash
# In the app, press Ctrl+Shift+T
# Or navigate to:
http://localhost:5173/app/test-agent.html
```

This launches an interactive test suite with 113 tests across 15 categories. The test agent runs in split-screen mode (app on left, test log on right) and provides live visualization of every click.

---

## Module Lifecycle

Every module follows this state machine:

```
     ┌─────────────────────────────────────────┐
     │  Registered (definition only)           │
     │  ← kernel.register(moduleDef)           │
     └────────────────────┬────────────────────┘
                          │
                    kernel.load()
                          ↓
     ┌─────────────────────────────────────────┐
     │  Loaded (assets downloaded)             │
     │  → load(kernel) called                   │
     │  → Module can load files, WASM, etc.    │
     └────────────────────┬────────────────────┘
                          │
                    kernel.activate()
                          ↓
     ┌─────────────────────────────────────────┐
     │  Active (running)                       │
     │  → activate(kernel) called              │
     │  → UI injected, events wired            │
     │  → Memory: ~50% of estimate             │
     └────────────────────┬────────────────────┘
                          │
                   kernel.deactivate()
                          ↓
     ┌─────────────────────────────────────────┐
     │  Dormant (suspended, memory kept)       │
     │  → deactivate(kernel) called            │
     │  → UI hidden, events unsubscribed       │
     │  → Memory: ~10% of estimate             │
     └────────────────────┬────────────────────┘
                          │
                   kernel.unload()
                          ↓
     ┌─────────────────────────────────────────┐
     │  Unloaded (freed)                       │
     │  → unload(kernel) called                │
     │  → All memory released                  │
     └─────────────────────────────────────────┘
```

### Example Lifecycle

```javascript
// Module definition
const MyModule = {
  id: 'my-module',
  async load(kernel) {
    console.log('[MyModule] Loading (downloading resources...)');
    // Download WASM, models, textures, etc.
    // Called once per app session
  },
  async activate(kernel) {
    console.log('[MyModule] Activating (injecting UI...)');
    // Show UI, register commands, subscribe to events
    kernel.on('viewport:ready', this.onViewportReady.bind(this));
  },
  async deactivate(kernel) {
    console.log('[MyModule] Deactivating (hiding UI...)');
    // Hide UI, unsubscribe from events
    // State is preserved in memory
    kernel.off('viewport:ready', this.onViewportReady);
  },
  async unload(kernel) {
    console.log('[MyModule] Unloading (freeing memory)...');
    // Dispose geometries, clear arrays, etc.
    // This is the only state loss point
  },
};

// Usage
await kernel.register(MyModule);           // Registered
await kernel.load('my-module');            // Loaded
await kernel.activate('my-module');        // Active
await kernel.deactivate('my-module');      // Dormant
await kernel.unload('my-module');          // Unloaded
```

---

## Creating a Custom Module

This tutorial walks through creating a **Part Counter** module that counts parts in the scene and displays a badge.

### Step 1: Create the Module File

Create `app/js/modules/part-counter.js`:

```javascript
const PartCounterModule = {
  // ========== METADATA ==========
  id: 'part-counter',
  name: 'Part Counter',
  version: '1.0.0',
  category: 'tool',

  // Dependencies: only loads when these are already active
  dependencies: ['viewport'],

  // Estimated memory (MB): used for auto-eviction decisions
  memoryEstimate: 2,

  // ========== LIFECYCLE ==========

  async load(kernel) {
    // Called once when module is first loaded
    // Good place to download external resources
    console.log('[PartCounter] Loading...');
    this.partCount = 0;
    this.mesh = null;
  },

  async activate(kernel) {
    // Called when module should start running
    // Inject UI, subscribe to events, register commands
    console.log('[PartCounter] Activating...');

    // Subscribe to events
    kernel.on('viewport:ready', this.onViewportReady.bind(this));
    kernel.on('feature:created', this.onFeatureCreated.bind(this));
    kernel.on('part:selected', this.onPartSelected.bind(this));

    // Inject UI into the toolbar
    const toolbar = document.querySelector('#ce-buttons');
    if (toolbar) {
      const button = document.createElement('button');
      button.id = 'pc-toggle';
      button.textContent = '📊 Parts';
      button.addEventListener('click', () => kernel.exec('part-counter.toggle'));
      toolbar.appendChild(button);
    }

    // Create badge element (hidden initially)
    const badge = document.createElement('div');
    badge.id = 'pc-badge';
    badge.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2563eb;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: bold;
      z-index: 1000;
      display: none;
    `;
    document.body.appendChild(badge);
  },

  async deactivate(kernel) {
    // Called when module should pause
    // Remove UI, unsubscribe from events
    console.log('[PartCounter] Deactivating...');

    kernel.off('viewport:ready', this.onViewportReady);
    kernel.off('feature:created', this.onFeatureCreated);
    kernel.off('part:selected', this.onPartSelected);

    const button = document.querySelector('#pc-toggle');
    if (button) button.remove();
  },

  async unload(kernel) {
    // Called when module is being removed entirely
    // Free all memory, dispose resources
    console.log('[PartCounter] Unloading...');

    const badge = document.querySelector('#pc-badge');
    if (badge) badge.remove();

    this.partCount = 0;
    this.mesh = null;
  },

  // ========== EVENT HANDLERS ==========

  onViewportReady(data) {
    console.log('[PartCounter] Viewport ready, initializing counter');
    this.updateCount();
  },

  onFeatureCreated(data) {
    console.log('[PartCounter] Feature created:', data.featureName);
    this.updateCount();
  },

  onPartSelected(data) {
    console.log('[PartCounter] Part selected:', data.meshId);
    this.updateCount();
  },

  updateCount() {
    // Count meshes in the scene
    if (!window._scene) return;

    const meshes = window._scene.getObjectsByProperty('isMesh', true);
    this.partCount = meshes.filter(m => m.userData.isGeometry).length;

    // Update badge
    const badge = document.querySelector('#pc-badge');
    if (badge && badge.style.display !== 'none') {
      badge.textContent = `📊 ${this.partCount} Parts`;
    }
  },

  // ========== COMMANDS ==========

  provides: {
    commands: {
      'part-counter.toggle': async (params) => {
        const badge = document.querySelector('#pc-badge');
        const isVisible = badge.style.display !== 'none';

        badge.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
          this.updateCount();
        }

        return {
          success: true,
          visible: !isVisible,
          count: this.partCount,
        };
      },

      'part-counter.getCount': async (params) => {
        return {
          count: this.partCount,
        };
      },

      'part-counter.export': async (params) => {
        // Export count to JSON
        const data = {
          timestamp: new Date().toISOString(),
          partCount: this.partCount,
        };

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'part-count.json';
        link.click();
        URL.revokeObjectURL(url);

        return { success: true };
      },
    },

    // UI provided by this module
    ui: {
      // Buttons for toolbar
      toolbar: [
        {
          id: 'pc-toggle',
          label: 'Toggle Counter',
          icon: '📊',
          command: 'part-counter.toggle',
        },
      ],

      // Right-side panel
      panel: `
        <div id="pc-panel" style="padding: 16px;">
          <h3>Part Counter</h3>
          <p>Total parts: <strong id="pc-count">0</strong></p>
          <button onclick="kernel.exec('part-counter.export')">
            Export JSON
          </button>
        </div>
      `,
    },
  },
};

export default PartCounterModule;
```

### Step 2: Register the Module

In `app/js/app.js`, add to the module registration list:

```javascript
import PartCounterModule from './modules/part-counter.js';

async function initializeApp() {
  // ... existing initialization code ...

  // Register modules (must be done before load/activate)
  await kernel.register(PartCounterModule);
  await kernel.register(ViewportModule);
  // ... other modules ...

  // Load and activate core modules
  await kernel.activate('viewport');

  // Lazy-load optional modules on demand
  // Part Counter will activate when user clicks its button
}
```

### Step 3: Update index.html

Add the import to `app/index.html`:

```html
<script type="module">
  import PartCounterModule from './js/modules/part-counter.js';
  // Rest of initialization...
</script>
```

### Step 4: Test Your Module

In the browser console:

```javascript
// Check registration
kernel.list();  // Should show 'part-counter' as Registered

// Load it
await kernel.activate('part-counter');

// Test commands
await kernel.exec('part-counter.getCount');
// { count: 0 }

await kernel.exec('part-counter.toggle');
// { success: true, visible: true, count: 0 }

// Export
await kernel.exec('part-counter.export');
// Downloads part-count.json
```

---

## Kernel API Reference

### Module Registry

#### `kernel.register(moduleDef)`

Register a module definition (doesn't load it yet).

```javascript
await kernel.register({
  id: 'my-module',
  name: 'My Module',
  // ... rest of definition
});
```

**Parameters:**
- `moduleDef` (object) — Module definition with id, name, version, category, etc.

**Returns:** Promise<void>

**Throws:** Error if module ID already registered

---

#### `kernel.get(moduleId)`

Get current status and info about a module.

```javascript
const info = kernel.get('viewport');
console.log(info);
// {
//   id: 'viewport',
//   name: 'Viewport',
//   status: 'active',  // 'registered' | 'loading' | 'loaded' | 'activating' | 'active' | 'deactivating' | 'dormant' | 'unloading' | 'unloaded'
//   memoryUsage: 12.5,  // MB
//   dependencies: ['THREE'],
//   loadTime: 450,  // ms
// }
```

**Returns:** object with metadata and status

---

#### `kernel.list()`

List all registered modules with status.

```javascript
const modules = kernel.list();
modules.forEach(m => {
  console.log(`${m.id}: ${m.status} (${m.memoryUsage}MB)`);
});
```

**Returns:** Array of module info objects

---

#### `kernel.listByCategory(category)`

Filter modules by category.

```javascript
const tools = kernel.listByCategory('tool');
const cores = kernel.listByCategory('core');
```

**Returns:** Array of module info objects

---

### Module Lifecycle

#### `kernel.load(moduleId)`

Load a module (download resources, run `load()` hook).

- Automatically resolves dependencies first
- Resolves immediately if already loaded
- Emits `module:loaded` event

```javascript
await kernel.load('brep-core');
```

**Returns:** Promise<void>

---

#### `kernel.activate(moduleId)`

Load + activate a module (inject UI, start processing).

- Calls `load()` first if needed
- Calls `activate()` hook
- Emits `module:activated` event

```javascript
await kernel.activate('viewport');
```

**Returns:** Promise<void>

---

#### `kernel.deactivate(moduleId)`

Pause a module (suspend but keep in memory).

- Calls `deactivate()` hook
- Removes UI, unsubscribes from events
- Emits `module:deactivated` event
- Memory stays allocated (faster reactivation)

```javascript
await kernel.deactivate('drawing');
```

**Returns:** Promise<void>

---

#### `kernel.unload(moduleId)`

Unload a module completely (free all memory).

- Calls `unload()` hook
- Calls `deactivate()` first if active
- Emits `module:unloaded` event

```javascript
await kernel.unload('simulation');
```

**Returns:** Promise<void>

---

#### `kernel.swap(oldId, newId)`

Hot-swap modules (unload old, load new, preserve state).

Useful for switching between B-Rep and mesh backends without losing user work.

```javascript
await kernel.swap('ops-mesh', 'ops-brep');
```

**Returns:** Promise<void>

---

### Event Bus

#### `kernel.on(event, handler, options?)`

Subscribe to an event.

```javascript
kernel.on('part:selected', (data) => {
  console.log('Selected:', data.meshId);
});

// Subscribe once then auto-unsubscribe
kernel.on('viewport:ready', handler, { once: true });
```

**Parameters:**
- `event` (string) — Event name (e.g., 'part:selected')
- `handler` (function) — Callback receiving event data
- `options` (object) — { once: true } for one-time subscription

**Returns:** void

---

#### `kernel.off(event, handler)`

Unsubscribe from an event.

```javascript
kernel.off('part:selected', myHandler);
```

**Parameters:**
- `event` (string) — Event name
- `handler` (function) — Same handler function passed to `on()`

**Returns:** void

---

#### `kernel.emit(event, data?)`

Publish an event (usually called by modules, not consumers).

```javascript
kernel.emit('part:selected', { meshId: 42, position: [0, 0, 0] });
```

**Parameters:**
- `event` (string) — Event name
- `data` (object) — Payload to send to subscribers

**Returns:** void

---

#### `kernel.once(event, handler)`

Subscribe to an event, auto-unsubscribe after first call.

```javascript
await new Promise(resolve => {
  kernel.once('step:importComplete', (data) => {
    resolve(data);
  });
});
```

**Returns:** void

---

### Command System

#### `kernel.exec(command, params?)`

Execute a command (auto-loads module if needed).

```javascript
const result = await kernel.exec('ops.extrude', {
  profile: 'active-sketch',
  distance: 50,
  reverse: false,
});

console.log(result);
// { success: true, featureId: 'feat_123' }
```

**Parameters:**
- `command` (string) — Command name (e.g., 'ops.extrude')
- `params` (object) — Command parameters

**Returns:** Promise resolving to command result (shape varies by command)

---

#### `kernel.hasCommand(name)`

Check if a command is available.

```javascript
if (kernel.hasCommand('brep.fillet')) {
  await kernel.exec('brep.fillet', { ... });
} else {
  console.log('B-Rep not available, using mesh approximation');
}
```

**Returns:** boolean

---

#### `kernel.listCommands()`

List all available commands across all modules.

```javascript
const commands = kernel.listCommands();
commands.forEach(cmd => {
  console.log(`${cmd.namespace}.${cmd.name}: ${cmd.description}`);
});
```

**Returns:** Array of command info objects

---

### Shared State

#### `kernel.state.set(key, value)`

Set a global state value.

```javascript
kernel.state.set('current-part', { id: 42, name: 'Part 1' });
```

**Returns:** void

---

#### `kernel.state.get(key)`

Get a state value.

```javascript
const part = kernel.state.get('current-part');
```

**Returns:** any

---

#### `kernel.state.watch(key, handler)`

Watch a state key for changes.

```javascript
kernel.state.watch('current-part', (newValue, oldValue) => {
  console.log(`Part changed from ${oldValue.id} to ${newValue.id}`);
});
```

**Parameters:**
- `key` (string) — State key
- `handler` (function) — Called with (newValue, oldValue)

**Returns:** unwatch function

---

### Memory Manager

#### `kernel.memory.usage()`

Get total memory in use (MB).

```javascript
const used = kernel.memory.usage();
console.log(`Using ${used.toFixed(1)}MB / ${kernel.memory.budget}MB`);
```

**Returns:** number (MB)

---

#### `kernel.memory.pressure()`

Get memory pressure ratio (0.0 = empty, 1.0 = full).

```javascript
const ratio = kernel.memory.pressure();
if (ratio > 0.8) {
  console.log('Warning: Memory pressure high, unloading dormant modules');
  await kernel.memory.gc();
}
```

**Returns:** number (0-1)

---

#### `kernel.memory.budget`

Max memory allowed (MB, default 512).

```javascript
kernel.memory.budget = 1024;  // Increase to 1GB
```

---

#### `kernel.memory.gc()`

Force garbage collection (unload least-used dormant modules).

Automatically called when pressure > 0.9. Manual calls for testing.

```javascript
await kernel.memory.gc();
console.log(`After GC: ${kernel.memory.usage().toFixed(1)}MB`);
```

**Returns:** Promise<{ unloaded: string[], freed: number }>

---

## Core Modules Reference

This section documents the 10 core modules and all their commands.

### Module: Viewport

**ID:** `viewport`
**Category:** `core`
**Memory:** 45 MB
**Dependencies:** `THREE`

The 3D viewport — scene, camera, lights, rendering.

**Commands:**

- **viewport.fitAll()** — Frame all parts in view
  - Returns: `{ success: true }`

- **viewport.fitSelection()** — Frame selected parts
  - Returns: `{ success: true }`

- **viewport.setView(name)** — Set preset view (front, top, right, isometric, etc.)
  - Parameters: `{ name: 'front' | 'top' | 'right' | 'back' | 'bottom' | 'left' | 'isometric' }`
  - Returns: `{ success: true, view: string }`

- **viewport.toggleWireframe()** — Toggle wireframe rendering
  - Returns: `{ success: true, wireframe: boolean }`

- **viewport.toggleGrid()** — Toggle grid floor plane
  - Returns: `{ success: true, gridVisible: boolean }`

- **viewport.snapshot(options)** — Capture 3D view as PNG/JPG
  - Parameters: `{ format: 'png' | 'jpg', width: number, height: number }`
  - Returns: `{ success: true, dataUrl: string }`

- **viewport.multiview(columns, rows)** — Create split viewport
  - Parameters: `{ columns: number, rows: number }`
  - Returns: `{ success: true, viewCount: number }`

**Events:**

- `viewport:ready` — Viewport initialized and rendered once
- `viewport:resize` — Window resized
- `viewport:viewChanged` — Preset view changed
- `viewport:cameraMoved` — User rotated/panned/zoomed
- `viewport:rendered` — Frame rendered (fires every frame)

---

### Module: Sketch

**ID:** `sketch`
**Category:** `core`
**Memory:** 25 MB
**Dependencies:** `viewport`

2D sketcher with constraints.

**Commands:**

- **sketch.start(plane)** — Start a sketch
  - Parameters: `{ plane: 'XY' | 'YZ' | 'XZ' | { normal: [x,y,z], origin: [x,y,z] } }`
  - Returns: `{ success: true, sketchId: string }`

- **sketch.line(p1, p2)** — Draw line
  - Parameters: `{ start: [x, y], end: [x, y] }`

- **sketch.circle(center, radius)** — Draw circle
  - Parameters: `{ center: [x, y], radius: number }`

- **sketch.rectangle(corner1, corner2)** — Draw rectangle
  - Parameters: `{ p1: [x, y], p2: [x, y] }`

- **sketch.arc(center, start, end, radius)** — Draw arc
  - Parameters: `{ center: [x, y], start: [x, y], end: [x, y], radius: number }`

- **sketch.constraint(type, entityIds, params)** — Add constraint
  - Parameters: `{ type: 'coincident' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'tangent' | 'equal' | 'fixed' | 'concentric' | 'symmetric' | 'distance' | 'angle', entities: [id1, id2], params: {...} }`

- **sketch.finish()** — End sketch and create profile
  - Returns: `{ success: true, profileId: string }`

**Events:**

- `sketch:started` — Sketch mode activated
- `sketch:entityAdded` — Line/circle/arc/rect drawn
- `sketch:constraintAdded` — Constraint applied
- `sketch:finished` — Sketch exited
- `sketch:toolChanged` — Active sketch tool changed

---

### Module: Operations

**ID:** `ops`
**Category:** `core`
**Memory:** 60 MB
**Dependencies:** `viewport`, `sketch`

Parametric modeling: extrude, revolve, fillet, chamfer, boolean, shell, pattern.

**Commands:**

- **ops.extrude(profile, distance, direction?)** — Extrude sketch profile
  - Parameters: `{ profileId: string, distance: number, direction?: [x,y,z], taper?: number }`
  - Returns: `{ success: true, featureId: string }`

- **ops.revolve(profile, axis, angle?)** — Revolve sketch around axis
  - Parameters: `{ profileId: string, axis: [x,y,z], angle?: number }`

- **ops.fillet(edges, radius)** — Fillet edges
  - Parameters: `{ edgeIds: [id1, id2, ...] | 'all', radius: number }`

- **ops.chamfer(edges, size)** — Chamfer edges
  - Parameters: `{ edgeIds: [id1, id2, ...], size: number }`

- **ops.hole(point, radius, depth?)** — Create hole
  - Parameters: `{ center: [x, y, z], radius: number, depth?: number }`

- **ops.cut(tool)** — Boolean cut
  - Parameters: `{ toolId: string }`

- **ops.union(body)** — Boolean union
  - Parameters: `{ bodyId: string }`

- **ops.intersect(body)** — Boolean intersect
  - Parameters: `{ bodyId: string }`

- **ops.shell(thickness, removeFaces?)** — Create hollow shell
  - Parameters: `{ thickness: number, removeFaceIds?: [id1, id2, ...] }`

- **ops.pattern(type, count, spacing)** — Array pattern
  - Parameters: `{ type: 'rectangular' | 'circular', count: number, spacing: number }`

**Events:**

- `feature:created` — Feature added
- `feature:edited` — Feature parameters changed
- `feature:deleted` — Feature removed
- `rebuild:start` — Geometry rebuild starting
- `rebuild:complete` — Rebuild finished
- `rebuild:error` — Error during rebuild

---

### Module: Drawing

**ID:** `drawing`
**Category:** `feature`
**Memory:** 35 MB
**Dependencies:** `viewport`

Engineering drawings with orthographic views, sections, dimensions.

**Commands:**

- **drawing.new()** — Create new drawing
  - Returns: `{ success: true, drawingId: string }`

- **drawing.addView(type, position)** — Add view to drawing
  - Parameters: `{ type: 'front' | 'top' | 'right' | 'section' | 'detail', position: [x, y] }`

- **drawing.addDimension(type, geometry)** — Add dimension
  - Parameters: `{ type: 'distance' | 'diameter' | 'radius' | 'angle', geometryId: string }`

- **drawing.addBalloon(number, position)** — Add part balloon
  - Parameters: `{ partNumber: number, position: [x, y] }`

- **drawing.export(format)** — Export drawing
  - Parameters: `{ format: 'pdf' | 'dwg' | 'dxf' | 'png' | 'svg' }`
  - Returns: `{ success: true, dataUrl: string }`

**Events:**

- `drawing:created` — Drawing initialized
- `drawing:viewAdded` — View added
- `drawing:dimensionAdded` — Dimension added
- `drawing:exported` — Export complete

---

### Module: Assembly

**ID:** `assembly`
**Category:** `feature`
**Memory:** 40 MB
**Dependencies:** `viewport`

Component management, mates, constraints, explosions.

**Commands:**

- **assembly.insertComponent(modelPath, position?)** — Insert part
  - Parameters: `{ path: string, position?: [x, y, z] }`
  - Returns: `{ success: true, componentId: string }`

- **assembly.createMate(type, comp1, comp2, params)** — Create mate
  - Parameters: `{ type: 'revolute' | 'prismatic' | 'planar' | 'spherical' | 'distance' | 'angle' | 'parallel' | 'perpendicular' | 'tangent', comp1Id: string, comp2Id: string, params: {...} }`

- **assembly.explode(intensity)** — Explode assembly
  - Parameters: `{ intensity: 0-1 }`

- **assembly.collapse()** — Collapse assembly
  - Returns: `{ success: true }`

- **assembly.generateBOM()** — Generate bill of materials
  - Returns: `{ success: true, bom: [...] }`

**Events:**

- `assembly:componentInserted` — Component added
- `assembly:jointCreated` — Mate created
- `assembly:interfereFound` — Collision detected
- `assembly:exploded` — Assembly exploded
- `assembly:collapsed` — Assembly collapsed

---

### Module: STEP

**ID:** `step`
**Category:** `io`
**Memory:** 80 MB
**Dependencies:** `viewport`, `brep-core` (optional)

STEP import/export via OpenCascade.js or server converter.

**Commands:**

- **step.import(file)** — Import STEP file
  - Parameters: `{ file: File | Blob | ArrayBuffer | string (URL) }`
  - Returns: `{ success: true, parts: number, modelId: string }`

- **step.export()** — Export current model
  - Returns: `{ success: true, dataUrl: string }`

**Events:**

- `step:importStart` — Import beginning
- `step:importProgress` — Bytes loaded (payload: { loaded, total })
- `step:importComplete` — Import succeeded
- `step:importError` — Import failed
- `step:exportComplete` — Export finished

---

### Module: B-Rep Core

**ID:** `brep-core`
**Category:** `engine`
**Memory:** 120 MB
**Dependencies:** `viewport`

B-Rep geometry engine (OpenCascade.js WASM). Enables:
- Real boolean operations (not visual)
- Exact fillet/chamfer (not approximation)
- STEP native support
- Tolerance checking

**Commands:**

- **brep.fillet(edges, radius)** — Real edge fillet
  - Parameters: `{ edgeIds: [id1, id2, ...] | 'all', radius: number }`

- **brep.chamfer(edges, size)** — Real edge chamfer
  - Parameters: `{ edgeIds: [id1, id2, ...], size: number }`

- **brep.shell(thickness, removeFaces?)** — Hollow solid
  - Parameters: `{ thickness: number, removeFaceIds?: [...] }`

- **brep.split(plane)** — Cut with plane
  - Parameters: `{ normal: [x, y, z], origin: [x, y, z] }`

**Events:**

- `brep:initialized` — B-Rep engine ready
- `brep:wasmLoaded` — OpenCascade.js loaded
- `brep:operationComplete` — B-Rep operation finished

---

### Module: AI Chat

**ID:** `ai-chat`
**Category:** `ai`
**Memory:** 15 MB (models loaded on-demand)
**Dependencies:** `viewport`, `ops`

AI copilot (Gemini Flash + Groq LLama 3.1 + offline NLP).

**Commands:**

- **ai.message(text)** — Send message to AI
  - Parameters: `{ text: string }`
  - Returns: `{ success: true, response: string, action?: { command: string, params: any } }`

**Events:**

- `ai:messageReceived` — AI responded
- `ai:commandExecuted` — AI issued command

---

## Event Catalog

Complete table of all events emitted across all modules.

| Event | Module | Payload | Description |
|-------|--------|---------|-------------|
| `part:selected` | viewport | `{ meshId, position, normal }` | User clicked 3D object |
| `part:deselected` | viewport | `{ meshId }` | User deselected |
| `viewport:ready` | viewport | `{}` | Viewport initialized |
| `viewport:resize` | viewport | `{ width, height }` | Window resized |
| `viewport:viewChanged` | viewport | `{ view: string }` | Preset view changed |
| `viewport:cameraMoved` | viewport | `{ position, target }` | Camera moved |
| `viewport:rendered` | viewport | `{}` | Frame rendered (every frame) |
| `sketch:started` | sketch | `{ sketchId, plane }` | Sketch mode activated |
| `sketch:finished` | sketch | `{ profileId, entityCount }` | Sketch exited |
| `sketch:entityAdded` | sketch | `{ type, vertices }` | Line/circle/arc drawn |
| `sketch:toolChanged` | sketch | `{ tool: string }` | Active tool changed |
| `sketch:dimensionAdded` | sketch | `{ type, value }` | Dimension applied |
| `feature:created` | ops | `{ featureId, featureName, type }` | Feature added |
| `feature:edited` | ops | `{ featureId, params }` | Parameters changed |
| `feature:deleted` | ops | `{ featureId }` | Feature removed |
| `rebuild:start` | ops | `{ featureId }` | Rebuild starting |
| `rebuild:complete` | ops | `{ duration, success }` | Rebuild finished |
| `rebuild:error` | ops | `{ featureId, error }` | Rebuild failed |
| `drawing:created` | drawing | `{ drawingId }` | Drawing initialized |
| `drawing:viewAdded` | drawing | `{ type, position }` | View added |
| `drawing:dimensionAdded` | drawing | `{ type, value }` | Dimension added |
| `drawing:exported` | drawing | `{ format, dataUrl }` | Export complete |
| `assembly:componentInserted` | assembly | `{ componentId, path }` | Component inserted |
| `assembly:jointCreated` | assembly | `{ jointId, type }` | Mate created |
| `assembly:interferenceFound` | assembly | `{ comp1Id, comp2Id }` | Collision detected |
| `assembly:exploded` | assembly | `{ intensity }` | Assembly exploded |
| `assembly:collapsed` | assembly | `{}` | Assembly collapsed |
| `step:importStart` | step | `{ filename, fileSize }` | Import starting |
| `step:importProgress` | step | `{ loaded, total, percent }` | Download progress |
| `step:importComplete` | step | `{ parts, duration }` | Import succeeded |
| `step:importError` | step | `{ error, details }` | Import failed |
| `step:exportComplete` | step | `{ dataUrl, size }` | Export finished |
| `brep:initialized` | brep-core | `{}` | B-Rep ready |
| `brep:wasmLoaded` | brep-core | `{ size }` | WASM loaded |
| `brep:operationComplete` | brep-core | `{ type, duration }` | Operation finished |
| `ai:messageReceived` | ai-chat | `{ response, action }` | AI responded |
| `ai:commandExecuted` | ai-chat | `{ command, params }` | AI issued command |
| `module:loaded` | kernel | `{ moduleId }` | Module loaded |
| `module:activated` | kernel | `{ moduleId }` | Module activated |
| `module:deactivated` | kernel | `{ moduleId }` | Module deactivated |
| `module:unloaded` | kernel | `{ moduleId }` | Module unloaded |
| `module:error` | kernel | `{ moduleId, error }` | Module error |
| `module:swapped` | kernel | `{ oldId, newId }` | Hot-swap completed |

---

## Best Practices

### 1. Always Use Events, Never Import Between Modules

**Bad:**
```javascript
// Don't do this
import { ops } from './ops.js';
import { viewport } from './viewport.js';

ops.extrude(); // Direct call, tight coupling
```

**Good:**
```javascript
// Do this instead
kernel.emit('sketch:finished', { profileId });
// Operations module listens and acts
kernel.on('feature:created', (data) => {
  // React to changes
});
```

### 2. Declare Accurate Memory Estimates

The memory manager uses `memoryEstimate` to decide when to auto-evict modules.

```javascript
const MyModule = {
  // Realistic estimate helps kernel make smart decisions
  memoryEstimate: 45,  // 45 MB if fully active
};
```

### 3. Always Clean Up in unload()

Memory leaks destroy the "LEGO" benefit.

```javascript
async unload(kernel) {
  // Dispose Three.js objects
  this.geometry.dispose();
  this.material.dispose();
  this.mesh.parent.remove(this.mesh);

  // Clear arrays
  this.cache = [];

  // Remove DOM elements
  this.element.remove();

  // Cancel pending requests
  if (this.xhr) this.xhr.abort();
}
```

### 4. Use kernel.state, Not Global Variables

```javascript
// Bad
window.currentPart = 42;

// Good
kernel.state.set('current-part', 42);
const part = kernel.state.get('current-part');

// Watch for changes
kernel.state.watch('current-part', (newValue, oldValue) => {
  console.log(`Changed from ${oldValue} to ${newValue}`);
});
```

### 5. Handle Missing Dependencies Gracefully

```javascript
async activate(kernel) {
  // Check if B-Rep is available
  if (kernel.hasCommand('brep.fillet')) {
    // Use exact fillet
  } else {
    // Fall back to mesh approximation
    console.warn('B-Rep not available, using mesh fillet');
  }
}
```

### 6. Implement Progressive Enhancement

Load basic features immediately, premium features on-demand.

```javascript
// Module definition
const MyModule = {
  dependencies: ['viewport'],  // Core only

  async activate(kernel) {
    // Show basic UI immediately

    // Load premium features on-demand
    document.querySelector('#premium-button').addEventListener('click', async () => {
      await kernel.load('premium-feature');
      // Now available
    });
  },
};
```

### 7. Emit Contextual Events

Events should carry rich context so subscribers don't need to query state.

```javascript
// Bad
kernel.emit('feature:created');

// Good
kernel.emit('feature:created', {
  featureId: 'feat_123',
  featureName: 'Extrude',
  type: 'extrude',
  parameters: { distance: 50, direction: [0, 0, 1] },
  duration: 234,  // ms
  timestamp: Date.now(),
});
```

---

## Troubleshooting

### Module Won't Load

**Symptom:** `await kernel.load('my-module')` times out

**Causes:**
1. Circular dependency
2. Network error loading assets
3. WASM initialization failure

**Debug:**
```javascript
try {
  await kernel.load('my-module');
} catch (error) {
  console.error('Load error:', error);
  const info = kernel.get('my-module');
  console.log('Module status:', info.status);
}
```

**Fix:**
- Check `dependencies` in module definition
- Verify all assets load (open DevTools Network tab)
- Test WASM in isolation: `npm run test`

---

### Module Activated But UI Not Showing

**Symptom:** Module shows as active but buttons/panels are invisible

**Causes:**
1. `provides.ui` is empty
2. DOM element selectors don't match
3. CSS display is hidden

**Debug:**
```javascript
const info = kernel.get('my-module');
console.log(info.provides);  // Should show ui

const button = document.querySelector('#my-button');
console.log('Button found:', button);
console.log('Computed style:', window.getComputedStyle(button));
```

**Fix:**
- Add UI in `activate()`: `document.querySelector('#ce-buttons').appendChild(button)`
- Ensure selector matches your HTML
- Check CSS for `display: none`

---

### Memory Pressure High

**Symptom:** `kernel.memory.pressure() > 0.8`

**Causes:**
1. Modules not unloaded when deactivated
2. Inaccurate `memoryEstimate` values
3. Memory leaks in module `unload()`

**Debug:**
```javascript
console.log('Memory usage:', kernel.memory.usage(), 'MB');
console.log('Modules:', kernel.list().map(m => `${m.id}: ${m.memoryUsage}MB`));
```

**Fix:**
- Manually unload dormant modules: `await kernel.unload('drawing')`
- Update `memoryEstimate` values to match reality
- Add cleanup code to `unload()` hooks

---

### Commands Not Available

**Symptom:** `kernel.hasCommand('ops.extrude')` returns false

**Causes:**
1. Module not loaded/activated
2. Command typo in provides definition
3. Module registration failed

**Debug:**
```javascript
const commands = kernel.listCommands();
commands.forEach(cmd => {
  if (cmd.name.includes('extrude')) {
    console.log(cmd);  // Details
  }
});
```

**Fix:**
- Activate module: `await kernel.activate('ops')`
- Check command name: `kernel.listCommands()`
- Verify `provides.commands` in module definition

---

## Next Steps

- Read [TUTORIAL.md](./TUTORIAL.md) for hands-on getting started
- Check [KERNEL-API.md](./KERNEL-API.md) for detailed API reference
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details
- Run tests: `npm test`
- Join the community at [github.com/vvlars-cmd/cyclecad](https://github.com/vvlars-cmd/cyclecad)
