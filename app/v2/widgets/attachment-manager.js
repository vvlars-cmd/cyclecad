/**
 * @file widgets/attachment-manager.js
 * @description Drag-drop attachment panel for a library project — PDFs,
 *   photos, and short text notes attached to a component or assembly.
 *   Top of the panel is a drop zone; below is a grid of cards, each with
 *   a thumbnail (image) / icon (PDF) / snippet (text) and hover actions
 *   for preview, download, and delete.
 *
 *   Contract:
 *     init({ mount, app, meter, params? }) → { api, on, destroy }
 *     api.addAttachment(file)        accepts a `File` object
 *                                    POST /api/library/attachments
 *     api.removeAttachment(id)
 *     api.previewAttachment(id)      opens a modal preview
 *     api.listAttachments()          → array
 *     api.setProject(projectId)
 *
 *   Events: 'add' · 'remove' · 'preview' · 'change' · 'error'.
 *
 *   The widget is dependency-free. In standalone mode (no /api/library
 *   reachable) it stores files in-memory using object URLs so the user
 *   can still preview and remove them locally.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const ENDPOINT_LIST   = (pid) => `/api/library/attachments?project=${encodeURIComponent(pid)}`;
const ENDPOINT_UPLOAD = '/api/library/attachments';
const ENDPOINT_DELETE = (id) => `/api/library/attachments/${encodeURIComponent(id)}`;

function classifyFile(file) {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (t.startsWith('text/') || n.endsWith('.txt') || n.endsWith('.md')) return 'text';
  return 'binary';
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024)        return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Mount the attachment manager panel.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { projectId?: string|number, componentId?: string|number }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     addAttachment: (file: File) => Promise<object>,
 *     removeAttachment: (id: string|number) => Promise<void>,
 *     previewAttachment: (id: string|number) => void,
 *     listAttachments: () => Array<object>,
 *     setProject: (projectId: string|number) => Promise<void>
 *   },
 *   on: (event: 'add'|'remove'|'preview'|'change'|'error', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('attachment-manager: mount not found');

  const params = opts.params || {};
  const meter  = opts.meter;

  const wrap = document.createElement('div');
  wrap.className = 'pt-attachment-manager';
  wrap.style.cssText = `
    font: 13px/1.4 Inter, -apple-system, sans-serif; color: var(--pt-ink, #0F1416);
    background: #FFFFFF; border: 1px solid var(--pt-rule, #D6D9DD);
    border-radius: var(--pt-radius, 4px); width: 480px; min-height: 340px;
    display: flex; flex-direction: column; overflow: hidden;
  `;
  wrap.innerHTML = `
    <header style="padding:10px 12px;background:var(--pt-cream,#F4F1EA);border-bottom:1px solid var(--pt-rule,#D6D9DD);display:flex;align-items:end;justify-content:space-between">
      <div>
        <div style="font:600 11px Inter;letter-spacing:2px;color:var(--pt-muted,#6E7780);text-transform:uppercase">ATTACHMENTS</div>
        <div data-project style="font:600 14px Georgia,serif;margin-top:2px">—</div>
      </div>
      <span data-count style="font:600 10px Inter;letter-spacing:1px;color:var(--pt-muted,#6E7780)">0 files</span>
    </header>
    <div data-drop style="margin:10px;padding:18px;border:2px dashed var(--pt-rule,#D6D9DD);border-radius:6px;text-align:center;color:var(--pt-muted,#6E7780);font:12px Inter;cursor:pointer;transition:all .15s">
      <div style="font-size:22px;margin-bottom:4px">⇪</div>
      <div>drag PDFs, photos, or notes here · or <strong style="color:var(--pt-green,#03B188)">browse</strong></div>
      <input data-file type=file multiple style="display:none">
    </div>
    <div data-grid style="flex:1;overflow:auto;padding:6px 10px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;align-content:start"></div>
    <footer data-status style="padding:5px 10px;font:10px Menlo,monospace;color:var(--pt-muted,#6E7780);border-top:1px solid var(--pt-rule,#D6D9DD);background:var(--pt-cream,#F4F1EA)"></footer>
  `;
  root.appendChild(wrap);

  const $ = (s) => wrap.querySelector(s);
  const projectEl = $('[data-project]');
  const countEl   = $('[data-count]');
  const dropEl    = $('[data-drop]');
  const fileEl    = $('[data-file]');
  const gridEl    = $('[data-grid]');
  const statusEl  = $('[data-status]');

  // ---------- state ----------
  const listeners = { change: [], add: [], remove: [], preview: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });
  const tracked = [];
  function track(target, type, fn, opts) { target.addEventListener(type, fn, opts); tracked.push({ target, type, fn, opts }); }

  /** @type {Array<{id:string,name:string,size:number,type:string,kind:string,project:string,url?:string,text?:string,createdAt:string}>} */
  let attachments = [];
  let projectId = params.projectId || 'demo';
  let modalEl = null;
  /** url → revoke on destroy */
  const objectUrls = new Set();

  projectEl.textContent = projectId;

  function setStatus(msg) { statusEl.textContent = msg; }
  function updateCount() { countEl.textContent = `${attachments.length} file${attachments.length === 1 ? '' : 's'}`; }

  // ---------- card render ----------
  function thumbnail(att) {
    if (att.kind === 'image' && att.url) {
      return `<img src="${att.url}" alt="" style="width:100%;height:88px;object-fit:cover;border-radius:3px;background:#000">`;
    }
    if (att.kind === 'pdf') {
      return `<div style="height:88px;display:flex;align-items:center;justify-content:center;background:rgba(225,29,72,.08);border:1px solid rgba(225,29,72,.18);border-radius:3px;color:var(--pt-rose,#E11D48);font:700 22px Georgia">PDF</div>`;
    }
    if (att.kind === 'text') {
      const snippet = (att.text || '').slice(0, 80) || '(empty)';
      return `<div style="height:88px;padding:6px 8px;background:rgba(212,168,67,.10);border:1px solid rgba(212,168,67,.25);border-radius:3px;color:var(--pt-ink,#0F1416);font:11px/1.3 Menlo,monospace;overflow:hidden">${esc(snippet)}</div>`;
    }
    return `<div style="height:88px;display:flex;align-items:center;justify-content:center;background:rgba(110,119,128,.10);border:1px solid var(--pt-rule,#D6D9DD);border-radius:3px;color:var(--pt-muted,#6E7780);font:600 14px Inter">FILE</div>`;
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    if (attachments.length === 0) {
      gridEl.innerHTML = '<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--pt-muted,#6E7780);font:italic 12px Inter">no attachments yet — drop a file above</div>';
      updateCount();
      return;
    }
    attachments.forEach(att => {
      const card = document.createElement('div');
      card.dataset.id = att.id;
      card.style.cssText = `
        position:relative;background:#fff;border:1px solid var(--pt-rule,#D6D9DD);
        border-radius:4px;padding:6px;cursor:pointer;transition:box-shadow .12s;
      `;
      card.innerHTML = `
        ${thumbnail(att)}
        <div style="margin-top:6px;font:600 11px Inter;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(att.name)}">${esc(att.name)}</div>
        <div style="font:10px Menlo,monospace;color:var(--pt-muted,#6E7780)">${fmtBytes(att.size)} · ${att.kind}</div>
        <div data-actions style="position:absolute;top:8px;right:8px;display:flex;gap:4px;opacity:0;transition:opacity .12s">
          <button data-act="preview"  title="Preview"  style="${actionBtnCss('var(--pt-green,#03B188)')}">👁</button>
          <button data-act="download" title="Download" style="${actionBtnCss('var(--pt-violet,#8B5CF6)')}">⤓</button>
          <button data-act="delete"   title="Delete"   style="${actionBtnCss('var(--pt-rose,#E11D48)')}">×</button>
        </div>
      `;
      const actionsEl = card.querySelector('[data-actions]');
      card.addEventListener('mouseenter', () => { card.style.boxShadow = 'var(--pt-elev-1,0 1px 2px rgba(0,0,0,.08))'; actionsEl.style.opacity = '1'; });
      card.addEventListener('mouseleave', () => { card.style.boxShadow = ''; actionsEl.style.opacity = '0'; });
      card.addEventListener('click', (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (act === 'preview')  { previewAttachment(att.id); return; }
        if (act === 'download') { downloadAttachment(att.id); return; }
        if (act === 'delete')   { removeAttachment(att.id); return; }
        previewAttachment(att.id);
      });
      gridEl.appendChild(card);
    });
    updateCount();
  }

  function actionBtnCss(color) {
    return `background:${color};color:#fff;border:none;width:22px;height:22px;border-radius:11px;cursor:pointer;font:600 12px Inter;line-height:1;padding:0`;
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ---------- modal preview ----------
  function openPreview(att) {
    closePreview();
    modalEl = document.createElement('div');
    modalEl.style.cssText = `
      position:fixed;inset:0;background:rgba(15,20,22,.75);z-index:10001;
      display:flex;align-items:center;justify-content:center;padding:24px;
    `;
    const inner = document.createElement('div');
    inner.style.cssText = `
      background:#fff;border-radius:6px;max-width:80vw;max-height:80vh;
      display:flex;flex-direction:column;overflow:hidden;font:13px Inter;
    `;
    inner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--pt-rule,#D6D9DD);background:var(--pt-cream,#F4F1EA)">
        <div style="font:600 13px Georgia">${esc(att.name)}</div>
        <button data-close style="background:transparent;border:none;font-size:18px;cursor:pointer;color:var(--pt-muted,#6E7780)">×</button>
      </div>
      <div data-body style="padding:14px;overflow:auto;min-width:380px;min-height:200px"></div>
    `;
    const body = inner.querySelector('[data-body]');
    if (att.kind === 'image' && att.url) {
      body.innerHTML = `<img src="${att.url}" style="max-width:70vw;max-height:60vh;display:block;margin:0 auto">`;
    } else if (att.kind === 'pdf' && att.url) {
      body.innerHTML = `<iframe src="${att.url}" style="width:70vw;height:60vh;border:1px solid var(--pt-rule,#D6D9DD)"></iframe>`;
    } else if (att.kind === 'text') {
      body.innerHTML = `<pre style="font:12px/1.5 Menlo,monospace;white-space:pre-wrap;max-width:60vw">${esc(att.text || '(empty)')}</pre>`;
    } else {
      body.innerHTML = `<div style="text-align:center;color:var(--pt-muted,#6E7780)">no inline preview · ${fmtBytes(att.size)}</div>`;
    }
    inner.querySelector('[data-close]').addEventListener('click', closePreview);
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closePreview(); });
    modalEl.appendChild(inner);
    document.body.appendChild(modalEl);
  }
  function closePreview() { if (modalEl) { modalEl.remove(); modalEl = null; } }

  // ---------- network helpers ----------
  async function uploadToServer(file) {
    const fd = new FormData();
    fd.append('project', projectId);
    fd.append('file', file);
    try {
      const r = await fetch(ENDPOINT_UPLOAD, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();   // { id, url, ... }
    } catch (e) {
      emit('error', { kind: 'upload', error: e?.message || String(e) });
      return null;
    }
  }
  async function deleteOnServer(id) {
    try {
      const r = await fetch(ENDPOINT_DELETE(id), { method: 'DELETE' });
      return r.ok;
    } catch { return false; }
  }

  async function readText(file) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => resolve('');
      r.readAsText(file);
    });
  }

  // ---------- API ----------
  async function addAttachment(file) {
    if (!file || !file.name) {
      emit('error', { kind: 'add', error: 'invalid file' });
      return null;
    }
    if (meter && typeof meter.charge === 'function') {
      try {
        await meter.charge({
          widget: 'attachment-manager',
          kind: 'addAttachment',
          tokensIn: Math.max(1, Math.ceil((file.size || 0) / 4096)),
          tokensOut: 1,
          modelTier: 'haiku',
        });
      } catch {}
    }
    const kind = classifyFile(file);
    const local = {
      id: 'att_' + Math.random().toString(36).slice(2, 10),
      name: file.name,
      size: file.size || 0,
      type: file.type || '',
      kind,
      project: projectId,
      createdAt: new Date().toISOString(),
    };
    if (kind === 'image' || kind === 'pdf') {
      try {
        local.url = URL.createObjectURL(file);
        objectUrls.add(local.url);
      } catch {}
    }
    if (kind === 'text') local.text = await readText(file);

    const server = await uploadToServer(file);
    if (server && server.id) { local.id = server.id; if (server.url) local.url = server.url; }

    attachments = [local, ...attachments];
    renderGrid();
    setStatus(`added ${file.name}`);
    emit('add', { id: local.id, name: local.name, kind: local.kind });
    emit('change', { kind: 'add', id: local.id });
    return local;
  }

  async function removeAttachment(id) {
    const idx = attachments.findIndex(a => a.id === id);
    if (idx < 0) return false;
    const att = attachments[idx];
    if (att.url && objectUrls.has(att.url)) { try { URL.revokeObjectURL(att.url); } catch {} objectUrls.delete(att.url); }
    attachments.splice(idx, 1);
    renderGrid();
    deleteOnServer(id).catch(() => {});
    setStatus(`removed ${att.name}`);
    emit('remove', { id });
    emit('change', { kind: 'remove', id });
    return true;
  }

  function previewAttachment(id) {
    const att = attachments.find(a => a.id === id);
    if (!att) return;
    openPreview(att);
    emit('preview', { id });
    emit('change', { kind: 'preview', id });
  }

  function downloadAttachment(id) {
    const att = attachments.find(a => a.id === id);
    if (!att || !att.url) return;
    const a = document.createElement('a');
    a.href = att.url;
    a.download = att.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function listAttachments() {
    return attachments.map(a => ({ id: a.id, name: a.name, size: a.size, kind: a.kind, type: a.type, project: a.project, createdAt: a.createdAt }));
  }

  function setProject(pid) {
    projectId = String(pid || 'demo');
    projectEl.textContent = projectId;
    setStatus(`project: ${projectId}`);
    emit('change', { kind: 'project', project: projectId });
  }

  // ---------- drag-drop wiring ----------
  function setDropActive(active) {
    dropEl.style.background    = active ? 'rgba(3,177,136,.10)' : '';
    dropEl.style.borderColor   = active ? 'var(--pt-green,#03B188)' : 'var(--pt-rule,#D6D9DD)';
    dropEl.style.color         = active ? 'var(--pt-green-dark,#028F6D)' : 'var(--pt-muted,#6E7780)';
  }

  track(dropEl, 'dragover', (e) => { e.preventDefault(); setDropActive(true); });
  track(dropEl, 'dragleave',(e) => { e.preventDefault(); setDropActive(false); });
  track(dropEl, 'drop',     async (e) => {
    e.preventDefault();
    setDropActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    for (const f of files) await addAttachment(f);
  });
  track(dropEl, 'click',    () => fileEl.click());
  track(fileEl, 'change',   async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await addAttachment(f);
    fileEl.value = '';
  });

  // initial render
  renderGrid();
  setStatus(`ready · ${projectId}`);

  return {
    api: {
      addAttachment,
      removeAttachment,
      previewAttachment,
      listAttachments,
      setProject,
      downloadAttachment,
      getProject: () => projectId,
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      closePreview();
      // Revoke any object URLs we own.
      objectUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
      objectUrls.clear();
      tracked.forEach(({ target, type, fn, opts }) => target.removeEventListener(type, fn, opts));
      tracked.length = 0;
      wrap.remove();
    },
  };
}
