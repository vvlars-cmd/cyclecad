/**
 * @file pentacad.js
 * @description Pentacad — browser-based CAM + 5-axis simulator + machine control
 *              for the Pentamachine V2 line. Part of the cycleCAD Suite.
 *
 *              This is the coordinator module. It registers sub-modules
 *              (pentacad-cam, pentacad-sim, pentacad-bridge) and exposes
 *              the unified Pentacad API surface on window.CycleCAD.Pentacad.
 *
 * @version 0.1.0
 * @author  Sachin Kumar <vvlars@googlemail.com>
 * @license AGPL-3.0-only (dual-licensed: commercial available)
 * @module  pentacad
 */

'use strict';

window.CycleCAD = window.CycleCAD || {};

window.CycleCAD.Pentacad = (() => {
  const MODULE_NAME = 'pentacad';
  const VERSION = '0.1.0';

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    phase: 'scaffold',          // scaffold | phase-0 | phase-1 | phase-2 | phase-3
    machine: null,              // loaded machine definition (kinematics, spindle, etc.)
    activeMachineId: null,      // 'v2-10' | 'v2-50-chb' | 'v2-50-chk'
    workpiece: null,            // reference to cycleCAD model being machined
    setups: [],                 // 3+2 setups
    operations: [],             // CAM operations
    toolpaths: [],              // generated toolpaths
    gcode: null,                // last emitted G-code
    bridgeStatus: 'disconnected',
  };

  const SUPPORTED_MACHINES = [
    { id: 'v2-10',       name: 'Pentamachine V2-10',      status: 'template' },
    { id: 'v2-50-chb',   name: 'Pentamachine V2-50CHB',   status: 'primary' },
    { id: 'v2-50-chk',   name: 'Pentamachine V2-50CHK',   status: 'template' },
  ];

  // ============================================================================
  // MACHINE LOADER
  // ============================================================================

  async function loadMachine(machineId) {
    const base = `/machines/${machineId}`;
    try {
      const [kin, spn, env, post, tools] = await Promise.all([
        fetch(`${base}/kinematics.json`).then(r => r.ok ? r.json() : null),
        fetch(`${base}/spindle.json`).then(r => r.ok ? r.json() : null),
        fetch(`${base}/envelope.json`).then(r => r.ok ? r.json() : null),
        fetch(`${base}/post.json`).then(r => r.ok ? r.json() : null),
        fetch(`${base}/tool-library.json`).then(r => r.ok ? r.json() : null),
      ]);

      if (!kin) {
        console.warn(`[Pentacad] No kinematics.json for ${machineId} — using defaults`);
      }

      state.machine = { id: machineId, kinematics: kin, spindle: spn, envelope: env, post, tools };
      state.activeMachineId = machineId;
      window.dispatchEvent(new CustomEvent('pentacad:machine-loaded', { detail: state.machine }));
      console.log(`[Pentacad] Machine loaded: ${machineId}`, state.machine);
      return state.machine;
    } catch (err) {
      console.error(`[Pentacad] Failed to load machine ${machineId}:`, err);
      throw err;
    }
  }

  // ============================================================================
  // INIT — wires in sub-modules once they're available
  // ============================================================================

  function init(options = {}) {
    const Cam = window.CycleCAD.PentacadCAM;
    const Sim = window.CycleCAD.PentacadSim;
    const Bridge = window.CycleCAD.PentacadBridge;

    if (Cam?.init) Cam.init({ state, onEvent: emit });
    if (Sim?.init) Sim.init({ state, onEvent: emit });
    if (Bridge?.init) Bridge.init({ state, onEvent: emit });

    console.log(
      `%cPentacad v${VERSION} initialized`,
      'color:#10b981;font-weight:bold'
    );
    console.log(`  CAM:    ${Cam ? 'loaded' : 'missing (pentacad-cam.js)'}`);
    console.log(`  Sim:    ${Sim ? 'loaded' : 'missing (pentacad-sim.js)'}`);
    console.log(`  Bridge: ${Bridge ? 'loaded' : 'missing (pentacad-bridge.js)'}`);
    return { version: VERSION, phase: state.phase };
  }

  function emit(eventName, detail) {
    window.dispatchEvent(new CustomEvent(`pentacad:${eventName}`, { detail }));
  }

  // ============================================================================
  // UI (returns a DOM element for embedding in the main cycleCAD app)
  // ============================================================================

  function getUI() {
    const root = document.createElement('div');
    root.className = 'pentacad-panel';
    root.innerHTML = `
      <style>
        .pentacad-panel { padding: 12px; color: #e2e8f0; font-size: 13px; }
        .pentacad-panel h3 { margin: 0 0 12px 0; font-size: 14px; color: #10b981; letter-spacing: 1px; }
        .pentacad-panel .machine-picker { display: grid; gap: 4px; margin-bottom: 16px; }
        .pentacad-panel .machine-picker button {
          background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
          padding: 8px 12px; border-radius: 4px; cursor: pointer; text-align: left;
        }
        .pentacad-panel .machine-picker button:hover { background: #334155; }
        .pentacad-panel .machine-picker button.active { background: #10b981; color: #0f172a; border-color: #10b981; }
        .pentacad-panel .tag { font-size: 10px; opacity: 0.7; float: right; }
        .pentacad-panel .section { margin-bottom: 16px; }
        .pentacad-panel .section-title { font-size: 10px; color: #94a3b8; letter-spacing: 2px; margin-bottom: 6px; text-transform: uppercase; }
        .pentacad-panel .note { color: #94a3b8; font-size: 11px; line-height: 1.5; }
        .pentacad-panel .phase-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; background: rgba(245,158,11,0.2); color: #f59e0b; font-weight: 600; }
      </style>

      <h3>PENTACAD <span class="phase-badge">v${VERSION} · Phase 0</span></h3>

      <div class="section">
        <div class="section-title">Machine</div>
        <div class="machine-picker">
          ${SUPPORTED_MACHINES.map(m => `
            <button data-machine="${m.id}">
              ${m.name}
              <span class="tag">${m.status}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Workflow</div>
        <div class="note">
          1. Load a machine (above)<br />
          2. Open or import a workpiece<br />
          3. Define 3+2 setups<br />
          4. Generate toolpaths<br />
          5. Simulate<br />
          6. Stream to machine
        </div>
      </div>

      <div class="section">
        <div class="section-title">Status</div>
        <div class="note">
          Machine: <span id="pc-machine-status">none</span><br />
          Bridge: <span id="pc-bridge-status">disconnected</span>
        </div>
      </div>
    `;

    root.querySelectorAll('.machine-picker button').forEach(btn => {
      btn.addEventListener('click', async () => {
        root.querySelectorAll('.machine-picker button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        try {
          await loadMachine(btn.dataset.machine);
          const statusEl = root.querySelector('#pc-machine-status');
          if (statusEl) statusEl.textContent = btn.dataset.machine;
        } catch (e) {
          alert(`Machine load failed: ${e.message}\n\nEnsure /machines/${btn.dataset.machine}/ files exist.`);
        }
      });
    });

    window.addEventListener('pentacad:bridge-status', (e) => {
      const el = root.querySelector('#pc-bridge-status');
      if (el) el.textContent = e.detail.status;
    });

    return root;
  }

  // ============================================================================
  // EXECUTE (Agent API hook — routes to sub-modules)
  // ============================================================================

  function execute(request) {
    const { method, params } = request || {};
    if (!method) return { error: 'missing_method' };

    const [ns, fn] = method.split('.');
    switch (ns) {
      case 'machine':
        if (fn === 'load') return loadMachine(params.id);
        if (fn === 'current') return state.machine;
        break;
      case 'cam':
        return window.CycleCAD.PentacadCAM?.execute?.(request) ?? { error: 'cam_not_loaded' };
      case 'sim':
        return window.CycleCAD.PentacadSim?.execute?.(request) ?? { error: 'sim_not_loaded' };
      case 'bridge':
        return window.CycleCAD.PentacadBridge?.execute?.(request) ?? { error: 'bridge_not_loaded' };
    }
    return { error: 'unknown_method', method };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    version: VERSION,
    MODULE_NAME,
    init,
    getUI,
    execute,
    loadMachine,
    getState: () => ({ ...state }),
    SUPPORTED_MACHINES,
  };
})();

// Auto-init when the DOM is ready — but only if pentacad.html or main app
// signals they want it. Other pages can skip by setting window.CycleCAD.SkipPentacadInit.
if (typeof document !== 'undefined' && !window.CycleCAD.SkipPentacadInit) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.CycleCAD.Pentacad.init());
  } else {
    window.CycleCAD.Pentacad.init();
  }
}
