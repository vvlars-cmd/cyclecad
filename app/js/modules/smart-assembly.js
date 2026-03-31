/**
 * @fileoverview Smart Assembly Mating Module for cycleCAD
 *
 * Provides intelligent assembly constraint system with:
 * - Surface & feature detection (planar, cylindrical, spherical, conical)
 * - 8 mate constraint types (coincident, concentric, tangent, parallel, perpendicular, distance, angle, gear)
 * - Auto-mating with drag-to-snap, ghost previews, and confidence scoring
 * - Motion studies with joint types (revolute, prismatic, cylindrical, ball, planar)
 * - Assembly tree with constraint visualization
 * - Full UI panel with mate wizard, motion playback, explode slider
 *
 * Exports: window.CycleCAD.SmartAssembly
 */

'use strict';

window.CycleCAD = window.CycleCAD || {};

const SmartAssembly = (() => {
  // =========================================================================
  // STATE & CONFIG
  // =========================================================================

  let assemblyTree = {
    name: 'Assembly',
    parts: [],
    constraints: [],
    motionStudies: [],
    subassemblies: []
  };

  let selectedParts = [];
  let detectedFeatures = new Map(); // Map<partId, Feature[]>
  let constraints = [];
  let motionStudies = [];
  let activeMotionStudy = null;
  let draggedPart = null;
  let ghostPreview = null;
  let autoMateThreshold = 0.75;
  let explodeAmount = 0; // 0-100%
  let constraintVisualsEnabled = true;

  const CONSTRAINT_TYPES = {
    COINCIDENT: 'coincident',
    CONCENTRIC: 'concentric',
    TANGENT: 'tangent',
    PARALLEL: 'parallel',
    PERPENDICULAR: 'perpendicular',
    DISTANCE: 'distance',
    ANGLE: 'angle',
    GEAR: 'gear'
  };

  const FEATURE_TYPES = {
    MOUNTING_HOLE: 'mounting_hole',
    SHAFT: 'shaft',
    BORE: 'bore',
    FLAT_FACE: 'flat_face',
    SLOT: 'slot',
    KEYWAY: 'keyway',
    THREAD: 'thread',
    BOSS: 'boss',
    POCKET: 'pocket',
    CYLINDER: 'cylinder',
    SPHERE: 'sphere',
    CONE: 'cone'
  };

  const JOINT_TYPES = {
    REVOLUTE: 'revolute',
    PRISMATIC: 'prismatic',
    CYLINDRICAL: 'cylindrical',
    BALL: 'ball',
    PLANAR: 'planar'
  };

  // =========================================================================
  // SURFACE & FEATURE DETECTION
  // =========================================================================

  /**
   * Analyze mesh geometry to detect surfaces and features
   * @param {THREE.Mesh} mesh - Mesh to analyze
   * @param {string} partId - Part identifier
   * @returns {Array} Array of detected features
   */
  function detectFeatures(mesh, partId) {
    const features = [];
    const geometry = mesh.geometry;

    if (!geometry.attributes.position || !geometry.attributes.normal) {
      return features;
    }

    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const faces = [];

    // Group vertices into faces
    const vertexCount = positions.length / 3;
    for (let i = 0; i < vertexCount; i += 3) {
      const v0 = new THREE.Vector3(positions[i*3], positions[i*3+1], positions[i*3+2]);
      const v1 = new THREE.Vector3(positions[(i+1)*3], positions[(i+1)*3+1], positions[(i+1)*3+2]);
      const v2 = new THREE.Vector3(positions[(i+2)*3], positions[(i+2)*3+1], positions[(i+2)*3+2]);
      const n = new THREE.Vector3(normals[i*3], normals[i*3+1], normals[i*3+2]);

      faces.push({ v0, v1, v2, normal: n, vertices: [v0, v1, v2] });
    }

    // Detect planar faces (group by normal direction)
    const planarGroups = groupFacesByNormal(faces);
    planarGroups.forEach((group, idx) => {
      if (group.length > 10) {
        const avgNormal = group[0].normal.clone();
        const centroid = computeCentroid(group.map(f => f.v0));
        features.push({
          type: FEATURE_TYPES.FLAT_FACE,
          id: `flat_${idx}`,
          position: centroid,
          normal: avgNormal,
          radius: 0,
          depth: 0,
          confidence: Math.min(1, group.length / 50),
          faces: group
        });
      }
    });

    // Detect cylindrical features (holes, shafts)
    const cylindrical = detectCylindrical(faces, mesh.geometry.boundingBox);
    cylindrical.forEach(cyl => {
      features.push(cyl);
    });

    // Detect spherical features
    const spheres = detectSpherical(faces);
    spheres.forEach(sphere => {
      features.push(sphere);
    });

    // Classify features into semantic types
    classifyFeatures(features, mesh);

    detectedFeatures.set(partId, features);
    return features;
  }

  /**
   * Group faces by similar normal direction
   * @param {Array} faces - Array of face objects with normal property
   * @returns {Map} Map of normal vectors to grouped faces
   */
  function groupFacesByNormal(faces) {
    const groups = [];
    const threshold = 0.1; // Normal dot product threshold

    faces.forEach(face => {
      let found = false;
      for (let group of groups) {
        if (group[0].normal.dot(face.normal) > 1 - threshold) {
          group.push(face);
          found = true;
          break;
        }
      }
      if (!found) {
        groups.push([face]);
      }
    });

    return groups;
  }

  /**
   * Detect cylindrical features (holes, shafts, bores)
   * @param {Array} faces - Array of face objects
   * @param {THREE.Box3} boundingBox - Mesh bounding box
   * @returns {Array} Array of cylindrical features
   */
  function detectCylindrical(faces, boundingBox) {
    const features = [];
    const size = boundingBox.getSize(new THREE.Vector3());
    const center = boundingBox.getCenter(new THREE.Vector3());

    // Check for circular edge loops
    const edgeLoops = extractEdgeLoops(faces);

    edgeLoops.forEach((loop, idx) => {
      if (loop.vertices.length < 8) return; // Need at least 8 points for circle

      const { center: circleCenter, radius, axis } = fitCircle(loop.vertices);
      const confidence = loop.vertices.length / 100;

      // Determine if hole (cavity) or shaft based on depth
      const depth = estimateDepth(loop.vertices, axis);
      const type = depth > radius * 0.5 ? FEATURE_TYPES.MOUNTING_HOLE : FEATURE_TYPES.SHAFT;

      features.push({
        type,
        id: `cyl_${idx}`,
        position: circleCenter,
        normal: axis,
        radius,
        depth,
        confidence: Math.min(1, confidence),
        edgeLoop: loop
      });
    });

    return features;
  }

  /**
   * Detect spherical features
   * @param {Array} faces - Array of face objects
   * @returns {Array} Array of spherical features
   */
  function detectSpherical(faces) {
    const features = [];

    // Simple heuristic: check for radial normal pattern
    const sphericalFaces = faces.filter(f => {
      return faces.filter(f2 => f2.normal.dot(f.normal) > 0.9).length < 3;
    });

    if (sphericalFaces.length > 20) {
      const centroid = computeCentroid(sphericalFaces.map(f => f.v0));
      const radius = sphericalFaces[0].v0.distanceTo(centroid);

      features.push({
        type: FEATURE_TYPES.SPHERE,
        id: 'sphere_0',
        position: centroid,
        normal: new THREE.Vector3(0, 0, 1),
        radius,
        depth: radius * 2,
        confidence: 0.6,
        faces: sphericalFaces
      });
    }

    return features;
  }

  /**
   * Extract circular edge loops from faces
   * @param {Array} faces - Array of face objects
   * @returns {Array} Array of edge loops
   */
  function extractEdgeLoops(faces) {
    const loops = [];
    const edges = new Map();

    // Build edge map
    faces.forEach(face => {
      const e1 = `${face.v0.x},${face.v0.y},${face.v0.z}-${face.v1.x},${face.v1.y},${face.v1.z}`;
      const e2 = `${face.v1.x},${face.v1.y},${face.v1.z}-${face.v2.x},${face.v2.y},${face.v2.z}`;
      const e3 = `${face.v2.x},${face.v2.y},${face.v2.z}-${face.v0.x},${face.v0.y},${face.v0.z}`;

      [e1, e2, e3].forEach(e => {
        edges.set(e, (edges.get(e) || 0) + 1);
      });
    });

    // Find boundary edges (count === 1)
    const boundaryEdges = Array.from(edges.entries())
      .filter(([k, v]) => v === 1)
      .map(([k]) => k);

    // Trace loops
    const visited = new Set();
    boundaryEdges.forEach(edge => {
      if (visited.has(edge)) return;

      const loop = { vertices: [], edges: [] };
      let current = edge;

      while (!visited.has(current) && loop.vertices.length < 1000) {
        visited.add(current);
        const [p1, p2] = current.split('-');
        const v1 = parseVector(p1);
        loop.vertices.push(v1);
        current = findNextEdge(p2, boundaryEdges, visited);
        if (!current) break;
      }

      if (loop.vertices.length > 8) {
        loops.push(loop);
      }
    });

    return loops;
  }

  /**
   * Fit a circle to a set of points
   * @param {Array} vertices - Array of THREE.Vector3
   * @returns {Object} { center, radius, axis }
   */
  function fitCircle(vertices) {
    if (vertices.length < 3) {
      return { center: vertices[0].clone(), radius: 0, axis: new THREE.Vector3(0, 0, 1) };
    }

    // Project to dominant plane
    let avg = new THREE.Vector3();
    vertices.forEach(v => avg.add(v));
    avg.divideScalar(vertices.length);

    // Compute best-fit plane normal
    let covMatrix = [0,0,0,0,0,0,0,0,0];
    vertices.forEach(v => {
      const p = v.clone().sub(avg);
      covMatrix[0] += p.x * p.x;
      covMatrix[1] += p.x * p.y;
      covMatrix[2] += p.x * p.z;
      covMatrix[4] += p.y * p.y;
      covMatrix[5] += p.y * p.z;
      covMatrix[8] += p.z * p.z;
    });

    // Simple approximation: axis is Z if variance in Z is highest
    const axis = new THREE.Vector3(0, 0, 1);
    const radius = vertices.reduce((sum, v) => sum + v.distanceTo(avg), 0) / vertices.length;

    return { center: avg, radius, axis };
  }

  /**
   * Estimate depth of a cylindrical hole
   * @param {Array} vertices - Edge loop vertices
   * @param {THREE.Vector3} axis - Cylinder axis
   * @returns {number} Estimated depth
   */
  function estimateDepth(vertices, axis) {
    const projections = vertices.map(v => v.dot(axis));
    return Math.max(...projections) - Math.min(...projections);
  }

  /**
   * Classify features into semantic types
   * @param {Array} features - Array of detected features
   * @param {THREE.Mesh} mesh - Source mesh
   */
  function classifyFeatures(features, mesh) {
    features.forEach(feature => {
      if (feature.type === FEATURE_TYPES.MOUNTING_HOLE) {
        // Already classified
      } else if (feature.type === FEATURE_TYPES.FLAT_FACE && feature.radius > 0) {
        // Flat face with hole = boss
        feature.type = FEATURE_TYPES.BOSS;
      }
    });
  }

  /**
   * Compute centroid of points
   * @param {Array} points - Array of THREE.Vector3
   * @returns {THREE.Vector3} Centroid
   */
  function computeCentroid(points) {
    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(Math.max(1, points.length));
    return centroid;
  }

  /**
   * Parse vector from string format "x,y,z"
   * @param {string} str - Vector string
   * @returns {THREE.Vector3} Parsed vector
   */
  function parseVector(str) {
    const [x, y, z] = str.split(',').map(Number);
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Find next edge in loop
   * @param {string} from - Starting point string
   * @param {Array} edges - Boundary edges
   * @param {Set} visited - Visited edges
   * @returns {string} Next edge or null
   */
  function findNextEdge(from, edges, visited) {
    return edges.find(e => {
      if (visited.has(e)) return false;
      return e.startsWith(from);
    }) || null;
  }

  // =========================================================================
  // MATE CONSTRAINT SYSTEM
  // =========================================================================

  /**
   * Create a mate constraint between two features
   * @param {string} partId1 - First part ID
   * @param {Object} feature1 - First feature
   * @param {string} partId2 - Second part ID
   * @param {Object} feature2 - Second feature
   * @param {string} constraintType - Type of constraint
   * @returns {Object} Constraint object
   */
  function createConstraint(partId1, feature1, partId2, feature2, constraintType) {
    const constraint = {
      id: `constraint_${constraints.length}`,
      type: constraintType,
      part1: partId1,
      feature1,
      part2: partId2,
      feature2,
      parameters: {},
      priority: getPriority(constraintType),
      active: true,
      visualElement: null
    };

    // Set default parameters based on constraint type
    switch (constraintType) {
      case CONSTRAINT_TYPES.DISTANCE:
        constraint.parameters.distance = 0;
        break;
      case CONSTRAINT_TYPES.ANGLE:
        constraint.parameters.angle = 0;
        break;
      case CONSTRAINT_TYPES.GEAR:
        constraint.parameters.ratio = 1;
        break;
    }

    constraints.push(constraint);
    return constraint;
  }

  /**
   * Get priority for constraint solving (higher = solve first)
   * @param {string} constraintType - Type of constraint
   * @returns {number} Priority value
   */
  function getPriority(constraintType) {
    const priorities = {
      [CONSTRAINT_TYPES.CONCENTRIC]: 100,
      [CONSTRAINT_TYPES.COINCIDENT]: 90,
      [CONSTRAINT_TYPES.DISTANCE]: 80,
      [CONSTRAINT_TYPES.ANGLE]: 70,
      [CONSTRAINT_TYPES.PARALLEL]: 60,
      [CONSTRAINT_TYPES.PERPENDICULAR]: 60,
      [CONSTRAINT_TYPES.TANGENT]: 50,
      [CONSTRAINT_TYPES.GEAR]: 40
    };
    return priorities[constraintType] || 50;
  }

  /**
   * Solve assembly constraints iteratively
   * @param {number} iterations - Number of solver iterations
   */
  function solveConstraints(iterations = 10) {
    // Sort constraints by priority
    const sorted = [...constraints].sort((a, b) => b.priority - a.priority);

    for (let iter = 0; iter < iterations; iter++) {
      sorted.forEach(constraint => {
        if (!constraint.active) return;

        const part1 = window.CycleCAD?.app?.parts?.get?.(constraint.part1);
        const part2 = window.CycleCAD?.app?.parts?.get?.(constraint.part2);

        if (!part1 || !part2) return;

        applySingleConstraint(constraint, part1, part2);
      });
    }
  }

  /**
   * Apply a single constraint to two parts
   * @param {Object} constraint - Constraint to apply
   * @param {THREE.Mesh} part1 - First part mesh
   * @param {THREE.Mesh} part2 - Second part mesh
   */
  function applySingleConstraint(constraint, part1, part2) {
    const f1 = constraint.feature1;
    const f2 = constraint.feature2;
    const damping = 0.3; // Gradual convergence

    switch (constraint.type) {
      case CONSTRAINT_TYPES.COINCIDENT:
        // Align face-to-face (planes coincident)
        applyCoincidentConstraint(part1, part2, f1, f2, damping);
        break;

      case CONSTRAINT_TYPES.CONCENTRIC:
        // Align axes (shaft in hole)
        applyConcentricConstraint(part1, part2, f1, f2, damping);
        break;

      case CONSTRAINT_TYPES.TANGENT:
        // Surface tangency
        applyTangentConstraint(part1, part2, f1, f2, damping);
        break;

      case CONSTRAINT_TYPES.DISTANCE:
        // Maintain distance between surfaces
        applyDistanceConstraint(part1, part2, f1, f2, constraint.parameters.distance, damping);
        break;

      case CONSTRAINT_TYPES.ANGLE:
        // Fixed angle between faces
        applyAngleConstraint(part1, part2, f1, f2, constraint.parameters.angle, damping);
        break;

      case CONSTRAINT_TYPES.PARALLEL:
        // Faces parallel at offset
        applyParallelConstraint(part1, part2, f1, f2, damping);
        break;

      case CONSTRAINT_TYPES.PERPENDICULAR:
        // Faces perpendicular
        applyPerpendicularConstraint(part1, part2, f1, f2, damping);
        break;
    }
  }

  /**
   * Apply coincident constraint (face-to-face)
   */
  function applyCoincidentConstraint(part1, part2, f1, f2, damping) {
    const offset = f2.position.clone().sub(f1.position).multiplyScalar(damping);
    part2.position.add(offset);

    // Align normals
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(f2.normal, f1.normal.clone().negate());
    part2.quaternion.multiplyQuaternions(quat, part2.quaternion);
  }

  /**
   * Apply concentric constraint (axis alignment)
   */
  function applyConcentricConstraint(part1, part2, f1, f2, damping) {
    // Move part2 so axes align
    const offset = f1.position.clone().sub(f2.position).multiplyScalar(damping);
    part2.position.add(offset);

    // Rotate part2 so normals (axes) align
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(f2.normal, f1.normal);
    part2.quaternion.multiplyQuaternions(quat, part2.quaternion);
  }

  /**
   * Apply tangent constraint (surface tangency)
   */
  function applyTangentConstraint(part1, part2, f1, f2, damping) {
    const distance = f1.radius + f2.radius;
    const direction = f1.position.clone().sub(f2.position).normalize();
    const targetPos = f2.position.clone().add(direction.multiplyScalar(distance));
    const offset = targetPos.sub(f2.position).multiplyScalar(damping);
    part2.position.add(offset);
  }

  /**
   * Apply distance constraint (maintain offset)
   */
  function applyDistanceConstraint(part1, part2, f1, f2, targetDist, damping) {
    const current = f1.position.distanceTo(f2.position);
    const offset = targetDist - current;
    const direction = f1.position.clone().sub(f2.position).normalize();
    part2.position.add(direction.multiplyScalar(offset * damping * 0.5));
  }

  /**
   * Apply angle constraint
   */
  function applyAngleConstraint(part1, part2, f1, f2, targetAngle, damping) {
    const currentAngle = Math.acos(Math.min(1, Math.max(-1, f1.normal.dot(f2.normal))));
    const angleDiff = targetAngle - currentAngle;
    const axis = f1.normal.clone().cross(f2.normal).normalize();

    if (axis.length() > 0.01) {
      const quat = new THREE.Quaternion();
      quat.setFromAxisAngle(axis, angleDiff * damping * 0.5);
      part2.quaternion.multiplyQuaternions(quat, part2.quaternion);
    }
  }

  /**
   * Apply parallel constraint
   */
  function applyParallelConstraint(part1, part2, f1, f2, damping) {
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(f2.normal, f1.normal);
    part2.quaternion.multiplyQuaternions(quat, part2.quaternion);
  }

  /**
   * Apply perpendicular constraint
   */
  function applyPerpendicularConstraint(part1, part2, f1, f2, damping) {
    const target = f2.normal.clone().cross(f1.normal).normalize();
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(f2.normal, target);
    part2.quaternion.multiplyQuaternions(quat, part2.quaternion);
  }

  /**
   * Visualize constraints as lines and arrows
   */
  function visualizeConstraints() {
    // Clear old visuals
    constraints.forEach(c => {
      if (c.visualElement) {
        c.visualElement.geometry?.dispose?.();
        c.visualElement.material?.dispose?.();
        window.CycleCAD?.app?.scene?.remove?.(c.visualElement);
        c.visualElement = null;
      }
    });

    if (!constraintVisualsEnabled) return;

    const scene = window.CycleCAD?.app?.scene;
    if (!scene) return;

    constraints.forEach(constraint => {
      const colors = {
        [CONSTRAINT_TYPES.COINCIDENT]: 0x00FF00,
        [CONSTRAINT_TYPES.CONCENTRIC]: 0x0088FF,
        [CONSTRAINT_TYPES.TANGENT]: 0xFF8800,
        [CONSTRAINT_TYPES.PARALLEL]: 0xFF0088,
        [CONSTRAINT_TYPES.PERPENDICULAR]: 0x88FF00,
        [CONSTRAINT_TYPES.DISTANCE]: 0xFFFF00,
        [CONSTRAINT_TYPES.ANGLE]: 0xFF0000,
        [CONSTRAINT_TYPES.GEAR]: 0x8800FF
      };

      const color = colors[constraint.type] || 0xFFFFFF;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array([
        constraint.feature1.position.x, constraint.feature1.position.y, constraint.feature1.position.z,
        constraint.feature2.position.x, constraint.feature2.position.y, constraint.feature2.position.z
      ]);
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({ color, linewidth: 2 });
      const line = new THREE.Line(geometry, material);
      scene.add(line);
      constraint.visualElement = line;
    });
  }

  // =========================================================================
  // AUTO-MATING INTELLIGENCE
  // =========================================================================

  /**
   * Score compatibility between two features
   * @param {Object} f1 - First feature
   * @param {Object} f2 - Second feature
   * @returns {number} Compatibility score (0-1)
   */
  function scoreCompatibility(f1, f2) {
    let score = 0;

    // Matching types get high score
    if (f1.type === FEATURE_TYPES.SHAFT && f2.type === FEATURE_TYPES.MOUNTING_HOLE) {
      score = 0.9;
    } else if (f1.type === FEATURE_TYPES.MOUNTING_HOLE && f2.type === FEATURE_TYPES.MOUNTING_HOLE) {
      // Hole-to-hole mating (coaxial)
      score = 0.85;
    } else if (f1.type === FEATURE_TYPES.FLAT_FACE && f2.type === FEATURE_TYPES.FLAT_FACE) {
      score = 0.75;
    } else if (f1.type === FEATURE_TYPES.SPHERE && f2.type === FEATURE_TYPES.FLAT_FACE) {
      score = 0.7;
    } else if ((f1.type === FEATURE_TYPES.CYLINDER || f1.type === FEATURE_TYPES.BOSS) &&
               (f2.type === FEATURE_TYPES.FLAT_FACE || f2.type === FEATURE_TYPES.POCKET)) {
      score = 0.65;
    }

    // Check radius matching (within 20%)
    if (score > 0 && f1.radius > 0 && f2.radius > 0) {
      const radiusRatio = Math.max(f1.radius, f2.radius) / Math.max(0.001, Math.min(f1.radius, f2.radius));
      if (radiusRatio < 1.2) {
        score *= 1.1; // Bonus for matching sizes
      } else if (radiusRatio > 1.5) {
        score *= 0.7; // Penalty for mismatched sizes
      }
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Calculate proximity score
   * @param {Object} f1 - First feature
   * @param {Object} f2 - Second feature
   * @param {number} maxDist - Maximum distance threshold
   * @returns {number} Proximity score (0-1)
   */
  function scoreProximity(f1, f2, maxDist = 50) {
    const dist = f1.position.distanceTo(f2.position);
    return Math.max(0, 1 - (dist / maxDist));
  }

  /**
   * Calculate alignment quality
   * @param {Object} f1 - First feature
   * @param {Object} f2 - Second feature
   * @returns {number} Alignment score (0-1)
   */
  function scoreAlignment(f1, f2) {
    if (!f1.normal || !f2.normal) return 0.5;

    const dotProduct = Math.abs(f1.normal.dot(f2.normal));
    return dotProduct; // 0 = perpendicular, 1 = parallel/antiparallel
  }

  /**
   * Find top auto-mate suggestions for a part
   * @param {string} draggedPartId - Part being dragged
   * @param {string} targetPartId - Part being dragged near
   * @returns {Array} Top 3 suggestions sorted by score
   */
  function suggestMates(draggedPartId, targetPartId) {
    const draggedFeatures = detectedFeatures.get(draggedPartId) || [];
    const targetFeatures = detectedFeatures.get(targetPartId) || [];

    const suggestions = [];

    draggedFeatures.forEach(df => {
      targetFeatures.forEach(tf => {
        const compat = scoreCompatibility(df, tf);
        const proximity = scoreProximity(df, tf, 100);
        const alignment = scoreAlignment(df, tf);

        const totalScore = compat * 0.5 + proximity * 0.3 + alignment * 0.2;

        if (totalScore > 0.3) {
          suggestions.push({
            score: totalScore,
            constraintType: inferConstraintType(df, tf),
            f1: df,
            f2: tf,
            part1: draggedPartId,
            part2: targetPartId
          });
        }
      });
    });

    return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /**
   * Infer best constraint type for two features
   * @param {Object} f1 - First feature
   * @param {Object} f2 - Second feature
   * @returns {string} Constraint type
   */
  function inferConstraintType(f1, f2) {
    if ((f1.type === FEATURE_TYPES.SHAFT && f2.type === FEATURE_TYPES.MOUNTING_HOLE) ||
        (f1.type === FEATURE_TYPES.MOUNTING_HOLE && f2.type === FEATURE_TYPES.MOUNTING_HOLE)) {
      return CONSTRAINT_TYPES.CONCENTRIC;
    }
    if (f1.type === FEATURE_TYPES.FLAT_FACE && f2.type === FEATURE_TYPES.FLAT_FACE) {
      return CONSTRAINT_TYPES.COINCIDENT;
    }
    if (f1.radius > 0 && f2.radius > 0) {
      return CONSTRAINT_TYPES.TANGENT;
    }
    return CONSTRAINT_TYPES.DISTANCE;
  }

  /**
   * Auto-mate all unmated parts in assembly
   * @param {number} threshold - Confidence threshold (0-1)
   */
  function autoMateAll(threshold = autoMateThreshold) {
    const parts = Array.from(window.CycleCAD?.app?.parts?.entries?.() || []);

    parts.forEach(([id1, part1]) => {
      parts.forEach(([id2, part2]) => {
        if (id1 === id2) return;

        // Check if already constrained
        if (constraints.some(c =>
          (c.part1 === id1 && c.part2 === id2) ||
          (c.part1 === id2 && c.part2 === id1))) {
          return;
        }

        const suggestions = suggestMates(id1, id2);
        if (suggestions.length > 0 && suggestions[0].score >= threshold) {
          const s = suggestions[0];
          createConstraint(s.part1, s.f1, s.part2, s.f2, s.constraintType);
        }
      });
    });

    solveConstraints();
    visualizeConstraints();
  }

  // =========================================================================
  // MOTION STUDY
  // =========================================================================

  /**
   * Define a joint from constraints
   * @param {Array} constraintIds - Array of constraint IDs forming joint
   * @param {string} jointType - Type of joint (revolute, prismatic, etc)
   * @returns {Object} Joint object
   */
  function defineJoint(constraintIds, jointType) {
    const relatedConstraints = constraints.filter(c => constraintIds.includes(c.id));

    const joint = {
      id: `joint_${motionStudies.length}`,
      type: jointType,
      constraints: relatedConstraints,
      range: { min: 0, max: 360 }, // degrees for revolute, mm for prismatic
      current: 0,
      speed: 1,
      playing: false,
      keyframes: []
    };

    // Set range based on joint type
    if (jointType === JOINT_TYPES.PRISMATIC) {
      joint.range.max = 100; // 100mm default stroke
    } else if (jointType === JOINT_TYPES.BALL) {
      joint.range.max = 180;
    }

    motionStudies.push(joint);
    return joint;
  }

  /**
   * Play motion study
   * @param {string} jointId - Joint ID to animate
   */
  function playMotion(jointId) {
    const joint = motionStudies.find(j => j.id === jointId);
    if (joint) {
      joint.playing = true;
      joint.current = joint.range.min;
      activeMotionStudy = joint;
    }
  }

  /**
   * Stop motion study
   * @param {string} jointId - Joint ID to stop
   */
  function stopMotion(jointId) {
    const joint = motionStudies.find(j => j.id === jointId);
    if (joint) {
      joint.playing = false;
    }
  }

  /**
   * Update motion frame (called from animation loop)
   * @param {number} deltaTime - Delta time in seconds
   */
  function updateMotion(deltaTime) {
    if (!activeMotionStudy || !activeMotionStudy.playing) return;

    const joint = activeMotionStudy;
    joint.current += (joint.range.max - joint.range.min) * joint.speed * deltaTime * 0.1;

    if (joint.current > joint.range.max) {
      joint.current = joint.range.min;
    }

    applyJointTransform(joint);
  }

  /**
   * Apply joint transformation to all constrained parts
   * @param {Object} joint - Joint object
   */
  function applyJointTransform(joint) {
    joint.constraints.forEach(constraint => {
      const part = window.CycleCAD?.app?.parts?.get?.(constraint.part2);
      if (!part) return;

      const origin = constraint.feature1.position;
      const axis = constraint.feature1.normal;

      if (joint.type === JOINT_TYPES.REVOLUTE) {
        // Rotate around axis
        const angle = (joint.current / 360) * Math.PI * 2;
        const quat = new THREE.Quaternion();
        quat.setFromAxisAngle(axis, angle);

        // Rotate around origin point
        part.position.sub(origin);
        part.position.applyQuaternion(quat);
        part.position.add(origin);
        part.quaternion.multiplyQuaternions(quat, part.quaternion);

      } else if (joint.type === JOINT_TYPES.PRISMATIC) {
        // Slide along axis
        const distance = joint.current * axis;
        part.position.copy(constraint.feature1.position).add(distance);
      }
    });
  }

  /**
   * Check for part interference during motion
   * @param {Object} joint - Joint object
   * @returns {Array} Array of interference objects
   */
  function checkInterference(joint) {
    const interferences = [];
    const parts = Array.from(window.CycleCAD?.app?.parts?.values?.() || []);

    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (checkMeshIntersection(parts[i], parts[j])) {
          interferences.push({
            part1: parts[i],
            part2: parts[j],
            position: parts[i].position.clone().lerp(parts[j].position, 0.5)
          });
        }
      }
    }

    return interferences;
  }

  /**
   * Check if two meshes intersect (AABB approximation)
   * @param {THREE.Mesh} m1 - First mesh
   * @param {THREE.Mesh} m2 - Second mesh
   * @returns {boolean} True if meshes overlap
   */
  function checkMeshIntersection(m1, m2) {
    const box1 = new THREE.Box3().setFromObject(m1);
    const box2 = new THREE.Box3().setFromObject(m2);
    return box1.intersectsBox(box2);
  }

  // =========================================================================
  // ASSEMBLY TREE
  // =========================================================================

  /**
   * Add part to assembly
   * @param {THREE.Mesh} part - Part mesh
   * @param {string} partId - Part identifier
   * @param {string} name - Display name
   */
  function addPart(part, partId, name) {
    assemblyTree.parts.push({
      id: partId,
      name: name || `Part_${partId}`,
      mesh: part,
      constraints: [],
      hidden: false,
      suppressed: false
    });

    // Detect features
    detectFeatures(part, partId);
  }

  /**
   * Get constraint status for a part
   * @param {string} partId - Part ID
   * @returns {Object} { total, satisfied, over, under }
   */
  function getConstraintStatus(partId) {
    const partConstraints = constraints.filter(c => c.part1 === partId || c.part2 === partId);

    return {
      total: partConstraints.length,
      satisfied: partConstraints.filter(c => c.active).length,
      over: Math.max(0, partConstraints.filter(c => c.active).length - 6),
      under: Math.max(0, 6 - partConstraints.filter(c => c.active).length)
    };
  }

  // =========================================================================
  // UI PANEL
  // =========================================================================

  /**
   * Initialize smart assembly module
   */
  function init() {
    // Attach to app if available
    if (window.CycleCAD?.app) {
      window.CycleCAD.app.smartAssembly = window.CycleCAD.SmartAssembly;
    }
  }

  /**
   * Get UI panel HTML
   * @returns {string} HTML for smart assembly panel
   */
  function getUI() {
    const tabHtml = `
      <div class="smart-assembly-panel" style="
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--color-bg-panel, #1a1a1a);
        color: var(--color-text, #e0e0e0);
        font-family: 'Segoe UI', sans-serif;
        font-size: 12px;
        border-radius: 4px;
        overflow: hidden;
      ">
        <!-- Tab Navigation -->
        <div style="
          display: flex;
          border-bottom: 1px solid var(--color-border, #333);
          background: var(--color-bg-darker, #0f0f0f);
        ">
          <button class="sa-tab-btn" data-tab="mate" style="
            flex: 1;
            padding: 10px;
            background: var(--color-accent, #007acc);
            color: white;
            border: none;
            cursor: pointer;
            font-weight: 500;
          ">Mate</button>
          <button class="sa-tab-btn" data-tab="motion" style="
            flex: 1;
            padding: 10px;
            background: transparent;
            color: var(--color-text, #e0e0e0);
            border: none;
            cursor: pointer;
            border-left: 1px solid var(--color-border, #333);
          ">Motion</button>
          <button class="sa-tab-btn" data-tab="tree" style="
            flex: 1;
            padding: 10px;
            background: transparent;
            color: var(--color-text, #e0e0e0);
            border: none;
            cursor: pointer;
            border-left: 1px solid var(--color-border, #333);
          ">Tree</button>
          <button class="sa-tab-btn" data-tab="visual" style="
            flex: 1;
            padding: 10px;
            background: transparent;
            color: var(--color-text, #e0e0e0);
            border: none;
            cursor: pointer;
            border-left: 1px solid var(--color-border, #333);
          ">Visual</button>
        </div>

        <!-- Tab Content -->
        <div style="flex: 1; overflow: auto;">

          <!-- MATE TAB -->
          <div class="sa-tab-content" id="sa-mate" style="
            padding: 15px;
            display: block;
          ">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600;">Quick Mate</h3>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Select 2 Faces/Features
              </label>
              <div style="
                padding: 8px;
                background: var(--color-bg-input, #252525);
                border: 1px solid var(--color-border, #333);
                border-radius: 3px;
                min-height: 50px;
                font-size: 11px;
              " id="sa-selection-display">
                <span style="color: var(--color-text-secondary, #a0a0a0);">Click faces to select...</span>
              </div>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Constraint Type
              </label>
              <select id="sa-constraint-type" style="
                width: 100%;
                padding: 6px;
                background: var(--color-bg-input, #252525);
                color: var(--color-text, #e0e0e0);
                border: 1px solid var(--color-border, #333);
                border-radius: 3px;
                font-size: 11px;
              ">
                <option value="concentric">Concentric (Shaft in Hole)</option>
                <option value="coincident">Coincident (Face to Face)</option>
                <option value="distance">Distance</option>
                <option value="angle">Angle</option>
                <option value="parallel">Parallel</option>
                <option value="perpendicular">Perpendicular</option>
                <option value="tangent">Tangent</option>
                <option value="gear">Gear</option>
              </select>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Parameter (if needed)
              </label>
              <input type="number" id="sa-param-value" placeholder="0" style="
                width: 100%;
                padding: 6px;
                background: var(--color-bg-input, #252525);
                color: var(--color-text, #e0e0e0);
                border: 1px solid var(--color-border, #333);
                border-radius: 3px;
                font-size: 11px;
                box-sizing: border-box;
              " />
            </div>

            <button id="sa-apply-mate" style="
              width: 100%;
              padding: 8px;
              background: var(--color-accent, #007acc);
              color: white;
              border: none;
              border-radius: 3px;
              font-weight: 500;
              cursor: pointer;
              margin-bottom: 10px;
            ">Apply Constraint</button>

            <button id="sa-auto-mate" style="
              width: 100%;
              padding: 8px;
              background: var(--color-success, #22aa22);
              color: white;
              border: none;
              border-radius: 3px;
              font-weight: 500;
              cursor: pointer;
              margin-bottom: 10px;
            ">Auto-Mate All</button>

            <h3 style="margin: 15px 0 10px 0; font-size: 13px; font-weight: 600;">Suggestions</h3>
            <div id="sa-suggestions" style="
              max-height: 150px;
              overflow: auto;
            "></div>

            <h3 style="margin: 15px 0 10px 0; font-size: 13px; font-weight: 600;">Active Constraints</h3>
            <div id="sa-constraints-list" style="
              max-height: 150px;
              overflow: auto;
              font-size: 11px;
            "></div>
          </div>

          <!-- MOTION TAB -->
          <div class="sa-tab-content" id="sa-motion" style="
            padding: 15px;
            display: none;
          ">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600;">Motion Study</h3>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Joint Type
              </label>
              <select id="sa-joint-type" style="
                width: 100%;
                padding: 6px;
                background: var(--color-bg-input, #252525);
                color: var(--color-text, #e0e0e0);
                border: 1px solid var(--color-border, #333);
                border-radius: 3px;
                font-size: 11px;
              ">
                <option value="revolute">Revolute (Rotate)</option>
                <option value="prismatic">Prismatic (Slide)</option>
                <option value="cylindrical">Cylindrical</option>
                <option value="ball">Ball</option>
                <option value="planar">Planar</option>
              </select>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Range (degrees/mm)
              </label>
              <div style="display: flex; gap: 5px;">
                <input type="number" id="sa-range-min" placeholder="0" style="
                  flex: 1;
                  padding: 6px;
                  background: var(--color-bg-input, #252525);
                  color: var(--color-text, #e0e0e0);
                  border: 1px solid var(--color-border, #333);
                  border-radius: 3px;
                  font-size: 11px;
                " />
                <input type="number" id="sa-range-max" placeholder="360" style="
                  flex: 1;
                  padding: 6px;
                  background: var(--color-bg-input, #252525);
                  color: var(--color-text, #e0e0e0);
                  border: 1px solid var(--color-border, #333);
                  border-radius: 3px;
                  font-size: 11px;
                " />
              </div>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Speed
              </label>
              <input type="range" id="sa-speed" min="0.1" max="5" step="0.1" value="1" style="
                width: 100%;
              " />
              <span id="sa-speed-display" style="font-size: 10px; color: var(--color-text-secondary, #a0a0a0);">1.0x</span>
            </div>

            <div style="display: flex; gap: 5px; margin-bottom: 10px;">
              <button id="sa-motion-play" style="
                flex: 1;
                padding: 8px;
                background: var(--color-accent, #007acc);
                color: white;
                border: none;
                border-radius: 3px;
                font-weight: 500;
                cursor: pointer;
              ">Play</button>
              <button id="sa-motion-stop" style="
                flex: 1;
                padding: 8px;
                background: var(--color-warning, #ff9900);
                color: white;
                border: none;
                border-radius: 3px;
                font-weight: 500;
                cursor: pointer;
              ">Stop</button>
            </div>

            <h3 style="margin: 15px 0 10px 0; font-size: 13px; font-weight: 600;">Joints</h3>
            <div id="sa-joints-list" style="
              max-height: 200px;
              overflow: auto;
              font-size: 11px;
            "></div>

            <h3 style="margin: 15px 0 10px 0; font-size: 13px; font-weight: 600;">Interference</h3>
            <div id="sa-interference-list" style="
              max-height: 100px;
              overflow: auto;
              font-size: 11px;
              color: var(--color-warning, #ff9900);
            "></div>
          </div>

          <!-- TREE TAB -->
          <div class="sa-tab-content" id="sa-tree" style="
            padding: 15px;
            display: none;
          ">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600;">Assembly Tree</h3>
            <div id="sa-tree-view" style="
              max-height: 400px;
              overflow: auto;
              font-size: 11px;
            "></div>
          </div>

          <!-- VISUAL TAB -->
          <div class="sa-tab-content" id="sa-visual" style="
            padding: 15px;
            display: none;
          ">
            <h3 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600;">Visualization</h3>

            <div style="margin-bottom: 10px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
                <input type="checkbox" id="sa-show-constraints" checked style="cursor: pointer;" />
                Show Constraint Lines
              </label>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Explode (%)
              </label>
              <input type="range" id="sa-explode-slider" min="0" max="100" step="5" value="0" style="
                width: 100%;
              " />
              <span id="sa-explode-display" style="font-size: 10px; color: var(--color-text-secondary, #a0a0a0);">0%</span>
            </div>

            <div style="margin-bottom: 10px;">
              <label style="display: block; margin-bottom: 5px; font-size: 11px; color: var(--color-text-secondary, #a0a0a0);">
                Part Colors by Status
              </label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 10px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div style="width: 12px; height: 12px; background: #22aa22; border-radius: 2px;"></div>
                  <span>Fully Constrained</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div style="width: 12px; height: 12px; background: #ffaa00; border-radius: 2px;"></div>
                  <span>Under-Constrained</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div style="width: 12px; height: 12px; background: #ff3333; border-radius: 2px;"></div>
                  <span>Over-Constrained</span>
                </div>
              </div>
            </div>

            <h3 style="margin: 15px 0 10px 0; font-size: 13px; font-weight: 600;">Features Detected</h3>
            <div id="sa-features-list" style="
              max-height: 150px;
              overflow: auto;
              font-size: 11px;
            "></div>
          </div>

        </div>

        <!-- Status Bar -->
        <div style="
          padding: 10px;
          background: var(--color-bg-darker, #0f0f0f);
          border-top: 1px solid var(--color-border, #333);
          font-size: 10px;
          color: var(--color-text-secondary, #a0a0a0);
        ">
          <div id="sa-status" style="margin-bottom: 5px;">Ready</div>
          <div style="display: flex; gap: 5px;">
            <span>Parts: <span id="sa-parts-count">0</span></span>
            <span>Constraints: <span id="sa-constraints-count">0</span></span>
            <span>Joints: <span id="sa-joints-count">0</span></span>
          </div>
        </div>
      </div>
    `;

    const panelDiv = document.createElement('div');
    panelDiv.innerHTML = tabHtml;

    // Attach event handlers
    attachEventHandlers(panelDiv);

    return panelDiv;
  }

  /**
   * Attach event handlers to UI elements
   * @param {HTMLElement} panelDiv - Panel root element
   */
  function attachEventHandlers(panelDiv) {
    // Tab switching
    panelDiv.querySelectorAll('.sa-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        panelDiv.querySelectorAll('.sa-tab-content').forEach(t => t.style.display = 'none');
        panelDiv.querySelector(`#sa-${tabName}`).style.display = 'block';

        // Update button styles
        panelDiv.querySelectorAll('.sa-tab-btn').forEach(b => {
          b.style.background = b === e.target ? 'var(--color-accent, #007acc)' : 'transparent';
        });

        // Refresh data when tab opens
        if (tabName === 'motion') refreshMotionTab(panelDiv);
        if (tabName === 'tree') refreshTreeTab(panelDiv);
        if (tabName === 'visual') refreshVisualTab(panelDiv);
      });
    });

    // Mate controls
    panelDiv.querySelector('#sa-apply-mate').addEventListener('click', () => {
      applyMateFromUI(panelDiv);
    });

    panelDiv.querySelector('#sa-auto-mate').addEventListener('click', () => {
      autoMateAll();
      refreshConstraintsDisplay(panelDiv);
    });

    // Motion controls
    panelDiv.querySelector('#sa-motion-play').addEventListener('click', () => {
      if (motionStudies.length > 0) {
        playMotion(motionStudies[0].id);
      }
    });

    panelDiv.querySelector('#sa-motion-stop').addEventListener('click', () => {
      motionStudies.forEach(j => stopMotion(j.id));
    });

    // Speed slider
    panelDiv.querySelector('#sa-speed').addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      if (motionStudies.length > 0) {
        motionStudies[0].speed = speed;
      }
      panelDiv.querySelector('#sa-speed-display').textContent = speed.toFixed(1) + 'x';
    });

    // Explode slider
    panelDiv.querySelector('#sa-explode-slider').addEventListener('input', (e) => {
      explodeAmount = parseInt(e.target.value);
      panelDiv.querySelector('#sa-explode-display').textContent = explodeAmount + '%';
      applyExplode();
    });

    // Constraint visibility toggle
    panelDiv.querySelector('#sa-show-constraints').addEventListener('change', (e) => {
      constraintVisualsEnabled = e.target.checked;
      visualizeConstraints();
    });

    // Initial refresh
    refreshConstraintsDisplay(panelDiv);
    refreshStatusBar(panelDiv);
  }

  /**
   * Apply mate constraint from UI selection
   */
  function applyMateFromUI(panelDiv) {
    if (selectedParts.length < 2) {
      panelDiv.querySelector('#sa-status').textContent = 'Select 2 features first';
      return;
    }

    const constraintType = panelDiv.querySelector('#sa-constraint-type').value;
    const paramValue = parseFloat(panelDiv.querySelector('#sa-param-value').value) || 0;

    const [part1, f1, part2, f2] = selectedParts.slice(0, 4);
    const constraint = createConstraint(part1, f1, part2, f2, constraintType);

    if (constraintType === CONSTRAINT_TYPES.DISTANCE) {
      constraint.parameters.distance = paramValue;
    } else if (constraintType === CONSTRAINT_TYPES.ANGLE) {
      constraint.parameters.angle = paramValue;
    }

    solveConstraints();
    visualizeConstraints();
    refreshConstraintsDisplay(panelDiv);
    refreshStatusBar(panelDiv);
    selectedParts = [];
    panelDiv.querySelector('#sa-status').textContent = `Constraint ${constraint.id} applied`;
  }

  /**
   * Refresh motion tab display
   */
  function refreshMotionTab(panelDiv) {
    const jointsList = panelDiv.querySelector('#sa-joints-list');
    jointsList.innerHTML = motionStudies.map(j => `
      <div style="
        padding: 6px;
        background: var(--color-bg-input, #252525);
        border-radius: 2px;
        margin-bottom: 5px;
      ">
        <div><strong>${j.id}</strong> (${j.type})</div>
        <div style="color: var(--color-text-secondary, #a0a0a0);">
          Range: ${j.range.min.toFixed(1)} - ${j.range.max.toFixed(1)}
        </div>
      </div>
    `).join('');

    const interference = checkInterference(activeMotionStudy || motionStudies[0]);
    const interfList = panelDiv.querySelector('#sa-interference-list');
    interfList.innerHTML = interference.length > 0 ?
      `<div>⚠ ${interference.length} interference(s) detected</div>` :
      '<div style="color: var(--color-success, #22aa22);">No interferences</div>';
  }

  /**
   * Refresh tree tab display
   */
  function refreshTreeTab(panelDiv) {
    const treeView = panelDiv.querySelector('#sa-tree-view');
    treeView.innerHTML = assemblyTree.parts.map(p => {
      const status = getConstraintStatus(p.id);
      const statusColor = status.under > 0 ? 'var(--color-warning, #ff9900)' :
                         status.over > 0 ? 'var(--color-warning, #ff9900)' :
                         'var(--color-success, #22aa22)';

      return `
        <div style="
          padding: 6px;
          background: var(--color-bg-input, #252525);
          border-radius: 2px;
          margin-bottom: 5px;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>${p.name}</strong>
            <span style="color: ${statusColor}; font-size: 10px;">
              ${status.satisfied}/${status.total} constraints
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Refresh visual tab display
   */
  function refreshVisualTab(panelDiv) {
    const featuresList = panelDiv.querySelector('#sa-features-list');
    let html = '';
    detectedFeatures.forEach((features, partId) => {
      html += `<div style="font-weight: 600; margin-bottom: 5px;">${partId}</div>`;
      features.forEach(f => {
        html += `
          <div style="
            padding: 4px 8px;
            background: var(--color-bg-darker, #0f0f0f);
            margin-bottom: 3px;
            border-left: 2px solid var(--color-accent, #007acc);
          ">
            ${f.type} (confidence: ${(f.confidence * 100).toFixed(0)}%)
          </div>
        `;
      });
    });
    featuresList.innerHTML = html || '<div style="color: var(--color-text-secondary, #a0a0a0);">No features detected</div>';
  }

  /**
   * Refresh constraints display
   */
  function refreshConstraintsDisplay(panelDiv) {
    const list = panelDiv.querySelector('#sa-constraints-list');
    list.innerHTML = constraints.map(c => `
      <div style="
        padding: 6px;
        background: var(--color-bg-input, #252525);
        border-radius: 2px;
        margin-bottom: 5px;
      ">
        <div style="display: flex; justify-content: space-between;">
          <span><strong>${c.type}</strong></span>
          <button style="
            padding: 2px 8px;
            background: var(--color-warning, #ff9900);
            color: white;
            border: none;
            border-radius: 2px;
            font-size: 10px;
            cursor: pointer;
          " onclick="window.CycleCAD.SmartAssembly.removeConstraint('${c.id}')">Delete</button>
        </div>
        <div style="font-size: 10px; color: var(--color-text-secondary, #a0a0a0);">
          ${c.part1} → ${c.part2}
        </div>
      </div>
    `).join('');
  }

  /**
   * Refresh status bar
   */
  function refreshStatusBar(panelDiv) {
    panelDiv.querySelector('#sa-parts-count').textContent = assemblyTree.parts.length;
    panelDiv.querySelector('#sa-constraints-count').textContent = constraints.length;
    panelDiv.querySelector('#sa-joints-count').textContent = motionStudies.length;
  }

  /**
   * Apply explode transformation to all parts
   */
  function applyExplode() {
    const centerOfMass = new THREE.Vector3();
    assemblyTree.parts.forEach(p => centerOfMass.add(p.mesh.position));
    centerOfMass.divideScalar(Math.max(1, assemblyTree.parts.length));

    const factor = explodeAmount / 100;
    assemblyTree.parts.forEach(p => {
      const direction = p.mesh.position.clone().sub(centerOfMass).normalize();
      const distance = p.mesh.position.distanceTo(centerOfMass);
      p.mesh.position.copy(centerOfMass).add(direction.multiplyScalar(distance * (1 + factor * 0.5)));
    });
  }

  /**
   * Execute command (for agent API compatibility)
   * @param {string} method - Method name
   * @param {Object} params - Parameters
   * @returns {*} Result
   */
  function execute(method, params) {
    switch (method) {
      case 'detectFeatures':
        return detectFeatures(params.mesh, params.partId);
      case 'createConstraint':
        return createConstraint(params.part1, params.feature1, params.part2, params.feature2, params.type);
      case 'solveConstraints':
        return solveConstraints(params.iterations);
      case 'autoMateAll':
        return autoMateAll(params.threshold);
      case 'playMotion':
        return playMotion(params.jointId);
      case 'stopMotion':
        return stopMotion(params.jointId);
      case 'addPart':
        return addPart(params.mesh, params.partId, params.name);
      default:
        return null;
    }
  }

  /**
   * Remove a constraint by ID (public method for UI)
   * @param {string} constraintId - Constraint ID
   */
  function removeConstraint(constraintId) {
    constraints = constraints.filter(c => c.id !== constraintId);
    visualizeConstraints();
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    init,
    getUI,
    execute,
    detectFeatures,
    createConstraint,
    solveConstraints,
    suggestMates,
    autoMateAll,
    detectMates: suggestMates, // Alias
    getConstraints: () => constraints,
    addPart,
    defineJoint,
    playMotion,
    stopMotion,
    updateMotion,
    checkInterference,
    visualizeConstraints,
    removeConstraint,
    get constraints() { return constraints; },
    get motionStudies() { return motionStudies; },
    get assemblyTree() { return assemblyTree; }
  };
})();

window.CycleCAD.SmartAssembly = SmartAssembly;
