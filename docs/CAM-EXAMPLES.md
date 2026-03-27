# CAM Pipeline Examples & Testing

## Quick Start

### 1. Basic FDM Slicing

```javascript
// Get a mesh from the 3D viewport
const mesh = window.allParts[0];

// Slice for FDM printing
const result = window.cycleCAD.cam.slice(mesh, {
  printer: 'ender3',
  layerHeight: 0.2,
  infill: 20,
  shells: 2,
  material: 'pla'
});

console.log(result);
// Output:
// {
//   printer: "Creality Ender 3",
//   totalLayers: 150,
//   layerHeight: 0.2,
//   infill: 20,
//   shells: 2,
//   material: "pla",
//   materialWeightG: 45,
//   materialCostEUR: 0.36,
//   estimatedTimeMinutes: 360,
//   estimatedTimeReadable: "6h 0m",
//   buildVolume: {x: 220, y: 220, z: 250},
//   fits: true,
//   gcode: "G28\nM104 S210\n...",
//   gcodeLength: 2850
// }

// Download the G-code
window.cycleCAD.cam.exportGcode(result.gcode, 'part_001.gcode');
```

### 2. High-Detail SLA Printing

```javascript
const mesh = window.allParts[2];

const result = window.cycleCAD.cam.slice(mesh, {
  printer: 'formlabs_form3',
  layerHeight: 0.025,  // 25 microns for detail
  material: 'resin'
});

console.log(`${result.estimatedTimeReadable} to print ${result.materialWeightG}g`);
// Output: "2h 15m to print 12g"
```

### 3. CNC Machining Path

```javascript
const mesh = window.allParts[5];

const result = window.cycleCAD.cam.toolpath(mesh, {
  machine: 'shapeoko',
  tool: 't_6mm_flat',
  strategy: 'contour',
  depthPerPass: 5,
  feedRate: 600,
  spindle: 2000
});

console.log(`Estimated time: ${result.estimatedTimeReadable}`);
console.log(`Tool: ${result.tool}`);
console.log(`Fits in build volume: ${result.fits}`);

// Download G-code for CNC
window.cycleCAD.cam.exportGcode(result.gcode, 'mill_001.nc');
```

### 4. Cost Comparison

```javascript
const mesh = window.allParts[0];

// Compare all manufacturing methods
const comparison = window.cycleCAD.cam.compareCosts(mesh);

// Log top 3 cheapest
comparison.processes.slice(0, 3).forEach(p => {
  console.log(`${p.process}: €${p.totalCost} (${p.timeMinutes}min)`);
});

// Output:
// FDM 3D Print: €1.26 (360min)
// Laser Cut (Acrylic): €7.45 (12min)
// SLA Resin Print: €8.20 (135min)
```

### 5. Detailed Cost Breakdown

```javascript
const mesh = window.allParts[0];

const estimate = window.cycleCAD.cam.estimate(mesh, {
  process: 'CNC',
  material: 'aluminum',
  machine: 'nomad3',
  quantity: 5
});

console.log(`Process: ${estimate.process}`);
console.log(`Machine: ${estimate.machine}`);
console.log(`Material: ${estimate.material}`);
console.log(`Weight per unit: ${estimate.materialWeight}g`);
console.log(`Material cost: €${estimate.materialCost}`);
console.log(`Machine time: ${estimate.machineTime}min`);
console.log(`Machine cost: €${estimate.machineCost}`);
console.log(`Cost per unit: €${estimate.totalPerUnit}`);
console.log(`Total batch (×${estimate.quantity}): €${estimate.totalBatch}`);

// Output:
// Process: CNC Machining
// Machine: Carbide 3D Nomad 3
// Material: Aluminum 6061
// Weight per unit: 120.5g
// Material cost: 0.14
// Machine time: 230min
// Machine cost: 22.50
// Cost per unit: 22.64
// Total batch (×5): 113.92
```

### 6. Batch Production Planning

```javascript
const mesh = window.allParts[3];

// Estimate cost for different batch sizes
for (const qty of [1, 5, 10, 50, 100]) {
  const est = window.cycleCAD.cam.estimate(mesh, {
    process: 'FDM',
    quantity: qty
  });
  console.log(`Qty ${qty}: €${est.totalBatch} total (€${(est.totalBatch/qty).toFixed(2)}/unit)`);
}

// Output:
// Qty 1: €2.35 total (€2.35/unit)
// Qty 5: €11.75 total (€2.35/unit)
// Qty 10: €23.50 total (€2.35/unit)
// Qty 50: €117.50 total (€2.35/unit)
// Qty 100: €235.00 total (€2.35/unit)
```

### 7. List Available Machines

```javascript
const machines = window.cycleCAD.cam.getMachines();

console.log('FDM Printers:');
machines.filter(m => m.type === 'FDM').forEach(m => {
  console.log(`  ${m.name} (${m.buildVolume.x}×${m.buildVolume.y}×${m.buildVolume.z}mm)`);
});

console.log('\nCNC Mills:');
machines.filter(m => m.type === 'CNC').forEach(m => {
  console.log(`  ${m.name} (${m.buildVolume.x}×${m.buildVolume.y}×${m.buildVolume.z}mm)`);
});

// Output:
// FDM Printers:
//   Creality Ender 3 (220×220×250mm)
//   Prusa MK4 (250×210×210mm)
//   Bambu Lab X1 (256×256×256mm)
//
// CNC Mills:
//   Shapeoko 5 (400×400×75mm)
//   Carbide 3D Nomad 3 (203×203×76mm)
//   Tormach PCNC 440 (432×279×305mm)
```

### 8. Check Build Volume Compatibility

```javascript
const mesh = window.allParts[4];

const sliceResult = window.cycleCAD.cam.slice(mesh, {
  printer: 'ender3',
  layerHeight: 0.2
});

if (!sliceResult.fits) {
  console.warn(`Part too large for Ender 3!`);
  console.warn(`Part size: ${sliceResult.buildVolume.x}×${sliceResult.buildVolume.y}×${sliceResult.buildVolume.z}mm`);

  // Try a larger printer
  const sliceResult2 = window.cycleCAD.cam.slice(mesh, {
    printer: 'bambu_x1',
    layerHeight: 0.2
  });
  console.log(`Bambu X1: ${sliceResult2.fits ? '✓ Fits' : '✗ Too large'}`);
}
```

## Advanced: Nesting for Sheet Cutting

```javascript
const parts = [
  { id: 'bracket_a', width: 100, height: 50, quantity: 4 },
  { id: 'plate_b', width: 80, height: 120, quantity: 2 },
  { id: 'spacer_c', width: 50, height: 30, quantity: 8 }
];

const nestResult = window.cycleCAD.cam.nest(parts, {
  width: 1000,
  height: 500
}, {
  spacing: 2
});

console.log(`Sheet utilization: ${nestResult.utilizationPercent}%`);
console.log(`Nesting score: ${nestResult.nestingScore}`);
console.log(`Placements: ${nestResult.placements.length}`);

// Show SVG preview
document.body.innerHTML += nestResult.svg;
```

## Batch Testing Script

```javascript
// Test all printers for a given mesh
async function testAllPrinters(mesh) {
  const machines = window.cycleCAD.cam.getMachines();
  const printers = machines.filter(m => m.type === 'FDM');

  console.log(`\n=== Testing ${mesh.name || 'mesh'} on ${printers.length} FDM printers ===\n`);

  const results = [];
  for (const printer of printers) {
    try {
      const result = window.cycleCAD.cam.slice(mesh, {
        printer: printer.id,
        layerHeight: 0.2,
        material: 'pla'
      });
      results.push({
        printer: printer.name,
        time: result.estimatedTimeMinutes,
        weight: result.materialWeightG,
        cost: result.materialCostEUR,
        fits: result.fits
      });
    } catch (e) {
      console.error(`${printer.name}: ${e.message}`);
    }
  }

  // Sort by cost
  results.sort((a, b) => a.cost - b.cost);

  console.table(results);
  return results;
}

// Run test
const results = await testAllPrinters(window.allParts[0]);
```

## Integration with Agent API

If you've integrated the CAM module into agent-api.js:

```javascript
// Agent can request slicing
await window.cycleCAD.execute({
  method: 'cam.slice',
  params: {
    printer: 'ender3',
    layerHeight: 0.2,
    infill: 20,
    material: 'pla'
  }
});

// Agent can compare costs
await window.cycleCAD.execute({
  method: 'cam.compare',
  params: {
    material: 'pla'
  }
});

// Agent can get time estimates
await window.cycleCAD.execute({
  method: 'cam.estimate',
  params: {
    process: 'FDM',
    quantity: 10
  }
});
```

## Performance Notes

- **Slicing**: <100ms for simple meshes
- **Nesting**: <50ms for 10-20 parts
- **Toolpath generation**: <200ms for complex geometry
- **Cost comparison**: <50ms (all 5 processes)
- **G-code generation**: <500ms (creates ~2000-3000 lines)

All operations are synchronous and non-blocking.

## Troubleshooting

### "Property xxx is not available"

Some properties may not exist depending on mesh geometry quality:

```javascript
// Safe check
if (result.materialWeightG !== undefined) {
  console.log(`Weight: ${result.materialWeightG}g`);
}
```

### G-code not valid for my slicer

The generated G-code is simplified. For production:

1. Export as G-code from cycleCAD
2. Import into your preferred slicer (Cura, PrusaSlicer, etc.)
3. Re-slice with slicer-specific settings

### Nesting not optimal

The greedy bottom-left packing is fast but not optimal for complex shapes. For production cutting:

1. Use dedicated nesting software (Alphacut, Tru-Cut, etc.)
2. Or manual arrangement in CAD before exporting

---

**Last updated: 2026-03-26**
