/**
 * @file widgets/wireframe.js
 * @description Wireframe overlay toggle on all meshes in a target group.
 * @author Sachin Kumar
 * @license MIT
 */

export async function init(opts) {
  const target = opts.target || opts.scene;
  if (!target) throw new Error('wireframe: opts.target or opts.scene required');

  let enabled = opts.enabled ?? false;
  // remember each material's original wireframe state so we can restore
  const original = new Map();

  function apply() {
    target.traverse(obj => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        if (!('wireframe' in m)) return;
        if (!original.has(m)) original.set(m, m.wireframe);
        m.wireframe = enabled;
      });
    });
  }
  apply();

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      enable()  { enabled = true;  apply(); emit('change', { enabled }); },
      disable() { enabled = false; apply(); emit('change', { enabled }); },
      toggle()  { enabled = !enabled; apply(); emit('change', { enabled }); return enabled; },
      isEnabled() { return enabled; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      // restore original states
      target.traverse(obj => {
        if (!obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (original.has(m)) m.wireframe = original.get(m);
        });
      });
      original.clear();
    },
  };
}
