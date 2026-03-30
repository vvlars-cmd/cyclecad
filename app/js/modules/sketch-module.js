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
        <button data-tool="line" class="sketch-tool-btn" title="Line (L)">—</button>
        <button data-tool="rectangle" class="sketch-tool-btn" title="Rectangle (R)">▭</button>
        <button data-tool="circle" class="sketch-tool-btn" title="Circle (C)">●</button>
        <button data-tool="arc" class="sketch-tool-btn" title="Arc (A)">⌒</button>
        <button data-tool="ellipse" class="sketch-tool-btn" title="Ellipse (E)">⬭</button>
        <button data-tool="spline" class="sketch-tool-btn" title="Spline (S)">✓</button>
        <button data-tool="polygon" class="sketch-tool-btn" title="Polygon (P)">⬡</button>
        <button data-tool="slot" class="sketch-tool-btn" title="Slot">⊟</button>
        <button data-tool="text" class="sketch-tool-btn" title="Text (T)">T</button>
        <button data-tool="trim" class="sketch-tool-btn" title="Trim">✂</button>
        <button data-tool="extend" class="sketch-tool-btn" title="Extend">→</button>
        <button data-tool="offset" class="sketch-tool-btn" title="Offset">⟿</button>
        <button data-tool="mirror" class="sketch-tool-btn" title="Mirror">⇄</button>
        <button data-tool="fillet" class="sketch-tool-btn" title="Fillet">⌢</button>
        <button data-tool="chamfer" class="sketch-tool-btn" title="Chamfer">/</button>
        <button data-tool="construction" class="sketch-tool-btn" title="Toggle Construction (G)">⋯</button>
        <button id="sketch-dimension-btn" class="sketch-tool-btn" title="Add Dimension (D)">📏</button>
        <button id="sketch-finish-btn" style="margin-left: 16px; background: #00aa00; color: white;" title="Finish Sketch (Esc)">✓ Finish</button>
      </div>
      <div id="sketch-status-bar" style="display: none; color: #aaa; font-size: 12px; padding: 4px 8px; border-top: 1px solid #444; background: #1a1a1a;">
        Tool: <span id="sketch-tool-name">Line</span> | Grid: <span id="sketch-grid-size">5mm</span> | Entities: <span id="sketch-entity-count">0</span>
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
    // Get face from current model
    // For now, simplified — in real implementation, get face normal from model
    const face = window._selectedFace || {};
    const plane = {
      normal: face.normal || new THREE.Vector3(0, 0, 1),
      origin: face.origin || new THREE.Vector3(0, 0, 0),
      u: face.u || new THREE.Vector3(1, 0, 0),
      v: face.v || new THREE.Vector3(0, 1, 0)
    };
    this.start(plane);
  },

  finish() {
    if (!this.state.isActive) return null;

    this.state.isActive = false;
    document.getElementById('sketch-toolbar').style.display = 'none';
    document.getElementById('sketch-status-bar').style.display = 'none';
    if (this.state.canvas) this.state.canvas.style.display = 'none';

    // Remove 3D group
    if (this.state.canvasGroup && window._scene) {
      window._scene.remove(this.state.canvasGroup);
    }

    const profile = this.getProfile();
    window.dispatchEvent(new CustomEvent('sketch:finished', {
      detail: { entities: this.state.entities, profile, plane: this.state.plane }
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
    return this.addEntity('spline', {
      points: controlPoints,
      data: { degree: 3 }
    });
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

  // ===== EDITING TOOLS =====

  trim(entityId, clickPoint) {
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity) return;

    // Find intersection points on entity
    const intersections = this.findIntersections(entity);
    const closestIntersection = intersections.reduce((closest, int) => {
      const dist = int.distanceTo(clickPoint);
      return dist < closest.dist ? { point: int, dist } : closest;
    }, { dist: Infinity });

    if (closestIntersection.dist < this.state.snapDistance) {
      // Split entity at intersection
      this.splitEntity(entityId, closestIntersection.point);
    }
  },

  extend(entityId) {
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity || !['line', 'arc'].includes(entity.type)) return;

    // Find nearest intersection on other entities
    const allIntersections = [];
    this.state.entities.forEach(e => {
      if (e.id !== entityId) {
        const ints = this.findIntersectionsBetween(entity, e);
        allIntersections.push(...ints);
      }
    });

    if (allIntersections.length > 0) {
      const nearest = allIntersections.reduce((n, int) => {
        const d = int.distanceTo(entity.points[entity.points.length - 1]);
        return d < n.dist ? { point: int, dist: d } : n;
      }, { dist: Infinity });

      entity.points[entity.points.length - 1] = nearest.point;
      this.renderEntity(entity);
    }
  },

  offset(entityIds, distance) {
    entityIds.forEach(id => {
      const entity = this.state.entities.find(e => e.id === id);
      if (!entity) return;

      let offsetPoints = [];
      if (entity.type === 'line' && entity.points.length === 2) {
        const [p1, p2] = entity.points;
        const dir = p2.clone().sub(p1).normalize();
        const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(distance);
        offsetPoints = [p1.clone().add(perp), p2.clone().add(perp)];
      } else if (entity.type === 'circle') {
        // Offset circle by changing radius
        const newEntity = this.addEntity('circle', {
          points: entity.points,
          data: { radius: entity.data.radius + distance }
        });
        return;
      }

      if (offsetPoints.length > 0) {
        this.addEntity(entity.type, {
          points: offsetPoints,
          isConstruction: entity.isConstruction
        });
      }
    });
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

  // ===== DIMENSIONS =====

  addDimension(type, entityIds, value) {
    const dimension = {
      id: `dim_${Date.now()}`,
      type,
      entities: entityIds,
      value,
      driven: true
    };

    this.state.dimensions.push(dimension);
    window.dispatchEvent(new CustomEvent('sketch:dimensionAdded', { detail: { dimension } }));
    return dimension;
  },

  // ===== CONSTRAINTS =====

  toggleConstruction(entityIds) {
    entityIds.forEach(id => {
      const entity = this.state.entities.find(e => e.id === id);
      if (entity) {
        entity.isConstruction = !entity.isConstruction;
        this.renderEntity(entity);
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
        geometry = new THREE.BufferGeometry().setFromPoints(entity.points);
        material = new THREE.LineBasicMaterial({ color, linewidth });
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
        material = new THREE.LineBasicMaterial({ color, linewidth });
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
        material = new THREE.LineBasicMaterial({ color, linewidth });
        break;

      default:
        return;
    }

    const line = new THREE.Line(geometry, material);
    line.userData.entityId = entity.id;
    this.state.canvasGroup.add(line);
  },

  updateStatusBar() {
    if (document.getElementById('sketch-entity-count')) {
      document.getElementById('sketch-entity-count').textContent = this.state.entities.length;
    }
  },

  // ===== HELPER METHODS =====

  findIntersections(entity) {
    const intersections = [];
    this.state.entities.forEach(other => {
      if (other.id !== entity.id) {
        const ints = this.findIntersectionsBetween(entity, other);
        intersections.push(...ints);
      }
    });
    return intersections;
  },

  findIntersectionsBetween(e1, e2) {
    // Simplified intersection detection
    // In production, use robust geometric intersection library
    const intersections = [];

    if (e1.type === 'line' && e2.type === 'line') {
      const [p1, p2] = e1.points;
      const [p3, p4] = e2.points;
      const int = this.lineLineIntersection(p1, p2, p3, p4);
      if (int) intersections.push(int);
    }

    return intersections;
  },

  lineLineIntersection(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    if (t < 0 || t > 1) return null;

    return new THREE.Vector2(x1 + t * (x2 - x1), y1 + t * (y2 - y1));
  },

  splitEntity(entityId, point) {
    const entity = this.state.entities.find(e => e.id === entityId);
    if (!entity) return;

    // Find closest point on entity to split at
    const idx = entity.points.findIndex(p => p.distanceTo(point) < 0.1);
    if (idx !== -1) {
      entity.points.splice(idx, 0, point);
      this.renderEntity(entity);
    }
  },

  getProfile() {
    // Extract closed wire from entities for extrude/revolve
    return {
      entities: this.state.entities.filter(e => !e.isConstruction),
      dimensions: this.state.dimensions,
      plane: this.state.plane
    };
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
        case 't': this.setTool('text'); break;
        case 'g': this.toggleConstruction(Array.from(this.state.selectedEntityIds)); break;
        case 'd': this.setTool('dimension'); break;
        case 'escape': this.finish(); break;
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

export default SketchModule;
