# cycleCAD MCP Server — Quick Start

## 30-Second Setup

```bash
# Terminal 1: Start cycleCAD web server
npm start

# Terminal 2: Start MCP server
npm run mcp
```

Done! The server is now ready to receive MCP requests from Claude.

## Integration with Claude

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=2048,
    tools=[{
        "type": "model_context_protocol",
        "name": "cyclecad-mcp",
        "uri": "stdio:///absolute/path/to/cyclecad/bin/cyclecad-mcp"
    }],
    messages=[{
        "role": "user",
        "content": "Design a bracket: 80x40mm rectangle, extrude 5mm, add a 3mm hole for a bolt"
    }]
)

print(response.content[0].text)
```

Claude will automatically call cycleCAD tools to design the part.

## What You Can Do

### Ask Claude to design parts
- "Create a cylinder 50mm diameter, 100mm tall"
- "Design a bracket: 80x40mm, 5mm thick, with a hole"
- "Make a spring with 10mm radius, 20mm height, 5 turns"

### Ask Claude to analyze designs
- "Is this part printable with FDM?"
- "What's the weight if made from aluminum?"
- "Check the design for manufacturing issues"

### Ask Claude to modify designs
- "Add a 2mm fillet to all edges"
- "Chamfer the corners by 1mm"
- "Create 3 copies of this in a 10mm grid"

### Ask Claude to export
- "Export as STL for 3D printing"
- "Save as OBJ for rendering"
- "Export as glTF for web viewing"

## Debug Mode

```bash
# See all requests and responses
DEBUG_MCP=1 npm run mcp

# Or
npx cyclecad-mcp --debug
```

## Configuration

```bash
# Custom cycleCAD server URL
npx cyclecad-mcp --ws-url ws://10.0.0.1:3000/api/ws

# Custom HTTP fallback URL
npx cyclecad-mcp --http-url http://10.0.0.1:3000/api/execute
```

## All Tools (55+)

**Sketch** (8): start, end, line, rect, circle, arc, clear, entities

**Design** (20): extrude, revolve, primitive, fillet, chamfer, boolean, shell, pattern, material, sweep, loft, spring, thread, bend

**Transform** (3): move, rotate, scale

**View** (4): set, fit, wireframe, grid

**Export** (4): stl, obj, gltf, json

**Validate** (8): dimensions, wallThickness, printability, cost, mass, surfaceArea, centerOfMass, designReview

**Render** (5): snapshot, multiview, highlight, hide, section

**Query** (5): features, bbox, materials, session, log

**Assembly** (4): addComponent, removeComponent, mate, explode

**AI** (3): identifyPart, suggestImprovements, estimateCostAI

**Meta** (5): ping, version, schema, modules, history

**Scene** (2): clear, snapshot

## Full Documentation

- **Complete Reference**: `docs/MCP-SERVER.md`
- **Implementation Details**: `IMPLEMENTATION.md`
- **Examples & Workflows**: (See examples in this file)

## Troubleshooting

**"Connection refused"**
- Make sure cycleCAD is running: `npm start`
- Check it's on localhost:3000: `curl http://localhost:3000`

**"WebSocket not available"**
- MCP server falls back to HTTP automatically
- No action needed

**"No response from cycleCAD"**
- cycleCAD may not be running or Agent API not accessible
- Commands are queued and will execute when cycleCAD connects
- Check `DEBUG_MCP=1 npm run mcp` for more info

**"Tool not found"**
- Tool names use underscores: `sketch_rect` not `sketch.rect`
- See list of all tools above

## Performance

- **Startup**: ~100ms
- **Tool invocation**: <50ms
- **Command execution**: Varies (depends on cycleCAD operation)
- **Memory**: ~50MB

## Architecture

```
You (write prompts)
    ↓
Claude API
    ↓
Claude calls cycleCAD tools via MCP
    ↓
MCP Server (cyclecad-mcp)
    ↓
cycleCAD (Three.js scene)
    ↓
Design output (STL, OBJ, glTF, or rendered)
```

## Environment Variables

```bash
CYCLECAD_WS_URL=ws://localhost:3000/api/ws
CYCLECAD_HTTP_URL=http://localhost:3000/api/execute
DEBUG_MCP=1  # Enable debug logging
```

## Next Steps

1. Start cycleCAD: `npm start`
2. Start MCP server: `npm run mcp`
3. Use with Claude API (see Integration section above)
4. Read full docs: `docs/MCP-SERVER.md`

## Example Interaction

**You to Claude:**
> "Design a simple bracket for mounting a motor. Make it 100x80mm base, 10mm thick, with 4 mounting holes (8mm diameter) spaced 10mm from the edges. Add 2mm fillets to all edges."

**Claude calls tools (automatically):**
1. `sketch.start` (XY plane)
2. `sketch.rect` (width: 100, height: 80)
3. `ops.extrude` (height: 10, material: aluminum)
4. `sketch.start` (XY plane)
5. `sketch.circle` (radius: 4, at each corner)
6. `ops.extrude` (height: 10)
7. `ops.boolean` (union) [x4 for each hole]
8. `ops.fillet` (radius: 2, all edges)
9. `validate.designReview` (check printability)
10. `export.stl` (filename: bracket.stl)

**Claude to you:**
> "I've designed a mounting bracket with the specifications you requested. It's 100x80mm with 10mm thickness, has 4 mounting holes at the corners with 2mm fillets on all edges. The design is optimized for 3D printing and the file has been exported as bracket.stl."

## Support

- **Issues**: https://github.com/vvlars-cmd/cyclecad/issues
- **Email**: vvlars@googlemail.com
- **Web**: https://cyclecad.com
