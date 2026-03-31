/**
 * @fileoverview Built-in CNC / 3D Printer Control module for cycleCAD
 * Direct browser-based machine control: FDM printers, SLA, CNC mills, laser cutters
 * Supports WebSocket (Klipper/Duet/Smoothieware), OctoPrint API, Web Serial, Moonraker, demo mode
 * G-code generation, toolpath preview, live jog controls, temperature monitoring
 *
 * Exports: window.CycleCAD.MachineControl
 * Methods: init, getUI, execute, connect, sendGCode, getStatus, generateToolpath
 *
 * @version 1.0.0
 */

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.MachineControl = (() => {
  // ============================================================================
  // STATE
  // ============================================================================

  let state = {
    connected: false,
    activeProfile: null,
    machines: [],
    currentMachine: null,
    gCodeBuffer: [],
    jobHistory: [],
    isRunning: false,
    isPaused: false,
    currentLayer: 0,
    totalLayers: 1,
    startTime: null,
    temperatures: { nozzle: 0, bed: 0, nozzleTarget: 0, bedTarget: 0 },
    tempHistory: [],
    position: { x: 0, y: 0, z: 0 },
    feedOverride: 100,
    spindleOverride: 100,
    materialUsed: { length: 0, weight: 0 },
  };

  // Machine profiles database
  const MACHINE_PROFILES = {
    ender3: {
      name: 'Ender 3 / V2 / V3',
      type: 'fdm',
      bed: { x: 220, y: 220, z: 250 },
      nozzle: 0.4,
      gcodeFlavor: 'marlin',
      tempNozzle: 200,
      tempBed: 60,
      speed: 150,
    },
    prusa: {
      name: 'Prusa i3 MK3S+',
      type: 'fdm',
      bed: { x: 250, y: 210, z: 210 },
      nozzle: 0.4,
      gcodeFlavor: 'prusa',
      tempNozzle: 215,
      tempBed: 60,
      speed: 200,
    },
    bambu: {
      name: 'Bambu Lab X1C',
      type: 'fdm',
      bed: { x: 256, y: 256, z: 256 },
      nozzle: 0.4,
      gcodeFlavor: 'klipper',
      tempNozzle: 220,
      tempBed: 45,
      speed: 300,
    },
    voron: {
      name: 'Voron 2.4',
      type: 'fdm',
      bed: { x: 350, y: 350, z: 330 },
      nozzle: 0.4,
      gcodeFlavor: 'klipper',
      tempNozzle: 220,
      tempBed: 100,
      speed: 250,
    },
    snapmaker: {
      name: 'Snapmaker 2.0',
      type: 'multi',
      bed: { x: 200, y: 200, z: 200 },
      nozzle: 0.4,
      gcodeFlavor: 'marlin',
      tempNozzle: 200,
      tempBed: 0,
      speed: 100,
    },
    cnc3018: {
      name: 'Generic CNC 3018',
      type: 'cnc',
      bed: { x: 300, y: 180, z: 45 },
      nozzle: 3.175,
      gcodeFlavor: 'grbl',
      tempNozzle: 0,
      tempBed: 0,
      speed: 100,
    },
    shapeoko: {
      name: 'Shapeoko 4',
      type: 'cnc',
      bed: { x: 838, y: 838, z: 100 },
      nozzle: 6.35,
      gcodeFlavor: 'mach3',
      tempNozzle: 0,
      tempBed: 0,
      speed: 150,
    },
  };

  // ============================================================================
  // 1. MACHINE CONNECTION
  // ============================================================================

  /**
   * Connect to a machine via specified protocol
   * @param {Object} config - Connection config
   * @param {string} config.protocol - 'websocket' | 'octoprint' | 'serial' | 'moonraker' | 'demo'
   * @param {string} config.host - Host address (e.g., '192.168.1.100')
   * @param {number} config.port - Port number
   * @param {string} config.apiKey - API key (for OctoPrint, Moonraker)
   * @param {string} config.profileKey - Machine profile key
   * @returns {Promise<boolean>} True if connected successfully
   */
  async function connect(config) {
    try {
      const profile = MACHINE_PROFILES[config.profileKey];
      if (!profile) throw new Error('Unknown machine profile');

      state.currentMachine = {
        id: `machine_${Date.now()}`,
        name: profile.name,
        profile: profile,
        config: config,
        protocol: config.protocol,
        connection: null,
        lastResponse: null,
      };

      switch (config.protocol) {
        case 'websocket':
          await connectWebSocket(config);
          break;
        case 'octoprint':
          await connectOctoPrint(config);
          break;
        case 'serial':
          await connectSerial(config);
          break;
        case 'moonraker':
          await connectMoonraker(config);
          break;
        case 'demo':
          connectDemo();
          break;
        default:
          throw new Error('Unknown protocol: ' + config.protocol);
      }

      state.connected = true;
      state.machines.push(state.currentMachine);
      console.log('[MachineControl] Connected to ' + profile.name);
      return true;
    } catch (err) {
      console.error('[MachineControl] Connection failed:', err);
      state.connected = false;
      return false;
    }
  }

  /**
   * Connect via WebSocket to Klipper/Duet/Smoothieware
   */
  async function connectWebSocket(config) {
    return new Promise((resolve, reject) => {
      const url = `ws://${config.host}:${config.port}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        state.currentMachine.connection = ws;
        resolve();
      };

      ws.onerror = (err) => reject(new Error('WebSocket error: ' + err.message));
      ws.onclose = () => { state.connected = false; };

      ws.onmessage = (evt) => {
        state.currentMachine.lastResponse = evt.data;
        parseResponse(evt.data);
      };
    });
  }

  /**
   * Connect via OctoPrint REST API + WebSocket
   */
  async function connectOctoPrint(config) {
    const baseURL = `http://${config.host}:${config.port}`;
    const headers = { 'X-API-Key': config.apiKey };

    // Test connection with simple API call
    const resp = await fetch(`${baseURL}/api/version`, { headers });
    if (!resp.ok) throw new Error('OctoPrint API unreachable');

    // Establish WebSocket for real-time updates
    const wsURL = `ws://${config.host}:${config.port}/sockjs/websocket`;
    const ws = new WebSocket(wsURL);

    ws.onopen = () => {
      state.currentMachine.connection = { ws, baseURL, headers };
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.event === 'Status') updateOctoPrintStatus(msg);
    };
  }

  /**
   * Connect via Web Serial API (Chrome/Edge, direct USB)
   */
  async function connectSerial(config) {
    if (!navigator.serial) throw new Error('Web Serial API not supported');

    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: config.baudRate || 115200 });

    const writer = port.writable.getWriter();
    const reader = port.readable.getReader();

    state.currentMachine.connection = { port, writer, reader };

    // Read responses from serial port
    (async () => {
      const decoder = new TextDecoderStream();
      reader.pipeTo(decoder.writable);
      const input = decoder.readable.getReader();
      try {
        while (true) {
          const { value, done } = await input.read();
          if (done) break;
          state.currentMachine.lastResponse = value;
          parseResponse(value);
        }
      } catch (err) {
        console.error('Serial read error:', err);
      }
    })();
  }

  /**
   * Connect via Moonraker API (Klipper companion)
   */
  async function connectMoonraker(config) {
    const baseURL = `http://${config.host}:${config.port}`;
    const wsURL = `ws://${config.host}:${config.port}/websocket`;

    const ws = new WebSocket(wsURL);
    ws.onopen = () => {
      state.currentMachine.connection = { ws, baseURL };
      // Request printer object updates
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'printer.objects.subscribe',
        params: { objects: { 'gcode_move': null, 'extruder': null, 'heater_bed': null } },
        id: 1,
      }));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'notify_update') updateMoonrakerStatus(msg.params);
    };
  }

  /**
   * Demo/simulated machine connection
   */
  function connectDemo() {
    state.currentMachine.connection = {
      type: 'demo',
      buffer: [],
      time: 0,
      interval: null,
    };

    // Simulate heating
    simulateMachineResponse('M104 S' + state.currentMachine.profile.tempNozzle);
    simulateMachineResponse('M140 S' + state.currentMachine.profile.tempBed);
  }

  /**
   * Parse machine response and update state
   */
  function parseResponse(data) {
    // Handle M114 position report: X:10.50 Y:20.30 Z:5.00
    const posMatch = data.match(/X:([\d.-]+)\s+Y:([\d.-]+)\s+Z:([\d.-]+)/i);
    if (posMatch) {
      state.position = { x: parseFloat(posMatch[1]), y: parseFloat(posMatch[2]), z: parseFloat(posMatch[3]) };
    }

    // Handle temperature reports
    const tempMatch = data.match(/T:([\d.]+)\/([\d.]+)\s+B:([\d.]+)\/([\d.]+)/);
    if (tempMatch) {
      state.temperatures.nozzle = parseFloat(tempMatch[1]);
      state.temperatures.nozzleTarget = parseFloat(tempMatch[2]);
      state.temperatures.bed = parseFloat(tempMatch[3]);
      state.temperatures.bedTarget = parseFloat(tempMatch[4]);
      recordTempHistory();
    }
  }

  // ============================================================================
  // 2. G-CODE GENERATOR (~350 lines)
  // ============================================================================

  /**
   * Generate G-code from 3D model geometry
   * @param {Object} geometry - THREE.BufferGeometry
   * @param {Object} settings - Generation settings
   * @param {string} settings.mode - 'fdm' | 'cnc_mill' | 'laser'
   * @param {number} settings.layerHeight - Layer height (mm)
   * @param {number} settings.infillPercent - Infill %
   * @param {number} settings.wallCount - Wall count
   * @param {number} settings.supportType - 'tree' | 'linear' | 'none'
   * @returns {string} G-code string
   */
  function generateToolpath(geometry, settings) {
    let gcode = generateHeader();

    if (settings.mode === 'fdm') {
      gcode += generateFDMGCode(geometry, settings);
    } else if (settings.mode === 'cnc_mill') {
      gcode += generateCNCGCode(geometry, settings);
    } else if (settings.mode === 'laser') {
      gcode += generateLaserGCode(geometry, settings);
    }

    gcode += generateFooter();
    state.gCodeBuffer = gcode.split('\n').filter(l => l.length > 0);
    return gcode;
  }

  /**
   * Generate FDM G-code (simplified slicing)
   */
  function generateFDMGCode(geometry, settings) {
    let gcode = '';
    const layerHeight = settings.layerHeight || 0.2;
    const infill = settings.infillPercent || 20;
    const walls = settings.wallCount || 2;
    const tempNozzle = state.currentMachine.profile.tempNozzle;
    const tempBed = state.currentMachine.profile.tempBed;

    // Calculate bounding box
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const height = bbox.max.z - bbox.min.z;
    const numLayers = Math.ceil(height / layerHeight);

    gcode += `;Generated by cycleCAD MachineControl\n`;
    gcode += `;Layer height: ${layerHeight}\n`;
    gcode += `;Infill: ${infill}%\n\n`;

    // Preheat
    gcode += `M104 S${tempNozzle}\n`;
    gcode += `M140 S${tempBed}\n`;
    gcode += `M109 S${tempNozzle}\n`;
    gcode += `M190 S${tempBed}\n\n`;

    // Homing & reset
    gcode += `G28\n`;
    gcode += `G92 E0\n`;

    // Generate skirt (one loop around print area)
    gcode += generateSkirt(geometry, settings) + '\n';

    // Generate layers
    for (let layer = 0; layer < numLayers; layer++) {
      const z = bbox.min.z + layer * layerHeight;
      gcode += `\n;Layer ${layer}/${numLayers}\n`;
      gcode += `G0 Z${z.toFixed(3)}\n`;

      // Walls (perimeters)
      for (let wall = 0; wall < walls; wall++) {
        gcode += generateWalls(geometry, z, wall) + '\n';
      }

      // Infill
      if (infill > 0) {
        gcode += generateInfill(geometry, z, infill) + '\n';
      }
    }

    // Retractions & moves between features
    gcode = applyRetraction(gcode, settings);

    state.totalLayers = numLayers;
    return gcode;
  }

  /**
   * Generate CNC G-code (milling operations)
   */
  function generateCNCGCode(geometry, settings) {
    let gcode = '';
    const toolDia = state.currentMachine.profile.nozzle;
    const depth = settings.depth || 10;
    const stepDown = settings.stepDown || 5;
    const speed = state.currentMachine.profile.speed;
    const feedRate = settings.feedRate || 600;

    gcode += `;CNC Milling Program\n`;
    gcode += `;Tool diameter: ${toolDia}mm\n`;
    gcode += `;Feed rate: ${feedRate}mm/min\n\n`;

    // Home
    gcode += `G28\n`;
    gcode += `G92 X0 Y0 Z0\n`;

    // Setup
    gcode += `G21\n`; // Metric
    gcode += `G17\n`; // XY plane
    gcode += `G40\n`; // Cancel cutter radius comp
    gcode += `G90\n`; // Absolute positioning
    gcode += `M3 S${speed}\n`; // Spindle on
    gcode += `G4 P2\n`; // Wait 2s for spindle
    gcode += `G0 Z${5}\n\n`; // Retract

    // Generate pocketing operation (simplified)
    gcode += generatePocket(geometry, depth, stepDown) + '\n';

    // End
    gcode += `G0 Z${10}\n`;
    gcode += `M5\n`; // Spindle off
    gcode += `G28\n`; // Home

    return gcode;
  }

  /**
   * Generate laser cutting G-code
   */
  function generateLaserGCode(geometry, settings) {
    let gcode = '';
    const power = settings.power || 80;
    const cutSpeed = settings.cutSpeed || 100;
    const engraveSpeed = settings.engraveSpeed || 300;

    gcode += `;Laser Cutting Program\n`;
    gcode += `;Power: ${power}%\n\n`;

    gcode += `G28\n`;
    gcode += `G92 X0 Y0\n`;
    gcode += `M3\n`; // Laser on (M4 for variable power)
    gcode += `M107\n`; // Aux off

    // Generate outline cuts
    gcode += generateLaserPath(geometry, cutSpeed, power) + '\n';

    gcode += `M5\n`; // Laser off

    return gcode;
  }

  /**
   * Generate skirt (adhesion perimeter)
   */
  function generateSkirt(geometry, settings) {
    const offset = settings.skirtOffset || 5;
    let gcode = `;Skirt\n`;
    gcode += `G0 F${state.currentMachine.profile.speed * 60}\n`;
    gcode += `G0 X${-offset} Y${-offset}\n`;
    gcode += `G0 Z0.2\n`;
    gcode += `G1 E2\n`; // Prime
    gcode += `G1 X${offset} Y${-offset} E5\n`;
    gcode += `G1 X${offset} Y${offset} E8\n`;
    gcode += `G1 X${-offset} Y${offset} E11\n`;
    gcode += `G1 X${-offset} Y${-offset} E14\n`;
    return gcode;
  }

  /**
   * Generate wall/perimeter paths
   */
  function generateWalls(geometry, z, wallIndex) {
    const offset = wallIndex * 2;
    let gcode = `;Wall ${wallIndex}\n`;
    gcode += `G1 F${state.currentMachine.profile.speed * 60}\n`;

    // Simplified: square spiral
    const size = 50;
    const x = offset, y = offset;
    gcode += `G1 X${x} Y${y}\n`;
    gcode += `G1 X${size - offset} Y${y} E10\n`;
    gcode += `G1 X${size - offset} Y${size - offset} E20\n`;
    gcode += `G1 X${x} Y${size - offset} E30\n`;
    gcode += `G1 X${x} Y${y} E40\n`;

    return gcode;
  }

  /**
   * Generate infill pattern
   */
  function generateInfill(geometry, z, infillPercent) {
    let gcode = `;Infill ${infillPercent}%\n`;
    const lineSpacing = 2 / (infillPercent / 100);
    gcode += `G1 F${state.currentMachine.profile.speed * 60}\n`;

    // Simplified: horizontal lines
    for (let y = 0; y < 50; y += lineSpacing) {
      if (y % (lineSpacing * 2) < lineSpacing) {
        gcode += `G1 X0 Y${y} E${y}\n`;
        gcode += `G1 X50 Y${y} E${y + 50}\n`;
      } else {
        gcode += `G1 X50 Y${y} E${y}\n`;
        gcode += `G1 X0 Y${y} E${y + 50}\n`;
      }
    }

    return gcode;
  }

  /**
   * Generate CNC pocketing operation
   */
  function generatePocket(geometry, depth, stepDown) {
    let gcode = '';
    const numPasses = Math.ceil(depth / stepDown);

    for (let pass = 0; pass < numPasses; pass++) {
      const z = -(pass + 1) * stepDown;
      gcode += `\n;Pass ${pass + 1}/${numPasses} (Z=${z})\n`;
      gcode += `G0 Z5\n`;
      gcode += `G0 X10 Y10\n`;
      gcode += `G1 Z${z} F200\n`; // Plunge
      gcode += `G1 X40 Y10 F600\n`; // Move
      gcode += `G1 X40 Y40\n`;
      gcode += `G1 X10 Y40\n`;
      gcode += `G1 X10 Y10\n`;
    }

    return gcode;
  }

  /**
   * Generate laser cutting path
   */
  function generateLaserPath(geometry, speed, power) {
    let gcode = '';
    gcode += `G1 F${speed}\n`;
    gcode += `S${Math.round(power * 2.55)}\n`; // Convert % to 0-255
    gcode += `G1 X10 Y10\n`;
    gcode += `G1 X50 Y10\n`;
    gcode += `G1 X50 Y50\n`;
    gcode += `G1 X10 Y50\n`;
    gcode += `G1 X10 Y10\n`;
    return gcode;
  }

  /**
   * Apply retraction moves to G-code
   */
  function applyRetraction(gcode, settings) {
    const retractDist = settings.retractDistance || 5;
    const retractSpeed = settings.retractSpeed || 40;

    // Simple: add retraction before rapid moves
    gcode = gcode.replace(/G0\s+Z/g, `G1 E-${retractDist} F${retractSpeed * 60}\nG0 Z`);
    return gcode;
  }

  /**
   * Generate G-code file header
   */
  function generateHeader() {
    let gcode = '';
    gcode += `;Generated by cycleCAD MachineControl v1.0\n`;
    gcode += `;Machine: ${state.currentMachine.profile.name}\n`;
    gcode += `;Date: ${new Date().toLocaleString()}\n`;
    gcode += `;Flavor: ${state.currentMachine.profile.gcodeFlavor}\n\n`;
    return gcode;
  }

  /**
   * Generate G-code file footer
   */
  function generateFooter() {
    let gcode = '\n;End of program\n';
    gcode += `M104 S0\n`; // Nozzle off
    gcode += `M140 S0\n`; // Bed off
    gcode += `M107\n`; // Fan off
    gcode += `G28\n`; // Home
    gcode += `M84\n`; // Disable steppers
    return gcode;
  }

  // ============================================================================
  // 3. SEND G-CODE & CONTROL
  // ============================================================================

  /**
   * Send G-code command(s) to machine
   * @param {string|string[]} cmd - G-code command or array of commands
   * @param {boolean} queued - Queue for later (true) or send immediately (false)
   * @returns {Promise<string>} Machine response
   */
  async function sendGCode(cmd, queued = false) {
    if (!state.connected) throw new Error('Not connected to machine');

    const commands = Array.isArray(cmd) ? cmd : [cmd];

    if (queued) {
      state.gCodeBuffer.push(...commands);
      return 'Queued ' + commands.length + ' commands';
    }

    let responses = [];
    for (const c of commands) {
      const resp = await sendRawCommand(c);
      responses.push(resp);
    }

    return responses.join('\n');
  }

  /**
   * Send raw command via current connection
   */
  async function sendRawCommand(cmd) {
    const conn = state.currentMachine.connection;

    if (typeof conn === 'object' && conn.ws) {
      // WebSocket
      conn.ws.send(cmd);
      return 'Sent: ' + cmd;
    } else if (conn.writer) {
      // Serial
      const encoder = new TextEncoder();
      await conn.writer.write(encoder.encode(cmd + '\n'));
      return 'Sent: ' + cmd;
    } else if (conn.type === 'demo') {
      // Demo mode
      return simulateMachineResponse(cmd);
    }

    return 'Error: Unknown connection type';
  }

  /**
   * Simulate machine response (demo mode)
   */
  function simulateMachineResponse(cmd) {
    const lcCmd = cmd.toLowerCase();

    if (lcCmd.startsWith('m104')) {
      const match = cmd.match(/s([\d.]+)/i);
      if (match) state.temperatures.nozzleTarget = parseFloat(match[1]);
      return `ok T:25.0/${state.temperatures.nozzleTarget}`;
    }

    if (lcCmd.startsWith('m140')) {
      const match = cmd.match(/s([\d.]+)/i);
      if (match) state.temperatures.bedTarget = parseFloat(match[1]);
      return `ok B:25.0/${state.temperatures.bedTarget}`;
    }

    if (lcCmd.startsWith('m114')) {
      return `X:${state.position.x.toFixed(2)} Y:${state.position.y.toFixed(2)} Z:${state.position.z.toFixed(2)} Count`;
    }

    return 'ok';
  }

  /**
   * Get current machine status
   * @returns {Object} Status object
   */
  function getStatus() {
    return {
      connected: state.connected,
      machine: state.currentMachine?.profile.name,
      isRunning: state.isRunning,
      isPaused: state.isPaused,
      position: state.position,
      temperatures: state.temperatures,
      progress: state.isRunning ? (state.currentLayer / state.totalLayers) * 100 : 0,
      currentLayer: state.currentLayer,
      totalLayers: state.totalLayers,
      feedOverride: state.feedOverride,
      materialUsed: state.materialUsed,
      gCodeBufferLength: state.gCodeBuffer.length,
    };
  }

  /**
   * Start printing/milling job
   */
  function startJob() {
    state.isRunning = true;
    state.isPaused = false;
    state.currentLayer = 0;
    state.startTime = Date.now();
    state.materialUsed = { length: 0, weight: 0 };

    // Send first batch of G-code
    const batchSize = 50;
    for (let i = 0; i < Math.min(batchSize, state.gCodeBuffer.length); i++) {
      sendRawCommand(state.gCodeBuffer[i]);
    }
  }

  /**
   * Pause current job
   */
  function pauseJob() {
    state.isPaused = true;
    sendRawCommand('M25'); // Pause (Marlin)
  }

  /**
   * Resume paused job
   */
  function resumeJob() {
    state.isPaused = false;
    sendRawCommand('M24'); // Resume (Marlin)
  }

  /**
   * Cancel current job
   */
  function cancelJob() {
    state.isRunning = false;
    state.isPaused = false;
    state.currentLayer = 0;
    sendRawCommand('M112'); // Emergency stop
  }

  /**
   * Jog axis by distance
   * @param {string} axis - 'x' | 'y' | 'z'
   * @param {number} distance - Distance in mm (positive or negative)
   * @param {number} feedRate - Feed rate (mm/min)
   */
  async function jogAxis(axis, distance, feedRate = 600) {
    const move = `G1 ${axis.toUpperCase()}${state.position[axis.toLowerCase()] + distance} F${feedRate}`;
    return sendRawCommand(move);
  }

  /**
   * Set nozzle/bed temperature
   */
  async function setTemperature(type, temp) {
    if (type === 'nozzle') return sendRawCommand(`M104 S${temp}`);
    if (type === 'bed') return sendRawCommand(`M140 S${temp}`);
  }

  /**
   * Record temperature history for graphing
   */
  function recordTempHistory() {
    state.tempHistory.push({
      time: Date.now() - (state.startTime || Date.now()),
      nozzle: state.temperatures.nozzle,
      bed: state.temperatures.bed,
    });

    // Keep last 100 records
    if (state.tempHistory.length > 100) state.tempHistory.shift();
  }

  // ============================================================================
  // 4. UI PANEL
  // ============================================================================

  /**
   * Get UI panel HTML
   * @returns {HTMLElement} Panel DOM element
   */
  function getUI() {
    const panel = document.createElement('div');
    panel.className = 'machine-control-panel';
    panel.innerHTML = `
      <div class="machine-tabs">
        <button class="tab-btn active" data-tab="connect">Connect</button>
        <button class="tab-btn" data-tab="prepare">Prepare</button>
        <button class="tab-btn" data-tab="preview">Preview</button>
        <button class="tab-btn" data-tab="control">Control</button>
        <button class="tab-btn" data-tab="monitor">Monitor</button>
        <button class="tab-btn" data-tab="console">Console</button>
      </div>

      <!-- CONNECT TAB -->
      <div class="tab-content active" id="tab-connect">
        <h3>Machine Connection</h3>
        <div class="machine-profiles">
          ${Object.entries(MACHINE_PROFILES).map(([key, profile]) => `
            <button class="profile-btn" data-profile="${key}">
              <strong>${profile.name}</strong><br>
              <small>${profile.type.toUpperCase()} • ${profile.bed.x}×${profile.bed.y}mm</small>
            </button>
          `).join('')}
        </div>

        <h4>Connection Protocol</h4>
        <div class="protocol-select">
          <label><input type="radio" name="protocol" value="websocket"> WebSocket (Klipper/Duet)</label>
          <label><input type="radio" name="protocol" value="octoprint"> OctoPrint API</label>
          <label><input type="radio" name="protocol" value="serial"> Web Serial (USB)</label>
          <label><input type="radio" name="protocol" value="moonraker"> Moonraker</label>
          <label><input type="radio" name="protocol" value="demo" checked> Demo Mode</label>
        </div>

        <div class="connect-form">
          <input type="text" placeholder="Host (e.g., 192.168.1.100)" id="host" value="localhost">
          <input type="number" placeholder="Port" id="port" value="5000" min="1" max="65535">
          <input type="password" placeholder="API Key (if needed)" id="apiKey">
          <button id="connect-btn" class="btn-primary">Connect</button>
        </div>

        <div class="status-display">
          <div class="status-led" id="status-led"></div>
          <span id="status-text">Disconnected</span>
        </div>

        <h4>Connected Machines</h4>
        <div id="machine-list"></div>
      </div>

      <!-- PREPARE TAB -->
      <div class="tab-content" id="tab-prepare">
        <h3>G-Code Settings</h3>

        <div class="setting-group">
          <label>Mode: <select id="mode-select">
            <option value="fdm">FDM Printing</option>
            <option value="cnc_mill">CNC Milling</option>
            <option value="laser">Laser Cutting</option>
          </select></label>
        </div>

        <div id="fdm-settings" class="mode-settings">
          <label>Layer Height (mm): <input type="number" id="layer-height" min="0.1" max="0.4" step="0.05" value="0.2"></label>
          <label>Infill (%): <input type="range" id="infill" min="0" max="100" value="20"></label>
          <label>Wall Count: <input type="number" id="wall-count" min="1" max="5" value="2"></label>
          <label>Nozzle Temp (°C): <input type="number" id="nozzle-temp" min="180" max="250" value="200"></label>
          <label>Bed Temp (°C): <input type="number" id="bed-temp" min="20" max="100" value="60"></label>
          <label>Support Type: <select id="support-type">
            <option value="tree">Tree</option>
            <option value="linear">Linear</option>
            <option value="none">None</option>
          </select></label>
        </div>

        <div id="cnc-settings" class="mode-settings" style="display:none;">
          <label>Feed Rate (mm/min): <input type="number" id="feed-rate" min="100" max="2000" value="600"></label>
          <label>Spindle Speed (RPM): <input type="number" id="spindle-speed" min="500" max="24000" value="5000"></label>
          <label>Depth of Cut (mm): <input type="number" id="depth-cut" min="1" max="20" value="10"></label>
          <label>Step Down (mm): <input type="number" id="step-down" min="1" max="20" value="5"></label>
        </div>

        <div id="laser-settings" class="mode-settings" style="display:none;">
          <label>Power (%): <input type="range" id="laser-power" min="0" max="100" value="80"></label>
          <label>Cut Speed (mm/min): <input type="number" id="cut-speed" min="10" max="500" value="100"></label>
          <label>Engrave Speed (mm/min): <input type="number" id="engrave-speed" min="50" max="1000" value="300"></label>
        </div>

        <button id="generate-gcode-btn" class="btn-primary">Generate G-Code</button>
        <div id="gcode-info"></div>
      </div>

      <!-- PREVIEW TAB -->
      <div class="tab-content" id="tab-preview">
        <h3>Toolpath Preview</h3>
        <canvas id="toolpath-canvas" width="400" height="300"></canvas>
        <div class="preview-controls">
          <label>Layer: <input type="range" id="layer-slider" min="0" max="1" value="0" style="width:200px;"></label>
          <span id="layer-info">Layer 0/1</span>
        </div>
        <div class="preview-stats">
          <p>Estimated Time: <strong id="est-time">--:--</strong></p>
          <p>Material Weight: <strong id="material-weight">0g</strong></p>
        </div>
      </div>

      <!-- CONTROL TAB -->
      <div class="tab-content" id="tab-control">
        <h3>Machine Control</h3>

        <h4>Jog Pad</h4>
        <div class="jog-pad">
          <div class="jog-grid">
            <button class="jog-btn" data-axis="y" data-dist="10">+Y</button>
            <button class="jog-btn" data-axis="y" data-dist="1">+Y</button>
            <button class="jog-btn" data-axis="z" data-dist="10">+Z</button>
          </div>
          <div class="jog-grid">
            <button class="jog-btn" data-axis="x" data-dist="-10">-X</button>
            <button class="jog-btn" data-axis="x" data-dist="10">+X</button>
            <button class="jog-btn" data-axis="z" data-dist="-10">-Z</button>
          </div>
          <div class="jog-grid">
            <button class="jog-btn" data-axis="y" data-dist="-10">-Y</button>
            <button class="jog-btn" data-axis="y" data-dist="-1">-Y</button>
            <button class="jog-btn" data-axis="x" data-dist="0.1">0.1mm</button>
          </div>
        </div>

        <h4>Axis Control</h4>
        <button id="home-all-btn" class="btn-secondary">Home All (G28)</button>
        <button id="set-zero-btn" class="btn-secondary">Set Zero (G92)</button>

        <h4>Temperature Control</h4>
        <div class="temp-controls">
          <label>Nozzle: <input type="number" id="set-nozzle-temp" min="0" max="300" value="200"></label>
          <button id="set-nozzle-btn" class="btn-secondary">Set</button>
          <label>Bed: <input type="number" id="set-bed-temp" min="0" max="120" value="60"></label>
          <button id="set-bed-btn" class="btn-secondary">Set</button>
        </div>

        <h4>Extrude/Retract</h4>
        <div class="extrude-controls">
          <input type="number" id="extrude-dist" min="0" max="100" value="10" placeholder="Distance (mm)">
          <button id="extrude-btn" class="btn-secondary">Extrude</button>
          <button id="retract-btn" class="btn-secondary">Retract</button>
        </div>

        <h4>Overrides</h4>
        <label>Feed Rate: <input type="range" id="feed-override" min="50" max="200" value="100">
          <span id="feed-override-val">100%</span>
        </label>
        <label>Spindle Speed: <input type="range" id="spindle-override" min="50" max="200" value="100">
          <span id="spindle-override-val">100%</span>
        </label>

        <button id="emergency-stop-btn" class="btn-danger">EMERGENCY STOP (M112)</button>
      </div>

      <!-- MONITOR TAB -->
      <div class="tab-content" id="tab-monitor">
        <h3>Job Monitor</h3>

        <div class="progress-display">
          <div class="progress-bar">
            <div id="progress-fill" style="width:0%"></div>
          </div>
          <span id="progress-text">0%</span>
        </div>

        <div class="monitor-stats">
          <p>Layer: <strong id="monitor-layer">0/1</strong></p>
          <p>Time: <strong id="monitor-time">00:00</strong> / <strong id="monitor-eta">--:--</strong></p>
          <p>Material: <strong id="monitor-material">0m</strong> (<strong id="monitor-weight">0g</strong>)</p>
        </div>

        <div class="temp-chart">
          <canvas id="temp-chart" width="300" height="150"></canvas>
        </div>

        <div class="job-controls">
          <button id="start-btn" class="btn-primary">Start Print</button>
          <button id="pause-btn" class="btn-secondary" disabled>Pause</button>
          <button id="resume-btn" class="btn-secondary" disabled>Resume</button>
          <button id="cancel-btn" class="btn-danger">Cancel</button>
        </div>

        <h4>Print History</h4>
        <div id="job-history"></div>
      </div>

      <!-- CONSOLE TAB -->
      <div class="tab-content" id="tab-console">
        <h3>G-Code Console</h3>
        <textarea id="console-output" readonly style="width:100%; height:150px; font-family:monospace; background:#1e1e1e; color:#00ff00; padding:8px;"></textarea>
        <div class="console-input">
          <input type="text" id="gcode-input" placeholder="Enter G-code command..." style="width:calc(100% - 80px);">
          <button id="send-gcode-btn" class="btn-secondary">Send</button>
        </div>
      </div>
    </div>

    <style>
      .machine-control-panel { padding: 12px; font-size: 0.85rem; }

      .machine-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
      .tab-btn { padding: 6px 12px; background: transparent; border: none; cursor: pointer; border-bottom: 2px solid transparent; }
      .tab-btn.active { border-bottom-color: var(--accent); color: var(--accent); }

      .tab-content { display: none; }
      .tab-content.active { display: block; }

      .machine-profiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
      .profile-btn { padding: 8px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; text-align: left; }
      .profile-btn:hover { background: var(--bg-tertiary); }

      .protocol-select { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
      .protocol-select label { display: flex; align-items: center; gap: 6px; cursor: pointer; }

      .connect-form { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
      .connect-form input { padding: 6px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; color: inherit; }

      .status-display { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
      .status-led { width: 12px; height: 12px; border-radius: 50%; background: #ff4444; }
      .status-led.connected { background: #44ff44; }

      .machine-list { background: var(--bg-secondary); border-radius: 4px; padding: 8px; }

      .setting-group { margin-bottom: 12px; }
      .setting-group label { display: flex; align-items: center; gap: 8px; }
      .setting-group select, .setting-group input { padding: 4px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 3px; color: inherit; }

      .mode-settings { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
      .mode-settings label { display: flex; align-items: center; justify-content: space-between; }

      .jog-pad { display: grid; grid-template-columns: repeat(3, 60px); gap: 4px; margin-bottom: 12px; }
      .jog-grid { display: contents; }
      .jog-btn { padding: 8px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold; }
      .jog-btn:hover { opacity: 0.8; }

      .temp-controls { display: grid; grid-template-columns: 1fr 80px; gap: 8px; align-items: center; margin-bottom: 12px; }
      .extrude-controls { display: flex; gap: 4px; margin-bottom: 12px; }

      .progress-bar { width: 100%; height: 24px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
      #progress-fill { height: 100%; background: var(--accent); transition: width 0.1s; }

      .monitor-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
      .monitor-stats p { margin: 4px 0; }

      .job-controls { display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap; }

      .btn-primary { padding: 8px 12px; background: var(--accent); color: white; border: none; border-radius: 4px; cursor: pointer; }
      .btn-secondary { padding: 6px 10px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
      .btn-danger { padding: 8px 12px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }

      .btn-primary:hover { opacity: 0.9; }
      .btn-secondary:hover { background: var(--bg-tertiary); }
      .btn-danger:hover { background: #ff2222; }
    </style>
    `;

    // Attach event listeners
    attachPanelListeners(panel);

    return panel;
  }

  /**
   * Attach all event listeners to panel
   */
  function attachPanelListeners(panel) {
    // Tab switching
    panel.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        panel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        const tabName = e.target.getAttribute('data-tab');
        panel.querySelector('#tab-' + tabName).classList.add('active');
      });
    });

    // Profile selection
    panel.querySelectorAll('.profile-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        state.activeProfile = e.currentTarget.getAttribute('data-profile');
      });
    });

    // Connect button
    panel.querySelector('#connect-btn').addEventListener('click', async () => {
      const protocol = panel.querySelector('input[name="protocol"]:checked').value;
      const host = panel.querySelector('#host').value;
      const port = parseInt(panel.querySelector('#port').value);
      const apiKey = panel.querySelector('#apiKey').value;
      const profileKey = state.activeProfile || 'ender3';

      const success = await connect({ protocol, host, port, apiKey, profileKey });
      const statusLed = panel.querySelector('#status-led');
      const statusText = panel.querySelector('#status-text');

      if (success) {
        statusLed.classList.add('connected');
        statusText.textContent = 'Connected to ' + MACHINE_PROFILES[profileKey].name;
      } else {
        statusLed.classList.remove('connected');
        statusText.textContent = 'Connection failed';
      }

      updateMachineList(panel);
    });

    // Mode select
    panel.querySelector('#mode-select').addEventListener('change', (e) => {
      const mode = e.target.value;
      panel.querySelector('#fdm-settings').style.display = mode === 'fdm' ? 'flex' : 'none';
      panel.querySelector('#cnc-settings').style.display = mode === 'cnc_mill' ? 'flex' : 'none';
      panel.querySelector('#laser-settings').style.display = mode === 'laser' ? 'flex' : 'none';
    });

    // Generate G-code
    panel.querySelector('#generate-gcode-btn').addEventListener('click', () => {
      const mode = panel.querySelector('#mode-select').value;
      const settings = {
        mode,
        layerHeight: parseFloat(panel.querySelector('#layer-height').value),
        infillPercent: parseInt(panel.querySelector('#infill').value),
        wallCount: parseInt(panel.querySelector('#wall-count').value),
        feedRate: parseInt(panel.querySelector('#feed-rate').value),
        power: parseInt(panel.querySelector('#laser-power').value),
      };

      // Get dummy geometry (in real use, would come from 3D model)
      const geometry = new THREE.BoxGeometry(50, 50, 50);

      const gcode = generateToolpath(geometry, settings);
      panel.querySelector('#gcode-info').innerHTML = `<p style="color:var(--accent);">Generated ${state.gCodeBuffer.length} lines of G-code</p>`;
    });

    // Jog buttons
    panel.querySelectorAll('.jog-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const axis = e.target.getAttribute('data-axis');
        const dist = parseFloat(e.target.getAttribute('data-dist'));
        await jogAxis(axis, dist);
      });
    });

    // Temperature controls
    panel.querySelector('#set-nozzle-btn').addEventListener('click', () => {
      const temp = parseInt(panel.querySelector('#set-nozzle-temp').value);
      setTemperature('nozzle', temp);
    });

    panel.querySelector('#set-bed-btn').addEventListener('click', () => {
      const temp = parseInt(panel.querySelector('#set-bed-temp').value);
      setTemperature('bed', temp);
    });

    // Extrude/Retract
    panel.querySelector('#extrude-btn').addEventListener('click', () => {
      const dist = parseFloat(panel.querySelector('#extrude-dist').value);
      sendRawCommand(`G1 E${dist} F200`);
    });

    panel.querySelector('#retract-btn').addEventListener('click', () => {
      const dist = parseFloat(panel.querySelector('#extrude-dist').value);
      sendRawCommand(`G1 E-${dist} F200`);
    });

    // Overrides
    panel.querySelector('#feed-override').addEventListener('input', (e) => {
      state.feedOverride = parseInt(e.target.value);
      panel.querySelector('#feed-override-val').textContent = state.feedOverride + '%';
      sendRawCommand(`M220 S${state.feedOverride}`);
    });

    panel.querySelector('#spindle-override').addEventListener('input', (e) => {
      state.spindleOverride = parseInt(e.target.value);
      panel.querySelector('#spindle-override-val').textContent = state.spindleOverride + '%';
      sendRawCommand(`M221 S${state.spindleOverride}`);
    });

    // Emergency stop
    panel.querySelector('#emergency-stop-btn').addEventListener('click', () => {
      sendRawCommand('M112');
      cancelJob();
    });

    // Job controls
    panel.querySelector('#start-btn').addEventListener('click', startJob);
    panel.querySelector('#pause-btn').addEventListener('click', pauseJob);
    panel.querySelector('#resume-btn').addEventListener('click', resumeJob);
    panel.querySelector('#cancel-btn').addEventListener('click', cancelJob);

    // Console
    panel.querySelector('#send-gcode-btn').addEventListener('click', async () => {
      const cmd = panel.querySelector('#gcode-input').value.trim();
      if (cmd) {
        const resp = await sendGCode(cmd);
        const output = panel.querySelector('#console-output');
        output.value += `> ${cmd}\n${resp}\n`;
        output.scrollTop = output.scrollHeight;
        panel.querySelector('#gcode-input').value = '';
      }
    });

    // Home all
    panel.querySelector('#home-all-btn').addEventListener('click', () => sendRawCommand('G28'));

    // Set zero
    panel.querySelector('#set-zero-btn').addEventListener('click', () => sendRawCommand('G92 X0 Y0 Z0'));
  }

  /**
   * Update machine list display
   */
  function updateMachineList(panel) {
    const list = panel.querySelector('#machine-list');
    list.innerHTML = state.machines.map((m, idx) => `
      <div style="padding:8px; background:var(--bg-tertiary); margin:4px 0; border-radius:3px;">
        <strong>${m.name}</strong><br>
        <small>${m.protocol} • ${m.config.host}:${m.config.port}</small>
      </div>
    `).join('');
  }

  /**
   * Update OctoPrint status from WebSocket message
   */
  function updateOctoPrintStatus(msg) {
    if (msg.state === 'Printing') state.isRunning = true;
    if (msg.state === 'Paused') state.isPaused = true;
    parseResponse(msg.temps);
  }

  /**
   * Update Moonraker status from notify_update
   */
  function updateMoonrakerStatus(params) {
    if (params[0].gcode_move) {
      const pos = params[0].gcode_move.gcode_position;
      state.position = { x: pos[0], y: pos[1], z: pos[2] };
    }
    if (params[0].extruder) {
      state.temperatures.nozzle = params[0].extruder.temperature;
      state.temperatures.nozzleTarget = params[0].extruder.target;
    }
    if (params[0].heater_bed) {
      state.temperatures.bed = params[0].heater_bed.temperature;
      state.temperatures.bedTarget = params[0].heater_bed.target;
    }
    recordTempHistory();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    init: () => {
      console.log('[MachineControl] Initialized');
    },
    getUI,
    execute: (cmd, params) => {
      console.log('[MachineControl] Execute:', cmd, params);
    },
    connect,
    sendGCode,
    getStatus,
    generateToolpath,
    startJob,
    pauseJob,
    resumeJob,
    cancelJob,
    jogAxis,
    setTemperature,
  };
})();

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.CycleCAD.MachineControl;
}
