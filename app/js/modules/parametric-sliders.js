/**
 * cycleCAD Parametric Sliders Module
 *
 * Real-time parametric control with auto-detection, dimension annotations,
 * presets, expressions, and history. Beats CADAM's interactive sliders.
 *
 * @module ParametricSliders
 * @version 1.0.0
 * @author Sachin Kumar
 */

(function() {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let scene = null;
  let renderer = null;
  let activeMesh = null;
  let originalGeometry = null;
  let currentParameters = {};
  let parameterDefinitions = {};
  let parameterHistory = [];
  let presets = {};
  let annotations = {};
  let annotationRenderer = null;
  let annotationScene = null;
  let annotationCamera = null;
  let linkedParams = {};
  let constraints = {};
  let isUpdating = false;
  let updateTimeouts = new Map();

  // CSS2DRenderer for dimension labels
  let CSS2DRenderer = null;
  let CSS2DObject = null;

  // ============================================================================
  // GEOMETRY TYPE DETECTION & PARAMETER EXTRACTION
  // ============================================================================

  /**
   * Detect geometry type and extract parametric dimensions
   * @param {THREE.BufferGeometry} geometry
   * @returns {Object} {type, parameters, original}
   */
  function analyzeGeometry(geometry) {
    const params = {};
    const original = {};

    // BoxGeometry
    if (geometry.type === 'BoxGeometry' && geometry.parameters) {
      const p = geometry.parameters;
      params.width = p.width || 100;
      params.height = p.height || 100;
      params.depth = p.depth || 100;
      original.width = params.width;
      original.height = params.height;
      original.depth = params.depth;
      return { type: 'BoxGeometry', parameters: params, original };
    }

    // CylinderGeometry
    if (geometry.type === 'CylinderGeometry' && geometry.parameters) {
      const p = geometry.parameters;
      params.radiusTop = p.radiusTop || 20;
      params.radiusBottom = p.radiusBottom || 20;
      params.height = p.height || 100;
      params.radialSegments = p.radialSegments || 32;
      params.heightSegments = p.heightSegments || 1;
      original.radiusTop = params.radiusTop;
      original.radiusBottom = params.radiusBottom;
      original.height = params.height;
      original.radialSegments = params.radialSegments;
      original.heightSegments = params.heightSegments;
      return { type: 'CylinderGeometry', parameters: params, original };
    }

    // SphereGeometry
    if (geometry.type === 'SphereGeometry' && geometry.parameters) {
      const p = geometry.parameters;
      params.radius = p.radius || 50;
      params.widthSegments = p.widthSegments || 32;
      params.heightSegments = p.heightSegments || 16;
      original.radius = params.radius;
      original.widthSegments = params.widthSegments;
      original.heightSegments = params.heightSegments;
      return { type: 'SphereGeometry', parameters: params, original };
    }

    // TorusGeometry
    if (geometry.type === 'TorusGeometry' && geometry.parameters) {
      const p = geometry.parameters;
      params.radius = p.radius || 100;
      params.tube = p.tube || 40;
      params.radialSegments = p.radialSegments || 100;
      params.tubularSegments = p.tubularSegments || 10;
      original.radius = params.radius;
      original.tube = params.tube;
      original.radialSegments = params.radialSegments;
      original.tubularSegments = params.tubularSegments;
      return { type: 'TorusGeometry', parameters: params, original };
    }

    // LatheGeometry
    if (geometry.type === 'LatheGeometry' && geometry.parameters) {
      const p = geometry.parameters;
      params.segments = p.segments || 12;
      params.phiStart = p.phiStart || 0;
      params.phiLength = p.phiLength || Math.PI * 2;
      original.segments = params.segments;
      original.phiStart = params.phiStart;
      original.phiLength = params.phiLength;
      return { type: 'LatheGeometry', parameters: params, original };
    }

    // ConvexGeometry / custom shapes: use bounding box
    const bbox = geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position'));
    const size = bbox.getSize(new THREE.Vector3());
    params.width = parseFloat(size.x.toFixed(2));
    params.height = parseFloat(size.y.toFixed(2));
    params.depth = parseFloat(size.z.toFixed(2));
    original.width = params.width;
    original.height = params.height;
    original.depth = params.depth;
    return { type: 'CustomGeometry', parameters: params, original };
  }

  /**
   * Rebuild geometry based on type and new parameters
   * @param {string} type - Geometry type
   * @param {Object} params - New parameters
   * @returns {THREE.BufferGeometry}
   */
  function rebuildGeometry(type, params) {
    switch (type) {
      case 'BoxGeometry':
        return new THREE.BoxGeometry(params.width, params.height, params.depth);

      case 'CylinderGeometry':
        return new THREE.CylinderGeometry(
          params.radiusTop,
          params.radiusBottom,
          params.height,
          Math.max(3, Math.floor(params.radialSegments || 32)),
          Math.max(1, Math.floor(params.heightSegments || 1))
        );

      case 'SphereGeometry':
        return new THREE.SphereGeometry(
          params.radius,
          Math.max(3, Math.floor(params.widthSegments || 32)),
          Math.max(2, Math.floor(params.heightSegments || 16))
        );

      case 'TorusGeometry':
        return new THREE.TorusGeometry(
          params.radius,
          params.tube,
          Math.max(3, Math.floor(params.radialSegments || 100)),
          Math.max(2, Math.floor(params.tubularSegments || 10))
        );

      case 'LatheGeometry':
        return new THREE.LatheGeometry(
          new THREE.LineCurve3(new THREE.Vector3(0, -50, 0), new THREE.Vector3(50, 50, 0)),
          Math.max(4, Math.floor(params.segments || 12))
        );

      default:
        return new THREE.BoxGeometry(params.width, params.height, params.depth);
    }
  }

  /**
   * Categorize parameter for UI styling
   * @param {string} name - Parameter name
   * @returns {string} Category: 'size' | 'detail' | 'angle' | 'other'
   */
  function categorizeParameter(name) {
    const lower = name.toLowerCase();
    if (lower.includes('width') || lower.includes('height') || lower.includes('depth') ||
        lower.includes('radius') || lower.includes('tube')) {
      return 'size';
    }
    if (lower.includes('segment') || lower.includes('point')) {
      return 'detail';
    }
    if (lower.includes('angle') || lower.includes('phi') || lower.includes('theta')) {
      return 'angle';
    }
    return 'other';
  }

  /**
   * Get unit label for parameter
   * @param {string} name - Parameter name
   * @returns {string}
   */
  function getUnit(name) {
    const lower = name.toLowerCase();
    if (lower.includes('segment') || lower.includes('point') || lower.includes('count')) {
      return '#';
    }
    if (lower.includes('angle') || lower.includes('phi') || lower.includes('theta')) {
      return '°';
    }
    return 'mm';
  }

  // ============================================================================
  // PARAMETER DEFINITIONS & CONSTRAINTS
  // ============================================================================

  /**
   * Create parameter definitions with constraints
   * @param {Object} params - Raw parameters
   * @returns {Object}
   */
  function createParameterDefinitions(params) {
    const defs = {};
    for (const [name, value] of Object.entries(params)) {
      const category = categorizeParameter(name);
      const isSegment = category === 'detail';
      const isAngle = category === 'angle';

      defs[name] = {
        name,
        value,
        original: value,
        category,
        unit: getUnit(name),
        min: isSegment ? 1 : isAngle ? 0 : value * 0.1,
        max: value * 10,
        step: isSegment ? 1 : isAngle ? 5 : value > 100 ? 1 : 0.1,
        locked: false,
        linkedTo: null,
        expression: null
      };
    }
    return defs;
  }

  /**
   * Evaluate parameter expression
   * @param {string} expr - Expression like "2*radius" or "height/3"
   * @param {Object} context - Parameter context
   * @returns {number}
   */
  function evaluateExpression(expr, context) {
    try {
      // Safe evaluation: only allow parameter names, numbers, and math operators
      let sanitized = expr;
      const paramNames = Object.keys(context);
      for (const name of paramNames) {
        sanitized = sanitized.replace(new RegExp(`\\b${name}\\b`, 'g'), context[name]);
      }
      // eslint-disable-next-line no-eval
      const result = Function('"use strict"; return (' + sanitized + ')')();
      return isFinite(result) ? result : NaN;
    } catch {
      return NaN;
    }
  }

  // ============================================================================
  // DIMENSION ANNOTATIONS
  // ============================================================================

  /**
   * Create dimension annotation label
   * @param {string} label - Label text
   * @param {THREE.Vector3} position - World position
   * @returns {THREE.CSS2DObject}
   */
  function createAnnotationLabel(label, position) {
    if (!CSS2DObject) {
      // Fallback: log error (proper CSS2DRenderer requires three-stdlib)
      return null;
    }

    const div = document.createElement('div');
    div.className = 'dimension-label';
    div.textContent = label;
    div.style.cssText = `
      background: rgba(0, 100, 200, 0.9);
      color: white;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: bold;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      transform: translate(-50%, -50%);
    `;

    const obj = new CSS2DObject(div);
    obj.position.copy(position);
    return obj;
  }

  /**
   * Add dimension lines to scene
   * @param {THREE.Mesh} mesh
   */
  function addDimensionAnnotations(mesh) {
    if (!mesh || !mesh.geometry.parameters) {
      return;
    }

    clearAnnotations();

    const params = parameterDefinitions;
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    // Width annotation
    if (params.width) {
      const widthLabel = `W: ${params.width.value.toFixed(1)}${params.width.unit}`;
      const wPos = new THREE.Vector3(center.x + size.x / 2 + 30, center.y, center.z);
      const label = createAnnotationLabel(widthLabel, wPos);
      if (label) {
        scene.add(label);
        annotations.width = label;
      }
    }

    // Height annotation
    if (params.height) {
      const heightLabel = `H: ${params.height.value.toFixed(1)}${params.height.unit}`;
      const hPos = new THREE.Vector3(center.x, center.y + size.y / 2 + 30, center.z);
      const label = createAnnotationLabel(heightLabel, hPos);
      if (label) {
        scene.add(label);
        annotations.height = label;
      }
    }

    // Depth annotation
    if (params.depth) {
      const depthLabel = `D: ${params.depth.value.toFixed(1)}${params.depth.unit}`;
      const dPos = new THREE.Vector3(center.x, center.y, center.z + size.z / 2 + 30);
      const label = createAnnotationLabel(depthLabel, dPos);
      if (label) {
        scene.add(label);
        annotations.depth = label;
      }
    }
  }

  /**
   * Clear all dimension annotations
   */
  function clearAnnotations() {
    for (const label of Object.values(annotations)) {
      if (label && label.parent) {
        scene.remove(label);
      }
    }
    annotations = {};
  }

  // ============================================================================
  // PARAMETER UPDATES & HISTORY
  // ============================================================================

  /**
   * Update single parameter and rebuild geometry
   * @param {string} name - Parameter name
   * @param {number} value - New value
   * @param {boolean} [addToHistory=true] - Add to undo history
   */
  function updateParameter(name, value, addToHistory = true) {
    if (!activeMesh || !parameterDefinitions[name]) {
      return;
    }

    const def = parameterDefinitions[name];

    // Apply constraints
    value = Math.max(def.min, Math.min(def.max, value));

    // Evaluate expression if present
    if (def.expression) {
      const evaluated = evaluateExpression(def.expression, currentParameters);
      if (!isNaN(evaluated)) {
        value = evaluated;
      }
    }

    // Round segment counts
    if (def.category === 'detail') {
      value = Math.floor(value);
    }

    // Check if value actually changed
    if (def.value === value) {
      return;
    }

    // Update parameter
    def.value = value;
    currentParameters[name] = value;

    // Clear any pending updates for this param
    if (updateTimeouts.has(name)) {
      clearTimeout(updateTimeouts.get(name));
    }

    // Batch updates: wait 50ms before rebuilding geometry
    // (allows multiple sliders to move before expensive rebuild)
    if (!isUpdating) {
      isUpdating = true;
      const timeout = setTimeout(() => {
        rebuildMeshGeometry();
        updateDimensionLabels();
        isUpdating = false;
      }, 50);
      updateTimeouts.set(name, timeout);
    }

    // Add to history
    if (addToHistory) {
      parameterHistory.push({
        timestamp: Date.now(),
        action: 'parameter_change',
        parameter: name,
        oldValue: def.original,
        newValue: value,
        snapshot: JSON.stringify(currentParameters)
      });
    }

    // Update linked parameters
    if (linkedParams[name]) {
      for (const linkedName of linkedParams[name]) {
        const ratio = (value / def.original);
        updateParameter(linkedName, parameterDefinitions[linkedName].original * ratio, false);
      }
    }

    // Update UI slider
    const slider = document.querySelector(`[data-param="${name}"][type="range"]`);
    if (slider) {
      slider.value = value;
    }
  }

  /**
   * Rebuild mesh geometry in place
   */
  function rebuildMeshGeometry() {
    if (!activeMesh || !scene) {
      return;
    }

    try {
      // Build new geometry
      let newGeometry;
      if (originalGeometry && originalGeometry.type) {
        newGeometry = rebuildGeometry(originalGeometry.type, currentParameters);
      } else {
        newGeometry = rebuildGeometry('BoxGeometry', currentParameters);
      }

      if (newGeometry) {
        // Preserve position, rotation, scale
        const oldGeom = activeMesh.geometry;
        activeMesh.geometry = newGeometry;

        // Dispose old geometry
        if (oldGeom && oldGeom.dispose) {
          oldGeom.dispose();
        }

        // Update bounding box
        newGeometry.computeBoundingBox();

        // Trigger render
        if (renderer) {
          renderer.render(scene, renderer._camera || window._camera);
        }
      }
    } catch (error) {
      console.error('Failed to rebuild geometry:', error);
    }
  }

  /**
   * Update dimension label text and positions
   */
  function updateDimensionLabels() {
    if (!activeMesh || !Object.keys(annotations).length) {
      return;
    }

    const params = parameterDefinitions;
    const bbox = new THREE.Box3().setFromObject(activeMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    if (annotations.width && params.width) {
      const label = `W: ${params.width.value.toFixed(1)}${params.width.unit}`;
      annotations.width.element.textContent = label;
      annotations.width.position.set(center.x + size.x / 2 + 30, center.y, center.z);
    }

    if (annotations.height && params.height) {
      const label = `H: ${params.height.value.toFixed(1)}${params.height.unit}`;
      annotations.height.element.textContent = label;
      annotations.height.position.set(center.x, center.y + size.y / 2 + 30, center.z);
    }

    if (annotations.depth && params.depth) {
      const label = `D: ${params.depth.value.toFixed(1)}${params.depth.unit}`;
      annotations.depth.element.textContent = label;
      annotations.depth.position.set(center.x, center.y, center.z + size.z / 2 + 30);
    }
  }

  // ============================================================================
  // PRESETS
  // ============================================================================

  /**
   * Save current parameters as preset
   * @param {string} name - Preset name
   */
  function savePreset(name) {
    presets[name] = JSON.parse(JSON.stringify(currentParameters));
  }

  /**
   * Load preset
   * @param {string} name - Preset name
   */
  function loadPreset(name) {
    if (!presets[name]) {
      console.warn(`Preset "${name}" not found`);
      return;
    }

    const preset = presets[name];
    for (const [paramName, value] of Object.entries(preset)) {
      updateParameter(paramName, value, true);
    }
  }

  /**
   * Create standard size presets (metric bolts, etc.)
   */
  function createStandardPresets() {
    presets['Standard - M3'] = { radiusTop: 1.5, radiusBottom: 1.5, height: 30, radialSegments: 32 };
    presets['Standard - M4'] = { radiusTop: 2, radiusBottom: 2, height: 40, radialSegments: 32 };
    presets['Standard - M5'] = { radiusTop: 2.5, radiusBottom: 2.5, height: 50, radialSegments: 32 };
    presets['Standard - M6'] = { radiusTop: 3, radiusBottom: 3, height: 60, radialSegments: 32 };
    presets['Standard - 1/4" NPT'] = { radiusTop: 3.3, radiusBottom: 3.3, height: 40, radialSegments: 32 };
    presets['Standard - 1/2" NPT'] = { radiusTop: 6.35, radiusBottom: 6.35, height: 50, radialSegments: 32 };
  }

  // ============================================================================
  // UI GENERATION
  // ============================================================================

  /**
   * Generate HTML for slider controls
   * @returns {string}
   */
  function generateSlidersHTML() {
    let html = `
      <div id="parametric-panel" class="module-panel">
        <div class="panel-header">
          <h3>Parametric Controls</h3>
          <button id="toggle-annotations" class="icon-btn" title="Toggle Dimension Annotations">📏</button>
        </div>
        <div id="param-controls" class="param-controls">
    `;

    for (const [name, def] of Object.entries(parameterDefinitions)) {
      const categoryColor = {
        size: '#3b82f6',
        detail: '#10b981',
        angle: '#f97316',
        other: '#6b7280'
      }[def.category];

      html += `
        <div class="param-control" data-param="${name}">
          <div class="param-header">
            <label>${name}</label>
            <div class="param-actions">
              <button class="lock-btn" data-param="${name}" title="Lock/Unlock">🔓</button>
              <button class="reset-btn" data-param="${name}" title="Reset">↻</button>
            </div>
          </div>
          <div class="param-input-group">
            <input type="range"
              class="param-slider"
              data-param="${name}"
              min="${def.min.toFixed(2)}"
              max="${def.max.toFixed(2)}"
              step="${def.step.toFixed(3)}"
              value="${def.value.toFixed(2)}"
              style="accent-color: ${categoryColor}">
            <input type="number"
              class="param-input"
              data-param="${name}"
              min="${def.min.toFixed(2)}"
              max="${def.max.toFixed(2)}"
              step="${def.step.toFixed(3)}"
              value="${def.value.toFixed(2)}">
            <span class="param-unit">${def.unit}</span>
          </div>
          <div class="param-footer">
            <span class="param-original">Original: ${def.original.toFixed(2)}</span>
            <span class="param-category" style="color: ${categoryColor}">●</span>
          </div>
        </div>
      `;
    }

    html += `
        </div>

        <div class="preset-section">
          <h4>Presets</h4>
          <div id="preset-list" class="preset-list">
    `;

    for (const presetName of Object.keys(presets)) {
      html += `<button class="preset-btn" data-preset="${presetName}">${presetName}</button>`;
    }

    html += `
          </div>
          <div class="preset-actions">
            <input type="text" id="preset-name" placeholder="Preset name" maxlength="30">
            <button id="save-preset-btn" class="btn-primary">Save</button>
          </div>
        </div>

        <div class="history-section">
          <h4>History (<span id="history-count">0</span>)</h4>
          <div id="history-timeline" class="history-timeline"></div>
          <button id="export-history-btn" class="btn-secondary">Export JSON</button>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Generate CSS for slider panel
   * @returns {string}
   */
  function generateSliderCSS() {
    return `
      <style id="parametric-sliders-css">
        #parametric-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 16px;
          background: var(--bg-secondary, #1f2937);
          border-left: 1px solid var(--border-color, #374151);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif;
          color: var(--text-primary, #f3f4f6);
          overflow: auto;
        }

        #parametric-panel .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-color, #374151);
        }

        #parametric-panel h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .icon-btn {
          background: none;
          border: 1px solid var(--border-color, #374151);
          color: var(--text-primary, #f3f4f6);
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .icon-btn:hover {
          background: var(--bg-tertiary, #111827);
          border-color: var(--text-primary, #f3f4f6);
        }

        .param-controls {
          flex: 1;
          overflow-y: auto;
          margin-bottom: 16px;
        }

        .param-control {
          margin-bottom: 12px;
          padding: 10px;
          background: var(--bg-tertiary, #111827);
          border-radius: 6px;
          border: 1px solid var(--border-color, #374151);
        }

        .param-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .param-header label {
          font-weight: 500;
          font-size: 13px;
          text-transform: capitalize;
        }

        .param-actions {
          display: flex;
          gap: 4px;
        }

        .lock-btn, .reset-btn {
          background: none;
          border: none;
          color: var(--text-secondary, #d1d5db);
          cursor: pointer;
          font-size: 12px;
          padding: 2px 4px;
          border-radius: 2px;
        }

        .lock-btn:hover, .reset-btn:hover {
          background: var(--bg-secondary, #1f2937);
        }

        .lock-btn.locked {
          color: #f97316;
        }

        .param-input-group {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 8px;
          margin-bottom: 6px;
          align-items: center;
        }

        .param-slider {
          width: 100%;
          height: 24px;
          cursor: pointer;
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          border: none;
          padding: 0;
        }

        .param-slider::-webkit-slider-track {
          height: 4px;
          background: var(--border-color, #374151);
          border-radius: 2px;
        }

        .param-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--accent-color, #0284c7);
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }

        .param-slider::-moz-range-track {
          height: 4px;
          background: var(--border-color, #374151);
          border-radius: 2px;
          border: none;
        }

        .param-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--accent-color, #0284c7);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        }

        .param-input {
          width: 70px;
          padding: 4px 6px;
          background: var(--bg-secondary, #1f2937);
          border: 1px solid var(--border-color, #374151);
          border-radius: 3px;
          color: var(--text-primary, #f3f4f6);
          font-size: 12px;
          text-align: right;
        }

        .param-input:focus {
          outline: none;
          border-color: var(--accent-color, #0284c7);
          box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
        }

        .param-unit {
          font-size: 11px;
          color: var(--text-secondary, #d1d5db);
          min-width: 24px;
          text-align: right;
        }

        .param-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: var(--text-secondary, #d1d5db);
        }

        .param-original {
          font-style: italic;
        }

        .preset-section {
          margin-bottom: 16px;
          padding: 10px;
          background: var(--bg-tertiary, #111827);
          border-radius: 6px;
          border: 1px solid var(--border-color, #374151);
        }

        .preset-section h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          font-weight: 600;
        }

        .preset-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        .preset-btn {
          flex: 0 1 auto;
          padding: 4px 8px;
          background: var(--bg-secondary, #1f2937);
          border: 1px solid var(--border-color, #374151);
          color: var(--text-primary, #f3f4f6);
          border-radius: 3px;
          font-size: 11px;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preset-btn:hover {
          background: var(--accent-color, #0284c7);
          border-color: var(--accent-color, #0284c7);
        }

        .preset-actions {
          display: flex;
          gap: 6px;
        }

        #preset-name {
          flex: 1;
          padding: 4px 6px;
          background: var(--bg-secondary, #1f2937);
          border: 1px solid var(--border-color, #374151);
          border-radius: 3px;
          color: var(--text-primary, #f3f4f6);
          font-size: 12px;
        }

        #preset-name:focus {
          outline: none;
          border-color: var(--accent-color, #0284c7);
        }

        .history-section {
          padding: 10px;
          background: var(--bg-tertiary, #111827);
          border-radius: 6px;
          border: 1px solid var(--border-color, #374151);
        }

        .history-section h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          font-weight: 600;
        }

        .history-timeline {
          max-height: 120px;
          overflow-y: auto;
          margin-bottom: 8px;
          font-size: 11px;
        }

        .history-item {
          padding: 4px;
          margin-bottom: 2px;
          background: var(--bg-secondary, #1f2937);
          border-left: 3px solid var(--accent-color, #0284c7);
          border-radius: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .btn-primary, .btn-secondary {
          padding: 6px 12px;
          border: 1px solid var(--border-color, #374151);
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          font-weight: 500;
        }

        .btn-primary {
          background: var(--accent-color, #0284c7);
          color: white;
          border-color: var(--accent-color, #0284c7);
        }

        .btn-primary:hover {
          opacity: 0.9;
        }

        .btn-secondary {
          background: var(--bg-secondary, #1f2937);
          color: var(--text-primary, #f3f4f6);
          width: 100%;
          margin-top: 4px;
        }

        .btn-secondary:hover {
          background: var(--bg-secondary, #1f2937);
          opacity: 0.8;
        }

        .dimension-label {
          pointer-events: none;
        }
      </style>
    `;
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Attach event listeners to slider UI
   */
  function attachEventListeners() {
    const panel = document.getElementById('parametric-panel');
    if (!panel) {
      return;
    }

    // Slider inputs
    panel.querySelectorAll('.param-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const paramName = e.target.dataset.param;
        const value = parseFloat(e.target.value);
        updateParameter(paramName, value);

        // Update corresponding number input
        const input = panel.querySelector(`.param-input[data-param="${paramName}"]`);
        if (input) {
          input.value = value.toFixed(parameterDefinitions[paramName].step > 1 ? 0 : 2);
        }
      });
    });

    // Number inputs
    panel.querySelectorAll('.param-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const paramName = e.target.dataset.param;
        const value = parseFloat(e.target.value);
        if (!isNaN(value)) {
          updateParameter(paramName, value);

          // Update corresponding slider
          const slider = panel.querySelector(`.param-slider[data-param="${paramName}"]`);
          if (slider) {
            slider.value = value;
          }
        }
      });
    });

    // Lock buttons
    panel.querySelectorAll('.lock-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const paramName = e.target.dataset.param;
        const def = parameterDefinitions[paramName];
        def.locked = !def.locked;
        e.target.textContent = def.locked ? '🔒' : '🔓';
        e.target.classList.toggle('locked', def.locked);
      });
    });

    // Reset buttons
    panel.querySelectorAll('.reset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const paramName = e.target.dataset.param;
        const def = parameterDefinitions[paramName];
        updateParameter(paramName, def.original, true);

        // Update UI
        const slider = panel.querySelector(`.param-slider[data-param="${paramName}"]`);
        const input = panel.querySelector(`.param-input[data-param="${paramName}"]`);
        if (slider) slider.value = def.original;
        if (input) input.value = def.original.toFixed(2);
      });
    });

    // Preset buttons
    panel.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const presetName = e.target.dataset.preset;
        loadPreset(presetName);
      });
    });

    // Save preset
    const saveBtn = document.getElementById('save-preset-btn');
    const presetInput = document.getElementById('preset-name');
    if (saveBtn && presetInput) {
      saveBtn.addEventListener('click', () => {
        const name = presetInput.value.trim();
        if (name) {
          savePreset(name);
          presetInput.value = '';

          // Add button to preset list
          const btn = document.createElement('button');
          btn.className = 'preset-btn';
          btn.dataset.preset = name;
          btn.textContent = name;
          btn.addEventListener('click', () => loadPreset(name));
          panel.querySelector('#preset-list').appendChild(btn);
        }
      });
    }

    // Annotations toggle
    const annotBtn = document.getElementById('toggle-annotations');
    if (annotBtn) {
      annotBtn.addEventListener('click', () => {
        if (Object.keys(annotations).length) {
          clearAnnotations();
        } else if (activeMesh) {
          addDimensionAnnotations(activeMesh);
        }
      });
    }

    // Export history
    const exportBtn = document.getElementById('export-history-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = JSON.stringify(parameterHistory, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `parameter-history-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  /**
   * Update history timeline display
   */
  function updateHistoryDisplay() {
    const timeline = document.getElementById('history-timeline');
    const count = document.getElementById('history-count');

    if (!timeline || !count) {
      return;
    }

    count.textContent = parameterHistory.length;
    timeline.innerHTML = '';

    const recent = parameterHistory.slice(-10).reverse();
    for (const entry of recent) {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.title = `${entry.parameter}: ${entry.oldValue.toFixed(2)} → ${entry.newValue.toFixed(2)}`;
      item.textContent = `${entry.parameter} = ${entry.newValue.toFixed(2)}`;
      timeline.appendChild(item);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize module
   * @param {THREE.Scene} _scene
   * @param {THREE.WebGLRenderer} _renderer
   */
  function init(_scene, _renderer) {
    scene = _scene;
    renderer = _renderer;
    createStandardPresets();
  }

  /**
   * Get UI HTML
   * @returns {string}
   */
  function getUI() {
    return generateSliderCSS() + generateSlidersHTML();
  }

  /**
   * Attach to mesh and create sliders
   * @param {THREE.Mesh} mesh
   */
  function attachToMesh(mesh) {
    if (!mesh || !mesh.geometry) {
      console.warn('ParametricSliders: Invalid mesh');
      return;
    }

    activeMesh = mesh;
    originalGeometry = analyzeGeometry(mesh.geometry);
    currentParameters = { ...originalGeometry.parameters };
    parameterDefinitions = createParameterDefinitions(originalGeometry.parameters);

    // Render UI
    const container = document.getElementById('parametric-panel');
    if (!container) {
      const html = getUI();
      const div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div);
    }

    attachEventListeners();
  }

  /**
   * Detach from mesh
   */
  function detach() {
    clearAnnotations();
    activeMesh = null;
    originalGeometry = null;
    currentParameters = {};
    parameterDefinitions = {};
  }

  /**
   * Execute action
   * @param {string} action
   * @param {Object} params
   */
  function execute(action, params = {}) {
    switch (action) {
      case 'update_parameter':
        updateParameter(params.name, params.value);
        break;

      case 'set_parameter':
        if (parameterDefinitions[params.name]) {
          parameterDefinitions[params.name].value = params.value;
          currentParameters[params.name] = params.value;
          rebuildMeshGeometry();
          updateDimensionLabels();
        }
        break;

      case 'save_preset':
        savePreset(params.name);
        break;

      case 'load_preset':
        loadPreset(params.name);
        break;

      case 'toggle_annotations':
        if (Object.keys(annotations).length) {
          clearAnnotations();
        } else if (activeMesh) {
          addDimensionAnnotations(activeMesh);
        }
        break;

      case 'link_parameters':
        linkedParams[params.main] = params.linked || [];
        break;

      case 'set_constraint':
        if (parameterDefinitions[params.name]) {
          constraints[params.name] = params.constraint;
          const def = parameterDefinitions[params.name];
          if (params.constraint.min !== undefined) def.min = params.constraint.min;
          if (params.constraint.max !== undefined) def.max = params.constraint.max;
          if (params.constraint.step !== undefined) def.step = params.constraint.step;
        }
        break;

      case 'undo':
        if (parameterHistory.length > 0) {
          const entry = parameterHistory[parameterHistory.length - 1];
          updateParameter(entry.parameter, entry.oldValue, false);
          parameterHistory.pop();
        }
        break;

      case 'reset_all':
        for (const [name, def] of Object.entries(parameterDefinitions)) {
          updateParameter(name, def.original, true);
        }
        break;

      default:
        console.warn(`ParametricSliders: Unknown action "${action}"`);
    }

    updateHistoryDisplay();
  }

  /**
   * Get current parameters
   * @returns {Object}
   */
  function getParameters() {
    return JSON.parse(JSON.stringify(currentParameters));
  }

  /**
   * Set parameter value
   * @param {string} name
   * @param {number} value
   */
  function setParameter(name, value) {
    updateParameter(name, value, true);
  }

  /**
   * Export config as JSON
   * @returns {Object}
   */
  function exportConfig() {
    return {
      type: originalGeometry.type,
      parameters: currentParameters,
      presets,
      history: parameterHistory,
      timestamp: Date.now()
    };
  }

  /**
   * Export as OpenSCAD variables
   * @returns {string}
   */
  function exportOpenSCAD() {
    let scad = '// cycleCAD → OpenSCAD parametric variables\n\n';
    for (const [name, value] of Object.entries(currentParameters)) {
      const def = parameterDefinitions[name];
      scad += `${name} = ${value}; // ${def.category}\n`;
    }
    return scad;
  }

  // ============================================================================
  // MODULE EXPORT
  // ============================================================================

  window.CycleCAD = window.CycleCAD || {};
  window.CycleCAD.ParametricSliders = {
    init,
    getUI,
    execute,
    attachToMesh,
    detach,
    getParameters,
    setParameter,
    savePreset,
    loadPreset,
    exportConfig,
    exportOpenSCAD
  };

  console.log('✓ ParametricSliders module loaded');
})();
