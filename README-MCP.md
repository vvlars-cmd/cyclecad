# cycleCAD MCP Server

**Model Context Protocol (MCP) server** for cycleCAD Agent API.

Exposes all 55+ design commands as MCP tools that can be called by LLMs (Claude, GPT, Gemini, etc).

## ⚡ Quick Start

### 1. Start cycleCAD web server
```bash
npm start
# Runs on http://localhost:3000
```

### 2. Start MCP server
```bash
npx cyclecad-mcp
# Or: npm run mcp
```

The MCP server reads JSON-RPC requests from stdin and writes responses to stdout.

### 3. Use with Claude API

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=2048,
    tools=[
        {
            "type": "model_context_protocol",
            "name": "cyclecad-mcp",
            "uri": "stdio:///path/to/cyclecad/bin/cyclecad-mcp"
        }
    ],
    messages=[
        {
            "role": "user",
            "content": "Design a bracket: 80x40mm rectangle, 5mm tall, with a 3mm hole for a bolt"
        }
    ]
)

print(response.content[0].text)
```

Claude will automatically call the MCP tools to design the bracket.

## 📋 Available Tools (55+)

### Sketch Tools (8)
- `sketch_start`, `sketch_end`
- `sketch_line`, `sketch_rect`, `sketch_circle`, `sketch_arc`
- `sketch_clear`, `sketch_entities`

### Design Tools (20)
- `ops_extrude`, `ops_revolve`, `ops_primitive`
- `ops_fillet`, `ops_chamfer`, `ops_boolean`
- `ops_shell`, `ops_pattern`, `ops_material`
- `ops_sweep`, `ops_loft`, `ops_spring`, `ops_thread`, `ops_bend`

### Transform Tools (3)
- `transform_move`, `transform_rotate`, `transform_scale`

### View Tools (4)
- `view_set`, `view_fit`, `view_wireframe`, `view_grid`

### Export Tools (4)
- `export_stl`, `export_obj`, `export_gltf`, `export_json`

### Validation Tools (8)
- `validate_dimensions`, `validate_wallThickness`
- `validate_printability`, `validate_cost`, `validate_mass`
- `validate_surfaceArea`, `validate_centerOfMass`
- `validate_designReview` (A/B/C/F scoring)

### Render Tools (5)
- `render_snapshot`, `render_multiview`
- `render_highlight`, `render_hide`, `render_section`

### Query Tools (5)
- `query_features`, `query_bbox`, `query_materials`
- `query_session`, `query_log`

### Assembly Tools (4)
- `assembly_addComponent`, `assembly_removeComponent`
- `assembly_mate`, `assembly_explode`

### AI Tools (3)
- `ai_identifyPart`, `ai_suggestImprovements`, `ai_estimateCostAI`

### Meta Tools (5)
- `meta_ping`, `meta_version`, `meta_schema`, `meta_modules`, `meta_history`

### Scene Tools (2)
- `scene_clear`, `scene_snapshot`

## 🔧 Configuration

```bash
# Custom WebSocket URL
npx cyclecad-mcp --ws-url ws://10.0.0.1:3000/api/ws

# Custom HTTP URL (fallback)
npx cyclecad-mcp --http-url http://10.0.0.1:3000/api/execute

# Debug mode
npx cyclecad-mcp --debug

# Help
npx cyclecad-mcp --help
```

Environment variables:
```bash
export CYCLECAD_WS_URL=ws://localhost:3000/api/ws
export CYCLECAD_HTTP_URL=http://localhost:3000/api/execute
export DEBUG_MCP=1
```

## 📚 Documentation

- **Full API Reference**: See `docs/MCP-SERVER.md`
- **Example Workflows**: See `docs/EXAMPLES.md`
- **Architecture**: See `docs/ARCHITECTURE.md`

## 🧪 Testing

The MCP server can be tested without Claude API:

```bash
# Test with stdio
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize"}' | npx cyclecad-mcp

# Get available tools
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize"}' | npx cyclecad-mcp
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}' | npx cyclecad-mcp

# Call a tool
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize"}' | npx cyclecad-mcp
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "sketch_rect", "arguments": {"width": 50, "height": 30}}}' | npx cyclecad-mcp
```

## 🏗️ Architecture

```
Claude API
    ↓
MCP Protocol (stdio)
    ↓
cyclecad-mcp Server
    ├─ JSON-RPC dispatch
    ├─ Tool definitions (55+)
    └─ Connection management
         ├─ WebSocket (preferred)
         └─ HTTP (fallback)
    ↓
cycleCAD (Browser or Server)
    ├─ Agent API
    ├─ Sketch module
    ├─ Operations module
    ├─ Viewport (Three.js)
    └─ Assembly
```

## 🚀 Features

- ✅ **55+ Tools** — All Agent API commands as MCP tools
- ✅ **JSON Schema** — Full input validation
- ✅ **Error Handling** — Descriptive error messages
- ✅ **Non-blocking** — Works even if cycleCAD not running (queues commands)
- ✅ **Dual Transport** — WebSocket + HTTP fallback
- ✅ **Debug Mode** — Full request/response logging
- ✅ **Zero Dependencies** — Uses only Node.js built-ins

## 📦 Package Scripts

```bash
npm start          # Start cycleCAD web server
npm run mcp        # Start MCP server
npm run dev        # Dev mode
npm run cli        # CLI mode
npm run server     # API server
```

## 🔗 Related Docs

- [Full MCP Server Documentation](docs/MCP-SERVER.md)
- [Agent API Reference](docs/AGENT-API.md)
- [Examples & Workflows](docs/EXAMPLES.md)

## 📝 License

MIT — See LICENSE in root

## 🤝 Contributing

Issues & PRs welcome at https://github.com/vvlars-cmd/cyclecad

## 📧 Contact

- Email: vvlars@googlemail.com
- Web: https://cyclecad.com
- GitHub: https://github.com/vvlars-cmd/cyclecad
