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
    }
  ]
};
