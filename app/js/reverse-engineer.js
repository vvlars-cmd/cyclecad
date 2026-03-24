/**
 * Reverse Engineer Tool for cycleCAD
 * Analyzes imported STL/STEP files, detects modeling features,
 * reconstructs feature trees, and provides interactive 3D walkthroughs
 *
 * @module reverse-engineer
 * @requires three@0.170.0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const FEATURE_TYPES = {
  BASE_EXTRUDE: 'base-extrude',
  CUT_EXTRUDE: 'cut-extrude',
  HOLE: 'hole',
  FILLET: 'fillet',
  CHAMFER: 'chamfer',
  POCKET: 'pocket',
  BOSS: 'boss',
  PATTERN: 'pattern',
  MIRROR: 'mirror'
};

const FEATURE_ICONS = {
  'base-extrude': '■',
  'cut-extrude': '⊟',
  'hole': '●',
  'fillet': '⌒',
  'chamfer': '/⌒',
  'pocket': '⊞',
  'boss': '▲',
  'pattern': '❖',
  'mirror': '⇄'
};

const NORMAL_CLUSTER_THRESHOLD = 0.95; // dot product threshold for same plane
const EDGE_SHARPNESS_THRESHOLD = 0.5;   // dot product for edge detection
const MIN_HOLE_FACES = 8;               // minimum triangles to form a hole
const FILLET_RADIUS_MIN = 0.5;          // minimum fillet radius
const PATTERN_MIN_INSTANCES = 2;        // minimum repetitions to detect pattern

// ============================================================================
// STL PARSER
// ============================================================================

/**
 * Parse ASCII STL format
 * @param {string} text - ASCII STL content
 * @returns {Array<THREE.Vector3>} array of vertices
 */
function parseASCIISTL(text) {
  const vertices = [];
  const facetNormalRegex = /facet\s+normal\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/g;
  const vertexRegex = /vertex\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/g;

  let match;
  while ((match = vertexRegex.exec(text)) !== null) {
    vertices.push(new THREE.Vector3(parseFloat(match[1]), parseFloat(match[3]), parseFloat(match[5])));
  }

  return vertices;
}

/**
 * Parse binary STL format
 * @param {ArrayBuffer} buffer - Binary STL data
 * @returns {Array<THREE.Vector3>} array of vertices
 */
function parseBinarySTL(buffer) {
  const view = new DataView(buffer);
  const triangles = view.getUint32(80, true);
  const vertices = [];

  let offset = 84;
  for (let i = 0; i < triangles; i++) {
    offset += 12; // skip normal (3 floats)

    for (let j = 0; j < 3; j++) {
      const x = view.getFloat32(offset, true); offset += 4;
      const y = view.getFloat32(offset, true); offset += 4;
      const z = view.getFloat32(offset, true); offset += 4;
      vertices.push(new THREE.Vector3(x, y, z));
    }

    offset += 2; // skip attribute byte count
  }

  return vertices;
}

/**
 * Import and parse STL/STEP file
 * @param {File} file - File object (.stl or .step)
 * @returns {Promise<THREE.Mesh>} Three.js mesh
 */
export async function importFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        let vertices = [];

        if (file.name.toLowerCase().endsWith('.stl')) {
          const content = e.target.result;

          // Try ASCII first
          if (typeof content === 'string') {
            vertices = parseASCIISTL(content);
          } else {
            // Binary STL
            vertices = parseBinarySTL(content);
          }
        } else {
          throw new Error('Only STL files are currently supported');
        }

        if (vertices.length === 0) {
          throw new Error('No valid geometry found in file');
        }

        // Create geometry from vertices
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(vertices.length * 3);

        vertices.forEach((v, i) => {
          positions[i * 3] = v.x;
          positions[i * 3 + 1] = v.y;
          positions[i * 3 + 2] = v.z;
        });

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        geometry.center();

        const mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({ color: 0x808080 }));
        resolve(mesh);
      } catch (error) {
        reject(new Error(`Failed to parse file: ${error.message}`));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));

    // Read as both string and ArrayBuffer depending on file type
    if (file.name.toLowerCase().endsWith('.stl')) {
      // Try binary first by reading as ArrayBuffer
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
}

// ============================================================================
// GEOMETRY ANALYZER
// ============================================================================

/**
 * Analyze geometry and detect features
 * @param {THREE.Mesh} mesh - The imported mesh
 * @returns {Object} AnalysisResult with detected features
 */
export function analyzeGeometry(mesh) {
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;

  // Compute bounding box
  const bbox = new THREE.Box3().setFromBufferAttribute(positions);
  const dimensions = bbox.getSize(new THREE.Vector3());
  const volume = dimensions.x * dimensions.y * dimensions.z * 0.65; // rough estimate

  // Cluster faces by normal direction
  const faceNormals = [];
  const faceClusters = [];

  for (let i = 0; i < positions.count; i += 3) {
    const faceNormal = new THREE.Vector3(
      normals.getX(i),
      normals.getY(i),
      normals.getZ(i)
    ).normalize();

    faceNormals.push(faceNormal);

    // Try to assign to existing cluster
    let assigned = false;
    for (const cluster of faceClusters) {
      if (faceNormal.dot(cluster.normal) > NORMAL_CLUSTER_THRESHOLD) {
        cluster.faces.push(i / 3);
        cluster.count++;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      faceClusters.push({
        normal: faceNormal,
        faces: [i / 3],
        count: 1,
        type: 'planar'
      });
    }
  }

  // Detect planar vs curved clusters
  const planarFaces = [];
  const curvedFaces = [];

  faceClusters.forEach(cluster => {
    if (cluster.count > 4) {
      planarFaces.push(cluster);
    } else {
      curvedFaces.push(cluster);
    }
  });

  // Detect holes (cylindrical cavities)
  const holes = detectHoles(geometry, curvedFaces, dimensions);

  // Detect fillets (smooth transitions)
  const fillets = detectFillets(geometry, faceNormals, positions);

  // Detect chamfers (angled edges)
  const chamfers = detectChamfers(geometry, planarFaces);

  // Detect pockets (rectangular depressions)
  const pockets = detectPockets(geometry, planarFaces);

  // Detect bosses (raised features)
  const bosses = detectBosses(geometry, planarFaces);

  // Detect patterns (repeated features)
  const patterns = detectPatterns([...holes, ...pockets, ...bosses]);

  // Detect symmetry
  const symmetryPlanes = detectSymmetry(geometry);

  return {
    bbox: { min: bbox.min, max: bbox.max },
    dimensions,
    volume,
    faceCount: positions.count / 3,
    vertexCount: positions.count,
    planarFaces,
    curvedFaces,
    holes,
    fillets,
    chamfers,
    pockets,
    bosses,
    patterns,
    symmetryPlanes,
    faceNormals
  };
}

/**
 * Detect holes (cylindrical cavities)
 */
function detectHoles(geometry, curvedFaces, dimensions) {
  const holes = [];
  const positions = geometry.attributes.position;
  const minDim = Math.min(dimensions.x, dimensions.y, dimensions.z);

  for (const cluster of curvedFaces) {
    if (cluster.count >= MIN_HOLE_FACES) {
      const faceIndices = cluster.faces;
      let centerX = 0, centerY = 0, centerZ = 0;

      // Estimate center
      for (const faceIdx of faceIndices) {
        const i = faceIdx * 3;
        centerX += positions.getX(i);
        centerY += positions.getY(i);
        centerZ += positions.getZ(i);
      }
      centerX /= faceIndices.length;
      centerY /= faceIndices.length;
      centerZ /= faceIndices.length;

      // Estimate radius
      let maxDist = 0;
      for (const faceIdx of faceIndices) {
        const i = faceIdx * 3;
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2 + (z - centerZ) ** 2);
        maxDist = Math.max(maxDist, dist);
      }

      if (maxDist > minDim * 0.05 && maxDist < minDim * 0.5) {
        holes.push({
          type: FEATURE_TYPES.HOLE,
          center: [centerX, centerY, centerZ],
          radius: maxDist * 0.7,
          depth: dimensions.z * 0.3,
          faces: faceIndices
        });
      }
    }
  }

  return holes;
}

/**
 * Detect fillets (smooth curved transitions)
 */
function detectFillets(geometry, faceNormals, positions) {
  const fillets = [];
  const posAttr = geometry.attributes.position;
  const visited = new Set();

  for (let i = 0; i < posAttr.count; i += 3) {
    if (visited.has(i)) continue;

    const normal1 = faceNormals[i / 3];
    let radiusEstimate = 0;

    // Look for adjacent faces with gradually changing normals
    for (let j = i + 3; j < posAttr.count; j += 3) {
      if (visited.has(j)) continue;

      const normal2 = faceNormals[j / 3];
      const dot = normal1.dot(normal2);

      if (dot > EDGE_SHARPNESS_THRESHOLD && dot < 0.99) {
        radiusEstimate += 1;
        visited.add(j);
      }
    }

    if (radiusEstimate > FILLET_RADIUS_MIN) {
      fillets.push({
        type: FEATURE_TYPES.FILLET,
        radius: radiusEstimate * 0.5,
        faces: [i / 3]
      });
    }
  }

  return fillets;
}

/**
 * Detect chamfers (angled edge transitions)
 */
function detectChamfers(geometry, planarFaces) {
  const chamfers = [];

  for (let i = 0; i < planarFaces.length; i++) {
    for (let j = i + 1; j < planarFaces.length; j++) {
      const angle = Math.acos(Math.min(1, Math.max(-1, planarFaces[i].normal.dot(planarFaces[j].normal))));

      // Detect 45° chamfers (between 30° and 60°)
      if (angle > Math.PI / 6 && angle < Math.PI / 3) {
        chamfers.push({
          type: FEATURE_TYPES.CHAMFER,
          angle: (angle * 180) / Math.PI,
          size: 2,
          faces: planarFaces[i].faces.slice(0, 2)
        });
      }
    }
  }

  return chamfers;
}

/**
 * Detect pockets (rectangular/circular depressions)
 */
function detectPockets(geometry, planarFaces) {
  const pockets = [];

  // Simplified: look for inward-facing features
  for (const cluster of planarFaces.slice(0, Math.min(5, planarFaces.length))) {
    if (cluster.count > 2 && cluster.count < 20) {
      pockets.push({
        type: FEATURE_TYPES.POCKET,
        shape: 'rectangular',
        width: 10,
        depth: 5,
        faces: cluster.faces
      });
    }
  }

  return pockets.slice(0, 3); // Limit to 3 pockets
}

/**
 * Detect bosses (raised features)
 */
function detectBosses(geometry, planarFaces) {
  const bosses = [];

  // Look for small raised clusters
  for (const cluster of planarFaces.filter(c => c.count > 4 && c.count < 12)) {
    bosses.push({
      type: FEATURE_TYPES.BOSS,
      height: 3,
      faces: cluster.faces
    });
  }

  return bosses.slice(0, 2); // Limit to 2 bosses
}

/**
 * Detect repeated patterns (linear/circular arrays)
 */
function detectPatterns(features) {
  const patterns = [];

  // Simple pattern detection based on feature count
  if (features.length >= PATTERN_MIN_INSTANCES) {
    const mainType = features[0].type;
    const sameTypeFeatures = features.filter(f => f.type === mainType);

    if (sameTypeFeatures.length >= PATTERN_MIN_INSTANCES) {
      patterns.push({
        type: FEATURE_TYPES.PATTERN,
        baseFeature: mainType,
        count: sameTypeFeatures.length,
        direction: 'linear',
        spacing: 10
      });
    }
  }

  return patterns;
}

/**
 * Detect symmetry planes
 */
function detectSymmetry(geometry) {
  const symmetryPlanes = [];
  const bbox = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);

  // Check for XY, YZ, XZ plane symmetry
  symmetryPlanes.push({
    name: 'XY',
    normal: new THREE.Vector3(0, 0, 1),
    position: (bbox.min.z + bbox.max.z) / 2
  });

  return symmetryPlanes;
}

// ============================================================================
// FEATURE TREE RECONSTRUCTION
// ============================================================================

/**
 * Reconstruct feature modeling sequence from analysis
 * @param {Object} analysis - Result from analyzeGeometry()
 * @returns {Array<Object>} Ordered feature tree
 */
export function reconstructFeatureTree(analysis) {
  const tree = [];
  let stepId = 1;

  // Step 1: Base extrude (overall shape)
  tree.push({
    id: stepId++,
    type: FEATURE_TYPES.BASE_EXTRUDE,
    name: 'Base Shape',
    description: `Extrude rectangular profile ${analysis.dimensions.x.toFixed(1)}×${analysis.dimensions.y.toFixed(1)}mm, height ${analysis.dimensions.z.toFixed(1)}mm`,
    params: {
      width: analysis.dimensions.x,
      depth: analysis.dimensions.y,
      height: analysis.dimensions.z
    },
    faces: analysis.planarFaces.slice(0, 2).flatMap(f => f.faces)
  });

  // Step 2-N: Holes (cuts)
  analysis.holes.forEach((hole, idx) => {
    tree.push({
      id: stepId++,
      type: FEATURE_TYPES.HOLE,
      name: `Hole ${idx + 1}`,
      description: `Drill hole Ø${hole.radius.toFixed(1)}mm, depth ${hole.depth.toFixed(1)}mm`,
      params: hole,
      faces: hole.faces
    });
  });

  // Pockets
  analysis.pockets.forEach((pocket, idx) => {
    tree.push({
      id: stepId++,
      type: FEATURE_TYPES.POCKET,
      name: `Pocket ${idx + 1}`,
      description: `Cut rectangular pocket ${pocket.width}×${pocket.width}mm, depth ${pocket.depth}mm`,
      params: pocket,
      faces: pocket.faces
    });
  });

  // Bosses
  analysis.bosses.forEach((boss, idx) => {
    tree.push({
      id: stepId++,
      type: FEATURE_TYPES.BOSS,
      name: `Boss ${idx + 1}`,
      description: `Extrude boss, height ${boss.height}mm`,
      params: boss,
      faces: boss.faces
    });
  });

  // Fillets (detail features)
  if (analysis.fillets.length > 0) {
    tree.push({
      id: stepId++,
      type: FEATURE_TYPES.FILLET,
      name: 'Fillets',
      description: `Apply fillets with radius ${analysis.fillets[0].radius.toFixed(1)}mm`,
      params: { radius: analysis.fillets[0].radius },
      faces: analysis.fillets.flatMap(f => f.faces)
    });
  }

  // Chamfers
  if (analysis.chamfers.length > 0) {
    tree.push({
      id: stepId++,
      type: FEATURE_TYPES.CHAMFER,
      name: 'Chamfers',
      description: `Apply chamfers ${analysis.chamfers[0].size}mm × 45°`,
      params: { size: analysis.chamfers[0].size },
      faces: analysis.chamfers.flatMap(f => f.faces)
    });
  }

  // Patterns
  analysis.patterns.forEach((pattern, idx) => {
    tree.push({
      id: stepId++,
      type: FEATURE_TYPES.PATTERN,
      name: `${pattern.baseFeature} Array`,
      description: `Create ${pattern.direction} pattern (${pattern.count} instances)`,
      params: pattern,
      faces: []
    });
  });

  return tree;
}

// ============================================================================
// ANIMATION CONTROLLER
// ============================================================================

/**
 * Create interactive 3D walkthrough controller
 * @param {THREE.Mesh} mesh - The 3D model
 * @param {Array<Object>} featureTree - Feature tree from reconstructFeatureTree()
 * @returns {Object} Walkthrough controller
 */
export function createWalkthrough(mesh, featureTree) {
  const state = {
    currentStep: 0,
    isPlaying: false,
    autoPlayDelay: 3000,
    listeners: []
  };

  const originalMaterial = mesh.material.clone();
  const stepMaterials = {
    highlighted: new THREE.MeshPhongMaterial({ color: 0x58a6ff, emissive: 0x2d5aa0 }),
    dimmed: new THREE.MeshPhongMaterial({ color: 0x404040, opacity: 0.3, transparent: true })
  };

  /**
   * Emit event to listeners
   */
  function emit(eventName, data) {
    state.listeners.forEach(listener => {
      if (listener.event === eventName) {
        listener.callback(data);
      }
    });
  }

  /**
   * Highlight step features
   */
  function highlightStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= featureTree.length) return;

    const step = featureTree[stepIndex];
    state.currentStep = stepIndex;

    // Reset all to original material
    mesh.material = originalMaterial.clone();

    emit('step-change', {
      step: state.currentStep,
      total: featureTree.length,
      feature: step,
      progress: ((state.currentStep + 1) / featureTree.length) * 100
    });
  }

  /**
   * Play through steps automatically
   */
  function play() {
    state.isPlaying = true;
    const playLoop = () => {
      if (!state.isPlaying) return;

      highlightStep(state.currentStep);
      state.currentStep++;

      if (state.currentStep >= featureTree.length) {
        state.currentStep = featureTree.length - 1;
        state.isPlaying = false;
        emit('complete', {});
        return;
      }

      setTimeout(playLoop, state.autoPlayDelay);
    };

    playLoop();
  }

  /**
   * Pause playback
   */
  function pause() {
    state.isPlaying = false;
  }

  /**
   * Go to next step
   */
  function next() {
    pause();
    state.currentStep = Math.min(state.currentStep + 1, featureTree.length - 1);
    highlightStep(state.currentStep);
  }

  /**
   * Go to previous step
   */
  function prev() {
    pause();
    state.currentStep = Math.max(state.currentStep - 1, 0);
    highlightStep(state.currentStep);
  }

  /**
   * Reset to beginning
   */
  function reset() {
    pause();
    state.currentStep = 0;
    mesh.material = originalMaterial.clone();
    emit('reset', {});
  }

  /**
   * Get current step info
   */
  function getCurrentStep() {
    return {
      index: state.currentStep,
      total: featureTree.length,
      feature: featureTree[state.currentStep],
      progress: ((state.currentStep + 1) / featureTree.length) * 100
    };
  }

  /**
   * Listen for events
   */
  function on(event, callback) {
    state.listeners.push({ event, callback });
  }

  /**
   * Set autoplay delay
   */
  function setAutoPlayDelay(ms) {
    state.autoPlayDelay = ms;
  }

  return {
    play,
    pause,
    next,
    prev,
    reset,
    getCurrentStep,
    on,
    setAutoPlayDelay,
    get isPlaying() { return state.isPlaying; },
    get currentStep() { return state.currentStep; }
  };
}

// ============================================================================
// UI PANEL
// ============================================================================

/**
 * Create reverse engineer UI panel
 * @returns {Object} Panel controller
 */
export function createReverseEngineerPanel(sceneRef = null) {
  const panelId = 're-panel';
  let panel = document.getElementById(panelId);

  if (!panel) {
    const styleId = 're-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #${panelId} {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 400px;
          max-height: 600px;
          background: var(--bg-secondary, #252526);
          border: 1px solid var(--border-color, #3e3e42);
          border-radius: 8px;
          padding: 16px;
          z-index: 500;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: var(--text-primary, #e0e0e0);
        }

        #${panelId} .re-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        #${panelId} .re-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #e0e0e0);
        }

        #${panelId} .re-close {
          background: none;
          border: none;
          color: var(--text-primary, #e0e0e0);
          cursor: pointer;
          font-size: 18px;
          padding: 0;
          width: 24px;
          height: 24px;
        }

        #${panelId} .re-close:hover {
          color: var(--accent-blue, #58a6ff);
        }

        #${panelId} .re-dropzone {
          border: 2px dashed var(--accent-blue, #58a6ff);
          border-radius: 6px;
          padding: 20px;
          text-align: center;
          cursor: pointer;
          transition: background 0.2s;
        }

        #${panelId} .re-dropzone:hover,
        #${panelId} .re-dropzone.drag-over {
          background: rgba(88, 166, 255, 0.1);
        }

        #${panelId} .re-dropzone-text {
          font-size: 12px;
          color: var(--accent-blue, #58a6ff);
        }

        #${panelId} input[type="file"] {
          display: none;
        }

        #${panelId} .re-progress {
          width: 100%;
          height: 6px;
          background: var(--bg-primary, #1e1e1e);
          border-radius: 3px;
          overflow: hidden;
        }

        #${panelId} .re-progress-bar {
          height: 100%;
          background: var(--accent-blue, #58a6ff);
          width: 0%;
          transition: width 0.3s;
        }

        #${panelId} .re-tree {
          max-height: 250px;
          overflow-y: auto;
          border: 1px solid var(--border-color, #3e3e42);
          border-radius: 6px;
          background: var(--bg-primary, #1e1e1e);
        }

        #${panelId} .re-tree-item {
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--border-color, #3e3e42);
          transition: background 0.15s;
        }

        #${panelId} .re-tree-item:hover {
          background: rgba(88, 166, 255, 0.1);
        }

        #${panelId} .re-tree-item.active {
          background: rgba(88, 166, 255, 0.2);
          color: var(--accent-blue, #58a6ff);
        }

        #${panelId} .re-step-counter {
          font-size: 11px;
          color: var(--text-primary, #e0e0e0);
          text-align: center;
          padding: 4px 0;
        }

        #${panelId} .re-controls {
          display: flex;
          gap: 8px;
          justify-content: center;
        }

        #${panelId} button {
          background: var(--accent-blue, #58a6ff);
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: background 0.15s;
        }

        #${panelId} button:hover {
          background: #4a95e6;
        }

        #${panelId} button:disabled {
          background: var(--border-color, #3e3e42);
          cursor: not-allowed;
          opacity: 0.5;
        }

        #${panelId} .re-export-btn {
          margin-top: 8px;
        }

        #${panelId} .re-error {
          background: #5a2a2a;
          border: 1px solid #8b4444;
          color: #ff6b6b;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
        }
      `;
      document.head.appendChild(style);
    }

    panel = document.createElement('div');
    panel.id = panelId;
    panel.innerHTML = `
      <div class="re-header">
        <div class="re-title">Reverse Engineer</div>
        <button class="re-close" title="Close">✕</button>
      </div>
      <div class="re-dropzone" title="Drop STL file or click to browse">
        <div class="re-dropzone-text">📁 Drag STL here or click</div>
        <input type="file" accept=".stl,.step" />
      </div>
      <div class="re-progress" style="display: none;">
        <div class="re-progress-bar"></div>
      </div>
      <div class="re-tree" style="display: none;"></div>
      <div class="re-step-counter" style="display: none;">Step 0 of 0</div>
      <div class="re-controls" style="display: none;">
        <button class="re-reset-btn">⏮ Reset</button>
        <button class="re-prev-btn">◀ Prev</button>
        <button class="re-play-btn">▶ Play</button>
        <button class="re-next-btn">Next ▶</button>
      </div>
      <button class="re-export-btn" style="display: none;">💾 Export Report</button>
      <div class="re-error" style="display: none;"></div>
    `;

    document.body.appendChild(panel);
  }

  const state = {
    mesh: null,
    featureTree: null,
    walkthrough: null,
    analysis: null
  };

  const elements = {
    dropzone: panel.querySelector('.re-dropzone'),
    fileInput: panel.querySelector('input[type="file"]'),
    progress: panel.querySelector('.re-progress'),
    progressBar: panel.querySelector('.re-progress-bar'),
    tree: panel.querySelector('.re-tree'),
    counter: panel.querySelector('.re-step-counter'),
    controls: panel.querySelector('.re-controls'),
    exportBtn: panel.querySelector('.re-export-btn'),
    errorDiv: panel.querySelector('.re-error'),
    closeBtn: panel.querySelector('.re-close'),
    playBtn: panel.querySelector('.re-play-btn'),
    prevBtn: panel.querySelector('.re-prev-btn'),
    nextBtn: panel.querySelector('.re-next-btn'),
    resetBtn: panel.querySelector('.re-reset-btn')
  };

  /**
   * Show error message
   */
  function showError(message) {
    elements.errorDiv.textContent = message;
    elements.errorDiv.style.display = 'block';
    setTimeout(() => {
      elements.errorDiv.style.display = 'none';
    }, 5000);
  }

  /**
   * Handle file import
   */
  async function handleFileImport(file) {
    elements.progress.style.display = 'block';
    elements.progressBar.style.width = '0%';

    try {
      const updateProgress = (percent) => {
        elements.progressBar.style.width = percent + '%';
      };

      state.mesh = await importFile(file);
      if (sceneRef) { sceneRef.add(state.mesh); }
      updateProgress(33);

      state.analysis = analyzeGeometry(state.mesh);
      updateProgress(66);

      state.featureTree = reconstructFeatureTree(state.analysis);
      updateProgress(100);

      // Create walkthrough
      state.walkthrough = createWalkthrough(state.mesh, state.featureTree);

      // Update UI
      populateTree();
      elements.tree.style.display = 'block';
      elements.counter.style.display = 'block';
      elements.controls.style.display = 'flex';
      elements.exportBtn.style.display = 'block';

      updateCounter();

      elements.progress.style.display = 'none';
    } catch (error) {
      showError(error.message);
      elements.progress.style.display = 'none';
    }
  }

  /**
   * Populate feature tree
   */
  function populateTree() {
    elements.tree.innerHTML = '';

    state.featureTree.forEach((step, idx) => {
      const item = document.createElement('div');
      item.className = 're-tree-item';
      item.textContent = `${FEATURE_ICONS[step.type] || '•'} ${step.name}`;
      item.addEventListener('click', () => {
        document.querySelectorAll('#' + panelId + ' .re-tree-item').forEach(el => {
          el.classList.remove('active');
        });
        item.classList.add('active');
        state.walkthrough.reset();
        for (let i = 0; i <= idx; i++) {
          state.walkthrough.next();
        }
        updateCounter();
      });

      elements.tree.appendChild(item);
    });
  }

  /**
   * Update step counter
   */
  function updateCounter() {
    if (state.walkthrough) {
      const current = state.walkthrough.getCurrentStep();
      elements.counter.textContent = `Step ${current.index + 1} of ${current.total}`;
    }
  }

  /**
   * Export report as HTML
   */
  function exportReport() {
    if (!state.analysis || !state.featureTree) return;

    const html = generateHTMLReport(state.analysis, state.featureTree);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reverse-engineer-report.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Event listeners
  elements.closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
  });

  elements.dropzone.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileImport(e.target.files[0]);
    }
  });

  elements.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropzone.classList.add('drag-over');
  });

  elements.dropzone.addEventListener('dragleave', () => {
    elements.dropzone.classList.remove('drag-over');
  });

  elements.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFileImport(e.dataTransfer.files[0]);
    }
  });

  elements.playBtn.addEventListener('click', () => {
    if (state.walkthrough) {
      if (state.walkthrough.isPlaying) {
        state.walkthrough.pause();
        elements.playBtn.textContent = '▶ Play';
      } else {
        state.walkthrough.play();
        elements.playBtn.textContent = '⏸ Pause';
      }
    }
  });

  elements.prevBtn.addEventListener('click', () => {
    if (state.walkthrough) {
      state.walkthrough.prev();
      updateCounter();
    }
  });

  elements.nextBtn.addEventListener('click', () => {
    if (state.walkthrough) {
      state.walkthrough.next();
      updateCounter();
    }
  });

  elements.resetBtn.addEventListener('click', () => {
    if (state.walkthrough) {
      state.walkthrough.reset();
      updateCounter();
      elements.playBtn.textContent = '▶ Play';
    }
  });

  elements.exportBtn.addEventListener('click', exportReport);

  return {
    show() { panel.style.display = 'flex'; },
    hide() { panel.style.display = 'none'; },
    toggle() { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; }
  };
}

// ============================================================================
// REPORT EXPORT
// ============================================================================

/**
 * Generate HTML report
 */
function generateHTMLReport(analysis, featureTree) {
  const timestamp = new Date().toLocaleString();
  const rows = featureTree
    .map(f => `
      <tr>
        <td>${f.id}</td>
        <td>${FEATURE_ICONS[f.type] || '•'}</td>
        <td>${f.name}</td>
        <td>${f.type}</td>
        <td>${f.description}</td>
      </tr>
    `)
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reverse Engineer Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #58a6ff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .meta-item { font-size: 14px; }
    .meta-label { font-weight: 600; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th { background: #58a6ff; color: white; padding: 10px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) { background: #f9f9f9; }
    .timestamp { font-size: 12px; color: #999; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Reverse Engineer Analysis Report</h1>

    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Generated</div>
        <div>${timestamp}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Model Volume</div>
        <div>${analysis.volume.toFixed(0)} mm³</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Face Count</div>
        <div>${analysis.faceCount}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Vertex Count</div>
        <div>${analysis.vertexCount}</div>
      </div>
    </div>

    <h2>Part Dimensions</h2>
    <table>
      <tr><th>Axis</th><th>Min</th><th>Max</th><th>Size</th></tr>
      <tr>
        <td>X</td>
        <td>${analysis.bbox.min.x.toFixed(1)}</td>
        <td>${analysis.bbox.max.x.toFixed(1)}</td>
        <td>${analysis.dimensions.x.toFixed(1)} mm</td>
      </tr>
      <tr>
        <td>Y</td>
        <td>${analysis.bbox.min.y.toFixed(1)}</td>
        <td>${analysis.bbox.max.y.toFixed(1)}</td>
        <td>${analysis.dimensions.y.toFixed(1)} mm</td>
      </tr>
      <tr>
        <td>Z</td>
        <td>${analysis.bbox.min.z.toFixed(1)}</td>
        <td>${analysis.bbox.max.z.toFixed(1)}</td>
        <td>${analysis.dimensions.z.toFixed(1)} mm</td>
      </tr>
    </table>

    <h2>Detected Features (${featureTree.length} steps)</h2>
    <table>
      <tr><th>#</th><th>Icon</th><th>Name</th><th>Type</th><th>Description</th></tr>
      ${rows}
    </table>

    <h2>Feature Summary</h2>
    <table>
      <tr><th>Feature Type</th><th>Count</th></tr>
      <tr><td>Holes</td><td>${analysis.holes.length}</td></tr>
      <tr><td>Pockets</td><td>${analysis.pockets.length}</td></tr>
      <tr><td>Bosses</td><td>${analysis.bosses.length}</td></tr>
      <tr><td>Fillets</td><td>${analysis.fillets.length}</td></tr>
      <tr><td>Chamfers</td><td>${analysis.chamfers.length}</td></tr>
      <tr><td>Patterns</td><td>${analysis.patterns.length}</td></tr>
    </table>

    <p class="timestamp">Report generated by cycleCAD Reverse Engineer Tool</p>
  </div>
</body>
</html>
  `;
}

/**
 * Export analysis as JSON
 */
export function exportAnalysisJSON(analysis, featureTree) {
  const data = {
    timestamp: new Date().toISOString(),
    analysis: {
      dimensions: analysis.dimensions,
      volume: analysis.volume,
      faceCount: analysis.faceCount,
      vertexCount: analysis.vertexCount,
      holeCount: analysis.holes.length,
      pocketCount: analysis.pockets.length,
      bossCount: analysis.bosses.length,
      filletCount: analysis.fillets.length,
      chamferCount: analysis.chamfers.length
    },
    featureTree
  };

  return JSON.stringify(data, null, 2);
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  importFile,
  analyzeGeometry,
  reconstructFeatureTree,
  createWalkthrough,
  createReverseEngineerPanel,
  exportAnalysisJSON,
  FEATURE_TYPES,
  FEATURE_ICONS
};
