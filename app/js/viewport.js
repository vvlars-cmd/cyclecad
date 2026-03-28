/**
 * viewport.js - Three.js 3D viewport module for cycleCAD
 *
 * A production-quality ES module that provides:
 * - Three.js scene, camera, renderer initialization
 * - OrbitControls with damping
 * - Lighting (ambient, directional, fill)
 * - Grid + origin reference geometry
 * - Preset camera views with smooth transitions
 * - Object management and viewport utilities
 * - Proper cleanup and resize handling
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js';

// ============================================================================
// Module State
// ============================================================================

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let animationFrameId = null;
let isAnimating = false;

// Grid and reference objects
let gridHelper = null;
let axisLines = null;
let referencePlanes = {};
let groundPlane = null;
let selectionOutline = null;
let hemiLight = null;

// Camera animation state
let cameraAnimationState = {
  isTransitioning: false,
  startPos: new THREE.Vector3(),
  endPos: new THREE.Vector3(),
  startTarget: new THREE.Vector3(),
  endTarget: new THREE.Vector3(),
  startTime: 0,
  duration: 800, // ms
};

// Preset camera views (distance varies by scene size)
const PRESET_VIEWS = {
  front: { pos: { x: 0, y: 0, z: 1 }, target: { x: 0, y: 0, z: 0 } },
  back: { pos: { x: 0, y: 0, z: -1 }, target: { x: 0, y: 0, z: 0 } },
  top: { pos: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  bottom: { pos: { x: 0, y: -1, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  left: { pos: { x: -1, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  right: { pos: { x: 1, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
  iso: { pos: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } },
};

const GRID_SIZE = 200;
const GRID_DIVISIONS = GRID_SIZE; // 1mm spacing
const AXIS_LENGTH = 60;
const COLORS = {
  bg: 0x0a0e14,
  ambient: 0xffffff,
  directional: 0xffffff,
  fill: 0xaabbff,
  axisX: 0xff0000,
  axisY: 0x00ff00,
  axisZ: 0x0088ff,
  gridMain: 0x3a4a6a,
  gridSub: 0x1a2a4a,
  refPlane: 0x444466,
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the Three.js viewport with scene, camera, renderer, and controls
 * @param {string} containerId - ID of the DOM element to attach the renderer
 * @returns {Object} Viewport object with accessor methods
 */
export function initViewport(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Container with id "${containerId}" not found`);
  }

  // Get dimensions
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 10000, 50000);

  // Create camera
  const fov = 45;
  const aspect = width / height;
  const near = 0.1;
  const far = 50000;
  camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(150, 100, 150);
  camera.lookAt(0, 0, 0);

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Create OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 5;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.minDistance = 10;
  controls.maxDistance = 10000;

  // Setup lighting
  setupLighting();

  // Setup grid and reference geometry
  setupGridAndOrigin();

  // Setup event handlers
  setupEventHandlers(container);

  // Start animation loop
  startAnimationLoop();

  return {
    getScene,
    getCamera,
    getRenderer,
    getControls,
    setView,
    fitToObject,
    addToScene,
    removeFromScene,
    toggleGrid,
    toggleAxisLines,
    toggleReferencePlanes,
    dispose,
  };
}

// ============================================================================
// Lighting Setup
// ============================================================================

/**
 * Setup scene lighting: ambient, directional (main), and fill light
 */
function setupLighting() {
  // Ambient light - soft overall illumination
  const ambientLight = new THREE.AmbientLight(COLORS.ambient, 0.4);
  scene.add(ambientLight);

  // Main directional light with shadows
  const directionalLight = new THREE.DirectionalLight(COLORS.directional, 0.8);
  directionalLight.position.set(100, 150, 100);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.left = -500;
  directionalLight.shadow.camera.right = 500;
  directionalLight.shadow.camera.top = 500;
  directionalLight.shadow.camera.bottom = -500;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 2000;
  directionalLight.shadow.bias = -0.0001;
  scene.add(directionalLight);

  // Fill light from opposite side with bluish tint
  const fillLight = new THREE.DirectionalLight(COLORS.fill, 0.3);
  fillLight.position.set(-100, 50, -100);
  scene.add(fillLight);

  // Hemisphere light for natural environment feel (sky blue → ground grey)
  hemiLight = new THREE.HemisphereLight(0x4488cc, 0x222222, 0.25);
  scene.add(hemiLight);
}

// ============================================================================
// Grid and Reference Geometry
// ============================================================================

/**
 * Setup grid helper and origin reference geometry
 */
function setupGridAndOrigin() {
  // Create grid helper
  gridHelper = new THREE.GridHelper(
    GRID_SIZE,
    GRID_DIVISIONS,
    COLORS.gridMain,
    COLORS.gridSub
  );
  gridHelper.position.y = 0;
  scene.add(gridHelper);

  // Create axis lines (X=red, Y=green, Z=blue)
  const axisLineMaterial = new THREE.LineBasicMaterial({ linewidth: 2 });
  const axisGeometry = new THREE.BufferGeometry();

  const positions = [];
  // X axis (red)
  positions.push(-AXIS_LENGTH, 0, 0);
  positions.push(AXIS_LENGTH, 0, 0);
  // Y axis (green)
  positions.push(0, -AXIS_LENGTH, 0);
  positions.push(0, AXIS_LENGTH, 0);
  // Z axis (blue)
  positions.push(0, 0, -AXIS_LENGTH);
  positions.push(0, 0, AXIS_LENGTH);

  const colors = [];
  // X axis
  colors.push(1, 0, 0); // Red start
  colors.push(1, 0, 0); // Red end
  // Y axis
  colors.push(0, 1, 0); // Green start
  colors.push(0, 1, 0); // Green end
  // Z axis
  colors.push(0, 0.533, 1); // Blue start
  colors.push(0, 0.533, 1); // Blue end

  axisGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  axisGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

  const axisMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: 2,
  });

  axisLines = new THREE.LineSegments(axisGeometry, axisMaterial);
  scene.add(axisLines);

  // Ground shadow plane (invisible but receives shadows)
  const groundGeom = new THREE.PlaneGeometry(GRID_SIZE * 2, GRID_SIZE * 2);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.15 });
  groundPlane = new THREE.Mesh(groundGeom, groundMat);
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.position.y = -0.01; // Just below grid to avoid z-fighting
  groundPlane.receiveShadow = true;
  groundPlane.userData.isGround = true;
  scene.add(groundPlane);

  // Create reference planes (semi-transparent quads)
  createReferencePlanes();
}

/**
 * Create semi-transparent reference planes (XY, XZ, YZ)
 */
function createReferencePlanes() {
  const planeSize = 200;
  const planeAlpha = 0.05;

  // XY plane (Z = 0)
  const xyGeom = new THREE.PlaneGeometry(planeSize, planeSize);
  const xyMat = new THREE.MeshBasicMaterial({
    color: 0x0088ff,
    transparent: true,
    opacity: planeAlpha,
    side: THREE.DoubleSide,
  });
  referencePlanes.xy = new THREE.Mesh(xyGeom, xyMat);
  referencePlanes.xy.position.z = 0;
  referencePlanes.xy.userData.refPlane = true;

  // XZ plane (Y = 0)
  const xzGeom = new THREE.PlaneGeometry(planeSize, planeSize);
  const xzMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: planeAlpha,
    side: THREE.DoubleSide,
  });
  referencePlanes.xz = new THREE.Mesh(xzGeom, xzMat);
  referencePlanes.xz.rotation.x = Math.PI / 2;
  referencePlanes.xz.position.y = 0;
  referencePlanes.xz.userData.refPlane = true;

  // YZ plane (X = 0)
  const yzGeom = new THREE.PlaneGeometry(planeSize, planeSize);
  const yzMat = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: planeAlpha,
    side: THREE.DoubleSide,
  });
  referencePlanes.yz = new THREE.Mesh(yzGeom, yzMat);
  referencePlanes.yz.rotation.y = Math.PI / 2;
  referencePlanes.yz.position.x = 0;
  referencePlanes.yz.userData.refPlane = true;

  // Planes are created but not added to scene by default
}

// ============================================================================
// Camera View Management
// ============================================================================

/**
 * Set preset camera view with smooth animated transition
 * @param {string} viewName - View name: 'front', 'back', 'top', 'bottom', 'left', 'right', 'iso'
 * @param {number} duration - Animation duration in ms (default: 800)
 */
export function setView(viewName, duration = 800) {
  const viewDef = PRESET_VIEWS[viewName];
  if (!viewDef) {
    console.warn(`Unknown view: ${viewName}. Available: ${Object.keys(PRESET_VIEWS).join(', ')}`);
    return;
  }

  // Calculate distance based on scene bounds
  const distance = calculateOptimalDistance();

  const startPos = camera.position.clone();
  const startTarget = new THREE.Vector3();
  controls.getTarget(startTarget);

  const endPos = new THREE.Vector3(
    viewDef.pos.x * distance,
    viewDef.pos.y * distance,
    viewDef.pos.z * distance
  );
  const endTarget = new THREE.Vector3(
    viewDef.target.x,
    viewDef.target.y,
    viewDef.target.z
  );

  animateCamera(startPos, endPos, startTarget, endTarget, duration);
}

/**
 * Fit camera to view an object with proper framing
 * @param {THREE.Object3D} object - Object to fit to
 * @param {number} padding - Padding factor (default: 1.2)
 */
export function fitToObject(object, padding = 1.2) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180); // Convert to radians
  let cameraDistance = maxDim / 2 / Math.tan(fov / 2);
  cameraDistance *= padding;

  const center = box.getCenter(new THREE.Vector3());

  const direction = camera.position.clone().sub(center).normalize();
  const newPos = center.clone().addScaledVector(direction, cameraDistance);

  animateCamera(camera.position.clone(), newPos, center.clone(), center.clone(), 600);
}

/**
 * Animate camera from one position/target to another
 * @private
 */
function animateCamera(startPos, endPos, startTarget, endTarget, duration) {
  cameraAnimationState.isTransitioning = true;
  cameraAnimationState.startPos = startPos.clone();
  cameraAnimationState.endPos = endPos.clone();
  cameraAnimationState.startTarget = startTarget.clone();
  cameraAnimationState.endTarget = endTarget.clone();
  cameraAnimationState.startTime = Date.now();
  cameraAnimationState.duration = duration;
}

/**
 * Update camera animation (called from animation loop)
 * @private
 */
function updateCameraAnimation() {
  if (!cameraAnimationState.isTransitioning) return;

  const elapsed = Date.now() - cameraAnimationState.startTime;
  let t = Math.min(elapsed / cameraAnimationState.duration, 1);

  // Ease-in-out cubic
  t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // Interpolate position and target
  camera.position.lerpVectors(
    cameraAnimationState.startPos,
    cameraAnimationState.endPos,
    t
  );

  const currentTarget = new THREE.Vector3();
  currentTarget.lerpVectors(
    cameraAnimationState.startTarget,
    cameraAnimationState.endTarget,
    t
  );

  controls.target.copy(currentTarget);

  if (t >= 1) {
    cameraAnimationState.isTransitioning = false;
  }
}

/**
 * Calculate optimal camera distance based on scene bounds
 * @private
 */
function calculateOptimalDistance() {
  const box = new THREE.Box3();
  scene.traverse((obj) => {
    if (obj.geometry) {
      box.expandByObject(obj);
    }
  });

  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z) * 1.5;
  }

  return 200; // Default fallback
}

// ============================================================================
// Scene Management
// ============================================================================

/**
 * Add an object to the scene
 * @param {THREE.Object3D} object - Object to add
 */
export function addToScene(object) {
  if (scene) {
    // Auto-enable shadows on meshes
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    scene.add(object);
  }
}

/**
 * Remove an object from the scene
 * @param {THREE.Object3D} object - Object to remove
 */
export function removeFromScene(object) {
  if (scene) {
    scene.remove(object);
  }
}

/**
 * Toggle grid visibility
 * @param {boolean} visible - Show/hide grid
 */
export function toggleGrid(visible) {
  if (gridHelper) {
    gridHelper.visible = visible !== false;
  }
}

/**
 * Toggle axis lines visibility
 * @param {boolean} visible - Show/hide axes
 */
export function toggleAxisLines(visible) {
  if (axisLines) {
    axisLines.visible = visible !== false;
  }
}

/**
 * Toggle reference planes visibility
 * @param {boolean} visible - Show/hide reference planes
 * @param {string} plane - Specific plane: 'xy', 'xz', 'yz', or null for all
 */
export function toggleReferencePlanes(visible, plane = null) {
  if (plane) {
    if (referencePlanes[plane]) {
      if (visible) {
        if (!referencePlanes[plane].parent) {
          scene.add(referencePlanes[plane]);
        }
        referencePlanes[plane].visible = true;
      } else {
        referencePlanes[plane].visible = false;
      }
    }
  } else {
    // Toggle all planes
    ['xy', 'xz', 'yz'].forEach((p) => {
      if (visible) {
        if (!referencePlanes[p].parent) {
          scene.add(referencePlanes[p]);
        }
        referencePlanes[p].visible = true;
      } else {
        referencePlanes[p].visible = false;
      }
    });
  }
}

/**
 * Toggle wireframe mode on all scene meshes
 * @param {boolean} enabled - Enable/disable wireframe mode
 */
export function toggleWireframe(enabled) {
  if (scene) {
    scene.traverse((obj) => {
      // Skip reference planes and grid
      if (obj.userData && obj.userData.refPlane) return;
      if (obj === gridHelper || obj === axisLines) return;

      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            m.wireframe = enabled !== false;
          });
        } else {
          obj.material.wireframe = enabled !== false;
        }
      }
    });
  }
}

// ============================================================================
// Selection Highlighting
// ============================================================================

/**
 * Highlight a mesh with a colored outline/glow effect
 * @param {THREE.Mesh} mesh - Mesh to highlight
 * @param {number} color - Highlight color (default: blue)
 */
export function highlightMesh(mesh, color = 0x58a6ff) {
  // Remove existing highlight
  clearHighlight();

  if (!mesh || !mesh.geometry) return;

  // Create outline using scaled clone with BackSide rendering
  const outlineMat = new THREE.MeshBasicMaterial({
    color: color,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.4,
  });

  selectionOutline = new THREE.Mesh(mesh.geometry.clone(), outlineMat);
  selectionOutline.scale.copy(mesh.scale).multiplyScalar(1.03);
  selectionOutline.position.copy(mesh.position);
  selectionOutline.rotation.copy(mesh.rotation);
  selectionOutline.userData.isHighlight = true;
  scene.add(selectionOutline);
}

/**
 * Clear the current selection highlight
 */
export function clearHighlight() {
  if (selectionOutline) {
    scene.remove(selectionOutline);
    if (selectionOutline.geometry) selectionOutline.geometry.dispose();
    if (selectionOutline.material) selectionOutline.material.dispose();
    selectionOutline = null;
  }
}

/**
 * Enable castShadow on a mesh (call after adding to scene)
 * @param {THREE.Object3D} object - Object to enable shadows on
 */
export function enableShadows(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

// ============================================================================
// Accessors
// ============================================================================

/**
 * Get the Three.js scene
 */
export function getScene() {
  return scene;
}

/**
 * Get the PerspectiveCamera
 */
export function getCamera() {
  return camera;
}

/**
 * Get the WebGLRenderer
 */
export function getRenderer() {
  return renderer;
}

/**
 * Get OrbitControls instance
 */
export function getControls() {
  return controls;
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Setup window resize and other event handlers
 * @private
 */
function setupEventHandlers(container) {
  // Window resize
  const handleResize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', handleResize);

  // Store cleanup reference
  renderer.dispose._resizeHandler = handleResize;
}

// ============================================================================
// Animation Loop
// ============================================================================

/**
 * Start the main animation loop
 * @private
 */
function startAnimationLoop() {
  isAnimating = true;

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);

    // Update camera animation
    updateCameraAnimation();

    // Update controls
    if (controls) {
      controls.update();
    }

    // Render
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  };

  animate();
}

/**
 * Stop the animation loop
 * @private
 */
function stopAnimationLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  isAnimating = false;
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Dispose of all Three.js resources and cleanup event listeners
 */
export function dispose() {
  stopAnimationLoop();

  // Cleanup geometries and materials
  scene.traverse((obj) => {
    if (obj.geometry) {
      obj.geometry.dispose();
    }
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });

  // Cleanup renderer
  if (renderer) {
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  // Cleanup controls
  if (controls) {
    controls.dispose();
  }

  // Remove event listeners
  window.removeEventListener('resize', renderer.dispose._resizeHandler);

  // Clear references
  scene = null;
  camera = null;
  renderer = null;
  controls = null;
  gridHelper = null;
  axisLines = null;
  referencePlanes = {};
  groundPlane = null;
  selectionOutline = null;
  hemiLight = null;
}
