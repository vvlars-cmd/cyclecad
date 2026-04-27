/**
 * @file widgets/reverse-engineer.js
 * @description Inventor reverse-engineer engine — given a parsed `.ipt` /
 *   `.iam`, synthesizes a probable feature-tree of how the part was built
 *   (sketch → extrude → fillet → ...). Pure heuristics in JS; no SQL.
 *
 *   Pairs with `widgets/rebuild-guide.js`, which renders the plan one step
 *   at a time over the 3D viewport.
 *
 *   API
 *   ───
 *     analyze(componentId)      — fetch + synthesize       [meter: sonnet]
 *     synthesize(componentMeta) — pure heuristics only     [no charge]
 *     refine(stepIds[], hints)  — re-run with user hints   [meter: sonnet]
 *     exportToTutorial(id)      — POST a tutorial JSON
 *     getPlan()                 — current step plan
 *     getConfidence()           — { overall, perStep }     [meter: haiku]
 *
 *   Heuristics fired during synthesize():
 *     • Sheet-metal flag        → sketch + flange + bend (+ pattern-holes)
 *     • Vendor part             → single `place` step with link
 *     • Assembly children       → place×N + mate×M
 *     • Many features, low mass → small extrudes + fillets, possible shell
 *     • mass / volume too low   → shell or pattern of voids
 *     • Long thin bbox          → revolve hint
 *
 * @author Sachin Kumar
 * @license MIT
 *
 * Use Case 1 · feature-tree synthesis.
 */

import { instantiateStep, narrationFor, timeEstimateMin, complexityScore, TEMPLATE_KINDS } from '../shared/build-step-templates.js';

const ESC = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ──────────────────────────────────────────────────────────────────────────
   Heuristic synthesis
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Pure function: turn parsed component metadata into a feature-tree.
 * Deterministic — same input always gives the same output (and the same
 * step ids, so confidence stays stable across re-renders).
 *
 * @param {object} meta
 * @param {string} [meta.id]
 * @param {string} [meta.name]
 * @param {'part'|'assembly'|'sheet-metal'|'flat-pattern'} [meta.kind]
 * @param {'custom'|'standard'|'vendor'|'unknown'} [meta.category]
 * @param {number} [meta.featureCount]
 * @param {boolean} [meta.hasSheetMetal]
 * @param {object} [meta.imeta]   raw imeta blob from server
 * @param {object} [meta.properties]
 * @param {number[]} [meta.bbox]   [x, y, z] mm
 * @param {Array<{name:string, kind:string, source_format?:string}>} [meta.children]
 * @param {Array<{kind:string, from?:string, to?:string, offset?:number}>} [meta.constraints]
 * @returns {Array<object>}  array of step objects
 */
export function synthesize(meta = {}) {
  const fired = [];
  const seed = stableSeedFor(meta);
  let i = 0;
  const push = (kind, params = {}, title) => {
    const s = instantiateStep(kind, params, { seed, index: i, title });
    s._heuristics = [...fired];
    fired.length = 0;
    i++;
    return s;
  };

  const steps = [];
  const props = meta.properties || {};
  const imeta = meta.imeta || {};
  const bbox = meta.bbox || imeta.bbox || null;
  const mass = typeof props.mass === 'number' ? props.mass : (typeof imeta.mass_g === 'number' ? imeta.mass_g : null);
  const featureCount = typeof meta.featureCount === 'number' ? meta.featureCount : (imeta.featureCount || 0);
  const holes = imeta.holes || imeta.hole_count || 0;
  const material = props.material || imeta.material || '';

  // Branch 1: vendor / standard part — one place step, done.
  if (meta.category === 'vendor' || meta.category === 'standard') {
    fired.push('vendor-or-standard-part');
    steps.push(push('place', {
      component: meta.name || 'vendor part',
      source: meta.category,
      count: 1,
      link: meta.relpath || '',
    }, `Place ${meta.name || 'vendor part'}`));
    return finalize(steps, meta);
  }

  // Branch 2: assembly — children + constraints.
  if (meta.kind === 'assembly' || (Array.isArray(meta.children) && meta.children.length)) {
    fired.push('assembly-children');
    const children = Array.isArray(meta.children) ? meta.children : [];
    children.forEach((c) => {
      steps.push(push('place', {
        component: c.name || 'sub-component',
        source: c.kind === 'vendor' ? 'vendor' : c.kind === 'standard' ? 'standard' : 'library',
        count: c.count || 1,
        link: c.relpath || '',
      }, `Place ${c.name || 'sub-component'}`));
    });
    const constraints = Array.isArray(meta.constraints) ? meta.constraints : [];
    if (constraints.length) {
      fired.push('assembly-constraints');
      constraints.forEach((c) => {
        steps.push(push('mate', {
          type: c.kind || 'mate',
          from: c.from || 'face A',
          to: c.to || 'face B',
          offset: c.offset || 0,
        }));
      });
    }
    if (children.length === 0 && constraints.length === 0) {
      steps.push(push('note', { text: 'Empty assembly — add components to begin.' }));
    }
    return finalize(steps, meta);
  }

  // Branch 3: sheet-metal — flange / bend / hole-pattern.
  if (meta.kind === 'sheet-metal' || meta.hasSheetMetal === true) {
    fired.push('sheet-metal-flag');
    steps.push(push('sketch', {
      plane: 'XY',
      profile: 'flat blank',
      dimensions: bbox ? [{ name: 'L', value: bbox[0] }, { name: 'W', value: bbox[1] }] : [],
    }));
    steps.push(push('extrude', { distance: imeta.thickness || 1.5, direction: 'one-side', operation: 'join' },
      'Thicken to sheet gauge'));
    fired.push('sheet-metal-flange');
    steps.push(push('note', { text: 'Add flanges around the perimeter; let the bend allowance follow the material default.' },
      'Flange perimeter'));
    fired.push('sheet-metal-bend');
    steps.push(push('note', { text: 'Apply bends to the desired angle (typically 90°) and keep the bend radius at material thickness.' },
      'Bend to 90°'));
    if (holes > 1) {
      fired.push('sheet-metal-hole-pattern');
      const cols = Math.min(holes, Math.max(2, Math.round(Math.sqrt(holes))));
      const rows = Math.max(1, Math.round(holes / cols));
      steps.push(push('hole', { diameter: 5, depth: 'through', count: 1 }));
      steps.push(push('pattern', {
        type: 'rectangular',
        count: [cols, rows],
        spacing: [bbox ? Math.max(10, bbox[0] / (cols + 1)) : 20,
                  bbox ? Math.max(10, bbox[1] / (rows + 1)) : 20],
        features: ['hole'],
      }));
    } else if (holes === 1) {
      steps.push(push('hole', { diameter: 5, depth: 'through', count: 1 }));
    }
    return finalize(steps, meta);
  }

  // Branch 4: regular part — synthesize from feature count + bbox shape.
  fired.push('part-base-extrude');
  const longThin = bbox && (Math.max(...bbox) > 4 * Math.min(...bbox));
  const looksRound = bbox && Math.abs(bbox[0] - bbox[1]) < 1 && bbox[2] && bbox[2] !== bbox[0];

  steps.push(push('sketch', {
    plane: 'XY',
    profile: looksRound ? 'circle' : longThin ? 'rectangle' : 'closed profile',
    dimensions: bbox
      ? [{ name: 'X', value: bbox[0] }, { name: 'Y', value: bbox[1] }]
      : [],
  }));

  if (looksRound && bbox && Math.abs(bbox[0] - bbox[1]) < 1) {
    fired.push('round-bbox-revolve-hint');
    steps.push(push('revolve', {
      axis: 'Z',
      angle: 360,
      operation: 'join',
    }));
  } else {
    steps.push(push('extrude', {
      distance: bbox ? bbox[2] || 10 : 10,
      direction: 'one-side',
      operation: 'join',
    }, 'Extrude base body'));
  }

  // Many features → break the rest down into small extrude/fillet pairs.
  const remaining = Math.max(0, featureCount - 2);
  if (remaining >= 6) {
    fired.push('high-feature-count');
    // Cap synthesis at 16 derived steps so the plan stays readable.
    const synth = Math.min(remaining, 16);
    for (let k = 0; k < synth; k++) {
      const phase = k % 3;
      if (phase === 0) {
        steps.push(push('extrude', {
          distance: 2 + (k % 4),
          direction: 'one-side',
          operation: k % 2 ? 'cut' : 'join',
        }));
      } else if (phase === 1) {
        steps.push(push('fillet', { edges: [k + 1], radius: 1 + (k % 3) }));
      } else {
        steps.push(push('chamfer', { edges: [k + 1], distance: 1 + (k % 2), angle: 45 }));
      }
    }
  } else {
    for (let k = 0; k < remaining; k++) {
      steps.push(push('fillet', { edges: [k + 1], radius: 2 }));
    }
  }

  // Mass / volume sanity check → shell hint.
  if (bbox && mass) {
    const volMm3 = bbox[0] * bbox[1] * bbox[2];
    const densityGuess = densityForMaterial(material);
    const expectedMass = (volMm3 / 1000) * densityGuess; // grams (rough)
    if (expectedMass > 0 && mass < expectedMass * 0.4) {
      fired.push('low-mass-ratio-shell');
      steps.push(push('shell', { thickness: 2, removedFaces: ['top'] }));
    }
  }

  if (holes > 1) {
    fired.push('hole-pattern');
    steps.push(push('hole', { diameter: 5, depth: 'through', count: 1 }));
    const cols = Math.min(holes, Math.max(2, Math.round(Math.sqrt(holes))));
    const rows = Math.max(1, Math.round(holes / cols));
    steps.push(push('pattern', {
      type: 'rectangular',
      count: [cols, rows],
      spacing: [20, 20],
      features: ['hole'],
    }));
  } else if (holes === 1) {
    steps.push(push('hole', { diameter: 5, depth: 'through', count: 1 }));
  }

  return finalize(steps, meta);
}

function finalize(steps, meta) {
  if (steps.length === 0) {
    steps.push(instantiateStep('note', { text: `No features detected for "${meta.name || 'this component'}".` }, { seed: 0, index: 0 }));
  }
  return steps;
}

function densityForMaterial(name) {
  const m = String(name || '').toLowerCase();
  if (m.includes('steel'))    return 7.85;
  if (m.includes('iron'))     return 7.2;
  if (m.includes('alumin'))   return 2.70;
  if (m.includes('6061'))     return 2.70;
  if (m.includes('6063'))     return 2.69;
  if (m.includes('brass'))    return 8.5;
  if (m.includes('copper'))   return 8.96;
  if (m.includes('plastic'))  return 1.4;
  if (m.includes('abs'))      return 1.05;
  if (m.includes('peek'))     return 1.32;
  return 2.7; // default to alumin-ish
}

function stableSeedFor(meta) {
  const key = `${meta.id || ''}|${meta.name || ''}|${meta.kind || ''}|${meta.category || ''}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* ──────────────────────────────────────────────────────────────────────────
   Confidence scoring (deterministic, per-input)
   ──────────────────────────────────────────────────────────────────────── */

function confidenceFor(steps, meta) {
  const perStep = {};
  for (const s of steps) {
    let score = 0.5;
    const fired = Array.isArray(s._heuristics) ? s._heuristics : [];
    if (fired.includes('vendor-or-standard-part'))   score = 0.95;
    if (fired.includes('assembly-children'))         score = Math.max(score, 0.85);
    if (fired.includes('assembly-constraints'))      score = Math.max(score, 0.78);
    if (fired.includes('sheet-metal-flag'))          score = Math.max(score, 0.82);
    if (fired.includes('sheet-metal-flange'))        score = Math.max(score, 0.65);
    if (fired.includes('sheet-metal-bend'))          score = Math.max(score, 0.62);
    if (fired.includes('sheet-metal-hole-pattern'))  score = Math.max(score, 0.7);
    if (fired.includes('part-base-extrude'))         score = Math.max(score, 0.7);
    if (fired.includes('round-bbox-revolve-hint'))   score = Math.max(score, 0.72);
    if (fired.includes('high-feature-count'))        score = Math.min(score, 0.5);
    if (fired.includes('low-mass-ratio-shell'))      score = Math.max(score, 0.55);
    if (fired.includes('hole-pattern'))              score = Math.max(score, 0.62);
    if (s._refined) score = Math.min(0.97, score + 0.15);
    perStep[s.id] = Number(score.toFixed(3));
  }
  const avg = steps.length
    ? Object.values(perStep).reduce((a, b) => a + b, 0) / steps.length
    : 0;
  const cx = complexityScore(steps);
  const overall = Number((avg * 0.7 + cx * 0.3).toFixed(3));
  return { overall, perStep };
}

/* ──────────────────────────────────────────────────────────────────────────
   Tutorial export
   ──────────────────────────────────────────────────────────────────────── */

function planToTutorialJson(meta, steps) {
  return {
    schema: 'cyclecad/tutorial/v1',
    title: `Build "${meta.name || 'component'}"`,
    description: `Auto-generated by reverse-engineer from ${meta.kind || 'part'} (${meta.category || 'unknown'}).`,
    component_id: meta.id || null,
    timeEstimateMin: timeEstimateMin(steps),
    steps: steps.map((s, idx) => ({
      step: idx + 1,
      id: s.id,
      kind: s.kind,
      title: s.title,
      narration: s.narration,
      params: s.params,
      icon: s.icon,
      timeEstimateMin: s.timeEstimateMin,
    })),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Widget init
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Mount the reverse-engineer widget.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { componentId?: string|number, componentMeta?: object }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     analyze: (componentId: string|number) => Promise<Array<object>>,
 *     synthesize: (meta?: object) => Array<object>,
 *     refine: (stepIds: string[], hints: object) => Promise<Array<object>>,
 *     exportToTutorial: (id?: string|number) => Promise<{ id: number }>,
 *     getPlan: () => Array<object>,
 *     getConfidence: () => { overall: number, perStep: Record<string, number> }
 *   },
 *   on: (event: 'change'|'analyze'|'refine'|'export'|'error', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('reverse-engineer: mount not found');

  const state = {
    meta: opts.params?.componentMeta || null,
    steps: [],
    confidence: { overall: 0, perStep: {} },
    busy: false,
  };
  const listeners = {
    analyzing: [], analyzed: [], refined: [], exported: [], error: [], change: [],
  };
  const emit = (ev, payload) => (listeners[ev] || []).forEach(fn => { try { fn(payload); } catch {} });

  const dom = buildDom(root);
  if (state.meta) {
    state.steps = synthesize(state.meta);
    state.confidence = confidenceFor(state.steps, state.meta);
    paint();
  } else {
    paintEmpty();
  }

  /* ------------------------------------------------------------- handlers */

  async function analyze(componentId) {
    if (state.busy) return null;
    state.busy = true;
    paintBusy(true);
    emit('analyzing', { componentId });
    try {
      if (opts.meter && typeof opts.meter.charge === 'function') {
        await opts.meter.charge({
          widget: 'reverse-engineer', kind: 'analyze',
          actor: opts.app || 'cyclecad',
          modelTier: 'sonnet', tokensIn: 1, tokensOut: 1,
          params: { componentId },
        });
      }
      let meta = null;
      try {
        const res = await fetch(`/api/library/components/${encodeURIComponent(componentId)}`);
        if (res.ok) {
          const j = await res.json();
          meta = j.component || j;
        }
      } catch { /* offline → fall back below */ }

      // Try to lift feature-tree blob if present.
      try {
        const fr = await fetch(`/api/library/components/${encodeURIComponent(componentId)}/features`);
        if (fr.ok) {
          const fj = await fr.json();
          if (fj && fj.features) meta = { ...(meta || {}), imeta: { ...(meta?.imeta || {}), ...fj.features } };
        }
      } catch { /* ignore */ }

      if (!meta) meta = demoMeta(componentId);
      state.meta = meta;
      state.steps = synthesize(meta);
      state.confidence = confidenceFor(state.steps, meta);
      paint();
      emit('analyzed', { componentId, plan: state.steps, confidence: state.confidence });
      emit('change', { kind: 'analyzed', plan: state.steps });
      return state.steps;
    } catch (err) {
      emit('error', { kind: 'analyze', message: err?.message || String(err) });
      paintError(err);
      return null;
    } finally {
      state.busy = false;
      paintBusy(false);
    }
  }

  async function refine(stepIds = [], hints = []) {
    if (state.busy || !state.meta) return null;
    state.busy = true;
    paintBusy(true);
    try {
      if (opts.meter && typeof opts.meter.charge === 'function') {
        await opts.meter.charge({
          widget: 'reverse-engineer', kind: 'refine',
          actor: opts.app || 'cyclecad',
          modelTier: 'sonnet', tokensIn: 1, tokensOut: 1,
          params: { stepIds, hintCount: hints.length },
        });
      }
      const text = (hints || []).join(' ').toLowerCase();
      // Light-weight heuristic refinement: tweak existing steps.
      const ids = new Set(stepIds && stepIds.length ? stepIds : state.steps.map(s => s.id));
      state.steps = state.steps.map(s => {
        if (!ids.has(s.id)) return s;
        const next = { ...s, params: { ...s.params }, _refined: true };
        if (/u-channel/.test(text) && next.kind === 'sketch') next.params.profile = 'U-channel';
        if (/bracket/.test(text) && next.kind === 'sketch')   next.params.profile = next.params.profile || 'bracket outline';
        const m = text.match(/(\d+)\s*mounting\s*holes?/);
        if (m && next.kind === 'pattern') {
          const n = parseInt(m[1], 10);
          const cols = Math.max(2, Math.round(Math.sqrt(n)));
          next.params.count = [cols, Math.max(1, Math.round(n / cols))];
        }
        if (m && next.kind === 'hole') next.params.count = parseInt(m[1], 10);
        const r = text.match(/radius\s*(?:of\s*)?(\d+(?:\.\d+)?)/);
        if (r && next.kind === 'fillet') next.params.radius = parseFloat(r[1]);
        const t = text.match(/thickness\s*(?:of\s*)?(\d+(?:\.\d+)?)/);
        if (t && next.kind === 'shell') next.params.thickness = parseFloat(t[1]);
        next.narration = narrationFor(next);
        return next;
      });
      state.confidence = confidenceFor(state.steps, state.meta);
      paint();
      emit('refined', { stepIds, hints, plan: state.steps, confidence: state.confidence });
      emit('change', { kind: 'refined', plan: state.steps });
      return state.steps;
    } catch (err) {
      emit('error', { kind: 'refine', message: err?.message || String(err) });
      return null;
    } finally {
      state.busy = false;
      paintBusy(false);
    }
  }

  async function exportToTutorial(componentId) {
    if (!state.meta || state.steps.length === 0) return null;
    const json = planToTutorialJson({ ...state.meta, id: componentId || state.meta.id }, state.steps);
    try {
      const res = await fetch('/api/library/tutorials', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(json),
      });
      const j = await res.json().catch(() => ({}));
      emit('exported', { ok: res.ok, tutorial: json, response: j });
      emit('change', { kind: 'exported', tutorial: json });
      return { ok: res.ok, tutorial: json, response: j };
    } catch (err) {
      // Offline-friendly: still return the JSON so callers can save it.
      emit('exported', { ok: false, tutorial: json, error: err?.message });
      return { ok: false, tutorial: json, error: err?.message };
    }
  }

  async function getConfidence() {
    if (opts.meter && typeof opts.meter.charge === 'function') {
      try {
        await opts.meter.charge({
          widget: 'reverse-engineer', kind: 'getConfidence',
          actor: opts.app || 'cyclecad',
          modelTier: 'haiku', tokensIn: 1, tokensOut: 1,
        });
      } catch { /* non-fatal */ }
    }
    return state.confidence;
  }

  function getPlan() { return state.steps.map(s => ({ ...s })); }

  /* --------------------------------------------------------------- paint */

  function paintBusy(b) {
    dom.spinner.style.display = b ? 'inline-block' : 'none';
    dom.analyzeBtn.disabled = b;
    dom.refineBtn.disabled  = b;
    dom.exportBtn.disabled  = b;
  }
  function paintEmpty() {
    dom.summary.textContent = 'no plan yet';
    dom.summary.style.background = '#E5E7EB';
    dom.summary.style.color = '#374151';
    dom.headerName.textContent = '—';
    dom.headerKind.textContent = '—';
    dom.headerMass.textContent = '—';
    dom.headerFeatures.textContent = '—';
    dom.thumb.style.display = 'none';
    dom.list.innerHTML = `<div style="padding:18px;color:#6B7280;font-size:12px;text-align:center">Enter a component id and click ANALYZE.</div>`;
  }
  function paintError(err) {
    dom.list.innerHTML = `<div style="padding:14px;background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;border-radius:6px;font-size:12px">analyze failed — ${ESC(err?.message || String(err))}</div>`;
  }

  function paint() {
    if (!state.meta) return paintEmpty();
    const m = state.meta;
    const props = m.properties || {};
    const fc = typeof m.featureCount === 'number' ? m.featureCount : '—';
    dom.headerName.textContent = m.name || '—';
    dom.headerKind.textContent = (m.kind || 'part') + (m.category ? ` · ${m.category}` : '');
    dom.headerMass.textContent = typeof props.mass === 'number' ? `${(props.mass).toFixed(1)} g` : '—';
    dom.headerFeatures.textContent = String(fc);
    if (m.thumbnailUrl) {
      dom.thumb.src = m.thumbnailUrl;
      dom.thumb.style.display = 'block';
    } else {
      dom.thumb.style.display = 'none';
    }
    const overall = state.confidence.overall || 0;
    const pct = Math.round(overall * 100);
    const tone = overall >= 0.7 ? '#10B981' : overall >= 0.4 ? '#F59E0B' : '#E11D48';
    dom.summary.textContent = `${pct}% confident — ${state.steps.length} step${state.steps.length === 1 ? '' : 's'} · ~${timeEstimateMin(state.steps)} min`;
    dom.summary.style.background = tone;
    dom.summary.style.color = '#fff';

    dom.list.innerHTML = '';
    state.steps.forEach((s, idx) => {
      const cf = state.confidence.perStep[s.id] ?? 0.5;
      const tone2 = cf >= 0.7 ? { bg: '#D1FAE5', fg: '#065F46' }
        : cf >= 0.4 ? { bg: '#FEF3C7', fg: '#92400E' }
        : { bg: '#FEE2E2', fg: '#991B1B' };
      const row = document.createElement('div');
      row.className = 'pt-re-row';
      row.dataset.id = s.id;
      row.style.cssText = 'display:grid;grid-template-columns:28px 28px 1fr auto;gap:10px;align-items:start;padding:10px 12px;border-bottom:1px solid #F3F4F6;cursor:pointer';
      row.innerHTML = `
        <div style="font:600 11px Inter;color:#6B7280;text-align:right">${idx + 1}</div>
        <div style="font:600 16px Georgia;color:#7C3AED;text-align:center;line-height:1">${ESC(s.icon || '·')}</div>
        <div>
          <div style="font:600 13px Inter;color:#0F172A">${ESC(s.title)}</div>
          <div style="font:400 12px Inter;color:#4B5563;margin-top:2px;line-height:1.4">${ESC(s.narration)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span style="background:${tone2.bg};color:${tone2.fg};font:700 10px Inter;letter-spacing:0.06em;padding:2px 6px;border-radius:10px">${Math.round(cf * 100)}%</span>
          <span style="font:500 10px Inter;color:#9CA3AF">${s.kind}</span>
        </div>`;
      row.addEventListener('click', () => {
        const wasSel = row.classList.toggle('pt-re-selected');
        row.style.background = wasSel ? '#F5F3FF' : '';
      });
      dom.list.appendChild(row);
    });
  }

  /* -------------------------------------------------------------- wiring */

  dom.analyzeBtn.addEventListener('click', async () => {
    const id = dom.idInput.value.trim() || (state.meta?.id) || 'demo:bracket';
    await analyze(id);
  });
  dom.refineBtn.addEventListener('click', async () => {
    const hints = [dom.hintInput.value.trim()].filter(Boolean);
    const ids = Array.from(dom.list.querySelectorAll('.pt-re-selected')).map(r => r.dataset.id);
    await refine(ids, hints);
  });
  dom.exportBtn.addEventListener('click', async () => {
    const id = state.meta?.id || dom.idInput.value.trim();
    await exportToTutorial(id);
  });

  return {
    api: { analyze, synthesize, refine, exportToTutorial, getPlan, getConfidence },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      try { dom.wrap.remove(); } catch {}
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   DOM
   ──────────────────────────────────────────────────────────────────────── */

function buildDom(root) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-re';
  wrap.style.cssText = 'font:13px Inter,sans-serif;background:#fff;border:1px solid #E5E7EB;border-radius:6px;max-width:780px;overflow:hidden';
  wrap.innerHTML = `
    <div style="padding:12px 14px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:10px">
      <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px">REVERSE-ENGINEER</div>
      <span data-summary style="margin-left:auto;font:700 11px Inter;letter-spacing:1px;padding:3px 9px;border-radius:10px;background:#E5E7EB;color:#374151">no plan yet</span>
      <span data-spinner style="display:none;width:12px;height:12px;border:2px solid #C4B5FD;border-top-color:#7C3AED;border-radius:50%;animation:pt-re-spin 1s linear infinite"></span>
    </div>
    <div style="padding:14px 14px 6px 14px;display:grid;grid-template-columns:64px 1fr;gap:14px;align-items:start;border-bottom:1px solid #F3F4F6">
      <img data-thumb style="width:64px;height:64px;object-fit:contain;background:#F3F4F6;border-radius:4px;display:none">
      <div>
        <div style="font:600 16px Georgia" data-name>—</div>
        <div style="font:400 11px Inter;color:#6B7280;margin-top:2px"><span data-kind>—</span> · <span data-mass>—</span> · <span data-features>—</span> features</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input data-id placeholder="component id (e.g. demo:bracket)" style="flex:1;padding:6px 8px;font:12px monospace;border:1px solid #D1D5DB;border-radius:3px">
          <button data-analyze style="background:#7C3AED;color:#fff;border:none;padding:6px 14px;border-radius:4px;font:600 11px Inter;letter-spacing:1px;cursor:pointer">ANALYZE</button>
        </div>
      </div>
    </div>
    <div data-list style="max-height:420px;overflow-y:auto"></div>
    <div style="padding:12px 14px;background:#F9FAFB;border-top:1px solid #E5E7EB;display:flex;gap:8px;align-items:center">
      <input data-hint placeholder="hint — e.g. this is a bracket; 4 mounting holes" style="flex:1;padding:6px 8px;font:12px Inter;border:1px solid #D1D5DB;border-radius:3px">
      <button data-refine style="background:#3B82F6;color:#fff;border:none;padding:6px 12px;border-radius:4px;font:600 11px Inter;letter-spacing:1px;cursor:pointer">REFINE</button>
      <button data-export style="background:#10B981;color:#fff;border:none;padding:6px 12px;border-radius:4px;font:600 11px Inter;letter-spacing:1px;cursor:pointer">EXPORT TUTORIAL</button>
    </div>
    <style>@keyframes pt-re-spin { to { transform: rotate(360deg); } }</style>`;
  root.appendChild(wrap);
  return {
    wrap,
    summary: wrap.querySelector('[data-summary]'),
    spinner: wrap.querySelector('[data-spinner]'),
    thumb: wrap.querySelector('[data-thumb]'),
    headerName: wrap.querySelector('[data-name]'),
    headerKind: wrap.querySelector('[data-kind]'),
    headerMass: wrap.querySelector('[data-mass]'),
    headerFeatures: wrap.querySelector('[data-features]'),
    idInput: wrap.querySelector('[data-id]'),
    hintInput: wrap.querySelector('[data-hint]'),
    list: wrap.querySelector('[data-list]'),
    analyzeBtn: wrap.querySelector('[data-analyze]'),
    refineBtn: wrap.querySelector('[data-refine]'),
    exportBtn: wrap.querySelector('[data-export]'),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Demo seed (offline / smoke test)
   ──────────────────────────────────────────────────────────────────────── */

function demoMeta(id) {
  const lc = String(id || '').toLowerCase();
  if (lc.includes('vendor') || lc.includes('igus') || lc.includes('rittal')) {
    return {
      id, name: id, kind: 'part', category: 'vendor',
      properties: { partNumber: id, material: 'PEEK' },
      featureCount: 0, hasSheetMetal: false,
    };
  }
  if (lc.includes('sheet') || lc.includes('blech')) {
    return {
      id, name: id || 'sheet-bracket', kind: 'sheet-metal', category: 'custom',
      properties: { material: 'Steel', mass: 220 }, featureCount: 5, hasSheetMetal: true,
      bbox: [120, 80, 1.5], imeta: { holes: 4, thickness: 1.5 },
    };
  }
  if (lc.includes('assembly') || lc.includes('iam')) {
    return {
      id, name: id || 'sub-assembly', kind: 'assembly', category: 'custom',
      featureCount: 0,
      children: [
        { name: 'Profile-40x40', kind: 'custom', count: 4 },
        { name: 'Bracket-90', kind: 'custom', count: 2 },
        { name: 'M8-bolt', kind: 'standard', count: 8 },
      ],
      constraints: [
        { kind: 'mate', from: 'Profile-40x40:face_top', to: 'Bracket-90:face_bottom', offset: 0 },
        { kind: 'flush', from: 'Profile-40x40:face_left', to: 'Bracket-90:face_left', offset: 0 },
      ],
    };
  }
  return {
    id, name: id || 'demo bracket', kind: 'part', category: 'custom',
    properties: { material: '6061-T6 Aluminum', mass: 78 },
    featureCount: 9, hasSheetMetal: false,
    bbox: [80, 40, 12], imeta: { holes: 4 },
  };
}
