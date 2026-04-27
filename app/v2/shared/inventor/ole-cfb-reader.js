/**
 * ole-cfb-reader.js
 *
 * Minimal pure-JS Microsoft Compound File Binary (CFB / OLE2) reader.
 * Sufficient for Inventor `.iam` / `.ipt` files. Browser-compatible ESM —
 * no Node-specific APIs. Numbers are little-endian per [MS-CFB].
 *
 * Reference: ECMA-376 Part 4 (Office Open XML) Annex B / MS-CFB.
 *
 * The CFB layout (in short):
 *   - 512-byte header at offset 0 (signature D0CF11E0 A1B11AE1)
 *   - sectors of `sectorSize` bytes (usually 512 for v3, 4096 for v4)
 *   - FAT (file allocation table): array of next-sector indices
 *   - DIFAT (double-indirect FAT): table that locates FAT sectors
 *   - Mini-FAT + mini-stream: small streams (< miniStreamCutoff, usually 4096)
 *     stored inside the root entry's stream chain in 64-byte chunks
 *   - Directory: array of 128-byte entries, walked as a red-black tree
 *
 * Exports named functions, no default export.
 */

/* eslint-disable no-bitwise */

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// Sector chain sentinels
const FREESECT = 0xFFFFFFFF;
const ENDOFCHAIN = 0xFFFFFFFE;
const FATSECT = 0xFFFFFFFD;
const DIFSECT = 0xFFFFFFFC;

/**
 * Verify the 8-byte CFB signature.
 *
 * @param {Uint8Array} buffer
 * @returns {boolean}
 */
export function isCfb(buffer) {
  if (!buffer || buffer.length < 8) return false;
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== CFB_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Parse the 512-byte CFB header.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{
 *   buffer: Uint8Array,
 *   view: DataView,
 *   majorVersion: number,
 *   minorVersion: number,
 *   sectorSize: number,
 *   miniSectorSize: number,
 *   numDirSectors: number,
 *   numFatSectors: number,
 *   firstDirSectorLoc: number,
 *   miniStreamCutoff: number,
 *   firstMiniFatSectorLoc: number,
 *   numMiniFatSectors: number,
 *   firstDifatSectorLoc: number,
 *   numDifatSectors: number,
 *   difat: number[],
 *   fat: number[],
 *   miniFat: number[]
 * }}
 */
export function parseHeader(input) {
  const buffer = input instanceof Uint8Array
    ? input
    : new Uint8Array(input);
  if (!isCfb(buffer)) {
    throw new Error('ole-cfb-reader: not a CFB file (bad signature)');
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const minorVersion   = view.getUint16(0x18, true);
  const majorVersion   = view.getUint16(0x1A, true);
  const byteOrder      = view.getUint16(0x1C, true); // expect 0xFFFE (LE)
  const sectorShift    = view.getUint16(0x1E, true); // 9 (v3) or 0xC (v4)
  const miniSectorShift = view.getUint16(0x20, true); // typically 6 -> 64
  const numDirSectors  = view.getUint32(0x28, true);
  const numFatSectors  = view.getUint32(0x2C, true);
  const firstDirSectorLoc   = view.getUint32(0x30, true);
  const miniStreamCutoff    = view.getUint32(0x38, true);
  const firstMiniFatSectorLoc = view.getUint32(0x3C, true);
  const numMiniFatSectors   = view.getUint32(0x40, true);
  const firstDifatSectorLoc = view.getUint32(0x44, true);
  const numDifatSectors     = view.getUint32(0x48, true);

  if (byteOrder !== 0xFFFE) {
    throw new Error(`ole-cfb-reader: unexpected byte order 0x${byteOrder.toString(16)}`);
  }

  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;

  // 109 entries of the DIFAT live in the header at offset 0x4C
  const difat = new Array(109);
  for (let i = 0; i < 109; i++) {
    difat[i] = view.getUint32(0x4C + i * 4, true);
  }

  const header = {
    buffer,
    view,
    majorVersion,
    minorVersion,
    sectorSize,
    miniSectorSize,
    numDirSectors,
    numFatSectors,
    firstDirSectorLoc,
    miniStreamCutoff,
    firstMiniFatSectorLoc,
    numMiniFatSectors,
    firstDifatSectorLoc,
    numDifatSectors,
    difat,
    fat: [],
    miniFat: [],
  };

  // Follow DIFAT chain (sectors holding more FAT-sector pointers)
  let difatSect = firstDifatSectorLoc;
  let guard = 0;
  while (difatSect !== ENDOFCHAIN && difatSect !== FREESECT && guard < 1_000_000) {
    const off = sectorOffset(header, difatSect);
    const entries = (sectorSize / 4) - 1; // last 4 bytes is the next-DIFAT pointer
    for (let i = 0; i < entries; i++) {
      const v = view.getUint32(off + i * 4, true);
      if (v !== FREESECT) header.difat.push(v);
    }
    difatSect = view.getUint32(off + entries * 4, true);
    guard++;
  }

  // Filter the 109 inline DIFAT entries — only ones up to numFatSectors are valid
  const allDifat = [];
  for (let i = 0; i < 109; i++) {
    if (difat[i] !== FREESECT) allDifat.push(difat[i]);
  }
  for (const e of header.difat) allDifat.push(e);
  header.difat = allDifat;

  // Build the FAT by reading each FAT sector
  const fat = [];
  for (const sect of header.difat) {
    if (sect === FREESECT || sect === ENDOFCHAIN) continue;
    const off = sectorOffset(header, sect);
    if (off + sectorSize > buffer.byteLength) continue;
    for (let i = 0; i < sectorSize / 4; i++) {
      fat.push(view.getUint32(off + i * 4, true));
    }
  }
  header.fat = fat;

  // Build the mini-FAT by walking its sector chain in the regular FAT
  const miniFat = [];
  let mfSect = firstMiniFatSectorLoc;
  guard = 0;
  while (mfSect !== ENDOFCHAIN && mfSect !== FREESECT && guard < 1_000_000) {
    const off = sectorOffset(header, mfSect);
    if (off + sectorSize > buffer.byteLength) break;
    for (let i = 0; i < sectorSize / 4; i++) {
      miniFat.push(view.getUint32(off + i * 4, true));
    }
    mfSect = nextSector(header, mfSect);
    guard++;
  }
  header.miniFat = miniFat;

  return header;
}

/**
 * Byte offset of a normal sector within the buffer.
 * Sector N (0-indexed) starts at header (512 bytes) + N * sectorSize.
 *
 * @param {ReturnType<typeof parseHeader>} header
 * @param {number} sectorIndex
 */
function sectorOffset(header, sectorIndex) {
  return 512 + sectorIndex * header.sectorSize;
}

/**
 * Get the next sector index in a FAT chain.
 *
 * @param {ReturnType<typeof parseHeader>} header
 * @param {number} sectorIndex
 */
function nextSector(header, sectorIndex) {
  if (sectorIndex < 0 || sectorIndex >= header.fat.length) return ENDOFCHAIN;
  return header.fat[sectorIndex];
}

/**
 * Read a chain of full sectors starting at startSector for `size` bytes.
 *
 * @param {ReturnType<typeof parseHeader>} header
 * @param {number} startSector
 * @param {number} size
 * @returns {Uint8Array}
 */
function readSectorChain(header, startSector, size) {
  const out = new Uint8Array(size);
  let written = 0;
  let sect = startSector;
  let guard = 0;
  while (sect !== ENDOFCHAIN && sect !== FREESECT && written < size && guard < 10_000_000) {
    const off = sectorOffset(header, sect);
    const remaining = size - written;
    const take = Math.min(header.sectorSize, remaining);
    if (off + take <= header.buffer.byteLength) {
      out.set(header.buffer.subarray(off, off + take), written);
    }
    written += take;
    sect = nextSector(header, sect);
    guard++;
  }
  return out;
}

/**
 * Read the entire mini-stream (referenced by the root entry).
 * Cached on the header to avoid re-reading on each small-stream lookup.
 *
 * @param {ReturnType<typeof parseHeader>} header
 * @param {number} rootStart
 * @param {number} rootSize
 */
function readMiniStream(header, rootStart, rootSize) {
  if (header._miniStream) return header._miniStream;
  header._miniStream = readSectorChain(header, rootStart, rootSize);
  return header._miniStream;
}

/**
 * Read a chain of mini-sectors out of the mini-stream.
 *
 * @param {ReturnType<typeof parseHeader>} header
 * @param {Uint8Array} miniStream
 * @param {number} startMiniSector
 * @param {number} size
 */
function readMiniSectorChain(header, miniStream, startMiniSector, size) {
  const out = new Uint8Array(size);
  let written = 0;
  let sect = startMiniSector;
  let guard = 0;
  while (sect !== ENDOFCHAIN && sect !== FREESECT && written < size && guard < 10_000_000) {
    const off = sect * header.miniSectorSize;
    const take = Math.min(header.miniSectorSize, size - written);
    if (off + take <= miniStream.byteLength) {
      out.set(miniStream.subarray(off, off + take), written);
    }
    written += take;
    sect = sect < header.miniFat.length ? header.miniFat[sect] : ENDOFCHAIN;
    guard++;
  }
  return out;
}

/**
 * Decode a directory entry name (UTF-16LE, NUL-terminated, max 64 bytes).
 *
 * @param {DataView} view
 * @param {number} offset
 * @param {number} nameLen  declared length in bytes (incl. NUL)
 */
function readEntryName(view, offset, nameLen) {
  // nameLen is in bytes including the trailing NUL pair; clamp defensively
  const safeLen = Math.max(0, Math.min(64, nameLen));
  if (safeLen === 0) return '';
  const u16Count = (safeLen / 2) | 0;
  let s = '';
  for (let i = 0; i < u16Count; i++) {
    const c = view.getUint16(offset + i * 2, true);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

const ENTRY_TYPE = {
  0x00: 'unknown',
  0x01: 'storage',
  0x02: 'stream',
  0x05: 'root',
};

/**
 * Read the directory.
 *
 * @param {Uint8Array|ArrayBuffer} _buffer  reserved for API symmetry; uses header.buffer
 * @param {ReturnType<typeof parseHeader>} header
 * @returns {Array<{
 *   index: number,
 *   name: string,
 *   type: 'storage'|'stream'|'root'|'unknown',
 *   colour: 'red'|'black',
 *   leftSibling: number,
 *   rightSibling: number,
 *   child: number,
 *   startSector: number,
 *   size: number
 * }>}
 */
export function readDirectory(_buffer, header) {
  // Walk the directory sector chain to read all 128-byte entries.
  // Total dir size = numDirSectors * sectorSize, but for v3 numDirSectors is
  // often 0; in that case follow the chain until end.
  const entries = [];
  let sect = header.firstDirSectorLoc;
  let guard = 0;
  const view = header.view;
  while (sect !== ENDOFCHAIN && sect !== FREESECT && guard < 1_000_000) {
    const off = sectorOffset(header, sect);
    const perSector = (header.sectorSize / 128) | 0;
    for (let i = 0; i < perSector; i++) {
      const eOff = off + i * 128;
      if (eOff + 128 > header.buffer.byteLength) break;
      const nameLen = view.getUint16(eOff + 0x40, true);
      const typeId = view.getUint8(eOff + 0x42);
      const colour = view.getUint8(eOff + 0x43);
      const leftSibling = view.getUint32(eOff + 0x44, true);
      const rightSibling = view.getUint32(eOff + 0x48, true);
      const child = view.getUint32(eOff + 0x4C, true);
      const startSector = view.getUint32(eOff + 0x74, true);
      // Size is 64-bit; for v3 only low 32 bits are meaningful.
      const sizeLo = view.getUint32(eOff + 0x78, true);
      const sizeHi = view.getUint32(eOff + 0x7C, true);
      const size = sizeHi === 0 ? sizeLo : sizeHi * 2 ** 32 + sizeLo;
      const name = readEntryName(view, eOff, nameLen);

      entries.push({
        index: entries.length,
        name,
        type: ENTRY_TYPE[typeId] || 'unknown',
        colour: colour === 0 ? 'red' : 'black',
        leftSibling,
        rightSibling,
        child,
        startSector,
        size,
      });
    }
    sect = nextSector(header, sect);
    guard++;
  }
  return entries;
}

/**
 * Read a stream's content by directory entry.
 *
 * Streams smaller than `miniStreamCutoff` (usually 4096) live in the
 * mini-stream; larger ones use the regular FAT chain.
 *
 * @param {Uint8Array|ArrayBuffer} _buffer  reserved; uses header.buffer
 * @param {ReturnType<typeof parseHeader>} header
 * @param {{startSector: number, size: number, type: string}} entry
 * @returns {Uint8Array}
 */
export function readStream(_buffer, header, entry) {
  if (!entry) return new Uint8Array(0);
  if (entry.size === 0) return new Uint8Array(0);

  if (entry.size < header.miniStreamCutoff && entry.type !== 'root') {
    // Need the root entry to find the mini-stream
    // (the root-entry's startSector is the start of the mini-stream chain in the regular FAT)
    if (!header._rootEntry) {
      const dir = readDirectory(null, header);
      header._rootEntry = dir.find((e) => e.type === 'root') || dir[0];
    }
    const root = header._rootEntry;
    const miniStream = readMiniStream(header, root.startSector, root.size);
    return readMiniSectorChain(header, miniStream, entry.startSector, entry.size);
  }

  return readSectorChain(header, entry.startSector, entry.size);
}

/**
 * Walk the storage tree, yielding each entry with its full path.
 *
 * The CFB directory is stored as a red-black tree where each storage's
 * `child` points to the root of its child tree, and within each tree the
 * left/right siblings form an in-order traversal.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {Array<{path: string, name: string, type: string, size: number, entry: object}>}
 */
export function walk(input) {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const header = parseHeader(buffer);
  const dir = readDirectory(buffer, header);
  const out = [];

  if (dir.length === 0) return out;
  const root = dir[0]; // by spec, entry 0 is the root
  out.push({ path: '/', name: root.name, type: root.type, size: root.size, entry: root });

  /**
   * Walk the red-black tree of siblings (in-order) under a storage.
   */
  function walkSiblings(idx, prefix, visited) {
    if (idx === FREESECT || idx === ENDOFCHAIN || idx >= dir.length) return;
    if (visited.has(idx)) return; // defend against malformed cycles
    visited.add(idx);
    const e = dir[idx];
    walkSiblings(e.leftSibling, prefix, visited);
    const path = prefix === '/' ? `/${e.name}` : `${prefix}/${e.name}`;
    out.push({ path, name: e.name, type: e.type, size: e.size, entry: e });
    if (e.type === 'storage' && e.child !== FREESECT) {
      const childVisited = new Set();
      walkSiblings(e.child, path, childVisited);
    }
    walkSiblings(e.rightSibling, prefix, visited);
  }

  if (root.child !== FREESECT) {
    walkSiblings(root.child, '/', new Set());
  }
  return out;
}

/**
 * Convenience: index every stream by name and full path.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {{
 *   header: ReturnType<typeof parseHeader>,
 *   directory: ReturnType<typeof readDirectory>,
 *   entries: ReturnType<typeof walk>,
 *   byName: Map<string, object>,
 *   byPath: Map<string, object>
 * }}
 */
export function readAll(input) {
  const buffer = input instanceof Uint8Array ? input : new Uint8Array(input);
  const header = parseHeader(buffer);
  const directory = readDirectory(buffer, header);
  const entries = walk(buffer);
  const byName = new Map();
  const byPath = new Map();
  for (const e of entries) {
    byPath.set(e.path, e);
    // last-write-wins is fine — Inventor stream names are usually unique
    byName.set(e.name, e);
  }
  return { header, directory, entries, byName, byPath };
}
