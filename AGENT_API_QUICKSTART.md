# cycleCAD Agent API — Quick Start Guide

## 🚀 Get Started in 30 Seconds

### Step 1: Open cycleCAD
Go to `http://localhost:3000/app/` (or your deployment URL)

### Step 2: Click the 🤖 Agent Button
In the toolbar, click the **"Agent"** button (robot emoji)

### Step 3: Type a Command
In the input field, paste this JSON:
```json
{ "method": "meta.ping", "params": {} }
```

### Step 4: Hit Enter
Result appears:
```json
{ "ok": true, "result": { "pong": true, "timestamp": 1711270000000, "session": "..." } }
```

**Done!** The Agent API is working.

---

## 📝 Common Commands

### Test API Health
```json
{ "method": "meta.ping", "params": {} }
```

### Get All Available Commands
```json
{ "method": "meta.schema", "params": {} }
```

### Create a Simple Box
```json
{ "method": "ops.primitive", "params": { "shape": "box", "width": 50, "height": 30, "depth": 20 } }
```

### Draw & Extrude a Sketch
```json
{ "method": "sketch.start", "params": { "plane": "XY" } }
{ "method": "sketch.rect", "params": { "width": 80, "height": 40 } }
{ "method": "ops.extrude", "params": { "height": 10, "material": "steel" } }
{ "method": "sketch.end", "params": {} }
```

### Check if Part is 3D Printable
```json
{ "method": "validate.printability", "params": { "target": "extrude_1", "process": "FDM" } }
```

### Export to STL
```json
{ "method": "export.stl", "params": { "filename": "bracket.stl", "binary": true } }
```

---

## 🧪 Run Test Suite

Open two tabs:
1. **Tab A**: `http://localhost:3000/app/`
2. **Tab B**: `http://localhost:3000/app/agent-test.html`

Click any "Run" button to test that API command.

---

## 💻 Console Usage (Advanced)

For developers, run commands directly in browser console (F12):

```javascript
// Check if API is ready
window.cycleCAD

// Ping
window.cycleCAD.execute({ method: 'meta.ping', params: {} })

// Create a model in one shot
window.cycleCAD.executeMany([
  { method: 'sketch.start', params: { plane: 'XY' } },
  { method: 'sketch.circle', params: { radius: 20 } },
  { method: 'ops.extrude', params: { height: 15 } },
])

// Get results
window.cycleCAD.getState()
```

---

## 🎯 Design Workflow Example

### Build a Washer (Ring with Hole)

**Step 1**: Draw the profile
```json
{ "method": "sketch.start", "params": { "plane": "XY" } }
```

**Step 2**: Draw outer circle
```json
{ "method": "sketch.circle", "params": { "cx": 0, "cy": 0, "radius": 25 } }
```

**Step 3**: Draw inner hole circle
```json
{ "method": "sketch.circle", "params": { "cx": 0, "cy": 0, "radius": 10 } }
```

**Step 4**: Extrude to make 3D
```json
{ "method": "ops.extrude", "params": { "height": 3, "material": "steel" } }
```

**Step 5**: End sketch
```json
{ "method": "sketch.end", "params": {} }
```

**Step 6**: Check if it's printable
```json
{ "method": "validate.printability", "params": { "target": "extrude_1", "process": "FDM" } }
```

**Step 7**: Estimate cost
```json
{ "method": "validate.cost", "params": { "target": "extrude_1", "process": "FDM", "material": "PLA" } }
```

**Step 8**: Export
```json
{ "method": "export.stl", "params": { "filename": "washer.stl", "binary": true } }
```

---

## 📚 API Basics

### Command Structure
```json
{
  "method": "namespace.command",
  "params": {
    "param1": "value1",
    "param2": 123
  }
}
```

### Response Structure
```json
{
  "ok": true,
  "result": { ... },
  "elapsed": 45
}
```

Or on error:
```json
{
  "ok": false,
  "error": "Feature not found"
}
```

---

## 🔥 Cheat Sheet

| What | Command |
|------|---------|
| **Health check** | `meta.ping` |
| **Get schema** | `meta.schema` |
| **List all features** | `query.features` |
| **Start 2D sketch** | `sketch.start` |
| **Draw rectangle** | `sketch.rect` |
| **Draw circle** | `sketch.circle` |
| **Make 3D (extrude)** | `ops.extrude` |
| **Change view** | `view.set` |
| **Check design** | `validate.designReview` |
| **Check printability** | `validate.printability` |
| **Estimate cost** | `validate.cost` |
| **Export STL** | `export.stl` |

---

## ❓ FAQ

### Q: Is the API ready to use?
**A**: Yes! All 55 commands are wired and tested. Click 🤖 Agent in toolbar.

### Q: Can I use this with Claude/GPT/Gemini?
**A**: Yes! Pass these JSON commands to the LLM. It can design CAD models and call the API via `window.cycleCAD.execute()`.

### Q: What if a command fails?
**A**: Check the error message in the result. Most operations have fallbacks (e.g., booleans use mesh approximations if real CSG fails).

### Q: How do I know what commands exist?
**A**: Run `meta.schema` to get the full API documentation with all 10 namespaces and 55 commands.

### Q: Can I chain multiple commands?
**A**: Yes! Use `executeMany()`:
```javascript
window.cycleCAD.executeMany([
  { method: 'sketch.start', ... },
  { method: 'sketch.rect', ... },
  { method: 'ops.extrude', ... },
])
```

### Q: Does it support STEP import/export?
**A**: Not yet (requires OpenCascade.js integration). STL, OBJ, glTF, and JSON are fully supported.

### Q: Can I undo/redo programmatically?
**A**: History is managed in `APP.history`. Agents should create new features rather than modifying existing ones.

---

## 🚨 Troubleshooting

### Agent Panel Not Visible
- Check if toolbar loaded correctly
- Look for 🤖 button in toolbar
- If missing, hard refresh the page (Ctrl+F5)

### Commands Timeout
- Check browser console (F12) for errors
- Make sure cycleCAD app is fully initialized (look for "Ready" status)
- Try a simple command first: `meta.ping`

### Module Not Found Errors
- Check that all imports in `index.html` are successful
- Look at browser Network tab for failed requests
- Clear cache and reload

### Blank Results
- Some commands need features to exist first
- Start with: `sketch.start` → `sketch.rect` → `ops.extrude`
- Then run `query.features` to see what was created

---

## 📖 Full Documentation

See `AGENT_API_WIRING.md` for:
- Complete architecture details
- All 55 command specifications
- Error handling strategies
- Material presets and densities
- Cost & weight estimation formulas
- Design review scoring system

---

## 🎓 Learning Path

1. **Beginner**: Run `meta.ping` to confirm API works
2. **Novice**: Try the test suite at `/app/agent-test.html`
3. **Intermediate**: Copy/paste commands from the quick reference above
4. **Advanced**: Build custom workflows by chaining commands
5. **Expert**: Integrate with LLM agents (Claude, GPT, etc.)

---

## ⚡ Pro Tips

**Tip 1**: Store feature IDs for later reference
```json
{ "method": "ops.extrude", "params": { "height": 10 } }
// Returns: { "ok": true, "result": { "id": "extrude_1", ... } }
// Use "extrude_1" in future commands like fillet/chamfer
```

**Tip 2**: Query before operating
```json
{ "method": "query.features", "params": {} }
// See what exists, then modify it
```

**Tip 3**: Always validate before exporting
```json
{ "method": "validate.designReview", "params": { "target": "extrude_1" } }
// Check for errors (F), warnings (B/C), or passes (A)
{ "method": "export.stl", "params": { "filename": "part.stl" } }
```

**Tip 4**: Use snapshots for visual feedback
```json
{ "method": "render.snapshot", "params": { "width": 800, "height": 600 } }
// Returns PNG as base64 dataURL
```

---

## 🤝 Getting Help

- **API Errors**: Check the error message in the response
- **Commands Hang**: Check browser console for JavaScript errors
- **Documentation**: See `AGENT_API_WIRING.md` for details
- **Test Suite**: Use `/app/agent-test.html` to verify each command works

---

## 🎉 You're Ready!

The Agent API is fully wired. Start designing with `window.cycleCAD.execute()` or use the 🤖 Agent panel in the toolbar.

**Happy designing!** 🚀
