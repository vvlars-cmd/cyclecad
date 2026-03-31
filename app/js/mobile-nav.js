/**
 * Mobile Navigation Component for cycleCAD
 * Hamburger menu, bottom tabs, breadcrumb, and floating action button
 */

class MobileNav {
  constructor(options = {}) {
    this.options = {
      workspaces: [],
      onWorkspaceChange: () => {},
      onMenuOpen: () => {},
      onMenuClose: () => {},
      onFabClick: () => {},
      ...options
    };

    this.menuOpen = false;
    this.breadcrumb = [];
    this.activeWorkspace = 0;
    this.init();
  }

  init() {
    this.createHamburgerMenu();
    this.createWorkspaceTabs();
    this.createBreadcrumb();
    this.createFAB();
    this.attachEventListeners();
  }

  createHamburgerMenu() {
    const hamburger = document.createElement('button');
    hamburger.className = 'hamburger-menu';
    hamburger.id = 'hamburger-menu';
    hamburger.innerHTML = `
      <span>
        <div></div>
        <div></div>
        <div></div>
      </span>
    `;
    hamburger.addEventListener('click', () => this.toggleMenu());

    const header = document.querySelector('.menu-bar') || document.body;
    if (header === document.body) {
      // Prepend to body if no menu bar exists
      document.body.insertBefore(hamburger, document.body.firstChild);
    } else {
      header.insertBefore(hamburger, header.firstChild);
    }

    // Create menu overlay
    const menu = document.createElement('div');
    menu.className = 'mobile-menu';
    menu.id = 'mobile-menu';
    menu.innerHTML = `
      <div class="menu-backdrop"></div>
      <nav class="menu-content">
        <div class="menu-header">
          <h2>Menu</h2>
          <button class="menu-close">✕</button>
        </div>
        <ul class="menu-items">
          <li><a href="#sketch">📝 Sketch</a></li>
          <li><a href="#model">🧊 Model</a></li>
          <li><a href="#assembly">🔗 Assembly</a></li>
          <li><a href="#analyze">📊 Analyze</a></li>
          <li><a href="#export">💾 Export</a></li>
          <li><a href="#settings">⚙️ Settings</a></li>
        </ul>
      </nav>
    `;

    document.body.appendChild(menu);

    // Close menu handlers
    menu.querySelector('.menu-close').addEventListener('click', () => this.closeMenu());
    menu.querySelector('.menu-backdrop').addEventListener('click', () => this.closeMenu());

    this.hamburger = hamburger;
    this.menu = menu;
  }

  createWorkspaceTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'workspace-tabs';
    tabs.id = 'workspace-tabs';

    this.options.workspaces.forEach((ws, index) => {
      const tab = document.createElement('button');
      tab.className = `workspace-tab ${index === 0 ? 'active' : ''}`;
      tab.dataset.index = index;
      tab.textContent = ws.label || `Workspace ${index + 1}`;
      tab.addEventListener('click', () => this.selectWorkspace(index));
      tabs.appendChild(tab);
    });

    document.body.insertBefore(tabs, document.getElementById('workspace') || document.body.lastChild);
    this.tabs = tabs;
  }

  createBreadcrumb() {
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'breadcrumb';
    breadcrumb.id = 'breadcrumb';
    breadcrumb.innerHTML = `
      <span class="breadcrumb-item"><a href="#home">Home</a></span>
    `;

    document.body.insertBefore(breadcrumb, document.getElementById('workspace') || document.body.lastChild);
    this.breadcrumb = breadcrumb;
  }

  createFAB() {
    const fab = document.createElement('button');
    fab.className = 'floating-action-button';
    fab.id = 'floating-action-button';
    fab.innerHTML = '➕';

    fab.addEventListener('click', () => {
      this.toggleFABMenu();
      this.options.onFabClick();
    });

    document.body.appendChild(fab);
    this.fab = fab;

    // Create FAB menu
    const fabMenu = document.createElement('div');
    fabMenu.className = 'fab-menu hidden';
    fabMenu.id = 'fab-menu';

    const fabItems = [
      { icon: '➕', label: 'New Part', action: 'newPart' },
      { icon: '📐', label: 'Sketch', action: 'sketch' },
      { icon: '🧊', label: 'Solid', action: 'solid' },
      { icon: '🔍', label: 'View', action: 'view' },
      { icon: '⚙️', label: 'Settings', action: 'settings' },
      { icon: '❓', label: 'Help', action: 'help' }
    ];

    fabItems.forEach(item => {
      const itemEl = document.createElement('button');
      itemEl.className = 'fab-item';
      itemEl.innerHTML = item.icon;
      itemEl.title = item.label;
      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.executeFABAction(item.action);
        this.closeFABMenu();
      });
      fabMenu.appendChild(itemEl);
    });

    document.body.appendChild(fabMenu);
    this.fabMenu = fabMenu;
  }

  toggleMenu() {
    if (this.menuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  openMenu() {
    this.menuOpen = true;
    this.menu.classList.add('open');
    this.hamburger.classList.add('active');
    document.body.style.overflow = 'hidden';
    this.options.onMenuOpen();
  }

  closeMenu() {
    this.menuOpen = false;
    this.menu.classList.remove('open');
    this.hamburger.classList.remove('active');
    document.body.style.overflow = '';
    this.options.onMenuClose();
  }

  selectWorkspace(index) {
    // Remove active from all tabs
    this.tabs.querySelectorAll('.workspace-tab').forEach(tab => {
      tab.classList.remove('active');
    });

    // Add active to selected tab
    this.tabs.querySelector(`[data-index="${index}"]`).classList.add('active');

    this.activeWorkspace = index;
    this.options.onWorkspaceChange(this.options.workspaces[index]);
  }

  toggleFABMenu() {
    this.fabMenu.classList.toggle('hidden');
  }

  closeFABMenu() {
    this.fabMenu.classList.add('hidden');
  }

  executeFABAction(action) {
    switch (action) {
      case 'newPart':
        if (window.app && window.app.newPart) window.app.newPart();
        break;
      case 'sketch':
        if (window.app && window.app.enterSketchMode) window.app.enterSketchMode();
        break;
      case 'solid':
        if (window.app && window.app.enterSolidMode) window.app.enterSolidMode();
        break;
      case 'view':
        if (window.app && window.app.toggleViewMode) window.app.toggleViewMode();
        break;
      case 'settings':
        if (window.app && window.app.openSettings) window.app.openSettings();
        break;
      case 'help':
        if (window.app && window.app.openHelp) window.app.openHelp();
        break;
    }
  }

  setBreadcrumb(items) {
    const breadcrumbEl = document.getElementById('breadcrumb');
    if (!breadcrumbEl) return;

    let html = '<span class="breadcrumb-item"><a href="#home">Home</a></span>';

    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      const href = item.href || '#';
      const label = item.label || item;

      if (!isLast) {
        html += `<span class="breadcrumb-separator">/</span>`;
        html += `<span class="breadcrumb-item"><a href="${href}">${label}</a></span>`;
      } else {
        html += `<span class="breadcrumb-separator">/</span>`;
        html += `<span class="breadcrumb-item active">${label}</span>`;
      }
    });

    breadcrumbEl.innerHTML = html;
  }

  updateWorkspaces(workspaces) {
    this.options.workspaces = workspaces;
    const tabs = document.getElementById('workspace-tabs');
    if (tabs) {
      tabs.innerHTML = '';
      workspaces.forEach((ws, index) => {
        const tab = document.createElement('button');
        tab.className = `workspace-tab ${index === 0 ? 'active' : ''}`;
        tab.dataset.index = index;
        tab.textContent = ws.label || `Workspace ${index + 1}`;
        tab.addEventListener('click', () => this.selectWorkspace(index));
        tabs.appendChild(tab);
      });
    }
  }

  getActiveWorkspace() {
    return this.options.workspaces[this.activeWorkspace];
  }

  showContextMenu(x, y, items) {
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu-mobile';
    contextMenu.style.position = 'fixed';
    contextMenu.style.bottom = '44px';
    contextMenu.style.left = '0';
    contextMenu.style.right = '0';

    items.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'menu-item';
      menuItem.innerHTML = `
        <span class="menu-icon">${item.icon || ''}</span>
        <span>${item.label}</span>
      `;
      menuItem.addEventListener('click', () => {
        item.action?.();
        contextMenu.remove();
      });
      contextMenu.appendChild(menuItem);
    });

    document.body.appendChild(contextMenu);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closeContext() {
        contextMenu.remove();
        document.removeEventListener('click', closeContext);
      });
    }, 0);
  }

  attachEventListeners() {
    // Close menu on workspace tab click
    this.tabs?.addEventListener('click', (e) => {
      if (e.target.closest('.workspace-tab')) {
        this.closeMenu();
      }
    });

    // Close FAB menu on viewport click
    const viewport = document.getElementById('viewport');
    if (viewport) {
      viewport.addEventListener('click', () => {
        this.closeFABMenu();
      });
    }

    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
      this.closeMenu();
      this.closeFABMenu();
    });
  }

  destroy() {
    this.hamburger?.remove();
    this.menu?.remove();
    this.tabs?.remove();
    this.breadcrumb?.remove();
    this.fab?.remove();
    this.fabMenu?.remove();
  }
}

// Add CSS styles if not already present
if (!document.getElementById('mobile-nav-styles')) {
  const style = document.createElement('style');
  style.id = 'mobile-nav-styles';
  style.textContent = `
    .mobile-menu {
      position: fixed;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      z-index: 200;
      pointer-events: none;
    }

    .mobile-menu.open {
      pointer-events: auto;
    }

    .menu-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      opacity: 0;
      transition: opacity 0.3s;
    }

    .mobile-menu.open .menu-backdrop {
      opacity: 1;
    }

    .menu-content {
      position: absolute;
      top: 0;
      left: 0;
      width: 80vw;
      max-width: 280px;
      height: 100%;
      background: var(--bg-primary);
      display: flex;
      flex-direction: column;
      transform: translateX(-100%);
      transition: transform 0.3s ease-out;
      box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
      z-index: 210;
    }

    .mobile-menu.open .menu-content {
      transform: translateX(0);
    }

    .menu-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .menu-header h2 {
      margin: 0;
      font-size: 18px;
    }

    .menu-close {
      width: 44px;
      height: 44px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 20px;
      color: var(--text-primary);
    }

    .menu-items {
      list-style: none;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      flex: 1;
    }

    .menu-items li {
      border-bottom: 1px solid var(--border-color);
    }

    .menu-items a {
      display: block;
      padding: 16px;
      color: var(--text-primary);
      text-decoration: none;
      font-size: 16px;
      transition: background 0.2s;
    }

    .menu-items a:active {
      background: var(--bg-secondary);
    }

    .workspace-tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border-color);
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      background: var(--bg-secondary);
    }

    .workspace-tab {
      flex: 0 0 auto;
      padding: 12px 16px;
      min-width: 100px;
      text-align: center;
      border-bottom: 3px solid transparent;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
      background: transparent;
      border: none;
      color: var(--text-primary);
      transition: all 0.2s;
    }

    .workspace-tab.active {
      border-bottom-color: var(--accent-color);
      color: var(--accent-color);
    }

    .breadcrumb {
      display: flex;
      gap: 4px;
      padding: 4px 8px;
      font-size: 12px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
    }

    .breadcrumb-item {
      white-space: nowrap;
      padding: 4px 8px;
    }

    .breadcrumb-item a {
      color: var(--accent-color);
      text-decoration: none;
    }

    .breadcrumb-item.active {
      color: var(--text-primary);
      font-weight: 500;
    }

    .breadcrumb-separator {
      opacity: 0.5;
    }

    .floating-action-button {
      position: fixed;
      bottom: 72px;
      right: 16px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--accent-color);
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      z-index: 170;
      transition: all 0.2s;
    }

    .floating-action-button:active {
      transform: scale(0.9);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .floating-action-button.hidden {
      display: none;
    }

    .fab-menu {
      position: fixed;
      bottom: 140px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 165;
      transition: opacity 0.3s;
    }

    .fab-menu.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .fab-item {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 20px;
      transition: all 0.2s;
    }

    .fab-item:active {
      transform: scale(0.9);
      background: var(--accent-color);
      color: white;
    }

    .context-menu-mobile {
      background: var(--bg-primary);
      border-top: 1px solid var(--border-color);
      z-index: 160;
      padding: 8px;
      max-height: 50vh;
      overflow-y: auto;
      border-radius: 12px 12px 0 0;
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.15);
    }

    .context-menu-mobile .menu-item {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      min-height: 48px;
    }

    .context-menu-mobile .menu-item:last-child {
      border-bottom: none;
    }

    .context-menu-mobile .menu-item:active {
      background: var(--bg-secondary);
    }

    .context-menu-mobile .menu-icon {
      font-size: 20px;
      opacity: 0.7;
    }

    @media (max-width: 599px) {
      .workspace-tabs {
        display: flex;
      }
    }

    @media (min-width: 600px) {
      .workspace-tabs {
        display: none;
      }

      .floating-action-button {
        display: none;
      }

      .fab-menu {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MobileNav;
}
