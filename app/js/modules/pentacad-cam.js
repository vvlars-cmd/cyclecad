/**
 * @file pentacad-cam.js — Phase-1 CAM engine for the Pentacad / cycleCAD Suite.
 *       Strategies: 2D contour, pocket, drill, face. Post: Pentamachine V2 dialect.
 *       Registered as window.CycleCAD.PentacadCAM. AGPL-3.0-only.
 * @version 0.2.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 */

'use strict';

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.PentacadCAM = (() => {
  const VERSION = '0.2.0';

  // ============================================================================
  // STRATEGIES — public registry (12 entries, stable IDs)
  // ============================================================================

  const STRATEGIES = [
    { id: '2d-contour',      name: '2D Contour',       kind: '2d' },
    { id: 'adaptive-clear',  name: 'Adaptive Clear',   kind: '2d' },
    { id: 'pocket',          name: 'Pocket',           kind: '2d' },
    { id: 'drill',           name: 'Drill',            kind: 'drill' },
    { id: 'parallel',        name: 'Parallel',         kind: '3d' },
    { id: 'radial',          name: 'Radial',           kind: '3d' },
    { id: 'scallop',         name: 'Scallop',          kind: '3d' },
    { id: 'projection',      name: 'Projection',       kind: '3d' },
    { id: 'flow',            name: 'Flow',             kind: '3d' },
    { id: 'bore-thread',     name: 'Bore / Thread',    kind: 'drill' },
    { id: 'chamfer-deburr',  name: 'Chamfer / Deburr', kind: '2d' },
    { id: 'face',            name: 'Face',             kind: '2d' },
  ];

  // ============================================================================
  // POLYGON GEOMETRY HELPERS (pure JS, 0 deps)
  // ============================================================================

  const EPS = 1e-9;

  /** Signed area (2x). Positive = CCW. */
  function signedArea2(poly) {
    let s = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % n];
      s += (x1 * y2 - x2 * y1);
    }
    return s;
  }

  function isCCW(poly) { return signedArea2(poly) > 0; }

  function ensureCCW(poly) {
    return isCCW(poly) ? poly.slice() : poly.slice().reverse();
  }

  function polygonBounds(poly) {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const [x, y] of poly) {
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    }
    return { xMin, yMin, xMax, yMax };
  }

  /** Parallel-line polygon offset. +d outward, -d inward. CCW input. */
  function offsetPolygon(poly, d) {
    const ccw = ensureCCW(poly);
    const n = ccw.length;
    if (n < 3) return ccw.slice();

    // Build offset line for each edge: point + direction.
    const lines = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = ccw[i];
      const [x2, y2] = ccw[(i + 1) % n];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      // Inward normal on CCW points to the left of the edge direction: (-uy, ux).
      const nx = -uy, ny = ux;
      const ox = x1 + nx * d;
      const oy = y1 + ny * d;
      lines.push({ p: [ox, oy], u: [ux, uy] });
    }

    // Intersect consecutive offset lines.
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = lines[i];
      const b = lines[(i + 1) % n];
      const pt = lineLineIntersect(a.p, a.u, b.p, b.u);
      if (pt) {
        out.push(pt);
      } else {
        // Parallel edges: degenerate — use end-of-a.
        out.push([a.p[0] + a.u[0], a.p[1] + a.u[1]]);
      }
    }
    return out;
  }

  /** Line-line intersect from (point, unit-direction) pairs. null if parallel. */
  function lineLineIntersect(p1, u1, p2, u2) {
    const [x1, y1] = p1, [ux1, uy1] = u1;
    const [x2, y2] = p2, [ux2, uy2] = u2;
    const denom = ux1 * uy2 - uy1 * ux2;
    if (Math.abs(denom) < EPS) return null;
    const t = ((x2 - x1) * uy2 - (y2 - y1) * ux2) / denom;
    return [x1 + t * ux1, y1 + t * uy1];
  }

  /** Ray-cast point-in-polygon test. */
  function pointInPolygon(pt, poly) {
    const [x, y] = pt;
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < ((xj - xi) * (y - yi)) / ((yj - yi) || EPS) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Horizontal scanline × polygon → disjoint [xA,xB] intervals inside. */
  function horizontalScanlineIntersections(poly, y) {
    const xs = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % n];
      if (Math.abs(y2 - y1) < EPS) continue;                        // horizontal edge, skip
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      if (y < yMin - EPS || y > yMax + EPS) continue;               // outside edge span
      const t = (y - y1) / (y2 - y1);
      if (t < 0 || t > 1) continue;
      const x = x1 + t * (x2 - x1);
      xs.push(x);
    }
    xs.sort((a, b) => a - b);
    // Pair intersections as enter/exit.
    const intervals = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > EPS) intervals.push([xs[i], xs[i + 1]]);
    }
    return intervals;
  }

  // ============================================================================
  // SAFE-Z / CONSTANTS
  // ============================================================================

  const DEFAULT_SAFE_Z = 5.0;    // mm above top surface for rapids
  const DEFAULT_RAPID_FEED = 3000;

  function makeMove(extra) {
    return Object.assign({ mode: 'linear' }, extra);
  }

  // ============================================================================
  // STRATEGY 1 — 2D CONTOUR
  // ============================================================================

  /** Offset-based 2D contour with lead-in ramp + Z-layered passes.
   *  op: { boundary[], depth, stepdown, stockToLeave?, tool:{dia}, feeds:{cut,plunge,rapid}, leadIn?, safeZ? } */
  function generate2DContour(op) {
    const {
      boundary, depth, stepdown,
      stockToLeave = 0,
      tool, feeds,
      leadIn = 'ramp',
      safeZ = DEFAULT_SAFE_Z,
    } = op;

    if (!boundary || boundary.length < 3) throw new Error('2d-contour: boundary needs ≥3 pts');
    if (!(depth > 0) || !(stepdown > 0)) throw new Error('2d-contour: depth & stepdown must be > 0');
    if (!tool || !(tool.dia > 0)) throw new Error('2d-contour: tool.dia required');

    // Inward offset (climb milling on a CCW external contour).
    const offset = tool.dia / 2 + stockToLeave;
    const offsetPath = offsetPolygon(ensureCCW(boundary), -offset);

    const toolpath = [];
    const feedCut = feeds?.cut ?? 500;
    const feedPlunge = feeds?.plunge ?? 150;
    const feedRapid = feeds?.rapid ?? DEFAULT_RAPID_FEED;

    // Pre-op: rapid to safe Z over first point.
    const [sx, sy] = offsetPath[0];
    toolpath.push(makeMove({ x: sx, y: sy, z: safeZ, feed: feedRapid, mode: 'rapid', comment: 'approach' }));

    // Layer loop.
    let zTop = 0;
    const layers = Math.ceil(depth / stepdown);
    for (let i = 1; i <= layers; i++) {
      const zBottom = -Math.min(depth, i * stepdown);

      // Lead-in: 45° ramp from zTop down to zBottom over 2×tool.dia along the path.
      if (leadIn === 'ramp') {
        const rampLen = Math.max(tool.dia * 2, Math.abs(zBottom - zTop) * 1.5);
        const [x0, y0] = offsetPath[0];
        const [x1, y1] = offsetPath[1 % offsetPath.length];
        const ex = x1 - x0, ey = y1 - y0;
        const elen = Math.hypot(ex, ey) || 1;
        const rx = x0 + (ex / elen) * rampLen;
        const ry = y0 + (ey / elen) * rampLen;
        toolpath.push(makeMove({ x: x0, y: y0, z: zTop, feed: feedPlunge, comment: `layer ${i}: ramp start` }));
        toolpath.push(makeMove({ x: rx, y: ry, z: zBottom, feed: feedPlunge, comment: 'ramp in' }));
        // Return to start at zBottom to begin the offset loop.
        toolpath.push(makeMove({ x: x0, y: y0, z: zBottom, feed: feedCut, comment: 'to start' }));
      } else {
        // Simple arc / straight plunge.
        toolpath.push(makeMove({ x: sx, y: sy, z: zBottom, feed: feedPlunge, comment: `layer ${i}: plunge` }));
      }

      // Cut the offset polygon at zBottom.
      for (let k = 1; k <= offsetPath.length; k++) {
        const [x, y] = offsetPath[k % offsetPath.length];
        toolpath.push(makeMove({ x, y, z: zBottom, feed: feedCut }));
      }

      // Retract between layers.
      toolpath.push(makeMove({ x: sx, y: sy, z: safeZ, feed: feedRapid, mode: 'rapid', comment: 'retract' }));
      zTop = zBottom;
    }

    return {
      strategyId: '2d-contour',
      name: op.name || '2D Contour',
      toolpath,
      meta: {
        boundaryPoints: boundary.length,
        offsetPoints: offsetPath.length,
        layers,
        depth,
        stepdown,
        toolDia: tool.dia,
      },
    };
  }

  // ============================================================================
  // STRATEGY 2 — POCKET (zig-zag)
  // ============================================================================

  /** Zig-zag pocket clearing — parallel X-scans per Z-layer inside offset boundary.
   *  op: { boundary[], depth, stepdown, stepover, tool:{dia}, feeds, safeZ? } */
  function generatePocket(op) {
    const {
      boundary, depth, stepdown, stepover,
      tool, feeds,
      safeZ = DEFAULT_SAFE_Z,
    } = op;

    if (!boundary || boundary.length < 3) throw new Error('pocket: boundary needs ≥3 pts');
    if (!(depth > 0)) throw new Error('pocket: depth must be > 0');
    if (!(stepover > 0)) throw new Error('pocket: stepover must be > 0');
    if (!tool || !(tool.dia > 0)) throw new Error('pocket: tool.dia required');

    const feedCut = feeds?.cut ?? 500;
    const feedPlunge = feeds?.plunge ?? 150;
    const feedRapid = feeds?.rapid ?? DEFAULT_RAPID_FEED;

    const clearance = tool.dia / 2;
    const innerPath = offsetPolygon(ensureCCW(boundary), -clearance);
    const bounds = polygonBounds(innerPath);

    const toolpath = [];
    const layers = Math.ceil(depth / stepdown);

    for (let i = 1; i <= layers; i++) {
      const zBottom = -Math.min(depth, i * stepdown);
      let dirPositive = true;
      let firstLineOfLayer = true;

      // Sweep scan lines from yMin to yMax.
      for (let y = bounds.yMin; y <= bounds.yMax + EPS; y += stepover) {
        const intervals = horizontalScanlineIntersections(innerPath, y);
        if (intervals.length === 0) { dirPositive = !dirPositive; continue; }

        // Take the widest interval for simple pockets; more sophisticated
        // logic would handle multiple islands.
        let widest = intervals[0];
        for (const iv of intervals) {
          if ((iv[1] - iv[0]) > (widest[1] - widest[0])) widest = iv;
        }
        let [xA, xB] = widest;
        if (!dirPositive) { const t = xA; xA = xB; xB = t; }

        if (firstLineOfLayer) {
          // Rapid to first start, plunge.
          toolpath.push(makeMove({ x: xA, y, z: safeZ, feed: feedRapid, mode: 'rapid', comment: `pocket L${i} start` }));
          toolpath.push(makeMove({ x: xA, y, z: zBottom, feed: feedPlunge, comment: 'plunge' }));
          firstLineOfLayer = false;
        } else {
          // Link: lift, rapid, plunge.
          toolpath.push(makeMove({ x: xA, y, z: safeZ, feed: feedRapid, mode: 'rapid' }));
          toolpath.push(makeMove({ x: xA, y, z: zBottom, feed: feedPlunge, comment: 'plunge' }));
        }
        // Cut across.
        toolpath.push(makeMove({ x: xB, y, z: zBottom, feed: feedCut }));

        dirPositive = !dirPositive;
      }

      // Retract at end of layer.
      toolpath.push(makeMove({ x: bounds.xMin, y: bounds.yMin, z: safeZ, feed: feedRapid, mode: 'rapid', comment: `pocket L${i} retract` }));
    }

    return {
      strategyId: 'pocket',
      name: op.name || 'Pocket',
      toolpath,
      meta: {
        bounds,
        layers,
        stepover,
        toolDia: tool.dia,
      },
    };
  }

  // ============================================================================
  // STRATEGY 3 — DRILL (peck / chip-break)
  // ============================================================================

  /** Peck drilling — explicit rapids+feeds for sim stepping. pecking: 'g83'|'g73'|'none'.
   *  op: { holes:[{x,y,depth}], tool:{dia}, feeds, pecking?, peckDepth?, safeZ? } */
  function generateDrill(op) {
    const {
      holes, tool, feeds,
      pecking = 'g83',
      peckDepth,
      safeZ = DEFAULT_SAFE_Z,
    } = op;

    if (!Array.isArray(holes) || holes.length === 0) throw new Error('drill: holes[] required');
    if (!tool || !(tool.dia > 0)) throw new Error('drill: tool.dia required');

    const feedPlunge = feeds?.plunge ?? 100;
    const feedRapid = feeds?.rapid ?? DEFAULT_RAPID_FEED;

    const toolpath = [];

    for (let h = 0; h < holes.length; h++) {
      const hole = holes[h];
      const { x, y, depth } = hole;
      if (!(depth > 0)) throw new Error(`drill: hole[${h}].depth must be > 0`);

      const step = peckDepth && peckDepth > 0 ? peckDepth : Math.max(tool.dia * 0.5, depth);

      // Rapid above hole.
      toolpath.push(makeMove({ x, y, z: safeZ, feed: feedRapid, mode: 'rapid', comment: `hole ${h + 1}: over` }));

      if (pecking === 'none') {
        toolpath.push(makeMove({ x, y, z: -depth, feed: feedPlunge, comment: 'straight plunge' }));
        toolpath.push(makeMove({ x, y, z: safeZ, feed: feedRapid, mode: 'rapid', comment: 'retract' }));
        continue;
      }

      // Peck cycle.
      let cur = 0;
      while (cur < depth - EPS) {
        const next = Math.min(cur + step, depth);
        // Feed to next depth.
        toolpath.push(makeMove({ x, y, z: -next, feed: feedPlunge, comment: `peck to ${next.toFixed(3)}` }));
        if (next >= depth - EPS) break;
        if (pecking === 'g83') {
          // Full retract to safeZ.
          toolpath.push(makeMove({ x, y, z: safeZ, feed: feedRapid, mode: 'rapid', comment: 'G83 retract' }));
          // Rapid back to slightly above previous depth.
          const rePos = -Math.max(0, next - 0.5);
          toolpath.push(makeMove({ x, y, z: rePos, feed: feedRapid, mode: 'rapid', comment: 'G83 re-enter' }));
        } else {
          // G73 — small chip break.
          const rePos = -Math.max(0, next - 0.25);
          toolpath.push(makeMove({ x, y, z: rePos, feed: feedRapid, mode: 'rapid', comment: 'G73 chip break' }));
        }
        cur = next;
      }

      // Final full retract.
      toolpath.push(makeMove({ x, y, z: safeZ, feed: feedRapid, mode: 'rapid', comment: 'retract' }));
    }

    return {
      strategyId: 'drill',
      name: op.name || 'Drill',
      toolpath,
      meta: {
        holes: holes.length,
        pecking,
        peckDepth: peckDepth ?? null,
        toolDia: tool.dia,
      },
    };
  }

  // ============================================================================
  // STRATEGY 4 — FACE
  // ============================================================================

  /** Stock-top surfacing — zig-zag over rectangular area. Overreach = tool.dia/2.
   *  op: { stockBox:{xMin,yMin,xMax,yMax}, depth, stepdown, stepover, tool:{dia}, feeds, direction?, safeZ? } */
  function generateFace(op) {
    const {
      stockBox, depth, stepdown, stepover,
      tool, feeds,
      direction = 'climb',
      safeZ = DEFAULT_SAFE_Z,
    } = op;

    if (!stockBox) throw new Error('face: stockBox required');
    if (!(depth > 0)) throw new Error('face: depth must be > 0');
    if (!(stepover > 0)) throw new Error('face: stepover > 0 required');

    const feedCut = feeds?.cut ?? 800;
    const feedPlunge = feeds?.plunge ?? 200;
    const feedRapid = feeds?.rapid ?? DEFAULT_RAPID_FEED;

    const over = tool.dia / 2;
    const xMin = stockBox.xMin - over;
    const xMax = stockBox.xMax + over;
    const yMin = stockBox.yMin - over;
    const yMax = stockBox.yMax + over;

    const toolpath = [];
    const layers = Math.ceil(depth / stepdown);

    for (let i = 1; i <= layers; i++) {
      const zBottom = -Math.min(depth, i * stepdown);
      let dirPositive = true;
      let firstLine = true;

      for (let y = yMin; y <= yMax + EPS; y += stepover) {
        const xA = dirPositive ? xMin : xMax;
        const xB = dirPositive ? xMax : xMin;
        if (firstLine) {
          toolpath.push(makeMove({ x: xA, y, z: safeZ, feed: feedRapid, mode: 'rapid', comment: `face L${i}` }));
          toolpath.push(makeMove({ x: xA, y, z: zBottom, feed: feedPlunge, comment: 'plunge' }));
          firstLine = false;
        } else {
          toolpath.push(makeMove({ x: xA, y, z: zBottom, feed: feedCut, comment: 'step' }));
        }
        toolpath.push(makeMove({ x: xB, y, z: zBottom, feed: feedCut }));
        dirPositive = !dirPositive;
      }

      toolpath.push(makeMove({ x: xMin, y: yMin, z: safeZ, feed: feedRapid, mode: 'rapid', comment: `face L${i} retract` }));
    }

    return {
      strategyId: 'face',
      name: op.name || 'Face',
      toolpath,
      meta: { stockBox, layers, stepover, toolDia: tool.dia, direction },
    };
  }

  // ============================================================================
  // STRATEGY 5 — ADAPTIVE CLEAR (concentric-ring approximation)
  // ============================================================================

  /**
   * Adaptive Clear — high-feed roughing via successive inward offsets of the
   * boundary. Phase 1B approximation: concentric rings at stepover intervals.
   * True trochoidal arcs with constant material-engagement angle are Phase 2.
   *
   * @param {object} op
   * @param {Array<[number,number]>} op.boundary   Pocket boundary (CCW or CW).
   * @param {number}   op.depth                    Depth of pocket (mm, positive).
   * @param {number}   op.stepdown                 Per-layer Z step (mm, positive).
   * @param {number}   op.stepover                 Ring-to-ring gap (mm). Typical 0.2–0.4 × tool.dia for true trochoidal; 0.4–0.6 × tool.dia for this concentric approximation.
   * @param {number}   [op.stockToLeave=0]         Thickness of stock left on walls (mm).
   * @param {{dia:number}} op.tool
   * @param {{cut:number, plunge:number, rapid:number}} op.feeds
   * @param {number}   [op.safeZ=5.0]              Retract height.
   * @param {number}   [op.maxRings=200]           Ring-count safety cap.
   * @returns {object} toolpath record
   */
  function generateAdaptiveClear(op) {
    const {
      boundary, depth, stepdown,
      stepover,
      stockToLeave = 0,
      tool, feeds,
      safeZ = DEFAULT_SAFE_Z,
      maxRings = 200,
    } = op;

    if (!boundary || boundary.length < 3) throw new Error('adaptive-clear: boundary needs ≥3 pts');
    if (!(depth > 0) || !(stepdown > 0)) throw new Error('adaptive-clear: depth & stepdown must be > 0');
    if (!(stepover > 0)) throw new Error('adaptive-clear: stepover > 0 required');
    if (!tool || !(tool.dia > 0)) throw new Error('adaptive-clear: tool.dia required');

    const feedCut = feeds?.cut ?? 800;
    const feedPlunge = feeds?.plunge ?? 250;
    const feedRapid = feeds?.rapid ?? DEFAULT_RAPID_FEED;

    // Build concentric inward offsets.
    const firstOffset = tool.dia / 2 + stockToLeave;
    const firstRing = offsetPolygon(ensureCCW(boundary), -firstOffset);
    const rings = [firstRing];
    const minAreaThreshold = Math.PI * Math.pow(tool.dia / 2, 2) * 0.5;  // stop when ring collapses smaller than half a tool footprint
    let current = firstRing;
    for (let i = 0; i < maxRings; i++) {
      const next = offsetPolygon(current, -stepover);
      const area = Math.abs(signedArea2(next) / 2);
      if (!next || next.length < 3 || area < minAreaThreshold) break;
      // Sanity: if successive ring hasn't actually shrunk, stop.
      const prevArea = Math.abs(signedArea2(current) / 2);
      if (area >= prevArea - EPS) break;
      rings.push(next);
      current = next;
    }

    // Build layered toolpath: for each Z layer, run outermost ring first (wider
    // cuts), then inward. Retract to safe-Z between layers (not between rings
    // in the same layer — each ring flows into the next via a short traverse).
    const toolpath = [];
    const layers = Math.ceil(depth / stepdown);

    toolpath.push(makeMove({
      x: rings[0][0][0], y: rings[0][0][1], z: safeZ,
      mode: 'rapid', feed: feedRapid, comment: 'adaptive: approach first ring'
    }));

    for (let l = 1; l <= layers; l++) {
      const zBottom = -Math.min(depth, l * stepdown);
      // Start from outer ring, retract to safe Z, rapid to ring start, plunge
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        if (r === 0) {
          // Rapid to ring start at safe Z (we may be coming from previous layer's retract)
          toolpath.push(makeMove({ x: ring[0][0], y: ring[0][1], z: safeZ, mode: 'rapid', feed: feedRapid, comment: `adaptive L${l} ring ${r+1}/${rings.length}` }));
          toolpath.push(makeMove({ x: ring[0][0], y: ring[0][1], z: zBottom, feed: feedPlunge, comment: 'plunge' }));
        } else {
          // Short traverse between rings at cutting depth (avoids air-cuts)
          toolpath.push(makeMove({ x: ring[0][0], y: ring[0][1], z: zBottom, feed: feedCut, comment: `traverse to ring ${r+1}` }));
        }
        // Follow ring
        for (let i = 1; i < ring.length; i++) {
          toolpath.push(makeMove({ x: ring[i][0], y: ring[i][1], z: zBottom, feed: feedCut }));
        }
        // Close ring (back to start)
        toolpath.push(makeMove({ x: ring[0][0], y: ring[0][1], z: zBottom, feed: feedCut, comment: 'close ring' }));
      }
      // Retract at end of layer
      toolpath.push(makeMove({
        x: rings[0][0][0], y: rings[0][0][1], z: safeZ,
        mode: 'rapid', feed: feedRapid, comment: `adaptive L${l} retract`
      }));
    }

    return {
      strategyId: 'adaptive-clear',
      name: op.name || 'Adaptive Clear',
      toolpath,
      meta: {
        rings: rings.length,
        layers,
        stepover,
        stepdown,
        toolDia: tool.dia,
        totalPoints: toolpath.length,
        approximation: 'concentric-ring (Phase 1B). True trochoidal with constant engagement arcs = Phase 2.',
        recommendedStepover: (0.25 * tool.dia).toFixed(2) + ' mm for true trochoidal; ' + (0.4 * tool.dia).toFixed(2) + '-' + (0.6 * tool.dia).toFixed(2) + ' mm for this approximation',
      },
    };
  }

  // ============================================================================
  // STRATEGY 6 — CHAMFER / DEBURR
  // ============================================================================

  /**
   * Chamfer / Deburr — follow a boundary polygon at a fixed offset with a V-bit
   * or ball endmill. Single-depth edge-following pass. Produces a chamfered
   * edge per AWS/DIN convention.
   *
   * Chamfer size = (leg) mm. V-bit engages at (leg × tan(angle/2)) below the
   * top surface. We keep this simple: one pass at Z = -chamferDepth along the
   * boundary with tool.dia/2 + offset correction to set the outside of the V.
   *
   * @param {object} op
   * @param {Array<[number,number]>} op.boundary  Edge to chamfer (closed polygon).
   * @param {number}   op.chamferSize              Chamfer leg size in mm.
   * @param {{dia:number, angle_deg?:number, type?:string}} op.tool  V-bit or ball.
   * @param {{cut:number, plunge:number, rapid:number}} op.feeds
   * @param {number}   [op.safeZ=5.0]
   */
  function generateChamferDeburr(op) {
    const { boundary, chamferSize = 0.5, tool, feeds, safeZ = DEFAULT_SAFE_Z } = op;
    if (!boundary || boundary.length < 3) throw new Error('chamfer: boundary needs ≥3 pts');
    if (!tool || !(tool.dia > 0)) throw new Error('chamfer: tool.dia required');

    const feedCut = feeds?.cut ?? 500;
    const feedPlunge = feeds?.plunge ?? 150;
    const feedRapid = feeds?.rapid ?? DEFAULT_RAPID_FEED;

    const angleDeg = (tool.angle_deg != null) ? tool.angle_deg : ((tool.type === 'vbit') ? 90 : 180);
    // For a V-bit at angle θ, cutting a chamfer of leg L requires engagement depth
    // h = L / tan(θ/2). For a ball (θ=180°), depth ≈ L/2.
    const theta = angleDeg * Math.PI / 180;
    const engagementDepth = (angleDeg >= 180)
      ? chamferSize / 2
      : chamferSize / Math.tan(theta / 2);

    // Edge-following path — just follow the boundary ring at the engagement depth.
    const path = ensureCCW(boundary);
    const toolpath = [];
    toolpath.push(makeMove({ x: path[0][0], y: path[0][1], z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'chamfer: approach' }));
    toolpath.push(makeMove({ x: path[0][0], y: path[0][1], z: -engagementDepth, feed: feedPlunge, comment: 'plunge to chamfer depth' }));
    for (let i = 1; i < path.length; i++) {
      toolpath.push(makeMove({ x: path[i][0], y: path[i][1], z: -engagementDepth, feed: feedCut }));
    }
    // Close ring
    toolpath.push(makeMove({ x: path[0][0], y: path[0][1], z: -engagementDepth, feed: feedCut, comment: 'close' }));
    toolpath.push(makeMove({ x: path[0][0], y: path[0][1], z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'retract' }));

    return {
      strategyId: 'chamfer-deburr',
      name: op.name || 'Chamfer / Deburr',
      toolpath,
      meta: {
        chamferSize,
        engagementDepth,
        toolAngle: angleDeg,
        toolDia: tool.dia,
        note: 'Single-depth edge-follow. For multi-pass chamfers (heavier cut), loop the op at increasing depths manually.'
      }
    };
  }

  // ============================================================================
  // STRATEGY 7 — BORE / THREAD
  // ============================================================================

  /**
   * Bore (single-pass for exact-Ø) or helical-interpolate bore (for oversize).
   * Thread-mill mode follows a helical path with configurable pitch.
   *
   * @param {object} op
   * @param {{x:number,y:number}} op.center       Bore center.
   * @param {number}   op.depth                    Total bore depth (mm positive).
   * @param {number}   op.finalDiameter            Desired hole Ø in mm.
   * @param {'bore'|'helix-bore'|'thread-mill'} [op.mode='helix-bore']
   * @param {number}   [op.pitch]                  Helix pitch (mm/rev). Required for helix-bore + thread-mill.
   * @param {number}   [op.startDepth=0]           For thread-mill: start Z.
   * @param {{dia:number}} op.tool
   * @param {{cut:number, plunge:number, rapid:number}} op.feeds
   * @param {number}   [op.safeZ=5.0]
   * @param {number}   [op.segmentsPerTurn=48]
   */
  function generateBoreThread(op) {
    const {
      center, depth, finalDiameter,
      mode = 'helix-bore',
      pitch,
      tool, feeds,
      safeZ = DEFAULT_SAFE_Z,
      segmentsPerTurn = 48,
    } = op;

    if (!center) throw new Error('bore: center required');
    if (!(depth > 0)) throw new Error('bore: depth > 0 required');
    if (!(finalDiameter > 0)) throw new Error('bore: finalDiameter required');
    if (!tool || !(tool.dia > 0)) throw new Error('bore: tool.dia required');

    const feedCut = feeds?.cut ?? 400;
    const feedPlunge = feeds?.plunge ?? 120;
    const feedRapid = feeds?.rapid ?? DEFAULT_RAPID_FEED;

    const toolpath = [];
    const [cx, cy] = [center.x, center.y];

    if (mode === 'bore') {
      // Straight plunge — tool.dia must equal finalDiameter.
      if (Math.abs(tool.dia - finalDiameter) > 0.05) {
        throw new Error('bore (straight-plunge): tool.dia must match finalDiameter (within 0.05mm). Use mode=helix-bore for oversize.');
      }
      toolpath.push(makeMove({ x: cx, y: cy, z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'straight bore approach' }));
      toolpath.push(makeMove({ x: cx, y: cy, z: -depth, feed: feedPlunge, comment: 'plunge' }));
      toolpath.push(makeMove({ x: cx, y: cy, z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'retract' }));
    } else if (mode === 'helix-bore') {
      // Helical interpolate bore — tool must be SMALLER than finalDiameter.
      if (tool.dia >= finalDiameter) {
        throw new Error('helix-bore: tool.dia must be < finalDiameter');
      }
      const p = pitch ?? Math.min(depth, tool.dia * 0.5);  // default: 0.5 × tool.dia per turn
      const r = (finalDiameter - tool.dia) / 2;
      const turns = Math.ceil(depth / p);
      const totalSegments = turns * segmentsPerTurn;

      // Approach + start at angle 0
      toolpath.push(makeMove({ x: cx + r, y: cy, z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'helix-bore approach' }));
      toolpath.push(makeMove({ x: cx + r, y: cy, z: 0,     feed: feedPlunge, comment: 'to top' }));

      for (let i = 1; i <= totalSegments; i++) {
        const t = i / totalSegments;
        const ang = t * turns * 2 * Math.PI;
        const z = -t * depth;
        toolpath.push(makeMove({
          x: cx + r * Math.cos(ang),
          y: cy + r * Math.sin(ang),
          z,
          feed: feedCut,
          mode: i === 1 ? 'linear' : 'linear'
        }));
      }
      // Finish pass at full depth (bottom)
      for (let i = 1; i <= segmentsPerTurn; i++) {
        const ang = (i / segmentsPerTurn) * 2 * Math.PI;
        toolpath.push(makeMove({
          x: cx + r * Math.cos(ang),
          y: cy + r * Math.sin(ang),
          z: -depth,
          feed: feedCut,
          comment: i === segmentsPerTurn ? 'finish ring' : undefined
        }));
      }
      // Retract
      toolpath.push(makeMove({ x: cx, y: cy, z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'retract' }));
    } else if (mode === 'thread-mill') {
      if (!pitch) throw new Error('thread-mill: pitch required (e.g. 1.25 for M8 coarse)');
      const r = (finalDiameter - tool.dia) / 2;
      if (r < 0) throw new Error('thread-mill: tool.dia must be < finalDiameter');
      const turns = Math.ceil(depth / pitch);
      const segments = turns * segmentsPerTurn;
      toolpath.push(makeMove({ x: cx + r, y: cy, z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'thread-mill approach' }));
      toolpath.push(makeMove({ x: cx + r, y: cy, z: -depth, feed: feedPlunge, comment: 'plunge to thread bottom' }));
      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const ang = t * turns * 2 * Math.PI;
        const z = -depth + t * depth;  // climb upward as we thread
        toolpath.push(makeMove({
          x: cx + r * Math.cos(ang),
          y: cy + r * Math.sin(ang),
          z,
          feed: feedCut
        }));
      }
      toolpath.push(makeMove({ x: cx, y: cy, z: safeZ, mode: 'rapid', feed: feedRapid, comment: 'retract' }));
    } else {
      throw new Error('bore: unknown mode: ' + mode);
    }

    return {
      strategyId: 'bore-thread',
      name: op.name || ('Bore / Thread (' + mode + ')'),
      toolpath,
      meta: { mode, finalDiameter, depth, pitch, toolDia: tool.dia, points: toolpath.length },
    };
  }

  // ============================================================================
  // FEEDS & SPEEDS
  // ============================================================================

  // Feed/speed table keyed by "tool:material".
  // Feeds in mm/min (metric) — post-processor converts if machine is imperial.
  // Spindle in RPM.
  const FEED_TABLE = {
    'endmill-6.35:aluminum':  { cut: 800, plunge: 250, rapid: 3000, rpm: 18000 },
    'endmill-6.35:steel':     { cut: 250, plunge: 100, rapid: 3000, rpm: 6000 },
    'endmill-6.35:wood':      { cut: 2000, plunge: 600, rapid: 3000, rpm: 24000 },
    'endmill-6.35:acrylic':   { cut: 900, plunge: 250, rapid: 3000, rpm: 14000 },
    'endmill-6.35:brass':     { cut: 600, plunge: 200, rapid: 3000, rpm: 10000 },
    'endmill-3.175:aluminum': { cut: 500, plunge: 150, rapid: 3000, rpm: 22000 },
    'endmill-3.175:steel':    { cut: 180, plunge: 80,  rapid: 3000, rpm: 8000 },
    'endmill-3.175:wood':     { cut: 1400, plunge: 400, rapid: 3000, rpm: 24000 },
    'drill-3:aluminum':       { cut: 300, plunge: 200, rapid: 3000, rpm: 8000 },
    'drill-3:steel':          { cut: 120, plunge: 80,  rapid: 3000, rpm: 2500 },
    'ballnose-6:aluminum':    { cut: 700, plunge: 220, rapid: 3000, rpm: 18000 },
    'ballnose-6:steel':       { cut: 220, plunge: 90,  rapid: 3000, rpm: 5500 },
  };

  /** Look up feeds+speeds by "<type>-<dia>:<material>". Fuzzy fallback by material. */
  function recommendFeeds(tool, material) {
    const type = tool?.type ?? 'endmill';
    const dia = tool?.dia ?? 6.35;
    const mat = (material ?? 'aluminum').toLowerCase();
    const key = `${type}-${dia}:${mat}`;
    if (FEED_TABLE[key]) return Object.assign({}, FEED_TABLE[key]);
    // Fuzzy fallback — find any entry for same material.
    const fuzzy = Object.entries(FEED_TABLE).find(([k]) => k.endsWith(`:${mat}`));
    if (fuzzy) return Object.assign({}, fuzzy[1]);
    return { cut: 400, plunge: 150, rapid: DEFAULT_RAPID_FEED, rpm: 12000 };
  }

  // ============================================================================
  // POST-PROCESSOR — Pentamachine V2 dialect
  // ============================================================================

  /** Emit valid Pentamachine V2 G-code. opts: {programNumber?, units?, includeToolComments?}. */
  function emitGCode(toolpaths, machine, opts = {}) {
    const units = opts.units ?? machine?.post?.units ?? 'inch';
    const program = opts.programNumber ?? machine?.post?.programNumber ?? '1001';
    const includeToolComments = opts.includeToolComments !== false;
    const isInch = units === 'inch';
    const conv = (mm) => isInch ? mm / 25.4 : mm;
    const fmt = (v) => v.toFixed(4);
    const feedConv = (mmPerMin) => isInch ? mmPerMin / 25.4 : mmPerMin;

    const lines = [];
    lines.push('%');
    lines.push('(AXIS,stop)');
    lines.push(`(PROGRAM: ${program})`);
    const machId = machine?.id ?? machine?.machineId ?? 'unspecified';
    lines.push(`(PENTACAD v${VERSION} — machine: ${machId} — units: ${units})`);
    lines.push(`(CREATED: ${new Date().toISOString()})`);

    let n = 10;
    const emit = (code) => { lines.push(`N${n} ${code}`); n += 5; };
    const emitRaw = (code) => { lines.push(code); };

    // Modal header.
    emit(`${isInch ? 'G20' : 'G21'} G17 G90 G40 G54`);
    emit('G94');

    // Track state to collapse repeats and detect 5-axis moves.
    let lastTool = null;
    let lastRpm = null;
    let cur = { x: null, y: null, z: null, a: null, b: null };
    let feedMode = 'G94';

    for (let i = 0; i < toolpaths.length; i++) {
      const tp = toolpaths[i];
      if (!tp) continue;

      // Tool change if tool differs.
      const tool = tp.tool || null;
      if (tool && (!lastTool || tool.id !== lastTool.id)) {
        const id = tool.id ?? 1;
        const spec = tool.desc || `${tool.type ?? 'endmill'} ${tool.dia ?? '?'} mm, ${tool.flutes ?? 2} flute`;
        if (includeToolComments) emit(`T${id} M6 (T${id}: ${spec})`);
        else emit(`T${id} M6`);
        lastTool = tool;
      }

      // Spindle start.
      const rpm = tool?.rpm ?? tp.rpm ?? 18000;
      if (rpm !== lastRpm) {
        const coolant = (tool?.coolant ?? tp.coolant ?? 'mist') === 'flood' ? 'M8' : 'M7';
        emit(`M3 S${rpm} ${coolant}`);
        lastRpm = rpm;
      }

      // Op comment.
      emit(`(OP${i + 1}: ${tp.name ?? tp.strategyId ?? 'op'})`);

      for (const mv of tp.toolpath ?? []) {
        const parts = [];
        const has = (k) => mv[k] !== undefined && mv[k] !== null;
        const changed = (k) => has(k) && (cur[k] === null || Math.abs(mv[k] - cur[k]) > 1e-9);

        const isRotary = changed('a') || changed('b');
        const wantFeedMode = isRotary ? 'G93' : 'G94';
        if (wantFeedMode !== feedMode) {
          emit(wantFeedMode);
          feedMode = wantFeedMode;
        }

        const gCode = mv.mode === 'rapid' ? 'G0' : 'G1';
        parts.push(gCode);
        if (changed('x')) parts.push(`X${fmt(conv(mv.x))}`);
        if (changed('y')) parts.push(`Y${fmt(conv(mv.y))}`);
        if (changed('z')) parts.push(`Z${fmt(conv(mv.z))}`);
        if (changed('a')) parts.push(`A${fmt(mv.a)}`);
        if (changed('b')) parts.push(`B${fmt(mv.b)}`);
        if (mv.mode !== 'rapid' && mv.feed != null) parts.push(`F${fmt(feedConv(mv.feed))}`);

        if (parts.length > 1) {
          let line = parts.join(' ');
          if (mv.comment) line += ` (${mv.comment})`;
          emit(line);
        }

        // Update cur.
        ['x', 'y', 'z', 'a', 'b'].forEach(k => { if (has(k)) cur[k] = mv[k]; });
      }
    }

    // Program end.
    emit('G94 M9 M5');
    emit('M30');
    emitRaw('%');
    return lines.join('\n');
  }

  // ============================================================================
  // SETUP + OPERATION MODEL
  // ============================================================================

  let _setupIdSeq = 0;
  let _opIdSeq = 0;

  function createSetup(init = {}) {
    _setupIdSeq += 1;
    return {
      id: `setup-${_setupIdSeq}`,
      name: init.name ?? `Setup ${_setupIdSeq}`,
      stock: init.stock ?? { xMin: -50, yMin: -50, xMax: 50, yMax: 50, zMin: -20, zMax: 0 },
      wcs: init.wcs ?? 'G54',
      fixture: init.fixture ?? null,
      operations: [],
    };
  }

  function addOperation(setup, op) {
    if (!setup) throw new Error('addOperation: setup required');
    _opIdSeq += 1;
    const strategy = STRATEGIES.find(s => s.id === op.strategyId);
    if (!strategy) throw new Error(`addOperation: unknown strategy ${op.strategyId}`);
    const rec = {
      id: `op-${_opIdSeq}`,
      setupId: setup.id,
      strategyId: op.strategyId,
      params: op.params ?? {},
      tool: op.tool ?? { id: 1, type: 'endmill', dia: 6.35, flutes: 2, rpm: 18000 },
      feeds: op.feeds ?? null,
    };
    setup.operations.push(rec);
    return rec;
  }

  /** Run every operation in a setup through the correct generator. */
  function generateAllToolpaths(setup) {
    if (!setup) throw new Error('generateAllToolpaths: setup required');
    const out = [];
    for (const op of setup.operations) {
      const input = Object.assign({}, op.params, {
        tool: op.tool,
        feeds: op.feeds || recommendFeeds(op.tool, op.params.material || 'aluminum'),
        name: op.params?.name,
      });
      let tp;
      switch (op.strategyId) {
        case '2d-contour':     tp = generate2DContour(input); break;
        case 'pocket':         tp = generatePocket(input); break;
        case 'drill':          tp = generateDrill(input); break;
        case 'face':           tp = generateFace(input); break;
        case 'adaptive-clear': tp = generateAdaptiveClear(input); break;
        case 'chamfer-deburr': tp = generateChamferDeburr(input); break;
        case 'bore-thread':    tp = generateBoreThread(input); break;
        default:               tp = { strategyId: op.strategyId, name: op.strategyId, toolpath: [], meta: { stub: true } };
      }
      tp.tool = op.tool;
      out.push(tp);
    }
    return out;
  }

  // ============================================================================
  // G-CODE ROUND-TRIP PARSER (simple modal tracker — enough for self-test)
  // ============================================================================

  function parseGCodePosition(gcode) {
    const lines = gcode.split(/\r?\n/);
    const cur = { x: 0, y: 0, z: 0, a: 0, b: 0 };
    let modal = 'G0';
    let feedMode = 'G94';
    let sawM30 = false;
    const reAxis = /([XYZABIJF])(-?\d+(?:\.\d+)?)/g;

    for (const raw of lines) {
      if (!raw || raw.startsWith('%') || raw.startsWith('(')) continue;
      let line = raw.replace(/\(.*?\)/g, '').trim();
      if (!line) continue;
      // Remove line number.
      line = line.replace(/^N\d+\s*/, '');

      if (/\bM30\b/.test(line)) sawM30 = true;
      if (/\bG93\b/.test(line)) feedMode = 'G93';
      if (/\bG94\b/.test(line)) feedMode = 'G94';
      const gMatch = line.match(/\bG(0|1|2|3)\b/);
      if (gMatch) modal = `G${gMatch[1]}`;

      let m;
      reAxis.lastIndex = 0;
      while ((m = reAxis.exec(line)) !== null) {
        const axis = m[1].toLowerCase();
        const val = parseFloat(m[2]);
        if (axis === 'x') cur.x = val;
        else if (axis === 'y') cur.y = val;
        else if (axis === 'z') cur.z = val;
        else if (axis === 'a') cur.a = val;
        else if (axis === 'b') cur.b = val;
      }
    }
    return { position: cur, modal, feedMode, sawM30 };
  }

  // ============================================================================
  // SELF-TESTS
  // ============================================================================

  function runSelfTests() {
    const results = [];
    const log = (name, pass, detail) => {
      results.push({ name, pass, detail });
      const tag = pass ? 'PASS' : 'FAIL';
      console.log(`[pentacad-cam:selftest] ${tag} — ${name}${detail ? ` — ${detail}` : ''}`);
    };

    // Test 1 — generate rectangular pocket.
    let tp1 = null;
    try {
      const boundary = [
        [-20, -15], [20, -15], [20, 15], [-20, 15],
      ];
      tp1 = generatePocket({
        boundary, depth: 2, stepdown: 1,
        stepover: 0.5,
        tool: { dia: 3.175 },
        feeds: { cut: 500, plunge: 150, rapid: 3000 },
      });
      const enough = tp1.toolpath.length >= 20;
      log('pocket 40×30 generates ≥20 points',
          enough, `got ${tp1.toolpath.length} pts`);
    } catch (e) {
      log('pocket 40×30 generates ≥20 points', false, String(e));
    }

    // Test 2 — emit G-code and check required tokens.
    let gcode = '';
    try {
      gcode = emitGCode([tp1], { id: 'v2-50-chb', post: { units: 'inch' } });
      const okHeader = /\bG20\b/.test(gcode) && /\bG17\b/.test(gcode) && /\bG90\b/.test(gcode) && /\bG54\b/.test(gcode);
      const okMoves = /\bG0\b/.test(gcode);
      const okEnd = /\bM30\b/.test(gcode) && gcode.trim().endsWith('%');
      log('emitted G-code has G20/G17/G90/G54 header', okHeader);
      log('emitted G-code has G0 rapid moves', okMoves);
      log('emitted G-code ends with M30 then %', okEnd);
    } catch (e) {
      log('post-processor emits valid G-code', false, String(e));
    }

    // Test 3 — round-trip: parsed final position should match last toolpath point.
    try {
      if (tp1 && gcode) {
        const parsed = parseGCodePosition(gcode);
        // Last position from emit logic: final retract in pocket goes to (bounds.xMin, bounds.yMin, safeZ).
        // That's the last coord-bearing move in the G-code. Verify parse tracked it.
        // Inches, 4-decimal precision.
        const lastMv = tp1.toolpath[tp1.toolpath.length - 1];
        const mmToIn = (v) => v / 25.4;
        const dx = Math.abs(parsed.position.x - mmToIn(lastMv.x));
        const dy = Math.abs(parsed.position.y - mmToIn(lastMv.y));
        const dz = Math.abs(parsed.position.z - mmToIn(lastMv.z));
        const ok = dx < 1e-3 && dy < 1e-3 && dz < 1e-3 && parsed.sawM30;
        log('round-trip parse: final position matches last move',
            ok, `Δx=${dx.toFixed(5)} Δy=${dy.toFixed(5)} Δz=${dz.toFixed(5)} M30=${parsed.sawM30}`);
      } else {
        log('round-trip parse: final position matches last move', false, 'no tp1/gcode');
      }
    } catch (e) {
      log('round-trip parse: final position matches last move', false, String(e));
    }

    // Test 4 — 2D contour on a square.
    try {
      const tp = generate2DContour({
        boundary: [[-10, -10], [10, -10], [10, 10], [-10, 10]],
        depth: 1, stepdown: 0.5,
        tool: { dia: 3.175 },
        feeds: { cut: 500, plunge: 150, rapid: 3000 },
      });
      log('2d-contour square: produces >=10 points', tp.toolpath.length >= 10, `got ${tp.toolpath.length}`);
    } catch (e) {
      log('2d-contour square: produces >=10 points', false, String(e));
    }

    // Test 5 — drill with peck.
    try {
      const tp = generateDrill({
        holes: [{ x: 0, y: 0, depth: 10 }, { x: 20, y: 0, depth: 10 }],
        tool: { dia: 3, type: 'drill' },
        feeds: { plunge: 100, rapid: 3000 },
        pecking: 'g83', peckDepth: 2,
      });
      // 2 holes × (5 pecks × 3 moves + over + final retract) ≈ >= 12.
      log('drill peck: produces multi-move cycle', tp.toolpath.length >= 10, `got ${tp.toolpath.length}`);
    } catch (e) {
      log('drill peck: produces multi-move cycle', false, String(e));
    }

    // Test 6 — face.
    try {
      const tp = generateFace({
        stockBox: { xMin: -30, yMin: -20, xMax: 30, yMax: 20 },
        depth: 0.5, stepdown: 0.5, stepover: 2,
        tool: { dia: 10 },
        feeds: { cut: 800, plunge: 200, rapid: 3000 },
      });
      log('face: produces zigzag output', tp.toolpath.length >= 6, `got ${tp.toolpath.length}`);
    } catch (e) {
      log('face: produces zigzag output', false, String(e));
    }

    // Test 7 — adaptive clear (concentric rings).
    try {
      const tp = generateAdaptiveClear({
        boundary: [[0,0],[40,0],[40,30],[0,30]],
        depth: 2, stepdown: 1, stepover: 1.5,
        tool: { dia: 3.175 },
        feeds: { cut: 800, plunge: 250, rapid: 3000 },
      });
      log('adaptive-clear: produces ring toolpath', tp.toolpath.length >= 30, `got ${tp.toolpath.length} pts, ${tp.meta.rings} rings`);
    } catch (e) {
      log('adaptive-clear: produces ring toolpath', false, String(e));
    }

    // Test 8 — chamfer/deburr with V-bit.
    try {
      const tp = generateChamferDeburr({
        boundary: [[0,0],[50,0],[50,30],[0,30]],
        chamferSize: 0.5,
        tool: { dia: 6.35, type: 'vbit', angle_deg: 90 },
        feeds: { cut: 600, plunge: 200, rapid: 3000 },
      });
      log('chamfer-deburr: single-depth edge pass', tp.toolpath.length === 7, `got ${tp.toolpath.length} pts (expected 7)`);
    } catch (e) {
      log('chamfer-deburr: single-depth edge pass', false, String(e));
    }

    // Test 9 — bore-thread helix.
    try {
      const tp = generateBoreThread({
        center: { x: 0, y: 0 },
        depth: 8,
        finalDiameter: 10,
        mode: 'helix-bore',
        tool: { dia: 6.35 },
        feeds: { cut: 400, plunge: 150, rapid: 3000 },
      });
      log('bore-thread: helix bore pass', tp.toolpath.length >= 50, `got ${tp.toolpath.length} pts`);
    } catch (e) {
      log('bore-thread: helix bore pass', false, String(e));
    }

    // Test 10 — bore-thread thread-mill.
    try {
      const tp = generateBoreThread({
        center: { x: 0, y: 0 },
        depth: 10,
        finalDiameter: 8,
        mode: 'thread-mill',
        pitch: 1.25,   // M8 coarse
        tool: { dia: 5.0 },
        feeds: { cut: 400, plunge: 150, rapid: 3000 },
      });
      log('bore-thread: thread-mill pass', tp.toolpath.length >= 20, `got ${tp.toolpath.length} pts`);
    } catch (e) {
      log('bore-thread: thread-mill pass', false, String(e));
    }

    const allPass = results.every(r => r.pass);
    console.log(`[pentacad-cam:selftest] overall: ${allPass ? 'PASS' : 'FAIL'} (${results.filter(r => r.pass).length}/${results.length})`);
    return { results, allPass };
  }

  // ============================================================================
  // INIT + EXECUTE
  // ============================================================================

  let ctx = null;

  function init(context) {
    ctx = context || null;
    console.log(`[pentacad-cam] v${VERSION} initialized — ${STRATEGIES.length} strategies registered`);
  }

  function execute(request) {
    const { method, params } = request || {};
    if (method === 'cam.listStrategies') return STRATEGIES;
    if (method === 'cam.recommendFeeds') return recommendFeeds(params?.tool, params?.material);
    if (method === 'cam.createSetup') return createSetup(params);
    if (method === 'cam.addOperation') return addOperation(params?.setup, params?.op);
    if (method === 'cam.generate') {
      if (params?.setup) {
        const tps = generateAllToolpaths(params.setup);
        if (ctx?.state) ctx.state.toolpaths = tps;
        return tps;
      }
      // Legacy: generate from ctx.state.
      const tps = (ctx?.state?.setups ?? []).flatMap(s => generateAllToolpaths(s));
      if (ctx?.state) ctx.state.toolpaths = tps;
      return tps;
    }
    if (method === 'cam.post') {
      const tps = params?.toolpaths ?? ctx?.state?.toolpaths ?? [];
      const machine = params?.machine ?? ctx?.state?.machine;
      const gcode = emitGCode(tps, machine, params?.opts);
      if (ctx?.state) ctx.state.gcode = gcode;
      return gcode;
    }
    if (method === 'cam.selftest') return runSelfTests();
    return { error: 'unknown_cam_method', method };
  }

  // Run self-tests on module load (defensive — never block page init).
  try {
    runSelfTests();
  } catch (e) {
    console.warn('[pentacad-cam] self-test crashed:', e);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    version: VERSION,
    STRATEGIES,

    // Strategies
    generate2DContour,
    generatePocket,
    generateDrill,
    generateFace,
    generateAdaptiveClear,
    generateChamferDeburr,
    generateBoreThread,

    // Post + feeds
    emitGCode,
    recommendFeeds,

    // Data model
    createSetup,
    addOperation,
    generateAllToolpaths,

    // Lifecycle
    init,
    execute,
    runSelfTests,

    // Internals exposed for testing
    _internal: {
      offsetPolygon,
      horizontalScanlineIntersections,
      pointInPolygon,
      parseGCodePosition,
      FEED_TABLE,
    },
  };
})();
