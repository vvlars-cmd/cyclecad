/**
 * ai-chat.js - Smart CAD Assistant with LLM + Local Fallback
 * cycleCAD: Browser-based parametric 3D modeler
 *
 * Features:
 * - Conversational AI that understands follow-ups ("make it bigger", "remove it")
 * - Scene-aware: knows what parts exist and their dimensions
 * - Scene operations: delete, move, rotate, scale, hide, show, undo, redo
 * - Boolean ops: intersect, subtract, union
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

  addMessage('ai', 'Hi! I\'m your CAD assistant. I can create parts, modify them, and answer questions.\n\nTry: "cylinder 50mm diameter 80 tall", "bracket 80x40x5", "remove it", "undo", or "what can you do?"');
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

  // 1. Check for scene action commands (delete, undo, move, etc.)
  const actionResult = handleSceneAction(lower, text);
  if (actionResult) return actionResult;

  // 2. Check for questions / conversational messages
  const conversationalReply = handleConversational(lower, text);
  if (conversationalReply) return { reply: conversationalReply, commands: [] };

  // 3. Try LLM if API key available
  if (chatState.apiKeys.gemini || chatState.apiKeys.groq) {
    try {
      const llmResult = await querySmartLLM(text);
      if (llmResult) return llmResult;
    } catch (e) {
      console.warn('LLM failed, using local parser:', e.message);
    }
  }

  // 4. Smart local parsing for creation commands
  const commands = localParseCADPrompt(lower);
  if (commands.length > 0) {
    const desc = commands.map(c => generateDescription(c)).join(', then ');
    return { reply: `Creating: ${desc}`, commands };
  }

  // 5. Nothing matched — give helpful response
  return {
    reply: `I didn't understand "${text}". Here's what I can do:\n\n**Create:** "box 100x50x30", "cylinder r25 h60", "bracket 80x40x5"\n**Modify:** "remove it", "delete the box", "undo", "redo"\n**Transform:** "move it up 20", "rotate 45", "scale 2x"\n**Operations:** "fillet 5mm", "chamfer 3mm"\n**Booleans:** "subtract box from cylinder", "intersect"\n**Scene:** "hide it", "show all", "select the cylinder", "clear scene"\n**Questions:** "what shapes can you make?", "what's in the scene?"`,
    commands: []
  };
}

// ============================================================================
// SCENE ACTION HANDLER (delete, undo, move, hide, booleans, etc.)
// ============================================================================

function handleSceneAction(lower, original) {
  const features = window.APP?.features || [];
  const selectedIdx = window.APP?.selectedFeatureIndex ?? -1;

  // --- DELETE / REMOVE ---
  if (/^(delete|remove|erase|trash|get rid of|destroy)\b/.test(lower) ||
      /\b(delete|remove|erase)\s+(it|this|that|the last|last|selected|current)\b/.test(lower) ||
      /^(remove|delete) it\s*$/.test(lower)) {

    // Find which part to delete
    const targetIdx = resolveTarget(lower, features, selectedIdx);
    if (targetIdx >= 0 && targetIdx < features.length) {
      const name = features[targetIdx].name || 'Part';
      return {
        reply: `Removed "${name}".`,
        commands: [{ action: 'delete', index: targetIdx }]
      };
    }
    if (features.length > 0) {
      // Default: remove last part
      const last = features[features.length - 1];
      return {
        reply: `Removed "${last.name || 'last part'}".`,
        commands: [{ action: 'delete', index: features.length - 1 }]
      };
    }
    return { reply: 'Nothing to remove — the scene is empty.', commands: [] };
  }

  // --- UNDO ---
  if (/^undo\s*$/.test(lower) || /^(ctrl\+?z|go back|step back)\s*$/.test(lower)) {
    return { reply: 'Undone.', commands: [{ action: 'undo' }] };
  }

  // --- REDO ---
  if (/^redo\s*$/.test(lower) || /^(ctrl\+?y|step forward)\s*$/.test(lower)) {
    return { reply: 'Redone.', commands: [{ action: 'redo' }] };
  }

  // --- CLEAR SCENE ---
  if (/^(clear|clean|empty|reset)\s*(scene|all|everything|viewport)?\s*$/.test(lower)) {
    return { reply: 'Scene cleared.', commands: [{ action: 'clearScene' }] };
  }

  // --- HIDE ---
  if (/^hide\b/.test(lower) || /\bhide\s+(it|this|that|selected|the)\b/.test(lower)) {
    const targetIdx = resolveTarget(lower, features, selectedIdx);
    const idx = targetIdx >= 0 ? targetIdx : (selectedIdx >= 0 ? selectedIdx : features.length - 1);
    if (idx >= 0 && idx < features.length) {
      return {
        reply: `Hidden "${features[idx].name || 'Part'}".`,
        commands: [{ action: 'hide', index: idx }]
      };
    }
    return { reply: 'Nothing to hide.', commands: [] };
  }

  // --- SHOW ALL ---
  if (/^show\s*all\s*$/.test(lower) || /^unhide\s*all\s*$/.test(lower)) {
    return { reply: 'All parts visible.', commands: [{ action: 'showAll' }] };
  }

  // --- SELECT ---
  if (/^select\b/.test(lower)) {
    const targetIdx = resolveTarget(lower, features, selectedIdx);
    if (targetIdx >= 0) {
      return {
        reply: `Selected "${features[targetIdx].name || 'Part'}".`,
        commands: [{ action: 'select', index: targetIdx }]
      };
    }
    return { reply: 'Could not find that part. Use "what\'s in the scene?" to see available parts.', commands: [] };
  }

  // --- MOVE ---
  if (/^move\b/.test(lower) || /\bmove\s+(it|this|that|the)\b/.test(lower)) {
    const dir = parseDirection(lower);
    const dist = parseFirstNumber(lower) || 20;
    const targetIdx = resolveTarget(lower, features, selectedIdx);
    const idx = targetIdx >= 0 ? targetIdx : (selectedIdx >= 0 ? selectedIdx : features.length - 1);
    if (idx >= 0 && idx < features.length) {
      return {
        reply: `Moved "${features[idx].name || 'Part'}" ${dir.label} by ${dist}mm.`,
        commands: [{ action: 'move', index: idx, axis: dir.axis, distance: dist * dir.sign }]
      };
    }
    return { reply: 'Nothing to move.', commands: [] };
  }

  // --- ROTATE ---
  if (/^rotate\b/.test(lower) || /\brotate\s+(it|this|that|the)\b/.test(lower)) {
    const angle = parseFirstNumber(lower) || 90;
    const axis = /\b[xX]\b/.test(lower) ? 'x' : /\b[zZ]\b/.test(lower) ? 'z' : 'y';
    const targetIdx = resolveTarget(lower, features, selectedIdx);
    const idx = targetIdx >= 0 ? targetIdx : (selectedIdx >= 0 ? selectedIdx : features.length - 1);
    if (idx >= 0 && idx < features.length) {
      return {
        reply: `Rotated "${features[idx].name || 'Part'}" ${angle}° around ${axis.toUpperCase()}.`,
        commands: [{ action: 'rotate', index: idx, axis, angle }]
      };
    }
    return { reply: 'Nothing to rotate.', commands: [] };
  }

  // --- SCALE / MAKE BIGGER/SMALLER ---
  if (/\b(scale|bigger|smaller|larger|resize|grow|shrink)\b/.test(lower) ||
      /\bmake\s+it\s+(bigger|smaller|larger|taller|shorter|wider|thinner)\b/.test(lower)) {
    let factor = parseFirstNumber(lower);
    if (!factor) {
      if (/bigger|larger|grow|taller|wider/i.test(lower)) factor = 1.5;
      else if (/smaller|shrink|shorter|thinner/i.test(lower)) factor = 0.67;
      else factor = 1.5;
    }
    // If user said "scale 2x" or "2x bigger"
    if (/(\d+(?:\.\d+)?)\s*x\b/.test(lower)) {
      factor = parseFloat(lower.match(/(\d+(?:\.\d+)?)\s*x\b/)[1]);
    }
    const targetIdx = resolveTarget(lower, features, selectedIdx);
    const idx = targetIdx >= 0 ? targetIdx : (selectedIdx >= 0 ? selectedIdx : features.length - 1);
    if (idx >= 0 && idx < features.length) {
      return {
        reply: `Scaled "${features[idx].name || 'Part'}" by ${factor}x.`,
        commands: [{ action: 'scale', index: idx, factor }]
      };
    }
    return { reply: 'Nothing to scale.', commands: [] };
  }

  // --- DUPLICATE / COPY ---
  if (/^(duplicate|copy|clone)\b/.test(lower)) {
    const targetIdx = resolveTarget(lower, features, selectedIdx);
    const idx = targetIdx >= 0 ? targetIdx : (selectedIdx >= 0 ? selectedIdx : features.length - 1);
    if (idx >= 0 && idx < features.length) {
      return {
        reply: `Duplicated "${features[idx].name || 'Part'}".`,
        commands: [{ action: 'duplicate', index: idx }]
      };
    }
    return { reply: 'Nothing to duplicate.', commands: [] };
  }

  // --- BOOLEAN: SUBTRACT / CUT ---
  if (/\b(subtract|cut|difference|minus)\b/.test(lower)) {
    if (features.length < 2) return { reply: 'Need at least 2 parts for boolean subtract.', commands: [] };
    const { tool, target } = resolveBooleanPair(lower, features);
    return {
      reply: `Subtracted "${features[tool]?.name || 'tool'}" from "${features[target]?.name || 'target'}".`,
      commands: [{ action: 'booleanSubtract', toolIndex: tool, targetIndex: target }]
    };
  }

  // --- BOOLEAN: INTERSECT ---
  if (/\b(intersect|intersection|overlap)\b/.test(lower)) {
    if (features.length < 2) return { reply: 'Need at least 2 parts for boolean intersect.', commands: [] };
    const { tool, target } = resolveBooleanPair(lower, features);
    return {
      reply: `Intersected "${features[tool]?.name || 'Part A'}" with "${features[target]?.name || 'Part B'}".`,
      commands: [{ action: 'booleanIntersect', toolIndex: tool, targetIndex: target }]
    };
  }

  // --- BOOLEAN: UNION / COMBINE / MERGE ---
  if (/\b(union|combine|merge|join|fuse)\b/.test(lower)) {
    if (features.length < 2) return { reply: 'Need at least 2 parts for boolean union.', commands: [] };
    const { tool, target } = resolveBooleanPair(lower, features);
    return {
      reply: `Joined "${features[tool]?.name || 'Part A'}" with "${features[target]?.name || 'Part B'}".`,
      commands: [{ action: 'booleanUnion', toolIndex: tool, targetIndex: target }]
    };
  }

  // --- COLOR / MATERIAL ---
  if (/\b(color|colour|paint|material)\b/.test(lower)) {
    const colorMatch = lower.match(/\b(red|green|blue|yellow|orange|purple|white|black|gray|grey|silver|gold|pink|cyan|magenta)\b/);
    if (colorMatch) {
      const targetIdx = resolveTarget(lower, features, selectedIdx);
      const idx = targetIdx >= 0 ? targetIdx : (selectedIdx >= 0 ? selectedIdx : features.length - 1);
      if (idx >= 0 && idx < features.length) {
        return {
          reply: `Changed color of "${features[idx].name || 'Part'}" to ${colorMatch[1]}.`,
          commands: [{ action: 'color', index: idx, color: colorMatch[1] }]
        };
      }
    }
    return { reply: 'Specify a color: "color it red", "make it blue", "paint the box green".', commands: [] };
  }

  // --- RENAME ---
  if (/^rename\b/.test(lower)) {
    const nameMatch = original.match(/rename\s+(?:it\s+)?(?:to\s+)?["']?([^"']+?)["']?\s*$/i);
    if (nameMatch) {
      const idx = selectedIdx >= 0 ? selectedIdx : features.length - 1;
      if (idx >= 0 && idx < features.length) {
        return {
          reply: `Renamed to "${nameMatch[1].trim()}".`,
          commands: [{ action: 'rename', index: idx, name: nameMatch[1].trim() }]
        };
      }
    }
    return { reply: 'Usage: "rename to My Part Name"', commands: [] };
  }

  // --- FIT VIEW / ZOOM TO FIT ---
  if (/^(fit|zoom to fit|fit all|zoom all|reset view|home view|reset camera)\s*$/.test(lower)) {
    return { reply: 'View reset.', commands: [{ action: 'fitAll' }] };
  }

  // --- WIREFRAME ---
  if (/^(wireframe|toggle wireframe)\s*$/.test(lower)) {
    return { reply: 'Wireframe toggled.', commands: [{ action: 'wireframe' }] };
  }

  // --- GRID ---
  if (/^(grid|toggle grid)\s*$/.test(lower)) {
    return { reply: 'Grid toggled.', commands: [{ action: 'grid' }] };
  }

  // --- EXPORT ---
  if (/^export\b/.test(lower)) {
    const fmt = /stl/i.test(lower) ? 'stl' : /obj/i.test(lower) ? 'obj' : /gltf|glb/i.test(lower) ? 'gltf' : /dxf/i.test(lower) ? 'dxf' : /json/i.test(lower) ? 'json' : 'stl';
    return { reply: `Exporting as ${fmt.toUpperCase()}...`, commands: [{ action: 'export', format: fmt }] };
  }

  // --- SKETCH TOOLS ---
  if (/^(start|begin|new)\s*sketch\s*$/i.test(lower) || /^sketch\s*$/i.test(lower)) {
    return { reply: 'Starting sketch mode. Draw on the grid plane.', commands: [{ action: 'startSketch' }] };
  }
  if (/^(end|finish|done|close)\s*sketch\s*$/i.test(lower)) {
    return { reply: 'Sketch completed.', commands: [{ action: 'endSketch' }] };
  }
  if (/^(draw\s+)?line\s*$/i.test(lower)) {
    return { reply: 'Line tool active. Click to place points.', commands: [{ action: 'sketchTool', tool: 'line' }] };
  }
  if (/^(draw\s+)?rect(angle)?\s*$/i.test(lower)) {
    return { reply: 'Rectangle tool active. Click to place corners.', commands: [{ action: 'sketchTool', tool: 'rect' }] };
  }
  if (/^(draw\s+)?circle\s*$/i.test(lower)) {
    return { reply: 'Circle tool active. Click center, then radius.', commands: [{ action: 'sketchTool', tool: 'circle' }] };
  }
  if (/^(draw\s+)?arc\s*$/i.test(lower)) {
    return { reply: 'Arc tool active. Click start, mid, end.', commands: [{ action: 'sketchTool', tool: 'arc' }] };
  }

  // --- 3D OPERATIONS ---
  if (/^extrude\s*$/i.test(lower) || /^extrude\s+sketch\s*$/i.test(lower)) {
    return { reply: 'Extruding sketch...', commands: [{ action: 'extrude' }] };
  }
  if (/^revolve\s*$/i.test(lower)) {
    return { reply: 'Revolving sketch...', commands: [{ action: 'revolve' }] };
  }
  if (/^(cut|boolean cut)\s*$/i.test(lower)) {
    return { reply: 'Cut mode active. Select tool body.', commands: [{ action: 'cut' }] };
  }

  // --- ADVANCED OPERATIONS ---
  if (/\b(sweep)\b/i.test(lower)) {
    return { reply: 'Sweep operation. Select profile and path.', commands: [{ action: 'sweep' }] };
  }
  if (/\b(loft)\b/i.test(lower)) {
    return { reply: 'Loft operation. Select profiles to blend.', commands: [{ action: 'loft' }] };
  }
  if (/\b(shell|hollow)\b/i.test(lower)) {
    const t = parseFirstNumber(lower) || 2;
    return { reply: `Shell with ${t}mm wall thickness.`, commands: [{ action: 'shell', thickness: t }] };
  }
  if (/\b(pattern|array)\b/i.test(lower)) {
    const n = parseFirstNumber(lower) || 4;
    return { reply: `Pattern: ${n} copies.`, commands: [{ action: 'pattern', count: n }] };
  }
  if (/\b(mirror)\b/i.test(lower)) {
    const plane = /\b[xX]\b/.test(lower) ? 'x' : /\b[zZ]\b/.test(lower) ? 'z' : 'y';
    return { reply: `Mirrored across ${plane.toUpperCase()} plane.`, commands: [{ action: 'mirror', plane }] };
  }
  if (/\b(thread)\b/i.test(lower)) {
    return { reply: 'Adding thread to selected cylinder.', commands: [{ action: 'thread' }] };
  }
  if (/\b(spring)\b/i.test(lower)) {
    const d = parseFirstNumber(lower) || 20;
    return { reply: `Creating spring (d=${d}mm).`, commands: [{ action: 'spring', diameter: d }] };
  }

  // --- SHEET METAL ---
  if (/\b(bend|sheet\s*metal\s*bend)\b/i.test(lower)) {
    return { reply: 'Sheet metal bend.', commands: [{ action: 'bend' }] };
  }
  if (/\b(unfold|flat\s*pattern)\b/i.test(lower)) {
    return { reply: 'Unfolding sheet metal to flat pattern.', commands: [{ action: 'unfold' }] };
  }

  // --- VIEWS ---
  if (/^(front|top|right|left|back|bottom|isometric|iso)\s*(view)?\s*$/i.test(lower)) {
    const view = lower.replace(/\s*view\s*$/, '').trim();
    return { reply: `${view.charAt(0).toUpperCase() + view.slice(1)} view.`, commands: [{ action: 'setView', view }] };
  }
  if (/\b(zoom\s*in)\b/i.test(lower)) {
    return { reply: 'Zoomed in.', commands: [{ action: 'zoomIn' }] };
  }
  if (/\b(zoom\s*out)\b/i.test(lower)) {
    return { reply: 'Zoomed out.', commands: [{ action: 'zoomOut' }] };
  }
  if (/\b(dark\s*mode|light\s*mode|toggle\s*theme)\b/i.test(lower)) {
    return { reply: 'Theme toggled.', commands: [{ action: 'toggleTheme' }] };
  }

  // --- PANELS ---
  if (/\b(open|show)\s*(help|keyboard|shortcuts)\b/i.test(lower)) {
    return { reply: 'Opening help panel.', commands: [{ action: 'openPanel', panel: 'help' }] };
  }
  if (/\b(open|show)\s*(properties|params|parameters)\b/i.test(lower)) {
    return { reply: 'Showing properties panel.', commands: [{ action: 'openPanel', panel: 'properties' }] };
  }
  if (/\b(open|show)\s*(guide|rebuild)\b/i.test(lower)) {
    return { reply: 'Opening guide panel.', commands: [{ action: 'openPanel', panel: 'guide' }] };
  }
  if (/\b(open|show)\s*(token|billing)\b/i.test(lower)) {
    return { reply: 'Opening tokens panel.', commands: [{ action: 'openPanel', panel: 'tokens' }] };
  }
  if (/\b(open|show)\s*(marketplace|store)\b/i.test(lower)) {
    return { reply: 'Opening marketplace.', commands: [{ action: 'openPanel', panel: 'marketplace' }] };
  }
  if (/\b(open|show)\s*(gd&?t|gdt|tolerance)\b/i.test(lower)) {
    return { reply: 'Opening GD&T training.', commands: [{ action: 'openPanel', panel: 'gdt' }] };
  }
  if (/\b(open|show)\s*(misumi|catalog)\b/i.test(lower)) {
    return { reply: 'Opening MISUMI catalog.', commands: [{ action: 'openPanel', panel: 'misumi' }] };
  }
  if (/\b(open|show)\s*(console|log)\b/i.test(lower)) {
    return { reply: 'Opening console.', commands: [{ action: 'openPanel', panel: 'console' }] };
  }

  // --- IMPORT ---
  if (/\b(import|open|load)\s*(step|stp|inventor|ipt|iam|stl|obj)\b/i.test(lower)) {
    const format = /step|stp/i.test(lower) ? 'step' : /inventor|ipt|iam/i.test(lower) ? 'inventor' : /stl/i.test(lower) ? 'stl' : 'obj';
    return { reply: `Opening ${format} import dialog...`, commands: [{ action: 'import', format }] };
  }

  // --- AI TOOLS ---
  if (/\b(dfm|manufacturab|design\s*for\s*manuf)/i.test(lower)) {
    return { reply: 'Running DFM analysis...', commands: [{ action: 'openPanel', panel: 'dfm' }] };
  }
  if (/\b(copilot|ai\s*assist|suggest)\b/i.test(lower)) {
    return { reply: 'Opening AI Copilot.', commands: [{ action: 'openPanel', panel: 'copilot' }] };
  }
  if (/\b(reverse\s*engineer)/i.test(lower)) {
    return { reply: 'Opening reverse engineering tool.', commands: [{ action: 'openPanel', panel: 'reverseEngineer' }] };
  }
  if (/\b(material\s*library|materials?\s*selector)\b/i.test(lower)) {
    return { reply: 'Opening material library.', commands: [{ action: 'openPanel', panel: 'materials' }] };
  }
  if (/\b(generative\s*design)\b/i.test(lower)) {
    return { reply: 'Opening generative design tool.', commands: [{ action: 'openPanel', panel: 'generative' }] };
  }

  // --- CAM ---
  if (/\b(cam|toolpath|cnc|machining)\b/i.test(lower)) {
    return { reply: 'Opening CAM pipeline.', commands: [{ action: 'openPanel', panel: 'cam' }] };
  }
  if (/\b(g-?code|gcode)\b/i.test(lower)) {
    return { reply: 'Opening G-code viewer.', commands: [{ action: 'openPanel', panel: 'gcode' }] };
  }

  // --- COLLABORATION ---
  if (/\b(collab|share|collaboration)\b/i.test(lower)) {
    return { reply: 'Opening collaboration panel.', commands: [{ action: 'openPanel', panel: 'collab' }] };
  }
  if (/\b(vr|virtual\s*reality|immersive)\b/i.test(lower)) {
    return { reply: 'Opening VR mode.', commands: [{ action: 'openPanel', panel: 'vr' }] };
  }

  // --- ASSEMBLY ---
  if (/^(assembly|assembly mode)\s*$/i.test(lower)) {
    return { reply: 'Switching to assembly mode.', commands: [{ action: 'assemblyMode' }] };
  }
  if (/\b(explode|exploded\s*view)\b/i.test(lower)) {
    return { reply: 'Toggling exploded view.', commands: [{ action: 'explode' }] };
  }

  // --- MEASURE ---
  if (/\b(measure|distance|dimension|ruler)\b/i.test(lower)) {
    return { reply: 'Measure tool active. Click two points to measure distance.', commands: [{ action: 'measure' }] };
  }

  // --- SECTION VIEW ---
  if (/\b(section|cross\s*section|section\s*cut|slice)\b/i.test(lower)) {
    return { reply: 'Section cut tool active.', commands: [{ action: 'section' }] };
  }

  // --- SCREENSHOT ---
  if (/\b(screenshot|capture|snapshot|save\s*image)\b/i.test(lower)) {
    return { reply: 'Capturing screenshot...', commands: [{ action: 'screenshot' }] };
  }

  // --- DXF EXPORT ---
  if (/\b(dxf|engineering\s*drawing|2d\s*drawing)\b/i.test(lower)) {
    return { reply: 'Exporting DXF engineering drawing...', commands: [{ action: 'export', format: 'dxf' }] };
  }

  // --- SAVE / LOAD ---
  if (/^save\s*(project|file|model)?\s*$/i.test(lower)) {
    return { reply: 'Saving project...', commands: [{ action: 'save' }] };
  }
  if (/^(load|open)\s*(project|file|model)?\s*$/i.test(lower)) {
    return { reply: 'Opening file picker...', commands: [{ action: 'load' }] };
  }

  // --- CONSTRAINT COMMANDS ---
  if (/\b(constrain|constraint|lock|fix)\s*(horizontal|vertical|equal|parallel|perpendicular|tangent|coincident|concentric|symmetric)?\b/i.test(lower)) {
    const type = (lower.match(/(horizontal|vertical|equal|parallel|perpendicular|tangent|coincident|concentric|symmetric)/)?.[1]) || 'fixed';
    return { reply: `Adding ${type} constraint.`, commands: [{ action: 'addConstraint', type }] };
  }

  return null; // not a scene action
}

// ============================================================================
// TARGET RESOLUTION (which part does the user mean?)
// ============================================================================

function resolveTarget(text, features, selectedIdx) {
  if (!features || features.length === 0) return -1;

  // "the selected" / "current" / "this"
  if (/\b(selected|current|this)\b/.test(text) && selectedIdx >= 0) return selectedIdx;

  // "the last" / "last one" / "it"
  if (/\b(last|it|that)\b/.test(text)) return features.length - 1;

  // "the first" / "first one"
  if (/\b(first)\b/.test(text)) return 0;

  // "the second" / "third" etc
  const ordinals = { second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5 };
  for (const [word, idx] of Object.entries(ordinals)) {
    if (text.includes(word) && idx < features.length) return idx;
  }

  // "the box" / "the cylinder" / part by type name
  for (let i = features.length - 1; i >= 0; i--) {
    const name = (features[i].name || '').toLowerCase();
    const type = (features[i].type || '').toLowerCase();
    // Check each part type synonym
    for (const [pType, synonyms] of Object.entries(PART_TYPE_SYNONYMS)) {
      for (const syn of synonyms) {
        if (text.includes(syn) && (name.includes(syn) || name.includes(pType) || type === pType)) {
          return i;
        }
      }
    }
  }

  // "the square" → box
  if (/\bsquare\b/.test(text)) {
    for (let i = features.length - 1; i >= 0; i--) {
      const name = (features[i].name || '').toLowerCase();
      const type = (features[i].type || '').toLowerCase();
      if (type === 'box' || name.includes('box') || name.includes('cube') || name.includes('square')) return i;
    }
  }

  // By name substring
  const nameMatch = text.match(/(?:the|named?)\s+["']?(\w+)["']?/);
  if (nameMatch) {
    const search = nameMatch[1].toLowerCase();
    for (let i = features.length - 1; i >= 0; i--) {
      if ((features[i].name || '').toLowerCase().includes(search)) return i;
    }
  }

  return -1;
}

function resolveBooleanPair(text, features) {
  // Try "subtract A from B" pattern
  const fromMatch = text.match(/(?:subtract|cut|intersect)\s+(?:the\s+)?(\w+)\s+from\s+(?:the\s+)?(\w+)/i);
  if (fromMatch) {
    const toolIdx = findFeatureByKeyword(fromMatch[1], features);
    const targetIdx = findFeatureByKeyword(fromMatch[2], features);
    if (toolIdx >= 0 && targetIdx >= 0) return { tool: toolIdx, target: targetIdx };
  }

  // Try "intersect A and B" / "intersect A with B"
  const andMatch = text.match(/(?:intersect|union|combine|merge)\s+(?:the\s+)?(\w+)\s+(?:and|with)\s+(?:the\s+)?(\w+)/i);
  if (andMatch) {
    const a = findFeatureByKeyword(andMatch[1], features);
    const b = findFeatureByKeyword(andMatch[2], features);
    if (a >= 0 && b >= 0) return { tool: a, target: b };
  }

  // Default: last two parts
  return { tool: features.length - 1, target: features.length - 2 };
}

function findFeatureByKeyword(keyword, features) {
  const kw = keyword.toLowerCase();
  // "square" → box
  const typeMap = { square: 'box', cube: 'box', block: 'box', rod: 'cylinder', shaft: 'cylinder', ball: 'sphere', ring: 'torus', donut: 'torus' };
  const mapped = typeMap[kw] || kw;

  for (let i = features.length - 1; i >= 0; i--) {
    const name = (features[i].name || '').toLowerCase();
    const type = (features[i].type || '').toLowerCase();
    if (name.includes(mapped) || type.includes(mapped) || name.includes(kw)) return i;
  }
  return -1;
}

// ============================================================================
// DIRECTION PARSING
// ============================================================================

function parseDirection(text) {
  if (/\b(up|above|higher)\b/.test(text)) return { axis: 'y', sign: 1, label: 'up' };
  if (/\b(down|below|lower)\b/.test(text)) return { axis: 'y', sign: -1, label: 'down' };
  if (/\b(left)\b/.test(text)) return { axis: 'x', sign: -1, label: 'left' };
  if (/\b(right)\b/.test(text)) return { axis: 'x', sign: 1, label: 'right' };
  if (/\b(forward|front)\b/.test(text)) return { axis: 'z', sign: 1, label: 'forward' };
  if (/\b(back|backward|behind)\b/.test(text)) return { axis: 'z', sign: -1, label: 'back' };
  if (/\b(away|outside|out|apart)\b/.test(text)) return { axis: 'x', sign: 1, label: 'away' };
  return { axis: 'y', sign: 1, label: 'up' }; // default
}

function parseFirstNumber(text) {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
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
    return `I can help you design in 3D!\n\n**Create shapes:** box, cylinder, sphere, cone, torus, bracket, plate, flange, washer, spacer, gear\n\n**Modify parts:** "remove it", "delete the box", "undo", "redo"\n**Transform:** "move it up 20", "rotate 45°", "scale 2x", "make it bigger"\n**Booleans:** "subtract box from cylinder", "intersect", "union"\n**Scene:** "hide it", "show all", "select the cylinder", "clear scene"\n**View:** "wireframe", "grid", "fit all", "export stl"\n\n**Examples:**\n• "cylinder 30mm diameter 80mm tall"\n• "bracket 80x40x5"\n• "gear 60mm diameter 24 teeth"\n• "move it left 50"\n• "delete the box"\n\nJust describe what you want!`;
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
    return `**Quick start:**\n1. Type a shape: "cylinder 40mm diameter 100 tall"\n2. I\'ll create it in the 3D viewport\n3. Modify: "fillet 5mm", "move it up 20", "make it bigger"\n4. Combine: "subtract box from cylinder"\n5. Clean up: "remove it", "undo"\n\nPress **?** for the full help panel.`;
  }

  // What did you make / last part / what's in scene
  if (/what('s| is)?\s+(in|on)\s+(the\s+)?(scene|viewport|view)|what did you (make|create|build)|list\s*parts|scene\s*info|inventory/i.test(lower)) {
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

const CAD_SYSTEM_PROMPT = `You are a CAD assistant for cycleCAD, a browser-based 3D modeler. You help users create and modify 3D parts.

RESPONSE FORMAT: Always respond with valid JSON:
{
  "reply": "Your conversational response to the user",
  "commands": [array of command objects, or empty array if just chatting]
}

AVAILABLE COMMANDS:

Create shapes:
- {"type":"box","width":N,"height":N,"depth":N}
- {"type":"cylinder","radius":N,"height":N}
- {"type":"sphere","radius":N}
- {"type":"cone","radius":N,"height":N}
- {"type":"torus","radius":N,"tube":N}
- {"type":"bracket","width":N,"height":N,"thickness":N}
- {"type":"plate","width":N,"height":N,"thickness":N}
- {"type":"flange","outerDiameter":N,"innerDiameter":N,"height":N}
- {"type":"washer","outerDiameter":N,"innerDiameter":N,"thickness":N}
- {"type":"spacer","outerDiameter":N,"innerDiameter":N,"height":N}
- {"type":"gear","diameter":N,"teeth":N,"thickness":N}

Operations on existing parts:
- {"type":"fillet","radius":N}
- {"type":"chamfer","distance":N}

Scene actions:
- {"action":"delete","index":N} — delete part at index (0-based), or -1 for last
- {"action":"undo"}
- {"action":"redo"}
- {"action":"clearScene"}
- {"action":"hide","index":N}
- {"action":"showAll"}
- {"action":"select","index":N}
- {"action":"move","index":N,"axis":"x|y|z","distance":N} — negative for opposite direction
- {"action":"rotate","index":N,"axis":"x|y|z","angle":N}
- {"action":"scale","index":N,"factor":N}
- {"action":"duplicate","index":N}
- {"action":"color","index":N,"color":"red|blue|green|..."}
- {"action":"rename","index":N,"name":"New Name"}
- {"action":"booleanSubtract","toolIndex":N,"targetIndex":N}
- {"action":"booleanIntersect","toolIndex":N,"targetIndex":N}
- {"action":"booleanUnion","toolIndex":N,"targetIndex":N}
- {"action":"fitAll"}
- {"action":"wireframe"}
- {"action":"grid"}
- {"action":"export","format":"stl|obj|gltf"}

RULES:
1. All dimensions in mm. Convert from other units if needed.
2. "diameter X" → radius = X/2 for cylinders/spheres.
3. For multi-step: "box with hole and fillet" → create multiple commands.
4. For questions/chat, set commands to [] and put answer in reply.
5. Be concise (1-2 sentences for creation, more for explanations).
6. Use -1 for index to mean "last/most recent part".
7. "it" / "that" / "the last one" = the most recently created part.
8. "the box" / "the cylinder" = find by type name in scene.
9. "remove it" / "delete it" → {"action":"delete","index":-1}
10. "move it up 20" → {"action":"move","index":-1,"axis":"y","distance":20}
11. "make it bigger" → {"action":"scale","index":-1,"factor":1.5}

SCENE CONTEXT will be appended to user messages showing what parts exist.`;

async function querySmartLLM(userText) {
  const recentHistory = chatState.conversationHistory.slice(-10);
  const sceneCtx = getSceneContext();

  let contextNote = '';
  if (sceneCtx.length > 0) {
    contextNote = `\n[Scene has ${sceneCtx.length} parts: ${sceneCtx.map((p, i) => `[${i}] ${p}`).join(', ')}]`;
  } else {
    contextNote = '\n[Scene is empty]';
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
  const contents = [];
  for (const msg of history.slice(0, -1)) {
    contents.push({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    });
  }
  contents.push({ role: 'user', parts: [{ text: userText + contextNote }] });

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
    let clean = text.trim();
    if (clean.startsWith('```json')) clean = clean.slice(7);
    if (clean.startsWith('```')) clean = clean.slice(3);
    if (clean.endsWith('```')) clean = clean.slice(0, -3);
    clean = clean.trim();

    const parsed = JSON.parse(clean);

    if (parsed.reply && Array.isArray(parsed.commands)) {
      return { reply: parsed.reply, commands: parsed.commands };
    }

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
// SMART LOCAL PARSING (creation commands fallback)
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
      // Try as operation (fillet, chamfer, extrude, revolve)
      parseOperations(part, numbers, commands);
    }
  }

  return commands;
}

// ============================================================================
// PRIMITIVE PARSERS
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
  const diaMatch = text.match(/(?:diameter|dia)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
  if (diaMatch) radius = parseFloat(diaMatch[1]) / 2;
  const rMatch = text.match(/(?:radius|rad)\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
  if (rMatch) radius = parseFloat(rMatch[1]);
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
  if (/revolve|spin/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*deg/i);
    commands.push({ type: 'revolve', angle: m ? parseFloat(m[1]) : 360 });
  }
  // Hole
  if (/\bhole\b/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*(?:hole|diameter)|hole\s*(?:of\s*)?(\d+(?:\.\d+)?)/i);
    const r_val = m ? parseFloat(m[1] || m[2]) / 2 : (numbers[0] ? numbers[0] / 2 : 5);
    commands.push({ type: 'hole', radius: r(r_val) });
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
  if (/\d+\s*x\s*\d+/.test(text)) return 'box';
  return null;
}

export function generateDescription(command) {
  if (command.action) {
    switch (command.action) {
      case 'delete': return 'delete part';
      case 'undo': return 'undo';
      case 'redo': return 'redo';
      case 'move': return `move ${command.axis} ${command.distance}mm`;
      case 'rotate': return `rotate ${command.angle}° ${command.axis}`;
      case 'scale': return `scale ${command.factor}x`;
      case 'hide': return 'hide part';
      case 'showAll': return 'show all';
      case 'clearScene': return 'clear scene';
      case 'duplicate': return 'duplicate';
      case 'color': return `color ${command.color}`;
      case 'booleanSubtract': return 'boolean subtract';
      case 'booleanIntersect': return 'boolean intersect';
      case 'booleanUnion': return 'boolean union';
      case 'fitAll': return 'fit view';
      case 'export': return `export ${command.format}`;
      default: return command.action;
    }
  }
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
    case 'hole': return `hole r${command.radius}mm`;
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
