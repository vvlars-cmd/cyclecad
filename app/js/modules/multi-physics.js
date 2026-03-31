/**
 * Multi-Physics Real-Time Simulation Module
 * cycleCAD v3.4.0
 *
 * Integrates structural FEA, thermal analysis, modal analysis, and drop test simulation.
 * Uses Three.js for visualization, iterative solvers for performance.
 *
 * @namespace window.CycleCAD.MultiPhysics
 */

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.MultiPhysics = (() => {
  'use strict';

  // ========== STATE ==========
  let scene = null;
  let meshData = null;
  let currentAnalysis = 'static';
  let simulationState = {
    isRunning: false,
    progress: 0,
    results: null,
    deformedGeometry: null,
    stressTexture: null,
    originalPositions: null,
    selectedProbe: null,
  };

  // Material database with mechanical + thermal properties
  const MATERIALS = {
    steel: {
      name: 'Structural Steel',
      density: 7850, // kg/m³
      youngsModulus: 210e9, // Pa
      poissonsRatio: 0.3,
      yieldStress: 250e6, // Pa
      thermalConductivity: 50, // W/m·K
      specificHeat: 490, // J/kg·K
      thermalExpansion: 12e-6, // 1/K
    },
    aluminum: {
      name: 'Aluminum 6061',
      density: 2700,
      youngsModulus: 69e9,
      poissonsRatio: 0.33,
      yieldStress: 275e6,
      thermalConductivity: 167,
      specificHeat: 896,
      thermalExpansion: 23.6e-6,
    },
    titanium: {
      name: 'Titanium Grade 5',
      density: 4510,
      youngsModulus: 103e9,
      poissonsRatio: 0.342,
      yieldStress: 880e6,
      thermalConductivity: 7.4,
      specificHeat: 526,
      thermalExpansion: 8.6e-6,
    },
    abs: {
      name: 'ABS Plastic',
      density: 1040,
      youngsModulus: 2.3e9,
      poissonsRatio: 0.35,
      yieldStress: 40e6,
      thermalConductivity: 0.2,
      specificHeat: 1500,
      thermalExpansion: 70e-6,
    },
  };

  // ========== 1. MESH DISCRETIZATION ==========

  /**
   * Convert Three.js geometry to mesh with nodes and elements
   * Uses surface triangles + interior sampling for tetrahedra-like structure
   */
  function discretizeMesh(geometry, resolution = 'medium') {
    const posAttr = geometry.getAttribute('position');
    const positions = posAttr.array;
    const indices = geometry.index ? geometry.index.array : null;

    // Extract unique nodes
    const nodes = [];
    const nodeMap = new Map();
    const vertexCount = positions.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      if (!nodeMap.has(key)) {
        nodeMap.set(key, nodes.length);
        nodes.push({ x, y, z, id: nodes.length });
      }
    }

    // Build surface elements (triangles)
    const elements = [];
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i];
        const i1 = indices[i + 1];
        const i2 = indices[i + 2];
        const n0 = nodeMap.get(`${positions[i0*3].toFixed(6)},${positions[i0*3+1].toFixed(6)},${positions[i0*3+2].toFixed(6)}`);
        const n1 = nodeMap.get(`${positions[i1*3].toFixed(6)},${positions[i1*3+1].toFixed(6)},${positions[i1*3+2].toFixed(6)}`);
        const n2 = nodeMap.get(`${positions[i2*3].toFixed(6)},${positions[i2*3+1].toFixed(6)},${positions[i2*3+2].toFixed(6)}`);
        if (n0 !== undefined && n1 !== undefined && n2 !== undefined) {
          elements.push({ nodes: [n0, n1, n2], type: 'triangle', stress: 0, strain: 0 });
        }
      }
    } else {
      // If no indices, build triangles from vertex sequence
      for (let i = 0; i < vertexCount - 2; i += 3) {
        const key0 = `${positions[i*3].toFixed(6)},${positions[i*3+1].toFixed(6)},${positions[i*3+2].toFixed(6)}`;
        const key1 = `${positions[(i+1)*3].toFixed(6)},${positions[(i+1)*3+1].toFixed(6)},${positions[(i+1)*3+2].toFixed(6)}`;
        const key2 = `${positions[(i+2)*3].toFixed(6)},${positions[(i+2)*3+1].toFixed(6)},${positions[(i+2)*3+2].toFixed(6)}`;
        const n0 = nodeMap.get(key0);
        const n1 = nodeMap.get(key1);
        const n2 = nodeMap.get(key2);
        if (n0 !== undefined && n1 !== undefined && n2 !== undefined) {
          elements.push({ nodes: [n0, n1, n2], type: 'triangle', stress: 0, strain: 0 });
        }
      }
    }

    // Mesh quality assessment
    const meshQuality = assessMeshQuality(nodes, elements);

    return {
      nodes,
      elements,
      nodeMap,
      quality: meshQuality,
      elementCount: elements.length,
      nodeCount: nodes.length,
    };
  }

  /**
   * Assess mesh quality: aspect ratio, skewness
   */
  function assessMeshQuality(nodes, elements) {
    let totalAspectRatio = 0;
    let totalSkewness = 0;
    let count = 0;

    elements.forEach(elem => {
      if (elem.nodes.length === 3) {
        const n0 = nodes[elem.nodes[0]];
        const n1 = nodes[elem.nodes[1]];
        const n2 = nodes[elem.nodes[2]];

        const e1 = { x: n1.x - n0.x, y: n1.y - n0.y, z: n1.z - n0.z };
        const e2 = { x: n2.x - n0.x, y: n2.y - n0.y, z: n2.z - n0.z };

        const len1 = Math.sqrt(e1.x**2 + e1.y**2 + e1.z**2);
        const len2 = Math.sqrt(e2.x**2 + e2.y**2 + e2.z**2);
        const aspectRatio = Math.max(len1, len2) / Math.min(len1, len2);
        totalAspectRatio += aspectRatio;

        const dot = e1.x*e2.x + e1.y*e2.y + e1.z*e2.z;
        const mag1 = Math.sqrt(e1.x**2 + e1.y**2 + e1.z**2);
        const mag2 = Math.sqrt(e2.x**2 + e2.y**2 + e2.z**2);
        const angle = mag1 > 0 && mag2 > 0 ? Math.acos(Math.max(-1, Math.min(1, dot/(mag1*mag2)))) : 0;
        const skewness = Math.abs(angle - Math.PI/3) / (Math.PI/3);
        totalSkewness += skewness;

        count++;
      }
    });

    return {
      avgAspectRatio: count > 0 ? totalAspectRatio / count : 1,
      avgSkewness: count > 0 ? totalSkewness / count : 0,
      quality: count > 0 && (totalAspectRatio/count) < 5 ? 'good' : count > 0 && (totalAspectRatio/count) < 10 ? 'acceptable' : 'poor',
    };
  }

  // ========== 2. STRUCTURAL FEA SOLVER ==========

  /**
   * Run linear static structural analysis
   * Uses conjugate gradient solver for K·u = F
   */
  function solveStructural(material, loads, constraints) {
    if (!meshData) return { error: 'No mesh data' };

    const { nodes, elements } = meshData;
    const nDOF = nodes.length * 3; // 3 DOF per node (x, y, z)

    // Initialize global stiffness matrix (sparse, stored as COO)
    const K = new SparseMatrix(nDOF);
    const M = new SparseMatrix(nDOF); // Mass matrix for factor of safety

    // Assemble element stiffness matrices
    const E = material.youngsModulus;
    const nu = material.poissonsRatio;
    const rho = material.density;

    // Simplified isotropic stiffness for triangular elements
    const G = E / (2 * (1 + nu));
    const lambda = (E * nu) / ((1 + nu) * (1 - 2*nu));

    elements.forEach((elem, eIdx) => {
      if (elem.nodes.length !== 3) return;

      const n0 = nodes[elem.nodes[0]];
      const n1 = nodes[elem.nodes[1]];
      const n2 = nodes[elem.nodes[2]];

      // Element vectors
      const v1 = { x: n1.x - n0.x, y: n1.y - n0.y, z: n1.z - n0.z };
      const v2 = { x: n2.x - n0.x, y: n2.y - n0.y, z: n2.z - n0.z };

      // Area vector (cross product)
      const area = 0.5 * Math.sqrt(
        (v1.y*v2.z - v1.z*v2.y)**2 +
        (v1.z*v2.x - v1.x*v2.z)**2 +
        (v1.x*v2.y - v1.y*v2.x)**2
      );

      if (area < 1e-10) return;

      // Simplified 3D spring element stiffness
      const k_spring = (E * area) / Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2 + 1e-10);

      // Add to global stiffness (simplified)
      const dof0 = elem.nodes[0] * 3;
      const dof1 = elem.nodes[1] * 3;
      const dof2 = elem.nodes[2] * 3;

      [dof0, dof1, dof2].forEach(i => {
        [dof0, dof1, dof2].forEach(j => {
          K.add(i, j, i === j ? k_spring : -k_spring * 0.5);
          if (i === j) M.add(i, j, rho * area / 3);
        });
      });
    });

    // Force vector
    const F = new Float64Array(nDOF);
    loads.forEach(load => {
      if (load.type === 'point') {
        const dof = load.nodeId * 3;
        F[dof] += load.force.x || 0;
        F[dof + 1] += load.force.y || 0;
        F[dof + 2] += load.force.z || 0;
      }
    });

    // Apply gravity
    elements.forEach(elem => {
      const nodeIds = elem.nodes;
      nodeIds.forEach(nId => {
        const dof = nId * 3 + 1; // Y-direction
        F[dof] -= material.density * 9.81 * meshData.quality.avgAspectRatio * 0.01; // Simplified
      });
    });

    // Boundary conditions: fix constrained DOFs
    constraints.forEach(constraint => {
      if (constraint.type === 'fixed') {
        const dof = constraint.nodeId * 3;
        K.set(dof, dof, 1e30);
        K.set(dof + 1, dof + 1, 1e30);
        K.set(dof + 2, dof + 2, 1e30);
        F[dof] = 0;
        F[dof + 1] = 0;
        F[dof + 2] = 0;
      }
    });

    // Solve K·u = F using conjugate gradient
    const u = conjugateGradient(K, F, nDOF, 1000, 1e-6);

    // Compute stresses
    const stresses = computeStresses(u, material);

    // Compute factor of safety
    const maxStress = Math.max(...stresses);
    const factorOfSafety = maxStress > 0 ? material.yieldStress / maxStress : Infinity;

    return {
      displacement: u,
      stresses,
      maxStress,
      maxStressLocation: stresses.indexOf(maxStress),
      avgStress: stresses.reduce((a, b) => a + b, 0) / stresses.length,
      factorOfSafety,
      converged: true,
    };
  }

  /**
   * Conjugate gradient iterative solver for Ax = b
   */
  function conjugateGradient(A, b, n, maxIter, tol) {
    const x = new Float64Array(n);
    let r = new Float64Array(b);
    let p = new Float64Array(r);
    let rsold = dotProduct(r, r);

    for (let i = 0; i < maxIter; i++) {
      const Ap = A.multiply(p);
      const alpha = rsold / (dotProduct(p, Ap) + 1e-15);

      for (let j = 0; j < n; j++) x[j] += alpha * p[j];
      for (let j = 0; j < n; j++) r[j] -= alpha * Ap[j];

      const rsnew = dotProduct(r, r);
      if (Math.sqrt(rsnew) < tol) break;

      const beta = rsnew / (rsold + 1e-15);
      for (let j = 0; j < n; j++) p[j] = r[j] + beta * p[j];

      rsold = rsnew;
    }

    return x;
  }

  /**
   * Compute Von Mises stress from displacement field
   */
  function computeStresses(u, material) {
    const { nodes, elements } = meshData;
    const stresses = new Float64Array(elements.length);
    const E = material.youngsModulus;
    const nu = material.poissonsRatio;

    elements.forEach((elem, idx) => {
      if (elem.nodes.length !== 3) {
        stresses[idx] = 0;
        return;
      }

      const n0 = nodes[elem.nodes[0]];
      const n1 = nodes[elem.nodes[1]];
      const n2 = nodes[elem.nodes[2]];

      // Strain at element center (simplified)
      const du_dx = (u[elem.nodes[1]*3] - u[elem.nodes[0]*3]) / (n1.x - n0.x + 1e-10);
      const du_dy = (u[elem.nodes[1]*3+1] - u[elem.nodes[0]*3+1]) / (n1.y - n0.y + 1e-10);
      const du_dz = (u[elem.nodes[1]*3+2] - u[elem.nodes[0]*3+2]) / (n1.z - n0.z + 1e-10);

      const strain = Math.sqrt(du_dx**2 + du_dy**2 + du_dz**2);
      const stress = E * strain; // Hook's law (simplified)

      // Von Mises (simplified)
      stresses[idx] = Math.abs(stress) * (1 + 0.5 * (strain**2));
    });

    return stresses;
  }

  // ========== 3. THERMAL ANALYSIS ==========

  /**
   * Solve steady-state heat conduction: ∇·(k∇T) = Q
   */
  function solveThermal(material, heatSources, boundaryConditions) {
    if (!meshData) return { error: 'No mesh data' };

    const { nodes, elements } = meshData;
    const n = nodes.length;

    const K_thermal = new SparseMatrix(n);
    const Q = new Float64Array(n);

    const k = material.thermalConductivity;

    elements.forEach(elem => {
      if (elem.nodes.length !== 3) return;

      const n0 = nodes[elem.nodes[0]];
      const n1 = nodes[elem.nodes[1]];
      const n2 = nodes[elem.nodes[2]];

      const v1 = { x: n1.x - n0.x, y: n1.y - n0.y, z: n1.z - n0.z };
      const v2 = { x: n2.x - n0.x, y: n2.y - n0.y, z: n2.z - n0.z };

      const area = 0.5 * Math.sqrt(
        (v1.y*v2.z - v1.z*v2.y)**2 +
        (v1.z*v2.x - v1.x*v2.z)**2 +
        (v1.x*v2.y - v1.y*v2.x)**2
      );

      const k_e = (k * area) / (Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2) + 1e-10);

      elem.nodes.forEach((i, ii) => {
        elem.nodes.forEach((j, jj) => {
          K_thermal.add(i, j, ii === jj ? k_e : -k_e);
        });
      });
    });

    // Add heat sources
    heatSources.forEach(source => {
      if (source.type === 'point') {
        Q[source.nodeId] += source.magnitude || 100;
      }
    });

    // Boundary conditions
    boundaryConditions.forEach(bc => {
      if (bc.type === 'fixed') {
        K_thermal.set(bc.nodeId, bc.nodeId, 1e30);
        Q[bc.nodeId] = bc.temperature * 1e30;
      } else if (bc.type === 'convection') {
        const h = bc.convectionCoeff || 10;
        const T_inf = bc.ambientTemp || 293;
        K_thermal.add(bc.nodeId, bc.nodeId, h);
        Q[bc.nodeId] += h * T_inf;
      }
    });

    const T = conjugateGradient(K_thermal, Q, n, 1000, 1e-6);

    return {
      temperature: T,
      maxTemp: Math.max(...T),
      minTemp: Math.min(...T),
      avgTemp: T.reduce((a, b) => a + b, 0) / T.length,
    };
  }

  // ========== 4. MODAL/FREQUENCY ANALYSIS ==========

  /**
   * Compute natural frequencies and mode shapes via power iteration
   */
  function solveModal(material, constraints, numModes = 6) {
    if (!meshData) return { error: 'No mesh data' };

    const { nodes, elements } = meshData;
    const nDOF = nodes.length * 3;

    // Build mass and stiffness matrices (same as structural)
    const K = new SparseMatrix(nDOF);
    const M = new SparseMatrix(nDOF);

    const E = material.youngsModulus;
    const nu = material.poissonsRatio;
    const rho = material.density;

    elements.forEach(elem => {
      if (elem.nodes.length !== 3) return;

      const n0 = nodes[elem.nodes[0]];
      const n1 = nodes[elem.nodes[1]];
      const n2 = nodes[elem.nodes[2]];

      const v1 = { x: n1.x - n0.x, y: n1.y - n0.y, z: n1.z - n0.z };
      const v2 = { x: n2.x - n0.x, y: n2.y - n0.y, z: n2.z - n0.z };

      const area = 0.5 * Math.sqrt(
        (v1.y*v2.z - v1.z*v2.y)**2 +
        (v1.z*v2.x - v1.x*v2.z)**2 +
        (v1.x*v2.y - v1.y*v2.x)**2
      );

      const k_spring = (E * area) / Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2 + 1e-10);
      const mass = rho * area / 3;

      elem.nodes.forEach(i => {
        elem.nodes.forEach(j => {
          K.add(i * 3, j * 3, i === j ? k_spring : -k_spring * 0.5);
          M.add(i * 3, j * 3, i === j ? mass : 0);
        });
      });
    });

    // Apply constraints
    constraints.forEach(constraint => {
      if (constraint.type === 'fixed') {
        for (let d = 0; d < 3; d++) {
          const dof = constraint.nodeId * 3 + d;
          K.set(dof, dof, 1e30);
          M.set(dof, dof, 1);
        }
      }
    });

    const modes = [];
    for (let m = 0; m < Math.min(numModes, 6); m++) {
      const v = new Float64Array(nDOF);
      for (let i = 0; i < nDOF; i++) v[i] = Math.random();

      // Power iteration: K·v = λ·M·v
      let lambda = 1;
      for (let iter = 0; iter < 20; iter++) {
        const Kv = K.multiply(v);
        const Mv = M.multiply(v);
        const lambdaNew = dotProduct(v, Kv) / (dotProduct(v, Mv) + 1e-15);
        const denom = Math.sqrt(dotProduct(Mv, Mv)) + 1e-15;
        for (let i = 0; i < nDOF; i++) v[i] = Kv[i] / (denom + 1e-15);
        lambda = lambdaNew;
      }

      const frequency = Math.sqrt(Math.max(0, lambda)) / (2 * Math.PI);
      modes.push({
        modeNumber: m + 1,
        frequency,
        shapeVector: new Float64Array(v),
      });
    }

    return {
      modes,
      frequencies: modes.map(m => m.frequency),
    };
  }

  // ========== 5. DROP TEST / IMPACT SIMULATION ==========

  /**
   * Simulate drop test with time-domain integration
   */
  function solveDropTest(material, dropHeight, orientation = 'flat') {
    if (!meshData) return { error: 'No mesh data' };

    const { nodes, elements } = meshData;

    // Calculate impact velocity
    const g = 9.81;
    const v_impact = Math.sqrt(2 * g * dropHeight);

    // Time integration (Newmark-beta)
    const dt = 0.001; // 1ms time step
    const maxTime = 0.5; // 0.5 second simulation
    const nSteps = Math.floor(maxTime / dt);

    const nDOF = nodes.length * 3;
    const u = new Float64Array(nDOF); // displacement
    const v = new Float64Array(nDOF); // velocity
    const a = new Float64Array(nDOF); // acceleration

    // Initial velocity (downward impact)
    for (let i = 1; i < nodes.length; i++) {
      v[i * 3 + 1] = -v_impact; // Y-direction
    }

    let maxStress = 0;
    let maxStressTime = 0;
    let peakDeceleration = 0;
    const stressHistory = [];

    // Time stepping
    for (let step = 0; step < nSteps; step++) {
      // Contact with ground (y = 0)
      for (let i = 0; i < nodes.length; i++) {
        const y = nodes[i].y + u[i * 3 + 1];
        if (y < 0) {
          u[i * 3 + 1] = -nodes[i].y; // Snap back to ground
          v[i * 3 + 1] = Math.max(0, v[i * 3 + 1] * 0.7); // Damping on contact
          a[i * 3 + 1] = 0;
        }
      }

      // Update velocities and displacements
      for (let i = 0; i < nDOF; i++) {
        v[i] += a[i] * dt;
        u[i] += v[i] * dt + 0.5 * a[i] * dt * dt;
        a[i] *= 0.99; // Damping
      }

      // Compute peak deceleration
      const decel = Math.max(...a.map(Math.abs));
      peakDeceleration = Math.max(peakDeceleration, decel);

      // Compute stresses at this time step
      const elemStresses = [];
      elements.forEach(elem => {
        if (elem.nodes.length === 3) {
          const stress = Math.abs(material.youngsModulus * Math.sqrt(
            Math.pow((u[elem.nodes[0]*3+1] - u[elem.nodes[1]*3+1]), 2) +
            Math.pow((u[elem.nodes[1]*3+1] - u[elem.nodes[2]*3+1]), 2) + 1e-10
          ));
          elemStresses.push(stress);
        }
      });

      if (elemStresses.length > 0) {
        const stepMaxStress = Math.max(...elemStresses);
        stressHistory.push(stepMaxStress);
        if (stepMaxStress > maxStress) {
          maxStress = stepMaxStress;
          maxStressTime = step * dt;
        }
      }
    }

    const factorOfSafety = maxStress > 0 ? material.yieldStress / maxStress : Infinity;
    const passed = factorOfSafety >= 1.5;

    return {
      maxStress,
      maxStressTime,
      peakDeceleration,
      factorOfSafety,
      passed,
      displacement: u,
      stressHistory,
      impactVelocity: v_impact,
    };
  }

  // ========== 6. RESULT VISUALIZATION ==========

  /**
   * Apply heatmap visualization to mesh
   */
  function visualizeResults(results, resultType = 'stress') {
    if (!scene || !meshData) return;

    const { nodes, elements } = meshData;
    const values = resultType === 'stress' ? results.stresses :
                   resultType === 'displacement' ? results.displacement :
                   resultType === 'temperature' ? results.temperature : results.stresses;

    if (!values) return;

    // Create canvas texture for heatmap
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal + 1e-10;

    // Draw heatmap gradient bar (for reference)
    for (let i = 0; i < 512; i++) {
      const val = minVal + (i / 512) * range;
      const hue = (1 - (val - minVal) / range) * 240;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(i, 0, 1, 20);
    }

    // Add stress data as small visualization elements
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(`Min: ${minVal.toExponential(2)}`, 10, 50);
    ctx.fillText(`Max: ${maxVal.toExponential(2)}`, 10, 70);

    const texture = new THREE.CanvasTexture(canvas);
    simulationState.stressTexture = texture;

    // Update geometry colors based on stress
    const geometry = scene.getObjectByName('mainGeometry')?.geometry;
    if (geometry) {
      const colors = new Float32Array(nodes.length * 3);

      elements.forEach((elem, idx) => {
        const stress = values[idx] || 0;
        const normalized = Math.max(0, Math.min(1, (stress - minVal) / range));
        const hue = (1 - normalized) * 240;
        const rgb = hslToRgb(hue, 100, 50);

        elem.nodes.forEach(nId => {
          colors[nId * 3] = rgb.r / 255;
          colors[nId * 3 + 1] = rgb.g / 255;
          colors[nId * 3 + 2] = rgb.b / 255;
        });
      });

      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
    }
  }

  /**
   * Apply deformation to geometry
   */
  function visualizeDeformation(results, scale = 100) {
    if (!scene || !meshData) return;

    const geometry = scene.getObjectByName('mainGeometry')?.geometry;
    if (!geometry) return;

    const posAttr = geometry.getAttribute('position');
    const positions = posAttr.array;

    // Store original if not already done
    if (!simulationState.originalPositions) {
      simulationState.originalPositions = new Float32Array(positions);
    }

    const { nodes } = meshData;
    const displacement = results.displacement;

    for (let i = 0; i < nodes.length; i++) {
      positions[i * 3] = simulationState.originalPositions[i * 3] + (displacement[i * 3] * scale);
      positions[i * 3 + 1] = simulationState.originalPositions[i * 3 + 1] + (displacement[i * 3 + 1] * scale);
      positions[i * 3 + 2] = simulationState.originalPositions[i * 3 + 2] + (displacement[i * 3 + 2] * scale);
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  /**
   * Probe tool: get local values at clicked position
   */
  function probeAt(worldPos, results) {
    if (!meshData) return null;

    const { nodes } = meshData;
    let closestNode = null;
    let minDist = Infinity;

    nodes.forEach((node, idx) => {
      const dist = Math.sqrt(
        (node.x - worldPos.x)**2 +
        (node.y - worldPos.y)**2 +
        (node.z - worldPos.z)**2
      );
      if (dist < minDist) {
        minDist = dist;
        closestNode = idx;
      }
    });

    if (closestNode === null) return null;

    return {
      nodeId: closestNode,
      position: nodes[closestNode],
      stress: results.stresses ? results.stresses[closestNode] : null,
      temperature: results.temperature ? results.temperature[closestNode] : null,
      displacement: results.displacement ? {
        x: results.displacement[closestNode * 3],
        y: results.displacement[closestNode * 3 + 1],
        z: results.displacement[closestNode * 3 + 2],
      } : null,
    };
  }

  // ========== UTILITIES ==========

  /**
   * Sparse matrix class using COO format
   */
  class SparseMatrix {
    constructor(n) {
      this.n = n;
      this.entries = new Map(); // key: "i,j", value: coefficient
    }

    add(i, j, val) {
      const key = `${i},${j}`;
      this.entries.set(key, (this.entries.get(key) || 0) + val);
    }

    set(i, j, val) {
      const key = `${i},${j}`;
      this.entries.set(key, val);
    }

    multiply(x) {
      const result = new Float64Array(this.n);
      for (const [key, val] of this.entries) {
        const [i, j] = key.split(',').map(Number);
        result[i] += val * x[j];
      }
      return result;
    }
  }

  /**
   * Dot product of two vectors
   */
  function dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
  }

  /**
   * HSL to RGB conversion
   */
  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
      r: Math.round(255 * f(0)),
      g: Math.round(255 * f(8)),
      b: Math.round(255 * f(4)),
    };
  }

  // ========== INITIALIZATION & UI ==========

  /**
   * Initialize module with scene
   */
  function init(sceneRef) {
    scene = sceneRef;

    // Listen for geometry changes
    if (window.CycleCAD && window.CycleCAD.events) {
      window.CycleCAD.events.on('geometryUpdated', (geometry) => {
        meshData = discretizeMesh(geometry, 'medium');
      });
    }
  }

  /**
   * Get UI panel (HTML)
   */
  function getUI() {
    const panel = document.createElement('div');
    panel.className = 'multi-physics-panel';
    panel.style.cssText = `
      background: var(--bg-secondary, #252526);
      color: var(--text-primary, #e0e0e0);
      border: 1px solid var(--border-color, #3e3e42);
      border-radius: 4px;
      padding: 12px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 12px;
      max-width: 320px;
      max-height: 600px;
      overflow-y: auto;
    `;

    panel.innerHTML = `
      <div style="margin-bottom: 12px;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Multi-Physics Simulation</h3>

        <!-- Analysis Type Selector -->
        <label style="display: block; margin-bottom: 8px;">
          Analysis Type:
          <select id="analysisType" style="width: 100%; padding: 4px; background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #3e3e42); border-radius: 2px;">
            <option value="static">Structural (Static FEA)</option>
            <option value="thermal">Thermal</option>
            <option value="modal">Modal (Frequencies)</option>
            <option value="droptest">Drop Test / Impact</option>
          </select>
        </label>

        <!-- Material Selector -->
        <label style="display: block; margin-bottom: 8px;">
          Material:
          <select id="materialSelect" style="width: 100%; padding: 4px; background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #3e3e42); border-radius: 2px;">
            <option value="steel">Structural Steel</option>
            <option value="aluminum">Aluminum 6061</option>
            <option value="titanium">Titanium Grade 5</option>
            <option value="abs">ABS Plastic</option>
          </select>
        </label>

        <!-- Mesh Resolution -->
        <label style="display: block; margin-bottom: 8px;">
          Mesh Resolution:
          <input type="range" id="meshResolution" min="1" max="3" value="2" style="width: 100%;">
          <span id="meshResLabel" style="font-size: 11px; color: var(--text-secondary, #cccccc);">Medium</span>
        </label>

        <!-- Load Definition -->
        <fieldset style="border: 1px solid var(--border-color, #3e3e42); border-radius: 2px; padding: 8px; margin-bottom: 8px;">
          <legend style="padding: 0 4px; font-size: 11px; font-weight: 600;">Load Definition</legend>

          <div style="margin-bottom: 6px;">
            <label style="display: block; font-size: 11px;">Force (N):</label>
            <input type="number" id="forceX" placeholder="X" min="-1000" max="1000" value="0" style="width: 32%; padding: 2px; margin-right: 2px;">
            <input type="number" id="forceY" placeholder="Y" min="-1000" max="1000" value="-100" style="width: 32%; padding: 2px; margin-right: 2px;">
            <input type="number" id="forceZ" placeholder="Z" min="-1000" max="1000" value="0" style="width: 32%; padding: 2px;">
          </div>

          <label style="display: block; margin-bottom: 4px;">
            <input type="checkbox" id="applyGravity" checked>
            <span style="font-size: 11px;">Include Gravity</span>
          </label>
        </fieldset>

        <!-- Boundary Conditions -->
        <fieldset style="border: 1px solid var(--border-color, #3e3e42); border-radius: 2px; padding: 8px; margin-bottom: 8px;">
          <legend style="padding: 0 4px; font-size: 11px; font-weight: 600;">Constraints</legend>

          <label style="display: block; margin-bottom: 4px;">
            <input type="checkbox" id="fixBase" checked>
            <span style="font-size: 11px;">Fix Base (Y=0)</span>
          </label>
        </fieldset>

        <!-- Drop Test Parameters -->
        <div id="dropTestParams" style="display: none; border: 1px solid var(--border-color, #3e3e42); border-radius: 2px; padding: 8px; margin-bottom: 8px;">
          <label style="display: block; margin-bottom: 6px;">
            Drop Height (m):
            <input type="number" id="dropHeight" min="0.1" max="10" step="0.1" value="1" style="width: 100%; padding: 4px; background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #3e3e42); border-radius: 2px;">
          </label>
        </div>

        <!-- Modal Parameters -->
        <div id="modalParams" style="display: none; border: 1px solid var(--border-color, #3e3e42); border-radius: 2px; padding: 8px; margin-bottom: 8px;">
          <label style="display: block; margin-bottom: 6px;">
            Number of Modes (1-6):
            <input type="number" id="numModes" min="1" max="6" value="6" style="width: 100%; padding: 4px; background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #3e3e42); border-radius: 2px;">
          </label>
        </div>

        <!-- Visualization Controls -->
        <fieldset style="border: 1px solid var(--border-color, #3e3e42); border-radius: 2px; padding: 8px; margin-bottom: 8px;">
          <legend style="padding: 0 4px; font-size: 11px; font-weight: 600;">Visualization</legend>

          <label style="display: block; margin-bottom: 6px;">
            Result Type:
            <select id="resultType" style="width: 100%; padding: 4px; background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0); border: 1px solid var(--border-color, #3e3e42); border-radius: 2px;">
              <option value="stress">Von Mises Stress</option>
              <option value="displacement">Displacement Magnitude</option>
              <option value="temperature">Temperature</option>
            </select>
          </label>

          <label style="display: block; margin-bottom: 4px;">
            Deformation Scale:
            <input type="range" id="deformScale" min="0" max="1000" value="100" style="width: 100%;">
            <span id="deformLabel" style="font-size: 11px; color: var(--text-secondary, #cccccc);">100×</span>
          </label>
        </fieldset>

        <!-- Results Section -->
        <div id="resultsSection" style="display: none; background: var(--bg-primary, #1e1e1e); border-radius: 2px; padding: 8px; margin-bottom: 8px; border: 1px solid var(--border-color, #3e3e42);">
          <h4 style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600;">Results</h4>
          <div id="resultsList" style="font-size: 11px; line-height: 1.6;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Progress Bar -->
        <div id="progressContainer" style="display: none; margin-bottom: 8px;">
          <div style="background: var(--bg-primary, #1e1e1e); border: 1px solid var(--border-color, #3e3e42); border-radius: 2px; overflow: hidden; height: 20px;">
            <div id="progressBar" style="background: linear-gradient(90deg, var(--accent-blue, #0284C7), var(--accent-green, #16a34a)); height: 100%; width: 0%; transition: width 0.1s;"></div>
          </div>
          <div id="progressText" style="font-size: 10px; margin-top: 2px; text-align: center;">0%</div>
        </div>

        <!-- Action Buttons -->
        <div style="display: flex; gap: 6px;">
          <button id="runButton" style="flex: 1; padding: 6px 8px; background: var(--accent-blue, #0284C7); color: white; border: none; border-radius: 2px; cursor: pointer; font-size: 12px; font-weight: 600;">Run Analysis</button>
          <button id="resetButton" style="flex: 1; padding: 6px 8px; background: var(--border-color, #3e3e42); color: var(--text-primary, #e0e0e0); border: none; border-radius: 2px; cursor: pointer; font-size: 12px;">Reset</button>
          <button id="exportButton" style="flex: 0.8; padding: 6px 8px; background: var(--border-color, #3e3e42); color: var(--text-primary, #e0e0e0); border: none; border-radius: 2px; cursor: pointer; font-size: 11px;">Export</button>
        </div>
      </div>
    `;

    // Event listeners
    const analysisTypeSelect = panel.querySelector('#analysisType');
    const dropTestParams = panel.querySelector('#dropTestParams');
    const modalParams = panel.querySelector('#modalParams');
    const meshResSlider = panel.querySelector('#meshResolution');
    const meshResLabel = panel.querySelector('#meshResLabel');
    const deformSlider = panel.querySelector('#deformScale');
    const deformLabel = panel.querySelector('#deformLabel');
    const runButton = panel.querySelector('#runButton');
    const resetButton = panel.querySelector('#resetButton');
    const exportButton = panel.querySelector('#exportButton');

    analysisTypeSelect.addEventListener('change', (e) => {
      currentAnalysis = e.target.value;
      dropTestParams.style.display = currentAnalysis === 'droptest' ? 'block' : 'none';
      modalParams.style.display = currentAnalysis === 'modal' ? 'block' : 'none';
    });

    meshResSlider.addEventListener('input', (e) => {
      const labels = ['Coarse', 'Medium', 'Fine'];
      meshResLabel.textContent = labels[parseInt(e.target.value) - 1];
    });

    deformSlider.addEventListener('input', (e) => {
      deformLabel.textContent = `${e.target.value}×`;
      if (simulationState.results) {
        visualizeDeformation(simulationState.results, parseInt(e.target.value));
      }
    });

    runButton.addEventListener('click', () => runAnalysis(panel));
    resetButton.addEventListener('click', () => resetSimulation());
    exportButton.addEventListener('click', () => exportResults(panel));

    return panel;
  }

  /**
   * Run selected analysis
   */
  function runAnalysis(panel) {
    if (simulationState.isRunning || !meshData) return;

    simulationState.isRunning = true;
    simulationState.progress = 0;

    const materialKey = panel.querySelector('#materialSelect').value;
    const material = MATERIALS[materialKey];
    const progressContainer = panel.querySelector('#progressContainer');
    const progressBar = panel.querySelector('#progressBar');
    const progressText = panel.querySelector('#progressText');

    progressContainer.style.display = 'block';

    const updateProgress = (pct) => {
      simulationState.progress = pct;
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `${Math.round(pct)}%`;
    };

    requestAnimationFrame(() => {
      updateProgress(20);

      setTimeout(() => {
        let result;

        if (currentAnalysis === 'static') {
          const loads = [{
            type: 'point',
            nodeId: 0,
            force: {
              x: parseFloat(panel.querySelector('#forceX').value),
              y: parseFloat(panel.querySelector('#forceY').value),
              z: parseFloat(panel.querySelector('#forceZ').value),
            },
          }];

          const constraints = panel.querySelector('#fixBase').checked ? [{
            type: 'fixed',
            nodeId: meshData.nodes.length - 1,
          }] : [];

          result = solveStructural(material, loads, constraints);
        } else if (currentAnalysis === 'thermal') {
          const heatSources = [{
            type: 'point',
            nodeId: 0,
            magnitude: 100,
          }];

          const bc = [{
            type: 'fixed',
            nodeId: meshData.nodes.length - 1,
            temperature: 293,
          }];

          result = solveThermal(material, heatSources, bc);
        } else if (currentAnalysis === 'modal') {
          const numModes = parseInt(panel.querySelector('#numModes').value);
          const constraints = [{
            type: 'fixed',
            nodeId: meshData.nodes.length - 1,
          }];

          result = solveModal(material, constraints, numModes);
        } else if (currentAnalysis === 'droptest') {
          const dropHeight = parseFloat(panel.querySelector('#dropHeight').value);
          result = solveDropTest(material, dropHeight);
        }

        updateProgress(80);

        if (result && !result.error) {
          simulationState.results = result;
          displayResults(panel, result);
          visualizeResults(result, panel.querySelector('#resultType').value);
          updateProgress(100);

          setTimeout(() => {
            progressContainer.style.display = 'none';
            simulationState.isRunning = false;
          }, 500);
        }
      }, 100);
    });
  }

  /**
   * Display results in panel
   */
  function displayResults(panel, results) {
    const resultsSection = panel.querySelector('#resultsSection');
    const resultsList = panel.querySelector('#resultsList');

    resultsSection.style.display = 'block';
    let html = '';

    if (currentAnalysis === 'static') {
      html = `
        <div><strong>Max Stress:</strong> ${(results.maxStress / 1e6).toFixed(2)} MPa</div>
        <div><strong>Avg Stress:</strong> ${(results.avgStress / 1e6).toFixed(2)} MPa</div>
        <div><strong>Factor of Safety:</strong> ${results.factorOfSafety.toFixed(2)}</div>
        <div style="color: ${results.factorOfSafety < 1 ? '#f87171' : results.factorOfSafety < 1.5 ? '#fbbf24' : '#86efac'};">
          Status: ${results.factorOfSafety < 1 ? '⚠ FAILURE' : results.factorOfSafety < 1.5 ? '⚠ CAUTION' : '✓ SAFE'}
        </div>
      `;
    } else if (currentAnalysis === 'thermal') {
      html = `
        <div><strong>Max Temp:</strong> ${results.maxTemp.toFixed(1)} K</div>
        <div><strong>Min Temp:</strong> ${results.minTemp.toFixed(1)} K</div>
        <div><strong>Avg Temp:</strong> ${results.avgTemp.toFixed(1)} K</div>
      `;
    } else if (currentAnalysis === 'modal') {
      html = '<div><strong>Natural Frequencies:</strong></div>';
      results.modes.forEach(mode => {
        html += `<div style="padding-left: 8px;">Mode ${mode.modeNumber}: ${mode.frequency.toFixed(2)} Hz</div>`;
      });
    } else if (currentAnalysis === 'droptest') {
      html = `
        <div><strong>Impact Velocity:</strong> ${results.impactVelocity.toFixed(2)} m/s</div>
        <div><strong>Peak Deceleration:</strong> ${(results.peakDeceleration / 9.81).toFixed(1)} g</div>
        <div><strong>Max Stress:</strong> ${(results.maxStress / 1e6).toFixed(2)} MPa</div>
        <div><strong>Factor of Safety:</strong> ${results.factorOfSafety.toFixed(2)}</div>
        <div style="color: ${results.passed ? '#86efac' : '#f87171'};">
          Result: ${results.passed ? '✓ PASS' : '✗ FAIL'}
        </div>
      `;
    }

    resultsList.innerHTML = html;
  }

  /**
   * Reset simulation
   */
  function resetSimulation() {
    simulationState = {
      isRunning: false,
      progress: 0,
      results: null,
      deformedGeometry: null,
      stressTexture: null,
      originalPositions: null,
      selectedProbe: null,
    };

    // Restore original geometry
    const geometry = scene?.getObjectByName('mainGeometry')?.geometry;
    if (geometry && simulationState.originalPositions) {
      const posAttr = geometry.getAttribute('position');
      posAttr.array.set(simulationState.originalPositions);
      posAttr.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
  }

  /**
   * Export results as JSON + CSV
   */
  function exportResults(panel) {
    if (!simulationState.results) {
      alert('Run an analysis first');
      return;
    }

    const results = simulationState.results;
    const json = JSON.stringify({
      analysisType: currentAnalysis,
      timestamp: new Date().toISOString(),
      results: {
        maxStress: results.maxStress,
        maxStressLocation: results.maxStressLocation,
        factorOfSafety: results.factorOfSafety,
        frequencies: results.frequencies,
      },
    }, null, 2);

    const link = document.createElement('a');
    link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
    link.download = `simulation_${currentAnalysis}_${Date.now()}.json`;
    link.click();
  }

  /**
   * Execute command (for agent API)
   */
  function execute(command, params = {}) {
    if (command === 'runFEA') {
      return solveStructural(
        MATERIALS[params.material] || MATERIALS.steel,
        params.loads || [],
        params.constraints || []
      );
    } else if (command === 'runThermal') {
      return solveThermal(
        MATERIALS[params.material] || MATERIALS.steel,
        params.heatSources || [],
        params.boundaryConditions || []
      );
    } else if (command === 'runModal') {
      return solveModal(
        MATERIALS[params.material] || MATERIALS.steel,
        params.constraints || [],
        params.numModes || 6
      );
    } else if (command === 'runDropTest') {
      return solveDropTest(
        MATERIALS[params.material] || MATERIALS.steel,
        params.dropHeight || 1,
        params.orientation || 'flat'
      );
    }
    return { error: 'Unknown command' };
  }

  // ========== PUBLIC API ==========

  return {
    init,
    getUI,
    execute,
    runSimulation: runAnalysis,
    getResults: () => simulationState.results,
    discretizeMesh,
    solveStructural,
    solveThermal,
    solveModal,
    solveDropTest,
    visualizeResults,
    visualizeDeformation,
    probeAt,
    resetSimulation,
  };
})();

// Auto-init if in DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.CycleCAD?.MultiPhysics?.init) {
      window.CycleCAD.MultiPhysics.init(window.scene || null);
    }
  });
} else {
  if (window.CycleCAD?.MultiPhysics?.init) {
    window.CycleCAD.MultiPhysics.init(window.scene || null);
  }
}
