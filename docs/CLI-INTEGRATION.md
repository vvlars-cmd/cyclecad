# cycleCAD CLI Integration Guide

This guide explains how to integrate the cycleCAD CLI with your actual CAD application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Terminal / Script                                       │
│  $ cyclecad shape.cylinder --radius 25 --height 80     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ HTTP POST /api/execute
                   │ { method: "shape.cylinder", params: {...} }
                   │
┌──────────────────▼──────────────────────────────────────┐
│  cycleCAD API Server (Node.js / Express / FastAPI)      │
│  - Receives command via /api/execute                     │
│  - Dispatches to cycleCAD modules                       │
│  - Returns JSON result                                  │
└──────────────────┬──────────────────────────────────────┘
                   │
                   │ HTTP Response
                   │ { ok: true, result: {...} }
                   │
┌──────────────────▼──────────────────────────────────────┐
│  CLI Client                                              │
│  - Parses response JSON                                 │
│  - Formats output for terminal                          │
│  - Displays results                                     │
└─────────────────────────────────────────────────────────┘
```

## Step 1: Implement the API Endpoint

Create a `/api/execute` endpoint in your server that receives commands and returns results.

### Express.js Example

```javascript
// server.js
const express = require('express');
const app = express();

app.use(express.json());

// Import cycleCAD modules
const { viewport, sketch, operations } = require('./cycleCAD');

// Main API endpoint
app.post('/api/execute', (req, res) => {
  const { method, params } = req.body;

  try {
    // Dispatch command to appropriate handler
    const result = executeCommand(method, params);

    res.json({
      ok: true,
      result: result
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error.message
    });
  }
});

// Command dispatcher
function executeCommand(method, params) {
  const [namespace, command] = method.split('.');

  // Route to appropriate namespace handler
  switch (namespace) {
    case 'shape':
      return handleShapeCommand(command, params);
    case 'sketch':
      return handleSketchCommand(command, params);
    case 'feature':
      return handleFeatureCommand(command, params);
    // ... more namespaces
    default:
      throw new Error(`Unknown namespace: ${namespace}`);
  }
}

// Shape handlers
function handleShapeCommand(command, params) {
  switch (command) {
    case 'cylinder':
      return viewport.createCylinder(params.radius, params.height);
    case 'box':
      return viewport.createBox(params.width, params.height, params.depth);
    // ... more shape commands
    default:
      throw new Error(`Unknown command: shape.${command}`);
  }
}

// Similar handlers for other namespaces...

app.listen(3000, () => {
  console.log('cycleCAD API server running on http://localhost:3000');
});
```

### Python / FastAPI Example

```python
# server.py
from fastapi import FastAPI
from pydantic import BaseModel
import cyclecad

app = FastAPI()

class ExecuteRequest(BaseModel):
    method: str
    params: dict = {}

@app.post("/api/execute")
async def execute_command(request: ExecuteRequest):
    try:
        method, params = request.method, request.params
        result = dispatch_command(method, params)
        return {"ok": True, "result": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}

def dispatch_command(method: str, params: dict):
    namespace, command = method.split('.')

    if namespace == 'shape':
        if command == 'cylinder':
            return cyclecad.create_cylinder(
                radius=params.get('radius'),
                height=params.get('height')
            )
        # ... more commands
    elif namespace == 'sketch':
        # ... sketch commands
        pass
    # ... more namespaces

    raise ValueError(f"Unknown command: {method}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
```

## Step 2: Return Proper Response Format

Each command handler should return a result object. The response format is:

```json
{
  "ok": true,
  "result": {
    "entityId": "unique_id",
    "type": "shape/feature/assembly",
    "property1": "value",
    "property2": 123,
    "message": "Human-readable message"
  }
}
```

### Examples

**Create a cylinder:**
```json
{
  "ok": true,
  "result": {
    "entityId": "cylinder_1",
    "type": "shape",
    "radius": 25,
    "height": 80,
    "volume": 157079.63,
    "message": "Created cylinder with radius 25mm and height 80mm"
  }
}
```

**Validate dimensions:**
```json
{
  "ok": true,
  "result": {
    "target": "extrude_1",
    "dimensions": {
      "width": 80,
      "height": 40,
      "depth": 30
    },
    "message": "Dimensions calculated"
  }
}
```

**Estimate cost:**
```json
{
  "ok": true,
  "result": {
    "target": "bracket",
    "process": "CNC",
    "material": "aluminum",
    "cost": 45.50,
    "costPerUnit": 0.4550,
    "quantity": 100,
    "message": "Cost estimation complete"
  }
}
```

**Design review:**
```json
{
  "ok": true,
  "result": {
    "target": "bracket",
    "score": "B",
    "warnings": [
      "Wall thickness approaching minimum (0.9mm < 1.0mm)",
      "Sharp corner at junction — consider adding fillet"
    ],
    "suggestions": [
      "Increase wall thickness by 0.5mm",
      "Add 2mm fillet to corners",
      "Check for draft angle on undercuts"
    ],
    "message": "Design review complete with score: B"
  }
}
```

## Step 3: Handle Each Namespace

### shape.* — Geometry Creation

```javascript
// Should create 3D geometry and return entityId
shape.cylinder({ radius: 25, height: 80 })
// Returns: { entityId: "cylinder_1", radius: 25, height: 80, volume: 157079.63 }

shape.box({ width: 50, height: 40, depth: 30 })
// Returns: { entityId: "box_1", width: 50, height: 40, depth: 30, volume: 60000 }

shape.sphere({ radius: 30 })
// Returns: { entityId: "sphere_1", radius: 30, volume: 113097.34 }
```

### sketch.* — 2D Sketch Operations

```javascript
// Sketch operations work within a sketch context
sketch.start({ plane: 'XY' })
// Returns: { sketchId: "sketch_1", plane: "XY", ready: true }

sketch.circle({ cx: 0, cy: 0, radius: 15 })
// Returns: { entityId: "circle_1", cx: 0, cy: 0, radius: 15 }

sketch.rect({ x: 0, y: 0, width: 100, height: 50 })
// Returns: { entityId: "rect_1", x: 0, y: 0, width: 100, height: 50 }

sketch.end()
// Returns: { sketchId: "sketch_1", entities: 3, ready: false }
```

### feature.* — 3D Feature Operations

```javascript
feature.extrude({ height: 10 })
// Returns: { entityId: "extrude_1", height: 10, volume: /* calculated */ }

feature.fillet({ radius: 5, edges: 'all' })
// Returns: { entityId: "fillet_1", radius: 5, edges: "all", applied: true }

feature.pattern({ type: 'rectangular', count: 3, spacing: 25 })
// Returns: { entityId: "pattern_1", type: "rectangular", count: 3, instances: 3 }
```

### validate.* — Analysis & Validation

```javascript
validate.dimensions({ target: 'extrude_1' })
// Returns: { target: "extrude_1", dimensions: { width: 80, height: 40, depth: 30 } }

validate.cost({ target: 'bracket', process: 'CNC', material: 'aluminum' })
// Returns: { target: "bracket", cost: 45.50, process: "CNC", material: "aluminum" }

validate.designReview({ target: 'bracket' })
// Returns: { target: "bracket", score: "B", warnings: [...], suggestions: [...] }
```

### render.* — Viewport Operations

```javascript
render.snapshot({ width: 1200, height: 800 })
// Returns: { imageUrl: "data:image/png;base64,..." }

render.multiview({ width: 400, height: 400 })
// Returns: { views: { front: "data:...", back: "data:...", ... } }

render.highlight({ target: 'cylinder_1', color: 0xffff00 })
// Returns: { target: "cylinder_1", highlighted: true }
```

### export.* — File Export

```javascript
export.stl({ filename: 'bracket.stl', binary: true })
// Returns: { filename: "bracket.stl", format: "STL", size: 2048000 }

export.json({ filename: 'bracket.json' })
// Returns: { filename: "bracket.json", format: "JSON", size: 45000 }
```

### assembly.* — Assembly Management

```javascript
assembly.addComponent({ name: 'bolt', meshOrFile: 'cylinder_1', position: [0, 0, 10] })
// Returns: { componentId: "bolt_1", name: "bolt", position: [0, 0, 10] }

assembly.bom({ target: 'assembly_1' })
// Returns: { target: "assembly_1", components: 23, subassemblies: 4 }
```

### meta.* — API Metadata

```javascript
meta.version()
// Returns: { version: "0.1.0", apiVersion: "1.0.0" }

meta.getSchema()
// Returns: { namespaces: 10, commands: 30, ... }
```

## Step 4: Testing

Once implemented, test with the CLI:

```bash
# Start your server
npm start
# or
python server.py

# In another terminal, test with CLI
node bin/cyclecad-cli.js shape.cylinder --radius 25 --height 80
# Should output: ✓ Command executed: shape.cylinder

node bin/cyclecad-cli.js --list
# Should list all available commands

node bin/cyclecad-cli.js --batch examples/batch-simple.txt
# Should execute batch and report results
```

## Step 5: Configuration

Allow the CLI to connect to different servers:

```bash
# Default server
cyclecad shape.cylinder --radius 25 --height 80

# Custom server
cyclecad --server http://production.cyclecad.com shape.cylinder --radius 25

# Environment variable
export CYCLECAD_SERVER=http://production.cyclecad.com
cyclecad shape.cylinder --radius 25
```

## Step 6: Error Handling

Return proper error responses:

```json
{
  "ok": false,
  "error": "Unknown command: invalid.method"
}
```

The CLI will display:
```
[10:37:35] ✗ Command failed: Unknown command: invalid.method
```

## Integration Checklist

- [ ] Create `/api/execute` endpoint
- [ ] Implement command dispatcher
- [ ] Implement all namespace handlers (shape, sketch, feature, etc.)
- [ ] Return proper JSON response format
- [ ] Test with CLI: `--help`, `--list`, single commands
- [ ] Test batch mode: `--batch examples/batch-simple.txt`
- [ ] Test JSON output: `--json`
- [ ] Test error cases
- [ ] Add CORS headers if needed
- [ ] Deploy to production server
- [ ] Update CLI server URL in configuration
- [ ] Document server API for other clients

## Example Integration in cycleCAD

Here's how to integrate in the existing `app/index.html`:

```javascript
// In your server initialization
import { initAgentAPI } from './app/js/agent-api.js';

// After initializing all modules
const { sessionId } = initAgentAPI({
  viewport: window._viewport,
  sketch: window._sketch,
  operations: window._ops,
  advancedOps: window._advancedOps,
  exportModule: window._exportMod,
  appState: window._appState,
  tree: window._tree,
  assembly: window._assemblyModule
});

// Expose HTTP API
const express = require('express');
const app = express();

app.post('/api/execute', (req, res) => {
  const { method, params } = req.body;
  try {
    const result = window.cycleCAD.execute({ method, params });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.listen(3000);
```

## Deployment Options

### 1. Single Node.js Server
```bash
node server.js
cyclecad shape.cylinder --radius 25
```

### 2. Containerized (Docker)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 3. Cloud Deployment (Vercel, Netlify)
```bash
npm install -g vercel
vercel --prod
```

## Performance Optimization

- Cache frequently accessed data
- Use database for history/state
- Implement request queuing for batch operations
- Add rate limiting for production
- Monitor API response times

## Security Considerations

- Add authentication (API keys, JWT)
- Validate input parameters
- Sanitize output for display
- Rate limit API endpoints
- Log all commands for audit trail
- Implement HTTPS for production

## Monitoring & Logging

```javascript
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});
```

## Further Reading

- CLI Documentation: `docs/CLI.md`
- Quick Start: `QUICKSTART-CLI.md`
- Build Summary: `CLI-BUILD-SUMMARY.md`
- Agent API: `app/js/agent-api.js`
- Mock Server: `bin/server.js`

---

For questions or issues, refer to the main documentation or create an issue on GitHub.
