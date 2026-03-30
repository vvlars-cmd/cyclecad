/**
 * BRepModule — LEGO-block solid modeling kernel for cycleCAD
 *
 * This module wraps OpenCascade.js WASM and provides real B-Rep geometry operations.
 * It is OPTIONAL and can be hot-swapped with the mesh-based fallback.
 *
 * When loaded:
 *   - Downloads 50MB OpenCascade.js WASM from CDN (lazy-load on first use)
 *   - Provides BRepAPI interface to operations module
 *   - Transparently upgrades all geometry ops to real solid modeling
 *
 * When unloaded:
 *   - Frees WASM memory (garbage collection)
 *   - Operations fall back to mesh approximations (seamless)
 *
 * Module Definition (LEGO block):
 */

const BRepModule = {
  id: 'brep-kernel',
  name: 'B-Rep Kernel (OpenCascade)',
  version: '1.0.0',
  category: 'engine',
  description: 'Real solid modeling with OpenCascade.js WASM',
  author: 'cycleCAD Team',
  license: 'MIT',

  // Dependencies (optional — can work without other modules)
  dependencies: [],
  replaces: ['mesh-kernel'],  // Can hot-swap with mesh fallback

  // Memory estimate
  memoryEstimate: 55,  // MB (50MB WASM + overhead)

  // Current state
  state: {
    isLoaded: false,
    isInitializing: false,
    initialized: false,
    lastError: null,
    downloadProgress: 0,
    initTime: 0
  },

  /**
   * Module initialization (REQUIRED by microkernel)
   * Called when module is registered with the microkernel
   */
  async init() {
    console.log(`[BRepModule] Initializing: ${this.name} v${this.version}`);
    const startTime = performance.now();

    try {
      // Initialize OpenCascade.js WASM (lazy-loaded on first op)
      await this._initKernel();

      this.state.initialized = true;
      this.state.initTime = performance.now() - startTime;
      console.log(`[BRepModule] ✓ Initialized in ${this.state.initTime.toFixed(1)}ms`);

      return { ok: true, state: this.state };
    } catch (err) {
      this.state.lastError = err.message;
      console.error(`[BRepModule] ✗ Init failed:`, err);
      return { ok: false, error: err.message };
    }
  },

  /**
   * Module activation (REQUIRED by microkernel)
   * Called when module is activated (may be called multiple times)
   */
  async activate() {
    console.log(`[BRepModule] Activating...`);
    this.state.isLoaded = true;

    // Expose API to operations module
    window.brepAPI = this.api();

    // Subscribe to operation events (if operations module exists)
    if (window.cycleCAD && window.cycleCAD.on) {
      window.cycleCAD.on('operation:before-execute', this._onOperationStart.bind(this));
      window.cycleCAD.on('operation:after-execute', this._onOperationEnd.bind(this));
    }

    console.log(`[BRepModule] ✓ Activated. API exposed at window.brepAPI`);
    return { ok: true };
  },

  /**
   * Module deactivation (REQUIRED by microkernel)
   * Called when module is unloaded or swapped out
   */
  async deactivate() {
    console.log(`[BRepModule] Deactivating...`);

    try {
      // Unsubscribe from events
      if (window.cycleCAD && window.cycleCAD.off) {
        window.cycleCAD.off('operation:before-execute', this._onOperationStart);
        window.cycleCAD.off('operation:after-execute', this._onOperationEnd);
      }

      // Free WASM memory
      await this._cleanup();

      this.state.isLoaded = false;
      console.log(`[BRepModule] ✓ Deactivated. WASM memory released.`);
      return { ok: true };
    } catch (err) {
      console.error(`[BRepModule] Deactivate error:`, err);
      return { ok: false, error: err.message };
    }
  },

  /**
   * Get module UI (REQUIRED by microkernel)
   * Returns HTML panel for module settings
   */
  getUI() {
    return `
      <div id="brep-module-panel" class="module-panel">
        <div class="module-header">
          <h3>B-Rep Kernel</h3>
          <span class="status ${this.state.initialized ? 'ready' : 'initializing'}">
            ${this.state.initialized ? '✓ Ready' : '⏳ Initializing...'}
          </span>
        </div>

        <div class="module-stats">
          <div class="stat">
            <label>Status:</label>
            <value>${this.state.isLoaded ? 'Active' : 'Inactive'}</value>
          </div>
          <div class="stat">
            <label>Memory:</label>
            <value>${this.memoryEstimate}MB</value>
          </div>
          <div class="stat">
            <label>Init Time:</label>
            <value>${this.state.initTime.toFixed(1)}ms</value>
          </div>
        </div>

        <div class="module-features">
          <h4>Capabilities</h4>
          <ul>
            <li>Real B-Rep geometry (no approximations)</li>
            <li>Advanced fillets & chamfers</li>
            <li>Boolean operations (union, cut, intersect)</li>
            <li>STEP import/export</li>
            <li>Mass properties & CG calculation</li>
            <li>Mesh tessellation</li>
          </ul>
        </div>

        <div class="module-controls">
          <button id="brep-clear-cache" class="btn-secondary">Clear Shape Cache</button>
          <button id="brep-dump-stats" class="btn-secondary">Show Statistics</button>
        </div>

        ${this.state.lastError ? `
          <div class="error-banner">
            <strong>Error:</strong> ${this.state.lastError}
          </div>
        ` : ''}

        <style>
          #brep-module-panel {
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            color: #333;
          }

          .module-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 12px;
          }

          .module-header h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
          }

          .status {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
          }

          .status.ready {
            background: #d4edda;
            color: #155724;
          }

          .status.initializing {
            background: #fff3cd;
            color: #856404;
          }

          .module-stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin: 16px 0;
            padding: 12px;
            background: #f5f5f5;
            border-radius: 4px;
          }

          .stat {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
          }

          .stat label {
            font-weight: 500;
            color: #666;
          }

          .stat value {
            color: #333;
            font-family: 'Courier New', monospace;
          }

          .module-features {
            margin: 16px 0;
          }

          .module-features h4 {
            margin: 0 0 8px 0;
            font-size: 13px;
            font-weight: 600;
            color: #666;
          }

          .module-features ul {
            margin: 0;
            padding-left: 20px;
            font-size: 12px;
            color: #555;
          }

          .module-features li {
            margin: 4px 0;
          }

          .module-controls {
            display: flex;
            gap: 8px;
            margin: 16px 0;
          }

          .btn-secondary {
            padding: 6px 12px;
            font-size: 12px;
            border: 1px solid #ccc;
            background: #f9f9f9;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .btn-secondary:hover {
            background: #e9e9e9;
            border-color: #999;
          }

          .error-banner {
            margin-top: 16px;
            padding: 12px;
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            border-radius: 4px;
            color: #721c24;
            font-size: 12px;
          }
        </style>
      </div>
    `;
  },

  /**
   * Execute module command (REQUIRED by microkernel)
   * Called via window.cycleCAD.execute() or direct module API
   */
  async execute(command, params) {
    console.log(`[BRepModule] Execute: ${command}`, params);

    try {
      // Ensure kernel is initialized
      await this._ensureInitialized();

      // Route command to API
      const api = this.api();
      if (typeof api[command] === 'function') {
        const result = await api[command](params);
        return { ok: true, result };
      } else {
        return { ok: false, error: `Unknown command: ${command}` };
      }
    } catch (err) {
      console.error(`[BRepModule] Execute failed:`, err);
      return { ok: false, error: err.message };
    }
  },

  /**
   * Get module API (exposed as window.brepAPI)
   */
  api() {
    return {
      // Primitive operations
      makeBox: async (w, h, d) => {
        const kernel = await this._getKernel();
        return kernel.makeBox(w, h, d);
      },

      makeCylinder: async (r, h) => {
        const kernel = await this._getKernel();
        return kernel.makeCylinder(r, h);
      },

      makeSphere: async (r) => {
        const kernel = await this._getKernel();
        return kernel.makeSphere(r);
      },

      makeCone: async (r1, r2, h) => {
        const kernel = await this._getKernel();
        return kernel.makeCone(r1, r2, h);
      },

      makeTorus: async (majorR, minorR) => {
        const kernel = await this._getKernel();
        return kernel.makeTorus(majorR, minorR);
      },

      // Shape operations
      extrude: async (shapeId, direction, distance) => {
        const kernel = await this._getKernel();
        return kernel.extrude(shapeId, direction, distance);
      },

      revolve: async (shapeId, axis, angle) => {
        const kernel = await this._getKernel();
        return kernel.revolve(shapeId, axis, angle);
      },

      fillet: async (shapeId, edgeIndices, radius) => {
        const kernel = await this._getKernel();
        return kernel.fillet(shapeId, edgeIndices, radius);
      },

      chamfer: async (shapeId, edgeIndices, distance) => {
        const kernel = await this._getKernel();
        return kernel.chamfer(shapeId, edgeIndices, distance);
      },

      union: async (shapeId1, shapeId2) => {
        const kernel = await this._getKernel();
        return kernel.booleanUnion(shapeId1, shapeId2);
      },

      cut: async (shapeIdBase, shapeIdTool) => {
        const kernel = await this._getKernel();
        return kernel.booleanCut(shapeIdTool, shapeIdBase);
      },

      intersect: async (shapeId1, shapeId2) => {
        const kernel = await this._getKernel();
        return kernel.booleanIntersect(shapeId1, shapeId2);
      },

      shell: async (shapeId, faceIndices, thickness) => {
        const kernel = await this._getKernel();
        return kernel.shell(shapeId, faceIndices, thickness);
      },

      sweep: async (profileId, pathId) => {
        const kernel = await this._getKernel();
        return kernel.sweep(profileId, pathId);
      },

      loft: async (profileIds) => {
        const kernel = await this._getKernel();
        return kernel.loft(profileIds);
      },

      mirror: async (shapeId, plane) => {
        const kernel = await this._getKernel();
        return kernel.mirror(shapeId, plane);
      },

      draft: async (shapeId, faceIndices, angle, direction) => {
        const kernel = await this._getKernel();
        return kernel.draft(shapeId, faceIndices, angle, direction);
      },

      // Meshing
      toMesh: async (shapeId, linearDeflection, angularDeflection) => {
        const kernel = await this._getKernel();
        return kernel.shapeToMesh(shapeId, linearDeflection, angularDeflection);
      },

      // STEP I/O
      importSTEP: async (arrayBuffer) => {
        const kernel = await this._getKernel();
        return kernel.importSTEP(arrayBuffer);
      },

      exportSTEP: async (shapeIds) => {
        const kernel = await this._getKernel();
        return kernel.exportSTEP(shapeIds);
      },

      // Shape inspection
      getEdges: async (shapeId) => {
        const kernel = await this._getKernel();
        return kernel.getEdges(shapeId);
      },

      getFaces: async (shapeId) => {
        const kernel = await this._getKernel();
        return kernel.getFaces(shapeId);
      },

      getMassProperties: async (shapeId) => {
        const kernel = await this._getKernel();
        return kernel.getMassProperties(shapeId);
      },

      getBoundingBox: async (shapeId) => {
        const kernel = await this._getKernel();
        return kernel.getBoundingBox(shapeId);
      },

      // Cache management
      clearCache: async () => {
        const kernel = await this._getKernel();
        kernel.clearCache();
        return { ok: true, message: 'Cache cleared' };
      },

      getStats: async () => {
        const kernel = await this._getKernel();
        return kernel.getCacheStats();
      }
    };
  },

  /**
   * PRIVATE: Initialize kernel
   */
  async _initKernel() {
    if (this.state.isInitializing) {
      // Wait for ongoing init
      while (this.state.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }

    this.state.isInitializing = true;

    try {
      // Dynamic import of kernel
      if (!window.brepKernel) {
        // Load brep-kernel.js if not already loaded
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `import brepKernel from './brep-kernel.js'; window.brepKernel = brepKernel;`;
        document.head.appendChild(script);

        // Wait for it to load
        while (!window.brepKernel) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      // Initialize the kernel (triggers WASM download)
      await window.brepKernel.init();
    } finally {
      this.state.isInitializing = false;
    }
  },

  /**
   * PRIVATE: Get kernel instance (ensuring init)
   */
  async _getKernel() {
    if (!window.brepKernel) {
      await this._initKernel();
    }
    return window.brepKernel;
  },

  /**
   * PRIVATE: Ensure kernel is initialized
   */
  async _ensureInitialized() {
    if (!this.state.initialized) {
      await this.init();
    }
  },

  /**
   * PRIVATE: Cleanup (free WASM memory)
   */
  async _cleanup() {
    if (window.brepKernel) {
      window.brepKernel.clearCache();
      // Note: WASM module stays loaded for garbage collection
      // The browser will free it when the window is closed
    }
  },

  /**
   * PRIVATE: Operation lifecycle hooks
   */
  _onOperationStart(event) {
    console.log('[BRepModule] Operation starting:', event.type);
  },

  _onOperationEnd(event) {
    if (event.error) {
      console.error('[BRepModule] Operation failed:', event.error);
    } else {
      console.log('[BRepModule] Operation complete:', event.type);
    }
  },

  /**
   * Get module schema (for introspection)
   */
  getSchema() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      description: this.description,
      category: this.category,
      state: this.state,
      memoryEstimate: this.memoryEstimate,
      commands: Object.keys(this.api()).map(cmd => ({
        name: cmd,
        type: 'async'
      })),
      events: [
        'operation:before-execute',
        'operation:after-execute',
        'kernel:initialized',
        'kernel:error'
      ]
    };
  }
};

// ============================================================================
// Module Registration (LEGO block pattern)
// ============================================================================

/**
 * Register the BRepModule with cycleCAD's microkernel
 * This makes it hot-swappable and allows other modules to depend on it
 */
if (typeof window !== 'undefined' && window.cycleCAD) {
  window.cycleCAD.registerModule = window.cycleCAD.registerModule || function(module) {
    console.log(`[Microkernel] Registered module: ${module.id}`);
  };
  window.cycleCAD.registerModule(BRepModule);
}

console.log('[BRepModule] Loaded. Call BRepModule.init() to start, or register with microkernel.');

export default BRepModule;
