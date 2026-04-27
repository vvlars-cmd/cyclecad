/**
 * @file widgets/setup-manager.js
 * @description Pentacad CAM session manager — the side-panel that
 *   aggregates the active CAM session: tools, stock, fixture, and the
 *   ordered list of operations. Each operation row references a strategy
 *   id (cf. `shared/strategies/index.json`) plus a frozen params object
 *   that one of the cam-* widgets produced.
 *
 *   The Post All button concatenates every operation's NGC into a single
 *   program with `T#` blocks marking the seams, returns the joined NGC
 *   plus a per-op breakdown.
 *
 *   API:
 *     api.addOp(strategyId, params)       → opId
 *     api.removeOp(opId)
 *     api.reorder(fromIdx, toIdx)
 *     api.postAll()                       → { ngc, perOp[] }
 *     api.exportSession()                 → JSON
 *     api.importSession(json)
 *     api.addTool({ number, type, … })
 *     api.removeTool(number)
 *
 *   Events: 'change' · 'post' · 'export' · 'import'
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import STRATEGIES from '../shared/strategies/index.json' with { type: 'json' };
import { defaultMachine, getMachine, envelopeSummary } from '../shared/machines/index.js';
import { emitProgram } from './post-processor.js';

/**
 * @typedef {{ number:number, type:string, diameter:number, length:number, comment:string }} ToolDef
 * @typedef {{ kind:'block'|'cylinder', x:number, y:number, z:number, material:string }} StockDef
 * @typedef {{ name:string, holding:'vise'|'softjaws'|'chuck'|'tombstone' }} FixtureDef
 * @typedef {{ id:string, strategyId:string, name:string, params:Object<string,any>, toolNumber?:number }} OperationDef
 *
 * @typedef {{
 *   tools: ToolDef[],
 *   stock: StockDef,
 *   fixture: FixtureDef,
 *   operations: OperationDef[],
 *   machineId: string,
 * }} SessionState
 */

/**
 * @returns {SessionState}
 */
function defaultSession() {
  return {
    tools: [
      { number: 1, type: 'flat',  diameter: 6,  length: 24, comment: '6 mm flat endmill' },
      { number: 2, type: 'flat',  diameter: 4,  length: 20, comment: '4 mm pocket clear' },
      { number: 3, type: 'drill', diameter: 5,  length: 25, comment: '5 mm carbide drill' },
    ],
    stock: { kind: 'block', x: 100, y: 80, z: 25, material: '6061' },
    fixture: { name: 'std vise', holding: 'vise' },
    operations: [],
    machineId: defaultMachine().id,
  };
}

/** @returns {string} */
function newId() { return `op_${Math.random().toString(36).slice(2, 10)}`; }

/**
 * Look up a strategy descriptor by id, with safe fallback.
 *
 * @param {string} id
 */
function descFor(id) {
  try {
    return STRATEGIES.strategies.find(s => s.id === id) || null;
  } catch { return null; }
}

/**
 * Generate a synthetic motion stream for an operation. Each strategy id maps
 * to a small parametric motion sequence — these are the same shapes the
 * cam-* widgets emit but inlined here so postAll() works without re-mounting
 * every widget.
 *
 * @param {OperationDef} op
 * @returns {import('./post-processor.js').MotionRecord[]}
 */
function motionsFor(op) {
  const p = op.params || {};
  const tn = op.toolNumber || 1;
  const c = Array.isArray(p.centre) ? p.centre : Array.isArray(p.boundary) ? p.boundary : [10, 10, 0];

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const intro = [
    { kind: 'comment', text: `op · ${op.name} · ${op.strategyId}` },
    { kind: 'tool-change', toolNumber: tn, description: op.name },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: Number(p.spindleRpm || 8000), dir: 'cw' },
    { kind: 'coolant', mode: 'flood' },
  ];
  /** @type {import('./post-processor.js').MotionRecord[]} */
  const outro = [
    { kind: 'rapid', Z: 5 },
    { kind: 'spindle', mode: 'off' },
    { kind: 'coolant', mode: 'off' },
  ];

  /** @type {import('./post-processor.js').MotionRecord[]} */
  const body = [];
  switch (op.strategyId) {
    case 'contour': {
      body.push({ kind: 'rapid', X: 0, Y: 0, Z: 5 });
      body.push({ kind: 'linear', Z: -1, F: 200 });
      body.push({ kind: 'linear', X: 30, Y: 0, F: 600 });
      body.push({ kind: 'linear', X: 30, Y: 20 });
      body.push({ kind: 'linear', X: 0, Y: 20 });
      body.push({ kind: 'linear', X: 0, Y: 0 });
      break;
    }
    case 'pocket': {
      body.push({ kind: 'rapid', X: c[0], Y: c[1], Z: 5 });
      body.push({ kind: 'linear', Z: -1, F: 200 });
      for (let r = 1; r <= 4; r++) {
        body.push({ kind: 'linear', X: c[0] - r * 2, Y: c[1] - r * 2, F: 500 });
        body.push({ kind: 'linear', X: c[0] + r * 2, Y: c[1] - r * 2 });
        body.push({ kind: 'linear', X: c[0] + r * 2, Y: c[1] + r * 2 });
        body.push({ kind: 'linear', X: c[0] - r * 2, Y: c[1] + r * 2 });
        body.push({ kind: 'linear', X: c[0] - r * 2, Y: c[1] - r * 2 });
      }
      break;
    }
    case 'drill': {
      const n = Math.max(1, Math.floor(Number(p.points) || 4));
      const depth = Number(p.depth || 6);
      for (let i = 0; i < n; i++) {
        body.push({ kind: 'rapid', X: i * 8, Y: 0, Z: 5 });
        body.push({ kind: 'linear', Z: -depth, F: 150 });
        body.push({ kind: 'rapid', Z: 5 });
      }
      break;
    }
    case 'face': {
      const so = Number(p.stepOver || 6);
      body.push({ kind: 'rapid', X: -30, Y: -20, Z: 5 });
      body.push({ kind: 'linear', Z: -0.3, F: 300 });
      let dir = 1;
      for (let y = -20; y <= 20; y += so) {
        body.push({ kind: 'linear', X: dir > 0 ? 30 : -30, Y: y, F: 800 });
        dir *= -1;
      }
      break;
    }
    case 'adaptive': {
      const so = Number(p.stepOver || 1.5);
      body.push({ kind: 'rapid', X: 0, Y: 0, Z: 5 });
      body.push({ kind: 'linear', Z: -3, F: 400 });
      for (let i = 0; i < 8; i++) {
        body.push({ kind: 'linear', X: i * so * 1.6, F: 1500 });
        body.push({ kind: 'arc', dir: 'cw', X: i * so * 1.6, Y: 0, I: 0, J: so, F: 1500 });
      }
      break;
    }
    case 'chamfer': {
      const r = 20;
      const edges = Math.max(3, Math.floor(Number(p.edges) || 4));
      body.push({ kind: 'rapid', X: r, Y: 0, Z: 5 });
      body.push({ kind: 'linear', Z: -0.3, F: 200 });
      for (let i = 1; i <= edges; i++) {
        const t = (i / edges) * Math.PI * 2;
        body.push({ kind: 'linear', X: r * Math.cos(t), Y: r * Math.sin(t), F: 800 });
      }
      break;
    }
    case 'bore': {
      const r = (Number(p.diameter || 12)) / 2;
      body.push({ kind: 'rapid', X: c[0] + r, Y: c[1], Z: 5 });
      body.push({ kind: 'linear', Z: 0, F: 250 });
      body.push({ kind: 'arc', dir: 'cw', X: c[0] - r, Y: c[1], I: -r, J: 0, F: 250 });
      body.push({ kind: 'arc', dir: 'cw', X: c[0] + r, Y: c[1], I:  r, J: 0, F: 250 });
      break;
    }
    case 'thread': {
      const r = (Number(p.diameter || 10)) / 2;
      const pitch = Number(p.pitch || 1.5);
      body.push({ kind: 'rapid', X: c[0] + r, Y: c[1], Z: 5 });
      body.push({ kind: 'linear', Z: 0, F: 250 });
      let z = 0;
      for (let t = 1; t <= 4; t++) {
        z -= pitch / 2;
        body.push({ kind: 'arc', dir: 'ccw', X: c[0] - r, Y: c[1], I: -r, J: 0, F: 350 });
        z -= pitch / 2;
        body.push({ kind: 'arc', dir: 'ccw', X: c[0] + r, Y: c[1], I:  r, J: 0, F: 350 });
        body.push({ kind: 'linear', Z: z, F: 350 });
      }
      break;
    }
    default:
      body.push({ kind: 'rapid', X: 0, Y: 0, Z: 5 });
  }
  return [...intro, ...body, ...outro];
}

/**
 * @param {{ mount:string|HTMLElement, app?:string,
 *           meter?:{ charge:Function },
 *           params?:{ machineId?:string, session?: SessionState } }} opts
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('setup-manager: mount not found');

  /** @type {SessionState} */
  let session = opts.params?.session ? structuredClone(opts.params.session) : defaultSession();
  if (opts.params?.machineId) session.machineId = opts.params.machineId;

  /** @type {Record<string, Function[]>} */
  const listeners = { change: [], post: [], export: [], import: [] };
  /** @param {string} ev @param {*} p */
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch { /* swallow */ } });

  const dom = document.createElement('div');
  dom.className = 'pt-setup-manager';
  dom.style.cssText = 'padding:18px 20px;font:13px Inter,sans-serif;background:#fff;color:#0F172A;border:1px solid #E5E7EB;border-radius:8px;max-width:820px';
  dom.innerHTML = `
    <div style="font:600 11px Inter;color:#FFB800;letter-spacing:.18em;margin-bottom:6px">SETUP · MANAGER</div>
    <div style="font:600 22px Georgia,serif;margin-bottom:4px">CAM session</div>
    <div data-machine-meta style="color:#6B7280;font-size:12px;margin-bottom:14px"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <fieldset style="border:1px solid #E5E7EB;border-radius:6px;padding:10px">
        <legend style="font:600 10px Inter;color:#7C3AED;padding:0 6px;letter-spacing:.12em">TOOL TABLE</legend>
        <div data-tools></div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <input data-new-tool-num    type=number placeholder="#"   style="width:48px;padding:4px;font:12px JetBrains Mono;border:1px solid #d1d5db;border-radius:3px">
          <input data-new-tool-dia    type=number placeholder="dia" style="width:60px;padding:4px;font:12px JetBrains Mono;border:1px solid #d1d5db;border-radius:3px">
          <input data-new-tool-comment type=text  placeholder="comment" style="flex:1;padding:4px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px">
          <button data-add-tool style="background:#10B981;color:#fff;border:none;padding:4px 10px;border-radius:3px;font:600 11px Inter;cursor:pointer">+</button>
        </div>
      </fieldset>

      <fieldset style="border:1px solid #E5E7EB;border-radius:6px;padding:10px">
        <legend style="font:600 10px Inter;color:#7C3AED;padding:0 6px;letter-spacing:.12em">STOCK / FIXTURE</legend>
        <label style="display:block;font-size:10px;color:#6B7280">stock kind
          <select data-stock-kind style="width:100%;padding:4px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px">
            <option value="block">block</option><option value="cylinder">cylinder</option>
          </select>
        </label>
        <div style="display:flex;gap:4px;margin-top:4px">
          <input data-stock-x type=number style="width:33%;padding:4px;font:12px JetBrains Mono;border:1px solid #d1d5db;border-radius:3px">
          <input data-stock-y type=number style="width:33%;padding:4px;font:12px JetBrains Mono;border:1px solid #d1d5db;border-radius:3px">
          <input data-stock-z type=number style="width:33%;padding:4px;font:12px JetBrains Mono;border:1px solid #d1d5db;border-radius:3px">
        </div>
        <label style="display:block;font-size:10px;color:#6B7280;margin-top:6px">material
          <input data-stock-mat type=text style="width:100%;padding:4px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px">
        </label>
        <label style="display:block;font-size:10px;color:#6B7280;margin-top:6px">fixture
          <select data-fix-kind style="width:100%;padding:4px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px">
            <option value="vise">vise</option>
            <option value="softjaws">softjaws</option>
            <option value="chuck">chuck</option>
            <option value="tombstone">tombstone</option>
          </select>
        </label>
        <label style="display:block;font-size:10px;color:#6B7280;margin-top:6px">fixture name
          <input data-fix-name type=text style="width:100%;padding:4px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px">
        </label>
      </fieldset>
    </div>

    <fieldset style="border:1px solid #E5E7EB;border-radius:6px;padding:10px;margin-bottom:14px">
      <legend style="font:600 10px Inter;color:#7C3AED;padding:0 6px;letter-spacing:.12em">OPERATIONS</legend>
      <div data-ops></div>
      <div style="display:flex;gap:6px;margin-top:8px;align-items:center">
        <select data-new-op style="flex:1;padding:5px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px"></select>
        <button data-add-op style="background:#7C3AED;color:#fff;border:none;padding:6px 14px;border-radius:3px;font:600 11px Inter;cursor:pointer">+ ADD OP</button>
      </div>
    </fieldset>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <button data-post-all style="background:#7C3AED;color:#fff;border:none;padding:8px 18px;border-radius:5px;font:600 12px Inter;cursor:pointer">⚙ POST ALL</button>
      <button data-export   style="background:#fff;color:#0F172A;border:1px solid #D1D5DB;padding:8px 14px;border-radius:5px;font:600 12px Inter;cursor:pointer">⬇ Export session</button>
      <label style="background:#fff;color:#0F172A;border:1px solid #D1D5DB;padding:8px 14px;border-radius:5px;font:600 12px Inter;cursor:pointer">
        ⬆ Import <input data-import type="file" accept="application/json" style="display:none">
      </label>
      <span data-status style="margin-left:6px;font:11px JetBrains Mono,monospace;color:#6B7280;align-self:center">idle</span>
    </div>
    <pre data-ngc style="margin:0;padding:14px;background:#0F172A;color:#E2E8F0;font:12px JetBrains Mono,monospace;border-radius:6px;max-height:320px;overflow:auto;line-height:1.5;display:none"></pre>
  `;
  root.appendChild(dom);

  const $ = (s) => /** @type {HTMLElement} */ (dom.querySelector(s));
  const toolsEl = $('[data-tools]');
  const opsEl   = $('[data-ops]');
  const ngcEl   = /** @type {HTMLPreElement} */ ($('[data-ngc]'));
  const statusEl = $('[data-status]');
  const machineMetaEl = $('[data-machine-meta]');

  function renderMachine() {
    const m = getMachine(session.machineId) || defaultMachine();
    machineMetaEl.textContent = `${m.name} · ${m.controller} · ${envelopeSummary(m.id)}`;
  }

  function renderTools() {
    toolsEl.innerHTML = session.tools.length
      ? session.tools.map(t => `
        <div style="display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px dotted #E5E7EB">
          <span style="font:600 11px JetBrains Mono;color:#7C3AED;min-width:28px">T${t.number}</span>
          <span style="font:11px Inter;color:#374151;flex:1">${t.type} ⌀${t.diameter} · ${escapeHtml(t.comment || '')}</span>
          <button data-rm-tool="${t.number}" style="background:transparent;color:#E11D48;border:none;cursor:pointer;font:600 11px Inter">×</button>
        </div>
      `).join('')
      : '<div style="color:#9CA3AF;font:11px Inter;padding:6px 0">no tools</div>';
    toolsEl.querySelectorAll('[data-rm-tool]').forEach(el => {
      el.addEventListener('click', () => {
        const n = Number(el.getAttribute('data-rm-tool'));
        api.removeTool(n);
      });
    });
  }

  function renderOps() {
    opsEl.innerHTML = session.operations.length
      ? session.operations.map((o, i) => `
        <div data-op-row="${o.id}" style="display:flex;gap:6px;align-items:center;padding:6px 4px;border-bottom:1px dotted #E5E7EB">
          <span style="font:600 11px JetBrains Mono;color:#FFB800;min-width:18px">${i + 1}.</span>
          <span style="font:600 12px Inter;color:#0F172A;min-width:80px">${escapeHtml(o.strategyId)}</span>
          <span style="font:11px Inter;color:#6B7280;flex:1">${escapeHtml(o.name)}</span>
          <button data-up="${o.id}"   style="background:transparent;border:1px solid #D1D5DB;border-radius:3px;padding:1px 6px;cursor:pointer;font:11px Inter">↑</button>
          <button data-down="${o.id}" style="background:transparent;border:1px solid #D1D5DB;border-radius:3px;padding:1px 6px;cursor:pointer;font:11px Inter">↓</button>
          <button data-rm="${o.id}"   style="background:transparent;color:#E11D48;border:none;cursor:pointer;font:600 12px Inter">×</button>
        </div>
      `).join('')
      : '<div style="color:#9CA3AF;font:11px Inter;padding:6px 0">no operations queued</div>';

    opsEl.querySelectorAll('[data-rm]').forEach(el => {
      el.addEventListener('click', () => api.removeOp(/** @type {string} */ (el.getAttribute('data-rm'))));
    });
    opsEl.querySelectorAll('[data-up]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-up');
        const idx = session.operations.findIndex(o => o.id === id);
        if (idx > 0) api.reorder(idx, idx - 1);
      });
    });
    opsEl.querySelectorAll('[data-down]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-down');
        const idx = session.operations.findIndex(o => o.id === id);
        if (idx >= 0 && idx < session.operations.length - 1) api.reorder(idx, idx + 1);
      });
    });
  }

  function renderStockFixture() {
    /** @type {HTMLSelectElement} */ ($('[data-stock-kind]')).value = session.stock.kind;
    /** @type {HTMLInputElement} */ ($('[data-stock-x]')).value = String(session.stock.x);
    /** @type {HTMLInputElement} */ ($('[data-stock-y]')).value = String(session.stock.y);
    /** @type {HTMLInputElement} */ ($('[data-stock-z]')).value = String(session.stock.z);
    /** @type {HTMLInputElement} */ ($('[data-stock-mat]')).value = session.stock.material;
    /** @type {HTMLSelectElement} */ ($('[data-fix-kind]')).value = session.fixture.holding;
    /** @type {HTMLInputElement} */ ($('[data-fix-name]')).value = session.fixture.name;
  }

  function renderNewOpDropdown() {
    const select = /** @type {HTMLSelectElement} */ ($('[data-new-op]'));
    let phase1 = [];
    try { phase1 = STRATEGIES.strategies.filter(s => s.phase === 1); } catch { /* registry unavailable */ }
    select.innerHTML = phase1.map(s => `<option value="${s.id}">${s.id} · ${s.name}</option>`).join('');
  }

  function renderAll() {
    renderMachine();
    renderTools();
    renderOps();
    renderStockFixture();
    renderNewOpDropdown();
  }
  renderAll();

  /** @type {HTMLInputElement} */
  const stockKindEl = /** @type {any} */ ($('[data-stock-kind]'));
  ['data-stock-kind', 'data-stock-x', 'data-stock-y', 'data-stock-z', 'data-stock-mat',
   'data-fix-kind', 'data-fix-name'].forEach(sel => {
    $('[' + sel + ']').addEventListener('change', () => {
      session.stock = {
        kind: /** @type {any} */ (/** @type {HTMLSelectElement} */ ($('[data-stock-kind]')).value),
        x: Number(/** @type {HTMLInputElement} */ ($('[data-stock-x]')).value),
        y: Number(/** @type {HTMLInputElement} */ ($('[data-stock-y]')).value),
        z: Number(/** @type {HTMLInputElement} */ ($('[data-stock-z]')).value),
        material: /** @type {HTMLInputElement} */ ($('[data-stock-mat]')).value,
      };
      session.fixture = {
        holding: /** @type {any} */ (/** @type {HTMLSelectElement} */ ($('[data-fix-kind]')).value),
        name: /** @type {HTMLInputElement} */ ($('[data-fix-name]')).value,
      };
      emit('change', { kind: 'stock-fixture' });
    });
  });

  $('[data-add-tool]').addEventListener('click', () => {
    const num = Number(/** @type {HTMLInputElement} */ ($('[data-new-tool-num]')).value);
    const dia = Number(/** @type {HTMLInputElement} */ ($('[data-new-tool-dia]')).value);
    const cmt = /** @type {HTMLInputElement} */ ($('[data-new-tool-comment]')).value;
    if (!num || !dia) return;
    api.addTool({ number: num, type: 'flat', diameter: dia, length: 25, comment: cmt });
    /** @type {HTMLInputElement} */ ($('[data-new-tool-num]')).value = '';
    /** @type {HTMLInputElement} */ ($('[data-new-tool-dia]')).value = '';
    /** @type {HTMLInputElement} */ ($('[data-new-tool-comment]')).value = '';
  });

  $('[data-add-op]').addEventListener('click', () => {
    const sel = /** @type {HTMLSelectElement} */ ($('[data-new-op]'));
    api.addOp(sel.value, {});
  });

  $('[data-post-all]').addEventListener('click', () => {
    try { api.postAll(); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusEl.innerHTML = `<span style="color:#E11D48">err: ${escapeHtml(msg)}</span>`;
    }
  });

  $('[data-export]').addEventListener('click', () => api.exportSession());
  /** @type {HTMLInputElement} */ ($('[data-import]')).addEventListener('change', async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (!file) return;
    const txt = await file.text();
    try { api.importSession(JSON.parse(txt)); }
    catch (err) {
      statusEl.innerHTML = `<span style="color:#E11D48">import failed</span>`;
    }
  });

  const api = {
    /** @param {string} strategyId @param {Object<string,any>} params */
    addOp(strategyId, params) {
      const d = descFor(strategyId);
      const op = {
        id: newId(),
        strategyId,
        name: d?.name || strategyId,
        params: { ...params },
        toolNumber: session.tools[0]?.number || 1,
      };
      session.operations.push(op);
      renderOps();
      emit('change', { kind: 'add-op', op });
      return op.id;
    },
    /** @param {string} id */
    removeOp(id) {
      session.operations = session.operations.filter(o => o.id !== id);
      renderOps();
      emit('change', { kind: 'remove-op', id });
    },
    /** @param {number} fromIdx @param {number} toIdx */
    reorder(fromIdx, toIdx) {
      if (fromIdx < 0 || fromIdx >= session.operations.length) return;
      if (toIdx < 0 || toIdx >= session.operations.length) return;
      const [op] = session.operations.splice(fromIdx, 1);
      session.operations.splice(toIdx, 0, op);
      renderOps();
      emit('change', { kind: 'reorder', fromIdx, toIdx });
    },
    /** @param {ToolDef} t */
    addTool(t) {
      if (session.tools.find(x => x.number === t.number)) {
        session.tools = session.tools.map(x => x.number === t.number ? t : x);
      } else {
        session.tools.push(t);
      }
      renderTools();
      emit('change', { kind: 'add-tool', tool: t });
    },
    /** @param {number} num */
    removeTool(num) {
      session.tools = session.tools.filter(t => t.number !== num);
      renderTools();
      emit('change', { kind: 'remove-tool', number: num });
    },
    postAll() {
      if (session.operations.length === 0) {
        statusEl.innerHTML = '<span style="color:#9CA3AF">no operations</span>';
        return { ngc: '', perOp: [] };
      }
      const machine = getMachine(session.machineId) || defaultMachine();
      const allLines = ['%'];
      const perOp = [];
      // Single header
      allLines.push(`O0001`);
      allLines.push(`(pentacad session — ${session.operations.length} ops · ${machine.name})`);
      allLines.push('G21 G90 G94');
      allLines.push('G43.4 H1');
      allLines.push('G54');
      let totalErrors = 0;
      for (const op of session.operations) {
        const motions = motionsFor(op);
        // Strip the per-op prologue/epilogue (post-processor adds its own
        // header so we ask for one without sequence numbers, then trim).
        const r = emitProgram(machine.id, motions, {
          programName: `op ${op.name}`,
          designer: 'pentacad-setup',
          sequenceNumbers: false,
          includeWorkCoord: false,
        });
        // Splice between the program markers + header so we keep just the
        // motion blocks.
        const inner = r.ngc.split('\n').filter(line =>
          !/^%/.test(line) && !/^O\d+/.test(line) && !/^G(20|21|90|94|43\.4|54)/.test(line) &&
          !/^\(units:/.test(line) && !/^\(machine:/.test(line) && !/^\(envelope:/.test(line) &&
          !/^\(pentacad/.test(line) && !/^\(op /.test(line) && !line.startsWith(`(${'op '}${op.name}`)
        );
        allLines.push(`(--- ${op.name} · T${op.toolNumber} ---)`);
        allLines.push(...inner);
        perOp.push({ id: op.id, name: op.name, lineCount: r.lineCount, errors: r.errors });
        totalErrors += r.errors.length;
      }
      allLines.push('M30');
      allLines.push('%');
      const ngc = allLines.join('\n');
      ngcEl.textContent = ngc;
      ngcEl.style.display = 'block';
      statusEl.innerHTML = `<span style="color:#10B981">posted</span> · ${session.operations.length} ops · ${allLines.length} lines${totalErrors ? ` · <span style="color:#E11D48">${totalErrors} errors</span>` : ''}`;
      const result = { ngc, perOp };
      emit('post', result);
      try {
        opts.meter?.charge?.({
          widget: 'setup-manager', method: 'postAll',
          tokensIn: session.operations.length * 12,
          tokensOut: allLines.length * 4,
          modelTier: 'sonnet',
        })?.catch?.(() => { /* ignore */ });
      } catch { /* meter unreachable */ }
      return result;
    },
    exportSession() {
      const json = JSON.stringify(session, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'pentacad-session.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      emit('export', { session });
      return json;
    },
    /** @param {SessionState | string} src */
    importSession(src) {
      const obj = typeof src === 'string' ? JSON.parse(src) : src;
      if (!obj || !Array.isArray(obj.operations) || !Array.isArray(obj.tools)) {
        throw new Error('invalid session JSON');
      }
      session = /** @type {SessionState} */ (obj);
      if (!session.machineId) session.machineId = defaultMachine().id;
      renderAll();
      emit('import', { session });
      emit('change', { kind: 'import' });
    },
    getSession() { return /** @type {SessionState} */ (structuredClone(session)); },
    setMachine(id) {
      if (!getMachine(id)) throw new Error(`unknown machine: ${id}`);
      session.machineId = id;
      renderMachine();
      emit('change', { kind: 'machine', id });
    },
  };

  return {
    api,
    /** @param {string} ev @param {Function} fn */
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
