/**
 * Keyboard Shortcuts Module for cycleCAD
 * Registers and manages all keyboard shortcuts
 */

let shortcutsPanel = null;
let shortcutsVisible = false;

const SHORTCUT_MAP = {
  // Sketch tools
  's': { action: 'newSketch', label: 'New Sketch', category: 'Sketch' },
  'l': { action: 'line', label: 'Line Tool', category: 'Sketch Tools' },
  'r': { action: 'rect', label: 'Rectangle Tool', category: 'Sketch Tools' },
  'c': { action: 'circle', label: 'Circle Tool', category: 'Sketch Tools' },
  'a': { action: 'arc', label: 'Arc Tool', category: 'Sketch Tools' },
  'd': { action: 'dimension', label: 'Dimension Tool', category: 'Sketch Tools' },

  // 3D Operations
  'e': { action: 'extrude', label: 'Extrude', category: '3D Operations' },
  'v': { action: 'revolve', label: 'Revolve', category: '3D Operations' },
  'f': { action: 'fillet', label: 'Fillet', category: '3D Operations' },
  'shift+f': { action: 'chamfer', label: 'Chamfer', category: '3D Operations' },

  // Boolean operations
  'ctrl+u': { action: 'union', label: 'Union', category: 'Boolean' },
  'ctrl+minus': { action: 'cut', label: 'Cut', category: 'Boolean' },

  // Edit
  'ctrl+z': { action: 'undo', label: 'Undo', category: 'Edit' },
  'ctrl+y': { action: 'redo', label: 'Redo', category: 'Edit' },
  'ctrl+shift+z': { action: 'redo', label: 'Redo', category: 'Edit' },
  'delete': { action: 'delete', label: 'Delete Selected', category: 'Edit' },
  'backspace': { action: 'delete', label: 'Delete Selected', category: 'Edit' },
  'escape': { action: 'escape', label: 'Cancel / Deselect', category: 'Edit' },
  'enter': { action: 'enter', label: 'Confirm', category: 'Edit' },

  // Views
  '1': { action: 'viewFront', label: 'Front View', category: 'Views' },
  '2': { action: 'viewBack', label: 'Back View', category: 'Views' },
  '3': { action: 'viewRight', label: 'Right View', category: 'Views' },
  '4': { action: 'viewLeft', label: 'Left View', category: 'Views' },
  '5': { action: 'viewTop', label: 'Top View', category: 'Views' },
  '6': { action: 'viewBottom', label: 'Bottom View', category: 'Views' },
  '7': { action: 'viewIso', label: 'Isometric View', category: 'Views' },

  // Display
  'g': { action: 'toggleGrid', label: 'Toggle Grid', category: 'Display' },
  'w': { action: 'toggleWireframe', label: 'Toggle Wireframe', category: 'Display' },
  'shift+f': { action: 'fitAll', label: 'Fit All', category: 'Display' },

  // Export & Save
  'ctrl+s': { action: 'save', label: 'Save (Export JSON)', category: 'File' },
  'ctrl+shift+e': { action: 'exportSTL', label: 'Export STL', category: 'File' },

  // Help
  '?': { action: 'showHelp', label: 'Show Shortcuts', category: 'Help' },
};

/**
 * Initialize keyboard shortcuts
 * @param {Object} handlers - Map of action names to handler functions
 */
export function initShortcuts(handlers) {
  document.addEventListener('keydown', (e) => {
    // Skip if focus is on input/textarea/select
    if (isInputFocused()) return;

    const key = getKeyCombo(e);
    const shortcut = SHORTCUT_MAP[key.toLowerCase()];

    if (shortcut && handlers[shortcut.action]) {
      e.preventDefault();
      handlers[shortcut.action]();
    }
  });
}

/**
 * Get keyboard combination string (e.g., "ctrl+z", "shift+a")
 * @param {KeyboardEvent} e
 * @returns {string}
 */
function getKeyCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  // Get the actual key
  let key = e.key.toLowerCase();
  if (key === 'control' || key === 'shift' || key === 'alt' || key === 'meta') {
    return parts.join('+'); // Modifier key only, not a valid shortcut
  }

  // Special key names
  const specialKeys = {
    'arrowup': 'up',
    'arrowdown': 'down',
    'arrowleft': 'left',
    'arrowright': 'right',
    ' ': 'space',
    'enter': 'enter',
    'escape': 'escape',
    'delete': 'delete',
    'backspace': 'backspace',
  };

  key = specialKeys[key] || key;
  parts.push(key);

  return parts.join('+');
}

/**
 * Check if an input/textarea/select is currently focused
 * @returns {boolean}
 */
function isInputFocused() {
  const activeEl = document.activeElement;
  return (
    activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT' ||
      activeEl.contentEditable === 'true')
  );
}

/**
 * Show the shortcuts help panel
 */
export function showShortcutsPanel() {
  if (shortcutsVisible && shortcutsPanel) {
    shortcutsPanel.style.display = 'none';
    shortcutsVisible = false;
    return;
  }

  // Create panel if it doesn't exist
  if (!shortcutsPanel) {
    shortcutsPanel = createShortcutsPanel();
    document.body.appendChild(shortcutsPanel);
  }

  shortcutsPanel.style.display = 'flex';
  shortcutsVisible = true;
}

/**
 * Create the shortcuts panel DOM element
 * @returns {HTMLElement}
 */
function createShortcutsPanel() {
  const panel = document.createElement('div');
  panel.id = 'shortcuts-panel';
  panel.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    background: #1a1a1a;
    border: 2px solid #444;
    border-radius: 8px;
    padding: 24px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    overflow: hidden;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #444;
  `;

  const title = document.createElement('h2');
  title.textContent = 'Keyboard Shortcuts';
  title.style.cssText = `
    margin: 0;
    color: #fff;
    font-size: 18px;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none;
    border: none;
    color: #aaa;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeBtn.onclick = () => showShortcutsPanel();
  closeBtn.onmouseover = () => (closeBtn.style.color = '#fff');
  closeBtn.onmouseout = () => (closeBtn.style.color = '#aaa');

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Content
  const content = document.createElement('div');
  content.style.cssText = `
    overflow-y: auto;
    flex: 1;
    color: #ddd;
  `;

  // Group shortcuts by category
  const categories = {};
  Object.entries(SHORTCUT_MAP).forEach(([key, shortcut]) => {
    if (!categories[shortcut.category]) {
      categories[shortcut.category] = [];
    }
    categories[shortcut.category].push({ key, ...shortcut });
  });

  // Render categories
  Object.entries(categories).forEach(([category, shortcuts]) => {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-bottom: 20px;
    `;

    const catTitle = document.createElement('h3');
    catTitle.textContent = category;
    catTitle.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 12px;
      color: #999;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;

    const shortcuts_list = document.createElement('div');
    shortcuts_list.style.cssText = `
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    `;

    shortcuts.forEach(({ key, label }) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 8px;
        border-radius: 4px;
        background: rgba(255,255,255,0.05);
        font-size: 12px;
      `;

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      labelEl.style.color = '#ddd';

      const keyEl = document.createElement('kbd');
      keyEl.textContent = key.toUpperCase();
      keyEl.style.cssText = `
        background: rgba(255,255,255,0.1);
        padding: 2px 6px;
        border-radius: 3px;
        font-family: monospace;
        font-size: 10px;
        color: #4a9eff;
        border: 1px solid rgba(74,158,255,0.3);
      `;

      row.appendChild(labelEl);
      row.appendChild(keyEl);
      shortcuts_list.appendChild(row);
    });

    section.appendChild(catTitle);
    section.appendChild(shortcuts_list);
    content.appendChild(section);
  });

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = `
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #444;
    font-size: 11px;
    color: #666;
  `;
  footer.textContent = 'Press ? to toggle this panel';

  panel.appendChild(header);
  panel.appendChild(content);
  panel.appendChild(footer);

  // Close on Escape
  const closeOnEscape = (e) => {
    if (e.key === 'Escape' && shortcutsVisible) {
      showShortcutsPanel();
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  document.addEventListener('keydown', closeOnEscape);

  return panel;
}

/**
 * Get list of all shortcuts for help/documentation
 * @returns {Array}
 */
export function getShortcutsList() {
  return Object.entries(SHORTCUT_MAP).map(([key, shortcut]) => ({
    key,
    ...shortcut,
  }));
}

/**
 * Check if a key combination is valid
 * @param {string} key - Key combination (e.g., "ctrl+z")
 * @returns {boolean}
 */
export function isValidShortcut(key) {
  return key.toLowerCase() in SHORTCUT_MAP;
}

/**
 * Get the handler function name for a key combination
 * @param {string} key
 * @returns {string|null}
 */
export function getShortcutAction(key) {
  const shortcut = SHORTCUT_MAP[key.toLowerCase()];
  return shortcut ? shortcut.action : null;
}
