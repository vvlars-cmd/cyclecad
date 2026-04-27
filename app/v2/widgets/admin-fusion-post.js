/**
 * @file widgets/admin-fusion-post.js
 * @description Admin-side widget that surfaces the vendored Fusion 360 /
 *   Inventor / Mastercam post-processor (`shared/postprocessors/penta-machine.cps`).
 *   Provides a download button, version pill (parsed from the .cps header),
 *   and condensed install notes per host CAM.
 *
 *   Pure ESM. Browser-only at runtime.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const WIDGET = 'admin-fusion-post';

export const POST_SOURCE_PATH = 'shared/postprocessors/penta-machine.cps';
export const POST_DOC_PATH    = 'docs/FUSION-INVENTOR-POST-PLUGIN.md';

/**
 * Parse the canonical version + minimumRevision from a Fusion .cps header.
 *
 * @param {string} src
 * @returns {{ revision:string, minimumRevision:string, description:string, vendor:string }}
 */
export function parseHeader(src) {
  const text = String(src || '');
  const rev = (text.match(/\$Revision:\s*([0-9]+)/) || [])[1] || '0';
  const minRev = (text.match(/minimumRevision\s*=\s*(\d+)/) || [])[1] || '0';
  const desc = (text.match(/description\s*=\s*"([^"]+)"/) || [])[1] || 'Penta Machine';
  const vendor = (text.match(/vendor\s*=\s*"([^"]+)"/) || [])[1] || 'Penta Machine';
  return { revision: rev, minimumRevision: minRev, description: desc, vendor };
}

const STYLE = `
.pt-admin-fusion-post{padding:18px 20px;font:13px Inter,sans-serif;color:#0F172A;background:#fff;border:1px solid #E5E7EB;border-radius:8px;max-width:780px}
.pt-admin-fusion-post h2{font:600 22px Georgia;margin:0 0 4px 0}
.pt-admin-fusion-post .kicker{font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px}
.pt-admin-fusion-post .desc{font-size:12px;color:#475569;margin-bottom:14px}
.pt-admin-fusion-post .pill{display:inline-block;padding:2px 8px;border-radius:999px;font:600 10px Inter;letter-spacing:1px;background:#FEF3C7;color:#92400E}
.pt-admin-fusion-post .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.pt-admin-fusion-post button{background:#7C3AED;color:#fff;border:0;border-radius:4px;padding:8px 14px;font:600 12px Inter;cursor:pointer}
.pt-admin-fusion-post button.ghost{background:#fff;color:#0F172A;border:1px solid #d1d5db}
.pt-admin-fusion-post code{background:#F1F5F9;padding:1px 6px;border-radius:3px;font:11px Menlo,monospace}
.pt-admin-fusion-post section{margin-top:14px;padding:12px 14px;border-left:3px solid #7C3AED;background:#F8FAFC;border-radius:4px}
.pt-admin-fusion-post section h3{font:600 13px Inter;margin:0 0 4px 0;color:#0F172A}
.pt-admin-fusion-post section ol,.pt-admin-fusion-post section ul{margin:6px 0 0 18px;padding:0}
.pt-admin-fusion-post section li{font-size:12px;color:#334155;margin-bottom:3px}
`;

/**
 * @param {{ mount:string|HTMLElement, app?:string,
 *           meter?:{ charge:Function },
 *           params?:{ source?:string, baseUrl?:string, fetch?:Function } }} opts
 * @returns {Promise<{ api:object, on:Function, destroy:Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);

  const baseUrl = opts?.params?.baseUrl || '';
  const fetchImpl = opts?.params?.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  let source = String(opts?.params?.source || '');
  let header = parseHeader(source);

  /** @type {Record<string, Function[]>} */
  const listeners = { download: [], change: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const dom = document.createElement('div');
  dom.className = 'pt-admin-fusion-post';
  root.appendChild(dom);

  function render() {
    dom.innerHTML = `
      <style>${STYLE}</style>
      <div class="kicker">ADMIN · FUSION / INVENTOR POST</div>
      <h2>${header.description}</h2>
      <div class="desc">Vendored at <code>${POST_SOURCE_PATH}</code>. Pinned to revision <span class="pill">r${header.revision}</span> · minimumRevision <span class="pill">r${header.minimumRevision}</span></div>

      <div class="row">
        <button data-action="download">⬇ Download .cps</button>
        <button class="ghost" data-action="open-doc">📖 Read install guide</button>
      </div>

      <section>
        <h3>Fusion 360</h3>
        <ol>
          <li>Drag the .cps file into Fusion's <em>Manage</em> tab → <em>Post Library</em>.</li>
          <li>In Setup, choose <em>Penta Machine</em> as the post.</li>
          <li>Run <em>Post Process</em>. Fusion's <em>Test Post</em> link verifies the install.</li>
        </ol>
      </section>

      <section>
        <h3>Inventor (HSM / CAM)</h3>
        <ol>
          <li>Inventor's CAM module reads the same .cps — drop it into <code>%APPDATA%/Autodesk/CAM/posts</code>.</li>
          <li>Refresh the post list in Inventor → CAM → Setup.</li>
        </ol>
      </section>

      <section>
        <h3>Mastercam</h3>
        <ol>
          <li>Mastercam needs a .pst — convert via the <code>cps2pst</code> bundled converter.</li>
          <li>See <code>${POST_DOC_PATH}</code> § 3 for the conversion script.</li>
        </ol>
      </section>

      <section>
        <h3>Bumping the version</h3>
        <p style="font-size:12px;color:#475569;margin:0">Edit the <code>$Revision:</code> line at the top of the .cps. The header pill updates the next time this widget loads.</p>
      </section>
    `;
    wire();
  }

  function wire() {
    dom.querySelector('[data-action="download"]').addEventListener('click', () => download());
    dom.querySelector('[data-action="open-doc"]').addEventListener('click', () => {
      emit('change', { kind: 'open-doc', path: POST_DOC_PATH });
    });
  }

  async function ensureSource() {
    if (source) return source;
    if (!fetchImpl) return '';
    try {
      const url = `${baseUrl}/${POST_SOURCE_PATH}`;
      const r = await fetchImpl(url);
      if (!r || !r.ok) return '';
      source = await r.text();
      header = parseHeader(source);
      return source;
    } catch { return ''; }
  }

  async function download() {
    const src = await ensureSource();
    if (!src) {
      emit('download', { ok: false, reason: 'source unavailable' });
      return;
    }
    if (typeof document === 'undefined') return;
    const blob = new Blob([src], { type: 'application/x-cps' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'penta-machine.cps';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    emit('download', { ok: true, revision: header.revision });
  }

  render();

  return {
    api: {
      get sourcePath() { return POST_SOURCE_PATH; },
      get docPath() { return POST_DOC_PATH; },
      get header() { return { ...header }; },
      download, parseHeader,
      setSource(s) { source = String(s || ''); header = parseHeader(source); render(); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
