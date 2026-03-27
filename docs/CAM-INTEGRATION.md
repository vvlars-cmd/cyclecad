# CAM Pipeline Integration Guide

## Overview

The CAM Pipeline module (`app/js/cam-pipeline.js`) implements the complete manufacturing preparation workflow:

```
Slice → Nest → Toolpath → G-code → Export
```

Supported manufacturing processes:
- **FDM** (3D printing): Ender 3, Prusa MK4, Bambu X1
- **SLA** (resin printing): Elegoo Mars, Formlabs Form 3
- **CNC** (milling): Shapeoko, Nomad 3, Tormach PCNC
- **Laser** (cutting/engraving): K40, xTool, Glowforge
- **SLS** (powder bed): Sinterit Lisa

## Module Size

- **840 lines** of ES6 JavaScript
- **30 KB** uncompressed
- **0 dependencies** (uses only Three.js which is already loaded)
- Full-featured: 11 APIs, 14 machine profiles, 10 tools, 14 materials

## API Reference

### window.cycleCAD.cam.slice(mesh, options)

Slice a 3D mesh into layers for 3D printing.

```javascript
const result = window.cycleCAD.cam.slice(mesh, {
  layerHeight: 0.2,        // 0.08-0.4 mm
  infill: 20,              // 0-100%
  shells: 2,               // 1-5 outer shells
  supportAngle: 45,        // Support overhang angle
  material: 'pla',         // Material type
  printer: 'ender3'        // Machine profile
});

// Returns:
// {
//   printer: "Creality Ender 3",
//   totalLayers: 125,
//   layerHeight: 0.2,
//   infill: 20,
//   shells: 2,
//   layers: [{index, z, paths}],
//   material: 'pla',
//   materialWeightG: 45,
//   materialCostEUR: 0.36,
//   estimatedTimeMinutes: 360,
//   estimatedTimeReadable: "6h 0m",
//   buildVolume: {x: 220, y: 220, z: 250},
//   fits: true,
//   gcode: "G28\nM104 S...",
//   gcodeLength: 2850
// }
```

### window.cycleCAD.cam.nest(parts, sheetSize, options)

Arrange 2D parts on a flat sheet for laser cutting or waterjet.

```javascript
const result = window.cycleCAD.cam.nest(
  [
    {id: 'part_a', width: 100, height: 50, quantity: 3},
    {id: 'part_b', width: 80, height: 120, quantity: 2}
  ],
  {width: 1000, height: 500},
  {spacing: 2, rotation: 'auto'}
);

// Returns:
// {
//   sheetSize: {width: 1000, height: 500},
//   placements: [
//     {partId: "part_a", x: 0, y: 0, width: 100, height: 50, rotation: 0},
//     ...
//   ],
//   totalParts: 5,
//   usedArea: 41000,
//   utilizationPercent: 82,
//   wastePercent: 18,
//   nestingScore: "A",
//   svg: "<svg>...</svg>"
// }
```

### window.cycleCAD.cam.toolpath(mesh, options)

Generate CNC cutting or milling paths.

```javascript
const result = window.cycleCAD.cam.toolpath(mesh, {
  tool: 't_6mm_flat',     // Tool from library
  strategy: 'contour',    // 'contour' | 'pocket' | 'drilling'
  depthPerPass: 5,        // mm
  feedRate: 600,          // mm/min
  spindle: 1000,          // RPM
  machine: 'shapeoko'
});

// Returns:
// {
//   machine: "Shapeoko 5",
//   tool: "6mm Flat End Mill",
//   strategy: "contour",
//   depthPerPass: 5,
//   feedRate: 600,
//   spindle: 1000,
//   passes: 4,
//   paths: [{type, z, length, feed}],
//   totalLength: 1250,
//   estimatedTimeMinutes: 45,
//   fits: true,
//   gcode: "G90\nG94\nM3...",
//   gcodeLength: 1820
// }
```

### window.cycleCAD.cam.exportGcode(gcode, filename)

Download G-code to file.

```javascript
window.cycleCAD.cam.exportGcode(result.gcode, 'part_001.gcode');
// Triggers download
```

### window.cycleCAD.cam.compareCosts(mesh, options)

Compare costs across all manufacturing processes.

```javascript
const result = window.cycleCAD.cam.compareCosts(mesh, {material: 'pla'});

// Returns:
// {
//   volumeCm3: 45.2,
//   material: "pla",
//   processes: [
//     {
//       rank: 1,
//       process: "FDM 3D Print",
//       materialCost: 0.36,
//       machineCost: 0.90,
//       setupCost: 0,
//       totalCost: 1.26,
//       timeMinutes: 360,
//       pros: ["Low cost", ...],
//       cons: ["Layer lines", ...]
//     },
//     {
//       rank: 2,
//       process: "Laser Cut (Acrylic)",
//       totalCost: 7.45,
//       ...
//     },
//     ...
//   ]
// }
```

### window.cycleCAD.cam.estimate(mesh, options)

Get time and cost for a specific process.

```javascript
const result = window.cycleCAD.cam.estimate(mesh, {
  process: 'FDM',        // 'FDM' | 'CNC' | 'SLA'
  material: 'pla',
  machine: 'ender3',
  quantity: 1
});

// Returns:
// {
//   process: "FDM 3D Printing",
//   machine: "Creality Ender 3",
//   volumeCm3: 45.2,
//   material: "pla",
//   materialWeight: 56.1,
//   materialCost: 0.45,
//   machineTime: 380,
//   machineCost: 1.90,
//   setupCost: 0,
//   totalPerUnit: 2.35,
//   totalBatch: 2.35,
//   timeMinutesReadable: "6h 20m",
//   currency: "EUR"
// }
```

### window.cycleCAD.cam.getMachines()

List all available machines.

```javascript
const machines = window.cycleCAD.cam.getMachines();
// Returns:
// [
//   {id: 'ender3', name: 'Creality Ender 3', type: 'FDM', buildVolume: {...}, ...},
//   {id: 'prusa_mk4', ...},
//   ...
// ]
```

### window.cycleCAD.cam.getTools()

List all CNC tools.

```javascript
const tools = window.cycleCAD.cam.getTools();
// Returns:
// [
//   {id: 't_2mm_flat', name: '2mm Flat End Mill', diameter: 2, ...},
//   ...
// ]
```

### window.cycleCAD.cam.getMaterials()

List all materials with densities and costs.

```javascript
const materials = window.cycleCAD.cam.getMaterials();
// Returns:
// {
//   materials: [
//     {name: 'pla', density: 1.24, costPerKg: 8.00},
//     {name: 'steel', density: 7.85, costPerKg: 0.50},
//     ...
//   ]
// }
```

## Integration into app/index.html

### 1. Import the module

Add to the `<head>` or at the top of the app script:

```html
<script type="module">
  import camAPI from './app/js/cam-pipeline.js';
  // camAPI is now available, and window.cycleCAD.cam is set
</script>
```

### 2. Add CAM UI Panel (optional)

Create a new panel in the app with tabs for each operation:

```html
<div id="cam-panel" class="panel" style="display:none;">
  <div class="panel-header">
    <h3>CAM Pipeline</h3>
    <button class="close-btn" data-close-panel="cam-panel">×</button>
  </div>
  <div class="panel-tabs">
    <button class="tab-btn active" onclick="switchCamTab('slice')">Slice</button>
    <button class="tab-btn" onclick="switchCamTab('nest')">Nest</button>
    <button class="tab-btn" onclick="switchCamTab('toolpath')">Toolpath</button>
    <button class="tab-btn" onclick="switchCamTab('estimate')">Estimate</button>
  </div>

  <!-- Slice Tab -->
  <div id="cam-slice-tab" class="cam-tab active" style="display:block;">
    <label>Printer: <select id="cam-printer">
      <option value="ender3">Creality Ender 3</option>
      <option value="prusa_mk4">Prusa MK4</option>
      <option value="bambu_x1">Bambu Lab X1</option>
    </select></label>
    <label>Layer Height (mm): <input type="number" id="cam-layer-height" value="0.2" min="0.08" max="0.4" step="0.05"/></label>
    <label>Infill (%): <input type="number" id="cam-infill" value="20" min="0" max="100"/></label>
    <label>Material: <select id="cam-material">
      <option value="pla">PLA</option>
      <option value="petg">PETG</option>
      <option value="abs">ABS</option>
      <option value="nylon">Nylon</option>
    </select></label>
    <button onclick="camSlice()">Slice & Generate G-code</button>
    <div id="cam-slice-result"></div>
  </div>

  <!-- Nest Tab -->
  <div id="cam-nest-tab" class="cam-tab" style="display:none;">
    <label>Sheet Width (mm): <input type="number" id="cam-sheet-width" value="1000"/></label>
    <label>Sheet Height (mm): <input type="number" id="cam-sheet-height" value="500"/></label>
    <label>Spacing (mm): <input type="number" id="cam-spacing" value="2"/></label>
    <button onclick="camNest()">Nest Parts</button>
    <div id="cam-nest-result"></div>
  </div>

  <!-- Toolpath Tab -->
  <div id="cam-toolpath-tab" class="cam-tab" style="display:none;">
    <label>Machine: <select id="cam-machine">
      <option value="shapeoko">Shapeoko 5</option>
      <option value="nomad3">Nomad 3</option>
      <option value="tormach_pcnc">Tormach PCNC</option>
    </select></label>
    <label>Tool: <select id="cam-tool">
      <option value="t_6mm_flat">6mm Flat End Mill</option>
      <option value="t_3mm_ball">3mm Ball End Mill</option>
      <option value="t_10mm_flat">10mm Flat End Mill</option>
    </select></label>
    <label>Strategy: <select id="cam-strategy">
      <option value="contour">Contour</option>
      <option value="pocket">Pocket</option>
      <option value="drilling">Drilling</option>
    </select></label>
    <label>Feed Rate (mm/min): <input type="number" id="cam-feed-rate" value="600"/></label>
    <button onclick="camToolpath()">Generate Toolpath</button>
    <div id="cam-toolpath-result"></div>
  </div>

  <!-- Estimate Tab -->
  <div id="cam-estimate-tab" class="cam-tab" style="display:none;">
    <label>Process: <select id="cam-process">
      <option value="FDM">FDM</option>
      <option value="CNC">CNC</option>
      <option value="SLA">SLA</option>
    </select></label>
    <label>Quantity: <input type="number" id="cam-quantity" value="1"/></label>
    <button onclick="camCompare()">Compare All Processes</button>
    <button onclick="camEstimate()">Get Estimate</button>
    <div id="cam-estimate-result"></div>
  </div>
</div>

<style>
#cam-panel {
  position: fixed;
  right: 0;
  bottom: 60px;
  width: 350px;
  max-height: 600px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
}

#cam-panel .panel-header {
  padding: 12px;
  background: #f8f8f8;
  border-bottom: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#cam-panel h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

#cam-panel .panel-tabs {
  display: flex;
  border-bottom: 1px solid #ddd;
  background: #fafafa;
}

#cam-panel .tab-btn {
  flex: 1;
  padding: 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 12px;
  color: #666;
}

#cam-panel .tab-btn.active {
  border-bottom-color: #d97706;
  color: #d97706;
  font-weight: 600;
}

#cam-panel .cam-tab {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
}

#cam-panel label {
  display: block;
  margin: 8px 0;
  font-size: 12px;
  color: #333;
}

#cam-panel input,
#cam-panel select {
  width: 100%;
  padding: 6px;
  margin-top: 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
}

#cam-panel button {
  width: 100%;
  padding: 8px;
  margin: 10px 0;
  background: #d97706;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

#cam-panel button:hover {
  background: #b45309;
}

#cam-slice-result,
#cam-nest-result,
#cam-toolpath-result,
#cam-estimate-result {
  margin-top: 12px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  color: #333;
  max-height: 300px;
  overflow-y: auto;
}
</style>

<script>
function switchCamTab(tabName) {
  document.querySelectorAll('.cam-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('cam-' + tabName + '-tab').style.display = 'block';
  event.target.classList.add('active');
}

function camSlice() {
  const selectedMesh = window._selectedMesh || window.allParts?.[0];
  if (!selectedMesh) {
    alert('No mesh selected');
    return;
  }

  const result = window.cycleCAD.cam.slice(selectedMesh, {
    layerHeight: parseFloat(document.getElementById('cam-layer-height').value),
    infill: parseInt(document.getElementById('cam-infill').value),
    material: document.getElementById('cam-material').value,
    printer: document.getElementById('cam-printer').value
  });

  const html = `
    <strong>${result.printer}</strong><br/>
    Layers: ${result.totalLayers}<br/>
    Material: ${result.materialWeightG}g (€${result.materialCostEUR})<br/>
    Time: ${result.estimatedTimeReadable}<br/>
    Build Volume: ${result.buildVolume.x}×${result.buildVolume.y}×${result.buildVolume.z}mm<br/>
    Fits: ${result.fits ? '✓' : '✗'}<br/>
    <button onclick="window.cycleCAD.cam.exportGcode('${result.gcode.replace(/'/g, "\\'")}', '${Date.now()}.gcode')">Download G-code</button>
  `;
  document.getElementById('cam-slice-result').innerHTML = html;
}

function camNest() {
  // Placeholder — needs part data
  alert('Nesting feature requires part data. See documentation.');
}

function camToolpath() {
  const selectedMesh = window._selectedMesh || window.allParts?.[0];
  if (!selectedMesh) {
    alert('No mesh selected');
    return;
  }

  const result = window.cycleCAD.cam.toolpath(selectedMesh, {
    tool: document.getElementById('cam-tool').value,
    strategy: document.getElementById('cam-strategy').value,
    feedRate: parseInt(document.getElementById('cam-feed-rate').value),
    machine: document.getElementById('cam-machine').value
  });

  const html = `
    <strong>${result.machine}</strong><br/>
    Tool: ${result.tool}<br/>
    Strategy: ${result.strategy}<br/>
    Passes: ${result.passes}<br/>
    Path Length: ${result.totalLength}mm<br/>
    Time: ${result.estimatedTimeReadable}<br/>
    Fits: ${result.fits ? '✓' : '✗'}<br/>
    <button onclick="window.cycleCAD.cam.exportGcode('${result.gcode.replace(/'/g, "\\'")}', '${Date.now()}.nc')">Download G-code</button>
  `;
  document.getElementById('cam-toolpath-result').innerHTML = html;
}

function camEstimate() {
  const selectedMesh = window._selectedMesh || window.allParts?.[0];
  if (!selectedMesh) {
    alert('No mesh selected');
    return;
  }

  const result = window.cycleCAD.cam.estimate(selectedMesh, {
    process: document.getElementById('cam-process').value,
    quantity: parseInt(document.getElementById('cam-quantity').value)
  });

  const html = `
    <strong>${result.process}</strong><br/>
    Machine: ${result.machine}<br/>
    Volume: ${result.volumeCm3} cm³<br/>
    Material Cost: €${result.materialCost}<br/>
    Machine Cost: €${result.machineCost}<br/>
    Total per Unit: €${result.totalPerUnit}<br/>
    Total Batch (×${result.quantity}): €${result.totalBatch}<br/>
    Time: ${result.timeMinutesReadable}
  `;
  document.getElementById('cam-estimate-result').innerHTML = html;
}

function camCompare() {
  const selectedMesh = window._selectedMesh || window.allParts?.[0];
  if (!selectedMesh) {
    alert('No mesh selected');
    return;
  }

  const result = window.cycleCAD.cam.compareCosts(selectedMesh, {material: 'pla'});

  let html = `<strong>Cost Comparison</strong><br/>Volume: ${result.volumeCm3} cm³<br/><br/>`;
  result.processes.forEach(p => {
    html += `
      <strong>${p.rank}. ${p.process}</strong><br/>
      Total: €${p.totalCost} | Time: ${p.timeMinutes}min<br/>
      ${p.costPerUnit ? `Per Unit: €${p.costPerUnit}<br/>` : ''}
      Pros: ${p.pros.join(', ')}<br/>
      <br/>
    `;
  });

  document.getElementById('cam-estimate-result').innerHTML = html;
}
</script>
```

## Usage from Agent API

The CAM module is automatically registered as `window.cycleCAD.cam` and can be called from agent commands:

```javascript
// From agent-api.js:
'cam.slice': async ({ printer, layerHeight, infill, material }) => {
  const mesh = getSelectedMesh(); // Assuming available
  return window.cycleCAD.cam.slice(mesh, { printer, layerHeight, infill, material });
}
```

## Testing

```javascript
// In browser console:
const mesh = window.allParts[0]; // Get a part
const result = window.cycleCAD.cam.slice(mesh, {
  printer: 'ender3',
  layerHeight: 0.2,
  infill: 20
});
console.log(result);

// Download G-code
window.cycleCAD.cam.exportGcode(result.gcode, 'test.gcode');
```

## Feature Coverage

| Feature | Status | Details |
|---------|--------|---------|
| FDM Slicing | ✅ | 3 printer profiles, realistic time estimation |
| G-code Generation | ✅ | Simplified but valid for most slicers |
| Cost Estimation | ✅ | Material + machine time pricing |
| 2D Nesting | ✅ | Bottom-left packing algorithm |
| CNC Toolpath | ✅ | 3 strategies, 10 tools, realistic feed rates |
| SLA Printing | ✅ | Elegoo, Formlabs profiles |
| Laser Cutting | ✅ | K40, xTool, Glowforge profiles |
| Cost Comparison | ✅ | FDM vs CNC vs SLA vs Laser vs Injection |
| SVG Export | ✅ | Nesting visualization |

## Notes

- G-code output is simplified and intended for preview/testing
- For production, recommend using dedicated slicers (Cura, PrusaSlicer, Fusion 360 CAM)
- Material costs are averages and vary by supplier
- Machine profiles are based on official specs
- Nesting algorithm is greedy (not optimal); for production use dedicated nesting software

---

**Module created by Claude Code on 2026-03-26. Slide 10 implementation: "Prepare — Slice / Nest / Toolpath / G-code Generation."**
