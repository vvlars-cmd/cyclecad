/**
 * @file widgets/tutorial-author.js
 * @description Authoring widget for the cycleCAD tutorial DSL (Use Case 1).
 *
 *   Workflow:
 *     1. loadComponent(id) — fetch parsed component + reverse-engineered
 *        feature tree from the library API.
 *     2. synthesizeFromComponent() — emit a draft step list from the feature
 *        tree. Step kinds derived from feature kinds. Narration from
 *        templates (or AI when wired).
 *     3. user edits steps via the split-panel UI.
 *     4. setViewport(stepId) captures the live camera state.
 *     5. validate() / save() — POST to /api/library/tutorials.
 *
 *   Pure browser ESM; no Node APIs. Uses tutorial-schema.js for shape.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import {
  STEP_KINDS,
  SCOPE_KINDS,
  emptyTutorial,
  templateForKind,
  validateTutorial,
  summarizeTutorial,
} from '../shared/tutorial-schema.js';

const FEATURE_KIND_MAP = Object.freeze({
  // Inventor / generic feature kind  →  tutorial step kind
  Sketch:           'sketch',
  ExtrudeFeature:   'extrude',
  Extrusion:        'extrude',
  RevolveFeature:   'revolve',
  Revolution:       'revolve',
  SweepFeature:     'sweep',
  LoftFeature:      'loft',
  FilletFeature:    'fillet',
  ChamferFeature:   'chamfer',
  HoleFeature:      'hole',
  PatternFeature:   'pattern',
  Pattern:          'pattern',
  ShellFeature:     'shell',
  MirrorFeature:    'mirror',
  SplitFeature:     'split',
  Mate:             'mate',
  Constraint:       'mate',
  Place:            'place',
  Occurrence:       'place',
});

/**
 * @typedef {Object} TutorialAuthorOpts
 * @property {string|HTMLElement} mount
 * @property {string} app
 * @property {Object} meter
 * @property {Object} [params]
 * @property {string} [params.componentId]
 * @property {string} [params.author]
 * @property {Function} [params.captureViewport]  () => {position, target, fov}
 *
 * @typedef {Object} TutorialAuthorHandle
 * @property {Object} api
 * @property {Function} on
 * @property {Function} destroy
 */

/**
 * Mount the tutorial-author panel.
 *
 * @param {TutorialAuthorOpts} opts
 * @returns {Promise<{
 *   api: {
 *     loadComponent: (componentId: string|number) => Promise<object>,
 *     synthesizeFromComponent: () => Array<object>,
 *     addStep: (kind: string, props?: object) => object,
 *     removeStep: (stepId: string) => void,
 *     reorderStep: (stepId: string, newIndex: number) => void,
 *     editStep: (stepId: string, props: object) => void,
 *     setViewport: (stepId: string) => object,
 *     validate: () => { ok: boolean, errors: Array<string> },
 *     save: () => Promise<{ id: number }>,
 *     getTutorial: () => object
 *   },
 *   on: (event: 'synthesized'|'stepAdded'|'stepRemoved'|'stepMoved'|'stepEdited'|'viewportCaptured'|'saved'|'error'|'change', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('tutorial-author: mount not found');

  const listeners = {
    synthesized: [], stepAdded: [], stepRemoved: [], stepMoved: [],
    stepEdited: [], viewportCaptured: [], saved: [], error: [], change: [],
  };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const author = opts.params?.author || 'anon';
  let tutorial = emptyTutorial({ author });
  let component = null;
  let features = [];
  let activeStepId = null;

  const dom = buildDom(root);

  // ---- DOM wiring ----
  dom.btnSynth.addEventListener('click', () => { synthesizeFromComponent(); });
  dom.btnAdd.addEventListener('click',   () => { addStep(templateForKind('note')); });
  dom.btnSave.addEventListener('click',  () => { save(); });
  dom.btnValidate.addEventListener('click', () => renderValidator());
  dom.titleInput.addEventListener('input', e => {
    tutorial.title = e.target.value;
    emit('change', { kind: 'meta' });
  });
  dom.descInput.addEventListener('input', e => {
    tutorial.description = e.target.value;
    emit('change', { kind: 'meta' });
  });
  dom.scopeSelect.addEventListener('change', e => {
    tutorial.scope = e.target.value;
    emit('change', { kind: 'meta' });
  });

  // ---- API ----

  async function loadComponent(componentId) {
    try {
      const cid = String(componentId || '').trim();
      if (!cid) throw new Error('componentId required');
      tutorial.componentId = cid;
      const [c, f] = await Promise.all([
        fetchJson(`/api/library/components/${encodeURIComponent(cid)}`).catch(() => null),
        fetchJson(`/api/library/components/${encodeURIComponent(cid)}/features`).catch(() => null),
      ]);
      component = c?.component || c || { id: cid, name: cid };
      features  = (f?.features || f?.tree || []) || [];
      dom.compLabel.textContent = component?.name || cid;
      dom.compMeta.textContent  = `${features.length} feature${features.length === 1 ? '' : 's'}`;
      renderAll();
      return { component, features };
    } catch (err) {
      emit('error', { kind: 'loadComponent', message: err.message });
      throw err;
    }
  }

  function synthesizeFromComponent() {
    const draft = [];
    let prevId = null;
    for (const f of features) {
      const fkind = f.kind || f.type || f.featureType || 'note';
      const kind  = FEATURE_KIND_MAP[fkind] || (STEP_KINDS.includes(fkind) ? fkind : 'note');
      const step  = templateForKind(kind);
      step.id = `step_${draft.length + 1}_${kind}`;
      step.title = f.name || f.label || `${kind} ${draft.length + 1}`;
      step.params = mergeParams(step.params, f.params || f.attributes || {});
      step.inputs = prevId ? [prevId] : [];
      step.narration = renderNarration(step.kind, step.params, step.title, component);
      draft.push(step);
      prevId = step.id;
    }
    tutorial.steps = draft;
    tutorial.estimatedTime = estimateTime(draft);
    chargeAi('synthesize', { tokensIn: draft.length * 50, tokensOut: draft.length * 80, modelTier: 'sonnet' });
    renderAll();
    emit('synthesized', { steps: draft.length });
    emit('change', { kind: 'synthesize' });
    return draft;
  }

  function addStep(stepDef) {
    const step = normalizeStep(stepDef || templateForKind('note'));
    tutorial.steps.push(step);
    tutorial.estimatedTime = estimateTime(tutorial.steps);
    renderAll();
    activeStepId = step.id;
    renderEditor();
    emit('stepAdded', { step });
    emit('change', { kind: 'addStep' });
    return step;
  }

  function removeStep(stepId) {
    const i = tutorial.steps.findIndex(s => s.id === stepId);
    if (i < 0) return false;
    tutorial.steps.splice(i, 1);
    // strip dangling inputs
    for (const s of tutorial.steps) s.inputs = (s.inputs || []).filter(d => d !== stepId);
    if (activeStepId === stepId) activeStepId = tutorial.steps[0]?.id || null;
    renderAll();
    emit('stepRemoved', { id: stepId });
    emit('change', { kind: 'removeStep' });
    return true;
  }

  function moveStep(stepId, newIndex) {
    const i = tutorial.steps.findIndex(s => s.id === stepId);
    if (i < 0) return false;
    const [s] = tutorial.steps.splice(i, 1);
    const idx = Math.max(0, Math.min(newIndex, tutorial.steps.length));
    tutorial.steps.splice(idx, 0, s);
    renderAll();
    emit('stepMoved', { id: stepId, newIndex: idx });
    emit('change', { kind: 'moveStep' });
    return true;
  }

  function editStep(stepId, patch) {
    const s = tutorial.steps.find(x => x.id === stepId);
    if (!s) return false;
    Object.assign(s, patch || {});
    renderAll();
    emit('stepEdited', { id: stepId, patch });
    emit('change', { kind: 'editStep' });
    return true;
  }

  function setNarration(stepId, text) {
    return editStep(stepId, { narration: String(text || '') });
  }

  function regenerateNarration(stepId) {
    const s = tutorial.steps.find(x => x.id === stepId);
    if (!s) return false;
    s.narration = renderNarration(s.kind, s.params, s.title, component);
    chargeAi('narrate', { tokensIn: 80, tokensOut: 120, modelTier: 'sonnet' });
    renderAll();
    emit('stepEdited', { id: stepId, patch: { narration: s.narration } });
    return true;
  }

  function setViewport(stepId, cameraState) {
    const s = tutorial.steps.find(x => x.id === stepId);
    if (!s) return false;
    let snap = cameraState;
    if (!snap && typeof opts.params?.captureViewport === 'function') {
      try { snap = opts.params.captureViewport(); } catch {}
    }
    if (!snap && opts.camera) {
      snap = {
        position: { x: opts.camera.position.x, y: opts.camera.position.y, z: opts.camera.position.z },
        target: opts.controls?.target
          ? { x: opts.controls.target.x, y: opts.controls.target.y, z: opts.controls.target.z }
          : { x: 0, y: 0, z: 0 },
        fov: opts.camera.fov,
      };
    }
    s.viewport = snap || null;
    renderAll();
    emit('viewportCaptured', { id: stepId, viewport: s.viewport });
    emit('change', { kind: 'viewport' });
    return true;
  }

  function validate() {
    const r = validateTutorial(tutorial);
    renderValidator(r);
    return r;
  }

  async function save() {
    try {
      const v = validateTutorial(tutorial);
      if (!v.ok) {
        renderValidator(v);
        emit('error', { kind: 'validation', errors: v.errors });
        return { ok: false, errors: v.errors };
      }
      chargeAi('save', { tokensIn: 200, tokensOut: 80, modelTier: 'sonnet' });
      const res = await fetch('/api/library/tutorials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id:   opts.params?.projectId || null,
          component_id: tutorial.componentId,
          scope:        tutorial.scope,
          title:        tutorial.title,
          description:  tutorial.description,
          author:       tutorial.author,
          body:         tutorial,
        }),
      });
      const j = await res.json();
      if (j?.ok && j.id) {
        tutorial.id = String(j.id);
        renderHeader();
      }
      emit('saved', j);
      return j;
    } catch (err) {
      emit('error', { kind: 'save', message: err.message });
      return { ok: false, error: err.message };
    }
  }

  function getTutorial() { return JSON.parse(JSON.stringify(tutorial)); }

  // ---- rendering ----

  function renderAll() {
    renderHeader();
    renderStepList();
    renderEditor();
    renderValidator();
  }

  function renderHeader() {
    dom.titleInput.value  = tutorial.title || '';
    dom.descInput.value   = tutorial.description || '';
    dom.scopeSelect.value = tutorial.scope;
    dom.summary.textContent = summarizeTutorial(tutorial);
  }

  function renderStepList() {
    dom.stepList.innerHTML = '';
    tutorial.steps.forEach((s, i) => {
      const li = document.createElement('div');
      li.className = 'pt-step' + (s.id === activeStepId ? ' is-active' : '');
      li.dataset.id = s.id;
      li.draggable = true;
      li.innerHTML = `
        <span class="pt-step-num">${i + 1}</span>
        <span class="pt-step-kind" title="${s.kind}">${kindIcon(s.kind)}</span>
        <span class="pt-step-title">${escapeHtml(s.title || s.kind)}</span>
        <button class="pt-step-x" title="remove">×</button>
      `;
      li.addEventListener('click', e => {
        if (e.target.closest('.pt-step-x')) return;
        activeStepId = s.id;
        renderStepList();
        renderEditor();
      });
      li.querySelector('.pt-step-x').addEventListener('click', () => removeStep(s.id));
      li.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', s.id));
      li.addEventListener('dragover',  e => e.preventDefault());
      li.addEventListener('drop', e => {
        e.preventDefault();
        const src = e.dataTransfer.getData('text/plain');
        if (src && src !== s.id) moveStep(src, i);
      });
      dom.stepList.appendChild(li);
    });
    if (tutorial.steps.length === 0) {
      dom.stepList.innerHTML = '<div class="pt-empty">no steps yet — Synthesize or Add</div>';
    }
  }

  function renderEditor() {
    const s = tutorial.steps.find(x => x.id === activeStepId) || tutorial.steps[0];
    if (!s) {
      dom.editor.innerHTML = '<div class="pt-empty">select a step</div>';
      return;
    }
    activeStepId = s.id;
    dom.editor.innerHTML = `
      <label class="pt-row">title
        <input data-f="title" type="text" value="${escapeAttr(s.title)}">
      </label>
      <label class="pt-row">kind
        <select data-f="kind">${
          STEP_KINDS.map(k => `<option value="${k}"${k === s.kind ? ' selected' : ''}>${k}</option>`).join('')
        }</select>
      </label>
      <label class="pt-row">inputs (csv of step ids)
        <input data-f="inputs" type="text" value="${escapeAttr((s.inputs || []).join(','))}">
      </label>
      <div class="pt-row pt-params">
        <span class="pt-row-label">params</span>
        <textarea data-f="params" rows="4">${escapeHtml(JSON.stringify(s.params || {}, null, 2))}</textarea>
      </div>
      <label class="pt-row">narration
        <textarea data-f="narration" rows="4">${escapeHtml(s.narration || '')}</textarea>
      </label>
      <div class="pt-row pt-row-buttons">
        <button data-act="regenerate">Regenerate narration</button>
        <button data-act="capture">Capture viewport</button>
        <span class="pt-vp-state">${s.viewport ? 'viewport: captured' : 'viewport: empty'}</span>
      </div>
    `;
    dom.editor.querySelectorAll('[data-f]').forEach(el => {
      el.addEventListener('change', () => commitEditor(s.id));
      el.addEventListener('blur',   () => commitEditor(s.id));
    });
    dom.editor.querySelector('[data-act="regenerate"]').addEventListener('click', () => regenerateNarration(s.id));
    dom.editor.querySelector('[data-act="capture"]').addEventListener('click',    () => setViewport(s.id));
  }

  function commitEditor(id) {
    const s = tutorial.steps.find(x => x.id === id);
    if (!s) return;
    const get = f => dom.editor.querySelector(`[data-f="${f}"]`)?.value;
    const patch = {
      title:     get('title') ?? s.title,
      kind:      get('kind')  ?? s.kind,
      narration: get('narration') ?? s.narration,
      inputs:    String(get('inputs') || '').split(',').map(x => x.trim()).filter(Boolean),
    };
    try { patch.params = JSON.parse(get('params') || '{}'); } catch { patch.params = s.params; }
    editStep(id, patch);
  }

  function renderValidator(result) {
    const r = result || validateTutorial(tutorial);
    dom.validator.innerHTML = r.ok
      ? '<span class="pt-ok">✓ valid</span>'
      : `<span class="pt-bad">✗ ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}</span><ul>${
          r.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')
        }</ul>`;
  }

  // ---- helpers ----

  function chargeAi(method, payload) {
    try {
      opts.meter?.charge?.({
        widget: 'tutorial-author',
        method,
        actor: opts.params?.actor,
        ...payload,
      });
    } catch {}
  }

  // initial render
  renderAll();
  if (opts.params?.componentId) loadComponent(opts.params.componentId).catch(() => {});

  return {
    api: {
      loadComponent,
      synthesizeFromComponent,
      addStep,
      removeStep,
      moveStep,
      editStep,
      setNarration,
      regenerateNarration,
      setViewport,
      validate,
      save,
      getTutorial,
    },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    destroy() { dom.wrap.remove(); },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'content-type': 'application/json' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function mergeParams(base, extra) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v != null) out[k] = v;
  }
  return out;
}

function normalizeStep(s) {
  return {
    id: s.id || `step_${Math.random().toString(36).slice(2, 8)}`,
    kind: STEP_KINDS.includes(s.kind) ? s.kind : 'note',
    title: s.title || s.kind || 'Step',
    narration: s.narration || '',
    params: s.params || {},
    inputs: Array.isArray(s.inputs) ? s.inputs : [],
    viewport: s.viewport || null,
    mediaRefs: Array.isArray(s.mediaRefs) ? s.mediaRefs : [],
  };
}

function renderNarration(kind, params, title, component) {
  const cname = component?.name ? ` of "${component.name}"` : '';
  const head  = `${title || kind}${cname}: `;
  const tail  = paramSummary(params);
  return head + tail;
}

function paramSummary(params) {
  if (!params || typeof params !== 'object') return '';
  const bits = Object.entries(params)
    .filter(([, v]) => v != null && (typeof v !== 'object' || Array.isArray(v) === false))
    .slice(0, 4)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return bits.join(', ') + '.';
}

function estimateTime(steps) {
  const minutes = Math.max(1, Math.round(steps.length * 1.5));
  const complexity = steps.length > 30 ? 'high' : steps.length > 12 ? 'medium' : 'low';
  return { minutes, complexity };
}

function kindIcon(kind) {
  const ICONS = {
    sketch: '✎', extrude: '⬆', revolve: '↻', sweep: '∿', loft: '∽',
    fillet: '◠', chamfer: '◣', hole: '○', pattern: '⫶', shell: '◐',
    mate: '⚭', place: '⊕', mirror: '⇋', split: '✂',
    note: 'ℹ', view: '◉', measure: '⊿',
  };
  return ICONS[kind] || '•';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

// ──────────────────────────────────────────────────────────────────────
// DOM
// ──────────────────────────────────────────────────────────────────────

function buildDom(host) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-tutorial-author';
  wrap.innerHTML = `
<style>
.pt-tutorial-author { font: 13px Inter, sans-serif; color: #1f2937; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; display: grid; grid-template-columns: 280px 1fr; min-height: 480px; }
.pt-tutorial-author .pt-left  { border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; min-height: 0; }
.pt-tutorial-author .pt-right { display: grid; grid-template-rows: 1fr auto; min-height: 0; }
.pt-tutorial-author header { padding: 12px 14px; border-bottom: 1px solid #e5e7eb; }
.pt-tutorial-author header .pt-eyebrow { font: 600 10px Inter; color: #7C3AED; letter-spacing: 2px; }
.pt-tutorial-author header h2 { font: 600 18px Georgia, serif; margin: 4px 0 6px; }
.pt-tutorial-author header .pt-comp { font: 11px Menlo, monospace; color: #6b7280; }
.pt-tutorial-author .pt-toolbar { padding: 8px 12px; display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
.pt-tutorial-author .pt-toolbar button { background: #fff; border: 1px solid #d1d5db; padding: 4px 10px; border-radius: 4px; font: 600 11px Inter; cursor: pointer; }
.pt-tutorial-author .pt-toolbar button.primary { background: #7C3AED; color: #fff; border-color: #7C3AED; }
.pt-tutorial-author .pt-toolbar button:hover { background: #f3f4f6; }
.pt-tutorial-author .pt-toolbar button.primary:hover { background: #6d28d9; }
.pt-tutorial-author .pt-summary { font: 11px Menlo, monospace; color: #4b5563; padding: 6px 14px; }
.pt-tutorial-author .pt-step-list { overflow: auto; padding: 6px; flex: 1; min-height: 0; }
.pt-tutorial-author .pt-step { display: grid; grid-template-columns: 22px 22px 1fr 22px; gap: 6px; align-items: center; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
.pt-tutorial-author .pt-step:hover { background: #f3f4f6; }
.pt-tutorial-author .pt-step.is-active { background: rgba(124,58,237,0.10); outline: 1px solid #7C3AED; }
.pt-tutorial-author .pt-step-num { font: 600 11px Menlo, monospace; color: #6b7280; text-align: right; }
.pt-tutorial-author .pt-step-kind { font: 14px serif; text-align: center; }
.pt-tutorial-author .pt-step-title { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-tutorial-author .pt-step-x { background: transparent; border: none; color: #9ca3af; font-size: 16px; cursor: pointer; }
.pt-tutorial-author .pt-step-x:hover { color: #E11D48; }
.pt-tutorial-author .pt-empty { padding: 16px; color: #9ca3af; font-size: 12px; text-align: center; }
.pt-tutorial-author .pt-editor { padding: 12px 14px; overflow: auto; min-height: 0; }
.pt-tutorial-author .pt-meta { padding: 10px 14px; display: grid; grid-template-columns: 1fr 1fr 140px; gap: 8px; border-bottom: 1px solid #e5e7eb; }
.pt-tutorial-author .pt-meta input, .pt-tutorial-author .pt-meta select { padding: 5px 7px; font: 12px Inter; border: 1px solid #d1d5db; border-radius: 3px; }
.pt-tutorial-author .pt-row { display: block; margin-bottom: 8px; font-size: 11px; color: #4b5563; }
.pt-tutorial-author .pt-row input, .pt-tutorial-author .pt-row textarea, .pt-tutorial-author .pt-row select {
  display: block; width: 100%; box-sizing: border-box; padding: 6px 8px; font: 12px Inter; border: 1px solid #d1d5db; border-radius: 3px; margin-top: 2px;
}
.pt-tutorial-author .pt-row textarea { font: 12px Menlo, monospace; }
.pt-tutorial-author .pt-row-buttons { display: flex; gap: 6px; align-items: center; }
.pt-tutorial-author .pt-row-buttons button { background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px 10px; border-radius: 3px; font: 600 11px Inter; cursor: pointer; }
.pt-tutorial-author .pt-vp-state { font: 11px Menlo, monospace; color: #6b7280; margin-left: 8px; }
.pt-tutorial-author .pt-footer { padding: 10px 14px; border-top: 1px solid #e5e7eb; display: flex; gap: 10px; align-items: center; background: #f9fafb; }
.pt-tutorial-author .pt-validator { flex: 1; font-size: 11px; }
.pt-tutorial-author .pt-validator .pt-ok  { color: #166534; font-weight: 600; }
.pt-tutorial-author .pt-validator .pt-bad { color: #991B1B; font-weight: 600; }
.pt-tutorial-author .pt-validator ul { margin: 4px 0 0 16px; padding: 0; }
.pt-tutorial-author .pt-validator li { font: 11px Menlo, monospace; color: #991B1B; }
.pt-tutorial-author .pt-save { background: #10B981; color: #fff; border: none; padding: 6px 14px; border-radius: 4px; font: 600 12px Inter; cursor: pointer; }
.pt-tutorial-author .pt-save:hover { background: #059669; }
</style>
<div class="pt-left">
  <header>
    <div class="pt-eyebrow">TUTORIAL · AUTHOR</div>
    <h2 data-comp-label>(no component)</h2>
    <div class="pt-comp" data-comp-meta>—</div>
  </header>
  <div class="pt-toolbar">
    <button class="primary" data-act="synth">Synthesize</button>
    <button data-act="add">+ Step</button>
  </div>
  <div class="pt-summary" data-summary>0 steps</div>
  <div class="pt-step-list" data-step-list></div>
</div>
<div class="pt-right">
  <div>
    <div class="pt-meta">
      <input data-f="title" placeholder="Tutorial title" type="text">
      <input data-f="desc"  placeholder="Description"   type="text">
      <select data-f="scope">
        ${SCOPE_KINDS.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
    </div>
    <div class="pt-editor" data-editor></div>
  </div>
  <div class="pt-footer">
    <div class="pt-validator" data-validator></div>
    <button data-act="validate">Validate</button>
    <button class="pt-save" data-act="save">SAVE</button>
  </div>
</div>
`;
  host.appendChild(wrap);
  return {
    wrap,
    compLabel:    wrap.querySelector('[data-comp-label]'),
    compMeta:     wrap.querySelector('[data-comp-meta]'),
    titleInput:   wrap.querySelector('[data-f="title"]'),
    descInput:    wrap.querySelector('[data-f="desc"]'),
    scopeSelect:  wrap.querySelector('[data-f="scope"]'),
    summary:      wrap.querySelector('[data-summary]'),
    stepList:     wrap.querySelector('[data-step-list]'),
    editor:       wrap.querySelector('[data-editor]'),
    validator:    wrap.querySelector('[data-validator]'),
    btnSynth:     wrap.querySelector('[data-act="synth"]'),
    btnAdd:       wrap.querySelector('[data-act="add"]'),
    btnSave:      wrap.querySelector('[data-act="save"]'),
    btnValidate:  wrap.querySelector('[data-act="validate"]'),
  };
}
