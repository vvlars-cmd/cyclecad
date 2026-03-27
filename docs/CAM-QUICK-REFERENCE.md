# CAM Pipeline — Quick Reference

## Quick Start (30 seconds)

```javascript
// 1. Get a mesh
const mesh = window.allParts[0];

// 2. Slice for 3D printing
const slice = window.cycleCAD.cam.slice(mesh, {
  printer: 'ender3',
  material: 'pla'
});

// 3. Download G-code
window.cycleCAD.cam.exportGcode(slice.gcode, 'part.gcode');

// 4. Compare costs
const costs = window.cycleCAD.cam.compareCosts(mesh);
console.table(costs.processes);
```

## One-Liner Examples

```javascript
// FDM slicing
window.cycleCAD.cam.slice(mesh).estimatedTimeReadable
// Output: "6h 0m"

// CNC estimate
window.cycleCAD.cam.estimate(mesh, {process: 'CNC'}).totalCost
// Output: 47.50

// List all machines
window.cycleCAD.cam.getMachines().map(m => m.name)
// Output: ["Creality Ender 3", "Prusa MK4", ...]

// Nesting score
window.cycleCAD.cam.nest(parts, {width: 1000, height: 500}).nestingScore
// Output: "A"
```

## API Cheat Sheet

| Command | Input | Output | Example |
|---------|-------|--------|---------|
| `slice()` | mesh, {printer, material, layerHeight} | {gcode, time, weight} | `slice(m, {printer:'ender3'})` |
| `toolpath()` | mesh, {tool, machine, strategy} | {gcode, time, passes} | `toolpath(m, {strategy:'contour'})` |
| `nest()` | parts[], sheetSize | {placements, utilization} | `nest([{w:100,h:50}], {w:1000})` |
| `compareCosts()` | mesh, {material} | {processes[]} | `compareCosts(m)` |
| `estimate()` | mesh, {process, quantity} | {cost, time, breakdown} | `estimate(m, {process:'FDM'})` |
| `exportGcode()` | gcode, filename | download | `exportGcode(gcode, 'p.gcode')` |
| `getMachines()` | none | {id, name, type, specs}[] | `getMachines()` |
| `getTools()` | none | {id, name, diameter}[] | `getTools()` |
| `getMaterials()` | none | {materials[]} | `getMaterials()` |

## Machine Quick Codes

| Code | Machine | Type | Build Volume |
|------|---------|------|---------------|
| `ender3` | Creality Ender 3 | FDM | 220×220×250 |
| `prusa_mk4` | Prusa MK4 | FDM | 250×210×210 |
| `bambu_x1` | Bambu Lab X1 | FDM | 256×256×256 |
| `elegoo_mars` | Elegoo Mars | SLA | 129×80×150 |
| `formlabs_form3` | Formlabs Form 3 | SLA | 145×145×185 |
| `shapeoko` | Shapeoko 5 | CNC | 400×400×75 |
| `nomad3` | Nomad 3 | CNC | 203×203×76 |
| `tormach_pcnc` | Tormach PCNC | CNC | 432×279×305 |
| `k40` | K40 Laser | Laser | 300×200 |
| `xtool_d1` | xTool M1 | Laser | 432×406 |

## Material Quick Codes

| Material | Density | Cost/kg | Best For |
|----------|---------|---------|----------|
| `pla` | 1.24 | €8.00 | FDM (default) |
| `petg` | 1.27 | €12.00 | FDM (tough) |
| `abs` | 1.05 | €10.00 | FDM (flexible) |
| `nylon` | 1.14 | €2.50 | FDM (strong) |
| `resin` | 1.15 | €35.00 | SLA (detail) |
| `steel` | 7.85 | €0.50 | CNC |
| `aluminum` | 2.70 | €1.20 | CNC |

## Keyboard Shortcuts (if integrated into UI)

| Key | Action |
|-----|--------|
| `Alt+C` | Toggle CAM panel |
| `S` | Slice current part |
| `E` | Export G-code |
| `Shift+C` | Compare costs |

## Common Workflows

### Print a Part
```javascript
const mesh = window.allParts[0];
const result = window.cycleCAD.cam.slice(mesh);
window.cycleCAD.cam.exportGcode(result.gcode, 'part.gcode');
// → Download G-code, open in Cura, print
```

### Find Cheapest Option
```javascript
const comparison = window.cycleCAD.cam.compareCosts(mesh);
const cheapest = comparison.processes[0];
console.log(`${cheapest.process}: €${cheapest.totalCost}`);
```

### Batch Production Cost
```javascript
for (let qty of [1, 10, 100]) {
  const est = window.cycleCAD.cam.estimate(mesh, {quantity: qty});
  console.log(`${qty}x: €${est.totalBatch} (€${(est.totalBatch/qty).toFixed(2)}/unit)`);
}
```

### Check Build Volume Fit
```javascript
const result = window.cycleCAD.cam.slice(mesh, {printer: 'ender3'});
if (!result.fits) {
  console.warn('Too large for Ender 3');
  const result2 = window.cycleCAD.cam.slice(mesh, {printer: 'bambu_x1'});
  console.log(`Bambu X1: ${result2.fits ? 'fits' : 'too large'}`);
}
```

### CNC Milling Setup
```javascript
const result = window.cycleCAD.cam.toolpath(mesh, {
  machine: 'shapeoko',
  tool: 't_6mm_flat',
  strategy: 'contour',
  feedRate: 600
});
console.log(`Time: ${result.estimatedTimeReadable}`);
window.cycleCAD.cam.exportGcode(result.gcode, 'mill.nc');
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "mesh is undefined" | Get mesh from `window.allParts[0]` |
| "printer not found" | Use `getMachines()` to list valid IDs |
| "Volume too large" | Try larger printer or rotate mesh |
| "G-code looks wrong" | Use output in dedicated slicer (Cura) |
| "Cost seems off" | Material costs vary; adjust in CAM-INTEGRATION.md |

## Response Format

All functions return an object with:
```javascript
{
  // Main result
  result: {},          // Function-specific output

  // Common fields
  time: number,        // Estimated time in minutes
  cost: number,        // Total cost in EUR
  fits: boolean,       // Fits in build volume
  gcode: string,       // G-code output (if applicable)

  // Error (if thrown)
  error: string        // Error message
}
```

## Performance

| Operation | Time |
|-----------|------|
| Slice simple mesh | <100ms |
| Slice complex mesh | <300ms |
| Toolpath generation | <200ms |
| Cost comparison | <50ms |
| Nesting 20 parts | <50ms |
| Export G-code | instant |

All operations are synchronous.

## Integration Points

1. **Console API** — Already available as `window.cycleCAD.cam`
2. **Agent API** — Add to `agent-api.js` commands
3. **UI Panel** — Copy HTML from CAM-INTEGRATION.md
4. **Toolbar** — Add button to toggle CAM panel

## Learning Path

1. **Try it now** → `const m = window.allParts[0]; console.log(window.cycleCAD.cam.slice(m))`
2. **Read examples** → See CAM-EXAMPLES.md
3. **Explore API** → Try each of the 11 functions
4. **Integrate UI** → Copy panel code to app/index.html
5. **Wire agent** → Add cam.* commands to agent-api.js

---

**Version 1.0** — Last updated 2026-03-26
