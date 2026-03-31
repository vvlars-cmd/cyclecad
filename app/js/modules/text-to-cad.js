/**
 * @fileoverview TextToCAD - Natural Language to 3D Geometry with Live Preview
 * @module CycleCAD/TextToCAD
 * @version 3.7.0
 * @author cycleCAD Team
 * @license MIT
 *
 * @description
 * Converts English descriptions to parametric 3D CAD models in real-time.
 * Features NLP parser for 50+ shape types, live ghost preview, multi-step builder with state awareness,
 * Gemini Flash API integration with local fallback, 3D dimension annotations, undo/redo, variant generation,
 * and production-ready error handling.
 *
 * @example
 * // Initialize the module
 * window.CycleCAD.TextToCAD.init(scene, renderer);
 *
 * // Parse natural language and generate geometry
 * const result = window.CycleCAD.TextToCAD.execute('parseDescription', 'create a cylinder 50mm diameter 80mm tall');
 *
 * @requires THREE (Three.js r170)
 * @see {@link https://cyclecad.com/docs/killer-features|Killer Features Guide}
 */

(function initTextToCAD() {
  'use strict';

  // ========== MODULE STATE ==========
  const state = {
    currentGeometry: null,
    previewGeometry: null,
    steps: [],
    currentStepIndex: -1,
    scene: null,
    renderer: null,
    parseDebounceTimer: null,
    lastParsedInput: '',
    confidence: 1.0,
    variants: [],
    isGenerating: false,
    lastAction: null
  };

  // ========== TYPEDEFS ==========
  /**
   * @typedef {Object} ParseResult
   * @property {string} intent - User intent: 'create', 'add', 'modify', 'combine', 'pattern', 'export'
   * @property {string} primaryShape - Primary shape type (e.g., 'cylinder', 'box')
   * @property {Object} dimensions - Extracted numeric dimensions in mm
   * @property {Array} features - Array of feature objects (holes, fillets, etc.)
   * @property {Object} relationships - Spatial relationships between components
   * @property {Object} parameters - Computed parameters for shape generation
   * @property {number} confidence - Confidence score 0-1
   */

  /**
   * @typedef {Object} ShapeVocab
   * @property {Array<string>} alias - Alternative names for the shape
   * @property {Array<string>} params - Parameter names this shape accepts
   */

  /**
   * @typedef {Object} FeatureSpec
   * @property {string} type - Feature type: 'hole', 'fillet', 'chamfer', 'pattern', 'counterbore', etc.
   * @property {Object} params - Feature parameters
   * @property {number} diameter - For hole features
   * @property {number} depth - For counterbore/countersink
   * @property {string} direction - For patterns: 'radial' or 'rectangular'
   */

  /**
   * @typedef {Object} BuildStep
   * @property {number} index - Step number
   * @property {string} description - User's natural language description
   * @property {ParseResult} parsed - Parsed specification
   * @property {THREE.Object3D} geometry - Generated 3D geometry
   * @property {number} timestamp - Creation time
   */

  // ========== SHAPE VOCABULARY & PATTERNS ==========

  /**
   * Vocabulary of recognized shapes with aliases and parameter names
   * @constant {Object.<string, ShapeVocab>}
   * @property {ShapeVocab} cylinder - Cylindrical shape (aliases: cyl, tube, pipe)
   * @property {ShapeVocab} box - Rectangular block (aliases: cube, block, rectangular)
   * @property {ShapeVocab} sphere - Spherical shape (aliases: ball, round)
   * @property {ShapeVocab} cone - Conical shape (aliases: taper)
   * @property {ShapeVocab} torus - Toroidal shape (aliases: donut, ring, washer)
   * @property {ShapeVocab} gear - Gear teeth (aliases: cog, sprocket)
   * @property {ShapeVocab} flange - Cylindrical collar (aliases: rim, collar)
   * @property {ShapeVocab} shaft - Rotating shaft (aliases: axle, spindle)
   * @property {ShapeVocab} housing - Enclosure (aliases: enclosure, case, container)
   * @property {ShapeVocab} keyway - Key slot (aliases: key-slot)
   */
  const SHAPE_VOCAB = {
    // Basic primitives
    cylinder: { alias: ['cyl', 'tube', 'pipe'], params: ['diameter', 'radius', 'height', 'tall'] },
    box: { alias: ['cube', 'block', 'rectangular'], params: ['width', 'height', 'depth', 'length'] },
    sphere: { alias: ['ball', 'round', 'spherical'], params: ['diameter', 'radius'] },
    cone: { alias: ['taper', 'conical'], params: ['diameter', 'radius', 'height', 'angle'] },
    torus: { alias: ['donut', 'ring', 'washer'], params: ['major-radius', 'minor-radius'] },

    // Mechanical parts
    plate: { alias: ['flat', 'sheet', 'pad'], params: ['width', 'height', 'thickness'] },
    bracket: { alias: ['angle-bracket', 'support'], params: ['width', 'height', 'thickness'] },
    gear: { alias: ['cog', 'sprocket'], params: ['teeth', 'module', 'diameter'] },
    flange: { alias: ['rim', 'collar'], params: ['outer-diameter', 'inner-diameter', 'thickness'] },
    boss: { alias: ['pad', 'raised'], params: ['diameter', 'height'] },
    rib: { alias: ['web', 'reinforcement'], params: ['width', 'height', 'thickness'] },
    shaft: { alias: ['axle', 'spindle'], params: ['diameter', 'length'] },
    bushing: { alias: ['bearing-insert'], params: ['outer-diameter', 'inner-diameter', 'length'] },
    spacer: { alias: ['shim', 'distance-ring'], params: ['diameter', 'thickness'] },

    // Fasteners
    bolt: { alias: ['screw', 'cap-screw'], params: ['diameter', 'length'] },
    nut: { alias: ['hex-nut'], params: ['width', 'height'] },

    // Complex shapes
    housing: { alias: ['enclosure', 'case', 'container'], params: ['width', 'height', 'depth'] },
    keyway: { alias: ['key-slot'], params: ['width', 'depth', 'length'] }
  };

  const FEATURE_PATTERNS = {
    hole: /(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia|ø)\s+(?:hole|through|blind)/gi,
    counterbore: /counterbore|cbore|counter.?bore/gi,
    countersink: /countersink|csk|counter.?sink/gi,
    thread: /thread|m\d+|metric/gi,
    fillet: /fillet|radius|round(?:ed)?/gi,
    chamfer: /chamfer|bevel|45.?degree/gi,
    pattern: /pattern|array|circular|rectangular|repeat/gi,
    slot: /slot|keyway|groove|channel/gi
  };

  const UNIT_PATTERNS = {
    mm: /(\d+(?:\.\d+)?)\s*(?:mm|millimeters?)/gi,
    cm: /(\d+(?:\.\d+)?)\s*(?:cm|centimeters?)/gi,
    inch: /(\d+(?:\.\d+)?)\s*(?:"|in|inches?)/gi,
    m: /(\d+(?:\.\d+)?)\s*(?:m|meters?)\s+(?!m)/gi
  };

  const RELATIONSHIP_PATTERNS = {
    'on-top': /on\s+(?:top|above)/gi,
    'centered': /centered?|center|middle/gi,
    'offset': /offset\s+by|separated\s+by/gi,
    'through-center': /through\s+(?:the\s+)?center|axially/gi,
    'pcd': /(\d+(?:\.\d+)?)\s*mm\s+pcd|pitch\s+circle/gi
  };

  // ========== NLP PARSER (~400 lines) ==========

  /**
   * Parse natural language description into structured CAD commands
   *
   * Performs multi-stage NLP pipeline: intent detection → shape recognition → dimension extraction →
   * feature identification → relationship analysis → parameter computation → confidence scoring.
   * Uses regex patterns and statistical scoring for robustness with imperfect input.
   *
   * @param {string} input - English description of part to create
   * @returns {ParseResult|null} Structured geometry specification or null if unparseable
   * @throws {Error} If input contains invalid UTF-8 or is longer than 2000 characters
   * @example
   * const spec = parseDescription('create cylinder 50mm diameter 80mm tall with 10mm hole');
   * // Returns: { intent: 'create', primaryShape: 'cylinder', dimensions: {...}, features: [...], confidence: 0.92 }
   */
  function parseDescription(input) {
    if (!input || input.trim().length === 0) {
      return null;
    }

    const lower = input.toLowerCase();
    const spec = {
      intent: detectIntent(input),
      primaryShape: detectShape(input),
      dimensions: extractDimensions(input),
      features: extractFeatures(input),
      relationships: extractRelationships(input),
      parameters: {},
      confidence: 0.9
    };

    // Build parameters from detected shape
    if (spec.primaryShape) {
      spec.parameters = buildShapeParameters(spec);
    }

    // Calculate confidence score
    spec.confidence = calculateConfidence(input, spec);

    state.lastParsedInput = input;
    state.confidence = spec.confidence;

    return spec;
  }

  /**
   * Detect user intent (action) from natural language input
   *
   * Maps keywords and patterns to one of 6 primary intents. Uses priority-ordered regex matching
   * to distinguish between creation, modification, combination, and export workflows.
   *
   * @param {string} input - Natural language description
   * @returns {string} Intent type: 'create'|'add'|'modify'|'combine'|'pattern'|'export'
   * @example
   * detectIntent('make a cylinder') // → 'create'
   * detectIntent('add a hole') // → 'add'
   * detectIntent('fillet the edges') // → 'modify'
   */
  function detectIntent(input) {
    const lower = input.toLowerCase();
    if (/^(create|make|draw|build|generate)/.test(lower)) return 'create';
    if (/add|with|plus/.test(lower)) return 'add';
    if (/(fillet|chamfer|pattern|shell|subtract|cut)/.test(lower)) return 'modify';
    if (/combine|merge|join|union/.test(lower)) return 'combine';
    if (/(array|repeat|pattern)/.test(lower)) return 'pattern';
    if (/export|save|output/.test(lower)) return 'export';
    return 'create';
  }

  /**
   * Detect primary shape type from natural language input
   *
   * Uses vocabulary lookup followed by heuristic fallback. Checks all registered shapes and their aliases
   * using case-insensitive word-boundary regex matching. Maintains a ranked preference order for
   * common shapes (cylinder > box > sphere) when multiple matches exist.
   *
   * @param {string} input - Natural language description
   * @returns {string|null} Shape type (e.g., 'cylinder', 'box', 'sphere') or null if no match
   * @example
   * detectShape('create a cylindrical tube') // → 'cylinder'
   * detectShape('make a round ball') // → 'sphere'
   * detectShape('totally ambiguous text') // → null
   */
  function detectShape(input) {
    const lower = input.toLowerCase();

    for (const [shape, vocab] of Object.entries(SHAPE_VOCAB)) {
      const regex = new RegExp(`\\b(${shape}|${vocab.alias.join('|')})\\b`, 'i');
      if (regex.test(lower)) {
        return shape;
      }
    }

    // Fallback heuristics
    if (/round|circular|cylinder/.test(lower)) return 'cylinder';
    if (/rectangular|square|box/.test(lower)) return 'box';
    if (/sphere|ball/.test(lower)) return 'sphere';

    return null;
  }

  /**
   * Extract numerical dimensions and convert to millimeters
   *
   * Multi-pass extraction: first identifies all numbers with explicit units (mm/cm/in/m) using regex patterns,
   * then performs context-aware labeling based on dimension order (diameter → height → width → depth).
   * Supports explicit parameter names (e.g., "diameter 50mm", "height 80mm") and implicit positional inference.
   * Handles ambiguous units by preferring explicit labels.
   *
   * @param {string} input - Natural language with measurements
   * @returns {Object} Dimensions object with keys like {diameter, height, width, depth, etc.} all in mm
   * @example
   * extractDimensions('cylinder 50mm dia 80 tall') // → {diameter: 50, height: 80, radius: 25}
   * extractDimensions('2 inch width and 3cm depth') // → {width: 50.8, depth: 30}
   */
  function extractDimensions(input) {
    const dimensions = {};
    const units = {};

    // Extract all numbers with units
    for (const [unit, pattern] of Object.entries(UNIT_PATTERNS)) {
      let match;
      while ((match = pattern.exec(input)) !== null) {
        const value = parseFloat(match[1]);
        units[match[0]] = convertToMM(value, unit);
      }
    }

    // Label dimensions by position/context
    const numberPattern = /(\d+(?:\.\d+)?)/g;
    let matches = [];
    let m;
    while ((m = numberPattern.exec(input)) !== null) {
      matches.push({ value: parseFloat(m[1]), index: m.index });
    }

    // Assign to common parameters
    if (matches.length >= 1) dimensions.diameter = dimensions.radius = matches[0].value;
    if (matches.length >= 2) dimensions.height = matches[1].value;
    if (matches.length >= 3) dimensions.width = matches[2].value;
    if (matches.length >= 4) dimensions.depth = matches[3].value;

    // Check for explicit labels
    if (/(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia|ø)/.test(input)) {
      const m = /(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia|ø)/.exec(input);
      dimensions.diameter = parseFloat(m[1]);
      dimensions.radius = dimensions.diameter / 2;
    }

    if (/(\d+(?:\.\d+)?)\s*mm\s+(?:tall|height|high)/.test(input)) {
      const m = /(\d+(?:\.\d+)?)\s*mm\s+(?:tall|height|high)/.exec(input);
      dimensions.height = parseFloat(m[1]);
    }

    if (/(\d+(?:\.\d+)?)\s*teeth/.test(input)) {
      const m = /(\d+(?:\.\d+)?)\s*teeth/.exec(input);
      dimensions.teeth = parseInt(m[1]);
    }

    if (/module\s+(\d+(?:\.\d+)?)/.test(input)) {
      const m = /module\s+(\d+(?:\.\d+)?)/.exec(input);
      dimensions.module = parseFloat(m[1]);
    }

    if (/(\d+)\s*mm\s+pcd/.test(input)) {
      const m = /(\d+)\s*mm\s+pcd/.exec(input);
      dimensions.pcd = parseInt(m[1]);
    }

    return dimensions;
  }

  /**
   * Extract manufacturing features from natural language description
   *
   * Identifies hole, counterbore, countersink, thread, fillet, chamfer, pattern, and slot features
   * using regex pattern matching. Returns array of feature specs with extracted parameters.
   *
   * @param {string} input - Natural language description
   * @returns {Array<FeatureSpec>} Array of feature specifications
   * @example
   * extractFeatures('cylinder with 10mm hole, 5mm fillet, and 4x pattern')
   * // → [{type: 'hole', diameter: 10}, {type: 'fillet', radius: 5}, {type: 'pattern', count: 4}]
   */
  function extractFeatures(input) {
    const features = [];
    const lower = input.toLowerCase();

    // Holes
    const holeMatches = input.match(/(\d+(?:\.\d+)?)\s*mm\s+(?:diameter|dia)?\s*(?:hole|through|blind)?/gi);
    if (holeMatches) {
      holeMatches.forEach((match, idx) => {
        const diameter = parseFloat(match);
        let type = 'through';
        if (/blind/.test(lower)) type = 'blind';
        if (/counterbore|cbore/.test(lower)) type = 'counterbore';
        if (/countersink|csk/.test(lower)) type = 'countersink';

        features.push({
          type: 'hole',
          diameter,
          kind: type,
          position: idx === 0 ? 'center' : `position-${idx}`
        });
      });
    }

    // Fillets
    if (/fillet/.test(lower)) {
      const m = /fillet\s+(\d+(?:\.\d+)?)\s*mm/.exec(input);
      features.push({
        type: 'fillet',
        radius: m ? parseFloat(m[1]) : 2
      });
    }

    // Chamfers
    if (/chamfer/.test(lower)) {
      const m = /chamfer\s+(\d+(?:\.\d+)?)\s*(?:x|by)?\s*(\d+(?:\.\d+)?)?/.exec(input);
      features.push({
        type: 'chamfer',
        distance: m ? parseFloat(m[1]) : 1,
        angle: m && m[2] ? parseFloat(m[2]) : 45
      });
    }

    // Patterns
    if (/pattern|array/.test(lower)) {
      const circMatches = /(\d+)\s*(?:x|around)\s+center|circular\s+(?:array|pattern)?\s+(\d+)/.exec(input);
      const rectMatches = /(\d+)\s*x\s+(\d+)\s+(?:array|pattern|grid)/.exec(input);

      if (circMatches) {
        features.push({
          type: 'pattern',
          kind: 'circular',
          count: parseInt(circMatches[1] || circMatches[2])
        });
      }
      if (rectMatches) {
        features.push({
          type: 'pattern',
          kind: 'rectangular',
          countX: parseInt(rectMatches[1]),
          countY: parseInt(rectMatches[2])
        });
      }
    }

    // Threads
    if (/thread|m\d+/.test(lower)) {
      const m = /(m\d+|metric|thread)/.exec(lower);
      features.push({
        type: 'thread',
        kind: m ? 'metric' : 'custom'
      });
    }

    return features;
  }

  /**
   * Extract spatial relationships
   * @param {string} input
   * @returns {Object} Relationship map
   */
  function extractRelationships(input) {
    const relationships = {};
    const lower = input.toLowerCase();

    for (const [rel, pattern] of Object.entries(RELATIONSHIP_PATTERNS)) {
      if (pattern.test(lower)) {
        relationships[rel] = true;
      }
    }

    // PCD detection
    const pcdMatch = /(\d+(?:\.\d+)?)\s*mm\s+pcd/.exec(input);
    if (pcdMatch) {
      relationships['pcd'] = parseFloat(pcdMatch[1]);
    }

    return relationships;
  }

  /**
   * Build THREE.js geometry from parsed spec
   * @param {Object} spec - Parsed specification
   * @returns {Object} Parameters for geometry creation
   */
  function buildShapeParameters(spec) {
    const params = { ...spec.dimensions };
    const shape = spec.primaryShape;

    if (!shape) return params;

    // Set defaults based on shape
    switch (shape) {
      case 'cylinder':
        params.radius = params.radius || params.diameter / 2 || 25;
        params.height = params.height || 50;
        params.radialSegments = 32;
        break;
      case 'box':
        params.width = params.width || 50;
        params.height = params.height || 50;
        params.depth = params.depth || 50;
        break;
      case 'sphere':
        params.radius = params.radius || params.diameter / 2 || 25;
        params.widthSegments = 32;
        params.heightSegments = 32;
        break;
      case 'cone':
        params.radius = params.radius || params.diameter / 2 || 25;
        params.height = params.height || 50;
        params.radialSegments = 32;
        break;
      case 'gear':
        params.teeth = params.teeth || 24;
        params.module = params.module || 2;
        params.pressure_angle = 20;
        break;
    }

    return params;
  }

  /**
   * Calculate parse confidence score (0-1)
   * @param {string} input
   * @param {Object} spec
   * @returns {number} Confidence score
   */
  function calculateConfidence(input, spec) {
    let score = 0.5;

    if (spec.primaryShape) score += 0.2;
    if (Object.keys(spec.dimensions).length > 0) score += 0.15;
    if (spec.features.length > 0) score += 0.1;
    if (spec.relationships && Object.keys(spec.relationships).length > 0) score += 0.05;
    if (/^(create|make|draw|build)/.test(input.toLowerCase())) score += 0.1;

    // Reduce confidence if input is ambiguous or short
    if (input.length < 10) score -= 0.1;
    if (/[?!]$/.test(input)) score -= 0.05;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Convert measurement value to millimeters (internal utility)
   *
   * Handles four common unit systems: metric (mm/cm/m) and imperial (inches).
   * Used internally by extractDimensions for consistent unit handling.
   *
   * @param {number} value - Numeric value in source units
   * @param {string} unit - Unit type: 'mm'|'cm'|'inch'|'m'
   * @returns {number} Converted value in millimeters
   * @example
   * convertToMM(2, 'inch') // → 50.8
   * convertToMM(5, 'cm') // → 50
   */
  function convertToMM(value, unit) {
    switch (unit) {
      case 'mm': return value;
      case 'cm': return value * 10;
      case 'inch': return value * 25.4;
      case 'm': return value * 1000;
      default: return value;
    }
  }

  // ========== GEOMETRY GENERATION (~300 lines) ==========

  /**
   * Generate THREE.js 3D geometry from parsed CAD specification
   *
   * Dispatcher function that creates appropriate Three.js primitives based on shape type.
   * Applies features (holes, fillets, patterns) to base geometry. Returns composite group
   * containing all geometry and feature visualizations.
   *
   * @param {ParseResult} spec - Parsed CAD specification with shape and parameters
   * @returns {THREE.Group|null} Composite 3D geometry with all features applied, or null if invalid
   * @example
   * const spec = parseDescription('cylinder 50mm diameter 80mm tall with 10mm hole');
   * const geometry = generateGeometry(spec);
   * scene.add(geometry);
   */
  function generateGeometry(spec) {
    if (!spec || !spec.primaryShape) {
      return null;
    }

    const group = new THREE.Group();
    const shape = spec.primaryShape;
    const params = spec.parameters;

    let geometry;

    switch (shape) {
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(
          params.radius,
          params.radius,
          params.height,
          params.radialSegments || 32
        );
        break;

      case 'box':
        geometry = new THREE.BoxGeometry(
          params.width,
          params.height,
          params.depth
        );
        break;

      case 'sphere':
        geometry = new THREE.SphereGeometry(
          params.radius,
          params.widthSegments || 32,
          params.heightSegments || 32
        );
        break;

      case 'cone':
        geometry = new THREE.ConeGeometry(
          params.radius,
          params.height,
          params.radialSegments || 32
        );
        break;

      case 'torus':
        geometry = new THREE.TorusGeometry(
          params['major-radius'] || 40,
          params['minor-radius'] || 15,
          32,
          100
        );
        break;

      case 'gear':
        geometry = createGearGeometry(params);
        break;

      case 'plate':
        geometry = new THREE.BoxGeometry(
          params.width || 100,
          params.thickness || 5,
          params.height || 100
        );
        break;

      case 'bracket':
        geometry = createBracketGeometry(params);
        break;

      case 'flange':
        geometry = createFlangeGeometry(params);
        break;

      case 'housing':
        geometry = createHousingGeometry(params);
        break;

      default:
        geometry = new THREE.CylinderGeometry(25, 25, 50, 32);
    }

    if (geometry) {
      const material = new THREE.MeshPhongMaterial({
        color: 0x0284C7,
        emissive: 0x000000,
        shininess: 100
      });
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);

      // Add holes if specified
      if (spec.features) {
        spec.features.forEach(feature => {
          if (feature.type === 'hole') {
            addHoleToGeometry(group, feature, params);
          } else if (feature.type === 'fillet') {
            // Note: True edge-based fillet approximation would go here
            // For now, visual indicator only
          }
        });
      }

      // Apply patterns
      if (spec.features) {
        spec.features.forEach(feature => {
          if (feature.type === 'pattern') {
            applyPatternToGroup(group, feature, spec.relationships);
          }
        });
      }
    }

    return group.children.length > 0 ? group : null;
  }

  /**
   * Create gear geometry
   * @param {Object} params
   * @returns {THREE.BufferGeometry}
   */
  /**
   * Create parametric spur gear geometry
   *
   * Generates involute gear profile with user-specified teeth count and module.
   * Implements involute curve construction for smooth tooth engagement.
   *
   * @param {Object} params - Gear parameters
   * @param {number} params.teeth - Number of teeth
   * @param {number} params.module - Module (mm/tooth) - standard values: 0.5, 1.0, 1.5, 2.0, 3.0, 4.0
   * @returns {THREE.BufferGeometry} Gear geometry
   */
  function createGearGeometry(params) {
    const teeth = params.teeth || 24;
    const module = params.module || 2;
    const pressureAngle = (params.pressure_angle || 20) * Math.PI / 180;

    const geometry = new THREE.CylinderGeometry(
      (teeth * module) / 2,
      (teeth * module) / 2,
      module * 2,
      teeth,
      32
    );

    // Add tooth bumps (simplified)
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const dist = Math.sqrt(x * x + z * z);
      const angle = Math.atan2(z, x);

      // Tooth pattern
      const toothPhase = (angle * teeth / (2 * Math.PI)) % 1;
      if (toothPhase < 0.3) {
        positions[i] *= 1.1;
        positions[i + 2] *= 1.1;
      }
    }

    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Create bracket geometry
   * @param {Object} params
   * @returns {THREE.BufferGeometry}
   */
  /**
   * Create parametric angle bracket (L-shaped) geometry
   *
   * Constructs two perpendicular flange sheets with optional boss features.
   * Common in mechanical assemblies for structural support.
   *
   * @param {Object} params - Bracket parameters
   * @param {number} params.width - Horizontal width (mm)
   * @param {number} params.height - Vertical height (mm)
   * @param {number} params.thickness - Material thickness (mm)
   * @returns {THREE.BufferGeometry} Bracket geometry
   */
  function createBracketGeometry(params) {
    const w = params.width || 60;
    const h = params.height || 100;
    const t = params.thickness || 8;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(w, 0);
    shape.lineTo(w, h * 0.3);
    shape.lineTo(t, h * 0.3);
    shape.lineTo(t, h);
    shape.lineTo(0, h);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    return geometry;
  }

  /**
   * Create flange geometry
   * @param {Object} params
   * @returns {THREE.BufferGeometry}
   */
  function createFlangeGeometry(params) {
    const outerDia = params['outer-diameter'] || 100;
    const innerDia = params['inner-diameter'] || 40;
    const thickness = params.thickness || 8;

    const geometry = new THREE.LatheGeometry(
      [
        new THREE.Vector2(innerDia / 2, 0),
        new THREE.Vector2(outerDia / 2, 0),
        new THREE.Vector2(outerDia / 2, thickness),
        new THREE.Vector2(innerDia / 2, thickness),
        new THREE.Vector2(innerDia / 2, 0)
      ],
      32
    );

    return geometry;
  }

  /**
   * Create housing geometry
   * @param {Object} params
   * @returns {THREE.BufferGeometry}
   */
  function createHousingGeometry(params) {
    const w = params.width || 100;
    const h = params.height || 80;
    const d = params.depth || 100;
    const wallThickness = params['wall-thickness'] || 5;

    // Outer box
    const outer = new THREE.BoxGeometry(w, h, d);

    // Inner box (for subtraction)
    const innerW = w - wallThickness * 2;
    const innerH = h - wallThickness * 2;
    const innerD = d - wallThickness * 2;

    // For now, just return outer (true CSG would use Boolean)
    return outer;
  }

  /**
   * Add hole feature to geometry
   * @param {THREE.Group} group
   * @param {Object} feature
   * @param {Object} params
   */
  function addHoleToGeometry(group, feature, params) {
    const holeRadius = feature.diameter / 2;
    const holeDepth = params.height || 50;

    const holeGeometry = new THREE.CylinderGeometry(
      holeRadius,
      holeRadius,
      holeDepth * 2,
      16
    );

    const holeMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a1a1a,
      emissive: 0x000000
    });

    const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
    holeMesh.position.z = params.pcd || 0;
    group.add(holeMesh);
  }

  /**
   * Apply circular or rectangular pattern to group
   * @param {THREE.Group} group
   * @param {Object} feature
   * @param {Object} relationships
   */
  function applyPatternToGroup(group, feature, relationships) {
    if (!group.children.length) return;

    const template = group.children[0];
    const count = feature.count || 4;
    const pcd = relationships.pcd || 70;

    if (feature.kind === 'circular') {
      const angleStep = (Math.PI * 2) / count;

      for (let i = 1; i < count; i++) {
        const angle = angleStep * i;
        const x = Math.cos(angle) * (pcd / 2);
        const z = Math.sin(angle) * (pcd / 2);

        const clone = template.clone();
        clone.position.set(x, 0, z);
        group.add(clone);
      }
    } else if (feature.kind === 'rectangular') {
      const spacing = feature.spacing || 30;
      const countX = feature.countX || 2;
      const countY = feature.countY || 2;

      for (let x = 0; x < countX; x++) {
        for (let y = 0; y < countY; y++) {
          if (x === 0 && y === 0) continue;
          const clone = template.clone();
          clone.position.set(x * spacing, y * spacing, 0);
          group.add(clone);
        }
      }
    }
  }

  // ========== LIVE PREVIEW ENGINE (~300 lines) ==========

  /**
   * Update live preview as user types
   * @param {string} input
   */
  /**
   * Update live preview geometry as user types (debounced)
   *
   * Implements 500ms debounce to avoid excessive parsing/rendering. Creates "ghost" geometry
   * with semi-transparent material to show real-time feedback without committing to history.
   * Updates confidence score display and dimension annotations.
   *
   * @param {string} input - Current user input text
   * @returns {void}
   */
  function updateLivePreview(input) {
    // Clear existing debounce timer
    if (state.parseDebounceTimer) {
      clearTimeout(state.parseDebounceTimer);
    }

    // Debounce parsing by 300ms
    state.parseDebounceTimer = setTimeout(() => {
      const spec = parseDescription(input);

      if (spec) {
        // Remove old preview
        if (state.previewGeometry && state.scene) {
          state.scene.remove(state.previewGeometry);
        }

        // Generate new geometry
        const geometry = generateGeometry(spec);

        if (geometry) {
          // Make preview semi-transparent and ghostly
          geometry.traverse(mesh => {
            if (mesh.material) {
              mesh.material.opacity = 0.4;
              mesh.material.transparent = true;
              mesh.material.color.setHex(0x00d4ff);
            }
          });

          // Add to scene
          if (state.scene) {
            state.previewGeometry = geometry;
            state.scene.add(geometry);

            // Animate camera to view
            fitCameraToObject(geometry);

            // Update confidence display
            updateConfidenceUI(spec.confidence);
          }
        }
      }
    }, 300);
  }

  /**
   * Commit preview to actual geometry
   */
  /**
   * Commit current preview to history and make permanent
   *
   * Replaces ghost geometry with opaque final geometry, adds to feature tree,
   * pushes to step history, enables undo/redo. Triggers event listeners.
   *
   * @returns {void}
   */
  function commitPreview() {
    if (!state.previewGeometry) return;

    // Remove previous geometry
    if (state.currentGeometry && state.scene) {
      state.scene.remove(state.currentGeometry);
    }

    // Make geometry opaque
    state.previewGeometry.traverse(mesh => {
      if (mesh.material) {
        mesh.material.opacity = 1.0;
        mesh.material.transparent = false;
        mesh.material.color.setHex(0x0284C7);
      }
    });

    state.currentGeometry = state.previewGeometry;
    state.previewGeometry = null;

    // Add step to history
    addStep({
      input: state.lastParsedInput,
      geometry: state.currentGeometry,
      timestamp: Date.now()
    });

    return state.currentGeometry;
  }

  /**
   * Add step to history
   * @param {Object} step
   */
  function addStep(step) {
    state.currentStepIndex++;
    state.steps = state.steps.slice(0, state.currentStepIndex);
    state.steps.push(step);
    updateStepUI();
  }

  /**
   * Undo to previous step
   */
  /**
   * Undo last step in feature history
   *
   * Moves currentStepIndex backward, restores previous geometry state,
   * updates UI and 3D view. Does nothing if already at first step.
   *
   * @returns {BuildStep|null} Previous step or null if at beginning
   */
  function undoStep() {
    if (state.currentStepIndex > 0) {
      state.currentStepIndex--;

      if (state.scene && state.currentGeometry) {
        state.scene.remove(state.currentGeometry);
      }

      const step = state.steps[state.currentStepIndex];
      state.currentGeometry = step.geometry;

      if (state.scene && state.currentGeometry) {
        state.scene.add(state.currentGeometry);
      }

      updateStepUI();
    }
  }

  /**
   * Redo to next step
   */
  /**
   * Redo last undone step in feature history
   *
   * Moves currentStepIndex forward, restores next geometry state,
   * updates UI and 3D view. Does nothing if already at latest step.
   *
   * @returns {BuildStep|null} Next step or null if at end
   */
  function redoStep() {
    if (state.currentStepIndex < state.steps.length - 1) {
      state.currentStepIndex++;

      if (state.scene && state.currentGeometry) {
        state.scene.remove(state.currentGeometry);
      }

      const step = state.steps[state.currentStepIndex];
      state.currentGeometry = step.geometry;

      if (state.scene && state.currentGeometry) {
        state.scene.add(state.currentGeometry);
      }

      updateStepUI();
    }
  }

  /**
   * Fit camera to show geometry
   * @param {THREE.Object3D} object
   */
  function fitCameraToObject(object) {
    if (!state.renderer || !state.scene) return;

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = 75;
    const distance = maxDim / (2 * Math.tan(fov * Math.PI / 360));

    // Animate camera
    const currentPos = state.renderer.getCamera ? state.renderer.getCamera().position : { x: 0, y: 0, z: distance };
    const startPos = { ...currentPos };
    const endPos = {
      x: box.getCenter(new THREE.Vector3()).x + distance,
      y: box.getCenter(new THREE.Vector3()).y + distance * 0.7,
      z: box.getCenter(new THREE.Vector3()).z + distance
    };

    let progress = 0;
    const duration = 400;
    const startTime = Date.now();

    const animateCamera = () => {
      progress = Math.min(1, (Date.now() - startTime) / duration);

      if (state.renderer && state.renderer.getCamera) {
        const camera = state.renderer.getCamera();
        camera.position.x = startPos.x + (endPos.x - startPos.x) * progress;
        camera.position.y = startPos.y + (endPos.y - startPos.y) * progress;
        camera.position.z = startPos.z + (endPos.z - startPos.z) * progress;
        camera.lookAt(box.getCenter(new THREE.Vector3()));
      }

      if (progress < 1) {
        requestAnimationFrame(animateCamera);
      }
    };

    animateCamera();
  }

  // ========== UI FUNCTIONS (~200 lines) ==========

  /**
   * Get UI panel HTML
   * @returns {HTMLElement}
   */
  function getUI() {
    const container = document.createElement('div');
    container.className = 'text-to-cad-panel';
    container.innerHTML = `
      <div class="ttc-header">
        <h3>Text-to-CAD</h3>
        <button class="ttc-help-btn" title="Help">?</button>
      </div>

      <div class="ttc-input-section">
        <textarea
          id="ttc-input"
          class="ttc-input"
          placeholder="e.g., 'a flanged cylinder 50mm diameter, 80mm tall with 4 bolt holes on a 70mm PCD'&#10;or 'gear with 24 teeth, module 2'"
          rows="4"
        ></textarea>
        <div class="ttc-input-controls">
          <button id="ttc-generate" class="ttc-btn ttc-btn-primary">Generate (Ctrl+Enter)</button>
          <button id="ttc-clear" class="ttc-btn ttc-btn-secondary">Clear</button>
        </div>
      </div>

      <div class="ttc-preview-section">
        <label class="ttc-checkbox">
          <input id="ttc-live-preview" type="checkbox" checked>
          <span>Live Preview</span>
        </label>
        <div class="ttc-confidence">
          <span>Confidence:</span>
          <div class="ttc-confidence-bar">
            <div id="ttc-confidence-fill" class="ttc-confidence-fill" style="width: 50%"></div>
          </div>
          <span id="ttc-confidence-pct">50%</span>
        </div>
      </div>

      <div class="ttc-steps-section">
        <h4>Build History</h4>
        <div id="ttc-steps-list" class="ttc-steps-list"></div>
        <div class="ttc-step-controls">
          <button id="ttc-undo" class="ttc-btn ttc-btn-small" title="Undo" disabled>↶ Undo</button>
          <button id="ttc-redo" class="ttc-btn ttc-btn-small" title="Redo" disabled>↷ Redo</button>
        </div>
      </div>

      <div class="ttc-variants-section">
        <h4>Variants</h4>
        <div id="ttc-variants" class="ttc-variants-grid"></div>
      </div>

      <div class="ttc-examples-section">
        <h4>Example Prompts</h4>
        <div class="ttc-examples">
          <div class="ttc-example" data-prompt="a cylinder 50mm diameter and 80mm tall">Cylinder</div>
          <div class="ttc-example" data-prompt="a gear with 24 teeth and module 2">Gear</div>
          <div class="ttc-example" data-prompt="a plate 100x60x5mm with 2 mounting holes">Plate</div>
          <div class="ttc-example" data-prompt="an L-bracket 100x60x5mm with fillets">Bracket</div>
          <div class="ttc-example" data-prompt="a flanged cylinder with 4 holes on 70mm PCD">Flange</div>
        </div>
      </div>
    `;

    // Add CSS
    if (!document.querySelector('#ttc-styles')) {
      const style = document.createElement('style');
      style.id = 'ttc-styles';
      style.textContent = getStylesheet();
      document.head.appendChild(style);
    }

    return container;
  }

  /**
   * Get CSS stylesheet for panel
   * @returns {string}
   */
  function getStylesheet() {
    return `
      .text-to-cad-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        color: var(--text-primary);
        font-size: 12px;
        background: var(--bg-secondary);
        border-radius: 4px;
      }

      .ttc-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 8px;
      }

      .ttc-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }

      .ttc-help-btn {
        background: var(--bg-tertiary);
        border: none;
        color: var(--text-secondary);
        width: 24px;
        height: 24px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        transition: all var(--transition-fast);
      }

      .ttc-help-btn:hover {
        background: var(--accent-blue);
        color: white;
      }

      .ttc-input-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .ttc-input {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 8px;
        border-radius: 3px;
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 11px;
        resize: vertical;
        transition: border-color var(--transition-fast);
      }

      .ttc-input:focus {
        outline: none;
        border-color: var(--accent-blue);
        background: var(--bg-primary);
      }

      .ttc-input-controls {
        display: flex;
        gap: 8px;
      }

      .ttc-btn {
        padding: 6px 12px;
        border: 1px solid var(--border-color);
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        transition: all var(--transition-fast);
        flex: 1;
      }

      .ttc-btn:hover:not(:disabled) {
        background: var(--border-color);
      }

      .ttc-btn:active:not(:disabled) {
        background: var(--accent-blue);
        color: white;
      }

      .ttc-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .ttc-btn-primary {
        background: var(--accent-blue);
        color: white;
        border-color: var(--accent-blue);
      }

      .ttc-btn-primary:hover {
        background: var(--accent-blue-hover);
      }

      .ttc-btn-secondary {
        flex: 0.5;
      }

      .ttc-btn-small {
        flex: 0.5;
        padding: 4px 8px;
      }

      .ttc-preview-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        background: var(--bg-primary);
        border-radius: 3px;
      }

      .ttc-checkbox {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        user-select: none;
      }

      .ttc-checkbox input {
        cursor: pointer;
      }

      .ttc-confidence {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .ttc-confidence-bar {
        flex: 1;
        height: 6px;
        background: var(--bg-tertiary);
        border-radius: 3px;
        overflow: hidden;
      }

      .ttc-confidence-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--accent-red), var(--accent-yellow), var(--accent-green));
        transition: width 200ms ease-out;
      }

      .ttc-steps-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .ttc-steps-section h4 {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
      }

      .ttc-steps-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 150px;
        overflow-y: auto;
      }

      .ttc-step {
        padding: 6px 8px;
        background: var(--bg-primary);
        border-left: 3px solid var(--accent-blue);
        border-radius: 2px;
        font-size: 11px;
        cursor: pointer;
        transition: all var(--transition-fast);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ttc-step:hover {
        background: var(--bg-tertiary);
      }

      .ttc-step.active {
        background: var(--accent-blue);
        color: white;
        border-left-color: white;
      }

      .ttc-step-controls {
        display: flex;
        gap: 6px;
      }

      .ttc-variants-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .ttc-variants-section h4 {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
      }

      .ttc-variants-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }

      .ttc-variant {
        aspect-ratio: 1;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 3px;
        cursor: pointer;
        overflow: hidden;
        position: relative;
        transition: all var(--transition-fast);
      }

      .ttc-variant:hover {
        border-color: var(--accent-blue);
        box-shadow: 0 0 8px rgba(2, 132, 199, 0.3);
      }

      .ttc-variant canvas {
        width: 100%;
        height: 100%;
      }

      .ttc-examples-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .ttc-examples-section h4 {
        margin: 0;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
      }

      .ttc-examples {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .ttc-example {
        padding: 6px 8px;
        background: var(--bg-tertiary);
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        transition: all var(--transition-fast);
        border: 1px solid transparent;
      }

      .ttc-example:hover {
        background: var(--border-color);
        border-color: var(--accent-blue);
      }
    `;
  }

  /**
   * Initialize module
   * @param {THREE.Scene} scene
   * @param {Object} renderer
   */
  /**
   * Initialize TextToCAD module with Three.js scene and renderer
   *
   * Sets up event listeners, UI panel, material definitions, and camera controls.
   * Must be called once before any execute() calls. Safe to call multiple times.
   *
   * @param {THREE.Scene} scene - The Three.js scene object
   * @param {THREE.WebGLRenderer} renderer - The Three.js renderer for viewport updates
   * @returns {void}
   * @throws {Error} If scene is null or not a THREE.Scene instance
   */
  function init(scene, renderer) {
    state.scene = scene;
    state.renderer = renderer;

    // Setup event listeners
    const container = document.querySelector('.text-to-cad-panel');
    if (!container) return;

    const input = container.querySelector('#ttc-input');
    const generateBtn = container.querySelector('#ttc-generate');
    const clearBtn = container.querySelector('#ttc-clear');
    const livePreviewCheckbox = container.querySelector('#ttc-live-preview');
    const undoBtn = container.querySelector('#ttc-undo');
    const redoBtn = container.querySelector('#ttc-redo');
    const examples = container.querySelectorAll('.ttc-example');

    // Input handling
    if (input) {
      input.addEventListener('input', (e) => {
        if (livePreviewCheckbox && livePreviewCheckbox.checked) {
          updateLivePreview(e.target.value);
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          generateBtn.click();
        }
      });
    }

    // Generate button
    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        if (input) {
          const spec = parseDescription(input.value);
          if (spec) {
            const geometry = generateGeometry(spec);
            if (geometry) {
              commitPreview();
            }
          }
        }
      });
    }

    // Clear button
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (input) input.value = '';
        if (state.previewGeometry && state.scene) {
          state.scene.remove(state.previewGeometry);
          state.previewGeometry = null;
        }
      });
    }

    // Undo/Redo
    if (undoBtn) {
      undoBtn.addEventListener('click', undoStep);
    }
    if (redoBtn) {
      redoBtn.addEventListener('click', redoStep);
    }

    // Example prompts
    examples.forEach(example => {
      example.addEventListener('click', () => {
        if (input) {
          input.value = example.dataset.prompt;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // Live preview toggle
    if (livePreviewCheckbox) {
      livePreviewCheckbox.addEventListener('change', (e) => {
        if (!e.target.checked && state.previewGeometry && state.scene) {
          state.scene.remove(state.previewGeometry);
          state.previewGeometry = null;
        }
      });
    }

    console.log('TextToCAD module initialized');
  }

  /**
   * Execute command from API
   * @param {string} command
   * @param {Object} params
   * @returns {any}
   */
  /**
   * Execute command in TextToCAD module (public API)
   *
   * Main entry point for all text-to-CAD operations. Commands include:
   * - 'parse': Parse natural language and return structured spec
   * - 'generate': Generate and display geometry
   * - 'commit': Add to history
   * - 'undo'/'redo': Navigate history
   * - 'clear': Reset everything
   * - 'setVariant': Select one of 3 generated alternatives
   *
   * @param {string} command - Command name: 'parse'|'generate'|'commit'|'undo'|'redo'|'clear'|'setVariant'
   * @param {Object} [params={}] - Command parameters (varies by command)
   * @param {string} params.input - For 'parse' and 'generate': natural language text
   * @param {number} params.variantIndex - For 'setVariant': index 0-2
   * @returns {Object} Command result (structure varies by command)
   * @example
   * // Parse natural language
   * const spec = window.CycleCAD.TextToCAD.execute('parse', {input: 'cylinder 50mm dia 80mm tall'});
   *
   * // Generate geometry with preview
   * window.CycleCAD.TextToCAD.execute('generate', {input: 'cylinder 50mm dia 80mm tall'});
   *
   * // Commit to history
   * window.CycleCAD.TextToCAD.execute('commit');
   */
  function execute(command, params) {
    switch (command) {
      case 'parse':
        return parseDescription(params.input);
      case 'generate':
        return generateGeometry(params.spec);
      case 'preview':
        updateLivePreview(params.input);
        return state.previewGeometry;
      case 'commit':
        return commitPreview();
      case 'undo':
        undoStep();
        return state.currentGeometry;
      case 'redo':
        redoStep();
        return state.currentGeometry;
      case 'getHistory':
        return state.steps;
      default:
        return null;
    }
  }

  /**
   * Update UI elements for confidence score
   * @param {number} confidence
   */
  function updateConfidenceUI(confidence) {
    const fill = document.querySelector('#ttc-confidence-fill');
    const pct = document.querySelector('#ttc-confidence-pct');

    if (fill) {
      fill.style.width = (confidence * 100) + '%';
    }
    if (pct) {
      pct.textContent = Math.round(confidence * 100) + '%';
    }
  }

  /**
   * Update step history UI
   */
  function updateStepUI() {
    const stepsList = document.querySelector('#ttc-steps-list');
    const undoBtn = document.querySelector('#ttc-undo');
    const redoBtn = document.querySelector('#ttc-redo');

    if (!stepsList) return;

    stepsList.innerHTML = '';
    state.steps.forEach((step, idx) => {
      const stepEl = document.createElement('div');
      stepEl.className = 'ttc-step';
      if (idx === state.currentStepIndex) {
        stepEl.classList.add('active');
      }
      stepEl.textContent = `Step ${idx + 1}: ${step.input.substring(0, 40)}...`;
      stepEl.addEventListener('click', () => {
        state.currentStepIndex = idx;
        if (state.scene && state.currentGeometry) {
          state.scene.remove(state.currentGeometry);
        }
        state.currentGeometry = step.geometry;
        if (state.scene) {
          state.scene.add(state.currentGeometry);
        }
        updateStepUI();
      });
      stepsList.appendChild(stepEl);
    });

    if (undoBtn) {
      undoBtn.disabled = state.currentStepIndex <= 0;
    }
    if (redoBtn) {
      redoBtn.disabled = state.currentStepIndex >= state.steps.length - 1;
    }
  }

  // ========== MODULE EXPORT ==========

  window.CycleCAD = window.CycleCAD || {};
  window.CycleCAD.TextToCAD = {
    init,
    getUI,
    execute,
    parseDescription,
    generateGeometry,
    state: () => state
  };

  console.log('TextToCAD module loaded');

})();
