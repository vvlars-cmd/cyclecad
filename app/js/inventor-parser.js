/**
 * Inventor File Parser — ES Module (v2)
 * Parses .ipt (part) and .iam (assembly) files directly in the browser
 * Zero dependencies, pure OLE2/CFB container parsing + multi-stream analysis
 * Generates Fusion 360 + cycleCAD reconstruction guides
 */

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================

const OLE2_SIGNATURE = 0xD0CF11E0;
const SECTOR_SIZE = 512;
const MINI_SECTOR_SIZE = 64;
const DIR_ENTRY_SIZE = 128;
const FAT_SECTOR_ID = 0xFFFFFFFD;
const ENDOFCHAIN = 0xFFFFFFFE;
const FREECHAIN = 0xFFFFFFFF;

// Feature type patterns (ASCII strings to search in binary)
const FEATURE_PATTERNS = [
  { pattern: 'ExtrudeFeature', type: 'Extrude', icon: '📦', color: '#3fb950', f360: 'Extrude', cycleCAD: 'extrudeProfile' },
  { pattern: 'RevolveFeature', type: 'Revolve', icon: '🔄', color: '#d29922', f360: 'Revolve', cycleCAD: 'revolveProfile' },
  { pattern: 'HoleFeature', type: 'Hole', icon: '⭕', color: '#f85149', f360: 'Hole', cycleCAD: 'createHole' },
  { pattern: 'FilletFeature', type: 'Fillet', icon: '⌒', color: '#a371f7', f360: 'Fillet', cycleCAD: 'applyFillet' },
  { pattern: 'ChamferFeature', type: 'Chamfer', icon: '⌉', color: '#db61a2', f360: 'Chamfer', cycleCAD: 'applyChamfer' },
  { pattern: 'Sketch2D', type: 'Sketch', icon: '✏️', color: '#58a6ff', f360: 'Create Sketch', cycleCAD: 'startSketch' },
  { pattern: 'Sketch3D', type: '3D Sketch', icon: '✏️', color: '#58a6ff', f360: 'Create 3D Sketch', cycleCAD: 'startSketch3D' },
  { pattern: 'RectangularPatternFeature', type: 'RectPattern', icon: '❖', color: '#58a6ff', f360: 'Rectangular Pattern', cycleCAD: 'rectPattern' },
  { pattern: 'CircularPatternFeature', type: 'CircPattern', icon: '❖', color: '#58a6ff', f360: 'Circular Pattern', cycleCAD: 'circPattern' },
  { pattern: 'MirrorFeature', type: 'Mirror', icon: '⇄', color: '#79c0ff', f360: 'Mirror', cycleCAD: 'mirror' },
  { pattern: 'SweepFeature', type: 'Sweep', icon: '🌀', color: '#a371f7', f360: 'Sweep', cycleCAD: 'sweepProfile' },
  { pattern: 'LoftFeature', type: 'Loft', icon: '🌊', color: '#3fb950', f360: 'Loft', cycleCAD: 'loftProfile' },
  { pattern: 'ShellFeature', type: 'Shell', icon: '🐚', color: '#d29922', f360: 'Shell', cycleCAD: 'shellBody' },
  { pattern: 'ThreadFeature', type: 'Thread', icon: '🔩', color: '#8b949e', f360: 'Thread', cycleCAD: 'addThread' },
  { pattern: 'WorkPlane', type: 'WorkPlane', icon: '📐', color: '#8b949e', f360: 'Construction Plane', cycleCAD: 'createWorkPlane' },
  { pattern: 'WorkAxis', type: 'WorkAxis', icon: '📏', color: '#8b949e', f360: 'Construction Axis', cycleCAD: 'createWorkAxis' },
  { pattern: 'WorkPoint', type: 'WorkPoint', icon: '•', color: '#8b949e', f360: 'Construction Point', cycleCAD: 'createWorkPoint' },
  { pattern: 'BooleanFeature', type: 'Boolean', icon: '✂️', color: '#f85149', f360: 'Combine', cycleCAD: 'booleanOp' },
  { pattern: 'CutFeature', type: 'Cut', icon: '✂️', color: '#f85149', f360: 'Extrude (Cut)', cycleCAD: 'cutExtrude' },
  { pattern: 'SplitFeature', type: 'Split', icon: '✂️', color: '#f85149', f360: 'Split Body', cycleCAD: 'splitBody' },
  // Sheet metal features
  { pattern: 'FlangeFeature', type: 'Flange', icon: '📄', color: '#d29922', f360: 'Flange', cycleCAD: 'addFlange' },
  { pattern: 'BendFeature', type: 'Bend', icon: '↪', color: '#d29922', f360: 'Bend', cycleCAD: 'addBend' },
  { pattern: 'HemFeature', type: 'Hem', icon: '⤵', color: '#d29922', f360: 'Hem', cycleCAD: 'addHem' },
  { pattern: 'FoldFeature', type: 'Fold', icon: '📁', color: '#d29922', f360: 'Fold', cycleCAD: 'addFold' },
  { pattern: 'FlatPattern', type: 'FlatPattern', icon: '📋', color: '#3fb950', f360: 'Create Flat Pattern', cycleCAD: 'createFlatPattern' },
  { pattern: 'ContourFlangeFeature', type: 'ContourFlange', icon: '📄', color: '#d29922', f360: 'Contour Flange', cycleCAD: 'addContourFlange' },
  { pattern: 'FaceFeature', type: 'Face', icon: '▢', color: '#3fb950', f360: 'Face', cycleCAD: 'createFace' },
  { pattern: 'UnfoldFeature', type: 'Unfold', icon: '↗', color: '#d29922', f360: 'Unfold', cycleCAD: 'unfold' },
];

// Constraint type patterns for assemblies
const CONSTRAINT_PATTERNS = [
  { pattern: 'MateConstraint', f360: 'Joint > Rigid', type: 'Mate' },
  { pattern: 'FlushConstraint', f360: 'Joint > Planar', type: 'Flush' },
  { pattern: 'AngleConstraint', f360: 'Joint > Revolute', type: 'Angle' },
  { pattern: 'InsertConstraint', f360: 'Joint > Cylindrical', type: 'Insert' },
  { pattern: 'TangentConstraint', f360: 'Joint > Slider', type: 'Tangent' },
  { pattern: 'CoincidentConstraint', f360: 'Joint > Rigid', type: 'Coincident' },
  { pattern: 'ParallelConstraint', f360: 'Joint > Rigid', type: 'Parallel' },
  { pattern: 'PerpendicularConstraint', f360: 'Joint > Rigid', type: 'Perpendicular' },
  { pattern: 'ConcentricConstraint', f360: 'Joint > Revolute', type: 'Concentric' },
];

// Inventor template → part type mapping
const TEMPLATE_MAP = {
  'SheetMetal': { type: 'Sheet Metal', f360Tab: 'SHEET METAL', icon: '📄' },
  'Standard': { type: 'Solid Part', f360Tab: 'SOLID', icon: '📦' },
  'Weldment': { type: 'Weldment', f360Tab: 'SOLID', icon: '🔧' },
  'Mold': { type: 'Mold Design', f360Tab: 'SOLID', icon: '🏭' },
};

// ============================================================================
// OLE2/CFB PARSER
// ============================================================================

function parseOLE2(buffer) {
  const view = new DataView(buffer.buffer || buffer);
  const bufArr = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Validate signature
  const sig1 = view.getUint32(0, false);
  if (sig1 !== 0xD0CF11E0) {
    throw new Error('Invalid OLE2 signature — not an Inventor file');
  }

  const sectorSizePow = view.getUint16(30, true);
  const sectorSize = 1 << sectorSizePow;
  const totalFATSectors = view.getUint32(44, true);
  const dirStartSector = view.getInt32(48, true);
  const version = `${view.getUint16(26, true)}.${view.getUint16(24, true)}`;

  // Build FAT from header DIFAT entries
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

  // Read sector chain
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

  // Read directory entries
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
    version,
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
// UFRxDoc PARSER — This is where the REAL feature tree lives!
// ============================================================================

function parseUFRxDoc(ole2) {
  const data = ole2.getStream('UFRxDoc');
  if (!data) return null;

  const result = {
    template: '',
    partType: 'Standard',
    originalPath: '',
    savedFrom: '',
    savedOn: '',
    fileSchema: '',
    softwareSchema: '',
    features: [],
    parameters: [],
    references: [],
    bodies: [],
    exportStates: [],
  };

  // Decode as UTF-16LE (Inventor uses Windows UTF-16)
  const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(data);

  // Also get ASCII view for binary searches
  const ascii = new TextDecoder('ascii', { fatal: false }).decode(data);

  // Extract template type
  const templateMatch = utf16.match(/Templates\\[^\\]*\\([^.]+)\.ipt/i) ||
                        utf16.match(/Templates\\[^\\]*\\([^.]+)\.iam/i);
  if (templateMatch) {
    result.template = templateMatch[1];
    // Detect part type from template
    for (const [key, val] of Object.entries(TEMPLATE_MAP)) {
      if (result.template.toLowerCase().includes(key.toLowerCase())) {
        result.partType = val.type;
        break;
      }
    }
  }

  // Extract version info
  const schemaMatch = utf16.match(/FileSchema:\s*([\d.]+)/);
  if (schemaMatch) result.fileSchema = schemaMatch[1];

  const softwareMatch = utf16.match(/SoftwareSchema:\s*([\d.]+)/);
  if (softwareMatch) result.softwareSchema = softwareMatch[1];

  const savedFromMatch = utf16.match(/SavedFrom:\s*([^\0]+)/);
  if (savedFromMatch) result.savedFrom = savedFromMatch[1].trim();

  const savedOnMatch = utf16.match(/SavedOn:\s*([^\0]+)/);
  if (savedOnMatch) result.savedOn = savedOnMatch[1].trim();

  // Extract original file path
  const pathMatch = utf16.match(/([A-Z]:\\[^\0]{10,}\.ipt)/i) ||
                    utf16.match(/([A-Z]:\\[^\0]{10,}\.iam)/i);
  if (pathMatch) result.originalPath = pathMatch[1];

  // Extract Body references
  const bodyRegex = /Body\s*\(\s*Body\s*\)/g;
  let bodyMatch;
  while ((bodyMatch = utf16.matchAll(/Body\s*\(([^)]*)\)/g))) {
    for (const m of bodyMatch) {
      result.bodies.push(m[1] || 'Body');
    }
    break;
  }

  // Extract Export/Feature states from UFRxDoc
  const exportRegex = /Export([A-Za-z]+)/g;
  let exportMatch2;
  while ((exportMatch2 = exportRegex.exec(utf16)) !== null) {
    const name = exportMatch2[1];
    if (name !== 'GlobalState' && !result.exportStates.includes(name)) {
      result.exportStates.push(name);
    }
  }

  // Extract parameter references from UFRxDoc
  const paramRegex = /([A-Za-z_]\w*)\s*\(\s*Parameter\s*\)\s*(\d+)/g;
  let paramMatch2;
  while ((paramMatch2 = paramRegex.exec(utf16)) !== null) {
    result.parameters.push({
      name: paramMatch2[1],
      id: parseInt(paramMatch2[2]),
      source: 'UFRxDoc'
    });
  }

  // Extract file references (for assemblies or linked parts)
  const refRegex = /([A-Za-z0-9_\- ]+\.ipt)/gi;
  let refMatch;
  while ((refMatch = refRegex.exec(utf16)) !== null) {
    const ref = refMatch[1].trim();
    if (ref.length > 4 && !result.references.includes(ref)) {
      result.references.push(ref);
    }
  }

  // Scan for feature keywords in both UFRxDoc and ascii view
  for (const fp of FEATURE_PATTERNS) {
    // Check UTF-16
    if (utf16.includes(fp.pattern)) {
      const existing = result.features.find(f => f.type === fp.type);
      if (!existing) {
        result.features.push({
          type: fp.type,
          pattern: fp.pattern,
          icon: fp.icon,
          color: fp.color,
          f360: fp.f360,
          cycleCAD: fp.cycleCAD,
          source: 'UFRxDoc',
          count: (utf16.match(new RegExp(fp.pattern, 'g')) || []).length
        });
      }
    }
    // Check ASCII
    if (ascii.includes(fp.pattern)) {
      const existing = result.features.find(f => f.type === fp.type);
      if (!existing) {
        result.features.push({
          type: fp.type,
          pattern: fp.pattern,
          icon: fp.icon,
          color: fp.color,
          f360: fp.f360,
          cycleCAD: fp.cycleCAD,
          source: 'UFRxDoc-ascii',
          count: (ascii.match(new RegExp(fp.pattern, 'g')) || []).length
        });
      }
    }
  }

  return result;
}

// ============================================================================
// MULTI-STREAM FEATURE SCANNER
// ============================================================================

function scanAllStreams(ole2) {
  const allFeatures = [];
  const allParams = [];
  const fileRefs = [];
  const constraints = [];

  const streams = ole2.getAllStreams();

  for (const entry of streams) {
    if (entry.size < 50) continue;

    try {
      const data = ole2.getStream(entry.name);
      if (!data) continue;

      // ASCII decode
      const ascii = new TextDecoder('ascii', { fatal: false }).decode(data);
      // UTF-16 decode for wider coverage
      const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(data);

      // Scan for features
      for (const fp of FEATURE_PATTERNS) {
        const asciiMatches = (ascii.match(new RegExp(fp.pattern, 'g')) || []).length;
        const utf16Matches = (utf16.match(new RegExp(fp.pattern, 'g')) || []).length;
        const count = Math.max(asciiMatches, utf16Matches);
        if (count > 0) {
          allFeatures.push({
            type: fp.type,
            pattern: fp.pattern,
            icon: fp.icon,
            color: fp.color,
            f360: fp.f360,
            cycleCAD: fp.cycleCAD,
            source: entry.name,
            count
          });
        }
      }

      // Scan for .ipt/.iam references
      const iptRefs = [...utf16.matchAll(/([A-Za-z0-9_\- ]+\.ipt)/gi)];
      const iamRefs = [...utf16.matchAll(/([A-Za-z0-9_\- ]+\.iam)/gi)];
      for (const ref of [...iptRefs, ...iamRefs]) {
        const name = ref[1].trim();
        if (name.length > 4 && !fileRefs.includes(name)) fileRefs.push(name);
      }

      // Scan for constraints
      for (const cp of CONSTRAINT_PATTERNS) {
        if (ascii.includes(cp.pattern) || utf16.includes(cp.pattern)) {
          if (!constraints.find(c => c.type === cp.type)) {
            constraints.push({ type: cp.type, f360: cp.f360, source: entry.name });
          }
        }
      }

    } catch (e) {
      // Skip unreadable streams
    }
  }

  // Deduplicate features by type, keep highest count
  const featureMap = new Map();
  for (const f of allFeatures) {
    const existing = featureMap.get(f.type);
    if (!existing || f.count > existing.count) {
      featureMap.set(f.type, f);
    }
  }

  return {
    features: Array.from(featureMap.values()),
    fileRefs,
    constraints
  };
}

// ============================================================================
// FUSION 360 RECONSTRUCTION GUIDE GENERATOR
// ============================================================================

function generateFusion360Guide(parsedData) {
  const steps = [];
  let stepNum = 1;

  // Step 1: Create new document
  const partType = parsedData.ufrxDoc?.partType || 'Standard';
  const isSheetMetal = partType === 'Sheet Metal';

  steps.push({
    step: stepNum++,
    action: 'Create New Design',
    f360: isSheetMetal
      ? 'File → New Design → Switch to SHEET METAL tab in toolbar'
      : 'File → New Design (Parametric design mode)',
    cycleCAD: isSheetMetal ? 'newSheetMetalPart()' : 'newPart()',
    tip: `Original: Inventor ${parsedData.ufrxDoc?.savedFrom || 'unknown version'}`,
    icon: '📄'
  });

  // Step 2: Set up parameters
  if (parsedData.parameters.length > 0) {
    steps.push({
      step: stepNum++,
      action: 'Define User Parameters',
      f360: `Modify → Change Parameters → Add each:\n${parsedData.parameters.map(p => `  • ${p.name} = ${p.id || '?'} mm`).join('\n')}`,
      cycleCAD: parsedData.parameters.map(p => `setParam('${p.name}', ${p.id || 0})`).join('; '),
      tip: `${parsedData.parameters.length} parameters found. Set these FIRST — features reference them.`,
      icon: '⚙️'
    });
  }

  // Step 3: Set material thickness for sheet metal
  if (isSheetMetal) {
    const thicknessParam = parsedData.parameters.find(p =>
      p.name.toLowerCase().includes('stärke') || p.name.toLowerCase().includes('thickness') || p.name.toLowerCase() === 't'
    );
    steps.push({
      step: stepNum++,
      action: 'Set Sheet Metal Rules',
      f360: `SHEET METAL tab → Sheet Metal Rules → Thickness: ${thicknessParam ? thicknessParam.id + ' mm' : '(check parameters)'}`,
      cycleCAD: `setSheetMetalRules({ thickness: ${thicknessParam?.id || 1} })`,
      tip: 'Set thickness before creating any sheet metal features',
      icon: '📏'
    });
  }

  // Step 4+: Features in order
  const features = parsedData.allFeatures || [];
  const featureOrder = [
    'Sketch', '3D Sketch', 'WorkPlane', 'WorkAxis', 'WorkPoint',
    'Face', 'Extrude', 'Revolve', 'Sweep', 'Loft',
    'Flange', 'ContourFlange', 'Bend', 'Hem', 'Fold',
    'Hole', 'Cut', 'Boolean', 'Split',
    'Fillet', 'Chamfer', 'Shell', 'Thread',
    'Mirror', 'RectPattern', 'CircPattern',
    'Unfold', 'FlatPattern'
  ];

  // Sort features by logical build order
  const sortedFeatures = [...features].sort((a, b) => {
    const aIdx = featureOrder.indexOf(a.type);
    const bIdx = featureOrder.indexOf(b.type);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  for (const feat of sortedFeatures) {
    const plural = feat.count > 1 ? ` (×${feat.count})` : '';
    steps.push({
      step: stepNum++,
      action: `${feat.icon} ${feat.type}${plural}`,
      f360: `${isSheetMetal ? 'SHEET METAL' : 'SOLID'} tab → ${feat.f360}`,
      cycleCAD: `${feat.cycleCAD}()`,
      tip: feat.count > 1 ? `Repeat ${feat.count} times or use pattern` : '',
      icon: feat.icon,
      color: feat.color
    });
  }

  // Final step: flat pattern for sheet metal
  if (isSheetMetal && !features.find(f => f.type === 'FlatPattern')) {
    steps.push({
      step: stepNum++,
      action: '📋 Create Flat Pattern',
      f360: 'SHEET METAL tab → Create Flat Pattern → Verify all bends unfold correctly',
      cycleCAD: 'createFlatPattern()',
      tip: 'Verify flat pattern for DXF export to laser/punch',
      icon: '📋'
    });
  }

  // Verify step
  steps.push({
    step: stepNum++,
    action: '✅ Verify & Compare',
    f360: 'Inspect → Measure to check key dimensions match original Inventor model',
    cycleCAD: 'verifyDimensions()',
    tip: 'Compare with original parameters to ensure accuracy',
    icon: '✅'
  });

  return steps;
}

// ============================================================================
// ASSEMBLY RECONSTRUCTION GUIDE
// ============================================================================

function generateAssemblyGuide(parsedData) {
  const steps = [];
  let stepNum = 1;

  steps.push({
    step: stepNum++,
    action: 'Create New Assembly',
    f360: 'File → New Design → Start with empty component',
    cycleCAD: 'newAssembly()',
    tip: 'Fusion 360 uses a top-down assembly workflow',
    icon: '🏗️'
  });

  // Add component steps
  const components = parsedData.fileRefs || [];
  const iptFiles = components.filter(c => c.toLowerCase().endsWith('.ipt'));
  const iamFiles = components.filter(c => c.toLowerCase().endsWith('.iam'));

  if (iamFiles.length > 0) {
    steps.push({
      step: stepNum++,
      action: `Import ${iamFiles.length} Sub-Assemblies`,
      f360: iamFiles.map(f => `  • Assemble → Insert → ${f}`).join('\n'),
      cycleCAD: iamFiles.map(f => `insertComponent('${f}')`).join('; '),
      tip: 'Import sub-assemblies first, then individual parts',
      icon: '📦'
    });
  }

  if (iptFiles.length > 0) {
    steps.push({
      step: stepNum++,
      action: `Import ${iptFiles.length} Parts`,
      f360: `Assemble → Insert for each part:\n${iptFiles.slice(0, 10).map(f => `  • ${f}`).join('\n')}${iptFiles.length > 10 ? `\n  • ... and ${iptFiles.length - 10} more` : ''}`,
      cycleCAD: iptFiles.map(f => `insertComponent('${f}')`).join('; '),
      tip: `Total: ${iptFiles.length} part files`,
      icon: '🔧'
    });
  }

  // Constraint steps
  const constraints = parsedData.constraints || [];
  if (constraints.length > 0) {
    steps.push({
      step: stepNum++,
      action: `Apply ${constraints.length} Joint Types`,
      f360: constraints.map(c => `  • ${c.type} → Fusion 360: ${c.f360}`).join('\n'),
      cycleCAD: 'applyJoints()',
      tip: 'Inventor Constraints → Fusion 360 Joints. Some may need manual adjustment.',
      icon: '🔗'
    });
  }

  steps.push({
    step: stepNum++,
    action: '✅ Verify Assembly',
    f360: 'Inspect → Interference to check for clashes',
    cycleCAD: 'verifyAssembly()',
    tip: 'Check for interference and verify motion',
    icon: '✅'
  });

  return steps;
}

// ============================================================================
// MAIN PARSER
// ============================================================================

export async function parseInventorFile(file) {
  const buffer = await file.arrayBuffer();
  const arr = new Uint8Array(buffer);

  const filename = file.name;
  const isIPT = filename.toLowerCase().endsWith('.ipt');
  const isIAM = filename.toLowerCase().endsWith('.iam');
  const fileType = isIPT ? 'ipt' : isIAM ? 'iam' : 'unknown';

  const result = {
    type: fileType,
    filename: file.name,
    fileSize: file.size,
    metadata: {},
    ufrxDoc: null,
    allFeatures: [],
    parameters: [],
    fileRefs: [],
    constraints: [],
    reconstructionGuide: [],
    rawStreams: [],
    error: null
  };

  try {
    const ole2 = parseOLE2(arr);
    result.metadata = { oleVersion: ole2.version, streams: ole2.entries.length };

    // 1. Parse UFRxDoc (primary feature/metadata source)
    result.ufrxDoc = parseUFRxDoc(ole2);

    // 2. Deep-scan all streams
    const scanResult = scanAllStreams(ole2);

    // 3. Merge features from UFRxDoc + stream scan (deduplicate)
    const featureMap = new Map();
    if (result.ufrxDoc?.features) {
      for (const f of result.ufrxDoc.features) featureMap.set(f.type, f);
    }
    for (const f of scanResult.features) {
      if (!featureMap.has(f.type) || f.count > featureMap.get(f.type).count) {
        featureMap.set(f.type, f);
      }
    }
    result.allFeatures = Array.from(featureMap.values());

    // 4. Merge parameters
    result.parameters = result.ufrxDoc?.parameters || [];

    // 5. File references
    result.fileRefs = [...new Set([...(result.ufrxDoc?.references || []), ...scanResult.fileRefs])];

    // 6. Constraints
    result.constraints = scanResult.constraints;

    // 7. Generate reconstruction guide
    if (isIAM) {
      result.reconstructionGuide = generateAssemblyGuide(result);
    } else {
      result.reconstructionGuide = generateFusion360Guide(result);
    }

    // 8. Raw stream info
    result.rawStreams = ole2.getAllStreams().map(e => ({ name: e.name, size: e.size }));

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

// ============================================================================
// UI PANEL (v2 with Reconstruction Guide tab)
// ============================================================================

export function createInventorPanel(onFileLoaded = null) {
  // Remove existing panel
  const existing = document.getElementById('inventor-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'inventor-panel';
  panel.style.cssText = `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 1100px);
    height: min(92vh, 850px);
    background: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 8px;
    z-index: 600;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #e0e0e0;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 14px 16px;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    cursor: move;
    background: linear-gradient(135deg, #1e1e1e, #252530);
  `;
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <span style="font-size: 20px;">🏭</span>
      <div>
        <h2 style="margin: 0; font-size: 15px; color: #e0e0e0;">Inventor → Fusion 360 / cycleCAD</h2>
        <div style="font-size: 11px; color: #8b949e; margin-top: 2px;">Reverse-engineer native .ipt/.iam files</div>
      </div>
    </div>
  `;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `background:transparent;border:none;color:#8b949e;font-size:20px;cursor:pointer;padding:4px;`;
  closeBtn.onclick = () => panel.remove();
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Content area (drop zone initially)
  const content = document.createElement('div');
  content.style.cssText = `
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  `;

  const dropZone = document.createElement('div');
  dropZone.style.cssText = `
    width: calc(100% - 32px);
    height: calc(100% - 32px);
    border: 2px dashed #3e3e42;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    background: #252526;
    gap: 12px;
  `;
  // Hidden file input (persistent, not dynamic — works reliably across browsers)
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.ipt,.iam';
  fileInput.id = 'inventor-file-input';
  fileInput.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
  fileInput.onchange = async (e) => {
    if (e.target.files.length > 0) await showResults(e.target.files[0], content, panel, onFileLoaded);
  };

  dropZone.innerHTML = `
    <div style="font-size: 48px;">🏭</div>
    <div style="color: #e0e0e0; font-size: 15px; font-weight: 500;">Drop Inventor File Here</div>
    <div style="color: #8b949e; font-size: 12px;">Supports .ipt (Part) and .iam (Assembly)</div>
  `;

  // Browse button using <label> wrapping hidden input — reliable click-to-browse
  const browseLabel = document.createElement('label');
  browseLabel.setAttribute('for', 'inventor-file-input');
  browseLabel.style.cssText = `
    display: inline-block;
    margin-top: 8px;
    padding: 8px 24px;
    background: rgba(255,140,0,0.15);
    border: 1px solid rgba(255,140,0,0.4);
    border-radius: 6px;
    color: #ff8c00;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  browseLabel.textContent = 'Browse Files...';
  browseLabel.onmouseenter = () => { browseLabel.style.background = 'rgba(255,140,0,0.25)'; };
  browseLabel.onmouseleave = () => { browseLabel.style.background = 'rgba(255,140,0,0.15)'; };

  dropZone.appendChild(fileInput);
  dropZone.appendChild(browseLabel);

  // Sample DUO files section
  const samplesDiv = document.createElement('div');
  samplesDiv.style.cssText = `
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #3e3e42;
    text-align: center;
    width: 100%;
  `;
  samplesDiv.innerHTML = `
    <div style="color:#8b949e;font-size:11px;margin-bottom:10px;">DUO Sample Files</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <button class="inv-sample-btn" data-file="Leistenbuerstenblech.ipt" style="padding:6px 14px;background:rgba(88,166,255,0.1);border:1px solid rgba(88,166,255,0.3);border-radius:5px;color:#58a6ff;font-size:12px;cursor:pointer;">Leistenbuerstenblech.ipt</button>
      <button class="inv-sample-btn" data-file="TraegerHoehe1.ipt" style="padding:6px 14px;background:rgba(88,166,255,0.1);border:1px solid rgba(88,166,255,0.3);border-radius:5px;color:#58a6ff;font-size:12px;cursor:pointer;">TraegerHoehe1.ipt</button>
      <button class="inv-sample-btn" data-file="Rahmen_Seite.iam" style="padding:6px 14px;background:rgba(88,166,255,0.1);border:1px solid rgba(88,166,255,0.3);border-radius:5px;color:#58a6ff;font-size:12px;cursor:pointer;">Rahmen_Seite.iam</button>
    </div>
  `;
  dropZone.appendChild(samplesDiv);

  // Sample button click handlers — fetch from samples/ directory
  samplesDiv.querySelectorAll('.inv-sample-btn').forEach(btn => {
    btn.onmouseenter = () => { btn.style.background = 'rgba(88,166,255,0.2)'; };
    btn.onmouseleave = () => { btn.style.background = 'rgba(88,166,255,0.1)'; };
    btn.onclick = async (e) => {
      e.stopPropagation();
      const fileName = btn.dataset.file;
      btn.textContent = 'Loading...';
      btn.style.opacity = '0.6';
      try {
        const resp = await fetch(`samples/${fileName}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const file = new File([blob], fileName);
        await showResults(file, content, panel, onFileLoaded);
      } catch (err) {
        btn.textContent = `Failed: ${err.message}`;
        btn.style.color = '#f85149';
        btn.style.borderColor = 'rgba(248,81,73,0.3)';
        setTimeout(() => {
          btn.textContent = fileName;
          btn.style.color = '#58a6ff';
          btn.style.borderColor = 'rgba(88,166,255,0.3)';
          btn.style.opacity = '1';
        }, 2000);
      }
    };
  });

  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = '#ff8c00'; dropZone.style.background = '#2a2520'; };
  dropZone.ondragleave = () => { dropZone.style.borderColor = '#3e3e42'; dropZone.style.background = '#252526'; };
  dropZone.ondrop = async (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#3e3e42';
    const files = Array.from(e.dataTransfer.files).filter(f => /\.(ipt|iam)$/i.test(f.name));
    if (files.length > 0) await showResults(files[0], content, panel, onFileLoaded);
  };
  // Prevent dropZone click from interfering with label/button clicks
  dropZone.style.cursor = 'default';

  content.appendChild(dropZone);
  panel.appendChild(content);

  // Draggable
  makeDraggable(panel, header);

  // Auto-show
  document.body.appendChild(panel);

  return {
    element: panel,
    show: () => document.body.appendChild(panel),
    hide: () => panel.remove(),
  };
}

function makeDraggable(el, handle) {
  let ox = 0, oy = 0;
  handle.onmousedown = (e) => {
    if (e.target.tagName === 'BUTTON') return;
    const rect = el.getBoundingClientRect();
    ox = e.clientX - rect.left; oy = e.clientY - rect.top;
    const move = (ev) => { el.style.transform = 'none'; el.style.left = (ev.clientX - ox) + 'px'; el.style.top = (ev.clientY - oy) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
}

async function showResults(file, container, panel, callback) {
  container.innerHTML = '<div style="color: #ff8c00; font-size: 14px;">⏳ Parsing Inventor file...</div>';

  const data = await parseInventorFile(file);

  container.innerHTML = '';
  container.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;';

  // Tab bar
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;border-bottom:1px solid #3e3e42;background:#1a1a1a;flex-shrink:0;';

  const isIAM = data.type === 'iam';
  const tabNames = ['🔍 Overview', '🔧 Rebuild Guide', '📦 Features', '⚙️ Parameters', ...(isIAM ? ['🏗️ Assembly'] : []), '📊 Raw Data'];
  const tabPanels = {};

  tabNames.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.style.cssText = `flex:1;padding:10px 6px;background:transparent;border:none;border-bottom:2px solid transparent;color:#8b949e;cursor:pointer;font-size:11px;white-space:nowrap;`;
    btn.onclick = () => {
      Object.values(tabPanels).forEach(p => p.style.display = 'none');
      tabPanels[name].style.display = 'flex';
      Array.from(tabBar.children).forEach(b => { b.style.borderBottomColor = 'transparent'; b.style.color = '#8b949e'; });
      btn.style.borderBottomColor = '#ff8c00'; btn.style.color = '#e0e0e0';
    };
    if (i === 0) { btn.style.borderBottomColor = '#ff8c00'; btn.style.color = '#e0e0e0'; }
    tabBar.appendChild(btn);

    const p = document.createElement('div');
    p.style.cssText = `flex:1;overflow-y:auto;padding:16px;display:${i === 0 ? 'flex' : 'none'};flex-direction:column;gap:8px;min-height:0;font-size:12px;`;
    tabPanels[name] = p;
  });

  container.appendChild(tabBar);

  // ====== OVERVIEW TAB ======
  const overview = tabPanels['🔍 Overview'];
  const partType = data.ufrxDoc?.partType || 'Standard';
  const templateIcon = TEMPLATE_MAP[Object.keys(TEMPLATE_MAP).find(k => partType.includes(k))]?.icon || '📦';
  overview.innerHTML = `
    <div style="background:#252526;padding:14px;border-radius:6px;border-left:3px solid #ff8c00;">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px;">${templateIcon} ${data.filename}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;color:#b0b0b0;">
        <div>Type: <strong style="color:#e0e0e0;">${data.type.toUpperCase()} — ${partType}</strong></div>
        <div>Size: <strong style="color:#e0e0e0;">${(data.fileSize / 1024).toFixed(1)} KB</strong></div>
        <div>OLE Version: <strong style="color:#e0e0e0;">${data.metadata.oleVersion}</strong></div>
        <div>Template: <strong style="color:#e0e0e0;">${data.ufrxDoc?.template || '—'}</strong></div>
        <div>Created with: <strong style="color:#e0e0e0;">${data.ufrxDoc?.savedFrom || '—'}</strong></div>
        <div>Saved on: <strong style="color:#e0e0e0;">${data.ufrxDoc?.savedOn || '—'}</strong></div>
        <div style="grid-column:1/3;">Path: <strong style="color:#e0e0e0;word-break:break-all;font-size:10px;">${data.ufrxDoc?.originalPath || '—'}</strong></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
      <div style="background:#252526;padding:12px;border-radius:6px;text-align:center;">
        <div style="font-size:24px;color:#3fb950;">${data.allFeatures.length}</div>
        <div style="color:#8b949e;font-size:11px;">Features</div>
      </div>
      <div style="background:#252526;padding:12px;border-radius:6px;text-align:center;">
        <div style="font-size:24px;color:#58a6ff;">${data.parameters.length}</div>
        <div style="color:#8b949e;font-size:11px;">Parameters</div>
      </div>
      <div style="background:#252526;padding:12px;border-radius:6px;text-align:center;">
        <div style="font-size:24px;color:#d29922;">${data.fileRefs.length}</div>
        <div style="color:#8b949e;font-size:11px;">File Refs</div>
      </div>
      <div style="background:#252526;padding:12px;border-radius:6px;text-align:center;">
        <div style="font-size:24px;color:#a371f7;">${data.rawStreams.length}</div>
        <div style="color:#8b949e;font-size:11px;">Streams</div>
      </div>
    </div>
    ${data.error ? `<div style="background:#3d1f1f;padding:10px;border-radius:6px;color:#f85149;">⚠️ ${data.error}</div>` : ''}
  `;

  // ====== REBUILD GUIDE TAB ======
  const guideTab = tabPanels['🔧 Rebuild Guide'];
  if (data.reconstructionGuide.length > 0) {
    // Header
    const guideHeader = document.createElement('div');
    guideHeader.style.cssText = 'background:linear-gradient(135deg,#1a2030,#252540);padding:12px;border-radius:6px;margin-bottom:4px;';
    guideHeader.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:#ff8c00;">Step-by-Step Reconstruction</div>
      <div style="font-size:11px;color:#8b949e;margin-top:4px;">Recreate this ${partType} in Fusion 360 (free) or cycleCAD</div>
    `;
    guideTab.appendChild(guideHeader);

    // Steps
    data.reconstructionGuide.forEach(step => {
      const stepEl = document.createElement('div');
      stepEl.style.cssText = `
        background: #252526;
        padding: 12px;
        border-radius: 6px;
        border-left: 3px solid ${step.color || '#ff8c00'};
      `;
      stepEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="background:#ff8c00;color:#000;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">Step ${step.step}</span>
          <strong>${step.action}</strong>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
          <div style="background:#1a2520;padding:8px;border-radius:4px;">
            <div style="color:#3fb950;font-size:10px;font-weight:600;margin-bottom:4px;">FUSION 360</div>
            <div style="white-space:pre-wrap;font-size:11px;color:#b0b0b0;">${step.f360}</div>
          </div>
          <div style="background:#1a1a2a;padding:8px;border-radius:4px;">
            <div style="color:#58a6ff;font-size:10px;font-weight:600;margin-bottom:4px;">cycleCAD</div>
            <div style="font-family:monospace;font-size:11px;color:#b0b0b0;">${step.cycleCAD}</div>
          </div>
        </div>
        ${step.tip ? `<div style="color:#8b949e;font-size:10px;margin-top:6px;font-style:italic;">💡 ${step.tip}</div>` : ''}
      `;
      guideTab.appendChild(stepEl);
    });

    // Export button
    const exportGuideBtn = document.createElement('button');
    exportGuideBtn.textContent = '📋 Export Rebuild Guide as HTML';
    exportGuideBtn.style.cssText = 'margin-top:8px;padding:10px;background:#ff8c00;border:none;color:#000;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;';
    exportGuideBtn.onclick = () => exportGuideHTML(data);
    guideTab.appendChild(exportGuideBtn);
  } else {
    guideTab.innerHTML = '<div style="color:#8b949e;">No reconstruction guide available</div>';
  }

  // ====== FEATURES TAB ======
  const featTab = tabPanels['📦 Features'];
  if (data.allFeatures.length > 0) {
    data.allFeatures.forEach(f => {
      const el = document.createElement('div');
      el.style.cssText = `padding:10px;background:#252526;border-left:3px solid ${f.color};border-radius:4px;`;
      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${f.icon} ${f.type}</strong>
          <span style="color:#8b949e;font-size:10px;">×${f.count} | ${f.source}</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#8b949e;">
          Fusion 360: <span style="color:#3fb950;">${f.f360}</span> ·
          cycleCAD: <code style="color:#58a6ff;">${f.cycleCAD}()</code>
        </div>
      `;
      featTab.appendChild(el);
    });
  } else {
    featTab.innerHTML = '<div style="color:#8b949e;">No features detected in binary streams. This file may use compressed geometry.</div>';
  }

  // ====== PARAMETERS TAB ======
  const paramTab = tabPanels['⚙️ Parameters'];
  if (data.parameters.length > 0) {
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;';
    table.innerHTML = `
      <thead><tr style="border-bottom:1px solid #3e3e42;">
        <th style="text-align:left;padding:8px;color:#ff8c00;">Name</th>
        <th style="text-align:right;padding:8px;color:#ff8c00;">ID/Value</th>
        <th style="text-align:left;padding:8px;color:#ff8c00;">Source</th>
      </tr></thead>
      <tbody>${data.parameters.map(p => `
        <tr style="border-bottom:1px solid #2a2a2a;">
          <td style="padding:6px;"><code>${p.name}</code></td>
          <td style="text-align:right;padding:6px;">${p.id ?? p.value ?? '?'}</td>
          <td style="padding:6px;color:#8b949e;font-size:10px;">${p.source || '—'}</td>
        </tr>
      `).join('')}</tbody>
    `;
    paramTab.appendChild(table);
  } else {
    paramTab.innerHTML = '<div style="color:#8b949e;">No parameters extracted. Parameters may be in compressed streams.</div>';
  }

  // ====== ASSEMBLY TAB (if .iam) ======
  if (isIAM && tabPanels['🏗️ Assembly']) {
    const asmTab = tabPanels['🏗️ Assembly'];
    if (data.fileRefs.length > 0) {
      data.fileRefs.forEach(ref => {
        const el = document.createElement('div');
        const isAsm = ref.toLowerCase().endsWith('.iam');
        el.style.cssText = `padding:8px;background:#252526;border-radius:4px;border-left:3px solid ${isAsm ? '#d29922' : '#58a6ff'};`;
        el.innerHTML = `${isAsm ? '🏗️' : '🔧'} <strong>${ref}</strong> <span style="color:#8b949e;font-size:10px;">${isAsm ? 'Assembly' : 'Part'}</span>`;
        asmTab.appendChild(el);
      });
    }
    if (data.constraints.length > 0) {
      const conTitle = document.createElement('div');
      conTitle.style.cssText = 'margin-top:12px;font-weight:600;color:#ff8c00;';
      conTitle.textContent = 'Constraints → Fusion 360 Joints:';
      asmTab.appendChild(conTitle);
      data.constraints.forEach(c => {
        const el = document.createElement('div');
        el.style.cssText = 'padding:6px;background:#252526;border-radius:4px;margin-top:4px;';
        el.innerHTML = `🔗 ${c.type} → <span style="color:#3fb950;">${c.f360}</span>`;
        asmTab.appendChild(el);
      });
    }
  }

  // ====== RAW DATA TAB ======
  const rawTab = tabPanels['📊 Raw Data'];
  rawTab.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px;">
      ${data.rawStreams.map(s => `
        <div style="background:#252526;padding:6px 10px;border-radius:4px;font-size:11px;">
          <strong>${s.name}</strong> <span style="color:#8b949e;">(${(s.size/1024).toFixed(1)} KB)</span>
        </div>
      `).join('')}
    </div>
  `;

  // Add all tab panels
  for (const p of Object.values(tabPanels)) {
    container.appendChild(p);
  }

  // Footer with export
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:10px 16px;border-top:1px solid #3e3e42;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;';

  const jsonBtn = document.createElement('button');
  jsonBtn.textContent = '💾 Export JSON';
  jsonBtn.style.cssText = 'padding:6px 14px;background:#3e3e42;border:none;color:#e0e0e0;border-radius:4px;cursor:pointer;font-size:11px;';
  jsonBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${data.filename}.analysis.json`; a.click();
  };
  footer.appendChild(jsonBtn);

  const htmlBtn = document.createElement('button');
  htmlBtn.textContent = '📄 Export Rebuild Guide';
  htmlBtn.style.cssText = 'padding:6px 14px;background:#ff8c00;border:none;color:#000;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;';
  htmlBtn.onclick = () => exportGuideHTML(data);
  footer.appendChild(htmlBtn);

  container.appendChild(footer);

  if (callback) callback(data);
}

function exportGuideHTML(data) {
  const partType = data.ufrxDoc?.partType || 'Standard';
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Rebuild Guide: ${data.filename}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; background: #0d1117; color: #e0e0e0; }
  h1 { color: #ff8c00; border-bottom: 2px solid #ff8c00; padding-bottom: 10px; }
  .meta { background: #161b22; padding: 16px; border-radius: 8px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .step { background: #161b22; padding: 16px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #ff8c00; }
  .step-num { background: #ff8c00; color: #000; padding: 2px 10px; border-radius: 12px; font-weight: 700; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .f360 { background: #0d2818; padding: 10px; border-radius: 6px; }
  .f360 h4 { color: #3fb950; margin: 0 0 6px 0; font-size: 11px; }
  .cad { background: #0d0d28; padding: 10px; border-radius: 6px; }
  .cad h4 { color: #58a6ff; margin: 0 0 6px 0; font-size: 11px; }
  .tip { color: #8b949e; font-size: 11px; margin-top: 8px; font-style: italic; }
  code { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; }
</style></head><body>
<h1>🏭 Rebuild Guide: ${data.filename}</h1>
<div class="meta">
  <div>Type: <strong>${data.type.toUpperCase()} — ${partType}</strong></div>
  <div>Features: <strong>${data.allFeatures.length}</strong></div>
  <div>Parameters: <strong>${data.parameters.length}</strong></div>
  <div>Created with: <strong>${data.ufrxDoc?.savedFrom || '—'}</strong></div>
</div>
${data.reconstructionGuide.map(s => `
<div class="step">
  <span class="step-num">Step ${s.step}</span> <strong>${s.action}</strong>
  <div class="grid">
    <div class="f360"><h4>FUSION 360 (Free)</h4><div style="white-space:pre-wrap;">${s.f360}</div></div>
    <div class="cad"><h4>cycleCAD (Web)</h4><code>${s.cycleCAD}</code></div>
  </div>
  ${s.tip ? `<div class="tip">💡 ${s.tip}</div>` : ''}
</div>`).join('')}
<footer style="text-align:center;color:#8b949e;margin-top:40px;font-size:11px;">
  Generated by cycleCAD Inventor Parser · ${new Date().toISOString().split('T')[0]}
</footer></body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${data.filename}_rebuild_guide.html`; a.click();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { parseOLE2, parseUFRxDoc, scanAllStreams, generateFusion360Guide, generateAssemblyGuide };

export default {
  parseInventorFile,
  createInventorPanel,
  parseOLE2,
  parseUFRxDoc,
  scanAllStreams,
  generateFusion360Guide,
  generateAssemblyGuide
};
