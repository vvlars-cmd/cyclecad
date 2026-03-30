/**
 * cycleCAD Microkernel
 *
 * A lightweight, modular architecture for pluggable CAD components.
 * Manages module lifecycle, dependencies, lazy loading, hot-swapping,
 * and inter-module communication via events and commands.
 *
 * @module kernel
 * @version 1.0.0
 */

/**
 * Module lifecycle states
 * @enum {string}
 */
const ModuleState = {
  REGISTERED: 'registered',
  LOADING: 'loading',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  UNLOADING: 'unloading',
  UNLOADED: 'unloaded',
  ERROR: 'error',
};

/**
 * Kernel class — manages all modules and inter-module communication
 */
class Kernel {
  constructor(config = {}) {
    this.config = {
      memoryBudget: 512, // MB
      autoGC: true,
      ...config,
    };

    // Registries
    this.modules = new Map(); // id → {definition, state, instance, metadata}
    this.commands = new Map(); // 'module.cmd' → handler
    this.shortcuts = new Map(); // 'shortcut' → 'module.cmd'

    // Event bus
    this.eventListeners = new Map(); // event → Set of handlers
    this.onceListeners = new Map(); // event → Map(handler → true)

    // Shared state (accessible to all modules)
    this.state = {
      _values: new Map(),
      _watchers: new Map(), // key → Set of handlers

      set: (key, value) => {
        const oldValue = this.state._values.get(key);
        this.state._values.set(key, value);

        // Notify watchers
        const watchers = this.state._watchers.get(key);
        if (watchers) {
          watchers.forEach(handler => {
            try {
              handler(value, oldValue);
            } catch (err) {
              console.error(`[Kernel] State watcher error for "${key}":`, err);
            }
          });
        }
      },

      get: (key) => this.state._values.get(key),

      watch: (key, handler) => {
        if (!this.state._watchers.has(key)) {
          this.state._watchers.set(key, new Set());
        }
        this.state._watchers.get(key).add(handler);

        return () => {
          this.state._watchers.get(key).delete(handler);
        };
      },

      all: () => Object.fromEntries(this.state._values),
    };

    // Memory manager
    this.memory = {
      _estimates: new Map(), // moduleId → MB

      usage: () => {
        let total = 0;
        for (const [moduleId, state] of this.modules.entries()) {
          if (state.state !== ModuleState.UNLOADED && state.state !== ModuleState.ERROR) {
            total += this.memory._estimates.get(moduleId) || 0;
          }
        }
        return total;
      },

      pressure: () => {
        return Math.min(1, this.memory.usage() / this.config.memoryBudget);
      },

      budget: this.config.memoryBudget,

      gc: () => {
        if (this.config.autoGC && this.memory.pressure() > 0.8) {
          this._evictLRU();
        }
      },
    };

    // Module load order tracking (for LRU eviction)
    this._lastUsed = new Map(); // moduleId → timestamp

    // Module dependencies tracking
    this._dependents = new Map(); // moduleId → Set of modules that depend on it

    console.log('[Kernel] Initialized with memory budget:', this.config.memoryBudget, 'MB');
  }

  /**
   * Register a module definition
   * @param {Object} definition - Module definition object
   * @returns {boolean} Success
   */
  register(definition) {
    if (!definition.id || !definition.name) {
      console.error('[Kernel] Module registration requires id and name', definition);
      return false;
    }

    if (this.modules.has(definition.id)) {
      console.warn(`[Kernel] Module "${definition.id}" already registered, replacing`);
    }

    this.modules.set(definition.id, {
      definition,
      state: ModuleState.REGISTERED,
      instance: null,
      metadata: {
        loadedAt: null,
        activatedAt: null,
        lastUsedAt: null,
        errorMessage: null,
      },
    });

    // Track dependencies for reverse lookup
    if (definition.dependencies) {
      definition.dependencies.forEach(dep => {
        if (!this._dependents.has(dep)) {
          this._dependents.set(dep, new Set());
        }
        this._dependents.get(dep).add(definition.id);
      });
    }

    console.log(`[Kernel] Module registered: "${definition.id}" (${definition.category})`);
    return true;
  }

  /**
   * Get module info
   * @param {string} moduleId
   * @returns {Object|null}
   */
  get(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) return null;

    return {
      id: module.definition.id,
      name: module.definition.name,
      version: module.definition.version,
      category: module.definition.category,
      state: module.state,
      dependencies: module.definition.dependencies || [],
      replaces: module.definition.replaces || [],
      memory: this.memory._estimates.get(moduleId) || 0,
      ...module.metadata,
    };
  }

  /**
   * List all registered modules
   * @returns {Array<Object>}
   */
  list() {
    return Array.from(this.modules.keys()).map(id => this.get(id));
  }

  /**
   * List modules by category
   * @param {string} category
   * @returns {Array<Object>}
   */
  listByCategory(category) {
    return this.list().filter(m => m.category === category);
  }

  /**
   * Load a module (async)
   * Resolves dependencies first, then calls module.load()
   * @param {string} moduleId
   * @returns {Promise<boolean>}
   */
  async load(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) {
      console.error(`[Kernel] Module "${moduleId}" not found`);
      return false;
    }

    // Already loaded or loading
    if (module.state === ModuleState.ACTIVE ||
        module.state === ModuleState.INACTIVE ||
        module.state === ModuleState.LOADING) {
      return true;
    }

    // Mark as loading
    module.state = ModuleState.LOADING;

    try {
      // Resolve dependencies first
      if (module.definition.dependencies) {
        for (const depId of module.definition.dependencies) {
          const depLoaded = await this.load(depId);
          if (!depLoaded) {
            throw new Error(`Dependency "${depId}" failed to load`);
          }
        }
      }

      // Call module's load hook
      if (typeof module.definition.load === 'function') {
        await module.definition.load(this);
      }

      module.metadata.loadedAt = Date.now();
      module.state = ModuleState.INACTIVE;

      this.emit('module:loaded', { id: moduleId });
      console.log(`[Kernel] Module loaded: "${moduleId}"`);

      return true;
    } catch (err) {
      module.state = ModuleState.ERROR;
      module.metadata.errorMessage = err.message;
      this.emit('module:error', { id: moduleId, error: err });
      console.error(`[Kernel] Module load failed: "${moduleId}"`, err);
      return false;
    }
  }

  /**
   * Activate a module (load first if needed, then call activate hook)
   * @param {string} moduleId
   * @returns {Promise<boolean>}
   */
  async activate(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) {
      console.error(`[Kernel] Module "${moduleId}" not found`);
      return false;
    }

    // Already active
    if (module.state === ModuleState.ACTIVE) {
      return true;
    }

    // Load first if needed
    if (module.state === ModuleState.REGISTERED || module.state === ModuleState.ERROR) {
      const loaded = await this.load(moduleId);
      if (!loaded) return false;
    }

    try {
      // Call activate hook
      if (typeof module.definition.activate === 'function') {
        await module.definition.activate(this);
      }

      // Register commands from this module
      if (module.definition.provides?.commands) {
        const prefix = moduleId;
        for (const [cmd, handler] of Object.entries(module.definition.provides.commands)) {
          const fullName = `${prefix}.${cmd}`;
          this.commands.set(fullName, handler);
        }
      }

      // Register shortcuts from this module
      if (module.definition.provides?.ui?.shortcuts) {
        for (const [key, cmd] of Object.entries(module.definition.provides.ui.shortcuts)) {
          this.shortcuts.set(key, cmd);
        }
      }

      module.metadata.activatedAt = Date.now();
      module.state = ModuleState.ACTIVE;
      this._lastUsed.set(moduleId, Date.now());

      this.emit('module:activated', { id: moduleId });
      console.log(`[Kernel] Module activated: "${moduleId}"`);

      return true;
    } catch (err) {
      module.state = ModuleState.ERROR;
      module.metadata.errorMessage = err.message;
      this.emit('module:error', { id: moduleId, error: err });
      console.error(`[Kernel] Module activation failed: "${moduleId}"`, err);
      return false;
    }
  }

  /**
   * Deactivate a module (keep in memory, call deactivate hook)
   * @param {string} moduleId
   * @returns {Promise<boolean>}
   */
  async deactivate(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) {
      console.error(`[Kernel] Module "${moduleId}" not found`);
      return false;
    }

    if (module.state !== ModuleState.ACTIVE) {
      return true;
    }

    try {
      // Call deactivate hook
      if (typeof module.definition.deactivate === 'function') {
        await module.definition.deactivate(this);
      }

      // Unregister commands
      for (const cmd of this.commands.keys()) {
        if (cmd.startsWith(moduleId + '.')) {
          this.commands.delete(cmd);
        }
      }

      // Unregister shortcuts
      for (const [key, cmd] of this.shortcuts.entries()) {
        if (cmd.startsWith(moduleId + '.')) {
          this.shortcuts.delete(key);
        }
      }

      module.state = ModuleState.INACTIVE;
      this.emit('module:deactivated', { id: moduleId });
      console.log(`[Kernel] Module deactivated: "${moduleId}"`);

      return true;
    } catch (err) {
      console.error(`[Kernel] Module deactivation failed: "${moduleId}"`, err);
      return false;
    }
  }

  /**
   * Unload a module (full cleanup, free memory)
   * @param {string} moduleId
   * @returns {Promise<boolean>}
   */
  async unload(moduleId) {
    const module = this.modules.get(moduleId);
    if (!module) {
      console.error(`[Kernel] Module "${moduleId}" not found`);
      return false;
    }

    if (module.state === ModuleState.UNLOADED) {
      return true;
    }

    try {
      // Deactivate first if active
      if (module.state === ModuleState.ACTIVE) {
        await this.deactivate(moduleId);
      }

      module.state = ModuleState.UNLOADING;

      // Call unload hook
      if (typeof module.definition.unload === 'function') {
        await module.definition.unload(this);
      }

      module.state = ModuleState.UNLOADED;
      module.instance = null;
      this.memory._estimates.delete(moduleId);
      this._lastUsed.delete(moduleId);

      this.emit('module:unloaded', { id: moduleId });
      console.log(`[Kernel] Module unloaded: "${moduleId}"`);

      return true;
    } catch (err) {
      console.error(`[Kernel] Module unload failed: "${moduleId}"`, err);
      return false;
    }
  }

  /**
   * Hot-swap one module for another
   * @param {string} oldModuleId
   * @param {string} newModuleId
   * @returns {Promise<boolean>}
   */
  async swap(oldModuleId, newModuleId) {
    const oldModule = this.modules.get(oldModuleId);
    const newModule = this.modules.get(newModuleId);

    if (!oldModule || !newModule) {
      console.error('[Kernel] Swap: modules not found', { oldModuleId, newModuleId });
      return false;
    }

    // Verify that newModule claims to replace oldModule
    if (newModule.definition.replaces && !newModule.definition.replaces.includes(oldModuleId)) {
      console.warn(`[Kernel] Module "${newModuleId}" doesn't declare replaces: ["${oldModuleId}"]`);
    }

    console.log(`[Kernel] Swapping "${oldModuleId}" → "${newModuleId}"`);

    try {
      // Emit swapping event so modules can migrate state
      this.emit('module:swapping', { oldId: oldModuleId, newId: newModuleId });

      const wasActive = oldModule.state === ModuleState.ACTIVE;

      // Deactivate old
      await this.deactivate(oldModuleId);
      await this.unload(oldModuleId);

      // Activate new
      const loaded = await this.load(newModuleId);
      if (!loaded) {
        console.error('[Kernel] Failed to load replacement module');
        return false;
      }

      if (wasActive) {
        const activated = await this.activate(newModuleId);
        if (!activated) {
          console.error('[Kernel] Failed to activate replacement module');
          return false;
        }
      }

      this.emit('module:swapped', { oldId: oldModuleId, newId: newModuleId });
      console.log(`[Kernel] Swap complete`);

      return true;
    } catch (err) {
      console.error('[Kernel] Swap failed:', err);
      return false;
    }
  }

  /**
   * Load all modules in a category
   * @param {string} category
   * @returns {Promise<number>} Number of successfully loaded modules
   */
  async loadAll(category) {
    const modules = this.listByCategory(category);
    let loaded = 0;

    for (const mod of modules) {
      const success = await this.load(mod.id);
      if (success) loaded++;
    }

    return loaded;
  }

  /**
   * Execute a named command
   * Auto-loads the command's module if not already loaded
   * @param {string} commandName - e.g., "brep.makeBox"
   * @param {Object} params - Command parameters
   * @returns {Promise<any>} Command result
   */
  async exec(commandName, params = {}) {
    // Check if command exists
    if (this.commands.has(commandName)) {
      const handler = this.commands.get(commandName);
      this._lastUsed.set(this._getModuleFromCommand(commandName), Date.now());
      return await handler(params);
    }

    // Try to auto-load the module and retry
    const moduleId = this._getModuleFromCommand(commandName);
    const loaded = await this.load(moduleId);

    if (!loaded) {
      throw new Error(`Module "${moduleId}" not found`);
    }

    // Activate to register commands
    const activated = await this.activate(moduleId);
    if (!activated) {
      throw new Error(`Module "${moduleId}" failed to activate`);
    }

    // Try again
    if (this.commands.has(commandName)) {
      const handler = this.commands.get(commandName);
      return await handler(params);
    }

    throw new Error(`Command "${commandName}" not found`);
  }

  /**
   * Check if a command exists
   * @param {string} commandName
   * @returns {boolean}
   */
  hasCommand(commandName) {
    return this.commands.has(commandName);
  }

  /**
   * List all registered commands
   * @returns {Array<string>}
   */
  listCommands() {
    return Array.from(this.commands.keys());
  }

  /**
   * Execute a keyboard shortcut
   * @param {string} shortcut - e.g., "Ctrl+B"
   * @returns {Promise<any>} Command result
   */
  async execShortcut(shortcut) {
    const commandName = this.shortcuts.get(shortcut);
    if (!commandName) {
      console.warn(`[Kernel] No command bound to shortcut "${shortcut}"`);
      return null;
    }

    return await this.exec(commandName, { fromShortcut: true });
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name or pattern (e.g., "module:*")
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(handler);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(handler);
    }
  }

  /**
   * Subscribe to an event, fire only once
   * @param {string} event
   * @param {Function} handler
   */
  once(event, handler) {
    const wrapper = (...args) => {
      handler(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  /**
   * Emit an event
   * @param {string} event
   * @param {Object} data
   */
  emit(event, data = {}) {
    // Direct listeners
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[Kernel] Event handler error for "${event}":`, err);
        }
      });
    }

    // Wildcard listeners (e.g., "module:*" matches "module:loaded")
    const eventPrefix = event.split(':')[0];
    const wildcardEvent = eventPrefix + ':*';
    const wildcardListeners = this.eventListeners.get(wildcardEvent);
    if (wildcardListeners) {
      wildcardListeners.forEach(handler => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[Kernel] Wildcard event handler error for "${wildcardEvent}":`, err);
        }
      });
    }
  }

  /**
   * Internal: extract module ID from command name
   * @private
   */
  _getModuleFromCommand(commandName) {
    return commandName.split('.')[0];
  }

  /**
   * Internal: evict least-recently-used inactive modules
   * @private
   */
  _evictLRU() {
    const inactive = Array.from(this.modules.entries())
      .filter(([id, m]) => m.state === ModuleState.INACTIVE)
      .sort((a, b) => {
        const timeA = this._lastUsed.get(a[0]) || 0;
        const timeB = this._lastUsed.get(b[0]) || 0;
        return timeA - timeB; // oldest first
      });

    if (inactive.length > 0) {
      const [lruId] = inactive[0];
      console.log(`[Kernel] Memory pressure > 0.8, evicting "${lruId}"`);
      this.unload(lruId);
    }
  }

  /**
   * Get detailed kernel status
   * @returns {Object}
   */
  status() {
    return {
      modules: {
        registered: this.modules.size,
        active: Array.from(this.modules.values()).filter(m => m.state === ModuleState.ACTIVE).length,
        inactive: Array.from(this.modules.values()).filter(m => m.state === ModuleState.INACTIVE).length,
        error: Array.from(this.modules.values()).filter(m => m.state === ModuleState.ERROR).length,
      },
      commands: this.commands.size,
      shortcuts: this.shortcuts.size,
      memory: {
        usage: this.memory.usage(),
        budget: this.memory.budget,
        pressure: (this.memory.pressure() * 100).toFixed(1) + '%',
      },
      state: {
        keys: this.state._values.size,
        watchers: this.state._watchers.size,
      },
    };
  }
}

// Create singleton kernel instance
const kernel = new Kernel();

// Export and attach to window
export default kernel;
if (typeof window !== 'undefined') {
  window.kernel = kernel;
}
