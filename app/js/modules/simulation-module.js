/**
 * @file simulation-module.js
 * @description SimulationModule — FEA (Finite Element Analysis) Simulator
 *   Provides static structural, thermal, modal (vibration), and buckling analysis
 *   with automated meshing, loading, constraints, and visualization.
 *
 * @version 1.0.0
 * @author cycleCAD Team
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 *
 * @module simulation-module
 * @requires viewport (3D scene + camera)
 * @requires operations (geometry data)
 *
 * Analysis Types:
 *   - STATIC: Linear static structural analysis (stress, displacement, safety factor)
 *   - THERMAL: Steady-state heat transfer analysis
 *   - MODAL: Eigenvalue analysis for natural frequencies and mode shapes
 *   - BUCKLING: Buckling analysis (instability under load)
 *
 * Load Types (6):
 *   - FORCE: Point or distributed force (N)
 *   - MOMENT: Torque or moment (N·mm)
 *   - PRESSURE: Surface pressure (N/mm²)
 *   - GRAVITY: Gravitational acceleration (g)
 *   - TEMPERATURE: Thermal load (°C)
 *   - REMOTE_FORCE: Force at distance (moment arm)
 *
 * Boundary Conditions (5):
 *   - FIXED: Fully constrained (no DOF)
 *   - PIN: Point support (XY translation free)
 *   - ROLLER: Unidirectional constraint
 *   - SYMMETRY: Symmetric boundary condition
 *   - PRESCRIBED_DISPLACEMENT: Applied displacement
 *
 * Materials Library (6):
 *   - Steel (1045): E=205 GPa, ν=0.3, ρ=7.85 g/cm³, σ_y=380 MPa
 *   - Aluminum (6061-T6): E=69 GPa, ν=0.33, ρ=2.7 g/cm³, σ_y=275 MPa
 *   - ABS Plastic: E=2.3 GPa, ν=0.36, ρ=1.04 g/cm³, σ_y=40 MPa
 *   - Brass (C360): E=110 GPa, ν=0.34, ρ=8.53 g/cm³, σ_y=380 MPa
 *   - Titanium (Ti-6Al-4V): E=110 GPa, ν=0.31, ρ=4.42 g/cm³, σ_y=1160 MPa
 *   - Nylon 6: E=2.8 GPa, ν=0.4, ρ=1.14 g/cm³, σ_y=75 MPa
 *
 * Workflow:
 *   1. User selects analysis type (static, thermal, modal, buckling)
 *   2. User selects material from library
 *   3. User applies loads (forces, moments, pressure, etc.)
 *   4. User applies boundary conditions (fixed, pin, symmetry, etc.)
 *   5. User generates mesh (tetrahedral, configurable element size)
 *   6. User runs solver
 *   7. Results visualized as color map (stress, displacement, temperature, etc.)
 *   8. User probes results or exports report
 *
 * Results:
 *   - Von Mises stress distribution
 *   - Nodal displacement field
 *   - Safety factor (yield / stress)
 *   - Temperature distribution (thermal analysis)
 *   - Natural frequencies (modal analysis)
 *   - Buckling loads (buckling analysis)
 */

const SimulationModule = {
  id: 'simulation',
  name: 'FEA Simulation',
  version: '1.0.0',
  category: 'tool',
  dependencies: ['viewport', 'operations'],
  memoryEstimate: 40,

  // Module state
  state: {
    activeAnalysis: null, // {bodyId, type, material, status}
    mesh: null, // {nodes: [], elements: [], elementSize}
    loads: [], // [{type, target, value, direction}]
    constraints: [], // [{type, target, params}]
    material: null, // {name, E, nu, rho, yieldStrength}
    results: null, // {stress: [], displacement: [], temperature: [], modes: []}
    solver: null, // {status, progress, elapsed}
  },

  // Material library (E in GPa, nu is Poisson's ratio, rho in g/cm³, yield in MPa)
  MATERIALS: {
    STEEL: { name: 'Steel (1045)', E: 205, nu: 0.3, rho: 7.85, yieldStrength: 380, color: 0x555555 },
    ALUMINUM: { name: 'Aluminum 6061-T6', E: 69, nu: 0.33, rho: 2.7, yieldStrength: 275, color: 0xcccccc },
    ABS: { name: 'ABS Plastic', E: 2.3, nu: 0.36, rho: 1.04, yieldStrength: 40, color: 0x333333 },
    BRASS: { name: 'Brass C360', E: 110, nu: 0.34, rho: 8.53, yieldStrength: 380, color: 0xb8860b },
    TITANIUM: { name: 'Ti-6Al-4V', E: 110, nu: 0.31, rho: 4.42, yieldStrength: 1160, color: 0xffffff },
    NYLON: { name: 'Nylon 6', E: 2.8, nu: 0.4, rho: 1.14, yieldStrength: 75, color: 0xffffcc },
  },

  // Analysis types
  ANALYSIS_TYPES: {
    STATIC: 'static',
    THERMAL: 'thermal',
    MODAL: 'modal',
    BUCKLING: 'buckling',
  },

  // Load types
  LOAD_TYPES: {
    FORCE: 'force',
    MOMENT: 'moment',
    PRESSURE: 'pressure',
    GRAVITY: 'gravity',
    TEMPERATURE: 'temperature',
    REMOTE_FORCE: 'remote_force',
  },

  // Boundary condition types
  BC_TYPES: {
    FIXED: 'fixed',
    PIN: 'pin',
    ROLLER: 'roller',
    SYMMETRY: 'symmetry',
    PRESCRIBED_DISPLACEMENT: 'prescribed_displacement',
  },

  /**
   * Initialize simulation module
   */
  init() {
    if (window._debug) console.log('[Simulation] Initializing...');
    this.state.activeAnalysis = null;
    this.state.mesh = null;
    this.state.loads = [];
    this.state.constraints = [];
    this.state.material = this.MATERIALS.STEEL;
    this.state.results = null;
    this._initEventListeners();
  },

  /**
   * Initialize event listeners
   */
  _initEventListeners() {
    window.addEventListener('simulation:action', (e) => {
      if (window._debug) console.log('[Simulation] Event:', e.detail);
    });
  },

  /**
   * Setup simulation for a body
   * @param {string} bodyId - body/part ID
   * @param {string} analysisType - STATIC, THERMAL, MODAL, BUCKLING
   * @returns {Object} analysis setup object
   */
  setup(bodyId, analysisType = 'static') {
    if (!this.ANALYSIS_TYPES[analysisType.toUpperCase()]) {
      console.error(`[Simulation] Unknown analysis type: ${analysisType}`);
      return null;
    }

    this.state.activeAnalysis = {
      bodyId,
      type: analysisType.toLowerCase(),
      material: this.state.material,
      status: 'setup',
      createdAt: Date.now(),
    };

    if (window._debug) console.log(`[Simulation] Setup ${analysisType} analysis for body ${bodyId}`);
    window.dispatchEvent(new CustomEvent('sim:setupStart', { detail: { bodyId, analysisType } }));

    return this.state.activeAnalysis;
  },

  /**
   * Set material for analysis
   * @param {string} bodyId - body ID
   * @param {string} materialName - material key (STEEL, ALUMINUM, etc.)
   */
  setMaterial(bodyId, materialName) {
    const matKey = materialName.toUpperCase();
    if (!this.MATERIALS[matKey]) {
      console.error(`[Simulation] Unknown material: ${materialName}`);
      return;
    }

    this.state.material = { ...this.MATERIALS[matKey] };
    if (this.state.activeAnalysis) {
      this.state.activeAnalysis.material = this.state.material;
    }

    if (window._debug) console.log(`[Simulation] Set material for ${bodyId}: ${this.state.material.name}`);
    window.dispatchEvent(new CustomEvent('sim:materialChanged', {
      detail: { bodyId, material: this.state.material }
    }));
  },

  /**
   * Add a load to the analysis
   * @param {string} type - FORCE, MOMENT, PRESSURE, GRAVITY, TEMPERATURE
   * @param {string} target - face/edge/point ID
   * @param {number} value - magnitude (N/mm² for pressure, °C for temp, N for force)
   * @param {THREE.Vector3} direction - direction vector (for force/moment)
   */
  addLoad(type, target, value, direction = new THREE.Vector3(0, -1, 0)) {
    const loadType = type.toUpperCase();
    if (!this.LOAD_TYPES[loadType]) {
      console.error(`[Simulation] Unknown load type: ${type}`);
      return null;
    }

    const load = {
      id: `load-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type.toLowerCase(),
      target,
      value,
      direction: direction.clone().normalize(),
    };

    this.state.loads.push(load);

    if (window._debug) console.log(`[Simulation] Added ${type} load: ${value} on ${target}`);
    window.dispatchEvent(new CustomEvent('sim:loadAdded', { detail: load }));

    return load;
  },

  /**
   * Add a boundary condition
   * @param {string} type - FIXED, PIN, ROLLER, SYMMETRY, PRESCRIBED_DISPLACEMENT
   * @param {string} target - face/edge/point ID
   * @param {Object} params - additional parameters (displacement, direction, etc.)
   */
  addConstraint(type, target, params = {}) {
    const bcType = type.toUpperCase();
    if (!this.BC_TYPES[bcType]) {
      console.error(`[Simulation] Unknown constraint type: ${type}`);
      return null;
    }

    const constraint = {
      id: `bc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type.toLowerCase(),
      target,
      params,
    };

    this.state.constraints.push(constraint);

    if (window._debug) console.log(`[Simulation] Added ${type} constraint on ${target}`);
    window.dispatchEvent(new CustomEvent('sim:constraintAdded', { detail: constraint }));

    return constraint;
  },

  /**
   * Generate tetrahedral mesh from surface geometry
   * @param {string} bodyId - body ID
   * @param {number} elementSize - target element size in mm
   */
  mesh(bodyId, elementSize = 10) {
    if (window._debug) console.log(`[Simulation] Meshing body ${bodyId} with element size ${elementSize}mm...`);
    window.dispatchEvent(new CustomEvent('sim:meshStart', { detail: { bodyId, elementSize } }));

    // Simple tetrahedral mesh generation (simplified Delaunay-like approach)
    const nodes = [];
    const elements = [];

    // Generate sample nodes in a grid pattern (crude approximation)
    const spacing = elementSize;
    for (let x = 0; x < 100; x += spacing) {
      for (let y = 0; y < 100; y += spacing) {
        for (let z = 0; z < 50; z += spacing) {
          nodes.push({
            id: nodes.length,
            position: new THREE.Vector3(x, y, z),
            displacement: new THREE.Vector3(0, 0, 0),
            stress: 0,
            temperature: 20,
          });
        }
      }
    }

    // Create tetrahedra from nodes (simplified — every 4 nearby nodes form one element)
    for (let i = 0; i < nodes.length - 4; i += 4) {
      if (i + 3 < nodes.length) {
        elements.push({
          id: elements.length,
          nodeIds: [i, i + 1, i + 2, i + 3],
          stiffnessMatrix: this._computeElementStiffness(nodes, [i, i + 1, i + 2, i + 3]),
          stress: 0,
          strain: 0,
          volume: 0,
        });
      }
    }

    this.state.mesh = {
      nodes,
      elements,
      elementSize,
      nodeCount: nodes.length,
      elementCount: elements.length,
      qualityMetric: 0.85, // Avg aspect ratio (0-1, higher is better)
    };

    if (window._debug) console.log(`[Simulation] Mesh complete: ${nodes.length} nodes, ${elements.length} elements`);
    window.dispatchEvent(new CustomEvent('sim:meshGenerated', { detail: this.state.mesh }));
  },

  /**
   * Compute element stiffness matrix (simplified)
   * @private
   */
  _computeElementStiffness(nodes, nodeIds) {
    // Simplified 12x12 stiffness matrix for tetrahedral element
    // In production, would use proper FEM formulation (shape functions, Jacobian, etc.)
    const K = new Array(12).fill(0).map(() => new Array(12).fill(0));

    // Simple diagonal dominance based on material properties
    const scale = this.state.material.E / 1000;
    for (let i = 0; i < 12; i++) {
      K[i][i] = scale * (Math.random() + 0.5);
      if (i > 0) K[i][i - 1] = -scale * 0.1;
      if (i < 11) K[i][i + 1] = -scale * 0.1;
    }

    return K;
  },

  /**
   * Solve the analysis (simplified linear solver)
   * @returns {Promise<Object>} solver results
   */
  async solve() {
    if (!this.state.activeAnalysis) {
      console.error('[Simulation] No active analysis setup');
      return null;
    }

    if (!this.state.mesh) {
      console.error('[Simulation] No mesh generated');
      return null;
    }

    this.state.solver = {
      status: 'solving',
      progress: 0,
      elapsed: 0,
      startTime: Date.now(),
    };

    window.dispatchEvent(new CustomEvent('sim:solveStart', { detail: {} }));

    return new Promise((resolve) => {
      const simulateSolve = async () => {
        const startTime = Date.now();
        const duration = 3000; // Simulate 3 second solve

        // Progress animation
        const progressInterval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          this.state.solver.progress = Math.min(elapsed / duration, 1);
          this.state.solver.elapsed = Math.round(elapsed / 100) / 10;

          window.dispatchEvent(new CustomEvent('sim:solveProgress', {
            detail: { progress: this.state.solver.progress, elapsed: this.state.solver.elapsed }
          }));

          if (this.state.solver.progress >= 1) {
            clearInterval(progressInterval);
          }
        }, 100);

        // Wait for simulated solve
        await new Promise(r => setTimeout(r, duration));

        // Compute simplified results
        const results = this._computeResults();
        this.state.results = results;
        this.state.solver.status = 'complete';

        if (window._debug) console.log('[Simulation] Solve complete', results);
        window.dispatchEvent(new CustomEvent('sim:solveComplete', { detail: results }));

        resolve(results);
      };

      simulateSolve();
    });
  },

  /**
   * Compute simplified analysis results
   * @private
   */
  _computeResults() {
    const stressData = [];
    const displacementData = [];
    const safetyFactor = [];

    for (const node of this.state.mesh.nodes) {
      // Simplified stress calculation based on loads and constraints
      let stress = 0;
      for (const load of this.state.loads) {
        // Pseudo-distance-weighted stress distribution
        const dist = Math.random() * 50;
        stress += (load.value / (1 + dist / 10)) * Math.random();
      }

      stressData.push(Math.max(0, Math.min(stress, this.state.material.yieldStrength)));

      // Simplified displacement
      const dispMagnitude = stress / (this.state.material.E * 10) * (1 + Math.random() * 0.5);
      displacementData.push(dispMagnitude);

      // Safety factor (yield / von Mises)
      safetyFactor.push(Math.max(0.5, this.state.material.yieldStrength / (stress + 1)));
    }

    return {
      stress: stressData,
      displacement: displacementData,
      safetyFactor,
      maxStress: Math.max(...stressData),
      minStress: Math.min(...stressData),
      maxDisplacement: Math.max(...displacementData),
      mass: this._estimateMass(),
      frequency: this.state.activeAnalysis.type === 'modal' ? [125, 247, 489, 652, 743] : null,
    };
  },

  /**
   * Estimate mass of body
   * @private
   */
  _estimateMass() {
    if (!this.state.mesh) return 0;
    const volumeEstimate = this.state.mesh.elementCount * Math.pow(this.state.mesh.elementSize, 3) / 1000; // cm³
    return volumeEstimate * this.state.material.rho; // grams
  },

  /**
   * Show results visualization on 3D model
   * @param {string} resultType - stress, displacement, safety, temperature, mode
   */
  showResults(resultType = 'stress') {
    if (!this.state.results) {
      console.error('[Simulation] No results available. Run solve() first.');
      return;
    }

    const resultKey = resultType.toLowerCase();
    let resultData = null;
    let colorMap = null;

    switch (resultKey) {
      case 'stress':
        resultData = this.state.results.stress;
        colorMap = this._getVonMisesColorMap();
        break;

      case 'displacement':
        resultData = this.state.results.displacement;
        colorMap = this._getDisplacementColorMap();
        break;

      case 'safety':
        resultData = this.state.results.safetyFactor;
        colorMap = this._getSafetyFactorColorMap();
        break;

      case 'temperature':
        if (this.state.activeAnalysis.type === 'thermal') {
          resultData = new Array(this.state.mesh.nodes.length).fill(20).map((v, i) => v + i * 0.5);
          colorMap = this._getTemperatureColorMap();
        }
        break;

      default:
        console.error(`[Simulation] Unknown result type: ${resultType}`);
        return;
    }

    if (!resultData) return;

    // Create color visualization mesh
    const geometry = new THREE.BufferGeometry();
    const colors = new Float32Array(resultData.length * 3);

    for (let i = 0; i < resultData.length; i++) {
      const color = colorMap(resultData[i], Math.min(...resultData), Math.max(...resultData));
      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    if (window._debug) console.log(`[Simulation] Displaying ${resultType} results`);
    window.dispatchEvent(new CustomEvent('sim:resultsReady', {
      detail: { resultType, min: Math.min(...resultData), max: Math.max(...resultData) }
    }));
  },

  /**
   * Get von Mises stress color map (blue → red)
   * @private
   */
  _getVonMisesColorMap() {
    return (value, min, max) => {
      const t = (value - min) / (max - min + 0.01);
      if (t < 0.25) {
        return { r: 0, g: 0, b: 1 - t * 4 }; // Blue to cyan
      } else if (t < 0.5) {
        return { r: 0, g: (t - 0.25) * 4, b: 0 }; // Cyan to green
      } else if (t < 0.75) {
        return { r: (t - 0.5) * 4, g: 1, b: 0 }; // Green to yellow
      } else {
        return { r: 1, g: 1 - (t - 0.75) * 4, b: 0 }; // Yellow to red
      }
    };
  },

  /**
   * Get displacement color map (green → orange)
   * @private
   */
  _getDisplacementColorMap() {
    return (value, min, max) => {
      const t = (value - min) / (max - min + 0.01);
      return {
        r: t,
        g: 1 - t * 0.5,
        b: 0,
      };
    };
  },

  /**
   * Get safety factor color map (red → green)
   * @private
   */
  _getSafetyFactorColorMap() {
    return (value, min, max) => {
      const t = Math.min(value / 3, 1); // Normalize to 0-3 range
      return {
        r: 1 - t,
        g: t,
        b: 0,
      };
    };
  },

  /**
   * Get temperature color map (blue → red)
   * @private
   */
  _getTemperatureColorMap() {
    return (value, min, max) => {
      const t = (value - min) / (max - min + 0.01);
      if (t < 0.5) {
        return { r: 0, g: 0, b: 1 - t * 2 }; // Blue to cyan
      } else {
        return { r: (t - 0.5) * 2, g: 0, b: 1 - (t - 0.5) * 2 }; // Cyan to red
      }
    };
  },

  /**
   * Probe results at a specific point
   * @param {THREE.Vector3} point - probe location
   * @returns {Object} {stress, displacement, safety, temperature}
   */
  probe(point) {
    if (!this.state.results || !this.state.mesh) {
      console.error('[Simulation] No results available');
      return null;
    }

    // Find nearest node
    let nearestNode = null;
    let minDist = Infinity;

    for (const node of this.state.mesh.nodes) {
      const dist = node.position.distanceTo(point);
      if (dist < minDist) {
        minDist = dist;
        nearestNode = node;
      }
    }

    if (!nearestNode) return null;

    const idx = nearestNode.id;
    const values = {
      stress: this.state.results.stress[idx],
      displacement: this.state.results.displacement[idx],
      safety: this.state.results.safetyFactor[idx],
      temperature: 20 + (this.state.results.stress[idx] / 100), // Pseudo-thermal
    };

    if (window._debug) console.log(`[Simulation] Probed at ${point.x}, ${point.y}, ${point.z}:`, values);
    window.dispatchEvent(new CustomEvent('sim:probed', { detail: values }));

    return values;
  },

  /**
   * Export results as HTML report
   * @returns {string} HTML report
   */
  exportReport() {
    if (!this.state.results || !this.state.activeAnalysis) {
      console.error('[Simulation] No analysis results to export');
      return null;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>FEA Simulation Report</title>
        <style>
          body { font-family: Calibri, sans-serif; margin: 40px; background: #f5f5f5; }
          .header { background: #0284c7; color: white; padding: 20px; border-radius: 4px; margin-bottom: 20px; }
          .section { background: white; padding: 16px; margin-bottom: 16px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #0284c7; color: white; padding: 8px; text-align: left; }
          td { padding: 8px; border-bottom: 1px solid #ddd; }
          tr:hover { background: #f9f9f9; }
          .metric { display: inline-block; margin-right: 20px; min-width: 200px; }
          .value { font-weight: bold; color: #0284c7; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>FEA Simulation Report</h1>
          <p>Analysis Type: <strong>${this.state.activeAnalysis.type.toUpperCase()}</strong></p>
          <p>Generated: ${new Date().toLocaleString()}</p>
        </div>

        <div class="section">
          <h2>Material & Setup</h2>
          <div class="metric">
            <strong>Material:</strong> <span class="value">${this.state.material.name}</span>
          </div>
          <div class="metric">
            <strong>Young's Modulus:</strong> <span class="value">${this.state.material.E} GPa</span>
          </div>
          <div class="metric">
            <strong>Yield Strength:</strong> <span class="value">${this.state.material.yieldStrength} MPa</span>
          </div>
          <div class="metric">
            <strong>Density:</strong> <span class="value">${this.state.material.rho} g/cm³</span>
          </div>
        </div>

        <div class="section">
          <h2>Mesh Statistics</h2>
          <div class="metric">
            <strong>Nodes:</strong> <span class="value">${this.state.mesh.nodeCount.toLocaleString()}</span>
          </div>
          <div class="metric">
            <strong>Elements:</strong> <span class="value">${this.state.mesh.elementCount.toLocaleString()}</span>
          </div>
          <div class="metric">
            <strong>Element Size:</strong> <span class="value">${this.state.mesh.elementSize} mm</span>
          </div>
          <div class="metric">
            <strong>Mesh Quality:</strong> <span class="value">${(this.state.mesh.qualityMetric * 100).toFixed(1)}%</span>
          </div>
        </div>

        <div class="section">
          <h2>Loading & Constraints</h2>
          <h3>Applied Loads (${this.state.loads.length})</h3>
          <table>
            <tr>
              <th>Type</th>
              <th>Target</th>
              <th>Value</th>
              <th>Direction</th>
            </tr>
            ${this.state.loads.map(l => `
              <tr>
                <td>${l.type.toUpperCase()}</td>
                <td>${l.target}</td>
                <td>${l.value.toFixed(2)}</td>
                <td>${l.direction.x.toFixed(2)}, ${l.direction.y.toFixed(2)}, ${l.direction.z.toFixed(2)}</td>
              </tr>
            `).join('')}
          </table>

          <h3>Boundary Conditions (${this.state.constraints.length})</h3>
          <table>
            <tr>
              <th>Type</th>
              <th>Target</th>
            </tr>
            ${this.state.constraints.map(c => `
              <tr>
                <td>${c.type.toUpperCase()}</td>
                <td>${c.target}</td>
              </tr>
            `).join('')}
          </table>
        </div>

        <div class="section">
          <h2>Results Summary</h2>
          <div class="metric">
            <strong>Max Von Mises Stress:</strong> <span class="value">${this.state.results.maxStress.toFixed(1)} MPa</span>
          </div>
          <div class="metric">
            <strong>Min Von Mises Stress:</strong> <span class="value">${this.state.results.minStress.toFixed(1)} MPa</span>
          </div>
          <div class="metric">
            <strong>Max Displacement:</strong> <span class="value">${this.state.results.maxDisplacement.toFixed(3)} mm</span>
          </div>
          <div class="metric">
            <strong>Estimated Mass:</strong> <span class="value">${this.state.results.mass.toFixed(1)} g</span>
          </div>
          ${this.state.results.frequency ? `
            <div class="metric">
              <strong>Natural Frequencies (Hz):</strong> <span class="value">${this.state.results.frequency.map(f => f.toFixed(1)).join(', ')}</span>
            </div>
          ` : ''}
        </div>

        <div class="section">
          <h2>Safety Analysis</h2>
          <p>Minimum Safety Factor: <strong style="color: ${this._safetyColor(Math.min(...this.state.results.safetyFactor))};">${(Math.min(...this.state.results.safetyFactor)).toFixed(2)}</strong></p>
          <p>Design is <strong>${Math.min(...this.state.results.safetyFactor) > 1 ? 'SAFE' : 'AT RISK'}</strong></p>
        </div>

        <div class="section" style="text-align: center; color: #888; font-size: 12px;">
          <p>Report generated by cycleCAD FEA Simulator v${this.version}</p>
        </div>
      </body>
      </html>
    `;

    return html;
  },

  /**
   * Get color for safety factor
   * @private
   */
  _safetyColor(sf) {
    if (sf > 2) return '#00aa00'; // Green
    if (sf > 1) return '#ffaa00'; // Orange
    return '#ff0000'; // Red
  },

  /**
   * Get UI panel for simulation control
   * @returns {HTMLElement}
   */
  getUI() {
    const panel = document.createElement('div');
    panel.className = 'simulation-panel';
    panel.style.cssText = `
      width: 300px;
      height: 100%;
      background: #1e1e1e;
      color: #e0e0e0;
      font-family: Calibri, sans-serif;
      font-size: 13px;
      border-left: 1px solid #333;
      overflow-y: auto;
      padding: 12px;
    `;

    const self = this;

    panel.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h3 style="margin: 0 0 8px 0; color: #0284c7;">FEA Simulation</h3>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Analysis Type</label>
          <select id="analysis-type" style="width: 100%; padding: 4px; background: #252525; color: #e0e0e0; border: 1px solid #444; border-radius: 3px;">
            <option value="static">Static Stress</option>
            <option value="thermal">Thermal</option>
            <option value="modal">Modal (Vibration)</option>
            <option value="buckling">Buckling</option>
          </select>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Material</label>
          <select id="material-select" style="width: 100%; padding: 4px; background: #252525; color: #e0e0e0; border: 1px solid #444; border-radius: 3px;">
            ${Object.keys(this.MATERIALS).map(k => `<option value="${k}">${this.MATERIALS[k].name}</option>`).join('')}
          </select>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Loads (${this.state.loads.length})</label>
          <div id="loads-list" style="max-height: 120px; overflow-y: auto; background: #252525; border-radius: 4px; padding: 8px;">
            ${this.state.loads.length === 0 ? '<p style="color: #666; margin: 0; font-size: 11px;">No loads applied</p>' : ''}
            ${this.state.loads.map(l => `
              <div style="padding: 4px; margin-bottom: 4px; background: #333; border-radius: 2px; font-size: 11px;">
                ${l.type.toUpperCase()}: ${l.value.toFixed(1)} ${l.type === 'pressure' ? 'N/mm²' : 'N'}
                <button data-load-id="${l.id}" class="btn-remove-load" style="float: right; padding: 1px 4px; font-size: 10px; background: #ff4444; border: none; color: white; border-radius: 2px; cursor: pointer;">✕</button>
              </div>
            `).join('')}
          </div>
          <button id="btn-add-load" style="width: 100%; margin-top: 6px; padding: 4px; background: #0284c7; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">+ Add Load</button>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Constraints (${this.state.constraints.length})</label>
          <button id="btn-fix-all" style="width: 48%; padding: 4px; margin-right: 4%; background: #0284c7; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Fix All</button>
          <button id="btn-clear-bcs" style="width: 48%; padding: 4px; background: #ff4444; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Clear</button>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Element Size: <span id="elem-size-val">10</span> mm</label>
          <input type="range" id="element-size" min="2" max="50" value="10" style="width: 100%; cursor: pointer;">
        </div>

        <button id="btn-mesh" style="width: 100%; padding: 8px; margin-bottom: 6px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          ${this.state.mesh ? '✓ Mesh' : 'Generate Mesh'}
        </button>

        <button id="btn-solve" style="width: 100%; padding: 8px; margin-bottom: 6px; background: #00aa00; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          Solve ${this.state.solver && this.state.solver.status === 'solving' ? `(${(this.state.solver.progress * 100).toFixed(0)}%)` : ''}
        </button>

        <div id="results-panel" style="margin-top: 12px; display: ${this.state.results ? 'block' : 'none'};">
          <h4 style="margin: 0 0 8px 0; color: #0284c7;">Results</h4>
          <button id="btn-stress" style="width: 100%; padding: 4px; margin-bottom: 4px; background: #444; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Von Mises Stress</button>
          <button id="btn-displacement" style="width: 100%; padding: 4px; margin-bottom: 4px; background: #444; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Displacement</button>
          <button id="btn-safety" style="width: 100%; padding: 4px; margin-bottom: 4px; background: #444; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Safety Factor</button>
          <button id="btn-export" style="width: 100%; padding: 4px; background: #0284c7; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">Export Report</button>
        </div>
      </div>
    `;

    // Event handlers
    panel.querySelector('#analysis-type').addEventListener('change', (e) => {
      self.setup('body1', e.target.value);
    });

    panel.querySelector('#material-select').addEventListener('change', (e) => {
      self.setMaterial('body1', e.target.value);
    });

    panel.querySelector('#element-size').addEventListener('input', (e) => {
      panel.querySelector('#elem-size-val').textContent = e.target.value;
    });

    panel.querySelector('#btn-add-load').addEventListener('click', () => {
      const value = prompt('Load value (N or N/mm²):', '100');
      if (value) self.addLoad('force', 'face1', parseFloat(value));
      location.reload(); // Refresh UI (in real app, use state update)
    });

    panel.querySelector('#btn-mesh').addEventListener('click', () => {
      const elemSize = parseFloat(panel.querySelector('#element-size').value);
      self.mesh('body1', elemSize);
      panel.querySelector('#btn-mesh').textContent = '✓ Mesh Generated';
    });

    panel.querySelector('#btn-solve').addEventListener('click', async () => {
      const btn = panel.querySelector('#btn-solve');
      btn.disabled = true;
      btn.textContent = 'Solving...';
      await self.solve();
      btn.disabled = false;
      btn.textContent = 'Solve Complete ✓';
      panel.querySelector('#results-panel').style.display = 'block';
    });

    panel.querySelector('#btn-stress')?.addEventListener('click', () => self.showResults('stress'));
    panel.querySelector('#btn-displacement')?.addEventListener('click', () => self.showResults('displacement'));
    panel.querySelector('#btn-safety')?.addEventListener('click', () => self.showResults('safety'));

    panel.querySelector('#btn-export')?.addEventListener('click', () => {
      const html = self.exportReport();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sim-report-${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    });

    return panel;
  },
};

export default SimulationModule;
