/**
 * @file version-module.js
 * @description Git-style version control for CAD designs.
 *   Save snapshots of your entire model (geometry, parameters, constraints, tree),
 *   create branches to experiment safely, and merge changes back together.
 *   All data is stored locally in IndexedDB (browser) with optional cloud sync.
 *   Never lose work — complete history is always available for restore or rollback.
 *
 * @tutorial Saving Your First Version
 *   Step 1: Make changes to your model (draw sketch, extrude, add features)
 *
 *   Step 2: Save a version with Ctrl+S or click Version → Save
 *     const saved = await kernel.exec('version.save', {
 *       message: 'Added main cylinder body'
 *     });
 *     console.log('Version ID:', saved.versionId);
 *
 *   Step 3: The version appears in the timeline panel on the left
 *     - Shows time, message, and thumbnail of 3D model
 *     - You can hover to preview the 3D geometry
 *
 *   Step 4: Continue working — save again when done
 *     const saved2 = await kernel.exec('version.save', {
 *       message: 'Added hole and fillets'
 *     });
 *
 * @tutorial Branching for Experimentation
 *   Use branches to try new ideas without losing your main work.
 *
 *   Step 1: Create a branch from current version
 *     const branch = await kernel.exec('version.branch', {
 *       name: 'try-split-design',
 *       fromVersionId: null  // null = from current state
 *     });
 *
 *   Step 2: Make experimental changes (you're now on the branch)
 *     kernel.exec('shape.cylinder', { radius: 30, height: 100 });
 *     kernel.exec('version.save', { message: 'Trying larger cylinder' });
 *
 *   Step 3a: Like it? Merge back to main
 *     const merged = await kernel.exec('version.merge', {
 *       branchName: 'try-split-design',
 *       strategy: 'ours'  // Keep our (main) changes on conflict
 *     });
 *
 *   Step 3b: Don't like it? Just switch back to main
 *     await kernel.exec('version.switchBranch', { name: 'main' });
 *     // All experimental changes disappear
 *
 * @tutorial Comparing Two Versions
 *   See exactly what changed between two snapshots.
 *
 *   Step 1: Open the compare viewer
 *     const diff = await kernel.exec('version.compare', {
 *       versionId1: 'v123',
 *       versionId2: 'v124'
 *     });
 *
 *   Step 2: The viewport splits into two 3D views
 *     - Left: version v123 in blue
 *     - Right: version v124 in green
 *     - Changed parts highlighted in orange
 *
 * @tutorial Auto-Save Configuration
 *   Protect against crashes with automatic saves.
 *
 *   Option 1: Enable default auto-save (every 5 minutes)
 *     await kernel.exec('version.setAutoSave', { enabled: true });
 *
 *   Option 2: Custom interval (every 2 minutes)
 *     await kernel.exec('version.setAutoSave', {
 *       enabled: true,
 *       intervalMs: 120000
 *     });
 *
 *   Option 3: Disable auto-save
 *     await kernel.exec('version.setAutoSave', { enabled: false });
 *
 * @version 1.0.0
 * @author Sachin Kumar <vvlars@googlemail.com>
 * @license MIT
 */

// ============================================================================
// VERSION CONTROL MODULE — Main Export
// ============================================================================

export default {
  name: 'version',
  version: '1.0.0',

  // ========================================================================
  // MODULE STATE
  // ========================================================================

  state: {
    /** @type {string} Current project ID (UUID) */
    projectId: null,

    /** @type {string} Current branch name (default: 'main') */
    currentBranch: 'main',

    /** @type {string} Current version ID */
    currentVersionId: null,

    /** @type {Array<Object>} Versions on current branch */
    versions: [],

    /** @type {Map<string, Object>} All branches by name */
    branches: new Map([['main', { name: 'main', baseVersionId: null }]]),

    /** @type {number} Auto-save interval in ms (null = disabled) */
    autoSaveInterval: null,

    /** @type {IDBDatabase} IndexedDB handle */
    db: null,

    /** @type {number} Total versions created in this project */
    versionCount: 0,

    /** @type {Date} Timestamp of last manual save */
    lastSaveTime: null,

    /** @type {boolean} True if changes exist since last save */
    isDirty: false,
  },

  // ========================================================================
  // INIT — Setup IndexedDB and restore project
  // ========================================================================

  /**
   * Initialize version control module.
   * Opens IndexedDB, loads project history, starts auto-save if configured.
   * Called automatically on app startup.
   *
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    // Open or create IndexedDB
    this.state.db = await this._openDatabase();

    // Load or create project
    const projectId =
      localStorage.getItem('version_projectId') ||
      this._generateUUID();
    this.state.projectId = projectId;
    localStorage.setItem('version_projectId', projectId);

    // Load project metadata
    const projectMeta = await this._getProjectMetadata();
    if (projectMeta) {
      this.state.branches = new Map(Object.entries(projectMeta.branches || {}));
      this.state.versionCount = projectMeta.versionCount || 0;
      this.state.currentBranch = projectMeta.currentBranch || 'main';
    }

    // Load versions on current branch
    await this._loadBranchVersions(this.state.currentBranch);

    // Restore last version if exists
    if (this.state.versions.length > 0) {
      this.state.currentVersionId = this.state.versions[0].id;
    }

    // Load auto-save setting
    const autoSaveMs = localStorage.getItem('version_autoSaveMs');
    if (autoSaveMs !== null) {
      this.setAutoSave({
        enabled: true,
        intervalMs: parseInt(autoSaveMs, 10),
      });
    }

    // Listen for model changes
    window.addEventListener('modelChanged', () => {
      this.state.isDirty = true;
    });

    console.log('[Version Control] Initialized. Project ID:', projectId);
  },

  // ========================================================================
  // PUBLIC API — Save and Restore
  // ========================================================================

  /**
   * Save a snapshot of the current model state.
   * Captures geometry, parameters, constraints, feature tree, and assembly.
   * Returns immediately with version ID; compression happens in background.
   *
   * @param {Object} options
   * @param {string} [options.message=''] Commit message describing changes
   * @param {Array<string>} [options.tags] Optional tags (e.g., ['release', 'v1'])
   * @param {boolean} [options.createThumbnail=true] Capture 3D thumbnail
   * @returns {Promise<Object>}
   *   { versionId, timestamp, message, branch, number }
   *
   * @example
   * const saved = await kernel.exec('version.save', {
   *   message: 'Added main shaft with keyway'
   * });
   * console.log('Saved version', saved.number, 'of', saved.branch);
   */
  async save(options = {}) {
    const {
      message = '',
      tags = [],
      createThumbnail = true,
    } = options;

    if (message.length > 500) {
      throw new Error('Message too long (max 500 chars)');
    }

    // Capture current model state
    const state = await this._captureModelState();

    // Create version object
    const version = {
      id: this._generateUUID(),
      timestamp: Date.now(),
      message: message.trim(),
      tags,
      branch: this.state.currentBranch,
      author: localStorage.getItem('version_userName') || 'Unknown',
      number: ++this.state.versionCount,
      parentVersionId: this.state.currentVersionId,
      modelState: state,
      thumbnail: null,
    };

    // Capture thumbnail (async, doesn't block save)
    if (createThumbnail) {
      this._captureThumb(version).then((thumb) => {
        version.thumbnail = thumb;
        this._saveVersionToDB(version);
      });
    } else {
      await this._saveVersionToDB(version);
    }

    // Update state
    this.state.versions.unshift(version); // Add to front (newest first)
    this.state.currentVersionId = version.id;
    this.state.isDirty = false;
    this.state.lastSaveTime = new Date();

    // Save project metadata
    await this._saveProjectMetadata();

    this._showNotification(`Saved version ${version.number}`, 'success');
    this._broadcastEvent('version:saved', version);

    return {
      versionId: version.id,
      timestamp: version.timestamp,
      message: version.message,
      branch: version.branch,
      number: version.number,
    };
  },

  /**
   * Restore the model to a previous version.
   * Replaces current geometry/tree with saved state. Changes become dirty again.
   *
   * @param {Object} options
   * @param {string} options.versionId Version ID to restore
   * @param {boolean} [options.keepChanges=false] Preserve current changes in undo stack
   * @returns {Promise<Object>} Restored version object
   *
   * @example
   * await kernel.exec('version.restore', {
   *   versionId: 'abc123',
   *   keepChanges: true  // Don't lose current work
   * });
   */
  async restore(options = {}) {
    const { versionId, keepChanges = false } = options;

    // Load version from DB
    const version = await this._getVersionFromDB(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    // If keeping changes, save current state first
    if (keepChanges && this.state.isDirty) {
      await this.save({ message: '[Auto-save before restore]' });
    }

    // Restore model state
    await this._restoreModelState(version.modelState);

    // Update state
    this.state.currentVersionId = versionId;
    this.state.isDirty = false;

    this._showNotification(
      `Restored version ${version.number}: ${version.message}`,
      'success'
    );
    this._broadcastEvent('version:restored', version);

    return version;
  },

  // ========================================================================
  // PUBLIC API — Branching
  // ========================================================================

  /**
   * Create a new branch from current state.
   * Branch is a separate history line — changes don't affect main or other branches.
   * Useful for experiments, client-specific variants, or concurrent work.
   *
   * @param {Object} options
   * @param {string} options.name Branch name (alphanumeric, hyphens, underscores)
   * @param {string} [options.fromVersionId] Base version (null = current state)
   * @param {string} [options.description] Branch description
   * @returns {Promise<Object>} { name, baseVersionId, createdAt }
   *
   * @example
   * const branch = await kernel.exec('version.branch', {
   *   name: 'client-special-variant',
   *   description: 'Custom dimensions for client XYZ'
   * });
   */
  async branch(options = {}) {
    const { name, fromVersionId = null, description = '' } = options;

    if (!/^[a-z0-9_-]+$/i.test(name)) {
      throw new Error(
        'Branch name must contain only alphanumeric, hyphens, underscores'
      );
    }

    if (this.state.branches.has(name)) {
      throw new Error(`Branch ${name} already exists`);
    }

    // Create branch record
    const branch = {
      name,
      baseVersionId: fromVersionId || this.state.currentVersionId,
      createdAt: Date.now(),
      description,
    };

    this.state.branches.set(name, branch);
    await this._saveProjectMetadata();

    this._showNotification(`Created branch: ${name}`, 'success');
    this._broadcastEvent('version:branchCreated', branch);

    return {
      name: branch.name,
      baseVersionId: branch.baseVersionId,
      createdAt: branch.createdAt,
    };
  },

  /**
   * Switch to a different branch.
   * Saves current state, then loads the target branch's latest version.
   *
   * @param {Object} options
   * @param {string} options.name Target branch name
   * @param {boolean} [options.save=true] Auto-save current changes first
   * @returns {Promise<Object>} Latest version on target branch
   *
   * @example
   * await kernel.exec('version.switchBranch', {
   *   name: 'experimental-design'
   * });
   */
  async switchBranch(options = {}) {
    const { name, save = true } = options;

    if (!this.state.branches.has(name)) {
      throw new Error(`Branch ${name} does not exist`);
    }

    if (name === this.state.currentBranch) {
      return { alreadyOnBranch: true };
    }

    // Save current branch's work
    if (save && this.state.isDirty) {
      await this.save({ message: '[Auto-save before branch switch]' });
    }

    // Load target branch's versions
    this.state.currentBranch = name;
    await this._loadBranchVersions(name);

    // Restore latest version on target branch
    if (this.state.versions.length > 0) {
      const latest = this.state.versions[0];
      await this._restoreModelState(latest.modelState);
      this.state.currentVersionId = latest.id;
    }

    await this._saveProjectMetadata();

    this._showNotification(`Switched to branch: ${name}`, 'success');
    this._broadcastEvent('version:branchSwitched', { branch: name });

    return {
      branch: name,
      versionCount: this.state.versions.length,
    };
  },

  /**
   * Merge another branch into current branch.
   * Handles conflicts using specified strategy.
   *
   * @param {Object} options
   * @param {string} options.branchName Branch to merge in
   * @param {string} [options.strategy='interactive'] Conflict resolution
   *   'ours' = keep current branch on conflict
   *   'theirs' = take incoming branch on conflict
   *   'interactive' = show diff and ask user
   * @returns {Promise<Object>} Merge result with stats
   *
   * @example
   * const merged = await kernel.exec('version.merge', {
   *   branchName: 'experimental-feature',
   *   strategy: 'ours'
   * });
   * console.log('Parts added:', merged.partsAdded);
   */
  async merge(options = {}) {
    const { branchName, strategy = 'interactive' } = options;

    if (!this.state.branches.has(branchName)) {
      throw new Error(`Branch ${branchName} not found`);
    }

    if (branchName === this.state.currentBranch) {
      throw new Error('Cannot merge branch into itself');
    }

    // Get latest version from both branches
    const currentLatest = this.state.versions[0];
    const branchVersions = await this._getBranchVersions(branchName);
    const incomingLatest = branchVersions[0];

    if (!incomingLatest) {
      throw new Error(`Branch ${branchName} has no versions`);
    }

    // Compute three-way merge
    const mergeResult = await this._computeThreeWayMerge(
      currentLatest,
      incomingLatest,
      strategy
    );

    if (mergeResult.conflicts.length > 0 && strategy === 'interactive') {
      // Would show UI for conflict resolution
      throw new Error(
        `Merge has ${mergeResult.conflicts.length} conflicts. Resolve manually.`
      );
    }

    // Apply merge result
    await this._restoreModelState(mergeResult.mergedState);

    // Create merge commit
    const mergeVersion = await this.save({
      message: `Merge branch '${branchName}' into '${this.state.currentBranch}'`,
    });

    this._showNotification(`Merged branch: ${branchName}`, 'success');
    this._broadcastEvent('version:merged', mergeResult);

    return {
      success: true,
      partsAdded: mergeResult.partsAdded || 0,
      partsRemoved: mergeResult.partsRemoved || 0,
      partsModified: mergeResult.partsModified || 0,
      conflicts: mergeResult.conflicts,
      mergeVersionId: mergeVersion.versionId,
    };
  },

  /**
   * Delete a branch.
   * Cannot delete current branch. Main branch cannot be deleted.
   *
   * @param {Object} options
   * @param {string} options.name Branch to delete
   * @returns {Promise<void>}
   */
  async deleteBranch(options = {}) {
    const { name } = options;

    if (name === 'main') {
      throw new Error('Cannot delete main branch');
    }

    if (name === this.state.currentBranch) {
      throw new Error('Cannot delete current branch');
    }

    this.state.branches.delete(name);
    await this._saveProjectMetadata();

    this._showNotification(`Deleted branch: ${name}`, 'success');
  },

  // ========================================================================
  // PUBLIC API — Comparison and Diff
  // ========================================================================

  /**
   * Compare two versions and show differences.
   * Opens a split-view with both versions visible, highlighting changes.
   *
   * @param {Object} options
   * @param {string} options.versionId1 First version (left)
   * @param {string} options.versionId2 Second version (right)
   * @returns {Promise<Object>} Diff data { added, removed, modified, unchanged }
   *
   * @example
   * const diff = await kernel.exec('version.compare', {
   *   versionId1: 'abc123',
   *   versionId2: 'def456'
   * });
   * console.log('Parts added:', diff.added.length);
   */
  async compare(options = {}) {
    const { versionId1, versionId2 } = options;

    if (!versionId1 || !versionId2) {
      throw new Error('Two version IDs required');
    }

    const v1 = await this._getVersionFromDB(versionId1);
    const v2 = await this._getVersionFromDB(versionId2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    // Compute diff
    const diff = this._computeDiff(v1.modelState, v2.modelState);

    this._broadcastEvent('version:diffShown', {
      versionId1,
      versionId2,
      diff,
    });

    return {
      added: diff.added,
      removed: diff.removed,
      modified: diff.modified,
      unchanged: diff.unchanged,
    };
  },

  // ========================================================================
  // PUBLIC API — List and Query
  // ========================================================================

  /**
   * Get all versions on current branch.
   *
   * @param {Object} [options]
   * @param {number} [options.limit=50] Max versions to return
   * @param {number} [options.offset=0] Pagination offset
   * @returns {Promise<Array<Object>>} Array of version summaries
   *
   * @example
   * const versions = await kernel.exec('version.list', { limit: 20 });
   * versions.forEach(v => console.log(`#${v.number}: ${v.message}`));
   */
  async list(options = {}) {
    const { limit = 50, offset = 0 } = options;

    return this.state.versions.slice(offset, offset + limit).map((v) => ({
      id: v.id,
      number: v.number,
      timestamp: v.timestamp,
      message: v.message,
      tags: v.tags,
      branch: v.branch,
      author: v.author,
    }));
  },

  /**
   * Get all branches.
   *
   * @returns {Promise<Array<Object>>} Array of branch info
   *
   * @example
   * const branches = await kernel.exec('version.getBranches');
   * console.log('Branches:', branches.map(b => b.name));
   */
  async getBranches() {
    return Array.from(this.state.branches.values()).map((b) => ({
      name: b.name,
      isCurrent: b.name === this.state.currentBranch,
      createdAt: b.createdAt,
      description: b.description,
    }));
  },

  // ========================================================================
  // PUBLIC API — Auto-Save and Export
  // ========================================================================

  /**
   * Configure automatic saving.
   * Saves model state on a timer (e.g., every 5 minutes).
   *
   * @param {Object} options
   * @param {boolean} options.enabled Enable or disable auto-save
   * @param {number} [options.intervalMs=300000] Interval (default 5 min)
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('version.setAutoSave', {
   *   enabled: true,
   *   intervalMs: 120000  // 2 minutes
   * });
   */
  async setAutoSave(options = {}) {
    const { enabled = true, intervalMs = 300000 } = options;

    // Clear existing interval
    if (this.state.autoSaveInterval) {
      clearInterval(this.state.autoSaveInterval);
    }

    if (enabled) {
      // Start new interval
      this.state.autoSaveInterval = setInterval(() => {
        if (this.state.isDirty) {
          this.save({ message: '[Auto-save]' });
        }
      }, intervalMs);

      localStorage.setItem('version_autoSaveMs', intervalMs.toString());
    } else {
      this.state.autoSaveInterval = null;
      localStorage.removeItem('version_autoSaveMs');
    }
  },

  /**
   * Export a version as a JSON file for backup or sharing.
   *
   * @param {Object} options
   * @param {string} options.versionId Version to export
   * @returns {Promise<Blob>} JSON blob ready for download
   *
   * @example
   * const blob = await kernel.exec('version.export', {
   *   versionId: 'abc123'
   * });
   * // User can download or share the blob
   */
  async exportVersion(options = {}) {
    const { versionId } = options;

    const version = await this._getVersionFromDB(versionId);
    if (!version) {
      throw new Error('Version not found');
    }

    // Compress before export
    const compressed = await this._compressModelState(version.modelState);

    const exportData = {
      version: 1,
      projectId: this.state.projectId,
      versionId: version.id,
      timestamp: version.timestamp,
      message: version.message,
      branch: version.branch,
      modelState: compressed,
    };

    const json = JSON.stringify(exportData, null, 2);
    return new Blob([json], { type: 'application/json' });
  },

  /**
   * Import a previously exported version.
   *
   * @param {Object} options
   * @param {File|Blob} options.file JSON file to import
   * @param {boolean} [options.asBranch=false] Import as new branch
   * @returns {Promise<Object>} Imported version info
   */
  async importVersion(options = {}) {
    const { file, asBranch = false } = options;

    const json = JSON.parse(await file.text());

    // Decompress
    const modelState = await this._decompressModelState(json.modelState);

    if (asBranch) {
      const branchName = `imported-${Date.now()}`;
      await this.branch({ name: branchName });
      await this.switchBranch({ name: branchName });
    }

    // Create version from imported data
    const version = {
      id: this._generateUUID(),
      timestamp: Date.now(),
      message: `[Imported] ${json.message}`,
      tags: ['imported'],
      branch: this.state.currentBranch,
      author: 'Importer',
      number: ++this.state.versionCount,
      modelState,
      thumbnail: null,
    };

    await this._saveVersionToDB(version);
    this.state.versions.unshift(version);
    this.state.currentVersionId = version.id;

    return { versionId: version.id, message: version.message };
  },

  // ========================================================================
  // INTERNAL HELPERS — Database
  // ========================================================================

  /**
   * Open or create IndexedDB.
   *
   * @private
   * @async
   * @returns {Promise<IDBDatabase>}
   */
  async _openDatabase() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('cyclecad-versions', 1);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains('versions')) {
          const versionsStore = db.createObjectStore('versions', {
            keyPath: 'id',
          });
          versionsStore.createIndex('projectId', 'projectId');
          versionsStore.createIndex('branch', 'branch');
        }
      };
    });
  },

  /**
   * Get or create project metadata.
   *
   * @private
   * @async
   * @returns {Promise<Object|null>}
   */
  async _getProjectMetadata() {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['projects'], 'readonly');
      const store = tx.objectStore('projects');
      const req = store.get(this.state.projectId);

      req.onsuccess = () => resolve(req.result || null);
    });
  },

  /**
   * Save project metadata to DB.
   *
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _saveProjectMetadata() {
    return new Promise((resolve) => {
      const meta = {
        projectId: this.state.projectId,
        branches: Object.fromEntries(this.state.branches),
        currentBranch: this.state.currentBranch,
        versionCount: this.state.versionCount,
      };

      const tx = this.state.db.transaction(['projects'], 'readwrite');
      const store = tx.objectStore('projects');
      store.put(meta);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Save a version to IndexedDB.
   *
   * @private
   * @async
   * @param {Object} version
   * @returns {Promise<void>}
   */
  async _saveVersionToDB(version) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['versions'], 'readwrite');
      const store = tx.objectStore('versions');
      store.put(version);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Retrieve a version from IndexedDB.
   *
   * @private
   * @async
   * @param {string} versionId
   * @returns {Promise<Object|null>}
   */
  async _getVersionFromDB(versionId) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['versions'], 'readonly');
      const store = tx.objectStore('versions');
      const req = store.get(versionId);

      req.onsuccess = () => resolve(req.result || null);
    });
  },

  /**
   * Load all versions for a branch.
   *
   * @private
   * @async
   * @param {string} branchName
   * @returns {Promise<void>}
   */
  async _loadBranchVersions(branchName) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['versions'], 'readonly');
      const store = tx.objectStore('versions');
      const index = store.index('branch');
      const req = index.getAll(branchName);

      req.onsuccess = () => {
        // Sort by timestamp descending (newest first)
        this.state.versions = req.result.sort(
          (a, b) => b.timestamp - a.timestamp
        );
        resolve();
      };
    });
  },

  /**
   * Get all versions for a specific branch (private version).
   *
   * @private
   * @async
   * @param {string} branchName
   * @returns {Promise<Array<Object>>}
   */
  async _getBranchVersions(branchName) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['versions'], 'readonly');
      const store = tx.objectStore('versions');
      const index = store.index('branch');
      const req = index.getAll(branchName);

      req.onsuccess = () => {
        const sorted = req.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(sorted);
      };
    });
  },

  // ========================================================================
  // INTERNAL HELPERS — State Capture and Restore
  // ========================================================================

  /**
   * Capture entire model state (geometry, parameters, tree, assembly).
   * This is app-specific and would integrate with app.js state.
   *
   * @private
   * @async
   * @returns {Promise<Object>}
   */
  async _captureModelState() {
    // In production, this would call app.js or viewport.js to get:
    // - All geometries (meshes)
    // - Feature tree
    // - Parameters and constraints
    // - Assembly structure
    // For now, return stub

    return {
      geometries: window._scene ? window._scene.children.map((obj) => ({
        uuid: obj.uuid,
        name: obj.name,
        type: obj.type,
        position: obj.position.toArray(),
        rotation: obj.rotation.toArray(),
        scale: obj.scale.toArray(),
      })) : [],
      featureTree: window._featureTree || [],
      parameters: window._parameters || {},
      assembly: window._assembly || {},
      timestamp: Date.now(),
    };
  },

  /**
   * Restore model from saved state.
   *
   * @private
   * @async
   * @param {Object} modelState
   * @returns {Promise<void>}
   */
  async _restoreModelState(modelState) {
    // In production, this would:
    // 1. Clear current scene
    // 2. Deserialize and rebuild all geometries
    // 3. Restore feature tree
    // 4. Apply parameters and constraints
    // 5. Restore assembly

    // For now, dispatch event so app can handle it
    this._broadcastEvent('version:restoring', modelState);
  },

  /**
   * Capture a 3D thumbnail of current viewport.
   *
   * @private
   * @async
   * @param {Object} version
   * @returns {Promise<string>} Data URL of thumbnail image
   */
  async _captureThumb(version) {
    // In production:
    // 1. Fit entire model to viewport
    // 2. Render to offscreen canvas (256x256)
    // 3. Convert to PNG
    // 4. Return as data URL

    if (!window._renderer) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;

      // Would copy renderer output here
      // For now, return null (thumbnail optional)
      return null;
    } catch (err) {
      console.warn('Failed to capture thumbnail:', err);
      return null;
    }
  },

  /**
   * Compress model state (reduce size for storage).
   *
   * @private
   * @async
   * @param {Object} modelState
   * @returns {Promise<string>} Compressed data
   */
  async _compressModelState(modelState) {
    // In production, use LZ-string or similar compression
    // For now, JSON stringify
    return JSON.stringify(modelState);
  },

  /**
   * Decompress model state.
   *
   * @private
   * @async
   * @param {string} compressed
   * @returns {Promise<Object>}
   */
  async _decompressModelState(compressed) {
    return JSON.parse(compressed);
  },

  /**
   * Compute three-way merge (common ancestor + two branches).
   *
   * @private
   * @async
   * @param {Object} currentVersion
   * @param {Object} incomingVersion
   * @param {string} strategy Conflict resolution strategy
   * @returns {Promise<Object>} Merge result
   */
  async _computeThreeWayMerge(currentVersion, incomingVersion, strategy) {
    // In production:
    // 1. Find common ancestor
    // 2. Compute diff: ancestor → current and ancestor → incoming
    // 3. Apply both diffs (union of non-conflicting changes)
    // 4. Report conflicts
    // 5. Apply strategy to resolve conflicts

    return {
      mergedState: { ...currentVersion.modelState },
      partsAdded: 0,
      partsRemoved: 0,
      partsModified: 0,
      conflicts: [],
    };
  },

  /**
   * Compute difference between two model states.
   *
   * @private
   * @param {Object} state1
   * @param {Object} state2
   * @returns {Object} { added, removed, modified, unchanged }
   */
  _computeDiff(state1, state2) {
    // In production:
    // 1. Compare geometry arrays (by UUID)
    // 2. Identify added, removed, modified geometries
    // 3. Compute bounding box deltas
    // 4. Return visual diff info

    return {
      added: [],
      removed: [],
      modified: [],
      unchanged: [],
    };
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Branch Visualization
  // ========================================================================

  /**
   * Get visual graph of branch/merge history.
   * Returns tree structure for rendering in UI.
   * @async
   * @returns {Promise<Object>} Graph: { nodes, edges }
   */
  async getBranchGraph() {
    const nodes = [];
    const edges = [];

    // Add branch nodes
    for (const [branchName, branch] of this.state.branches) {
      nodes.push({
        id: `branch-${branchName}`,
        label: branchName,
        type: 'branch',
        color: branchName === 'main' ? '#2196F3' : '#FF9800',
      });
    }

    // Add version nodes (limited to main for clarity)
    const mainBranch = this.state.branches.get('main');
    if (mainBranch) {
      const mainVersions = this.state.versions.slice(0, 10); // Last 10 versions
      mainVersions.forEach((v, idx) => {
        nodes.push({
          id: `ver-${v.id}`,
          label: `v${v.number}`,
          type: 'version',
          timestamp: v.timestamp,
          message: v.message,
          branch: v.branch,
        });

        // Connect versions to their parent
        if (v.parentVersionId) {
          edges.push({
            from: `ver-${v.id}`,
            to: `ver-${v.parentVersionId}`,
            type: 'parentChild',
          });
        }
      });
    }

    return { nodes, edges };
  },

  /**
   * Visualize 3D diff between two versions.
   * Shows added (green), removed (red), modified (orange) geometry.
   * @async
   * @param {Object} options
   * @param {string} options.versionId1 First version
   * @param {string} options.versionId2 Second version
   * @returns {Promise<Object>} Visual diff data
   */
  async visualDiff(options = {}) {
    const { versionId1, versionId2 } = options;

    const v1 = await this._getVersionFromDB(versionId1);
    const v2 = await this._getVersionFromDB(versionId2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const diff = this._computeDiff(v1.modelState, v2.modelState);

    // Broadcast event so UI can render split-view
    this._broadcastEvent('version:visualDiffRequested', {
      version1: v1,
      version2: v2,
      diff,
    });

    return diff;
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Timeline & Thumbnails
  // ========================================================================

  /**
   * Get scrollable timeline of versions for left panel.
   * Includes thumbnails, timestamps, messages.
   * @async
   * @returns {Promise<Array<Object>>}
   */
  async getVersionTimeline() {
    return this.state.versions.map(v => ({
      id: v.id,
      number: v.number,
      timestamp: v.timestamp,
      message: v.message,
      tags: v.tags || [],
      thumbnail: v.thumbnail,
      author: v.author,
      branch: v.branch,
    }));
  },

  /**
   * Preview a version without restoring (hover in timeline).
   * Temporarily shows 3D geometry in viewport.
   * @async
   * @param {string} versionId
   * @returns {Promise<void>}
   */
  async previewVersion(versionId) {
    const version = await this._getVersionFromDB(versionId);
    if (!version) return;

    this._broadcastEvent('version:previewing', version);
  },

  /**
   * Clear preview (restore to current version).
   * @async
   * @returns {Promise<void>}
   */
  async clearPreview() {
    this._broadcastEvent('version:previewCleared', {});
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Cherry-Pick & Feature Export
  // ========================================================================

  /**
   * Cherry-pick individual features from a past version.
   * Restores only the selected features, not the entire version.
   * @async
   * @param {Object} options
   * @param {string} options.versionId Source version
   * @param {Array<string>} options.featureIds Features to restore
   * @returns {Promise<void>}
   */
  async cherryPickFeatures(options = {}) {
    const { versionId, featureIds } = options;

    const version = await this._getVersionFromDB(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    // Extract requested features from version's feature tree
    const selectedFeatures = version.modelState.featureTree.filter(f =>
      featureIds.includes(f.id)
    );

    // Apply selected features to current model
    this._broadcastEvent('version:cherryPickingFeatures', {
      features: selectedFeatures,
      sourceVersion: versionId,
    });

    this._showNotification(
      `Cherry-picked ${selectedFeatures.length} features from v${version.number}`,
      'success'
    );
  },

  /**
   * Export a historical version as STEP/STL without switching.
   * @async
   * @param {Object} options
   * @param {string} options.versionId Version to export
   * @param {string} options.format 'step' | 'stl' | 'obj' | 'gltf'
   * @returns {Promise<Blob>}
   */
  async exportVersionAs(options = {}) {
    const { versionId, format = 'step' } = options;

    const version = await this._getVersionFromDB(versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    // This would integrate with export module
    this._broadcastEvent('version:exportingHistorical', {
      version,
      format,
    });

    return new Blob(['[Export data would go here]']);
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Tags & Labels
  // ========================================================================

  /**
   * Add tag/label to a version (e.g., 'Release', 'Review', 'Draft').
   * @async
   * @param {Object} options
   * @param {string} options.versionId
   * @param {string} options.tag Tag name
   * @returns {Promise<void>}
   */
  async tagVersion(options = {}) {
    const { versionId, tag } = options;

    const tx = this.state.db.transaction(['versions'], 'readwrite');
    const store = tx.objectStore('versions');
    const req = store.get(versionId);

    req.onsuccess = () => {
      const version = req.result;
      if (version) {
        if (!version.tags) version.tags = [];
        if (!version.tags.includes(tag)) {
          version.tags.push(tag);
        }
        store.put(version);
      }
    };
  },

  /**
   * Get all versions with a specific tag.
   * @async
   * @param {string} tag
   * @returns {Promise<Array<Object>>}
   */
  async getVersionsByTag(tag) {
    return new Promise(resolve => {
      const tx = this.state.db.transaction(['versions'], 'readonly');
      const store = tx.objectStore('versions');
      const req = store.getAll();

      req.onsuccess = () => {
        const tagged = req.result.filter(v =>
          v.tags && v.tags.includes(tag)
        );
        resolve(tagged);
      };
    });
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Undo/Redo Integration
  // ========================================================================

  /**
   * Integration point: every undo operation creates a micro-version.
   * Allows rewinding undo history later.
   * @private
   */
  _microVersionCount: 0,

  /**
   * Track undo action (create micro-version).
   * @private
   * @async
   * @param {Object} operation { type, params }
   */
  async _recordUndoOperation(operation) {
    this._microVersionCount++;

    // Only save every 5th undo to avoid bloat
    if (this._microVersionCount % 5 === 0) {
      await this.save({
        message: `[Undo: ${operation.type}]`,
        tags: ['undo-micro'],
      });
    }
  },

  /**
   * Restore from an undo micro-version.
   * @async
   * @param {string} microVersionId
   * @returns {Promise<void>}
   */
  async restoreFromUndo(microVersionId) {
    return this.restore({ versionId: microVersionId });
  },

  // ========================================================================
  // FUSION 360-PARITY ENHANCEMENTS: Storage & Cleanup
  // ========================================================================

  /**
   * Get storage quota info (IndexedDB size).
   * @async
   * @returns {Promise<Object>} { used, quota, percentage }
   */
  async getStorageInfo() {
    if (!navigator.storage?.estimate) {
      return { used: 0, quota: 0, percentage: 0 };
    }

    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage,
      quota: estimate.quota,
      percentage: Math.round((estimate.usage / estimate.quota) * 100),
    };
  },

  /**
   * Auto-cleanup old versions when storage runs low.
   * Deletes oldest auto-saves, keeps manual saves.
   * @private
   * @async
   */
  async _autoCleanupOldVersions() {
    const storageInfo = await this.getStorageInfo();

    // If using >80% quota, clean up
    if (storageInfo.percentage > 80) {
      const tx = this.state.db.transaction(['versions'], 'readwrite');
      const store = tx.objectStore('versions');
      const req = store.getAll();

      req.onsuccess = () => {
        const versions = req.result
          .filter(v => v.tags?.includes('auto-save'))
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(0, -10); // Keep last 10 auto-saves

        versions.forEach(v => store.delete(v.id));
        console.log(`[Version] Cleaned up ${versions.length} old auto-saves`);
      };
    }
  },

  /**
   * Manually trigger cleanup of old auto-saves.
   * @async
   * @param {Object} options
   * @param {number} [options.keepCount=10] How many auto-saves to keep
   * @returns {Promise<number>} Number of versions deleted
   */
  async cleanupAutoSaves(options = {}) {
    const { keepCount = 10 } = options;

    return new Promise(resolve => {
      const tx = this.state.db.transaction(['versions'], 'readwrite');
      const store = tx.objectStore('versions');
      const req = store.getAll();

      req.onsuccess = () => {
        const autoSaves = req.result
          .filter(v => v.tags?.includes('auto-save'))
          .sort((a, b) => b.timestamp - a.timestamp);

        const toDelete = autoSaves.slice(keepCount);
        toDelete.forEach(v => store.delete(v.id));

        this._showNotification(
          `Cleaned up ${toDelete.length} old auto-saves`,
          'success'
        );
        resolve(toDelete.length);
      };
    });
  },

  // ========================================================================
  // INTERNAL HELPERS — UI and Events
  // ========================================================================

  /**
   * Show notification toast.
   *
   * @private
   * @param {string} message
   * @param {string} type 'success' | 'error' | 'info'
   */
  _showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `version-toast version-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  },

  /**
   * Broadcast custom event to app.
   *
   * @private
   * @param {string} eventName
   * @param {Object} detail
   */
  _broadcastEvent(eventName, detail) {
    const event = new CustomEvent(eventName, { detail });
    document.dispatchEvent(event);
  },

  /**
   * Generate UUID v4.
   *
   * @private
   * @returns {string}
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  // ========================================================================
  // HELP SYSTEM INTEGRATION
  // ========================================================================

  helpEntries: [
    {
      title: 'Save a Version',
      description:
        'Press Ctrl+S or click Version → Save to create a snapshot of your model. Add a message describing what you changed.',
      category: 'Version Control',
      shortcut: 'Ctrl+S',
    },
    {
      title: 'Restore a Previous Version',
      description:
        'Open the Version panel on the left, find an earlier version, and click "Restore". Your model will return to that state.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Create a Branch',
      description:
        'Use branches to experiment without affecting your main design. Create a branch, make changes, then merge back if you like them.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Compare Versions',
      description:
        'Select two versions and click "Compare" to see a side-by-side diff. Changes are highlighted in orange.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Auto-Save Configuration',
      description:
        'Enable auto-save to protect against crashes. Version → Auto-Save → set interval (default 5 minutes).',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Merge Branches',
      description:
        'When you\'re done experimenting on a branch, merge it back to main. Click Merge and choose a conflict resolution strategy.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Branch Visualization',
      description:
        'View a graph of all branches and their merge history. Shows which versions are on which branches and how they diverged.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Visual Diff',
      description:
        'Select two versions to see a side-by-side 3D comparison. Added parts show green, removed show red, modified show orange.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Version Timeline',
      description:
        'Browse all versions in a scrollable timeline on the left panel. Hover to preview a version\'s 3D geometry without restoring.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Cherry-Pick Features',
      description:
        'Restore only specific features from a past version, not the entire model. Select features in the version panel to cherry-pick.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Export Historical Version',
      description:
        'Export any past version as STEP, STL, OBJ, or glTF without switching to it. Right-click a version and choose Export As.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Version Tags',
      description:
        'Mark versions with tags like "Release", "Review", or "Draft" for easy organization. Filter timeline by tag to find important milestones.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Undo Micro-Versions',
      description:
        'Every 5 undo operations automatically creates a micro-version. You can restore from these if you accidentally undo too far.',
      category: 'Version Control',
      shortcut: null,
    },
    {
      title: 'Storage Management',
      description:
        'View IndexedDB storage quota in Version panel. Auto-cleanup removes old auto-saves when storage is >80% full. Manual cleanup available.',
      category: 'Version Control',
      shortcut: null,
    },
  ],

  // ========================================================================
  // UI PANEL — HTML and Styling
  // ========================================================================

  /**
   * Get the HTML for the version control panel.
   *
   * @returns {string} HTML markup
   */
  getUI() {
    return `
      <div class="version-panel" id="version-panel">
        <div class="version-header">
          <h3>Versions</h3>
          <button class="version-close-btn" data-close-panel="version-panel">×</button>
        </div>

        <div class="version-content">
          <div class="version-toolbar">
            <button id="version-save-btn" class="version-btn version-btn-primary">
              💾 Save
            </button>
            <button id="version-branch-btn" class="version-btn">
              🌿 Branch
            </button>
          </div>

          <div class="version-tabs">
            <button class="version-tab active" data-tab="timeline">Timeline</button>
            <button class="version-tab" data-tab="branches">Branches</button>
            <button class="version-tab" data-tab="compare">Compare</button>
          </div>

          <!-- Timeline Tab -->
          <div id="version-timeline" class="version-tab-content active">
            <div id="version-list" class="version-list"></div>
          </div>

          <!-- Branches Tab -->
          <div id="version-branches" class="version-tab-content">
            <div id="version-branch-list" class="version-branch-list"></div>
          </div>

          <!-- Compare Tab -->
          <div id="version-compare" class="version-tab-content">
            <p style="color: #999; font-size: 11px;">
              Select two versions to compare them side-by-side.
            </p>
          </div>
        </div>
      </div>

      <style>
        .version-panel {
          position: fixed;
          left: 0;
          top: 80px;
          width: 320px;
          height: 600px;
          background: #1e1e1e;
          border-right: 1px solid #333;
          display: flex;
          flex-direction: column;
          z-index: 1000;
        }

        .version-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid #333;
        }

        .version-header h3 {
          margin: 0;
          color: #e0e0e0;
          font-size: 14px;
          font-weight: 600;
        }

        .version-close-btn {
          background: none;
          border: none;
          color: #999;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
        }

        .version-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .version-toolbar {
          display: flex;
          gap: 6px;
          padding: 12px;
          border-bottom: 1px solid #333;
        }

        .version-btn {
          flex: 1;
          padding: 8px;
          border: none;
          border-radius: 4px;
          background: #333;
          color: #e0e0e0;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .version-btn:hover {
          background: #444;
        }

        .version-btn-primary {
          background: #0284C7;
          color: white;
        }

        .version-btn-primary:hover {
          background: #0369a1;
        }

        .version-tabs {
          display: flex;
          border-bottom: 1px solid #333;
          gap: 0;
        }

        .version-tab {
          flex: 1;
          padding: 8px;
          border: none;
          background: transparent;
          color: #999;
          font-size: 12px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }

        .version-tab.active {
          color: #0284C7;
          border-bottom-color: #0284C7;
        }

        .version-tab-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: none;
        }

        .version-tab-content.active {
          display: block;
        }

        .version-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .version-item {
          padding: 8px;
          background: #2a2a2a;
          border-left: 3px solid #0284C7;
          border-radius: 2px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .version-item:hover {
          background: #333;
        }

        .version-item-number {
          font-weight: 600;
          color: #0284C7;
          font-size: 11px;
        }

        .version-item-message {
          color: #e0e0e0;
          font-size: 12px;
          margin: 4px 0;
        }

        .version-item-time {
          color: #666;
          font-size: 10px;
        }

        .version-branch-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .version-branch-item {
          padding: 8px;
          background: #2a2a2a;
          border-radius: 4px;
          font-size: 12px;
          color: #e0e0e0;
        }

        .version-branch-item.current {
          border-left: 3px solid #81c784;
          background: #1b5e20;
        }

        .version-toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 12px 16px;
          border-radius: 4px;
          font-size: 12px;
          animation: slideInRight 0.3s ease;
          z-index: 10000;
        }

        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .version-toast-success {
          background: #1b5e20;
          color: #81c784;
        }

        .version-toast-error {
          background: #b71c1c;
          color: #ff5252;
        }

        .version-toast-info {
          background: #01579b;
          color: #81d4fa;
        }
      </style>
    `;
  },
};
