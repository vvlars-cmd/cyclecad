/**
 * Dynamic widget loader.
 *
 * Each widget lives at /widgets/<name>.js and exports a single function:
 *   export async function init(opts: WidgetOpts): WidgetHandle
 *
 * Widgets are loaded lazily on demand. The loader runs every call through
 * the token meter so widget code never sees a free vs paid distinction.
 */

const cache = new Map();

/**
 * @typedef {Object} WidgetOpts
 * @property {string|HTMLElement} mount
 * @property {string} app
 * @property {Object} meter
 * @property {Object} [params]
 *
 * @typedef {Object} WidgetHandle
 * @property {() => void} destroy
 * @property {(event: string, fn: Function) => void} on
 * @property {Object} api
 */

/**
 * Load a widget by name and call its init().
 *
 * @param {string} name
 * @param {WidgetOpts} opts
 * @returns {Promise<WidgetHandle>}
 */
export async function loadWidget(name, opts) {
  if (!cache.has(name)) {
    const url = new URL(`../widgets/${name}.js`, import.meta.url);
    cache.set(name, import(url.href));
  }
  const mod = await cache.get(name);
  if (!mod.init) throw new Error(`widget ${name} has no init()`);

  // Pre-flight token check (no-op for admin or free widgets).
  const token = await opts.meter.charge({ widget: name, kind: 'init', actor: opts.app });

  const handle = await mod.init(opts);
  return {
    ...handle,
    destroy: () => { handle.destroy?.(); opts.meter.refund(token); },
  };
}

/**
 * Pre-warm a widget without mounting it. Useful for splash screens to
 * fetch the JS in parallel with the GLB / hero asset.
 *
 * @param {string} name
 */
export function prewarm(name) {
  if (cache.has(name)) return cache.get(name);
  const url = new URL(`../widgets/${name}.js`, import.meta.url);
  const promise = import(url.href);
  cache.set(name, promise);
  return promise;
}
