/**
 * rebuild-guide.js
 * Generates step-by-step reconstruction guides for Inventor parts
 * Supports both cycleCAD and Fusion 360 Free workflows
 *
 * Usage:
 *   const guide = generateGuide(parsedPart);
 *   renderGuide(container, guide);
 *   exportGuideHTML(guide, 'my-part.html');
 */

// Feature type mappings and instructions
const FEATURE_INSTRUCTIONS = {
  Sketch: {
    cycleCAD: {
      text: 'Click Sketch button (S) → Select XY/XZ/YZ plane → Draw profile using Line (L), Rectangle (R), Circle (C) tools → Press Enter to finish',
      steps: [
        'Click Sketch button or press S',
        'Select the appropriate plane (XY, XZ, or YZ)',
        'Use drawing tools: Line (L), Rectangle (R), Circle (C), Arc (A)',
        'Apply constraints: horizontal, vertical, distance, radius',
        'Press Enter to finish sketch'
      ],
      time: '2-5 min'
    },
    fusion360: {
      text: 'DESIGN workspace → CREATE → New Sketch → Select plane → Sketch toolbar (Line, Rectangle, Circle) → Finish Sketch',
      steps: [
        'Switch to DESIGN workspace if needed',
        'Click CREATE → New Sketch',
        'Select the plane or face to sketch on',
        'Use Sketch toolbar: Line, Rectangle, Circle, Arc',
        'Apply geometric and dimensional constraints',
        'Click Finish Sketch'
      ],
      time: '2-5 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Extrude: {
    cycleCAD: {
      text: 'Select sketch profile → Click Extrude (E) → Set distance → Choose direction (one side/symmetric/two sides) → Click OK',
      steps: [
        'Select the sketch profile',
        'Click Extrude button or press E',
        'Set extrusion distance in input field',
        'Choose direction: One Side, Symmetric, or Two Sides',
        'Click OK to apply extrusion'
      ],
      time: '1-2 min'
    },
    fusion360: {
      text: 'Select sketch → DESIGN → CREATE → Extrude → Set distance and direction → OK',
      steps: [
        'Ensure sketch is selected',
        'Click CREATE → Extrude',
        'In properties panel, set distance',
        'Choose operation: New Body, Add, Cut, or Intersect',
        'Select direction: Forward, Backward, or Symmetric',
        'Click OK'
      ],
      time: '1-2 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Revolve: {
    cycleCAD: {
      text: 'Select sketch profile → Click Revolve (V) → Pick axis → Set angle (360° for full revolution) → Click OK',
      steps: [
        'Select the sketch profile',
        'Click Revolve button or press V',
        'Select the axis of revolution from sketch geometry',
        'Set revolution angle (360° for complete revolution)',
        'Choose operation: Add, Cut, or Intersect',
        'Click OK'
      ],
      time: '1-2 min'
    },
    fusion360: {
      text: 'Select sketch → CREATE → Revolve → Pick axis → Set angle → OK',
      steps: [
        'Select sketch profile',
        'Click CREATE → Revolve',
        'Select axis of revolution from sketch',
        'Set angle: 360° for full or partial revolution',
        'Choose operation: New Body, Add, Cut, or Intersect',
        'Click OK'
      ],
      time: '1-2 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Fillet: {
    cycleCAD: {
      text: 'Select edge(s) → Click Fillet (F) → Set radius value → Click OK',
      steps: [
        'Select edge(s) to fillet (hold Ctrl for multiple)',
        'Click Fillet button or press F',
        'Set fillet radius in input field',
        'Preview updates in viewport',
        'Click OK to apply'
      ],
      time: '1 min'
    },
    fusion360: {
      text: 'Select edge(s) → DESIGN → Modify → Fillet → Set radius → OK',
      steps: [
        'Select edge(s) to fillet',
        'Click Modify → Fillet',
        'In properties panel, set radius value',
        'Adjust if needed',
        'Click OK'
      ],
      time: '1 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Chamfer: {
    cycleCAD: {
      text: 'Select edge(s) → Click Chamfer → Set distance and angle → Click OK',
      steps: [
        'Select edge(s) to chamfer',
        'Click Chamfer button',
        'Set chamfer distance and angle',
        'Preview updates',
        'Click OK'
      ],
      time: '1 min'
    },
    fusion360: {
      text: 'Select edge(s) → DESIGN → Modify → Chamfer → Set parameters → OK',
      steps: [
        'Select edge(s)',
        'Click Modify → Chamfer',
        'Set chamfer distance/size',
        'Choose chamfer type: Distance or Angle',
        'Click OK'
      ],
      time: '1 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Hole: {
    cycleCAD: {
      text: 'Select face → Click Hole (H) → Choose type (simple/counterbore/countersink) → Set diameter and depth',
      steps: [
        'Select the face where hole will be placed',
        'Click Hole button or press H',
        'Choose hole type: Simple, Counterbore, or Countersink',
        'Set hole diameter',
        'Set hole depth',
        'Click OK'
      ],
      time: '1-2 min'
    },
    fusion360: {
      text: 'Select face → CREATE → Hole → Choose type → Set parameters → OK',
      steps: [
        'Select face for hole placement',
        'Click CREATE → Hole',
        'Choose hole type: Simple, Counterbore, or Countersink',
        'Set hole diameter from standard or custom value',
        'Set depth',
        'Click OK'
      ],
      time: '1-2 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Mirror: {
    cycleCAD: {
      text: 'Select feature(s) → Click Mirror → Select mirror plane (XY/XZ/YZ) → Click OK',
      steps: [
        'Select feature(s) to mirror',
        'Click Mirror button',
        'Select mirror plane: XY, XZ, or YZ',
        'Preview shows mirrored geometry',
        'Click OK'
      ],
      time: '1 min'
    },
    fusion360: {
      text: 'Select feature(s) → CREATE → Mirror → Select plane → OK',
      steps: [
        'Select feature(s) to mirror',
        'Click CREATE → Mirror',
        'Select mirror plane',
        'Choose operation: New Body or Add',
        'Click OK'
      ],
      time: '1 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Pattern: {
    cycleCAD: {
      text: 'Select feature → Click Pattern (P) → Choose Rectangular/Circular → Set count and spacing → Click OK',
      steps: [
        'Select feature to pattern',
        'Click Pattern button or press P',
        'Choose pattern type: Rectangular or Circular',
        'Set column count and spacing',
        'Set row count and spacing (if rectangular)',
        'Set number of instances (if circular)',
        'Click OK'
      ],
      time: '1-2 min'
    },
    fusion360: {
      text: 'Select feature → CREATE → Pattern → Choose type → Set parameters → OK',
      steps: [
        'Select feature to pattern',
        'Click CREATE → Pattern',
        'Choose Rectangular or Circular Pattern',
        'Set count and spacing parameters',
        'Adjust quantity',
        'Click OK'
      ],
      time: '1-2 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Shell: {
    cycleCAD: {
      text: 'Select face(s) to remove → Click Shell → Set wall thickness → Click OK',
      steps: [
        'Select face(s) to remove (shell operation)',
        'Click Shell button',
        'Set wall thickness value',
        'Preview shows hollowed geometry',
        'Click OK'
      ],
      time: '1 min'
    },
    fusion360: {
      text: 'Select face(s) → DESIGN → Modify → Shell → Set thickness → OK',
      steps: [
        'Select face(s) to remove',
        'Click Modify → Shell',
        'Set wall thickness',
        'Click OK'
      ],
      time: '1 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  Boolean: {
    cycleCAD: {
      text: 'Select bodies → Click Boolean → Choose Union/Cut/Intersect → Click OK',
      steps: [
        'Select first body (or ensure active)',
        'Select second body',
        'Click Boolean button',
        'Choose operation: Union, Cut, or Intersect',
        'Click OK'
      ],
      time: '1 min'
    },
    fusion360: {
      text: 'Select bodies → DESIGN → Modify → Combine → Choose operation → OK',
      steps: [
        'Select first body',
        'Click Modify → Combine',
        'Select second body',
        'Choose operation: Union, Cut, or Intersect',
        'Click OK'
      ],
      time: '1 min',
      note: 'Available in Fusion 360 Free'
    }
  },
  'Sheet Metal Flange': {
    cycleCAD: {
      text: 'Switch to Sheet Metal workspace → Select edge → Create Flange → Set parameters',
      steps: [
        'Switch to Sheet Metal workspace',
        'Select edge on sheet metal face',
        'Click Create Flange',
        'Set flange length and angle',
        'Click OK'
      ],
      time: '1-2 min'
    },
    fusion360: {
      text: 'Switch to SHEET METAL workspace → SELECT → CREATE → Flange → Set parameters → OK',
      steps: [
        'Switch to SHEET METAL workspace',
        'Select edge to flange from',
        'Click CREATE → Flange',
        'Set flange length, angle, and offset',
        'Click OK'
      ],
      time: '1-2 min',
      note: 'Requires SHEET METAL workspace'
    }
  }
};

/**
 * Generate reconstruction guide from parsed Inventor part data
 * @param {Object} parsedPart - Output from inventor-parser.js
 * @returns {Object} Guide with cycleCAD steps, Fusion360 steps, and HTML
 */
export function generateGuide(parsedPart) {
  const { fileName, partType, features = [], metadata = {} } = parsedPart;

  const cycleCADSteps = [];
  const fusion360Steps = [];

  let stepNum = 1;

  // Add intro step
  cycleCADSteps.push({
    num: stepNum,
    type: 'Intro',
    title: `Reconstruct ${fileName}`,
    description: `Part type: ${partType || 'Solid Part'}`,
    time: '< 1 min'
  });

  fusion360Steps.push({
    num: stepNum,
    type: 'Intro',
    title: `Reconstruct ${fileName} in Fusion 360`,
    description: `Part type: ${partType || 'Solid Part'} → Switch to DESIGN workspace`,
    time: '< 1 min',
    note: 'Free version available at fusion360.autodesk.com'
  });

  stepNum++;

  // Process each feature
  features.forEach((feature, idx) => {
    const featureType = feature.type || 'Unknown';
    const instructions = FEATURE_INSTRUCTIONS[featureType];

    if (instructions) {
      const ccInstructions = instructions.cycleCAD;
      const f360Instructions = instructions.fusion360;

      cycleCADSteps.push({
        num: stepNum,
        type: featureType,
        icon: feature.icon || '⚙️',
        title: `${stepNum - 1}. ${featureType}`,
        description: ccInstructions.text,
        detailedSteps: ccInstructions.steps,
        time: ccInstructions.time,
        note: ccInstructions.note
      });

      fusion360Steps.push({
        num: stepNum,
        type: featureType,
        icon: feature.icon || '⚙️',
        title: `${stepNum - 1}. ${featureType}`,
        description: f360Instructions.text,
        detailedSteps: f360Instructions.steps,
        time: f360Instructions.time,
        note: f360Instructions.note
      });

      stepNum++;
    }
  });

  // Add final step
  cycleCADSteps.push({
    num: stepNum,
    type: 'Complete',
    title: `${stepNum - 1}. Save Your Model`,
    description: 'File → Save (Ctrl+S) → Choose format (cycleCAD, STEP, IGES)',
    time: '< 1 min'
  });

  fusion360Steps.push({
    num: stepNum,
    type: 'Complete',
    title: `${stepNum - 1}. Save Your Model`,
    description: 'File → Save → Enter project name → Finish',
    time: '< 1 min',
    note: 'Automatically saved to cloud'
  });

  const html = renderGuideHTML({
    fileName,
    partType,
    cycleCADSteps,
    fusion360Steps,
    estimatedTime: calculateEstimatedTime(cycleCADSteps)
  });

  return {
    cycleCAD: cycleCADSteps,
    fusion360: fusion360Steps,
    html,
    fileName,
    partType
  };
}

/**
 * Render guide into a container
 * @param {HTMLElement} container - Target container
 * @param {Object} guide - Generated guide object
 */
export function renderGuide(container, guide) {
  if (!container) {
    console.error('Container element not found');
    return;
  }
  container.innerHTML = guide.html;

  // Attach tab switcher
  const tabs = container.querySelectorAll('.guide-tab');
  const panels = container.querySelectorAll('.guide-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      container.querySelector(`[data-panel="${tabName}"]`).classList.add('active');
    });
  });

  // Attach export button
  const exportBtn = container.querySelector('.guide-export-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportGuideHTML(guide, `${guide.fileName.split('.')[0]}-rebuild-guide.html`);
    });
  }
}

/**
 * Export guide as standalone HTML file
 * @param {Object} guide - Generated guide object
 * @param {String} fileName - Output filename
 */
export function exportGuideHTML(guide, fileName) {
  const template = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rebuild Guide: ${guide.fileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
      color: #333;
    }
    .guide-container {
      max-width: 1200px;
      margin: 20px auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .guide-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
    }
    .guide-header h1 { font-size: 28px; margin-bottom: 10px; }
    .guide-header p { opacity: 0.9; }
    .guide-meta {
      display: flex;
      gap: 20px;
      margin-top: 15px;
      font-size: 14px;
      opacity: 0.8;
    }
    .guide-tabs {
      display: flex;
      border-bottom: 2px solid #eee;
      background: #fafafa;
    }
    .guide-tab {
      flex: 1;
      padding: 15px;
      text-align: center;
      cursor: pointer;
      font-weight: 500;
      border-bottom: 3px solid transparent;
      transition: all 0.3s;
    }
    .guide-tab:hover { background: #f0f0f0; }
    .guide-tab.active {
      border-bottom-color: #667eea;
      color: #667eea;
      background: white;
    }
    .guide-content {
      padding: 30px;
      display: flex;
      gap: 30px;
    }
    .guide-panel {
      display: none;
      flex: 1;
    }
    .guide-panel.active { display: block; }
    .guide-step {
      margin-bottom: 25px;
      padding: 15px;
      background: #f9f9f9;
      border-left: 4px solid #667eea;
      border-radius: 4px;
    }
    .guide-step.intro, .guide-step.complete {
      background: #f0f4ff;
      border-left-color: #667eea;
    }
    .guide-step-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .guide-step-icon {
      font-size: 24px;
    }
    .guide-step-title {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
    .guide-step-time {
      font-size: 12px;
      color: #999;
      margin-left: auto;
    }
    .guide-step-desc {
      font-size: 14px;
      color: #666;
      margin: 10px 0;
      line-height: 1.5;
    }
    .guide-step-substeps {
      margin-top: 10px;
      padding-left: 20px;
      font-size: 13px;
      color: #555;
    }
    .guide-step-substeps li {
      list-style: decimal;
      margin-bottom: 5px;
    }
    .guide-step-note {
      margin-top: 10px;
      padding: 8px 12px;
      background: #fffacd;
      border-left: 3px solid #ffd700;
      font-size: 12px;
      color: #333;
      border-radius: 3px;
    }
    .guide-footer {
      padding: 20px 30px;
      background: #fafafa;
      border-top: 1px solid #eee;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
    .guide-export-btn {
      display: inline-block;
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      margin-top: 10px;
    }
    .guide-export-btn:hover {
      background: #764ba2;
    }
    @media (max-width: 768px) {
      .guide-content {
        flex-direction: column;
        gap: 0;
      }
      .guide-tabs {
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="guide-container">
    <div class="guide-header">
      <h1>🔧 Rebuild Guide</h1>
      <p>${guide.fileName}</p>
      <div class="guide-meta">
        <span>📋 Part Type: ${guide.partType || 'Solid Part'}</span>
        <span>⏱️ Estimated Time: ${calculateEstimatedTime(guide.cycleCAD)}</span>
      </div>
    </div>

    <div class="guide-tabs">
      <div class="guide-tab active" data-tab="cyclecad">cycleCAD</div>
      <div class="guide-tab" data-tab="fusion360">Fusion 360 Free</div>
    </div>

    <div class="guide-content">
      <div class="guide-panel active" data-panel="cyclecad">
        ${guide.cycleCAD.map(step => renderStep(step)).join('')}
      </div>
      <div class="guide-panel" data-panel="fusion360">
        ${guide.fusion360.map(step => renderStep(step)).join('')}
      </div>
    </div>

    <div class="guide-footer">
      <p>Generated by cycleCAD Rebuild Guide • ${new Date().toLocaleDateString()}</p>
    </div>
  </div>

  <script>
    document.querySelectorAll('.guide-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        const tabName = this.dataset.tab;
        document.querySelectorAll('.guide-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.guide-panel').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        document.querySelector('[data-panel="' + tabName + '"]').classList.add('active');
      });
    });
  </script>
</body>
</html>`;

  const blob = new Blob([template], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

// Helper functions

/**
 * Render step HTML
 */
function renderStep(step) {
  const substeps = step.detailedSteps
    ? `<ol class="guide-step-substeps">${step.detailedSteps.map(s => `<li>${s}</li>`).join('')}</ol>`
    : '';

  const note = step.note ? `<div class="guide-step-note">💡 ${step.note}</div>` : '';

  return `
    <div class="guide-step ${step.type.toLowerCase()}">
      <div class="guide-step-header">
        <span class="guide-step-icon">${step.icon || '⚙️'}</span>
        <span class="guide-step-title">${step.title}</span>
        <span class="guide-step-time">${step.time || ''}</span>
      </div>
      <div class="guide-step-desc">${step.description}</div>
      ${substeps}
      ${note}
    </div>
  `;
}

/**
 * Render complete guide HTML
 */
function renderGuideHTML(data) {
  const cyclecadPanel = data.cycleCADSteps.map(step => renderStep(step)).join('');
  const fusion360Panel = data.fusion360Steps.map(step => renderStep(step)).join('');

  return `
    <div class="guide-wrapper" style="max-width: 1200px; margin: 0 auto; padding: 20px;">
      <div class="guide-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 20px;">
        <h1>🔧 ${data.fileName} - Rebuild Guide</h1>
        <p>Part Type: ${data.partType || 'Solid Part'} | Estimated Time: ${data.estimatedTime}</p>
      </div>

      <div style="display: flex; gap: 20px; margin-bottom: 20px; border-bottom: 2px solid #eee;">
        <button class="guide-tab active" data-tab="cyclecad" style="flex: 1; padding: 15px; background: none; border: none; border-bottom: 3px solid #667eea; cursor: pointer; font-weight: 500;">cycleCAD</button>
        <button class="guide-tab" data-tab="fusion360" style="flex: 1; padding: 15px; background: none; border: none; border-bottom: 3px solid transparent; cursor: pointer; font-weight: 500;">Fusion 360 Free</button>
      </div>

      <div class="guide-panel active" data-panel="cyclecad" style="display: block;">
        ${cyclecadPanel}
      </div>

      <div class="guide-panel" data-panel="fusion360" style="display: none;">
        ${fusion360Panel}
      </div>

      <div style="margin-top: 30px; text-align: center;">
        <button class="guide-export-btn" style="padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">📥 Download as HTML</button>
      </div>
    </div>
  `;
}

/**
 * Calculate estimated time for all steps
 */
function calculateEstimatedTime(steps) {
  const timePattern = /(\d+)-?(\d*)?\s*(?:min|hr)/i;
  let totalMinutes = 0;

  steps.forEach(step => {
    if (step.time) {
      const match = step.time.match(timePattern);
      if (match) {
        const min = parseInt(match[1]);
        const max = match[2] ? parseInt(match[2]) : min;
        totalMinutes += (min + max) / 2;
      }
    }
  });

  if (totalMinutes < 60) {
    return `~${Math.ceil(totalMinutes)} min`;
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
  }
}

export default {
  generateGuide,
  renderGuide,
  exportGuideHTML,
  FEATURE_INSTRUCTIONS
};
