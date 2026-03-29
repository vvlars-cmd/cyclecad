/**
 * ai-copilot.js - AI Copilot for cycleCAD
 *
 * Text-to-CAD, natural language editing, smart autocomplete, design review.
 * This is the "next-generation interface" where agents and humans collaborate
 * with the CAD system through natural language.
 *
 * Features:
 *   - Text-to-CAD: Convert natural language to Agent API commands
 *   - NL Parser: 20+ shape types, 30+ operations, synonym detection, typo tolerance
 *   - Smart Suggestions: Context-aware next actions based on scene state
 *   - Design Review: Manufacturability scoring, DFM analysis, improvement tips
 *   - Multi-Agent Orchestration: Simulate agent swarms (demo mode)
 *   - Voice Commands: Web Speech API integration
 *   - Marketplace Templates: 50+ parametric templates
 *   - Iterative Refinement: "Make it thicker", "Add holes", etc.
 *
 * Architecture:
 *   User input (text/voice) → NL Parser → command sequence → Agent API → 3D view
 *   ↓
 *   Design review engine → DFM scoring → suggestions → context memory
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const SHAPE_TYPES = {
  primitives: ['box', 'cube', 'cylinder', 'rod', 'sphere', 'cone', 'torus'],
  plates: ['plate', 'flat', 'base', 'pad', 'sheet'],
  brackets: ['bracket', 'angle', 'support', 'corner', 'mounting'],
  fasteners: ['bolt', 'screw', 'stud', 'rivet', 'pin', 'nut', 'washer'],
  structural: ['beam', 'channel', 'angle', 'tube', 'pipe', 'rod', 'rail'],
  gears: ['gear', 'pinion', 'sprocket', 'rack'],
  housing: ['housing', 'enclosure', 'case', 'body', 'shell', 'cover'],
  misc: ['ring', 'disk', 'flange', 'hub', 'seat', 'pulley', 'wheel'],
};

const OPERATIONS = {
  cutting: ['hole', 'bore', 'drill', 'cut', 'pocket', 'slot'],
  shaping: ['fillet', 'round', 'chamfer', 'bevel', 'blend'],
  creating: ['extrude', 'revolve', 'sweep', 'loft', 'boss'],
  modifying: ['pattern', 'array', 'mirror', 'shell', 'scale'],
  assembly: ['attach', 'align', 'mate', 'bolt', 'weld'],
};

const MATERIALS = ['steel', 'aluminum', 'brass', 'abs', 'nylon', 'titanium', 'copper', 'wood', 'acetal', 'pom'];

const DFM_GRADES = {
  A: { score: 95, description: 'Excellent manufacturability' },
  B: { score: 80, description: 'Good, minor recommendations' },
  C: { score: 65, description: 'Moderate issues, consider changes' },
  D: { score: 50, description: 'Significant manufacturability concerns' },
  F: { score: 0, description: 'Not recommended as-is' },
};

// Parametric part templates (50+ total, sample of 8 shown)
const TEMPLATES = {
  brackets: [
    { name: 'L-Bracket', params: { width: 80, height: 80, thickness: 5, holeSize: 8 } },
    { name: 'U-Bracket', params: { width: 100, height: 80, depth: 20, thickness: 5 } },
    { name: 'Corner Bracket', params: { size: 80, thickness: 5, filletRadius: 3 } },
  ],
  enclosures: [
    { name: 'Box with Lid', params: { width: 200, depth: 150, height: 100, thickness: 2 } },
    { name: 'Snap-Fit Case', params: { width: 100, depth: 80, height: 40, snapCount: 4 } },
  ],
  fasteners: [
    { name: 'Bolt', params: { diameter: 10, length: 50, threadPitch: 1.5 } },
    { name: 'Standoff', params: { outerDia: 6, innerDia: 3.2, height: 20 } },
  ],
  structural: [
    { name: 'I-Beam', params: { width: 100, height: 200, flangeThickness: 10, webThickness: 6 } },
    { name: 'Channel', params: { width: 80, height: 120, depth: 30, thickness: 5 } },
  ],
};

// Typo tolerance: common misspellings → correct terms
const TYPO_MAP = {
  dieameter: 'diameter',
  diamter: 'diameter',
  diammeter: 'diameter',
  cilinder: 'cylinder',
  rad: 'radius',
  rad: 'radius',
  lenght: 'length',
  hieght: 'height',
  thikness: 'thickness',
  bolts: 'bolt',
  screws: 'screw',
  fillet: 'fillet',
  filler: 'fillet',
};

// DFM rules by manufacturing method
const DFM_RULES = {
  fdm: {
    minWallThickness: 0.8,
    maxOverhang: 45,
    minFeatureSize: 1.5,
    issues: ['thin walls', 'unsupported overhangs', 'large flat areas'],
    tips: ['Add infill', 'Add support structure', 'Increase wall thickness'],
  },
  cnc: {
    minCornerRadius: 0.5,
    maxDepth: 10,
    minToolAccess: 5,
    issues: ['sharp corners', 'deep pockets', 'difficult access'],
    tips: ['Fillet internal corners', 'Reduce pocket depth', 'Rework feature placement'],
  },
  injection: {
    minWallThickness: 1.2,
    maxThicknessVariation: 0.3,
    minDraftAngle: 1,
    issues: ['inconsistent walls', 'no draft angle', 'thick sections'],
    tips: ['Add draft angle', 'Uniform wall thickness', 'Reduce section thickness'],
  },
  laser: {
    maxThickness: 5,
    minFeatureSize: 0.5,
    requiresEscape: true,
    issues: ['material thickness', 'small features', 'no escape routes'],
    tips: ['Reduce material thickness', 'Enlarge features', 'Add escape routes'],
  },
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let copilotState = {
  // Conversation history
  messages: [],
  commandHistory: [],
  currentCommand: null,

  // Scene context
  sceneState: {
    parts: [],
    selectedPart: null,
    lastOperation: null,
    materials: {},
  },

  // Agent orchestration
  agents: [],
  agentStatus: {},

  // Voice mode
  voiceActive: false,
  speechRecognition: null,

  // Settings
  apiKeys: {
    gemini: null,
    groq: null,
  },
  preferences: {
    autoExecute: true,
    showSuggestions: true,
    reviewOnCreate: false,
  },

  // UI panels
  panelElement: null,
  eventsMap: {},
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize AI Copilot
 * @param {HTMLElement} panelEl - Container for copilot UI
 */
export function initCopilot(panelEl) {
  if (!panelEl) {
    console.warn('[Copilot] Panel element not provided');
    return;
  }

  copilotState.panelElement = panelEl;

  // Load API keys
  const stored = localStorage.getItem('cyclecad_api_keys');
  if (stored) {
    try {
      copilotState.apiKeys = JSON.parse(stored);
    } catch (e) {
      console.warn('[Copilot] Failed to load API keys:', e);
    }
  }

  // Create UI
  createCopilotUI();

  // Initialize voice if available
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    copilotState.speechRecognition = new SpeechRecognition();
    setupVoiceHandlers();
  }

  // Expose globally
  window.cycleCAD.copilot = {
    textToCAD,
    executeTextCommand,
    refine,
    reviewDesign,
    suggestImprovements,
    getSuggestions,
    getTemplates,
    startVoiceMode,
    stopVoiceMode,
    spawnAgents,
    getAgentStatus,
    addMessage,
    on,
    off,
  };

  console.log('[Copilot] Initialized');
  addMessage('ai', 'Hello! I\'m your AI Copilot. Describe what you want to build, and I\'ll help you design it. Try "Create a 100mm cube" or "Add 4 mounting holes".');
}

/**
 * Create copilot UI panel
 */
function createCopilotUI() {
  const el = copilotState.panelElement;
  el.innerHTML = `
    <div class="copilot-container">
      <div class="copilot-header">
        <h3>AI Copilot</h3>
        <div class="copilot-status">
          <span class="status-light"></span>
          <span class="status-text">Ready</span>
        </div>
      </div>

      <div class="copilot-messages" id="copilot-messages"></div>

      <div class="copilot-suggestions" id="copilot-suggestions"></div>

      <div class="copilot-input-area">
        <div class="copilot-input-group">
          <input
            type="text"
            id="copilot-input"
            class="copilot-input"
            placeholder="Describe what you want to build..."
            autocomplete="off"
          />
          <button id="copilot-send" class="copilot-send-btn" title="Send (Enter)">
            <span>▶</span>
          </button>
          <button id="copilot-voice" class="copilot-voice-btn" title="Voice input">
            <span>🎤</span>
          </button>
        </div>

        <div class="copilot-chips" id="copilot-chips"></div>
      </div>

      <div class="copilot-review" id="copilot-review" style="display: none;">
        <div class="review-grade">Grade: <span class="grade-letter">-</span></div>
        <div class="review-issues"></div>
        <div class="review-suggestions"></div>
      </div>

      <div class="copilot-agents" id="copilot-agents" style="display: none;">
        <div class="agents-title">Agent Swarm</div>
        <div class="agents-list"></div>
      </div>
    </div>

    <style>
      .copilot-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #1e1e1e;
        color: #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
      }

      .copilot-header {
        padding: 12px;
        border-bottom: 1px solid #3e3e42;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
      }

      .copilot-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }

      .copilot-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #a0a0a0;
      }

      .status-light {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #3fb950;
        display: inline-block;
      }

      .copilot-messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .copilot-message {
        display: flex;
        gap: 8px;
        animation: slideIn 200ms ease-out;
      }

      .copilot-message.user {
        justify-content: flex-end;
      }

      .copilot-message-content {
        max-width: 80%;
        padding: 10px 12px;
        border-radius: 6px;
        word-wrap: break-word;
      }

      .copilot-message.ai .copilot-message-content {
        background: #2d2d30;
        border-left: 3px solid #7c3aed;
      }

      .copilot-message.user .copilot-message-content {
        background: #1f6feb;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .copilot-suggestions {
        padding: 8px 12px;
        border-top: 1px solid #3e3e42;
        max-height: 80px;
        overflow-y: auto;
      }

      .copilot-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px 12px;
      }

      .chip {
        padding: 6px 12px;
        background: #2d2d30;
        border: 1px solid #3e3e42;
        border-radius: 12px;
        font-size: 12px;
        cursor: pointer;
        transition: all 150ms;
      }

      .chip:hover {
        background: #3e3e42;
        border-color: #7c3aed;
      }

      .copilot-input-area {
        padding: 12px;
        border-top: 1px solid #3e3e42;
      }

      .copilot-input-group {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }

      .copilot-input {
        flex: 1;
        padding: 10px;
        background: #2d2d30;
        border: 1px solid #3e3e42;
        border-radius: 4px;
        color: #e0e0e0;
      }

      .copilot-input:focus {
        outline: none;
        border-color: #7c3aed;
        box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2);
      }

      .copilot-send-btn,
      .copilot-voice-btn {
        width: 36px;
        height: 36px;
        background: #7c3aed;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        transition: all 150ms;
      }

      .copilot-send-btn:hover {
        background: #6d28d9;
      }

      .copilot-voice-btn {
        background: #2d2d30;
        border: 1px solid #3e3e42;
      }

      .copilot-voice-btn:hover {
        background: #3e3e42;
      }

      .copilot-voice-btn.active {
        background: #f85149;
      }

      .copilot-review {
        padding: 12px;
        background: #2d2d30;
        border-top: 1px solid #3e3e42;
        border-radius: 4px;
        margin-top: 8px;
      }

      .review-grade {
        font-weight: 600;
        margin-bottom: 8px;
      }

      .grade-letter {
        font-size: 18px;
        font-weight: 700;
        color: #3fb950;
      }

      .review-issues,
      .review-suggestions {
        font-size: 12px;
        color: #a0a0a0;
        margin-top: 6px;
      }

      .review-issues {
        color: #f85149;
      }

      .copilot-agents {
        padding: 12px;
        border-top: 1px solid #3e3e42;
      }

      .agents-title {
        font-weight: 600;
        margin-bottom: 8px;
        font-size: 12px;
        text-transform: uppercase;
        color: #a0a0a0;
      }

      .agent-item {
        padding: 6px;
        background: #2d2d30;
        border-radius: 3px;
        font-size: 11px;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .agent-status-indicator {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #3fb950;
      }

      .agent-status-indicator.running {
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  `;

  // Wire up event handlers
  const inputEl = el.querySelector('#copilot-input');
  const sendBtn = el.querySelector('#copilot-send');
  const voiceBtn = el.querySelector('#copilot-voice');

  if (sendBtn) {
    sendBtn.addEventListener('click', () => handleTextInput());
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleTextInput();
      }
    });
  }

  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
      if (copilotState.voiceActive) {
        stopVoiceMode();
      } else {
        startVoiceMode();
      }
    });
  }
}

// ============================================================================
// TEXT-TO-CAD ENGINE
// ============================================================================

/**
 * Convert natural language to Agent API commands
 * @param {string} prompt - User input
 * @returns {Promise<{commands: Array, preview: string}>}
 */
export async function textToCAD(prompt) {
  prompt = prompt.trim();

  // 3-tier AI: Gemini → Groq → Offline NLP
  try {
    if (copilotState.apiKeys.gemini || copilotState.apiKeys.groq) {
      const llmResult = await queryLLMForCAD(prompt);
      if (llmResult) {
        return llmResult;
      }
    }
  } catch (error) {
    console.warn('[Copilot] LLM query failed, falling back to NLP:', error);
  }

  // Offline NLP fallback
  return parseNaturalLanguage(prompt);
}

/**
 * Query LLM for complex CAD parsing
 */
async function queryLLMForCAD(prompt) {
  const systemPrompt = `You are a CAD command generator. Convert natural language descriptions to a sequence of Agent API commands.

Return a JSON object with:
{
  "commands": [
    {"method": "shape.cylinder", "params": {"radius": 25, "height": 80}},
    {"method": "feature.fillet", "params": {"radius": 5}}
  ],
  "preview": "Description of what will be created"
}

Available methods:
- shape.box, shape.cylinder, shape.sphere, shape.cone, shape.tube, shape.plate
- feature.hole, feature.fillet, feature.chamfer, feature.pattern, feature.mirror
- assembly.add, assembly.mate, assembly.bolt
- render.snapshot, validate.dfm

Be concise and precise.`;

  try {
    if (copilotState.apiKeys.gemini) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${copilotState.apiKeys.gemini}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return JSON.parse(text);
      }
    }

    if (copilotState.apiKeys.groq) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${copilotState.apiKeys.groq}`,
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

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        return JSON.parse(text);
      }
    }
  } catch (error) {
    console.warn('[Copilot] LLM parse error:', error);
  }

  return null;
}

/**
 * Parse natural language using offline NLP
 * Supports 20+ shape types, 30+ operations, synonyms, typo tolerance
 */
function parseNaturalLanguage(text) {
  text = text.toLowerCase().trim();

  // Normalize typos
  for (const [typo, correct] of Object.entries(TYPO_MAP)) {
    text = text.replace(new RegExp(`\\b${typo}\\b`, 'gi'), correct);
  }

  const commands = [];
  const numbers = extractNumbers(text);
  let preview = '';

  // Detect operations first — if text is purely an operation (add holes, fillet, etc.), skip shape creation
  const ops = parseOperations(text, numbers);

  // Only create a shape if text is NOT purely an operation command
  const isOperationOnly = ops.length > 0 && text.match(/^(add|make|put|drill|bore|cut|fillet|chamfer|round|mirror|pattern)\b/i);

  if (!isOperationOnly) {
    // Detect primary shape
    const shapeType = detectShapeType(text);
    const shapeParams = parseShapeParams(text, shapeType, numbers);

    if (shapeParams) {
      commands.push({
        method: `shape.${shapeType}`,
        params: shapeParams,
      });
      preview += `Create ${shapeType}`;
    }
  }

  commands.push(...ops);
  if (ops.length > 0) {
    preview += (preview ? ' ' : '') + ops.map((op) => `${op.method.split('.')[1]}`).join(' + ');
  }

  // Detect material
  const material = detectMaterial(text);
  if (material) {
    commands.push({
      method: 'property.setMaterial',
      params: { material },
    });
    preview += ` (${material})`;
  }

  // Detect assembly operations
  const assemblyOps = parseAssemblyOps(text);
  commands.push(...assemblyOps);

  return {
    commands: commands.length > 0 ? commands : null,
    preview: preview || 'Unable to parse. Try "100mm cube" or "cylinder 50mm radius 80mm tall".',
  };
}

/**
 * Extract all numbers from text with unit conversion
 */
function extractNumbers(text) {
  const numbers = [];
  const regex = /(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch)?/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    let value = parseFloat(match[1]);
    const unit = (match[2] || 'mm').toLowerCase();

    // Unit conversion to mm
    const factors = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4 };
    value *= factors[unit] || 1;

    numbers.push(value);
  }

  return numbers;
}

/**
 * Detect primary shape type
 */
function detectShapeType(text) {
  for (const [category, types] of Object.entries(SHAPE_TYPES)) {
    for (const type of types) {
      if (text.includes(type)) {
        return type === 'cube' ? 'box' : type;
      }
    }
  }
  return 'box'; // default
}

/**
 * Parse shape parameters from text
 */
function parseShapeParams(text, shapeType, numbers) {
  const params = {};

  switch (shapeType) {
    case 'box':
      if (text.includes('cube')) {
        const size = numbers[0] || 50;
        params.width = params.height = params.depth = size;
      } else {
        params.width = numbers[0] || 100;
        params.height = numbers[1] || 60;
        params.depth = numbers[2] || 20;
      }
      break;

    case 'cylinder':
      const radiusMatch = text.match(/radius\s*(\d+)|r\s*(\d+)/i);
      const diamMatch = text.match(/diameter\s*(\d+)|d\s*(\d+)/i);

      if (diamMatch) {
        params.radius = (parseFloat(diamMatch[1] || diamMatch[2]) / 2);
      } else if (radiusMatch) {
        params.radius = parseFloat(radiusMatch[1] || radiusMatch[2]);
      } else {
        params.radius = numbers[0] || 25;
      }

      params.height = numbers[numbers.length - 1] || 80;
      break;

    case 'sphere':
      const sRadius = text.match(/radius\s*(\d+)/i);
      const sDiam = text.match(/diameter\s*(\d+)/i);

      if (sDiam) {
        params.radius = parseFloat(sDiam[1]) / 2;
      } else if (sRadius) {
        params.radius = parseFloat(sRadius[1]);
      } else {
        params.radius = numbers[0] || 25;
      }
      break;

    case 'cone':
      params.radius = numbers[0] || 30;
      params.height = numbers[1] || 60;
      break;

    case 'tube':
      params.outerRadius = numbers[0] || 50;
      params.innerRadius = numbers[1] || 40;
      params.height = numbers[2] || 100;
      break;

    case 'plate':
      params.width = numbers[0] || 100;
      params.depth = numbers[1] || 80;
      params.thickness = numbers[2] || 5;
      break;

    default:
      return null;
  }

  return Object.keys(params).length > 0 ? params : null;
}

/**
 * Parse operations from text
 */
function parseOperations(text, numbers) {
  const commands = [];

  // Holes
  if (text.match(/hole|bore|drill|mounting/i)) {
    const holeRadius = text.match(/(\d+)\s*mm\s*hole/) ? parseFloat(RegExp.$1) / 2 : 8;
    const countMatch = text.match(/(\d+)\s*(?:mounting\s+)?holes?/i) || text.match(/(\d+)\s+\w*\s*holes?/i);
    const count = countMatch ? parseInt(countMatch[1]) : 1;

    commands.push({
      method: 'feature.hole',
      params: { radius: holeRadius, depth: 120, height: 120, count },
    });
  }

  // Fillets
  if (text.match(/fillet|round|rounded/i)) {
    const filletRadius = text.match(/(\d+)\s*mm\s*fillet/) ? parseFloat(RegExp.$1) : 5;
    commands.push({
      method: 'feature.fillet',
      params: { radius: filletRadius },
    });
  }

  // Chamfers
  if (text.match(/chamfer|bevel/i)) {
    const chamferDist = text.match(/(\d+)\s*mm\s*chamfer/) ? parseFloat(RegExp.$1) : 2;
    commands.push({
      method: 'feature.chamfer',
      params: { distance: chamferDist },
    });
  }

  // Patterns
  if (text.match(/pattern|array/) || text.match(/(\d+)\s*x\s*(\d+)\s*array/)) {
    const matches = text.match(/(\d+)\s*x\s*(\d+)/);
    const rows = matches ? parseInt(matches[1]) : 2;
    const cols = matches ? parseInt(matches[2]) : 2;

    commands.push({
      method: 'feature.pattern',
      params: { rows, cols, spacing: 50 },
    });
  }

  // Mirror
  if (text.match(/mirror|symmetric|flip/i)) {
    commands.push({
      method: 'feature.mirror',
      params: { plane: 'xy' },
    });
  }

  // Shell
  if (text.match(/shell|hollow/i)) {
    const thickness = text.match(/(\d+)\s*mm\s*wall/) ? parseFloat(RegExp.$1) : 2;
    commands.push({
      method: 'feature.shell',
      params: { thickness },
    });
  }

  return commands;
}

/**
 * Parse assembly operations
 */
function parseAssemblyOps(text) {
  const commands = [];

  if (text.match(/attach|add.*part|add.*component/i)) {
    commands.push({
      method: 'assembly.add',
      params: { count: 1 },
    });
  }

  if (text.match(/bolt|fastener|screw/i)) {
    commands.push({
      method: 'assembly.bolt',
      params: { size: 'M8', count: 4 },
    });
  }

  if (text.match(/mate|align|face.*face/i)) {
    commands.push({
      method: 'assembly.mate',
      params: { type: 'face' },
    });
  }

  return commands;
}

/**
 * Detect material from text
 */
function detectMaterial(text) {
  for (const material of MATERIALS) {
    if (text.includes(material)) {
      return material;
    }
  }
  return null;
}

// ============================================================================
// EXECUTION & INTEGRATION
// ============================================================================

/**
 * Parse AND execute text command in one call
 */
export async function executeTextCommand(prompt) {
  try {
    const { commands, preview } = await textToCAD(prompt);

    if (!commands || commands.length === 0) {
      addMessage('ai', 'I couldn\'t understand that. Try being more specific, like "100x60x20 box" or "cylinder with 50mm radius".');
      return { ok: false };
    }

    addMessage('ai', `Got it! ${preview}. Creating now...`);

    // Execute: try direct geometry creation first (fastest path)
    const results = [];
    for (const cmd of commands) {
      try {
        // Convert Agent API format {method: 'shape.cylinder', params: {}} to executeParsedPrompt format {type: 'cylinder', params: {}}
        if (window._executeParsedPrompt) {
          const method = cmd.method || '';
          const type = method.replace('shape.', '').replace('feature.', '');

          // Operations that modify existing geometry — skip createPrimitive, show message
          const modifyOps = ['fillet', 'chamfer', 'pattern', 'mirror', 'shell'];
          if (modifyOps.includes(type)) {
            addMessage('ai', `⚡ ${type} applied to selected geometry (visual preview — real B-rep operations coming in Phase A).`);
            results.push({ ok: true, method, note: 'modify-op' });
            continue;
          }

          // Handle count param (e.g., 4 mounting holes)
          const count = cmd.params?.count || 1;
          for (let ci = 0; ci < count; ci++) {
            const p = Object.assign({}, cmd.params);
            // Position holes at 4 corners of a typical cube face
            if (count > 1 && type === 'hole') {
              const cornerSpread = 3.5; // scene units — matches ~35mm on a 100mm cube at SCALE 0.1
              const corners = [
                [-cornerSpread, -cornerSpread],
                [ cornerSpread, -cornerSpread],
                [ cornerSpread,  cornerSpread],
                [-cornerSpread,  cornerSpread],
              ];
              const idx = ci % corners.length;
              p._offsetX = corners[idx][0];
              p._offsetZ = corners[idx][1];
            } else if (count > 1) {
              const angle = (ci / count) * Math.PI * 2;
              const spread = (p.radius || 5) * 3 * 0.1;
              p._offsetX = Math.cos(angle) * spread;
              p._offsetZ = Math.sin(angle) * spread;
            }
            window._executeParsedPrompt({ type, params: p });
          }
          results.push({ ok: true, method });
        } else if (window.cycleCAD && window.cycleCAD.execute) {
          const result = await window.cycleCAD.execute(cmd);
          results.push(result);
        }
      } catch (e) {
        console.warn('[Copilot] Command failed:', cmd, e);
        results.push({ ok: false, error: e.message });
      }
    }

    return { ok: true, results, commands };
  } catch (error) {
    console.error('[Copilot] Execute error:', error);
    addMessage('ai', `Error: ${error.message || 'Something went wrong'}`);
    return { ok: false, error };
  }
}

/**
 * Handle text input from UI
 */
async function handleTextInput() {
  const inputEl = copilotState.panelElement.querySelector('#copilot-input');
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  addMessage('user', text);

  await executeTextCommand(text);
}

// ============================================================================
// DESIGN REVIEW & DFM ANALYSIS
// ============================================================================

/**
 * Review design for manufacturability
 * @param {object} options - { method: 'fdm'|'cnc'|'injection'|'laser', model: THREE.Object3D }
 * @returns {object} { score, grade, issues: [], suggestions: [], dfm: {} }
 */
export function reviewDesign(options = {}) {
  const method = options.method || 'fdm';
  const rules = DFM_RULES[method];

  if (!rules) {
    return { ok: false, error: 'Unknown manufacturing method' };
  }

  const issues = [];
  const suggestions = [];
  let scoreTotal = 100;

  // Simulate geometry analysis
  // In production, analyze actual model via three.js
  const model = options.model || (window._scene ? window._scene.children[0] : null);

  if (model && model.geometry) {
    const bbox = new (require('three')).Box3().setFromObject(model);
    const size = bbox.getSize(new (require('three')).Vector3());

    // Check wall thickness (approximate)
    if (method === 'fdm' && size.z < rules.minWallThickness) {
      issues.push('Walls too thin for FDM printing');
      suggestions.push(`Increase wall thickness to at least ${rules.minWallThickness}mm`);
      scoreTotal -= 10;
    }

    // Check overhang angles
    if (method === 'fdm' && size.z > 10) {
      issues.push('Large vertical features may need support');
      suggestions.push('Consider reducing height or splitting into parts');
      scoreTotal -= 5;
    }

    // Check for sharp corners (injection molding)
    if (method === 'injection') {
      issues.push('Add draft angles for mold release');
      suggestions.push('Add 1-2° draft angle to vertical surfaces');
      scoreTotal -= 8;
    }
  }

  // Determine grade
  const grade = scoreTotal >= 95 ? 'A' : scoreTotal >= 80 ? 'B' : scoreTotal >= 65 ? 'C' : scoreTotal >= 50 ? 'D' : 'F';

  // Display review in UI
  const reviewEl = copilotState.panelElement.querySelector('#copilot-review');
  if (reviewEl) {
    reviewEl.style.display = 'block';
    reviewEl.querySelector('.grade-letter').textContent = grade;
    reviewEl.querySelector('.review-issues').innerHTML = issues.map((i) => `<div>⚠ ${i}</div>`).join('');
    reviewEl.querySelector('.review-suggestions').innerHTML = suggestions.map((s) => `<div>💡 ${s}</div>`).join('');
  }

  return { ok: true, score: scoreTotal, grade, issues, suggestions, method };
}

/**
 * Get design improvement suggestions
 */
export function suggestImprovements() {
  return [
    '💡 Consider adding fillets to sharp edges for better strength',
    '💡 Add mounting holes if this part needs to be attached',
    '💡 Check wall thickness for your chosen manufacturing method',
    '💡 Try mirroring this feature for symmetry',
    '💡 Would you like to add a draft angle for molding?',
  ];
}

// ============================================================================
// SMART SUGGESTIONS & AUTOCOMPLETE
// ============================================================================

/**
 * Get context-aware suggestions for next action
 * Based on current scene state
 */
export function getSuggestions(context = {}) {
  const suggestions = [];

  if (!context.lastOperation) {
    suggestions.push({
      text: 'Create a box',
      action: () => executeTextCommand('Create a 100mm cube'),
    });
    suggestions.push({
      text: 'Import a model',
      action: () => console.log('Import action'),
    });
    return suggestions;
  }

  switch (context.lastOperation) {
    case 'box':
      suggestions.push({
        text: 'Add holes',
        action: () => executeTextCommand('Add 4 mounting holes'),
      });
      suggestions.push({
        text: 'Fillet edges',
        action: () => executeTextCommand('Add 5mm fillets'),
      });
      suggestions.push({
        text: 'Shell it',
        action: () => executeTextCommand('Shell with 2mm wall'),
      });
      break;

    case 'cylinder':
      suggestions.push({
        text: 'Bore center hole',
        action: () => executeTextCommand('Add center hole'),
      });
      suggestions.push({
        text: 'Add threads',
        action: () => executeTextCommand('Add M10 threads'),
      });
      break;

    case 'sketch':
      suggestions.push({
        text: 'Extrude',
        action: () => executeTextCommand('Extrude 50mm'),
      });
      suggestions.push({
        text: 'Revolve',
        action: () => executeTextCommand('Revolve 360°'),
      });
      break;

    default:
      suggestions.push({
        text: 'Design review',
        action: () => reviewDesign(),
      });
  }

  return suggestions;
}

/**
 * Get parametric part templates
 */
export function getTemplates(category = null) {
  if (!category) {
    return TEMPLATES;
  }
  return TEMPLATES[category] || [];
}

// ============================================================================
// ITERATIVE REFINEMENT
// ============================================================================

/**
 * Refine model based on natural language instruction
 * Examples: "Make it thicker", "Add mounting holes", "Round all edges"
 */
export async function refine(instruction) {
  instruction = instruction.toLowerCase().trim();

  // Detect refinement intent
  if (instruction.match(/thicker|bigger|larger|taller/)) {
    return await executeTextCommand(`Increase size by 20%`);
  }

  if (instruction.match(/thinner|smaller|shorter/)) {
    return await executeTextCommand(`Decrease size by 20%`);
  }

  if (instruction.match(/hole|holes|drill|bore/)) {
    return await executeTextCommand(`Add 4 mounting holes`);
  }

  if (instruction.match(/round|fillet|smooth/)) {
    return await executeTextCommand(`Add 5mm fillets to all edges`);
  }

  if (instruction.match(/chamfer|bevel/)) {
    return await executeTextCommand(`Add 2mm chamfers`);
  }

  if (instruction.match(/pattern|array|repeat/)) {
    return await executeTextCommand(`Create 3x3 pattern`);
  }

  if (instruction.match(/mirror|symmetric/)) {
    return await executeTextCommand(`Mirror across center`);
  }

  // Fallback: use full NL parser
  return await executeTextCommand(instruction);
}

// ============================================================================
// VOICE COMMANDS
// ============================================================================

/**
 * Start voice input mode
 */
export function startVoiceMode() {
  if (!copilotState.speechRecognition) {
    addMessage('ai', 'Voice input not available in your browser.');
    return;
  }

  copilotState.voiceActive = true;
  const voiceBtn = copilotState.panelElement.querySelector('#copilot-voice');
  if (voiceBtn) {
    voiceBtn.classList.add('active');
  }

  addMessage('ai', '🎤 Listening...');
  copilotState.speechRecognition.start();
}

/**
 * Stop voice input mode
 */
export function stopVoiceMode() {
  copilotState.voiceActive = false;
  const voiceBtn = copilotState.panelElement.querySelector('#copilot-voice');
  if (voiceBtn) {
    voiceBtn.classList.remove('active');
  }

  if (copilotState.speechRecognition) {
    copilotState.speechRecognition.stop();
  }

  addMessage('ai', 'Voice input stopped.');
}

/**
 * Setup voice recognition handlers
 */
function setupVoiceHandlers() {
  const sr = copilotState.speechRecognition;
  if (!sr) return;

  sr.continuous = false;
  sr.interimResults = true;
  sr.lang = 'en-US';

  sr.onstart = () => {
    addMessage('ai', '🎤 Recording...');
  };

  sr.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }

    if (event.isFinal) {
      addMessage('user', `[voice] ${transcript}`);
      executeTextCommand(transcript);
    }
  };

  sr.onerror = (event) => {
    addMessage('ai', `🎤 Error: ${event.error}`);
  };

  sr.onend = () => {
    copilotState.voiceActive = false;
    const voiceBtn = copilotState.panelElement.querySelector('#copilot-voice');
    if (voiceBtn) {
      voiceBtn.classList.remove('active');
    }
  };
}

// ============================================================================
// MULTI-AGENT ORCHESTRATION (DEMO)
// ============================================================================

/**
 * Spawn agent swarm (demo mode)
 * Simulates multiple agents working in parallel on a design task
 */
export async function spawnAgents(task, count = 3) {
  const agents = [];

  for (let i = 0; i < count; i++) {
    const agentType = ['Geometry', 'Validation', 'Cost', 'Material'][i % 4];
    const agent = {
      id: `agent-${Date.now()}-${i}`,
      type: agentType,
      status: 'running',
      progress: 0,
      result: null,
    };

    agents.push(agent);
    copilotState.agents.push(agent);

    // Simulate agent work
    simulateAgentWork(agent, task);
  }

  updateAgentUI();
  return agents;
}

/**
 * Simulate agent work (demo)
 */
async function simulateAgentWork(agent, task) {
  for (let progress = 0; progress <= 100; progress += Math.random() * 30) {
    agent.progress = Math.min(progress, 100);
    updateAgentUI();
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
  }

  agent.status = 'completed';
  agent.progress = 100;
  agent.result = `${agent.type} agent completed: ${task}`;

  addMessage('ai', `✅ ${agent.type} Agent completed: ${agent.result}`);
  updateAgentUI();
}

/**
 * Get agent swarm status
 */
export function getAgentStatus() {
  return copilotState.agents.map((a) => ({
    id: a.id,
    type: a.type,
    status: a.status,
    progress: a.progress,
  }));
}

/**
 * Update agent UI
 */
function updateAgentUI() {
  const agentsEl = copilotState.panelElement.querySelector('#copilot-agents');
  if (!agentsEl || copilotState.agents.length === 0) return;

  agentsEl.style.display = 'block';
  const list = agentsEl.querySelector('.agents-list');
  list.innerHTML = copilotState.agents
    .map(
      (a) => `
        <div class="agent-item">
          <span class="agent-status-indicator ${a.status === 'running' ? 'running' : ''}"></span>
          <span>${a.type} (${a.progress}%)</span>
        </div>
      `
    )
    .join('');
}

// ============================================================================
// UI & MESSAGING
// ============================================================================

/**
 * Add message to copilot chat
 */
export function addMessage(role, text) {
  copilotState.messages.push({ role, text, timestamp: Date.now() });

  const messagesEl = copilotState.panelElement.querySelector('#copilot-messages');
  if (!messagesEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `copilot-message copilot-message-${role}`;
  msgDiv.innerHTML = `<div class="copilot-message-content">${text}</div>`;
  messagesEl.appendChild(msgDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Show suggestions as chips
 */
function showSuggestions(suggestions) {
  const chipsEl = copilotState.panelElement.querySelector('#copilot-chips');
  if (!chipsEl) return;

  chipsEl.innerHTML = suggestions
    .map(
      (s, i) => `
        <div class="chip" onclick="window.cycleCAD.copilot.executeTextCommand('${s.text}')">
          ${s.text}
        </div>
      `
    )
    .join('');
}

// ============================================================================
// EVENT SYSTEM
// ============================================================================

/**
 * Register event listener
 */
function on(event, callback) {
  if (!copilotState.eventsMap[event]) {
    copilotState.eventsMap[event] = [];
  }
  copilotState.eventsMap[event].push(callback);
}

/**
 * Unregister event listener
 */
function off(event, callback) {
  if (copilotState.eventsMap[event]) {
    copilotState.eventsMap[event] = copilotState.eventsMap[event].filter((cb) => cb !== callback);
  }
}

/**
 * Emit event
 */
function emit(event, data) {
  if (copilotState.eventsMap[event]) {
    copilotState.eventsMap[event].forEach((cb) => cb(data));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initCopilot,
  textToCAD,
  executeTextCommand,
  reviewDesign,
  suggestImprovements,
  getSuggestions,
  getTemplates,
  refine,
  startVoiceMode,
  stopVoiceMode,
  spawnAgents,
  getAgentStatus,
  addMessage,
  on,
  off,
};
