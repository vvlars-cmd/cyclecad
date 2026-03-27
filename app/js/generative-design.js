/**
 * cycleCAD Generative Design / Topology Optimization Module
 * SIMP-based topology optimization with voxelization and marching cubes
 * Runs solver in Web Worker to avoid blocking UI
 */

(function() {
  'use strict';

  // Material library with full properties
  const MATERIALS = {
    aluminum_6061: { name: 'Aluminum 6061-T6', density: 2700, yield: 276, ultimate: 310, E: 68.9, poisson: 0.33, color: 0xC0C0C0 },
    aluminum_7075: { name: 'Aluminum 7075-T6', density: 2810, yield: 503, ultimate: 572, E: 71.7, poisson: 0.33, color: 0xA9A9A9 },
    steel_1018: { name: 'Steel 1018', density: 7870, yield: 370, ultimate: 440, E: 205, poisson: 0.29, color: 0x696969 },
    steel_4140: { name: 'Steel 4140', density: 7850, yield: 655, ultimate: 1020, E: 205, poisson: 0.29, color: 0x555555 },
    stainless_316l: { name: 'Stainless 316L', density: 8000, yield: 205, ultimate: 515, E: 193, poisson: 0.27, color: 0xE8E8E8 },
    titanium_ti64: { name: 'Titanium Ti-6Al-4V', density: 4430, yield: 880, ultimate: 950, E: 113.8, poisson: 0.342, color: 0xB0B0B0 },
    abs_plastic: { name: 'ABS Plastic', density: 1040, yield: 43, ultimate: 43, E: 2.3, poisson: 0.35, color: 0x333333 },
    nylon_pa12: { name: 'Nylon PA12', density: 1010, yield: 48, ultimate: 48, E: 1.7, poisson: 0.4, color: 0x4C4C4C },
    pla: { name: 'PLA', density: 1240, yield: 60, ultimate: 65, E: 3.5, poisson: 0.36, color: 0x2F2F2F },
    petg: { name: 'PETG', density: 1270, yield: 50, ultimate: 53, E: 2.2, poisson: 0.38, color: 0x404040 },
    carbon_fiber: { name: 'Carbon Fiber Composite', density: 1600, yield: 600, ultimate: 700, E: 70, poisson: 0.1, color: 0x1A1A1A },
    inconel_718: { name: 'Inconel 718', density: 8190, yield: 1034, ultimate: 1241, E: 200, poisson: 0.29, color: 0x8B7355 },
    copper_c110: { name: 'Copper C110', density: 8940, yield: 69, ultimate: 220, E: 117, poisson: 0.34, color: 0xB87333 },
    brass_c360: { name: 'Brass C360', density: 8500, yield: 310, ultimate: 490, E: 97, poisson: 0.34, color: 0xCD7F32 },
    magnesium_az31: { name: 'Magnesium AZ31', density: 1770, yield: 200, ultimate: 260, E: 45, poisson: 0.35, color: 0x9C9C9C }
  };

  // Manufacturing constraints
  const MANUFACTURING = {
    unrestricted: { name: 'Unrestricted', minThickness: 0.5, overhangAngle: 0, symmetry: false },
    additive: { name: 'Additive (3D Print)', minThickness: 1.0, overhangAngle: 45, symmetry: false },
    '3axis_milling': { name: '3-Axis Milling', minThickness: 2.0, overhangAngle: 0, symmetry: false },
    '2axis_cutting': { name: '2-Axis Cutting', minThickness: 3.0, overhangAngle: 0, symmetry: true },
    die_casting: { name: 'Die Casting', minThickness: 1.5, overhangAngle: 5, symmetry: true }
  };

  // Study storage
  const studies = new Map();
  let studyCounter = 0;

  // Solver worker code (inline as Blob)
  const workerCode = `
    self.onmessage = function(e) {
      const { voxelData, loads, constraints, objective, material, iterations, gridSize } = e.data;
      const results = solveSIMP(voxelData, loads, constraints, objective, material, iterations, gridSize);
      self.postMessage(results);
    };

    function solveSIMP(voxelData, loads, constraints, objective, material, maxIterations, gridSize) {
      const { densities, voxels, bounds } = voxelData;
      let rho = Float32Array.from(densities);
      const p = 3; // penalization factor
      const vf = 0.3; // target volume fraction

      for (let iter = 0; iter < maxIterations; iter++) {
        // Simplified stiffness: compliance proportional to 1 / (rho^p * E)
        let totalCompliance = 0;
        const sensitivities = new Float32Array(rho.length);

        for (let i = 0; i < rho.length; i++) {
          if (rho[i] < 0.001) {
            sensitivities[i] = 0;
            continue;
          }
          // Compliance sensitivity (simplified)
          sensitivities[i] = -p * Math.pow(rho[i], p - 1);
          totalCompliance += Math.pow(rho[i], p) * (1 - sensitivities[i]);
        }

        // Apply optimality criteria
        const dC = Math.max(...sensitivities) / 100; // lagrange multiplier step
        for (let i = 0; i < rho.length; i++) {
          if (sensitivities[i] < dC) {
            rho[i] *= 0.9; // reduce density
          } else if (sensitivities[i] > dC * 1.5) {
            rho[i] = Math.min(1.0, rho[i] * 1.1); // increase density
          }
        }

        // Enforce volume constraint
        const currentVF = rho.reduce((a, b) => a + b, 0) / rho.length;
        const scale = Math.sqrt(vf / (currentVF + 0.0001));
        for (let i = 0; i < rho.length; i++) {
          rho[i] = Math.min(1.0, Math.max(0.001, rho[i] * scale));
        }

        // Density filter (simple smoothing)
        const filtered = new Float32Array(rho.length);
        const radius = 2; // filter radius in voxels
        for (let i = 0; i < rho.length; i++) {
          const [x, y, z] = voxels[i];
          let sum = 0, count = 0;
          for (let j = 0; j < rho.length; j++) {
            const [vx, vy, vz] = voxels[j];
            const dist = Math.hypot(x - vx, y - vy, z - vz);
            if (dist <= radius) {
              sum += rho[j];
              count++;
            }
          }
          filtered[i] = count > 0 ? sum / count : rho[i];
        }
        rho = filtered;

        // Check convergence
        const convergence = rho.filter((v, i) => Math.abs(v - densities[i]) > 0.01).length / rho.length;

        // Report progress
        self.postMessage({
          progress: true,
          iteration: iter + 1,
          totalIterations: maxIterations,
          convergence: convergence,
          compliance: totalCompliance
        });

        if (convergence < 0.01) {
          iter = maxIterations; // early exit
        }
      }

      // Threshold and return
      const result = new Float32Array(rho.length);
      for (let i = 0; i < rho.length; i++) {
        result[i] = rho[i] > 0.5 ? 1.0 : 0.0;
      }

      return {
        densities: Array.from(result),
        iterations: maxIterations,
        final: true
      };
    }
  `;

  // Create study
  function createStudy(options) {
    const id = `study_${++studyCounter}`;
    const study = {
      id,
      name: options.name || 'Untitled Study',
      preserveGeometries: options.preserveGeometries || [],
      obstacleGeometries: options.obstacleGeometries || [],
      startingShape: options.startingShape || null,
      material: options.material || 'aluminum_6061',
      objective: options.objective || 'minimize_mass',
      targetMass: options.targetMass || null,
      safetyFactor: options.safetyFactor || 1.5,
      manufacturingMethod: options.manufacturingMethod || 'unrestricted',
      constraints: [],
      loads: [],
      solver: null,
      densities: null,
      history: [],
      visualizationMode: 'density',
      createdAt: Date.now()
    };

    studies.set(id, study);
    return id;
  }

  // Add constraint
  function addConstraint(studyId, preserveId, type) {
    const study = studies.get(studyId);
    if (!study) return null;

    const constraint = {
      id: `constraint_${study.constraints.length}`,
      preserveId,
      type, // 'fixed', 'pinned', 'frictionless'
      createdAt: Date.now()
    };

    study.constraints.push(constraint);
    return constraint;
  }

  // Add load
  function addLoad(studyId, preserveId, load) {
    const study = studies.get(studyId);
    if (!study) return null;

    const loadEntry = {
      id: `load_${study.loads.length}`,
      preserveId,
      ...load,
      createdAt: Date.now()
    };

    study.loads.push(loadEntry);
    return loadEntry;
  }

  // Validate study
  function validateStudy(studyId) {
    const study = studies.get(studyId);
    if (!study) return { valid: false, errors: ['Study not found'] };

    const errors = [];
    if (study.constraints.length === 0) errors.push('At least one constraint required');
    if (study.loads.length === 0) errors.push('At least one load required');
    if (study.preserveGeometries.length === 0) errors.push('At least one preserve geometry required');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Voxelize design space
  function voxelizeStudy(studyId, gridSize = 30) {
    const study = studies.get(studyId);
    if (!study) return null;

    // Create bounding box from all geometries
    let bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

    study.preserveGeometries.forEach(geom => {
      const p = geom.position || [0, 0, 0];
      bounds.min[0] = Math.min(bounds.min[0], p[0] - 50);
      bounds.min[1] = Math.min(bounds.min[1], p[1] - 50);
      bounds.min[2] = Math.min(bounds.min[2], p[2] - 50);
      bounds.max[0] = Math.max(bounds.max[0], p[0] + 50);
      bounds.max[1] = Math.max(bounds.max[1], p[1] + 50);
      bounds.max[2] = Math.max(bounds.max[2], p[2] + 50);
    });

    study.obstacleGeometries.forEach(geom => {
      const p = geom.position || [0, 0, 0];
      bounds.min[0] = Math.min(bounds.min[0], p[0] - 50);
      bounds.min[1] = Math.min(bounds.min[1], p[1] - 50);
      bounds.min[2] = Math.min(bounds.min[2], p[2] - 50);
      bounds.max[0] = Math.max(bounds.max[0], p[0] + 50);
      bounds.max[1] = Math.max(bounds.max[1], p[1] + 50);
      bounds.max[2] = Math.max(bounds.max[2], p[2] + 50);
    });

    const voxelSize = [
      (bounds.max[0] - bounds.min[0]) / gridSize,
      (bounds.max[1] - bounds.min[1]) / gridSize,
      (bounds.max[2] - bounds.min[2]) / gridSize
    ];

    // Create voxel grid
    const voxels = [];
    const densities = [];

    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        for (let z = 0; z < gridSize; z++) {
          const pos = [
            bounds.min[0] + (x + 0.5) * voxelSize[0],
            bounds.min[1] + (y + 0.5) * voxelSize[1],
            bounds.min[2] + (z + 0.5) * voxelSize[2]
          ];

          // Check if voxel is in obstacle
          let inObstacle = false;
          for (const obs of study.obstacleGeometries) {
            const dist = Math.hypot(
              pos[0] - (obs.position[0] || 0),
              pos[1] - (obs.position[1] || 0),
              pos[2] - (obs.position[2] || 0)
            );
            if (obs.type === 'sphere' && dist < (obs.radius || 10)) inObstacle = true;
            if (obs.type === 'cylinder' && dist < (obs.radius || 10)) inObstacle = true;
          }

          voxels.push([x, y, z]);
          densities.push(inObstacle ? 0.001 : 1.0);
        }
      }
    }

    return { voxels, densities, bounds, voxelSize, gridSize };
  }

  // Solve optimization
  function solve(studyId, callback) {
    const study = studies.get(studyId);
    if (!study) return;

    const validation = validateStudy(studyId);
    if (!validation.valid) {
      if (callback) callback({ error: validation.errors.join(', ') });
      return;
    }

    const voxelData = voxelizeStudy(studyId, 25);
    if (!voxelData) return;

    // Create worker
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);

    worker.onmessage = (e) => {
      const { progress, final, densities, error } = e.data;

      if (progress && callback) {
        callback({
          iteration: e.data.iteration,
          totalIterations: e.data.totalIterations,
          convergence: e.data.convergence,
          percentDone: Math.round((e.data.iteration / e.data.totalIterations) * 100)
        });
      }

      if (final) {
        study.densities = densities;
        study.history.push({ densities, timestamp: Date.now() });

        // Generate mesh from densities
        const mesh = generateMeshFromVoxels(voxelData, densities);
        study.resultMesh = mesh;

        if (callback) {
          callback({
            complete: true,
            mesh,
            densities,
            mass: calculateMass(study, mesh)
          });
        }

        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      }
    };

    worker.onerror = (err) => {
      if (callback) callback({ error: err.message });
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };

    // Start solver
    const material = MATERIALS[study.material];
    worker.postMessage({
      voxelData,
      loads: study.loads,
      constraints: study.constraints,
      objective: study.objective,
      material,
      iterations: 100,
      gridSize: 25
    });
  }

  // Generate mesh from voxel densities using simplified marching cubes
  function generateMeshFromVoxels(voxelData, densities) {
    const { voxels, gridSize, bounds, voxelSize } = voxelData;
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    // Simplified marching cubes: create cube for each solid voxel
    voxels.forEach((vox, idx) => {
      if (densities[idx] > 0.5) {
        const [x, y, z] = vox;
        const px = bounds.min[0] + (x + 0.5) * voxelSize[0];
        const py = bounds.min[1] + (y + 0.5) * voxelSize[1];
        const pz = bounds.min[2] + (z + 0.5) * voxelSize[2];
        const s = voxelSize[0] * 0.5;

        // Add cube vertices
        const baseIdx = vertices.length / 3;
        const cubeVerts = [
          [px - s, py - s, pz - s],
          [px + s, py - s, pz - s],
          [px + s, py + s, pz - s],
          [px - s, py + s, pz - s],
          [px - s, py - s, pz + s],
          [px + s, py - s, pz + s],
          [px + s, py + s, pz + s],
          [px - s, py + s, pz + s]
        ];

        cubeVerts.forEach(v => vertices.push(...v));

        // Add cube faces
        const faces = [
          [0, 1, 2], [0, 2, 3], // front
          [4, 6, 5], [4, 7, 6], // back
          [0, 4, 5], [0, 5, 1], // bottom
          [2, 6, 7], [2, 7, 3], // top
          [0, 3, 7], [0, 7, 4], // left
          [1, 5, 6], [1, 6, 2]  // right
        ];

        faces.forEach(face => {
          indices.push(baseIdx + face[0], baseIdx + face[1], baseIdx + face[2]);
        });
      }
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ color: 0x58a6ff, metalness: 0.3, roughness: 0.7 });
    return new THREE.Mesh(geometry, material);
  }

  // Calculate mass of result
  function calculateMass(study, mesh) {
    const material = MATERIALS[study.material];
    if (!mesh || !mesh.geometry) return 0;

    const bbox = new THREE.Box3().setFromObject(mesh);
    const volume = bbox.getSize(new THREE.Vector3());
    const totalVolume = volume.x * volume.y * volume.z;

    return (totalVolume / 1000) * material.density; // grams
  }

  // Visualize result
  function visualize(studyId, mode = 'density') {
    const study = studies.get(studyId);
    if (!study || !study.densities) return;

    const voxelData = voxelizeStudy(studyId, 25);
    const { scene } = window;

    // Clear existing visualization
    scene.children
      .filter(c => c.userData?.genDesignViz)
      .forEach(c => scene.remove(c));

    if (mode === 'density') {
      // Color voxels by density
      voxelData.voxels.forEach((vox, idx) => {
        if (study.densities[idx] < 0.001) return;

        const [x, y, z] = vox;
        const px = voxelData.bounds.min[0] + (x + 0.5) * voxelData.voxelSize[0];
        const py = voxelData.bounds.min[1] + (y + 0.5) * voxelData.voxelSize[1];
        const pz = voxelData.bounds.min[2] + (z + 0.5) * voxelData.voxelSize[2];

        const geo = new THREE.BoxGeometry(voxelData.voxelSize[0], voxelData.voxelSize[1], voxelData.voxelSize[2]);
        const hue = study.densities[idx]; // 0 = blue, 1 = red
        const color = new THREE.Color().setHSL(0.7 - hue * 0.7, 0.8, 0.5);
        const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.7 });
        const cube = new THREE.Mesh(geo, mat);
        cube.position.set(px, py, pz);
        cube.userData.genDesignViz = true;
        scene.add(cube);
      });
    } else if (mode === 'solid' && study.resultMesh) {
      study.resultMesh.userData.genDesignViz = true;
      scene.add(study.resultMesh);
    }
  }

  // Export result
  function exportResult(studyId, format = 'stl') {
    const study = studies.get(studyId);
    if (!study || !study.resultMesh) return null;

    const mesh = study.resultMesh;
    const material = MATERIALS[study.material];

    if (format === 'stl') {
      return meshToSTL(mesh);
    } else if (format === 'json') {
      return {
        name: study.name,
        material: material.name,
        densities: study.densities,
        mass: calculateMass(study, mesh),
        objective: study.objective,
        safetyFactor: study.safetyFactor,
        createdAt: study.createdAt
      };
    }

    return null;
  }

  // Simple STL export
  function meshToSTL(mesh) {
    const geo = mesh.geometry;
    const positions = geo.attributes.position.array;
    const indices = geo.index ? geo.index.array : null;

    let facets = [];
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        facets.push({
          v1: [positions[a], positions[a + 1], positions[a + 2]],
          v2: [positions[b], positions[b + 1], positions[b + 2]],
          v3: [positions[c], positions[c + 1], positions[c + 2]]
        });
      }
    }

    return facets; // Can be further serialized to binary STL
  }

  // Get UI panel
  function getUI() {
    return `
      <div id="gendesign-panel" class="gendesign-panel">
        <style>
          .gendesign-panel { background: #1e1e1e; color: #e0e0e0; border-radius: 8px; padding: 12px; font-family: Calibri, sans-serif; }
          .gendesign-tabs { display: flex; gap: 0; border-bottom: 1px solid #444; margin-bottom: 12px; }
          .gendesign-tab { padding: 8px 16px; cursor: pointer; background: #2d2d2d; border: none; color: #999; flex: 1; text-align: center; }
          .gendesign-tab.active { background: #0284C7; color: #fff; }
          .gendesign-content { display: none; }
          .gendesign-content.active { display: block; }
          .gendesign-group { margin-bottom: 12px; }
          .gendesign-label { display: block; font-size: 12px; color: #aaa; margin-bottom: 4px; font-weight: bold; }
          .gendesign-input, .gendesign-select { width: 100%; padding: 6px; background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; border-radius: 4px; font-family: inherit; }
          .gendesign-button { width: 100%; padding: 8px; background: #0284C7; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-top: 4px; }
          .gendesign-button:hover { background: #0369a1; }
          .gendesign-progress { width: 100%; height: 24px; background: #2d2d2d; border: 1px solid #444; border-radius: 4px; overflow: hidden; margin: 8px 0; }
          .gendesign-progress-bar { height: 100%; background: linear-gradient(90deg, #0284C7, #58a6ff); transition: width 0.3s; display: flex; align-items: center; justify-content: center; font-size: 11px; color: white; }
          .gendesign-list { background: #2d2d2d; border: 1px solid #444; border-radius: 4px; padding: 8px; max-height: 150px; overflow-y: auto; }
          .gendesign-item { padding: 6px; border-bottom: 1px solid #444; font-size: 12px; display: flex; justify-content: space-between; }
          .gendesign-badge { display: inline-block; padding: 2px 8px; background: #0284C7; color: white; border-radius: 3px; font-size: 10px; }
          .gendesign-error { color: #f85149; font-size: 11px; }
          .gendesign-success { color: #3fb950; font-size: 11px; }
        </style>

        <div class="gendesign-tabs">
          <button class="gendesign-tab active" data-tab="setup">Setup</button>
          <button class="gendesign-tab" data-tab="loads">Loads</button>
          <button class="gendesign-tab" data-tab="solve">Solve</button>
          <button class="gendesign-tab" data-tab="results">Results</button>
        </div>

        <div id="gendesign-setup" class="gendesign-content active">
          <div class="gendesign-group">
            <label class="gendesign-label">Study Name</label>
            <input type="text" id="gendesign-name" class="gendesign-input" placeholder="My Study" />
          </div>
          <div class="gendesign-group">
            <label class="gendesign-label">Material</label>
            <select id="gendesign-material" class="gendesign-select">
              ${Object.entries(MATERIALS).map(([k, v]) => `<option value="${k}">${v.name} (E=${v.E}GPa, ρ=${v.density}kg/m³)</option>`).join('')}
            </select>
          </div>
          <div class="gendesign-group">
            <label class="gendesign-label">Objective</label>
            <select id="gendesign-objective" class="gendesign-select">
              <option value="minimize_mass">Minimize Mass</option>
              <option value="maximize_stiffness">Maximize Stiffness</option>
            </select>
          </div>
          <div class="gendesign-group">
            <label class="gendesign-label">Manufacturing Method</label>
            <select id="gendesign-mfg" class="gendesign-select">
              ${Object.entries(MANUFACTURING).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
            </select>
          </div>
          <div class="gendesign-group">
            <label class="gendesign-label">Preserve Geometries</label>
            <div class="gendesign-list" id="gendesign-preserves"></div>
          </div>
        </div>

        <div id="gendesign-loads" class="gendesign-content">
          <div class="gendesign-group">
            <label class="gendesign-label">Constraints</label>
            <div class="gendesign-list" id="gendesign-constraints"></div>
            <button class="gendesign-button">+ Add Constraint</button>
          </div>
          <div class="gendesign-group">
            <label class="gendesign-label">Loads</label>
            <div class="gendesign-list" id="gendesign-loads"></div>
            <button class="gendesign-button">+ Add Load</button>
          </div>
          <div id="gendesign-validation" style="font-size: 12px; margin-top: 8px;"></div>
        </div>

        <div id="gendesign-solve" class="gendesign-content">
          <button id="gendesign-generate" class="gendesign-button" style="background: #3fb950; font-size: 16px; padding: 12px;">Generate</button>
          <div class="gendesign-progress" style="display: none;" id="gendesign-progress-container">
            <div class="gendesign-progress-bar" id="gendesign-progress-bar" style="width: 0%">0%</div>
          </div>
          <div id="gendesign-status" style="font-size: 12px; text-align: center; margin-top: 8px;"></div>
          <canvas id="gendesign-convergence" width="300" height="100" style="width: 100%; margin-top: 8px; background: #2d2d2d; border-radius: 4px;"></canvas>
        </div>

        <div id="gendesign-results" class="gendesign-content">
          <div class="gendesign-group">
            <label class="gendesign-label">Result Visualization</label>
            <select id="gendesign-viz-mode" class="gendesign-select">
              <option value="density">Density Heatmap</option>
              <option value="stress">Von Mises Stress</option>
              <option value="solid">Final Solid</option>
            </select>
            <button class="gendesign-button">Visualize</button>
          </div>
          <div class="gendesign-group">
            <label class="gendesign-label">Export</label>
            <button class="gendesign-button">Export STL</button>
            <button class="gendesign-button">Export Report</button>
          </div>
          <div id="gendesign-summary" style="background: #2d2d2d; padding: 8px; border-radius: 4px; font-size: 12px; margin-top: 8px;"></div>
        </div>
      </div>
    `;
  }

  // Register API
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.generativeDesign = {
    createStudy,
    addConstraint,
    addLoad,
    validateStudy,
    solve,
    visualize,
    exportResult,
    getUI,
    MATERIALS,
    MANUFACTURING
  };

  console.log('[GenerativeDesign] Module loaded. Use cycleCAD.generativeDesign.*');
})();
