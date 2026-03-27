# cycleCAD API Server — Quick Start Guide

Get your cycleCAD API server running in under 5 minutes and drive CAD from any language.

## Installation (1 minute)

```bash
# Already installed if you cloned the repo
cd ~/cyclecad

# If needed, install Node.js dependencies
npm install

# Verify Node.js is installed
node --version  # Should be v16 or higher
```

## Start the Server (1 minute)

```bash
# Start server on default port (3000)
npm run server

# Or with custom port
PORT=3001 npm run server

# Or with API key authentication
CYCLECAD_API_KEY=your-secret-key npm run server
```

You should see:
```
╔═══════════════════════════════════════════════════════════╗
║  cycleCAD API Server v0.2.0                               ║
║                                                           ║
║  HTTP:      http://localhost:3000                         ║
║  API:       POST /api/execute                             ║
║  Batch:     POST /api/batch                               ║
║  Schema:    GET /api/schema                               ║
║  Health:    GET /api/health                               ║
║  History:   GET /api/history                              ║
║  Models:    GET /api/models                               ║
║  WebSocket: ws://localhost:3000/api/ws                    ║
╚═══════════════════════════════════════════════════════════╝
```

## Test the Server (1 minute)

### Option 1: Browser
Open `http://localhost:3000` in your browser. You'll see a health check at `http://localhost:3000/api/health`.

### Option 2: cURL
```bash
# Check server is alive
curl http://localhost:3000/api/health | jq

# Get API schema (all commands)
curl http://localhost:3000/api/schema | jq '.namespaces | keys'

# Execute a command
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "sketch.circle",
    "params": {"cx": 0, "cy": 0, "radius": 25}
  }' | jq
```

### Option 3: Python
```bash
# Install requests library
pip install requests

# Run example client
python3 examples/api-client-example.py
```

### Option 4: Node.js
```bash
# Run example client
node examples/api-client-example.js
```

## Create Your First Part (2 minutes)

### Using cURL
```bash
# Start a sketch on the XY plane
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "sketch.start",
    "params": {"plane": "XY"}
  }' | jq .result

# Draw a circle with radius 25mm
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "sketch.circle",
    "params": {"cx": 0, "cy": 0, "radius": 25}
  }' | jq .result

# End the sketch
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{"method": "sketch.end", "params": {}}' | jq .result

# Extrude to 50mm
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "ops.extrude",
    "params": {"height": 50, "material": "steel"}
  }' | jq .result
```

### Using Python
```python
import requests
import json

BASE = 'http://localhost:3000'

def cmd(method, params=None):
    r = requests.post(f'{BASE}/api/execute', json={
        'method': method,
        'params': params or {}
    })
    return r.json()

# Create cylindrical part
cmd('sketch.start', {'plane': 'XY'})
cmd('sketch.circle', {'cx': 0, 'cy': 0, 'radius': 25})
cmd('sketch.end')
result = cmd('ops.extrude', {'height': 50, 'material': 'steel'})
print(f"Created: {result['result']['featureId']}")
```

### Using JavaScript
```javascript
const BASE = 'http://localhost:3000';

async function cmd(method, params = {}) {
  const r = await fetch(`${BASE}/api/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params })
  });
  return r.json();
}

// Create cylindrical part
await cmd('sketch.start', { plane: 'XY' });
await cmd('sketch.circle', { cx: 0, cy: 0, radius: 25 });
await cmd('sketch.end');
const result = await cmd('ops.extrude', { height: 50, material: 'steel' });
console.log(`Created: ${result.result.featureId}`);
```

## Core API Endpoints

### Single Command
**POST /api/execute**
```json
{ "method": "ops.extrude", "params": { "height": 50 } }
```

### Batch Commands
**POST /api/batch**
```json
{
  "commands": [
    { "method": "sketch.start", "params": {"plane": "XY"} },
    { "method": "sketch.circle", "params": {"cx": 0, "cy": 0, "radius": 25} },
    { "method": "sketch.end", "params": {} },
    { "method": "ops.extrude", "params": {"height": 50} }
  ]
}
```

### Get Schema
**GET /api/schema** — All available commands and parameters

### Health Check
**GET /api/health** — Server status

### Command History
**GET /api/history?count=20** — Recent commands executed

### Models
**GET /api/models** — List all components

### WebSocket
**WebSocket /api/ws** — Real-time bidirectional connection

## API Key Authentication

Protect your API with authentication:

```bash
# Start server with random API key
CYCLECAD_API_KEY=$(openssl rand -base64 32) npm run server

# Or use a fixed key
CYCLECAD_API_KEY=your-secret-key npm run server
```

Clients must provide the key in requests:

```bash
# Via header
curl -H "X-API-Key: your-secret-key" http://localhost:3000/api/health

# Via query parameter
curl http://localhost:3000/api/health?api_key=your-secret-key
```

## Available Commands

### Sketch (2D Drawing)
- `sketch.start` — Start sketch on XY/XZ/YZ plane
- `sketch.line` — Draw line
- `sketch.circle` — Draw circle
- `sketch.rect` — Draw rectangle
- `sketch.arc` — Draw arc
- `sketch.end` — End sketch

### Operations (3D)
- `ops.extrude` — Extrude sketch to 3D
- `ops.fillet` — Round edges
- `ops.chamfer` — Chamfer edges
- `ops.hole` — Create holes
- `ops.pattern` — Create patterns

### View
- `view.set` — Set view (isometric, top, front, etc.)
- `view.grid` — Toggle grid
- `view.wireframe` — Toggle wireframe

### Export
- `export.stl` — Export to STL
- `export.obj` — Export to OBJ
- `export.gltf` — Export to glTF

### Validate
- `validate.mass` — Calculate weight
- `validate.cost` — Estimate cost
- `validate.dimensions` — Check dimensions

### Query
- `query.features` — List features
- `query.materials` — List materials
- `query.bbox` — Get bounding box

### Assembly
- `assembly.addComponent` — Add component
- `assembly.list` — List components

### Meta
- `meta.ping` — Ping server
- `meta.version` — Get version
- `meta.schema` — Get API schema

## Common Patterns

### Pattern 1: Simple Sequential Operations
```bash
curl -X POST http://localhost:3000/api/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {"method": "sketch.start", "params": {"plane": "XY"}},
      {"method": "sketch.circle", "params": {"radius": 25}},
      {"method": "sketch.end", "params": {}},
      {"method": "ops.extrude", "params": {"height": 50}}
    ]
  }' | jq '.results | map(.elapsed)'
```

### Pattern 2: Create and Validate
```bash
# Create part
curl -X POST http://localhost:3000/api/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {"method": "sketch.start", "params": {"plane": "XY"}},
      {"method": "sketch.circle", "params": {"radius": 25}},
      {"method": "sketch.end", "params": {}},
      {"method": "ops.extrude", "params": {"height": 50, "material": "steel"}},
      {"method": "validate.mass", "params": {"target": "extrude_1234", "material": "steel"}}
    ]
  }' | jq '.results[-1].result'
```

### Pattern 3: Parametric Design
```python
# Generate 5 cylinders with different heights
import requests

BASE = 'http://localhost:3000'

for height in [10, 20, 30, 40, 50]:
    r = requests.post(f'{BASE}/api/batch', json={
        'commands': [
            {'method': 'sketch.start', 'params': {'plane': 'XY'}},
            {'method': 'sketch.circle', 'params': {'radius': 20}},
            {'method': 'sketch.end', 'params': {}},
            {'method': 'ops.extrude', 'params': {'height': height}},
            {'method': 'validate.mass', 'params': {'material': 'steel'}}
        ]
    })
    mass = r.json()['results'][-1]['result']['mass']
    print(f"Height {height}mm → Mass {mass}kg")
```

## Troubleshooting

### Server won't start
```bash
# Check if port is in use
lsof -i :3000

# Kill process using port
kill -9 <PID>

# Try different port
PORT=3001 npm run server
```

### Connection refused
```bash
# Make sure server is running
# Terminal 1:
npm run server

# Terminal 2: Test
curl http://localhost:3000/api/health
```

### API key not working
```bash
# Make sure header is correct
curl -H "X-API-Key: your-key" http://localhost:3000/api/health

# Or use query parameter
curl http://localhost:3000/api/health?api_key=your-key
```

### WebSocket connection fails
```bash
# Use ws:// for local, wss:// for HTTPS
# Make sure server is running
# Check firewall allows WebSocket traffic
```

## Next Steps

1. **Read full documentation**: `docs/API-SERVER.md`
2. **Explore all commands**: `GET /api/schema`
3. **Try examples**: `examples/api-client-example.{py,js}`
4. **Build your application**: Integrate with your codebase
5. **Deploy**: Use Docker or cloud platforms

## Docker Deployment

```bash
# Build image
docker build -t cyclecad-api .

# Run container
docker run -p 3000:3000 cyclecad-api

# With API key
docker run -e CYCLECAD_API_KEY=your-key -p 3000:3000 cyclecad-api
```

## Need Help?

- Full API docs: `docs/API-SERVER.md`
- Example clients: `examples/`
- GitHub issues: https://github.com/vvlars-cmd/cyclecad/issues
- Discord: Join the cycleCAD community

---

**Happy designing! 🚀**
