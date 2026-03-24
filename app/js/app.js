/**
 * cycleCAD - Main Application Entry Point
 * Wires all modules together and manages application state
 */

import { initViewport, setView, addToScene, removeFromScene, getScene, getCamera } from './viewport.js';
import { startSketch, endSketch, setTool, getEntities } from './sketch.js';
import { extrudeProfile, createPrimitive, rebuildFeature } from './operations.js';
import { initChat, parseCADPrompt } from './ai-chat.js';
import { initTree, addFeature, selectFeature, onSelect } from './tree.js';
import { initParams, showParams, onParamChange } from './params.js';
import { exportSTL, exportOBJ, exportJSON } from './export.js';
import { initShortcuts, showShortcutsPanel } from './shortcuts.js';

// Application state
const APP = {
  mode: 'idle', // idle, sketch, extrude, operation
  currentSketch: null,
  selectedFeature: null,
  selectedEntity: null,
  history: [],
  historyIndex: -1,
  features: [],
  scene: null,
  camera: null,
};

/**
 * Initialize the application
 */
export async function initApp() {
  console.log('Initializing cycleCAD...');

  // Initialize 3D viewport
  const canvas = document.getElementById('three-canvas');
  if (!canvas) {
    console.error('Canvas #three-canvas not found');
    return;
  }

  initViewport(canvas);
  APP.scene = getScene();
  APP.camera = getCamera();

  // Initialize UI panels
  initTree();
  initParams();
  initChat();

  // Setup toolbar buttons
  setupToolbar();

  // Setup feature tree selection flow
  onSelect((featureId) => {
    APP.selectedFeature = APP.features.find((f) => f.id === featureId);
    if (APP.selectedFeature) {
      showParams(APP.selectedFeature);
    }
  });

  // Setup param change flow
  onParamChange((paramName, value) => {
    if (APP.selectedFeature) {
      APP.selectedFeature.params[paramName] = value;
      rebuildFeature(APP.selectedFeature);
      updateScene();
    }
  });

  // Initialize keyboard shortcuts
  initShortcuts(getShortcutHandlers());

  // Initialize AI chat integration
  setupAIChat();

  // Show welcome screen
  showWelcomeScreen();

  console.log('cycleCAD initialized');
}

/**
 * Get keyboard shortcut handlers
 * @returns {Object}
 */
function getShortcutHandlers() {
  return {
    // Sketch operations
    newSketch: () => {
      if (APP.mode === 'idle') {
        startNewSketch();
      }
    },
    line: () => setTool('line'),
    rect: () => setTool('rect'),
    circle: () => setTool('circle'),
    arc: () => setTool('arc'),
    dimension: () => setTool('dimension'),

    // 3D operations
    extrude: () => {
      if (APP.currentSketch && APP.mode === 'sketch') {
        startExtrude();
      }
    },
    revolve: () => console.log('Revolve not yet implemented'),
    fillet: () => console.log('Fillet not yet implemented'),
    chamfer: () => console.log('Chamfer not yet implemented'),

    // Boolean operations
    union: () => console.log('Union not yet implemented'),
    cut: () => console.log('Cut not yet implemented'),

    // Edit
    undo: () => undo(),
    redo: () => redo(),
    delete: () => deleteSelected(),
    escape: () => cancelOperation(),
    enter: () => confirmOperation(),

    // Views
    viewFront: () => setView('front'),
    viewBack: () => setView('back'),
    viewRight: () => setView('right'),
    viewLeft: () => setView('left'),
    viewTop: () => setView('top'),
    viewBottom: () => setView('bottom'),
    viewIso: () => setView('iso'),

    // Display
    toggleGrid: () => toggleGrid(),
    toggleWireframe: () => toggleWireframe(),
    fitAll: () => fitAll(),

    // File
    save: () => saveProject(),
    exportSTL: () => showExportDialog('stl'),

    // Help
    showHelp: () => showShortcutsPanel(),
  };
}

/**
 * Setup toolbar buttons
 */
function setupToolbar() {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  // File buttons
  const newBtn = document.getElementById('btn-new');
  if (newBtn) {
    newBtn.onclick = () => {
      if (confirm('Start a new project? Unsaved changes will be lost.')) {
        APP.features = [];
        APP.history = [];
        APP.historyIndex = -1;
        updateScene();
      }
    };
  }

  const openBtn = document.getElementById('btn-open');
  if (openBtn) {
    openBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const data = JSON.parse(event.target.result);
              loadProject(data);
            } catch (err) {
              alert('Failed to load project: ' + err.message);
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    };
  }

  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) {
    saveBtn.onclick = () => saveProject();
  }

  // Export buttons
  const exportSTLBtn = document.getElementById('btn-export-stl');
  if (exportSTLBtn) {
    exportSTLBtn.onclick = () => showExportDialog('stl');
  }

  const exportOBJBtn = document.getElementById('btn-export-obj');
  if (exportOBJBtn) {
    exportOBJBtn.onclick = () => showExportDialog('obj');
  }

  // Sketch tools
  const sketchBtn = document.getElementById('btn-sketch');
  if (sketchBtn) {
    sketchBtn.onclick = () => startNewSketch();
  }

  const lineBtn = document.getElementById('btn-line');
  if (lineBtn) {
    lineBtn.onclick = () => setTool('line');
  }

  const rectBtn = document.getElementById('btn-rect');
  if (rectBtn) {
    rectBtn.onclick = () => setTool('rect');
  }

  const circleBtn = document.getElementById('btn-circle');
  if (circleBtn) {
    circleBtn.onclick = () => setTool('circle');
  }

  // 3D operations
  const extrudeBtn = document.getElementById('btn-extrude');
  if (extrudeBtn) {
    extrudeBtn.onclick = () => {
      if (APP.mode === 'sketch') {
        startExtrude();
      }
    };
  }

  // View buttons
  const viewFrontBtn = document.getElementById('btn-view-front');
  if (viewFrontBtn) {
    viewFrontBtn.onclick = () => setView('front');
  }

  const viewTopBtn = document.getElementById('btn-view-top');
  if (viewTopBtn) {
    viewTopBtn.onclick = () => setView('top');
  }

  const viewIsoBtn = document.getElementById('btn-view-iso');
  if (viewIsoBtn) {
    viewIsoBtn.onclick = () => setView('iso');
  }

  // Edit buttons
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) {
    undoBtn.onclick = () => undo();
  }

  const redoBtn = document.getElementById('btn-redo');
  if (redoBtn) {
    redoBtn.onclick = () => redo();
  }

  // Display toggles
  const gridBtn = document.getElementById('btn-grid');
  if (gridBtn) {
    gridBtn.onclick = () => toggleGrid();
  }

  const wireframeBtn = document.getElementById('btn-wireframe');
  if (wireframeBtn) {
    wireframeBtn.onclick = () => toggleWireframe();
  }

  const fitBtn = document.getElementById('btn-fit-all');
  if (fitBtn) {
    fitBtn.onclick = () => fitAll();
  }
}

/**
 * Start a new sketch
 */
function startNewSketch() {
  if (APP.mode === 'sketch') {
    alert('Finish current sketch first');
    return;
  }

  APP.mode = 'sketch';
  APP.currentSketch = startSketch();
  updateStatusBar(`Sketch mode. Use L/R/C/A for tools. Press Escape to cancel.`);
}

/**
 * Start extrude operation
 */
function startExtrude() {
  const entities = getEntities();
  if (!entities || entities.length === 0) {
    alert('No sketch geometry to extrude');
    return;
  }

  APP.mode = 'extrude';

  // Prompt for height
  const height = prompt('Enter extrusion height:', '10');
  if (height === null) {
    APP.mode = 'sketch';
    return;
  }

  const h = parseFloat(height);
  if (isNaN(h)) {
    alert('Invalid height');
    return;
  }

  try {
    const mesh3d = extrudeProfile(entities, h);
    endSketch();
    APP.currentSketch = null;
    APP.mode = 'idle';

    // Add to scene
    addToScene(mesh3d);

    // Create feature and add to tree
    const feature = {
      id: 'feature_' + Date.now(),
      name: 'Extrusion',
      type: 'extrude',
      mesh: mesh3d,
      params: { height: h },
    };

    APP.features.push(feature);
    addFeature(feature);
    pushHistory();
    updateStatusBar('Extrusion created');
  } catch (err) {
    console.error('Extrude failed:', err);
    alert('Extrude failed: ' + err.message);
    APP.mode = 'sketch';
  }
}

/**
 * Cancel current operation
 */
function cancelOperation() {
  if (APP.mode === 'sketch') {
    endSketch();
    APP.currentSketch = null;
    APP.mode = 'idle';
    updateStatusBar('Sketch cancelled');
  } else if (APP.mode === 'extrude') {
    APP.mode = 'sketch';
    updateStatusBar('Extrude cancelled');
  }
}

/**
 * Confirm current operation
 */
function confirmOperation() {
  if (APP.mode === 'sketch') {
    // Auto-extrude or prompt
    const entities = getEntities();
    if (entities && entities.length > 0) {
      startExtrude();
    }
  }
}

/**
 * Delete selected feature
 */
function deleteSelected() {
  if (!APP.selectedFeature) return;

  if (confirm(`Delete "${APP.selectedFeature.name}"?`)) {
    removeFromScene(APP.selectedFeature.mesh);
    APP.features = APP.features.filter((f) => f.id !== APP.selectedFeature.id);
    APP.selectedFeature = null;
    updateScene();
    pushHistory();
  }
}

/**
 * Setup AI chat integration
 */
function setupAIChat() {
  // Listen for parsed CAD prompts from AI chat
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  if (chatSend) {
    chatSend.onclick = () => {
      const text = chatInput?.value || '';
      if (!text.trim()) return;

      // Parse prompt with AI
      parseCADPrompt(text).then((parsedPrompt) => {
        if (parsedPrompt && parsedPrompt.action) {
          executeParsedPrompt(parsedPrompt);
        }
      });

      if (chatInput) chatInput.value = '';
    };
  }

  // Allow Enter to send
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatSend?.click();
      }
    });
  }
}

/**
 * Execute a parsed CAD prompt from AI
 * @param {Object} prompt
 */
function executeParsedPrompt(prompt) {
  try {
    // Create primitive based on parsed prompt
    const primitive = createPrimitive(prompt.type, prompt.params);
    addToScene(primitive.mesh);

    const feature = {
      id: 'feature_' + Date.now(),
      name: prompt.name || prompt.type,
      type: prompt.type,
      mesh: primitive.mesh,
      params: prompt.params,
    };

    APP.features.push(feature);
    addFeature(feature);
    pushHistory();
    updateStatusBar(`Created ${feature.name}`);
  } catch (err) {
    console.error('Failed to execute prompt:', err);
    alert('Failed to create feature: ' + err.message);
  }
}

/**
 * Show welcome screen
 */
function showWelcomeScreen() {
  const welcomePanel = document.getElementById('welcome-panel');
  if (!welcomePanel) return;

  welcomePanel.style.display = 'flex';

  const newSketchBtn = welcomePanel.querySelector('[data-action="new-sketch"]');
  if (newSketchBtn) {
    newSketchBtn.onclick = () => {
      welcomePanel.style.display = 'none';
      startNewSketch();
    };
  }

  const aiGenerateBtn = welcomePanel.querySelector('[data-action="ai-generate"]');
  if (aiGenerateBtn) {
    aiGenerateBtn.onclick = () => {
      welcomePanel.style.display = 'none';
      const chatInput = document.getElementById('chat-input');
      if (chatInput) chatInput.focus();
    };
  }

  const importBtn = welcomePanel.querySelector('[data-action="import"]');
  if (importBtn) {
    importBtn.onclick = () => {
      welcomePanel.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const data = JSON.parse(event.target.result);
              loadProject(data);
            } catch (err) {
              alert('Failed to load project: ' + err.message);
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    };
  }
}

/**
 * Update the 3D scene
 */
function updateScene() {
  // Scene will auto-render via viewport's animation loop
}

/**
 * Save project as JSON
 */
function saveProject() {
  const data = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    features: APP.features.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      params: f.params,
    })),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cyclecad_project_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);

  updateStatusBar('Project saved');
}

/**
 * Load project from JSON
 */
function loadProject(data) {
  try {
    // Clear current
    APP.features = [];
    APP.history = [];
    APP.historyIndex = -1;
    updateScene();

    // Rebuild features
    if (data.features && Array.isArray(data.features)) {
      data.features.forEach((featureData) => {
        try {
          const primitive = createPrimitive(featureData.type, featureData.params);
          addToScene(primitive.mesh);

          const feature = {
            id: featureData.id,
            name: featureData.name,
            type: featureData.type,
            mesh: primitive.mesh,
            params: featureData.params,
          };

          APP.features.push(feature);
          addFeature(feature);
        } catch (err) {
          console.warn(`Failed to load feature ${featureData.name}:`, err);
        }
      });
    }

    pushHistory();
    updateStatusBar(`Loaded project with ${APP.features.length} features`);
  } catch (err) {
    console.error('Load project failed:', err);
    alert('Failed to load project: ' + err.message);
  }
}

/**
 * Show export dialog
 */
function showExportDialog(format) {
  if (APP.features.length === 0) {
    alert('No features to export');
    return;
  }

  try {
    let blob;
    let filename;

    if (format === 'stl') {
      blob = exportSTL(APP.features);
      filename = `cyclecad_model_${Date.now()}.stl`;
    } else if (format === 'obj') {
      blob = exportOBJ(APP.features);
      filename = `cyclecad_model_${Date.now()}.obj`;
    }

    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      updateStatusBar(`Exported to ${filename}`);
    }
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export failed: ' + err.message);
  }
}

/**
 * Undo last operation
 */
function undo() {
  if (APP.historyIndex > 0) {
    APP.historyIndex--;
    restoreFromHistory();
    updateStatusBar('Undo');
  }
}

/**
 * Redo last undone operation
 */
function redo() {
  if (APP.historyIndex < APP.history.length - 1) {
    APP.historyIndex++;
    restoreFromHistory();
    updateStatusBar('Redo');
  }
}

/**
 * Restore state from history
 */
function restoreFromHistory() {
  const state = APP.history[APP.historyIndex];
  if (state) {
    // TODO: Implement full state restoration
    console.log('Restore from history:', state);
  }
}

/**
 * Push current state to history
 */
function pushHistory() {
  // Trim redo stack if not at end
  if (APP.historyIndex < APP.history.length - 1) {
    APP.history = APP.history.slice(0, APP.historyIndex + 1);
  }

  // Save state snapshot
  APP.history.push({
    features: JSON.parse(JSON.stringify(APP.features.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      params: f.params,
    })))),
    timestamp: Date.now(),
  });

  APP.historyIndex = APP.history.length - 1;

  // Keep history limited
  if (APP.history.length > 50) {
    APP.history.shift();
    APP.historyIndex--;
  }
}

/**
 * Toggle grid visibility
 */
function toggleGrid() {
  // TODO: Implement grid toggle in viewport
  console.log('Toggle grid');
}

/**
 * Toggle wireframe mode
 */
function toggleWireframe() {
  // TODO: Implement wireframe toggle in viewport
  console.log('Toggle wireframe');
}

/**
 * Fit all features in view
 */
function fitAll() {
  // TODO: Implement fit-all camera animation
  console.log('Fit all');
}

/**
 * Update status bar
 */
function updateStatusBar(message) {
  const statusBar = document.getElementById('status-bar');
  if (statusBar) {
    statusBar.textContent = message;
  }
}

/**
 * Entry point - run when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(console.error);
});

// Export for testing
export { APP, startNewSketch, startExtrude, cancelOperation };
