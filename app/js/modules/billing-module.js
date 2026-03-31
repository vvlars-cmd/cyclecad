/**
 * Billing Module - Stripe integration for cycleCAD Pro/Enterprise
 * Manages subscriptions, usage limits, feature gates, and trial periods
 *
 * Public API:
 *   window.cycleCAD.modules.billing.getCurrentTier() → {tier, features, limits, usage}
 *   window.cycleCAD.modules.billing.checkLimit(feature) → {allowed, current, limit, message}
 *   window.cycleCAD.modules.billing.upgrade() → redirect to Stripe Checkout
 *   window.cycleCAD.modules.billing.getUsage() → {projects, parts, storage, ...}
 */

const BillingModule = {
  id: 'billing',
  version: '1.0.0',

  // Stripe configuration (set via localStorage or env)
  config: {
    stripePublishableKey: localStorage.getItem('stripe_publishable_key') || 'pk_test_51234567890',
    stripePriceIds: {
      proMonthly: localStorage.getItem('stripe_price_pro_monthly') || 'price_1234_pro_monthly',
      proYearly: localStorage.getItem('stripe_price_pro_yearly') || 'price_1234_pro_yearly',
      enterpriseMonthly: localStorage.getItem('stripe_price_enterprise_monthly') || 'price_1234_ent_monthly',
      enterpriseYearly: localStorage.getItem('stripe_price_enterprise_yearly') || 'price_1234_ent_yearly'
    },
    serverUrl: localStorage.getItem('billing_server_url') || 'http://localhost:3001',
    trialDays: 14,
    gracePeriodDays: 7
  },

  // Tier definitions with limits
  tiers: {
    free: {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'EUR',
      description: 'Perfect for getting started',
      features: [
        'Up to 3 projects',
        '100 parts per project',
        '1 GB storage',
        'Basic 3D viewer',
        'STEP import (up to 30 MB)',
        '20 AI requests per day',
        'Community support'
      ],
      limits: {
        projects: 3,
        partsPerProject: 100,
        stepImportMB: 30,
        collaborators: 0,
        storageGB: 1,
        aiRequestsPerDay: 20,
        camOperations: false,
        customMaterials: false,
        apiAccess: false,
        prioritySupport: false,
        customBranding: false,
        sso: false,
        selfHosted: false
      },
      color: '#6B7280'
    },

    pro: {
      id: 'pro',
      name: 'Pro',
      price: 4900,
      priceYearly: 46800,
      currency: 'EUR',
      description: 'For professional designers',
      features: [
        'Unlimited projects',
        'Unlimited parts',
        '50 GB storage',
        'Full feature set',
        'STEP import (up to 500 MB)',
        '500 AI requests per day',
        'CAM operations',
        'Custom materials',
        'API access',
        'Priority email support',
        'Monthly billing or yearly (save 20%)'
      ],
      limits: {
        projects: Infinity,
        partsPerProject: Infinity,
        stepImportMB: 500,
        collaborators: 10,
        storageGB: 50,
        aiRequestsPerDay: 500,
        camOperations: true,
        customMaterials: true,
        apiAccess: true,
        prioritySupport: true,
        customBranding: false,
        sso: false,
        selfHosted: false
      },
      color: '#3B82F6'
    },

    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      price: 29900,
      priceYearly: 286800,
      currency: 'EUR',
      description: 'For teams and manufacturers',
      features: [
        'Everything in Pro',
        'Unlimited collaborators',
        '500 GB storage',
        'Unlimited AI requests',
        'Unlimited STEP import',
        'CAM to real-time fab network',
        'Custom branding',
        'Single Sign-On (SSO)',
        'Self-hosted option',
        '99.9% SLA',
        'Dedicated technical support',
        'Training and consulting included'
      ],
      limits: {
        projects: Infinity,
        partsPerProject: Infinity,
        stepImportMB: Infinity,
        collaborators: Infinity,
        storageGB: 500,
        aiRequestsPerDay: Infinity,
        camOperations: true,
        customMaterials: true,
        apiAccess: true,
        prioritySupport: true,
        customBranding: true,
        sso: true,
        selfHosted: true,
        sla: '99.9%'
      },
      color: '#8B5CF6'
    }
  },

  // User state (cached in localStorage)
  state: {
    userId: null,
    email: null,
    tier: 'free',
    status: 'active', // active, trialing, canceled, payment_failed
    trialEndsAt: null,
    currentPeriodEnd: null,
    currentPeriodStart: null,
    cancelAtPeriodEnd: false,
    billingCycle: 'monthly', // monthly or yearly
    stripeCustomerId: null,
    usage: {
      projects: 0,
      partsInProject: {},
      totalParts: 0,
      storageGB: 0,
      aiRequests: 0,
      aiRequestsToday: 0,
      lastAiRequestReset: Date.now(),
      stepImportsThisMonth: 0,
      stepImportBytesThisMonth: 0,
      lastImportReset: Date.now()
    },
    lastSyncedAt: null,
    offlineMode: false
  },

  /**
   * Initialize billing module
   * Load user state from localStorage or API
   */
  async init() {
    console.log('[Billing] Initializing...');

    // Load from localStorage
    const saved = localStorage.getItem('billing_state');
    if (saved) {
      try {
        this.state = { ...this.state, ...JSON.parse(saved) };
        console.log('[Billing] Loaded cached state:', this.state.tier);
      } catch (e) {
        console.warn('[Billing] Failed to parse cached state:', e);
      }
    }

    // Try to sync with server
    try {
      const response = await fetch(`${this.config.serverUrl}/billing/user`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.state = { ...this.state, ...data };
        this.saveState();
        console.log('[Billing] Synced with server');
        this.state.offlineMode = false;
      }
    } catch (e) {
      console.warn('[Billing] Server sync failed, using offline mode:', e.message);
      this.state.offlineMode = true;
    }

    // Start daily AI request counter reset
    this.startDailyReset();

    // Load stripe.js
    if (!window.Stripe) {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;
      document.head.appendChild(script);
      await new Promise(resolve => script.onload = resolve);
    }

    this.stripe = Stripe(this.config.stripePublishableKey);
    console.log('[Billing] Module ready');
  },

  /**
   * Get current tier configuration
   */
  getCurrentTier() {
    const tier = this.tiers[this.state.tier] || this.tiers.free;
    return {
      tier: this.state.tier,
      name: tier.name,
      features: tier.features,
      limits: tier.limits,
      usage: this.state.usage,
      status: this.state.status,
      trialEndsAt: this.state.trialEndsAt,
      currentPeriodEnd: this.state.currentPeriodEnd,
      billingCycle: this.state.billingCycle,
      daysUntilTrialExpires: this.state.trialEndsAt ?
        Math.ceil((this.state.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24)) : null,
      isTrialing: this.state.status === 'trialing',
      isCanceled: this.state.status === 'canceled',
      isPaymentFailed: this.state.status === 'payment_failed'
    };
  },

  /**
   * Check if a feature is allowed under current tier
   * Returns {allowed, current, limit, message, upgradeRequired}
   */
  checkLimit(feature, count = 1) {
    const tier = this.tiers[this.state.tier] || this.tiers.free;
    const limits = tier.limits;
    const usage = this.state.usage;

    // Map feature names to limit keys and usage keys
    const featureLimits = {
      'projects': { limit: limits.projects, usage: usage.projects, display: 'Projects' },
      'parts': { limit: limits.partsPerProject, usage: usage.totalParts, display: 'Parts' },
      'storage': { limit: limits.storageGB, usage: usage.storageGB, display: 'Storage (GB)' },
      'ai-requests': { limit: limits.aiRequestsPerDay, usage: usage.aiRequestsToday, display: 'AI requests today' },
      'step-import': { limit: limits.stepImportMB, usage: 0, display: 'STEP import size (MB)' },
      'collaborators': { limit: limits.collaborators, usage: 0, display: 'Collaborators' },
      'cam-operations': { limit: limits.camOperations ? 1 : 0, usage: 1, display: 'CAM operations' },
      'custom-materials': { limit: limits.customMaterials ? 1 : 0, usage: 1, display: 'Custom materials' },
      'api-access': { limit: limits.apiAccess ? 1 : 0, usage: 1, display: 'API access' }
    };

    const featureConfig = featureLimits[feature];
    if (!featureConfig) {
      return { allowed: true, message: 'Feature not tracked' };
    }

    const { limit, usage: currentUsage, display } = featureConfig;
    const newTotal = currentUsage + count;
    const allowed = limit === Infinity || newTotal <= limit;

    return {
      allowed,
      current: currentUsage,
      limit,
      message: allowed ?
        `${display}: ${currentUsage}/${limit === Infinity ? '∞' : limit}` :
        `Upgrade to ${this.state.tier === 'free' ? 'Pro' : 'Enterprise'} to increase ${display} limit`,
      upgradeRequired: !allowed,
      percentUsed: limit === Infinity ? 0 : Math.round((currentUsage / limit) * 100)
    };
  },

  /**
   * Show upgrade prompt modal
   */
  showUpgradePrompt(feature, context = '') {
    const message = this.checkLimit(feature).message;
    const html = `
      <div class="billing-upgrade-modal">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <h3>Upgrade Your Plan</h3>
          <p>${message}</p>
          ${context ? `<p class="context">${context}</p>` : ''}
          <div class="tier-options">
            <button class="tier-btn pro-btn" onclick="window.cycleCAD.modules.billing.startCheckout('pro', 'monthly')">
              Upgrade to Pro<br><small>€49/month</small>
            </button>
            <button class="tier-btn enterprise-btn" onclick="window.cycleCAD.modules.billing.startCheckout('enterprise', 'monthly')">
              Upgrade to Enterprise<br><small>€299/month</small>
            </button>
          </div>
          <button class="cancel-btn" onclick="this.closest('.billing-upgrade-modal').remove()">Cancel</button>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
  },

  /**
   * Start Stripe Checkout for a tier
   */
  async startCheckout(tier, billingCycle = 'monthly') {
    if (!['pro', 'enterprise'].includes(tier)) {
      console.error('[Billing] Invalid tier:', tier);
      return;
    }

    try {
      const tierConfig = this.tiers[tier];
      const priceId = billingCycle === 'yearly' ?
        this.config.stripePriceIds[`${tier}Yearly`] :
        this.config.stripePriceIds[`${tier}Monthly`];

      console.log('[Billing] Starting checkout for', tier, billingCycle);

      const response = await fetch(`${this.config.serverUrl}/billing/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          priceId,
          tier,
          billingCycle,
          trialDays: this.state.tier === 'free' ? this.config.trialDays : 0
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const { sessionId } = await response.json();
      await this.stripe.redirectToCheckout({ sessionId });
    } catch (e) {
      console.error('[Billing] Checkout failed:', e);
      alert('Failed to start checkout. Please try again.');
    }
  },

  /**
   * Open Stripe Customer Portal to manage subscription
   */
  async openCustomerPortal() {
    try {
      console.log('[Billing] Opening customer portal...');

      const response = await fetch(`${this.config.serverUrl}/billing/create-portal`, {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const { url } = await response.json();
      window.open(url, '_blank');
    } catch (e) {
      console.error('[Billing] Failed to open portal:', e);
      alert('Failed to open billing portal. Please try again.');
    }
  },

  /**
   * Track usage of a feature
   */
  trackUsage(feature, amount = 1) {
    const now = Date.now();

    // Reset daily AI counter if needed
    if (now - this.state.usage.lastAiRequestReset > 24 * 60 * 60 * 1000) {
      this.state.usage.aiRequestsToday = 0;
      this.state.usage.lastAiRequestReset = now;
    }

    // Reset monthly STEP import if needed (simplified: monthly = 30 days)
    if (now - this.state.usage.lastImportReset > 30 * 24 * 60 * 60 * 1000) {
      this.state.usage.stepImportsThisMonth = 0;
      this.state.usage.stepImportBytesThisMonth = 0;
      this.state.usage.lastImportReset = now;
    }

    switch (feature) {
      case 'ai-request':
        this.state.usage.aiRequests++;
        this.state.usage.aiRequestsToday++;
        break;
      case 'project-created':
        this.state.usage.projects++;
        break;
      case 'part-added':
        this.state.usage.totalParts++;
        this.state.usage.partsInProject[this.getCurrentProjectId()] =
          (this.state.usage.partsInProject[this.getCurrentProjectId()] || 0) + 1;
        break;
      case 'storage-added':
        this.state.usage.storageGB += amount;
        break;
      case 'step-import':
        this.state.usage.stepImportsThisMonth++;
        this.state.usage.stepImportBytesThisMonth += amount;
        break;
    }

    this.saveState();
    this.dispatchUsageEvent(feature, amount);
  },

  /**
   * Get current usage stats
   */
  getUsage() {
    return { ...this.state.usage };
  },

  /**
   * Check if user has a feature (returns boolean)
   */
  hasFeature(feature) {
    const tier = this.tiers[this.state.tier] || this.tiers.free;
    return tier.limits[feature] === true || tier.limits[feature] > 0;
  },

  /**
   * Get remaining usage before hitting limit
   */
  getRemainingQuota(feature) {
    const check = this.checkLimit(feature);
    if (check.limit === Infinity) return Infinity;
    return Math.max(0, check.limit - check.current);
  },

  /**
   * Apply a promo code
   */
  async applyPromoCode(code) {
    try {
      const response = await fetch(`${this.config.serverUrl}/billing/apply-promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code })
      });

      const data = await response.json();
      if (data.valid) {
        console.log('[Billing] Promo code valid:', data.discount);
        return { valid: true, discount: data.discount, message: data.message };
      } else {
        return { valid: false, message: data.message || 'Invalid promo code' };
      }
    } catch (e) {
      console.error('[Billing] Promo validation failed:', e);
      return { valid: false, message: 'Failed to validate promo code' };
    }
  },

  /**
   * Cancel subscription (redirects to portal)
   */
  async cancelSubscription() {
    const confirmed = confirm(
      'Are you sure you want to cancel your subscription? ' +
      'You will lose access to premium features at the end of your billing cycle.'
    );

    if (confirmed) {
      this.openCustomerPortal();
    }
  },

  /**
   * Change billing cycle (monthly ↔ yearly)
   */
  async changeBillingCycle(newCycle) {
    if (!['monthly', 'yearly'].includes(newCycle)) {
      console.error('[Billing] Invalid cycle:', newCycle);
      return false;
    }

    try {
      const response = await fetch(`${this.config.serverUrl}/billing/change-billing-cycle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cycle: newCycle })
      });

      if (response.ok) {
        this.state.billingCycle = newCycle;
        this.saveState();
        return true;
      }
    } catch (e) {
      console.error('[Billing] Failed to change cycle:', e);
    }
    return false;
  },

  /**
   * Get usage as percentage for progress indicators
   */
  getUsagePercentage(feature) {
    const check = this.checkLimit(feature);
    if (check.limit === Infinity) return 0;
    return Math.round((check.current / check.limit) * 100);
  },

  /**
   * Export usage data as CSV
   */
  exportUsageCSV() {
    const lines = [
      ['Metric', 'Current', 'Limit', 'Usage %'],
      ['Projects', this.state.usage.projects, this.tiers[this.state.tier].limits.projects || '∞', this.getUsagePercentage('projects')],
      ['Total Parts', this.state.usage.totalParts, this.tiers[this.state.tier].limits.partsPerProject || '∞', this.getUsagePercentage('parts')],
      ['Storage (GB)', this.state.usage.storageGB.toFixed(2), this.tiers[this.state.tier].limits.storageGB, this.getUsagePercentage('storage')],
      ['AI Requests (Today)', this.state.usage.aiRequestsToday, this.tiers[this.state.tier].limits.aiRequestsPerDay, this.getUsagePercentage('ai-requests')],
      ['Total AI Requests', this.state.usage.aiRequests, '∞', 0],
      ['STEP Imports (This Month)', this.state.usage.stepImportsThisMonth, '∞', 0],
      ['STEP Import Data (MB)', (this.state.usage.stepImportBytesThisMonth / 1024 / 1024).toFixed(2), this.tiers[this.state.tier].limits.stepImportMB || '∞', this.getUsagePercentage('step-import')],
      [''],
      ['Generated at', new Date().toISOString()],
      ['User Tier', this.state.tier],
      ['Subscription Status', this.state.status]
    ];

    const csv = lines.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyclecad-usage-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Get list of past invoices
   */
  async getInvoices() {
    try {
      const response = await fetch(`${this.config.serverUrl}/billing/invoices`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.error('[Billing] Failed to fetch invoices:', e);
    }
    return [];
  },

  /**
   * Internal: Save state to localStorage
   */
  saveState() {
    localStorage.setItem('billing_state', JSON.stringify(this.state));
    this.state.lastSyncedAt = Date.now();
  },

  /**
   * Internal: Start daily AI request counter reset
   */
  startDailyReset() {
    setInterval(() => {
      const now = Date.now();
      if (now - this.state.usage.lastAiRequestReset > 24 * 60 * 60 * 1000) {
        this.state.usage.aiRequestsToday = 0;
        this.state.usage.lastAiRequestReset = now;
        this.saveState();
        this.dispatchUsageEvent('daily-reset', 0);
      }
    }, 60000); // Check every minute
  },

  /**
   * Internal: Get current project ID
   */
  getCurrentProjectId() {
    return window.cycleCAD?.state?.currentProject || 'default';
  },

  /**
   * Internal: Dispatch custom event
   */
  dispatchUsageEvent(feature, amount) {
    window.dispatchEvent(new CustomEvent('billing-usage', {
      detail: { feature, amount, usage: this.state.usage }
    }));
  },

  /**
   * Get UI component for pricing table
   */
  getUI() {
    return {
      id: 'billing-panel',
      title: 'Billing & Pricing',
      html: `
        <div class="billing-panel">
          <div class="current-plan">
            <h4>Current Plan</h4>
            <div class="plan-card ${this.state.tier}">
              <div class="plan-name">${this.tiers[this.state.tier].name}</div>
              <div class="plan-price">
                €${this.state.tier === 'free' ? '0' :
                  this.state.billingCycle === 'yearly' ?
                  (this.tiers[this.state.tier].priceYearly / 100 / 12).toFixed(0) :
                  (this.tiers[this.state.tier].price / 100).toFixed(0)}/month
              </div>
              <div class="plan-status">${this.state.status}</div>
              ${this.state.currentPeriodEnd ?
                `<div class="next-billing">Next billing: ${new Date(this.state.currentPeriodEnd).toLocaleDateString()}</div>` : ''}
              ${this.state.trialEndsAt ?
                `<div class="trial-countdown">Trial expires in ${Math.ceil((this.state.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24))} days</div>` : ''}
            </div>
          </div>

          <div class="usage-section">
            <h4>Usage</h4>
            ${this.getUsageBarHTML('Projects', this.getUsagePercentage('projects'),
              `${this.state.usage.projects}/${this.tiers[this.state.tier].limits.projects}`)}
            ${this.getUsageBarHTML('Storage', this.getUsagePercentage('storage'),
              `${this.state.usage.storageGB.toFixed(1)} GB / ${this.tiers[this.state.tier].limits.storageGB} GB`)}
            ${this.getUsageBarHTML('AI Requests (Today)', this.getUsagePercentage('ai-requests'),
              `${this.state.usage.aiRequestsToday} / ${this.tiers[this.state.tier].limits.aiRequestsPerDay}`)}
          </div>

          <div class="billing-actions">
            <button onclick="window.cycleCAD.modules.billing.openCustomerPortal()" class="btn btn-secondary">
              Manage Subscription
            </button>
            <button onclick="window.cycleCAD.modules.billing.exportUsageCSV()" class="btn btn-secondary">
              Export Usage
            </button>
            ${this.state.tier !== 'enterprise' ?
              `<button onclick="window.cycleCAD.modules.billing.showUpgradePrompt('storage')" class="btn btn-primary">
                Upgrade Plan
              </button>` : ''}
          </div>
        </div>
      `,
      styles: `
        .billing-panel {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .current-plan h4, .usage-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          color: #6B7280;
        }
        .plan-card {
          border: 2px solid #E5E7EB;
          border-radius: 8px;
          padding: 16px;
          background: #F9FAFB;
        }
        .plan-card.pro { border-color: #3B82F6; background: #EFF6FF; }
        .plan-card.enterprise { border-color: #8B5CF6; background: #F5F3FF; }
        .plan-name { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
        .plan-price { font-size: 24px; font-weight: 700; color: #1F2937; margin-bottom: 8px; }
        .plan-status { font-size: 12px; text-transform: uppercase; color: #6B7280; margin-bottom: 8px; }
        .next-billing, .trial-countdown { font-size: 12px; color: #6B7280; }
        .usage-section { display: flex; flex-direction: column; gap: 12px; }
        .billing-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      `
    };
  },

  /**
   * Helper: Get HTML for usage progress bar
   */
  getUsageBarHTML(label, percentage, details) {
    return `
      <div class="usage-item">
        <div class="usage-label">
          <span>${label}</span>
          <span class="usage-details">${details}</span>
        </div>
        <div class="usage-bar">
          <div class="usage-fill" style="width: ${Math.min(percentage, 100)}%; background-color: ${
            percentage > 90 ? '#EF4444' : percentage > 70 ? '#F59E0B' : '#10B981'
          }"></div>
        </div>
      </div>
    `;
  }
};

// Export for use in cycleCAD
if (typeof window !== 'undefined') {
  window.BillingModule = BillingModule;
}
