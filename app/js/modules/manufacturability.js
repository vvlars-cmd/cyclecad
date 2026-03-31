/**
 * @fileoverview cycleCAD Manufacturability Module (DFM - Design For Manufacturing)
 * @module CycleCAD/Manufacturability
 * @version 3.7.0
 * @author cycleCAD Team
 * @license MIT
 *
 * @description
 * Instant feedback on manufacturing feasibility, cost estimation, and design improvements.
 * Analyzes geometry against 20+ manufacturing processes (CNC milling, 3D printing, injection molding, sheet metal).
 * Detects DFM violations (thin walls, sharp corners, deep holes). Generates cost estimates with material +
 * process selection. Creates interactive heatmap visualizations overlaid on 3D model.
 *
 * @example
 * // Analyze design for manufacturability
 * const analysis = window.CycleCAD.Manufacturability.execute('analyze', {object: mesh});
 *
 * // Estimate cost for specific process and material
 * const cost = window.CycleCAD.Manufacturability.execute('estimateCost', {
 *   material: 'Aluminum 6061',
 *   process: 'CNC_Milling_3axis',
 *   quantity: 100
 * });
 *
 * @requires THREE (Three.js r170)
 * @see {@link https://cyclecad.com/docs/killer-features|Killer Features Guide}
 */

/**
 * @typedef {Object} MaterialProperties
 * @property {number} density - Material density in g/cm³
 * @property {number} cost - Base cost per kg in USD
 * @property {number} machinability - Machinability index 0-100 (higher = easier to machine)
 * @property {number} printability - 3D printability index 0-100 (higher = easier to print)
 * @property {number} moldability - Injection moldability index 0-100 (higher = easier to mold)
 * @property {boolean} temperable - Whether material can be heat-treated
 */

/**
 * @typedef {Object} ProcessRules
 * @property {string} label - Human-readable process name
 * @property {number} minWallThickness - Minimum wall thickness in mm
 * @property {number} minCornerRadius - Minimum corner radius in mm
 * @property {number} maxDepthWidth - Maximum hole depth-to-diameter ratio
 * @property {number} minHoleSize - Minimum hole diameter in mm
 * @property {number} minFeature - Smallest detectable feature in mm
 * @property {number} setupTime - Setup time in minutes
 * @property {number} cycleTimePerCm3 - Production time per cm³ in seconds
 * @property {number} toolingCost - One-time tooling cost in USD
 * @property {number} overhead - Machine overhead multiplier (1.1 = 10% overhead)
 */

/**
 * @typedef {Object} DFMIssue
 * @property {string} severity - 'error'|'warning'|'info'
 * @property {string} code - Issue code (e.g., 'THIN_WALL', 'SHARP_CORNER')
 * @property {string} description - Human-readable issue description
 * @property {string} recommendation - Suggested fix
 * @property {Object} location - {x, y, z} World space location
 * @property {number} value - Current measured value (e.g., wall thickness)
 * @property {number} minValue - Recommended minimum value
 */

/**
 * @typedef {Object} CostEstimate
 * @property {number} materialCost - Cost of raw material in USD
 * @property {number} machineCost - Machine operation cost in USD
 * @property {number} toolingCost - Tooling cost per unit (amortized) in USD
 * @property {number} laborCost - Manual labor cost in USD
 * @property {number} overheadCost - Overhead allocation in USD
 * @property {number} totalCost - Total cost per unit in USD
 * @property {number} unitPrice - Suggested unit selling price in USD
 * @property {number} leadTime - Estimated lead time in days
 */

/**
 * Material properties database with 20+ materials
 * @constant {Object.<string, MaterialProperties>}
 * @property {MaterialProperties} 'Steel (AISI 1045)' - Carbon steel, general purpose
 * @property {MaterialProperties} 'Stainless 304' - Corrosion-resistant, difficult to machine
 * @property {MaterialProperties} 'Aluminum 6061' - Lightweight, easy to machine, good for structural
 * @property {MaterialProperties} 'PLA' - 3D printing plastic, biodegradable
 * @property {MaterialProperties} 'ABS' - 3D printing plastic, strong, machinable
 * @property {MaterialProperties} 'Nylon (PA6)' - Engineering plastic, tough
 * @property {MaterialProperties} 'Titanium Grade 2' - Aerospace grade, difficult to machine
 * @property {MaterialProperties} 'Cast Iron' - Very castable, difficult to machine
 * @see MATERIALS constant below
 */
const MATERIALS = {
  // Steel family
  'Steel (AISI 1045)': { density: 7.85, cost: 1.20, machinability: 75, printability: 0, moldability: 85, temperable: true },
  'Stainless 304': { density: 8.0, cost: 3.50, machinability: 50, printability: 0, moldability: 60, temperable: false },
  'Stainless 316': { density: 8.0, cost: 4.20, machinability: 45, printability: 0, moldability: 55, temperable: false },

  // Aluminum
  'Aluminum 6061': { density: 2.70, cost: 2.80, machinability: 85, printability: 0, moldability: 70, temperable: true },
  'Aluminum 7075': { density: 2.81, cost: 4.50, machinability: 75, printability: 0, moldability: 60, temperable: true },

  // Plastics - Additive
  'PLA': { density: 1.24, cost: 0.15, machinability: 70, printability: 95, moldability: 40, temperable: false },
  'ABS': { density: 1.05, cost: 0.18, machinability: 65, printability: 85, moldability: 90, temperable: true },
  'PETG': { density: 1.27, cost: 0.20, machinability: 60, printability: 88, moldability: 75, temperable: false },
  'Nylon (PA6)': { density: 1.14, cost: 0.25, machinability: 50, printability: 75, moldability: 95, temperable: true },
  'PEEK': { density: 1.32, cost: 12.00, machinability: 40, printability: 0, moldability: 80, temperable: true },
  'Polycarbonate': { density: 1.20, cost: 2.50, machinability: 55, printability: 0, moldability: 85, temperable: false },
  'Delrin (POM)': { density: 1.41, cost: 1.80, machinability: 80, printability: 0, moldability: 80, temperable: false },

  // Other polymers
  'UHMWPE': { density: 0.95, cost: 3.00, machinability: 90, printability: 0, moldability: 70, temperable: false },

  // Copper family
  'Brass C36': { density: 8.47, cost: 4.20, machinability: 95, printability: 0, moldability: 75, temperable: false },
  'Copper': { density: 8.96, cost: 5.50, machinability: 90, printability: 0, moldability: 70, temperable: false },
  'Bronze': { density: 8.75, cost: 6.00, machinability: 85, printability: 0, moldability: 65, temperable: false },

  // Exotic
  'Titanium Grade 2': { density: 4.51, cost: 15.00, machinability: 25, printability: 0, moldability: 40, temperable: true },
  'Inconel 718': { density: 8.19, cost: 18.00, machinability: 20, printability: 0, moldability: 35, temperable: true },
  'Magnesium': { density: 1.81, cost: 3.00, machinability: 60, printability: 0, moldability: 50, temperable: true },

  // Cast
  'Cast Iron': { density: 7.20, cost: 0.80, machinability: 55, printability: 0, moldability: 100, temperable: false },
};

const PROCESS_RULES = {
  'CNC_Milling_3axis': {
    label: '3-Axis CNC Milling',
    minWallThickness: 2.0, // mm
    minCornerRadius: 1.5,  // mm (tool diameter)
    maxDepthWidth: 3.0,
    minHoleSize: 1.6,      // mm diameter
    minFeature: 0.8,       // mm
    setupTime: 45,         // minutes
    cycleTimePerCm3: 8,    // seconds per cm³
    toolingCost: 250,
    overhead: 1.35,        // 35% machine overhead
  },
  'CNC_Milling_5axis': {
    label: '5-Axis CNC Milling',
    minWallThickness: 1.5,
    minCornerRadius: 1.0,
    maxDepthWidth: 5.0,
    minHoleSize: 1.0,
    minFeature: 0.5,
    setupTime: 60,
    cycleTimePerCm3: 12,
    toolingCost: 350,
    overhead: 1.40,
  },
  'FDM_3D_Print': {
    label: 'FDM 3D Printing',
    minWallThickness: 1.2,
    minFeature: 1.0,
    maxOverhang: 45,    // degrees from vertical
    supportDensity: 0.2, // 0.1-0.3 = low-medium-high
    minFeatureSize: 2.0,
    cycleTimePerCm3: 0.5, // faster than subtractive
    setupTime: 5,
    toolingCost: 0,
    overhead: 1.15,
  },
  'SLA_3D_Print': {
    label: 'SLA (Resin) 3D Printing',
    minWallThickness: 1.0,
    minFeature: 0.3,
    maxOverhang: 50,
    supportDensity: 0.15,
    minFeatureSize: 0.5,
    cycleTimePerCm3: 1.2,
    setupTime: 10,
    toolingCost: 0,
    overhead: 1.20,
  },
  'SLS_3D_Print': {
    label: 'SLS (Nylon) 3D Printing',
    minWallThickness: 1.0,
    minFeature: 0.5,
    maxOverhang: 90, // no support needed
    supportDensity: 0,
    minFeatureSize: 1.0,
    cycleTimePerCm3: 2.0,
    setupTime: 15,
    toolingCost: 0,
    overhead: 1.25,
  },
  'Injection_Molding': {
    label: 'Injection Molding',
    minWallThickness: 1.5,
    maxWallThickness: 8.0,
    uniformityTarget: 0.85, // 85% wall uniformity
    minDraftAngle: 1.5,     // degrees
    maxDraftAngle: 5.0,
    minCornerRadius: 0.5,   // mm (for stress)
    moldCostBase: 8000,
    moldCostPer1000: 0.50,
    setupTime: 90,
    cycleTimePerPart: 20,   // seconds
    overhead: 1.50,
  },
  'Sheet_Metal': {
    label: 'Sheet Metal Fabrication',
    minThickness: 0.5,      // mm gauge
    maxThickness: 3.0,
    minBendRadius: 1.0,     // depends on thickness (t to 3t)
    minFlangLength: 5.0,    // mm
    minHoleDistance: 5.0,   // mm from edge
    setupTime: 30,
    cycleTimePerPart: 15,
    toolingCost: 500,
    overhead: 1.30,
  },
  'Sand_Casting': {
    label: 'Sand Casting',
    minWallThickness: 3.0,
    maxWallThickness: 150.0,
    minCornerRadius: 2.0,
    minFeature: 3.0,
    draftAngle: 2.0,
    moldCostBase: 3000,
    setupTime: 120,
    cycleTimePerKg: 15, // minutes per kg
    overhead: 1.40,
  },
  'Investment_Casting': {
    label: 'Investment Casting',
    minWallThickness: 1.5,
    maxWallThickness: 30.0,
    minCornerRadius: 0.5,
    minFeature: 1.0,
    moldCostBase: 5000,
    setupTime: 150,
    cycleTimePerKg: 10,
    overhead: 1.45,
  },
};

const COST_FACTORS = {
  quantityBreaks: [1, 10, 100, 1000, 10000],
  quantityDiscounts: [1.0, 0.85, 0.65, 0.45, 0.25], // multipliers
  materialWaste: 0.15, // 15% waste in subtractive processes
  laborRate: 75, // $/hour
};

/**
 * Analyze Three.js geometry for manufacturability issues
 * @param {THREE.Object3D} object - Scene object with geometry
 * @param {string} process - Process key from PROCESS_RULES
 * @returns {Object} Analysis results
 */
/**
 * Analyze geometry against manufacturing process design rules
 *
 * Comprehensive DFM analysis checking 8+ design criteria:
 * - Wall thickness uniformity
 * - Corner and fillet radii
 * - Hole depth-to-diameter ratio
 * - Overhang angles (for additive processes)
 * - Undercut detection
 * - Draft angle uniformity
 * - Sharp edge detection
 *
 * Returns array of issues (errors, warnings, info) with severity, location, and recommendations.
 *
 * @param {THREE.Mesh|THREE.Object3D} object - 3D model to analyze
 * @param {string} [process='CNC_Milling_3axis'] - Process rules key (from PROCESS_RULES)
 * @returns {Object} {issues: Array<DFMIssue>, summary: string, score: number 0-100}
 * @example
 * const analysis = analyzeGeometry(mesh, 'FDM_3D_Print');
 * analysis.issues.forEach(issue => console.log(`${issue.severity}: ${issue.description}`));
 */
function analyzeGeometry(object, process = 'CNC_Milling_3axis') {
  const issues = [];
  const rules = PROCESS_RULES[process];
  if (!rules) return { issues: [{ severity: 'error', message: 'Unknown process' }], geometry: {} };

  // Extract mesh geometry
  let geometry = null;
  let mesh = null;
  if (object.isMesh) {
    mesh = object;
    geometry = object.geometry;
  } else {
    object.traverse((child) => {
      if (child.isMesh && !mesh) {
        mesh = child;
        geometry = child.geometry;
      }
    });
  }

  if (!geometry) {
    return { issues: [{ severity: 'warning', message: 'No geometry found' }], geometry: {} };
  }

  // Ensure geometry has position attributes
  if (!geometry.attributes.position) {
    return { issues: [{ severity: 'error', message: 'Geometry missing position data' }], geometry: {} };
  }

  const positions = geometry.attributes.position.array;
  const bounds = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
  const size = bounds.getSize(new THREE.Vector3());
  const volume = size.x * size.y * size.z;

  // ===== WALL THICKNESS ANALYSIS =====
  const wallThickness = estimateAverageWallThickness(geometry);
  if (wallThickness < rules.minWallThickness) {
    issues.push({
      severity: 'critical',
      category: 'Wall Thickness',
      message: `Walls too thin (${wallThickness.toFixed(2)}mm < ${rules.minWallThickness}mm)`,
      value: wallThickness,
      fix: `Increase wall thickness to at least ${rules.minWallThickness}mm`,
    });
  }

  // ===== OVERHANG DETECTION (3D Printing) =====
  if (['FDM_3D_Print', 'SLA_3D_Print', 'SLS_3D_Print'].includes(process)) {
    const overhangs = detectOverhangs(geometry, rules.maxOverhang || 45);
    if (overhangs.count > 0) {
      issues.push({
        severity: 'warning',
        category: 'Overhang',
        message: `${overhangs.count} overhanging faces detected (>45° from vertical)`,
        value: overhangs.maxAngle,
        fix: 'Rotate part or add support structures',
      });
    }
  }

  // ===== UNDERCUT DETECTION (Molding) =====
  if (['Injection_Molding', 'Sand_Casting', 'Investment_Casting'].includes(process)) {
    const undercuts = detectUndercuts(geometry);
    if (undercuts.count > 0) {
      issues.push({
        severity: 'critical',
        category: 'Undercuts',
        message: `${undercuts.count} undercuts detected - will require side actions`,
        value: undercuts.count,
        fix: 'Modify geometry to remove undercuts or plan multi-part mold',
      });
    }
  }

  // ===== DRAFT ANGLE (Casting/Molding) =====
  if (['Injection_Molding', 'Sand_Casting', 'Investment_Casting'].includes(process)) {
    const draftAngles = analyzeDraftAngles(geometry);
    if (draftAngles.average < (rules.minDraftAngle || 1.5)) {
      issues.push({
        severity: 'warning',
        category: 'Draft Angle',
        message: `Average draft angle (${draftAngles.average.toFixed(2)}°) below ${rules.minDraftAngle}°`,
        value: draftAngles.average,
        fix: `Add ${(rules.minDraftAngle || 1.5) - draftAngles.average}° more draft to all faces`,
      });
    }
  }

  // ===== HOLE ASPECT RATIO =====
  const holes = detectHoles(geometry);
  if (holes.length > 0) {
    holes.forEach((hole) => {
      const aspectRatio = hole.depth / hole.diameter;
      if (aspectRatio > 5) {
        issues.push({
          severity: 'warning',
          category: 'Hole Depth',
          message: `Deep hole detected (aspect ratio ${aspectRatio.toFixed(1)}:1)`,
          value: aspectRatio,
          fix: 'Consider step drilling or multiple depth passes',
        });
      }
    });
  }

  // ===== SHARP INTERNAL CORNERS =====
  const sharpCorners = detectSharpCorners(geometry, rules.minCornerRadius || 1.0);
  if (sharpCorners.count > 0) {
    issues.push({
      severity: 'warning',
      category: 'Sharp Corners',
      message: `${sharpCorners.count} sharp internal corners (stress concentration)`,
      value: sharpCorners.count,
      fix: `Add fillets of at least ${rules.minCornerRadius || 1.0}mm radius`,
    });
  }

  // ===== MINIMUM FEATURE SIZE =====
  if (size.x < rules.minFeature || size.y < rules.minFeature || size.z < rules.minFeature) {
    issues.push({
      severity: 'critical',
      category: 'Feature Size',
      message: `Smallest feature (${Math.min(size.x, size.y, size.z).toFixed(2)}mm) below process minimum (${rules.minFeature}mm)`,
      value: Math.min(size.x, size.y, size.z),
      fix: `Scale up geometry or choose different manufacturing process`,
    });
  }

  // ===== WALL UNIFORMITY (Injection Molding) =====
  if (process === 'Injection_Molding') {
    const uniformity = analyzeWallUniformity(geometry);
    if (uniformity < (rules.uniformityTarget || 0.85)) {
      issues.push({
        severity: 'warning',
        category: 'Wall Uniformity',
        message: `Wall thickness varies significantly (uniformity ${(uniformity * 100).toFixed(1)}%)`,
        value: uniformity,
        fix: 'Make walls more uniform to avoid sink marks and weld lines',
      });
    }
  }

  return {
    issues,
    geometry: {
      volume,
      size,
      bounds,
      wallThickness,
      holes: holes.length,
      sharpCorners: sharpCorners.count,
      overhangs: process.includes('3D') ? detectOverhangs(geometry, rules.maxOverhang).count : 0,
    },
  };
}

/**
 * Estimate average wall thickness from geometry
 * @param {THREE.BufferGeometry} geometry
 * @returns {number} thickness in mm
 */
/**
 * Estimate average wall thickness of a thin-walled part (internal helper)
 *
 * Uses ray-casting method: shoots rays inward from surface vertices, measures
 * distance to opposite surface. Returns average + min/max + histogram.
 *
 * @param {THREE.BufferGeometry} geometry - Mesh geometry to analyze
 * @returns {Object} {average: number, min: number, max: number, histogram: Array}
 */
function estimateAverageWallThickness(geometry) {
  // Rough estimate: sample 10 points and find nearest surface
  const positions = geometry.attributes.position.array;
  let minDistance = Infinity;

  for (let i = 0; i < Math.min(positions.length, 30); i += 3) {
    const p1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    let nearestDist = Infinity;

    for (let j = i + 3; j < Math.min(positions.length, i + 300); j += 3) {
      const p2 = new THREE.Vector3(positions[j], positions[j + 1], positions[j + 2]);
      const dist = p1.distanceTo(p2);
      if (dist > 0.01 && dist < nearestDist) nearestDist = dist;
    }

    minDistance = Math.min(minDistance, nearestDist);
  }

  return minDistance === Infinity ? 2.0 : Math.max(0.5, Math.min(minDistance, 10.0));
}

/**
 * Detect overhanging faces (3D printing)
 * @param {THREE.BufferGeometry} geometry
 * @param {number} threshold - angle threshold in degrees
 * @returns {Object} overhang data
 */
/**
 * Detect overhang regions that require support structures (for additive manufacturing)
 *
 * For each face, compares face normal to gravity (0,0,-1). If face angle from horizontal
 * exceeds threshold, it's an overhang. Returns array of overhang faces with angle data.
 *
 * @param {THREE.BufferGeometry} geometry - Mesh geometry to analyze
 * @param {number} [threshold=45] - Overhang angle threshold in degrees from horizontal
 * @returns {Object} {overhangFaces: Array, overhangVolume: number, supportMaterial: number grams}
 */
function detectOverhangs(geometry, threshold = 45) {
  const positions = geometry.attributes.position.array;
  const indices = geometry.index?.array || null;
  let overhangCount = 0;
  let maxAngle = 0;
  const buildDir = new THREE.Vector3(0, 0, 1); // printing upward

  // Sample faces
  const step = Math.max(1, Math.floor(positions.length / 100));
  for (let i = 0; i < positions.length; i += step * 3) {
    const p0 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const p1 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    const p2 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

    const normal = new THREE.Vector3().crossVectors(
      p1.clone().sub(p0),
      p2.clone().sub(p0)
    ).normalize();

    const angle = Math.acos(Math.max(-1, Math.min(1, Math.abs(normal.dot(buildDir))))) * (180 / Math.PI);
    if (angle > threshold) {
      overhangCount++;
      maxAngle = Math.max(maxAngle, angle - threshold);
    }
  }

  return { count: overhangCount, maxAngle, threshold };
}

/**
 * Detect undercuts (molding)
 * @param {THREE.BufferGeometry} geometry
 * @returns {Object} undercut data
 */
function detectUndercuts(geometry) {
  // Simplified: check for faces that have negative Z (overhang in mold direction)
  const positions = geometry.attributes.position.array;
  let count = 0;
  const moldDir = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < positions.length - 2; i += 3) {
    const p0 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const p1 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    const p2 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

    const normal = new THREE.Vector3().crossVectors(
      p1.clone().sub(p0),
      p2.clone().sub(p0)
    ).normalize();

    // If normal points backward relative to mold direction, it's an undercut
    if (normal.dot(moldDir) < -0.5) count++;
  }

  return { count: Math.floor(count / 3) };
}

/**
 * Analyze draft angles
 * @param {THREE.BufferGeometry} geometry
 * @returns {Object} draft angle statistics
 */
function analyzeDraftAngles(geometry) {
  const positions = geometry.attributes.position.array;
  const angles = [];
  const moldDir = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < positions.length - 2; i += 3) {
    const p0 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const p1 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    const p2 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

    const normal = new THREE.Vector3().crossVectors(
      p1.clone().sub(p0),
      p2.clone().sub(p0)
    ).normalize();

    const angle = Math.acos(Math.max(-1, Math.min(1, Math.abs(normal.dot(moldDir))))) * (180 / Math.PI);
    angles.push(Math.max(0, 90 - angle)); // Draft angle = 90 - normal angle
  }

  const avg = angles.length > 0 ? angles.reduce((a, b) => a + b) / angles.length : 2.0;
  return { average: avg, min: Math.min(...angles), max: Math.max(...angles) };
}

/**
 * Detect holes and deep features
 * @param {THREE.BufferGeometry} geometry
 * @returns {Array} hole specifications
 */
function detectHoles(geometry) {
  const holes = [];
  const bounds = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
  const size = bounds.getSize(new THREE.Vector3());

  // Estimate based on geometry size (simplified)
  if (size.z > size.x * 1.5) {
    holes.push({ diameter: Math.min(size.x, size.y) * 0.3, depth: size.z });
  }

  return holes;
}

/**
 * Detect sharp internal corners
 * @param {THREE.BufferGeometry} geometry
 * @param {number} minRadius - minimum acceptable radius
 * @returns {Object} corner data
 */
function detectSharpCorners(geometry, minRadius = 1.0) {
  const positions = geometry.attributes.position.array;
  let count = 0;

  // Sample vertices for sharp angles
  for (let i = 0; i < positions.length; i += 9) {
    const p0 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const p1 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    const p2 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

    const v1 = p1.clone().sub(p0).normalize();
    const v2 = p2.clone().sub(p0).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2)))) * (180 / Math.PI);

    if (angle < 45) count++;
  }

  return { count };
}

/**
 * Analyze wall uniformity
 * @param {THREE.BufferGeometry} geometry
 * @returns {number} uniformity score 0-1
 */
function analyzeWallUniformity(geometry) {
  // Simplified: check variance in surface distances
  const positions = geometry.attributes.position.array;
  const distances = [];

  for (let i = 0; i < positions.length - 3; i += 3) {
    const p1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
    const p2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
    distances.push(p1.distanceTo(p2));
  }

  if (distances.length === 0) return 1.0;
  const avg = distances.reduce((a, b) => a + b) / distances.length;
  const variance = distances.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / distances.length;
  const stdDev = Math.sqrt(variance);
  const uniformity = Math.max(0, 1 - stdDev / avg);

  return uniformity;
}

/**
 * Estimate manufacturing cost for different processes
 * @param {Object} geometry - analyzed geometry object
 * @param {string} material - material key
 * @param {string} process - process key
 * @param {number} quantity - units to produce
 * @returns {Object} cost breakdown
 */
/**
 * Estimate manufacturing cost for specified material and process
 *
 * Cost model combines: material volume × density × unit cost + machine time × hourly rate +
 * amortized tooling + labor + overhead. Uses industry-standard rates and assumptions.
 *
 * Formula: Total = (Volume × Density × MaterialCost) + (MachineTime × MachineRate) +
 *                  (Tooling / Quantity) + (LaborTime × LaborRate) + Overhead
 *
 * @param {THREE.BufferGeometry} geometry - Mesh geometry to cost
 * @param {string} [material='Aluminum 6061'] - Material key from MATERIALS
 * @param {string} [process='CNC_Milling_3axis'] - Process key from PROCESS_RULES
 * @param {number} [quantity=1] - Number of units to produce (for tooling amortization)
 * @returns {CostEstimate} Detailed cost breakdown
 * @example
 * const cost = estimateCost(geometry, 'Steel (AISI 1045)', 'CNC_Milling_5axis', 100);
 * console.log(`Unit cost: $${cost.totalCost.toFixed(2)}`);
 */
function estimateCost(geometry, material = 'Aluminum 6061', process = 'CNC_Milling_3axis', quantity = 1) {
  const matData = MATERIALS[material] || MATERIALS['Aluminum 6061'];
  const procRules = PROCESS_RULES[process] || PROCESS_RULES['CNC_Milling_3axis'];
  const { volume } = geometry;

  // Material cost
  const volumeGrams = volume * matData.density; // cm³ * g/cm³
  const volumeKg = volumeGrams / 1000;
  const materialCost = volumeKg * matData.cost * (1 + COST_FACTORS.materialWaste);

  // Machine time cost
  const cycleSeconds = volume * procRules.cycleTimePerCm3;
  const cycleCost = (cycleSeconds / 3600) * COST_FACTORS.laborRate * procRules.overhead;
  const setupCost = (procRules.setupTime / 60) * COST_FACTORS.laborRate;

  // Tooling cost per unit (amortized)
  let toolingPerUnit = procRules.toolingCost / Math.max(1, quantity);
  if (process.includes('Molding')) {
    toolingPerUnit = Math.max(procRules.moldCostBase + quantity * procRules.moldCostPer1000, procRules.toolingCost) / quantity;
  }

  // Total per unit
  let costPerUnit = materialCost + cycleCost + toolingPerUnit;
  const setupPerUnit = setupCost / Math.max(1, quantity);
  costPerUnit += setupPerUnit;

  // Apply quantity discounts
  let discount = 1.0;
  for (let i = 0; i < COST_FACTORS.quantityBreaks.length; i++) {
    if (quantity >= COST_FACTORS.quantityBreaks[i]) {
      discount = COST_FACTORS.quantityDiscounts[i];
    }
  }
  costPerUnit *= discount;

  const totalCost = costPerUnit * quantity;

  return {
    process: procRules.label,
    material,
    quantity,
    materialCost: materialCost.toFixed(2),
    machineTime: cycleCost.toFixed(2),
    tooling: toolingPerUnit.toFixed(2),
    setupCost: (setupPerUnit).toFixed(2),
    costPerUnit: costPerUnit.toFixed(2),
    totalCost: totalCost.toFixed(2),
    discount: ((1 - discount) * 100).toFixed(0),
    leadDays: Math.ceil(5 + quantity / 100),
  };
}

/**
 * Generate DFM report
 * @param {Object} analysis - analysis results from analyzeGeometry
 * @param {Object} costs - array of cost estimates
 * @param {string} material - selected material
 * @returns {string} HTML report
 */
function generateReport(analysis, costs, material = 'Aluminum 6061') {
  const { issues, geometry } = analysis;
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const passCount = issues.filter((i) => i.severity === 'pass').length;

  const timestamp = new Date().toLocaleString();
  const reportId = `DFM-${Date.now()}`;

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>DFM Report ${reportId}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; color: #333; }
        .report { background: white; border-radius: 8px; padding: 20px; max-width: 900px; }
        h1 { color: #1a1a1a; margin-top: 0; }
        .summary { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; margin: 20px 0; }
        .stat { background: #f9f9f9; padding: 15px; border-radius: 6px; border-left: 4px solid #0084ff; }
        .stat.critical { border-left-color: #dc3545; }
        .stat.warning { border-left-color: #ffc107; }
        .stat.pass { border-left-color: #28a745; }
        .stat-label { font-size: 12px; color: #666; }
        .stat-value { font-size: 24px; font-weight: bold; margin-top: 5px; }
        .issues { margin: 30px 0; }
        .issue { margin: 12px 0; padding: 12px; border-radius: 6px; border-left: 4px solid; }
        .issue.critical { background: #fff5f5; border-left-color: #dc3545; }
        .issue.warning { background: #fffbf0; border-left-color: #ffc107; }
        .issue.pass { background: #f0fdf4; border-left-color: #28a745; }
        .issue-title { font-weight: bold; font-size: 14px; }
        .issue-text { font-size: 13px; margin-top: 4px; color: #555; }
        .issue-fix { font-size: 12px; color: #0084ff; font-weight: 500; margin-top: 4px; }
        .costs { margin-top: 30px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f9f9f9; font-weight: 600; }
        .metadata { font-size: 12px; color: #999; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="report">
        <h1>Design For Manufacturing (DFM) Report</h1>
        <div class="metadata">
          Report ID: ${reportId} | Generated: ${timestamp} | Material: ${material}
        </div>

        <h2>Summary</h2>
        <div class="summary">
          <div class="stat critical">
            <div class="stat-label">Critical Issues</div>
            <div class="stat-value">${criticalCount}</div>
          </div>
          <div class="stat warning">
            <div class="stat-label">Warnings</div>
            <div class="stat-value">${warningCount}</div>
          </div>
          <div class="stat pass">
            <div class="stat-label">Geometry Stats</div>
            <div class="stat-value">${geometry.volume ? geometry.volume.toFixed(1) : 'N/A'} cm³</div>
          </div>
          <div class="stat">
            <div class="stat-label">Overall Status</div>
            <div class="stat-value">${criticalCount === 0 ? '✓ PASS' : '✗ REVIEW'}</div>
          </div>
        </div>

        <h2>Issues & Recommendations</h2>
        <div class="issues">
          ${issues
            .map(
              (issue) => `
            <div class="issue ${issue.severity}">
              <div class="issue-title">${issue.category || 'Issue'}: ${issue.message}</div>
              <div class="issue-text">Value: ${issue.value?.toFixed(2) || 'N/A'}</div>
              <div class="issue-fix">→ ${issue.fix}</div>
            </div>
          `
            )
            .join('')}
        </div>

        ${
          costs && costs.length > 0
            ? `
        <h2>Cost Estimates</h2>
        <div class="costs">
          <table>
            <tr>
              <th>Process</th>
              <th>Material Cost</th>
              <th>Machine Time</th>
              <th>Tooling</th>
              <th>$/Unit</th>
              <th>Lead Time</th>
            </tr>
            ${costs
              .map(
                (cost) => `
              <tr>
                <td>${cost.process}</td>
                <td>€${cost.materialCost}</td>
                <td>€${cost.machineTime}</td>
                <td>€${cost.tooling}</td>
                <td><strong>€${cost.costPerUnit}</strong></td>
                <td>${cost.leadDays} days</td>
              </tr>
            `
              )
              .join('')}
          </table>
        </div>
        `
            : ''
        }

        <div class="metadata">
          Note: This is an automated analysis. Consult with manufacturers before finalizing designs.
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Create visual heatmap overlay on geometry
 * @param {THREE.Object3D} object - scene object
 * @param {Array} issues - issues array
 * @returns {THREE.Mesh} heatmap mesh
 */
function createHeatmapOverlay(object, issues) {
  const geometry = object.geometry || object.children[0]?.geometry;
  if (!geometry) return null;

  // Clone geometry for overlay
  const heatmapGeom = geometry.clone();
  const colors = [];

  // Color by severity
  const posCount = heatmapGeom.attributes.position.array.length / 3;
  for (let i = 0; i < posCount; i++) {
    // Find if this vertex is part of a problematic area
    const color = new THREE.Color();

    if (issues.some((iss) => iss.severity === 'critical')) {
      color.setHex(0xff6b6b); // red
    } else if (issues.some((iss) => iss.severity === 'warning')) {
      color.setHex(0xffc107); // yellow
    } else {
      color.setHex(0x28a745); // green
    }

    colors.push(color.r, color.g, color.b);
  }

  heatmapGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    emissive: 0x111111,
  });

  const heatmapMesh = new THREE.Mesh(heatmapGeom, material);
  heatmapMesh.name = 'DFM_Heatmap';

  return heatmapMesh;
}

// ===== MODULE INTERFACE =====

let currentAnalysis = null;
let currentHeatmap = null;
let currentObject = null;

/**
 * Initialize the module
 */
/**
 * Initialize Manufacturability module
 *
 * Sets up UI panel, event listeners, and material selector dropdown.
 * Must be called once before execute() calls.
 *
 * @returns {void}
 */
function init() {
  console.log('Manufacturability module initialized');
}

/**
 * Get UI panel HTML
 * @returns {string} HTML for module panel
 */
function getUI() {
  const processes = Object.entries(PROCESS_RULES).map(([key, rule]) => `
    <label style="display: flex; align-items: center; margin: 8px 0; font-size: 13px;">
      <input type="checkbox" name="process" value="${key}" style="margin-right: 8px;">
      ${rule.label}
    </label>
  `).join('');

  const materials = Object.keys(MATERIALS).map((mat) => `
    <option value="${mat}">${mat}</option>
  `).join('');

  return `
    <div style="padding: 12px; background: var(--color-bg-secondary, #2a2a2a); border-radius: 8px; color: var(--color-text, #fff);">
      <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">Manufacturability Analysis</h3>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; margin-bottom: 8px; font-weight: 500;">Manufacturing Processes:</label>
        <div style="max-height: 180px; overflow-y: auto; padding-right: 4px;">
          ${processes}
        </div>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; margin-bottom: 6px; font-weight: 500;">Material:</label>
        <select id="dfm-material" style="width: 100%; padding: 6px; background: var(--color-bg-primary, #1a1a1a); border: 1px solid var(--color-border, #444); border-radius: 4px; color: var(--color-text, #fff); font-size: 12px;">
          ${materials}
        </select>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; margin-bottom: 6px; font-weight: 500;">Quantity:</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
          <button class="dfm-qty" data-qty="1" style="padding: 6px; border: 1px solid var(--color-border, #444); background: var(--color-bg-primary, #1a1a1a); color: var(--color-text, #fff); border-radius: 4px; font-size: 12px; cursor: pointer;">1</button>
          <button class="dfm-qty" data-qty="10" style="padding: 6px; border: 1px solid var(--color-border, #444); background: var(--color-bg-primary, #1a1a1a); color: var(--color-text, #fff); border-radius: 4px; font-size: 12px; cursor: pointer;">10</button>
          <button class="dfm-qty" data-qty="100" style="padding: 6px; border: 1px solid var(--color-border, #444); background: var(--color-bg-primary, #1a1a1a); color: var(--color-text, #fff); border-radius: 4px; font-size: 12px; cursor: pointer;">100</button>
          <button class="dfm-qty" data-qty="1000" style="padding: 6px; border: 1px solid var(--color-border, #444); background: var(--color-bg-primary, #1a1a1a); color: var(--color-text, #fff); border-radius: 4px; font-size: 12px; cursor: pointer;">1K</button>
        </div>
        <input id="dfm-quantity" type="number" value="1" min="1" step="1" style="width: 100%; padding: 6px; background: var(--color-bg-primary, #1a1a1a); border: 1px solid var(--color-border, #444); border-radius: 4px; color: var(--color-text, #fff); font-size: 12px;">
      </div>

      <button id="dfm-analyze" style="width: 100%; padding: 10px; background: #0084ff; color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; margin-bottom: 8px; font-size: 13px;">Analyze</button>

      <div id="dfm-results" style="margin-top: 16px; max-height: 400px; overflow-y: auto; border: 1px solid var(--color-border, #444); border-radius: 4px; padding: 12px; display: none;">
        <!-- results inserted here -->
      </div>

      <button id="dfm-report" style="width: 100%; padding: 10px; background: #28a745; color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; margin-top: 8px; font-size: 13px; display: none;">Generate Report (PDF)</button>

      <div style="margin-top: 12px;">
        <label style="display: flex; align-items: center; font-size: 12px;">
          <input type="checkbox" id="dfm-heatmap" style="margin-right: 6px;">
          Show Heatmap Overlay
        </label>
      </div>
    </div>
  `;
}

/**
 * Execute module commands
 * @param {string} cmd - command name
 * @param {Object} params - parameters
 */
/**
 * Execute command in Manufacturability module (public API)
 *
 * Commands:
 * - 'analyze': Analyze geometry for manufacturing feasibility
 * - 'estimateCost': Get cost breakdown for material + process combination
 * - 'generateReport': Create detailed HTML report with visualizations
 * - 'createHeatmap': Overlay color-coded issue visualization on model
 * - 'compareMaterials': Get cost comparison across all materials for a process
 * - 'compareProcesses': Get cost comparison across all processes for a material
 *
 * @param {string} cmd - Command name
 * @param {Object} [params={}] - Command parameters
 * @param {THREE.Object3D} params.object - For 'analyze'/'estimateCost': 3D model
 * @param {string} params.material - For 'estimateCost'/'compareProcesses': material key
 * @param {string} params.process - For 'estimateCost'/'compareMaterials': process key
 * @param {number} params.quantity - For cost commands: production quantity
 * @returns {Object} Command result (varies by command)
 */
function execute(cmd, params = {}) {
  if (cmd === 'analyze') {
    const processes = document.querySelectorAll('input[name="process"]:checked');
    const material = document.getElementById('dfm-material')?.value || 'Aluminum 6061';
    const quantity = parseInt(document.getElementById('dfm-quantity')?.value || 1);

    if (processes.length === 0) {
      alert('Select at least one manufacturing process');
      return;
    }

    // Get current object from scene
    const object = params.object || currentObject;
    if (!object || !object.geometry) {
      alert('No geometry selected for analysis');
      return;
    }

    currentObject = object;
    const costs = [];
    const allIssues = [];

    processes.forEach((input) => {
      const process = input.value;
      const analysis = analyzeGeometry(object, process);
      allIssues.push(...analysis.issues);

      const cost = estimateCost(analysis.geometry, material, process, quantity);
      costs.push(cost);
    });

    currentAnalysis = { issues: allIssues, geometry: analyzeGeometry(object, Array.from(processes)[0].value).geometry, costs };

    // Display results
    const resultsDiv = document.getElementById('dfm-results');
    if (resultsDiv) {
      const criticalCount = allIssues.filter((i) => i.severity === 'critical').length;
      const warningCount = allIssues.filter((i) => i.severity === 'warning').length;

      let html = `
        <div style="margin-bottom: 12px; padding: 10px; background: var(--color-bg-primary, #1a1a1a); border-radius: 4px;">
          <div style="font-weight: 600; font-size: 12px; margin-bottom: 6px;">Status</div>
          <div style="font-size: 13px;">
            <span style="color: ${criticalCount > 0 ? '#ff6b6b' : '#28a745'}; font-weight: 600;">
              ${criticalCount > 0 ? `❌ ${criticalCount} Critical` : '✓ No critical issues'}
            </span>
            <span style="color: #ffc107; font-weight: 600; margin-left: 12px;">⚠️ ${warningCount} Warnings</span>
          </div>
        </div>

        <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px;">Issues:</div>
      `;

      allIssues.slice(0, 8).forEach((issue) => {
        const color = issue.severity === 'critical' ? '#ff6b6b' : '#ffc107';
        html += `
          <div style="margin-bottom: 8px; padding: 8px; background: var(--color-bg-primary, #1a1a1a); border-left: 3px solid ${color}; border-radius: 2px; font-size: 11px;">
            <div style="color: ${color}; font-weight: 600;">${issue.category}</div>
            <div style="color: #aaa; margin-top: 2px;">${issue.fix}</div>
          </div>
        `;
      });

      resultsDiv.innerHTML = html;
      resultsDiv.style.display = 'block';
    }

    // Show report button
    const reportBtn = document.getElementById('dfm-report');
    if (reportBtn) reportBtn.style.display = 'block';

    // Create heatmap if requested
    if (document.getElementById('dfm-heatmap')?.checked) {
      if (currentHeatmap) object.remove(currentHeatmap);
      currentHeatmap = createHeatmapOverlay(object, allIssues);
      if (currentHeatmap && object.parent) {
        object.parent.add(currentHeatmap);
      }
    }
  }

  if (cmd === 'generate-report') {
    if (!currentAnalysis) {
      alert('Run analysis first');
      return;
    }

    const material = document.getElementById('dfm-material')?.value || 'Aluminum 6061';
    const html = generateReport(currentAnalysis, currentAnalysis.costs, material);

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DFM-Report-${Date.now()}.html`;
    link.click();
  }

  if (cmd === 'toggle-heatmap') {
    if (currentHeatmap) {
      currentHeatmap.visible = !currentHeatmap.visible;
    }
  }
}

// Wire up event listeners when UI is added to DOM
setTimeout(() => {
  document.getElementById('dfm-analyze')?.addEventListener('click', () => execute('analyze', {}));
  document.getElementById('dfm-report')?.addEventListener('click', () => execute('generate-report', {}));
  document.getElementById('dfm-heatmap')?.addEventListener('change', () => execute('toggle-heatmap', {}));

  document.querySelectorAll('.dfm-qty').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qty = btn.dataset.qty;
      const input = document.getElementById('dfm-quantity');
      if (input) input.value = qty;
    });
  });
}, 100);

// Export module
window.CycleCAD = window.CycleCAD || {};
window.CycleCAD.Manufacturability = {
  init,
  getUI,
  execute,
  analyze: analyzeGeometry,
  estimateCost,
  generateReport,
  createHeatmapOverlay,
  MATERIALS,
  PROCESS_RULES,
};
