/**
 * @file widgets/transparency.js
 * @description Set opacity on selected meshes (or all meshes in target).
 * @author Sachin Kumar
 * @license MIT
 */

export async function init(opts) {
  const target = opts.target || opts.scene;
  if (!target) throw new Error('transparency: opts.target or opts.scene required');

  // remember each material's original (transparent, opacity, depthWrite) so we can restore
  const original = new Map();

  let activeTarget = target;
  let opacity = 1;

  function apply(o) {
    activeTarget.traverse(obj => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        if (!original.has(m)) {
          original.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
        }
        m.transparent = o < 1;
        m.opacity     = o;
        m.depthWrite  = o >= 1;
        m.needsUpdate = true;
      });
    });
  }

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      setOpacity(o) {
        o = Math.max(0, Math.min(1, +o));
        opacity = o;
        apply(o);
        emit('change', { opacity });
      },
      getOpacity() { return opacity; },
      setTarget(obj) { activeTarget = obj || target; },
      reset() {
        activeTarget.traverse(obj => {
          if (!obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (original.has(m)) {
              const { transparent, opacity: op, depthWrite } = original.get(m);
              m.transparent = transparent; m.opacity = op; m.depthWrite = depthWrite;
              m.needsUpdate = true;
            }
          });
        });
        opacity = 1;
        emit('change', { opacity: 1, kind: 'reset' });
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      // restore on destroy
      activeTarget.traverse(obj => {
        if (!obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (original.has(m)) {
            const { transparent, opacity: op, depthWrite } = original.get(m);
            m.transparent = transparent; m.opacity = op; m.depthWrite = depthWrite;
          }
        });
      });
      original.clear();
    },
  };
}
