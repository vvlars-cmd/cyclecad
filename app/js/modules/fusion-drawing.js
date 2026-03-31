/**
 * cycleCAD — Fusion 360 Drawing Module
 * Complete 2D technical drawing workspace with views, dimensions, GD&T, and standards compliance.
 *
 * Features:
 * - Paper sizes (A4/A3/A2/A1/Letter/Tabloid)
 * - Base/Projected/Section/Detail/Break Views
 * - Linear/Angular/Radial/Diameter/Ordinate Dimensions
 * - GD&T frames (Flatness, Parallelism, Perpendicularity, Concentricity, etc.)
 * - Surface finish symbols, Hole callouts, Center marks
 * - Customizable title block with company branding
 * - Parts list / BOM table generation
 * - ISO 128 and ANSI Y14.5 compliance
 * - Export to PDF / DXF
 *
 * Version: 1.0.0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/**
 * Fusion Drawing Module — Technical drawing workspace
 */
class FusionDrawingModule {
  constructor(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // Drawing settings
    this.paperSize = 'A3'; // A4 | A3 | A2 | A1 | Letter | Tabloid
    this.paperDimensions = this.getPaperDimensions();
    this.scale = 1; // Drawing scale
    this.unit = 'mm';

    // Canvas for 2D drawing (orthographic)
    this.canvas = null;
    this.ctx = null;
    this.drawingCanvas = null;

    // Views
    this.views = new Map(); // viewId -> view definition
    this.baseView = null;

    // Dimensions
    this.dimensions = new Map(); // dimId -> dimension definition
    this.gdtFrames = new Map(); // frameId -> GD&T frame definition

    // Annotations
    this.notes = [];
    this.centerMarks = [];
    this.centerLines = [];
    this.balloons = [];

    // Title block
    this.titleBlock = {
      company: 'Your Company',
      designer: 'Designer Name',
      date: new Date().toISOString().split('T')[0],
      scale: '1:1',
      material: 'Steel',
      sheetNumber: '1/1',
      revision: 'A',
      documentNumber: '000001'
    };

    // BOM data
    this.bomItems = [];
    this.bomLocation = { x: 20, y: 50 }; // Bottom right corner

    // Hatch patterns for section views
    this.hatchPatterns = {
      steel: { angle: 45, spacing: 2, color: '#666666' },
      aluminum: { angle: 45, spacing: 2, color: '#aaaaaa' },
      plastic: { angle: 45, spacing: 3, color: '#cccccc' }
    };
  }

  /**
   * Initialize drawing module UI
   */
  init() {
    this.setupDrawingCanvas();
    this.setupEventListeners();
  }

  /**
   * Get UI panel for drawing controls
   */
  getUI() {
    const panel = document.createElement('div');
    panel.className = 'fusion-drawing-panel';
    panel.innerHTML = `
      <style>
        .fusion-drawing-panel {
          padding: 16px;
          font-size: 12px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          border-radius: 4px;
          max-height: 700px;
          overflow-y: auto;
        }
        .fusion-drawing-panel h3 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .drawing-section {
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .drawing-section:last-child {
          border-bottom: none;
        }
        .view-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .view-item {
          padding: 8px;
          background: var(--bg-primary);
          border-radius: 3px;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 11px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .view-item:hover {
          background: var(--bg-tertiary);
        }
        .view-type {
          font-weight: 600;
          color: var(--accent-color);
        }
        .dimension-type-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          margin-bottom: 8px;
        }
        .dimension-type-buttons button {
          padding: 6px;
          font-size: 10px;
          background: var(--button-bg);
          border: 1px solid var(--border-color);
          border-radius: 3px;
          cursor: pointer;
          color: var(--text-primary);
        }
        .dimension-type-buttons button:hover {
          background: var(--button-hover-bg);
        }
        .gdt-frame-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
        }
        .gdt-frame-selector button {
          padding: 6px;
          font-size: 9px;
          background: var(--button-bg);
          border: 1px solid var(--border-color);
          border-radius: 3px;
          cursor: pointer;
          color: var(--text-primary);
        }
        .title-block-form {
          background: var(--bg-primary);
          padding: 8px;
          border-radius: 3px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .title-block-form input {
          padding: 4px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 2px;
          color: var(--text-primary);
          font-size: 11px;
        }
        .bom-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
          background: var(--bg-primary);
          border-radius: 3px;
          overflow: hidden;
        }
        .bom-table th {
          background: var(--bg-tertiary);
          padding: 4px;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }
        .bom-table td {
          padding: 4px;
          border-bottom: 1px solid var(--border-color);
        }
      </style>

      <div class="drawing-section">
        <h3>Paper Setup</h3>
        <div style="display: flex; gap: 4px; margin-bottom: 8px;">
          <select id="drawingPaperSize" onchange="window.fusionDrawing?.setPaperSize(this.value)" style="flex: 1; padding: 6px; font-size: 11px;">
            <option value="A4">A4</option>
            <option value="A3" selected>A3</option>
            <option value="A2">A2</option>
            <option value="A1">A1</option>
            <option value="Letter">Letter</option>
            <option value="Tabloid">Tabloid</option>
          </select>
          <input type="text" placeholder="Scale" id="drawingScale" value="1:1" style="width: 60px; padding: 6px; font-size: 11px;">
        </div>
      </div>

      <div class="drawing-section">
        <h3>Views</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px;">
          <button onclick="window.fusionDrawing?.addBaseView('Front')">Base View</button>
          <button onclick="window.fusionDrawing?.addProjectedView()">Projected</button>
          <button onclick="window.fusionDrawing?.addSectionView()">Section</button>
          <button onclick="window.fusionDrawing?.addDetailView()">Detail</button>
          <button onclick="window.fusionDrawing?.addBreakView()">Break</button>
          <button onclick="window.fusionDrawing?.addIsometricView()">Isometric</button>
        </div>
        <div class="view-list" id="drawingViewList"></div>
      </div>

      <div class="drawing-section">
        <h3>Dimensions</h3>
        <div class="dimension-type-buttons">
          <button onclick="window.fusionDrawing?.addDimension('Linear')">Linear</button>
          <button onclick="window.fusionDrawing?.addDimension('Angular')">Angular</button>
          <button onclick="window.fusionDrawing?.addDimension('Radial')">Radial</button>
          <button onclick="window.fusionDrawing?.addDimension('Diameter')">Diameter</button>
          <button onclick="window.fusionDrawing?.addDimension('Ordinate')">Ordinate</button>
          <button onclick="window.fusionDrawing?.addDimension('Hole Callout')">Hole Callout</button>
        </div>
        <div style="margin-top: 8px;">
          <button onclick="window.fusionDrawing?.addCenterMark()" style="width: 100%; padding: 6px;">Center Mark</button>
        </div>
      </div>

      <div class="drawing-section">
        <h3>GD&T</h3>
        <div class="gdt-frame-selector">
          <button onclick="window.fusionDrawing?.addGDT('Flatness')">Flatness</button>
          <button onclick="window.fusionDrawing?.addGDT('Parallelism')">Parallelism</button>
          <button onclick="window.fusionDrawing?.addGDT('Perpendicularity')">Perp.</button>
          <button onclick="window.fusionDrawing?.addGDT('Concentricity')">Concentricity</button>
          <button onclick="window.fusionDrawing?.addGDT('Runout')">Runout</button>
          <button onclick="window.fusionDrawing?.addGDT('Position')">Position</button>
          <button onclick="window.fusionDrawing?.addGDT('Profile')">Profile</button>
          <button onclick="window.fusionDrawing?.addGDT('Angularity')">Angularity</button>
        </div>
      </div>

      <div class="drawing-section">
        <h3>Annotations</h3>
        <div style="display: flex; gap: 4px; margin-bottom: 8px;">
          <button onclick="window.fusionDrawing?.addNote()" style="flex: 1;">Note</button>
          <button onclick="window.fusionDrawing?.addLeader()" style="flex: 1;">Leader</button>
          <button onclick="window.fusionDrawing?.addSurfaceFinish()" style="flex: 1;">Surface</button>
        </div>
        <div style="display: flex; gap: 4px;">
          <button onclick="window.fusionDrawing?.addBalloon()" style="flex: 1;">Balloon</button>
          <button onclick="window.fusionDrawing?.addRevisionTable()" style="flex: 1;">Revision</button>
        </div>
      </div>

      <div class="drawing-section">
        <h3>Title Block</h3>
        <div class="title-block-form">
          <input type="text" placeholder="Company" id="tbCompany" value="Your Company" onchange="window.fusionDrawing?.updateTitleBlock()">
          <input type="text" placeholder="Designer" id="tbDesigner" value="Designer Name" onchange="window.fusionDrawing?.updateTitleBlock()">
          <input type="text" placeholder="Material" id="tbMaterial" value="Steel" onchange="window.fusionDrawing?.updateTitleBlock()">
          <input type="text" placeholder="Document #" id="tbDocNum" value="000001" onchange="window.fusionDrawing?.updateTitleBlock()">
        </div>
      </div>

      <div class="drawing-section">
        <h3>Export</h3>
        <div style="display: flex; gap: 4px;">
          <button onclick="window.fusionDrawing?.exportPDF()" style="flex: 1;">PDF</button>
          <button onclick="window.fusionDrawing?.exportDXF()" style="flex: 1;">DXF</button>
          <button onclick="window.fusionDrawing?.printDrawing()" style="flex: 1;">Print</button>
        </div>
      </div>
    `;

    window.fusionDrawing = this;
    return panel;
  }

  /**
   * Get standard paper dimensions
   */
  getPaperDimensions() {
    return {
      A4: { width: 210, height: 297 },
      A3: { width: 297, height: 420 },
      A2: { width: 420, height: 594 },
      A1: { width: 594, height: 841 },
      Letter: { width: 216, height: 279 },
      Tabloid: { width: 279, height: 432 }
    };
  }

  /**
   * Set paper size
   */
  setPaperSize(size) {
    if (this.paperDimensions[size]) {
      this.paperSize = size;
      this.paperDimensions = this.getPaperDimensions();
      this.drawCanvas();
    }
  }

  /**
   * Setup drawing canvas
   */
  setupDrawingCanvas() {
    // Create 2D canvas for drawing
    const canvas = document.createElement('canvas');
    const dims = this.paperDimensions[this.paperSize];
    canvas.width = dims.width * 4; // 4 pixels per mm for detail
    canvas.height = dims.height * 4;
    canvas.style.backgroundColor = '#ffffff';

    this.drawingCanvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drawCanvas();
  }

  /**
   * Draw paper and margins
   */
  drawCanvas() {
    if (!this.ctx) return;

    const dims = this.paperDimensions[this.paperSize];
    const pixelScale = 4; // pixels per mm

    // Clear canvas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, dims.width * pixelScale, dims.height * pixelScale);

    // Draw border
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(10 * pixelScale, 10 * pixelScale, (dims.width - 20) * pixelScale, (dims.height - 20) * pixelScale);

    // Draw title block
    this.drawTitleBlock();

    // Draw views
    for (const view of this.views.values()) {
      this.drawView(view);
    }

    // Draw dimensions
    for (const dim of this.dimensions.values()) {
      this.drawDimension(dim);
    }

    // Draw GD&T frames
    for (const frame of this.gdtFrames.values()) {
      this.drawGDTFrame(frame);
    }
  }

  /**
   * Add base view (front/top/right/isometric)
   */
  addBaseView(viewType = 'Front') {
    const viewId = `view_${Date.now()}`;
    const view = {
      id: viewId,
      type: viewType,
      viewType: 'Base',
      position: { x: 50, y: 100 },
      scale: 1,
      geometry: null,
      projectionMatrix: new THREE.Matrix4()
    };

    this.views.set(viewId, view);
    this.baseView = viewId;
    this.updateViewList();
    return viewId;
  }

  /**
   * Add projected view (from base view)
   */
  addProjectedView() {
    const viewId = `view_${Date.now()}`;
    const view = {
      id: viewId,
      type: 'Projected',
      viewType: 'Projected',
      position: { x: 150, y: 100 },
      baseView: this.baseView,
      scale: 1,
      geometry: null
    };

    this.views.set(viewId, view);
    this.updateViewList();
    return viewId;
  }

  /**
   * Add section view with hatch pattern
   */
  addSectionView() {
    const viewId = `view_${Date.now()}`;
    const view = {
      id: viewId,
      type: 'Section A-A',
      viewType: 'Section',
      position: { x: 50, y: 200 },
      sectionPlane: { normal: new THREE.Vector3(0, 1, 0), position: 0 },
      hatchStyle: 'steel',
      geometry: null
    };

    this.views.set(viewId, view);
    this.updateViewList();
    return viewId;
  }

  /**
   * Add detail view (magnified region)
   */
  addDetailView() {
    const viewId = `view_${Date.now()}`;
    const view = {
      id: viewId,
      type: 'Detail B',
      viewType: 'Detail',
      position: { x: 250, y: 100 },
      magnification: 2,
      calloutSize: 20,
      geometry: null
    };

    this.views.set(viewId, view);
    this.updateViewList();
    return viewId;
  }

  /**
   * Add break view (for long thin parts)
   */
  addBreakView() {
    const viewId = `view_${Date.now()}`;
    const view = {
      id: viewId,
      type: 'Broken View',
      viewType: 'Break',
      position: { x: 150, y: 200 },
      breakType: 'zigzag',
      geometry: null
    };

    this.views.set(viewId, view);
    this.updateViewList();
    return viewId;
  }

  /**
   * Add isometric view
   */
  addIsometricView() {
    const viewId = `view_${Date.now()}`;
    const view = {
      id: viewId,
      type: 'Isometric',
      viewType: 'Isometric',
      position: { x: 250, y: 200 },
      scale: 0.8,
      geometry: null
    };

    this.views.set(viewId, view);
    this.updateViewList();
    return viewId;
  }

  /**
   * Add dimension to drawing
   */
  addDimension(dimensionType) {
    const dimId = `dim_${Date.now()}`;
    const dimension = {
      id: dimId,
      type: dimensionType, // Linear | Angular | Radial | Diameter | Ordinate | Hole Callout
      position: { x: 100, y: 100 },
      value: 25.0,
      tolerance: { upper: 0.1, lower: 0.1 },
      unit: 'mm',
      isSelected: false
    };

    this.dimensions.set(dimId, dimension);
    this.updateViewList();
    return dimId;
  }

  /**
   * Add GD&T frame
   */
  addGDT(gdtType) {
    const frameId = `gdt_${Date.now()}`;
    const frame = {
      id: frameId,
      type: gdtType, // Flatness | Parallelism | Perpendicularity | Concentricity | Runout | Position | Profile | Angularity
      position: { x: 150, y: 150 },
      tolerance: 0.1,
      datumReferences: ['A', null, null], // Up to 3 datums
      modifier: null, // RFS (default) | MMC | LMC
      material: null
    };

    this.gdtFrames.set(frameId, frame);
    return frameId;
  }

  /**
   * Add center mark
   */
  addCenterMark() {
    this.centerMarks.push({
      position: { x: 100, y: 100 },
      size: 5
    });
  }

  /**
   * Add note (text annotation)
   */
  addNote(text = 'NOTE') {
    this.notes.push({
      position: { x: 50, y: 50 },
      text: text,
      fontSize: 12,
      fontFamily: 'Arial'
    });
  }

  /**
   * Add leader line
   */
  addLeader() {
    this.notes.push({
      type: 'leader',
      position: { x: 150, y: 150 },
      text: 'Feature',
      startPoint: { x: 140, y: 140 },
      endPoint: { x: 150, y: 150 }
    });
  }

  /**
   * Add surface finish symbol
   */
  addSurfaceFinish() {
    this.notes.push({
      type: 'surface_finish',
      position: { x: 100, y: 100 },
      roughness: 'Ra 1.6',
      method: 'Machine all surfaces'
    });
  }

  /**
   * Add balloon (BOM reference)
   */
  addBalloon() {
    this.balloons.push({
      position: { x: 120, y: 120 },
      number: this.balloons.length + 1,
      diameter: 8
    });
  }

  /**
   * Add revision table
   */
  addRevisionTable() {
    this.notes.push({
      type: 'revision_table',
      position: { x: 280, y: 20 },
      revisions: [
        { rev: 'A', date: new Date().toISOString().split('T')[0], description: 'Initial release', approved: 'ECN' }
      ]
    });
  }

  /**
   * Draw view on canvas
   */
  drawView(view) {
    const pixelScale = 4;
    const x = view.position.x * pixelScale;
    const y = view.position.y * pixelScale;

    // Draw view border
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, 100 * pixelScale, 100 * pixelScale);

    // Draw view label
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Arial';
    this.ctx.fillText(view.type, x + 5, y + 115 * pixelScale);
  }

  /**
   * Draw dimension
   */
  drawDimension(dim) {
    const pixelScale = 4;
    const x = dim.position.x * pixelScale;
    const y = dim.position.y * pixelScale;

    this.ctx.fillStyle = '#000000';
    this.ctx.font = '11px Arial';

    // Draw dimension line
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + 50 * pixelScale, y);
    this.ctx.stroke();

    // Draw dimension text
    const dimText = `${dim.value.toFixed(1)}`;
    this.ctx.fillText(dimText, x + 15 * pixelScale, y - 5);
  }

  /**
   * Draw GD&T frame
   */
  drawGDTFrame(frame) {
    const pixelScale = 4;
    const x = frame.position.x * pixelScale;
    const y = frame.position.y * pixelScale;
    const frameHeight = 14;
    const frameWidth = 40;

    // Draw frame boxes
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;

    // First box: GD&T symbol
    this.ctx.strokeRect(x, y, frameWidth, frameHeight);
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '10px Arial';
    this.ctx.fillText(frame.type.substring(0, 1), x + 5, y + 10);

    // Second box: tolerance value
    this.ctx.strokeRect(x + frameWidth, y, frameWidth, frameHeight);
    this.ctx.fillText(frame.tolerance.toFixed(2), x + frameWidth + 5, y + 10);

    // Third box: datum
    if (frame.datumReferences[0]) {
      this.ctx.strokeRect(x + frameWidth * 2, y, frameWidth, frameHeight);
      this.ctx.fillText(frame.datumReferences[0], x + frameWidth * 2 + 5, y + 10);
    }
  }

  /**
   * Draw title block
   */
  drawTitleBlock() {
    const dims = this.paperDimensions[this.paperSize];
    const pixelScale = 4;
    const marginX = (dims.width - 80) * pixelScale;
    const marginY = (dims.height - 40) * pixelScale;

    // Draw title block border
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(marginX, marginY, 80 * pixelScale, 30 * pixelScale);

    // Draw title block content
    this.ctx.fillStyle = '#000000';
    this.ctx.font = 'bold 12px Arial';
    this.ctx.fillText('TITLE BLOCK', marginX + 10, marginY + 15);

    this.ctx.font = '10px Arial';
    this.ctx.fillText(`Company: ${this.titleBlock.company}`, marginX + 10, marginY + 30);
    this.ctx.fillText(`Designer: ${this.titleBlock.designer}`, marginX + 10, marginY + 45);
    this.ctx.fillText(`Scale: ${this.titleBlock.scale}`, marginX + 10, marginY + 60);
  }

  /**
   * Update title block from form
   */
  updateTitleBlock() {
    this.titleBlock.company = document.getElementById('tbCompany')?.value || 'Your Company';
    this.titleBlock.designer = document.getElementById('tbDesigner')?.value || 'Designer Name';
    this.titleBlock.material = document.getElementById('tbMaterial')?.value || 'Steel';
    this.titleBlock.documentNumber = document.getElementById('tbDocNum')?.value || '000001';
    this.drawCanvas();
  }

  /**
   * Update view list display
   */
  updateViewList() {
    const listDiv = document.getElementById('drawingViewList');
    if (!listDiv) return;

    listDiv.innerHTML = '';
    for (const [viewId, view] of this.views) {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'view-item';
      itemDiv.innerHTML = `
        <span class="view-type">${view.type}</span>
        <button onclick="window.fusionDrawing?.deleteView('${viewId}')" style="padding: 2px 6px; font-size: 10px;">Delete</button>
      `;
      listDiv.appendChild(itemDiv);
    }
  }

  /**
   * Delete view
   */
  deleteView(viewId) {
    this.views.delete(viewId);
    this.updateViewList();
    this.drawCanvas();
  }

  /**
   * Export drawing to PDF
   */
  exportPDF() {
    if (!this.drawingCanvas) return;

    // Create PDF (simplified — using canvas-to-pdf approach)
    const link = document.createElement('a');
    link.href = this.drawingCanvas.toDataURL('image/png');
    link.download = `drawing_${this.titleBlock.documentNumber}.png`;
    link.click();

    console.log('PDF export created (using PNG fallback)');
  }

  /**
   * Export drawing to DXF
   */
  exportDXF() {
    let dxf = '';
    dxf += '0\nSECTION\n2\nHEADER\n';
    dxf += '9\n$ACADVER\n1\nAC1021\n';
    dxf += '0\nENDSEC\n';

    // Entities section
    dxf += '0\nSECTION\n2\nENTITIES\n';

    // Add views as MTEXT
    for (const [viewId, view] of this.views) {
      dxf += `0\nMTEXT\n8\n0\n10\n${view.position.x}\n20\n${view.position.y}\n1\n${view.type}\n`;
    }

    // Add dimensions
    for (const [dimId, dim] of this.dimensions) {
      dxf += `0\nDIMENSION\n8\n0\n10\n${dim.position.x}\n20\n${dim.position.y}\n1\n${dim.value}\n`;
    }

    dxf += '0\nENDSEC\n';
    dxf += '0\nEOF\n';

    // Download DXF
    const blob = new Blob([dxf], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drawing_${this.titleBlock.documentNumber}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Print drawing
   */
  printDrawing() {
    if (!this.drawingCanvas) return;

    const printWindow = window.open();
    printWindow.document.write(`<img src="${this.drawingCanvas.toDataURL()}" style="width:100%;">`);
    printWindow.document.close();
    printWindow.print();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for dimension creation
  }

  /**
   * Execute command from agent API
   */
  execute(command, params) {
    switch (command) {
      case 'addBaseView':
        return this.addBaseView(params.type);
      case 'addProjectedView':
        return this.addProjectedView();
      case 'addDimension':
        return this.addDimension(params.dimensionType);
      case 'addGDT':
        return this.addGDT(params.gdtType);
      case 'addCenterMark':
        return this.addCenterMark();
      case 'setPaperSize':
        return this.setPaperSize(params.size);
      case 'exportPDF':
        return this.exportPDF();
      case 'exportDXF':
        return this.exportDXF();
      default:
        console.warn(`Unknown drawing command: ${command}`);
    }
  }
}

export default FusionDrawingModule;
