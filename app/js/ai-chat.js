/**
 * ai-chat.js - Natural Language to CAD Command Parser
 * cycleCAD: Browser-based parametric 3D modeler
 *
 * Parses natural language descriptions into structured CAD commands.
 * Supports primitives, mechanical parts, operations, and optional LLM enhancement.
 */

// ============================================================================
// CONFIGURATION & DICTIONARIES
// ============================================================================

const PART_TYPE_SYNONYMS = {
  // Primitives
  cube: ['cube', 'box', 'block', 'square block', 'rectangular block'],
  box: ['box', 'rectangular box', 'cuboid'],
  cylinder: ['cylinder', 'rod', 'post', 'pin', 'shaft', 'tube'],
  sphere: ['sphere', 'ball', 'round', 'globe'],
  cone: ['cone', 'conical'],

  // Plates & Flats
  plate: ['plate', 'flat plate', 'mounting plate', 'base plate', 'flat base'],
  washer: ['washer', 'flat washer', 'ring'],
  spacer: ['spacer', 'shim', 'ring spacer'],

  // Mechanical Parts
  bracket: ['bracket', 'L-bracket', 'angle bracket', 'support bracket', 'corner bracket'],
  flange: ['flange', 'flanged bearing', 'flanged housing', 'hub'],
  bearing: ['bearing', 'ball bearing', 'roller bearing'],
  gear: ['gear', 'spur gear', 'pinion', 'toothed wheel'],
  pulley: ['pulley', 'wheel', 'sheave'],
  fastener: ['bolt', 'screw', 'stud', 'pin', 'rivet'],
  housing: ['housing', 'enclosure', 'case', 'body'],
};

const DIMENSION_KEYWORDS = {
  radius: ['radius', 'r', 'rad'],
  diameter: ['diameter', 'd', 'dia', 'od', 'outer diameter', 'id', 'inner diameter'],
  height: ['height', 'h', 'tall', 'thickness'],
  width: ['width', 'w', 'wide'],
  depth: ['depth', 'dp'],
  length: ['length', 'l', 'long'],
  thickness: ['thickness', 'thick', 't'],
  count: ['count', 'number of', 'qty', 'quantity'],
  teeth: ['teeth', 'tooth', 'tooth count'],
  angle: ['angle', 'degrees', 'deg'],
};

const OPERATION_KEYWORDS = {
  fillet: ['fillet', 'round', 'rounded edge'],
  chamfer: ['chamfer', 'beveled edge', 'bevel'],
  hole: ['hole', 'bore', 'drill', 'perforation'],
  cut: ['cut', 'remove', 'subtract', 'pocket'],
  extrude: ['extrude', 'extend', 'raise', 'pull'],
  revolve: ['revolve', 'rotate', 'sweep', 'spin'],
  pattern: ['pattern', 'array', 'repeat', 'duplicate'],
  mirror: ['mirror', 'flip', 'symmetric'],
};

const UNIT_FACTORS = {
  mm: 1,
  m: 1000,
  cm: 10,
  in: 25.4,
  inch: 25.4,
  ft: 304.8,
  foot: 304.8,
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let chatState = {
  messages: [],
  messagesEl: null,
  inputEl: null,
  sendBtn: null,
  onCommand: null,
  apiKeys: {
    gemini: null,
    groq: null,
  },
  isLoading: false,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize chat UI and wire up event handlers
 * @param {HTMLElement} messagesEl - Container for chat messages
 * @param {HTMLElement} inputEl - Input field for user messages
 * @param {HTMLElement} sendBtn - Send button
 * @param {Function} onCommand - Callback for parsed CAD commands
 */
export function initChat(messagesEl, inputEl, sendBtn, onCommand) {
  chatState.messagesEl = messagesEl;
  chatState.inputEl = inputEl;
  chatState.sendBtn = sendBtn;
  chatState.onCommand = onCommand;

  // Load stored API keys
  const stored = localStorage.getItem('cyclecad_api_keys');
  if (stored) {
    try {
      chatState.apiKeys = JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to load stored API keys:', e);
    }
  }

  // Wire up send button
  if (sendBtn) {
    sendBtn.addEventListener('click', () => handleSendMessage());
  }

  // Wire up input field Enter key
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }

  addMessage('ai', 'Hello! I\'m your CAD assistant. Describe the part you want to create, and I\'ll generate CAD commands. Try things like: "50mm cube", "cylinder 30mm radius 60mm tall", or "bracket 80x40x5".');
}

/**
 * Handle sending a user message
 */
async function handleSendMessage() {
  const text = chatState.inputEl?.value.trim();
  if (!text) return;

  // Clear input and add user message
  if (chatState.inputEl) {
    chatState.inputEl.value = '';
  }
  addMessage('user', text);

  // Show loading state
  chatState.isLoading = true;
  if (chatState.sendBtn) {
    chatState.sendBtn.disabled = true;
  }

  try {
    // Parse CAD commands
    const commands = await parseCADPrompt(text);

    if (commands && commands.length > 0) {
      // Generate AI response
      const response = commands
        .map((cmd) => generateDescription(cmd))
        .join(', ');

      addMessage('ai', `Got it! ${response}`);

      // Call callback for each command
      if (chatState.onCommand) {
        commands.forEach((cmd) => chatState.onCommand(cmd));
      }
    } else {
      addMessage('ai', 'I couldn\'t parse that description. Try being more specific: "100x60x20 box", "cylinder r30 h60", "add a 10mm fillet", etc.');
    }
  } catch (error) {
    console.error('Chat error:', error);
    addMessage('ai', 'Sorry, I encountered an error. Please try again.');
  } finally {
    chatState.isLoading = false;
    if (chatState.sendBtn) {
      chatState.sendBtn.disabled = false;
    }
  }
}

/**
 * Add a message to the chat
 * @param {string} role - 'user' or 'ai'
 * @param {string} text - Message text
 */
export function addMessage(role, text) {
  chatState.messages.push({ role, text });

  if (!chatState.messagesEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message chat-message-${role}`;
  msgDiv.textContent = text;

  chatState.messagesEl.appendChild(msgDiv);
  chatState.messagesEl.scrollTop = chatState.messagesEl.scrollHeight;
}

// ============================================================================
// MAIN PARSING ENGINE
// ============================================================================

/**
 * Parse natural language into CAD commands
 * @param {string} text - Natural language description
 * @returns {Promise<Array>} Array of CAD command objects
 */
export async function parseCADPrompt(text) {
  text = text.toLowerCase().trim();

  // Try LLM first if available
  if (chatState.apiKeys.gemini || chatState.apiKeys.groq) {
    try {
      const llmCommands = await queryLLM(text);
      if (llmCommands && llmCommands.length > 0) {
        return llmCommands;
      }
    } catch (error) {
      console.warn('LLM query failed, falling back to local parser:', error);
    }
  }

  // Fall back to local parsing
  return localParseCADPrompt(text);
}

/**
 * Local parsing fallback (no LLM required)
 */
function localParseCADPrompt(text) {
  const commands = [];

  // Detect primary part type
  const partType = detectPartType(text);
  const numbers = parseNumbers(text);
  const dims = parseDimensions(text);

  // Handle primitives
  if (partType === 'cube' || partType === 'box') {
    const cmd = parseBoxCommand(text, numbers, dims);
    if (cmd) commands.push(cmd);
  } else if (partType === 'cylinder') {
    const cmd = parseCylinderCommand(text, numbers);
    if (cmd) commands.push(cmd);
  } else if (partType === 'sphere') {
    const cmd = parseSphereCommand(text, numbers);
    if (cmd) commands.push(cmd);
  } else if (partType === 'cone') {
    const cmd = parseConeCommand(text, numbers);
    if (cmd) commands.push(cmd);
  }

  // Handle mechanical parts
  if (partType === 'plate') {
    const cmd = parsePlateCommand(text, numbers, dims);
    if (cmd) commands.push(cmd);
  } else if (partType === 'bracket') {
    const cmd = parseBracketCommand(text, numbers, dims);
    if (cmd) commands.push(cmd);
  } else if (partType === 'flange') {
    const cmd = parseFlangeCommand(text, numbers);
    if (cmd) commands.push(cmd);
  } else if (partType === 'washer') {
    const cmd = parseWasherCommand(text, numbers);
    if (cmd) commands.push(cmd);
  } else if (partType === 'spacer') {
    const cmd = parseSpacerCommand(text, numbers);
    if (cmd) commands.push(cmd);
  } else if (partType === 'gear') {
    const cmd = parseGearCommand(text, numbers);
    if (cmd) commands.push(cmd);
  }

  // Handle operations (holes, fillets, etc.)
  parseOperations(text, numbers, commands);

  return commands;
}

// ============================================================================
// PRIMITIVE PARSERS
// ============================================================================

/**
 * Parse box/cube command
 */
function parseBoxCommand(text, numbers, dims) {
  let width, height, depth;

  if (dims.length === 3) {
    [width, height, depth] = dims;
  } else if (dims.length === 1) {
    // Assume cube
    width = height = depth = dims[0];
  } else if (numbers.length >= 3) {
    width = numbers[0];
    height = numbers[1];
    depth = numbers[2];
  } else if (numbers.length === 1) {
    width = height = depth = numbers[0];
  } else {
    return null;
  }

  return {
    type: 'box',
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
    depth: Math.round(depth * 10) / 10,
  };
}

/**
 * Parse cylinder command
 */
function parseCylinderCommand(text, numbers) {
  let radius, height;

  // Try to extract radius and height from keywords
  if (text.match(/radius|r\s*(\d+)|rod/i)) {
    const rMatch = text.match(/radius\s*(\d+(?:\.\d+)?)|r\s*(\d+(?:\.\d+)?)/i);
    if (rMatch) {
      radius = parseFloat(rMatch[1] || rMatch[2]);
    }
  }

  if (text.match(/height|h\s*(\d+)|tall/i)) {
    const hMatch = text.match(/height\s*(\d+(?:\.\d+)?)|h\s*(\d+(?:\.\d+)?)/i);
    if (hMatch) {
      height = parseFloat(hMatch[1] || hMatch[2]);
    }
  }

  // Fall back to first two numbers
  if (!radius && !height && numbers.length >= 2) {
    radius = numbers[0];
    height = numbers[1];
  } else if (!radius && numbers.length >= 1) {
    radius = numbers[0];
    height = radius;
  }

  if (!radius || !height) {
    return null;
  }

  return {
    type: 'cylinder',
    radius: Math.round(radius * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
}

/**
 * Parse sphere command
 */
function parseSphereCommand(text, numbers) {
  let radius;

  if (numbers.length >= 1) {
    const val = numbers[0];
    // Check if it's diameter or radius
    if (text.match(/diameter|dia|d\s*(\d+)/i)) {
      radius = val / 2;
    } else {
      radius = val;
    }
  }

  if (!radius) {
    return null;
  }

  return {
    type: 'sphere',
    radius: Math.round(radius * 10) / 10,
  };
}

/**
 * Parse cone command
 */
function parseConeCommand(text, numbers) {
  let radius, height;

  if (numbers.length >= 2) {
    radius = numbers[0];
    height = numbers[1];
  } else if (numbers.length === 1) {
    radius = numbers[0];
    height = radius;
  }

  if (!radius || !height) {
    return null;
  }

  return {
    type: 'cone',
    radius: Math.round(radius * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
}

// ============================================================================
// MECHANICAL PART PARSERS
// ============================================================================

/**
 * Parse plate command
 */
function parsePlateCommand(text, numbers, dims) {
  let width, depth, thickness;

  if (dims.length >= 3) {
    width = dims[0];
    depth = dims[1];
    thickness = dims[2];
  } else if (dims.length === 2) {
    width = dims[0];
    depth = dims[1];
    thickness = 5; // default
  } else if (numbers.length >= 3) {
    width = numbers[0];
    depth = numbers[1];
    thickness = numbers[2];
  } else if (numbers.length >= 2) {
    width = numbers[0];
    depth = numbers[1];
    thickness = 5;
  }

  if (!width || !depth) {
    return null;
  }

  const cmd = {
    type: 'box',
    width: Math.round(width * 10) / 10,
    height: Math.round(thickness * 10) / 10,
    depth: Math.round(depth * 10) / 10,
  };

  // Parse hole pattern
  const holePattern = parseHolePattern(text);
  if (holePattern) {
    cmd.holes = holePattern;
  }

  return cmd;
}

/**
 * Parse bracket command
 */
function parseBracketCommand(text, numbers, dims) {
  let width, height, thickness;

  if (dims.length >= 3) {
    width = dims[0];
    height = dims[1];
    thickness = dims[2];
  } else if (numbers.length >= 3) {
    width = numbers[0];
    height = numbers[1];
    thickness = numbers[2];
  }

  if (!width || !height) {
    return null;
  }

  return {
    type: 'bracket',
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
    thickness: Math.round((thickness || 5) * 10) / 10,
  };
}

/**
 * Parse flange command
 */
function parseFlangeCommand(text, numbers) {
  let outerDiameter, innerDiameter, height, boltCount;

  // OD first
  const odMatch = text.match(/od\s*(\d+(?:\.\d+)?)|outer\s*diameter\s*(\d+(?:\.\d+)?)/i);
  if (odMatch) {
    outerDiameter = parseFloat(odMatch[1] || odMatch[2]);
  } else if (numbers.length >= 1) {
    outerDiameter = numbers[0];
  }

  // ID
  const idMatch = text.match(/id\s*(\d+(?:\.\d+)?)|inner\s*diameter\s*(\d+(?:\.\d+)?)/i);
  if (idMatch) {
    innerDiameter = parseFloat(idMatch[1] || idMatch[2]);
  } else if (numbers.length >= 2) {
    innerDiameter = numbers[1];
  }

  // Height
  const hMatch = text.match(/height\s*(\d+(?:\.\d+)?)|h\s*(\d+(?:\.\d+)?)|tall\s*(\d+(?:\.\d+)?)/i);
  if (hMatch) {
    height = parseFloat(hMatch[1] || hMatch[2] || hMatch[3]);
  } else if (numbers.length >= 3) {
    height = numbers[2];
  }

  // Bolt count
  const boltMatch = text.match(/(\d+)\s*bolt/i);
  if (boltMatch) {
    boltCount = parseInt(boltMatch[1]);
  }

  if (!outerDiameter) {
    return null;
  }

  return {
    type: 'flange',
    outerDiameter: Math.round(outerDiameter * 10) / 10,
    innerDiameter: innerDiameter ? Math.round(innerDiameter * 10) / 10 : outerDiameter * 0.5,
    height: height ? Math.round(height * 10) / 10 : 10,
    boltCount: boltCount || 4,
  };
}

/**
 * Parse washer command
 */
function parseWasherCommand(text, numbers) {
  let outerDiameter, innerDiameter, thickness;

  // Try M-size matching (e.g., M10, M8)
  const mMatch = text.match(/m(\d+)/i);
  if (mMatch) {
    const size = parseInt(mMatch[1]);
    // Standard washer dimensions (approximate)
    outerDiameter = size * 2.5;
    innerDiameter = size + 0.5;
    thickness = 2;
  } else if (numbers.length >= 2) {
    outerDiameter = numbers[0];
    innerDiameter = numbers[1];
    thickness = numbers[2] || 2;
  }

  if (!outerDiameter || !innerDiameter) {
    return null;
  }

  return {
    type: 'washer',
    outerDiameter: Math.round(outerDiameter * 10) / 10,
    innerDiameter: Math.round(innerDiameter * 10) / 10,
    thickness: Math.round(thickness * 10) / 10,
  };
}

/**
 * Parse spacer command
 */
function parseSpacerCommand(text, numbers) {
  let outerDiameter, innerDiameter, height;

  const odMatch = text.match(/od\s*(\d+(?:\.\d+)?)|outer\s*(\d+(?:\.\d+)?)/i);
  if (odMatch) {
    outerDiameter = parseFloat(odMatch[1] || odMatch[2]);
  } else if (numbers.length >= 1) {
    outerDiameter = numbers[0];
  }

  const idMatch = text.match(/id\s*(\d+(?:\.\d+)?)|inner\s*(\d+(?:\.\d+)?)/i);
  if (idMatch) {
    innerDiameter = parseFloat(idMatch[1] || idMatch[2]);
  } else if (numbers.length >= 2) {
    innerDiameter = numbers[1];
  }

  const hMatch = text.match(/height\s*(\d+(?:\.\d+)?)|thick\s*(\d+(?:\.\d+)?)/i);
  if (hMatch) {
    height = parseFloat(hMatch[1] || hMatch[2]);
  } else if (numbers.length >= 3) {
    height = numbers[2];
  }

  if (!outerDiameter || !innerDiameter) {
    return null;
  }

  return {
    type: 'spacer',
    outerDiameter: Math.round(outerDiameter * 10) / 10,
    innerDiameter: Math.round(innerDiameter * 10) / 10,
    height: height ? Math.round(height * 10) / 10 : 5,
  };
}

/**
 * Parse gear command
 */
function parseGearCommand(text, numbers) {
  let diameter, toothCount, thickness;

  const diamMatch = text.match(/diameter\s*(\d+(?:\.\d+)?)|dia\s*(\d+(?:\.\d+)?)/i);
  if (diamMatch) {
    diameter = parseFloat(diamMatch[1] || diamMatch[2]);
  } else if (numbers.length >= 1) {
    diameter = numbers[0];
  }

  const toothMatch = text.match(/(\d+)\s*teeth|tooth\s*(\d+)/i);
  if (toothMatch) {
    toothCount = parseInt(toothMatch[1] || toothMatch[2]);
  } else if (numbers.length >= 2) {
    toothCount = numbers[1];
  }

  const thickMatch = text.match(/thick\s*(\d+(?:\.\d+)?)|height\s*(\d+(?:\.\d+)?)/i);
  if (thickMatch) {
    thickness = parseFloat(thickMatch[1] || thickMatch[2]);
  } else if (numbers.length >= 3) {
    thickness = numbers[2];
  }

  if (!diameter || !toothCount) {
    return null;
  }

  return {
    type: 'gear',
    diameter: Math.round(diameter * 10) / 10,
    teeth: toothCount,
    thickness: thickness ? Math.round(thickness * 10) / 10 : 10,
  };
}

// ============================================================================
// OPERATION PARSERS
// ============================================================================

/**
 * Parse operations (holes, fillets, chamfers, etc.)
 */
function parseOperations(text, numbers, commands) {
  // Fillet
  if (text.match(/fillet|round\s*edge|rounded/i)) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*mm\s*fillet|fillet\s*(\d+(?:\.\d+)?)/i);
    const radius = match
      ? parseFloat(match[1] || match[2])
      : (numbers.length > 0 ? numbers[numbers.length - 1] : 2);

    commands.push({
      type: 'fillet',
      radius: Math.round(radius * 10) / 10,
    });
  }

  // Chamfer
  if (text.match(/chamfer|beveled|bevel/i)) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*mm\s*chamfer|chamfer\s*(\d+(?:\.\d+)?)/i);
    const distance = match
      ? parseFloat(match[1] || match[2])
      : (numbers.length > 0 ? numbers[numbers.length - 1] : 1);

    commands.push({
      type: 'chamfer',
      distance: Math.round(distance * 10) / 10,
    });
  }

  // Extrude
  if (text.match(/extrude|extend|pull|raise/i)) {
    const match = text.match(/extrude\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*mm\s*extrude/i);
    const height = match
      ? parseFloat(match[1] || match[2])
      : (numbers.length > 0 ? numbers[numbers.length - 1] : 10);

    commands.push({
      type: 'extrude',
      height: Math.round(height * 10) / 10,
    });
  }

  // Revolve
  if (text.match(/revolve|rotate|sweep|spin/i)) {
    const match = text.match(/(\d+(?:\.\d+)?)\s*degree|revolve\s*(\d+)/i);
    const angle = match
      ? parseFloat(match[1] || match[2])
      : 360;

    commands.push({
      type: 'revolve',
      angle: Math.round(angle * 10) / 10,
    });
  }
}

/**
 * Parse hole patterns (through holes, corner holes, bolt circles)
 */
function parseHolePattern(text) {
  const pattern = {};

  // Through hole
  const throughMatch = text.match(/(\d+(?:\.\d+)?)\s*mm\s*hole\s*through|hole\s*through\s*(?:center)?/i);
  if (throughMatch) {
    const diameter = parseFloat(throughMatch[1]) || 10;
    return {
      type: 'through',
      diameter,
      centerX: 0,
      centerY: 0,
    };
  }

  // Corner holes
  const cornerMatch = text.match(/(\d+)\s*holes?(?:\s+at)?\s*corners?/i);
  if (cornerMatch) {
    const count = parseInt(cornerMatch[1]);
    const diamMatch = text.match(/(\d+(?:\.\d+)?)\s*mm\s*(?:diameter|dia)/i);
    const diameter = diamMatch ? parseFloat(diamMatch[1]) : 8;

    return {
      type: 'corners',
      count,
      diameter,
    };
  }

  // Bolt circle
  const boltMatch = text.match(/(\d+)\s*bolt\s*(?:hole)?s?|bolt\s*circle\s*(\d+)/i);
  if (boltMatch) {
    const count = parseInt(boltMatch[1] || boltMatch[2]);
    const diamMatch = text.match(/(\d+(?:\.\d+)?)\s*mm\s*(?:diameter|dia|bolt)/i);
    const diameter = diamMatch ? parseFloat(diamMatch[1]) : 8;
    const circleMatch = text.match(/circle\s*(\d+(?:\.\d+)?)/i);
    const circleDia = circleMatch ? parseFloat(circleMatch[1]) : 60;

    return {
      type: 'boltcircle',
      count,
      diameter,
      circleDiameter: circleDia,
    };
  }

  return null;
}

// ============================================================================
// UTILITY PARSERS
// ============================================================================

/**
 * Parse all numbers from text with unit conversion
 * @returns {Array<number>} Array of converted numbers (in mm)
 */
export function parseNumbers(text) {
  const numbers = [];
  const numberRegex = /(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|ft|foot)?/gi;
  let match;

  while ((match = numberRegex.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'mm').toLowerCase();
    const factor = UNIT_FACTORS[unit] || 1;
    numbers.push(value * factor);
  }

  return numbers;
}

/**
 * Parse dimension patterns like "100x60x20" or "100 by 60 by 20"
 * @returns {Array<number>} Array of dimensions
 */
export function parseDimensions(text) {
  const dimensions = [];

  // Try X pattern: "100x60x20"
  const xMatch = text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?))?/i);
  if (xMatch) {
    dimensions.push(parseFloat(xMatch[1]));
    dimensions.push(parseFloat(xMatch[2]));
    if (xMatch[3]) {
      dimensions.push(parseFloat(xMatch[3]));
    }
    return dimensions;
  }

  // Try "by" pattern: "100 by 60 by 20"
  const byMatch = text.match(/(\d+(?:\.\d+)?)\s+by\s+(\d+(?:\.\d+)?)\s+(?:by\s+(\d+(?:\.\d+)?))?/i);
  if (byMatch) {
    dimensions.push(parseFloat(byMatch[1]));
    dimensions.push(parseFloat(byMatch[2]));
    if (byMatch[3]) {
      dimensions.push(parseFloat(byMatch[3]));
    }
    return dimensions;
  }

  return dimensions;
}

/**
 * Detect primary part type from text
 * @returns {string} Part type identifier
 */
export function detectPartType(text) {
  text = text.toLowerCase();

  for (const [type, synonyms] of Object.entries(PART_TYPE_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (text.includes(synonym)) {
        return type;
      }
    }
  }

  return 'box'; // default
}

// ============================================================================
// DESCRIPTION GENERATION
// ============================================================================

/**
 * Convert CAD command back to human-readable description
 */
export function generateDescription(command) {
  switch (command.type) {
    case 'box':
      return `${command.width}x${command.height}x${command.depth}mm box`;
    case 'cylinder':
      return `cylinder r${command.radius}mm h${command.height}mm`;
    case 'sphere':
      return `sphere r${command.radius}mm`;
    case 'cone':
      return `cone r${command.radius}mm h${command.height}mm`;
    case 'bracket':
      return `${command.width}x${command.height}x${command.thickness}mm bracket`;
    case 'flange':
      return `flange OD${command.outerDiameter}mm ID${command.innerDiameter}mm h${command.height}mm`;
    case 'washer':
      return `washer OD${command.outerDiameter}mm ID${command.innerDiameter}mm`;
    case 'spacer':
      return `spacer OD${command.outerDiameter}mm ID${command.innerDiameter}mm h${command.height}mm`;
    case 'gear':
      return `${command.teeth}-tooth gear d${command.diameter}mm`;
    case 'fillet':
      return `fillet r${command.radius}mm`;
    case 'chamfer':
      return `chamfer ${command.distance}mm`;
    case 'extrude':
      return `extrude ${command.height}mm`;
    case 'revolve':
      return `revolve ${command.angle}°`;
    case 'cut':
      return `cut ${command.shape} hole`;
    default:
      return JSON.stringify(command);
  }
}

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Set LLM API keys for enhanced parsing
 */
export function setAPIKeys(geminiKey, groqKey) {
  chatState.apiKeys.gemini = geminiKey || null;
  chatState.apiKeys.groq = groqKey || null;

  localStorage.setItem('cyclecad_api_keys', JSON.stringify(chatState.apiKeys));
}

/**
 * Get current API keys
 */
export function getAPIKeys() {
  return { ...chatState.apiKeys };
}

// ============================================================================
// LLM INTEGRATION
// ============================================================================

/**
 * Query LLM for complex CAD parsing
 * Falls back to local parser on failure
 */
async function queryLLM(prompt) {
  const systemPrompt = `You are a CAD command parser. Convert natural language descriptions into JSON CAD commands.

Return a JSON array of command objects. Each command has:
- type: 'box', 'cylinder', 'sphere', 'cone', 'bracket', 'flange', 'gear', 'washer', 'spacer', 'fillet', 'chamfer', 'extrude', 'revolve', 'cut'
- Relevant dimensions (width, height, depth, radius, diameter, teeth, etc.)

Examples:
"50mm cube" → [{"type":"box","width":50,"height":50,"depth":50}]
"cylinder r30 h60" → [{"type":"cylinder","radius":30,"height":60}]
"100x60x20 box with 10mm fillet" → [{"type":"box","width":100,"height":60,"depth":20},{"type":"fillet","radius":10}]

Return ONLY valid JSON, no other text.`;

  try {
    // Try Gemini Flash first
    if (chatState.apiKeys.gemini) {
      return await queryGemini(prompt, systemPrompt);
    }

    // Try Groq Llama
    if (chatState.apiKeys.groq) {
      return await queryGroq(prompt, systemPrompt);
    }
  } catch (error) {
    console.warn('LLM query failed:', error);
    throw error;
  }
}

/**
 * Query Google Gemini Flash API
 */
async function queryGemini(prompt, systemPrompt) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + chatState.apiKeys.gemini, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return JSON.parse(text);
}

/**
 * Query Groq Llama 3.1 API
 */
async function queryGroq(prompt, systemPrompt) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chatState.apiKeys.groq}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return JSON.parse(text);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initChat,
  addMessage,
  parseCADPrompt,
  parseNumbers,
  parseDimensions,
  detectPartType,
  generateDescription,
  setAPIKeys,
  getAPIKeys,
};
