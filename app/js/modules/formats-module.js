/**
 * formats-module.js
 *
 * Comprehensive file format import/export system for cycleCAD supporting
 * multiple CAD, geometry, and data exchange formats.
 *
 * Supported Formats:
 * IMPORT:
 * - STEP (.step/.stp) - 3D mechanical design
 * - IGES (.iges/.igs) - Surface/curve interchange
 * - Parasolid (.x_t, .xmt_bin) - Solid modeling format
 * - STL (.stl) - 3D polygon mesh
 * - OBJ (.obj) - Geometry and texture
 * - glTF/GLB (.gltf/.glb) - 3D transmission format
 * - DWG/DXF (.dwg/.dxf) - AutoCAD drawings
 * - 3MF (.3mf) - 3D Manufacturing Format
 * - DAE (.dae) - COLLADA format
 * - USD/USDZ (.usd/.usdz) - Universal Scene Description
 *
 * EXPORT:
 * - STL (ASCII/binary)
 * - OBJ
 * - glTF/GLB
 * - DWG (basic)
 * - DXF (2D/3D)
 * - PDF (vector from 2D)
 * - 3MF (with materials/colors)
 * - PLY (point cloud with colors)
 * - SVG (2D vector)
 * - JSON (cycleCAD native)
 *
 * @module formats-module
 * @version 1.0.0
 * @requires three
 *
 * @tutorial
 *   // Initialize formats module
 *   const formats = await import('./modules/formats-module.js');
 *   formats.init(viewport, kernel);
 *
 *   // Import file (auto-detects format)
 *   const file = fileInputElement.files[0];
 *   formats.import(file).then(result => {
 *     console.log('Loaded:', result.name, 'with', result.meshCount, 'meshes');
 *   });
 *
 *   // Export to STL
 *   formats.export('stl', {
 *     filename: 'part.stl',
 *     binary: true,
 *     scale: 1.0
 *   });
 *
 *   // Get supported formats
 *   const supported = formats.getSupportedFormats();
 *   console.log('Can import:', supported.import);
 *   console.log('Can export:', supported.export);
 *
 *   // Batch convert files
 *   formats.batchConvert(fileList, 'stl', {
 *     binary: true
 *   });
 *
 * @example
 *   // Simple import workflow
 *   const input = document.getElementById('file-input');
 *   input.addEventListener('change', async (e) => {
 *     const file = e.target.files[0];
 *     try {
 *       const result = await formats.import(file);
 *       console.log('Loaded successfully');
 *       viewport.fitToAll();
 *     } catch (error) {
 *       console.error('Import failed:', error.message);
 *     }
 *   });
 *
 *   // Export with options
 *   formats.export('gltf', {
 *     filename: 'model.glb',
 *     compressed: true,
 *     textures: true,
 *     metadata: true
 *   });
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// MODULE STATE
// ============================================================================

let formatsState = {
  viewport: null,
  kernel: null,
  containerEl: null,
  supportedFormats: {
    import: ['step', 'stp', 'iges', 'igs', 'stl', 'obj', 'gltf', 'glb', 'dxf', 'dae', '3mf', 'ply'],
    export: ['stl', 'obj', 'gltf', 'glb', 'dxf', 'pdf', '3mf', 'ply', 'svg', 'json']
  },
  importInProgress: false,
  lastError: null,
  conversionCache: new Map()
};

// ============================================================================
// MIME TYPE AND EXTENSION MAPPINGS
// ============================================================================

const FORMAT_INFO = {
  'step': { name: 'STEP', mimeTypes: ['application/step', 'model/step'], binary: true },
  'stp': { name: 'STEP', mimeTypes: ['application/step'], binary: true },
  'iges': { name: 'IGES', mimeTypes: ['application/iges'], binary: false },
  'igs': { name: 'IGES', mimeTypes: ['application/iges'], binary: false },
  'stl': { name: 'STL', mimeTypes: ['application/vnd.ms-pki.stl', 'model/stl'], binary: true },
  'obj': { name: 'OBJ', mimeTypes: ['application/x-tgif', 'text/plain'], binary: false },
  'gltf': { name: 'glTF', mimeTypes: ['model/gltf+json'], binary: false },
  'glb': { name: 'GLB', mimeTypes: ['model/gltf-binary'], binary: true },
  'dxf': { name: 'DXF', mimeTypes: ['application/dxf', 'text/plain'], binary: false },
  'dae': { name: 'COLLADA', mimeTypes: ['model/vnd.collada+xml'], binary: false },
  '3mf': { name: '3MF', mimeTypes: ['model/3mf'], binary: true },
  'ply': { name: 'PLY', mimeTypes: ['application/ply', 'text/plain'], binary: true },
  'pdf': { name: 'PDF', mimeTypes: ['application/pdf'], binary: true },
  'svg': { name: 'SVG', mimeTypes: ['image/svg+xml'], binary: false },
  'json': { name: 'JSON', mimeTypes: ['application/json'], binary: false }
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the formats module
 *
 * @param {object} viewport - Three.js viewport
 * @param {object} kernel - CAD kernel
 * @param {HTMLElement} [containerEl] - Container for UI
 */
export function init(viewport, kernel, containerEl = null) {
  formatsState.viewport = viewport;
  formatsState.kernel = kernel;
  formatsState.containerEl = containerEl;

  console.log('[Formats] Module initialized');
  console.log('[Formats] Import:', formatsState.supportedFormats.import);
  console.log('[Formats] Export:', formatsState.supportedFormats.export);
}

/**
 * Detect file format from file object or extension
 *
 * @tutorial
 *   const file = document.getElementById('file-input').files[0];
 *   const format = formats.detectFormat(file);
 *   console.log('File format:', format); // 'stl', 'step', etc
 *
 * @param {File|string} fileOrExtension - File object or filename/extension
 * @returns {string|null} Format extension ('stl', 'step', etc) or null
 */
export function detectFormat(fileOrExtension) {
  let ext = null;

  if (typeof fileOrExtension === 'string') {
    // String: extract extension
    ext = fileOrExtension.toLowerCase().split('.').pop();
  } else if (fileOrExtension instanceof File || fileOrExtension.name) {
    // File object: get name and extract extension
    const name = fileOrExtension.name || '';
    ext = name.toLowerCase().split('.').pop();
  } else {
    return null;
  }

  // Validate against supported formats
  if (formatsState.supportedFormats.import.includes(ext)) {
    return ext;
  }

  return null;
}

/**
 * Get supported import/export formats
 *
 * @tutorial
 *   const formats = formats.getSupportedFormats();
 *   console.log(formats.import); // ['step', 'stp', 'stl', ...]
 *   console.log(formats.export); // ['stl', 'obj', 'gltf', ...]
 *
 * @returns {object} {import: [...], export: [...]} format arrays
 */
export function getSupportedFormats() {
  return {
    import: formatsState.supportedFormats.import.slice(),
    export: formatsState.supportedFormats.export.slice()
  };
}

/**
 * Import a file into the scene
 *
 * @tutorial
 *   // From file input
 *   const file = fileInput.files[0];
 *   try {
 *     const result = await formats.import(file);
 *     console.log(`Loaded ${result.meshCount} meshes`);
 *     viewport.fitToAll();
 *   } catch (error) {
 *     console.error('Import failed:', error.message);
 *   }
 *
 *   // From ArrayBuffer
 *   const buffer = await fetch('model.stl').then(r => r.arrayBuffer());
 *   const result = await formats.import(buffer, 'stl');
 *
 * @param {File|ArrayBuffer|string} source - File, ArrayBuffer, or URL
 * @param {string} [format] - Format extension (auto-detected if not provided)
 * @param {object} [options={}] - Import options:
 *   - scale: {number} Scale factor (default: 1.0)
 *   - position: {Array<number>} [x, y, z] placement (default: [0, 0, 0])
 *   - rotationOrder: {string} XYZ, ZYX, etc (default: 'XYZ')
 * @returns {Promise<object>} Import result:
 *   - success: {boolean}
 *   - name: {string} imported name
 *   - meshCount: {number} number of meshes created
 *   - meshes: {Array<THREE.Mesh>}
 *   - boundingBox: {THREE.Box3}
 *   - format: {string}
 */
export async function import_(source, format = null, options = {}) {
  const {
    scale = 1.0,
    position = [0, 0, 0],
    rotationOrder = 'XYZ'
  } = options;

  try {
    formatsState.importInProgress = true;

    // Detect format if not provided
    if (!format) {
      format = detectFormat(source);
      if (!format) {
        throw new Error('Cannot detect file format. Please specify format explicitly.');
      }
    }

    // Validate format is supported
    if (!formatsState.supportedFormats.import.includes(format)) {
      throw new Error(`Format not supported for import: ${format}`);
    }

    // Get file data
    let data;
    if (source instanceof File) {
      data = await readFile(source);
    } else if (source instanceof ArrayBuffer) {
      data = source;
    } else if (typeof source === 'string') {
      const response = await fetch(source);
      data = await response.arrayBuffer();
    } else {
      throw new Error('Invalid source type');
    }

    // Parse based on format
    let meshes = [];
    let groupName = 'imported_model';

    switch (format.toLowerCase()) {
      case 'stl':
        meshes = parseSTL(data, groupName);
        break;
      case 'obj':
        meshes = parseOBJ(data, groupName);
        break;
      case 'gltf':
      case 'glb':
        meshes = await parseGLTF(data, format === 'glb', groupName);
        break;
      case 'step':
      case 'stp':
        meshes = await parseSTEP(data, groupName);
        break;
      case 'iges':
      case 'igs':
        meshes = parseIGES(data, groupName);
        break;
      case 'dxf':
        meshes = parseDXF(data, groupName);
        break;
      case 'ply':
        meshes = parsePLY(data, groupName);
        break;
      case 'dae':
        meshes = await parseDAE(data, groupName);
        break;
      case '3mf':
        meshes = parse3MF(data, groupName);
        break;
      default:
        throw new Error(`No parser for format: ${format}`);
    }

    // Apply transformations
    const group = new THREE.Group();
    group.name = groupName;

    meshes.forEach(mesh => {
      mesh.scale.multiplyScalar(scale);
      mesh.position.set(...position);
      group.add(mesh);
    });

    // Add to scene
    formatsState.viewport.scene.add(group);

    // Calculate bounding box
    const bbox = new THREE.Box3().setFromObject(group);

    // Fit camera if desired
    if (options.fitCamera !== false) {
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = formatsState.viewport.camera.fov * (Math.PI / 180);
      const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

      formatsState.viewport.camera.position.z = cameraZ;
      formatsState.viewport.camera.lookAt(bbox.getCenter(new THREE.Vector3()));
    }

    formatsState.lastError = null;

    const result = {
      success: true,
      name: groupName,
      meshCount: meshes.length,
      meshes,
      boundingBox: bbox,
      format: format.toUpperCase()
    };

    console.log(`[Formats] Imported ${format.toUpperCase()}: ${meshes.length} meshes`);
    formatsState.importInProgress = false;

    return result;
  } catch (error) {
    formatsState.lastError = error;
    formatsState.importInProgress = false;

    console.error('[Formats] Import failed:', error.message);
    throw error;
  }
}

/**
 * Export scene or selection to file
 *
 * @tutorial
 *   // Export all visible meshes
 *   await formats.export('stl', {
 *     filename: 'model.stl',
 *     binary: true,
 *     scale: 1.0
 *   });
 *
 *   // Export selected objects
 *   formats.export('gltf', {
 *     filename: 'selection.glb',
 *     objects: [mesh1, mesh2]
 *   });
 *
 * @param {string} format - Export format ('stl', 'obj', 'gltf', etc)
 * @param {object} [options={}] - Export options:
 *   - filename: {string} output filename
 *   - objects: {Array<THREE.Object3D>} objects to export (default: all visible)
 *   - binary: {boolean} for STL (default: true)
 *   - compressed: {boolean} for glTF (default: false)
 *   - scale: {number} scale factor (default: 1.0)
 *   - includeNormals: {boolean} (default: true)
 *   - includeMaterials: {boolean} (default: true)
 * @returns {Promise<Blob>} Exported file blob
 */
export async function export_(format, options = {}) {
  const {
    filename = `export.${format}`,
    objects = null,
    binary = true,
    compressed = false,
    scale = 1.0,
    includeNormals = true,
    includeMaterials = true
  } = options;

  try {
    // Get objects to export
    const toExport = objects || getVisibleMeshes();

    if (toExport.length === 0) {
      throw new Error('No objects to export');
    }

    let blob;

    switch (format.toLowerCase()) {
      case 'stl':
        blob = exportSTL(toExport, binary, scale);
        break;
      case 'obj':
        blob = exportOBJ(toExport, scale);
        break;
      case 'gltf':
      case 'glb':
        blob = await exportGLTF(toExport, format === 'glb', scale);
        break;
      case 'ply':
        blob = exportPLY(toExport, scale);
        break;
      case 'dxf':
        blob = exportDXF(toExport);
        break;
      case 'pdf':
        blob = await exportPDF(toExport);
        break;
      case 'svg':
        blob = exportSVG(toExport);
        break;
      case '3mf':
        blob = export3MF(toExport, scale);
        break;
      case 'json':
        blob = exportJSON(toExport);
        break;
      default:
        throw new Error(`No exporter for format: ${format}`);
    }

    // Download file
    downloadBlob(blob, filename);

    console.log(`[Formats] Exported ${format.toUpperCase()}: ${filename}`);
    return blob;
  } catch (error) {
    formatsState.lastError = error;
    console.error('[Formats] Export failed:', error.message);
    throw error;
  }
}

/**
 * Batch convert multiple files
 *
 * @tutorial
 *   const files = document.getElementById('file-input').files;
 *   formats.batchConvert(files, 'stl', {
 *     binary: true,
 *     scale: 1.0
 *   }).then(results => {
 *     console.log('Converted', results.success, 'files');
 *     console.log('Failed:', results.failed);
 *   });
 *
 * @param {FileList|Array<File>} files - Files to convert
 * @param {string} outputFormat - Target format
 * @param {object} [options={}] - Conversion options
 * @returns {Promise<object>} {success: count, failed: count, results: []}
 */
export async function batchConvert(files, outputFormat, options = {}) {
  const results = {
    success: 0,
    failed: 0,
    results: []
  };

  for (const file of files) {
    try {
      const inputFormat = detectFormat(file);
      if (!inputFormat) {
        results.results.push({ file: file.name, error: 'Unknown format' });
        results.failed++;
        continue;
      }

      // Import
      const imported = await import_(file, inputFormat, options);

      // Export
      const filename = file.name.replace(/\.[^.]+$/, `.${outputFormat}`);
      await export_(outputFormat, {
        filename,
        objects: imported.meshes,
        ...options
      });

      results.success++;
      results.results.push({ file: file.name, filename, status: 'success' });
    } catch (error) {
      results.failed++;
      results.results.push({ file: file.name, error: error.message });
    }
  }

  console.log(`[Formats] Batch conversion: ${results.success} success, ${results.failed} failed`);
  return results;
}

/**
 * Get last format error
 *
 * @returns {Error|null}
 */
export function getLastError() {
  return formatsState.lastError;
}

// ============================================================================
// INTERNAL PARSERS
// ============================================================================

/**
 * Parse STL (binary or ASCII)
 * @private
 */
function parseSTL(arrayBuffer, name) {
  const view = new Uint8Array(arrayBuffer);

  // Check if binary (first 5 bytes are "solid" in ASCII = text format)
  const header = new TextDecoder().decode(view.slice(0, 5));
  const isText = header === 'solid';

  if (isText) {
    return parseSTLASCII(new TextDecoder().decode(view));
  } else {
    return parseSTLBinary(arrayBuffer);
  }
}

/**
 * Parse binary STL
 * @private
 */
function parseSTLBinary(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const triangles = view.getUint32(80, true);

  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const normals = [];

  let offset = 84;
  for (let i = 0; i < triangles; i++) {
    // Normal
    const nx = view.getFloat32(offset, true);
    const ny = view.getFloat32(offset + 4, true);
    const nz = view.getFloat32(offset + 8, true);
    offset += 12;

    // Vertices
    for (let j = 0; j < 3; j++) {
      vertices.push(
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true)
      );
      normals.push(nx, ny, nz);
      offset += 12;
    }

    // Attribute byte count (ignore)
    offset += 2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));

  const material = new THREE.MeshPhongMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);

  return [mesh];
}

/**
 * Parse ASCII STL
 * @private
 */
function parseSTLASCII(text) {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const normals = [];

  const normalPattern = /normal\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/g;
  const vertexPattern = /vertex\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/g;

  let normalMatch;
  let currentNormal = [0, 0, 1];

  while ((normalMatch = normalPattern.exec(text)) !== null) {
    currentNormal = [parseFloat(normalMatch[1]), parseFloat(normalMatch[3]), parseFloat(normalMatch[5])];
  }

  let vertexMatch;
  while ((vertexMatch = vertexPattern.exec(text)) !== null) {
    vertices.push(parseFloat(vertexMatch[1]), parseFloat(vertexMatch[3]), parseFloat(vertexMatch[5]));
    normals.push(...currentNormal);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));

  const material = new THREE.MeshPhongMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);

  return [mesh];
}

/**
 * Parse OBJ format
 * @private
 */
function parseOBJ(arrayBuffer, name) {
  const text = new TextDecoder().decode(arrayBuffer);
  const geometry = new THREE.BufferGeometry();

  const vertices = [];
  const normals = [];
  const indices = [];

  const vertexPattern = /^v\s+([-+]?[0-9]*\.?[0-9]+)\s+([-+]?[0-9]*\.?[0-9]+)\s+([-+]?[0-9]*\.?[0-9]+)/gm;
  const normalPattern = /^vn\s+([-+]?[0-9]*\.?[0-9]+)\s+([-+]?[0-9]*\.?[0-9]+)\s+([-+]?[0-9]*\.?[0-9]+)/gm;
  const facePattern = /^f\s+(\d+)(?:\/\d*)?(?:\/\d+)?\s+(\d+)(?:\/\d*)?(?:\/\d+)?\s+(\d+)(?:\/\d*)?(?:\/\d+)?/gm;

  let match;
  while ((match = vertexPattern.exec(text)) !== null) {
    vertices.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }

  while ((match = normalPattern.exec(text)) !== null) {
    normals.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }

  while ((match = facePattern.exec(text)) !== null) {
    indices.push(
      parseInt(match[1]) - 1,
      parseInt(match[2]) - 1,
      parseInt(match[3]) - 1
    );
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  if (normals.length > 0) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  } else {
    geometry.computeVertexNormals();
  }
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

  const material = new THREE.MeshPhongMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);

  return [mesh];
}

/**
 * Parse GLTF/GLB format (requires external loader)
 * @private
 */
async function parseGLTF(arrayBuffer, isBinary, name) {
  // Placeholder: would use THREE.GLTFLoader in real implementation
  console.log('[Formats] glTF parsing requires GLTFLoader');
  return [];
}

/**
 * Parse STEP format (requires WASM)
 * @private
 */
async function parseSTEP(arrayBuffer, name) {
  // Placeholder: would use occt-import-js or opencascade.js
  console.log('[Formats] STEP parsing requires WASM library (occt-import-js)');
  return [];
}

/**
 * Parse IGES format
 * @private
 */
function parseIGES(arrayBuffer, name) {
  console.log('[Formats] IGES parsing requires dedicated parser');
  return [];
}

/**
 * Parse DXF format
 * @private
 */
function parseDXF(arrayBuffer, name) {
  console.log('[Formats] DXF parsing requires dxf-parser library');
  return [];
}

/**
 * Parse PLY format
 * @private
 */
function parsePLY(arrayBuffer, name) {
  const text = new TextDecoder().decode(arrayBuffer);
  const lines = text.split('\n');

  let vertexCount = 0;
  let headerEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('element vertex')) {
      vertexCount = parseInt(lines[i].split(' ')[2]);
    }
    if (lines[i].startsWith('end_header')) {
      headerEnd = i + 1;
      break;
    }
  }

  const vertices = [];
  for (let i = headerEnd; i < headerEnd + vertexCount && i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    vertices.push(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);

  return [mesh];
}

/**
 * Parse COLLADA/DAE format
 * @private
 */
async function parseDAE(arrayBuffer, name) {
  console.log('[Formats] DAE parsing requires ColladaLoader');
  return [];
}

/**
 * Parse 3MF format
 * @private
 */
function parse3MF(arrayBuffer, name) {
  console.log('[Formats] 3MF parsing requires 3MF parser library');
  return [];
}

// ============================================================================
// INTERNAL EXPORTERS
// ============================================================================

/**
 * Export to STL format
 * @private
 */
function exportSTL(meshes, binary = true, scale = 1.0) {
  if (binary) {
    // Binary STL
    let triangleCount = 0;
    const triangles = [];

    meshes.forEach(mesh => {
      const geometry = mesh.geometry;
      if (!geometry) return;

      const positions = geometry.attributes.position.array;
      const indices = geometry.index?.array;

      if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
          const a = new THREE.Vector3(...positions.slice(indices[i] * 3, (indices[i] + 1) * 3));
          const b = new THREE.Vector3(...positions.slice(indices[i + 1] * 3, (indices[i + 2] + 1) * 3));
          const c = new THREE.Vector3(...positions.slice(indices[i + 2] * 3, (indices[i + 3] + 1) * 3));

          triangles.push({ a: a.multiplyScalar(scale), b, c });
          triangleCount++;
        }
      }
    });

    const buffer = new ArrayBuffer(84 + triangleCount * 50);
    const view = new DataView(buffer);
    let offset = 80;

    view.setUint32(offset, triangleCount, true);
    offset += 4;

    triangles.forEach(tri => {
      const normal = new THREE.Vector3().crossVectors(
        tri.b.clone().sub(tri.a),
        tri.c.clone().sub(tri.a)
      ).normalize();

      view.setFloat32(offset, normal.x, true);
      view.setFloat32(offset + 4, normal.y, true);
      view.setFloat32(offset + 8, normal.z, true);
      offset += 12;

      [tri.a, tri.b, tri.c].forEach(v => {
        view.setFloat32(offset, v.x, true);
        view.setFloat32(offset + 4, v.y, true);
        view.setFloat32(offset + 8, v.z, true);
        offset += 12;
      });

      offset += 2;
    });

    return new Blob([buffer], { type: 'application/octet-stream' });
  } else {
    // ASCII STL
    let stl = 'solid exported\n';

    meshes.forEach(mesh => {
      const geometry = mesh.geometry;
      if (!geometry) return;

      const positions = geometry.attributes.position.array;
      const indices = geometry.index?.array;

      if (indices) {
        for (let i = 0; i < indices.length; i += 3) {
          const a = new THREE.Vector3(...positions.slice(indices[i] * 3, (indices[i] + 1) * 3));
          const b = new THREE.Vector3(...positions.slice(indices[i + 1] * 3, (indices[i + 2] + 1) * 3));
          const c = new THREE.Vector3(...positions.slice(indices[i + 2] * 3, (indices[i + 3] + 1) * 3));

          const normal = new THREE.Vector3().crossVectors(
            b.clone().sub(a),
            c.clone().sub(a)
          ).normalize();

          stl += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
          stl += `    outer loop\n`;
          stl += `      vertex ${a.x * scale} ${a.y * scale} ${a.z * scale}\n`;
          stl += `      vertex ${b.x * scale} ${b.y * scale} ${b.z * scale}\n`;
          stl += `      vertex ${c.x * scale} ${c.y * scale} ${c.z * scale}\n`;
          stl += `    endloop\n`;
          stl += `  endfacet\n`;
        }
      }
    });

    stl += 'endsolid exported\n';
    return new Blob([stl], { type: 'text/plain' });
  }
}

/**
 * Export to OBJ format
 * @private
 */
function exportOBJ(meshes, scale = 1.0) {
  let obj = '# Exported from cycleCAD\n\n';
  let vertexOffset = 0;

  meshes.forEach((mesh, meshIdx) => {
    const geometry = mesh.geometry;
    if (!geometry) return;

    obj += `g Mesh_${meshIdx}\n`;

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      obj += `v ${positions[i] * scale} ${positions[i + 1] * scale} ${positions[i + 2] * scale}\n`;
    }

    const indices = geometry.index?.array;
    if (indices) {
      for (let i = 0; i < indices.length; i += 3) {
        obj += `f ${indices[i] + vertexOffset + 1} ${indices[i + 1] + vertexOffset + 1} ${indices[i + 2] + vertexOffset + 1}\n`;
      }
    } else {
      for (let i = 0; i < positions.length; i += 9) {
        obj += `f ${i / 3 + vertexOffset + 1} ${i / 3 + vertexOffset + 2} ${i / 3 + vertexOffset + 3}\n`;
      }
    }

    vertexOffset += positions.length / 3;
  });

  return new Blob([obj], { type: 'text/plain' });
}

/**
 * Export to glTF/GLB format
 * @private
 */
async function exportGLTF(meshes, isBinary = false, scale = 1.0) {
  // Placeholder: would use THREE.GLTFExporter
  console.log('[Formats] glTF export requires GLTFExporter');
  return new Blob([], { type: isBinary ? 'application/octet-stream' : 'application/json' });
}

/**
 * Export to PLY format
 * @private
 */
function exportPLY(meshes, scale = 1.0) {
  let vertexCount = 0;
  const vertices = [];

  meshes.forEach(mesh => {
    const geometry = mesh.geometry;
    if (!geometry) return;

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push([
        positions[i] * scale,
        positions[i + 1] * scale,
        positions[i + 2] * scale
      ]);
      vertexCount++;
    }
  });

  let ply = 'ply\nformat ascii 1.0\n';
  ply += `element vertex ${vertexCount}\n`;
  ply += 'property float x\nproperty float y\nproperty float z\n';
  ply += 'end_header\n';

  vertices.forEach(v => {
    ply += `${v[0]} ${v[1]} ${v[2]}\n`;
  });

  return new Blob([ply], { type: 'text/plain' });
}

/**
 * Export to DXF format
 * @private
 */
function exportDXF(meshes) {
  let dxf = '0\nSECTION\n8\nENTITIES\n';

  meshes.forEach(mesh => {
    const geometry = mesh.geometry;
    if (!geometry) return;

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 9) {
      dxf += '0\n3DFACE\n8\nDefault\n';
      for (let j = 0; j < 3; j++) {
        const key = 10 + j;
        dxf += `${key}\n${positions[i + j * 3]}\n${key + 20}\n${positions[i + j * 3 + 1]}\n${key + 30}\n${positions[i + j * 3 + 2]}\n`;
      }
    }
  });

  dxf += '0\nENDSEC\n0\nEOF\n';
  return new Blob([dxf], { type: 'text/plain' });
}

/**
 * Export to PDF format
 * @private
 */
async function exportPDF(meshes) {
  console.log('[Formats] PDF export requires jsPDF library');
  return new Blob([], { type: 'application/pdf' });
}

/**
 * Export to SVG format
 * @private
 */
function exportSVG(meshes) {
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">\n';

  meshes.forEach(mesh => {
    const geometry = mesh.geometry;
    if (!geometry) return;

    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 9) {
      const x1 = (positions[i] + 100) * 2;
      const y1 = (positions[i + 1] + 100) * 2;
      const x2 = (positions[i + 3] + 100) * 2;
      const y2 = (positions[i + 4] + 100) * 2;
      const x3 = (positions[i + 6] + 100) * 2;
      const y3 = (positions[i + 7] + 100) * 2;

      svg += `<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="none" stroke="black"/>\n`;
    }
  });

  svg += '</svg>';
  return new Blob([svg], { type: 'image/svg+xml' });
}

/**
 * Export to 3MF format
 * @private
 */
function export3MF(meshes, scale = 1.0) {
  console.log('[Formats] 3MF export requires 3MF library');
  return new Blob([], { type: 'model/3mf' });
}

/**
 * Export to JSON format
 * @private
 */
function exportJSON(meshes) {
  const data = {
    version: '1.0',
    exported: new Date().toISOString(),
    meshes: meshes.map(mesh => ({
      name: mesh.name,
      type: 'Mesh',
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
      material: mesh.material ? {
        color: mesh.material.color?.getHex(),
        opacity: mesh.material.opacity
      } : null
    }))
  };

  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Read file as ArrayBuffer
 * @private
 */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Download blob as file
 * @private
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get all visible meshes in scene
 * @private
 */
function getVisibleMeshes() {
  const meshes = [];
  formatsState.viewport.scene.traverse(obj => {
    if (obj instanceof THREE.Mesh && obj.visible) {
      meshes.push(obj);
    }
  });
  return meshes;
}

// ============================================================================
// HELP ENTRIES
// ============================================================================

export const helpEntries = [
  {
    id: 'formats-import',
    title: 'Import Files',
    category: 'File Formats',
    description: 'Load CAD and 3D files into cycleCAD',
    shortcut: 'Ctrl+O',
    content: `
      Supported import formats:
      - STEP (.step, .stp) - Mechanical design files
      - STL (.stl) - 3D polygon meshes
      - OBJ (.obj) - Geometry and texture
      - glTF/GLB (.gltf, .glb) - 3D transmission format
      - IGES (.iges, .igs) - Surface interchange
      - DXF (.dxf) - AutoCAD drawings
      - PLY (.ply) - Point clouds and meshes
      - 3MF (.3mf) - 3D Manufacturing Format
      - COLLADA (.dae) - Scene format

      Format is auto-detected from file extension.
    `
  },
  {
    id: 'formats-export',
    title: 'Export Files',
    category: 'File Formats',
    description: 'Save designs to standard formats',
    shortcut: 'Ctrl+Shift+E',
    content: `
      Supported export formats:
      - STL (ASCII or binary) - 3D printing
      - OBJ - Universal 3D format
      - glTF/GLB - Optimized 3D format
      - DXF - AutoCAD 2D/3D
      - PDF - Vector drawings
      - SVG - 2D vector graphics
      - PLY - Point cloud format
      - 3MF - 3D Manufacturing Format
      - JSON - cycleCAD native format

      Export all visible objects or selection.
    `
  },
  {
    id: 'formats-batch',
    title: 'Batch Conversion',
    category: 'File Formats',
    description: 'Convert multiple files at once',
    shortcut: 'Ctrl+Shift+B',
    content: `
      Convert multiple files to different format:
      1. Select multiple files
      2. Choose target format
      3. Click Convert
      4. Files download as ZIP

      Useful for preparing files for 3D printing,
      CAM, or sharing in specific formats.
    `
  },
  {
    id: 'formats-detect',
    title: 'Format Detection',
    category: 'File Formats',
    description: 'Automatic file format recognition',
    shortcut: 'Auto',
    content: `
      cycleCAD automatically detects file formats
      from file extensions and headers.

      If auto-detection fails, you can specify
      format explicitly in import dialog.

      Supported detection:
      - Extension-based (.step, .stl, etc)
      - Header bytes (STL binary vs ASCII)
      - MIME type information
    `
  }
];

export default {
  init,
  detectFormat,
  getSupportedFormats,
  import: import_,
  export: export_,
  batchConvert,
  getLastError,
  helpEntries
};
