/**
 * @file shared/pentacad/engine.js
 * @description Pure-logic Pentacad simulator engine — DOM-free, THREE-free.
 *   Owns the MACHINES catalog, the live `app` state, the NGC parser (a thin
 *   adapter over `shared/cam/modal-executor.js`), the kinematic state model,
 *   the play/pause/stop/step/reset/setSpeed state machine, and the
 *   localStorage persistence under key `pentacad.sim.state.v0_4`. Emits
 *   events: 'play' · 'pause' · 'stop' · 'step' · 'change' · 'line' ·
 *   'envelope'.
 *
 *   The widget (widgets/pentacad-simulator.js) imports this engine and a
 *   sibling `scene.js` and wires both up to the chrome. Tests run against
 *   this file directly without any DOM or THREE dependency.
 *
 *   Verbatim port of the kinematic state model + interpolator from the
 *   legacy v0.4 standalone (https://cyclecad.com/app/pentacad-sim.html):
 *   - MACHINES map matches lines 1140–1190 of the legacy file
 *   - app state matches lines 1190–1218 (+ headless-only fields removed)
 *   - playbackTick / startInterp / applyMotionTarget verbatim lifted from
 *     the previous Suite widget pentacad-simulator.js (which itself ported
 *     the legacy logic verbatim)
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { executeProgram } from '../cam/modal-executor.js';

// ─── MACHINES catalog ──────────────────────────────────────────────────────
// Keyed by the boardRevision-based id used in the CHANGE MACHINE menu.
// Values are inch-units (Pentamachine G20 default).
//
// Lifted verbatim from legacy pentacad-sim.html lines 1146–1187.
export const MACHINES = Object.freeze({
  'solo': {
    id: 'solo',
    label: 'Solo',
    glb: ['./models/solo.glb', '../machines/solo/solo.glb'],
    envelope: { x: [-2.0, 2.0], y: [-2.0, 2.0], z: [-3.0, 0.0], a: [-90, 90], b: [-360, 360] },
    stock:    { x: 1.5, y: 1.5, z: 0.75 },
    home:     { x: 0, y: 0, z: 0, a: 0, b: 0 },
  },
  'v1': {
    id: 'v1',
    label: 'V1',
    glb: ['./models/v1.glb', '../machines/v1/v1.glb'],
    envelope: { x: [-2.5, 2.5], y: [-2.0, 2.0], z: [-3.5, 0.0], a: [-25, 135], b: [-360, 360] },
    stock:    { x: 1.5, y: 1.5, z: 1.0 },
    home:     { x: 0, y: 0, z: 0, a: 0, b: 0 },
  },
  'v1kickstarter': {
    id: 'v1kickstarter',
    label: 'V1 Kickstarter',
    glb: ['./models/v1kickstarter.glb', '../machines/v1/v1kickstarter.glb'],
    envelope: { x: [-2.5, 2.5], y: [-2.0, 2.0], z: [-3.5, 0.0], a: [-25, 135], b: [-360, 360] },
    stock:    { x: 1.5, y: 1.5, z: 1.0 },
    home:     { x: 0, y: 0, z: 0, a: 0, b: 0 },
  },
  'v2-10': {
    id: 'v2-10',
    label: 'V2-10',
    glb: ['./models/v2-10.glb', '../machines/v2-10/v2-10.glb'],
    envelope: { x: [-2.5, 2.5], y: [-2.5, 2.5], z: [-3.5, 0.0], a: [-25, 135], b: [-360, 360] },
    stock:    { x: 1.75, y: 1.75, z: 1.0 },
    home:     { x: 0, y: 0, z: 0, a: 0, b: 0 },
  },
  'v2-50': {
    id: 'v2-50',
    label: 'V2-50',
    glb: ['./models/v2-50.glb', '../machines/v2-50/v2-50.glb'],
    envelope: { x: [-3.0, 3.0], y: [-2.5, 2.5], z: [-3.5, 0.0], a: [-25, 135], b: [-360, 360] },
    stock:    { x: 2.0, y: 2.0, z: 1.25 },
    home:     { x: 0, y: 0, z: 0, a: 0, b: 0 },
  },
});

export const STORAGE_KEY = 'pentacad.sim.state.v0_4';

/** Default machine — V2-50 is Penta's flagship, matches legacy app default. */
export const DEFAULT_MACHINE_ID = 'v2-50';

/**
 * 30-line warm-up program — exercises every motion kind so the sim has
 * something to play on first mount. Same demo the previous widget shipped.
 */
export const DEMO_NGC = [
  '%',
  'O0001',
  '(cycleCAD demo · 5-axis exercise)',
  '(machine: Pocket NC V2-50)',
  'G21',
  'G90 G94',
  'G43.4 H1',
  'G54',
  'M700 T1 (6 mm flat endmill)',
  'T1 M6',
  'S8000 M3',
  'M7',
  'G0 X-30 Y-40 Z25',
  'G0 X-25 Y-25 Z2',
  'G1 Z-2 F200',
  'G1 X25 Y-25 F800',
  'G2 X25 Y25 I0 J25 F500',
  'G1 X-25 Y25',
  'G3 X-25 Y-25 I0 J-25',
  'G0 Z25',
  'G0 A45 B90',
  'G1 X10 Y10 Z-3 F400',
  'G1 X-10 Y-10',
  'G0 Z25',
  'G0 A0 B0',
  'M9',
  'M5',
  'G53 G0 Z0',
  'G53 G0 X0 Y0',
  'M30',
  '%',
].join('\n');

// ─── NGC parsing ────────────────────────────────────────────────────────────

/**
 * Parse an NGC stream into motion records the simulator can play. Thin
 * adapter over `shared/cam/modal-executor.js::executeProgram()` — translates
 * each ExecEvent into a SimMotion (line + kind + axis target).
 *
 * @param {string} src
 * @returns {Array<Object>}
 */
export function parseNgc(src) {
  const text = String(src || '');
  const { events } = executeProgram(text);
  const lines = text.split('\n');
  /** @type {Array<Object>} */
  const out = [];

  const blockOf = (line) => {
    const idx = Math.max(0, Math.min(lines.length - 1, (line || 1) - 1));
    return (lines[idx] || '').trim();
  };

  for (const ev of events) {
    const line = ev.line || 1;
    const block = blockOf(line);
    switch (ev.kind) {
      case 'rapid':
        out.push({
          line, block, kind: 'G0',
          X: ev.target.X, Y: ev.target.Y, Z: ev.target.Z,
          A: ev.target.A, B: ev.target.B,
        });
        break;
      case 'linear':
        out.push({
          line, block, kind: 'G1',
          X: ev.target.X, Y: ev.target.Y, Z: ev.target.Z,
          A: ev.target.A, B: ev.target.B,
          F: ev.F,
        });
        break;
      case 'arc':
        out.push({
          line, block, kind: ev.dir === 'cw' ? 'G2' : 'G3',
          X: ev.target.X, Y: ev.target.Y, Z: ev.target.Z,
          A: ev.target.A, B: ev.target.B,
          I: ev.centre.X - (out.length > 0 ? (out[out.length - 1].X ?? 0) : 0),
          J: ev.centre.Y - (out.length > 0 ? (out[out.length - 1].Y ?? 0) : 0),
          F: ev.F,
        });
        break;
      case 'tool-change':
        out.push({ line, block, kind: 'TOOL', T: ev.toolNumber });
        break;
      case 'spindle':
        out.push({ line, block, kind: 'SPINDLE', S: ev.mode === 'on' ? ev.rpm : 0 });
        break;
      case 'coolant':
        out.push({
          line, block, kind: 'COOLANT',
          text: ev.mode === 'mist' ? 'M7' : ev.mode === 'flood' ? 'M8' : 'M9',
        });
        break;
      case 'pause':
        out.push({ line, block, kind: 'PAUSE', text: ev.reason || 'M0' });
        break;
      case 'end':
        out.push({ line, block, kind: 'END' });
        break;
      case 'home':
      case 'wcs':
      case 'tcpc':
      case 'plane':
      case 'units':
      case 'distance':
      case 'feedmode':
      case 'dwell':
      case 'unsupported':
        out.push({ line, block, kind: 'NOTE', text: blockOf(line) });
        break;
    }
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

/**
 * Check whether a kinematic state is inside the active machine's envelope.
 * Returns {ok, errors[]}.
 */
export function checkEnvelope(machine, state) {
  const errors = [];
  if (!machine || !machine.envelope) return { ok: true, errors };
  const env = machine.envelope;
  const test = (axis, v) => {
    const span = env[axis.toLowerCase()];
    if (!span) return;
    if (v < span[0] || v > span[1]) {
      errors.push(`${axis}=${v.toFixed(3)} outside [${span[0]}, ${span[1]}]`);
    }
  };
  test('X', state.X); test('Y', state.Y); test('Z', state.Z);
  test('A', state.A); test('B', state.B);
  return { ok: errors.length === 0, errors };
}

// ─── Engine factory ─────────────────────────────────────────────────────────

/**
 * Create a Pentacad simulator engine. DOM-free / THREE-free — pure logic.
 *
 * @param {Object} [opts]
 * @param {string} [opts.machineId]   initial machine id (defaults to v2-50)
 * @param {string} [opts.ngc]         initial NGC source (defaults to DEMO_NGC)
 * @param {boolean} [opts.persist]    enable localStorage persistence (default true)
 * @param {Object} [opts.storage]     localStorage-shaped object for tests
 *                                    (must implement getItem/setItem/removeItem)
 * @returns {Object}
 */
export function createEngine(opts = {}) {
  const persist = opts.persist !== false;
  const storage = opts.storage
    || (typeof globalThis !== 'undefined' && globalThis.localStorage)
    || null;

  /** @type {Record<string, Function[]>} */
  const listeners = {
    play: [], pause: [], stop: [], step: [], change: [], line: [], envelope: [],
  };
  const emit = (ev, p) => {
    const fns = listeners[ev] || [];
    for (const fn of fns) {
      try { fn(p); } catch (_) { /* swallow */ }
    }
  };

  // Resolve initial machine
  let machineId = opts.machineId || DEFAULT_MACHINE_ID;
  if (!MACHINES[machineId]) machineId = DEFAULT_MACHINE_ID;

  /** Live state — kinematic + modal flags. */
  const state = {
    X: 0, Y: 0, Z: 25, A: 0, B: 0,
    F: 0, S: 0, T: 0,
    spindleOn: false,
    coolant: 'off',
    motionIndex: 0,
  };

  /**
   * Single source of truth for live UI state. Mirrors the legacy v0.4 `app`
   * shape (lines 1192–1218 of pentacad-sim.html), pruned of UI-only fields
   * that the widget owns now (cameraParent, cameraProjection, viewcube).
   */
  const app = {
    machineId,
    machine: MACHINES[machineId],
    gcode: '',
    filename: 'sim.ngc',
    moves: [],
    totalTime: 0,
    elapsed: 0,
    playing: false,
    speed: 1,
    showOptions: false,
    bp: { showBetween: true, from: 1, to: 1, autoUpdate: true, isolate: false, timeWindow: false, timeSeconds: 10, showPast: false },
    toolOverrides: {},
    displayUnits: 'inch',
  };

  let motions = parseNgc(opts.ngc != null ? opts.ngc : DEMO_NGC);
  app.moves = motions;
  app.gcode = opts.ngc != null ? String(opts.ngc) : DEMO_NGC;

  let speed = typeof opts.speed === 'number' ? opts.speed : 1;
  app.speed = speed;

  let playing = false;
  /** @type {{ from: Object, to: Object, t: number, durMs: number } | null} */
  let interp = null;

  // ─── localStorage ────────────────────────────────────────────────────────
  function saveState() {
    if (!persist || !storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({
        machineId, speed, motionIndex: state.motionIndex,
      }));
    } catch (_) { /* quota / disabled */ }
  }
  function loadPersisted() {
    if (!persist || !storage) return;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') {
        if (j.machineId && MACHINES[j.machineId]) {
          machineId = j.machineId;
          app.machineId = machineId;
          app.machine = MACHINES[machineId];
        }
        if (typeof j.speed === 'number') {
          speed = Math.max(0.05, Math.min(16, j.speed));
          app.speed = speed;
        }
      }
    } catch (_) { /* corrupt JSON */ }
  }
  loadPersisted();

  // ─── Motion application & interpolation ──────────────────────────────────
  function applyMotionTarget(m) {
    if (m.X != null) state.X = m.X;
    if (m.Y != null) state.Y = m.Y;
    if (m.Z != null) state.Z = m.Z;
    if (m.A != null) state.A = m.A;
    if (m.B != null) state.B = m.B;
    if (m.F != null) state.F = m.F;
    if (m.S != null) state.S = m.S;
    if (m.T != null) state.T = m.T;
    if (m.kind === 'SPINDLE') state.spindleOn = !!m.S;
    if (m.kind === 'COOLANT') {
      state.coolant = (m.text === 'M8' ? 'flood' : m.text === 'M7' ? 'mist' : 'off');
    }
    const env = checkEnvelope(app.machine, state);
    if (!env.ok) emit('envelope', { ok: false, errors: env.errors });
    emit('line', { line: m.line, motion: m, state: { ...state } });
    emit('change', { state: { ...state } });
  }

  function startInterp() {
    const target = motions[state.motionIndex];
    if (!target) { playing = false; app.playing = false; return; }

    if (target.kind === 'TOOL' || target.kind === 'SPINDLE' || target.kind === 'COOLANT' ||
        target.kind === 'NOTE' || target.kind === 'PAUSE' || target.kind === 'END') {
      applyMotionTarget(target);

      // M0 — program pause. Halts on this line; the next ▶ click resumes
      // from the *following* motion. Mirrors Kinetic Control's behaviour
      // and the legacy v0.4 standalone (pentacad-sim.html line 1330).
      if (target.kind === 'PAUSE') {
        playing = false; app.playing = false;
        if (state.motionIndex < motions.length - 1) state.motionIndex++;
        emit('pause', { reason: 'm0', motionIndex: state.motionIndex });
        return;
      }
      // M30 — program end. Pressing ▶ starts from line 1; rewind pointer.
      if (target.kind === 'END') {
        playing = false; app.playing = false;
        state.motionIndex = 0;
        state.X = 0; state.Y = 0; state.Z = 25; state.A = 0; state.B = 0;
        state.F = 0; state.S = 0; state.T = 0;
        state.spindleOn = false; state.coolant = 'off';
        emit('change', { state: { ...state } });
        emit('stop', { reason: 'm30' });
        return;
      }
      if (state.motionIndex < motions.length - 1) {
        state.motionIndex++;
        startInterp();
      }
      return;
    }
    const from = { ...state };
    const dx = (target.X ?? state.X) - state.X;
    const dy = (target.Y ?? state.Y) - state.Y;
    const dz = (target.Z ?? state.Z) - state.Z;
    const da = (target.A ?? state.A) - state.A;
    const db = (target.B ?? state.B) - state.B;
    const linDist = Math.hypot(dx, dy, dz);
    const rotDist = Math.hypot(da, db);
    const baseRate = target.kind === 'G0' ? 120 : 40;
    const linMs = (linDist / baseRate) * 1000;
    const rotMs = (rotDist / 180) * 1000;
    const durMs = Math.max(120, linMs + rotMs);
    interp = { from, to: target, t: 0, durMs };
  }

  /**
   * Render-loop tick — interpolate the current segment by `dtMs`. The
   * widget calls this every requestAnimationFrame frame. Engine knows
   * nothing about the actual loop.
   *
   * @param {number} dtMs
   */
  function tick(dtMs) {
    if (!playing || !interp) return;
    interp.t += (dtMs * speed) / interp.durMs;
    if (interp.t >= 1) {
      applyMotionTarget(interp.to);
      interp = null;
      if (state.motionIndex < motions.length - 1) {
        state.motionIndex++;
        startInterp();
      } else {
        playing = false; app.playing = false;
        emit('stop', { reason: 'end' });
      }
    } else {
      const t = easeInOut(interp.t);
      const a = interp.from, b = interp.to;
      if (b.X != null) state.X = lerp(a.X, b.X, t);
      if (b.Y != null) state.Y = lerp(a.Y, b.Y, t);
      if (b.Z != null) state.Z = lerp(a.Z, b.Z, t);
      if (b.A != null) state.A = lerp(a.A, b.A, t);
      if (b.B != null) state.B = lerp(a.B, b.B, t);
      emit('change', { state: { ...state } });
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  function play() {
    if (motions.length === 0) return;
    if (state.motionIndex >= motions.length - 1) {
      // Rewind for replay
      state.motionIndex = 0;
      state.X = 0; state.Y = 0; state.Z = 25; state.A = 0; state.B = 0;
      state.F = 0; state.S = 0; state.T = 0;
      state.spindleOn = false; state.coolant = 'off';
    }
    if (!interp) startInterp();
    playing = true; app.playing = true;
    emit('play', { motionIndex: state.motionIndex });
    saveState();
  }
  function pause() {
    playing = false; app.playing = false;
    emit('pause', { motionIndex: state.motionIndex });
  }
  function stop() {
    playing = false; app.playing = false;
    interp = null;
    state.motionIndex = 0;
    state.X = 0; state.Y = 0; state.Z = 25; state.A = 0; state.B = 0;
    state.F = 0; state.S = 0; state.T = 0;
    state.spindleOn = false; state.coolant = 'off';
    emit('change', { state: { ...state } });
    emit('stop', { reason: 'manual' });
    saveState();
  }
  function reset() { stop(); }

  function step(n = 1) {
    pause();
    let stepped = 0;
    for (let i = 0; i < n; i++) {
      if (state.motionIndex >= motions.length - 1) break;
      const m = motions[state.motionIndex];
      applyMotionTarget(m);
      state.motionIndex++;
      stepped++;
    }
    emit('step', { count: stepped, motionIndex: state.motionIndex });
  }

  function setSpeed(mult) {
    const next = Number(mult);
    speed = Math.max(0.05, Math.min(16, isFinite(next) ? next : 1));
    app.speed = speed;
    emit('change', { kind: 'speed', speed });
    saveState();
  }

  function setMachine(id) {
    if (!MACHINES[id]) return;
    machineId = id;
    app.machineId = id;
    app.machine = MACHINES[id];
    emit('change', { kind: 'machine', id, machine: app.machine });
    saveState();
  }

  function load(ngc, filename) {
    motions = parseNgc(ngc);
    app.gcode = String(ngc || '');
    app.filename = filename || 'sim.ngc';
    app.moves = motions;
    state.motionIndex = 0;
    interp = null;
    emit('change', { kind: 'load', motions: motions.length, filename: app.filename });
  }

  function seek(motionIndex) {
    const idx = Math.max(0, Math.min(motions.length - 1, motionIndex | 0));
    state.motionIndex = idx;
    interp = null;
    // Re-apply target so DRO snaps to the seek point
    const m = motions[idx];
    if (m) {
      applyMotionTarget(m);
    }
  }

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return () => {
      const arr = listeners[event];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  function getState() { return { ...state, machineId, speed, motionCount: motions.length }; }

  function destroy() {
    for (const k of Object.keys(listeners)) listeners[k].length = 0;
    playing = false; app.playing = false;
    interp = null;
  }

  return {
    state, app,
    get motions() { return motions; },
    load, play, pause, stop, step, reset, seek,
    setSpeed, setMachine,
    tick, on, getState, destroy,
  };
}
