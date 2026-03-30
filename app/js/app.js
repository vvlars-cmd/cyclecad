/**
 * cycleCAD — Main Application Controller
 * Comprehensive application state manager, workspace switching, document handling,
 * undo/redo, preferences, notifications, and global event management.
 *
 * Version: 1.0.0 (Enterprise-grade CAD platform)
 */

import { initViewport, setView, addToScene, removeFromScene, getScene, getCamera, toggleGrid as vpToggleGrid, toggleWireframe as vpToggleWireframe, fitToObject } from './viewport.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { startSketch, endSketch, setTool, getEntities } from './sketch.js';
import { extrudeProfile, createPrimitive, rebuildFeature } from './operations.js';
import { initChat, parseCADPrompt } from './ai-chat.js';
import { initTree, addFeature, selectFeature, onSelect, removeFeature } from './tree.js';
import { initParams, showParams, onParamChange } from './params.js';
import { exportSTL, exportOBJ, exportJSON } from './export.js';
import { initShortcuts, showShortcutsPanel } from './shortcuts.js';

// ============================================================================
// APPLICATION STATE — Core data model
// ============================================================================

/**
 * Main application state object
 * @type {Object}
 */
export const APP = {
  // Core state
  mode: 'idle', // idle | sketch | extrude | operation | render | animation | simulation | manufacture | drawing
  currentWorkspace: 'design', // design | render | animation | simulation | manufacture | drawing
  currentTool: null,

  // Feature data
  features: [],
  selectedFeature: null,
  selectedEntity: null,
  currentSketch: null,
  clipboard: [],

  // History and undo/redo
  history: [],
  historyIndex: -1,
  maxHistorySize: 100,

  // Document metadata
  document: {
    name: 'Untitled',
    units: 'mm',
    author: '',
    created: new Date(),
    modified: new Date(),
    version: 1,
    filepath: null,
    unsavedChanges: false,
  },

  // User preferences
  preferences: {
    theme: 'dark', // dark | light
    gridSnap: true,
    gridSize: 10,
    selectionMode: 'single', // single | multi | box
    language: 'en',
    autoSave: true,
    autoSaveInterval: 300000, // 5 minutes
    performanceMode: 'balanced', // balanced | quality | performance
    showHelpOnStartup: true,
    keyboardShortcuts: {},
  },

  // UI state
  uiState: {
    panelLayout: 'default', // default | minimal | fullscreen
    leftPanelWidth: 280,
    rightPanelWidth: 320,
    bottomPanelHeight: 200,
    showStatusBar: true,
    showToolbar: true,
    showCommandPalette: false,
  },

  // Scene references
  scene: null,
  camera: null,
  renderer: null,

  // Performance metrics
  metrics: {
    fps: 60,
    frameTime: 0,
    meshCount: 0,
    vertexCount: 0,
    memoryUsage: 0,
  },

  // Recent files
  recentFiles: [],
  maxRecentFiles: 10,
};

// Event system for pub/sub
const eventListeners = {};

/**
 * Subscribe to application events
 * @param {string} eventName - Event name (e.g., 'selection:changed', 'history:pushed', 'document:saved')
 * @param {Function} callback - Callback function
 */
export function on(eventName, callback) {
  if (!eventListeners[eventName]) {
    eventListeners[eventName] = [];
  }
  eventListeners[eventName].push(callback);
}

/**
 * Unsubscribe from application events
 * @param {string} eventName
 * @param {Function} callback
 */
export function off(eventName, callback) {
  if (!eventListeners[eventName]) return;
  eventListeners[eventName] = eventListeners[eventName].filter(cb => cb !== callback);
}

/**
 * Emit application event
 * @param {string} eventName
 * @param {*} data
 */
function emit(eventName, data) {
  if (!eventListeners[eventName]) return;
  eventListeners[eventName].forEach(callback => {
    try {
      callback(data);
    } catch (err) {
      console.error(`Event handler error for ${eventName}:`, err);
    }
  });
}

// ============================================================================
// WORKSPACE MANAGER — Switch between workspaces
// ============================================================================

const WORKSPACES = {
  design: {
    name: 'Design',
    toolbars: ['file', 'sketch', 'operations', 'assembly', 'view', 'help'],
    activeModules: ['viewport', 'sketch', 'operations', 'tree', 'params'],
  },
  render: {
    name: 'Render',
    toolbars: ['file', 'materials', 'lighting', 'render', 'view', 'help'],
    activeModules: ['viewport', 'materials', 'lighting'],
  },
  animation: {
    name: 'Animation',
    toolbars: ['file', 'timeline', 'animation', 'keyframe', 'view', 'help'],
    activeModules: ['viewport', 'timeline', 'animation'],
  },
  simulation: {
    name: 'Simulation',
    toolbars: ['file', 'simulation', 'solver', 'results', 'view', 'help'],
    activeModules: ['viewport', 'simulation', 'solver'],
  },
  manufacture: {
    name: 'Manufacture',
    toolbars: ['file', 'cam', 'toolpaths', 'tooling', 'view', 'help'],
    activeModules: ['viewport', 'cam', 'toolpaths'],
  },
  drawing: {
    name: 'Drawing',
    toolbars: ['file', 'views', 'dimensions', 'annotations', 'view', 'help'],
    activeModules: ['viewport', 'drawing', 'dimensions'],
  },
};

/**
 * Switch to a different workspace
 * @param {string} workspaceName - Name of workspace (design, render, animation, simulation, manufacture, drawing)
 */
export function switchWorkspace(workspaceName) {
  if (!WORKSPACES[workspaceName]) {
    console.warn(`Unknown workspace: ${workspaceName}`);
    return;
  }

  const workspace = WORKSPACES[workspaceName];
  APP.currentWorkspace = workspaceName;

  // Update toolbar visibility
  const toolbar = document.getElementById('toolbar');
  if (toolbar) {
    const toolbarGroups = toolbar.querySelectorAll('[data-toolbar-group]');
    toolbarGroups.forEach(group => {
      const groupName = group.getAttribute('data-toolbar-group');
      group.style.display = workspace.toolbars.includes(groupName) ? 'flex' : 'none';
    });
  }

  // Update status bar
  updateStatusBar(`Switched to ${workspace.name} workspace`);
  emit('workspace:changed', workspaceName);

  // Fit view after workspace change
  setTimeout(() => fitAll(), 100);
}

// ============================================================================
// DOCUMENT MANAGER — File operations
// ============================================================================

/**
 * Create a new document with optional template
 * @param {string} [templateName] - Optional template name
 */
export function newDocument(templateName) {
  if (APP.document.unsavedChanges) {
    if (!confirm('Discard unsaved changes?')) return;
  }

  // Clear current document
  APP.features.forEach(f => {
    if (f.mesh) removeFromScene(f.mesh);
  });

  APP.features = [];
  APP.history = [];
  APP.historyIndex = -1;
  APP.selectedFeature = null;
  APP.selectedEntity = null;
  APP.currentSketch = null;

  // Initialize new document
  APP.document = {
    name: templateName ? `${templateName} Document` : 'Untitled',
    units: 'mm',
    author: APP.preferences.author || '',
    created: new Date(),
    modified: new Date(),
    version: 1,
    filepath: null,
    unsavedChanges: false,
  };

  updateWindowTitle();
  updateStatusBar('New document created');
  emit('document:created', APP.document);
}

/**
 * Open a document from file
 */
export function openDocument() {
  if (APP.document.unsavedChanges) {
    if (!confirm('Discard unsaved changes?')) return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.ccad';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          loadDocumentData(data, file.name);
        } catch (err) {
          showNotification(`Failed to load: ${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}

/**
 * Load document data
 * @param {Object} data - Document data
 * @param {string} [filename] - Original filename
 */
function loadDocumentData(data, filename) {
  try {
    // Clear current
    APP.features.forEach(f => {
      if (f.mesh) removeFromScene(f.mesh);
    });

    APP.features = [];
    APP.history = [];
    APP.historyIndex = -1;

    // Restore document metadata
    APP.document = {
      name: data.name || filename || 'Loaded',
      units: data.units || 'mm',
      author: data.author || '',
      created: data.created ? new Date(data.created) : new Date(),
      modified: data.modified ? new Date(data.modified) : new Date(),
      version: data.version || 1,
      filepath: null,
      unsavedChanges: false,
    };

    // Rebuild features
    if (data.features && Array.isArray(data.features)) {
      data.features.forEach((featureData) => {
        try {
          const primitive = createPrimitive(featureData.type, featureData.params);
          addToScene(primitive.mesh);

          const feature = {
            id: featureData.id || `feature_${Date.now()}`,
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
    addToRecentFiles(APP.document.name);
    updateWindowTitle();
    updateStatusBar(`Loaded ${APP.features.length} features`);
    emit('document:loaded', APP.document);
  } catch (err) {
    console.error('Load failed:', err);
    showNotification(`Load failed: ${err.message}`, 'error');
  }
}

/**
 * Save current document
 */
export function saveDocument() {
  const data = {
    version: '1.0',
    name: APP.document.name,
    units: APP.document.units,
    author: APP.document.author,
    created: APP.document.created.toISOString(),
    modified: new Date().toISOString(),
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
  a.download = `${APP.document.name}_${new Date().toISOString().split('T')[0]}.ccad`;
  a.click();
  URL.revokeObjectURL(url);

  APP.document.unsavedChanges = false;
  APP.document.modified = new Date();
  updateWindowTitle();
  updateStatusBar('Document saved');
  emit('document:saved', APP.document);
}

/**
 * Add filename to recent files list
 * @param {string} filename
 */
function addToRecentFiles(filename) {
  APP.recentFiles = [filename, ...APP.recentFiles.filter(f => f !== filename)];
  if (APP.recentFiles.length > APP.maxRecentFiles) {
    APP.recentFiles = APP.recentFiles.slice(0, APP.maxRecentFiles);
  }
  localStorage.setItem('cyclecad_recent_files', JSON.stringify(APP.recentFiles));
}

/**
 * Load recent files from storage
 */
function loadRecentFiles() {
  const stored = localStorage.getItem('cyclecad_recent_files');
  if (stored) {
    try {
      APP.recentFiles = JSON.parse(stored);
    } catch (err) {
      APP.recentFiles = [];
    }
  }
}

// ============================================================================
// SELECTION MANAGER — Part selection and filtering
// ============================================================================

/**
 * Select a feature
 * @param {string} featureId - Feature ID
 * @param {Object} [options] - Selection options
 */
export function selectFeatureById(featureId, options = {}) {
  const { multiSelect = false, silent = false } = options;

  const feature = APP.features.find(f => f.id === featureId);
  if (!feature) {
    console.warn(`Feature not found: ${featureId}`);
    return;
  }

  if (!multiSelect) {
    APP.selectedFeature = feature;
  }

  if (!silent) {
    showParams(feature);
    updateStatusBar(`Selected: ${feature.name}`);
    emit('selection:changed', { feature, multiSelect });
  }
}

/**
 * Clear selection
 */
export function clearSelection() {
  APP.selectedFeature = null;
  APP.selectedEntity = null;
  updateStatusBar('Selection cleared');
  emit('selection:cleared', null);
}

/**
 * Select multiple features by box (rect selection)
 * @param {THREE.Vector3} start - Start point
 * @param {THREE.Vector3} end - End point
 */
export function boxSelectFeatures(start, end) {
  const box = new THREE.Box3(start, end);

  APP.features.forEach(feature => {
    if (feature.mesh) {
      const featureBox = new THREE.Box3().setFromObject(feature.mesh);
      if (box.intersectsBox(featureBox)) {
        selectFeatureById(feature.id, { multiSelect: true, silent: true });
      }
    }
  });

  emit('selection:changed', { features: [APP.selectedFeature], boxSelect: true });
}

// ============================================================================
// UNDO/REDO SYSTEM — History management
// ============================================================================

/**
 * Push current state to undo/redo stack
 */
export function pushHistory() {
  // Trim redo stack if not at end
  if (APP.historyIndex < APP.history.length - 1) {
    APP.history = APP.history.slice(0, APP.historyIndex + 1);
  }

  // Save state snapshot
  const state = {
    features: APP.features.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      params: JSON.parse(JSON.stringify(f.params)),
    })),
    timestamp: Date.now(),
  };

  APP.history.push(state);
  APP.historyIndex = APP.history.length - 1;

  // Limit history size
  if (APP.history.length > APP.maxHistorySize) {
    APP.history.shift();
    APP.historyIndex--;
  }

  APP.document.unsavedChanges = true;
  updateWindowTitle();
  emit('history:pushed', state);
}

/**
 * Undo last operation
 */
export function undo() {
  if (APP.historyIndex <= 0) {
    showNotification('Nothing to undo', 'info');
    return;
  }

  APP.historyIndex--;
  restoreFromHistory();
  updateStatusBar('Undo');
  emit('history:undo', APP.history[APP.historyIndex]);
}

/**
 * Redo last undone operation
 */
export function redo() {
  if (APP.historyIndex >= APP.history.length - 1) {
    showNotification('Nothing to redo', 'info');
    return;
  }

  APP.historyIndex++;
  restoreFromHistory();
  updateStatusBar('Redo');
  emit('history:redo', APP.history[APP.historyIndex]);
}

/**
 * Restore state from history at current index
 */
function restoreFromHistory() {
  const state = APP.history[APP.historyIndex];
  if (!state) return;

  // Clear scene
  APP.features.forEach(f => {
    if (f.mesh) removeFromScene(f.mesh);
  });

  // Restore features
  APP.features = [];
  APP.selectedFeature = null;

  if (state.features && Array.isArray(state.features)) {
    state.features.forEach((featureData) => {
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
        console.warn(`Failed to restore feature ${featureData.name}:`, err);
      }
    });
  }

  APP.document.unsavedChanges = true;
  updateWindowTitle();
}

// ============================================================================
// PREFERENCES MANAGER — User settings persistence
// ============================================================================

/**
 * Load preferences from localStorage
 */
function loadPreferences() {
  const stored = localStorage.getItem('cyclecad_preferences');
  if (stored) {
    try {
      const prefs = JSON.parse(stored);
      APP.preferences = { ...APP.preferences, ...prefs };
    } catch (err) {
      console.warn('Failed to load preferences:', err);
    }
  }
}

/**
 * Save preferences to localStorage
 */
export function savePreferences() {
  localStorage.setItem('cyclecad_preferences', JSON.stringify(APP.preferences));
  emit('preferences:changed', APP.preferences);
}

/**
 * Update a preference
 * @param {string} key - Preference key
 * @param {*} value - New value
 */
export function setPreference(key, value) {
  const keys = key.split('.');
  let obj = APP.preferences;

  for (let i = 0; i < keys.length - 1; i++) {
    obj = obj[keys[i]];
  }

  obj[keys[keys.length - 1]] = value;
  savePreferences();
}

/**
 * Get a preference value
 * @param {string} key - Preference key
 * @returns {*}
 */
export function getPreference(key) {
  const keys = key.split('.');
  let obj = APP.preferences;

  for (const k of keys) {
    obj = obj[k];
    if (obj === undefined) return undefined;
  }

  return obj;
}

/**
 * Toggle theme between light and dark
 */
export function toggleTheme() {
  const newTheme = APP.preferences.theme === 'dark' ? 'light' : 'dark';
  setPreference('theme', newTheme);

  document.documentElement.setAttribute('data-theme', newTheme);
  updateStatusBar(`Theme: ${newTheme}`);
}

// ============================================================================
// TOOL MANAGER — Tool activation and state
// ============================================================================

/**
 * Activate a tool
 * @param {string} toolName - Tool name (line, circle, rect, extrude, etc.)
 */
export function activateTool(toolName) {
  if (APP.currentTool === toolName) {
    return; // Already active
  }

  // Deactivate previous tool
  if (APP.currentTool) {
    deactivateTool();
  }

  APP.currentTool = toolName;

  // Highlight tool button
  const btn = document.querySelector(`[data-tool="${toolName}"]`);
  if (btn) {
    btn.classList.add('active');
  }

  // Set mode and update UI
  if (toolName === 'sketch') {
    APP.mode = 'sketch';
    APP.currentSketch = startSketch();
  } else if (['extrude', 'revolve', 'fillet', 'chamfer'].includes(toolName)) {
    APP.mode = 'operation';
  }

  updateStatusBar(`Tool: ${toolName}`);
  emit('tool:activated', toolName);
}

/**
 * Deactivate current tool
 */
export function deactivateTool() {
  if (!APP.currentTool) return;

  const btn = document.querySelector(`[data-tool="${APP.currentTool}"]`);
  if (btn) {
    btn.classList.remove('active');
  }

  // Cancel sketching
  if (APP.mode === 'sketch' && APP.currentSketch) {
    endSketch();
    APP.currentSketch = null;
  }

  APP.currentTool = null;
  APP.mode = 'idle';
  updateStatusBar('Tool deactivated');
  emit('tool:deactivated', null);
}

/**
 * Cancel current tool operation
 */
export function cancelTool() {
  deactivateTool();
  updateStatusBar('Operation cancelled');
}

// ============================================================================
// NOTIFICATION SYSTEM — Toast and modal dialogs
// ============================================================================

/**
 * Show a notification toast
 * @param {string} message - Message text
 * @param {string} [type='info'] - Type: info, success, warning, error
 * @param {number} [duration=3000] - Duration in milliseconds
 */
export function showNotification(message, type = 'info', duration = 3000) {
  const container = document.getElementById('notifications') || createNotificationsContainer();

  const toast = document.createElement('div');
  toast.className = `notification notification-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    padding: 12px 16px;
    margin: 8px;
    background: ${getNotificationColor(type)};
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    animation: slideIn 0.3s ease-out;
    max-width: 300px;
    word-wrap: break-word;
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return toast;
}

function getNotificationColor(type) {
  const colors = {
    info: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
  };
  return colors[type] || colors.info;
}

function createNotificationsContainer() {
  const container = document.createElement('div');
  container.id = 'notifications';
  container.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    max-width: 400px;
  `;
  document.body.appendChild(container);
  return container;
}

/**
 * Show a confirmation dialog
 * @param {string} message - Dialog message
 * @param {string} [title='Confirm'] - Dialog title
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog(message, title = 'Confirm') {
  return new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
      <div style="background: var(--bg-secondary); padding: 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 400px;">
        <h3 style="margin: 0 0 12px 0;">${escapeHtml(title)}</h3>
        <p style="margin: 0 0 20px 0; color: var(--text-secondary);">${escapeHtml(message)}</p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button onclick="this.parentElement.parentElement.parentElement.remove();" style="padding: 8px 16px; background: var(--bg-tertiary); border: none; border-radius: 4px; cursor: pointer;">Cancel</button>
          <button onclick="window._resolveConfirm(true); this.parentElement.parentElement.parentElement.remove();" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">OK</button>
        </div>
      </div>
    `;
    dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;

    window._resolveConfirm = (result) => {
      resolve(result);
      delete window._resolveConfirm;
    };

    document.body.appendChild(dialog);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show progress bar for long-running operations
 * @param {string} [message='Processing...'] - Progress message
 * @returns {Object} Progress controller
 */
export function showProgress(message = 'Processing...') {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: var(--bg-secondary);
    padding: 12px 16px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 10000;
    min-width: 300px;
  `;

  container.innerHTML = `
    <div style="margin-bottom: 8px; font-size: 12px; color: var(--text-secondary);">${message}</div>
    <div style="width: 100%; height: 4px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden;">
      <div style="height: 100%; background: #3b82f6; width: 0%; transition: width 0.3s ease-out;"></div>
    </div>
  `;

  document.body.appendChild(container);

  const progressBar = container.querySelector('div:last-child > div');

  return {
    update: (percent) => {
      progressBar.style.width = Math.min(100, Math.max(0, percent)) + '%';
    },
    close: () => {
      container.remove();
    },
  };
}

// ============================================================================
// COMMAND PALETTE — Global command search (Ctrl+Shift+P)
// ============================================================================

const commands = [
  { name: 'New Document', category: 'File', action: newDocument },
  { name: 'Open Document', category: 'File', action: openDocument },
  { name: 'Save', category: 'File', action: saveDocument },
  { name: 'Undo', category: 'Edit', action: undo },
  { name: 'Redo', category: 'Edit', action: redo },
  { name: 'Delete', category: 'Edit', action: deleteSelected },
  { name: 'Toggle Grid', category: 'View', action: toggleGrid },
  { name: 'Toggle Wireframe', category: 'View', action: toggleWireframe },
  { name: 'Fit All', category: 'View', action: fitAll },
  { name: 'Toggle Theme', category: 'Settings', action: toggleTheme },
];

/**
 * Show command palette (Ctrl+Shift+P)
 */
export function showCommandPalette() {
  if (APP.uiState.showCommandPalette) return;

  APP.uiState.showCommandPalette = true;

  const dialog = document.createElement('div');
  dialog.className = 'command-palette';
  dialog.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999;" onclick="if (event.target === this) this.parentElement.remove();"></div>
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg-secondary); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; width: 90%; max-width: 500px;">
      <input type="text" id="command-input" placeholder="Search commands..." style="width: 100%; padding: 12px 16px; border: none; border-bottom: 1px solid var(--bg-tertiary); background: transparent; color: var(--text-primary); font-size: 14px; box-sizing: border-box;">
      <div id="command-list" style="max-height: 400px; overflow-y: auto;"></div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = document.getElementById('command-input');
  const list = document.getElementById('command-list');

  input.focus();
  renderCommandList(commands, list);

  input.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query)
    );
    renderCommandList(filtered, list);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dialog.remove();
      APP.uiState.showCommandPalette = false;
    } else if (e.key === 'Enter') {
      const selected = list.querySelector('.selected');
      if (selected) {
        const cmd = commands.find(c => c.name === selected.textContent.split('\n')[0]);
        if (cmd && cmd.action) {
          cmd.action();
          dialog.remove();
          APP.uiState.showCommandPalette = false;
        }
      }
    }
  });
}

function renderCommandList(filteredCommands, container) {
  container.innerHTML = '';

  const grouped = {};
  filteredCommands.forEach(cmd => {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  });

  Object.keys(grouped).forEach(category => {
    const group = document.createElement('div');
    group.innerHTML = `<div style="padding: 8px 16px; color: var(--text-secondary); font-size: 11px; font-weight: bold; text-transform: uppercase;">${category}</div>`;

    grouped[category].forEach(cmd => {
      const item = document.createElement('div');
      item.innerHTML = `<div style="padding: 8px 16px; cursor: pointer; color: var(--text-primary);">${cmd.name}</div>`;
      item.style.cursor = 'pointer';
      item.onmouseenter = () => item.classList.add('selected');
      item.onmouseleave = () => item.classList.remove('selected');
      item.onclick = () => {
        if (cmd.action) cmd.action();
        document.querySelector('.command-palette').parentElement.remove();
        APP.uiState.showCommandPalette = false;
      };
      group.appendChild(item);
    });

    container.appendChild(group);
  });
}

// ============================================================================
// PERFORMANCE MONITOR — FPS and metrics
// ============================================================================

let frameCount = 0;
let lastTime = performance.now();

function updateMetrics() {
  const now = performance.now();
  const deltaTime = now - lastTime;

  frameCount++;

  if (deltaTime >= 1000) {
    APP.metrics.fps = Math.round(frameCount * 1000 / deltaTime);
    APP.metrics.frameTime = deltaTime / frameCount;

    // Update metrics display
    const metricsPanel = document.getElementById('metrics-panel');
    if (metricsPanel) {
      metricsPanel.innerHTML = `
        <div style="font-size: 11px; font-family: monospace;">
          FPS: ${APP.metrics.fps}<br>
          Frame: ${APP.metrics.frameTime.toFixed(2)}ms<br>
          Parts: ${APP.metrics.meshCount}<br>
          Verts: ${APP.metrics.vertexCount}
        </div>
      `;
    }

    frameCount = 0;
    lastTime = now;
  }

  // Count meshes and vertices
  APP.metrics.meshCount = APP.features.length;
  APP.metrics.vertexCount = APP.features.reduce((sum, f) => {
    if (f.mesh && f.mesh.geometry) {
      return sum + (f.mesh.geometry.attributes.position?.count || 0);
    }
    return sum;
  }, 0);
}

// ============================================================================
// INITIALIZATION & STARTUP
// ============================================================================

/**
 * Main application initialization
 */
export async function initApp() {
  console.log('Initializing cycleCAD v1.0.0...');

  // 1. Load preferences and recent files
  loadPreferences();
  loadRecentFiles();

  // 2. Apply theme
  document.documentElement.setAttribute('data-theme', APP.preferences.theme);

  // 3. Initialize 3D viewport
  const canvas = document.getElementById('three-canvas');
  if (!canvas) {
    console.error('Canvas #three-canvas not found');
    return;
  }

  initViewport(canvas);
  APP.scene = getScene();
  APP.camera = getCamera();

  // 4. Initialize UI panels
  initTree();
  initParams();
  initChat();

  // 5. Setup toolbar and event listeners
  setupToolbar();
  setupKeyboardShortcuts();
  setupAIChat();
  setupGlobalEventHandlers();

  // 6. Feature tree selection flow
  onSelect((featureId) => {
    selectFeatureById(featureId);
  });

  // 7. Parameter change flow
  onParamChange((paramName, value) => {
    if (APP.selectedFeature) {
      APP.selectedFeature.params[paramName] = value;
      rebuildFeature(APP.selectedFeature);
      pushHistory();
    }
  });

  // 8. Initialize keyboard shortcuts
  initShortcuts(getShortcutHandlers());

  // 9. Setup auto-save
  if (APP.preferences.autoSave) {
    setInterval(() => {
      if (APP.document.unsavedChanges) {
        saveDocument();
      }
    }, APP.preferences.autoSaveInterval);
  }

  // 10. Start animation loop
  animate();

  // 11. Show welcome screen
  showWelcomeScreen();

  updateWindowTitle();
  updateStatusBar('cycleCAD ready');
  emit('app:initialized', APP);

  console.log('cycleCAD initialized successfully');
}

/**
 * Setup global keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+S / Cmd+S - Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveDocument();
      return;
    }

    // Ctrl+Z / Cmd+Z - Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    // Ctrl+Y / Cmd+Y - Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      redo();
      return;
    }

    // Ctrl+N / Cmd+N - New
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      newDocument();
      return;
    }

    // Ctrl+O / Cmd+O - Open
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      openDocument();
      return;
    }

    // Ctrl+Shift+P - Command Palette
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'p') {
      e.preventDefault();
      showCommandPalette();
      return;
    }

    // Escape - Cancel current tool
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelTool();
      return;
    }

    // Delete - Delete selected
    if (e.key === 'Delete') {
      e.preventDefault();
      deleteSelected();
      return;
    }
  });
}

/**
 * Setup global event handlers
 */
function setupGlobalEventHandlers() {
  // Window resize
  window.addEventListener('resize', () => {
    const canvas = document.getElementById('three-canvas');
    if (canvas) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      if (APP.camera) {
        APP.camera.aspect = canvas.width / canvas.height;
        APP.camera.updateProjectionMatrix();
      }
    }
  });

  // Before unload - prompt if unsaved
  window.addEventListener('beforeunload', (e) => {
    if (APP.document.unsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Visibility change - pause/resume
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Auto-save before hiding
      if (APP.document.unsavedChanges) {
        saveDocument();
      }
    }
  });

  // Drag and drop for file import
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();

    const files = e.dataTransfer.files;
    for (const file of files) {
      if (file.type === 'application/json' || file.name.endsWith('.ccad')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            loadDocumentData(data, file.name);
          } catch (err) {
            showNotification(`Failed to load: ${err.message}`, 'error');
          }
        };
        reader.readAsText(file);
      }
    }
  });
}

/**
 * Setup toolbar buttons
 */
function setupToolbar() {
  // File buttons
  const newBtn = document.getElementById('btn-new');
  if (newBtn) newBtn.onclick = () => newDocument();

  const openBtn = document.getElementById('btn-open');
  if (openBtn) openBtn.onclick = () => openDocument();

  const saveBtn = document.getElementById('btn-save');
  if (saveBtn) saveBtn.onclick = () => saveDocument();

  // Sketch tools
  const sketchBtn = document.getElementById('btn-sketch');
  if (sketchBtn) sketchBtn.onclick = () => activateTool('sketch');

  const lineBtn = document.getElementById('btn-line');
  if (lineBtn) lineBtn.onclick = () => activateTool('line');

  const rectBtn = document.getElementById('btn-rect');
  if (rectBtn) rectBtn.onclick = () => activateTool('rect');

  const circleBtn = document.getElementById('btn-circle');
  if (circleBtn) circleBtn.onclick = () => activateTool('circle');

  // 3D operations
  const extrudeBtn = document.getElementById('btn-extrude');
  if (extrudeBtn) extrudeBtn.onclick = () => startExtrude();

  // View buttons
  const viewFrontBtn = document.getElementById('btn-view-front');
  if (viewFrontBtn) viewFrontBtn.onclick = () => setView('front');

  const viewTopBtn = document.getElementById('btn-view-top');
  if (viewTopBtn) viewTopBtn.onclick = () => setView('top');

  const viewIsoBtn = document.getElementById('btn-view-iso');
  if (viewIsoBtn) viewIsoBtn.onclick = () => setView('iso');

  // Edit buttons
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) undoBtn.onclick = () => undo();

  const redoBtn = document.getElementById('btn-redo');
  if (redoBtn) redoBtn.onclick = () => redo();

  // Display toggles
  const gridBtn = document.getElementById('btn-grid');
  if (gridBtn) gridBtn.onclick = () => toggleGrid();

  const wireframeBtn = document.getElementById('btn-wireframe');
  if (wireframeBtn) wireframeBtn.onclick = () => toggleWireframe();

  const fitBtn = document.getElementById('btn-fit-all');
  if (fitBtn) fitBtn.onclick = () => fitAll();
}

/**
 * Get keyboard shortcut handlers
 */
function getShortcutHandlers() {
  return {
    newSketch: () => activateTool('sketch'),
    line: () => activateTool('line'),
    rect: () => activateTool('rect'),
    circle: () => activateTool('circle'),
    extrude: () => startExtrude(),
    undo: () => undo(),
    redo: () => redo(),
    delete: () => deleteSelected(),
    escape: () => cancelTool(),
    viewFront: () => setView('front'),
    viewBack: () => setView('back'),
    viewRight: () => setView('right'),
    viewLeft: () => setView('left'),
    viewTop: () => setView('top'),
    viewBottom: () => setView('bottom'),
    viewIso: () => setView('iso'),
    toggleGrid: () => toggleGrid(),
    toggleWireframe: () => toggleWireframe(),
    fitAll: () => fitAll(),
    save: () => saveDocument(),
    showHelp: () => showShortcutsPanel(),
  };
}

/**
 * Setup AI chat integration
 */
function setupAIChat() {
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  if (chatSend) {
    chatSend.onclick = () => {
      const text = chatInput?.value || '';
      if (!text.trim()) return;

      parseCADPrompt(text).then((parsedPrompt) => {
        if (parsedPrompt && parsedPrompt.action) {
          executeParsedPrompt(parsedPrompt);
        }
      });

      if (chatInput) chatInput.value = '';
    };
  }

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
 * Show welcome screen
 */
function showWelcomeScreen() {
  if (!APP.preferences.showHelpOnStartup) return;

  const welcomePanel = document.getElementById('welcome-panel');
  if (!welcomePanel) return;

  welcomePanel.style.display = 'flex';

  const newSketchBtn = welcomePanel.querySelector('[data-action="new-sketch"]');
  if (newSketchBtn) {
    newSketchBtn.onclick = () => {
      welcomePanel.style.display = 'none';
      activateTool('sketch');
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
      openDocument();
    };
  }
}

/**
 * Start a new sketch
 */
function startNewSketch() {
  activateTool('sketch');
  updateStatusBar('Sketch mode active. Press Escape to cancel.');
}

/**
 * Start extrude operation
 */
function startExtrude() {
  const entities = getEntities();
  if (!entities || entities.length === 0) {
    showNotification('No sketch geometry to extrude', 'warning');
    return;
  }

  APP.mode = 'extrude';

  const height = prompt('Enter extrusion height (mm):', '10');
  if (height === null) {
    APP.mode = 'idle';
    return;
  }

  const h = parseFloat(height);
  if (isNaN(h)) {
    showNotification('Invalid height value', 'error');
    return;
  }

  try {
    const mesh3d = extrudeProfile(entities, h);
    endSketch();
    APP.currentSketch = null;
    APP.mode = 'idle';

    addToScene(mesh3d);

    const feature = {
      id: `feature_${Date.now()}`,
      name: 'Extrusion',
      type: 'extrude',
      mesh: mesh3d,
      params: { height: h },
    };

    APP.features.push(feature);
    addFeature(feature);
    pushHistory();
    showNotification('Extrusion created', 'success');
    deactivateTool();
  } catch (err) {
    console.error('Extrude failed:', err);
    showNotification(`Extrude failed: ${err.message}`, 'error');
    APP.mode = 'idle';
  }
}

/**
 * Execute a parsed CAD prompt from AI
 */
function executeParsedPrompt(prompt) {
  try {
    const primitive = createPrimitive(prompt.type, prompt.params);
    addToScene(primitive.mesh);

    const feature = {
      id: `feature_${Date.now()}`,
      name: prompt.name || prompt.type,
      type: prompt.type,
      mesh: primitive.mesh,
      params: prompt.params,
    };

    APP.features.push(feature);
    addFeature(feature);
    pushHistory();
    showNotification(`Created ${feature.name}`, 'success');
  } catch (err) {
    console.error('Failed to execute prompt:', err);
    showNotification(`Failed to create feature: ${err.message}`, 'error');
  }
}

/**
 * Delete selected feature
 */
function deleteSelected() {
  if (!APP.selectedFeature) {
    showNotification('Nothing selected', 'info');
    return;
  }

  showConfirmDialog(`Delete "${APP.selectedFeature.name}"?`, 'Delete Feature').then(result => {
    if (result) {
      removeFromScene(APP.selectedFeature.mesh);
      const idx = APP.features.findIndex(f => f.id === APP.selectedFeature.id);
      if (idx >= 0) {
        removeFeature(APP.selectedFeature.id);
        APP.features.splice(idx, 1);
      }
      APP.selectedFeature = null;
      pushHistory();
      showNotification('Feature deleted', 'success');
    }
  });
}

/**
 * Toggle grid visibility
 */
function toggleGrid() {
  const btn = document.getElementById('btn-grid');
  const isVisible = btn ? btn.classList.contains('active') : false;

  vpToggleGrid(!isVisible);

  if (btn) {
    btn.classList.toggle('active');
  }

  updateStatusBar(isVisible ? 'Grid hidden' : 'Grid visible');
}

/**
 * Toggle wireframe mode
 */
function toggleWireframe() {
  const btn = document.getElementById('btn-wireframe');
  const isWireframe = btn ? btn.classList.contains('active') : false;

  vpToggleWireframe(!isWireframe);

  if (btn) {
    btn.classList.toggle('active');
  }

  updateStatusBar(isWireframe ? 'Solid shading' : 'Wireframe mode');
}

/**
 * Fit all features in view
 */
function fitAll() {
  if (APP.features.length === 0) {
    updateStatusBar('No features to fit');
    return;
  }

  const group = new THREE.Group();
  APP.features.forEach((f) => {
    if (f.mesh) {
      group.add(f.mesh);
    }
  });

  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) {
    updateStatusBar('No visible features');
    return;
  }

  fitToObject(group, 1.3);
  updateStatusBar('Fit all features');
}

/**
 * Update window title with document name
 */
function updateWindowTitle() {
  const unsaved = APP.document.unsavedChanges ? ' ●' : '';
  document.title = `${APP.document.name}${unsaved} — cycleCAD`;
}

/**
 * Update status bar message
 */
function updateStatusBar(message) {
  const statusBar = document.getElementById('status-bar');
  if (statusBar) {
    statusBar.textContent = message;
  }
}

/**
 * Animation loop
 */
function animate() {
  requestAnimationFrame(animate);
  updateMetrics();
}

// ============================================================================
// STARTUP
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(console.error);
});

// Export public API
export {
  switchWorkspace,
  getPreference,
  setPreference,
  activateTool,
  deactivateTool,
  selectFeatureById,
  clearSelection,
  newDocument,
  openDocument,
  saveDocument,
  showNotification,
  showConfirmDialog,
  showProgress,
  showCommandPalette,
  on,
  off,
  emit,
};
