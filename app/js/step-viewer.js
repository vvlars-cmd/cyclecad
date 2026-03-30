/**
 * STEP Viewer Module for cycleCAD
 * Drag-and-drop STEP/STP file import with interactive 3D viewer
 *
 * Features:
 * - Drag-drop and file picker import
 * - occt-import-js for <50MB, server converter for larger files
 * - Instant Three.js rendering with part coloring
 * - Part selection, visibility toggle, BOM export
 * - Exploded view slider
 * - Share & embed code generation
 */

const PALETTE = [0x4488CC, 0xCC4444, 0x44AA44, 0xCCAA44, 0x8844CC, 0x44CCAA,
                 0xCC6644, 0x4466CC, 0xAA44CC, 0x44CC66, 0xCC4488, 0x88CC44];

const OCCT_WASM_URL = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.wasm';
const OCCT_CDN_BASE = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
const SIZE_THRESHOLD = 50 * 1024 * 1024; // 50MB threshold for browser vs server parsing

let stepViewerState = {
  scene: null,
  camera: null,
  renderer: null,
  allParts: [],
  meshMap: new Map(), // mesh → part data
  selectedMesh: null,
  explodeAmount: 0,
  originalPositions: new Map(),
  centerOfMass: new THREE.Vector3(),
  container: null,
  partListPanel: null,
  dropOverlay: null,
  converterUrl: localStorage.getItem('ev_converter_url') || 'http://localhost:8787'
};

export async function initStepViewer(container) {
  stepViewerState.container = container;

  // Setup drop overlay
  setupDropOverlay(container);

  // Setup file input
  setupFileInput();

  // Setup part list panel
  setupPartListPanel();

  // Setup Three.js scene (reuse global or create new)
  if (window._scene && window._camera && window._renderer) {
    stepViewerState.scene = window._scene;
    stepViewerState.camera = window._camera;
    stepViewerState.renderer = window._renderer;
  } else {
    setupScene(container);
  }

  // Setup drag-drop
  setupDragDrop(container);

  // Setup part selection click handler
  setupPartSelection();
}

function setupDropOverlay(container) {
  const overlay = document.createElement('div');
  overlay.id = 'step-drop-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    border: 3px dashed #0284C7;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    pointer-events: none;
    font-family: Calibri, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="text-align: center; pointer-events: auto;">
      <div style="font-size: 48px; margin-bottom: 20px;">📦</div>
      <h2 style="color: #0284C7; margin: 0 0 10px 0; font-size: 24px;">Drop STEP file here</h2>
      <p style="color: #aaa; margin: 0; font-size: 14px;">.step, .stp up to 500MB</p>
    </div>
  `;

  document.body.appendChild(overlay);
  stepViewerState.dropOverlay = overlay;
}

function setupFileInput() {
  let input = document.getElementById('step-file-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'step-file-input';
    input.type = 'file';
    input.accept = '.step,.stp,.STEP,.STP';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async (e) => {
      if (e.target.files[0]) {
        await importStepFile(e.target.files[0]);
      }
    });
  }
}

function setupDragDrop(container) {
  const overlay = stepViewerState.dropOverlay;

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      overlay.style.display = 'flex';
      overlay.style.pointerEvents = 'auto';
    }
  });

  container.addEventListener('dragleave', (e) => {
    if (e.target === container) {
      overlay.style.display = 'none';
      overlay.style.pointerEvents = 'none';
    }
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    overlay.style.display = 'none';
    overlay.style.pointerEvents = 'none';

    const files = e.dataTransfer.files;
    for (let file of files) {
      if (file.name.match(/\.(step|stp)$/i)) {
        await importStepFile(file);
        break; // Only load first STEP file
      }
    }
  });
}

function setupPartListPanel() {
  let panel = document.getElementById('step-part-list-panel');
  if (panel) {
    panel.remove();
  }

  panel = document.createElement('div');
  panel.id = 'step-part-list-panel';
  panel.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 320px;
    height: 100vh;
    background: #1e1e1e;
    border-right: 1px solid #333;
    color: #ddd;
    font-family: Calibri, sans-serif;
    font-size: 13px;
    z-index: 100;
    display: none;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 2px 0 8px rgba(0,0,0,0.5);
  `;

  panel.innerHTML = `
    <div style="padding: 12px; border-bottom: 1px solid #333; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
      <span>Parts</span>
      <button id="step-part-list-close" style="background: none; border: none; color: #aaa; cursor: pointer; font-size: 18px; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">×</button>
    </div>
    <div id="step-part-list-content" style="overflow-y: auto; flex: 1; padding: 8px;">
      <div style="color: #666; padding: 12px; text-align: center;">No model loaded</div>
    </div>
    <div style="border-top: 1px solid #333; padding: 8px; display: flex; gap: 8px; flex-direction: column;">
      <button id="step-export-bom" style="padding: 8px; background: #0284C7; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">📊 Export BOM</button>
      <button id="step-share-code" style="padding: 8px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">🔗 Share / Embed</button>
    </div>
  `;

  document.body.appendChild(panel);
  stepViewerState.partListPanel = panel;

  document.getElementById('step-part-list-close').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  document.getElementById('step-export-bom').addEventListener('click', exportBOM);
  document.getElementById('step-share-code').addEventListener('click', () => {
    const code = getEmbedCode();
    const dialog = prompt('Embed code (copy to share on web):\n\n', code);
  });
}

function setupScene(container) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  stepViewerState.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100000);
  stepViewerState.camera.position.set(500, 400, 500);

  stepViewerState.scene = new THREE.Scene();
  stepViewerState.scene.background = new THREE.Color(0x222222);

  // Lights
  const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
  stepViewerState.scene.add(ambLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(300, 400, 300);
  dirLight.castShadow = true;
  dirLight.shadow.camera.far = 2000;
  stepViewerState.scene.add(dirLight);

  stepViewerState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  stepViewerState.renderer.setSize(width, height);
  stepViewerState.renderer.shadowMap.enabled = true;
  container.appendChild(stepViewerState.renderer.domElement);

  // Grid
  const gridHelper = new THREE.GridHelper(1000, 20, 0x444444, 0x222222);
  stepViewerState.scene.add(gridHelper);

  // Animate loop
  function animate() {
    requestAnimationFrame(animate);
    stepViewerState.renderer.render(stepViewerState.scene, stepViewerState.camera);
  }
  animate();

  // Handle resize
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    stepViewerState.camera.aspect = w / h;
    stepViewerState.camera.updateProjectionMatrix();
    stepViewerState.renderer.setSize(w, h);
  });
}

function setupPartSelection() {
  const canvas = stepViewerState.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, stepViewerState.camera);
    const intersects = raycaster.intersectObjects(stepViewerState.scene.children, true);

    // Deselect previous
    if (stepViewerState.selectedMesh) {
      const prevPart = stepViewerState.meshMap.get(stepViewerState.selectedMesh);
      if (prevPart) {
        stepViewerState.selectedMesh.material.emissive.setHex(0x000000);
        updatePartListHighlight(null);
      }
    }

    // Select new
    for (let hit of intersects) {
      const part = stepViewerState.meshMap.get(hit.object);
      if (part) {
        stepViewerState.selectedMesh = hit.object;
        hit.object.material.emissive.setHex(0x444444);
        updatePartListHighlight(part.index);
        console.log(`[STEP] Selected: ${part.name}`);
        break;
      }
    }
  });
}

export async function importStepFile(file) {
  console.log(`[STEP] Importing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)...`);

  const statusDiv = showImportStatus('Parsing STEP file...');

  try {
    let meshes = [];

    // Choose parsing method
    if (file.size < SIZE_THRESHOLD) {
      console.log('[STEP] Using browser WASM (occt-import-js)');
      meshes = await parseViaOCCT(file);
    } else {
      console.log('[STEP] Using server converter (file >50MB)');
      meshes = await parseViaServer(file);
    }

    statusDiv.textContent = `Building 3D scene (${meshes.length} parts)...`;
    buildScene(meshes, file.name);

    statusDiv.textContent = `✓ Loaded ${meshes.length} parts from ${file.name}`;
    setTimeout(() => statusDiv.remove(), 3000);

    // Show part list
    stepViewerState.partListPanel.style.display = 'flex';

  } catch (err) {
    console.error('[STEP] Import failed:', err);
    statusDiv.textContent = `✗ Error: ${err.message}`;
    statusDiv.style.color = '#ff6666';
    setTimeout(() => statusDiv.remove(), 5000);
  }
}

async function parseViaOCCT(file) {
  const occtImportJs = await import(OCCT_CDN_BASE + 'occt-import-js.js');
  const occt = await occtImportJs.default({
    locateFile: (filename) => {
      if (filename.endsWith('.wasm')) return OCCT_WASM_URL;
      return OCCT_CDN_BASE + filename;
    }
  });

  const buffer = new Uint8Array(await file.arrayBuffer());
  const result = occt.ReadStepFile(buffer, null);

  if (!result || !result.meshes || result.meshes.length === 0) {
    throw new Error('No meshes extracted from STEP file');
  }

  return result.meshes.map((mesh, i) => ({
    name: mesh.name || `Part_${i}`,
    index: i,
    position: mesh.attributes.position.array,
    normal: mesh.attributes.normal?.array,
    index: mesh.attributes.index?.array,
    color: mesh.color || PALETTE[i % PALETTE.length]
  }));
}

async function parseViaServer(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${stepViewerState.converterUrl}/convert/metadata`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.meshes || [];
}

function buildScene(meshes, filename) {
  // Clear previous
  stepViewerState.allParts = [];
  stepViewerState.meshMap.clear();
  stepViewerState.originalPositions.clear();

  let group = new THREE.Group();
  let bbox = new THREE.Box3();
  let centerOfMass = new THREE.Vector3();
  let totalVolume = 0;

  meshes.forEach((meshData, idx) => {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(meshData.position);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    if (meshData.normal) {
      const normals = new Float32Array(meshData.normal);
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    if (meshData.index) {
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(meshData.index), 1));
    }

    geometry.computeBoundingBox();
    bbox.expandByObject(new THREE.Object3D());

    const color = new THREE.Color(meshData.color);
    const material = new THREE.MeshPhongMaterial({
      color: color,
      emissive: 0x000000,
      shininess: 100
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    group.add(mesh);

    const partData = {
      name: meshData.name,
      index: idx,
      mesh: mesh,
      visible: true,
      originalPosition: mesh.position.clone()
    };

    stepViewerState.meshMap.set(mesh, partData);
    stepViewerState.allParts.push(partData);
    stepViewerState.originalPositions.set(mesh, mesh.position.clone());
  });

  stepViewerState.scene.add(group);

  // Fit camera
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = stepViewerState.camera.fov * (Math.PI / 180);
  const cameraDistance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

  stepViewerState.camera.position.set(cameraDistance, cameraDistance * 0.6, cameraDistance);
  stepViewerState.camera.lookAt(group.position);

  // Update part list
  updatePartList();
}

function updatePartList() {
  const content = document.getElementById('step-part-list-content');
  if (!content) return;

  const html = stepViewerState.allParts.map((part, i) => `
    <div class="step-part-item" data-index="${i}" style="
      padding: 8px;
      margin: 4px 0;
      background: #2a2a2a;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      border-left: 3px solid #${part.mesh.material.color.getHexString()};
      user-select: none;
    ">
      <div style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;">
        ${part.name}
      </div>
      <button class="step-toggle-visibility" data-index="${i}" style="
        background: none;
        border: none;
        color: ${part.visible ? '#44aa44' : '#666'};
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        width: 20px;
        height: 20px;
      ">${part.visible ? '👁' : '🚫'}</button>
    </div>
  `).join('');

  content.innerHTML = html || '<div style="color: #666; text-align: center; padding: 12px;">No parts</div>';

  // Wire up event handlers
  content.querySelectorAll('.step-part-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('step-toggle-visibility')) {
        const idx = parseInt(el.dataset.index);
        const part = stepViewerState.allParts[idx];
        part.mesh.material.emissive.setHex(0x444444);
        stepViewerState.selectedMesh = part.mesh;
        updatePartListHighlight(idx);
      }
    });
  });

  content.querySelectorAll('.step-toggle-visibility').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const part = stepViewerState.allParts[idx];
      part.visible = !part.visible;
      part.mesh.visible = part.visible;
      btn.textContent = part.visible ? '👁' : '🚫';
      btn.style.color = part.visible ? '#44aa44' : '#666';
    });
  });
}

function updatePartListHighlight(idx) {
  document.querySelectorAll('.step-part-item').forEach(el => {
    el.style.background = idx !== null && parseInt(el.dataset.index) === idx ? '#0284C7' : '#2a2a2a';
  });
}

export function explodeView(amount) {
  stepViewerState.explodeAmount = Math.max(0, Math.min(1, amount));

  stepViewerState.allParts.forEach(part => {
    const origPos = stepViewerState.originalPositions.get(part.mesh);
    const direction = origPos.clone().normalize();
    const distance = 200 * stepViewerState.explodeAmount;

    part.mesh.position.copy(origPos).addScaledVector(direction, distance);
  });
}

export function exportBOM() {
  if (stepViewerState.allParts.length === 0) {
    alert('No parts loaded');
    return;
  }

  const csv = ['Part Number,Name,Material\n'];
  stepViewerState.allParts.forEach((part, i) => {
    csv.push(`${i + 1},"${part.name}",\n`);
  });

  const blob = new Blob([csv.join('')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bom_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  console.log('[STEP] BOM exported');
}

export function getEmbedCode() {
  const url = window.location.origin + window.location.pathname +
    `?step_viewer=true&model=${btoa('imported_' + Date.now())}`;

  return `<iframe
  src="${url}"
  width="1200" height="800"
  style="border: none; border-radius: 8px;"
  allow="fullscreen"
></iframe>`;
}

function showImportStatus(message) {
  let div = document.getElementById('step-import-status');
  if (!div) {
    div = document.createElement('div');
    div.id = 'step-import-status';
    document.body.appendChild(div);
  }

  div.textContent = message;
  div.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #0284C7;
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    font-family: Calibri, sans-serif;
    font-size: 13px;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;

  return div;
}

// Register on window
window.stepViewer = {
  initStepViewer,
  importStepFile,
  explodeView,
  exportBOM,
  getEmbedCode
};

console.log('[STEP Viewer] Module loaded. Use window.stepViewer.initStepViewer(container)');
