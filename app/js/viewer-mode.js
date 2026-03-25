/**
 * viewer-mode.js - ExplodeView integration for cycleCAD
 *
 * This module enables Viewer Mode: a presentation/inspection mode for loaded assemblies.
 * Shares the Three.js scene with Edit Mode and provides:
 *
 * - Mode switching (Edit ↔ Viewer)
 * - File loading (STL, OBJ, manifest-based assemblies)
 * - Assembly tree navigation
 * - Part selection and highlighting
 * - Explode/collapse animation
 * - Section cut (clipping planes)
 * - Context menu (select, hide, isolate, export)
 * - Part info panel
 * - State management for viewer-specific data
 *
 * Part of the ExplodeView→cycleCAD merge strategy.
 * Imports THREE.js loaders and viewport scene from existing modules.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { STLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';

/**
 * ============================================================================
 * MODULE STATE
 * ============================================================================
 */

let isViewerMode = false;
let scene = null;
let camera = null;
let renderer = null;
let controls = null;

// Root group for all viewer objects (toggled when switching modes)
let viewerGroup = null;

// Viewer state
const viewerState = {
  isLoading: false,
  allParts: [],           // Array of { mesh, name, index, bbox, center }
  assemblies: [],         // Array of assembly definitions { name, indices, color }
  manifest: [],           // Array of part metadata
  selectedPartIndex: null,
  selectedMesh: null,
  explodeAmount: 0,       // 0-1, how far apart to move parts
  explodedPositions: {},  // Cache of original positions
  hoveredMesh: null,
  sectionCutActive: false,
  sectionCutPlane: null,
  clippingPlanes: [],
  annotationPins: [],
};

// Part highlight state
const partHighlightState = {
  originalColor: {},
  originalOpacity: {},
  highlighted: null,
};

// Configuration
const config = {
  highlightColor: 0x00ff00,
  selectionColor: 0xffaa00,
  assemblySeparation: 80,    // mm to move parts when exploded
  sectionCutThickness: 2,    // mm clipping plane thickness
};

/**
 * ============================================================================
 * INITIALIZATION
 * ============================================================================
 */

/**
 * Initialize the Viewer Mode system
 * @param {Object} viewportExports - { getScene, getCamera, getRenderer, getControls }
 * @returns {Object} Public API
 */
export function initViewerMode(viewportExports) {
  scene = viewportExports.getScene();
  camera = viewportExports.getCamera();
  renderer = viewportExports.getRenderer();
  controls = viewportExports.getControls();

  if (!scene || !camera || !renderer || !controls) {
    throw new Error('initViewerMode: Missing viewport exports');
  }

  // Create the viewer group to toggle visibility
  viewerGroup = new THREE.Group();
  viewerGroup.name = 'ViewerGroup';
  scene.add(viewerGroup);

  setupEventListeners();
  setupContextMenu();

  return {
    toggleViewerMode,
    loadFile,
    getViewerState,
    selectPart,
    explodeParts,
    setSectionCut,
    exportBOM,
    addAnnotationPin,
    isInViewerMode,
  };
}

/**
 * ============================================================================
 * MODE SWITCHING
 * ============================================================================
 */

function toggleViewerMode(enable) {
  isViewerMode = enable;
  viewerGroup.visible = enable;

  const modeBtn = document.getElementById('btn-viewer-mode-toggle');
  if (modeBtn) {
    modeBtn.textContent = isViewerMode ? 'Edit Mode' : 'Viewer Mode';
    modeBtn.style.backgroundColor = isViewerMode ? '#ff6600' : '#333';
  }

  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) {
    // In viewer mode, show viewer tabs; hide edit tabs
    const viewerTabs = rightPanel.querySelectorAll('[data-viewer-only]');
    const editTabs = rightPanel.querySelectorAll('[data-edit-only]');

    viewerTabs.forEach(t => t.style.display = isViewerMode ? 'block' : 'none');
    editTabs.forEach(t => t.style.display = !isViewerMode ? 'block' : 'none');
  }

  if (isViewerMode) {
    // Auto-fit to loaded model
    if (viewerState.allParts.length > 0) {
      fitAllParts();
    }
  }
}

function isInViewerMode() {
  return isViewerMode;
}

/**
 * ============================================================================
 * FILE LOADING
 * ============================================================================
 */

/**
 * Load a file (STL, OBJ, glTF, or manifest-based assembly)
 * @param {File|Blob} file - The file to load
 * @param {Object} options - { manifest, assemblies }
 */
export async function loadFile(file, options = {}) {
  viewerState.isLoading = true;
  clearViewer();

  try {
    const fileName = file.name.toLowerCase();
    let mesh = null;

    if (fileName.endsWith('.stl')) {
      mesh = await loadSTL(file);
    } else if (fileName.endsWith('.obj')) {
      mesh = await loadOBJ(file);
    } else if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
      mesh = await loadGLTF(file);
    } else {
      throw new Error(`Unsupported file type: ${fileName}`);
    }

    if (!mesh) throw new Error('Failed to load model');

    // If manifest provided, use it to split mesh into parts
    if (options.manifest) {
      processManifestFile(mesh, options.manifest, options.assemblies);
    } else {
      // Single mesh as single part
      addPartToScene(mesh, 'Loaded Model', 0);
    }

    // Enable viewer mode
    toggleViewerMode(true);

    updateStatus(`Loaded ${file.name} — ${viewerState.allParts.length} parts`);
  } catch (err) {
    updateStatus(`Error loading file: ${err.message}`, 'error');
    console.error(err);
  } finally {
    viewerState.isLoading = false;
  }
}

async function loadSTL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loader = new STLLoader();
        const geometry = loader.parse(e.target.result);
        const material = new THREE.MeshStandardMaterial({
          color: 0xcc9955,
          roughness: 0.7,
          metalness: 0.2,
        });
        const mesh = new THREE.Mesh(geometry, material);
        centerGeometry(mesh);
        resolve(mesh);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

async function loadOBJ(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loader = new OBJLoader();
        const object = loader.parse(e.target.result);
        const material = new THREE.MeshStandardMaterial({
          color: 0xcc9955,
          roughness: 0.7,
          metalness: 0.2,
        });

        // Convert all geometries in object
        object.traverse((child) => {
          if (child.isGeometry || child.geometry) {
            if (!(child.material instanceof THREE.Material)) {
              child.material = material;
            }
          }
        });

        centerGeometry(object);
        resolve(object);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function loadGLTF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loader = new GLTFLoader();
        loader.parse(e.target.result, '', (gltf) => {
          const scene = gltf.scene;
          centerGeometry(scene);
          resolve(scene);
        }, reject);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));

    if (file.name.endsWith('.glb')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
}

/**
 * If manifest is provided, build parts array from metadata
 * This matches ExplodeView's structure: array of parts with metadata
 */
function processManifestFile(mesh, manifest, assemblies) {
  // TODO: Parse manifest.json to extract:
  // - Part names, centers, bounding boxes
  // - Assembly groupings
  // - Load individual part files if URLs provided
  //
  // For now, treat entire mesh as single part
  addPartToScene(mesh, manifest[0]?.name || 'Part', 0);
}

/**
 * ============================================================================
 * SCENE MANAGEMENT
 * ============================================================================
 */

function addPartToScene(object, partName, index) {
  const bbox = new THREE.Box3().setFromObject(object);
  const center = bbox.getCenter(new THREE.Vector3());

  const partData = {
    mesh: object,
    name: partName || `Part ${index}`,
    index: index || viewerState.allParts.length,
    bbox: bbox,
    center: center,
    originalCenter: center.clone(),
  };

  viewerState.allParts.push(partData);
  viewerGroup.add(object);

  // Cache original position for explode animation
  if (object.isGroup) {
    object.children.forEach((child) => {
      if (child.position) {
        viewerState.explodedPositions[child.uuid] = child.position.clone();
      }
    });
  } else {
    viewerState.explodedPositions[object.uuid] = object.position.clone();
  }
}

function clearViewer() {
  // Remove all meshes from viewer group
  while (viewerGroup.children.length > 0) {
    viewerGroup.remove(viewerGroup.children[0]);
  }

  viewerState.allParts = [];
  viewerState.assemblies = [];
  viewerState.selectedPartIndex = null;
  viewerState.selectedMesh = null;
  viewerState.explodeAmount = 0;
  partHighlightState.highlighted = null;
  viewerState.annotationPins = [];
}

function centerGeometry(object) {
  const bbox = new THREE.Box3().setFromObject(object);
  const center = bbox.getCenter(new THREE.Vector3());

  object.traverse((child) => {
    if (child.position) {
      child.position.sub(center);
    }
  });
}

/**
 * ============================================================================
 * PART SELECTION & HIGHLIGHTING
 * ============================================================================
 */

/**
 * Select a part by index
 */
export function selectPart(partIndex) {
  if (partIndex < 0 || partIndex >= viewerState.allParts.length) {
    return;
  }

  // Clear previous selection
  if (viewerState.selectedMesh) {
    restorePartColor(viewerState.selectedMesh);
  }

  const part = viewerState.allParts[partIndex];
  viewerState.selectedPartIndex = partIndex;
  viewerState.selectedMesh = part.mesh;

  // Highlight selected mesh
  highlightMesh(part.mesh, config.selectionColor, 0.8);

  // Show part info panel
  showPartInfo(part);

  updateStatus(`Selected: ${part.name}`);
}

function highlightMesh(mesh, color, opacity) {
  if (!mesh) return;

  if (mesh.isGroup) {
    mesh.children.forEach((child) => {
      if (child.material) {
        partHighlightState.originalColor[child.uuid] = child.material.color.clone();
        partHighlightState.originalOpacity[child.uuid] = child.material.opacity;

        child.material.color.setHex(color);
        child.material.opacity = opacity;
        child.material.transparent = true;
      }
    });
  } else if (mesh.material) {
    partHighlightState.originalColor[mesh.uuid] = mesh.material.color.clone();
    partHighlightState.originalOpacity[mesh.uuid] = mesh.material.opacity;

    mesh.material.color.setHex(color);
    mesh.material.opacity = opacity;
    mesh.material.transparent = true;
  }
}

function restorePartColor(mesh) {
  if (!mesh) return;

  if (mesh.isGroup) {
    mesh.children.forEach((child) => {
      if (child.material && partHighlightState.originalColor[child.uuid]) {
        child.material.color.copy(partHighlightState.originalColor[child.uuid]);
        child.material.opacity = partHighlightState.originalOpacity[child.uuid];
      }
    });
  } else if (mesh.material && partHighlightState.originalColor[mesh.uuid]) {
    mesh.material.color.copy(partHighlightState.originalColor[mesh.uuid]);
    mesh.material.opacity = partHighlightState.originalOpacity[mesh.uuid];
  }
}

/**
 * ============================================================================
 * EXPLODE ANIMATION
 * ============================================================================
 */

/**
 * Animate explode/collapse
 * @param {number} amount - 0 = collapsed, 1 = fully exploded
 */
export function explodeParts(amount) {
  viewerState.explodeAmount = Math.max(0, Math.min(1, amount));

  viewerState.allParts.forEach((partData, index) => {
    const mesh = partData.mesh;
    const originalPos = viewerState.explodedPositions[mesh.uuid];

    if (!originalPos) return;

    // Calculate displacement direction from center
    const direction = partData.center.clone().normalize();

    // Interpolate position
    const displacementDistance = config.assemblySeparation * viewerState.explodeAmount;
    const newPos = originalPos.clone().add(direction.multiplyScalar(displacementDistance));

    mesh.position.copy(newPos);
  });

  updateStatus(`Explode: ${Math.round(viewerState.explodeAmount * 100)}%`);
}

/**
 * ============================================================================
 * SECTION CUT (CLIPPING PLANE)
 * ============================================================================
 */

/**
 * Enable/disable section cut with clipping plane
 * @param {boolean} enabled
 * @param {string} axis - 'x', 'y', 'z'
 * @param {number} position - position of clipping plane
 */
export function setSectionCut(enabled, axis = 'z', position = 0) {
  viewerState.sectionCutActive = enabled;

  if (!enabled) {
    // Disable clipping on all materials
    viewerState.allParts.forEach((partData) => {
      const traverse = (obj) => {
        if (obj.material) {
          obj.material.clippingPlanes = [];
          obj.material.clipIntersection = false;
        }
        if (obj.children) {
          obj.children.forEach(traverse);
        }
      };
      traverse(partData.mesh);
    });
    return;
  }

  // Create clipping plane
  const normal = new THREE.Vector3();
  normal[axis] = 1;

  const clippingPlane = new THREE.Plane(normal, position);
  renderer.localClippingEnabled = true;

  // Apply to all materials
  viewerState.allParts.forEach((partData) => {
    const traverse = (obj) => {
      if (obj.material) {
        obj.material.clippingPlanes = [clippingPlane];
        obj.material.clipIntersection = false;
        obj.material.side = THREE.DoubleSide;
      }
      if (obj.children) {
        obj.children.forEach(traverse);
      }
    };
    traverse(partData.mesh);
  });

  updateStatus(`Section cut active — ${axis.toUpperCase()} axis`);
}

/**
 * ============================================================================
 * PART INFO PANEL
 * ============================================================================
 */

function showPartInfo(part) {
  // Calculate bounding box dimensions
  const size = part.bbox.getSize(new THREE.Vector3());
  const volume = size.x * size.y * size.z;

  // Create info panel if doesn't exist
  let infoPanel = document.getElementById('viewer-part-info-panel');
  if (!infoPanel) {
    infoPanel = document.createElement('div');
    infoPanel.id = 'viewer-part-info-panel';
    infoPanel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #252526;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      padding: 16px;
      width: 250px;
      max-height: 300px;
      overflow-y: auto;
      color: #e0e0e0;
      font-family: monospace;
      font-size: 12px;
      z-index: 50;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;
    document.body.appendChild(infoPanel);
  }

  infoPanel.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: bold; color: #58a6ff;">${part.name}</div>
    <div style="margin-bottom: 4px;">Index: ${part.index}</div>
    <div style="margin-bottom: 4px;">Dimensions (mm):</div>
    <div style="margin-bottom: 4px; margin-left: 8px;">X: ${size.x.toFixed(2)}</div>
    <div style="margin-bottom: 4px; margin-left: 8px;">Y: ${size.y.toFixed(2)}</div>
    <div style="margin-bottom: 4px; margin-left: 8px;">Z: ${size.z.toFixed(2)}</div>
    <div style="margin-bottom: 4px;">Volume: ${volume.toFixed(0)} mm³</div>
    <button id="info-close-btn" style="
      margin-top: 8px;
      padding: 4px 8px;
      background: #3e3e42;
      border: 1px solid #58a6ff;
      color: #58a6ff;
      cursor: pointer;
      border-radius: 2px;
    ">Close</button>
  `;

  document.getElementById('info-close-btn').addEventListener('click', () => {
    infoPanel.style.display = 'none';
  });
}

/**
 * ============================================================================
 * BOM EXPORT
 * ============================================================================
 */

/**
 * Export BOM as CSV
 */
export function exportBOM() {
  if (viewerState.allParts.length === 0) {
    updateStatus('No parts loaded', 'warning');
    return;
  }

  // Build CSV
  let csv = 'Index,Name,Dimensions (X,Y,Z),Volume (mm³)\n';

  viewerState.allParts.forEach((part) => {
    const size = part.bbox.getSize(new THREE.Vector3());
    const volume = size.x * size.y * size.z;
    csv += `${part.index},"${part.name}","${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}",${volume.toFixed(0)}\n`;
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bom.csv';
  a.click();
  URL.revokeObjectURL(url);

  updateStatus('BOM exported to bom.csv');
}

/**
 * ============================================================================
 * ANNOTATIONS
 * ============================================================================
 */

/**
 * Add an annotation pin at world position
 * @param {THREE.Vector3} position - World position for pin
 * @param {string} text - Annotation text
 */
export function addAnnotationPin(position, text) {
  // Create simple sphere pin
  const geometry = new THREE.SphereGeometry(5, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const pin = new THREE.Mesh(geometry, material);

  pin.position.copy(position);
  pin.userData = { text, isAnnotationPin: true };

  viewerGroup.add(pin);
  viewerState.annotationPins.push(pin);

  updateStatus(`Added annotation: ${text}`);
}

/**
 * ============================================================================
 * CONTEXT MENU
 * ============================================================================
 */

function setupContextMenu() {
  // Create context menu HTML
  let contextMenu = document.getElementById('viewer-context-menu');
  if (!contextMenu) {
    contextMenu = document.createElement('div');
    contextMenu.id = 'viewer-context-menu';
    contextMenu.style.cssText = `
      position: fixed;
      background: #2d2d30;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      min-width: 150px;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      display: none;
    `;
    document.body.appendChild(contextMenu);
  }

  // Right-click handler on renderer
  renderer.domElement.addEventListener('contextmenu', (e) => {
    if (!isViewerMode) return;

    e.preventDefault();

    // Raycast to find part under cursor
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(viewerGroup.children, true);

    if (intersects.length === 0) return;

    const clickedObject = intersects[0].object;
    const partIndex = findPartIndex(clickedObject);

    if (partIndex === -1) return;

    // Show context menu
    contextMenu.innerHTML = `
      <div style="padding: 0;">
        <button class="context-menu-item" data-action="select">Select</button>
        <button class="context-menu-item" data-action="hide">Hide</button>
        <button class="context-menu-item" data-action="isolate">Isolate</button>
        <button class="context-menu-item" data-action="export">Export STL</button>
        <button class="context-menu-item" data-action="info">Part Info</button>
      </div>
    `;

    // Style items
    contextMenu.querySelectorAll('.context-menu-item').forEach((btn) => {
      btn.style.cssText = `
        display: block;
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: #e0e0e0;
        cursor: pointer;
        text-align: left;
        font-size: 12px;
      `;
      btn.addEventListener('mouseover', () => {
        btn.style.background = '#3e3e42';
      });
      btn.addEventListener('mouseout', () => {
        btn.style.background = 'transparent';
      });
      btn.addEventListener('click', () => {
        handleContextMenuAction(btn.dataset.action, partIndex);
        contextMenu.style.display = 'none';
      });
    });

    contextMenu.style.display = 'block';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
  });

  // Hide menu on click elsewhere
  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });
}

function handleContextMenuAction(action, partIndex) {
  const part = viewerState.allParts[partIndex];
  if (!part) return;

  switch (action) {
    case 'select':
      selectPart(partIndex);
      break;
    case 'hide':
      part.mesh.visible = false;
      updateStatus(`Hidden: ${part.name}`);
      break;
    case 'isolate':
      viewerState.allParts.forEach((p, i) => {
        p.mesh.visible = (i === partIndex);
      });
      updateStatus(`Isolated: ${part.name}`);
      break;
    case 'export':
      exportPartSTL(part);
      break;
    case 'info':
      showPartInfo(part);
      break;
  }
}

function findPartIndex(object) {
  for (let i = 0; i < viewerState.allParts.length; i++) {
    const part = viewerState.allParts[i];
    if (part.mesh === object || part.mesh.children.includes(object)) {
      return i;
    }
  }
  return -1;
}

function exportPartSTL(part) {
  // Stub: Would export mesh to STL using Three.js STL exporter
  updateStatus(`Exporting ${part.name} to STL... (stub)`);
}

/**
 * ============================================================================
 * EVENT LISTENERS
 * ============================================================================
 */

function setupEventListeners() {
  // Explode slider
  const explodeSlider = document.getElementById('viewer-explode-slider');
  if (explodeSlider) {
    explodeSlider.addEventListener('input', (e) => {
      const amount = parseFloat(e.target.value);
      explodeParts(amount);
    });
  }

  // Section cut toggle
  const sectionToggle = document.getElementById('viewer-section-cut-toggle');
  if (sectionToggle) {
    sectionToggle.addEventListener('change', (e) => {
      setSectionCut(e.target.checked);
    });
  }

  // BOM export button
  const bomBtn = document.getElementById('viewer-bom-export-btn');
  if (bomBtn) {
    bomBtn.addEventListener('click', () => {
      exportBOM();
    });
  }

  // Mode toggle button
  const modeBtn = document.getElementById('btn-viewer-mode-toggle');
  if (modeBtn) {
    modeBtn.addEventListener('click', () => {
      toggleViewerMode(!isViewerMode);
    });
  }
}

/**
 * ============================================================================
 * UTILITIES
 * ============================================================================
 */

function fitAllParts() {
  if (viewerState.allParts.length === 0) return;

  // Calculate overall bounding box
  const bbox = new THREE.Box3();
  viewerState.allParts.forEach((part) => {
    bbox.expandByObject(part.mesh);
  });

  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  // Set camera to frame all parts
  const distance = maxDim / (2 * Math.tan((camera.fov * Math.PI / 180) / 2));

  camera.position.set(
    center.x + distance * 0.5,
    center.y + distance * 0.3,
    center.z + distance * 0.7,
  );
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

function updateStatus(message, type = 'info') {
  let statusBar = document.getElementById('status-bar');
  if (!statusBar) {
    statusBar = document.createElement('div');
    statusBar.id = 'status-bar';
    statusBar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 36px;
      background: #1e1e1e;
      border-top: 1px solid #3e3e42;
      display: flex;
      align-items: center;
      padding: 0 16px;
      color: #a0a0a0;
      font-size: 12px;
      z-index: 40;
    `;
    document.body.appendChild(statusBar);
  }

  statusBar.textContent = message;
  statusBar.style.color = type === 'error' ? '#f85149' : type === 'warning' ? '#d29922' : '#a0a0a0';
}

/**
 * ============================================================================
 * PUBLIC API GETTERS
 * ============================================================================
 */

export function getViewerState() {
  return viewerState;
}

// Expose key functions globally for debugging
window.ViewerMode = {
  loadFile,
  selectPart,
  explodeParts,
  setSectionCut,
  exportBOM,
  addAnnotationPin,
  toggleViewerMode,
  getViewerState,
};
