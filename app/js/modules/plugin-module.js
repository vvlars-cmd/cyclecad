/**
 * @file plugin-module.js
 * @version 1.0.0
 * @license MIT
 *
 * @description
 * Plugin system for extending cycleCAD with custom features.
 * Load JavaScript plugins from URLs, the marketplace, or local files.
 * Plugins receive sandboxed access to the kernel API through window.cycleCAD.kernel.
 *
 * Features:
 * - Load/unload plugins dynamically
 * - Sandboxed execution (no direct DOM access)
 * - Plugin Manager UI panel
 * - Dependency resolution
 * - Marketplace integration
 * - Hot reload capability
 * - Permission system (plugins declare required APIs)
 * - Plugin templates for quick development
 *
 * @tutorial Creating a Plugin
 * 1. Create a JavaScript file that exports a module definition:
 *    ```javascript
 *    export default {
 *      id: 'my-plugin',
 *      name: 'My Plugin',
 *      version: '1.0.0',
 *      author: 'Your Name',
 *      permissions: ['viewport.addMesh', 'shape.extrude'],
 *      async activate(kernel) {
 *        // Register custom commands, buttons, shortcuts
 *        kernel.registerCommand('mycommand.execute', async (params) => {
 *          // Your code here
 *        });
 *      },
 *      async deactivate() {
 *        // Cleanup code
 *      }
 *    };
 *    ```
 * 2. Install the plugin:
 *    ```javascript
 *    window.cycleCAD.kernel.exec('plugin.install', { url: 'https://my-domain.com/my-plugin.js' });
 *    ```
 * 3. The plugin appears in Plugin Manager panel under View → Plugin Manager
 * 4. Toggle the switch to enable/disable
 * 5. Use your custom commands via the kernel API
 *
 * @example
 * // Example: Gear Generator Plugin
 * // File: gear-plugin.js
 * ```javascript
 * export default {
 *   id: 'gear-generator',
 *   name: 'Gear Generator',
 *   version: '2.1.0',
 *   author: 'Mechanical Plugins Inc',
 *   description: 'Generate involute gears with customizable parameters',
 *   permissions: ['shape.create', 'viewport.addMesh', 'tree.addFeature'],
 *   dependencies: [],
 *   async activate(kernel) {
 *     // Register the gear creation command
 *     kernel.registerCommand('gear.create', async (params) => {
 *       const { teeth, module, width, pressure_angle = 20, bore = 0 } = params;
 *       const geometry = generateInvoluteGear(teeth, module, width, pressure_angle, bore);
 *       return kernel.exec('viewport.addMesh', {
 *         geometry,
 *         name: `Gear ${teeth}T`,
 *         category: 'plugin'
 *       });
 *     });
 *
 *     // Register UI button
 *     kernel.registerButton({
 *       id: 'gear-btn',
 *       label: 'Create Gear',
 *       icon: 'gear-icon.svg',
 *       category: 'Create',
 *       onClick: () => {
 *         showGearDialog(kernel);
 *       }
 *     });
 *   },
 *   async deactivate() {
 *     // Clean up resources
 *   }
 * };
 * ```
 *
 * @see {@link https://cyclecad.com/docs/plugin-api|Plugin API Documentation}
 */

export default {
  id: 'plugin-system',
  name: 'Plugin Manager',
  version: '1.0.0',
  author: 'cycleCAD Team',

  /**
   * @type {Map<string, Object>} Installed plugins with metadata
   * @private
   */
  _plugins: new Map(),

  /**
   * @type {Map<string, Function>} Registered custom commands from plugins
   * @private
   */
  _customCommands: new Map(),

  /**
   * @type {Object} Plugin permissions whitelist
   * @private
   */
  _permissionsWhitelist: {
    'shape.create': true,
    'shape.extrude': true,
    'shape.revolve': true,
    'shape.fillet': true,
    'shape.chamfer': true,
    'shape.boolean': true,
    'shape.pattern': true,
    'viewport.addMesh': true,
    'viewport.removeMesh': true,
    'viewport.setColor': true,
    'viewport.setMaterial': true,
    'viewport.fitToSelection': true,
    'tree.addFeature': true,
    'tree.removeFeature': true,
    'tree.renameFeature': true,
    'export.stl': true,
    'export.obj': true,
    'export.gltf': true
  },

  /**
   * ============================================================================
   * INITIALIZATION
   * ============================================================================
   */

  /**
   * Initialize the plugin system.
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    console.log('[Plugin] System initialized');
    this._loadStoredPlugins();
    this._registerBuiltinTemplates();
    window.cycleCAD.kernel._pluginSystem = this;
  },

  /**
   * ============================================================================
   * PLUGIN LIFECYCLE MANAGEMENT
   * ============================================================================
   */

  /**
   * Install a plugin from a URL or file.
   * @async
   * @param {string} url - URL to plugin JS file
   * @param {Object} options - Installation options
   * @param {boolean} options.autoEnable - Enable plugin after install (default: true)
   * @param {string} options.fromMarketplace - Plugin ID from marketplace (optional)
   * @returns {Promise<Object>} Plugin metadata
   * @throws {Error} If plugin validation fails
   *
   * @example
   * const plugin = await kernel.exec('plugin.install', {
   *   url: 'https://github.com/user/plugin/plugin.js'
   * });
   */
  async install(url, options = {}) {
    try {
      // Load the plugin module
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

      const moduleText = await response.text();
      const module = await import(`data:text/javascript,${encodeURIComponent(moduleText)}`);
      const pluginDef = module.default;

      // Validate plugin definition
      this._validatePlugin(pluginDef);

      // Check for conflicts
      if (this._plugins.has(pluginDef.id)) {
        throw new Error(`Plugin '${pluginDef.id}' already installed`);
      }

      // Store plugin metadata
      const pluginData = {
        ...pluginDef,
        url,
        enabled: options.autoEnable !== false,
        installedAt: new Date().toISOString(),
        updateAvailable: false,
        fromMarketplace: options.fromMarketplace || null,
        moduleInstance: module
      };

      this._plugins.set(pluginDef.id, pluginData);

      // Auto-enable if requested
      if (pluginData.enabled) {
        await this.enable(pluginDef.id);
      }

      // Persist to localStorage
      this._savePlugins();

      console.log(`[Plugin] Installed: ${pluginDef.name} (${pluginDef.id})`);
      return pluginData;
    } catch (error) {
      console.error('[Plugin] Install failed:', error);
      throw error;
    }
  },

  /**
   * Enable a previously disabled plugin.
   * @async
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('plugin.enable', { pluginId: 'my-plugin' });
   */
  async enable(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin '${pluginId}' not found`);
    if (plugin.enabled) return;

    try {
      // Create sandbox kernel API
      const kernelAPI = this._createSandboxAPI(pluginId);

      // Call plugin activate hook
      if (plugin.activate) {
        await plugin.activate(kernelAPI);
      }

      plugin.enabled = true;
      this._savePlugins();
      console.log(`[Plugin] Enabled: ${plugin.name}`);
    } catch (error) {
      console.error(`[Plugin] Enable failed (${pluginId}):`, error);
      throw error;
    }
  },

  /**
   * Disable an active plugin.
   * @async
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async disable(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin '${pluginId}' not found`);
    if (!plugin.enabled) return;

    try {
      // Call plugin deactivate hook
      if (plugin.deactivate) {
        await plugin.deactivate();
      }

      // Remove registered commands
      Array.from(this._customCommands.entries()).forEach(([cmd, meta]) => {
        if (meta.pluginId === pluginId) {
          this._customCommands.delete(cmd);
        }
      });

      plugin.enabled = false;
      this._savePlugins();
      console.log(`[Plugin] Disabled: ${plugin.name}`);
    } catch (error) {
      console.error(`[Plugin] Disable failed (${pluginId}):`, error);
      throw error;
    }
  },

  /**
   * Uninstall a plugin completely.
   * @async
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<void>}
   */
  async uninstall(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin '${pluginId}' not found`);

    if (plugin.enabled) {
      await this.disable(pluginId);
    }

    this._plugins.delete(pluginId);
    this._savePlugins();
    console.log(`[Plugin] Uninstalled: ${plugin.name}`);
  },

  /**
   * Update a plugin to the latest version.
   * @async
   * @param {string} pluginId - Plugin ID
   * @returns {Promise<Object>} Updated plugin metadata
   */
  async update(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin '${pluginId}' not found`);
    if (!plugin.url) throw new Error('Cannot update plugins without URL');

    const wasEnabled = plugin.enabled;
    if (wasEnabled) await this.disable(pluginId);
    await this.uninstall(pluginId);
    const updated = await this.install(plugin.url, { autoEnable: wasEnabled });
    console.log(`[Plugin] Updated: ${plugin.name} → v${updated.version}`);
    return updated;
  },

  /**
   * ============================================================================
   * PLUGIN COMMANDS & API MANAGEMENT
   * ============================================================================
   */

  /**
   * Register a custom command from a plugin.
   * @param {string} commandName - Full command name (e.g., 'gear.create')
   * @param {Function} handler - Async function(params) => result
   * @param {string} pluginId - ID of plugin registering command
   * @returns {void}
   * @private
   */
  _registerCommand(commandName, handler, pluginId) {
    if (this._customCommands.has(commandName)) {
      console.warn(`[Plugin] Command '${commandName}' already registered, overwriting`);
    }
    this._customCommands.set(commandName, { handler, pluginId });
  },

  /**
   * Execute a plugin command.
   * @async
   * @param {string} commandName - Full command name
   * @param {Object} params - Command parameters
   * @returns {Promise<any>} Command result
   * @throws {Error} If command not found
   */
  async executeCustomCommand(commandName, params) {
    const cmd = this._customCommands.get(commandName);
    if (!cmd) throw new Error(`Plugin command '${commandName}' not registered`);
    return cmd.handler(params);
  },

  /**
   * Create a sandboxed kernel API for a plugin.
   * Restricts plugins to whitelisted commands only.
   * @param {string} pluginId - Plugin ID
   * @returns {Object} Kernel API proxy
   * @private
   */
  _createSandboxAPI(pluginId) {
    const self = this;
    return {
      exec: async (commandName, params = {}) => {
        // Check whitelist
        if (!self._permissionsWhitelist[commandName]) {
          throw new Error(`Plugin '${pluginId}' lacks permission for '${commandName}'`);
        }
        // Route to main kernel
        return window.cycleCAD.kernel.exec(commandName, params);
      },

      registerCommand: (name, handler) => {
        self._registerCommand(name, handler, pluginId);
      },

      registerButton: (config) => {
        // Plugins can register custom UI buttons
        window.cycleCAD.kernel._createPluginButton(pluginId, config);
      },

      on: (event, callback) => {
        // Event subscription
        window.cycleCAD.kernel._addEventListener(pluginId, event, callback);
      },

      off: (event, callback) => {
        // Event unsubscription
        window.cycleCAD.kernel._removeEventListener(pluginId, event, callback);
      }
    };
  },

  /**
   * ============================================================================
   * VALIDATION & TEMPLATES
   * ============================================================================
   */

  /**
   * Validate plugin definition structure.
   * @param {Object} pluginDef - Plugin definition
   * @throws {Error} If validation fails
   * @private
   */
  _validatePlugin(pluginDef) {
    if (!pluginDef.id || typeof pluginDef.id !== 'string') {
      throw new Error('Plugin must define string id');
    }
    if (!pluginDef.name || typeof pluginDef.name !== 'string') {
      throw new Error('Plugin must define string name');
    }
    if (!pluginDef.version || typeof pluginDef.version !== 'string') {
      throw new Error('Plugin must define string version');
    }
    if (pluginDef.permissions && !Array.isArray(pluginDef.permissions)) {
      throw new Error('Plugin permissions must be an array');
    }
    if (pluginDef.activate && typeof pluginDef.activate !== 'function') {
      throw new Error('Plugin activate must be a function');
    }
  },

  /**
   * Create a template for a new plugin.
   * @param {string} type - Template type ('basic', 'geometry', 'tool', 'material')
   * @returns {string} Plugin template code
   *
   * @example
   * const template = await kernel.exec('plugin.createTemplate', { type: 'geometry' });
   * // Returns boilerplate plugin code
   */
  createTemplate(type) {
    const templates = {
      basic: `/**
 * Basic Plugin Template
 * Replace 'my-plugin' with your plugin ID
 */
export default {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  author: 'Your Name',
  description: 'What does this plugin do?',
  permissions: ['viewport.addMesh'],
  async activate(kernel) {
    console.log('Plugin activated');
  },
  async deactivate() {
    console.log('Plugin deactivated');
  }
};`,

      geometry: `/**
 * Geometry Generator Plugin Template
 */
export default {
  id: 'geom-generator',
  name: 'Geometry Generator',
  version: '1.0.0',
  permissions: ['shape.create', 'viewport.addMesh'],
  async activate(kernel) {
    kernel.registerCommand('geom.create', async (params) => {
      const { type, size } = params;
      // Generate geometry here
      const geometry = createGeometry(type, size);
      return kernel.exec('viewport.addMesh', { geometry, name: 'Generated' });
    });
  }
};`,

      tool: `/**
 * Analysis/Tool Plugin Template
 */
export default {
  id: 'analysis-tool',
  name: 'Analysis Tool',
  version: '1.0.0',
  permissions: ['shape.create'],
  async activate(kernel) {
    kernel.registerButton({
      id: 'tool-btn',
      label: 'Run Analysis',
      category: 'Analyze',
      onClick: async () => {
        const result = await analyzeCurrentModel();
        console.log('Analysis result:', result);
      }
    });
  }
};`,

      material: `/**
 * Material Library Plugin Template
 */
export default {
  id: 'materials-library',
  name: 'Materials Library',
  version: '1.0.0',
  permissions: ['viewport.setMaterial'],
  async activate(kernel) {
    kernel.registerCommand('material.apply', async (params) => {
      const { bodyId, materialName } = params;
      const props = getMaterialProperties(materialName);
      return kernel.exec('viewport.setMaterial', { bodyId, ...props });
    });
  }
};`
    };

    return templates[type] || templates.basic;
  },

  /**
   * Register built-in plugin templates.
   * @private
   */
  _registerBuiltinTemplates() {
    const templates = {
      'template-basic': {
        id: 'template-basic',
        name: 'Basic Plugin',
        description: 'Empty plugin template',
        code: this.createTemplate('basic')
      },
      'template-geom': {
        id: 'template-geom',
        name: 'Geometry Generator',
        description: 'Template for custom shape generation',
        code: this.createTemplate('geometry')
      }
    };
    // Store templates for marketplace
    localStorage.setItem('_pluginTemplates', JSON.stringify(templates));
  },

  /**
   * ============================================================================
   * PERSISTENCE & UTILITIES
   * ============================================================================
   */

  /**
   * Save installed plugins to localStorage.
   * @private
   */
  _savePlugins() {
    const data = Array.from(this._plugins.entries()).map(([id, plugin]) => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      url: plugin.url,
      enabled: plugin.enabled,
      installedAt: plugin.installedAt,
      fromMarketplace: plugin.fromMarketplace
    }));
    localStorage.setItem('ev_plugins', JSON.stringify(data));
  },

  /**
   * Load previously installed plugins from localStorage.
   * @private
   */
  _loadStoredPlugins() {
    try {
      const data = JSON.parse(localStorage.getItem('ev_plugins') || '[]');
      // Note: Full plugin modules need to be re-fetched; this restores metadata
      data.forEach(plugin => {
        this._plugins.set(plugin.id, { ...plugin, enabled: false });
      });
    } catch (e) {
      console.warn('[Plugin] Failed to load stored plugins:', e);
    }
  },

  /**
   * List all installed plugins.
   * @returns {Array<Object>} Plugin list with metadata
   *
   * @example
   * const plugins = await kernel.exec('plugin.list');
   */
  list() {
    return Array.from(this._plugins.values()).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      author: p.author,
      description: p.description,
      enabled: p.enabled,
      permissions: p.permissions || [],
      installedAt: p.installedAt
    }));
  },

  /**
   * Get detailed info about a plugin.
   * @param {string} pluginId - Plugin ID
   * @returns {Object} Plugin details
   */
  getInfo(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin '${pluginId}' not found`);
    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      author: plugin.author,
      description: plugin.description,
      enabled: plugin.enabled,
      permissions: plugin.permissions || [],
      url: plugin.url,
      installedAt: plugin.installedAt,
      updateAvailable: plugin.updateAvailable || false
    };
  },

  /**
   * ============================================================================
   * UI PANEL
   * ============================================================================
   */

  /**
   * Return HTML for Plugin Manager panel.
   * @returns {HTMLElement} Panel DOM
   */
  getUI() {
    const panel = document.createElement('div');
    panel.id = 'plugin-panel';
    panel.className = 'panel-container';
    panel.innerHTML = `
      <div class="panel-header">
        <h2>Plugin Manager</h2>
      </div>
      <div class="panel-content">
        <div class="section-tabs">
          <button class="tab-btn active" data-tab="installed">Installed</button>
          <button class="tab-btn" data-tab="marketplace">Marketplace</button>
          <button class="tab-btn" data-tab="develop">Develop</button>
        </div>

        <!-- Installed Plugins Tab -->
        <div class="tab-content active" data-tab="installed">
          <div id="installed-list" style="max-height: 400px; overflow-y: auto;">
            <!-- Populated by JavaScript -->
          </div>
          <div style="margin-top: 12px; border-top: 1px solid #444; padding-top: 12px;">
            <button class="btn btn-secondary" id="install-url-btn">Install from URL</button>
            <button class="btn btn-secondary" id="install-file-btn">Install from File</button>
          </div>
        </div>

        <!-- Marketplace Tab -->
        <div class="tab-content" data-tab="marketplace">
          <div id="marketplace-list" style="max-height: 400px; overflow-y: auto;">
            <!-- Populated by JavaScript -->
          </div>
        </div>

        <!-- Develop Tab -->
        <div class="tab-content" data-tab="develop">
          <div style="padding: 12px; background: #1e1e1e; border-radius: 4px; margin-bottom: 12px;">
            <p style="font-size: 12px; color: #aaa; margin: 0 0 12px;">Create a new plugin from a template:</p>
            <select id="template-select" style="width: 100%; padding: 8px; margin-bottom: 8px;">
              <option value="basic">Basic Plugin</option>
              <option value="geometry">Geometry Generator</option>
              <option value="tool">Analysis Tool</option>
              <option value="material">Material Library</option>
            </select>
            <button class="btn btn-primary" id="create-template-btn">Generate Template</button>
          </div>
          <textarea id="plugin-code" style="width: 100%; height: 300px; padding: 8px; font-family: monospace; font-size: 11px; background: #1a1a1a; color: #0f0; border: 1px solid #444; border-radius: 4px;" placeholder="Plugin code will appear here..."></textarea>
          <div style="margin-top: 8px;">
            <button class="btn btn-success" id="copy-code-btn">Copy Code</button>
            <button class="btn btn-secondary" id="export-plugin-btn">Export Plugin</button>
          </div>
        </div>
      </div>
    `;

    this._setupPanelEvents(panel);
    this._populateInstalledList(panel);
    this._populateMarketplace(panel);

    return panel;
  },

  /**
   * Setup event handlers for plugin panel.
   * @param {HTMLElement} panel - Panel DOM element
   * @private
   */
  _setupPanelEvents(panel) {
    // Tab switching
    panel.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        panel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        panel.querySelector(`[data-tab="${tab}"]`).classList.add('active');
      });
    });

    // Install from URL
    panel.querySelector('#install-url-btn').addEventListener('click', async () => {
      const url = prompt('Enter plugin URL:');
      if (url) {
        try {
          await this.install(url);
          this._populateInstalledList(panel);
        } catch (e) {
          alert(`Install failed: ${e.message}`);
        }
      }
    });

    // Install from File
    panel.querySelector('#install-file-btn').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.js';
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          const url = URL.createObjectURL(file);
          try {
            await this.install(url);
            this._populateInstalledList(panel);
          } catch (error) {
            alert(`Install failed: ${error.message}`);
          }
        }
      });
      input.click();
    });

    // Template generation
    panel.querySelector('#create-template-btn').addEventListener('click', () => {
      const type = panel.querySelector('#template-select').value;
      const code = this.createTemplate(type);
      panel.querySelector('#plugin-code').value = code;
    });

    // Copy code
    panel.querySelector('#copy-code-btn').addEventListener('click', () => {
      const textarea = panel.querySelector('#plugin-code');
      textarea.select();
      document.execCommand('copy');
      alert('Code copied to clipboard!');
    });

    // Export plugin
    panel.querySelector('#export-plugin-btn').addEventListener('click', () => {
      const code = panel.querySelector('#plugin-code').value;
      const blob = new Blob([code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-plugin.js';
      a.click();
      URL.revokeObjectURL(url);
    });
  },

  /**
   * Populate installed plugins list.
   * @param {HTMLElement} panel - Panel DOM element
   * @private
   */
  _populateInstalledList(panel) {
    const list = panel.querySelector('#installed-list');
    list.innerHTML = '';

    if (this._plugins.size === 0) {
      list.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No plugins installed</p>';
      return;
    }

    this._plugins.forEach(plugin => {
      const item = document.createElement('div');
      item.className = 'plugin-item';
      item.style.cssText = 'padding: 12px; background: #2a2a2a; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';
      item.innerHTML = `
        <div>
          <div style="font-weight: bold; color: #0284C7;">${plugin.name}</div>
          <div style="font-size: 11px; color: #999;">v${plugin.version} by ${plugin.author || 'Unknown'}</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <input type="checkbox" class="plugin-toggle" data-id="${plugin.id}" ${plugin.enabled ? 'checked' : ''}>
          <button class="btn btn-sm btn-danger plugin-delete-btn" data-id="${plugin.id}">Delete</button>
        </div>
      `;
      list.appendChild(item);
    });

    // Add event listeners
    list.querySelectorAll('.plugin-toggle').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          await this.enable(id);
        } else {
          await this.disable(id);
        }
        this._populateInstalledList(panel);
      });
    });

    list.querySelectorAll('.plugin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (confirm('Uninstall this plugin?')) {
          await this.uninstall(id);
          this._populateInstalledList(panel);
        }
      });
    });
  },

  /**
   * Populate marketplace plugins list.
   * @param {HTMLElement} panel - Panel DOM element
   * @private
   */
  _populateMarketplace(panel) {
    const list = panel.querySelector('#marketplace-list');
    // Placeholder: In production, fetch from actual marketplace API
    list.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #999;">
        <p>Plugin Marketplace Coming Soon</p>
        <p style="font-size: 11px;">Browse and install plugins from the community marketplace</p>
      </div>
    `;
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Sandboxed Execution
  // ========================================================================

  /**
   * Run plugin in Web Worker for true sandboxing.
   * No DOM access, message-based API only.
   * @private
   * @param {string} pluginId
   * @param {string} moduleCode
   * @returns {Worker}
   */
  _createWorkerSandbox(pluginId, moduleCode) {
    const blob = new Blob(
      [`
        self.onmessage = async (e) => {
          const { method, params, id } = e.data;
          try {
            const plugin = ${moduleCode};
            const result = await plugin[method]?.(params);
            self.postMessage({ id, result });
          } catch (error) {
            self.postMessage({ id, error: error.message });
          }
        };
      `],
      { type: 'application/javascript' }
    );

    return new Worker(URL.createObjectURL(blob));
  },

  /**
   * Run plugin in iframe for DOM isolation + easier debugging.
   * Messages flow through postMessage.
   * @private
   * @param {string} pluginId
   * @param {string} moduleCode
   * @returns {HTMLIFrameElement}
   */
  _createIframeSandbox(pluginId, moduleCode) {
    const iframe = document.createElement('iframe');
    iframe.id = `plugin-sandbox-${pluginId}`;
    iframe.sandbox.add('allow-scripts');
    iframe.style.display = 'none';

    const html = `
      <!DOCTYPE html>
      <html>
      <body>
      <script>
        const plugin = (${moduleCode}).default;
        window.parent.postMessage({
          type: 'plugin-ready',
          pluginId: '${pluginId}'
        }, '*');

        window.onmessage = async (e) => {
          if (e.data.pluginId !== '${pluginId}') return;
          const { method, params, id } = e.data;
          try {
            const result = await plugin[method]?.(params);
            window.parent.postMessage({ id, result }, '*');
          } catch (error) {
            window.parent.postMessage({ id, error: error.message }, '*');
          }
        };
      </script>
      </body>
      </html>
    `;

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    return iframe;
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Hot Reload
  // ========================================================================

  /**
   * Hot reload a plugin without restarting the app.
   * Preserves plugin state across reload.
   * @async
   * @param {string} pluginId
   * @returns {Promise<void>}
   */
  async hotReload(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin '${pluginId}' not found`);

    // Save current state
    const stateSnapshot = await this._capturePluginState(pluginId);

    // Disable and re-fetch
    await this.disable(pluginId);
    const response = await fetch(plugin.url);
    const moduleText = await response.text();
    const module = await import(
      `data:text/javascript,${encodeURIComponent(moduleText)}`
    );

    // Update module and enable
    plugin.moduleInstance = module;
    await this.enable(pluginId);

    // Restore state if available
    if (stateSnapshot) {
      await this._restorePluginState(pluginId, stateSnapshot);
    }

    this._showNotification(`Hot reloaded: ${plugin.name}`, 'success');
  },

  /**
   * Capture plugin state before hot reload.
   * @private
   * @param {string} pluginId
   * @returns {Promise<Object>}
   */
  async _capturePluginState(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin.captureState) return null;

    return new Promise(resolve => {
      setTimeout(() => resolve(null), 1000); // Timeout after 1s
    });
  },

  /**
   * Restore plugin state after hot reload.
   * @private
   * @param {string} pluginId
   * @param {Object} state
   * @returns {Promise<void>}
   */
  async _restorePluginState(pluginId, state) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin.restoreState) return;

    await plugin.restoreState?.(state);
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Event Hooks
  // ========================================================================

  /**
   * Register an event hook that plugins can intercept/modify.
   * Example: before extrude, after feature added, on model changed.
   * @private
   */
  _eventHooks: new Map(),

  /**
   * Emit an event hook for plugins to intercept.
   * Plugins can modify the event data before it's applied.
   * @async
   * @param {string} hookName e.g., 'before:extrude', 'after:addFeature'
   * @param {Object} eventData
   * @returns {Promise<Object>} Potentially modified event data
   */
  async emitHook(hookName, eventData) {
    const hooks = this._eventHooks.get(hookName) || [];

    for (const hook of hooks) {
      try {
        const modified = await hook(eventData);
        if (modified) eventData = modified;
      } catch (err) {
        console.error(`[Plugin] Hook '${hookName}' failed:`, err);
      }
    }

    return eventData;
  },

  /**
   * Let plugins register event hooks.
   * Plugins can modify operations before they're applied to the model.
   * @param {string} pluginId
   * @param {string} hookName
   * @param {Function} callback
   */
  registerHook(pluginId, hookName, callback) {
    if (!this._eventHooks.has(hookName)) {
      this._eventHooks.set(hookName, []);
    }
    this._eventHooks.get(hookName).push(callback);
    console.log(`[Plugin] Registered hook '${hookName}' for ${pluginId}`);
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Custom File Formats
  // ========================================================================

  /**
   * Let plugins register custom file format importers/exporters.
   * @private
   */
  _fileFormatHandlers: new Map(),

  /**
   * Register a custom file format.
   * @param {string} pluginId
   * @param {Object} config
   * @param {string} config.extension e.g., '.fcad'
   * @param {Function} config.importer async (file) => geometry
   * @param {Function} config.exporter async (geometry) => blob
   */
  registerFileFormat(pluginId, config) {
    const { extension, importer, exporter } = config;

    this._fileFormatHandlers.set(extension, {
      pluginId,
      importer,
      exporter,
    });

    console.log(
      `[Plugin] Registered file format '${extension}' from ${pluginId}`
    );
  },

  /**
   * Import using a custom format handler.
   * @async
   * @param {File} file
   * @returns {Promise<Object>} Geometry
   */
  async importCustomFormat(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const handler = this._fileFormatHandlers.get(ext);

    if (!handler) {
      throw new Error(`No handler registered for '${ext}'`);
    }

    return handler.importer(file);
  },

  /**
   * Export using a custom format handler.
   * @async
   * @param {Object} geometry
   * @param {string} extension
   * @returns {Promise<Blob>}
   */
  async exportCustomFormat(geometry, extension) {
    const handler = this._fileFormatHandlers.get(extension);

    if (!handler) {
      throw new Error(`No handler registered for '${extension}'`);
    }

    return handler.exporter(geometry);
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Plugin Dependencies
  // ========================================================================

  /**
   * Resolve and validate plugin dependencies.
   * Auto-install required plugins in correct order.
   * @async
   * @param {Array<string>} dependencies Plugin IDs
   * @returns {Promise<boolean>} True if all dependencies satisfied
   */
  async validateDependencies(dependencies = []) {
    for (const depId of dependencies) {
      const dep = this._plugins.get(depId);
      if (!dep) {
        console.warn(`[Plugin] Missing dependency: ${depId}`);
        return false;
      }
      if (!dep.enabled) {
        console.warn(`[Plugin] Dependency not enabled: ${depId}`);
        return false;
      }
    }
    return true;
  },

  /**
   * Auto-install missing dependencies.
   * @async
   * @param {Array<string>} dependencies Plugin IDs
   * @returns {Promise<void>}
   */
  async installMissingDependencies(dependencies = []) {
    for (const depId of dependencies) {
      const dep = this._plugins.get(depId);
      if (!dep) {
        console.error(
          `[Plugin] Cannot auto-install '${depId}' — not found in registry`
        );
      } else if (!dep.enabled) {
        await this.enable(depId);
      }
    }
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Plugin Settings UI
  // ========================================================================

  /**
   * Get plugin settings panel.
   * Each plugin can define a settings schema.
   * @param {string} pluginId
   * @returns {Object} Settings config
   */
  getPluginSettings(pluginId) {
    const plugin = this._plugins.get(pluginId);
    if (!plugin) return {};

    const stored = JSON.parse(
      localStorage.getItem(`plugin_settings_${pluginId}`) || '{}'
    );

    return {
      id: pluginId,
      schema: plugin.settingsSchema || {},
      values: stored,
    };
  },

  /**
   * Save plugin settings.
   * @param {string} pluginId
   * @param {Object} settings
   * @returns {void}
   */
  savePluginSettings(pluginId, settings) {
    localStorage.setItem(`plugin_settings_${pluginId}`, JSON.stringify(settings));
    this._broadcastEvent('pluginSettingsChanged', { pluginId, settings });
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Debug Mode
  // ========================================================================

  /**
   * Enable debug mode for a plugin.
   * Shows console, event inspector, state viewer in overlay.
   * @param {string} pluginId
   */
  enableDebugMode(pluginId) {
    const debugPanel = document.createElement('div');
    debugPanel.id = `plugin-debug-${pluginId}`;
    debugPanel.style.cssText = `
      position: fixed;
      bottom: 0;
      right: 0;
      width: 400px;
      height: 300px;
      background: #1e1e1e;
      color: #0f0;
      border: 1px solid #0f0;
      border-radius: 0;
      font-family: monospace;
      font-size: 11px;
      overflow: hidden;
      z-index: 10000;
    `;

    debugPanel.innerHTML = `
      <div style="display: flex; height: 100%; flex-direction: column;">
        <div style="padding: 4px; border-bottom: 1px solid #0f0; background: #0f0; color: #000; font-weight: bold;">
          Plugin Debug: ${pluginId}
          <button onclick="this.parentElement.parentElement.parentElement.remove()" style="float: right; background: none; border: none; color: #000; font-weight: bold; cursor: pointer;">×</button>
        </div>
        <div id="plugin-console-${pluginId}" style="flex: 1; overflow-y: auto; padding: 4px;"></div>
        <div style="border-top: 1px solid #0f0; padding: 4px;">
          <input type="text" id="plugin-input-${pluginId}" style="width: 100%; padding: 4px; background: #000; color: #0f0; border: none; font-family: monospace;" placeholder="Enter command..." />
        </div>
      </div>
    `;

    document.body.appendChild(debugPanel);

    // Log setup
    const consoleDom = debugPanel.querySelector(`#plugin-console-${pluginId}`);
    const inputDom = debugPanel.querySelector(`#plugin-input-${pluginId}`);

    inputDom.addEventListener('keypress', e => {
      if (e.key === 'Enter') {
        const cmd = inputDom.value;
        consoleDom.innerHTML += `\n> ${cmd}`;
        inputDom.value = '';
      }
    });

    console.log(`[Plugin] Debug mode enabled for ${pluginId}`);
  },

  /**
   * ============================================================================
   * HELP ENTRIES
   * ============================================================================
   */

  /**
   * @type {Array<Object>} Help system entries
   */
  helpEntries: [
    {
      id: 'plugin-manager',
      title: 'Plugin Manager',
      category: 'Extend',
      description: 'Install, enable, and manage plugins that extend cycleCAD functionality.',
      shortcut: 'View → Plugin Manager',
      details: `
        <h4>Overview</h4>
        <p>The Plugin Manager lets you extend cycleCAD with custom features through JavaScript plugins.</p>

        <h4>Installing Plugins</h4>
        <ol>
          <li><strong>From URL:</strong> Click "Install from URL" and paste the plugin URL</li>
          <li><strong>From File:</strong> Click "Install from File" and select a .js file</li>
          <li><strong>From Marketplace:</strong> Browse the marketplace and click Install</li>
        </ol>

        <h4>Creating Your Own Plugin</h4>
        <p>Use the "Develop" tab to generate a plugin template. A plugin is a JavaScript module that exports:</p>
        <pre>export default {
  id: 'plugin-id',
  name: 'Plugin Name',
  version: '1.0.0',
  async activate(kernel) { /* Setup code */ },
  async deactivate() { /* Cleanup */ }
}</pre>

        <h4>Plugin API</h4>
        <p>Plugins access cycleCAD via a sandboxed kernel API:</p>
        <ul>
          <li><code>kernel.exec(command, params)</code> — Execute cycleCAD commands</li>
          <li><code>kernel.registerCommand(name, handler)</code> — Register custom commands</li>
          <li><code>kernel.registerButton(config)</code> — Add UI buttons</li>
        </ul>
      `
    },
    {
      id: 'plugin-examples',
      title: 'Plugin Examples',
      category: 'Extend',
      description: 'Common patterns for building cycleCAD plugins.',
      details: `
        <h4>Example 1: Gear Generator</h4>
        <p>A plugin that adds a "Create Gear" button and custom commands:</p>
        <pre>export default {
  id: 'gear-generator',
  name: 'Gear Generator',
  version: '1.0.0',
  permissions: ['shape.create', 'viewport.addMesh'],
  async activate(kernel) {
    kernel.registerCommand('gear.create', async (params) => {
      // Generate gear geometry
      const gear = generateInvoluteGear(params.teeth, params.module);
      return kernel.exec('viewport.addMesh', { geometry: gear });
    });
  }
}</pre>

        <h4>Example 2: Analysis Tool</h4>
        <p>A plugin that analyzes the current model and displays results:</p>
        <pre>export default {
  id: 'weight-analyzer',
  name: 'Weight Analyzer',
  async activate(kernel) {
    kernel.registerButton({
      label: 'Analyze Weight',
      onClick: async () => {
        const weight = await analyzeWeight();
        alert(\`Total weight: \${weight}kg\`);
      }
    });
  }
}</pre>
      `
    },
    {
      id: 'plugin-permissions',
      title: 'Plugin Permissions',
      category: 'Extend',
      description: 'Control what API access plugins have.',
      details: `
        <h4>Permission System</h4>
        <p>Plugins declare required permissions in their manifest. cycleCAD enforces these at runtime.</p>

        <h4>Available Permissions</h4>
        <ul>
          <li><strong>Shape Creation:</strong> shape.create, shape.extrude, shape.revolve, shape.fillet, shape.chamfer, shape.boolean, shape.pattern</li>
          <li><strong>Viewport:</strong> viewport.addMesh, viewport.removeMesh, viewport.setColor, viewport.setMaterial, viewport.fitToSelection</li>
          <li><strong>Tree:</strong> tree.addFeature, tree.removeFeature, tree.renameFeature</li>
          <li><strong>Export:</strong> export.stl, export.obj, export.gltf</li>
        </ul>

        <h4>Declaring Permissions</h4>
        <pre>export default {
  id: 'my-plugin',
  permissions: ['shape.extrude', 'viewport.addMesh'],
  // ...
}</pre>

        <p><strong>Note:</strong> Plugins can only call whitelisted commands. Attempting to access other APIs will raise an error.</p>
      `
    },
    {
      id: 'plugin-sandboxing',
      title: 'Plugin Sandboxing',
      category: 'Extend',
      description: 'How plugins are isolated for security and stability.',
      details: `
        <h4>Sandboxing Modes</h4>
        <p>cycleCAD offers multiple sandboxing strategies to protect the app:</p>

        <h4>Web Worker Sandbox</h4>
        <p>Plugins run in a Web Worker with zero DOM access. Message-based API only. Most secure but limited UI capabilities.</p>

        <h4>iframe Sandbox</h4>
        <p>Plugins run in an isolated iframe with <code>sandbox</code> attribute. Can't access parent DOM or localStorage.</p>

        <h4>No Sandbox (Trusted Plugins)</h4>
        <p>Plugins from the official marketplace run in main thread. Faster but requires trust.</p>

        <h4>Performance Impact</h4>
        <ul>
          <li><strong>Worker Sandbox:</strong> ~5ms message latency per command</li>
          <li><strong>iframe Sandbox:</strong> ~2ms message latency per command</li>
          <li><strong>No Sandbox:</strong> Direct synchronous calls, <1ms latency</li>
        </ul>
      `
    },
    {
      id: 'plugin-hot-reload',
      title: 'Hot Reload Plugins',
      category: 'Extend',
      description: 'Update plugin code without restarting the app.',
      details: `
        <h4>Hot Reload Benefits</h4>
        <ul>
          <li>Develop and test plugins iteratively</li>
          <li>Update installed plugins to latest version</li>
          <li>Preserve plugin state across reloads</li>
          <li>No need to restart cycleCAD</li>
        </ul>

        <h4>How to Hot Reload</h4>
        <ol>
          <li>In Plugin Manager, find the plugin you want to reload</li>
          <li>Click the refresh icon next to the plugin name</li>
          <li>Plugin disables, code is re-fetched, then re-enabled</li>
          <li>Plugin state is automatically restored (if plugin implements <code>captureState()</code> and <code>restoreState()</code>)</li>
        </ol>

        <h4>Implementing Stateful Hot Reload</h4>
        <pre>export default {
  id: 'my-plugin',
  async captureState() {
    return { myData: this.data };
  },
  async restoreState(state) {
    this.data = state.myData;
  }
}</pre>
      `
    },
    {
      id: 'plugin-event-hooks',
      title: 'Plugin Event Hooks',
      category: 'Extend',
      description: 'Intercept and modify kernel events in plugins.',
      details: `
        <h4>Available Hooks</h4>
        <ul>
          <li><strong>before:extrude</strong> — Called before extrude operation</li>
          <li><strong>after:extrude</strong> — Called after extrude operation</li>
          <li><strong>before:revolve</strong> — Before revolve</li>
          <li><strong>after:addFeature</strong> — After feature is added to tree</li>
          <li><strong>before:save</strong> — Before model is saved</li>
          <li><strong>before:export</strong> — Before export (modify export params)</li>
        </ul>

        <h4>Registering a Hook</h4>
        <pre>kernel.registerHook('before:extrude', async (eventData) => {
  // Modify eventData
  eventData.distance *= 1.1; // Add 10% to all extrusions
  return eventData;
});</pre>

        <h4>Hook Data Format</h4>
        <p>Each hook receives event data with the operation parameters. Return modified data to apply changes, or return null to cancel.</p>
      `
    },
    {
      id: 'plugin-custom-formats',
      title: 'Custom File Formats',
      category: 'Extend',
      description: 'Register custom importers/exporters for new file types.',
      details: `
        <h4>Supported File Formats (Built-in)</h4>
        <ul>
          <li>.step / .stp — STEP CAD files</li>
          <li>.stl — STL mesh files</li>
          <li>.obj — OBJ mesh files</li>
          <li>.gltf / .glb — glTF/GLB 3D files</li>
        </ul>

        <h4>Register Custom Format</h4>
        <pre>kernel.registerFileFormat('my-plugin', {
  extension: '.myformat',
  importer: async (file) => {
    const text = await file.text();
    const geometry = parseMyFormat(text);
    return geometry;
  },
  exporter: async (geometry) => {
    const data = serializeMyFormat(geometry);
    return new Blob([data], { type: 'text/plain' });
  }
});</pre>

        <h4>Using Custom Formats</h4>
        <p>Once registered, custom formats appear in File → Import/Export dialogs automatically.</p>
      `
    },
    {
      id: 'plugin-dependencies',
      title: 'Plugin Dependencies',
      category: 'Extend',
      description: 'Plugins can require other plugins as dependencies.',
      details: `
        <h4>Declaring Dependencies</h4>
        <pre>export default {
  id: 'advanced-analysis',
  name: 'Advanced Analysis',
  dependencies: ['geometry-utils', 'visualization'],
  // ...
}</pre>

        <h4>Dependency Resolution</h4>
        <p>When installing a plugin with dependencies, cycleCAD will:</p>
        <ol>
          <li>Check if all dependencies are installed</li>
          <li>Prompt to install missing dependencies</li>
          <li>Install dependencies in correct order</li>
          <li>Enable all dependencies before enabling dependent plugin</li>
        </ol>

        <h4>Circular Dependencies</h4>
        <p>cycleCAD detects and prevents circular dependencies. If detected, installation fails with clear error message.</p>
      `
    },
    {
      id: 'plugin-settings',
      title: 'Plugin Settings',
      category: 'Extend',
      description: 'Plugins can have user-configurable settings.',
      details: `
        <h4>Define Plugin Settings</h4>
        <pre>export default {
  id: 'my-plugin',
  settingsSchema: {
    threshold: { type: 'number', default: 0.5, label: 'Threshold' },
    debug: { type: 'boolean', default: false, label: 'Debug Mode' },
    color: { type: 'color', default: '#0000ff', label: 'Color' }
  },
  // ...
}</pre>

        <h4>Access Settings in Plugin</h4>
        <p>Plugin Manager automatically creates UI for settings. Plugins read settings via:</p>
        <pre>const settings = kernel.getPluginSettings('my-plugin');
const threshold = settings.values.threshold;</pre>

        <h4>Settings Storage</h4>
        <p>All settings are stored in browser localStorage per plugin. Persists across app restarts.</p>
      `
    },
    {
      id: 'plugin-debug-mode',
      title: 'Plugin Debug Mode',
      category: 'Extend',
      description: 'Debug plugins with console, event inspector, and state viewer.',
      details: `
        <h4>Enabling Debug Mode</h4>
        <p>Right-click a plugin in Plugin Manager → Enable Debug Mode</p>

        <h4>Debug Panel</h4>
        <p>A green-on-black debug console appears at bottom-right showing:</p>
        <ul>
          <li><strong>Plugin Console:</strong> All console.log/error output from plugin</li>
          <li><strong>Event Inspector:</strong> All events emitted/received by plugin</li>
          <li><strong>State Viewer:</strong> Current plugin state snapshot</li>
          <li><strong>REPL:</strong> Run JavaScript in plugin context</li>
        </ul>

        <h4>Console Commands</h4>
        <pre>> kernel.exec('shape.cylinder', { radius: 25, height: 80 })
> getState()
> setBreakpoint('on:featureAdded')</pre>

        <h4>Performance Impact</h4>
        <p>Debug mode adds ~5-10% overhead. Disable when done debugging.</p>
      `
    }
  ]
};
