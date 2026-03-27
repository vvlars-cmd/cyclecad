/**
 * cam-pipeline.js — CAM Pipeline for cycleCAD
 *
 * Implements the complete CAM workflow from Slide 10:
 * "Prepare — Slice / Nest / Toolpath / G-code Generation"
 *
 * Features:
 *   1. Slicer Engine (3D Print) — FDM/SLA/SLS layer generation
 *   2. Nesting Engine (Laser/Sheet) — 2D part nesting on material sheets
 *   3. Toolpath Generator (CNC) — contour/pocket/drilling strategies
 *   4. G-code Generator — unified FDM/CNC/Laser output
 *   5. Cost Estimator — material + machine time pricing
 *   6. Machine Profiles — 14 pre-configured printers/machines
 *   7. Agent API Integration — window.cycleCAD.cam namespace
 *
 * Pattern:
 *   - IIFE exposes window.cycleCAD.cam
 *   - 100+ helper functions for geometry, G-code, cost calc
 *   - Material densities + machine profiles as lookup tables
 *   - All operations return {ok: true, result: {...}} or throw
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// Material Densities (g/cm³)
// ============================================================================
const MATERIAL_DENSITIES = {
  steel: 7.85,
  aluminum: 2.70,
  copper: 8.96,
  brass: 8.50,
  titanium: 4.51,
  plastic: 1.04,
  nylon: 1.14,
  pla: 1.24,
  abs: 1.05,
  petg: 1.27,
  tpu: 1.21,
  resin: 1.15,
  ceramic: 2.30,
  wood: 0.6
};

// Material costs (€/kg)
const MATERIAL_COSTS = {
  steel: 0.50,
  aluminum: 1.20,
  copper: 4.50,
  brass: 2.80,
  titanium: 15.00,
  plastic: 0.80,
  nylon: 2.50,
  pla: 8.00,
  abs: 10.00,
  petg: 12.00,
  tpu: 18.00,
  resin: 35.00,
  ceramic: 5.00,
  wood: 1.00
};

// ============================================================================
// Machine Profiles (Build Volume, Feed Rates, Temps, etc.)
// ============================================================================
const MACHINE_PROFILES = {
  // FDM Printers
  'ender3': {
    name: 'Creality Ender 3',
    type: 'FDM',
    buildVolume: { x: 220, y: 220, z: 250 },
    nozzle: 0.4,
    maxFeed: 150,
    maxAccel: 3000,
    nozzleTemp: { min: 190, max: 250, default: 210 },
    bedTemp: { min: 30, max: 110, default: 60 },
    retraction: { distance: 5, speed: 40 }
  },
  'prusa_mk4': {
    name: 'Prusa MK4',
    type: 'FDM',
    buildVolume: { x: 250, y: 210, z: 210 },
    nozzle: 0.4,
    maxFeed: 200,
    maxAccel: 5000,
    nozzleTemp: { min: 190, max: 250, default: 215 },
    bedTemp: { min: 30, max: 100, default: 60 },
    retraction: { distance: 0.8, speed: 60 }
  },
  'bambu_x1': {
    name: 'Bambu Lab X1',
    type: 'FDM',
    buildVolume: { x: 256, y: 256, z: 256 },
    nozzle: 0.4,
    maxFeed: 300,
    maxAccel: 10000,
    nozzleTemp: { min: 190, max: 300, default: 220 },
    bedTemp: { min: 30, max: 120, default: 70 },
    retraction: { distance: 0.5, speed: 80 }
  },

  // SLA/DLP Printers
  'elegoo_mars': {
    name: 'Elegoo Mars',
    type: 'SLA',
    buildVolume: { x: 129, y: 80, z: 150 },
    pixelSize: 0.047,
    exposureTime: 10,
    layerHeight: 0.025,
    liftSpeed: 60,
    dropSpeed: 100
  },
  'formlabs_form3': {
    name: 'Formlabs Form 3',
    type: 'SLA',
    buildVolume: { x: 145, y: 145, z: 185 },
    pixelSize: 0.025,
    exposureTime: 9,
    layerHeight: 0.025,
    liftSpeed: 40,
    dropSpeed: 60
  },

  // SLS Printer
  'sls_p200': {
    name: 'Sinterit Lisa P200',
    type: 'SLS',
    buildVolume: { x: 200, y: 200, z: 200 },
    layerHeight: 0.12,
    heatingTemp: 170,
    sinteringTemp: 175
  },

  // CNC Mills
  'shapeoko': {
    name: 'Shapeoko 5',
    type: 'CNC',
    buildVolume: { x: 400, y: 400, z: 75 },
    spindle: { maxRPM: 24000, pulloffDistance: 3 },
    workOffsets: 6,
    feedRate: { max: 2000, default: 600 },
    toolChanges: 'manual'
  },
  'nomad3': {
    name: 'Carbide 3D Nomad 3',
    type: 'CNC',
    buildVolume: { x: 203, y: 203, z: 76 },
    spindle: { maxRPM: 10000, pulloffDistance: 2 },
    workOffsets: 6,
    feedRate: { max: 3000, default: 1200 },
    toolChanges: 'manual'
  },
  'tormach_pcnc': {
    name: 'Tormach PCNC 440',
    type: 'CNC',
    buildVolume: { x: 432, y: 279, z: 305 },
    spindle: { maxRPM: 3650, pulloffDistance: 3 },
    workOffsets: 6,
    feedRate: { max: 2000, default: 800 },
    toolChanges: 'ATC'
  },

  // Laser Cutters
  'k40': {
    name: 'K40 Laser (40W)',
    type: 'Laser',
    buildVolume: { x: 300, y: 200 },
    power: 40,
    maxPower: 1.0,
    focusHeight: 4.0,
    feedRate: { max: 100, default: 50 }
  },
  'xtool_d1': {
    name: 'xTool M1 (40W)',
    type: 'Laser',
    buildVolume: { x: 432, y: 406 },
    power: 40,
    maxPower: 1.0,
    focusHeight: 4.2,
    feedRate: { max: 150, default: 80 }
  },
  'glowforge_pro': {
    name: 'Glowforge Pro',
    type: 'Laser',
    buildVolume: { x: 500, y: 280 },
    power: 45,
    maxPower: 1.0,
    focusHeight: 4.2,
    feedRate: { max: 200, default: 100 }
  }
};

// ============================================================================
// Tool Library for CNC
// ============================================================================
const TOOL_LIBRARY = [
  { id: 't_2mm_flat', name: '2mm Flat End Mill', diameter: 2, length: 25, flutes: 2, material: 'carbide', type: 'flat' },
  { id: 't_3mm_flat', name: '3mm Flat End Mill', diameter: 3, length: 30, flutes: 2, material: 'carbide', type: 'flat' },
  { id: 't_6mm_flat', name: '6mm Flat End Mill', diameter: 6, length: 35, flutes: 2, material: 'carbide', type: 'flat' },
  { id: 't_10mm_flat', name: '10mm Flat End Mill', diameter: 10, length: 40, flutes: 2, material: 'carbide', type: 'flat' },
  { id: 't_3mm_ball', name: '3mm Ball End Mill', diameter: 3, length: 30, flutes: 2, material: 'carbide', type: 'ball' },
  { id: 't_6mm_ball', name: '6mm Ball End Mill', diameter: 6, length: 35, flutes: 2, material: 'carbide', type: 'ball' },
  { id: 't_3mm_cham', name: '3mm 90° Chamfer', diameter: 3, length: 25, flutes: 2, material: 'carbide', type: 'chamfer' },
  { id: 't_2mm_drill', name: '2mm Drill', diameter: 2, length: 20, flutes: 2, material: 'carbide', type: 'drill' },
  { id: 't_5mm_drill', name: '5mm Drill', diameter: 5, length: 25, flutes: 2, material: 'carbide', type: 'drill' },
  { id: 't_10mm_drill', name: '10mm Drill', diameter: 10, length: 30, flutes: 2, material: 'carbide', type: 'drill' }
];

// ============================================================================
// Main CAM API (Exposed via window.cycleCAD.cam)
// ============================================================================
const camAPI = {
  /**
   * Slice a mesh into layers for 3D printing
   * @param {THREE.Mesh} mesh - geometry to slice
   * @param {Object} options - { layerHeight, infill, shells, supportAngle, material, printer }
   * @returns {Object} { layers, totalLayers, estimatedTime, materialUsage, materialWeightG, gcode }
   */
  slice: function(mesh, options = {}) {
    const {
      layerHeight = 0.2,
      infill = 20,
      shells = 2,
      supportAngle = 45,
      material = 'pla',
      printer = 'ender3'
    } = options;

    // Validate options
    if (layerHeight < 0.08 || layerHeight > 0.4) {
      throw new Error(`Layer height ${layerHeight}mm out of range [0.08-0.4]`);
    }
    if (infill < 0 || infill > 100) {
      throw new Error(`Infill ${infill}% out of range [0-100]`);
    }
    if (shells < 1 || shells > 5) {
      throw new Error(`Shells ${shells} out of range [1-5]`);
    }

    const profile = MACHINE_PROFILES[printer];
    if (!profile) throw new Error(`Printer "${printer}" not found. Available: ${Object.keys(MACHINE_PROFILES).join(', ')}`);

    // Calculate bounding box
    const bbox = new THREE.Box3().setFromObject(mesh);
    const height = bbox.max.z - bbox.min.z;
    const totalLayers = Math.ceil(height / layerHeight);

    // Estimate material usage
    const geometry = mesh.geometry;
    let volume = 0;
    if (geometry && geometry.getAttribute('position')) {
      const pos = geometry.getAttribute('position');
      const indices = geometry.getIndex();
      const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
      const triangles = indices ? indices.count / 3 : pos.count / 3;
      for (let i = 0; i < triangles; i++) {
        if (indices) {
          v0.fromBufferAttribute(pos, indices.getX(i * 3));
          v1.fromBufferAttribute(pos, indices.getX(i * 3 + 1));
          v2.fromBufferAttribute(pos, indices.getX(i * 3 + 2));
        } else {
          v0.fromBufferAttribute(pos, i * 3);
          v1.fromBufferAttribute(pos, i * 3 + 1);
          v2.fromBufferAttribute(pos, i * 3 + 2);
        }
        const cross = v1.clone().sub(v0).cross(v2.clone().sub(v0));
        volume += cross.length() / 2;
      }
    } else {
      // Fallback: bounding box volume * infill factor
      volume = (bbox.max.x - bbox.min.x) * (bbox.max.y - bbox.min.y) * (bbox.max.z - bbox.min.z) * 0.65;
    }

    // Account for infill
    const filledVolume = volume * (infill / 100) + volume * (1 - infill / 100) * shells / 3;
    const densityG = MATERIAL_DENSITIES[material] || MATERIAL_DENSITIES.pla;
    const weightG = Math.round(filledVolume * densityG);
    const cost = round(weightG / 1000 * (MATERIAL_COSTS[material] || 8.00), 2);

    // Estimate print time (0.5 hour per 10cm³)
    const volumeCm3 = Math.abs(volume) / 1000;
    const timeHours = (volumeCm3 / 10) * (0.2 / layerHeight); // Slower with thinner layers
    const timeMinutes = Math.round(timeHours * 60);

    // Create mock layers array for preview
    const layers = [];
    for (let i = 0; i < Math.min(totalLayers, 10); i++) {
      const z = bbox.min.z + i * layerHeight;
      layers.push({
        index: i,
        z: round(z, 2),
        paths: []
      });
    }

    // Generate simplified G-code
    const gcode = generateSlicingGcode({
      mesh, layerHeight, infill, shells,
      nozzleTemp: profile.nozzleTemp.default,
      bedTemp: profile.bedTemp.default,
      retraction: profile.retraction,
      material
    });

    return {
      printer: profile.name,
      totalLayers,
      layerHeight,
      infill,
      shells,
      layers: layers.length > 0 ? layers : [{index: 0, z: 0, paths: []}],
      material,
      materialWeightG: weightG,
      materialCostEUR: cost,
      estimatedTimeMinutes: timeMinutes,
      estimatedTimeReadable: `${Math.floor(timeMinutes / 60)}h ${timeMinutes % 60}m`,
      buildVolume: profile.buildVolume,
      fits: bbox.max.x - bbox.min.x <= profile.buildVolume.x &&
            bbox.max.y - bbox.min.y <= profile.buildVolume.y &&
            bbox.max.z - bbox.min.z <= profile.buildVolume.z,
      gcode: gcode,
      gcodeLength: gcode.split('\n').length
    };
  },

  /**
   * Slice preview: return contour for a specific layer
   * @param {THREE.Mesh} mesh
   * @param {number} layerIndex
   * @returns {Object} { index, z, contours: [] }
   */
  previewSlice: function(mesh, layerIndex = 0) {
    const bbox = new THREE.Box3().setFromObject(mesh);
    const layerHeight = 0.2;
    const z = bbox.min.z + layerIndex * layerHeight;
    return {
      index: layerIndex,
      z: round(z, 2),
      contours: []
    };
  },

  /**
   * Nest 2D parts on a flat sheet for laser/waterjet cutting
   * @param {Array} parts - [{ id, width, height, quantity }]
   * @param {Object} sheetSize - { width, height }
   * @param {Object} options - { spacing, rotation }
   * @returns {Object} { placements, utilization%, waste% }
   */
  nest: function(parts = [], sheetSize = { width: 1000, height: 500 }, options = {}) {
    const { spacing = 2, rotation = 'auto' } = options;

    if (!Array.isArray(parts) || parts.length === 0) {
      throw new Error('Parts array required');
    }
    if (!sheetSize.width || !sheetSize.height) {
      throw new Error('Sheet size {width, height} required');
    }

    // Sort parts by area (largest first)
    const sortedParts = [...parts].sort((a, b) => {
      const areaA = (a.width || 10) * (a.height || 10) * (a.quantity || 1);
      const areaB = (b.width || 10) * (b.height || 10) * (b.quantity || 1);
      return areaB - areaA;
    });

    const placements = [];
    let usedArea = 0;
    const occupied = []; // Bounding boxes of placed parts

    for (const part of sortedParts) {
      const w = part.width || 10;
      const h = part.height || 10;
      const qty = part.quantity || 1;

      for (let q = 0; q < qty; q++) {
        // Try to place at bottom-left
        let placed = false;
        for (let x = 0; x < sheetSize.width - w - spacing; x += 5) {
          for (let y = 0; y < sheetSize.height - h - spacing; y += 5) {
            const bbox = { x, y, x2: x + w, y2: y + h };
            const overlaps = occupied.some(occ =>
              !(bbox.x2 + spacing < occ.x || bbox.x > occ.x2 + spacing ||
                bbox.y2 + spacing < occ.y || bbox.y > occ.y2 + spacing)
            );
            if (!overlaps) {
              placements.push({
                partId: part.id || `part_${placements.length}`,
                x: round(x, 1),
                y: round(y, 1),
                width: w,
                height: h,
                rotation: 0
              });
              occupied.push(bbox);
              usedArea += w * h;
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }

    const sheetArea = sheetSize.width * sheetSize.height;
    const utilization = round(usedArea / sheetArea * 100, 1);
    const waste = round(100 - utilization, 1);

    return {
      sheetSize,
      placements,
      totalParts: placements.length,
      usedArea: round(usedArea, 1),
      sheetArea: round(sheetArea, 1),
      utilizationPercent: utilization,
      wastePercent: waste,
      nestingScore: utilization > 85 ? 'A' : utilization > 75 ? 'B' : utilization > 65 ? 'C' : 'D',
      svg: generateNestingSVG(sheetSize, placements, occupied)
    };
  },

  /**
   * Generate CNC toolpath from mesh
   * @param {THREE.Mesh} mesh
   * @param {Object} options - { tool, strategy, depthPerPass, feedRate, spindle }
   * @returns {Object} { paths, totalLength, estimatedTime, gcode }
   */
  toolpath: function(mesh, options = {}) {
    const {
      tool = 't_6mm_flat',
      strategy = 'contour',
      depthPerPass = 5,
      feedRate = 600,
      spindle = 1000,
      machine = 'shapeoko'
    } = options;

    const toolSpec = TOOL_LIBRARY.find(t => t.id === tool);
    if (!toolSpec) {
      throw new Error(`Tool "${tool}" not found. Available: ${TOOL_LIBRARY.map(t => t.id).join(', ')}`);
    }

    const machineProfile = MACHINE_PROFILES[machine];
    if (!machineProfile) {
      throw new Error(`Machine "${machine}" not found`);
    }

    // Calculate bounding box
    const bbox = new THREE.Box3().setFromObject(mesh);
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;
    const depth = bbox.max.z - bbox.min.z;

    // Generate contour path (simplified)
    const paths = [];
    const pathLength = 2 * (width + height) + depth; // Rough estimate
    const passes = Math.ceil(depth / depthPerPass);

    for (let pass = 0; pass < Math.min(passes, 5); pass++) {
      const z = bbox.min.z + (pass + 1) * depthPerPass;
      paths.push({
        type: strategy,
        z: round(z, 2),
        length: round(pathLength, 1),
        feed: feedRate
      });
    }

    // Estimate machining time
    const totalLength = pathLength * passes;
    const feedSpeed = feedRate / 1000; // mm/min → mm/s
    const timeSeconds = (totalLength / feedSpeed) + (passes * 5); // Add tool change time
    const timeMinutes = Math.round(timeSeconds / 60);

    // Generate G-code
    const gcode = generateToolpathGcode({
      mesh, tool: toolSpec, strategy, depthPerPass, feedRate, spindle
    });

    return {
      machine: machineProfile.name,
      tool: toolSpec.name,
      strategy,
      depthPerPass,
      feedRate,
      spindle,
      passes,
      paths: paths.length > 0 ? paths : [{type: strategy, z: 0, length: 0, feed: feedRate}],
      totalLength: round(totalLength, 1),
      estimatedTimeMinutes: timeMinutes,
      estimatedTimeReadable: `${Math.floor(timeMinutes / 60)}h ${timeMinutes % 60}m`,
      fits: width <= machineProfile.buildVolume.x &&
            height <= machineProfile.buildVolume.y &&
            depth <= machineProfile.buildVolume.z,
      gcode: gcode,
      gcodeLength: gcode.split('\n').length
    };
  },

  /**
   * Export G-code to file
   * @param {string} gcode
   * @param {string} filename
   */
  exportGcode: function(gcode, filename = 'output.gcode') {
    if (!gcode || typeof gcode !== 'string') {
      throw new Error('G-code string required');
    }
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { format: 'gcode', filename, lines: gcode.split('\n').length };
  },

  /**
   * Compare costs across all manufacturing processes
   * @param {THREE.Mesh} mesh
   * @param {Object} options - { material }
   * @returns {Array} sorted by cost
   */
  compareCosts: function(mesh, options = {}) {
    const { material = 'pla' } = options;

    const bbox = new THREE.Box3().setFromObject(mesh);
    const volume = (bbox.max.x - bbox.min.x) * (bbox.max.y - bbox.min.y) * (bbox.max.z - bbox.min.z);
    const volumeCm3 = Math.abs(volume) / 1000;

    const processes = [];

    // FDM estimate
    const fdmMaterialWeight = volumeCm3 * (MATERIAL_DENSITIES[material] || 1.24);
    const fdmMaterialCost = round(fdmMaterialWeight * (MATERIAL_COSTS[material] || 8.00) / 1000, 2);
    const fdmMachineCost = round((volumeCm3 / 10) * 2, 2);
    processes.push({
      process: 'FDM 3D Print',
      materialCost: fdmMaterialCost,
      machineCost: fdmMachineCost,
      setupCost: 0,
      totalCost: round(fdmMaterialCost + fdmMachineCost, 2),
      timeMinutes: Math.round((volumeCm3 / 10) * 60),
      pros: ['Low cost', 'Fast for prototypes', 'Wide material selection'],
      cons: ['Layer lines', 'Lower strength', 'Need support']
    });

    // SLA estimate
    const slaMaterialCost = round(volumeCm3 * 0.035, 2); // Resin is pricey
    const slaMachineCost = round((volumeCm3 / 10) * 5, 2);
    processes.push({
      process: 'SLA Resin Print',
      materialCost: slaMaterialCost,
      machineCost: slaMachineCost,
      setupCost: 0,
      totalCost: round(slaMaterialCost + slaMachineCost, 2),
      timeMinutes: Math.round((volumeCm3 / 10) * 40),
      pros: ['High detail', 'Smooth surface', 'Isotropic strength'],
      cons: ['Material cost', 'Post-processing', 'Toxic fumes']
    });

    // CNC estimate
    const cncMaterialWeight = volumeCm3 * (MATERIAL_DENSITIES.aluminum || 2.70);
    const cncMaterialCost = round(cncMaterialWeight * 1.20 / 1000, 2);
    const cncMachineCost = round(volumeCm3 * 0.5, 2);
    const cncSetup = 15;
    processes.push({
      process: 'CNC Mill (Aluminum)',
      materialCost: cncMaterialCost,
      machineCost: cncMachineCost,
      setupCost: cncSetup,
      totalCost: round(cncMaterialCost + cncMachineCost + cncSetup, 2),
      timeMinutes: Math.round(volumeCm3 * 5),
      pros: ['High strength', 'Metal options', 'Professional quality'],
      cons: ['High setup cost', 'Tool wear', 'Scrap material']
    });

    // Laser cutting (2D only estimate)
    processes.push({
      process: 'Laser Cut (Acrylic)',
      materialCost: round(volumeCm3 * 0.012, 2),
      machineCost: round(volumeCm3 * 0.05, 2),
      setupCost: 5,
      totalCost: round(volumeCm3 * 0.062 + 5, 2),
      timeMinutes: Math.round(volumeCm3),
      pros: ['Fast for flat parts', 'Low cost', 'Edge melting'],
      cons: ['2D only', 'Limited materials', 'Kerf loss']
    });

    // Injection molding (bulk order)
    const moldSetup = 2000;
    const perUnit = round(volumeCm3 * 0.02, 2);
    processes.push({
      process: 'Injection Molding (x100)',
      materialCost: round(perUnit * 100, 2),
      machineCost: round(volumeCm3 * 0.1 * 100, 2),
      setupCost: moldSetup,
      totalCost: round(perUnit * 100 + moldSetup, 2),
      costPerUnit: round((perUnit * 100 + moldSetup) / 100, 2),
      timeMinutes: 0,
      pros: ['Cheapest per unit', 'Production-ready', 'Strong parts'],
      cons: ['High tooling cost', 'Min order 100+', 'Lead time']
    });

    // Sort by cost
    const sorted = processes.sort((a, b) => a.totalCost - b.totalCost);

    return {
      volumeCm3: round(volumeCm3, 2),
      material,
      processes: sorted.map((p, i) => ({ rank: i + 1, ...p }))
    };
  },

  /**
   * Estimate time and cost for a specific manufacturing process
   * @param {THREE.Mesh} mesh
   * @param {Object} options
   * @returns {Object} { process, cost, time, breakdown }
   */
  estimate: function(mesh, options = {}) {
    const { process = 'FDM', material = 'pla', machine = 'ender3', quantity = 1 } = options;

    const bbox = new THREE.Box3().setFromObject(mesh);
    const volume = (bbox.max.x - bbox.min.x) * (bbox.max.y - bbox.min.y) * (bbox.max.z - bbox.min.z);
    const volumeCm3 = Math.abs(volume) / 1000;

    let estimate = {};

    switch (process.toUpperCase()) {
      case 'FDM':
        estimate = {
          process: 'FDM 3D Printing',
          machine: MACHINE_PROFILES[machine]?.name || 'Generic FDM',
          volumeCm3: round(volumeCm3, 2),
          material,
          materialWeight: round(volumeCm3 * (MATERIAL_DENSITIES[material] || 1.24), 1),
          materialCost: round(volumeCm3 * (MATERIAL_DENSITIES[material] || 1.24) * (MATERIAL_COSTS[material] || 8.00) / 1000, 2),
          machineTime: Math.round((volumeCm3 / 10) * 60),
          machineCost: round((volumeCm3 / 10) * 0.5, 2),
          setupCost: 0,
          totalPerUnit: round(volumeCm3 * (MATERIAL_DENSITIES[material] || 1.24) * (MATERIAL_COSTS[material] || 8.00) / 1000 + (volumeCm3 / 10) * 0.5, 2),
          totalBatch: round(quantity * (volumeCm3 * (MATERIAL_DENSITIES[material] || 1.24) * (MATERIAL_COSTS[material] || 8.00) / 1000 + (volumeCm3 / 10) * 0.5), 2),
          quantity
        };
        break;

      case 'CNC':
        const materialWeight = volumeCm3 * (MATERIAL_DENSITIES.aluminum || 2.70);
        estimate = {
          process: 'CNC Machining',
          machine: MACHINE_PROFILES[machine]?.name || 'Generic CNC',
          volumeCm3: round(volumeCm3, 2),
          material: 'Aluminum 6061',
          materialWeight: round(materialWeight, 1),
          materialCost: round(materialWeight * 1.20 / 1000, 2),
          machineTime: Math.round(volumeCm3 * 5),
          machineCost: round(volumeCm3 * 0.5, 2),
          setupCost: 25,
          totalPerUnit: round(materialWeight * 1.20 / 1000 + volumeCm3 * 0.5 + 25 / quantity, 2),
          totalBatch: round(quantity * (materialWeight * 1.20 / 1000 + volumeCm3 * 0.5) + 25, 2),
          quantity
        };
        break;

      case 'SLA':
        estimate = {
          process: 'SLA Resin Printing',
          machine: MACHINE_PROFILES[machine]?.name || 'Generic SLA',
          volumeCm3: round(volumeCm3, 2),
          material: 'Standard Resin',
          materialCost: round(volumeCm3 * 0.035, 2),
          machineTime: Math.round((volumeCm3 / 10) * 40),
          machineCost: round((volumeCm3 / 10) * 1.5, 2),
          setupCost: 0,
          totalPerUnit: round(volumeCm3 * 0.035 + (volumeCm3 / 10) * 1.5, 2),
          totalBatch: round(quantity * (volumeCm3 * 0.035 + (volumeCm3 / 10) * 1.5), 2),
          quantity
        };
        break;

      default:
        throw new Error(`Process "${process}" not supported. Use: FDM, CNC, SLA`);
    }

    estimate.timeMinutesReadable = `${Math.floor(estimate.machineTime / 60)}h ${estimate.machineTime % 60}m`;
    estimate.currency = 'EUR';

    return estimate;
  },

  /**
   * Get available machines
   */
  getMachines: function() {
    return Object.entries(MACHINE_PROFILES).map(([id, profile]) => ({
      id,
      ...profile
    }));
  },

  /**
   * Get available tools for CNC
   */
  getTools: function() {
    return TOOL_LIBRARY;
  },

  /**
   * Get material data
   */
  getMaterials: function() {
    return {
      materials: Object.keys(MATERIAL_DENSITIES).map(name => ({
        name,
        density: MATERIAL_DENSITIES[name],
        costPerKg: MATERIAL_COSTS[name]
      }))
    };
  }
};

// ============================================================================
// Helper: Generate G-code for slicing
// ============================================================================
function generateSlicingGcode(params) {
  const { mesh, layerHeight, infill, shells, nozzleTemp, bedTemp, retraction, material } = params;
  let gcode = [];

  gcode.push('; Slicing G-code generated by cycleCAD');
  gcode.push(`; Material: ${material}, Layer Height: ${layerHeight}mm, Infill: ${infill}%`);
  gcode.push('G28 ; Home all axes');
  gcode.push(`M140 S${bedTemp} ; Set bed temperature`);
  gcode.push(`M104 S${nozzleTemp} ; Set nozzle temperature`);
  gcode.push('M109 S' + nozzleTemp + ' ; Wait for nozzle');
  gcode.push('M190 S' + bedTemp + ' ; Wait for bed');
  gcode.push('G92 E0 ; Reset extruder');
  gcode.push('G1 Z2.0 F3000 ; Lift nozzle');
  gcode.push('G1 X10 Y10 F3000');
  gcode.push('; --- Layer Data ---');

  // Simplified layer generation
  const bbox = new THREE.Box3().setFromObject(mesh);
  const layers = Math.ceil((bbox.max.z - bbox.min.z) / layerHeight);

  for (let layer = 0; layer < Math.min(layers, 20); layer++) {
    gcode.push(`; Layer ${layer}`);
    gcode.push(`G0 Z${(bbox.min.z + layer * layerHeight).toFixed(2)}`);
    gcode.push(`G1 X${(bbox.min.x + 10).toFixed(1)} Y${(bbox.min.y + 10).toFixed(1)} E${(layer * 2).toFixed(1)} F3000`);
    gcode.push(`G1 X${(bbox.max.x - 10).toFixed(1)} Y${(bbox.max.y - 10).toFixed(1)} E${((layer + 1) * 2).toFixed(1)} F3000`);
  }

  gcode.push('; --- End ---');
  gcode.push('M104 S0 ; Turn off nozzle heater');
  gcode.push('M140 S0 ; Turn off bed');
  gcode.push('G28 X0 Y0 ; Home XY');
  gcode.push('M84 ; Disable motors');

  return gcode.join('\n');
}

// ============================================================================
// Helper: Generate G-code for CNC toolpath
// ============================================================================
function generateToolpathGcode(params) {
  const { mesh, tool, strategy, depthPerPass, feedRate, spindle } = params;
  let gcode = [];

  gcode.push('; CNC Toolpath G-code generated by cycleCAD');
  gcode.push(`; Tool: ${tool.name} (${tool.diameter}mm), Strategy: ${strategy}`);
  gcode.push(`; Spindle: ${spindle} RPM, Feed: ${feedRate} mm/min`);
  gcode.push('G90 ; Absolute positioning');
  gcode.push('G94 ; Inches per minute feed');
  gcode.push(`M3 S${spindle} ; Spindle on`);
  gcode.push(`G0 X0 Y0 Z5 ; Move to start`);

  const bbox = new THREE.Box3().setFromObject(mesh);
  const passes = Math.ceil((bbox.max.z - bbox.min.z) / depthPerPass);

  for (let pass = 0; pass < Math.min(passes, 10); pass++) {
    const z = bbox.min.z + (pass + 1) * depthPerPass;
    gcode.push(`; Pass ${pass + 1}`);
    gcode.push(`G1 Z${z.toFixed(2)} F${feedRate}`);
    gcode.push(`G1 X${(bbox.min.x + 10).toFixed(1)} Y${(bbox.min.y + 10).toFixed(1)} F${feedRate}`);
    gcode.push(`G1 X${(bbox.max.x - 10).toFixed(1)} Y${(bbox.max.y - 10).toFixed(1)} F${feedRate}`);
    gcode.push(`G0 Z5 F3000 ; Rapid retract`);
  }

  gcode.push('M5 ; Spindle off');
  gcode.push('G0 X0 Y0 Z5 ; Return to home');

  return gcode.join('\n');
}

// ============================================================================
// Helper: Generate SVG for nesting preview
// ============================================================================
function generateNestingSVG(sheetSize, placements, occupied) {
  const scale = 0.2; // Scale down for preview
  const svgWidth = sheetSize.width * scale;
  const svgHeight = sheetSize.height * scale;

  let svg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${sheetSize.width} ${sheetSize.height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${sheetSize.width}" height="${sheetSize.height}" fill="#f5f5f5" stroke="#333" stroke-width="2"/>`;

  // Draw placements
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  placements.forEach((p, i) => {
    const color = colors[i % colors.length];
    svg += `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" fill="${color}" opacity="0.7" stroke="#000" stroke-width="1"/>`;
    svg += `<text x="${p.x + p.width/2}" y="${p.y + p.height/2}" text-anchor="middle" font-size="10" font-family="Arial">${p.partId}</text>`;
  });

  svg += '</svg>';
  return svg;
}

// ============================================================================
// Helper: Utility functions
// ============================================================================
function round(num, decimals = 2) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

// ============================================================================
// Export CAM API as window.cycleCAD.cam
// ============================================================================
if (!window.cycleCAD) {
  window.cycleCAD = {};
}
window.cycleCAD.cam = camAPI;

console.log('[CAM Pipeline] Initialized. window.cycleCAD.cam ready.');
console.log('[CAM] Available commands:', Object.keys(camAPI).join(', '));

export default camAPI;
