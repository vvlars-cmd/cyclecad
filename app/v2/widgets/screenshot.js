/**
 * @file widgets/screenshot.js
 * @description PNG capture from the current viewport. Optionally meters
 *   the call (cost: 5 per capture).
 * @author Sachin Kumar
 * @license MIT
 */

export async function init(opts) {
  if (!opts.renderer) throw new Error('screenshot: opts.renderer required');
  if (!opts.scene)    throw new Error('screenshot: opts.scene required');
  if (!opts.camera)   throw new Error('screenshot: opts.camera required');

  const listeners = { capture: [], change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch{} });

  async function capture(opts2 = {}) {
    if (opts.meter) {
      try { await opts.meter.charge({ widget: 'screenshot', method: 'capture', cost: 5, actor: opts.app }); } catch {}
    }
    opts.renderer.render(opts.scene, opts.camera);
    const url = opts.renderer.domElement.toDataURL(opts2.mime || 'image/png', opts2.quality ?? 0.92);
    emit('capture', { url, length: url.length });
    return url;
  }

  /** Convert data URL to Blob for download. */
  function dataUrlToBlob(url) {
    const [head, body] = url.split(',');
    const mime = head.match(/data:([^;]+)/)?.[1] || 'image/png';
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  return {
    api: {
      async capture(o) { return capture(o); },
      async download(filename = 'cyclecad-screenshot.png') {
        const url = await capture();
        const blob = dataUrlToBlob(url);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        return filename;
      },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { /* nothing to clean */ },
  };
}
