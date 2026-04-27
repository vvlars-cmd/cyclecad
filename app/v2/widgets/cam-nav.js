/**
 * @file widgets/cam-nav.js
 * @description Universal 3D camera navigation widget.
 *
 *   - ViewCube — small textured cube that mirrors the main camera
 *     orientation and snaps to faces on click.
 *   - Camera Projection menu — Auto / Perspective / Orthographic via the
 *     FOV trick (avoids swapping camera so OrbitControls / TrackballControls
 *     keeps its binding).
 *   - Camera Parenting menu — declarative list of named scene nodes the
 *     camera target lerps toward each frame.
 *   - Locate FAB — fits camera to the host's root group.
 *   - Screenshot FAB — PNG snapshot.
 *
 * Drops onto any Three.js scene that already has a renderer + camera +
 * controls. Matches the loader contract — single `init(opts)` export
 * returning a teardown handle.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const PROJECTION_FOV = Object.freeze({ perspective: 50, orthographic: 5, auto: 18 });

/**
 * @typedef {Object} CamNavOpts
 * @property {string|HTMLElement} mount  Element (or selector) to host the overlay.
 * @property {Object} scene              Three.Scene
 * @property {Object} camera             Three.PerspectiveCamera
 * @property {Object} controls           TrackballControls or OrbitControls
 * @property {Object} [root]             Root group for fitCamera() (defaults to scene)
 * @property {Array<{label:string,target:Object|string}>} [parents]
 * @property {string} [viewCubeUrl]      Optional GLB url for a textured cube
 *
 * @typedef {Object} CamNavHandle
 * @property {() => void} destroy
 * @property {(event: 'change'|'projection'|'parent', fn: Function) => void} on
 * @property {{
 *   setProjection: (mode: 'auto'|'perspective'|'orthographic') => void,
 *   setParent:     (label: string) => void,
 *   fitCamera:     () => void,
 *   screenshot:    () => string,
 * }} api
 */

/**
 * @param {CamNavOpts} opts
 * @returns {Promise<CamNavHandle>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('cam-nav: mount not found');
  if (!opts.camera || !opts.controls) throw new Error('cam-nav: camera + controls required');
  if (!root.style.position || root.style.position === 'static') root.style.position = 'relative';

  const THREE = await loadThree();

  const dom = buildDom(root);
  const listeners = { change: [], projection: [], parent: [] };
  const emit = (ev, payload) => (listeners[ev] || []).forEach(fn => { try { fn(payload); } catch (e) {} });

  const state = {
    parentLabel:    'Base',
    projectionMode: 'auto',
    parents: opts.parents && opts.parents.length
      ? opts.parents
      : [{ label: 'Base', target: '__origin__' }],
  };

  const cube = buildViewCube(THREE, dom.cubeCanvas);
  // Default to the bundled Pentamachine viewCube.glb that ships next to this
  // widget. Caller can override with opts.viewCubeUrl or pass `null` to keep
  // the canvas-textured fallback.
  const glbUrl = opts.viewCubeUrl === null
    ? null
    : (opts.viewCubeUrl || new URL('./assets/viewCube.glb', import.meta.url).href);
  if (glbUrl) {
    upgradeViewCubeToGlb(THREE, cube, glbUrl).catch(() => {});
  }

  let raf = 0;
  const tick = () => {
    syncViewCubeToMainCamera(THREE, cube, opts.camera, opts.controls);
    applyParenting(THREE, opts.controls, state, opts.scene);
    cube.renderer.render(cube.scene, cube.camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  wireCubeInteractions(THREE, cube, dom.cubeCanvas, opts.camera, opts.controls);

  dom.locateBtn.addEventListener('click', () => {
    fitCamera(THREE, opts.camera, opts.controls, opts.root || opts.scene);
    emit('change', { kind: 'fit' });
  });
  dom.screenshotBtn.addEventListener('click', () => {
    const url = dataUrlScreenshot(opts);
    emit('change', { kind: 'screenshot', url });
  });
  wireProjectionMenu(THREE, dom, opts, state, emit);
  wireParentMenu(dom, state, emit);

  renderParentMenu(dom, state);

  return {
    api: {
      setProjection(mode) { setProjection(THREE, opts, state, dom, mode); emit('projection', { mode }); },
      setParent(label) {
        if (!state.parents.find(p => p.label === label)) return;
        state.parentLabel = label;
        renderParentMenu(dom, state);
        emit('parent', { label });
      },
      fitCamera()  { fitCamera(THREE, opts.camera, opts.controls, opts.root || opts.scene); },
      screenshot() { return dataUrlScreenshot(opts); },
    },
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    destroy() {
      cancelAnimationFrame(raf);
      try { cube.renderer.dispose(); } catch (e) {}
      try {
        cube.scene.traverse(n => {
          if (n.geometry) n.geometry.dispose();
          if (n.material) {
            if (n.material.map) n.material.map.dispose();
            n.material.dispose();
          }
        });
      } catch (e) {}
      dom.wrap.remove();
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// DOM
// ──────────────────────────────────────────────────────────────────────

function buildDom(root) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-camnav';
  wrap.innerHTML = `
<style>
.pt-camnav { position: absolute; inset: 0; pointer-events: none; z-index: 11; }
.pt-camnav .pt-cube { position: absolute; top: 20px; right: 90px; width: 64px; height: 64px; pointer-events: auto; }
.pt-camnav .pt-cube canvas { width: 100%; height: 100%; cursor: grab; display: block; }
.pt-camnav .pt-cube canvas:active { cursor: grabbing; }
.pt-camnav .pt-fabs { position: absolute; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 5px; pointer-events: auto; }
.pt-camnav .pt-fab {
  width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
  background: rgb(224,224,224); color: rgba(0,0,0,0.54); border: none; border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 3px 5px -1px rgba(0,0,0,0.2), 0 6px 10px 0 rgba(0,0,0,0.14), 0 1px 18px 0 rgba(0,0,0,0.12);
}
.pt-camnav .pt-fab:hover { background: rgb(214,214,214); }
.pt-camnav .pt-fab svg { width: 18px; height: 18px; pointer-events: none; }
.pt-camnav .pt-menu {
  position: fixed; background: #fff; border-radius: 4px; padding: 8px 0; min-width: 130px;
  box-shadow: 0 5px 5px -3px rgba(0,0,0,0.2), 0 8px 10px 1px rgba(0,0,0,0.14), 0 3px 14px 2px rgba(0,0,0,0.12);
  display: none; z-index: 30; pointer-events: auto;
  font: 14px Roboto, Helvetica, Arial, sans-serif;
}
.pt-camnav .pt-menu.is-open { display: block; }
.pt-camnav .pt-menu button {
  display: block; width: 100%; padding: 8px 16px; background: transparent; border: none;
  text-align: left; cursor: pointer; color: rgba(0,0,0,0.87); font: inherit;
}
.pt-camnav .pt-menu button:hover { background: rgba(0,0,0,0.04); }
.pt-camnav .pt-menu button.is-current { background: rgba(3,177,136,0.12); font-weight: 500; }
</style>
<div class="pt-cube"><canvas></canvas></div>
<div class="pt-fabs">
  <button class="pt-fab" data-act="parent" title="Camera parenting">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.94 3A8.99 8.99 0 0 0 13 3.06V1h-2v2.06A8.99 8.99 0 0 0 3.06 11H1v2h2.06A8.99 8.99 0 0 0 11 20.94V23h2v-2.06A8.99 8.99 0 0 0 20.94 13H23v-2h-2.06zM12 19a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"/></svg>
  </button>
  <button class="pt-fab" data-act="projection" title="Camera projection">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 15.6 19.6 17l-3.13-3.13a4 4 0 0 1-3.02 1.13 4 4 0 1 1 4-4 4 4 0 0 1-1.22 2.88L21 15.6zM4 13h6a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2zm0 4h4a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2zm0-8h8a1 1 0 0 0 0-2H4a1 1 0 0 0 0 2z"/></svg>
  </button>
  <button class="pt-fab" data-act="locate" title="Fit camera">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm9-3h-2.05A6.99 6.99 0 0 0 13 5.05V3h-2v2.05A6.99 6.99 0 0 0 5.05 11H3v2h2.05A6.99 6.99 0 0 0 11 18.95V21h2v-2.05A6.99 6.99 0 0 0 18.95 13H21v-2zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
  </button>
  <button class="pt-fab" data-act="screenshot" title="Screenshot">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2 7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.17L15 2H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg>
  </button>
</div>
<div class="pt-menu" data-menu="projection">
  <button data-projection="auto"        class="is-current">Auto</button>
  <button data-projection="perspective">Perspective</button>
  <button data-projection="orthographic">Orthographic</button>
</div>
<div class="pt-menu" data-menu="parent"></div>
`;
  root.appendChild(wrap);
  return {
    wrap,
    cubeCanvas:     wrap.querySelector('.pt-cube canvas'),
    locateBtn:      wrap.querySelector('button[data-act="locate"]'),
    screenshotBtn:  wrap.querySelector('button[data-act="screenshot"]'),
    projectionBtn:  wrap.querySelector('button[data-act="projection"]'),
    parentBtn:      wrap.querySelector('button[data-act="parent"]'),
    projectionMenu: wrap.querySelector('.pt-menu[data-menu="projection"]'),
    parentMenu:     wrap.querySelector('.pt-menu[data-menu="parent"]'),
  };
}

// ──────────────────────────────────────────────────────────────────────
// ViewCube
// ──────────────────────────────────────────────────────────────────────

function buildViewCube(THREE, canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = 64 * dpr;
  canvas.height = 64 * dpr;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(64, 64, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.4);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xFFFFFF, 0.95));
  const dir = new THREE.DirectionalLight(0xFFFFFF, 0.7);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
  // Mixed-case labels match the Pentamachine viewCube.glb baked styling.
  const faces = [
    { label: 'Right',  color: '#9CA9B6' },
    { label: 'Left',   color: '#9CA9B6' },
    { label: 'Top',    color: '#B4C0CB' },
    { label: 'Bottom', color: '#7E8E9F' },
    { label: 'Front',  color: '#A6B3C0' },
    { label: 'Back',   color: '#A6B3C0' },
  ];
  const materials = faces.map(f => new THREE.MeshBasicMaterial({ map: paintFaceTexture(THREE, f.label, f.color) }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), materials);
  scene.add(cube);

  return { renderer, scene, camera, cube };
}

function paintFaceTexture(THREE, label, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '600 16px Inter, Roboto, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function upgradeViewCubeToGlb(THREE, cube, url) {
  const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
  const obj = gltf.scene;
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  const target = 1.8;
  const scale = target / Math.max(size.x, size.y, size.z, 0.0001);
  obj.scale.setScalar(scale);
  obj.updateMatrixWorld(true);
  const newBox = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3(); newBox.getCenter(center);
  obj.position.sub(center);
  cube.scene.remove(cube.cube);
  cube.scene.add(obj);
  cube.cube = obj;
}

function syncViewCubeToMainCamera(THREE, cube, mainCam, controls) {
  const t = controls.target;
  const dir = new THREE.Vector3().subVectors(mainCam.position, t).normalize();
  cube.camera.position.copy(dir.multiplyScalar(3.4));
  cube.camera.up.copy(mainCam.up);
  cube.camera.lookAt(0, 0, 0);
}

function wireCubeInteractions(THREE, cube, canvas, mainCam, controls) {
  let dragging = false;
  let lastX = 0, lastY = 0;
  let moved = 0;

  canvas.addEventListener('pointerdown', e => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    moved = 0;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);

    const off = new THREE.Vector3().subVectors(mainCam.position, controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta -= dx * 0.01;
    sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi - dy * 0.01));
    off.setFromSpherical(sph);
    mainCam.position.copy(controls.target).add(off);
    if (typeof controls.update === 'function') controls.update();
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('click', e => {
    if (moved > 4) return;
    snapToFace(THREE, cube, e, mainCam, controls);
  });
}

function snapToFace(THREE, cube, e, mainCam, controls) {
  if (!cube.cube) return;
  const canvas = e.target;
  const r = canvas.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: nx, y: ny }, cube.camera);
  const hit = ray.intersectObject(cube.cube, true)[0];
  if (!hit) return;
  const normal = hit.face.normal.clone()
    .transformDirection(hit.object.matrixWorld)
    .normalize();
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  const dir = new THREE.Vector3();
  if (ax >= ay && ax >= az)        dir.set(Math.sign(normal.x) || 1, 0, 0);
  else if (ay >= ax && ay >= az)   dir.set(0, Math.sign(normal.y) || 1, 0.001);
  else                              dir.set(0, 0, Math.sign(normal.z) || 1);
  const t = controls.target;
  const dist = mainCam.position.distanceTo(t);
  mainCam.position.copy(t).add(dir.multiplyScalar(dist));
  if (typeof controls.update === 'function') controls.update();
}

// ──────────────────────────────────────────────────────────────────────
// Camera projection (FOV trick)
// ──────────────────────────────────────────────────────────────────────

function setProjection(THREE, opts, state, dom, mode) {
  if (!Object.prototype.hasOwnProperty.call(PROJECTION_FOV, mode)) return;
  const c = opts.camera;
  const t = opts.controls.target;
  const oldFov = c.fov;
  const newFov = PROJECTION_FOV[mode];
  if (oldFov !== newFov) {
    const off = c.position.clone().sub(t);
    const scale = Math.tan(THREE.MathUtils.degToRad(oldFov / 2))
                / Math.tan(THREE.MathUtils.degToRad(newFov / 2));
    c.position.copy(t).add(off.multiplyScalar(scale));
  }
  c.fov = newFov;
  c.updateProjectionMatrix();
  if (typeof opts.controls.maxDistance === 'number') {
    opts.controls.maxDistance = mode === 'orthographic' ? 20000
                              : mode === 'auto'        ? 5000
                              :                           2000;
  }
  if (typeof opts.controls.update === 'function') opts.controls.update();
  state.projectionMode = mode;
  dom.projectionMenu.querySelectorAll('button').forEach(b =>
    b.classList.toggle('is-current', b.getAttribute('data-projection') === mode));
}

// ──────────────────────────────────────────────────────────────────────
// Camera parenting (lerp target each frame)
// ──────────────────────────────────────────────────────────────────────

function applyParenting(THREE, controls, state, scene) {
  const entry = state.parents.find(p => p.label === state.parentLabel);
  if (!entry || entry.target === '__origin__') return;
  let obj = entry.target;
  if (typeof obj === 'string') obj = scene.getObjectByName(obj);
  if (!obj) return;
  const p = new THREE.Vector3();
  obj.getWorldPosition(p);
  controls.target.lerp(p, 0.15);
}

// ──────────────────────────────────────────────────────────────────────
// Menus + FAB wiring
// ──────────────────────────────────────────────────────────────────────

function wireProjectionMenu(THREE, dom, opts, state, emit) {
  dom.projectionBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeOtherMenus(dom, dom.projectionMenu);
    const r = dom.projectionBtn.getBoundingClientRect();
    dom.projectionMenu.style.left = (r.left - 138) + 'px';
    dom.projectionMenu.style.top  = r.top + 'px';
    dom.projectionMenu.classList.toggle('is-open');
  });
  dom.projectionMenu.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const mode = b.getAttribute('data-projection');
      setProjection(THREE, opts, state, dom, mode);
      dom.projectionMenu.classList.remove('is-open');
      emit('projection', { mode });
    });
  });
  document.addEventListener('click', e => {
    if (!dom.projectionMenu.contains(e.target) && e.target !== dom.projectionBtn) {
      dom.projectionMenu.classList.remove('is-open');
    }
  });
}

function wireParentMenu(dom, state, emit) {
  dom.parentBtn.addEventListener('click', e => {
    e.stopPropagation();
    closeOtherMenus(dom, dom.parentMenu);
    const r = dom.parentBtn.getBoundingClientRect();
    dom.parentMenu.style.left = (r.left - 138) + 'px';
    dom.parentMenu.style.top  = r.top + 'px';
    dom.parentMenu.classList.toggle('is-open');
  });
  dom.parentMenu.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.parentLabel = btn.getAttribute('data-parent');
    renderParentMenu(dom, state);
    dom.parentMenu.classList.remove('is-open');
    emit('parent', { label: state.parentLabel });
  });
  document.addEventListener('click', e => {
    if (!dom.parentMenu.contains(e.target) && e.target !== dom.parentBtn) {
      dom.parentMenu.classList.remove('is-open');
    }
  });
}

function renderParentMenu(dom, state) {
  dom.parentMenu.innerHTML = state.parents.map(p => {
    const cur = p.label === state.parentLabel ? ' class="is-current"' : '';
    return `<button data-parent="${escapeAttr(p.label)}"${cur}>${escapeHtml(p.label)}</button>`;
  }).join('');
}

function closeOtherMenus(dom, except) {
  [dom.projectionMenu, dom.parentMenu].forEach(m => {
    if (m !== except) m.classList.remove('is-open');
  });
}

// ──────────────────────────────────────────────────────────────────────
// Camera-fit + screenshot
// ──────────────────────────────────────────────────────────────────────

function fitCamera(THREE, camera, controls, target) {
  if (!target) return;
  const box = new THREE.Box3().setFromObject(target);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3(); box.getCenter(center);
  const size = new THREE.Vector3(); box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.6;
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  camera.position.copy(center).add(dir.multiplyScalar(dist));
  controls.target.copy(center);
  if (typeof controls.update === 'function') controls.update();
}

function dataUrlScreenshot(opts) {
  // The host renderer should be created with preserveDrawingBuffer:true
  // for this to capture a non-empty image; otherwise the canvas is cleared
  // before toDataURL fires. Most cycleCAD-Suite hosts do this already.
  const candidates = [
    opts.controls && opts.controls.domElement,
    opts.scene && opts.scene.userData && opts.scene.userData.canvas,
  ].filter(Boolean);
  for (const c of candidates) {
    if (typeof c.toDataURL === 'function') return c.toDataURL('image/png');
  }
  return '';
}

// ──────────────────────────────────────────────────────────────────────
// Three.js loader (re-uses host's THREE if available)
// ──────────────────────────────────────────────────────────────────────

async function loadThree() {
  if (window.__cycleCAD_THREE__) return window.__cycleCAD_THREE__;
  if (window.THREE) {
    window.__cycleCAD_THREE__ = window.THREE;
    return window.THREE;
  }
  const mod = await import('https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
  window.__cycleCAD_THREE__ = mod;
  return mod;
}

// ──────────────────────────────────────────────────────────────────────
// Tiny helpers
// ──────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
  })[ch]);
}
function escapeAttr(s) { return escapeHtml(s); }
