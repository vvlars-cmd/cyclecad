# cycleCAD REST API Server

A Node.js HTTP server that exposes the cycleCAD Agent API via REST endpoints, enabling any language or platform to drive cycleCAD through JSON-RPC style commands.

## Quick Start

```bash
# Install dependencies (zero external deps, uses Node.js built-ins)
npm install

# Start server (default: localhost:3000)
npm run server

# Start with development mode logging
npm run server:dev

# Start with API key authentication
npm run server:auth
```

Server will output:
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

## Configuration

Environment variables:
- `PORT` — Server port (default: 3000)
- `HOST` — Server host (default: 0.0.0.0)
- `CYCLECAD_API_KEY` — Optional API key for authentication
- `STATIC_DIR` — Directory to serve static files (default: ../app)
- `ENABLE_HTTPS` — Enable HTTPS (default: false)
- `CERT_FILE` — Path to HTTPS certificate
- `KEY_FILE` — Path to HTTPS key

## API Endpoints

### 1. Execute Single Command
**POST /api/execute**

Execute a single Agent API command.

Request:
```json
{
  "method": "ops.extrude",
  "params": {
    "height": 80,
    "symmetric": false,
    "material": "steel"
  }
}
```

Response (success):
```json
{
  "ok": true,
  "result": {
    "featureId": "extrude_1711425600000",
    "type": "extrude",
    "height": 80,
    "symmetric": false,
    "material": "steel",
    "volume": 8000
  },
  "elapsed": 12,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response (error):
```json
{
  "ok": false,
  "error": "Unknown method: ops.extrudee. Did you mean: ops.extrude?",
  "elapsed": 2,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 2. Execute Batch Commands
**POST /api/batch**

Execute multiple commands sequentially. Stops on first error unless `continueOnError` is set.

Request:
```json
{
  "commands": [
    { "method": "sketch.start", "params": { "plane": "XY" } },
    { "method": "sketch.circle", "params": { "cx": 0, "cy": 0, "radius": 25 } },
    { "method": "sketch.end", "params": {} },
    { "method": "ops.extrude", "params": { "height": 50 } }
  ],
  "continueOnError": false
}
```

Response:
```json
{
  "ok": true,
  "results": [
    { "ok": true, "result": { "sketchId": "sketch_1711425600000", ... }, "elapsed": 5 },
    { "ok": true, "result": { "entityId": "circle_1711425600001", ... }, "elapsed": 3 },
    { "ok": true, "result": { "status": "complete", ... }, "elapsed": 2 },
    { "ok": true, "result": { "featureId": "extrude_1711425600002", ... }, "elapsed": 8 }
  ],
  "errors": [],
  "executed": 4,
  "total": 4,
  "elapsed": 18,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 3. Get API Schema
**GET /api/schema**

Retrieve the complete API schema with all available commands, parameters, and descriptions.

Response:
```json
{
  "version": "0.2.0",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "namespaces": {
    "sketch": {
      "description": "Create 2D sketches on planes",
      "commands": {
        "start": {
          "method": "sketch.start",
          "description": "Start a 2D sketch on a plane",
          "params": { "plane": "string (XY|XZ|YZ)" },
          "returns": { "sketchId": "string", "plane": "string", "status": "string" }
        },
        "circle": { ... },
        "line": { ... }
      }
    },
    "ops": { ... },
    "view": { ... },
    "export": { ... },
    "query": { ... },
    "validate": { ... },
    "assembly": { ... },
    "meta": { ... }
  },
  "totalCommands": 55
}
```

### 4. Health Check
**GET /api/health**

Check server status and metrics.

Response:
```json
{
  "status": "ok",
  "version": "0.2.0",
  "uptime": 3600,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "commands": 55,
  "commandsExecuted": 127,
  "features": 3,
  "models": 5,
  "wsClients": 2,
  "timestamp": "2024-03-26T15:30:00Z"
}
```

### 5. Get Command History
**GET /api/history?count=20**

Retrieve recent command execution history.

Query params:
- `count` — Number of recent commands to return (default: 20, max: 1000)

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "total": 127,
  "recent": [
    {
      "id": "cmd_123",
      "method": "ops.extrude",
      "params": { "height": 50, "material": "steel" },
      "elapsed": 8,
      "ok": true,
      "timestamp": "2024-03-26T15:30:00Z",
      "result": ["featureId", "type", "height"]
    },
    { ... }
  ],
  "timestamp": "2024-03-26T15:30:15Z"
}
```

### 6. List Models
**GET /api/models**

List all models/components in the scene.

Response:
```json
{
  "ok": true,
  "models": [
    { "id": "comp_1711425600000", "name": "Bracket", "position": [0, 0, 0] },
    { "id": "comp_1711425600001", "name": "Shaft", "position": [50, 0, 0] }
  ],
  "count": 2
}
```

### 7. Get Model Details
**GET /api/models/:id**

Get details of a specific model.

Response:
```json
{
  "ok": true,
  "model": {
    "id": "comp_1711425600000",
    "name": "Bracket",
    "position": [0, 0, 0]
  }
}
```

### 8. Delete Model
**DELETE /api/models/:id**

Remove a model from the scene.

Response:
```json
{
  "ok": true,
  "message": "Model comp_1711425600000 deleted",
  "remaining": 1
}
```

### 9. WebSocket Connection
**WebSocket /api/ws**

Establish a real-time bidirectional connection for continuous interaction.

Connection flow:
```
Client connects → Server sends welcome message → Client sends commands → Server responds in real-time
```

Welcome message:
```json
{
  "type": "welcome",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Connected to cycleCAD API Server"
}
```

Client sends command (same format as POST /api/execute):
```json
{
  "method": "sketch.circle",
  "params": { "cx": 0, "cy": 0, "radius": 25 }
}
```

Server sends response:
```json
{
  "ok": true,
  "result": { "entityId": "circle_...", ... },
  "elapsed": 5,
  "sessionId": "..."
}
```

Server sends ping every 30s:
```json
{
  "type": "ping",
  "timestamp": 1711425600000
}
```

## Command Namespaces

### sketch — 2D Drawing
- `sketch.start` — Start sketch on a plane (XY/XZ/YZ)
- `sketch.line` — Draw line segment
- `sketch.circle` — Draw circle
- `sketch.rect` — Draw rectangle
- `sketch.arc` — Draw arc
- `sketch.end` — End sketch and extrude

### ops — 3D Operations
- `ops.extrude` — Extrude sketch into 3D
- `ops.fillet` — Round edges
- `ops.chamfer` — Chamfer edges
- `ops.hole` — Create holes
- `ops.pattern` — Rectangular or circular pattern

### view — Viewport Control
- `view.set` — Set view (isometric, top, front, right, bottom, back, left)
- `view.grid` — Toggle grid
- `view.wireframe` — Toggle wireframe mode

### export — File Export
- `export.stl` — Export to STL (ASCII or binary)
- `export.obj` — Export to OBJ
- `export.gltf` — Export to glTF 2.0

### query — Model Inspection
- `query.features` — List all features
- `query.bbox` — Get bounding box
- `query.materials` — List available materials

### validate — Analysis & Validation
- `validate.dimensions` — Check dimensions
- `validate.cost` — Estimate manufacturing cost
- `validate.mass` — Calculate weight

### assembly — Multi-Component Models
- `assembly.addComponent` — Add component
- `assembly.list` — List components

### meta — Server Information
- `meta.ping` — Ping server
- `meta.version` — Get version info
- `meta.schema` — Get API schema

## Authentication

### Optional API Key

Enable API key authentication:
```bash
CYCLECAD_API_KEY=your-secret-key npm run server
```

Two ways to provide the key in requests:

1. **Header**:
```bash
curl -H "X-API-Key: your-secret-key" http://localhost:3000/api/health
```

2. **Query parameter**:
```bash
curl http://localhost:3000/api/health?api_key=your-secret-key
```

Without a valid key, all requests return:
```json
{
  "ok": false,
  "error": "Unauthorized - invalid or missing API key"
}
```

## Rate Limiting

The server enforces rate limiting: **100 requests per minute per IP**.

Response headers:
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1711425660
```

When limit is exceeded:
```json
{
  "ok": false,
  "error": "Too many requests",
  "retryAfter": 60
}
```

## CORS Headers

All responses include CORS headers for browser access:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE, PUT
Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization
```

## Static File Serving

The server serves the cycleCAD web app from `../app/`:
- `/` → `app/index.html`
- `/app/` → `app/index.html`
- `/app/mobile.html` → `app/mobile.html`
- `/app/js/*.js` → Static JS files
- `/app/css/*.css` → Static CSS files

## Error Handling

All errors follow a consistent format:

```json
{
  "ok": false,
  "error": "Human-readable error message",
  "elapsed": 5,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Common error codes (HTTP status):
- `400 Bad Request` — Invalid JSON, missing required params
- `401 Unauthorized` — Invalid/missing API key
- `404 Not Found` — Unknown endpoint or resource
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server error

## Examples

### Python Client

```python
import requests
import json

BASE_URL = 'http://localhost:3000'
API_KEY = 'your-api-key'  # Optional

def execute_command(method, params=None):
    headers = {'X-API-Key': API_KEY} if API_KEY else {}
    response = requests.post(
        f'{BASE_URL}/api/execute',
        json={'method': method, 'params': params or {}},
        headers=headers
    )
    return response.json()

def execute_batch(commands):
    headers = {'X-API-Key': API_KEY} if API_KEY else {}
    response = requests.post(
        f'{BASE_URL}/api/batch',
        json={'commands': commands},
        headers=headers
    )
    return response.json()

# Example: Create a simple part
result = execute_command('sketch.start', {'plane': 'XY'})
print('Sketch started:', result['result']['sketchId'])

result = execute_command('sketch.circle', {
    'cx': 0, 'cy': 0, 'radius': 25
})
print('Circle created:', result['result']['entityId'])

result = execute_command('sketch.end')
result = execute_command('ops.extrude', {'height': 50, 'material': 'steel'})
print('Extrude complete:', result['result']['featureId'])
```

### JavaScript Client

```javascript
const BASE_URL = 'http://localhost:3000';
const API_KEY = 'your-api-key';  // Optional

async function executeCommand(method, params = {}) {
  const response = await fetch(`${BASE_URL}/api/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'X-API-Key': API_KEY })
    },
    body: JSON.stringify({ method, params })
  });
  return response.json();
}

async function executeBatch(commands) {
  const response = await fetch(`${BASE_URL}/api/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'X-API-Key': API_KEY })
    },
    body: JSON.stringify({ commands })
  });
  return response.json();
}

// Example: WebSocket connection
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.onopen = () => {
  console.log('Connected to cycleCAD');

  // Send command
  ws.send(JSON.stringify({
    method: 'sketch.start',
    params: { plane: 'XY' }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Response:', message);
};
```

### cURL Examples

Get schema:
```bash
curl http://localhost:3000/api/schema | jq
```

Check health:
```bash
curl http://localhost:3000/api/health | jq
```

Execute command:
```bash
curl -X POST http://localhost:3000/api/execute \
  -H 'Content-Type: application/json' \
  -d '{
    "method": "sketch.circle",
    "params": {"cx": 0, "cy": 0, "radius": 25}
  }' | jq
```

Execute batch:
```bash
curl -X POST http://localhost:3000/api/batch \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {"method": "sketch.start", "params": {"plane": "XY"}},
      {"method": "sketch.circle", "params": {"cx": 0, "cy": 0, "radius": 25}},
      {"method": "sketch.end", "params": {}},
      {"method": "ops.extrude", "params": {"height": 50}}
    ]
  }' | jq
```

## Development

### Enable debug logging:
```bash
npm run server:dev
```

### Test endpoints:
```bash
# Terminal 1: Start server
npm run server:dev

# Terminal 2: Test in another terminal
curl http://localhost:3000/api/health | jq

# Test with API key
CYCLECAD_API_KEY=test123 npm run server
curl -H "X-API-Key: test123" http://localhost:3000/api/health | jq
```

### Monitor WebSocket connections:
```bash
npm run server:dev
# Connect with: websocat ws://localhost:3000/api/ws
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY . .

EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0

CMD ["npm", "run", "server"]
```

### Docker Compose

```yaml
services:
  api-server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      HOST: 0.0.0.0
      CYCLECAD_API_KEY: ${API_KEY}
    volumes:
      - ./app:/app/app:ro
```

## Troubleshooting

### Port already in use
```bash
# Find and kill process using port 3000
lsof -i :3000
kill -9 <PID>

# Or use a different port
PORT=3001 npm run server
```

### WebSocket connection refused
- Ensure server is running
- Check firewall rules
- Use `ws://` not `wss://` for local connections
- For HTTPS, must use `wss://` and provide valid certificates

### Rate limit errors
- Space out requests: add delays between API calls
- Use batch endpoint for multiple operations
- Increase rate limit by modifying `RateLimiter` in code

### Static files not serving
- Check `STATIC_DIR` path
- Verify files exist: `ls -la app/`
- Check permissions: `chmod 755 app/`

## Performance

- **Latency**: < 10ms per command (local)
- **Throughput**: ~10,000 commands/second (batch operations)
- **Connections**: Supports unlimited concurrent WebSocket connections
- **Memory**: Base ~20MB + command history

## License

MIT — See LICENSE file in repository root
