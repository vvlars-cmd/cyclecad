/**
 * ai-chat.js - Smart CAD Assistant with LLM + Local Fallback
 * cycleCAD: Browser-based parametric 3D modeler
 *
 * Features:
 * - Conversational AI that understands follow-ups ("make it bigger", "add a hole")
 * - Scene-aware: knows what parts exist and their dimensions
 * - Multi-step: "box 100x50x30 with a 20mm hole and 5mm fillet"
 * - Gemini 2.0 Flash (free tier) + Groq Llama + smart local fallback
 * - Command history with ArrowUp/Down (last 20, persisted)
 */

// ============================================================================
// CONFIGURATION & DICTIONARIES
// ============================================================================

const PART_TYPE_SYNONYMS = {
  cube: ['cube', 'box', 'block', 'square block', 'rectangular block', 'cuboid'],
  cylinder: ['cylinder', 'rod', 'post', 'pin', 'shaft', 'tube', 'pipe', 'bar', 'piston', 'axle'],
  sphere: ['sphere', 'ball', 'round', 'globe', 'orb'],
  cone: ['cone', 'conical', 'funnel', 'tapered'],
  plate: ['plate', 'flat plate', 'mounting plate', 'base plate', 'flat base', 'slab', 'panel'],
  washer: ['washer', 'flat washer'],
  spacer: ['spacer', 'shim', 'ring spacer', 'standoff', 'bushing'],
  bracket: ['bracket', 'L-bracket', 'angle bracket', 'support bracket', 'corner bracket', 'L bracket', 'angle iron'],
  flange: ['flange', 'flanged bearing', 'flanged housing', 'hub', 'collar'],
  gear: ['gear', 'spur gear', 'pinion', 'toothed wheel', 'cog', 'sprocket'],
  torus: ['torus', 'donut', 'ring', 'o-ring'],
};

const UNIT_FACTORS = { mm: 1, m: 1000, cm: 10, in: 25.4, inch: 25.4, ft: 304.8, foot: 304.8 };

// ============================================================================
// STATE
// ============================================================================

let chatState = {
  messages: [],
  conversationHistory: [], // for LLM context
  messagesEl: null,
  inputEl: null,
  sendBtn: null,
  onCommand: null,
  apiKeys: { gemini: null, groq: null },
  isLoading: false,
  commandHistory: [],
  historyIndex: -1,
  tempInput: '',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initChat(messagesEl, inputEl, sendBtn, onCommand) {
  chatState.messagesEl = messagesEl;
  chatState.inputEl = inputEl;
  chatState.sendBtn = sendBtn;
  chatState.onCommand = onCommand;

  // Load stored API keys
  const stored = localStorage.getItem('cyclecad_api_keys');
  if (stored) {
    try { chatState.apiKeys = JSON.parse(stored); } catch (e) {}
  }

  // Send button
  if (sendBtn) sendBtn.addEventListener('click', () => handleSendMessage());

  // Command history (last 20 commands, persisted)
  chatState.commandHistory = JSON.parse(localStorage.getItem('cyclecad_chat_history') || '[]').slice(-20);
  chatState.historyIndex = -1;
  chatState.tempInput = '';

  // Wire up input field Enter + ArrowUp/Down history
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const hist = chatState.commandHistory;
        if (hist.length === 0) return;
        if (chatState.historyIndex === -1) {
          chatState.tempInput = inputEl.value;
          chatState.historyIndex = hist.length - 1;
        } else if (chatState.historyIndex > 0) {
          chatState.historyIndex--;
        }
        inputEl.value = hist[chatState.historyIndex] || '';
        setTimeout(() => inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const hist = chatState.commandHistory;
        if (chatState.historyIndex === -1) return;
        if (chatState.historyIndex < hist.length - 1) {
          chatState.historyIndex++;
          inputEl.value = hist[chatState.historyIndex] || '';
        } else {
          chatState.historyIndex = -1;
          inputEl.value = chatState.tempInput || '';
        }
        setTimeout(() => inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length), 0);
      }
    });
  }

  addMessage('ai', 'Hi! I\'m your CAD assistant. I can create parts, answer questions, and help you design.\n\nTry: "cylinder 50mm diameter 80 tall", "bracket 80x40x5", or ask "what can you make?"');
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

async function handleSendMessage() {
  const text = chatState.inputEl?.value.trim();
  if (!text) return;

  // Save to command history
  chatState.commandHistory.push(text);
  if (chatState.commandHistory.length > 20) chatState.commandHistory.shift();
  chatState.historyIndex = -1;
  chatState.tempInput = '';
  try { localStorage.setItem('cyclecad_chat_history', JSON.stringify(chatState.commandHistory)); } catch(e) {}

  if (chatState.inputEl) chatState.inputEl.value = '';
  addMessage('user', text);

  chatState.isLoading = true;
  if (chatState.sendBtn) chatState.sendBtn.disabled = true;

  try {
    const result = await processMessage(text);

    if (result.reply) {
      addMessage('ai', result.reply);
    }

    if (result.commands && result.commands.length > 0 && chatState.onCommand) {
      result.commands.forEach(cmd => chatState.onCommand(cmd));
    }
  } catch (error) {
    console.error('Chat error:', error);
    addMessage('ai', 'Something went wrong. Try again or rephrase your request.');
  } finally {
    chatState.isLoading = false;
    if (chatState.sendBtn) chatState.sendBtn.disabled = false;
  }
}

export function addMessage(role, text) {
  chatState.messages.push({ role, text });

  // Keep conversation history for LLM context (last 10 turns)
  chatState.conversationHistory.push({ role: role === 'ai' ? 'model' : 'user', text });
  if (chatState.conversationHistory.length > 20) chatState.conversationHistory.splice(0, 2);

  if (!chatState.messagesEl) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message chat-message-${role}`;
  // Support basic formatting
  msgDiv.innerHTML = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  chatState.messagesEl.appendChild(msgDiv);
  chatState.messagesEl.scrollTop = chatState.messagesEl.scrollHeight;
}

// ============================================================================
// SMART MESSAGE PROCESSING
// ============================================================================

async function processMessage(text) {
  const lower = text.toLowerCase().trim();

  // 1. Check for questions / conversational messages first
  const conversationalReply = handleConversational(lower, text);
  if (conversationalReply) return { reply: conversationalReply, commands: [] };

  // 2. Try LLM if API key available
  if (chatState.apiKeys.gemini || chatState.apiKeys.groq) {
    try {
      const llmResult = await querySmartLLM(text);
      if (llmResult) return llmResult;
    } catch (e) {
      console.warn('LLM failed, using local parser:', e.message);
    }
  }

  // 3. Smart local parsing
  const commands = localParseCADPrompt(lower);
  if (commands.length > 0) {
    const desc = commands.map(c => generateDescription(c)).join(', then ');
    return { reply: `Creating: ${desc}`, commands };
  }

  // 4. Nothing matched — give helpful response
  return {
    reply: `I didn't understand "${text}". Here's what I can do:\n\n**Create parts:** "box 100x50x30", "cylinder r25 h60", "sphere 40mm", "bracket 80x40x5", "gear 60mm 20 teeth", "flange OD80 ID30 h15"\n\n**Operations:** "fillet 5mm", "chamfer 3mm"\n\n**Questions:** "what shapes can you make?", "help"`,
    commands: []
  };
}

// ============================================================================
// CONVERSATIONAL HANDLER (no LLM needed)
// ============================================================================

function handleConversational(lower, original) {
  // Greetings
  if (/^(hi|hello|hey|sup|yo|good morning|good evening|what's up)[\s!.?]*$/i.test(lower)) {
    return 'Hey! Ready to design something. What would you like to create?';
  }

  // Help / what can you do
  if (/what can you (do|make|create|build)|help me|help$|what.*shapes|what.*types|capabilities/i.test(lower)) {
    return `I can create these **3D shapes**:\n\n**Primitives:** box, cylinder, sphere, cone, torus\n**Mechanical:** bracket, plate, flange, washer, spacer, gear\n\n**Examples:**\n• "box 100x60x20"\n• "cylinder 30mm radius 80mm tall"\n• "bracket 80x40x5"\n• "gear 60mm diameter 24 teeth"\n• "flange OD100 ID40 h20"\n• "M10 washer"\n\n**Operations:** fillet, chamfer, extrude, revolve\n**Units:** mm (default), cm, in, ft\n\nJust describe what you want!`;
  }

  // Thanks
  if (/^(thanks|thank you|thx|cheers|nice|cool|great|awesome|perfect)[\s!.]*$/i.test(lower)) {
    return 'You\'re welcome! What\'s next?';
  }

  // Clear / reset
  if (/^(clear|reset|start over|new|clean)[\s!.]*$/i.test(lower)) {
    return 'Ready for a fresh start. What would you like to create?';
  }

  // How to use
  if (/how (do i|to|does)|tutorial|getting started|explain/i.test(lower)) {
    return `**Quick start:**\n1. Type a shape: "cylinder 40mm diameter 100 tall"\n2. I\'ll create it in the 3D viewport\n3. Use the toolbar to sketch, extrude, fillet, etc.\n\n**Tips:**\n• Use "x" for dimensions: "100x50x20 box"\n• Specify units: "2 inch cylinder"\n• Combine: "plate 200x100x5 with 4 corner holes"\n\nPress **?** for the full help panel.`;
  }

  // What did you make / last part
  if (/what did you (make|create|build)|last (part|shape|thing)|what.*scene/i.test(lower)) {
    const scene = getSceneContext();
    if (scene.length === 0) return 'The scene is empty. Try creating something: "box 50mm"';
    return `**Parts in scene (${scene.length}):**\n${scene.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
  }

  // API key setting
  if (/set.*key|api.*key|gemini.*key|groq.*key/i.test(lower)) {
    const geminiMatch = original.match(/gemini[:\s]+([A-Za-z0-9_-]{20,})/i);
    const groqMatch = original.match(/groq[:\s]+([A-Za-z0-9_-]{20,})/i);
    if (geminiMatch || groqMatch) {
      setAPIKeys(geminiMatch?.[1] || chatState.apiKeys.gemini, groqMatch?.[1] || chatState.apiKeys.groq);
      return 'API key saved! I\'ll use AI for smarter responses now.';
    }
    return `To enable AI mode, set your API key:\n\n**Gemini (free):** "set gemini key AIza..."\n**Groq (free):** "set groq key gsk_..."\n\nGet a free Gemini key at: aistudio.google.com/apikey`;
  }

  return null; // not conversational
}

// ============================================================================
// SCENE CONTEXT
// ============================================================================

function getSceneContext() {
  const parts = [];
  try {
    // Access app features from global scope
    const features = window.APP?.features || [];
    features.forEach(f => {
      const p = f.params || {};
      let desc = f.name || f.type || 'Part';
      if (p.width && p.height) desc += ` (${p.width}×${p.height}${p.depth ? '×' + p.depth : ''}mm)`;
      else if (p.radius) desc += ` (r${p.radius}mm${p.height ? ' h' + p.height + 'mm' : ''})`;
      parts.push(desc);
    });
  } catch (e) {}
  return parts;
}

// ============================================================================
// SMART LLM INTEGRATION
// ============================================================================

const CAD_SYSTEM_PROMPT = `You are a CAD assistant for cycleCAD, a browser-based 3D modeler. You help users create 3D parts and answer CAD questions.

RESPONSE FORMAT: Always respond with valid JSON:
{
  "reply": "Your conversational response to the user",
  "commands": [array of CAD command objects, or empty array if just chatting]
}

AVAILABLE CAD COMMANDS (commands array):
- {"type":"box","width":N,"height":N,"depth":N}
- {"type":"cylinder","radius":N,"height":N}
- {"type":"sphere","radius":N}
- {"type":"cone","radius":N,"height":N}
- {"type":"torus","radius":N,"tube":N}
- {"type":"bracket","width":N,"height":N,"thickness":N} — L-shaped bracket
- {"type":"plate","width":N,"height":N,"thickness":N}
- {"type":"flange","outerDiameter":N,"innerDiameter":N,"height":N}
- {"type":"washer","outerDiameter":N,"innerDiameter":N,"thickness":N}
- {"type":"spacer","outerDiameter":N,"innerDiameter":N,"height":N}
- {"type":"gear","diameter":N,"teeth":N,"thickness":N}
- {"type":"fillet","radius":N}
- {"type":"chamfer","distance":N}

RULES:
1. All dimensions in mm. Convert from other units if specified.
2. For "diameter X", use radius = X/2 for cylinders/spheres.
3. For multi-step requests like "box with a hole", create multiple commands.
4. For questions/chat, set commands to [] and put your answer in reply.
5. Be concise but friendly in replies.
6. If a request is vague, make reasonable assumptions and state them.
7. "cube Nmm" means box with all sides N.
8. Reply must be SHORT (1-2 sentences max for creation commands).

EXAMPLES:
User: "50mm cube" → {"reply":"Here's a 50mm cube.","commands":[{"type":"box","width":50,"height":50,"depth":50}]}
User: "cylinder 2 inch diameter 4 inch tall" → {"reply":"Creating a 2\" × 4\" cylinder (50.8 × 101.6mm).","commands":[{"type":"cylinder","radius":25.4,"height":101.6}]}
User: "what's a fillet?" → {"reply":"A fillet is a rounded edge on a part. It reduces stress concentration and improves aesthetics. Try: \\"fillet 5mm\\" to apply one.","commands":[]}
User: "bracket 80x40x5 with 3mm fillet" → {"reply":"L-bracket with filleted edges coming up.","commands":[{"type":"bracket","width":80,"height":40,"thickness":5},{"type":"fillet","radius":3}]}
User: "make it bigger" → (use conversation context to understand which part and scale up)`;

async function querySmartLLM(userText) {
  // Build conversation context
  const recentHistory = chatState.conversationHistory.slice(-10);
  const sceneCtx = getSceneContext();

  let contextNote = '';
  if (sceneCtx.length > 0) {
    contextNote = `\n[Scene has ${sceneCtx.length} parts: ${sceneCtx.slice(-3).join(', ')}]`;
  }

  try {
    if (chatState.apiKeys.gemini) {
      return await queryGeminiSmart(userText, recentHistory, contextNote);
    }
    if (chatState.apiKeys.groq) {
      return await queryGroqSmart(userText, recentHistory, contextNote);
    }
  } catch (e) {
    console.warn('Smart LLM query failed:', e);
    throw e;
  }
}

async function queryGeminiSmart(userText, history, contextNote) {
  // Build Gemini conversation format
  const contents = [];
  for (const msg of history.slice(0, -1)) { // exclude last (current user msg already in text)
    contents.push({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    });
  }
  contents.push({ role: 'user', parts: [{ text: userText + contextNote }] });

  // Use gemini-2.0-flash (free tier, fast)
  const model = 'gemini-2.0-flash';
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${chatState.apiKeys.gemini}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: CAD_SYSTEM_PROMPT }] },
      contents,
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      }
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Gemini error: ${err}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseLLMResponse(text);
}

async function queryGroqSmart(userText, history, contextNote) {
  const messages = [{ role: 'system', content: CAD_SYSTEM_PROMPT }];
  for (const msg of history.slice(0, -1)) {
    messages.push({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.text
    });
  }
  messages.push({ role: 'user', content: userText + contextNote });

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chatState.apiKeys.groq}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) throw new Error(`Groq error: ${response.statusText}`);

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return parseLLMResponse(text);
}

function parseLLMResponse(text) {
  try {
    // Clean up common LLM JSON issues
    let clean = text.trim();
    if (clean.startsWith('```json')) clean = clean.slice(7);
    if (clean.startsWith('```')) clean = clean.slice(3);
    if (clean.endsWith('```')) clean = clean.slice(0, -3);
    clean = clean.trim();

    const parsed = JSON.parse(clean);

    // Validate structure
    if (parsed.reply && Array.isArray(parsed.commands)) {
      return { reply: parsed.reply, commands: parsed.commands };
    }

    // Maybe it returned just an array (old format)
    if (Array.isArray(parsed)) {
      const desc = parsed.map(c => generateDescription(c)).join(', ');
      return { reply: `Creating: ${desc}`, commands: parsed };
    }
  } catch (e) {
    console.warn('Failed to parse LLM response:', text, e);
  }
  return null;
}

// ============================================================================
// SMART LOCAL PARSING (fallback when no LLM)
// ============================================================================

function localParseCADPrompt(text) {
  const commands = [];

  // Split on "and" / "with" / "then" for multi-step
  const parts = text.split(/\s+(?:and|with|then|plus|\+)\s+/);

  for (const part of parts) {
    const partType = detectPartType(part);
    const numbers = parseNumbers(part);
    const dims = parseDimensions(part);

    let cmd = null;
    switch (partType) {
      case 'cube':
      case 'box': cmd = parseBoxCommand(part, numbers, dims); break;
      case 'cylinder': cmd = parseCylinderCommand(part, numbers); break;
      case 'sphere': cmd = parseSphereCommand(part, numbers); break;
      case 'cone': cmd = parseConeCommand(part, numbers); break;
      case 'torus': cmd = parseTorusCommand(part, numbers); break;
      case 'plate': cmd = parsePlateCommand(part, numbers, dims); break;
      case 'bracket': cmd = parseBracketCommand(part, numbers, dims); break;
      case 'flange': cmd = parseFlangeCommand(part, numbers); break;
      case 'washer': cmd = parseWasherCommand(part, numbers); break;
      case 'spacer': cmd = parseSpacerCommand(part, numbers); break;
      case 'gear': cmd = parseGearCommand(part, numbers); break;
    }

    if (cmd) {
      commands.push(cmd);
    } else {
      // Try as operation
      parseOperations(part, numbers, commands);
    }
  }

  return commands;
}

// ============================================================================
// PRIMITIVE PARSERS (improved)
// ============================================================================

function parseBoxCommand(text, numbers, dims) {
  let width, height, depth;
  if (dims.length === 3) [width, height, depth] = dims;
  else if (dims.length === 2) { width = dims[0]; height = dims[1]; depth = Math.min(dims[0], dims[1]); }
  else if (dims.length === 1) width = height = depth = dims[0];
  else if (numbers.length >= 3) { width = numbers[0]; height = numbers[1]; depth = numbers[2]; }
  else if (numbers.length === 1) width = height = depth = numbers[0];
  else return null;
  return { type: 'box', width: r(width), height: r(height), depth: r(depth) };
}

function parseCylinderCommand(text, numbers) {
  let radius, height;
  // Handle "diameter X" → radius = X/2
  const diaMatch = text.match(/(?:diameter|dia)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
  if (diaMatch) radius = parseFloat(diaMatch[1]) / 2;
  const rMatch = text.match(/(?:radius|rad)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
  if (rMatch) radius = parseFloat(rMatch[1]);
  // Handle standalone "r25" or "r 25"
  if (!radius) { const rm = text.match(/\br\s*(\d+(?:\.\d+)?)/i); if (rm) radius = parseFloat(rm[1]); }

  const hMatch = text.match(/(?:height|tall|long|h)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
  if (hMatch) height = parseFloat(hMatch[1]);

  if (!radius && !height && numbers.length >= 2) { radius = numbers[0]; height = numbers[1]; }
  else if (!radius && numbers.length >= 1) { radius = numbers[0]; height = radius * 2; }
  if (!height && radius) height = radius * 2;
  if (!radius || !height) return null;
  return { type: 'cylinder', radius: r(radius), height: r(height) };
}

function parseSphereCommand(text, numbers) {
  let radius;
  const diaMatch = text.match(/(?:diameter|dia)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
  if (diaMatch) radius = parseFloat(diaMatch[1]) / 2;
  else if (numbers.length >= 1) radius = numbers[0];
  if (!radius) return null;
  return { type: 'sphere', radius: r(radius) };
}

function parseConeCommand(text, numbers) {
  let radius, height;
  if (numbers.length >= 2) { radius = numbers[0]; height = numbers[1]; }
  else if (numbers.length === 1) { radius = numbers[0]; height = radius * 1.5; }
  if (!radius) return null;
  return { type: 'cone', radius: r(radius), height: r(height) };
}

function parseTorusCommand(text, numbers) {
  let radius, tube;
  if (numbers.length >= 2) { radius = numbers[0]; tube = numbers[1]; }
  else if (numbers.length === 1) { radius = numbers[0]; tube = radius * 0.3; }
  if (!radius) return null;
  return { type: 'torus', radius: r(radius), tube: r(tube) };
}

function parsePlateCommand(text, numbers, dims) {
  let width, depth, thickness;
  if (dims.length >= 3) { width = dims[0]; depth = dims[1]; thickness = dims[2]; }
  else if (dims.length === 2) { width = dims[0]; depth = dims[1]; thickness = 5; }
  else if (numbers.length >= 2) { width = numbers[0]; depth = numbers[1]; thickness = numbers[2] || 5; }
  if (!width || !depth) return null;
  return { type: 'plate', width: r(width), height: r(depth), thickness: r(thickness) };
}

function parseBracketCommand(text, numbers, dims) {
  let width, height, thickness;
  if (dims.length >= 3) { width = dims[0]; height = dims[1]; thickness = dims[2]; }
  else if (dims.length === 2) { width = dims[0]; height = dims[1]; thickness = 5; }
  else if (numbers.length >= 2) { width = numbers[0]; height = numbers[1]; thickness = numbers[2] || 5; }
  if (!width || !height) return null;
  return { type: 'bracket', width: r(width), height: r(height), thickness: r(thickness) };
}

function parseFlangeCommand(text, numbers) {
  let od, id, height;
  const odMatch = text.match(/(?:od|outer\s*(?:diameter)?)\s*(\d+(?:\.\d+)?)/i);
  if (odMatch) od = parseFloat(odMatch[1]);
  const idMatch = text.match(/(?:id|inner\s*(?:diameter)?)\s*(\d+(?:\.\d+)?)/i);
  if (idMatch) id = parseFloat(idMatch[1]);
  const hMatch = text.match(/(?:h|height|thick)\s*(\d+(?:\.\d+)?)/i);
  if (hMatch) height = parseFloat(hMatch[1]);
  if (!od && numbers.length >= 1) od = numbers[0];
  if (!id && numbers.length >= 2) id = numbers[1];
  if (!height && numbers.length >= 3) height = numbers[2];
  if (!od) return null;
  return { type: 'flange', outerDiameter: r(od), innerDiameter: r(id || od * 0.4), height: r(height || 10) };
}

function parseWasherCommand(text, numbers) {
  let od, id, thickness;
  const mMatch = text.match(/m(\d+)/i);
  if (mMatch) { const s = parseInt(mMatch[1]); od = s * 2.5; id = s + 0.5; thickness = 2; }
  else if (numbers.length >= 2) { od = numbers[0]; id = numbers[1]; thickness = numbers[2] || 2; }
  if (!od || !id) return null;
  return { type: 'washer', outerDiameter: r(od), innerDiameter: r(id), thickness: r(thickness) };
}

function parseSpacerCommand(text, numbers) {
  let od, id, height;
  if (numbers.length >= 3) { od = numbers[0]; id = numbers[1]; height = numbers[2]; }
  else if (numbers.length >= 2) { od = numbers[0]; id = numbers[1]; height = 10; }
  if (!od || !id) return null;
  return { type: 'spacer', outerDiameter: r(od), innerDiameter: r(id), height: r(height) };
}

function parseGearCommand(text, numbers) {
  let diameter, teeth, thickness;
  const diaMatch = text.match(/(?:diameter|dia)\s*(\d+(?:\.\d+)?)/i);
  if (diaMatch) diameter = parseFloat(diaMatch[1]);
  const teethMatch = text.match(/(\d+)\s*(?:teeth|tooth)/i);
  if (teethMatch) teeth = parseInt(teethMatch[1]);
  if (!diameter && numbers.length >= 1) diameter = numbers[0];
  if (!teeth && numbers.length >= 2) teeth = numbers[1];
  if (!diameter || !teeth) return null;
  thickness = numbers.length >= 3 ? numbers[2] : 10;
  return { type: 'gear', diameter: r(diameter), teeth, thickness: r(thickness) };
}

// ============================================================================
// OPERATION PARSERS
// ============================================================================

function parseOperations(text, numbers, commands) {
  if (/fillet|round\s*edge|rounded/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*fillet|fillet\s*(\d+(?:\.\d+)?)/i);
    commands.push({ type: 'fillet', radius: r(m ? parseFloat(m[1] || m[2]) : (numbers[0] || 3)) });
  }
  if (/chamfer|bevel/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*chamfer|chamfer\s*(\d+(?:\.\d+)?)/i);
    commands.push({ type: 'chamfer', distance: r(m ? parseFloat(m[1] || m[2]) : (numbers[0] || 2)) });
  }
  if (/extrude|extend|pull|raise/i.test(text)) {
    const m = text.match(/(?:extrude|pull|raise)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:mm)?\s*extrude/i);
    commands.push({ type: 'extrude', height: r(m ? parseFloat(m[1] || m[2]) : (numbers[0] || 10)) });
  }
  if (/revolve|rotate|spin/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*deg/i);
    commands.push({ type: 'revolve', angle: m ? parseFloat(m[1]) : 360 });
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function r(n) { return Math.round((n || 0) * 10) / 10; }

export function parseNumbers(text) {
  const numbers = [];
  const regex = /(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|ft|foot)?/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const val = parseFloat(match[1]);
    const unit = (match[2] || 'mm').toLowerCase();
    numbers.push(val * (UNIT_FACTORS[unit] || 1));
  }
  return numbers;
}

export function parseDimensions(text) {
  const xMatch = text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?))?/i);
  if (xMatch) {
    const d = [parseFloat(xMatch[1]), parseFloat(xMatch[2])];
    if (xMatch[3]) d.push(parseFloat(xMatch[3]));
    return d;
  }
  const byMatch = text.match(/(\d+(?:\.\d+)?)\s+by\s+(\d+(?:\.\d+?))\s*(?:by\s+(\d+(?:\.\d+)?))?/i);
  if (byMatch) {
    const d = [parseFloat(byMatch[1]), parseFloat(byMatch[2])];
    if (byMatch[3]) d.push(parseFloat(byMatch[3]));
    return d;
  }
  return [];
}

export function detectPartType(text) {
  text = text.toLowerCase();
  for (const [type, synonyms] of Object.entries(PART_TYPE_SYNONYMS)) {
    for (const syn of synonyms) {
      if (text.includes(syn)) return type;
    }
  }
  // Check for dimension-only input like "100x50x20" → default to box
  if (/\d+\s*x\s*\d+/.test(text)) return 'box';
  return null;
}

export function generateDescription(command) {
  switch (command.type) {
    case 'box': return `${command.width}×${command.height}×${command.depth}mm box`;
    case 'cylinder': return `cylinder r${command.radius} h${command.height}mm`;
    case 'sphere': return `sphere r${command.radius}mm`;
    case 'cone': return `cone r${command.radius} h${command.height}mm`;
    case 'torus': return `torus r${command.radius} tube${command.tube}mm`;
    case 'bracket': return `${command.width}×${command.height}×${command.thickness}mm L-bracket`;
    case 'plate': return `${command.width}×${command.height}×${command.thickness}mm plate`;
    case 'flange': return `flange OD${command.outerDiameter} ID${command.innerDiameter} h${command.height}mm`;
    case 'washer': return `washer OD${command.outerDiameter} ID${command.innerDiameter}mm`;
    case 'spacer': return `spacer OD${command.outerDiameter} ID${command.innerDiameter} h${command.height}mm`;
    case 'gear': return `${command.teeth}T gear d${command.diameter}mm`;
    case 'fillet': return `${command.radius}mm fillet`;
    case 'chamfer': return `${command.distance}mm chamfer`;
    case 'extrude': return `extrude ${command.height}mm`;
    case 'revolve': return `revolve ${command.angle}°`;
    default: return JSON.stringify(command);
  }
}

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

export function setAPIKeys(geminiKey, groqKey) {
  chatState.apiKeys.gemini = geminiKey || null;
  chatState.apiKeys.groq = groqKey || null;
  localStorage.setItem('cyclecad_api_keys', JSON.stringify(chatState.apiKeys));
}

export function getAPIKeys() {
  return { ...chatState.apiKeys };
}

// ============================================================================
// LEGACY EXPORTS (backward compat)
// ============================================================================

export async function parseCADPrompt(text) {
  const lower = text.toLowerCase().trim();
  if (chatState.apiKeys.gemini || chatState.apiKeys.groq) {
    try {
      const result = await querySmartLLM(text);
      if (result?.commands?.length > 0) return result.commands;
    } catch (e) {
      console.warn('LLM fallback to local:', e.message);
    }
  }
  return localParseCADPrompt(lower);
}

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
