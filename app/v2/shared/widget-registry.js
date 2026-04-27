/**
 * @file shared/widget-registry.js
 * @description Canonical manifest of every widget in the cycleCAD Suite.
 *
 *   Read by:
 *     - tests/index.html        — to render dashboard rows
 *     - tests/runner.html       — to know which specs to run
 *     - shared/loader.js        — to validate cost/ACL before invoke
 *     - server/meter            — to enforce per-widget ACL + cost
 *     - server/mcp (Phase 5)    — to expose widgets as MCP tools
 *     - apps/<app>/manifest.json — references widget names from here
 *
 *   Single source of truth. Stage 1 ships the full ~115-row manifest with
 *   all widgets in 'stub' state except cam-nav and dro (already 'live').
 *
 * @author  Sachin Kumar
 * @license MIT
 */

/**
 * @typedef {'viewer' | 'designer' | 'engineer' | 'admin' | 'owner'} Role
 *
 * @typedef {Object} WidgetEntry
 * @property {1|2|3|4|5|6}      tier        1 universal → 6 production
 * @property {Role}             minRole     hierarchy: viewer < designer < engineer < admin < owner
 * @property {Object}           freeQuota   per-day per-account allowance
 * @property {Object<string, number>} cost  $CYCLE per method call
 * @property {string[]}         deps        ESM module specifiers needed
 * @property {'stub'|'draft'|'live'|'deprecated'} status
 * @property {string}           source      where the code is extracted from
 * @property {string}           description one-line summary
 * @property {string}           [category]  taxonomy bucket
 */

/** @type {Object<string, WidgetEntry>} */
export const registry = {
  // =====================================================================
  // KERNEL — included for completeness, not strictly widgets
  // =====================================================================
  'loader':         { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'shared/loader.js',         description:'kernel — dynamic widget importer',       category:'kernel' },
  'meter':          { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'shared/meter.js',          description:'kernel — token meter client',            category:'kernel' },
  'ui-primitives':  { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'shared/ui-primitives.js',  description:'kernel — Toast / Modal / Popover',       category:'kernel' },

  // =====================================================================
  // CAT 1 — UNIVERSAL 3D
  // =====================================================================
  'viewport':       { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{ }, deps:['three','three/addons/controls/TrackballControls.js'], status:'live', source:'cycleCAD app.js + ExplodeView app.js + Pentacad sim — combined', description:'universal 3D substrate (scene · camera · lights · render loop · picking · resize)', category:'universal-3d' },
  'cam-nav':        { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{ snap:0, screenshot:5, setProjection:0, setParent:0 }, deps:['three','three/addons/controls/TrackballControls.js'], status:'live', source:'all 3 apps — deduped', description:'ViewCube + projection + parenting + locate + screenshot', category:'universal-3d' },
  'grid':           { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'all 3 apps', description:'configurable grid plane (size · color · snaps)', category:'universal-3d' },
  'axes':           { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'all 3 apps', description:'XYZ gizmo at origin', category:'universal-3d' },
  'lights':         { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'all 3 apps', description:'ambient + directional + optional rim · mode toggle', category:'universal-3d' },
  'picking':        { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'NEW abstraction over Three.js Raycaster', description:'mouse / touch hit-test · emits pick events', category:'universal-3d' },

  // =====================================================================
  // CAT 2 — VISUALIZATION (cross-app, biggest dedup)
  // =====================================================================
  'section-cut':    { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'cycleCAD + ExplodeView + Pentacad — deduped', description:'X/Y/Z clipping plane · global + per-material', category:'visualization' },
  'wireframe':      { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'all 3 apps', description:'wireframe overlay toggle', category:'visualization' },
  'fit-to-selection': { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'all 3 apps', description:'animated camera fit to selected object', category:'visualization' },
  'transparency':   { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'cycleCAD + ExplodeView', description:'per-part or all-parts opacity slider', category:'visualization' },
  'isolate':        { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'all 3 apps', description:'hide all but selection', category:'visualization' },
  'screenshot':     { tier:1, minRole:'viewer', freeQuota:{calls:20}, cost:{ capture: 5 }, deps:['three'], status:'live', source:'all 3 apps', description:'high-res PNG capture from current camera', category:'visualization' },
  'blueprint':      { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'ExplodeView', description:'white-bg + blue-wireframe theme override', category:'visualization' },
  'hero-shot':      { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ render: 50 }, deps:['three'], status:'live', source:'ExplodeView', description:'4-angle render set for marketing', category:'visualization' },
  'dro':            { tier:4, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD + Pentacad — deduped', description:'X/Y/Z/A/B/T live position read-out · inch/mm toggle', category:'visualization' },

  // =====================================================================
  // CAT 3 — I/O
  // =====================================================================
  'step-import':    { tier:2, minRole:'designer', freeQuota:{calls:5},  cost:{ import: 5 },  deps:['three','shared/lib/inventor-parser.js','occt-wasm'], status:'live', source:'cycleCAD inventor-parser.js + occt-import-js', description:'STEP / STP / IPT loader with progress', category:'io' },
  'glb-loader':     { tier:2, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{}, deps:['three','three/addons/loaders/GLTFLoader.js'], status:'live', source:'all 3 apps', description:'GLB / glTF binary loader', category:'io' },
  'stl-export':     { tier:2, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'cycleCAD export.js + ExplodeView', description:'STL ASCII + binary export', category:'io' },
  'obj-export':     { tier:2, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'cycleCAD export.js', description:'OBJ + MTL export', category:'io' },
  'gltf-export':    { tier:2, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:['three','three/addons/exporters/GLTFExporter.js'], status:'live', source:'cycleCAD export.js', description:'glTF 2.0 export', category:'io' },
  'dxf-export':     { tier:2, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD/app/js/dxf-export.js (1,174 lines)', description:'2D sketch + 3D projection + multi-view drawing', category:'io' },
  'pdf-export':     { tier:2, minRole:'designer', freeQuota:{calls:5}, cost:{ render: 5 }, deps:['three'], status:'live', source:'cycleCAD fusion-drawing.js', description:'paper-size PDF with title block', category:'io' },
  'bom-csv':        { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ export: 50 }, deps:[], status:'live', source:'cycleCAD assembly-resolver.js + ExplodeView', description:'BOM table → CSV with quantities', category:'io' },
  'occt-wasm':      { tier:2, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'opencascade.js wrapper (50MB binary)', description:'OCCT WASM kernel — heavy, lazy-loaded', category:'io' },
  'dwg':            { tier:2, minRole:'designer', freeQuota:{calls:5}, cost:{ export: 5 }, deps:[], status:'live', source:'NEW (dwg-write polyfill)', description:'DWG export · best-effort via teigha-style writer', category:'io' },

  // =====================================================================
  // CAT 4 — SKETCH (cycleCAD)
  // =====================================================================
  'sketch-line':              { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD sketch.js (899 lines)', description:'2D line draw with snapping', category:'sketch' },
  'sketch-circle':            { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD sketch.js', description:'2D circle (center + radius / 3-point)', category:'sketch' },
  'sketch-rect':              { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD sketch.js', description:'2D rectangle (corner + corner / center + size)', category:'sketch' },
  'sketch-arc':               { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD sketch.js', description:'2D arc (3-point / center + 2 endpoints)', category:'sketch' },
  'sketch-polyline':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD sketch.js', description:'2D connected line segments', category:'sketch' },
  'sketch-point':             { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD sketch.js', description:'2D reference point', category:'sketch' },
  'sketch-constraint-solver': { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD constraint-solver.js (1,047 lines)', description:'12 constraint types · iterative relaxation · DOF', category:'sketch' },

  // =====================================================================
  // CAT 5 — SOLID OPS (cycleCAD)
  // =====================================================================
  'extrude':        { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD operations.js', description:'extrude profile to 3D solid', category:'solid' },
  'revolve':        { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD operations.js', description:'revolve profile around axis', category:'solid' },
  'sweep':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three'], status:'live', source:'cycleCAD advanced-ops.js', description:'sweep profile along path · twist + scale', category:'solid' },
  'loft':           { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three'], status:'live', source:'cycleCAD advanced-ops.js', description:'loft between profiles · auto resampling', category:'solid' },
  'hole':           { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three','shared/lib/three-bvh-csg.js'], status:'live', source:'cycleCAD operations.js + cycleCAD ai-copilot subtractFromBody', description:'cylindrical hole via CSG', category:'solid' },
  'thread':         { tier:3, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three'], status:'live', source:'cycleCAD advanced-ops.js', description:'helical thread (male / female)', category:'solid' },
  'fillet':         { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three','shared/lib/three-bvh-csg.js'], status:'live', source:'cycleCAD operations.js', description:'edge fillet (real B-rep when occt-wasm loaded)', category:'solid' },
  'chamfer':        { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD operations.js', description:'edge chamfer', category:'solid' },
  'shell':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three'], status:'live', source:'cycleCAD operations.js', description:'hollow body · uniform wall thickness', category:'solid' },
  'draft':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD fusion-solid.js', description:'apply draft angle to faces', category:'solid' },
  'scale':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 0 }, deps:['three'], status:'live', source:'cycleCAD operations.js', description:'uniform / non-uniform scale', category:'solid' },
  'combine':        { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three','shared/lib/three-bvh-csg.js'], status:'live', source:'cycleCAD operations.js', description:'CSG union / cut / intersect', category:'solid' },
  'split':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three','shared/lib/three-bvh-csg.js'], status:'live', source:'cycleCAD fusion-solid.js', description:'split body by plane / surface', category:'solid' },
  'mirror':         { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD operations.js', description:'mirror across plane', category:'solid' },
  'pattern':        { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD operations.js', description:'rectangular + circular pattern', category:'solid' },

  // =====================================================================
  // CAT 6 — ASSEMBLY (cycleCAD + ExplodeView)
  // =====================================================================
  'mate-constraint':{ tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD assembly.js (1,103 lines)', description:'mate (coincident · concentric · parallel · …)', category:'assembly' },
  'joint':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD fusion-assembly.js', description:'7 joint types — revolute · slider · pin-slot · …', category:'assembly' },
  'motion-study':   { tier:3, minRole:'engineer', freeQuota:{calls:5}, cost:{ run: 50 }, deps:['three'], status:'live', source:'cycleCAD fusion-assembly.js', description:'animate joints over time', category:'assembly' },
  'explode-slider': { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'ExplodeView app.js + cycleCAD assembly.js — deduped', description:'separation slider for assembly', category:'assembly' },
  'interference':   { tier:3, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{ check: 20 }, deps:['three','shared/lib/three-bvh-csg.js'], status:'live', source:'cycleCAD fusion-assembly.js + ExplodeView clearance-checker', description:'detect overlaps between bodies', category:'assembly' },
  'contact-set':    { tier:3, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three'], status:'live', source:'cycleCAD fusion-assembly.js', description:'group bodies that share contact', category:'assembly' },

  // =====================================================================
  // CAT 7 — SURFACE / SHEET (cycleCAD)
  // =====================================================================
  't-spline':       { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three'], status:'live', source:'cycleCAD fusion-surface.js (949 lines)', description:'T-spline sculpt surface', category:'surface' },
  'nurbs':          { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 10 }, deps:['three'], status:'live', source:'cycleCAD fusion-surface.js', description:'NURBS surface tools', category:'surface' },
  'sheet-bend':     { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD advanced-ops.js', description:'sheet metal bend with k-factor', category:'surface' },
  'flange':         { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD advanced-ops.js', description:'sheet metal flange', category:'surface' },
  'unfold':         { tier:3, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ op: 5 }, deps:['three'], status:'live', source:'cycleCAD advanced-ops.js', description:'flat-pattern unfold sheet metal', category:'surface' },

  // =====================================================================
  // CAT 8 — CAM (Pentacad)
  // =====================================================================
  'cam-contour':    { tier:6, minRole:'engineer', freeQuota:{calls:5}, cost:{ gen: 300 }, deps:['three'], status:'live', source:'Pentacad pentacad-cam.js (1,000 lines)', description:'2D contour milling', category:'cam' },
  'cam-pocket':     { tier:6, minRole:'engineer', freeQuota:{calls:5}, cost:{ gen: 300 }, deps:['three'], status:'live', source:'Pentacad pentacad-cam.js', description:'pocket milling with offsets', category:'cam' },
  'cam-drill':      { tier:6, minRole:'engineer', freeQuota:{calls:5}, cost:{ gen: 100 }, deps:['three'], status:'live', source:'Pentacad pentacad-cam.js', description:'drill cycle (G83/G73)', category:'cam' },
  'cam-adaptive':   { tier:6, minRole:'engineer', freeQuota:{calls:5}, cost:{ gen: 500 }, deps:['three'], status:'live', source:'Pentacad pentacad-cam.js', description:'adaptive clear concentric-ring', category:'cam' },
  'cam-face':       { tier:6, minRole:'engineer', freeQuota:{calls:5}, cost:{ gen: 200 }, deps:['three'], status:'live', source:'Pentacad pentacad-cam.js', description:'face mill operation', category:'cam' },
  'cam-chamfer':    { tier:6, minRole:'engineer', freeQuota:{calls:5}, cost:{ gen: 200 }, deps:['three'], status:'live', source:'Pentacad pentacad-cam.js', description:'chamfer / deburr V-bit engagement', category:'cam' },
  'cam-bore':       { tier:6, minRole:'engineer', freeQuota:{calls:5}, cost:{ gen: 200 }, deps:['three'], status:'live', source:'Pentacad pentacad-cam.js', description:'bore + thread-mill (helix-bore)', category:'cam' },
  'post-processor': { tier:6, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{ post:50 }, deps:['shared/machines/index.js','shared/postprocessors/penta-machine.cps'], status:'live', source:'NEW · port of Penta Machine Fusion 360 post (vendor: Autodesk + Penta Machine)', description:'Penta Machine NGC emitter · Kinetic Control dialect · per-motion envelope check · in-app + Fusion 360 download', category:'cam' },
  'gcode-editor':   { tier:4, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'Pentacad pentacad-sim.html editor + cycleCAD fusion-cam.js', description:'syntax-highlighted line-numbered editor with markers', category:'cam' },
  'sim-executor':   { tier:6, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'Pentacad pentacad-sim.js (1,033 lines)', description:'G-code parser + executor + animator', category:'cam' },
  'pentacad-simulator':{ tier:6, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{ load:5 }, deps:['three','three/addons/controls/TrackballControls.js','three/addons/loaders/GLTFLoader.js','shared/machines/index.js'], status:'live', source:'NEW · sim.pentamachine.com look-and-feel clone (auto-hide chrome · TrackballControls · optional GLB)', description:'5-axis kinematic simulator · floating playback bar · DRO · G-code panel · Penta yellow accent · GLB drop-in', category:'cam' },
  'rockhopper-bridge':{ tier:6, minRole:'engineer', freeQuota:{run_min: 5}, cost:{ stream_min: 50 }, deps:[], status:'live', source:'Pentacad pentacad-bridge.js (530 lines)', description:'WebSocket bridge to Rockhopper / LinuxCNC', category:'cam' },
  'jog-pad':        { tier:6, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'Pentacad pentacad.html jog UI', description:'manual jog buttons + step / continuous toggle', category:'cam' },
  'machine-picker': { tier:6, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{ pick:5 }, deps:['shared/machines/index.js'], status:'live', source:'NEW · catalog at shared/machines/penta.json', description:'Penta Machine catalog: V2-50 (default · Matt-confirmed envelope) · Solo · V2-10 · V2-8L · V1 · TCPC flag · units toggle · post download · KCUR wiki link', category:'cam' },
  'playback':       { tier:6, minRole:'engineer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'Pentacad transport bar', description:'play / pause / step / timeline / speed · auto-hide', category:'cam' },

  // =====================================================================
  // CAT 9 — ANALYSIS (cycleCAD + ExplodeView)
  // =====================================================================
  'measure':              { tier:4, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'all 3 apps', description:'distance / angle / area measurement', category:'analysis' },
  'weight-estimator':     { tier:4, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'ExplodeView weight-estimator', description:'BBox volume × material density', category:'analysis' },
  'part-comparison':      { tier:4, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'ExplodeView part-comparison', description:'side-by-side dimensional diff', category:'analysis' },
  'fea':                  { tier:4, minRole:'engineer', freeQuota:{calls:5}, cost:{ run: 1000 }, deps:['three'], status:'live', source:'cycleCAD fusion-simulation.js (~600 lines)', description:'linear static FEA · Von Mises stress', category:'analysis' },
  'thermal':              { tier:4, minRole:'engineer', freeQuota:{calls:5}, cost:{ run: 500 }, deps:['three'], status:'live', source:'cycleCAD fusion-simulation.js', description:'steady-state thermal analysis', category:'analysis' },
  'modal':                { tier:4, minRole:'engineer', freeQuota:{calls:5}, cost:{ run: 500 }, deps:['three'], status:'live', source:'cycleCAD fusion-simulation.js', description:'modal frequency analysis', category:'analysis' },
  'buckling':             { tier:4, minRole:'engineer', freeQuota:{calls:5}, cost:{ run: 500 }, deps:['three'], status:'live', source:'cycleCAD fusion-simulation.js', description:'buckling load factor', category:'analysis' },
  'design-review':        { tier:4, minRole:'designer', freeQuota:{calls:5}, cost:{ run: 200 }, deps:['three'], status:'live', source:'cycleCAD ai-copilot validate', description:'A-F score with per-issue fixes', category:'analysis' },
  'dfm-check':            { tier:4, minRole:'engineer', freeQuota:{calls:5}, cost:{ run: 100 }, deps:['three'], status:'live', source:'cycleCAD killer-features manufacturability', description:'Design-for-Manufacturing rule checks', category:'analysis' },
  'ai-engineering-analyst':{ tier:4, minRole:'engineer', freeQuota:{calls:5}, cost:{ run: 200 }, deps:[], status:'live', source:'cycleCAD ai-engineer.js (~1,400 lines)', description:'bolted-joint / gear / shaft / bearing / weld analysis', category:'analysis' },

  // =====================================================================
  // CAT 10 — AI
  // =====================================================================
  'ai-copilot':     { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ run: 200 }, deps:[], status:'live', source:'cycleCAD ai-copilot.js (~900 lines)', description:'NL → CAD geometry composer with cost preview', category:'ai' },
  'ai-render':      { tier:5, minRole:'designer', freeQuota:{calls:3}, cost:{ render: 500 }, deps:[], status:'live', source:'ExplodeView buildPrompt + Gemini Nano-Banana', description:'preservation-first AI scene render', category:'ai' },
  'ai-narrator':    { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ run: 100 }, deps:[], status:'live', source:'ExplodeView killer-features ai-part-narrator', description:'AI explains what a part does + how it fails', category:'ai' },
  'ai-vision-id':   { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ run: 200 }, deps:[], status:'live', source:'ExplodeView ai-vision-identifier (~400 lines)', description:'photo / render → standard part ID + McMaster link', category:'ai' },
  'ai-chatbot':     { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ msg: 5 }, deps:[], status:'live', source:'cycleCAD ai-chat.js (992 lines)', description:'Gemini + Groq + offline NLP fallback', category:'ai' },
  'ai-search-nl':   { tier:5, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'ExplodeView smart-nl-search', description:'natural-language part search', category:'ai' },
  'ai-batch-scan':  { tier:5, minRole:'designer', freeQuota:{calls:1}, cost:{ run: 1000 }, deps:[], status:'live', source:'ExplodeView batch-ai-scan', description:'bulk classify every part in an assembly', category:'ai' },

  // =====================================================================
  // CAT 11 — DOCUMENTATION (ExplodeView-heavy)
  // =====================================================================
  'annotations':    { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:['three'], status:'live', source:'ExplodeView annotations', description:'click-to-place 3D pins · editable · draggable', category:'documentation' },
  'qr-code':        { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:['qrcode-generator'], status:'live', source:'ExplodeView qr-code', description:'QR per part with deep-link to assembly', category:'documentation' },
  'manual-builder': { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ build: 200 }, deps:[], status:'live', source:'ExplodeView interactive-manual', description:'auto step-by-step manual from assembly', category:'documentation' },
  'tech-report':    { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ build: 100 }, deps:[], status:'live', source:'ExplodeView technical-report-export', description:'full HTML technical report', category:'documentation' },
  'kb-article':     { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ build: 50 }, deps:[], status:'live', source:'NEW', description:'KB article from a resolved issue', category:'documentation' },
  'standards-id':   { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'ExplodeView standards-identifier', description:'DIN / ISO standard part identifier', category:'documentation' },
  'mcmaster-search':{ tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'ExplodeView mcmaster integration', description:'McMaster-Carr search URL builder', category:'documentation' },
  'kiri-moto-export':{ tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'ExplodeView kiri-moto', description:'Kiri:Moto FDM/CNC/laser/SLA export', category:'documentation' },

  // =====================================================================
  // CAT 12 — ADMIN  (all minRole='admin')
  // =====================================================================
  // Wave 1 — production-required
  // ---- $CYCLE token primitives (used by every app) ----
  'token-balance':        { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'inline $CYCLE balance badge · auto-poll', category:'token' },
  'token-recharge':       { tier:1, minRole:'viewer', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'recharge dialog · admin issues, others request', category:'token' },

  'admin-overview':       { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'KPI cards · live tiles · 24h overview', category:'admin' },
  'admin-users':          { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'list · invite · role-assign · disable users', category:'admin' },
  'admin-api-keys':       { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'generate · scope · revoke API keys', category:'admin' },
  'admin-tokens':         { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD token-dashboard.js (563 lines)', description:'balance browser · credit · refund', category:'admin' },
  'admin-audit':          { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'hash-chained ledger viewer · verifier', category:'admin' },
  'admin-widget-registry':{ tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'edit pricing · ACL · version per widget', category:'admin' },
  'admin-widget-stats':   { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'P50/P95/P99 latency · errors · top callers', category:'admin' },
  'admin-health':         { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'service status · error logs · restart', category:'admin' },
  // Wave 2 — SaaS-required
  'admin-realtime':       { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'live tail of meter calls + errors', category:'admin' },
  'admin-tenants':        { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'multi-tenant orgs (SaaS only)', category:'admin' },
  'admin-payments':       { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'Stripe webhooks · failed charges · payouts', category:'admin' },
  'admin-files':          { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'S3 / MinIO browser per tenant', category:'admin' },
  'admin-repo':           { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'git log · last deploy · rollback (Docker)', category:'admin' },
  'admin-ops':            { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'backups · migrations · feature flags · kill-switch', category:'admin' },
  'admin-compliance':     { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'SOC-2 evidence · GDPR data export / erasure', category:'admin' },
  // Wave 3 — marketplace
  'admin-workflows':      { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'workflow run history · success rate · cost', category:'admin' },
  'admin-agents':         { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'NEW', description:'MCP tool calls · AI Copilot conversations', category:'admin' },
  'admin-marketplace':    { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{}, deps:[], status:'live', source:'cycleCAD marketplace.js (1,994 lines)', description:'pending listings · reviews · royalty payouts', category:'admin' },

  // =====================================================================
  // CAT 13 — LIBRARY LAYER (Use Case 1: Inventor reverse-engineer)
  // Imports an Inventor project, builds the library tree, walks the user
  // through reconstruction step-by-step, auto-generates drawings, and
  // packages the whole thing as a replayable work package.
  // =====================================================================
  // -- Import / library navigation --
  'inventor-project-loader': { tier:2, minRole:'designer', freeQuota:{calls:5}, cost:{ pickFolder:0, parseProject:50, importToServer:200 }, deps:['shared/inventor/index.js'], status:'live', source:'NEW · port of cycleCAD/app/js/project-loader.js + inventor-parser.js', description:'pick an Inventor folder, parse .ipj/.iam/.ipt, hydrate library', category:'library' },
  'library-browser':         { tier:2, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{ loadProject:5 }, deps:[], status:'live', source:'NEW · port of cycleCAD/app/js/project-browser.js (741 lines)', description:'Fusion-style folder tree · filters · right-click context · search', category:'library' },
  'project-tree':            { tier:2, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{ loadAssembly:5 }, deps:[], status:'live', source:'NEW', description:'single-project component graph · breadcrumb · mini SVG topology', category:'library' },
  'attachment-manager':      { tier:2, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ addAttachment:10 }, deps:[], status:'live', source:'NEW', description:'drag-drop PDFs / photos / notes · grid preview · modal viewer', category:'library' },
  'version-history':         { tier:2, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{ loadHistory:5, restoreVersion:25 }, deps:[], status:'live', source:'NEW', description:'git-style timeline per component · compare · tag · restore', category:'library' },

  // -- Drawings --
  'drawing-generator':       { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ generateForComponent:200, generateSection:100, generateDetail:50 }, deps:['three','shared/lib/three-imports.js'], status:'live', source:'NEW · port of cycleCAD/app/js/fusion-drawing.js', description:'auto base/iso/section/detail views · SVG sheet · cache-aware', category:'library' },
  'drawing-template':        { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ applyTemplate:0 }, deps:[], status:'live', source:'NEW', description:'title-block templates · A4/A3/A2/A1/A0/letter/tabloid · ISO/DIN/ASME', category:'library' },
  'drawing-link':            { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ checkSync:5, regenerate:200 }, deps:[], status:'live', source:'NEW', description:'live drawing → source link · drift detect · regenerate', category:'library' },
  'drawing-batch':           { tier:5, minRole:'designer', freeQuota:{calls:1}, cost:{ start:50 }, deps:['shared/loader.js'], status:'live', source:'NEW', description:'batch-run drawing-generator across whole project · streaming results', category:'library' },

  // -- Reverse-engineer + tutorial engine --
  'reverse-engineer':        { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ analyze:300, refine:200, exportToTutorial:100 }, deps:['shared/build-step-templates.js'], status:'live', source:'NEW · port of cycleCAD/app/js/reverse-engineer.js', description:'analyze parsed .ipt → synthesize sketch→extrude→fillet→… build sequence with confidence', category:'library' },
  'rebuild-guide':           { tier:5, minRole:'designer', freeQuota:{calls:Infinity}, cost:{ showStep:5 }, deps:['three'], status:'live', source:'NEW · port of cycleCAD/app/js/rebuild-guide.js', description:'visual companion to reverse-engineer · highlights affected mesh per step', category:'library' },
  'tutorial-author':         { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ synthesize:200, save:25 }, deps:['shared/tutorial-schema.js'], status:'live', source:'NEW', description:'author replayable tutorial JSON · drag-reorder steps · capture viewport · validate', category:'library' },
  'tutorial-player':         { tier:2, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{ load:50, advance:5, replay:50 }, deps:['three','shared/tutorial-schema.js'], status:'live', source:'NEW', description:'play a tutorial step-by-step with viewport sync · narration card · scrubber', category:'library' },

  // -- Bundling + orchestration --
  'export-bundle':           { tier:5, minRole:'designer', freeQuota:{calls:5}, cost:{ bundle:300 }, deps:[], status:'live', source:'NEW', description:'zip up STL+STEP+BOM+drawings+manifest · STORE-only ZIP writer · CRC32', category:'library' },
  'work-package-summary':    { tier:2, minRole:'viewer',   freeQuota:{calls:Infinity}, cost:{ refresh:5 }, deps:[], status:'live', source:'NEW', description:'project-wide KPI dashboard · components/drawings/tutorials/attachments tiles · activity feed', category:'library' },
  'work-package-builder':    { tier:5, minRole:'designer', freeQuota:{calls:1}, cost:{ build:1000 }, deps:['shared/loader.js'], status:'live', source:'NEW', description:'orchestrator · import → parse → reverse-engineer → tutorials → drawings → bundle pipeline', category:'library' },

  // =====================================================================
  // CAT 14 — PLATFORM / OUTREACH (Stage 2.8/2.9: cross-suite admin)
  // OutreachPro 7-layer integration (cold-email + AI + Gmail/Apify MCP)
  // and the cross-cutting infrastructure dashboard for Docker/MCP/Web/DBs
  // =====================================================================
  'admin-outreach-pro':      { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{ composeDraft:200, runScrape:300, replyToThread:50 }, deps:[], status:'live', source:'NEW · OutreachPro 7-layer port', description:'cold-email · Pipeline kanban · Composer · Unibox · Leads · Scrapers · AI copilot · Integrations · Analytics · Settings (10 tabs)', category:'outreach' },
  'admin-platform-overview': { tier:6, minRole:'admin', freeQuota:{calls:Infinity}, cost:{ refresh:5 }, deps:[], status:'live', source:'NEW', description:'cross-cutting infra · Docker · MCP server · Web hosting · Databases · Distribution channels (5 tabs)', category:'platform' },
};

// =========================================================================
// Helpers
// =========================================================================

/** @returns {string[]} every widget name in registry order */
export function names() { return Object.keys(registry); }

/** @returns {WidgetEntry|null} */
export function get(name) { return registry[name] || null; }

/** Filter by status */
export function byStatus(status) {
  return Object.entries(registry)
    .filter(([, w]) => w.status === status)
    .map(([n]) => n);
}

/** Filter by category */
export function byCategory(category) {
  return Object.entries(registry)
    .filter(([, w]) => w.category === category)
    .map(([n]) => n);
}

/** Aggregate counts for the dashboard. */
export function counts() {
  const total = Object.keys(registry).length;
  const live  = byStatus('live').length;
  const stub  = byStatus('stub').length;
  const draft = byStatus('draft').length;
  return { total, live, stub, draft };
}

/**
 * RBAC role hierarchy. Higher index = more privileged.
 * @type {Role[]}
 */
export const ROLES = ['viewer', 'designer', 'engineer', 'admin', 'owner'];

/**
 * @param {Role} actorRole
 * @param {Role} required
 * @returns {boolean}
 */
export function roleSatisfies(actorRole, required) {
  return ROLES.indexOf(actorRole) >= ROLES.indexOf(required);
}
