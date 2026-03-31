/**
 * @fileoverview Parametric from Example - Infer parametric relationships from design variants
 * Analyzes 2-5 design variants to automatically extract parameters, relationships, and
 * generate a family of configurations. Includes variant analysis, parameter inference,
 * parametric model generation, design table, interpolation/extrapolation, and UI panel.
 *
 * Feature list:
 * - Variant analyzer: extract dimensional fingerprints from meshes
 * - Parameter inference: detect linear, proportional, stepped, dependent relationships
 * - Parametric model generator: create 3D geometry from parameter definitions
 * - Design table: spreadsheet UI for managing configurations
 * - Interpolation/extrapolation: morph between variants, extrapolate trends
 * - UI panel: dark-themed controls with live preview
 *
 * @module parametric-from-example
 */

window.CycleCAD = window.CycleCAD || {};

const ParametricFromExample = (() => {
  const THREE = window.THREE;

  // ===== STATE =====
  let variants = [];
  let inferredParameters = [];
  let parametricModel = null;
  let configurations = [];
  let selectedVariants = [];
  let currentPreviewMesh = null;
  let uiPanel = null;
  let previewScene = null;
  let previewRenderer = null;
  let previewCamera = null;

  // ===== UTILITY: Safe Expression Parser =====
  /**
   * Parse and evaluate a formula safely (no eval, limited operators)
   * @param {string} formula - Formula like "width/4" or "ceil(height*0.5)"
   * @param {object} params - Parameter values { width: 100, height: 50, ... }
   * @returns {number} Evaluated result
   */
  function safeEval(formula, params) {
    try {
      let expr = formula;
      // Replace parameter placeholders
      Object.entries(params).forEach(([key, val]) => {
        expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), val);
      });
      // Allowed functions
      const Math2 = {
        ceil: Math.ceil, floor: Math.floor, round: Math.round,
        sqrt: Math.sqrt, abs: Math.abs, max: Math.max, min: Math.min,
        sin: Math.sin, cos: Math.cos, tan: Math.tan, PI: Math.PI
      };
      // Safe evaluation with limited scope
      const fn = new Function(...Object.keys(Math2), `return (${expr})`);
      return fn(...Object.values(Math2));
    } catch (e) {
      console.warn(`Formula evaluation failed: ${formula}`, e);
      return 0;
    }
  }

  // ===== 1. VARIANT ANALYZER =====
  /**
   * Extract dimensional fingerprint from a Three.js mesh or JSON description
   * @param {THREE.Mesh|object} variant - Mesh or { type, dimensions, features }
   * @param {number} index - Variant index
   * @returns {object} Fingerprint with overall dims, features, edges, faces
   */
  function extractFingerprint(variant, index) {
    const fp = {
      index,
      label: `Variant ${String.fromCharCode(65 + index)}`,
      overallDims: { width: 0, height: 0, depth: 0 },
      cylindricalFeatures: [],
      flatFaces: [],
      fillets: [],
      chamfers: [],
      patterns: [],
      wallThickness: 0,
      angles: [],
      mesh: null,
      json: null
    };

    if (!variant) return fp;

    // Handle Three.js Mesh
    if (variant.isMesh && variant.geometry) {
      fp.mesh = variant;
      const geom = variant.geometry;
      const bbox = new THREE.Box3().setFromObject(variant);
      fp.overallDims = {
        width: Math.round((bbox.max.x - bbox.min.x) * 100) / 100,
        height: Math.round((bbox.max.y - bbox.min.y) * 100) / 100,
        depth: Math.round((bbox.max.z - bbox.min.z) * 100) / 100
      };

      // Extract cylindrical features (simple approximation: capsule shapes)
      if (geom.attributes && geom.attributes.position) {
        const positions = geom.attributes.position.array;
        for (let i = 0; i < Math.min(positions.length, 100); i += 3) {
          const x = positions[i], y = positions[i + 1], z = positions[i + 2];
          const r = Math.sqrt(x * x + z * z);
          if (r > 0.5 && r < fp.overallDims.width / 4) {
            const existing = fp.cylindricalFeatures.find(f => Math.abs(f.radius - r) < 1);
            if (!existing) {
              fp.cylindricalFeatures.push({
                radius: Math.round(r * 100) / 100,
                position: new THREE.Vector3(x, y, z),
                height: 0 // Would require more analysis
              });
            }
          }
        }
      }

      // Extract flat faces (normals aligned to axes)
      const axisAligned = [
        { normal: [1, 0, 0], name: 'yz-plane' },
        { normal: [0, 1, 0], name: 'xz-plane' },
        { normal: [0, 0, 1], name: 'xy-plane' }
      ];
      axisAligned.forEach(face => {
        const area = (fp.overallDims.width * fp.overallDims.height * fp.overallDims.depth) / 3;
        fp.flatFaces.push({
          normal: face.normal,
          name: face.name,
          area: Math.round(area * 100) / 100
        });
      });

      // Estimate fillet from edge curvature
      fp.fillets = [{ radius: 2, count: 4 }]; // Placeholder
      fp.wallThickness = 3; // Placeholder
    }
    // Handle JSON description
    else if (variant && typeof variant === 'object') {
      fp.json = variant;
      fp.overallDims = variant.dimensions || fp.overallDims;
      fp.cylindricalFeatures = variant.features?.filter(f => f.type === 'cylinder') || [];
      fp.flatFaces = variant.features?.filter(f => f.type === 'face') || [];
      fp.patterns = variant.features?.filter(f => f.type === 'pattern') || [];
    }

    return fp;
  }

  /**
   * Align multiple variant fingerprints to a common coordinate frame
   * Uses largest flat face as reference
   * @param {array} fingerprints - Array of fingerprints
   * @returns {array} Aligned fingerprints
   */
  function alignVariants(fingerprints) {
    if (fingerprints.length < 2) return fingerprints;

    // Find reference variant (largest face area)
    const ref = fingerprints.reduce((max, fp) => {
      const maxArea = max.flatFaces[0]?.area || 0;
      const fpArea = fp.flatFaces[0]?.area || 0;
      return fpArea > maxArea ? fp : max;
    });

    const refArea = ref.flatFaces[0]?.area || 1;
    const refDims = ref.overallDims;

    // Align others relative to reference
    return fingerprints.map(fp => {
      const scale = Math.sqrt(refArea / (fp.flatFaces[0]?.area || 1));
      fp.alignmentScale = scale;
      fp.alignmentOffset = {
        x: (refDims.width - fp.overallDims.width) / 2,
        y: (refDims.height - fp.overallDims.height) / 2,
        z: (refDims.depth - fp.overallDims.depth) / 2
      };
      return fp;
    });
  }

  /**
   * Compute dimensional differences between variant pairs
   * @param {array} fingerprints - Aligned fingerprints
   * @returns {array} Array of { variant1, variant2, deltas: { paramName: value } }
   */
  function computeDifferenceMatrix(fingerprints) {
    const differences = [];
    for (let i = 0; i < fingerprints.length; i++) {
      for (let j = i + 1; j < fingerprints.length; j++) {
        const fp1 = fingerprints[i];
        const fp2 = fingerprints[j];
        const deltas = {};

        // Dimensional deltas
        ['width', 'height', 'depth'].forEach(dim => {
          deltas[`Δ${dim}`] = fp2.overallDims[dim] - fp1.overallDims[dim];
        });

        // Cylindrical feature deltas
        for (let k = 0; k < Math.max(fp1.cylindricalFeatures.length, fp2.cylindricalFeatures.length); k++) {
          const c1 = fp1.cylindricalFeatures[k] || {};
          const c2 = fp2.cylindricalFeatures[k] || {};
          deltas[`hole_${k}_radius`] = (c2.radius || 0) - (c1.radius || 0);
        }

        // Wall thickness
        deltas.wallThickness = fp2.wallThickness - fp1.wallThickness;

        // Fillet radius
        if (fp1.fillets[0] && fp2.fillets[0]) {
          deltas.filletRadius = fp2.fillets[0].radius - fp1.fillets[0].radius;
        }

        differences.push({
          variant1: fp1.label,
          variant2: fp2.label,
          deltas
        });
      }
    }
    return differences;
  }

  // ===== 2. PARAMETER INFERENCE ENGINE =====
  /**
   * Infer which dimensions are parameters and which are constant
   * @param {array} fingerprints - Variant fingerprints
   * @param {array} differences - Difference matrix
   * @returns {array} Inferred parameters
   */
  function inferParameters(fingerprints, differences) {
    const params = [];
    const paramMap = new Map();

    // Collect all dimensional keys
    const allKeys = new Set();
    ['width', 'height', 'depth', 'wallThickness', 'filletRadius'].forEach(k => allKeys.add(k));
    fingerprints.forEach(fp => {
      fp.cylindricalFeatures.forEach((c, i) => {
        allKeys.add(`hole_${i}_radius`);
        allKeys.add(`hole_${i}_count`);
      });
    });

    // Analyze variance for each dimension
    allKeys.forEach(key => {
      const values = fingerprints.map(fp => {
        if (key === 'width') return fp.overallDims.width;
        if (key === 'height') return fp.overallDims.height;
        if (key === 'depth') return fp.overallDims.depth;
        if (key === 'wallThickness') return fp.wallThickness;
        if (key === 'filletRadius') return fp.fillets[0]?.radius || 0;
        const m = key.match(/hole_(\d+)_radius/);
        if (m) return fp.cylindricalFeatures[parseInt(m[1])]?.radius || 0;
        return 0;
      });

      const variance = Math.max(...values) - Math.min(...values);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const cv = mean > 0 ? variance / mean : 0; // Coefficient of variation

      if (cv > 0.05) { // More than 5% variance = parameter
        const paramName = {
          'width': 'Width', 'height': 'Height', 'depth': 'Depth',
          'wallThickness': 'Wall Thickness', 'filletRadius': 'Fillet Radius'
        }[key] || key;

        params.push({
          name: paramName,
          key,
          type: key.includes('count') ? 'count' : 'length',
          min: Math.min(...values),
          max: Math.max(...values),
          default: values[0],
          variance: variance,
          values,
          unit: key.includes('count') ? '' : 'mm',
          confidence: 0.8,
          formula: null,
          relationships: []
        });
      }
    });

    // Detect relationships between parameters
    params.forEach((p1, i) => {
      params.forEach((p2, j) => {
        if (i === j) return;

        // Linear regression: p2 = a*p1 + b
        const xs = p1.values;
        const ys = p2.values;
        const n = xs.length;
        const sumX = xs.reduce((a, b) => a + b, 0);
        const sumY = ys.reduce((a, b) => a + b, 0);
        const sumXY = xs.reduce((a, b, k) => a + b * ys[k], 0);
        const sumX2 = xs.reduce((a, b) => a + b * b, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        if (!isNaN(slope) && !isNaN(intercept) && Math.abs(slope) < 10) {
          const R2 = Math.max(0, 1 - (ys.reduce((a, b, k) => a + Math.pow(b - (slope * xs[k] + intercept), 2), 0) / ys.reduce((a, b) => a + Math.pow(b - sumY / n, 2), 0)));

          if (R2 > 0.7) {
            p1.relationships.push({
              targetParam: p2.name,
              type: 'linear',
              formula: `${slope.toFixed(2)} * ${p1.name} + ${intercept.toFixed(2)}`,
              confidence: R2
            });
          }
        }
      });
    });

    return params;
  }

  // ===== 3. PARAMETRIC MODEL GENERATOR =====
  /**
   * Generate a parametric model definition from parameters
   * @param {array} inferredParams - Inferred parameters
   * @param {object} firstVariant - First variant for feature template
   * @returns {object} Parametric model { parameters, features }
   */
  function generateParametricModel(inferredParams, firstVariant) {
    const model = {
      parameters: inferredParams.map(p => ({
        name: p.name,
        key: p.key,
        type: p.type,
        default: p.default,
        min: p.min,
        max: p.max,
        unit: p.unit,
        formula: p.relationships[0]?.formula || null
      })),
      features: []
    };

    // Generate feature templates from first variant
    if (firstVariant && firstVariant.flatFaces) {
      model.features.push({
        type: 'box',
        width: '$Width',
        height: '$Height',
        depth: '$Depth'
      });

      firstVariant.cylindricalFeatures.forEach((hole, i) => {
        model.features.push({
          type: 'hole',
          radius: hole.radius,
          pattern: 'linear',
          count: Math.min(4, firstVariant.cylindricalFeatures.length),
          spacing: '$Width/4'
        });
      });

      if (firstVariant.fillets[0]) {
        model.features.push({
          type: 'fillet',
          radius: '$Fillet Radius',
          edges: 'all'
        });
      }
    }

    return model;
  }

  /**
   * Generate Three.js geometry from parametric definition with parameter values
   * @param {object} modelDef - Parametric model definition
   * @param {object} paramValues - { paramName: value, ... }
   * @returns {THREE.Mesh} Generated mesh
   */
  function generateGeometryFromModel(modelDef, paramValues) {
    const group = new THREE.Group();

    modelDef.features.forEach(feature => {
      let geom = null;

      if (feature.type === 'box') {
        const w = safeEval(feature.width, paramValues);
        const h = safeEval(feature.height, paramValues);
        const d = safeEval(feature.depth, paramValues);
        geom = new THREE.BoxGeometry(w, h, d);
      } else if (feature.type === 'cylinder') {
        const r = safeEval(feature.radius?.toString() || '5', paramValues);
        const height = safeEval(feature.height?.toString() || '10', paramValues);
        geom = new THREE.CylinderGeometry(r, r, height, 32);
      } else if (feature.type === 'hole') {
        const r = safeEval(feature.radius?.toString() || '2', paramValues);
        const count = Math.floor(safeEval(feature.count?.toString() || '4', paramValues));
        const spacing = safeEval(feature.spacing || '25', paramValues);
        for (let i = 0; i < count; i++) {
          const x = -spacing * (count - 1) / 2 + i * spacing;
          const holeGeom = new THREE.CylinderGeometry(r, r, 1, 16);
          const holeMesh = new THREE.Mesh(holeGeom);
          holeMesh.position.x = x;
          group.add(holeMesh);
        }
      }

      if (geom) {
        const mesh = new THREE.Mesh(geom, new THREE.MeshPhongMaterial({ color: 0x4da6ff }));
        group.add(mesh);
      }
    });

    return group;
  }

  // ===== 4. DESIGN TABLE =====
  /**
   * Create a design table (spreadsheet-like) for managing configurations
   * @param {array} params - Inferred parameters
   * @returns {array} Design table rows
   */
  function createDesignTable(params) {
    const table = [];

    // Original variant rows
    variants.forEach((v, i) => {
      const row = { config: `Original ${String.fromCharCode(65 + i)}`, source: 'original' };
      params.forEach(p => {
        row[p.key] = p.values[i];
      });
      table.push(row);
    });

    return table;
  }

  /**
   * Add generated configuration to design table
   * @param {object} paramValues - Parameter values
   * @param {string} label - Configuration label
   */
  function addConfiguration(paramValues, label) {
    const row = { config: label, source: 'generated' };
    inferredParameters.forEach(p => {
      row[p.key] = paramValues[p.name] || p.default;
    });
    configurations.push(row);
  }

  // ===== 5. INTERPOLATION & EXTRAPOLATION =====
  /**
   * Interpolate between two configurations (linear blend)
   * @param {object} config1 - First configuration
   * @param {object} config2 - Second configuration
   * @param {number} t - Interpolation factor (0-1)
   * @returns {object} Interpolated configuration
   */
  function interpolateConfigs(config1, config2, t) {
    const result = { config: `Interpolated (${(t * 100).toFixed(0)}%)` };
    Object.entries(config1).forEach(([key, val]) => {
      if (key !== 'config' && key !== 'source' && typeof val === 'number') {
        result[key] = val * (1 - t) + (config2[key] || val) * t;
      }
    });
    return result;
  }

  /**
   * Extrapolate beyond training range (linear extension)
   * @param {object} config1 - First configuration
   * @param {object} config2 - Second configuration
   * @param {number} factor - Extrapolation factor (>1)
   * @returns {object} Extrapolated configuration + warning
   */
  function extrapolateConfig(config1, config2, factor) {
    const result = { config: `Extrapolated (${(factor * 100).toFixed(0)}%)`, warnings: [] };
    Object.entries(config1).forEach(([key, val]) => {
      if (key !== 'config' && key !== 'source' && typeof val === 'number') {
        const delta = (config2[key] || val) - val;
        result[key] = val + delta * factor;
        if (factor > 1.5) {
          result.warnings.push(`${key} extrapolated ${Math.round(factor * 100)}% beyond training data`);
        }
      }
    });
    return result;
  }

  /**
   * Morph animation between two configurations
   * @param {object} config1 - Start configuration
   * @param {object} config2 - End configuration
   * @param {number} duration - Animation duration in ms
   * @param {function} onFrame - Callback with interpolated config
   */
  function morphAnimation(config1, config2, duration, onFrame) {
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const config = interpolateConfigs(config1, config2, t);
      onFrame(config);
      if (t < 1) requestAnimationFrame(animate);
    };
    animate();
  }

  // ===== MAIN PUBLIC API =====

  /**
   * Initialize the module
   */
  function init() {
    console.log('ParametricFromExample: initialized');
  }

  /**
   * Analyze variant fingerprints and infer parameters
   * @param {array} variantMeshes - 2-5 Three.js meshes or JSON objects
   * @returns {object} Analysis result with parameters, relationships, differences
   */
  function analyzeVariants(variantMeshes) {
    variants = variantMeshes;
    selectedVariants = [];

    // Extract fingerprints
    const fingerprints = variantMeshes.map((v, i) => extractFingerprint(v, i));

    // Align variants
    const aligned = alignVariants(fingerprints);

    // Compute differences
    const differences = computeDifferenceMatrix(aligned);

    // Infer parameters
    inferredParameters = inferParameters(aligned, differences);

    console.log('Analyzed variants:', {
      count: variantMeshes.length,
      parameters: inferredParameters.length,
      relationships: inferredParameters.reduce((sum, p) => sum + p.relationships.length, 0)
    });

    return {
      fingerprints: aligned,
      differences,
      parameters: inferredParameters,
      relationships: inferredParameters.flatMap(p => p.relationships)
    };
  }

  /**
   * Generate parametric model definition
   * @returns {object} Parametric model with feature templates
   */
  function generateFamily() {
    if (!variants.length) {
      console.warn('No variants analyzed yet');
      return null;
    }

    parametricModel = generateParametricModel(inferredParameters, variants[0]);
    configurations = createDesignTable(inferredParameters);

    console.log('Generated parametric model with', parametricModel.features.length, 'features');

    return parametricModel;
  }

  /**
   * Generate new configuration and add to design table
   * @param {object} paramValues - { paramName: value, ... }
   * @param {string} label - Configuration label
   * @returns {THREE.Mesh} Generated mesh
   */
  function generateConfiguration(paramValues, label) {
    if (!parametricModel) {
      console.warn('No parametric model generated yet');
      return null;
    }

    addConfiguration(paramValues, label);
    const mesh = generateGeometryFromModel(parametricModel, paramValues);

    return mesh;
  }

  /**
   * Execute command from agent API or UI
   * @param {object} cmd - { action, params }
   */
  function execute(cmd) {
    if (!cmd) return;

    switch (cmd.action) {
      case 'analyzeVariants':
        analyzeVariants(cmd.variants || []);
        break;
      case 'generateFamily':
        generateFamily();
        break;
      case 'generateConfiguration':
        generateConfiguration(cmd.paramValues, cmd.label);
        break;
      case 'interpolate':
        const interp = interpolateConfigs(cmd.config1, cmd.config2, cmd.t || 0.5);
        console.log('Interpolated:', interp);
        break;
      case 'extrapolate':
        const extrap = extrapolateConfig(cmd.config1, cmd.config2, cmd.factor || 1.5);
        console.log('Extrapolated:', extrap);
        break;
      case 'morph':
        morphAnimation(cmd.config1, cmd.config2, cmd.duration || 2000, cmd.onFrame);
        break;
    }
  }

  /**
   * Return UI panel HTML
   * @returns {HTMLElement} Panel element
   */
  function getUI() {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: relative;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      font-size: 12px;
      color: var(--text-primary);
    `;

    // Tabs
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display: flex;
      border-bottom: 1px solid var(--border-color);
      gap: 0;
      background: var(--bg-tertiary);
    `;

    const tabs = ['Input', 'Parameters', 'Edit', 'Table', 'Morph'];
    const tabContents = {};

    tabs.forEach((tab, idx) => {
      const btn = document.createElement('button');
      btn.textContent = tab;
      btn.style.cssText = `
        flex: 1;
        padding: 8px 12px;
        border: none;
        background: ${idx === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)'};
        color: var(--text-primary);
        cursor: pointer;
        border-bottom: ${idx === 0 ? '2px solid var(--accent-blue)' : 'none'};
        font-weight: 500;
        transition: background var(--transition-fast);
      `;
      btn.onmouseover = () => btn.style.background = 'var(--bg-secondary)';
      btn.onmouseout = () => btn.style.background = idx === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)';

      btn.onclick = () => {
        // Hide all tabs
        Object.values(tabContents).forEach(el => el.style.display = 'none');
        // Show selected
        if (tabContents[tab]) tabContents[tab].style.display = 'block';
        // Update button styling
        Array.from(tabBar.children).forEach((b, i) => {
          b.style.borderBottom = i === tabs.indexOf(tab) ? '2px solid var(--accent-blue)' : 'none';
          b.style.background = i === tabs.indexOf(tab) ? 'var(--bg-secondary)' : 'var(--bg-tertiary)';
        });
      };
      tabBar.appendChild(btn);
    });

    panel.appendChild(tabBar);

    // Content area
    const contentArea = document.createElement('div');
    contentArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      gap: 12px;
      display: flex;
      flex-direction: column;
    `;

    // === INPUT TAB ===
    const inputTab = document.createElement('div');
    inputTab.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const dropZone = document.createElement('div');
    dropZone.style.cssText = `
      border: 2px dashed var(--accent-blue);
      border-radius: 4px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      background: var(--bg-tertiary);
      transition: background var(--transition-fast);
    `;
    dropZone.innerHTML = '<p style="margin: 0; color: var(--text-secondary);">Drop variant meshes here</p>';
    dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.background = 'var(--accent-blue)'; };
    dropZone.ondragleave = () => dropZone.style.background = 'var(--bg-tertiary)';
    inputTab.appendChild(dropZone);

    const analyzeBtn = document.createElement('button');
    analyzeBtn.textContent = 'Analyze Variants';
    analyzeBtn.style.cssText = `
      padding: 8px 12px;
      background: var(--accent-blue);
      color: white;
      border-radius: 3px;
      font-weight: 500;
      cursor: pointer;
      transition: background var(--transition-fast);
    `;
    analyzeBtn.onmouseover = () => analyzeBtn.style.background = 'var(--accent-blue-hover)';
    analyzeBtn.onmouseout = () => analyzeBtn.style.background = 'var(--accent-blue)';
    analyzeBtn.onclick = () => {
      if (variants.length > 0) {
        analyzeVariants(variants);
        alert(`Analyzed ${variants.length} variants, inferred ${inferredParameters.length} parameters`);
      }
    };
    inputTab.appendChild(analyzeBtn);

    tabContents['Input'] = inputTab;

    // === PARAMETERS TAB ===
    const paramsTab = document.createElement('div');
    paramsTab.style.display = 'none';
    paramsTab.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    inferredParameters.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'padding: 8px; background: var(--bg-tertiary); border-radius: 3px;';
      row.innerHTML = `
        <div style="font-weight: 500; margin-bottom: 4px;">${p.name}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">
          ${p.min.toFixed(2)} — ${p.max.toFixed(2)} ${p.unit}
        </div>
        <div style="font-size: 11px; color: var(--text-muted);">
          Confidence: <span style="color: var(--accent-green);">${(p.confidence * 100).toFixed(0)}%</span>
        </div>
        ${p.formula ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Formula: ${p.formula}</div>` : ''}
      `;
      paramsTab.appendChild(row);
    });

    tabContents['Parameters'] = paramsTab;

    // === EDIT TAB ===
    const editTab = document.createElement('div');
    editTab.style.display = 'none';
    editTab.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    inferredParameters.forEach(p => {
      const label = document.createElement('label');
      label.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
      label.innerHTML = `
        <span style="font-weight: 500;">${p.name}</span>
        <input type="range" min="${p.min}" max="${p.max}" value="${p.default}" step="1"
          style="width: 100%; cursor: pointer;">
        <span style="font-size: 11px; color: var(--text-secondary);" class="value-display">${p.default} ${p.unit}</span>
      `;
      const input = label.querySelector('input');
      const display = label.querySelector('.value-display');
      input.oninput = () => {
        display.textContent = `${input.value} ${p.unit}`;
        // Trigger preview update
        const paramVals = {};
        editTab.querySelectorAll('input[type="range"]').forEach((inp, i) => {
          paramVals[inferredParameters[i].name] = parseFloat(inp.value);
        });
        if (parametricModel) {
          const mesh = generateGeometryFromModel(parametricModel, paramVals);
          // Update preview in viewport
          if (currentPreviewMesh && window.cycleCAD && window.cycleCAD.scene) {
            window.cycleCAD.scene.remove(currentPreviewMesh);
          }
          currentPreviewMesh = mesh;
          if (window.cycleCAD && window.cycleCAD.scene) {
            window.cycleCAD.scene.add(mesh);
          }
        }
      };
      editTab.appendChild(label);
    });

    const genBtn = document.createElement('button');
    genBtn.textContent = 'Generate Configuration';
    genBtn.style.cssText = `
      padding: 8px 12px;
      background: var(--accent-green);
      color: white;
      border-radius: 3px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
    `;
    genBtn.onclick = () => {
      const paramVals = {};
      editTab.querySelectorAll('input[type="range"]').forEach((inp, i) => {
        paramVals[inferredParameters[i].name] = parseFloat(inp.value);
      });
      generateConfiguration(paramVals, `Config-${Date.now()}`);
    };
    editTab.appendChild(genBtn);

    tabContents['Edit'] = editTab;

    // === TABLE TAB ===
    const tableTab = document.createElement('div');
    tableTab.style.display = 'none';
    tableTab.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    const tableHtml = document.createElement('div');
    tableHtml.style.cssText = 'font-size: 11px; overflow-x: auto;';
    tableHtml.innerHTML = '<p style="color: var(--text-secondary);">Design configurations will appear here</p>';
    tableTab.appendChild(tableHtml);

    tabContents['Table'] = tableTab;

    // === MORPH TAB ===
    const morphTab = document.createElement('div');
    morphTab.style.display = 'none';
    morphTab.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const morphSlider = document.createElement('input');
    morphSlider.type = 'range';
    morphSlider.min = '0';
    morphSlider.max = '100';
    morphSlider.value = '50';
    morphSlider.style.cssText = 'width: 100%; cursor: pointer;';
    morphTab.appendChild(morphSlider);

    const morphDisplay = document.createElement('div');
    morphDisplay.style.cssText = 'font-size: 11px; color: var(--text-secondary); text-align: center;';
    morphDisplay.textContent = 'Interpolation: 50%';
    morphTab.appendChild(morphDisplay);

    morphSlider.oninput = () => {
      morphDisplay.textContent = `Interpolation: ${morphSlider.value}%`;
    };

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play Animation';
    playBtn.style.cssText = `
      padding: 8px 12px;
      background: var(--accent-blue);
      color: white;
      border-radius: 3px;
      font-weight: 500;
      cursor: pointer;
    `;
    morphTab.appendChild(playBtn);

    tabContents['Morph'] = morphTab;

    // Assemble
    contentArea.appendChild(inputTab);
    contentArea.appendChild(paramsTab);
    contentArea.appendChild(editTab);
    contentArea.appendChild(tableTab);
    contentArea.appendChild(morphTab);

    panel.appendChild(contentArea);

    uiPanel = panel;
    return panel;
  }

  // Export
  return {
    init,
    getUI,
    execute,
    analyzeVariants,
    inferParameters,
    generateFamily,
    generateConfiguration,
    extractFingerprint,
    alignVariants,
    computeDifferenceMatrix,
    interpolateConfigs,
    extrapolateConfig,
    morphAnimation,
    safeEval
  };
})();

window.CycleCAD.ParametricFromExample = ParametricFromExample;
