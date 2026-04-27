/**
 * @file widgets/multi-machine-dashboard.js
 * @description Multi-machine dashboard. Aggregates DRO + program state from
 *   one or more bridge connections in a responsive card grid. The widget
 *   owns no WebSocket — the host app feeds snapshots in via
 *   `api.updateMachine(id, snapshot)` and the dashboard re-renders the
 *   matching card.
 *
 *   Pure ESM. Browser-only at runtime.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const WIDGET = 'multi-machine-dashboard';

/**
 * @typedef {{
 *   X?:number, Y?:number, Z?:number, A?:number, B?:number,
 *   F?:number, S?:number, T?:number,
 *   currentLine?:number,
 *   alarm?:string,
 *   connection?:'connected'|'dim'|'offline',
 *   spindleOn?:boolean,
 *   feedOverride?:number,
 *   ts?:number,
 * }} Snapshot
 *
 * @typedef {{ id:string, name:string, bridgeUrl:string, snapshot?:Snapshot }} MachineRow
 */

const STYLE = `
.pt-multi-machine{padding:18px 20px;font:13px Inter,sans-serif;color:#E2E8F0;background:#0F172A;border:1px solid #1E293B;border-radius:8px;max-width:1100px}
.pt-multi-machine h2{font:600 22px Georgia;margin:0 0 4px 0;color:#FACC15}
.pt-multi-machine .kicker{font:600 11px Inter;color:#FACC15;letter-spacing:3px;margin-bottom:6px}
.pt-multi-machine .desc{font-size:12px;color:#94a3b8;margin-bottom:14px}
.pt-multi-machine .grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:14px}
.pt-multi-machine .card{background:rgba(255,255,255,.05);backdrop-filter:blur(8px);border:1px solid #334155;border-radius:8px;padding:14px}
.pt-multi-machine .card.connected{border-color:#10B981}
.pt-multi-machine .card.dim{border-color:#F59E0B}
.pt-multi-machine .card.offline{border-color:#475569;opacity:.6}
.pt-multi-machine .card h3{font:600 14px Inter;margin:0 0 6px 0;color:#fff;display:flex;align-items:center;justify-content:space-between}
.pt-multi-machine .card .url{font:10px Menlo,monospace;color:#94a3b8;margin-bottom:8px;word-break:break-all}
.pt-multi-machine .pill{display:inline-block;padding:2px 8px;border-radius:999px;font:600 10px Inter;letter-spacing:1px;text-transform:uppercase}
.pt-multi-machine .pill.connected{background:#064e3b;color:#6ee7b7}
.pt-multi-machine .pill.dim{background:#78350f;color:#fde68a}
.pt-multi-machine .pill.offline{background:#1e293b;color:#94a3b8}
.pt-multi-machine .pill.alarm{background:#7f1d1d;color:#fecaca}
.pt-multi-machine .dro{font:600 14px Menlo,monospace;color:#FACC15;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 12px;margin-top:6px}
.pt-multi-machine .dro span{display:block;font:600 9px Inter;color:#94a3b8;letter-spacing:1px}
.pt-multi-machine .row{display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-top:6px}
.pt-multi-machine button{background:#7C3AED;color:#fff;border:0;border-radius:4px;padding:6px 10px;font:600 11px Inter;cursor:pointer}
.pt-multi-machine button.ghost{background:transparent;border:1px solid #334155;color:#E2E8F0}
.pt-multi-machine .add{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.pt-multi-machine .add input{background:#0F172A;border:1px solid #334155;color:#E2E8F0;padding:6px 8px;font:12px Inter;border-radius:4px}
.pt-multi-machine .empty{padding:32px;border:1px dashed #334155;border-radius:8px;text-align:center;color:#94a3b8;font:italic 13px Inter}
`;

/**
 * @param {{ mount:string|HTMLElement, app?:string,
 *           meter?:{ charge:Function },
 *           params?:{ machines?:Array<{id:string, name:string, bridgeUrl:string}> } }} opts
 * @returns {Promise<{ api:object, on:Function, destroy:Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);

  /** @type {Map<string, MachineRow>} */
  const machines = new Map();

  for (const m of (opts?.params?.machines || [])) {
    if (m && m.id) machines.set(m.id, { id: m.id, name: m.name || m.id, bridgeUrl: m.bridgeUrl || '', snapshot: undefined });
  }

  /** @type {Record<string, Function[]>} */
  const listeners = { machineAdded: [], machineRemoved: [], snapshot: [], change: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const dom = document.createElement('div');
  dom.className = 'pt-multi-machine';
  root.appendChild(dom);

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  /**
   * @param {MachineRow} m
   * @returns {string}
   */
  function cardHtml(m) {
    const s = m.snapshot || {};
    const conn = s.connection || 'offline';
    const fmt = (v, d = 3) => v == null ? '—' : Number(v).toFixed(d);
    const fmtInt = v => v == null ? '—' : Math.round(Number(v));
    return `
      <div class="card ${conn}" data-card="${escapeHtml(m.id)}">
        <h3>${escapeHtml(m.name)}<span class="pill ${conn}">${conn}</span></h3>
        <div class="url">${escapeHtml(m.bridgeUrl || '(no url)')}</div>
        ${s.alarm ? `<span class="pill alarm">alarm · ${escapeHtml(s.alarm)}</span>` : ''}
        <div class="dro">
          <div><span>X</span>${fmt(s.X)}</div>
          <div><span>Y</span>${fmt(s.Y)}</div>
          <div><span>Z</span>${fmt(s.Z)}</div>
          <div><span>A</span>${fmt(s.A, 2)}</div>
          <div><span>B</span>${fmt(s.B, 2)}</div>
          <div><span>F</span>${fmtInt(s.F)}</div>
          <div><span>S</span>${fmtInt(s.S)}</div>
          <div><span>T</span>${fmtInt(s.T)}</div>
        </div>
        <div class="row">
          <span>line ${s.currentLine != null ? s.currentLine : '—'}</span>
          <span>${s.spindleOn ? 'spindle ON' : 'spindle off'}</span>
        </div>
        <div class="row">
          <button class="ghost" data-act="remove" data-id="${escapeHtml(m.id)}">remove</button>
          <button data-act="open" data-id="${escapeHtml(m.id)}">open</button>
        </div>
      </div>
    `;
  }

  function render() {
    const arr = [...machines.values()];
    dom.innerHTML = `
      <style>${STYLE}</style>
      <div class="kicker">CAM · MULTI-MACHINE DASHBOARD</div>
      <h2>connected machines</h2>
      <div class="desc">Live DRO from each connected bridge. The host app pumps snapshots in via <code>api.updateMachine(id, snapshot)</code>.</div>
      <div class="add">
        <input type="text" placeholder="machine id" data-add-id>
        <input type="text" placeholder="display name" data-add-name>
        <input type="text" placeholder="bridge url (ws://…)" data-add-url style="flex:1;min-width:200px">
        <button data-add-go>+ ADD MACHINE</button>
      </div>
      ${arr.length === 0
        ? `<div class="empty">no machines registered yet — add one above</div>`
        : `<div class="grid">${arr.map(cardHtml).join('')}</div>`}
    `;
    wire();
  }

  function wire() {
    const go = dom.querySelector('[data-add-go]');
    if (go) go.addEventListener('click', () => {
      const id = (dom.querySelector('[data-add-id]')?.value || '').trim();
      const name = (dom.querySelector('[data-add-name]')?.value || '').trim();
      const url = (dom.querySelector('[data-add-url]')?.value || '').trim();
      if (!id || !url) return;
      addMachine({ id, name: name || id, bridgeUrl: url });
    });
    dom.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', (ev) => {
        const id = ev.currentTarget.getAttribute('data-id');
        const act = ev.currentTarget.getAttribute('data-act');
        if (act === 'remove') removeMachine(id);
        else if (act === 'open') emit('change', { kind: 'open', id, machine: machines.get(id) });
      });
    });
  }

  /**
   * Add a machine row. Returns true on insert, false if id already exists.
   * @param {{id:string,name:string,bridgeUrl:string}} m
   */
  function addMachine(m) {
    if (!m || !m.id || machines.has(m.id)) return false;
    const row = { id: m.id, name: m.name || m.id, bridgeUrl: m.bridgeUrl || '' };
    machines.set(m.id, row);
    emit('machineAdded', { ...row });
    render();
    return true;
  }

  function removeMachine(id) {
    if (!machines.has(id)) return false;
    const row = machines.get(id);
    machines.delete(id);
    emit('machineRemoved', { ...row });
    render();
    return true;
  }

  /**
   * Update a machine's live snapshot. Unknown machine ids are ignored
   * gracefully — the function returns false in that case.
   *
   * @param {string} id
   * @param {Snapshot} snapshot
   * @returns {boolean}
   */
  function updateMachine(id, snapshot) {
    if (!id || !machines.has(id)) return false;
    const row = machines.get(id);
    const s = { ...(row.snapshot || {}), ...(snapshot || {}), ts: Date.now() };
    row.snapshot = s;
    machines.set(id, row);
    // Targeted update — re-render only the card.
    const card = dom.querySelector(`[data-card="${id}"]`);
    if (card) {
      const tmp = document.createElement('div');
      tmp.innerHTML = cardHtml(row);
      const next = tmp.firstElementChild;
      card.replaceWith(next);
      // Re-wire the swapped card's buttons.
      next.querySelectorAll('[data-act]').forEach(b => {
        b.addEventListener('click', (ev) => {
          const aid = ev.currentTarget.getAttribute('data-id');
          const aact = ev.currentTarget.getAttribute('data-act');
          if (aact === 'remove') removeMachine(aid);
          else if (aact === 'open') emit('change', { kind: 'open', id: aid, machine: machines.get(aid) });
        });
      });
    } else {
      render();
    }
    emit('snapshot', { id, snapshot: s });
    return true;
  }

  function list() {
    return [...machines.values()].map(m => ({ ...m, snapshot: m.snapshot ? { ...m.snapshot } : undefined }));
  }

  function get(id) {
    const r = machines.get(id);
    return r ? { ...r, snapshot: r.snapshot ? { ...r.snapshot } : undefined } : null;
  }

  render();

  return {
    api: { addMachine, removeMachine, updateMachine, list, get },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
