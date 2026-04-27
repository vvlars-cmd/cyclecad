/**
 * @file widgets/probe-g38.js
 * @description G38.x touchoff workflow widget. Generates safe probing
 *   programs for edge / surface / centre finding using G38.2 (probe-toward-
 *   contact, error if no contact) by default. Supports G38.3, G38.4 and
 *   G38.5 variants for callers that want different signal semantics.
 *
 *   Pure ESM. Browser-only at runtime; no DOM in the import-time path.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const WIDGET = 'probe-g38';

const G38_VARIANTS = {
  '38.2': { label: 'toward · err if none',  desc: 'probe toward, error if no contact' },
  '38.3': { label: 'toward · no err',       desc: 'probe toward, no error if no contact' },
  '38.4': { label: 'away · err if no break',desc: 'probe away, error if no signal break' },
  '38.5': { label: 'away · no err',         desc: 'probe away, no error if no signal break' },
};

/**
 * @typedef {{
 *   mode:'edge-finder'|'surface-Z'|'centre-finder',
 *   axis:'X'|'Y'|'Z',
 *   direction:'+'|'-',
 *   feedrate:number,
 *   maxDistance:number,
 *   retract:number,
 *   setOriginAfter:boolean,
 *   wcs:'G54'|'G55'|'G56'|'G57'|'G58'|'G59',
 *   variant:'38.2'|'38.3'|'38.4'|'38.5',
 * }} ProbeOpts
 */

/**
 * Build the NGC source for one probe operation.
 *
 * @param {ProbeOpts} p
 * @returns {string}
 */
export function generateProgram(p) {
  const lines = [];
  const sign = p.direction === '-' ? -1 : 1;
  const ax = p.axis;
  const dist = sign * Math.abs(Number(p.maxDistance) || 5);
  const retract = Math.abs(Number(p.retract) || 2);
  const feed = Math.max(1, Math.abs(Number(p.feedrate) || 100));
  const variant = G38_VARIANTS[p.variant] ? p.variant : '38.2';
  const wcs = /^G5[4-9]$/.test(p.wcs) ? p.wcs : 'G54';

  lines.push(`(Pentacad probe-g38 · mode=${p.mode} · axis=${ax} dir=${p.direction} · variant=G${variant})`);
  lines.push('(safety prologue — spindle off, retract Z, absolute mm)');
  lines.push('G21');
  lines.push('G90');
  lines.push('M5');
  lines.push('G53 G0 Z-1');
  lines.push(wcs);
  lines.push(`F${feed.toFixed(0)}`);

  if (p.mode === 'edge-finder' || p.mode === 'surface-Z') {
    lines.push(`(probe ${ax} ${p.direction} up to ${Math.abs(dist).toFixed(3)} mm at F${feed.toFixed(0)})`);
    lines.push(`G${variant} ${ax}${dist.toFixed(3)} F${feed.toFixed(0)}`);
    if (p.setOriginAfter) {
      lines.push(`(set ${wcs} origin on ${ax})`);
      lines.push(`G92 ${ax}0`);
    }
    lines.push(`(retract ${retract.toFixed(3)} mm)`);
    lines.push(`G91`);
    lines.push(`G0 ${ax}${(-sign * retract).toFixed(3)}`);
    lines.push(`G90`);
  } else if (p.mode === 'centre-finder') {
    const a = ax === 'X' ? 'X' : 'Y';
    const opp = -dist;
    lines.push(`(centre-finder · two-touch on ${a})`);
    lines.push(`G${variant} ${a}${dist.toFixed(3)} F${feed.toFixed(0)}`);
    if (p.setOriginAfter) lines.push(`#1 = #5061  (probe touch ${a}+)`);
    lines.push(`G91`);
    lines.push(`G0 ${a}${(-sign * retract).toFixed(3)}`);
    lines.push(`G90`);
    lines.push(`G${variant} ${a}${opp.toFixed(3)} F${feed.toFixed(0)}`);
    if (p.setOriginAfter) {
      lines.push(`#2 = #5061  (probe touch ${a}-)`);
      lines.push(`(centre = (#1 + #2) / 2)`);
      lines.push(`#3 = [[#1 + #2] / 2]`);
      lines.push(`G92 ${a}#3`);
    }
    lines.push(`G91`);
    lines.push(`G0 ${a}${(sign * retract).toFixed(3)}`);
    lines.push(`G90`);
  }

  lines.push('(end of probe)');
  lines.push('M30');
  return lines.join('\n') + '\n';
}

const STYLE = `
.pt-probe-g38{padding:18px 20px;font:13px Inter,sans-serif;color:#0F172A;background:#fff;border:1px solid #E5E7EB;border-radius:8px;max-width:780px}
.pt-probe-g38 h2{font:600 22px Georgia;margin:0 0 4px 0}
.pt-probe-g38 .kicker{font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px}
.pt-probe-g38 .desc{font-size:12px;color:#475569;margin-bottom:14px}
.pt-probe-g38 .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.pt-probe-g38 label{font-size:11px;color:#475569;display:block}
.pt-probe-g38 input,.pt-probe-g38 select{width:100%;padding:6px 8px;font:13px Inter;border:1px solid #d1d5db;border-radius:3px}
.pt-probe-g38 button{background:#7C3AED;color:#fff;border:0;border-radius:4px;padding:8px 14px;font:600 12px Inter;cursor:pointer}
.pt-probe-g38 button.alt{background:#0F172A}
.pt-probe-g38 button.ghost{background:#fff;color:#0F172A;border:1px solid #d1d5db}
.pt-probe-g38 svg{display:block;background:#0F172A;border-radius:6px;margin:14px 0}
.pt-probe-g38 pre{background:#0F172A;color:#E2E8F0;padding:10px;border-radius:4px;font:11px Menlo,monospace;max-height:240px;overflow:auto;white-space:pre-wrap}
.pt-probe-g38 .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
`;

/**
 * SVG flow showing the probe approach. Visual only.
 *
 * @param {ProbeOpts} p
 * @returns {string}
 */
function flowSvg(p) {
  const W = 360, H = 120;
  const sign = p.direction === '-' ? -1 : 1;
  const isZ = p.axis === 'Z';
  const startX = isZ ? W / 2 : (sign > 0 ? 60 : W - 60);
  const endX   = isZ ? W / 2 : (sign > 0 ? W - 60 : 60);
  const startY = isZ ? 30  : H / 2;
  const endY   = isZ ? H - 30 : H / 2;
  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="120" xmlns="http://www.w3.org/2000/svg">
      <line x1="20" y1="${H - 20}" x2="${W - 20}" y2="${H - 20}" stroke="#475569" stroke-width="2"/>
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="#7C3AED" stroke-width="2" stroke-dasharray="4 4"/>
      <circle cx="${startX}" cy="${startY}" r="6" fill="#10B981"/>
      <circle cx="${endX}"   cy="${endY}"   r="6" fill="#E11D48"/>
      <text x="${startX + 8}" y="${startY + 4}" font-family="Menlo" font-size="10" fill="#E2E8F0">start</text>
      <text x="${endX + 8}"   y="${endY + 4}"   font-family="Menlo" font-size="10" fill="#E2E8F0">touch</text>
      <text x="20" y="20" font-family="Menlo" font-size="11" fill="#FACC15">${p.mode} · G${p.variant} · ${p.axis}${p.direction}</text>
    </svg>
  `;
}

/**
 * @param {{ mount:string|HTMLElement, app?:string,
 *           meter?:{ charge:Function },
 *           params?:Partial<ProbeOpts> }} opts
 * @returns {Promise<{ api:object, on:Function, destroy:Function }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error(`${WIDGET}: mount not found`);

  /** @type {ProbeOpts} */
  const state = {
    mode: 'edge-finder',
    axis: 'X',
    direction: '+',
    feedrate: 100,
    maxDistance: 5,
    retract: 2,
    setOriginAfter: true,
    wcs: 'G54',
    variant: '38.2',
    ...(opts.params || {}),
  };

  /** @type {Record<string, Function[]>} */
  const listeners = { generate: [], sendToBridge: [], change: [], error: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch {} });

  const dom = document.createElement('div');
  dom.className = 'pt-probe-g38';
  root.appendChild(dom);

  function renderForm() {
    dom.innerHTML = `
      <style>${STYLE}</style>
      <div class="kicker">CAM · TOUCHOFF · G38.x</div>
      <h2>probe touchoff workflow</h2>
      <div class="desc">Generate a safe G38.2 / G38.3 / G38.4 / G38.5 probing program. Always emits a safety prologue (spindle off, Z retract) before the actual probe move.</div>
      <div class="grid">
        <label>mode<select data-k="mode">
          ${['edge-finder','surface-Z','centre-finder'].map(o=>`<option ${o===state.mode?'selected':''}>${o}</option>`).join('')}
        </select></label>
        <label>axis<select data-k="axis">
          ${['X','Y','Z'].map(o=>`<option ${o===state.axis?'selected':''}>${o}</option>`).join('')}
        </select></label>
        <label>direction<select data-k="direction">
          ${['+','-'].map(o=>`<option ${o===state.direction?'selected':''}>${o}</option>`).join('')}
        </select></label>
        <label>variant<select data-k="variant">
          ${Object.keys(G38_VARIANTS).map(o=>`<option value="${o}" ${o===state.variant?'selected':''}>G${o} · ${G38_VARIANTS[o].label}</option>`).join('')}
        </select></label>
        <label>WCS<select data-k="wcs">
          ${['G54','G55','G56','G57','G58','G59'].map(o=>`<option ${o===state.wcs?'selected':''}>${o}</option>`).join('')}
        </select></label>
        <label>feedrate<input type="number" data-k="feedrate" value="${state.feedrate}" step="10" min="1"></label>
        <label>max distance (mm)<input type="number" data-k="maxDistance" value="${state.maxDistance}" step="0.1" min="0.1"></label>
        <label>retract (mm)<input type="number" data-k="retract" value="${state.retract}" step="0.1" min="0.1"></label>
        <label style="display:flex;align-items:end;gap:6px"><input type="checkbox" data-k="setOriginAfter" ${state.setOriginAfter?'checked':''}> set origin (G92) on touch</label>
      </div>
      ${flowSvg(state)}
      <div class="row">
        <button data-action="generate">GENERATE</button>
        <button class="alt" data-action="download">⬇ DOWNLOAD .NGC</button>
        <button class="ghost" data-action="bridge">▶ SEND TO BRIDGE</button>
      </div>
      <pre data-out>(no program yet — click GENERATE)</pre>
    `;
    wire();
  }

  function wire() {
    dom.querySelectorAll('[data-k]').forEach(el => {
      el.addEventListener('input', (ev) => {
        const k = ev.currentTarget.getAttribute('data-k');
        const t = ev.currentTarget;
        const v = t.type === 'checkbox' ? t.checked
          : (t.type === 'number' ? Number(t.value) : t.value);
        state[k] = v;
        emit('change', { ...state });
        const svgWrap = dom.querySelector('svg');
        if (svgWrap && svgWrap.parentNode) {
          const tmp = document.createElement('div');
          tmp.innerHTML = flowSvg(state);
          svgWrap.replaceWith(tmp.firstElementChild);
        }
      });
    });
    dom.querySelector('[data-action="generate"]').addEventListener('click', () => generate().catch(() => {}));
    dom.querySelector('[data-action="download"]').addEventListener('click', () => download());
    dom.querySelector('[data-action="bridge"]').addEventListener('click', () => sendToBridge());
  }

  let lastNgc = '';

  async function generate() {
    try {
      const ngc = generateProgram(state);
      lastNgc = ngc;
      const out = dom.querySelector('[data-out]');
      if (out) out.textContent = ngc;
      emit('generate', { ngc, opts: { ...state } });
      if (opts.meter && typeof opts.meter.charge === 'function') {
        try {
          await opts.meter.charge({
            widget: WIDGET, method: 'generate',
            tokensIn: 1, tokensOut: Math.max(1, ngc.length / 4 | 0),
            modelTier: 'haiku', actor: opts.app,
          });
        } catch (err) { emit('error', err); }
      }
      return ngc;
    } catch (err) {
      emit('error', err);
      throw err;
    }
  }

  function download() {
    if (!lastNgc) lastNgc = generateProgram(state);
    if (typeof document === 'undefined') return;
    const blob = new Blob([lastNgc], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `probe-${state.mode}-${state.axis}${state.direction}.ngc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function sendToBridge() {
    if (!lastNgc) lastNgc = generateProgram(state);
    emit('sendToBridge', { ngc: lastNgc, opts: { ...state } });
  }

  renderForm();

  return {
    api: {
      generate, download, sendToBridge,
      get state() { return { ...state }; },
      set(k, v) { state[k] = v; renderForm(); emit('change', { ...state }); },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() { dom.remove(); },
  };
}
