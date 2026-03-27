/**
 * export.js - cycleCAD Export Module
 * Handles exporting 3D models in various formats (STL, OBJ, glTF, STEP, JSON)
 * and importing cycleCAD native JSON format
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

/**
 * Download a file to the user's computer
 * @param {string|ArrayBuffer} content - File content
 * @param {string} filename - Filename for download
 * @param {string} mimeType - MIME type (e.g., 'text/plain', 'application/octet-stream')
 */
export function downloadFile(content, filename, mimeType) {
  let blob;
  if (content instanceof ArrayBuffer) {
    blob = new Blob([content], { type: mimeType });
  } else {
    blob = new Blob([content], { type: mimeType });
  }

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
 * Extract triangles from a Three.js BufferGeometry
 * Handles both indexed and non-indexed geometries
 * @param {THREE.BufferGeometry} geometry - The geometry to extract from
 * @returns {Array<{vertices: number[][], normal: number[]}>} Array of triangles
 */
function extractTrianglesFromGeometry(geometry) {
  const triangles = [];
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const indices = geometry.getIndex();

  if (!positions) return triangles;

  const posArray = positions.array;
  const normArray = normals ? normals.array : null;
  const indexArray = indices ? indices.array : null;

  let triangleCount;
  if (indexArray) {
    triangleCount = indexArray.length / 3;
  } else {
    triangleCount = posArray.length / 9; // 3 vertices * 3 coords per triangle
  }

  for (let i = 0; i < triangleCount; i++) {
    let idx0, idx1, idx2;

    if (indexArray) {
      idx0 = indexArray[i * 3] * 3;
      idx1 = indexArray[i * 3 + 1] * 3;
      idx2 = indexArray[i * 3 + 2] * 3;
    } else {
      idx0 = i * 9;
      idx1 = i * 9 + 3;
      idx2 = i * 9 + 6;
    }

    const v0 = [posArray[idx0], posArray[idx0 + 1], posArray[idx0 + 2]];
    const v1 = [posArray[idx1], posArray[idx1 + 1], posArray[idx1 + 2]];
    const v2 = [posArray[idx2], posArray[idx2 + 1], posArray[idx2 + 2]];

    let normal = [0, 0, 1];
    if (normArray) {
      const nIdx = (indexArray ? indexArray[i * 3] : i * 3) * 3;
      normal = [normArray[nIdx], normArray[nIdx + 1], normArray[nIdx + 2]];
    } else {
      // Calculate normal from vertices if not provided
      const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      normal = crossProduct(edge1, edge2);
      normal = normalizeVector(normal);
    }

    triangles.push({
      vertices: [v0, v1, v2],
      normal: normal
    });
  }

  return triangles;
}

/**
 * Calculate cross product of two 3D vectors
 * @param {number[]} a - Vector A
 * @param {number[]} b - Vector B
 * @returns {number[]} Cross product
 */
function crossProduct(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

/**
 * Normalize a 3D vector
 * @param {number[]} v - Vector to normalize
 * @returns {number[]} Normalized vector
 */
function normalizeVector(v) {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (length === 0) return [0, 0, 1];
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Transform a 3D point by a 4x4 matrix
 * @param {number[]} point - Point [x, y, z]
 * @param {THREE.Matrix4} matrix - Transform matrix
 * @returns {number[]} Transformed point
 */
function transformPoint(point, matrix) {
  const v = new THREE.Vector3(point[0], point[1], point[2]);
  v.applyMatrix4(matrix);
  return [v.x, v.y, v.z];
}

/**
 * Export features as ASCII STL format
 * @param {Array} features - Array of feature objects with mesh property
 * @param {string} filename - Output filename
 */
export function exportSTL(features, filename = 'model.stl') {
  let stlContent = 'solid cycleCAD_Model\n';

  features.forEach((feature, fIdx) => {
    if (!feature.mesh || !feature.mesh.geometry) return;

    const geometry = feature.mesh.geometry.clone();
    geometry.computeVertexNormals();

    const triangles = extractTrianglesFromGeometry(geometry);
    const worldMatrix = feature.mesh.matrixWorld;

    triangles.forEach(triangle => {
      const v0 = transformPoint(triangle.vertices[0], worldMatrix);
      const v1 = transformPoint(triangle.vertices[1], worldMatrix);
      const v2 = transformPoint(triangle.vertices[2], worldMatrix);

      // Recalculate normal from world-space vertices
      const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      const normal = normalizeVector(crossProduct(edge1, edge2));

      stlContent += `  facet normal ${normal[0].toFixed(8)} ${normal[1].toFixed(8)} ${normal[2].toFixed(8)}\n`;
      stlContent += `    outer loop\n`;
      stlContent += `      vertex ${v0[0].toFixed(8)} ${v0[1].toFixed(8)} ${v0[2].toFixed(8)}\n`;
      stlContent += `      vertex ${v1[0].toFixed(8)} ${v1[1].toFixed(8)} ${v1[2].toFixed(8)}\n`;
      stlContent += `      vertex ${v2[0].toFixed(8)} ${v2[1].toFixed(8)} ${v2[2].toFixed(8)}\n`;
      stlContent += `    endloop\n`;
      stlContent += `  endfacet\n`;
    });
  });

  stlContent += 'endsolid cycleCAD_Model\n';
  downloadFile(stlContent, filename, 'text/plain');
}

/**
 * Export features as Binary STL format (more compact)
 * @param {Array} features - Array of feature objects with mesh property
 * @param {string} filename - Output filename
 */
export function exportSTLBinary(features, filename = 'model.stl') {
  const triangles = [];

  features.forEach((feature, fIdx) => {
    if (!feature.mesh || !feature.mesh.geometry) return;

    const geometry = feature.mesh.geometry.clone();
    geometry.computeVertexNormals();

    const tris = extractTrianglesFromGeometry(geometry);
    const worldMatrix = feature.mesh.matrixWorld;

    tris.forEach(triangle => {
      const v0 = transformPoint(triangle.vertices[0], worldMatrix);
      const v1 = transformPoint(triangle.vertices[1], worldMatrix);
      const v2 = transformPoint(triangle.vertices[2], worldMatrix);

      const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      const normal = normalizeVector(crossProduct(edge1, edge2));

      triangles.push({
        normal: normal,
        vertices: [v0, v1, v2]
      });
    });
  });

  // Create binary buffer
  // 80-byte header + 4-byte triangle count + (50 bytes per triangle)
  const buffer = new ArrayBuffer(80 + 4 + triangles.length * 50);
  const view = new DataView(buffer);

  // Header (80 bytes of zeros, can be used for description)
  const headerText = 'cycleCAD STL Binary Export'.padEnd(80, '\0');
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, headerText.charCodeAt(i));
  }

  // Triangle count (4 bytes, little-endian)
  view.setUint32(80, triangles.length, true);

  // Triangle data (50 bytes each)
  let offset = 84;
  triangles.forEach(tri => {
    // Normal (3 × float32)
    view.setFloat32(offset, tri.normal[0], true);
    view.setFloat32(offset + 4, tri.normal[1], true);
    view.setFloat32(offset + 8, tri.normal[2], true);
    offset += 12;

    // Vertices (3 vertices × 3 coords × float32)
    tri.vertices.forEach(vertex => {
      view.setFloat32(offset, vertex[0], true);
      view.setFloat32(offset + 4, vertex[1], true);
      view.setFloat32(offset + 8, vertex[2], true);
      offset += 12;
    });

    // Attribute byte count (2 bytes, usually 0)
    view.setUint16(offset, 0, true);
    offset += 2;
  });

  downloadFile(buffer, filename, 'application/octet-stream');
}

/**
 * Export features as Wavefront OBJ format
 * @param {Array} features - Array of feature objects with mesh property
 * @param {string} filename - Output filename
 */
export function exportOBJ(features, filename = 'model.obj') {
  let objContent = '# cycleCAD OBJ Export\n';
  objContent += '# https://github.com/vvlars-cmd/cyclecad\n\n';

  let vertexOffset = 0;
  let normalOffset = 0;

  features.forEach((feature, fIdx) => {
    if (!feature.mesh || !feature.mesh.geometry) return;

    const geometry = feature.mesh.geometry.clone();
    geometry.computeVertexNormals();

    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const indices = geometry.getIndex();

    if (!positions) return;

    objContent += `g feature_${fIdx}\n`;
    objContent += `usemtl material_${fIdx}\n`;

    const posArray = positions.array;
    const normArray = normals ? normals.array : null;
    const worldMatrix = feature.mesh.matrixWorld;

    // Write vertices
    const vertexCount = posArray.length / 3;
    for (let i = 0; i < vertexCount; i++) {
      const v = transformPoint(
        [posArray[i * 3], posArray[i * 3 + 1], posArray[i * 3 + 2]],
        worldMatrix
      );
      objContent += `v ${v[0].toFixed(8)} ${v[1].toFixed(8)} ${v[2].toFixed(8)}\n`;
    }

    // Write normals
    if (normArray) {
      const normCount = normArray.length / 3;
      for (let i = 0; i < normCount; i++) {
        objContent += `vn ${normArray[i * 3].toFixed(8)} ${normArray[i * 3 + 1].toFixed(8)} ${normArray[i * 3 + 2].toFixed(8)}\n`;
      }
    }

    // Write faces
    const indexArray = indices ? indices.array : null;
    let triangleCount;
    if (indexArray) {
      triangleCount = indexArray.length / 3;
    } else {
      triangleCount = posArray.length / 9;
    }

    for (let i = 0; i < triangleCount; i++) {
      let idx0, idx1, idx2;

      if (indexArray) {
        idx0 = indexArray[i * 3] + 1 + vertexOffset; // OBJ uses 1-based indexing
        idx1 = indexArray[i * 3 + 1] + 1 + vertexOffset;
        idx2 = indexArray[i * 3 + 2] + 1 + vertexOffset;
      } else {
        idx0 = i * 3 + 1 + vertexOffset;
        idx1 = i * 3 + 2 + vertexOffset;
        idx2 = i * 3 + 3 + vertexOffset;
      }

      if (normArray) {
        const nIdx0 = idx0 + normalOffset - 1;
        const nIdx1 = idx1 + normalOffset - 1;
        const nIdx2 = idx2 + normalOffset - 1;
        objContent += `f ${idx0}/${idx0}/${nIdx0} ${idx1}/${idx1}/${nIdx1} ${idx2}/${idx2}/${nIdx2}\n`;
      } else {
        objContent += `f ${idx0} ${idx1} ${idx2}\n`;
      }
    }

    vertexOffset += vertexCount;
    if (normArray) normalOffset += normArray.length / 3;
  });

  // Append MTL reference
  objContent += '\n# Material definitions\n';
  objContent += '# Uncomment below or create separate .mtl file\n';
  features.forEach((feature, fIdx) => {
    objContent += `# newmtl material_${fIdx}\n`;
    objContent += `# Kd 0.8 0.8 0.8\n`;
  });

  downloadFile(objContent, filename, 'text/plain');
}

/**
 * Export features as glTF 2.0 JSON format
 * @param {Array} features - Array of feature objects with mesh property
 * @param {string} filename - Output filename (usually .gltf)
 */
export function exportGLTF(features, filename = 'model.gltf') {
  const gltf = {
    asset: {
      version: '2.0',
      generator: 'cycleCAD v0.1'
    },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    geometries: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: []
  };

  let bufferData = [];
  let bufferViewIndex = 0;
  let accessorIndex = 0;
  let nodeIndex = 0;

  features.forEach((feature, fIdx) => {
    if (!feature.mesh || !feature.mesh.geometry) return;

    const geometry = feature.mesh.geometry.clone();
    geometry.computeVertexNormals();

    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const indices = geometry.getIndex();

    if (!positions) return;

    const posArray = positions.array;
    const normArray = normals ? normals.array : null;
    const indexArray = indices ? indices.array : null;
    const worldMatrix = feature.mesh.matrixWorld;

    // Apply world matrix to positions
    const transformedPos = [];
    const vertexCount = posArray.length / 3;
    for (let i = 0; i < vertexCount; i++) {
      const v = transformPoint(
        [posArray[i * 3], posArray[i * 3 + 1], posArray[i * 3 + 2]],
        worldMatrix
      );
      transformedPos.push(...v);
    }

    // Create position accessor
    const posAccessor = {
      bufferView: bufferViewIndex,
      componentType: 5126, // FLOAT
      count: vertexCount,
      type: 'VEC3',
      min: [Math.min(...transformedPos.filter((_, i) => i % 3 === 0)),
            Math.min(...transformedPos.filter((_, i) => i % 3 === 1)),
            Math.min(...transformedPos.filter((_, i) => i % 3 === 2))],
      max: [Math.max(...transformedPos.filter((_, i) => i % 3 === 0)),
            Math.max(...transformedPos.filter((_, i) => i % 3 === 1)),
            Math.max(...transformedPos.filter((_, i) => i % 3 === 2))]
    };

    const posAccessorIndex = accessorIndex++;
    gltf.accessors.push(posAccessor);

    // Add position data to buffer
    const posBuffer = new Float32Array(transformedPos);
    bufferData.push(posBuffer);

    gltf.bufferViews.push({
      buffer: 0,
      byteOffset: bufferData.reduce((sum, buf) => sum + buf.byteLength, 0) - posBuffer.byteLength,
      byteLength: posBuffer.byteLength,
      target: 34962 // ARRAY_BUFFER
    });
    bufferViewIndex++;

    // Create normal accessor if available
    let normalAccessorIndex = -1;
    if (normArray) {
      const normAccessor = {
        bufferView: bufferViewIndex,
        componentType: 5126,
        count: vertexCount,
        type: 'VEC3'
      };
      normalAccessorIndex = accessorIndex++;
      gltf.accessors.push(normAccessor);

      const normBuffer = new Float32Array(normArray);
      bufferData.push(normBuffer);

      gltf.bufferViews.push({
        buffer: 0,
        byteOffset: bufferData.reduce((sum, buf) => sum + buf.byteLength, 0) - normBuffer.byteLength,
        byteLength: normBuffer.byteLength,
        target: 34962
      });
      bufferViewIndex++;
    }

    // Create index accessor if available
    let indicesAccessorIndex = -1;
    if (indexArray) {
      const indAccessor = {
        bufferView: bufferViewIndex,
        componentType: 5125, // UNSIGNED_INT
        count: indexArray.length,
        type: 'SCALAR'
      };
      indicesAccessorIndex = accessorIndex++;
      gltf.accessors.push(indAccessor);

      const indBuffer = new Uint32Array(indexArray);
      bufferData.push(indBuffer);

      gltf.bufferViews.push({
        buffer: 0,
        byteOffset: bufferData.reduce((sum, buf) => sum + buf.byteLength, 0) - indBuffer.byteLength,
        byteLength: indBuffer.byteLength,
        target: 34963 // ELEMENT_ARRAY_BUFFER
      });
      bufferViewIndex++;
    }

    // Create primitive
    const primitive = {
      attributes: {
        POSITION: posAccessorIndex
      },
      mode: 4 // TRIANGLES
    };

    if (normalAccessorIndex >= 0) {
      primitive.attributes.NORMAL = normalAccessorIndex;
    }

    if (indicesAccessorIndex >= 0) {
      primitive.indices = indicesAccessorIndex;
    }

    // Create material
    const materialIndex = gltf.materials.length;
    gltf.materials.push({
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.8, 0.8, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 1.0
      }
    });
    primitive.material = materialIndex;

    // Create mesh
    const meshIndex = gltf.meshes.length;
    gltf.meshes.push({
      primitives: [primitive]
    });

    // Create node
    const nodeIdx = gltf.nodes.length;
    gltf.nodes.push({
      mesh: meshIndex,
      name: `feature_${fIdx}`
    });

    gltf.scenes[0].nodes.push(nodeIdx);
  });

  // Combine all buffer data
  let totalSize = 0;
  bufferData.forEach(buf => totalSize += buf.byteLength);

  const combinedBuffer = new Uint8Array(totalSize);
  let offset = 0;
  bufferData.forEach(buf => {
    combinedBuffer.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), offset);
    offset += buf.byteLength;
  });

  const base64Buffer = btoa(String.fromCharCode.apply(null, combinedBuffer));
  gltf.buffers = [{
    byteLength: totalSize,
    uri: `data:application/octet-stream;base64,${base64Buffer}`
  }];

  const gltfContent = JSON.stringify(gltf, null, 2);
  downloadFile(gltfContent, filename, 'application/json');
}

/**
 * Export features as STEP format
 * Note: STEP export requires OpenCascade.js to be loaded
 * @param {Array} features - Array of feature objects
 * @param {Object} occt - OpenCascade.js instance (optional)
 * @param {string} filename - Output filename
 */
export function exportSTEP(features, occt = null, filename = 'model.step') {
  if (!occt) {
    console.error('STEP export requires OpenCascade.js kernel. Please load it first.');
    alert('STEP export requires OpenCascade.js to be loaded.\n\nAdd this to your HTML:\n<script src="https://cdn.jsdelivr.net/npm/opencascade.js@latest/dist/opencascade.wasm.js"><\/script>');
    return;
  }

  try {
    // Create STEP writer
    const step = new occt.STEPControl_Writer();

    features.forEach((feature, fIdx) => {
      if (!feature.mesh || !feature.mesh.geometry) return;

      // This is a simplified stub - actual implementation would:
      // 1. Convert Three.js mesh vertices to OCCT vertices
      // 2. Build OCCT edges and wires
      // 3. Create faces from wires
      // 4. Combine into compound shapes
      // 5. Write to STEP

      // For now, just show a placeholder
      console.warn(`Feature ${fIdx} conversion to OCCT shapes not yet implemented`);
    });

    // Placeholder: would write step.Write(filename, ...)
    alert('STEP export is currently a stub.\n\nImplementation requires:\n- OpenCascade.js loaded\n- Three.js → OCCT shape conversion\n- STEP writer API calls\n\nFor now, use STL/OBJ export instead.');
  } catch (error) {
    console.error('STEP export error:', error);
    alert(`STEP export failed: ${error.message}`);
  }
}

/**
 * Export features as cycleCAD native JSON format
 * This format preserves all feature parameters for re-opening and editing
 * @param {Array} features - Array of feature objects with type, params, etc.
 * @param {string} filename - Output filename
 */
export function exportJSON(features, filename = 'model.cyclecad.json') {
  const exportData = {
    version: '0.1',
    timestamp: new Date().toISOString(),
    features: features.map(feature => ({
      id: feature.id || `feature_${Math.random().toString(36).substr(2, 9)}`,
      type: feature.type, // 'box', 'sphere', 'cylinder', 'sketch', etc.
      name: feature.name || feature.type,
      visible: feature.visible !== false,
      params: feature.params || {}, // Feature-specific parameters
      sketch: feature.sketch || null, // Sketch data if applicable
      operations: feature.operations || [], // Applied operations (fillet, chamfer, etc.)
      material: feature.material || 'default',
      metadata: {
        created: feature.created || new Date().toISOString(),
        modified: new Date().toISOString()
      }
    }))
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  downloadFile(jsonContent, filename, 'application/json');
}

/**
 * Import cycleCAD native JSON format
 * @param {string} jsonString - JSON string to parse
 * @returns {Object} Parsed data with version and features array
 */
export function importJSON(jsonString) {
  try {
    const data = JSON.parse(jsonString);

    // Validate structure
    if (!data.version || !Array.isArray(data.features)) {
      throw new Error('Invalid cycleCAD JSON format. Expected { version, features }');
    }

    // Version compatibility check
    const majorVersion = parseInt(data.version.split('.')[0]);
    if (majorVersion > 0) {
      console.warn(`JSON version ${data.version} may have compatibility issues`);
    }

    return data;
  } catch (error) {
    console.error('JSON import error:', error);
    throw error;
  }
}

/**
 * Batch export all formats
 * Exports model in STL, OBJ, and glTF formats simultaneously
 * @param {Array} features - Array of feature objects
 * @param {string} baseName - Base filename without extension
 */
export function exportAllFormats(features, baseName = 'model') {
  exportSTL(features, `${baseName}.stl`);
  exportOBJ(features, `${baseName}.obj`);
  exportGLTF(features, `${baseName}.gltf`);
  exportJSON(features, `${baseName}.cyclecad.json`);
}

export default {
  downloadFile,
  exportSTL,
  exportSTLBinary,
  exportOBJ,
  exportGLTF,
  exportSTEP,
  exportJSON,
  importJSON,
  exportAllFormats
};
