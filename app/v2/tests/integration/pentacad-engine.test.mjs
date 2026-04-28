/**
 * tests/integration/pentacad-engine.test.mjs
 *
 * Integration coverage for `shared/pentacad/engine.js` — the DOM-free,
 * THREE-free playback engine that the widget at
 * `widgets/pentacad-simulator.js` wraps. Confirms the engine factory
 * shape, the parseNgc adapter on top of modal-executor, the play /
 * pause / stop / step / setSpeed / setMachine state transitions, M0 +
 * M30 semantics, the tick() interpolator, the line event, and clean
 * destroy() teardown.
 */

import { test, assert, assertEq, summary } from './_runner.mjs';
import {
  createEngine, parseNgc, MACHINES, STORAGE_KEY, DEFAULT_MACHINE_ID,
} from '../../shared/pentacad/engine.js';

// ─── In-memory storage shim (persistence tests don't need a real DOM) ─────
function makeStorage() {
  const data = new Map();
  return {
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
    _data: data,
  };
}

// ─────────────────────────────────────────────────────────────────────────

test('createEngine returns the right shape', () => {
  const eng = createEngine({ persist: false });
  assert(eng && typeof eng === 'object', 'engine returned');
  for (const k of ['load', 'play', 'pause', 'stop', 'step', 'reset', 'seek',
                   'setSpeed', 'setMachine', 'tick', 'on', 'getState', 'destroy']) {
    assertEq(typeof eng[k], 'function', `${k} is a function`);
  }
  assert(eng.state && typeof eng.state === 'object', 'state present');
  assert(eng.app && typeof eng.app === 'object', 'app present');
  assert(Array.isArray(eng.motions), 'motions is array');
  assertEq(eng.app.machineId, DEFAULT_MACHINE_ID, 'default machine is v2-50');
  eng.destroy();
});

test('load(ngc) parses correctly via modal-executor', () => {
  const eng = createEngine({ persist: false, ngc: '' });
  assertEq(eng.motions.length, 0, 'empty ngc → no motions');
  eng.load('G21\nG0 X10 Y20\nG1 Z-2 F100\nM30\n', 'demo.ngc');
  assert(eng.motions.length >= 3, `got ${eng.motions.length} motions`);
  assertEq(eng.app.filename, 'demo.ngc', 'filename stored');
  // The engine's parseNgc export and the load path must agree.
  const direct = parseNgc('G21\nG0 X10 Y20\nG1 Z-2 F100\nM30\n');
  assertEq(direct.length, eng.motions.length, 'parseNgc and load agree');
  eng.destroy();
});

test('play / pause / stop transitions update state', () => {
  const eng = createEngine({ persist: false, ngc: 'G21\nG0 X1 Y1\nG1 Z-1 F100\nM30\n' });
  const seen = [];
  eng.on('play', () => seen.push('play'));
  eng.on('pause', () => seen.push('pause'));
  eng.on('stop', () => seen.push('stop'));

  eng.play();
  assertEq(eng.app.playing, true, 'playing after play()');
  assert(seen.includes('play'), 'play event emitted');

  eng.pause();
  assertEq(eng.app.playing, false, 'not playing after pause()');
  assert(seen.includes('pause'), 'pause event emitted');

  eng.stop();
  assertEq(eng.app.playing, false, 'still not playing after stop()');
  assertEq(eng.state.motionIndex, 0, 'motionIndex reset on stop');
  assert(seen.includes('stop'), 'stop event emitted');
  eng.destroy();
});

test('step(n) advances motionIndex', () => {
  const eng = createEngine({ persist: false, ngc: 'G21\nG0 X1\nG0 X2\nG0 X3\nG0 X4\nM30\n' });
  const before = eng.state.motionIndex;
  eng.step(2);
  assert(eng.state.motionIndex >= before + 1, `index advanced from ${before} to ${eng.state.motionIndex}`);
  // step never goes past last motion
  eng.step(999);
  assert(eng.state.motionIndex <= eng.motions.length - 1, 'step clamped to motions.length-1');
  eng.destroy();
});

test('setSpeed clamps 0.05 ≤ mult ≤ 16', () => {
  const eng = createEngine({ persist: false });
  eng.setSpeed(0.0001);
  assertEq(eng.app.speed, 0.05, 'low clamp');
  eng.setSpeed(99999);
  assertEq(eng.app.speed, 16, 'high clamp');
  eng.setSpeed(2.5);
  assertEq(eng.app.speed, 2.5, 'in-range pass-through');
  eng.setSpeed('abc'); // NaN → defaults to 1
  assertEq(eng.app.speed, 1, 'NaN falls back to 1');
  eng.destroy();
});

test('setMachine updates the machine ref and emits change', () => {
  const eng = createEngine({ persist: false });
  let evt = null;
  eng.on('change', (p) => { if (p && p.kind === 'machine') evt = p; });
  eng.setMachine('v2-10');
  assertEq(eng.app.machineId, 'v2-10', 'machineId updated');
  assertEq(eng.app.machine, MACHINES['v2-10'], 'machine ref points at catalog entry');
  assert(evt && evt.id === 'v2-10', 'change event fired with new id');
  // Unknown id is a no-op
  eng.setMachine('not-a-real-machine');
  assertEq(eng.app.machineId, 'v2-10', 'unknown id ignored');
  eng.destroy();
});

test("on('line', fn) fires on motion advance via step()", () => {
  const eng = createEngine({ persist: false, ngc: 'G21\nG0 X5 Y5\nG1 Z-2 F100\nM30\n' });
  const lines = [];
  eng.on('line', (p) => lines.push(p.line));
  eng.step(1);
  assert(lines.length >= 1, `got ${lines.length} line events`);
  assert(typeof lines[0] === 'number' && lines[0] > 0, 'line is a positive integer');
  eng.destroy();
});

test('M0 pauses + advances; M30 rewinds', () => {
  // Build a program with both an M0 and an M30. parseNgc emits PAUSE for M0
  // and END for M30. step() through them and make sure the engine pauses
  // (M0) then rewinds (M30) and emits the right events.
  const ngc = 'G21\nG0 X1\nM0\nG0 X2\nM30\n';
  const eng = createEngine({ persist: false, ngc });
  const pauseReasons = [];
  const stopReasons = [];
  eng.on('pause', (p) => pauseReasons.push(p && p.reason));
  eng.on('stop', (p) => stopReasons.push(p && p.reason));

  // Drive engine forward via play() + tick() so the PAUSE branch in
  // startInterp() actually fires.
  eng.play();
  for (let i = 0; i < 200 && eng.app.playing; i++) eng.tick(50);
  assert(pauseReasons.includes('m0'), 'M0 pause emitted');

  // Resume to play through M30
  eng.play();
  for (let i = 0; i < 200 && eng.app.playing; i++) eng.tick(50);
  assert(stopReasons.includes('m30'), 'M30 end emitted');
  // After M30 the index should have been rewound to 0
  assertEq(eng.state.motionIndex, 0, 'M30 rewinds motionIndex to 0');
  eng.destroy();
});

test('tick(dtMs) interpolates linearly between motions', () => {
  // A simple two-rapid program — kick off play, tick a little, watch X
  // advance toward the target without overshooting.
  const eng = createEngine({ persist: false, ngc: 'G21\nG0 X10 Y0 Z25\nG0 X20 Y0 Z25\n' });
  eng.play();
  // After a single small tick we should have either applied the first
  // target (X=10) or be partway there.
  eng.tick(10);
  const x1 = eng.state.X;
  assert(x1 >= 0 && x1 <= 20, `X=${x1} should be in [0, 20]`);
  // After enough ticks, motionIndex should advance.
  for (let i = 0; i < 200; i++) eng.tick(50);
  assert(eng.state.motionIndex >= 1, 'motionIndex advanced');
  eng.destroy();
});

test('destroy() cleans up listeners', () => {
  const eng = createEngine({ persist: false });
  let calls = 0;
  eng.on('play', () => calls++);
  eng.play();
  assertEq(calls, 1, 'play listener fired once');
  eng.destroy();
  // After destroy(), further play() must not invoke listeners.
  eng.play();
  assertEq(calls, 1, 'no further calls after destroy');
});

test('localStorage round-trips machineId + speed under STORAGE_KEY', () => {
  const storage = makeStorage();
  const eng = createEngine({ persist: true, storage });
  eng.setMachine('v2-10');
  eng.setSpeed(2);
  assert(storage._data.has(STORAGE_KEY), 'key written');
  const raw = storage.getItem(STORAGE_KEY);
  const j = JSON.parse(raw);
  assertEq(j.machineId, 'v2-10', 'persisted machineId');
  assertEq(j.speed, 2, 'persisted speed');
  // New engine reads the persisted values back.
  const eng2 = createEngine({ persist: true, storage });
  assertEq(eng2.app.machineId, 'v2-10', 'restored machineId');
  assertEq(eng2.app.speed, 2, 'restored speed');
  eng.destroy();
  eng2.destroy();
});

await summary();
