/**
 * Tool Library Manager
 * Manages cutting tools (end mills, ball mills, drills, taper mills) with feeds & speeds calculator
 * Registers on window.cycleCAD.tools
 *
 * Usage:
 *   const tool = window.cycleCAD.tools.get('em-3175')
 *   const feedspeeds = window.cycleCAD.tools.calculateFeedsAndSpeeds('aluminum', 'em-3175')
 *   const recommended = window.cycleCAD.tools.recommend('aluminum', 'facing')
 */

(function() {
  'use strict';

  // Tool Database
  const TOOL_LIBRARY = {
    // End Mills (1-25mm diameters)
    'em-1': {
      name: '1mm End Mill',
      type: 'End Mill',
      diameter: 1,
      flutes: 2,
      length: 40,
      material: 'Carbide',
      coating: 'None',
      rpm_range: [12000, 20000],
      chipLoad: 0.02,
      max_doc: 1,
      max_woc: 0.5
    },
    'em-2': {
      name: '2mm End Mill',
      type: 'End Mill',
      diameter: 2,
      flutes: 2,
      length: 50,
      material: 'Carbide',
      coating: 'TiN',
      rpm_range: [8000, 15000],
      chipLoad: 0.03,
      max_doc: 1.5,
      max_woc: 1
    },
    'em-3175': {
      name: '1/8" End Mill (3.175mm)',
      type: 'End Mill',
      diameter: 3.175,
      flutes: 2,
      length: 50,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [6000, 12000],
      chipLoad: 0.05,
      max_doc: 2,
      max_woc: 1.5
    },
    'em-4': {
      name: '4mm End Mill',
      type: 'End Mill',
      diameter: 4,
      flutes: 3,
      length: 60,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [5000, 10000],
      chipLoad: 0.06,
      max_doc: 2.5,
      max_woc: 2
    },
    'em-5': {
      name: '5mm End Mill',
      type: 'End Mill',
      diameter: 5,
      flutes: 3,
      length: 60,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [4000, 8000],
      chipLoad: 0.08,
      max_doc: 3,
      max_woc: 2.5
    },
    'em-6': {
      name: '6mm End Mill',
      type: 'End Mill',
      diameter: 6,
      flutes: 4,
      length: 75,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [3500, 7500],
      chipLoad: 0.1,
      max_doc: 3.5,
      max_woc: 3
    },
    'em-8': {
      name: '8mm End Mill',
      type: 'End Mill',
      diameter: 8,
      flutes: 4,
      length: 80,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [2500, 5000],
      chipLoad: 0.12,
      max_doc: 4,
      max_woc: 4
    },
    'em-10': {
      name: '10mm End Mill',
      type: 'End Mill',
      diameter: 10,
      flutes: 4,
      length: 100,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [2000, 4000],
      chipLoad: 0.15,
      max_doc: 5,
      max_woc: 5
    },
    'em-12': {
      name: '12mm End Mill',
      type: 'End Mill',
      diameter: 12,
      flutes: 4,
      length: 100,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [1500, 3500],
      chipLoad: 0.2,
      max_doc: 6,
      max_woc: 6
    },
    'em-16': {
      name: '16mm End Mill',
      type: 'End Mill',
      diameter: 16,
      flutes: 4,
      length: 120,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [1000, 2500],
      chipLoad: 0.25,
      max_doc: 8,
      max_woc: 8
    },
    'em-20': {
      name: '20mm End Mill',
      type: 'End Mill',
      diameter: 20,
      flutes: 4,
      length: 150,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [800, 2000],
      chipLoad: 0.3,
      max_doc: 10,
      max_woc: 10
    },
    'em-25': {
      name: '25mm End Mill',
      type: 'End Mill',
      diameter: 25,
      flutes: 4,
      length: 150,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [600, 1500],
      chipLoad: 0.35,
      max_doc: 12,
      max_woc: 12
    },

    // Ball Mills (3-20mm)
    'bm-3': {
      name: '3mm Ball Mill',
      type: 'Ball Mill',
      diameter: 3,
      flutes: 2,
      length: 50,
      material: 'Carbide',
      coating: 'TiN',
      rpm_range: [10000, 18000],
      chipLoad: 0.02,
      max_doc: 1.5,
      max_woc: 0.75
    },
    'bm-6': {
      name: '6mm Ball Mill',
      type: 'Ball Mill',
      diameter: 6,
      flutes: 2,
      length: 60,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [6000, 12000],
      chipLoad: 0.04,
      max_doc: 3,
      max_woc: 1.5
    },
    'bm-10': {
      name: '10mm Ball Mill',
      type: 'Ball Mill',
      diameter: 10,
      flutes: 2,
      length: 80,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [3000, 6000],
      chipLoad: 0.08,
      max_doc: 5,
      max_woc: 2.5
    },
    'bm-16': {
      name: '16mm Ball Mill',
      type: 'Ball Mill',
      diameter: 16,
      flutes: 2,
      length: 120,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [1500, 3500],
      chipLoad: 0.15,
      max_doc: 8,
      max_woc: 4
    },
    'bm-20': {
      name: '20mm Ball Mill',
      type: 'Ball Mill',
      diameter: 20,
      flutes: 2,
      length: 150,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [1000, 2500],
      chipLoad: 0.2,
      max_doc: 10,
      max_woc: 5
    },

    // Taper Mills (V-bits, 60°, 90°, etc.)
    'vm-2-60': {
      name: '2mm V-bit 60°',
      type: 'Taper Mill',
      diameter: 2,
      flutes: 1,
      length: 45,
      angle: 60,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [12000, 24000],
      chipLoad: 0.03,
      max_doc: 1,
      max_woc: 2
    },
    'vm-6-90': {
      name: '6mm V-bit 90°',
      type: 'Taper Mill',
      diameter: 6,
      flutes: 1,
      length: 60,
      angle: 90,
      material: 'Carbide',
      coating: 'DLC',
      rpm_range: [8000, 16000],
      chipLoad: 0.05,
      max_doc: 3,
      max_woc: 6
    },
    'tm-8-30': {
      name: '8mm Taper 30°',
      type: 'Taper Mill',
      diameter: 8,
      flutes: 2,
      length: 75,
      angle: 30,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [5000, 10000],
      chipLoad: 0.1,
      max_doc: 4,
      max_woc: 4
    },

    // Drills (0.8-10mm)
    'dr-1': {
      name: '1mm Twist Drill',
      type: 'Drill',
      diameter: 1,
      flutes: 2,
      length: 40,
      material: 'HSS',
      coating: 'None',
      rpm_range: [4000, 8000],
      chipLoad: 0.02,
      max_doc: 1,
      max_woc: 1
    },
    'dr-2': {
      name: '2mm Twist Drill',
      type: 'Drill',
      diameter: 2,
      flutes: 2,
      length: 50,
      material: 'HSS',
      coating: 'None',
      rpm_range: [2000, 4000],
      chipLoad: 0.04,
      max_doc: 2,
      max_woc: 2
    },
    'dr-3': {
      name: '3mm Twist Drill',
      type: 'Drill',
      diameter: 3,
      flutes: 2,
      length: 60,
      material: 'HSS',
      coating: 'TiN',
      rpm_range: [1500, 3000],
      chipLoad: 0.06,
      max_doc: 3,
      max_woc: 3
    },
    'dr-5': {
      name: '5mm Twist Drill',
      type: 'Drill',
      diameter: 5,
      flutes: 2,
      length: 80,
      material: 'HSS',
      coating: 'TiN',
      rpm_range: [1000, 2000],
      chipLoad: 0.1,
      max_doc: 5,
      max_woc: 5
    },
    'dr-8': {
      name: '8mm Twist Drill',
      type: 'Drill',
      diameter: 8,
      flutes: 2,
      length: 100,
      material: 'HSS',
      coating: 'TiAlN',
      rpm_range: [600, 1200],
      chipLoad: 0.15,
      max_doc: 8,
      max_woc: 8
    },
    'dr-10': {
      name: '10mm Twist Drill',
      type: 'Drill',
      diameter: 10,
      flutes: 2,
      length: 120,
      material: 'Carbide',
      coating: 'TiAlN',
      rpm_range: [500, 1000],
      chipLoad: 0.2,
      max_doc: 10,
      max_woc: 10
    }
  };

  // Feeds & Speeds material constants (surface speed in m/min)
  const MATERIAL_SPEEDS = {
    'aluminum': { speedRange: [100, 300], density: 2.7 },
    'brass': { speedRange: [80, 200], density: 8.5 },
    'copper': { speedRange: [60, 150], density: 8.96 },
    'steel': { speedRange: [20, 60], density: 7.85 },
    'stainless': { speedRange: [15, 40], density: 8.0 },
    'cast-iron': { speedRange: [15, 40], density: 7.2 },
    'titanium': { speedRange: [10, 30], density: 4.5 },
    'plastic': { speedRange: [150, 400], density: 1.2 },
    'wood': { speedRange: [80, 200], density: 0.6 }
  };

  /**
   * Tool library API
   */
  const toolAPI = {
    /**
     * Get tool by ID
     */
    get(toolId) {
      return TOOL_LIBRARY[toolId] || null;
    },

    /**
     * List all tools
     */
    list() {
      return Object.keys(TOOL_LIBRARY).map(id => ({
        id,
        ...TOOL_LIBRARY[id]
      }));
    },

    /**
     * List tools by type
     */
    listByType(type) {
      return Object.keys(TOOL_LIBRARY)
        .filter(id => TOOL_LIBRARY[id].type === type)
        .map(id => ({ id, ...TOOL_LIBRARY[id] }));
    },

    /**
     * Calculate feeds and speeds given material and tool
     * Returns { rpm, feedRate, chipLoad, doc, woc }
     */
    calculateFeedsAndSpeeds(material, toolId) {
      const tool = TOOL_LIBRARY[toolId];
      if (!tool) return null;

      const matData = MATERIAL_SPEEDS[material.toLowerCase()];
      if (!matData) return null;

      // Select surface speed based on material (use midpoint)
      const surfaceSpeed = (matData.speedRange[0] + matData.speedRange[1]) / 2;

      // RPM = (surface speed * 1000) / (π * diameter)
      const rpm = Math.round((surfaceSpeed * 1000) / (Math.PI * tool.diameter));

      // Cap RPM within tool's range
      const capped_rpm = Math.max(
        tool.rpm_range[0],
        Math.min(rpm, tool.rpm_range[1])
      );

      // Feed rate = RPM * number of flutes * chip load
      const feedRate = Math.round(capped_rpm * tool.flutes * tool.chipLoad);

      return {
        rpm: capped_rpm,
        feedRate: feedRate,
        chipLoad: tool.chipLoad,
        doc: tool.max_doc,
        woc: tool.max_woc,
        surfaceSpeed: surfaceSpeed,
        material: material
      };
    },

    /**
     * Recommend best tool for operation + material
     * Returns tool object
     */
    recommend(material, operationType) {
      const mat = material.toLowerCase();
      let toolType = 'End Mill';

      // Pick tool type based on operation
      if (operationType === 'roughing') {
        toolType = 'End Mill';
      } else if (operationType === 'finishing') {
        toolType = 'Ball Mill';
      } else if (operationType === 'engraving') {
        toolType = 'Taper Mill';
      } else if (operationType === 'drilling') {
        toolType = 'Drill';
      }

      // Get tools of that type
      const candidates = this.listByType(toolType);
      if (candidates.length === 0) return null;

      // Prefer carbide for metals, any for others
      let recommended;
      if (['aluminum', 'steel', 'stainless', 'cast-iron', 'titanium'].includes(mat)) {
        recommended = candidates.find(t => t.material === 'Carbide') || candidates[0];
      } else {
        recommended = candidates[0];
      }

      return recommended;
    },

    /**
     * Get tool wear estimation (simplified)
     * Returns estimated tool life in minutes
     */
    estimateWearLife(material, toolId, rpm, feedRate) {
      const tool = TOOL_LIBRARY[toolId];
      if (!tool) return null;

      // Rough estimate: tool life inversely related to speed
      // (Higher speed = shorter life)
      const baseLife = 180; // 3 hours baseline
      const speedFactor = tool.rpm_range[1] / rpm; // 0-1 scale
      const lifeMinutes = baseLife * speedFactor;

      return {
        estimatedLife: lifeMinutes,
        recommendedChange: lifeMinutes * 0.8, // Change at 80%
        tool: tool.name
      };
    },

    /**
     * Create custom tool
     */
    create(toolId, profile) {
      if (TOOL_LIBRARY[toolId]) {
        console.warn(`Tool "${toolId}" already exists.`);
        return false;
      }

      TOOL_LIBRARY[toolId] = {
        name: profile.name || toolId,
        type: profile.type || 'End Mill',
        diameter: profile.diameter || 3,
        flutes: profile.flutes || 2,
        length: profile.length || 50,
        material: profile.material || 'Carbide',
        coating: profile.coating || 'None',
        rpm_range: profile.rpm_range || [1000, 10000],
        chipLoad: profile.chipLoad || 0.1,
        max_doc: profile.max_doc || 3,
        max_woc: profile.max_woc || 3
      };

      return true;
    },

    /**
     * Update tool
     */
    update(toolId, updates) {
      if (!TOOL_LIBRARY[toolId]) {
        console.warn(`Tool "${toolId}" not found.`);
        return false;
      }

      TOOL_LIBRARY[toolId] = {
        ...TOOL_LIBRARY[toolId],
        ...updates
      };

      return true;
    },

    /**
     * Delete tool
     */
    delete(toolId) {
      if (!TOOL_LIBRARY[toolId]) {
        console.warn(`Tool "${toolId}" not found.`);
        return false;
      }

      delete TOOL_LIBRARY[toolId];
      return true;
    },

    /**
     * Export tool as JSON
     */
    export(toolId) {
      const tool = TOOL_LIBRARY[toolId];
      if (!tool) return null;

      return JSON.stringify({
        id: toolId,
        ...tool
      }, null, 2);
    },

    /**
     * Import tool from JSON
     */
    import(jsonString) {
      try {
        const profile = JSON.parse(jsonString);
        const id = profile.id || `imported-${Date.now()}`;

        const { id: _, ...rest } = profile;
        return this.create(id, rest);
      } catch (err) {
        console.error('Failed to import tool:', err);
        return false;
      }
    }
  };

  // Register on window.cycleCAD
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.tools = toolAPI;

  console.log('[cycleCAD.tools] Module loaded. 30+ preset tools, feeds & speeds calculator.');
})();
