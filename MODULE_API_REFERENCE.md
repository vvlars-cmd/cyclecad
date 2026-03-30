# Module API Reference — cycleCAD v2.0

Complete API documentation for three enhanced modules: scripting, formats, and data management.

---

## SCRIPTING MODULE API

**Import:**
```javascript
import scripting from './modules/scripting-module.js';
```

### Initialization
```javascript
scripting.init(viewport, kernel, containerEl);
```

### Script Execution
```javascript
// Execute code with cad context
await scripting.execute(code, context, options);

// With parameters
await scripting.execute(code, {}, {
  params: { width: 100, height: 50 },
  withDebugger: false
});
```

### Script Library
```javascript
// Save script
scripting.saveScript(name, code, {
  description: 'My script',
  tags: ['box', 'basic'],
  version: '1.0'
});

// Load script
const script = scripting.loadScript(name);

// List scripts
const scripts = scripting.listScripts(tag);

// Delete script
scripting.deleteScript(name);
```

### Macro Recording
```javascript
scripting.startRecording();
// ... user performs actions ...
const macro = scripting.stopRecording();
// macro.code contains auto-generated JavaScript

// Record action (called by UI)
scripting.recordAction('box', { w: 100, h: 50, d: 30 });
```

### Batch Operations
```javascript
// Apply script to multiple parts
const results = await scripting.batchExecute('selectedParts', `
  cad.fillet(5);
  cad.color(0x888888);
`);

// results: [{success: true, object, result}, ...]
```

### Debugging API
```javascript
// Set breakpoint at line
scripting.setBreakpoint('script_name', 42);

// Get breakpoints
const breakpoints = scripting.getBreakpoints('script_name');

// Remove breakpoint
scripting.removeBreakpoint('script_name', 42);

// Step through code
await scripting.stepInto('script_name', 42);
await scripting.stepOver('script_name', 42);

// Debug history
const history = scripting.getDebugHistory();
scripting.clearDebugHistory();
```

### Script Parameters
```javascript
// Define parameters for script UI dialog
scripting.setScriptParameters('my_script', {
  width: { type: 'slider', default: 100, min: 10, max: 500 },
  material: { type: 'dropdown', options: ['steel', 'aluminum'], default: 'steel' },
  description: { type: 'text', default: '' }
});

// Create parameter dialog
const values = await scripting.createParameterDialog(parameters);
// values: { width: 150, material: 'aluminum', description: '...' }
```

### Console API
```javascript
// Get console output
const output = scripting.getConsoleOutput();
// output: [{type: 'log', text: '...', time: Date}, ...]

// Clear console
scripting.clearConsole();
```

### Examples
```javascript
// Get example scripts
const examples = scripting.getExampleScripts();

// Load example script
const script = scripting.loadExampleScript('gear_generator');
```

### Events
```javascript
scripting.onEvent('script_executed', (data) => {
  console.log('Script ran:', data.code, data.result);
});

scripting.onEvent('script_error', (data) => {
  console.error('Error:', data.error);
});

scripting.onEvent('recording_started', () => {});
scripting.onEvent('recording_stopped', (data) => {
  console.log('Macro:', data.macro.code);
});

scripting.onEvent('console_output', (data) => {
  console.log(`[${data.type}] ${data.text}`);
});
```

### Error Handling
```javascript
try {
  await scripting.execute(code);
} catch (error) {
  console.error(error.message);
}

// Get last error
const lastError = scripting.getLastError();
if (lastError) {
  console.error(lastError);
  scripting.clearError();
}
```

### CAD Helper Methods

#### Shapes
```javascript
cad.createBox(width, height, depth);
cad.createCylinder(radius, height, segments);
cad.createSphere(radius, segments);
cad.createCone(radius, height, segments);
cad.createTorus(majorRadius, minorRadius, segments);
cad.createWedge(width, height, depth);
```

#### Sketching
```javascript
cad.sketch.line(p1, p2);
cad.sketch.circle(center, radius);
cad.sketch.arc(center, radius, startAngle, endAngle);
cad.sketch.rectangle(corner1, corner2);
cad.sketch.polygon(center, radius, sides);
cad.sketch.polyline(points);
cad.sketch.spline(points);
```

#### Positioning
```javascript
cad.position(x, y, z);
cad.move(dx, dy, dz);
cad.rotate(x, y, z);
cad.rotateAround(axis, angle, point);
cad.scale(sx, sy, sz);
```

#### Operations
```javascript
cad.extrude(distance, options);
cad.revolve(angle, axis);
cad.sweep(profileId, pathId, options);
cad.loft(profileIds, options);
cad.fillet(radius, edges);
cad.chamfer(distance, edges);
cad.hole(diameter, depth);
cad.counterbore(holeRadius, cboreRadius, cboreDist);
cad.countersink(holeRadius, cskRadius, cskAngle);
cad.union(otherIds);
cad.cut(otherIds);
cad.intersect(otherIds);
cad.shell(thickness);
cad.pattern(countX, countY, spacingX, spacingY);
cad.circularPattern(count, angle);
cad.mirrorBody(plane);
```

#### Assembly
```javascript
cad.assembly.mate(body1Id, body2Id, type, options);
cad.assembly.hideAll();
cad.assembly.showAll();
cad.assembly.explode(scale);
```

#### Inspection
```javascript
cad.measure(a, b);
cad.getMass(options);
cad.getVolume();
cad.getBounds();
cad.getSurfaceArea();
```

#### Materials
```javascript
cad.material(name);
cad.color(hex);
cad.opacity(value);
```

#### Selection
```javascript
cad.select(name);
cad.selectAll();
cad.selectByTag(tag);
cad.hide(name);
cad.show(name);
cad.isolate(name);
cad.showAll();
cad.delete(name);
```

#### Export
```javascript
cad.exportSTL(filename);
cad.exportOBJ(filename);
cad.exportGLTF(filename);
cad.exportSTEP(filename);
cad.exportJSON(filename);
```

#### View
```javascript
cad.view.fitAll();
cad.view.fitSelection();
cad.view.setView('front', 'top', 'isometric', etc.);
cad.view.showGrid();
cad.view.hideGrid();
cad.view.setZoom(factor);
```

---

## FORMATS MODULE API

**Import:**
```javascript
import formats from './modules/formats-module.js';
```

### Initialization
```javascript
formats.init(viewport, kernel, containerEl);
```

### Format Detection
```javascript
// Auto-detect from file
const format = await formats.detectFormat(file);

// From filename string
const format = formats.detectFormat('model.step');
```

### Import
```javascript
const result = await formats.import_(file, format, options);
// Result: {success, name, meshCount, meshes, boundingBox, format, filename}

// With options
await formats.import_(file, 'step', {
  scale: 1.0,
  position: [0, 0, 0],
  centerModel: true,
  unitFrom: 'mm',
  unitTo: 'mm',
  mergeGeometry: false,
  fitCamera: true
});
```

### Export
```javascript
const blob = await formats.export_(format, options);
// Downloads automatically

// With options
await formats.export_('stl', {
  filename: 'part.stl',
  binary: true,
  scale: 1.0,
  resolution: 1.0,
  quality: 85,
  includeNormals: true,
  includeMaterials: true
});
```

### Batch Conversion
```javascript
const results = await formats.batchConvert(files, outputFormat, options);
// results: {success: count, failed: count, results: [{file, filename, status, error}, ...]}
```

### Server Configuration
```javascript
// Set converter service URL
formats.setConverterUrl('http://localhost:8787');

// Get current URL
const url = formats.getConverterUrl();
```

### Supported Formats
```javascript
// Get all supported formats
const supported = formats.getSupportedFormats();
// {import: ['step', 'stl', ...], export: ['stl', 'obj', ...]}

// Get format info
const info = formats.getFormatInfo('step');
// {name, ext, binary, category}
```

### Recent Imports
```javascript
// Get recent imports
const recent = formats.getRecentImports();
// [{filename, format, timestamp}, ...]

// Clear recent list
formats.clearRecentImports();
```

### Error Handling
```javascript
try {
  await formats.import_(file);
} catch (error) {
  console.error(error.message);
}

const lastError = formats.getLastError();
```

---

## DATA MODULE API

**Import:**
```javascript
const data = (await import('./modules/data-module.js')).default;
```

### Initialization
```javascript
await data.init();
```

### Project Management
```javascript
// Create new project
const proj = await data.newProject({
  name: 'My Design',
  description: '...',
  units: 'mm',
  templateName: 'Mechanical Part'
});
// Returns: {id, name, description, created, units}

// Load project
await data.load({ projectId: 'proj-123' });

// Save current project
await data.save();

// Delete project
await data.delete({
  projectId: 'proj-123',
  permanent: false  // true for permanent delete
});

// Duplicate project
const cloned = await data.duplicate({
  projectId: 'proj-123',
  newName: 'My Design v2'
});

// List all projects
const projects = await data.listProjects({
  limit: 20,
  offset: 0,
  sortBy: 'modified',  // 'name', 'created', 'modified', 'size'
  search: 'pump'
});
// Returns: [{id, name, description, created, modified, fileCount, sizeBytes, thumbnail, author}]

// Get recent projects
const recent = await data.getRecent({ limit: 20 });
```

### File Management
```javascript
// Create folder
await data.createFolder({
  path: '',      // parent folder path
  name: 'parts'
});

// Import file into project
await data.importFile({
  file: userSelectedFile,
  folder: 'parts/',
  name: 'optional_override',
  tags: ['purchased', 'plastic']
});

// Delete file
await data.deleteFile({
  fileKey: 'parts/pump-body.ipt'
});

// List files in project
const files = await data.listFiles({ folder: 'parts/' });
// Returns: [{key, name, type, size, imported, tags}]
```

### Sharing
```javascript
// Generate share link
const share = await data.shareLink({
  projectId: 'proj-123',
  role: 'viewer',  // 'viewer' or 'editor'
  expiresIn: 604800  // 1 week in seconds, null = never
});
// Returns: {link, code, role, expiresAt}
```

### Export/Import Projects
```javascript
// Export project as JSON
const blob = await data.exportProject({
  projectId: 'proj-123'
});

// Import exported project
const imported = await data.importProject({
  file: userSelectedFile,
  asCopy: true  // create new project or overwrite
});
```

### Templates
```javascript
// Create template from current project
await data.createTemplate({
  projectId: 'proj-123',
  name: 'Modular Pump',
  description: 'Reusable pump with customizable bore'
});

// Create project from template
const proj = await data.fromTemplate({
  templateName: 'Modular Pump',
  newProjectName: 'Pump v2'
});

// List all templates
const templates = await data.listTemplates();
// Returns: [{name, description, created}]
```

### Trash & Recovery
```javascript
// List deleted projects
const trash = await data.listTrash({ limit: 50 });
// Returns: [{id, name, deletedAt, recoveryUntil}]

// Restore project from trash
await data.restoreFromTrash({ projectId: 'proj-123' });

// Empty trash (permanent delete)
await data.emptyTrash({ permanentDelete: true });
```

### Backups
```javascript
// Create manual backup
const backup = await data.createBackup({
  projectId: 'proj-123'
});
// Returns: {id, projectId, timestamp, data}

// List backups for project
const backups = await data.listBackups({
  projectId: 'proj-123'
});
// Returns: [{id, timestamp, sizeBytes}]
```

### Document Properties
```javascript
// Set properties
await data.setDocumentProperties({
  title: 'Pump Assembly',
  author: 'John Smith',
  description: '...',
  tags: ['mechanical', 'water'],
  version: '2.0'
});

// Get properties
const props = await data.getDocumentProperties();
// Returns: {title, description, author, created, modified, revision, tags, version}
```

### Units
```javascript
// Set project units
await data.setUnits('mm');

// Convert between units
const converted = data.convertUnits(100, 'mm', 'inch');
// Result: 3.937...
```

### Search
```javascript
// Full-text search
const results = await data.searchProjects({
  query: 'pump',
  limit: 20
});
// Returns: [{id, name, description, match}]
```

### Events
```javascript
// Listen for data events
window.addEventListener('data:projectCreated', (e) => {
  console.log('Project created:', e.detail);
});

window.addEventListener('data:projectLoaded', (e) => {
  console.log('Project loaded:', e.detail);
});

window.addEventListener('data:projectSaved', (e) => {
  console.log('Project saved:', e.detail.projectId);
});

window.addEventListener('data:crashDetected', (e) => {
  console.log('Crash detected — offer recovery');
});

window.addEventListener('data:notification', (e) => {
  console.log(`[${e.detail.type}] ${e.detail.message}`);
});
```

### State Access
```javascript
// Current project
if (data.state.currentProject) {
  console.log(data.state.currentProject.name);
}

// Recent files
console.log(data.state.recentFiles);

// Storage usage
console.log(`Using ${data.state.usageBytes / 1e6}MB of ${data.state.quotaBytes / 1e9}GB`);

// Auto-save interval
console.log(`Auto-save every ${data.state.autoSaveFrequency}ms`);
```

---

## HELP ENTRIES

All three modules export comprehensive help documentation:

```javascript
import scripting from './modules/scripting-module.js';
console.log(scripting.helpEntries);
// Each entry: {id, title, category, description, content}

import formats from './modules/formats-module.js';
console.log(formats.helpEntries);

import data from './modules/data-module.js';
console.log(data.helpEntries);
```

---

## INTEGRATION EXAMPLE

```javascript
// Complete workflow
import scripting from './modules/scripting-module.js';
import formats from './modules/formats-module.js';
import data from './modules/data-module.js';

// Initialize
scripting.init(viewport, kernel);
formats.init(viewport, kernel);
await data.init();

// Create project
const proj = await data.newProject({
  name: 'New Design',
  units: 'mm'
});

// Import CAD file
const imported = await formats.import_(file, 'step', {
  unitFrom: 'mm',
  centerModel: true
});

// Run script on imported geometry
await scripting.execute(`
  cad.fillet(2);
  cad.color(0x8899aa);
`);

// Save project
await data.save();

// Export result
await formats.export_('stl', {
  filename: 'final.stl',
  binary: true
});

// Create share link
const share = await data.shareLink({
  role: 'viewer',
  expiresIn: 604800
});

console.log('Share:', share.link);
```

---

## ERROR HANDLING PATTERNS

```javascript
// Scripting errors
try {
  await scripting.execute(code);
} catch (error) {
  const lastErr = scripting.getLastError();
  console.error(lastErr.message);
  scripting.clearError();
}

// Format errors
try {
  await formats.import_(file);
} catch (error) {
  const err = formats.getLastError();
  console.error(`Import failed: ${err.message}`);
}

// Data errors
try {
  await data.newProject({name: ''});
} catch (error) {
  console.error(`Project error: ${error.message}`);
}

// Event-based errors
window.addEventListener('data:notification', (e) => {
  if (e.detail.type === 'error') {
    showUserAlert(e.detail.message);
  }
});
```

---

**End of API Reference**
