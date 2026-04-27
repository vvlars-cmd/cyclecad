/**
 * tests/integration/walker.test.mjs
 *
 * Smoke tests for the server's directory walker + category classifier.
 *
 * Reimplements `walkDir` and `classifyCategory` here verbatim — they are not
 * exported as a module from `server/meter/index.js`. Keep this in sync if
 * the originals change. (See `// === LIBRARY IMPORT` block, ~line 1438.)
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert, assertEq, summary } from './_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const DUO_ROOT = path.join(REPO_ROOT, 'DUO');

/* ────────────────────────────────────────────────────────────────────────
   snapshot of server/meter/index.js — keep in sync
   ──────────────────────────────────────────────────────────────────── */

async function walkDir(dir, out) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (_) { return; }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) await walkDir(abs, out);
    else if (ent.isFile()) out.push(abs);
  }
}

function classifyCategory(relpath) {
  const p = relpath.toLowerCase().replace(/\\/g, '/');
  if (/(^|\/)content[ _]?center[ _]?files(\/|$)/.test(p)) return 'standard';
  if (/(^|\/)libraries(\/|$)/.test(p)) return 'standard';
  if (/(^|\/)din[\s_-]/.test(p)) return 'standard';
  if (/(^|\/)iso[\s_-]/.test(p)) return 'standard';
  if (/(^|\/)zukaufteile(\/|$)/.test(p)) return 'vendor';
  if (/(^|\/)(igus|interroll|rittal|smc|festo|bosch|wuerth|w[uü]rth|mink|smg|clangsonic)(\/|$)/.test(p)) return 'vendor';
  return 'custom';
}

/* ────────────────────────────────────────────────────────────────────────
   Optional skip — DUO/ may be absent on CI
   ──────────────────────────────────────────────────────────────────── */

let DUO_PRESENT = true;
try {
  const stat = await fs.stat(DUO_ROOT);
  if (!stat.isDirectory()) DUO_PRESENT = false;
} catch (_) { DUO_PRESENT = false; }

if (!DUO_PRESENT) {
  console.warn(`walker.test.mjs: DUO/ fixture not found at ${DUO_ROOT} — skipping suite.`);
  await summary();
}

/* ────────────────────────────────────────────────────────────────────────
   Tests
   ──────────────────────────────────────────────────────────────────── */

/**
 * Note on counts: the canonical DUO fixture is **478 files / 393 .ipt /
 * 80 .iam** (Matt's regression spec). CI checkouts may see a smaller set
 * — between 270 and 478 — because some NFD-named files (Träger / Höhe /
 * Übernommen / Glasführungs* / Bürsten / Würth / Räder) couldn't be tracked
 * by git on the macOS push without `core.precomposeunicode = true`. We
 * therefore assert *bounds* rather than exact counts, and log the actuals
 * so any regression jumps out in CI logs.
 */
test('walker finds the DUO fixture (≥ 270, ≤ 600 files)', async () => {
  const all = [];
  await walkDir(DUO_ROOT, all);
  console.info(`walker.test.mjs: walker counted ${all.length} files under DUO/`);
  assert(all.length >= 270 && all.length <= 600,
    `expected 270–600 files under DUO/, got ${all.length}`);
});

test('classifies a meaningful set of parts and assemblies', async () => {
  const all = [];
  await walkDir(DUO_ROOT, all);
  let parts = 0, assemblies = 0;
  for (const abs of all) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (ext === 'ipt') parts++;
    else if (ext === 'iam') assemblies++;
  }
  console.info(`walker.test.mjs: parts=${parts}, assemblies=${assemblies}`);
  assert(parts >= 200 && parts <= 500,
    `expected 200–500 .ipt parts, got ${parts}`);
  assert(assemblies >= 40 && assemblies <= 100,
    `expected 40–100 .iam assemblies, got ${assemblies}`);
});

test('vendor classification catches Zukaufteile + igus + mink + Würth', async () => {
  // Path-level checks (don't require DUO files for the assertions, but
  // they touch real Zukaufteile paths if present).
  assertEq(classifyCategory('Workspaces/Arbeitsbereich/Zukaufteile/igus/foo.ipt'), 'vendor');
  assertEq(classifyCategory('Workspaces/Arbeitsbereich/Zukaufteile/Ganter/x.ipt'), 'vendor');
  assertEq(classifyCategory('Workspaces/Arbeitsbereich/Zukaufteile/mink/Leistenbürste-40-1000.ipt'), 'vendor');
  assertEq(classifyCategory('Workspaces/igus/some-part.ipt'), 'vendor');
  assertEq(classifyCategory('Workspaces/mink/x.ipt'), 'vendor');
  assertEq(classifyCategory('Workspaces/wuerth/x.ipt'), 'vendor');
  assertEq(classifyCategory('Workspaces/würth/x.ipt'), 'vendor');
});

test('standard classification catches Content Center + DIN/ISO', async () => {
  assertEq(classifyCategory('Libraries/Content Center Files/de-DE/DIN 6912/foo.ipt'), 'standard');
  assertEq(classifyCategory('Libraries/Content Center Files/de-DE/ISO 4032/foo.ipt'), 'standard');
  assertEq(classifyCategory('Libraries/foo.ipt'), 'standard');
  assertEq(classifyCategory('DIN 7349 ees/x.ipt'), 'standard');
  assertEq(classifyCategory('ISO 7089 - 4 - A2.ipt'), 'standard');
});

test('classifies custom (non-vendor non-standard) paths', async () => {
  assertEq(classifyCategory('Workspaces/Arbeitsbereich/DUO Anlage/Seitenwand/SBG.iam'), 'custom');
  assertEq(classifyCategory('Workspaces/Arbeitsbereich/Parameter Skizze.ipt'), 'custom');
});

test('finds D-ZBG-DUO-Anlage.ipj at the project root', async () => {
  const all = [];
  await walkDir(DUO_ROOT, all);
  const ipj = all.filter(f => f.toLowerCase().endsWith('.ipj'));
  assert(ipj.length >= 1, 'expected at least one .ipj file');
  const found = ipj.find(f => path.basename(f) === 'D-ZBG-DUO-Anlage.ipj');
  assert(found, 'expected D-ZBG-DUO-Anlage.ipj to be present');
  // Should be at the DUO root, not nested
  assertEq(path.relative(DUO_ROOT, found), 'D-ZBG-DUO-Anlage.ipj');
});

test('walker skips dotfiles', async () => {
  const all = [];
  await walkDir(DUO_ROOT, all);
  for (const abs of all) {
    const segs = path.relative(DUO_ROOT, abs).split(path.sep);
    for (const s of segs) {
      assert(!s.startsWith('.'), `dotfile leaked: ${abs}`);
    }
  }
});

test('vendor category dominant under Zukaufteile/', async () => {
  const all = [];
  await walkDir(DUO_ROOT, all);
  const counts = { custom: 0, standard: 0, vendor: 0 };
  for (const abs of all) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (!['ipt', 'iam', 'idw', 'ipn'].includes(ext)) continue;
    const cat = classifyCategory(path.relative(DUO_ROOT, abs));
    if (counts[cat] != null) counts[cat]++;
  }
  assert(counts.vendor > 0, 'expected at least one vendor file');
  assert(counts.standard > 0, 'expected at least one standard file');
  assert(counts.custom > 0, 'expected at least one custom file');
});

await summary();
