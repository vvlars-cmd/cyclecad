/**
 * Text-to-BREP Engine for cycleCAD
 * Converts natural language descriptions to OpenCascade.js B-rep commands
 *
 * Supports:
 * - Gemini Flash API (primary)
 * - Offline pattern matching (fallback)
 * - 10+ predefined templates
 */

const TEMPLATES = {
  bearing_housing: {
    name: "Flanged Bearing Housing",
    description: "Cylinder with bore, flange, and bolt holes",
    defaults: { od: 80, id: 50, bore: 30, flange_width: 15, flange_height: 120, holes: 4, hole_diameter: 8 },
    commands: (p) => [
      { op: "cylinder", radius: p.od / 2, height: p.flange_height },
      { op: "cylinder", radius: p.bore / 2, height: p.flange_height + 5, x: 0, y: 0, z: -2.5, mode: "cut" },
      { op: "hole", radius: p.hole_diameter / 2, depth: p.flange_width, count: p.holes, spread: p.od - 10 }
    ]
  },
  motor_mount: {
    name: "Motor Mount Plate",
    description: "Rectangular plate with corner holes and center bore",
    defaults: { width: 150, height: 100, depth: 10, hole_diameter: 8, fillet: 3, bore_diameter: 25 },
    commands: (p) => [
      { op: "box", width: p.width, height: p.height, depth: p.depth },
      { op: "hole", radius: p.hole_diameter / 2, depth: p.depth + 2, x: p.width / 2 - 20, y: p.height / 2 - 20, count: 4, spread: 40 },
      { op: "hole", radius: p.bore_diameter / 2, depth: p.depth + 2, x: 0, y: 0 },
      { op: "fillet", radius: p.fillet }
    ]
  },
  bracket: {
    name: "L-Bracket",
    description: "L-shaped bracket with mounting holes",
    defaults: { width: 100, height: 80, depth: 60, arm_width: 20, hole_diameter: 6, fillet: 2 },
    commands: (p) => [
      { op: "box", width: p.width, height: p.arm_width, depth: p.depth },
      { op: "box", width: p.arm_width, height: p.height, depth: p.depth, x: 0, y: p.height / 2, mode: "add" },
      { op: "hole", radius: p.hole_diameter / 2, depth: p.depth + 2, x: p.width / 2, y: p.arm_width / 2, count: 3 },
      { op: "fillet", radius: p.fillet }
    ]
  },
  gear: {
    name: "Spur Gear",
    description: "Cylinder with approximated teeth and bore",
    defaults: { od: 100, bore: 20, teeth: 20, depth: 25, fillet: 1 },
    commands: (p) => [
      { op: "cylinder", radius: p.od / 2, height: p.depth },
      { op: "cylinder", radius: (p.od / 2 - 5), height: p.depth + 2, x: 0, y: 0, z: -1, mode: "cut" },
      { op: "hole", radius: p.bore / 2, depth: p.depth + 2, x: 0, y: 0 },
      { op: "pattern", type: "circular", count: p.teeth, radius: p.od / 2 - 2 }
    ]
  },
  flange: {
    name: "Pipe Flange",
    description: "Circular flange with central bore and bolt circle",
    defaults: { od: 120, id: 50, thickness: 15, bore: 30, bolt_holes: 4, bolt_diameter: 8 },
    commands: (p) => [
      { op: "cylinder", radius: p.od / 2, height: p.thickness },
      { op: "hole", radius: p.bore / 2, depth: p.thickness + 2, x: 0, y: 0 },
      { op: "hole", radius: p.bolt_diameter / 2, depth: p.thickness + 2, count: p.bolt_holes, spread: p.od - 20 },
      { op: "chamfer", radius: 1.5 }
    ]
  },
  shaft_collar: {
    name: "Shaft Collar",
    description: "Split collar with set screw",
    defaults: { od: 40, id: 25, width: 30, slot_width: 5, set_screw_diameter: 4 },
    commands: (p) => [
      { op: "cylinder", radius: p.od / 2, height: p.width },
      { op: "hole", radius: p.id / 2, depth: p.width + 2, x: 0, y: 0 },
      { op: "box", width: p.slot_width, height: p.od + 5, depth: p.width + 2, x: 0, y: (p.od / 2) + 2.5, mode: "cut" },
      { op: "hole", radius: p.set_screw_diameter / 2, depth: p.od / 2 + 2 }
    ]
  },
  panel: {
    name: "Control Panel",
    description: "Rectangular panel with mounting holes and indicator holes",
    defaults: { width: 200, height: 150, depth: 2, corner_holes: 4, corner_radius: 10, indicator_holes: 6, indicator_diameter: 12 },
    commands: (p) => [
      { op: "box", width: p.width, height: p.height, depth: p.depth },
      { op: "hole", radius: 3, depth: p.depth + 1, count: p.corner_holes, spread: Math.min(p.width, p.height) - 20 },
      { op: "hole", radius: p.indicator_diameter / 2, depth: p.depth + 1, count: p.indicator_holes, spread: p.width - 40 },
      { op: "fillet", radius: p.corner_radius }
    ]
  },
  connector: {
    name: "Cylindrical Connector",
    description: "Connector with threads, grooves, and hex recess",
    defaults: { od: 50, threads: 20, thread_depth: 2, length: 60, hex_width: 10, recess_depth: 8 },
    commands: (p) => [
      { op: "cylinder", radius: p.od / 2, height: p.length },
      { op: "pattern", type: "helical", radius: (p.od / 2 - 2), turns: p.threads, depth: p.thread_depth },
      { op: "box", width: p.hex_width, height: p.hex_width * 0.87, depth: p.recess_depth, x: 0, y: 0, z: 0, mode: "cut" },
      { op: "chamfer", radius: 1 }
    ]
  },
  enclosure: {
    name: "Equipment Enclosure",
    description: "Box enclosure with ventilation holes and mounting feet",
    defaults: { width: 300, depth: 200, height: 150, wall_thickness: 5, vent_holes: 12, foot_height: 20 },
    commands: (p) => [
      { op: "box", width: p.width, height: p.height, depth: p.depth },
      { op: "box", width: p.width - p.wall_thickness * 2, height: p.height - p.wall_thickness * 2, depth: p.depth - p.wall_thickness * 2, x: 0, y: 0, z: p.wall_thickness, mode: "cut" },
      { op: "hole", radius: 5, depth: p.wall_thickness + 2, count: p.vent_holes, spread: p.width - 40 },
      { op: "box", width: 30, height: 20, depth: p.foot_height, x: -p.width / 2 + 20, y: -p.depth / 2 + 20, mode: "add", count: 4 }
    ]
  },
  bearing_block: {
    name: "Pillow Block Bearing",
    description: "Rectangular block with bearing bore and mounting holes",
    defaults: { width: 120, height: 100, depth: 80, bore_diameter: 50, hole_diameter: 10, fillet: 4 },
    commands: (p) => [
      { op: "box", width: p.width, height: p.height, depth: p.depth },
      { op: "cylinder", radius: p.bore_diameter / 2, height: p.depth + 2, x: 0, y: p.height / 4 + 10, mode: "cut" },
      { op: "hole", radius: p.hole_diameter / 2, depth: p.width + 2, count: 4, spread: p.height - 30 },
      { op: "fillet", radius: p.fillet }
    ]
  }
};

const OFFLINE_PATTERNS = [
  {
    pattern: /(\d+)\s*(?:mm\s)?(?:cube|cubic)/i,
    handler: (match) => ({
      commands: [{ op: "box", width: parseFloat(match[1]), height: parseFloat(match[1]), depth: parseFloat(match[1]) }],
      description: `${match[1]}mm cube`
    })
  },
  {
    pattern: /(?:plate|block)\s+(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i,
    handler: (match) => ({
      commands: [{ op: "box", width: parseFloat(match[1]), height: parseFloat(match[2]), depth: parseFloat(match[3]) }],
      description: `${match[1]}×${match[2]}×${match[3]}mm plate`
    })
  },
  {
    pattern: /cylinder\s+(?:radius|r)\s*(\d+)\s+(?:height|h)\s*(\d+)/i,
    handler: (match) => ({
      commands: [{ op: "cylinder", radius: parseFloat(match[1]), height: parseFloat(match[2]) }],
      description: `Cylinder R${match[1]}×H${match[2]}mm`
    })
  },
  {
    pattern: /(?:with\s+)?(\d+)\s+(?:m\d+\s+)?(?:bolt\s+)?holes?/i,
    handler: (match) => ({ addCommand: { op: "hole", radius: 4, depth: 10, count: parseInt(match[1]), spread: 40 } })
  },
  {
    pattern: /(?:with\s+)?(\d+)\s*mm\s+fillets?(?:\s+on\s+all\s+edges)?/i,
    handler: (match) => ({ addCommand: { op: "fillet", radius: parseFloat(match[1]) } })
  },
  {
    pattern: /(?:with\s+)?(\d+)\s*mm\s+chamfers?/i,
    handler: (match) => ({ addCommand: { op: "chamfer", radius: parseFloat(match[1]) } })
  },
  {
    pattern: /bearing\s+housing/i,
    handler: () => ({ template: "bearing_housing" })
  },
  {
    pattern: /motor\s+mount\s+plate/i,
    handler: () => ({ template: "motor_mount" })
  },
  {
    pattern: /l[‐-]?bracket/i,
    handler: () => ({ template: "bracket" })
  },
  {
    pattern: /spur\s+gear/i,
    handler: () => ({ template: "gear" })
  },
  {
    pattern: /pipe\s+flange/i,
    handler: () => ({ template: "flange" })
  },
  {
    pattern: /shaft\s+collar/i,
    handler: () => ({ template: "shaft_collar" })
  },
  {
    pattern: /control\s+panel/i,
    handler: () => ({ template: "panel" })
  },
  {
    pattern: /connector/i,
    handler: () => ({ template: "connector" })
  },
  {
    pattern: /enclosure/i,
    handler: () => ({ template: "enclosure" })
  },
  {
    pattern: /bearing\s+block|pillow\s+block/i,
    handler: () => ({ template: "bearing_block" })
  }
];

const SYSTEM_PROMPT = `You are a CAD command generator. Convert natural language descriptions into a JSON array of OpenCascade.js B-rep operations.

Output ONLY valid JSON array, no markdown, no explanation, no code blocks.

Available operations:
- { "op": "box", "width": num, "height": num, "depth": num, "x": num, "y": num, "z": num, "mode": "add"|"cut" }
- { "op": "cylinder", "radius": num, "height": num, "x": num, "y": num, "z": num, "mode": "add"|"cut" }
- { "op": "sphere", "radius": num, "x": num, "y": num, "z": num, "mode": "add"|"cut" }
- { "op": "cone", "radius": num, "height": num, "x": num, "y": num, "z": num, "mode": "add"|"cut" }
- { "op": "torus", "major_radius": num, "minor_radius": num, "x": num, "y": num, "z": num, "mode": "add"|"cut" }
- { "op": "hole", "radius": num, "depth": num, "x": num, "y": num, "z": num, "count": num, "spread": num }
- { "op": "fillet", "radius": num }
- { "op": "chamfer", "radius": num }
- { "op": "translate", "x": num, "y": num, "z": num }
- { "op": "pattern", "type": "rectangular"|"circular"|"helical", "count": num, "spacing": num, "radius": num }

Rules:
1. Start with primary shape (box, cylinder, etc.)
2. Use mode "cut" for subtractive operations (holes, slots)
3. Use mode "add" for additive operations (flanges, bosses)
4. Add fillets/chamfers at the end
5. Estimate reasonable dimensions if not specified
6. Group similar operations together

Example input: "100x80x20mm plate with 4 M8 bolt holes at corners and 3mm fillets"
Example output: [{"op":"box","width":100,"height":80,"depth":20},{"op":"hole","radius":4,"depth":22,"count":4,"spread":60},{"op":"fillet","radius":3}]`;

/**
 * Parse API key from localStorage
 */
function getGeminiKey() {
  try {
    const keys = localStorage.getItem('explodeview_api_keys');
    if (!keys) return null;
    const parsed = JSON.parse(keys);
    return parsed.gemini || null;
  } catch (e) {
    return null;
  }
}

/**
 * Call Gemini Flash API to generate B-rep commands
 */
async function callGeminiAPI(userText, apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${SYSTEM_PROMPT}\n\nUser: ${userText}`
            }]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
        })
      }
    );

    if (!response.ok) {
      console.warn('[Text-to-BREP] Gemini API error:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return null;

    // Try to parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('[Text-to-BREP] Gemini API call failed:', e.message);
    return null;
  }
}

/**
 * Offline pattern matching parser
 */
function parseOfflinePatterns(text) {
  const commands = [];
  let description = text.substring(0, 50);
  let foundTemplate = null;

  // Check for templates first
  for (const [key, template] of Object.entries(TEMPLATES)) {
    if (new RegExp(template.name, 'i').test(text) ||
        new RegExp(key.replace(/_/g, '\\s+'), 'i').test(text)) {
      foundTemplate = key;
      description = template.name;
      break;
    }
  }

  if (foundTemplate) {
    const template = TEMPLATES[foundTemplate];
    const params = { ...template.defaults };

    // Extract override dimensions from text
    const dimMatch = text.match(/(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i);
    if (dimMatch) {
      params.width = parseFloat(dimMatch[1]);
      params.height = parseFloat(dimMatch[2]);
      params.depth = parseFloat(dimMatch[3]);
    }

    // Extract hole count
    const holeMatch = text.match(/(\d+)\s+(?:m\d+\s+)?(?:bolt\s+)?holes?/i);
    if (holeMatch) params.holes = parseInt(holeMatch[1]);

    // Extract fillet radius
    const filletMatch = text.match(/(\d+)\s*mm\s+fillets?/i);
    if (filletMatch) params.fillet = parseFloat(filletMatch[1]);

    return {
      commands: template.commands(params),
      description,
      template: foundTemplate
    };
  }

  // Try pattern matching
  for (const patternObj of OFFLINE_PATTERNS) {
    const match = text.match(patternObj.pattern);
    if (match) {
      const result = patternObj.handler(match);

      if (result.template) {
        return parseOfflinePatterns(result.template);
      } else if (result.addCommand) {
        commands.push(result.addCommand);
      } else if (result.commands) {
        commands.push(...result.commands);
        description = result.description;
      }
    }
  }

  // If nothing matched, return a simple box as default
  if (commands.length === 0) {
    commands.push({
      op: "box",
      width: 100,
      height: 100,
      depth: 50
    });
    description = "Default box (no pattern matched)";
  }

  return { commands, description };
}

/**
 * Execute B-rep commands to create mesh
 */
async function executeBRepCommands(commands) {
  // Check if brep engine is available
  if (!window.brepEngine) {
    console.warn('[Text-to-BREP] BREPEngine not found, using Three.js fallback');
    return null;
  }

  try {
    let shape = null;
    let baseShape = null;

    for (const cmd of commands) {
      switch (cmd.op) {
        case 'box':
          shape = window.brepEngine.makeBox(cmd.width || 100, cmd.height || 100, cmd.depth || 50);
          if (!baseShape) baseShape = shape;
          break;

        case 'cylinder':
          const cyl = window.brepEngine.makeCylinder(
            cmd.radius || 25,
            cmd.height || 50,
            cmd.x || 0,
            cmd.y || 0,
            cmd.z || 0
          );
          if (cmd.mode === 'cut' && shape) {
            shape = window.brepEngine.booleanCut(shape, cyl);
          } else if (cmd.mode === 'add' && shape) {
            shape = window.brepEngine.booleanUnion(shape, cyl);
          } else {
            shape = cyl;
            if (!baseShape) baseShape = shape;
          }
          break;

        case 'hole':
          if (shape) {
            for (let i = 0; i < (cmd.count || 1); i++) {
              const angle = (i / (cmd.count || 1)) * Math.PI * 2;
              const x = (cmd.x || 0) + Math.cos(angle) * (cmd.spread || 0) / 2;
              const y = (cmd.y || 0) + Math.sin(angle) * (cmd.spread || 0) / 2;
              const hole = window.brepEngine.makeCylinder(
                cmd.radius || 5,
                cmd.depth || 20,
                x,
                y,
                cmd.z || -10
              );
              shape = window.brepEngine.booleanCut(shape, hole);
            }
          }
          break;

        case 'fillet':
          if (shape && window.brepEngine.filletAll) {
            shape = window.brepEngine.filletAll(shape, cmd.radius || 2);
          }
          break;

        case 'chamfer':
          if (shape && window.brepEngine.chamferAll) {
            shape = window.brepEngine.chamferAll(shape, cmd.radius || 1.5);
          }
          break;

        case 'translate':
          if (shape && window.brepEngine.translate) {
            shape = window.brepEngine.translate(shape, cmd.x || 0, cmd.y || 0, cmd.z || 0);
          }
          break;

        case 'pattern':
          // Pattern is more complex, would need brepEngine support
          console.log('[Text-to-BREP] Pattern operation skipped (requires brepEngine support)');
          break;
      }
    }

    return shape || baseShape;
  } catch (e) {
    console.error('[Text-to-BREP] BRep execution error:', e.message);
    return null;
  }
}

/**
 * Create a Three.js mesh from a B-rep shape
 */
function shapeToMesh(shape) {
  if (!shape) return null;

  try {
    // If shape has a toMesh method, use it
    if (typeof shape.toMesh === 'function') {
      return shape.toMesh();
    }

    // Otherwise, create a simple Three.js geometry from the shape
    // This is a placeholder for actual B-rep → mesh conversion
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -50, -50, -50,   50, -50, -50,   50,  50, -50,  -50,  50, -50,
      -50, -50,  50,   50, -50,  50,   50,  50,  50,  -50,  50,  50
    ]);
    const indices = new Uint16Array([
      0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1,
      2,6,7, 2,7,3, 0,3,7, 0,7,4, 1,5,6, 1,6,2
    ]);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({ color: 0x2563eb, shininess: 100 });
    return new THREE.Mesh(geometry, material);
  } catch (e) {
    console.error('[Text-to-BREP] Shape to mesh conversion failed:', e.message);
    return null;
  }
}

/**
 * Main function: Convert text to B-rep commands and mesh
 */
export async function textToBRep(text) {
  if (!text || text.trim().length === 0) {
    return { commands: [], mesh: null, wireframe: null, description: "Empty input" };
  }

  console.log('[Text-to-BREP] Input:', text);

  let commands = null;
  let description = "";
  let source = "offline";

  // Try Gemini API first
  const apiKey = getGeminiKey();
  if (apiKey) {
    console.log('[Text-to-BREP] Attempting Gemini API...');
    commands = await callGeminiAPI(text, apiKey);
    if (commands) {
      source = "gemini";
      description = `Generated via Gemini: ${text.substring(0, 50)}`;
    }
  }

  // Fall back to offline parser
  if (!commands) {
    console.log('[Text-to-BREP] Using offline parser');
    const result = parseOfflinePatterns(text);
    commands = result.commands;
    description = result.description;
  }

  console.log('[Text-to-BREP] Commands:', commands);

  // Execute B-rep commands
  const shape = await executeBRepCommands(commands);
  const mesh = shapeToMesh(shape);

  // Create wireframe mesh
  let wireframe = null;
  if (mesh) {
    const wireframeGeometry = new THREE.WireframeGeometry(mesh.geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({ color: 0x0ea5e9, linewidth: 1 });
    wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
  }

  return {
    commands,
    mesh,
    wireframe,
    description,
    source
  };
}

/**
 * Helper: Get all available templates
 */
export function getAvailableTemplates() {
  return Object.entries(TEMPLATES).map(([key, template]) => ({
    id: key,
    name: template.name,
    description: template.description,
    defaults: template.defaults
  }));
}

/**
 * Helper: Create mesh from template
 */
export async function templateToBRep(templateId, overrides = {}) {
  const template = TEMPLATES[templateId];
  if (!template) {
    console.error('[Text-to-BREP] Template not found:', templateId);
    return null;
  }

  const params = { ...template.defaults, ...overrides };
  const commands = template.commands(params);

  console.log('[Text-to-BREP] Template:', templateId, commands);

  const shape = await executeBRepCommands(commands);
  const mesh = shapeToMesh(shape);

  return {
    commands,
    mesh,
    description: template.name,
    template: templateId
  };
}

/**
 * Register on window
 */
if (typeof window !== 'undefined') {
  window.textToBRep = textToBRep;
  window.textToBRepTemplates = getAvailableTemplates;
  window.templateToBRep = templateToBRep;
}

export default { textToBRep, getAvailableTemplates, templateToBRep, TEMPLATES, OFFLINE_PATTERNS };
