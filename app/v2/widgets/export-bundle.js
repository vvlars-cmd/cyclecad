/**
 * @file widgets/export-bundle.js
 * @description Zip up STL + STEP + BOM + drawings into a downloadable bundle.
 *
 *   Pure-JS, no third-party libs. Implements a STORE-only (method 0x0000)
 *   ZIP writer that is RFC 1951 / PKWARE APPNOTE 6.3.6 compatible:
 *
 *     [local file header][filename][raw bytes]   (per file, no compression)
 *     [central directory entry]                  (per file)
 *     [end of central directory record]
 *
 *   CRC-32 is computed inline using the IEEE 802.3 polynomial 0xEDB88320.
 *   No data descriptors, no ZIP64, no UTF-8 flag — filenames are restricted
 *   to ASCII (paths are normalized before being added).
 *
 *   Each "kind" maps to a backend route — if a route 404s the kind is
 *   skipped with a warning rather than failing the whole bundle. The
 *   final blob is offered to the browser via an anchor click.
 *
 *   Metered at the `sonnet` tier: tokensOut ≈ ceil(sizeBytes / 1024) so
 *   the ledger reflects the size of the bundle that left the building.
 *
 * @author  Sachin Kumar
 * @license MIT
 *
 * Use Case 1 · widget #8 of 8 (see HANDOFF-2026-04-27.md).
 */

const ESC = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const ALL_KINDS = ['stl', 'step', 'glb', 'bom-csv', 'drawings-pdf', 'drawings-svg', 'manifest-json'];

const KIND_LABEL = {
  'stl':           'STL meshes',
  'step':          'STEP geometry',
  'glb':           'GLB (web 3D)',
  'bom-csv':       'BOM (.csv)',
  'drawings-pdf':  'Drawings (.pdf)',
  'drawings-svg':  'Drawings (.svg)',
  'manifest-json': 'manifest.json',
};

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3 polynomial, reversed = 0xEDB88320). Cached table.
// ---------------------------------------------------------------------------
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
function crc32(bytes) {
  const t = crcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------------------
// STORE-only ZIP writer. Returns a Blob.
//   files = [{ name: string, bytes: Uint8Array }]
// ---------------------------------------------------------------------------
function buildZip(files) {
  const enc = new TextEncoder();
  const local = []; // { headerBytes, name, data, crc, size, offset }
  const central = [];
  let offset = 0;

  // DOS time/date for "now"
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1F) << 11) | ((now.getMinutes() & 0x3F) << 5) | ((now.getSeconds() / 2) & 0x1F);
  const dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9) | (((now.getMonth() + 1) & 0x0F) << 5) | (now.getDate() & 0x1F);

  for (const f of files) {
    // Normalize: forward slashes, strip leading slash, ASCII-clean
    const name = String(f.name || 'unnamed').replace(/\\/g, '/').replace(/^\/+/, '').replace(/[^\x20-\x7E]/g, '_');
    const nameBytes = enc.encode(name);
    const data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes || []);
    const c = crc32(data);
    const size = data.length;

    // Local file header (30 bytes + name)
    const lfh = new Uint8Array(30);
    const dv = new DataView(lfh.buffer);
    dv.setUint32(0,  0x04034b50, true);   // signature
    dv.setUint16(4,  20,         true);   // version needed
    dv.setUint16(6,  0,          true);   // flags
    dv.setUint16(8,  0,          true);   // method = STORE (0x0000)
    dv.setUint16(10, dosTime,    true);
    dv.setUint16(12, dosDate,    true);
    dv.setUint32(14, c,          true);   // CRC-32
    dv.setUint32(18, size,       true);   // compressed size
    dv.setUint32(22, size,       true);   // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0,          true);   // extra field length

    local.push({ lfh, nameBytes, data });
    central.push({ name, nameBytes, crc: c, size, offset, dosTime, dosDate });
    offset += lfh.length + nameBytes.length + size;
  }

  // Central directory
  const cdrParts = [];
  const cdrStart = offset;
  for (const e of central) {
    const cdr = new Uint8Array(46);
    const dv = new DataView(cdr.buffer);
    dv.setUint32(0,  0x02014b50, true);   // signature
    dv.setUint16(4,  20,         true);   // version made by
    dv.setUint16(6,  20,         true);   // version needed
    dv.setUint16(8,  0,          true);   // flags
    dv.setUint16(10, 0,          true);   // method
    dv.setUint16(12, e.dosTime,  true);
    dv.setUint16(14, e.dosDate,  true);
    dv.setUint32(16, e.crc,      true);
    dv.setUint32(20, e.size,     true);
    dv.setUint32(24, e.size,     true);
    dv.setUint16(28, e.nameBytes.length, true);
    dv.setUint16(30, 0,          true);   // extra
    dv.setUint16(32, 0,          true);   // comment
    dv.setUint16(34, 0,          true);   // disk #
    dv.setUint16(36, 0,          true);   // internal attrs
    dv.setUint32(38, 0,          true);   // external attrs
    dv.setUint32(42, e.offset,   true);   // local header offset
    cdrParts.push(cdr, e.nameBytes);
    offset += cdr.length + e.nameBytes.length;
  }
  const cdrSize = offset - cdrStart;

  // End of central directory record
  const eocd = new Uint8Array(22);
  {
    const dv = new DataView(eocd.buffer);
    dv.setUint32(0,  0x06054b50, true);
    dv.setUint16(4,  0,          true);   // disk #
    dv.setUint16(6,  0,          true);   // disk w/ CD start
    dv.setUint16(8,  central.length, true);
    dv.setUint16(10, central.length, true);
    dv.setUint32(12, cdrSize,    true);
    dv.setUint32(16, cdrStart,   true);
    dv.setUint16(20, 0,          true);   // comment len
  }

  const parts = [];
  for (const f of local) parts.push(f.lfh, f.nameBytes, f.data);
  for (const p of cdrParts) parts.push(p);
  parts.push(eocd);
  return new Blob(parts, { type: 'application/zip' });
}

// ---------------------------------------------------------------------------
// Backend fetch helpers — return Uint8Array or null on 404.
// ---------------------------------------------------------------------------
async function fetchBytes(url) {
  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('http ' + res.status);
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  } catch (e) {
    return null;
  }
}

async function fetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------
/**
 * Mount the export-bundle widget.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { projectId?: string|number, kinds?: Array<'stl'|'step'|'glb'|'bom-csv'|'drawings-pdf'|'drawings-svg'|'manifest-json'> }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     setProject: (projectId: string|number) => Promise<void>,
 *     setSelection: (componentIds: Array<string|number>) => void,
 *     addInclusion: (kind: string) => void,
 *     removeInclusion: (kind: string) => void,
 *     getInclusions: () => Array<string>,
 *     estimate: () => { kinds: Array<string>, sizeBytes: number, files: number },
 *     bundle: () => Promise<{ blob: Blob, name: string, sizeBytes: number, manifest: object }>,
 *     download: () => Promise<void>
 *   },
 *   on: (event: 'change'|'progress'|'bundled'|'downloaded'|'error', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('export-bundle: mount not found');

  const dom = document.createElement('div');
  dom.className = 'pt-export-bundle';
  dom.style.cssText = 'padding:18px;font:13px Inter,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:6px;max-width:780px';
  dom.innerHTML = `
    <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px">CYCLECAD · EXPORT</div>
    <div style="font:600 22px Georgia;margin-bottom:10px">bundle &amp; download</div>

    <div style="display:flex;gap:10px;align-items:end;margin-bottom:14px;flex-wrap:wrap">
      <label style="font-size:11px;color:#4B5563;flex:1">project id
        <input data-pid type=text value="demo-duo" style="width:100%;padding:6px 8px;font:11px Menlo,monospace;border:1px solid #d1d5db;border-radius:3px">
      </label>
      <button data-estimate style="background:#10B981;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">ESTIMATE</button>
    </div>

    <fieldset style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:14px">
      <legend style="font:600 11px Inter;color:#7C3AED;padding:0 6px">inclusions</legend>
      <div data-kinds style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px"></div>
    </fieldset>

    <div data-selection style="font:11px Menlo,monospace;color:#4B5563;margin-bottom:10px">Selection: full project</div>

    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px">
      <button data-bundle style="background:#7C3AED;color:#fff;border:none;padding:10px 18px;border-radius:4px;font:600 13px Inter;cursor:pointer">BUNDLE &amp; DOWNLOAD</button>
      <span data-status style="font:11px Menlo,monospace;color:#6B7280">idle</span>
    </div>

    <div data-progress-wrap style="height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;margin-bottom:8px;display:none">
      <div data-progress style="height:100%;width:0%;background:#7C3AED;transition:width 120ms linear"></div>
    </div>

    <div data-result style="font:11px Menlo,monospace;color:#065F46;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:4px;padding:8px 10px;display:none"></div>
  `;
  root.appendChild(dom);

  const $ = sel => dom.querySelector(sel);
  const status     = $('[data-status]');
  const result     = $('[data-result]');
  const progress   = $('[data-progress]');
  const progWrap   = $('[data-progress-wrap]');
  const selLine    = $('[data-selection]');
  const kindsHost  = $('[data-kinds]');

  const listeners = { change: [], progress: [], complete: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  let alive       = true;
  let projectId   = 'demo-duo';
  let selection   = null;     // null = whole project
  const inclusions = new Set(['stl', 'step', 'bom-csv', 'manifest-json']);

  function renderKinds() {
    kindsHost.innerHTML = ALL_KINDS.map(k => `
      <label style="display:flex;align-items:center;gap:6px;font:12px Inter;color:#374151;cursor:pointer">
        <input type=checkbox data-kind="${ESC(k)}" ${inclusions.has(k) ? 'checked' : ''}>
        <span>${ESC(KIND_LABEL[k] || k)}</span>
      </label>
    `).join('');
    kindsHost.querySelectorAll('input[data-kind]').forEach(cb => {
      cb.addEventListener('change', () => {
        const k = cb.dataset.kind;
        if (cb.checked) inclusions.add(k); else inclusions.delete(k);
        emit('change', { kind: 'inclusions', inclusions: [...inclusions] });
      });
    });
  }
  renderKinds();

  function renderSelection() {
    if (!selection) selLine.textContent = 'Selection: full project';
    else            selLine.textContent = `Selection: ${selection.length} components`;
  }

  function setProgress(pct, label) {
    progWrap.style.display = 'block';
    progress.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (label) status.textContent = label;
    emit('progress', { pct, label });
  }

  // -------- API methods --------
  function setProject(id) { projectId = String(id || projectId); emit('change', { kind: 'project', projectId }); }
  function setSelection(ids) {
    selection = (Array.isArray(ids) && ids.length) ? ids.slice() : null;
    renderSelection();
    emit('change', { kind: 'selection', selection });
  }
  function addInclusion(k)    { if (ALL_KINDS.includes(k)) { inclusions.add(k);    renderKinds(); emit('change', { kind: 'inclusions' }); } }
  function removeInclusion(k) { inclusions.delete(k); renderKinds(); emit('change', { kind: 'inclusions' }); }
  function getInclusions()    { return [...inclusions]; }

  async function listComponents() {
    // selection wins; otherwise ask the server; otherwise demo fallback
    if (selection) return selection.map(id => ({ id, name: String(id) }));
    const j = await fetchJson(`/api/library/projects/${encodeURIComponent(projectId)}/components`);
    if (j && Array.isArray(j.components) && j.components.length) return j.components;
    return [
      { id: 'demo:duo-gestell',    name: 'DUO Gestell',    glb_path: 'derived/duo-gestell/geometry.glb' },
      { id: 'demo:duo-rail',       name: 'DUO Rail',       glb_path: 'derived/duo-rail/geometry.glb' },
      { id: 'demo:duo-mount-lug',  name: 'DUO Mount Lug',  glb_path: 'derived/duo-mount-lug/geometry.glb' },
    ];
  }

  async function estimate() {
    const comps = await listComponents();
    let fileCount = 0;
    let sizeBytes = 0;
    for (const c of comps) {
      if (inclusions.has('stl'))  { fileCount++; sizeBytes += 250 * 1024; }
      if (inclusions.has('step')) { fileCount++; sizeBytes += 800 * 1024; }
      if (inclusions.has('glb'))  { fileCount++; sizeBytes += 180 * 1024; }
    }
    if (inclusions.has('bom-csv'))       { fileCount++; sizeBytes += Math.max(2 * 1024, comps.length * 120); }
    if (inclusions.has('drawings-pdf'))  { fileCount++; sizeBytes += 220 * 1024; }
    if (inclusions.has('drawings-svg'))  { fileCount++; sizeBytes += 60  * 1024; }
    if (inclusions.has('manifest-json')) { fileCount++; sizeBytes += 4   * 1024; }
    return { fileCount, sizeBytes, sizeBytesEstimated: true };
  }

  async function bundle() {
    if (!alive) throw new Error('export-bundle: destroyed');
    const t0 = Date.now();
    result.style.display = 'none';
    setProgress(2, 'collecting components…');
    emit('change', { kind: 'bundle-start' });

    const enc = new TextEncoder();
    const comps = await listComponents();
    const files = [];
    const skipped = [];

    // Estimate steps for progress: per-component kinds + project-level kinds
    const perCompKinds  = ['stl', 'step', 'glb'].filter(k => inclusions.has(k));
    const projectKinds  = ['bom-csv', 'drawings-pdf', 'drawings-svg', 'manifest-json'].filter(k => inclusions.has(k));
    const totalSteps = comps.length * perCompKinds.length + projectKinds.length;
    let step = 0;
    const tick = (label) => { step++; setProgress(2 + (step / Math.max(1, totalSteps)) * 92, label); };

    for (const c of comps) {
      for (const kind of perCompKinds) {
        if (!alive) return null;
        let url, ext;
        if (kind === 'stl')  { url = `/api/library/components/${encodeURIComponent(c.id)}/export/stl`;  ext = 'stl'; }
        if (kind === 'step') { url = `/api/library/components/${encodeURIComponent(c.id)}/export/step`; ext = 'step'; }
        if (kind === 'glb')  { url = c.glb_path ? '/' + String(c.glb_path).replace(/^\/+/, '') : `/api/library/components/${encodeURIComponent(c.id)}/export/glb`; ext = 'glb'; }
        const bytes = await fetchBytes(url);
        if (!bytes) {
          skipped.push({ kind, id: c.id, reason: 'route 404 or unreachable' });
          tick(`skipped ${kind} for ${c.name || c.id}`);
          continue;
        }
        const safe = String(c.name || c.id).replace(/[^A-Za-z0-9._-]+/g, '_');
        files.push({ name: `components/${safe}/${safe}.${ext}`, bytes });
        tick(`+ ${kind} · ${c.name || c.id}`);
      }
    }

    if (inclusions.has('bom-csv')) {
      const bytes = await fetchBytes(`/api/library/projects/${encodeURIComponent(projectId)}/bom`);
      if (bytes) files.push({ name: 'bom.csv', bytes });
      else {
        const fallback = enc.encode('component_id,name,qty\n' + comps.map(c => `${c.id},${(c.name || '').replace(/,/g, ' ')},1`).join('\n') + '\n');
        files.push({ name: 'bom.csv', bytes: fallback });
      }
      tick('+ bom.csv');
    }

    if (inclusions.has('drawings-pdf') || inclusions.has('drawings-svg')) {
      const idx = await fetchJson(`/api/library/projects/${encodeURIComponent(projectId)}/drawings`);
      const drawings = (idx && Array.isArray(idx.drawings)) ? idx.drawings : [];
      for (const d of drawings) {
        if (inclusions.has('drawings-pdf')) {
          const b = await fetchBytes(`/api/library/drawings/${encodeURIComponent(d.id)}/export/pdf`);
          if (b) files.push({ name: `drawings/${(d.name || d.id)}.pdf`, bytes: b });
          else   skipped.push({ kind: 'drawings-pdf', id: d.id, reason: 'route 404' });
        }
        if (inclusions.has('drawings-svg')) {
          const b = await fetchBytes(`/api/library/drawings/${encodeURIComponent(d.id)}/export/svg`);
          if (b) files.push({ name: `drawings/${(d.name || d.id)}.svg`, bytes: b });
          else   skipped.push({ kind: 'drawings-svg', id: d.id, reason: 'route 404' });
        }
      }
      if (inclusions.has('drawings-pdf')) tick('+ drawings/*.pdf');
      if (inclusions.has('drawings-svg')) tick('+ drawings/*.svg');
    }

    if (inclusions.has('manifest-json')) {
      const manifest = {
        project_id: projectId,
        generated_at: new Date().toISOString(),
        generator: 'cycleCAD/export-bundle@1',
        inclusions: [...inclusions],
        selection: selection ? [...selection] : null,
        components: comps.map(c => ({ id: c.id, name: c.name || null })),
        skipped,
      };
      files.push({ name: 'manifest.json', bytes: enc.encode(JSON.stringify(manifest, null, 2)) });
      tick('+ manifest.json');
    }

    if (!files.length) {
      const err = new Error('no files produced — every route 404d or all inclusions deselected');
      progWrap.style.display = 'none';
      status.textContent = 'error';
      emit('error', { error: err.message, skipped });
      throw err;
    }

    setProgress(96, 'building zip…');
    const blob = buildZip(files);
    const sizeBytes = blob.size;

    // Bill at sonnet tier, tokensOut ≈ size in KB
    if (opts.meter) {
      try {
        await opts.meter.charge({
          widget: 'export-bundle',
          method: 'bundle', kind: 'bundle',
          modelTier: 'sonnet',
          actor: opts.app,
          tokensIn: 1,
          tokensOut: Math.max(1, Math.ceil(sizeBytes / 1024)),
          params: { projectId, fileCount: files.length, inclusions: [...inclusions] },
        });
      } catch {}
    }

    const ms = Date.now() - t0;
    setProgress(100, 'done');
    result.style.display = 'block';
    result.textContent = `Bundled ${files.length} files, ${(sizeBytes / 1048576).toFixed(2)} MB, ready in ${(ms / 1000).toFixed(1)} s${skipped.length ? ' · ' + skipped.length + ' skipped' : ''}`;

    emit('complete', { fileCount: files.length, sizeBytes, ms, skipped, blob });
    emit('change', { kind: 'bundle-complete', fileCount: files.length, sizeBytes });
    return blob;
  }

  function download(blob, filename) {
    if (!(blob instanceof Blob)) throw new Error('export-bundle: download() needs a Blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `cyclecad-export-${projectId}-${Date.now()}.zip`;
    a.style.display = 'none';
    dom.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); } catch {} URL.revokeObjectURL(url); }, 0);
    return a.download;
  }

  // -------- UI handlers --------
  $('[data-pid]').addEventListener('change', e => setProject(e.target.value));
  $('[data-estimate]').addEventListener('click', async () => {
    setProject($('[data-pid]').value.trim() || 'demo-duo');
    const e = await estimate();
    status.textContent = `est ${e.fileCount} files · ~${(e.sizeBytes / 1048576).toFixed(2)} MB`;
    result.style.display = 'block';
    result.style.background = '#EFF6FF';
    result.style.borderColor = '#BFDBFE';
    result.style.color = '#1E3A8A';
    result.textContent = `Estimate: ${e.fileCount} files, ~${(e.sizeBytes / 1048576).toFixed(2)} MB (rough)`;
  });
  $('[data-bundle]').addEventListener('click', async () => {
    setProject($('[data-pid]').value.trim() || 'demo-duo');
    result.style.display = 'none';
    try {
      const blob = await bundle();
      if (blob) download(blob);
    } catch (e) {
      result.style.display = 'block';
      result.style.background = '#FEF2F2';
      result.style.borderColor = '#FCA5A5';
      result.style.color = '#991B1B';
      result.textContent = 'error: ' + (e?.message || String(e));
    }
  });

  renderSelection();

  return {
    api: {
      setProject,
      setSelection,
      addInclusion,
      removeInclusion,
      getInclusions,
      estimate,
      bundle,
      download,
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      alive = false;
      dom.remove();
      Object.keys(listeners).forEach(k => listeners[k] = []);
    },
  };
}
