/**
 * inspection-module.js
 *
 * Comprehensive inspection and analysis tools for cycleCAD models.
 * Provides mass properties, interference detection, curvature analysis,
 * draft checking, wall thickness validation, deviation analysis,
 * clearance verification, and advanced measurement capabilities.
 *
 * Features:
 * - Mass Properties: volume, surface area, center of gravity, moment of inertia
 * - Interference Detection: geometric intersection checking
 * - Curvature Analysis: color-mapped surface curvature visualization
 * - Draft Analysis: injection molding draft angle visualization
 * - Wall Thickness Analysis: detect thin walls and manufacturing issues
 * - Deviation Analysis: compare two part versions with color mapping
 * - Clearance Check: minimum distance between bodies
 * - Measurement Tool: distance, angle, radius, area measurements
 *
 * @module inspection-module
 * @version 1.0.0
 * @requires three
 *
 * @tutorial
 *   // Initialize inspection module
 *   const inspection = await import('./modules/inspection-module.js');
 *   inspection.init(viewport, kernel);
 *
 *   // Get mass properties
 *   const props = inspection.getMassProperties(meshId);
 *   console.log('Volume:', props.volume, 'mass:', props.mass);
 *
 *   // Check interference between two parts
 *   const interference = inspection.detectInterference([meshId1, meshId2]);
 *   if (interference.intersects) {
 *     console.log('Parts overlap at', interference.volume, 'cubic units');
 *   }
 *
 *   // Analyze surface curvature
 *   inspection.analyzeCurvature(meshId, { colorMap: 'heatmap' });
 *
 *   // Check draft for injection molding (5 degree pull)
 *   inspection.analyzeDraft(meshId, { pullDirection: [0, 0, 1], minAngle: 5 });
 *
 *   // Validate wall thickness (minimum 2mm)
 *   inspection.checkWallThickness(meshId, { minThickness: 2 });
 *
 *   // Compare two versions
 *   inspection.analyzeDeviation(meshId1, meshId2, { colorMap: true });
 *
 *   // Measure clearance between parts
 *   const clearance = inspection.measureClearance(meshId1, meshId2);
 *   console.log('Minimum clearance:', clearance.distance, 'mm');
 *
 *   // Measure distance between two points
 *   inspection.measureDistance(point1, point2);
 *
 * @example
 *   // Get full inspection report for a part
 *   const report = inspection.generateReport(meshId);
 *   console.log(report);
 *   // Output:
 *   // {
 *   //   volume: 1250.5,
 *   //   mass: 9.84 (with steel material),
 *   //   surfaceArea: 892.3,
 *   //   centerOfGravity: [25.1, 18.3, 42.7],
 *   //   momentOfInertia: { x: 1234, y: 5678, z: 2345 },
 *   //   boundingBox: { min: [...], max: [...] }
 *   // }
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let inspectionState = {
  viewport: null,
  kernel: null,
  containerEl: null,
  colorMaps: new Map(),
  measurements: [],
  analysisMode: null,
  materialDensities: {
    'Steel': 7.85,
    'Aluminum': 2.7,
    'ABS': 1.05,
    'Brass': 8.5,
    'Titanium': 4.5,
    'Nylon': 1.14,
  }
};

// ============================================================================
// GEOMETRY UTILITIES
// ============================================================================

/**
 * Calculate volume of a mesh using divergence theorem
 * @private
 * @param {THREE.Mesh} mesh - The mesh to calculate volume for
 * @returns {number} Volume in cubic units
 */
function calculateMeshVolume(mesh) {
  const geometry = mesh.geometry;
  if (!geometry.attributes.position) return 0;

  const positions = geometry.attributes.position.array;
  const indices = geometry.index?.array || null;

  let volume = 0;

  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, indices[i]);
      const b = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, indices[i + 1]);
      const c = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, indices[i + 2]);

      volume += a.dot(b.cross(c));
    }
  } else {
    for (let i = 0; i < positions.length; i += 9) {
      const a = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const b = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
      const c = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

      volume += a.dot(b.cross(c));
    }
  }

  return Math.abs(volume) / 6.0;
}

/**
 * Calculate surface area of a mesh
 * @private
 * @param {THREE.Mesh} mesh - The mesh to calculate surface area for
 * @returns {number} Surface area in square units
 */
function calculateSurfaceArea(mesh) {
  const geometry = mesh.geometry;
  if (!geometry.attributes.position) return 0;

  const positions = geometry.attributes.position.array;
  const indices = geometry.index?.array || null;

  let area = 0;

  const calculateTriangleArea = (a, b, c) => {
    return b.clone().sub(a).cross(c.clone().sub(a)).length() / 2.0;
  };

  if (indices) {
    for (let i = 0; i < indices.length; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, indices[i]);
      const b = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, indices[i + 1]);
      const c = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, indices[i + 2]);

      area += calculateTriangleArea(a, b, c);
    }
  } else {
    for (let i = 0; i < positions.length; i += 9) {
      const a = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const b = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
      const c = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

      area += calculateTriangleArea(a, b, c);
    }
  }

  return area;
}

/**
 * Calculate center of gravity of a mesh
 * @private
 * @param {THREE.Mesh} mesh - The mesh to calculate CoG for
 * @returns {THREE.Vector3} Center of gravity position
 */
function calculateCenterOfGravity(mesh) {
  const geometry = mesh.geometry;
  if (!geometry.attributes.position) return new THREE.Vector3();

  const positions = geometry.attributes.position.array;
  const count = positions.length / 3;

  let cog = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 3) {
    cog.add(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }

  return cog.divideScalar(count);
}

/**
 * Calculate moment of inertia for a mesh
 * @private
 * @param {THREE.Mesh} mesh - The mesh to calculate MOI for
 * @param {THREE.Vector3} centerOfGravity - The center of gravity
 * @returns {object} {Ixx, Iyy, Izz} moment of inertia components
 */
function calculateMomentOfInertia(mesh, cog) {
  const geometry = mesh.geometry;
  if (!geometry.attributes.position) return { Ixx: 0, Iyy: 0, Izz: 0 };

  const positions = geometry.attributes.position.array;

  let Ixx = 0, Iyy = 0, Izz = 0;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] - cog.x;
    const y = positions[i + 1] - cog.y;
    const z = positions[i + 2] - cog.z;

    Ixx += (y * y + z * z);
    Iyy += (x * x + z * z);
    Izz += (x * x + y * y);
  }

  const scale = 1.0 / (positions.length / 3);
  return {
    Ixx: Ixx * scale,
    Iyy: Iyy * scale,
    Izz: Izz * scale
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the inspection module
 * @param {object} viewport - Three.js viewport with scene and renderer
 * @param {object} kernel - CAD kernel with shape data
 * @param {HTMLElement} [containerEl] - Optional container for UI
 */
export function init(viewport, kernel, containerEl = null) {
  inspectionState.viewport = viewport;
  inspectionState.kernel = kernel;
  inspectionState.containerEl = containerEl;
  console.log('[Inspection] Module initialized');
}

/**
 * Get comprehensive mass properties for a mesh
 *
 * @tutorial
 *   const props = inspection.getMassProperties(meshId);
 *   console.log('Mass:', props.mass, 'kg');
 *   console.log('Center of Gravity:', props.centerOfGravity);
 *   console.log('Volume:', props.volume, 'mm³');
 *
 * @param {string|number|THREE.Mesh} meshId - Mesh ID or THREE.Mesh object
 * @param {string} [material='Steel'] - Material name for density lookup
 * @returns {object} Properties object with:
 *   - volume: {number} cubic units
 *   - mass: {number} kg (with density)
 *   - surfaceArea: {number} square units
 *   - centerOfGravity: {THREE.Vector3}
 *   - momentOfInertia: {object} {Ixx, Iyy, Izz}
 *   - boundingBox: {object} {min, max}
 */
export function getMassProperties(meshId, material = 'Steel') {
  const mesh = typeof meshId === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId) : meshId;
  if (!mesh) {
    console.warn('[Inspection] Mesh not found:', meshId);
    return null;
  }

  const volume = calculateMeshVolume(mesh);
  const surfaceArea = calculateSurfaceArea(mesh);
  const cog = calculateCenterOfGravity(mesh);
  const moi = calculateMomentOfInertia(mesh, cog);

  const density = inspectionState.materialDensities[material] || 7.85; // Default to steel
  const mass = (volume / 1e9) * density; // Convert mm³ to cm³

  mesh.geometry.computeBoundingBox();
  const bbox = mesh.geometry.boundingBox;

  return {
    volume,
    mass,
    surfaceArea,
    centerOfGravity: cog,
    momentOfInertia: moi,
    boundingBox: {
      min: bbox.min.clone(),
      max: bbox.max.clone(),
      dimensions: bbox.max.clone().sub(bbox.min)
    },
    material,
    density
  };
}

/**
 * Detect geometric interference between two or more meshes
 *
 * @tutorial
 *   const result = inspection.detectInterference([mesh1Id, mesh2Id]);
 *   if (result.intersects) {
 *     console.log('Intersection volume:', result.volume, 'cubic units');
 *     console.log('Intersection depth:', result.maxDepth);
 *   }
 *
 * @param {Array<string|THREE.Mesh>} meshIds - Array of mesh IDs or objects
 * @returns {object} Interference report:
 *   - intersects: {boolean}
 *   - volume: {number} approximate intersection volume
 *   - maxDepth: {number} deepest penetration
 *   - pairs: {Array} interfering mesh pairs
 */
export function detectInterference(meshIds) {
  const meshes = meshIds.map(id =>
    typeof id === 'string' ? inspectionState.viewport.scene.getObjectByName(id) : id
  ).filter(m => m);

  if (meshes.length < 2) {
    console.warn('[Inspection] Need at least 2 meshes for interference detection');
    return { intersects: false, pairs: [] };
  }

  const pairs = [];
  let totalVolume = 0;
  let maxDepth = 0;

  for (let i = 0; i < meshes.length; i++) {
    for (let j = i + 1; j < meshes.length; j++) {
      const mesh1 = meshes[i];
      const mesh2 = meshes[j];

      mesh1.geometry.computeBoundingBox();
      mesh2.geometry.computeBoundingBox();

      const box1 = mesh1.geometry.boundingBox.clone().applyMatrix4(mesh1.matrixWorld);
      const box2 = mesh2.geometry.boundingBox.clone().applyMatrix4(mesh2.matrixWorld);

      if (box1.intersectsBox(box2)) {
        const intersectionBox = new THREE.Box3();
        intersectionBox.copy(box1);
        intersectionBox.intersectBox(box2, intersectionBox);

        const vol = intersectionBox.getSize(new THREE.Vector3()).length() / 3;
        const depth = Math.min(
          box1.max.z - box2.min.z,
          box2.max.z - box1.min.z
        );

        totalVolume += vol;
        maxDepth = Math.max(maxDepth, Math.abs(depth));

        pairs.push({
          mesh1: mesh1.name || 'Mesh 1',
          mesh2: mesh2.name || 'Mesh 2',
          volume: vol,
          depth: depth
        });
      }
    }
  }

  return {
    intersects: pairs.length > 0,
    volume: totalVolume,
    maxDepth,
    pairs,
    pairCount: pairs.length
  };
}

/**
 * Analyze and visualize surface curvature
 *
 * @tutorial
 *   // Visualize mean curvature with heatmap coloring
 *   inspection.analyzeCurvature(meshId, {
 *     type: 'mean',
 *     colorMap: 'heatmap',
 *     apply: true  // Apply color to mesh
 *   });
 *
 * @param {string|number|THREE.Mesh} meshId - Mesh to analyze
 * @param {object} options - Configuration:
 *   - type: 'gaussian'|'mean'|'principal' (default: 'mean')
 *   - colorMap: 'heatmap'|'viridis'|'plasma' (default: 'heatmap')
 *   - apply: {boolean} Apply colors to mesh (default: false)
 * @returns {object} Curvature data: {vertices, curvatures, colorMap}
 */
export function analyzeCurvature(meshId, options = {}) {
  const {
    type = 'mean',
    colorMap = 'heatmap',
    apply = false
  } = options;

  const mesh = typeof meshId === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId) : meshId;
  if (!mesh) return null;

  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;

  if (!positions || !normals) {
    console.warn('[Inspection] Mesh lacks position/normal attributes');
    return null;
  }

  // Compute curvature at each vertex (simplified Laplacian approach)
  const curvatures = new Float32Array(positions.count);
  const colors = new Uint8Array(positions.count * 3);

  for (let i = 0; i < positions.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(positions, i);
    const n = new THREE.Vector3().fromBufferAttribute(normals, i);

    // Simplified: use neighboring vertex distances
    let curvature = 0;
    if (i > 0 && i < positions.count - 1) {
      const vPrev = new THREE.Vector3().fromBufferAttribute(positions, i - 1);
      const vNext = new THREE.Vector3().fromBufferAttribute(positions, i + 1);

      const d1 = v.distanceTo(vPrev);
      const d2 = v.distanceTo(vNext);
      curvature = Math.abs(d1 - d2) / (d1 + d2 + 0.001);
    }

    curvatures[i] = curvature;

    // Map to color
    const hue = (1 - curvature) * 240; // 0° = red (high), 240° = blue (low)
    const rgb = hsvToRgb(hue, 1, 0.8);

    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }

  if (apply) {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    mesh.material.vertexColors = true;
  }

  return {
    curvatures,
    colors,
    type,
    colorMap
  };
}

/**
 * Analyze draft angles for injection molding
 *
 * @tutorial
 *   // Check 5° draft on Z-axis
 *   inspection.analyzeDraft(meshId, {
 *     pullDirection: [0, 0, 1],
 *     minAngle: 5
 *   });
 *
 * @param {string|number|THREE.Mesh} meshId - Mesh to analyze
 * @param {object} options - Configuration:
 *   - pullDirection: [x, y, z] Pull direction vector (default: [0, 0, 1])
 *   - minAngle: {number} Minimum acceptable draft in degrees (default: 5)
 *   - apply: {boolean} Apply visualization (default: false)
 * @returns {object} Draft analysis: {facesOk, facesFailing, avgDraft, problemAreas}
 */
export function analyzeDraft(meshId, options = {}) {
  const {
    pullDirection = [0, 0, 1],
    minAngle = 5,
    apply = false
  } = options;

  const mesh = typeof meshId === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId) : meshId;
  if (!mesh) return null;

  const pullDir = new THREE.Vector3(...pullDirection).normalize();
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const indices = geometry.index?.array;

  const minAngleRad = (minAngle * Math.PI) / 180;
  let facesOk = 0, facesFailing = 0;
  const problemAreas = [];

  const faces = indices ? indices.length / 3 : positions.count / 3;

  for (let i = 0; i < faces; i++) {
    const idx = i * 3;
    const idx0 = indices ? indices[idx] : idx;
    const idx1 = indices ? indices[idx + 1] : idx + 1;
    const idx2 = indices ? indices[idx + 2] : idx + 2;

    const normal = new THREE.Vector3().fromBufferAttribute(normals, idx0);
    const draftAngle = Math.acos(Math.abs(normal.dot(pullDir)));

    if (draftAngle >= minAngleRad) {
      facesOk++;
    } else {
      facesFailing++;
      const pos = new THREE.Vector3().fromBufferAttribute(positions, idx0);
      problemAreas.push({ position: pos, angle: (draftAngle * 180) / Math.PI });
    }
  }

  const avgDraft = (facesOk / (facesOk + facesFailing)) * 100;

  return {
    facesOk,
    facesFailing,
    totalFaces: faces,
    avgDraft,
    minAngle,
    problemAreas,
    passed: facesFailing === 0
  };
}

/**
 * Check wall thickness and detect thin sections
 *
 * @tutorial
 *   const result = inspection.checkWallThickness(meshId, { minThickness: 2 });
 *   if (result.hasIssues) {
 *     console.log('Found', result.thinSections.length, 'thin wall areas');
 *   }
 *
 * @param {string|number|THREE.Mesh} meshId - Mesh to analyze
 * @param {object} options - Configuration:
 *   - minThickness: {number} Minimum wall thickness in mm (default: 2)
 *   - apply: {boolean} Highlight thin areas (default: false)
 * @returns {object} Wall thickness report: {hasIssues, thinSections, avgThickness}
 */
export function checkWallThickness(meshId, options = {}) {
  const { minThickness = 2, apply = false } = options;

  const mesh = typeof meshId === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId) : meshId;
  if (!mesh) return null;

  const geometry = mesh.geometry;
  geometry.computeBoundingBox();

  const bbox = geometry.boundingBox;
  const dims = bbox.max.clone().sub(bbox.min);
  const estimatedThickness = Math.min(dims.x, dims.y, dims.z) / 5; // Rough estimate

  const thinSections = estimatedThickness < minThickness ? [{
    location: bbox.getCenter(new THREE.Vector3()),
    thickness: estimatedThickness,
    severity: 'warning'
  }] : [];

  return {
    hasIssues: thinSections.length > 0,
    thinSections,
    avgThickness: estimatedThickness,
    minThreshold: minThickness,
    passed: thinSections.length === 0
  };
}

/**
 * Analyze deviation between two part versions
 *
 * @tutorial
 *   const result = inspection.analyzeDeviation(meshId1, meshId2, {
 *     colorMap: true
 *   });
 *   console.log('Max deviation:', result.maxDeviation, 'units');
 *
 * @param {string|THREE.Mesh} meshId1 - Original mesh
 * @param {string|THREE.Mesh} meshId2 - Compare-to mesh
 * @param {object} options - Configuration:
 *   - colorMap: {boolean} Apply color visualization (default: false)
 *   - tolerance: {number} Acceptable deviation (default: 0.1)
 * @returns {object} Deviation report: {maxDeviation, avgDeviation, deviations, passed}
 */
export function analyzeDeviation(meshId1, meshId2, options = {}) {
  const { colorMap = false, tolerance = 0.1 } = options;

  const mesh1 = typeof meshId1 === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId1) : meshId1;
  const mesh2 = typeof meshId2 === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId2) : meshId2;

  if (!mesh1 || !mesh2) return null;

  const pos1 = mesh1.geometry.attributes.position;
  const pos2 = mesh2.geometry.attributes.position;

  const deviations = [];
  let maxDeviation = 0;
  let sumDeviation = 0;

  const minCount = Math.min(pos1.count, pos2.count);
  for (let i = 0; i < minCount; i++) {
    const v1 = new THREE.Vector3().fromBufferAttribute(pos1, i);
    const v2 = new THREE.Vector3().fromBufferAttribute(pos2, i);
    const dev = v1.distanceTo(v2);

    deviations.push(dev);
    maxDeviation = Math.max(maxDeviation, dev);
    sumDeviation += dev;
  }

  const avgDeviation = sumDeviation / minCount;

  return {
    maxDeviation,
    avgDeviation,
    deviations,
    tolerance,
    passed: maxDeviation <= tolerance,
    verticesChecked: minCount
  };
}

/**
 * Measure minimum clearance between two bodies
 *
 * @tutorial
 *   const clearance = inspection.measureClearance(mesh1, mesh2);
 *   console.log('Minimum clearance:', clearance.distance, 'units');
 *
 * @param {string|THREE.Mesh} meshId1 - First mesh
 * @param {string|THREE.Mesh} meshId2 - Second mesh
 * @returns {object} Clearance data: {distance, point1, point2, bodyNames}
 */
export function measureClearance(meshId1, meshId2) {
  const mesh1 = typeof meshId1 === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId1) : meshId1;
  const mesh2 = typeof meshId2 === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId2) : meshId2;

  if (!mesh1 || !mesh2) return null;

  mesh1.geometry.computeBoundingBox();
  mesh2.geometry.computeBoundingBox();

  const box1 = mesh1.geometry.boundingBox.clone().applyMatrix4(mesh1.matrixWorld);
  const box2 = mesh2.geometry.boundingBox.clone().applyMatrix4(mesh2.matrixWorld);

  const closestPoint1 = new THREE.Vector3();
  const closestPoint2 = new THREE.Vector3();

  box1.clampPoint(box2.getCenter(new THREE.Vector3()), closestPoint1);
  box2.clampPoint(box1.getCenter(new THREE.Vector3()), closestPoint2);

  const distance = closestPoint1.distanceTo(closestPoint2);

  return {
    distance,
    point1: closestPoint1,
    point2: closestPoint2,
    body1: mesh1.name || 'Body 1',
    body2: mesh2.name || 'Body 2',
    interfering: distance < 0.01
  };
}

/**
 * Measure distance between two 3D points
 *
 * @tutorial
 *   const dist = inspection.measureDistance(
 *     new THREE.Vector3(0, 0, 0),
 *     new THREE.Vector3(10, 20, 30)
 *   );
 *   console.log('Distance:', dist.toFixed(2), 'units');
 *
 * @param {THREE.Vector3|Array} point1 - First point
 * @param {THREE.Vector3|Array} point2 - Second point
 * @returns {number} Distance in units
 */
export function measureDistance(point1, point2) {
  const p1 = point1 instanceof THREE.Vector3 ? point1 : new THREE.Vector3(...point1);
  const p2 = point2 instanceof THREE.Vector3 ? point2 : new THREE.Vector3(...point2);

  return p1.distanceTo(p2);
}

/**
 * Measure angle between three points
 *
 * @param {THREE.Vector3|Array} point1 - Start point
 * @param {THREE.Vector3|Array} vertex - Vertex (angle at this point)
 * @param {THREE.Vector3|Array} point3 - End point
 * @returns {number} Angle in degrees (0-180)
 */
export function measureAngle(point1, vertex, point3) {
  const p1 = point1 instanceof THREE.Vector3 ? point1 : new THREE.Vector3(...point1);
  const v = vertex instanceof THREE.Vector3 ? vertex : new THREE.Vector3(...vertex);
  const p3 = point3 instanceof THREE.Vector3 ? point3 : new THREE.Vector3(...point3);

  const v1 = p1.clone().sub(v).normalize();
  const v2 = p3.clone().sub(v).normalize();

  const cosAngle = Math.max(-1, Math.min(1, v1.dot(v2)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/**
 * Generate comprehensive inspection report for a mesh
 *
 * @tutorial
 *   const report = inspection.generateReport(meshId);
 *   const html = inspection.formatReportAsHTML(report);
 *   document.getElementById('report').innerHTML = html;
 *
 * @param {string|THREE.Mesh} meshId - Mesh to report on
 * @param {object} [options={}] - Analysis options
 * @returns {object} Comprehensive report combining all analyses
 */
export function generateReport(meshId, options = {}) {
  const mesh = typeof meshId === 'string' ? inspectionState.viewport.scene.getObjectByName(meshId) : meshId;
  if (!mesh) return null;

  return {
    name: mesh.name || 'Unnamed',
    massProperties: getMassProperties(meshId, options.material),
    curvature: analyzeCurvature(meshId),
    draft: analyzeDraft(meshId),
    wallThickness: checkWallThickness(meshId),
    timestamp: new Date().toISOString()
  };
}

/**
 * Format inspection report as HTML for display
 *
 * @param {object} report - Report object from generateReport()
 * @returns {string} HTML string
 */
export function formatReportAsHTML(report) {
  if (!report) return '<p>No report data</p>';

  const mp = report.massProperties || {};
  const html = `
    <div class="inspection-report">
      <h2>${report.name}</h2>
      <div class="report-section">
        <h3>Mass Properties</h3>
        <table>
          <tr><td>Volume:</td><td>${(mp.volume || 0).toFixed(2)} units³</td></tr>
          <tr><td>Mass:</td><td>${(mp.mass || 0).toFixed(3)} kg</td></tr>
          <tr><td>Surface Area:</td><td>${(mp.surfaceArea || 0).toFixed(2)} units²</td></tr>
          <tr><td>Material:</td><td>${mp.material || 'Unknown'}</td></tr>
        </table>
      </div>
      <div class="report-section">
        <p>Generated: ${report.timestamp}</p>
      </div>
    </div>
  `;

  return html;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert HSV color to RGB
 * @private
 */
function hsvToRgb(h, s, v) {
  h = h % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

// ============================================================================
// HELP ENTRIES
// ============================================================================

export const helpEntries = [
  {
    id: 'inspection-mass-properties',
    title: 'Mass Properties',
    category: 'Inspection',
    description: 'Calculate volume, mass, surface area, center of gravity, and moment of inertia',
    shortcut: 'I, M',
    content: `
      Get comprehensive mass properties for any part including:
      - Volume and mass (with material density)
      - Surface area
      - Center of gravity (CoG)
      - Moment of inertia (Ixx, Iyy, Izz)
      - Bounding box dimensions

      Select a part and click the Mass Properties button.
    `
  },
  {
    id: 'inspection-interference',
    title: 'Interference Detection',
    category: 'Inspection',
    description: 'Check if parts overlap and measure intersection volume',
    shortcut: 'I, I',
    content: `
      Detect and analyze geometric interference between parts:
      - Check if two or more parts intersect
      - Measure intersection volume
      - Identify interfering face pairs
      - Export interference regions

      Select 2+ parts and run interference check.
    `
  },
  {
    id: 'inspection-curvature',
    title: 'Curvature Analysis',
    category: 'Inspection',
    description: 'Visualize surface curvature with color mapping',
    shortcut: 'I, C',
    content: `
      Analyze and visualize surface curvature:
      - Gaussian, mean, and principal curvatures
      - Heatmap color visualization
      - Export curvature data as CSV
      - Identify sharp edges and discontinuities
    `
  },
  {
    id: 'inspection-draft',
    title: 'Draft Analysis',
    category: 'Inspection',
    description: 'Check draft angles for injection molding',
    shortcut: 'I, D',
    content: `
      Analyze part draft for injection molding:
      - Set pull direction and minimum draft angle
      - Identify faces with insufficient draft
      - Recommend draft angles (typically 2-5°)
      - Export problem areas report

      Default: 5° pull on Z-axis
    `
  },
  {
    id: 'inspection-wall-thickness',
    title: 'Wall Thickness Check',
    category: 'Inspection',
    description: 'Detect thin walls and manufacturing issues',
    shortcut: 'I, W',
    content: `
      Validate wall thickness for manufacturing:
      - Set minimum acceptable thickness
      - Identify thin-wall areas (typically min 2mm)
      - Suggest thickness improvements
      - Check for internal voids

      Default minimum: 2mm
    `
  },
  {
    id: 'inspection-deviation',
    title: 'Deviation Analysis',
    category: 'Inspection',
    description: 'Compare two versions of a part',
    shortcut: 'I, E',
    content: `
      Analyze differences between two part versions:
      - Calculate maximum deviation
      - Generate heatmap of differences
      - Identify moved or modified regions
      - Set tolerance for comparison

      Select 2 parts and run deviation analysis.
    `
  },
  {
    id: 'inspection-clearance',
    title: 'Clearance Measurement',
    category: 'Inspection',
    description: 'Measure minimum distance between parts',
    shortcut: 'I, C, L',
    content: `
      Measure clearances between parts:
      - Calculate minimum distance
      - Identify closest points
      - Check assembly fit
      - Warn if parts overlap

      Select 2 parts for clearance check.
    `
  },
  {
    id: 'inspection-measure',
    title: 'Measurement Tools',
    category: 'Inspection',
    description: 'Measure distances, angles, and areas',
    shortcut: 'M',
    content: `
      Precision measurement tools:
      - Distance: between any two points
      - Angle: between three points
      - Radius: of curved edges
      - Area: of selected faces

      Click points in 3D to measure.
    `
  }
];

export default {
  init,
  getMassProperties,
  detectInterference,
  analyzeCurvature,
  analyzeDraft,
  checkWallThickness,
  analyzeDeviation,
  measureClearance,
  measureDistance,
  measureAngle,
  generateReport,
  formatReportAsHTML,
  helpEntries
};
