/**
 * @file widgets/work-package-builder.js
 * @description Top-level orchestrator for Use Case 1 — runs the entire
 *   "complete work package" pipeline end-to-end:
 *
 *     IMPORT → PARSE → REVERSE-ENGINEER → AUTHOR TUTORIALS → DRAW → BUNDLE
 *
 *   Each phase is a sub-widget loaded into a hidden mount. Progress for every
 *   phase is reported live; failures in one component never abort the whole
 *   pipeline. The result is a single .zip the user downloads, plus a fully
 *   hydrated library with drawings, tutorials, and version history.
 *
 *   Contract:
 *     init({ mount, app, meter, scene?, camera?, renderer?, root?, params? })
 *       → { api, on, destroy }
 *
 *   API:
 *     api.run()                kick off the full pipeline
 *     api.runPhase(name)       run a single phase only
 *     api.cancel()
 *     api.setOptions(opts)     scope · sheets · views · narration tier
 *     api.getStatus()          { phase, percent, perPhase, errors, results }
 *
 *   Events:
 *     'phase'    — phase boundary crossed
 *     'progress' — incremental progress update inside a phase
 *     'error'    — non-fatal phase / component failure
 *     'complete' — full run done, payload is a ResultSummary
 *     'cancel'   — operator cancelled
 *     'change'   — generic state change
 *
 * @author  Sachin Kumar
 * @license MIT
 */

/**
 * @typedef {Object} BuildOptions
 * @property {string} [tenantId]
 * @property {string} [projectId]
 * @property {string} [projectName]
 * @property {boolean} [skipImport]   skip phase 1 (assume project already imported)
 * @property {boolean} [skipReverse]  skip reverse-engineer phase
 * @property {boolean} [skipTutorials] skip tutorial-author phase
 * @property {boolean} [skipDrawings] skip drawing-batch phase
 * @property {boolean} [skipBundle]   skip export-bundle phase
 * @property {{
 *   parts?:boolean, subAssemblies?:boolean, assemblies?:boolean,
 *   sheets?:string[], views?:string[]
 * }} [drawings]
 * @property {{tier?:'haiku'|'sonnet'|'opus'}} [narration]
 *
 * @typedef {Object} PhaseStatus
 * @property {string} name
 * @property {'pending'|'running'|'done'|'failed'|'skipped'} status
 * @property {number} percent
 * @property {number} startedAt
 * @property {number} [finishedAt]
 * @property {string[]} errors
 * @property {Object} [result]
 *
 * @typedef {Object} ResultSummary
 * @property {string} projectId
 * @property {Object<string, PhaseStatus>} phases
 * @property {{componentsParsed:number, drawingsGenerated:number,
 *             tutorialsAuthored:number, bundleSizeBytes:number,
 *             bundleUrl?:string, errors:string[], totalDurationMs:number}} totals
 */

const PHASES = /** @type {const} */ ([
  'import',
  'reverse-engineer',
  'tutorials',
  'drawings',
  'bundle',
]);

const PHASE_LABEL = {
  'import':           '1  Import & parse',
  'reverse-engineer': '2  Reverse-engineer',
  'tutorials':        '3  Author tutorials',
  'drawings':         '4  Generate drawings',
  'bundle':           '5  Bundle work package',
};

/**
 * @param {Object} opts
 * @returns {Promise<{api: Object, on: (ev:string, fn:Function)=>void, destroy:()=>void}>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string'
    ? document.querySelector(opts.mount)
    : opts.mount;
  if (!root) throw new Error('work-package-builder: mount not found');

  const meter = opts.meter;
  const app = opts.app || 'cyclecad';

  /** @type {BuildOptions} */
  let options = {
    tenantId: 'default',
    projectId: opts.params?.projectId,
    projectName: opts.params?.projectName,
    drawings: { parts: true, subAssemblies: true, assemblies: true, sheets: ['A3'], views: ['front', 'top', 'side', 'iso'] },
    narration: { tier: 'sonnet' },
  };

  /** @type {Object<string, PhaseStatus>} */
  const phaseStatus = Object.fromEntries(PHASES.map(p => [p, {
    name: p, status: 'pending', percent: 0, startedAt: 0, errors: [],
  }]));

  /** @type {ResultSummary} */
  const summary = {
    projectId: options.projectId || '',
    phases: phaseStatus,
    totals: {
      componentsParsed: 0, drawingsGenerated: 0, tutorialsAuthored: 0,
      bundleSizeBytes: 0, errors: [], totalDurationMs: 0,
    },
  };

  let cancelled = false;
  let activePhase = null;
  /** @type {{[k:string]: Function[]}} */
  const listeners = { phase: [], progress: [], error: [], complete: [], cancel: [], change: [] };
  /** @type {Array<()=>void>} */
  const tracked = [];
  /** @type {Set<{destroy:()=>void}>} */
  const childHandles = new Set();
  let hostStarted = 0;

  // -----------------------------------------------------------------------
  // DOM scaffold
  // -----------------------------------------------------------------------
  const host = document.createElement('div');
  host.className = 'wpb-root';
  host.setAttribute('data-widget', 'work-package-builder');
  host.style.cssText = `
    --wpb-bg: var(--cc-bg, #0B0E13);
    --wpb-fg: var(--cc-fg, #E6E8EB);
    --wpb-muted: var(--cc-muted, #8A93A0);
    --wpb-rule: var(--cc-rule, #1d242e);
    --wpb-accent: var(--cc-accent, #7C3AED);
    --wpb-ok: #10B981; --wpb-warn: #F59E0B; --wpb-err: #E11D48;
    background: var(--wpb-bg); color: var(--wpb-fg);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    padding: 18px 22px; border-radius: 8px; border: 1px solid var(--wpb-rule);
    display: grid; gap: 14px; min-height: 480px;
  `;

  host.innerHTML = `
    <header>
      <div style="font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--wpb-accent); font-weight:600;">
        Work Package Builder
      </div>
      <div style="font: 600 22px Georgia, serif; margin-top:4px;" data-title>
        Build complete work package for <span data-project-name>(no project)</span>
      </div>
      <div style="margin-top:6px; color:var(--wpb-muted); font-size:12px;">
        Import → Parse → Reverse-engineer → Author tutorials → Generate drawings → Bundle
      </div>
    </header>

    <section data-options style="
      display:grid; grid-template-columns: repeat(4, 1fr); gap:10px;
      padding: 12px; border:1px solid var(--wpb-rule); border-radius:6px;
    "></section>

    <section data-phases style="display:grid; gap:8px;"></section>

    <section data-actions style="
      display:flex; gap:10px; align-items:center;
      padding-top:10px; border-top:1px solid var(--wpb-rule);
    ">
      <button data-act="run" type="button" style="
        background: var(--wpb-accent); color: #fff; border:none;
        padding: 9px 18px; border-radius: 6px; font: 600 13px Inter, sans-serif;
        cursor: pointer;
      ">Run full pipeline</button>
      <button data-act="cancel" type="button" disabled style="
        background: transparent; color: var(--wpb-fg); border:1px solid var(--wpb-rule);
        padding: 9px 16px; border-radius: 6px; cursor: pointer;
      ">Cancel</button>
      <span data-elapsed style="margin-left:auto; color:var(--wpb-muted); font-variant-numeric:tabular-nums;">—</span>
    </section>

    <section data-summary style="
      display:none; padding:14px; border:1px solid var(--wpb-rule); border-radius:6px;
      background: rgba(124,58,237,0.06);
    "></section>
  `;
  root.appendChild(host);

  // -- Options panel --
  const opt = host.querySelector('[data-options]');
  opt.innerHTML = renderOptionsForm(options);
  bindOptionsForm(opt, options, () => emit('change', options));

  // -- Phases list --
  const phasesEl = host.querySelector('[data-phases]');
  for (const p of PHASES) {
    const row = document.createElement('div');
    row.dataset.phase = p;
    row.style.cssText = `
      display:grid; grid-template-columns: 28px 1fr 80px 90px;
      align-items:center; gap:10px;
      padding: 10px 12px; border:1px solid var(--wpb-rule); border-radius: 6px;
    `;
    row.innerHTML = `
      <div data-phase-mark style="
        width:22px; height:22px; border-radius:50%;
        border:2px solid var(--wpb-rule); display:flex;
        align-items:center; justify-content:center;
        font:600 11px Inter; color:var(--wpb-muted);
      ">${PHASE_LABEL[p].slice(0, 2).trim()}</div>
      <div>
        <div style="font-weight:600;">${PHASE_LABEL[p].slice(3)}</div>
        <div data-phase-detail style="color:var(--wpb-muted); font-size:11px; margin-top:2px;">pending</div>
      </div>
      <div data-phase-bar-wrap style="
        height:6px; background:var(--wpb-rule); border-radius:3px; overflow:hidden;
      "><div data-phase-bar style="
        height:100%; width:0%; background:var(--wpb-accent);
        transition: width .3s ease;
      "></div></div>
      <div data-phase-pct style="text-align:right; font-variant-numeric:tabular-nums;
        color:var(--wpb-muted); font-size:12px;">0%</div>
    `;
    phasesEl.appendChild(row);
  }

  // -- Hidden mount for child widgets --
  const hiddenHost = document.createElement('div');
  hiddenHost.style.cssText = 'position:absolute; left:-9999px; top:-9999px; width:1px; height:1px; overflow:hidden;';
  document.body.appendChild(hiddenHost);

  // -- Wire actions --
  const runBtn = host.querySelector('[data-act="run"]');
  const cancelBtn = host.querySelector('[data-act="cancel"]');
  const onRun = () => { run().catch(err => emit('error', { phase: 'pipeline', error: err.message })); };
  const onCancel = () => { cancel(); };
  runBtn.addEventListener('click', onRun);
  cancelBtn.addEventListener('click', onCancel);
  tracked.push(() => runBtn.removeEventListener('click', onRun));
  tracked.push(() => cancelBtn.removeEventListener('click', onCancel));

  // Live elapsed timer
  const elapsedEl = host.querySelector('[data-elapsed]');
  const tickElapsed = setInterval(() => {
    if (!hostStarted) return;
    const ms = Date.now() - hostStarted;
    elapsedEl.textContent = formatMs(ms);
  }, 500);
  tracked.push(() => clearInterval(tickElapsed));

  if (options.projectName) host.querySelector('[data-project-name]').textContent = options.projectName;

  // -----------------------------------------------------------------------
  // Phase runners
  // -----------------------------------------------------------------------

  async function loadChildWidget(name, mountEl, params = {}) {
    try {
      const mod = await import(`./${name}.js`);
      const handle = await mod.init({
        mount: mountEl, app, meter,
        scene: opts.scene, camera: opts.camera, renderer: opts.renderer, root: opts.root,
        params,
      });
      childHandles.add(handle);
      return handle;
    } catch (err) {
      throw new Error(`Failed to load ${name}: ${err.message}`);
    }
  }

  function disposeChild(h) {
    if (!h) return;
    try { h.destroy(); } catch (e) { /* noop */ }
    childHandles.delete(h);
  }

  async function runPhaseImport() {
    if (options.skipImport || options.projectId) {
      markPhase('import', 'skipped', 100, options.projectId ? `using existing project ${options.projectId}` : 'skipped by option');
      return { projectId: options.projectId };
    }
    markPhase('import', 'running', 5, 'opening folder picker…');
    const slot = freshSlot();
    const handle = await loadChildWidget('inventor-project-loader', slot, {
      tenantId: options.tenantId, projectName: options.projectName,
    });
    let projectId = null;
    try {
      handle.on('parsing', ({ parsed, total }) => {
        const pct = Math.min(60, 5 + Math.floor(55 * (parsed || 0) / Math.max(1, total || 1)));
        markPhase('import', 'running', pct, `parsing ${parsed}/${total}`);
      });
      handle.on('imported', ({ projectId: pid }) => { projectId = pid; });
      // The loader is interactive — caller usually pre-selects via opts.params.handle
      // For a fully scripted run we surface a pickFolder() call:
      if (typeof handle.api.pickFolder === 'function') await handle.api.pickFolder();
      if (typeof handle.api.parseProject === 'function') await handle.api.parseProject();
      if (typeof handle.api.importToServer === 'function') {
        const r = await handle.api.importToServer({
          tenantId: options.tenantId, projectName: options.projectName,
        });
        projectId = projectId || r?.projectId;
      }
    } finally {
      disposeChild(handle);
      slot.remove();
    }
    if (!projectId) throw new Error('import phase yielded no projectId');
    options.projectId = projectId;
    summary.projectId = projectId;
    markPhase('import', 'done', 100, `project ${projectId} imported`);
    return { projectId };
  }

  async function runPhaseReverseEngineer() {
    if (options.skipReverse || !options.projectId) {
      markPhase('reverse-engineer', 'skipped', 100, 'no projectId or skipped');
      return;
    }
    markPhase('reverse-engineer', 'running', 0, 'fetching components…');
    const components = await fetchComponents(options.projectId);
    summary.totals.componentsParsed = components.length;
    if (!components.length) {
      markPhase('reverse-engineer', 'done', 100, 'no components');
      return;
    }
    const slot = freshSlot();
    const re = await loadChildWidget('reverse-engineer', slot);
    let analyzed = 0;
    const plans = new Map();
    try {
      for (const c of components) {
        if (cancelled) break;
        try {
          const r = await re.api.analyze(c.id);
          plans.set(c.id, r);
        } catch (err) {
          summary.totals.errors.push(`reverse-engineer ${c.id}: ${err.message}`);
          phaseStatus['reverse-engineer'].errors.push(err.message);
        }
        analyzed++;
        const pct = Math.floor(100 * analyzed / components.length);
        markPhase('reverse-engineer', 'running', pct, `${analyzed}/${components.length} analyzed`);
      }
    } finally {
      disposeChild(re);
      slot.remove();
    }
    markPhase('reverse-engineer', 'done', 100, `${plans.size} plans synthesized`);
    return { plans };
  }

  async function runPhaseTutorials() {
    if (options.skipTutorials || !options.projectId) {
      markPhase('tutorials', 'skipped', 100, 'no projectId or skipped');
      return;
    }
    markPhase('tutorials', 'running', 0, 'fetching components…');
    const components = await fetchComponents(options.projectId);
    if (!components.length) {
      markPhase('tutorials', 'done', 100, 'no components');
      return;
    }
    const slot = freshSlot();
    const ta = await loadChildWidget('tutorial-author', slot);
    let authored = 0;
    try {
      for (const c of components) {
        if (cancelled) break;
        try {
          await ta.api.loadComponent(c.id);
          await ta.api.synthesizeFromComponent();
          await ta.api.save();
          authored++;
          summary.totals.tutorialsAuthored++;
        } catch (err) {
          summary.totals.errors.push(`tutorial ${c.id}: ${err.message}`);
          phaseStatus['tutorials'].errors.push(err.message);
        }
        markPhase('tutorials', 'running', Math.floor(100 * authored / components.length), `${authored}/${components.length}`);
      }
    } finally {
      disposeChild(ta);
      slot.remove();
    }
    markPhase('tutorials', 'done', 100, `${authored} tutorials authored`);
  }

  async function runPhaseDrawings() {
    if (options.skipDrawings || !options.projectId) {
      markPhase('drawings', 'skipped', 100, 'no projectId or skipped');
      return;
    }
    markPhase('drawings', 'running', 0, 'starting batch…');
    const slot = freshSlot();
    const db = await loadChildWidget('drawing-batch', slot);
    try {
      await db.api.setProject(options.projectId);
      await db.api.setScope(options.drawings || {});
      const onProgress = ({ done, total }) => {
        const pct = total ? Math.floor(100 * done / total) : 0;
        markPhase('drawings', 'running', pct, `${done}/${total} sheets`);
      };
      const onComponentDone = () => { summary.totals.drawingsGenerated++; };
      db.on('progress', onProgress);
      db.on('componentDone', onComponentDone);
      await db.api.start();
    } finally {
      disposeChild(db);
      slot.remove();
    }
    markPhase('drawings', 'done', 100, `${summary.totals.drawingsGenerated} drawings`);
  }

  async function runPhaseBundle() {
    if (options.skipBundle || !options.projectId) {
      markPhase('bundle', 'skipped', 100, 'no projectId or skipped');
      return;
    }
    markPhase('bundle', 'running', 10, 'collecting artifacts…');
    const slot = freshSlot();
    const eb = await loadChildWidget('export-bundle', slot);
    try {
      await eb.api.setProject(options.projectId);
      eb.on?.('progress', ({ percent }) => {
        markPhase('bundle', 'running', Math.max(10, Math.min(95, percent || 50)), 'bundling…');
      });
      const blob = await eb.api.bundle();
      summary.totals.bundleSizeBytes = blob?.size || 0;
      const url = URL.createObjectURL(blob);
      summary.totals.bundleUrl = url;
      markPhase('bundle', 'done', 100, `${formatBytes(blob.size)} bundle ready`);
    } finally {
      disposeChild(eb);
      slot.remove();
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async function run() {
    cancelled = false;
    hostStarted = Date.now();
    runBtn.disabled = true;
    cancelBtn.disabled = false;
    host.querySelector('[data-summary]').style.display = 'none';
    Object.values(phaseStatus).forEach(p => { p.status = 'pending'; p.percent = 0; p.errors = []; });

    try {
      await meter?.charge?.({
        widget: 'work-package-builder', method: 'run',
        tokensIn: 1000, tokensOut: 5000, modelTier: 'sonnet',
      }).catch(() => {});

      for (const phase of PHASES) {
        if (cancelled) break;
        activePhase = phase;
        try {
          if (phase === 'import')           await runPhaseImport();
          if (phase === 'reverse-engineer') await runPhaseReverseEngineer();
          if (phase === 'tutorials')        await runPhaseTutorials();
          if (phase === 'drawings')         await runPhaseDrawings();
          if (phase === 'bundle')           await runPhaseBundle();
        } catch (err) {
          markPhase(phase, 'failed', 100, err.message);
          summary.totals.errors.push(`${phase}: ${err.message}`);
          emit('error', { phase, error: err.message });
        }
      }
    } finally {
      summary.totals.totalDurationMs = Date.now() - hostStarted;
      runBtn.disabled = false;
      cancelBtn.disabled = true;
      activePhase = null;
      renderSummary();
      emit('complete', summary);
    }
  }

  /** @param {string} name */
  async function runPhase(name) {
    if (!PHASES.includes(/** @type {any} */(name))) throw new Error(`unknown phase: ${name}`);
    hostStarted = Date.now();
    runBtn.disabled = true; cancelBtn.disabled = false;
    try {
      if (name === 'import')           await runPhaseImport();
      if (name === 'reverse-engineer') await runPhaseReverseEngineer();
      if (name === 'tutorials')        await runPhaseTutorials();
      if (name === 'drawings')         await runPhaseDrawings();
      if (name === 'bundle')           await runPhaseBundle();
    } finally {
      runBtn.disabled = false; cancelBtn.disabled = true;
    }
  }

  function cancel() {
    cancelled = true;
    emit('cancel', { activePhase });
    if (activePhase) markPhase(activePhase, 'failed', phaseStatus[activePhase].percent, 'cancelled');
  }

  /** @param {Partial<BuildOptions>} patch */
  function setOptions(patch) {
    options = { ...options, ...patch, drawings: { ...(options.drawings || {}), ...(patch.drawings || {}) } };
    if (patch.projectName) host.querySelector('[data-project-name]').textContent = patch.projectName;
    opt.innerHTML = renderOptionsForm(options);
    bindOptionsForm(opt, options, () => emit('change', options));
    emit('change', options);
  }

  function getStatus() {
    return {
      phase: activePhase,
      percent: activePhase ? phaseStatus[activePhase].percent : 0,
      perPhase: { ...phaseStatus },
      errors: [...summary.totals.errors],
      results: { ...summary.totals },
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * @param {string} phase
   * @param {PhaseStatus['status']} status
   * @param {number} percent
   * @param {string} [detail]
   */
  function markPhase(phase, status, percent, detail) {
    const p = phaseStatus[phase];
    if (!p) return;
    if (p.status === 'pending' && status === 'running') p.startedAt = Date.now();
    if ((status === 'done' || status === 'failed' || status === 'skipped') && !p.finishedAt) p.finishedAt = Date.now();
    p.status = status; p.percent = percent;
    const row = phasesEl.querySelector(`[data-phase="${phase}"]`);
    if (row) {
      row.querySelector('[data-phase-bar]').style.width = `${percent}%`;
      row.querySelector('[data-phase-pct]').textContent = `${percent}%`;
      const det = row.querySelector('[data-phase-detail]');
      det.textContent = detail || status;
      const mark = row.querySelector('[data-phase-mark]');
      mark.style.borderColor =
        status === 'done' ? 'var(--wpb-ok)' :
        status === 'failed' ? 'var(--wpb-err)' :
        status === 'running' ? 'var(--wpb-accent)' :
        status === 'skipped' ? 'var(--wpb-warn)' : 'var(--wpb-rule)';
      mark.style.color = mark.style.borderColor;
    }
    emit('phase', { phase, status, percent, detail });
    emit('change', options);
  }

  /** @param {string} projectId */
  async function fetchComponents(projectId) {
    try {
      const url = `/api/library/projects/${encodeURIComponent(projectId)}/components`;
      const res = await fetch(url, { headers: { 'x-tenant-id': options.tenantId || 'default' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return Array.isArray(json) ? json : (json.components || []);
    } catch (err) {
      summary.totals.errors.push(`fetchComponents: ${err.message}`);
      return [];
    }
  }

  function freshSlot() {
    const slot = document.createElement('div');
    hiddenHost.appendChild(slot);
    return slot;
  }

  function renderSummary() {
    const el = host.querySelector('[data-summary]');
    el.style.display = 'block';
    const t = summary.totals;
    const okCount = Object.values(phaseStatus).filter(p => p.status === 'done').length;
    const failCount = Object.values(phaseStatus).filter(p => p.status === 'failed').length;
    el.innerHTML = `
      <div style="font:600 14px Inter, sans-serif; margin-bottom:6px;">
        ${failCount ? '⚠ Pipeline finished with errors' : '✓ Work package built'}
      </div>
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; font-size:12px; color:var(--wpb-muted);">
        <div><b style="color:var(--wpb-fg)">${t.componentsParsed}</b> components</div>
        <div><b style="color:var(--wpb-fg)">${t.tutorialsAuthored}</b> tutorials</div>
        <div><b style="color:var(--wpb-fg)">${t.drawingsGenerated}</b> drawings</div>
        <div><b style="color:var(--wpb-fg)">${formatBytes(t.bundleSizeBytes)}</b> bundle</div>
      </div>
      <div style="margin-top:8px; font-size:12px; color:var(--wpb-muted);">
        ${okCount}/${PHASES.length} phases complete · ${formatMs(t.totalDurationMs)}
        ${t.bundleUrl ? `· <a href="${t.bundleUrl}" download="work-package-${summary.projectId}.zip" style="color:var(--wpb-accent)">Download bundle</a>` : ''}
      </div>
      ${t.errors.length ? `
        <details style="margin-top:8px;">
          <summary style="cursor:pointer; font-size:12px; color:var(--wpb-warn)">${t.errors.length} non-fatal error${t.errors.length === 1 ? '' : 's'}</summary>
          <ul style="margin:6px 0 0 16px; font-size:11px; color:var(--wpb-muted);">
            ${t.errors.slice(0, 20).map(e => `<li>${escapeHtml(e)}</li>`).join('')}
          </ul>
        </details>` : ''}
    `;
  }

  /** @param {string} ev @param {*} payload */
  function emit(ev, payload) {
    (listeners[ev] || []).forEach(fn => { try { fn(payload); } catch (err) { /* noop */ } });
  }

  function on(ev, fn) {
    if (!listeners[ev]) listeners[ev] = [];
    listeners[ev].push(fn);
  }

  function destroy() {
    cancelled = true;
    childHandles.forEach(h => { try { h.destroy(); } catch (e) { /* noop */ } });
    childHandles.clear();
    tracked.forEach(fn => { try { fn(); } catch (e) { /* noop */ } });
    tracked.length = 0;
    Object.keys(listeners).forEach(k => listeners[k].length = 0);
    if (host.parentNode) host.parentNode.removeChild(host);
    if (hiddenHost.parentNode) hiddenHost.parentNode.removeChild(hiddenHost);
    if (summary.totals.bundleUrl) URL.revokeObjectURL(summary.totals.bundleUrl);
  }

  return { api: { run, runPhase, cancel, setOptions, getStatus }, on, destroy };
}

// =========================================================================
// Pure helpers
// =========================================================================

/** @param {BuildOptions} options */
function renderOptionsForm(options) {
  const drawings = options.drawings || {};
  return `
    <label style="display:flex; flex-direction:column; gap:4px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--wpb-muted);">
      Tenant
      <input data-opt="tenantId" value="${escapeAttr(options.tenantId || 'default')}" style="${inputStyle()}"/>
    </label>
    <label style="display:flex; flex-direction:column; gap:4px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--wpb-muted);">
      Project name
      <input data-opt="projectName" value="${escapeAttr(options.projectName || '')}" placeholder="(from .ipj)" style="${inputStyle()}"/>
    </label>
    <label style="display:flex; flex-direction:column; gap:4px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--wpb-muted);">
      Sheet size
      <select data-opt="sheet" style="${inputStyle()}">
        ${['A4','A3','A2','A1','A0','letter','tabloid'].map(s =>
          `<option value="${s}"${(drawings.sheets && drawings.sheets[0] === s) ? ' selected' : ''}>${s}</option>`).join('')}
      </select>
    </label>
    <label style="display:flex; flex-direction:column; gap:4px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--wpb-muted);">
      Narration tier
      <select data-opt="tier" style="${inputStyle()}">
        ${['haiku','sonnet','opus'].map(t =>
          `<option value="${t}"${options.narration?.tier === t ? ' selected' : ''}>${t}</option>`).join('')}
      </select>
    </label>
  `;
}

/**
 * @param {Element} container
 * @param {BuildOptions} options
 * @param {()=>void} onChange
 */
function bindOptionsForm(container, options, onChange) {
  container.querySelectorAll('[data-opt]').forEach(el => {
    el.addEventListener('change', () => {
      const k = el.getAttribute('data-opt');
      const v = /** @type {HTMLInputElement|HTMLSelectElement} */ (el).value;
      if (k === 'tenantId')    options.tenantId = v;
      if (k === 'projectName') options.projectName = v;
      if (k === 'sheet')       options.drawings = { ...(options.drawings || {}), sheets: [v] };
      if (k === 'tier')        options.narration = { tier: /** @type {any} */(v) };
      onChange();
    });
  });
}

function inputStyle() {
  return `
    background: rgba(255,255,255,0.04); color: var(--wpb-fg);
    border: 1px solid var(--wpb-rule); border-radius: 4px;
    padding: 6px 9px; font: 13px Inter, sans-serif; outline: none;
  `;
}

/** @param {number} ms */
function formatMs(ms) {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}.${String(Math.floor((ms % 1000) / 100))} s`;
  const m = Math.floor(s / 60), rs = s % 60;
  return `${m}m ${rs}s`;
}

/** @param {number} bytes */
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** @param {string} s */
function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
