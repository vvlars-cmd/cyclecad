/**
 * @file widgets/isolate.js
 * @description Hide all but the target object. Restore on demand.
 * @author Sachin Kumar
 * @license MIT
 */

export async function init(opts) {
  const root = opts.root || opts.scene;
  if (!root) throw new Error('isolate: opts.root or opts.scene required');

  const hidden = new Set();   // currently-hidden objects (so we can unhide them)
  let isolated = null;

  function isolate(target) {
    restore();
    if (!target) return;
    isolated = target;
    root.traverse(obj => {
      if (!obj.isMesh) return;
      // hide everything except `target` and its descendants/ancestors
      let belongs = obj === target;
      let p = obj;
      while (p && !belongs) { if (p === target) belongs = true; p = p.parent; }
      target.traverse(c => { if (c === obj) belongs = true; });
      if (!belongs && obj.visible) {
        hidden.add(obj);
        obj.visible = false;
      }
    });
    emit('change', { kind: 'isolate', target });
  }

  function restore() {
    hidden.forEach(o => o.visible = true);
    hidden.clear();
    isolated = null;
    emit('change', { kind: 'restore' });
  }

  const listeners = { change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  return {
    api: {
      isolate,
      restore,
      isIsolated() { return isolated !== null; },
      getTarget() { return isolated; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { restore(); },
  };
}
