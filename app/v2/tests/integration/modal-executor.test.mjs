/**
 * tests/integration/modal-executor.test.mjs
 *
 * Integration coverage for `shared/cam/modal-executor.js` — the Pentacad
 * G-code interpreter. Each test asserts one feature of modal-state
 * propagation or event emission. The post-processor's demo program is
 * round-tripped at the end to make sure real Penta-Machine-flavoured NGC
 * walks cleanly through the executor without errors.
 */

import { test, assert, assertEq, summary } from './_runner.mjs';
import {
  createState, executeBlock, executeProgram, parseBlock, expandG91, applyWcs,
} from '../../shared/cam/modal-executor.js';
import { emitProgram } from '../../widgets/post-processor.js';

test('empty program emits no events and parks at zero', () => {
  const r = executeProgram('');
  assertEq(r.events.length, 0, 'empty program should emit no events');
  assertEq(r.errors.length, 0, 'empty program should have no errors');
  assertEq(r.finalState.units, 'G21', 'default units = G21 (mm)');
  assertEq(r.finalState.distanceMode, 'G90', 'default distance = G90 absolute');
});

test('G21 + G90 set the right modal flags', () => {
  const r = executeProgram('G21\nG90\nG54');
  assertEq(r.finalState.units, 'G21', 'units modal G21');
  assertEq(r.finalState.distanceMode, 'G90', 'distance modal G90');
  assertEq(r.finalState.wcs, 'G54', 'wcs modal G54');
  // Events recorded.
  const kinds = r.events.map(e => e.kind);
  assert(kinds.includes('units'),    'units event emitted');
  assert(kinds.includes('distance'), 'distance event emitted');
  assert(kinds.includes('wcs'),      'wcs event emitted');
});

test('G54 + G92 offsets compose correctly', () => {
  const r = executeProgram('G21\nG90\nG54\nG0 X10 Y20\nG92 X0 Y0\nG0 X5 Y5');
  // G54 starts at zero, after G0 X10 Y20 the machine is at (10,20).
  // G92 X0 Y0 sets G54 offset = (10,20) so logical (0,0) == machine (10,20).
  // Then G0 X5 Y5 logical → machine (15,25).
  assertEq(r.finalState.wcsOffsets.G54[0], 10, 'G54 X offset');
  assertEq(r.finalState.wcsOffsets.G54[1], 20, 'G54 Y offset');
  const rapids = r.events.filter(e => e.kind === 'rapid');
  const last = rapids[rapids.length - 1];
  assertEq(last.target.X, 15, 'final machine X');
  assertEq(last.target.Y, 25, 'final machine Y');
});

test('G91 distance mode is converted to absolute in events', () => {
  const r = executeProgram('G21\nG90\nG0 X10 Y10\nG91\nG1 X5 Y0 F500\nG1 X3');
  assertEq(r.finalState.distanceMode, 'G91', 'state ended in G91');
  const linears = r.events.filter(e => e.kind === 'linear');
  // First G1 X5 from (10,10) → (15,10); next G1 X3 from (15,10) → (18,10).
  assertEq(linears[0].target.X, 15, 'first incremental X→absolute');
  assertEq(linears[0].target.Y, 10, 'Y inherited');
  assertEq(linears[1].target.X, 18, 'second incremental X→absolute');
});

test('G2/G3 IJ-form arc → arc event with computed centre', () => {
  const r = executeProgram('G21\nG90\nG0 X10 Y0\nG2 X10 Y10 I0 J5 F300');
  const arc = r.events.find(e => e.kind === 'arc');
  assert(arc, 'arc event emitted');
  assertEq(arc.dir, 'cw', 'G2 → cw');
  assertEq(arc.centre.X, 10, 'centre X = startX + I = 10 + 0');
  assertEq(arc.centre.Y, 5,  'centre Y = startY + J = 0  + 5');
  assertEq(arc.target.X, 10, 'target X = 10');
  assertEq(arc.target.Y, 10, 'target Y = 10');
  assertEq(arc.F, 300, 'feedrate carried');
});

test('G43.4 H1 turns TCPC on, G49 turns it off', () => {
  const r = executeProgram('G21\nG43.4 H1\nG0 X1 Y1 Z1\nG49');
  // tcpc events sequenced.
  const tcpc = r.events.filter(e => e.kind === 'tcpc');
  assertEq(tcpc.length, 2, 'two tcpc events');
  assertEq(tcpc[0].enabled, true,  'first enables');
  assertEq(tcpc[0].hOffset, 1,     'H offset captured');
  assertEq(tcpc[1].enabled, false, 'second disables');
  assertEq(r.finalState.tcpcOn, false, 'final state TCPC off');
});

test('M0/M1 emit pause, M30 emits end and stops execution', () => {
  const r = executeProgram('G21\nM0\nG1 X1 F100\nM30\nG1 X2');
  const kinds = r.events.map(e => e.kind);
  assert(kinds.includes('pause'), 'pause emitted for M0');
  assert(kinds.includes('end'),   'end emitted for M30');
  // The G1 X2 after M30 must NOT execute.
  const linears = r.events.filter(e => e.kind === 'linear');
  // Only the X1 motion should be present.
  const xs = linears.map(l => l.target.X);
  assert(!xs.includes(2), 'execution stopped at M30');
});

test('Unknown M-code emits unsupported but program continues', () => {
  const r = executeProgram('G21\nM99\nG1 X5 F500');
  const unsup = r.events.filter(e => e.kind === 'unsupported');
  assertEq(unsup.length, 1, 'one unsupported event');
  assertEq(unsup[0].code, 'M99', 'M99 captured');
  // And the G1 still ran.
  const linears = r.events.filter(e => e.kind === 'linear');
  assertEq(linears.length, 1, 'linear after M99 ran');
  assertEq(linears[0].target.X, 5, 'linear X = 5');
});

test('Soft-limit violation gets recorded in errors[]', () => {
  const r = executeProgram('G21\nG90\nG54\nG1 X9999 F500', { machineId: 'v2-50' });
  assert(r.errors.length > 0, 'soft-limit violation recorded');
  assert(r.errors[0].includes('line 4'), 'error mentions source line');
  assert(r.errors[0].toLowerCase().includes('outside envelope'), 'error mentions envelope');
});

test('Demo program from post-processor round-trips cleanly', () => {
  /** @type {any[]} */
  const motions = [
    { kind: 'comment', text: 'demo' },
    { kind: 'tool-change', toolNumber: 1, description: 'flat' },
    { kind: 'workCoord', code: 'G54' },
    { kind: 'spindle', mode: 'on', rpm: 8000, dir: 'cw' },
    { kind: 'rapid', X: 5, Y: 5, Z: 5 },
    { kind: 'linear', X: 10, Y: 10, Z: -1, F: 300 },
    { kind: 'arc', dir: 'cw', X: 10, Y: 20, I: 0, J: 5, F: 200 },
    { kind: 'spindle', mode: 'off' },
    { kind: 'end' },
  ];
  const { ngc } = emitProgram('v2-50', motions, { sequenceNumbers: true });
  const r = executeProgram(ngc);
  // Should produce at least one rapid + one linear + one arc + one end.
  const k = r.events.map(e => e.kind);
  assert(k.includes('rapid'),  'rapid event');
  assert(k.includes('linear'), 'linear event');
  assert(k.includes('arc'),    'arc event');
  assert(k.includes('end'),    'end event');
  // No unsupported events from the post output.
  const unsup = r.events.filter(e => e.kind === 'unsupported');
  assertEq(unsup.length, 0, 'post output has no unsupported codes');
});

test('F/S/T modal: F800 set then later G1 X10 inherits F800', () => {
  const r = executeProgram('G21\nG90\nF800\nG1 X10\nG1 X20');
  const linears = r.events.filter(e => e.kind === 'linear');
  assertEq(linears.length, 2, 'two linear motions');
  assertEq(linears[0].F, 800, 'first inherits F800');
  assertEq(linears[1].F, 800, 'second still F800');
  assertEq(r.finalState.feedrate, 800, 'state F800');
});

test('Arc plane G18 / G19 switch arc plane', () => {
  let r = executeProgram('G18');
  assertEq(r.finalState.arc.plane, 'G18', 'G18 → ZX plane');
  r = executeProgram('G19');
  assertEq(r.finalState.arc.plane, 'G19', 'G19 → YZ plane');
  // And a G2 in G18 plane uses I/K.
  r = executeProgram('G21\nG90\nG18\nG0 X0 Z0\nG2 X10 Z0 I5 K0 F200');
  const arc = r.events.find(e => e.kind === 'arc');
  assert(arc, 'arc emitted');
  assertEq(arc.plane, 'G18', 'arc carries plane');
  assertEq(arc.centre.X, 5, 'centre X = startX + I in G18');
});

test('N-numbers + parenthesised + ; comments are stripped', () => {
  const r = executeProgram('N5 G21 (set mm)\nN10 G90 ; abs\nN15 G1 X10 F500 (cut)');
  const linears = r.events.filter(e => e.kind === 'linear');
  assertEq(linears.length, 1, 'one linear');
  assertEq(linears[0].target.X, 10, 'X parsed past N + comment');
  assertEq(linears[0].F, 500, 'F parsed');
});

test('5-axis A/B values propagate into events and state', () => {
  const r = executeProgram('G21\nG90\nG0 X10 Y20 Z30 A45 B90');
  const rapid = r.events.find(e => e.kind === 'rapid');
  assert(rapid, 'rapid emitted');
  assertEq(rapid.target.A, 45, 'A propagated');
  assertEq(rapid.target.B, 90, 'B propagated');
  assertEq(r.finalState.machinePos.A, 45, 'state A retained');
  assertEq(r.finalState.machinePos.B, 90, 'state B retained');
});

test('createState / parseBlock / expandG91 / applyWcs unit helpers', () => {
  const s = createState();
  assertEq(s.distanceMode, 'G90', 'default G90');
  const b = parseBlock('N5 G1 X10 Y20 F500 (foo)', 1);
  assert(b, 'block parsed');
  assertEq(b.words.X, 10, 'X word');
  assertEq(b.words.F, 500, 'F word');
  // expandG91 in G91 mode adds to current pos.
  const s91 = { ...s, distanceMode: /** @type {any} */('G91'), pos: { X: 5, Y: 5, Z: 0, A: 0, B: 0 } };
  const t = expandG91(s91, { X: 3 });
  assertEq(t.X, 8, 'incremental X = 5 + 3');
  // applyWcs adds the WCS offset.
  const sWcs = { ...s, wcsOffsets: { ...s.wcsOffsets, G54: [1, 2, 3, 0, 0] } };
  const ap = applyWcs(sWcs, { X: 10, Y: 10, Z: 0, A: 0, B: 0 });
  assertEq(ap.X, 11, 'applyWcs X');
  assertEq(ap.Y, 12, 'applyWcs Y');
  assertEq(ap.Z, 3,  'applyWcs Z');
});

await summary();
