/**
 * @file widgets/offline-queue.js
 * @description Offline queue for Pentacad NGC programs. Stores queued runs in
 *   localStorage and mirrors the writes to the server (`/api/library/offline-queue`)
 *   when the meter API is reachable. Resume-from-interrupt is supported by
 *   capturing `currentLine` whenever the host pumps progress in.
 *
 *   Pure ESM. Browser-only at runtime.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const WIDGET = 'offline-queue';

export const STORAGE_KEY = 'cyclecad.offline-queue.v1';

/**
 * @typedef {{
 *   id:string,
 *   programId?:string,
 *   name?:string,
 *   ngc:string,
 *   machineId:string,
 *   status:'queued'|'running'|'paused'|'done'|'failed',
 *   createdAt:number,
 *   startedAt?:number,
 *   finishedAt?:number,
 *   currentLine?:number,
 *   errorMessage?:string,
 * }} QueueEntry
 */

/**
 * Read the queue from localStorage. Returns [] when storage is empty or
 * corrupt. Never throws.
 * @returns {QueueEntry[]}
 */
export function readStorage() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * Write the queue to localStorage. Best-effort.
 * @param {QueueEntry[]} entries
 */
export function writeStorage(entries) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries || []));
  } catch { /* quota or disabled — drop silently */ }
}

/**
 * Generate a short id for new queue entries.
 * @returns {string}
 */
function newId() {
  const r = Math.random().toString(36).slice(2, 10);
  return `q_${Date.now().toString(36)}_${r}`;
}

const STYLE = `
.pt-offline-queue{padding:18px 20px;font:13px Inter,sans-serif;color:#0F172A;background:#fff;border:1px solid #E5E7EB;border-radius:8px;max-width:880px}
.pt-offline-queue h2{font:600 22px Georgia;margin:0 0 4px 0}
.pt-offline-queue .kicker{font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px}
.pt-offline-queue .desc{font-size:12px;color:#475569;margin-bottom:14px}
.pt-offline-queue table{width:100%;border-collapse:collapse;font-size:12px}
.pt-offline-queue th,.pt-offline-queue td{padding:6px 8px;border-bottom:1px solid #E5E7EB;text-align:left;vertical-align:middle}
.pt-offline-queue th{font:600 10px Inter;color:#475569;letter-spacing:1px;text-transform:uppercase;background:#F8FAFC}
.pt-offline-queue tr.dragging{opacity:.5}
.pt-offline-queue .pill{display:inline-block;padding:2px 8px;border-radius:999px;font:600 10px Inter;letter-spacing:1px;text-transform:uppercase}
.pt-offline-queue .pill.queued{background:#e0e7ff;color:#3730A3}
.pt-offline-queue .pill.running{background:#dcfce7;color:#166534}
.pt-offline-queue .pill.paused{background:#fef3c7;color:#92400e}
.pt-offline-queue .pill.done{background:#dbeafe;color:#1e40af}
.pt-offline-queue .pill.failed{background:#fee2e2;color:#991b1b}
.pt-offline-queue .menu{position:relative;display:inline-block}
.pt-offline-queue .menu button.kebab{background:#fff;border:1px solid #d1d5db;color:#0F172A;border-radius:4px;padding:2px 8px;cursor:pointer;font:600 12px Inter}
.pt-offline-queue .menu .pop{position:absolute;right:0;top:24px;background:#fff;border:1px solid #d1d5db;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,.06);padding:4px 0;min-width:140px;z-index:9}
.pt-offline-queue .menu .pop button{display:block;width:100%;text-align:left;padding:6px 10px;font:500 12px Inter;background:#fff;border:0;color:#0F172A;cursor:pointer}
.pt-offline-queue .menu .pop button:hover{background:#f1f5f9}
.pt-offline-queue button.add{background:#7C3AED;color:#fff;border:0;border-radius:4px;padding:8px 14px;font:600 12px Inter;cursor:pointer;margin-bottom:10px}
.pt-offline-queue .empty{font:italic 12px Inter;color:#94a3b8;padding:18px;text-align:center;background:#F8FAFC;border-radius:6px}
`;

/**
 * @param {{ mount:string|HTMLElement, app?:string,
 *           meter?:{ charge:Function },
 *           params?:{ machineId?:string, autoSync?:boolean,
 *                     fetch?:Function, baseUrl?:string } }} opts
 * @returns {Promise<{ api:object, on:Function, destroy:Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);

  /** @type {QueueEntry[]} */
  let entries = readStorage();
  const baseUrl = opts?.params?.baseUrl || '';
  const fetchImpl = opts?.params?.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const autoSync = opts?.params?.autoSync !== false;
  const defaultMachineId = opts?.params?.machineId || 'penta-v2-50';

  /** @type {Record<string, Function[]>} */
  const listeners = { start: [], pause: [], resume: [], done: [], failed: [], change: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const dom = document.createElement('div');
  dom.className = 'pt-offline-queue';
  root.appendChild(dom);

  function persist() {
    writeStorage(entries);
    emit('change', { entries: [...entries] });
  }

  async function postEntry(entry) {
    if (!autoSync || !fetchImpl) return;
    try {
      await fetchImpl(`${baseUrl}/api/library/offline-queue`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (err) { /* offline — keep in localStorage */ emit('error', err); }
  }

  async function patchEntry(id, patch) {
    if (!autoSync || !fetchImpl) return;
    try {
      await fetchImpl(`${baseUrl}/api/library/offline-queue/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (err) { emit('error', err); }
  }

  async function deleteEntry(id) {
    if (!autoSync || !fetchImpl) return;
    try {
      await fetchImpl(`${baseUrl}/api/library/offline-queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) { emit('error', err); }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function render() {
    const rows = entries.map(e => `
      <tr draggable="true" data-id="${escapeHtml(e.id)}">
        <td style="font:11px Menlo,monospace">${escapeHtml(e.id)}</td>
        <td>${escapeHtml(e.name || '—')}</td>
        <td>${escapeHtml(e.machineId || '—')}</td>
        <td><span class="pill ${e.status}">${e.status}</span></td>
        <td>${e.currentLine != null ? e.currentLine : '—'}</td>
        <td>
          <div class="menu">
            <button class="kebab" data-kebab="${escapeHtml(e.id)}">⋮</button>
          </div>
        </td>
      </tr>
    `).join('');

    dom.innerHTML = `
      <style>${STYLE}</style>
      <div class="kicker">CAM · OFFLINE QUEUE</div>
      <h2>queued programs</h2>
      <div class="desc">Stored locally in <code>localStorage.${STORAGE_KEY}</code> and mirrored to <code>/api/library/offline-queue</code>. Drag rows to reorder.</div>
      <button class="add" data-add>+ ADD PROGRAM</button>
      ${entries.length === 0 ? `<div class="empty">queue is empty — drop a .ngc file or add one above</div>` : `
      <table>
        <thead><tr><th>id</th><th>name</th><th>machine</th><th>status</th><th>line</th><th></th></tr></thead>
        <tbody data-tbody>${rows}</tbody>
      </table>
      `}
    `;
    wire();
  }

  function wire() {
    const addBtn = dom.querySelector('[data-add]');
    if (addBtn) addBtn.addEventListener('click', () => promptAdd());
    dom.querySelectorAll('[data-kebab]').forEach(b => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = ev.currentTarget.getAttribute('data-kebab');
        showMenu(id, ev.currentTarget);
      });
    });
    dom.querySelectorAll('tr[draggable]').forEach(tr => {
      tr.addEventListener('dragstart', (ev) => { tr.classList.add('dragging'); ev.dataTransfer.effectAllowed='move'; });
      tr.addEventListener('dragend',   () => tr.classList.remove('dragging'));
      tr.addEventListener('dragover',  (ev) => { ev.preventDefault(); });
      tr.addEventListener('drop',      (ev) => {
        ev.preventDefault();
        const dragging = dom.querySelector('tr.dragging');
        if (!dragging || dragging === tr) return;
        const fromId = dragging.getAttribute('data-id');
        const toId = tr.getAttribute('data-id');
        reorder(fromId, toId);
      });
    });
  }

  function showMenu(id, anchor) {
    document.querySelectorAll('.pt-offline-queue .pop').forEach(p => p.remove());
    const menu = anchor.parentElement;
    const pop = document.createElement('div');
    pop.className = 'pop';
    pop.innerHTML = `
      <button data-act="start">▶ start</button>
      <button data-act="pause">⏸ pause</button>
      <button data-act="resume">⏵ resume</button>
      <button data-act="inspect">🔍 inspect</button>
      <button data-act="delete" style="color:#E11D48">✕ delete</button>
    `;
    menu.appendChild(pop);
    pop.addEventListener('click', (ev) => {
      const act = ev.target.getAttribute('data-act');
      if (!act) return;
      pop.remove();
      handleAction(id, act);
    });
    setTimeout(() => {
      const off = (e) => { if (!menu.contains(e.target)) { pop.remove(); document.removeEventListener('click', off); } };
      document.addEventListener('click', off);
    }, 0);
  }

  function handleAction(id, act) {
    switch (act) {
      case 'start':   start(id); break;
      case 'pause':   pause(id); break;
      case 'resume': {
        const e = get(id); resume(id, e?.currentLine || 0); break;
      }
      case 'delete':  remove(id); break;
      case 'inspect': emit('change', { kind: 'inspect', entry: get(id) }); break;
    }
  }

  function promptAdd() {
    if (typeof prompt === 'undefined') return;
    const name = prompt('program name', 'untitled.ngc');
    if (name == null) return;
    const ngc = prompt('NGC source (paste here)', '(empty)');
    if (ngc == null) return;
    add({ name, ngc, machineId: defaultMachineId });
  }

  function reorder(fromId, toId) {
    const ix = entries.findIndex(e => e.id === fromId);
    const iy = entries.findIndex(e => e.id === toId);
    if (ix < 0 || iy < 0) return;
    const [moved] = entries.splice(ix, 1);
    entries.splice(iy, 0, moved);
    persist();
    render();
  }

  // ── public API ─────────────────────────────────────────────────────────
  function add(payload) {
    const e = {
      id: newId(),
      programId: payload.programId,
      name: payload.name || 'untitled',
      ngc: String(payload.ngc || ''),
      machineId: payload.machineId || defaultMachineId,
      status: 'queued',
      createdAt: Date.now(),
      currentLine: 0,
    };
    entries.push(e);
    persist();
    postEntry(e);
    render();
    return e.id;
  }

  function start(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return false;
    e.status = 'running';
    e.startedAt = Date.now();
    persist();
    patchEntry(id, { status: 'running', startedAt: e.startedAt });
    emit('start', { entry: { ...e } });
    render();
    return true;
  }

  function pause(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return false;
    e.status = 'paused';
    persist();
    patchEntry(id, { status: 'paused', currentLine: e.currentLine });
    emit('pause', { entry: { ...e } });
    render();
    return true;
  }

  function resume(id, fromLine) {
    const e = entries.find(x => x.id === id);
    if (!e) return false;
    if (typeof fromLine === 'number') e.currentLine = fromLine;
    e.status = 'running';
    persist();
    patchEntry(id, { status: 'running', currentLine: e.currentLine });
    emit('resume', { entry: { ...e }, fromLine: e.currentLine });
    render();
    return true;
  }

  function done(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return false;
    e.status = 'done';
    e.finishedAt = Date.now();
    persist();
    patchEntry(id, { status: 'done', finishedAt: e.finishedAt });
    emit('done', { entry: { ...e } });
    render();
    return true;
  }

  function fail(id, msg) {
    const e = entries.find(x => x.id === id);
    if (!e) return false;
    e.status = 'failed';
    e.errorMessage = String(msg || 'unknown');
    e.finishedAt = Date.now();
    persist();
    patchEntry(id, { status: 'failed', errorMessage: e.errorMessage, finishedAt: e.finishedAt });
    emit('failed', { entry: { ...e } });
    render();
    return true;
  }

  function remove(id) {
    const ix = entries.findIndex(x => x.id === id);
    if (ix < 0) return false;
    entries.splice(ix, 1);
    persist();
    deleteEntry(id);
    render();
    return true;
  }

  function setLine(id, line) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    e.currentLine = Number(line) || 0;
    persist();
  }

  function get(id) {
    const e = entries.find(x => x.id === id);
    return e ? { ...e } : null;
  }

  function list(filter) {
    if (!filter) return entries.map(e => ({ ...e }));
    return entries
      .filter(e => (!filter.status || e.status === filter.status)
                && (!filter.machineId || e.machineId === filter.machineId))
      .map(e => ({ ...e }));
  }

  function clearAll() {
    entries = [];
    persist();
    render();
  }

  render();

  return {
    api: { add, start, pause, resume, done, fail, remove, setLine, get, list, clearAll },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
