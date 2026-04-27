/**
 * @file shared/tutorial-schema.js
 * @description Tutorial DSL — JSON schema, validator, topo-sort, templates.
 *
 *   A Tutorial is a step-by-step replayable walkthrough of how a part / sub
 *   assembly / assembly was built. Each step references prior step IDs as
 *   `inputs` to form a DAG. The player walks the DAG in topological order
 *   while syncing the 3D viewport and narrating with AI text.
 *
 *   This module is pure (no DOM, no network) so both the author widget and
 *   the player widget can import it.
 *
 * @author  Sachin Kumar
 * @license MIT
 */

/**
 * @typedef {'sketch'|'extrude'|'revolve'|'sweep'|'loft'|'fillet'|'chamfer'|'hole'|'pattern'|'shell'|'mate'|'place'|'mirror'|'split'|'note'|'view'|'measure'} TutorialStepKind
 *
 * @typedef {Object} TutorialStep
 * @property {string} id                       unique within the tutorial
 * @property {TutorialStepKind} kind
 * @property {string} title
 * @property {string} narration                AI-generated paragraph
 * @property {Object} params                   step-specific parameters
 * @property {string[]} inputs                 prior step IDs this depends on
 * @property {Object} viewport                 camera target / position / fit
 * @property {string[]} mediaRefs              optional thumbnail / GIF / SVG paths
 *
 * @typedef {Object} Tutorial
 * @property {string} id
 * @property {string} componentId              the part/assembly this documents
 * @property {string} title
 * @property {string} description
 * @property {'part'|'assembly'|'subassembly'|'component'|'project'} scope
 * @property {string} createdAt                ISO timestamp
 * @property {string} author
 * @property {TutorialStep[]} steps
 * @property {{minutes:number, complexity:'low'|'medium'|'high'}} estimatedTime
 */

export const STEP_KINDS = Object.freeze([
  'sketch', 'extrude', 'revolve', 'sweep', 'loft',
  'fillet', 'chamfer', 'hole', 'pattern', 'shell',
  'mate', 'place', 'mirror', 'split',
  'note', 'view', 'measure',
]);

export const SCOPE_KINDS = Object.freeze([
  'part', 'assembly', 'subassembly', 'component', 'project',
]);

const STEP_DEFAULTS = Object.freeze({
  sketch:  { plane: 'XY', profile: '', dimensions: {} },
  extrude: { distance: 10, direction: 'normal', operation: 'add' },
  revolve: { axis: 'Y', angle: 360, operation: 'add' },
  sweep:   { profile: '', path: '', operation: 'add' },
  loft:    { profiles: [], rails: [], operation: 'add' },
  fillet:  { radius: 1, edges: [] },
  chamfer: { distance: 1, edges: [] },
  hole:    { kind: 'simple', diameter: 5, depth: 10 },
  pattern: { kind: 'linear', count: 4, spacing: 10, axis: 'X' },
  shell:   { thickness: 1, removeFaces: [] },
  mate:    { kind: 'coincident', a: '', b: '', offset: 0 },
  place:   { component: '', transform: { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 } },
  mirror:  { plane: 'XY', features: [] },
  split:   { tool: '', keepBoth: true },
  note:    { text: '' },
  view:    { kind: 'iso' },
  measure: { kind: 'distance', a: '', b: '', value: 0, unit: 'mm' },
});

const NARRATION_TEMPLATES = Object.freeze({
  sketch:  'Start a new sketch on the {plane} plane and draw the profile shown.',
  extrude: 'Extrude the active profile {distance} mm in the {direction} direction.',
  revolve: 'Revolve the profile {angle}° about the {axis} axis.',
  sweep:   'Sweep the profile along the selected path.',
  loft:    'Loft between the selected profiles to form a smooth transition.',
  fillet:  'Apply a {radius} mm fillet to the selected edges.',
  chamfer: 'Chamfer the selected edges by {distance} mm.',
  hole:    'Place a {kind} hole of Ø{diameter} mm × {depth} mm deep.',
  pattern: 'Pattern the selected feature {count}× along the {axis} axis.',
  shell:   'Shell the body to a wall thickness of {thickness} mm.',
  mate:    'Apply a {kind} mate between the selected entities.',
  place:   'Place component "{component}" at the indicated position.',
  mirror:  'Mirror the selected features about the {plane} plane.',
  split:   'Split the body using the selected tool.',
  note:    '{text}',
  view:    'Set the camera to a {kind} view.',
  measure: 'Measure: {value} {unit}.',
});

/**
 * Returns a fresh skeleton step for the given kind.
 * @param {TutorialStepKind} kind
 * @returns {TutorialStep}
 */
export function templateForKind(kind) {
  if (!STEP_KINDS.includes(kind)) {
    throw new Error(`templateForKind: unknown kind "${kind}"`);
  }
  const params = JSON.parse(JSON.stringify(STEP_DEFAULTS[kind] || {}));
  const narration = renderTemplate(NARRATION_TEMPLATES[kind] || '', params);
  return {
    id: `step_${kind}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: titleForKind(kind),
    narration,
    params,
    inputs: [],
    viewport: null,
    mediaRefs: [],
  };
}

function titleForKind(kind) {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function renderTemplate(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_m, k) =>
    vars && vars[k] != null ? String(vars[k]) : `{${k}}`);
}

/**
 * Validate a tutorial. Returns `{ok, errors}`. Checks shape, ID uniqueness,
 * dependency graph (no cycles, all `inputs` resolve).
 * @param {Tutorial} t
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateTutorial(t) {
  const errors = [];
  if (!t || typeof t !== 'object') return { ok: false, errors: ['tutorial must be an object'] };
  if (typeof t.id !== 'string' || !t.id)            errors.push('id required');
  if (typeof t.componentId !== 'string' || !t.componentId) errors.push('componentId required');
  if (typeof t.title !== 'string' || !t.title)      errors.push('title required');
  if (!SCOPE_KINDS.includes(t.scope))               errors.push(`scope must be one of ${SCOPE_KINDS.join('|')}`);
  if (!Array.isArray(t.steps))                      errors.push('steps must be array');

  const steps = Array.isArray(t.steps) ? t.steps : [];
  const seen = new Set();
  for (const s of steps) {
    if (!s || typeof s !== 'object') { errors.push('step must be object'); continue; }
    if (typeof s.id !== 'string' || !s.id) { errors.push('step.id required'); continue; }
    if (seen.has(s.id))                errors.push(`duplicate step id: ${s.id}`);
    seen.add(s.id);
    if (!STEP_KINDS.includes(s.kind))  errors.push(`step ${s.id}: kind must be one of ${STEP_KINDS.join('|')}`);
    if (typeof s.title !== 'string')   errors.push(`step ${s.id}: title required`);
    if (!Array.isArray(s.inputs))      errors.push(`step ${s.id}: inputs must be array`);
  }
  // resolve inputs
  for (const s of steps) {
    if (!Array.isArray(s.inputs)) continue;
    for (const dep of s.inputs) {
      if (!seen.has(dep)) errors.push(`step ${s.id}: unresolved input "${dep}"`);
    }
  }
  // cycle detection via Kahn
  if (errors.length === 0) {
    const sorted = topoSortSteps(t);
    if (sorted.length !== steps.length) errors.push('dependency graph has a cycle');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Topologically sort steps using Kahn's algorithm. Steps with unresolved
 * inputs are appended at the end so the player still gets a stable order
 * when validation has already failed.
 * @param {Tutorial} t
 * @returns {TutorialStep[]}
 */
export function topoSortSteps(t) {
  const steps = Array.isArray(t?.steps) ? t.steps : [];
  const byId = new Map(steps.map(s => [s.id, s]));
  const indeg = new Map(steps.map(s => [s.id, 0]));
  const out = new Map(steps.map(s => [s.id, []]));
  for (const s of steps) {
    for (const dep of (s.inputs || [])) {
      if (!byId.has(dep)) continue;
      indeg.set(s.id, (indeg.get(s.id) || 0) + 1);
      out.get(dep).push(s.id);
    }
  }
  const queue = [];
  for (const [id, n] of indeg) if (n === 0) queue.push(id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(byId.get(id));
    for (const n of out.get(id) || []) {
      indeg.set(n, indeg.get(n) - 1);
      if (indeg.get(n) === 0) queue.push(n);
    }
  }
  return order;
}

/**
 * One-line summary: "12 steps · sketch ×3 · extrude ×4 · fillet ×2 · ~25 min"
 * @param {Tutorial} t
 * @returns {string}
 */
export function summarizeTutorial(t) {
  const steps = Array.isArray(t?.steps) ? t.steps : [];
  const counts = {};
  for (const s of steps) counts[s.kind] = (counts[s.kind] || 0) + 1;
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ×${n}`);
  const mins = t?.estimatedTime?.minutes;
  const head = `${steps.length} step${steps.length === 1 ? '' : 's'}`;
  const time = Number.isFinite(mins) ? ` · ~${mins} min` : '';
  return [head, ...parts].join(' · ') + time;
}

/**
 * Build an empty tutorial shell.
 * @param {Partial<Tutorial>} overrides
 * @returns {Tutorial}
 */
export function emptyTutorial(overrides = {}) {
  return {
    id: overrides.id || `tut_${Math.random().toString(36).slice(2, 10)}`,
    componentId:  overrides.componentId  || '',
    title:        overrides.title        || 'Untitled tutorial',
    description:  overrides.description  || '',
    scope:        overrides.scope        || 'part',
    createdAt:    overrides.createdAt    || new Date().toISOString(),
    author:       overrides.author       || 'anon',
    steps:        Array.isArray(overrides.steps) ? overrides.steps : [],
    estimatedTime: overrides.estimatedTime || { minutes: 0, complexity: 'low' },
  };
}
