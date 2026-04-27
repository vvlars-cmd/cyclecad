/**
 * @file widgets/tutorial-player.js
 * @description Replays a tutorial DSL document over a 3D viewport.
 *
 *   Player chrome:
 *     - top bar    : step counter + title + breadcrumb
 *     - bottom-left: narration card
 *     - top-right  : action card (kind + params)
 *     - bottom     : timeline scrubber + play/pause/prev/next + speed
 *     - right      : full step list (collapsible)
 *
 *   Viewport sync: when a step has `viewport`, the player lerps the live
 *   camera (and `controls.target` if available) over ~600ms / speed.
 *
 *   Caches loaded tutorials in a module-level Map for instant replay.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import {
  validateTutorial,
  topoSortSteps,
  summarizeTutorial,
} from '../shared/tutorial-schema.js';

const TUTORIAL_CACHE = new Map();
const DEFAULT_STEP_MS = 30_000;
const CAMERA_LERP_MS  = 600;

/**
 * Mount the tutorial player.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   scene?: object,
 *   camera?: object,
 *   renderer?: object,
 *   controls?: object,
 *   params?: { tutorialId?: string|number, tutorial?: object, autoPlay?: boolean }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     load: (idOrTutorial: string|number|object) => Promise<object>,
 *     play: () => void,
 *     pause: () => void,
 *     resume: () => void,
 *     stop: () => void,
 *     next: () => void,
 *     prev: () => void,
 *     goTo: (index: number) => void,
 *     setSpeed: (multiplier: number) => void,
 *     getProgress: () => { index: number, total: number, elapsedMs: number },
 *     replayCurrent: () => void
 *   },
 *   on: (event: 'loaded'|'play'|'pause'|'step'|'complete'|'error'|'change', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('tutorial-player: mount not found');
  if (!root.style.position || root.style.position === 'static') root.style.position = 'relative';

  const listeners = {
    loaded: [], play: [], pause: [], step: [], complete: [], error: [], change: [],
  };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const state = {
    tutorial:       null,
    orderedSteps:   [],
    currentIndex:   0,
    playing:        false,
    speed:          1,
    timer:          null,
    elapsedMs:      0,
    stepStartMs:    0,
    lastFrameMs:    0,
    raf:            0,
    cameraAnim:     null,
    listCollapsed:  false,
  };

  const dom = buildDom(root);

  // ---- DOM wiring ----
  dom.btnPlay.addEventListener('click',    () => state.playing ? pause() : play());
  dom.btnPrev.addEventListener('click',    () => prev());
  dom.btnNext.addEventListener('click',    () => next());
  dom.btnReplay.addEventListener('click',  () => replayCurrent());
  dom.btnList.addEventListener('click',    () => {
    state.listCollapsed = !state.listCollapsed;
    dom.wrap.classList.toggle('list-collapsed', state.listCollapsed);
  });
  dom.speedSelect.addEventListener('change', () => setSpeed(parseFloat(dom.speedSelect.value)));

  // ---- API ----

  async function load(idOrJson) {
    try {
      let tutorial = null;
      if (idOrJson && typeof idOrJson === 'object' && Array.isArray(idOrJson.steps)) {
        tutorial = idOrJson;
      } else {
        const id = String(idOrJson);
        if (TUTORIAL_CACHE.has(id)) {
          tutorial = TUTORIAL_CACHE.get(id);
        } else {
          const res = await fetch(`/api/library/tutorials/${encodeURIComponent(id)}`);
          if (!res.ok) throw new Error(`tutorial ${id} → ${res.status}`);
          const j = await res.json();
          tutorial = j.tutorial?.body || j.body || j.tutorial || j;
        }
      }
      const v = validateTutorial(tutorial);
      if (!v.ok) {
        emit('error', { kind: 'invalid', errors: v.errors });
      }
      state.tutorial     = tutorial;
      state.orderedSteps = topoSortSteps(tutorial);
      if (state.orderedSteps.length === 0 && Array.isArray(tutorial.steps)) {
        state.orderedSteps = tutorial.steps.slice();
      }
      state.currentIndex = 0;
      state.elapsedMs    = 0;
      if (tutorial.id) TUTORIAL_CACHE.set(String(tutorial.id), tutorial);
      chargeAi('load', { tokensIn: 100, tokensOut: 50, modelTier: 'sonnet' });
      renderAll();
      goTo(0);
      emit('loaded', { id: tutorial.id, steps: state.orderedSteps.length });
      return tutorial;
    } catch (err) {
      emit('error', { kind: 'load', message: err.message });
      throw err;
    }
  }

  function play() {
    if (!state.tutorial || state.orderedSteps.length === 0) return false;
    state.playing = true;
    state.lastFrameMs = performance.now();
    state.stepStartMs = state.lastFrameMs;
    if (!state.raf) tickLoop();
    renderControls();
    emit('play', { index: state.currentIndex });
    return true;
  }

  function pause() {
    state.playing = false;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    renderControls();
    emit('pause', { index: state.currentIndex });
  }

  function resume() { return play(); }

  function stop() {
    pause();
    state.currentIndex = 0;
    state.elapsedMs = 0;
    renderAll();
    goTo(0);
  }

  function next() { return goTo(state.currentIndex + 1); }
  function prev() { return goTo(state.currentIndex - 1); }

  function goTo(index) {
    if (!state.tutorial) return false;
    const i = Math.max(0, Math.min(index, state.orderedSteps.length - 1));
    state.currentIndex = i;
    state.stepStartMs  = performance.now();
    chargeAi('advance', { tokensIn: 30, tokensOut: 30, modelTier: 'haiku' });
    const step = state.orderedSteps[i];
    if (step) syncViewport(step.viewport);
    renderAll();
    emit('step', { index: i, step });
    if (i >= state.orderedSteps.length - 1 && state.playing) {
      pause();
      emit('complete', { index: i });
    }
    return true;
  }

  function setSpeed(s) {
    state.speed = Number.isFinite(s) && s > 0 ? s : 1;
    dom.speedSelect.value = String(state.speed);
    emit('change', { kind: 'speed', value: state.speed });
  }

  function getProgress() {
    const total = state.orderedSteps.length;
    const totalEstMs = stepDurationMs() * total;
    return {
      currentStep: state.currentIndex,
      totalSteps:  total,
      elapsedMs:   state.elapsedMs,
      totalEstMs,
    };
  }

  function replayCurrent() {
    const step = state.orderedSteps[state.currentIndex];
    if (!step) return false;
    state.stepStartMs = performance.now();
    chargeAi('replay', { tokensIn: 80, tokensOut: 80, modelTier: 'sonnet' });
    if (step.viewport) syncViewport(step.viewport, true);
    renderAll();
    emit('step', { index: state.currentIndex, step, replay: true });
    return true;
  }

  // ---- per-frame loop (camera lerp + auto-advance) ----

  function tickLoop() {
    state.raf = requestAnimationFrame(tickLoop);
    const now = performance.now();
    const dt  = now - state.lastFrameMs;
    state.lastFrameMs = now;

    stepCameraAnim(now);

    if (!state.playing) return;
    state.elapsedMs += dt * state.speed;
    const stepMs = stepDurationMs();
    if ((now - state.stepStartMs) * state.speed >= stepMs) {
      if (state.currentIndex >= state.orderedSteps.length - 1) {
        pause();
        emit('complete', { index: state.currentIndex });
      } else {
        next();
      }
    }
    renderProgress();
  }

  function stepDurationMs() {
    const total = state.orderedSteps.length || 1;
    const mins = state.tutorial?.estimatedTime?.minutes;
    if (Number.isFinite(mins) && mins > 0) {
      return Math.max(2000, (mins * 60_000) / total);
    }
    return DEFAULT_STEP_MS;
  }

  // ---- viewport (camera lerp) ----

  function syncViewport(snapshot, force) {
    if (!opts.camera || !snapshot) {
      if (!snapshot) {
        // If a step has no viewport, do not touch the camera. The previous
        // step's framing carries forward, which is the friendliest behaviour
        // for reviewers.
        dom.actionVp.textContent = 'no viewport';
        return;
      }
    }
    const fromPos = vec(opts.camera?.position);
    const fromTgt = opts.controls?.target ? vec(opts.controls.target) : { x: 0, y: 0, z: 0 };
    const toPos   = snapshot.position || fromPos;
    const toTgt   = snapshot.target   || fromTgt;
    state.cameraAnim = {
      from: { pos: fromPos, tgt: fromTgt },
      to:   { pos: toPos,   tgt: toTgt },
      start: performance.now(),
      duration: CAMERA_LERP_MS / Math.max(0.5, state.speed),
      fov: snapshot.fov,
    };
    dom.actionVp.textContent = `→ pos (${toPos.x.toFixed(1)}, ${toPos.y.toFixed(1)}, ${toPos.z.toFixed(1)})`;
    if (force) state.cameraAnim.start = performance.now();
  }

  function stepCameraAnim(now) {
    const a = state.cameraAnim;
    if (!a || !opts.camera) return;
    const t = Math.min(1, (now - a.start) / a.duration);
    const e = ease(t);
    opts.camera.position.set(
      lerp(a.from.pos.x, a.to.pos.x, e),
      lerp(a.from.pos.y, a.to.pos.y, e),
      lerp(a.from.pos.z, a.to.pos.z, e),
    );
    if (opts.controls?.target) {
      opts.controls.target.set(
        lerp(a.from.tgt.x, a.to.tgt.x, e),
        lerp(a.from.tgt.y, a.to.tgt.y, e),
        lerp(a.from.tgt.z, a.to.tgt.z, e),
      );
    } else if (opts.camera.lookAt) {
      opts.camera.lookAt(
        lerp(a.from.tgt.x, a.to.tgt.x, e),
        lerp(a.from.tgt.y, a.to.tgt.y, e),
        lerp(a.from.tgt.z, a.to.tgt.z, e),
      );
    }
    if (a.fov && opts.camera.fov != null) opts.camera.fov = lerp(opts.camera.fov, a.fov, e);
    if (opts.camera.updateProjectionMatrix) opts.camera.updateProjectionMatrix();
    if (t >= 1) state.cameraAnim = null;
  }

  // ---- rendering ----

  function renderAll() {
    renderHeader();
    renderStepList();
    renderCards();
    renderTimeline();
    renderControls();
    renderProgress();
  }

  function renderHeader() {
    const t = state.tutorial;
    if (!t) { dom.headerTitle.textContent = '(no tutorial loaded)'; dom.headerCrumb.textContent = ''; return; }
    const i = state.currentIndex;
    const s = state.orderedSteps[i];
    dom.headerTitle.textContent = `Step ${i + 1} / ${state.orderedSteps.length} — ${s ? `${capitalize(s.kind)} · ${s.title || ''}` : ''}`;
    dom.headerCrumb.textContent = `${t.title} · ${summarizeTutorial(t)}`;
  }

  function renderStepList() {
    const t = state.tutorial;
    dom.stepList.innerHTML = '';
    if (!t) return;
    state.orderedSteps.forEach((s, i) => {
      const li = document.createElement('div');
      li.className = 'pt-pl-step' + (i === state.currentIndex ? ' is-active' : '') + (i < state.currentIndex ? ' is-done' : '');
      li.innerHTML = `<span class="n">${i + 1}</span><span class="k">${s.kind}</span><span class="t">${escapeHtml(s.title || '')}</span>`;
      li.addEventListener('click', () => goTo(i));
      dom.stepList.appendChild(li);
    });
  }

  function renderCards() {
    const s = state.orderedSteps[state.currentIndex];
    if (!s) {
      dom.narrationText.textContent = '';
      dom.actionKind.textContent = '';
      dom.actionParams.textContent = '';
      dom.actionVp.textContent = '';
      return;
    }
    dom.narrationText.textContent = s.narration || '(no narration)';
    dom.actionKind.textContent    = s.kind;
    dom.actionParams.textContent  = JSON.stringify(s.params || {}, null, 2);
    dom.actionVp.textContent      = s.viewport ? 'viewport: synced' : 'viewport: inherited';
  }

  function renderTimeline() {
    dom.timeline.innerHTML = '';
    state.orderedSteps.forEach((s, i) => {
      const tick = document.createElement('div');
      tick.className = 'pt-tick' + (i === state.currentIndex ? ' is-active' : '') + (i < state.currentIndex ? ' is-done' : '');
      tick.title = `${i + 1}. ${s.title || s.kind}`;
      tick.addEventListener('click', () => goTo(i));
      dom.timeline.appendChild(tick);
    });
  }

  function renderControls() {
    dom.btnPlay.textContent = state.playing ? '❚❚' : '▶';
    dom.btnPlay.title = state.playing ? 'Pause' : 'Play';
  }

  function renderProgress() {
    const total = state.orderedSteps.length;
    if (!total) { dom.progressFill.style.width = '0%'; return; }
    const stepFrac = (performance.now() - state.stepStartMs) * state.speed / stepDurationMs();
    const overall = (state.currentIndex + Math.min(1, Math.max(0, stepFrac))) / total;
    dom.progressFill.style.width = `${(overall * 100).toFixed(2)}%`;
  }

  function chargeAi(method, payload) {
    try {
      opts.meter?.charge?.({
        widget: 'tutorial-player',
        method,
        actor: opts.params?.actor,
        ...payload,
      });
    } catch {}
  }

  // start frame loop (handles camera lerp even when paused)
  state.lastFrameMs = performance.now();
  state.raf = requestAnimationFrame(tickLoop);

  // optional auto-load
  if (opts.params?.tutorialId) load(opts.params.tutorialId).catch(() => {});
  else if (opts.params?.tutorial) load(opts.params.tutorial).catch(() => {});

  return {
    api: {
      load,
      play, pause, resume, stop,
      next, prev, goTo,
      setSpeed,
      getProgress,
      replayCurrent,
    },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    destroy() {
      if (state.raf) cancelAnimationFrame(state.raf);
      if (state.timer) clearTimeout(state.timer);
      dom.wrap.remove();
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function vec(v) {
  if (!v) return { x: 0, y: 0, z: 0 };
  return { x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ──────────────────────────────────────────────────────────────────────
// DOM
// ──────────────────────────────────────────────────────────────────────

function buildDom(root) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-tutorial-player';
  wrap.innerHTML = `
<style>
.pt-tutorial-player { position: absolute; inset: 0; pointer-events: none; font: 13px Inter, sans-serif; color: #1f2937; z-index: 14; }
.pt-tutorial-player > * { pointer-events: auto; }
.pt-tutorial-player .pt-pl-top {
  position: absolute; top: 12px; left: 12px; right: 220px;
  background: rgba(255,255,255,0.95); border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 8px 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}
.pt-tutorial-player.list-collapsed .pt-pl-top { right: 50px; }
.pt-tutorial-player .pt-pl-top h3 { margin: 0; font: 600 14px Georgia, serif; }
.pt-tutorial-player .pt-pl-top .crumb { margin-top: 2px; font: 11px Menlo, monospace; color: #6b7280; }
.pt-tutorial-player .pt-pl-narr {
  position: absolute; left: 12px; bottom: 80px; max-width: 480px;
  background: rgba(255,255,255,0.97); border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 12px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.10);
}
.pt-tutorial-player .pt-pl-narr .eyebrow { font: 600 10px Inter; color: #7C3AED; letter-spacing: 2px; margin-bottom: 4px; }
.pt-tutorial-player .pt-pl-narr p { margin: 0; line-height: 1.5; font-size: 13px; }
.pt-tutorial-player .pt-pl-action {
  position: absolute; right: 220px; top: 80px; width: 220px;
  background: rgba(255,255,255,0.97); border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 10px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.10);
}
.pt-tutorial-player.list-collapsed .pt-pl-action { right: 50px; }
.pt-tutorial-player .pt-pl-action .eyebrow { font: 600 10px Inter; color: #10B981; letter-spacing: 2px; margin-bottom: 4px; }
.pt-tutorial-player .pt-pl-action .kind { font: 600 14px Georgia, serif; margin-bottom: 6px; }
.pt-tutorial-player .pt-pl-action pre { margin: 0; font: 11px Menlo, monospace; color: #4b5563; max-height: 140px; overflow: auto; white-space: pre-wrap; }
.pt-tutorial-player .pt-pl-action .vp { font: 10px Menlo, monospace; color: #6b7280; margin-top: 4px; }
.pt-tutorial-player .pt-pl-bottom {
  position: absolute; left: 12px; right: 220px; bottom: 12px;
  background: rgba(255,255,255,0.97); border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 8px 12px; display: grid; grid-template-rows: 4px auto auto; gap: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.10);
}
.pt-tutorial-player.list-collapsed .pt-pl-bottom { right: 50px; }
.pt-tutorial-player .pt-progress { height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden; }
.pt-tutorial-player .pt-progress > div { height: 100%; background: #7C3AED; transition: width 200ms; }
.pt-tutorial-player .pt-timeline { display: flex; gap: 3px; height: 14px; align-items: center; }
.pt-tutorial-player .pt-tick { flex: 1; height: 6px; background: #e5e7eb; border-radius: 2px; cursor: pointer; }
.pt-tutorial-player .pt-tick.is-done   { background: #10B981; }
.pt-tutorial-player .pt-tick.is-active { background: #7C3AED; height: 12px; }
.pt-tutorial-player .pt-tick:hover     { opacity: 0.8; }
.pt-tutorial-player .pt-controls { display: flex; align-items: center; gap: 6px; }
.pt-tutorial-player .pt-controls button { background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px 10px; border-radius: 3px; cursor: pointer; font: 600 12px Inter; }
.pt-tutorial-player .pt-controls button:hover { background: #e5e7eb; }
.pt-tutorial-player .pt-controls .pt-play { background: #7C3AED; color: #fff; border-color: #7C3AED; min-width: 36px; }
.pt-tutorial-player .pt-controls .pt-play:hover { background: #6d28d9; }
.pt-tutorial-player .pt-controls select { padding: 4px 6px; font: 12px Inter; border: 1px solid #d1d5db; border-radius: 3px; }
.pt-tutorial-player .pt-pl-list {
  position: absolute; right: 12px; top: 12px; bottom: 12px; width: 200px;
  background: rgba(255,255,255,0.97); border: 1px solid #e5e7eb; border-radius: 6px;
  padding: 8px; overflow: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.10);
}
.pt-tutorial-player.list-collapsed .pt-pl-list { width: 30px; padding: 8px 4px; }
.pt-tutorial-player.list-collapsed .pt-step-list { display: none; }
.pt-tutorial-player .pt-list-toggle { width: 100%; background: transparent; border: none; cursor: pointer; font-size: 14px; padding: 2px 0; }
.pt-tutorial-player .pt-pl-step { display: grid; grid-template-columns: 22px 60px 1fr; gap: 4px; align-items: center; padding: 4px 6px; border-radius: 3px; cursor: pointer; font-size: 12px; }
.pt-tutorial-player .pt-pl-step:hover { background: #f3f4f6; }
.pt-tutorial-player .pt-pl-step.is-active { background: rgba(124,58,237,0.10); outline: 1px solid #7C3AED; }
.pt-tutorial-player .pt-pl-step.is-done   { color: #6b7280; }
.pt-tutorial-player .pt-pl-step .n { font: 600 11px Menlo, monospace; }
.pt-tutorial-player .pt-pl-step .k { font: 11px Menlo, monospace; color: #6b7280; }
.pt-tutorial-player .pt-pl-step .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
<div class="pt-pl-top">
  <h3 data-header-title>(no tutorial loaded)</h3>
  <div class="crumb" data-header-crumb></div>
</div>
<div class="pt-pl-narr">
  <div class="eyebrow">NARRATION</div>
  <p data-narration-text></p>
</div>
<div class="pt-pl-action">
  <div class="eyebrow">ACTION</div>
  <div class="kind" data-action-kind></div>
  <pre data-action-params></pre>
  <div class="vp" data-action-vp></div>
</div>
<div class="pt-pl-bottom">
  <div class="pt-progress"><div data-progress-fill></div></div>
  <div class="pt-timeline" data-timeline></div>
  <div class="pt-controls">
    <button data-act="prev" title="Previous">‹</button>
    <button class="pt-play" data-act="play" title="Play">▶</button>
    <button data-act="next" title="Next">›</button>
    <button data-act="replay" title="Replay current">↻</button>
    <span style="flex:1"></span>
    <label style="font-size:11px;color:#6b7280">speed
      <select data-act="speed">
        <option value="0.5">0.5×</option>
        <option value="1" selected>1×</option>
        <option value="2">2×</option>
        <option value="4">4×</option>
      </select>
    </label>
  </div>
</div>
<div class="pt-pl-list">
  <button class="pt-list-toggle" data-act="toggle-list" title="Toggle list">☰</button>
  <div class="pt-step-list" data-step-list></div>
</div>
`;
  root.appendChild(wrap);
  return {
    wrap,
    headerTitle:    wrap.querySelector('[data-header-title]'),
    headerCrumb:    wrap.querySelector('[data-header-crumb]'),
    narrationText:  wrap.querySelector('[data-narration-text]'),
    actionKind:     wrap.querySelector('[data-action-kind]'),
    actionParams:   wrap.querySelector('[data-action-params]'),
    actionVp:       wrap.querySelector('[data-action-vp]'),
    timeline:       wrap.querySelector('[data-timeline]'),
    progressFill:   wrap.querySelector('[data-progress-fill]'),
    stepList:       wrap.querySelector('[data-step-list]'),
    btnPlay:        wrap.querySelector('[data-act="play"]'),
    btnPrev:        wrap.querySelector('[data-act="prev"]'),
    btnNext:        wrap.querySelector('[data-act="next"]'),
    btnReplay:      wrap.querySelector('[data-act="replay"]'),
    btnList:        wrap.querySelector('[data-act="toggle-list"]'),
    speedSelect:    wrap.querySelector('[data-act="speed"]'),
  };
}
