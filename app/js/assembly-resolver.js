/**
 * Assembly Resolver — ES Module for cycleCAD
 * Resolves Autodesk Inventor .iam (assembly) files into hierarchical trees
 * Extracts component references, builds BOMs, categorizes parts
 * Reuses OLE2 parsing pattern from inventor-parser.js
 */

// ============================================================================
// OLE2 PARSER (reused pattern)
// ============================================================================

const OLE2_SIGNATURE = 0xD0CF11E0;
const SECTOR_SIZE = 512;
const DIR_ENTRY_SIZE = 128;

function parseOLE2(buffer) {
  const view = new DataView(buffer.buffer || buffer);
  const bufArr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const sig1 = view.getUint32(0, false);
  if (sig1 !== 0xD0CF11E0) {
    throw new Error('Invalid OLE2 signature');
  }

  const sectorSizePow = view.getUint16(30, true);
  const sectorSize = 1 << sectorSizePow;
  const totalFATSectors = view.getUint32(44, true);
  const dirStartSector = view.getInt32(48, true);

  const fat = [];
  for (let i = 0; i < Math.min(totalFATSectors, 109); i++) {
    const fatSectorID = view.getInt32(76 + i * 4, true);
    if (fatSectorID < 0) break;
    const offset = (fatSectorID + 1) * sectorSize;
    if (offset + sectorSize > bufArr.length) break;
    for (let j = 0; j < sectorSize / 4; j++) {
      fat.push(view.getInt32(offset + j * 4, true));
    }
  }

  function readChain(startSector, maxSize = Infinity) {
    const chunks = [];
    let sector = startSector;
    let totalRead = 0;
    let safety = 0;
    while (sector >= 0 && sector < fat.length && safety < 50000 && totalRead < maxSize) {
      const offset = (sector + 1) * sectorSize;
      if (offset + sectorSize > bufArr.length) break;
      chunks.push(bufArr.slice(offset, offset + sectorSize));
      totalRead += sectorSize;
      sector = fat[sector];
      safety++;
    }
    const result = new Uint8Array(totalRead);
    let pos = 0;
    for (const c of chunks) { result.set(c, pos); pos += c.length; }
    return result;
  }

  const dirData = readChain(dirStartSector, 200 * sectorSize);
  const entries = [];
  for (let i = 0; i < dirData.length; i += 128) {
    const nameLen = dirData[i + 64] | (dirData[i + 65] << 8);
    let name = '';
    for (let c = 0; c < Math.min(nameLen, 64) - 2; c += 2) {
      const ch = dirData[i + c] | (dirData[i + c + 1] << 8);
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    const type = dirData[i + 66];
    const startSector = dirData[i + 116] | (dirData[i + 117] << 8) | (dirData[i + 118] << 16) | (dirData[i + 119] << 24);
    const size = dirData[i + 120] | (dirData[i + 121] << 8) | (dirData[i + 122] << 16) | (dirData[i + 123] << 24);
    if (type > 0 && name) entries.push({ name, type, startSector, size });
  }

  return {
    sectorSize,
    entries,
    fat,
    getStream(name) {
      const entry = entries.find(e => e.name === name && e.type === 2);
      if (!entry || entry.size <= 0) return null;
      const raw = readChain(entry.startSector, entry.size + sectorSize);
      return raw.slice(0, Math.min(raw.length, entry.size));
    },
    getAllStreams() {
      return entries.filter(e => e.type === 2 && e.size > 0);
    }
  };
}

// ============================================================================
// ASSEMBLY REFERENCE EXTRACTOR
// ============================================================================

function extractReferences(ole2) {
  const references = [];

  // Try RSeDbTransactableRoutingData stream
  let data = ole2.getStream('RSeDbTransactableRoutingData');
  if (!data) {
    // Fallback to first available stream
    const allStreams = ole2.getAllStreams();
    if (allStreams.length > 0) {
      data = ole2.getStream(allStreams[0].name);
    }
  }

  if (!data) return references;

  // Decode as UTF-16LE to find component references
  const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(data);
  const ascii = new TextDecoder('ascii', { fatal: false }).decode(data);

  // Scan for .ipt and .iam file references
  const patterns = [
    /[\x00-\x7F]*?([^\x00\x01-\x08\x0B\x0C\x0E-\x1F\/\\]+\.ipt)/gi,
    /[\x00-\x7F]*?([^\x00\x01-\x08\x0B\x0C\x0E-\x1F\/\\]+\.iam)/gi,
  ];

  const seen = new Set();

  // UTF-16LE scan
  const utf16Lines = utf16.split(/[\n\r\x00]/);
  for (const line of utf16Lines) {
    const matches = line.match(/([^\/\\\\]+\.(ipt|iam))/gi) || [];
    for (const match of matches) {
      const normalized = match.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        references.push(match);
      }
    }
  }

  // ASCII scan (case insensitive)
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(ascii)) !== null) {
      const normalized = match[1].toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        references.push(match[1]);
      }
    }
  }

  return references;
}

// ============================================================================
// PATH RESOLUTION
// ============================================================================

function resolvePath(relativePath, iamLocation, projectFiles, workspace) {
  // Normalize path separators
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();

  // Try exact match in projectFiles
  for (const file of projectFiles) {
    if (file.path.toLowerCase().endsWith(normalized)) {
      return file;
    }
    if (file.name.toLowerCase() === normalized) {
      return file;
    }
  }

  // Try relative to .iam directory
  const iamDir = iamLocation.substring(0, iamLocation.lastIndexOf('/'));
  const resolvedRelative = (iamDir + '/' + normalized).replace(/\/+/g, '/');
  for (const file of projectFiles) {
    if (file.path.toLowerCase() === resolvedRelative) {
      return file;
    }
  }

  // Try workspace root
  if (workspace) {
    const workspaceRelative = (workspace + '/' + normalized).replace(/\/+/g, '/');
    for (const file of projectFiles) {
      if (file.path.toLowerCase() === workspaceRelative) {
        return file;
      }
    }
  }

  // Content Center check (standard parts)
  if (normalized.includes('content center') || normalized.match(/^[a-z0-9_-]+\.(ipt|iam)$/)) {
    return {
      path: normalized,
      name: normalized.split('/').pop(),
      category: 'standard',
      isStandard: true
    };
  }

  return null;
}

// ============================================================================
// COMPONENT CATEGORIZATION
// ============================================================================

function categorizeComponent(filePath, componentName) {
  const lower = filePath.toLowerCase();

  if (lower.includes('zukaufteile')) return 'vendor';
  if (lower.includes('content center') || lower.includes('standard')) return 'standard';
  if (lower.includes('din') || lower.includes('iso')) return 'standard';
  if (lower.match(/\/din|\/iso|^din|^iso/i)) return 'standard';

  // Common vendor parts
  if (/igus|interroll|weg|rittal|bosch|siemens|phoenix/i.test(filePath)) {
    return 'vendor';
  }

  return 'custom';
}

// ============================================================================
// ASSEMBLY RESOLUTION
// ============================================================================

export function resolveAssembly(iamBuffer, projectFiles, iamPath = '', workspace = '') {
  try {
    const ole2 = parseOLE2(iamBuffer);
    const references = extractReferences(ole2);

    const assemblyName = iamPath.split('/').pop()?.replace(/\.iam$/i, '') || 'Assembly';

    const tree = {
      name: assemblyName,
      path: iamPath,
      type: 'assembly',
      children: [],
      components: []
    };

    const instanceMap = {};
    const resolvedParts = [];

    for (const ref of references) {
      const resolved = resolvePath(ref, iamPath, projectFiles, workspace);
      if (!resolved) continue;

      const category = categorizeComponent(resolved.path, resolved.name);
      const key = resolved.path.toLowerCase();

      if (instanceMap[key]) {
        instanceMap[key].quantity++;
      } else {
        instanceMap[key] = {
          name: resolved.name,
          path: resolved.path,
          category,
          quantity: 1,
          isAssembly: ref.toLowerCase().endsWith('.iam'),
          isStandard: resolved.isStandard || false
        };
      }
    }

    // Build component list
    for (const [key, comp] of Object.entries(instanceMap)) {
      resolvedParts.push(comp);
      tree.components.push(comp);
    }

    tree.componentCount = resolvedParts.length;
    tree.totalInstances = resolvedParts.reduce((sum, p) => sum + p.quantity, 0);

    return tree;
  } catch (err) {
    console.error('Assembly resolution error:', err);
    return {
      name: 'Error',
      error: err.message,
      children: [],
      components: []
    };
  }
}

// ============================================================================
// BOM GENERATION
// ============================================================================

export function generateBOM(assemblyTree) {
  const bom = [];
  let partNumber = 1;

  if (!assemblyTree.components) return bom;

  // Sort: custom, standard, vendor
  const categoryOrder = { custom: 0, standard: 1, vendor: 2 };
  const sorted = [...assemblyTree.components].sort((a, b) => {
    const catA = categoryOrder[a.category] || 3;
    const catB = categoryOrder[b.category] || 3;
    return catA - catB;
  });

  for (const comp of sorted) {
    bom.push({
      partNumber,
      name: comp.name,
      quantity: comp.quantity,
      category: comp.category,
      filePath: comp.path,
      isAssembly: comp.isAssembly,
      isStandard: comp.isStandard
    });
    partNumber++;
  }

  return bom;
}

// ============================================================================
// DOM RENDERING
// ============================================================================

export function renderAssemblyTree(container, tree) {
  if (!container) return;
  container.innerHTML = '';

  const treeEl = document.createElement('div');
  treeEl.className = 'assembly-tree';
  treeEl.style.cssText = `
    font-family: monospace;
    font-size: 12px;
    color: #333;
    line-height: 1.6;
  `;

  function renderNode(node, depth = 0) {
    const indent = depth * 20;
    const div = document.createElement('div');
    div.style.marginLeft = indent + 'px';

    const icon = node.type === 'assembly' ? '📦' : '📄';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight: bold; cursor: pointer; padding: 4px;';
    title.textContent = `${icon} ${node.name}`;
    div.appendChild(title);

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        div.appendChild(renderNode(child, depth + 1));
      }
    }

    return div;
  }

  treeEl.appendChild(renderNode(tree));
  container.appendChild(treeEl);
}

// ============================================================================
// BOM EXPORT
// ============================================================================

export function exportBOMCSV(bom) {
  if (!bom || bom.length === 0) {
    console.warn('BOM is empty');
    return;
  }

  // CSV header
  const headers = ['Part #', 'Name', 'Qty', 'Category', 'File Path', 'Type'];
  const rows = [headers.join(',')];

  for (const item of bom) {
    const type = item.isAssembly ? 'Assembly' : 'Part';
    const row = [
      item.partNumber,
      `"${item.name.replace(/"/g, '""')}"`,
      item.quantity,
      item.category,
      `"${item.filePath.replace(/"/g, '""')}"`,
      type
    ];
    rows.push(row.join(','));
  }

  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.setAttribute('href', URL.createObjectURL(blob));
  link.setAttribute('download', `BOM_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// BATCH RESOLUTION (multiple assemblies)
// ============================================================================

export function resolveAssemblyBatch(iamBuffers, projectFiles, workspace = '') {
  const results = [];
  for (const [path, buffer] of Object.entries(iamBuffers)) {
    const tree = resolveAssembly(buffer, projectFiles, path, workspace);
    results.push({ path, tree });
  }
  return results;
}

// ============================================================================
// UTILITIES
// ============================================================================

export function createComponentIndex(tree) {
  const index = new Map();

  function traverse(node, depth = 0) {
    if (node.components) {
      for (const comp of node.components) {
        const key = comp.path.toLowerCase();
        if (!index.has(key)) {
          index.set(key, {
            component: comp,
            usageCount: 0,
            instances: []
          });
        }
        index.get(key).usageCount += comp.quantity;
        index.get(key).instances.push({ assemblyPath: node.path, quantity: comp.quantity });
      }
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(tree);
  return index;
}

export function getMaterialEstimate(bom, materialDensities = {}) {
  const densities = {
    aluminum: 2.7,
    steel: 7.85,
    stainless: 7.75,
    plastic: 1.05,
    ...materialDensities
  };

  let totalWeight = 0;
  for (const item of bom) {
    const material = Object.keys(densities).find(m =>
      item.name.toLowerCase().includes(m)
    ) || 'steel';
    const density = densities[material];
    totalWeight += (item.quantity || 1) * (density || 1);
  }

  return {
    totalWeight,
    estimatedMaterial: 'steel',
    unit: 'kg (estimated)'
  };
}

export default {
  resolveAssembly,
  generateBOM,
  renderAssemblyTree,
  exportBOMCSV,
  resolveAssemblyBatch,
  createComponentIndex,
  getMaterialEstimate
};
