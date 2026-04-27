/**
 * @file widgets/project-tree.js
 * @description Single-assembly component graph. Different from
 *   `library-browser.js`: instead of the whole project, this widget
 *   scopes to ONE assembly and shows its immediate children as a flat
 *   indented list, with a breadcrumb back to the parent assembly and a
 *   small SVG mini-graph that paints the parent / siblings / children
 *   neighborhood when the user hovers a row.
 *
 *   Contract:
 *     init({ mount, app, meter, params? }) → { api, on, destroy }
 *     api.loadAssembly(componentId)
 *     api.goUp()             — to parent assembly (if any)
 *     api.goDown(componentId)
 *     api.highlightOccurrence(id)  emits 'highlight' { id }
 *     api.getDepth()         — current navigation depth
 *
 *   Events: 'select' · 'navigate' · 'highlight' · 'change' · 'error'.
 *
 *   The data model is a flat map { id → ComponentNode } where each node
 *   declares parent + children ids. `params.demoGraph` seeds a default
 *   neighborhood pulled from the DUO/Workspaces/Arbeitsbereich layout.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const ENDPOINT_ASSEMBLY = (id) => `/api/library/assemblies/${encodeURIComponent(id)}`;

/** Default DUO assembly graph — parent/sibling/child topology rooted at
 *  the DUO Anlage assembly so the mini-graph tells a real story. */
const DEMO_DUO_GRAPH = {
  rootId: 'duo-anlage',
  nodes: {
    'home':            { id: 'home',           name: 'Home',                 kind: 'project',  parent: null,            children: ['duo-anlage', 'mini-duo'] },
    'duo-anlage':      { id: 'duo-anlage',     name: 'DUO Anlage',           kind: 'assembly', parent: 'home',          children: ['gestell','seitenwand','lenkerhalterung','waschbuersten','raddreheinheit','ultraschallreiniger'] },
    'mini-duo':        { id: 'mini-duo',       name: 'MiniDuo NX_11',        kind: 'assembly', parent: 'home',          children: [] },
    'gestell':         { id: 'gestell',        name: 'Gestell',              kind: 'assembly', parent: 'duo-anlage',    children: ['traeger','anschraubplatte3','anschraubplatte11','anschraubplatte3_1'] },
    'traeger':         { id: 'traeger',        name: 'Träger',               kind: 'part',     parent: 'gestell',       children: [] },
    'anschraubplatte3':{ id: 'anschraubplatte3',name:'Anschraubplatte3',     kind: 'part',     parent: 'gestell',       children: [] },
    'anschraubplatte11':{id: 'anschraubplatte11',name:'Anschraubplatte11',   kind: 'part',     parent: 'gestell',       children: [] },
    'anschraubplatte3_1':{id:'anschraubplatte3_1',name:'Anschraubplatte3_1', kind: 'part',     parent: 'gestell',       children: [] },
    'seitenwand':      { id: 'seitenwand',     name: 'Seitenwand',           kind: 'assembly', parent: 'duo-anlage',    children: ['sw-skizze','sw-blech-h','sw-blech-v'] },
    'sw-skizze':       { id: 'sw-skizze',      name: 'Parameter Skizze_V3',  kind: 'sketch',   parent: 'seitenwand',    children: [] },
    'sw-blech-h':      { id: 'sw-blech-h',     name: 'SBG_Unterteil_hinten', kind: 'sheet-metal', parent: 'seitenwand', children: [] },
    'sw-blech-v':      { id: 'sw-blech-v',     name: 'SBG_Unterteil_vorne',  kind: 'sheet-metal', parent: 'seitenwand', children: [] },
    'lenkerhalterung': { id: 'lenkerhalterung',name: 'Lenkerhalterung',      kind: 'assembly', parent: 'duo-anlage',    children: ['lh-iam','lh-rohr','lh-stange'] },
    'lh-iam':          { id: 'lh-iam',         name: 'BG-Sattelhalterung',   kind: 'assembly', parent: 'lenkerhalterung', children: [] },
    'lh-rohr':         { id: 'lh-rohr',        name: 'DIN EN 10305-4 E235',  kind: 'part',     parent: 'lenkerhalterung', children: [] },
    'lh-stange':       { id: 'lh-stange',      name: 'Gewindestange',        kind: 'part',     parent: 'lenkerhalterung', children: [] },
    'waschbuersten':   { id: 'waschbuersten',  name: 'Waschbürsten',         kind: 'assembly', parent: 'duo-anlage',    children: ['wb-r1','wb-r2','wb-tr'] },
    'wb-r1':           { id: 'wb-r1',          name: 'Riemen1',              kind: 'part',     parent: 'waschbuersten', children: [] },
    'wb-r2':           { id: 'wb-r2',          name: 'starrer Riemen2',      kind: 'part',     parent: 'waschbuersten', children: [] },
    'wb-tr':           { id: 'wb-tr',          name: 'TrägerWB2',            kind: 'part',     parent: 'waschbuersten', children: [] },
    'raddreheinheit':  { id: 'raddreheinheit', name: 'Raddreheinheit',       kind: 'assembly', parent: 'duo-anlage',    children: ['rd-tr'] },
    'rd-tr':           { id: 'rd-tr',          name: 'Träger Raddreheinheit',kind: 'part',     parent: 'raddreheinheit',children: [] },
    'ultraschallreiniger':{ id:'ultraschallreiniger',name:'Ultraschallreiniger',kind:'assembly',parent:'duo-anlage',  children: ['us-rohr','us-bolz'] },
    'us-rohr':         { id: 'us-rohr',        name: 'Rohr_01',              kind: 'part',     parent: 'ultraschallreiniger', children: [] },
    'us-bolz':         { id: 'us-bolz',        name: 'GewBolzenM4x8',        kind: 'part',     parent: 'ultraschallreiniger', children: [] },
  },
};

const KIND_GLYPH = {
  project:      '◆',
  assembly:     '▣',
  part:         '▦',
  drawing:      '▤',
  'sheet-metal':'▥',
  sketch:       '✎',
};

async function defaultFetchAssembly(id) {
  try {
    const r = await fetch(ENDPOINT_ASSEMBLY(id));
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

/**
 * Mount the single-assembly project tree.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: {
 *     rootId?: string,
 *     demoGraph?: { rootId: string, nodes: Record<string, object> },
 *     fetchAssembly?: (id: string) => Promise<object>
 *   }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     loadAssembly: (componentId: string) => Promise<void>,
 *     goUp: () => void,
 *     goDown: (componentId: string) => void,
 *     highlightOccurrence: (id: string) => void,
 *     getDepth: () => number
 *   },
 *   on: (event: 'select'|'navigate'|'highlight'|'change'|'error', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('project-tree: mount not found');

  const params  = opts.params || {};
  const meter   = opts.meter;
  const fetcher = params.fetchAssembly || defaultFetchAssembly;

  const wrap = document.createElement('div');
  wrap.className = 'pt-project-tree';
  wrap.style.cssText = `
    font: 13px/1.4 Inter, -apple-system, sans-serif; color: var(--pt-ink, #0F1416);
    background: #FFFFFF; border: 1px solid var(--pt-rule, #D6D9DD);
    border-radius: var(--pt-radius, 4px); width: 360px; min-height: 460px;
    display: flex; flex-direction: column; overflow: hidden;
  `;
  wrap.innerHTML = `
    <header style="padding:8px 10px;background:var(--pt-cream,#F4F1EA);border-bottom:1px solid var(--pt-rule,#D6D9DD);display:flex;align-items:center;gap:6px">
      <button data-up title="Go up" style="background:#fff;border:1px solid var(--pt-rule,#D6D9DD);padding:2px 8px;border-radius:3px;cursor:pointer;font:11px Inter">↑</button>
      <div data-crumb style="flex:1;font:11px Menlo,monospace;color:var(--pt-muted,#6E7780);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">/</div>
      <span data-depth style="font:600 10px Inter;color:var(--pt-violet,#8B5CF6);letter-spacing:1px">D0</span>
    </header>
    <div data-current style="padding:8px 10px;border-bottom:1px solid var(--pt-rule,#D6D9DD)">
      <div style="font:600 10px Inter;letter-spacing:2px;color:var(--pt-muted,#6E7780);text-transform:uppercase">CURRENT</div>
      <div data-current-name style="font:600 14px Georgia,serif;margin-top:2px">—</div>
    </div>
    <div data-children style="flex:1;overflow:auto;padding:6px 4px"></div>
    <div style="padding:6px 8px;border-top:1px solid var(--pt-rule,#D6D9DD);background:var(--pt-cream,#F4F1EA)">
      <div style="font:600 9px Inter;letter-spacing:2px;color:var(--pt-muted,#6E7780);text-transform:uppercase;margin-bottom:4px">NEIGHBORHOOD</div>
      <svg data-graph viewBox="0 0 340 110" width="100%" height="110" style="display:block"></svg>
    </div>
    <footer data-status style="padding:4px 10px;font:10px Menlo,monospace;color:var(--pt-muted,#6E7780);border-top:1px solid var(--pt-rule,#D6D9DD)"></footer>
  `;
  root.appendChild(wrap);

  const $ = (s) => wrap.querySelector(s);
  const crumbEl    = $('[data-crumb]');
  const depthEl    = $('[data-depth]');
  const currentEl  = $('[data-current-name]');
  const childrenEl = $('[data-children]');
  const graphEl    = $('[data-graph]');
  const statusEl   = $('[data-status]');

  // ---------- state ----------
  const listeners = { change: [], select: [], navigate: [], highlight: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });
  const tracked = [];
  function track(target, type, fn) { target.addEventListener(type, fn); tracked.push({ target, type, fn }); }

  let graph = null;
  let currentId = null;
  let hoveredId = null;
  let highlightedId = null;

  function getNode(id) { return graph?.nodes?.[id] || null; }
  function getDepth() {
    let d = 0, n = getNode(currentId);
    while (n && n.parent) { d += 1; n = getNode(n.parent); }
    return d;
  }
  function pathToRoot(id) {
    const out = [];
    let n = getNode(id);
    while (n) { out.unshift(n); n = n.parent ? getNode(n.parent) : null; }
    return out;
  }

  function render() {
    if (!graph || !currentId) {
      crumbEl.textContent = '/';
      currentEl.textContent = '—';
      childrenEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--pt-muted);font:italic 12px Inter">no assembly loaded</div>';
      graphEl.innerHTML = '';
      statusEl.textContent = '';
      depthEl.textContent = 'D0';
      return;
    }
    const cur = getNode(currentId);
    if (!cur) return;
    const path = pathToRoot(currentId);
    crumbEl.textContent  = '/ ' + path.map(p => p.name).join(' / ');
    crumbEl.title        = crumbEl.textContent;
    currentEl.textContent = `${KIND_GLYPH[cur.kind] || '·'} ${cur.name}`;
    depthEl.textContent  = 'D' + getDepth();

    childrenEl.innerHTML = '';
    if (!cur.children || cur.children.length === 0) {
      childrenEl.innerHTML = '<div style="padding:18px;text-align:center;color:var(--pt-muted);font:italic 12px Inter">leaf node — no children</div>';
    } else {
      cur.children.forEach((cid, idx) => {
        const c = getNode(cid);
        if (!c) return;
        const row = document.createElement('div');
        row.dataset.id = c.id;
        row.style.cssText = `
          display:flex;align-items:center;gap:6px;padding:4px 8px 4px ${10 + Math.min(idx,0)*12}px;
          cursor:pointer;border-radius:3px;
          ${highlightedId === c.id ? 'background:rgba(212,168,67,.20);' : ''}
        `;
        row.innerHTML = `
          <span style="width:14px;text-align:center;color:var(--pt-muted,#6E7780)">${KIND_GLYPH[c.kind] || '·'}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span>
          <span style="font:600 9px Inter;letter-spacing:1px;color:var(--pt-muted,#6E7780);text-transform:uppercase">${c.kind}</span>
        `;
        row.addEventListener('mouseenter', () => { hoveredId = c.id; row.style.background = 'rgba(3,177,136,.10)'; renderGraph(); });
        row.addEventListener('mouseleave', () => { hoveredId = null;  if (highlightedId !== c.id) row.style.background = ''; renderGraph(); });
        row.addEventListener('click', () => {
          emit('select', { id: c.id, kind: c.kind });
          if (c.kind === 'assembly') goDown(c.id);
        });
        row.addEventListener('dblclick', () => goDown(c.id));
        childrenEl.appendChild(row);
      });
    }
    statusEl.textContent = `${cur.children?.length || 0} children · depth ${getDepth()} · ${currentId}`;
    renderGraph();
  }

  // ---------- mini SVG graph ----------
  // Layout: parent on top center, current in middle (with siblings to its
  // left/right), and the first 5 children at the bottom. Lines connect
  // parent→current and current→children. Pure SVG, no libs.
  function renderGraph() {
    if (!graph || !currentId) { graphEl.innerHTML = ''; return; }
    const cur = getNode(currentId);
    if (!cur) return;
    const W = 340, H = 110;
    const pieces = [];
    const parent = cur.parent ? getNode(cur.parent) : null;
    const siblings = parent ? parent.children.filter(x => x !== cur.id).slice(0, 4).map(getNode).filter(Boolean) : [];
    const children = (cur.children || []).slice(0, 6).map(getNode).filter(Boolean);

    const cx = W / 2, cy = H / 2;
    const focused = hoveredId || highlightedId || currentId;

    // parent
    if (parent) {
      pieces.push(line(cx, cy, cx, 14, focused === parent.id ? 'var(--pt-violet,#8B5CF6)' : 'var(--pt-rule,#D6D9DD)'));
      pieces.push(box(cx - 50, 4, 100, 20, parent.name, parent.kind, focused === parent.id));
    }
    // siblings
    siblings.forEach((s, i) => {
      const sx = (i < 2 ? 30 + i * 48 : (W - 30 - (i - 2) * 48));
      pieces.push(line(cx, cy, sx, cy, 'var(--pt-rule,#D6D9DD)'));
      pieces.push(box(sx - 28, cy - 10, 56, 20, s.name, s.kind, focused === s.id));
    });
    // current
    pieces.push(box(cx - 60, cy - 12, 120, 24, cur.name, cur.kind, true));
    // children
    const childY = H - 18;
    children.forEach((c, i) => {
      const cxx = 30 + i * (W - 60) / Math.max(children.length - 1, 1);
      pieces.push(line(cx, cy + 12, cxx, childY, focused === c.id ? 'var(--gold,#D4A843)' : 'var(--pt-rule,#D6D9DD)'));
      pieces.push(box(cxx - 24, childY - 8, 48, 16, c.name, c.kind, focused === c.id));
    });

    graphEl.innerHTML = pieces.join('');
  }

  function line(x1, y1, x2, y2, color) {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"/>`;
  }
  function box(x, y, w, h, label, kind, focused) {
    const fill   = focused ? 'var(--pt-green,#03B188)' : '#fff';
    const stroke = focused ? 'var(--pt-green-dark,#028F6D)' : 'var(--pt-rule,#D6D9DD)';
    const text   = focused ? '#fff' : 'var(--pt-ink,#0F1416)';
    const trim   = label.length > 14 ? label.slice(0, 13) + '…' : label;
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}"/>
      <text x="${x + w/2}" y="${y + h/2 + 3}" text-anchor="middle" font-family="Inter" font-size="9" fill="${text}">${esc(trim)}</text>
    </g>`;
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ---------- API ----------
  async function loadAssembly(id) {
    if (meter && typeof meter.charge === 'function') {
      try { await meter.charge({ widget: 'project-tree', kind: 'loadAssembly', tokensIn: 1, tokensOut: 1, modelTier: 'haiku' }); } catch {}
    }
    let fetched = null;
    try { fetched = await fetcher(id); } catch (e) { emit('error', { kind: 'fetch', error: e?.message || String(e) }); }
    graph = fetched || params.demoGraph || DEMO_DUO_GRAPH;
    if (!graph.nodes[id]) id = graph.rootId || Object.keys(graph.nodes)[0];
    currentId = id;
    render();
    emit('navigate', { id, depth: getDepth() });
    emit('change', { kind: 'load', id });
    return graph;
  }

  function goUp() {
    const cur = getNode(currentId);
    if (!cur || !cur.parent) return false;
    currentId = cur.parent;
    render();
    emit('navigate', { id: currentId, depth: getDepth(), direction: 'up' });
    emit('change', { kind: 'navigate', id: currentId });
    return true;
  }

  function goDown(id) {
    const child = getNode(id);
    if (!child) return false;
    currentId = id;
    render();
    emit('navigate', { id, depth: getDepth(), direction: 'down' });
    emit('change', { kind: 'navigate', id });
    return true;
  }

  function highlightOccurrence(id) {
    highlightedId = id;
    render();
    emit('highlight', { id });
    emit('change', { kind: 'highlight', id });
  }

  // wire toolbar
  $('[data-up]').addEventListener('click', goUp);

  await loadAssembly(params.startId || (params.demoGraph?.rootId) || DEMO_DUO_GRAPH.rootId);

  return {
    api: {
      loadAssembly,
      goUp,
      goDown,
      highlightOccurrence,
      getDepth,
      getCurrent:   () => currentId,
      getGraph:     () => graph,
      fetchAssembly: fetcher,   // for tests
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      tracked.forEach(({ target, type, fn }) => target.removeEventListener(type, fn));
      tracked.length = 0;
      wrap.remove();
    },
  };
}
