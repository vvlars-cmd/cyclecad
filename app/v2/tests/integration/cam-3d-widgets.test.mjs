/**
 * tests/integration/cam-3d-widgets.test.mjs
 *
 * Integration coverage for the Phase 2 3D CAM widgets:
 *   cam-parallel · cam-radial · cam-scallop · cam-projection · cam-flow
 *
 * Each widget exposes a pure `buildMotions(params)` function that returns
 * a MotionRecord stream the post-processor can consume. The tests run in
 * Node — they import `buildMotions` from each widget directly, drive it
 * through `emitProgram()`, and assert on the resulting NGC + record count.
 *
 * The 7th test verifies all five strategy ids resolve through the
 * cam-widget-base helper (with `flow` falling through to a fallback
 * descriptor since it lives in `deferred[]` in the registry).
 */

import { test, assert, summary } from './_runner.mjs';
import { emitProgram } from '../../widgets/post-processor.js';
import { buildMotions as parallelMotions } from '../../widgets/cam-parallel.js';
import { buildMotions as radialMotions }   from '../../widgets/cam-radial.js';
import { buildMotions as scallopMotions }  from '../../widgets/cam-scallop.js';
import { buildMotions as projectionMotions } from '../../widgets/cam-projection.js';
import { buildMotions as flowMotions }     from '../../widgets/cam-flow.js';
import { getStrategy, fallbackStrategy }   from '../../shared/cam/widget-base.js';

const MACHINE = 'v2-50';

/** @param {string} ngc */
function assertNgcShape(ngc) {
  assert(typeof ngc === 'string', 'ngc is a string');
  assert(ngc.startsWith('%'), 'ngc starts with %');
  assert(ngc.trimEnd().endsWith('%'), 'ngc ends with %');
}

test('cam-parallel emits >=5 motions and post round-trips', () => {
  const motions = parallelMotions({ stepOver: 1.5, angle: 0 });
  assert(motions.length >= 5, `parallel produced ${motions.length} motions`);
  const r = emitProgram(MACHINE, motions);
  assertNgcShape(r.ngc);
  assert(r.lineCount > 10, 'parallel ngc has >10 lines');
});

test('cam-radial emits >=5 motions and post round-trips', () => {
  const motions = radialMotions({ centre: [0, 0, 0], innerRadius: 2, outerRadius: 12, angularStep: 12 });
  assert(motions.length >= 5, `radial produced ${motions.length} motions`);
  const r = emitProgram(MACHINE, motions);
  assertNgcShape(r.ngc);
  assert(r.lineCount > 10, 'radial ngc has >10 lines');
});

test('cam-scallop emits >=5 motions and post round-trips', () => {
  const motions = scallopMotions({ scallopHeight: 0.05 });
  assert(motions.length >= 5, `scallop produced ${motions.length} motions`);
  const r = emitProgram(MACHINE, motions);
  assertNgcShape(r.ngc);
  assert(r.lineCount > 10, 'scallop ngc has >10 lines');
});

test('cam-projection emits >=5 motions and post round-trips', () => {
  const motions = projectionMotions({ pattern: 'spiral', depth: 0.5 });
  assert(motions.length >= 5, `projection produced ${motions.length} motions`);
  const r = emitProgram(MACHINE, motions);
  assertNgcShape(r.ngc);
  assert(r.lineCount > 10, 'projection ngc has >10 lines');
});

test('cam-flow emits >=5 motions and post round-trips', () => {
  const motions = flowMotions({ stepOver: 2.0, feedrate: 600, spindleRpm: 9500 });
  assert(motions.length >= 5, `flow produced ${motions.length} motions`);
  const r = emitProgram(MACHINE, motions);
  assertNgcShape(r.ngc);
  assert(r.lineCount > 10, 'flow ngc has >10 lines');
});

test('post-processor wraps motions with %-bracketed NGC', () => {
  const motions = parallelMotions({ stepOver: 2.0, angle: 30 });
  const r = emitProgram(MACHINE, motions, { sequenceNumbers: true });
  assertNgcShape(r.ngc);
  assert(r.ngc.includes('G21'), 'has metric units');
  assert(r.ngc.includes('G54'), 'has work coord');
  assert(r.ngc.includes('M30'), 'has program end');
});

test('strategy registry resolves all 5 Phase-2 3D strategy ids', () => {
  const ids = ['parallel', 'radial', 'scallop', 'projection', 'flow'];
  for (const id of ids) {
    const desc = getStrategy(id) || fallbackStrategy(id);
    assert(desc, `strategy ${id} resolvable`);
    assert(desc.id === id, `strategy id round-trips for ${id}`);
  }
});

await summary();
