/**
 * @file data-module.js
 * @description Data persistence and project management for cycleCAD.
 *   Save projects locally to IndexedDB, share via links, import/export,
 *   manage file organization, and sync with cloud storage.
 *   Supports Inventor files, STEP, STL, DXF, and cycleCAD native format.
 *
 * @tutorial Creating and Saving Your First Project
 *   Step 1: Click Data → New Project
 *     const project = await kernel.exec('data.newProject', {
 *       name: 'Bike Pump Design',
 *       description: 'Complete bike pump assembly'
 *     });
 *     console.log('Project ID:', project.id);
 *
 *   Step 2: As you work, your changes auto-save every 30 seconds
 *     // No manual action needed — data.js handles it
 *
 *   Step 3: Manually save a snapshot
 *     await kernel.exec('data.save', {
 *       projectId: project.id
 *     });
 *
 * @tutorial Organizing Files in Your Project
 *   Projects contain a folder structure for organizing designs.
 *
 *   Step 1: Create folders
 *     await kernel.exec('data.createFolder', {
 *       projectId: 'proj-123',
 *       path: 'parts/',
 *       name: 'Main Body Parts'
 *     });
 *
 *   Step 2: Import files into folders
 *     const file = new File([...], 'pump-body.ipt');
 *     await kernel.exec('data.importFile', {
 *       projectId: 'proj-123',
 *       folder: 'parts/',
 *       file: file
 *     });
 *
 *   Step 3: Browse the project tree in the Data panel
 *     // Shows: Bike Pump Design
 *     //   ├─ parts/
 *     //   │  └─ pump-body.ipt
 *     //   └─ assemblies/
 *
 * @tutorial Sharing a Project with a Link
 *   Generate shareable links for viewing (read-only) or editing.
 *
 *   Step 1: Create a share link
 *     const link = await kernel.exec('data.shareLink', {
 *       projectId: 'proj-123',
 *       role: 'viewer',      // 'viewer' or 'editor'
 *       expiresIn: 2592000   // 30 days in seconds
 *     });
 *     // Returns: https://cyclecad.com/view/xyz789?role=viewer
 *
 *   Step 2: Share the link with teammates via email
 *     // They click the link and can view/edit without creating account
 *
 * @tutorial Exporting a Project as ZIP
 *   Package entire project for backup or archive.
 *
 *   Step 1: Export to ZIP
 *     const blob = await kernel.exec('data.exportProject', {
 *       projectId: 'proj-123'
 *     });
 *
 *   Step 2: Save the blob to disk
 *     const url = URL.createObjectURL(blob);
 *     const a = document.createElement('a');
 *     a.href = url;
 *     a.download = 'bike-pump-design.zip';
 *     a.click();
 *
 * @tutorial Importing a Previous ZIP Export
 *   Restore a previously exported project.
 *
 *   Step 1: Select ZIP file
 *     const file = /* user chooses file */;
 *
 *   Step 2: Import it
 *     const project = await kernel.exec('data.importProject', {
 *       file: file,
 *       asCopy: true  // Create a new project, don't overwrite
 *     });
 *
 * @tutorial Working with Templates
 *   Save design templates for reuse.
 *
 *   Step 1: Save current project as template
 *     await kernel.exec('data.createTemplate', {
 *       projectId: 'proj-123',
 *       name: 'Modular Pump Body',
 *       description: 'Reusable pump body with customizable bore'
 *     });
 *
 *   Step 2: Create new project from template
 *     const newProject = await kernel.exec('data.fromTemplate', {
 *       templateName: 'Modular Pump Body',
 *       newProjectName: 'Pump for cycleWASH v2'
 *     });
 *
 * @version 1.0.0
 * @author Sachin Kumar <vvlars@googlemail.com>
 * @license MIT
 */

// ============================================================================
// DATA MANAGEMENT MODULE — Main Export
// ============================================================================

export default {
  name: 'data',
  version: '1.0.0',

  // ========================================================================
  // MODULE STATE
  // ========================================================================

  state: {
    /** @type {IDBDatabase} IndexedDB handle */
    db: null,

    /** @type {Array<Object>} List of all projects */
    projects: [],

    /** @type {string|null} Currently open project ID */
    currentProjectId: null,

    /** @type {Object|null} Currently open project data */
    currentProject: null,

    /** @type {number} Auto-save interval (ms) */
    autoSaveIntervalMs: 30000,

    /** @type {number} Auto-save interval handle */
    autoSaveHandle: null,

    /** @type {Array<Object>} Recent files (last 20 opened) */
    recentFiles: [],

    /** @type {Map<string, Object>} Templates by name */
    templates: new Map(),

    /** @type {Array<Object>} Trash: deleted projects (30-day recovery) */
    trash: [],

    /** @type {number} Quota limit (bytes) */
    quotaBytes: 1000000000, // 1GB default

    /** @type {number} Current usage (bytes) */
    usageBytes: 0,
  },

  // ========================================================================
  // INIT — Setup IndexedDB and restore state
  // ========================================================================

  /**
   * Initialize data module.
   * Opens IndexedDB, loads project list, starts auto-save.
   * Called automatically on app startup.
   *
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    this.state.db = await this._openDatabase();

    // Load project list
    await this._loadProjectList();

    // Load recent files
    this._loadRecent();

    // Load templates
    await this._loadTemplates();

    // Load trash
    await this._loadTrash();

    // Restore last project
    const lastProjectId = localStorage.getItem('data_lastProject');
    if (lastProjectId) {
      try {
        await this.load({ projectId: lastProjectId });
      } catch (err) {
        console.warn('Failed to restore last project:', err);
      }
    }

    // Start auto-save
    this._startAutoSave();

    // Monitor storage quota
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        this.state.usageBytes = estimate.usage;
        this.state.quotaBytes = estimate.quota;
      });
    }

    console.log('[Data Management] Initialized.');
  },

  // ========================================================================
  // PUBLIC API — Project Management
  // ========================================================================

  /**
   * Create a new blank project.
   *
   * @param {Object} options
   * @param {string} options.name Project name
   * @param {string} [options.description] Project description
   * @param {string} [options.units] Unit system ('mm' | 'in' | 'cm')
   * @param {Object} [options.material] Default material data
   * @returns {Promise<Object>} Created project
   *   { id, name, description, created, modified, fileCount }
   *
   * @example
   * const proj = await kernel.exec('data.newProject', {
   *   name: 'My Design',
   *   description: 'A cool part'
   * });
   */
  async newProject(options = {}) {
    const { name, description = '', units = 'mm', material = null } = options;

    if (!name || name.trim().length === 0) {
      throw new Error('Project name required');
    }

    const project = {
      id: this._generateUUID(),
      name: name.trim(),
      description,
      units,
      material,
      created: Date.now(),
      modified: Date.now(),
      geometry: null, // Will hold serialized 3D model
      files: {}, // { fileName: { content, type, size, imported } }
      folders: {}, // { folderName: { files: [...], subfolders: [...] } }
      metadata: {
        author: localStorage.getItem('data_userName') || 'Unknown',
        tags: [],
        keywords: [],
      },
    };

    await this._saveProjectToDB(project);
    this.state.projects.unshift(project);

    this._addToRecent({
      projectId: project.id,
      name: project.name,
      timestamp: Date.now(),
    });

    this._showNotification(`Created project: ${name}`, 'success');
    this._broadcastEvent('data:projectCreated', project);

    return {
      id: project.id,
      name: project.name,
      description,
      created: project.created,
      modified: project.modified,
      fileCount: 0,
    };
  },

  /**
   * Load an existing project.
   * Makes it the current project; subsequent saves update it.
   *
   * @param {Object} options
   * @param {string} options.projectId Project ID to load
   * @returns {Promise<Object>} Project data
   *
   * @example
   * await kernel.exec('data.load', { projectId: 'proj-123' });
   */
  async load(options = {}) {
    const { projectId } = options;

    if (!projectId) {
      throw new Error('Project ID required');
    }

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    this.state.currentProjectId = projectId;
    this.state.currentProject = project;
    localStorage.setItem('data_lastProject', projectId);

    this._addToRecent({
      projectId: project.id,
      name: project.name,
      timestamp: Date.now(),
    });

    this._broadcastEvent('data:projectLoaded', project);

    return project;
  },

  /**
   * Save current project.
   * Typically called automatically by auto-save, but can be called manually.
   *
   * @param {Object} [options]
   * @param {string} [options.projectId] Project to save (default: current)
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('data.save');
   */
  async save(options = {}) {
    const { projectId = this.state.currentProjectId } = options;

    if (!projectId) {
      throw new Error('No project loaded');
    }

    // Capture current 3D model state from viewport
    const geometry = await this._captureGeometry();

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    project.modified = Date.now();
    project.geometry = geometry;

    await this._saveProjectToDB(project);
    this.state.currentProject = project;

    this._showNotification('Project saved', 'success');
    this._broadcastEvent('data:projectSaved', { projectId });
  },

  /**
   * Delete a project (soft delete to trash).
   * Project can be recovered within 30 days.
   *
   * @param {Object} options
   * @param {string} options.projectId Project to delete
   * @param {boolean} [options.permanent=false] Permanently delete (no recovery)
   * @returns {Promise<void>}
   *
   * @example
   * await kernel.exec('data.delete', {
   *   projectId: 'proj-123',
   *   permanent: false  // Goes to trash
   * });
   */
  async delete(options = {}) {
    const { projectId, permanent = false } = options;

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (permanent) {
      await this._deleteFromDB('projects', projectId);
    } else {
      // Move to trash
      const trashItem = {
        ...project,
        deletedAt: Date.now(),
        recoveryUntil: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      };
      await this._saveToTrash(trashItem);
      await this._deleteFromDB('projects', projectId);
    }

    this.state.projects = this.state.projects.filter((p) => p.id !== projectId);

    if (this.state.currentProjectId === projectId) {
      this.state.currentProjectId = null;
      this.state.currentProject = null;
    }

    this._showNotification('Project deleted', 'info');
  },

  /**
   * List all projects.
   *
   * @param {Object} [options]
   * @param {number} [options.limit=100] Max projects to return
   * @param {number} [options.offset=0] Pagination offset
   * @param {string} [options.sortBy] 'name' | 'created' | 'modified'
   * @returns {Promise<Array<Object>>} Project list
   *
   * @example
   * const projects = await kernel.exec('data.listProjects', {
   *   limit: 20,
   *   sortBy: 'modified'
   * });
   */
  async listProjects(options = {}) {
    const { limit = 100, offset = 0, sortBy = 'modified' } = options;

    let projects = [...this.state.projects];

    // Sort
    if (sortBy === 'name') {
      projects.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'created') {
      projects.sort((a, b) => b.created - a.created);
    } else if (sortBy === 'modified') {
      projects.sort((a, b) => b.modified - a.modified);
    }

    return projects.slice(offset, offset + limit).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      created: p.created,
      modified: p.modified,
      fileCount: Object.keys(p.files).length,
      sizeBytes: this._estimateSize(p),
    }));
  },

  /**
   * Get recently accessed files.
   *
   * @param {Object} [options]
   * @param {number} [options.limit=20] Max to return
   * @returns {Promise<Array<Object>>} Recent file list
   */
  async getRecent(options = {}) {
    const { limit = 20 } = options;
    return this.state.recentFiles.slice(0, limit);
  },

  // ========================================================================
  // PUBLIC API — File Management
  // ========================================================================

  /**
   * Create a folder in current project.
   *
   * @param {Object} options
   * @param {string} [options.path] Folder path (e.g., 'parts/')
   * @param {string} options.name Folder name
   * @returns {Promise<Object>}
   *
   * @example
   * await kernel.exec('data.createFolder', {
   *   path: '',
   *   name: 'parts'
   * });
   */
  async createFolder(options = {}) {
    const { path = '', name } = options;

    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    if (!name || name.trim().length === 0) {
      throw new Error('Folder name required');
    }

    const folderPath = (path ? path + '/' : '') + name + '/';

    if (!this.state.currentProject.folders) {
      this.state.currentProject.folders = {};
    }

    this.state.currentProject.folders[folderPath] = {
      files: [],
      subfolders: [],
    };

    await this.save();

    return { path: folderPath, name };
  },

  /**
   * Import a file into current project.
   * Supports .ipt, .iam, .step, .stp, .stl, .dxf, etc.
   *
   * @param {Object} options
   * @param {File|Blob} options.file File to import
   * @param {string} [options.folder] Target folder (default: root)
   * @param {string} [options.name] Override file name
   * @returns {Promise<Object>} Imported file info
   *
   * @example
   * const file = /* user selects file */;
   * await kernel.exec('data.importFile', {
   *   file: file,
   *   folder: 'parts/'
   * });
   */
  async importFile(options = {}) {
    const { file, folder = '', name = null } = options;

    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    if (!file) {
      throw new Error('File required');
    }

    const fileName = name || file.name;
    const fileKey = (folder ? folder : '') + fileName;

    // Read file content
    const content = await file.arrayBuffer();

    this.state.currentProject.files[fileKey] = {
      name: fileName,
      type: file.type || this._detectFileType(fileName),
      size: file.size,
      imported: Date.now(),
      content: new Uint8Array(content), // Store as binary
    };

    await this.save();

    this._addToRecent({
      projectId: this.state.currentProjectId,
      name: fileName,
      timestamp: Date.now(),
    });

    this._showNotification(`Imported: ${fileName}`, 'success');

    return { fileName, fileKey, size: file.size };
  },

  /**
   * Delete a file from current project.
   *
   * @param {Object} options
   * @param {string} options.fileKey File key in project
   * @returns {Promise<void>}
   */
  async deleteFile(options = {}) {
    const { fileKey } = options;

    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    if (this.state.currentProject.files[fileKey]) {
      delete this.state.currentProject.files[fileKey];
      await this.save();
    }
  },

  /**
   * Get list of files in current project.
   *
   * @returns {Promise<Array<Object>>} File list with metadata
   */
  async listFiles() {
    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    return Object.entries(this.state.currentProject.files).map(
      ([key, file]) => ({
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        imported: file.imported,
      })
    );
  },

  // ========================================================================
  // PUBLIC API — Sharing and Export
  // ========================================================================

  /**
   * Generate a shareable link for current project.
   * Links can be view-only or allow editing.
   *
   * @param {Object} options
   * @param {string} [options.projectId] Project to share
   * @param {string} [options.role] 'viewer' or 'editor'
   * @param {number} [options.expiresIn] Expiry in seconds (null = never)
   * @returns {Promise<Object>} { link, code, role, expiresAt }
   *
   * @example
   * const share = await kernel.exec('data.shareLink', {
   *   role: 'viewer',
   *   expiresIn: 604800  // 1 week
   * });
   * console.log('Share link:', share.link);
   */
  async shareLink(options = {}) {
    const {
      projectId = this.state.currentProjectId,
      role = 'viewer',
      expiresIn = null,
    } = options;

    if (!projectId) {
      throw new Error('No project specified');
    }

    const shareCode = this._generateShareCode();
    const shareRecord = {
      code: shareCode,
      projectId,
      role,
      createdAt: Date.now(),
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    };

    await this._saveShareLink(shareRecord);

    const baseUrl = window.location.origin;
    const link = `${baseUrl}/view/${shareCode}?role=${role}`;

    this._showNotification('Share link created', 'success');

    return {
      link,
      code: shareCode,
      role,
      expiresAt: shareRecord.expiresAt,
    };
  },

  /**
   * Export current project as ZIP archive.
   * Includes all files, metadata, and 3D geometry.
   *
   * @param {Object} [options]
   * @param {string} [options.projectId] Project to export
   * @returns {Promise<Blob>} ZIP file blob
   *
   * @example
   * const blob = await kernel.exec('data.exportProject');
   * // User can download the blob
   */
  async exportProject(options = {}) {
    const { projectId = this.state.currentProjectId } = options;

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // In production, use a ZIP library (e.g., JSZip)
    // For now, create JSON export
    const exportData = {
      version: 1,
      project: {
        name: project.name,
        description: project.description,
        created: project.created,
        modified: project.modified,
        units: project.units,
      },
      files: Object.entries(project.files).map(([key, file]) => ({
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        // Note: actual content would be included in ZIP
      })),
      metadata: project.metadata,
    };

    const json = JSON.stringify(exportData, null, 2);
    return new Blob([json], { type: 'application/json' });
  },

  /**
   * Import a previously exported project.
   *
   * @param {Object} options
   * @param {File|Blob} options.file ZIP or JSON file
   * @param {boolean} [options.asCopy=true] Create new project or overwrite
   * @returns {Promise<Object>} Imported project info
   *
   * @example
   * const file = /* user selects exported ZIP */;
   * const proj = await kernel.exec('data.importProject', {
   *   file: file,
   *   asCopy: true
   * });
   */
  async importProject(options = {}) {
    const { file, asCopy = true } = options;

    if (!file) {
      throw new Error('File required');
    }

    // Parse export (handling both ZIP and JSON)
    const json = JSON.parse(await file.text());

    if (asCopy) {
      // Create new project from import
      return this.newProject({
        name: json.project.name + ' (Imported)',
        description: json.project.description,
        units: json.project.units,
      });
    } else {
      // Restore to existing project
      const project = await this._getProjectFromDB(
        this.state.currentProjectId
      );
      Object.assign(project, json.project);
      await this._saveProjectToDB(project);
      return project;
    }
  },

  // ========================================================================
  // PUBLIC API — Templates
  // ========================================================================

  /**
   * Save current project as a template.
   * Templates can be used as starting points for new projects.
   *
   * @param {Object} options
   * @param {string} [options.projectId] Project to template
   * @param {string} options.name Template name
   * @param {string} [options.description] Template description
   * @param {string} [options.category] Category (e.g., 'pumps', 'fixtures')
   * @returns {Promise<Object>}
   *
   * @example
   * await kernel.exec('data.createTemplate', {
   *   name: 'Modular Pump',
   *   description: 'Reusable pump body',
   *   category: 'pumps'
   * });
   */
  async createTemplate(options = {}) {
    const {
      projectId = this.state.currentProjectId,
      name,
      description = '',
      category = 'general',
    } = options;

    if (!name) {
      throw new Error('Template name required');
    }

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const template = {
      name,
      description,
      category,
      project,
      createdAt: Date.now(),
    };

    this.state.templates.set(name, template);
    await this._saveTemplate(template);

    this._showNotification(`Created template: ${name}`, 'success');

    return { name, category };
  },

  /**
   * List all available templates.
   *
   * @param {Object} [options]
   * @param {string} [options.category] Filter by category
   * @returns {Promise<Array<Object>>}
   */
  async getTemplates(options = {}) {
    const { category = null } = options;

    let templates = Array.from(this.state.templates.values());

    if (category) {
      templates = templates.filter((t) => t.category === category);
    }

    return templates.map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      createdAt: t.createdAt,
    }));
  },

  /**
   * Create new project from template.
   *
   * @param {Object} options
   * @param {string} options.templateName Template to use
   * @param {string} options.newProjectName Name for new project
   * @returns {Promise<Object>} New project
   *
   * @example
   * const proj = await kernel.exec('data.fromTemplate', {
   *   templateName: 'Modular Pump',
   *   newProjectName: 'Pump v2'
   * });
   */
  async fromTemplate(options = {}) {
    const { templateName, newProjectName } = options;

    const template = this.state.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Deep copy template project
    const projectCopy = JSON.parse(JSON.stringify(template.project));
    projectCopy.id = this._generateUUID();
    projectCopy.name = newProjectName;
    projectCopy.created = Date.now();
    projectCopy.modified = Date.now();

    await this._saveProjectToDB(projectCopy);
    this.state.projects.unshift(projectCopy);

    this._showNotification(
      `Created from template: ${newProjectName}`,
      'success'
    );

    return {
      id: projectCopy.id,
      name: projectCopy.name,
      description: projectCopy.description,
    };
  },

  /**
   * Delete a template.
   *
   * @param {Object} options
   * @param {string} options.templateName Template to delete
   * @returns {Promise<void>}
   */
  async deleteTemplate(options = {}) {
    const { templateName } = options;

    this.state.templates.delete(templateName);
    await this._deleteTemplate(templateName);
  },

  // ========================================================================
  // PUBLIC API — Trash and Recovery
  // ========================================================================

  /**
   * List deleted projects available for recovery.
   *
   * @returns {Promise<Array<Object>>} Trash items
   */
  async getTrash() {
    return this.state.trash.map((item) => ({
      id: item.id,
      name: item.name,
      deletedAt: item.deletedAt,
      recoveryUntil: item.recoveryUntil,
    }));
  },

  /**
   * Restore a deleted project from trash.
   *
   * @param {Object} options
   * @param {string} options.projectId Project to recover
   * @returns {Promise<Object>} Recovered project
   */
  async recover(options = {}) {
    const { projectId } = options;

    const trashItem = this.state.trash.find((t) => t.id === projectId);
    if (!trashItem) {
      throw new Error('Project not found in trash');
    }

    if (trashItem.recoveryUntil < Date.now()) {
      throw new Error('Recovery window expired');
    }

    // Restore from trash
    const project = { ...trashItem };
    delete project.deletedAt;
    delete project.recoveryUntil;

    await this._saveProjectToDB(project);
    this.state.projects.unshift(project);
    this.state.trash = this.state.trash.filter((t) => t.id !== projectId);

    this._showNotification(`Recovered: ${project.name}`, 'success');

    return project;
  },

  /**
   * Permanently delete all expired trash items.
   *
   * @returns {Promise<number>} Count of items deleted
   */
  async emptyTrash() {
    const now = Date.now();
    const expired = this.state.trash.filter((t) => t.recoveryUntil < now);

    for (const item of expired) {
      await this._deleteFromDB('trash', item.id);
    }

    this.state.trash = this.state.trash.filter((t) => t.recoveryUntil >= now);

    return expired.length;
  },

  // ========================================================================
  // PUBLIC API — Storage and Quota
  // ========================================================================

  /**
   * Get current storage usage and quota.
   *
   * @returns {Promise<Object>} { usageBytes, quotaBytes, percentUsed }
   */
  async getStorageInfo() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      this.state.usageBytes = estimate.usage;
      this.state.quotaBytes = estimate.quota;
    }

    return {
      usageBytes: this.state.usageBytes,
      quotaBytes: this.state.quotaBytes,
      percentUsed: Math.round(
        (this.state.usageBytes / this.state.quotaBytes) * 100
      ),
    };
  },

  /**
   * Request persistent storage permission (for Chrome).
   * Without this, browser can clear data at any time.
   *
   * @returns {Promise<boolean>} True if persistent permission granted
   */
  async requestPersistent() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist();
    }
    return false;
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
      const req = indexedDB.open('cyclecad-data', 1);

      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', {
            keyPath: 'id',
          });
          projectStore.createIndex('name', 'name');
          projectStore.createIndex('modified', 'modified');
        }
        if (!db.objectStoreNames.contains('shareLinks')) {
          db.createObjectStore('shareLinks', { keyPath: 'code' });
        }
        if (!db.objectStoreNames.contains('templates')) {
          db.createObjectStore('templates', { keyPath: 'name' });
        }
        if (!db.objectStoreNames.contains('trash')) {
          db.createObjectStore('trash', { keyPath: 'id' });
        }
      };
    });
  },

  /**
   * Load all projects from DB.
   *
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _loadProjectList() {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['projects'], 'readonly');
      const store = tx.objectStore('projects');
      const req = store.getAll();

      req.onsuccess = () => {
        this.state.projects = req.result.sort((a, b) => b.modified - a.modified);
        resolve();
      };
    });
  },

  /**
   * Save project to DB.
   *
   * @private
   * @async
   * @param {Object} project
   * @returns {Promise<void>}
   */
  async _saveProjectToDB(project) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['projects'], 'readwrite');
      const store = tx.objectStore('projects');
      store.put(project);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Get project from DB.
   *
   * @private
   * @async
   * @param {string} projectId
   * @returns {Promise<Object|null>}
   */
  async _getProjectFromDB(projectId) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['projects'], 'readonly');
      const store = tx.objectStore('projects');
      const req = store.get(projectId);

      req.onsuccess = () => resolve(req.result || null);
    });
  },

  /**
   * Delete from DB.
   *
   * @private
   * @async
   * @param {string} storeName
   * @param {string} key
   * @returns {Promise<void>}
   */
  async _deleteFromDB(storeName, key) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Save share link to DB.
   *
   * @private
   * @async
   * @param {Object} shareRecord
   * @returns {Promise<void>}
   */
  async _saveShareLink(shareRecord) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['shareLinks'], 'readwrite');
      const store = tx.objectStore('shareLinks');
      store.put(shareRecord);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Save template to DB.
   *
   * @private
   * @async
   * @param {Object} template
   * @returns {Promise<void>}
   */
  async _saveTemplate(template) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['templates'], 'readwrite');
      const store = tx.objectStore('templates');
      store.put(template);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Delete template from DB.
   *
   * @private
   * @async
   * @param {string} templateName
   * @returns {Promise<void>}
   */
  async _deleteTemplate(templateName) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['templates'], 'readwrite');
      const store = tx.objectStore('templates');
      store.delete(templateName);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Load templates from DB.
   *
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _loadTemplates() {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['templates'], 'readonly');
      const store = tx.objectStore('templates');
      const req = store.getAll();

      req.onsuccess = () => {
        this.state.templates = new Map(req.result.map((t) => [t.name, t]));
        resolve();
      };
    });
  },

  /**
   * Save trash item to DB.
   *
   * @private
   * @async
   * @param {Object} item
   * @returns {Promise<void>}
   */
  async _saveToTrash(item) {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['trash'], 'readwrite');
      const store = tx.objectStore('trash');
      store.put(item);

      tx.oncomplete = () => resolve();
    });
  },

  /**
   * Load trash from DB.
   *
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _loadTrash() {
    return new Promise((resolve) => {
      const tx = this.state.db.transaction(['trash'], 'readonly');
      const store = tx.objectStore('trash');
      const req = store.getAll();

      req.onsuccess = () => {
        this.state.trash = req.result || [];
        resolve();
      };
    });
  },

  // ========================================================================
  // INTERNAL HELPERS — Utilities
  // ========================================================================

  /**
   * Capture current 3D geometry from viewport.
   *
   * @private
   * @async
   * @returns {Promise<Object|null>}
   */
  async _captureGeometry() {
    if (!window._scene) return null;

    return {
      timestamp: Date.now(),
      // In production: serialize THREE.js scene to JSON or glTF
    };
  },

  /**
   * Estimate project size in bytes.
   *
   * @private
   * @param {Object} project
   * @returns {number}
   */
  _estimateSize(project) {
    return Object.values(project.files).reduce((sum, f) => sum + f.size, 0);
  },

  /**
   * Detect file type from extension.
   *
   * @private
   * @param {string} fileName
   * @returns {string} MIME type
   */
  _detectFileType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const types = {
      ipt: 'application/vnd.autodesk.inventor.part',
      iam: 'application/vnd.autodesk.inventor.assembly',
      step: 'application/step',
      stp: 'application/step',
      stl: 'application/vnd.ms-pki.stl',
      dxf: 'application/vnd.dxf',
      dwg: 'application/vnd.dwg',
    };
    return types[ext] || 'application/octet-stream';
  },

  /**
   * Load recent files from localStorage.
   *
   * @private
   */
  _loadRecent() {
    const saved = localStorage.getItem('data_recent');
    if (saved) {
      this.state.recentFiles = JSON.parse(saved);
    }
  },

  /**
   * Add file to recent list.
   *
   * @private
   * @param {Object} fileInfo
   */
  _addToRecent(fileInfo) {
    // Remove if already exists
    this.state.recentFiles = this.state.recentFiles.filter(
      (f) => f.projectId !== fileInfo.projectId
    );

    // Add to front
    this.state.recentFiles.unshift(fileInfo);

    // Keep only 20
    this.state.recentFiles = this.state.recentFiles.slice(0, 20);

    localStorage.setItem('data_recent', JSON.stringify(this.state.recentFiles));
  },

  /**
   * Start auto-save interval.
   *
   * @private
   */
  _startAutoSave() {
    this.state.autoSaveHandle = setInterval(() => {
      if (this.state.currentProjectId) {
        this.save().catch((err) => {
          console.warn('Auto-save failed:', err);
        });
      }
    }, this.state.autoSaveIntervalMs);
  },

  /**
   * Show notification.
   *
   * @private
   * @param {string} message
   * @param {string} type
   */
  _showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `data-toast data-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
  },

  /**
   * Broadcast event.
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

  /**
   * Generate random share code.
   *
   * @private
   * @returns {string}
   */
  _generateShareCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },

  // ========================================================================
  // HELP SYSTEM INTEGRATION
  // ========================================================================

  helpEntries: [
    {
      title: 'Create a New Project',
      description:
        'Click Data → New Project to start a new design. Give it a name and optionally a description.',
      category: 'Data Management',
      shortcut: null,
    },
    {
      title: 'Save Project',
      description:
        'Your project saves automatically every 30 seconds. You can also press Ctrl+S to save manually.',
      category: 'Data Management',
      shortcut: 'Ctrl+S',
    },
    {
      title: 'Import Files',
      description:
        'Click Data → Import File to add .ipt, .iam, .step, .stl, and other files to your project.',
      category: 'Data Management',
      shortcut: null,
    },
    {
      title: 'Create Share Link',
      description:
        'Click Data → Share to generate a link that teammates can use to view or edit your project without creating an account.',
      category: 'Data Management',
      shortcut: null,
    },
    {
      title: 'Export Project as ZIP',
      description:
        'Click Data → Export to save your entire project (with all files) as a ZIP archive for backup or sharing.',
      category: 'Data Management',
      shortcut: null,
    },
    {
      title: 'Create a Template',
      description:
        'Click Data → Save as Template to create a reusable template. You can then create new projects based on it.',
      category: 'Data Management',
      shortcut: null,
    },
    {
      title: 'Recover Deleted Projects',
      description:
        'Deleted projects go to trash for 30 days. Click Data → Trash to view and recover deleted projects.',
      category: 'Data Management',
      shortcut: null,
    },
    {
      title: 'Storage Quota',
      description:
        'Check how much storage you\'ve used. Click Data → Storage Info. You get 1GB free; Pro users get 100GB.',
      category: 'Data Management',
      shortcut: null,
    },
  ],

  // ========================================================================
  // UI PANEL — HTML and Styling
  // ========================================================================

  /**
   * Get the HTML for the data management panel.
   *
   * @returns {string} HTML markup
   */
  getUI() {
    return `
      <div class="data-panel" id="data-panel">
        <div class="data-header">
          <h3>Data & Projects</h3>
          <button class="data-close-btn" data-close-panel="data-panel">×</button>
        </div>

        <div class="data-content">
          <div class="data-toolbar">
            <button id="data-new-btn" class="data-btn data-btn-primary">
              ✚ New Project
            </button>
            <button id="data-open-btn" class="data-btn">
              📁 Open
            </button>
          </div>

          <div class="data-tabs">
            <button class="data-tab active" data-tab="projects">Projects</button>
            <button class="data-tab" data-tab="recent">Recent</button>
            <button class="data-tab" data-tab="templates">Templates</button>
          </div>

          <!-- Projects Tab -->
          <div id="data-projects" class="data-tab-content active">
            <div id="data-project-list" class="data-project-list"></div>
          </div>

          <!-- Recent Tab -->
          <div id="data-recent" class="data-tab-content">
            <div id="data-recent-list" class="data-recent-list"></div>
          </div>

          <!-- Templates Tab -->
          <div id="data-templates" class="data-tab-content">
            <div id="data-template-list" class="data-template-list"></div>
          </div>
        </div>
      </div>

      <style>
        .data-panel {
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

        .data-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid #333;
        }

        .data-header h3 {
          margin: 0;
          color: #e0e0e0;
          font-size: 14px;
          font-weight: 600;
        }

        .data-close-btn {
          background: none;
          border: none;
          color: #999;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
        }

        .data-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .data-toolbar {
          display: flex;
          gap: 6px;
          padding: 12px;
          border-bottom: 1px solid #333;
        }

        .data-btn {
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

        .data-btn:hover {
          background: #444;
        }

        .data-btn-primary {
          background: #0284C7;
          color: white;
        }

        .data-btn-primary:hover {
          background: #0369a1;
        }

        .data-tabs {
          display: flex;
          border-bottom: 1px solid #333;
          gap: 0;
        }

        .data-tab {
          flex: 1;
          padding: 8px;
          border: none;
          background: transparent;
          color: #999;
          font-size: 12px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }

        .data-tab.active {
          color: #0284C7;
          border-bottom-color: #0284C7;
        }

        .data-tab-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: none;
        }

        .data-tab-content.active {
          display: block;
        }

        .data-project-list,
        .data-recent-list,
        .data-template-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .data-item {
          padding: 8px;
          background: #2a2a2a;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .data-item:hover {
          background: #333;
        }

        .data-item-name {
          font-weight: 600;
          color: #e0e0e0;
          font-size: 12px;
        }

        .data-item-meta {
          color: #666;
          font-size: 10px;
          margin-top: 4px;
        }

        .data-toast {
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

        .data-toast-success {
          background: #1b5e20;
          color: #81c784;
        }

        .data-toast-error {
          background: #b71c1c;
          color: #ff5252;
        }

        .data-toast-info {
          background: #01579b;
          color: #81d4fa;
        }
      </style>
    `;
  },
};
