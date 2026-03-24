/**
 * project-browser.js - Project folder browser UI for cycleCAD
 * Displays Inventor project structure with file tree, search, and file selection
 */

let browserState = {
  containerEl: null,
  overlayEl: null,
  projectData: null,
  searchQuery: '',
  expandedFolders: new Set(),
  onFileSelectCallback: null,
  currentPath: [],
};

/**
 * Initialize the project browser
 * @param {HTMLElement} container - Container element for the browser overlay
 * @param {Object} callbacks - Callback object with onFileOpen(file), onProjectLoad(project)
 */
export function initProjectBrowser(container, callbacks = {}) {
  browserState.containerEl = container;
  browserState.onFileSelectCallback = callbacks.onFileSelect || callbacks.onFileOpen || (() => {});

  injectStyles();
  createBrowserPanel();
}

/**
 * Show the project browser overlay
 */
export function showBrowser() {
  if (browserState.overlayEl) {
    browserState.overlayEl.style.display = 'flex';
  }
}

/**
 * Hide the project browser overlay
 */
export function hideBrowser() {
  if (browserState.overlayEl) {
    browserState.overlayEl.style.display = 'none';
  }
}

/**
 * Set project data and populate the browser tree
 * @param {Object} projectData - Project structure from project-loader
 */
export function setProject(projectData) {
  browserState.projectData = projectData;
  browserState.expandedFolders.clear();
  browserState.currentPath = [];
  browserState.searchQuery = '';

  // Reset search input
  const searchInput = document.getElementById('project-search');
  if (searchInput) searchInput.value = '';

  renderTree();
  updateStats();
}

/**
 * Register file selection callback
 * @param {Function} callback - Called with selected file object {name, path, type}
 */
export function onFileSelect(callback) {
  browserState.onFileSelectCallback = callback;
}

/**
 * Create the browser panel HTML structure
 */
function createBrowserPanel() {
  const overlay = document.createElement('div');
  overlay.id = 'project-browser-overlay';
  overlay.className = 'project-browser-overlay';

  overlay.innerHTML = `
    <div class="project-browser-panel">
      <!-- Header -->
      <div class="pb-header">
        <div class="pb-title">Project Browser</div>
        <button class="pb-close-btn" aria-label="Close browser">✕</button>
      </div>

      <!-- Stats Bar -->
      <div class="pb-stats">
        <span class="stat-item"><span class="stat-value" id="stat-files">0</span> files</span>
        <span class="stat-item"><span class="stat-value" id="stat-parts">0</span> parts</span>
        <span class="stat-item"><span class="stat-value" id="stat-asms">0</span> assemblies</span>
      </div>

      <!-- Breadcrumb Navigation -->
      <div class="pb-breadcrumb">
        <button class="breadcrumb-item" data-path="">Project</button>
        <div id="breadcrumb-trail"></div>
      </div>

      <!-- Search Input -->
      <div class="pb-search-box">
        <input
          type="text"
          id="project-search"
          class="pb-search-input"
          placeholder="Search files..."
          aria-label="Search project files"
        >
      </div>

      <!-- Tree Container -->
      <div class="pb-tree-container">
        <div id="project-tree" class="pb-tree"></div>
        <div id="pb-empty" class="pb-empty">
          <p>No project loaded</p>
          <p class="pb-empty-hint">Use "Open Project" to load an Inventor file</p>
        </div>
      </div>

      <!-- Footer with Actions -->
      <div class="pb-footer">
        <button class="pb-btn pb-btn-primary" id="open-project-btn">
          📁 Open Project
        </button>
      </div>
    </div>
  `;

  browserState.containerEl.appendChild(overlay);
  browserState.overlayEl = overlay;

  // Event listeners
  setupEventListeners();
}

/**
 * Setup all event listeners for the browser
 */
function setupEventListeners() {
  const overlay = browserState.overlayEl;

  // Close button
  overlay.querySelector('.pb-close-btn').addEventListener('click', hideBrowser);

  // Search input with debounce
  const searchInput = overlay.querySelector('#project-search');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      browserState.searchQuery = e.target.value.toLowerCase();
      renderTree();
    }, 300);
  });

  // Tree delegated click handler
  overlay.querySelector('#project-tree').addEventListener('click', (e) => {
    const target = e.target.closest('[data-tree-item]');
    if (!target) return;

    const itemId = target.dataset.treeItem;
    const itemType = target.dataset.itemType;
    const filePath = target.dataset.filePath;

    if (itemType === 'folder') {
      // Toggle folder expansion
      if (browserState.expandedFolders.has(itemId)) {
        browserState.expandedFolders.delete(itemId);
      } else {
        browserState.expandedFolders.add(itemId);
      }
      renderTree();
    } else if (['ipt', 'iam', 'idw'].includes(itemType)) {
      // File selection
      const fileObj = {
        name: target.textContent.trim().split('\n')[0],
        path: filePath,
        type: itemType,
      };
      browserState.onFileSelectCallback(fileObj);
      hideBrowser();
    }
  });

  // Breadcrumb navigation
  overlay.addEventListener('click', (e) => {
    if (e.target.classList.contains('breadcrumb-item')) {
      const path = e.target.dataset.path;
      browserState.currentPath = path ? path.split('/').filter(Boolean) : [];
      renderTree();
    }
  });

  // Open project button
  overlay.querySelector('#open-project-btn').addEventListener('click', () => {
    // This would typically call project-loader to open file picker
    dispatchCustomEvent('open-project-requested');
  });
}

/**
 * Render the project tree structure
 */
function renderTree() {
  const treeContainer = browserState.overlayEl.querySelector('#project-tree');
  const emptyState = browserState.overlayEl.querySelector('#pb-empty');

  if (!browserState.projectData) {
    treeContainer.innerHTML = '';
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  // Get current folder contents
  const currentFolder = navigateToPath(browserState.projectData, browserState.currentPath);
  if (!currentFolder || !currentFolder.children) {
    treeContainer.innerHTML = '';
    return;
  }

  const html = renderTreeItems(currentFolder.children);
  treeContainer.innerHTML = html;
}

/**
 * Render tree items recursively (with search filter)
 * @param {Array} items - Array of file/folder objects
 * @param {number} depth - Current depth level
 * @returns {string} HTML string
 */
function renderTreeItems(items, depth = 0) {
  if (!items || items.length === 0) return '';

  let html = '<ul class="pb-tree-list">';

  for (const item of items) {
    // Apply search filter
    if (browserState.searchQuery) {
      if (!item.name.toLowerCase().includes(browserState.searchQuery)) {
        continue;
      }
    }

    const itemId = `item-${Math.random().toString(36).substr(2, 9)}`;
    const isExpanded = browserState.expandedFolders.has(itemId);
    const filePath = item.path || '';
    const icon = getFileIcon(item.type);
    const badge = getBadge(item.category);

    html += `<li class="pb-tree-item" data-depth="${depth}">`;

    if (item.type === 'folder' && item.children && item.children.length > 0) {
      // Folder with children
      html += `
        <div class="pb-item-row" data-tree-item="${itemId}" data-item-type="folder" data-file-path="${filePath}">
          <span class="pb-toggle ${isExpanded ? 'expanded' : ''}">▶</span>
          <span class="pb-icon">${icon}</span>
          <span class="pb-label">${escapeHtml(item.name)}</span>
          ${item.children ? `<span class="pb-count">${item.children.length}</span>` : ''}
        </div>
      `;

      if (isExpanded) {
        html += `<div class="pb-children">${renderTreeItems(item.children, depth + 1)}</div>`;
      }
    } else if (item.type === 'folder') {
      // Empty folder
      html += `
        <div class="pb-item-row" data-tree-item="${itemId}" data-item-type="folder" data-file-path="${filePath}">
          <span class="pb-toggle disabled">▶</span>
          <span class="pb-icon">${icon}</span>
          <span class="pb-label">${escapeHtml(item.name)}</span>
        </div>
      `;
    } else {
      // File (part, assembly, drawing, etc.)
      html += `
        <div class="pb-item-row" data-tree-item="${itemId}" data-item-type="${item.type}" data-file-path="${filePath}">
          <span class="pb-toggle disabled">•</span>
          <span class="pb-icon">${icon}</span>
          <span class="pb-label">${escapeHtml(item.name)}</span>
          ${badge ? `<span class="pb-badge pb-badge-${badge.color}">${badge.text}</span>` : ''}
        </div>
      `;
    }

    html += '</li>';
  }

  html += '</ul>';
  return html;
}

/**
 * Get icon emoji for file type
 * @param {string} type - File type
 * @returns {string} Icon emoji
 */
function getFileIcon(type) {
  const icons = {
    ipt: '📦',
    iam: '🏗️',
    idw: '📐',
    folder: '📁',
    ipj: '📋',
  };
  return icons[type] || '📄';
}

/**
 * Get category badge info
 * @param {string} category - Category name (CUSTOM, STD, VENDOR)
 * @returns {Object|null} Badge object or null
 */
function getBadge(category) {
  const badges = {
    CUSTOM: { text: '[CUSTOM]', color: 'green' },
    STD: { text: '[STD]', color: 'blue' },
    VENDOR: { text: '[VENDOR]', color: 'yellow' },
  };
  return badges[category] || null;
}

/**
 * Navigate to a path in the project tree
 * @param {Object} root - Root project object
 * @param {Array} pathArray - Path components
 * @returns {Object} Folder object at path
 */
function navigateToPath(root, pathArray) {
  let current = root;
  for (const component of pathArray) {
    if (!current.children) return null;
    const next = current.children.find(item => item.name === component);
    if (!next) return null;
    current = next;
  }
  return current;
}

/**
 * Update stats display
 */
function updateStats() {
  if (!browserState.projectData) return;

  const stats = countFileTypes(browserState.projectData);

  const filesEl = document.getElementById('stat-files');
  const partsEl = document.getElementById('stat-parts');
  const asmsEl = document.getElementById('stat-asms');

  if (filesEl) filesEl.textContent = stats.total;
  if (partsEl) partsEl.textContent = stats.ipt;
  if (asmsEl) asmsEl.textContent = stats.iam;
}

/**
 * Count file types recursively
 * @param {Object} item - Folder or file
 * @returns {Object} Counts by type
 */
function countFileTypes(item) {
  const counts = { total: 0, ipt: 0, iam: 0, idw: 0 };

  function traverse(node) {
    if (node.type === 'ipt') counts.ipt++;
    else if (node.type === 'iam') counts.iam++;
    else if (node.type === 'idw') counts.idw++;

    if (node.type !== 'folder') counts.total++;

    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  if (item.children) {
    for (const child of item.children) {
      traverse(child);
    }
  }

  return counts;
}

/**
 * Dispatch custom event
 * @param {string} eventName - Event name
 * @param {Object} detail - Event detail data
 */
function dispatchCustomEvent(eventName, detail = {}) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}

/**
 * Inject CSS styles into the document
 */
function injectStyles() {
  if (document.getElementById('project-browser-styles')) return;

  const style = document.createElement('style');
  style.id = 'project-browser-styles';
  style.textContent = `
    .project-browser-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 9999;
      align-items: center;
      justify-content: flex-start;
    }

    .project-browser-panel {
      width: 400px;
      height: 100%;
      background: var(--bg-primary, #1e1e1e);
      border-right: 1px solid var(--border-color, #3e3e42);
      display: flex;
      flex-direction: column;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.5);
    }

    .pb-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color, #3e3e42);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .pb-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary, #e0e0e0);
    }

    .pb-close-btn {
      background: none;
      border: none;
      color: var(--text-secondary, #a0a0a0);
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .pb-close-btn:hover {
      background: var(--bg-secondary, #252526);
      color: var(--text-primary, #e0e0e0);
    }

    .pb-stats {
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color, #3e3e42);
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: var(--text-secondary, #a0a0a0);
      flex-shrink: 0;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stat-value {
      color: var(--accent-blue, #58a6ff);
      font-weight: 600;
    }

    .pb-breadcrumb {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color, #3e3e42);
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      flex-shrink: 0;
    }

    .breadcrumb-item {
      background: none;
      border: none;
      color: var(--accent-blue, #58a6ff);
      font-size: 12px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 3px;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .breadcrumb-item:hover {
      background: var(--bg-secondary, #252526);
    }

    .pb-search-box {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color, #3e3e42);
      flex-shrink: 0;
    }

    .pb-search-input {
      width: 100%;
      padding: 8px;
      background: var(--bg-secondary, #252526);
      border: 1px solid var(--border-color, #3e3e42);
      color: var(--text-primary, #e0e0e0);
      font-size: 12px;
      border-radius: 4px;
      outline: none;
      transition: border-color 0.2s;
    }

    .pb-search-input:focus {
      border-color: var(--accent-blue, #58a6ff);
    }

    .pb-search-input::placeholder {
      color: var(--text-secondary, #a0a0a0);
    }

    .pb-tree-container {
      flex: 1;
      overflow-y: auto;
      position: relative;
      min-height: 0;
    }

    .pb-tree {
      padding: 4px;
    }

    .pb-tree-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .pb-tree-item {
      margin: 0;
      padding: 0;
    }

    .pb-item-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s;
      user-select: none;
      font-size: 12px;
      color: var(--text-primary, #e0e0e0);
    }

    .pb-item-row:hover {
      background: var(--bg-secondary, #252526);
    }

    .pb-toggle {
      width: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--text-secondary, #a0a0a0);
      transition: transform 0.2s;
    }

    .pb-toggle.expanded {
      transform: rotate(90deg);
    }

    .pb-toggle.disabled {
      cursor: default;
      opacity: 0;
    }

    .pb-icon {
      font-size: 14px;
      min-width: 14px;
    }

    .pb-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pb-count {
      font-size: 11px;
      color: var(--text-secondary, #a0a0a0);
      background: var(--bg-tertiary, #2d2d30);
      padding: 2px 6px;
      border-radius: 2px;
    }

    .pb-badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 2px;
      white-space: nowrap;
    }

    .pb-badge-green {
      background: rgba(63, 185, 80, 0.2);
      color: var(--accent-green, #3fb950);
    }

    .pb-badge-blue {
      background: rgba(88, 166, 255, 0.2);
      color: var(--accent-blue, #58a6ff);
    }

    .pb-badge-yellow {
      background: rgba(210, 153, 34, 0.2);
      color: var(--accent-yellow, #d29922);
    }

    .pb-children {
      margin-left: 8px;
    }

    .pb-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary, #a0a0a0);
      font-size: 12px;
      text-align: center;
      gap: 8px;
      padding: 24px;
    }

    .pb-empty p {
      margin: 0;
    }

    .pb-empty-hint {
      font-size: 11px;
      color: var(--text-secondary, #a0a0a0);
      opacity: 0.7;
    }

    .pb-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border-color, #3e3e42);
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .pb-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .pb-btn-primary {
      background: var(--accent-blue, #58a6ff);
      color: var(--bg-primary, #1e1e1e);
    }

    .pb-btn-primary:hover {
      background: #4a96e8;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(88, 166, 255, 0.2);
    }

    /* Scrollbar styling */
    .pb-tree-container::-webkit-scrollbar {
      width: 8px;
    }

    .pb-tree-container::-webkit-scrollbar-track {
      background: var(--bg-primary, #1e1e1e);
    }

    .pb-tree-container::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary, #2d2d30);
      border-radius: 4px;
    }

    .pb-tree-container::-webkit-scrollbar-thumb:hover {
      background: var(--border-color, #3e3e42);
    }
  `;

  document.head.appendChild(style);
}

export default {
  initProjectBrowser,
  showBrowser,
  hideBrowser,
  setProject,
  onFileSelect,
};
