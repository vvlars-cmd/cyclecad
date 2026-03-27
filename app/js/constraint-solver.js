/**
 * Constraint Solver for 2D Sketch Engine
 * Iterative relaxation solver for geometric constraints in cycleCAD
 *
 * Supported constraints:
 * - Coincident, Horizontal, Vertical, Parallel, Perpendicular
 * - Tangent, Equal, Fixed, Concentric, Symmetric
 * - Distance, Angle
 *
 * @module constraint-solver
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// CONSTRAINT STORE & STATE
// ============================================================================

let constraintIdCounter = 1000;
const constraintStore = new Map(); // id -> constraint object

/**
 * Constraint object structure
 * @typedef {Object} Constraint
 * @property {number} id - Unique constraint ID
 * @property {string} type - 'coincident'|'horizontal'|'vertical'|'parallel'|'perpendicular'|'tangent'|'equal'|'fixed'|'concentric'|'symmetric'|'distance'|'angle'
 * @property {number[]} entities - Array of entity IDs involved
 * @property {number} [value] - Constraint value (distance, angle, radius, etc.)
 * @property {number} [priority=1] - Priority weight (higher = stricter). Used in weighted least-squares solving.
 * @property {boolean} [enabled=true] - Whether this constraint is active
 */

/**
 * Generate unique constraint ID
 * @returns {number}
 */
function nextConstraintId() {
  return constraintIdCounter++;
}

// ============================================================================
// MATH UTILITIES
// ============================================================================

/**
 * 2D vector operations
 */
const Vec2 = {
  /**
   * @param {number} x
   * @param {number} y
   * @returns {{x: number, y: number}}
   */
  make(x, y) {
    return { x, y };
  },

  /**
   * @param {Object} a
   * @param {Object} b
   * @returns {{x: number, y: number}}
   */
  add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  },

  /**
   * @param {Object} a
   * @param {Object} b
   * @returns {{x: number, y: number}}
   */
  sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  },

  /**
   * @param {Object} v
   * @param {number} s
   * @returns {{x: number, y: number}}
   */
  scale(v, s) {
    return { x: v.x * s, y: v.y * s };
  },

  /**
   * @param {Object} a
   * @param {Object} b
   * @returns {number}
   */
  dot(a, b) {
    return a.x * b.x + a.y * b.y;
  },

  /**
   * 2D cross product (scalar in 3D sense)
   * @param {Object} a
   * @param {Object} b
   * @returns {number}
   */
  cross(a, b) {
    return a.x * b.y - a.y * b.x;
  },

  /**
   * @param {Object} v
   * @returns {number}
   */
  length(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  },

  /**
   * @param {Object} v
   * @returns {{x: number, y: number}}
   */
  normalize(v) {
    const len = Vec2.length(v);
    if (len < 1e-10) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },

  /**
   * Perpendicular vector (rotate 90° CCW)
   * @param {Object} v
   * @returns {{x: number, y: number}}
   */
  perp(v) {
    return { x: -v.y, x: v.x };
  },

  /**
   * Distance between two points
   * @param {Object} a
   * @param {Object} b
   * @returns {number}
   */
  distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  /**
   * Angle of vector in radians [-π, π]
   * @param {Object} v
   * @returns {number}
   */
  angle(v) {
    return Math.atan2(v.y, v.x);
  },

  /**
   * Signed angle from v1 to v2 in radians [-π, π]
   * @param {Object} v1
   * @param {Object} v2
   * @returns {number}
   */
  signedAngle(v1, v2) {
    const angle = Math.atan2(Vec2.cross(v1, v2), Vec2.dot(v1, v2));
    return angle;
  },

  /**
   * Closest point on line (p1, p2) to point p
   * @param {Object} p
   * @param {Object} p1
   * @param {Object} p2
   * @returns {{point: Object, t: number}}
   */
  closestPointOnLine(p, p1, p2) {
    const line = Vec2.sub(p2, p1);
    const toP = Vec2.sub(p, p1);
    const lineLenSq = Vec2.dot(line, line);
    if (lineLenSq < 1e-10) return { point: p1, t: 0 };
    const t = Vec2.dot(toP, line) / lineLenSq;
    const closest = Vec2.add(p1, Vec2.scale(line, t));
    return { point: closest, t };
  },

  /**
   * Distance from point to line
   * @param {Object} p
   * @param {Object} p1
   * @param {Object} p2
   * @returns {number}
   */
  distanceToLine(p, p1, p2) {
    const { point } = Vec2.closestPointOnLine(p, p1, p2);
    return Vec2.distance(p, point);
  },

  /**
   * Distance from point to circle
   * @param {Object} p
   * @param {Object} center
   * @param {number} radius
   * @returns {number}
   */
  distanceToCircle(p, center, radius) {
    return Math.abs(Vec2.distance(p, center) - radius);
  },
};

// ============================================================================
// CONSTRAINT ANALYSIS & ERROR COMPUTATION
// ============================================================================

/**
 * Get point from entity by index (first, last, or center)
 * @param {Object} entity
 * @param {number} pointIdx - 0=first, 1=last, -1=center
 * @returns {Object} {x, y}
 */
function getEntityPoint(entity, pointIdx) {
  if (!entity || !entity.points || entity.points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (pointIdx === -1) {
    // Center (for circles/arcs)
    if (entity.type === 'circle' || entity.type === 'arc') {
      return entity.points[0]; // Center is first point
    }
    // Centroid for other types
    let sumX = 0, sumY = 0;
    entity.points.forEach(p => {
      sumX += p.x;
      sumY += p.y;
    });
    return { x: sumX / entity.points.length, y: sumY / entity.points.length };
  }

  if (pointIdx === 1 && entity.points.length > 1) {
    return entity.points[entity.points.length - 1]; // Last point
  }

  return entity.points[0]; // First point
}

/**
 * Get line direction vector
 * @param {Object} entity
 * @returns {Object} {x, y}
 */
function getLineDirection(entity) {
  if (entity.points.length < 2) {
    return { x: 1, y: 0 };
  }
  return Vec2.normalize(Vec2.sub(entity.points[1], entity.points[0]));
}

/**
 * Get radius of circle/arc
 * @param {Object} entity
 * @returns {number}
 */
function getRadius(entity) {
  if (entity.type === 'circle' || entity.type === 'arc') {
    if (entity.dimensions && entity.dimensions.radius !== undefined) {
      return entity.dimensions.radius;
    }
    if (entity.points.length >= 2) {
      // Radius = distance from center (first point) to any point on circle
      return Vec2.distance(entity.points[0], entity.points[1]);
    }
  }
  return 0;
}

/**
 * Get line length
 * @param {Object} entity
 * @returns {number}
 */
function getLineLength(entity) {
  if (entity.dimensions && entity.dimensions.length !== undefined) {
    return entity.dimensions.length;
  }
  if (entity.points.length < 2) return 0;
  return Vec2.distance(entity.points[0], entity.points[1]);
}

/**
 * Compute constraint error and correction
 * Returns {error: number, correction: {[entityId]: {[pointIdx]: {x, y}}} }
 *
 * @param {Map} entityMap - id -> entity
 * @param {Constraint} constraint
 * @returns {Object}
 */
function computeConstraintError(entityMap, constraint) {
  const correction = {};
  let error = 0;

  const type = constraint.type;
  const [e1Id, e2Id] = constraint.entities;
  const e1 = entityMap.get(e1Id);
  const e2 = e2Id ? entityMap.get(e2Id) : null;

  if (!e1) return { error: 0, correction };

  switch (type) {
    case 'coincident': {
      // Two points should be at the same location
      const p1 = getEntityPoint(e1, 0);
      if (!e2) break;
      const p2 = getEntityPoint(e2, 0);
      const delta = Vec2.sub(p2, p1);
      error = Vec2.length(delta);
      const correction_amt = Vec2.scale(delta, 0.5); // Move both points toward midpoint

      if (!correction[e1Id]) correction[e1Id] = { 0: Vec2.scale(delta, 0.5) };
      else correction[e1Id][0] = Vec2.scale(delta, 0.5);

      if (!correction[e2Id]) correction[e2Id] = { 0: Vec2.scale(delta, -0.5) };
      else correction[e2Id][0] = Vec2.scale(delta, -0.5);
      break;
    }

    case 'horizontal': {
      // Line should be horizontal (dy=0)
      const p1 = e1.points[0];
      const p2 = e1.points[1];
      if (!p2) break;
      const dy = p2.y - p1.y;
      error = Math.abs(dy);
      const correction_amt = dy * 0.5;

      if (!correction[e1Id]) correction[e1Id] = {};
      correction[e1Id][0] = { x: 0, y: -correction_amt };
      correction[e1Id][1] = { x: 0, y: correction_amt };
      break;
    }

    case 'vertical': {
      // Line should be vertical (dx=0)
      const p1 = e1.points[0];
      const p2 = e1.points[1];
      if (!p2) break;
      const dx = p2.x - p1.x;
      error = Math.abs(dx);
      const correction_amt = dx * 0.5;

      if (!correction[e1Id]) correction[e1Id] = {};
      correction[e1Id][0] = { x: -correction_amt, y: 0 };
      correction[e1Id][1] = { x: correction_amt, y: 0 };
      break;
    }

    case 'parallel': {
      // Two lines should have parallel direction
      if (!e2) break;
      const dir1 = getLineDirection(e1);
      const dir2 = getLineDirection(e2);
      // Cross product should be ~0
      const cross = Vec2.cross(dir1, dir2);
      error = Math.abs(cross);

      // Rotate each line slightly to align
      const angle = Math.asin(Math.max(-1, Math.min(1, cross)));
      const perp1 = Vec2.perp(dir1);

      const correction_angle = angle * 0.25;
      if (!correction[e1Id]) correction[e1Id] = {};
      if (e1.points.length >= 2) {
        const correction_amt = Vec2.scale(perp1, correction_angle * 5);
        correction[e1Id][1] = correction_amt;
      }

      if (!correction[e2Id]) correction[e2Id] = {};
      if (e2.points.length >= 2) {
        const perp2 = Vec2.perp(dir2);
        const correction_amt = Vec2.scale(perp2, -correction_angle * 5);
        correction[e2Id][1] = correction_amt;
      }
      break;
    }

    case 'perpendicular': {
      // Two lines should be perpendicular (dot product ~0)
      if (!e2) break;
      const dir1 = getLineDirection(e1);
      const dir2 = getLineDirection(e2);
      const dot = Vec2.dot(dir1, dir2);
      error = Math.abs(dot);

      // Rotate line 2 to be perpendicular to line 1
      const perp1 = Vec2.perp(dir1);
      const angle = Math.acos(Math.max(-1, Math.min(1, Math.abs(Vec2.dot(dir2, perp1)))));
      const correction_angle = (Math.PI / 2 - angle) * 0.25;

      if (!correction[e2Id]) correction[e2Id] = {};
      if (e2.points.length >= 2) {
        const p1 = e2.points[0];
        const p2 = e2.points[1];
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const len = Vec2.distance(p1, p2);
        const newDir = { x: Math.cos(Math.atan2(dir2.y, dir2.x) + correction_angle), y: Math.sin(Math.atan2(dir2.y, dir2.x) + correction_angle) };
        const newP1 = Vec2.add(mid, Vec2.scale(newDir, -len / 2));
        const newP2 = Vec2.add(mid, Vec2.scale(newDir, len / 2));
        correction[e2Id][0] = Vec2.sub(newP1, p1);
        correction[e2Id][1] = Vec2.sub(newP2, p2);
      }
      break;
    }

    case 'tangent': {
      // Line is tangent to circle/arc
      if (!e2) break;
      const isE1Circle = e1.type === 'circle' || e1.type === 'arc';
      const isE2Circle = e2.type === 'circle' || e2.type === 'arc';

      if (isE1Circle && !isE2Circle) {
        // e1 is circle, e2 is line
        const center = e1.points[0];
        const radius = getRadius(e1);
        const dist = Vec2.distanceToLine(center, e2.points[0], e2.points[1]);
        error = Math.abs(dist - radius);

        // Move line to be tangent
        const { point: closest } = Vec2.closestPointOnLine(center, e2.points[0], e2.points[1]);
        const dir = Vec2.normalize(Vec2.sub(closest, center));
        const targetPoint = Vec2.add(center, Vec2.scale(dir, radius));
        const delta = Vec2.sub(targetPoint, closest);
        const correction_amt = Vec2.scale(delta, 0.25);

        if (!correction[e2Id]) correction[e2Id] = {};
        correction[e2Id][0] = correction_amt;
        correction[e2Id][1] = correction_amt;
      } else if (!isE1Circle && isE2Circle) {
        // e1 is line, e2 is circle
        const center = e2.points[0];
        const radius = getRadius(e2);
        const dist = Vec2.distanceToLine(center, e1.points[0], e1.points[1]);
        error = Math.abs(dist - radius);

        const { point: closest } = Vec2.closestPointOnLine(center, e1.points[0], e1.points[1]);
        const dir = Vec2.normalize(Vec2.sub(closest, center));
        const targetPoint = Vec2.add(center, Vec2.scale(dir, radius));
        const delta = Vec2.sub(targetPoint, closest);
        const correction_amt = Vec2.scale(delta, 0.25);

        if (!correction[e1Id]) correction[e1Id] = {};
        correction[e1Id][0] = correction_amt;
        correction[e1Id][1] = correction_amt;
      }
      break;
    }

    case 'equal': {
      // Two entities have equal length/radius
      if (!e2) break;
      const len1 = e1.type === 'circle' || e1.type === 'arc' ? getRadius(e1) : getLineLength(e1);
      const len2 = e2.type === 'circle' || e2.type === 'arc' ? getRadius(e2) : getLineLength(e2);
      error = Math.abs(len1 - len2);

      // Scale e2 to match e1
      const scale = len1 / (len2 + 1e-10);
      if (e2.type === 'circle' || e2.type === 'arc') {
        const center = e2.points[0];
        if (e2.points.length >= 2) {
          const oldRadius = Vec2.distance(center, e2.points[1]);
          const newRadius = oldRadius * scale;
          const dir = Vec2.normalize(Vec2.sub(e2.points[1], center));
          const newP = Vec2.add(center, Vec2.scale(dir, newRadius));
          if (!correction[e2Id]) correction[e2Id] = {};
          correction[e2Id][1] = Vec2.sub(newP, e2.points[1]);
        }
      } else {
        if (e2.points.length >= 2) {
          const mid = { x: (e2.points[0].x + e2.points[1].x) / 2, y: (e2.points[0].y + e2.points[1].y) / 2 };
          const dir = getLineDirection(e2);
          const halfLen = len1 / 2;
          const p1 = Vec2.add(mid, Vec2.scale(dir, -halfLen));
          const p2 = Vec2.add(mid, Vec2.scale(dir, halfLen));
          if (!correction[e2Id]) correction[e2Id] = {};
          correction[e2Id][0] = Vec2.sub(p1, e2.points[0]);
          correction[e2Id][1] = Vec2.sub(p2, e2.points[1]);
        }
      }
      break;
    }

    case 'fixed': {
      // Point is locked at specific position
      if (!constraint.value || !constraint.value.x !== undefined) break;
      const p = getEntityPoint(e1, 0);
      const target = constraint.value;
      const delta = Vec2.sub(target, p);
      error = Vec2.length(delta);

      if (!correction[e1Id]) correction[e1Id] = {};
      correction[e1Id][0] = delta;
      break;
    }

    case 'concentric': {
      // Two circles/arcs share center
      if (!e2) break;
      const c1 = getEntityPoint(e1, -1);
      const c2 = getEntityPoint(e2, -1);
      const delta = Vec2.sub(c2, c1);
      error = Vec2.length(delta);

      if (!correction[e1Id]) correction[e1Id] = {};
      correction[e1Id][0] = Vec2.scale(delta, 0.5);

      if (!correction[e2Id]) correction[e2Id] = {};
      correction[e2Id][0] = Vec2.scale(delta, -0.5);
      break;
    }

    case 'symmetric': {
      // Two points are symmetric about a line (axis)
      if (!e2) break;
      // constraint.value should be {axisPt1, axisPt2} or similar
      // For now, assume symmetric about origin
      const p1 = getEntityPoint(e1, 0);
      const p2 = getEntityPoint(e2, 0);
      const sym_p1 = { x: -p1.x, y: -p1.y };
      const delta = Vec2.sub(sym_p1, p2);
      error = Vec2.length(delta);

      if (!correction[e2Id]) correction[e2Id] = {};
      correction[e2Id][0] = Vec2.scale(delta, 0.5);

      if (!correction[e1Id]) correction[e1Id] = {};
      correction[e1Id][0] = Vec2.scale(delta, -0.5);
      break;
    }

    case 'distance': {
      // Two points at specified distance
      if (!e2 || !constraint.value) break;
      const p1 = getEntityPoint(e1, 0);
      const p2 = getEntityPoint(e2, 0);
      const actual = Vec2.distance(p1, p2);
      const target = constraint.value;
      error = Math.abs(actual - target);

      const delta = Vec2.sub(p2, p1);
      const scale = (target / (actual + 1e-10)) - 1;
      const correction_amt = Vec2.scale(delta, scale * 0.25);

      if (!correction[e1Id]) correction[e1Id] = {};
      correction[e1Id][0] = Vec2.scale(correction_amt, -1);

      if (!correction[e2Id]) correction[e2Id] = {};
      correction[e2Id][0] = correction_amt;
      break;
    }

    case 'angle': {
      // Two lines at specified angle
      if (!e2 || constraint.value === undefined) break;
      const dir1 = getLineDirection(e1);
      const dir2 = getLineDirection(e2);
      const angle1 = Vec2.angle(dir1);
      const angle2 = Vec2.angle(dir2);
      let actualAngle = angle2 - angle1;
      while (actualAngle > Math.PI) actualAngle -= 2 * Math.PI;
      while (actualAngle < -Math.PI) actualAngle += 2 * Math.PI;

      const targetAngle = constraint.value * Math.PI / 180; // Convert deg to rad
      let angleDelta = targetAngle - actualAngle;
      while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

      error = Math.abs(angleDelta);

      // Rotate e2
      if (e2.points.length >= 2) {
        const correction_angle = angleDelta * 0.125;
        const p1 = e2.points[0];
        const p2 = e2.points[1];
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const len = Vec2.distance(p1, p2);
        const newAngle = angle2 + correction_angle;
        const newDir = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
        const newP1 = Vec2.add(mid, Vec2.scale(newDir, -len / 2));
        const newP2 = Vec2.add(mid, Vec2.scale(newDir, len / 2));

        if (!correction[e2Id]) correction[e2Id] = {};
        correction[e2Id][0] = Vec2.sub(newP1, p1);
        correction[e2Id][1] = Vec2.sub(newP2, p2);
      }
      break;
    }

    default:
      break;
  }

  return { error, correction };
}

// ============================================================================
// MAIN SOLVER
// ============================================================================

/**
 * Solve all active constraints using iterative relaxation
 *
 * @param {Object} sketchState - {entities: Map<id, entity>, constraints: Constraint[]}
 * @param {Object} options - {maxIterations: 100, tolerance: 0.001, damping: 0.5}
 * @returns {Object} {converged: boolean, totalError: number, iterations: number}
 */
export function solveConstraints(sketchState, options = {}) {
  const { maxIterations = 100, tolerance = 0.001, damping = 0.5 } = options;

  const { entities, constraints } = sketchState;
  if (!entities || !constraints) return { converged: false, totalError: 0, iterations: 0 };

  let converged = false;
  let iteration = 0;
  let totalError = 0;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    totalError = 0;
    const allCorrections = {}; // id -> accumulated corrections

    // Compute errors and corrections for all active constraints
    constraints.forEach(constraint => {
      if (!constraint.enabled) return;

      const { error, correction } = computeConstraintError(entities, constraint);
      const priority = constraint.priority || 1;
      totalError += error * error * priority; // Weighted error

      // Accumulate corrections
      Object.keys(correction).forEach(entityId => {
        if (!allCorrections[entityId]) allCorrections[entityId] = {};
        const pointCorr = correction[entityId];
        Object.keys(pointCorr).forEach(pointIdx => {
          if (!allCorrections[entityId][pointIdx]) {
            allCorrections[entityId][pointIdx] = { x: 0, y: 0 };
          }
          allCorrections[entityId][pointIdx].x += pointCorr[pointIdx].x * damping * priority;
          allCorrections[entityId][pointIdx].y += pointCorr[pointIdx].y * damping * priority;
        });
      });
    });

    totalError = Math.sqrt(totalError / Math.max(1, constraints.filter(c => c.enabled).length));

    // Apply corrections to entities
    Object.keys(allCorrections).forEach(entityId => {
      const entity = entities.get(parseInt(entityId));
      if (!entity || !entity.points) return;

      const pointCorr = allCorrections[entityId];
      Object.keys(pointCorr).forEach(pointIdx => {
        const idx = parseInt(pointIdx);
        if (idx >= 0 && idx < entity.points.length) {
          entity.points[idx].x += pointCorr[idx].x;
          entity.points[idx].y += pointCorr[idx].y;
        }
      });
    });

    if (totalError < tolerance) {
      converged = true;
      break;
    }
  }

  return { converged, totalError, iterations: iteration + 1 };
}

/**
 * Add a new constraint
 *
 * @param {string} type - Constraint type
 * @param {number[]} entityIds - Entity IDs involved
 * @param {number|Object} [value] - Constraint value (distance, angle, position, etc.)
 * @param {number} [priority=1] - Priority weight
 * @returns {Constraint}
 */
export function addConstraint(type, entityIds, value = null, priority = 1) {
  const constraint = {
    id: nextConstraintId(),
    type,
    entities: entityIds,
    value,
    priority,
    enabled: true,
  };
  constraintStore.set(constraint.id, constraint);
  return constraint;
}

/**
 * Remove constraint by ID
 *
 * @param {number} constraintId
 * @returns {boolean}
 */
export function removeConstraint(constraintId) {
  return constraintStore.delete(constraintId);
}

/**
 * Toggle constraint enabled state
 *
 * @param {number} constraintId
 * @param {boolean} enabled
 */
export function setConstraintEnabled(constraintId, enabled) {
  const constraint = constraintStore.get(constraintId);
  if (constraint) {
    constraint.enabled = enabled;
  }
}

/**
 * Get all constraints from store
 *
 * @returns {Constraint[]}
 */
export function getAllConstraints() {
  return Array.from(constraintStore.values());
}

/**
 * Get constraint by ID
 *
 * @param {number} constraintId
 * @returns {Constraint|undefined}
 */
export function getConstraint(constraintId) {
  return constraintStore.get(constraintId);
}

/**
 * Compute total error across all constraints
 *
 * @param {Object} sketchState - {entities: Map<id, entity>, constraints: Constraint[]}
 * @returns {Object} {totalError: number, errorsByConstraint: {[constraintId]: error}}
 */
export function getConstraintErrors(sketchState) {
  const { entities, constraints } = sketchState;
  if (!entities || !constraints) return { totalError: 0, errorsByConstraint: {} };

  let totalError = 0;
  const errorsByConstraint = {};

  constraints.forEach(constraint => {
    if (!constraint.enabled) return;

    const { error } = computeConstraintError(entities, constraint);
    errorsByConstraint[constraint.id] = error;
    totalError += error * error;
  });

  totalError = Math.sqrt(totalError / Math.max(1, constraints.filter(c => c.enabled).length));

  return { totalError, errorsByConstraint };
}

// ============================================================================
// AUTO-DETECTION & ANALYSIS
// ============================================================================

/**
 * Automatically detect and suggest constraints for entities
 * Looks for nearly-aligned, nearly-coincident, or nearly-tangent geometry
 *
 * @param {Map} entities - id -> entity
 * @param {Object} options - {coincidentTol: 0.5, horizontalTol: 3, parallelTol: 5, tangentTol: 0.5}
 * @returns {Object} {suggestions: Constraint[], appliedConstraints: number}
 */
export function autoDetectConstraints(entities, options = {}) {
  const {
    coincidentTol = 0.5,        // mm
    horizontalTol = 3,          // degrees
    parallelTol = 5,            // degrees
    tangentTol = 0.5,           // mm
  } = options;

  const suggestions = [];
  const entityArray = Array.from(entities.values());

  // Coincident: two endpoints very close
  for (let i = 0; i < entityArray.length; i++) {
    for (let j = i + 1; j < entityArray.length; j++) {
      const e1 = entityArray[i];
      const e2 = entityArray[j];

      const p1 = getEntityPoint(e1, 0);
      const p2 = getEntityPoint(e2, 0);
      const dist = Vec2.distance(p1, p2);
      if (dist < coincidentTol && dist > 1e-6) {
        suggestions.push({
          type: 'coincident',
          entities: [e1.id, e2.id],
          reason: `Points within ${dist.toFixed(2)}mm`,
        });
      }

      // Last point to first point
      const p1Last = getEntityPoint(e1, 1);
      const p2First = getEntityPoint(e2, 0);
      const distLastFirst = Vec2.distance(p1Last, p2First);
      if (distLastFirst < coincidentTol && distLastFirst > 1e-6) {
        suggestions.push({
          type: 'coincident',
          entities: [e1.id, e2.id],
          reason: `Points within ${distLastFirst.toFixed(2)}mm`,
        });
      }
    }
  }

  // Horizontal/Vertical: lines nearly axis-aligned
  entityArray.forEach(e => {
    if (e.type === 'line' || (e.type === 'polyline' && e.points.length >= 2)) {
      const dir = getLineDirection(e);
      const angle = Vec2.angle(dir);
      const angleDeg = angle * 180 / Math.PI;

      // Horizontal?
      if (Math.abs(angleDeg) < horizontalTol || Math.abs(angleDeg - 180) < horizontalTol) {
        suggestions.push({
          type: 'horizontal',
          entities: [e.id],
          reason: `Line within ${Math.abs(angleDeg).toFixed(1)}° of horizontal`,
        });
      }

      // Vertical?
      if (Math.abs(angleDeg - 90) < horizontalTol || Math.abs(angleDeg + 90) < horizontalTol) {
        suggestions.push({
          type: 'vertical',
          entities: [e.id],
          reason: `Line within ${(Math.abs(angleDeg) - 90).toFixed(1)}° of vertical`,
        });
      }
    }
  });

  // Parallel: two lines nearly parallel
  for (let i = 0; i < entityArray.length; i++) {
    for (let j = i + 1; j < entityArray.length; j++) {
      const e1 = entityArray[i];
      const e2 = entityArray[j];

      if ((e1.type === 'line' || e1.type === 'polyline') &&
          (e2.type === 'line' || e2.type === 'polyline')) {
        const dir1 = getLineDirection(e1);
        const dir2 = getLineDirection(e2);
        const angle1 = Vec2.angle(dir1);
        const angle2 = Vec2.angle(dir2);
        let angleDelta = angle2 - angle1;
        while (angleDelta > Math.PI / 2) angleDelta -= Math.PI;
        const angleDeltaDeg = Math.abs(angleDelta) * 180 / Math.PI;

        if (angleDeltaDeg < parallelTol) {
          suggestions.push({
            type: 'parallel',
            entities: [e1.id, e2.id],
            reason: `Lines within ${angleDeltaDeg.toFixed(1)}° of parallel`,
          });
        }
      }
    }
  }

  // Perpendicular: two lines nearly perpendicular
  for (let i = 0; i < entityArray.length; i++) {
    for (let j = i + 1; j < entityArray.length; j++) {
      const e1 = entityArray[i];
      const e2 = entityArray[j];

      if ((e1.type === 'line' || e1.type === 'polyline') &&
          (e2.type === 'line' || e2.type === 'polyline')) {
        const dir1 = getLineDirection(e1);
        const dir2 = getLineDirection(e2);
        const dot = Vec2.dot(dir1, dir2);
        const angle = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot))));
        const angleDeg = Math.abs(angle - Math.PI / 2) * 180 / Math.PI;

        if (angleDeg < parallelTol) {
          suggestions.push({
            type: 'perpendicular',
            entities: [e1.id, e2.id],
            reason: `Lines within ${angleDeg.toFixed(1)}° of perpendicular`,
          });
        }
      }
    }
  }

  // Tangent: line tangent to circle
  for (let i = 0; i < entityArray.length; i++) {
    for (let j = 0; j < entityArray.length; j++) {
      if (i === j) continue;
      const e1 = entityArray[i];
      const e2 = entityArray[j];

      const isE1Circle = e1.type === 'circle' || e1.type === 'arc';
      const isE2Line = e2.type === 'line' || e2.type === 'polyline';

      if (isE1Circle && isE2Line) {
        const center = e1.points[0];
        const radius = getRadius(e1);
        const dist = Vec2.distanceToLine(center, e2.points[0], e2.points[1]);
        const error = Math.abs(dist - radius);

        if (error < tangentTol) {
          suggestions.push({
            type: 'tangent',
            entities: [e1.id, e2.id],
            reason: `Line tangent to circle (error ${error.toFixed(2)}mm)`,
          });
        }
      }
    }
  }

  // Concentric: two circles close centers
  for (let i = 0; i < entityArray.length; i++) {
    for (let j = i + 1; j < entityArray.length; j++) {
      const e1 = entityArray[i];
      const e2 = entityArray[j];

      if ((e1.type === 'circle' || e1.type === 'arc') &&
          (e2.type === 'circle' || e2.type === 'arc')) {
        const c1 = getEntityPoint(e1, -1);
        const c2 = getEntityPoint(e2, -1);
        const dist = Vec2.distance(c1, c2);

        if (dist < coincidentTol) {
          suggestions.push({
            type: 'concentric',
            entities: [e1.id, e2.id],
            reason: `Circle centers within ${dist.toFixed(2)}mm`,
          });
        }
      }
    }
  }

  return { suggestions };
}

/**
 * Check if sketch is fully constrained
 * A fully constrained sketch has 0 degrees of freedom (DOF)
 *
 * For a 2D sketch:
 * - Each point has 2 DOF (x, y)
 * - Each constraint typically removes 1 DOF
 * - Horizontal/Vertical/Distance/Angle remove 1
 * - Coincident removes 2 (both x and y)
 *
 * @param {Object} sketchState - {entities: Map<id, entity>, constraints: Constraint[]}
 * @returns {Object} {isFullyConstrained: boolean, degreesOfFreedom: number}
 */
export function isFullyConstrained(sketchState) {
  const { entities, constraints } = sketchState;
  if (!entities || !constraints) return { isFullyConstrained: false, degreesOfFreedom: 0 };

  const entityArray = Array.from(entities.values());
  let totalPoints = 0;

  // Count unique points (some entities share endpoints)
  const uniquePoints = new Set();
  entityArray.forEach(e => {
    if (e.points) {
      e.points.forEach((p, idx) => {
        uniquePoints.add(`${e.id}:${idx}`);
      });
    }
  });

  totalPoints = uniquePoints.size;
  let dof = totalPoints * 2; // Each point has 2 DOF

  // Subtract constraints
  const enabledConstraints = constraints.filter(c => c.enabled);
  enabledConstraints.forEach(c => {
    switch (c.type) {
      case 'coincident':
      case 'concentric':
        dof -= 2;
        break;
      case 'horizontal':
      case 'vertical':
      case 'distance':
      case 'angle':
      case 'fixed':
      case 'equal':
      case 'parallel':
      case 'perpendicular':
      case 'tangent':
      case 'symmetric':
        dof -= 1;
        break;
      default:
        break;
    }
  });

  // Fully constrained if DOF <= 0 (over-constrained if < 0, which indicates conflict)
  return {
    isFullyConstrained: dof <= 0,
    degreesOfFreedom: Math.max(0, dof),
    overConstrained: dof < 0,
  };
}

/**
 * Clear all constraints
 */
export function clearAllConstraints() {
  constraintStore.clear();
  constraintIdCounter = 1000;
}

/**
 * Export all constraints to JSON
 *
 * @returns {string}
 */
export function exportConstraints() {
  const constraints = Array.from(constraintStore.values());
  return JSON.stringify(constraints, null, 2);
}

/**
 * Import constraints from JSON
 *
 * @param {string} json
 */
export function importConstraints(json) {
  try {
    const constraints = JSON.parse(json);
    clearAllConstraints();
    constraints.forEach(c => {
      constraintStore.set(c.id, c);
      constraintIdCounter = Math.max(constraintIdCounter, c.id + 1);
    });
  } catch (e) {
    console.error('Failed to import constraints:', e);
  }
}
