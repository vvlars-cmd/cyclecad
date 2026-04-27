/**
 * ipj-parser.js
 *
 * Parse Autodesk Inventor project files (`.ipj`).
 *
 * The `.ipj` file is a UTF-16-LE XML document with a BOM. Top-level element
 * is `<InventorProject>`. The interesting children are:
 *
 *   <ProjectOptions>             — name, type, owner, release id, …
 *   <ProjectPaths>               — workspace path(s)
 *   <LibraryPaths>               — vendor / standard libraries (one or none)
 *   <FolderOptions>
 *     <ContentCenterFolder>      — DIN/ISO content-center root
 *       <ContentCenterConfig>
 *         <ConfiguredLibraries>  — <Library DisplayName=… InternalName=… />
 *
 * Returns a normalised summary plus the original DOM for advanced callers.
 */

/**
 * @typedef {Object} LibraryPath
 * @property {string} name
 * @property {string} path
 * @property {'standard'|'vendor'|'workspace'|'content-center'|'preset'|'unknown'} kind
 * @property {string} [internalName]
 * @property {boolean} [readOnly]
 */

/**
 * @typedef {Object} IpjResult
 * @property {string} name
 * @property {string} version           schema rev id (closest to a "version")
 * @property {string} workspacePath
 * @property {LibraryPath[]} libraryPaths
 * @property {string[]} referencedFiles
 * @property {{
 *   projectType: string,
 *   owner: string,
 *   releaseId: string,
 *   includedProject: string,
 *   uniqueFilenames: boolean,
 *   contentCenterGuid: string
 * }} options
 * @property {string[]} warnings
 */

/**
 * Decode a `.ipj` byte buffer to a UTF-16 string. Inventor writes the file as
 * UTF-16 LE with a BOM (FF FE).
 *
 * @param {ArrayBuffer|Uint8Array|string} input
 * @returns {string}
 */
export function decodeIpjText(input) {
  if (typeof input === 'string') return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  // Detect UTF-16 BOMs
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  // Heuristic: alternating zero bytes look like UTF-16 LE
  if (bytes.length >= 4 && bytes[1] === 0x00 && bytes[3] === 0x00) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * @param {Element|null} parent
 * @param {string} tag
 * @returns {string}
 */
function textOf(parent, tag) {
  if (!parent) return '';
  const el = parent.getElementsByTagName(tag)[0];
  return el ? (el.textContent || '').trim() : '';
}

/**
 * Best-effort categorisation of a library path based on its display name and
 * filesystem location. Inventor doesn't expose an explicit "kind" — we infer.
 *
 * @param {string} name
 * @param {string} path
 * @returns {'standard'|'vendor'|'workspace'|'content-center'|'preset'|'unknown'}
 */
function classifyLibrary(name, path) {
  const lc = `${name} ${path}`.toLowerCase();
  if (lc.includes('content center')) return 'content-center';
  if (lc.includes('preset')) return 'preset';
  if (/\b(din|iso|ansi|jis|gost|sheet metal)\b/.test(lc)) return 'standard';
  if (/\b(zukaufteile|vendor|smc|igus|interroll|rittal|parker|mink)\b/.test(lc)) return 'vendor';
  if (/\bworkspace|arbeitsbereich\b/.test(lc)) return 'workspace';
  return 'unknown';
}

/**
 * Parse a `.ipj` document.
 *
 * @param {ArrayBuffer|Uint8Array|string} input  file bytes or already-decoded XML string
 * @param {{ DOMParser?: typeof DOMParser }} [deps]  inject a DOMParser polyfill (Node test envs)
 * @returns {IpjResult}
 */
export function parseIpj(input, deps = {}) {
  const warnings = [];
  const xml = decodeIpjText(input);

  const Parser = deps.DOMParser
    || (typeof DOMParser !== 'undefined' ? DOMParser : null);
  if (!Parser) {
    throw new Error('ipj-parser: no DOMParser available in this environment');
  }

  let doc;
  try {
    doc = new Parser().parseFromString(xml, 'text/xml');
  } catch (e) {
    throw new Error(`ipj-parser: XML parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Browsers report parse errors as a <parsererror> element rather than throwing.
  const parseErr = doc.getElementsByTagName('parsererror')[0];
  if (parseErr) {
    warnings.push(`xml parser warning: ${(parseErr.textContent || '').slice(0, 240)}`);
  }

  const rootEl = doc.getElementsByTagName('InventorProject')[0]
    || doc.getElementsByTagName('DesignProject')[0]
    || doc.documentElement;

  if (!rootEl) {
    return {
      name: '',
      version: '',
      workspacePath: '',
      libraryPaths: [],
      referencedFiles: [],
      options: emptyOptions(),
      warnings: [...warnings, 'no root element found'],
    };
  }

  const schemaRev = rootEl.getAttribute('schemarevid') || '';
  const ccGuid = rootEl.getAttribute('contentcenterguid') || '';

  const optionsEl = rootEl.getElementsByTagName('ProjectOptions')[0] || null;
  const options = {
    projectType: textOf(optionsEl, 'ProjectType'),
    owner: textOf(optionsEl, 'Owner'),
    releaseId: textOf(optionsEl, 'ReleaseID'),
    includedProject: textOf(optionsEl, 'IncludedProject'),
    uniqueFilenames: textOf(optionsEl, 'UsingUniqueFilenames').toLowerCase() === 'yes',
    contentCenterGuid: ccGuid,
  };

  // Workspace path(s) — Inventor allows multiple but the first is canonical.
  /** @type {LibraryPath[]} */
  const libraryPaths = [];
  const projectPathsEl = rootEl.getElementsByTagName('ProjectPaths')[0] || null;
  let workspacePath = '';
  if (projectPathsEl) {
    const paths = projectPathsEl.getElementsByTagName('ProjectPath');
    for (let i = 0; i < paths.length; i++) {
      const pp = paths[i];
      const t = (pp.getAttribute('pathtype') || '').toLowerCase();
      const pathName = textOf(pp, 'PathName');
      const pathVal = textOf(pp, 'Path');
      if (!workspacePath && (t === 'workspace' || t === '')) workspacePath = pathVal;
      libraryPaths.push({
        name: pathName || (t || 'workspace'),
        path: pathVal,
        kind: t === 'workspace' ? 'workspace' : classifyLibrary(pathName, pathVal),
      });
    }
  }

  // Explicit library paths (older Inventor schemas put them under <LibraryPaths>)
  const libraryPathsEl = rootEl.getElementsByTagName('LibraryPaths')[0] || null;
  if (libraryPathsEl) {
    const libs = libraryPathsEl.getElementsByTagName('LibraryPath');
    for (let i = 0; i < libs.length; i++) {
      const lp = libs[i];
      const pathName = textOf(lp, 'PathName');
      const pathVal = textOf(lp, 'Path');
      libraryPaths.push({
        name: pathName,
        path: pathVal,
        kind: classifyLibrary(pathName, pathVal),
      });
    }
  }

  // Content Center configured libraries (DIN, ISO, etc.) — these are virtual,
  // resolved by Inventor against the desktop content server, but we surface
  // them so the UI can show "linked content libraries".
  const ccFolderEl = rootEl.getElementsByTagName('ContentCenterFolder')[0] || null;
  if (ccFolderEl) {
    const folderPath = textOf(ccFolderEl, 'Path');
    if (folderPath) {
      libraryPaths.push({
        name: 'Content Center Files',
        path: folderPath,
        kind: 'content-center',
      });
    }
    const configured = ccFolderEl.getElementsByTagName('Library');
    for (let i = 0; i < configured.length; i++) {
      const lib = configured[i];
      libraryPaths.push({
        name: lib.getAttribute('DisplayName') || lib.getAttribute('LibraryAttachName') || '(unnamed)',
        path: lib.getAttribute('LibraryAttachName') || '',
        kind: classifyLibrary(lib.getAttribute('DisplayName') || '', ''),
        internalName: lib.getAttribute('InternalName') || undefined,
        readOnly: (lib.getAttribute('IsReadOnly') || '').toLowerCase() === 'true',
      });
    }
  }

  // Some schemas emit <ReferencedFiles>; capture if present.
  /** @type {string[]} */
  const referencedFiles = [];
  const refsEl = rootEl.getElementsByTagName('ReferencedFiles')[0] || null;
  if (refsEl) {
    const fileEls = refsEl.getElementsByTagName('File');
    for (let i = 0; i < fileEls.length; i++) {
      const fp = fileEls[i].getAttribute('Path') || (fileEls[i].textContent || '').trim();
      if (fp) referencedFiles.push(fp);
    }
  }

  // The .ipj does not actually list every workspace file — that comes from
  // walking the workspacePath directory at load time. We surface a hint:
  if (referencedFiles.length === 0 && workspacePath) {
    warnings.push(
      `referenced file list not embedded in ipj — walk workspace path "${workspacePath}" to enumerate parts/assemblies`,
    );
  }

  return {
    name: derivedProjectName(rootEl, doc),
    version: schemaRev,
    workspacePath,
    libraryPaths,
    referencedFiles,
    options,
    warnings,
  };
}

/**
 * Best-effort project name. The .ipj doesn't declare its own name in the
 * schema we observed; use <DisplayName>, <ProjectName>, the document filename
 * passed via deps, or fall back to the empty string.
 *
 * @param {Element} rootEl
 * @param {Document} doc
 */
function derivedProjectName(rootEl, doc) {
  const candidates = ['DisplayName', 'ProjectName', 'Name'];
  for (const tag of candidates) {
    const v = textOf(rootEl, tag);
    if (v) return v;
  }
  // Some files put a header comment with the project name; ignore for now.
  void doc;
  return '';
}

/**
 * @returns {IpjResult['options']}
 */
function emptyOptions() {
  return {
    projectType: '',
    owner: '',
    releaseId: '',
    includedProject: '',
    uniqueFilenames: false,
    contentCenterGuid: '',
  };
}
