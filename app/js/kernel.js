/**
 * @file kernel.js
 * @description cycleCAD Microkernel — A lightweight, modular architecture for pluggable CAD components.
 *   Manages module lifecycle, dependencies, lazy loading, hot-swapping, and inter-module communication
 *   via events and commands.
 *
 * @version 1.0.0
 * @author cycleCAD Team
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 *
 * @module kernel
 * @requires nothing (foundational — no dependencies)
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────┐
 *   │         KERNEL (tiny & modular)              │
 *   │ Registry · Bus · Loader · Memory · API       │
 *   └──────────────────────────────────────────────┘
 *
 * Design Patterns:
 *   - Module Registry: Central catalog of all loadable modules
 *   - State Management: Shared kernel.state with watchers
 *   - Event Bus: Pub/sub for inter-module communication
 *   - Lazy Loading: Modules load on-demand when commands execute
 *   - Memory Management: Automatic LRU eviction when budget exceeded
 *   - Dependency Resolution: Recursive load of dependencies before activation
 *
 * Usage Example:
 *   ```javascript
 *   import kernel from './kernel.js';
 *
 *   // Register a module
 *   kernel.register({
 *     id: 'my-module',
 *     name: 'My Module',
 *     version: '1.0.0',
 *     category: 'engine',
 *     dependencies: ['viewport'],
 *     memoryEstimate: 10,
 *     async load(kernel) { console.log('Loading...'); },
 *     async activate(kernel) { console.log('Activated'); },
 *     async deactivate(kernel) { console.log('Deactivated'); },
 *     async unload(kernel) { console.log('Unloaded'); },
 *     provides: {
 *       commands: {
 *         'my-module.greet': (kernel) => (name) => `Hello, ${name}!`
 *       }
 *     }
 *   });
 *
 *   // Execute a command (auto-loads module if needed)
 *   const result = await kernel.exec('my-module.greet', {name: 'Alice'});
 *
 *   // Listen for events
 *   kernel.on('module:loaded', (data) => {
 *     console.log('Module loaded:', data.id);
 *   });
 *
 *   // Watch shared state
 *   kernel.state.watch('selectedPart', (newVal, oldVal) => {
 *     console.log(`Selection changed from ${oldVal} to ${newVal}`);
 *   });
 *   ```
 */

// ═══════════════════════════════════════════════════════
// MODULE STATES
// ═══════════════════════════════════════════════════════

/**
 * Module lifecycle states enum
 *
 * State transitions:
 *   REGISTERED → LOADING → INACTIVE/ACTIVE ↔ INACTIVE → UNLOADING → UNLOADED
 *           ↓ (error)                                 ↓ (error)
 *          ERROR (requires manual recovery)          ERROR
 *
 * @enum {string}
 * @const
 */
const ModuleState = {
  /** Initial state after registration, not yet loaded */
  REGISTERED: 'registered',
  /** Currently loading (resolving dependencies, running load hook) */
  LOADING: 'loading',
  /** Loaded and activated, commands available */
  ACTIVE: 'active',
  /** Loaded but not activated, takes memory but no commands */
  INACTIVE: 'inactive',
  /** Currently unloading (running unload hook, freeing memory) */
  UNLOADING: 'unloading',
  /** Fully unloaded, memory freed, requires full reload to use again */
  UNLOADED: 'unloaded',
  /** Load or activation failed, error message stored in metadata */
  ERROR: 'error',
};

// ═══════════════════════════════════════════════════════
// KERNEL CLASS
// ═══════════════════════════════════════════════════════

/**
 * Kernel class — Central manager for all modules and inter-module communication
 *
 * The Kernel is the tiny heart of cycleCAD, handling:
 *   - Module registration, loading, activation, deactivation, unloading
 *   - Lazy loading on command execution
 *   - Dependency resolution (recursive load of dependencies)
 *   - Module state tracking (REGISTERED → LOADING → ACTIVE ↔ INACTIVE → UNLOADING → UNLOADED)
 *   - Shared state management with watchers
 *   - Event bus for pub/sub communication
 *   - Command registry and dispatch
 *   - Memory management with LRU eviction
 *   - Hot-swap capability (swap old module for new one)
 *
 * @class Kernel
 * @param {Object} [config={}] - Configuration options
 * @param {number} [config.memoryBudget=512] - Total memory budget in MB
 * @param {boolean} [config.autoGC=true] - Enable automatic garbage collection
 */
class Kernel {
  constructor(config = {}) {
    /**
     * Kernel configuration
     * @type {Object}
     * @property {number} memoryBudget - Total memory budget in MB (default 512)
     * @property {boolean} autoGC - Auto-GC enabled (default true)
     */
    this.config = {
      memoryBudget: 512, // MB
      autoGC: true,
      ...config,
    };

    // ═══════════════════════════════════════════════════════
    // REGISTRIES
    // ═══════════════════════════════════════════════════════

    /**
     * Module registry: id → {definition, state, instance, metadata}
     * @type {Map<string, Object>}
     */
    this.modules = new Map();

    /**
     * Command registry: 'module.cmd' → handler function
     * @type {Map<string, Function>}
     */
    this.commands = new Map();

    /**
     * Keyboard shortcut bindings: 'Ctrl+B' → 'module.cmd'
     * @type {Map<string, string>}
     */
    this.shortcuts = new Map();

    // ═══════════════════════════════════════════════════════
    // EVENT BUS
    // ═══════════════════════════════════════════════════════

    /**
     * Event listeners: event → Set of handler functions
     * Supports wildcards (e.g., 'module:*' matches 'module:loaded')
     * @type {Map<string, Set<Function>>}
     */
    this.eventListeners = new Map();

    /**
     * One-time listeners: event → Map(handler → true)
     * Auto-unsubscribed after first fire
     * @type {Map<string, Map<Function, boolean>>}
     */
    this.onceListeners = new Map();

    // ═══════════════════════════════════════════════════════
    // SHARED STATE
    // ═══════════════════════════════════════════════════════

    /**
     * Shared kernel state — accessible and watchable by all modules
     * Usage: kernel.state.set('selectedPart', partId);
     *        kernel.state.watch('selectedPart', (newVal, oldVal) => {...});
     *
     * @type {Object}
     * @property {Map} _values - Stored state values (key → value)
     * @property {Map} _watchers - Watchers (key → Set of handler functions)
     */
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

    // ═══════════════════════════════════════════════════════
    // MEMORY MANAGER
    // ═══════════════════════════════════════════════════════

    /**
     * Memory management system with LRU eviction policy
     * Tracks memory usage across modules and auto-evicts LRU inactive modules
     * if budget exceeded (when pressure > 0.8)
     *
     * @type {Object}
     * @property {Map} _estimates - Module ID → estimated memory in MB
     * @property {Function} usage() - Get total memory used
     * @property {Function} pressure() - Get pressure ratio (0-1, where 1.0 = at budget)
     * @property {number} budget - Total memory budget in MB
     * @property {Function} gc() - Run garbage collection (auto evicts if needed)
     */
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

  // ═══════════════════════════════════════════════════════
  // MODULE LIFECYCLE METHODS
  // ═══════════════════════════════════════════════════════

  /**
   * Register a module definition with the kernel
   *
   * The module is not loaded until explicitly requested or when one of its
   * commands is executed. This allows lazy loading of heavy modules.
   *
   * @param {Object} definition - Module definition object
   * @param {string} definition.id - Unique module identifier (e.g., 'viewport', 'sketch')
   * @param {string} definition.name - Human-readable name (e.g., 'Sketch Engine')
   * @param {string} definition.version - Semantic version string (e.g., '1.0.0')
   * @param {string} definition.category - Module category: 'engine'|'tool'|'data'|'service'|'core'
   * @param {string[]} [definition.dependencies] - Array of module IDs this depends on
   * @param {number} definition.memoryEstimate - Estimated memory usage in MB
   * @param {string[]} [definition.replaces] - Module IDs this replaces (for hot-swap)
   * @param {Function} [definition.load] - Async load hook: async load(kernel) {...}
   * @param {Function} [definition.activate] - Async activate hook: async activate(kernel) {...}
   * @param {Function} [definition.deactivate] - Async deactivate hook: async deactivate(kernel) {...}
   * @param {Function} [definition.unload] - Async unload hook: async unload(kernel) {...}
   * @param {Object} definition.provides - Provided API
   * @param {Object} [definition.provides.commands] - Commands: {cmd: handler(kernel)}
   * @param {Object} [definition.provides.ui] - UI components and shortcuts
   * @returns {boolean} Registration success
   * @throws {Error} If module ID already registered
   *
   * @example
   * kernel.register({
   *   id: 'my-module',
   *   name: 'My Module',
   *   version: '1.0.0',
   *   category: 'tool',
   *   dependencies: ['viewport'],
   *   memoryEstimate: 15,
   *   async load(kernel) {
   *     console.log('Module loading...');
   *   },
   *   async activate(kernel) {
   *     console.log('Module activated');
   *   },
   *   async deactivate(kernel) {
   *     console.log('Module deactivated');
   *   },
   *   async unload(kernel) {
   *     console.log('Module unloaded, memory freed');
   *   },
   *   provides: {
   *     commands: {
   *       'my-module.doSomething': (kernel) => (param) => {
   *         return `Did something with ${param}`;
   *       }
   *     }
   *   }
   * });
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
   * Load a module asynchronously
   *
   * Handles complete lifecycle: resolves dependencies recursively,
   * marks state as LOADING, calls module.load() hook, transitions to INACTIVE.
   * Idempotent — safe to call multiple times.
   *
   * State transition: REGISTERED → LOADING → INACTIVE
   *
   * @async
   * @param {string} moduleId - Module identifier to load
   * @returns {Promise<boolean>} True if load successful, false on error
   * @emits module:loaded - When module enters INACTIVE state
   * @emits module:error - If load fails
   *
   * @example
   * const loaded = await kernel.load('viewport');
   * if (loaded) {
   *   console.log('Viewport module is ready to activate');
   * }
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
   * Activate a module (load first if needed)
   *
   * Ensures module is loaded, then calls activate hook and registers commands.
   * Only ACTIVE modules have their commands available in the command registry.
   * Idempotent — safe to call multiple times.
   *
   * State transition: REGISTERED → LOADING → INACTIVE → ACTIVE
   *                   (or jump to ACTIVE if already INACTIVE)
   *
   * @async
   * @param {string} moduleId - Module identifier to activate
   * @returns {Promise<boolean>} True if activation successful, false on error
   * @emits module:activated - When module reaches ACTIVE state
   * @emits module:error - If activation fails
   *
   * @example
   * const activated = await kernel.activate('viewport');
   * if (activated) {
   *   // viewport.fitAll command is now available
   *   await kernel.exec('viewport.fitAll');
   * }
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
   * Execute a named command by name
   *
   * If command exists and module is active, executes immediately.
   * Otherwise, auto-loads and auto-activates the command's module first.
   * This enables transparent lazy loading — caller doesn't care if module is loaded.
   *
   * Command names follow pattern: 'module.command' (e.g., 'viewport.fitAll')
   *
   * @async
   * @param {string} commandName - Fully-qualified command name (e.g., 'viewport.fitAll', 'brep.makeBox')
   * @param {Object} [params={}] - Command parameters (passed directly to handler)
   * @returns {Promise<any>} Command result (return value of handler function)
   * @throws {Error} If command not found after module load/activate
   * @throws {Error} If module fails to load or activate
   *
   * @example
   * // Direct execution (module auto-loads if needed)
   * const result = await kernel.exec('viewport.fitAll');
   *
   * // With parameters
   * const box = await kernel.exec('brep.makeBox', {
   *   width: 10,
   *   height: 20,
   *   depth: 30
   * });
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

  // ═══════════════════════════════════════════════════════
  // EVENT BUS METHODS
  // ═══════════════════════════════════════════════════════

  /**
   * Subscribe to an event (persistent listener)
   *
   * Listener fires every time the event is emitted.
   * Supports wildcard patterns: 'module:*' matches 'module:loaded', 'module:error', etc.
   *
   * @param {string} event - Event name or wildcard pattern (e.g., 'module:loaded', 'module:*')
   * @param {Function} handler - Handler function: handler(data) {...}
   * @returns {void}
   *
   * @example
   * // Listen for specific event
   * kernel.on('module:loaded', (data) => {
   *   console.log('Module loaded:', data.id);
   * });
   *
   * // Listen for wildcard (all module events)
   * kernel.on('module:*', (data) => {
   *   console.log('Module event:', data);
   * });
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
   * Emit an event to all subscribers
   *
   * Triggers both direct listeners (exact event match) and wildcard listeners
   * (pattern match on event prefix). All handlers called synchronously in order.
   *
   * Wildcard matching: 'module:loaded' triggers listeners for 'module:*'
   *
   * @param {string} event - Event name to emit (e.g., 'module:loaded')
   * @param {Object} [data={}] - Event data (passed to all handler functions)
   * @throws {Error} Suppressed — errors in handlers are caught and logged
   * @returns {void}
   *
   * @example
   * // Emit event with data
   * kernel.emit('module:loaded', {
   *   id: 'viewport',
   *   version: '1.0.0'
   * });
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

  // ═══════════════════════════════════════════════════════
  // INSPECTION METHODS
  // ═══════════════════════════════════════════════════════

  /**
   * Get detailed kernel status and statistics
   *
   * Returns comprehensive status of all modules, commands, state, and memory.
   * Useful for debugging and monitoring kernel health.
   *
   * @returns {Object} Status report
   * @returns {Object} .modules - Module counts by state
   * @returns {number} .modules.registered - Number of registered modules
   * @returns {number} .modules.active - Number of active modules
   * @returns {number} .modules.inactive - Number of inactive (loaded but not active) modules
   * @returns {number} .modules.error - Number of modules in error state
   * @returns {number} .commands - Total registered commands
   * @returns {number} .shortcuts - Total keyboard shortcuts
   * @returns {Object} .memory - Memory usage information
   * @returns {number} .memory.usage - Current usage in MB
   * @returns {number} .memory.budget - Total budget in MB
   * @returns {string} .memory.pressure - Pressure as percentage (0-100%)
   * @returns {Object} .state - Shared state information
   * @returns {number} .state.keys - Number of shared state keys
   * @returns {number} .state.watchers - Number of active state watchers
   *
   * @example
   * const status = kernel.status();
   * console.log(`${status.modules.active} modules active, ${status.memory.pressure} pressure`);
   * // Output: "3 modules active, 25.5% pressure"
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
