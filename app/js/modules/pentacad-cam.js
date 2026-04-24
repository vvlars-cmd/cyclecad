/**
 * @file pentacad-cam.js
 * @description Pentacad CAM sub-module — 3+2 machining strategies + post-processor.
 *              Part of the cycleCAD Suite / Pentacad extension.
 *
 *              Scope for Phase 2:
 *                - 12 strategies: 2D contour, adaptive, pocket, drill, parallel,
 *                  radial, scallop, projection, flow, bore/thread, chamfer, face
 *                - 3+2 setup manager: tilt plane selection, WCS, stock, fixture
 *                - Toolpath generation
 *                - Post-processor emitting Pentamachine .ngc dialect
 *                - Tool library integration
 *
 * @version 0.1.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 * @license AGPL-3.0-only
 * @module  pentacad-cam
 */

'use strict';

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.PentacadCAM = (() => {
  const VERSION = '0.1.0';

  // ============================================================================
  // STRATEGIES
  // ============================================================================

  const STRATEGIES = [
    { id: '2d-contour',      name: '2D Contour',       kind: '2d' },
    { id: 'adaptive-clear',  name: 'Adaptive Clear',   kind: '2d' },
    { id: 'pocket',          name: 'Pocket',           kind: '2d' },
    { id: 'drill',           name: 'Drill',            kind: 'drill' },
    { id: 'parallel',        name: 'Parallel',         kind: '3d' },
    { id: 'radial',          name: 'Radial',           kind: '3d' },
    { id: 'scallop',         name: 'Scallop',          kind: '3d' },
    { id: 'projection',      name: 'Projection',       kind: '3d' },
    { id: 'flow',            name: 'Flow',             kind: '3d' },
    { id: 'bore-thread',     name: 'Bore / Thread',    kind: 'drill' },
    { id: 'chamfer-deburr',  name: 'Chamfer / Deburr', kind: '2d' },
    { id: 'face',            name: 'Face',             kind: '2d' },
  ];

  // ============================================================================
  // POST-PROCESSOR (Pentamachine V2 dialect — reverse-engineered from samples)
  // ============================================================================

  /**
   * Emits G-code in the Pentamachine V2 dialect.
   *
   * Confirmed features from sample .ngc files:
   *   - G20 (inch) units default; G21 (metric) supported via post config
   *   - G17 (XY workplane)
   *   - G90 (absolute), G91.1 (incremental IJK)
   *   - G40 (no cutter comp)
   *   - G94 (feed per minute) / G93 (inverse time, used during 5-axis moves)
   *   - 5-axis: X, Y, Z, A (tilt), B (rotary)
   *   - Tool change: Tn M6 (preceded by M5, followed by M3 S<rpm>)
   *   - Coolant: M7 (mist), M8 (flood), M9 (off)
   *   - WCS: G54 default
   *
   * @param {Array<Toolpath>} toolpaths
   * @param {object} machine — loaded machine definition
   * @returns {string} G-code text
   */
  function emitGCode(toolpaths, machine) {
    const lines = [];
    const meta = {
      program: machine?.post?.programNumber ?? '1000',
      units: machine?.post?.units ?? 'inch',
    };

    // Program header
    lines.push('%');
    lines.push('(AXIS,stop)');
    lines.push(`(${meta.program})`);
    lines.push('(PENTACAD GENERATED — Pentamachine V2 dialect)');

    let n = 10;
    const emit = (code) => { lines.push(`N${n} ${code}`); n += 5; };

    // Modal setup
    emit(meta.units === 'metric' ? 'G21' : 'G20');
    emit('G90 G94 G40 G17 G91.1');
    emit('G53 G0 Z0.');

    // Emit each toolpath
    for (const tp of toolpaths) {
      lines.push(`(${tp.name ?? tp.strategy ?? 'OP'})`);
      emit('M9');
      emit('G49');
      emit('M5');
      if (tp.tool) {
        emit(`T${tp.tool.number} M6`);
        emit(`S${tp.tool.rpm} M3`);
      }
      emit('G54 G0');
      // Moves — stub until Phase 2 implements real toolpaths
      for (const m of tp.moves ?? []) {
        if (m.type === 'rapid')  emit(`G0 ${axisStr(m)}`);
        if (m.type === 'linear') emit(`G1 ${axisStr(m)} F${m.feed ?? 10}`);
        if (m.type === 'arc')    emit(`${m.dir === 'cw' ? 'G2' : 'G3'} ${axisStr(m)} I${m.i} J${m.j} F${m.feed ?? 10}`);
      }
    }

    // Program footer
    emit('M9');
    emit('G49');
    emit('M5');
    emit('G53 G0 Z0.');
    emit('M30');
    lines.push('%');
    return lines.join('\n');
  }

  function axisStr(m) {
    const parts = [];
    ['X', 'Y', 'Z', 'A', 'B'].forEach(a => {
      if (m[a.toLowerCase()] !== undefined) parts.push(`${a}${m[a.toLowerCase()].toFixed(4)}`);
    });
    return parts.join(' ');
  }

  // ============================================================================
  // TOOLPATH GENERATION (stubs — real implementation in Phase 2)
  // ============================================================================

  function generateToolpath(operation, setup, machine) {
    const strategy = STRATEGIES.find(s => s.id === operation.strategyId);
    if (!strategy) throw new Error(`Unknown strategy: ${operation.strategyId}`);
    return {
      strategy: strategy.id,
      name: `${strategy.name} — ${setup.name}`,
      tool: operation.tool,
      moves: [],               // TODO Phase 2: real toolpath
      warnings: [`${strategy.id} toolpath generation is a Phase 2 deliverable`],
    };
  }

  // ============================================================================
  // INIT
  // ============================================================================

  let ctx = null;

  function init(context) {
    ctx = context;
    console.log(`[pentacad-cam] v${VERSION} initialized — ${STRATEGIES.length} strategies registered`);
  }

  function execute(request) {
    const { method, params } = request || {};
    if (method === 'cam.listStrategies') return STRATEGIES;
    if (method === 'cam.generate') {
      const toolpaths = (ctx?.state?.operations ?? []).map(op => {
        const setup = ctx.state.setups.find(s => s.id === op.setupId);
        return generateToolpath(op, setup, ctx.state.machine);
      });
      ctx.state.toolpaths = toolpaths;
      return toolpaths;
    }
    if (method === 'cam.post') {
      const gcode = emitGCode(ctx.state.toolpaths, ctx.state.machine);
      ctx.state.gcode = gcode;
      return gcode;
    }
    return { error: 'unknown_cam_method', method };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    version: VERSION,
    init,
    execute,
    STRATEGIES,
    generateToolpath,
    emitGCode,
  };
})();
