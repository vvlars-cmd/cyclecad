/**
 * @file widgets/pentacad-simulator.js
 * @description Pentacad's headline 5-axis kinematic simulator — Suite-widget
 *   wrapper around `shared/pentacad/engine.js` (pure logic) and
 *   `shared/pentacad/scene.js` (THREE rig). Builds the chrome verbatim from
 *   the legacy v0.4 standalone (https://cyclecad.com/app/pentacad-sim.html):
 *
 *   - dark `#1A2828` AppBar with logo + "Penta Simulator v0.9.20" + actions
 *   - 325 px white sidebar with GCODE / SUMMARY tabs, green active underline
 *   - centre viewport (canvas owned by scene.js)
 *   - floating DRO top-right with X/Y/Z/A/B/T 4-decimal mono readout
 *   - "Show Options" pill below the DRO
 *   - bottom-centre playback mini-bar (▶ / ⏮ / ⏭ / ■ + speed slider + scrubber)
 *   - bottom-right green CHANGE MACHINE button + dropdown menu
 *   - drag-and-drop NGC + GLB on the whole shell
 *
 *   Suite contract:
 *     export async function init(opts) {
 *       return { api, on, destroy };
 *     }
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { createEngine, MACHINES, parseNgc as parseNgcEngine } from '../shared/pentacad/engine.js';
import { createScene } from '../shared/pentacad/scene.js';

// ─── KC palette · light theme ────────────────────────────────────────────
const PAL = Object.freeze({
  appBarBg:    '#1A2828',
  appBarText:  '#D7DCDE',
  appBarTitle: '#FFFFFF',
  bodyBg:      '#F5F7F8',
  bodyText:    '#1F2529',
  pentaGreen:  '#15B573',
  greenDark:   '#0E8F5A',
  amber:       '#F5A623',
  red:         '#E04444',
  infoBlue:    '#2E90E8',
  tabInactive: '#5C6770',
  btnBg:       '#FFFFFF',
  btnBorder:   '#E3E7EA',
  btnText:     '#1F2529',
  sidebarBg:   '#FFFFFF',
  sidebarRule: '#E3E7EA',
  gutterText:  '#8A949D',
  gcodeKw:     '#1565C0',
  gcodeNum:    '#0E8F5A',
  gcodeCom:    '#8A949D',
  currentLine: 'rgba(21,181,115,0.18)',
  droBg:       '#FAFBFC',
  droBorder:   '#E3E7EA',
  vpBg:        '#F5F7F8',
  toastBg:     'rgba(51,51,51,0.95)',
  toastText:   '#FFFFFF',
});

const FONT_BODY  = '14px Roboto, Helvetica, Arial, sans-serif';
const FONT_MONO  = '12px Monaco, Menlo, "Source Code Pro", Consolas, monospace';
const FONT_BTN   = '500 13px Roboto, Helvetica, Arial, sans-serif';
const FONT_TITLE = '500 16px Roboto, Helvetica, Arial, sans-serif';

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Suite-widget entry point. Builds the chrome, instantiates the engine and
 * the scene, wires events both ways, and returns the public widget contract.
 *
 * @param {Object} [opts]
 * @returns {Promise<{api: Object, on: Function, destroy: Function}>}
 */
export async function init(opts = {}) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('pentacad-simulator: mount not found');

  // ─── Engine (pure logic) ─────────────────────────────────────────────────
  const engine = createEngine({
    machineId: opts.params?.machineId,
    ngc: opts.params?.ngc,
    speed: opts.params?.speed,
    persist: opts.params?.persist !== false,
  });

  /** @type {Record<string, Function[]>} */
  const widgetListeners = { play: [], pause: [], stop: [], step: [], change: [], line: [], envelope: [] };
  const widgetEmit = (ev, p) => {
    const fns = widgetListeners[ev] || [];
    for (const fn of fns) { try { fn(p); } catch (_) { /* swallow */ } }
  };
  // Forward engine events to widget listeners
  for (const ev of ['play', 'pause', 'stop', 'step', 'change', 'line', 'envelope']) {
    engine.on(ev, (p) => widgetEmit(ev, p));
  }

  // ─── DOM ─────────────────────────────────────────────────────────────────
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
      flex: 0 0 auto; min-width: 90px;
      background: transparent; border: none;
      color: ${PAL.tabInactive};
      font: ${FONT_BTN}; letter-spacing: .06em; text-transform: uppercase;
      padding: 14px 18px; cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: background-color 150ms ease, color 150ms ease;
    }
    .pt-pentacad-simulator .pt-tab:hover { background: rgba(0,0,0,0.04); }
    .pt-pentacad-simulator .pt-tab.is-active {
      color: ${PAL.pentaGreen};
      border-bottom-color: ${PAL.pentaGreen};
    }
    .pt-pentacad-simulator .pt-line {
      display: block; padding: 0 8px 0 56px; position: relative;
      min-height: 18px; white-space: pre; cursor: pointer;
    }
    .pt-pentacad-simulator .pt-line:hover { background: rgba(0,0,0,0.03); }
    .pt-pentacad-simulator .pt-line .pt-lno {
      position: absolute; left: 8px; width: 36px; text-align: right;
      color: ${PAL.gutterText}; user-select: none;
    }
    .pt-pentacad-simulator .pt-line.is-current { background: ${PAL.currentLine}; }
    .pt-pentacad-simulator .tok-g, .pt-pentacad-simulator .tok-m { color: #B92BBB; font-weight: 500; }
    .pt-pentacad-simulator .tok-n { color: ${PAL.gutterText}; }
    .pt-pentacad-simulator .tok-f, .pt-pentacad-simulator .tok-s { color: ${PAL.gcodeKw}; }
    .pt-pentacad-simulator .tok-t { color: #C5751F; }
    .pt-pentacad-simulator .tok-xyz { color: ${PAL.gcodeNum}; }
    .pt-pentacad-simulator .tok-abc { color: #199EA8; }
    .pt-pentacad-simulator .tok-cmt { color: ${PAL.gcodeCom}; font-style: italic; }
    .pt-pentacad-simulator .pt-mini-btn {
      width: 34px; height: 34px;
      display: inline-flex; align-items: center; justify-content: center;
      background: transparent; border: none; cursor: pointer;
      color: rgb(221,221,221); border-radius: 50%;
      transition: background-color 120ms, color 120ms;
    }
    .pt-pentacad-simulator .pt-mini-btn:hover { background: rgba(255,255,255,0.10); color: #fff; }
    .pt-pentacad-simulator .pt-green-pill {
      background: ${PAL.pentaGreen}; color: #FFFFFF;
      border: none; padding: 8px 18px; border-radius: 4px;
      font: ${FONT_BTN}; letter-spacing: .06em; text-transform: uppercase;
      cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      transition: background-color 150ms;
    }
    .pt-pentacad-simulator .pt-green-pill:hover { background: ${PAL.greenDark}; }
    .pt-pentacad-simulator .pt-machine-menu {
      position: absolute; right: 20px; bottom: 70px;
      background: #FFFFFF; color: ${PAL.bodyText};
      border: 1px solid ${PAL.btnBorder};
      border-radius: 4px; box-shadow: 0 5px 14px rgba(0,0,0,0.18);
      min-width: 180px; padding: 8px 0; z-index: 30;
      display: none;
    }
    .pt-pentacad-simulator .pt-machine-menu.is-open { display: block; }
    .pt-pentacad-simulator .pt-machine-menu button {
      display: block; width: 100%; padding: 10px 18px;
      background: transparent; border: none; text-align: left;
      font: ${FONT_BTN}; cursor: pointer; color: ${PAL.bodyText};
    }
    .pt-pentacad-simulator .pt-machine-menu button:hover { background: rgba(0,0,0,0.04); }
    .pt-pentacad-simulator .pt-machine-menu button.is-current {
      background: rgba(21,181,115,0.10); color: ${PAL.pentaGreen}; font-weight: 600;
    }
    .pt-pentacad-simulator .pt-options-btn {
      background: ${PAL.btnBg}; color: ${PAL.btnText};
      border: 1px solid ${PAL.btnBorder};
      border-radius: 4px; padding: 6px 16px;
      font: ${FONT_BTN}; cursor: pointer;
      box-shadow: 0 1px 2px rgba(0,0,0,0.12);
    }
    .pt-pentacad-simulator .pt-options-btn:hover { background: #EFEFEF; }
    .pt-pentacad-simulator .pt-dropzone {
      position: absolute; inset: 0;
      background: rgba(21,181,115,0.10);
      border: 4px dashed ${PAL.pentaGreen};
      display: none; align-items: center; justify-content: center;
      z-index: 9800; font: ${FONT_TITLE}; color: ${PAL.greenDark};
      pointer-events: none;
    }
    .pt-pentacad-simulator .pt-dropzone.is-active { display: flex; }
    .pt-pentacad-simulator .pt-toast {
      position: absolute; left: 50%; bottom: 90px;
      transform: translateX(-50%);
      background: ${PAL.toastBg}; color: ${PAL.toastText};
      padding: 10px 18px; border-radius: 4px;
      font: ${FONT_BODY}; font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.30);
      opacity: 0; transition: opacity 200ms ease;
      pointer-events: none; z-index: 90;
    }
    .pt-pentacad-simulator .pt-toast.is-visible { opacity: 1; }
  `;
  dom.appendChild(styleEl);

  // ─── AppBar ─────────────────────────────────────────────────────────────
  const appbar = document.createElement('header');
  appbar.style.cssText = `
    grid-column: 1 / span 2; grid-row: 1;
    background: ${PAL.appBarBg}; color: ${PAL.appBarText};
    display: flex; align-items: center; gap: 14px;
    padding: 0 24px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.20);
    z-index: 5;
  `;
  appbar.innerHTML = `
    <a href="https://www.pentamachine.com" target="_blank" rel="noopener" style="display:flex;align-items:center;text-decoration:none;color:#fff" title="Penta Machine">
      <svg viewBox="0 0 60 70" width="32" height="38" fill="white" aria-hidden="true">
        <polygon points="30,4 56,22 47,52 13,52 4,22" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
        <polygon points="30,16 47,28 41,46 19,46 13,28" fill="white" opacity="0.82"/>
      </svg>
    </a>
    <h1 style="margin:0;font:${FONT_TITLE};color:${PAL.appBarTitle};flex:1">Penta Simulator v0.9.20</h1>
    <div data-actions style="display:flex;align-items:center;gap:0">
      <button class="pt-appbar-btn" data-action="zip" title="Open simulation ZIP archive">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V8h14v10zm-7-1l4-4h-3V9h-2v4H8l4 4z"/></svg>
        Simulation Zip
      </button>
      <button class="pt-appbar-btn" data-action="gcode" title="Open G-code (Cmd/Ctrl+O)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V8h14v10zm-7-1l4-4h-3V9h-2v4H8l4 4z"/></svg>
        GCode
      </button>
      <button class="pt-appbar-btn" data-action="model" title="Open machine GLB">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V8h14v10zm-7-1l4-4h-3V9h-2v4H8l4 4z"/></svg>
        Model
      </button>
      <button class="pt-icon-btn" data-action="share" title="Copy shareable link">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92S19.61 16.08 18 16.08z"/></svg>
      </button>
      <button class="pt-icon-btn" data-action="help" title="Help / shortcuts">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>
      </button>
    </div>
  `;
  dom.appendChild(appbar);

  // ─── Sidebar (GCODE / SUMMARY) ───────────────────────────────────────────
  const sidebar = document.createElement('aside');
  sidebar.style.cssText = `
    grid-column: 1; grid-row: 2;
    background: ${PAL.sidebarBg};
    border-right: 1px solid ${PAL.sidebarRule};
    display: flex; flex-direction: column;
    min-height: 0; overflow: hidden;
  `;
  sidebar.innerHTML = `
    <div data-tabs style="display:flex;border-bottom:1px solid ${PAL.sidebarRule};background:#FAFBFC">
      <button class="pt-tab is-active" data-tab="gcode">GCODE</button>
      <button class="pt-tab" data-tab="summary">SUMMARY</button>
    </div>
    <div data-pane-gcode style="flex:1;overflow:auto;min-height:0;font:${FONT_MONO}">
      <pre data-editor style="margin:0;padding:6px 0 200px 0;white-space:pre"></pre>
    </div>
    <div data-pane-summary hidden style="flex:1;overflow:auto;min-height:0;padding:14px 18px;font:${FONT_BODY}">
      <div data-summary></div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-top:1px solid ${PAL.sidebarRule}">
      <input data-filename type="text" value="sim.ngc" disabled
        style="flex:1;height:32px;padding:0 8px;background:transparent;border:none;font:${FONT_BODY};color:${PAL.bodyText}" />
      <button data-action="download" style="background:transparent;border:none;cursor:pointer;color:${PAL.tabInactive};padding:6px;border-radius:50%" title="Download G-code">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
      </button>
    </div>
  `;
  dom.appendChild(sidebar);

  // ─── Viewport (canvas + DRO + playback bar + CHANGE MACHINE) ─────────────
  const viewport = document.createElement('section');
  viewport.style.cssText = `
    grid-column: 2; grid-row: 2;
    position: relative; overflow: hidden;
    background: ${PAL.vpBg};
  `;
  viewport.innerHTML = `
    <div data-canvas-host style="position:absolute;inset:0"></div>

    <!-- DRO -->
    <div data-dro style="position:absolute;top:20px;right:20px;background:rgba(100,100,100,0.75);color:#FFF;border-radius:10px;padding:10px;z-index:11;font:${FONT_MONO};font-size:13px;line-height:16px;letter-spacing:0.02em;min-width:120px">
      <div style="display:flex;gap:6px"><span style="width:16px">X:</span><span data-dro-x style="min-width:60px;text-align:right">0.0000</span></div>
      <div style="display:flex;gap:6px"><span style="width:16px">Y:</span><span data-dro-y style="min-width:60px;text-align:right">0.0000</span></div>
      <div style="display:flex;gap:6px"><span style="width:16px">Z:</span><span data-dro-z style="min-width:60px;text-align:right">0.0000</span></div>
      <div style="display:flex;gap:6px"><span style="width:16px">A:</span><span data-dro-a style="min-width:60px;text-align:right">0.0000</span></div>
      <div style="display:flex;gap:6px"><span style="width:16px">B:</span><span data-dro-b style="min-width:60px;text-align:right">0.0000</span></div>
      <div style="display:flex;gap:6px"><span style="width:16px">T:</span><span data-dro-t style="min-width:60px;text-align:right">0</span></div>
    </div>

    <!-- Show Options pill -->
    <button class="pt-options-btn" data-action="options"
      style="position:absolute;top:200px;right:20px;z-index:11">Show Options</button>

    <!-- Playback mini-bar (bottom-centre) -->
    <div data-controls style="position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:670px;max-width:calc(100% - 80px);background:rgba(100,100,100,0.75);color:#FFF;border-radius:5px;padding:6px 12px 8px 12px;z-index:11">
      <div style="display:flex;align-items:center;gap:0;height:36px">
        <button class="pt-mini-btn" data-action="jump-start" title="Jump to start">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="pt-mini-btn" data-action="step-back" title="Step back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        </button>
        <button class="pt-mini-btn" data-action="play" title="Play / pause (Space)">
          <svg data-play-icon viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <button class="pt-mini-btn" data-action="stop" title="Stop">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
        </button>
        <button class="pt-mini-btn" data-action="step" title="Step">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
        </button>
        <button class="pt-mini-btn" data-action="jump-end" title="Jump to end">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>
        </button>
        <div style="display:inline-flex;align-items:center;gap:6px;margin-left:8px">
          <span data-speed-val style="width:36px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px">1.00</span>
          <input data-speed type="range" min="0.1" max="10" step="0.1" value="1"
            style="width:110px;height:4px" />
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;height:32px">
        <span data-elapsed style="width:60px;text-align:left;font-variant-numeric:tabular-nums;font-size:12px">00:00:00</span>
        <input data-scrub type="range" min="0" max="1000" step="1" value="0" style="flex:1;height:4px" />
      </div>
    </div>

    <!-- CHANGE MACHINE pill (bottom-right) -->
    <button class="pt-green-pill" data-action="change-machine"
      style="position:absolute;right:20px;bottom:20px;height:37px;min-width:166px;z-index:11">Change Machine</button>
    <div class="pt-machine-menu" data-machine-menu>
      ${Object.values(MACHINES).map(m =>
        `<button data-machine-id="${m.id}">${escHtml(m.label)}</button>`
      ).join('')}
    </div>

    <!-- Drop zone -->
    <div class="pt-dropzone" data-dropzone>Drop your .ngc / .nc / .gcode here</div>

    <!-- Toast -->
    <div class="pt-toast" data-toast role="status" aria-live="polite"></div>
  `;
  dom.appendChild(viewport);
  root.appendChild(dom);

  // ─── Wire up scene ───────────────────────────────────────────────────────
  const canvasHost = viewport.querySelector('[data-canvas-host]');
  const scene3 = createScene({
    canvasHost,
    machine: engine.app.machine,
    glbUrl: opts.params?.glbUrl,
  });

  // ─── Sidebar wiring ──────────────────────────────────────────────────────
  const editorEl   = sidebar.querySelector('[data-editor]');
  const summaryEl  = sidebar.querySelector('[data-summary]');
  const filenameEl = sidebar.querySelector('[data-filename]');
  const tabsEl     = sidebar.querySelector('[data-tabs]');
  const paneG      = sidebar.querySelector('[data-pane-gcode]');
  const paneS      = sidebar.querySelector('[data-pane-summary]');

  function renderEditor() {
    const text = engine.app.gcode || '';
    const lines = text.split(/\r?\n/);
    const html = lines.map((raw, i) => {
      const ln = i + 1;
      let body = raw;
      const commentParts = [];
      body = body.replace(/\([^)]*\)/g, m => { commentParts.push(m); return ''; });
      let semiCmt = '';
      const semi = body.indexOf(';');
      if (semi >= 0) { semiCmt = body.slice(semi); body = body.slice(0, semi); }
      const tokenised = escHtml(body).replace(/([A-Z])\s*([-+]?\d*\.?\d+)/g, (m, letter, value) => {
        let cls = 'tok-xyz';
        if (letter === 'G') cls = 'tok-g';
        else if (letter === 'M') cls = 'tok-m';
        else if (letter === 'N') cls = 'tok-n';
        else if (letter === 'F') cls = 'tok-f';
        else if (letter === 'S') cls = 'tok-s';
        else if (letter === 'T') cls = 'tok-t';
        else if (letter === 'A' || letter === 'B' || letter === 'C') cls = 'tok-abc';
        return `<span class="${cls}">${letter}${value}</span>`;
      });
      const cmtHtml = commentParts.map(c => `<span class="tok-cmt">${escHtml(c)}</span>`).join('');
      const semiHtml = semiCmt ? `<span class="tok-cmt">${escHtml(semiCmt)}</span>` : '';
      return `<span class="pt-line" data-ln="${ln}"><span class="pt-lno">${ln}</span>${tokenised}${cmtHtml}${semiHtml}</span>`;
    });
    editorEl.innerHTML = html.join('\n');
  }

  function renderSummary() {
    const m = engine.app.machine;
    summaryEl.innerHTML = `
      <h3 style="margin:0 0 8px 0;font:${FONT_TITLE}">${escHtml(m.label)}</h3>
      <div style="color:${PAL.tabInactive};font-size:12px">Machine envelope (in)</div>
      <div style="font:${FONT_MONO};margin:4px 0 12px 0">
        X: [${m.envelope.x[0]}, ${m.envelope.x[1]}]<br/>
        Y: [${m.envelope.y[0]}, ${m.envelope.y[1]}]<br/>
        Z: [${m.envelope.z[0]}, ${m.envelope.z[1]}]<br/>
        A: [${m.envelope.a[0]}, ${m.envelope.a[1]}]<br/>
        B: [${m.envelope.b[0]}, ${m.envelope.b[1]}]
      </div>
      <div style="color:${PAL.tabInactive};font-size:12px">Stock (in)</div>
      <div style="font:${FONT_MONO};margin:4px 0 12px 0">
        ${m.stock.x} × ${m.stock.y} × ${m.stock.z}
      </div>
      <div style="color:${PAL.tabInactive};font-size:12px">Motions</div>
      <div style="font:${FONT_MONO};margin:4px 0">${engine.motions.length}</div>
    `;
  }

  function highlightLine(line) {
    const prev = editorEl.querySelector('.pt-line.is-current');
    if (prev) prev.classList.remove('is-current');
    const next = editorEl.querySelector(`.pt-line[data-ln="${line}"]`);
    if (next) {
      next.classList.add('is-current');
      const r = next.getBoundingClientRect();
      const pr = paneG.getBoundingClientRect();
      if (r.top < pr.top || r.bottom > pr.bottom) {
        next.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }
  }

  // Tab switching
  tabsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.pt-tab');
    if (!btn) return;
    const tab = btn.getAttribute('data-tab');
    tabsEl.querySelectorAll('.pt-tab').forEach(b => b.classList.toggle('is-active', b === btn));
    if (tab === 'gcode') {
      paneG.hidden = false; paneS.hidden = true;
    } else {
      paneG.hidden = true; paneS.hidden = false;
      renderSummary();
    }
  });

  // Click line → seek
  editorEl.addEventListener('click', (ev) => {
    const lineEl = ev.target.closest('.pt-line');
    if (!lineEl) return;
    const ln = parseInt(lineEl.getAttribute('data-ln'), 10);
    const idx = engine.motions.findIndex(m => m.line === ln);
    if (idx >= 0) engine.seek(idx);
  });

  renderEditor();
  renderSummary();

  // ─── DRO ─────────────────────────────────────────────────────────────────
  const droX = viewport.querySelector('[data-dro-x]');
  const droY = viewport.querySelector('[data-dro-y]');
  const droZ = viewport.querySelector('[data-dro-z]');
  const droA = viewport.querySelector('[data-dro-a]');
  const droB = viewport.querySelector('[data-dro-b]');
  const droT = viewport.querySelector('[data-dro-t]');
  function fmt(n) { return (Number.isFinite(n) ? n : 0).toFixed(4); }
  function renderDro() {
    const s = engine.state;
    droX.textContent = fmt(s.X);
    droY.textContent = fmt(s.Y);
    droZ.textContent = fmt(s.Z);
    droA.textContent = fmt(s.A);
    droB.textContent = fmt(s.B);
    droT.textContent = String(s.T | 0);
  }
  renderDro();

  // ─── Playback bar wiring ─────────────────────────────────────────────────
  const playIcon  = viewport.querySelector('[data-play-icon]');
  const speedVal  = viewport.querySelector('[data-speed-val]');
  const speedSlider = viewport.querySelector('[data-speed]');
  const scrubSlider = viewport.querySelector('[data-scrub]');

  function updatePlayIcon() {
    const isPlaying = engine.app.playing;
    playIcon.innerHTML = isPlaying
      ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
  }
  function updateScrub() {
    const total = Math.max(1, engine.motions.length - 1);
    const pct = (engine.state.motionIndex / total) * 1000;
    scrubSlider.value = String(Math.round(pct));
  }

  speedSlider.addEventListener('input', () => {
    const v = Number(speedSlider.value);
    engine.setSpeed(v);
    speedVal.textContent = engine.app.speed.toFixed(2);
  });
  scrubSlider.addEventListener('input', () => {
    const total = engine.motions.length - 1;
    const idx = Math.round((Number(scrubSlider.value) / 1000) * total);
    engine.seek(idx);
  });

  viewport.querySelector('[data-action="play"]').addEventListener('click', () => {
    if (engine.app.playing) engine.pause(); else engine.play();
  });
  viewport.querySelector('[data-action="stop"]').addEventListener('click', () => engine.stop());
  viewport.querySelector('[data-action="step"]').addEventListener('click', () => engine.step(1));
  viewport.querySelector('[data-action="step-back"]').addEventListener('click', () => {
    engine.seek(Math.max(0, engine.state.motionIndex - 1));
  });
  viewport.querySelector('[data-action="jump-start"]').addEventListener('click', () => engine.stop());
  viewport.querySelector('[data-action="jump-end"]').addEventListener('click', () => {
    engine.seek(engine.motions.length - 1);
  });
  viewport.querySelector('[data-action="options"]').addEventListener('click', (ev) => {
    const btn = ev.currentTarget;
    btn.classList.toggle('is-open');
    showToast('Options panel');
  });

  // ─── CHANGE MACHINE menu ─────────────────────────────────────────────────
  const machineMenu = viewport.querySelector('[data-machine-menu]');
  function refreshMachineMenu() {
    machineMenu.querySelectorAll('button').forEach(b => {
      b.classList.toggle('is-current', b.getAttribute('data-machine-id') === engine.app.machineId);
    });
  }
  refreshMachineMenu();

  viewport.querySelector('[data-action="change-machine"]').addEventListener('click', (ev) => {
    ev.stopPropagation();
    machineMenu.classList.toggle('is-open');
  });
  machineMenu.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-machine-id]');
    if (!btn) return;
    const id = btn.getAttribute('data-machine-id');
    engine.setMachine(id);
    machineMenu.classList.remove('is-open');
  });
  document.addEventListener('click', (ev) => {
    if (!viewport.contains(ev.target)) machineMenu.classList.remove('is-open');
  });

  // ─── AppBar action wiring ────────────────────────────────────────────────
  appbar.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'gcode') openFileChooser('.ngc,.nc,.gcode,.tap,.txt', 'text');
    else if (action === 'model') openFileChooser('.glb,.gltf', 'glb');
    else if (action === 'zip') openFileChooser('.zip', 'zip');
    else if (action === 'share') {
      try {
        navigator.clipboard?.writeText(window.location.href);
        showToast('link copied');
      } catch (_) { /* ignore */ }
    } else if (action === 'help') {
      showToast('Pentacad Sim · Space play · arrows step · drop .ngc to load', 3500);
    }
  });

  function openFileChooser(accept, kind) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) handleFile(file, kind);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  async function handleFile(file, kind) {
    if (kind === 'text' || /\.(ngc|nc|gcode|tap|txt)$/i.test(file.name)) {
      const txt = await readFileAsText(file);
      engine.load(txt, file.name);
      filenameEl.value = file.name;
      renderEditor();
      renderSummary();
      showToast(`loaded ${file.name}`);
      engine.play();
    } else if (kind === 'glb' || /\.(glb|gltf)$/i.test(file.name)) {
      const url = URL.createObjectURL(file);
      try {
        const fakeMachine = { ...engine.app.machine, glbUrls: [url] };
        await scene3.setMachine(fakeMachine);
        showToast(`model swapped: ${file.name}`);
      } catch (e) {
        showToast('failed to load model');
      }
    }
  }
  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('read failed'));
      r.readAsText(file);
    });
  }

  // ─── Drag-and-drop ───────────────────────────────────────────────────────
  const dropzone = viewport.querySelector('[data-dropzone]');
  dom.addEventListener('dragenter', (ev) => { ev.preventDefault(); dropzone.classList.add('is-active'); });
  dom.addEventListener('dragover',  (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
  dom.addEventListener('dragleave', (ev) => {
    if (ev.target === dropzone || ev.target === dom) dropzone.classList.remove('is-active');
  });
  dom.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    dropzone.classList.remove('is-active');
    const f = ev.dataTransfer?.files?.[0];
    if (!f) return;
    if (/\.(ngc|nc|gcode|tap|txt)$/i.test(f.name)) handleFile(f, 'text');
    else if (/\.(glb|gltf)$/i.test(f.name))      handleFile(f, 'glb');
    else showToast(`unsupported file: ${f.name}`);
  });

  // ─── Toast ───────────────────────────────────────────────────────────────
  const toastEl = viewport.querySelector('[data-toast]');
  let toastTimer = null;
  function showToast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), ms);
  }

  // ─── Render loop (drives engine.tick + scene.applyKinematics + DRO) ──────
  let raf = null;
  let lastTickMs = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = lastTickMs ? Math.min(50, now - lastTickMs) : 16;
    lastTickMs = now;
    engine.tick(dt);
    scene3.applyKinematics(engine.state);
    renderDro();
    updateScrub();
  }
  raf = requestAnimationFrame(loop);

  // ─── Engine event hooks ──────────────────────────────────────────────────
  engine.on('line', (p) => { highlightLine(p.line); });
  engine.on('play', () => updatePlayIcon());
  engine.on('pause', () => updatePlayIcon());
  engine.on('stop', () => updatePlayIcon());
  engine.on('change', (p) => {
    if (p && p.kind === 'machine') {
      refreshMachineMenu();
      renderSummary();
      ;(async () => {
        try { await scene3.setMachine(engine.app.machine); }
        catch (_) { /* ok */ }
      })();
    }
    if (p && p.kind === 'load') {
      filenameEl.value = engine.app.filename;
      renderEditor();
      renderSummary();
    }
    if (p && p.kind === 'speed') {
      speedSlider.value = String(engine.app.speed);
      speedVal.textContent = engine.app.speed.toFixed(2);
    }
  });

  // ─── Keyboard ────────────────────────────────────────────────────────────
  function onKey(ev) {
    if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName || '')) return;
    if (ev.key === ' ') {
      ev.preventDefault();
      if (engine.app.playing) engine.pause(); else engine.play();
    } else if (ev.key === 'ArrowRight') {
      engine.step(1);
    } else if (ev.key === 'ArrowLeft') {
      engine.seek(Math.max(0, engine.state.motionIndex - 1));
    } else if (ev.key === 'Home') {
      engine.stop();
    } else if (ev.key === 'End') {
      engine.seek(engine.motions.length - 1);
    } else if (ev.key === 'Escape') {
      machineMenu.classList.remove('is-open');
    }
  }
  document.addEventListener('keydown', onKey);

  // Charge the meter for boot if available
  try {
    opts.meter?.charge?.({
      widget: 'pentacad-simulator', method: 'init',
      tokensIn: 40, tokensOut: 8, modelTier: 'haiku',
    })?.catch?.(() => {});
  } catch (_) { /* ignore */ }

  showToast('drop a .ngc here · or hit play', 2400);
  if (opts.params?.autoplay) engine.play();

  // ─── Public API ──────────────────────────────────────────────────────────
  const api = {
    load: (ngc, filename) => engine.load(ngc, filename),
    play: () => engine.play(),
    pause: () => engine.pause(),
    stop: () => engine.stop(),
    step: (n) => engine.step(n),
    setSpeed: (m) => engine.setSpeed(m),
    setMachine: (id) => engine.setMachine(id),
    seek: (idx) => engine.seek(idx),
    getState: () => engine.getState(),
    getDom: () => dom,
    getEngine: () => engine,
    getScene: () => scene3,
  };

  function destroy() {
    if (raf != null) cancelAnimationFrame(raf);
    if (toastTimer) clearTimeout(toastTimer);
    document.removeEventListener('keydown', onKey);
    scene3.destroy();
    engine.destroy();
    if (dom.parentElement) dom.parentElement.removeChild(dom);
  }

  return {
    api,
    on(event, fn) {
      if (!widgetListeners[event]) widgetListeners[event] = [];
      widgetListeners[event].push(fn);
    },
    destroy,
  };
}

/**
 * Re-export of the engine's NGC parser, kept for back-compat with anything
 * that used to import `parseNgc` from this widget directly.
 */
export const parseNgc = parseNgcEngine;
