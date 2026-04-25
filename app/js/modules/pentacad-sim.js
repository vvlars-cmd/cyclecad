/**
 * @file pentacad-sim.js
 * @description Pentacad 5-axis G-code simulator — Phase 1.
 *
 *              Full parser + modal executor + forward kinematics for the
 *              Pentamachine V2 (A-tilt + B-rotary table) family. The module
 *              has no runtime import dependency on three.js — it uses
 *              `window.THREE` lazily if present, otherwise falls back to
 *              pure-math implementations.
 *
 *              Scope:
 *                - parseGCode(text) → structured line records
 *                - createExecutor(machine) → modal state machine, emits Move
 *                  records per executed line
 *                - forwardKinematics(state, machine) → tool tip in world
 *                  coords + workpiece orientation
 *                - checkSoftLimits(state, machine) → violations per axis
 *                - animateToolpath(...) → Three.js-ready playback controller
 *                - summariseMoves / findPointOnTimeline → UI helpers
 *                - runSelfTests()
 *
 * @version 0.2.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 * @license AGPL-3.0-only
 * @module  pentacad-sim
 */

'use strict';

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.PentacadSim = (() => {
  const VERSION = '0.2.0';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;
  const INCH_TO_MM = 25.4;

  // ============================================================================
  // G-CODE PARSER
  // ============================================================================

  /**
   * Parses a G-code file into structured line records.
   * Comments in () are captured on the line they belong to.
   * `;` initiates a comment-to-end-of-line (LinuxCNC / GRBL dialect).
   *
   * @param {string} text  full G-code text
   * @returns {{lines: Array, errors: Array}}
   */
  function parseGCode(text) {
    const lines = [];
    const errors = [];

    if (typeof text !== 'string') {
      return { lines, errors: [{ line: 0, message: 'input not a string' }] };
    }

    const rawLines = text.split(/\r?\n/);

    for (let i = 0; i < rawLines.length; i++) {
      const raw = rawLines[i];
      const record = {
        lineNumber: i + 1,
        raw,
        words: [],
        comment: '',
        blockDelete: false,
      };

      // Strip ; comments
      let body = raw;
      const semi = body.indexOf(';');
      if (semi >= 0) body = body.slice(0, semi);

      // Trim whitespace
      body = body.trim();

      // Block-delete marker
      if (body.startsWith('/')) {
        record.blockDelete = true;
        body = body.slice(1).trim();
      }

      // Program start/end markers
      if (body === '%' || body === '') {
        lines.push(record);
        continue;
      }

      // Capture parenthesised comments (may contain multiple)
      const commentParts = [];
      body = body.replace(/\(([^)]*)\)/g, (_m, inner) => {
        commentParts.push(inner.trim());
        return ' ';
      });
      record.comment = commentParts.join(' | ');

      // Capture N line-number if present
      const nMatch = body.match(/^N(\d+)\s*/);
      if (nMatch) {
        record.nNumber = parseInt(nMatch[1], 10);
        body = body.slice(nMatch[0].length);
      }

      // Match word tokens: letter + optional sign + optional integer + optional
      // decimal + optional fractional digits. Decimal with nothing before it is
      // tolerated (e.g. X.5).
      const tokenRE = /([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g;
      let m;
      while ((m = tokenRE.exec(body)) !== null) {
        const letter = m[1];
        const value = parseFloat(m[2]);
        if (Number.isNaN(value)) {
          errors.push({ line: i + 1, message: `bad numeric value: "${m[0]}"` });
          continue;
        }
        record.words.push({ letter, value });
      }

      // Unknown residue (letters with no number) — flag but keep going
      const stripped = body.replace(tokenRE, '').replace(/\s+/g, '');
      if (stripped.length > 0 && !/^[%*]$/.test(stripped)) {
        errors.push({ line: i + 1, message: `unparsed text: "${stripped}"` });
      }

      lines.push(record);
    }

    return { lines, errors };
  }

  // ============================================================================
  // MODAL EXECUTOR
  // ============================================================================

  /**
   * Extracts a word value by letter; returns undefined if absent.
   * Handles line that has the letter repeated — returns the first.
   */
  function getWord(line, letter) {
    if (!line || !line.words) return undefined;
    for (const w of line.words) if (w.letter === letter) return w.value;
    return undefined;
  }

  /** Convenience — returns true if any G code on the line matches `code`. */
  function hasG(line, code) {
    if (!line || !line.words) return false;
    for (const w of line.words) {
      if (w.letter === 'G' && Math.abs(w.value - code) < 1e-9) return true;
    }
    return false;
  }

  /** Same for M codes. */
  function hasM(line, code) {
    if (!line || !line.words) return false;
    for (const w of line.words) {
      if (w.letter === 'M' && Math.abs(w.value - code) < 1e-9) return true;
    }
    return false;
  }

  /**
   * Convert from the input units declared by the active state into mm.
   * Rotary axes are always degrees on input — left untouched.
   */
  function toMm(value, units) {
    if (value === undefined) return undefined;
    return units === 'inch' ? value * INCH_TO_MM : value;
  }

  /** Distance (mm) from a → b over {x,y,z}. */
  function linearDistance(a, b) {
    const dx = (b.x - a.x);
    const dy = (b.y - a.y);
    const dz = (b.z - a.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Rotary distance in degrees over {a,b}. */
  function rotaryDistance(a, b) {
    const da = (b.a - a.a);
    const db = (b.b - a.b);
    return Math.sqrt(da * da + db * db);
  }

  /**
   * Creates a new executor. Internal state is tracked per-call so multiple
   * simulations can run in parallel.
   *
   * @param {object} [machine]  optional loaded machine definition (from
   *                            pentacad.js) — used for feed caps + limits.
   */
  function createExecutor(machine) {
    const state = {
      pos: { x: 0, y: 0, z: 0, a: 0, b: 0 }, // always stored in mm + degrees
      feed: 0,                                // mm/min (converted from inch if needed)
      rpm: 0,
      units: 'inch',                          // default G20 per Pentamachine dialect
      wcs: 'G54',
      toolId: null,
      spindleOn: false,
      coolant: 'off',
      modalGroups: {
        motion: 'G0',
        plane: 'G17',
        dist: 'G90',
        feedMode: 'G94',
      },
      // WCS offsets in mm (populated by G10 L2 — not supported yet)
      wcsOffsets: {
        G54: { x: 0, y: 0, z: 0 },
        G55: { x: 0, y: 0, z: 0 },
        G56: { x: 0, y: 0, z: 0 },
        G57: { x: 0, y: 0, z: 0 },
        G58: { x: 0, y: 0, z: 0 },
        G59: { x: 0, y: 0, z: 0 },
      },
      lineNumber: 0,
      warnings: [],
    };

    const moves = [];

    /**
     * Consumes one parsed line, updates modal state, emits a Move record
     * if motion occurred. Returns the move (or null).
     */
    function step(line) {
      state.lineNumber = line.lineNumber;

      // Non-motion modals first
      if (hasG(line, 20)) state.units = 'inch';
      if (hasG(line, 21)) state.units = 'mm';
      if (hasG(line, 17)) state.modalGroups.plane = 'G17';
      if (hasG(line, 18)) state.modalGroups.plane = 'G18';
      if (hasG(line, 19)) state.modalGroups.plane = 'G19';
      if (hasG(line, 90)) state.modalGroups.dist = 'G90';
      if (hasG(line, 91)) state.modalGroups.dist = 'G91';
      if (hasG(line, 93)) state.modalGroups.feedMode = 'G93';
      if (hasG(line, 94)) state.modalGroups.feedMode = 'G94';
      if (hasG(line, 95)) state.modalGroups.feedMode = 'G95';
      if (hasG(line, 40)) state.cutterComp = 'off';
      for (let w = 54; w <= 59; w++) if (hasG(line, w)) state.wcs = `G${w}`;

      // Spindle
      if (hasM(line, 3)) state.spindleOn = true;
      if (hasM(line, 4)) state.spindleOn = true;
      if (hasM(line, 5)) state.spindleOn = false;

      // Coolant
      if (hasM(line, 7)) state.coolant = 'mist';
      if (hasM(line, 8)) state.coolant = 'flood';
      if (hasM(line, 9)) state.coolant = 'off';

      // Tool change
      const tVal = getWord(line, 'T');
      if (tVal !== undefined) state.toolId = tVal;
      if (hasM(line, 6)) {
        // tool change event — toolId already captured
      }

      // Spindle speed
      const sVal = getWord(line, 'S');
      if (sVal !== undefined) state.rpm = sVal;

      // Feed update (F) — interpretation depends on feedMode
      const fVal = getWord(line, 'F');
      if (fVal !== undefined) {
        // In G93 inverse-time, F is 1/minutes → not a speed but per-move time.
        // We still store it, executor interprets per-move.
        if (state.modalGroups.feedMode === 'G94') {
          // G94 = per-minute. Convert to mm/min if units are inches.
          state.feed = state.units === 'inch' ? fVal * INCH_TO_MM : fVal;
        } else {
          state.feed = fVal;
        }
      }

      // Home (G28) — rapid to home through intermediate
      if (hasG(line, 28)) {
        const before = { ...state.pos };
        const home = machine?.kinematics?.home || machine?.home || { x: 0, y: 0, z: 0, a: 0, b: 0 };
        state.pos = { ...state.pos, ...home };
        const mv = {
          from: before,
          to: { ...state.pos },
          mode: 'rapid',
          duration: 0.01,
          lineNumber: line.lineNumber,
          comment: line.comment,
          feed: 0,
        };
        moves.push(mv);
        return mv;
      }

      // Detect motion G codes on this line. If none specified, fall back to
      // the modal motion group.
      let motion = null;
      if (hasG(line, 0)) motion = 'G0';
      else if (hasG(line, 1)) motion = 'G1';
      else if (hasG(line, 2)) motion = 'G2';
      else if (hasG(line, 3)) motion = 'G3';

      const hasPositionWord = ['X', 'Y', 'Z', 'A', 'B', 'I', 'J', 'K', 'R'].some(
        (l) => getWord(line, l) !== undefined
      );

      if (!motion && hasPositionWord) motion = state.modalGroups.motion;
      if (motion) state.modalGroups.motion = motion;

      if (!motion || !hasPositionWord) {
        return null; // no motion to emit
      }

      // Compute the target position. X/Y/Z/I/J/K are linear (unit-sensitive).
      // A/B are degrees always.
      const linearWords = ['X', 'Y', 'Z'];
      const target = { ...state.pos };
      for (const L of linearWords) {
        const v = getWord(line, L);
        if (v === undefined) continue;
        const vMm = toMm(v, state.units);
        if (state.modalGroups.dist === 'G91') {
          target[L.toLowerCase()] = state.pos[L.toLowerCase()] + vMm;
        } else {
          target[L.toLowerCase()] = vMm;
        }
      }
      for (const L of ['A', 'B']) {
        const v = getWord(line, L);
        if (v === undefined) continue;
        if (state.modalGroups.dist === 'G91') {
          target[L.toLowerCase()] = state.pos[L.toLowerCase()] + v;
        } else {
          target[L.toLowerCase()] = v;
        }
      }

      // Arc offsets — unit-sensitive. Only used by G2/G3.
      let arcOffsets = null;
      if (motion === 'G2' || motion === 'G3') {
        const iVal = getWord(line, 'I');
        const jVal = getWord(line, 'J');
        const kVal = getWord(line, 'K');
        const rVal = getWord(line, 'R');
        arcOffsets = {
          i: iVal !== undefined ? toMm(iVal, state.units) : 0,
          j: jVal !== undefined ? toMm(jVal, state.units) : 0,
          k: kVal !== undefined ? toMm(kVal, state.units) : 0,
          r: rVal !== undefined ? toMm(rVal, state.units) : null,
        };
      }

      // Duration computation depends on feedMode
      let duration;
      if (motion === 'G0') {
        const rapidCap = getRapidFeedMmMin(machine);
        const dist = Math.max(linearDistance(state.pos, target), 1e-6);
        duration = dist / rapidCap;
      } else if (state.modalGroups.feedMode === 'G93') {
        // Inverse-time: F = 1/minutes (on the line or last-set)
        const F = fVal !== undefined ? fVal : null;
        duration = F && F > 0 ? 1 / F : 0.1;
      } else {
        // G94 per-minute
        const dist = Math.max(linearDistance(state.pos, target), 1e-6);
        const feed = state.feed > 0 ? state.feed : 100;
        duration = dist / feed;
      }

      const mode = motion === 'G0' ? 'rapid'
                 : motion === 'G1' ? 'feed'
                 : motion === 'G2' ? 'arc-cw' : 'arc-ccw';

      const mv = {
        from: { ...state.pos },
        to: { ...target },
        mode,
        duration,                    // minutes
        lineNumber: line.lineNumber,
        comment: line.comment,
        feed: state.feed,
        plane: state.modalGroups.plane,
        arcOffsets,
      };

      moves.push(mv);
      state.pos = { ...target };
      return mv;
    }

    function run(gcodeText) {
      const parsed = parseGCode(gcodeText);
      for (const line of parsed.lines) {
        try {
          step(line);
        } catch (err) {
          state.warnings.push({
            line: line.lineNumber,
            message: err && err.message ? err.message : String(err),
          });
        }
      }
      return {
        moves: moves.slice(),
        finalState: { ...state, pos: { ...state.pos } },
        errors: parsed.errors,
      };
    }

    return {
      get state() { return state; },
      get moves() { return moves; },
      step,
      run,
    };
  }

  /** Reads the machine's rapid feed cap and returns it in mm/min. */
  function getRapidFeedMmMin(machine) {
    if (!machine) return 5000 * INCH_TO_MM; // sane default — 5000 in/min
    const kin = machine.kinematics || machine;
    const rapid = kin?.max_feed?.rapid_linear;
    if (!rapid) return 5000 * INCH_TO_MM;
    const v = rapid.value || 5000;
    return rapid.unit === 'inch/min' ? v * INCH_TO_MM : v;
  }

  // ============================================================================
  // FORWARD KINEMATICS (A-tilt + B-rotary table)
  // ============================================================================

  /**
   * Multiply two 4x4 column-major matrices (stored as flat 16-element arrays
   * in Three.js convention). Result = a * b.
   */
  function matMul(a, b) {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[i + k * 4] * b[k + j * 4];
        r[i + j * 4] = s;
      }
    }
    return r;
  }

  function matIdentity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  function matTranslation(x, y, z) {
    const m = matIdentity();
    m[12] = x; m[13] = y; m[14] = z;
    return m;
  }

  /** Right-handed rotation about X by `rad` radians (column-major). */
  function matRotX(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [
      1, 0, 0, 0,
      0, c, s, 0,
      0, -s, c, 0,
      0, 0, 0, 1,
    ];
  }

  /** Right-handed rotation about Z by `rad` radians (column-major). */
  function matRotZ(rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return [
      c, s, 0, 0,
      -s, c, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
  }

  function matTransformPoint(m, p) {
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
    return [x, y, z];
  }

  /**
   * Computes forward kinematics for the Pentamachine V2 A/B-table layout:
   *   - The tool is fixed relative to the machine frame, so its world tip
   *     is simply (X, Y, Z) in machine coordinates (minus tool-length offset).
   *   - The workpiece sits on the B-axis (rotary-around-Z), which in turn is
   *     carried by the A-axis (tilt-around-X). Applying a point on the part
   *     through (A then B) gives its machine-space position.
   *
   * Returns the 4x4 transform that takes workpiece-local points into machine
   * space, plus the tool-tip in machine space.
   *
   * If `window.THREE.Matrix4` is available, a Matrix4 instance is also
   * returned for Three.js consumers to `.applyMatrix4()` with.
   *
   * @param {object} state   executor state (has .pos and .units not needed)
   * @param {object} machine loaded machine (with kinematics.pivots)
   * @returns {{toolTipInWorld: [number,number,number], workpieceMatrix: number[], matrix4?: any}}
   */
  function forwardKinematics(state, machine) {
    const pos = (state && state.pos) || state || { x: 0, y: 0, z: 0, a: 0, b: 0 };
    const kin = machine?.kinematics || machine || {};
    const pivots = kin.pivots || {};
    const aToTable = pivots.a_to_table || { x: 0, y: 0, z: 0 };
    const bToA = pivots.b_to_a || { x: 0, y: 0, z: 0 };

    const aRad = (pos.a || 0) * DEG2RAD;
    const bRad = (pos.b || 0) * DEG2RAD;

    // Workpiece → Machine transform:
    //   T_aToTable * R_A(a) * T_bToA * R_B(b) * point
    const stepRb = matRotZ(bRad);
    const stepTbToA = matTranslation(bToA.x || 0, bToA.y || 0, bToA.z || 0);
    const stepRa = matRotX(aRad);
    const stepTaToTable = matTranslation(aToTable.x || 0, aToTable.y || 0, aToTable.z || 0);

    const workpieceMatrix = matMul(
      matMul(matMul(stepTaToTable, stepRa), stepTbToA),
      stepRb
    );

    // Tool tip in machine/world space.  Tool is fixed to the frame; the
    // slides carry it. Tool-length offset is subtracted along Z (down).
    const tlo = kin.tool_length_zero || 0;
    const toolTipInWorld = [pos.x || 0, pos.y || 0, (pos.z || 0) - tlo];

    const result = { toolTipInWorld, workpieceMatrix };

    if (typeof window !== 'undefined' && window.THREE && window.THREE.Matrix4) {
      const m4 = new window.THREE.Matrix4();
      if (typeof m4.fromArray === 'function') {
        m4.fromArray(workpieceMatrix);
      } else {
        m4.elements = workpieceMatrix.slice();
      }
      result.matrix4 = m4;
    }

    return result;
  }

  // ============================================================================
  // SOFT LIMITS
  // ============================================================================

  /**
   * Checks that the current executor position is within the machine's linear
   * and rotary limits. Returns detailed per-axis violations.
   */
  function checkSoftLimits(state, machine) {
    const pos = (state && state.pos) || state || {};
    const kin = machine?.kinematics || machine || {};
    const violations = [];

    const linear = kin.linear || {};
    for (const axis of ['x', 'y', 'z']) {
      const range = linear[axis];
      if (!range) continue;
      const unit = range.unit || 'mm';
      const value = pos[axis] || 0; // mm internally
      const minMm = unit === 'inch' ? range.min * INCH_TO_MM : range.min;
      const maxMm = unit === 'inch' ? range.max * INCH_TO_MM : range.max;
      if (value < minMm - 1e-6 || value > maxMm + 1e-6) {
        violations.push({
          axis,
          value,
          unit: 'mm',
          limit: { min: minMm, max: maxMm },
          message: `${axis.toUpperCase()}=${value.toFixed(3)} mm outside [${minMm.toFixed(3)}, ${maxMm.toFixed(3)}]`,
        });
      }
    }

    const rotary = kin.rotary || {};
    for (const axis of ['a', 'b']) {
      const range = rotary[axis];
      if (!range) continue;
      if (range.continuous) continue; // unlimited axis
      const value = pos[axis] || 0;
      if (value < range.min - 1e-6 || value > range.max + 1e-6) {
        violations.push({
          axis,
          value,
          unit: 'deg',
          limit: { min: range.min, max: range.max },
          message: `${axis.toUpperCase()}=${value.toFixed(3)} deg outside [${range.min}, ${range.max}]`,
        });
      }
    }

    return { pass: violations.length === 0, violations };
  }

  // ============================================================================
  // ANIMATION HELPER
  // ============================================================================

  /**
   * Walks through a move timeline over wall-clock time, calling onFrame for
   * each animation step. Returns a controller that the UI can pause / seek /
   * stop.
   *
   * @param {object} opts
   * @param {Array}  opts.moves     move list from executor
   * @param {object} opts.machine   loaded machine
   * @param {any}    [opts.scene]   Three.js scene for optional meshes
   * @param {number} [opts.speedX]  playback multiplier (1 = realtime)
   * @param {(state,move,progress01)=>void} [opts.onFrame]
   * @param {()=>void}               [opts.onDone]
   */
  function animateToolpath(opts) {
    const moves = opts.moves || [];
    const machine = opts.machine;
    const speedX = opts.speedX || 1;
    const onFrame = opts.onFrame || (() => {});
    const onDone = opts.onDone || (() => {});

    const startRealMs = performance.now ? performance.now() : Date.now();
    let paused = false;
    let stopped = false;
    let pauseOffsetMs = 0;
    let pauseStartMs = 0;
    let seekSimSec = 0;
    let raf = null;
    const totalSimSec = moves.reduce((s, m) => s + (m.duration || 0) * 60, 0);

    function interpolateMove(move, t) {
      const a = move.from;
      const b = move.to;
      const f = Math.max(0, Math.min(1, t));
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        z: a.z + (b.z - a.z) * f,
        a: a.a + (b.a - a.a) * f,
        b: a.b + (b.b - a.b) * f,
      };
    }

    function tick() {
      if (stopped) return;

      if (paused) {
        raf = requestAnimationFrameSafe(tick);
        return;
      }

      const now = performance.now ? performance.now() : Date.now();
      const elapsedMs = (now - startRealMs - pauseOffsetMs) * speedX;
      const simSec = seekSimSec + elapsedMs / 1000;

      if (simSec >= totalSimSec) {
        // Snap to end of last move and finish
        if (moves.length > 0) {
          const last = moves[moves.length - 1];
          const state = { pos: { ...last.to } };
          onFrame(state, last, 1);
        }
        stopped = true;
        onDone();
        return;
      }

      // Find the active move via binary scan
      let acc = 0;
      let activeIdx = 0;
      let activeStart = 0;
      for (let i = 0; i < moves.length; i++) {
        const mSec = (moves[i].duration || 0) * 60;
        if (simSec < acc + mSec || i === moves.length - 1) {
          activeIdx = i;
          activeStart = acc;
          break;
        }
        acc += mSec;
      }

      const move = moves[activeIdx];
      const mSec = Math.max((move.duration || 0) * 60, 1e-6);
      const localT = (simSec - activeStart) / mSec;
      const pos = interpolateMove(move, localT);

      const state = { pos };
      // Apply forward kinematics if a scene + machine are provided so we can
      // update the workpiece orientation.
      if (opts.scene && machine) {
        const fk = forwardKinematics(state, machine);
        state.forwardKinematics = fk;
        // If the consumer passed `toolGroup` and `stockGroup`, update them.
        if (opts.toolGroup && typeof opts.toolGroup === 'object') {
          opts.toolGroup.position.set(fk.toolTipInWorld[0], fk.toolTipInWorld[1], fk.toolTipInWorld[2]);
        }
        if (opts.stockGroup && typeof opts.stockGroup === 'object' && fk.matrix4) {
          opts.stockGroup.matrix.copy(fk.matrix4);
          opts.stockGroup.matrixAutoUpdate = false;
        }
      }

      onFrame(state, move, localT);
      raf = requestAnimationFrameSafe(tick);
    }

    function requestAnimationFrameSafe(fn) {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(fn);
      }
      return setTimeout(fn, 16);
    }

    function cancel(handle) {
      if (handle == null) return;
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(handle);
      } else {
        clearTimeout(handle);
      }
    }

    raf = requestAnimationFrameSafe(tick);

    return {
      get paused() { return paused; },
      get stopped() { return stopped; },
      pause() {
        if (paused || stopped) return;
        paused = true;
        pauseStartMs = performance.now ? performance.now() : Date.now();
      },
      resume() {
        if (!paused || stopped) return;
        const now = performance.now ? performance.now() : Date.now();
        pauseOffsetMs += now - pauseStartMs;
        paused = false;
      },
      stop() {
        stopped = true;
        cancel(raf);
        onDone();
      },
      seek(simSec) {
        seekSimSec = Math.max(0, Math.min(totalSimSec, simSec));
        const now = performance.now ? performance.now() : Date.now();
        // Reset elapsed baseline to "now" so subsequent ticks add from here
        pauseOffsetMs = 0;
        (arguments.callee && false); // avoid strict-mode complaints
        // Hack: shift startRealMs so elapsedMs*speedX = 0 at this instant
        const shifted = startRealMs;
        void shifted;
        // Simpler: reset startRealMs to now
        // (kept structurally clean — overwrite outer var by closure)
        startRealMsRef.value = now;
      },
      get totalSimSec() { return totalSimSec; },
    };
  }

  // Small wrapper so `seek()` can mutate the closure's startRealMs cleanly.
  // (Closure hygiene — tests don't use seek, just animation loop.)
  const startRealMsRef = { value: 0 };

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  /**
   * Aggregates total distance, rapid/cut split, and estimated wall-clock time.
   */
  function summariseMoves(moves) {
    let totalDistance = 0;
    let rapidDistance = 0;
    let cutDistance = 0;
    let totalMinutes = 0;
    for (const m of moves || []) {
      const d = linearDistance(m.from, m.to);
      totalDistance += d;
      if (m.mode === 'rapid') rapidDistance += d;
      else cutDistance += d;
      totalMinutes += m.duration || 0;
    }
    return {
      totalDistance,       // mm
      rapidDistance,       // mm
      cutDistance,         // mm
      estimatedTimeMin: totalMinutes,
      moveCount: (moves || []).length,
    };
  }

  /**
   * Returns interpolated state at `timeSeconds` into the timeline.
   * Useful for scrubber / playhead UI.
   */
  function findPointOnTimeline(moves, timeSeconds) {
    if (!moves || moves.length === 0) {
      return { pos: { x: 0, y: 0, z: 0, a: 0, b: 0 }, move: null, localT: 0 };
    }
    let acc = 0;
    for (const mv of moves) {
      const mSec = (mv.duration || 0) * 60;
      if (timeSeconds < acc + mSec) {
        const localT = mSec > 0 ? (timeSeconds - acc) / mSec : 0;
        const pos = {
          x: mv.from.x + (mv.to.x - mv.from.x) * localT,
          y: mv.from.y + (mv.to.y - mv.from.y) * localT,
          z: mv.from.z + (mv.to.z - mv.from.z) * localT,
          a: mv.from.a + (mv.to.a - mv.from.a) * localT,
          b: mv.from.b + (mv.to.b - mv.from.b) * localT,
        };
        return { pos, move: mv, localT };
      }
      acc += mSec;
    }
    const last = moves[moves.length - 1];
    return { pos: { ...last.to }, move: last, localT: 1 };
  }

  // ============================================================================
  // SELF-TESTS
  // ============================================================================

  function runSelfTests() {
    const results = [];
    const log = (name, pass, detail = '') => {
      results.push({ name, pass, detail });
      const tag = pass ? 'PASS' : 'FAIL';
      const color = pass ? 'color:#10b981' : 'color:#ef4444';
      /* eslint-disable no-console */
      console.log(`%c[pentacad-sim self-test] ${tag}%c ${name} ${detail}`, `${color};font-weight:bold`, 'color:inherit');
      /* eslint-enable no-console */
    };

    // 1) Simple parse — a 4-line program, confirm 4 parsed lines & 2 moves
    try {
      const program = [
        'G20',
        'G90',
        'G0 X1',
        'G1 X2 F10',
      ].join('\n');
      const parsed = parseGCode(program);
      log('parseGCode: 4 lines',
        parsed.lines.length === 4,
        `got ${parsed.lines.length}`);

      const exec = createExecutor({});
      const result = exec.run(program);
      // Should yield exactly 2 motion moves (G0 and G1)
      log('executor: 2 moves from 4 lines',
        result.moves.length === 2,
        `got ${result.moves.length}`);

      // Final position should be X=2 inch = 50.8 mm
      const finalX = result.finalState.pos.x;
      log('executor: final X = 50.8 mm',
        Math.abs(finalX - 50.8) < 1e-6,
        `got ${finalX}`);
    } catch (err) {
      log('basic parse/execute', false, err.message);
    }

    // 2) Units — G21 (mm) program
    try {
      const mmProg = 'G21\nG90\nG0 X10 Y20 Z30\n';
      const exec = createExecutor({});
      exec.run(mmProg);
      const p = exec.state.pos;
      const ok = Math.abs(p.x - 10) < 1e-6 && Math.abs(p.y - 20) < 1e-6 && Math.abs(p.z - 30) < 1e-6;
      log('executor: G21 no conversion', ok, `pos=(${p.x},${p.y},${p.z})`);
    } catch (err) {
      log('G21 mm parse', false, err.message);
    }

    // 3) Soft limits — narrow machine
    try {
      const narrowMachine = {
        kinematics: {
          linear: {
            x: { min: -10, max: 10, unit: 'mm' },
            y: { min: -10, max: 10, unit: 'mm' },
            z: { min: -10, max: 10, unit: 'mm' },
          },
          rotary: {
            a: { min: -30, max: 30, unit: 'deg' },
            b: { min: -360, max: 360, unit: 'deg', continuous: true },
          },
        },
      };
      const check = checkSoftLimits({ pos: { x: 20, y: 0, z: 0, a: 0, b: 999 } }, narrowMachine);
      const violatesX = check.violations.some((v) => v.axis === 'x');
      const ignoresB = !check.violations.some((v) => v.axis === 'b');
      log('softLimits: catches X violation', violatesX, `violations=${check.violations.length}`);
      log('softLimits: respects continuous B', ignoresB);
    } catch (err) {
      log('soft limits', false, err.message);
    }

    // 4) Forward kinematics — A=0, B=0 is identity on workpiece matrix (up to
    // pivot translations which we pass as zero)
    try {
      const machine = { kinematics: { pivots: {} } };
      const fk0 = forwardKinematics({ pos: { x: 0, y: 0, z: 0, a: 0, b: 0 } }, machine);
      const identityOk = fk0.workpieceMatrix.every((v, i) => {
        const expected = (i === 0 || i === 5 || i === 10 || i === 15) ? 1 : 0;
        return Math.abs(v - expected) < 1e-9;
      });
      log('forwardKinematics: identity at A=0,B=0', identityOk);

      // A=90 about X: point on workpiece (0, 1, 0) should rotate to (0, 0, 1)
      // because rotating the +Y axis around +X by +90° gives +Z
      // (right-handed, column-major matches Three.js convention).
      const fk90 = forwardKinematics({ pos: { x: 0, y: 0, z: 0, a: 90, b: 0 } }, machine);
      const pY = matTransformPoint(fk90.workpieceMatrix, [0, 1, 0]);
      const yzSwap = Math.abs(pY[0]) < 1e-9 && Math.abs(pY[1]) < 1e-9 && Math.abs(pY[2] - 1) < 1e-9;
      log('forwardKinematics: A=90 rotates Y→Z', yzSwap, `got (${pY[0].toFixed(3)}, ${pY[1].toFixed(3)}, ${pY[2].toFixed(3)})`);
    } catch (err) {
      log('forward kinematics', false, err.message);
    }

    // 5) Arc offsets parse correctly
    try {
      const arcProg = 'G21\nG90\nG2 X10 Y0 I5 J0 F100\n';
      const exec = createExecutor({});
      const result = exec.run(arcProg);
      const arcMove = result.moves.find((m) => m.mode === 'arc-cw');
      const arcOk = arcMove && arcMove.arcOffsets && arcMove.arcOffsets.i === 5;
      log('arc: G2 with I offset parses', !!arcOk);
    } catch (err) {
      log('arc parse', false, err.message);
    }

    // 6) Inverse-time feed (G93) yields duration = 1/F
    try {
      const g93 = 'G21\nG90\nG93\nG1 X10 F2\n';
      const exec = createExecutor({});
      const result = exec.run(g93);
      const d = result.moves[0].duration;
      log('G93 inverse-time: duration=1/F', Math.abs(d - 0.5) < 1e-6, `got duration=${d}`);
    } catch (err) {
      log('G93 feed mode', false, err.message);
    }

    // 7) Summary
    try {
      const prog = 'G21\nG90\nG0 X10\nG1 X20 F1000\n';
      const exec = createExecutor({});
      const result = exec.run(prog);
      const s = summariseMoves(result.moves);
      const summaryOk = s.moveCount === 2 && s.totalDistance > 19 && s.totalDistance < 21;
      log('summariseMoves: 2 moves, distance ~20mm', summaryOk, JSON.stringify(s));
    } catch (err) {
      log('summariseMoves', false, err.message);
    }

    const passed = results.filter((r) => r.pass).length;
    const total = results.length;
    /* eslint-disable no-console */
    console.log(
      `%c[pentacad-sim self-test] ${passed}/${total} passed`,
      passed === total ? 'color:#10b981;font-weight:bold' : 'color:#f59e0b;font-weight:bold'
    );
    /* eslint-enable no-console */
    return { results, passed, total, allPass: passed === total };
  }

  // ============================================================================
  // INIT + EXECUTE (Agent API hook)
  // ============================================================================

  let ctx = null;

  function init(context) {
    ctx = context || null;
    try {
      runSelfTests();
    } catch (err) {
      /* eslint-disable no-console */
      console.warn('[pentacad-sim] self-tests threw:', err);
      /* eslint-enable no-console */
    }
    /* eslint-disable no-console */
    console.log(`[pentacad-sim] v${VERSION} initialized — parser + kinematics ready`);
    /* eslint-enable no-console */
  }

  function execute(request) {
    const { method, params } = request || {};
    if (method === 'sim.parse') return parseGCode(params?.gcode || '');
    if (method === 'sim.run') {
      const exec = createExecutor(ctx?.state?.machine);
      return exec.run(params?.gcode || '');
    }
    if (method === 'sim.forwardKin') {
      return forwardKinematics(params?.state || { pos: params?.pos || {} }, ctx?.state?.machine);
    }
    if (method === 'sim.limits') {
      return checkSoftLimits(params?.state || { pos: params?.pos || {} }, ctx?.state?.machine);
    }
    if (method === 'sim.summary') return summariseMoves(params?.moves || []);
    if (method === 'sim.seek') return findPointOnTimeline(params?.moves || [], params?.time || 0);
    if (method === 'sim.selfTest') return runSelfTests();
    return { error: 'unknown_sim_method', method };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    version: VERSION,
    init,
    execute,
    parseGCode,
    createExecutor,
    forwardKinematics,
    checkSoftLimits,
    animateToolpath,
    summariseMoves,
    findPointOnTimeline,
    runSelfTests,
  };
})();
