/**
 * tree.js - Feature tree panel for cycleCAD
 * Manages feature list, selection, and tree operations (rename, delete, suppress, edit)
 */

const FEATURE_ICONS = {
  Origin: '⊕',
  Sketch: '✏️',
  Extrude: '📦',
  Revolve: '🔄',
  Fillet: '⭕',
  Chamfer: '📐',
  Cut: '✂️',
  Union: '∪',
  Box: '□',
  Cylinder: '🔵',
  Sphere: '🔴',
  Pad: '📦',
};

let treeState = {
  containerEl: null,
  features: [],
  selectedIndex: -1,
  onSelectCallback: null,
  contextMenuTarget: null,
};

/**
 * Initialize the feature tree in the left panel
 * @param {HTMLElement} containerEl - Container for the tree
 */
export function initTree(containerEl) {
  treeState.containerEl = containerEl;
  treeState.features = [];
  treeState.selectedIndex = -1;

  // Create tree structure
  containerEl.innerHTML = `
    <div class="tree-panel">
      <div class="tree-header">
        <h3>Features</h3>
        <div class="tree-counter"><span id="feature-count">0</span> features</div>
      </div>
      <div class="tree-list" id="tree-list"></div>
      <div class="tree-empty" id="tree-empty">
        <div style="text-align:center;padding:20px 12px;">
          <div style="font-size:32px;margin-bottom:8px;opacity:0.5;">&#x1F4D0;</div>
          <p style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-primary, #e0e0e0);">No features yet</p>
          <p style="font-size:11px;color:var(--text-secondary, #a0a0a0);line-height:1.5;">Click <b>New Sketch</b> to draw a 2D profile, then <b>Extrude</b> to make it 3D.</p>
          <p style="font-size:10px;color:var(--text-muted, #696969);margin-top:8px;">Features will appear here as you build.</p>
        </div>
      </div>
    </div>
  `;

  // Add styles if not already present
  if (!document.getElementById('tree-styles')) {
    const style = document.createElement('style');
    style.id = 'tree-styles';
    style.textContent = `
      .tree-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--surface, #1e1e1e);
        color: var(--text, #e0e0e0);
        border-right: 1px solid var(--border, #333);
      }

      .tree-header {
        padding: 16px;
        border-bottom: 1px solid var(--border, #333);
      }

      .tree-header h3 {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text, #e0e0e0);
      }

      .tree-counter {
        font-size: 12px;
        color: var(--text2, #a0a0a0);
      }

      .tree-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }

      .tree-list::-webkit-scrollbar {
        width: 8px;
      }

      .tree-list::-webkit-scrollbar-track {
        background: transparent;
      }

      .tree-list::-webkit-scrollbar-thumb {
        background: var(--border, #333);
        border-radius: 4px;
      }

      .tree-list::-webkit-scrollbar-thumb:hover {
        background: var(--text2, #a0a0a0);
      }

      .tree-item {
        padding: 12px 16px;
        cursor: pointer;
        border-left: 3px solid transparent;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        user-select: none;
        transition: background 0.15s, border-color 0.15s;
      }

      .tree-item:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .tree-item.selected {
        background: var(--accent, rgba(100, 150, 255, 0.15));
        border-left-color: var(--accent, #6496ff);
      }

      .tree-item-icon {
        min-width: 20px;
        text-align: center;
      }

      .tree-item-name {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tree-item-menu {
        opacity: 0;
        cursor: pointer;
        font-size: 12px;
        padding: 4px;
        transition: opacity 0.15s;
      }

      .tree-item:hover .tree-item-menu {
        opacity: 1;
      }

      .tree-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text2, #a0a0a0);
        font-size: 13px;
      }

      .tree-context-menu {
        position: fixed;
        background: var(--surface, #1e1e1e);
        border: 1px solid var(--border, #333);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        z-index: 10000;
        min-width: 160px;
      }

      .tree-context-item {
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text, #e0e0e0);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.15s;
      }

      .tree-context-item:hover {
        background: var(--accent, rgba(100, 150, 255, 0.2));
      }

      .tree-context-item.danger {
        color: #ff6b6b;
      }

      .tree-context-item.danger:hover {
        background: rgba(255, 107, 107, 0.15);
      }
    `;
    document.head.appendChild(style);
  }

  // Attach event listeners
  attachTreeListeners();
}

/**
 * Add a feature to the tree
 * @param {Object} feature - Feature object { type, name, icon, params, mesh }
 */
export function addFeature(feature) {
  if (!feature.type || !feature.name) {
    console.warn('Feature missing type or name', feature);
    return;
  }

  feature.icon = feature.icon || FEATURE_ICONS[feature.type] || '?';
  feature.suppressed = false;
  feature.mesh = feature.mesh || null;
  feature.params = feature.params || {};

  treeState.features.push(feature);
  renderTree();
  updateFeatureCount();
}

/**
 * Remove a feature from the tree
 * @param {number} index - Feature index
 */
export function removeFeature(index) {
  if (index < 0 || index >= treeState.features.length) {
    console.warn('Invalid feature index', index);
    return;
  }

  treeState.features.splice(index, 1);

  // Adjust selected index if needed
  if (treeState.selectedIndex >= treeState.features.length) {
    treeState.selectedIndex = treeState.features.length - 1;
  }

  if (treeState.selectedIndex < 0) {
    treeState.selectedIndex = -1;
  }

  renderTree();
  updateFeatureCount();
}

/**
 * Select a feature in the tree
 * @param {number} index - Feature index
 * @returns {Object} Selected feature or null
 */
export function selectFeature(index) {
  if (index < 0 || index >= treeState.features.length) {
    treeState.selectedIndex = -1;
    renderTree();
    return null;
  }

  treeState.selectedIndex = index;
  renderTree();

  if (treeState.onSelectCallback) {
    treeState.onSelectCallback(treeState.features[index], index);
  }

  return treeState.features[index];
}

/**
 * Get all features
 * @returns {Array} Array of feature objects
 */
export function getFeatures() {
  return [...treeState.features];
}

/**
 * Get currently selected feature
 * @returns {Object|null} Selected feature or null
 */
export function getSelectedFeature() {
  if (treeState.selectedIndex < 0) return null;
  return treeState.features[treeState.selectedIndex];
}

/**
 * Update the feature counter in the header
 */
export function updateFeatureCount() {
  const countEl = document.getElementById('feature-count');
  if (countEl) {
    countEl.textContent = treeState.features.length;
  }
}

/**
 * Register a callback when a feature is selected
 * @param {Function} callback - Called with (feature, index)
 */
export function onSelect(callback) {
  treeState.onSelectCallback = callback;
}

/**
 * Suppress/unsuppress a feature
 * @param {number} index - Feature index
 */
export function suppressFeature(index) {
  if (index >= 0 && index < treeState.features.length) {
    treeState.features[index].suppressed = !treeState.features[index].suppressed;
    renderTree();
  }
}

/**
 * Rename a feature
 * @param {number} index - Feature index
 * @param {string} newName - New name
 */
export function renameFeature(index, newName) {
  if (index >= 0 && index < treeState.features.length && newName.trim()) {
    treeState.features[index].name = newName.trim();
    renderTree();
  }
}

/**
 * Internal: Render the tree list
 */
function renderTree() {
  const treeList = document.getElementById('tree-list');
  const treeEmpty = document.getElementById('tree-empty');

  if (!treeList) return;

  if (treeState.features.length === 0) {
    treeList.innerHTML = '';
    if (treeEmpty) treeEmpty.style.display = 'flex';
    return;
  }

  if (treeEmpty) treeEmpty.style.display = 'none';

  treeList.innerHTML = treeState.features
    .map(
      (feature, idx) => `
    <div class="tree-item ${idx === treeState.selectedIndex ? 'selected' : ''}"
         data-index="${idx}">
      <div class="tree-item-icon">${feature.icon}</div>
      <div class="tree-item-name" title="${feature.name}">
        ${feature.suppressed ? '🚫 ' : ''}${feature.name}
      </div>
      <div class="tree-item-menu" data-menu="${idx}">⋮</div>
    </div>
  `
    )
    .join('');

  attachTreeListeners();
}

/**
 * Internal: Attach event listeners to tree items
 */
function attachTreeListeners() {
  const treeItems = document.querySelectorAll('.tree-item');

  treeItems.forEach((item) => {
    // Select on click
    item.addEventListener('click', (e) => {
      if (e.target.closest('.tree-item-menu')) return;
      const idx = parseInt(item.dataset.index);
      selectFeature(idx);
    });

    // Context menu on right-click or menu button click
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = parseInt(item.dataset.index);
      showContextMenu(idx, e.clientX, e.clientY);
    });

    const menuBtn = item.querySelector('.tree-item-menu');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(item.dataset.index);
        const rect = menuBtn.getBoundingClientRect();
        showContextMenu(idx, rect.right - 10, rect.bottom + 5);
      });
    }
  });
}

/**
 * Internal: Show context menu
 */
function showContextMenu(index, x, y) {
  if (index < 0 || index >= treeState.features.length) return;

  // Remove existing context menu
  const existing = document.querySelector('.tree-context-menu');
  if (existing) existing.remove();

  const feature = treeState.features[index];
  const menu = document.createElement('div');
  menu.className = 'tree-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  menu.innerHTML = `
    <div class="tree-context-item" data-action="rename">
      ✏️ Rename
    </div>
    <div class="tree-context-item" data-action="edit-sketch" ${feature.type !== 'Sketch' ? 'style="opacity:0.5; cursor:not-allowed;"' : ''}>
      📐 Edit Sketch
    </div>
    <div class="tree-context-item" data-action="suppress">
      ${feature.suppressed ? '✓' : '⊘'} ${feature.suppressed ? 'Unsuppress' : 'Suppress'}
    </div>
    <div class="tree-context-item danger" data-action="delete">
      🗑️ Delete
    </div>
  `;

  document.body.appendChild(menu);

  // Close menu on click outside
  const closeMenu = () => {
    menu.remove();
    document.removeEventListener('click', closeMenu);
  };

  setTimeout(() => {
    document.addEventListener('click', closeMenu);
  }, 0);

  // Handle menu actions
  menu.querySelectorAll('.tree-context-item').forEach((item) => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;

      if (action === 'rename') {
        const newName = prompt('Enter new name:', feature.name);
        if (newName !== null) {
          renameFeature(index, newName);
        }
      } else if (action === 'edit-sketch') {
        if (feature.type === 'Sketch') {
          // Dispatch custom event for sketch editor
          window.dispatchEvent(
            new CustomEvent('cyclecad:edit-sketch', {
              detail: { index, feature },
            })
          );
        }
      } else if (action === 'suppress') {
        suppressFeature(index);
      } else if (action === 'delete') {
        if (confirm(`Delete "${feature.name}"?`)) {
          removeFeature(index);
        }
      }

      menu.remove();
    });
  });
}

export default {
  initTree,
  addFeature,
  removeFeature,
  selectFeature,
  getFeatures,
  getSelectedFeature,
  updateFeatureCount,
  onSelect,
  suppressFeature,
  renameFeature,
};
