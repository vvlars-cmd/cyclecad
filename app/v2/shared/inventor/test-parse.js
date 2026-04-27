/**
 * shared/inventor/test-parse.js
 *
 * Browser-runnable smoke test for the Inventor parsers. Open via a static
 * server (`make serve`) and import this module from a small HTML harness:
 *
 *   <script type="module">
 *     import { run } from '/shared/inventor/test-parse.js';
 *     run();
 *   </script>
 *
 * The script fetches the DUO sample project, the main assembly, and a
 * representative part, then dumps the parsed results to `console.table`.
 * Won't run in the build sandbox — this is a developer aid only.
 */

import { parseIpj } from './ipj-parser.js';
import { parseIam } from './iam-parser.js';
import { parseIpt } from './ipt-parser.js';
import { detectFormat } from './index.js';

const FIXTURES = {
  ipj: '../../DUO/D-ZBG-DUO-Anlage.ipj',
  iam: '../../DUO/Workspaces/Arbeitsbereich/Zusatzoptionen/DUOdurch/D-ZBG-DUO-Anlage.iam',
  ipt: '../../DUO/Workspaces/Arbeitsbereich/Zukaufteile/mink/Leistenb%C3%BCrste-40-1000.ipt',
};

/**
 * Fetch a fixture as bytes.
 * @param {string} url
 * @returns {Promise<Uint8Array>}
 */
async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Parse all three fixtures and dump their summary to the console.
 * Returns the raw results so you can inspect them in the devtools.
 */
export async function run() {
  /* eslint-disable no-console */
  console.group('inventor parsers — DUO sample');

  const out = { ipj: null, iam: null, ipt: null, errors: [] };

  // .ipj
  try {
    const bytes = await fetchBytes(FIXTURES.ipj);
    const fmt = detectFormat(bytes, FIXTURES.ipj);
    console.log('ipj format:', fmt, 'bytes:', bytes.length);
    out.ipj = parseIpj(bytes);
    console.table([{
      version: out.ipj.version,
      workspacePath: out.ipj.workspacePath,
      libraries: out.ipj.libraryPaths.length,
      warnings: out.ipj.warnings.length,
    }]);
    console.table(out.ipj.libraryPaths);
  } catch (e) {
    console.warn('ipj parse failed:', e);
    out.errors.push({ file: 'ipj', error: String(e) });
  }

  // .iam
  try {
    const bytes = await fetchBytes(FIXTURES.iam);
    const fmt = detectFormat(bytes, FIXTURES.iam);
    console.log('iam format:', fmt, 'bytes:', bytes.length);
    out.iam = parseIam(bytes, { name: 'D-ZBG-DUO-Anlage.iam' });
    console.table([{
      kind: out.iam.kind,
      occurrences: out.iam.occurrences.length,
      thumbnailBytes: out.iam.thumbnail ? out.iam.thumbnail.length : 0,
      streams: out.iam.raw.streams.length,
      warnings: out.iam.warnings.length,
    }]);
    console.table(out.iam.properties);
    console.table(out.iam.occurrences.slice(0, 20));
  } catch (e) {
    console.warn('iam parse failed:', e);
    out.errors.push({ file: 'iam', error: String(e) });
  }

  // .ipt
  try {
    const bytes = await fetchBytes(FIXTURES.ipt);
    const fmt = detectFormat(bytes, FIXTURES.ipt);
    console.log('ipt format:', fmt, 'bytes:', bytes.length);
    out.ipt = parseIpt(bytes, { name: 'Leistenbürste-40-1000.ipt' });
    console.table([{
      kind: out.ipt.kind,
      featureCount: out.ipt.featureCount,
      hasSheetMetal: out.ipt.hasSheetMetal,
      thumbnailBytes: out.ipt.thumbnail ? out.ipt.thumbnail.length : 0,
      streams: out.ipt.raw.streams.length,
      warnings: out.ipt.warnings.length,
    }]);
    console.table(out.ipt.properties);
  } catch (e) {
    console.warn('ipt parse failed:', e);
    out.errors.push({ file: 'ipt', error: String(e) });
  }

  console.groupEnd();
  /* eslint-enable no-console */
  return out;
}

// Auto-run when loaded as the main module on a page that opts in
if (typeof window !== 'undefined' && window.__INVENTOR_TEST_AUTORUN) {
  run();
}
