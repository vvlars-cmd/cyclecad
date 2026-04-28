/**
 * @file widgets/pentacad-simulator.js
 * @description Pentacad's headline 5-axis kinematic simulator — Suite-widget
 *   port of the standalone "Pentacad Simulator v0.4" that ships at
 *   https://cyclecad.com/app/pentacad-sim.html (3,423-line clone of the
 *   official sim at sim.pentamachine.com).
 *
 *   The widget is a light-themed Material-UI clone of the actual
 *   sim.pentamachine.com (#03B188 Penta green accent, white panes,
 *   #333 dark grey AppBar). It keeps the engine UNCHANGED from the
 *   previous Suite port — DOM scaffold, scene/camera/controls wiring,
 *   GLB rigging on `x/y/z/a/b` nodes, kinematic state model, NGC playback
 *   state machine, drag-and-drop file load with Toast confirmation,
 *   M0/M30 semantics, click-line-to-seek G-code panel — and only swaps
 *   the chrome (palette, fonts, layout, button styling) to match the
 *   real sim.pentamachine.com that Penta ships at v0.9.20.
 *
 *   What's REUSED from the legacy v0.4 file:
 *     - viewport scaffold (canvas host + floating panels above it)
 *     - playback overlay (bottom-centred, auto-fades after idle)
 *     - DRO panel (top-right, Source-Code-Pro readout)
 *     - G-code list (top-left, click line to seek)
 *     - drag-and-drop on the canvas host: .ngc/.nc/.gcode/.tap/.txt → load,
 *       .glb/.gltf → swap kinematic GLB
 *     - GLB rigging: parented `base ← y ← x ← z ← a ← b`, look up nodes by
 *       case-insensitive name, fall through to procedural primitives
 *     - 30-line warm-up demo program (kept the more comprehensive Suite version
 *       — exercises G2/G3 arcs, spindle, coolant, M0, M30; legacy demo was
 *       16 lines and missed arcs)
 *     - Toast-style overlay for transient confirmations (file loaded etc.)
 *     - Auto-hiding chrome (legacy had 5s timeout; we use 3s to match other
 *       Suite widgets)
 *
 *   What's CHANGED vs. the legacy v0.4:
 *     - Palette: identical to sim.pentamachine.com — `#FFFFFF` body,
 *       `#333` AppBar, `#03B188` Penta green accent, `#E0E0E0` MUI buttons.
 *     - NGC parser: swapped to `shared/cam/modal-executor.js` so the simulator
 *       and the post-processor share one G-code interpreter. `parseNgc()` is
 *       kept as a thin wrapper over `executeProgram()` for the public contract.
 *     - Keyboard: SPACE play/pause, S single-step, R reset, [ / ] speed −/+.
 *       Legacy used Arrow←/→ for step, Home/End for jump-to-end, F for
 *       fit-camera, S for screenshot. We omit Home/End/F/screenshot here —
 *       fit-camera and screenshot don't have analogues in the Suite contract.
 *     - ViewCube + camera FAB column from the legacy are dropped (scope:
 *       Suite widgets defer camera presets to a separate `viewcube` widget).
 *     - Show Options / Back Plot panel from the legacy is dropped (scope:
 *       belongs in `playback.js` / `gcode-editor.js` siblings).
 *     - LocalStorage session restore is dropped (Suite widgets are stateless;
 *       the host app owns persistence via `params.ngc`).
 *
 *   Companion widgets:
 *     - widgets/machine-picker.js  — picks the active machine
 *     - widgets/post-processor.js  — emits the NGC the sim plays
 *     - widgets/gcode-editor.js    — text-edit the program before running
 *     - widgets/jog-pad.js         — jog the simulated machine manually
 *     - widgets/playback.js        — embeddable playback controls (legacy)
 *
 *   Approach: pure THREE.js procedural geometry, with an optional GLB
 *   drop-in. The kinematic chain is parented `base ← y ← x ← z ← a ← b`
 *   so each axis transform composes into the tool tip exactly the way the
 *   real Pocket NC stack does. When a real GLB is available at
 *   `opts.params.glbUrl` (default `../shared/lib/penta-machines/v2-50.glb`),
 *   we look up nodes named `x`, `y`, `z`, `a`, `b` (case-insensitive) and
 *   drive those instead of the procedural primitives.
 *
 *   References:
 *     - Kinetic Control wiki:  https://pentamachine.atlassian.net/wiki/spaces/KCUR
 *     - G & M code overview:   https://pentamachine.atlassian.net/wiki/spaces/KCUR/pages/1774551045
 *     - Reference sim:         https://sim.pentamachine.com
 *     - Legacy v0.4 standalone: https://cyclecad.com/app/pentacad-sim.html
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { THREE, TrackballControls, GLTFLoader } from '../shared/lib/three-imports.js';
import {
  defaultMachine, getMachine, envelopeSummary, checkEnvelope, listMachines,
} from '../shared/machines/index.js';
import { executeProgram } from '../shared/cam/modal-executor.js';

/**
 * @typedef {Object} SimMotion
 * @property {number} line               1-based source line index
 * @property {string} block              raw NGC block text (for highlight)
 * @property {'G0'|'G1'|'G2'|'G3'|'TOOL'|'SPINDLE'|'COOLANT'|'NOTE'|'PAUSE'|'END'} kind
 * @property {number} [X]
 * @property {number} [Y]
 * @property {number} [Z]
 * @property {number} [A]
 * @property {number} [B]
 * @property {number} [I]
 * @property {number} [J]
 * @property {number} [F]
 * @property {number} [S]
 * @property {number} [T]
 * @property {string} [text]
 *
 * @typedef {Object} SimState
 * @property {number} X
 * @property {number} Y
 * @property {number} Z
 * @property {number} A
 * @property {number} B
 * @property {number} F
 * @property {number} S
 * @property {number} T
 * @property {boolean} spindleOn
 * @property {'mist'|'flood'|'off'} coolant
 * @property {number} motionIndex
 *
 * @typedef {Object} SimulatorOpts
 * @property {string|HTMLElement} mount
 * @property {string} [app]
 * @property {{ charge: Function }} [meter]
 * @property {{
 *   machineId?: string,
 *   ngc?: string,
 *   speed?: number,
 *   units?: 'inch'|'mm',
 *   autoplay?: boolean,
 *   glbUrl?: string,
 * }} [params]
 */

// ─── Palette · sim.pentamachine.com light Material-UI clone ────────────────
// Hex codes lifted live from sim.pentamachine.com — see the README at
// docs/sim-parity-audit.md for the extraction methodology. Penta GREEN
// (#03B188) replaces the previous Penta yellow accent; backdrop is white,
// header is `#333` Material grey.
const PAL = Object.freeze({
  appBarBg:    '#333333',
  appBarText:  '#FFFFFF',
  bodyBg:      '#FFFFFF',
  bodyText:    '#000000',
  pentaGreen:  '#03B188',
  tabInactive: '#333333',
  btnBg:       '#E0E0E0',
  btnText:     '#000000',
  sidebarBg:   '#FFFFFF',
  sidebarRule: '#E0E0E0',
  gutterText:  '#999999',
  gcodeKw:     '#1565C0',
  gcodeNum:    '#1B5E20',
  gcodeCom:    '#999999',
  currentLine: '#FFFDE7',
  droBg:       '#F0F0F0',
  droBorder:   '#D0D0D0',
  vpTop:       '#FAFAFA',
  vpBottom:    '#E5E7EB',
  axisX:       '#E11D48',
  axisY:       '#10B981',
  axisZ:       '#3B82F6',
  ok:          '#10B981',
  warn:        '#FB923C',
  err:         '#E11D48',
  toastBg:     'rgba(51,51,51,0.95)',
  toastText:   '#FFFFFF',
});

const FONT_UI    = '14px Roboto, Helvetica, Arial, sans-serif';
const FONT_BODY  = '16px Roboto, Helvetica, Arial, sans-serif';
const FONT_MONO  = '13px Monaco, Menlo, "Ubuntu Mono", Consolas, "Source Code Pro", source-code-pro, monospace';
const FONT_BTN   = '500 14px Roboto, Helvetica, Arial, sans-serif';
const FONT_TITLE = '500 18px Roboto, Helvetica, Arial, sans-serif';

/**
 * 30-line warm-up program — exercises every motion kind so the sim has
 * something to play on first mount even before the user pastes their own.
 * Chosen over the legacy 16-line demo because this one covers G2/G3 arcs,
 * spindle/coolant transitions, M0 and M30 — the v0.4 demo skipped arcs.
 */
const DEMO_NGC = [
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

// =========================================================================
// Stock-removal voxel renderer
// =========================================================================
//
// Phase 2 deliverable. Owns a small (default 32x16x32) voxel grid that
// represents the workpiece sitting on the B-platter. As the simulator
// runs the tool tip is world-transformed into B-platter local space and
// every voxel within a tool-radius sphere of the tip is marked removed.
//
// The mesh is rebuilt by emitting a single BufferGeometry where every
// solid voxel contributes 6 cube faces (we're not optimising for mass —
// 32x16x32 = 16,384 voxels max, 12 tris each = 196k tris worst case,
// fine for WebGL). The material matches the existing transparent green
// stock indicator so the visual swap is seamless.
//
// All public methods are pure (no DOM, no scene mutation outside `group`),
// so the simulator's init() owns wiring and the toggle.

/** @typedef {{ sizeX:number, sizeY:number, sizeZ:number, gridX:number, gridY:number, gridZ:number, origin:{x:number,y:number,z:number} }} StockOpts */

class StockRemoval {
  /** @param {StockOpts} opts */
  constructor(opts) {
    this.sizeX = opts.sizeX;
    this.sizeY = opts.sizeY;
    this.sizeZ = opts.sizeZ;
    this.gridX = opts.gridX;
    this.gridY = opts.gridY;
    this.gridZ = opts.gridZ;
    this.origin = { ...opts.origin };
    this.cellX = this.sizeX / this.gridX;
    this.cellY = this.sizeY / this.gridY;
    this.cellZ = this.sizeZ / this.gridZ;
    /** @type {Uint8Array} 1=solid 0=removed, indexed [x*gy*gz + y*gz + z] */
    this.cells = new Uint8Array(this.gridX * this.gridY * this.gridZ);
    this.cells.fill(1);
    /** @type {THREE.Group} */
    this.group = new THREE.Group();
    this.group.name = 'stock-removal';
    this.group.position.set(this.origin.x, this.origin.y - this.sizeY / 2, this.origin.z);
    /** @type {THREE.Material} */
    this.material = new THREE.MeshBasicMaterial({
      color: 0x10B981, transparent: true, opacity: 0.55,
    });
    /** @type {THREE.Mesh|null} */
    this.mesh = null;
    /** @type {THREE.Mesh|null} */
    this.solidFallback = null;
    this.dirty = true;
    this.rebuildMesh();
  }

  /** @param {number} ix @param {number} iy @param {number} iz */
  _idx(ix, iy, iz) {
    return ix * this.gridY * this.gridZ + iy * this.gridZ + iz;
  }

  reset() {
    this.cells.fill(1);
    this.dirty = true;
  }

  /**
   * Walk a tool-radius sphere centred on the tool tip in B-platter local
   * coords and zero every voxel inside the sphere.
   *
   * @param {{ tipLocal:{x:number,y:number,z:number}, toolRadius:number }} args
   * @returns {boolean} true if at least one voxel was removed
   */
  removeAtTip({ tipLocal, toolRadius }) {
    // Map world-local-to-grid: stock corner is at (origin.x - sizeX/2, origin.y - sizeY/2, origin.z - sizeZ/2)
    const lx = tipLocal.x - (this.origin.x - this.sizeX / 2);
    const ly = tipLocal.y - (this.origin.y - this.sizeY / 2);
    const lz = tipLocal.z - (this.origin.z - this.sizeZ / 2);
    const r = toolRadius;
    const r2 = r * r;
    const minIx = Math.max(0, Math.floor((lx - r) / this.cellX));
    const maxIx = Math.min(this.gridX - 1, Math.floor((lx + r) / this.cellX));
    const minIy = Math.max(0, Math.floor((ly - r) / this.cellY));
    const maxIy = Math.min(this.gridY - 1, Math.floor((ly + r) / this.cellY));
    const minIz = Math.max(0, Math.floor((lz - r) / this.cellZ));
    const maxIz = Math.min(this.gridZ - 1, Math.floor((lz + r) / this.cellZ));
    let changed = false;
    for (let ix = minIx; ix <= maxIx; ix++) {
      const cx = (ix + 0.5) * this.cellX;
      const dx = cx - lx;
      for (let iy = minIy; iy <= maxIy; iy++) {
        const cy = (iy + 0.5) * this.cellY;
        const dy = cy - ly;
        for (let iz = minIz; iz <= maxIz; iz++) {
          const cz = (iz + 0.5) * this.cellZ;
          const dz = cz - lz;
          if (dx * dx + dy * dy + dz * dz <= r2) {
            const i = this._idx(ix, iy, iz);
            if (this.cells[i]) {
              this.cells[i] = 0;
              changed = true;
            }
          }
        }
      }
    }
    if (changed) this.dirty = true;
    return changed;
  }

  /**
   * Public hook called by the simulator. Translates the live SimState's
   * tool tip into B-platter local space (accounting for B rotation) and
   * delegates to `removeAtTip`.
   *
   * @param {{ X:number, Y:number, Z:number, A:number, B:number }} state
   * @param {number} [toolRadius]
   * @returns {boolean}
   */
  removeAtToolTip(state, toolRadius = 2.5) {
    // The simulator's stock sits on the B-platter; the toolpath state is
    // in the workpiece (G54) frame, which IS B-local for our procedural
    // chain (no offset). Use state.X/Y/Z directly as B-local tip coords.
    return this.removeAtTip({
      tipLocal: { x: state.X, y: state.Z + this.sizeY, z: state.Y },
      toolRadius,
    });
  }

  /**
   * Rebuild a single BufferGeometry covering every solid voxel. One cube
   * per voxel — clarity over polygon count.
   */
  rebuildMesh() {
    if (!this.dirty && this.mesh) return;
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    /** @type {number[]} */
    const positions = [];
    /** @type {number[]} */
    const normals = [];
    const cx = this.cellX, cy = this.cellY, cz = this.cellZ;
    for (let ix = 0; ix < this.gridX; ix++) {
      for (let iy = 0; iy < this.gridY; iy++) {
        for (let iz = 0; iz < this.gridZ; iz++) {
          if (!this.cells[this._idx(ix, iy, iz)]) continue;
          const x0 = ix * cx, x1 = x0 + cx;
          const y0 = iy * cy, y1 = y0 + cy;
          const z0 = iz * cz, z1 = z0 + cz;
          // 6 faces: ±X ±Y ±Z (skip if neighbour solid for tiny optimisation)
          const nx0 = ix === 0 || !this.cells[this._idx(ix - 1, iy, iz)];
          const nx1 = ix === this.gridX - 1 || !this.cells[this._idx(ix + 1, iy, iz)];
          const ny0 = iy === 0 || !this.cells[this._idx(ix, iy - 1, iz)];
          const ny1 = iy === this.gridY - 1 || !this.cells[this._idx(ix, iy + 1, iz)];
          const nz0 = iz === 0 || !this.cells[this._idx(ix, iy, iz - 1)];
          const nz1 = iz === this.gridZ - 1 || !this.cells[this._idx(ix, iy, iz + 1)];
          if (nx0) StockRemoval._pushFace(positions, normals, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
          if (nx1) StockRemoval._pushFace(positions, normals, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
          if (ny0) StockRemoval._pushFace(positions, normals, [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]);
          if (ny1) StockRemoval._pushFace(positions, normals, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
          if (nz0) StockRemoval._pushFace(positions, normals, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
          if (nz1) StockRemoval._pushFace(positions, normals, [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1]);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'stock-removal-voxels';
    this.group.add(this.mesh);
    this.dirty = false;
  }

  /** @param {number[]} positions @param {number[]} normals @param {number[]} a @param {number[]} b @param {number[]} c @param {number[]} d @param {number[]} n */
  static _pushFace(positions, normals, a, b, c, d, n) {
    // two triangles a-b-c, a-c-d
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) normals.push(...n);
  }

  /** Switch to the original solid-box stock (toggle OFF). */
  showSolid() {
    if (this.mesh) this.mesh.visible = false;
    if (!this.solidFallback) {
      const geo = new THREE.BoxGeometry(this.sizeX, this.sizeY, this.sizeZ);
      this.solidFallback = new THREE.Mesh(geo, this.material);
      this.solidFallback.position.set(this.sizeX / 2, this.sizeY / 2, this.sizeZ / 2);
      this.solidFallback.name = 'stock-solid-fallback';
      this.group.add(this.solidFallback);
    }
    this.solidFallback.visible = true;
  }

  /** Switch back to the voxel mesh (toggle ON). */
  showVoxels() {
    if (this.solidFallback) this.solidFallback.visible = false;
    if (this.mesh) this.mesh.visible = true;
  }

  dispose() {
    if (this.mesh) this.mesh.geometry.dispose();
    if (this.solidFallback) this.solidFallback.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Mount the Pentacad simulator into a DOM element and return its handle.
 *
 * @param {SimulatorOpts} opts
 * @returns {Promise<{
 *   api: {
 *     load:       (ngc: string) => void,
 *     play:       () => void,
 *     pause:      () => void,
 *     stop:       () => void,
 *     step:       (n?: number) => void,
 *     reset:      () => void,
 *     setSpeed:   (mult: number) => void,
 *     setMachine: (id: string) => void,
 *     getState:   () => SimState,
 *     getDom:     () => HTMLElement,
 *   },
 *   on: (event: 'play'|'pause'|'stop'|'line'|'change'|'envelope', fn: (p: unknown) => void) => void,
 *   destroy: () => void,
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('pentacad-simulator: mount not found');

  /** @type {Record<string, Function[]>} */
  const listeners = { play: [], pause: [], stop: [], line: [], change: [], envelope: [] };
  const emit = (/** @type {string} */ ev, /** @type {*} */ p) =>
    (listeners[ev] || []).forEach(fn => { try { fn(p); } catch (_) { /* swallow */ } });

  let machine = getMachine(opts.params?.machineId || '') || defaultMachine();

  /** @type {SimState} */
  const state = {
    X: 0, Y: 0, Z: 25, A: 0, B: 0,
    F: 0, S: 0, T: 0,
    spindleOn: false, coolant: 'off',
    motionIndex: 0,
  };

  /** @type {SimMotion[]} */
  let motions = parseNgc(opts.params?.ngc || DEMO_NGC);
  let speed = opts.params?.speed || 1;
  let playing = false;
  /** @type {number|null} */
  let raf = null;
  let lastTickMs = 0;
  /** @type {{ from: SimState, to: SimMotion, t: number, durMs: number } | null} */
  let interp = null;

  // Stock-removal voxel renderer wiring (Phase 2). The bGroup will call
  // `bGroup.add(stockRemoval.group)` inside buildProcedural(); we hold
  // the references here so the api / motion handler can talk to it.
  /** @type {StockRemoval|null} */
  let stockRemoval = null;
  /** @type {THREE.Object3D|null} */
  let stockMount = null;
  let stockRemovalEnabled = true;
  let lastStockRebuild = 0;
  const STOCK_TOP_THRESHOLD = 22; // mm — rough Z above which the tool can't engage stock

  // ─── DOM ──────────────────────────────────────────────────────────────────
  // sim.pentamachine.com clone: 64px dark Material-UI AppBar, 325px white
  // sidebar with GCODE/SUMMARY tabs + monospace code area, light-gradient
  // viewport with floating DRO + tool buttons + bottom-centre mini-bar +
  // bottom-right CHANGE MACHINE green button. All CSS scoped to
  // `.pt-pentacad-simulator` via the injected <style> block below.
  const dom = document.createElement('div');
  dom.className = 'pt-pentacad-simulator';
  dom.style.cssText = `
    position: relative;
    width: 100%; height: 100%; min-height: 480px;
    font: ${FONT_BODY};
    background: ${PAL.bodyBg}; color: ${PAL.bodyText};
    overflow: hidden;
    display: grid;
    grid-template-rows: 64px 1fr;
    grid-template-columns: 325px 1fr;
  `;

  // Scoped <style> block — every selector lives under .pt-pentacad-simulator
  // so nothing leaks into the host page (Suite-widget convention).
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .pt-pentacad-simulator { font: ${FONT_BODY}; }
    .pt-pentacad-simulator .pt-appbar-btn {
      background: transparent; color: ${PAL.appBarText};
      border: none; font: ${FONT_BTN}; letter-spacing: .04em;
      padding: 6px 10px; border-radius: 4px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
      transition: background-color 150ms ease;
    }
    .pt-pentacad-simulator .pt-appbar-btn:hover { background: rgba(255,255,255,0.10); }
    .pt-pentacad-simulator .pt-icon-btn {
      background: transparent; color: ${PAL.appBarText};
      border: none; padding: 6px; border-radius: 50%; cursor: pointer;
      width: 36px; height: 36px; display: inline-flex;
      align-items: center; justify-content: center;
      transition: background-color 150ms ease;
    }
    .pt-pentacad-simulator .pt-icon-btn:hover { background: rgba(255,255,255,0.10); }
    .pt-pentacad-simulator .pt-tab {
      flex: 1; background: transparent; border: none;
      color: ${PAL.tabInactive};
      font: ${FONT_BTN}; letter-spacing: .04em;
      padding: 12px 16px; cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: background-color 150ms ease, color 150ms ease;
    }
    .pt-pentacad-simulator .pt-tab:hover { background: rgba(0,0,0,0.04); }
    .pt-pentacad-simulator .pt-tab.is-active {
      color: ${PAL.pentaGreen};
      border-bottom-color: ${PAL.pentaGreen};
    }
    .pt-pentacad-simulator .pt-mui-btn {
      background: ${PAL.btnBg}; color: ${PAL.btnText};
      border: none; padding: 6px 12px; border-radius: 4px;
      font: ${FONT_BTN}; letter-spacing: .04em; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.12);
      transition: background-color 150ms ease, box-shadow 150ms ease;
      min-width: 36px;
    }
    .pt-pentacad-simulator .pt-mui-btn:hover {
      background: #D5D5D5;
      box-shadow: 0 2px 4px rgba(0,0,0,0.16);
    }
    .pt-pentacad-simulator .pt-mui-btn:disabled {
      color: rgba(0,0,0,0.38); background: rgba(0,0,0,0.06);
      cursor: default; box-shadow: none;
    }
    .pt-pentacad-simulator .pt-green-btn {
      background: ${PAL.pentaGreen}; color: ${PAL.appBarText};
      border: none; padding: 8px 16px; border-radius: 4px;
      font: ${FONT_BTN}; letter-spacing: .04em; cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.20);
      transition: background-color 150ms ease, box-shadow 150ms ease;
    }
    .pt-pentacad-simulator .pt-green-btn:hover {
      background: #02926F; box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }
    .pt-pentacad-simulator .pt-tool-btn {
      width: 36px; height: 36px; padding: 0;
      background: rgba(255,255,255,0.92);
      color: ${PAL.bodyText}; border: 1px solid ${PAL.droBorder};
      border-radius: 4px; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      transition: background-color 150ms ease;
    }
    .pt-pentacad-simulator .pt-tool-btn:hover { background: #FFFFFF; }
    .pt-pentacad-simulator .pt-gcode-line {
      display: flex; padding: 0 8px 0 0; cursor: pointer;
      white-space: pre; line-height: 1.55;
    }
    .pt-pentacad-simulator .pt-gcode-line:hover { background: #F5F5F5; }
    .pt-pentacad-simulator .pt-gcode-line.is-current { background: ${PAL.currentLine}; }
    .pt-pentacad-simulator .pt-gcode-gutter {
      display: inline-block; min-width: 38px; padding: 0 8px;
      color: ${PAL.gutterText}; text-align: right; user-select: none;
      border-right: 1px solid ${PAL.sidebarRule}; margin-right: 8px;
    }
    .pt-pentacad-simulator .pt-machine-menu {
      position: absolute; bottom: 50px; right: 16px;
      background: ${PAL.bodyBg}; border-radius: 4px;
      box-shadow: 0 5px 14px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15);
      min-width: 220px; padding: 6px 0; z-index: 70;
    }
    .pt-pentacad-simulator .pt-machine-item {
      padding: 8px 16px; cursor: pointer; font: ${FONT_UI};
      color: ${PAL.bodyText};
    }
    .pt-pentacad-simulator .pt-machine-item:hover { background: rgba(0,0,0,0.06); }
    .pt-pentacad-simulator .pt-machine-item.is-active { color: ${PAL.pentaGreen}; font-weight: 500; }
  `;
  dom.appendChild(styleEl);

  dom.innerHTML += `
    <header data-appbar style="grid-row:1; grid-column:1 / -1; background:${PAL.appBarBg}; color:${PAL.appBarText}; display:flex; align-items:center; gap:16px; padding:0 16px; box-shadow:0 1px 4px rgba(0,0,0,0.18); z-index:10">
      <div style="display:flex; align-items:center; gap:12px">
        <div style="width:32px; height:32px; border-radius:50%; border:2px solid ${PAL.appBarText}; display:flex; align-items:center; justify-content:center; font:600 14px Roboto"></div>
        <span style="font:${FONT_TITLE}">Penta Simulator <span data-version style="opacity:.7; font-weight:400">v0.9.20</span></span>
      </div>
      <div style="margin-left:auto; display:flex; align-items:center; gap:4px">
        <button class="pt-appbar-btn" data-act="export-zip" title="Download simulation ZIP">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>
          <span>SIMULATION ZIP</span>
        </button>
        <button class="pt-appbar-btn" data-act="export-gcode" title="Download G-code">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          <span>GCODE</span>
        </button>
        <button class="pt-appbar-btn" data-act="export-model" title="Download 3D model">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <span>MODEL</span>
        </button>
        <button class="pt-icon-btn" data-act="share" title="Share simulator">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
        </button>
        <button class="pt-icon-btn" data-act="help" title="Help">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
        </button>
      </div>
    </header>

    <aside data-sidebar style="grid-row:2; grid-column:1; background:${PAL.sidebarBg}; border-right:1px solid ${PAL.sidebarRule}; display:flex; flex-direction:column; overflow:hidden">
      <div role="tablist" style="display:flex; border-bottom:1px solid ${PAL.sidebarRule}">
        <button class="pt-tab is-active" data-tab="gcode" role="tab" aria-selected="true">GCODE</button>
        <button class="pt-tab" data-tab="summary" role="tab" aria-selected="false">SUMMARY</button>
      </div>

      <div data-tab-gcode style="flex:1; overflow:hidden; display:flex; flex-direction:column">
        <pre data-gcode style="margin:0; flex:1; overflow:auto; padding:8px 0; font:${FONT_MONO}; color:${PAL.bodyText}; background:${PAL.bodyBg}"></pre>
      </div>

      <div data-tab-summary style="flex:1; overflow:auto; padding:16px; font:${FONT_UI}; display:none">
        <div style="font-weight:500; margin-bottom:8px">Program Summary</div>
        <div data-summary style="font:${FONT_MONO}; color:${PAL.bodyText}; line-height:1.7"></div>
      </div>

      <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-top:1px solid ${PAL.sidebarRule}; background:${PAL.bodyBg}">
        <span data-file-pill style="flex:1; padding:4px 10px; background:${PAL.btnBg}; border-radius:12px; font:${FONT_MONO}; font-size:12px; color:${PAL.bodyText}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">sim.ngc</span>
        <button class="pt-icon-btn" data-act="upload" title="Upload .ngc" style="color:${PAL.bodyText}; width:32px; height:32px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zM5 18h14v2H5z"/></svg>
        </button>
        <button class="pt-icon-btn" data-act="download" title="Download .ngc" style="color:${PAL.bodyText}; width:32px; height:32px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </button>
      </div>
    </aside>

    <main data-viewport style="grid-row:2; grid-column:2; position:relative; overflow:hidden; background:linear-gradient(180deg, ${PAL.vpTop} 0%, ${PAL.vpBottom} 100%)">
      <div data-canvas-host style="position:absolute; inset:0"></div>

      <div data-coord-widget style="position:absolute; bottom:80px; left:14px; width:64px; height:64px; pointer-events:none">
        <svg viewBox="-40 -40 80 80" width="64" height="64" xmlns="http://www.w3.org/2000/svg" data-coord-svg style="overflow:visible"></svg>
      </div>

      <div data-envelope-warning style="position:absolute; top:14px; left:50%; transform:translateX(-50%); display:none; background:#FFF3F3; color:#7F1D1D; padding:8px 14px; border-radius:4px; font:${FONT_UI}; font-size:13px; line-height:1.45; border:1px solid #FCA5A5; box-shadow:0 1px 3px rgba(0,0,0,0.12); z-index:30; max-width:520px"></div>

      <div data-tools style="position:absolute; top:24px; right:32px; display:flex; flex-direction:column; gap:8px; z-index:20">
        <button class="pt-tool-btn" data-act="view-cube" title="Reset view">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M9 4v16"/></svg>
        </button>
        <button class="pt-tool-btn" data-act="screenshot" title="Screenshot">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
        </button>
      </div>

      <div data-dro-panel style="position:absolute; top:24px; right:280px; width:140px; background:${PAL.droBg}; border:1px solid ${PAL.droBorder}; border-radius:4px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.10); z-index:15">
        <div data-dro style="font:${FONT_MONO}; color:${PAL.bodyText}; line-height:1.65"></div>
      </div>

      <button class="pt-mui-btn" data-act="show-options" disabled style="position:absolute; top:200px; right:280px; width:140px">SHOW OPTIONS</button>

      <div data-mini-bar style="position:absolute; bottom:18px; left:50%; transform:translateX(-50%); background:${PAL.bodyBg}; border-radius:24px; box-shadow:0 2px 8px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.10); padding:6px 10px; display:flex; align-items:center; gap:8px; z-index:25">
        <button class="pt-mui-btn" data-act="prev" title="Step back" style="min-width:36px; padding:6px">⏮</button>
        <button class="pt-mui-btn" data-act="play" title="Play / pause (Space)" style="min-width:36px; padding:6px">▶</button>
        <button class="pt-mui-btn" data-act="step" title="Step forward (S)" style="min-width:36px; padding:6px">⏭</button>
        <button class="pt-mui-btn" data-act="stop" title="Stop &amp; reset (R)" style="min-width:36px; padding:6px">■</button>
        <span style="width:1px; height:20px; background:${PAL.sidebarRule}; margin:0 4px"></span>
        <span data-progress-text style="font:${FONT_MONO}; color:${PAL.bodyText}; min-width:60px; text-align:center">0 / 0</span>
        <input data-speed type="range" min="0.1" max="8" step="0.1" value="1" style="width:80px; accent-color:${PAL.pentaGreen}">
        <span data-speed-out style="font:${FONT_MONO}; color:${PAL.bodyText}; min-width:34px">1.0×</span>
      </div>

      <div data-progress-bar-wrap style="position:absolute; bottom:0; left:0; right:0; height:3px; background:transparent; z-index:14">
        <div data-progress-bar style="height:100%; width:0%; background:${PAL.pentaGreen}; transition:width .15s ease"></div>
      </div>

      <button class="pt-green-btn" data-act="change-machine" style="position:absolute; bottom:18px; right:18px; z-index:25">
        <span data-machine-label></span>
        <span style="margin-left:8px">CHANGE MACHINE</span>
      </button>

      <div data-machine-menu class="pt-machine-menu" style="display:none"></div>

      <div data-status style="position:absolute; bottom:60px; left:18px; font:${FONT_MONO}; font-size:12px; color:#666; z-index:14">idle</div>
    </main>

    <div data-drop-overlay style="position:absolute; inset:0; display:none; align-items:center; justify-content:center; background:rgba(3,177,136,0.08); border:3px dashed ${PAL.pentaGreen}; pointer-events:none; z-index:80">
      <div style="background:${PAL.bodyBg}; border:1px solid ${PAL.pentaGreen}; padding:18px 28px; border-radius:4px; font:${FONT_UI}; color:${PAL.bodyText}; box-shadow:0 5px 14px rgba(0,0,0,0.20)">
        <span style="color:${PAL.pentaGreen}; font:${FONT_BTN}; letter-spacing:.08em">DROP TO LOAD</span>
        <div style="margin-top:6px; color:#666; font-size:13px">.ngc · .nc · .gcode · .tap · .glb</div>
      </div>
    </div>

    <div data-toast style="position:absolute; bottom:90px; left:50%; transform:translateX(-50%) translateY(8px); background:${PAL.toastBg}; color:${PAL.toastText}; padding:10px 18px; border-radius:4px; font:${FONT_UI}; font-size:13px; box-shadow:0 2px 8px rgba(0,0,0,0.30); opacity:0; pointer-events:none; transition:opacity 200ms ease, transform 200ms ease; z-index:90; white-space:nowrap"></div>
  `;
  root.appendChild(dom);

  // Header & label text
  /** @type {HTMLElement} */ (dom.querySelector('[data-machine-label]')).textContent = machine.name;

  // ─── THREE scene ──────────────────────────────────────────────────────────
  const canvasHost = /** @type {HTMLElement} */ (dom.querySelector('[data-canvas-host]'));
  const scene    = new THREE.Scene();
  // Scene background: transparent so the gradient on the viewport shows through
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.position.set(180, 140, 220);
  camera.lookAt(0, 30, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  canvasHost.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

  // TrackballControls — free rotation, no fixed up vector. Matches the
  // free-orbit feel of sim.pentamachine.com (you can roll the camera
  // upside-down and it stays there). Same controls config the legacy v0.4
  // standalone uses.
  const controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 3.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.staticMoving = false;
  controls.dynamicDampingFactor = 0.15;
  controls.target.set(0, 30, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(60, 120, 80);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88a3ff, 0.35);
  fill.position.set(-100, 60, -60);
  scene.add(fill);

  // Grid + axes — neutral grey on the light viewport
  const grid = new THREE.GridHelper(400, 40, 0xB0B0B0, 0xD8D8D8);
  scene.add(grid);
  const axes = new THREE.AxesHelper(40);
  axes.position.y = 0.1;
  scene.add(axes);

  // ─── Kinematic chain ──────────────────────────────────────────────────────
  // Procedural primitives (always built — used as the fallback). When a
  // GLB loads we hide `procRoot` and rebind the group references to the
  // GLB nodes that match the axis names. This is the same scheme the
  // legacy v0.4 standalone uses (see setupGlbKinematics in pentacad-sim.html).

  /** @type {{ x: THREE.Object3D, y: THREE.Object3D, z: THREE.Object3D, a: THREE.Object3D, b: THREE.Object3D }} */
  // @ts-ignore — populated below
  let kin = {};

  let procRoot = new THREE.Group();
  procRoot.name = 'pentacad-procedural-root';
  scene.add(procRoot);

  // Track GLB scene root so we can swap it out on machine GLB drop.
  /** @type {THREE.Object3D | null} */
  let glbRoot = null;

  buildProcedural();

  function buildProcedural() {
    // Base block (does not move)
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(220, 24, 200),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.4, roughness: 0.7 }),
    );
    base.position.y = 12;
    procRoot.add(base);

    // Y carriage (table that translates in Y)
    const yGroup = new THREE.Group();
    yGroup.name = 'y';
    procRoot.add(yGroup);
    const yCarriage = new THREE.Mesh(
      new THREE.BoxGeometry(180, 18, 160),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.6 }),
    );
    yCarriage.position.y = 33;
    yGroup.add(yCarriage);

    // X carriage (translates in X relative to Y)
    const xGroup = new THREE.Group();
    xGroup.name = 'x';
    yGroup.add(xGroup);

    // A trunnion (rotates about X relative to X carriage)
    const aGroup = new THREE.Group();
    aGroup.name = 'a';
    aGroup.position.set(0, 38, 0);
    xGroup.add(aGroup);
    const trunnion = new THREE.Mesh(
      new THREE.CylinderGeometry(45, 45, 24, 32, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.55, roughness: 0.55 }),
    );
    trunnion.rotation.z = Math.PI / 2;
    trunnion.position.y = 4;
    aGroup.add(trunnion);

    // B platter (rotates about Y relative to A trunnion)
    const bGroup = new THREE.Group();
    bGroup.name = 'b';
    bGroup.position.set(0, 14, 0);
    aGroup.add(bGroup);
    const platter = new THREE.Mesh(
      new THREE.CylinderGeometry(40, 40, 6, 48),
      new THREE.MeshStandardMaterial({ color: 0xD4A843, metalness: 0.4, roughness: 0.4 }),
    );
    platter.position.y = 3;
    bGroup.add(platter);
    // Stock — voxel grid that records material removal as the tool tip
    // sweeps below the stock-top threshold. The legacy fallback is a
    // single solid box; the StockRemoval class wraps both representations
    // and the api.setStockRemoval() toggle picks between them at runtime.
    stockRemoval = new StockRemoval({
      sizeX: 30, sizeY: 10, sizeZ: 30,
      gridX: 32, gridY: 16, gridZ: 32,
      origin: { x: 0, y: 11, z: 0 },
    });
    bGroup.add(stockRemoval.group);
    stockMount = bGroup;

    // Z spindle column
    const zGroup = new THREE.Group();
    zGroup.name = 'z';
    procRoot.add(zGroup);
    zGroup.position.set(0, 24, -65);
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(40, 120, 20),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.6 }),
    );
    column.position.set(0, 60, -10);
    zGroup.add(column);
    const spindle = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 12, 30, 24),
      new THREE.MeshStandardMaterial({ color: 0x94A3B8, metalness: 0.7, roughness: 0.4 }),
    );
    spindle.position.set(0, 90, 12);
    zGroup.add(spindle);
    const tool = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 30, 16),
      new THREE.MeshStandardMaterial({
        color: 0xE0E7FF, metalness: 0.95, roughness: 0.18, emissive: 0x111827,
      }),
    );
    tool.position.set(0, 60, 12);
    zGroup.add(tool);
    const tooltip = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: PAL.pentaGreen }),
    );
    tooltip.position.set(0, 45, 12);
    zGroup.add(tooltip);

    kin = { x: xGroup, y: yGroup, z: zGroup, a: aGroup, b: bGroup };
  }

  /**
   * Look up a node on a loaded GLB by case-insensitive name. Mirrors the
   * legacy v0.4 setupGlbKinematics helper.
   *
   * @param {THREE.Object3D} root3
   * @param {string} name
   * @returns {THREE.Object3D | null}
   */
  function findByName(root3, name) {
    const target = name.toLowerCase();
    /** @type {THREE.Object3D | null} */
    let hit = null;
    root3.traverse(o => {
      if (!hit && o.name && o.name.toLowerCase() === target) hit = o;
    });
    return hit;
  }

  /**
   * Bind a freshly-loaded GLB scene's `x/y/z/a/b` nodes to the live `kin`
   * map. Returns true on success, false if the GLB is missing required
   * nodes — in which case we fall back to procedural.
   *
   * @param {THREE.Object3D} root3
   * @returns {boolean}
   */
  function bindGlbKinematics(root3) {
    const gx = findByName(root3, 'x'),
          gy = findByName(root3, 'y'),
          gz = findByName(root3, 'z'),
          ga = findByName(root3, 'a'),
          gb = findByName(root3, 'b');
    if (!gx || !gy || !gz || !ga || !gb) return false;
    procRoot.visible = false;
    if (glbRoot) scene.remove(glbRoot);
    glbRoot = root3;
    scene.add(root3);
    kin = { x: gx, y: gy, z: gz, a: ga, b: gb };
    applyKinematics();
    return true;
  }

  // ─── GLB attempt (HEAD-probe → load → rebind) ────────────────────────────
  // The legacy v0.4 standalone publishes machine GLBs at
  //   https://cyclecad.com/app/models/<id>.glb        (primary)
  //   https://cyclecad.com/machines/<id>/<id>.glb     (fallback)
  // Each canonical machine in `shared/machines/penta.json` carries a
  // `glbUrls` array — try each in order, fall through to procedural chain
  // on any failure. `opts.params.glbUrl` overrides the catalog (single URL).
  /** @type {string[]} */
  const glbCandidates = opts.params?.glbUrl
    ? [opts.params.glbUrl]
    : (/** @type {{glbUrls?: string[]}} */ (machine).glbUrls
       || ['../shared/lib/penta-machines/' + machine.id + '.glb']);
  let glbActive = false;

  ;(async () => {
    for (const url of glbCandidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok) {
          console.info(`[pentacad-simulator] GLB miss ${url} (HTTP ${head.status}) — trying next candidate.`);
          continue;
        }
        const loader = new GLTFLoader();
        const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
        const root3 = /** @type {THREE.Object3D} */ (gltf.scene);
        if (!bindGlbKinematics(root3)) {
          console.info(`[pentacad-simulator] ${url} loaded but missing x/y/z/a/b nodes — trying next candidate.`);
          continue;
        }
        glbActive = true;
        console.info(`[pentacad-simulator] GLB bound from ${url} (x/y/z/a/b nodes found).`);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.info(`[pentacad-simulator] GLB load failed for ${url}: ${msg} — trying next candidate.`);
      }
    }
    console.info('[pentacad-simulator] No GLB candidate resolved — using procedural chain.');
  })();

  // ─── Resize ───────────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = canvasHost.clientWidth;
    const h = canvasHost.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      controls.handleResize?.();
    }
  });
  ro.observe(canvasHost);

  // ─── Render loop ──────────────────────────────────────────────────────────
  function animate(/** @type {number} */ now) {
    raf = requestAnimationFrame(animate);
    const dt = lastTickMs ? Math.min(50, now - lastTickMs) : 16;
    lastTickMs = now;

    if (playing && interp) {
      interp.t += (dt * speed) / interp.durMs;
      if (interp.t >= 1) {
        applyMotionTarget(interp.to);
        interp = null;
        if (state.motionIndex < motions.length - 1) {
          state.motionIndex++;
          startInterp();
        } else {
          playing = false;
          updatePlayBtn();
          setStatus(`done · ${motions.length} motions`);
          if (stockRemoval && stockRemovalEnabled) stockRemoval.rebuildMesh();
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
      }
      applyKinematics();
      renderDro();
      renderProgress();
    }
    controls.update();
    renderCoordWidget();
    renderer.render(scene, camera);
  }

  /** @param {number} a @param {number} b @param {number} t */
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** @param {number} t */
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  /**
   * Apply the live `state` to the active kinematic groups (procedural OR
   * GLB nodes — whichever is currently bound to `kin`).
   */
  function applyKinematics() {
    kin.y.position.z = -state.Y;
    kin.x.position.x =  state.X;
    kin.z.position.y =  Math.max(-30, state.Z * 1.0);
    kin.a.rotation.x =  THREE.MathUtils.degToRad(state.A);
    kin.b.rotation.y =  THREE.MathUtils.degToRad(state.B);
  }

  /** @param {SimMotion} m */
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
    if (m.kind === 'COOLANT') state.coolant = (m.text === 'M8' ? 'flood' : m.text === 'M7' ? 'mist' : 'off');

    const env = checkEnvelope(machine.id, { X: state.X, Y: state.Y, Z: state.Z, A: state.A, B: state.B, units: 'mm' });
    if (!env.ok) {
      showEnvelopeWarning(env.errors);
      emit('envelope', { ok: false, errors: env.errors });
    } else {
      hideEnvelopeWarning();
    }

    // Phase 2 voxel removal: while playing, every G0/G1 motion below the
    // stock-top threshold marks intersected voxels as removed. Mesh
    // rebuilds are throttled to ~10 Hz (100 ms) so swarms of micro-moves
    // don't choke the render loop.
    if (stockRemovalEnabled && stockRemoval && (m.kind === 'G0' || m.kind === 'G1')) {
      if (state.Z < STOCK_TOP_THRESHOLD) {
        stockRemoval.removeAtToolTip(state);
        const now = performance.now();
        if (now - lastStockRebuild > 100) {
          stockRemoval.rebuildMesh();
          lastStockRebuild = now;
        }
      }
    }

    highlightLine(m.line);
    emit('line', { line: m.line, motion: m, state: { ...state } });
    emit('change', { state: { ...state } });
  }

  function startInterp() {
    const target = motions[state.motionIndex];
    if (!target) { playing = false; return; }
    if (target.kind === 'TOOL' || target.kind === 'SPINDLE' || target.kind === 'COOLANT' ||
        target.kind === 'NOTE' || target.kind === 'PAUSE' || target.kind === 'END') {
      applyMotionTarget(target);

      // M0 — program pause. Halts on this line; the next ▶ click resumes
      // from the *following* motion. Mirrors Kinetic Control's behaviour
      // and the legacy v0.4 standalone — see comment in pentacad-sim.html
      // line 1330 ("M0 = pause").
      if (target.kind === 'PAUSE') {
        playing = false; updatePlayBtn();
        setStatus('M0 — program paused · press ▶ to resume');
        showToast('M0 · paused');
        // advance pointer so resume picks up after the pause block
        if (state.motionIndex < motions.length - 1) state.motionIndex++;
        emit('pause', { reason: 'm0', motionIndex: state.motionIndex });
        return;
      }

      // M30 — program end. Like Kinetic Control: pressing ▶ starts the
      // program from line 1 again, so we rewind the pointer to 0 and
      // reset axis state before stopping.
      if (target.kind === 'END') {
        playing = false; updatePlayBtn();
        setStatus('M30 — program end · press ▶ to restart from line 1');
        showToast('M30 · program end');
        // rewind so the next ▶ click runs from the top
        state.motionIndex = 0;
        state.X = 0; state.Y = 0; state.Z = 25; state.A = 0; state.B = 0;
        state.F = 0; state.S = 0; state.T = 0;
        state.spindleOn = false; state.coolant = 'off';
        applyKinematics();
        renderDro();
        renderProgress();
        emit('stop', { reason: 'm30' });
        return;
      }
      if (state.motionIndex < motions.length - 1) {
        state.motionIndex++;
        startInterp();
      }
      return;
    }
    /** @type {SimState} */
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

  // ─── Panel queries ────────────────────────────────────────────────────────
  const droEl       = /** @type {HTMLElement} */ (dom.querySelector('[data-dro]'));
  const progressTextEl = /** @type {HTMLElement} */ (dom.querySelector('[data-progress-text]'));
  const progressBar = /** @type {HTMLElement} */ (dom.querySelector('[data-progress-bar]'));
  const gcodeEl     = /** @type {HTMLElement} */ (dom.querySelector('[data-gcode]'));
  const summaryEl   = /** @type {HTMLElement} */ (dom.querySelector('[data-summary]'));
  const tabGcodeEl   = /** @type {HTMLElement} */ (dom.querySelector('[data-tab-gcode]'));
  const tabSummaryEl = /** @type {HTMLElement} */ (dom.querySelector('[data-tab-summary]'));
  const filePillEl  = /** @type {HTMLElement} */ (dom.querySelector('[data-file-pill]'));
  const sidebarEl   = /** @type {HTMLElement} */ (dom.querySelector('[data-sidebar]'));
  const viewportEl  = /** @type {HTMLElement} */ (dom.querySelector('[data-viewport]'));
  const machineMenuEl = /** @type {HTMLElement} */ (dom.querySelector('[data-machine-menu]'));
  const machineLabelEl = /** @type {HTMLElement} */ (dom.querySelector('[data-machine-label]'));
  const statusEl    = /** @type {HTMLElement} */ (dom.querySelector('[data-status]'));
  const envWarnEl   = /** @type {HTMLElement} */ (dom.querySelector('[data-envelope-warning]'));
  const speedSlider = /** @type {HTMLInputElement} */ (dom.querySelector('[data-speed]'));
  const speedOut    = /** @type {HTMLElement} */ (dom.querySelector('[data-speed-out]'));
  const coordSvg    = /** @type {SVGElement} */ (dom.querySelector('[data-coord-svg]'));
  const dropOverlayEl = /** @type {HTMLElement} */ (dom.querySelector('[data-drop-overlay]'));
  const toastEl       = /** @type {HTMLElement} */ (dom.querySelector('[data-toast]'));

  function renderDro() {
    const f4 = (/** @type {number} */ n) => Number(n).toFixed(4);
    droEl.innerHTML = `
      <div style="display:flex; justify-content:space-between"><span>X:</span><span>${f4(state.X)}</span></div>
      <div style="display:flex; justify-content:space-between"><span>Y:</span><span>${f4(state.Y)}</span></div>
      <div style="display:flex; justify-content:space-between"><span>Z:</span><span>${f4(state.Z)}</span></div>
      <div style="display:flex; justify-content:space-between"><span>A:</span><span>${f4(state.A)}</span></div>
      <div style="display:flex; justify-content:space-between"><span>B:</span><span>${f4(state.B)}</span></div>
      <div style="display:flex; justify-content:space-between"><span>T:</span><span>${state.T}</span></div>
    `;
  }

  function renderProgress() {
    const total = motions.length || 1;
    const idx = state.motionIndex + 1;
    progressTextEl.textContent = `${idx} / ${total}`;
    progressBar.style.width = `${Math.min(100, (idx / total) * 100)}%`;
  }

  /**
   * Light-theme syntax highlighter: G/M codes blue, numeric tokens dark green,
   * comments grey. Run on each line at render time so motion clicks still
   * map back to the source line via `data-l`.
   *
   * @param {string} s
   * @returns {string}
   */
  function highlightGcode(s) {
    const escaped = escHtml(s);
    return escaped
      .replace(/(\([^)]*\))/g, `<span style="color:${PAL.gcodeCom}">$1</span>`)
      .replace(/(;.*$)/g, `<span style="color:${PAL.gcodeCom}">$1</span>`)
      .replace(/\b([GMgm]\d+(?:\.\d+)?)\b/g, `<span style="color:${PAL.gcodeKw}; font-weight:500">$1</span>`)
      .replace(/(?<![A-Za-z])([XYZAaBbIiJjKkFfSsTtHh]-?\d+(?:\.\d+)?)/g, `<span style="color:${PAL.gcodeNum}">$1</span>`);
  }

  /** @param {number} line */
  function highlightLine(line) {
    const lines = gcodeEl.querySelectorAll('.pt-gcode-line');
    lines.forEach(l => l.classList.remove('is-current'));
    const target = gcodeEl.querySelector(`[data-l="${line}"]`);
    if (target instanceof HTMLElement) {
      target.classList.add('is-current');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function renderGcode() {
    const src = (opts.params?.ngc || DEMO_NGC).split('\n');
    gcodeEl.innerHTML = src.map((s, i) =>
      `<div class="pt-gcode-line" data-l="${i + 1}">` +
      `<span class="pt-gcode-gutter">${i + 1}</span>` +
      `<span>${highlightGcode(s)}</span></div>`,
    ).join('');
    renderSummary();
  }

  /** Summary tab — rapid count, cut count, machine envelope summary. */
  function renderSummary() {
    let rapid = 0, cut = 0, arcs = 0, tool = 0, m0 = 0, m30 = 0;
    for (const m of motions) {
      if (m.kind === 'G0') rapid++;
      else if (m.kind === 'G1') cut++;
      else if (m.kind === 'G2' || m.kind === 'G3') arcs++;
      else if (m.kind === 'TOOL') tool++;
      else if (m.kind === 'PAUSE') m0++;
      else if (m.kind === 'END') m30++;
    }
    summaryEl.innerHTML = `
      <div>motions:    <b>${motions.length}</b></div>
      <div>rapids:     <b>${rapid}</b></div>
      <div>cuts:       <b>${cut}</b></div>
      <div>arcs:       <b>${arcs}</b></div>
      <div>tool ch:    <b>${tool}</b></div>
      <div>M0 pauses:  <b>${m0}</b></div>
      <div>M30 ends:   <b>${m30}</b></div>
      <div style="margin-top:10px; padding-top:8px; border-top:1px solid ${PAL.sidebarRule}">
        <div>machine: <b>${escHtml(machine.name)}</b></div>
        <div style="color:#666; font-size:12px; margin-top:2px">${escHtml(envelopeSummary(machine.id))}</div>
      </div>
    `;
  }

  // Click a G-code line → seek
  gcodeEl.addEventListener('click', (ev) => {
    const t = ev.target instanceof HTMLElement ? ev.target.closest('[data-l]') : null;
    if (!(t instanceof HTMLElement)) return;
    const line = Number(t.getAttribute('data-l'));
    if (!Number.isFinite(line)) return;
    seekToLine(line);
  });

  /** @param {number} line */
  function seekToLine(line) {
    let target = -1;
    for (let i = 0; i < motions.length; i++) {
      if (motions[i].line === line) { target = i; break; }
      if (motions[i].line > line) { target = Math.max(0, i - 1); break; }
    }
    if (target < 0) target = motions.length - 1;
    pause();
    state.motionIndex = target;
    interp = null;
    const m = motions[target];
    if (m) applyMotionTarget(m);
    applyKinematics();
    renderDro();
    renderProgress();
    setStatus(`seek · line ${line}`);
  }

  // Tab switching — GCODE | SUMMARY
  for (const tab of dom.querySelectorAll('.pt-tab')) {
    tab.addEventListener('click', () => {
      const which = /** @type {HTMLElement} */ (tab).getAttribute('data-tab');
      for (const t of dom.querySelectorAll('.pt-tab')) {
        const el = /** @type {HTMLElement} */ (t);
        const active = el.getAttribute('data-tab') === which;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      tabGcodeEl.style.display = which === 'gcode' ? 'flex' : 'none';
      tabSummaryEl.style.display = which === 'summary' ? 'block' : 'none';
      if (which === 'summary') renderSummary();
    });
  }

  /** @param {string} s */
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  /** @param {string[]} errs */
  function showEnvelopeWarning(errs) {
    envWarnEl.style.display = 'block';
    envWarnEl.innerHTML =
      `<b>envelope</b> · ${errs.slice(0, 3).map(escHtml).join(' · ')}`;
  }
  function hideEnvelopeWarning() { envWarnEl.style.display = 'none'; }

  /** @param {string} s */
  function setStatus(s) {
    statusEl.textContent = s;
  }

  /**
   * Show a transient toast — same UX as the legacy v0.4 toast() helper
   * (see pentacad-sim.html line 1227). Auto-fades after `ms`.
   *
   * @param {string} msg
   * @param {number} [ms]
   */
  let toastTimer = /** @type {number|null} */ (null);
  function showToast(msg, ms = 1800) {
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastEl.style.transform = 'translateX(-50%) translateY(0)';
    if (toastTimer != null) clearTimeout(toastTimer);
    toastTimer = /** @type {*} */ (setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(-50%) translateY(8px)';
    }, ms));
  }

  function updatePlayBtn() {
    const b = /** @type {HTMLButtonElement} */ (dom.querySelector('[data-act="play"]'));
    if (b) b.textContent = playing ? '⏸' : '▶';
  }

  // ─── Coordinate-system widget (camera-aligned RGB axes) ──────────────────
  // Bottom-left SVG that always shows the current camera-aligned XYZ frame.
  // Lightweight stand-in for the legacy ViewCube — same purpose: orient the
  // user during free trackball rotation.
  const COORD_AXES = [
    { dir: new THREE.Vector3(1, 0, 0), col: PAL.axisX, label: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), col: PAL.axisY, label: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), col: PAL.axisZ, label: 'Z' },
  ];
  function renderCoordWidget() {
    const m = camera.matrixWorldInverse;
    const parts = COORD_AXES.map(ax => {
      const v = ax.dir.clone().applyMatrix4(m).sub(new THREE.Vector3().applyMatrix4(m));
      // Z-flip + scale to fit -25..25 box (SVG y-down)
      return { x: v.x * 24, y: -v.y * 24, z: -v.z, col: ax.col, label: ax.label };
    });
    // Painter's order — back to front
    parts.sort((a, b) => a.z - b.z);
    coordSvg.innerHTML = parts.map(p =>
      `<line x1="0" y1="0" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}"
             stroke="${p.col}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="6.5" fill="${p.col}" />` +
      `<text x="${p.x.toFixed(2)}" y="${(p.y + 3).toFixed(2)}"
             fill="#FFFFFF" font-family="Roboto,sans-serif" font-size="8" font-weight="700"
             text-anchor="middle">${p.label}</text>`,
    ).join('');
  }

  // Chrome is always visible in the light Material-UI layout — no auto-hide.

  // ─── CHANGE MACHINE menu ──────────────────────────────────────────────────
  // Populated from listMachines() filtered to penta.json's _layout.canonical
  // array (the same 5 machines sim.pentamachine.com offers in v0.9.20).
  const CANONICAL_MACHINES = ['solo', 'v1', 'v1-kickstarter', 'v2-10', 'v2-50'];
  function renderMachineMenu() {
    const all = listMachines().filter(m => CANONICAL_MACHINES.includes(m.id));
    machineMenuEl.innerHTML = all.map(m =>
      `<div class="pt-machine-item${m.id === machine.id ? ' is-active' : ''}" data-machine-id="${m.id}">${escHtml(m.name)}</div>`,
    ).join('');
    for (const item of machineMenuEl.querySelectorAll('.pt-machine-item')) {
      item.addEventListener('click', () => {
        const id = /** @type {HTMLElement} */ (item).getAttribute('data-machine-id');
        if (id) setMachine(id);
        machineMenuEl.style.display = 'none';
      });
    }
  }
  const changeBtn = /** @type {HTMLButtonElement} */ (dom.querySelector('[data-act="change-machine"]'));
  changeBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const open = machineMenuEl.style.display !== 'none';
    if (!open) renderMachineMenu();
    machineMenuEl.style.display = open ? 'none' : 'block';
  });
  document.addEventListener('click', (ev) => {
    if (!(ev.target instanceof Node)) return;
    if (machineMenuEl.contains(ev.target) || changeBtn?.contains(ev.target)) return;
    machineMenuEl.style.display = 'none';
  });

  // ─── Drag-and-drop ────────────────────────────────────────────────────────
  // Drop targets: sidebar AND viewport (the overlay paints over both since it's
  // pinned to the widget root). Two file kinds are accepted:
  //   .ngc / .nc / .gcode / .tap / .txt → text-load via api.load(text)
  //   .glb / .gltf                       → swap kinematic GLB on the fly
  let dragDepth = 0;
  function isFileDrag(/** @type {DragEvent} */ ev) {
    const types = ev.dataTransfer?.types;
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }
  dom.addEventListener('dragenter', (/** @type {DragEvent} */ ev) => {
    if (!isFileDrag(ev)) return;
    ev.preventDefault();
    dragDepth++;
    dropOverlayEl.style.display = 'flex';
  });
  dom.addEventListener('dragover', (/** @type {DragEvent} */ ev) => {
    if (!isFileDrag(ev)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
  });
  dom.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlayEl.style.display = 'none';
  });
  dom.addEventListener('drop', async (/** @type {DragEvent} */ ev) => {
    ev.preventDefault();
    dragDepth = 0;
    dropOverlayEl.style.display = 'none';
    const f = ev.dataTransfer?.files?.[0];
    if (!f) return;
    const lower = (f.name || '').toLowerCase();
    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
      const url = URL.createObjectURL(f);
      try {
        const loader = new GLTFLoader();
        const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
        const root3 = /** @type {THREE.Object3D} */ (gltf.scene);
        if (bindGlbKinematics(root3)) {
          glbActive = true;
          showToast(`loaded model: ${f.name}`);
        } else {
          showToast(`${f.name}: missing x/y/z/a/b nodes`);
        }
      } catch (err) {
        showToast(`failed to load ${f.name}`);
        // eslint-disable-next-line no-console
        console.warn('[pentacad-simulator] dropped GLB load failed', err);
      } finally {
        URL.revokeObjectURL(url);
      }
      return;
    }
    if (/\.(ngc|nc|gcode|tap|txt)$/i.test(lower)) {
      try {
        const text = await readFileAsText(f);
        load(text);
        filePillEl.textContent = f.name;
        showToast(`loaded: ${f.name} · ${motions.length} motions`);
      } catch (err) {
        showToast(`failed to read ${f.name}`);
        // eslint-disable-next-line no-console
        console.warn('[pentacad-simulator] dropped NGC read failed', err);
      }
      return;
    }
    showToast(`unsupported file: ${f.name}`);
  });

  /** @param {File} file */
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('read failed'));
      r.readAsText(file);
    });
  }

  // ─── Controls ─────────────────────────────────────────────────────────────
  function play() {
    if (motions.length === 0) return;
    if (state.motionIndex >= motions.length - 1) reset();
    if (!interp) startInterp();
    playing = true;
    updatePlayBtn();
    setStatus('playing');
    emit('play', { motionIndex: state.motionIndex });
    // Bill the play gesture — modal-tier haiku because it's a UI handshake.
    opts.meter?.charge?.({
      widget: 'pentacad-simulator', method: 'play',
      tokensIn: 20, tokensOut: 4, modelTier: 'haiku',
    })?.catch?.(() => { /* meter unreachable in standalone */ });
  }
  function pause() {
    playing = false;
    updatePlayBtn();
    setStatus('paused');
    emit('pause', { motionIndex: state.motionIndex });
  }
  function stop() {
    playing = false;
    interp = null;
    state.motionIndex = 0;
    state.X = 0; state.Y = 0; state.Z = 25; state.A = 0; state.B = 0;
    state.F = 0; state.S = 0; state.T = 0;
    state.spindleOn = false; state.coolant = 'off';
    applyKinematics();
    renderDro();
    renderProgress();
    hideEnvelopeWarning();
    updatePlayBtn();
    setStatus('stopped');
    if (stockRemoval && stockRemovalEnabled) {
      stockRemoval.reset();
      stockRemoval.rebuildMesh();
    }
    emit('stop', { reason: 'manual' });
  }
  function reset() { stop(); }
  /** @param {number} [n] */
  function step(n = 1) {
    pause();
    for (let i = 0; i < n; i++) {
      if (state.motionIndex >= motions.length - 1) break;
      const m = motions[state.motionIndex];
      applyMotionTarget(m);
      state.motionIndex++;
    }
    applyKinematics();
    renderDro();
    renderProgress();
    setStatus(`step → motion ${state.motionIndex + 1}`);
  }
  /** @param {number} mult */
  function setSpeed(mult) {
    speed = Math.max(0.05, Math.min(16, mult));
    speedSlider.value = String(speed);
    speedOut.textContent = `${speed.toFixed(1)}×`;
  }
  /** @param {string} ngc */
  function load(ngc) {
    motions = parseNgc(ngc);
    opts.params = { ...(opts.params || {}), ngc };
    state.motionIndex = 0;
    interp = null;
    renderGcode();
    renderProgress();
    setStatus(`loaded · ${motions.length} motions`);
    opts.meter?.charge?.({
      widget: 'pentacad-simulator', method: 'load',
      tokensIn: 50, tokensOut: motions.length * 4, modelTier: 'haiku',
    })?.catch?.(() => { /* meter unreachable in standalone */ });
  }
  /**
   * Hot-swap the active machine. Used by the host app when the user picks a
   * different machine in `widgets/machine-picker.js`. Resets the env summary
   * and the header pill; the kinematic chain is unchanged (the procedural
   * fallback is shared, and a real GLB swap goes through bindGlbKinematics).
   *
   * @param {string} id
   */
  function setMachine(id) {
    const next = getMachine(id);
    if (!next) return;
    machine = next;
    machineLabelEl.textContent = machine.name;
    setStatus(`machine → ${machine.name}`);
    renderSummary();
  }

  // Wire buttons
  /** @type {Array<[string, EventListener]>} */
  const buttonHandlers = [
    ['play', () => playing ? pause() : play()],
    ['stop', () => stop()],
    ['step', () => step(1)],
    ['prev', () => {
      pause();
      state.motionIndex = Math.max(0, state.motionIndex - 1);
      const m = motions[state.motionIndex];
      if (m) applyMotionTarget(m);
      applyKinematics(); renderDro(); renderProgress();
    }],
    ['view-cube', () => {
      camera.position.set(180, 140, 220);
      camera.lookAt(0, 30, 0);
      controls.target.set(0, 30, 0);
      controls.update?.();
      showToast('view reset');
    }],
    ['screenshot', () => {
      try {
        const url = renderer.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url; a.download = 'pentacad-simulator.png';
        a.click();
      } catch (_) { showToast('screenshot failed'); }
    }],
    ['upload', () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.ngc,.nc,.gcode,.tap,.txt';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          const text = await readFileAsText(f);
          load(text);
          filePillEl.textContent = f.name;
          showToast(`loaded: ${f.name}`);
        } catch { showToast('failed to load'); }
      };
      inp.click();
    }],
    ['download', () => {
      const text = opts.params?.ngc || DEMO_NGC;
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filePillEl.textContent || 'sim.ngc';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }],
    ['export-zip', () => showToast('simulation ZIP — coming soon')],
    ['export-gcode', () => {
      const text = opts.params?.ngc || DEMO_NGC;
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filePillEl.textContent || 'sim.ngc';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }],
    ['export-model', () => showToast('model export — coming soon')],
    ['share', () => showToast('share — copy URL from address bar')],
    ['help', () => showToast('SPACE play/pause · S step · R reset · [/] speed')],
  ];
  for (const [act, fn] of buttonHandlers) {
    const b = dom.querySelector(`[data-act="${act}"]`);
    if (b) b.addEventListener('click', fn);
  }
  const onSpeed = () => setSpeed(Number(speedSlider.value));
  speedSlider.addEventListener('input', onSpeed);

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  // Per the prompt: SPACE = play/pause, S = step, R = reset, [ / ] = speed.
  // The legacy v0.4 standalone (line 3299) used Arrow←/→ for step and
  // Home/End for jump-to-extremes — those don't have an analogue in the
  // Suite-widget contract and are deliberately omitted.
  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    // Don't capture when typing into an input
    const t = ev.target;
    if (t instanceof HTMLElement && t.matches('input, textarea, [contenteditable]')) return;
    // Only react when the canvas / a panel inside our DOM has focus, OR the
    // event bubbles up from the document and the widget is in the viewport.
    if (!dom.contains(t instanceof Node ? t : null) && t !== document.body && t !== document.documentElement) return;
    switch (ev.key) {
      case ' ':
      case 'Spacebar':
        ev.preventDefault();
        if (playing) pause(); else play();
        break;
      case 's': case 'S':
        ev.preventDefault();
        step(1);
        break;
      case 'r': case 'R':
        ev.preventDefault();
        reset();
        break;
      case '[':
        ev.preventDefault();
        setSpeed(Math.max(0.1, +(speed - 0.25).toFixed(2)));
        showToast(`speed · ${speed.toFixed(1)}×`, 900);
        break;
      case ']':
        ev.preventDefault();
        setSpeed(Math.min(8, +(speed + 0.25).toFixed(2)));
        showToast(`speed · ${speed.toFixed(1)}×`, 900);
        break;
    }
  }
  document.addEventListener('keydown', onKey);

  // First paint
  renderGcode();
  renderDro();
  renderProgress();
  applyKinematics();
  updatePlayBtn();
  raf = requestAnimationFrame(animate);
  setStatus(`ready · ${motions.length} motions`);
  showToast('drop a .ngc here · or hit ▶', 2400);

  if (opts.params?.autoplay) play();

  // Keep `glbActive` referenced so eslint/tsc doesn't gripe — also exposed
  // for tests that might want to know whether the GLB took.
  void glbActive;

  return {
    api: {
      load,
      play,
      pause,
      stop,
      step,
      reset,
      setSpeed,
      setMachine,
      getState() { return { ...state }; },
      getDom() { return dom; },
      /** @param {boolean} on */
      setStockRemoval(on) {
        stockRemovalEnabled = !!on;
        if (!stockRemoval) return;
        if (stockRemovalEnabled) {
          stockRemoval.reset();
          stockRemoval.rebuildMesh();
          stockRemoval.showVoxels();
        } else {
          stockRemoval.showSolid();
        }
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      if (raf != null) cancelAnimationFrame(raf);
      if (hideTimer != null) clearTimeout(hideTimer);
      if (toastTimer != null) clearTimeout(toastTimer);
      document.removeEventListener('keydown', onKey);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      dom.remove();
    },
  };
}

// =========================================================================
// NGC parser — thin wrapper around shared/cam/modal-executor.js. The legacy
// v0.4 standalone shipped its own inline parser (window.CycleCAD.PentacadSim
// in pentacad-sim.html); the Suite has since centralised that logic into
// `shared/cam/modal-executor.js` so the simulator, post-processor and
// collision checker all replay the same event stream. We keep `parseNgc` as
// the public API the rest of the Suite imports — it's now a thin adapter
// that calls `executeProgram()` and translates ExecEvents into the SimMotion
// shape the simulator's interpolator wants.
// =========================================================================

/**
 * Parse a Kinetic-Control NGC stream into motion records the simulator can
 * play. Strips line numbers (`N###`), comments (`(...)`), and the `%`
 * markers (handled inside `modal-executor.js`). Returns a flat list — the
 * simulator advances index by index.
 *
 * @param {string} src
 * @returns {SimMotion[]}
 */
export function parseNgc(src) {
  const text = String(src || '');
  const { events } = executeProgram(text);
  const lines = text.split('\n');
  /** @type {SimMotion[]} */
  const out = [];

  /** @param {number} line */
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
        out.push({
          line, block, kind: 'SPINDLE',
          S: ev.mode === 'on' ? ev.rpm : 0,
        });
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
        // Modal/informational events surface as NOTE blocks so the G-code
        // panel still highlights them, but they don't drive interpolation.
        out.push({ line, block, kind: 'NOTE', text: blockOf(line) });
        break;
    }
  }
  return out;
}
