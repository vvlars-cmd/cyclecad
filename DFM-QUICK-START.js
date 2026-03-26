/**
 * DFM Analyzer Quick Start Examples
 * Copy and paste these snippets into your browser console to test the DFM module
 */

// ============================================================================
// BASIC ANALYSIS
// ============================================================================

// 1. Analyze a mesh for FDM (3D printing)
const mesh = window.allParts[0].mesh;
const fdmAnalysis = window.cycleCAD.dfm.analyze(mesh, 'fdm');
console.log(`FDM Grade: ${fdmAnalysis.grade}, Score: ${fdmAnalysis.score}`);
console.log('Issues:', fdmAnalysis.issues);
console.log('Suggestions:', fdmAnalysis.suggestions);

// 2. Analyze for all processes and get best match
const allResults = window.cycleCAD.dfm.analyzeAll(mesh);
console.log(`Best process: ${allResults.bestProcess} (Grade ${allResults.bestGrade})`);
console.log(allResults.summary);

// ============================================================================
// COST ESTIMATION
// ============================================================================

// 3. Estimate cost for CNC milling with steel
const cncCost = window.cycleCAD.dfm.estimateCost(mesh, 'cnc_mill', 1, 'steel-1018');
console.log(`Material: €${cncCost.materialCost.perUnit}`);
console.log(`Machine: €${cncCost.machineCost.total}`);
console.log(`Setup: €${cncCost.setupCost.amortized}`);
console.log(`TOTAL: €${cncCost.totalPerUnit}`);

// 4. Compare costs across quantities
const costComparison = window.cycleCAD.dfm.compareCosts(
  mesh,
  'cnc_mill',
  [1, 10, 100, 1000],
  'aluminum-6061'
);
console.table(costComparison.comparison);
if (costComparison.crossovers.length > 0) {
  console.log('Cost savings at higher quantities:', costComparison.crossovers);
}

// 5. Compare two different processes
const fdmCost = window.cycleCAD.dfm.estimateCost(mesh, 'fdm', 100, 'pla');
const moldfCost = window.cycleCAD.dfm.estimateCost(mesh, 'injection_mold', 100, 'abs');
console.log(`FDM x100: €${fdmCost.totalBatch}`);
console.log(`Molding x100: €${moldfCost.totalBatch}`);
console.log(`Savings: €${fdmCost.totalBatch - moldfCost.totalBatch}`);

// ============================================================================
// MATERIAL SELECTION
// ============================================================================

// 6. Get material recommendations for high-strength, low-cost, corrosion-resistant
const materials = window.cycleCAD.dfm.recommendMaterial({
  strength: 'high',
  weight: 'light',
  temperature: 150,
  cost: 'low',
  corrosion: true
});
console.log('Top 5 recommended materials:');
materials.forEach((m, i) => {
  console.log(`${i+1}. ${m.name} (score: ${m.score})`);
  console.log(`   Tensile: ${m.properties.tensile} MPa, Cost: €${m.properties.costPerKg}/kg`);
});

// ============================================================================
// WEIGHT & TOLERANCES
// ============================================================================

// 7. Calculate part weight in different materials
const weightSteel = window.cycleCAD.dfm.estimateWeight(mesh, 'steel-1018');
const weightAluminum = window.cycleCAD.dfm.estimateWeight(mesh, 'aluminum-6061');
const weightPLA = window.cycleCAD.dfm.estimateWeight(mesh, 'pla');
console.log(`Steel: ${weightSteel.weightKg} kg`);
console.log(`Aluminum: ${weightAluminum.weightKg} kg (${((weightAluminum.weightKg / weightSteel.weightKg) * 100).toFixed(0)}% of steel)`);
console.log(`PLA: ${weightPLA.weightKg} kg`);

// 8. Check tolerance achievability
const toleranceAnalysis = window.cycleCAD.dfm.analyzeTolerance(mesh, [
  { feature: 'bore_diameter', tolerance: 0.05, type: 'dimensional' },
  { feature: 'surface_finish', tolerance: 0.8, type: 'surface' },
  { feature: 'perpendicularity', tolerance: 0.1, type: 'geometric' }
]);
console.table(toleranceAnalysis.tolerances);

// ============================================================================
// REPORT GENERATION
// ============================================================================

// 9. Generate full DFM report and download as HTML
const report = window.cycleCAD.dfm.generateReport(mesh, {
  title: 'Part Analysis - CNC Mill Production',
  process: 'cnc_mill',
  material: 'aluminum-6061',
  quantity: 100
});

// Download
const blob = new Blob([report.html], { type: 'text/html' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `dfm-report-${Date.now()}.html`;
a.click();
URL.revokeObjectURL(url);
console.log('Report downloaded!');

// ============================================================================
// EVENT LISTENING
// ============================================================================

// 10. Listen for analysis events
window.cycleCAD.dfm.on('dfm-analysis-complete', (result) => {
  console.log(`Analysis complete: ${result.processName} Grade ${result.grade}`);
  if (result.issues.length > 0) {
    console.warn(`⚠️  ${result.issues.length} issues found`);
  }
});

window.cycleCAD.dfm.on('dfm-report-generated', (data) => {
  console.log(`Report generated: ${data.title}`);
});

// ============================================================================
// UI PANEL
// ============================================================================

// 11. Create and show the interactive DFM analysis panel
window.cycleCAD.dfm.createPanel();
// Now select a mesh in the 3D view, choose process/material, and click "Analyze"

// ============================================================================
// ADVANCED: PROCESS-SPECIFIC CHECKS
// ============================================================================

// 12. Access the design rules for a process
const fdmRules = window.cycleCAD.dfm.rules['fdm'];
console.log(`FDM Rules: ${fdmRules.description}`);
console.log('Checks:', fdmRules.checks.map(c => c.name));

// 13. Access material properties directly
const steel1018 = window.cycleCAD.dfm.materials['steel-1018'];
console.log(`${steel1018.name}:`);
console.log(`  Tensile: ${steel1018.tensile} MPa`);
console.log(`  Density: ${steel1018.density} g/cm³`);
console.log(`  Cost: €${steel1018.costPerKg}/kg`);
console.log(`  Machinability: ${steel1018.machinability}/10`);

// ============================================================================
// BATCH OPERATIONS (Process ALL parts in scene)
// ============================================================================

// 14. Analyze all parts in the model
if (window.allParts && window.allParts.length > 0) {
  const results = [];
  for (const part of window.allParts) {
    const result = window.cycleCAD.dfm.analyze(part.mesh, 'cnc_mill');
    results.push({
      part: part.name || 'Unknown',
      grade: result.grade,
      score: result.score,
      issues: result.issues.length,
      warnings: result.warnings.length
    });
  }
  console.table(results);
}

// 15. Find best process for all parts
if (window.allParts && window.allParts.length > 0) {
  const processCounts = {};
  for (const part of window.allParts) {
    const result = window.cycleCAD.dfm.analyzeAll(part.mesh);
    const best = result.bestProcess;
    processCounts[best] = (processCounts[best] || 0) + 1;
  }
  console.log('Best manufacturing processes across all parts:');
  console.table(processCounts);
}

// ============================================================================
// DEBUG INTERNALS
// ============================================================================

// 16. Access internal rate tables for debugging
console.log('Machine hourly rates:', window.cycleCAD.dfm._machineRates);
console.log('Time estimates (min/unit):', window.cycleCAD.dfm._timeEstimates);
console.log('Tooling costs:', window.cycleCAD.dfm._toolingCosts);

// ============================================================================
// REAL-WORLD SCENARIO: Select Best Mfg for Volume Ramp
// ============================================================================

// 17. Find the inflection point where injection molding beats CNC
function findCheapestProcess(mesh, quantities = [1, 10, 100, 1000, 10000]) {
  const results = {};
  const processes = Object.keys(window.cycleCAD.dfm.rules);

  for (const qty of quantities) {
    let cheapest = { process: null, cost: Infinity };
    for (const proc of processes) {
      const cost = window.cycleCAD.dfm.estimateCost(mesh, proc, qty, 'steel-1018');
      const perUnit = parseFloat(cost.totalPerUnit);
      if (perUnit < cheapest.cost) {
        cheapest = { process: proc, cost: perUnit };
      }
    }
    results[qty] = cheapest.process;
  }
  return results;
}

const bestByQuantity = findCheapestProcess(mesh);
console.log('Cheapest process by volume:');
console.table(bestByQuantity);

// ============================================================================
// INTERACTIVE: Manual step-by-step analysis
// ============================================================================

// 18. Step 1: Analyze
console.log('Step 1: Analyzing for FDM...');
const step1 = window.cycleCAD.dfm.analyze(mesh, 'fdm');
console.log(`Result: Grade ${step1.grade}`);

// Step 2: Get material recommendation
console.log('\nStep 2: Recommending materials for FDM...');
const step2 = window.cycleCAD.dfm.recommendMaterial({ cost: 'low', strength: 'medium' });
const chosenMaterial = step2[0].materialKey; // Choose top recommendation
console.log(`Recommended: ${step2[0].name}`);

// Step 3: Estimate cost
console.log('\nStep 3: Estimating cost for 100 units...');
const step3 = window.cycleCAD.dfm.estimateCost(mesh, 'fdm', 100, chosenMaterial);
console.log(`Cost per unit: €${step3.totalPerUnit}`);
console.log(`Total batch (100): €${step3.totalBatch}`);

// Step 4: Generate report
console.log('\nStep 4: Generating report...');
const step4 = window.cycleCAD.dfm.generateReport(mesh, {
  title: 'Interactive DFM Analysis',
  process: 'fdm',
  material: chosenMaterial,
  quantity: 100
});
console.log('Report ready. Download with:');
console.log(`const blob = new Blob([${step4.html.substring(0, 50)}...], { type: 'text/html' });`);

console.log('\n✅ All steps complete!');
