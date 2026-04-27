/**
 * @file widgets/version-history.js
 * @description git-style timeline per component.
 *
 *   Renders a vertical timeline of every saved revision of a single
 *   component (semver, author, timestamp, tag pill, color marker).
 *   Calls GET /api/library/components/:id/versions and falls back to a
 *   demo set if the server is empty or unreachable. Two versions can be
 *   pinned for a `compareVersions()` JSON-key diff which renders inline
 *   below the timeline.
 *
 *   Metered at the `haiku` tier (one charge per loadHistory / compare /
 *   tag / restore).
 *
 * @author  Sachin Kumar
 * @license MIT
 *
 * Use Case 1 · widget #3 of 8 (see HANDOFF-2026-04-27.md).
 */

const ESC = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const DEMO_COMPONENT_ID = 'demo:DUO-Gestell-Profile-40x40';
const DEMO_VERSIONS = [
  { id: 'v_demo_5', semver: 'v1.4.2', file_path: 'derived/duo-gestell/versions/v05.glb', hash: 'a1b2c3d4',
    created_at: new Date(Date.now() -   2 * 3600e3).toISOString(),
    properties: { author: 'sachin', tag: 'released', description: 'tightened M8 hole pattern, +1mm wall' },
    imeta: { mass_g: 412.6, bbox: [40, 40, 600], holes: 14 } },
  { id: 'v_demo_4', semver: 'v1.4.1', file_path: 'derived/duo-gestell/versions/v04.glb', hash: '7f8e9d10',
    created_at: new Date(Date.now() -  26 * 3600e3).toISOString(),
    properties: { author: 'lars',   tag: 'review',   description: 'fillet on inner edge, fix interference with rail' },
    imeta: { mass_g: 411.0, bbox: [40, 40, 600], holes: 13 } },
  { id: 'v_demo_3', semver: 'v1.4.0', file_path: 'derived/duo-gestell/versions/v03.glb', hash: '11223344',
    created_at: new Date(Date.now() -   4 * 86400e3).toISOString(),
    properties: { author: 'sachin', tag: 'released', description: 'switch to anodized 6063, mount lugs reshaped' },
    imeta: { mass_g: 408.2, bbox: [40, 40, 600], holes: 13, material: '6063-T5' } },
  { id: 'v_demo_2', semver: 'v1.3.0', file_path: 'derived/duo-gestell/versions/v02.glb', hash: '55667788',
    created_at: new Date(Date.now() -  18 * 86400e3).toISOString(),
    properties: { author: 'lars',   tag: 'draft',    description: 'initial parametric port from .ipt' },
    imeta: { mass_g: 410.4, bbox: [40, 40, 600], holes: 12, material: '6061-T6' } },
  { id: 'v_demo_1', semver: 'v1.0.0', file_path: 'derived/duo-gestell/versions/v01.glb', hash: '99aabbcc',
    created_at: new Date(Date.now() -  42 * 86400e3).toISOString(),
    properties: { author: 'sachin', tag: 'draft',    description: 'first import from Inventor (.iam)' },
    imeta: { mass_g: 410.0, bbox: [40, 40, 600], holes: 12, material: '6061-T6' } },
];

function relTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return String(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60)        return Math.floor(s) + 's ago';
  if (s < 3600)      return Math.floor(s / 60) + 'm ago';
  if (s < 86400)     return Math.floor(s / 3600) + 'h ago';
  if (s < 7 * 86400) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function tagColor(tag) {
  if (tag === 'released') return { bg: '#DBEAFE', fg: '#1E3A8A' };
  if (tag === 'review')   return { bg: '#FEF3C7', fg: '#92400E' };
  if (tag === 'draft')    return { bg: '#E5E7EB', fg: '#374151' };
  return { bg: '#EDE9FE', fg: '#5B21B6' };
}

function diffImeta(a, b) {
  const out = { added: [], removed: [], modified: [] };
  if (!a || !b) return out;
  const am = (a.imeta && typeof a.imeta === 'object') ? a.imeta : {};
  const bm = (b.imeta && typeof b.imeta === 'object') ? b.imeta : {};
  const keys = new Set([...Object.keys(am), ...Object.keys(bm)]);
  for (const k of keys) {
    const ka = k in am, kb = k in bm;
    if (!ka && kb) out.added.push({ key: k, value: bm[k] });
    else if (ka && !kb) out.removed.push({ key: k, value: am[k] });
    else if (JSON.stringify(am[k]) !== JSON.stringify(bm[k])) out.modified.push({ key: k, before: am[k], after: bm[k] });
  }
  return out;
}

/**
 * Mount the version-history timeline.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { componentId?: string|number, demo?: boolean }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     loadHistory: (componentId: string|number) => Promise<Array<object>>,
 *     selectVersion: (versionId: string) => void,
 *     compareVersions: (a: string, b: string) => object,
 *     tagVersion: (versionId: string, tag: 'draft'|'review'|'released') => Promise<void>,
 *     restoreVersion: (versionId: string) => Promise<void>,
 *     getCurrentVersion: () => object|null
 *   },
 *   on: (event: 'select'|'compare'|'tag'|'restore'|'change'|'error', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('version-history: mount not found');

  const dom = document.createElement('div');
  dom.className = 'pt-version-history';
  dom.style.cssText = 'padding:18px;font:13px Inter,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:6px;max-width:780px';
  dom.innerHTML = `
    <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px">CYCLECAD · LIBRARY</div>
    <div style="font:600 22px Georgia;margin-bottom:10px">version history</div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <label style="font-size:11px;color:#4B5563;flex:1">component
        <input data-cid type=text value="${ESC(DEMO_COMPONENT_ID)}" style="width:100%;padding:6px 8px;font:11px Menlo,monospace;border:1px solid #d1d5db;border-radius:3px">
      </label>
      <button data-load style="background:#10B981;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">LOAD</button>
      <button data-compare style="background:#7C3AED;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer" disabled>COMPARE 0/2</button>
      <span data-status style="font:11px Menlo,monospace;color:#6B7280;margin-left:auto">idle</span>
    </div>
    <div data-timeline style="position:relative;padding-left:22px;border-left:2px solid #E5E7EB;min-height:80px"></div>
    <div data-diff style="margin-top:14px;display:none"></div>
  `;
  root.appendChild(dom);

  const $ = sel => dom.querySelector(sel);
  const status   = $('[data-status]');
  const timeline = $('[data-timeline]');
  const diffPane = $('[data-diff]');
  const cmpBtn   = $('[data-compare]');

  const listeners = { change: [], select: [], compare: [], tag: [], restore: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  let alive       = true;
  let versions    = [];
  let componentId = DEMO_COMPONENT_ID;
  let currentId   = null;
  const compareSet = new Set();

  async function bill(method, extra) {
    if (!opts.meter) return;
    try {
      await opts.meter.charge({
        widget: 'version-history',
        method, kind: method,
        modelTier: 'haiku',
        actor: opts.app,
        params: extra,
      });
    } catch {}
  }

  async function fetchVersions(id) {
    try {
      const res = await fetch(`/api/library/components/${encodeURIComponent(id)}/versions`);
      if (!res.ok) throw new Error('http ' + res.status);
      const j = await res.json();
      const list = Array.isArray(j) ? j : (j.versions || []);
      return list;
    } catch {
      return [];
    }
  }

  function render() {
    if (!versions.length) {
      timeline.innerHTML = `<div style="padding:18px 0;color:#9CA3AF">no versions for this component</div>`;
      return;
    }
    timeline.innerHTML = versions.map((v, i) => {
      const isCurrent = i === 0;
      const tag = v.properties?.tag || (isCurrent ? 'current' : '');
      const author = v.properties?.author || 'unknown';
      const desc = v.properties?.description || v.imeta?.description || (v.file_path || '').split('/').pop();
      const t = tagColor(tag);
      const markerColor = isCurrent ? '#10B981' : (tag === 'released' ? '#3B82F6' : '#9CA3AF');
      const picked = compareSet.has(v.id);
      return `
        <div data-row data-vid="${ESC(v.id)}" style="position:relative;margin-bottom:14px;padding:10px 12px;border:1px solid ${picked ? '#7C3AED' : '#E5E7EB'};border-radius:6px;background:${picked ? '#FAF5FF' : '#fff'};cursor:pointer">
          <span style="position:absolute;left:-29px;top:14px;width:12px;height:12px;border-radius:50%;background:${markerColor};border:2px solid #fff;box-shadow:0 0 0 2px ${markerColor}"></span>
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
            <span style="font:700 14px Menlo,monospace;color:#0F172A">${ESC(v.semver || v.id)}</span>
            ${tag ? `<span style="font:600 10px Inter;letter-spacing:1px;text-transform:uppercase;background:${t.bg};color:${t.fg};padding:2px 8px;border-radius:99px">${ESC(tag)}</span>` : ''}
            <span style="font:11px Menlo,monospace;color:#6B7280">${ESC(relTime(v.created_at))}</span>
            <span style="font:11px Inter;color:#4B5563;margin-left:auto">${ESC(author)}</span>
          </div>
          <div style="margin-top:4px;font:12px Inter;color:#374151">${ESC(desc)}</div>
          <div data-actions style="margin-top:6px;display:none;gap:10px;font:11px Inter">
            <a data-act="view"    style="color:#3B82F6;cursor:pointer">view</a>
            <a data-act="compare" style="color:#7C3AED;cursor:pointer">${picked ? 'unpin' : 'compare'}</a>
            <a data-act="tag"     style="color:#92400E;cursor:pointer">tag</a>
            <a data-act="restore" style="color:#10B981;cursor:pointer">restore</a>
          </div>
        </div>`;
    }).join('');

    timeline.querySelectorAll('[data-row]').forEach(row => {
      const acts = row.querySelector('[data-actions]');
      row.addEventListener('mouseenter', () => { acts.style.display = 'flex'; });
      row.addEventListener('mouseleave', () => { acts.style.display = 'none'; });
      row.addEventListener('click', () => selectVersion(row.dataset.vid));
      row.addEventListener('dblclick', () => restoreVersion(row.dataset.vid));
      row.querySelectorAll('[data-act]').forEach(a => {
        a.addEventListener('click', e => {
          e.stopPropagation();
          const v = versions.find(x => x.id === row.dataset.vid);
          if (!v) return;
          const act = a.dataset.act;
          if (act === 'view')    selectVersion(v.id);
          if (act === 'compare') togglePick(v.id);
          if (act === 'tag')     promptTag(v.id);
          if (act === 'restore') restoreVersion(v.id);
        });
      });
    });
    cmpBtn.textContent = `COMPARE ${compareSet.size}/2`;
    cmpBtn.disabled = compareSet.size !== 2;
  }

  function togglePick(id) {
    if (compareSet.has(id)) compareSet.delete(id);
    else if (compareSet.size < 2) compareSet.add(id);
    else { compareSet.delete([...compareSet][0]); compareSet.add(id); }
    render();
  }

  function selectVersion(id) {
    const v = versions.find(x => x.id === id);
    if (!v) return null;
    currentId = id;
    bill('select');
    emit('select', v);
    emit('change', { kind: 'select', version: v });
    return v;
  }

  function compareVersions(a, b) {
    const va = typeof a === 'string' ? versions.find(v => v.id === a) : a;
    const vb = typeof b === 'string' ? versions.find(v => v.id === b) : b;
    if (!va || !vb) return { added: [], removed: [], modified: [] };
    const d = diffImeta(va, vb);
    bill('compare', { a: va.id, b: vb.id });
    emit('compare', { a: va, b: vb, diff: d });
    emit('change', { kind: 'compare' });
    renderDiff(va, vb, d);
    return d;
  }

  function renderDiff(a, b, d) {
    const row = (kind, k, before, after) => `
      <tr><td style="padding:4px 8px;font:11px Menlo,monospace;color:${kind==='added'?'#065F46':kind==='removed'?'#991B1B':'#92400E'}">${kind}</td>
          <td style="padding:4px 8px;font:11px Menlo,monospace">${ESC(k)}</td>
          <td style="padding:4px 8px;font:11px Menlo,monospace;color:#6B7280">${ESC(JSON.stringify(before ?? ''))}</td>
          <td style="padding:4px 8px;font:11px Menlo,monospace">${ESC(JSON.stringify(after ?? ''))}</td></tr>`;
    diffPane.style.display = 'block';
    diffPane.innerHTML = `
      <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:2px;margin-bottom:6px">DIFF · ${ESC(a.semver)} → ${ESC(b.semver)}</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden">
        <thead><tr style="background:#f9fafb;color:#6B7280;font:10px Inter;text-transform:uppercase;letter-spacing:1px">
          <th style="padding:6px 8px;text-align:left">kind</th>
          <th style="padding:6px 8px;text-align:left">key</th>
          <th style="padding:6px 8px;text-align:left">before</th>
          <th style="padding:6px 8px;text-align:left">after</th>
        </tr></thead>
        <tbody>
          ${d.added   .map(x => row('added',    x.key, undefined, x.value)).join('')}
          ${d.removed .map(x => row('removed',  x.key, x.value,   undefined)).join('')}
          ${d.modified.map(x => row('modified', x.key, x.before,  x.after)).join('')}
          ${(!d.added.length && !d.removed.length && !d.modified.length)
            ? `<tr><td colspan=4 style="padding:10px;text-align:center;color:#9CA3AF;font:11px Inter">no differences in imeta</td></tr>` : ''}
        </tbody>
      </table>`;
  }

  function tagVersion(id, tag) {
    const v = versions.find(x => x.id === id);
    if (!v) return null;
    v.properties = v.properties || {};
    v.properties.tag = tag;
    bill('tag', { id, tag });
    emit('tag', { version: v, tag });
    emit('change', { kind: 'tag', version: v, tag });
    render();
    return v;
  }

  function promptTag(id) {
    const next = (typeof window !== 'undefined' && window.prompt)
      ? window.prompt('tag (released · review · draft)', 'released')
      : 'released';
    if (next) tagVersion(id, next);
  }

  function restoreVersion(id) {
    const v = versions.find(x => x.id === id);
    if (!v) return null;
    bill('restore', { id });
    emit('restore', { version: v, file_path: v.file_path });
    emit('change', { kind: 'restore', version: v });
    return v;
  }

  function getCurrentVersion() {
    return versions.find(v => v.id === currentId) || versions[0] || null;
  }

  async function loadHistory(id) {
    if (id) componentId = id;
    status.textContent = 'loading…';
    bill('loadHistory', { componentId });
    let list = await fetchVersions(componentId);
    if (!alive) return [];
    if (!list || !list.length) {
      list = DEMO_VERSIONS.slice();
      status.textContent = `${list.length} versions · demo fallback`;
    } else {
      status.textContent = `${list.length} versions · ${new Date().toLocaleTimeString()}`;
    }
    versions = list;
    currentId = versions[0]?.id || null;
    compareSet.clear();
    diffPane.style.display = 'none';
    diffPane.innerHTML = '';
    render();
    emit('change', { kind: 'load', componentId, count: versions.length });
    return versions;
  }

  $('[data-load]').addEventListener('click', () => loadHistory($('[data-cid]').value.trim() || DEMO_COMPONENT_ID));
  cmpBtn.addEventListener('click', () => {
    if (compareSet.size !== 2) return;
    const [a, b] = [...compareSet];
    compareVersions(a, b);
  });

  await loadHistory(componentId);

  return {
    api: {
      loadHistory,
      selectVersion,
      compareVersions,
      tagVersion,
      restoreVersion,
      getCurrentVersion,
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      alive = false;
      dom.remove();
      versions = [];
      compareSet.clear();
      Object.keys(listeners).forEach(k => listeners[k] = []);
    },
  };
}
