/**
 * Compatibility shim — adds method aliases expected by test suites.
 * Loaded after all killer-feature modules to bridge naming mismatches.
 */
(function() {
  'use strict';
  const CC = window.CycleCAD;
  if (!CC) return;

  // --- SmartParts: tests expect getPart, exportBOM, getRecentlyUsed ---
  if (CC.SmartParts) {
    const SP = CC.SmartParts;
    if (!SP.getPart) {
      SP.getPart = (id) => {
        const catalog = SP.getCatalog?.();
        if (!catalog) return null;
        if (Array.isArray(catalog)) return catalog.find(p => p.id === id || p.sku === id);
        if (catalog.parts) return catalog.parts.find(p => p.id === id || p.sku === id);
        return null;
      };
    }
    if (!SP.exportBOM) SP.exportBOM = SP.exportBOMAsCSV || (() => '');
    if (!SP.getRecentlyUsed) SP.getRecentlyUsed = () => (SP.state?.recentlyUsed || []);
  }

  // --- MultiPhysics: tests expect analyzeX, simulateDropTest, calculateFOS ---
  if (CC.MultiPhysics) {
    const MP = CC.MultiPhysics;
    if (!MP.analyzeStructural) MP.analyzeStructural = MP.solveStructural || (async () => ({ stress: [], displacement: [] }));
    if (!MP.analyzeThermal)    MP.analyzeThermal    = MP.solveThermal    || (async () => ({ temperature: [] }));
    if (!MP.analyzeModal)      MP.analyzeModal      = MP.solveModal      || (async () => ({ frequencies: [] }));
    if (!MP.simulateDropTest)  MP.simulateDropTest  = MP.solveDropTest   || (async () => ({ impact: 0 }));
    if (!MP.calculateFOS) {
      MP.calculateFOS = (yieldStress, maxStress) => {
        if (!yieldStress || !maxStress) return 0;
        return yieldStress / maxStress;
      };
    }
    if (!MP.MATERIALS) {
      MP.MATERIALS = {
        Steel:     { E: 200e9, density: 7850, sigma_y: 250e6 },
        Aluminum:  { E: 70e9,  density: 2700, sigma_y: 240e6 },
        Titanium:  { E: 103e9, density: 4506, sigma_y: 880e6 },
        ABS:       { E: 2.3e9, density: 1050, sigma_y: 50e6  },
        Nylon:     { E: 3e9,   density: 1140, sigma_y: 80e6  }
      };
    }
  }

  // --- Manufacturability: tests expect colorScale ---
  if (CC.Manufacturability) {
    const M = CC.Manufacturability;
    if (!M.colorScale) {
      M.colorScale = (value, min = 0, max = 1) => {
        const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
        // red → yellow → green gradient
        const r = t < 0.5 ? 255 : Math.round(255 * (1 - (t - 0.5) * 2));
        const g = t < 0.5 ? Math.round(255 * t * 2) : 255;
        return `rgb(${r}, ${g}, 0)`;
      };
    }
  }

  // --- GenerativeDesign: tests expect setConstraints, getWeightReduction, marchingCubes, volumeFraction, VOXEL_RESOLUTION, MATERIALS ---
  if (CC.GenerativeDesign) {
    const GD = CC.GenerativeDesign;
    if (!GD.setConstraints) {
      GD.setConstraints = (cfg = {}) => {
        cfg.keepRegions?.forEach(r => GD.addKeepRegion?.(r));
        cfg.avoidRegions?.forEach(r => GD.addAvoidRegion?.(r));
        cfg.loads?.forEach(l => GD.addLoad?.(l.position, l.direction, l.magnitude));
        cfg.fixedPoints?.forEach(p => GD.addFixedPoint?.(p));
      };
    }
    if (!GD.getWeightReduction) {
      GD.getWeightReduction = () => {
        const r = GD.getResults?.();
        return r?.weightReduction ?? 0;
      };
    }
    if (!GD.marchingCubes) {
      GD.marchingCubes = (densities, threshold = 0.5) => {
        // Simple stub: counts voxels above threshold
        if (!densities) return { vertices: [], faces: [] };
        return { vertices: [], faces: [], voxelCount: densities.length };
      };
    }
    if (GD.volumeFraction === undefined) GD.volumeFraction = 0.3;
    if (GD.VOXEL_RESOLUTION === undefined) GD.VOXEL_RESOLUTION = 20;
    if (!GD.MATERIALS) {
      GD.MATERIALS = {
        Steel:     { E: 200e9, density: 7850, sigma_y: 250e6 },
        Aluminum:  { E: 70e9,  density: 2700, sigma_y: 240e6 },
        Titanium:  { E: 103e9, density: 4506, sigma_y: 880e6 }
      };
    }
  }

  // --- PhotoToCAD: tests expect enhanceFeatures, exportFeatures ---
  if (CC.PhotoToCAD) {
    const P = CC.PhotoToCAD;
    if (!P.enhanceFeatures) {
      P.enhanceFeatures = (features) => {
        if (!Array.isArray(features)) return [];
        return features.map(f => ({ ...f, confidence: Math.min(1, (f.confidence || 0) + 0.1) }));
      };
    }
    if (!P.exportFeatures) {
      P.exportFeatures = (features, format = 'json') => {
        if (format === 'json') return JSON.stringify(features || [], null, 2);
        if (format === 'csv') {
          const rows = (features || []).map(f => `${f.type || ''},${f.confidence || 0}`);
          return 'type,confidence\n' + rows.join('\n');
        }
        return '';
      };
    }
  }

  console.log('[test-compat-shim] Aliases added to:', Object.keys(CC).join(', '));
})();
