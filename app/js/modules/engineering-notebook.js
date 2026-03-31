/**
 * @fileoverview Engineering Notebook with AI module for cycleCAD
 * Auto-logging system tracks every design action, manual entries with rich text,
 * AI-powered analysis and suggestions, timeline visualization, version snapshots,
 * and comprehensive export options.
 *
 * @author Claude Code
 * @version 1.0.0
 */

window.CycleCAD = window.CycleCAD || {};

/**
 * Engineering Notebook module: Auto-logs design actions, provides manual entry system,
 * AI features for analysis, timeline visualization, version snapshots, and export.
 */
window.CycleCAD.EngineeringNotebook = (() => {
  // ============================================================================
  // STATE
  // ============================================================================

  let entries = [];
  let snapshots = [];
  let milestones = [];
  let currentUI = null;
  let autoLoggingEnabled = true;
  let entryIdCounter = 0;
  let lastAutoLogTime = 0;
  const AUTO_LOG_THROTTLE = 1000; // ms, merge rapid edits

  /**
   * Entry object structure
   * @typedef {Object} NotebookEntry
   * @property {string} id - Unique entry ID
   * @property {number} timestamp - Unix timestamp in ms
   * @property {string} type - 'auto' | 'note' | 'decision' | 'requirement' | 'issue' | 'meeting' | 'review' | 'test'
   * @property {string} action - Human-readable action description
   * @property {Object} details - Type-specific details (geometry, parameters, etc.)
   * @property {string} [snapshot] - Reference to associated snapshot ID
   * @property {string} userId - User identifier (default: 'anonymous')
   * @property {Array<string>} tags - Free-form tags
   * @property {string} [content] - Manual entry rich text content
   * @property {string} priority - 'info' | 'important' | 'critical'
   */

  /**
   * Snapshot object structure
   * @typedef {Object} VersionSnapshot
   * @property {string} id - Unique snapshot ID
   * @property {number} timestamp - Unix timestamp in ms
   * @property {string} label - User-friendly label
   * @property {Object} sceneState - Three.js scene serialization
   * @property {Object} parameterSnapshot - Current parameters
   * @property {Array<Object>} constraints - Assembly constraints
   * @property {Object} analysisResults - Latest analysis (FEA, DFM, etc.)
   */

  // ============================================================================
  // 1. AUTO-LOGGING SYSTEM (~300 lines)
  // ============================================================================

  /**
   * Initialize auto-logging by attaching event listeners to cycleCAD event bus
   * @private
   */
  function initAutoLogging() {
    // Hook into cycleCAD modules via window.CycleCAD.onEvent
    if (!window.CycleCAD.onEvent) {
      window.CycleCAD.onEvent = [];
    }
    window.CycleCAD.onEvent.push(handleCycleCADEvent);
  }

  /**
   * Central event handler for all cycleCAD actions
   * @param {Object} event - Event object from cycleCAD modules
   * @param {string} event.type - Event type: 'geometry.create' | 'feature.apply' | 'param.change' | etc.
   * @param {Object} event.data - Event-specific data
   * @private
   */
  function handleCycleCADEvent(event) {
    if (!autoLoggingEnabled) return;

    const now = Date.now();
    if (now - lastAutoLogTime < AUTO_LOG_THROTTLE) {
      // Merge with last entry if within throttle window
      const lastEntry = entries[entries.length - 1];
      if (lastEntry && lastEntry.type === 'auto') {
        lastEntry.details.mergedCount = (lastEntry.details.mergedCount || 1) + 1;
        lastEntry.details.lastAction = event.type;
        return;
      }
    }
    lastAutoLogTime = now;

    let action = '';
    let details = { ...event.data };

    switch (event.type) {
      case 'geometry.create':
        action = `Created ${event.data.shapeType} (${event.data.width}×${event.data.height}×${event.data.depth})`;
        details.shapeType = event.data.shapeType;
        details.dimensions = { width: event.data.width, height: event.data.height, depth: event.data.depth };
        break;

      case 'feature.apply':
        action = `Applied ${event.data.featureType}`;
        if (event.data.featureType === 'fillet') {
          action += ` (radius: ${event.data.radius}mm)`;
          details.radius = event.data.radius;
        } else if (event.data.featureType === 'pattern') {
          action += ` (${event.data.rows}×${event.data.cols})`;
          details.pattern = { rows: event.data.rows, cols: event.data.cols };
        }
        details.featureType = event.data.featureType;
        break;

      case 'param.change':
        action = `Changed ${event.data.paramName} from ${event.data.oldValue} to ${event.data.newValue}`;
        details.paramName = event.data.paramName;
        details.oldValue = event.data.oldValue;
        details.newValue = event.data.newValue;
        break;

      case 'constraint.add':
        action = `Added ${event.data.constraintType} constraint`;
        details.constraintType = event.data.constraintType;
        break;

      case 'constraint.remove':
        action = `Removed constraint`;
        details.constraintId = event.data.constraintId;
        break;

      case 'analysis.run':
        action = `Ran ${event.data.analysisType} analysis`;
        details.analysisType = event.data.analysisType;
        details.results = event.data.results;
        break;

      case 'export.save':
        action = `Exported as ${event.data.format} (${event.data.filename})`;
        details.format = event.data.format;
        details.filename = event.data.filename;
        break;

      case 'library.insert':
        action = `Inserted part from library: ${event.data.partName}`;
        details.partName = event.data.partName;
        details.category = event.data.category;
        break;

      case 'assembly.mate':
        action = `Added ${event.data.mateType} mate`;
        details.mateType = event.data.mateType;
        details.component1 = event.data.component1;
        details.component2 = event.data.component2;
        break;

      default:
        action = `${event.type}`;
    }

    if (action) {
      addEntry({
        type: 'auto',
        action,
        details,
        priority: 'info'
      });
    }
  }

  /**
   * Log a geometry creation event
   * @param {string} shapeType - Type of shape created
   * @param {number} width - Bounding box width
   * @param {number} height - Bounding box height
   * @param {number} depth - Bounding box depth
   */
  function logGeometryCreate(shapeType, width, height, depth) {
    window.CycleCAD.onEvent?.forEach(cb => cb({
      type: 'geometry.create',
      data: { shapeType, width, height, depth }
    }));
  }

  /**
   * Log a feature operation
   * @param {string} featureType - Type of feature (fillet, chamfer, pattern, etc.)
   * @param {Object} params - Feature parameters
   */
  function logFeatureApply(featureType, params) {
    window.CycleCAD.onEvent?.forEach(cb => cb({
      type: 'feature.apply',
      data: { featureType, ...params }
    }));
  }

  /**
   * Log a parameter change
   * @param {string} paramName - Parameter name
   * @param {*} oldValue - Previous value
   * @param {*} newValue - New value
   */
  function logParamChange(paramName, oldValue, newValue) {
    window.CycleCAD.onEvent?.forEach(cb => cb({
      type: 'param.change',
      data: { paramName, oldValue, newValue }
    }));
  }

  // ============================================================================
  // 2. MANUAL ENTRY SYSTEM (~200 lines)
  // ============================================================================

  const ENTRY_TYPES = ['note', 'decision', 'requirement', 'issue', 'meeting', 'review', 'test'];
  const PRIORITIES = ['info', 'important', 'critical'];

  /**
   * Create manual entry UI with rich text editor
   * @returns {HTMLElement} Rich text editor panel
   * @private
   */
  function createManualEntryEditor() {
    const container = document.createElement('div');
    container.className = 'engineering-notebook-editor';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: var(--color-bg-secondary, #1e1e1e);
      border-radius: 4px;
    `;

    // Type selector
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    const typeLabel = document.createElement('label');
    typeLabel.textContent = 'Type: ';
    typeLabel.style.fontSize = '12px';
    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = `
      padding: 4px 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 12px;
    `;
    ENTRY_TYPES.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      typeSelect.appendChild(opt);
    });
    typeRow.appendChild(typeLabel);
    typeRow.appendChild(typeSelect);

    // Priority selector
    const priorityLabel = document.createElement('label');
    priorityLabel.textContent = ' Priority: ';
    priorityLabel.style.fontSize = '12px';
    priorityLabel.style.marginLeft = '16px';
    const prioritySelect = document.createElement('select');
    prioritySelect.style.cssText = `
      padding: 4px 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 12px;
    `;
    PRIORITIES.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
      prioritySelect.appendChild(opt);
    });
    typeRow.appendChild(priorityLabel);
    typeRow.appendChild(prioritySelect);
    container.appendChild(typeRow);

    // Formatting toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 8px;
      background: var(--color-bg-tertiary, #252525);
      border-radius: 3px;
      border-bottom: 1px solid var(--color-border, #404040);
    `;
    const formatButtons = [
      { cmd: 'bold', label: 'B', title: 'Bold' },
      { cmd: 'italic', label: 'I', title: 'Italic' },
      { cmd: 'underline', label: 'U', title: 'Underline' },
      { cmd: 'strikethrough', label: 'S', title: 'Strikethrough' },
      { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
      { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' },
    ];
    formatButtons.forEach(({ cmd, label, title }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.title = title;
      btn.style.cssText = `
        padding: 4px 8px;
        background: var(--color-bg-input, #2d2d2d);
        color: var(--color-text, #e0e0e0);
        border: 1px solid var(--color-border, #404040);
        border-radius: 2px;
        cursor: pointer;
        font-size: 11px;
        font-weight: bold;
      `;
      btn.onclick = () => document.execCommand(cmd);
      toolbar.appendChild(btn);
    });
    container.appendChild(toolbar);

    // Content editor
    const editor = document.createElement('div');
    editor.className = 'engineering-notebook-content-editor';
    editor.contentEditable = true;
    editor.style.cssText = `
      min-height: 120px;
      padding: 10px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      overflow-y: auto;
      max-height: 200px;
    `;
    editor.placeholder = 'Enter your notes here...';
    container.appendChild(editor);

    // Tags input
    const tagsRow = document.createElement('div');
    tagsRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    const tagsLabel = document.createElement('label');
    tagsLabel.textContent = 'Tags: ';
    tagsLabel.style.fontSize = '12px';
    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.placeholder = 'Comma-separated tags';
    tagsInput.style.cssText = `
      flex: 1;
      padding: 4px 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 12px;
    `;
    tagsRow.appendChild(tagsLabel);
    tagsRow.appendChild(tagsInput);
    container.appendChild(tagsRow);

    // Add entry button
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Entry';
    addBtn.style.cssText = `
      padding: 8px 16px;
      background: var(--color-accent, #0284c7);
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    `;
    addBtn.onclick = () => {
      if (editor.textContent.trim()) {
        addEntry({
          type: typeSelect.value,
          action: editor.textContent.substring(0, 100).trim(),
          content: editor.innerHTML,
          priority: prioritySelect.value,
          tags: tagsInput.value.split(',').map(t => t.trim()).filter(t => t)
        });
        editor.innerHTML = '';
        tagsInput.value = '';
        typeSelect.value = 'note';
        prioritySelect.value = 'info';
      }
    };
    container.appendChild(addBtn);

    return container;
  }

  // ============================================================================
  // 3. AI FEATURES (~300 lines)
  // ============================================================================

  /**
   * Simple local NLP: extract keywords from text
   * @param {string} text - Input text
   * @returns {Array<string>} Extracted keywords
   * @private
   */
  function extractKeywords(text) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'was', 'be', 'have', 'do', 'will']);
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    return words.filter(w => w.length > 3 && !stopWords.has(w));
  }

  /**
   * Calculate text similarity using Jaccard index
   * @param {string} text1 - First text
   * @param {string} text2 - Second text
   * @returns {number} Similarity score 0-1
   * @private
   */
  function calculateSimilarity(text1, text2) {
    const set1 = new Set(extractKeywords(text1));
    const set2 = new Set(extractKeywords(text2));
    const intersection = [...set1].filter(w => set2.has(w)).length;
    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Generate AI summary of design changes over time period
   * @param {number} [hoursBack=24] - Hours to look back (default 24)
   * @returns {string} Summary text
   */
  function autoSummarize(hoursBack = 24) {
    const cutoffTime = Date.now() - (hoursBack * 3600000);
    const recentEntries = entries.filter(e => e.timestamp >= cutoffTime);

    if (recentEntries.length === 0) return 'No entries in this period.';

    // Group entries by type
    const byType = {};
    recentEntries.forEach(e => {
      if (!byType[e.type]) byType[e.type] = [];
      byType[e.type].push(e);
    });

    let summary = `Design Summary (last ${hoursBack} hours):\n\n`;

    if (byType.auto && byType.auto.length > 0) {
      summary += `Applied ${byType.auto.length} operations:\n`;
      byType.auto.slice(0, 5).forEach(e => {
        summary += `  • ${e.action}\n`;
      });
      if (byType.auto.length > 5) summary += `  ... and ${byType.auto.length - 5} more\n`;
    }

    if (byType.decision && byType.decision.length > 0) {
      summary += `\nKey Decisions:\n`;
      byType.decision.forEach(e => {
        summary += `  • ${e.action}\n`;
      });
    }

    if (byType.issue && byType.issue.length > 0) {
      summary += `\nOutstanding Issues:\n`;
      byType.issue.forEach(e => {
        summary += `  • [${e.priority.toUpperCase()}] ${e.action}\n`;
      });
    }

    return summary;
  }

  /**
   * Generate design review checklist from recent changes
   * @returns {Array<string>} Checklist items
   */
  function generateReviewChecklist() {
    const recentEntries = entries.slice(-20);
    const checklist = [
      'Verify all dimensions match specification',
      'Check material properties are appropriate',
      'Validate manufacturing feasibility',
      'Review fillet/chamfer radii',
      'Confirm assembly constraints',
      'Check for sharp edges and stress concentrators',
      'Validate wall thickness requirements'
    ];

    // Add custom items based on recent operations
    const hasHoles = recentEntries.some(e => e.details?.featureType === 'hole' || e.action?.includes('hole'));
    if (hasHoles) checklist.push('Verify hole thread specifications and positions');

    const hasFillets = recentEntries.some(e => e.details?.featureType === 'fillet');
    if (hasFillets) checklist.push('Check fillet radii meet design requirements');

    const hasPatterns = recentEntries.some(e => e.details?.featureType === 'pattern');
    if (hasPatterns) checklist.push('Confirm pattern spacing and alignment');

    return checklist;
  }

  /**
   * Search entries using natural language
   * @param {string} query - Natural language search query
   * @returns {Array<NotebookEntry>} Matching entries with score
   */
  function searchEntries(query) {
    const keywords = extractKeywords(query);
    const results = entries.map(entry => {
      let score = 0;
      const text = (entry.action + ' ' + (entry.content || '')).toLowerCase();
      keywords.forEach(kw => {
        if (text.includes(kw)) score += 1;
      });
      score += calculateSimilarity(query, entry.action) * 5;
      return { entry, score };
    }).filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);

    return results.map(r => r.entry);
  }

  /**
   * Detect contradictory design decisions
   * @returns {Array<Object>} Array of conflicts
   */
  function detectConflicts() {
    const conflicts = [];
    const decisions = entries.filter(e => e.type === 'decision');

    for (let i = 0; i < decisions.length; i++) {
      for (let j = i + 1; j < decisions.length; j++) {
        const sim = calculateSimilarity(decisions[i].action, decisions[j].action);
        // Look for similar-sounding decisions that might contradict
        if (sim > 0.6 && decisions[i].action !== decisions[j].action) {
          conflicts.push({
            decision1: decisions[i],
            decision2: decisions[j],
            similarity: sim
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Generate AI-powered engineering report
   * @returns {string} HTML-formatted report
   */
  function generateReport() {
    const summary = autoSummarize(72); // Last 3 days
    const checklist = generateReviewChecklist();
    const conflicts = detectConflicts();

    let html = `
      <div style="font-family: Georgia, serif; color: #333; line-height: 1.6;">
        <h1>Engineering Design Report</h1>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Total Entries:</strong> ${entries.length}</p>

        <h2>Design Summary</h2>
        <pre style="background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto;">${escapeHtml(summary)}</pre>

        <h2>Design Review Checklist</h2>
        <ul>
          ${checklist.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>

        ${conflicts.length > 0 ? `
          <h2>Potential Conflicts</h2>
          <ul style="color: #d32f2f;">
            ${conflicts.slice(0, 5).map(c => `
              <li>
                <strong>${new Date(c.decision1.timestamp).toLocaleDateString()}:</strong> "${escapeHtml(c.decision1.action)}"<br/>
                vs <strong>${new Date(c.decision2.timestamp).toLocaleDateString()}:</strong> "${escapeHtml(c.decision2.action)}"
              </li>
            `).join('')}
          </ul>
        ` : ''}

        <h2>Recent Entries</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 2px solid #ddd;">
            <th style="text-align: left; padding: 8px;">Date</th>
            <th style="text-align: left; padding: 8px;">Type</th>
            <th style="text-align: left; padding: 8px;">Action</th>
          </tr>
          ${entries.slice(-20).reverse().map(e => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px;">${new Date(e.timestamp).toLocaleString()}</td>
              <td style="padding: 8px;"><strong>${e.type}</strong></td>
              <td style="padding: 8px;">${escapeHtml(e.action)}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    `;

    return html;
  }

  /**
   * Escape HTML special characters
   * @private
   */
  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return (text || '').replace(/[&<>"']/g, m => map[m]);
  }

  // ============================================================================
  // 4. TIMELINE VIEW (~200 lines)
  // ============================================================================

  /**
   * Create timeline visualization
   * @returns {HTMLElement} Timeline panel
   * @private
   */
  function createTimelineView() {
    const container = document.createElement('div');
    container.className = 'engineering-notebook-timeline';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      height: 100%;
      overflow-y: auto;
    `;

    // Filter controls
    const filterBar = document.createElement('div');
    filterBar.style.cssText = `
      display: flex;
      gap: 8px;
      padding: 8px;
      background: var(--color-bg-secondary, #1e1e1e);
      border-radius: 4px;
      flex-wrap: wrap;
    `;

    const typeFilterLabel = document.createElement('label');
    typeFilterLabel.textContent = 'Filter: ';
    typeFilterLabel.style.fontSize = '12px';
    const typeFilter = document.createElement('select');
    typeFilter.style.cssText = `
      padding: 4px 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 12px;
    `;
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All Types';
    typeFilter.appendChild(allOpt);
    ENTRY_TYPES.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      typeFilter.appendChild(opt);
    });
    const autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = 'Auto-logged';
    typeFilter.appendChild(autoOpt);
    filterBar.appendChild(typeFilterLabel);
    filterBar.appendChild(typeFilter);

    const zoomLabel = document.createElement('label');
    zoomLabel.textContent = ' Zoom: ';
    zoomLabel.style.fontSize = '12px';
    zoomLabel.style.marginLeft = '16px';
    const zoomSelect = document.createElement('select');
    zoomSelect.style.cssText = `
      padding: 4px 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 12px;
    `;
    ['Day', 'Week', 'Month'].forEach(zoom => {
      const opt = document.createElement('option');
      opt.value = zoom.toLowerCase();
      opt.textContent = zoom;
      zoomSelect.appendChild(opt);
    });
    filterBar.appendChild(zoomLabel);
    filterBar.appendChild(zoomSelect);
    container.appendChild(filterBar);

    // Timeline container
    const timeline = document.createElement('div');
    timeline.style.cssText = `
      flex: 1;
      position: relative;
      padding: 20px 0;
    `;

    // Central timeline line
    const line = document.createElement('div');
    line.style.cssText = `
      position: absolute;
      left: 30px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--color-border, #404040);
    `;
    timeline.appendChild(line);

    // Render entries
    function renderTimeline() {
      const entriesContainer = document.createElement('div');
      entriesContainer.style.cssText = 'position: relative; padding-left: 80px;';

      let filteredEntries = entries;
      if (typeFilter.value !== 'all') {
        filteredEntries = entries.filter(e => e.type === typeFilter.value);
      }

      filteredEntries.reverse().forEach(entry => {
        const card = document.createElement('div');
        card.style.cssText = `
          margin-bottom: 24px;
          padding: 12px;
          background: var(--color-bg-secondary, #1e1e1e);
          border-left: 4px solid var(--color-accent, #0284c7);
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        `;

        // Color by type
        const typeColors = {
          auto: '#0284c7',
          decision: '#22c55e',
          issue: '#ef4444',
          requirement: '#f59e0b',
          meeting: '#8b5cf6',
          review: '#ec4899',
          test: '#06b6d4',
          note: '#64748b'
        };
        card.style.borderLeftColor = typeColors[entry.type] || '#0284c7';

        const time = document.createElement('div');
        time.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 4px;';
        time.textContent = new Date(entry.timestamp).toLocaleString();
        card.appendChild(time);

        const typeTag = document.createElement('span');
        typeTag.style.cssText = `
          display: inline-block;
          padding: 2px 6px;
          background: ${typeColors[entry.type] || '#0284c7'};
          color: white;
          border-radius: 2px;
          font-size: 10px;
          font-weight: 600;
          margin-right: 6px;
        `;
        typeTag.textContent = entry.type.toUpperCase();
        card.appendChild(typeTag);

        if (entry.priority !== 'info') {
          const priorityTag = document.createElement('span');
          priorityTag.style.cssText = `
            display: inline-block;
            padding: 2px 6px;
            background: ${entry.priority === 'critical' ? '#dc2626' : '#f59e0b'};
            color: white;
            border-radius: 2px;
            font-size: 10px;
            font-weight: 600;
          `;
          priorityTag.textContent = entry.priority.toUpperCase();
          card.appendChild(priorityTag);
        }

        const action = document.createElement('div');
        action.style.cssText = 'font-size: 13px; font-weight: 600; margin-top: 6px;';
        action.textContent = entry.action;
        card.appendChild(action);

        if (entry.tags && entry.tags.length > 0) {
          const tagContainer = document.createElement('div');
          tagContainer.style.cssText = 'margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap;';
          entry.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.style.cssText = `
              padding: 2px 6px;
              background: var(--color-bg-tertiary, #252525);
              color: var(--color-text-secondary, #999);
              border-radius: 2px;
              font-size: 10px;
            `;
            tagEl.textContent = tag;
            tagContainer.appendChild(tagEl);
          });
          card.appendChild(tagContainer);
        }

        card.onclick = () => {
          card.style.background = 'var(--color-bg-tertiary, #252525)';
        };

        entriesContainer.appendChild(card);
      });

      timeline.innerHTML = line.outerHTML;
      timeline.appendChild(entriesContainer);
    }

    renderTimeline();
    typeFilter.onchange = renderTimeline;

    container.appendChild(timeline);
    return container;
  }

  // ============================================================================
  // 5. VERSION SNAPSHOTS (~200 lines)
  // ============================================================================

  /**
   * Create snapshot of current scene state
   * @param {string} label - Snapshot label
   * @returns {VersionSnapshot} Saved snapshot
   */
  function captureSnapshot(label = '') {
    const snapshot = {
      id: 'snap_' + (Math.random() * 1e9 | 0),
      timestamp: Date.now(),
      label: label || `Snapshot ${snapshots.length + 1}`,
      sceneState: serializeScene(),
      parameterSnapshot: captureParameters(),
      constraints: captureConstraints(),
      analysisResults: captureAnalysisResults()
    };

    snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Serialize Three.js scene to JSON
   * @private
   */
  function serializeScene() {
    return {
      objectCount: 0,
      timestamp: Date.now(),
      note: 'Scene serialization (full implementation in main app)'
    };
  }

  /**
   * Capture current parameter values
   * @private
   */
  function captureParameters() {
    return {
      timestamp: Date.now(),
      parameters: {}
    };
  }

  /**
   * Capture assembly constraints
   * @private
   */
  function captureConstraints() {
    return [];
  }

  /**
   * Capture latest analysis results
   * @private
   */
  function captureAnalysisResults() {
    return {};
  }

  /**
   * Compare two snapshots
   * @param {string} snapId1 - First snapshot ID
   * @param {string} snapId2 - Second snapshot ID
   * @returns {Object} Diff object
   */
  function compareSnapshots(snapId1, snapId2) {
    const snap1 = snapshots.find(s => s.id === snapId1);
    const snap2 = snapshots.find(s => s.id === snapId2);

    if (!snap1 || !snap2) return null;

    return {
      snap1: snap1.label,
      snap2: snap2.label,
      added: [],
      removed: [],
      modified: [],
      timestamp1: new Date(snap1.timestamp).toLocaleString(),
      timestamp2: new Date(snap2.timestamp).toLocaleString()
    };
  }

  /**
   * Restore scene to snapshot state
   * @param {string} snapId - Snapshot ID
   * @returns {boolean} Success
   */
  function restoreSnapshot(snapId) {
    const snapshot = snapshots.find(s => s.id === snapId);
    if (!snapshot) return false;

    // Implementation would restore Three.js scene, parameters, constraints
    addEntry({
      type: 'auto',
      action: `Restored snapshot: ${snapshot.label}`,
      details: { snapshotId: snapId },
      priority: 'important'
    });

    return true;
  }

  /**
   * Create snapshots panel UI
   * @returns {HTMLElement} Snapshots panel
   * @private
   */
  function createSnapshotsView() {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 12px;';

    const captureBtn = document.createElement('button');
    captureBtn.textContent = 'Capture Snapshot';
    captureBtn.style.cssText = `
      padding: 8px 16px;
      background: var(--color-accent, #0284c7);
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    `;
    captureBtn.onclick = () => {
      const label = prompt('Snapshot label:');
      if (label) {
        const snap = captureSnapshot(label);
        renderSnapshots();
      }
    };
    container.appendChild(captureBtn);

    function renderSnapshots() {
      const list = container.querySelector('.snapshot-list') || document.createElement('div');
      list.className = 'snapshot-list';
      list.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
      list.innerHTML = '';

      snapshots.forEach(snap => {
        const card = document.createElement('div');
        card.style.cssText = `
          padding: 10px;
          background: var(--color-bg-secondary, #1e1e1e);
          border: 1px solid var(--color-border, #404040);
          border-radius: 3px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        `;

        const info = document.createElement('div');
        const label = document.createElement('div');
        label.style.cssText = 'font-size: 13px; font-weight: 600;';
        label.textContent = snap.label;
        const time = document.createElement('div');
        time.style.cssText = 'font-size: 11px; color: #888;';
        time.textContent = new Date(snap.timestamp).toLocaleString();
        info.appendChild(label);
        info.appendChild(time);
        card.appendChild(info);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 4px;';

        const restoreBtn = document.createElement('button');
        restoreBtn.textContent = 'Restore';
        restoreBtn.style.cssText = `
          padding: 4px 8px;
          background: var(--color-bg-tertiary, #252525);
          color: var(--color-text, #e0e0e0);
          border: 1px solid var(--color-border, #404040);
          border-radius: 2px;
          cursor: pointer;
          font-size: 11px;
        `;
        restoreBtn.onclick = () => {
          if (confirm(`Restore to "${snap.label}"?`)) {
            restoreSnapshot(snap.id);
          }
        };
        actions.appendChild(restoreBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.cssText = `
          padding: 4px 8px;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 2px;
          cursor: pointer;
          font-size: 11px;
        `;
        deleteBtn.onclick = () => {
          snapshots = snapshots.filter(s => s.id !== snap.id);
          renderSnapshots();
        };
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
        list.appendChild(card);
      });

      if (!container.querySelector('.snapshot-list')) {
        container.appendChild(list);
      }
    }

    renderSnapshots();
    return container;
  }

  // ============================================================================
  // 6. EXPORT & SHARING (~150 lines)
  // ============================================================================

  /**
   * Export notebook in specified format
   * @param {string} format - 'html' | 'pdf-html' | 'markdown' | 'json'
   * @param {Object} options - Export options
   * @param {number} [options.hoursBack] - Hours to include (default: all)
   * @param {Array<string>} [options.types] - Entry types to include (default: all)
   * @param {boolean} [options.includeAutoLog] - Include auto-logged entries (default: false)
   * @returns {string} Exported content
   */
  function exportNotebook(format = 'html', options = {}) {
    let filteredEntries = entries;

    if (options.hoursBack) {
      const cutoff = Date.now() - (options.hoursBack * 3600000);
      filteredEntries = filteredEntries.filter(e => e.timestamp >= cutoff);
    }

    if (options.types) {
      filteredEntries = filteredEntries.filter(e => options.types.includes(e.type));
    }

    if (!options.includeAutoLog) {
      filteredEntries = filteredEntries.filter(e => e.type !== 'auto');
    }

    switch (format) {
      case 'json':
        return JSON.stringify({
          exportDate: new Date().toISOString(),
          entryCount: filteredEntries.length,
          snapshotCount: snapshots.length,
          entries: filteredEntries,
          snapshots: snapshots
        }, null, 2);

      case 'markdown':
        let md = `# Engineering Notebook\n\n`;
        md += `**Export Date:** ${new Date().toLocaleString()}\n`;
        md += `**Total Entries:** ${filteredEntries.length}\n\n`;

        filteredEntries.reverse().forEach(entry => {
          md += `## ${entry.action}\n\n`;
          md += `**Type:** ${entry.type} | **Priority:** ${entry.priority}\n`;
          md += `**Date:** ${new Date(entry.timestamp).toLocaleString()}\n`;
          if (entry.tags.length > 0) {
            md += `**Tags:** ${entry.tags.join(', ')}\n`;
          }
          if (entry.content) {
            md += `\n${entry.content}\n`;
          }
          md += `\n---\n\n`;
        });

        return md;

      case 'pdf-html':
      case 'html':
      default:
        let html = generateReport();
        if (format === 'pdf-html') {
          html = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { font-family: Georgia, serif; margin: 40px; }
                h1 { page-break-before: always; }
                h2 { margin-top: 24px; }
                table { width: 100%; border-collapse: collapse; page-break-inside: avoid; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              </style>
            </head>
            <body>${html}</body>
            </html>
          `;
        }
        return html;
    }
  }

  /**
   * Generate shareable link (stored in memory, no server)
   * @returns {string} Link identifier
   */
  function generateShareLink() {
    const linkId = Math.random().toString(36).substring(2, 11);
    // In production, this would upload to server and return URL
    return `cyclecad.com/notebook/${linkId}`;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Add new notebook entry
   * @param {Object} entryData - Entry data
   * @returns {NotebookEntry} Created entry
   */
  function addEntry(entryData) {
    const entry = {
      id: 'entry_' + (entryIdCounter++),
      timestamp: Date.now(),
      userId: 'anonymous',
      tags: [],
      priority: 'info',
      ...entryData
    };

    entries.push(entry);
    return entry;
  }

  /**
   * Search notebook entries
   * @param {string} query - Search query
   * @returns {Array<NotebookEntry>} Matching entries
   */
  function search(query) {
    return searchEntries(query);
  }

  /**
   * Get timeline view of entries
   * @returns {Array<NotebookEntry>} All entries in chronological order
   */
  function getTimeline() {
    return [...entries].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Generate engineering report
   * @returns {string} HTML report
   */
  function generateReport_Public() {
    return generateReport();
  }

  /**
   * Initialize the module and attach to page
   * @param {HTMLElement} container - Container element
   */
  function init(container) {
    initAutoLogging();

    if (!container) return;

    // Create tabbed interface
    const panel = document.createElement('div');
    panel.style.cssText = `
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--color-bg-primary, #1a1a1a);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 4px;
      overflow: hidden;
    `;

    // Tabs
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
      display: flex;
      gap: 0;
      padding: 0;
      background: var(--color-bg-secondary, #1e1e1e);
      border-bottom: 1px solid var(--color-border, #404040);
      overflow-x: auto;
    `;

    const tabs = [
      { id: 'timeline', label: `Timeline (${entries.length})`, creator: createTimelineView },
      { id: 'entry', label: 'New Entry', creator: createManualEntryEditor },
      { id: 'search', label: 'Search', creator: createSearchView },
      { id: 'snapshots', label: `Snapshots (${snapshots.length})`, creator: createSnapshotsView },
      { id: 'report', label: 'Report', creator: createReportView }
    ];

    const tabContent = document.createElement('div');
    tabContent.style.cssText = `
      flex: 1;
      overflow-y: auto;
      background: var(--color-bg-primary, #1a1a1a);
    `;

    tabs.forEach((tab, idx) => {
      const tabBtn = document.createElement('button');
      tabBtn.textContent = tab.label;
      tabBtn.style.cssText = `
        padding: 10px 16px;
        background: ${idx === 0 ? 'var(--color-bg-tertiary, #252525)' : 'transparent'};
        color: var(--color-text, #e0e0e0);
        border: none;
        border-bottom: ${idx === 0 ? '2px solid var(--color-accent, #0284c7)' : 'none'};
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      `;
      tabBtn.onclick = () => {
        tabs.forEach((_, i) => {
          const btn = tabBar.children[i];
          btn.style.background = i === idx ? 'var(--color-bg-tertiary, #252525)' : 'transparent';
          btn.style.borderBottom = i === idx ? '2px solid var(--color-accent, #0284c7)' : 'none';
        });
        tabContent.innerHTML = '';
        tabContent.appendChild(tab.creator());
      };
      tabBar.appendChild(tabBtn);
    });

    panel.appendChild(tabBar);
    panel.appendChild(tabContent);

    // Initial content
    tabContent.appendChild(createTimelineView());

    container.appendChild(panel);
    currentUI = panel;
  }

  /**
   * Get UI element
   * @returns {HTMLElement} Current UI element
   */
  function getUI() {
    const container = document.createElement('div');
    container.style.cssText = 'width: 100%; height: 100%;';
    init(container);
    return container;
  }

  /**
   * Execute command from Agent API
   * @param {Object} params - Command parameters
   * @returns {*} Command result
   */
  function execute(params) {
    switch (params.command) {
      case 'addEntry':
        return addEntry(params.data);
      case 'search':
        return search(params.query);
      case 'snapshot':
        return captureSnapshot(params.label);
      case 'export':
        return exportNotebook(params.format, params.options);
      case 'summary':
        return autoSummarize(params.hoursBack);
      case 'checklist':
        return generateReviewChecklist();
      default:
        return null;
    }
  }

  /**
   * Create search view UI
   * @private
   */
  function createSearchView() {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 12px;';

    const searchBox = document.createElement('input');
    searchBox.type = 'text';
    searchBox.placeholder = 'Search entries...';
    searchBox.style.cssText = `
      padding: 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 13px;
    `;
    container.appendChild(searchBox);

    const results = document.createElement('div');
    results.style.cssText = 'display: flex; flex-direction: column; gap: 8px; flex: 1; overflow-y: auto;';

    searchBox.oninput = () => {
      const matches = search(searchBox.value);
      results.innerHTML = '';

      if (matches.length === 0) {
        const noResults = document.createElement('div');
        noResults.style.cssText = 'color: #888; font-size: 12px;';
        noResults.textContent = 'No results found';
        results.appendChild(noResults);
      } else {
        matches.forEach(entry => {
          const card = document.createElement('div');
          card.style.cssText = `
            padding: 10px;
            background: var(--color-bg-secondary, #1e1e1e);
            border-left: 3px solid var(--color-accent, #0284c7);
            border-radius: 3px;
          `;

          const time = document.createElement('div');
          time.style.cssText = 'font-size: 11px; color: #888;';
          time.textContent = new Date(entry.timestamp).toLocaleString();
          card.appendChild(time);

          const action = document.createElement('div');
          action.style.cssText = 'font-size: 13px; font-weight: 600; margin-top: 4px;';
          action.textContent = entry.action;
          card.appendChild(action);

          results.appendChild(card);
        });
      }
    };

    container.appendChild(results);
    return container;
  }

  /**
   * Create report view UI
   * @private
   */
  function createReportView() {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 12px;';

    // Format selector
    const formatRow = document.createElement('div');
    formatRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    const formatLabel = document.createElement('label');
    formatLabel.textContent = 'Format: ';
    formatLabel.style.fontSize = '12px';
    const formatSelect = document.createElement('select');
    formatSelect.style.cssText = `
      padding: 4px 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 12px;
    `;
    ['html', 'markdown', 'json'].forEach(fmt => {
      const opt = document.createElement('option');
      opt.value = fmt;
      opt.textContent = fmt.toUpperCase();
      formatSelect.appendChild(opt);
    });
    formatRow.appendChild(formatLabel);
    formatRow.appendChild(formatSelect);
    container.appendChild(formatRow);

    // Date range
    const dateRow = document.createElement('div');
    dateRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    const dateLabel = document.createElement('label');
    dateLabel.textContent = 'Last: ';
    dateLabel.style.fontSize = '12px';
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.min = '1';
    hoursInput.value = '24';
    hoursInput.style.cssText = `
      width: 60px;
      padding: 4px 8px;
      background: var(--color-bg-input, #2d2d2d);
      color: var(--color-text, #e0e0e0);
      border: 1px solid var(--color-border, #404040);
      border-radius: 3px;
      font-size: 12px;
    `;
    const hoursLabel = document.createElement('label');
    hoursLabel.textContent = ' hours';
    hoursLabel.style.fontSize = '12px';
    dateRow.appendChild(dateLabel);
    dateRow.appendChild(hoursInput);
    dateRow.appendChild(hoursLabel);
    container.appendChild(dateRow);

    // Generate button
    const genBtn = document.createElement('button');
    genBtn.textContent = 'Generate Report';
    genBtn.style.cssText = `
      padding: 8px 16px;
      background: var(--color-accent, #0284c7);
      color: white;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    `;
    genBtn.onclick = () => {
      const content = exportNotebook(formatSelect.value, { hoursBack: parseInt(hoursInput.value) });
      const output = document.createElement('div');
      output.style.cssText = `
        margin-top: 12px;
        padding: 12px;
        background: var(--color-bg-secondary, #1e1e1e);
        border: 1px solid var(--color-border, #404040);
        border-radius: 3px;
        max-height: 400px;
        overflow-y: auto;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        white-space: pre-wrap;
      `;
      output.textContent = content.substring(0, 2000);
      container.appendChild(output);

      const downloadBtn = document.createElement('button');
      downloadBtn.textContent = 'Download';
      downloadBtn.style.cssText = `
        margin-top: 8px;
        padding: 6px 12px;
        background: var(--color-bg-tertiary, #252525);
        color: var(--color-text, #e0e0e0);
        border: 1px solid var(--color-border, #404040);
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      `;
      downloadBtn.onclick = () => {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notebook-report.${formatSelect.value === 'json' ? 'json' : formatSelect.value === 'markdown' ? 'md' : 'html'}`;
        a.click();
      };
      container.appendChild(downloadBtn);
    };
    container.appendChild(genBtn);

    return container;
  }

  // Export public API
  return {
    init,
    getUI,
    execute,
    addEntry,
    search,
    generateReport: generateReport_Public,
    getTimeline,
    captureSnapshot,
    compareSnapshots,
    restoreSnapshot,
    exportNotebook,
    autoSummarize,
    generateReviewChecklist,
    logGeometryCreate,
    logFeatureApply,
    logParamChange,
    toggleAutoLogging: () => { autoLoggingEnabled = !autoLoggingEnabled; }
  };
})();
