/**
 * tests/integration/pdf-writer.test.mjs
 *
 * Tests the PDF helpers in widgets/drawing-generator.js. Those helpers are
 * not exported (the widget is a registerWidget() call), so the relevant
 * functions are SNAPSHOTTED here. Keep in sync with the source file.
 */

import { test, assert, assertEq, summary } from './_runner.mjs';

/* ────────────────────────────────────────────────────────────────────────
   snapshot from widgets/drawing-generator.js — keep in sync
   ──────────────────────────────────────────────────────────────────── */

function buildSinglePagePdf(jpegBytes, pageW, pageH) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];

  let cursor = 0;
  const write = (chunk) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    cursor += bytes.length;
  };

  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3]));
  write('\n');

  offsets[1] = cursor;
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  offsets[2] = cursor;
  write('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  offsets[3] = cursor;
  const mediaBox = `[0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}]`;
  write(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} ` +
    `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> ` +
    `/Contents 5 0 R >>\nendobj\n`,
  );

  offsets[4] = cursor;
  write(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${jpegBytes.length > 0 ? imageDimFallback(jpegBytes).w : 1} ` +
    `/Height ${jpegBytes.length > 0 ? imageDimFallback(jpegBytes).h : 1} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
    `/Length ${jpegBytes.length} >>\nstream\n`,
  );
  write(jpegBytes);
  write('\nendstream\nendobj\n');

  const contentStream =
    `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  const csBytes = enc.encode(contentStream);
  offsets[5] = cursor;
  write(`5 0 obj\n<< /Length ${csBytes.length} >>\nstream\n`);
  write(csBytes);
  write('endstream\nendobj\n');

  const xrefStart = cursor;
  write('xref\n0 6\n');
  write('0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    write(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  write('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n');
  write(String(xrefStart) + '\n%%EOF\n');

  return new Blob(parts, { type: 'application/pdf' });
}

function imageDimFallback(bytes) {
  let i = 2;
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

/* ────────────────────────────────────────────────────────────────────────
   Hand-crafted minimal JPEG: SOI · SOF0 (1×1, gray, 1 component) · EOI.
   Just enough for imageDimFallback to walk markers and read W/H = 1×1.
   ──────────────────────────────────────────────────────────────────── */

function makeMinimalJpeg(width = 1, height = 1) {
  // SOI
  const bytes = [0xFF, 0xD8];
  // SOF0 marker: FF C0, length=11 (uint16-be), precision 8, height (be16),
  // width (be16), components=1, then 3 bytes per component (id, sampling, qtable).
  const w = width & 0xFFFF;
  const h = height & 0xFFFF;
  bytes.push(
    0xFF, 0xC0,
    0x00, 0x0B,            // length 11
    0x08,                  // precision 8 bits
    (h >> 8) & 0xFF, h & 0xFF,
    (w >> 8) & 0xFF, w & 0xFF,
    0x01,                  // 1 component (grayscale)
    0x01, 0x11, 0x00,      // component id=1, sampling 1x1, qtable 0
  );
  // EOI
  bytes.push(0xFF, 0xD9);
  return new Uint8Array(bytes);
}

/* ────────────────────────────────────────────────────────────────────────
   Tests
   ──────────────────────────────────────────────────────────────────── */

async function blobBytes(blob) {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function bytesToString(bytes) {
  // ASCII-safe decode
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

test('buildSinglePagePdf returns Blob with type application/pdf', async () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const blob = buildSinglePagePdf(jpeg, 595, 842); // A4
  assert(blob instanceof Blob, 'expected Blob');
  assertEq(blob.type, 'application/pdf');
  assert(blob.size > 0, 'blob must be non-empty');
});

test('PDF starts with %PDF-1.4 magic', async () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const blob = buildSinglePagePdf(jpeg, 595, 842);
  const bytes = await blobBytes(blob);
  const head = bytesToString(bytes.subarray(0, 8));
  assertEq(head, '%PDF-1.4', `expected %PDF-1.4 prefix, got: ${JSON.stringify(head)}`);
});

test('PDF contains required object types', async () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const blob = buildSinglePagePdf(jpeg, 595, 842);
  const bytes = await blobBytes(blob);
  const text = bytesToString(bytes);
  assert(text.includes('/Type /Catalog'), 'missing /Type /Catalog');
  assert(text.includes('/Type /Pages'),   'missing /Type /Pages');
  assert(text.includes('/Type /Page'),    'missing /Type /Page');
  assert(text.includes('/Subtype /Image'),'missing /Subtype /Image');
  assert(text.includes('/Filter /DCTDecode'), 'missing /Filter /DCTDecode');
});

test('PDF has xref\\n0 6 block', async () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const blob = buildSinglePagePdf(jpeg, 595, 842);
  const bytes = await blobBytes(blob);
  const text = bytesToString(bytes);
  assert(text.includes('xref\n0 6\n'), 'missing xref / 0 6 header');
});

test('PDF ends with %%EOF', async () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const blob = buildSinglePagePdf(jpeg, 595, 842);
  const bytes = await blobBytes(blob);
  const tail = bytesToString(bytes.subarray(bytes.length - 8));
  assert(/%%EOF/.test(tail), `expected %%EOF at end, got: ${JSON.stringify(tail)}`);
});

test('PDF MediaBox reflects requested page size', async () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const blob = buildSinglePagePdf(jpeg, 595, 842);
  const bytes = await blobBytes(blob);
  const text = bytesToString(bytes);
  assert(text.includes('/MediaBox [0 0 595.00 842.00]'),
    'MediaBox does not match requested size (A4)');
});

test('imageDimFallback reads 1×1 from minimal JPEG', () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const dim = imageDimFallback(jpeg);
  assertEq(dim.w, 1);
  assertEq(dim.h, 1);
});

test('imageDimFallback reads 640×480 SOF0', () => {
  const jpeg = makeMinimalJpeg(640, 480);
  const dim = imageDimFallback(jpeg);
  assertEq(dim.w, 640);
  assertEq(dim.h, 480);
});

test('imageDimFallback returns {1000, 707} for malformed input', () => {
  const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const dim = imageDimFallback(garbage);
  assertEq(dim.w, 1000);
  assertEq(dim.h, 707);
});

test('imageDimFallback does not throw on empty input', () => {
  let threw = false;
  let dim;
  try { dim = imageDimFallback(new Uint8Array(0)); }
  catch (_) { threw = true; }
  assertEq(threw, false, 'must not throw on empty input');
  assertEq(dim.w, 1000);
  assertEq(dim.h, 707);
});

test('PDF embeds the JPEG bytes verbatim', async () => {
  const jpeg = makeMinimalJpeg(1, 1);
  const blob = buildSinglePagePdf(jpeg, 595, 842);
  const bytes = await blobBytes(blob);
  // Find the JPEG byte sequence inside the PDF stream — trivial because
  // our jpeg is short and starts with FF D8.
  let found = false;
  for (let i = 0; i < bytes.length - jpeg.length; i++) {
    let match = true;
    for (let j = 0; j < jpeg.length; j++) {
      if (bytes[i + j] !== jpeg[j]) { match = false; break; }
    }
    if (match) { found = true; break; }
  }
  assert(found, 'expected the raw JPEG bytes to be embedded in the PDF');
});

await summary();
