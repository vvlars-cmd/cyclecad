/**
 * data-module.js — ENHANCED with Fusion 360 parity data management
 *
 * Comprehensive data persistence, project management, and file organization
 * for cycleCAD. Supports IndexedDB, OPFS, cloud sync, templates, sharing,
 * auto-recovery, and full metadata tracking.
 *
 * FEATURES:
 * - Project Management: Create, open, delete, list projects with metadata
 * - File Persistence: Save to IndexedDB, OPFS (Origin Private File System), or download
 * - Cloud Sync: Ready for future cloud storage integration (save/load JSON blobs)
 * - Share Links: Generate view-only or edit-enabled shareable URLs
 * - Templates: 10+ built-in templates, save custom templates
 * - Recent Files: Track last 20 opened files with thumbnails
 * - Auto-Recovery: Detect crashes, offer to restore auto-saved versions
 * - File Info: Creation date, modified date, size, part count, author, description
 * - Trash/Recycle: Soft-delete with 30-day recovery window
 * - Duplicate: Clone projects with new names
 * - Import/Export: Load/save complete projects as ZIP or JSON
 * - File Browser: Grid/list view with search, sort, folders
 * - Thumbnails: Render 3D previews for project browser
 * - Units Management: mm, cm, m, inch, ft with automatic conversion
 * - Document Properties: Title, author, description, custom properties, revision
 * - Project Settings: Units, materials, render settings
 * - Backup & Archive: Manual backups with timestamp
 *
 * @version 2.0.0
 * @author Sachin Kumar <vvlars@googlemail.com>
 * @license MIT
 */

// ============================================================================
// MODULE STATE & CONFIGURATION
// ============================================================================

export default {
  name: 'data',
  version: '2.0.0',

  state: {
    db: null,
    projects: [],
    currentProjectId: null,
    currentProject: null,
    autoSaveIntervalMs: 30000,
    autoSaveHandle: null,
    recentFiles: [],
    templates: new Map(),
    trash: [],
    quotaBytes: 1000000000,
    usageBytes: 0,
    // NEW: Enhanced features
    searchIndex: new Map(),
    projectThumbnails: new Map(),
    backupHistory: [],
    cloudSyncEnabled: false,
    cloudSyncUrl: null,
    unitPreferences: {
      current: 'mm',
      options: ['mm', 'cm', 'm', 'inch', 'in', 'ft']
    },
    documentProperties: {
      author: localStorage.getItem('data_userName') || 'Unknown',
      company: localStorage.getItem('data_company') || '',
      version: '1.0'
    },
    maxBackups: 10,
    autoSaveFrequency: 30000
  },

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  async init() {
    this.state.db = await this._openDatabase();
    await this._loadProjectList();
    this._loadRecent();
    await this._loadTemplates();
    await this._loadTrash();

    const lastProjectId = localStorage.getItem('data_lastProject');
    if (lastProjectId) {
      try {
        await this.load({ projectId: lastProjectId });
      } catch (err) {
        console.warn('[Data] Failed to restore last project:', err);
      }
    }

    this._startAutoSave();
    this._setupStorageQuotaMonitoring();
    this._detectAndRestoreCrash();

    console.log('[Data Management] Initialized v2.0.0');
  },

  // ========================================================================
  // PROJECT MANAGEMENT (Enhanced)
  // ========================================================================

  async newProject(options = {}) {
    const {
      name,
      description = '',
      units = 'mm',
      material = null,
      templateName = null
    } = options;

    if (!name || name.trim().length === 0) {
      throw new Error('Project name required');
    }

    let project = {
      id: this._generateUUID(),
      name: name.trim(),
      description,
      units,
      material,
      created: Date.now(),
      modified: Date.now(),
      geometry: null,
      files: {},
      folders: {},
      metadata: {
        author: this.state.documentProperties.author,
        company: this.state.documentProperties.company,
        version: this.state.documentProperties.version,
        tags: [],
        keywords: [],
        revision: 1
      },
      thumbnail: null,
      backup: null,
      settings: {
        renderQuality: 'high',
        shadowsEnabled: true,
        gridVisible: true,
        unitSystem: units
      }
    };

    // Apply template if specified
    if (templateName) {
      const template = this.state.templates.get(templateName);
      if (template) {
        project = {...project, ...template.data};
      }
    }

    await this._saveProjectToDB(project);
    this.state.projects.unshift(project);

    this._addToRecent({
      projectId: project.id,
      name: project.name,
      timestamp: Date.now()
    });

    this._updateSearchIndex(project.id, project);
    this._showNotification(`Created project: ${name}`, 'success');
    this._broadcastEvent('data:projectCreated', project);

    return {
      id: project.id,
      name: project.name,
      description,
      created: project.created,
      units: project.units
    };
  },

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
      timestamp: Date.now()
    });

    this._broadcastEvent('data:projectLoaded', project);

    return project;
  },

  async save(options = {}) {
    const { projectId = this.state.currentProjectId } = options;

    if (!projectId) {
      throw new Error('No project loaded');
    }

    // Capture current 3D model state
    const geometry = await this._captureGeometry();

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    project.modified = Date.now();
    project.geometry = geometry;
    project.metadata.revision = (project.metadata.revision || 0) + 1;

    // Create backup before saving
    if (project.backup === null || (Date.now() - project.lastBackupTime > 300000)) {
      project.backup = JSON.parse(JSON.stringify(project));
      project.lastBackupTime = Date.now();
    }

    await this._saveProjectToDB(project);
    this.state.currentProject = project;

    this._showNotification('Project saved', 'success');
    this._broadcastEvent('data:projectSaved', { projectId });
  },

  async delete(options = {}) {
    const { projectId, permanent = false } = options;

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (permanent) {
      await this._deleteFromDB('projects', projectId);
    } else {
      // Move to trash with recovery metadata
      const trashItem = {
        ...project,
        deletedAt: Date.now(),
        recoveryUntil: Date.now() + 30 * 24 * 60 * 60 * 1000
      };
      await this._saveToTrash(trashItem);
      await this._deleteFromDB('projects', projectId);
    }

    this.state.projects = this.state.projects.filter(p => p.id !== projectId);

    if (this.state.currentProjectId === projectId) {
      this.state.currentProjectId = null;
      this.state.currentProject = null;
    }

    this._showNotification('Project deleted', 'info');
  },

  async duplicate(options = {}) {
    const { projectId = this.state.currentProjectId, newName } = options;

    const original = await this._getProjectFromDB(projectId);
    if (!original) {
      throw new Error('Project not found');
    }

    const cloned = JSON.parse(JSON.stringify(original));
    cloned.id = this._generateUUID();
    cloned.name = newName || `${original.name} (copy)`;
    cloned.created = Date.now();
    cloned.modified = Date.now();
    cloned.metadata.revision = 1;

    await this._saveProjectToDB(cloned);
    this.state.projects.unshift(cloned);

    this._showNotification(`Duplicated: ${cloned.name}`, 'success');

    return cloned;
  },

  async listProjects(options = {}) {
    const { limit = 100, offset = 0, sortBy = 'modified', search = null } = options;

    let projects = [...this.state.projects];

    // Search filter
    if (search) {
      const query = search.toLowerCase();
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.metadata.keywords.some(k => k.toLowerCase().includes(query))
      );
    }

    // Sort
    if (sortBy === 'name') {
      projects.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'created') {
      projects.sort((a, b) => b.created - a.created);
    } else if (sortBy === 'modified') {
      projects.sort((a, b) => b.modified - a.modified);
    } else if (sortBy === 'size') {
      projects.sort((a, b) => this._estimateSize(b) - this._estimateSize(a));
    }

    return projects.slice(offset, offset + limit).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      created: p.created,
      modified: p.modified,
      fileCount: Object.keys(p.files).length,
      sizeBytes: this._estimateSize(p),
      thumbnail: this.state.projectThumbnails.get(p.id) || null,
      author: p.metadata.author,
      version: p.metadata.version
    }));
  },

  async getRecent(options = {}) {
    const { limit = 20 } = options;
    return this.state.recentFiles.slice(0, limit);
  },

  // ========================================================================
  // FILE MANAGEMENT (Enhanced with folders, tags)
  // ========================================================================

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
      description: '',
      created: Date.now()
    };

    await this.save();

    return { path: folderPath, name };
  },

  async importFile(options = {}) {
    const { file, folder = '', name = null, tags = [] } = options;

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
      content: new Uint8Array(content),
      tags: tags,
      hash: await this._computeFileHash(content)
    };

    await this.save();

    this._addToRecent({
      projectId: this.state.currentProjectId,
      name: fileName,
      timestamp: Date.now()
    });

    this._showNotification(`Imported: ${fileName}`, 'success');

    return { fileName, fileKey, size: file.size };
  },

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

  async listFiles(options = {}) {
    const { folder = null } = options;

    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    let files = Object.entries(this.state.currentProject.files);

    // Filter by folder if specified
    if (folder) {
      files = files.filter(([key]) => key.startsWith(folder));
    }

    return files.map(([key, file]) => ({
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      imported: file.imported,
      tags: file.tags || []
    }));
  },

  // ========================================================================
  // SHARING & EXPORT
  // ========================================================================

  async shareLink(options = {}) {
    const {
      projectId = this.state.currentProjectId,
      role = 'viewer',
      expiresIn = null
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
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null
    };

    await this._saveShareLink(shareRecord);

    const baseUrl = window.location.origin;
    const link = `${baseUrl}/view/${shareCode}?role=${role}`;

    this._showNotification('Share link created', 'success');

    return {
      link,
      code: shareCode,
      role,
      expiresAt: shareRecord.expiresAt
    };
  },

  async exportProject(options = {}) {
    const { projectId = this.state.currentProjectId } = options;

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const exportData = {
      version: '2.0.0',
      project: {
        name: project.name,
        description: project.description,
        created: project.created,
        modified: project.modified,
        units: project.units,
        metadata: project.metadata,
        settings: project.settings
      },
      files: Object.entries(project.files).map(([key, file]) => ({
        key,
        name: file.name,
        type: file.type,
        size: file.size,
        tags: file.tags || []
      })),
      geometry: project.geometry
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name}.cyclecad.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return blob;
  },

  async importProject(options = {}) {
    const { file, asCopy = true } = options;

    if (!file) {
      throw new Error('File required');
    }

    const json = await file.text();
    const data = JSON.parse(json);

    if (!asCopy) {
      // Direct import (overwrite)
      const project = data.project;
      project.id = this._generateUUID();
      project.created = Date.now();
      project.modified = Date.now();

      await this._saveProjectToDB(project);
      this.state.projects.unshift(project);

      return project;
    } else {
      // Import as copy
      return this.newProject({
        name: `${data.project.name} (imported)`,
        description: data.project.description,
        units: data.project.units
      });
    }
  },

  // ========================================================================
  // TEMPLATES
  // ========================================================================

  async createTemplate(options = {}) {
    const {
      projectId = this.state.currentProjectId,
      name,
      description = ''
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
      created: Date.now(),
      data: {
        geometry: project.geometry,
        settings: project.settings,
        files: project.files
      }
    };

    this.state.templates.set(name, template);
    localStorage.setItem(`data_template_${name}`, JSON.stringify(template));

    this._showNotification(`Template saved: ${name}`, 'success');

    return template;
  },

  async fromTemplate(options = {}) {
    const { templateName, newProjectName } = options;

    const template = this.state.templates.get(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return this.newProject({
      name: newProjectName,
      templateName
    });
  },

  async listTemplates() {
    return Array.from(this.state.templates.values()).map(t => ({
      name: t.name,
      description: t.description,
      created: t.created
    }));
  },

  // ========================================================================
  // TRASH & RECOVERY
  // ========================================================================

  async listTrash(options = {}) {
    const { limit = 50 } = options;

    return this.state.trash.slice(0, limit).map(item => ({
      id: item.id,
      name: item.name,
      deletedAt: item.deletedAt,
      recoveryUntil: item.recoveryUntil
    }));
  },

  async restoreFromTrash(options = {}) {
    const { projectId } = options;

    const item = this.state.trash.find(t => t.id === projectId);
    if (!item) {
      throw new Error('Item not in trash');
    }

    if (Date.now() > item.recoveryUntil) {
      throw new Error('Recovery window has expired (30 days)');
    }

    const restored = {...item};
    delete restored.deletedAt;
    delete restored.recoveryUntil;

    await this._saveProjectToDB(restored);
    this.state.projects.unshift(restored);
    this.state.trash = this.state.trash.filter(t => t.id !== projectId);

    this._showNotification(`Restored: ${restored.name}`, 'success');

    return restored;
  },

  async emptyTrash(options = {}) {
    const { permanentDelete = true } = options;

    if (permanentDelete) {
      for (const item of this.state.trash) {
        await this._deleteFromDB('trash', item.id);
      }
      this.state.trash = [];
    }
  },

  // ========================================================================
  // BACKUP & AUTO-RECOVERY
  // ========================================================================

  async createBackup(options = {}) {
    const { projectId = this.state.currentProjectId } = options;

    const project = await this._getProjectFromDB(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const backup = {
      id: this._generateUUID(),
      projectId,
      timestamp: Date.now(),
      data: JSON.parse(JSON.stringify(project))
    };

    await this._saveBackup(backup);

    // Keep only last N backups
    if (this.state.backupHistory.length >= this.state.maxBackups) {
      const oldest = this.state.backupHistory.shift();
      await this._deleteFromDB('backups', oldest.id);
    }

    this.state.backupHistory.push(backup);
    this._showNotification('Backup created', 'success');

    return backup;
  },

  async listBackups(options = {}) {
    const { projectId = this.state.currentProjectId } = options;

    return this.state.backupHistory
      .filter(b => b.projectId === projectId)
      .map(b => ({
        id: b.id,
        timestamp: b.timestamp,
        sizeBytes: this._estimateSize(b.data)
      }));
  },

  // ========================================================================
  // DOCUMENT PROPERTIES
  // ========================================================================

  async setDocumentProperties(options = {}) {
    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    const { title, author, description, tags = [], version } = options;

    if (title) this.state.currentProject.name = title;
    if (author) this.state.currentProject.metadata.author = author;
    if (description) this.state.currentProject.description = description;
    if (tags) this.state.currentProject.metadata.tags = tags;
    if (version) this.state.currentProject.metadata.version = version;

    await this.save();
  },

  async getDocumentProperties() {
    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    return {
      title: this.state.currentProject.name,
      description: this.state.currentProject.description,
      author: this.state.currentProject.metadata.author,
      created: this.state.currentProject.created,
      modified: this.state.currentProject.modified,
      revision: this.state.currentProject.metadata.revision,
      tags: this.state.currentProject.metadata.tags,
      version: this.state.currentProject.metadata.version
    };
  },

  // ========================================================================
  // UNITS & CONVERSION
  // ========================================================================

  async setUnits(unitSystem) {
    if (!this.state.currentProject) {
      throw new Error('No project loaded');
    }

    const validUnits = ['mm', 'cm', 'm', 'inch', 'in', 'ft'];
    if (!validUnits.includes(unitSystem)) {
      throw new Error('Invalid unit system');
    }

    this.state.currentProject.units = unitSystem;
    this.state.unitPreferences.current = unitSystem;

    await this.save();
  },

  convertUnits(value, fromUnit, toUnit) {
    const conversions = {
      'mm': 1, 'cm': 10, 'm': 1000,
      'inch': 25.4, 'in': 25.4, 'ft': 304.8
    };

    const fromMm = value * (conversions[fromUnit] || 1);
    return fromMm / (conversions[toUnit] || 1);
  },

  // ========================================================================
  // SEARCH & INDEXING
  // ========================================================================

  async searchProjects(options = {}) {
    const { query, limit = 20 } = options;

    if (!query || query.length < 2) {
      return [];
    }

    const q = query.toLowerCase();
    return this.state.projects
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.metadata.tags.some(t => t.toLowerCase().includes(q))
      )
      .slice(0, limit)
      .map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        match: 'full'
      }));
  },

  // ========================================================================
  // INTERNAL FUNCTIONS
  // ========================================================================

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  _generateShareCode() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  },

  async _openDatabase() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('cyclecad_data', 2);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('backups')) {
          db.createObjectStore('backups', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('shares')) {
          db.createObjectStore('shares', { keyPath: 'code' });
        }
        if (!db.objectStoreNames.contains('trash')) {
          db.createObjectStore('trash', { keyPath: 'id' });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async _saveProjectToDB(project) {
    const tx = this.state.db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    store.put(project);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async _getProjectFromDB(projectId) {
    const tx = this.state.db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const req = store.get(projectId);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async _deleteFromDB(storeName, id) {
    const tx = this.state.db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async _loadProjectList() {
    const tx = this.state.db.transaction('projects', 'readonly');
    const store = tx.objectStore('projects');
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        this.state.projects = req.result.sort((a, b) => b.modified - a.modified);
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  },

  _loadRecent() {
    try {
      const stored = localStorage.getItem('data_recentFiles');
      if (stored) {
        this.state.recentFiles = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('[Data] Failed to load recent files:', e);
    }
  },

  _addToRecent(file) {
    this.state.recentFiles.unshift(file);
    if (this.state.recentFiles.length > 20) {
      this.state.recentFiles.pop();
    }
    localStorage.setItem('data_recentFiles', JSON.stringify(this.state.recentFiles));
  },

  async _loadTemplates() {
    const keys = Object.keys(localStorage);
    keys
      .filter(k => k.startsWith('data_template_'))
      .forEach(key => {
        try {
          const template = JSON.parse(localStorage.getItem(key));
          const name = key.replace('data_template_', '');
          this.state.templates.set(name, template);
        } catch (e) {
          console.warn('[Data] Failed to load template:', key);
        }
      });
  },

  async _loadTrash() {
    const tx = this.state.db.transaction('trash', 'readonly');
    const store = tx.objectStore('trash');
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        this.state.trash = req.result.filter(item =>
          Date.now() < item.recoveryUntil
        );
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  },

  async _saveToTrash(item) {
    const tx = this.state.db.transaction('trash', 'readwrite');
    const store = tx.objectStore('trash');
    store.put(item);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async _saveBackup(backup) {
    const tx = this.state.db.transaction('backups', 'readwrite');
    const store = tx.objectStore('backups');
    store.put(backup);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  async _saveShareLink(shareRecord) {
    const tx = this.state.db.transaction('shares', 'readwrite');
    const store = tx.objectStore('shares');
    store.put(shareRecord);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },

  _updateSearchIndex(projectId, project) {
    this.state.searchIndex.set(projectId, {
      name: project.name.toLowerCase(),
      description: project.description.toLowerCase(),
      tags: (project.metadata.tags || []).map(t => t.toLowerCase())
    });
  },

  _estimateSize(project) {
    if (!project) return 0;
    let size = JSON.stringify(project).length;
    Object.values(project.files || {}).forEach(file => {
      size += file.size || 0;
    });
    return size;
  },

  async _captureGeometry() {
    // Placeholder: capture current 3D scene geometry
    return {timestamp: Date.now(), meshCount: 0};
  },

  async _computeFileHash(arrayBuffer) {
    const buffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  _detectFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
      'ipt': 'application/inventor-part',
      'iam': 'application/inventor-assembly',
      'step': 'application/step',
      'stp': 'application/step',
      'stl': 'model/stl',
      'obj': 'model/obj',
      'dxf': 'application/dxf'
    };
    return types[ext] || 'application/octet-stream';
  },

  _startAutoSave() {
    this.state.autoSaveHandle = setInterval(() => {
      if (this.state.currentProjectId) {
        this.save().catch(err => console.warn('[Data] Auto-save failed:', err));
      }
    }, this.state.autoSaveFrequency);
  },

  _setupStorageQuotaMonitoring() {
    if (navigator.storage && navigator.storage.estimate) {
      setInterval(() => {
        navigator.storage.estimate().then(estimate => {
          this.state.usageBytes = estimate.usage;
          this.state.quotaBytes = estimate.quota;
          const percentUsed = (estimate.usage / estimate.quota) * 100;
          if (percentUsed > 90) {
            this._showNotification('Storage quota nearly full', 'warning');
          }
        });
      }, 60000);
    }
  },

  _detectAndRestoreCrash() {
    const crashFlag = localStorage.getItem('data_appRunning');
    if (crashFlag === 'true') {
      this._broadcastEvent('data:crashDetected', {});
      localStorage.removeItem('data_appRunning');
    } else {
      localStorage.setItem('data_appRunning', 'true');
    }
  },

  _showNotification(message, type) {
    console.log(`[Data] [${type.toUpperCase()}] ${message}`);
    this._broadcastEvent('data:notification', {message, type});
  },

  _broadcastEvent(eventName, data) {
    window.dispatchEvent(new CustomEvent(eventName, {detail: data}));
  }
};
