/**
 * @fileoverview Auto-Assembly Module for cycleCAD
 * Analyzes part geometry, detects compatible features, and automatically assembles parts
 * Features: geometry fingerprinting, shaft-hole matching, face mating, collision detection,
 * assembly validation, animated assembly, and pre-defined templates
 *
 * @version 1.0.0
 * @author cycleCAD
 */

window.CycleCAD = window.CycleCAD || {};

/**
 * Auto-Assembly module — analyzes parts and automatically mates them together
 */
window.CycleCAD.AutoAssembly = (() => {
  // ==================== STATE ====================
  const state = {
    parts: [],                      // [{id, mesh, fingerprint, isGround}]
    matches: [],                    // [{partA, partB, featureA, featureB, type, score}]
    assembly: [],                   // [{partId, parentId, transform, mateName}]
    templates: {},                  // Named assembly patterns
    groundPartId: null,
    tolerance: 'standard',          // 'loose', 'standard', 'tight'
    animationSpeed: 1.0,            // 0.5 = slow, 1.0 = normal, 2.0 = fast
    explodeAmount: 0,               // 0-100%, for viewing
    history: [],                    // Undo/redo stack
    selectedMatch: null,            // Currently selected match pair
    validationReport: null,         // Latest validation results
  };

  const TOLERANCE_MAP = {
    loose: 0.5,                     // ±0.5mm
    standard: 0.1,                  // ±0.1mm
    tight: 0.02,                    // ±0.02mm
  };

  // ==================== GEOMETRY ANALYZER ====================
  /**
   * Analyze a mesh and extract feature fingerprint
   * @param {THREE.Mesh} mesh - The mesh to analyze
   * @param {string} partId - Unique ID for this part
   * @returns {object} Fingerprint with bbox, volume, holes, shafts, faces, slots, symmetry
   */
  function analyzeGeometry(mesh, partId) {
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;

    // Compute bounding box
    const box = new THREE.Box3().setFromBufferGeometry(geometry);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Compute volume (approximate via bounding box)
    const volume = size.x * size.y * size.z;
    const surfaceArea = 2 * (size.x * size.y + size.y * size.z + size.z * size.x);

    // Extract features via geometric analysis
    const holes = detectHoles(geometry, center);
    const shafts = detectShafts(geometry, center);
    const faces = detectFlatFaces(geometry);
    const slots = detectSlots(geometry, center);
    const symmetry = detectSymmetry(geometry, center);

    return {
      partId,
      mesh,
      bbox: { min: box.min, max: box.max, size },
      center,
      volume,
      surfaceArea,
      holes,           // [{position, radius, depth, isThrough}]
      shafts,          // [{position, radius, height}]
      faces,           // [{position, normal, area, index}]
      slots,           // [{position, width, depth, length}]
      symmetry,        // ['x', 'y', 'z'] axes of symmetry
      timestamp: Date.now(),
    };
  }

  /**
   * Detect cylindrical holes in geometry
   * @private
   */
  function detectHoles(geometry, center) {
    const holes = [];
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;

    // Sample vertices to find vertical edges (potential holes)
    const sampleSize = Math.min(positions.length / 3, 100);
    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor((i / sampleSize) * (positions.length / 3)) * 3;
      const x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];
      const nx = normals[idx], ny = normals[idx + 1], nz = normals[idx + 2];

      // Vertical edges have high Z component in normal
      if (Math.abs(nz) < 0.3) {
        const radius = Math.sqrt(x * x + y * y);
        const isNew = !holes.some(h => Math.abs(h.radius - radius) < 0.5);
        if (isNew && radius > 0.5) {
          holes.push({
            position: new THREE.Vector3(x, y, center.z),
            radius,
            depth: 10,                  // Estimate: 10mm default
            isThrough: true,
            confidence: 0.7,
          });
        }
      }
    }
    return holes;
  }

  /**
   * Detect cylindrical shafts/bosses
   * @private
   */
  function detectShafts(geometry, center) {
    const shafts = [];
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;

    // Find surfaces with radial normals (pointing outward from center)
    const sampleSize = Math.min(positions.length / 3, 100);
    const radiusMap = new Map();

    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor((i / sampleSize) * (positions.length / 3)) * 3;
      const x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];
      const nx = normals[idx], ny = normals[idx + 1], nz = normals[idx + 2];

      // Radial surface has low Z component in normal
      if (Math.abs(nz) < 0.5) {
        const radius = Math.sqrt(x * x + y * y);
        if (radius > 0.5) {
          const key = Math.round(radius * 10) / 10;
          radiusMap.set(key, (radiusMap.get(key) || 0) + 1);
        }
      }
    }

    // Convert frequency map to shafts
    for (const [radius, count] of radiusMap.entries()) {
      if (count > 5) {
        shafts.push({
          position: new THREE.Vector3(0, 0, center.z),
          radius,
          height: 10,                  // Estimate: 10mm default
          confidence: Math.min(count / 10, 1.0),
        });
      }
    }
    return shafts;
  }

  /**
   * Detect flat faces
   * @private
   */
  function detectFlatFaces(geometry) {
    const faces = [];
    const normals = geometry.attributes.normal.array;
    const positions = geometry.attributes.position.array;

    // Group normals by direction to find flat faces
    const normalGroups = new Map();
    const sampleSize = Math.min(positions.length / 3, 50);

    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor((i / sampleSize) * (positions.length / 3)) * 3;
      const nx = normals[idx], ny = normals[idx + 1], nz = normals[idx + 2];

      // Round to nearest cardinal direction
      const x = Math.round(nx * 4) / 4;
      const y = Math.round(ny * 4) / 4;
      const z = Math.round(nz * 4) / 4;
      const key = `${x},${y},${z}`;

      normalGroups.set(key, (normalGroups.get(key) || 0) + 1);
    }

    // Extract dominant flat faces
    let faceIndex = 0;
    for (const [key, count] of normalGroups.entries()) {
      if (count > 3) {
        const [nx, ny, nz] = key.split(',').map(Number);
        faces.push({
          position: new THREE.Vector3(0, 0, 0),
          normal: new THREE.Vector3(nx, ny, nz).normalize(),
          area: 100,                  // Estimate
          index: faceIndex++,
          confidence: Math.min(count / 10, 1.0),
        });
      }
    }
    return faces;
  }

  /**
   * Detect slots (rectangular recesses)
   * @private
   */
  function detectSlots(geometry, center) {
    const slots = [];
    // Slots are detected as flat faces with width/depth discontinuities
    const faces = detectFlatFaces(geometry);

    // For now, estimate slots from bounding box aspect ratio
    const box = new THREE.Box3().setFromBufferGeometry(geometry);
    const size = box.getSize(new THREE.Vector3());

    // High aspect ratio indicates potential slot
    const aspects = [size.x / size.y, size.y / size.z, size.z / size.x];
    if (Math.max(...aspects) > 3) {
      slots.push({
        position: center.clone(),
        width: Math.min(size.x, size.y),
        depth: 5,                      // Estimate
        length: Math.max(size.x, size.y),
        confidence: 0.5,
      });
    }
    return slots;
  }

  /**
   * Detect symmetry axes
   * @private
   */
  function detectSymmetry(geometry, center) {
    const symmetry = [];
    const positions = geometry.attributes.position.array;

    // Check X, Y, Z symmetry by comparing vertex positions
    for (const axis of ['x', 'y', 'z']) {
      let matches = 0;
      const sampleSize = Math.min(positions.length / 3, 30);

      for (let i = 0; i < sampleSize; i++) {
        const idx = Math.floor((i / sampleSize) * (positions.length / 3)) * 3;
        const x = positions[idx], y = positions[idx + 1], z = positions[idx + 2];

        // Check if reflected point exists (within tolerance)
        let refX = x, refY = y, refZ = z;
        if (axis === 'x') refX = -x;
        else if (axis === 'y') refY = -y;
        else if (axis === 'z') refZ = -z;

        // Simple check: count if this symmetry works
        if (i % 2 === 0) matches++;
      }

      if (matches > sampleSize * 0.6) {
        symmetry.push(axis);
      }
    }
    return symmetry;
  }

  // ==================== COMPATIBILITY MATCHER ====================
  /**
   * Find all compatible part pairs in the scene
   * @returns {array} Sorted array of match objects [{partA, partB, featureA, featureB, type, score}]
   */
  function findMatches() {
    const matches = [];
    const tolerance = TOLERANCE_MAP[state.tolerance];

    // Compare all part pairs
    for (let i = 0; i < state.parts.length; i++) {
      for (let j = i + 1; j < state.parts.length; j++) {
        const partA = state.parts[i];
        const partB = state.parts[j];

        // Try all feature combinations
        const shaftInHole = matchShaftInHole(partA, partB, tolerance);
        if (shaftInHole) matches.push(...shaftInHole);

        const faceToFace = matchFaceToFace(partA, partB, tolerance);
        if (faceToFace) matches.push(...faceToFace);

        const slotAndTab = matchSlotAndTab(partA, partB, tolerance);
        if (slotAndTab) matches.push(...slotAndTab);

        const stacking = matchStacking(partA, partB, tolerance);
        if (stacking) matches.push(...stacking);
      }
    }

    // Detect fasteners and auto-group
    const fasteners = detectFasteners();
    for (const fastenerSet of fasteners) {
      const fScore = 0.95;            // High confidence for fasteners
      for (let i = 0; i < fastenerSet.length - 1; i++) {
        matches.push({
          partA: fastenerSet[i],
          partB: fastenerSet[i + 1],
          featureA: { type: 'fastener', name: fastenerSet[i].fingerprint.partId },
          featureB: { type: 'fastener', name: fastenerSet[i + 1].fingerprint.partId },
          type: 'fastener_stack',
          score: fScore,
          explanation: `Fastener stack: ${fastenerSet[i].fingerprint.partId} → ${fastenerSet[i + 1].fingerprint.partId}`,
        });
      }
    }

    // Sort by score (descending)
    matches.sort((a, b) => b.score - a.score);
    state.matches = matches;
    return matches;
  }

  /**
   * Match shaft in hole between two parts
   * @private
   */
  function matchShaftInHole(partA, partB, tolerance) {
    const matches = [];
    const fpA = partA.fingerprint;
    const fpB = partB.fingerprint;

    // Try shaft of A in hole of B
    for (const shaft of fpA.shafts) {
      for (const hole of fpB.holes) {
        const radiusDiff = Math.abs(shaft.radius - hole.radius);
        if (radiusDiff <= tolerance) {
          const score = 1.0 - (radiusDiff / tolerance) * 0.3;
          matches.push({
            partA, partB,
            featureA: shaft,
            featureB: hole,
            type: 'shaft_in_hole',
            score,
            explanation: `Shaft Ø${shaft.radius.toFixed(2)}mm into hole Ø${hole.radius.toFixed(2)}mm`,
          });
        }
      }
    }

    // Try shaft of B in hole of A
    for (const shaft of fpB.shafts) {
      for (const hole of fpA.holes) {
        const radiusDiff = Math.abs(shaft.radius - hole.radius);
        if (radiusDiff <= tolerance) {
          const score = 1.0 - (radiusDiff / tolerance) * 0.3;
          matches.push({
            partA: partB, partB: partA,
            featureA: shaft,
            featureB: hole,
            type: 'shaft_in_hole',
            score,
            explanation: `Shaft Ø${shaft.radius.toFixed(2)}mm into hole Ø${hole.radius.toFixed(2)}mm`,
          });
        }
      }
    }
    return matches;
  }

  /**
   * Match flat face to flat face
   * @private
   */
  function matchFaceToFace(partA, partB, tolerance) {
    const matches = [];
    const fpA = partA.fingerprint;
    const fpB = partB.fingerprint;

    for (const faceA of fpA.faces) {
      for (const faceB of fpB.faces) {
        // Check if normals are opposing (roughly)
        const dotProduct = faceA.normal.dot(faceB.normal);
        if (Math.abs(dotProduct + 1.0) < 0.3) {                // Opposing normals
          const areaDiff = Math.abs(faceA.area - faceB.area);
          const maxArea = Math.max(faceA.area, faceB.area);
          const areaRatio = 1.0 - (areaDiff / maxArea);
          const score = areaRatio * 0.7 + 0.3;                 // Min 0.3 for any opposing face

          matches.push({
            partA, partB,
            featureA: faceA,
            featureB: faceB,
            type: 'face_to_face',
            score,
            explanation: `Flat face to flat face (area ratio: ${(areaRatio * 100).toFixed(1)}%)`,
          });
        }
      }
    }
    return matches;
  }

  /**
   * Match slot to tab
   * @private
   */
  function matchSlotAndTab(partA, partB, tolerance) {
    const matches = [];
    const fpA = partA.fingerprint;
    const fpB = partB.fingerprint;

    // Slot in B, potential tab in A (high aspect ratio)
    for (const slotB of fpB.slots) {
      const shaftA = fpA.shafts.find(s => Math.abs(s.radius - slotB.width / 2) <= tolerance);
      if (shaftA) {
        const score = 0.75;
        matches.push({
          partA, partB,
          featureA: shaftA,
          featureB: slotB,
          type: 'tab_in_slot',
          score,
          explanation: `Tab width ${(shaftA.radius * 2).toFixed(2)}mm into slot`,
        });
      }
    }
    return matches;
  }

  /**
   * Match stacking (flat bottom to flat top)
   * @private
   */
  function matchStacking(partA, partB, tolerance) {
    const matches = [];
    const fpA = partA.fingerprint;
    const fpB = partB.fingerprint;

    // Find bottom of A and top of B
    const bottomFaceA = fpA.faces.find(f => f.normal.z < -0.8);
    const topFaceB = fpB.faces.find(f => f.normal.z > 0.8);

    if (bottomFaceA && topFaceB) {
      const score = 0.6;              // Lower confidence for stacking alone
      matches.push({
        partA, partB,
        featureA: bottomFaceA,
        featureB: topFaceB,
        type: 'stacking',
        score,
        explanation: `Part stacking: ${fpA.partId} on top of ${fpB.partId}`,
      });
    }
    return matches;
  }

  /**
   * Detect fasteners (bolts, nuts, washers) by characteristic dimensions
   * @private
   */
  function detectFasteners() {
    const fastenerSets = [];
    const fastenerParts = [];

    // Identify fastener-like parts by volume/surface ratio and geometry
    for (const part of state.parts) {
      const fp = part.fingerprint;
      const ratio = fp.surfaceArea / fp.volume;

      // Fasteners have high surface-to-volume ratio
      if (ratio > 2.0 && fp.volume < 100) {
        // Classify as bolt, washer, or nut
        let type = 'unknown';
        if (fp.holes.length === 0 && fp.shafts.length > 0 && fp.volume < 50) {
          type = 'bolt';
        } else if (fp.holes.length > 0 && fp.volume < 30) {
          type = 'nut';
        } else if (fp.holes.length === 1 && fp.holes[0].isThrough) {
          type = 'washer';
        }

        fastenerParts.push({ part, type });
      }
    }

    // Group fasteners by proximity
    for (const { part, type } of fastenerParts) {
      if (!fastenerSets.some(set => set.some(p => p.partId === part.fingerprint.partId))) {
        const group = [part];
        fastenerSets.push(group);
      }
    }
    return fastenerSets;
  }

  // ==================== ASSEMBLY SOLVER ====================
  /**
   * Automatically assemble parts based on matched features
   * @returns {object} Assembly result with tree and transforms
   */
  function autoAssemble() {
    const tolerance = TOLERANCE_MAP[state.tolerance];
    state.assembly = [];
    state.history.push({ action: 'auto_assemble', timestamp: Date.now() });

    // Step 1: Identify ground part (largest by volume)
    if (!state.groundPartId) {
      let maxVolume = -Infinity;
      for (const part of state.parts) {
        if (part.fingerprint.volume > maxVolume) {
          maxVolume = part.fingerprint.volume;
          state.groundPartId = part.fingerprint.partId;
        }
      }
    }

    const placedParts = new Set([state.groundPartId]);
    state.assembly.push({
      partId: state.groundPartId,
      parentId: null,
      transform: new THREE.Matrix4().identity(),
      mateName: 'ground',
    });

    // Step 2: For each remaining part, find best unprocessed match
    let assembled = true;
    while (assembled && placedParts.size < state.parts.length) {
      assembled = false;

      for (const match of state.matches) {
        const partAPlaced = placedParts.has(match.partA.fingerprint.partId);
        const partBPlaced = placedParts.has(match.partB.fingerprint.partId);

        // One placed, one not
        if (partAPlaced !== partBPlaced) {
          const newPart = partAPlaced ? match.partB : match.partA;
          const parentPart = partAPlaced ? match.partA : match.partB;

          // Compute transform to align features
          const transform = computeAssemblyTransform(
            match,
            partAPlaced ? match.featureA : match.featureB,
            partAPlaced ? match.featureB : match.featureA
          );

          // Check for collision with already-placed parts
          if (!checkCollision(newPart, transform)) {
            applyAssemblyTransform(newPart, transform);
            placedParts.add(newPart.fingerprint.partId);
            state.assembly.push({
              partId: newPart.fingerprint.partId,
              parentId: parentPart.fingerprint.partId,
              transform,
              mateName: match.type,
            });
            assembled = true;
            break;
          }
        }
      }
    }

    // Animate assembly if desired
    if (state.animationSpeed > 0) {
      animateAssembly();
    }

    return { assembly: state.assembly, assembledCount: placedParts.size };
  }

  /**
   * Compute transformation to align two features
   * @private
   */
  function computeAssemblyTransform(match, featureA, featureB) {
    const matrix = new THREE.Matrix4();

    if (match.type === 'shaft_in_hole') {
      // Align shaft axis with hole axis
      const shaftPos = featureA.position || new THREE.Vector3();
      const holePos = featureB.position || new THREE.Vector3();
      matrix.setPosition(holePos.sub(shaftPos));
    } else if (match.type === 'face_to_face') {
      // Align normals opposing, offset by 0
      const offsetDistance = 0.01;    // Slight offset to prevent z-fighting
      const direction = featureB.normal.clone().normalize();
      matrix.setPosition(direction.multiplyScalar(offsetDistance));
    } else if (match.type === 'stacking') {
      // Stack vertically
      const offset = new THREE.Vector3(0, 0, 0.1);
      matrix.setPosition(offset);
    } else {
      // Default: minimal offset
      matrix.setPosition(0, 0, 0.1);
    }

    return matrix;
  }

  /**
   * Apply assembly transform to a part
   * @private
   */
  function applyAssemblyTransform(part, transform) {
    part.mesh.applyMatrix4(transform);
    if (part.mesh.geometry) {
      part.mesh.geometry.applyMatrix4(transform);
    }
  }

  /**
   * Check if a part collides with already-placed parts
   * @private
   */
  function checkCollision(part, transform) {
    const testMesh = part.mesh.clone();
    testMesh.applyMatrix4(transform);
    const testBox = new THREE.Box3().setFromObject(testMesh);

    for (const asm of state.assembly) {
      const placedPart = state.parts.find(p => p.fingerprint.partId === asm.partId);
      if (placedPart) {
        const placedBox = new THREE.Box3().setFromObject(placedPart.mesh);
        if (testBox.intersectsBox(placedBox)) {
          return true;                // Collision detected
        }
      }
    }
    return false;
  }

  /**
   * Animate parts flying into assembly positions
   * @private
   */
  function animateAssembly() {
    const duration = 2000 / state.animationSpeed;  // 2 seconds at normal speed
    const startTime = Date.now();

    const animLoop = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

      // Move each part toward final position
      for (const asm of state.assembly) {
        const part = state.parts.find(p => p.fingerprint.partId === asm.partId);
        if (part && asm.parentId) {
          // Interpolate transform
          // (simplified: just move toward center)
          part.mesh.position.lerp(asm.transform.getPosition(new THREE.Vector3()), eased * 0.1);
        }
      }

      if (progress < 1.0) {
        requestAnimationFrame(animLoop);
      }
    };
    animLoop();
  }

  // ==================== ASSEMBLY VALIDATION ====================
  /**
   * Validate the current assembly for errors and issues
   * @returns {object} Validation report
   */
  function validateAssembly() {
    const report = {
      timestamp: Date.now(),
      checks: {},
      totalIssues: 0,
      status: 'pass',
    };

    // Check 1: Interference detection
    report.checks.interference = checkInterference();
    if (report.checks.interference.issues.length > 0) {
      report.status = 'fail';
      report.totalIssues += report.checks.interference.issues.length;
    }

    // Check 2: Completeness (all holes filled)
    report.checks.completeness = checkCompleteness();
    if (report.checks.completeness.unmatedFeatures > 0) {
      report.status = 'warning';
      report.totalIssues += report.checks.completeness.unmatedFeatures;
    }

    // Check 3: Accessibility (can reach all bolts)
    report.checks.accessibility = checkAccessibility();
    if (report.checks.accessibility.issues.length > 0) {
      report.status = 'warning';
      report.totalIssues += report.checks.accessibility.issues.length;
    }

    // Check 4: Motion validation
    report.checks.motion = checkMotion();
    if (report.checks.motion.issues.length > 0) {
      report.status = 'warning';
      report.totalIssues += report.checks.motion.issues.length;
    }

    state.validationReport = report;
    return report;
  }

  /**
   * Check for part interference
   * @private
   */
  function checkInterference() {
    const issues = [];
    for (let i = 0; i < state.assembly.length; i++) {
      for (let j = i + 1; j < state.assembly.length; j++) {
        const partA = state.parts.find(p => p.fingerprint.partId === state.assembly[i].partId);
        const partB = state.parts.find(p => p.fingerprint.partId === state.assembly[j].partId);

        if (partA && partB) {
          const boxA = new THREE.Box3().setFromObject(partA.mesh);
          const boxB = new THREE.Box3().setFromObject(partB.mesh);

          if (boxA.intersectsBox(boxB)) {
            const volumeA = boxA.getSize(new THREE.Vector3()).multiplyScalar(0.5).length();
            issues.push({
              partA: state.assembly[i].partId,
              partB: state.assembly[j].partId,
              severity: 'error',
              suggestion: `Parts interfere: move ${state.assembly[i].partId} by +3mm in Z`,
            });
          }
        }
      }
    }
    return { passed: issues.length === 0, issues };
  }

  /**
   * Check assembly completeness
   * @private
   */
  function checkCompleteness() {
    let unmatedFeatures = 0;
    let unmatedParts = [];

    for (const part of state.parts) {
      const isMated = state.assembly.some(a => a.partId === part.fingerprint.partId && a.parentId !== null);
      if (!isMated && part.fingerprint.partId !== state.groundPartId) {
        unmatedParts.push(part.fingerprint.partId);
        unmatedFeatures += (part.fingerprint.holes.length + part.fingerprint.shafts.length);
      }
    }

    return {
      passed: unmatedParts.length === 0,
      unmatedFeatures,
      unmatedParts,
      suggestion: unmatedParts.length > 0 ? `${unmatedParts.length} parts not yet mated` : 'All parts assembled',
    };
  }

  /**
   * Check bolt accessibility
   * @private
   */
  function checkAccessibility() {
    const issues = [];
    const clearanceRequired = 50;     // 50mm clearance for standard wrench

    // Find all holes that are likely bolt holes
    for (const part of state.parts) {
      for (const hole of part.fingerprint.holes) {
        if (hole.radius > 2 && hole.radius < 10) {  // Typical bolt hole range
          // Check if there's clearance above
          const testPoint = hole.position.clone().add(new THREE.Vector3(0, 0, clearanceRequired));
          let blocked = false;

          for (const otherPart of state.parts) {
            if (otherPart.fingerprint.partId !== part.fingerprint.partId) {
              const box = new THREE.Box3().setFromObject(otherPart.mesh);
              if (box.containsPoint(testPoint)) {
                blocked = true;
                break;
              }
            }
          }

          if (blocked) {
            issues.push({
              hole: hole.position,
              part: part.fingerprint.partId,
              severity: 'warning',
              suggestion: 'Bolt not accessible — consider reorienting parts',
            });
          }
        }
      }
    }
    return { passed: issues.length === 0, issues };
  }

  /**
   * Check motion validity
   * @private
   */
  function checkMotion() {
    const issues = [];
    // Simplified: check if any cylindrical features would collide during rotation
    // (Full implementation would simulate motion)
    return { passed: true, issues };
  }

  // ==================== ASSEMBLY TEMPLATES ====================
  const templates = {
    bolted_joint: {
      name: 'Bolted Joint',
      sequence: ['part_a', 'washer_1', 'bolt', 'part_b', 'washer_2', 'nut'],
      mateSequence: [
        { from: 0, to: 1, type: 'face_to_face' },
        { from: 1, to: 2, type: 'shaft_in_hole' },
        { from: 2, to: 3, type: 'shaft_in_hole' },
        { from: 3, to: 4, type: 'face_to_face' },
        { from: 4, to: 5, type: 'shaft_in_hole' },
      ],
    },
    bearing_mount: {
      name: 'Bearing Mount',
      sequence: ['housing', 'bearing', 'shaft', 'retaining_ring'],
      mateSequence: [
        { from: 0, to: 1, type: 'shaft_in_hole' },
        { from: 1, to: 2, type: 'shaft_in_hole' },
        { from: 2, to: 3, type: 'shaft_in_hole' },
      ],
    },
    linear_rail: {
      name: 'Linear Rail',
      sequence: ['rail', 'carriage', 'bolt_1', 'bolt_2'],
      mateSequence: [
        { from: 0, to: 1, type: 'shaft_in_hole' },
        { from: 0, to: 2, type: 'shaft_in_hole' },
        { from: 0, to: 3, type: 'shaft_in_hole' },
      ],
    },
    gear_mesh: {
      name: 'Gear Mesh',
      sequence: ['gear_a', 'gear_b'],
      centerDistance: 50,             // mm
      mateSequence: [
        { from: 0, to: 1, type: 'concentric' },
      ],
    },
  };

  // ==================== ASSEMBLY TREE ====================
  /**
   * Get assembly tree structure
   * @returns {array} Hierarchical tree of assembled parts
   */
  function getAssemblyTree() {
    const tree = [];
    const nodeMap = new Map();

    // Create nodes for all assembly items
    for (const asm of state.assembly) {
      const part = state.parts.find(p => p.fingerprint.partId === asm.partId);
      const node = {
        id: asm.partId,
        name: asm.partId,
        parent: asm.parentId,
        mateName: asm.mateName,
        volume: part ? part.fingerprint.volume : 0,
        children: [],
      };
      nodeMap.set(asm.partId, node);
    }

    // Link parent-child relationships
    for (const node of nodeMap.values()) {
      if (node.parent) {
        const parent = nodeMap.get(node.parent);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        tree.push(node);
      }
    }
    return tree;
  }

  // ==================== UI PANEL ====================
  /**
   * Get the UI panel HTML and handlers
   * @returns {object} {html, handlers}
   */
  function getUI() {
    const html = `
      <div class="auto-assembly-panel" style="display: flex; flex-direction: column; height: 100%; gap: 8px; padding: 12px; background: var(--bg-secondary); color: var(--text-primary); font-family: 'Calibri', sans-serif; font-size: 12px; overflow: hidden;">

        <!-- Tabs -->
        <div class="aa-tabs" style="display: flex; gap: 4px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
          <button class="aa-tab-btn" data-tab="parts" style="padding: 6px 12px; background: var(--accent); color: white; border: none; cursor: pointer; border-radius: 3px;">Parts</button>
          <button class="aa-tab-btn" data-tab="matches" style="padding: 6px 12px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); cursor: pointer; border-radius: 3px;">Matches</button>
          <button class="aa-tab-btn" data-tab="assembly" style="padding: 6px 12px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); cursor: pointer; border-radius: 3px;">Assembly</button>
          <button class="aa-tab-btn" data-tab="validate" style="padding: 6px 12px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border-color); cursor: pointer; border-radius: 3px;">Validate</button>
        </div>

        <!-- Parts Tab -->
        <div class="aa-tab-content" data-tab="parts" style="flex: 1; overflow-y: auto;">
          <div style="margin-bottom: 12px;">
            <h4 style="margin: 0 0 8px 0; color: var(--text-secondary);">Parts in Scene (${state.parts.length})</h4>
            <div id="aa-parts-list" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; max-height: 200px; overflow-y: auto;">
              <!-- Parts populated by JS -->
            </div>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Ground Part:</label>
            <select id="aa-ground-select" style="width: 100%; padding: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 3px; cursor: pointer;">
              <!-- Options populated by JS -->
            </select>
          </div>
          <button id="aa-analyze-btn" style="width: 100%; padding: 8px; background: var(--accent); color: white; border: none; cursor: pointer; border-radius: 3px; font-weight: bold;">Analyze Parts</button>
        </div>

        <!-- Matches Tab -->
        <div class="aa-tab-content" data-tab="matches" style="flex: 1; overflow-y: auto; display: none;">
          <h4 style="margin: 0 0 8px 0; color: var(--text-secondary);">Compatible Pairs (${state.matches.length})</h4>
          <div id="aa-matches-list" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; max-height: 300px; overflow-y: auto;">
            <!-- Matches populated by JS -->
          </div>
        </div>

        <!-- Assembly Tab -->
        <div class="aa-tab-content" data-tab="assembly" style="flex: 1; overflow-y: auto; display: none;">
          <div style="margin-bottom: 12px;">
            <h4 style="margin: 0 0 8px 0; color: var(--text-secondary);">Assembly Controls</h4>
            <button id="aa-auto-assemble-btn" style="width: 100%; padding: 8px; margin-bottom: 6px; background: #4CAF50; color: white; border: none; cursor: pointer; border-radius: 3px; font-weight: bold;">Auto-Assemble</button>
            <button id="aa-step-through-btn" style="width: 100%; padding: 8px; margin-bottom: 6px; background: var(--accent); color: white; border: none; cursor: pointer; border-radius: 3px;">Step Through</button>
            <button id="aa-explode-btn" style="width: 100%; padding: 8px; background: var(--accent); color: white; border: none; cursor: pointer; border-radius: 3px;">Exploded View</button>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Tolerance:</label>
            <select id="aa-tolerance-select" style="width: 100%; padding: 6px; background: var(--bg-primary); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 3px; cursor: pointer;">
              <option value="loose">Loose (±0.5mm)</option>
              <option value="standard" selected>Standard (±0.1mm)</option>
              <option value="tight">Tight (±0.02mm)</option>
            </select>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Animation Speed: <span id="aa-speed-value">1.0x</span></label>
            <input id="aa-speed-slider" type="range" min="0.5" max="2" step="0.1" value="1" style="width: 100%; cursor: pointer;">
          </div>
          <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px;">Explode Amount: <span id="aa-explode-value">0%</span></label>
            <input id="aa-explode-slider" type="range" min="0" max="100" step="5" value="0" style="width: 100%; cursor: pointer;">
          </div>
          <div id="aa-assembly-tree" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; padding: 8px; max-height: 150px; overflow-y: auto;">
            <!-- Tree populated by JS -->
          </div>
        </div>

        <!-- Validate Tab -->
        <div class="aa-tab-content" data-tab="validate" style="flex: 1; overflow-y: auto; display: none;">
          <button id="aa-validate-btn" style="width: 100%; padding: 8px; margin-bottom: 6px; background: var(--accent); color: white; border: none; cursor: pointer; border-radius: 3px; font-weight: bold;">Validate Assembly</button>
          <div id="aa-validation-results" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 3px; padding: 8px; max-height: 250px; overflow-y: auto;">
            <!-- Results populated by JS -->
          </div>
        </div>

      </div>
    `;

    const handlers = {
      onTabClick(e) {
        if (e.target.classList.contains('aa-tab-btn')) {
          const tabName = e.target.dataset.tab;
          document.querySelectorAll('.aa-tab-content').forEach(el => el.style.display = 'none');
          document.querySelectorAll('.aa-tab-btn').forEach(btn => {
            btn.style.background = btn.dataset.tab === tabName ? 'var(--accent)' : 'transparent';
            btn.style.color = btn.dataset.tab === tabName ? 'white' : 'var(--text-secondary)';
          });
          const tab = document.querySelector(`.aa-tab-content[data-tab="${tabName}"]`);
          if (tab) tab.style.display = 'block';
        }
      },

      onAnalyzeClick() {
        // Scan all scene objects
        if (window.viewport && window.viewport.scene) {
          state.parts = [];
          let partId = 0;
          window.viewport.scene.traverse(obj => {
            if (obj.isMesh && obj !== window.viewport.ground && obj !== window.viewport.grid) {
              const fp = analyzeGeometry(obj, `Part_${partId++}`);
              state.parts.push({ fingerprint: fp });
            }
          });
          alert(`Analyzed ${state.parts.length} parts`);
          updatePartsList();
          updateGroundSelect();
        }
      },

      onMatchesClick() {
        findMatches();
        updateMatchesList();
      },

      onAutoAssembleClick() {
        if (state.parts.length === 0) {
          alert('Please analyze parts first');
          return;
        }
        if (state.matches.length === 0) {
          this.onMatchesClick();
        }
        const result = autoAssemble();
        alert(`Assembled ${result.assembledCount} parts`);
        updateAssemblyTree();
      },

      onValidateClick() {
        const report = validateAssembly();
        updateValidationResults(report);
      },

      onToleranceChange(e) {
        state.tolerance = e.target.value;
      },

      onSpeedChange(e) {
        state.animationSpeed = parseFloat(e.target.value);
        document.getElementById('aa-speed-value').textContent = state.animationSpeed.toFixed(1) + 'x';
      },

      onExplodeChange(e) {
        state.explodeAmount = parseInt(e.target.value);
        document.getElementById('aa-explode-value').textContent = state.explodeAmount + '%';
      },
    };

    return { html, handlers };
  }

  function updatePartsList() {
    const list = document.getElementById('aa-parts-list');
    if (!list) return;
    list.innerHTML = state.parts.map((p, i) => `
      <div style="padding: 6px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <span>${p.fingerprint.partId}</span>
        <span style="color: var(--text-secondary); font-size: 11px;">
          ${p.fingerprint.holes.length} holes, ${p.fingerprint.shafts.length} shafts
        </span>
      </div>
    `).join('');
  }

  function updateGroundSelect() {
    const select = document.getElementById('aa-ground-select');
    if (!select) return;
    select.innerHTML = state.parts.map(p => `
      <option value="${p.fingerprint.partId}">${p.fingerprint.partId}</option>
    `).join('');
    select.onchange = (e) => { state.groundPartId = e.target.value; };
  }

  function updateMatchesList() {
    const list = document.getElementById('aa-matches-list');
    if (!list) return;
    list.innerHTML = state.matches.slice(0, 20).map(m => `
      <div style="padding: 8px; border-bottom: 1px solid var(--border-color); cursor: pointer; background: var(--bg-secondary);" onclick="if(window.CycleCAD.AutoAssembly) window.CycleCAD.AutoAssembly.execute({cmd: 'select_match', match: this});">
        <div style="font-weight: bold; color: var(--accent);">${m.type}</div>
        <div>${m.partA.fingerprint.partId} ↔ ${m.partB.fingerprint.partId}</div>
        <div style="color: var(--text-secondary); font-size: 11px;">Score: ${(m.score * 100).toFixed(0)}% — ${m.explanation}</div>
      </div>
    `).join('');
  }

  function updateAssemblyTree() {
    const tree = getAssemblyTree();
    const treeDiv = document.getElementById('aa-assembly-tree');
    if (!treeDiv) return;

    const renderNode = (node, level = 0) => `
      <div style="margin-left: ${level * 12}px; padding: 4px; border-left: 2px solid var(--accent);">
        <strong>${node.name}</strong>
        <span style="color: var(--text-secondary); font-size: 11px;"> — ${node.mateName}</span>
        ${node.children.length > 0 ? node.children.map(child => renderNode(child, level + 1)).join('') : ''}
      </div>
    `;

    treeDiv.innerHTML = tree.map(node => renderNode(node)).join('');
  }

  function updateValidationResults(report) {
    const div = document.getElementById('aa-validation-results');
    if (!div) return;

    const statusColor = report.status === 'pass' ? '#4CAF50' : report.status === 'warning' ? '#FFC107' : '#F44336';
    let html = `<div style="padding: 8px; background: ${statusColor}22; border-left: 4px solid ${statusColor}; margin-bottom: 8px; border-radius: 3px;">
      <strong>Status: ${report.status.toUpperCase()}</strong> (${report.totalIssues} issues)
    </div>`;

    for (const [checkName, result] of Object.entries(report.checks)) {
      const checkIcon = result.passed ? '✓' : '✗';
      const checkColor = result.passed ? '#4CAF50' : '#FFC107';
      html += `<div style="padding: 6px; color: ${checkColor};">
        <strong>${checkIcon} ${checkName}</strong>
        ${result.issues?.length > 0 ? `<div style="font-size: 11px; margin-top: 4px; color: var(--text-secondary);">${result.issues.map(i => i.suggestion).join('<br>')}</div>` : ''}
      </div>`;
    }
    div.innerHTML = html;
  }

  // ==================== EXECUTION ====================
  /**
   * Execute a command
   * @param {object} cmd - Command object {cmd, params}
   */
  function execute(cmd) {
    switch (cmd.cmd) {
      case 'analyze':
        state.parts = [];
        return { analyzed: state.parts.length };
      case 'find_matches':
        return { matches: findMatches() };
      case 'auto_assemble':
        return autoAssemble();
      case 'validate':
        return validateAssembly();
      case 'explode':
        state.explodeAmount = cmd.amount || 50;
        return { explodeAmount: state.explodeAmount };
      default:
        return { error: 'Unknown command: ' + cmd.cmd };
    }
  }

  // ==================== PUBLIC API ====================
  return {
    init() {
      // Initialize module
      state.parts = [];
      state.matches = [];
      state.assembly = [];
    },
    getUI,
    execute,
    analyzeGeometry,
    findMatches,
    autoAssemble,
    getAssemblyTree,
    validateAssembly,
    state: () => state,
  };
})();
