/**
 * @file widgets/library-browser.js
 * @description Fusion-style library browser. Renders a left-side panel
 *   with a project header, filter pills (All / Custom / Standard / Vendor),
 *   debounced search and a nested folder tree with disclosure triangles.
 *   Each file row is icon-coded by `kind` (assembly = box, part = cube,
 *   drawing = sheet, sheet-metal = folded-paper, sketch = pencil).
 *
 *   Data source: tries the server via
 *     GET /api/library/projects/:id/components
 *   and falls back to opts.params.demoTree (seeded with the DUO directory)
 *   so the widget renders in standalone mode without a backend.
 *
 *   Right-click context menu: Open · Show in viewport · Versions · Copy
 *   path · Reveal in finder. Each entry is a no-op that emits an event
 *   the host can wire to real handlers.
 *
 *   Contract:
 *     init({ mount, app, meter, params? }) → { api, on, destroy }
 *     api.loadProject(idOrPath)
 *     api.expandNode(nodeId), api.collapseNode(nodeId)
 *     api.selectNode(nodeId)        emits 'select' { id, kind, path }
 *     api.filterCategory(cat)        'all'|'custom'|'vendor'|'standard'
 *     api.searchByName(query)        debounced live filter
 *     api.refresh()
 *
 *   Events: 'select' · 'expand' · 'collapse' · 'filter' · 'change' ·
 *           'context' (right-click action) · 'error'.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const ENDPOINT_TREE = (id) => `/api/library/projects/${encodeURIComponent(id)}/components`;
const SEARCH_DEBOUNCE_MS = 180;

/** Default DUO demo tree — points at the real DUO/Workspaces/Arbeitsbereich
 *  layout so the widget tells a real story even without a backend. */
const DEMO_DUO_TREE = {
  id: 'duo-root',
  name: 'DUO Anlage',
  kind: 'project',
  path: 'DUO/Workspaces/Arbeitsbereich',
  children: [
    { id: 'duo-anlage', name: 'DUO Anlage', kind: 'folder', category: 'custom',
      path: 'DUO/Workspaces/Arbeitsbereich/DUO Anlage',
      children: [
        { id: 'lenker', name: 'Lenkerhalterung', kind: 'folder', category: 'custom',
          children: [
            { id: 'lenker-iam', name: 'BG-Sattelhalterung-Klemme.iam', kind: 'assembly', category: 'custom' },
            { id: 'lenker-rohr', name: 'DIN EN 10305-4 - E235 - 15 x 1.ipt', kind: 'part', category: 'standard' },
            { id: 'lenker-stange', name: 'Gewindestange.ipt', kind: 'part', category: 'custom' },
          ]},
        { id: 'gestell', name: 'Gestell', kind: 'folder', category: 'custom',
          children: [
            { id: 'gestell-p3',  name: 'Anschraubplatte3.ipt',   kind: 'part', category: 'custom' },
            { id: 'gestell-p11', name: 'Anschraubplatte11.ipt',  kind: 'part', category: 'custom' },
            { id: 'gestell-p3a', name: 'Anschraubplatte3_1.ipt', kind: 'part', category: 'custom' },
          ]},
        { id: 'seitenwand', name: 'Seitenwand', kind: 'folder', category: 'custom',
          children: [
            { id: 'sw-skz', name: 'Parameter Skizze_V3.ipt', kind: 'sketch', category: 'custom' },
            { id: 'sw-blech', name: 'Blech', kind: 'folder', category: 'custom',
              children: [
                { id: 'sw-blech-h', name: 'SBG_Unterteil_hinten.iam',   kind: 'sheet-metal', category: 'custom' },
                { id: 'sw-blech-v', name: 'SBG_Unterteil_vorne_1.iam', kind: 'sheet-metal', category: 'custom' },
              ]},
          ]},
        { id: 'wasch', name: 'Waschbürsten', kind: 'folder', category: 'custom',
          children: [
            { id: 'wasch-r1', name: 'Riemen1.ipt',         kind: 'part', category: 'custom' },
            { id: 'wasch-r2', name: 'starrer Riemen2.ipt', kind: 'part', category: 'custom' },
            { id: 'wasch-tr', name: 'TrägerWB2.ipt',       kind: 'part', category: 'custom' },
          ]},
        { id: 'rad', name: 'Raddreheinheit', kind: 'folder', category: 'custom',
          children: [
            { id: 'rad-tr', name: 'DIN EN 10305-5 - Träger Raddreheinheit1.ipt', kind: 'part', category: 'standard' },
          ]},
        { id: 'us', name: 'Ultraschallreiniger', kind: 'folder', category: 'custom',
          children: [
            { id: 'us-rohr', name: 'Rohr_01.ipt',     kind: 'part', category: 'custom' },
            { id: 'us-bolz', name: 'GewBolzenM4x8.ipt', kind: 'part', category: 'standard' },
          ]},
      ]},
    { id: 'zukauf', name: 'Zukaufteile', kind: 'folder', category: 'vendor',
      path: 'DUO/Workspaces/Arbeitsbereich/Zukaufteile',
      children: [
        { id: 'ganter', name: 'Ganter', kind: 'folder', category: 'vendor',
          children: [
            { id: 'ganter-clamp', name: 'Clamp mounting GN 477-B15-MT.ipt',     kind: 'part', category: 'vendor' },
            { id: 'ganter-handle', name: "Cabinet ''U'' handle GN 667-20-250.ipt", kind: 'part', category: 'vendor' },
          ]},
        { id: 'kipp', name: 'Kipp-Norelem', kind: 'folder', category: 'vendor',
          children: [
            { id: 'kipp-bolz', name: 'achsbolzen_M 621.ipt',  kind: 'part', category: 'vendor' },
            { id: 'kipp-druck', name: 'druckscheibe_1.ipt',   kind: 'part', category: 'vendor' },
            { id: 'kipp-exz',  name: 'exzentergriff_1.ipt',   kind: 'part', category: 'vendor' },
            { id: 'kipp-kolb', name: '039_8k0583_s_kolben.ipt', kind: 'part', category: 'vendor' },
          ]},
        { id: 'igus',     name: 'igus',             kind: 'folder', category: 'vendor',
          children: [
            { id: 'igus-krm', name: 'KRM-S16.ipt', kind: 'part', category: 'vendor' },
            { id: 'igus-zyl', name: 'BRG - Zylinderschraube DIN 912 - M4 x 10.ipt', kind: 'part', category: 'standard' },
          ]},
        { id: 'blickle',  name: 'Blickle',          kind: 'folder', category: 'vendor',
          children: [
            { id: 'blic-gh', name: 'GH-B_160_G15.ipt',    kind: 'part', category: 'vendor' },
            { id: 'blic-pa', name: 'PATH_160_20K_G15.ipt', kind: 'part', category: 'vendor' },
          ]},
        { id: 'weg',      name: 'WEG Motor',        kind: 'folder', category: 'vendor',
          children: [
            { id: 'weg-sk',  name: 'Sicherheitskupplung.ipt',   kind: 'part', category: 'vendor' },
            { id: 'weg-ring', name: 'Sicherungsring_DIN_471_-_14.ipt', kind: 'part', category: 'standard' },
          ]},
        { id: 'mink',     name: 'mink',             kind: 'folder', category: 'vendor',
          children: [
            { id: 'mink-200', name: 'Leistenbürste-200-478-gebort.ipt',  kind: 'part', category: 'vendor' },
            { id: 'mink-40',  name: 'Leistenbürste-40-1000.ipt',         kind: 'part', category: 'vendor' },
          ]},
        { id: 'vent',     name: 'Ventilator',       kind: 'folder', category: 'vendor',
          children: [
            { id: 'vent-mot', name: 'Motor_FD71-40-2-U.ipt',     kind: 'part', category: 'vendor' },
            { id: 'vent-grd', name: 'Schutzgitter_DN12.ipt',     kind: 'part', category: 'vendor' },
            { id: 'vent-fan', name: 'Ventilator_DN12.ipt',       kind: 'part', category: 'vendor' },
          ]},
      ]},
    { id: 'zusatz', name: 'Zusatzoptionen', kind: 'folder', category: 'custom',
      path: 'DUO/Workspaces/Arbeitsbereich/Zusatzoptionen',
      children: [
        { id: 'zusatz-skz', name: 'Skizze_E-Ketten_Halterung.ipt', kind: 'sketch', category: 'custom' },
      ]},
    { id: 'uebernommen', name: 'Übernommen', kind: 'folder', category: 'custom',
      path: 'DUO/Workspaces/Arbeitsbereich/Übernommen',
      children: [
        { id: 'sfb', name: 'sfb / DUO I - KD-171102-A', kind: 'folder', category: 'custom',
          children: [
            { id: 'sfb-iam', name: 'KD-170607.iam',  kind: 'assembly', category: 'custom' },
            { id: 'sfb-din127', name: 'DIN 127 - A 6.ipt', kind: 'part', category: 'standard' },
            { id: 'sfb-din9021', name: 'DIN 9021 - 6,4 - 1.ipt', kind: 'part', category: 'standard' },
            { id: 'sfb-din7045', name: 'DIN EN ISO 7045 - M5 x 16 - 4.ipt', kind: 'part', category: 'standard' },
            { id: 'sfb-kd1', name: 'KD-162968.ipt', kind: 'part', category: 'custom' },
            { id: 'sfb-kd2', name: 'KD-162969.ipt', kind: 'part', category: 'custom' },
          ]},
      ]},
    { id: 'mini', name: 'MiniDuo NX_11', kind: 'folder', category: 'custom',
      path: 'DUO/Workspaces/Arbeitsbereich/MiniDuo NX_11',
      children: [
        { id: 'mini-iam', name: 'MiniDuo.iam', kind: 'assembly', category: 'custom' },
      ]},
    { id: 'cc', name: 'Libraries / Content Center Files', kind: 'folder', category: 'standard',
      path: 'DUO/Libraries/Content Center Files',
      children: [
        { id: 'cc-din', name: 'DIN', kind: 'folder', category: 'standard' },
        { id: 'cc-iso', name: 'ISO', kind: 'folder', category: 'standard' },
      ]},
  ],
};

const ICON = {
  project:      '◆',
  folder:       '▸',
  assembly:     '▣',  // box
  part:         '▦',  // cube-ish
  drawing:      '▤',  // sheet
  'sheet-metal':'▥',  // folded paper
  sketch:       '✎',  // pencil
  unknown:      '·',
};

/** Default fetcher — calls the (in-progress) library API. Returns null on
 *  any error so the widget can fall back to demoTree. Exposed via
 *  api.fetchTree for tests. */
async function defaultFetchTree(projectId) {
  try {
    const r = await fetch(ENDPOINT_TREE(projectId));
    if (!r.ok) return null;
    const j = await r.json();
    return j?.tree || j;
  } catch {
    return null;
  }
}

/**
 * Mount the library browser panel.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: {
 *     projectId?: string|number,
 *     demoTree?: object,
 *     fetchTree?: (id: string|number) => Promise<object>
 *   }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     loadProject: (idOrPath: string|number) => Promise<void>,
 *     expandNode: (nodeId: string) => void,
 *     collapseNode: (nodeId: string) => void,
 *     selectNode: (nodeId: string) => void,
 *     filterCategory: (cat: 'all'|'custom'|'vendor'|'standard') => void,
 *     searchByName: (query: string) => void,
 *     refresh: () => Promise<void>
 *   },
 *   on: (event: 'select'|'expand'|'collapse'|'filter'|'change'|'context'|'error', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('library-browser: mount not found');

  const params  = opts.params || {};
  const fetcher = params.fetchTree || defaultFetchTree;
  const meter   = opts.meter;

  const wrap = document.createElement('div');
  wrap.className = 'pt-library-browser';
  wrap.style.cssText = `
    font: 13px/1.4 Inter, -apple-system, sans-serif; color: var(--pt-ink, #0F1416);
    background: #FFFFFF; border: 1px solid var(--pt-rule, #D6D9DD);
    border-radius: var(--pt-radius, 4px); width: 320px; min-height: 420px;
    display: flex; flex-direction: column; overflow: hidden;
  `;
  wrap.innerHTML = `
    <header data-hdr style="padding:10px 12px;border-bottom:1px solid var(--pt-rule,#D6D9DD);background:var(--pt-cream,#F4F1EA)">
      <div style="font:600 11px Inter;letter-spacing:2px;color:var(--pt-muted,#6E7780);text-transform:uppercase">LIBRARY</div>
      <div data-name style="font:600 14px Georgia,serif;margin-top:2px">—</div>
      <div data-crumb style="font:11px Menlo,monospace;color:var(--pt-muted,#6E7780);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
    </header>
    <div style="padding:8px 10px;display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--pt-rule,#D6D9DD)" data-pills>
      ${['all','custom','standard','vendor'].map(c => `
        <button data-pill="${c}" style="background:#fff;border:1px solid var(--pt-rule,#D6D9DD);padding:3px 8px;border-radius:11px;font:600 10px Inter;letter-spacing:1px;text-transform:uppercase;cursor:pointer;color:var(--pt-muted,#6E7780)">${c}</button>
      `).join('')}
    </div>
    <div style="padding:8px 10px;border-bottom:1px solid var(--pt-rule,#D6D9DD)">
      <input data-search type=search placeholder="search by name…" style="width:100%;padding:5px 8px;font:12px Inter;border:1px solid var(--pt-rule,#D6D9DD);border-radius:3px;outline:none">
    </div>
    <div data-tree style="flex:1;overflow:auto;padding:6px 4px 12px;background:#FFFFFF"></div>
    <footer data-status style="padding:5px 10px;font:10px Menlo,monospace;color:var(--pt-muted,#6E7780);border-top:1px solid var(--pt-rule,#D6D9DD);background:var(--pt-cream,#F4F1EA)"></footer>
  `;
  root.appendChild(wrap);

  const $ = (s) => wrap.querySelector(s);
  const treeEl   = $('[data-tree]');
  const searchEl = $('[data-search]');
  const nameEl   = $('[data-name]');
  const crumbEl  = $('[data-crumb]');
  const statusEl = $('[data-status]');

  // ---------- state ----------
  const listeners = { change: [], select: [], expand: [], collapse: [], filter: [], context: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });
  const trackedListeners = []; // { target, type, fn } so destroy() is total
  function track(target, type, fn) { target.addEventListener(type, fn); trackedListeners.push({ target, type, fn }); }

  let tree = null;
  let projectId = null;
  let category  = 'all';
  let query     = '';
  let searchTimer = null;
  const expanded  = new Set();
  let selectedId  = null;
  let menuEl      = null;

  // ---------- icon paint ----------
  function iconFor(node) {
    if (!node) return ICON.unknown;
    if (node.kind === 'folder' && expanded.has(node.id)) return '▾';
    if (node.kind === 'folder') return '▸';
    return ICON[node.kind] || ICON.unknown;
  }

  function categoryColor(cat) {
    if (cat === 'custom')   return 'var(--pt-green,#03B188)';
    if (cat === 'vendor')   return 'var(--pt-violet,#8B5CF6)';
    if (cat === 'standard') return 'var(--gold,#D4A843)';
    return 'var(--pt-muted,#6E7780)';
  }

  function matches(node) {
    if (category !== 'all' && node.kind !== 'folder' && node.category !== category) return false;
    if (query && !node.name.toLowerCase().includes(query)) return false;
    return true;
  }

  /** A folder passes the filter if any descendant does, OR the folder
   *  itself matches the search query. */
  function folderHasMatch(node) {
    if (!query && category === 'all') return true;
    if (matches(node)) return true;
    return (node.children || []).some(c => c.kind === 'folder' ? folderHasMatch(c) : matches(c));
  }

  function renderTree() {
    treeEl.innerHTML = '';
    if (!tree) {
      treeEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--pt-muted,#6E7780);font:italic 12px Inter">no project loaded</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    (tree.children || []).forEach(child => renderNode(child, 0, frag));
    treeEl.appendChild(frag);
    statusEl.textContent = `${countVisible(tree)} items · ${category} · ${projectId || 'standalone'}`;
  }

  function countVisible(node) {
    let n = 0;
    (function walk(x) {
      (x.children || []).forEach(c => {
        if (c.kind === 'folder') { if (folderHasMatch(c)) { n += 1; walk(c); } }
        else if (matches(c)) n += 1;
      });
    })(node);
    return n;
  }

  function renderNode(node, depth, parent) {
    const isFolder = node.kind === 'folder';
    if (isFolder && !folderHasMatch(node)) return;
    if (!isFolder && !matches(node)) return;

    const row = document.createElement('div');
    row.dataset.id = node.id;
    row.style.cssText = `
      display:flex;align-items:center;gap:6px;padding:3px 6px 3px ${6 + depth*14}px;
      cursor:pointer;border-radius:3px;user-select:none;
      ${selectedId === node.id ? 'background:rgba(3,177,136,.12);' : ''}
    `;
    row.innerHTML = `
      <span style="width:12px;text-align:center;color:var(--pt-muted,#6E7780);font-size:11px">${iconFor(node)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(node.name)}">${esc(node.name)}</span>
      ${node.category && !isFolder ? `<span style="font:600 9px Inter;letter-spacing:1px;text-transform:uppercase;color:${categoryColor(node.category)}">${node.category[0]}</span>` : ''}
    `;
    row.addEventListener('mouseenter', () => { if (selectedId !== node.id) row.style.background = 'rgba(0,0,0,.04)'; });
    row.addEventListener('mouseleave', () => { if (selectedId !== node.id) row.style.background = ''; });
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isFolder) toggle(node.id); else selectNode(node.id);
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e.clientX, e.clientY, node);
    });
    parent.appendChild(row);

    if (isFolder && expanded.has(node.id)) {
      (node.children || []).forEach(c => renderNode(c, depth + 1, parent));
    }
  }

  function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  // ---------- context menu ----------
  function openContextMenu(x, y, node) {
    closeContextMenu();
    menuEl = document.createElement('div');
    menuEl.style.cssText = `
      position:fixed;top:${y}px;left:${x}px;z-index:10000;
      background:#fff;border:1px solid var(--pt-rule,#D6D9DD);border-radius:4px;
      box-shadow:var(--pt-elev-3,0 4px 12px rgba(0,0,0,.15));
      font:12px Inter;min-width:180px;padding:4px 0;
    `;
    // Right-click action set. Items emitted as `'context'` are routed by
    // `apps/cyclecad/index.html`'s `ACTION_MAP` to the relevant widget.
    // Use `{divider:true}` to render a horizontal rule, and `enabled` to
    // type-gate items so they only show on relevant kinds.
    const isPart     = node.kind === 'part' || node.kind === 'sheet-metal';
    const isAssembly = node.kind === 'assembly' || node.kind === 'subassembly';
    const isProject  = node.kind === 'project' || node.kind === 'root' || !node.kind;
    const items = [
      { label: 'Open',                  act: 'open' },
      { label: 'Show in viewport',      act: 'show' },
      { divider: true },
      { label: 'Reverse engineer…',     act: 're',                  enabled: isPart || isAssembly },
      { label: 'Create tutorial…',      act: 'create-tutorial',     enabled: isPart || isAssembly || isProject },
      { label: 'Run tutorial',          act: 'run-tutorial',        enabled: isPart || isAssembly || isProject },
      { label: 'Generate drawings',     act: 'generate-drawings',   enabled: isPart || isAssembly || isProject },
      { label: 'Build work package',    act: 'build-work-package',  enabled: isProject || isAssembly },
      { divider: true },
      { label: 'Versions',              act: 'versions' },
      { label: 'Attachments',           act: 'attachments' },
      { label: 'Export bundle…',        act: 'export-bundle',       enabled: isPart || isAssembly || isProject },
      { divider: true },
      { label: 'Copy path',             act: 'copy-path' },
      { label: 'Reveal in finder',      act: 'reveal' },
    ];
    items.forEach(item => {
      if (item.divider) {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--pt-rule,#D6D9DD);margin:4px 0;';
        menuEl.appendChild(sep);
        return;
      }
      // Type-gate: hide the row entirely if the node kind doesn't qualify.
      if (item.enabled === false) return;
      const it = document.createElement('div');
      it.textContent = item.label;
      it.style.cssText = 'padding:6px 14px;cursor:pointer';
      it.addEventListener('mouseenter', () => it.style.background = 'rgba(3,177,136,.12)');
      it.addEventListener('mouseleave', () => it.style.background = '');
      it.addEventListener('click', () => {
        emit('context', { action: item.act, id: node.id, kind: node.kind, path: node.path || node.name, node });
        closeContextMenu();
      });
      menuEl.appendChild(it);
    });
    document.body.appendChild(menuEl);
  }
  function closeContextMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }

  // close menu on any document click — scoped to a single tracked listener
  const onDocClick = () => closeContextMenu();
  track(document, 'click', onDocClick);

  // ---------- helpers ----------
  function findNode(id, n = tree) {
    if (!n) return null;
    if (n.id === id) return n;
    for (const c of (n.children || [])) {
      const f = findNode(id, c);
      if (f) return f;
    }
    return null;
  }

  function toggle(id) {
    if (expanded.has(id)) { expanded.delete(id); emit('collapse', { id }); }
    else                  { expanded.add(id);    emit('expand',   { id }); }
    renderTree();
    emit('change', { kind: 'toggle', id });
  }

  function selectNode(id) {
    const node = findNode(id);
    if (!node) return;
    selectedId = id;
    renderTree();
    const payload = { id, kind: node.kind, path: node.path || node.name };
    emit('select', payload);
    emit('change', { kind: 'select', ...payload });
  }

  // ---------- API ----------
  async function loadProject(idOrPath) {
    projectId = String(idOrPath || 'demo');
    nameEl.textContent  = projectId;
    crumbEl.textContent = `/${projectId}`;
    statusEl.textContent = 'loading…';
    let fetched = null;
    try {
      if (meter && typeof meter.charge === 'function') {
        await meter.charge({ widget: 'library-browser', kind: 'loadProject', tokensIn: 1, tokensOut: 1, modelTier: 'haiku' });
      }
      fetched = await fetcher(projectId);
    } catch (e) {
      emit('error', { kind: 'fetch', error: e?.message || String(e) });
    }
    tree = fetched || params.demoTree || DEMO_DUO_TREE;
    nameEl.textContent  = tree.name || projectId;
    crumbEl.textContent = tree.path || `/${projectId}`;
    expanded.clear();
    if (tree.children && tree.children[0]) expanded.add(tree.children[0].id);
    renderTree();
    emit('change', { kind: 'load', projectId, source: fetched ? 'server' : 'demo' });
    return tree;
  }

  function expandNode(id)  { if (!expanded.has(id)) { expanded.add(id); renderTree(); emit('expand',   { id }); emit('change', { kind: 'expand',   id }); } }
  function collapseNode(id){ if (expanded.has(id))  { expanded.delete(id); renderTree(); emit('collapse', { id }); emit('change', { kind: 'collapse', id }); } }

  function filterCategory(cat) {
    if (!['all','custom','vendor','standard'].includes(cat)) return;
    category = cat;
    Array.from(wrap.querySelectorAll('[data-pill]')).forEach(b => {
      const active = b.dataset.pill === cat;
      b.style.background = active ? 'var(--pt-green,#03B188)' : '#fff';
      b.style.color      = active ? '#fff' : 'var(--pt-muted,#6E7780)';
      b.style.borderColor= active ? 'var(--pt-green,#03B188)' : 'var(--pt-rule,#D6D9DD)';
    });
    renderTree();
    emit('filter', { category: cat });
    emit('change', { kind: 'filter', category: cat });
  }

  function searchByName(q) {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    searchTimer = setTimeout(() => {
      query = String(q || '').trim().toLowerCase();
      renderTree();
      emit('change', { kind: 'search', query });
    }, SEARCH_DEBOUNCE_MS);
  }

  async function refresh() { return loadProject(projectId || 'demo'); }

  // ---------- wire up controls ----------
  Array.from(wrap.querySelectorAll('[data-pill]')).forEach(btn => {
    btn.addEventListener('click', () => filterCategory(btn.dataset.pill));
  });
  searchEl.addEventListener('input', (e) => searchByName(e.target.value));

  filterCategory('all');
  await loadProject(params.projectId || 'demo');

  return {
    api: {
      loadProject,
      expandNode,
      collapseNode,
      selectNode,
      filterCategory,
      searchByName,
      refresh,
      fetchTree: fetcher,            // exposed for mocking in tests
      getTree:   () => tree,
      getSelected: () => selectedId,
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      if (searchTimer) clearTimeout(searchTimer);
      closeContextMenu();
      trackedListeners.forEach(({ target, type, fn }) => target.removeEventListener(type, fn));
      trackedListeners.length = 0;
      wrap.remove();
    },
  };
}
