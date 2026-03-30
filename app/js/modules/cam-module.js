/**
 * @file cam-module.js
 * @description CAM (Computer-Aided Manufacturing) Module.
 *   Generates toolpaths for CNC milling, turning, and 3D printing.
 *   Includes tool library, G-code generation, and toolpath simulation.
 *
 * @version 1.0.0
 * @author Sachin Kumar <vvlars@googlemail.com>
 * @license MIT
 * @module cam
 * @requires viewport, operations
 */

'use strict';

/**
 * CAM (Computer-Aided Manufacturing) Module
 * Handles toolpath generation, G-code output, and manufacturing simulation.
 */
const CAMModule = (() => {
  const MODULE_NAME = 'cam';
  let viewport = null;
  let scene = null;
  let ui = null;

  // Tool library with standard tools
  const defaultToolLibrary = {
    'flat-endmill-6mm': {
      id: 'flat-endmill-6mm',
      name: 'Flat End Mill 6mm',
      type: 'flat',
      diameter: 6,
      fluteLength: 20,
      overallLength: 50,
      material: 'carbide',
      coating: 'TiN',
      rpm: 12000,
      feed: 1200,
      chipLoad: 0.1,
      cost: 15.50,
    },
    'ball-endmill-3mm': {
      id: 'ball-endmill-3mm',
      name: 'Ball End Mill 3mm',
      type: 'ball',
      diameter: 3,
      fluteLength: 15,
      overallLength: 45,
      material: 'carbide',
      coating: 'TiN',
      rpm: 18000,
      feed: 800,
      chipLoad: 0.08,
      cost: 12.75,
    },
    'drill-5mm': {
      id: 'drill-5mm',
      name: 'Drill 5mm',
      type: 'drill',
      diameter: 5,
      pointAngle: 118,
      fluteLength: 30,
      overallLength: 70,
      material: 'HSS',
      rpm: 3000,
      feed: 200,
      chipLoad: 0.15,
      cost: 2.50,
    },
    'face-mill-50mm': {
      id: 'face-mill-50mm',
      name: 'Face Mill 50mm',
      type: 'face',
      diameter: 50,
      inserts: 5,
      material: 'carbide',
      rpm: 4000,
      feed: 2000,
      chipLoad: 0.2,
      cost: 85.00,
    },
    'slot-drills-4mm': {
      id: 'slot-drills-4mm',
      name: 'Slot Drill 4mm',
      type: 'slot',
      diameter: 4,
      fluteLength: 12,
      overallLength: 40,
      material: 'carbide',
      rpm: 15000,
      feed: 900,
      chipLoad: 0.12,
      cost: 11.25,
    },
    'chamfer-90deg': {
      id: 'chamfer-90deg',
      name: 'Chamfer 90°',
      type: 'chamfer',
      diameter: 10,
      angle: 90,
      material: 'carbide',
      rpm: 8000,
      feed: 600,
      cost: 18.50,
    },
  };

  // CAM state
  const camState = {
    workCoordinateSystem: null,
    stock: null,
    selectedTool: null,
    toolLibrary: new Map(Object.entries(defaultToolLibrary)),
    toolpaths: new Map(),
    gcode: null,
    setupParams: {
      feedUnits: 'inch/min', // inch/min | mm/min
      rapidRate: 5000,
      safeHeight: 5,
      retractHeight: 10,
      spindleDirection: 'cw', // cw | ccw
    },
  };

  const toolpathCounter = { count: 0 };

  /**
   * Initialize the CAM Module
   * @param {Object} deps - Dependencies { viewport, scene }
   */
  function init(deps) {
    viewport = deps.viewport;
    scene = deps.scene;
    registerCommands();
    window.addEventListener('keydown', handleKeyboard);
  }

  /**
   * Define work coordinate system and stock
   * @param {Object} params
   * @param {string} params.stockType - 'box' | 'cylinder' | 'from_model'
   * @param {Object} params.dimensions - { x, y, z } or { diameter, height }
   * @param {THREE.Vector3} params.origin - WCS origin
   * @param {THREE.Vector3} params.zDir - Z axis (spindle) direction
   * @returns {Object} Setup result
   */
  function setupWorkCoordinateSystem(params = {}) {
    const {
      stockType = 'box',
      dimensions = { x: 100, y: 100, z: 50 },
      origin = new THREE.Vector3(0, 0, 0),
      zDir = new THREE.Vector3(0, 0, 1),
    } = params;

    // Create WCS frame
    camState.workCoordinateSystem = {
      origin: origin.clone(),
      zDir: zDir.normalize(),
      xDir: new THREE.Vector3(1, 0, 0),
      yDir: new THREE.Vector3(0, 1, 0),
      type: stockType,
      dimensions,
    };

    // Create stock visualization
    const stockGeom = createStockGeometry(stockType, dimensions);
    const stockMat = new THREE.MeshPhongMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.2,
      wireframe: true,
    });
    const stockMesh = new THREE.Mesh(stockGeom, stockMat);
    stockMesh.position.copy(origin);
    stockMesh.name = 'stock_visualization';

    camState.stock = stockMesh;
    if (viewport?.scene) {
      viewport.scene.add(stockMesh);
    }

    console.log('[CAM] WCS setup:', camState.workCoordinateSystem);
    window.dispatchEvent(new CustomEvent('cam:setupComplete', { detail: camState.workCoordinateSystem }));

    return { status: 'ok', wcs: camState.workCoordinateSystem };
  }

  /**
   * Generate 2D contour (profile) toolpath
   * @param {Object} params
   * @param {THREE.Vector3[]} params.profile - Profile points (closed loop)
   * @param {number} params.depth - Cut depth
   * @param {string} params.toolId - Tool ID
   * @param {string} params.type - 'inside' | 'outside' | 'on'
   * @param {number} params.stepDown - Depth per pass
   * @returns {Object} Toolpath object
   */
  function generateContour2D(params = {}) {
    const {
      profile = [],
      depth = 10,
      toolId = 'flat-endmill-6mm',
      type = 'outside',
      stepDown = 5,
    } = params;

    const tool = camState.toolLibrary.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    const id = `tp_contour2d_${toolpathCounter.count++}`;

    // Generate passes
    const passes = [];
    const depthPasses = Math.ceil(depth / stepDown);

    for (let pass = 0; pass < depthPasses; pass++) {
      const currentDepth = Math.min((pass + 1) * stepDown, depth);
      passes.push({
        depth: currentDepth,
        points: offsetProfile(profile, type === 'inside' ? -tool.diameter / 2 : tool.diameter / 2),
      });
    }

    const toolpath = {
      id,
      type: 'contour_2d',
      tool,
      profile,
      depth,
      stepDown,
      passes,
      estimatedTime: calculateEstimatedTime(profile, passes, tool),
      status: 'generated',
    };

    camState.toolpaths.set(id, toolpath);

    // Visualize toolpath
    visualizeToolpath(toolpath);

    console.log('[CAM] Contour 2D generated:', { id, passes: passes.length, depth });
    window.dispatchEvent(new CustomEvent('cam:toolpathGenerated', { detail: toolpath }));

    return { id, type: 'contour_2d', passes: passes.length, estimatedTime: toolpath.estimatedTime };
  }

  /**
   * Generate pocket (enclosed region clear) toolpath
   * @param {Object} params
   * @param {THREE.Vector3[]} params.region - Region boundary
   * @param {number} params.depth - Pocket depth
   * @param {string} params.toolId - Tool ID
   * @param {number} params.stepDown - Depth per pass
   * @param {number} params.stepOver - Horizontal feed per pass
   * @returns {Object} Toolpath object
   */
  function generatePocket(params = {}) {
    const {
      region = [],
      depth = 10,
      toolId = 'flat-endmill-6mm',
      stepDown = 5,
      stepOver = 3,
    } = params;

    const tool = camState.toolLibrary.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    const id = `tp_pocket_${toolpathCounter.count++}`;

    // Generate spiral/raster pattern
    const passes = [];
    const depthPasses = Math.ceil(depth / stepDown);

    for (let dPass = 0; dPass < depthPasses; dPass++) {
      const currentDepth = Math.min((dPass + 1) * stepDown, depth);
      const spiralLines = generateSpiralPattern(region, stepOver);
      passes.push({
        depth: currentDepth,
        lines: spiralLines,
      });
    }

    const toolpath = {
      id,
      type: 'pocket',
      tool,
      region,
      depth,
      stepDown,
      stepOver,
      passes,
      estimatedTime: calculateEstimatedTime(region, passes, tool),
      status: 'generated',
    };

    camState.toolpaths.set(id, toolpath);
    visualizeToolpath(toolpath);

    console.log('[CAM] Pocket generated:', { id, passes: passes.length });
    window.dispatchEvent(new CustomEvent('cam:toolpathGenerated', { detail: toolpath }));

    return { id, type: 'pocket', passes: passes.length, estimatedTime: toolpath.estimatedTime };
  }

  /**
   * Generate drilling toolpath
   * @param {Object} params
   * @param {THREE.Vector3[]} params.points - Drill points
   * @param {number} params.depth - Drill depth
   * @param {string} params.toolId - Tool ID
   * @param {string} params.cycle - 'peck' | 'standard' | 'chip_break'
   * @param {number} params.peckDepth - Peck depth for peck drilling
   * @returns {Object} Toolpath object
   */
  function generateDrilling(params = {}) {
    const {
      points = [],
      depth = 10,
      toolId = 'drill-5mm',
      cycle = 'peck',
      peckDepth = 5,
    } = params;

    const tool = camState.toolLibrary.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    const id = `tp_drill_${toolpathCounter.count++}`;

    // Generate peck pattern if requested
    let drillSequence = points;
    if (cycle === 'peck') {
      drillSequence = points.flatMap(pt => ({
        point: pt,
        pecks: Math.ceil(depth / peckDepth),
        peckDepth,
      }));
    }

    const toolpath = {
      id,
      type: 'drilling',
      tool,
      points,
      depth,
      cycle,
      drillSequence,
      estimatedTime: calculateDrillingTime(points, depth, tool),
      status: 'generated',
    };

    camState.toolpaths.set(id, toolpath);
    visualizeToolpath(toolpath);

    console.log('[CAM] Drilling generated:', { id, points: points.length });
    window.dispatchEvent(new CustomEvent('cam:toolpathGenerated', { detail: toolpath }));

    return { id, type: 'drilling', points: points.length, estimatedTime: toolpath.estimatedTime };
  }

  /**
   * Generate face milling toolpath
   * @param {Object} params
   * @param {THREE.Vector3[]} params.region - Face region
   * @param {number} params.depth - Cut depth
   * @param {string} params.toolId - Tool ID
   * @param {number} params.stepOver - Feed per pass
   * @returns {Object} Toolpath object
   */
  function generateFace(params = {}) {
    const {
      region = [],
      depth = 2,
      toolId = 'face-mill-50mm',
      stepOver = 10,
    } = params;

    const tool = camState.toolLibrary.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    const id = `tp_face_${toolpathCounter.count++}`;

    // Generate raster pattern
    const passes = generateRasterPattern(region, stepOver);

    const toolpath = {
      id,
      type: 'face',
      tool,
      region,
      depth,
      stepOver,
      passes,
      estimatedTime: calculateEstimatedTime(region, passes, tool),
      status: 'generated',
    };

    camState.toolpaths.set(id, toolpath);
    visualizeToolpath(toolpath);

    console.log('[CAM] Face milling generated:', { id, passes: passes.length });
    window.dispatchEvent(new CustomEvent('cam:toolpathGenerated', { detail: toolpath }));

    return { id, type: 'face', passes: passes.length, estimatedTime: toolpath.estimatedTime };
  }

  /**
   * Generate adaptive clearing (high-speed roughing)
   * @param {Object} params
   * @param {THREE.Vector3[]} params.region - Region to clear
   * @param {number} params.depth - Clear depth
   * @param {string} params.toolId - Tool ID
   * @param {number} params.stepOver - Horizontal feed
   * @returns {Object} Toolpath object
   */
  function generateAdaptiveClearing(params = {}) {
    const {
      region = [],
      depth = 20,
      toolId = 'flat-endmill-6mm',
      stepOver = 4,
    } = params;

    const tool = camState.toolLibrary.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    const id = `tp_adaptive_${toolpathCounter.count++}`;

    // Adaptive clearing: constant chip load, variable engagement
    const passes = [];
    const depthPass = Math.min(tool.diameter * 0.75, depth); // engage to 75% dia
    const numPasses = Math.ceil(depth / depthPass);

    for (let i = 0; i < numPasses; i++) {
      const currentDepth = Math.min((i + 1) * depthPass, depth);
      passes.push({
        depth: currentDepth,
        pattern: generateAdaptivePattern(region, stepOver, currentDepth),
      });
    }

    const toolpath = {
      id,
      type: 'adaptive_clearing',
      tool,
      region,
      depth,
      stepOver,
      passes,
      estimatedTime: calculateEstimatedTime(region, passes, tool),
      status: 'generated',
    };

    camState.toolpaths.set(id, toolpath);
    visualizeToolpath(toolpath);

    console.log('[CAM] Adaptive clearing generated:', { id, passes: passes.length });
    window.dispatchEvent(new CustomEvent('cam:toolpathGenerated', { detail: toolpath }));

    return { id, type: 'adaptive_clearing', passes: passes.length, estimatedTime: toolpath.estimatedTime };
  }

  /**
   * Generate parallel finishing toolpath
   * @param {Object} params
   * @param {THREE.BufferGeometry} params.geometry - Surface geometry
   * @param {string} params.toolId - Tool ID
   * @param {number} params.stepOver - Horizontal step-over
   * @param {string} params.direction - 'x' | 'y' | 'diagonal'
   * @returns {Object} Toolpath object
   */
  function generateParallel(params = {}) {
    const {
      geometry = null,
      toolId = 'ball-endmill-3mm',
      stepOver = 2,
      direction = 'x',
    } = params;

    const tool = camState.toolLibrary.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);

    const id = `tp_parallel_${toolpathCounter.count++}`;

    const passes = generateParallelPasses(geometry, stepOver, direction);

    const toolpath = {
      id,
      type: 'parallel',
      tool,
      geometry,
      stepOver,
      direction,
      passes,
      estimatedTime: calculateEstimatedTime([], passes, tool),
      status: 'generated',
    };

    camState.toolpaths.set(id, toolpath);
    visualizeToolpath(toolpath);

    console.log('[CAM] Parallel finishing generated:', { id, passes: passes.length });
    window.dispatchEvent(new CustomEvent('cam:toolpathGenerated', { detail: toolpath }));

    return { id, type: 'parallel', passes: passes.length, estimatedTime: toolpath.estimatedTime };
  }

  /**
   * Generate FDM slicing (additive/3D printing)
   * @param {Object} params
   * @param {THREE.BufferGeometry} params.geometry - Part geometry
   * @param {number} params.layerHeight - Layer height
   * @param {number} params.nozzleWidth - Nozzle width
   * @param {string} params.infillPattern - 'grid' | 'honeycomb' | 'gyroid'
   * @param {number} params.infillDensity - 0-1 (0.2 = 20%)
   * @returns {Object} Sliced object
   */
  function generateFDMSlicing(params = {}) {
    const {
      geometry = null,
      layerHeight = 0.2,
      nozzleWidth = 0.4,
      infillPattern = 'grid',
      infillDensity = 0.2,
    } = params;

    const id = `fdm_${toolpathCounter.count++}`;

    // Compute bounding box
    const bbox = new THREE.Box3().setFromBufferGeometry(geometry);
    const height = bbox.max.z - bbox.min.z;
    const layerCount = Math.ceil(height / layerHeight);

    // Generate layers
    const layers = [];
    for (let i = 0; i < layerCount; i++) {
      const z = bbox.min.z + i * layerHeight;
      layers.push({
        z,
        index: i,
        perimeter: generatePerimeterPaths(geometry, z),
        infill: generateInfillPattern(geometry, z, infillPattern, infillDensity),
      });
    }

    const slicing = {
      id,
      type: 'fdm_slicing',
      geometry,
      layerHeight,
      nozzleWidth,
      infillPattern,
      infillDensity,
      layers,
      estimatedTime: layerCount * 2, // ~2min per layer estimate
      filamentLength: estimateFilamentLength(layers),
      filamentWeight: 0, // would need material density
    };

    camState.toolpaths.set(id, slicing);
    console.log('[CAM] FDM slicing generated:', { id, layers: layerCount });
    window.dispatchEvent(new CustomEvent('cam:toolpathGenerated', { detail: slicing }));

    return { id, type: 'fdm_slicing', layers: layerCount, estimatedTime: slicing.estimatedTime };
  }

  /**
   * Generate G-code from toolpath
   * @param {string} toolpathId - Toolpath ID
   * @param {string} dialect - 'fanuc' | 'linuxcnc' | 'grbl' | 'marlin'
   * @returns {string} G-code text
   */
  function generateGCode(toolpathId, dialect = 'grbl') {
    const toolpath = camState.toolpaths.get(toolpathId);
    if (!toolpath) throw new Error(`Toolpath ${toolpathId} not found`);

    let gcode = '';

    // Header
    gcode += '; Generated by cycleCAD CAM\n';
    gcode += `; Machine: ${dialect}\n`;
    gcode += `; Generated: ${new Date().toISOString()}\n`;
    gcode += `; Tool: ${toolpath.tool.name}\n`;
    gcode += `; Operation: ${toolpath.type}\n`;
    gcode += ';\n';

    // Unit setup
    if (dialect === 'grbl' || dialect === 'linuxcnc') {
      gcode += 'G90 G21\n'; // absolute, metric
    } else if (dialect === 'fanuc') {
      gcode += 'G90 G21\n'; // absolute, metric
    }

    // Spindle on
    gcode += `S${toolpath.tool.rpm} M3\n`;

    // Generate moves based on toolpath type
    if (toolpath.type === 'drilling') {
      gcode += generateDrillingGCode(toolpath, dialect);
    } else if (toolpath.type === 'contour_2d') {
      gcode += generateContourGCode(toolpath, dialect);
    } else if (toolpath.type === 'pocket' || toolpath.type === 'adaptive_clearing') {
      gcode += generatePocketGCode(toolpath, dialect);
    } else if (toolpath.type === 'face') {
      gcode += generateFaceGCode(toolpath, dialect);
    }

    // End
    gcode += '\nM5\n'; // Spindle off
    gcode += 'M30\n'; // Program end

    camState.gcode = gcode;

    console.log('[CAM] G-code generated:', { length: gcode.length, lines: gcode.split('\n').length - 1 });
    window.dispatchEvent(new CustomEvent('cam:gcodeGenerated', { detail: { gcode, length: gcode.length } }));

    return gcode;
  }

  /**
   * Simulate toolpath motion in 3D
   * @param {string} toolpathId - Toolpath ID
   * @param {number} speed - Playback speed (1.0 = real-time, 10 = 10x faster)
   * @returns {Object} Simulation controller
   */
  function simulateToolpath(toolpathId, speed = 1.0) {
    const toolpath = camState.toolpaths.get(toolpathId);
    if (!toolpath) throw new Error(`Toolpath ${toolpathId} not found`);

    const tool = toolpath.tool;
    const simulation = {
      toolpathId,
      isRunning: false,
      progress: 0,
      startTime: 0,
      totalTime: toolpath.estimatedTime * 1000 / speed,

      // Create tool mesh
      toolMesh: createToolMesh(tool),
    };

    if (viewport?.scene) {
      viewport.scene.add(simulation.toolMesh);
    }

    // Animate tool
    const animate = () => {
      if (!simulation.isRunning) return;

      const elapsed = Date.now() - simulation.startTime;
      simulation.progress = Math.min(elapsed / simulation.totalTime, 1.0);

      // Position tool along toolpath
      const pathPoints = extractPathPoints(toolpath);
      if (pathPoints.length > 0) {
        const pointIndex = Math.floor(simulation.progress * pathPoints.length);
        const point = pathPoints[Math.min(pointIndex, pathPoints.length - 1)];
        simulation.toolMesh.position.copy(point);
      }

      if (simulation.progress < 1.0) {
        requestAnimationFrame(animate);
      } else {
        simulation.isRunning = false;
        window.dispatchEvent(new CustomEvent('cam:simulationComplete', { detail: simulation }));
      }
    };

    return {
      start: () => {
        simulation.isRunning = true;
        simulation.startTime = Date.now();
        animate();
      },
      stop: () => {
        simulation.isRunning = false;
      },
      pause: () => {
        // In real implementation, would handle pause
      },
      getProgress: () => simulation.progress,
      getMesh: () => simulation.toolMesh,
    };
  }

  /**
   * Set active tool
   * @param {string} toolId - Tool ID from library
   */
  function setTool(toolId) {
    const tool = camState.toolLibrary.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} not found`);
    camState.selectedTool = tool;
    console.log('[CAM] Tool selected:', tool.name);
    return tool;
  }

  /**
   * Add custom tool to library
   * @param {Object} toolDef - Tool definition
   * @returns {Object} Added tool
   */
  function addTool(toolDef) {
    const id = toolDef.id || `custom_tool_${Date.now()}`;
    const tool = { id, ...toolDef };
    camState.toolLibrary.set(id, tool);
    console.log('[CAM] Tool added:', tool.name);
    return tool;
  }

  /**
   * List all tools in library
   */
  function listTools() {
    return Array.from(camState.toolLibrary.values());
  }

  /**
   * Export G-code to file
   * @param {string} filename - Filename
   * @param {string} content - G-code content
   */
  function exportGCode(filename, content) {
    const blob = new Blob([content || camState.gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'toolpath.nc';
    a.click();
    URL.revokeObjectURL(url);

    console.log('[CAM] G-code exported:', filename);
    window.dispatchEvent(new CustomEvent('cam:gcodeExported', { detail: { filename } }));
  }

  /**
   * List all toolpaths
   */
  function listToolpaths() {
    return Array.from(camState.toolpaths.entries()).map(([id, tp]) => ({
      id,
      type: tp.type,
      tool: tp.tool.name,
      estimatedTime: tp.estimatedTime,
      status: tp.status,
    }));
  }

  // --- Helper Functions ---

  function createStockGeometry(type, dimensions) {
    if (type === 'box') {
      return new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    } else if (type === 'cylinder') {
      return new THREE.CylinderGeometry(dimensions.diameter / 2, dimensions.diameter / 2, dimensions.height, 32);
    }
    return new THREE.BoxGeometry(100, 100, 50);
  }

  function offsetProfile(profile, offset) {
    // Simple offset (in real impl, use 2D offset library)
    return profile.map(pt => new THREE.Vector3(pt.x + offset, pt.y, pt.z));
  }

  function generateSpiralPattern(region, stepOver) {
    // Generate spiral toolpath
    const lines = [];
    for (let r = 0; r < 10; r += stepOver) {
      lines.push({ radius: r, points: [] });
    }
    return lines;
  }

  function generateRasterPattern(region, stepOver) {
    // Generate back-and-forth raster
    const passes = [];
    for (let x = 0; x < 100; x += stepOver) {
      passes.push({ x, path: [] });
    }
    return passes;
  }

  function generateAdaptivePattern(region, stepOver, depth) {
    // Adaptive cutting pattern with variable engagement
    return { pattern: 'adaptive', depth };
  }

  function generateParallelPasses(geometry, stepOver, direction) {
    const passes = [];
    for (let i = 0; i < 50; i += stepOver) {
      passes.push({ offset: i, path: [] });
    }
    return passes;
  }

  function generatePerimeterPaths(geometry, z) {
    // Generate perimeter toolpath at Z height
    return [];
  }

  function generateInfillPattern(geometry, z, pattern, density) {
    // Generate infill pattern (grid/honeycomb/gyroid)
    return [];
  }

  function estimateFilamentLength(layers) {
    // Estimate total filament length for FDM
    return layers.length * 10; // placeholder
  }

  function calculateEstimatedTime(region, passes, tool) {
    // Very rough time estimate
    const passLength = region.length || 50; // mm
    const speedMMMin = tool.feed || 1000;
    const totalDistance = passes.length * passLength;
    return (totalDistance / speedMMMin) * 60; // seconds
  }

  function calculateDrillingTime(points, depth, tool) {
    // Drilling time = (tool penetration rate) * depth * number of points
    const penetrationRate = 10; // mm/min
    return (points.length * depth / penetrationRate) * 60; // seconds
  }

  function extractPathPoints(toolpath) {
    // Extract all motion points from toolpath
    const points = [];
    if (toolpath.passes) {
      toolpath.passes.forEach(pass => {
        if (pass.points) points.push(...pass.points);
        if (pass.path) points.push(...pass.path);
      });
    }
    return points;
  }

  function createToolMesh(tool) {
    // Create 3D mesh representing the tool
    let geom;
    if (tool.type === 'ball') {
      geom = new THREE.SphereGeometry(tool.diameter / 2, 16, 16);
    } else if (tool.type === 'drill') {
      geom = new THREE.ConeGeometry(tool.diameter / 2, tool.diameter, 8);
    } else {
      geom = new THREE.CylinderGeometry(tool.diameter / 2, tool.diameter / 2, tool.fluteLength, 16);
    }
    const mat = new THREE.MeshPhongMaterial({ color: 0xffaa00 });
    return new THREE.Mesh(geom, mat);
  }

  function visualizeToolpath(toolpath) {
    // Draw toolpath as lines in viewport
    if (!viewport?.scene) return;

    const geometry = new THREE.BufferGeometry();
    const points = extractPathPoints(toolpath);
    if (points.length > 0) {
      geometry.setFromPoints(points);
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
      );
      line.name = `toolpath_${toolpath.id}`;
      viewport.scene.add(line);
    }
  }

  function generateDrillingGCode(toolpath, dialect) {
    let gcode = '';
    toolpath.drillSequence.forEach((drill, i) => {
      gcode += `G0 X${drill.point.x.toFixed(3)} Y${drill.point.y.toFixed(3)}\n`;
      gcode += `G0 Z${camState.setupParams.safeHeight}\n`;
      gcode += `G1 Z${-drill.depth} F${toolpath.tool.feed}\n`;
      if (toolpath.type.includes('peck') && drill.pecks > 1) {
        for (let p = 0; p < drill.pecks; p++) {
          gcode += `G0 Z${camState.setupParams.retractHeight}\n`;
          gcode += `G1 Z${-Math.min((p + 1) * drill.peckDepth, drill.depth)} F${toolpath.tool.feed}\n`;
        }
      }
      gcode += `G0 Z${camState.setupParams.safeHeight}\n`;
    });
    return gcode;
  }

  function generateContourGCode(toolpath, dialect) {
    let gcode = '';
    toolpath.passes.forEach((pass, i) => {
      gcode += `\n; Pass ${i + 1} - Depth ${pass.depth}\n`;
      pass.points.forEach(pt => {
        gcode += `G0 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)}\n`;
        gcode += `G1 Z${-pass.depth} F${toolpath.tool.feed}\n`;
      });
      gcode += `G0 Z${camState.setupParams.safeHeight}\n`;
    });
    return gcode;
  }

  function generatePocketGCode(toolpath, dialect) {
    let gcode = '';
    toolpath.passes.forEach((pass, i) => {
      gcode += `\n; Pass ${i + 1} - Depth ${pass.depth}\n`;
      if (pass.lines) {
        pass.lines.forEach(line => {
          gcode += `G1 X${line.x.toFixed(3)} Y${line.y.toFixed(3)} Z${-pass.depth} F${toolpath.tool.feed}\n`;
        });
      }
    });
    gcode += `G0 Z${camState.setupParams.safeHeight}\n`;
    return gcode;
  }

  function generateFaceGCode(toolpath, dialect) {
    let gcode = '';
    toolpath.passes.forEach((pass, i) => {
      gcode += `\n; Pass ${i + 1}\n`;
      gcode += `G0 X${pass.x} Y0\n`;
      gcode += `G1 Y100 F${toolpath.tool.feed}\n`;
      gcode += `G0 Y0\n`;
    });
    gcode += `G0 Z${camState.setupParams.safeHeight}\n`;
    return gcode;
  }

  // --- Command Registration ---

  function registerCommands() {
    const api = window.cycleCAD?.api || {};

    api.cam = {
      setup: setupWorkCoordinateSystem,
      contour2d: generateContour2D,
      pocket: generatePocket,
      drill: generateDrilling,
      face: generateFace,
      adaptive: generateAdaptiveClearing,
      parallel: generateParallel,
      slice: generateFDMSlicing,
      generateGCode,
      simulate: simulateToolpath,
      setTool,
      addTool,
      listTools,
      listToolpaths,
      exportGCode,
      getState: () => camState,
    };

    window.cycleCAD = window.cycleCAD || {};
    window.cycleCAD.api = api;
  }

  // --- Keyboard Shortcuts ---

  function handleKeyboard(evt) {
    if (evt.ctrlKey && evt.shiftKey && evt.key === 'M') {
      console.log('[CAM] Active toolpaths:', listToolpaths());
      evt.preventDefault();
    }
  }

  // --- UI Panel ---

  function getUI() {
    ui = document.createElement('div');
    ui.id = 'cam-panel';
    ui.className = 'module-panel';
    ui.innerHTML = `
      <div class="panel-header">
        <h3>CAM Setup & Toolpaths</h3>
        <button class="close-btn" data-close-panel="#cam-panel">×</button>
      </div>
      <div class="panel-body" style="max-height: 400px; overflow-y: auto;">
        <fieldset style="margin-bottom: 10px;">
          <legend>Work Setup</legend>
          <label>Stock Type:</label>
          <select id="cam-stock-type" style="margin-bottom: 5px;">
            <option value="box">Box</option>
            <option value="cylinder">Cylinder</option>
          </select>
          <button class="module-btn" data-cmd="cam.setup" style="width: 100%;">Define WCS</button>
        </fieldset>

        <fieldset style="margin-bottom: 10px;">
          <legend>2D Milling</legend>
          <div class="button-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
            <button class="module-btn" data-cmd="cam.contour2d">Contour 2D</button>
            <button class="module-btn" data-cmd="cam.pocket">Pocket</button>
            <button class="module-btn" data-cmd="cam.drill">Drill</button>
            <button class="module-btn" data-cmd="cam.face">Face</button>
          </div>
        </fieldset>

        <fieldset style="margin-bottom: 10px;">
          <legend>3D Milling</legend>
          <div class="button-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
            <button class="module-btn" data-cmd="cam.adaptive">Adaptive</button>
            <button class="module-btn" data-cmd="cam.parallel">Parallel</button>
          </div>
        </fieldset>

        <fieldset style="margin-bottom: 10px;">
          <legend>Additive</legend>
          <button class="module-btn" data-cmd="cam.slice" style="width: 100%;">FDM Slice</button>
        </fieldset>

        <fieldset style="margin-bottom: 10px;">
          <legend>Tool Library</legend>
          <select id="cam-tool-select" style="width: 100%; margin-bottom: 5px;">
            ${Array.from(defaultToolLibrary.values()).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
          <button class="module-btn" data-cmd="cam.setTool" style="width: 100%;">Select Tool</button>
        </fieldset>

        <fieldset style="margin-bottom: 10px;">
          <legend>Output</legend>
          <label>G-code Dialect:</label>
          <select id="cam-dialect" style="width: 100%; margin-bottom: 5px;">
            <option value="grbl">Grbl</option>
            <option value="linuxcnc">LinuxCNC</option>
            <option value="fanuc">Fanuc</option>
            <option value="marlin">Marlin (3D Printer)</option>
          </select>
          <button class="module-btn" data-cmd="cam.generateGCode" style="width: 100%; margin-bottom: 5px;">Generate G-code</button>
          <button class="module-btn" data-cmd="cam.exportGCode" style="width: 100%;">Export G-code</button>
        </fieldset>

        <div id="cam-toolpath-list" style="padding: 10px; border: 1px solid #ccc; border-radius: 4px; background: #f5f5f5;">
          <strong>Toolpaths:</strong>
          <ul id="cam-toolpath-items" style="list-style: none; padding: 0; margin: 5px 0; font-size: 12px;"></ul>
        </div>
      </div>
    `;

    // Wire up buttons
    ui.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [ns, cmd] = btn.dataset.cmd.split('.');
        console.log(`[CAM] Command: ${cmd}`);
      });
    });

    return ui;
  }

  return {
    MODULE_NAME,
    init,
    getUI,
    setupWorkCoordinateSystem,
    generateContour2D,
    generatePocket,
    generateDrilling,
    generateFace,
    generateAdaptiveClearing,
    generateParallel,
    generateFDMSlicing,
    generateGCode,
    simulateToolpath,
    setTool,
    addTool,
    listTools,
    listToolpaths,
    exportGCode,
  };
})();

export default CAMModule;
