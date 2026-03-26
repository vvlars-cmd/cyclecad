/**
 * sketch-enhance.js — Enhanced sketch tools for cycleCAD
 *
 * New sketch entities: Polygon, Spline, Text, Ellipse, Slot
 * Modification tools: Trim, Extend, Split, Offset, Mirror, Fillet2D, Chamfer2D
 * Enhanced snap system with visual indicators
 * Region detection for closed loops
 *
 * Usage: window.cycleCAD.sketchEnhance.polygon({...})
 * Pattern: IIFE, no imports
 */

(function() {
  'use strict';

  const sketchEnhance = {
    // Snap modes (bitmask)
    SNAP_ENDPOINT: 1,
    SNAP_MIDPOINT: 2,
    SNAP_CENTER: 4,
    SNAP_PERPENDICULAR: 8,
    SNAP_TANGENT: 16,
    SNAP_INTERSECTION: 32,
    SNAP_GRID: 64,
    SNAP_NEAREST: 128,

    // Enabled snap modes (default: all)
    enabledSnaps: 0xFF,
    snapRadius: 8, // pixels
    showSnapIndicators: true,

    /**
     * Create a regular polygon
     * @param {Object} options - {cx, cy, sides, radius, name}
     * @returns {Object} polygon entity
     */
    polygon(options = {}) {
      const {
        cx = 0, cy = 0,
        sides = 6,
        radius = 50,
        name = `Polygon_${sides}`
      } = options;

      // Clamp sides to 3-12
      const n = Math.max(3, Math.min(12, sides));
      const points = [];

      // Generate polygon points
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        points.push({
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle)
        });
      }

      return {
        type: 'polygon',
        name,
        points,
        cx, cy, sides: n, radius,
        edges: this._pointsToEdges(points, true), // closed
        closed: true,
        color: '#00FF00'
      };
    },

    /**
     * Create a smooth spline through control points
     * @param {Object} options - {points, tension, closed, name}
     * @returns {Object} spline entity
     */
    spline(options = {}) {
      const {
        points = [],
        tension = 0.5, // Catmull-Rom parameter
        closed = false,
        name = 'Spline'
      } = options;

      if (points.length < 2) return null;

      // Generate spline vertices using Catmull-Rom
      const splinePoints = this._catmullRom(points, tension, closed);

      return {
        type: 'spline',
        name,
        controlPoints: points,
        points: splinePoints,
        tension,
        closed,
        edges: this._pointsToEdges(splinePoints, closed),
        color: '#0080FF',
        handles: points.map((p, i) => ({
          id: i,
          x: p.x, y: p.y,
          point: p
        }))
      };
    },

    /**
     * Create text outline in 2D sketch
     * @param {Object} options - {text, x, y, fontSize, fontFamily, name}
     * @returns {Object} text entity with outline edges
     */
    text(options = {}) {
      const {
        text = 'Text',
        x = 0, y = 0,
        fontSize = 24,
        fontFamily = 'Arial',
        name = text
      } = options;

      // Simple text outline generator (approximation)
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.fillStyle = '#000';
      ctx.fillText(text, 10, 40);

      // Trace outline from canvas pixels (simplified)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const outline = this._traceTextOutline(data, canvas.width, canvas.height);

      // Scale and offset outline
      const scale = fontSize / 24;
      const points = outline.map(p => ({
        x: x + p.x * scale,
        y: y + p.y * scale
      }));

      return {
        type: 'text',
        name,
        text,
        x, y,
        fontSize,
        fontFamily,
        points,
        edges: this._pointsToEdges(points, true),
        color: '#FFAA00'
      };
    },

    /**
     * Create an ellipse
     * @param {Object} options - {cx, cy, rx, ry, name}
     * @returns {Object} ellipse entity
     */
    ellipse(options = {}) {
      const {
        cx = 0, cy = 0,
        rx = 60, ry = 40,
        name = 'Ellipse'
      } = options;

      // Generate ellipse points
      const points = [];
      const segments = 64;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push({
          x: cx + rx * Math.cos(angle),
          y: cy + ry * Math.sin(angle)
        });
      }

      return {
        type: 'ellipse',
        name,
        cx, cy, rx, ry,
        points,
        edges: this._pointsToEdges(points, true),
        closed: true,
        color: '#FF00FF'
      };
    },

    /**
     * Create a slot (stadium shape) — rounded rectangle
     * @param {Object} options - {cx, cy, length, width, name}
     * @returns {Object} slot entity
     */
    slot(options = {}) {
      const {
        cx = 0, cy = 0,
        length = 100, width = 40,
        name = 'Slot'
      } = options;

      const hw = width / 2; // half width
      const hl = length / 2; // half length
      const points = [];

      // Left semicircle
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI;
        points.push({
          x: cx - hl + hw * Math.cos(angle + Math.PI),
          y: cy + hw * Math.sin(angle + Math.PI)
        });
      }

      // Right semicircle
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI;
        points.push({
          x: cx + hl + hw * Math.cos(angle),
          y: cy + hw * Math.sin(angle)
        });
      }

      return {
        type: 'slot',
        name,
        cx, cy, length, width,
        points,
        edges: this._pointsToEdges(points, true),
        closed: true,
        color: '#00FFAA'
      };
    },

    /**
     * Trim entity at intersection point
     * @param {Object} entity1 - entity to trim
     * @param {Object} entity2 - reference entity for intersection
     * @returns {Object} trimmed entity (first segment before intersection)
     */
    trim(entity1, entity2) {
      if (!entity1 || !entity1.points) return entity1;

      // Find intersection
      const intersection = this._findIntersection(entity1, entity2);
      if (!intersection) return entity1; // No trim if no intersection

      // Trim at intersection point
      const trimmedPoints = [];
      for (const p of entity1.points) {
        trimmedPoints.push(p);
        if (this._distToPoint(p, intersection) < 0.5) break;
      }

      entity1.points = trimmedPoints;
      entity1.edges = this._pointsToEdges(trimmedPoints, entity1.closed);
      return entity1;
    },

    /**
     * Extend entity to reach target
     * @param {Object} entity - entity to extend
     * @param {Object} target - target entity to reach
     * @returns {Object} extended entity
     */
    extend(entity, target) {
      if (!entity || !entity.points || entity.points.length < 2) return entity;

      // Find nearest point on target
      const lastPt = entity.points[entity.points.length - 1];
      const nearestPt = this._nearestPointOnEntity(lastPt, target);

      if (nearestPt) {
        entity.points.push(nearestPt);
        entity.edges = this._pointsToEdges(entity.points, entity.closed);
      }

      return entity;
    },

    /**
     * Split entity at a point
     * @param {Object} entity - entity to split
     * @param {Object} point - split point
     * @returns {Array} [segment1, segment2]
     */
    split(entity, point) {
      if (!entity || !entity.points) return [entity];

      // Find closest point index
      let minDist = Infinity;
      let splitIndex = 0;
      for (let i = 0; i < entity.points.length; i++) {
        const d = this._distToPoint(entity.points[i], point);
        if (d < minDist) {
          minDist = d;
          splitIndex = i;
        }
      }

      const seg1 = {
        ...entity,
        points: entity.points.slice(0, splitIndex + 1),
        closed: false
      };
      seg1.edges = this._pointsToEdges(seg1.points, seg1.closed);

      const seg2 = {
        ...entity,
        name: entity.name + '_2',
        points: entity.points.slice(splitIndex),
        closed: false
      };
      seg2.edges = this._pointsToEdges(seg2.points, seg2.closed);

      return [seg1, seg2];
    },

    /**
     * Create parallel offset of entity
     * @param {Object} entity - entity to offset
     * @param {number} distance - offset distance
     * @param {boolean} inside - if true, offset inward; else outward
     * @returns {Object} offset entity
     */
    offset(entity, distance, inside = false) {
      if (!entity || !entity.points) return entity;

      const offsetPoints = [];
      const pts = entity.points;
      const n = pts.length;
      const dir = inside ? -1 : 1;

      for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];

        // Calculate perpendicular offset
        const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
        const v2 = { x: next.x - curr.x, y: next.y - curr.y };

        const perp1 = { x: -v1.y, y: v1.x };
        const perp2 = { x: -v2.y, y: v2.x };

        const len1 = Math.hypot(perp1.x, perp1.y);
        const len2 = Math.hypot(perp2.x, perp2.y);

        if (len1 > 0.01) {
          perp1.x /= len1; perp1.y /= len1;
        }
        if (len2 > 0.01) {
          perp2.x /= len2; perp2.y /= len2;
        }

        // Average perpendicular at corner
        const avgPerp = {
          x: (perp1.x + perp2.x) * 0.5,
          y: (perp1.y + perp2.y) * 0.5
        };
        const avgLen = Math.hypot(avgPerp.x, avgPerp.y);
        if (avgLen > 0.01) {
          avgPerp.x /= avgLen; avgPerp.y /= avgLen;
        }

        offsetPoints.push({
          x: curr.x + dir * distance * avgPerp.x,
          y: curr.y + dir * distance * avgPerp.y
        });
      }

      return {
        ...entity,
        name: entity.name + '_offset',
        points: offsetPoints,
        edges: this._pointsToEdges(offsetPoints, entity.closed),
        color: '#CCCCFF'
      };
    },

    /**
     * Mirror entities across axis/line
     * @param {Object} entity - entity to mirror
     * @param {string} axis - 'x', 'y', or line {x1,y1,x2,y2}
     * @returns {Object} mirrored entity
     */
    mirror(entity, axis = 'x') {
      if (!entity || !entity.points) return entity;

      const mirroredPoints = entity.points.map(p => {
        if (typeof axis === 'string') {
          // Mirror across x or y axis
          if (axis === 'x') return { x: -p.x, y: p.y };
          if (axis === 'y') return { x: p.x, y: -p.y };
        } else if (typeof axis === 'object') {
          // Mirror across arbitrary line
          return this._mirrorAcrossLine(p, axis);
        }
        return p;
      });

      return {
        ...entity,
        name: entity.name + '_mirrored',
        points: mirroredPoints,
        edges: this._pointsToEdges(mirroredPoints, entity.closed)
      };
    },

    /**
     * Round corner between two intersecting lines (2D fillet)
     * @param {Object} line1 - first line
     * @param {Object} line2 - second line
     * @param {number} radius - fillet radius
     * @returns {Object} fillet arc
     */
    fillet2D(line1, line2, radius = 5) {
      // Find intersection
      const intersection = this._findIntersection(line1, line2);
      if (!intersection) return null;

      // Create fillet arc at intersection
      const v1 = { x: line1.points[1].x - line1.points[0].x, y: line1.points[1].y - line1.points[0].y };
      const v2 = { x: line2.points[1].x - line2.points[0].x, y: line2.points[1].y - line2.points[0].y };

      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);
      v1.x /= len1; v1.y /= len1;
      v2.x /= len2; v2.y /= len2;

      // Generate arc
      const startAngle = Math.atan2(v1.y, v1.x);
      const endAngle = Math.atan2(v2.y, v2.x);
      const arcPoints = [];
      const steps = 16;

      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + (endAngle - startAngle) * (i / steps);
        arcPoints.push({
          x: intersection.x + radius * Math.cos(angle),
          y: intersection.y + radius * Math.sin(angle)
        });
      }

      return {
        type: 'arc',
        name: 'Fillet_2D',
        points: arcPoints,
        edges: this._pointsToEdges(arcPoints, false),
        color: '#FF6666',
        radius
      };
    },

    /**
     * Bevel corner between two intersecting lines (2D chamfer)
     * @param {Object} line1 - first line
     * @param {Object} line2 - second line
     * @param {number} size - chamfer size
     * @returns {Object} chamfer line
     */
    chamfer2D(line1, line2, size = 5) {
      const intersection = this._findIntersection(line1, line2);
      if (!intersection) return null;

      // Points at distance 'size' along each line from intersection
      const v1 = { x: line1.points[1].x - line1.points[0].x, y: line1.points[1].y - line1.points[0].y };
      const v2 = { x: line2.points[1].x - line2.points[0].x, y: line2.points[1].y - line2.points[0].y };

      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);
      v1.x /= len1; v1.y /= len1;
      v2.x /= len2; v2.y /= len2;

      const pt1 = { x: intersection.x + size * v1.x, y: intersection.y + size * v1.y };
      const pt2 = { x: intersection.x + size * v2.x, y: intersection.y + size * v2.y };

      return {
        type: 'line',
        name: 'Chamfer_2D',
        points: [pt1, pt2],
        edges: [{ start: pt1, end: pt2 }],
        color: '#FF99FF'
      };
    },

    /**
     * Detect closed regions from sketch entities
     * @param {Array} entities - sketch entities
     * @returns {Array} detected regions (each is a closed polygon)
     */
    detectRegions(entities = []) {
      const regions = [];

      // Build adjacency graph
      const adjacency = new Map();
      for (const e of entities) {
        if (!e.points || e.points.length < 2) continue;
        const start = e.points[0];
        const end = e.points[e.points.length - 1];

        const key = `${start.x.toFixed(2)},${start.y.toFixed(2)}`;
        if (!adjacency.has(key)) adjacency.set(key, []);
        adjacency.get(key).push({ entity: e, end });
      }

      // Trace closed loops
      const visited = new Set();
      for (const entity of entities) {
        if (!entity.points || entity.points.length < 2) continue;

        const startKey = `${entity.points[0].x.toFixed(2)},${entity.points[0].y.toFixed(2)}`;
        if (visited.has(startKey)) continue;

        const loop = this._traceLoop(entity, adjacency, visited);
        if (loop && loop.length > 2) {
          regions.push({
            type: 'region',
            name: `Region_${regions.length + 1}`,
            boundary: loop,
            closed: true,
            color: 'rgba(100, 150, 255, 0.2)'
          });
        }
      }

      return regions;
    },

    /**
     * Toggle snap mode
     * @param {number} snapMode - SNAP_* constant
     * @param {boolean} enabled - enable or disable
     */
    setSnapMode(snapMode, enabled = true) {
      if (enabled) {
        this.enabledSnaps |= snapMode;
      } else {
        this.enabledSnaps &= ~snapMode;
      }
    },

    /**
     * Find snap point near cursor
     * @param {Object} cursor - {x, y}
     * @param {Array} entities - sketch entities
     * @returns {Object|null} snap point or null
     */
    findSnapPoint(cursor, entities = []) {
      let bestSnap = null;
      let bestDist = this.snapRadius;

      for (const entity of entities) {
        if (!entity.points) continue;

        for (let i = 0; i < entity.points.length; i++) {
          const pt = entity.points[i];

          // Endpoint snap
          if ((this.enabledSnaps & this.SNAP_ENDPOINT) && i === 0) {
            const d = this._distToPoint(cursor, pt);
            if (d < bestDist) {
              bestDist = d;
              bestSnap = { ...pt, type: 'endpoint', entity, index: i };
            }
          }

          // Midpoint snap
          if (this.enabledSnaps & this.SNAP_MIDPOINT) {
            if (i < entity.points.length - 1) {
              const next = entity.points[i + 1];
              const mid = { x: (pt.x + next.x) / 2, y: (pt.y + next.y) / 2 };
              const d = this._distToPoint(cursor, mid);
              if (d < bestDist) {
                bestDist = d;
                bestSnap = { ...mid, type: 'midpoint', entity, index: i };
              }
            }
          }

          // Center snap (for circles/arcs)
          if ((this.enabledSnaps & this.SNAP_CENTER) && entity.cx !== undefined) {
            const d = this._distToPoint(cursor, { x: entity.cx, y: entity.cy });
            if (d < bestDist) {
              bestDist = d;
              bestSnap = { x: entity.cx, y: entity.cy, type: 'center', entity };
            }
          }
        }
      }

      return bestSnap;
    },

    /**
     * Draw snap indicator (visual feedback)
     * @param {Object} snapPoint - snap point with type
     * @param {CanvasRenderingContext2D} ctx - canvas context
     */
    drawSnapIndicator(snapPoint, ctx) {
      if (!snapPoint || !this.showSnapIndicators) return;

      const size = 8;
      const { x, y, type } = snapPoint;

      ctx.save();
      ctx.fillStyle = '#FF00FF';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;

      switch (type) {
        case 'endpoint':
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          break;
        case 'midpoint':
          ctx.beginPath();
          ctx.arc(x, y, size / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'center':
          ctx.beginPath();
          ctx.arc(x, y, size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
        case 'intersection':
          ctx.beginPath();
          ctx.arc(x, y, size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
      }

      ctx.restore();
    },

    // =========== PRIVATE HELPERS ===========

    _pointsToEdges(points, closed = false) {
      const edges = [];
      for (let i = 0; i < points.length - 1; i++) {
        edges.push({ start: points[i], end: points[i + 1] });
      }
      if (closed && points.length > 0) {
        edges.push({ start: points[points.length - 1], end: points[0] });
      }
      return edges;
    },

    _catmullRom(points, tension, closed) {
      if (points.length < 2) return points;

      const result = [];
      const n = closed ? points.length : points.length - 1;
      const segments = 16;

      for (let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + points.length) % points.length];
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];

        for (let t = 0; t < segments; t++) {
          const s = t / segments;
          const s2 = s * s;
          const s3 = s2 * s;

          const c0 = -0.5 * s3 + s2 - 0.5 * s;
          const c1 = 1.5 * s3 - 2.5 * s2 + 1.0;
          const c2 = -1.5 * s3 + 2.0 * s2 + 0.5 * s;
          const c3 = 0.5 * s3 - 0.5 * s2;

          result.push({
            x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
            y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y
          });
        }
      }

      return result;
    },

    _traceTextOutline(imageData, width, height) {
      // Simplified: return a rectangle outline
      return [
        { x: 0, y: 0 }, { x: width, y: 0 },
        { x: width, y: height }, { x: 0, y: height }
      ];
    },

    _distToPoint(p1, p2) {
      return Math.hypot(p1.x - p2.x, p1.y - p2.y);
    },

    _findIntersection(entity1, entity2) {
      if (!entity1.edges || !entity2.edges) return null;

      for (const e1 of entity1.edges) {
        for (const e2 of entity2.edges) {
          const pt = this._lineIntersection(e1.start, e1.end, e2.start, e2.end);
          if (pt) return pt;
        }
      }
      return null;
    },

    _lineIntersection(p1, p2, p3, p4) {
      const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
      const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

      const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(denom) < 0.0001) return null;

      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      if (t < 0 || t > 1) return null;

      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
      };
    },

    _nearestPointOnEntity(point, entity) {
      let nearest = null;
      let minDist = Infinity;

      if (entity.points) {
        for (const p of entity.points) {
          const d = this._distToPoint(point, p);
          if (d < minDist) {
            minDist = d;
            nearest = p;
          }
        }
      }

      return nearest;
    },

    _mirrorAcrossLine(point, line) {
      const { x1, y1, x2, y2 } = line;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const nx = dx / len, ny = dy / len;

      const px = point.x - x1, py = point.y - y1;
      const proj = px * nx + py * ny;
      const closestX = x1 + proj * nx;
      const closestY = y1 + proj * ny;

      return {
        x: 2 * closestX - point.x,
        y: 2 * closestY - point.y
      };
    },

    _traceLoop(startEntity, adjacency, visited) {
      const loop = [];
      let current = startEntity;

      while (current) {
        const endKey = `${current.points[current.points.length - 1].x.toFixed(2)},${current.points[current.points.length - 1].y.toFixed(2)}`;
        visited.add(endKey);
        loop.push(...current.points);

        const nextList = adjacency.get(endKey) || [];
        current = nextList.length > 0 ? nextList[0].entity : null;

        if (current && visited.has(`${current.points[0].x.toFixed(2)},${current.points[0].y.toFixed(2)}`)) {
          break;
        }
      }

      return loop;
    }
  };

  // Register on window
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.sketchEnhance = sketchEnhance;

  console.log('[sketchEnhance] Loaded: polygon, spline, text, ellipse, slot, trim, extend, split, offset, mirror, fillet2D, chamfer2D, detectRegions');
})();
