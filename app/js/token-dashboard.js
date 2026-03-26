/**
 * token-dashboard.js — Token Engine UI Dashboard for cycleCAD
 *
 * Provides a rich UI for:
 * - Balance display with tier badge
 * - Recent transactions
 * - Monthly usage chart
 * - Tier information and upgrade buttons
 * - Purchase tokens dialog
 * - Operation price estimator
 */

export function initTokenDashboard() {
  // Create panel HTML
  const panelHTML = `
    <div id="tab-tokens" style="display: none; padding: 12px; overflow-y: auto;">
      <!-- Balance Card -->
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px;">Balance</div>
        <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px;">
          <div id="token-balance-value" style="font-size: 28px; font-weight: bold; color: var(--accent-blue);">1,000</div>
          <div style="color: var(--text-secondary); font-size: 13px;">tokens</div>
          <div id="token-tier-badge" style="margin-left: auto; padding: 2px 8px; border-radius: 3px; background: rgba(152,152,152,0.2); color: #999; font-size: 10px; font-weight: 600; text-transform: uppercase;">FREE</div>
        </div>
        <div style="font-size: 11px; color: var(--text-secondary);">
          <span id="token-monthly">0</span> / <span id="token-monthly-max">1,000</span> this month
        </div>
      </div>

      <!-- Quick Actions -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px;">
        <button id="btn-estimate-op" style="
          padding: 8px; border: 1px solid var(--border-color); background: var(--bg-tertiary);
          border-radius: 4px; color: var(--text-primary); font-size: 11px; cursor: pointer;
          transition: all 150ms; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        " onmouseover="this.style.background='var(--bg-primary)'" onmouseout="this.style.background='var(--bg-tertiary)'">
          📊 Estimate Price
        </button>
        <button id="btn-buy-tokens" style="
          padding: 8px; border: 1px solid var(--accent-blue); background: rgba(88,166,255,0.1);
          border-radius: 4px; color: var(--accent-blue); font-size: 11px; cursor: pointer;
          transition: all 150ms; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;
        " onmouseover="this.style.background='rgba(88,166,255,0.2)'" onmouseout="this.style.background='rgba(88,166,255,0.1)'">
          💳 Buy Tokens
        </button>
      </div>

      <!-- Tier Info -->
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11px;">
        <div style="color: var(--text-secondary); margin-bottom: 6px; font-weight: 500;">YOUR TIER</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <div style="color: var(--text-muted); font-size: 10px;">Monthly Allowance</div>
            <div style="font-weight: 600; margin-top: 2px;"><span id="token-allowance">1,000</span> tokens</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 10px;">Creator Royalty</div>
            <div style="font-weight: 600; margin-top: 2px;" id="token-royalty">70%</div>
          </div>
        </div>
        <button id="btn-upgrade-tier" style="
          margin-top: 8px; width: 100%; padding: 6px; border: 1px solid var(--accent-green);
          background: rgba(63,185,80,0.1); border-radius: 4px; color: var(--accent-green);
          font-size: 11px; font-weight: 500; cursor: pointer; transition: all 150ms;
        " onmouseover="this.style.background='rgba(63,185,80,0.2)'" onmouseout="this.style.background='rgba(63,185,80,0.1)'">
          Upgrade to PRO (€49/mo)
        </button>
      </div>

      <!-- Recent Transactions -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; font-weight: 500;">Recent Activity</div>
        <div id="token-activity-list" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; max-height: 120px; overflow-y: auto;">
          <div style="padding: 12px; color: var(--text-secondary); text-align: center; font-size: 11px;">No transactions yet</div>
        </div>
      </div>

      <!-- Usage by Operation -->
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; font-weight: 500;">Top Operations (This Month)</div>
        <div id="token-usage-list" style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; max-height: 100px; overflow-y: auto;">
          <div style="padding: 12px; color: var(--text-secondary); text-align: center; font-size: 11px;">No operations yet</div>
        </div>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid var(--border-color); padding-top: 8px; text-align: center;">
        <button id="btn-token-history" style="
          background: none; border: none; color: var(--accent-blue); cursor: pointer; font-size: 11px;
          text-decoration: underline; opacity: 0.7; transition: opacity 150ms;
        " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">
          View full history
        </button>
      </div>
    </div>
  `;

  return {
    html: panelHTML,
    init: initTokenDashboardEvents,
    update: updateTokenDashboard,
  };
}

/**
 * Initialize event handlers for token dashboard
 */
function initTokenDashboardEvents() {
  // Estimate price button
  document.getElementById('btn-estimate-op')?.addEventListener('click', () => {
    showEstimateDialog();
  });

  // Buy tokens button
  document.getElementById('btn-buy-tokens')?.addEventListener('click', () => {
    showPurchaseDialog();
  });

  // Upgrade tier button
  document.getElementById('btn-upgrade-tier')?.addEventListener('click', () => {
    showUpgradeDialog();
  });

  // History button
  document.getElementById('btn-token-history')?.addEventListener('click', () => {
    showHistoryModal();
  });

  // Subscribe to token engine events
  if (window.cycleCAD?.tokens) {
    window.cycleCAD.tokens.on('token-spent', () => updateTokenDashboard());
    window.cycleCAD.tokens.on('token-added', () => updateTokenDashboard());
    window.cycleCAD.tokens.on('month-reset', () => updateTokenDashboard());
    window.cycleCAD.tokens.on('tier-changed', () => updateTokenDashboard());
  }

  updateTokenDashboard();
}

/**
 * Update dashboard display
 */
function updateTokenDashboard() {
  if (!window.cycleCAD?.tokens) return;

  const info = window.cycleCAD.tokens.getBalanceInfo();
  const history = window.cycleCAD.tokens.getTransactionHistory({ limit: 5 });
  const usage = window.cycleCAD.tokens.getUsageByOperation();

  // Update balance
  document.getElementById('token-balance-value').textContent = formatNumber(info.balance);
  document.getElementById('token-tier-badge').textContent = info.tier;
  document.getElementById('token-tier-badge').style.background = info.tierColor + '22';
  document.getElementById('token-tier-badge').style.color = info.tierColor;

  // Update monthly usage
  document.getElementById('token-monthly').textContent = formatNumber(info.usedThisMonth);
  document.getElementById('token-monthly-max').textContent = formatNumber(info.monthlyAllowance);

  // Update tier info
  document.getElementById('token-allowance').textContent = formatNumber(info.monthlyAllowance);
  document.getElementById('token-royalty').textContent = info.creatorRoyalty;

  // Update recent activity
  const activityList = document.getElementById('token-activity-list');
  if (history.length > 0) {
    activityList.innerHTML = history.map(t => `
      <div style="
        padding: 6px 8px; border-bottom: 1px solid var(--border-color);
        display: flex; justify-content: space-between; align-items: center; font-size: 10px;
      ">
        <div>
          <div style="color: var(--text-primary);">${escapeHtml(t.operation)}</div>
          <div style="color: var(--text-muted); margin-top: 2px;">${new Date(t.timestamp).toLocaleDateString()}</div>
        </div>
        <div style="text-align: right; font-weight: 500;">
          <div style="color: ${t.type === 'debit' ? 'var(--accent-red)' : 'var(--accent-green)';};">
            ${t.type === 'debit' ? '-' : '+'}${t.amount}
          </div>
          <div style="color: var(--text-secondary); margin-top: 2px;">Balance: ${formatNumber(t.balance_after)}</div>
        </div>
      </div>
    `).join('');
  } else {
    activityList.innerHTML = '<div style="padding: 12px; color: var(--text-secondary); text-align: center; font-size: 11px;">No transactions yet</div>';
  }

  // Update top operations
  const usageList = document.getElementById('token-usage-list');
  const topOps = Object.entries(usage)
    .sort(([, a], [, b]) => b.totalTokens - a.totalTokens)
    .slice(0, 5);

  if (topOps.length > 0) {
    usageList.innerHTML = topOps.map(([op, stats]) => `
      <div style="
        padding: 6px 8px; border-bottom: 1px solid var(--border-color);
        display: flex; justify-content: space-between; align-items: center; font-size: 10px;
      ">
        <div style="color: var(--text-primary);">${escapeHtml(op)}</div>
        <div style="text-align: right;">
          <div style="font-weight: 600;">${stats.totalTokens} tokens</div>
          <div style="color: var(--text-secondary);">${stats.count}x</div>
        </div>
      </div>
    `).join('');
  } else {
    usageList.innerHTML = '<div style="padding: 12px; color: var(--text-secondary); text-align: center; font-size: 11px;">No operations yet</div>';
  }
}

// ============================================================================
// Dialog Functions
// ============================================================================

function showEstimateDialog() {
  const backdrop = document.getElementById('dialog-backdrop');
  if (!backdrop) return;

  const operations = [
    { id: 'model.export.stl', name: 'Export as STL', price: 2 },
    { id: 'model.export.step', name: 'Export as STEP', price: 10 },
    { id: 'model.export.gltf', name: 'Export as glTF', price: 3 },
    { id: 'ai.identify.part', name: 'AI Part Identifier', price: 5 },
    { id: 'ai.design_review', name: 'AI Design Review', price: 15 },
    { id: 'cam.slice.model', name: 'Slice for 3D Print', price: 20 },
    { id: 'analysis.weight', name: 'Weight Estimation', price: 2 },
    { id: 'analysis.cost', name: 'Cost Analysis', price: 5 },
  ];

  const dialog = document.createElement('div');
  dialog.className = 'operation-dialog';
  dialog.style.zIndex = '10001';
  dialog.innerHTML = `
    <div class="dialog-header">
      <div class="dialog-title">Estimate Operation Cost</div>
      <div class="dialog-close-btn" onclick="this.closest('.operation-dialog').remove()">✕</div>
    </div>
    <div class="dialog-content">
      <div class="dialog-form-group">
        <label class="dialog-label">Operation</label>
        <select class="dialog-select" id="estimate-operation" onchange="updateEstimatePreview()">
          ${operations.map(op => `<option value="${op.id}">${op.name}</option>`).join('')}
        </select>
      </div>
      <div class="dialog-form-group">
        <label class="dialog-label">Batch Size</label>
        <input type="number" class="dialog-input" id="estimate-batch" value="1" min="1" onchange="updateEstimatePreview()">
      </div>
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; padding: 10px; margin-top: 10px;">
        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">ESTIMATED COST</div>
        <div style="font-size: 20px; font-weight: bold; color: var(--accent-blue); margin-bottom: 4px;">
          <span id="estimate-price">2</span> tokens
        </div>
        <div style="font-size: 10px; color: var(--text-secondary);">
          €<span id="estimate-euros">0.02</span> · <span id="estimate-discount">no discount</span>
        </div>
      </div>
    </div>
    <div class="dialog-footer">
      <button class="dialog-button secondary" onclick="this.closest('.operation-dialog').remove()">Close</button>
    </div>
  `;

  document.body.appendChild(dialog);
  backdrop.style.display = 'block';

  // Initial preview
  window.updateEstimatePreview = () => {
    const opId = document.getElementById('estimate-operation')?.value;
    const batchSize = parseInt(document.getElementById('estimate-batch')?.value || 1);
    if (!window.cycleCAD?.tokens || !opId) return;

    const estimate = window.cycleCAD.tokens.estimateOperation(opId, { batchSize });
    document.getElementById('estimate-price').textContent = estimate.finalPrice;
    document.getElementById('estimate-euros').textContent = (estimate.finalPrice / 100).toFixed(2);
    document.getElementById('estimate-discount').textContent =
      estimate.batchDiscount > 0 ? `${estimate.batchDiscount}% batch discount` : 'no discount';
  };

  window.updateEstimatePreview();

  // Close on backdrop click
  backdrop.onclick = (e) => {
    if (e.target === backdrop) {
      backdrop.style.display = 'none';
      dialog.remove();
    }
  };
}

function showPurchaseDialog() {
  const backdrop = document.getElementById('dialog-backdrop');
  if (!backdrop) return;

  const presets = [
    { tokens: 1000, euros: 10, label: '1,000 tokens' },
    { tokens: 5000, euros: 50, label: '5,000 tokens (save €0.50)' },
    { tokens: 10000, euros: 90, label: '10,000 tokens (save €10)' },
  ];

  const dialog = document.createElement('div');
  dialog.className = 'operation-dialog';
  dialog.style.zIndex = '10001';
  dialog.innerHTML = `
    <div class="dialog-header">
      <div class="dialog-title">Purchase Tokens</div>
      <div class="dialog-close-btn" onclick="this.closest('.operation-dialog').remove()">✕</div>
    </div>
    <div class="dialog-content">
      <div class="dialog-form-group">
        <label class="dialog-label">Choose Package</label>
        <div style="display: grid; grid-template-columns: 1fr; gap: 6px;">
          ${presets.map((p, i) => `
            <button type="button" style="
              padding: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary);
              border-radius: 4px; color: var(--text-primary); cursor: pointer; text-align: left;
              transition: all 150ms;
            " onmouseover="this.style.background='rgba(88,166,255,0.1)'; this.style.borderColor='var(--accent-blue)'"
               onmouseout="this.style.background='var(--bg-tertiary)'; this.style.borderColor='var(--border-color)'"
               onclick="selectTokenPackage(${p.tokens})">
              <div style="font-weight: 500; margin-bottom: 2px;">${p.label}</div>
              <div style="font-size: 11px; color: var(--text-secondary);">€${p.euros.toFixed(2)}</div>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="dialog-form-group">
        <label class="dialog-label">Custom Amount</label>
        <input type="number" class="dialog-input" id="custom-tokens" placeholder="100" min="10" value="100">
      </div>
      <div style="background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; padding: 10px; margin-top: 10px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: var(--text-secondary);">Total:</span>
          <span id="purchase-total" style="font-weight: 600; font-size: 14px;">€1.00</span>
        </div>
      </div>
      <div style="font-size: 10px; color: var(--text-secondary); margin-top: 10px; line-height: 1.6;">
        Conversion: 1 token = €0.01 · Payment via Stripe
      </div>
    </div>
    <div class="dialog-footer">
      <button class="dialog-button secondary" onclick="this.closest('.operation-dialog').remove()">Cancel</button>
      <button class="dialog-button primary" onclick="completePurchaseFlow()">Proceed to Checkout</button>
    </div>
  `;

  document.body.appendChild(dialog);
  backdrop.style.display = 'block';

  window.selectTokenPackage = (tokens) => {
    document.getElementById('custom-tokens').value = tokens;
    updatePurchasePreview();
  };

  window.updatePurchasePreview = () => {
    const tokens = parseInt(document.getElementById('custom-tokens')?.value || 100);
    const euros = (tokens / 100).toFixed(2);
    document.getElementById('purchase-total').textContent = `€${euros}`;
  };

  window.completePurchaseFlow = () => {
    const tokens = parseInt(document.getElementById('custom-tokens')?.value || 100);
    if (window.cycleCAD?.tokens) {
      const session = window.cycleCAD.tokens.purchaseTokens(tokens, 'stripe');
      alert(`Purchase initiated!\nTokens: ${tokens}\nURL: ${session.stripeCheckoutUrl}\n\n(Demo mode — would open Stripe checkout)`);
    }
    dialog.remove();
  };

  // Close on backdrop click
  backdrop.onclick = (e) => {
    if (e.target === backdrop) {
      backdrop.style.display = 'none';
      dialog.remove();
    }
  };

  updatePurchasePreview();
}

function showUpgradeDialog() {
  const backdrop = document.getElementById('dialog-backdrop');
  if (!backdrop) return;

  const tiers = [
    {
      name: 'FREE',
      price: 'Free',
      tokens: 1000,
      royalty: '70%',
      features: ['1,000 tokens/month', 'Basic exports', 'Community support'],
    },
    {
      name: 'PRO',
      price: '€49/mo',
      tokens: 10000,
      royalty: '80%',
      features: ['10,000 tokens/month', 'STEP import/export', 'AI design review', 'Priority support'],
      highlight: true,
    },
    {
      name: 'ENTERPRISE',
      price: '€299/mo',
      tokens: 100000,
      royalty: '90%',
      features: ['100,000 tokens/month', 'Unlimited STEP', 'Advanced analytics', 'SLA & support', 'Custom integrations'],
    },
  ];

  const dialog = document.createElement('div');
  dialog.className = 'operation-dialog';
  dialog.style.zIndex = '10001';
  dialog.style.maxWidth = '600px';
  dialog.innerHTML = `
    <div class="dialog-header">
      <div class="dialog-title">Upgrade to Higher Tier</div>
      <div class="dialog-close-btn" onclick="this.closest('.operation-dialog').remove()">✕</div>
    </div>
    <div class="dialog-content" style="max-height: 400px; overflow-y: auto;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px;">
        ${tiers.map(tier => `
          <div style="
            border: 2px solid ${tier.highlight ? 'var(--accent-blue)' : 'var(--border-color)'};
            border-radius: 6px; padding: 12px; background: ${tier.highlight ? 'rgba(88,166,255,0.05)' : 'var(--bg-tertiary)'};
            position: relative;
          ">
            ${tier.highlight ? '<div style="position: absolute; top: -10px; right: 12px; background: var(--accent-blue); color: white; padding: 2px 8px; font-size: 9px; border-radius: 3px; font-weight: 600;">POPULAR</div>' : ''}
            <div style="font-weight: 600; margin-bottom: 4px; font-size: 12px;">${tier.name}</div>
            <div style="font-size: 14px; font-weight: bold; color: var(--accent-blue); margin-bottom: 8px;">${tier.price}</div>
            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 6px;">
              <div>${tier.tokens.toLocaleString()} tokens/month</div>
              <div>${tier.royalty} creator royalty</div>
            </div>
            <div style="border-top: 1px solid var(--border-color); padding-top: 8px;">
              ${tier.features.map(f => `<div style="font-size: 9px; color: var(--text-secondary); margin-bottom: 3px;">✓ ${f}</div>`).join('')}
            </div>
            <button style="
              margin-top: 8px; width: 100%; padding: 6px; border: 1px solid ${tier.highlight ? 'var(--accent-blue)' : 'var(--border-color)'};
              background: ${tier.highlight ? 'rgba(88,166,255,0.1)' : 'var(--bg-primary)'}; border-radius: 3px;
              color: ${tier.highlight ? 'var(--accent-blue)' : 'var(--text-primary)'}; font-size: 10px; cursor: pointer;
              transition: all 150ms;
            " onclick="upgradeTo('${tier.name}')"
               onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
              ${tier.name === 'FREE' ? 'Current' : 'Upgrade'}
            </button>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="dialog-footer">
      <button class="dialog-button secondary" onclick="this.closest('.operation-dialog').remove()">Cancel</button>
    </div>
  `;

  document.body.appendChild(dialog);
  backdrop.style.display = 'block';

  window.upgradeTo = (tier) => {
    if (window.cycleCAD?.tokens) {
      window.cycleCAD.tokens.setTier(tier);
      alert(`Upgraded to ${tier} tier! Refreshing dashboard...`);
      updateTokenDashboard();
      dialog.remove();
    }
  };

  backdrop.onclick = (e) => {
    if (e.target === backdrop) {
      backdrop.style.display = 'none';
      dialog.remove();
    }
  };
}

function showHistoryModal() {
  if (!window.cycleCAD?.tokens) return;

  const history = window.cycleCAD.tokens.getTransactionHistory({ limit: 100 });
  const backdrop = document.getElementById('dialog-backdrop');
  if (!backdrop) return;

  const dialog = document.createElement('div');
  dialog.className = 'operation-dialog';
  dialog.style.zIndex = '10001';
  dialog.style.maxWidth = '500px';
  dialog.innerHTML = `
    <div class="dialog-header">
      <div class="dialog-title">Token Transaction History</div>
      <div class="dialog-close-btn" onclick="this.closest('.operation-dialog').remove()">✕</div>
    </div>
    <div class="dialog-content" style="max-height: 400px; overflow-y: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <th style="text-align: left; padding: 6px; color: var(--text-secondary); font-weight: 500;">Date</th>
            <th style="text-align: left; padding: 6px; color: var(--text-secondary); font-weight: 500;">Operation</th>
            <th style="text-align: right; padding: 6px; color: var(--text-secondary); font-weight: 500;">Amount</th>
            <th style="text-align: right; padding: 6px; color: var(--text-secondary); font-weight: 500;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(t => `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 6px; color: var(--text-secondary);">${new Date(t.timestamp).toLocaleDateString()}</td>
              <td style="padding: 6px; color: var(--text-primary);">${escapeHtml(t.operation)}</td>
              <td style="text-align: right; padding: 6px; color: ${t.type === 'debit' ? 'var(--accent-red)' : 'var(--accent-green)'}; font-weight: 500;">${t.type === 'debit' ? '-' : '+'}${t.amount}</td>
              <td style="text-align: right; padding: 6px; color: var(--text-secondary);">${formatNumber(t.balance_after)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="dialog-footer">
      <button class="dialog-button secondary" onclick="this.closest('.operation-dialog').remove()">Close</button>
      <button class="dialog-button primary" onclick="exportTokenHistory()">Export CSV</button>
    </div>
  `;

  document.body.appendChild(dialog);
  backdrop.style.display = 'block';

  window.exportTokenHistory = () => {
    const csv = [
      ['Date', 'Operation', 'Type', 'Amount', 'Balance'],
      ...history.map(t => [
        new Date(t.timestamp).toLocaleDateString(),
        t.operation,
        t.type,
        t.amount,
        t.balance_after,
      ]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyclecad-tokens-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  backdrop.onclick = (e) => {
    if (e.target === backdrop) {
      backdrop.style.display = 'none';
      dialog.remove();
    }
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatNumber(num) {
  return num.toLocaleString();
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}
