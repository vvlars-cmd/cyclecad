/**
 * @file widgets/admin-widget-registry.js
 * @description Admin · edit pricing / ACL / version per widget
 * @author  Sachin Kumar
 * @license MIT
 */

export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('admin-widget-registry: mount not found');

  const dom = document.createElement('div');
  dom.className = 'pt-admin-widget-registry';
  dom.style.cssText = 'padding:16px;font:13px Inter,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:6px;max-width:520px';
  dom.innerHTML = `
    <div style="font:600 11px Inter;color:#E11D48;letter-spacing:3px;margin-bottom:6px">ADMIN-WIDGET-REGISTRY</div>
    <div style="font:600 18px Georgia;margin-bottom:8px">Admin · edit pricing / ACL / version per widget</div>
    <div style="color:#6B7280;font-size:12px;margin-bottom:10px">Stage 2 scaffold · contract-compliant · ready for full impl pass.</div>
    <button data-run style="background:#E11D48;color:#fff;border:none;padding:6px 14px;border-radius:4px;font:600 11px Inter;cursor:pointer">RUN</button>
    <span data-status style="margin-left:10px;font:11px Menlo,monospace;color:#6B7280">idle</span>
    <pre data-out style="margin-top:12px;background:#0F172A;color:#E2E8F0;padding:10px;border-radius:4px;font:11px Menlo,monospace;max-height:140px;overflow:auto;display:none"></pre>
  `;
  root.appendChild(dom);
  const status = dom.querySelector('[data-status]');
  const out    = dom.querySelector('[data-out]');

  const listeners = { change: [], result: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  let state = { runs: 0, lastResult: null };

  async function run(params = {}) {
    state.runs++;
    status.textContent = `run #${state.runs}…`;
    
    const result = {
      ok: true, runs: state.runs, ts: new Date().toISOString(),
      params, widget: 'admin-widget-registry',
    };
    state.lastResult = result;
    out.style.display = 'block';
    out.textContent = JSON.stringify(result, null, 2);
    status.textContent = `done · runs=${state.runs}`;
    emit('result', result);
    emit('change', { kind: 'run', runs: state.runs });
    return result;
  }

  dom.querySelector('[data-run]').addEventListener('click', () => run());

  return {
    api: {
      run,
      getState() { return { ...state }; },
      reset() { state = { runs: 0, lastResult: null }; status.textContent = 'idle'; out.style.display = 'none'; emit('change', { kind: 'reset' }); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
