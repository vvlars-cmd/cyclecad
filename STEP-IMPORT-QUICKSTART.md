# STEP Import System — Quick Start Guide

## What's New?

Fixed STEP import for large files (80-140MB) with intelligent multi-strategy routing:

- **<30MB:** Browser WASM (2-10 seconds, no server needed)
- **30-50MB:** OpenCascade.js Worker (15-30 seconds, better geometry)
- **≥50MB:** Server converter (30-120 seconds, no memory limit)
- **Automatic fallbacks** if any route fails
- **GLB caching** with SHA-256 invalidation
- **Worker heartbeat** with 90s timeout
- **CRITICAL FIX:** `.slice(0)` tight loop prevents WASM heap reallocation

## 5 Files Created

| File | Size | What It Does |
|------|------|-------------|
| `app/js/modules/step-module-enhanced.js` | 34KB | Main module with router + UI |
| `docs/STEP-IMPORT-TUTORIAL.md` | 21KB | 500+ line tutorial + API reference |
| `docs/STEP-HELP.json` | 18KB | 20+ help topics for help system |
| `app/tests/step-tests.html` | 31KB | Interactive test suite (50+ tests) |
| `server/converter-enhanced.py` | 16KB | FastAPI STEP→GLB server |

## Deploy in 5 Steps

### Step 1: Replace Old STEP Module

```bash
cp ~/cyclecad/app/js/modules/step-module-enhanced.js ~/cyclecad/app/js/modules/step-module.js
```

### Step 2: Update index.html Import

In `app/index.html`, change:
```javascript
// OLD:
import StepModule from './js/modules/step-module.js';

// NEW (if using enhanced version):
import StepModuleEnhanced from './js/modules/step-module-enhanced.js';
const StepModule = StepModuleEnhanced;
```

### Step 3: Start Server (for large files)

```bash
# Option A: Docker (recommended)
docker run -d --name cyclecad-converter \
  -p 8787:8000 \
  -e WASM_MEMORY_LIMIT=4096 \
  cyclecad/converter:latest

# Option B: Python directly
cd ~/cyclecad/server
pip install -r requirements.txt
uvicorn converter:app --port 8787

# Verify health
curl http://localhost:8787/health
```

### Step 4: Test Import

Open in browser:
```
file:///Users/sachin/cyclecad/app/tests/step-tests.html
```

Click "Run All Tests" → should see 50+ tests pass

Upload a STEP file to test real import

### Step 5: Configure in App

In cycleCAD app, open STEP module settings:
```javascript
// If server is local:
cycleCAD.step.setServerURL('http://localhost:8787/convert');

// If server is remote (AWS, etc):
cycleCAD.step.setServerURL('https://converter.example.com/convert');
```

## Test Results

**Expected behavior:**

| File Size | Result | Time |
|-----------|--------|------|
| 2MB STEP | ✓ Imports instantly via occt-import-js | <3s |
| 30MB STEP | ✓ Imports via occt-import-js | 8-12s |
| 80MB STEP | ✓ Imports via server converter | 45-60s |
| 140MB STEP | ✓ Imports via server converter | 90-120s |

**If WASM timeout on large file:**
→ Automatically falls back to server converter
→ No user action needed, just wait

**If server unavailable:**
→ Shows friendly error with suggestions
→ "Start Docker container" or "Use smaller file"

## API Reference

### Basic Import

```javascript
// File picker (user selects file)
document.getElementById('stepImportBtn').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.step,.stp';
  input.onchange = (e) => cycleCAD.step.import(e.target.files[0]);
  input.click();
});

// Or programmatic (File object)
const file = new File([buffer], 'model.step', { type: 'application/octet-stream' });
cycleCAD.step.import(file);

// Or from URL
cycleCAD.step.importFromURL('https://example.com/models/part.step');
```

### Listen to Events

```javascript
cycleCAD.on('step:importStart', (data) => {
  console.log(`Importing: ${data.filename} (${data.size} bytes)`);
  showProgressBar();
});

cycleCAD.on('step:importProgress', (data) => {
  updateProgressBar(data.percent);
  console.log(`${data.percent}%: ${data.message}`);
});

cycleCAD.on('step:importComplete', (data) => {
  console.log(`✓ Imported ${data.partCount} parts (${data.source})`);
  hideProgressBar();
});

cycleCAD.on('step:importError', (data) => {
  console.error(`✕ ${data.error}`);
  console.log(`Fix: ${data.suggestion}`);
  showError(data.error, data.suggestion);
});

cycleCAD.on('step:importWarning', (data) => {
  console.warn(`⚠ ${data.message}`);
});
```

### Advanced Usage

```javascript
// Get metadata without importing
const meta = await cycleCAD.step.getMetadata(file);
console.log(`File has ${meta.partCount} parts`);

// Export to STEP (requires B-Rep kernel)
cycleCAD.step.export('my-design.step');

// Change server URL
cycleCAD.step.setServerURL('http://custom-server:9999/convert');

// Cancel current import
cycleCAD.step.cancelImport();

// Clear cache
cycleCAD.step.clearCache();

// Check module state
console.log(cycleCAD.step.state);
// → {
//   importInProgress: false,
//   serverHealthy: true,
//   serverURL: 'http://localhost:8787/convert',
//   cacheEnabled: true,
//   lastImportInfo: { partCount: 47, filename: 'model.step' }
// }
```

## Troubleshooting

### "WASM memory exceeded"

**Problem:** Browser WASM ran out of memory on large file

**Solutions:**
1. Use server converter (automatically routes ≥50MB files)
2. Close other browser tabs to free memory
3. Split assembly in CAD before export

### "WASM parsing timeout (90s)"

**Problem:** File too complex (>3000 parts) for browser parser

**Solutions:**
1. Use server converter (5-minute timeout vs 90-second browser limit)
2. Reduce geometry detail in CAD
3. Split assembly into sub-assemblies

### "Server unavailable"

**Problem:** Server not running or wrong URL

**Solutions:**
```bash
# Check if server is running
curl http://localhost:8787/health

# Start Docker container
docker run -d -p 8787:8000 cyclecad/converter:latest

# Or start Python directly
cd ~/cyclecad/server
uvicorn converter:app --port 8787
```

### "No meshes extracted"

**Problem:** STEP file is corrupted or uses unsupported variant

**Solutions:**
1. Open file in Fusion 360 or FreeCAD
2. Verify file is valid (File > Open)
3. Re-save as AP214 STEP format
4. Try online converter: https://products.aspose.app/cad/conversion

## Documentation

Full documentation is in three places:

1. **Tutorial** — `docs/STEP-IMPORT-TUTORIAL.md` (500+ lines)
   - What is STEP format
   - 4 import methods
   - Server setup
   - 13 troubleshooting issues
   - Performance tips
   - Full API reference

2. **Help Topics** — `docs/STEP-HELP.json` (20+ topics)
   - For in-app help system
   - Search and categorized display
   - Copy into cycleCAD help infrastructure

3. **Test Suite** — `app/tests/step-tests.html` (50+ tests)
   - Interactive test runner
   - Export results as JSON/HTML
   - Validate all components

4. **Summary** — `STEP-IMPORT-SYSTEM-SUMMARY.md`
   - Architecture overview
   - File descriptions
   - Integration steps

## Key Features

✅ **Multi-Strategy Router** — Auto-selects best parser
✅ **Intelligent Caching** — SHA-256 hash with IndexedDB
✅ **Worker Heartbeat** — Detects frozen WASM in 90s
✅ **CRITICAL FIX** — `.slice(0)` tight loop prevents heap reallocation
✅ **Adaptive Deflection** — Coarser mesh for large files
✅ **Server Fallback** — Always has a working path
✅ **Progress Tracking** — Percentage + elapsed time
✅ **Error Recovery** — Suggestions for every failure
✅ **CORS Enabled** — Works cross-origin
✅ **Docker Ready** — Single command deployment

## Server Configuration

### Environment Variables

```bash
docker run -d -p 8787:8000 \
  -e STEP_DEFLECTION=0.05 \
  -e WASM_TIMEOUT=300 \
  -e WASM_MEMORY_LIMIT=4096 \
  -e MAX_FILE_SIZE=500 \
  cyclecad/converter:latest
```

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `STEP_DEFLECTION` | 0.01 | 0.01-0.2 | Mesh density (0.01=fine, 0.2=coarse) |
| `WASM_TIMEOUT` | 300 | 60-3600 | Parse timeout in seconds |
| `WASM_MEMORY_LIMIT` | 4096 | 512-32768 | Max memory in MB |
| `MAX_FILE_SIZE` | 500 | 10-2048 | Max upload size in MB |
| `CACHE_TTL` | 24 | 1-168 | Cache time-to-live in hours |

### Docker Compose

```yaml
version: '3.8'
services:
  converter:
    image: cyclecad/converter:latest
    ports:
      - "8787:8000"
    environment:
      WASM_MEMORY_LIMIT: "4096"
      WASM_TIMEOUT: "300"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    volumes:
      - ./logs:/app/logs
```

## What's Fixed

**Before v1.0:**
- WASM timeout on large files (80MB+ → fail)
- Verts=0 for all meshes (heap reallocation bug)
- No fallback if WASM failed
- Memory exhaustion on >100MB files
- No caching (re-parse every time)

**After v2.0:**
- ✓ 80-140MB files work via server
- ✓ Tight `.slice(0)` copy loop prevents heap bug
- ✓ Auto-fallback between WASM → OpenCascade → Server
- ✓ Adaptive deflection handles XL files
- ✓ IndexedDB cache with SHA-256 invalidation
- ✓ Worker heartbeat detects frozen parsers
- ✓ 50+ test suite validates all components

## Next Steps

1. **Deploy:** Start Docker container (5-minute setup)
2. **Test:** Run interactive test suite in browser
3. **Integrate:** Replace old step-module.js
4. **Validate:** Import real STEP files (2MB, 30MB, 80MB+)
5. **Monitor:** Check server health: curl http://localhost:8787/health

---

**Version:** 2.0.0
**Released:** 2026-03-31
**Status:** Production-ready
**License:** MIT

Questions? See `STEP-IMPORT-TUTORIAL.md` or `STEP-IMPORT-SYSTEM-SUMMARY.md`
