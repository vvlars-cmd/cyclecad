/**
 * @file widgets/rebuild-guide.js
 * @description Visual companion to reverse-engineer. Walks through a
 *   synthesized feature-tree one step at a time, with a 3D viewport overlay
 *   that dims everything except the meshes touched by the current step,
 *   plus an instructional bottom strip.
 *
 *   Mounts:
 *     - bottom overlay strip (counter, narration, transport, progress)
 *     - sketch-overlay group attached under opts.root (or scene) when the
 *       active step is a `sketch`
 *     - extrude-arrow helper for `extrude` steps
 *
 *   Falls back gracefully if scene/camera/renderer are absent: the strip
 *   still renders, just with no 3D highlights.
 *
 *   Events: step, play, pause, complete, change, openAuthor, openPlayer.
 *
 * @author Sachin Kumar
 * @license MIT
 *
 * Use Case 1 · feature-tree replay.
 */

import { THREE } from '../shared/lib/three-imports.js';

const ESC = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PLANE_COLORS = {
  XY: 0x7C3AED, XZ: 0x10B981, YZ: 0xF59E0B, custom: 0x3B82F6,
};

/**
 * Mount the rebuild-guide step replayer.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   scene?: object,
 *   camera?: object,
 *   renderer?: object,
 *   root?: object,
 *   params?: { plan?: Array<object>, speedMs?: number }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     loadPlan: (steps: Array<object>) => void,
 *     showStep: (index: number) => void,
 *     next: () => void,
 *     prev: () => void,
 *     play: () => void,
 *     pause: () => void,
 *     setSpeed: (ms: number) => void,
 *     getCurrentStep: () => object|null
 *   },
 *   on: (event: 'step'|'play'|'pause'|'complete'|'change'|'openAuthor'|'openPlayer', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('rebuild-guide: mount not found');
  if (!root.style.position || root.style.position === 'static') {
    root.style.position = 'relative';
  }

  const state = {
    plan: [],
    index: 0,
    playing: false,
    speedMs: 1500,
    timer: null,
    affectedMeshes: new Map(),
    overlayGroup: null,
  };
  const listeners = {
    step: [], play: [], pause: [], complete: [], change: [],
    openAuthor: [], openPlayer: [],
  };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  // 3D scratch — only used if the host gave us a scene.
  if (opts.scene) {
    state.overlayGroup = new THREE.Group();
    state.overlayGroup.name = 'rebuild-guide-overlay';
    (opts.root || opts.scene).add(state.overlayGroup);
  }

  const dom = buildDom(root);
  paint();

  /* ----------------------------------------------------------- API impl */

  function loadPlan(plan) {
    clearOverlay();
    state.plan = Array.isArray(plan) ? plan.slice() : [];
    state.index = 0;
    state.playing = false;
    stopTimer();
    paint();
    if (state.plan.length) showStep(0);
    emit('change', { kind: 'load', steps: state.plan.length });
  }

  function showStep(i) {
    if (!state.plan.length) return;
    const idx = Math.max(0, Math.min(state.plan.length - 1, i | 0));
    state.index = idx;
    const step = state.plan[idx];
    clearOverlay();
    if (step) drawStepHighlight(step);
    paint();
    emit('step', { index: idx, step });
    emit('change', { kind: 'step', index: idx });
  }

  function next() {
    if (state.index < state.plan.length - 1) showStep(state.index + 1);
    else { stopTimer(); state.playing = false; emit('complete', { steps: state.plan.length }); paint(); }
  }
  function prev() { if (state.index > 0) showStep(state.index - 1); }

  function play() {
    if (!state.plan.length || state.playing) return;
    state.playing = true;
    paint();
    emit('play', { speedMs: state.speedMs });
    state.timer = setInterval(() => {
      if (state.index >= state.plan.length - 1) {
        stopTimer();
        state.playing = false;
        emit('complete', { steps: state.plan.length });
        paint();
        return;
      }
      next();
    }, state.speedMs);
  }
  function pause() {
    if (!state.playing) return;
    stopTimer();
    state.playing = false;
    paint();
    emit('pause', {});
  }
  function setSpeed(s) {
    const n = Number(s);
    if (!isFinite(n) || n <= 0) return;
    state.speedMs = n;
    if (state.playing) { stopTimer(); play(); }
  }
  function getCurrentStep() {
    return state.plan[state.index] || null;
  }

  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  /* ------------------------------------------------------ overlay logic */

  function clearOverlay() {
    if (!state.overlayGroup) return;
    while (state.overlayGroup.children.length) {
      const ch = state.overlayGroup.children.pop();
      ch.traverse?.((o) => {
        if (o.geometry) try { o.geometry.dispose(); } catch {}
        if (o.material) try { Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); } catch {}
      });
    }
    // Restore previously-dimmed meshes.
    for (const [mesh, prev] of state.affectedMeshes.entries()) {
      try {
        mesh.material.opacity = prev.opacity;
        mesh.material.transparent = prev.transparent;
      } catch {}
    }
    state.affectedMeshes.clear();
  }

  function drawStepHighlight(step) {
    if (!opts.scene || !state.overlayGroup) return;
    // Default: dim everything in the scene-graph root.
    const targetRoot = opts.root || opts.scene;
    targetRoot.traverse((o) => {
      if (o.isMesh && o.material && o !== state.overlayGroup) {
        if (!state.affectedMeshes.has(o)) {
          state.affectedMeshes.set(o, {
            opacity: o.material.opacity ?? 1,
            transparent: !!o.material.transparent,
          });
        }
        o.material.transparent = true;
        o.material.opacity = 0.18;
      }
    });

    if (step.kind === 'sketch') {
      const plane = step.params?.plane || 'XY';
      const color = PLANE_COLORS[plane] || PLANE_COLORS.custom;
      const size = 80;
      const half = size / 2;
      // Plane fill (semi-transparent quad).
      const planeGeom = new THREE.PlaneGeometry(size, size);
      const planeMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false,
      });
      const planeMesh = new THREE.Mesh(planeGeom, planeMat);
      orientToPlane(planeMesh, plane);
      state.overlayGroup.add(planeMesh);

      // Grid as line-segments.
      const lines = [];
      const stepPx = 10;
      for (let v = -half; v <= half; v += stepPx) {
        lines.push(-half, v, 0,  half, v, 0);
        lines.push(v, -half, 0,  v,  half, 0);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      const lm = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
      const seg = new THREE.LineSegments(lg, lm);
      orientToPlane(seg, plane);
      state.overlayGroup.add(seg);
    } else if (step.kind === 'extrude') {
      // Directional arrow along Z by default.
      const dist = Number(step.params?.distance) || 10;
      const dir = new THREE.Vector3(0, 0, 1);
      const origin = new THREE.Vector3(0, 0, 0);
      const len = Math.max(5, Math.min(50, dist));
      const arrow = new THREE.ArrowHelper(dir, origin, len, 0x10B981, len * 0.25, len * 0.18);
      state.overlayGroup.add(arrow);
    } else if (step.kind === 'revolve') {
      const axis = (step.params?.axis || 'Y').toUpperCase();
      const dir = axis === 'X' ? new THREE.Vector3(1, 0, 0)
                : axis === 'Y' ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(0, 0, 1);
      const a = new THREE.ArrowHelper(dir, new THREE.Vector3(0, -25, 0), 50, 0xF59E0B, 4, 3);
      state.overlayGroup.add(a);
    } else if (step.kind === 'fillet' || step.kind === 'chamfer' || step.kind === 'hole') {
      // Just brighten the first "affected mesh" we find — pick one heuristically.
      let i = 0;
      for (const mesh of state.affectedMeshes.keys()) {
        if (i++ >= 1) break;
        try {
          mesh.material.opacity = 0.95;
          mesh.material.transparent = false;
        } catch {}
      }
    } else if (step.kind === 'place' || step.kind === 'mate') {
      // Restore everything — assemblies need full visibility.
      for (const [mesh, prev] of state.affectedMeshes.entries()) {
        try {
          mesh.material.opacity = prev.opacity;
          mesh.material.transparent = prev.transparent;
        } catch {}
      }
    }
  }

  function orientToPlane(obj, plane) {
    obj.rotation.set(0, 0, 0);
    if (plane === 'XZ') obj.rotation.x = -Math.PI / 2;
    else if (plane === 'YZ') obj.rotation.y =  Math.PI / 2;
    // XY is the default — no rotation needed.
  }

  /* ---------------------------------------------------------------- DOM */

  function paint() {
    const total = state.plan.length;
    const idx = state.index;
    const step = getCurrentStep();
    if (!total) {
      dom.title.textContent = 'No plan loaded';
      dom.kind.textContent = '';
      dom.narration.textContent = 'Call api.loadPlan(steps) to begin.';
      dom.counter.textContent = '0 / 0';
      dom.bar.style.width = '0%';
      dom.playBtn.textContent = '▶';
      dom.prevBtn.disabled = true;
      dom.nextBtn.disabled = true;
      return;
    }
    dom.title.textContent = step?.title || `Step ${idx + 1}`;
    dom.kind.textContent = step?.kind || '';
    dom.narration.textContent = step?.narration || '';
    dom.counter.textContent = `${idx + 1} / ${total}`;
    dom.bar.style.width = `${((idx + 1) / total) * 100}%`;
    dom.playBtn.textContent = state.playing ? '⏸' : '▶';
    dom.prevBtn.disabled = idx === 0;
    dom.nextBtn.disabled = idx === total - 1;
  }

  dom.prevBtn.addEventListener('click', () => prev());
  dom.nextBtn.addEventListener('click', () => next());
  dom.playBtn.addEventListener('click', () => (state.playing ? pause() : play()));
  dom.authorBtn.addEventListener('click', () => emit('openAuthor', { plan: state.plan, index: state.index }));
  dom.playerBtn.addEventListener('click', () => emit('openPlayer', { plan: state.plan, index: state.index }));

  return {
    api: { loadPlan, showStep, next, prev, play, pause, setSpeed, getCurrentStep },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      stopTimer();
      clearOverlay();
      if (state.overlayGroup) {
        try { state.overlayGroup.parent?.remove(state.overlayGroup); } catch {}
        state.overlayGroup = null;
      }
      try { dom.wrap.remove(); } catch {}
    },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   DOM scaffolding
   ──────────────────────────────────────────────────────────────────────── */

function buildDom(root) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-rebuild-guide';
  wrap.innerHTML = `
<style>
.pt-rebuild-guide {
  position: absolute; left: 12px; right: 12px; bottom: 12px;
  background: rgba(15, 23, 42, 0.92); color: #F1F5F9;
  border-radius: 10px; padding: 10px 14px;
  font: 13px Inter, sans-serif; z-index: 14;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  user-select: none;
}
.pt-rg-row { display:flex; gap:10px; align-items:center; }
.pt-rg-title { font: 600 14px Georgia; color:#fff; }
.pt-rg-kind  { font: 600 9px Inter; letter-spacing:2px; color:#A78BFA; padding:2px 6px; background:rgba(167,139,250,0.18); border-radius:3px; text-transform:uppercase; }
.pt-rg-counter { margin-left:auto; font: 600 11px Menlo, monospace; color:#94A3B8; }
.pt-rg-narr { margin-top:6px; font: 400 12px Inter; color:#CBD5E1; line-height:1.5; min-height:34px; }
.pt-rg-bar { margin-top:8px; height: 3px; background: rgba(255,255,255,0.12); border-radius:2px; overflow:hidden; }
.pt-rg-bar-inner { height:100%; background:#7C3AED; transition: width 220ms ease; }
.pt-rg-controls { margin-top:8px; display:flex; gap:6px; align-items:center; }
.pt-rg-btn {
  background: rgba(255,255,255,0.10); color:#fff;
  border:none; border-radius:4px;
  padding: 5px 10px; font: 600 11px Inter; letter-spacing:1px;
  cursor:pointer;
}
.pt-rg-btn:hover { background: rgba(255,255,255,0.18); }
.pt-rg-btn:disabled { opacity:0.45; cursor:not-allowed; }
.pt-rg-btn.primary { background:#7C3AED; }
.pt-rg-btn.primary:hover { background:#6D28D9; }
.pt-rg-spacer { flex:1; }
.pt-rg-link {
  background: transparent; color:#A78BFA; border: 1px solid rgba(167,139,250,0.4);
}
.pt-rg-link:hover { background: rgba(167,139,250,0.15); color:#fff; }
</style>
<div class="pt-rg-row">
  <span class="pt-rg-title" data-title>No plan loaded</span>
  <span class="pt-rg-kind"  data-kind></span>
  <span class="pt-rg-counter" data-counter>0 / 0</span>
</div>
<div class="pt-rg-narr" data-narration>Call api.loadPlan(steps) to begin.</div>
<div class="pt-rg-bar"><div class="pt-rg-bar-inner" data-bar style="width:0%"></div></div>
<div class="pt-rg-controls">
  <button class="pt-rg-btn"         data-prev title="previous">◀</button>
  <button class="pt-rg-btn primary" data-play title="play / pause">▶</button>
  <button class="pt-rg-btn"         data-next title="next">▶▶</button>
  <span class="pt-rg-spacer"></span>
  <button class="pt-rg-btn pt-rg-link" data-author>OPEN IN AUTHOR</button>
  <button class="pt-rg-btn pt-rg-link" data-player>RUN AS TUTORIAL</button>
</div>`;
  root.appendChild(wrap);
  return {
    wrap,
    title:     wrap.querySelector('[data-title]'),
    kind:      wrap.querySelector('[data-kind]'),
    counter:   wrap.querySelector('[data-counter]'),
    narration: wrap.querySelector('[data-narration]'),
    bar:       wrap.querySelector('[data-bar]'),
    prevBtn:   wrap.querySelector('[data-prev]'),
    playBtn:   wrap.querySelector('[data-play]'),
    nextBtn:   wrap.querySelector('[data-next]'),
    authorBtn: wrap.querySelector('[data-author]'),
    playerBtn: wrap.querySelector('[data-player]'),
  };
}
