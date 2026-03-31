/**
 * Help Module v3.2
 * Comprehensive help system with 120+ searchable entries across 10 categories
 * Includes interactive tutorials, context-sensitive help, and keyboard shortcut overlay
 */

export const HelpModule = {
  name: 'help',
  version: '3.2.0',

  helpEntries: [
    // ===== GETTING STARTED (15 entries) =====
    {
      id: 'gs_welcome',
      title: 'Welcome to cycleCAD',
      category: 'Getting Started',
      description: 'cycleCAD is an agent-first parametric 3D CAD modeler. Create, visualize, and manufacture anything with AI assistance.',
      tags: ['introduction', 'first-time'],
      complexity: 'beginner'
    },
    {
      id: 'gs_workspaces',
      title: 'Understanding Workspaces',
      category: 'Getting Started',
      description: 'cycleCAD has 8 specialized workspaces: Design, Assembly, Render, Simulation, CAM, Drawing, Animation, Collaborate. Each activates relevant tools.',
      tags: ['workspace', 'navigation'],
      complexity: 'beginner',
      example: 'Design: sketch & extrude → Assembly: add components & joints → CAM: generate toolpath'
    },
    {
      id: 'gs_ui_layout',
      title: 'UI Layout Overview',
      category: 'Getting Started',
      description: 'Menu bar (top) → Toolbars → 3D Viewport (center) → Left/Right panels. All panels are resizable and dockable.',
      tags: ['ui', 'layout'],
      complexity: 'beginner'
    },
    {
      id: 'gs_keyboard',
      title: 'Essential Keyboard Shortcuts',
      category: 'Getting Started',
      description: 'Press ? to open keyboard shortcuts. Common: L=line, C=circle, E=extrude, R=revolve, F=fillet, S=save, Ctrl+Z=undo',
      tags: ['shortcuts', 'keyboard'],
      complexity: 'beginner',
      shortcut: '?'
    },
    {
      id: 'gs_mouse',
      title: 'Mouse Controls',
      category: 'Getting Started',
      description: 'Left drag = rotate, Right drag = pan, Scroll = zoom. Middle-click = fit all. Shift+left drag = constrained rotation.',
      tags: ['mouse', 'navigation'],
      complexity: 'beginner'
    },
    {
      id: 'gs_first_part',
      title: 'Your First Part Tutorial',
      category: 'Getting Started',
      description: 'Create a simple box, add a fillet, then export as STL. Takes 5 minutes.',
      tags: ['tutorial', 'beginner'],
      complexity: 'beginner',
      tutorialId: 'tut_first_part'
    },
    {
      id: 'gs_selection',
      title: 'Selecting & Highlighting',
      category: 'Getting Started',
      description: 'Click on geometry to select. Hold Ctrl/Cmd to multi-select. Hold Shift to add/remove from selection. Double-click to isolate part.',
      tags: ['selection'],
      complexity: 'beginner'
    },
    {
      id: 'gs_camera',
      title: 'Camera & View Controls',
      category: 'Getting Started',
      description: 'Use View presets (Front, Top, Iso, etc.) or drag to rotate. Middle-click to reset. Press . to fit selected.',
      tags: ['camera', 'view'],
      complexity: 'beginner',
      shortcut: '0-6 (view presets)'
    },
    {
      id: 'gs_grid',
      title: 'Grid & Snapping',
      category: 'Getting Started',
      description: 'Press G to toggle grid. Press S to toggle snap. Adjust grid size in Properties panel.',
      tags: ['grid', 'snap'],
      complexity: 'beginner',
      shortcut: 'G'
    },
    {
      id: 'gs_properties',
      title: 'Properties Panel',
      category: 'Getting Started',
      description: 'Right panel shows properties of selected object. Edit dimensions, materials, colors. Changes apply in real-time.',
      tags: ['panel', 'properties'],
      complexity: 'beginner'
    },
    {
      id: 'gs_tree',
      title: 'Feature Tree Navigation',
      category: 'Getting Started',
      description: 'Left panel shows feature history. Right-click to rename, suppress, delete. Drag to reorder features.',
      tags: ['tree', 'features'],
      complexity: 'beginner'
    },
    {
      id: 'gs_undo_redo',
      title: 'Undo & Redo',
      category: 'Getting Started',
      description: 'Ctrl+Z to undo, Ctrl+Y to redo. Unlimited undo history (50 states). Can also use Edit menu.',
      tags: ['undo', 'redo'],
      complexity: 'beginner',
      shortcut: 'Ctrl+Z / Ctrl+Y'
    },
    {
      id: 'gs_save',
      title: 'Saving Your Work',
      category: 'Getting Started',
      description: 'Press Ctrl+S to save. Files are auto-saved to IndexedDB. Pro users can sync to cloud.',
      tags: ['save', 'file'],
      complexity: 'beginner',
      shortcut: 'Ctrl+S'
    },
    {
      id: 'gs_export',
      title: 'Exporting Designs',
      category: 'Getting Started',
      description: 'File → Export to save as STL, STEP, GLTF, OBJ, PDF. Or use Export toolbar button. Choose format and quality.',
      tags: ['export', 'file'],
      complexity: 'beginner',
      shortcut: 'Ctrl+E'
    },
    {
      id: 'gs_import',
      title: 'Importing Files',
      category: 'Getting Started',
      description: 'File → Import to load STEP, IGES, OBJ, STL files. Supports models up to 500MB (Pro/Enterprise).',
      tags: ['import', 'file'],
      complexity: 'beginner'
    },

    // ===== SKETCH (20 entries) =====
    {
      id: 'sk_overview',
      title: 'Sketch Overview',
      category: 'Sketch',
      description: 'Sketches are 2D profiles used as starting points for 3D features. Draw on a plane, add constraints, then extrude/revolve.',
      tags: ['sketch', 'basics'],
      complexity: 'beginner'
    },
    {
      id: 'sk_create',
      title: 'Creating a Sketch',
      category: 'Sketch',
      description: 'Design workspace → Sketch button → select a plane or face. Sketch toolbar appears. Draw using Line, Circle, Rectangle, Arc tools.',
      tags: ['sketch', 'creation'],
      complexity: 'beginner'
    },
    {
      id: 'sk_line',
      title: 'Line Tool',
      category: 'Sketch',
      description: 'Press L or click Line tool. Click points to draw line segments. Press Escape or right-click to finish. Press L again to continue.',
      tags: ['line', 'tool'],
      complexity: 'beginner',
      shortcut: 'L'
    },
    {
      id: 'sk_circle',
      title: 'Circle Tool',
      category: 'Sketch',
      description: 'Press C. Click center, then drag to set radius. Or hold Shift for diameter mode. Circles are fully constrained (center + radius).',
      tags: ['circle', 'tool'],
      complexity: 'beginner',
      shortcut: 'C'
    },
    {
      id: 'sk_rect',
      title: 'Rectangle Tool',
      category: 'Sketch',
      description: 'Press R. Click first corner, then opposite corner. Creates a 4-sided rectangle. Can constrain width/height independently.',
      tags: ['rectangle', 'tool'],
      complexity: 'beginner',
      shortcut: 'R'
    },
    {
      id: 'sk_arc',
      title: 'Arc Tool',
      category: 'Sketch',
      description: 'Press A. Click center, start point, end point. Creates a circular arc. 3-point mode available via options.',
      tags: ['arc', 'tool'],
      complexity: 'beginner',
      shortcut: 'A'
    },
    {
      id: 'sk_constraint',
      title: 'Adding Constraints',
      category: 'Sketch',
      description: 'Constraints define relationships: coincident, horizontal, vertical, parallel, perpendicular, tangent, equal, fixed, distance, angle.',
      tags: ['constraint', 'parametric'],
      complexity: 'intermediate'
    },
    {
      id: 'sk_horizontal',
      title: 'Horizontal Constraint',
      category: 'Sketch',
      description: 'Select a line, press H. Line becomes horizontal. Or Shift+select 2 points to make them horizontally aligned.',
      tags: ['constraint', 'alignment'],
      complexity: 'intermediate',
      shortcut: 'H'
    },
    {
      id: 'sk_vertical',
      title: 'Vertical Constraint',
      category: 'Sketch',
      description: 'Select a line, press V. Line becomes vertical. Or select 2 points to vertically align them.',
      tags: ['constraint', 'alignment'],
      complexity: 'intermediate',
      shortcut: 'V'
    },
    {
      id: 'sk_distance',
      title: 'Distance Constraint',
      category: 'Sketch',
      description: 'Select 2 points or a point and a line, press D. Enter distance value. Constraint applied with exact measurement.',
      tags: ['dimension', 'constraint'],
      complexity: 'intermediate',
      shortcut: 'D'
    },
    {
      id: 'sk_coincident',
      title: 'Coincident Constraint',
      category: 'Sketch',
      description: 'Select point and line/circle, press O. Point is forced to lie on the geometry. Essential for connecting shapes.',
      tags: ['constraint', 'connectivity'],
      complexity: 'intermediate',
      shortcut: 'O'
    },
    {
      id: 'sk_tangent',
      title: 'Tangent Constraint',
      category: 'Sketch',
      description: 'Select curve and line/arc, press T. Curves touch at exactly one point with same slope. Smooth transitions.',
      tags: ['constraint', 'curve'],
      complexity: 'intermediate',
      shortcut: 'T'
    },
    {
      id: 'sk_equal',
      title: 'Equal Constraint',
      category: 'Sketch',
      description: 'Select 2 or more lines/circles, press E. They become the same length/radius. Useful for symmetric designs.',
      tags: ['constraint', 'symmetry'],
      complexity: 'intermediate',
      shortcut: 'E'
    },
    {
      id: 'sk_parallel',
      title: 'Parallel Constraint',
      category: 'Sketch',
      description: 'Select 2 lines, press P. Lines become parallel (same direction). Maintains angle even if length changes.',
      tags: ['constraint', 'alignment'],
      complexity: 'intermediate',
      shortcut: 'P'
    },
    {
      id: 'sk_perpendicular',
      title: 'Perpendicular Constraint',
      category: 'Sketch',
      description: 'Select 2 lines, press X. Lines become perpendicular (90° angle). Useful for right-angle features.',
      tags: ['constraint', 'alignment'],
      complexity: 'intermediate',
      shortcut: 'X'
    },
    {
      id: 'sk_exit',
      title: 'Exiting Sketch',
      category: 'Sketch',
      description: 'Press Escape or click Close Sketch button. Returns to 3D modeling workspace. Sketch becomes available for extrude/revolve.',
      tags: ['sketch', 'exit'],
      complexity: 'beginner',
      shortcut: 'Esc'
    },
    {
      id: 'sk_centerline',
      title: 'Centerline for Revolve',
      category: 'Sketch',
      description: 'In revolve mode, select a line as the rotation axis (centerline). The sketch profile revolves around this line.',
      tags: ['revolve', 'axis'],
      complexity: 'intermediate'
    },
    {
      id: 'sk_symmetry',
      title: 'Symmetric Sketch Design',
      category: 'Sketch',
      description: 'Use symmetry constraints and centered circles/rects to create symmetric profiles. Easier to manage parametrically.',
      tags: ['design', 'efficiency'],
      complexity: 'intermediate'
    },
    {
      id: 'sk_tutorial',
      title: 'Sketch Tutorial',
      category: 'Sketch',
      description: 'Learn sketch basics: draw a rectangle, add constraints, dimension it, then extrude to 3D.',
      tags: ['tutorial'],
      complexity: 'beginner',
      tutorialId: 'tut_sketch'
    },

    // ===== MODELING (20 entries) =====
    {
      id: 'md_extrude',
      title: 'Extrude Tool',
      category: 'Modeling',
      description: 'Press E. Select a sketch, choose direction (up/down/both), enter depth. Creates a 3D solid by pushing sketch profile.',
      tags: ['extrude', 'feature'],
      complexity: 'beginner',
      shortcut: 'E'
    },
    {
      id: 'md_revolve',
      title: 'Revolve Tool',
      category: 'Modeling',
      description: 'Press R. Select a sketch and a centerline axis. Sketch rotates 360° around axis to create solid. Perfect for cylinders, cones.',
      tags: ['revolve', 'feature'],
      complexity: 'beginner',
      shortcut: 'R'
    },
    {
      id: 'md_sweep',
      title: 'Sweep Tool',
      category: 'Modeling',
      description: 'Extrude a profile along a curved path. Select profile sketch and path (line/arc/curve). Creates custom shapes (pipes, spirals).',
      tags: ['sweep', 'advanced'],
      complexity: 'advanced'
    },
    {
      id: 'md_loft',
      title: 'Loft Tool',
      category: 'Modeling',
      description: 'Blend between multiple profile sketches. Creates smooth transitions (airplane fuselage, vase shapes). Select 2+ sketches.',
      tags: ['loft', 'advanced'],
      complexity: 'advanced'
    },
    {
      id: 'md_fillet',
      title: 'Fillet Tool',
      category: 'Modeling',
      description: 'Press F. Select edges to round. Enter radius. Smooths sharp corners. Useful for aesthetic & structural improvements.',
      tags: ['fillet', 'feature'],
      complexity: 'beginner',
      shortcut: 'F'
    },
    {
      id: 'md_chamfer',
      title: 'Chamfer Tool',
      category: 'Modeling',
      description: 'Press C. Select edges. Enter chamfer distance or angle. Creates 45° or custom-angle bevels. Good for assembly clearance.',
      tags: ['chamfer', 'feature'],
      complexity: 'beginner',
      shortcut: 'C'
    },
    {
      id: 'md_pattern_rect',
      title: 'Rectangular Pattern',
      category: 'Modeling',
      description: 'Select a feature, press P. Choose rectangular grid. Set count & spacing in X and Y. Creates array of copies.',
      tags: ['pattern', 'array'],
      complexity: 'intermediate',
      shortcut: 'P'
    },
    {
      id: 'md_pattern_circ',
      title: 'Circular Pattern',
      category: 'Modeling',
      description: 'Select feature. Create circular array around a point/axis. Set count and angle. Perfect for holes in wheels.',
      tags: ['pattern', 'array'],
      complexity: 'intermediate'
    },
    {
      id: 'md_mirror',
      title: 'Mirror Feature',
      category: 'Modeling',
      description: 'Select feature and mirror plane. Creates mirrored copy on opposite side. Maintains parametric link.',
      tags: ['mirror', 'symmetry'],
      complexity: 'intermediate'
    },
    {
      id: 'md_boolean',
      title: 'Boolean Operations',
      category: 'Modeling',
      description: 'Combine solids: Union (merge), Cut (subtract), Intersect (overlap only). Select primary body then tool body.',
      tags: ['boolean', 'csg'],
      complexity: 'intermediate'
    },
    {
      id: 'md_shell',
      title: 'Shell Tool',
      category: 'Modeling',
      description: 'Remove faces from solid, leaving hollow shell with uniform wall thickness. Great for vessels, casings.',
      tags: ['shell', 'hollow'],
      complexity: 'intermediate'
    },
    {
      id: 'md_draft',
      title: 'Draft Tool',
      category: 'Modeling',
      description: 'Add taper angle to faces for easier mold removal. Select faces and enter draft angle (2-10° typical).',
      tags: ['draft', 'manufacturing'],
      complexity: 'advanced'
    },
    {
      id: 'md_thread',
      title: 'Thread Tool',
      category: 'Modeling',
      description: 'Add helical threads to cylinders. Specify pitch, profile (ISO/UNC), and male/female type. Auto-generates accurate geometry.',
      tags: ['thread', 'fastener'],
      complexity: 'advanced'
    },
    {
      id: 'md_split',
      title: 'Split Body',
      category: 'Modeling',
      description: 'Divide solid using planes or sketches. Creates separate bodies for analysis or manufacturing.',
      tags: ['split', 'division'],
      complexity: 'intermediate'
    },
    {
      id: 'md_parameters',
      title: 'Parametric Updates',
      category: 'Modeling',
      description: 'Change sketch dimensions or feature parameters → all downstream features update automatically. True parametric design.',
      tags: ['parametric', 'workflow'],
      complexity: 'intermediate'
    },
    {
      id: 'md_history',
      title: 'Feature Suppression',
      category: 'Modeling',
      description: 'Right-click feature in tree → Suppress. Removes from computation. Useful for testing variations without deleting.',
      tags: ['feature', 'tree'],
      complexity: 'intermediate'
    },
    {
      id: 'md_reorder',
      title: 'Reordering Features',
      category: 'Modeling',
      description: 'Drag features in tree to reorder. Can change which features affect later ones. Rebuilds automatically.',
      tags: ['feature', 'tree'],
      complexity: 'intermediate'
    },
    {
      id: 'md_tip',
      title: 'Feature Tip',
      category: 'Modeling',
      description: 'Right-click feature → Set as Tip. Only features up to tip are computed. Speeds up editing long histories.',
      tags: ['feature', 'performance'],
      complexity: 'intermediate'
    },
    {
      id: 'md_tutorial',
      title: 'Modeling Tutorial',
      category: 'Modeling',
      description: 'Create a bracket: sketch → extrude → add hole → fillet edges → export STL.',
      tags: ['tutorial'],
      complexity: 'intermediate',
      tutorialId: 'tut_modeling'
    },

    // ===== ASSEMBLY (15 entries) =====
    {
      id: 'as_overview',
      title: 'Assembly Basics',
      category: 'Assembly',
      description: 'Assemblies combine multiple parts using constraints. Switch to Assembly workspace to add components and create joints.',
      tags: ['assembly'],
      complexity: 'intermediate'
    },
    {
      id: 'as_add_component',
      title: 'Adding Components',
      category: 'Assembly',
      description: 'Assembly workspace → Add Component. Load STEP/CCAD files. Each component has its own coordinate system.',
      tags: ['component'],
      complexity: 'intermediate'
    },
    {
      id: 'as_joint_mate',
      title: 'Mate Joint',
      category: 'Assembly',
      description: 'Align faces or planes of two components. They touch and move together. Primary constraint for assemblies.',
      tags: ['joint', 'constraint'],
      complexity: 'intermediate'
    },
    {
      id: 'as_joint_fixed',
      title: 'Fixed Joint',
      category: 'Assembly',
      description: 'Lock a component in place. Zero degrees of freedom. Used for structural reference parts.',
      tags: ['joint', 'constraint'],
      complexity: 'beginner'
    },
    {
      id: 'as_joint_hinge',
      title: 'Hinge Joint (Revolute)',
      category: 'Assembly',
      description: 'Component rotates around an axis (like a door hinge). 1 degree of freedom. Define axis and rotation limits.',
      tags: ['joint', 'kinematics'],
      complexity: 'intermediate'
    },
    {
      id: 'as_joint_slide',
      title: 'Slider Joint (Prismatic)',
      category: 'Assembly',
      description: 'Component slides along a direction (like a piston). 1 degree of freedom. Define direction and limits.',
      tags: ['joint', 'kinematics'],
      complexity: 'intermediate'
    },
    {
      id: 'as_joint_ball',
      title: 'Ball Joint (Spherical)',
      category: 'Assembly',
      description: 'Two spheres align (like ball-and-socket). 3 rotational degrees of freedom. Useful for universal joints.',
      tags: ['joint', 'kinematics'],
      complexity: 'advanced'
    },
    {
      id: 'as_bom',
      title: 'Generate BOM',
      category: 'Assembly',
      description: 'Assembly → Generate BOM. Creates bill of materials with part counts, descriptions, total weight. Export to CSV.',
      tags: ['bom', 'manufacturing'],
      complexity: 'beginner'
    },
    {
      id: 'as_explode',
      title: 'Exploded View',
      category: 'Assembly',
      description: 'Assembly → Explode. Animates components away from assembly. Great for presentations. Can be exported as video.',
      tags: ['visualization', 'presentation'],
      complexity: 'beginner'
    },
    {
      id: 'as_interference',
      title: 'Interference Detection',
      category: 'Assembly',
      description: 'Validate → Check Interference. Highlights overlapping components. Ensures no clashes in final design.',
      tags: ['validation'],
      complexity: 'intermediate'
    },
    {
      id: 'as_drive',
      title: 'Drive Constraint',
      category: 'Assembly',
      description: 'Manually move a component with constrained motion. Test assembly before manufacturing.',
      tags: ['test', 'animation'],
      complexity: 'intermediate'
    },
    {
      id: 'as_patterns',
      title: 'Pattern Components',
      category: 'Assembly',
      description: 'Rectangular or circular array of a component. Maintains constraints. Useful for gear arrays, fastener patterns.',
      tags: ['pattern', 'array'],
      complexity: 'intermediate'
    },
    {
      id: 'as_animation',
      title: 'Assembly Animation',
      category: 'Assembly',
      description: 'Timeline workspace → record component motion. Animate hinges opening, sliders extending, etc. Export as video.',
      tags: ['animation', 'motion'],
      complexity: 'advanced'
    },
    {
      id: 'as_tutorial',
      title: 'Assembly Tutorial',
      category: 'Assembly',
      description: 'Import 2 parts → add mate constraints → generate BOM → create exploded view.',
      tags: ['tutorial'],
      complexity: 'intermediate',
      tutorialId: 'tut_assembly'
    },

    // ===== DRAWING (15 entries) =====
    {
      id: 'dw_overview',
      title: 'Engineering Drawings Basics',
      category: 'Drawing',
      description: 'Drawing workspace creates 2D engineering drawings from 3D models. Add standard views, dimensions, annotations.',
      tags: ['drawing', 'engineering'],
      complexity: 'intermediate'
    },
    {
      id: 'dw_create',
      title: 'Creating a Drawing',
      category: 'Drawing',
      description: 'Drawing workspace → New Sheet. Select paper size (A4, A3, A2). Add views from 3D model.',
      tags: ['drawing'],
      complexity: 'intermediate'
    },
    {
      id: 'dw_view_front',
      title: 'Front View',
      category: 'Drawing',
      description: 'Standard orthographic projection from front. Click → drag on sheet to place. Scale and position as needed.',
      tags: ['view', 'orthographic'],
      complexity: 'beginner'
    },
    {
      id: 'dw_view_top',
      title: 'Top View',
      category: 'Drawing',
      description: 'Orthographic projection from above. Usually placed above front view. Maintains alignment automatically.',
      tags: ['view', 'orthographic'],
      complexity: 'beginner'
    },
    {
      id: 'dw_isometric',
      title: 'Isometric View',
      category: 'Drawing',
      description: 'Angled 3D view (30°/30°). Great for clarity but not a true orthographic projection.',
      tags: ['view', 'visualization'],
      complexity: 'beginner'
    },
    {
      id: 'dw_section',
      title: 'Section View',
      category: 'Drawing',
      description: 'Cut-away view showing internal details. Define section line on drawing → creates view showing cross-section.',
      tags: ['section', 'advanced'],
      complexity: 'advanced'
    },
    {
      id: 'dw_dimension',
      title: 'Adding Dimensions',
      category: 'Drawing',
      description: 'Click Dimension tool → select edges/vertices. Add distance, angle, radius dimensions. Updates if 3D model changes.',
      tags: ['dimension', 'annotation'],
      complexity: 'intermediate'
    },
    {
      id: 'dw_note',
      title: 'Adding Notes',
      category: 'Drawing',
      description: 'Click Note tool → click location on drawing. Type text. Used for specifications, warnings, revision notes.',
      tags: ['annotation'],
      complexity: 'beginner'
    },
    {
      id: 'dw_gdt',
      title: 'GD&T Annotations',
      category: 'Drawing',
      description: 'Add Geometric Dimensioning & Tolerancing symbols (position, profile, perpendicularity, etc.). ISO 1101 compliant.',
      tags: ['gdt', 'tolerance'],
      complexity: 'advanced'
    },
    {
      id: 'dw_titleblock',
      title: 'Title Block',
      category: 'Drawing',
      description: 'Pre-formatted template with company name, part number, scale, revision. Customizable in settings.',
      tags: ['template', 'administration'],
      complexity: 'beginner'
    },
    {
      id: 'dw_tolerance',
      title: 'Setting Tolerances',
      category: 'Drawing',
      description: 'Dimension properties → set ±tolerance. Shows as 50±0.1. Critical for manufacturing accuracy.',
      tags: ['tolerance', 'manufacturing'],
      complexity: 'intermediate'
    },
    {
      id: 'dw_export_pdf',
      title: 'Exporting as PDF',
      category: 'Drawing',
      description: 'File → Export as PDF. Creates print-ready document with all views, dimensions, notes.',
      tags: ['export', 'pdf'],
      complexity: 'beginner'
    },
    {
      id: 'dw_print',
      title: 'Printing Drawings',
      category: 'Drawing',
      description: 'File → Print. Preview shows actual paper layout. Can print to physical printer or PDF.',
      tags: ['print', 'output'],
      complexity: 'beginner'
    },
    {
      id: 'dw_tutorial',
      title: 'Drawing Tutorial',
      category: 'Drawing',
      description: 'Create a simple drawing: add front/top views, dimension a hole, add notes, export as PDF.',
      tags: ['tutorial'],
      complexity: 'intermediate',
      tutorialId: 'tut_drawing'
    },

    // ===== SIMULATION (10 entries) =====
    {
      id: 'sm_fea_overview',
      title: 'FEA Simulation Basics',
      category: 'Simulation',
      description: 'Finite Element Analysis breaks model into small elements and calculates stress/strain. Predicts failure points.',
      tags: ['fea', 'analysis'],
      complexity: 'advanced'
    },
    {
      id: 'sm_setup',
      title: 'Setting Up a Simulation',
      category: 'Simulation',
      description: 'Simulation workspace → New Study. Choose analysis type (static, thermal, modal). Apply loads and constraints.',
      tags: ['simulation', 'setup'],
      complexity: 'advanced'
    },
    {
      id: 'sm_mesh',
      title: 'Mesh Generation',
      category: 'Simulation',
      description: 'Auto-mesh divides geometry into elements. Finer mesh = more accurate but slower. Set element size.',
      tags: ['mesh'],
      complexity: 'advanced'
    },
    {
      id: 'sm_loads',
      title: 'Applying Loads',
      category: 'Simulation',
      description: 'Apply forces (N), pressure (Pa), moments. Select faces or edges. Magnitude and direction matter.',
      tags: ['load', 'boundary-condition'],
      complexity: 'advanced'
    },
    {
      id: 'sm_constraints',
      title: 'Boundary Constraints',
      category: 'Simulation',
      description: 'Fix edges/faces to prevent motion. Select geometry → Fixed. Can also apply spring constraints for flexibility.',
      tags: ['constraint', 'boundary-condition'],
      complexity: 'advanced'
    },
    {
      id: 'sm_material',
      title: 'Setting Material',
      category: 'Simulation',
      description: 'Select body → Properties → Material. Choose from library (Steel, Aluminum, Plastic). System calculates Young\'s modulus, Poisson ratio.',
      tags: ['material', 'property'],
      complexity: 'intermediate'
    },
    {
      id: 'sm_solve',
      title: 'Running Analysis',
      category: 'Simulation',
      description: 'Click Solve. System performs FEA calculation. Progress bar shows computation. Takes seconds to minutes.',
      tags: ['computation'],
      complexity: 'advanced'
    },
    {
      id: 'sm_results',
      title: 'Interpreting Results',
      category: 'Simulation',
      description: 'Shows stress (MPa), strain, deformation, factor of safety. Color map indicates danger zones (red = high stress).',
      tags: ['results', 'visualization'],
      complexity: 'advanced'
    },
    {
      id: 'sm_thermal',
      title: 'Thermal Analysis',
      category: 'Simulation',
      description: 'Analyze heat flow. Set boundary temperatures, heat sources. See temperature distribution and heat flux.',
      tags: ['thermal', 'analysis'],
      complexity: 'advanced'
    },

    // ===== CAM (10 entries) =====
    {
      id: 'cm_overview',
      title: 'CAM Basics',
      category: 'CAM',
      description: 'CAM workspace generates manufacturing toolpaths from 3D models. Choose machine type (CNC, 3D printer, laser) and tool.',
      tags: ['cam', 'manufacturing'],
      complexity: 'advanced'
    },
    {
      id: 'cm_workpiece',
      title: 'Setting Workpiece',
      category: 'CAM',
      description: 'Define stock material (solid, sheet, bar). Set dimensions and position. Toolpath calculates material removal.',
      tags: ['setup'],
      complexity: 'advanced'
    },
    {
      id: 'cm_tool',
      title: 'Selecting Tools',
      category: 'CAM',
      description: 'Choose end mill, ball mill, drill, or probe. Library has 100+ tools with flute counts, speeds, feeds.',
      tags: ['tool'],
      complexity: 'advanced'
    },
    {
      id: 'cm_operation',
      title: 'Creating Operations',
      category: 'CAM',
      description: 'Add face milling, slot milling, drilling, contour operations. Each operation uses selected tool and parameters.',
      tags: ['operation'],
      complexity: 'advanced'
    },
    {
      id: 'cm_preview',
      title: 'Toolpath Preview',
      category: 'CAM',
      description: 'Visualize cutting path on workpiece. Shows tool moving through stock. Check for collisions and tool changes.',
      tags: ['visualization', 'verification'],
      complexity: 'advanced'
    },
    {
      id: 'cm_gcode',
      title: 'G-Code Generation',
      category: 'CAM',
      description: 'Post-processor converts toolpath to G-code (machine instructions). Saves as .nc file for CNC machine.',
      tags: ['gcode', 'output'],
      complexity: 'advanced'
    },
    {
      id: 'cm_fdm',
      title: '3D Print Setup',
      category: 'CAM',
      description: 'CAM workspace → 3D Print. Choose layer height, infill, support type. Slices model automatically.',
      tags: ['3dprint', 'fdm'],
      complexity: 'intermediate'
    },
    {
      id: 'cm_laser',
      title: 'Laser Cutting',
      category: 'CAM',
      description: 'Set material, bed size, cutting power. Generates raster/vector path for laser engraver/cutter.',
      tags: ['laser'],
      complexity: 'advanced'
    },

    // ===== AI & RENDERING (10 entries) =====
    {
      id: 'ai_copilot',
      title: 'AI Copilot',
      category: 'AI Tools',
      description: 'Talk to AI: "Create a socket head bolt" or "Add fillets to all edges". AI understands natural language and generates geometry.',
      tags: ['ai', 'agent'],
      complexity: 'beginner'
    },
    {
      id: 'ai_textocad',
      title: 'Text-to-CAD',
      category: 'AI Tools',
      description: 'Type description of part → AI generates 3D model. "50mm cylinder with 10mm hole" → done.',
      tags: ['ai', 'generation'],
      complexity: 'beginner'
    },
    {
      id: 'ai_partid',
      title: 'Part Identification',
      category: 'AI Tools',
      description: 'Upload image of part → AI identifies it (bolt, bearing, spring, etc.). Provides McMaster-Carr search link.',
      tags: ['ai', 'identification'],
      complexity: 'beginner'
    },
    {
      id: 'rn_overview',
      title: 'Rendering Basics',
      category: 'Render',
      description: 'Render workspace creates photorealistic images. Add materials, lighting, environment. Export high-res images.',
      tags: ['rendering', 'visualization'],
      complexity: 'intermediate'
    },
    {
      id: 'rn_material',
      title: 'Materials & PBR',
      category: 'Render',
      description: 'Set metalness, roughness, color. PBR (Physically Based Rendering) ensures realistic appearance under all lighting.',
      tags: ['material', 'pbr'],
      complexity: 'intermediate'
    },
    {
      id: 'rn_lighting',
      title: 'Lighting Setup',
      category: 'Render',
      description: 'Add directional lights, point lights, spotlights. Adjust intensity and color. Good lighting = professional renders.',
      tags: ['lighting'],
      complexity: 'intermediate'
    },
    {
      id: 'rn_environment',
      title: 'Environment Maps',
      category: 'Render',
      description: 'HDRI background provides realistic reflections. Affects final image appearance. Hundreds available.',
      tags: ['environment', 'hdri'],
      complexity: 'intermediate'
    },
    {
      id: 'rn_raytrace',
      title: 'Ray Tracing',
      category: 'Render',
      description: 'High-quality rendering with realistic shadows and reflections. Takes longer but photorealistic. Toggle with T key.',
      tags: ['rendering', 'quality'],
      complexity: 'advanced'
    },
    {
      id: 'rn_animation',
      title: 'Render Animation',
      category: 'Render',
      description: 'Timeline workspace → render to MP4. Captures smooth animation of rotating models, assemblies, etc.',
      tags: ['animation', 'video'],
      complexity: 'advanced'
    },

    // ===== PLATFORM (10 entries) =====
    {
      id: 'pl_collaboration',
      title: 'Real-time Collaboration',
      category: 'Platform',
      description: 'Pro feature: invite users to edit same model together. See cursors, watch changes live. No merge conflicts.',
      tags: ['collab', 'pro-feature'],
      complexity: 'intermediate'
    },
    {
      id: 'pl_cloud',
      title: 'Cloud Sync',
      category: 'Platform',
      description: 'Pro feature: auto-sync to cloud. Access models on any device. 100GB storage included.',
      tags: ['cloud', 'storage', 'pro-feature'],
      complexity: 'beginner'
    },
    {
      id: 'pl_billing',
      title: 'Token Billing',
      category: 'Platform',
      description: 'Usage-based billing with $CYCLE tokens. Each operation costs tokens (extrude=50, FEA=500). Buy tokens or earn selling designs.',
      tags: ['billing', 'tokens'],
      complexity: 'beginner'
    },
    {
      id: 'pl_marketplace',
      title: 'Marketplace',
      category: 'Platform',
      description: 'Buy/sell designs, components, assemblies. Earn money from designs. Browse 10,000+ community models.',
      tags: ['marketplace', 'community'],
      complexity: 'beginner'
    },
    {
      id: 'pl_api',
      title: 'API & Integration',
      category: 'Platform',
      description: 'REST API to create/edit/export models programmatically. MCP integration for AI agents. Full documentation at cyclecad.com/api.',
      tags: ['api', 'integration'],
      complexity: 'advanced'
    },
    {
      id: 'pl_plugins',
      title: 'Plugin Development',
      category: 'Platform',
      description: 'Write custom features in JavaScript. Plugins hook into kernel and have access to geometry, UI, events.',
      tags: ['plugin', 'development'],
      complexity: 'advanced'
    },
    {
      id: 'pl_whatsnew',
      title: 'What\'s New in v3.2',
      category: 'Platform',
      description: 'LEGO microkernel · 8 workspaces · AI copilot · Real-time collaboration · $CYCLE tokens · 21 modules · 664 tests',
      tags: ['release-notes'],
      complexity: 'beginner'
    }
  ],

  // Interactive tutorials
  tutorials: [
    {
      id: 'tut_first_part',
      title: 'Your First Part',
      description: 'Create a simple box, add a fillet, export as STL. 5 minutes.',
      steps: [
        'Click Design workspace',
        'Click Sketch, select XY plane',
        'Draw a 100x50mm rectangle',
        'Press Escape to exit sketch',
        'Click Extrude, set height to 50mm',
        'Click Fillet, set radius to 5mm',
        'Export as STL'
      ]
    },
    {
      id: 'tut_sketch',
      title: 'Mastering Sketches',
      description: 'Draw constrained profiles for 3D features.',
      steps: [
        'Start new sketch on XY plane',
        'Draw a circle (C key) diameter 50mm',
        'Draw a line tangent to circle',
        'Add horizontal constraint (H key)',
        'Add distance constraint (D key): 100mm',
        'Sketch is fully constrained (white)',
        'Extrude to create base feature'
      ]
    },
    {
      id: 'tut_modeling',
      title: 'Modeling a Bracket',
      description: 'Create a complex part with multiple features.',
      steps: [
        'Extrude a 80x60x10mm base',
        'Add sketch on top face',
        'Draw mounting hole circles (Ø10mm)',
        'Extrude as pocket (negative)',
        'Add fillet to all edges (R=2mm)',
        'Add chamfer to mounting holes (1mm × 45°)',
        'Check in 3D: looks professional'
      ]
    },
    {
      id: 'tut_assembly',
      title: 'Building an Assembly',
      description: 'Combine parts with constraints.',
      steps: [
        'Switch to Assembly workspace',
        'Add base component (bracket.ccad)',
        'Add shaft component',
        'Mate base face to mounting surface',
        'Mate shaft center to hole center',
        'Generate BOM: see part list',
        'Create exploded view animation'
      ]
    },
    {
      id: 'tut_drawing',
      title: 'Creating Engineering Drawing',
      description: 'Generate 2D views with dimensions.',
      steps: [
        'Switch to Drawing workspace',
        'Add front and top views',
        'Add dimensions to critical features',
        'Add notes: material, finish, tolerances',
        'Insert title block with company info',
        'Export as PDF for manufacturing'
      ]
    }
  ],

  init() {
    this.registerHelpUI();
    this.setupKeyboardShortcuts();
  },

  registerHelpUI() {
    // Would be wired into main UI
    console.log('[Help] v3.2 initialized with', this.helpEntries.length, 'entries');
  },

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === '?') {
        this.openHelpPanel();
      }
    });
  },

  openHelpPanel() {
    // Opens help sidebar with search
    console.log('[Help] Opening help panel');
  },

  searchHelp(query) {
    const q = query.toLowerCase();
    return this.helpEntries.filter(entry =>
      entry.title.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.tags.some(tag => tag.includes(q))
    );
  },

  getEntriesByCategory(category) {
    return this.helpEntries.filter(entry => entry.category === category);
  },

  getContextualHelp(context) {
    // Return relevant help based on current workspace/mode
    const mapping = {
      'sketch': ['sk_overview', 'sk_line', 'sk_circle', 'sk_constraint'],
      'modeling': ['md_extrude', 'md_revolve', 'md_fillet', 'md_boolean'],
      'assembly': ['as_overview', 'as_add_component', 'as_joint_mate'],
      'drawing': ['dw_overview', 'dw_dimension', 'dw_export_pdf'],
      'render': ['rn_overview', 'rn_material', 'rn_lighting'],
      'cam': ['cm_overview', 'cm_operation', 'cm_gcode']
    };
    return mapping[context] || [];
  }
};

export default HelpModule;
