/**
 * Help System Module for cycleCAD
 * Interactive tutorials, tooltips, searchable help panel, keyboard shortcut reference
 * Version 1.0.0
 */

const HelpModule = {
  id: 'help',
  name: 'Help System',
  version: '1.0.0',
  category: 'service',
  dependencies: [],
  memoryEstimate: 5,

  init() {
    this.isOpen = false;
    this.activeTutorial = null;
    this.currentStep = 0;
    this.tooltips = new Map();
    this.helpEntries = this.buildHelpEntries();
    this.tutorials = this.buildTutorials();
    this.shortcuts = this.buildShortcuts();

    this.setupUI();
    this.setupEventListeners();
    this.registerDefaultTooltips();

    window.dispatchEvent(new CustomEvent('help:initialized', { detail: this }));
  },

  // ========== HELP ENTRIES DATABASE ==========
  buildHelpEntries() {
    return {
      'getting-started': [
        {
          id: 'first-part',
          title: 'Create Your First Part',
          desc: 'Learn how to sketch a 2D profile and extrude it into 3D. This is the foundation of CAD modeling.',
          shortcut: null,
          tutorial: 'first-part',
        },
        {
          id: 'ai-copilot',
          title: 'Use the AI Copilot',
          desc: 'Ask the AI to generate parts, modify designs, and answer CAD questions in natural language.',
          shortcut: 'Ctrl+/',
          tutorial: 'ai-copilot',
        },
        {
          id: 'keyboard-basics',
          title: 'Keyboard Shortcuts (Basics)',
          desc: 'Essential shortcuts: Sketch (K), Extrude (E), Undo (Z), Pan (Middle-click), Zoom (Scroll).',
          shortcut: '?',
          tutorial: null,
        },
        {
          id: 'saving',
          title: 'Save and Load Your Work',
          desc: 'Auto-save to browser storage. Export to STL, OBJ, glTF. Import STEP files from CAD software.',
          shortcut: 'Ctrl+S',
          tutorial: null,
        },
        {
          id: 'export-basics',
          title: 'Export Your Model',
          desc: 'Export to STL for 3D printing, OBJ for rendering, or glTF for web. DXF for drawings.',
          shortcut: null,
          tutorial: null,
        },
      ],
      'sketch-tools': [
        {
          id: 'sketch-line',
          title: 'Line Tool (L)',
          desc: 'Draw straight lines. Click to set points, right-click or Escape to finish.',
          shortcut: 'L',
          tutorial: null,
        },
        {
          id: 'sketch-rect',
          title: 'Rectangle Tool (R)',
          desc: 'Draw axis-aligned rectangles by clicking two opposite corners.',
          shortcut: 'R',
          tutorial: null,
        },
        {
          id: 'sketch-circle',
          title: 'Circle Tool (C)',
          desc: 'Click center, then click rim. Or drag to set radius. Shift+click to create concentric circles.',
          shortcut: 'C',
          tutorial: null,
        },
        {
          id: 'sketch-arc',
          title: 'Arc Tool (A)',
          desc: 'Draw circular arcs. 3-point arc: center, start, end. Tangent arc from existing geometry.',
          shortcut: 'A',
          tutorial: null,
        },
        {
          id: 'sketch-polyline',
          title: 'Polyline Tool (P)',
          desc: 'Draw connected line segments. Click to add vertices, right-click to finish.',
          shortcut: 'P',
          tutorial: null,
        },
        {
          id: 'sketch-constraints',
          title: 'Sketch Constraints',
          desc: 'Constrain geometry: horizontal, vertical, parallel, perpendicular, tangent, coincident, distance, angle.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-constrain-h',
          title: 'Constrain Horizontal (H)',
          desc: 'Make a line horizontal. Select line, press H.',
          shortcut: 'H',
          tutorial: null,
        },
        {
          id: 'sketch-constrain-v',
          title: 'Constrain Vertical (V)',
          desc: 'Make a line vertical. Select line, press V.',
          shortcut: 'V',
          tutorial: null,
        },
        {
          id: 'sketch-constrain-d',
          title: 'Constrain Distance (D)',
          desc: 'Set distance between points or from origin. Select geometry, press D, enter value.',
          shortcut: 'D',
          tutorial: null,
        },
        {
          id: 'sketch-constrain-angle',
          title: 'Constrain Angle',
          desc: 'Set angle between two lines. Select both, right-click → Angle.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-mirror',
          title: 'Mirror in Sketch',
          desc: 'Mirror geometry across a centerline. Select geometry, select mirror line, right-click → Mirror.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-offset',
          title: 'Offset Tool',
          desc: 'Create parallel copies of edges at a distance. Useful for walls, chamfers.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-trim',
          title: 'Trim/Extend Tool',
          desc: 'Trim edges where they intersect, or extend them to intersect with other geometry.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-construction',
          title: 'Construction Geometry',
          desc: 'Convert lines to construction mode (dashed) — they won\'t be used in extrudes/revolves.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-dimensions',
          title: 'Add Dimensions to Sketch',
          desc: 'Double-click a line or distance to add a dimension. Modify the value to update geometry.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-fully-constrained',
          title: 'Fully Constrained Sketches',
          desc: 'A sketch is fully constrained when it has no degrees of freedom. The profile turns white/green.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sketch-exit',
          title: 'Exit Sketch Mode',
          desc: 'Press Escape or click "Exit Sketch" button to return to 3D view.',
          shortcut: 'Escape',
          tutorial: null,
        },
      ],
      '3d-operations': [
        {
          id: 'op-extrude',
          title: 'Extrude (E)',
          desc: 'Push a sketch profile into 3D. Select a sketch, press E, set depth, click confirm.',
          shortcut: 'E',
          tutorial: 'first-part',
        },
        {
          id: 'op-revolve',
          title: 'Revolve (Rev)',
          desc: 'Rotate a sketch profile around an axis to create shapes like cylinders, cones, domes.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-fillet',
          title: 'Fillet (F)',
          desc: 'Round sharp edges. Select edge(s), press F, set radius (1-10mm typical).',
          shortcut: 'F',
          tutorial: 'first-part',
        },
        {
          id: 'op-chamfer',
          title: 'Chamfer (Ch)',
          desc: 'Bevel edges at 45° or custom angle. Select edge(s), right-click → Chamfer.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-hole',
          title: 'Add Hole (H)',
          desc: 'Create a hole through a body. Select face, press H, set diameter.',
          shortcut: 'H',
          tutorial: null,
        },
        {
          id: 'op-pocket',
          title: 'Pocket (Shallow Cut)',
          desc: 'Cut a shallow depression (not through). Define sketch, select depth, confirm.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-boolean-union',
          title: 'Boolean Union',
          desc: 'Combine two bodies into one. Select both bodies, right-click → Union.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-boolean-cut',
          title: 'Boolean Cut',
          desc: 'Subtract one body from another. Select target, select tool, right-click → Cut.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-boolean-intersect',
          title: 'Boolean Intersect',
          desc: 'Keep only the overlapping volume of two bodies.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-shell',
          title: 'Shell (Hollow Out)',
          desc: 'Make a solid body hollow with uniform wall thickness. Select body, set wall thickness.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-pattern-rect',
          title: 'Rectangular Pattern',
          desc: 'Array features in a grid. Set columns, rows, spacing.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-pattern-circ',
          title: 'Circular Pattern',
          desc: 'Array features around a center point. Set count and radius.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-mirror-3d',
          title: 'Mirror (3D)',
          desc: 'Mirror a feature across a plane. Select feature, select mirror plane.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-sweep',
          title: 'Sweep (Profile Along Path)',
          desc: 'Move a profile along a path. Defines complex shapes like hoses, tubing, structural members.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'op-loft',
          title: 'Loft (Morph Between Profiles)',
          desc: 'Smoothly transition between multiple profiles. Creates organic shapes.',
          shortcut: null,
          tutorial: null,
        },
      ],
      'assembly': [
        {
          id: 'asm-insert-part',
          title: 'Insert Component',
          desc: 'Add existing parts to an assembly. Right-click in tree → Insert, select .step or .obj file.',
          shortcut: null,
          tutorial: 'first-assembly',
        },
        {
          id: 'asm-mate-coincident',
          title: 'Coincident Mate',
          desc: 'Align two faces, edges, or planes. Select geometry on each part, right-click → Mate.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'asm-mate-concentric',
          title: 'Concentric Mate',
          desc: 'Align two cylinders or circles (same axis, different radii for gears/bearings).',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'asm-mate-distance',
          title: 'Distance Mate',
          desc: 'Set distance between two planes or faces. Useful for clearances, spacing.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'asm-mate-angle',
          title: 'Angle Mate',
          desc: 'Set angle between two planes. For hinges, bent assemblies.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'asm-explode',
          title: 'Explode View',
          desc: 'Separate parts to show assembly structure. Drag slider or press "Explode" button.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'asm-bom',
          title: 'Generate BOM (Bill of Materials)',
          desc: 'Auto-generate parts list with quantities. Export to CSV.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'asm-interference',
          title: 'Check Interference',
          desc: 'Detect parts that overlap (shouldn\'t). Helps catch design errors.',
          shortcut: null,
          tutorial: null,
        },
      ],
      'drawing': [
        {
          id: 'draw-new',
          title: 'Create Drawing',
          desc: 'Create a 2D engineering drawing from a 3D model. Auto-generate orthogonal views.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-views',
          title: 'Add Views',
          desc: 'Front, Top, Right, Isometric, custom angle views. Drag to position.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-dimension',
          title: 'Add Dimension',
          desc: 'Measure distance, radius, angle, diameter in drawing. Click two edges/vertices.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-gdt',
          title: 'GD&T (Geometric Dimensioning & Tolerancing)',
          desc: 'Add form/profile/runout tolerance symbols. ISO 1101 standard callouts.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-tolerance',
          title: 'Add Tolerance',
          desc: 'Specify +/- limits on dimensions (e.g., 25.0 +0.05/-0.1).',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-annotation',
          title: 'Add Annotation',
          desc: 'Add text notes, material callouts, surface finish (Ra, Rz values).',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-title-block',
          title: 'Title Block & Border',
          desc: 'Standard drawing frame with company logo, scale, revision, date.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-export-pdf',
          title: 'Export to PDF',
          desc: 'Generate PDF drawing for printing or sharing. Maintains dimensions and view layout.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-section',
          title: 'Section View',
          desc: 'Create cut-away views showing internal structure.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'draw-detail',
          title: 'Detail View',
          desc: 'Zoomed inset showing high-detail area of main view.',
          shortcut: null,
          tutorial: null,
        },
      ],
      'simulation': [
        {
          id: 'sim-setup',
          title: 'Setup Simulation',
          desc: 'Choose analysis type: Structural, Thermal, Modal, Flow. Set boundary conditions.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sim-material',
          title: 'Assign Material',
          desc: 'Select material from library (Steel, Aluminum, Plastic). View properties.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sim-loads',
          title: 'Apply Loads',
          desc: 'Force, pressure, temperature, velocity. Click face, set magnitude and direction.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sim-mesh',
          title: 'Mesh',
          desc: 'Generate finite element mesh. Fine mesh = accurate but slower. Coarse = fast.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sim-solve',
          title: 'Solve',
          desc: 'Run simulation. Iterative solver calculates stress, strain, temperature, displacement.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'sim-results',
          title: 'View Results',
          desc: 'Color-coded stress/strain maps, deformation animations, data table export.',
          shortcut: null,
          tutorial: null,
        },
      ],
      'import-export': [
        {
          id: 'io-import-step',
          title: 'Import STEP File',
          desc: 'Load 3D models from CAD software (SolidWorks, Fusion 360, AutoCAD). File → Import.',
          shortcut: null,
          tutorial: 'import-step',
        },
        {
          id: 'io-import-stl',
          title: 'Import STL File',
          desc: 'Load 3D scanned/printed parts as mesh geometry. Useful for reverse engineering.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'io-import-obj',
          title: 'Import OBJ File',
          desc: 'Load polygon meshes. Good for artwork, scanned data, CAM output.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'io-export-step',
          title: 'Export STEP File',
          desc: 'Save as STEP for sharing with other CAD software (SolidWorks, AutoCAD, FreeCAD).',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'io-export-stl',
          title: 'Export STL for 3D Printing',
          desc: 'Binary STL format for slicers (Cura, PrusaSlicer). Binary is smaller.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'io-export-obj',
          title: 'Export OBJ File',
          desc: 'Mesh format for rendering, animation, CAM. Keep textures in separate files.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'io-export-gltf',
          title: 'Export glTF/GLTB (Web 3D)',
          desc: 'Modern 3D format for web viewing, AR, VR. Includes materials and animations.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'io-export-dxf',
          title: 'Export DXF (2D Drawing)',
          desc: 'AutoCAD 2D format. Flattens 3D model to orthogonal views.',
          shortcut: null,
          tutorial: null,
        },
      ],
      'ai-features': [
        {
          id: 'ai-text-to-cad',
          title: 'Text-to-CAD',
          desc: 'Describe a part in English, AI generates a 3D model. "Create a 50mm hex bolt with 20mm height"',
          shortcut: 'Ctrl+/',
          tutorial: 'ai-copilot',
        },
        {
          id: 'ai-part-id',
          title: 'AI Part Identifier',
          desc: 'Take a photo or 3D scan of a part, AI identifies it (fastener, bearing, spring, etc) and suggests sources.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'ai-batch-scan',
          title: 'Batch AI Scan',
          desc: 'Scan all parts in an assembly at once. AI auto-identifies and color-codes by type.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'ai-chatbot',
          title: 'AI Chatbot',
          desc: 'Ask questions about your design: "What\'s the weight?" "Can this handle 50N force?" "Suggest fasteners."',
          shortcut: 'Ctrl+?',
          tutorial: null,
        },
        {
          id: 'ai-design-review',
          title: 'AI Design Review',
          desc: 'AI analyzes model for: manufacturability, cost, weight, fit issues. Suggests improvements.',
          shortcut: null,
          tutorial: null,
        },
      ],
      'agent-api': [
        {
          id: 'agent-execute',
          title: 'cycleCAD.execute()',
          desc: 'Main API entry point. Call with { method, params }. Returns promise. Async operations safe.',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'agent-shape',
          title: 'shape.* Namespace',
          desc: 'Create geometry: shape.cylinder, shape.box, shape.sphere, shape.cone, shape.torus',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'agent-feature',
          title: 'feature.* Namespace',
          desc: 'Modify geometry: feature.fillet, feature.chamfer, feature.hole, feature.pattern',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'agent-render',
          title: 'render.* Namespace',
          desc: 'View control: render.snapshot, render.fitToAll, render.setView, render.color',
          shortcut: null,
          tutorial: null,
        },
        {
          id: 'agent-validate',
          title: 'validate.* Namespace',
          desc: 'Check design: validate.designReview, validate.weight, validate.manufacturability',
          shortcut: null,
          tutorial: null,
        },
      ],
    };
  },

  // ========== TUTORIALS DATABASE ==========
  buildTutorials() {
    return {
      'first-part': {
        id: 'first-part',
        name: 'Create Your First Part',
        desc: 'Learn CAD fundamentals: sketch a 2D profile and extrude it into 3D.',
        duration: '5 min',
        steps: [
          {
            target: '#sketch-btn',
            title: 'Step 1: Start a Sketch',
            text: 'Click the Sketch button (or press K). This enters 2D sketch mode on the XY plane. You\'ll see a top-down view with a grid.',
            position: 'bottom',
            action: 'click',
          },
          {
            target: '#rect-tool',
            title: 'Step 2: Draw a Rectangle',
            text: 'Click the Rectangle tool (or press R). Then click two opposite corners on the grid to create a rectangle, like 50mm × 30mm. Keep it simple!',
            position: 'right',
            action: 'click',
          },
          {
            target: null,
            title: 'Step 3: Add Dimensions',
            text: 'Double-click one edge of your rectangle to add a dimension. Type "50" and press Enter. Repeat for the other edge: "30". This makes your sketch parametric.',
            position: 'center',
            action: 'none',
          },
          {
            target: '#sketch-exit-btn',
            title: 'Step 4: Exit Sketch Mode',
            text: 'Press Escape or click the "Exit Sketch" button. You\'ll return to 3D view with your 2D profile outlined.',
            position: 'bottom',
            action: 'press-key',
            key: 'Escape',
          },
          {
            target: '#extrude-btn',
            title: 'Step 5: Extrude to 3D',
            text: 'Click the Extrude button (or press E). A 3D preview appears. Set the height to 20mm by typing in the dialog or moving the slider. Your 2D rectangle becomes a 3D box!',
            position: 'right',
            action: 'click',
          },
          {
            target: '#extrude-confirm',
            title: 'Step 6: Confirm',
            text: 'Click "Confirm" to finish the extrude. Your first 3D part is born!',
            position: 'bottom',
            action: 'click',
          },
          {
            target: '#fillet-btn',
            title: 'Step 7: Add Fillet (Optional)',
            text: 'To make the edges smooth, click the Fillet button and select an edge. Set radius to 2mm. This gives your part a professional look.',
            position: 'right',
            action: 'click',
          },
          {
            target: '#export-menu',
            title: 'Step 8: Export Your Part',
            text: 'Click Export and choose STL format. Save the file. You now have a 3D-printable part! Send to a printer, or share with colleagues.',
            position: 'left',
            action: 'click',
          },
        ],
      },
      'ai-copilot': {
        id: 'ai-copilot',
        name: 'Use the AI Copilot',
        desc: 'Let AI generate parts from text descriptions.',
        duration: '3 min',
        steps: [
          {
            target: '#ai-chat-btn',
            title: 'Open AI Copilot',
            text: 'Click the AI Chat button (or press Ctrl+/). The chat panel opens on the right.',
            position: 'left',
            action: 'click',
          },
          {
            target: '#ai-input',
            title: 'Type a Part Request',
            text: 'In the chat box, type: "Create a 50mm diameter cylinder with 80mm height." The AI understands natural language.',
            position: 'bottom',
            action: 'type',
            text_input: 'Create a 50mm diameter cylinder with 80mm height',
          },
          {
            target: null,
            title: 'AI Generates 3D',
            text: 'Press Enter. The AI parses your text, calls cycleCAD API, and renders the cylinder in the 3D viewport. Instant CAD!',
            position: 'center',
            action: 'none',
          },
          {
            target: '#ai-input',
            title: 'Refine with Follow-up',
            text: 'Type: "Add a 20mm hole in the center." AI modifies the existing part.',
            position: 'bottom',
            action: 'type',
            text_input: 'Add a 20mm hole in the center',
          },
          {
            target: '#export-menu',
            title: 'Export Result',
            text: 'When satisfied, click Export → STL. The AI-generated part is ready to manufacture.',
            position: 'left',
            action: 'click',
          },
        ],
      },
      'first-assembly': {
        id: 'first-assembly',
        name: 'Build an Assembly',
        desc: 'Insert components and add mates to create an assembly.',
        duration: '7 min',
        steps: [
          {
            target: '#asm-new-btn',
            title: 'Create Assembly',
            text: 'Right-click in the tree and select "New Assembly". This creates an empty assembly document.',
            position: 'left',
            action: 'right-click',
          },
          {
            target: '#asm-insert-btn',
            title: 'Insert First Component',
            text: 'Click "Insert Component" and select a STEP file or OBJ. This adds the first part to the assembly.',
            position: 'bottom',
            action: 'click',
          },
          {
            target: null,
            title: 'Position First Part',
            text: 'The part appears at the origin. You can drag it to move. Use Ctrl+mouse to rotate.',
            position: 'center',
            action: 'none',
          },
          {
            target: '#asm-insert-btn',
            title: 'Insert Second Component',
            text: 'Click "Insert Component" again and add another part.',
            position: 'bottom',
            action: 'click',
          },
          {
            target: null,
            title: 'Add a Mate',
            text: 'Select a face on part 1, hold Ctrl and select the mating face on part 2. Right-click → "Coincident Mate". The parts snap together.',
            position: 'center',
            action: 'none',
          },
          {
            target: '#asm-explode-slider',
            title: 'Explode View',
            text: 'Drag the "Explode" slider to separate parts and see the assembly structure. Great for showing how it assembles.',
            position: 'right',
            action: 'drag',
          },
          {
            target: '#asm-bom-btn',
            title: 'Generate BOM',
            text: 'Click "Generate BOM" to create a parts list. Export to CSV for procurement.',
            position: 'bottom',
            action: 'click',
          },
        ],
      },
      'import-step': {
        id: 'import-step',
        name: 'Import STEP File',
        desc: 'Load a 3D CAD model from desktop software.',
        duration: '2 min',
        steps: [
          {
            target: '#file-import-btn',
            title: 'Open File Import',
            text: 'Click File → Import (or drag a .step file onto the viewport).',
            position: 'top',
            action: 'click',
          },
          {
            target: null,
            title: 'Select STEP File',
            text: 'Browse your computer and select a .stp or .step file. These come from SolidWorks, Fusion 360, AutoCAD, etc.',
            position: 'center',
            action: 'none',
          },
          {
            target: null,
            title: 'AI Parses It',
            text: 'cycleCAD uses OpenCascade.js to parse the STEP file. Large files may take a few seconds. Progress bar shows status.',
            position: 'center',
            action: 'none',
          },
          {
            target: null,
            title: 'Explore Model',
            text: 'Once loaded, rotate (middle-click drag), zoom (scroll), pan (right-click drag). Click parts to select them. The tree shows assembly structure.',
            position: 'center',
            action: 'none',
          },
        ],
      },
    };
  },

  // ========== KEYBOARD SHORTCUTS DATABASE ==========
  buildShortcuts() {
    return {
      'sketch-mode': [
        { key: 'K', desc: 'Enter Sketch mode' },
        { key: 'L', desc: 'Line tool' },
        { key: 'R', desc: 'Rectangle tool' },
        { key: 'C', desc: 'Circle tool' },
        { key: 'A', desc: 'Arc tool' },
        { key: 'P', desc: 'Polyline tool' },
        { key: 'H', desc: 'Constrain Horizontal' },
        { key: 'V', desc: 'Constrain Vertical' },
        { key: 'D', desc: 'Constrain Distance' },
        { key: 'Escape', desc: 'Exit Sketch mode' },
      ],
      '3d-operations': [
        { key: 'E', desc: 'Extrude' },
        { key: 'F', desc: 'Fillet' },
        { key: 'Z', desc: 'Undo' },
        { key: 'Shift+Z', desc: 'Redo' },
        { key: 'Delete', desc: 'Delete selected' },
      ],
      'viewport': [
        { key: 'Middle-click drag', desc: 'Rotate view' },
        { key: 'Right-click drag', desc: 'Pan view' },
        { key: 'Scroll', desc: 'Zoom in/out' },
        { key: 'G', desc: 'Toggle grid' },
        { key: 'V', desc: 'Toggle wireframe' },
        { key: 'Ctrl+0', desc: 'Fit all' },
      ],
      'general': [
        { key: '?', desc: 'Show keyboard shortcuts' },
        { key: 'Ctrl+/', desc: 'Open AI Copilot' },
        { key: 'Ctrl+S', desc: 'Save' },
        { key: 'Ctrl+O', desc: 'Open file' },
      ],
    };
  },

  // ========== UI SETUP ==========
  setupUI() {
    // Help button in top bar
    const helpBtn = document.createElement('button');
    helpBtn.id = 'help-btn';
    helpBtn.innerHTML = '?';
    helpBtn.title = 'Help (Press ?)';
    helpBtn.style.cssText = `
      position: fixed;
      top: 10px;
      right: 60px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #0284C7;
      color: white;
      border: none;
      font-size: 20px;
      font-weight: bold;
      cursor: pointer;
      z-index: 9998;
      transition: all 0.2s;
    `;
    helpBtn.onmouseover = () => helpBtn.style.background = '#0369A1';
    helpBtn.onmouseout = () => helpBtn.style.background = '#0284C7';
    document.body.appendChild(helpBtn);

    // Help panel HTML
    const panelHTML = `
      <div id="help-panel" style="
        position: fixed;
        right: -400px;
        top: 0;
        width: 400px;
        height: 100vh;
        background: white;
        border-left: 1px solid #ddd;
        box-shadow: -2px 0 8px rgba(0,0,0,0.1);
        z-index: 9997;
        transition: right 0.3s;
        display: flex;
        flex-direction: column;
        font-family: Calibri, sans-serif;
      ">
        <div style="padding: 15px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
          <h2 style="margin: 0; font-size: 18px;">Help</h2>
          <button id="help-close-btn" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 0;">×</button>
        </div>

        <input type="text" id="help-search" placeholder="Search help..." style="
          margin: 10px;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        " />

        <div id="help-content" style="
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        "></div>
      </div>

      <div id="help-tutorial-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 9996;
        display: none;
      "></div>

      <div id="help-tooltip" style="
        position: fixed;
        background: #333;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 9999;
        display: none;
        max-width: 250px;
        pointer-events: none;
      "></div>

      <div id="help-shortcuts-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 9999;
        display: none;
        overflow-y: auto;
        padding: 40px;
      "></div>
    `;
    document.body.insertAdjacentHTML('beforeend', panelHTML);

    // Initialize content
    this.renderHelpContent();
  },

  renderHelpContent() {
    const content = document.getElementById('help-content');
    if (!content) return;

    content.innerHTML = '';
    for (const [category, entries] of Object.entries(this.helpEntries)) {
      const categoryDiv = document.createElement('div');
      categoryDiv.style.marginBottom = '15px';

      const catTitle = document.createElement('h3');
      catTitle.style.cssText = `
        margin: 10px 0 5px 0;
        font-size: 13px;
        color: #0284C7;
        font-weight: bold;
        cursor: pointer;
        padding: 5px;
        border-radius: 3px;
      `;
      catTitle.textContent = this.formatCategoryName(category);
      catTitle.onmouseover = () => catTitle.style.background = '#f0f0f0';
      catTitle.onmouseout = () => catTitle.style.background = 'transparent';

      const entriesList = document.createElement('div');
      entriesList.style.marginLeft = '10px';
      entriesList.className = 'help-category-entries';

      entries.forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.style.cssText = `
          margin-bottom: 8px;
          padding: 8px;
          border-radius: 3px;
          background: #f9f9f9;
          cursor: pointer;
          transition: all 0.2s;
        `;
        entryDiv.onmouseover = () => {
          entryDiv.style.background = '#e8f4f8';
          entryDiv.style.borderLeft = '3px solid #0284C7';
        };
        entryDiv.onmouseout = () => {
          entryDiv.style.background = '#f9f9f9';
          entryDiv.style.borderLeft = 'none';
        };

        const titleSpan = document.createElement('div');
        titleSpan.style.cssText = 'font-size: 12px; font-weight: bold; margin-bottom: 3px;';
        titleSpan.textContent = entry.title;

        const descSpan = document.createElement('div');
        descSpan.style.cssText = 'font-size: 11px; color: #666; line-height: 1.4;';
        descSpan.textContent = entry.desc;

        if (entry.shortcut) {
          const shortcutSpan = document.createElement('div');
          shortcutSpan.style.cssText = `
            font-size: 10px;
            color: #999;
            margin-top: 3px;
            font-family: monospace;
          `;
          shortcutSpan.textContent = `Shortcut: ${entry.shortcut}`;
          entryDiv.appendChild(shortcutSpan);
        }

        entryDiv.appendChild(titleSpan);
        entryDiv.appendChild(descSpan);

        if (entry.tutorial) {
          const tutorialBtn = document.createElement('button');
          tutorialBtn.textContent = 'Start Tutorial';
          tutorialBtn.style.cssText = `
            margin-top: 5px;
            padding: 4px 8px;
            font-size: 10px;
            background: #0284C7;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
          `;
          tutorialBtn.onclick = (e) => {
            e.stopPropagation();
            this.startTutorial(entry.tutorial);
          };
          entryDiv.appendChild(tutorialBtn);
        }

        entriesList.appendChild(entryDiv);
      });

      catTitle.onclick = () => {
        const isVisible = entriesList.style.display !== 'none';
        entriesList.style.display = isVisible ? 'none' : 'block';
        catTitle.style.fontWeight = isVisible ? 'normal' : 'bold';
      };

      categoryDiv.appendChild(catTitle);
      categoryDiv.appendChild(entriesList);
      content.appendChild(categoryDiv);
    }
  },

  formatCategoryName(category) {
    const names = {
      'getting-started': 'Getting Started',
      'sketch-tools': 'Sketch Tools',
      '3d-operations': '3D Operations',
      'assembly': 'Assembly',
      'drawing': 'Drawing',
      'simulation': 'Simulation',
      'import-export': 'Import/Export',
      'ai-features': 'AI Features',
      'agent-api': 'Agent API',
    };
    return names[category] || category;
  },

  setupEventListeners() {
    const helpBtn = document.getElementById('help-btn');
    const closeBtn = document.getElementById('help-close-btn');
    const panel = document.getElementById('help-panel');
    const searchInput = document.getElementById('help-search');

    helpBtn.onclick = () => this.toggle();
    closeBtn.onclick = () => this.close();

    searchInput.oninput = (e) => this.search(e.target.value);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '?') {
        e.preventDefault();
        this.showShortcutOverlay();
      }
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    window.addEventListener('help:startTutorial', (e) => {
      this.startTutorial(e.detail.tutorialId);
    });
  },

  registerDefaultTooltips() {
    const tooltips = [
      { id: '#sketch-btn', title: 'Sketch (K)', text: 'Enter 2D sketch mode. Draw profiles to extrude or revolve.' },
      { id: '#extrude-btn', title: 'Extrude (E)', text: 'Push a sketch profile into 3D. Creates solid features.' },
      { id: '#fillet-btn', title: 'Fillet (F)', text: 'Round sharp edges. Set radius in mm.' },
      { id: '#ai-chat-btn', title: 'AI Copilot', text: 'Generate parts from text. "Create a cylinder 50mm diameter"' },
      { id: '#export-menu', title: 'Export', text: 'Save as STL (3D print), OBJ, glTF, STEP, DXF' },
    ];

    tooltips.forEach(t => {
      this.registerTooltip(t.id, { title: t.title, text: t.text });
    });
  },

  registerTooltip(elementId, config) {
    this.tooltips.set(elementId, config);
    const el = document.querySelector(elementId);
    if (el) {
      el.addEventListener('mouseenter', () => this.showTooltip(elementId));
      el.addEventListener('mouseleave', () => this.hideTooltip());
    }
  },

  showTooltip(elementId) {
    const el = document.querySelector(elementId);
    const config = this.tooltips.get(elementId);
    if (!el || !config) return;

    const tooltip = document.getElementById('help-tooltip');
    tooltip.innerHTML = `<strong>${config.title}</strong><br>${config.text}`;
    tooltip.style.display = 'block';

    const rect = el.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.top = (rect.bottom + 10) + 'px';
    tooltip.style.transform = 'translateX(-50%)';
  },

  hideTooltip() {
    document.getElementById('help-tooltip').style.display = 'none';
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },

  open() {
    this.isOpen = true;
    document.getElementById('help-panel').style.right = '0';
    window.dispatchEvent(new CustomEvent('help:opened'));
  },

  close() {
    this.isOpen = false;
    document.getElementById('help-panel').style.right = '-400px';
    this.stopTutorial();
    window.dispatchEvent(new CustomEvent('help:closed'));
  },

  search(query) {
    const content = document.getElementById('help-content');
    if (!query.trim()) {
      this.renderHelpContent();
      return;
    }

    const q = query.toLowerCase();
    content.innerHTML = '';

    let found = 0;
    for (const [category, entries] of Object.entries(this.helpEntries)) {
      const filtered = entries.filter(e =>
        e.title.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q)
      );

      if (filtered.length === 0) continue;
      found++;

      const catDiv = document.createElement('div');
      catDiv.style.marginBottom = '15px';

      const catTitle = document.createElement('h3');
      catTitle.style.cssText = 'margin: 10px 0 5px 0; font-size: 13px; color: #0284C7; font-weight: bold;';
      catTitle.textContent = this.formatCategoryName(category);

      catDiv.appendChild(catTitle);

      filtered.forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.style.cssText = 'margin-bottom: 8px; padding: 8px; border-radius: 3px; background: #f9f9f9;';
        entryDiv.innerHTML = `
          <div style="font-size: 12px; font-weight: bold;">${entry.title}</div>
          <div style="font-size: 11px; color: #666;">${entry.desc}</div>
        `;
        catDiv.appendChild(entryDiv);
      });

      content.appendChild(catDiv);
    }

    if (found === 0) {
      content.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">No results found.</p>';
    }
  },

  startTutorial(tutorialId) {
    const tutorial = this.tutorials[tutorialId];
    if (!tutorial) return;

    this.activeTutorial = tutorial;
    this.currentStep = 0;

    this.showTutorialStep();
    window.dispatchEvent(new CustomEvent('help:tutorialStarted', { detail: { tutorialId } }));
  },

  showTutorialStep() {
    const tutorial = this.activeTutorial;
    if (!tutorial) return;

    const step = tutorial.steps[this.currentStep];
    if (!step) {
      this.tutorialComplete();
      return;
    }

    // Show overlay
    const overlay = document.getElementById('help-tutorial-overlay');
    overlay.style.display = 'block';

    // Highlight target element
    if (step.target) {
      const target = document.querySelector(step.target);
      if (target) {
        const rect = target.getBoundingClientRect();
        const highlightBox = document.createElement('div');
        highlightBox.id = 'tutorial-highlight';
        highlightBox.style.cssText = `
          position: fixed;
          left: ${rect.left - 5}px;
          top: ${rect.top - 5}px;
          width: ${rect.width + 10}px;
          height: ${rect.height + 10}px;
          border: 3px solid #FFD700;
          border-radius: 8px;
          box-shadow: 0 0 0 9999px rgba(0,0,0,0.7);
          z-index: 9998;
          pointer-events: none;
        `;

        const existing = document.getElementById('tutorial-highlight');
        if (existing) existing.remove();
        document.body.appendChild(highlightBox);
      }
    }

    // Show step content
    const stepPanel = document.createElement('div');
    stepPanel.id = 'tutorial-step-panel';
    stepPanel.style.cssText = `
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 9999;
      max-width: 400px;
      font-family: Calibri, sans-serif;
    `;

    const progress = document.createElement('div');
    progress.style.cssText = 'font-size: 12px; color: #999; margin-bottom: 8px;';
    progress.textContent = `Step ${this.currentStep + 1} of ${tutorial.steps.length}`;

    const title = document.createElement('h3');
    title.style.cssText = 'margin: 0 0 8px 0; font-size: 16px;';
    title.textContent = step.title;

    const text = document.createElement('p');
    text.style.cssText = 'margin: 0 0 15px 0; font-size: 14px; line-height: 1.5;';
    text.textContent = step.text;

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 10px; justify-content: space-between;';

    if (this.currentStep > 0) {
      const backBtn = document.createElement('button');
      backBtn.textContent = 'Back';
      backBtn.style.cssText = 'padding: 8px 16px; background: #999; color: white; border: none; border-radius: 4px; cursor: pointer;';
      backBtn.onclick = () => this.previousStep();
      buttons.appendChild(backBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.textContent = this.currentStep === tutorial.steps.length - 1 ? 'Complete' : 'Next';
    nextBtn.style.cssText = 'padding: 8px 16px; background: #0284C7; color: white; border: none; border-radius: 4px; cursor: pointer; flex: 1;';
    nextBtn.onclick = () => this.nextStep();
    buttons.appendChild(nextBtn);

    const exitBtn = document.createElement('button');
    exitBtn.textContent = 'Exit';
    exitBtn.style.cssText = 'padding: 8px 16px; background: #ddd; color: #333; border: none; border-radius: 4px; cursor: pointer;';
    exitBtn.onclick = () => this.stopTutorial();
    buttons.appendChild(exitBtn);

    stepPanel.appendChild(progress);
    stepPanel.appendChild(title);
    stepPanel.appendChild(text);
    stepPanel.appendChild(buttons);

    const existing = document.getElementById('tutorial-step-panel');
    if (existing) existing.remove();
    document.body.appendChild(stepPanel);
  },

  nextStep() {
    const tutorial = this.activeTutorial;
    if (this.currentStep < tutorial.steps.length - 1) {
      this.currentStep++;
      this.showTutorialStep();
    } else {
      this.tutorialComplete();
    }
  },

  previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showTutorialStep();
    }
  },

  tutorialComplete() {
    this.stopTutorial();
    window.dispatchEvent(new CustomEvent('help:tutorialCompleted', {
      detail: { tutorialId: this.activeTutorial.id }
    }));

    alert(`Great! You've completed the "${this.activeTutorial.name}" tutorial.`);
  },

  stopTutorial() {
    if (!this.activeTutorial) return;

    document.getElementById('help-tutorial-overlay').style.display = 'none';
    const highlight = document.getElementById('tutorial-highlight');
    if (highlight) highlight.remove();
    const panel = document.getElementById('tutorial-step-panel');
    if (panel) panel.remove();

    window.dispatchEvent(new CustomEvent('help:tutorialExited', {
      detail: { tutorialId: this.activeTutorial.id }
    }));

    this.activeTutorial = null;
  },

  showShortcutOverlay() {
    const overlay = document.getElementById('help-shortcuts-overlay');
    overlay.innerHTML = `
      <div style="max-width: 900px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h1 style="margin: 0;">Keyboard Shortcuts</h1>
          <button onclick="document.getElementById('help-shortcuts-overlay').style.display='none'" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
        </div>
    `;

    for (const [category, shortcuts] of Object.entries(this.shortcuts)) {
      overlay.innerHTML += `<h2 style="font-size: 16px; margin-top: 20px; border-bottom: 2px solid #0284C7; padding-bottom: 8px;">${this.formatCategoryName(category)}</h2>`;
      overlay.innerHTML += '<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">';

      shortcuts.forEach(s => {
        overlay.innerHTML += `
          <div style="padding: 10px; background: #f9f9f9; border-radius: 4px;">
            <div style="font-family: monospace; font-weight: bold; color: #0284C7;">${s.key}</div>
            <div style="font-size: 12px; color: #666;">${s.desc}</div>
          </div>
        `;
      });

      overlay.innerHTML += '</div>';
    }

    overlay.innerHTML += '</div>';
    overlay.style.display = 'block';

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    };
  },

  getUI() {
    return document.getElementById('help-panel');
  },

  execute(command, params) {
    switch (command) {
      case 'open':
        this.open();
        break;
      case 'close':
        this.close();
        break;
      case 'search':
        this.search(params.query || '');
        break;
      case 'startTutorial':
        this.startTutorial(params.tutorialId);
        break;
      case 'showShortcuts':
        this.showShortcutOverlay();
        break;
      case 'registerTooltip':
        this.registerTooltip(params.elementId, params.config);
        break;
      default:
        console.warn(`[HelpModule] Unknown command: ${command}`);
    }
  },
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HelpModule;
}
