/**
 * @file pentacad-sim.js
 * @description Pentacad 5-axis G-code simulator. Parses G-code, runs forward
 *              kinematics against a loaded machine definition, and animates
 *              the tool + work envelope in the cycleCAD Three.js scene.
 *
 *              Scope for Phase 1:
 *                - G-code parser (modal state, G0/G1/G2/G3, G93, WCS)
 *                - 5-axis forward kinematics (axis angles → tool-tip XYZ)
 *                - Soft-limit detection
 *                - Material-removal simulation (voxel or dexel)
 *                - Collision detection (tool, holder, fixture)
 *
 *              Acceptance test: replay samples/ring-aluminum-v2-50/*.ngc.
 *
 * @version 0.1.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 * @license AGPL-3.0-only
 * @module  pentacad-sim
 */

'use strict';

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.PentacadSim = (() => {
  const VERSION = '0.1.0';

  // ============================================================================
  // G-CODE PARSER (skeleton — Phase 1 fills this out)
  // ============================================================================

  /**
   * Parses a G-code file line-by-line into a sequence of motion commands.
   * Maintains modal state (feed mode, distance mode, active plane, active WCS).
   *
   * @param {string} gcode  full G-code text
   * @returns {Array<Move>} { type, x?, y?, z?, a?, b?, feed?, rapid?, arcCenter? }
   */
  function parse(gcode) {
    const moves = [];
    const modal = {
      distance: 'G90',       // absolute
      plane: 'G17',          // XY
      units: 'G20',          // inch
      feedMode: 'G94',       // per-min
      wcs: 'G54',
      tool: null,
      spindle: 0,
      coolant: 'off',
      lastPos: { x: 0, y: 0, z: 0, a: 0, b: 0 },
    };
    const warnings = [];

    const lines = gcode.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw || raw.startsWith('(') || raw.startsWith(';') || raw === '%') continue;

      // Strip line number (Nxxx)
      const body = raw.replace(/^N\d+\s*/, '');
      // Collect tokens of the form LetterNumber (G1, X1.23, F10, etc.)
      const tokens = body.match(/[A-Z][-+]?\d*\.?\d+/g) || [];
      const t = {};
      for (const tok of tokens) t[tok[0]] = parseFloat(tok.slice(1));

      // Modal commands
      if (t.G === 20 || t.G === 21) modal.units = `G${t.G}`;
      if (t.G === 17 || t.G === 18 || t.G === 19) modal.plane = `G${t.G}`;
      if (t.G === 90 || t.G === 91) modal.distance = `G${t.G}`;
      if (t.G === 93 || t.G === 94) modal.feedMode = `G${t.G}`;
      if (t.G >= 54 && t.G <= 59.3) modal.wcs = `G${t.G}`;

      // Motion commands
      if ([0, 1, 2, 3].includes(t.G)) {
        const move = {
          line: i + 1,
          type: t.G === 0 ? 'rapid' : (t.G === 1 ? 'linear' : 'arc'),
          dir: t.G === 2 ? 'cw' : (t.G === 3 ? 'ccw' : undefined),
          from: { ...modal.lastPos },
        };
        ['X', 'Y', 'Z', 'A', 'B'].forEach(a => {
          if (t[a] !== undefined) move[a.toLowerCase()] = t[a];
        });
        if (t.F) move.feed = t.F;
        if (t.I !== undefined || t.J !== undefined || t.K !== undefined) {
          move.arcCenter = { i: t.I ?? 0, j: t.J ?? 0, k: t.K ?? 0 };
        }
        moves.push(move);

        // Update modal position
        if (move.x !== undefined) modal.lastPos.x = move.x;
        if (move.y !== undefined) modal.lastPos.y = move.y;
        if (move.z !== undefined) modal.lastPos.z = move.z;
        if (move.a !== undefined) modal.lastPos.a = move.a;
        if (move.b !== undefined) modal.lastPos.b = move.b;
      }

      // Tool / spindle
      if (t.T !== undefined) modal.tool = t.T;
      if (t.S !== undefined) modal.spindle = t.S;
      if (t.M === 7) modal.coolant = 'mist';
      if (t.M === 8) modal.coolant = 'flood';
      if (t.M === 9) modal.coolant = 'off';
    }

    return { moves, modal, warnings };
  }

  // ============================================================================
  // KINEMATICS — forward 5-axis for Pentamachine A/B table geometry
  // ============================================================================

  /**
   * Given axis values (X, Y, Z in linear, A tilt, B rotary), compute the
   * tool-tip position in world space using the loaded machine kinematics.
   *
   * @param {object} axes — { x, y, z, a, b } (a, b in degrees)
   * @param {object} kinematics — from machines/<id>/kinematics.json
   * @returns {{x,y,z}} tool-tip in world coordinates
   */
  function forwardKin(axes, kinematics) {
    if (!kinematics) return { x: axes.x, y: axes.y, z: axes.z };

    // Pentamachine V2 is an A/B table machine:
    //   - A rotates about X (tilts the work)
    //   - B rotates about Z (spins the work)
    //   - Spindle is fixed
    //
    // Full transform sequence (right to left):
    //   tool-tip = T_xyz * R_a(A-axis) * T_a_to_table * R_b(B-axis) * T_b_to_a * workpiece
    //
    // For Phase 1 we'll implement this cleanly with THREE.Matrix4.
    // For scaffold, return identity so UI renders without crashing.

    console.warn('[pentacad-sim] forwardKin is a Phase 1 stub');
    return { x: axes.x ?? 0, y: axes.y ?? 0, z: axes.z ?? 0 };
  }

  function isWithinLimits(axes, kinematics) {
    if (!kinematics?.linear || !kinematics?.rotary) return { ok: true, warnings: ['no kinematics'] };
    const warnings = [];
    for (const [axis, range] of Object.entries(kinematics.linear)) {
      const v = axes[axis];
      if (v !== undefined && (v < range.min || v > range.max)) {
        warnings.push(`${axis.toUpperCase()}=${v} outside [${range.min}, ${range.max}] ${range.unit}`);
      }
    }
    for (const [axis, range] of Object.entries(kinematics.rotary)) {
      const v = axes[axis];
      if (v !== undefined && (v < range.min || v > range.max)) {
        warnings.push(`${axis.toUpperCase()}=${v} outside [${range.min}, ${range.max}] ${range.unit}`);
      }
    }
    return { ok: warnings.length === 0, warnings };
  }

  // ============================================================================
  // REPLAY (Phase 1 — will animate in Three.js scene)
  // ============================================================================

  async function replay(gcode, onProgress) {
    const parsed = parse(gcode);
    let cumulative = 0;
    for (let i = 0; i < parsed.moves.length; i++) {
      if (typeof onProgress === 'function') {
        onProgress({
          index: i,
          total: parsed.moves.length,
          move: parsed.moves[i],
          cumulative: cumulative += 1,
        });
      }
    }
    return {
      moveCount: parsed.moves.length,
      warnings: parsed.warnings,
      modal: parsed.modal,
    };
  }

  // ============================================================================
  // INIT
  // ============================================================================

  let ctx = null;

  function init(context) {
    ctx = context;
    console.log(`[pentacad-sim] v${VERSION} initialized — G-code parser ready`);
  }

  function execute(request) {
    const { method, params } = request || {};
    if (method === 'sim.parse')    return parse(params.gcode);
    if (method === 'sim.replay')   return replay(params.gcode, params.onProgress);
    if (method === 'sim.kin')      return forwardKin(params.axes, ctx?.state?.machine?.kinematics);
    if (method === 'sim.limits')   return isWithinLimits(params.axes, ctx?.state?.machine?.kinematics);
    return { error: 'unknown_sim_method', method };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    version: VERSION,
    init,
    execute,
    parse,
    forwardKin,
    isWithinLimits,
    replay,
  };
})();
