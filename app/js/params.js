/**
 * params.js - Parameter editor panel for cycleCAD
 * Manages feature parameters, materials, and property display
 */

const MATERIALS = {
  Steel: {
    density: 7.85, // g/cm³
    color: 0x8899aa,
    label: 'Steel',
  },
  Aluminum: {
    density: 2.7,
    color: 0xb0b8c4,
    label: 'Aluminum',
  },
  ABS: {
    density: 1.05,
    color: 0x2a2a2e,
    label: 'ABS',
  },
  Brass: {
    density: 8.5,
    color: 0xc4a54a,
    label: 'Brass',
  },
  Titanium: {
    density: 4.5,
    color: 0x8a8a90,
    label: 'Titanium',
  },
  Nylon: {
    density: 1.14,
    color: 0xe8e0d0,
    label: 'Nylon',
  },
};

let paramsState = {
  containerEl: null,
  currentFeature: null,
  onParamChangeCallback: null,
  onMaterialChangeCallback: null,
};

/**
 * Initialize the parameters panel
 * @param {HTMLElement} containerEl - Container for the panel
 */
export function initParams(containerEl) {
  paramsState.containerEl = containerEl;
  paramsState.currentFeature = null;

  // Create panel structure
  containerEl.innerHTML = `
    <div class="params-panel">
      <div class="params-header">
        <h3>Properties</h3>
      </div>
      <div class="params-content" id="params-content">
        <div class="params-empty">
          <p>Select a feature to see parameters</p>
        </div>
      </div>
    </div>
  `;

  // Add styles if not already present
  if (!document.getElementById('params-styles')) {
    const style = document.createElement('style');
    style.id = 'params-styles';
    style.textContent = `
      .params-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--surface, #1e1e1e);
        color: var(--text, #e0e0e0);
        border-left: 1px solid var(--border, #333);
      }

      .params-header {
        padding: 16px;
        border-bottom: 1px solid var(--border, #333);
      }

      .params-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text, #e0e0e0);
      }

      .params-content {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        padding: 16px;
      }

      .params-content::-webkit-scrollbar {
        width: 8px;
      }

      .params-content::-webkit-scrollbar-track {
        background: transparent;
      }

      .params-content::-webkit-scrollbar-thumb {
        background: var(--border, #333);
        border-radius: 4px;
      }

      .params-content::-webkit-scrollbar-thumb:hover {
        background: var(--text2, #a0a0a0);
      }

      .params-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text2, #a0a0a0);
        font-size: 13px;
      }

      .params-group {
        margin-bottom: 20px;
      }

      .params-group-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text2, #a0a0a0);
        text-transform: uppercase;
        margin-bottom: 12px;
        letter-spacing: 0.5px;
      }

      .param-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .param-label {
        flex: 1;
        font-size: 13px;
        color: var(--text, #e0e0e0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .param-input-wrapper {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .param-input {
        width: 80px;
        padding: 6px 8px;
        background: var(--bg, #141414);
        border: 1px solid var(--border, #333);
        border-radius: 3px;
        color: var(--text, #e0e0e0);
        font-size: 12px;
        font-family: monospace;
        transition: border-color 0.15s, background 0.15s;
      }

      .param-input:focus {
        outline: none;
        border-color: var(--accent, #6496ff);
        background: var(--bg, #1a1a1a);
      }

      .param-unit {
        font-size: 12px;
        color: var(--text2, #a0a0a0);
        min-width: 24px;
        text-align: right;
      }

      .material-section {
        margin-bottom: 20px;
      }

      .material-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--text2, #a0a0a0);
        text-transform: uppercase;
        margin-bottom: 8px;
        letter-spacing: 0.5px;
      }

      .material-select {
        width: 100%;
        padding: 8px 10px;
        background: var(--bg, #141414);
        border: 1px solid var(--border, #333);
        border-radius: 3px;
        color: var(--text, #e0e0e0);
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
      }

      .material-select:focus {
        outline: none;
        border-color: var(--accent, #6496ff);
        background: var(--bg, #1a1a1a);
      }

      .material-select option {
        background: var(--surface, #1e1e1e);
        color: var(--text, #e0e0e0);
      }

      .material-info {
        margin-top: 12px;
        padding: 10px 12px;
        background: rgba(100, 150, 255, 0.08);
        border-left: 3px solid var(--accent, #6496ff);
        border-radius: 2px;
        font-size: 12px;
        color: var(--text, #e0e0e0);
      }

      .material-info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .material-info-row:last-child {
        margin-bottom: 0;
      }

      .material-info-label {
        color: var(--text2, #a0a0a0);
      }

      .material-color-preview {
        display: inline-block;
        width: 16px;
        height: 16px;
        border-radius: 2px;
        border: 1px solid var(--border, #333);
        vertical-align: middle;
        margin-right: 6px;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Show parameters for a feature
 * @param {Object} feature - Feature object with params
 */
export function showParams(feature) {
  if (!feature) {
    clearParams();
    return;
  }

  paramsState.currentFeature = feature;
  const content = document.getElementById('params-content');
  if (!content) return;

  let html = '';

  // Feature info
  html += `
    <div class="params-group">
      <div class="params-group-title">Feature</div>
      <div class="param-row">
        <span class="param-label">Type:</span>
        <span class="param-unit">${feature.type}</span>
      </div>
      <div class="param-row">
        <span class="param-label">Name:</span>
        <span class="param-unit">${feature.name}</span>
      </div>
    </div>
  `;

  // Parameters section
  if (feature.params && Object.keys(feature.params).length > 0) {
    html += `<div class="params-group">`;
    html += `<div class="params-group-title">Parameters</div>`;

    for (const [paramName, paramValue] of Object.entries(feature.params)) {
      const displayName = paramName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

      html += `
        <div class="param-row">
          <label class="param-label" for="param-${paramName}">${displayName}:</label>
          <div class="param-input-wrapper">
            <input
              type="number"
              id="param-${paramName}"
              class="param-input"
              data-param="${paramName}"
              value="${typeof paramValue === 'number' ? paramValue.toFixed(2) : paramValue}"
              step="0.1"
            />
            <span class="param-unit">mm</span>
          </div>
        </div>
      `;
    }

    html += `</div>`;
  }

  // Material section
  html += `
    <div class="material-section">
      <div class="material-label">Material</div>
      <select class="material-select" id="material-select">
  `;

  for (const [key, mat] of Object.entries(MATERIALS)) {
    const selected = feature.material === key ? 'selected' : '';
    html += `<option value="${key}" ${selected}>${mat.label}</option>`;
  }

  html += `
      </select>
      <div class="material-info" id="material-info">
        ${getMaterialInfoHtml(feature.material || 'Steel')}
      </div>
    </div>
  `;

  content.innerHTML = html;

  // Attach event listeners
  attachParamListeners();
  attachMaterialListener();
}

/**
 * Show only material selector (for non-parameter features)
 * @param {Object} feature - Feature object
 */
export function showMaterial(feature) {
  if (!feature) {
    clearParams();
    return;
  }

  paramsState.currentFeature = feature;
  const content = document.getElementById('params-content');
  if (!content) return;

  const html = `
    <div class="material-section">
      <div class="material-label">Material</div>
      <select class="material-select" id="material-select">
        ${Object.entries(MATERIALS)
          .map(([key, mat]) => {
            const selected = feature.material === key ? 'selected' : '';
            return `<option value="${key}" ${selected}>${mat.label}</option>`;
          })
          .join('')}
      </select>
      <div class="material-info" id="material-info">
        ${getMaterialInfoHtml(feature.material || 'Steel')}
      </div>
    </div>
  `;

  content.innerHTML = html;
  attachMaterialListener();
}

/**
 * Clear the parameters display
 */
export function clearParams() {
  paramsState.currentFeature = null;
  const content = document.getElementById('params-content');
  if (content) {
    content.innerHTML = `
      <div class="params-empty">
        <p>Select a feature to see parameters</p>
      </div>
    `;
  }
}

/**
 * Register callback for parameter changes
 * @param {Function} callback - Called with (feature, paramName, newValue)
 */
export function onParamChange(callback) {
  paramsState.onParamChangeCallback = callback;
}

/**
 * Register callback for material changes
 * @param {Function} callback - Called with (feature, material)
 */
export function onMaterialChange(callback) {
  paramsState.onMaterialChangeCallback = callback;
}

/**
 * Get material info (density, color)
 * @param {string} materialName - Material key
 * @returns {Object} Material object
 */
export function getMaterial(materialName) {
  return MATERIALS[materialName] || MATERIALS.Steel;
}

/**
 * Get all materials
 * @returns {Object} All materials
 */
export function getMaterials() {
  return { ...MATERIALS };
}

/**
 * Internal: Generate material info HTML
 */
function getMaterialInfoHtml(materialName) {
  const mat = MATERIALS[materialName] || MATERIALS.Steel;
  const colorHex = mat.color.toString(16).padStart(6, '0');

  return `
    <div class="material-info-row">
      <span class="material-info-label">Density:</span>
      <span>${mat.density} g/cm³</span>
    </div>
    <div class="material-info-row">
      <span class="material-info-label">Color:</span>
      <span>
        <div class="material-color-preview" style="background-color: #${colorHex};"></div>
        #${colorHex}
      </span>
    </div>
  `;
}

/**
 * Internal: Attach parameter input listeners
 */
function attachParamListeners() {
  const paramInputs = document.querySelectorAll('.param-input');

  paramInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!paramsState.currentFeature) return;

      const paramName = input.dataset.param;
      const newValue = parseFloat(input.value);

      if (!isNaN(newValue)) {
        paramsState.currentFeature.params[paramName] = newValue;

        if (paramsState.onParamChangeCallback) {
          paramsState.onParamChangeCallback(
            paramsState.currentFeature,
            paramName,
            newValue
          );
        }
      }
    });

    // Real-time preview on input (optional)
    input.addEventListener('input', () => {
      // Could trigger a live preview here
    });
  });
}

/**
 * Internal: Attach material select listener
 */
function attachMaterialListener() {
  const materialSelect = document.getElementById('material-select');
  if (!materialSelect) return;

  materialSelect.addEventListener('change', () => {
    if (!paramsState.currentFeature) return;

    const materialName = materialSelect.value;
    paramsState.currentFeature.material = materialName;

    // Update material info display
    const materialInfo = document.getElementById('material-info');
    if (materialInfo) {
      materialInfo.innerHTML = getMaterialInfoHtml(materialName);
    }

    if (paramsState.onMaterialChangeCallback) {
      paramsState.onMaterialChangeCallback(paramsState.currentFeature, materialName);
    }
  });
}

export default {
  initParams,
  showParams,
  showMaterial,
  clearParams,
  onParamChange,
  onMaterialChange,
  getMaterial,
  getMaterials,
};
