/**
 * @file viewport-module.js
 * @description ViewportModule — Core 3D Rendering Engine for cycleCAD
 *   Foundational LEGO block providing Three.js scene, camera, renderer, and 3D interaction.
 *   Zero dependencies — this is the bedrock layer that all other modules depend on.
 *
 * @version 1.0.0
 * @author cycleCAD Team
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 *
 * @module viewport-module
 * @requires Three.js r170 (loaded globally)
 * @requires OrbitControls from Three.js examples
 *
 * Provides:
 *   - Three.js WebGL renderer (antialias, shadows, high-DPI support)
 *   - Perspective camera with preset views (front, back, left, right, top, bottom, isometric)
 *   - Lighting setup (3x directional lights + ambient for realistic shadows)
 *   - Grid floor with shadow plane
 *   - OrbitControls for rotation (left), pan (right), zoom (scroll)
 *   - Selection via raycaster + click detection
 *   - Fit-to-object camera animation
 *   - View management (preset views, custom scale)
 *   - Display modes (wireframe, grid toggle, shadow toggle)
 *   - High-res screenshot capture
 *   - Background color management
 *   - Event emissions for part selection/deselection
 *
 * Architecture (Three.js Scene Structure):
 *   Scene
 *   ├── Lights
 *   │   ├── AmbientLight (0.5 intensity)
 *   │   ├── DirectionalLight 1 (main, casts shadow)
 *   │   ├── DirectionalLight 2 (fill)
 *   │   └── DirectionalLight 3 (back)
 *   ├── Grid floor (2000x2000 units, 20 divisions)
 *   └── User meshes
 *       ├── mesh_0 (with shadow, selection tracking)
 *       ├── mesh_1
 *       └── ...
 *
 * Commands Registered:
 *   - viewport.fitAll() - Fit camera to all objects
 *   - viewport.fitTo(meshId) - Fit to specific mesh
 *   - viewport.setView(name) - Set preset view (front/back/left/right/top/bottom/iso)
 *   - viewport.toggleGrid() - Show/hide grid
 *   - viewport.toggleWireframe() - Toggle wireframe mode on all meshes
 *   - viewport.toggleShadows() - Enable/disable shadow rendering
 *   - viewport.addMesh(geometry, material, name) - Add mesh to scene
 *   - viewport.removeMesh(meshId) - Remove mesh from scene
 *   - viewport.setBackground(color) - Change background color
 *   - viewport.screenshot(w, h) - Capture high-res screenshot
 *
 * Events Emitted:
 *   - viewport:ready - Viewport fully loaded and ready to use
 *   - viewport:resize - Window resized, new dimensions in data
 *   - part:selected - Mesh clicked, data includes {meshId, point, face, object}
 *   - part:deselected - Clicked on empty area, no geometry at cursor
 *
 * Usage Example:
 *   ```javascript
 *   import kernel from './kernel.js';
 *   import ViewportModule from './modules/viewport-module.js';
 *
 *   // Register viewport module
 *   kernel.register(ViewportModule);
 *
 *   // Activate it (loads Three.js, creates scene, attaches to DOM)
 *   await kernel.activate('viewport');
 *
 *   // Now viewport is ready
 *   await kernel.exec('viewport.setView', {viewName: 'front'});
 *
 *   // Listen for selections
 *   kernel.on('part:selected', (data) => {
 *     console.log('Selected:', data.meshId);
 *   });
 *
 *   // Fit camera to all objects
 *   await kernel.exec('viewport.fitAll');
 *   ```
 */

/**
 * ViewportModule definition for kernel registration
 *
 * @type {Object}
 * @property {string} id - Module ID ('viewport')
 * @property {string} name - Human-readable name ('3D Viewport')
 * @property {string} version - Semantic version ('1.0.0')
 * @property {string} category - Module category ('engine' — foundational)
 * @property {Array} dependencies - Required modules (empty — no deps)
 * @property {number} memoryEstimate - Estimated memory (30 MB for Three.js + textures)
 * @property {Array} replaces - Modules this replaces (none)
 * @property {Function} load - Async lifecycle: load hook
 * @property {Function} activate - Async lifecycle: activate hook
 * @property {Function} deactivate - Async lifecycle: deactivate hook
 * @property {Function} unload - Async lifecycle: unload hook
 * @property {Object} provides - Exported API (commands and events)
 */
const ViewportModule = {
  id: 'viewport',
  name: '3D Viewport',
  version: '1.0.0',
  category: 'engine',
  dependencies: [],
  memoryEstimate: 30,
  replaces: [],

  async load(kernel) {
    console.log('[ViewportModule] Loading...');

    // Import THREE from global (via import map)
    const THREE = window.THREE;
    if (!THREE) throw new Error('THREE.js not loaded');

    // Import OrbitControls
    const { OrbitControls } = await import('https://cdn.jsdelivr.net/npm/three@r170/examples/jsm/controls/OrbitControls.js');

    // === SCENE SETUP ===
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 100, 10000);

    // === CAMERA ===
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100000
    );
    camera.position.set(500, 400, 500);
    camera.lookAt(0, 0, 0);

    // === RENDERER ===
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true; // For section cut

    // === LIGHTS ===
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Directional lights for shadows
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(500, 500, 500);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.left = -1000;
    dirLight1.shadow.camera.right = 1000;
    dirLight1.shadow.camera.top = 1000;
    dirLight1.shadow.camera.bottom = -1000;
    dirLight1.shadow.camera.far = 3000;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-500, 300, -500);
    dirLight2.castShadow = true;
    scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight3.position.set(0, -500, 0);
    scene.add(dirLight3);

    // === GRID ===
    const gridSize = 2000;
    const gridDivisions = 20;
    const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x4a4a6a, 0x2a2a4a);
    grid.position.y = 0;
    grid.visible = true;
    scene.add(grid);

    // === CONTROLS ===
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = false;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN
    };

    // === RAYCASTER (Selection) ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const selectedObjects = new Set();

    // === STATE & TRACKING ===
    const state = {
      gridVisible: true,
      wireframeMode: false,
      shadowsEnabled: true,
      animationId: null,
      viewName: 'iso',
      selectedMeshId: null,
      meshes: new Map(), // id -> { mesh, metadata }
      nextMeshId: 0
    };

    // === ANIMATION LOOP ===
    function animate() {
      state.animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    // === RESIZE HANDLER ===
    function onWindowResize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      kernel.bus.emit('viewport:resize', { width, height });
    }
    window.addEventListener('resize', onWindowResize);

    // === CLICK HANDLER (Selection) ===
    function onMouseClick(event) {
      // Skip clicks on UI elements
      if (event.target !== renderer.domElement) return;

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        const intersection = intersects[0];
        const meshId = intersection.object.userData?.meshId;

        if (meshId) {
          state.selectedMeshId = meshId;

          // Highlight selected object
          selectedObjects.forEach(obj => {
            obj.material.emissive.setHex(0x000000);
          });
          selectedObjects.clear();

          intersection.object.material.emissive.setHex(0x444444);
          selectedObjects.add(intersection.object);

          kernel.bus.emit('part:selected', {
            meshId,
            point: intersection.point,
            face: intersection.face,
            object: intersection.object
          });
        }
      } else {
        // Deselect
        selectedObjects.forEach(obj => {
          obj.material.emissive.setHex(0x000000);
        });
        selectedObjects.clear();
        state.selectedMeshId = null;
        kernel.bus.emit('part:deselected', {});
      }
    }
    renderer.domElement.addEventListener('click', onMouseClick);

    // === PRESET VIEWS ===
    const presetViews = {
      front: { pos: [0, 0, 500], target: [0, 0, 0] },
      back: { pos: [0, 0, -500], target: [0, 0, 0] },
      left: { pos: [-500, 0, 0], target: [0, 0, 0] },
      right: { pos: [500, 0, 0], target: [0, 0, 0] },
      top: { pos: [0, 500, 0], target: [0, 0, 0] },
      bottom: { pos: [0, -500, 0], target: [0, 0, 0] },
      iso: { pos: [500, 400, 500], target: [0, 0, 0] }
    };

    // === HELPER FUNCTIONS ===

    /**
     * Calculate bounds and fit camera
     */
    function calculateBounds(object = scene) {
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) {
        return { center: new THREE.Vector3(), size: 100 };
      }
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      return { box, center, size };
    }

    /**
     * Fit camera to object with animation
     */
    function fitToObject(meshOrId, animate = true) {
      let targetObj = meshOrId;

      if (typeof meshOrId === 'string') {
        const entry = state.meshes.get(meshOrId);
        if (!entry) return console.warn(`[Viewport] Mesh ${meshOrId} not found`);
        targetObj = entry.mesh;
      }

      const { box, center, size } = calculateBounds(targetObj);
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

      const direction = camera.position.clone().sub(center).normalize();
      const newPos = center.clone().add(direction.multiplyScalar(distance));

      if (animate) {
        // Smooth animation to new position
        const startPos = camera.position.clone();
        const startTime = performance.now();
        const duration = 800; // ms

        function animateCamera(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);

          camera.position.lerpVectors(startPos, newPos, progress);
          controls.target.lerpVectors(controls.target, center, progress);
          controls.update();

          if (progress < 1) {
            requestAnimationFrame(animateCamera);
          }
        }
        requestAnimationFrame(animateCamera);
      } else {
        camera.position.copy(newPos);
        controls.target.copy(center);
        controls.update();
      }
    }

    /**
     * Set to preset view
     */
    function setView(viewName) {
      const view = presetViews[viewName];
      if (!view) return console.warn(`[Viewport] Unknown view: ${viewName}`);

      state.viewName = viewName;
      camera.position.set(...view.pos);
      controls.target.set(...view.target);
      controls.update();
    }

    /**
     * Toggle grid visibility
     */
    function toggleGrid() {
      state.gridVisible = !state.gridVisible;
      grid.visible = state.gridVisible;
    }

    /**
     * Toggle wireframe mode
     */
    function toggleWireframe() {
      state.wireframeMode = !state.wireframeMode;
      scene.traverse(obj => {
        if (obj.isMesh && obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.wireframe = state.wireframeMode);
          } else {
            obj.material.wireframe = state.wireframeMode;
          }
        }
      });
    }

    /**
     * Toggle shadows
     */
    function toggleShadows() {
      state.shadowsEnabled = !state.shadowsEnabled;
      renderer.shadowMap.enabled = state.shadowsEnabled;
      scene.traverse(obj => {
        if (obj.isMesh) {
          obj.castShadow = state.shadowsEnabled;
          obj.receiveShadow = state.shadowsEnabled;
        }
      });
    }

    /**
     * Add mesh to scene
     */
    function addMesh(geometry, material, name = 'Mesh') {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = state.shadowsEnabled;
      mesh.receiveShadow = state.shadowsEnabled;

      const meshId = `mesh_${state.nextMeshId++}`;
      mesh.userData.meshId = meshId;

      scene.add(mesh);
      state.meshes.set(meshId, { mesh, geometry, material, name });

      return meshId;
    }

    /**
     * Remove mesh from scene
     */
    function removeMesh(meshId) {
      const entry = state.meshes.get(meshId);
      if (!entry) return;

      scene.remove(entry.mesh);
      entry.geometry.dispose();
      entry.material.dispose?.();
      state.meshes.delete(meshId);
    }

    /**
     * Set background color
     */
    function setBackground(color) {
      scene.background = new THREE.Color(color);
      scene.fog.color.set(color);
    }

    /**
     * Capture screenshot
     */
    function screenshot(width = 1920, height = 1080) {
      const oldSize = renderer.getSize(new THREE.Vector2());
      renderer.setSize(width, height);
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      renderer.setSize(oldSize.width, oldSize.height);
      renderer.render(scene, camera);
      return dataUrl;
    }

    // === REGISTER WITH KERNEL ===
    kernel.state.set('scene', scene);
    kernel.state.set('camera', camera);
    kernel.state.set('renderer', renderer);
    kernel.state.set('controls', controls);
    kernel.state.set('raycaster', raycaster);

    // Store module methods for later access
    kernel.state.set('viewport', {
      scene, camera, renderer, controls,
      fitToObject, setView, toggleGrid, toggleWireframe, toggleShadows,
      addMesh, removeMesh, setBackground, screenshot,
      calculateBounds, state
    });

    console.log('[ViewportModule] Loaded successfully');
    return { scene, camera, renderer, controls };
  },

  async activate(kernel) {
    console.log('[ViewportModule] Activating...');

    const container = document.getElementById('viewport-container') || (() => {
      const div = document.createElement('div');
      div.id = 'viewport-container';
      div.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden;';
      document.body.appendChild(div);
      return div;
    })();

    const viewport = kernel.state.get('viewport');
    const renderer = kernel.state.get('renderer');

    container.appendChild(renderer.domElement);

    // Start animation loop
    const { state } = viewport;
    function animate() {
      state.animationId = requestAnimationFrame(animate);
      const controls = kernel.state.get('controls');
      controls.update();
      renderer.render(kernel.state.get('scene'), kernel.state.get('camera'));
    }
    animate();

    kernel.bus.emit('viewport:ready', {});
    console.log('[ViewportModule] Activated');
  },

  async deactivate(kernel) {
    console.log('[ViewportModule] Deactivating...');

    const viewport = kernel.state.get('viewport');
    const renderer = kernel.state.get('renderer');

    if (viewport.state.animationId) {
      cancelAnimationFrame(viewport.state.animationId);
    }

    const container = document.getElementById('viewport-container');
    if (container && renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }

    console.log('[ViewportModule] Deactivated');
  },

  async unload(kernel) {
    console.log('[ViewportModule] Unloading...');

    const scene = kernel.state.get('scene');
    const renderer = kernel.state.get('renderer');
    const viewport = kernel.state.get('viewport');

    // Dispose all geometries and materials
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    // Dispose renderer
    renderer.dispose();
    renderer.forceContextLoss();

    // Clear state
    kernel.state.delete('scene');
    kernel.state.delete('camera');
    kernel.state.delete('renderer');
    kernel.state.delete('controls');
    kernel.state.delete('raycaster');
    kernel.state.delete('viewport');

    console.log('[ViewportModule] Unloaded');
  },

  provides: {
    commands: {
      'viewport.fitAll': (kernel) => () => {
        const viewport = kernel.state.get('viewport');
        viewport.fitToObject(kernel.state.get('scene'));
      },

      'viewport.fitTo': (kernel) => (meshId) => {
        const viewport = kernel.state.get('viewport');
        viewport.fitToObject(meshId);
      },

      'viewport.setView': (kernel) => (viewName) => {
        const viewport = kernel.state.get('viewport');
        viewport.setView(viewName);
      },

      'viewport.toggleGrid': (kernel) => () => {
        const viewport = kernel.state.get('viewport');
        viewport.toggleGrid();
      },

      'viewport.toggleWireframe': (kernel) => () => {
        const viewport = kernel.state.get('viewport');
        viewport.toggleWireframe();
      },

      'viewport.toggleShadows': (kernel) => () => {
        const viewport = kernel.state.get('viewport');
        viewport.toggleShadows();
      },

      'viewport.addMesh': (kernel) => (geometry, material, name) => {
        const viewport = kernel.state.get('viewport');
        return viewport.addMesh(geometry, material, name);
      },

      'viewport.removeMesh': (kernel) => (meshId) => {
        const viewport = kernel.state.get('viewport');
        viewport.removeMesh(meshId);
      },

      'viewport.setBackground': (kernel) => (color) => {
        const viewport = kernel.state.get('viewport');
        viewport.setBackground(color);
      },

      'viewport.screenshot': (kernel) => (width, height) => {
        const viewport = kernel.state.get('viewport');
        return viewport.screenshot(width, height);
      }
    },

    events: [
      'part:selected',
      'part:deselected',
      'viewport:ready',
      'viewport:resize'
    ]
  }
};

export default ViewportModule;
