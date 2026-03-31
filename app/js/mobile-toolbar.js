/**
 * Mobile Toolbar Component for cycleCAD
 * Bottom floating toolbar optimized for mobile touch interaction
 */

class MobileToolbar {
  constructor(options = {}) {
    this.options = {
      position: 'bottom', // bottom, left, right
      autoHide: true,
      autoHideDelay: 3000,
      tools: [],
      onToolClick: () => {},
      onMoreClick: () => {},
      ...options
    };

    this.container = null;
    this.isVisible = true;
    this.autoHideTimer = null;
    this.isExpanded = false;
    this.init();
  }

  init() {
    this.createContainer();
    this.renderTools();
    this.attachEventListeners();
  }

  createContainer() {
    this.container = document.createElement('div');
    this.container.className = 'mobile-toolbar';
    this.container.id = 'mobile-toolbar';
    this.container.innerHTML = `
      <div class="toolbar-content">
        <div class="toolbar-pills"></div>
      </div>
    `;

    document.body.appendChild(this.container);
  }

  renderTools() {
    const pillsContainer = this.container.querySelector('.toolbar-pills');
    pillsContainer.innerHTML = '';

    // Determine which tools to show (up to 6)
    const visibleTools = this.options.tools.slice(0, 6);
    const hasMore = this.options.tools.length > 6;

    visibleTools.forEach((tool, index) => {
      const button = this.createToolButton(tool);
      pillsContainer.appendChild(button);
    });

    // Add "More" button if tools exceed 6
    if (hasMore) {
      const moreButton = document.createElement('button');
      moreButton.className = 'tool-button more-button';
      moreButton.innerHTML = `
        <span class="tool-icon">⋯</span>
        <span class="tool-label">More</span>
      `;
      moreButton.addEventListener('click', () => this.toggleGrid());
      pillsContainer.appendChild(moreButton);
    }
  }

  createToolButton(tool) {
    const button = document.createElement('button');
    button.className = `tool-button ${tool.active ? 'active' : ''}`;
    button.dataset.toolId = tool.id;
    button.dataset.category = tool.category || 'view';

    const icon = tool.icon || '🔧';
    const label = tool.label || tool.id;

    button.innerHTML = `
      <span class="tool-icon">${icon}</span>
      <span class="tool-label">${label}</span>
    `;

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectTool(tool);
    });

    return button;
  }

  selectTool(tool) {
    // Deselect previous tool
    this.container.querySelectorAll('.tool-button').forEach(btn => {
      btn.classList.remove('active');
    });

    // Select new tool
    const button = this.container.querySelector(`[data-tool-id="${tool.id}"]`);
    if (button) {
      button.classList.add('active');
    }

    // Call callback
    this.options.onToolClick(tool);

    // Reset auto-hide timer
    if (this.options.autoHide) {
      this.resetAutoHideTimer();
    }
  }

  toggleGrid() {
    if (this.isExpanded) {
      this.closeGrid();
    } else {
      this.openGrid();
    }
  }

  openGrid() {
    if (this.isExpanded) return;

    this.isExpanded = true;

    // Create bottom sheet grid
    const grid = document.createElement('div');
    grid.className = 'toolbar-grid-sheet';
    grid.id = 'toolbar-grid-sheet';

    // Group tools by category
    const categories = {
      sketch: [],
      solid: [],
      view: [],
      measure: [],
      other: []
    };

    this.options.tools.forEach(tool => {
      const cat = tool.category || 'other';
      if (categories[cat]) {
        categories[cat].push(tool);
      } else {
        categories.other.push(tool);
      }
    });

    // Build grid HTML
    let gridHTML = `
      <div class="grid-sheet-handle"></div>
      <div class="grid-sheet-content">
    `;

    Object.entries(categories).forEach(([category, tools]) => {
      if (tools.length === 0) return;

      const categoryLabel = this.getCategoryLabel(category);
      gridHTML += `<div class="grid-category">
        <div class="category-label">${categoryLabel}</div>
        <div class="category-tools">`;

      tools.forEach(tool => {
        const icon = tool.icon || '🔧';
        const label = tool.label || tool.id;
        gridHTML += `
          <button class="grid-tool-button" data-tool-id="${tool.id}">
            <span class="tool-icon">${icon}</span>
            <span class="tool-label">${label}</span>
          </button>
        `;
      });

      gridHTML += `</div></div>`;
    });

    gridHTML += '</div>';
    grid.innerHTML = gridHTML;

    // Attach event listeners
    grid.querySelectorAll('.grid-tool-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const toolId = e.currentTarget.dataset.toolId;
        const tool = this.options.tools.find(t => t.id === toolId);
        if (tool) {
          this.selectTool(tool);
          this.closeGrid();
        }
      });
    });

    // Close on backdrop click
    const backdrop = document.createElement('div');
    backdrop.className = 'grid-sheet-backdrop';
    backdrop.addEventListener('click', () => this.closeGrid());

    document.body.appendChild(backdrop);
    document.body.appendChild(grid);

    // Animate in
    setTimeout(() => {
      grid.classList.add('open');
      backdrop.classList.add('open');
    }, 10);
  }

  closeGrid() {
    if (!this.isExpanded) return;

    this.isExpanded = false;

    const grid = document.getElementById('toolbar-grid-sheet');
    const backdrop = document.querySelector('.grid-sheet-backdrop');

    if (grid) {
      grid.classList.remove('open');
      setTimeout(() => grid.remove(), 300);
    }

    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 300);
    }
  }

  getCategoryLabel(category) {
    const labels = {
      sketch: '✏️ Sketch Tools',
      solid: '🧊 Solid Tools',
      view: '👁️ View',
      measure: '📏 Measure',
      other: '🔧 Other'
    };
    return labels[category] || category;
  }

  attachEventListeners() {
    // Show toolbar on viewport tap
    const viewport = document.getElementById('viewport');
    if (viewport) {
      viewport.addEventListener('pointerdown', () => {
        if (!this.isVisible) {
          this.show();
        }
        if (this.options.autoHide) {
          this.resetAutoHideTimer();
        }
      });
    }

    // Make toolbar draggable
    this.makeToolbarDraggable();
  }

  makeToolbarDraggable() {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;

    this.container.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tool-button')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      offsetX = this.container.offsetLeft;
      offsetY = this.container.offsetTop;
    });

    document.addEventListener('pointermove', (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newX = offsetX + dx;
      const newY = offsetY + dy;

      // Constrain to viewport
      const maxX = window.innerWidth - this.container.offsetWidth;
      const maxY = window.innerHeight - this.container.offsetHeight;

      this.container.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
      this.container.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
    });

    document.addEventListener('pointerup', () => {
      isDragging = false;
    });
  }

  resetAutoHideTimer() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
    }

    this.autoHideTimer = setTimeout(() => {
      this.hide();
    }, this.options.autoHideDelay);
  }

  show() {
    this.isVisible = true;
    this.container.style.opacity = '1';
    this.container.style.pointerEvents = 'auto';
  }

  hide() {
    this.isVisible = false;
    this.container.style.opacity = '0.3';
    this.container.style.pointerEvents = 'none';
  }

  updateTools(tools) {
    this.options.tools = tools;
    this.renderTools();
  }

  addTool(tool) {
    this.options.tools.push(tool);
    this.renderTools();
  }

  removeTool(toolId) {
    this.options.tools = this.options.tools.filter(t => t.id !== toolId);
    this.renderTools();
  }

  setActiveTool(toolId) {
    this.options.tools.forEach(t => t.active = t.id === toolId);
    this.renderTools();
  }

  destroy() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
    }

    if (this.container) {
      this.container.remove();
    }

    const grid = document.getElementById('toolbar-grid-sheet');
    if (grid) grid.remove();

    const backdrop = document.querySelector('.grid-sheet-backdrop');
    if (backdrop) backdrop.remove();
  }
}

// Add CSS styles for mobile toolbar if not already present
if (!document.getElementById('mobile-toolbar-styles')) {
  const style = document.createElement('style');
  style.id = 'mobile-toolbar-styles';
  style.textContent = `
    .toolbar-grid-sheet {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: var(--bg-primary);
      border-top: 1px solid var(--border-color);
      z-index: 160;
      max-height: 80vh;
      overflow-y: auto;
      border-radius: 12px 12px 0 0;
      transform: translateY(100%);
      transition: transform 0.3s ease-out;
      padding-bottom: var(--safe-area-bottom);
    }

    .toolbar-grid-sheet.open {
      transform: translateY(0);
    }

    .grid-sheet-handle {
      width: 40px;
      height: 4px;
      background: var(--border-color);
      border-radius: 2px;
      margin: 8px auto;
      cursor: grab;
    }

    .grid-sheet-content {
      padding: 16px;
    }

    .grid-category {
      margin-bottom: 24px;
    }

    .category-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      padding: 0 8px;
    }

    .category-tools {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .grid-tool-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      border: 1px solid var(--border-color);
      background: var(--bg-secondary);
      border-radius: 8px;
      cursor: pointer;
      font-size: 11px;
      color: var(--text-primary);
      transition: all 0.2s;
      min-height: 80px;
    }

    .grid-tool-button:active {
      background: var(--accent-color);
      color: white;
      transform: scale(0.95);
    }

    .grid-tool-button .tool-icon {
      font-size: 28px;
    }

    .grid-tool-button .tool-label {
      text-align: center;
      line-height: 1.2;
    }

    .grid-sheet-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0);
      z-index: 150;
      transition: background 0.3s;
    }

    .grid-sheet-backdrop.open {
      background: rgba(0, 0, 0, 0.4);
    }

    @media (min-width: 600px) {
      .category-tools {
        grid-template-columns: repeat(5, 1fr);
      }
    }

    @media (min-width: 900px) {
      .category-tools {
        grid-template-columns: repeat(6, 1fr);
      }
    }
  `;
  document.head.appendChild(style);
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MobileToolbar;
}
