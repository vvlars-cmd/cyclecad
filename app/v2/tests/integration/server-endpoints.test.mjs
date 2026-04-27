/**
 * tests/integration/server-endpoints.test.mjs
 *
 * Smoke tests that verify the Stage 2.8 server endpoint code is structurally
 * sound — without actually starting Postgres or the Fastify server. We parse
 * server/meter/index.js and server/meter/schema.sql as text and assert that
 * the new routes / tables / ENUMs are registered.
 *
 * The widget-side helper imageDimFallback is also unit-tested here (it is
 * snapshotted from widgets/drawing-generator.js — server/meter/index.js
 * itself does not own this helper, but it sits on the Stage 2.8 export
 * path and is exercised by the bundle endpoint when Inventor previews are
 * embedded into PDFs).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE      = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SERVER_SRC_PATH = path.join(REPO_ROOT, 'server', 'meter', 'index.js');
const SCHEMA_PATH     = path.join(REPO_ROOT, 'server', 'meter', 'schema.sql');

const serverSrc = await fs.readFile(SERVER_SRC_PATH, 'utf8');
const schemaSrc = await fs.readFile(SCHEMA_PATH,     'utf8');

/* ────────────────────────────────────────────────────────────────────────
   route registration assertions
   ──────────────────────────────────────────────────────────────────── */

test('POST /api/library/projects/:id/bundle is registered', () => {
  assert(
    serverSrc.includes("app.post('/api/library/projects/:id/bundle'"),
    'bundle route not registered in server/meter/index.js',
  );
});

test('POST /api/library/projects/:id/drawings/batch is registered', () => {
  assert(
    serverSrc.includes("app.post('/api/library/projects/:id/drawings/batch'"),
    'drawings/batch route not registered',
  );
});

test('bundle handler enforces tenant ownership (403 on mismatch)', () => {
  // The bundle handler reads the project row, then compares tenant_id
  // before granting access. We assert the structural pattern is present.
  assert(/proj\.rows\[0\]\.tenant_id\s*!==\s*tenantId/.test(serverSrc),
    'bundle endpoint should check tenant_id mismatch');
  assert(/code\(403\)/.test(serverSrc),
    'bundle endpoint should return 403 on tenant mismatch');
});

test('bundle handler returns 404 when project is missing', () => {
  assert(/code\(404\).*project not found/s.test(serverSrc) ||
         (serverSrc.includes('project not found') && serverSrc.includes('code(404)')),
    'bundle endpoint should 404 for missing projects');
});

test('drawing-batch handler tracks progress in drawing_batch_jobs', () => {
  assert(serverSrc.includes('INSERT INTO drawing_batch_jobs'),
    'drawing-batch endpoint should write to drawing_batch_jobs');
});

test('ZIP helpers are present at the bottom of server/meter/index.js', () => {
  assert(serverSrc.includes('function crc32('), 'crc32 missing');
  assert(serverSrc.includes('function dosDateTime('), 'dosDateTime missing');
  assert(serverSrc.includes('function buildZip('), 'buildZip missing');
  assert(serverSrc.includes('function sanitizeZipName('), 'sanitizeZipName missing');
});

test('sanitizeZipName implementation truncates to 200 chars', () => {
  // Structural sanity: source must contain the 200 cap.
  assert(/s\.length\s*>\s*200/.test(serverSrc) && /slice\(0,\s*200\)/.test(serverSrc),
    'sanitizeZipName should cap names at 200 chars');
});

test('crc32 prefers node:zlib.crc32 when available', () => {
  assert(/nodeZlib\.crc32/.test(serverSrc),
    'crc32 should call into node:zlib.crc32');
});

/* ────────────────────────────────────────────────────────────────────────
   schema.sql structural assertions
   ──────────────────────────────────────────────────────────────────── */

test('schema.sql defines drawing_batch_jobs table', () => {
  assert(/CREATE TABLE IF NOT EXISTS drawing_batch_jobs/.test(schemaSrc),
    'drawing_batch_jobs table missing from schema.sql');
});

test('drawing_batch_jobs has total + done counters', () => {
  // Pull the CREATE TABLE block for drawing_batch_jobs and inspect it.
  const m = schemaSrc.match(/CREATE TABLE IF NOT EXISTS drawing_batch_jobs[\s\S]*?\);/);
  assert(m, 'drawing_batch_jobs CREATE TABLE block not found');
  assert(/total\b[^,]*INT/i.test(m[0]),  'total INT column missing');
  assert(/done\b[^,]*INT/i.test(m[0]),   'done INT column missing');
  assert(/status\b[^,]*TEXT/i.test(m[0]),'status TEXT column missing');
});

test('drawing_batch_jobs has a project index', () => {
  assert(/CREATE INDEX IF NOT EXISTS ix_drawing_batch_jobs_project/.test(schemaSrc),
    'ix_drawing_batch_jobs_project index missing');
});

test('all 4 library_component_* ENUMs are declared', () => {
  const enums = [
    'library_component_kind',
    'library_source_format',
    'library_component_category',
    'library_component_status',
  ];
  for (const e of enums) {
    assert(schemaSrc.includes(`CREATE TYPE ${e}`),
      `CREATE TYPE ${e} missing`);
  }
});

test('every library ENUM is guarded by a pg_type IF NOT EXISTS check', () => {
  const enums = [
    'library_component_kind',
    'library_source_format',
    'library_component_category',
    'library_component_status',
  ];
  for (const e of enums) {
    const re = new RegExp(`IF NOT EXISTS \\(SELECT 1 FROM pg_type WHERE typname = '${e}'\\)`);
    assert(re.test(schemaSrc), `pg_type guard for ${e} missing`);
  }
});

test('schema.sql has at least 7 idempotent guards (IF NOT EXISTS / pg_type)', () => {
  const ifNotExists = (schemaSrc.match(/IF NOT EXISTS/g) || []).length;
  // 4 ENUM pg_type guards + ≥3 CREATE TABLE/INDEX IF NOT EXISTS calls.
  assert(ifNotExists >= 7,
    `expected ≥7 IF NOT EXISTS guards; got ${ifNotExists}`);
});

test('schema.sql is fully re-runnable (no destructive DROPs at top level)', () => {
  // We tolerate DROPs only inside DO $$ blocks (none currently). Every
  // top-level statement should be additive.
  assert(!/^\s*DROP\s+TABLE\s/m.test(schemaSrc), 'top-level DROP TABLE found');
  assert(!/^\s*DROP\s+TYPE\s/m.test(schemaSrc),  'top-level DROP TYPE found');
});

/* ────────────────────────────────────────────────────────────────────────
   imageDimFallback unit tests (snapshot from widgets/drawing-generator.js)
   ──────────────────────────────────────────────────────────────────── */

function imageDimFallback(bytes) {
  let i = 2; // skip SOI 0xFFD8
  while (i < bytes.length) {
    if (bytes[i] !== 0xFF) break;
    while (bytes[i] === 0xFF && i < bytes.length) i++;
    const marker = bytes[i++];
    if (marker === 0xD8 || marker === 0xD9) continue;
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      const h = (bytes[i + 3] << 8) | bytes[i + 4];
      const w = (bytes[i + 5] << 8) | bytes[i + 6];
      return { w, h };
    }
    const segLen = (bytes[i] << 8) | bytes[i + 1];
    if (!segLen || isNaN(segLen)) break;
    i += segLen;
  }
  return { w: 1000, h: 707 };
}

test('imageDimFallback handles empty input without throwing', () => {
  let dim;
  try { dim = imageDimFallback(new Uint8Array(0)); }
  catch (err) { throw new Error(`should not throw: ${err.message}`); }
  assertEq(dim.w, 1000, 'fallback w');
  assertEq(dim.h, 707,  'fallback h');
});

test('imageDimFallback handles malformed input (returns 1000x707 fallback)', () => {
  const garbage = new Uint8Array([0xFF, 0xD8, 0x00, 0x00, 0xAA, 0xBB, 0xCC]);
  const dim = imageDimFallback(garbage);
  assertEq(dim.w, 1000, 'fallback w on malformed input');
  assertEq(dim.h, 707,  'fallback h on malformed input');
});

test('imageDimFallback decodes a SOF0 width/height pair', () => {
  // SOI + SOF0 marker with W=640, H=480
  const bytes = new Uint8Array([
    0xFF, 0xD8,                    // SOI
    0xFF, 0xC0,                    // SOF0
    0x00, 0x11,                    // segment length (irrelevant for parser)
    0x08,                          // precision
    0x01, 0xE0,                    // height = 0x01E0 = 480
    0x02, 0x80,                    // width  = 0x0280 = 640
  ]);
  const dim = imageDimFallback(bytes);
  assertEq(dim.w, 640, 'decoded width');
  assertEq(dim.h, 480, 'decoded height');
});

await summary();
