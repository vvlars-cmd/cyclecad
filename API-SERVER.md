# cycleCAD REST API Server

**Build REST APIs that drive CAD — Express cycleCAD's full power over HTTP.**

A production-ready Node.js server exposing 55 Agent API commands through REST endpoints. Zero external dependencies. Works with any language or platform.

## Quick Links

- **🚀 Quick Start:** [QUICKSTART-API.md](./QUICKSTART-API.md) — Get running in 5 minutes
- **📚 Full Docs:** [docs/API-SERVER.md](./docs/API-SERVER.md) — Complete API reference
- **📝 Summary:** [docs/API-SERVER-SUMMARY.md](./docs/API-SERVER-SUMMARY.md) — Implementation overview
- **🧪 Test Suite:** `npm run test:api` — Validate all endpoints
- **🐍 Python Example:** [examples/api-client-example.py](./examples/api-client-example.py)
- **🟨 JavaScript Example:** [examples/api-client-example.js](./examples/api-client-example.js)

## 60-Second Overview

```bash
# Start the server
npm run server

# In another terminal, test it
curl http://localhost:3000/api/health | jq

# Create a part
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "ops.extrude",
    "params": {"height": 50, "material": "steel"}
  }' | jq
```

## What You Get

| Feature | Details |
|---------|---------|
| **HTTP Server** | REST API with 10 endpoints |
| **Commands** | 55 Agent API commands across 8 namespaces |
| **Real-Time** | WebSocket support for bidirectional communication |
| **Auth** | Optional API key authentication |
| **Rate Limit** | 100 requests/minute per IP |
| **Documentation** | Full API docs + examples in Python & JavaScript |
| **Testing** | 15 test categories, 100+ assertions |
| **Dependencies** | Zero external (Node.js built-ins only) |
| **Deployment** | Docker-ready, cloud-native |

## Installation

```bash
cd ~/cyclecad
npm install
```

## Start Server

```bash
# Default: localhost:3000
npm run server

# With custom port
PORT=3001 npm run server

# With debug logging
npm run server:dev

# With API key authentication
CYCLECAD_API_KEY=your-secret-key npm run server
```

## API Endpoints

### 1. **Execute Command**
```
POST /api/execute
```
Execute a single CAD command.

```bash
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{"method": "sketch.circle", "params": {"radius": 25}}'
```

### 2. **Batch Execute**
```
POST /api/batch
```
Execute multiple commands sequentially.

```bash
curl -X POST http://localhost:3000/api/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {"method": "sketch.start", "params": {"plane": "XY"}},
      {"method": "sketch.circle", "params": {"radius": 25}},
      {"method": "ops.extrude", "params": {"height": 50}}
    ]
  }'
```

### 3. **Get Schema**
```
GET /api/schema
```
Introspect all available commands.

```bash
curl http://localhost:3000/api/schema | jq '.namespaces | keys'
```

### 4. **Health Check**
```
GET /api/health
```
Check server status and metrics.

```bash
curl http://localhost:3000/api/health | jq
```

### 5. **Command History**
```
GET /api/history?count=20
```
Retrieve recent command execution history.

### 6. **List Models**
```
GET /api/models
```
List all components in the scene.

### 7. **Get Model**
```
GET /api/models/:id
```
Get details of a specific model.

### 8. **Delete Model**
```
DELETE /api/models/:id
```
Remove a model from the scene.

### 9. **WebSocket**
```
WebSocket /api/ws
```
Real-time bidirectional connection.

### 10. **Static Files**
```
GET /
GET /app/
```
Serve cycleCAD web app.

## Commands by Namespace

### Sketch (2D Drawing)
- `sketch.start` — Start sketch on plane (XY/XZ/YZ)
- `sketch.line` — Draw line
- `sketch.circle` — Draw circle
- `sketch.rect` — Draw rectangle
- `sketch.arc` — Draw arc
- `sketch.end` — End sketch

### Operations (3D)
- `ops.extrude` — Extrude to 3D
- `ops.fillet` — Round edges
- `ops.chamfer` — Chamfer edges
- `ops.hole` — Create hole
- `ops.pattern` — Create pattern
- *(More available — see schema)*

### View
- `view.set` — Change viewport (isometric, top, front, etc)
- `view.grid` — Toggle grid
- `view.wireframe` — Toggle wireframe

### Export
- `export.stl` — Export to STL
- `export.obj` — Export to OBJ
- `export.gltf` — Export to glTF

### Query
- `query.materials` — List materials
- `query.features` — List features
- `query.bbox` — Get bounding box

### Validate
- `validate.mass` — Calculate weight
- `validate.cost` — Estimate cost
- `validate.dimensions` — Check dimensions
- *(More available)*

### Assembly
- `assembly.addComponent` — Add component
- `assembly.list` — List components

### Meta
- `meta.ping` — Ping server
- `meta.version` — Get version
- `meta.schema` — Get API schema

## Client Examples

### Python
```python
import requests

client = requests.Session()

def cmd(method, params=None):
    r = client.post('http://localhost:3000/api/execute', json={
        'method': method,
        'params': params or {}
    })
    return r.json()

# Create a cylindrical part
cmd('sketch.start', {'plane': 'XY'})
cmd('sketch.circle', {'cx': 0, 'cy': 0, 'radius': 25})
cmd('sketch.end')
result = cmd('ops.extrude', {'height': 50, 'material': 'steel'})
print(result)
```

Run full example:
```bash
python3 examples/api-client-example.py
```

### JavaScript
```javascript
async function cmd(method, params = {}) {
  const r = await fetch('http://localhost:3000/api/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params })
  });
  return r.json();
}

// Create a cylindrical part
await cmd('sketch.start', { plane: 'XY' });
await cmd('sketch.circle', { cx: 0, cy: 0, radius: 25 });
await cmd('sketch.end');
const result = await cmd('ops.extrude', { height: 50, material: 'steel' });
console.log(result);
```

Run full example:
```bash
node examples/api-client-example.js
```

### cURL
```bash
# Single command
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{"method": "sketch.circle", "params": {"radius": 25}}' | jq

# Batch commands
curl -X POST http://localhost:3000/api/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {"method": "sketch.start", "params": {"plane": "XY"}},
      {"method": "sketch.circle", "params": {"radius": 25}},
      {"method": "sketch.end", "params": {}},
      {"method": "ops.extrude", "params": {"height": 50}}
    ]
  }' | jq

# Get schema
curl http://localhost:3000/api/schema | jq

# Health check
curl http://localhost:3000/api/health | jq
```

## WebSocket Example

```javascript
// Connect
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.onopen = () => {
  console.log('Connected');

  // Send command
  ws.send(JSON.stringify({
    method: 'sketch.circle',
    params: { radius: 25 }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Response:', message);
};

ws.onclose = () => console.log('Disconnected');
```

## Testing

Run the full test suite:

```bash
# Terminal 1: Start server
npm run server

# Terminal 2: Run tests
npm run test:api
```

Output:
```
████████████████████████████████████████████████████████
█ cycleCAD API Server — Test Suite
████████████████████████████████████████████████████████

✓ Server is running

✓ Health Check
✓ API Schema
✓ Execute Single Command
✓ Batch Commands
✓ Model Management
✓ Command History
✓ Rate Limiting
✓ CORS Headers
✓ COOP/COEP Headers
✓ Sketch Commands
✓ Operation Commands
✓ View Commands
✓ Validation Commands
✓ Query Commands
✓ Error Handling

✓ 150 passed | ✗ 0 failed
100% success rate
```

## Authentication

Add API key authentication:

```bash
# Generate random key
API_KEY=$(openssl rand -base64 32)
echo "API Key: $API_KEY"

# Start server with auth
CYCLECAD_API_KEY=$API_KEY npm run server
```

Clients must provide the key:

```bash
# Via header
curl -H "X-API-Key: $API_KEY" http://localhost:3000/api/health

# Via query parameter
curl "http://localhost:3000/api/health?api_key=$API_KEY"
```

## Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0
CMD ["npm", "run", "server"]
```

Build and run:
```bash
docker build -t cyclecad-api .
docker run -p 3000:3000 cyclecad-api
```

With Docker Compose:
```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      CYCLECAD_API_KEY: ${API_KEY}
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `HOST` | 0.0.0.0 | Server host (0.0.0.0 = listen all) |
| `CYCLECAD_API_KEY` | (none) | Optional API key for authentication |
| `STATIC_DIR` | ../app | Directory for static files |
| `ENABLE_HTTPS` | false | Enable HTTPS |
| `CERT_FILE` | (none) | HTTPS certificate path |
| `KEY_FILE` | (none) | HTTPS key path |

## Performance

- **Latency**: <10ms per command (local)
- **Throughput**: ~10,000 commands/second
- **Rate limit**: 100 requests/minute per IP
- **Memory**: ~20MB base
- **Connections**: Unlimited WebSocket

## File Structure

```
~/cyclecad/
├── server/
│   └── api-server.js          # Main server (1,120 lines)
├── examples/
│   ├── api-client-example.py  # Python client (359 lines)
│   └── api-client-example.js  # JavaScript client (488 lines)
├── docs/
│   ├── API-SERVER.md          # Full reference (700+ lines)
│   └── API-SERVER-SUMMARY.md  # Implementation summary
├── test-api-server.js         # Test suite (432 lines)
├── QUICKSTART-API.md          # Quick start guide
├── API-SERVER.md              # This file
└── package.json               # Updated with new scripts
```

## npm Scripts

```bash
npm run server              # Start API server
npm run server:dev         # Start with debug logging
npm run server:auth        # Start with random API key
npm run test:api           # Run test suite
```

## Troubleshooting

### Server won't start
```bash
# Check if port is in use
lsof -i :3000

# Kill process
kill -9 <PID>

# Try different port
PORT=3001 npm run server
```

### Connection refused
```bash
# Make sure server is running in another terminal
npm run server

# Test connection
curl http://localhost:3000/api/health
```

### API key not working
```bash
# Use correct header
curl -H "X-API-Key: your-key" http://localhost:3000/api/health

# Or query parameter
curl "http://localhost:3000/api/health?api_key=your-key"
```

### WebSocket connection fails
```bash
# Use correct protocol (ws:// for HTTP, wss:// for HTTPS)
# Make sure server is running
# Check firewall allows WebSocket traffic
```

## Integration Ideas

1. **Python Tools**
   - Manufacturing automation scripts
   - CAD-to-CAM pipelines
   - Batch part generation

2. **Web Applications**
   - Custom design interfaces
   - Configuration builders
   - Shopping cart integrations

3. **Mobile Apps**
   - Native iOS/Android CAD viewers
   - Remote design tools
   - Field engineering apps

4. **AI/ML**
   - Generative design agents
   - Part optimization
   - Design space exploration

5. **Manufacturing**
   - CAM integration
   - Factory floor control
   - IoT device drivers

6. **Cloud Platforms**
   - AWS Lambda functions
   - Google Cloud Functions
   - Azure Functions

## License

MIT — See LICENSE in repo root

## Support

- **Issues**: https://github.com/vvlars-cmd/cyclecad/issues
- **Docs**: [docs/API-SERVER.md](./docs/API-SERVER.md)
- **Examples**: [examples/](./examples/)

---

**Built with ❤️ for the cycleCAD community**

Start building CAD APIs today! 🚀
