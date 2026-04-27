/**
 * @file shared/build-step-templates.js
 * @description Library of build-step templates used by the Inventor reverse-
 *   engineer engine.
 *
 *   A "build step" is one entry in the synthesized feature tree the engine
 *   produces from a parsed `.ipt` / `.iam`. Each step has:
 *     - `kind`             — one of TEMPLATE_KINDS
 *     - `id`               — deterministic per-step id (sha1-prefix-ish)
 *     - `title`            — short human label, e.g. "Sketch on XY plane"
 *     - `params`           — kind-specific parameters
 *     - `narration`        — full instructional sentence(s)
 *     - `timeEstimateMin`  — base minutes for the kind, can be overridden
 *     - `icon`             — single glyph for the UI rail
 *     - `cost`             — { tier, tokensIn, tokensOut } billing hint
 *
 *   The templates are intentionally chatty: every narration reads like a CAD
 *   tutorial, second-person, with measurements injected. They are used by
 *   `widgets/reverse-engineer.js` (synthesizes the plan) and by
 *   `widgets/rebuild-guide.js` (renders one step at a time).
 *
 * @author Sachin Kumar
 * @license MIT
 *
 * Use Case 1 · feature-tree DSL.
 */

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────── */

const r = (n, d = 1) => {
  if (typeof n !== 'number' || !isFinite(n)) return n;
  const k = Math.pow(10, d);
  return Math.round(n * k) / k;
};

const list = (arr, fb = '') => Array.isArray(arr) && arr.length ? arr : (Array.isArray(fb) ? fb : []);

const mm = (v, fb = '?') => (typeof v === 'number' ? `${r(v, 2)} mm` : fb);

const deg = (v, fb = '?') => (typeof v === 'number' ? `${r(v, 1)}°` : fb);

/* ──────────────────────────────────────────────────────────────────────────
   Templates — 15 kinds
   ──────────────────────────────────────────────────────────────────────── */

export const TEMPLATE_KINDS = Object.freeze([
  'sketch', 'extrude', 'revolve', 'sweep', 'loft',
  'fillet', 'chamfer', 'hole', 'shell', 'mate',
  'place', 'mirror', 'pattern', 'split', 'note',
]);

export const TEMPLATES = Object.freeze({
  sketch: {
    kind: 'sketch',
    icon: '◯',
    timeEstimateMin: 2,
    cost: { tier: 'haiku', tokensIn: 50, tokensOut: 200 },
    paramsShape: { plane: 'XY', references: [], constraints: [], dimensions: [], profile: '' },
    narrationTemplate: ({ plane = 'XY', dimensions = [], profile = '' } = {}) => {
      const dims = list(dimensions);
      const prof = profile ? `Sketch a ${profile}.` : 'Define the profile geometry.';
      const dimText = dims.length
        ? ` Add ${dims.length} dimension${dims.length > 1 ? 's' : ''}${dims[0]?.value ? ` (e.g. ${mm(dims[0].value)})` : ''}.`
        : '';
      return `Create a sketch on the ${plane} plane. ${prof}${dimText}`;
    },
  },

  extrude: {
    kind: 'extrude',
    icon: '⬚',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 80, tokensOut: 220 },
    paramsShape: { distance: 0, direction: 'symmetric', operation: 'join', taper: 0 },
    narrationTemplate: ({ distance, direction = 'one-side', operation = 'join', taper = 0 } = {}) => {
      const op = operation === 'cut' ? 'Cut' : operation === 'intersect' ? 'Intersect' : 'Extrude';
      const dist = mm(distance);
      const dir = direction === 'symmetric' ? ' symmetrically about the sketch plane' : '';
      const tp = taper ? ` with a ${deg(taper)} draft` : '';
      return `${op} the active sketch by ${dist}${dir}${tp}.`;
    },
  },

  revolve: {
    kind: 'revolve',
    icon: '↻',
    timeEstimateMin: 2,
    cost: { tier: 'haiku', tokensIn: 60, tokensOut: 200 },
    paramsShape: { axis: 'Y', angle: 360, operation: 'join' },
    narrationTemplate: ({ axis = 'Y', angle = 360, operation = 'join' } = {}) => {
      const op = operation === 'cut' ? 'cut' : 'add';
      return `Revolve the profile around the ${axis} axis through ${deg(angle)} to ${op} material.`;
    },
  },

  sweep: {
    kind: 'sweep',
    icon: '∿',
    timeEstimateMin: 3,
    cost: { tier: 'haiku', tokensIn: 80, tokensOut: 220 },
    paramsShape: { profile: 'sketch1', path: 'sketch2', orientation: 'follow-path' },
    narrationTemplate: ({ profile = 'profile sketch', path = 'path sketch', orientation = 'follow-path' } = {}) =>
      `Sweep the ${profile} along the ${path}, keeping the section ${orientation.replace('-', ' ')}.`,
  },

  loft: {
    kind: 'loft',
    icon: '⌇',
    timeEstimateMin: 4,
    cost: { tier: 'haiku', tokensIn: 90, tokensOut: 240 },
    paramsShape: { profiles: [], rails: [], operation: 'join' },
    narrationTemplate: ({ profiles = [], rails = [] } = {}) => {
      const n = list(profiles).length || 2;
      const rt = list(rails).length ? ` Guide the transition with ${rails.length} rail${rails.length > 1 ? 's' : ''}.` : '';
      return `Loft between ${n} profile sketches to blend the cross-sections smoothly.${rt}`;
    },
  },

  fillet: {
    kind: 'fillet',
    icon: '◜',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 40, tokensOut: 160 },
    paramsShape: { edges: [], radius: 1, type: 'constant' },
    narrationTemplate: ({ edges = [], radius = 1 } = {}) => {
      const n = list(edges).length || 'each selected';
      return `Add a fillet at ${n} edge${n === 1 ? '' : 's'} to a radius of ${mm(radius)}.`;
    },
  },

  chamfer: {
    kind: 'chamfer',
    icon: '◢',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 40, tokensOut: 160 },
    paramsShape: { edges: [], distance: 1, angle: 45 },
    narrationTemplate: ({ edges = [], distance = 1, angle = 45 } = {}) => {
      const n = list(edges).length || 'each selected';
      return `Chamfer ${n} edge${n === 1 ? '' : 's'} by ${mm(distance)} at ${deg(angle)}.`;
    },
  },

  hole: {
    kind: 'hole',
    icon: '◉',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 60, tokensOut: 200 },
    paramsShape: { diameter: 5, depth: 'through', count: 1, holeType: 'simple', thread: null },
    narrationTemplate: ({ diameter = 5, depth = 'through', count = 1, holeType = 'simple', thread = null } = {}) => {
      const dp = depth === 'through' ? 'all the way through' : `to a depth of ${mm(depth)}`;
      const th = thread ? ` and tap to ${thread}` : '';
      const ht = holeType !== 'simple' ? ` ${holeType}` : '';
      return `Drill ${count} ${mm(diameter)}${ht} hole${count > 1 ? 's' : ''} ${dp}${th}.`;
    },
  },

  shell: {
    kind: 'shell',
    icon: '◌',
    timeEstimateMin: 2,
    cost: { tier: 'haiku', tokensIn: 50, tokensOut: 180 },
    paramsShape: { thickness: 2, removedFaces: [] },
    narrationTemplate: ({ thickness = 2, removedFaces = [] } = {}) => {
      const f = list(removedFaces).length || 1;
      return `Shell the body to a wall thickness of ${mm(thickness)}, removing ${f} face${f > 1 ? 's' : ''}.`;
    },
  },

  mate: {
    kind: 'mate',
    icon: '⚯',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 80, tokensOut: 240 },
    paramsShape: { type: 'mate', from: '', to: '', offset: 0 },
    narrationTemplate: ({ type = 'mate', from = 'face A', to = 'face B', offset = 0 } = {}) => {
      const off = offset ? ` with an offset of ${mm(offset)}` : '';
      return `Apply a ${type} constraint between ${from} and ${to}${off}.`;
    },
  },

  place: {
    kind: 'place',
    icon: '◇',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 30, tokensOut: 140 },
    paramsShape: { component: '', source: 'library', count: 1, link: '' },
    narrationTemplate: ({ component = 'component', source = 'library', count = 1 } = {}) => {
      const src = source === 'vendor' ? 'a vendor part' : source === 'standard' ? 'a standard part' : 'the library';
      return `Place ${count > 1 ? `${count} instances of ` : ''}${component} from ${src} into the assembly.`;
    },
  },

  mirror: {
    kind: 'mirror',
    icon: '⇆',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 40, tokensOut: 140 },
    paramsShape: { plane: 'YZ', features: [] },
    narrationTemplate: ({ plane = 'YZ', features = [] } = {}) => {
      const n = list(features).length || 'the previous';
      return `Mirror ${n === 'the previous' ? n : `${n}`} feature${n === 1 ? '' : 's'} across the ${plane} plane.`;
    },
  },

  pattern: {
    kind: 'pattern',
    icon: '⁝⁝',
    timeEstimateMin: 2,
    cost: { tier: 'haiku', tokensIn: 60, tokensOut: 200 },
    paramsShape: { type: 'rectangular', count: [2, 2], spacing: [10, 10], features: [] },
    narrationTemplate: ({ type = 'rectangular', count = [2, 2], spacing = [10, 10] } = {}) => {
      const c = Array.isArray(count) ? count : [count];
      const s = Array.isArray(spacing) ? spacing : [spacing];
      if (type === 'circular') {
        return `Pattern the feature in a circular array of ${c[0] || 4} instances around the axis.`;
      }
      const total = (c[0] || 1) * (c[1] || 1);
      return `Create a ${c[0] || 1}×${c[1] || 1} rectangular pattern (${total} instances) at ${mm(s[0])} × ${mm(s[1] ?? s[0])} spacing.`;
    },
  },

  split: {
    kind: 'split',
    icon: '⊟',
    timeEstimateMin: 2,
    cost: { tier: 'haiku', tokensIn: 60, tokensOut: 180 },
    paramsShape: { tool: 'plane', keepBoth: true },
    narrationTemplate: ({ tool = 'plane', keepBoth = true } = {}) =>
      `Split the body using the selected ${tool}, ${keepBoth ? 'keeping both halves' : 'discarding the trim side'}.`,
  },

  note: {
    kind: 'note',
    icon: '✎',
    timeEstimateMin: 1,
    cost: { tier: 'haiku', tokensIn: 20, tokensOut: 100 },
    paramsShape: { text: '' },
    narrationTemplate: ({ text = '' } = {}) =>
      text ? `Note: ${text}` : 'Add a design note for this step.',
  },
});

/* ──────────────────────────────────────────────────────────────────────────
   Public API
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Build a step object from a template + parameter overrides. The result is
 * deterministic — same kind + same params + same `seed` always produces the
 * same `id`, so confidence scores stay stable across runs.
 *
 * @param {string} kind              one of TEMPLATE_KINDS
 * @param {object} [paramsOverride]  overrides merged into the template default
 * @param {object} [meta]            { seed, index, title }
 */
export function instantiateStep(kind, paramsOverride = {}, meta = {}) {
  const tpl = TEMPLATES[kind];
  if (!tpl) throw new Error(`build-step-templates: unknown kind "${kind}"`);
  const params = { ...tpl.paramsShape, ...paramsOverride };
  const seed = meta.seed ?? 0;
  const index = meta.index ?? 0;
  const id = `s_${kind}_${stableHash(`${seed}|${index}|${kind}|${JSON.stringify(params)}`)}`;
  const step = {
    id,
    kind,
    title: meta.title || defaultTitle(kind, params),
    params,
    icon: tpl.icon,
    timeEstimateMin: tpl.timeEstimateMin,
    cost: { ...tpl.cost },
    narration: tpl.narrationTemplate(params),
  };
  return step;
}

/**
 * Re-run a step's narration template (e.g. after a `refine()` mutated its
 * params). Returns the new narration string without mutating the step.
 *
 * @param {{kind: string, params: object}} step
 */
export function narrationFor(step) {
  if (!step || !step.kind) return '';
  const tpl = TEMPLATES[step.kind];
  if (!tpl) return '';
  return tpl.narrationTemplate(step.params || {});
}

/**
 * Sum the minute estimates for an array of steps. Honours per-step
 * overrides if the caller has set `step.timeEstimateMin` directly.
 *
 * @param {Array<{kind: string, timeEstimateMin?: number}>} steps
 */
export function timeEstimateMin(steps) {
  if (!Array.isArray(steps)) return 0;
  let total = 0;
  for (const s of steps) {
    if (typeof s.timeEstimateMin === 'number') { total += s.timeEstimateMin; continue; }
    const tpl = TEMPLATES[s.kind];
    if (tpl) total += tpl.timeEstimateMin;
  }
  return total;
}

/**
 * 0..1 score of how diverse and deep the plan is. Higher = looks like a
 * realistic build sequence (sketches followed by features, varied kinds).
 * Used to set `getConfidence().overall` for synthesized plans.
 *
 * @param {Array<{kind: string}>} steps
 * @returns {number}
 */
export function complexityScore(steps) {
  if (!Array.isArray(steps) || steps.length === 0) return 0;
  const kinds = new Set(steps.map(s => s.kind));
  const diversity = Math.min(1, kinds.size / 8);
  const depth     = Math.min(1, steps.length / 12);
  const sketchHits = steps.filter(s => s.kind === 'sketch').length;
  const featureHits = steps.filter(s => ['extrude', 'revolve', 'sweep', 'loft'].includes(s.kind)).length;
  const ratio = sketchHits === 0 ? 0 : Math.min(1, featureHits / Math.max(1, sketchHits));
  return Number(((diversity * 0.4) + (depth * 0.4) + (ratio * 0.2)).toFixed(3));
}

/* ──────────────────────────────────────────────────────────────────────────
   Internals
   ──────────────────────────────────────────────────────────────────────── */

function defaultTitle(kind, params = {}) {
  switch (kind) {
    case 'sketch':  return `Sketch on ${params.plane || 'XY'} plane`;
    case 'extrude': return `Extrude ${mm(params.distance, '?')}`;
    case 'revolve': return `Revolve ${deg(params.angle, '?')} about ${params.axis || 'Y'}`;
    case 'sweep':   return 'Sweep along path';
    case 'loft':    return 'Loft profiles';
    case 'fillet':  return `Fillet R${mm(params.radius, '?')}`;
    case 'chamfer': return `Chamfer ${mm(params.distance, '?')}`;
    case 'hole':   {
      const c = params.count || 1;
      return `Hole ${mm(params.diameter, '?')}${c > 1 ? ` × ${c}` : ''}`;
    }
    case 'shell':   return `Shell t=${mm(params.thickness, '?')}`;
    case 'mate':    return `Mate (${params.type || 'mate'})`;
    case 'place':   return `Place ${params.component || 'component'}`;
    case 'mirror':  return `Mirror across ${params.plane || 'YZ'}`;
    case 'pattern': {
      const c = Array.isArray(params.count) ? params.count : [params.count];
      return `Pattern ${c[0] || 1}×${c[1] || 1}`;
    }
    case 'split':   return 'Split body';
    case 'note':    return 'Note';
    default:        return kind;
  }
}

/**
 * Tiny FNV-1a-ish hash → 8 hex chars. Pure, deterministic, no Web Crypto
 * dependency (which would force this module to be async-init).
 *
 * @param {string} s
 */
function stableHash(s) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
