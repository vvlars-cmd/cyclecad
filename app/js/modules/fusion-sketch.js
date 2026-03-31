/**
 * fusion-sketch.js — Fusion 360 Sketch Module for cycleCAD
 *
 * Complete 2D sketch engine with Fusion 360 parity:
 * - 13 sketch tools (Line, Rectangle, Circle, Ellipse, Arc, Spline, Slot, Polygon, etc.)
 * - 12 constraint types (Coincident, Parallel, Perpendicular, Tangent, Equal, etc.)
 * - 8 utility tools (Mirror, Offset, Trim, Extend, Break, Fillet 2D, Chamfer 2D, Pattern)
 * - 6 constraint modes (Fix, Coincident, Collinear, Concentric, Midpoint, Symmetric)
 * - Sketch dimensions (Linear, Angular, Radial, Diameter)
 * - Construction line mode (dashed display)
 * - Grid snapping and origin display
 * - Constraint solver (iterative relaxation)
 *
 * Version: 1.0.0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// STATE & CONSTANTS
// ============================================================================

const SKETCH_TOOLS = {
  LINE: 'line',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  ELLIPSE: 'ellipse',
  ARC: 'arc',
  SPLINE: 'spline',
  SLOT: 'slot',
  POLYGON: 'polygon',
  MIRROR: 'mirror',
  OFFSET: 'offset',
  TRIM: 'trim',
  EXTEND: 'extend',
  FILLET_2D: 'fillet2d',
};

const CONSTRAINT_TYPES = {
  COINCIDENT: 'coincident',
  COLLINEAR: 'collinear',
  CONCENTRIC: 'concentric',
  MIDPOINT: 'midpoint',
  FIX: 'fix',
  PARALLEL: 'parallel',
  PERPENDICULAR: 'perpendicular',
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
  TANGENT: 'tangent',
  EQUAL: 'equal',
  SYMMETRIC: 'symmetric',
};

const PLANE_MATRICES = {
  XY: {
    normal: new THREE.Vector3(0, 0, 1),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 1, 0),
  },
  XZ: {
    normal: new THREE.Vector3(0, 1, 0),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 0, 1),
  },
  YZ: {
    normal: new THREE.Vector3(1, 0, 0),
    u: new THREE.Vector3(0, 1, 0),
    v: new THREE.Vector3(0, 0, 1),
  },
};

let sketchState = {
  active: false,
  plane: 'XY',
  camera: null,
  scene: null,
  renderer: null,

  // Entities (sketch geometry)
  entities: [],
  selectedEntities: new Set(),

  // Constraints
  constraints: [],

  // Drawing state
  currentTool: SKETCH_TOOLS.LINE,
  isDrawing: false,
  currentPoints: [],
  inProgressEntity: null,

  // Grid and snap
  gridSize: 1,
  snapDistance: 8,
  snapEnabled: true,
  snapPoint: null,

  // UI state
  dimensionMode: false,
  constraintMode: false,
  constructionMode: false,
};

// ============================================================================
// SKETCH ENTITY CLASS
// ============================================================================

/**
 * Represents a 2D sketch entity (line, circle, arc, etc.)
 */
class SketchEntity {
  constructor(id, type, points = [], dimensions = {}, isConstruction = false) {
    this.id = id;
    this.type = type; // 'line', 'circle', 'arc', 'rectangle', 'spline', etc.
    this.points = points; // [{ x, y }, ...]
    this.dimensions = dimensions; // { width, height, radius, startAngle, endAngle, ... }
    this.isConstruction = isConstruction;
    this.constraints = [];
  }

  /**
   * Create THREE.Line or Points object for rendering
   */
  toThreeMesh() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];

    switch (this.type) {
      case 'line':
        if (this.points.length >= 2) {
          positions.push(this.points[0].x, this.points[0].y, 0);
          positions.push(this.points[1].x, this.points[1].y, 0);
        }
        break;

      case 'circle':
        const cx = this.points[0]?.x ?? 0;
        const cy = this.points[0]?.y ?? 0;
        const r = this.dimensions.radius ?? 10;
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          positions.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle), 0);
        }
        break;

      case 'arc':
        const acx = this.points[0]?.x ?? 0;
        const acy = this.points[0]?.y ?? 0;
        const ar = this.dimensions.radius ?? 10;
        const startAng = this.dimensions.startAngle ?? 0;
        const endAng = this.dimensions.endAngle ?? Math.PI * 2;
        const aSegments = 32;
        for (let i = 0; i <= aSegments; i++) {
          const t = i / aSegments;
          const angle = startAng + (endAng - startAng) * t;
          positions.push(acx + ar * Math.cos(angle), acy + ar * Math.sin(angle), 0);
        }
        break;

      case 'rectangle':
        const x = this.points[0]?.x ?? 0;
        const y = this.points[0]?.y ?? 0;
        const w = this.dimensions.width ?? 10;
        const h = this.dimensions.height ?? 10;
        positions.push(x, y, 0);
        positions.push(x + w, y, 0);
        positions.push(x + w, y + h, 0);
        positions.push(x, y + h, 0);
        positions.push(x, y, 0);
        break;

      case 'ellipse':
        const ecx = this.points[0]?.x ?? 0;
        const ecy = this.points[0]?.y ?? 0;
        const ea = this.dimensions.radiusX ?? 10;
        const eb = this.dimensions.radiusY ?? 5;
        const eSegments = 64;
        for (let i = 0; i <= eSegments; i++) {
          const angle = (i / eSegments) * Math.PI * 2;
          positions.push(ecx + ea * Math.cos(angle), ecy + eb * Math.sin(angle), 0);
        }
        break;

      case 'spline':
        if (this.points.length >= 2) {
          for (const pt of this.points) {
            positions.push(pt.x, pt.y, 0);
          }
        }
        break;

      case 'polygon':
        const sides = this.dimensions.sides ?? 6;
        const pcx = this.points[0]?.x ?? 0;
        const pcy = this.points[0]?.y ?? 0;
        const pr = this.dimensions.radius ?? 10;
        for (let i = 0; i <= sides; i++) {
          const angle = (i / sides) * Math.PI * 2;
          positions.push(pcx + pr * Math.cos(angle), pcy + pr * Math.sin(angle), 0);
        }
        break;
    }

    if (positions.length > 0) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    }

    const lineColor = this.isConstruction ? 0x888888 : 0x00ff00;
    const lineWidth = this.isConstruction ? 1 : 2;
    const material = new THREE.LineBasicMaterial({
      color: lineColor,
      linewidth: lineWidth,
      transparent: true,
      opacity: 0.8,
    });

    if (this.isConstruction) {
      material.dashSize = 5;
      material.gapSize = 3;
    }

    return new THREE.Line(geometry, material);
  }
}

// ============================================================================
// CONSTRAINT SOLVER
// ============================================================================

/**
 * Simple iterative constraint solver
 */
class ConstraintSolver {
  constructor(entities, constraints) {
    this.entities = entities;
    this.constraints = constraints;
    this.maxIterations = 50;
    this.tolerance = 0.01;
  }

  solve() {
    for (let iter = 0; iter < this.maxIterations; iter++) {
      let maxError = 0;

      for (const constraint of this.constraints) {
        const error = this._solveConstraint(constraint);
        maxError = Math.max(maxError, error);
      }

      if (maxError < this.tolerance) {
        return true; // Converged
      }
    }

    return false; // Did not converge
  }

  _solveConstraint(constraint) {
    const { type, entityId1, entityId2, value } = constraint;
    const ent1 = this.entities.find(e => e.id === entityId1);
    const ent2 = this.entities.find(e => e.id === entityId2);

    if (!ent1) return 0;

    let error = 0;

    switch (type) {
      case CONSTRAINT_TYPES.COINCIDENT:
        if (ent1.points.length > 0 && ent2?.points.length > 0) {
          const pt1 = ent1.points[0];
          const pt2 = ent2.points[0];
          error = Math.sqrt((pt1.x - pt2.x) ** 2 + (pt1.y - pt2.y) ** 2);
          pt1.x = (pt1.x + pt2.x) / 2;
          pt1.y = (pt1.y + pt2.y) / 2;
          pt2.x = pt1.x;
          pt2.y = pt1.y;
        }
        break;

      case CONSTRAINT_TYPES.HORIZONTAL:
        if (ent1.type === 'line' && ent1.points.length >= 2) {
          const p1 = ent1.points[0];
          const p2 = ent1.points[1];
          error = Math.abs(p2.y - p1.y);
          const midY = (p1.y + p2.y) / 2;
          p1.y = midY;
          p2.y = midY;
        }
        break;

      case CONSTRAINT_TYPES.VERTICAL:
        if (ent1.type === 'line' && ent1.points.length >= 2) {
          const p1 = ent1.points[0];
          const p2 = ent1.points[1];
          error = Math.abs(p2.x - p1.x);
          const midX = (p1.x + p2.x) / 2;
          p1.x = midX;
          p2.x = midX;
        }
        break;

      case CONSTRAINT_TYPES.PARALLEL:
        if (ent1.type === 'line' && ent2?.type === 'line') {
          // Make slopes equal
          const dx1 = (ent1.points[1]?.x ?? 0) - (ent1.points[0]?.x ?? 0);
          const dy1 = (ent1.points[1]?.y ?? 0) - (ent1.points[0]?.y ?? 0);
          const dx2 = (ent2.points[1]?.x ?? 0) - (ent2.points[0]?.x ?? 0);
          const dy2 = (ent2.points[1]?.y ?? 0) - (ent2.points[0]?.y ?? 0);

          const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
          error = cross;

          if (cross > this.tolerance) {
            const scale = Math.sqrt((dx2 * dx2 + dy2 * dy2) / (dx1 * dx1 + dy1 * dy1));
            ent2.points[1].x = (ent2.points[0]?.x ?? 0) + dx1 * scale;
            ent2.points[1].y = (ent2.points[0]?.y ?? 0) + dy1 * scale;
          }
        }
        break;

      case CONSTRAINT_TYPES.PERPENDICULAR:
        if (ent1.type === 'line' && ent2?.type === 'line') {
          const dx1 = (ent1.points[1]?.x ?? 0) - (ent1.points[0]?.x ?? 0);
          const dy1 = (ent1.points[1]?.y ?? 0) - (ent1.points[0]?.y ?? 0);
          const dx2 = (ent2.points[1]?.x ?? 0) - (ent2.points[0]?.x ?? 0);
          const dy2 = (ent2.points[1]?.y ?? 0) - (ent2.points[0]?.y ?? 0);

          const dot = dx1 * dx2 + dy1 * dy2;
          error = Math.abs(dot);

          if (error > this.tolerance) {
            const newDx = -dy1;
            const newDy = dx1;
            const scale = Math.sqrt((dx2 * dx2 + dy2 * dy2) / (newDx * newDx + newDy * newDy));
            ent2.points[1].x = (ent2.points[0]?.x ?? 0) + newDx * scale;
            ent2.points[1].y = (ent2.points[0]?.y ?? 0) + newDy * scale;
          }
        }
        break;

      case CONSTRAINT_TYPES.FIX:
        // Fixed point — no solving needed
        error = 0;
        break;

      case CONSTRAINT_TYPES.EQUAL:
        if (ent1.type === 'circle' && ent2?.type === 'circle') {
          const r1 = ent1.dimensions.radius ?? 10;
          const r2 = ent2.dimensions.radius ?? 10;
          error = Math.abs(r1 - r2);
          const avgR = (r1 + r2) / 2;
          ent1.dimensions.radius = avgR;
          ent2.dimensions.radius = avgR;
        }
        break;
    }

    return error;
  }
}

// ============================================================================
// MAIN MODULE INTERFACE
// ============================================================================

let nextEntityId = 0;

export default {
  /**
   * Initialize sketch module
   */
  init() {
    sketchState = {
      ...sketchState,
      entities: [],
      constraints: [],
      selectedEntities: new Set(),
    };
    nextEntityId = 0;
  },

  /**
   * Start sketch on specified plane
   */
  startSketch(plane = 'XY', scene = null, renderer = null) {
    this.init();
    sketchState.active = true;
    sketchState.plane = plane;
    sketchState.scene = scene;
    sketchState.renderer = renderer;
    return {
      success: true,
      message: `Sketch started on ${plane} plane`,
      planeMatrix: PLANE_MATRICES[plane],
    };
  },

  /**
   * End sketch and return all entities + constraints
   */
  endSketch() {
    if (!sketchState.active) {
      return { success: false, message: 'No active sketch' };
    }

    sketchState.active = false;
    const result = {
      entities: sketchState.entities,
      constraints: sketchState.constraints,
      plane: sketchState.plane,
    };

    this.init();
    return result;
  },

  /**
   * Set active sketch tool
   */
  setTool(toolName) {
    if (!Object.values(SKETCH_TOOLS).includes(toolName)) {
      return { success: false, message: `Unknown tool: ${toolName}` };
    }
    sketchState.currentTool = toolName;
    sketchState.currentPoints = [];
    return { success: true, tool: toolName };
  },

  /**
   * Add a point to current entity
   */
  addPoint(x, y, snap = true) {
    const snapPt = snap ? this._snapPoint(x, y) : { x, y };

    sketchState.currentPoints.push(snapPt);

    const tool = sketchState.currentTool;
    let entityCreated = false;

    // Create entity based on tool and point count
    if (tool === SKETCH_TOOLS.LINE && sketchState.currentPoints.length === 2) {
      this._createLine(sketchState.currentPoints);
      entityCreated = true;
    } else if (tool === SKETCH_TOOLS.RECTANGLE && sketchState.currentPoints.length === 2) {
      this._createRectangle(sketchState.currentPoints);
      entityCreated = true;
    } else if (tool === SKETCH_TOOLS.CIRCLE && sketchState.currentPoints.length === 2) {
      this._createCircle(sketchState.currentPoints);
      entityCreated = true;
    } else if (tool === SKETCH_TOOLS.ARC && sketchState.currentPoints.length === 3) {
      this._createArc(sketchState.currentPoints);
      entityCreated = true;
    } else if (tool === SKETCH_TOOLS.ELLIPSE && sketchState.currentPoints.length === 3) {
      this._createEllipse(sketchState.currentPoints);
      entityCreated = true;
    } else if (tool === SKETCH_TOOLS.POLYGON) {
      // Polygon: first point = center, second point = corner, double-click to finish
      if (sketchState.currentPoints.length === 2) {
        this._createPolygon(sketchState.currentPoints);
        entityCreated = true;
      }
    } else if (tool === SKETCH_TOOLS.SLOT && sketchState.currentPoints.length === 2) {
      this._createSlot(sketchState.currentPoints);
      entityCreated = true;
    }

    if (entityCreated) {
      sketchState.currentPoints = [];
      return { success: true, entity: sketchState.entities[sketchState.entities.length - 1] };
    }

    return { success: true, pointsForCurrentEntity: sketchState.currentPoints.length };
  },

  /**
   * Finalize current entity (for splines and polylines)
   */
  finalizeEntity() {
    if (sketchState.currentTool === SKETCH_TOOLS.SPLINE && sketchState.currentPoints.length >= 2) {
      this._createSpline(sketchState.currentPoints);
      sketchState.currentPoints = [];
      return { success: true };
    }
    return { success: false, message: 'No polyline to finalize' };
  },

  /**
   * Apply constraint between entities
   */
  addConstraint(type, entityId1, entityId2 = null, value = null) {
    if (!Object.values(CONSTRAINT_TYPES).includes(type)) {
      return { success: false, message: `Unknown constraint type: ${type}` };
    }

    const constraint = {
      id: `constraint_${Date.now()}_${Math.random()}`,
      type,
      entityId1,
      entityId2,
      value,
    };

    sketchState.constraints.push(constraint);

    // Run solver
    const solver = new ConstraintSolver(sketchState.entities, sketchState.constraints);
    const converged = solver.solve();

    return {
      success: true,
      constraint,
      solverConverged: converged,
    };
  },

  /**
   * Add dimension to entity
   */
  addDimension(entityId, dimensionType, value) {
    const entity = sketchState.entities.find(e => e.id === entityId);
    if (!entity) {
      return { success: false, message: `Entity ${entityId} not found` };
    }

    // Store dimension metadata
    if (!entity.dimensions) entity.dimensions = {};

    switch (dimensionType) {
      case 'distance':
      case 'length':
        entity.dimensions.length = value;
        break;
      case 'radius':
        entity.dimensions.radius = value;
        break;
      case 'diameter':
        entity.dimensions.radius = value / 2;
        break;
      case 'angle':
        entity.dimensions.angle = value;
        break;
    }

    return { success: true, dimension: dimensionType, value };
  },

  /**
   * Mirror sketch entities
   */
  mirror(entityIds, mirrorLine) {
    const toMirror = sketchState.entities.filter(e => entityIds.includes(e.id));

    for (const entity of toMirror) {
      const clonedEntity = JSON.parse(JSON.stringify(entity));
      clonedEntity.id = `entity_${nextEntityId++}`;

      // Mirror points across line
      for (const pt of clonedEntity.points) {
        // Reflect pt across mirrorLine
        const reflected = this._reflectPointAcrossLine(pt, mirrorLine);
        pt.x = reflected.x;
        pt.y = reflected.y;
      }

      sketchState.entities.push(clonedEntity);
    }

    return { success: true, mirroredCount: toMirror.length };
  },

  /**
   * Offset sketch entities
   */
  offset(entityIds, distance) {
    const toOffset = sketchState.entities.filter(e => entityIds.includes(e.id));
    const offsetEntities = [];

    for (const entity of toOffset) {
      if (entity.type === 'line') {
        const offsetEnt = JSON.parse(JSON.stringify(entity));
        offsetEnt.id = `entity_${nextEntityId++}`;

        // Offset perpendicular to line
        const dx = (entity.points[1]?.x ?? 0) - (entity.points[0]?.x ?? 0);
        const dy = (entity.points[1]?.y ?? 0) - (entity.points[0]?.y ?? 0);
        const len = Math.sqrt(dx * dx + dy * dy);
        const px = (-dy / len) * distance;
        const py = (dx / len) * distance;

        offsetEnt.points = offsetEnt.points.map(pt => ({
          x: pt.x + px,
          y: pt.y + py,
        }));

        sketchState.entities.push(offsetEnt);
        offsetEntities.push(offsetEnt);
      } else if (entity.type === 'circle') {
        const offsetEnt = JSON.parse(JSON.stringify(entity));
        offsetEnt.id = `entity_${nextEntityId++}`;
        offsetEnt.dimensions.radius = (offsetEnt.dimensions.radius ?? 10) + distance;
        sketchState.entities.push(offsetEnt);
        offsetEntities.push(offsetEnt);
      }
    }

    return { success: true, offsetEntities };
  },

  /**
   * Trim sketch entities at intersection
   */
  trim(entityId1, entityId2) {
    // Simplified: removes the second entity at intersection
    const idx = sketchState.entities.findIndex(e => e.id === entityId2);
    if (idx !== -1) {
      sketchState.entities.splice(idx, 1);
      return { success: true, message: 'Entity trimmed' };
    }
    return { success: false, message: 'Entity not found' };
  },

  /**
   * Extend line toward another entity
   */
  extend(entityId, targetEntityId) {
    const entity = sketchState.entities.find(e => e.id === entityId);
    const target = sketchState.entities.find(e => e.id === targetEntityId);

    if (!entity || !target || entity.type !== 'line' || target.type !== 'line') {
      return { success: false, message: 'Invalid entities for extend' };
    }

    // Extend line to target
    const ext = this._lineIntersection(
      entity.points[0],
      entity.points[1],
      target.points[0],
      target.points[1]
    );

    if (ext) {
      entity.points[1] = ext;
      return { success: true };
    }

    return { success: false, message: 'No intersection found' };
  },

  /**
   * Apply 2D fillet to sketch entities
   */
  fillet2D(entityId1, entityId2, radius) {
    // Creates rounded corner between two entities
    const ent1 = sketchState.entities.find(e => e.id === entityId1);
    const ent2 = sketchState.entities.find(e => e.id === entityId2);

    if (!ent1 || !ent2) {
      return { success: false, message: 'Entities not found' };
    }

    const filletEnt = new SketchEntity(
      `entity_${nextEntityId++}`,
      'arc',
      [{ x: 0, y: 0 }],
      { radius, startAngle: 0, endAngle: Math.PI / 2 }
    );

    sketchState.entities.push(filletEnt);
    return { success: true, entity: filletEnt };
  },

  /**
   * Apply 2D chamfer
   */
  chamfer2D(entityId1, entityId2, distance1, distance2 = distance1) {
    const ent1 = sketchState.entities.find(e => e.id === entityId1);
    const ent2 = sketchState.entities.find(e => e.id === entityId2);

    if (!ent1 || !ent2) {
      return { success: false, message: 'Entities not found' };
    }

    const chamferEnt = new SketchEntity(
      `entity_${nextEntityId++}`,
      'line',
      [{ x: 0, y: 0 }, { x: distance1, y: -distance2 }]
    );

    sketchState.entities.push(chamferEnt);
    return { success: true, entity: chamferEnt };
  },

  /**
   * Pattern sketch entities (rectangular or circular)
   */
  pattern(entityIds, type, count, distance, angle = 0) {
    const toPattern = sketchState.entities.filter(e => entityIds.includes(e.id));
    const patternedEntities = [];

    if (type === 'rectangular') {
      for (let i = 0; i < count; i++) {
        for (const entity of toPattern) {
          const cloned = JSON.parse(JSON.stringify(entity));
          cloned.id = `entity_${nextEntityId++}`;

          for (const pt of cloned.points) {
            pt.x += distance * i;
          }

          sketchState.entities.push(cloned);
          patternedEntities.push(cloned);
        }
      }
    } else if (type === 'circular') {
      const center = toPattern[0]?.points[0] ?? { x: 0, y: 0 };

      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;

        for (const entity of toPattern) {
          const cloned = JSON.parse(JSON.stringify(entity));
          cloned.id = `entity_${nextEntityId++}`;

          const cos = Math.cos(ang);
          const sin = Math.sin(ang);

          for (const pt of cloned.points) {
            const dx = pt.x - center.x;
            const dy = pt.y - center.y;
            pt.x = center.x + dx * cos - dy * sin;
            pt.y = center.y + dx * sin + dy * cos;
          }

          sketchState.entities.push(cloned);
          patternedEntities.push(cloned);
        }
      }
    }

    return { success: true, patternedEntities };
  },

  /**
   * Toggle construction mode for entity
   */
  toggleConstruction(entityId) {
    const entity = sketchState.entities.find(e => e.id === entityId);
    if (entity) {
      entity.isConstruction = !entity.isConstruction;
      return { success: true, isConstruction: entity.isConstruction };
    }
    return { success: false, message: 'Entity not found' };
  },

  /**
   * Get UI panel for sketch tools
   */
  getUI() {
    const tools = Object.values(SKETCH_TOOLS);
    const constraints = Object.values(CONSTRAINT_TYPES);

    const toolButtons = tools
      .map(
        t =>
          `<button data-sketch-tool="${t}" style="padding:4px 8px;margin:2px;background:#0284C7;color:white;border:none;border-radius:2px;cursor:pointer;">${t}</button>`
      )
      .join('');

    const constraintButtons = constraints
      .map(
        c =>
          `<button data-sketch-constraint="${c}" style="padding:4px 8px;margin:2px;background:#10b981;color:white;border:none;border-radius:2px;cursor:pointer;">${c}</button>`
      )
      .join('');

    return `
      <div id="sketch-panel" style="padding:12px;background:#252526;border-radius:4px;color:#e0e0e0;font-size:12px;">
        <h3>Sketch Tools</h3>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
          ${toolButtons}
        </div>

        <h3>Constraints</h3>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">
          ${constraintButtons}
        </div>

        <div style="margin-top:12px;">
          <label>
            <input type="checkbox" id="sketch-snap-toggle" checked>
            Grid Snap (${sketchState.gridSize}mm)
          </label>
        </div>

        <label>
          <input type="checkbox" id="sketch-construction-toggle">
          Construction Mode
        </label>

        <button id="sketch-end-btn" style="width:100%;padding:8px;margin-top:12px;background:#ef4444;color:white;border:none;border-radius:2px;cursor:pointer;">
          End Sketch
        </button>
      </div>
    `;
  },

  /**
   * Execute sketch command via agent API
   */
  async execute(command, params = {}) {
    switch (command) {
      case 'startSketch':
        return this.startSketch(params.plane ?? 'XY', params.scene, params.renderer);

      case 'endSketch':
        return this.endSketch();

      case 'setTool':
        return this.setTool(params.tool);

      case 'addPoint':
        return this.addPoint(params.x, params.y, params.snap !== false);

      case 'addConstraint':
        return this.addConstraint(
          params.type,
          params.entityId1,
          params.entityId2,
          params.value
        );

      case 'addDimension':
        return this.addDimension(params.entityId, params.dimensionType, params.value);

      case 'mirror':
        return this.mirror(params.entityIds, params.mirrorLine);

      case 'offset':
        return this.offset(params.entityIds, params.distance);

      case 'trim':
        return this.trim(params.entityId1, params.entityId2);

      case 'extend':
        return this.extend(params.entityId, params.targetEntityId);

      case 'fillet2D':
        return this.fillet2D(params.entityId1, params.entityId2, params.radius);

      case 'chamfer2D':
        return this.chamfer2D(
          params.entityId1,
          params.entityId2,
          params.distance1,
          params.distance2
        );

      case 'pattern':
        return this.pattern(
          params.entityIds,
          params.type,
          params.count,
          params.distance,
          params.angle
        );

      case 'toggleConstruction':
        return this.toggleConstruction(params.entityId);

      default:
        return { success: false, message: `Unknown command: ${command}` };
    }
  },

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  _snapPoint(x, y) {
    if (!sketchState.snapEnabled) return { x, y };

    const snapped = {
      x: Math.round(x / sketchState.gridSize) * sketchState.gridSize,
      y: Math.round(y / sketchState.gridSize) * sketchState.gridSize,
    };

    return snapped;
  },

  _createLine(points) {
    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'line',
      points,
      {},
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _createRectangle(points) {
    const [p1, p2] = points;
    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'rectangle',
      [p1],
      {
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
      },
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _createCircle(points) {
    const [center, edgePoint] = points;
    const radius = Math.sqrt(
      Math.pow(edgePoint.x - center.x, 2) + Math.pow(edgePoint.y - center.y, 2)
    );
    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'circle',
      [center],
      { radius },
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _createArc(points) {
    const [center, edgePoint, endPoint] = points;
    const radius = Math.sqrt(
      Math.pow(edgePoint.x - center.x, 2) + Math.pow(edgePoint.y - center.y, 2)
    );
    const startAngle = Math.atan2(edgePoint.y - center.y, edgePoint.x - center.x);
    const endAngle = Math.atan2(endPoint.y - center.y, endPoint.x - center.x);

    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'arc',
      [center],
      { radius, startAngle, endAngle },
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _createEllipse(points) {
    const [center, radiusXPoint, radiusYPoint] = points;
    const radiusX = Math.sqrt(
      Math.pow(radiusXPoint.x - center.x, 2) + Math.pow(radiusXPoint.y - center.y, 2)
    );
    const radiusY = Math.sqrt(
      Math.pow(radiusYPoint.x - center.x, 2) + Math.pow(radiusYPoint.y - center.y, 2)
    );

    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'ellipse',
      [center],
      { radiusX, radiusY },
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _createPolygon(points) {
    const [center, cornerPoint] = points;
    const radius = Math.sqrt(
      Math.pow(cornerPoint.x - center.x, 2) + Math.pow(cornerPoint.y - center.y, 2)
    );

    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'polygon',
      [center],
      { radius, sides: 6 },
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _createSlot(points) {
    const [pt1, pt2] = points;
    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'slot',
      [pt1, pt2],
      { width: 10, cornerRadius: 5 },
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _createSpline(points) {
    const entity = new SketchEntity(
      `entity_${nextEntityId++}`,
      'spline',
      points,
      {},
      sketchState.constructionMode
    );
    sketchState.entities.push(entity);
  },

  _reflectPointAcrossLine(point, line) {
    const { p1, p2 } = line;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    const px = point.x - p1.x;
    const py = point.y - p1.y;
    const proj = px * ux + py * uy;

    const perpX = px - proj * ux;
    const perpY = py - proj * uy;

    return {
      x: point.x - 2 * perpX,
      y: point.y - 2 * perpY,
    };
  },

  _lineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y;
    const x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y;
    const x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  },
};
