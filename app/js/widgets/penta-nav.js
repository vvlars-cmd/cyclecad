/* ─────────────────────────────────────────────────────────────────────────
   penta-nav.js — Shared Suite-wide navigation widget
   Drop-in component: ViewCube + camera/target buttons + DRO panel
   + Show Options. Same visual style as sim.pentamachine.com.

   Used by:
     - app/pentacad-sim.html         (already inline)
     - app/index.html                (cycleCAD main app)
     - /Users/sachin/explodeview/docs/demo/index.html
     - app/pentacad.html             (Pentacad full app, Sim tab)

   Usage (pure JS, no framework):
     import { PentaNavWidget } from '/app/js/widgets/penta-nav.js';
     const nav = new PentaNavWidget({
       container: document.getElementById('viewport'),  // any positioned element
       camera: scene.camera,                            // Three.PerspectiveCamera
       controls: scene.controls,                        // OrbitControls
       renderer: scene.renderer,                        // Three.WebGLRenderer (for screenshot)
       fitTarget: scene.root,                           // object whose bbox to fit
       enableDRO: true,                                 // default: true
       enableViewCube: true,                            // default: true
       enableScreenshot: true,                          // default: true
       droLabels: ['X','Y','Z','A','B','T'],            // override for non-5-axis
       initialDRO: { X: 0, Y: 0, Z: 0, A: 0, B: 0, T: 0 },
       onChangeMachine: () => alert('open machine picker'), // optional
     });

     // To update DRO during animation:
     nav.updateDRO({ X: 1.0, Y: 1.0, Z: 0.0, A: 90.0, B: 0.0, T: 4 });

     // To dispose (rare):
     nav.destroy();
   ───────────────────────────────────────────────────────────────────────── */

const STYLE_ID = 'penta-nav-styles';
const CSS = `
.penta-nav-widgets {
  position: absolute;
  right: 16px;
  top: 16px;
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 220px;
  pointer-events: none;
  font-family: Roboto, Helvetica, Arial, sans-serif;
}
.penta-nav-widgets > * { pointer-events: auto; }

.penta-nav-vc-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.penta-nav-viewcube {
  width: 80px;
  height: 80px;
  position: relative;
  perspective: 400px;
  transform-style: preserve-3d;
  transform: rotateX(-25deg) rotateY(-30deg);
  cursor: grab;
}
.penta-nav-vc-face {
  position: absolute;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  color: rgba(0,0,0,0.65);
  background: rgba(255,255,255,0.92);
  border: 1.5px solid #6FCFEB;
  user-select: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.penta-nav-vc-face:hover { background: rgba(3,177,136,0.12); color: #028F6D; }
.penta-nav-vc-front  { transform: translate(15px,15px) translateZ(25px); }
.penta-nav-vc-back   { transform: translate(15px,15px) translateZ(-25px) rotateY(180deg); background: rgba(255,255,255,0.85); }
.penta-nav-vc-right  { transform: translate(15px,15px) rotateY(90deg) translateZ(25px); background: #03B188; color: #FFFFFF; }
.penta-nav-vc-left   { transform: translate(15px,15px) rotateY(-90deg) translateZ(25px); }
.penta-nav-vc-top    { transform: translate(15px,15px) rotateX(90deg) translateZ(25px); }
.penta-nav-vc-bottom { transform: translate(15px,15px) rotateX(-90deg) translateZ(25px); }

.penta-nav-vc-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.penta-nav-vc-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.95);
  border: 1px solid #D8D8D8;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(0,0,0,0.6);
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  padding: 0;
}
.penta-nav-vc-btn:hover {
  background: #03B188;
  color: #FFFFFF;
  border-color: #028F6D;
  transform: scale(1.05);
}
.penta-nav-vc-btn svg { display: block; }

.penta-nav-dro {
  background: rgba(108, 113, 117, 0.92);
  color: #FFFFFF;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: Monaco, Menlo, "Ubuntu Mono", Consolas, "Source Code Pro", source-code-pro, monospace;
  font-size: 14px;
  line-height: 1.5;
  align-self: flex-end;
  width: 158px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.12);
}
.penta-nav-dro-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.penta-nav-dro-k { font-weight: 500; opacity: 0.95; }
.penta-nav-dro-v { font-variant-numeric: tabular-nums; }

.penta-nav-show-options {
  width: 100%;
  background: rgba(255,255,255,0.95);
  border: 1px solid #D8D8D8;
  border-radius: 18px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(0,0,0,0.6);
  cursor: pointer;
  transition: background 0.15s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  font-family: inherit;
}
.penta-nav-show-options:hover { background: #F5F5F5; color: rgba(0,0,0,0.87); }

.penta-nav-change-machine {
  position: absolute;
  right: 16px;
  bottom: 64px;
  z-index: 12;
  background: #03B188;
  color: #FFFFFF;
  border: 0;
  border-radius: 22px;
  padding: 12px 22px;
  font-family: Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0,0,0,0.14);
  transition: background 0.15s;
}
.penta-nav-change-machine:hover { background: #028F6D; }
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

const VC_VIEWS = {
  front:  { az: 0,            el: 0 },
  back:   { az: Math.PI,      el: 0 },
  right:  { az: Math.PI/2,    el: 0 },
  left:   { az: -Math.PI/2,   el: 0 },
  top:    { az: 0,            el: Math.PI/2 - 0.05 },
  bottom: { az: 0,            el: -Math.PI/2 + 0.05 }
};

export class PentaNavWidget {
  constructor(opts = {}) {
    this.opts = Object.assign({
      enableDRO: true,
      enableViewCube: true,
      enableScreenshot: true,
      enableShowOptions: true,
      enableChangeMachine: false,
      droLabels: ['X','Y','Z','A','B','T'],
      initialDRO: {},
      screenshotName: 'viewport',
    }, opts);
    if (!this.opts.container) {
      throw new Error('PentaNavWidget: container is required');
    }
    injectStyles();
    this._build();
    this._wire();
  }

  _build() {
    const root = document.createElement('div');
    root.className = 'penta-nav-widgets';

    if (this.opts.enableViewCube || this.opts.enableScreenshot) {
      const row = document.createElement('div');
      row.className = 'penta-nav-vc-row';

      if (this.opts.enableViewCube) {
        const vc = document.createElement('div');
        vc.className = 'penta-nav-viewcube';
        vc.title = 'Click a face to snap camera';
        vc.innerHTML = `
          <div class="penta-nav-vc-face penta-nav-vc-top"    data-face="top">Top</div>
          <div class="penta-nav-vc-face penta-nav-vc-bottom" data-face="bottom">Bot</div>
          <div class="penta-nav-vc-face penta-nav-vc-front"  data-face="front">Front</div>
          <div class="penta-nav-vc-face penta-nav-vc-back"   data-face="back">Back</div>
          <div class="penta-nav-vc-face penta-nav-vc-right"  data-face="right">Right</div>
          <div class="penta-nav-vc-face penta-nav-vc-left"   data-face="left">Left</div>`;
        row.appendChild(vc);
        this._viewcube = vc;
      }

      const btns = document.createElement('div');
      btns.className = 'penta-nav-vc-buttons';
      btns.innerHTML = `
        <button class="penta-nav-vc-btn" data-action="fit" title="Fit to scene">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6 M12 17v6 M1 12h6 M17 12h6"/>
          </svg>
        </button>
        ${this.opts.enableScreenshot ? `
        <button class="penta-nav-vc-btn" data-action="screenshot" title="Screenshot">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>` : ''}`;
      row.appendChild(btns);
      this._buttons = btns;
      root.appendChild(row);
    }

    if (this.opts.enableDRO) {
      const dro = document.createElement('div');
      dro.className = 'penta-nav-dro';
      dro.innerHTML = this.opts.droLabels.map(label => {
        const v = this.opts.initialDRO[label] ?? 0;
        const fmt = label === 'T' ? String(v) : Number(v).toFixed(4);
        return `<div class="penta-nav-dro-row">
          <span class="penta-nav-dro-k">${label}:</span>
          <span class="penta-nav-dro-v" data-axis="${label}">${fmt}</span>
        </div>`;
      }).join('');
      root.appendChild(dro);
      this._dro = dro;
    }

    if (this.opts.enableShowOptions) {
      const btn = document.createElement('button');
      btn.className = 'penta-nav-show-options';
      btn.textContent = 'Show Options';
      root.appendChild(btn);
      this._showOptionsBtn = btn;
    }

    this.opts.container.appendChild(root);
    this._root = root;

    if (this.opts.enableChangeMachine) {
      const pill = document.createElement('button');
      pill.className = 'penta-nav-change-machine';
      pill.textContent = 'Change Machine';
      this.opts.container.appendChild(pill);
      this._changeMachine = pill;
    }
  }

  _wire() {
    if (this._viewcube) {
      this._viewcube.querySelectorAll('.penta-nav-vc-face').forEach(f => {
        f.addEventListener('click', () => this._snapTo(f.dataset.face));
      });
    }
    if (this._buttons) {
      this._buttons.querySelectorAll('[data-action]').forEach(b => {
        b.addEventListener('click', () => {
          const action = b.dataset.action;
          if (action === 'fit') this._fit();
          else if (action === 'screenshot') this._screenshot();
        });
      });
    }
    if (this._showOptionsBtn) {
      this._showOptionsBtn.addEventListener('click', () => {
        if (typeof this.opts.onShowOptions === 'function') this.opts.onShowOptions();
      });
    }
    if (this._changeMachine) {
      this._changeMachine.addEventListener('click', () => {
        if (typeof this.opts.onChangeMachine === 'function') this.opts.onChangeMachine();
      });
    }
  }

  _snapTo(faceName) {
    const view = VC_VIEWS[faceName];
    if (!view || !this.opts.camera || !this.opts.controls) return;
    const cam = this.opts.camera;
    const ctrl = this.opts.controls;
    const dist = cam.position.distanceTo(ctrl.target);
    const x = ctrl.target.x + dist * Math.cos(view.el) * Math.sin(view.az);
    const y = ctrl.target.y + dist * Math.sin(view.el);
    const z = ctrl.target.z + dist * Math.cos(view.el) * Math.cos(view.az);
    cam.position.set(x, y, z);
    cam.lookAt(ctrl.target);
    ctrl.update();
  }

  _fit() {
    if (typeof this.opts.onFit === 'function') {
      this.opts.onFit();
      return;
    }
    // Default fit: compute bbox of fitTarget, position camera to see it.
    const target = this.opts.fitTarget;
    const cam = this.opts.camera;
    const ctrl = this.opts.controls;
    if (!target || !cam || !ctrl || typeof window.THREE === 'undefined') return;
    const Box3 = window.THREE.Box3;
    const Vec3 = window.THREE.Vector3;
    const box = new Box3().setFromObject(target);
    if (box.isEmpty()) return;
    const size = new Vec3(); box.getSize(size);
    const center = new Vec3(); box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (cam.fov || 50) * Math.PI / 180;
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.55;
    const dir = new Vec3(0.8, 0.55, 1.0).normalize();
    cam.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    cam.lookAt(center);
    ctrl.target.copy(center);
    ctrl.update();
  }

  _screenshot() {
    if (!this.opts.renderer) return;
    const url = this.opts.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.opts.screenshotName}-${Date.now()}.png`;
    a.click();
  }

  /**
   * Update the DRO panel.
   * @param {{[axis:string]: number}} values - keys must match droLabels (e.g. {X:1, Y:2})
   */
  updateDRO(values) {
    if (!this._dro) return;
    Object.entries(values).forEach(([k, v]) => {
      const el = this._dro.querySelector(`[data-axis="${k}"]`);
      if (el) {
        el.textContent = (k === 'T' || Number.isInteger(v))
          ? String(v)
          : Number(v).toFixed(4);
      }
    });
  }

  destroy() {
    if (this._root) this._root.remove();
    if (this._changeMachine) this._changeMachine.remove();
  }
}

// Convenience factory for the most common 5-axis setup
export function createPentaNav(threeApp, opts = {}) {
  return new PentaNavWidget(Object.assign({
    container: threeApp.container,
    camera: threeApp.camera,
    controls: threeApp.controls,
    renderer: threeApp.renderer,
    fitTarget: threeApp.scene || threeApp.root,
    droLabels: ['X','Y','Z','A','B','T'],
  }, opts));
}
