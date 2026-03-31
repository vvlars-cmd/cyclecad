/**
 * Billing UI Module - User interface for Stripe billing
 * Provides pricing page, upgrade modals, usage dashboard, and feature gates
 */

const BillingUI = {
  /**
   * Show pricing comparison page
   * 3-column layout with Free, Pro, and Enterprise tiers
   */
  showPricingPage() {
    const html = `
      <div class="billing-pricing-page">
        <div class="pricing-header">
          <h2>Simple, Transparent Pricing</h2>
          <p>Choose the plan that's right for you</p>

          <div class="billing-toggle">
            <label>
              <input type="radio" name="billing-cycle" value="monthly" checked onchange="BillingUI.updatePricing('monthly')">
              Monthly
            </label>
            <label>
              <input type="radio" name="billing-cycle" value="yearly" onchange="BillingUI.updatePricing('yearly')">
              Yearly (Save 20%)
            </label>
          </div>
        </div>

        <div class="pricing-grid">
          ${['free', 'pro', 'enterprise'].map(tierId => this.getPricingCard(tierId)).join('')}
        </div>

        <div class="pricing-faq">
          <h3>Frequently Asked Questions</h3>
          <div class="faq-item">
            <h4>Can I try Pro before paying?</h4>
            <p>Yes! Get 14 days free to try all Pro features. Cancel anytime before trial ends.</p>
          </div>
          <div class="faq-item">
            <h4>What's included in each tier?</h4>
            <p>See the comparison table above. Free is perfect for learning. Pro for professionals. Enterprise for teams.</p>
          </div>
          <div class="faq-item">
            <h4>Can I change plans?</h4>
            <p>Yes! Upgrade or downgrade anytime. Changes take effect at next billing cycle.</p>
          </div>
          <div class="faq-item">
            <h4>Do you offer discounts?</h4>
            <p>Yes! Students (STUDENT20), nonprofits (NONPROFIT30), and volume discounts available.</p>
          </div>
        </div>
      </div>
    `;

    return {
      id: 'pricing-page',
      title: 'Pricing',
      html,
      styles: this.getPricingStyles()
    };
  },

  /**
   * Get pricing card HTML for a tier
   */
  getPricingCard(tierId) {
    const tier = window.BillingModule?.tiers?.[tierId];
    if (!tier) return '';

    const isCurrent = window.BillingModule?.state?.tier === tierId;
    const isEnterprise = tierId === 'enterprise';

    return `
      <div class="pricing-card ${tierId} ${isCurrent ? 'current' : ''}">
        ${isCurrent ? '<div class="current-badge">Current Plan</div>' : ''}
        <h3 class="tier-name">${tier.name}</h3>
        <p class="tier-description">${tier.description}</p>

        <div class="pricing-amount">
          ${tierId === 'free' ?
            '<span class="price">€0</span><span class="period">/month</span>' :
            '<span class="price">€' + (Math.round((tier.price || tier.priceYearly) / 100 * 10) / 10) + '</span><span class="period">/month</span>'
          }
        </div>

        <ul class="features-list">
          ${tier.features.map(f => `<li><span class="check">✓</span>${f}</li>`).join('')}
        </ul>

        <div class="pricing-actions">
          ${tierId === 'free' ?
            '<button class="btn btn-secondary" disabled>Your Current Plan</button>' :
            `<button class="btn btn-primary" onclick="window.BillingModule.startCheckout('${tierId}', 'monthly')">
              ${isCurrent ? 'Manage Plan' : 'Start Free Trial'}
            </button>`
          }
        </div>
      </div>
    `;
  },

  /**
   * Show upgrade prompt modal when user hits limit
   */
  showUpgradeModal(feature, context = '') {
    const check = window.BillingModule?.checkLimit(feature);

    const html = `
      <div class="billing-modal-overlay" onclick="this.closest('.billing-modal-container')?.remove()">
        <div class="billing-modal" onclick="event.stopPropagation()">
          <button class="modal-close" onclick="this.closest('.billing-modal-container')?.remove()">✕</button>

          <div class="modal-icon">📦</div>
          <h3>You've Hit Your Limit</h3>
          <p class="limit-message">${check?.message || 'Upgrade to continue using this feature'}</p>
          ${context ? `<p class="context-message">${context}</p>` : ''}

          <div class="upgrade-options">
            <button class="btn btn-option" onclick="window.BillingModule.startCheckout('pro', 'monthly')">
              <div class="option-name">Pro</div>
              <div class="option-price">€49/month</div>
              <div class="option-features">Unlimited projects, 500 AI requests/day</div>
            </button>
            <button class="btn btn-option" onclick="window.BillingModule.startCheckout('enterprise', 'monthly')">
              <div class="option-name">Enterprise</div>
              <div class="option-price">€299/month</div>
              <div class="option-features">Everything + custom branding, SSO, self-hosting</div>
            </button>
          </div>

          <div class="modal-footer">
            <button class="btn btn-text" onclick="this.closest('.billing-modal-container')?.remove()">Maybe later</button>
            <a href="#pricing" class="btn btn-text">View all plans</a>
          </div>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.className = 'billing-modal-container';
    container.innerHTML = html;
    document.body.appendChild(container);
  },

  /**
   * Show usage dashboard with charts and warnings
   */
  getUsageDashboard() {
    const tier = window.BillingModule?.getCurrentTier();
    const usage = window.BillingModule?.getUsage();

    if (!tier || !usage) return '';

    const usageItems = [
      { name: 'Projects', current: usage.projects, limit: tier.limits.projects, icon: '📁' },
      { name: 'Storage', current: usage.storageGB, limit: tier.limits.storageGB, icon: '💾', unit: 'GB' },
      { name: 'AI Requests/Day', current: usage.aiRequestsToday, limit: tier.limits.aiRequestsPerDay, icon: '🤖' },
      { name: 'Parts', current: usage.totalParts, limit: tier.limits.partsPerProject, icon: '⚙️' }
    ];

    return `
      <div class="usage-dashboard">
        <h3>Current Usage</h3>

        ${usageItems.map(item => {
          const percentage = item.limit === Infinity ? 0 : Math.round((item.current / item.limit) * 100);
          const warning = percentage >= 80;
          const exceeded = percentage > 100;

          return `
            <div class="usage-item ${warning ? 'warning' : ''} ${exceeded ? 'exceeded' : ''}">
              <div class="usage-header">
                <span class="icon">${item.icon}</span>
                <span class="name">${item.name}</span>
                <span class="values">${item.current} ${item.unit || ''} / ${item.limit === Infinity ? '∞' : item.limit}</span>
              </div>
              <div class="usage-bar">
                <div class="bar-fill" style="width: ${Math.min(percentage, 100)}%; background: ${
                  exceeded ? '#F56565' : warning ? '#F6AD55' : '#48BB78'
                }"></div>
              </div>
              <div class="usage-percent">${percentage}% used</div>
              ${warning && item.limit !== Infinity ?
                `<div class="usage-warning">Approaching limit - consider upgrading</div>` :
                ''
              }
            </div>
          `;
        }).join('')}

        <div class="usage-actions">
          <button class="btn btn-secondary" onclick="window.BillingModule.exportUsageCSV()">
            Export as CSV
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Show subscription status card
   */
  getSubscriptionStatus() {
    const state = window.BillingModule?.state;
    const tier = window.BillingModule?.getCurrentTier();

    if (!state || !tier) return '';

    const daysUntilRenewal = Math.ceil((state.currentPeriodEnd - Date.now()) / (1000 * 60 * 60 * 24));
    const daysUntilTrialExpires = state.trialEndsAt ?
      Math.ceil((state.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    return `
      <div class="subscription-status">
        <div class="status-card">
          <h3>${tier.name} Plan</h3>

          <div class="status-badge ${state.status}">
            ${state.status.replace('_', ' ').toUpperCase()}
          </div>

          <div class="status-details">
            ${daysUntilTrialExpires !== null && daysUntilTrialExpires > 0 ? `
              <div class="detail-item">
                <span class="label">Trial Ends In:</span>
                <span class="value">${daysUntilTrialExpires} days</span>
              </div>
            ` : ''}

            ${state.currentPeriodEnd ? `
              <div class="detail-item">
                <span class="label">Next Billing Date:</span>
                <span class="value">${new Date(state.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
            ` : ''}

            <div class="detail-item">
              <span class="label">Billing Cycle:</span>
              <span class="value">${state.billingCycle === 'yearly' ? 'Yearly (20% discount)' : 'Monthly'}</span>
            </div>
          </div>

          ${state.cancelAtPeriodEnd ? `
            <div class="cancel-notice">
              ⚠️ Your subscription will be canceled on ${new Date(state.currentPeriodEnd).toLocaleDateString()}
            </div>
          ` : ''}

          <div class="status-actions">
            <button class="btn btn-secondary" onclick="window.BillingModule.openCustomerPortal()">
              Manage Subscription
            </button>
            ${state.tier !== 'enterprise' ? `
              <button class="btn btn-primary" onclick="window.BillingModule.showUpgradePrompt('storage')">
                Upgrade Plan
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Show trial banner at top of app
   */
  getTrialBanner() {
    const state = window.BillingModule?.state;

    if (state?.status !== 'trialing' || !state?.trialEndsAt) return '';

    const daysLeft = Math.ceil((state.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24));
    const percentage = Math.max(0, Math.round((daysLeft / 14) * 100));

    return `
      <div class="trial-banner">
        <div class="banner-content">
          <span class="banner-icon">⏰</span>
          <div class="banner-text">
            <strong>Free Trial Active</strong>
            <p>${daysLeft} days remaining - Your trial expires on ${new Date(state.trialEndsAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div class="banner-progress">
          <div class="progress-bar" style="width: ${percentage}%"></div>
        </div>
        <button class="banner-action" onclick="window.BillingModule.openCustomerPortal()">
          Add Payment Method
        </button>
      </div>
    `;
  },

  /**
   * Feature gate overlay (lock icon + upgrade prompt)
   */
  getFeatureGateOverlay(featureName) {
    const hasFeature = window.BillingModule?.hasFeature(featureName);

    if (hasFeature) return '';

    return `
      <div class="feature-gate-overlay" onclick="window.BillingModule.showUpgradePrompt('${featureName}')">
        <div class="gate-content">
          <span class="gate-icon">🔒</span>
          <span class="gate-text">Pro Feature</span>
        </div>
      </div>
    `;
  },

  /**
   * Payment method form
   */
  getPaymentForm() {
    return `
      <div class="payment-form">
        <h3>Payment Method</h3>

        <div class="form-group">
          <label>Cardholder Name</label>
          <input type="text" placeholder="John Doe" class="form-input">
        </div>

        <div class="form-group">
          <label>Card Number</label>
          <input type="text" placeholder="4242 4242 4242 4242" class="form-input card-input">
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Expiration</label>
            <input type="text" placeholder="MM/YY" class="form-input">
          </div>
          <div class="form-group">
            <label>CVV</label>
            <input type="text" placeholder="123" class="form-input">
          </div>
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" checked>
            Use this as my default payment method
          </label>
        </div>

        <button class="btn btn-primary" style="width: 100%;">Save Payment Method</button>
      </div>
    `;
  },

  /**
   * Promo code input
   */
  getPromoCodeInput() {
    return `
      <div class="promo-code-section">
        <h3>Have a Promo Code?</h3>
        <div class="promo-input-group">
          <input
            type="text"
            id="promo-code-input"
            placeholder="Enter promo code"
            class="form-input"
            onkeypress="if(event.key==='Enter') BillingUI.applyPromoCode()"
          >
          <button class="btn btn-secondary" onclick="BillingUI.applyPromoCode()">Apply</button>
        </div>
        <div id="promo-message" style="font-size: 12px; margin-top: 8px;"></div>
      </div>
    `;
  },

  /**
   * Apply promo code
   */
  async applyPromoCode() {
    const input = document.getElementById('promo-code-input');
    const code = input?.value?.toUpperCase();
    const message = document.getElementById('promo-message');

    if (!code) {
      message.innerHTML = '<span style="color: #F56565;">Please enter a promo code</span>';
      return;
    }

    if (window.BillingModule) {
      const result = await window.BillingModule.applyPromoCode(code);
      if (result.valid) {
        message.innerHTML = `<span style="color: #48BB78;">✓ ${result.message}</span>`;
        input.style.borderColor = '#48BB78';
      } else {
        message.innerHTML = `<span style="color: #F56565;">✗ ${result.message}</span>`;
        input.style.borderColor = '#F56565';
      }
    }
  },

  /**
   * Update pricing display (monthly vs yearly)
   */
  updatePricing(cycle) {
    const cards = document.querySelectorAll('.pricing-card');
    cards.forEach(card => {
      const tierId = card.className.split(' ')[1];
      const tier = window.BillingModule?.tiers?.[tierId];

      if (tier && tierId !== 'free') {
        const priceElement = card.querySelector('.price');
        const price = cycle === 'yearly' ? tier.priceYearly / 100 : tier.price / 100;
        if (priceElement) {
          priceElement.textContent = '€' + (Math.round(price / 12 * 10) / 10);
        }
      }
    });
  },

  /**
   * Get CSS styles for billing UI
   */
  getPricingStyles() {
    return `
      .billing-pricing-page {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 20px;
      }

      .pricing-header {
        text-align: center;
        margin-bottom: 60px;
      }

      .pricing-header h2 {
        font-size: 32px;
        margin-bottom: 12px;
      }

      .pricing-header p {
        font-size: 16px;
        color: #718096;
        margin-bottom: 30px;
      }

      .billing-toggle {
        display: flex;
        gap: 24px;
        justify-content: center;
      }

      .billing-toggle label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 14px;
      }

      .pricing-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 24px;
        margin-bottom: 60px;
      }

      .pricing-card {
        border: 2px solid #E2E8F0;
        border-radius: 12px;
        padding: 32px;
        background: white;
        transition: all 0.3s;
        position: relative;
      }

      .pricing-card:hover {
        border-color: #CBD5E0;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        transform: translateY(-4px);
      }

      .pricing-card.free {
        background: #F7FAFC;
      }

      .pricing-card.pro {
        border-color: #667eea;
        border-width: 3px;
        transform: scale(1.05);
      }

      .pricing-card.enterprise {
        border-color: #8B5CF6;
      }

      .pricing-card.current {
        background: #EFF6FF;
        border-color: #3B82F6;
      }

      .current-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        background: #3B82F6;
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .tier-name {
        font-size: 24px;
        margin-bottom: 8px;
      }

      .tier-description {
        color: #718096;
        font-size: 14px;
        margin-bottom: 20px;
      }

      .pricing-amount {
        font-size: 36px;
        font-weight: 700;
        margin-bottom: 20px;
        margin-top: 20px;
      }

      .price {
        color: #2D3748;
      }

      .period {
        font-size: 14px;
        color: #718096;
        margin-left: 4px;
      }

      .features-list {
        list-style: none;
        margin: 20px 0;
      }

      .features-list li {
        padding: 8px 0;
        font-size: 14px;
        color: #4A5568;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .check {
        color: #48BB78;
        font-weight: bold;
      }

      .pricing-actions {
        margin-top: 24px;
      }

      .btn {
        padding: 12px 20px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
      }

      .btn-primary {
        background: #667eea;
        color: white;
      }

      .btn-primary:hover {
        background: #5568d3;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }

      .btn-secondary {
        background: #E2E8F0;
        color: #2D3748;
      }

      .btn-secondary:hover {
        background: #CBD5E0;
      }

      .btn-secondary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .pricing-faq {
        background: #F7FAFC;
        padding: 40px;
        border-radius: 12px;
      }

      .pricing-faq h3 {
        font-size: 24px;
        margin-bottom: 24px;
      }

      .faq-item {
        margin-bottom: 24px;
      }

      .faq-item h4 {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 8px;
      }

      .faq-item p {
        font-size: 13px;
        color: #718096;
      }

      /* Upgrade Modal */
      .billing-modal-container {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .billing-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        cursor: pointer;
      }

      .billing-modal {
        position: relative;
        background: white;
        border-radius: 12px;
        padding: 32px;
        max-width: 500px;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
        cursor: default;
      }

      .modal-close {
        position: absolute;
        top: 12px;
        right: 12px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #718096;
      }

      .modal-icon {
        font-size: 48px;
        text-align: center;
        margin-bottom: 16px;
      }

      .billing-modal h3 {
        font-size: 20px;
        text-align: center;
        margin-bottom: 8px;
      }

      .limit-message {
        text-align: center;
        color: #4A5568;
        margin-bottom: 8px;
      }

      .context-message {
        text-align: center;
        font-size: 13px;
        color: #718096;
        margin-bottom: 24px;
      }

      .upgrade-options {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 24px;
      }

      .btn-option {
        padding: 16px;
        border: 2px solid #E2E8F0;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        transition: all 0.2s;
        text-align: left;
      }

      .btn-option:hover {
        border-color: #667eea;
        background: #EFF6FF;
      }

      .option-name {
        font-weight: 600;
        margin-bottom: 4px;
      }

      .option-price {
        color: #667eea;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .option-features {
        font-size: 12px;
        color: #718096;
      }

      .modal-footer {
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }

      .btn-text {
        background: none;
        border: none;
        color: #667eea;
        cursor: pointer;
        padding: 0;
        font-size: 13px;
        text-decoration: none;
      }

      .btn-text:hover {
        text-decoration: underline;
      }

      /* Usage Dashboard */
      .usage-dashboard {
        padding: 16px;
      }

      .usage-dashboard h3 {
        margin-bottom: 16px;
      }

      .usage-item {
        margin-bottom: 20px;
        padding: 12px;
        border-radius: 8px;
        background: #F7FAFC;
      }

      .usage-item.warning {
        background: #FFFAF0;
        border-left: 4px solid #F6AD55;
      }

      .usage-item.exceeded {
        background: #FFF5F5;
        border-left: 4px solid #F56565;
      }

      .usage-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 13px;
      }

      .icon {
        font-size: 18px;
      }

      .name {
        flex: 1;
        font-weight: 500;
      }

      .values {
        color: #718096;
        font-size: 12px;
      }

      .usage-bar {
        height: 8px;
        background: #E2E8F0;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 4px;
      }

      .bar-fill {
        height: 100%;
        transition: width 0.3s;
      }

      .usage-percent {
        font-size: 11px;
        color: #718096;
      }

      .usage-warning {
        font-size: 11px;
        color: #F6AD55;
        margin-top: 4px;
        font-weight: 500;
      }

      /* Trial Banner */
      .trial-banner {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .banner-content {
        flex: 1;
        display: flex;
        gap: 12px;
      }

      .banner-icon {
        font-size: 24px;
      }

      .banner-text strong {
        display: block;
        margin-bottom: 4px;
      }

      .banner-text p {
        font-size: 12px;
        opacity: 0.9;
      }

      .banner-progress {
        width: 120px;
        height: 4px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
        overflow: hidden;
      }

      .banner-progress .progress-bar {
        height: 100%;
        background: white;
      }

      .banner-action {
        background: white;
        color: #667eea;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }

      .banner-action:hover {
        background: rgba(255, 255, 255, 0.9);
      }

      /* Feature Gate */
      .feature-gate-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        z-index: 100;
      }

      .feature-gate-overlay:hover {
        background: rgba(0, 0, 0, 0.5);
      }

      .gate-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: white;
      }

      .gate-icon {
        font-size: 32px;
      }

      .gate-text {
        font-size: 12px;
        font-weight: 600;
      }

      /* Payment Form */
      .payment-form {
        padding: 16px;
      }

      .form-group {
        margin-bottom: 16px;
      }

      .form-group label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 6px;
        color: #2D3748;
      }

      .form-group input[type="checkbox"] {
        margin-right: 8px;
      }

      .form-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #E2E8F0;
        border-radius: 6px;
        font-size: 13px;
        font-family: inherit;
      }

      .form-input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .promo-code-section {
        padding: 16px;
        background: #F7FAFC;
        border-radius: 8px;
      }

      .promo-input-group {
        display: flex;
        gap: 8px;
      }

      .promo-input-group .form-input {
        flex: 1;
      }
    `;
  }
};

// Export for use in cycleCAD
if (typeof window !== 'undefined') {
  window.BillingUI = BillingUI;
}
