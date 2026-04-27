/**
 * @file widgets/inventor-project-loader.js
 * @description User-facing Inventor project import widget. The user picks a
 *   folder containing an Inventor project (`.ipj` + `.iam` + `.ipt`); this
 *   widget walks the tree, parses every Inventor file via shared/inventor/*,
 *   shows a preview, then ships the manifest + per-file bytes to the server.
 *
 *   Three-state UX:
 *     1. Pre-pick    drop zone + file picker
 *     2. Parsing     progress bar + live counter + collapsible error log
 *     3. Preview     stats + tree preview + project name + "Import"
 *     4. Importing   per-file upload bar; emits 'imported' on success
 *
 *   Browser-only. Uses the File System Access API where available, falls
 *   back to <input type=file webkitdirectory>. No Node APIs.
 *
 *   Contract:
 *     init({ mount, app, meter, params? }) -> { api, on, destroy }
 *
 *   API:
 *     pickFolder()                       opens picker, walks the tree
 *     parseProject(input)                parses .ipj + every .iam/.ipt
 *     previewBeforeImport()              renders stats + tree
 *     importToServer({tenantId, name})   POST manifest, then upload bytes
 *     streamFile(componentId, file)      single-file upload (used internally)
 *     cancelImport()                     aborts in-flight upload loop
 *     getProgress()                      { phase, parsed, total, errors }
 *
 *   Events: 'pick' | 'parsing' | 'parsed' | 'preview' | 'imported' | 'error'
 *           | 'progress' | 'change' | 'cancel'
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import {
  parseIpj,
  parseIam,
  parseIpt,
} from '../shared/inventor/index.js';

// ---------------------------------------------------------------------------
// Helpers shared across handlers
// ---------------------------------------------------------------------------

const META_EXTS    = new Set(['ipj', 'iam', 'ipt', 'idw', 'ipn']);
const VENDOR_HINTS = [
  'zukauf', 'igus', 'interroll', 'rittal', 'ganter', 'kipp-norelem',
  'kipp', 'norelem', 'blickle', 'mink', 'weg', 'ventilator', 'sew',
  'festo', 'smc',
];
const STANDARD_HINTS = [
  'content center', 'content_center', 'libraries/content',
  'din ', 'din-', 'din_', 'iso ', 'iso-', 'iso_', 'ansi ', 'jis ',
  'normteile', 'standardteile',
];

/** Naive directory traversal/path-shape filter. */
function safeRel(rel) {
  if (!rel) return false;
  if (rel.includes('\0')) return false;
  if (rel.startsWith('/') || rel.startsWith('\\')) return false;
  const parts = rel.split(/[\\/]/);
  return !parts.some(p => p === '..' || p === '.');
}

/** Lowercase extension or '' */
function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** Best-effort category bucket from folder breadcrumbs. */
function categorize(relpath) {
  const lower = relpath.toLowerCase();
  for (const h of VENDOR_HINTS)   if (lower.includes(h)) return 'vendor';
  for (const h of STANDARD_HINTS) if (lower.includes(h)) return 'standard';
  // DIN/ISO bare prefix on the *file* (not just folder) — covers
  // "DIN EN 10305-4 - E235 - 15 x 1.ipt" pattern from the DUO sample
  const base = relpath.split(/[\\/]/).pop() || '';
  if (/^(din|iso|ansi|jis)[\s_-]/i.test(base)) return 'standard';
  return 'custom';
}

/** Map an extension to a component kind. */
function kindFromExt(ext) {
  switch (ext) {
    case 'iam': return 'assembly';
    case 'ipt': return 'part';      // upgraded to sheet-metal post-parse if applicable
    case 'idw': return 'drawing';
    case 'ipn': return 'presentation';
    default:    return 'part';
  }
}

/** Compute the parent .iam relpath for an .ipt/.iam by walking up the
 *  directory tree until we find another component in the same project. */
function inferParent(relpath, allRelpaths) {
  const parts = relpath.split(/[\\/]/);
  parts.pop();
  while (parts.length > 0) {
    const dir = parts.join('/');
    // Look for any sibling .iam in this directory
    const sibling = allRelpaths.find(r =>
      r !== relpath
      && r.startsWith(dir + '/')
      && r.split(/[\\/]/).length === parts.length + 1
      && extOf(r) === 'iam'
    );
    if (sibling) return sibling;
    parts.pop();
  }
  return null;
}

/** sha256 hex of an ArrayBuffer using the Web Crypto API. */
async function sha256Hex(buf) {
  if (!buf) return null;
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const ab = buf instanceof ArrayBuffer ? buf : (buf.buffer || buf);
  const digest = await crypto.subtle.digest('SHA-256', ab);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// ---------------------------------------------------------------------------
// Folder walking — File System Access API + webkitdirectory fallback
// ---------------------------------------------------------------------------

/** Walk a FileSystemDirectoryHandle recursively, yielding { relpath, file }. */
async function* walkDirectoryHandle(rootHandle, prefix = '') {
  // @ts-ignore values() is async-iterable in Chromium impls
  for await (const entry of rootHandle.values()) {
    const sub = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      try {
        const file = await entry.getFile();
        yield { relpath: sub, file };
      } catch { /* skip unreadable */ }
    } else if (entry.kind === 'directory') {
      yield* walkDirectoryHandle(entry, sub);
    }
  }
}

/** Convert a FileList from <input webkitdirectory> into the same shape. */
function fileListToEntries(fileList) {
  const out = [];
  for (const file of Array.from(fileList)) {
    // webkitRelativePath is set when the user picked a directory
    const rel = (file.webkitRelativePath && file.webkitRelativePath.length > 0)
      ? file.webkitRelativePath
      : file.name;
    out.push({ relpath: rel, file });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

/**
 * Mount the Inventor project importer.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { tenantId?: string, name?: string, autoImport?: boolean }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     pickFolder: () => Promise<void>,
 *     parseProject: (input: { files: File[]|FileList, ipjFile?: File }) => Promise<object>,
 *     previewBeforeImport: () => void,
 *     importToServer: (overrides?: { tenantId?: string, name?: string }) => Promise<{ projectId: number }>,
 *     streamFile: (componentId: number, file: File) => Promise<void>,
 *     cancelImport: () => void,
 *     getProgress: () => { phase: string, parsed: number, total: number, errors: number }
 *   },
 *   on: (event: 'pick'|'parsing'|'parsed'|'preview'|'imported'|'error'|'progress'|'change'|'cancel', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('inventor-project-loader: mount not found');
  const params = opts.params || {};
  const meter  = opts.meter;

  // ---------- DOM ----------
  const wrap = document.createElement('div');
  wrap.className = 'pt-inventor-project-loader';
  wrap.style.cssText = `
    font: 13px/1.45 Inter, -apple-system, sans-serif;
    color: var(--cc-fg, #0F1416);
    background: var(--cc-bg, #FFFFFF);
    border: 1px solid var(--cc-rule, var(--pt-rule, #D6D9DD));
    border-radius: var(--cc-radius, 4px);
    padding: 16px;
    width: 100%; max-width: 720px;
    box-sizing: border-box;
    display: flex; flex-direction: column; gap: 12px;
  `;
  wrap.innerHTML = `
    <header style="display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--cc-rule,#D6D9DD);padding-bottom:10px">
      <div style="font:600 11px Inter;letter-spacing:2px;color:var(--cc-accent,#7C3AED);text-transform:uppercase">Library / Import</div>
      <div data-phase style="font:600 10px Inter;letter-spacing:1px;text-transform:uppercase;padding:2px 8px;border-radius:11px;background:var(--cc-cream,#F4F1EA);color:var(--cc-muted,#6E7780)">pre-pick</div>
      <div style="flex:1"></div>
      <div data-counter style="font:11px Menlo,monospace;color:var(--cc-muted,#6E7780)"></div>
    </header>

    <div data-stage="pre-pick">
      <div data-drop style="border:2px dashed var(--cc-rule,#D6D9DD);border-radius:6px;padding:30px 18px;text-align:center;cursor:pointer;background:var(--cc-cream,#F4F1EA);transition:background 120ms ease">
        <div style="font:600 16px Georgia,serif;color:var(--cc-fg,#0F1416)">Drop your Inventor project folder here</div>
        <div style="font:13px Inter;color:var(--cc-muted,#6E7780);margin-top:6px">or <span style="color:var(--cc-accent,#7C3AED);text-decoration:underline">click to choose a directory</span></div>
        <div style="font:11px Menlo,monospace;color:var(--cc-muted,#6E7780);margin-top:14px">expects one .ipj &middot; any number of .iam / .ipt</div>
      </div>
      <input data-fallback type=file webkitdirectory directory multiple style="display:none">
    </div>

    <div data-stage="parsing" style="display:none">
      <div data-msg style="font:13px Inter;color:var(--cc-fg,#0F1416)">Parsing project&hellip;</div>
      <div style="height:8px;background:var(--cc-cream,#F4F1EA);border-radius:4px;overflow:hidden;margin-top:8px">
        <div data-bar style="height:100%;width:0%;background:var(--cc-accent,#7C3AED);transition:width 100ms linear"></div>
      </div>
      <div data-current style="font:11px Menlo,monospace;color:var(--cc-muted,#6E7780);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
      <details style="margin-top:10px">
        <summary style="cursor:pointer;font:600 11px Inter;color:var(--cc-muted,#6E7780)">parse errors (<span data-errcount>0</span>)</summary>
        <pre data-errlog style="margin:8px 0 0;background:#0F172A;color:#FCA5A5;padding:8px;border-radius:4px;font:11px Menlo,monospace;max-height:160px;overflow:auto"></pre>
      </details>
    </div>

    <div data-stage="preview" style="display:none">
      <div data-stats style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"></div>

      <div style="display:flex;gap:10px;align-items:end;margin-top:14px">
        <label style="flex:1;font:11px Inter;color:var(--cc-muted,#6E7780)">project name
          <input data-pname type=text style="width:100%;padding:6px 8px;font:13px Inter;border:1px solid var(--cc-rule,#D6D9DD);border-radius:3px;color:var(--cc-fg,#0F1416);background:var(--cc-bg,#fff)">
        </label>
        <label style="font:11px Inter;color:var(--cc-muted,#6E7780)">tenant
          <select data-tenant style="padding:6px 8px;font:13px Inter;border:1px solid var(--cc-rule,#D6D9DD);border-radius:3px;color:var(--cc-fg,#0F1416);background:var(--cc-bg,#fff)">
            <option value="default">default</option>
          </select>
        </label>
      </div>

      <div data-tree style="margin-top:12px;max-height:280px;overflow:auto;border:1px solid var(--cc-rule,#D6D9DD);border-radius:4px;padding:8px;font:12px Inter;background:var(--cc-bg,#fff)"></div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button data-cancel style="background:transparent;border:1px solid var(--cc-rule,#D6D9DD);color:var(--cc-fg,#0F1416);padding:7px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">Cancel</button>
        <button data-import style="background:var(--cc-accent,#7C3AED);border:none;color:#fff;padding:7px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">Import to library</button>
      </div>
    </div>

    <div data-stage="importing" style="display:none">
      <div data-imp-msg style="font:13px Inter;color:var(--cc-fg,#0F1416)">Uploading files&hellip;</div>
      <div style="height:8px;background:var(--cc-cream,#F4F1EA);border-radius:4px;overflow:hidden;margin-top:8px">
        <div data-imp-bar style="height:100%;width:0%;background:var(--cc-green,#03B188);transition:width 100ms linear"></div>
      </div>
      <div data-imp-current style="font:11px Menlo,monospace;color:var(--cc-muted,#6E7780);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px">
        <button data-cancel-imp style="background:transparent;border:1px solid var(--cc-rule,#D6D9DD);color:var(--cc-fg,#0F1416);padding:7px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">Cancel</button>
      </div>
    </div>
  `;
  root.appendChild(wrap);

  const $  = (sel) => wrap.querySelector(sel);
  const stages = {
    'pre-pick':  $('[data-stage="pre-pick"]'),
    'parsing':   $('[data-stage="parsing"]'),
    'preview':   $('[data-stage="preview"]'),
    'importing': $('[data-stage="importing"]'),
  };
  const phaseEl   = $('[data-phase]');
  const counterEl = $('[data-counter]');

  // ---------- state ----------
  const listeners = {
    pick: [], parsing: [], parsed: [], preview: [], imported: [],
    error: [], progress: [], change: [], cancel: [],
  };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const trackedListeners = [];
  function track(target, type, fn) { target.addEventListener(type, fn); trackedListeners.push({ target, type, fn }); }

  /** State machine. */
  let phase = 'pre-pick'; // pre-pick | parsing | preview | importing | done
  let entries = [];        // [{ relpath, file }]
  let manifest = null;     // { projectFile, components[], stats }
  let importState = { aborted: false };
  const progress = { phase, parsed: 0, total: 0, errors: [] };

  function setPhase(next) {
    phase = next;
    progress.phase = next;
    Object.entries(stages).forEach(([k, el]) => { el.style.display = k === next ? '' : 'none'; });
    phaseEl.textContent = next;
    emit('change', { kind: 'phase', phase: next });
  }

  function setCounter(text) { counterEl.textContent = text || ''; }

  function pushError(err) {
    progress.errors.push(err);
    const log = $('[data-errlog]');
    const cnt = $('[data-errcount]');
    if (log) log.textContent += `${err.relpath || '?'}: ${err.error}\n`;
    if (cnt) cnt.textContent = String(progress.errors.length);
    emit('error', err);
  }

  // ---------- pickFolder ----------

  async function pickFolder() {
    if (window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker();
        emit('pick', { method: 'fsa', name: handle.name });
        return parseProject(handle);
      } catch (err) {
        if (err && err.name === 'AbortError') return null;
        pushError({ relpath: '(picker)', error: err.message || String(err) });
        return null;
      }
    }
    // Safari fallback
    return new Promise((resolve) => {
      const input = $('[data-fallback]');
      input.value = '';
      const onChange = async () => {
        input.removeEventListener('change', onChange);
        if (!input.files || input.files.length === 0) { resolve(null); return; }
        emit('pick', { method: 'webkitdirectory', count: input.files.length });
        const result = await parseProject(input.files);
        resolve(result);
      };
      input.addEventListener('change', onChange);
      input.click();
    });
  }

  // ---------- parseProject ----------

  async function parseProject(input) {
    setPhase('parsing');
    const msgEl     = $('[data-msg]');
    const barEl     = $('[data-bar]');
    const currentEl = $('[data-current]');
    msgEl.textContent = 'Walking tree…';
    barEl.style.width = '0%';

    // 1. enumerate every file under the picked root
    entries = [];
    progress.errors.length = 0;
    try {
      if (input && typeof input === 'object' && typeof input.values === 'function') {
        // FileSystemDirectoryHandle
        for await (const e of walkDirectoryHandle(input)) {
          if (safeRel(e.relpath)) entries.push(e);
        }
      } else if (input && typeof input.length === 'number' && typeof input.item === 'function') {
        // FileList
        entries = fileListToEntries(input).filter(e => safeRel(e.relpath));
      } else if (Array.isArray(input)) {
        entries = input.filter(e => safeRel(e.relpath));
      } else {
        throw new Error('parseProject: unsupported input type');
      }
    } catch (err) {
      pushError({ relpath: '(walk)', error: err.message || String(err) });
      emit('error', { phase: 'walk', error: err.message });
      setPhase('pre-pick');
      return null;
    }

    // 2. Find the .ipj. There MUST be exactly one for a valid project
    const ipjEntry = entries.find(e => extOf(e.relpath) === 'ipj');
    if (!ipjEntry) {
      pushError({ relpath: '(no .ipj)', error: 'no .ipj project file found in folder' });
      emit('error', { phase: 'no-ipj' });
      setPhase('pre-pick');
      return null;
    }

    // Filter to just the parseable Inventor files for the heavy loop
    const inv = entries.filter(e => META_EXTS.has(extOf(e.relpath)));
    progress.total  = inv.length;
    progress.parsed = 0;
    setCounter(`0 / ${inv.length}`);

    // 3. parse the .ipj first
    let projectFile = null;
    try {
      const ab = await ipjEntry.file.arrayBuffer();
      projectFile = {
        relpath: ipjEntry.relpath,
        size:    ipjEntry.file.size,
        parsed:  parseIpj(new Uint8Array(ab)),
      };
    } catch (err) {
      pushError({ relpath: ipjEntry.relpath, error: `ipj parse: ${err.message || err}` });
    }

    // 4. parse every .iam / .ipt sequentially (yielding back to the UI)
    emit('parsing', { total: inv.length });
    msgEl.textContent = 'Parsing Inventor files…';
    const allRelpaths = inv.map(e => e.relpath);
    const components = [];

    for (let i = 0; i < inv.length; i++) {
      if (importState.aborted) {
        emit('cancel', { phase: 'parsing', at: i });
        setPhase('pre-pick');
        return null;
      }
      const e = inv[i];
      const ext = extOf(e.relpath);
      currentEl.textContent = e.relpath;

      let parsed = null;
      let parseError = null;
      try {
        if (ext === 'iam') {
          const ab = await e.file.arrayBuffer();
          parsed = parseIam(new Uint8Array(ab), { name: e.file.name });
        } else if (ext === 'ipt') {
          const ab = await e.file.arrayBuffer();
          parsed = parseIpt(new Uint8Array(ab), { name: e.file.name });
        } else if (ext === 'idw') {
          parsed = { kind: 'drawing', properties: {}, warnings: [] };
        } else if (ext === 'ipn') {
          parsed = { kind: 'presentation', properties: {}, warnings: [] };
        }
      } catch (err) {
        parseError = err.message || String(err);
      }

      let kind = kindFromExt(ext);
      if (parsed && parsed.hasSheetMetal) kind = 'sheet-metal';

      const comp = {
        relpath:       e.relpath,
        name:          e.file.name,
        kind,
        source_format: ext,
        category:      categorize(e.relpath),
        size:          e.file.size,
        parentRelpath: kind === 'assembly' ? null : inferParent(e.relpath, allRelpaths),
        imeta: {
          properties: parsed && parsed.properties ? parsed.properties : {},
          featureCount:  parsed && typeof parsed.featureCount  === 'number' ? parsed.featureCount  : 0,
          hasSheetMetal: !!(parsed && parsed.hasSheetMetal),
          occurrenceCount: parsed && Array.isArray(parsed.occurrences) ? parsed.occurrences.length : 0,
          warnings: parsed && Array.isArray(parsed.warnings) ? parsed.warnings : [],
          parseError,
        },
      };
      components.push(comp);

      if (parseError) pushError({ relpath: e.relpath, error: parseError });

      progress.parsed = i + 1;
      const pct = Math.floor(((i + 1) / Math.max(1, inv.length)) * 100);
      barEl.style.width = pct + '%';
      setCounter(`${i + 1} / ${inv.length}`);
      emit('progress', { phase: 'parsing', parsed: i + 1, total: inv.length, current: e.relpath });

      // Yield every few files so the DOM stays interactive on big projects
      if ((i & 7) === 7) await new Promise(r => setTimeout(r, 0));
    }

    // 5. compute stats
    const stats = {
      total:        components.length,
      assemblies:   components.filter(c => c.kind === 'assembly').length,
      parts:        components.filter(c => c.kind === 'part').length,
      sheetMetal:   components.filter(c => c.kind === 'sheet-metal').length,
      drawings:     components.filter(c => c.kind === 'drawing').length,
      presentations:components.filter(c => c.kind === 'presentation').length,
      custom:       components.filter(c => c.category === 'custom').length,
      standard:     components.filter(c => c.category === 'standard').length,
      vendor:       components.filter(c => c.category === 'vendor').length,
      vendorGroups: new Set(
        components.filter(c => c.category === 'vendor')
          .map(c => c.relpath.split(/[\\/]/).slice(0, 3).join('/'))
      ).size,
      parseErrors:  progress.errors.length,
    };

    manifest = { projectFile, components, stats };

    // Charge the meter for the parse work — bill at sonnet.
    if (meter && typeof meter.charge === 'function') {
      const tokensIn  = Math.ceil(components.length / 10);
      const tokensOut = Math.ceil(components.length / 5);
      try {
        await meter.charge({
          widget:    'inventor-project-loader',
          method:    'parseProject',
          tokensIn,
          tokensOut,
          modelTier: 'sonnet',
          actor:     opts.app || 'cyclecad',
        });
      } catch { /* metering failures shouldn't break the import */ }
    }

    emit('parsed', { manifest, stats });
    return previewBeforeImport();
  }

  // ---------- previewBeforeImport ----------

  function renderTreePreview(components) {
    // Build a nested tree by relpath
    const root = { name: '/', children: new Map(), kind: 'folder' };
    for (const c of components) {
      const parts = c.relpath.split(/[\\/]/);
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node.children.has(seg)) node.children.set(seg, { name: seg, children: new Map(), kind: 'folder' });
        node = node.children.get(seg);
      }
      node.children.set(parts[parts.length - 1], { name: parts[parts.length - 1], kind: c.kind, category: c.category });
    }

    const treeEl = $('[data-tree]');
    treeEl.innerHTML = '';
    const fmtIcon = (n) => {
      if (n.kind === 'folder')      return n._open ? '▾' : '▸';
      if (n.kind === 'assembly')    return '▣';
      if (n.kind === 'sheet-metal') return '▥';
      if (n.kind === 'drawing')     return '▤';
      return '▦';
    };
    const colorFor = (cat) => cat === 'vendor' ? 'var(--cc-violet,#8B5CF6)' : cat === 'standard' ? 'var(--gold,#D4A843)' : cat === 'custom' ? 'var(--cc-green,#03B188)' : 'var(--cc-muted,#6E7780)';
    function paint(node, depth, parent) {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:6px;padding:2px 0 2px ${depth*14}px;cursor:${node.kind==='folder'?'pointer':'default'}`;
      const icon = document.createElement('span');
      icon.style.cssText = 'width:12px;text-align:center;font-size:11px;color:var(--cc-muted,#6E7780)';
      icon.textContent = fmtIcon(node);
      row.appendChild(icon);
      const label = document.createElement('span');
      label.textContent = node.name;
      label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      row.appendChild(label);
      if (node.category) {
        const tag = document.createElement('span');
        tag.style.cssText = `font:600 9px Inter;letter-spacing:1px;text-transform:uppercase;color:${colorFor(node.category)}`;
        tag.textContent = node.category[0];
        row.appendChild(tag);
      }
      parent.appendChild(row);
      if (node.kind === 'folder') {
        const kids = document.createElement('div');
        // Lazy-render: open the first two levels by default
        node._open = depth < 2;
        kids.style.display = node._open ? '' : 'none';
        row.addEventListener('click', () => {
          node._open = !node._open;
          kids.style.display = node._open ? '' : 'none';
          icon.textContent = fmtIcon(node);
        });
        const sorted = [...node.children.values()].sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const child of sorted) paint(child, depth + 1, kids);
        parent.appendChild(kids);
      }
    }
    const sorted = [...root.children.values()].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of sorted) paint(child, 0, treeEl);
  }

  function renderStats(stats) {
    const cells = [
      { label: 'TOTAL',      value: stats.total,        accent: 'var(--cc-fg,#0F1416)' },
      { label: 'ASSEMBLIES', value: stats.assemblies,   accent: 'var(--cc-accent,#7C3AED)' },
      { label: 'PARTS',      value: stats.parts + stats.sheetMetal, accent: 'var(--cc-green,#03B188)' },
      { label: 'VENDOR',     value: `${stats.vendor} / ${stats.vendorGroups} grp`, accent: 'var(--cc-violet,#8B5CF6)' },
    ];
    const cell = (c) => `<div style="background:var(--cc-cream,#F4F1EA);border-top:3px solid ${c.accent};border-radius:4px;padding:10px"><div style="font:600 9px Inter;letter-spacing:2px;color:var(--cc-muted,#6E7780)">${c.label}</div><div style="font:700 22px Georgia,serif;margin-top:4px;color:var(--cc-fg,#0F1416)">${c.value}</div></div>`;
    $('[data-stats]').innerHTML = cells.map(cell).join('');
  }

  function previewBeforeImport() {
    if (!manifest) return null;
    setPhase('preview');
    setCounter(`${manifest.stats.total} components ready`);
    renderStats(manifest.stats);
    renderTreePreview(manifest.components);

    const projectName =
      (manifest.projectFile && manifest.projectFile.parsed && manifest.projectFile.parsed.name) ||
      (manifest.projectFile && manifest.projectFile.relpath
        ? manifest.projectFile.relpath.split(/[\\/]/).pop().replace(/\.ipj$/i, '')
        : 'Imported project');
    $('[data-pname]').value = projectName;

    emit('preview', { stats: manifest.stats });
    return manifest;
  }

  // ---------- importToServer ----------

  async function importToServer({ tenantId, projectName } = {}) {
    if (!manifest) throw new Error('nothing to import — call parseProject first');
    importState = { aborted: false };

    const pname  = projectName || $('[data-pname]').value.trim() || 'Imported project';
    const tenant = tenantId   || $('[data-tenant]').value || 'default';

    setPhase('importing');
    $('[data-imp-msg]').textContent = `Creating project record…`;
    $('[data-imp-bar]').style.width = '0%';

    // Build the manifest payload — strip the File handles before sending
    const payload = {
      tenantId: tenant,
      projectName: pname,
      manifest: {
        projectFile: manifest.projectFile ? {
          relpath: manifest.projectFile.relpath,
          size:    manifest.projectFile.size,
          parsed: {
            name:          manifest.projectFile.parsed?.name,
            workspacePath: manifest.projectFile.parsed?.workspacePath,
            options:       manifest.projectFile.parsed?.options,
          },
        } : null,
        components: manifest.components.map(c => ({
          relpath:       c.relpath,
          name:          c.name,
          kind:          c.kind,
          source_format: c.source_format,
          category:      c.category,
          parentRelpath: c.parentRelpath,
          imeta:         c.imeta,
        })),
        stats: manifest.stats,
      },
    };

    let createResp;
    try {
      const r = await fetch('/api/library/projects/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant-id': tenant },
        body: JSON.stringify(payload),
      });
      createResp = await r.json();
      if (!r.ok || !createResp.ok) throw new Error(createResp.error || `HTTP ${r.status}`);
    } catch (err) {
      pushError({ relpath: '(import)', error: err.message });
      emit('error', { phase: 'create-project', error: err.message });
      setPhase('preview');
      return null;
    }

    const projectId    = createResp.projectId;
    const componentIds = createResp.componentIds || {};

    // Stream every parsed Inventor file
    const fileEntries = entries.filter(e => META_EXTS.has(extOf(e.relpath)));
    const total = fileEntries.length;
    let done = 0;

    for (const e of fileEntries) {
      if (importState.aborted) {
        emit('cancel', { phase: 'importing', at: done });
        break;
      }
      const componentId = componentIds[e.relpath.replace(/\\/g, '/')];
      if (!componentId) { done++; continue; }
      $('[data-imp-current]').textContent = e.relpath;
      try {
        await streamFile(componentId, e.file);
      } catch (err) {
        pushError({ relpath: e.relpath, error: `upload: ${err.message}` });
      }
      done++;
      const pct = Math.floor((done / total) * 100);
      $('[data-imp-bar]').style.width = pct + '%';
      $('[data-imp-msg]').textContent = `Uploading ${done} / ${total}`;
      emit('progress', { phase: 'importing', parsed: done, total, current: e.relpath });
    }

    if (!importState.aborted) {
      // Kick the (stub) derivation so derived/ has something for the UI
      try {
        await fetch(`/api/library/projects/${projectId}/derive`, {
          method: 'POST',
          headers: { 'x-tenant-id': tenant },
        });
      } catch { /* non-fatal */ }
      emit('imported', { projectId, tenantId: tenant, stats: manifest.stats });
      setPhase('done');
      $('[data-imp-msg]').textContent = `Imported ${total} files into project #${projectId}`;
      $('[data-imp-bar]').style.width = '100%';
    }

    return { projectId, componentIds, stats: manifest.stats };
  }

  // ---------- streamFile ----------

  async function streamFile(componentId, file) {
    if (!componentId || !file) throw new Error('streamFile: id + file required');
    const fd = new FormData();
    fd.append('file', file, file.name);
    const r = await fetch(`/api/library/components/${encodeURIComponent(componentId)}/upload`, {
      method: 'POST',
      body: fd,
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try { const j = await r.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  // ---------- cancel ----------

  function cancelImport() {
    importState.aborted = true;
    emit('cancel', { phase });
  }

  function getProgress() {
    return {
      phase,
      parsed: progress.parsed,
      total:  progress.total,
      errors: progress.errors.slice(),
    };
  }

  // ---------- wire up DOM ----------

  const drop = $('[data-drop]');

  track(drop, 'click', () => pickFolder());
  track(drop, 'dragover', (e) => {
    e.preventDefault();
    drop.style.background = 'rgba(124,58,237,0.08)';
  });
  track(drop, 'dragleave', () => { drop.style.background = ''; });
  track(drop, 'drop', async (e) => {
    e.preventDefault();
    drop.style.background = '';
    // Modern API: each item may expose getAsFileSystemHandle()
    const items = e.dataTransfer && e.dataTransfer.items;
    if (items && items.length > 0 && typeof items[0].getAsFileSystemHandle === 'function') {
      try {
        const handle = await items[0].getAsFileSystemHandle();
        if (handle && handle.kind === 'directory') {
          emit('pick', { method: 'drop-fsa', name: handle.name });
          return parseProject(handle);
        }
      } catch { /* fall through */ }
    }
    // Fallback: try DataTransferItem getAsEntry walk
    const fileList = e.dataTransfer && e.dataTransfer.files;
    if (fileList && fileList.length > 0) {
      emit('pick', { method: 'drop-files', count: fileList.length });
      return parseProject(fileList);
    }
  });

  track($('[data-cancel]'), 'click', () => {
    cancelImport();
    setPhase('pre-pick');
    manifest = null; entries = [];
    progress.errors.length = 0;
    progress.parsed = 0; progress.total = 0;
  });
  track($('[data-import]'),     'click', () => importToServer());
  track($('[data-cancel-imp]'), 'click', () => { cancelImport(); setPhase('preview'); });

  // ---------- handle ----------

  return {
    api: {
      pickFolder,
      parseProject,
      previewBeforeImport,
      importToServer,
      streamFile,
      cancelImport,
      getProgress,
      getManifest: () => manifest,
      getEntries:  () => entries.slice(),
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      cancelImport();
      trackedListeners.forEach(({ target, type, fn }) => target.removeEventListener(type, fn));
      trackedListeners.length = 0;
      wrap.remove();
    },
  };
}
