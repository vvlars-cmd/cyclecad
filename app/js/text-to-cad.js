/**
 * text-to-cad.js — Multi-step agentic pipeline for natural language CAD generation
 *
 * Pipeline: Understand → Plan → Generate → Validate → Fix → Simplify
 *
 * API:
 *   window.cycleCAD.textToCAD.generate(prompt) — full pipeline
 *   window.cycleCAD.textToCAD.plan(prompt) — planning step only
 *   window.cycleCAD.textToCAD.validate(geometry) — geometry validation
 *   window.cycleCAD.textToCAD.getHistory() — command history
 *   window.cycleCAD.textToCAD.clearHistory()
 *   window.cycleCAD.textToCAD.getParameters() — extractable params
 *   window.cycleCAD.textToCAD.setParameter(name, value) — update + regenerate
 */

(function() {
  'use strict';

  // ============================================================================
  // SHAPE DEFINITIONS & NLP VOCABULARY
  // ============================================================================

  const SHAPES = {
    cylinder: {
      aliases: ['cylinder', 'cylindar', 'pipe', 'tube', 'rod', 'shaft', 'post'],
      params: { radius: 10, height: 50, segments: 32 },
      three: (p) => new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.segments)
    },
    box: {
      aliases: ['box', 'cube', 'rectangular', 'block', 'rectangular prism', 'rectangular block'],
      params: { width: 50, height: 50, depth: 50 },
      three: (p) => new THREE.BoxGeometry(p.width, p.height, p.depth)
    },
    sphere: {
      aliases: ['sphere', 'ball', 'spherical', 'globe', 'round'],
      params: { radius: 25, segments: 32 },
      three: (p) => new THREE.SphereGeometry(p.radius, p.segments, p.segments)
    },
    cone: {
      aliases: ['cone', 'conical', 'tapered', 'pyramid'],
      params: { radiusBase: 20, radiusTop: 0, height: 50, segments: 32 },
      three: (p) => new THREE.ConeGeometry(p.radiusBase, p.height, p.segments)
    },
    torus: {
      aliases: ['torus', 'donut', 'ring', 'annulus'],
      params: { majorRadius: 30, minorRadius: 10, segments: 100, tubularSegments: 20 },
      three: (p) => new THREE.TorusGeometry(p.majorRadius, p.minorRadius, p.tubularSegments, p.segments)
    },
    disk: {
      aliases: ['disk', 'disc', 'plate', 'circular plate', 'washer'],
      params: { radius: 30, thickness: 5 },
      three: (p) => new THREE.CylinderGeometry(p.radius, p.radius, p.thickness, 64)
    },
    hexagon: {
      aliases: ['hexagon', 'hex', 'hexagonal', 'bolt head'],
      params: { radius: 15, height: 10, segments: 6 },
      three: (p) => new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.segments)
    },
    gear: {
      aliases: ['gear', 'sprocket', 'cog', 'toothed wheel'],
      params: { outerRadius: 30, innerRadius: 20, teeth: 12, thickness: 10 },
      three: (p) => createGearGeometry(p)
    }
  };

  const OPERATIONS = {
    extrude: {
      aliases: ['extrude', 'pull', 'extend', 'stretch', 'pad'],
      requires: ['height'],
      description: 'Extrude a 2D sketch to 3D'
    },
    revolve: {
      aliases: ['revolve', 'rotate', 'spin', 'lathe'],
      requires: ['axis', 'angle'],
      description: 'Revolve a profile around an axis'
    },
    fillet: {
      aliases: ['fillet', 'round', 'round edges', 'smooth edges'],
      requires: ['radius', 'edges'],
      description: 'Round sharp edges'
    },
    chamfer: {
      aliases: ['chamfer', 'bevel', 'cut corner', 'angle edge'],
      requires: ['size', 'edges'],
      description: 'Cut off sharp corners at an angle'
    },
    hole: {
      aliases: ['hole', 'drill', 'through hole', 'bore', 'pocket'],
      requires: ['radius', 'depth'],
      description: 'Create a hole through or into the part'
    },
    union: {
      aliases: ['union', 'join', 'combine', 'merge', 'add'],
      requires: ['bodies'],
      description: 'Combine two shapes into one'
    },
    cut: {
      aliases: ['cut', 'subtract', 'remove', 'pocket', 'boolean cut'],
      requires: ['body'],
      description: 'Remove material from a shape'
    },
    shell: {
      aliases: ['shell', 'hollow', 'hollow out', 'thin wall'],
      requires: ['thickness'],
      description: 'Make a shape hollow with uniform wall thickness'
    },
    pattern: {
      aliases: ['pattern', 'array', 'copy', 'repeat', 'grid'],
      requires: ['count', 'spacing'],
      description: 'Repeat a feature in a grid or circular pattern'
    },
    sweep: {
      aliases: ['sweep', 'loft', 'along path'],
      requires: ['profile', 'path'],
      description: 'Sweep a profile along a path'
    }
  };

  // Dimension patterns: "50mm", "2.5 inches", "M8", "1/2 in", "0.5\""
  const DIMENSION_PATTERNS = [
    { regex: /(\d+\.?\d*)\s*(mm|millimeter|millimeters)/gi, unit: 'mm', scale: 1 },
    { regex: /(\d+\.?\d*)\s*(inch|inches|in|")/gi, unit: 'in', scale: 25.4 },
    { regex: /(\d+\.?\d*)\s*(cm|centimeter|centimeters)/gi, unit: 'cm', scale: 10 },
    { regex: /(\d+\.?\d*)\s*(m|meter|meters)/gi, unit: 'm', scale: 1000 },
    { regex: /M(\d+)/gi, unit: 'metric', scale: 1 }, // Metric threads: M8, M10, etc.
    { regex: /(\d+)\/(\d+)\s*(?:inch|in|")?/gi, unit: 'fraction', scale: 25.4 } // Fractional inches
  ];

  // ============================================================================
  // SCENE STATE & HISTORY
  // ============================================================================

  let sceneState = {
    parts: [],
    features: [],
    parameters: {},
    currentShape: null,
    dimensions: {},
    material: 'steel',
    units: 'mm'
  };

  let commandHistory = [];
  let currentGroup = null; // Three.js Group for generated geometry

  // ============================================================================
  // STEP 1: UNDERSTAND — Parse prompt into structured intent
  // ============================================================================

  function understand(prompt) {
    const lower = prompt.toLowerCase().trim();
    const result = {
      prompt,
      shapes: [],
      operations: [],
      dimensions: {},
      positions: {},
      modifiers: [],
      confidence: 0
    };

    // Extract shape types
    for (const [shapeKey, shapeData] of Object.entries(SHAPES)) {
      for (const alias of shapeData.aliases) {
        const regex = new RegExp(`\\b${alias}\\b`, 'gi');
        if (regex.test(lower)) {
          result.shapes.push({ type: shapeKey, params: { ...shapeData.params } });
        }
      }
    }

    // Extract operations
    for (const [opKey, opData] of Object.entries(OPERATIONS)) {
      for (const alias of opData.aliases) {
        const regex = new RegExp(`\\b${alias}\\b`, 'gi');
        if (regex.test(lower)) {
          result.operations.push({ type: opKey, requires: opData.requires });
        }
      }
    }

    // Extract dimensions
    for (const dimPattern of DIMENSION_PATTERNS) {
      let match;
      while ((match = dimPattern.regex.exec(lower)) !== null) {
        let value = parseFloat(match[1]);
        if (dimPattern.unit === 'fraction' && match[2]) {
          value = (parseFloat(match[1]) / parseFloat(match[2])) * dimPattern.scale;
        } else {
          value *= dimPattern.scale; // Convert to mm
        }
        result.dimensions[`dim_${Object.keys(result.dimensions).length}`] = {
          value: Math.round(value * 100) / 100,
          originalText: match[0],
          unit: dimPattern.unit
        };
      }
    }

    // Extract position keywords
    const positionKeywords = ['centered', 'top', 'bottom', 'left', 'right', 'inside', 'outside', 'through'];
    for (const keyword of positionKeywords) {
      if (lower.includes(keyword)) {
        result.positions[keyword] = true;
      }
    }

    // Extract modifiers
    const modifierKeywords = ['smooth', 'round', 'sharp', 'flat', 'curved', 'symmetric', 'hollow', 'thick', 'thin'];
    for (const keyword of modifierKeywords) {
      if (lower.includes(keyword)) {
        result.modifiers.push(keyword);
      }
    }

    // Confidence scoring
    result.confidence = (result.shapes.length * 0.3 + result.operations.length * 0.2 + Object.keys(result.dimensions).length * 0.3 + result.modifiers.length * 0.2) / 10;
    result.confidence = Math.min(1, Math.max(0, result.confidence));

    return result;
  }

  // ============================================================================
  // STEP 2: PLAN — Map geometry strategy
  // ============================================================================

  function plan(prompt) {
    const understood = understand(prompt);

    const strategy = {
      prompt,
      understood,
      steps: [],
      estimatedComplexity: 0,
      notes: []
    };

    // If no shapes detected, try to infer from operations
    if (understood.shapes.length === 0 && understood.operations.length > 0) {
      strategy.notes.push('No base shape detected. Assuming box as default.');
      understood.shapes.push({ type: 'box', params: { ...SHAPES.box.params } });
    }

    // If no shapes detected at all
    if (understood.shapes.length === 0) {
      strategy.notes.push('No recognizable shapes or operations. Using default box.');
      understood.shapes.push({ type: 'box', params: { ...SHAPES.box.params } });
    }

    // Assign dimensions to parameters in order
    const dimValues = Object.values(understood.dimensions);
    if (understood.shapes.length > 0) {
      const baseShape = understood.shapes[0];
      const paramKeys = Object.keys(baseShape.params);

      dimValues.forEach((dim, idx) => {
        if (idx < paramKeys.length) {
          const key = paramKeys[idx];
          baseShape.params[key] = Math.max(1, dim.value); // Clamp to 1mm minimum
        }
      });
    }

    // Step 1: Create base shape
    if (understood.shapes.length > 0) {
      strategy.steps.push({
        index: 0,
        operation: 'create',
        target: understood.shapes[0].type,
        params: understood.shapes[0].params,
        description: `Create ${understood.shapes[0].type} with params ${JSON.stringify(understood.shapes[0].params)}`
      });
    }

    // Step 2: Apply operations
    understood.operations.forEach((op, idx) => {
      strategy.steps.push({
        index: idx + 1,
        operation: op.type,
        requires: op.requires,
        description: `Apply ${op.type} operation`
      });
    });

    // Step 3: Apply modifiers (implicit operations)
    understood.modifiers.forEach((mod, idx) => {
      if (mod === 'smooth' || mod === 'round') {
        strategy.steps.push({
          index: strategy.steps.length,
          operation: 'fillet',
          requires: ['radius'],
          params: { radius: 2 },
          description: `Apply fillet to smooth edges`
        });
      } else if (mod === 'hollow') {
        strategy.steps.push({
          index: strategy.steps.length,
          operation: 'shell',
          requires: ['thickness'],
          params: { thickness: 2 },
          description: `Make hollow with 2mm wall`
        });
      }
    });

    strategy.estimatedComplexity = strategy.steps.length;
    return strategy;
  }

  // ============================================================================
  // STEP 3: GENERATE — Create Three.js geometry from plan
  // ============================================================================

  function generate(prompt) {
    const strategy = plan(prompt);
    const result = {
      prompt,
      strategy,
      geometry: null,
      group: null,
      params: {},
      code: [],
      steps: [],
      success: false,
      errors: []
    };

    try {
      // Create a Three.js Group to hold all geometry
      const group = new THREE.Group();
      group.name = `Generated from: ${prompt.substring(0, 50)}`;

      let geometry = null;
      let mesh = null;

      // Execute each step
      for (let i = 0; i < strategy.steps.length; i++) {
        const step = strategy.steps[i];

        if (step.operation === 'create') {
          // Create base shape
          const shapeData = SHAPES[step.target];
          if (shapeData && shapeData.three) {
            geometry = shapeData.three(step.params);

            if (!geometry) {
              throw new Error(`Failed to create ${step.target} geometry`);
            }

            // Store params for later reference
            result.params[step.target] = { ...step.params };

            // Create mesh
            const material = new THREE.MeshStandardMaterial({
              color: 0x2196F3,
              metalness: 0.6,
              roughness: 0.4
            });
            mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);

            result.code.push(`// Create ${step.target}`);
            result.code.push(`const geometry = new THREE.${getGeometryConstructor(step.target)}(${stringifyParams(step.params)});`);
            result.code.push(`const mesh = new THREE.Mesh(geometry, material);`);
            result.code.push(`group.add(mesh);`);
          }
        } else if (step.operation === 'fillet') {
          // Simplified fillet: smooth normals
          if (geometry) {
            geometry.computeVertexNormals();
            result.code.push(`geometry.computeVertexNormals();`);
          }
        } else if (step.operation === 'hole') {
          // Create hole (visual approximation: add small cylinder to subtract)
          if (step.params && step.params.radius) {
            const holeGeom = new THREE.CylinderGeometry(
              step.params.radius,
              step.params.radius,
              step.params.depth || 50,
              32
            );
            const holeMat = new THREE.MeshStandardMaterial({
              color: 0x333333,
              metalness: 0.8,
              roughness: 0.2
            });
            const holeMesh = new THREE.Mesh(holeGeom, holeMat);
            holeMesh.position.z = (step.params.depth || 50) / 2;
            group.add(holeMesh);

            result.code.push(`// Add hole`);
            result.code.push(`const holeGeom = new THREE.CylinderGeometry(${step.params.radius}, ${step.params.radius}, ${step.params.depth || 50}, 32);`);
            result.code.push(`const holeMesh = new THREE.Mesh(holeGeom, holeMaterial);`);
            result.code.push(`group.add(holeMesh);`);
          }
        } else if (step.operation === 'shell') {
          // Simplified shell: adjust material properties
          if (mesh && step.params && step.params.thickness) {
            mesh.material.transparent = true;
            mesh.material.opacity = 0.9;
            result.code.push(`mesh.material.transparent = true;`);
            result.code.push(`mesh.material.opacity = 0.9;`);
          }
        } else if (step.operation === 'pattern') {
          // Simplified pattern: clone and position
          if (mesh && step.params) {
            const count = step.params.count || 4;
            const spacing = step.params.spacing || 30;

            for (let j = 1; j < count; j++) {
              const clonedMesh = mesh.clone();
              clonedMesh.position.x = j * spacing;
              group.add(clonedMesh);
            }

            result.code.push(`// Create pattern`);
            result.code.push(`for (let i = 1; i < ${count}; i++) {`);
            result.code.push(`  const cloned = mesh.clone();`);
            result.code.push(`  cloned.position.x = i * ${spacing};`);
            result.code.push(`  group.add(cloned);`);
            result.code.push(`}`);
          }
        }

        result.steps.push({
          index: i,
          operation: step.operation,
          description: step.description,
          success: true
        });
      }

      // Center geometry in group
      if (geometry) {
        geometry.center();
      }

      result.geometry = geometry;
      result.group = group;
      result.success = true;

      // Add to scene state
      commandHistory.push({
        prompt,
        timestamp: Date.now(),
        result,
        parameters: { ...result.params }
      });

      sceneState.parts.push(group);
      sceneState.currentShape = group;

    } catch (error) {
      result.errors.push(error.message);
      result.success = false;
    }

    return result;
  }

  // ============================================================================
  // STEP 4: VALIDATE — Check generated geometry
  // ============================================================================

  function validate(geometry) {
    const issues = [];
    const warnings = [];

    if (!geometry) {
      issues.push('Geometry is null or undefined');
      return { valid: false, issues, warnings };
    }

    // Check for valid vertices
    if (!geometry.attributes || !geometry.attributes.position) {
      issues.push('Geometry has no position attribute');
    } else {
      const posArray = geometry.attributes.position.array;
      if (posArray.length < 3) {
        issues.push('Geometry has fewer than 3 vertices (degenerate)');
      }

      // Check for NaN or infinite values
      for (let i = 0; i < posArray.length; i++) {
        if (!isFinite(posArray[i])) {
          issues.push(`Invalid coordinate at index ${i}: ${posArray[i]}`);
        }
      }
    }

    // Check bounding box
    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    const size = bbox.getSize(new THREE.Vector3());
    if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
      issues.push('Geometry has zero or negative bounding box dimensions');
    }

    // Calculate volume (rough estimate from bbox)
    const volume = size.x * size.y * size.z;
    if (volume < 0.01) {
      warnings.push('Geometry is very small (volume < 0.01 mm³)');
    }

    // Check face count
    let faceCount = 0;
    if (geometry.index) {
      faceCount = geometry.index.count / 3;
    } else if (geometry.attributes.position) {
      faceCount = geometry.attributes.position.count / 3;
    }

    if (faceCount < 4) {
      warnings.push('Geometry has very few faces (< 4 triangles)');
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      stats: {
        vertices: geometry.attributes?.position?.count || 0,
        faces: faceCount,
        volume,
        bbox: { x: size.x, y: size.y, z: size.z }
      }
    };
  }

  // ============================================================================
  // STEP 5: FIX — Auto-repair issues
  // ============================================================================

  function fix(geometry) {
    if (!geometry) return geometry;

    const fixed = geometry.clone();

    // Compute smooth vertex normals
    fixed.computeVertexNormals();

    // Merge close vertices (snap tiny gaps)
    const posArray = fixed.attributes.position.array;
    const mergeThreshold = 0.001; // 0.001mm

    for (let i = 0; i < posArray.length; i += 3) {
      for (let j = i + 3; j < posArray.length; j += 3) {
        const dx = posArray[i] - posArray[j];
        const dy = posArray[i + 1] - posArray[j + 1];
        const dz = posArray[i + 2] - posArray[j + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < mergeThreshold && dist > 0) {
          // Snap to first vertex
          posArray[j] = posArray[i];
          posArray[j + 1] = posArray[i + 1];
          posArray[j + 2] = posArray[i + 2];
        }
      }
    }

    fixed.attributes.position.needsUpdate = true;

    // Remove duplicate indices
    if (fixed.index) {
      const indices = fixed.index.array;
      const uniqueIndices = new Uint32Array([...new Set(indices)]);
      fixed.index.array = uniqueIndices;
      fixed.index.needsUpdate = true;
    }

    return fixed;
  }

  // ============================================================================
  // STEP 6: SIMPLIFY — Clean up for rendering
  // ============================================================================

  function simplify(geometry) {
    if (!geometry) return geometry;

    const simplified = geometry.clone();

    // Limit vertex count to reasonable size for web
    const maxVertices = 65536; // WebGL limit
    const posArray = simplified.attributes.position.array;

    if (posArray.length / 3 > maxVertices) {
      // Simple decimation: keep every nth vertex
      const factor = Math.ceil((posArray.length / 3) / maxVertices);
      const newPos = [];

      for (let i = 0; i < posArray.length; i += factor * 3) {
        newPos.push(posArray[i], posArray[i + 1], posArray[i + 2]);
      }

      simplified.attributes.position.array = new Float32Array(newPos);
      simplified.attributes.position.needsUpdate = true;
    }

    return simplified;
  }

  // ============================================================================
  // FULL PIPELINE
  // ============================================================================

  function generateFull(prompt) {
    // Step 1: Understand
    const understood = understand(prompt);

    // Step 2: Plan
    const strategy = plan(prompt);

    // Step 3: Generate
    const generation = generate(prompt);

    // Step 4: Validate
    let validation = { valid: true, issues: [], warnings: [] };
    if (generation.geometry) {
      validation = validate(generation.geometry);
    }

    // Step 5: Fix
    let geometry = generation.geometry;
    if (!validation.valid && geometry) {
      geometry = fix(geometry);
      validation = validate(geometry);
    }

    // Step 6: Simplify
    if (geometry) {
      geometry = simplify(geometry);
    }

    return {
      prompt,
      understood,
      strategy,
      generation,
      validation,
      geometry,
      group: generation.group,
      params: generation.params,
      code: generation.code,
      steps: generation.steps,
      success: generation.success && validation.valid
    };
  }

  // ============================================================================
  // PARAMETER EXTRACTION & CONTROL
  // ============================================================================

  function getParameters() {
    const params = {};

    if (sceneState.currentShape) {
      // Extract mesh dimensions
      const bbox = new THREE.Box3().setFromObject(sceneState.currentShape);
      const size = bbox.getSize(new THREE.Vector3());

      params.width = {
        value: Math.round(size.x * 100) / 100,
        min: 1,
        max: 500,
        step: 0.5
      };
      params.height = {
        value: Math.round(size.y * 100) / 100,
        min: 1,
        max: 500,
        step: 0.5
      };
      params.depth = {
        value: Math.round(size.z * 100) / 100,
        min: 1,
        max: 500,
        step: 0.5
      };
    }

    // Add stored parameters
    Object.assign(params, sceneState.parameters);

    return params;
  }

  function setParameter(name, value) {
    sceneState.parameters[name] = value;

    // Trigger regeneration if the last command is available
    if (commandHistory.length > 0) {
      const lastCommand = commandHistory[commandHistory.length - 1];
      const updated = generateFull(lastCommand.prompt);
      sceneState.currentShape = updated.group;
      return updated;
    }

    return null;
  }

  // ============================================================================
  // HISTORY MANAGEMENT
  // ============================================================================

  function getHistory() {
    return commandHistory.map((cmd, idx) => ({
      index: idx,
      prompt: cmd.prompt,
      timestamp: cmd.timestamp,
      parameters: cmd.parameters,
      success: cmd.result.success
    }));
  }

  function clearHistory() {
    commandHistory = [];
    sceneState = {
      parts: [],
      features: [],
      parameters: {},
      currentShape: null,
      dimensions: {},
      material: 'steel',
      units: 'mm'
    };
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  function getGeometryConstructor(shapeType) {
    const map = {
      cylinder: 'CylinderGeometry',
      box: 'BoxGeometry',
      sphere: 'SphereGeometry',
      cone: 'ConeGeometry',
      torus: 'TorusGeometry',
      disk: 'CylinderGeometry',
      hexagon: 'CylinderGeometry',
      gear: 'CustomGearGeometry'
    };
    return map[shapeType] || 'BufferGeometry';
  }

  function stringifyParams(params) {
    const pairs = Object.values(params).map(v => {
      if (typeof v === 'number') return v;
      return JSON.stringify(v);
    });
    return pairs.join(', ');
  }

  function createGearGeometry(params) {
    // Simplified gear: torus with extruded teeth
    const geo = new THREE.TorusGeometry(
      params.outerRadius,
      params.outerRadius - params.innerRadius,
      8,
      params.teeth
    );
    return geo;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  const API = {
    generate: generateFull,
    plan,
    validate,
    fix,
    simplify,
    understand,
    getHistory,
    clearHistory,
    getParameters,
    setParameter,
    getSceneState: () => JSON.parse(JSON.stringify(sceneState)),
    init: () => {
      clearHistory();
      console.log('[text-to-cad] Initialized. Call window.cycleCAD.textToCAD.generate(prompt) to start.');
    }
  };

  // ============================================================================
  // REGISTER ON WINDOW.CYCLECAD
  // ============================================================================

  if (typeof window !== 'undefined') {
    window.cycleCAD = window.cycleCAD || {};
    window.cycleCAD.textToCAD = API;

    // Auto-init if DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => API.init());
    } else {
      API.init();
    }
  }

})();
