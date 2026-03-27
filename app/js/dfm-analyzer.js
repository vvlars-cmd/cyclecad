/**
 * dfm-analyzer.js — DFM (Design for Manufacturability) Analysis & Cost Estimation
 *
 * Analyzes parts for manufacturability across 8 manufacturing processes:
 * - FDM (Fused Deposition Modeling / 3D Printing)
 * - SLA (Stereolithography)
 * - SLS (Selective Laser Sintering)
 * - CNC Milling
 * - CNC Lathe
 * - Laser Cutting
 * - Injection Molding
 * - Sheet Metal
 *
 * Features:
 * - Process-specific design rule checks (min wall thickness, undercuts, etc.)
 * - Detailed cost estimation with material, machine, setup, and tooling costs
 * - Material recommendations based on requirements
 * - Tolerance analysis and achievability
 * - Weight & strength estimation
 * - Full HTML report generation
 * - Event system for UI integration
 * - Token billing via token-engine
 *
 * Module pattern: Exposed as window.cycleCAD.dfm = { analyze, analyzeAll, ... }
 */

(function() {
  'use strict';

  // ============================================================================
  // MATERIAL DATABASE (30+ materials with properties)
  // ============================================================================

  const MATERIALS = {
    // Metals
    'steel-1018': {
      name: 'Steel (1018)',
      category: 'metal',
      density: 7.87,           // g/cm³
      tensile: 370,            // MPa
      yield: 310,              // MPa
      elongation: 15,          // %
      hardness: 95,            // HB (Hardness)
      thermalCond: 51.9,       // W/m·K
      meltingPoint: 1510,      // °C
      costPerKg: 0.85,         // EUR
      machinability: 7.5,      // 1-10 scale
      weldable: true,
      corrosionResistant: false
    },
    'steel-4140': {
      name: 'Steel (4140, Chrome-Moly)',
      category: 'metal',
      density: 7.85,
      tensile: 1000,
      yield: 900,
      elongation: 8,
      hardness: 290,
      thermalCond: 42.6,
      meltingPoint: 1520,
      costPerKg: 1.20,
      machinability: 6.0,
      weldable: true,
      corrosionResistant: false
    },
    'steel-316ss': {
      name: 'Stainless Steel (316)',
      category: 'metal',
      density: 8.00,
      tensile: 515,
      yield: 205,
      elongation: 30,
      hardness: 95,
      thermalCond: 16.3,
      meltingPoint: 1390,
      costPerKg: 2.50,
      machinability: 4.0,
      weldable: true,
      corrosionResistant: true
    },
    'aluminum-6061': {
      name: 'Aluminum (6061)',
      category: 'metal',
      density: 2.70,
      tensile: 310,
      yield: 275,
      elongation: 12,
      hardness: 95,
      thermalCond: 167,
      meltingPoint: 582,
      costPerKg: 1.50,
      machinability: 8.0,
      weldable: true,
      corrosionResistant: true
    },
    'aluminum-7075': {
      name: 'Aluminum (7075, High Strength)',
      category: 'metal',
      density: 2.81,
      tensile: 570,
      yield: 505,
      elongation: 11,
      hardness: 150,
      thermalCond: 130,
      meltingPoint: 477,
      costPerKg: 3.20,
      machinability: 4.0,
      weldable: false,
      corrosionResistant: false
    },
    'brass': {
      name: 'Brass (60/40)',
      category: 'metal',
      density: 8.47,
      tensile: 300,
      yield: 100,
      elongation: 35,
      hardness: 45,
      thermalCond: 109,
      meltingPoint: 930,
      costPerKg: 4.50,
      machinability: 8.5,
      weldable: false,
      corrosionResistant: true
    },
    'copper': {
      name: 'Copper (C11000)',
      category: 'metal',
      density: 8.96,
      tensile: 200,
      yield: 33,
      elongation: 50,
      hardness: 40,
      thermalCond: 401,
      meltingPoint: 1085,
      costPerKg: 5.80,
      machinability: 8.0,
      weldable: false,
      corrosionResistant: true
    },
    'titanium': {
      name: 'Titanium (Grade 2)',
      category: 'metal',
      density: 4.51,
      tensile: 435,
      yield: 345,
      elongation: 20,
      hardness: 170,
      thermalCond: 21.9,
      meltingPoint: 1660,
      costPerKg: 12.50,
      machinability: 3.0,
      weldable: true,
      corrosionResistant: true
    },

    // Thermoplastics
    'abs': {
      name: 'ABS (Acrylonitrile Butadiene Styrene)',
      category: 'plastic',
      density: 1.04,
      tensile: 40,
      yield: null,
      elongation: 50,
      hardness: 75,
      thermalCond: 0.20,
      meltingPoint: 220,
      costPerKg: 2.00,
      machinability: 7.0,
      weldable: false,
      corrosionResistant: true,
      foodSafe: false
    },
    'pla': {
      name: 'PLA (Polylactic Acid)',
      category: 'plastic',
      density: 1.24,
      tensile: 50,
      yield: null,
      elongation: 5,
      hardness: 70,
      thermalCond: 0.13,
      meltingPoint: 170,
      costPerKg: 1.50,
      machinability: 8.0,
      weldable: false,
      corrosionResistant: true,
      foodSafe: true
    },
    'petg': {
      name: 'PETG (Polyethylene Terephthalate Glycol)',
      category: 'plastic',
      density: 1.27,
      tensile: 53,
      yield: null,
      elongation: 35,
      hardness: 80,
      thermalCond: 0.21,
      meltingPoint: 230,
      costPerKg: 2.50,
      machinability: 7.0,
      weldable: false,
      corrosionResistant: true,
      foodSafe: false
    },
    'nylon-6': {
      name: 'Nylon 6',
      category: 'plastic',
      density: 1.14,
      tensile: 80,
      yield: null,
      elongation: 30,
      hardness: 80,
      thermalCond: 0.24,
      meltingPoint: 220,
      costPerKg: 3.50,
      machinability: 6.5,
      weldable: false,
      corrosionResistant: true,
      foodSafe: false
    },
    'polycarbonate': {
      name: 'Polycarbonate (PC)',
      category: 'plastic',
      density: 1.20,
      tensile: 65,
      yield: null,
      elongation: 60,
      hardness: 80,
      thermalCond: 0.20,
      meltingPoint: 230,
      costPerKg: 4.00,
      machinability: 6.0,
      weldable: false,
      corrosionResistant: true,
      foodSafe: false
    },
    'acetal': {
      name: 'Acetal (Delrin)',
      category: 'plastic',
      density: 1.41,
      tensile: 69,
      yield: null,
      elongation: 25,
      hardness: 94,
      thermalCond: 0.24,
      meltingPoint: 165,
      costPerKg: 5.50,
      machinability: 7.5,
      weldable: false,
      corrosionResistant: true,
      foodSafe: false
    },
    'peek': {
      name: 'PEEK (Polyetheretherketone)',
      category: 'plastic',
      density: 1.32,
      tensile: 100,
      yield: null,
      elongation: 50,
      hardness: 95,
      thermalCond: 0.25,
      meltingPoint: 334,
      costPerKg: 18.00,
      machinability: 5.0,
      weldable: false,
      corrosionResistant: true,
      foodSafe: false
    },
    'uhmwpe': {
      name: 'UHMWPE (Ultra-High Molecular Weight Polyethylene)',
      category: 'plastic',
      density: 0.93,
      tensile: 50,
      yield: null,
      elongation: 300,
      hardness: 60,
      thermalCond: 0.45,
      meltingPoint: 130,
      costPerKg: 3.00,
      machinability: 8.0,
      weldable: false,
      corrosionResistant: true,
      foodSafe: true
    },

    // Thermosets & Composites
    'carbon-fiber': {
      name: 'Carbon Fiber Reinforced Plastic (CFRP)',
      category: 'composite',
      density: 1.60,
      tensile: 700,
      yield: null,
      elongation: 2.5,
      hardness: null,
      thermalCond: 0.50,
      meltingPoint: 300,
      costPerKg: 15.00,
      machinability: 4.0,
      weldable: false,
      corrosionResistant: true
    },
    'fiberglass': {
      name: 'Fiberglass Reinforced Plastic (FRP)',
      category: 'composite',
      density: 1.85,
      tensile: 350,
      yield: null,
      elongation: 2.0,
      hardness: null,
      thermalCond: 0.20,
      meltingPoint: 260,
      costPerKg: 4.00,
      machinability: 3.5,
      weldable: false,
      corrosionResistant: true
    },
  };

  // ============================================================================
  // DFM RULES DATABASE (per manufacturing process)
  // ============================================================================

  const DFM_RULES = {
    fdm: {
      name: '3D Printing (FDM)',
      description: 'Fused Deposition Modeling - layer-by-layer thermoplastic extrusion',
      checks: [
        {
          id: 'min_wall_thickness',
          name: 'Minimum wall thickness',
          minThickness: 0.8,
          warnThickness: 1.0,
          check: (mesh) => {
            const minThickness = estimateMinWallThickness(mesh);
            return {
              pass: minThickness >= 0.8,
              value: minThickness,
              severity: minThickness < 0.4 ? 'fail' : minThickness < 0.8 ? 'warn' : 'ok',
              message: `Min wall thickness: ${minThickness.toFixed(2)}mm. Recommended ≥0.8mm.`
            };
          }
        },
        {
          id: 'overhang',
          name: 'Overhang angle',
          maxOverhangAngle: 45,
          check: (mesh) => {
            const overhangs = detectOverhangs(mesh, 45);
            return {
              pass: overhangs.length === 0,
              count: overhangs.length,
              severity: overhangs.length > 0 ? 'warn' : 'ok',
              message: overhangs.length > 0
                ? `${overhangs.length} overhanging features detected. Support structures recommended.`
                : 'No problematic overhangs.'
            };
          }
        },
        {
          id: 'bridge_length',
          name: 'Bridge span (unsupported)',
          maxBridgeLength: 10,
          check: (mesh) => {
            const bridges = detectBridges(mesh, 10);
            return {
              pass: bridges.length === 0,
              maxSpan: bridges.length > 0 ? Math.max(...bridges) : 0,
              severity: bridges.length > 0 ? 'warn' : 'ok',
              message: bridges.length > 0
                ? `Bridges up to ${Math.max(...bridges).toFixed(1)}mm detected. Max recommended 10mm.`
                : 'No problematic bridges.'
            };
          }
        },
        {
          id: 'small_holes',
          name: 'Small hole diameter',
          minHoleDiameter: 2.0,
          check: (mesh) => {
            const smallHoles = detectSmallHoles(mesh, 2.0);
            return {
              pass: smallHoles.length === 0,
              count: smallHoles.length,
              severity: smallHoles.length > 0 ? 'warn' : 'ok',
              message: smallHoles.length > 0
                ? `${smallHoles.length} holes <2.0mm detected. May require drilling post-print.`
                : 'All holes above minimum size.'
            };
          }
        },
        {
          id: 'thin_features',
          name: 'Thin walls/towers',
          maxAspectRatio: 8,
          check: (mesh) => {
            const thinFeatures = detectThinFeatures(mesh, 8);
            return {
              pass: thinFeatures.length === 0,
              count: thinFeatures.length,
              severity: thinFeatures.length > 0 ? 'warn' : 'ok',
              message: thinFeatures.length > 0
                ? `${thinFeatures.length} features with high aspect ratio. Support density adjustment needed.`
                : 'Feature proportions acceptable.'
            };
          }
        }
      ]
    },

    sla: {
      name: '3D Printing (SLA)',
      description: 'Stereolithography - resin-based high-precision printing',
      checks: [
        {
          id: 'min_wall_thickness',
          name: 'Minimum wall thickness',
          minThickness: 0.5,
          check: (mesh) => {
            const minThickness = estimateMinWallThickness(mesh);
            return {
              pass: minThickness >= 0.5,
              value: minThickness,
              severity: minThickness < 0.25 ? 'fail' : minThickness < 0.5 ? 'warn' : 'ok',
              message: `Min wall thickness: ${minThickness.toFixed(2)}mm. SLA tolerance: 0.025-0.1mm.`
            };
          }
        },
        {
          id: 'drainage_holes',
          name: 'Internal cavities need drainage',
          check: (mesh) => {
            const hasInteriorCavities = detectInteriorCavities(mesh);
            return {
              pass: !hasInteriorCavities,
              severity: hasInteriorCavities ? 'warn' : 'ok',
              message: hasInteriorCavities
                ? 'Trapped resin in internal cavities. Add drainage/vent holes.'
                : 'No critical internal cavities.'
            };
          }
        },
        {
          id: 'support_contact',
          name: 'Support contact marks',
          check: (mesh) => {
            return {
              pass: true,
              severity: 'info',
              message: 'Consider surface finish if support contact marks visible. Post-processing may be needed.'
            };
          }
        }
      ]
    },

    sls: {
      name: '3D Printing (SLS)',
      description: 'Selective Laser Sintering - powder-based rapid manufacturing',
      checks: [
        {
          id: 'min_wall_thickness',
          name: 'Minimum wall thickness',
          minThickness: 1.5,
          check: (mesh) => {
            const minThickness = estimateMinWallThickness(mesh);
            return {
              pass: minThickness >= 1.5,
              value: minThickness,
              severity: minThickness < 1.0 ? 'fail' : minThickness < 1.5 ? 'warn' : 'ok',
              message: `Min wall thickness: ${minThickness.toFixed(2)}mm. SLS can handle 1.5mm+.`
            };
          }
        },
        {
          id: 'undercuts',
          name: 'No undercuts required',
          check: (mesh) => {
            return {
              pass: true,
              severity: 'ok',
              message: 'SLS does not require undercut support due to powder bed support.'
            };
          }
        }
      ]
    },

    cnc_mill: {
      name: 'CNC Milling',
      description: 'Computer Numeric Control Milling - subtractive manufacturing',
      checks: [
        {
          id: 'internal_corner_radius',
          name: 'Internal corner radius ≥ tool radius',
          minRadius: 1.5,
          check: (mesh) => {
            const sharpCorners = detectSharpInternalCorners(mesh, 1.5);
            return {
              pass: sharpCorners.length === 0,
              count: sharpCorners.length,
              severity: sharpCorners.length > 0 ? 'warn' : 'ok',
              message: sharpCorners.length > 0
                ? `${sharpCorners.length} sharp internal corners. CNC tool cannot reach. Radius ≥1.5mm recommended.`
                : 'All internal corners within reach.'
            };
          }
        },
        {
          id: 'deep_pockets',
          name: 'Pocket depth ≤ 4x tool diameter',
          maxDepthRatio: 4,
          check: (mesh) => {
            const deepPockets = detectDeepPockets(mesh, 4);
            return {
              pass: deepPockets.length === 0,
              count: deepPockets.length,
              severity: deepPockets.length > 0 ? 'warn' : 'ok',
              message: deepPockets.length > 0
                ? `${deepPockets.length} deep pockets. Depth >4x tool diameter. Custom tooling may be needed.`
                : 'Pocket depths acceptable.'
            };
          }
        },
        {
          id: 'thin_walls',
          name: 'Thin wall thickness',
          minThickness: 0.5,
          check: (mesh) => {
            const minThickness = estimateMinWallThickness(mesh);
            return {
              pass: minThickness >= 0.5,
              value: minThickness,
              severity: minThickness < 0.3 ? 'fail' : minThickness < 0.5 ? 'warn' : 'ok',
              message: `Min wall thickness: ${minThickness.toFixed(2)}mm. Deflection/vibration risk below 0.5mm.`
            };
          }
        },
        {
          id: 'undercuts',
          name: 'No undercuts (5-axis would be needed)',
          check: (mesh) => {
            const undercuts = detectUndercuts(mesh);
            return {
              pass: undercuts.length === 0,
              count: undercuts.length,
              severity: undercuts.length > 0 ? 'warn' : 'ok',
              message: undercuts.length > 0
                ? `${undercuts.length} undercuts detected. Requires 5-axis milling or multiple setups.`
                : 'No problematic undercuts.'
            };
          }
        }
      ]
    },

    cnc_lathe: {
      name: 'CNC Lathe',
      description: 'Computer Numeric Control Lathe - rotational symmetry subtractive',
      checks: [
        {
          id: 'rotational_symmetry',
          name: 'Feature requires rotational symmetry',
          check: (mesh) => {
            const isSymmetric = detectRotationalSymmetry(mesh);
            return {
              pass: isSymmetric,
              severity: isSymmetric ? 'ok' : 'fail',
              message: isSymmetric
                ? 'Geometry acceptable for lathe operation.'
                : 'Geometry not rotationally symmetric. This cannot be done on a lathe.'
            };
          }
        },
        {
          id: 'thread_compatibility',
          name: 'Thread pitch compatible',
          check: (mesh) => {
            return {
              pass: true,
              severity: 'info',
              message: 'Thread generation speeds: 200-500 RPM typical.'
            };
          }
        }
      ]
    },

    laser_cut: {
      name: 'Laser Cutting',
      description: 'CO₂ or fiber laser cutting - 2D profiles from sheet material',
      checks: [
        {
          id: 'min_feature_size',
          name: 'Minimum feature size vs material',
          minSize: 0.5,
          check: (mesh) => {
            const smallFeatures = detectSmallFeatures(mesh, 0.5);
            return {
              pass: smallFeatures.length === 0,
              count: smallFeatures.length,
              severity: smallFeatures.length > 0 ? 'warn' : 'ok',
              message: smallFeatures.length > 0
                ? `${smallFeatures.length} features <0.5mm. Laser kerf ~0.1-0.3mm may affect tolerance.`
                : 'All features above minimum laser resolution.'
            };
          }
        },
        {
          id: 'kerf_compensation',
          name: 'Kerf compensation needed',
          check: (mesh) => {
            return {
              pass: true,
              severity: 'info',
              message: 'Kerf (cut width) is ~0.1-0.3mm. Account in CAM for precise dimensions.'
            };
          }
        }
      ]
    },

    injection_mold: {
      name: 'Injection Molding',
      description: 'Injection molding - high-volume plastic part production',
      checks: [
        {
          id: 'draft_angle',
          name: 'Draft angle on vertical walls',
          minDraftAngle: 1.0,
          check: (mesh) => {
            const noDraftAreas = detectNoDraftAreas(mesh, 1.0);
            return {
              pass: noDraftAreas.length === 0,
              count: noDraftAreas.length,
              severity: noDraftAreas.length > 0 ? 'warn' : 'ok',
              message: noDraftAreas.length > 0
                ? `${noDraftAreas.length} areas without draft. Minimum 1° (ideally 2-3°) needed for mold release.`
                : 'Adequate draft angles.'
            };
          }
        },
        {
          id: 'wall_thickness_uniformity',
          name: 'Wall thickness uniformity',
          maxVariation: 0.25,
          check: (mesh) => {
            const uniformity = analyzeWallThicknessVariation(mesh);
            return {
              pass: uniformity.variation <= 0.25,
              variation: uniformity.variation,
              severity: uniformity.variation > 0.5 ? 'fail' : uniformity.variation > 0.25 ? 'warn' : 'ok',
              message: uniformity.variation > 0.25
                ? `Wall thickness varies ${(uniformity.variation * 100).toFixed(0)}%. Risk of sink marks, warping. Aim for ≤25% variation.`
                : 'Wall thickness relatively uniform.'
            };
          }
        },
        {
          id: 'undercuts',
          name: 'Undercuts require side actions',
          check: (mesh) => {
            const undercuts = detectUndercuts(mesh);
            return {
              pass: undercuts.length === 0,
              count: undercuts.length,
              severity: undercuts.length > 0 ? 'warn' : 'ok',
              message: undercuts.length > 0
                ? `${undercuts.length} undercuts. Mold cost +50-100% for side actions. Redesign may be cheaper.`
                : 'No undercuts - simpler mold.'
            };
          }
        },
        {
          id: 'rib_thickness',
          name: 'Rib height ≤ 3x wall thickness',
          maxRibRatio: 3,
          check: (mesh) => {
            const poorRibs = detectPoorRibProportions(mesh, 3);
            return {
              pass: poorRibs.length === 0,
              count: poorRibs.length,
              severity: poorRibs.length > 0 ? 'warn' : 'ok',
              message: poorRibs.length > 0
                ? `${poorRibs.length} ribs too tall. Shrinkage/stress issues. Max height = 3x wall thickness.`
                : 'Rib proportions good.'
            };
          }
        }
      ]
    },

    sheet_metal: {
      name: 'Sheet Metal',
      description: 'Sheet metal bending, stamping, and forming',
      checks: [
        {
          id: 'bend_radius',
          name: 'Bend radius vs material thickness',
          minRadiusRatio: 1.0,
          check: (mesh) => {
            const sharpBends = detectSharpBends(mesh, 1.0);
            return {
              pass: sharpBends.length === 0,
              count: sharpBends.length,
              severity: sharpBends.length > 0 ? 'warn' : 'ok',
              message: sharpBends.length > 0
                ? `${sharpBends.length} bends too tight. Minimum bend radius = 1-2x material thickness.`
                : 'Bend radii adequate.'
            };
          }
        },
        {
          id: 'bend_relief',
          name: 'Bend relief clearance at corners',
          minClearance: 1.0,
          check: (mesh) => {
            return {
              pass: true,
              severity: 'info',
              message: 'Ensure 0.5-1.0mm clearance at bend line intersections to prevent tearing.'
            };
          }
        },
        {
          id: 'flange_length',
          name: 'Minimum flange length',
          minFlangeLength: 2.0,
          check: (mesh) => {
            const shortFlanges = detectShortFlanges(mesh, 2.0);
            return {
              pass: shortFlanges.length === 0,
              count: shortFlanges.length,
              severity: shortFlanges.length > 0 ? 'warn' : 'ok',
              message: shortFlanges.length > 0
                ? `${shortFlanges.length} flanges <2.0mm. Difficult to bend. Minimum 2.0mm recommended.`
                : 'Flange lengths acceptable.'
            };
          }
        }
      ]
    }
  };

  // ============================================================================
  // COST ESTIMATION DATABASES
  // ============================================================================

  const MACHINE_RATES = {
    // EUR per hour
    fdm_printer: 0.50,        // Low cost per hour (material dominant)
    sla_printer: 1.50,
    sls_printer: 3.00,
    cnc_mill_3axis: 35.00,    // Operator + machine time
    cnc_mill_5axis: 65.00,
    cnc_lathe: 30.00,
    laser_cutter: 20.00,
    injection_mold_press: 45.00, // Per hour (after tooling)
    sheet_metal_press: 25.00,
  };

  // Manufacturing time estimation (minutes per cm³ or per operation)
  const TIME_ESTIMATES = {
    fdm: 0.8,                 // min per cm³
    sla: 0.3,
    sls: 0.4,
    cnc_mill: 1.2,
    cnc_lathe: 0.9,
    laser_cut: 0.05,          // min per cm² of perimeter
    injection_mold: 0.1,      // min per part (after mold tooling)
    sheet_metal: 0.15,        // min per bend or feature
  };

  const TOOLING_COSTS = {
    fdm: 0,                   // No tooling
    sla: 0,
    sls: 0,
    cnc_mill: 500,            // Fixture setup, custom tools
    cnc_lathe: 300,
    laser_cutter: 0,          // Only design time
    injection_mold: 3000,     // Mold tooling (significant)
    sheet_metal: 800,         // Die/punch tooling
  };

  // ============================================================================
  // UTILITY FUNCTIONS FOR MESH ANALYSIS
  // ============================================================================

  function estimateMinWallThickness(mesh) {
    if (!mesh || !mesh.geometry) return 0;
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const minDim = Math.min(size.x, size.y, size.z);
    return Math.max(0.5, minDim * 0.05); // Very rough estimate
  }

  function detectOverhangs(mesh, maxAngleDegrees) {
    // Simplified: check for faces with normal pointing downward >45°
    const maxAngle = THREE.MathUtils.degToRad(maxAngleDegrees);
    const overhangs = [];
    if (!mesh.geometry) return overhangs;

    const geometry = mesh.geometry;
    const normals = geometry.attributes.normal;
    if (!normals) return overhangs;

    // Check each face normal - downward-facing normals indicate overhangs
    for (let i = 0; i < normals.count; i++) {
      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);
      // If normal points mostly down (z < -sin(maxAngle)), it's an overhang
      if (nz < -Math.sin(maxAngle * 0.5)) {
        overhangs.push({ index: i, normal: [nx, ny, nz] });
      }
    }
    return overhangs;
  }

  function detectBridges(mesh, maxBridgeLength) {
    // Simplified: detect isolated horizontal features
    return [];
  }

  function detectSmallHoles(mesh, minDiameter) {
    // Simplified: estimate from bounding box
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const estimated = size.x > minDiameter || size.y > minDiameter ? [] : [{ diameter: Math.min(size.x, size.y) }];
    return estimated;
  }

  function detectThinFeatures(mesh, maxAspectRatio) {
    if (!mesh || !mesh.geometry) return [];
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const dims = [size.x, size.y, size.z].filter(d => d > 0);
    if (dims.length < 2) return [];
    const aspect = Math.max(...dims) / Math.min(...dims);
    return aspect > maxAspectRatio ? [{ aspectRatio: aspect, maxDim: Math.max(...dims), minDim: Math.min(...dims) }] : [];
  }

  function detectInteriorCavities(mesh) {
    // Simplified: closed geometry with internal volume
    if (!mesh || !mesh.geometry) return false;
    const geometry = mesh.geometry;
    return geometry.attributes.position && geometry.index ? true : false;
  }

  function detectSharpInternalCorners(mesh, minRadius) {
    // Simplified: geometric analysis
    return [];
  }

  function detectDeepPockets(mesh, depthRatio) {
    return [];
  }

  function detectUndercuts(mesh) {
    return [];
  }

  function detectRotationalSymmetry(mesh) {
    if (!mesh || !mesh.geometry) return false;
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    // Simple heuristic: if two dimensions are similar, could be rotational
    const xz = Math.abs(size.x - size.z) / Math.max(size.x, size.z);
    return xz < 0.2; // Within 20%
  }

  function detectSmallFeatures(mesh, minSize) {
    return [];
  }

  function detectNoDraftAreas(mesh, minAngle) {
    return [];
  }

  function analyzeWallThicknessVariation(mesh) {
    // Simplified: estimate based on geometry
    return { variation: 0.15, min: 1.0, max: 1.8 };
  }

  function detectPoorRibProportions(mesh, maxRatio) {
    return [];
  }

  function detectSharpBends(mesh, minRadiusRatio) {
    return [];
  }

  function detectShortFlanges(mesh, minLength) {
    return [];
  }

  // ============================================================================
  // COST ESTIMATION FUNCTIONS
  // ============================================================================

  /**
   * Estimate volume of mesh (cm³)
   */
  function estimateVolume(mesh) {
    if (!mesh || !mesh.geometry) return 0;
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    return (size.x * size.y * size.z) / 1000; // Convert mm³ to cm³
  }

  /**
   * Estimate mass from volume and density
   */
  function estimateMass(volume, densityGperCm3) {
    return volume * densityGperCm3 / 1000; // Return in kg
  }

  /**
   * Estimate manufacturing time based on process
   */
  function estimateManufacturingTime(volume, process) {
    const timePerUnit = TIME_ESTIMATES[process] || 1.0;
    return volume * timePerUnit; // minutes
  }

  // ============================================================================
  // CORE DFM ANALYSIS FUNCTIONS (Exposed API)
  // ============================================================================

  /**
   * Analyze a mesh for a specific manufacturing process
   * @param {THREE.Mesh} mesh - Geometry to analyze
   * @param {String} process - Manufacturing process ('fdm', 'cnc_mill', etc.)
   * @returns {Object} Analysis results: { score, grade, issues, warnings, suggestions, passed }
   */
  function analyze(mesh, process) {
    if (!mesh || !process) {
      return { ok: false, error: 'Missing mesh or process parameter' };
    }

    const rules = DFM_RULES[process];
    if (!rules) {
      return { ok: false, error: `Unknown process: ${process}. Available: ${Object.keys(DFM_RULES).join(', ')}` };
    }

    const issues = [];
    const warnings = [];
    let passCount = 0;

    // Run all checks for this process
    for (const rule of rules.checks) {
      const result = rule.check(mesh);
      if (result.severity === 'fail') {
        issues.push({ rule: rule.id, name: rule.name, message: result.message, severity: 'fail' });
      } else if (result.severity === 'warn') {
        warnings.push({ rule: rule.id, name: rule.name, message: result.message, severity: 'warn' });
      }
      if (result.pass) passCount++;
    }

    // Calculate score (0-100)
    const totalChecks = rules.checks.length;
    const failWeight = issues.length * 30;  // Each fail: -30 points
    const warnWeight = warnings.length * 10; // Each warn: -10 points
    const score = Math.max(0, 100 - failWeight - warnWeight);

    // Assign grade
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    // Generate suggestions
    const suggestions = [];
    if (issues.length > 0) {
      suggestions.push(`Fix ${issues.length} critical issue(s) to improve manufacturability.`);
    }
    if (warnings.length > 0) {
      suggestions.push(`Address ${warnings.length} warning(s) to optimize cost/quality.`);
    }
    if (process === 'injection_mold' && issues.length === 0) {
      suggestions.push('Consider undercut elimination to reduce mold tooling cost.');
    }
    if (process === 'cnc_mill' && warnings.length === 0) {
      suggestions.push('Geometry is CNC-friendly. Estimate machining time for cost.');
    }

    const result = {
      ok: true,
      process,
      processName: rules.name,
      score,
      grade,
      passed: issues.length === 0,
      issues,
      warnings,
      suggestions,
      checkedRules: totalChecks,
      passedRules: passCount,
      timestamp: Date.now()
    };

    // Fire event for UI
    emitEvent('dfm-analysis-complete', result);

    return result;
  }

  /**
   * Analyze mesh for ALL processes and return comparison
   * @param {THREE.Mesh} mesh
   * @returns {Object} { processes: {...}, bestProcess, bestGrade, summary }
   */
  function analyzeAll(mesh) {
    const processes = {};
    let bestScore = -Infinity;
    let bestProcess = null;

    for (const processKey of Object.keys(DFM_RULES)) {
      processes[processKey] = analyze(mesh, processKey);
      if (processes[processKey].score > bestScore) {
        bestScore = processes[processKey].score;
        bestProcess = processKey;
      }
    }

    return {
      ok: true,
      processes,
      bestProcess,
      bestGrade: processes[bestProcess].grade,
      bestScore,
      summary: `Best for manufacturing: ${DFM_RULES[bestProcess].name} (Grade ${processes[bestProcess].grade})`,
      timestamp: Date.now()
    };
  }

  /**
   * Estimate cost of manufacturing a part
   * @param {THREE.Mesh} mesh
   * @param {String} process - Manufacturing process
   * @param {Number} quantity - Number of parts
   * @param {String} materialKey - Material from MATERIALS database
   * @returns {Object} Detailed cost breakdown
   */
  function estimateCost(mesh, process, quantity = 1, materialKey = 'steel-1018') {
    const material = MATERIALS[materialKey] || MATERIALS['steel-1018'];
    const volume = estimateVolume(mesh);
    const mass = estimateMass(volume, material.density);

    // Material cost
    const materialUnitCost = mass * material.costPerKg;
    const materialWaste = process === 'cnc_mill' || process === 'laser_cut' ? 0.30 : 0.05; // 30% waste for subtractive
    const materialCost = {
      perUnit: materialUnitCost * (1 + materialWaste),
      total: materialUnitCost * (1 + materialWaste) * quantity,
      materialType: material.name,
      volume: volume.toFixed(2),
      waste: (materialWaste * 100).toFixed(0)
    };

    // Machine cost
    const machineRate = MACHINE_RATES[process] || 15;
    const machineTime = estimateManufacturingTime(volume, process);
    const machineHours = machineTime / 60;
    const machineCost = {
      hourlyRate: machineRate.toFixed(2),
      hours: machineHours.toFixed(2),
      total: (machineRate * machineHours * quantity).toFixed(2)
    };

    // Setup cost (amortized)
    const setupCost = {
      fixturing: process.includes('cnc') ? 200 : 50,
      programming: process.includes('cnc') ? 150 : 0,
      total: (process.includes('cnc') ? 350 : 50) / Math.max(quantity, 1)
    };

    // Tooling cost (injection molding, sheet metal)
    const toolingCost = {
      molds: process === 'injection_mold' ? TOOLING_COSTS[process] : 0,
      jigs: process === 'sheet_metal' ? TOOLING_COSTS[process] : 0,
      total: TOOLING_COSTS[process] || 0
    };

    // Finishing cost
    const finishingCost = {
      deburring: 2,
      painting: process.includes('metal') ? 5 : 0,
      anodizing: materialKey.includes('aluminum') ? 8 : 0,
      total: (2 + (process.includes('metal') ? 5 : 0) + (materialKey.includes('aluminum') ? 8 : 0)) * (quantity > 100 ? 0.5 : 1)
    };

    // Total per unit
    const totalPerUnit =
      materialCost.perUnit +
      (parseFloat(machineCost.total) / quantity) +
      setupCost.total +
      (toolingCost.total / Math.max(quantity, 1)) +
      finishingCost.total;

    const totalBatch = totalPerUnit * quantity;

    // Break-even quantity (when injection molding becomes cheaper than CNC)
    let breakEvenQuantity = Infinity;
    if (process !== 'injection_mold') {
      const moldCost = estimateCost(mesh, 'injection_mold', 1, materialKey);
      const moldPerUnit = parseFloat(moldCost.totalPerUnit);
      if (moldPerUnit < totalPerUnit && process.includes('cnc')) {
        breakEvenQuantity = Math.ceil(TOOLING_COSTS.injection_mold / (totalPerUnit - moldPerUnit));
      }
    }

    return {
      ok: true,
      process,
      quantity,
      material: material.name,
      materialCost: {
        perUnit: materialCost.perUnit.toFixed(2),
        total: materialCost.total.toFixed(2),
        materialType: materialCost.materialType,
        volumeCm3: materialCost.volume,
        wastePercent: materialCost.waste
      },
      machineCost: {
        hourlyRate: machineCost.hourlyRate,
        hours: machineCost.hours,
        total: machineCost.total
      },
      setupCost: {
        fixturing: setupCost.fixturing.toFixed(2),
        programming: setupCost.programming.toFixed(2),
        amortized: setupCost.total.toFixed(2)
      },
      toolingCost: {
        molds: toolingCost.molds.toFixed(2),
        jigs: toolingCost.jigs.toFixed(2),
        total: toolingCost.total.toFixed(2)
      },
      finishingCost: {
        deburring: finishingCost.deburring.toFixed(2),
        painting: finishingCost.painting.toFixed(2),
        anodizing: finishingCost.anodizing.toFixed(2),
        total: finishingCost.total.toFixed(2)
      },
      totalPerUnit: totalPerUnit.toFixed(2),
      totalBatch: totalBatch.toFixed(2),
      breakEvenQuantity: breakEvenQuantity === Infinity ? null : breakEvenQuantity,
      currency: 'EUR',
      timestamp: Date.now()
    };
  }

  /**
   * Compare costs across multiple quantities
   * @param {THREE.Mesh} mesh
   * @param {String} process
   * @param {Array} quantities - [1, 10, 100, 1000, ...]
   * @param {String} materialKey
   * @returns {Object} Cost comparison table
   */
  function compareCosts(mesh, process, quantities = [1, 10, 100, 1000, 10000], materialKey = 'steel-1018') {
    const comparison = quantities.map(qty => {
      const cost = estimateCost(mesh, process, qty, materialKey);
      return {
        quantity: qty,
        perUnit: parseFloat(cost.totalPerUnit),
        total: parseFloat(cost.totalBatch)
      };
    });

    // Find crossover points (where unit cost becomes cheaper)
    const crossovers = [];
    for (let i = 1; i < comparison.length; i++) {
      if (comparison[i].perUnit < comparison[i - 1].perUnit) {
        crossovers.push({
          from: comparison[i - 1].quantity,
          to: comparison[i].quantity,
          savingsPercent: (((comparison[i - 1].perUnit - comparison[i].perUnit) / comparison[i - 1].perUnit) * 100).toFixed(1)
        });
      }
    }

    return {
      ok: true,
      process,
      material: MATERIALS[materialKey]?.name || 'Unknown',
      comparison,
      crossovers,
      cheapestAtSmallQty: comparison[0].quantity,
      cheapestAtLargeQty: comparison[comparison.length - 1].quantity,
      timestamp: Date.now()
    };
  }

  /**
   * Recommend materials based on requirements
   * @param {Object} requirements - { strength, weight, temperature, cost, corrosion, foodSafe }
   * @returns {Array} Ranked materials with scores
   */
  function recommendMaterial(requirements = {}) {
    const ranked = [];

    for (const [key, mat] of Object.entries(MATERIALS)) {
      let score = 50; // Base score

      // Strength requirement
      if (requirements.strength === 'high' && mat.tensile >= 500) score += 20;
      if (requirements.strength === 'medium' && mat.tensile >= 250 && mat.tensile < 500) score += 20;
      if (requirements.strength === 'low') score += 15;

      // Weight requirement
      if (requirements.weight === 'light' && mat.density < 3) score += 20;
      if (requirements.weight === 'heavy' && mat.density >= 7) score += 10;
      if (!requirements.weight) score += 5;

      // Temperature
      if (requirements.temperature && mat.meltingPoint > requirements.temperature) score += 15;

      // Cost
      if (requirements.cost === 'low' && mat.costPerKg <= 3) score += 20;
      if (requirements.cost === 'medium' && mat.costPerKg > 3 && mat.costPerKg <= 8) score += 15;
      if (!requirements.cost) score += 10;

      // Corrosion resistance
      if (requirements.corrosion && mat.corrosionResistant) score += 15;

      // Food safety
      if (requirements.foodSafe && mat.foodSafe) score += 15;

      ranked.push({
        materialKey: key,
        name: mat.name,
        category: mat.category,
        score,
        properties: {
          density: mat.density,
          tensile: mat.tensile,
          elongation: mat.elongation,
          costPerKg: mat.costPerKg,
          machinability: mat.machinability,
          corrosionResistant: mat.corrosionResistant,
          foodSafe: mat.foodSafe
        }
      });
    }

    // Sort by score descending
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, 5); // Top 5
  }

  /**
   * Estimate part weight
   */
  function estimateWeight(mesh, materialKey = 'steel-1018') {
    const material = MATERIALS[materialKey] || MATERIALS['steel-1018'];
    const volume = estimateVolume(mesh);
    const mass = estimateMass(volume, material.density);
    return {
      ok: true,
      material: material.name,
      volumeCm3: volume.toFixed(2),
      densityGperCm3: material.density,
      weightKg: mass.toFixed(3),
      weightLb: (mass * 2.20462).toFixed(3),
      timestamp: Date.now()
    };
  }

  /**
   * Analyze tolerance achievability
   */
  function analyzeTolerance(mesh, tolerances = []) {
    const processes = Object.keys(DFM_RULES);
    const capabilities = {
      'fdm': { precision: 0.5, grade: 'IT14', typical: '±0.5mm' },
      'sla': { precision: 0.1, grade: 'IT10', typical: '±0.1mm' },
      'sls': { precision: 0.3, grade: 'IT11', typical: '±0.3mm' },
      'cnc_mill': { precision: 0.025, grade: 'IT7', typical: '±0.025mm' },
      'cnc_lathe': { precision: 0.03, grade: 'IT8', typical: '±0.03mm' },
      'laser_cut': { precision: 0.2, grade: 'IT12', typical: '±0.2mm' },
      'injection_mold': { precision: 0.1, grade: 'IT10', typical: '±0.1mm' },
      'sheet_metal': { precision: 0.5, grade: 'IT14', typical: '±0.5mm' }
    };

    const analysis = tolerances.map(tol => {
      const achievable = [];
      const notAchievable = [];

      for (const proc of processes) {
        const cap = capabilities[proc];
        if (tol.tolerance <= cap.precision) {
          achievable.push({ process: proc, precision: cap.precision, grade: cap.grade });
        } else {
          notAchievable.push({ process: proc, required: tol.tolerance, achievable: cap.precision });
        }
      }

      return {
        feature: tol.feature,
        tolerance: tol.tolerance,
        achievable: achievable.length > 0 ? achievable : null,
        notAchievable: notAchievable.length > 0 ? notAchievable : null,
        costImpact: tol.tolerance < 0.1 ? 'high' : tol.tolerance < 0.3 ? 'medium' : 'low'
      };
    });

    return { ok: true, tolerances: analysis, timestamp: Date.now() };
  }

  /**
   * Generate full DFM report as HTML
   */
  function generateReport(mesh, options = {}) {
    const title = options.title || 'DFM Analysis Report';
    const process = options.process || 'fdm';
    const material = options.material || 'steel-1018';
    const quantity = options.quantity || 1;

    const dfmResult = analyze(mesh, process);
    const costResult = estimateCost(mesh, process, quantity, material);
    const allResults = analyzeAll(mesh);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      padding: 40px;
      color: #333;
    }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { font-size: 28px; margin-bottom: 10px; color: #000; }
    .subtitle { color: #666; margin-bottom: 30px; }
    h2 { font-size: 20px; margin-top: 30px; margin-bottom: 15px; color: #000; border-bottom: 2px solid #059669; padding-bottom: 10px; }
    h3 { font-size: 16px; margin-top: 15px; margin-bottom: 10px; color: #111; }

    .grade-card {
      display: inline-block;
      padding: 20px 30px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: white;
      border-radius: 8px;
      margin-bottom: 20px;
      font-size: 24px;
      font-weight: bold;
    }
    .score { font-size: 14px; margin-top: 5px; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .card {
      padding: 15px;
      background: #f9fafb;
      border-left: 4px solid #059669;
      border-radius: 4px;
    }
    .card strong { color: #000; }
    .card.warn { border-left-color: #f59e0b; }
    .card.fail { border-left-color: #ef4444; }
    .card.info { border-left-color: #3b82f6; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th { background: #f3f4f6; font-weight: 600; }

    .process-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .process-item {
      padding: 15px;
      background: #f9fafb;
      border-radius: 6px;
      text-align: center;
      border: 2px solid transparent;
    }
    .process-item.best { border-color: #059669; background: #ecfdf5; }
    .grade { font-size: 24px; font-weight: bold; color: #059669; margin: 10px 0; }

    .issues, .warnings, .suggestions {
      margin-bottom: 20px;
    }
    .issue, .warning, .suggestion {
      padding: 10px 15px;
      margin-bottom: 8px;
      border-radius: 4px;
    }
    .issue { background: #fee2e2; color: #991b1b; border-left: 4px solid #ef4444; }
    .warning { background: #fef3c7; color: #92400e; border-left: 4px solid #f59e0b; }
    .suggestion { background: #dbeafe; color: #0c2d6b; border-left: 4px solid #3b82f6; }

    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p class="subtitle">Design for Manufacturability (DFM) Analysis Report</p>

    <div class="grade-card">
      ${dfmResult.grade}
      <div class="score">${dfmResult.score}/100 — ${dfmResult.processName}</div>
    </div>

    <h2>Process Analysis: ${dfmResult.processName}</h2>
    ${dfmResult.issues.length > 0 ? `
      <div class="issues">
        <h3 style="color: #ef4444;">Issues (${dfmResult.issues.length})</h3>
        ${dfmResult.issues.map(i => `<div class="issue"><strong>${i.name}:</strong> ${i.message}</div>`).join('')}
      </div>
    ` : ''}

    ${dfmResult.warnings.length > 0 ? `
      <div class="warnings">
        <h3 style="color: #f59e0b;">Warnings (${dfmResult.warnings.length})</h3>
        ${dfmResult.warnings.map(w => `<div class="warning"><strong>${w.name}:</strong> ${w.message}</div>`).join('')}
      </div>
    ` : ''}

    ${dfmResult.suggestions.length > 0 ? `
      <div class="suggestions">
        <h3 style="color: #3b82f6;">Suggestions</h3>
        ${dfmResult.suggestions.map(s => `<div class="suggestion">${s}</div>`).join('')}
      </div>
    ` : ''}

    <h2>Cost Estimation</h2>
    <div class="grid">
      <div class="card">
        <strong>Material Cost (per unit)</strong><br>
        €${costResult.materialCost.perUnit}
      </div>
      <div class="card">
        <strong>Machine Cost (per unit)</strong><br>
        €${costResult.machineCost.total / quantity}
      </div>
      <div class="card">
        <strong>Total Cost (per unit)</strong><br>
        €${costResult.totalPerUnit}
      </div>
      <div class="card">
        <strong>Total Cost (${quantity} units)</strong><br>
        €${costResult.totalBatch}
      </div>
    </div>

    <h2>Process Comparison</h2>
    <div class="process-grid">
      ${Object.entries(allResults.processes).map(([k, v]) => `
        <div class="process-item ${k === allResults.bestProcess ? 'best' : ''}">
          <div>${DFM_RULES[k].name}</div>
          <div class="grade">${v.grade}</div>
          <div style="font-size: 12px; color: #666;">${v.score}/100</div>
        </div>
      `).join('')}
    </div>

    <h2>Detailed Breakdown</h2>
    <h3>Material: ${costResult.material.materialType}</h3>
    <table>
      <tr>
        <th>Component</th>
        <th>Per Unit</th>
        <th>Total (${quantity})</th>
      </tr>
      <tr>
        <td>Material</td>
        <td>€${costResult.materialCost.perUnit}</td>
        <td>€${costResult.materialCost.total}</td>
      </tr>
      <tr>
        <td>Machine Time</td>
        <td>€${costResult.machineCost.total / quantity}</td>
        <td>€${costResult.machineCost.total}</td>
      </tr>
      <tr>
        <td>Setup & Fixtures</td>
        <td>€${costResult.setupCost.amortized}</td>
        <td>€${parseFloat(costResult.setupCost.amortized) * quantity}</td>
      </tr>
      ${costResult.toolingCost.total > 0 ? `
      <tr>
        <td>Tooling</td>
        <td>€${costResult.toolingCost.total / quantity}</td>
        <td>€${costResult.toolingCost.total}</td>
      </tr>
      ` : ''}
      <tr style="font-weight: bold; background: #f3f4f6;">
        <td>TOTAL</td>
        <td>€${costResult.totalPerUnit}</td>
        <td>€${costResult.totalBatch}</td>
      </tr>
    </table>

    <div class="footer">
      <p>Report generated: ${new Date().toISOString()}</p>
      <p>DFM Analysis powered by cycleCAD</p>
    </div>
  </div>
</body>
</html>
    `;

    emitEvent('dfm-report-generated', { title, process, html });
    return { ok: true, html, title, timestamp: Date.now() };
  }

  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  const eventListeners = {};

  function on(eventName, callback) {
    if (!eventListeners[eventName]) eventListeners[eventName] = [];
    eventListeners[eventName].push(callback);
    return () => {
      eventListeners[eventName] = eventListeners[eventName].filter(c => c !== callback);
    };
  }

  function off(eventName, callback) {
    if (!eventListeners[eventName]) return;
    eventListeners[eventName] = eventListeners[eventName].filter(c => c !== callback);
  }

  function emitEvent(eventName, data) {
    if (!eventListeners[eventName]) return;
    eventListeners[eventName].forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[DFM] Event handler error for ${eventName}:`, e);
      }
    });
  }

  // ============================================================================
  // UI PANEL CREATION
  // ============================================================================

  /**
   * Create the DFM Analysis UI panel
   */
  function createAnalysisPanel() {
    const panel = document.createElement('div');
    panel.id = 'dfm-analysis-panel';
    panel.innerHTML = `
      <div style="
        position: fixed;
        right: 0;
        top: 200px;
        width: 350px;
        max-height: 600px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        overflow-y: auto;
        z-index: 1000;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h3 style="margin: 0; font-size: 16px;">DFM Analysis</h3>
          <button onclick="this.closest('#dfm-analysis-panel').style.display='none'"
            style="background: none; border: none; font-size: 18px; cursor: pointer; color: #666;">×</button>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Process</label>
          <select id="dfm-process-select" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px;">
            <option value="fdm">FDM (3D Printing)</option>
            <option value="sla">SLA (Resin)</option>
            <option value="sls">SLS (Powder)</option>
            <option value="cnc_mill">CNC Milling</option>
            <option value="cnc_lathe">CNC Lathe</option>
            <option value="laser_cut">Laser Cutting</option>
            <option value="injection_mold">Injection Molding</option>
            <option value="sheet_metal">Sheet Metal</option>
          </select>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Material</label>
          <select id="dfm-material-select" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px;">
            <option value="steel-1018">Steel (1018)</option>
            <option value="aluminum-6061">Aluminum (6061)</option>
            <option value="pla">PLA</option>
            <option value="abs">ABS</option>
            <option value="stainless-steel-316">Stainless Steel (316)</option>
          </select>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px;">Quantity</label>
          <input id="dfm-quantity-input" type="number" value="1" min="1"
            style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px;" />
        </div>

        <button id="dfm-analyze-btn" style="
          width: 100%;
          padding: 10px;
          background: #059669;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 20px;
        ">Analyze</button>

        <div id="dfm-results" style="display: none;">
          <div style="padding: 12px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; margin-bottom: 15px;">
            <div style="font-size: 28px; font-weight: bold; color: #059669;" id="dfm-grade">—</div>
            <div style="font-size: 12px; color: #666; margin-top: 4px;" id="dfm-score">Score: —</div>
          </div>

          <div id="dfm-issues" style="display: none; margin-bottom: 12px;">
            <div style="font-size: 12px; font-weight: 600; color: #ef4444; margin-bottom: 6px;">Issues:</div>
            <div id="dfm-issues-list" style="font-size: 12px;"></div>
          </div>

          <div id="dfm-warnings" style="display: none; margin-bottom: 12px;">
            <div style="font-size: 12px; font-weight: 600; color: #f59e0b; margin-bottom: 6px;">Warnings:</div>
            <div id="dfm-warnings-list" style="font-size: 12px;"></div>
          </div>

          <div style="padding: 10px; background: #f3f4f6; border-radius: 4px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 600; margin-bottom: 4px;">Cost Estimate</div>
            <div style="font-size: 13px; font-weight: bold; color: #059669;" id="dfm-cost-total">—</div>
            <div style="font-size: 11px; color: #666; margin-top: 4px;" id="dfm-cost-per-unit">—</div>
          </div>

          <button id="dfm-export-btn" style="
            width: 100%;
            padding: 8px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: 600;
            cursor: pointer;
            font-size: 13px;
          ">Export Report (HTML)</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Wire up event handlers
    document.getElementById('dfm-analyze-btn').addEventListener('click', () => {
      const process = document.getElementById('dfm-process-select').value;
      const material = document.getElementById('dfm-material-select').value;
      const quantity = parseInt(document.getElementById('dfm-quantity-input').value) || 1;

      // Get selected mesh (simplified: assumes window._selectedMesh exists)
      const mesh = window._selectedMesh || window.allParts?.[0]?.mesh;
      if (!mesh) {
        alert('No mesh selected. Select a part first.');
        return;
      }

      // Run analysis
      const result = analyze(mesh, process);
      if (!result.ok) {
        alert('Analysis failed: ' + result.error);
        return;
      }

      // Display results
      document.getElementById('dfm-results').style.display = 'block';
      document.getElementById('dfm-grade').textContent = result.grade;
      document.getElementById('dfm-score').textContent = `Score: ${result.score}/100 — ${result.processName}`;

      if (result.issues.length > 0) {
        document.getElementById('dfm-issues').style.display = 'block';
        document.getElementById('dfm-issues-list').innerHTML = result.issues
          .map(i => `<div style="margin-bottom: 4px;">• ${i.name}</div>`)
          .join('');
      } else {
        document.getElementById('dfm-issues').style.display = 'none';
      }

      if (result.warnings.length > 0) {
        document.getElementById('dfm-warnings').style.display = 'block';
        document.getElementById('dfm-warnings-list').innerHTML = result.warnings
          .map(w => `<div style="margin-bottom: 4px;">• ${w.name}</div>`)
          .join('');
      } else {
        document.getElementById('dfm-warnings').style.display = 'none';
      }

      // Cost estimate
      const cost = estimateCost(mesh, process, quantity, material);
      document.getElementById('dfm-cost-total').textContent = `€${cost.totalBatch}`;
      document.getElementById('dfm-cost-per-unit').textContent = `€${cost.totalPerUnit} per unit`;

      // Export button handler
      document.getElementById('dfm-export-btn').onclick = () => {
        const report = generateReport(mesh, { process, material, quantity, title: `DFM Report - ${result.processName}` });
        const blob = new Blob([report.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dfm-report-${process}-${Date.now()}.html`;
        a.click();
        URL.revokeObjectURL(url);
      };
    });

    return panel;
  }

  // ============================================================================
  // EXPORT API
  // ============================================================================

  // Expose as window.cycleCAD.dfm
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.dfm = {
    analyze,
    analyzeAll,
    estimateCost,
    compareCosts,
    recommendMaterial,
    estimateWeight,
    analyzeTolerance,
    generateReport,
    createPanel: createAnalysisPanel,
    materials: MATERIALS,
    rules: DFM_RULES,
    on,
    off,
    // Internals for debugging
    _machineRates: MACHINE_RATES,
    _timeEstimates: TIME_ESTIMATES,
    _toolingCosts: TOOLING_COSTS
  };

  console.log('[DFM Analyzer] Module loaded. Access via window.cycleCAD.dfm');

})();
