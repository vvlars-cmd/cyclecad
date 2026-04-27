/**
 * @file widgets/drawing-template.js
 * @description Reusable title-block templates for the drawing generator.
 *   Wraps a generated drawing's sheet with project metadata: project name,
 *   drawing number, designer, date, scale, sheet size, and revision.
 *
 *   Ships four built-in templates (cyclecad-default-a4, cyclecad-default-a3,
 *   iso-a3-landscape, din-a4-portrait). Each is a hand-written SVG fragment
 *   with `{{placeholder}}` tokens that applyTemplate substitutes.
 *
 *   UI: a panel with a template picker, a live preview pane, and an
 *   "Apply to current drawing" button that emits `'apply'`.
 *
 *   Pairs with drawing-generator.js (the consumer) and drawing-link.js.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

const SHEET_SIZES = Object.freeze({
  A4:      { w_mm: 297,  h_mm: 210  },
  A3:      { w_mm: 420,  h_mm: 297  },
  A2:      { w_mm: 594,  h_mm: 420  },
  A1:      { w_mm: 841,  h_mm: 594  },
  A0:      { w_mm: 1189, h_mm: 841  },
  letter:  { w_mm: 279,  h_mm: 216  },
  tabloid: { w_mm: 432,  h_mm: 279  },
});

// ─────────── Built-in templates ───────────
// Each template is the SVG fragment for a title block sized in the sheet's
// native mm coordinates. Placeholders are substituted at applyTemplate time.

const BUILTIN_TEMPLATES = {
  'cyclecad-default-a4': {
    sheetSize: 'A4',
    kind: 'cyclecad-default',
    svg: `
<g data-titleblock="cyclecad-default-a4" transform="translate(8,170)">
  <rect x="0" y="0" width="281" height="32" fill="#fff" stroke="#111" stroke-width="0.6"/>
  <line x1="180" y1="0" x2="180" y2="32" stroke="#111" stroke-width="0.4"/>
  <line x1="0"   y1="16" x2="180" y2="16" stroke="#111" stroke-width="0.4"/>
  <text x="4" y="6"  font-family="Inter,sans-serif" font-size="2.2" fill="#7C3AED" letter-spacing="0.5">CYCLECAD</text>
  <text x="4" y="12" font-family="Georgia,serif"     font-size="6"   fill="#0b1320">{{project}}</text>
  <text x="4" y="22" font-family="Inter,sans-serif" font-size="2.4" fill="#6b7280">DESIGNER</text>
  <text x="4" y="28" font-family="Inter,sans-serif" font-size="3.4" fill="#0b1320">{{designer}}</text>
  <text x="184" y="6"  font-family="Inter,sans-serif" font-size="2.4" fill="#6b7280">DRAWING NO.</text>
  <text x="184" y="12" font-family="monospace"        font-size="4"   fill="#0b1320">{{drawingNumber}}</text>
  <text x="184" y="20" font-family="Inter,sans-serif" font-size="2.4" fill="#6b7280">SHEET · SCALE</text>
  <text x="184" y="26" font-family="monospace"        font-size="3.2" fill="#0b1320">{{sheet}} · 1:{{scale}}</text>
  <text x="240" y="6"  font-family="Inter,sans-serif" font-size="2.4" fill="#6b7280">REV</text>
  <text x="240" y="12" font-family="monospace"        font-size="4"   fill="#0b1320">{{revision}}</text>
  <text x="240" y="20" font-family="Inter,sans-serif" font-size="2.4" fill="#6b7280">DATE</text>
  <text x="240" y="26" font-family="monospace"        font-size="3.2" fill="#0b1320">{{date}}</text>
</g>`.trim(),
  },

  'cyclecad-default-a3': {
    sheetSize: 'A3',
    kind: 'cyclecad-default',
    svg: `
<g data-titleblock="cyclecad-default-a3" transform="translate(10,250)">
  <rect x="0" y="0" width="400" height="38" fill="#fff" stroke="#111" stroke-width="0.6"/>
  <line x1="240" y1="0"  x2="240" y2="38" stroke="#111" stroke-width="0.4"/>
  <line x1="0"   y1="19" x2="240" y2="19" stroke="#111" stroke-width="0.4"/>
  <text x="5" y="7"  font-family="Inter,sans-serif" font-size="2.6" fill="#7C3AED" letter-spacing="0.5">CYCLECAD · ENGINEERING DRAWING</text>
  <text x="5" y="15" font-family="Georgia,serif"     font-size="7"   fill="#0b1320">{{project}}</text>
  <text x="5" y="26" font-family="Inter,sans-serif" font-size="2.6" fill="#6b7280">DESIGNER</text>
  <text x="5" y="34" font-family="Inter,sans-serif" font-size="4"   fill="#0b1320">{{designer}}</text>
  <text x="244" y="7"  font-family="Inter,sans-serif" font-size="2.6" fill="#6b7280">DRAWING NO.</text>
  <text x="244" y="15" font-family="monospace"        font-size="5"   fill="#0b1320">{{drawingNumber}}</text>
  <text x="244" y="24" font-family="Inter,sans-serif" font-size="2.6" fill="#6b7280">SHEET · SCALE</text>
  <text x="244" y="32" font-family="monospace"        font-size="3.6" fill="#0b1320">{{sheet}} · 1:{{scale}}</text>
  <text x="340" y="7"  font-family="Inter,sans-serif" font-size="2.6" fill="#6b7280">REV</text>
  <text x="340" y="15" font-family="monospace"        font-size="5"   fill="#0b1320">{{revision}}</text>
  <text x="340" y="24" font-family="Inter,sans-serif" font-size="2.6" fill="#6b7280">DATE</text>
  <text x="340" y="32" font-family="monospace"        font-size="3.6" fill="#0b1320">{{date}}</text>
</g>`.trim(),
  },

  'iso-a3-landscape': {
    sheetSize: 'A3',
    kind: 'iso',
    svg: `
<g data-titleblock="iso-a3-landscape" transform="translate(240,260)">
  <rect x="0" y="0" width="170" height="30" fill="#fff" stroke="#000" stroke-width="0.7"/>
  <line x1="0"   y1="6"  x2="170" y2="6"  stroke="#000" stroke-width="0.35"/>
  <line x1="0"   y1="14" x2="170" y2="14" stroke="#000" stroke-width="0.35"/>
  <line x1="0"   y1="22" x2="170" y2="22" stroke="#000" stroke-width="0.35"/>
  <line x1="60"  y1="6"  x2="60"  y2="30" stroke="#000" stroke-width="0.35"/>
  <line x1="120" y1="6"  x2="120" y2="30" stroke="#000" stroke-width="0.35"/>
  <text x="2" y="4.5" font-family="Helvetica,Arial,sans-serif" font-size="2.4" fill="#000" font-weight="700">ISO TITLE BLOCK · {{project}}</text>
  <text x="2"   y="11" font-family="Helvetica,Arial,sans-serif" font-size="2.2" fill="#444">DRAWN</text>
  <text x="62"  y="11" font-family="Helvetica,Arial,sans-serif" font-size="2.2" fill="#444">DATE</text>
  <text x="122" y="11" font-family="Helvetica,Arial,sans-serif" font-size="2.2" fill="#444">SCALE</text>
  <text x="2"   y="19" font-family="Helvetica,Arial,sans-serif" font-size="3"   fill="#000">{{designer}}</text>
  <text x="62"  y="19" font-family="monospace"                  font-size="3"   fill="#000">{{date}}</text>
  <text x="122" y="19" font-family="monospace"                  font-size="3"   fill="#000">1 : {{scale}}</text>
  <text x="2"   y="27" font-family="Helvetica,Arial,sans-serif" font-size="2.2" fill="#444">DRAWING NO.</text>
  <text x="62"  y="27" font-family="monospace"                  font-size="3"   fill="#000">{{drawingNumber}}</text>
  <text x="122" y="27" font-family="monospace"                  font-size="3"   fill="#000">REV {{revision}}</text>
</g>`.trim(),
  },

  'din-a4-portrait': {
    sheetSize: 'A4',
    kind: 'din',
    svg: `
<g data-titleblock="din-a4-portrait" transform="translate(8,260)">
  <rect x="0" y="0" width="195" height="32" fill="#fff" stroke="#000" stroke-width="0.7"/>
  <line x1="0"  y1="8"  x2="195" y2="8"  stroke="#000" stroke-width="0.35"/>
  <line x1="0"  y1="20" x2="195" y2="20" stroke="#000" stroke-width="0.35"/>
  <line x1="80" y1="0"  x2="80"  y2="32" stroke="#000" stroke-width="0.35"/>
  <line x1="140" y1="0" x2="140" y2="32" stroke="#000" stroke-width="0.35"/>
  <text x="2" y="6"   font-family="Helvetica,sans-serif" font-size="3"   fill="#000" font-weight="700">DIN 6771 · {{project}}</text>
  <text x="2"  y="14" font-family="Helvetica,sans-serif" font-size="2.6" fill="#000">{{designer}}</text>
  <text x="2"  y="26" font-family="monospace"            font-size="2.8" fill="#000">{{date}}</text>
  <text x="82" y="6"  font-family="Helvetica,sans-serif" font-size="2.4" fill="#444">DRAWING NO.</text>
  <text x="82" y="14" font-family="monospace"            font-size="3.2" fill="#000">{{drawingNumber}}</text>
  <text x="82" y="26" font-family="monospace"            font-size="2.8" fill="#000">SHEET {{sheet}}</text>
  <text x="142" y="6"  font-family="Helvetica,sans-serif" font-size="2.4" fill="#444">SCALE</text>
  <text x="142" y="14" font-family="monospace"            font-size="3.2" fill="#000">1 : {{scale}}</text>
  <text x="142" y="26" font-family="monospace"            font-size="2.8" fill="#000">REV {{revision}}</text>
</g>`.trim(),
  },
};

/**
 * Mount the drawing title-block template panel.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   params?: { selected?: string, project?: Record<string, string> }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     applyTemplate: (svgRoot: SVGElement, templateId?: string, project?: Record<string,string>) => SVGElement,
 *     listTemplates: () => Array<{ id: string, sheetSize: string, kind: string }>,
 *     setProject: (project: Record<string,string>) => void,
 *     editTemplate: (id: string, svg: string) => void,
 *     getSheetDimensions: (sheetSize: string) => { w_mm: number, h_mm: number },
 *     getSelected: () => string
 *   },
 *   on: (event: 'change'|'apply'|'edit', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('drawing-template: mount not found');

  const state = {
    selected:  'cyclecad-default-a3',
    project:   {},
    templates: { ...BUILTIN_TEMPLATES },
  };

  const listeners = { change: [], apply: [], edit: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch (e) { /* swallow */ } });

  // -------- core: applyTemplate -----------------------------------------
  function applyTemplate(templateName, params = {}) {
    const tpl = state.templates[templateName];
    if (!tpl) throw new Error(`drawing-template: unknown template "${templateName}"`);
    const merged = {
      project:       params.project       || state.project.name           || 'Untitled Project',
      drawingNumber: params.drawingNumber || state.project.drawingNumber  || 'DRW-0001',
      designer:      params.designer      || state.project.designer       || 'unassigned',
      date:          params.date          || new Date().toISOString().slice(0, 10),
      scale:         params.scale         || 1,
      sheet:         params.sheet         || tpl.sheetSize,
      revision:      params.revision      || 'A',
    };
    let svg = tpl.svg;
    Object.keys(merged).forEach(k => {
      svg = svg.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), escapeXml(merged[k]));
    });
    emit('apply', { template: templateName, params: merged });
    emit('change', { kind: 'apply', template: templateName });
    return svg;
  }

  function escapeXml(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
  }

  function listTemplates() {
    return Object.entries(state.templates).map(([name, t]) => ({
      name, sheetSize: t.sheetSize, kind: t.kind,
    }));
  }

  function setProject(metadata = {}) {
    state.project = { ...state.project, ...metadata };
    emit('change', { kind: 'project', project: state.project });
    refreshPreview();
  }

  function editTemplate(name, svgString) {
    if (!state.templates[name]) {
      state.templates[name] = { sheetSize: 'A4', kind: 'custom', svg: String(svgString) };
    } else {
      state.templates[name] = { ...state.templates[name], svg: String(svgString) };
    }
    emit('edit', { name });
    emit('change', { kind: 'edit', template: name });
    refreshDropdown();
    refreshPreview();
  }

  function getSheetDimensions(sheet) {
    return SHEET_SIZES[sheet] || SHEET_SIZES.A4;
  }

  // -------- DOM ----------------------------------------------------------
  const dom = buildDom(root, state);

  function refreshDropdown() {
    dom.picker.innerHTML = listTemplates().map(t =>
      `<option value="${t.name}" ${t.name === state.selected ? 'selected' : ''}>${t.name} · ${t.sheetSize} · ${t.kind}</option>`
    ).join('');
  }

  function refreshPreview() {
    const tpl = state.templates[state.selected];
    if (!tpl) return;
    const dim = getSheetDimensions(tpl.sheetSize);
    const fragment = applyTemplateInternal(state.selected);
    // Render into a sheet-sized SVG so designer sees true title-block placement.
    dom.preview.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim.w_mm} ${dim.h_mm}" width="100%" style="background:#fff;border:1px solid #e5e7eb">
        <rect x="2" y="2" width="${dim.w_mm - 4}" height="${dim.h_mm - 4}" fill="none" stroke="#999" stroke-width="0.4"/>
        ${fragment}
      </svg>
    `;
  }

  function applyTemplateInternal(name) {
    return applyTemplate(name, {
      project:       state.project.name,
      drawingNumber: state.project.drawingNumber,
      designer:      state.project.designer,
      scale:         state.project.scale,
      sheet:         (state.templates[name] || {}).sheetSize,
      revision:      state.project.revision,
      date:          state.project.date,
    });
  }

  const onPickerChange = e => {
    state.selected = e.target.value;
    refreshPreview();
    emit('change', { kind: 'select', template: state.selected });
  };
  const onApplyClick = () => {
    const svg = applyTemplateInternal(state.selected);
    emit('apply', { template: state.selected, svg });
  };
  const onProjInput = e => {
    const key = e.target.dataset.field;
    if (!key) return;
    state.project[key] = e.target.value;
    refreshPreview();
  };

  dom.picker  .addEventListener('change', onPickerChange);
  dom.applyBtn.addEventListener('click',  onApplyClick);
  dom.fields  .addEventListener('input',  onProjInput);

  refreshDropdown();
  refreshPreview();

  return {
    api: {
      applyTemplate,
      listTemplates,
      setProject,
      editTemplate,
      getSheetDimensions,
      getSelected() { return state.selected; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      dom.picker  .removeEventListener('change', onPickerChange);
      dom.applyBtn.removeEventListener('click',  onApplyClick);
      dom.fields  .removeEventListener('input',  onProjInput);
      dom.wrap.remove();
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// DOM
// ──────────────────────────────────────────────────────────────────────
function buildDom(root, state) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-drawing-template';
  wrap.style.cssText = 'font:13px Inter,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px;max-width:780px';
  wrap.innerHTML = `
    <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px">CYCLECAD · DRAWING TEMPLATE</div>
    <div style="font:600 22px Georgia;margin-bottom:10px">title-block templates</div>
    <div style="display:flex;gap:8px;align-items:end;margin-bottom:10px">
      <label style="font-size:11px;color:#4B5563;flex:1">template
        <select data-picker style="width:100%;padding:6px 8px;font:13px Inter;border:1px solid #d1d5db;border-radius:3px"></select>
      </label>
      <button data-apply style="background:#7C3AED;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">APPLY</button>
    </div>
    <fieldset data-fields style="border:1px solid #e5e7eb;border-radius:6px;padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
      <legend style="font:600 11px Inter;color:#7C3AED;padding:0 6px">project metadata</legend>
      <label style="font-size:11px;color:#4B5563">project<input data-field=name           type=text style="width:100%;padding:5px 7px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px"></label>
      <label style="font-size:11px;color:#4B5563">drawing no.<input data-field=drawingNumber type=text style="width:100%;padding:5px 7px;font:12px monospace;border:1px solid #d1d5db;border-radius:3px"></label>
      <label style="font-size:11px;color:#4B5563">designer<input data-field=designer type=text style="width:100%;padding:5px 7px;font:12px Inter;border:1px solid #d1d5db;border-radius:3px"></label>
      <label style="font-size:11px;color:#4B5563">revision<input data-field=revision type=text value="A" style="width:100%;padding:5px 7px;font:12px monospace;border:1px solid #d1d5db;border-radius:3px"></label>
      <label style="font-size:11px;color:#4B5563">scale<input data-field=scale type=number min=1 value="1" style="width:100%;padding:5px 7px;font:12px monospace;border:1px solid #d1d5db;border-radius:3px"></label>
      <label style="font-size:11px;color:#4B5563">date<input data-field=date type=text placeholder="auto" style="width:100%;padding:5px 7px;font:12px monospace;border:1px solid #d1d5db;border-radius:3px"></label>
    </fieldset>
    <div data-preview style="border:1px solid #e5e7eb;border-radius:4px;background:#f8fafc;min-height:200px;overflow:auto"></div>
  `;
  root.appendChild(wrap);
  return {
    wrap,
    picker:   wrap.querySelector('[data-picker]'),
    applyBtn: wrap.querySelector('[data-apply]'),
    fields:   wrap.querySelector('[data-fields]'),
    preview:  wrap.querySelector('[data-preview]'),
  };
}
