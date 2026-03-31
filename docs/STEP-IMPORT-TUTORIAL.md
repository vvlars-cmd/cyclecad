# STEP File Import Tutorial for cycleCAD

## Table of Contents

1. [What is STEP Format](#what-is-step-format)
2. [Getting Started](#getting-started)
3. [Import Methods](#import-methods)
4. [File Size Handling](#file-size-handling)
5. [Server-Side Conversion](#server-side-conversion)
6. [Troubleshooting](#troubleshooting)
7. [Performance Tips](#performance-tips)
8. [API Reference](#api-reference)
9. [Supported STEP Versions](#supported-step-versions)

## What is STEP Format

**STEP** (Standard for the Exchange of Product model data) is an ISO standard format for 3D CAD models. It's widely supported by professional CAD tools like SolidWorks, AutoCAD, Fusion 360, and FreeCAD.

### Why STEP?

- **Universal compatibility** — Works with nearly every CAD system
- **Preserves geometry** — Maintains B-Rep (boundary representation) data
- **Assembly support** — Includes component relationships and hierarchies
- **No license restrictions** — Open format, royalty-free to use

### File Variations

- **`.step`** or **`.stp`** — ASCII text format, human-readable but larger
- **`.stpz`** — Compressed STEP (less common, not supported yet)

## Getting Started

### Basic Import Workflow

1. **Open cycleCAD** — Navigate to `cyclecad.com/app/`
2. **Click "Import STEP"** button in the toolbar or right panel
3. **Select a file** from your computer
4. **Wait for parsing** — Progress bar shows real-time status
5. **Model appears in 3D viewport** — Adjust camera with mouse wheel to fit view

### Import Panel

The STEP module provides a dedicated panel with:

- **Import STEP** button — Opens file picker
- **Export STEP** button — Saves current model to STEP (requires B-Rep kernel)
- **Progress bar** — Shows percentage + elapsed time
- **Cancel button** — Stops import if needed
- **Server URL** — Configurable endpoint for large files
- **Cache status** — Shows if previous imports are cached
- **Router info** — Displays which strategy will be used

## Import Methods

### Method 1: File Picker (Recommended)

Simplest way to import a local file.

```
1. Click "Import STEP" button
2. Browser opens native file picker
3. Select .step or .stp file
4. File validation and caching is automatic
```

**Best for:** Small to medium files, desktop environments

### Method 2: Drag and Drop

Drag a STEP file directly onto the 3D viewport.

```javascript
viewport.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  cycleCAD.step.import(file);
});
```

**Best for:** Quick iteration, desktop workflows

### Method 3: Import from URL

Import a STEP file from an external URL or cloud storage.

```javascript
// JavaScript API
cycleCAD.step.importFromURL('https://example.com/models/part.step');

// Or via form input
const url = document.getElementById('url-input').value;
cycleCAD.step.importFromURL(url);
```

**Best for:** Sharing models, cloud workflows, CI/CD pipelines

### Method 4: Programmatic Import

Use the API to import files directly in your app.

```javascript
const file = new File([buffer], 'model.step', { type: 'application/octet-stream' });
cycleCAD.step.import(file);

// Listen to events
cycleCAD.on('step:importComplete', (data) => {
  console.log(`Imported ${data.partCount} parts`);
});
```

**Best for:** Automation, custom workflows, integrations

## File Size Handling

cycleCAD uses an intelligent routing system to handle files of any size.

### Size Categories

| Size Range | Strategy | Time | Notes |
|-----------|----------|------|-------|
| < 30 MB | Browser WASM (occt-import-js) | 2-10s | Fast, no server needed |
| 30-50 MB | OpenCascade.js Worker | 15-30s | Better geometry fidelity |
| 50-100 MB | Server converter | 30-120s | Python FastAPI + OpenCASCADE |
| > 100 MB | Server (with warnings) | 2-5 min | May require assembly split |

### Automatic Routing

The module automatically selects the best strategy based on:

1. **File size** — Primary factor
2. **Server availability** — Falls back to WASM if server unavailable
3. **Worker status** — Uses WASM only if Workers are ready
4. **WASM memory** — Respects browser memory limits

**Flow Chart:**

```
STEP File (any size)
  ↓
  ├─ < 30 MB and Worker ready?
  │   └─ YES → Parse in WASM (occt-import-js)
  │   └─ NO → Continue
  │
  ├─ 30-50 MB and OpenCascade ready?
  │   └─ YES → Parse in WASM (OpenCascade.js)
  │   └─ NO → Continue
  │
  ├─ Server available and healthy?
  │   └─ YES → Upload and parse server-side
  │   └─ NO → Fallback to browser WASM (warning)
  │
  └─ If all else fails → Show error with recovery steps
```

### File Size Warnings

- **50-100 MB** — Shows info: "Server recommended for faster conversion"
- **> 100 MB** — Shows warning: "Consider splitting assembly or using server"
- **> 500 MB** — Shows error: "File too large, must use server converter"

## Server-Side Conversion

For large files or production workflows, use the **server-side converter**.

### What It Does

The server converter is a **FastAPI microservice** that:

1. Accepts STEP files up to 500 MB
2. Parses using OpenCASCADE library (Python `pythonocc-core`)
3. Generates adaptive mesh based on file size
4. Returns **GLB** (glTF 2.0 binary) for instant loading
5. Caches results for 24 hours

### Setup: Docker

**Fastest way to deploy:**

```bash
# Pull the image
docker pull cyclecad/converter:latest

# Or build locally
cd ~/cyclecad/server
docker build -t cyclecad-converter .

# Run the container
docker run -d \
  --name cyclecad-converter \
  -p 8787:8000 \
  -e WASM_MEMORY_LIMIT=4096 \
  cyclecad-converter:latest

# Check health
curl http://localhost:8787/health
# Response: { "status": "healthy", "wasm_available": true }
```

### Setup: Local (Python)

If you prefer to run directly without Docker:

```bash
# Clone the repo
git clone https://github.com/vvlars-cmd/cyclecad
cd cyclecad/server

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn converter:app --host 0.0.0.0 --port 8787

# Or with gunicorn for production
gunicorn -w 4 -k uvicorn.workers.UvicornWorker converter:app --bind 0.0.0.0:8787
```

### Configure cycleCAD to Use Server

**In the app:**

1. Open STEP module panel
2. Paste server URL: `http://localhost:8787/convert`
3. Click "Test Connection" (optional)

**Programmatically:**

```javascript
cycleCAD.step.setServerURL('http://localhost:8787/convert');
localStorage.setItem('ev_converter_url', 'http://localhost:8787/convert');
```

### Server Endpoints

#### POST `/convert`

Converts a STEP file to GLB.

**Request:**
```bash
curl -X POST http://localhost:8787/convert \
  -F "file=@model.step" \
  -F "deflection=0.05"
```

**Response:**
```
Content-Type: model/gltf-binary
Body: <GLB file buffer>
```

#### GET `/metadata`

Quick metadata extraction without full parse.

**Request:**
```bash
curl -X POST http://localhost:8787/metadata \
  -F "file=@model.step"
```

**Response:**
```json
{
  "part_count": 2847,
  "assembly_count": 12,
  "bounding_box": {
    "min": [0, 0, 0],
    "max": [1200, 800, 600]
  },
  "part_names": ["Base", "Shaft", "Bearing_1", ...],
  "parse_time_ms": 1200
}
```

#### GET `/health`

Server and WASM status.

**Request:**
```bash
curl http://localhost:8787/health
```

**Response:**
```json
{
  "status": "healthy",
  "wasm_available": true,
  "memory_used_mb": 512,
  "memory_limit_mb": 4096,
  "parser_version": "2.0.0"
}
```

## Troubleshooting

### Problem: "WASM parse failed: memory limit exceeded"

**Cause:** File too large for browser memory.

**Solutions:**
1. Split the assembly into sub-assemblies (< 50 MB each)
2. Use server converter instead: `localhost:8787`
3. Close other browser tabs to free memory
4. Increase browser memory (not possible, inherent limit)

### Problem: "WASM parsing timeout (90s). File too complex."

**Cause:** Parser took too long (file has >3000 parts or complex geometry).

**Solutions:**
1. Use server converter (higher timeout: 5 minutes)
2. Reduce geometry detail in CAD before export
3. Split assembly and import parts separately
4. Check for corrupted geometry in STEP file

### Problem: "Server converter unavailable"

**Cause:** Server not running or wrong URL.

**Solutions:**
1. Check server is running: `curl http://localhost:8787/health`
2. Check firewall allows port 8787
3. Verify URL in app settings
4. Try browser WASM as fallback
5. Check server logs: `docker logs cyclecad-converter`

### Problem: Imported geometry is invisible or deformed

**Causes & Solutions:**
1. **Scale mismatch** — STEP in meters, cycleCAD in mm? Rescale geometry
2. **Inverted normals** — Face backface culled. Use wireframe mode to debug
3. **Missing colors** — STEP file has no color data. Apply material in cycleCAD
4. **Bad triangulation** — Deflection too coarse. Re-import with smaller deflection

### Problem: "No meshes extracted from STEP file"

**Cause:** File is corrupted, empty, or uses unsupported STEP variant.

**Solutions:**
1. Open file in desktop CAD (Fusion, SolidWorks, FreeCAD) and re-save
2. Check STEP format version (AP203 vs AP214 vs AP242)
3. Try converting via online tool first: https://products.aspose.app/cad/conversion
4. Check file hex dump: `xxd -l 512 model.step`

**Debug Output:**

```
[StepModuleEnhanced] Worker: 0 parts in 2.3s (parse failed)
[StepModuleEnhanced] Import failed: No meshes extracted
```

### Problem: "Cannot load OpenCascade.js from CDN"

**Cause:** Network issue or CDN unavailable.

**Solutions:**
1. Use smaller file (< 30 MB) which uses occt-import-js instead
2. Check internet connection
3. Try later (CDN might be temporary down)
4. Use local fallback: edit `app.js` to use cached WASM

## Performance Tips

### 1. Use Caching

Imported models are cached in **IndexedDB** (browser local storage).

- **Cache hit** — Instant load (zero network)
- **Cache miss** — Parse once, reuse many times
- **Cache size** — Up to 50 GB depending on browser/device

**Manage cache:**

```javascript
// Clear cache (manual reset)
cycleCAD.step.clearCache();

// Check cache size
const caches = await caches.keys();
const cache = await caches.open('cyclecad-glb-v1');
const keys = await cache.keys();
console.log(`Cached ${keys.length} models`);
```

### 2. Adaptive Deflection

The module automatically selects mesh density based on file size:

- **< 30 MB** → Deflection 0.01 (fine detail)
- **30-50 MB** → Deflection 0.02 (balanced)
- **50-100 MB** → Deflection 0.05 (coarser)
- **> 100 MB** → Deflection 0.1 (very coarse)

**Manual control:**

```javascript
// Force fine detail (slower)
const file = ...;
cycleCAD.step.state.deflectionDefaults.small = 0.005;
cycleCAD.step.import(file);

// Force coarse (faster)
cycleCAD.step.state.deflectionDefaults.large = 0.1;
cycleCAD.step.import(file);
```

### 3. Batch Imports

If importing multiple files, do it sequentially to avoid memory overload:

```javascript
const files = [file1, file2, file3];

for (const file of files) {
  await cycleCAD.step.import(file);
  await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause
}
```

### 4. File Optimization

**Before importing, optimize your STEP file:**

1. **Remove unused features** — Delete construction geometry
2. **Reduce part count** — Merge small cosmetic parts
3. **Simplify surfaces** — Use lower NURBS degree
4. **Remove colors** — Strip color data if not needed
5. **Test in CAD first** — Ensure file is valid in SolidWorks/Fusion

**Command-line tools:**

```bash
# FreeCAD batch processing
freecad --headless --python optimize.py model.step

# Or use CadQuery script
python -c "
from cadquery import Workplane
model = Workplane().importDxf('model.step')
model.save('optimized.step')
"
```

### 5. Server-Side Caching

If using server converter, it caches results for 24 hours:

```javascript
// Same file uploaded again = instant response (cached GLB)
cycleCAD.step.import(file1); // First: 2 minutes
cycleCAD.step.import(file1); // Second: < 1 second (cached)
```

## API Reference

### Public Methods

#### `cycleCAD.step.import(file)`

Import a STEP file.

**Parameters:**
- `file` (File | Blob) — STEP file object

**Returns:** Promise

**Events:**
- `step:importStart` — Import begins
- `step:importProgress` — Percent and message
- `step:importComplete` — Success, includes part count
- `step:importError` — Failure with error message

**Example:**
```javascript
const file = document.getElementById('file-input').files[0];
cycleCAD.step.import(file)
  .then(() => console.log('Done'))
  .catch(err => console.error('Failed:', err.message));
```

#### `cycleCAD.step.importFromURL(url)`

Import from a URL (cloud storage, HTTP server, etc).

**Parameters:**
- `url` (string) — Full URL to STEP file

**Returns:** Promise

**Example:**
```javascript
cycleCAD.step.importFromURL('https://storage.example.com/model.step');
```

#### `cycleCAD.step.export(filename)`

Export current scene to STEP format (requires B-Rep kernel).

**Parameters:**
- `filename` (string, optional) — Output filename (default: "model.step")

**Returns:** Promise

**Example:**
```javascript
cycleCAD.step.export('my-design.step');
```

#### `cycleCAD.step.getMetadata(file)`

Extract metadata without full parse.

**Parameters:**
- `file` (File | Blob) — STEP file

**Returns:** Promise<Object>

**Returns:**
```javascript
{
  partCount: 47,
  filename: 'model.step',
  assemblyCount: 3,
  boundingBox: { min: [...], max: [...] }
}
```

#### `cycleCAD.step.setServerURL(url)`

Change server converter endpoint.

**Parameters:**
- `url` (string) — New server URL (e.g., "http://localhost:8787/convert")

**Returns:** void

**Persists to localStorage.**

#### `cycleCAD.step.clearCache()`

Clear all cached GLB files.

**Returns:** Promise

**Example:**
```javascript
cycleCAD.step.clearCache().then(() => {
  console.log('Cache cleared');
});
```

#### `cycleCAD.step.cancelImport()`

Cancel the current import operation.

**Returns:** void

### Events

#### `step:importStart`

Fired when import begins.

**Data:**
```javascript
{
  filename: 'model.step',
  size: 52428800 // bytes
}
```

#### `step:importProgress`

Fired during import with progress updates.

**Data:**
```javascript
{
  percent: 45,
  message: 'Parsing STEP (WASM)...'
}
```

#### `step:importComplete`

Fired when import succeeds.

**Data:**
```javascript
{
  partCount: 47,
  source: 'wasm' | 'server' | 'cache',
  duration: 5234 // milliseconds
}
```

#### `step:importError`

Fired when import fails.

**Data:**
```javascript
{
  error: 'WASM parsing timeout (90s)',
  suggestion: 'Use server converter or split assembly'
}
```

#### `step:importWarning`

Fired for non-fatal issues (large file, etc).

**Data:**
```javascript
{
  message: 'Large file (145MB). Consider server converter.'
}
```

### State Variables

```javascript
cycleCAD.step.state = {
  importInProgress: false,
  importCanceled: false,
  workerReady: true,
  opencascadeReady: true,
  serverURL: 'http://localhost:8787/convert',
  serverHealthy: true,
  cacheEnabled: true,
  lastImportInfo: { partCount: 47, filename: 'model.step' }
};
```

## Supported STEP Versions

### AP203 (1994)

**Also called:** STEP 1.0

**Supported:** ✅ Full support

**Common in:** Mechanical parts, assemblies

**Example:** Most SolidWorks exports, legacy CAD

### AP214 (2000)

**Also called:** STEP 2.0, "Automotive Design"

**Supported:** ✅ Full support

**Common in:** Automotive, complex assemblies

**Example:** Fusion 360, FreeCAD, modern CAD

### AP242 (2014)

**Also called:** STEP 3.0, "Managed Data Environment"

**Supported:** ⚠️ Partial (geometry OK, metadata limited)

**Common in:** Complex assemblies, Bill of Materials

**Note:** Color and assembly metadata may not transfer fully

### Other Variants

| Variant | Support | Notes |
|---------|---------|-------|
| IGES | ❌ No | Use DXF/DWG or convert via CAD |
| STPZ (compressed) | ❌ No | Decompress first: `unzip model.stpz` |
| JT (Siemens NX) | ❌ No | Export to STEP first |
| CATIA | ⚠️ Limited | Export to STEP/IGES first |
| Parasolid XT | ❌ No | Use STEP export from CAD |
| Pro/E ASM | ❌ No | Use STEP export from Creo |

### Conversion Tools

If your CAD format is not supported, convert to STEP first:

**Online (no install needed):**
- https://products.aspose.app/cad/conversion
- https://cloudconvert.com
- https://zamzar.com

**Desktop (free):**
- FreeCAD — Open file, File > Export As > STEP
- LibreCAD — Open and export to STEP

**Command-line:**
```bash
# FreeCAD headless
freecad --headless --python convert.py input.iges output.step

# LibreCAD headless
# (not available, use FreeCAD)
```

## Advanced Topics

### Custom Deflection Control

Fine-tune mesh density for specific use cases:

```javascript
// Very fine detail (slow, memory-heavy)
cycleCAD.step.state.deflectionDefaults.small = 0.001;

// Very coarse (fast, low memory)
cycleCAD.step.state.deflectionDefaults.large = 0.2;

// Override for a single import
const file = ...;
cycleCAD.step.import(file); // Uses current defaults
```

### Server Configuration

Adjust server behavior via environment variables:

```bash
docker run -e STEP_DEFLECTION=0.05 -e WASM_TIMEOUT=300 cyclecad-converter
```

**Available options:**
- `STEP_DEFLECTION` — Default mesh density (0.01-0.2)
- `WASM_TIMEOUT` — Parse timeout in seconds (default: 300)
- `WASM_MEMORY_LIMIT` — Max WASM memory in MB (default: 4096)
- `CACHE_TTL` — Cache time-to-live in hours (default: 24)
- `MAX_FILE_SIZE` — Max upload size in MB (default: 500)

### Programmatic Progress Tracking

Listen to detailed progress events:

```javascript
cycleCAD.on('step:importProgress', (data) => {
  const progressBar = document.getElementById('progress');
  progressBar.style.width = data.percent + '%';

  const status = document.getElementById('status');
  status.textContent = data.message;
});

cycleCAD.on('step:importError', (data) => {
  console.error('Import failed:', data.error);
  console.log('Suggestion:', data.suggestion);
});
```

### Batch Processing

Import multiple files and track completion:

```javascript
async function importBatch(files) {
  const results = [];

  for (const file of files) {
    try {
      const info = await cycleCAD.step.getMetadata(file);
      await cycleCAD.step.import(file);
      results.push({ file: file.name, success: true, parts: info.partCount });
    } catch (e) {
      results.push({ file: file.name, success: false, error: e.message });
    }
  }

  return results;
}

const files = [...document.getElementById('file-input').files];
const results = await importBatch(files);
console.table(results);
```

## FAQ

**Q: Can I import parts separately and assemble them?**
A: Yes! Import each STEP file separately, then use the Assembly workspace to create mates and constraints.

**Q: What's the maximum file size?**
A: Browser WASM: ~100 MB. Server: 500 MB (configurable). Larger files should be split in CAD.

**Q: Can I export a modified model back to STEP?**
A: Yes, if B-Rep kernel is loaded. File > Export STEP. Colors and some metadata may not transfer.

**Q: Does it preserve assembly structure?**
A: Not yet. Parts are imported as individual meshes. Assembly relationships are lost. Future release will support this.

**Q: Can I import files from Dropbox/Google Drive?**
A: Yes! Get a shareable link, make it public, use Import from URL.

**Q: Is there a file size limit?**
A: Browser: ~100 MB before it gets slow. Server: 500 MB hard limit. Files >500 MB must be split.

**Q: What CAD software exports the best STEP files?**
A: Fusion 360, SolidWorks, and FreeCAD. Avoid older versions or non-standard variants.

**Q: Can I run the server on a cloud provider?**
A: Yes! Docker container works on AWS, Google Cloud, Heroku, DigitalOcean, etc. See `docker-compose.yml` for example.

## Resources

- **STEP Format Spec** — https://en.wikipedia.org/wiki/ISO_10303
- **OpenCASCADE Docs** — https://dev.opencascade.org/doc
- **cycleCAD GitHub** — https://github.com/vvlars-cmd/cyclecad
- **Community Forum** — https://discourse.freecad.org/ (STEP discussions)
- **Convert Online** — https://products.aspose.app/cad/conversion

## Support

Found a bug? Have a feature request?

- **GitHub Issues** — https://github.com/vvlars-cmd/cyclecad/issues
- **Discord** — https://discord.gg/cyclecad (coming soon)
- **Email** — support@cyclecad.com

---

**Last Updated:** 2026-03-31 | Version 2.0.0
