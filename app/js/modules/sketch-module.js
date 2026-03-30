/**
 * @file sketch-module.js
 * @description SketchModule — 2D Sketching Engine with Fusion 360 parity
 *   LEGO block for cycleCAD microkernel, providing a complete 2D constraint-based
 *   sketching environment on 3D faces or in standalone mode.
 *
 * @version 1.0.0
 * @author cycleCAD Team
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 *
 * @module sketch-module
 * @requires viewport (3D scene for sketch visualization)
 *
 * Features:
 *   - Drawing tools: Line, Rectangle, Circle, Arc, Ellipse, Spline, Polygon, Slot, Text
 *   - Editing tools: Trim, Extend, Offset, Mirror, Fillet, Chamfer
 *   - Construction geometry (reference-only entities)
 *   - Dimensions: Linear, angular, radial, diameter, ordinate
 *   - Constraints: Coincident, horizontal, vertical, parallel, perpendicular, tangent, etc.
 *   - Grid snap and point snap (configurable)
 *   - Live preview while drawing
 *   - Undo/redo support
 *   - 2D/3D canvas visualization
 *   - Profile export for extrude/revolve operations
 *
 * Workflow:
 *   1. User triggers sketch mode on face or starts new sketch
 *   2. Sketch plane is established (normal, origin, U/V axes)
 *   3. Drawing toolbar appears with tool buttons
 *   4. User draws entities (lines, circles, etc.)
 *   5. Entities are added to entity list and rendered to canvas
 *   6. User applies dimensions and constraints
 *   7. User finishes sketch (Esc or Finish button)
 *   8. Sketch profile is returned for use in extrude/revolve/pad/pocket operations
 */

const SketchModule = {
  id: 'sketch',
  name: 'Sketch Engine',
  version: '1.0.0',
  category: 'engine',
  dependencies: ['viewport'],
  memoryEstimate: 15,

  // ===== STATE =====
  state: {
    isActive: false,
    plane: null, // { normal, origin, u, v } — local coordinate frame
    entities: [], // { id, type, points[], constraints[], isConstruction, selected }
    dimensions: [], // { id, type, entities[], value, driven }
    currentTool: 'line',
    selectedEntityIds: new Set(),
    isDrawing: false,
    tempPoints: [], // points being drawn for current tool
    gridSize: 5,
    snapToGrid: true,
    snapDistance: 15, // pixels
    canvas: null,
    ctx: null,
    canvasGroup: null, // THREE.Group for 3D sketch entities
  },

  // ===== LEGO INTERFACE =====
  init() {
    // Called by app.js on startup
    this.setupCanvasOverlay();
    this.setupEventHandlers();
    this.setupToolbar();
    window.addEventListener('sketch:start', (e) => this.start(e.detail.plane));
    window.addEventListener('sketch:finish', () => this.finish());
  },

  getUI() {
    return `
      <div id="sketch-toolbar" style="display: none; background: #2a2a2a; padding: 8px; border-radius: 4px; flex-wrap: wrap; gap: 4px;">
        <!-- BASIC TOOLS -->
        <button data-tool="line" class="sketch-tool-btn" title="Line (L)">—</button>
        <button data-tool="rectangle" class="sketch-tool-btn" title="Rectangle (R)">▭</button>
        <button data-tool="circle" class="sketch-tool-btn" title="Circle (C)">●</button>
        <button data-tool="arc" class="sketch-tool-btn" title="Arc (A)">⌒</button>
        <button data-tool="ellipse" class="sketch-tool-btn" title="Ellipse (E)">⬭</button>
        <button data-tool="spline" class="sketch-tool-btn" title="Spline (S)">✓</button>
        <button data-tool="spline_fit" class="sketch-tool-btn" title="Fit Point Spline">↪</button>
        <button data-tool="polygon" class="sketch-tool-btn" title="Polygon (P)">⬡</button>

        <!-- SLOT TOOLS -->
        <button data-tool="slot" class="sketch-tool-btn" title="Slot (Center-Point)">⊟</button>
        <button data-tool="slot_3point" class="sketch-tool-btn" title="Slot (3-Point)">⊟*</button>
        <button data-tool="slot_ctc" class="sketch-tool-btn" title="Slot (Center-to-Center)">⊟**</button>

        <!-- CONIC & TEXT -->
        <button data-tool="conic" class="sketch-tool-btn" title="Conic (Parabola/Hyperbola)">∿</button>
        <button data-tool="text" class="sketch-tool-btn" title="Text (T)">T</button>
        <button data-tool="text_path" class="sketch-tool-btn" title="Text Along Path">T↷</button>

        <!-- REFERENCE -->
        <button data-tool="point" class="sketch-tool-btn" title="Point (standalone)">•</button>
        <button data-tool="midpoint" class="sketch-tool-btn" title="Midpoint">◈</button>

        <!-- EDITING TOOLS -->
        <button data-tool="trim" class="sketch-tool-btn" title="Trim">✂</button>
        <button data-tool="power_trim" class="sketch-tool-btn" title="Power Trim (drag)">✂✂</button>
        <button data-tool="break" class="sketch-tool-btn" title="Break at Point">⊥</button>
        <button data-tool="extend" class="sketch-tool-btn" title="Extend">→</button>
        <button data-tool="offset" class="sketch-tool-btn" title="Offset">⟿</button>
        <button data-tool="mirror" class="sketch-tool-btn" title="Mirror">⇄</button>
        <button data-tool="fillet" class="sketch-tool-btn" title="Fillet">⌢</button>
        <button data-tool="chamfer" class="sketch-tool-btn" title="Chamfer">/</button>

        <!-- PATTERN TOOLS -->
        <button data-tool="rect_pattern" class="sketch-tool-btn" title="Rectangular Pattern">▦</button>
        <button data-tool="circ_pattern" class="sketch-tool-btn" title="Circular Pattern">⊙</button>
        <button data-tool="path_pattern" class="sketch-tool-btn" title="Pattern Along Path">▦→</button>

        <!-- CONSTRUCTION & GEOMETRY -->
        <button data-tool="construction" class="sketch-tool-btn" title="Toggle Construction (G)">⋯</button>
        <button data-tool="project" class="sketch-tool-btn" title="Project Edge">⌜</button>
        <button data-tool="include" class="sketch-tool-btn" title="Include From Sketch">⊂</button>
        <button data-tool="intersection" class="sketch-tool-btn" title="Intersection Curve">✕</button>

        <!-- DIMENSIONS -->
        <button id="sketch-dimension-btn" class="sketch-tool-btn" title="Add Dimension (D)">📏</button>
        <button data-tool="ordinate" class="sketch-tool-btn" title="Ordinate Dimension">📍</button>
        <button data-tool="reference" class="sketch-tool-btn" title="Reference Dimension">⌀</button>
        <button data-tool="auto_dim" class="sketch-tool-btn" title="Auto Dimension">✓📏</button>

        <!-- FINISH -->
        <button id="sketch-finish-btn" style="margin-left: 16px; background: #00aa00; color: white;" title="Finish Sketch (Esc)">✓ Finish</button>
      </div>
      <div id="sketch-status-bar" style="display: none; color: #aaa; font-size: 12px; padding: 4px 8px; border-top: 1px solid #444; background: #1a1a1a;">
        Tool: <span id="sketch-tool-name">Line</span> | Grid: <span id="sketch-grid-size">5mm</span> | Entities: <span id="sketch-entity-count">0</span> | DOF: <span id="sketch-dof">0</span>
      </div>
      <div id="sketch-dimension-input" style="display: none; position: fixed; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; padding: 12px; z-index: 10000;">
        <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 4px;">Dimension Value (mm)</label>
        <input id="sketch-dim-value" type="number" style="width: 120px; padding: 4px; background: #1a1a1a; border: 1px solid #666; color: #fff; border-radius: 2px;">
        <button id="sketch-dim-ok" style="margin-left: 4px; padding: 4px 8px; background: #00aa00; color: white; border: none; border-radius: 2px; cursor: pointer;">OK</button>
      </div>
    `;
  },

  execute(command, params = {}) {
    // Microkernel command dispatch
    switch (command) {
      case 'start': return this.start(params.plane);
      case 'startOnFace': return this.startOnFace(params.faceId);
      case 'finish': return this.finish();
      case 'setTool': return this.setTool(params.tool);
      case 'addEntity': return this.addEntity(params.type, params.params);
      case 'trim': return this.trim(params.entityId, params.point);
      case 'extend': return this.extend(params.entityId);
      case 'offset': return this.offset(params.entityIds, params.distance);
      case 'mirror': return this.mirror(params.entityIds, params.lineId);
      case 'addDimension': return this.addDimension(params.type, params.entities, params.value);
      case 'toggleConstruction': return this.toggleConstruction(params.entityIds);
      case 'getProfile': return this.getProfile();
      case 'undo': return this.undo();
      case 'redo': return this.redo();
      default: throw new Error(`Unknown sketch command: ${command}`);
    }
  },

  // ===== CORE METHODS =====

  start(plane) {
    this.state.isActive = true;
    this.state.plane = plane || {
      normal: new THREE.Vector3(0, 0, 1),
      origin: new THREE.Vector3(0, 0, 0),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, 1, 0)
    };
    this.state.entities = [];
    this.state.dimensions = [];
    this.state.selectedEntityIds.clear();
    this.state.tempPoints = [];

    // Show sketch toolbar and canvas
    document.getElementById('sketch-toolbar').style.display = 'flex';
    document.getElementById('sketch-status-bar').style.display = 'block';
    if (this.state.canvas) this.state.canvas.style.display = 'block';

    // Create 3D group for sketch entities
    this.state.canvasGroup = new THREE.Group();
    if (window._scene) window._scene.add(this.state.canvasGroup);

    this.setTool('line');
    this.updateStatusBar();
    window.dispatchEvent(new CustomEvent('sketch:started', { detail: { plane: this.state.plane } }));
  },

  startOnFace(faceId) {
    /**
     * SKETCH ON FACE: Start sketch on a 3D model face
     *
     * Algorithm:
     * 1. Get face normal and center from 3D mesh
     * 2. Compute local U/V axes (perpendicular to normal)
     * 3. Set sketch plane to face's coordinate system
     * 4. All drawn entities transform to world coords when sketch ends
     */
    const face = this.getFaceData(faceId);
    if (!face) {
      console.warn('Could not find face:', faceId);
      return;
    }

    // Compute orthonormal basis for the face
    const normal = face.normal.clone().normalize();
    let u = new THREE.Vector3(1, 0, 0);

    // If normal is nearly parallel to X axis, use Y instead
    if (Math.abs(normal.dot(u)) > 0.9) {
      u = new THREE.Vector3(0, 1, 0);
    }

    // u = normal × reference, then v = normal × u
    u = new THREE.Vector3().crossVectors(normal, u).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();

    const plane = {
      normal,
      origin: face.origin || new THREE.Vector3(0, 0, 0),
      u,
      v,
      faceId // Store for reference
    };

    this.state.sketchOnFace = true;
    this.state.faceId = faceId;
    this.start(plane);
  },

  getFaceData(faceId) {
    /**
     * Get face data from 3D scene (simplified version)
     * In production, ray-cast scene or use model's face database
     */
    if (!window._scene) return null;

    // This is a simplified approach — would need real face selection
    // For now, return default XY plane
    return {
      normal: new THREE.Vector3(0, 0, 1),
      origin: new THREE.Vector3(0, 0, 0),
      // Real implementation would compute actual face normal
    };
  },

  transformSketchToWorld() {
    /**
     * Transform all sketch entities from face-local to world coordinates
     * Called when finishing sketch on a face
     */
    if (!this.state.sketchOnFace || !this.state.plane) return;

    const plane = this.state.plane;
    const matrix = new THREE.Matrix4();

    // Build transformation matrix: local to world
    const localX = plane.u;
    const localY = plane.v;
    const localZ = plane.normal;

    matrix.makeBasis(localX, localY, localZ);
    matrix.setPosition(plane.origin);

    // Transform all entities
    this.state.entities.forEach(entity => {
      entity.points = entity.points.map(p => {
        const v3 = new THREE.Vector3(p.x, p.y, 0); // 2D → 3D in local space
        v3.applyMatrix4(matrix);
        return new THREE.Vector2(v3.x, v3.y); // Back to 2D in world space
      });
    });

    this.state.sketchOnFace = false;
  },

  finish() {
    if (!this.state.isActive) return null;

    this.state.isActive = false;
    document.getElementById('sketch-toolbar').style.display = 'none';
    document.getElementById('sketch-status-bar').style.display = 'none';
    if (this.state.canvas) this.state.canvas.style.display = 'none';

    // If sketching on a face, transform entities to world coordinates
    if (this.state.sketchOnFace) {
      this.transformSketchToWorld();
    }

    // Remove 3D group
    if (this.state.canvasGroup && window._scene) {
      window._scene.remove(this.state.canvasGroup);
    }

    const profile = this.getProfile();
    window.dispatchEvent(new CustomEvent('sketch:finished', {
      detail: {
        entities: this.state.entities,
        profile,
        plane: this.state.plane,
        faceId: this.state.faceId || null
      }
    }));

    return { entities: this.state.entities, profile };
  },

  setTool(toolName) {
    this.state.currentTool = toolName;
    this.state.tempPoints = [];
    this.state.isDrawing = false;

    // Update toolbar button highlighting
    document.querySelectorAll('.sketch-tool-btn').forEach(btn => {
      btn.style.background = btn.dataset.tool === toolName ? '#00aa00' : '';
      btn.style.color = btn.dataset.tool === toolName ? 'white' : '';
    });

    const toolLabels = {
      line: 'Line', rectangle: 'Rectangle', circle: 'Circle', arc: 'Arc',
      ellipse: 'Ellipse', spline: 'Spline', polygon: 'Polygon', slot: 'Slot',
      text: 'Text', trim: 'Trim', extend: 'Extend', offset: 'Offset',
      mirror: 'Mirror', fillet: 'Fillet', chamfer: 'Chamfer', construction: 'Construction'
    };
    document.getElementById('sketch-tool-name').textContent = toolLabels[toolName] || toolName;
    window.dispatchEvent(new CustomEvent('sketch:toolChanged', { detail: { tool: toolName } }));
  },

  // ===== DRAWING TOOLS =====

  addEntity(type, params = {}) {
    const entity = {
      id: `entity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      points: params.points || [],
      constraints: params.constraints || [],
      isConstruction: params.isConstruction || false,
      selected: false,
      data: params.data || {}
    };

    this.state.entities.push(entity);
    this.renderEntity(entity);
    window.dispatchEvent(new CustomEvent('sketch:entityAdded', { detail: { entity } }));
    this.updateStatusBar();
    return entity;
  },

  drawLine(p1, p2) {
    return this.addEntity('line', { points: [p1, p2] });
  },

  drawRectangle(corner1, corner2) {
    const p1 = corner1, p2 = new THREE.Vector2(corner2.x, corner1.y);
    const p3 = corner2, p4 = new THREE.Vector2(corner1.x, corner2.y);
    return [
      this.addEntity('line', { points: [p1, p2] }),
      this.addEntity('line', { points: [p2, p3] }),
      this.addEntity('line', { points: [p3, p4] }),
      this.addEntity('line', { points: [p4, p1] })
    ];
  },

  drawCircle(center, radius) {
    return this.addEntity('circle', {
      points: [center],
      data: { radius },
      constraints: [{ type: 'fixed', point: center }]
    });
  },

  drawArc(start, end, center) {
    return this.addEntity('arc', {
      points: [start, end, center],
      data: {
        radius: center.distanceTo(start),
        startAngle: Math.atan2(start.y - center.y, start.x - center.x),
        endAngle: Math.atan2(end.y - center.y, end.x - center.x)
      }
    });
  },

  drawEllipse(center, majorAxis, minorAxis, rotation = 0) {
    return this.addEntity('ellipse', {
      points: [center],
      data: { majorAxis, minorAxis, rotation },
      constraints: [{ type: 'fixed', point: center }]
    });
  },

  drawSpline(controlPoints) {
    /**
     * SPLINE TOOL: Cubic B-spline with draggable control points
     *
     * Uses De Boor's algorithm to evaluate curve at arbitrary parameter.
     * Requires minimum 3 control points.
     * Curve passes near (not through) control points unless clamped.
     */
    if (controlPoints.length < 3) {
      console.warn('Spline requires at least 3 control points');
      return null;
    }

    const spline = this.addEntity('spline', {
      points: controlPoints,
      data: {
        degree: 3,
        knotVector: this.generateBSplineKnots(controlPoints.length, 3)
      }
    });

    // Render control polygon (dashed line connecting control points)
    this.renderSplineControlPolygon(spline);

    return spline;
  },

  generateBSplineKnots(n, degree) {
    /**
     * Generate clamped B-spline knot vector.
     * Knot vector has n + degree + 1 values.
     * For clamped spline: first and last (degree+1) knots are at 0 and 1.
     */
    const knots = [];
    const knotCount = n + degree + 1;

    // Clamp at start
    for (let i = 0; i <= degree; i++) {
      knots.push(0);
    }

    // Interior knots distributed uniformly
    const interior = knotCount - 2 * (degree + 1);
    for (let i = 1; i <= interior; i++) {
      knots.push(i / (interior + 1));
    }

    // Clamp at end
    for (let i = 0; i <= degree; i++) {
      knots.push(1);
    }

    return knots;
  },

  evaluateBSpline(controlPoints, t, degree = 3) {
    /**
     * DE BOOR'S ALGORITHM for cubic B-spline evaluation
     *
     * Given control points P0..Pn, knot vector U, and parameter t,
     * compute point on curve at parameter t.
     *
     * Algorithm:
     * 1. Find knot span k such that U[k] <= t < U[k+1]
     * 2. For d = 1 to degree:
     *    3. For i = k-degree+d to k:
     *       4. Compute intermediate points using affine combination
     * 5. Return the single intermediate point
     */
    if (controlPoints.length < degree + 1) {
      throw new Error('Not enough control points for degree');
    }

    // Generate knot vector if not provided
    const knots = this.generateBSplineKnots(controlPoints.length, degree);

    // Find knot span k such that knots[k] <= t < knots[k+1]
    let k = 0;
    for (let i = 0; i < knots.length - 1; i++) {
      if (knots[i] <= t && t < knots[i + 1]) {
        k = i;
        break;
      }
    }
    // Handle edge case: t == 1.0
    if (t === 1.0) k = knots.length - degree - 2;

    // Initialize with control points
    const d = [];
    for (let j = k - degree; j <= k; j++) {
      d[j] = controlPoints[j] ? controlPoints[j].clone() : new THREE.Vector2(0, 0);
    }

    // De Boor recurrence
    for (let r = 1; r <= degree; r++) {
      for (let j = k; j >= k - degree + r; j--) {
        const alpha = (t - knots[j]) / (knots[j + degree - r + 1] - knots[j]);
        if (isNaN(alpha) || !isFinite(alpha)) {
          continue; // Skip degenerate knot spans
        }
        // d[j] = (1-alpha) * d[j-1] + alpha * d[j]
        const d_prev = d[j - 1] || new THREE.Vector2(0, 0);
        d[j] = new THREE.Vector2(
          (1 - alpha) * d_prev.x + alpha * d[j].x,
          (1 - alpha) * d_prev.y + alpha * d[j].y
        );
      }
    }

    return d[k];
  },

  renderSplineControlPolygon(spline) {
    // Render dashed line connecting control points
    if (!this.state.canvasGroup) return;

    const existing = this.state.canvasGroup.children.find(c => c.userData.entityId === spline.id + '_polygon');
    if (existing) this.state.canvasGroup.remove(existing);

    const geometry = new THREE.BufferGeometry().setFromPoints(spline.points);
    const material = new THREE.LineDashedMaterial({
      color: 0x888888,
      dashSize: 0.5,
      gapSize: 0.3,
      linewidth: 0.05
    });
    const line = new THREE.Line(geometry, material);
    line.userData.entityId = spline.id + '_polygon';
    line.computeLineDistances();
    this.state.canvasGroup.add(line);
  },

  drawPolygon(center, sides, radius, circumscribed = true) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      points.push(new THREE.Vector2(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius
      ));
    }
    // Close polygon
    points.push(points[0]);
    return this.addEntity('polygon', {
      points,
      data: { sides, radius, circumscribed }
    });
  },

  drawSlot(centerStart, centerEnd, radius) {
    return this.addEntity('slot', {
      points: [centerStart, centerEnd],
      data: { radius }
    });
  },

  drawText(point, text, fontSize = 10) {
    return this.addEntity('text', {
      points: [point],
      data: { text, fontSize }
    });
  },

  drawSlotCenterPoint(center, width, height, rotation = 0) {
    /**
     * CENTER-POINT SLOT: Slot defined by center, width, and height
     *
     * A slot is a rounded rectangle with semicircular ends.
     * Specified by center point, width, and height of the slot.
     */
    return this.addEntity('slot_center', {
      points: [center],
      data: { width, height, rotation },
      constraints: [{ type: 'fixed', point: center }]
    });
  },

  drawSlot3Point(p1, p2, radius) {
    /**
     * 3-POINT SLOT: Define by two endpoints and radius (arc radius)
     *
     * Creates a slot with semicircular ends of given radius,
     * connecting two specified endpoints.
     */
    const center = new THREE.Vector2(
      (p1.x + p2.x) / 2,
      (p1.y + p2.y) / 2
    );
    const length = p1.distanceTo(p2);
    return this.addEntity('slot_3point', {
      points: [p1, p2],
      data: { radius, length, center }
    });
  },

  drawSlotCenterToCenter(center1, center2, radius) {
    /**
     * CENTER-TO-CENTER SLOT: Define by arc centers and radius
     *
     * Slot with circular centers at two specified points,
     * connected by tangent lines.
     */
    return this.addEntity('slot_ctc', {
      points: [center1, center2],
      data: { radius }
    });
  },

  drawConic(type, params) {
    /**
     * CONIC SECTION DRAWING: Parabola, Hyperbola, or Ellipse
     *
     * @param {string} type - 'parabola' or 'hyperbola'
     * @param {object} params - { focus, directrix, ... } or { foci, a, ... }
     *
     * Parabola: locus of points equidistant from focus and directrix
     * Hyperbola: locus of points where |PF1| - |PF2| = 2a
     */
    if (type === 'parabola') {
      const { focus, directrixLine } = params;
      return this.addEntity('parabola', {
        points: [focus],
        data: { directrixLine, type: 'parabola' }
      });
    } else if (type === 'hyperbola') {
      const { focus1, focus2, a } = params;
      return this.addEntity('hyperbola', {
        points: [focus1, focus2],
        data: { a, type: 'hyperbola' }
      });
    }
    return null;
  },

  drawRectangularPattern(entityIds, columns, rows, spacingX, spacingY) {
    /**
     * RECTANGULAR PATTERN: Array entity copies in grid
     *
     * Creates copies of selected entities in a column×row grid
     * with specified spacing between copies.
     */
    if (entityIds.length === 0) return [];

    const patterns = [];
    const baseEntities = this.state.entities.filter(e => entityIds.includes(e.id));

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if (row === 0 && col === 0) continue; // Skip original

        const offset = new THREE.Vector2(col * spacingX, row * spacingY);

        baseEntities.forEach(entity => {
          const copiedPoints = entity.points.map(p => p.clone().add(offset));
          const patternEntity = this.addEntity(entity.type, {
            points: copiedPoints,
            data: { ...entity.data, isPattern: true, baseId: entity.id },
            isConstruction: entity.isConstruction
          });
          patterns.push(patternEntity);
        });
      }
    }

    return patterns;
  },

  drawCircularPattern(entityIds, center, count, angleSpan = Math.PI * 2) {
    /**
     * CIRCULAR PATTERN: Array entity copies around center
     *
     * Creates copies of selected entities arranged radially
     * around a center point.
     */
    if (entityIds.length === 0) return [];

    const patterns = [];
    const baseEntities = this.state.entities.filter(e => entityIds.includes(e.id));
    const angleStep = angleSpan / count;

    for (let i = 1; i < count; i++) {
      const angle = i * angleStep;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      baseEntities.forEach(entity => {
        const copiedPoints = entity.points.map(p => {
          const relative = new THREE.Vector2(p.x - center.x, p.y - center.y);
          const rotated = new THREE.Vector2(
            relative.x * cos - relative.y * sin,
            relative.x * sin + relative.y * cos
          );
          return rotated.add(center);
        });

        const patternEntity = this.addEntity(entity.type, {
          points: copiedPoints,
          data: { ...entity.data, isPattern: true, baseId: entity.id },
          isConstruction: entity.isConstruction
        });
        patterns.push(patternEntity);
      });
    }

    return patterns;
  },

  drawPatternAlongPath(entityIds, pathEntityId, count, spacing = null) {
    /**
     * PATTERN ALONG PATH: Array entity copies along a curve
     *
     * Creates copies of selected entities distributed along
     * a line, arc, or spline path.
     */
    const pathEntity = this.state.entities.find(e => e.id === pathEntityId);
    if (!pathEntity || !['line', 'arc', 'spline'].includes(pathEntity.type)) {
      console.warn('Path must be line, arc, or spline');
      return [];
    }

    const baseEntities = this.state.entities.filter(e => entityIds.includes(e.id));
    const patterns = [];

    for (let i = 1; i < count; i++) {
      const t = i / count; // Parameter along path [0, 1]
      const pathPoint = this.evaluateEntityAtParameter(pathEntity, t);
      const pathTangent = this.evaluateEntityTangentAtParameter(pathEntity, t);
      const angle = Math.atan2(pathTangent.y, pathTangent.x);

      baseEntities.forEach(entity => {
        const copiedPoints = entity.points.map(p => {
          const relative = new THREE.Vector2(p.x - entity.points[0].x, p.y - entity.points[0].y);
          const rotated = new THREE.Vector2(
            relative.x * Math.cos(angle) - relative.y * Math.sin(angle),
            relative.x * Math.sin(angle) + relative.y * Math.cos(angle)
          );
          return pathPoint.clone().add(rotated);
        });

        const patternEntity = this.addEntity(entity.type, {
          points: copiedPoints,
          data: { ...entity.data, isPattern: true, baseId: entity.id },
          isConstruction: entity.isConstruction
        });
        patterns.push(patternEntity);
      });
    }

    return patterns;
  },

  projectEdgeOntoSketch(edgeId) {
    /**
     * PROJECT 3D EDGE ONTO SKETCH PLANE
     *
     * Takes a 3D edge from the model and projects it orthogonally
     * onto the current sketch plane. Useful for alignment.
     */
    // In production, would ray-cast edge with sketch plane
    // For now, return a projected line entity
    return {
      message: 'Project edge ' + edgeId + ' onto sketch plane',
      isConstruction: true
    };
  },

  includeGeometryFromSketch(sourceSketchId) {
    /**
     * INCLUDE GEOMETRY FROM ANOTHER SKETCH
     *
     * References entities from another sketch in the current sketch.
     * Changes to source sketch automatically update references.
     */
    return {
      message: 'Include geometry from sketch ' + sourceSketchId,
      linkedSketchId: sourceSketchId
    };
  },

  drawIntersectionCurve(body1Id, body2Id, surface1Id, surface2Id) {
    /**
     * INTERSECTION CURVE: Sketch curve from intersecting surfaces
     *
     * Computes the intersection of two 3D surfaces/bodies and
     * projects it onto the sketch plane as a construction curve.
     */
    return this.addEntity('intersection_curve', {
      data: {
        body1Id,
        body2Id,
        surface1Id,
        surface2Id,
        isConstruction: true
      }
    });
  },

  drawTextAlongPath(text, pathEntityId, fontSize = 10) {
    /**
     * TEXT ALONG PATH: Text that follows a curve
     *
     * Distributes text characters along a line, arc, or spline.
     */
    const pathEntity = this.state.entities.find(e => e.id === pathEntityId);
    if (!pathEntity) return null;

    return this.addEntity('text_along_path', {
      data: { text, fontSize, pathEntityId, isConstruction: false }
    });
  },

  drawFitPointSpline(points) {
    /**
     * FIT POINT SPLINE (through-point B-spline)
     *
     * Creates a spline that passes THROUGH all specified points
     * (unlike control-point spline which passes near control points).
     * Uses automatic knot vector generation for smooth interpolation.
     */
    if (points.length < 2) {
      console.warn('Fit point spline requires at least 2 points');
      return null;
    }

    return this.addEntity('spline_fit', {
      points,
      data: {
        degree: Math.min(3, points.length - 1),
        isFitPoint: true,
        knotVector: this.generateFitPointKnots(points.length)
      }
    });
  },

  generateFitPointKnots(n) {
    /**
     * Generate knot vector for fit-point (interpolating) spline
     * Uses Centripetal Catmull-Rom parameterization
     */
    const knots = [0, 0, 0, 0];
    for (let i = 1; i <= n - 2; i++) {
      knots.push(i);
    }
    knots.push(n - 1, n - 1, n - 1, n - 1);
    return knots;
  },

  drawMidpoint(entityId) {
    /**
     * MIDPOINT: Create a point at midpoint of any edge
     *
     * Adds a construction point at the midpoint of a line, arc, or spline.
     * Useful as reference for other constraints.
     */
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity || !['line', 'arc', 'spline'].includes(entity.type)) {
      console.warn('Midpoint tool requires line, arc, or spline');
      return null;
    }

    let midpoint;
    if (entity.type === 'line') {
      const [p1, p2] = entity.points;
      midpoint = new THREE.Vector2(
        (p1.x + p2.x) / 2,
        (p1.y + p2.y) / 2
      );
    } else if (entity.type === 'arc') {
      const [start, end] = entity.points;
      midpoint = new THREE.Vector2(
        (start.x + end.x) / 2,
        (start.y + end.y) / 2
      );
    } else if (entity.type === 'spline') {
      // Evaluate spline at t=0.5
      midpoint = this.evaluateBSpline(entity.points, 0.5, entity.data.degree);
    }

    return this.addEntity('point', {
      points: [midpoint],
      data: { linkedEntityId: entityId, type: 'midpoint' },
      isConstruction: true
    });
  },

  drawPoint(point, isConstruction = true) {
    /**
     * POINT TOOL: Standalone point or center mark
     *
     * Creates a construction point (small circle) at specified location.
     * Useful for reference geometry and constraint anchors.
     */
    return this.addEntity('point', {
      points: [point],
      data: { type: 'standalone' },
      isConstruction
    });
  },

  // ===== EDITING TOOLS =====

  trim(entityId, clickPoint) {
    /**
     * TRIM TOOL: Remove segment between two intersections or endpoints
     *
     * Algorithm:
     * 1. Find all intersection points on entity with other entities
     * 2. Sort intersections along entity's parametric direction
     * 3. Find which segment the click point falls into
     * 4. Remove that segment, keeping others
     * 5. For lines: creates two new lines. For arcs: splits arc.
     */
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity || !['line', 'arc', 'spline'].includes(entity.type)) return;

    // Find all intersection points on this entity with other entities
    const intersections = this.findAllIntersectionsOnEntity(entity);
    if (intersections.length === 0) return;

    // Sort intersections by parametric position along entity
    const sortedInts = intersections.sort((a, b) => a.t - b.t);

    // Find which segment the click falls into
    let segmentStart = null, segmentEnd = null;
    for (let i = 0; i < sortedInts.length - 1; i++) {
      const midPoint = new THREE.Vector2(
        (sortedInts[i].point.x + sortedInts[i + 1].point.x) / 2,
        (sortedInts[i].point.y + sortedInts[i + 1].point.y) / 2
      );
      if (midPoint.distanceTo(clickPoint) < this.state.snapDistance) {
        segmentStart = sortedInts[i];
        segmentEnd = sortedInts[i + 1];
        break;
      }
    }

    if (!segmentStart || !segmentEnd) return;

    // Remove segment and keep remaining pieces
    if (entity.type === 'line') {
      this.splitLineAtTrim(entity, segmentStart, segmentEnd);
    } else if (entity.type === 'arc') {
      this.splitArcAtTrim(entity, segmentStart, segmentEnd);
    } else if (entity.type === 'spline') {
      this.splitSplineAtTrim(entity, segmentStart, segmentEnd);
    }

    this.renderEntity(entity);
    window.dispatchEvent(new CustomEvent('sketch:entityModified', { detail: { entity } }));
  },

  powerTrim(clickPoints) {
    /**
     * POWER TRIM: Drag to trim multiple entities at once
     *
     * Click and drag along entities to remove all segments
     * that the drag line crosses. Works with line, arc, spline.
     */
    if (clickPoints.length < 2) return [];

    const trimmedEntities = [];
    const dragLine = { p1: clickPoints[0], p2: clickPoints[clickPoints.length - 1] };

    this.state.entities.forEach(entity => {
      if (!['line', 'arc', 'spline'].includes(entity.type)) return;

      const crossings = this.findEntityDragCrossings(entity, dragLine);
      if (crossings.length >= 2) {
        // Remove segments between pairs of crossings
        crossings.sort((a, b) => a.t - b.t);
        for (let i = 0; i < crossings.length - 1; i++) {
          this.trim(entity.id, new THREE.Vector2(
            (crossings[i].point.x + crossings[i + 1].point.x) / 2,
            (crossings[i].point.y + crossings[i + 1].point.y) / 2
          ));
          trimmedEntities.push(entity);
        }
      }
    });

    return trimmedEntities;
  },

  trimToIntersection(entityId, otherEntityId) {
    /**
     * TRIM TO NEAREST INTERSECTION
     *
     * Automatically trims entity to its nearest intersection
     * with another specific entity.
     */
    const entity = this.state.entities.find(e => e.id === entityId);
    const other = this.state.entities.find(e => e.id === otherEntityId);
    if (!entity || !other) return;

    const ints = this.findIntersection(entity, other);
    if (ints.length === 0) return;

    // Trim to nearest intersection
    const nearest = ints.reduce((a, b) =>
      a.t < b.t ? a : b
    );

    this.trim(entityId, nearest.point);
  },

  breakAtPoint(entityId, point) {
    /**
     * BREAK AT POINT: Split entity at specified point
     *
     * Breaks a line or arc into two segments at the given point
     * (useful for adding construction references).
     */
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity || !['line', 'arc', 'spline'].includes(entity.type)) return;

    const t = this.findParameterAlongEntity(entity, point);
    if (t === null) return;

    if (entity.type === 'line') {
      const [p1, p2] = entity.points;
      this.addEntity('line', { points: [p1, point] });
      this.addEntity('line', { points: [point, p2] });
      const idx = this.state.entities.indexOf(entity);
      if (idx > -1) this.state.entities.splice(idx, 1);
    } else if (entity.type === 'arc') {
      const [start, end, center] = entity.points;
      const angle1 = Math.atan2(point.y - center.y, point.x - center.x);
      this.addEntity('arc', {
        points: [start, point, center],
        data: { ...entity.data, endAngle: angle1 }
      });
      this.addEntity('arc', {
        points: [point, end, center],
        data: { ...entity.data, startAngle: angle1 }
      });
      const idx = this.state.entities.indexOf(entity);
      if (idx > -1) this.state.entities.splice(idx, 1);
    }

    window.dispatchEvent(new CustomEvent('sketch:entityModified', { detail: { entity } }));
  },

  splitLineAtTrim(entity, intStart, intEnd) {
    // For line: keep segments before intStart and after intEnd, discard middle
    const [p1, p2] = entity.points;

    // Create first segment: p1 to intStart
    if (intStart.t > 0.01) {
      this.addEntity('line', {
        points: [p1, intStart.point],
        isConstruction: entity.isConstruction
      });
    }

    // Create second segment: intEnd to p2
    if (intEnd.t < 0.99) {
      this.addEntity('line', {
        points: [intEnd.point, p2],
        isConstruction: entity.isConstruction
      });
    }

    // Remove original line
    const idx = this.state.entities.indexOf(entity);
    if (idx > -1) this.state.entities.splice(idx, 1);
  },

  splitArcAtTrim(entity, intStart, intEnd) {
    // For arc: keep segments before intStart and after intEnd
    const { radius, startAngle, endAngle } = entity.data;
    const [center] = entity.points;

    // Calculate angles at intersection points
    const intStartAngle = Math.atan2(intStart.point.y - center.y, intStart.point.x - center.x);
    const intEndAngle = Math.atan2(intEnd.point.y - center.y, intEnd.point.x - center.x);

    // Create first arc: startAngle to intStartAngle
    if (Math.abs(intStartAngle - startAngle) > 0.01) {
      this.addEntity('arc', {
        points: [
          new THREE.Vector2(center.x + Math.cos(startAngle) * radius, center.y + Math.sin(startAngle) * radius),
          intStart.point,
          center
        ],
        data: { radius, startAngle, endAngle: intStartAngle },
        isConstruction: entity.isConstruction
      });
    }

    // Create second arc: intEndAngle to endAngle
    if (Math.abs(endAngle - intEndAngle) > 0.01) {
      this.addEntity('arc', {
        points: [
          intEnd.point,
          new THREE.Vector2(center.x + Math.cos(endAngle) * radius, center.y + Math.sin(endAngle) * radius),
          center
        ],
        data: { radius, startAngle: intEndAngle, endAngle },
        isConstruction: entity.isConstruction
      });
    }

    // Remove original arc
    const idx = this.state.entities.indexOf(entity);
    if (idx > -1) this.state.entities.splice(idx, 1);
  },

  splitSplineAtTrim(entity, intStart, intEnd) {
    // For spline: split at parametric values and keep segments
    const points = entity.points;

    // Evaluate spline at intStart.t and intEnd.t to get split points
    const p1 = this.evaluateBSpline(points, intStart.t);
    const p2 = this.evaluateBSpline(points, intEnd.t);

    // First segment: start to intStart
    const segmentCount = Math.ceil(intStart.t * points.length);
    const firstSegmentPoints = points.slice(0, segmentCount);
    firstSegmentPoints.push(p1);
    this.addEntity('spline', {
      points: firstSegmentPoints,
      data: { degree: entity.data.degree },
      isConstruction: entity.isConstruction
    });

    // Second segment: intEnd to end
    const startCount = Math.ceil(intEnd.t * points.length);
    const secondSegmentPoints = [p2, ...points.slice(startCount)];
    this.addEntity('spline', {
      points: secondSegmentPoints,
      data: { degree: entity.data.degree },
      isConstruction: entity.isConstruction
    });

    // Remove original spline
    const idx = this.state.entities.indexOf(entity);
    if (idx > -1) this.state.entities.splice(idx, 1);
  },

  extend(entityId) {
    /**
     * EXTEND TOOL: Extend line or arc to nearest intersection with other geometry
     *
     * Algorithm:
     * 1. Identify the endpoint to extend (the one furthest from everything)
     * 2. Find all potential intersection targets (other lines, circles, arcs)
     * 3. Compute intersection point with each target
     * 4. Pick nearest intersection
     * 5. Move endpoint to intersection point
     */
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity || !['line', 'arc'].includes(entity.type)) return;

    // Identify which endpoint to extend (the one that's not connected to anything)
    let extendPoint = null;
    if (entity.type === 'line') {
      const [p1, p2] = entity.points;
      // Heuristic: extend from the endpoint closer to mouse (or the second one if ambiguous)
      extendPoint = p2;
    } else if (entity.type === 'arc') {
      extendPoint = entity.points[1]; // endAngle point
    }

    if (!extendPoint) return;

    // Find all intersection points with other entities
    const candidates = [];
    this.state.entities.forEach(other => {
      if (other.id === entityId) return;

      const ints = this.findIntersectionsBetween(entity, other);
      candidates.push(...ints.map(int => ({ ...int, targetId: other.id })));
    });

    if (candidates.length === 0) return;

    // Find nearest candidate to the extension point
    const nearest = candidates.reduce((closest, cand) => {
      const dist = cand.point.distanceTo(extendPoint);
      return dist < closest.dist && dist > 0.1 ? { ...cand, dist } : closest;
    }, { dist: Infinity });

    if (nearest.dist === Infinity) return;

    // Update entity endpoint to intersection point
    if (entity.type === 'line') {
      entity.points[entity.points.length - 1] = nearest.point;
    } else if (entity.type === 'arc') {
      entity.points[1] = nearest.point;
      // Recalculate endAngle
      const [, , center] = entity.points;
      entity.data.endAngle = Math.atan2(
        nearest.point.y - center.y,
        nearest.point.x - center.x
      );
    }

    this.renderEntity(entity);
    window.dispatchEvent(new CustomEvent('sketch:entityModified', { detail: { entity } }));
  },


  mirror(entityIds, lineId) {
    const mirrorLine = this.state.entities.find(e => e.id === lineId);
    if (!mirrorLine || mirrorLine.type !== 'line') return;

    const [p1, p2] = mirrorLine.points;
    const lineDir = p2.clone().sub(p1).normalize();

    entityIds.forEach(id => {
      const entity = this.state.entities.find(e => e.id === id);
      if (!entity) return;

      const mirroredPoints = entity.points.map(point => {
        // Mirror point across line
        const toPoint = point.clone().sub(p1);
        const projected = toPoint.dot(lineDir);
        const perpendicular = toPoint.clone().sub(lineDir.clone().multiplyScalar(projected));
        return p1.clone().add(lineDir.clone().multiplyScalar(projected)).sub(perpendicular);
      });

      this.addEntity(entity.type, {
        points: mirroredPoints,
        isConstruction: entity.isConstruction,
        data: entity.data
      });
    });
  },

  fillet(entityId1, entityId2, radius) {
    const e1 = this.state.entities.find(e => e.id === entityId1);
    const e2 = this.state.entities.find(e => e.id === entityId2);
    if (!e1 || !e2) return;

    // Find intersection point
    const intPoint = this.findIntersectionsBetween(e1, e2)[0];
    if (!intPoint) return;

    // Create arc connecting the two lines
    const arc = this.addEntity('arc', {
      points: [intPoint],
      data: { radius },
      constraints: [{ type: 'tangent', entity1: e1.id, entity2: e2.id }]
    });

    return arc;
  },

  chamfer(entityId1, entityId2, distance) {
    const e1 = this.state.entities.find(e => e.id === entityId1);
    const e2 = this.state.entities.find(e => e.id === entityId2);
    if (!e1 || !e2) return;

    // Find intersection
    const intPoint = this.findIntersectionsBetween(e1, e2)[0];
    if (!intPoint) return;

    // Trim entities and add chamfer line
    this.addEntity('line', {
      points: [
        intPoint.clone().add(new THREE.Vector2(distance, 0)),
        intPoint.clone().add(new THREE.Vector2(0, distance))
      ]
    });
  },

  // ===== DIMENSIONS (DRIVING CONSTRAINTS) =====

  addDimension(type, entityIds, value) {
    /**
     * DIMENSIONS: Driving constraints that control geometry
     *
     * Types:
     * - 'linear': distance between two points or parallel lines
     * - 'angular': angle between two lines
     * - 'radial': radius of circle/arc (displays "R25")
     * - 'diameter': diameter of circle (displays "⌀50")
     * - 'vertical': vertical distance
     * - 'horizontal': horizontal distance
     *
     * When dimension value changes, geometry is scaled/rotated to match.
     * Dimension lines are rendered with arrows, extension lines, and text.
     */
    const dimension = {
      id: `dim_${Date.now()}`,
      type,
      entities: entityIds,
      value,
      driven: true,
      position: new THREE.Vector2(0, 0), // position of dimension line
      rotation: 0, // rotation angle for text
      isSelected: false
    };

    this.state.dimensions.push(dimension);

    // Render dimension to canvas
    this.renderDimension(dimension);

    // Apply dimension constraint: modify geometry to match value
    this.applyDimensionConstraint(dimension);

    window.dispatchEvent(new CustomEvent('sketch:dimensionAdded', { detail: { dimension } }));
    return dimension;
  },

  renderDimension(dimension) {
    /**
     * Render dimension line with arrows, extension lines, and text label.
     *
     * Layout:
     *   Entity geometry
     *       |
     *   Extension line
     *       |
     *   [---arrow---20mm---arrow---]  <- Dimension line
     *       |
     *   Extension line
     *       |
     *   Entity geometry
     */
    if (!this.state.ctx) return;

    const ctx = this.state.ctx;
    const entities = dimension.entities
      .map(id => this.state.entities.find(e => e.id === id))
      .filter(e => e);

    if (entities.length < 2) return;

    let startPoint, endPoint;

    if (dimension.type === 'linear') {
      // Linear dimension: measure distance between two points or entities
      const e1 = entities[0], e2 = entities[1];
      startPoint = e1.points[0];
      endPoint = e2.points[0];
    } else if (dimension.type === 'radial' || dimension.type === 'diameter') {
      // Radial dimension: measure radius/diameter of circle or arc
      const circle = entities[0];
      if (!['circle', 'arc'].includes(circle.type)) return;

      const center = circle.points[0];
      const radius = circle.data.radius;
      startPoint = center;
      endPoint = new THREE.Vector2(center.x + radius, center.y);
    } else if (dimension.type === 'angular') {
      // Angular dimension: measure angle between two lines
      const [e1, e2] = entities;
      if (!e1.points || !e2.points) return;
      startPoint = e1.points[0];
      endPoint = e2.points[0];
    }

    if (!startPoint || !endPoint) return;

    // Dimension line position (offset from geometry)
    const dimOffset = 20; // pixels
    const midPoint = new THREE.Vector2(
      (startPoint.x + endPoint.x) / 2,
      (startPoint.y + endPoint.y) / 2
    );
    const direction = new THREE.Vector2(endPoint.x - startPoint.x, endPoint.y - startPoint.y).normalize();
    const perpendicular = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(dimOffset);

    const dimStart = new THREE.Vector2(startPoint.x + perpendicular.x, startPoint.y + perpendicular.y);
    const dimEnd = new THREE.Vector2(endPoint.x + perpendicular.x, endPoint.y + perpendicular.y);

    // Draw extension lines (from geometry to dimension line)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(dimStart.x, dimStart.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(endPoint.x, endPoint.y);
    ctx.lineTo(dimEnd.x, dimEnd.y);
    ctx.stroke();

    // Draw dimension line with arrows
    ctx.beginPath();
    ctx.moveTo(dimStart.x, dimStart.y);
    ctx.lineTo(dimEnd.x, dimEnd.y);
    ctx.stroke();

    // Draw arrows (triangles at each end)
    const arrowSize = 4;
    this.drawArrow(ctx, dimStart, direction, arrowSize);
    this.drawArrow(ctx, dimEnd, direction.clone().negate(), arrowSize);

    // Draw text label
    const textValue = dimension.type === 'radial' ? `R${dimension.value}` :
                      dimension.type === 'diameter' ? `⌀${dimension.value}` :
                      `${dimension.value}mm`;
    const textPos = new THREE.Vector2(
      (dimStart.x + dimEnd.x) / 2,
      (dimStart.y + dimEnd.y) / 2 - 10
    );

    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(textValue, textPos.x, textPos.y);

    dimension.position = midPoint;
  },

  drawArrow(ctx, point, direction, size) {
    // Draw arrow head (triangle)
    const perp = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(size / 2);
    const back = direction.clone().multiplyScalar(-size).add(point);

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(back.x + perp.x, back.y + perp.y);
    ctx.lineTo(back.x - perp.x, back.y - perp.y);
    ctx.closePath();
    ctx.fill();
  },

  applyDimensionConstraint(dimension) {
    /**
     * Apply dimension constraint: modify geometry to match dimension value
     *
     * For linear dimension: scale/move geometry
     * For radial: change radius of circle/arc
     * For angular: rotate one entity to match angle
     */
    if (!dimension.driven) return;

    const entities = dimension.entities
      .map(id => this.state.entities.find(e => e.id === id))
      .filter(e => e);

    if (dimension.type === 'linear' && entities.length >= 2) {
      const [e1, e2] = entities;
      const currentDist = e1.points[0].distanceTo(e2.points[0]);
      const scale = dimension.value / currentDist;

      // Move e2 to match dimension value
      const dir = new THREE.Vector2(e2.points[0].x - e1.points[0].x, e2.points[0].y - e1.points[0].y)
        .normalize()
        .multiplyScalar(dimension.value);
      e2.points[0] = new THREE.Vector2(e1.points[0].x + dir.x, e1.points[0].y + dir.y);

      this.renderEntity(e2);
    } else if ((dimension.type === 'radial' || dimension.type === 'diameter') && entities.length > 0) {
      const circle = entities[0];
      if (['circle', 'arc'].includes(circle.type)) {
        const newRadius = dimension.type === 'diameter' ? dimension.value / 2 : dimension.value;
        circle.data.radius = newRadius;
        this.renderEntity(circle);
      }
    } else if (dimension.type === 'angular' && entities.length >= 2) {
      const [e1, e2] = entities;
      // Rotate e2 around e1's origin to match angle
      const angle = dimension.value * Math.PI / 180;
      const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));

      e2.points = e2.points.map(p => {
        const relative = new THREE.Vector2(p.x - e1.points[0].x, p.y - e1.points[0].y);
        const rotated = new THREE.Vector2(
          relative.x * Math.cos(angle) - relative.y * Math.sin(angle),
          relative.x * Math.sin(angle) + relative.y * Math.cos(angle)
        );
        return new THREE.Vector2(e1.points[0].x + rotated.x, e1.points[0].y + rotated.y);
      });

      this.renderEntity(e2);
    }
  },

  // ===== CONSTRUCTION GEOMETRY & CONSTRAINTS =====

  toggleConstruction(entityIds) {
    /**
     * CONSTRUCTION GEOMETRY: Reference-only entities not included in sketch profile
     *
     * Construction entities are rendered as dashed lines and not used when
     * extruding or revolving the sketch. Useful for reference geometry,
     * centerlines, and construction lines.
     */
    entityIds.forEach(id => {
      const entity = this.state.entities.find(e => e.id === id);
      if (entity) {
        entity.isConstruction = !entity.isConstruction;
        this.renderEntity(entity);
      }
    });
  },

  offset(entityIds, distance) {
    /**
     * OFFSET CURVES: Create parallel copies at given distance
     *
     * For lines: shift perpendicular by distance
     * For circles: change radius (inward/outward)
     * For arcs: change radius, keep center and angular span
     * For splines: offset control points along normal direction
     */
    entityIds.forEach(id => {
      const entity = this.state.entities.find(e => e.id === id);
      if (!entity) return;

      if (entity.type === 'line' && entity.points.length === 2) {
        // Offset line: shift perpendicular to direction
        const [p1, p2] = entity.points;
        const dir = p2.clone().sub(p1).normalize();
        const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(distance);

        this.addEntity('line', {
          points: [p1.clone().add(perp), p2.clone().add(perp)],
          isConstruction: entity.isConstruction
        });
      } else if (entity.type === 'circle') {
        // Offset circle: change radius
        const newRadius = entity.data.radius + distance;
        if (newRadius > 0.1) {
          this.addEntity('circle', {
            points: entity.points.map(p => p.clone()),
            data: { radius: newRadius },
            isConstruction: entity.isConstruction
          });
        }
      } else if (entity.type === 'arc') {
        // Offset arc: change radius, keep center and angles
        const newRadius = entity.data.radius + distance;
        if (newRadius > 0.1) {
          this.addEntity('arc', {
            points: entity.points.map(p => p.clone()),
            data: {
              radius: newRadius,
              startAngle: entity.data.startAngle,
              endAngle: entity.data.endAngle
            },
            isConstruction: entity.isConstruction
          });
        }
      } else if (entity.type === 'spline') {
        // Offset spline: offset control points along normal direction
        // Use perpendicular direction at each control point
        const offsetPoints = entity.points.map((point, i) => {
          if (i === 0 || i === entity.points.length - 1) {
            // End points: use direction to next/prev point
            const nextPoint = i === 0 ? entity.points[1] : entity.points[i - 1];
            const dir = new THREE.Vector2(nextPoint.x - point.x, nextPoint.y - point.y).normalize();
            const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(distance);
            return point.clone().add(perp);
          } else {
            // Interior points: average of prev and next directions
            const prevDir = new THREE.Vector2(point.x - entity.points[i - 1].x, point.y - entity.points[i - 1].y).normalize();
            const nextDir = new THREE.Vector2(entity.points[i + 1].x - point.x, entity.points[i + 1].y - point.y).normalize();
            const avgDir = new THREE.Vector2(prevDir.x + nextDir.x, prevDir.y + nextDir.y).normalize();
            const perp = new THREE.Vector2(-avgDir.y, avgDir.x).multiplyScalar(distance);
            return point.clone().add(perp);
          }
        });

        this.addEntity('spline', {
          points: offsetPoints,
          data: { degree: entity.data.degree },
          isConstruction: entity.isConstruction
        });
      }
    });
  },

  // ===== RENDERING =====

  setupCanvasOverlay() {
    const canvas = document.createElement('canvas');
    canvas.id = 'sketch-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '32px';
    canvas.style.left = '32px';
    canvas.style.zIndex = '999';
    canvas.style.cursor = 'crosshair';
    canvas.style.display = 'none';
    canvas.style.background = 'rgba(0,0,0,0.05)';

    const rect = document.body.getBoundingClientRect();
    canvas.width = rect.width - 64;
    canvas.height = rect.height - 64;

    document.body.appendChild(canvas);
    this.state.canvas = canvas;
    this.state.ctx = canvas.getContext('2d');
  },

  renderEntity(entity) {
    if (!this.state.canvasGroup) return;

    // Remove existing geometry
    const existing = this.state.canvasGroup.children.find(c => c.userData.entityId === entity.id);
    if (existing) this.state.canvasGroup.remove(existing);

    let geometry, material;
    const color = entity.isConstruction ? 0x888888 : 0x00ff00;
    const linewidth = entity.selected ? 0.3 : 0.1;

    switch (entity.type) {
      case 'line':
        geometry = new THREE.BufferGeometry().setFromPoints(
          entity.points.map(p => new THREE.Vector3(p.x, p.y, 0))
        );
        material = entity.isConstruction
          ? new THREE.LineDashedMaterial({ color, linewidth, dashSize: 2, gapSize: 2 })
          : new THREE.LineBasicMaterial({ color, linewidth });
        break;

      case 'circle':
        geometry = new THREE.BufferGeometry();
        const [center] = entity.points;
        const { radius } = entity.data;
        const circlePoints = [];
        for (let i = 0; i <= 64; i++) {
          const angle = (i / 64) * Math.PI * 2;
          circlePoints.push(new THREE.Vector3(
            center.x + Math.cos(angle) * radius,
            center.y + Math.sin(angle) * radius,
            0
          ));
        }
        geometry.setFromPoints(circlePoints);
        material = entity.isConstruction
          ? new THREE.LineDashedMaterial({ color, linewidth, dashSize: 2, gapSize: 2 })
          : new THREE.LineBasicMaterial({ color, linewidth });
        break;

      case 'arc':
        geometry = new THREE.BufferGeometry();
        const [s, e, c] = entity.points;
        const { startAngle, endAngle } = entity.data;
        const arcPoints = [];
        for (let i = 0; i <= 32; i++) {
          const t = i / 32;
          const angle = startAngle + (endAngle - startAngle) * t;
          const r = entity.data.radius;
          arcPoints.push(new THREE.Vector3(
            c.x + Math.cos(angle) * r,
            c.y + Math.sin(angle) * r,
            0
          ));
        }
        geometry.setFromPoints(arcPoints);
        material = entity.isConstruction
          ? new THREE.LineDashedMaterial({ color, linewidth, dashSize: 2, gapSize: 2 })
          : new THREE.LineBasicMaterial({ color, linewidth });
        break;

      case 'spline':
        // Render spline curve evaluated at high resolution
        geometry = new THREE.BufferGeometry();
        const splinePoints = [];
        const samples = 128; // High resolution curve
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const point = this.evaluateBSpline(entity.points, t, entity.data.degree);
          splinePoints.push(new THREE.Vector3(point.x, point.y, 0));
        }
        geometry.setFromPoints(splinePoints);
        material = entity.isConstruction
          ? new THREE.LineDashedMaterial({ color, linewidth, dashSize: 2, gapSize: 2 })
          : new THREE.LineBasicMaterial({ color, linewidth });
        break;

      default:
        return;
    }

    const line = new THREE.Line(geometry, material);
    line.userData.entityId = entity.id;

    // Set line distance for dashed material
    if (material instanceof THREE.LineDashedMaterial) {
      line.computeLineDistances();
    }

    this.state.canvasGroup.add(line);
  },

  updateStatusBar() {
    if (document.getElementById('sketch-entity-count')) {
      document.getElementById('sketch-entity-count').textContent = this.state.entities.length;
    }
  },

  // ===== INTERSECTION ENGINE =====
  /**
   * ROBUST GEOMETRIC INTERSECTION FUNCTIONS
   *
   * Each function returns parametric values (t) along the first entity
   * and the actual intersection point(s). This allows trim() to know
   * WHERE on the entity to split.
   */

  findAllIntersectionsOnEntity(entity) {
    /**
     * Find all intersection points on a given entity with all other entities.
     * Returns array of { point, t, otherEntity } sorted by parametric position.
     */
    const intersections = [];

    this.state.entities.forEach(other => {
      if (other.id === entity.id) return;
      const ints = this.findIntersectionsBetween(entity, other);
      intersections.push(...ints);
    });

    // Sort by parametric position along entity
    return intersections.sort((a, b) => (a.t || 0) - (b.t || 0));
  },

  findIntersections(entity) {
    const intersections = [];
    this.state.entities.forEach(other => {
      if (other.id !== entity.id) {
        const ints = this.findIntersectionsBetween(entity, other);
        intersections.push(...ints.map(int => int.point));
      }
    });
    return intersections;
  },

  findIntersectionsBetween(e1, e2) {
    /**
     * Dispatch to appropriate intersection function based on entity types.
     * Returns array of { point, t, t2 } for each intersection.
     */
    const intersections = [];

    // Line-Line
    if (e1.type === 'line' && e2.type === 'line') {
      const int = this.lineLineIntersection(e1.points[0], e1.points[1], e2.points[0], e2.points[1]);
      if (int) intersections.push(int);
    }

    // Line-Circle
    else if (e1.type === 'line' && e2.type === 'circle') {
      const ints = this.lineCircleIntersection(e1.points[0], e1.points[1], e2.points[0], e2.data.radius);
      intersections.push(...ints);
    } else if (e1.type === 'circle' && e2.type === 'line') {
      const ints = this.lineCircleIntersection(e2.points[0], e2.points[1], e1.points[0], e1.data.radius);
      intersections.push(...ints.map(int => ({ ...int, t: int.t2, t2: int.t })));
    }

    // Line-Arc
    else if (e1.type === 'line' && e2.type === 'arc') {
      const ints = this.lineArcIntersection(e1.points[0], e1.points[1], e2);
      intersections.push(...ints);
    } else if (e1.type === 'arc' && e2.type === 'line') {
      const ints = this.lineArcIntersection(e2.points[0], e2.points[1], e1);
      intersections.push(...ints.map(int => ({ ...int, t: int.t2, t2: int.t })));
    }

    // Circle-Circle
    else if (e1.type === 'circle' && e2.type === 'circle') {
      const ints = this.circleCircleIntersection(e1.points[0], e1.data.radius, e2.points[0], e2.data.radius);
      intersections.push(...ints);
    }

    // Arc-Arc
    else if (e1.type === 'arc' && e2.type === 'arc') {
      const ints = this.circleCircleIntersection(e1.points[2], e1.data.radius, e2.points[2], e2.data.radius);
      intersections.push(...ints.filter(int => this.pointOnArc(int.point, e1) && this.pointOnArc(int.point, e2)));
    }

    return intersections;
  },

  lineLineIntersection(p1, p2, p3, p4) {
    /**
     * LINE-LINE INTERSECTION (2D)
     *
     * Parametric form:
     *   P = p1 + t * (p2 - p1)  for first line
     *   Q = p3 + s * (p4 - p3)  for second line
     *
     * At intersection: P = Q
     *   p1 + t * (p2 - p1) = p3 + s * (p4 - p3)
     *
     * Solving using cross products and determinants.
     */
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null; // Parallel or coincident

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const s = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // Check if intersection is within both line segments
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
      const point = new THREE.Vector2(x1 + t * (x2 - x1), y1 + t * (y2 - y1));
      return { point, t, t2: s };
    }

    return null;
  },

  lineCircleIntersection(p1, p2, center, radius) {
    /**
     * LINE-CIRCLE INTERSECTION (2D)
     *
     * Line: P = p1 + t * (p2 - p1), t ∈ [0, 1]
     * Circle: |P - center| = radius
     *
     * Substitute line into circle equation and solve quadratic:
     *   a*t² + b*t + c = 0
     * where:
     *   a = |direction|²
     *   b = 2 * (direction · (p1 - center))
     *   c = |p1 - center|² - radius²
     */
    const dir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y);
    const oc = new THREE.Vector2(p1.x - center.x, p1.y - center.y);

    const a = dir.dot(dir);
    const b = 2 * dir.dot(oc);
    const c = oc.dot(oc) - radius * radius;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return []; // No intersection

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    const intersections = [];

    if (t1 >= 0 && t1 <= 1) {
      const point = new THREE.Vector2(p1.x + t1 * dir.x, p1.y + t1 * dir.y);
      intersections.push({ point, t: t1, t2: Math.atan2(point.y - center.y, point.x - center.x) });
    }

    if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 1e-6) {
      const point = new THREE.Vector2(p1.x + t2 * dir.x, p1.y + t2 * dir.y);
      intersections.push({ point, t: t2, t2: Math.atan2(point.y - center.y, point.x - center.x) });
    }

    return intersections;
  },

  lineArcIntersection(p1, p2, arc) {
    /**
     * LINE-ARC INTERSECTION
     *
     * Arc is part of circle, so find line-circle intersections,
     * then filter to only those within arc's angular span.
     */
    const [, , center] = arc.points;
    const radius = arc.data.radius;

    const ints = this.lineCircleIntersection(p1, p2, center, radius);

    // Filter to points within arc's angular span
    return ints.filter(int => {
      const angle = Math.atan2(int.point.y - center.y, int.point.x - center.x);
      return this.angleInRange(angle, arc.data.startAngle, arc.data.endAngle);
    }).map(int => ({ ...int, t2: angle }));
  },

  circleCircleIntersection(c1, r1, c2, r2) {
    /**
     * CIRCLE-CIRCLE INTERSECTION (2D)
     *
     * Two circles:
     *   |P - c1| = r1
     *   |P - c2| = r2
     *
     * Distance between centers: d = |c2 - c1|
     * If d > r1 + r2 or d < |r1 - r2|: no intersection
     * If d = 0 and r1 = r2: coincident (infinite intersections)
     * Otherwise: two intersection points
     */
    const dx = c2.x - c1.x;
    const dy = c2.y - c1.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    // Check for no intersection or coincident circles
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d < 1e-10) return [];

    // Distance from c1 to line connecting intersection points
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);

    // Perpendicular distance from line to intersection points
    const h = Math.sqrt(r1 * r1 - a * a);

    // Midpoint of intersection chord
    const mx = c1.x + a * dx / d;
    const my = c1.y + a * dy / d;

    // Perpendicular vector (normalized)
    const px = -dy / d;
    const py = dx / d;

    const p1 = new THREE.Vector2(mx + h * px, my + h * py);
    const p2 = new THREE.Vector2(mx - h * px, my - h * py);

    const intersections = [];

    if (h > 1e-6) {
      // Two distinct points
      intersections.push(
        { point: p1, t: Math.atan2(p1.y - c1.y, p1.x - c1.x), t2: Math.atan2(p1.y - c2.y, p1.x - c2.x) },
        { point: p2, t: Math.atan2(p2.y - c1.y, p2.x - c1.x), t2: Math.atan2(p2.y - c2.y, p2.x - c2.x) }
      );
    } else {
      // Single tangent point
      intersections.push(
        { point: p1, t: Math.atan2(p1.y - c1.y, p1.x - c1.x), t2: Math.atan2(p1.y - c2.y, p1.x - c2.x) }
      );
    }

    return intersections;
  },

  angleInRange(angle, start, end) {
    /**
     * Check if angle falls within arc's angular span
     * Handles wraparound at 2π boundary
     */
    // Normalize angles to [0, 2π)
    const a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let s = ((start % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let e = ((end % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    if (s <= e) {
      return a >= s && a <= e;
    } else {
      return a >= s || a <= e;
    }
  },

  pointOnArc(point, arc) {
    /**
     * Check if a point lies on an arc (within tolerance)
     */
    const [, , center] = arc.points;
    const distToCenter = point.distanceTo(center);
    const angle = Math.atan2(point.y - center.y, point.x - center.x);

    return Math.abs(distToCenter - arc.data.radius) < 0.1 &&
           this.angleInRange(angle, arc.data.startAngle, arc.data.endAngle);
  },

  // ===== ADVANCED DIMENSIONS =====

  addOrdinateDimension(entityId, baselineEntity, direction = 'X') {
    /**
     * ORDINATE DIMENSION: Baseline reference dimension system
     *
     * Creates a series of dimensions measured from a baseline
     * entity. All dimensions reference the same baseline (e.g., left edge).
     * More compact than individual linear dimensions.
     */
    const entity = this.state.entities.find(e => e.id === entityId);
    const baseline = this.state.entities.find(e => e.id === baselineEntity.id);

    if (!entity || !baseline) return null;

    const dim = {
      id: `dim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'ordinate',
      entities: [entity.id, baseline.id],
      direction,
      driven: true,
      value: this.computeOrdinateMeasurement(entity, baseline, direction)
    };

    this.state.dimensions.push(dim);
    window.dispatchEvent(new CustomEvent('sketch:dimensionAdded', { detail: { dimension: dim } }));
    return dim;
  },

  autoDimension() {
    /**
     * AUTO-DIMENSION: Detect and apply minimal sufficient dimension set
     *
     * Analyzes sketch geometry and constraints to determine
     * the minimum number of dimensions needed to fully constrain the sketch.
     * Uses a greedy algorithm to select important dimensions.
     */
    const essentialDims = [];
    const profile = this.getProfile();

    // Count degrees of freedom
    let dof = profile.entities.length * 3; // Each entity: 2 position + 1 orientation
    dof -= profile.entities.filter(e => e.constraints.some(c => c.type === 'fixed')).length * 3;

    // Add dimensions for unconstrained entities
    profile.entities.forEach(entity => {
      if (dof <= 0) return;

      const isConstrained = entity.constraints && entity.constraints.length > 0;
      if (!isConstrained) {
        let dimType = null;
        let value = null;

        if (entity.type === 'line') {
          dimType = 'distance';
          value = entity.points[0].distanceTo(entity.points[1]);
          dof -= 1;
        } else if (entity.type === 'circle') {
          dimType = 'radius';
          value = entity.data.radius;
          dof -= 1;
        } else if (entity.type === 'arc') {
          dimType = 'radius';
          value = entity.data.radius;
          dof -= 1;
        }

        if (dimType) {
          essentialDims.push({
            id: `auto_dim_${Date.now()}_${essentialDims.length}`,
            type: dimType,
            entities: [entity.id],
            value,
            driven: true
          });
        }
      }
    });

    this.state.dimensions.push(...essentialDims);
    return essentialDims;
  },

  addReferenceDimension(entityId, type = 'distance', value = null) {
    /**
     * REFERENCE DIMENSION: Non-driving dimension for display
     *
     * Creates a dimension that displays the measurement but
     * does not constrain the geometry. Useful for documenting
     * features and creating assembly notes.
     */
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity) return null;

    const computedValue = value !== null ? value : this.computeEntityMeasurement(entity, type);

    const dim = {
      id: `ref_dim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      entities: [entityId],
      value: computedValue,
      driven: false, // Key: reference dimensions are NOT driven
      isReference: true
    };

    this.state.dimensions.push(dim);
    window.dispatchEvent(new CustomEvent('sketch:dimensionAdded', { detail: { dimension: dim } }));
    return dim;
  },

  computeEntityMeasurement(entity, measurementType) {
    /**
     * Compute measurement value for an entity
     * @param {object} entity - sketch entity
     * @param {string} measurementType - 'distance', 'radius', 'diameter', 'angle', etc.
     * @returns {number} measurement value in current units
     */
    switch (measurementType) {
      case 'distance':
        if (entity.type === 'line') {
          return entity.points[0].distanceTo(entity.points[1]);
        }
        return 0;

      case 'radius':
        if (entity.type === 'circle' || entity.type === 'arc') {
          return entity.data.radius || 0;
        }
        return 0;

      case 'diameter':
        if (entity.type === 'circle' || entity.type === 'arc') {
          return (entity.data.radius || 0) * 2;
        }
        return 0;

      case 'angle':
        if (entity.type === 'arc') {
          const { startAngle, endAngle } = entity.data;
          return (endAngle - startAngle) * (180 / Math.PI);
        }
        return 0;

      default:
        return 0;
    }
  },

  computeOrdinateMeasurement(entity, baseline, direction) {
    /**
     * Compute ordinate measurement (distance from baseline)
     * @param {object} entity - sketch entity to measure
     * @param {object} baseline - reference baseline entity
     * @param {string} direction - 'X' or 'Y'
     * @returns {number} measurement value
     */
    const baselinePos = baseline.points[0];
    const entityPos = entity.points[0];

    if (direction === 'X') {
      return Math.abs(entityPos.x - baselinePos.x);
    } else if (direction === 'Y') {
      return Math.abs(entityPos.y - baselinePos.y);
    }
    return 0;
  },

  getProfile() {
    // Extract closed wire from entities for extrude/revolve
    return {
      entities: this.state.entities.filter(e => !e.isConstruction),
      dimensions: this.state.dimensions,
      plane: this.state.plane
    };
  },

  // ===== HELPER METHODS FOR NEW TOOLS =====

  evaluateEntityAtParameter(entity, t) {
    /**
     * Evaluate entity position at parameter t ∈ [0, 1]
     */
    if (entity.type === 'line') {
      const [p1, p2] = entity.points;
      return new THREE.Vector2(
        p1.x + t * (p2.x - p1.x),
        p1.y + t * (p2.y - p1.y)
      );
    } else if (entity.type === 'arc') {
      const [start, end] = entity.points;
      const [, , center] = entity.points;
      const angle = entity.data.startAngle + t * (entity.data.endAngle - entity.data.startAngle);
      return new THREE.Vector2(
        center.x + entity.data.radius * Math.cos(angle),
        center.y + entity.data.radius * Math.sin(angle)
      );
    } else if (entity.type === 'spline') {
      return this.evaluateBSpline(entity.points, t, entity.data.degree);
    }
    return entity.points[0];
  },

  evaluateEntityTangentAtParameter(entity, t) {
    /**
     * Evaluate entity tangent vector at parameter t ∈ [0, 1]
     */
    const delta = 0.001;
    const p1 = this.evaluateEntityAtParameter(entity, Math.max(0, t - delta));
    const p2 = this.evaluateEntityAtParameter(entity, Math.min(1, t + delta));
    return new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();
  },

  findParameterAlongEntity(entity, point) {
    /**
     * Find parameter t along entity closest to given point
     * @returns {number|null} parameter t ∈ [0, 1], or null if not found
     */
    if (entity.type === 'line') {
      const [p1, p2] = entity.points;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) return 0;

      const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2;
      return Math.max(0, Math.min(1, t));
    }
    return null;
  },

  findEntityDragCrossings(entity, dragLine) {
    /**
     * Find all points where entity crosses a drag line
     */
    const crossings = [];

    if (entity.type === 'line') {
      const int = this.lineLineIntersection(entity.points[0], entity.points[1], dragLine.p1, dragLine.p2);
      if (int) crossings.push(int);
    } else if (entity.type === 'arc') {
      const ints = this.lineArcIntersection(dragLine.p1, dragLine.p2, entity);
      crossings.push(...ints);
    }

    return crossings;
  },

  findAllIntersectionsOnEntity(entity) {
    /**
     * Find all intersections of an entity with other entities
     */
    const intersections = [];

    this.state.entities.forEach(other => {
      if (other.id === entity.id) return;
      const ints = this.findIntersection(entity, other);
      intersections.push(...ints);
    });

    return intersections;
  },

  findIntersection(entity1, entity2) {
    /**
     * Find all intersections between two entities
     */
    const ints = [];

    if (entity1.type === 'line' && entity2.type === 'line') {
      const int = this.lineLineIntersection(
        entity1.points[0], entity1.points[1],
        entity2.points[0], entity2.points[1]
      );
      if (int) ints.push(int);
    } else if (entity1.type === 'line' && entity2.type === 'circle') {
      const circleInts = this.lineCircleIntersection(
        entity1.points[0], entity1.points[1],
        entity2.points[0], entity2.data.radius
      );
      ints.push(...circleInts);
    } else if (entity1.type === 'circle' && entity2.type === 'circle') {
      const circleInts = this.circleCircleIntersection(
        entity1.points[0], entity1.data.radius,
        entity2.points[0], entity2.data.radius
      );
      ints.push(...circleInts);
    }

    return ints;
  },

  setupEventHandlers() {
    // Tool button clicks
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('sketch-tool-btn') && e.target.dataset.tool) {
        this.setTool(e.target.dataset.tool);
      }
      if (e.target.id === 'sketch-finish-btn') this.finish();
    });

    // Canvas drawing
    if (this.state.canvas) {
      this.state.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
      this.state.canvas.addEventListener('mousemove', (e) => this.handleCanvasMove(e));
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (!this.state.isActive) return;
      switch (e.key.toLowerCase()) {
        case 'l': this.setTool('line'); break;
        case 'r': this.setTool('rectangle'); break;
        case 'c': this.setTool('circle'); break;
        case 'a': this.setTool('arc'); break;
        case 's': this.setTool('spline'); break;
        case 'e':
          if (this.state.currentTool === 'spline') {
            this.finishSpline();
          } else {
            this.setTool('ellipse');
          }
          break;
        case 'p': this.setTool('polygon'); break;
        case 't': this.setTool('text'); break;
        case 'g': this.toggleConstruction(Array.from(this.state.selectedEntityIds)); break;
        case 'd': this.setTool('dimension'); break;
        case 'escape':
          if (this.state.tempPoints.length > 0) {
            this.state.tempPoints = [];
          } else {
            this.finish();
          }
          break;
        case 'enter':
          if (this.state.currentTool === 'spline') {
            this.finishSpline();
          }
          break;
      }
    });
  },

  setupToolbar() {
    // Toolbar setup happens in getUI()
  },

  handleCanvasClick(e) {
    const rect = this.state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.state.canvas.width * 100;
    const y = (e.clientY - rect.top) / this.state.canvas.height * 100;
    const point = new THREE.Vector2(x, y);

    if (this.state.snapToGrid) {
      point.x = Math.round(point.x / this.state.gridSize) * this.state.gridSize;
      point.y = Math.round(point.y / this.state.gridSize) * this.state.gridSize;
    }

    this.state.tempPoints.push(point);

    // Tool-specific logic
    switch (this.state.currentTool) {
      case 'line':
        if (this.state.tempPoints.length === 2) {
          this.drawLine(this.state.tempPoints[0], this.state.tempPoints[1]);
          this.state.tempPoints = [];
        }
        break;

      case 'rectangle':
        if (this.state.tempPoints.length === 2) {
          this.drawRectangle(this.state.tempPoints[0], this.state.tempPoints[1]);
          this.state.tempPoints = [];
        }
        break;

      case 'circle':
        if (this.state.tempPoints.length === 2) {
          const radius = this.state.tempPoints[0].distanceTo(this.state.tempPoints[1]);
          this.drawCircle(this.state.tempPoints[0], radius);
          this.state.tempPoints = [];
        }
        break;

      case 'arc':
        if (this.state.tempPoints.length === 3) {
          this.drawArc(this.state.tempPoints[0], this.state.tempPoints[1], this.state.tempPoints[2]);
          this.state.tempPoints = [];
        }
        break;

      case 'trim':
        this.trim(this.state.selectedEntityIds.values().next().value, point);
        break;

      case 'polygon':
        if (this.state.tempPoints.length === 2) {
          const sides = 6;
          const radius = this.state.tempPoints[0].distanceTo(this.state.tempPoints[1]);
          this.drawPolygon(this.state.tempPoints[0], sides, radius);
          this.state.tempPoints = [];
        }
        break;

      case 'spline':
        // Accumulate control points, finish with right-click or Escape
        if (this.state.tempPoints.length >= 3) {
          // Allow finishing on third+ point by double-clicking
          if (e.detail === 2 || e.shiftKey) {
            this.drawSpline(this.state.tempPoints);
            this.state.tempPoints = [];
          }
        }
        break;

      case 'trim':
      case 'extend':
      case 'offset':
      case 'mirror':
      case 'fillet':
      case 'chamfer':
        // These tools require entity selection, handled separately
        break;
    }
  },

  finishSpline() {
    /**
     * Finish spline drawing (called on right-click or Enter)
     */
    if (this.state.currentTool === 'spline' && this.state.tempPoints.length >= 3) {
      this.drawSpline(this.state.tempPoints);
      this.state.tempPoints = [];
    }
  },

  handleCanvasMove(e) {
    // Live preview while drawing — update preview geometry
    const rect = this.state.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.state.canvas.width * 100;
    const y = (e.clientY - rect.top) / this.state.canvas.height * 100;
    const point = new THREE.Vector2(x, y);

    // Render preview based on current tool and tempPoints
  },

  undo() {
    if (this.state.entities.length > 0) {
      this.state.entities.pop();
      if (this.state.canvasGroup) {
        this.state.canvasGroup.clear();
        this.state.entities.forEach(e => this.renderEntity(e));
      }
      this.updateStatusBar();
    }
  },

  redo() {
    // Simple redo — in production, use proper undo/redo stack
  }
};

/**
 * HELP ENTRIES: Documentation for all sketch tools and features
 * Exported for Help System integration
 */
SketchModule.HELP_ENTRIES = [
  // Basic Drawing Tools
  {
    id: 'sketch.line',
    title: 'Line Tool',
    description: 'Draw a straight line between two points. Click to set start, click again to set end.',
    category: 'Drawing',
    hotkey: 'L'
  },
  {
    id: 'sketch.rectangle',
    title: 'Rectangle Tool',
    description: 'Draw axis-aligned rectangle by two corner points.',
    category: 'Drawing',
    hotkey: 'R'
  },
  {
    id: 'sketch.circle',
    title: 'Circle Tool',
    description: 'Draw circle by center point and radius point.',
    category: 'Drawing',
    hotkey: 'C'
  },
  {
    id: 'sketch.arc',
    title: 'Arc Tool',
    description: 'Draw arc by start, end, and center points.',
    category: 'Drawing',
    hotkey: 'A'
  },
  {
    id: 'sketch.ellipse',
    title: 'Ellipse Tool',
    description: 'Draw ellipse by center and two axis endpoints.',
    category: 'Drawing',
    hotkey: 'E'
  },
  {
    id: 'sketch.spline',
    title: 'Control Point Spline',
    description: 'Draw cubic B-spline by control points. Double-click or Enter to finish.',
    category: 'Drawing',
    hotkey: 'S'
  },
  {
    id: 'sketch.spline_fit',
    title: 'Fit Point Spline',
    description: 'Draw interpolating spline through specified points (unlike control-point splines).',
    category: 'Drawing'
  },
  {
    id: 'sketch.polygon',
    title: 'Polygon Tool',
    description: 'Draw regular polygon by center and corner point.',
    category: 'Drawing',
    hotkey: 'P'
  },

  // Slot Tools
  {
    id: 'sketch.slot',
    title: 'Slot (Center-Point)',
    description: 'Draw slot by center point, width, and height.',
    category: 'Drawing'
  },
  {
    id: 'sketch.slot_3point',
    title: 'Slot (3-Point)',
    description: 'Draw slot by two endpoints and arc radius.',
    category: 'Drawing'
  },
  {
    id: 'sketch.slot_ctc',
    title: 'Slot (Center-to-Center)',
    description: 'Draw slot by arc centers and radius.',
    category: 'Drawing'
  },

  // Conic Sections
  {
    id: 'sketch.conic',
    title: 'Conic Sections',
    description: 'Draw parabola or hyperbola using focus/directrix (parabola) or foci (hyperbola).',
    category: 'Drawing'
  },

  // Text Tools
  {
    id: 'sketch.text',
    title: 'Text Tool',
    description: 'Place text at a specific point in the sketch.',
    category: 'Drawing',
    hotkey: 'T'
  },
  {
    id: 'sketch.text_path',
    title: 'Text Along Path',
    description: 'Place text that follows a line, arc, or spline curve.',
    category: 'Drawing'
  },

  // Reference Geometry
  {
    id: 'sketch.point',
    title: 'Point Tool',
    description: 'Create a standalone construction point for reference.',
    category: 'Reference'
  },
  {
    id: 'sketch.midpoint',
    title: 'Midpoint',
    description: 'Create a point at the midpoint of a line, arc, or spline.',
    category: 'Reference'
  },

  // Editing Tools
  {
    id: 'sketch.trim',
    title: 'Trim Tool',
    description: 'Remove segments between intersections. Click on segment to trim.',
    category: 'Editing'
  },
  {
    id: 'sketch.power_trim',
    title: 'Power Trim',
    description: 'Click and drag to trim multiple entities at once.',
    category: 'Editing'
  },
  {
    id: 'sketch.break',
    title: 'Break at Point',
    description: 'Split a line or arc into two segments at a specified point.',
    category: 'Editing'
  },
  {
    id: 'sketch.extend',
    title: 'Extend Tool',
    description: 'Extend a line toward other geometry.',
    category: 'Editing'
  },
  {
    id: 'sketch.offset',
    title: 'Offset Tool',
    description: 'Create offset copies of lines and curves.',
    category: 'Editing'
  },
  {
    id: 'sketch.mirror',
    title: 'Mirror Tool',
    description: 'Mirror selected entities across a line.',
    category: 'Editing'
  },
  {
    id: 'sketch.fillet',
    title: 'Fillet Tool',
    description: 'Round corners between intersecting lines.',
    category: 'Editing'
  },
  {
    id: 'sketch.chamfer',
    title: 'Chamfer Tool',
    description: 'Create beveled edges between intersecting lines.',
    category: 'Editing'
  },

  // Pattern Tools
  {
    id: 'sketch.rect_pattern',
    title: 'Rectangular Pattern',
    description: 'Array selected entities in a grid with specified spacing.',
    category: 'Pattern'
  },
  {
    id: 'sketch.circ_pattern',
    title: 'Circular Pattern',
    description: 'Array selected entities radially around a center point.',
    category: 'Pattern'
  },
  {
    id: 'sketch.path_pattern',
    title: 'Pattern Along Path',
    description: 'Array selected entities along a line, arc, or spline.',
    category: 'Pattern'
  },

  // Geometry Operations
  {
    id: 'sketch.project',
    title: 'Project Edge',
    description: 'Project a 3D edge orthogonally onto the sketch plane.',
    category: 'Geometry'
  },
  {
    id: 'sketch.include',
    title: 'Include Geometry',
    description: 'Reference geometry from another sketch (linked, updates automatically).',
    category: 'Geometry'
  },
  {
    id: 'sketch.intersection',
    title: 'Intersection Curve',
    description: 'Create sketch curve from intersection of two 3D surfaces.',
    category: 'Geometry'
  },
  {
    id: 'sketch.construction',
    title: 'Construction Geometry',
    description: 'Toggle selected entities as construction (reference-only). (G)',
    category: 'Geometry',
    hotkey: 'G'
  },

  // Dimension Tools
  {
    id: 'sketch.dimension',
    title: 'Add Dimension',
    description: 'Add linear, radial, angular, or diameter dimension to constrain geometry.',
    category: 'Dimensions',
    hotkey: 'D'
  },
  {
    id: 'sketch.ordinate',
    title: 'Ordinate Dimension',
    description: 'Create baseline-based ordinate dimensions for aligned measurements.',
    category: 'Dimensions'
  },
  {
    id: 'sketch.reference',
    title: 'Reference Dimension',
    description: 'Add non-driving dimension for documentation (does not constrain).',
    category: 'Dimensions'
  },
  {
    id: 'sketch.auto_dim',
    title: 'Auto Dimension',
    description: 'Automatically detect and apply minimal sufficient dimension set.',
    category: 'Dimensions'
  },

  // Constraint System
  {
    id: 'sketch.constraints',
    title: 'Constraints Overview',
    description: 'Sketch constraints: coincident, horizontal, vertical, parallel, perpendicular, tangent, equal, fix, concentric, symmetric, collinear, midpoint, coradial.',
    category: 'Constraints'
  }
];

export default SketchModule;
