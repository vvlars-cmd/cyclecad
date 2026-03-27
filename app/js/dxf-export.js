/**
 * DXF Export Module for cycleCAD
 *
 * Exports 2D sketches and 3D model projections to AutoCAD-compatible DXF files.
 * Supports ASCII DXF R12/R14 format for maximum compatibility.
 *
 * Usage:
 *   const dxfContent = exportSketchToDXF(sketchEntities, { units: 'mm', filename: 'part.dxf' });
 *   downloadDXF(dxfContent, 'part.dxf');
 *
 *   const dxfContent = exportProjectionToDXF(mesh, 'front', { hiddenLines: true });
 *   downloadDXF(dxfContent, 'projection.dxf');
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// DXF Constants & Utilities
// ============================================================================

const DXF_HEADER = {
  VERSION: 'AC1012',  // AutoCAD R13 (most compatible)
  INSUNITS: 4,        // 4 = millimeters
  EXTMIN: { x: 0, y: 0, z: 0 },
  EXTMAX: { x: 100, y: 100, z: 0 }
};

const DXF_LAYERS = {
  OUTLINE: { name: 'OUTLINE', color: 7, linetype: 'CONTINUOUS' },      // White
  HIDDEN: { name: 'HIDDEN', color: 2, linetype: 'HIDDEN' },             // Yellow/dashed
  CENTER: { name: 'CENTER', color: 1, linetype: 'CENTER' },             // Red/dash-dot
  DIMENSION: { name: 'DIMENSION', color: 3, linetype: 'CONTINUOUS' },   // Green
  BORDER: { name: 'BORDER', color: 7, linetype: 'CONTINUOUS' },         // White
  MODEL: { name: '0', color: 7, linetype: 'CONTINUOUS' }                // Default layer
};

const DXF_COLORS = {
  WHITE: 7,
  YELLOW: 2,
  RED: 1,
  GREEN: 3,
  BLUE: 5,
  MAGENTA: 6,
  CYAN: 4
};

// ============================================================================
// DXF Section Builders
// ============================================================================

/**
 * Build DXF HEADER section
 * @param {Object} extents - { min: {x,y,z}, max: {x,y,z} }
 * @returns {string} DXF header text
 */
function buildHeaderSection(extents) {
  const lines = [];
  lines.push('  0');
  lines.push('SECTION');
  lines.push('  2');
  lines.push('HEADER');

  // DXF version
  lines.push('  9');
  lines.push('$ACADVER');
  lines.push('  1');
  lines.push('AC1014');  // R14 format

  // Drawing extents
  lines.push('  9');
  lines.push('$EXTMIN');
  lines.push(' 10');
  lines.push(formatNumber(extents.min.x));
  lines.push(' 20');
  lines.push(formatNumber(extents.min.y));

  lines.push('  9');
  lines.push('$EXTMAX');
  lines.push(' 10');
  lines.push(formatNumber(extents.max.x));
  lines.push(' 20');
  lines.push(formatNumber(extents.max.y));

  // Units in millimeters
  lines.push('  9');
  lines.push('$INSUNITS');
  lines.push(' 70');
  lines.push('4');

  // Default text height
  lines.push('  9');
  lines.push('$TEXTSIZE');
  lines.push(' 40');
  lines.push('2.5');

  lines.push('  0');
  lines.push('ENDSEC');

  return lines.join('\n');
}

/**
 * Build DXF TABLES section (layers, line types, text styles)
 * @returns {string} DXF tables text
 */
function buildTablesSection() {
  const lines = [];
  lines.push('  0');
  lines.push('SECTION');
  lines.push('  2');
  lines.push('TABLES');

  // VPORT table (required)
  lines.push('  0');
  lines.push('TABLE');
  lines.push('  2');
  lines.push('VPORT');
  lines.push(' 70');
  lines.push('1');
  lines.push('  0');
  lines.push('VPORT');
  lines.push('  2');
  lines.push('*ACTIVE');
  lines.push(' 70');
  lines.push('0');
  lines.push(' 10');
  lines.push('0.0');
  lines.push(' 20');
  lines.push('0.0');
  lines.push(' 11');
  lines.push('1.0');
  lines.push(' 21');
  lines.push('1.0');
  lines.push('  0');
  lines.push('ENDTAB');

  // LTYPE table (line types)
  lines.push('  0');
  lines.push('TABLE');
  lines.push('  2');
  lines.push('LTYPE');
  lines.push(' 70');
  lines.push('4');

  // CONTINUOUS
  lines.push('  0');
  lines.push('LTYPE');
  lines.push('  2');
  lines.push('CONTINUOUS');
  lines.push(' 70');
  lines.push('0');
  lines.push('  3');
  lines.push('Solid line');
  lines.push(' 72');
  lines.push('0');
  lines.push(' 73');
  lines.push('0');
  lines.push(' 40');
  lines.push('0.0');

  // HIDDEN (dashed)
  lines.push('  0');
  lines.push('LTYPE');
  lines.push('  2');
  lines.push('HIDDEN');
  lines.push(' 70');
  lines.push('0');
  lines.push('  3');
  lines.push('Hidden line');
  lines.push(' 72');
  lines.push('1');
  lines.push(' 73');
  lines.push('1');
  lines.push(' 40');
  lines.push('9.525');
  lines.push(' 49');
  lines.push('4.7625');
  lines.push(' 49');
  lines.push('-4.7625');

  // CENTER (dash-dot)
  lines.push('  0');
  lines.push('LTYPE');
  lines.push('  2');
  lines.push('CENTER');
  lines.push(' 70');
  lines.push('0');
  lines.push('  3');
  lines.push('Center line');
  lines.push(' 72');
  lines.push('1');
  lines.push(' 73');
  lines.push('2');
  lines.push(' 40');
  lines.push('20.0');
  lines.push(' 49');
  lines.push('12.5');
  lines.push(' 49');
  lines.push('-2.5');
  lines.push(' 49');
  lines.push('2.5');
  lines.push(' 49');
  lines.push('-2.5');

  lines.push('  0');
  lines.push('ENDTAB');

  // LAYER table
  lines.push('  0');
  lines.push('TABLE');
  lines.push('  2');
  lines.push('LAYER');
  lines.push(' 70');
  lines.push('6');

  Object.values(DXF_LAYERS).forEach(layer => {
    lines.push('  0');
    lines.push('LAYER');
    lines.push('  2');
    lines.push(layer.name);
    lines.push(' 70');
    lines.push('0');
    lines.push(' 62');
    lines.push(layer.color.toString());
    lines.push('  6');
    lines.push(layer.linetype);
  });

  lines.push('  0');
  lines.push('ENDTAB');

  // STYLE table
  lines.push('  0');
  lines.push('TABLE');
  lines.push('  2');
  lines.push('STYLE');
  lines.push(' 70');
  lines.push('1');
  lines.push('  0');
  lines.push('STYLE');
  lines.push('  2');
  lines.push('STANDARD');
  lines.push(' 70');
  lines.push('0');
  lines.push(' 40');
  lines.push('0.0');
  lines.push(' 41');
  lines.push('1.0');
  lines.push(' 50');
  lines.push('0.0');
  lines.push(' 71');
  lines.push('0');
  lines.push('  3');
  lines.push('txt');
  lines.push('  0');
  lines.push('ENDTAB');

  lines.push('  0');
  lines.push('ENDSEC');

  return lines.join('\n');
}

/**
 * Build DXF BLOCKS section
 * @returns {string} DXF blocks text
 */
function buildBlocksSection() {
  const lines = [];
  lines.push('  0');
  lines.push('SECTION');
  lines.push('  2');
  lines.push('BLOCKS');

  // Default block
  lines.push('  0');
  lines.push('BLOCK');
  lines.push('  8');
  lines.push('0');
  lines.push('  2');
  lines.push('*MODEL_SPACE');
  lines.push(' 70');
  lines.push('0');
  lines.push(' 10');
  lines.push('0.0');
  lines.push(' 20');
  lines.push('0.0');
  lines.push('  0');
  lines.push('ENDBLK');

  lines.push('  0');
  lines.push('ENDSEC');

  return lines.join('\n');
}

// ============================================================================
// Core Export Functions
// ============================================================================

/**
 * Export 2D sketch entities to DXF format
 *
 * @param {Array<Object>} entities - Sketch entities
 *   Each entity: { type: 'line'|'rectangle'|'circle'|'arc'|'polyline', points: [{x,y}...], dimensions: {} }
 * @param {Object} options - Export options
 *   @param {string} options.units - Unit system ('mm', 'in', 'cm') - default 'mm'
 *   @param {boolean} options.layers - Create separate layers - default true
 *   @param {boolean} options.dimensions - Export dimension annotations - default true
 *   @param {string} options.filename - Output filename - default 'sketch.dxf'
 * @returns {string} DXF file content (ASCII)
 */
export function exportSketchToDXF(entities, options = {}) {
  const opts = {
    units: 'mm',
    layers: true,
    dimensions: true,
    filename: 'sketch.dxf',
    ...options
  };

  // Calculate extents
  const extents = calculateExtents(entities);

  // Build sections
  const header = buildHeaderSection(extents);
  const tables = buildTablesSection();
  const blocks = buildBlocksSection();

  // Build ENTITIES section
  const entitiesLines = [];
  entitiesLines.push('  0');
  entitiesLines.push('SECTION');
  entitiesLines.push('  2');
  entitiesLines.push('ENTITIES');

  // Convert sketch entities to DXF entities
  entities.forEach((entity, idx) => {
    const layer = opts.layers ? `ENTITY_${idx}` : DXF_LAYERS.OUTLINE.name;

    switch (entity.type.toLowerCase()) {
      case 'line':
        entitiesLines.push(...createDXFLine(entity.points[0], entity.points[1], layer));
        break;
      case 'rectangle':
        entitiesLines.push(...createDXFRectangle(entity.points, layer));
        break;
      case 'circle':
        entitiesLines.push(...createDXFCircle(entity.points[0], entity.dimensions?.radius || 10, layer));
        break;
      case 'arc':
        entitiesLines.push(...createDXFArc(entity.points[0], entity.dimensions?.radius || 10,
          entity.dimensions?.startAngle || 0, entity.dimensions?.endAngle || 180, layer));
        break;
      case 'polyline':
        entitiesLines.push(...createDXFPolyline(entity.points, layer));
        break;
    }
  });

  // Add dimension annotations if requested
  if (opts.dimensions && entities.some(e => e.dimensions)) {
    entities.forEach((entity, idx) => {
      if (entity.dimensions?.label) {
        const midpoint = calculateMidpoint(entity.points);
        entitiesLines.push(...createDXFText(midpoint, entity.dimensions.label, 2.5, DXF_LAYERS.DIMENSION.name));
      }
    });
  }

  entitiesLines.push('  0');
  entitiesLines.push('ENDSEC');

  // Build EOF
  const eof = ['  0', 'EOF'];

  return [header, tables, blocks, entitiesLines.join('\n'), eof.join('\n')].join('\n');
}

/**
 * Export 3D mesh projection to DXF format
 *
 * @param {THREE.Mesh|THREE.Group} mesh - Geometry to project
 * @param {string} view - Projection view: 'front'|'top'|'right'|'back'|'left'|'bottom'|'iso'
 * @param {Object} options - Export options
 *   @param {boolean} options.hiddenLines - Separate hidden lines to layer - default true
 *   @param {number} options.scale - Scaling factor - default 1.0
 *   @param {boolean} options.layers - Use separate layers - default true
 * @returns {string} DXF file content
 */
export function exportProjectionToDXF(mesh, view = 'front', options = {}) {
  const opts = {
    hiddenLines: true,
    scale: 1.0,
    layers: true,
    ...options
  };

  // Get projection matrix for view
  const projMatrix = getProjectionMatrix(view);

  // Extract visible and hidden edges
  const visibleEdges = extractProjectedEdges(mesh, projMatrix, opts.scale, true);
  const hiddenEdges = opts.hiddenLines ? extractProjectedEdges(mesh, projMatrix, opts.scale, false) : [];

  // Calculate extents
  const allEdges = [...visibleEdges, ...hiddenEdges];
  const extents = calculateExtentsFromEdges(allEdges);

  // Build sections
  const header = buildHeaderSection(extents);
  const tables = buildTablesSection();
  const blocks = buildBlocksSection();

  // Build ENTITIES section
  const entitiesLines = [];
  entitiesLines.push('  0');
  entitiesLines.push('SECTION');
  entitiesLines.push('  2');
  entitiesLines.push('ENTITIES');

  // Add visible edges
  visibleEdges.forEach(edge => {
    entitiesLines.push(...createDXFLine(edge.start, edge.end, DXF_LAYERS.OUTLINE.name));
  });

  // Add hidden edges on separate layer
  if (opts.hiddenLines) {
    hiddenEdges.forEach(edge => {
      entitiesLines.push(...createDXFLine(edge.start, edge.end, DXF_LAYERS.HIDDEN.name));
    });
  }

  entitiesLines.push('  0');
  entitiesLines.push('ENDSEC');

  const eof = ['  0', 'EOF'];

  return [header, tables, blocks, entitiesLines.join('\n'), eof.join('\n')].join('\n');
}

/**
 * Export standard engineering multi-view drawing
 * Creates front, top, right views in 3rd-angle projection layout
 *
 * @param {THREE.Mesh|THREE.Group} mesh - Geometry to project
 * @param {Object} options - Export options
 *   @param {number} options.scale - View scale - default 1.0
 *   @param {number} options.spacing - Space between views (mm) - default 50
 *   @param {boolean} options.border - Draw border - default true
 *   @param {boolean} options.titleBlock - Draw title block - default true
 *   @param {string} options.title - Drawing title - default 'Part'
 *   @param {string} options.partNumber - Part number - default ''
 *   @param {string} options.material - Material description - default ''
 *   @param {string} options.author - Author name - default ''
 * @returns {string} DXF file content
 */
export function exportMultiViewDXF(mesh, options = {}) {
  const opts = {
    scale: 1.0,
    spacing: 50,
    border: true,
    titleBlock: true,
    title: 'Part',
    partNumber: '',
    material: '',
    author: '',
    ...options
  };

  // Extract projections
  const frontProj = extractProjectedEdges(mesh, getProjectionMatrix('front'), opts.scale, true);
  const topProj = extractProjectedEdges(mesh, getProjectionMatrix('top'), opts.scale, true);
  const rightProj = extractProjectedEdges(mesh, getProjectionMatrix('right'), opts.scale, true);

  // Calculate view extents
  const frontExt = calculateExtentsFromEdges(frontProj);
  const topExt = calculateExtentsFromEdges(topProj);
  const rightExt = calculateExtentsFromEdges(rightProj);

  // Layout views (3rd angle projection)
  const layout = {
    front: { x: 10, y: 10, width: frontExt.max.x - frontExt.min.x, height: frontExt.max.y - frontExt.min.y },
    top: { x: 10, y: 10 + frontExt.max.y - frontExt.min.y + opts.spacing, width: topExt.max.x - topExt.min.x, height: topExt.max.y - topExt.min.y },
    right: { x: 10 + frontExt.max.x - frontExt.min.x + opts.spacing, y: 10, width: rightExt.max.x - rightExt.min.x, height: rightExt.max.y - rightExt.min.y }
  };

  // Calculate total extents for border
  const totalWidth = layout.front.width + layout.right.width + opts.spacing + 30;
  const totalHeight = layout.front.height + layout.top.height + opts.spacing + (opts.titleBlock ? 60 : 30);
  const overallExtents = { min: { x: 0, y: 0 }, max: { x: totalWidth, y: totalHeight } };

  // Build DXF
  const header = buildHeaderSection(overallExtents);
  const tables = buildTablesSection();
  const blocks = buildBlocksSection();

  const entitiesLines = [];
  entitiesLines.push('  0');
  entitiesLines.push('SECTION');
  entitiesLines.push('  2');
  entitiesLines.push('ENTITIES');

  // Draw border
  if (opts.border) {
    entitiesLines.push(...createDXFRectangle(
      [
        { x: 5, y: 5 },
        { x: totalWidth - 5, y: totalHeight - 5 }
      ],
      DXF_LAYERS.BORDER.name
    ));
  }

  // Draw title block
  if (opts.titleBlock) {
    const titleY = 20;
    entitiesLines.push(...createDXFText({ x: totalWidth - 100, y: titleY }, opts.title, 3.5, DXF_LAYERS.BORDER.name));
    if (opts.partNumber) {
      entitiesLines.push(...createDXFText({ x: totalWidth - 100, y: titleY - 8 }, `Part: ${opts.partNumber}`, 2, DXF_LAYERS.BORDER.name));
    }
    if (opts.material) {
      entitiesLines.push(...createDXFText({ x: totalWidth - 100, y: titleY - 14 }, `Material: ${opts.material}`, 2, DXF_LAYERS.BORDER.name));
    }
    if (opts.author) {
      entitiesLines.push(...createDXFText({ x: totalWidth - 100, y: titleY - 20 }, `By: ${opts.author}`, 2, DXF_LAYERS.BORDER.name));
    }
  }

  // Draw front view
  entitiesLines.push(...createDXFText({ x: layout.front.x, y: layout.front.y - 5 }, 'FRONT', 2.5, DXF_LAYERS.DIMENSION.name));
  frontProj.forEach(edge => {
    entitiesLines.push(...createDXFLine(
      { x: edge.start.x + layout.front.x, y: edge.start.y + layout.front.y },
      { x: edge.end.x + layout.front.x, y: edge.end.y + layout.front.y },
      DXF_LAYERS.OUTLINE.name
    ));
  });

  // Draw top view
  entitiesLines.push(...createDXFText({ x: layout.top.x, y: layout.top.y - 5 }, 'TOP', 2.5, DXF_LAYERS.DIMENSION.name));
  topProj.forEach(edge => {
    entitiesLines.push(...createDXFLine(
      { x: edge.start.x + layout.top.x, y: edge.start.y + layout.top.y },
      { x: edge.end.x + layout.top.x, y: edge.end.y + layout.top.y },
      DXF_LAYERS.OUTLINE.name
    ));
  });

  // Draw right view
  entitiesLines.push(...createDXFText({ x: layout.right.x, y: layout.right.y - 5 }, 'RIGHT', 2.5, DXF_LAYERS.DIMENSION.name));
  rightProj.forEach(edge => {
    entitiesLines.push(...createDXFLine(
      { x: edge.start.x + layout.right.x, y: edge.start.y + layout.right.y },
      { x: edge.end.x + layout.right.x, y: edge.end.y + layout.right.y },
      DXF_LAYERS.OUTLINE.name
    ));
  });

  entitiesLines.push('  0');
  entitiesLines.push('ENDSEC');

  const eof = ['  0', 'EOF'];

  return [header, tables, blocks, entitiesLines.join('\n'), eof.join('\n')].join('\n');
}

/**
 * Export 3D geometry as wireframe to DXF
 *
 * @param {THREE.Mesh|THREE.Group} mesh - Geometry to export
 * @param {Object} options - Export options
 *   @param {boolean} options.faces - Export faces as 3DFACE - default true
 *   @param {boolean} options.edges - Export edges as 3DLINE - default true
 *   @param {string} options.layer - Layer name - default 'MODEL'
 * @returns {string} DXF file content
 */
export function export3DDXF(mesh, options = {}) {
  const opts = {
    faces: true,
    edges: true,
    layer: DXF_LAYERS.MODEL.name,
    ...options
  };

  // Extract all unique vertices and faces
  const vertices = [];
  const faces = [];

  extractGeometry(mesh, vertices, faces);

  // Calculate extents in 3D
  const extents = { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 100 } };
  if (vertices.length > 0) {
    extents.min = { x: vertices[0].x, y: vertices[0].y, z: vertices[0].z };
    extents.max = { ...extents.min };
    vertices.forEach(v => {
      extents.min.x = Math.min(extents.min.x, v.x);
      extents.min.y = Math.min(extents.min.y, v.y);
      extents.min.z = Math.min(extents.min.z, v.z);
      extents.max.x = Math.max(extents.max.x, v.x);
      extents.max.y = Math.max(extents.max.y, v.y);
      extents.max.z = Math.max(extents.max.z, v.z);
    });
  }

  // Build DXF
  const header = buildHeaderSection(extents);
  const tables = buildTablesSection();
  const blocks = buildBlocksSection();

  const entitiesLines = [];
  entitiesLines.push('  0');
  entitiesLines.push('SECTION');
  entitiesLines.push('  2');
  entitiesLines.push('ENTITIES');

  // Export 3D faces
  if (opts.faces) {
    faces.forEach(face => {
      entitiesLines.push(...createDXF3DFace(face, opts.layer));
    });
  }

  // Export edges
  if (opts.edges) {
    const edges = extractEdges(faces);
    edges.forEach(edge => {
      entitiesLines.push(...createDXF3DLine(edge.start, edge.end, opts.layer));
    });
  }

  entitiesLines.push('  0');
  entitiesLines.push('ENDSEC');

  const eof = ['  0', 'EOF'];

  return [header, tables, blocks, entitiesLines.join('\n'), eof.join('\n')].join('\n');
}

// ============================================================================
// DXF Entity Creators
// ============================================================================

/**
 * Create DXF LINE entity
 * @private
 */
function createDXFLine(p1, p2, layer = '0') {
  return [
    '  0', 'LINE',
    '  8', layer,
    ' 10', formatNumber(p1.x),
    ' 20', formatNumber(p1.y),
    ' 30', '0.0',
    ' 11', formatNumber(p2.x),
    ' 21', formatNumber(p2.y),
    ' 31', '0.0'
  ];
}

/**
 * Create DXF CIRCLE entity
 * @private
 */
function createDXFCircle(center, radius, layer = '0') {
  return [
    '  0', 'CIRCLE',
    '  8', layer,
    ' 10', formatNumber(center.x),
    ' 20', formatNumber(center.y),
    ' 30', '0.0',
    ' 40', formatNumber(radius)
  ];
}

/**
 * Create DXF ARC entity
 * @private
 */
function createDXFArc(center, radius, startAngle, endAngle, layer = '0') {
  return [
    '  0', 'ARC',
    '  8', layer,
    ' 10', formatNumber(center.x),
    ' 20', formatNumber(center.y),
    ' 30', '0.0',
    ' 40', formatNumber(radius),
    ' 50', formatNumber(startAngle),
    ' 51', formatNumber(endAngle)
  ];
}

/**
 * Create DXF LWPOLYLINE entity
 * @private
 */
function createDXFPolyline(points, layer = '0') {
  const lines = [
    '  0', 'LWPOLYLINE',
    '  8', layer,
    ' 70', '0',
    ' 90', points.length.toString()
  ];

  points.forEach(p => {
    lines.push(' 10');
    lines.push(formatNumber(p.x));
    lines.push(' 20');
    lines.push(formatNumber(p.y));
  });

  return lines;
}

/**
 * Create DXF TEXT entity
 * @private
 */
function createDXFText(position, text, height = 2.5, layer = '0') {
  return [
    '  0', 'TEXT',
    '  8', layer,
    ' 10', formatNumber(position.x),
    ' 20', formatNumber(position.y),
    ' 30', '0.0',
    ' 40', formatNumber(height),
    '  1', text,
    '  7', 'STANDARD',
    ' 50', '0.0',
    ' 72', '0',
    ' 11', formatNumber(position.x),
    ' 21', formatNumber(position.y),
    ' 31', '0.0'
  ];
}

/**
 * Create DXF RECTANGLE (as LWPOLYLINE)
 * @private
 */
function createDXFRectangle(points, layer = '0') {
  const p1 = points[0];
  const p2 = points[1];

  const corners = [
    { x: p1.x, y: p1.y },
    { x: p2.x, y: p1.y },
    { x: p2.x, y: p2.y },
    { x: p1.x, y: p2.y },
    { x: p1.x, y: p1.y }  // Close loop
  ];

  return createDXFPolyline(corners, layer);
}

/**
 * Create DXF 3DFACE entity
 * @private
 */
function createDXF3DFace(faceVertices, layer = '0') {
  const lines = [
    '  0', '3DFACE',
    '  8', layer
  ];

  // Support triangles and quads
  const vCount = Math.min(faceVertices.length, 4);
  for (let i = 0; i < vCount; i++) {
    const v = faceVertices[i];
    lines.push(` 1${i}`);
    lines.push(formatNumber(v.x));
    lines.push(` 2${i}`);
    lines.push(formatNumber(v.y));
    lines.push(` 3${i}`);
    lines.push(formatNumber(v.z));
  }

  return lines;
}

/**
 * Create DXF 3DLINE entity
 * @private
 */
function createDXF3DLine(p1, p2, layer = '0') {
  return [
    '  0', 'LINE',
    '  8', layer,
    ' 10', formatNumber(p1.x),
    ' 20', formatNumber(p1.y),
    ' 30', formatNumber(p1.z),
    ' 11', formatNumber(p2.x),
    ' 21', formatNumber(p2.y),
    ' 31', formatNumber(p2.z)
  ];
}

// ============================================================================
// Geometry Processing
// ============================================================================

/**
 * Extract visible projected edges from mesh
 * @private
 */
function extractProjectedEdges(mesh, projMatrix, scale = 1.0, isVisible = true) {
  const edges = [];
  const frustum = new THREE.Frustum();
  const cameraMatrix = new THREE.Matrix4();
  cameraMatrix.multiplyMatrices(projMatrix, mesh.matrixWorld);
  frustum.setFromProjectionMatrix(cameraMatrix);

  const tempMesh = mesh instanceof THREE.Group ? mesh : mesh;

  tempMesh.traverse(child => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geometry = child.geometry;

      if (!geometry.attributes.position) return;

      const positions = geometry.attributes.position.array;
      const indices = geometry.index ? geometry.index.array : null;

      // Extract edges from geometry
      const extractedEdges = indices ?
        extractEdgesFromIndices(positions, indices) :
        extractEdgesFromVertices(positions);

      extractedEdges.forEach(edge => {
        const v1 = new THREE.Vector3(edge.start.x * scale, edge.start.y * scale, 0);
        const v2 = new THREE.Vector3(edge.end.x * scale, edge.end.y * scale, 0);
        edges.push({ start: v1, end: v2 });
      });
    }
  });

  return edges;
}

/**
 * Extract edges from indexed geometry
 * @private
 */
function extractEdgesFromIndices(positions, indices) {
  const edges = [];
  const edgeSet = new Set();

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const p0 = { x: positions[i0], y: positions[i0 + 1] };
    const p1 = { x: positions[i1], y: positions[i1 + 1] };
    const p2 = { x: positions[i2], y: positions[i2 + 1] };

    addEdgeToSet(edgeSet, p0, p1, edges);
    addEdgeToSet(edgeSet, p1, p2, edges);
    addEdgeToSet(edgeSet, p2, p0, edges);
  }

  return edges;
}

/**
 * Extract edges from non-indexed geometry
 * @private
 */
function extractEdgesFromVertices(positions) {
  const edges = [];

  for (let i = 0; i < positions.length; i += 9) {
    const p0 = { x: positions[i], y: positions[i + 1] };
    const p1 = { x: positions[i + 3], y: positions[i + 4] };
    const p2 = { x: positions[i + 6], y: positions[i + 7] };

    edges.push({ start: p0, end: p1 });
    edges.push({ start: p1, end: p2 });
    edges.push({ start: p2, end: p0 });
  }

  return edges;
}

/**
 * Add edge to set, avoiding duplicates
 * @private
 */
function addEdgeToSet(edgeSet, p1, p2, edges) {
  const key = [
    Math.round(p1.x * 1000),
    Math.round(p1.y * 1000),
    Math.round(p2.x * 1000),
    Math.round(p2.y * 1000)
  ].join(',');

  if (!edgeSet.has(key)) {
    edgeSet.add(key);
    edges.push({ start: p1, end: p2 });
  }
}

/**
 * Extract geometry from mesh/group
 * @private
 */
function extractGeometry(mesh, vertices, faces) {
  let vertexOffset = vertices.length;

  mesh.traverse(child => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geometry = child.geometry;

      if (!geometry.attributes.position) return;

      const positions = geometry.attributes.position.array;

      // Add vertices
      for (let i = 0; i < positions.length; i += 3) {
        vertices.push({
          x: positions[i],
          y: positions[i + 1],
          z: positions[i + 2]
        });
      }

      // Add faces
      const indices = geometry.index ? geometry.index.array : null;

      if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
          faces.push([
            vertexOffset + indices[i],
            vertexOffset + indices[i + 1],
            vertexOffset + indices[i + 2]
          ]);
        }
      } else {
        for (let i = 0; i < positions.length / 3; i += 3) {
          faces.push([
            vertexOffset + i,
            vertexOffset + i + 1,
            vertexOffset + i + 2
          ]);
        }
      }

      vertexOffset = vertices.length;
    }
  });
}

/**
 * Extract unique edges from faces
 * @private
 */
function extractEdges(faces) {
  const edgeSet = new Set();
  const edges = [];

  faces.forEach(face => {
    for (let i = 0; i < face.length; i++) {
      const v1 = face[i];
      const v2 = face[(i + 1) % face.length];

      const key = [Math.min(v1, v2), Math.max(v1, v2)].join(',');

      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ v1, v2 });
      }
    }
  });

  return edges;
}

/**
 * Get projection matrix for standard view
 * @private
 */
function getProjectionMatrix(view) {
  const matrix = new THREE.Matrix4();

  switch (view.toLowerCase()) {
    case 'front':
      // Looking at Z=0 plane from positive Z
      matrix.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      break;
    case 'top':
      // Looking at XY plane from positive Z (top-down)
      matrix.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
      break;
    case 'right':
      // Looking at YZ plane from positive X (right side)
      matrix.set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
      break;
    case 'back':
      // Looking at Z=0 plane from negative Z
      matrix.set(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1);
      break;
    case 'left':
      // Looking at YZ plane from negative X
      matrix.set(0, 0, -1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1);
      break;
    case 'bottom':
      // Looking at XY plane from negative Z
      matrix.set(1, 0, 0, 0, 0, 0, -1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
      break;
    case 'iso':
      // Isometric view
      matrix.set(0.866, -0.5, 0, 0, 0.433, 0.75, -0.5, 0, 0.5, 0.433, 0.75, 0, 0, 0, 0, 1);
      break;
    default:
      matrix.identity();
  }

  return matrix;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate extents from 2D sketch entities
 * @private
 */
function calculateExtents(entities) {
  let minX = 0, minY = 0, maxX = 100, maxY = 100;

  entities.forEach(entity => {
    entity.points?.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });

  return {
    min: { x: minX - 10, y: minY - 10 },
    max: { x: maxX + 10, y: maxY + 10 }
  };
}

/**
 * Calculate extents from projected edges
 * @private
 */
function calculateExtentsFromEdges(edges) {
  let minX = 0, minY = 0, maxX = 100, maxY = 100;

  if (edges.length === 0) {
    return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
  }

  minX = edges[0].start.x;
  minY = edges[0].start.y;
  maxX = edges[0].start.x;
  maxY = edges[0].start.y;

  edges.forEach(edge => {
    minX = Math.min(minX, edge.start.x, edge.end.x);
    minY = Math.min(minY, edge.start.y, edge.end.y);
    maxX = Math.max(maxX, edge.start.x, edge.end.x);
    maxY = Math.max(maxY, edge.start.y, edge.end.y);
  });

  const padding = 10;
  return {
    min: { x: minX - padding, y: minY - padding },
    max: { x: maxX + padding, y: maxY + padding }
  };
}

/**
 * Calculate midpoint of points
 * @private
 */
function calculateMidpoint(points) {
  if (!points || points.length === 0) return { x: 0, y: 0 };

  const sum = points.reduce((acc, p) => ({
    x: acc.x + p.x,
    y: acc.y + p.y
  }), { x: 0, y: 0 });

  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
}

/**
 * Format number for DXF (6 decimal places)
 * @private
 */
function formatNumber(num) {
  return Number(num).toFixed(6);
}

// ============================================================================
// File Download & Export
// ============================================================================

/**
 * Trigger browser download of DXF file
 *
 * @param {string} content - DXF file content
 * @param {string} filename - Output filename (default 'export.dxf')
 */
export function downloadDXF(content, filename = 'export.dxf') {
  const blob = new Blob([content], { type: 'application/vnd.dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.dxf') ? filename : `${filename}.dxf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert DXF sections to string
 * Utility for building custom DXF files
 *
 * @param {Object} sections - Object with section names as keys: { header: '...', tables: '...', ... }
 * @returns {string} Complete DXF content
 */
export function dxfToString(sections) {
  return Object.values(sections).join('\n');
}

// ============================================================================
// Export Summary
// ============================================================================

/**
 * Generate a text summary of what will be exported
 * Useful for UI feedback before export
 *
 * @param {Array|THREE.Mesh} data - Entities array or mesh
 * @param {string} type - Export type: 'sketch'|'projection'|'multiview'|'3d'
 * @returns {string} Human-readable summary
 */
export function generateExportSummary(data, type = 'sketch') {
  let summary = '';

  switch (type) {
    case 'sketch':
      summary = `Exporting ${data.length} sketch entities`;
      const lines = data.filter(e => e.type === 'line').length;
      const circles = data.filter(e => e.type === 'circle').length;
      if (lines > 0) summary += `\n- ${lines} lines`;
      if (circles > 0) summary += `\n- ${circles} circles`;
      break;
    case 'projection':
      summary = 'Exporting 2D projection view';
      break;
    case 'multiview':
      summary = 'Exporting multi-view engineering drawing\n- Front, Top, Right views\n- Title block included';
      break;
    case '3d':
      summary = 'Exporting 3D wireframe';
      break;
  }

  summary += '\n\nFormat: AutoCAD R14 (ASCII DXF)\nUnits: millimeters';
  return summary;
}
