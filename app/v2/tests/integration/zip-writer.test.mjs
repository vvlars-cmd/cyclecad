/**
 * tests/integration/zip-writer.test.mjs
 *
 * Tests for the STORE-only ZIP writer used by
 *   POST /api/library/projects/:id/bundle.
 *
 * The writer is private to server/meter/index.js (no module exports),
 * so the relevant helpers are SNAPSHOTTED below. Keep in sync if the
 * originals at the bottom of server/meter/index.js change.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import nodeZlib from 'node:zlib';
import { test, assert, assertEq, summary } from './_runner.mjs';

/* ────────────────────────────────────────────────────────────────────────
   snapshot from server/meter/index.js — keep in sync
   ──────────────────────────────────────────────────────────────────── */

function sanitizeZipName(name) {
  let s = String(name || 'unnamed').replace(/\\/g, '/').replace(/^\/+/, '');
  s = s.replace(/[^\x20-\x7E]/g, '_');
  if (s.length > 200) s = s.slice(0, 200);
  return s || 'unnamed';
}

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return (CRC_TABLE = t);
}

function crc32(buf) {
  if (typeof nodeZlib.crc32 === 'function') {
    return nodeZlib.crc32(buf) >>> 0;
  }
  const t = crcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
  const d = date || new Date();
  const time = ((d.getHours()   & 0x1F) << 11)
             | ((d.getMinutes() & 0x3F) << 5)
             | (Math.floor(d.getSeconds() / 2) & 0x1F);
  const ds   = (((d.getFullYear() - 1980) & 0x7F) << 9)
             | (((d.getMonth()    + 1)    & 0x0F) << 5)
             |  ((d.getDate()              ) & 0x1F);
  return { date: ds & 0xFFFF, time: time & 0xFFFF };
}

function buildZip(entries) {
  const { date: dosDate, time: dosTime } = dosDateTime(new Date());
  const local   = [];
  const central = [];
  let offset = 0;

  for (const f of entries) {
    const name    = sanitizeZipName(f.name);
    const nameBuf = Buffer.from(name, 'ascii');
    const data    = Buffer.isBuffer(f.bytes) ? f.bytes : Buffer.from(f.bytes || []);
    const c       = crc32(data);
    const size    = data.length;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20,         4);
    lfh.writeUInt16LE(0,          6);
    lfh.writeUInt16LE(0,          8);
    lfh.writeUInt16LE(dosTime,   10);
    lfh.writeUInt16LE(dosDate,   12);
    lfh.writeUInt32LE(c,         14);
    lfh.writeUInt32LE(size,      18);
    lfh.writeUInt32LE(size,      22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0,         28);

    local.push({ lfh, nameBuf, data });
    central.push({ nameBuf, crc: c, size, offset });
    offset += lfh.length + nameBuf.length + size;
  }

  const cdrParts = [];
  const cdrStart = offset;
  for (const e of central) {
    const cdr = Buffer.alloc(46);
    cdr.writeUInt32LE(0x02014b50, 0);
    cdr.writeUInt16LE(20,         4);
    cdr.writeUInt16LE(20,         6);
    cdr.writeUInt16LE(0,          8);
    cdr.writeUInt16LE(0,         10);
    cdr.writeUInt16LE(dosTime,   12);
    cdr.writeUInt16LE(dosDate,   14);
    cdr.writeUInt32LE(e.crc,     16);
    cdr.writeUInt32LE(e.size,    20);
    cdr.writeUInt32LE(e.size,    24);
    cdr.writeUInt16LE(e.nameBuf.length, 28);
    cdr.writeUInt16LE(0,         30);
    cdr.writeUInt16LE(0,         32);
    cdr.writeUInt16LE(0,         34);
    cdr.writeUInt16LE(0,         36);
    cdr.writeUInt32LE(0,         38);
    cdr.writeUInt32LE(e.offset,  42);
    cdrParts.push(cdr, e.nameBuf);
    offset += cdr.length + e.nameBuf.length;
  }
  const cdrSize = offset - cdrStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0,          4);
  eocd.writeUInt16LE(0,          6);
  eocd.writeUInt16LE(central.length,  8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdrSize,   12);
  eocd.writeUInt32LE(cdrStart,  16);
  eocd.writeUInt16LE(0,         20);

  const parts = [];
  for (const f of local) parts.push(f.lfh, f.nameBuf, f.data);
  for (const p of cdrParts) parts.push(p);
  parts.push(eocd);
  return Buffer.concat(parts);
}

/* ────────────────────────────────────────────────────────────────────────
   tests
   ──────────────────────────────────────────────────────────────────── */

test('crc32(hello world) returns the well-known value 0x0d4a1185', () => {
  const got = crc32(Buffer.from('hello world'));
  assertEq(got, 0x0d4a1185, 'crc32 mismatch');
});

test('crc32(empty) returns 0', () => {
  assertEq(crc32(Buffer.alloc(0)), 0, 'empty buffer must crc to 0');
});

test('crc32(short string) is deterministic', () => {
  const a = crc32(Buffer.from('abc'));
  const b = crc32(Buffer.from('abc'));
  assertEq(a, b, 'crc32 not deterministic');
  // CRC-32 of "abc" (well-known)
  assertEq(a, 0x352441c2, 'crc32(abc) wrong value');
});

test('dosDateTime returns sane fields for 2026-04-27 12:00:00 UTC', () => {
  const dd = dosDateTime(new Date('2026-04-27T12:00:00Z'));
  assert(typeof dd.date === 'number', 'date is a number');
  assert(typeof dd.time === 'number', 'time is a number');
  assert(dd.date >= 0 && dd.date <= 0xFFFF, 'date in 16-bit range');
  assert(dd.time >= 0 && dd.time <= 0xFFFF, 'time in 16-bit range');
  // year offset must be > 0 for any date after 1980
  const year = (dd.date >> 9) & 0x7F;
  assert(year >= 46, `year offset ${year} should be 46 (2026-1980)`);
});

test('dosDateTime defaults to current Date when no arg', () => {
  const dd = dosDateTime();
  assert(typeof dd.date === 'number', 'date defined');
  assert(typeof dd.time === 'number', 'time defined');
});

test('sanitizeZipName strips leading slash', () => {
  assertEq(sanitizeZipName('/foo/bar'), 'foo/bar');
});

test('sanitizeZipName strips multiple leading slashes', () => {
  assertEq(sanitizeZipName('///foo'), 'foo');
});

test('sanitizeZipName converts backslashes to forward slashes', () => {
  assertEq(sanitizeZipName('a\\b\\c'), 'a/b/c');
});

test('sanitizeZipName truncates to 200 chars', () => {
  const long = 'a'.repeat(300);
  const out = sanitizeZipName(long);
  assertEq(out.length, 200, 'should be capped at 200');
});

test('sanitizeZipName replaces non-ASCII with underscore', () => {
  const out = sanitizeZipName('TrägerHöhe.ipt');
  assertEq(out, 'Tr_gerH_he.ipt');
});

test('sanitizeZipName falls back to "unnamed" on empty input', () => {
  assertEq(sanitizeZipName(''), 'unnamed');
  assertEq(sanitizeZipName(null), 'unnamed');
  assertEq(sanitizeZipName(undefined), 'unnamed');
});

test('buildZip([]) returns a valid empty zip (just EOCD)', () => {
  const zip = buildZip([]);
  assert(Buffer.isBuffer(zip), 'must be Buffer');
  assertEq(zip.length, 22, 'empty zip = 22 bytes (EOCD only)');
  assertEq(zip.readUInt32LE(0), 0x06054b50, 'EOCD signature');
});

test('buildZip single file starts with PK\\x03\\x04 (LFH)', () => {
  const zip = buildZip([{ name: 'a.txt', bytes: Buffer.from('hello') }]);
  assertEq(zip[0], 0x50, 'P');
  assertEq(zip[1], 0x4b, 'K');
  assertEq(zip[2], 0x03, 'LFH byte 3');
  assertEq(zip[3], 0x04, 'LFH byte 4');
});

test('buildZip stores literal "hello" bytes (STORE = no compression)', () => {
  const zip = buildZip([{ name: 'a.txt', bytes: Buffer.from('hello') }]);
  // search for the literal hello payload anywhere in the zip
  const idx = zip.indexOf(Buffer.from('hello'));
  assert(idx > 0, 'literal "hello" payload not found in STORE zip');
});

test('buildZip contains central-directory PK\\x01\\x02 signature', () => {
  const zip = buildZip([{ name: 'a.txt', bytes: Buffer.from('hello') }]);
  const cdrSig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  assert(zip.indexOf(cdrSig) > 0, 'central directory signature missing');
});

test('buildZip ends with EOCD signature PK\\x05\\x06', () => {
  const zip = buildZip([{ name: 'a.txt', bytes: Buffer.from('hello') }]);
  // Walk back 22 bytes from the end (no comment) for EOCD start
  assertEq(zip.readUInt32LE(zip.length - 22), 0x06054b50, 'EOCD signature missing at expected offset');
});

test('buildZip three-file archive: walk central directory, all 3 entries present with correct CRCs', () => {
  const a = { name: 'a.txt', bytes: Buffer.from('alpha') };
  const b = { name: 'sub/b.txt', bytes: Buffer.from('bravo!') };
  const c = { name: 'sub/c.bin', bytes: Buffer.from([0, 1, 2, 3, 4, 5]) };
  const zip = buildZip([a, b, c]);

  // Read EOCD record (22 bytes at end, no comment)
  const eocdOffset = zip.length - 22;
  assertEq(zip.readUInt32LE(eocdOffset), 0x06054b50, 'EOCD sig');
  const totalEntries = zip.readUInt16LE(eocdOffset + 10);
  const cdrSize = zip.readUInt32LE(eocdOffset + 12);
  const cdrOff  = zip.readUInt32LE(eocdOffset + 16);
  assertEq(totalEntries, 3, 'three entries in central directory');
  assert(cdrSize > 0,  'cdr size > 0');
  assert(cdrOff  > 0,  'cdr offset > 0');

  // Walk central directory
  const expected = [a, b, c];
  let cur = cdrOff;
  for (let i = 0; i < totalEntries; i++) {
    assertEq(zip.readUInt32LE(cur), 0x02014b50, `cdr[${i}] signature`);
    const crcRead   = zip.readUInt32LE(cur + 16);
    const sizeRead  = zip.readUInt32LE(cur + 20);
    const nameLen   = zip.readUInt16LE(cur + 28);
    const extraLen  = zip.readUInt16LE(cur + 30);
    const cmtLen    = zip.readUInt16LE(cur + 32);
    const name      = zip.slice(cur + 46, cur + 46 + nameLen).toString('ascii');
    const expBytes  = Buffer.isBuffer(expected[i].bytes) ? expected[i].bytes : Buffer.from(expected[i].bytes);
    assertEq(name, sanitizeZipName(expected[i].name), `cdr[${i}] name`);
    assertEq(sizeRead, expBytes.length, `cdr[${i}] size`);
    assertEq(crcRead, crc32(expBytes), `cdr[${i}] crc`);
    cur += 46 + nameLen + extraLen + cmtLen;
  }
});

test('buildZip + unzip -p round-trip recovers exact bytes (skips if unzip missing)', async () => {
  const probe = spawnSync('unzip', ['-v'], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) {
    console.warn('  ! skipped: `unzip` binary not available on PATH');
    return;
  }
  const zip = buildZip([{ name: 'greeting.txt', bytes: Buffer.from('hello') }]);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-writer-'));
  const zipPath = path.join(tmp, 'out.zip');
  try {
    await fs.writeFile(zipPath, zip);
    const r = spawnSync('unzip', ['-p', zipPath, 'greeting.txt'], { encoding: 'utf8' });
    assertEq(r.status, 0, `unzip exited ${r.status}: ${r.stderr}`);
    assertEq(r.stdout, 'hello', 'unzip -p output mismatch');
  } finally {
    try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
  }
});

await summary();
