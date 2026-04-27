/**
 * ipt-parser.js
 *
 * Parse Autodesk Inventor part files (`.ipt`).
 *
 * `.ipt` is a CFB container, like `.iam`. The interesting streams are:
 *
 *   "\x05DocumentSummaryInformation"   — Office property stream
 *   "\x05SummaryInformation"           — Office property stream
 *   DesignTrackingProperties           — material, mass, part number, units
 *   RSeStream / *Thumb                 — preview JPEG (FF D8 FF)
 *   Feature*                           — one stream per feature in the tree
 *   BR{?}SmBlk* / BRxSmBlk*            — sheet-metal binary blocks
 *
 * What we extract definitively:
 *   - Thumbnail JPEG (by SOI/EOI markers)
 *   - Properties (author, description, material, mass, part number, units)
 *   - hasSheetMetal flag (from BR*SmBlk* presence)
 *   - featureCount (from Feature*-prefixed streams)
 *
 * What we don't extract (Inventor's binary geometry layout is undocumented):
 *   - Feature parameter values
 *   - B-Rep faces / edges (caller must use the rebuild pipeline)
 */

import { isCfb, parseHeader, readDirectory, readStream, walk } from './ole-cfb-reader.js';

/**
 * @typedef {Object} IptProperties
 * @property {string} [partNumber]
 * @property {string} [author]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [material]
 * @property {number} [mass]
 * @property {string} [units]
 * @property {string} [revision]
 * @property {string} [stockNumber]
 * @property {string} [createdAt]
 * @property {string} [modifiedAt]
 */

/**
 * @typedef {Object} IptResult
 * @property {string} name
 * @property {'part'|'sheet-metal'} kind
 * @property {Uint8Array|null} thumbnail
 * @property {IptProperties} properties
 * @property {number} featureCount
 * @property {boolean} hasSheetMetal
 * @property {{streams: Array<{path:string, name:string, size:number}>}} raw
 * @property {string[]} warnings
 */

const SUMMARY_STREAM_NAMES = [
  'SummaryInformation',
  'DocumentSummaryInformation',
  'DesignTrackingProperties',
  'Zrd_RPr',
];

/**
 * @param {ArrayBuffer|Uint8Array} input
 * @param {{ name?: string }} [opts]
 * @returns {IptResult}
 */
export function parseIpt(input, opts = {}) {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const warnings = [];

  if (!isCfb(buffer)) {
    return {
      name: opts.name || '',
      kind: 'part',
      thumbnail: null,
      properties: {},
      featureCount: 0,
      hasSheetMetal: false,
      raw: { streams: [] },
      warnings: ['not a CFB file (signature mismatch)'],
    };
  }

  const header = parseHeader(buffer);
  const dir = readDirectory(buffer, header);
  const entries = walk(buffer);
  const byName = new Map();
  for (const e of entries) byName.set(e.name, e);

  const thumbnail = extractThumbnail(buffer, header, dir, entries, warnings);
  const properties = extractProperties(buffer, header, byName, warnings);

  // Sheet metal detection: any stream whose name matches /BR.SmBlk/ indicates
  // the part has the sheet metal feature set.
  let hasSheetMetal = false;
  let featureCount = 0;
  for (const e of entries) {
    if (e.type !== 'stream') continue;
    if (/BR.{1,2}SmBlk/.test(e.name) || /SheetMetal/i.test(e.name)) hasSheetMetal = true;
    if (/^Feature/.test(e.name) || /^Feat\d/.test(e.name)) featureCount++;
  }

  return {
    name: opts.name || properties.partNumber || properties.title || '',
    kind: hasSheetMetal ? 'sheet-metal' : 'part',
    thumbnail,
    properties,
    featureCount,
    hasSheetMetal,
    raw: {
      streams: entries.map((e) => ({ path: e.path, name: e.name, size: e.size })),
    },
    warnings,
  };
}

/**
 * Find a JPEG inside the CFB by scanning likely streams for the SOI marker.
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
 * @param {Uint8Array} bytes
 * @returns {Uint8Array|null}
 */
function sliceJpeg(bytes) {
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && bytes[i + 2] === 0xFF) {
      for (let j = i + 3; j < bytes.length - 1; j++) {
        if (bytes[j] === 0xFF && bytes[j + 1] === 0xD9) {
          return bytes.slice(i, j + 2);
        }
      }
      return bytes.slice(i);
    }
  }
  return null;
}

/* ----- property streams (shared logic with iam-parser) -------------------- */

/**
 * @param {Uint8Array} buffer
 * @param {ReturnType<typeof parseHeader>} header
 * @param {Map<string, object>} byName
 * @param {string[]} warnings
 * @returns {IptProperties}
 */
function extractProperties(buffer, header, byName, warnings) {
  /** @type {IptProperties} */
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
 * @param {Uint8Array} bytes
 * @param {IptProperties} props
 */
function decodePropertySet(bytes, props) {
  if (bytes.length < 48) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
 * @param {DataView} view
 * @param {Uint8Array} bytes
 * @param {number} setOffset
 * @param {IptProperties} props
 */
function decodeSingleSet(view, bytes, setOffset, props) {
  if (setOffset + 8 > bytes.length) return;
  const numProps = view.getUint32(setOffset + 4, true);
  if (numProps > 1024) return;

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
 * @param {IptProperties} props
 * @param {string} name
 * @param {string|number|Date} val
 */
function assignProp(props, name, val) {
  const lc = name.toLowerCase();
  if (lc.includes('partnumber') || lc.includes('part number')) props.partNumber = String(val);
  else if (lc.includes('author') || lc.includes('designer')) props.author = String(val);
  else if (lc.includes('description') || lc.includes('comments') || lc.includes('subject')) props.description = String(val);
  else if (lc.includes('title')) props.title = String(val);
  else if (lc.includes('material')) props.material = String(val);
  else if (lc.includes('stocknumber') || lc.includes('stock number')) props.stockNumber = String(val);
  else if (lc.includes('revision')) props.revision = String(val);
  else if (lc === 'mass' && typeof val === 'number') props.mass = val;
  else if (lc.includes('units')) props.units = String(val);
  else if (lc.includes('createtime') || lc.includes('created')) props.createdAt = String(val);
  else if (lc.includes('lastsave') || lc.includes('modified')) props.modifiedAt = String(val);
}

/**
 * @param {DataView} view
 * @param {Uint8Array} bytes
 * @param {number} off
 * @param {number} vtype
 */
function decodeVariant(view, bytes, off, vtype) {
  if (off >= bytes.length) return null;
  switch (vtype) {
    case 0x02: return view.getInt16(off, true);
    case 0x03: return view.getInt32(off, true);
    case 0x04: return view.getFloat32(off, true);
    case 0x05: return view.getFloat64(off, true);
    case 0x0B: return view.getInt16(off, true) !== 0 ? 1 : 0;
    case 0x1E: {
      if (off + 4 > bytes.length) return null;
      const len = view.getUint32(off, true);
      const safeLen = Math.min(len, bytes.length - off - 4);
      const raw = bytes.subarray(off + 4, off + 4 + safeLen);
      return decodeAsciiOrUtf16(raw).replace(/\0+$/, '');
    }
    case 0x1F: {
      if (off + 4 > bytes.length) return null;
      const chars = view.getUint32(off, true);
      const byteLen = Math.min(chars * 2, bytes.length - off - 4);
      const raw = bytes.subarray(off + 4, off + 4 + byteLen);
      return new TextDecoder('utf-16le').decode(raw).replace(/\0+$/, '');
    }
    case 0x40: {
      if (off + 8 > bytes.length) return null;
      const lo = view.getUint32(off, true);
      const hi = view.getUint32(off + 4, true);
      const ns100 = hi * 4_294_967_296 + lo;
      const ms = ns100 / 10_000 - 11_644_473_600_000;
      if (!isFinite(ms) || ms < 0) return null;
      return new Date(ms).toISOString();
    }
    default:
      return null;
  }
}

/**
 * @param {Uint8Array} raw
 */
function decodeAsciiOrUtf16(raw) {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(raw);
  } catch {
    return Array.from(raw, (b) => String.fromCharCode(b)).join('');
  }
}
