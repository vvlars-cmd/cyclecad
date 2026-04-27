/**
 * @file shared/cam/modal-executor.js
 * @description Pentacad CAM modal-state executor — a Kinetic-Control-flavoured
 *   G-code interpreter that walks an NGC source program block-by-block,
 *   carrying forward modal state (G90 / G91 distance, G94 / G95 feed mode,
 *   G20 / G21 units, G54..G59 work-coord systems, G43.4 H# TCPC, G17/G18/G19
 *   plane select, F/S/T modal, A/B rotary). It emits a flat event stream
 *   that downstream consumers — the simulator, the post-processor, the
 *   collision checker — replay without having to redo modal bookkeeping.
 *
 *   Pure JS, no I/O, no DOM. Pure ESM module.
 *
 *   References:
 *     - LinuxCNC G-code reference (arc semantics, modal grouping):
 *       https://linuxcnc.org/docs/html/gcode/g-code.html
 *     - Penta Machine Kinetic Control wiki:
 *       https://pentamachine.atlassian.net/wiki/spaces/KCUR
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { checkEnvelope } from '../machines/index.js';

/**
 * @typedef {{ X:number, Y:number, Z:number, A:number, B:number }} Pos5
 *
 * @typedef {Object} ModalState
 * @property {Pos5} pos              Current logical position in active WCS frame.
 * @property {Pos5} machinePos       Current absolute machine position (post-WCS).
 * @property {'G90'|'G91'} distanceMode
 * @property {'G94'|'G95'} feedMode
 * @property {'G20'|'G21'} units
 * @property {'G54'|'G55'|'G56'|'G57'|'G58'|'G59'} wcs
 * @property {Object<string,[number,number,number,number,number]>} wcsOffsets
 * @property {boolean} tcpcOn
 * @property {{ number:number, lengthOffset_mm:number }} tool
 * @property {{ rpm:number, dir:'cw'|'ccw'|'off' }} spindle
 * @property {'mist'|'flood'|'off'} coolant
 * @property {number} feedrate
 * @property {boolean} programEnded
 * @property {boolean} paused
 * @property {{ centre:'IJ'|'IJK', plane:'G17'|'G18'|'G19' }} arc
 *
 * @typedef {{ kind: 'rapid',        line:number, target:Pos5 }
 *         | { kind: 'linear',       line:number, target:Pos5, F:number }
 *         | { kind: 'arc',          line:number, dir:'cw'|'ccw', target:Pos5, centre:Pos5, plane:'G17'|'G18'|'G19', F:number }
 *         | { kind: 'tool-change',  line:number, toolNumber:number }
 *         | { kind: 'spindle',      line:number, mode:'on'|'off', rpm:number, dir:'cw'|'ccw' }
 *         | { kind: 'coolant',      line:number, mode:'mist'|'flood'|'off' }
 *         | { kind: 'wcs',          line:number, code:string }
 *         | { kind: 'home',         line:number }
 *         | { kind: 'pause',        line:number, reason:string }
 *         | { kind: 'end',          line:number }
 *         | { kind: 'tcpc',         line:number, enabled:boolean, hOffset?:number }
 *         | { kind: 'plane',        line:number, plane:'G17'|'G18'|'G19' }
 *         | { kind: 'units',        line:number, units:'G20'|'G21' }
 *         | { kind: 'distance',     line:number, mode:'G90'|'G91' }
 *         | { kind: 'feedmode',     line:number, mode:'G94'|'G95' }
 *         | { kind: 'dwell',        line:number, seconds:number }
 *         | { kind: 'unsupported',  line:number, code:string, raw:string }
 *         } ExecEvent
 *
 * @typedef {{ words: Object<string,number>, codes: string[], raw:string, line:number, comment:string }} Block
 */

/**
 * Empty 5-axis position helper.
 * @returns {Pos5}
 */
function zero5() { return { X: 0, Y: 0, Z: 0, A: 0, B: 0 }; }

/**
 * Default WCS offsets (G54..G59, all zero).
 * @returns {Object<string,[number,number,number,number,number]>}
 */
function defaultWcsOffsets() {
  /** @type {Object<string,[number,number,number,number,number]>} */
  const o = {};
  for (const c of ['G54', 'G55', 'G56', 'G57', 'G58', 'G59']) {
    o[c] = [0, 0, 0, 0, 0];
  }
  return o;
}

/**
 * Build a fresh modal state. Callers can mutate this — every executeBlock
 * returns a new state so referential integrity is up to the caller.
 *
 * @returns {ModalState}
 */
export function createState() {
  return {
    pos: zero5(),
    machinePos: zero5(),
    distanceMode: 'G90',
    feedMode: 'G94',
    units: 'G21',
    wcs: 'G54',
    wcsOffsets: defaultWcsOffsets(),
    tcpcOn: false,
    tool: { number: 0, lengthOffset_mm: 0 },
    spindle: { rpm: 0, dir: 'off' },
    coolant: 'off',
    feedrate: 0,
    programEnded: false,
    paused: false,
    arc: { centre: 'IJ', plane: 'G17' },
  };
}

/**
 * Tokenise one NGC block into words + codes. Strips N-numbers, parenthesised
 * comments, and ;-comments. Liberal — unknown tokens are kept under `codes`.
 *
 * @param {string} src
 * @param {number} lineNo
 * @returns {Block | null} null when the block is empty after stripping.
 */
export function parseBlock(src, lineNo = 1) {
  let raw = String(src || '').trim();
  if (!raw) return null;
  // Percent markers
  if (raw === '%') return { words: {}, codes: ['%'], raw: '%', line: lineNo, comment: '' };
  // Capture parenthesised comment (first one)
  let comment = '';
  const cm = raw.match(/\(([^)]*)\)/);
  if (cm) comment = cm[1];
  raw = raw.replace(/\([^)]*\)/g, ' ');
  // Strip ; comment
  const sc = raw.indexOf(';');
  if (sc >= 0) {
    if (!comment) comment = raw.slice(sc + 1).trim();
    raw = raw.slice(0, sc);
  }
  raw = raw.trim();
  if (!raw) {
    return comment ? { words: {}, codes: [], raw: '', line: lineNo, comment } : null;
  }
  // Strip leading N number
  raw = raw.replace(/^N\d+\s*/i, '');
  if (!raw) return comment ? { words: {}, codes: [], raw: '', line: lineNo, comment } : null;
  // Standalone O number
  if (/^O\d+$/i.test(raw)) {
    return { words: {}, codes: [raw.toUpperCase()], raw, line: lineNo, comment };
  }
  /** @type {Object<string,number>} */
  const words = {};
  /** @type {string[]} */
  const codes = [];
  // Token splitter — tolerate decimals like "G43.4"
  const tokens = raw.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const m = tok.match(/^([A-Za-z])(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const letter = m[1].toUpperCase();
      const value = Number(m[2]);
      if (letter === 'G' || letter === 'M') {
        // Codes get pushed in original normalised form (G0, G43.4, M30…)
        const norm = `${letter}${m[2].replace(/^(-?\d+)$/, '$1')}`;
        codes.push(norm);
      } else {
        words[letter] = value;
      }
    } else {
      // Token like "M30" (already covered above). Keep liberal — uppercase.
      codes.push(tok.toUpperCase());
    }
  }
  return { words, codes, raw, line: lineNo, comment };
}

/**
 * Resolve an axis target under the active distance mode. In G91 each axis
 * is added to the current logical pos; in G90 each axis is taken as given,
 * with un-supplied axes inheriting the current pos.
 *
 * @param {ModalState} state
 * @param {Partial<Pos5>} target
 * @returns {Pos5}
 */
export function expandG91(state, target) {
  const out = { ...state.pos };
  /** @type {Array<keyof Pos5>} */
  const axes = ['X', 'Y', 'Z', 'A', 'B'];
  for (const ax of axes) {
    const v = target[ax];
    if (v == null) continue;
    out[ax] = state.distanceMode === 'G91' ? state.pos[ax] + v : v;
  }
  return out;
}

/**
 * Apply the active WCS offset to a logical pos, returning the absolute
 * machine pos. Inverse mapping is symmetric.
 *
 * @param {ModalState} state
 * @param {Pos5} pos
 * @returns {Pos5}
 */
export function applyWcs(state, pos) {
  const off = state.wcsOffsets[state.wcs] || [0, 0, 0, 0, 0];
  return {
    X: pos.X + off[0],
    Y: pos.Y + off[1],
    Z: pos.Z + off[2],
    A: pos.A + off[3],
    B: pos.B + off[4],
  };
}

/**
 * Envelope check for the current state's machine pos.
 *
 * @param {string} machineId
 * @param {ModalState} state
 * @returns {{ ok:boolean, axisErrs: string[] }}
 */
export function isInEnvelope(machineId, state) {
  const u = state.units === 'G20' ? 'in' : 'mm';
  const r = checkEnvelope(machineId, { ...state.machinePos, units: u });
  return { ok: r.ok, axisErrs: r.errors };
}

/**
 * Shallow-clone a modal state.
 * @param {ModalState} s
 * @returns {ModalState}
 */
function cloneState(s) {
  return {
    ...s,
    pos: { ...s.pos },
    machinePos: { ...s.machinePos },
    wcsOffsets: { ...s.wcsOffsets },
    tool: { ...s.tool },
    spindle: { ...s.spindle },
    arc: { ...s.arc },
  };
}

/**
 * Execute one parsed block against the supplied modal state. Returns a new
 * state plus the events the block emitted. The state is never mutated in
 * place — modal-executor is value-typed.
 *
 * @param {ModalState} stateIn
 * @param {Block | string} block  Raw NGC text or a pre-parsed block.
 * @returns {{ events: ExecEvent[], state: ModalState }}
 */
export function executeBlock(stateIn, block) {
  const state = cloneState(stateIn);
  /** @type {ExecEvent[]} */
  const events = [];
  const b = typeof block === 'string' ? parseBlock(block, 1) : block;
  if (!b) return { events, state };

  const lineNo = b.line || 1;

  // 1. Pure code passes — modal G/M groups.
  // Process in canonical order: units, distance, feedmode, plane, wcs, tcpc.
  for (const code of b.codes) {
    const c = code.toUpperCase();
    switch (c) {
      case 'G20': state.units = 'G20'; events.push({ kind: 'units',    line: lineNo, units: 'G20' }); break;
      case 'G21': state.units = 'G21'; events.push({ kind: 'units',    line: lineNo, units: 'G21' }); break;
      case 'G90': state.distanceMode = 'G90'; events.push({ kind: 'distance', line: lineNo, mode: 'G90' }); break;
      case 'G91': state.distanceMode = 'G91'; events.push({ kind: 'distance', line: lineNo, mode: 'G91' }); break;
      case 'G94': state.feedMode = 'G94'; events.push({ kind: 'feedmode', line: lineNo, mode: 'G94' }); break;
      case 'G95': state.feedMode = 'G95'; events.push({ kind: 'feedmode', line: lineNo, mode: 'G95' }); break;
      case 'G17': state.arc.plane = 'G17'; events.push({ kind: 'plane', line: lineNo, plane: 'G17' }); break;
      case 'G18': state.arc.plane = 'G18'; events.push({ kind: 'plane', line: lineNo, plane: 'G18' }); break;
      case 'G19': state.arc.plane = 'G19'; events.push({ kind: 'plane', line: lineNo, plane: 'G19' }); break;
      case 'G54': case 'G55': case 'G56': case 'G57': case 'G58': case 'G59':
        state.wcs = /** @type {ModalState['wcs']} */ (c);
        events.push({ kind: 'wcs', line: lineNo, code: c });
        break;
      case 'G43.4': {
        state.tcpcOn = true;
        const h = b.words.H;
        events.push({ kind: 'tcpc', line: lineNo, enabled: true, hOffset: h });
        break;
      }
      case 'G49':
        state.tcpcOn = false;
        events.push({ kind: 'tcpc', line: lineNo, enabled: false });
        break;
      case 'G92': {
        // Set offsets so machinePos == words.X/Y/Z/A/B (override active WCS)
        const cur = state.machinePos;
        const newOff = [...(state.wcsOffsets[state.wcs] || [0, 0, 0, 0, 0])];
        /** @type {Array<[keyof Pos5, number]>} */
        const idx = [['X', 0], ['Y', 1], ['Z', 2], ['A', 3], ['B', 4]];
        for (const [ax, i] of idx) {
          const v = b.words[ax];
          if (v != null) {
            newOff[i] = cur[ax] - v;
            state.pos[ax] = v;
          }
        }
        state.wcsOffsets[state.wcs] = /** @type {[number,number,number,number,number]} */ (newOff);
        break;
      }
      case 'G53':
        // One-shot machine-coord move — handled below in motion section by
        // bypassing WCS for this block.
        break;
      case 'G4': case 'G04': {
        const sec = b.words.P || 0;
        events.push({ kind: 'dwell', line: lineNo, seconds: sec });
        break;
      }
      case 'M0': case 'M00':
        state.paused = true;
        events.push({ kind: 'pause', line: lineNo, reason: 'M0' });
        break;
      case 'M1': case 'M01':
        state.paused = true;
        events.push({ kind: 'pause', line: lineNo, reason: 'M1' });
        break;
      case 'M2': case 'M02': case 'M30':
        state.programEnded = true;
        events.push({ kind: 'end', line: lineNo });
        break;
      case 'M3': case 'M03':
        state.spindle = { rpm: b.words.S ?? state.spindle.rpm, dir: 'cw' };
        events.push({ kind: 'spindle', line: lineNo, mode: 'on', rpm: state.spindle.rpm, dir: 'cw' });
        break;
      case 'M4': case 'M04':
        state.spindle = { rpm: b.words.S ?? state.spindle.rpm, dir: 'ccw' };
        events.push({ kind: 'spindle', line: lineNo, mode: 'on', rpm: state.spindle.rpm, dir: 'ccw' });
        break;
      case 'M5': case 'M05':
        state.spindle = { rpm: 0, dir: 'off' };
        events.push({ kind: 'spindle', line: lineNo, mode: 'off', rpm: 0, dir: 'cw' });
        break;
      case 'M6': case 'M06': {
        const t = b.words.T ?? state.tool.number;
        state.tool = { number: t, lengthOffset_mm: state.tool.lengthOffset_mm };
        events.push({ kind: 'tool-change', line: lineNo, toolNumber: t });
        break;
      }
      case 'M7':  state.coolant = 'mist';  events.push({ kind: 'coolant', line: lineNo, mode: 'mist' });  break;
      case 'M8':  state.coolant = 'flood'; events.push({ kind: 'coolant', line: lineNo, mode: 'flood' }); break;
      case 'M9':  state.coolant = 'off';   events.push({ kind: 'coolant', line: lineNo, mode: 'off' });   break;
      case 'M700': // KC-specific tool prep — informational
        break;
      case '%':
        break;
      default:
        if (/^[GM][0-9.]+$/.test(c) && !['G0', 'G00', 'G1', 'G01', 'G2', 'G02', 'G3', 'G03'].includes(c)) {
          events.push({ kind: 'unsupported', line: lineNo, code: c, raw: b.raw });
        }
    }
  }

  // 2. Modal F / S / T (when present without an M3/M6 — modal carriers).
  if (b.words.F != null) state.feedrate = b.words.F;
  if (b.words.S != null) state.spindle.rpm = b.words.S;
  if (b.words.T != null && !b.codes.some(c => c === 'M6' || c === 'M06')) {
    state.tool.number = b.words.T;
  }

  // 3. Motion. Look for active motion code in this block; otherwise inherit.
  /** @type {string|null} */
  let motion = null;
  for (const c of b.codes) {
    const cu = c.toUpperCase();
    if (cu === 'G0' || cu === 'G00') { motion = 'G0'; break; }
    if (cu === 'G1' || cu === 'G01') { motion = 'G1'; break; }
    if (cu === 'G2' || cu === 'G02') { motion = 'G2'; break; }
    if (cu === 'G3' || cu === 'G03') { motion = 'G3'; break; }
  }
  const hasAxisWord =
    b.words.X != null || b.words.Y != null || b.words.Z != null ||
    b.words.A != null || b.words.B != null;
  // If no motion code but axis words present and a previous motion is active,
  // we fall back to the last G0/G1 — Pentacad's executor keeps last linear/
  // rapid mode in `state.distanceMode` not the motion mode itself, so we stash
  // it on the state via a hidden property when first seen.
  if (!motion && hasAxisWord) {
    motion = /** @type {any} */ (state).__lastMotion || null;
  }
  if (motion === 'G0' || motion === 'G1' || motion === 'G2' || motion === 'G3') {
    /** @type {any} */ (state).__lastMotion = motion;
  }

  if (motion && hasAxisWord) {
    const target = expandG91(state, b.words);
    const isG53 = b.codes.includes('G53');
    const machineTarget = isG53 ? { ...target } : applyWcs(state, target);
    state.pos = target;
    state.machinePos = machineTarget;

    if (motion === 'G0') {
      events.push({ kind: 'rapid', line: lineNo, target: machineTarget });
    } else if (motion === 'G1') {
      events.push({ kind: 'linear', line: lineNo, target: machineTarget, F: state.feedrate });
    } else if (motion === 'G2' || motion === 'G3') {
      // Arc — IJ-form. Centre = current + (I,J) in plane-aligned axes.
      // For G17 (XY plane) I,J map to X,Y. G18 (ZX) → I,K=Z. G19 (YZ) → J,K.
      const startMachine = applyWcs(stateIn, stateIn.pos);
      const I = b.words.I ?? 0;
      const J = b.words.J ?? 0;
      const K = b.words.K ?? 0;
      let centre = { ...startMachine };
      const plane = state.arc.plane;
      if (plane === 'G17') {
        centre = { ...startMachine, X: startMachine.X + I, Y: startMachine.Y + J };
      } else if (plane === 'G18') {
        centre = { ...startMachine, Z: startMachine.Z + K, X: startMachine.X + I };
      } else if (plane === 'G19') {
        centre = { ...startMachine, Y: startMachine.Y + J, Z: startMachine.Z + K };
      }
      events.push({
        kind: 'arc', line: lineNo,
        dir: motion === 'G2' ? 'cw' : 'ccw',
        target: machineTarget, centre,
        plane, F: state.feedrate,
      });
    }
  }

  // 4. G53 G0 X0 Y0 Z0-style home. We mark a 'home' event when the block
  // contains G53 + a rapid to all-zero (or no axis words at all).
  if (b.codes.includes('G53') && motion === 'G0') {
    const allZero =
      (b.words.X == null || b.words.X === 0) &&
      (b.words.Y == null || b.words.Y === 0) &&
      (b.words.Z == null || b.words.Z === 0);
    if (allZero) events.push({ kind: 'home', line: lineNo });
  }

  return { events, state };
}

/**
 * Parse + execute a complete NGC source program. Returns the full event
 * stream, the post-program state, and any envelope errors discovered along
 * the way (when `opts.machineId` is provided).
 *
 * @param {string} src
 * @param {{ machineId?: string }} [opts]
 * @returns {{ events: ExecEvent[], finalState: ModalState, errors: string[] }}
 */
export function executeProgram(src, opts = {}) {
  const lines = String(src || '').split(/\r?\n/);
  /** @type {ExecEvent[]} */
  const events = [];
  /** @type {string[]} */
  const errors = [];
  let state = createState();

  for (let i = 0; i < lines.length; i++) {
    const block = parseBlock(lines[i], i + 1);
    if (!block) continue;
    const { events: ev, state: next } = executeBlock(state, block);
    state = next;
    for (const e of ev) events.push(e);

    // Soft-limit check on motion events when machineId is supplied.
    if (opts.machineId && (state.machinePos)) {
      const lastMotion = ev.find(x => x.kind === 'rapid' || x.kind === 'linear' || x.kind === 'arc');
      if (lastMotion) {
        const env = isInEnvelope(opts.machineId, state);
        if (!env.ok) {
          for (const e of env.axisErrs) errors.push(`line ${i + 1}: ${e}`);
        }
      }
    }

    if (state.programEnded) break;
  }

  return { events, finalState: state, errors };
}
