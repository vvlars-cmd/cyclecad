/**
 * Machine Profiles Manager
 * Manages CNC/FDM/SLA/Laser machine configurations and capabilities
 * Registers on window.cycleCAD.machines
 *
 * Usage:
 *   const machine = window.cycleCAD.machines.get('shapeoko-4')
 *   const isCapable = window.cycleCAD.machines.canHandle('shapeoko-4', { toolDiameter: 3.175, maxRPM: 12000 })
 *   const profiles = window.cycleCAD.machines.list()
 */

(function() {
  'use strict';

  // Machine Profile Database
  const MACHINE_PROFILES = {
    'shapeoko-4': {
      name: 'Shapeoko 4',
      type: 'CNC',
      manufacturer: 'Carbide 3D',
      workArea: { x: 406.4, y: 508, z: 104.14 }, // mm
      maxSpindleRPM: 10000,
      maxFeedRate: 3000, // mm/min
      firmware: 'Grbl',
      supportedTools: ['End Mill', 'Ball Mill', 'V-bit', 'Drill'],
      gcodDialect: 'Grbl',
      macros: {
        header: 'G21 G90 G94 M3',
        footer: 'M5 G28 M30',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Desktop benchtop CNC router'
    },
    'x-carve': {
      name: 'X-Carve',
      type: 'CNC',
      manufacturer: 'Inventables',
      workArea: { x: 762, y: 762, z: 76.2 }, // mm (30x30x3 inch)
      maxSpindleRPM: 24000,
      maxFeedRate: 4000,
      firmware: 'Grbl',
      supportedTools: ['End Mill', 'Ball Mill', 'V-bit', 'Drill'],
      gcodDialect: 'Grbl',
      macros: {
        header: 'G21 G90 G94 M3',
        footer: 'M5 G28 M30',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Mid-range desktop CNC router'
    },
    'prusa-i3-mk3': {
      name: 'Prusa i3 MK3S+',
      type: 'FDM',
      manufacturer: 'Prusa Research',
      workArea: { x: 250, y: 210, z: 210 }, // mm
      maxSpindleRPM: 0,
      maxFeedRate: 200, // mm/min (print speed)
      firmware: 'Marlin',
      supportedTools: ['Hotend 0.4mm', 'Hotend 0.6mm', 'Hotend 0.8mm'],
      gcodDialect: 'Marlin',
      macros: {
        header: 'M109 S{nozzleTemp} ; Heat nozzle\nM190 S{bedTemp} ; Heat bed\nG28 ; Home\nG29 ; Mesh bed level',
        footer: 'M104 S0 ; Cool nozzle\nM140 S0 ; Cool bed\nG28 X0 Y0 ; Home\nM84 ; Disable motors',
        toolChange: '; Nozzle swap (manual)',
        dwell: 'G4 S{sec}',
        retraction: 'G10 ; Retract\nG11 ; Unretract'
      },
      notes: 'Entry-level FDM printer with excellent precision'
    },
    'ender-3-pro': {
      name: 'Creality Ender 3 Pro',
      type: 'FDM',
      manufacturer: 'Creality',
      workArea: { x: 235, y: 235, z: 250 }, // mm
      maxSpindleRPM: 0,
      maxFeedRate: 200,
      firmware: 'Marlin',
      supportedTools: ['Hotend 0.4mm', 'Hotend 0.6mm'],
      gcodDialect: 'Marlin',
      macros: {
        header: 'M104 S{nozzleTemp}\nM140 S{bedTemp}\nG28\nG29',
        footer: 'M104 S0\nM140 S0\nG28 X0 Y0\nM84',
        toolChange: '; Manual nozzle swap',
        dwell: 'G4 S{sec}',
        retraction: 'G10\nG11'
      },
      notes: 'Budget FDM printer, very popular'
    },
    'bambu-lab-x1': {
      name: 'Bambu Lab X1',
      type: 'FDM',
      manufacturer: 'Bambu Lab',
      workArea: { x: 256, y: 256, z: 256 }, // mm
      maxSpindleRPM: 0,
      maxFeedRate: 500, // mm/min (very fast with 4-material AMS)
      firmware: 'Proprietary',
      supportedTools: ['Hotend 0.4mm', 'Hotend 0.6mm', 'Hotend 0.8mm', 'AMS (4-material)'],
      gcodDialect: 'Bambu',
      macros: {
        header: 'M1002 judge_flag 0\nM109 S{nozzleTemp}\nM190 S{bedTemp}',
        footer: 'M104 S0\nM140 S0',
        toolChange: 'M620.{tool} ; AMS tool change',
        dwell: 'G4 P{ms}',
        retraction: 'G10\nG11'
      },
      notes: 'High-speed FDM with integrated multi-material system'
    },
    'glowforge-basic': {
      name: 'Glowforge Basic',
      type: 'Laser',
      manufacturer: 'Glowforge',
      workArea: { x: 279.4, y: 203.2, z: 50.8 }, // mm (11x8 inch, 2 inch max thickness)
      maxSpindleRPM: 0,
      maxFeedRate: 1000, // mm/min (laser raster)
      firmware: 'Proprietary Cloud',
      supportedTools: ['CO2 Laser 40W'],
      gcodDialect: 'LightBurn/Glowforge',
      macros: {
        header: '; Glowforge job header',
        footer: '; Job complete',
        toolChange: '; Laser module (fixed)',
        dwell: 'WAIT {sec}s',
        powerControl: 'POWER {percent}%'
      },
      notes: 'Consumer CO2 laser cutter/engraver'
    },
    'haas-mini-mill': {
      name: 'HAAS Mini Mill',
      type: 'CNC',
      manufacturer: 'HAAS Automation',
      workArea: { x: 508, y: 457.2, z: 254 }, // mm (20x18x10 inch)
      maxSpindleRPM: 7500,
      maxFeedRate: 8000,
      firmware: 'Mach 3',
      supportedTools: ['End Mill', 'Ball Mill', 'Taper Mill', 'Drill', 'Tap', 'Center Drill'],
      gcodDialect: 'ISO G-code',
      macros: {
        header: 'G21 G90 G94 G54 M3',
        footer: 'M5 G28 M30',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Professional benchtop CNC mill'
    },
    'tormach-pcnc-1100': {
      name: 'Tormach PCNC 1100',
      type: 'CNC',
      manufacturer: 'Tormach',
      workArea: { x: 558.8, y: 279.4, z: 177.8 }, // mm
      maxSpindleRPM: 5000,
      maxFeedRate: 7620,
      firmware: 'Mach3/LinuxCNC',
      supportedTools: ['End Mill', 'Ball Mill', 'Drill', 'Tap'],
      gcodDialect: 'ISO G-code',
      macros: {
        header: 'G21 G90 G94 G54 M3',
        footer: 'M5 G28 M30',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Professional benchtop mill, popular with makers'
    },
    'roland-mdx-40': {
      name: 'Roland MDX-40',
      type: 'CNC',
      manufacturer: 'Roland',
      workArea: { x: 304.8, y: 152.4, z: 50.8 }, // mm (12x6x2 inch)
      maxSpindleRPM: 8000,
      maxFeedRate: 5000,
      firmware: 'Roland proprietary',
      supportedTools: ['End Mill', 'Ball Mill', 'V-bit'],
      gcodDialect: 'Roland VPanel',
      macros: {
        header: '; Roland MDX-40 job',
        footer: '; Job complete',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Compact desktop CNC mill, widely used in universities'
    },
    'nomad-3': {
      name: 'Carbide 3D Nomad 3',
      type: 'CNC',
      manufacturer: 'Carbide 3D',
      workArea: { x: 203.2, y: 177.8, z: 76.2 }, // mm (8x7x3 inch)
      maxSpindleRPM: 10000,
      maxFeedRate: 3000,
      firmware: 'Grbl',
      supportedTools: ['End Mill', 'Ball Mill', 'V-bit', 'Drill'],
      gcodDialect: 'Grbl',
      macros: {
        header: 'G21 G90 G94 M3',
        footer: 'M5 G28 M30',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Compact tabletop milling machine'
    },
    'formlabs-form-3': {
      name: 'Formlabs Form 3',
      type: 'SLA',
      manufacturer: 'Formlabs',
      workArea: { x: 127.5, y: 80.5, z: 100 }, // mm (5x3.2x3.9 inch build area)
      maxSpindleRPM: 0,
      maxFeedRate: 0, // Stereolithography
      firmware: 'Proprietary Cloud',
      supportedTools: ['405nm Laser', 'Build Platform'],
      gcodDialect: 'Form OS (proprietary)',
      macros: {
        header: '; Formlabs Form 3 job',
        footer: '; Print complete',
        expose: 'EXPOSE {exposure}ms',
        dwell: 'WAIT {sec}s'
      },
      notes: 'Professional SLA printer with excellent detail and surface finish'
    },
    'elegoo-mars-3': {
      name: 'Elegoo Mars 3',
      type: 'SLA',
      manufacturer: 'Elegoo',
      workArea: { x: 68.04, y: 120.96, z: 80 }, // mm (2.7x4.76x3.15 inch)
      maxSpindleRPM: 0,
      maxFeedRate: 0,
      firmware: 'Chitubox',
      supportedTools: ['405nm UV Laser'],
      gcodDialect: 'Chitubox',
      macros: {
        header: '; Elegoo Mars 3 job',
        footer: '; Print complete',
        expose: 'EXPOSE {exposure}ms {power}%',
        liftSpeed: 'LIFT {speed}mm/s'
      },
      notes: 'Budget SLA printer, good value for detail work'
    },
    'snapmaker-2-a350': {
      name: 'Snapmaker 2 A350',
      type: 'Multi (CNC/Laser/3D Print)',
      manufacturer: 'Snapmaker',
      workArea: { x: 345, y: 355, z: 345 }, // mm (max 345x345x345)
      maxSpindleRPM: 10000,
      maxFeedRate: 3000,
      firmware: 'Snapmaker',
      supportedTools: ['CNC Head', 'Laser Head', '3D Print Head'],
      gcodDialect: 'Snapmaker G-code',
      macros: {
        header: 'G21 G90',
        footer: 'M104 S0\nM140 S0\nG28',
        toolChange: 'M200 S{toolId}',
        dwell: 'G4 P{ms}'
      },
      notes: 'Multi-purpose modular machine (CNC/Laser/3D Print)'
    },
    'longmill-30x40': {
      name: 'LongMill 30x40',
      type: 'CNC',
      manufacturer: 'Sienci Labs',
      workArea: { x: 762, y: 1016, z: 76.2 }, // mm (30x40x3 inch)
      maxSpindleRPM: 10000,
      maxFeedRate: 4000,
      firmware: 'Grbl',
      supportedTools: ['End Mill', 'Ball Mill', 'V-bit', 'Drill'],
      gcodDialect: 'Grbl',
      macros: {
        header: 'G21 G90 G94 M3',
        footer: 'M5 G28 M30',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Large format benchtop CNC router'
    },
    'generic-cnc': {
      name: 'Generic CNC Router',
      type: 'CNC',
      manufacturer: 'Custom',
      workArea: { x: 500, y: 500, z: 100 },
      maxSpindleRPM: 10000,
      maxFeedRate: 3000,
      firmware: 'Grbl',
      supportedTools: ['End Mill', 'Ball Mill', 'V-bit', 'Drill'],
      gcodDialect: 'Grbl',
      macros: {
        header: 'G21 G90 G94 M3',
        footer: 'M5 G28 M30',
        toolChange: 'M6 T{tool}',
        dwell: 'G4 P{ms}',
        spindleControl: 'S{rpm} M3'
      },
      notes: 'Generic CNC router template'
    },
    'generic-fdm': {
      name: 'Generic FDM Printer',
      type: 'FDM',
      manufacturer: 'Custom',
      workArea: { x: 200, y: 200, z: 200 },
      maxSpindleRPM: 0,
      maxFeedRate: 150,
      firmware: 'Marlin',
      supportedTools: ['Hotend 0.4mm'],
      gcodDialect: 'Marlin',
      macros: {
        header: 'M109 S{nozzleTemp}\nM190 S{bedTemp}\nG28\nG29',
        footer: 'M104 S0\nM140 S0\nG28 X0 Y0\nM84',
        toolChange: '; Manual nozzle swap',
        dwell: 'G4 S{sec}',
        retraction: 'G10\nG11'
      },
      notes: 'Generic FDM printer template'
    },
    'generic-sla': {
      name: 'Generic SLA Printer',
      type: 'SLA',
      manufacturer: 'Custom',
      workArea: { x: 100, y: 60, z: 100 },
      maxSpindleRPM: 0,
      maxFeedRate: 0,
      firmware: 'Proprietary',
      supportedTools: ['UV Laser'],
      gcodDialect: 'Chitubox',
      macros: {
        header: '; SLA job',
        footer: '; Print complete',
        expose: 'EXPOSE {exposure}ms',
        liftSpeed: 'LIFT {speed}mm/s'
      },
      notes: 'Generic SLA printer template'
    },
    'generic-laser': {
      name: 'Generic Laser Cutter',
      type: 'Laser',
      manufacturer: 'Custom',
      workArea: { x: 400, y: 600, z: 50 },
      maxSpindleRPM: 0,
      maxFeedRate: 1000,
      firmware: 'Proprietary',
      supportedTools: ['CO2 Laser', 'Fiber Laser'],
      gcodDialect: 'LightBurn',
      macros: {
        header: '; Laser job',
        footer: '; Job complete',
        powerControl: 'POWER {percent}%',
        speedControl: 'SPEED {percent}%'
      },
      notes: 'Generic laser cutter template'
    }
  };

  /**
   * Machine library API
   */
  const machineAPI = {
    /**
     * Get machine profile by ID
     */
    get(machineId) {
      return MACHINE_PROFILES[machineId] || null;
    },

    /**
     * List all machine profiles
     */
    list() {
      return Object.keys(MACHINE_PROFILES).map(id => ({
        id,
        ...MACHINE_PROFILES[id]
      }));
    },

    /**
     * List machines by type (CNC, FDM, SLA, Laser)
     */
    listByType(type) {
      return Object.keys(MACHINE_PROFILES)
        .filter(id => MACHINE_PROFILES[id].type === type)
        .map(id => ({ id, ...MACHINE_PROFILES[id] }));
    },

    /**
     * Check if machine can handle given tooling requirements
     */
    canHandle(machineId, requirements) {
      const machine = MACHINE_PROFILES[machineId];
      if (!machine) return false;

      const { toolDiameter = 0, maxRPM = 0, workAreaX = 0, workAreaY = 0, workAreaZ = 0 } = requirements;

      return (
        machine.maxSpindleRPM >= maxRPM &&
        machine.workArea.x >= workAreaX &&
        machine.workArea.y >= workAreaY &&
        machine.workArea.z >= workAreaZ
      );
    },

    /**
     * Get G-code macro for machine
     */
    getMacro(machineId, macroType) {
      const machine = MACHINE_PROFILES[machineId];
      return machine && machine.macros ? machine.macros[macroType] || '' : '';
    },

    /**
     * Get work area dimensions
     */
    getWorkArea(machineId) {
      const machine = MACHINE_PROFILES[machineId];
      return machine ? machine.workArea : null;
    },

    /**
     * Get max spindle RPM
     */
    getMaxRPM(machineId) {
      const machine = MACHINE_PROFILES[machineId];
      return machine ? machine.maxSpindleRPM : 0;
    },

    /**
     * Get max feed rate
     */
    getMaxFeedRate(machineId) {
      const machine = MACHINE_PROFILES[machineId];
      return machine ? machine.maxFeedRate : 0;
    },

    /**
     * Check if machine supports tool type
     */
    supportsTool(machineId, toolType) {
      const machine = MACHINE_PROFILES[machineId];
      return machine && machine.supportedTools.includes(toolType);
    },

    /**
     * Create custom machine profile
     */
    create(machineId, profile) {
      if (MACHINE_PROFILES[machineId]) {
        console.warn(`Machine "${machineId}" already exists. Use update() to modify.`);
        return false;
      }

      MACHINE_PROFILES[machineId] = {
        name: profile.name || machineId,
        type: profile.type || 'CNC',
        manufacturer: profile.manufacturer || 'Custom',
        workArea: profile.workArea || { x: 300, y: 300, z: 100 },
        maxSpindleRPM: profile.maxSpindleRPM || 10000,
        maxFeedRate: profile.maxFeedRate || 3000,
        firmware: profile.firmware || 'Grbl',
        supportedTools: profile.supportedTools || ['End Mill', 'Drill'],
        gcodDialect: profile.gcodDialect || 'Grbl',
        macros: profile.macros || {},
        notes: profile.notes || 'Custom machine'
      };

      return true;
    },

    /**
     * Update existing machine profile
     */
    update(machineId, updates) {
      if (!MACHINE_PROFILES[machineId]) {
        console.warn(`Machine "${machineId}" not found.`);
        return false;
      }

      MACHINE_PROFILES[machineId] = {
        ...MACHINE_PROFILES[machineId],
        ...updates
      };

      return true;
    },

    /**
     * Delete custom machine
     */
    delete(machineId) {
      if (!MACHINE_PROFILES[machineId]) {
        console.warn(`Machine "${machineId}" not found.`);
        return false;
      }

      delete MACHINE_PROFILES[machineId];
      return true;
    },

    /**
     * Export machine profile as JSON
     */
    export(machineId) {
      const machine = MACHINE_PROFILES[machineId];
      if (!machine) return null;

      return JSON.stringify({
        id: machineId,
        ...machine
      }, null, 2);
    },

    /**
     * Import machine profile from JSON
     */
    import(jsonString) {
      try {
        const profile = JSON.parse(jsonString);
        const id = profile.id || `imported-${Date.now()}`;

        const { id: _, ...rest } = profile;
        return this.create(id, rest);
      } catch (err) {
        console.error('Failed to import machine profile:', err);
        return false;
      }
    }
  };

  // Register on window.cycleCAD
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.machines = machineAPI;

  console.log('[cycleCAD.machines] Module loaded. 15+ preset machines available.');
})();
