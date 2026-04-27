/**
 * iam-parser.js
 *
 * Parse Autodesk Inventor assembly files (`.iam`).
 *
 * `.iam` is a CFB (compound file binary) container. Inside the storage tree
 * Inventor places dozens of named streams. The shapes we know about:
 *
 *   /                                    — root storage
 *     RSeRSeDb                           — references database (child file paths)
 *     RSeStream / RSe...Thumb            — preview JPEG thumbnail
 *     "\x05DocumentSummaryInformation"   — Office property stream (FMTID)
 *     "\x05SummaryInformation"           — Office property stream (FMTID)
 *     BRxBlk* / BRxSmBlk*                — B-Rep occurrence + sheet-metal blocks
 *     Feature*                           — feature tree entries
 *
 * Inventor's binary format is undocumented past these well-known shells.
 * We extract the things that are reliable (file refs, thumbnail, property
 * streams) and best-effort the rest. Anything we can't parse cleanly is
 * returned as `null` with a warning.
 */

import { isCfb, parseHeader, readDirectory, readStream, walk } from './ole-cfb-reader.js';

/**
 * @typedef {Object} IamOccurrence
 * @property {string} name
 * @property {string} refPath        relative path to the child .ipt/.iam
 * @property {number[]|null} transform  4×4 row-major transform if we could read it
 */

/**
 * @typedef {Object} IamProperties
 * @property {string} [author]
 * @property {string} [description]
 * @property {string} [title]
 * @property {string} [subject]
 * @property {string} [partNumber]
 * @property {string} [revision]
 * @property {number} [mass]
 * @property {string} [units]
 * @property {string} [createdAt]
 * @property {string} [modifiedAt]
 */

/**
 * @typedef {Object} IamResult
 * @property {string} name
 * @property {'assembly'} kind
 * @property {Uint8Array|null} thumbnail
 * @property {IamProperties} properties
 * @property {IamOccurrence[]} occurrences
 * @property {{streams: Array<{path:string, name:string, size:number}>}} raw
 * @property {string[]} warnings
 */

const SUMMARY_STREAM_NAMES = [
  'SummaryInformation',
  'DocumentSummaryInformation',
  'DesignTrackingProperties',
  'Zrd_RPr',
];

/**
 * Parse an Inventor assembly buffer.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @param {{ name?: string }} [opts]
 * @returns {IamResult}
 */
export function parseIam(input, opts = {}) {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const warnings = [];

  if (!isCfb(buffer)) {
    return {
      name: opts.name || '',
      kind: 'assembly',
      thumbnail: null,
      properties: {},
      occurrences: [],
      raw: { streams: [] },
      warnings: ['not a CFB file (signature mismatch)'],
    };
  }

  const header = parseHeader(buffer);
  const dir = readDirectory(buffer, header);
  const entries = walk(buffer);
  const byName = new Map();
  for (const e of entries) byName.set(e.name, e);

  // 1. Thumbnail — Inventor usually keeps a JPEG preview in a stream; the
  //    safest cross-version approach is to scan likely streams for the JPEG
  //    SOI marker (FF D8 FF) and grab from there to the EOI (FF D9).
  const thumbnail = extractThumbnail(buffer, header, dir, entries, warnings);

  // 2. Properties — pull from the standard Office property streams.
  const properties = extractProperties(buffer, header, byName, warnings);

  // 3. References database — list of child file paths.
  const refs = extractReferencedFiles(buffer, header, byName, warnings);

  // 4. Occurrences (placement transforms). Inventor's BRxBlk* binary layout
  //    is undocumented; we return null transforms for now and let the caller
  //    fall back to identity placement during rebuild.
  const occurrences = refs.map((refPath) => ({
    name: refPath.split(/[\\/]/).pop() || refPath,
    refPath,
    transform: null,
  }));
  if (refs.length > 0) {
    warnings.push('occurrence transforms are not extracted — Inventor BRxBlk binary layout is undocumented');
  }

  return {
    name: opts.name || guessNameFromProps(properties) || '',
    kind: 'assembly',
    thumbnail,
    properties,
    occurrences,
    raw: {
      streams: entries.map((e) => ({ path: e.path, name: e.name, size: e.size })),
    },
    warnings,
  };
}

/**
 * Find a JPEG inside the CFB.
 * Inventor stores the preview bytes in different streams across versions
 * (`RSeStream`, `RSe...Thumb`, etc.). We try named candidates first, then
 * fall back to scanning every stream up to a sane size limit.
 *
 * @param {Uint8Array} buffer
 * @param {ReturnType<typeof parseHeader>} header
 * @param {ReturnType<typeof readDirectory>} dir
 * @param {ReturnType<typeof walk>} entries
 * @param {string[]} warnings
 */
function extractThumbnail(buffer, header, dir, entries, warnings) {
  const candidates = entries
    .filter((e) => e.type === 'stream')
    .filter((e) => /thumb|preview|RSeStream/i.test(e.name) || e.size < 256_000)
    .sort((a, b) => {
      // Prefer streams whose names hint at a thumbnail
      const ah = /thumb|preview|RSeStream/i.test(a.name) ? 0 : 1;
      const bh = /thumb|preview|RSeStream/i.test(b.name) ? 0 : 1;
      return ah - bh || a.size - b.size;
    });

  for (const c of candidates) {
    if (c.size < 8 || c.size > 4_000_000) continue;
    const dirEntry = dir[c.entry.index];
    let data;
    try {
      data = readStream(buffer, header, dirEntry);
    } catch {
      continue;
    }
    const jpg = sliceJpeg(data);
    if (jpg) return jpg;
  }
  warnings.push('thumbnail: no embedded JPEG found in known streams');
  return null;
}

/**
 * Find a JPEG by SOI/EOI markers and return the slice. Returns null if no
 * complete JPEG is present.
 *
 * @param {Uint8Array} bytes
 * @returns {Uint8Array|null}
 */
function sliceJpeg(bytes) {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && bytes[i + 2] === 0xFF) {
      // Find EOI (FF D9). Some Inventor streams pad after EOI; we just search forward.
      for (let j = i + 3; j < bytes.length - 1; j++) {
        if (bytes[j] === 0xFF && bytes[j + 1] === 0xD9) {
          return bytes.slice(i, j + 2);
        }
      }
      // No EOI — return what we have so the caller can still try to render.
      return bytes.slice(i);
    }
  }
  return null;
}

/**
 * Extract properties from the standard Office property streams.
 *
 * The two well-known streams are encoded per [MS-OLEPS]: a property-set
 * stream contains a `PropertySetStream` header plus one or more property
 * sets, each a list of (propertyId → value) entries.
 *
 * We use a tolerant decoder: grab every UTF-8 / UTF-16 / ASCII string longer
 * than 3 chars, and key them by their preceding propertyId where we can.
 * If decoding fails, the property streams are still recorded in `raw.streams`.
 *
 * @param {Uint8Array} buffer
 * @param {ReturnType<typeof parseHeader>} header
 * @param {Map<string, object>} byName
 * @param {string[]} warnings
 * @returns {IamProperties}
 */
function extractProperties(buffer, header, byName, warnings) {
  /** @type {IamProperties} */
  const props = {};

  for (const streamName of SUMMARY_STREAM_NAMES) {
    const entry = byName.get(streamName);
    if (!entry) continue;
    let bytes;
    try {
      bytes = readStream(buffer, header, entry.entry);
    } catch (e) {
      warnings.push(`property stream "${streamName}" unreadable: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    try {
      decodePropertySet(bytes, props);
    } catch (e) {
      warnings.push(`property stream "${streamName}" decode failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return props;
}

/**
 * Decode a Microsoft OLE property-set stream into the props object.
 * Handles the common VT_LPSTR (0x1E), VT_LPWSTR (0x1F), VT_FILETIME (0x40),
 * VT_R8 (0x05), VT_I4 (0x03), VT_I2 (0x02), VT_BOOL (0x0B) types.
 *
 * Property IDs we map (DocumentSummaryInformation / SummaryInformation):
 *   0x02 Title       0x03 Subject     0x04 Author       0x06 Comments
 *   0x08 LastSaved   0x0C CreateTime  0x0D LastSaveTime
 *
 * Inventor adds custom DesignTracking properties; we don't enumerate the
 * full FMTID space — instead we key strings to their property name where
 * the header lists names (DocumentSummaryInformation often does).
 *
 * @param {Uint8Array} bytes
 * @param {IamProperties} props
 */
function decodePropertySet(bytes, props) {
  if (bytes.length < 48) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PropertySetStream: ByteOrder(2) Version(2) SystemId(4) Clsid(16) NumPropertySets(4)
  const numSets = view.getUint32(24, true);
  if (numSets < 1 || numSets > 8) return;

  for (let s = 0; s < numSets; s++) {
    const fmtidOff = 28 + s * 20;
    if (fmtidOff + 20 > bytes.length) break;
    const setOffset = view.getUint32(fmtidOff + 16, true);
    decodeSingleSet(view, bytes, setOffset, props);
  }
}

/**
 * Decode one property set within the stream.
 *
 * @param {DataView} view
 * @param {Uint8Array} bytes
 * @param {number} setOffset
 * @param {IamProperties} props
 */
function decodeSingleSet(view, bytes, setOffset, props) {
  if (setOffset + 8 > bytes.length) return;
  const numProps = view.getUint32(setOffset + 4, true);
  if (numProps > 1024) return; // sanity

  /** @type {Map<number, string>} */
  const dictionary = new Map();
  const idOffsets = [];

  for (let i = 0; i < numProps; i++) {
    const idOff = setOffset + 8 + i * 8;
    if (idOff + 8 > bytes.length) return;
    const propId = view.getUint32(idOff, true);
    const valueOff = view.getUint32(idOff + 4, true);
    idOffsets.push({ propId, abs: setOffset + valueOff });
  }

  // Property ID 0 is the dictionary entry (when present): { count, [{id, len, name}] }
  const dictEntry = idOffsets.find((p) => p.propId === 0);
  if (dictEntry && dictEntry.abs + 4 <= bytes.length) {
    let p = dictEntry.abs;
    const count = view.getUint32(p, true); p += 4;
    for (let i = 0; i < count && p + 8 <= bytes.length; i++) {
      const dpid = view.getUint32(p, true); p += 4;
      const nameLen = view.getUint32(p, true); p += 4;
      const len = Math.min(nameLen, bytes.length - p);
      const raw = bytes.subarray(p, p + len);
      p += nameLen;
      // Round up to 4-byte boundary
      while (p % 4 !== 0 && p < bytes.length) p++;
      const name = decodeAsciiOrUtf16(raw).replace(/\0+$/, '');
      if (name) dictionary.set(dpid, name);
    }
  }

  for (const { propId, abs } of idOffsets) {
    if (propId === 0) continue;
    if (abs + 4 > bytes.length) continue;
    const vtype = view.getUint32(abs, true) & 0xFFFF;
    const val = decodeVariant(view, bytes, abs + 4, vtype);
    if (val === undefined || val === null) continue;
    const name = dictionary.get(propId) || stdPropertyName(propId);
    if (!name) continue;
    assignProp(props, name, val);
  }
}

/**
 * Map common SummaryInformation / DocumentSummaryInformation property IDs to
 * Inventor-friendly names.
 *
 * @param {number} propId
 * @returns {string|null}
 */
function stdPropertyName(propId) {
  switch (propId) {
    case 0x02: return 'Title';
    case 0x03: return 'Subject';
    case 0x04: return 'Author';
    case 0x05: return 'Keywords';
    case 0x06: return 'Comments';
    case 0x08: return 'LastSavedBy';
    case 0x09: return 'Revision';
    case 0x0C: return 'CreateTime';
    case 0x0D: return 'LastSaveTime';
    default: return null;
  }
}

/**
 * @param {IamProperties} props
 * @param {string} name
 * @param {string|number|Date} val
 */
function assignProp(props, name, val) {
  const lc = name.toLowerCase();
  if (lc.includes('author') || lc.includes('designer')) props.author = String(val);
  else if (lc.includes('description') || lc.includes('comments') || lc.includes('subject')) props.description = String(val);
  else if (lc.includes('title')) props.title = String(val);
  else if (lc.includes('partnumber') || lc.includes('part number') || lc === 'partnumber') props.partNumber = String(val);
  else if (lc.includes('revision')) props.revision = String(val);
  else if (lc.includes('mass') && typeof val === 'number') props.mass = val;
  else if (lc.includes('units')) props.units = String(val);
  else if (lc.includes('createtime') || lc.includes('created')) props.createdAt = String(val);
  else if (lc.includes('lastsave') || lc.includes('modified')) props.modifiedAt = String(val);
}

/**
 * Decode a single OLE variant value.
 *
 * @param {DataView} view
 * @param {Uint8Array} bytes
 * @param {number} off
 * @param {number} vtype
 * @returns {string|number|Date|null}
 */
function decodeVariant(view, bytes, off, vtype) {
  if (off >= bytes.length) return null;
  switch (vtype) {
    case 0x02: // VT_I2
      return view.getInt16(off, true);
    case 0x03: // VT_I4
      return view.getInt32(off, true);
    case 0x04: // VT_R4
      return view.getFloat32(off, true);
    case 0x05: // VT_R8
      return view.getFloat64(off, true);
    case 0x0B: // VT_BOOL
      return view.getInt16(off, true) !== 0 ? 1 : 0;
    case 0x1E: { // VT_LPSTR (length-prefixed ASCII / codepage)
      if (off + 4 > bytes.length) return null;
      const len = view.getUint32(off, true);
      const safeLen = Math.min(len, bytes.length - off - 4);
      const raw = bytes.subarray(off + 4, off + 4 + safeLen);
      return decodeAsciiOrUtf16(raw).replace(/\0+$/, '');
    }
    case 0x1F: { // VT_LPWSTR (length-prefixed UTF-16, length is in chars)
      if (off + 4 > bytes.length) return null;
      const chars = view.getUint32(off, true);
      const byteLen = Math.min(chars * 2, bytes.length - off - 4);
      const raw = bytes.subarray(off + 4, off + 4 + byteLen);
      return new TextDecoder('utf-16le').decode(raw).replace(/\0+$/, '');
    }
    case 0x40: { // VT_FILETIME (100-ns intervals since 1601-01-01)
      if (off + 8 > bytes.length) return null;
      const lo = view.getUint32(off, true);
      const hi = view.getUint32(off + 4, true);
      const ns100 = hi * 4_294_967_296 + lo;
      const ms = ns100 / 10_000 - 11_644_473_600_000; // 1601→1970 epoch shift
      if (!isFinite(ms) || ms < 0) return null;
      return new Date(ms).toISOString();
    }
    default:
      return null;
  }
}

/**
 * Heuristic decode for length-prefixed strings whose codepage we don't know.
 * Inventor sometimes uses Windows-1252; fall back to UTF-8 if the bytes look
 * unicode-clean.
 *
 * @param {Uint8Array} raw
 */
function decodeAsciiOrUtf16(raw) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(raw);
  } catch {
    return Array.from(raw, (b) => String.fromCharCode(b)).join('');
  }
}

/**
 * Walk the references database stream and pull out child file paths.
 *
 * `RSeRSeDb` is a binary list of UTF-16 strings interspersed with metadata
 * we don't fully understand. We scan for substrings ending in `.ipt`, `.iam`,
 * `.idw`, `.ipn`, `.dwg`, `.step`, `.stp` (case-insensitive), which is the
 * approach used by community-built parsers (e.g. the ipj-based crawlers).
 *
 * Reliability: the file paths themselves are always plain text, so this
 * approach has very low false-positive rate on real Inventor data.
 *
 * @param {Uint8Array} buffer
 * @param {ReturnType<typeof parseHeader>} header
 * @param {Map<string, object>} byName
 * @param {string[]} warnings
 * @returns {string[]}
 */
function extractReferencedFiles(buffer, header, byName, warnings) {
  // Try the named refs DB first; otherwise scan every stream that looks
  // like a refs DB (Inventor uses several names across versions).
  const candidates = [
    'RSeRSeDb',
    'RSeDb',
    'RSeNamedReferences',
    'Protein',
  ];

  /** @type {Set<string>} */
  const found = new Set();

  for (const name of candidates) {
    const entry = byName.get(name);
    if (!entry) continue;
    let bytes;
    try {
      bytes = readStream(buffer, header, entry.entry);
    } catch {
      continue;
    }
    scanForFileRefs(bytes, found);
  }

  // Fallback: scan every storage starting with "RSe" to catch version drift.
  if (found.size === 0) {
    for (const [n, e] of byName) {
      if (!n.startsWith('RSe') || e.type !== 'stream') continue;
      try {
        const bytes = readStream(buffer, header, e.entry);
        scanForFileRefs(bytes, found);
      } catch {
        /* swallow */
      }
    }
  }

  if (found.size === 0) {
    warnings.push('reference DB: no Inventor file paths found in any RSe* stream');
  }
  return Array.from(found);
}

/**
 * Pull out paths matching `*.ipt|.iam|.idw|.ipn|.dwg|.stp|.step` from a byte
 * buffer. Inventor stores them as UTF-16 LE inside the references DB.
 *
 * @param {Uint8Array} bytes
 * @param {Set<string>} into
 */
function scanForFileRefs(bytes, into) {
  // Decode as UTF-16 LE — Inventor uses 16-bit strings in the refs DB.
  const text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
  // Also decode as latin1 in case some shorter ASCII names slip through.
  const ascii = Array.from(bytes, (b) => (b >= 0x20 && b < 0x7F) || b === 0x5C || b === 0x2F ? String.fromCharCode(b) : ' ').join('');

  const re = /[A-Za-z]:[\\\/][^ <>"|*?\r\n]+?\.(ipt|iam|idw|ipn|dwg|stp|step)\b/gi;
  const reRel = /[^ <>"|*?\r\n\\\/]+?\.(ipt|iam|idw|ipn|dwg|stp|step)\b/gi;

  for (const src of [text, ascii]) {
    let m;
    while ((m = re.exec(src)) !== null) {
      into.add(m[0]);
      if (re.lastIndex === m.index) re.lastIndex++; // belt-and-braces
    }
    while ((m = reRel.exec(src)) !== null) {
      // Filter obviously bogus matches (very short or non-printable runs)
      if (m[0].length >= 5) into.add(m[0]);
      if (reRel.lastIndex === m.index) reRel.lastIndex++;
    }
  }
}

/**
 * @param {IamProperties} props
 */
function guessNameFromProps(props) {
  return props.title || props.partNumber || '';
}
