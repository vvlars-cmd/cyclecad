/**
 * @file widgets/drawing-generator.js
 * @description Auto-generated 2D drawings from 3D components — base, iso,
 *   section, and detail views. The headline widget for Use Case 1 (Inventor
 *   reverse-engineering): given a THREE.Group, render four standard views
 *   (front/top/side/iso) at orthogonal camera angles, project edges via
 *   THREE.EdgesGeometry, and lay them out on a sheet (A4 .. A0, letter,
 *   tabloid) with view frames, labels, and a title-block placeholder.
 *
 *   Approach: real 3D edge extraction. We clone the host camera, position it
 *   at canonical orientations, walk the component's meshes, build
 *   EdgesGeometry, project each segment to 2D via camera.project(), and emit
 *   <line> SVG. Section views use a clipping plane + the same projection.
 *   Detail views are scaled-up windows of an existing view.
 *
 *   Pairs with drawing-template.js (title block) and drawing-link.js
 *   (live-link from drawing back to source).
 *
 * @author  Sachin Kumar
 * @license MIT
 */

import { THREE } from '../shared/lib/three-imports.js';

const SHEET_SIZES = Object.freeze({
  A4:      { w_mm: 297,  h_mm: 210  },
  A3:      { w_mm: 420,  h_mm: 297  },
  A2:      { w_mm: 594,  h_mm: 420  },
  A1:      { w_mm: 841,  h_mm: 594  },
  A0:      { w_mm: 1189, h_mm: 841  },
  letter:  { w_mm: 279,  h_mm: 216  },
  tabloid: { w_mm: 432,  h_mm: 279  },
});

const VIEW_DIRS = Object.freeze({
  front: [ 0,  0,  1],
  back:  [ 0,  0, -1],
  top:   [ 0,  1,  0],
  bottom:[ 0, -1,  0],
  side:  [ 1,  0,  0],
  left:  [-1,  0,  0],
  iso:   [ 1,  1,  1],
});

/**
 * Mount the drawing generator panel.
 *
 * @param {{
 *   mount: string|HTMLElement,
 *   app?: string,
 *   meter?: { charge: Function, refund?: Function },
 *   scene?: object,
 *   camera?: object,
 *   renderer?: object,
 *   params?: { sheet?: 'A4'|'A3'|'A2'|'A1'|'A0'|'letter'|'tabloid', scale?: number }
 * }} opts
 * @returns {Promise<{
 *   api: {
 *     generateForComponent: (component: object, opts?: { views?: string[], sheet?: string }) => Promise<{ id: string }>,
 *     generateSection: (drawingId: string, plane: object) => Promise<object>,
 *     generateDetail: (drawingId: string, viewKey: string, rect: object) => Promise<object>,
 *     setSheet: (size: 'A4'|'A3'|'A2'|'A1'|'A0'|'letter'|'tabloid') => void,
 *     setScale: (s: number) => void,
 *     exportSvg: (drawingId?: string) => Blob,
 *     exportPdf: (drawingId?: string) => Promise<Blob>,
 *     listDrawings: () => Array<{ id: string, sheet: string, views: object, sourceHash: string }>,
 *     getDrawing: (id: string) => object|null
 *   },
 *   on: (event: 'change'|'generate'|'sectioned'|'detailed', fn: Function) => void,
 *   destroy: () => void
 * }>}
 */
export async function init(opts) {
  const root = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
  if (!root) throw new Error('drawing-generator: mount not found');

  const state = {
    sheet:    'A3',
    scale:    1,
    project:  { name: 'Untitled', drawingNumber: 'DRW-0001' },
    drawings: new Map(),       // drawingId → { sheet, scale, views, sourceHash, svg }
    cache:    new Map(),       // `${componentId}:${sheet}` → drawingId
    nextId:   1,
  };

  const listeners = { change: [], generate: [], sectioned: [], detailed: [] };
  const emit = (ev, p) => (listeners[ev] || []).forEach(fn => { try { fn(p); } catch (e) { /* swallow */ } });

  const dom = buildDom(root, state);

  // -------- meter helper -------------------------------------------------
  async function bill(method, viewCount, cacheHit) {
    if (!opts.meter) return;
    try {
      await opts.meter.charge({
        widget:    'drawing-generator',
        kind:      method,
        actor:     opts.app,
        modelTier: 'sonnet',
        tokensIn:  1000 * Math.max(1, viewCount),
        tokensOut: 5000 * Math.max(1, viewCount),
        cache_hit: !!cacheHit,
      });
    } catch (e) { /* swallow */ }
  }

  // -------- 3D edge extraction ------------------------------------------
  /**
   * Walk a component's meshes, build edge geometry for each, optionally
   * clip every segment against a user-supplied half-space, and project the
   * survivors to sheet coordinates.
   *
   * @param {THREE.Object3D|null} component
   * @param {[number, number, number]} dirVec  view direction (camera-to-target)
   * @param {number} sheetW pre-margin sheet width  (svg user units)
   * @param {number} sheetH pre-margin sheet height (svg user units)
   * @param {number} viewW  view-cell width  (= sheetW for full-sheet sections)
   * @param {number} viewH  view-cell height (= sheetH for full-sheet sections)
   * @param {{nx:number, ny:number, nz:number, d:number}|null} [clip]
   *   half-space `n·x ≤ d` — segments on the `>` side are trimmed
   * @returns {{
   *   lines: Array<[number,number,number,number]>,
   *   bbox2d: {minX:number, minY:number, maxX:number, maxY:number},
   *   sectionTrace?: Array<[number,number,number,number]>
   * }}
   */
  function projectEdges(component, dirVec, sheetW, sheetH, viewW, viewH, clip = null) {
    const lines = [];
    /** Cut-line points (3D) where edges cross the clip plane — used to draw
     * the section silhouette in the output SVG. */
    const cutPoints = [];
    if (!component) return { lines, bbox2d: { minX:0, minY:0, maxX:viewW, maxY:viewH } };

    const box = new THREE.Box3().setFromObject(component);
    if (box.isEmpty()) return { lines, bbox2d: { minX:0, minY:0, maxX:viewW, maxY:viewH } };

    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    // Place an off-axis ortho-style camera looking at center.
    const cam = new THREE.PerspectiveCamera(35, viewW / viewH, 0.1, maxDim * 50);
    const dist = maxDim * 2.6;
    const dir  = new THREE.Vector3(...dirVec).normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    // pick a stable up: avoid degeneracy when looking straight down
    const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, dir.y > 0 ? -1 : 1) : new THREE.Vector3(0, 1, 0);
    cam.up.copy(up);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();

    let minX =  Infinity, minY =  Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    /** Apply the half-space clip. `null` = keep, otherwise return the
     * (possibly trimmed) endpoints in WORLD space. Clip records intersection
     * points into cutPoints[] so the caller can draw the section line.
     *
     * @param {THREE.Vector3} a
     * @param {THREE.Vector3} b
     * @returns {{ax:THREE.Vector3, bx:THREE.Vector3} | null}
     */
    function clipSegment(a, b) {
      if (!clip) return { ax: a, bx: b };
      const da = clip.nx * a.x + clip.ny * a.y + clip.nz * a.z - clip.d;
      const db = clip.nx * b.x + clip.ny * b.y + clip.nz * b.z - clip.d;
      // Convention: keep the side where da/db ≤ 0 (behind the cut plane).
      if (da > 0 && db > 0) return null;        // both cut away
      if (da <= 0 && db <= 0) return { ax: a, bx: b }; // both kept
      // Crossing: split at parameter t.
      const t = da / (da - db);
      const ix = a.x + t * (b.x - a.x);
      const iy = a.y + t * (b.y - a.y);
      const iz = a.z + t * (b.z - a.z);
      const cut = new THREE.Vector3(ix, iy, iz);
      cutPoints.push(cut.clone());
      // Replace the cut-away endpoint with the intersection.
      return da > 0
        ? { ax: cut, bx: b }
        : { ax: a, bx: cut };
    }

    component.traverse(obj => {
      if (!obj.isMesh || !obj.geometry) return;
      let edgeGeom;
      try {
        edgeGeom = new THREE.EdgesGeometry(obj.geometry, 25);
      } catch { return; }
      const pos = edgeGeom.attributes.position;
      if (!pos) { edgeGeom.dispose(); return; }
      obj.updateMatrixWorld(true);
      for (let i = 0; i < pos.count; i += 2) {
        tmpA.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
        tmpB.fromBufferAttribute(pos, i + 1).applyMatrix4(obj.matrixWorld);
        const clipped = clipSegment(tmpA.clone(), tmpB.clone());
        if (!clipped) continue;
        const a = clipped.ax.clone().project(cam);
        const b = clipped.bx.clone().project(cam);
        // Skip lines fully behind the camera
        if (a.z >  1 && b.z >  1) continue;
        if (a.z < -1 && b.z < -1) continue;
        const ax = ( a.x * 0.5 + 0.5) * viewW;
        const ay = (-a.y * 0.5 + 0.5) * viewH;
        const bx = ( b.x * 0.5 + 0.5) * viewW;
        const by = (-b.y * 0.5 + 0.5) * viewH;
        if (!isFinite(ax) || !isFinite(ay) || !isFinite(bx) || !isFinite(by)) continue;
        lines.push([ax, ay, bx, by]);
        minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx);
        minY = Math.min(minY, ay, by); maxY = Math.max(maxY, ay, by);
      }
      edgeGeom.dispose();
    });

    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = viewW; maxY = viewH; }

    // Build the section-line trace by chaining adjacent cut points. We don't
    // try to recover the exact polygon — instead we project all cut points,
    // sort them along the projected x-axis, and draw a thick reference line
    // between consecutive pairs. Looks like a proper engineering drawing.
    let sectionTrace;
    if (clip && cutPoints.length >= 2) {
      const projected = cutPoints
        .map(p => p.clone().project(cam))
        .filter(v => v.z >= -1 && v.z <= 1)
        .map(v => [
          ( v.x * 0.5 + 0.5) * viewW,
          (-v.y * 0.5 + 0.5) * viewH,
        ])
        .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
      sectionTrace = [];
      for (let i = 0; i + 1 < projected.length; i++) {
        const [ax, ay] = projected[i];
        const [bx, by] = projected[i + 1];
        if (Math.hypot(bx - ax, by - ay) < maxDim * 0.4 * 4) {
          sectionTrace.push([ax, ay, bx, by]);
        }
      }
    }

    return { lines, bbox2d: { minX, minY, maxX, maxY }, sectionTrace };
  }

  // -------- SVG composition ---------------------------------------------
  function composeSheet(sheetName, viewsData, label) {
    const dim = SHEET_SIZES[sheetName] || SHEET_SIZES.A3;
    const W = dim.w_mm * 4;   // svg user units, ~4 per mm for legible strokes
    const H = dim.h_mm * 4;
    const margin = 28;
    const titleH = 90;
    const innerW = W - margin * 2;
    const innerH = H - margin * 2 - titleH;

    const cols = viewsData.length <= 2 ? viewsData.length : 2;
    const rows = Math.ceil(viewsData.length / cols);
    const cellW = innerW / cols;
    const cellH = innerH / rows;

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" data-sheet="${sheetName}">`);
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`);
    parts.push(`<rect x="${margin/2}" y="${margin/2}" width="${W - margin}" height="${H - margin}" fill="none" stroke="#111" stroke-width="2"/>`);
    parts.push(`<rect x="${margin}" y="${margin}" width="${innerW}" height="${innerH}" fill="none" stroke="#999" stroke-width="0.5" stroke-dasharray="4 3"/>`);

    viewsData.forEach((v, i) => {
      const c = i % cols, r = (i / cols) | 0;
      const x0 = margin + c * cellW;
      const y0 = margin + r * cellH;
      const pad = 14;
      const fw = cellW - pad * 2;
      const fh = cellH - pad * 2;

      // fit lines to frame
      const bb = v.bbox2d;
      const bw = Math.max(1, bb.maxX - bb.minX);
      const bh = Math.max(1, bb.maxY - bb.minY);
      const s = Math.min(fw / bw, fh / bh) * 0.85;
      const ox = x0 + pad + (fw - bw * s) / 2 - bb.minX * s;
      const oy = y0 + pad + (fh - bh * s) / 2 - bb.minY * s;

      parts.push(`<g data-view="${v.name}">`);
      parts.push(`<rect x="${x0 + 4}" y="${y0 + 4}" width="${cellW - 8}" height="${cellH - 8}" fill="none" stroke="#bbb" stroke-width="0.75"/>`);
      v.lines.forEach(([ax, ay, bx, by]) => {
        parts.push(`<line x1="${(ax * s + ox).toFixed(1)}" y1="${(ay * s + oy).toFixed(1)}" x2="${(bx * s + ox).toFixed(1)}" y2="${(by * s + oy).toFixed(1)}" stroke="#0b1320" stroke-width="0.9" stroke-linecap="round"/>`);
      });
      if (v.lines.length === 0) {
        // empty state — outline + label
        parts.push(`<rect x="${x0 + pad + fw*0.2}" y="${y0 + pad + fh*0.25}" width="${fw*0.6}" height="${fh*0.5}" fill="none" stroke="#cbd5e1" stroke-dasharray="3 3"/>`);
      }
      parts.push(`<text x="${x0 + 12}" y="${y0 + 22}" font="600 12px Inter,sans-serif" fill="#0b1320" font-weight="700" font-size="14" font-family="Inter,sans-serif">${v.name.toUpperCase()}</text>`);
      parts.push(`</g>`);
    });

    // Title-block placeholder — drawing-template.js fills this group.
    const tbY = H - margin - titleH;
    parts.push(`<g data-titleblock-placeholder="true">`);
    parts.push(`<rect x="${margin}" y="${tbY}" width="${innerW}" height="${titleH}" fill="#fff" stroke="#111" stroke-width="1.5"/>`);
    parts.push(`<text x="${margin + 12}" y="${tbY + 24}" font-family="Inter,sans-serif" font-size="11" fill="#6b7280">PROJECT</text>`);
    parts.push(`<text x="${margin + 12}" y="${tbY + 46}" font-family="Georgia,serif" font-size="18" fill="#0b1320">${escapeXml(state.project.name)}</text>`);
    parts.push(`<text x="${margin + 12}" y="${tbY + 70}" font-family="monospace" font-size="11" fill="#374151">${escapeXml(state.project.drawingNumber)} · ${sheetName} · scale 1:${state.scale}</text>`);
    parts.push(`<text x="${W - margin - 12}" y="${tbY + 70}" text-anchor="end" font-family="monospace" font-size="10" fill="#9ca3af">${escapeXml(label || 'cycleCAD')}</text>`);
    parts.push(`</g>`);

    parts.push(`</svg>`);
    return parts.join('');
  }

  function escapeXml(s) {
    return String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
  }

  // -------- public API: generateForComponent ----------------------------
  function findComponent(componentId) {
    if (componentId && componentId.isObject3D) return componentId;
    if (!opts.root) return null;
    let hit = null;
    opts.root.traverse(o => { if (!hit && (o.name === componentId || o.uuid === componentId)) hit = o; });
    return hit || opts.root;
  }

  async function generateForComponent(componentId, params = {}) {
    const sheet = SHEET_SIZES[params.sheet] ? params.sheet : state.sheet;
    const wantViews = params.views === 'auto' || !params.views ? ['front','top','side','iso'] : params.views;
    const cacheKey = `${componentId || 'root'}:${sheet}`;
    const cacheHit = state.cache.has(cacheKey);

    await bill('generate', wantViews.length, cacheHit);

    const dim = SHEET_SIZES[sheet];
    const viewW = dim.w_mm * 4;
    const viewH = dim.h_mm * 4;
    const component = findComponent(componentId);

    const viewsData = wantViews.map(name => {
      const dir = VIEW_DIRS[name] || VIEW_DIRS.iso;
      const { lines, bbox2d } = projectEdges(component, dir, viewW, viewH, viewW, viewH);
      return { name, lines, bbox2d };
    });

    const drawingId = cacheHit ? state.cache.get(cacheKey) : `drw_${state.nextId++}`;
    const sheetSvg = composeSheet(sheet, viewsData, drawingId);
    state.drawings.set(drawingId, {
      sheet, scale: state.scale, views: wantViews, componentId,
      sourceHash: hashComponent(component), svg: sheetSvg,
    });
    state.cache.set(cacheKey, drawingId);
    state.sheet = sheet;
    renderPreview(dom, sheetSvg);
    emit('generate', { drawingId, sheet, views: wantViews, cacheHit });
    emit('change',   { kind: 'generate', drawingId });
    return { drawingId, sheetSvg };
  }

  function hashComponent(component) {
    if (!component) return 'h0';
    let n = 0;
    component.traverse(o => {
      if (o.isMesh) {
        n = (n * 31 + (o.geometry?.attributes?.position?.count || 0)) >>> 0;
        const p = o.position; n = (n * 31 + ((p.x*1000)|0) + ((p.y*1000)|0) + ((p.z*1000)|0)) >>> 0;
      }
    });
    return 'h' + n.toString(36);
  }

  // -------- generateSection ---------------------------------------------
  /**
   * Section view: clones host camera along `planeNormal`, runs the same
   * edge projector but with a half-space clip applied in 3D before
   * projection. Anything on the positive side of the plane (the side the
   * normal points to) is treated as "cut away" — the kept geometry is the
   * negative side. Lines that cross the plane are split exactly at the
   * intersection, so the silhouette is correct.
   *
   * @param {[number, number, number]} planeNormal  e.g. [0,1,0] cuts the top half away
   * @param {[number, number, number]} planePoint   point lying on the plane in world coords
   * @returns {Promise<string>} SVG markup of the resulting sheet
   */
  async function generateSection(planeNormal = [0, 1, 0], planePoint = [0, 0, 0]) {
    await bill('section', 1, false);
    const dim = SHEET_SIZES[state.sheet];
    const W = dim.w_mm * 4, H = dim.h_mm * 4;
    const component = findComponent(null);
    const clip = makeClipPlane(planeNormal, planePoint);
    const { lines, bbox2d, sectionTrace } = projectEdges(component, planeNormal, W, H, W, H, clip);
    // Section trace = where the plane intersects the model bounding box; drawn
    // as a heavy stippled "cut line" overlay on top of the kept silhouette.
    const annotated = sectionTrace ? [...lines, ...sectionTrace] : lines;
    const svg = composeSheet(state.sheet, [{ name: 'section A-A', lines: annotated, bbox2d }], 'SECTION');
    emit('sectioned', { planeNormal, planePoint, clipped: lines.length });
    emit('change', { kind: 'section' });
    renderPreview(dom, svg);
    return svg;
  }

  /**
   * Build a plane definition usable by projectEdges.
   *
   * @param {[number, number, number]} normal
   * @param {[number, number, number]} point
   * @returns {{nx:number, ny:number, nz:number, d:number} | null}
   *   `null` if the normal is degenerate; otherwise plane in `n·x = d` form.
   */
  function makeClipPlane(normal, point) {
    const len = Math.hypot(normal[0], normal[1], normal[2]);
    if (!len) return null;
    const nx = normal[0] / len;
    const ny = normal[1] / len;
    const nz = normal[2] / len;
    return { nx, ny, nz, d: nx * point[0] + ny * point[1] + nz * point[2] };
  }

  // -------- generateDetail ----------------------------------------------
  async function generateDetail(boundingBox, scale = 2) {
    await bill('detail', 1, false);
    const dim = SHEET_SIZES[state.sheet];
    const W = dim.w_mm * 4, H = dim.h_mm * 4;
    const component = findComponent(null);
    const { lines, bbox2d } = projectEdges(component, [1, 1, 1], W, H, W, H);
    // Clip lines to the requested box (in projected 2D, treat box as ratios).
    const bx = boundingBox || { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const x0 = bx.x * W, y0 = bx.y * H, x1 = x0 + bx.w * W, y1 = y0 + bx.h * H;
    const inside = lines.filter(([ax, ay, bxp, byp]) =>
      (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) ||
      (bxp >= x0 && bxp <= x1 && byp >= y0 && byp <= y1));
    const local = inside.map(([ax, ay, bxp, byp]) => [
      (ax - x0) * scale, (ay - y0) * scale, (bxp - x0) * scale, (byp - y0) * scale,
    ]);
    const localBbox = { minX: 0, minY: 0, maxX: bx.w * W * scale, maxY: bx.h * H * scale };
    const svg = composeSheet(state.sheet, [{ name: `detail (×${scale})`, lines: local, bbox2d: localBbox }], 'DETAIL');
    emit('detailed', { boundingBox: bx, scale });
    emit('change', { kind: 'detail' });
    renderPreview(dom, svg);
    return svg;
  }

  // -------- exports ------------------------------------------------------
  function lastSvg() {
    if (state.drawings.size === 0) return composeSheet(state.sheet, [], 'EMPTY');
    const last = [...state.drawings.values()].at(-1);
    return last.svg;
  }
  function exportSvg() { return lastSvg(); }

  /**
   * Real `application/pdf` export. Pipeline:
   *   SVG markup → off-screen <img> → Canvas → JPEG bytes → embedded as a
   *   /XObject Image with /Filter /DCTDecode in a hand-rolled PDF 1.4
   *   document. No third-party libs, ~150 lines including the cross-ref
   *   table.
   *
   * @returns {Promise<Blob>} `application/pdf` Blob — open in any reader
   */
  async function exportPdf() {
    const svg = lastSvg();
    if (!svg) return new Blob([], { type: 'application/pdf' });

    // 1. Rasterize SVG to JPEG at print-quality DPI.
    const sheet = SHEET_SIZES[state.sheet] || SHEET_SIZES.A3;
    const dpi = 200;
    const pageWidthPt  = (sheet.w_mm / 25.4) * 72;   // 72 pt = 1 inch
    const pageHeightPt = (sheet.h_mm / 25.4) * 72;
    const canvasW = Math.round((sheet.w_mm / 25.4) * dpi);
    const canvasH = Math.round((sheet.h_mm / 25.4) * dpi);

    let jpegBytes;
    try {
      jpegBytes = await rasterizeSvgToJpegBytes(svg, canvasW, canvasH);
    } catch (err) {
      // Some browsers refuse foreign-object SVGs; fall back to SVG blob so
      // the user still gets *something* downloadable instead of an error.
      console.warn('drawing-generator: SVG rasterization failed; falling back to SVG blob', err);
      return new Blob([svg], { type: 'image/svg+xml' });
    }

    // 2. Build a minimal PDF.
    return buildSinglePagePdf(jpegBytes, pageWidthPt, pageHeightPt);
  }

  // -------- DOM ----------------------------------------------------------
  const onSheet = e => {
    state.sheet = e.target.value;
    emit('change', { kind: 'sheet', sheet: state.sheet });
  };
  const onScale = e => {
    state.scale = Math.max(1, parseInt(e.target.value, 10) || 1);
    emit('change', { kind: 'scale', scale: state.scale });
  };
  const onGenerate = () => generateForComponent(null, { sheet: state.sheet, views: 'auto' });
  const onSection  = () => generateSection([0, 1, 0], [0, 0, 0]);
  const onDetail   = () => generateDetail({ x: 0.3, y: 0.3, w: 0.4, h: 0.4 }, 2);
  const onExport   = () => {
    const svg = exportSvg();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'drawing.svg'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  dom.sheetSelect.addEventListener('change', onSheet);
  dom.scaleInput .addEventListener('input',  onScale);
  dom.genBtn     .addEventListener('click',  onGenerate);
  dom.sectionBtn .addEventListener('click',  onSection);
  dom.detailBtn  .addEventListener('click',  onDetail);
  dom.exportBtn  .addEventListener('click',  onExport);

  return {
    api: {
      generateForComponent,
      generateSection,
      generateDetail,
      setSheet(size)  { if (SHEET_SIZES[size]) { state.sheet = size; dom.sheetSelect.value = size; emit('change', { kind:'sheet', sheet:size }); } },
      setScale(s)     { state.scale = Math.max(1, s|0); dom.scaleInput.value = String(state.scale); emit('change', { kind:'scale', scale:state.scale }); },
      exportSvg,
      exportPdf,
      listDrawings()  { return [...state.drawings.entries()].map(([id, d]) => ({ id, sheet: d.sheet, views: d.views, sourceHash: d.sourceHash })); },
      getDrawing(id)  { return state.drawings.get(id) || null; },
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
    destroy() {
      dom.sheetSelect.removeEventListener('change', onSheet);
      dom.scaleInput .removeEventListener('input',  onScale);
      dom.genBtn     .removeEventListener('click',  onGenerate);
      dom.sectionBtn .removeEventListener('click',  onSection);
      dom.detailBtn  .removeEventListener('click',  onDetail);
      dom.exportBtn  .removeEventListener('click',  onExport);
      dom.wrap.remove();
      state.drawings.clear();
      state.cache.clear();
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// DOM
// ──────────────────────────────────────────────────────────────────────
function buildDom(root, state) {
  const wrap = document.createElement('div');
  wrap.className = 'pt-drawing-generator';
  wrap.style.cssText = 'font:13px Inter,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:14px;max-width:780px';
  wrap.innerHTML = `
    <div style="font:600 11px Inter;color:#7C3AED;letter-spacing:3px;margin-bottom:6px">CYCLECAD · DRAWING GENERATOR</div>
    <div style="font:600 22px Georgia;margin-bottom:10px">2D drawings from a 3D component</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px">
      <label style="font-size:11px;color:#4B5563">sheet
        <select data-sheet style="display:block;padding:6px 8px;font:13px Inter;border:1px solid #d1d5db;border-radius:3px">
          ${Object.keys(SHEET_SIZES).map(k => `<option value="${k}" ${k === state.sheet ? 'selected' : ''}>${k}</option>`).join('')}
        </select>
      </label>
      <label style="font-size:11px;color:#4B5563">scale 1 :
        <input data-scale type=number min=1 value="${state.scale}" style="width:60px;padding:6px 8px;font:13px monospace;border:1px solid #d1d5db;border-radius:3px">
      </label>
      <button data-gen     style="background:#7C3AED;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">GENERATE</button>
      <button data-section style="background:#0EA5E9;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">SECTION</button>
      <button data-detail  style="background:#10B981;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">DETAIL</button>
      <button data-export  style="background:#374151;color:#fff;border:none;padding:8px 14px;border-radius:4px;font:600 12px Inter;cursor:pointer">EXPORT SVG</button>
    </div>
    <div data-preview style="border:1px solid #e5e7eb;border-radius:4px;background:#f8fafc;min-height:280px;overflow:auto"></div>
  `;
  root.appendChild(wrap);
  return {
    wrap,
    sheetSelect: wrap.querySelector('[data-sheet]'),
    scaleInput:  wrap.querySelector('[data-scale]'),
    genBtn:      wrap.querySelector('[data-gen]'),
    sectionBtn:  wrap.querySelector('[data-section]'),
    detailBtn:   wrap.querySelector('[data-detail]'),
    exportBtn:   wrap.querySelector('[data-export]'),
    preview:     wrap.querySelector('[data-preview]'),
  };
}

function renderPreview(dom, svg) {
  if (dom && dom.preview) dom.preview.innerHTML = svg;
}

// =========================================================================
// PDF export helpers — pure browser, no third-party dependency.
// =========================================================================

/**
 * Rasterize an SVG document to JPEG bytes via an off-screen canvas.
 *
 * @param {string} svgString
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {Promise<Uint8Array>} JPEG byte sequence (raw bytes, not data-URL)
 */
async function rasterizeSvgToJpegBytes(svgString, canvasW, canvasH) {
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(undefined);
      img.onerror = (e) => reject(new Error('SVG image load failed: ' + (e?.message || 'unknown')));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, 0, 0, canvasW, canvasH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return base64ToUint8Array(dataUrl.split(',')[1] || '');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decode a base64 string into a Uint8Array. Avoids `atob`'s per-char overhead
 * for large payloads.
 *
 * @param {string} b64
 * @returns {Uint8Array}
 */
function base64ToUint8Array(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Build a minimal, spec-compliant PDF 1.4 document with one page that
 * displays a JPEG image filling the page. Hand-rolled cross-reference table
 * — no library dependency.
 *
 * The document graph:
 *   1 0 obj  Catalog          → /Pages 2 0 R
 *   2 0 obj  Pages            → /Kids [3 0 R] /Count 1
 *   3 0 obj  Page             → /MediaBox /Resources /Contents /Parent
 *   4 0 obj  XObject Image    → JPEG bytes (raw, /DCTDecode)
 *   5 0 obj  Content stream   → "q W H 0 0 0 0 cm /Im0 Do Q"
 *
 * @param {Uint8Array} jpegBytes
 * @param {number} pageW page width in PDF points (1 pt = 1/72 in)
 * @param {number} pageH page height in PDF points
 * @returns {Blob} `application/pdf`
 */
function buildSinglePagePdf(jpegBytes, pageW, pageH) {
  const enc = new TextEncoder();
  /** @type {Array<Uint8Array>} */
  const parts = [];
  /** @type {number[]} byte offsets of each indirect object */
  const offsets = [];

  let cursor = 0;
  /** @param {string|Uint8Array} chunk */
  const write = (chunk) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    cursor += bytes.length;
  };

  // PDF header. The four high-bit bytes hint to readers that the file is
  // binary (so they don't strip non-printables in transit).
  write('%PDF-1.4\n');
  write(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3]));
  write('\n');

  // 1 0 obj — Catalog
  offsets[1] = cursor;
  write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2 0 obj — Pages
  offsets[2] = cursor;
  write('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3 0 obj — Page
  offsets[3] = cursor;
  const mediaBox = `[0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}]`;
  write(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox ${mediaBox} ` +
    `/Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> ` +
    `/Contents 5 0 R >>\nendobj\n`,
  );

  // 4 0 obj — JPEG image XObject
  offsets[4] = cursor;
  write(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${jpegBytes.length > 0 ? imageDimFallback(jpegBytes).w : 1} ` +
    `/Height ${jpegBytes.length > 0 ? imageDimFallback(jpegBytes).h : 1} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
    `/Length ${jpegBytes.length} >>\nstream\n`,
  );
  write(jpegBytes);
  write('\nendstream\nendobj\n');

  // 5 0 obj — content stream: paint Im0 stretched to MediaBox.
  // PDF cm = [a b c d e f] places & scales the form/image.
  const contentStream =
    `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  const csBytes = enc.encode(contentStream);
  offsets[5] = cursor;
  write(`5 0 obj\n<< /Length ${csBytes.length} >>\nstream\n`);
  write(csBytes);
  write('endstream\nendobj\n');

  // xref table
  const xrefStart = cursor;
  write('xref\n0 6\n');
  write('0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) {
    write(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  // trailer
  write('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n');
  write(String(xrefStart) + '\n%%EOF\n');

  return new Blob(parts, { type: 'application/pdf' });
}

/**
 * Read width/height directly out of a JPEG byte stream by walking SOFn
 * markers. Returns `{w, h}` in pixels. Falls back to `{w:1000, h:707}` if
 * the file is malformed (still produces a valid PDF — it just won't reflect
 * the original image dimensions).
 *
 * @param {Uint8Array} bytes
 * @returns {{w:number, h:number}}
 */
function imageDimFallback(bytes) {
  let i = 2; // skip SOI 0xFFD8
  while (i < bytes.length) {
    if (bytes[i] !== 0xFF) break;
    while (bytes[i] === 0xFF && i < bytes.length) i++;
    const marker = bytes[i++];
    if (marker === 0xD8 || marker === 0xD9) continue;
    // SOFn markers: 0xC0..0xCF excluding DHT 0xC4, JPG 0xC8, DAC 0xCC
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      // Length is bytes[i..i+2], then precision (1 byte), then height (2 bytes), then width (2 bytes).
      const h = (bytes[i + 3] << 8) | bytes[i + 4];
      const w = (bytes[i + 5] << 8) | bytes[i + 6];
      return { w, h };
    }
    const segLen = (bytes[i] << 8) | bytes[i + 1];
    if (!segLen || isNaN(segLen)) break;
    i += segLen;
  }
  return { w: 1000, h: 707 };
}
