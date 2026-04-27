/**
 * tests/integration/inventor-parsers.test.mjs
 *
 * Tests for shared/inventor/* — Node-compatible parts only. The .ipj parser
 * uses DOMParser (browser-only) and is skipped here with a console.info.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const INVENTOR_INDEX = path.join(REPO_ROOT, 'shared', 'inventor', 'index.js');

const inventor = await import(pathToFileURL(INVENTOR_INDEX).href);
const { detectFormat, isCfb, parseHeader, readDirectory, walk, parseIam } = inventor;

const SAMPLE_IAM = path.join(
  REPO_ROOT,
  'DUO',
  'Workspaces',
  'Arbeitsbereich',
  'Zusatzoptionen',
  'DUOdurch',
  'D-ZBG-DUO-Anlage.iam',
);

let SAMPLE_AVAILABLE = true;
try {
  const stat = await fs.stat(SAMPLE_IAM);
  if (!stat.isFile()) SAMPLE_AVAILABLE = false;
} catch (_) { SAMPLE_AVAILABLE = false; }

if (!SAMPLE_AVAILABLE) {
  console.warn(`inventor-parsers.test.mjs: ${SAMPLE_IAM} missing — DUO-dependent tests will be skipped.`);
}

/* ────────────────────────────────────────────────────────────────────── */

test('detectFormat by extension: .ipj', () => {
  assertEq(detectFormat(null, 'D-ZBG-DUO-Anlage.ipj'), 'ipj');
});

test('detectFormat by extension: .iam', () => {
  assertEq(detectFormat(null, 'foo.iam'), 'iam');
});

test('detectFormat by extension: .ipt', () => {
  assertEq(detectFormat(null, 'foo.ipt'), 'ipt');
});

test('detectFormat by extension: .idw / .ipn', () => {
  assertEq(detectFormat(null, 'x.idw'), 'idw');
  assertEq(detectFormat(null, 'x.ipn'), 'ipn');
});

test('detectFormat returns "unknown" for non-Inventor extension', () => {
  assertEq(detectFormat(null, 'README.md'), 'unknown');
});

test('detectFormat from CFB header (no filename) returns "unknown"', () => {
  // Per detectFormat: CFB header is recognized as Inventor binary but the
  // outer container is shared — caller must disambiguate by filename. The
  // function explicitly returns 'unknown' in that case.
  const cfb = new Uint8Array(16);
  cfb.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 0);
  assertEq(detectFormat(cfb), 'unknown');
});

test('isCfb recognises CFB magic bytes', () => {
  const cfb = new Uint8Array(16);
  cfb.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 0);
  assertEq(isCfb(cfb), true);
  assertEq(isCfb(new Uint8Array([0, 0, 0, 0])), false);
});

if (SAMPLE_AVAILABLE) {
  test('ole-cfb-reader parses the DUO .iam without throwing', async () => {
    const buf = await fs.readFile(SAMPLE_IAM);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    assert(isCfb(u8), 'sample .iam must be CFB');
    let header;
    try { header = parseHeader(u8); }
    catch (err) { throw new Error(`parseHeader threw: ${err.message}`); }
    assert(header && typeof header.sectorSize === 'number', 'header must have sectorSize');
  });

  test('ole-cfb-reader returns at least 5 directory entries', async () => {
    const buf = await fs.readFile(SAMPLE_IAM);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const entries = walk(u8);
    assert(Array.isArray(entries), 'walk must return array');
    assert(entries.length >= 5, `expected ≥5 directory entries, got ${entries.length}`);
  });

  test('iam-parser: parseIam returns name, properties, occurrences', async () => {
    const buf = await fs.readFile(SAMPLE_IAM);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const result = parseIam(u8, { name: 'D-ZBG-DUO-Anlage' });
    assert(result, 'parseIam result required');
    assert('name' in result, 'result.name required');
    assert('properties' in result, 'result.properties required');
    assert('occurrences' in result, 'result.occurrences required');
    assert(Array.isArray(result.occurrences), 'occurrences must be array');
    assertEq(result.kind, 'assembly');
  });

  test('iam-parser: raw.streams array surfaces ≥5 streams', async () => {
    const buf = await fs.readFile(SAMPLE_IAM);
    const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const result = parseIam(u8, { name: 'D-ZBG-DUO-Anlage' });
    assert(result.raw && Array.isArray(result.raw.streams), 'raw.streams required');
    assert(result.raw.streams.length >= 5, `expected ≥5 streams, got ${result.raw.streams.length}`);
  });
} else {
  test('SKIP iam tests — DUO sample not available', () => {
    console.warn('  ↳ skipped: DUO/.../D-ZBG-DUO-Anlage.iam not present');
  });
}

test('parseIam returns an empty result for non-CFB input', () => {
  const r = parseIam(new Uint8Array([0, 1, 2, 3]), { name: 'bogus' });
  assertEq(r.kind, 'assembly');
  assertEq(r.occurrences.length, 0);
  assert(Array.isArray(r.warnings) && r.warnings.length > 0);
});

test('ipj-parser: SKIPPED — uses DOMParser (browser-only)', () => {
  console.info('  ↳ skipped — browser-only (parseIpj uses DOMParser)');
});

await summary();
