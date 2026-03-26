/**
 * collaboration-ui.js — UI Panel for Collaboration Features
 *
 * Provides a comprehensive right-panel UI for:
 * - Session management and sharing
 * - Participant list with presence indicators
 * - Chat interface with message history
 * - Version timeline and snapshot management
 * - Permissions dialog
 *
 * Integrates with collaboration.js via window.cycleCAD.collab
 */

let _collabModule = null;
let _panelOpen = false;

export function initCollaborationUI(collabModule) {
  _collabModule = collabModule;

  // Listen for collaboration events
  collabModule.on('session-created', onSessionCreated);
  collabModule.on('session-joined', onSessionJoined);
  collabModule.on('user-joined', onUserJoined);
  collabModule.on('message-sent', onMessageReceived);
  collabModule.on('snapshot-saved', onSnapshotSaved);

  // Create panel HTML
  createCollaborationPanel();

  // Wire button to panel toggle
  const collabBtn = document.getElementById('collab-btn');
  if (collabBtn) {
    collabBtn.addEventListener('click', toggleCollaborationPanel);
  }

  console.log('[Collab UI] Initialized');
}

/**
 * Create the collaboration panel HTML
 */
function createCollaborationPanel() {
  const panelHtml = `
    <div id="collaboration-panel" class="collab-panel" style="display: none;">
      <!-- Header -->
      <div class="collab-header">
        <h3>Collaboration</h3>
        <button id="collab-close" class="collab-close-btn" title="Close">✕</button>
      </div>

      <!-- Tabs -->
      <div class="collab-tabs">
        <button class="collab-tab active" data-tab="session">Session</button>
        <button class="collab-tab" data-tab="participants">Participants</button>
        <button class="collab-tab" data-tab="chat">Chat</button>
        <button class="collab-tab" data-tab="versions">Versions</button>
      </div>

      <!-- Tab Content -->
      <div class="collab-content">
        <!-- Session Tab -->
        <div id="session-tab" class="collab-tab-content active">
          <div class="session-controls">
            <button id="create-session-btn" class="collab-btn primary">Create Session</button>
            <button id="join-session-btn" class="collab-btn">Join Session</button>
          </div>

          <div id="session-info" style="display: none;">
            <div class="session-info-card">
              <label>Session ID</label>
              <div class="session-id-display">
                <code id="session-id-code"></code>
                <button id="copy-session-btn" class="copy-btn" title="Copy">📋</button>
              </div>

              <label style="margin-top: 12px;">Share Link</label>
              <div class="share-controls">
                <button id="generate-link-btn" class="collab-btn small">Generate Link</button>
                <button id="share-readonly-btn" class="collab-btn small">Read-Only Link</button>
              </div>

              <div id="share-link-display" style="display: none; margin-top: 12px;">
                <input type="text" id="share-link-input" class="share-link-input" readonly>
                <button id="copy-link-btn" class="copy-btn">📋</button>
              </div>

              <label style="margin-top: 12px;">Embed Code</label>
              <button id="generate-embed-btn" class="collab-btn small">Generate Embed</button>

              <div id="embed-display" style="display: none; margin-top: 12px;">
                <textarea id="embed-code" class="embed-code" readonly></textarea>
                <button id="copy-embed-btn" class="copy-btn">📋</button>
              </div>

              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
                <label>Participants: <span id="participant-count">1</span></label>
              </div>

              <button id="leave-session-btn" class="collab-btn danger" style="margin-top: 12px; width: 100%;">Leave Session</button>
            </div>
          </div>
        </div>

        <!-- Participants Tab -->
        <div id="participants-tab" class="collab-tab-content">
          <div id="participants-list" class="participants-list">
            <!-- Populated dynamically -->
          </div>
          <div style="margin-top: 12px;">
            <button id="start-agent-demo-btn" class="collab-btn small">Start Agent Demo</button>
            <button id="stop-agent-demo-btn" class="collab-btn small danger" style="display: none;">Stop Agents</button>
          </div>
        </div>

        <!-- Chat Tab -->
        <div id="chat-tab" class="collab-tab-content">
          <div id="chat-messages" class="chat-messages">
            <!-- Messages populated dynamically -->
          </div>
          <div class="chat-input-area">
            <input type="text" id="chat-input" class="chat-input" placeholder="Send message...">
            <button id="send-msg-btn" class="collab-btn small">Send</button>
          </div>
        </div>

        <!-- Versions Tab -->
        <div id="versions-tab" class="collab-tab-content">
          <div class="version-controls">
            <input type="text" id="snapshot-name-input" class="snapshot-input" placeholder="Snapshot name...">
            <button id="save-snapshot-btn" class="collab-btn small">Save</button>
          </div>

          <div id="snapshots-list" class="snapshots-list">
            <!-- Snapshots populated dynamically -->
          </div>
        </div>
      </div>
    </div>
  `;

  // Create container if it doesn't exist
  let container = document.getElementById('collab-panel-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'collab-panel-container';
    document.body.appendChild(container);
  }

  container.innerHTML = panelHtml;

  // Wire up event listeners
  wireUpEventListeners();

  // Add styles if not already present
  if (!document.getElementById('collab-styles')) {
    addCollaborationStyles();
  }
}

/**
 * Wire up all event listeners for the panel
 */
function wireUpEventListeners() {
  // Close button
  document.getElementById('collab-close').addEventListener('click', toggleCollaborationPanel);

  // Tab switching
  document.querySelectorAll('.collab-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      switchTab(tabName);
    });
  });

  // Session controls
  document.getElementById('create-session-btn').addEventListener('click', createNewSession);
  document.getElementById('join-session-btn').addEventListener('click', joinExistingSession);
  document.getElementById('leave-session-btn').addEventListener('click', leaveCurrentSession);

  // Share controls
  document.getElementById('generate-link-btn').addEventListener('click', generateShareLink);
  document.getElementById('share-readonly-btn').addEventListener('click', () => generateShareLink(true));
  document.getElementById('copy-link-btn').addEventListener('click', copyShareLink);
  document.getElementById('copy-session-btn').addEventListener('click', copySessionId);

  // Embed
  document.getElementById('generate-embed-btn').addEventListener('click', generateEmbedCode);
  document.getElementById('copy-embed-btn').addEventListener('click', copyEmbedCode);

  // Chat
  document.getElementById('send-msg-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // Snapshots
  document.getElementById('save-snapshot-btn').addEventListener('click', saveNewSnapshot);

  // Agent demo
  document.getElementById('start-agent-demo-btn').addEventListener('click', startAgentDemo);
  document.getElementById('stop-agent-demo-btn').addEventListener('click', stopAgentDemo);

  // Update UI
  updateSessionDisplay();
  updateParticipantsList();
  updateChatDisplay();
  updateSnapshotsList();
}

/**
 * Toggle collaboration panel visibility
 */
function toggleCollaborationPanel() {
  _panelOpen = !_panelOpen;
  const panel = document.getElementById('collaboration-panel');
  panel.style.display = _panelOpen ? 'flex' : 'none';
}

/**
 * Switch between tabs
 */
function switchTab(tabName) {
  // Deactivate all tabs
  document.querySelectorAll('.collab-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.collab-tab-content').forEach(content => {
    content.classList.remove('active');
  });

  // Activate selected tab
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

/**
 * Create a new collaboration session
 */
function createNewSession() {
  if (!_collabModule) return;

  const session = _collabModule.createSession({
    maxUsers: 10,
    readOnly: false
  });

  updateSessionDisplay();
  switchTab('session');
}

/**
 * Join an existing session
 */
function joinExistingSession() {
  const sessionId = prompt('Enter Session ID:');
  if (!sessionId) return;

  if (!_collabModule) return;

  const name = prompt('Enter your name:', 'User');
  const session = _collabModule.joinSession(sessionId, { name });

  updateSessionDisplay();
  switchTab('session');
}

/**
 * Leave current session
 */
function leaveCurrentSession() {
  if (confirm('Leave session?')) {
    if (_collabModule) {
      _collabModule.leaveSession();
    }
    updateSessionDisplay();
  }
}

/**
 * Update session display
 */
function updateSessionDisplay() {
  if (!_collabModule) return;

  const session = _collabModule.getSession();
  const infoDiv = document.getElementById('session-info');
  const controlsDiv = document.querySelector('.session-controls');

  if (session) {
    infoDiv.style.display = 'block';
    controlsDiv.style.display = 'none';

    document.getElementById('session-id-code').textContent = session.sessionId;
    document.getElementById('participant-count').textContent = _collabModule.listParticipants().length;
  } else {
    infoDiv.style.display = 'none';
    controlsDiv.style.display = 'block';
  }
}

/**
 * Generate share link
 */
function generateShareLink(readOnly = false) {
  if (!_collabModule) return;

  const link = _collabModule.generateShareLink({
    readOnly,
    expiry: '24h'
  });

  if (link) {
    const input = document.getElementById('share-link-input');
    input.value = link.url;
    document.getElementById('share-link-display').style.display = 'block';
  }
}

/**
 * Copy share link to clipboard
 */
function copyShareLink() {
  const input = document.getElementById('share-link-input');
  input.select();
  document.execCommand('copy');
  alert('Link copied to clipboard!');
}

/**
 * Copy session ID to clipboard
 */
function copySessionId() {
  const code = document.getElementById('session-id-code');
  const text = code.textContent;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/**
 * Generate embed code
 */
function generateEmbedCode() {
  if (!_collabModule) return;

  const embed = _collabModule.generateEmbedCode({
    width: 800,
    height: 600,
    showToolbar: true,
    showTree: true
  });

  if (embed) {
    document.getElementById('embed-code').value = embed.html;
    document.getElementById('embed-display').style.display = 'block';
  }
}

/**
 * Copy embed code to clipboard
 */
function copyEmbedCode() {
  const textarea = document.getElementById('embed-code');
  textarea.select();
  document.execCommand('copy');
  alert('Embed code copied to clipboard!');
}

/**
 * Update participants list display
 */
function updateParticipantsList() {
  if (!_collabModule) return;

  const list = document.getElementById('participants-list');
  const participants = _collabModule.listParticipants();

  list.innerHTML = participants.map(p => `
    <div class="participant-item">
      <div class="participant-avatar" style="background-color: ${p.avatar};" title="${p.name}"></div>
      <div class="participant-info">
        <div class="participant-name">${p.name} ${p.isLocalUser ? '(You)' : ''}</div>
        <div class="participant-status">${p.role} • ${p.status}</div>
      </div>
      ${!p.isLocalUser ? `<button class="participant-action-btn" data-user-id="${p.userId}">⋮</button>` : ''}
    </div>
  `).join('');

  // Wire participant action buttons
  document.querySelectorAll('.participant-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.target.dataset.userId;
      showParticipantMenu(userId);
    });
  });
}

/**
 * Show participant context menu
 */
function showParticipantMenu(userId) {
  const participant = _collabModule.listParticipants().find(p => p.userId === userId);
  if (!participant) return;

  const menu = prompt(`Menu for ${participant.name}:\n\n1. View Profile\n2. Change Role\n3. Kick User\n\nEnter option number:`, '1');

  if (menu === '2') {
    const newRole = prompt('New role (host/editor/viewer):', participant.role);
    if (newRole && _collabModule.setRole) {
      _collabModule.setRole(userId, newRole);
      updateParticipantsList();
    }
  }
}

/**
 * Send chat message
 */
function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();

  if (!text || !_collabModule) return;

  _collabModule.sendMessage(text);
  input.value = '';

  updateChatDisplay();

  // Scroll to bottom
  setTimeout(() => {
    const chatDiv = document.getElementById('chat-messages');
    chatDiv.scrollTop = chatDiv.scrollHeight;
  }, 100);
}

/**
 * Update chat display
 */
function updateChatDisplay() {
  if (!_collabModule) return;

  const messages = _collabModule.getMessageHistory();
  const chatDiv = document.getElementById('chat-messages');

  chatDiv.innerHTML = messages.map(msg => `
    <div class="chat-message">
      <div class="chat-message-header">
        <span class="chat-user-name" style="color: ${msg.userColor};">${msg.userName}</span>
        <span class="chat-timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>
      </div>
      <div class="chat-message-text">${escapeHtml(msg.text)}</div>
    </div>
  `).join('');
}

/**
 * Save new snapshot
 */
function saveNewSnapshot() {
  const input = document.getElementById('snapshot-name-input');
  const name = input.value.trim();

  if (!name || !_collabModule) return;

  _collabModule.saveSnapshot(name);
  input.value = '';

  updateSnapshotsList();
}

/**
 * Update snapshots list display
 */
function updateSnapshotsList() {
  if (!_collabModule) return;

  const snapshots = _collabModule.listSnapshots();
  const list = document.getElementById('snapshots-list');

  if (snapshots.length === 0) {
    list.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No snapshots yet</p>';
    return;
  }

  list.innerHTML = snapshots.map(snap => `
    <div class="snapshot-item">
      <div class="snapshot-info">
        <div class="snapshot-name">${snap.name}</div>
        <div class="snapshot-meta">${snap.userName} • ${snap.featureCount} features • ${snap.formattedTime}</div>
      </div>
      <button class="snapshot-action-btn" data-snap-id="${snap.snapshotId}">⋮</button>
    </div>
  `).join('');

  // Wire snapshot action buttons
  document.querySelectorAll('.snapshot-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const snapId = e.target.dataset.snapId;
      showSnapshotMenu(snapId);
    });
  });
}

/**
 * Show snapshot context menu
 */
function showSnapshotMenu(snapId) {
  const snapshots = _collabModule.listSnapshots();
  const snapshot = snapshots.find(s => s.snapshotId === snapId);
  if (!snapshot) return;

  const menu = prompt(`Menu for "${snapshot.name}":\n\n1. Load\n2. Duplicate\n3. Delete\n\nEnter option number:`, '1');

  if (menu === '1') {
    _collabModule.loadSnapshot(snapId);
    alert(`Loaded snapshot: ${snapshot.name}`);
  }
}

/**
 * Start agent demo
 */
function startAgentDemo() {
  if (_collabModule && _collabModule.startAgentDemo) {
    _collabModule.startAgentDemo();

    document.getElementById('start-agent-demo-btn').style.display = 'none';
    document.getElementById('stop-agent-demo-btn').style.display = 'inline-block';

    updateParticipantsList();
  }
}

/**
 * Stop agent demo
 */
function stopAgentDemo() {
  if (_collabModule && _collabModule.stopAgentDemo) {
    _collabModule.stopAgentDemo();

    document.getElementById('start-agent-demo-btn').style.display = 'inline-block';
    document.getElementById('stop-agent-demo-btn').style.display = 'none';

    updateParticipantsList();
  }
}

/**
 * Event callbacks
 */
function onSessionCreated(session) {
  console.log('[Collab UI] Session created');
  updateSessionDisplay();
}

function onSessionJoined(session) {
  console.log('[Collab UI] Session joined');
  updateSessionDisplay();
}

function onUserJoined(participant) {
  console.log('[Collab UI] User joined:', participant.name);
  updateParticipantsList();
}

function onMessageReceived(message) {
  updateChatDisplay();
}

function onSnapshotSaved(snapshot) {
  console.log('[Collab UI] Snapshot saved:', snapshot.name);
  updateSnapshotsList();
}

/**
 * Utility: escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Add CSS styles for collaboration panel
 */
function addCollaborationStyles() {
  const style = document.createElement('style');
  style.id = 'collab-styles';
  style.textContent = `
    .collab-panel {
      display: flex;
      flex-direction: column;
      position: fixed;
      right: 0;
      top: var(--toolbar-height);
      width: 380px;
      height: calc(100vh - var(--toolbar-height) - var(--statusbar-height));
      background: var(--bg-secondary);
      border-left: 1px solid var(--border-color);
      z-index: 100;
      box-shadow: var(--shadow-lg);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .collab-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .collab-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .collab-close-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 16px;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .collab-close-btn:hover {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .collab-tabs {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      gap: 0;
    }

    .collab-tab {
      flex: 1;
      padding: 10px 8px;
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      transition: all var(--transition-fast);
    }

    .collab-tab:hover {
      color: var(--text-primary);
      background: var(--bg-tertiary);
    }

    .collab-tab.active {
      color: var(--accent-blue);
      border-bottom-color: var(--accent-blue);
    }

    .collab-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }

    .collab-tab-content {
      display: none;
    }

    .collab-tab-content.active {
      display: block;
    }

    .collab-btn {
      background: var(--accent-blue);
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all var(--transition-fast);
      width: 100%;
    }

    .collab-btn:hover {
      background: var(--accent-blue-dark);
    }

    .collab-btn.small {
      padding: 6px 10px;
      font-size: 11px;
      width: auto;
    }

    .collab-btn.danger {
      background: var(--accent-red);
    }

    .collab-btn.danger:hover {
      background: #e63946;
    }

    .collab-btn.primary {
      background: var(--accent-green);
    }

    .collab-btn.primary:hover {
      background: #2d8659;
    }

    .session-controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .session-info-card {
      background: var(--bg-tertiary);
      padding: 12px;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }

    .session-info-card label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }

    .session-id-display {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .session-id-display code {
      flex: 1;
      background: var(--bg-primary);
      padding: 6px 8px;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      color: var(--accent-blue);
      word-break: break-all;
    }

    .copy-btn {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 14px;
      transition: all var(--transition-fast);
    }

    .copy-btn:hover {
      color: var(--text-primary);
      border-color: var(--accent-blue);
    }

    .share-controls {
      display: flex;
      gap: 6px;
    }

    .share-link-input,
    .embed-code {
      width: 100%;
      padding: 8px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      resize: none;
      margin-bottom: 6px;
    }

    .embed-code {
      height: 100px;
    }

    .participants-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .participant-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .participant-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .participant-info {
      flex: 1;
      min-width: 0;
    }

    .participant-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .participant-status {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .participant-action-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 14px;
      padding: 4px;
    }

    .participant-action-btn:hover {
      color: var(--text-primary);
    }

    .chat-messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: 300px;
      overflow-y: auto;
      margin-bottom: 12px;
      padding: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .chat-message {
      background: var(--bg-primary);
      padding: 8px;
      border-radius: 4px;
      border-left: 3px solid var(--accent-blue);
    }

    .chat-message-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }

    .chat-user-name {
      font-size: 11px;
      font-weight: 600;
    }

    .chat-timestamp {
      font-size: 10px;
      color: var(--text-secondary);
    }

    .chat-message-text {
      font-size: 12px;
      color: var(--text-primary);
      line-height: 1.4;
      word-break: break-word;
    }

    .chat-input-area {
      display: flex;
      gap: 6px;
    }

    .chat-input {
      flex: 1;
      padding: 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
    }

    .chat-input::placeholder {
      color: var(--text-secondary);
    }

    .chat-input:focus {
      outline: none;
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.1);
    }

    .version-controls {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }

    .snapshot-input {
      flex: 1;
      padding: 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 12px;
    }

    .snapshot-input::placeholder {
      color: var(--text-secondary);
    }

    .snapshots-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .snapshot-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      border: 1px solid var(--border-color);
    }

    .snapshot-info {
      flex: 1;
    }

    .snapshot-name {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .snapshot-meta {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .snapshot-action-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 14px;
      padding: 4px;
    }

    .snapshot-action-btn:hover {
      color: var(--text-primary);
    }
  `;

  document.head.appendChild(style);
}

export { initCollaborationUI, toggleCollaborationPanel };
