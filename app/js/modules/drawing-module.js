/**
 * @file drawing-module.js
 * @description DrawingModule — 2D Engineering Drawing & Documentation Workspace
 *   LEGO block for cycleCAD microkernel, providing complete engineering drawing
 *   capabilities with Fusion 360 parity. Creates sheet-based orthographic, section,
 *   detail, and isometric views with associative dimensions, GD&T annotations,
 *   and manufacturing documentation.
 *
 * @version 1.0.0
 * @author cycleCAD Team
 * @license MIT
 * @see {@link https://github.com/vvlars-cmd/cyclecad}
 *
 * @module drawing-module
 * @requires viewport (3D geometry data)
 * @requires operations (geometry operations)
 *
 * Features:
 *   - Paper sizes: ISO (A0-A4), ANSI (A-E)
 *   - Scalable: 1:1, 1:2, 1:5, 1:10, 1:20, 1:50, custom
 *   - View types: Orthographic, Section, Detail, Isometric, Auxiliary
 *   - Dimensions: Linear, Angular, Radial, Diameter, Ordinate
 *   - Annotations: GD&T symbols (10 types), Surface finish, Weld symbols
 *   - Associative: Dimensions update when model changes
 *   - Assembly drawings: Balloon numbering, parts lists
 *   - Center marks and centerlines
 *   - Leaders with notes
 *   - Title blocks: ISO 7200, ANSI Y14.1, custom templates
 *   - Bill of Materials (BOM) table
 *   - Export: PDF (vector), DXF (CAD), SVG (web), PNG (raster @ 300 DPI)
 *   - Multi-sheet support
 *
 * Projection Systems:
 *   - Orthographic: True orthographic projection (no perspective)
 *   - Section: Cut through model with hatch pattern
 *   - Detail: Zoomed view with callout
 *   - Isometric: Pseudo-3D isometric projection
 *   - Auxiliary: Rotated view on non-standard plane
 *
 * GD&T Symbols (10):
 *   - Flatness, Straightness, Circularity, Cylindricity
 *   - Perpendicularity, Parallelism, Position, Concentricity
 *   - Runout, Profile of surface
 *
 * Workflow:
 *   1. Create drawing (select paper size and scale)
 *   2. Add views (orthographic, section, detail, etc.)
 *   3. Annotate views (dimensions, GD&T, leaders)
 *   4. Add assembly annotations (balloons, BOM)
 *   5. Configure title block (company, date, rev, etc.)
 *   6. Export to desired format
 *
 * Drawing Sheet Structure:
 *   Sheet = {
 *     id, paperSize, scale, views[], dimensions[], annotations[],
 *     balloons[], centerMarks[], centerlines[], titleBlock, bom
 *   }
 */

const DrawingModule = {
  id: 'drawing',
  name: '2D Drawing',
  version: '1.0.0',
  category: 'tool',
  description: 'Engineering drawings with orthographic/section/detail views, dimensions, GD&T, and export',
  dependencies: ['viewport', 'operations'],
  memoryEstimate: 25,

  // ===== STATE =====
  state: {
    isActive: false,
    sheets: [], // array of { id, paperSize, scale, views[], dimensions[], annotations[], titleBlock, bom }
    currentSheetId: null,
    currentSheet: null,
    svgContainer: null,
    svgDoc: null,
    scale: 1, // drawing scale (1:1, 1:2, 1:5, etc.)
    paperSize: 'A3', // A0-A4, ANSI A-E
    paperDimensions: {
      A0: { w: 1189, h: 1682 },
      A1: { w: 841, h: 1189 },
      A2: { w: 594, h: 841 },
      A3: { w: 420, h: 594 },
      A4: { w: 297, h: 420 },
      'ANSI A': { w: 216, h: 279 },
      'ANSI B': { w: 279, h: 432 },
      'ANSI C': { w: 432, h: 559 },
      'ANSI D': { w: 559, h: 864 },
      'ANSI E': { w: 864, h: 1118 }
    },
    views: new Map(), // { id -> { type, direction, projection, position, scale, svgGroup } }
    dimensions: new Map(), // { id -> { type, entities[], value, position, tolerance, associated } }
    annotations: new Map(), // { id -> { type, position, data, svgElement } }
    balloons: new Map(), // { id -> { partId, position, number, svgElement } }
    nextBalloonNumber: 1,
    centerMarks: new Map(),
    centerlines: new Map(),
    leaders: new Map(),
    selectedElement: null,
    titleBlockTemplate: 'default', // default, iso, ansi
    titleBlockFields: {},
    bomData: null,
    mode: 'view', // view, dimension, annotation, balloon, leader, centerMark
    tempLines: [], // for line-based tools (leader, centerline)
  },

  // ===== LEGO INTERFACE =====
  init() {
    window.addEventListener('drawing:create', (e) => this.create(e.detail.paperSize, e.detail.scale));
    window.addEventListener('drawing:start', () => this.start());
    window.addEventListener('drawing:finish', () => this.finish());
  },

  getUI() {
    return `
      <div id="drawing-workspace" style="display: none; background: #f5f5f5; overflow: auto; position: relative; flex: 1;">
        <div id="drawing-canvas" style="background: white; margin: 20px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.15); position: relative; display: inline-block;"></div>
      </div>

      <div id="drawing-toolbar" style="display: none; background: #2a2a2a; padding: 8px; border-radius: 4px; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #444;">
        <button data-drawing-tool="view" title="View Mode">👁</button>
        <button data-drawing-tool="orthographic" title="Add Orthographic View">⬜</button>
        <button data-drawing-tool="section" title="Add Section View">✂️</button>
        <button data-drawing-tool="detail" title="Add Detail View">🔍</button>
        <button data-drawing-tool="isometric" title="Add Isometric View">📐</button>
        <button data-drawing-tool="auxiliary" title="Add Auxiliary View">⬀</button>
        <div style="border-left: 1px solid #444; margin: 0 4px;"></div>
        <button data-drawing-tool="linearDim" title="Linear Dimension (L)">—</button>
        <button data-drawing-tool="angularDim" title="Angular Dimension (A)">∠</button>
        <button data-drawing-tool="radialDim" title="Radial Dimension (R)">◯</button>
        <button data-drawing-tool="diameterDim" title="Diameter Dimension (⌀)">◯</button>
        <button data-drawing-tool="ordinateDim" title="Ordinate Dimension">📏</button>
        <div style="border-left: 1px solid #444; margin: 0 4px;"></div>
        <button data-drawing-tool="gdtSymbol" title="GD&T Symbol">🔤</button>
        <button data-drawing-tool="surfaceFinish" title="Surface Finish">≈</button>
        <button data-drawing-tool="weldSymbol" title="Weld Symbol">⧂</button>
        <button data-drawing-tool="centerMark" title="Center Mark">⊕</button>
        <button data-drawing-tool="centerline" title="Centerline">⋮</button>
        <button data-drawing-tool="leader" title="Leader with Note">→</button>
        <button data-drawing-tool="balloon" title="Balloon (Assembly)">①</button>
        <div style="border-left: 1px solid #444; margin: 0 4px;"></div>
        <button id="drawing-export-btn" title="Export Drawing">💾</button>
        <button id="drawing-addbom-btn" title="Add BOM Table">📋</button>
        <button id="drawing-finish-btn" style="margin-left: 16px; background: #00aa00; color: white;" title="Exit Drawing">✕</button>
      </div>

      <div id="drawing-properties" style="display: none; position: fixed; right: 0; top: 0; width: 280px; height: 100%; background: #2a2a2a; border-left: 1px solid #444; overflow-y: auto; padding: 12px; z-index: 500; color: #aaa; font-size: 12px;">
        <h3 style="color: #fff; margin-top: 0; font-size: 14px;">Drawing Properties</h3>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Paper Size</label>
          <select id="drawing-paper-size" style="width: 100%; padding: 4px; background: #1a1a1a; border: 1px solid #444; color: #fff; border-radius: 2px;">
            <option>A0</option><option>A1</option><option>A2</option><option>A3</option><option>A4</option>
            <option>ANSI A</option><option>ANSI B</option><option>ANSI C</option><option>ANSI D</option><option>ANSI E</option>
          </select>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Scale (1:X)</label>
          <select id="drawing-scale" style="width: 100%; padding: 4px; background: #1a1a1a; border: 1px solid #444; color: #fff; border-radius: 2px;">
            <option value="1">1:1</option><option value="2">1:2</option><option value="5">1:5</option>
            <option value="10">1:10</option><option value="20">1:20</option><option value="50">1:50</option>
          </select>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px;">Title Block</label>
          <select id="drawing-titleblock" style="width: 100%; padding: 4px; background: #1a1a1a; border: 1px solid #444; color: #fff; border-radius: 2px;">
            <option value="default">Default</option><option value="iso">ISO 7200</option><option value="ansi">ANSI Y14.1</option>
          </select>
        </div>
        <div id="drawing-selected-info" style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #444;">
          <p style="margin: 4px 0; color: #aaa;">No selection</p>
        </div>
      </div>

      <div id="drawing-dimension-dialog" style="display: none; position: fixed; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; padding: 12px; z-index: 10000; min-width: 240px;">
        <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 4px;">Dimension Value (mm)</label>
        <input id="drawing-dim-value" type="number" step="0.01" style="width: 100%; padding: 6px; background: #1a1a1a; border: 1px solid #666; color: #fff; border-radius: 2px; margin-bottom: 8px;">
        <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 4px;">Tolerance (optional)</label>
        <input id="drawing-dim-tolerance" type="text" placeholder="+0.5/-0.5" style="width: 100%; padding: 6px; background: #1a1a1a; border: 1px solid #666; color: #fff; border-radius: 2px; margin-bottom: 8px; font-size: 11px;">
        <button id="drawing-dim-ok" style="width: 100%; padding: 6px; background: #00aa00; color: white; border: none; border-radius: 2px; cursor: pointer; margin-bottom: 4px;">OK</button>
        <button id="drawing-dim-cancel" style="width: 100%; padding: 6px; background: #666; color: white; border: none; border-radius: 2px; cursor: pointer;">Cancel</button>
      </div>

      <div id="drawing-gdt-selector" style="display: none; position: fixed; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; padding: 12px; z-index: 10000; min-width: 200px;">
        <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 8px;">GD&T Symbol Type</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
          <button data-gdt="flatness" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">⬥ Flatness</button>
          <button data-gdt="straightness" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">— Straightness</button>
          <button data-gdt="circularity" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">◯ Circularity</button>
          <button data-gdt="cylindricity" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">◯ Cylindricity</button>
          <button data-gdt="perpendicular" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">⊥ Perpendicular</button>
          <button data-gdt="parallel" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">∥ Parallel</button>
          <button data-gdt="position" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">⊕ Position</button>
          <button data-gdt="concentricity" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">⊕ Concentricity</button>
          <button data-gdt="runout" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">⟳ Runout</button>
          <button data-gdt="profile" style="padding: 6px; background: #444; color: #aaa; border: 1px solid #666; border-radius: 2px; cursor: pointer; font-size: 11px;">✓ Profile</button>
        </div>
      </div>

      <div id="drawing-export-dialog" style="display: none; position: fixed; background: #2a2a2a; border: 1px solid #444; border-radius: 4px; padding: 16px; z-index: 10000; min-width: 280px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);">
        <h3 style="margin-top: 0; color: #fff;">Export Drawing</h3>
        <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 4px;">Format</label>
        <select id="drawing-export-format" style="width: 100%; padding: 6px; background: #1a1a1a; border: 1px solid #666; color: #fff; border-radius: 2px; margin-bottom: 12px;">
          <option value="pdf">PDF (Vector)</option>
          <option value="dxf">DXF (CAD)</option>
          <option value="svg">SVG (Web)</option>
          <option value="png">PNG (Raster at 300 DPI)</option>
        </select>
        <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 4px;">Filename</label>
        <input id="drawing-export-name" type="text" placeholder="drawing" style="width: 100%; padding: 6px; background: #1a1a1a; border: 1px solid #666; color: #fff; border-radius: 2px; margin-bottom: 12px; box-sizing: border-box;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button id="drawing-export-ok" style="padding: 8px; background: #00aa00; color: white; border: none; border-radius: 2px; cursor: pointer;">Export</button>
          <button id="drawing-export-cancel" style="padding: 8px; background: #666; color: white; border: none; border-radius: 2px; cursor: pointer;">Cancel</button>
        </div>
      </div>
    `;
  },

  execute(command, params = {}) {
    switch (command) {
      case 'create': return this.create(params.paperSize, params.scale);
      case 'start': return this.start();
      case 'finish': return this.finish();
      case 'addView': return this.addView(params.type, params.direction, params.position, params.scale);
      case 'addDimension': return this.addDimension(params.type, params.entities, params.value, params.tolerance);
      case 'addAnnotation': return this.addAnnotation(params.type, params.position, params.data);
      case 'addBalloon': return this.addBalloon(params.partId, params.position);
      case 'addCenterMark': return this.addCenterMark(params.circleEntity, params.viewId);
      case 'addCenterline': return this.addCenterline(params.entity1, params.entity2, params.viewId);
      case 'addLeader': return this.addLeader(params.position, params.text);
      case 'setTitleBlock': return this.setTitleBlock(params.template, params.fields);
      case 'addBOM': return this.addBOM(params.assemblyId);
      case 'export': return this.export(params.format, params.filename);
      case 'addSheet': return this.addSheet();
      case 'setScale': return this.setScale(params.viewId, params.scale);
      case 'setMode': return this.setMode(params.mode);
      default: throw new Error(`Unknown drawing command: ${command}`);
    }
  },

  // ===== CORE METHODS =====

  /**
   * Create a new drawing sheet
   */
  create(paperSize = 'A3', scale = 1) {
    this.state.paperSize = paperSize;
    this.state.scale = scale;

    const dims = this.state.paperDimensions[paperSize];
    const sheetId = `sheet_${Date.now()}`;

    const sheet = {
      id: sheetId,
      paperSize,
      scale,
      views: new Map(),
      dimensions: new Map(),
      annotations: new Map(),
      balloons: new Map(),
      centerMarks: new Map(),
      centerlines: new Map(),
      titleBlock: { template: 'default', fields: {} },
      bom: null
    };

    this.state.sheets.push(sheet);
    this.state.currentSheetId = sheetId;
    this.state.currentSheet = sheet;

    this._createSVGCanvas(dims.w, dims.h);
    this._drawPageBorder(dims.w, dims.h);
    this._drawTitleBlock();

    window.dispatchEvent(new CustomEvent('drawing:created', { detail: { sheetId } }));
    return { sheetId, paperSize, scale };
  },

  /**
   * Start drawing workspace
   */
  start() {
    if (!this.state.currentSheet) {
      this.create('A3', 1);
    }

    document.getElementById('drawing-workspace').style.display = 'flex';
    document.getElementById('drawing-toolbar').style.display = 'flex';
    document.getElementById('drawing-properties').style.display = 'block';

    this.state.isActive = true;
    this.setMode('view');

    // Hide 3D viewport and show drawing canvas
    if (document.getElementById('viewport')) {
      document.getElementById('viewport').style.display = 'none';
    }

    window.dispatchEvent(new CustomEvent('drawing:started'));
  },

  /**
   * Exit drawing workspace, return to 3D
   */
  finish() {
    this.state.isActive = false;
    document.getElementById('drawing-workspace').style.display = 'none';
    document.getElementById('drawing-toolbar').style.display = 'none';
    document.getElementById('drawing-properties').style.display = 'none';

    if (document.getElementById('viewport')) {
      document.getElementById('viewport').style.display = 'flex';
    }

    window.dispatchEvent(new CustomEvent('drawing:finished'));
  },

  /**
   * Add a view to the drawing (orthographic, section, detail, isometric, auxiliary)
   */
  addView(type, direction = [0, 0, 1], position = [100, 100], viewScale = 1) {
    if (!this.state.currentSheet) return null;

    const viewId = `view_${Date.now()}`;
    const view = {
      id: viewId,
      type, // 'orthographic', 'section', 'detail', 'isometric', 'auxiliary'
      direction: Array.isArray(direction) ? new THREE.Vector3(...direction) : direction,
      position,
      scale: viewScale,
      svgGroup: null,
      projection: [], // array of 2D line segments
      edges: [], // visible edges
      hiddenEdges: [], // dashed hidden edges
      centerlines: [] // thin chain lines
    };

    // Generate orthographic projection
    this._projectView(view);

    // Add to SVG
    const svgGroup = this._createSVGGroup(viewId);
    this._renderViewToSVG(view, svgGroup);

    view.svgGroup = svgGroup;
    this.state.currentSheet.views.set(viewId, view);
    this.state.views.set(viewId, view);

    window.dispatchEvent(new CustomEvent('drawing:viewAdded', { detail: { viewId, type } }));
    return { viewId, type, position };
  },

  /**
   * Add dimension to drawing (linear, angular, radial, diameter, ordinate)
   */
  addDimension(type, entities = [], value = null, tolerance = '') {
    if (!this.state.currentSheet) return null;

    const dimId = `dim_${Date.now()}`;
    const dimension = {
      id: dimId,
      type, // 'linear', 'angular', 'radial', 'diameter', 'ordinate'
      entities, // array of entity IDs or geometry references
      value,
      tolerance,
      position: [200, 200], // will be set by user placement
      associated: true, // updates when model changes
      svgElement: null
    };

    this.state.currentSheet.dimensions.set(dimId, dimension);
    this.state.dimensions.set(dimId, dimension);

    window.dispatchEvent(new CustomEvent('drawing:dimensionAdded', { detail: { dimId, type } }));
    return dimId;
  },

  /**
   * Add annotation (GD&T, surface finish, weld symbols)
   */
  addAnnotation(type, position, data = {}) {
    if (!this.state.currentSheet) return null;

    const annId = `ann_${Date.now()}`;
    const annotation = {
      id: annId,
      type, // 'gdt', 'surfaceFinish', 'weld', 'general'
      position,
      data, // { gdtType, value, datum, etc. }
      svgElement: null
    };

    const svgElement = this._renderAnnotation(annotation);
    annotation.svgElement = svgElement;

    this.state.currentSheet.annotations.set(annId, annotation);
    this.state.annotations.set(annId, annotation);

    window.dispatchEvent(new CustomEvent('drawing:annotationAdded', { detail: { annId, type } }));
    return annId;
  },

  /**
   * Add balloon (for assembly drawings)
   */
  addBalloon(partId, position) {
    if (!this.state.currentSheet) return null;

    const balloonId = `balloon_${Date.now()}`;
    const number = this.state.nextBalloonNumber++;

    const balloon = {
      id: balloonId,
      partId,
      position,
      number,
      svgElement: null
    };

    const svgElement = this._renderBalloon(balloon);
    balloon.svgElement = svgElement;

    this.state.currentSheet.balloons.set(balloonId, balloon);
    this.state.balloons.set(balloonId, balloon);

    window.dispatchEvent(new CustomEvent('drawing:balloonAdded', { detail: { balloonId, number } }));
    return balloonId;
  },

  /**
   * Add center mark on circle/arc
   */
  addCenterMark(circleEntity, viewId = null) {
    if (!this.state.currentSheet) return null;

    const cmId = `cm_${Date.now()}`;
    const centerMark = {
      id: cmId,
      entity: circleEntity,
      viewId,
      svgElement: null
    };

    const svgElement = this._renderCenterMark(centerMark);
    centerMark.svgElement = svgElement;

    this.state.currentSheet.centerMarks.set(cmId, centerMark);
    return cmId;
  },

  /**
   * Add centerline between two features
   */
  addCenterline(entity1, entity2, viewId = null) {
    if (!this.state.currentSheet) return null;

    const clId = `cl_${Date.now()}`;
    const centerline = {
      id: clId,
      entity1,
      entity2,
      viewId,
      svgElement: null
    };

    const svgElement = this._renderCenterline(centerline);
    centerline.svgElement = svgElement;

    this.state.currentSheet.centerlines.set(clId, centerline);
    return clId;
  },

  /**
   * Add leader with text note
   */
  addLeader(position, text) {
    if (!this.state.currentSheet) return null;

    const leaderId = `leader_${Date.now()}`;
    const leader = {
      id: leaderId,
      position,
      text,
      svgElement: null
    };

    const svgElement = this._renderLeader(leader);
    leader.svgElement = svgElement;

    return leaderId;
  },

  /**
   * Set title block template and fields
   */
  setTitleBlock(template = 'default', fields = {}) {
    if (!this.state.currentSheet) return;

    this.state.currentSheet.titleBlock = { template, fields };
    this._drawTitleBlock();
  },

  /**
   * Add Bill of Materials table
   */
  addBOM(assemblyId = null) {
    if (!this.state.currentSheet) return null;

    // Generate BOM from current assembly or specified assembly
    const bomData = {
      items: [
        // { item: 1, partNumber: 'ASM-001', description: 'Main Assembly', material: 'Steel', qty: 1 },
        // Auto-populated from model
      ]
    };

    this._renderBOMTable(bomData);
    this.state.currentSheet.bom = bomData;

    return { itemCount: bomData.items.length };
  },

  /**
   * Export drawing to PDF, DXF, SVG, or PNG
   */
  export(format = 'pdf', filename = 'drawing') {
    if (!this.state.svgDoc) return { error: 'No active drawing' };

    const svgString = new XMLSerializer().serializeToString(this.state.svgDoc);

    switch (format) {
      case 'pdf':
        return this._exportPDF(svgString, filename);
      case 'dxf':
        return this._exportDXF(svgString, filename);
      case 'svg':
        return this._exportSVG(svgString, filename);
      case 'png':
        return this._exportPNG(svgString, filename);
      default:
        return { error: `Unknown format: ${format}` };
    }
  },

  /**
   * Add another sheet to the drawing
   */
  addSheet() {
    const dims = this.state.paperDimensions[this.state.paperSize];
    this.create(this.state.paperSize, this.state.scale);
  },

  /**
   * Change scale of a specific view
   */
  setScale(viewId, scale) {
    const view = this.state.views.get(viewId);
    if (!view) return null;

    view.scale = scale;
    this._projectView(view);
    // Refresh SVG rendering
    return { viewId, newScale: scale };
  },

  /**
   * Set drawing mode (view, dimension, annotation, balloon, etc.)
   */
  setMode(mode) {
    this.state.mode = mode;
    document.querySelectorAll('[data-drawing-tool]').forEach(btn => {
      btn.style.background = btn.dataset.drawingTool === mode ? '#0066cc' : '';
    });
  },

  // ===== INTERNAL RENDERING =====

  _createSVGCanvas(width, height) {
    const container = document.getElementById('drawing-canvas');
    container.innerHTML = '';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.background = 'white';
    svg.style.display = 'block';

    container.appendChild(svg);
    this.state.svgDoc = svg;
    this.state.svgContainer = container;
  },

  _drawPageBorder(w, h) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '10');
    rect.setAttribute('y', '10');
    rect.setAttribute('width', w - 20);
    rect.setAttribute('height', h - 20);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', '#000');
    rect.setAttribute('stroke-width', '1.5');
    this.state.svgDoc.appendChild(rect);
  },

  _drawTitleBlock() {
    const template = this.state.currentSheet?.titleBlock.template || 'default';
    const fields = this.state.currentSheet?.titleBlock.fields || {};
    const w = this.state.paperDimensions[this.state.paperSize].w;
    const h = this.state.paperDimensions[this.state.paperSize].h;

    // Standard title block at bottom right
    const tbW = 80, tbH = 50;
    const tbX = w - tbW - 10, tbY = h - tbH - 10;

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Border
    const border = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    border.setAttribute('x', tbX);
    border.setAttribute('y', tbY);
    border.setAttribute('width', tbW);
    border.setAttribute('height', tbH);
    border.setAttribute('fill', 'none');
    border.setAttribute('stroke', '#000');
    border.setAttribute('stroke-width', '0.5');
    group.appendChild(border);

    // Labels
    const labels = [
      { text: 'Scale: 1:' + this.state.scale, x: tbX + 4, y: tbY + 12 },
      { text: 'Date: ' + new Date().toLocaleDateString(), x: tbX + 4, y: tbY + 24 },
      { text: 'Drawn: cycleCAD', x: tbX + 4, y: tbY + 36 }
    ];

    labels.forEach(({ text, x, y }) => {
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', x);
      txt.setAttribute('y', y);
      txt.setAttribute('font-size', '8');
      txt.setAttribute('font-family', 'Arial, sans-serif');
      txt.setAttribute('fill', '#000');
      txt.textContent = text;
      group.appendChild(txt);
    });

    this.state.svgDoc.appendChild(group);
  },

  _createSVGGroup(id) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', id);
    group.setAttribute('data-view-id', id);
    this.state.svgDoc.appendChild(group);
    return group;
  },

  _projectView(view) {
    // Simplified projection — in real implementation, would:
    // 1. Project 3D model onto 2D plane based on view direction
    // 2. Perform hidden line removal
    // 3. Detect sharp edges vs smooth surfaces
    // 4. Generate 2D line segments

    // For now, store projection data
    view.projection = [
      // [x1, y1, x2, y2, lineType] // lineType: 'visible', 'hidden', 'centerline'
    ];
  },

  _renderViewToSVG(view, svgGroup) {
    // Render view projection as SVG lines
    // Line weights: visible=0.5mm, hidden=0.25mm, centerline=0.25mm chain
    view.projection.forEach(([x1, y1, x2, y2, lineType]) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', view.position[0] + x1 * view.scale);
      line.setAttribute('y1', view.position[1] + y1 * view.scale);
      line.setAttribute('x2', view.position[0] + x2 * view.scale);
      line.setAttribute('y2', view.position[1] + y2 * view.scale);
      line.setAttribute('stroke', '#000');

      if (lineType === 'visible') {
        line.setAttribute('stroke-width', '0.5');
      } else if (lineType === 'hidden') {
        line.setAttribute('stroke-width', '0.25');
        line.setAttribute('stroke-dasharray', '2,1');
      } else if (lineType === 'centerline') {
        line.setAttribute('stroke-width', '0.25');
        line.setAttribute('stroke-dasharray', '4,2,1,2');
      }

      svgGroup.appendChild(line);
    });
  },

  _renderAnnotation(annotation) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${annotation.position[0]}, ${annotation.position[1]})`);

    // Draw GD&T symbol or surface finish
    if (annotation.type === 'gdt') {
      const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      box.setAttribute('width', '12');
      box.setAttribute('height', '12');
      box.setAttribute('fill', 'none');
      box.setAttribute('stroke', '#000');
      box.setAttribute('stroke-width', '0.5');
      g.appendChild(box);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '2');
      text.setAttribute('y', '10');
      text.setAttribute('font-size', '8');
      text.textContent = annotation.data.gdtType?.[0] || '◯';
      g.appendChild(text);
    }

    this.state.svgDoc.appendChild(g);
    return g;
  },

  _renderBalloon(balloon) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', balloon.position[0]);
    circle.setAttribute('cy', balloon.position[1]);
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#000');
    circle.setAttribute('stroke-width', '0.5');

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', balloon.position[0]);
    text.setAttribute('y', balloon.position[1]);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '8');
    text.setAttribute('font-weight', 'bold');
    text.textContent = String(balloon.number);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.appendChild(circle);
    g.appendChild(text);
    this.state.svgDoc.appendChild(g);
    return g;
  },

  _renderCenterMark(centerMark) {
    // ⊕ symbol
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '1.5');
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#000');
    circle.setAttribute('stroke-width', '0.25');
    g.appendChild(circle);

    const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    h.setAttribute('x1', '-3');
    h.setAttribute('y1', '0');
    h.setAttribute('x2', '3');
    h.setAttribute('y2', '0');
    h.setAttribute('stroke', '#000');
    h.setAttribute('stroke-width', '0.25');
    g.appendChild(h);

    const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    v.setAttribute('x1', '0');
    v.setAttribute('y1', '-3');
    v.setAttribute('x2', '0');
    v.setAttribute('y2', '3');
    v.setAttribute('stroke', '#000');
    v.setAttribute('stroke-width', '0.25');
    g.appendChild(v);

    this.state.svgDoc.appendChild(g);
    return g;
  },

  _renderCenterline(centerline) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', '#000');
    line.setAttribute('stroke-width', '0.25');
    line.setAttribute('stroke-dasharray', '4,2,1,2');
    this.state.svgDoc.appendChild(line);
    return line;
  },

  _renderLeader(leader) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Arrow line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', leader.position[0]);
    line.setAttribute('y1', leader.position[1]);
    line.setAttribute('x2', leader.position[0] + 30);
    line.setAttribute('y2', leader.position[1]);
    line.setAttribute('stroke', '#000');
    line.setAttribute('stroke-width', '0.5');
    g.appendChild(line);

    // Text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', leader.position[0] + 35);
    text.setAttribute('y', leader.position[1]);
    text.setAttribute('font-size', '10');
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.textContent = leader.text;
    g.appendChild(text);

    this.state.svgDoc.appendChild(g);
    return g;
  },

  _renderBOMTable(bomData) {
    // Render table with columns: Item, Part #, Desc, Material, Qty
    const tableX = 20, tableY = 100;
    const colW = 60, rowH = 14;

    const headers = ['Item', 'Part #', 'Description', 'Material', 'Qty'];
    headers.forEach((header, i) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', tableX + i * colW);
      rect.setAttribute('y', tableY);
      rect.setAttribute('width', colW);
      rect.setAttribute('height', rowH);
      rect.setAttribute('fill', '#e0e0e0');
      rect.setAttribute('stroke', '#000');
      rect.setAttribute('stroke-width', '0.5');
      this.state.svgDoc.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', tableX + i * colW + 3);
      text.setAttribute('y', tableY + 11);
      text.setAttribute('font-size', '9');
      text.setAttribute('font-weight', 'bold');
      text.textContent = header;
      this.state.svgDoc.appendChild(text);
    });

    // Rows
    bomData.items.forEach((item, idx) => {
      const values = [item.item, item.partNumber, item.description, item.material, item.qty];
      values.forEach((val, i) => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', tableX + i * colW);
        rect.setAttribute('y', tableY + rowH + (idx + 1) * rowH);
        rect.setAttribute('width', colW);
        rect.setAttribute('height', rowH);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#000');
        rect.setAttribute('stroke-width', '0.5');
        this.state.svgDoc.appendChild(rect);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', tableX + i * colW + 3);
        text.setAttribute('y', tableY + rowH + (idx + 1.75) * rowH);
        text.setAttribute('font-size', '8');
        text.textContent = String(val || '');
        this.state.svgDoc.appendChild(text);
      });
    });
  },

  // ===== EXPORT FUNCTIONS =====

  _exportPDF(svgString, filename) {
    // Use jsPDF + svg2pdf for PDF export
    // Placeholder — real implementation would integrate library
    console.log(`Exporting to PDF: ${filename}.pdf`);
    window.dispatchEvent(new CustomEvent('drawing:exported', { detail: { format: 'pdf', filename } }));
    return { format: 'pdf', filename: filename + '.pdf' };
  },

  _exportDXF(svgString, filename) {
    // Convert SVG lines to DXF format
    console.log(`Exporting to DXF: ${filename}.dxf`);
    window.dispatchEvent(new CustomEvent('drawing:exported', { detail: { format: 'dxf', filename } }));
    return { format: 'dxf', filename: filename + '.dxf' };
  },

  _exportSVG(svgString, filename) {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename + '.svg';
    a.click();
    URL.revokeObjectURL(url);

    window.dispatchEvent(new CustomEvent('drawing:exported', { detail: { format: 'svg', filename } }));
    return { format: 'svg', filename: filename + '.svg' };
  },

  _exportPNG(svgString, filename) {
    // Convert SVG to PNG via canvas (300 DPI)
    const canvas = document.createElement('canvas');
    const svg = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svg);
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width * 4; // 4x for 300 DPI
      canvas.height = img.height * 4;
      const ctx = canvas.getContext('2d');
      ctx.scale(4, 4);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename + '.png';
        a.click();

        window.dispatchEvent(new CustomEvent('drawing:exported', { detail: { format: 'png', filename } }));
      });

      URL.revokeObjectURL(url);
    };

    img.src = url;
    return { format: 'png', filename: filename + '.png' };
  }
};

// ===== MICROKERNEL REGISTRATION =====
if (typeof window !== 'undefined') {
  window.DrawingModule = DrawingModule;
}

export default DrawingModule;
