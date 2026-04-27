/**
 * shared/inventor/index.js
 *
 * Public entry point for the Inventor file-format parsers.
 *
 * Re-exports all named functions from the per-format modules and provides
 * a `detectFormat()` helper that combines a filename hint with a magic-byte
 * check.
 *
 * Browser-compatible ESM. No Node-specific APIs.
 */

export {
  isCfb,
  parseHeader,
  readDirectory,
  readStream,
  walk,
  readAll,
} from './ole-cfb-reader.js';

export { parseIpj, decodeIpjText } from './ipj-parser.js';
export { parseIam } from './iam-parser.js';
export { parseIpt } from './ipt-parser.js';

import { isCfb } from './ole-cfb-reader.js';

/**
 * @typedef {'ipj'|'iam'|'ipt'|'idw'|'ipn'|'unknown'} InventorFormat
 */

/**
 * Detect the Inventor file format.
 *
 * Strategy:
 *   1. If the filename has a known Inventor extension, prefer that.
 *      The .ipj extension is always XML; .iam, .ipt, .idw, .ipn are CFB.
 *   2. If filename is missing or ambiguous, sniff the buffer:
 *      - UTF-16 LE BOM (FF FE) followed by '<' → ipj
 *      - CFB signature D0CF11E0… → can't distinguish iam/ipt/idw/ipn from
 *        magic bytes alone, but at least we know it's an Inventor binary.
 *
 * @param {ArrayBuffer|Uint8Array|null} buffer
 * @param {string} [filename]
 * @returns {InventorFormat}
 */
export function detectFormat(buffer, filename) {
  if (filename) {
    const m = /\.([a-z0-9]+)$/i.exec(filename);
    if (m) {
      const ext = m[1].toLowerCase();
      if (ext === 'ipj' || ext === 'iam' || ext === 'ipt' || ext === 'idw' || ext === 'ipn') {
        return /** @type {InventorFormat} */ (ext);
      }
    }
  }

  if (!buffer) return 'unknown';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // CFB binary
  if (isCfb(bytes)) {
    // Without the filename we can't tell iam/ipt/idw/ipn apart from header
    // alone — they share the same outer container. Caller should pass a
    // filename when one is available.
    return 'unknown';
  }

  // UTF-16 LE XML (.ipj)
  if (bytes.length >= 4 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    // Look for '<' (0x3C 0x00 in UTF-16 LE) shortly after the BOM.
    for (let i = 2; i < Math.min(bytes.length - 1, 64); i++) {
      if (bytes[i] === 0x3C && bytes[i + 1] === 0x00) return 'ipj';
    }
  }
  // UTF-8 XML (rarely used by Inventor but possible for hand-edited .ipj)
  if (bytes.length >= 5 && bytes[0] === 0x3C && bytes[1] === 0x3F && bytes[2] === 0x78) {
    return 'ipj';
  }

  return 'unknown';
}

/**
 * Convenience: parse an Inventor file by detecting its format.
 *
 * @param {ArrayBuffer|Uint8Array} buffer
 * @param {string} [filename]
 * @param {object} [opts]  forwarded to the underlying parser
 * @returns {Promise<{ format: InventorFormat, result: any }>}
 */
export async function parseInventorFile(buffer, filename, opts) {
  const format = detectFormat(buffer, filename);
  switch (format) {
    case 'ipj': {
      const { parseIpj } = await import('./ipj-parser.js');
      return { format, result: parseIpj(buffer, opts) };
    }
    case 'iam': {
      const { parseIam } = await import('./iam-parser.js');
      return { format, result: parseIam(buffer, { name: filename, ...opts }) };
    }
    case 'ipt': {
      const { parseIpt } = await import('./ipt-parser.js');
      return { format, result: parseIpt(buffer, { name: filename, ...opts }) };
    }
    default:
      return { format: 'unknown', result: null };
  }
}
