# cycleCAD v3.2 Developer Guide

Complete reference for developers extending cycleCAD through modules, plugins, and API integration.

## Table of Contents

1. [Kernel Architecture](#kernel-architecture)
2. [Module Development](#module-development)
3. [Event System](#event-system)
4. [Command API](#command-api)
5. [Plugin Development](#plugin-development)
6. [Testing](#testing)
7. [Contributing](#contributing)

---

## Kernel Architecture

### LEGO Microkernel Concept

cycleCAD uses a **LEGO microkernel** pattern: minimal core with maximum modularity.

```javascript
// Kernel (100 lines)
const kernel = {
  modules: Map,
  state: Object,
  eventBus: EventEmitter,

  register(moduleDef) { ... },
  activate(name) { ... },
  exec(command, params) { ... },
  on(event, handler) { ... }
}

// Each module is a LEGO brick
// Kernel provides the base plate
// Developers snap in bricks (modules)
```

### Why Microkernel?

- **Loose coupling**: Modules don't directly depend on each other
- **Easy testing**: Modules can be tested in isolation
- **Extensibility**: Add new modules without modifying core
- **Hot-reload**: Swap modules at runtime (advanced)
- **Scalability**: 21 modules can grow to 50+ without bloat

### Kernel API

```javascript
// Register a module
kernel.register({
  name: 'myModule',
  init() { /* setup */ },
  deactivate() { /* cleanup */ },
  commands: { myCommand() { ... } }
})

// Activate workspace (activates relevant modules)
kernel.activate('Design')  // activates sketch, modeling, features

// Execute command
await kernel.exec('shape.cylinder', { d: 50, h: 80 })

// Listen to events
kernel.on('model:changed', (delta) => { ... })

// Get/set state
kernel.state.get('activeModel')
kernel.state.set('activeModel', model)
```

---

## Module Development

### Module Lifecycle

```
1. register()     → Module registered with kernel
2. init()         → Module initializes (load data, setup UI)
3. activate()     → Module becomes active in workspace
4. commands...    → User invokes commands
5. deactivate()   → Module stops (user switched workspace)
6. unload()       → Module removed from memory (optional)
```

### Module Template

```javascript
// app/js/modules/myfeature.js
export const MyFeatureModule = {
  // Metadata
  name: 'myfeature',
  version: '1.0.0',
  dependencies: ['viewport', 'tree'],  // Modules this depends on

  // Lifecycle
  init() {
    // Called when module loads
    // Set up UI, event listeners, state
    console.log('[MyFeature] Initializing...')
  },

  deactivate() {
    // Called when workspace changes
    // Clean up listeners, hide UI
    console.log('[MyFeature] Deactivating...')
  },

  // Commands (callable via API)
  commands: {
    myCommand(params) {
      // { name, value, ... }
      // Return result or throw error
      return { success: true, result: {...} }
    },

    anotherCommand(params) {
      // Can be async
      return fetch('/api/data').then(r => r.json())
    }
  },

  // Events this module publishes
  events: [
    'myfeature:action-completed',
    'myfeature:error'
  ],

  // UI Panel (optional)
  getUI() {
    return `
      <div id="myfeature-panel">
        <button id="my-btn">Click me</button>
      </div>
    `
  }
}
```

### Complete Example: Simple Calculator Module

```javascript
export const CalculatorModule = {
  name: 'calculator',
  version: '1.0.0',
  dependencies: [],

  init() {
    this.result = 0
    this.kernel = window.kernel
  },

  commands: {
    add(params) {
      const { a, b } = params
      this.result = a + b
      this.kernel.emit('calculator:result', { result: this.result })
      return { result: this.result }
    },

    multiply(params) {
      const { a, b } = params
      this.result = a * b
      this.kernel.emit('calculator:result', { result: this.result })
      return { result: this.result }
    },

    getResult(params) {
      return { result: this.result }
    }
  },

  events: ['calculator:result'],

  getUI() {
    return `
      <div id="calculator-panel">
        <input id="calc-input" type="text" value="0" readonly>
        <button onclick="kernel.exec('calculator.add', {a: 5, b: 3})">5+3</button>
        <button onclick="kernel.exec('calculator.multiply', {a: 5, b: 3})">5×3</button>
      </div>
    `
  }
}
```

### Module Best Practices

1. **Single Responsibility**: One module = one feature (sketch, modeling, etc.)
2. **Declare Dependencies**: List modules you depend on
3. **Emit Events**: Let other modules react to your actions
4. **No Direct Imports**: Don't import other modules directly; use kernel.exec()
5. **Clean UI**: getUI() should return clean HTML, no inline styles
6. **Error Handling**: Throw descriptive errors
7. **Type Checking**: Validate params in commands

---

## Event System

### Event Categories

cycleCAD uses 30+ core events. Modules can publish custom events.

#### Model Events
```javascript
kernel.on('model:created', (payload) => { ... })
kernel.on('model:modified', (payload) => { ... })
kernel.on('model:deleted', (payload) => { ... })

// Payload example
{
  modelId: 'abc123',
  timestamp: 1234567890,
  delta: { property: 'oldValue' → 'newValue' }
}
```

#### Geometry Events
```javascript
kernel.on('geometry:changed', (payload) => { ... })
kernel.on('mesh:updated', (payload) => { ... })

// Payload
{
  meshId: 'mesh-0',
  vertices: [...],
  faces: [...],
  bbox: { min, max }
}
```

#### UI Events
```javascript
kernel.on('ui:panel-opened', (payload) => { ... })
kernel.on('ui:selection-changed', (payload) => { ... })

// Payload
{
  panelName: 'properties',
  selectedIds: ['face-0', 'face-1']
}
```

#### Workspace Events
```javascript
kernel.on('workspace:switched', (payload) => { ... })

// Payload
{
  from: 'Design',
  to: 'CAM',
  activeModules: ['cam-pipeline', 'viewport', 'toolbar']
}
```

### Publishing Custom Events

```javascript
// From within a module
this.kernel.emit('mymodule:action-done', {
  actionId: 'cut-001',
  duration: 1200,  // milliseconds
  result: {...}
})

// Listen from another module
kernel.on('mymodule:action-done', (payload) => {
  console.log('Action completed:', payload.actionId)
})
```

### Event Best Practices

1. **Namespace events**: `modulename:action` (e.g., `cam:toolpath-generated`)
2. **Include metadata**: Always send timestamp, IDs, and relevant data
3. **Fire after state change**: Event = notification of completed action
4. **Don't fire on every frame**: Only on meaningful changes
5. **Handle async carefully**: Emit after async completes (promises)

---

## Command API

### 55 Core Commands

Commands are functions exposed through the kernel. Any module can call any command.

#### Shape Commands (10)
```javascript
kernel.exec('shape.cylinder', { d: 50, h: 80 })
kernel.exec('shape.box', { w: 100, d: 60, h: 40 })
kernel.exec('shape.sphere', { r: 50 })
kernel.exec('shape.cone', { d: 50, h: 100 })
kernel.exec('shape.torus', { majorR: 50, minorR: 10 })
kernel.exec('shape.wedge', { w: 100, h: 50, d: 30 })
kernel.exec('shape.extrude', { sketchId: 'sk-0', depth: 50 })
kernel.exec('shape.revolve', { sketchId: 'sk-0', axis: [0,0,1], angle: 360 })
kernel.exec('shape.sweep', { profileId: 'prof', pathId: 'path' })
kernel.exec('shape.loft', { profileIds: ['p0', 'p1', 'p2'] })
```

#### Feature Commands (10)
```javascript
kernel.exec('feature.fillet', { edges: [0, 1, 2], radius: 5 })
kernel.exec('feature.chamfer', { edges: [0, 1], distance: 2 })
kernel.exec('feature.pattern', { type: 'rectangular', x: 3, y: 2, spacing: 50 })
kernel.exec('feature.mirror', { body: 'body-0', plane: 'XZ' })
kernel.exec('feature.shell', { thickness: 2 })
kernel.exec('feature.draft', { angle: 5 })
kernel.exec('feature.thread', { pitch: 1.75, type: 'ISO' })
kernel.exec('feature.split', { tool: 'plane-0' })
kernel.exec('feature.wrap', { surface: 'surf-0' })
kernel.exec('feature.scale', { factor: 1.5 })
```

#### Assembly Commands (8)
```javascript
kernel.exec('assembly.addComponent', { file: 'part.step', position: [0,0,0] })
kernel.exec('assembly.createJoint', { type: 'mate', body1: 'b1', body2: 'b2', face1: 'f1', face2: 'f2' })
kernel.exec('assembly.explode', { mode: 'radial' })
kernel.exec('assembly.generateBOM', { })
kernel.exec('assembly.checkInterference', { })
kernel.exec('assembly.drive', { jointId: 'j0', value: 0.5 })
kernel.exec('assembly.pattern', { type: 'rectangular', count: 4 })
kernel.exec('assembly.hideComponent', { componentId: 'c-0' })
```

#### Export Commands (8)
```javascript
kernel.exec('export.stl', { format: 'binary' })
kernel.exec('export.step', { })
kernel.exec('export.gltf', { includeAnimation: true })
kernel.exec('export.obj', { })
kernel.exec('export.pdf', { paperSize: 'A4', scale: 1 })
kernel.exec('export.dxf', { })
kernel.exec('export.json', { })
kernel.exec('export.png', { width: 1920, height: 1080, dpi: 300 })
```

#### Import Commands (6)
```javascript
kernel.exec('import.step', { file: blob })
kernel.exec('import.iges', { file: blob })
kernel.exec('import.obj', { file: blob })
kernel.exec('import.stl', { file: blob })
kernel.exec('import.stp', { file: blob })
kernel.exec('import.ipt', { file: blob })
```

#### Validation Commands (6)
```javascript
kernel.exec('validate.designReview', { })
kernel.exec('validate.checkInterference', { })
kernel.exec('validate.estimateCost', { material: 'aluminum' })
kernel.exec('validate.estimateWeight', { })
kernel.exec('validate.manufacturability', { process: 'cnc' })
kernel.exec('validate.fea', { type: 'static' })
```

#### AI Commands (5)
```javascript
kernel.exec('ai.textToCAD', { prompt: 'socket head bolt M10' })
kernel.exec('ai.identifyPart', { image: blob })
kernel.exec('ai.suggestFeature', { context: 'current model' })
kernel.exec('ai.generateDesign', { description: '...' })
kernel.exec('ai.designReview', { })
```

#### Render Commands (4)
```javascript
kernel.exec('render.snapshot', { width: 1920, height: 1080 })
kernel.exec('render.multiview', { views: ['front', 'top', 'iso'] })
kernel.exec('render.fitToObject', { })
kernel.exec('render.setMaterial', { material: 'steel' })
```

#### Workspace Commands (3)
```javascript
kernel.exec('workspace.switch', { name: 'CAM' })
kernel.exec('workspace.getActive', { })
kernel.exec('workspace.listWorkspaces', { })
```

#### File Commands (3)
```javascript
kernel.exec('file.save', { path: '/models/bracket.ccad' })
kernel.exec('file.load', { path: '/models/bracket.ccad' })
kernel.exec('file.new', { })
```

### Command Error Handling

```javascript
// Commands throw on error
try {
  const result = await kernel.exec('shape.cylinder', { d: -50 })  // Invalid!
} catch (error) {
  console.error('Error:', error.message)
  // "Invalid diameter: must be positive"
}

// Check result
const result = await kernel.exec('shape.cylinder', { d: 50 })
if (result.success) {
  console.log('Geometry ID:', result.geometryId)
} else {
  console.error('Failed:', result.error)
}
```

---

## Plugin Development

### What is a Plugin?

Plugin = JavaScript module that extends cycleCAD with custom features.

**Examples:**
- Custom 3D printer integration (send to Prusa, Ultimaker)
- CAD library (fasteners, bearings, motors)
- Manufacturing specific tools (waterjet cutting, injection molding)
- Domain-specific features (architectural design, furniture)

### Plugin Structure

```
my-plugin/
├── manifest.json      # Plugin metadata
├── index.js          # Entry point
├── modules/
│   ├── feature1.js   # Custom module
│   └── feature2.js
├── assets/
│   ├── icons/
│   └── models/
└── README.md
```

### Manifest Format

```json
{
  "id": "com.example.myplugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Custom features for cycleCAD",
  "author": "Your Name",
  "license": "MIT",
  "cyclecadVersion": ">=3.2.0",
  "modules": [
    "modules/feature1.js",
    "modules/feature2.js"
  ],
  "permissions": [
    "geometry.read",
    "geometry.write",
    "ui.panel",
    "storage.local",
    "network.request"
  ]
}
```

### Plugin Entry Point

```javascript
// index.js
export default {
  async init(kernel) {
    // kernel = the cycleCAD kernel

    // Register modules
    const Feature1 = (await import('./modules/feature1.js')).default
    kernel.register(Feature1)

    // Listen to events
    kernel.on('model:created', (payload) => {
      console.log('Model created:', payload.modelId)
    })

    // Add toolbar button
    const toolbar = document.querySelector('#toolbar')
    const btn = document.createElement('button')
    btn.textContent = 'My Plugin'
    btn.onclick = () => kernel.exec('myplugin.action', {})
    toolbar.appendChild(btn)

    return {
      name: 'My Plugin',
      version: '1.0.0',
      uninstall() {
        // Cleanup
      }
    }
  }
}
```

### Installing Plugins

```javascript
// From user action or programmatic
const pluginUrl = '/plugins/my-plugin/index.js'
const module = await import(pluginUrl)
const plugin = await module.default.init(kernel)
```

### Plugin Best Practices

1. **Small scope**: One feature per plugin
2. **Use kernel events**: Don't hook directly into DOM
3. **Error handling**: All commands should handle errors gracefully
4. **Documentation**: Include README with examples
5. **Performance**: Async operations where needed
6. **Permissions**: Request only what you need

---

## Testing

### Unit Testing Modules

```javascript
// test/myfeature.test.js
import { MyFeatureModule } from '../app/js/modules/myfeature.js'

describe('MyFeature Module', () => {
  let kernel, module

  beforeEach(() => {
    kernel = createMockKernel()
    module = MyFeatureModule
    module.kernel = kernel
    module.init()
  })

  test('myCommand returns correct result', () => {
    const result = module.commands.myCommand({ value: 42 })
    expect(result).toEqual({ success: true, value: 42 })
  })

  test('emits event on action', () => {
    const handler = jest.fn()
    kernel.on('myfeature:action-done', handler)

    module.commands.doAction({ })

    expect(handler).toHaveBeenCalled()
  })
})
```

### Integration Testing

```javascript
// test/integration.test.js
describe('Sketch → Extrude → Fillet Workflow', () => {
  let kernel

  beforeEach(async () => {
    kernel = await initializeCycleCAD()
    kernel.activate('Design')
  })

  test('Can create a filleted box', async () => {
    // Create sketch
    await kernel.exec('sketch.create', { plane: 'XY' })
    await kernel.exec('sketch.rectangle', { w: 100, h: 50 })

    // Extrude
    const extrudeResult = await kernel.exec('shape.extrude', {
      sketchId: 'sketch-0',
      depth: 50
    })

    // Fillet
    const filletResult = await kernel.exec('feature.fillet', {
      edges: [0, 1, 2, 3],
      radius: 5
    })

    // Verify
    expect(filletResult.success).toBe(true)
    expect(filletResult.geometryId).toBeDefined()
  })
})
```

### E2E Testing with Playwright

```javascript
// test/e2e.test.js
import { test, expect } from '@playwright/test'

test('Create and export STL', async ({ page }) => {
  await page.goto('http://localhost:8080')

  // Click Design workspace
  await page.click('[data-workspace="Design"]')

  // Create sketch
  await page.click('[id="sketch-btn"]')
  await page.click('[data-plane="XY"]')

  // Draw rectangle
  await page.click('[id="rect-tool"]')
  await page.mouse.click(100, 100)
  await page.mouse.click(200, 150)

  // Extrude
  await page.click('[id="extrude-btn"]')
  await page.fill('[id="extrude-depth"]', '50')
  await page.click('[id="ok-btn"]')

  // Export
  await page.click('[id="export-btn"]')
  await page.selectOption('[id="export-format"]', 'stl')

  // Verify download
  const downloadPromise = page.waitForEvent('download')
  await page.click('[id="export-confirm"]')
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('model.stl')
})
```

---

## Contributing

### Code Style

- **Language**: ES6+ JavaScript (no TypeScript)
- **Formatting**: 2 spaces, no semicolons (optional)
- **Comments**: JSDoc for public APIs
- **Naming**: camelCase for functions/vars, PascalCase for classes
- **Linting**: ESLint (see `.eslintrc.json`)

### Git Workflow

1. **Fork** the repository
2. **Create branch**: `feature/my-feature` or `fix/my-bug`
3. **Write tests**: Every feature needs tests
4. **Commit**: Descriptive messages ("Add fillet radius editor")
5. **Push**: To your fork
6. **PR**: Describe what you're adding/fixing

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No linting errors (`npm run lint`)
- [ ] All tests pass (`npm test`)
- [ ] Follows code style guide
- [ ] Feature complete (not WIP)
- [ ] No breaking changes documented

### Commit Message Format

```
type(scope): description

body (optional)
footer (optional)

// Examples:
feat(sketch): add tangent constraint (O key)
fix(viewport): correct mouse offset by 32px
refactor(kernel): simplify event bus initialization
docs(tutorial): add sweep and loft examples
test(assembly): add interference detection tests
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `perf`, `build`

### Issue Reporting

Include:
- Minimal reproduction steps
- Expected vs actual behavior
- Browser/OS version
- Browser console errors
- Screenshots (for UI issues)

### Feature Requests

Include:
- Use case description
- Mockup or example (if applicable)
- Priority (nice-to-have vs critical)
- Suggested implementation (if applicable)

---

## Advanced Topics

### Hot Module Reloading

```javascript
// In development, reload module without restarting
if (module.hot) {
  module.hot.accept('./mymodule.js', () => {
    kernel.unload('myfeature')
    const updated = require('./mymodule.js')
    kernel.register(updated)
    kernel.activate('Design')
  })
}
```

### State Management (Advanced)

```javascript
// Get full state
const state = kernel.state.getAll()

// Observe state changes
kernel.state.watch('activeModel', (oldVal, newVal) => {
  console.log('Model changed:', oldVal, '→', newVal)
})

// Batch updates
kernel.state.beginBatch()
kernel.state.set('a', 1)
kernel.state.set('b', 2)
kernel.state.endBatch()  // Single re-render
```

### Performance Optimization

```javascript
// Defer heavy computation
const result = await kernel.exec('feature.fillet', {
  edges: largeArray,
  async: true,  // Non-blocking
  onProgress: (progress) => {
    console.log('Fillet progress:', progress)
  }
})

// Use Web Workers for CAM/FEA
const worker = new Worker('/workers/cam-worker.js')
worker.postMessage({ toolpath: paths })
worker.onmessage = (e) => {
  const gcode = e.data
}
```

---

## Troubleshooting

### Module not found
- Check manifest.json includes the module
- Verify file path is correct
- Check browser console for import errors

### Command fails with "not found"
- Module may not be activated for current workspace
- Check kernel.state.get('activeModules')
- Try switching workspaces

### Events not firing
- Make sure event name matches (case-sensitive)
- Check module is initialized (kernel.init())
- Verify listener added before event fires

### Memory leaks
- Always unsubscribe from events in deactivate()
- Clean up DOM elements in deactivate()
- Close connections (WebSocket, fetch) properly

---

## Useful Resources

- **Full API Docs**: `/docs/API-REFERENCE.md`
- **Architecture**: `/docs/architecture-v3.html`
- **Examples**: `/examples/` directory
- **Discord**: Community help
- **GitHub Issues**: Bug reports, feature requests

---

## License

cycleCAD is MIT licensed. Plugins can use any OSS license.

**Happy coding!**
