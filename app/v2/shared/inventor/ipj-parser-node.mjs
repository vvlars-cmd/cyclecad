/**
 * shared/inventor/ipj-parser-node.mjs
 *
 * Node-compatible parser for Autodesk Inventor project files (`.ipj`).
 *
 * `shared/inventor/ipj-parser.js` is the canonical browser implementation,
 * but it relies on the global `DOMParser`. CI runs on Node and cannot use
 * that implementation, so we hand-roll a small regex / streaming reader
 * that produces the same shape of output.
 *
 * The `.ipj` is a UTF-16-LE BOM-prefixed XML document. The fields we care
 * about are:
 *
 *   <InventorProject schemarevid="…" contentcenterguid="…">
 *     <ProjectOptions>…</ProjectOptions>
 *     <ProjectPaths>
 *       <ProjectPath pathtype="Workspace">
 *         <PathName>Arbeitsbereich</PathName>
 *         <Path>.\Workspaces\Arbeitsbereich</Path>
 *       </ProjectPath>
 *       …
 *     </ProjectPaths>
 *     <LibraryPaths>            (older schemas)
 *       <LibraryPath><PathName/><Path/></LibraryPath>
 *       …
 *     </LibraryPaths>
 *     <FolderOptions>
 *       <ContentCenterFolder>
 *         <Path>.\Libraries\Content Center Files\</Path>
 *         <ContentCenterConfig>
 *           <ConfiguredLibraries>
 *             <Library DisplayName="…" InternalName="…" .../>
 *             …
 *
 * Pure ESM. No DOMParser. Zero dependencies beyond `node:fs/promises`,
 * `node:path`, `node:buffer`, and `node:url`.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

/* ───────────────────────────────────────────────────────────────────────
   Public constants
   ─────────────────────────────────────────────────────────────────── */

/**
 * Vendor names that classify a library path as `'vendor'`. The list is
 * shared with the server-side classifier in `server/meter/index.js` so the
 * two stay in lockstep.
 *
 * @type {ReadonlyArray<string>}
 */
export const KNOWN_VENDORS = Object.freeze([
  'igus',
  'mink',
  'smc',
  'festo',
  'bosch',
  'wuerth',
  'würth',
  'rittal',
  'parker',
  'interroll',
  'ganter',
  'norelem',
  'misumi',
  'smg',
  'clangsonic',
  'item',
  'maedler',
  'mädler',
]);

/* ───────────────────────────────────────────────────────────────────────
   Encoding detection
   ─────────────────────────────────────────────────────────────────── */

/**
 * Detect the byte encoding of an `.ipj` buffer. Inventor writes UTF-16 LE
 * with a BOM; we accept BOM-less UTF-16 LE via a heuristic and fall back
 * to UTF-8 otherwise.
 *
 * @param {Buffer | Uint8Array} bytes
 * @returns {'utf-16le' | 'utf-8'}
 */
export function detectEncoding(bytes) {
  if (!bytes || bytes.length < 2) return 'utf-8';
  // BOM: FF FE → UTF-16 LE
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  // BOM-less heuristic: XML always starts with '<' (0x3c). In UTF-16 LE
  // the first two bytes are 3C 00.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x3c &&
    bytes[1] === 0x00 &&
    bytes[2] !== 0x00 &&
    bytes[3] === 0x00
  ) {
    return 'utf-16le';
  }
  return 'utf-8';
}

/**
 * Decode an `.ipj` byte buffer to a UTF-8 JavaScript string.
 *
 * @param {Buffer | Uint8Array} bytes
 * @returns {string}
 */
function decodeBytes(bytes) {
  const enc = detectEncoding(bytes);
  if (enc === 'utf-16le') {
    // Skip BOM if present
    const start = bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0;
    return new TextDecoder('utf-16le').decode(bytes.subarray(start));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/* ───────────────────────────────────────────────────────────────────────
   Tiny XML helpers — regex-based, no DOM
   ─────────────────────────────────────────────────────────────────── */

/**
 * Decode the five mandatory XML entities + numeric character references.
 *
 * @param {string} s
 * @returns {string}
 */
function decodeXmlEntities(s) {
  if (!s) return '';
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Match the first `<Tag …>…</Tag>` block (non-greedy across newlines) and
 * return the inner text. Returns `''` when not found.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {string}
 */
function firstElementText(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return decodeXmlEntities(m[1].trim());
}

/**
 * Match every `<Tag …>…</Tag>` block. Returns the array of inner-text
 * strings.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {string[]}
 */
function allElementTexts(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(decodeXmlEntities(m[1].trim()));
  return out;
}

/**
 * Match every `<Tag …>…</Tag>` block and return both the attribute string
 * (the raw inside-the-angle-brackets text) and the inner text body.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {Array<{ attrs: string, body: string }>}
 */
function allElementBlocks(xml, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: m[1], body: m[2] });
  }
  return out;
}

/**
 * Match every self-closing `<Tag … />` element and return its attribute
 * string.
 *
 * @param {string} xml
 * @param {string} tag
 * @returns {string[]}
 */
function allSelfClosing(xml, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*?)/>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/**
 * Pull a single attribute value out of a raw attribute string.
 *
 * @param {string} attrs
 * @param {string} name
 * @returns {string}
 */
function attr(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = attrs.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

/* ───────────────────────────────────────────────────────────────────────
   Library classification
   ─────────────────────────────────────────────────────────────────── */

/**
 * Classify a library path by its display name and filesystem location.
 *
 * @param {string} name
 * @param {string} location
 * @returns {'standard'|'vendor'|'workspace'|'content-center'}
 */
function classifyLibrary(name, location) {
  const lc = `${name} ${location}`.toLowerCase();
  if (lc.includes('content center')) return 'content-center';
  if (/\b(din|iso|ansi|jis|gost|sheet metal|standard|mold)\b/.test(lc)) {
    return 'standard';
  }
  for (const v of KNOWN_VENDORS) {
    if (lc.includes(v)) return 'vendor';
  }
  if (/\b(workspace|arbeitsbereich)\b/.test(lc)) return 'workspace';
  return 'workspace';
}

/* ───────────────────────────────────────────────────────────────────────
   Main parser
   ─────────────────────────────────────────────────────────────────── */

/**
 * @typedef {{
 *   name: string,
 *   path: string,
 *   kind: 'standard'|'vendor'|'workspace'|'content-center'
 * }} LibraryPath
 */

/**
 * @typedef {{
 *   name: string,
 *   version: string | null,
 *   workspacePath: string,
 *   libraryPaths: LibraryPath[],
 *   referencedFiles: string[],
 *   warnings: string[]
 * }} IpjResult
 */

/**
 * Parse an Inventor project (.ipj) file.
 *
 * @param {Buffer | Uint8Array} bytes
 * @param {{ filename?: string }} [options]  optional caller hints; `filename`
 *                                            is used to derive `name` when
 *                                            the document doesn't carry one
 * @returns {IpjResult}
 */
export function parseIpj(bytes, options = {}) {
  /** @type {string[]} */
  const warnings = [];
  /** @type {LibraryPath[]} */
  const libraryPaths = [];
  /** @type {string[]} */
  const referencedFiles = [];

  let xml;
  try {
    xml = decodeBytes(bytes);
  } catch (err) {
    warnings.push(`decode failed: ${err && err.message ? err.message : String(err)}`);
    return {
      name: deriveNameFromFilename(options.filename),
      version: null,
      workspacePath: '',
      libraryPaths,
      referencedFiles,
      warnings,
    };
  }

  // Strip the optional XML declaration and any BOM that survived decoding.
  xml = xml.replace(/^﻿/, '');

  // Project name — try several tags before falling back to the filename.
  let name = firstElementText(xml, 'ProjectName')
    || firstElementText(xml, 'DisplayName');
  if (!name) {
    // Root-level <Name> (avoid nested <PathName>, <ServerName>, etc.).
    const m = xml.match(/<Name>([\s\S]*?)<\/Name>/);
    if (m) name = decodeXmlEntities(m[1].trim());
  }
  if (!name) {
    name = deriveNameFromFilename(options.filename);
    if (!name) warnings.push('no project name found in document');
  }

  // Schema revision — preferred attribute on <InventorProject>, but also
  // accept a standalone <SchemaRevision> element.
  /** @type {string | null} */
  let version = null;
  const rootMatch = xml.match(/<InventorProject\b([^>]*)>/i)
    || xml.match(/<DesignProject\b([^>]*)>/i);
  if (rootMatch) {
    const v = attr(rootMatch[1], 'schemarevid');
    if (v) version = v;
  }
  if (!version) {
    const v = firstElementText(xml, 'SchemaRevision');
    if (v) version = v;
  }
  if (!version) warnings.push('no schema revision found');

  // Workspace path.
  let workspacePath = firstElementText(xml, 'WorkspacePath');
  if (!workspacePath) {
    // Look inside <ProjectPaths> for the first ProjectPath of pathtype="Workspace"
    const projectPathsBlock = xml.match(/<ProjectPaths\b[^>]*>([\s\S]*?)<\/ProjectPaths>/i);
    if (projectPathsBlock) {
      const blocks = allElementBlocks(projectPathsBlock[1], 'ProjectPath');
      for (const { attrs, body } of blocks) {
        const pathName = firstElementText(body, 'PathName');
        const pathVal = firstElementText(body, 'Path');
        const kindAttr = attr(attrs, 'pathtype').toLowerCase();
        if (!workspacePath && (kindAttr === 'workspace' || kindAttr === '')) {
          workspacePath = pathVal;
        }
        if (pathVal) {
          libraryPaths.push({
            name: pathName || kindAttr || 'workspace',
            path: pathVal,
            kind: kindAttr === 'workspace' || kindAttr === ''
              ? 'workspace'
              : classifyLibrary(pathName, pathVal),
          });
        }
      }
    }
  }
  if (!workspacePath) warnings.push('no workspace path found');

  // Older / alternative schemas: <LibraryPaths><LibraryPath>…</LibraryPath></LibraryPaths>
  const libraryPathsBlock = xml.match(/<LibraryPaths\b[^>]*>([\s\S]*?)<\/LibraryPaths>/i);
  if (libraryPathsBlock) {
    const blocks = allElementBlocks(libraryPathsBlock[1], 'LibraryPath');
    for (const { body } of blocks) {
      const pathName = firstElementText(body, 'PathName');
      const pathVal = firstElementText(body, 'Path');
      if (pathVal) {
        libraryPaths.push({
          name: pathName || pathVal,
          path: pathVal,
          kind: classifyLibrary(pathName, pathVal),
        });
      }
    }
    // Inline `<LibraryPath>…</LibraryPath>` whose body is just the path.
    const inlineRe = /<LibraryPath\b[^>]*>([^<]+)<\/LibraryPath>/gi;
    let im;
    while ((im = inlineRe.exec(libraryPathsBlock[1])) !== null) {
      const pathVal = decodeXmlEntities(im[1].trim());
      if (pathVal && !blocks.some(b => b.body.includes(pathVal))) {
        libraryPaths.push({
          name: pathVal,
          path: pathVal,
          kind: classifyLibrary('', pathVal),
        });
      }
    }
  }

  // Content-center folder + configured libraries.
  const ccBlock = xml.match(/<ContentCenterFolder\b[^>]*>([\s\S]*?)<\/ContentCenterFolder>/i);
  if (ccBlock) {
    const ccPath = firstElementText(ccBlock[1], 'Path');
    if (ccPath) {
      libraryPaths.push({
        name: 'Content Center Files',
        path: ccPath,
        kind: 'content-center',
      });
    }
    const libs = allSelfClosing(ccBlock[1], 'Library');
    for (const a of libs) {
      const display = attr(a, 'DisplayName');
      const internal = attr(a, 'LibraryAttachName');
      if (display || internal) {
        libraryPaths.push({
          name: display || internal || '(unnamed)',
          path: internal || '',
          kind: classifyLibrary(display, internal),
        });
      }
    }
  }

  // <ReferencedFiles> — older / non-standard.
  const refsBlock = xml.match(/<ReferencedFiles\b[^>]*>([\s\S]*?)<\/ReferencedFiles>/i);
  if (refsBlock) {
    const inline = allElementTexts(refsBlock[1], 'File');
    for (const t of inline) if (t) referencedFiles.push(t);
    const selfClosing = allSelfClosing(refsBlock[1], 'File');
    for (const a of selfClosing) {
      const p = attr(a, 'Path');
      if (p) referencedFiles.push(p);
    }
  }
  if (referencedFiles.length === 0 && workspacePath) {
    warnings.push(
      `referenced file list not embedded in ipj — walk workspace path "${workspacePath}" to enumerate parts/assemblies`,
    );
  }

  return {
    name,
    version,
    workspacePath,
    libraryPaths,
    referencedFiles,
    warnings,
  };
}

/**
 * Convenience wrapper: read the file from disk and parse it.
 *
 * @param {string} filePath
 * @returns {Promise<IpjResult>}
 */
export async function parseIpjFromFile(filePath) {
  const buf = await fs.readFile(filePath);
  return parseIpj(buf, { filename: path.basename(filePath) });
}

/* ───────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────── */

/**
 * Strip the trailing `.ipj` (or any extension) from a filename to derive
 * a fallback project name.
 *
 * @param {string | undefined} filename
 * @returns {string}
 */
function deriveNameFromFilename(filename) {
  if (!filename) return '';
  const base = path.basename(String(filename));
  const ext = path.extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

/* ───────────────────────────────────────────────────────────────────────
   CLI mode — `node shared/inventor/ipj-parser-node.mjs path/to/foo.ipj`
   ─────────────────────────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`
  || (process.argv[1] && import.meta.url === fileURLToPath
    && fileURLToPath(import.meta.url) === process.argv[1])) {
  const arg = process.argv[2];
  if (arg) {
    parseIpjFromFile(arg).then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }).catch(err => {
      process.stderr.write(`error: ${err && err.message ? err.message : err}\n`);
      process.exit(1);
    });
  }
}
