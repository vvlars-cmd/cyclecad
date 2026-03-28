/**
 * CycleCAD 2D Sketch Engine
 * Browser-based parametric 3D modeler sketch module
 * ES Module - converts 2D sketches to 3D wireframe geometry
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// State machine for sketch mode
let sketchState = {
  active: false,
  plane: null,         // 'XY', 'XZ', or 'YZ'
  camera: null,
  controls: null,
  canvas: null,
  ctx: null,
  raycaster: new THREE.Raycaster(),

  currentTool: 'line',
  isDrawing: false,
  entities: [],        // Final confirmed entities
  inProgressEntity: null, // Currently being drawn
  currentPoints: [],   // Points of current entity

  gridSize: 1,         // 1mm grid
  snapDistance: 8,     // pixels
  snapEnabled: true,
  snapPoint: null,     // {x, y} in world coords

  constraints: [],     // {type, entity1, entity2, value}
};

/**
 * Start sketch mode on specified plane
 * @param {string} plane - 'XY', 'XZ', or 'YZ'
 * @param {THREE.Camera} camera - Scene camera
 * @param {Object} controls - OrbitControls instance
 */
export function startSketch(plane, camera, controls) {
  if (sketchState.active) endSketch();

  sketchState.active = true;
  sketchState.plane = plane;
  sketchState.camera = camera;
  sketchState.controls = controls;
  sketchState.entities = [];
  sketchState.inProgressEntity = null;
  sketchState.currentPoints = [];

  // Disable orbit controls
  if (controls) controls.enabled = false;

  // Create canvas overlay
  const container = document.body;
  const canvas = document.createElement('canvas');
  canvas.id = 'sketch-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.cursor = 'crosshair';
  canvas.style.zIndex = '9999';
  canvas.style.backgroundColor = 'rgba(0,0,0,0)';

  container.appendChild(canvas);
  sketchState.canvas = canvas;
  sketchState.ctx = canvas.getContext('2d');

  // Position camera perpendicular to plane
  _positionCameraForPlane(plane, camera);

  // Setup event listeners
  canvas.addEventListener('mousemove', _onSketchMouseMove);
  canvas.addEventListener('click', _onSketchClick);
  canvas.addEventListener('contextmenu', _onSketchContextMenu);
  canvas.addEventListener('dblclick', _onSketchDoubleClick);
  canvas.addEventListener('keydown', _onSketchKeyDown);
  window.addEventListener('resize', _onSketchResize);

  // Initial render
  _renderSketchCanvas();
}

/**
 * End sketch mode and return entities
 * @returns {Array} Array of sketch entities
 */
export function endSketch() {
  if (!sketchState.active) return [];

  // Finalize any in-progress entity
  if (sketchState.inProgressEntity && sketchState.currentPoints.length > 0) {
    _finalizeEntity();
  }

  sketchState.active = false;

  // Restore controls
  if (sketchState.controls) {
    sketchState.controls.enabled = true;
  }

  // Remove canvas
  if (sketchState.canvas) {
    sketchState.canvas.removeEventListener('mousemove', _onSketchMouseMove);
    sketchState.canvas.removeEventListener('click', _onSketchClick);
    sketchState.canvas.removeEventListener('contextmenu', _onSketchContextMenu);
    sketchState.canvas.removeEventListener('dblclick', _onSketchDoubleClick);
    sketchState.canvas.removeEventListener('keydown', _onSketchKeyDown);
    sketchState.canvas.remove();
  }

  window.removeEventListener('resize', _onSketchResize);

  const result = [...sketchState.entities];
  clearSketch();
  return result;
}

/**
 * Set active drawing tool
 * @param {string} toolName - 'line', 'rectangle', 'circle', 'arc', 'polyline'
 */
export function setTool(toolName) {
  if (sketchState.active && sketchState.inProgressEntity) {
    _finalizeEntity();
  }
  sketchState.currentTool = toolName.toLowerCase();
  sketchState.currentPoints = [];
  _renderSketchCanvas();
}

/**
 * Get current sketch entities
 * @returns {Array} Array of entities with type, points, dimensions
 */
export function getEntities() {
  return JSON.parse(JSON.stringify(sketchState.entities));
}

/**
 * Clear sketch (reset to initial state)
 */
export function clearSketch() {
  sketchState.entities = [];
  sketchState.inProgressEntity = null;
  sketchState.currentPoints = [];
  sketchState.constraints = [];
  sketchState.snapPoint = null;
  _renderSketchCanvas();
}

/**
 * Toggle grid snapping
 * @param {boolean} enabled
 */
export function setSnapEnabled(enabled) {
  sketchState.snapEnabled = enabled;
}

/**
 * Set grid size in mm
 * @param {number} size
 */
export function setGridSize(size) {
  sketchState.gridSize = size;
}

/**
 * Convert client canvas coordinates to world coordinates on sketch plane
 * @param {number} clientX
 * @param {number} clientY
 * @param {THREE.Camera} camera
 * @param {string} plane
 * @returns {Object} {x, y, z} in world coordinates
 */
export function canvasToWorld(clientX, clientY, camera, plane) {
  const canvas = sketchState.canvas;
  if (!canvas) return { x: 0, y: 0, z: 0 };

  // Normalized device coordinates
  const ndcX = (clientX / canvas.width) * 2 - 1;
  const ndcY = -(clientY / canvas.height) * 2 + 1;

  // Ray from camera through pixel
  const raycaster = sketchState.raycaster;
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);

  // Create plane perpendicular to sketch axis
  const planeNormal = _getPlaneNormal(plane);
  const planeObj = new THREE.Plane(planeNormal, 0);
  const intersection = new THREE.Vector3();

  raycaster.ray.intersectPlane(planeObj, intersection);

  return { x: intersection.x, y: intersection.y, z: intersection.z };
}

/**
 * Convert world coordinates to canvas (screen) coordinates
 * @param {number} wx - World X
 * @param {number} wy - World Y
 * @param {THREE.Camera} camera
 * @param {number} canvasW - Canvas width
 * @param {number} canvasH - Canvas height
 * @returns {Object} {x, y} in screen pixels
 */
export function worldToCanvas(wx, wy, camera, canvasW, canvasH) {
  const v = new THREE.Vector3(wx, wy, 0);
  v.project(camera);

  const screenX = (v.x + 1) * canvasW / 2;
  const screenY = (-v.y + 1) * canvasH / 2;

  return { x: screenX, y: screenY };
}

/**
 * Undo last entity
 */
export function undo() {
  if (sketchState.entities.length > 0) {
    sketchState.entities.pop();
    _renderSketchCanvas();
  }
}

/**
 * Convert sketch entities to Three.js 3D geometry
 * @param {Array} entities - Sketch entities from getEntities()
 * @returns {THREE.Group} 3D wireframe group
 */
export function entitiesToGeometry(entities) {
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: 0x58a6ff, linewidth: 2 });

  entities.forEach(entity => {
    let geometry;

    switch (entity.type) {
      case 'line':
        geometry = new THREE.BufferGeometry();
        geometry.setFromPoints([
          new THREE.Vector3(entity.points[0].x, entity.points[0].y, 0),
          new THREE.Vector3(entity.points[1].x, entity.points[1].y, 0)
        ]);
        group.add(new THREE.Line(geometry, material));
        break;

      case 'rectangle':
        geometry = new THREE.BufferGeometry();
        const pts = entity.points;
        const corners = [
          pts[0],
          new THREE.Vector2(pts[1].x, pts[0].y),
          pts[1],
          new THREE.Vector2(pts[0].x, pts[1].y),
          pts[0]
        ];
        geometry.setFromPoints(
          corners.map(p => new THREE.Vector3(p.x, p.y, 0))
        );
        group.add(new THREE.Line(geometry, material));
        break;

      case 'circle':
        geometry = new THREE.BufferGeometry();
        const radius = entity.dimensions.radius;
        const points = [];
        for (let i = 0; i <= 32; i++) {
          const angle = (i / 32) * Math.PI * 2;
          points.push(new THREE.Vector3(
            entity.points[0].x + radius * Math.cos(angle),
            entity.points[0].y + radius * Math.sin(angle),
            0
          ));
        }
        geometry.setFromPoints(points);
        group.add(new THREE.Line(geometry, material));
        break;

      case 'arc':
        geometry = new THREE.BufferGeometry();
        const arcRadius = Math.hypot(
          entity.points[1].x - entity.points[0].x,
          entity.points[1].y - entity.points[0].y
        );
        const startAngle = Math.atan2(
          entity.points[1].y - entity.points[0].y,
          entity.points[1].x - entity.points[0].x
        );
        const endAngle = Math.atan2(
          entity.points[2].y - entity.points[0].y,
          entity.points[2].x - entity.points[0].x
        );
        const arcPoints = [];
        const steps = 32;
        for (let i = 0; i <= steps; i++) {
          const angle = startAngle + (endAngle - startAngle) * (i / steps);
          arcPoints.push(new THREE.Vector3(
            entity.points[0].x + arcRadius * Math.cos(angle),
            entity.points[0].y + arcRadius * Math.sin(angle),
            0
          ));
        }
        geometry.setFromPoints(arcPoints);
        group.add(new THREE.Line(geometry, material));
        break;

      case 'polyline':
        geometry = new THREE.BufferGeometry();
        geometry.setFromPoints(
          entity.points.map(p => new THREE.Vector3(p.x, p.y, 0))
        );
        group.add(new THREE.Line(geometry, material));
        break;
    }
  });

  return group;
}

// ============================================================================
// PRIVATE FUNCTIONS
// ============================================================================

/**
 * Position camera perpendicular to sketch plane
 */
function _positionCameraForPlane(plane, camera) {
  const distance = 50;

  switch (plane) {
    case 'XY':
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
      break;
    case 'XZ':
      camera.position.set(0, distance, 0);
      camera.lookAt(0, 0, 0);
      break;
    case 'YZ':
      camera.position.set(distance, 0, 0);
      camera.lookAt(0, 0, 0);
      break;
  }
  camera.updateProjectionMatrix();
}

/**
 * Get plane normal vector
 */
function _getPlaneNormal(plane) {
  switch (plane) {
    case 'XY': return new THREE.Vector3(0, 0, 1);
    case 'XZ': return new THREE.Vector3(0, 1, 0);
    case 'YZ': return new THREE.Vector3(1, 0, 0);
    default: return new THREE.Vector3(0, 0, 1);
  }
}

/**
 * Convert world point to 2D sketch coordinates (based on active plane)
 */
function _worldToSketch(worldPoint, plane) {
  switch (plane) {
    case 'XY': return { x: worldPoint.x, y: worldPoint.y };
    case 'XZ': return { x: worldPoint.x, y: worldPoint.z };
    case 'YZ': return { x: worldPoint.y, y: worldPoint.z };
    default: return { x: 0, y: 0 };
  }
}

/**
 * Convert 2D sketch coordinates to world point
 */
function _sketchToWorld(sketchPoint, plane) {
  switch (plane) {
    case 'XY': return { x: sketchPoint.x, y: sketchPoint.y, z: 0 };
    case 'XZ': return { x: sketchPoint.x, y: 0, z: sketchPoint.y };
    case 'YZ': return { x: 0, y: sketchPoint.x, z: sketchPoint.y };
    default: return { x: 0, y: 0, z: 0 };
  }
}

/**
 * Find snap point on grid
 */
function _findSnapPoint(clientX, clientY) {
  const worldPoint = canvasToWorld(clientX, clientY, sketchState.camera, sketchState.plane);
  const sketchPoint = _worldToSketch(worldPoint, sketchState.plane);

  // Snap to grid
  const gridSize = sketchState.gridSize;
  const snappedX = Math.round(sketchPoint.x / gridSize) * gridSize;
  const snappedY = Math.round(sketchPoint.y / gridSize) * gridSize;

  // Convert back to screen coords to check distance
  const canvas = sketchState.canvas;
  const screenSnapped = worldToCanvas(
    _sketchToWorld({ x: snappedX, y: snappedY }, sketchState.plane).x,
    _sketchToWorld({ x: snappedX, y: snappedY }, sketchState.plane).y,
    sketchState.camera,
    canvas.width,
    canvas.height
  );

  const dist = Math.hypot(screenSnapped.x - clientX, screenSnapped.y - clientY);

  if (dist < sketchState.snapDistance && sketchState.snapEnabled) {
    return { x: snappedX, y: snappedY, screen: screenSnapped };
  }

  return { x: sketchPoint.x, y: sketchPoint.y, screen: worldToCanvas(
    worldPoint.x, worldPoint.y, sketchState.camera, canvas.width, canvas.height
  )};
}

/**
 * Check for constraints (horizontal, vertical, equal length, perpendicular)
 */
function _detectConstraints(entity) {
  const constraints = [];

  if (entity.type === 'line') {
    const dx = Math.abs(entity.points[1].x - entity.points[0].x);
    const dy = Math.abs(entity.points[1].y - entity.points[0].y);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    // Horizontal
    if (angle < 5 || angle > 85) {
      constraints.push({ type: 'horizontal' });
      entity.points[1].y = entity.points[0].y; // Lock Y
    }
    // Vertical
    if (Math.abs(angle - 90) < 5) {
      constraints.push({ type: 'vertical' });
      entity.points[1].x = entity.points[0].x; // Lock X
    }
  }

  return constraints;
}

/**
 * Finalize current drawing entity
 */
function _finalizeEntity() {
  if (!sketchState.inProgressEntity || sketchState.currentPoints.length < 2) {
    sketchState.inProgressEntity = null;
    sketchState.currentPoints = [];
    return;
  }

  const entity = {
    type: sketchState.currentTool,
    points: [...sketchState.currentPoints],
    dimensions: {},
    constraints: []
  };

  // Calculate dimensions
  if (entity.type === 'line') {
    const dx = entity.points[1].x - entity.points[0].x;
    const dy = entity.points[1].y - entity.points[0].y;
    entity.dimensions.length = Math.hypot(dx, dy);
    entity.constraints = _detectConstraints(entity);
  } else if (entity.type === 'rectangle') {
    const width = Math.abs(entity.points[1].x - entity.points[0].x);
    const height = Math.abs(entity.points[1].y - entity.points[0].y);
    entity.dimensions.width = width;
    entity.dimensions.height = height;
  } else if (entity.type === 'circle') {
    const radius = Math.hypot(
      entity.points[1].x - entity.points[0].x,
      entity.points[1].y - entity.points[0].y
    );
    entity.dimensions.radius = radius;
    entity.dimensions.diameter = radius * 2;
  } else if (entity.type === 'arc') {
    if (entity.points.length >= 2) {
      const radius = Math.hypot(
        entity.points[1].x - entity.points[0].x,
        entity.points[1].y - entity.points[0].y
      );
      entity.dimensions.radius = radius;
    }
  } else if (entity.type === 'polyline') {
    let totalLength = 0;
    for (let i = 0; i < entity.points.length - 1; i++) {
      const dx = entity.points[i + 1].x - entity.points[i].x;
      const dy = entity.points[i + 1].y - entity.points[i].y;
      totalLength += Math.hypot(dx, dy);
    }
    entity.dimensions.length = totalLength;
  }

  sketchState.entities.push(entity);
  sketchState.inProgressEntity = null;
  sketchState.currentPoints = [];
}

/**
 * Mouse move handler
 */
function _onSketchMouseMove(e) {
  const snap = _findSnapPoint(e.clientX, e.clientY);
  sketchState.snapPoint = snap.screen;

  const sketchPoint = { x: snap.x, y: snap.y };

  // Update in-progress entity for rubber band preview
  if (sketchState.isDrawing && sketchState.currentPoints.length > 0) {
    if (sketchState.currentTool === 'line' || sketchState.currentTool === 'polyline') {
      sketchState.inProgressEntity = {
        type: sketchState.currentTool,
        points: [...sketchState.currentPoints, sketchPoint],
        dimensions: {}
      };
    } else if (sketchState.currentTool === 'rectangle' && sketchState.currentPoints.length === 1) {
      sketchState.inProgressEntity = {
        type: 'rectangle',
        points: [sketchState.currentPoints[0], sketchPoint],
        dimensions: {}
      };
    } else if (sketchState.currentTool === 'circle' && sketchState.currentPoints.length === 1) {
      const radius = Math.hypot(
        sketchPoint.x - sketchState.currentPoints[0].x,
        sketchPoint.y - sketchState.currentPoints[0].y
      );
      sketchState.inProgressEntity = {
        type: 'circle',
        points: [sketchState.currentPoints[0], sketchPoint],
        dimensions: { radius }
      };
    } else if (sketchState.currentTool === 'arc' && sketchState.currentPoints.length >= 1) {
      sketchState.inProgressEntity = {
        type: 'arc',
        points: [...sketchState.currentPoints, sketchPoint],
        dimensions: {}
      };
    }
  }

  _renderSketchCanvas();
}

/**
 * Click handler
 */
function _onSketchClick(e) {
  if (e.button === 2) return; // Right-click handled separately

  const snap = _findSnapPoint(e.clientX, e.clientY);
  const sketchPoint = { x: snap.x, y: snap.y };

  sketchState.isDrawing = true;

  const tool = sketchState.currentTool;

  if (tool === 'line') {
    if (sketchState.currentPoints.length === 0) {
      sketchState.currentPoints = [sketchPoint];
    } else if (sketchState.currentPoints.length === 1) {
      sketchState.currentPoints.push(sketchPoint);
      _finalizeEntity();
      // Chain mode: end becomes new start
      sketchState.currentPoints = [sketchPoint];
    }
  } else if (tool === 'rectangle') {
    if (sketchState.currentPoints.length === 0) {
      sketchState.currentPoints = [sketchPoint];
    } else if (sketchState.currentPoints.length === 1) {
      sketchState.currentPoints.push(sketchPoint);
      _finalizeEntity();
    }
  } else if (tool === 'circle') {
    if (sketchState.currentPoints.length === 0) {
      sketchState.currentPoints = [sketchPoint];
    } else if (sketchState.currentPoints.length === 1) {
      sketchState.currentPoints.push(sketchPoint);
      _finalizeEntity();
    }
  } else if (tool === 'arc') {
    if (sketchState.currentPoints.length < 3) {
      sketchState.currentPoints.push(sketchPoint);
      if (sketchState.currentPoints.length === 3) {
        _finalizeEntity();
      }
    }
  } else if (tool === 'polyline') {
    sketchState.currentPoints.push(sketchPoint);
  }

  _renderSketchCanvas();
}

/**
 * Right-click context menu handler
 */
function _onSketchContextMenu(e) {
  e.preventDefault();

  if (sketchState.currentTool === 'line' && sketchState.currentPoints.length > 0) {
    // Stop line chain mode
    if (sketchState.currentPoints.length >= 2) {
      _finalizeEntity();
    }
    sketchState.currentPoints = [];
    sketchState.isDrawing = false;
  } else if (sketchState.currentTool === 'polyline' && sketchState.currentPoints.length >= 2) {
    // Close polyline
    _finalizeEntity();
    sketchState.isDrawing = false;
  }

  _renderSketchCanvas();
}

/**
 * Double-click handler
 */
function _onSketchDoubleClick(e) {
  if (sketchState.currentTool === 'polyline' && sketchState.currentPoints.length >= 2) {
    _finalizeEntity();
    sketchState.isDrawing = false;
    _renderSketchCanvas();
  }
}

/**
 * Keyboard handler
 */
function _onSketchKeyDown(e) {
  if (e.key === 'Enter' && sketchState.currentTool === 'polyline') {
    if (sketchState.currentPoints.length >= 2) {
      _finalizeEntity();
      sketchState.isDrawing = false;
    }
    _renderSketchCanvas();
  } else if (e.key === 'Escape') {
    endSketch();
  } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    undo();
  }
}

/**
 * Resize handler
 */
function _onSketchResize() {
  if (sketchState.canvas) {
    sketchState.canvas.width = window.innerWidth;
    sketchState.canvas.height = window.innerHeight;
    _renderSketchCanvas();
  }
}

/**
 * Render sketch canvas with grid, entities, and preview
 */
function _renderSketchCanvas() {
  const canvas = sketchState.canvas;
  const ctx = sketchState.ctx;
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  _drawGrid(ctx, canvas.width, canvas.height);

  // Draw confirmed entities (blue)
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(88, 166, 255, 0.1)';

  sketchState.entities.forEach(entity => {
    _drawEntity(ctx, entity, false);
  });

  // Draw in-progress entity (dashed blue)
  if (sketchState.inProgressEntity) {
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#58a6ff';
    _drawEntity(ctx, sketchState.inProgressEntity, true);
    ctx.setLineDash([]);
  }

  // Draw snap point (green dot)
  if (sketchState.snapPoint) {
    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.arc(sketchState.snapPoint.x, sketchState.snapPoint.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw crosshair
  if (sketchState.snapPoint) {
    ctx.strokeStyle = 'rgba(88, 166, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sketchState.snapPoint.x, 0);
    ctx.lineTo(sketchState.snapPoint.x, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, sketchState.snapPoint.y);
    ctx.lineTo(canvas.width, sketchState.snapPoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw dimension labels
  ctx.fillStyle = '#58a6ff';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';

  sketchState.entities.forEach(entity => {
    _drawDimensionLabel(ctx, entity);
  });

  if (sketchState.inProgressEntity) {
    _drawDimensionLabel(ctx, sketchState.inProgressEntity);
  }
}

/**
 * Draw grid on canvas
 */
function _drawGrid(ctx, width, height) {
  const gridSize = sketchState.gridSize;
  const screenGridSize = 20; // pixels per grid cell for display

  ctx.strokeStyle = 'rgba(88, 166, 255, 0.1)';
  ctx.lineWidth = 0.5;

  // Vertical lines
  for (let x = 0; x < width; x += screenGridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y < height; y += screenGridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

/**
 * Draw single entity on canvas
 */
function _drawEntity(ctx, entity, isPreview) {
  const canvas = sketchState.canvas;
  const points = entity.points.map(p => {
    const world = _sketchToWorld(p, sketchState.plane);
    return worldToCanvas(world.x, world.y, sketchState.camera, canvas.width, canvas.height);
  });

  switch (entity.type) {
    case 'line':
      if (points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.stroke();
      }
      break;

    case 'rectangle':
      if (points.length >= 2) {
        const x = Math.min(points[0].x, points[1].x);
        const y = Math.min(points[0].y, points[1].y);
        const w = Math.abs(points[1].x - points[0].x);
        const h = Math.abs(points[1].y - points[0].y);
        ctx.strokeRect(x, y, w, h);
        if (!isPreview) ctx.fillRect(x, y, w, h);
      }
      break;

    case 'circle':
      if (points.length >= 2) {
        const radius = Math.hypot(
          points[1].x - points[0].x,
          points[1].y - points[0].y
        );
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, radius, 0, Math.PI * 2);
        ctx.stroke();
        if (!isPreview) ctx.fill();
      }
      break;

    case 'arc':
      if (points.length >= 2) {
        const radius = Math.hypot(
          points[1].x - points[0].x,
          points[1].y - points[0].y
        );
        let startAngle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
        let endAngle = startAngle;
        if (points.length >= 3) {
          endAngle = Math.atan2(points[2].y - points[0].y, points[2].x - points[0].x);
        }
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, radius, startAngle, endAngle);
        ctx.stroke();
      }
      break;

    case 'polyline':
      if (points.length >= 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
      break;
  }
}

/**
 * Draw dimension label for entity
 */
function _drawDimensionLabel(ctx, entity) {
  const canvas = sketchState.canvas;
  const points = entity.points.map(p => {
    const world = _sketchToWorld(p, sketchState.plane);
    return worldToCanvas(world.x, world.y, sketchState.camera, canvas.width, canvas.height);
  });

  if (!entity.dimensions) return;

  let label = '';
  let x = 0, y = 0;

  switch (entity.type) {
    case 'line':
      if (entity.dimensions.length) {
        label = `${entity.dimensions.length.toFixed(2)} mm`;
        if (points.length >= 2) {
          x = (points[0].x + points[1].x) / 2;
          y = (points[0].y + points[1].y) / 2 - 15;
        }
      }
      break;

    case 'rectangle':
      if (entity.dimensions.width && entity.dimensions.height) {
        label = `${entity.dimensions.width.toFixed(1)} × ${entity.dimensions.height.toFixed(1)} mm`;
        if (points.length >= 2) {
          x = (points[0].x + points[1].x) / 2;
          y = (points[0].y + points[1].y) / 2;
        }
      }
      break;

    case 'circle':
      if (entity.dimensions.diameter) {
        label = `⌀${entity.dimensions.diameter.toFixed(2)} mm`;
        if (points.length >= 1) {
          x = points[0].x + 20;
          y = points[0].y - 5;
        }
      }
      break;

    case 'arc':
      if (entity.dimensions.radius) {
        label = `R${entity.dimensions.radius.toFixed(2)} mm`;
        if (points.length >= 1) {
          x = points[0].x + 20;
          y = points[0].y - 5;
        }
      }
      break;

    case 'polyline':
      if (entity.dimensions.length) {
        label = `${entity.dimensions.length.toFixed(2)} mm`;
        if (points.length >= 2) {
          x = (points[0].x + points[points.length - 1].x) / 2;
          y = (points[0].y + points[points.length - 1].y) / 2 - 15;
        }
      }
      break;
  }

  if (label && x > 0 && y > 0) {
    ctx.fillText(label, x, y);
  }
}
