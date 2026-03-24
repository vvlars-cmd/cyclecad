/**
 * project-loader.js - ES Module for loading Inventor projects
 *
 * Handles parsing .ipj files, indexing project contents, and providing
 * a folder-based file selection UI for Inventor project structures.
 *
 * Exports:
 *   - loadProject(directoryHandle)
 *   - parseIPJ(buffer)
 *   - indexFiles(entries)
 *   - getProjectStats()
 *   - getFileByPath(path)
 *   - showFolderPicker()
 */

// ============================================================================
// FILE TYPE CONSTANTS
// ============================================================================

const INVENTOR_EXTENSIONS = {
  IPT: '.ipt',   // Part files
  IAM: '.iam',   // Assembly files
  IPJ: '.ipj',   // Project files
  IDW: '.idw',   // Drawing files
  DWG: '.dwg',   // AutoCAD drawing files
};

const FILE_CATEGORIES = {
  PART: 'part',
  ASSEMBLY: 'assembly',
  PROJECT: 'project',
  DRAWING: 'drawing',
  OTHER: 'other',
};

const PART_CLASSIFICATIONS = {
  CUSTOM: 'custom',
  STANDARD: 'standard',
  BUYOUT: 'buyout',
};

// ============================================================================
// PROJECT STATE
// ============================================================================

let projectState = {
  name: '',
  ipj: null,
  files: new Map(),
  tree: null,
  stats: {
    parts: 0,
    assemblies: 0,
    drawings: 0,
    total: 0,
    byClassification: {
      custom: 0,
      standard: 0,
      buyout: 0,
    },
  },
};

// ============================================================================
// UTF-16 DECODING FOR IPJ FILES
// ============================================================================

/**
 * Decode UTF-16 little-endian buffer to string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function decodeUTF16LE(buffer) {
  const view = new Uint16Array(buffer);
  let str = '';
  for (let i = 0; i < view.length; i++) {
    str += String.fromCharCode(view[i]);
  }
  return str;
}

// ============================================================================
// IPJ FILE PARSING
// ============================================================================

/**
 * Parse an Inventor Project (.ipj) file
 * IPJ files are UTF-16 XML documents containing project configuration
 *
 * @param {ArrayBuffer} buffer - Raw file buffer
 * @returns {Object} Parsed project info { workspace, contentCenter, options }
 */
export function parseIPJ(buffer) {
  try {
    const xmlString = decodeUTF16LE(buffer);

    // Extract workspace path from <Workspace>.\Workspaces\...\</Workspace>
    const workspaceMatch = xmlString.match(/<Workspace>([^<]+)<\/Workspace>/i);
    const workspace = workspaceMatch ? workspaceMatch[1].trim() : null;

    // Extract Content Center path
    const ccMatch = xmlString.match(/<ContentCenterPath>([^<]+)<\/ContentCenterPath>/i);
    const contentCenter = ccMatch ? ccMatch[1].trim() : null;

    // Extract project options
    const options = {};
    const oldVersionsMatch = xmlString.match(/<OldVersionsToKeep>(\d+)<\/OldVersionsToKeep>/i);
    if (oldVersionsMatch) {
      options.oldVersionsToKeep = parseInt(oldVersionsMatch[1], 10);
    }

    const uniqueFilenamesMatch = xmlString.match(/<UsingUniqueFilenames>(true|false)<\/UsingUniqueFilenames>/i);
    if (uniqueFilenamesMatch) {
      options.usingUniqueFilenames = uniqueFilenamesMatch[1].toLowerCase() === 'true';
    }

    return {
      workspace,
      contentCenter,
      options,
    };
  } catch (error) {
    console.error('Error parsing IPJ file:', error);
    return { workspace: null, contentCenter: null, options: {} };
  }
}

// ============================================================================
// FILE CLASSIFICATION
// ============================================================================

/**
 * Classify a part file based on its path location
 * @param {string} path - File path
 * @returns {string} Classification: 'custom', 'standard', or 'buyout'
 */
function classifyPart(path) {
  const lowerPath = path.toLowerCase();

  if (lowerPath.includes('content center') || lowerPath.includes('libraries')) {
    return PART_CLASSIFICATIONS.STANDARD;
  }
  if (lowerPath.includes('zukaufteile') || lowerPath.includes('buyout')) {
    return PART_CLASSIFICATIONS.BUYOUT;
  }
  return PART_CLASSIFICATIONS.CUSTOM;
}

/**
 * Get file extension and categorize file type
 * @param {string} filename
 * @returns {Object} { ext, category }
 */
function categorizeFile(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

  let category = FILE_CATEGORIES.OTHER;
  if (ext === INVENTOR_EXTENSIONS.IPT) category = FILE_CATEGORIES.PART;
  else if (ext === INVENTOR_EXTENSIONS.IAM) category = FILE_CATEGORIES.ASSEMBLY;
  else if (ext === INVENTOR_EXTENSIONS.IPJ) category = FILE_CATEGORIES.PROJECT;
  else if (ext === INVENTOR_EXTENSIONS.IDW || ext === INVENTOR_EXTENSIONS.DWG) {
    category = FILE_CATEGORIES.DRAWING;
  }

  return { ext, category };
}

// ============================================================================
// FILE TREE BUILDING
// ============================================================================

/**
 * Build a hierarchical tree from flat file entries
 * @param {Map} filesMap - Map of path to file metadata
 * @returns {Object} Tree root node
 */
function buildFileTree(filesMap) {
  const root = {
    name: 'Project Root',
    type: 'folder',
    path: '',
    children: [],
  };

  const nodeMap = new Map();
  nodeMap.set('', root);

  // Sort paths for consistent ordering
  const sortedPaths = Array.from(filesMap.keys()).sort();

  for (const path of sortedPaths) {
    const file = filesMap.get(path);
    const parts = path.split('/').filter(Boolean);

    let currentPath = '';
    let currentParent = root;

    // Navigate/create folder hierarchy
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      currentPath = (currentPath ? currentPath + '/' : '') + folderName;

      if (!nodeMap.has(currentPath)) {
        const folderNode = {
          name: folderName,
          type: 'folder',
          path: currentPath,
          children: [],
        };
        nodeMap.set(currentPath, folderNode);
        currentParent.children.push(folderNode);
      }
      currentParent = nodeMap.get(currentPath);
    }

    // Add file node
    const fileNode = {
      name: file.name,
      type: file.category,
      path: path,
      size: file.size,
      classification: file.classification,
      ext: file.ext,
    };
    currentParent.children.push(fileNode);
  }

  return root;
}

// ============================================================================
// FILE INDEXING
// ============================================================================

/**
 * Index all files from FileSystemEntry objects (from drop/picker)
 * Recursively traverses directory structure and builds file index
 *
 * @param {FileSystemEntry[]|DataTransferItemList} entries
 * @returns {Promise<Map>} Map of path -> { name, ext, size, type, category, buffer, classification }
 */
export async function indexFiles(entries) {
  const filesMap = new Map();
  const stack = [];

  // Initialize with top-level entries
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry instanceof DataTransferItem) {
      stack.push(entry.webkitGetAsEntry());
    } else if (entry.isDirectory) {
      stack.push(entry);
    }
  }

  // Depth-first traversal
  while (stack.length > 0) {
    const entry = stack.pop();

    if (entry.isDirectory) {
      try {
        const reader = entry.createReader();
        const fileEntries = await new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });

        for (const fileEntry of fileEntries) {
          stack.push(fileEntry);
        }
      } catch (error) {
        console.warn(`Failed to read directory ${entry.fullPath}:`, error);
      }
    } else if (entry.isFile) {
      try {
        const file = await new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        });

        const { ext, category } = categorizeFile(file.name);
        const classification = category === FILE_CATEGORIES.PART
          ? classifyPart(entry.fullPath)
          : null;

        const buffer = await file.arrayBuffer();

        filesMap.set(entry.fullPath, {
          name: file.name,
          ext,
          size: file.size,
          category,
          classification,
          buffer,
          mimeType: file.type,
        });
      } catch (error) {
        console.warn(`Failed to read file ${entry.fullPath}:`, error);
      }
    }
  }

  return filesMap;
}

/**
 * Load an entire Inventor project from a directory handle
 * @param {FileSystemDirectoryHandle} directoryHandle
 * @returns {Promise<Object>} Project object with ipj, files, tree, stats
 */
export async function loadProject(directoryHandle) {
  projectState.name = directoryHandle.name;
  projectState.files.clear();
  projectState.stats = {
    parts: 0,
    assemblies: 0,
    drawings: 0,
    total: 0,
    byClassification: { custom: 0, standard: 0, buyout: 0 },
  };

  // Recursively read all files
  for await (const entry of directoryHandle.values()) {
    await traverseDirectory(entry, '');
  }

  // Parse .ipj file if present
  const ipjEntry = Array.from(projectState.files.values()).find(
    (f) => f.ext === INVENTOR_EXTENSIONS.IPJ
  );

  if (ipjEntry && ipjEntry.buffer) {
    projectState.ipj = parseIPJ(ipjEntry.buffer);
  }

  // Build file tree
  projectState.tree = buildFileTree(projectState.files);

  // Calculate stats
  updateStats();

  return {
    name: projectState.name,
    ipj: projectState.ipj,
    files: projectState.files,
    tree: projectState.tree,
    stats: projectState.stats,
  };
}

/**
 * Recursively traverse directory structure
 * @private
 */
async function traverseDirectory(entry, basePath) {
  if (entry.kind === 'directory') {
    const nextPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    for await (const subEntry of entry.values()) {
      await traverseDirectory(subEntry, nextPath);
    }
  } else if (entry.kind === 'file') {
    const file = await entry.getFile();
    const filePath = basePath ? `${basePath}/${file.name}` : file.name;

    const { ext, category } = categorizeFile(file.name);
    const classification = category === FILE_CATEGORIES.PART
      ? classifyPart(filePath)
      : null;

    const buffer = await file.arrayBuffer();

    projectState.files.set(filePath, {
      name: file.name,
      ext,
      size: file.size,
      category,
      classification,
      buffer,
      mimeType: file.type,
    });
  }
}

// ============================================================================
// PROJECT STATISTICS
// ============================================================================

/**
 * Update project statistics from current file index
 * @private
 */
function updateStats() {
  projectState.stats = {
    parts: 0,
    assemblies: 0,
    drawings: 0,
    total: 0,
    byClassification: { custom: 0, standard: 0, buyout: 0 },
  };

  for (const file of projectState.files.values()) {
    projectState.stats.total++;

    if (file.category === FILE_CATEGORIES.PART) {
      projectState.stats.parts++;
      if (file.classification) {
        projectState.stats.byClassification[file.classification]++;
      }
    } else if (file.category === FILE_CATEGORIES.ASSEMBLY) {
      projectState.stats.assemblies++;
    } else if (file.category === FILE_CATEGORIES.DRAWING) {
      projectState.stats.drawings++;
    }
  }
}

/**
 * Get current project statistics
 * @returns {Object}
 */
export function getProjectStats() {
  return {
    ...projectState.stats,
    name: projectState.name,
  };
}

// ============================================================================
// FILE RETRIEVAL
// ============================================================================

/**
 * Retrieve a file's ArrayBuffer by path
 * @param {string} path
 * @returns {ArrayBuffer|null}
 */
export function getFileByPath(path) {
  const file = projectState.files.get(path);
  return file ? file.buffer : null;
}

/**
 * Get all files of a specific category
 * @param {string} category - FILE_CATEGORIES.PART, etc.
 * @returns {Array<{path, name, size, classification}>}
 */
export function getFilesByCategory(category) {
  return Array.from(projectState.files.entries())
    .filter(([, file]) => file.category === category)
    .map(([path, file]) => ({
      path,
      name: file.name,
      size: file.size,
      classification: file.classification,
    }));
}

// ============================================================================
// FOLDER PICKER UI
// ============================================================================

/**
 * Show folder picker dialog and load project
 * Uses File System Access API with fallback to webkitdirectory input
 *
 * @returns {Promise<Object>} Loaded project object or null if cancelled
 */
export async function showFolderPicker() {
  try {
    // Try modern File System Access API
    if ('showDirectoryPicker' in window) {
      const directoryHandle = await window.showDirectoryPicker();
      return await loadProject(directoryHandle);
    }

    // Fallback to webkitdirectory input
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;

    return new Promise((resolve) => {
      input.addEventListener('change', async () => {
        if (input.files.length === 0) {
          resolve(null);
          return;
        }

        const filesMap = new Map();
        const commonRoot = findCommonRoot(input.files);

        for (const file of input.files) {
          const path = file.webkitRelativePath.replace(commonRoot, '').replace(/^\//, '');

          if (!path) continue;

          const { ext, category } = categorizeFile(file.name);
          const classification = category === FILE_CATEGORIES.PART
            ? classifyPart(path)
            : null;

          const buffer = await file.arrayBuffer();

          filesMap.set(path, {
            name: file.name,
            ext,
            size: file.size,
            category,
            classification,
            buffer,
            mimeType: file.type,
          });
        }

        projectState.files = filesMap;
        projectState.name = commonRoot.split('/').filter(Boolean)[0] || 'Project';
        projectState.tree = buildFileTree(filesMap);
        updateStats();

        resolve({
          name: projectState.name,
          ipj: projectState.ipj,
          files: projectState.files,
          tree: projectState.tree,
          stats: projectState.stats,
        });
      });

      input.click();
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Folder picker cancelled by user');
      return null;
    }
    console.error('Error showing folder picker:', error);
    return null;
  }
}

/**
 * Find common root directory from webkitRelativePath entries
 * @private
 */
function findCommonRoot(files) {
  if (files.length === 0) return '';

  const paths = Array.from(files).map((f) => f.webkitRelativePath);
  const firstPath = paths[0].split('/');

  let commonDepth = 0;
  for (let i = 0; i < firstPath.length; i++) {
    if (paths.every((p) => p.split('/')[i] === firstPath[i])) {
      commonDepth = i + 1;
    } else {
      break;
    }
  }

  return firstPath.slice(0, commonDepth).join('/');
}

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

/**
 * Get current project state (mostly for debugging)
 * @private
 * @returns {Object}
 */
export function getProjectState() {
  return {
    name: projectState.name,
    ipj: projectState.ipj,
    fileCount: projectState.files.size,
    stats: projectState.stats,
    tree: projectState.tree,
  };
}
