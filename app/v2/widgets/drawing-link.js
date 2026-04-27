/**
 * @file widgets/drawing-link.js
 * @description Live link from a 2D drawing back to the 3D component it was
 *   generated from. Tracks (drawingId → componentId) pairs along with hashes
 *   so the widget can flag drift when the source 3D model changes.
 *
 *   UI: a status pill that shows "in sync" / "source changed" / "unlinked".
 *   Click opens a panel listing every link with a "regenerate now" button.
 *
 *   The widget itself does NOT regenerate — it emits 'regenerate' so that
 *   drawing-generator (or any orchestrator) can handle the actual rebuild.
 *
 *   Pairs with drawing-generator.js (the producer) and drawing-template.js
 *   (the title-block source).
 *
 * @author  Sachin Kumar
 * @license MIT
 */

/**
 * Mount the drawing-to-component live-link widget.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { pollMs?: number }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     linkDrawingToComponent: (drawingId: string, componentId: string, obj?: object) => void,
 *     unlink: (drawingId: string) => void,
 *     checkSync: (drawingId?: string) => 'in-sync'|'drift'|'unlinked',
 *     regenerate: (drawingId: string) => void,
 *     listLinks: () => Array<{ drawingId: string, componentId: string, status: string }>,
 *     registerComponent: (id: string, obj: object) => void
 *   },
 *   on: (event: 'change'|'link'|'unlink'|'drift'|'regenerate', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('drawing-link: mount not found');

  const state = {
    links:       new Map(),    // drawingId → { componentId, sourceHash, drawingHash, ts }
    components:  new Map(),    // componentId → THREE.Object3D
    pollHandle:  0,
    open:        false,
    statusGlobal:'in-sync',    // 'in-sync' | 'drift' | 'unlinked'
  };

  const listeners = { change: [], link: [], unlink: [], drift: [], regenerate: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch (e) { /* swallow */ } });

  // -------- meter helper -------------------------------------------------
  async function bill(method, tier) {
    if (!opts.meter) return;
    try {
      await opts.meter.charge({
        widget:    'drawing-link',
        kind:      method,
        actor:     opts.app,
        modelTier: tier,
        tokensIn:  100,
        tokensOut: 100,
      });
    } catch (e) { /* swallow */ }
  }

  // -------- hashing ------------------------------------------------------
  function hashComponent(obj) {
    if (!obj) return 'h0';
    let n = 0;
    const tr = (o) => {
      if (o.isMesh) {
        n = (n * 31 + (o.geometry?.attributes?.position?.count || 0)) >>> 0;
        const p = o.position; n = (n * 31 + ((p.x*1000)|0) + ((p.y*1000)|0) + ((p.z*1000)|0)) >>> 0;
        const r = o.rotation; n = (n * 31 + ((r.x*1000)|0) + ((r.y*1000)|0) + ((r.z*1000)|0)) >>> 0;
        const s = o.scale;    n = (n * 31 + ((s.x*1000)|0) + ((s.y*1000)|0) + ((s.z*1000)|0)) >>> 0;
      }
      if (o.children) o.children.forEach(tr);
    };
    if (typeof obj.traverse === 'function') tr(obj);
    return 'h' + n.toString(36);
  }

  function lookupComponent(componentId) {
    if (state.components.has(componentId)) return state.components.get(componentId);
    if (!opts.root) return null;
    let hit = null;
    if (typeof opts.root.traverse === 'function') {
      opts.root.traverse(o => { if (!hit && (o.name === componentId || o.uuid === componentId)) hit = o; });
    }
    if (hit) state.components.set(componentId, hit);
    return hit;
  }

  function classifyDrift(prev, curr) {
    if (prev === curr) return 'none';
    if (!prev || !curr) return 'major';
    // crude heuristic: compare numeric tail length
    const a = String(prev).slice(1), b = String(curr).slice(1);
    return Math.abs(a.length - b.length) > 1 ? 'major' : 'minor';
  }

  // -------- public API ---------------------------------------------------
  async function linkDrawingToComponent(drawingId, componentId) {
    if (!drawingId) throw new Error('drawing-link: drawingId required');
    const obj = lookupComponent(componentId);
    const sourceHash = hashComponent(obj);
    state.links.set(drawingId, {
      componentId, sourceHash,
      drawingHash: sourceHash,
      ts: Date.now(),
    });
    await bill('link', 'haiku');
    emit('link', { drawingId, componentId, sourceHash });
    emit('change', { kind: 'link', drawingId });
    refreshUi();
    return state.links.get(drawingId);
  }

  function unlink(drawingId) {
    const had = state.links.delete(drawingId);
    if (had) {
      emit('unlink', { drawingId });
      emit('change', { kind: 'unlink', drawingId });
      refreshUi();
    }
    return had;
  }

  async function checkSync(drawingId) {
    const link = state.links.get(drawingId);
    if (!link) return { inSync: false, sourceHash: null, drawingHash: null, drift: 'none', unlinked: true };
    const obj = lookupComponent(link.componentId);
    const currentHash = hashComponent(obj);
    const drift = classifyDrift(link.drawingHash, currentHash);
    const inSync = currentHash === link.drawingHash;
    link.sourceHash = currentHash;
    await bill('checkSync', 'haiku');
    if (!inSync) {
      emit('drift', { drawingId, drift, sourceHash: currentHash, drawingHash: link.drawingHash });
    }
    return { inSync, sourceHash: currentHash, drawingHash: link.drawingHash, drift };
  }

  async function regenerate(drawingId) {
    const link = state.links.get(drawingId);
    if (!link) return false;
    await bill('regenerate', 'sonnet');
    // Bump our cached drawing hash to current source hash so we stop drifting.
    const obj = lookupComponent(link.componentId);
    link.drawingHash = hashComponent(obj);
    link.ts = Date.now();
    emit('regenerate', { drawingId, componentId: link.componentId });
    emit('change', { kind: 'regenerate', drawingId });
    refreshUi();
    return true;
  }

  function listLinks() {
    return [...state.links.entries()].map(([drawingId, l]) => ({
      drawingId, componentId: l.componentId,
      sourceHash: l.sourceHash, drawingHash: l.drawingHash,
      ts: l.ts,
    }));
  }

  // -------- DOM ----------------------------------------------------------
  const dom = buildDom(root);

  function statusLabel() {
    if (state.links.size === 0) return { txt: 'unlinked', glyph: '✗', color: '#94a3b8', bg: '#f1f5f9' };
    if (state.statusGlobal === 'drift') return { txt: 'source changed', glyph: '⚠', color: '#b45309', bg: '#fef3c7' };
    return { txt: 'in sync', glyph: '✓', color: '#047857', bg: '#d1fae5' };
  }

  function refreshUi() {
    const lbl = statusLabel();
    dom.pill.style.color = lbl.color;
    dom.pill.style.background = lbl.bg;
    dom.pill.innerHTML = `<span style="font-weight:700">${lbl.glyph}</span>&nbsp;${lbl.txt}<span style="opacity:.6;margin-left:8px">(${state.links.size})</span>`;
    if (state.open) renderLinkList();
  }

  function renderLinkList() {
    const rows = listLinks();
    if (rows.length === 0) {
      dom.list.innerHTML = `<div style="padding:14px;color:#94a3b8;font-size:12px">no drawings linked yet — call <code>linkDrawingToComponent()</code></div>`;
      return;
    }
    dom.list.innerHTML = rows.map(r => {
      const drift = (r.sourceHash && r.drawingHash && r.sourceHash !== r.drawingHash);
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #e5e7eb">
          <span style="font:600 11px monospace">${escapeHtml(r.drawingId)}</span>
          <span style="font:11px monospace;color:#6b7280">→ ${escapeHtml(r.componentId || 'root')}</span>
          <span style="margin-left:auto;font:10px monospace;color:${drift ? '#b45309' : '#047857'}">
            ${drift ? '&#9888; drift' : '&#10003; ok'} · ${escapeHtml(r.drawingHash || '')} → ${escapeHtml(r.sourceHash || '')}
          </span>
          <button data-regen="${escapeHtml(r.drawingId)}" style="background:#7C3AED;color:#fff;border:none;padding:4px 10px;border-radius:3px;font:600 10px Inter;cursor:pointer">REGEN</button>
          <button data-drop="${escapeHtml(r.drawingId)}"  style="background:#fff;color:#dc2626;border:1px solid #fecaca;padding:4px 10px;border-radius:3px;font:600 10px Inter;cursor:pointer">DROP</button>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
  }

  const onPillClick = () => {
    state.open = !state.open;
    dom.panel.style.display = state.open ? 'block' : 'none';
    if (state.open) renderLinkList();
  };
  const onListClick = (e) => {
    const regen = e.target.closest('[data-regen]');
    const drop  = e.target.closest('[data-drop]');
    if (regen) regenerate(regen.dataset.regen);
    else if (drop) unlink(drop.dataset.drop);
  };
  const onCheckAll = async () => {
    let driftCount = 0;
    for (const id of state.links.keys()) {
      const r = await checkSync(id);
      if (!r.inSync) driftCount++;
    }
    state.statusGlobal = driftCount > 0 ? 'drift' : 'in-sync';
    refreshUi();
  };

  dom.pill   .addEventListener('click', onPillClick);
  dom.list   .addEventListener('click', onListClick);
  dom.checkBtn.addEventListener('click', onCheckAll);

  // -------- background poll for drift -----------------------------------
  state.pollHandle = setInterval(async () => {
    if (state.links.size === 0) return;
    let drifted = 0;
    for (const id of state.links.keys()) {
      const link = state.links.get(id);
      const obj = lookupComponent(link.componentId);
      const h = hashComponent(obj);
      if (h !== link.drawingHash) drifted++;
      link.sourceHash = h;
    }
    const next = drifted > 0 ? 'drift' : 'in-sync';
    if (next !== state.statusGlobal) {
      state.statusGlobal = next;
      refreshUi();
      if (next === 'drift') emit('drift', { drifted });
    }
  }, 2500);

  refreshUi();

  return {
    api: {
      linkDrawingToComponent,
      unlink,
      checkSync,
      regenerate,
      listLinks,
      registerComponent(id, obj) { state.components.set(id, obj); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      clearInterval(state.pollHandle);
      dom.pill   .removeEventListener('click', onPillClick);
      dom.list   .removeEventListener('click', onListClick);
      dom.checkBtn.removeEventListener('click', onCheckAll);
      dom.wrap.remove();
      state.links.clear();
      state.components.clear();
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// DOM
// ──────────────────────────────────────────────────────────────────────
function buildDom(root) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-drawing-link';
  wrap.style.cssText = 'font:13px Inter,sans-serif;display:inline-block;position:relative';
  wrap.innerHTML = `
    <button data-pill style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:6px 12px;border-radius:999px;font:600 12px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:4px">
      <span>—</span>
    </button>
    <div data-panel style="display:none;position:absolute;top:36px;left:0;background:#fff;border:1px solid #e5e7eb;border-radius:6px;width:520px;box-shadow:0 8px 24px rgba(0,0,0,.10);z-index:30">
      <div style="display:flex;align-items:center;padding:10px 12px;border-bottom:1px solid #e5e7eb">
        <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:2px">DRAWING LINKS</div>
        <button data-check style="margin-left:auto;background:#0EA5E9;color:#fff;border:none;padding:4px 10px;border-radius:3px;font:600 10px Inter;cursor:pointer">CHECK ALL</button>
      </div>
      <div data-list style="max-height:280px;overflow:auto"></div>
    </div>
  `;
  root.appendChild(wrap);
  return {
    wrap,
    pill:     wrap.querySelector('[data-pill]'),
    panel:    wrap.querySelector('[data-panel]'),
    list:     wrap.querySelector('[data-list]'),
    checkBtn: wrap.querySelector('[data-check]'),
  };
}
