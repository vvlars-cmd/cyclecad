/**
 * CAM Operations Engine for cycleCAD
 * Generates CNC toolpaths for drilling, milling, pocketing, tracing, and more.
 * IIFE pattern, registers on window.cycleCAD.camOps
 *
 * @author Sachin Kumar
 * @version 1.0
 */

(function() {
  'use strict';

  // ===== Material Presets =====
  const MATERIALS = {
    aluminum: { density: 2.7, hardness: 95, name: 'Aluminum 6061' },
    steel: { density: 7.85, hardness: 250, name: 'Steel (Mild)' },
    plastic: { density: 1.2, hardness: 60, name: 'ABS/Polycarbonate' },
    wood: { density: 0.6, hardness: 40, name: 'Hardwood (Oak)' },
    brass: { density: 8.4, hardness: 120, name: 'Brass' },
    copper: { density: 8.96, hardness: 110, name: 'Copper' },
    titanium: { density: 4.5, hardness: 350, name: 'Titanium 6061' },
    foam: { density: 0.05, hardness: 20, name: 'XPS Foam' },
    acrylic: { density: 1.19, hardness: 80, name: 'Cast Acrylic' },
    carbon_fiber: { density: 1.6, hardness: 200, name: 'Carbon Fiber' }
  };

  // ===== Tool Presets =====
  const TOOLS = {
    end_mill_2mm: { diameter: 2, flutes: 2, material: 'carbide', speedFactor: 1.0 },
    end_mill_4mm: { diameter: 4, flutes: 2, material: 'carbide', speedFactor: 0.8 },
    end_mill_6mm: { diameter: 6, flutes: 2, material: 'carbide', speedFactor: 0.6 },
    end_mill_8mm: { diameter: 8, flutes: 2, material: 'carbide', speedFactor: 0.4 },
    ball_nose_4mm: { diameter: 4, flutes: 2, material: 'carbide', type: 'ballnose', speedFactor: 0.7 },
    drill_3mm: { diameter: 3, flutes: 2, material: 'hss', type: 'drill', speedFactor: 0.8 },
    drill_5mm: { diameter: 5, flutes: 2, material: 'hss', type: 'drill', speedFactor: 0.6 },
    v_bit_2mm: { diameter: 2, angle: 90, material: 'carbide', type: 'vbit', speedFactor: 0.9 }
  };

  // ===== Feed & Speed Calculator =====
  function calculateFeeds(materialKey, toolKey) {
    const material = MATERIALS[materialKey] || MATERIALS.aluminum;
    const tool = TOOLS[toolKey] || TOOLS.end_mill_4mm;

    // Surface speed (SFM) based on material and tool
    let surfaceSpeed = 300; // default
    if (materialKey === 'aluminum') surfaceSpeed = 300;
    else if (materialKey === 'steel') surfaceSpeed = 80;
    else if (materialKey === 'plastic') surfaceSpeed = 200;
    else if (materialKey === 'wood') surfaceSpeed = 250;
    else if (materialKey === 'brass') surfaceSpeed = 200;
    else if (materialKey === 'copper') surfaceSpeed = 150;
    else if (materialKey === 'titanium') surfaceSpeed = 60;
    else if (materialKey === 'foam') surfaceSpeed = 500;
    else if (materialKey === 'acrylic') surfaceSpeed = 250;
    else if (materialKey === 'carbon_fiber') surfaceSpeed = 90;

    // Apply tool speed factor
    surfaceSpeed *= tool.speedFactor;

    // RPM = (SFM * 12) / (π * tool diameter in inches)
    const toolDiameterInches = tool.diameter / 25.4;
    const rpm = Math.round((surfaceSpeed * 12) / (Math.PI * toolDiameterInches));

    // Feed per tooth: 0.002" - 0.008" typical
    let feedPerTooth = 0.003; // default
    if (materialKey === 'aluminum') feedPerTooth = 0.005;
    else if (materialKey === 'steel') feedPerTooth = 0.002;
    else if (materialKey === 'plastic') feedPerTooth = 0.004;
    else if (materialKey === 'wood') feedPerTooth = 0.006;

    // Feed rate = RPM * number of flutes * feed per tooth
    const feedRate = rpm * tool.flutes * feedPerTooth;

    return {
      rpm: Math.max(500, Math.min(rpm, 24000)),
      feedRate: Math.round(feedRate * 100) / 100,
      material: material.name,
      tool: tool.material,
      surfaceSpeed: Math.round(surfaceSpeed)
    };
  }

  // ===== Collision Detection (Bounding Box) =====
  function checkCollision(toolpath, geometry) {
    if (!geometry || !geometry.bbox) return false;

    const { min, max } = geometry.bbox;
    const toolRadius = 2; // default 2mm tool

    for (let point of toolpath) {
      const px = point.x, py = point.y, pz = point.z;
      // Check if tool at this position intersects geometry bbox
      if (px + toolRadius > min.x && px - toolRadius < max.x &&
          py + toolRadius > min.y && py - toolRadius < max.y &&
          pz > min.z && pz < max.z) {
        return { collision: true, point: { x: px, y: py, z: pz } };
      }
    }
    return false;
  }

  // ===== Outline Operation =====
  function outline(geometry, params = {}) {
    const {
      toolDiameter = 4,
      offset = 0,
      passDepth = 5,
      feedRate = 150,
      type = 'external' // 'external' or 'internal'
    } = params;

    const toolpath = [];
    const toolRadius = toolDiameter / 2;
    const offsetDistance = type === 'external' ? (toolRadius + offset) : (offset - toolRadius);

    if (!geometry || !geometry.edges || geometry.edges.length === 0) {
      return { success: false, error: 'No edges found in geometry', toolpath: [] };
    }

    // Start from Z safe height
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    let currentZ = 0;
    const passes = Math.ceil(geometry.depth / passDepth);

    for (let pass = 0; pass < passes; pass++) {
      const z = -passDepth * (pass + 1);

      // Move to start of outline
      const firstEdge = geometry.edges[0];
      toolpath.push({
        x: firstEdge.start.x + offsetDistance,
        y: firstEdge.start.y + offsetDistance,
        z: 10,
        f: 0,
        type: 'G0'
      });

      // Rapid down to cutting depth
      toolpath.push({
        x: firstEdge.start.x + offsetDistance,
        y: firstEdge.start.y + offsetDistance,
        z: z,
        f: feedRate,
        type: 'G1'
      });

      // Trace edges with offset
      for (let edge of geometry.edges) {
        toolpath.push({
          x: edge.end.x + offsetDistance,
          y: edge.end.y + offsetDistance,
          z: z,
          f: feedRate,
          type: 'G1'
        });
      }

      // Return to start
      toolpath.push({
        x: firstEdge.start.x + offsetDistance,
        y: firstEdge.start.y + offsetDistance,
        z: z,
        f: feedRate,
        type: 'G1'
      });
    }

    // Retract
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { passes, totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Level Operation =====
  function level(geometry, params = {}) {
    const {
      toolDiameter = 6,
      targetDepth = -5,
      stepOver = 2,
      feedRate = 200
    } = params;

    const toolpath = [];
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    const { min, max } = geometry.bbox || { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
    const width = max.x - min.x;
    const height = max.y - min.y;

    // Generate raster pass (left-right sweep)
    for (let y = min.y; y < max.y; y += stepOver) {
      // Move to start of row
      toolpath.push({
        x: min.x,
        y: y,
        z: 10,
        f: 0,
        type: 'G0'
      });

      // Plunge to depth
      toolpath.push({
        x: min.x,
        y: y,
        z: targetDepth,
        f: feedRate,
        type: 'G1'
      });

      // Sweep across
      toolpath.push({
        x: max.x,
        y: y,
        z: targetDepth,
        f: feedRate,
        type: 'G1'
      });
    }

    // Retract
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { passes: Math.ceil(height / stepOver), totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Rough Operation =====
  function rough(geometry, params = {}) {
    const {
      toolDiameter = 6,
      maxDepth = -10,
      stepDown = 3,
      stepOver = 3,
      feedRate = 250,
      progressCallback = null
    } = params;

    const toolpath = [];
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    const { min, max } = geometry.bbox || { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };

    const passes = Math.ceil(Math.abs(maxDepth) / stepDown);

    for (let pass = 0; pass < passes; pass++) {
      const z = -stepDown * (pass + 1);

      // Raster pattern for this depth
      for (let y = min.y; y < max.y; y += stepOver) {
        toolpath.push({
          x: min.x,
          y: y,
          z: 10,
          f: 0,
          type: 'G0'
        });

        toolpath.push({
          x: min.x,
          y: y,
          z: z,
          f: feedRate,
          type: 'G1'
        });

        toolpath.push({
          x: max.x,
          y: y,
          z: z,
          f: feedRate,
          type: 'G1'
        });
      }

      if (progressCallback) progressCallback(Math.round((pass + 1) / passes * 100));
    }

    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { passes, totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Contour Operation =====
  function contour(geometry, params = {}) {
    const {
      toolDiameter = 4,
      targetDepth = -5,
      axis = 'XY', // 'XY', 'XZ', or 'YZ'
      feedRate = 180,
      stepCount = 20
    } = params;

    const toolpath = [];
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    if (axis === 'XY') {
      for (let i = 0; i < stepCount; i++) {
        const angle = (i / stepCount) * Math.PI * 2;
        const x = Math.cos(angle) * 30;
        const y = Math.sin(angle) * 30;

        toolpath.push({
          x: x,
          y: y,
          z: targetDepth,
          f: feedRate,
          type: i === 0 ? 'G0' : 'G1'
        });
      }
    }

    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { points: stepCount, totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Drill Operation =====
  function drill(geometry, params = {}) {
    const {
      holes = [], // array of {x, y, depth}
      peckDepth = 2,
      feedRate = 100,
      clearance = 2
    } = params;

    if (!holes || holes.length === 0) {
      return { success: false, error: 'No holes specified', toolpath: [] };
    }

    const toolpath = [];
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    for (let hole of holes) {
      const { x, y, depth } = hole;
      const pecks = Math.ceil(Math.abs(depth) / peckDepth);

      // Move to hole position
      toolpath.push({
        x: x,
        y: y,
        z: 10,
        f: 0,
        type: 'G0'
      });

      // Peck drill cycle
      for (let peck = 0; peck < pecks; peck++) {
        const z = Math.max(-Math.abs(depth), -peckDepth * (peck + 1));

        toolpath.push({
          x: x,
          y: y,
          z: z,
          f: feedRate,
          type: 'G1'
        });

        // Retract for chip clearance
        toolpath.push({
          x: x,
          y: y,
          z: clearance,
          f: feedRate * 2,
          type: 'G0'
        });
      }
    }

    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { holes: holes.length, totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Trace Operation =====
  function trace(geometry, params = {}) {
    const {
      loops = [], // array of closed curves
      offset = 0,
      depth = -5,
      passes = 1,
      feedRate = 150
    } = params;

    if (!loops || loops.length === 0) {
      return { success: false, error: 'No loops to trace', toolpath: [] };
    }

    const toolpath = [];
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    for (let passNum = 0; passNum < passes; passNum++) {
      const z = depth / passes * (passNum + 1);

      for (let loop of loops) {
        if (loop.points && loop.points.length > 0) {
          // Move to first point
          const start = loop.points[0];
          toolpath.push({
            x: start.x + offset,
            y: start.y + offset,
            z: 10,
            f: 0,
            type: 'G0'
          });

          // Plunge
          toolpath.push({
            x: start.x + offset,
            y: start.y + offset,
            z: z,
            f: feedRate,
            type: 'G1'
          });

          // Trace loop
          for (let point of loop.points) {
            toolpath.push({
              x: point.x + offset,
              y: point.y + offset,
              z: z,
              f: feedRate,
              type: 'G1'
            });
          }

          // Close loop
          toolpath.push({
            x: start.x + offset,
            y: start.y + offset,
            z: z,
            f: feedRate,
            type: 'G1'
          });
        }
      }
    }

    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { loops: loops.length, passes, totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Pocket Operation =====
  function pocket(geometry, params = {}) {
    const {
      toolDiameter = 4,
      depth = -5,
      pattern = 'zigzag', // 'zigzag', 'spiral', 'offset'
      stepOver = 2,
      feedRate = 180
    } = params;

    const toolpath = [];
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    const { min, max } = geometry.bbox || { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
    const width = max.x - min.x;
    const height = max.y - min.y;

    if (pattern === 'zigzag') {
      for (let y = min.y; y < max.y; y += stepOver) {
        toolpath.push({
          x: min.x,
          y: y,
          z: 10,
          f: 0,
          type: 'G0'
        });

        toolpath.push({
          x: min.x,
          y: y,
          z: depth,
          f: feedRate,
          type: 'G1'
        });

        toolpath.push({
          x: max.x,
          y: y,
          z: depth,
          f: feedRate,
          type: 'G1'
        });
      }
    } else if (pattern === 'spiral') {
      const centerX = (min.x + max.x) / 2;
      const centerY = (min.y + max.y) / 2;
      const maxRadius = Math.max(width, height) / 2;

      for (let r = stepOver; r < maxRadius; r += stepOver) {
        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          toolpath.push({
            x: x,
            y: y,
            z: depth,
            f: feedRate,
            type: angle === 0 ? 'G0' : 'G1'
          });
        }
      }
    }

    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { pattern, totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Register Operation (Alignment Holes) =====
  function register(geometry, params = {}) {
    const {
      holes = [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
        { x: 50, y: 90 }
      ],
      holeDiameter = 3,
      depth = -2,
      feedRate = 100
    } = params;

    const toolpath = [];
    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    for (let hole of holes) {
      toolpath.push({
        x: hole.x,
        y: hole.y,
        z: 10,
        f: 0,
        type: 'G0'
      });

      toolpath.push({
        x: hole.x,
        y: hole.y,
        z: depth,
        f: feedRate,
        type: 'G1'
      });
    }

    toolpath.push({ x: 0, y: 0, z: 10, f: 0, type: 'G0' });

    return {
      success: true,
      toolpath: toolpath,
      stats: { holes: holes.length, totalLength: estimateLength(toolpath) }
    };
  }

  // ===== Utility: Estimate Toolpath Length =====
  function estimateLength(toolpath) {
    let length = 0;
    for (let i = 1; i < toolpath.length; i++) {
      const p1 = toolpath[i - 1];
      const p2 = toolpath[i];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      length += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return Math.round(length * 100) / 100;
  }

  // ===== Sequence Operations =====
  function sequenceOperations(operations = []) {
    const sequence = [];
    const roughOps = operations.filter(op => op.type === 'rough');
    const finishOps = operations.filter(op => op.type !== 'rough');

    sequence.push(...roughOps);
    sequence.push(...finishOps);

    return sequence;
  }

  // ===== Public API =====
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.camOps = {
    // Materials and tools
    getMaterials: () => MATERIALS,
    getTools: () => TOOLS,
    calculateFeeds: calculateFeeds,

    // Operations
    outline: outline,
    level: level,
    rough: rough,
    contour: contour,
    drill: drill,
    trace: trace,
    pocket: pocket,
    register: register,

    // Utilities
    checkCollision: checkCollision,
    estimateLength: estimateLength,
    sequenceOperations: sequenceOperations,

    // Version
    version: '1.0'
  };

  console.log('[CAM Ops] Engine loaded. Available operations: outline, level, rough, contour, drill, trace, pocket, register');

})();
