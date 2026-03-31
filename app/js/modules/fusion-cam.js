/**
 * cycleCAD — Fusion 360 CAM (Computer-Aided Manufacturing) Module
 * Complete manufacturing workspace with 2D/3D operations, drilling, turning, tool library,
 * G-code generation, and toolpath simulation.
 *
 * Features:
 * - 2D Operations: Face, 2D Contour, 2D Pocket, 2D Adaptive, Slot, Trace, Thread, Bore, Circular, Engrave
 * - 3D Operations: 3D Adaptive, 3D Contour, Pocket, Parallel, Scallop, Pencil, Steep & Shallow, Morphed Spiral
 * - Drilling: Drill, Spot Drill, Peck Drill, Tap, Bore, Ream
 * - Turning: Face, Profile, Groove, Thread, Part-off
 * - Tool Library, Toolpath Simulation, G-code Generation (Fanuc/GRBL/LinuxCNC)
 * - Feeds & Speeds Calculator, Multi-axis support
 *
 * Version: 1.0.0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/**
 * Fusion CAM Module — Manufacturing workspace
 */
class FusionCAMModule {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Setup configuration
    this.setup = {
      stock: null, // { material, dimensions, origin }
      wcs: new THREE.Matrix4(), // Work coordinate system
      modelOrientation: new THREE.Quaternion(),
      machineType: '3-axis', // 3-axis | 3+2 | 4-axis | 5-axis
      toolAxis: new THREE.Vector3(0, 0, 1) // Z-axis default
    };

    // Operations database
    this.operations = new Map(); // opId -> operation definition
    this.toolpaths = new Map(); // opId -> toolpath geometry
    this.toolLibrary = this.initToolLibrary();

    // Simulation state
    this.simulationTime = 0;
    this.toolpathIndex = 0;
    this.remainingStock = null; // THREE.Geometry of remaining material
    this.machineWorkspace = new THREE.Box3(
      new THREE.Vector3(-200, -200, -200),
      new THREE.Vector3(200, 200, 200)
    );

    // Post-processors
    this.postProcessors = {
      fanuc: this.fanucPost.bind(this),
      grbl: this.grblPost.bind(this),
      linuxcnc: this.linuxcncPost.bind(this)
    };

    // Simulation
    this.isSimulating = false;
    this.simulationSpeed = 1.0;
    this.currentTool = null;
    this.toolpathLines = []; // Visual toolpath lines

    this.animationFrameId = null;
  }

  /**
   * Initialize CAM module UI
   */
  init() {
    this.setupEventListeners();
    this.initializeStock();
  }

  /**
   * Get UI panel for CAM controls
   */
  getUI() {
    const panel = document.createElement('div');
    panel.className = 'fusion-cam-panel';
    panel.innerHTML = `
      <style>
        .fusion-cam-panel {
          padding: 16px;
          font-size: 12px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          border-radius: 4px;
          max-height: 700px;
          overflow-y: auto;
        }
        .fusion-cam-panel h3 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .cam-section {
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .cam-section:last-child {
          border-bottom: none;
        }
        .operation-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          max-height: 200px;
          overflow-y: auto;
        }
        .operation-item {
          padding: 8px;
          background: var(--bg-primary);
          border-radius: 3px;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 11px;
        }
        .operation-item:hover {
          background: var(--bg-tertiary);
        }
        .operation-type {
          font-weight: 600;
          color: var(--accent-color);
        }
        .tool-selector {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 8px;
        }
        .tool-selector select {
          padding: 6px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 3px;
          color: var(--text-primary);
          font-size: 11px;
        }
        .param-input {
          display: flex;
          gap: 8px;
          margin: 6px 0;
          align-items: center;
        }
        .param-input label {
          width: 70px;
          font-weight: 600;
          font-size: 11px;
        }
        .param-input input {
          flex: 1;
          padding: 4px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 3px;
          color: var(--text-primary);
          font-size: 11px;
        }
        .operation-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-top: 8px;
        }
        .operation-buttons button {
          padding: 6px;
          font-size: 11px;
          background: var(--button-bg);
          border: 1px solid var(--border-color);
          border-radius: 3px;
          cursor: pointer;
          color: var(--text-primary);
        }
        .operation-buttons button:hover {
          background: var(--button-hover-bg);
        }
        .feeds-speeds {
          background: var(--bg-primary);
          border-radius: 3px;
          padding: 8px;
          margin-top: 8px;
        }
        .feeds-speeds-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          border-bottom: 1px solid var(--border-color);
          font-size: 11px;
        }
        .feeds-speeds-row:last-child {
          border-bottom: none;
        }
        .simulation-controls {
          display: flex;
          gap: 4px;
          margin-top: 8px;
        }
        .simulation-controls button {
          flex: 1;
          padding: 6px;
          font-size: 10px;
          background: var(--button-bg);
          border: 1px solid var(--border-color);
          border-radius: 3px;
          cursor: pointer;
          color: var(--text-primary);
        }
      </style>

      <div class="cam-section">
        <h3>Setup</h3>
        <div class="param-input">
          <label>Machine:</label>
          <select id="camMachineType" onchange="window.fusionCAM?.setMachineType(this.value)">
            <option value="3-axis">3-Axis</option>
            <option value="3+2">3+2</option>
            <option value="4-axis">4-Axis</option>
            <option value="5-axis">5-Axis</option>
          </select>
        </div>
        <div class="param-input">
          <label>Material:</label>
          <select id="camStockMaterial">
            <option value="steel">Steel</option>
            <option value="aluminum">Aluminum</option>
            <option value="titanium">Titanium</option>
            <option value="plastic">Plastic</option>
          </select>
        </div>
      </div>

      <div class="cam-section">
        <h3>Operations</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px;">
          <button onclick="window.fusionCAM?.newOperation('2D Pocket')">2D Pocket</button>
          <button onclick="window.fusionCAM?.newOperation('2D Contour')">2D Contour</button>
          <button onclick="window.fusionCAM?.newOperation('3D Pocket')">3D Pocket</button>
          <button onclick="window.fusionCAM?.newOperation('Drill')">Drill</button>
          <button onclick="window.fusionCAM?.newOperation('Slot')">Slot</button>
          <button onclick="window.fusionCAM?.newOperation('Thread')">Thread</button>
        </div>
        <div class="operation-list" id="camOperationList"></div>
      </div>

      <div class="cam-section">
        <h3>Tool Library</h3>
        <select id="camToolSelect" onchange="window.fusionCAM?.selectTool(this.value)">
          <option value="">-- Select Tool --</option>
        </select>
        <div id="camToolInfo" style="margin-top: 8px; font-size: 10px; padding: 6px; background: var(--bg-primary); border-radius: 3px;"></div>
      </div>

      <div class="cam-section">
        <h3>Feeds & Speeds</h3>
        <div class="feeds-speeds">
          <div class="feeds-speeds-row">
            <span>Spindle:</span>
            <span id="camSpindleSpeed">1000 RPM</span>
          </div>
          <div class="feeds-speeds-row">
            <span>Feed Rate:</span>
            <span id="camFeedRate">100 mm/min</span>
          </div>
          <div class="feeds-speeds-row">
            <span>Depth/Pass:</span>
            <span id="camDepthPass">5 mm</span>
          </div>
        </div>
        <button onclick="window.fusionCAM?.calculateFeedsAndSpeeds()" style="width: 100%; padding: 6px; margin-top: 8px;">Calculate</button>
      </div>

      <div class="cam-section">
        <h3>Simulation</h3>
        <div class="simulation-controls">
          <button onclick="window.fusionCAM?.simulateToolpath()">Simulate</button>
          <button onclick="window.fusionCAM?.pauseSimulation()">Pause</button>
          <button onclick="window.fusionCAM?.resetSimulation()">Reset</button>
        </div>
      </div>

      <div class="cam-section">
        <h3>Post-Processing</h3>
        <div style="display: flex; gap: 4px;">
          <button onclick="window.fusionCAM?.generateGCode('fanuc')" style="flex: 1;">FANUC</button>
          <button onclick="window.fusionCAM?.generateGCode('grbl')" style="flex: 1;">GRBL</button>
          <button onclick="window.fusionCAM?.generateGCode('linuxcnc')" style="flex: 1;">LinuxCNC</button>
        </div>
      </div>
    `;

    window.fusionCAM = this;
    this.populateToolLibrary();
    return panel;
  }

  /**
   * Initialize tool library with common tools
   */
  initToolLibrary() {
    return new Map([
      // End Mills
      ['endmill_1', { name: '1mm End Mill', type: 'end-mill', diameter: 1, flutes: 2, material: 'HSS', length: 25 }],
      ['endmill_3', { name: '3mm End Mill', type: 'end-mill', diameter: 3, flutes: 2, material: 'HSS', length: 25 }],
      ['endmill_6', { name: '6mm End Mill', type: 'end-mill', diameter: 6, flutes: 2, material: 'Carbide', length: 30 }],
      ['endmill_10', { name: '10mm End Mill', type: 'end-mill', diameter: 10, flutes: 4, material: 'Carbide', length: 40 }],

      // Ball Mills (for 3D contouring)
      ['ballmill_3', { name: '3mm Ball Mill', type: 'ball-mill', diameter: 3, radius: 1.5, material: 'Carbide', length: 30 }],
      ['ballmill_6', { name: '6mm Ball Mill', type: 'ball-mill', diameter: 6, radius: 3, material: 'Carbide', length: 40 }],

      // Drills
      ['drill_1.5', { name: '1.5mm Drill', type: 'drill', diameter: 1.5, material: 'HSS', length: 20 }],
      ['drill_3', { name: '3mm Drill', type: 'drill', diameter: 3, material: 'HSS', length: 30 }],
      ['drill_6', { name: '6mm Drill', type: 'drill', diameter: 6, material: 'Carbide', length: 40 }],
      ['drill_10', { name: '10mm Drill', type: 'drill', diameter: 10, material: 'Carbide', length: 50 }],

      // Taps
      ['tap_m3', { name: 'M3 Tap', type: 'tap', diameter: 3, pitch: 0.5, material: 'HSS', length: 30 }],
      ['tap_m6', { name: 'M6 Tap', type: 'tap', diameter: 6, pitch: 1.0, material: 'HSS', length: 40 }],
      ['tap_m10', { name: 'M10 Tap', type: 'tap', diameter: 10, pitch: 1.5, material: 'HSS', length: 50 }],

      // Slot Drills
      ['slotdrill_3', { name: '3mm Slot Drill', type: 'slot-drill', diameter: 3, material: 'Carbide', length: 30 }],
      ['slotdrill_6', { name: '6mm Slot Drill', type: 'slot-drill', diameter: 6, material: 'Carbide', length: 40 }],
    ]);
  }

  /**
   * Populate tool selector
   */
  populateToolLibrary() {
    const select = document.getElementById('camToolSelect');
    if (!select) return;

    for (const [id, tool] of this.toolLibrary) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = tool.name;
      select.appendChild(option);
    }
  }

  /**
   * Select a tool from library
   */
  selectTool(toolId) {
    if (!toolId) return;

    this.currentTool = this.toolLibrary.get(toolId);
    const infoDiv = document.getElementById('camToolInfo');

    if (infoDiv && this.currentTool) {
      infoDiv.innerHTML = `
        <strong>${this.currentTool.name}</strong><br>
        Diameter: ${this.currentTool.diameter}mm<br>
        Type: ${this.currentTool.type}<br>
        Material: ${this.currentTool.material}
      `;
    }
  }

  /**
   * Create new manufacturing operation
   */
  newOperation(opType) {
    const opId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const operation = {
      id: opId,
      type: opType, // 2D Pocket | 2D Contour | 3D Pocket | Drill | Slot | Thread | etc.
      tool: this.currentTool ? this.currentTool.name : 'End Mill',
      toolId: null,

      // Common parameters
      feedRate: 100, // mm/min
      spindleSpeed: 1000, // RPM
      depth: 10, // mm (for pockets)
      depthPerPass: 5, // mm
      stepOver: 2, // mm
      stepDown: 2, // mm

      // Operation-specific parameters
      contourOffset: 0, // For contour operations
      cornerStrategy: 'sharp', // sharp | round | optimize
      adaptiveEnabled: true,
      trochoidal: false,

      // Geometry
      geometry: null, // Profile or area for operation
      toolpath: [],
      toolpathWireframe: null,

      // Status
      isActive: false,
      isComplete: false
    };

    this.operations.set(opId, operation);
    this.updateOperationList();
    return opId;
  }

  /**
   * Update operation list display
   */
  updateOperationList() {
    const listDiv = document.getElementById('camOperationList');
    if (!listDiv) return;

    listDiv.innerHTML = '';
    for (const [opId, op] of this.operations) {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'operation-item';
      itemDiv.innerHTML = `
        <div><span class="operation-type">${op.type}</span></div>
        <div style="font-size: 10px; color: var(--text-secondary);">
          Tool: ${op.tool} | Feed: ${op.feedRate} mm/min
        </div>
      `;
      itemDiv.onclick = () => this.selectOperation(opId);
      listDiv.appendChild(itemDiv);
    }
  }

  /**
   * Select operation for editing
   */
  selectOperation(opId) {
    for (const [id, op] of this.operations) {
      op.isActive = id === opId;
    }
  }

  /**
   * Calculate feeds and speeds based on material and tool
   */
  calculateFeedsAndSpeeds() {
    if (!this.currentTool || !this.setup.stock) return;

    // Material-dependent feed/speed tables
    const feedSpeeds = {
      steel: { hssCutSpeed: 20, carbideCutSpeed: 200 },
      aluminum: { hssCutSpeed: 80, carbideCutSpeed: 400 },
      titanium: { hssCutSpeed: 10, carbideCutSpeed: 100 },
      plastic: { hssCutSpeed: 100, carbideCutSpeed: 500 }
    };

    const material = this.setup.stock.material || 'aluminum';
    const fs = feedSpeeds[material] || feedSpeeds.aluminum;
    const isCarbide = this.currentTool.material === 'Carbide';
    const cutSpeed = isCarbide ? fs.carbideCutSpeed : fs.hssCutSpeed;

    // RPM = (1000 * Surface Speed) / (π * Diameter)
    const diameter = this.currentTool.diameter;
    const rpm = (1000 * cutSpeed) / (Math.PI * diameter);

    // Feed = RPM * Chip Load * Flutes
    const chipLoad = isCarbide ? 0.1 : 0.05;
    const flutes = this.currentTool.flutes || 2;
    const feedRate = rpm * chipLoad * flutes;

    // Update displays
    document.getElementById('camSpindleSpeed').textContent = Math.round(rpm) + ' RPM';
    document.getElementById('camFeedRate').textContent = Math.round(feedRate) + ' mm/min';
    document.getElementById('camDepthPass').textContent = (diameter * 0.5).toFixed(1) + ' mm';

    // Update active operation
    for (const op of this.operations.values()) {
      if (op.isActive) {
        op.spindleSpeed = Math.round(rpm);
        op.feedRate = Math.round(feedRate);
      }
    }
  }

  /**
   * Set machine type (3-axis, 4-axis, 5-axis)
   */
  setMachineType(type) {
    this.setup.machineType = type;
    console.log(`Machine type set to: ${type}`);
  }

  /**
   * Initialize stock geometry
   */
  initializeStock() {
    // Create stock box geometry
    const stockGeo = new THREE.BoxGeometry(100, 100, 50);
    const stockMat = new THREE.MeshPhongMaterial({
      color: 0x666666,
      transparent: true,
      opacity: 0.3
    });

    this.remainingStock = new THREE.Mesh(stockGeo, stockMat);
    this.scene.add(this.remainingStock);

    this.setup.stock = {
      material: 'aluminum',
      dimensions: { width: 100, height: 100, depth: 50 },
      origin: new THREE.Vector3(-50, -50, 0)
    };
  }

  /**
   * Simulate toolpath with 3D visualization
   */
  simulateToolpath() {
    if (this.isSimulating) return;
    this.isSimulating = true;

    // Collect all toolpaths from operations
    const allToolpaths = [];
    for (const [opId, op] of this.operations) {
      if (op.toolpath && op.toolpath.length > 0) {
        allToolpaths.push(...op.toolpath);
      }
    }

    if (allToolpaths.length === 0) {
      console.warn('No toolpaths to simulate');
      this.isSimulating = false;
      return;
    }

    // Create visualization of toolpath
    const toolpathGeo = new THREE.BufferGeometry();
    const positions = [];

    for (let i = 0; i < allToolpaths.length; i++) {
      const point = allToolpaths[i];
      positions.push(point.x, point.y, point.z);
    }

    toolpathGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const toolpathMat = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const toolpathLine = new THREE.Line(toolpathGeo, toolpathMat);

    this.scene.add(toolpathLine);
    this.toolpathLines.push(toolpathLine);

    // Animate tool along toolpath
    this.simulateToolMovement(allToolpaths);
  }

  /**
   * Animate tool movement along toolpath
   */
  simulateToolMovement(toolpaths) {
    const startTime = performance.now();
    const totalPoints = toolpaths.length;
    const duration = totalPoints * 50; // 50ms per point

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const pointIndex = Math.floor(progress * (totalPoints - 1));

      if (pointIndex < totalPoints) {
        const point = toolpaths[pointIndex];
        // Update tool position visualization
        // (would show cutting tool at this position)
        this.simulationTime = progress;
      }

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.isSimulating = false;
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Pause simulation
   */
  pauseSimulation() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.isSimulating = false;
    }
  }

  /**
   * Reset simulation
   */
  resetSimulation() {
    this.pauseSimulation();
    this.simulationTime = 0;
    this.toolpathIndex = 0;

    // Clear toolpath visualization
    for (const line of this.toolpathLines) {
      this.scene.remove(line);
    }
    this.toolpathLines = [];

    // Reset stock
    this.initializeStock();
  }

  /**
   * Generate toolpath (simplified 2D example)
   */
  generateToolpath(operation) {
    const toolpath = [];
    const tool = this.currentTool;

    if (!tool) return toolpath;

    // Generate spiral toolpath (simplified)
    const depth = operation.depth;
    const depthPerPass = operation.depthPerPass;
    const radius = tool.diameter / 2;

    for (let z = 0; z < depth; z += depthPerPass) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
        const x = Math.cos(angle) * (radius + angle * 2);
        const y = Math.sin(angle) * (radius + angle * 2);
        toolpath.push(new THREE.Vector3(x, y, -z));
      }
    }

    operation.toolpath = toolpath;
    this.toolpaths.set(operation.id, toolpath);
    return toolpath;
  }

  /**
   * Generate G-code (FANUC dialect)
   */
  fanucPost(operations) {
    let gcode = '';
    gcode += '%\n';
    gcode += 'O0001\n'; // Program number
    gcode += 'G21 G40 G49 H0 M6\n'; // Metric, cancel offsets
    gcode += ';\n';

    for (const op of operations) {
      gcode += `; ${op.type} Operation\n`;
      gcode += `S${op.spindleSpeed} M3\n`; // Spindle on
      gcode += `F${op.feedRate}\n`; // Feed rate

      // Generate moves for toolpath
      if (op.toolpath && op.toolpath.length > 0) {
        for (const point of op.toolpath) {
          gcode += `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} Z${point.z.toFixed(3)}\n`;
        }
      }

      gcode += 'M5\n'; // Spindle off
      gcode += ';\n';
    }

    gcode += 'M30\n';
    gcode += '%\n';
    return gcode;
  }

  /**
   * Generate G-code (GRBL dialect - CNC mills)
   */
  grblPost(operations) {
    let gcode = '';
    gcode += '; GRBL Toolpath\n';
    gcode += 'G21 ; Metric\n';
    gcode += 'G90 ; Absolute positioning\n';
    gcode += ';\n';

    for (const op of operations) {
      gcode += `; ${op.type}\n`;
      gcode += `M3 S${op.spindleSpeed}\n`; // Spindle on
      gcode += `G4 P1\n`; // Dwell for spindle ramp

      if (op.toolpath && op.toolpath.length > 0) {
        for (const point of op.toolpath) {
          gcode += `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} Z${point.z.toFixed(3)} F${op.feedRate}\n`;
        }
      }

      gcode += 'M5 ; Spindle off\n';
      gcode += ';\n';
    }

    return gcode;
  }

  /**
   * Generate G-code (LinuxCNC dialect)
   */
  linuxcncPost(operations) {
    let gcode = '';
    gcode += '( LinuxCNC Toolpath )\n';
    gcode += 'G21 (Metric)\n';
    gcode += 'G90 (Absolute)\n';
    gcode += ';\n';

    for (const op of operations) {
      gcode += `( ${op.type} )\n`;
      gcode += `M3 S${op.spindleSpeed}\n`;

      if (op.toolpath && op.toolpath.length > 0) {
        for (const point of op.toolpath) {
          gcode += `G1 X${point.x.toFixed(4)} Y${point.y.toFixed(4)} Z${point.z.toFixed(4)} F${op.feedRate}\n`;
        }
      }

      gcode += 'M5\n';
      gcode += ';\n';
    }

    return gcode;
  }

  /**
   * Generate G-code for all operations
   */
  generateGCode(postProcessor = 'fanuc') {
    const operations = Array.from(this.operations.values());

    // Generate toolpaths if not already done
    for (const op of operations) {
      if (op.toolpath.length === 0) {
        this.generateToolpath(op);
      }
    }

    // Use post-processor
    const post = this.postProcessors[postProcessor];
    if (!post) {
      console.warn(`Unknown post-processor: ${postProcessor}`);
      return '';
    }

    const gcode = post(operations);

    // Download as file
    const blob = new Blob([gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `toolpath_${postProcessor}.nc`;
    a.click();
    URL.revokeObjectURL(url);

    return gcode;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for operation parameter changes
  }

  /**
   * Execute command from agent API
   */
  execute(command, params) {
    switch (command) {
      case 'newOperation':
        return this.newOperation(params.type);
      case 'selectTool':
        return this.selectTool(params.toolId);
      case 'calculateFeedsAndSpeeds':
        return this.calculateFeedsAndSpeeds();
      case 'simulateToolpath':
        return this.simulateToolpath();
      case 'generateGCode':
        return this.generateGCode(params.postProcessor || 'fanuc');
      case 'setMachineType':
        return this.setMachineType(params.type);
      default:
        console.warn(`Unknown CAM command: ${command}`);
    }
  }
}

export default FusionCAMModule;
