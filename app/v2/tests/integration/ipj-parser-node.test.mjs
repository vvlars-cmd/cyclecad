/**
 * tests/integration/ipj-parser-node.test.mjs
 *
 * Tests for shared/inventor/ipj-parser-node.mjs — the Node-compatible IPJ
 * parser. The browser variant in `shared/inventor/ipj-parser.js` uses
 * DOMParser and is skipped in the inventor-parsers suite; this file
 * exercises the regex-based replacement.
 *
 * The DUO `.ipj` is the canonical regression fixture. When it's missing
 * (CI), DUO-dependent tests are skipped with a console.warn — same
 * pattern used in walker.test.mjs.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const PARSER_PATH = path.join(REPO_ROOT, 'shared', 'inventor', 'ipj-parser-node.mjs');
const DUO_IPJ = path.join(REPO_ROOT, 'DUO', 'D-ZBG-DUO-Anlage.ipj');

const mod = await import(pathToFileURL(PARSER_PATH).href);
const { parseIpj, parseIpjFromFile, detectEncoding, KNOWN_VENDORS } = mod;

let DUO_AVAILABLE = true;
try {
  const stat = await fs.stat(DUO_IPJ);
  if (!stat.isFile()) DUO_AVAILABLE = false;
} catch (_) { DUO_AVAILABLE = false; }

if (!DUO_AVAILABLE) {
  console.warn(`ipj-parser-node.test.mjs: ${DUO_IPJ} missing — DUO-dependent tests will be skipped.`);
}

/* ───────────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────────── */

/**
 * Encode a UTF-8 string as UTF-16-LE with a BOM, mirroring how Inventor
 * actually writes `.ipj` files. Used by the `handles missing project
 * name` test below.
 *
 * @param {string} s
 * @returns {Buffer}
 */
function utf16leWithBom(s) {
  const inner = Buffer.from(s, 'utf16le');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), inner]);
}

/* ───────────────────────────────────────────────────────────────────────
   Tests
   ─────────────────────────────────────────────────────────────────── */

if (DUO_AVAILABLE) {
  test('parses DUO .ipj without throwing', async () => {
    const result = await parseIpjFromFile(DUO_IPJ);
    assert(result && typeof result === 'object', 'result must be an object');
    assert(typeof result.name === 'string', 'result.name must be a string');
  });

  test('extracts project name from DUO .ipj', async () => {
    const result = await parseIpjFromFile(DUO_IPJ);
    // The DUO .ipj has no <ProjectName> tag; the parser falls back to
    // deriving the name from the filename.
    assertEq(result.name, 'D-ZBG-DUO-Anlage');
  });

  test('detects UTF-16-LE encoding on DUO .ipj', async () => {
    const buf = await fs.readFile(DUO_IPJ);
    assertEq(detectEncoding(buf), 'utf-16le');
  });

  test('classifies content-center library on DUO .ipj', async () => {
    const result = await parseIpjFromFile(DUO_IPJ);
    const cc = result.libraryPaths.find(l => l.kind === 'content-center');
    assert(cc, 'expected at least one content-center library');
    assert(
      cc.path.toLowerCase().includes('content center'),
      `content-center path looks wrong: ${cc.path}`,
    );
  });

  test('returns at least 1 library path from DUO .ipj', async () => {
    const result = await parseIpjFromFile(DUO_IPJ);
    assert(Array.isArray(result.libraryPaths), 'libraryPaths must be array');
    assert(
      result.libraryPaths.length >= 1,
      `expected ≥1 library path, got ${result.libraryPaths.length}`,
    );
  });

  test('extracts schema version from DUO .ipj', async () => {
    const result = await parseIpjFromFile(DUO_IPJ);
    assertEq(result.version, '14');
  });

  test('extracts workspace path from DUO .ipj', async () => {
    const result = await parseIpjFromFile(DUO_IPJ);
    assert(
      result.workspacePath.toLowerCase().includes('arbeitsbereich'),
      `expected workspacePath to contain "Arbeitsbereich", got ${result.workspacePath}`,
    );
  });
} else {
  test('SKIP DUO ipj parser tests — DUO sample not available', () => {
    console.warn('  ↳ skipped: DUO/D-ZBG-DUO-Anlage.ipj not present');
  });
}

test('detectEncoding picks utf-8 for plain ASCII XML', () => {
  const buf = Buffer.from('<InventorProject></InventorProject>', 'utf8');
  assertEq(detectEncoding(buf), 'utf-8');
});

test('detectEncoding picks utf-16le for BOM-prefixed buffer', () => {
  const buf = utf16leWithBom('<InventorProject></InventorProject>');
  assertEq(detectEncoding(buf), 'utf-16le');
});

test('handles missing project name gracefully', () => {
  // No filename hint, no <ProjectName>, no <DisplayName>, no <Name>.
  const xml = '<?xml version="1.0"?><InventorProject schemarevid="14"></InventorProject>';
  const buf = utf16leWithBom(xml);
  const r = parseIpj(buf);
  assertEq(r.name, '', 'name should be empty when nothing identifies the project');
  assert(
    r.warnings.some(w => /project name/i.test(w)),
    'expected a warning about the missing project name',
  );
  assertEq(r.version, '14');
});

test('falls back to filename when project name is absent', () => {
  const xml = '<?xml version="1.0"?><InventorProject schemarevid="14"></InventorProject>';
  const buf = utf16leWithBom(xml);
  const r = parseIpj(buf, { filename: 'My-Project.ipj' });
  assertEq(r.name, 'My-Project');
});

test('handles malformed XML without throwing', () => {
  // Truncated mid-element. Should NOT throw — just degrade gracefully.
  const xml = '<InventorProject schemarevid="9"><ProjectPaths><ProjectPath pathtype="Workspace"><Path>.\\Bogus</Pa';
  const buf = Buffer.from(xml, 'utf8');
  let r;
  try { r = parseIpj(buf, { filename: 'Bogus.ipj' }); }
  catch (err) { throw new Error(`parseIpj threw on malformed XML: ${err.message}`); }
  assert(r && typeof r === 'object', 'result must exist');
  assertEq(r.name, 'Bogus');
  assertEq(r.version, '9');
  // workspacePath couldn't be closed → empty.
  assertEq(r.workspacePath, '');
});

test('detects vendor library by name', () => {
  // Synthetic .ipj with one explicit LibraryPath whose name matches a known vendor.
  const xml = [
    '<?xml version="1.0"?>',
    '<InventorProject schemarevid="14">',
    '  <LibraryPaths>',
    '    <LibraryPath>',
    '      <PathName>igus Components</PathName>',
    '      <Path>.\\Libraries\\igus</Path>',
    '    </LibraryPath>',
    '    <LibraryPath>',
    '      <PathName>DIN Standards</PathName>',
    '      <Path>.\\Libraries\\DIN</Path>',
    '    </LibraryPath>',
    '  </LibraryPaths>',
    '</InventorProject>',
  ].join('\n');
  const buf = utf16leWithBom(xml);
  const r = parseIpj(buf, { filename: 'synthetic.ipj' });
  const igus = r.libraryPaths.find(l => l.name === 'igus Components');
  assert(igus, 'expected to find the igus library');
  assertEq(igus.kind, 'vendor');
  const din = r.libraryPaths.find(l => l.name === 'DIN Standards');
  assert(din, 'expected to find the DIN library');
  assertEq(din.kind, 'standard');
});

test('KNOWN_VENDORS exports a non-empty frozen list', () => {
  assert(Array.isArray(KNOWN_VENDORS), 'KNOWN_VENDORS must be an array');
  assert(KNOWN_VENDORS.length >= 5, 'expected at least 5 known vendors');
  assert(KNOWN_VENDORS.includes('igus'), 'igus must be in the list');
  assert(KNOWN_VENDORS.includes('mink'), 'mink must be in the list');
  assert(Object.isFrozen(KNOWN_VENDORS), 'KNOWN_VENDORS must be frozen');
});

await summary();
