/**
 * @file shared/pentacad/scene.js
 * @description THREE.js scene for the Pentacad simulator — DOM-light (it
 *   owns a single <canvas> mounted into a host element), no chrome of its
 *   own. Encapsulates the camera, renderer, TrackballControls, lights,
 *   grid, AxesHelper, the procedural kinematic chain
 *   (`base ← y ← x ← z ← a ← b`), the GLB loader (HEAD-probe → load →
 *   bind named x/y/z/a/b nodes), the tool model (cylinder + collet +
 *   endmill + tip) parented to the active z, the stock voxel grid on the
 *   B-platter, the camera fit-to-bounds, and a ResizeObserver.
 *
 *   The widget owns the surrounding chrome (sidebar, AppBar, DRO, bottom
 *   playback bar, CHANGE MACHINE pill) and calls `applyKinematics(state)`
 *   each frame to move the rig.
 *
 *   Verbatim port of the procedural primitives + GLB binding from the
 *   legacy v0.4 standalone (https://cyclecad.com/app/pentacad-sim.html
 *   lines ~1500–1900) — comments + variable names retained.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { THREE, TrackballControls, GLTFLoader } from '../lib/three-imports.js';

const KC_GREEN = 0x15B573;

// =========================================================================
// Stock-removal voxel renderer — the small voxel grid that represents the
// workpiece sitting on the B-platter. As the simulator runs, the tool tip
// is world-transformed into B-platter local space and every voxel within
// a tool-radius sphere of the tip is marked removed. Lifted from the
// previous Suite widget pentacad-simulator.js (Phase 2 deliverable) which
// itself ports the legacy v0.4 logic.
// =========================================================================

class StockRemoval {
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
    this.cells = new Uint8Array(this.gridX * this.gridY * this.gridZ);
    this.cells.fill(1);
    this.group = new THREE.Group();
    this.group.name = 'pentacad-stock-removal';
    this.material = new THREE.MeshStandardMaterial({
      color: KC_GREEN, transparent: true, opacity: 0.55,
      metalness: 0.05, roughness: 0.7,
    });
    this.mesh = null;
    this.solidMesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.sizeX, this.sizeY, this.sizeZ),
      this.material,
    );
    this.solidMesh.position.set(this.origin.x, this.origin.y, this.origin.z);
    this.group.add(this.solidMesh);
  }
  reset() { this.cells.fill(1); }
  showSolid() {
    if (this.mesh) this.mesh.visible = false;
    this.solidMesh.visible = true;
  }
  showVoxels() {
    if (this.mesh) this.mesh.visible = true;
    this.solidMesh.visible = false;
  }
  /** mark voxels within the tool-tip sphere as removed */
  removeAtToolTip(state, toolRadius = 0.4) {
    const tx = state.X - this.origin.x;
    const ty = state.Z - this.origin.y;   // tip Z in world ↔ stock-Y
    const tz = state.Y - this.origin.z;
    const ix = Math.floor((tx + this.sizeX / 2) / this.cellX);
    const iy = Math.floor((ty + this.sizeY / 2) / this.cellY);
    const iz = Math.floor((tz + this.sizeZ / 2) / this.cellZ);
    const r = Math.ceil(toolRadius / Math.min(this.cellX, this.cellY, this.cellZ));
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const x = ix + dx, y = iy + dy, z = iz + dz;
          if (x < 0 || y < 0 || z < 0) continue;
          if (x >= this.gridX || y >= this.gridY || z >= this.gridZ) continue;
          if (Math.hypot(dx * this.cellX, dy * this.cellY, dz * this.cellZ) > toolRadius) continue;
          this.cells[x * this.gridY * this.gridZ + y * this.gridZ + z] = 0;
        }
      }
    }
  }
  rebuildMesh() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    const positions = [];
    for (let x = 0; x < this.gridX; x++) {
      for (let y = 0; y < this.gridY; y++) {
        for (let z = 0; z < this.gridZ; z++) {
          if (!this.cells[x * this.gridY * this.gridZ + y * this.gridZ + z]) continue;
          positions.push(
            this.origin.x - this.sizeX / 2 + (x + 0.5) * this.cellX,
            this.origin.y - this.sizeY / 2 + (y + 0.5) * this.cellY,
            this.origin.z - this.sizeZ / 2 + (z + 0.5) * this.cellZ,
          );
        }
      }
    }
    if (positions.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.mesh = new THREE.Points(geo, new THREE.PointsMaterial({
      color: KC_GREEN, size: this.cellX * 0.85, sizeAttenuation: true,
    }));
    this.group.add(this.mesh);
  }
}

// =========================================================================
// Scene factory — public API.
// =========================================================================

/**
 * @param {Object} opts
 * @param {HTMLElement|string} opts.canvasHost   element (or selector) to mount the canvas into
 * @param {Object} [opts.machine]                initial machine def (from engine.MACHINES)
 * @param {string} [opts.glbUrl]                 explicit GLB override (skip catalog walk)
 */
export function createScene(opts) {
  const host = typeof opts.canvasHost === 'string'
    ? document.querySelector(opts.canvasHost)
    : opts.canvasHost;
  if (!host) throw new Error('createScene: canvasHost not found');

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.position.set(180, 140, 220);
  camera.lookAt(0, 30, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  const canvas = renderer.domElement;

  // TrackballControls — free rotation, no fixed up vector. Same config the
  // legacy v0.4 standalone uses (sim.pentamachine.com parity).
  const controls = new TrackballControls(camera, canvas);
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
  let grid = new THREE.GridHelper(400, 40, 0xB0B0B0, 0xD8D8D8);
  scene.add(grid);
  const axes = new THREE.AxesHelper(40);
  axes.position.y = 0.1;
  scene.add(axes);

  // ─── Kinematic chain ─────────────────────────────────────────────────────
  /** @type {{ x: any, y: any, z: any, a: any, b: any }} */
  let kin = {};
  let procRoot = new THREE.Group();
  procRoot.name = 'pentacad-procedural-root';
  scene.add(procRoot);

  let glbRoot = null;
  let procKin = {};
  let glbActive = false;
  let glbMotionScale = 1.0;
  let stockRemoval = null;

  // Tool model (spindle + endmill). Lives at the top of the active z
  // group. Built parametrically — GLBs usually don't ship a tool of
  // their own, so we attach this group to whichever z is current and
  // re-parent in O(1) on machine swap.
  const toolGroup = new THREE.Group();
  toolGroup.name = 'pentacad-tool';
  ;(() => {
    const holder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.50, 24),
      new THREE.MeshStandardMaterial({ color: 0x9CA3AF, metalness: 0.7, roughness: 0.4 }),
    );
    holder.position.y = 0.25;
    toolGroup.add(holder);
    const collet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.10, 0.12, 24),
      new THREE.MeshStandardMaterial({ color: 0x4B5563, metalness: 0.8, roughness: 0.3 }),
    );
    collet.position.y = 0.06;
    toolGroup.add(collet);
    const endmill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.45, 16),
      new THREE.MeshStandardMaterial({ color: 0xE0E7EF, metalness: 0.92, roughness: 0.18 }),
    );
    endmill.position.y = -0.225;
    toolGroup.add(endmill);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.030, 16, 16),
      new THREE.MeshBasicMaterial({ color: KC_GREEN }),
    );
    tip.position.y = -0.450;
    toolGroup.add(tip);
  })();

  function attachToolToZ() {
    if (!kin || !kin.z) return;
    if (toolGroup.parent && toolGroup.parent !== kin.z) {
      toolGroup.parent.remove(toolGroup);
    }
    if (toolGroup.parent !== kin.z) kin.z.add(toolGroup);
    const s = glbActive ? 1.0 : 60;     // procedural rig is mm-scale; GLB ~inches
    toolGroup.scale.setScalar(s);
    if (!glbActive) toolGroup.position.set(0, 90, 12);
    else            toolGroup.position.set(0, 0, 0);
  }

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
    // sweeps below the stock-top threshold.
    stockRemoval = new StockRemoval({
      sizeX: 30, sizeY: 10, sizeZ: 30,
      gridX: 32, gridY: 16, gridZ: 32,
      origin: { x: 0, y: 11, z: 0 },
    });
    bGroup.add(stockRemoval.group);

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
      new THREE.MeshBasicMaterial({ color: KC_GREEN }),
    );
    tooltip.position.set(0, 45, 12);
    zGroup.add(tooltip);

    kin = { x: xGroup, y: yGroup, z: zGroup, a: aGroup, b: bGroup };
    procKin = kin;
    attachToolToZ();
  }

  buildProcedural();

  /**
   * Look up a node on a loaded GLB by case-insensitive name. Mirrors
   * the legacy v0.4 setupGlbKinematics helper.
   */
  function findByName(root3, name) {
    const target = name.toLowerCase();
    let hit = null;
    root3.traverse(o => {
      if (!hit && o.name && o.name.toLowerCase() === target) hit = o;
    });
    return hit;
  }

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

    const bbox = new THREE.Box3().setFromObject(root3);
    if (!bbox.isEmpty()) {
      const size = bbox.getSize(new THREE.Vector3());
      const centre = bbox.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      camera.position.set(
        centre.x + maxDim * 1.8,
        centre.y + maxDim * 1.4,
        centre.z + maxDim * 2.0,
      );
      controls.target.copy(centre);
      controls.update();
      grid.visible = false;
      const fittedGrid = new THREE.GridHelper(maxDim * 5, 20, 0x999999, 0xdddddd);
      fittedGrid.position.y = bbox.min.y - 0.001;
      fittedGrid.userData.isFittedGrid = true;
      scene.add(fittedGrid);
      glbMotionScale = (currentMachine && currentMachine.glbMotionScale != null)
        ? Number(currentMachine.glbMotionScale)
        : 0.0276;
    }
    glbActive = true;
    attachToolToZ();
    return true;
  }

  function resetToProcedural() {
    if (glbRoot) { scene.remove(glbRoot); glbRoot = null; }
    procRoot.visible = true;
    glbActive = false;
    glbMotionScale = 1.0;
    kin = procKin;
    grid.visible = true;
    const toRemove = [];
    scene.traverse((n) => { if (n.userData && n.userData.isFittedGrid) toRemove.push(n); });
    toRemove.forEach((n) => scene.remove(n));
    camera.position.set(180, 140, 220);
    controls.target.set(0, 30, 0);
    controls.update();
    attachToolToZ();
  }

  let currentMachine = opts.machine || null;

  /**
   * Try to load the active machine's GLB. HEAD-probes each candidate URL
   * before fetching — first hit wins. Falls back to procedural on miss.
   */
  async function loadActiveMachineGlb() {
    if (!currentMachine) return null;
    const candidates = opts.glbUrl
      ? [opts.glbUrl]
      : (currentMachine.glbUrls
          || currentMachine.glb
          || ['../shared/lib/penta-machines/' + currentMachine.id + '.glb']);
    for (const url of candidates) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok) continue;
        const loader = new GLTFLoader();
        const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
        const root3 = gltf.scene;
        if (!bindGlbKinematics(root3)) continue;
        return url;
      } catch (_) {
        // try next candidate
      }
    }
    return null;
  }

  /**
   * Apply the live engine state to the active kinematic groups. Same
   * scheme the legacy v0.4 standalone uses — see applyKinematics in
   * pentacad-sim.html.
   */
  function applyKinematics(state) {
    if (!kin || !kin.x) return;
    const s = glbActive ? glbMotionScale : 1.0;
    kin.y.position.z = -state.Y * s;
    kin.x.position.x =  state.X * s;
    kin.z.position.y =  glbActive ? state.Z * s : Math.max(-30, state.Z * 1.0);
    kin.a.rotation.x =  THREE.MathUtils.degToRad(state.A);
    kin.b.rotation.y =  THREE.MathUtils.degToRad(state.B);
  }

  /** Hot-swap to a new machine. Loads its GLB if available. */
  async function setMachine(machineDef) {
    currentMachine = machineDef;
    resetToProcedural();
    const url = await loadActiveMachineGlb();
    return url;
  }

  // ─── Picking ─────────────────────────────────────────────────────────────
  const pickListeners = [];
  function onPick(fn) {
    pickListeners.push(fn);
    return () => {
      const i = pickListeners.indexOf(fn);
      if (i >= 0) pickListeners.splice(i, 1);
    };
  }
  canvas.addEventListener('pointerdown', (ev) => {
    if (pickListeners.length === 0) return;
    const r = canvas.getBoundingClientRect();
    const nx = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((ev.clientY - r.top) / r.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const hits = ray.intersectObjects([procRoot, ...(glbRoot ? [glbRoot] : [])], true);
    pickListeners.forEach(fn => { try { fn({ event: ev, hits }); } catch (_) { /* swallow */ } });
  });

  // ─── Render loop ─────────────────────────────────────────────────────────
  let raf = null;
  function frame() {
    raf = requestAnimationFrame(frame);
    controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // ─── Resize ──────────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      controls.handleResize?.();
    }
  });
  ro.observe(host);
  // initial sizing
  if (host.clientWidth && host.clientHeight) {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
  }

  // Initial GLB attempt — fire-and-forget if a machine was supplied.
  if (currentMachine) {
    ;(async () => { try { await loadActiveMachineGlb(); } catch (_) { /* ok */ } })();
  }

  function destroy() {
    if (raf != null) cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
  }

  return {
    canvas,
    scene, camera, renderer, controls,
    setMachine,
    applyKinematics,
    onPick,
    /** expose for tests / advanced widget composition */
    getKinematics() { return kin; },
    isGlbActive() { return glbActive; },
    getStockRemoval() { return stockRemoval; },
    destroy,
  };
}
