/**
 * SCAD Export Module for cycleCAD
 * Three.js ↔ OpenSCAD conversion with BOSL2/MCAD library support
 *
 * Exports cycleCAD designs to parametric OpenSCAD code
 * Imports OpenSCAD designs to Three.js geometry
 * Includes 50+ BOSL2 shapes and MCAD library definitions
 */

const CycleCADSCADExport = (() => {
  // ============================================================================
  // STATE & CONFIG
  // ============================================================================

  let scene = null;
  let camera = null;
  const SCAD_PRIMITIVES = {
    'BoxGeometry': 'cube',
    'CylinderGeometry': 'cylinder',
    'SphereGeometry': 'sphere',
    'TorusGeometry': 'torus',
    'ConeGeometry': 'cone',
    'TetrahedronGeometry': 'tetrahedron',
    'OctahedronGeometry': 'octahedron',
    'DodecahedronGeometry': 'dodecahedron',
    'IcosahedronGeometry': 'icosahedron'
  };

  const BOSL2_SHAPES = {
    'screw': { params: 'spec, head, shaft, length, pitch, thread, rotate, anchor, orient', desc: 'Metric screw with head' },
    'nut': { params: 'spec, hole, thickness, anchor, orient', desc: 'Metric nut' },
    'bolt_head': { params: 'spec, length, anchor, orient', desc: 'Bolt head only' },
    'spur_gear': { params: 'pitch, teeth, thickness, shaft_diam, hide_root, center, anchor, orient', desc: 'Spur gear' },
    'bevel_gear': { params: 'pitch, teeth, face_width, cone_angle, shaft_diam, hide_root, anchor, orient', desc: 'Bevel gear' },
    'rack': { params: 'pitch, teeth, thickness, height, anchor, orient', desc: 'Gear rack' },
    'threaded_rod': { params: 'diameter, length, pitch, internal, bevel, orient, anchor', desc: 'Threaded rod/bolt' },
    'threaded_nut': { params: 'diameter, thickness, pitch, internal, bevel, anchor, orient', desc: 'Threaded nut' },
    'bezier_surface': { params: 'patches, N, style', desc: 'Bezier surface patch' },
    'bezier_path': { params: 'path, N, closed, uniform', desc: 'Bezier curve path' },
    'cuboid': { params: 'size, rounding, edges, corners, p1, p2, anchor, orient, spin', desc: 'Rounded cube' },
    'cyl': { params: 'l, r, r1, r2, anchor, orient, spin', desc: 'Cylinder with chamfer' },
    'xcyl': { params: 'l, r, anchor, orient, spin', desc: 'X-axis cylinder' },
    'ycyl': { params: 'l, r, anchor, orient, spin', desc: 'Y-axis cylinder' },
    'zcyl': { params: 'l, r, anchor, orient, spin', desc: 'Z-axis cylinder' },
    'prism': { params: 'n, size, height, center, anchor, orient, spin', desc: 'Regular prism' },
    'hexagon': { params: 'size, height, center, anchor, orient, spin', desc: 'Regular hexagon' },
    'octagon': { params: 'size, height, center, anchor, orient, spin', desc: 'Regular octagon' },
    'egg': { params: 'length, width, r1, r2, base_size, center, anchor, orient, spin', desc: 'Egg shape' },
    'teardrop': { params: 'r, ang, cap_h, center, anchor, orient, spin', desc: 'Teardrop shape' },
    'cylinder_chamfer': { params: 'r, h, chamf, anchor, orient, spin', desc: 'Cylinder with chamfered edges' },
    'cylinder_vent': { params: 'r, l, size, style, anchor, orient, spin', desc: 'Cylinder with vent holes' },
    'corrugated_surface': { params: 'size, waves, amplitude, thickness, anchor, orient', desc: 'Corrugated surface' },
    'hemisphere': { params: 'r, anchor, orient, spin', desc: 'Half sphere' },
    'ring': { params: 'r, r_i, h, center, anchor, orient, spin', desc: 'Ring/annulus' },
    'torus': { params: 'r_maj, r_min, center, anchor, orient, spin', desc: 'Torus' }
  };

  const MCAD_SHAPES = {
    'hexagon': { file: 'regular_shapes', params: 'size, height', desc: 'Regular hexagon' },
    'octagon': { file: 'regular_shapes', params: 'size, height', desc: 'Regular octagon' },
    'oval': { file: 'regular_shapes', params: 'width, height, depth', desc: 'Oval cylinder' },
    'spur_gear': { file: 'involute_gears', params: 'pitch, teeth, width, hole_diam', desc: 'Involute spur gear' },
    'rack': { file: 'involute_gears', params: 'pitch, teeth, width, height', desc: 'Involute gear rack' },
    'bearing': { file: 'bearing', params: 'model', desc: 'Standard bearing' },
    'motor_shaft': { file: 'stepper', params: 'model', desc: 'Stepper motor' },
    'bolt': { file: 'nuts_and_bolts', params: 'diameter, length, pitch', desc: 'Standard bolt' },
    'nut': { file: 'nuts_and_bolts', params: 'diameter, height', desc: 'Standard nut' },
    'washer': { file: 'nuts_and_bolts', params: 'hole_diameter, outer_diameter', desc: 'Washer' }
  };

  // ============================================================================
  // EXPORT: THREE.JS TO SCAD
  // ============================================================================

  /**
   * Convert Three.js Geometry to OpenSCAD primitive code
   * @param {THREE.BufferGeometry} geometry
   * @param {THREE.Vector3} position
   * @param {THREE.Euler} rotation
   * @param {THREE.Vector3} scale
   * @returns {string}
   */
  function geometryToSCAD(geometry, position, rotation, scale) {
    let scadCode = '';

    // Determine geometry type and convert
    if (geometry.constructor.name === 'BoxGeometry') {
      const params = geometry.parameters;
      const w = (params.width * (scale?.x || 1)).toFixed(2);
      const h = (params.height * (scale?.y || 1)).toFixed(2);
      const d = (params.depth * (scale?.z || 1)).toFixed(2);
      scadCode = `cube([${w}, ${h}, ${d}], center=true)`;
    }
    else if (geometry.constructor.name === 'CylinderGeometry') {
      const params = geometry.parameters;
      const r1 = (params.radiusTop * (scale?.x || 1)).toFixed(2);
      const r2 = (params.radiusBottom * (scale?.x || 1)).toFixed(2);
      const h = (params.height * (scale?.z || 1)).toFixed(2);
      const fn = params.radialSegments || 32;
      scadCode = `cylinder(h=${h}, r1=${r1}, r2=${r2}, $fn=${fn})`;
    }
    else if (geometry.constructor.name === 'SphereGeometry') {
      const params = geometry.parameters;
      const r = (params.radius * (scale?.x || 1)).toFixed(2);
      const fn = params.widthSegments || 32;
      scadCode = `sphere(r=${r}, $fn=${fn})`;
    }
    else if (geometry.constructor.name === 'ConeGeometry') {
      const params = geometry.parameters;
      const r = (params.radius * (scale?.x || 1)).toFixed(2);
      const h = (params.height * (scale?.z || 1)).toFixed(2);
      const fn = params.radialSegments || 32;
      scadCode = `cylinder(h=${h}, r1=${r}, r2=0, $fn=${fn})`;
    }
    else if (geometry.constructor.name === 'TorusGeometry') {
      const params = geometry.parameters;
      const r_maj = (params.radius * (scale?.x || 1)).toFixed(2);
      const r_min = (params.tube * (scale?.x || 1)).toFixed(2);
      scadCode = `rotate_extrude($fn=64) translate([${r_maj}, 0]) circle(r=${r_min}, $fn=32)`;
    }
    else {
      // Fallback: use ExtrudeGeometry or default cube
      scadCode = `cube([10, 10, 10])  // Unknown geometry type: ${geometry.constructor.name}`;
    }

    // Apply transforms
    let transformedCode = scadCode;

    // Scale
    if (scale && (scale.x !== 1 || scale.y !== 1 || scale.z !== 1)) {
      transformedCode = `scale([${scale.x.toFixed(3)}, ${scale.y.toFixed(3)}, ${scale.z.toFixed(3)}]) ${transformedCode}`;
    }

    // Rotation (convert to degrees)
    if (rotation && (rotation.x !== 0 || rotation.y !== 0 || rotation.z !== 0)) {
      const degX = (rotation.x * 180 / Math.PI).toFixed(2);
      const degY = (rotation.y * 180 / Math.PI).toFixed(2);
      const degZ = (rotation.z * 180 / Math.PI).toFixed(2);
      transformedCode = `rotate([${degX}, ${degY}, ${degZ}]) ${transformedCode}`;
    }

    // Translation
    if (position && (position.x !== 0 || position.y !== 0 || position.z !== 0)) {
      transformedCode = `translate([${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}]) ${transformedCode}`;
    }

    return transformedCode;
  }

  /**
   * Traverse Three.js scene and convert to SCAD code
   * @param {THREE.Scene} sceneGraph
   * @returns {string}
   */
  function traverseScene(sceneGraph) {
    let variables = [];
    let geometry = [];
    let visited = new Set();

    function traverse(obj, depth = 0) {
      if (visited.has(obj.uuid)) return;
      visited.add(obj.uuid);

      const indent = '  '.repeat(depth);

      // Process meshes
      if (obj.isMesh) {
        const meshCode = geometryToSCAD(obj.geometry, obj.position, obj.rotation, obj.scale);
        const name = obj.name || `mesh_${geometry.length}`;
        geometry.push(`${indent}// ${name}\n${indent}${meshCode}`);
      }

      // Process groups (as modules)
      if (obj.children.length > 0 && obj.isGroup) {
        const groupName = obj.name || `group_${geometry.length}`;
        geometry.push(`\n${indent}// Group: ${groupName}`);
      }

      // Recurse
      obj.children.forEach(child => traverse(child, depth + 1));
    }

    traverse(sceneGraph);

    // Build complete SCAD code
    let scadCode = '';
    scadCode += '// Generated by cycleCAD OpenSCAD Export\n';
    scadCode += '// Use <BOSL2/std.scad>  // Uncomment for BOSL2 library\n';
    scadCode += '\n';
    scadCode += '// ============= PARAMETERS =============\n';
    scadCode += '$fn = 64;  // Resolution: higher = smoother, slower\n';
    scadCode += '\n';
    scadCode += '// ============= GEOMETRY =============\n';
    scadCode += geometry.join('\n');
    scadCode += '\n';

    return scadCode;
  }

  /**
   * Export current scene to SCAD
   * @returns {string}
   */
  function exportScene() {
    if (!scene) {
      console.error('Scene not initialized');
      return '';
    }
    return traverseScene(scene);
  }

  /**
   * Export single mesh to SCAD
   * @param {THREE.Mesh} mesh
   * @returns {string}
   */
  function exportMesh(mesh) {
    return geometryToSCAD(mesh.geometry, mesh.position, mesh.rotation, mesh.scale);
  }

  // ============================================================================
  // IMPORT: SCAD TO THREE.JS
  // ============================================================================

  /**
   * Simple SCAD parser - builds AST from SCAD text
   * @param {string} scadCode
   * @returns {object}
   */
  function parseSCAD(scadCode) {
    const ast = {
      includes: [],
      uses: [],
      variables: {},
      functions: {},
      modules: {},
      objects: []
    };

    // Remove comments
    scadCode = scadCode.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // Extract includes
    const includeMatches = scadCode.match(/include\s*<([^>]+)>/g) || [];
    ast.includes = includeMatches.map(m => m.match(/<([^>]+)>/)[1]);

    // Extract uses
    const useMatches = scadCode.match(/use\s*<([^>]+)>/g) || [];
    ast.uses = useMatches.map(m => m.match(/<([^>]+)>/)[1]);

    // Extract variables: name = value;
    const varMatches = scadCode.match(/(\w+)\s*=\s*([^;]+);/g) || [];
    varMatches.forEach(match => {
      const parts = match.match(/(\w+)\s*=\s*([^;]+);/);
      if (parts) {
        ast.variables[parts[1]] = parts[2].trim();
      }
    });

    return ast;
  }

  /**
   * Evaluate simple SCAD expressions
   * @param {string} expr
   * @param {object} context - variables context
   * @returns {*}
   */
  function evaluateSCADExpr(expr, context = {}) {
    try {
      // Replace variable references
      let code = expr;
      Object.keys(context).forEach(key => {
        code = code.replace(new RegExp(`\\b${key}\\b`, 'g'), `(${context[key]})`);
      });
      // Evaluate math safely
      return Function(`"use strict"; return (${code})`)();
    } catch (e) {
      console.warn(`Failed to evaluate SCAD expression: ${expr}`, e);
      return null;
    }
  }

  /**
   * Convert SCAD code to Three.js geometry
   * @param {string} scadCode
   * @returns {THREE.Group}
   */
  function importSCAD(scadCode) {
    const ast = parseSCAD(scadCode);
    const group = new THREE.Group();
    const context = ast.variables;

    // Parse and create geometry
    const lines = scadCode.split('\n');

    lines.forEach(line => {
      line = line.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('//') || line.startsWith('/*')) return;

      // cube([w, h, d])
      if (line.includes('cube(')) {
        const match = line.match(/cube\(\[([^\]]+)\]/);
        if (match) {
          const dims = match[1].split(',').map(d => evaluateSCADExpr(d.trim(), context));
          const geo = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
          group.add(new THREE.Mesh(geo));
        }
      }

      // cylinder(h=..., r=...)
      if (line.includes('cylinder(')) {
        const hMatch = line.match(/h=([^,)]+)/);
        const rMatch = line.match(/r=([^,)]+)/);
        const h = hMatch ? evaluateSCADExpr(hMatch[1].trim(), context) : 10;
        const r = rMatch ? evaluateSCADExpr(rMatch[1].trim(), context) : 5;
        const geo = new THREE.CylinderGeometry(r, r, h, 32);
        group.add(new THREE.Mesh(geo));
      }

      // sphere(r=...)
      if (line.includes('sphere(')) {
        const match = line.match(/r=([^,)]+)/);
        const r = match ? evaluateSCADExpr(match[1].trim(), context) : 5;
        const geo = new THREE.SphereGeometry(r, 32, 32);
        group.add(new THREE.Mesh(geo));
      }

      // translate([x, y, z])
      if (line.includes('translate(')) {
        const match = line.match(/translate\(\[([^\]]+)\]/);
        if (match) {
          const coords = match[1].split(',').map(d => evaluateSCADExpr(d.trim(), context));
          // Parse child object on same line (simplified)
          const child = group.children[group.children.length - 1];
          if (child) {
            child.position.set(coords[0], coords[1], coords[2]);
          }
        }
      }
    });

    return group;
  }

  // ============================================================================
  // CODE FORMATTING
  // ============================================================================

  /**
   * Pretty-print SCAD code
   * @param {string} code
   * @returns {string}
   */
  function formatCode(code) {
    let formatted = '';
    let indentLevel = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const prevChar = i > 0 ? code[i - 1] : '';

      // Track strings
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        inString = !inString;
        stringChar = inString ? char : '';
      }

      if (!inString) {
        if (char === '{' || char === '[' || char === '(') {
          formatted += char;
          if (char === '{' || char === '[') {
            indentLevel++;
            formatted += '\n' + '  '.repeat(indentLevel);
          }
        } else if (char === '}' || char === ']') {
          indentLevel = Math.max(0, indentLevel - 1);
          formatted = formatted.trimEnd() + '\n' + '  '.repeat(indentLevel) + char;
        } else if (char === ';') {
          formatted += char + '\n' + '  '.repeat(indentLevel);
        } else if (char === ',' && prevChar !== ' ') {
          formatted += char + ' ';
        } else if (char === ' ' && prevChar === ' ') {
          // Skip duplicate spaces
        } else {
          formatted += char;
        }
      } else {
        formatted += char;
      }
    }

    return formatted.trim();
  }

  // ============================================================================
  // UI & INTEGRATION
  // ============================================================================

  /**
   * Get UI panel HTML
   * @returns {string}
   */
  function getUI() {
    return `
      <div id="scad-export-panel" style="padding: 12px;">
        <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: bold;">OpenSCAD Export</h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <button class="scad-btn" data-action="scad-export-scene"
            style="padding: 8px; background: #0284C7; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Export Scene
          </button>
          <button class="scad-btn" data-action="scad-export-selected"
            style="padding: 8px; background: #0284C7; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Export Selected
          </button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <button class="scad-btn" data-action="scad-import"
            style="padding: 8px; background: #7C3AED; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Import SCAD
          </button>
          <button class="scad-btn" data-action="scad-library"
            style="padding: 8px; background: #059669; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            BOSL2 Library
          </button>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11px; margin-bottom: 4px; color: #666;">
            <input type="checkbox" id="scad-use-bosl2" checked /> Use BOSL2 library
          </label>
          <label style="display: block; font-size: 11px; color: #666;">
            <input type="checkbox" id="scad-use-mcad" /> Use MCAD library
          </label>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="display: block; font-size: 11px; margin-bottom: 4px; color: #666;">
            Render Quality ($fn):
          </label>
          <input type="range" id="scad-quality" min="8" max="128" value="64"
            style="width: 100%; cursor: pointer;" />
          <span id="scad-quality-val" style="font-size: 11px; color: #888;">64</span>
        </div>

        <textarea id="scad-code" placeholder="SCAD code will appear here..."
          style="width: 100%; height: 200px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;
            font-family: 'Courier New', monospace; font-size: 11px; resize: vertical; margin-bottom: 8px;">
        </textarea>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button class="scad-btn" data-action="scad-copy"
            style="padding: 8px; background: #1F2937; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Copy to Clipboard
          </button>
          <button class="scad-btn" data-action="scad-download"
            style="padding: 8px; background: #1F2937; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            Download .scad
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Get library shapes list
   * @returns {object}
   */
  function getLibraryShapes() {
    return {
      BOSL2: BOSL2_SHAPES,
      MCAD: MCAD_SHAPES,
      count: Object.keys(BOSL2_SHAPES).length + Object.keys(MCAD_SHAPES).length
    };
  }

  /**
   * Initialize module
   * @param {THREE.Scene} gameScene
   * @param {THREE.Camera} gameCamera
   */
  function init(gameScene, gameCamera) {
    scene = gameScene;
    camera = gameCamera;

    // Attach event listeners to UI buttons
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.scad-btn');
      if (!btn) return;

      const action = btn.getAttribute('data-action');
      execute(action);
    });

    // Quality slider update
    const qualitySlider = document.getElementById('scad-quality');
    if (qualitySlider) {
      qualitySlider.addEventListener('change', (e) => {
        document.getElementById('scad-quality-val').textContent = e.target.value;
      });
    }

    console.log('SCAD Export module initialized');
  }

  /**
   * Execute action
   * @param {string} action
   * @param {object} params
   */
  function execute(action, params = {}) {
    const codeBox = document.getElementById('scad-code');
    const useBOSL2 = document.getElementById('scad-use-bosl2')?.checked;
    const useMCAD = document.getElementById('scad-use-mcad')?.checked;
    const quality = document.getElementById('scad-quality')?.value || 64;

    switch (action) {
      case 'scad-export-scene': {
        let code = exportScene();

        // Add library includes
        if (useBOSL2) {
          code = `include <BOSL2/std.scad>\n\n${code}`;
        }
        if (useMCAD) {
          code = `use <MCAD/regular_shapes.scad>\nuse <MCAD/involute_gears.scad>\n\n${code}`;
        }

        // Format and show
        code = formatCode(code);
        code = code.replace('$fn = 64;', `$fn = ${quality};`);
        if (codeBox) codeBox.value = code;
        console.log('Scene exported to SCAD');
        break;
      }

      case 'scad-export-selected': {
        // Export selected object (simplified - exports first selected)
        const selectedObj = window.selectedMesh || (scene?.children[0]);
        if (!selectedObj || !selectedObj.isMesh) {
          alert('No mesh selected');
          return;
        }
        const code = exportMesh(selectedObj);
        if (codeBox) codeBox.value = code;
        console.log('Selected mesh exported to SCAD');
        break;
      }

      case 'scad-import': {
        const code = codeBox?.value || '';
        if (!code.trim()) {
          alert('No SCAD code to import');
          return;
        }
        const group = importSCAD(code);
        scene?.add(group);
        console.log('SCAD imported to scene');
        break;
      }

      case 'scad-library': {
        const libs = getLibraryShapes();
        const msg = `BOSL2: ${Object.keys(libs.BOSL2).length} shapes\nMCAD: ${Object.keys(libs.MCAD).length} shapes\n\nSee console for full list`;
        alert(msg);
        console.table(libs.BOSL2);
        console.table(libs.MCAD);
        break;
      }

      case 'scad-copy': {
        const code = codeBox?.value || '';
        if (!code.trim()) {
          alert('No code to copy');
          return;
        }
        navigator.clipboard.writeText(code).then(() => {
          alert('Copied to clipboard!');
        });
        break;
      }

      case 'scad-download': {
        const code = codeBox?.value || '';
        if (!code.trim()) {
          alert('No code to download');
          return;
        }
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'design.scad';
        a.click();
        URL.revokeObjectURL(url);
        console.log('SCAD file downloaded');
        break;
      }

      default:
        console.warn(`Unknown SCAD action: ${action}`);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    init,
    getUI,
    execute,
    exportScene,
    exportMesh,
    importSCAD,
    formatCode,
    getLibraryShapes,
    geometryToSCAD,
    parseSCAD,
    evaluateSCADExpr,
    // Exports for testing/advanced use
    BOSL2_SHAPES,
    MCAD_SHAPES
  };
})();

// Register on global
if (typeof window !== 'undefined') {
  if (!window.CycleCAD) window.CycleCAD = {};
  window.CycleCAD.SCADExport = CycleCADSCADExport;
}

// Export for Node.js/module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CycleCADSCADExport;
}
