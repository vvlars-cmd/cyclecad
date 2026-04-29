/**
 * @file widgets/pentacad-v1.js
 * @description Single-widget wrapper around the canonical Pentacad simulator
 *   v0.4 (https://cyclecad.com/app/pentacad-sim.html).
 *
 *   This widget does NOT re-implement the simulator. It fetches the canonical
 *   v1 source — which Sachin maintains as a 3,420-line standalone HTML and
 *   has hand-tuned to match sim.pentamachine.com — and inlines its <style>,
 *   <body> markup, demo G-code, and module script verbatim into the host
 *   page. Asset URLs (GLBs, the pentacad-sim.js library, the viewcube model)
 *   are rewritten to absolute https://cyclecad.com/app/... URLs so they
 *   resolve regardless of where the wrapper is mounted.
 *
 *   The previous Suite-native rewrite (`pentacad-simulator.js` + the lego
 *   split under `shared/pentacad/`) drifted from v1 behavior on every
 *   iteration: scale bugs, palette bugs, kinematics bugs. The lesson logged
 *   in HANDOVER-PENTACAD-V2.md is "don't reinterpret v1 — copy it". This
 *   wrapper enforces that by treating v1 as the single source of truth.
 *
 *   Suite contract:
 *     export async function init(opts) {
 *       return { api, on, destroy };
 *     }
 *
 *   Host requirements
 *   -----------------
 *   The host page MUST declare a `<script type="importmap">` with `three`
 *   and `three/addons/` mapped to a Three.js r170-compatible CDN before
 *   this widget mounts. The wrapper injects a fallback importmap if none
 *   is present, but importmaps must come before any module that uses them
 *   — so a fallback only works on hosts that haven't started any module
 *   scripts yet.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

/* v0_5 query is a soft cache-bust — when v1 ships with new chrome (Monaco
   editor, tutorial overlay, future-only time-window mode, feed/rapid colour
   pickers, smooth-camera toggle) we want the wrapper to re-fetch rather
   than serve a Penta-stale cached copy. Bump on every meaningful v1 update. */
const V1_URL  = 'https://cyclecad.com/app/pentacad-sim.html?v=v0_5_3';
const V1_BASE = 'https://cyclecad.com/app';

const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Source+Code+Pro:wght@400;500&display=swap';

/* Idempotency sentinels — lookup data attributes / IDs on the document so
   repeat init() calls don't re-inject head deps. */
const SENTINELS = Object.freeze({
  importMap: 'data-pentacad-v1-importmap',
  fonts:     'data-pentacad-v1-fonts',
  lib:       'data-pentacad-v1-lib',
  style:     'data-pentacad-v1-style',
  override:  'data-pentacad-v1-override',
  module:    'data-pentacad-v1-module',
});

/* Runtime singletons. The v1 module script does global side-effects
   (window.PentacadSimApp, window.CycleCAD.PentacadSim) and runs its
   `boot()` exactly once. Re-mounting the widget detaches the previous
   DOM but does NOT re-run boot — single-instance lifecycle, matching
   the iframe semantics this wrapper replaces. */
let v1FetchPromise = null;   // cached fetch+parse
let v1Booted = false;        // module script injected once

/**
 * @typedef {Object} PentacadV1Opts
 * @property {string|HTMLElement} mount  Host element. Will receive the v1 DOM.
 * @property {string} [app]              Suite app id (forwarded by loader).
 * @property {Object} [meter]            Token meter (forwarded by loader).
 * @property {Object} [params]           Reserved.
 *
 * @typedef {Object} PentacadV1Handle
 * @property {{ getApp: () => Object|null }} api
 * @property {(event: string, fn: Function) => void} on
 * @property {() => void} destroy
 */

/**
 * @param {PentacadV1Opts} opts
 * @returns {Promise<PentacadV1Handle>}
 */
export async function init(opts) {
  const root = typeof opts?.mount === 'string'
    ? document.querySelector(opts.mount)
    : opts?.mount;
  if (!root) throw new Error('pentacad-v1: mount not found');

  /* 1. Fetch + parse v1 source (cached). */
  const v1 = await fetchV1();

  /* 2. Inject head deps — order matters for module script execution.
     Importmap MUST be in <head> before our module script tag is appended. */
  ensureImportMap();
  ensureFonts();
  ensureStyle(v1.styleCss);
  ensureOverrideStyle();
  await ensureLibraryScript();   /* sets window.CycleCAD.PentacadSim */

  /* 3. Build the v1 DOM into the mount, wrapped so our position-override
     scope (.pt-widget-root) takes effect. */
  const widgetRoot = document.createElement('div');
  widgetRoot.className = 'pt-widget-root';
  widgetRoot.innerHTML = v1.bodyHtml;
  root.appendChild(widgetRoot);

  /* 4. Demo G-code lives in a <script id="demo-gcode" type="text/plain">
     element that boot() reads via $('demo-gcode'). It must be in the
     document before boot runs. */
  const demoEl = document.createElement('script');
  demoEl.id = 'demo-gcode';
  demoEl.type = 'text/plain';
  demoEl.textContent = v1.demoGcode;
  widgetRoot.appendChild(demoEl);

  /* 5. Inject the v1 module script — once per page. boot() runs at the
     bottom of the source and uses document.getElementById(...) to find
     the DOM we just mounted. */
  if (!v1Booted) {
    injectV1Module(v1.moduleSource);
    v1Booted = true;
  }

  /* 6. Wait for boot() to publish the live app handle. */
  const app = await waitForApp();

  return {
    api: {
      getApp: () => window.PentacadSimApp || null,
    },
    on() {
      /* Suite lifecycle events not yet wired — v1 has no event bus and
         retro-fitting one would require touching the source we explicitly
         do not want to touch. */
    },
    destroy() {
      widgetRoot.remove();
      /* Boot globals (window.PentacadSimApp, window.CycleCAD.PentacadSim)
         intentionally remain — the v1 module script ran exactly once and
         is not re-runnable. A subsequent init() call will need a hard
         refresh of the host page. */
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
   v1 source fetch + parse
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Fetch the canonical v1 HTML and extract the four pieces this wrapper
 * needs. Memoised so repeat init() calls don't re-download.
 *
 * @returns {Promise<{ styleCss: string, bodyHtml: string, demoGcode: string, moduleSource: string }>}
 */
function fetchV1() {
  if (v1FetchPromise) return v1FetchPromise;
  v1FetchPromise = (async () => {
    const res = await fetch(V1_URL, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`pentacad-v1: fetch ${V1_URL} → ${res.status}`);
    const html = await res.text();
    return extractV1(html);
  })();
  return v1FetchPromise;
}

/**
 * Parse the v1 HTML and pull out the four parts we inline into the host:
 *   - styleCss     contents of the single <style> block in <head>
 *   - bodyHtml     full <body> innerHTML, minus <script> children
 *   - demoGcode    the <script id="demo-gcode" type="text/plain"> body
 *   - moduleSource the <script type="module"> body, with asset URLs
 *                  rewritten to absolute https://cyclecad.com/app/...
 *
 * @param {string} html
 */
function extractV1(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const styleEl = doc.querySelector('head style');
  if (!styleEl) throw new Error('pentacad-v1: no <style> in v1 source');
  const styleCss = styleEl.textContent || '';

  const demoEl = doc.querySelector('script#demo-gcode');
  const demoGcode = (demoEl?.textContent || '').replace(/^\s+|\s+$/g, '');

  const moduleEl = [...doc.querySelectorAll('script')]
    .find((s) => s.getAttribute('type') === 'module');
  if (!moduleEl) throw new Error('pentacad-v1: no module <script> in v1 source');
  const moduleSource = rewriteAssetUrls(moduleEl.textContent || '');

  /* Body HTML, minus <script> children (we inject those ourselves). */
  const bodyClone = doc.body.cloneNode(true);
  bodyClone.querySelectorAll('script').forEach((n) => n.remove());
  const bodyHtml = bodyClone.innerHTML;

  return { styleCss, bodyHtml, demoGcode, moduleSource };
}

/**
 * Rewrite asset URLs that are relative to the v1's own location so they
 * resolve from any host. v1 uses two relative-path conventions:
 *   - `./models/<id>.glb`  →  https://cyclecad.com/app/models/<id>.glb
 *   - `./js/...`           →  https://cyclecad.com/app/js/...
 * The `../machines/<id>/...` candidates in the MACHINES map are left alone
 * — they only ever resolve when the standalone is hosted at /app/, and the
 * wrapper picks the first candidate that loads. The first candidate is
 * always `./models/<id>.glb` so rewriting that one is enough.
 *
 * @param {string} src
 */
function rewriteAssetUrls(src) {
  return src
    .replace(/(['"`])\.\/models\//g, `$1${V1_BASE}/models/`)
    .replace(/(['"`])\.\/js\//g, `$1${V1_BASE}/js/`);
}

/* ────────────────────────────────────────────────────────────────────────
   Idempotent head injectors
   ──────────────────────────────────────────────────────────────────────── */

function ensureImportMap() {
  if (document.querySelector(`script[${SENTINELS.importMap}]`)) return;
  const existing = document.querySelector('script[type="importmap"]');
  if (existing && (existing.textContent || '').includes('"three"')) return;
  if (existing) {
    /* Existing importmap is incomplete — module script will fail. Surface
       the issue so the host author notices on first load. */
    return;
  }
  const tag = document.createElement('script');
  tag.type = 'importmap';
  tag.setAttribute(SENTINELS.importMap, '');
  tag.textContent = JSON.stringify({
    imports: {
      'three': 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
      'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/',
    },
  });
  /* Importmaps must precede any module script in document order. Prepend
     to <head> rather than append so this guardrail catches more cases. */
  document.head.prepend(tag);
}

function ensureFonts() {
  if (document.querySelector(`link[${SENTINELS.fonts}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS_HREF;
  link.setAttribute(SENTINELS.fonts, '');
  document.head.appendChild(link);
}

/**
 * @param {string} css
 */
function ensureStyle(css) {
  if (document.querySelector(`style[${SENTINELS.style}]`)) return;
  const tag = document.createElement('style');
  tag.setAttribute(SENTINELS.style, '');
  tag.textContent = css;
  document.head.appendChild(tag);
}

/**
 * Override sheet — re-anchors v1's `position: fixed` AppBar + main grid to
 * the wrapper element instead of the document viewport so the simulator
 * stacks correctly below any host chrome (e.g. the Suite suite-bar in
 * apps/pentacad/index.html). Modal / toast / drop-zone overlays remain
 * `position: fixed` because they're page-wide on purpose.
 */
function ensureOverrideStyle() {
  if (document.querySelector(`style[${SENTINELS.override}]`)) return;
  const tag = document.createElement('style');
  tag.setAttribute(SENTINELS.override, '');
  tag.textContent = `
.pt-widget-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Roboto, Helvetica, Arial, sans-serif;
  color: rgba(0, 0, 0, 0.87);
  background: #FFFFFF;
}
.pt-widget-root .pt-appbar { position: absolute; }
.pt-widget-root .pt-main   { position: absolute; }
`;
  document.head.appendChild(tag);
}

/**
 * Load `pentacad-sim.js`, which exposes `window.CycleCAD.PentacadSim` —
 * the parser + executor + kinematics + self-tests the v1 module script
 * imports via `window.CycleCAD.PentacadSim`. Resolves once the script's
 * `load` event fires.
 */
function ensureLibraryScript() {
  const sel = `script[${SENTINELS.lib}]`;
  const existing = document.querySelector(sel);
  if (existing && existing.dataset.loaded === '1') return Promise.resolve();
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () =>
        reject(new Error('pentacad-v1: pentacad-sim.js failed to load')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    /* Cache-bust matches the v1's own query so a Suite host that previously
       loaded an older copy of the library doesn't serve stale code. */
    tag.src = `${V1_BASE}/js/modules/pentacad-sim.js?v=20260425clone-tlo`;
    tag.async = false;
    tag.setAttribute(SENTINELS.lib, '');
    tag.addEventListener('load',  () => { tag.dataset.loaded = '1'; resolve(); }, { once: true });
    tag.addEventListener('error', () =>
      reject(new Error('pentacad-v1: pentacad-sim.js failed to load')), { once: true });
    document.head.appendChild(tag);
  });
}

/**
 * Inject the v1 module source as a `<script type="module">` element. The
 * source uses top-level `import * as THREE from 'three'`, so the importmap
 * must be present in <head> before this runs. The script's bottom calls
 * `boot()` which mounts the simulator into the DOM we previously appended.
 *
 * @param {string} src
 */
function injectV1Module(src) {
  const tag = document.createElement('script');
  tag.type = 'module';
  tag.setAttribute(SENTINELS.module, '');
  tag.textContent = src;
  document.head.appendChild(tag);
}

/**
 * Poll for `window.PentacadSimApp` — the v1 module's published handle —
 * and resolve once boot() has reached it. Boot is async (it awaits the
 * GLB load) so this can take a couple seconds on a cold cache. The poll
 * interval matches a frame so first-paint feedback is immediate.
 *
 * @returns {Promise<Object>}
 */
function waitForApp() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const TIMEOUT_MS = 30_000;
    const tick = () => {
      if (window.PentacadSimApp) return resolve(window.PentacadSimApp);
      if (Date.now() - start > TIMEOUT_MS) {
        return reject(new Error('pentacad-v1: boot timed out (no window.PentacadSimApp)'));
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
