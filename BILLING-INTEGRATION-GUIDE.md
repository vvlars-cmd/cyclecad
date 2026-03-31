# Billing Integration Guide - cycleCAD

Quick start guide to integrate Stripe billing into cycleCAD.

## 5-Minute Setup

### Step 1: Stripe Account Setup (5 minutes)

1. Go to [stripe.com](https://stripe.com), create/login account
2. Go to Dashboard → Products
3. Create product "cycleCAD Pro":
   - Price: €49/month (price_1234_pro_monthly)
   - Price: €468/year (price_1234_pro_yearly)
4. Create product "cycleCAD Enterprise":
   - Price: €299/month (price_1234_ent_monthly)
   - Price: €2,868/year (price_1234_ent_yearly)
5. Copy API keys from Dashboard → Settings → Developers → API Keys:
   - Publishable key: pk_live_...
   - Secret key: sk_live_...
6. Create webhook endpoint:
   - Dashboard → Settings → Webhooks
   - Endpoint URL: `https://yourdomain.com/billing/webhook`
   - Events: subscription.* invoice.payment.*
   - Get signing secret: whsec_...

### Step 2: Environment Setup (2 minutes)

Create `.env` file:

```env
# Stripe
STRIPE_PUBLIC_KEY=pk_live_51234567890
STRIPE_SECRET_KEY=sk_live_1234567890
STRIPE_WEBHOOK_SECRET=whsec_1234567890

# App
APP_URL=https://cyclecad.com
BILLING_SERVER_URL=https://api.cyclecad.com

# Price IDs (from Step 1)
STRIPE_PRICE_PRO_MONTHLY=price_1234_pro_monthly
STRIPE_PRICE_PRO_YEARLY=price_1234_pro_yearly
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_1234_ent_monthly
STRIPE_PRICE_ENTERPRISE_YEARLY=price_1234_ent_yearly
```

### Step 3: Install Files (1 minute)

```bash
# Copy all billing files to your project
cp app/js/modules/billing-module.js ~/cyclecad/app/js/modules/
cp app/js/billing-ui.js ~/cyclecad/app/js/
cp server/billing-server.js ~/cyclecad/server/
cp docs/BILLING-* ~/cyclecad/docs/
cp app/tests/billing-tests.html ~/cyclecad/app/tests/
```

### Step 4: Wire Into App (3 minutes)

**In `app/index.html` - add before closing `</body>`:**

```html
<!-- Billing System -->
<script src="js/modules/billing-module.js"></script>
<script src="js/billing-ui.js"></script>
<script>
  // Initialize billing when app is ready
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      await window.BillingModule.init();
      console.log('[Billing] System initialized');

      // Register billing panel in app
      if (window.cycleCAD?.modules) {
        window.cycleCAD.modules.billing = window.BillingModule;
      }

      // Add billing panel to settings
      const billingUI = window.BillingModule.getUI();
      // Render billingUI.html wherever you render panels
    } catch (e) {
      console.error('[Billing] Initialization failed:', e);
    }
  });
</script>
```

**In `server/app.js` - add billing routes:**

```javascript
const express = require('express');
const billingRouter = require('./billing-server');

const app = express();

// Middleware
app.use(express.json());
app.use(express.raw({type: 'application/json'}, {path: '/billing/webhook'}));

// Mount billing routes
app.use('/billing', billingRouter);

// Start server
app.listen(3001, () => {
  console.log('Server running on port 3001 with billing enabled');
});
```

## Usage Examples

### Check Limit Before Operation

```javascript
// Before allowing user to create project
const check = window.BillingModule.checkLimit('projects');

if (!check.allowed) {
  // Show upgrade prompt
  window.BillingUI.showUpgradeModal('projects', 'Free users can only create 3 projects');
  return;
}

// Allow project creation
createProject();
```

### Track Usage

```javascript
// When project created
window.BillingModule.trackUsage('project-created');

// When STEP file imported (50 MB)
window.BillingModule.trackUsage('step-import', 50 * 1024 * 1024);

// When storage used (0.5 GB)
window.BillingModule.trackUsage('storage-added', 0.5);

// When AI feature used
window.BillingModule.trackUsage('ai-request');
```

### Gate Premium Features

```javascript
// Disable CAM for Free users
function initCAMOperations() {
  if (!window.BillingModule.hasFeature('cam-operations')) {
    // Show lock overlay
    document.getElementById('cam-section').appendChild(
      document.createElement('div')
    ).innerHTML = window.BillingUI.getFeatureGateOverlay('cam-operations');

    // Disable buttons
    document.querySelectorAll('[data-cam]').forEach(btn => {
      btn.disabled = true;
      btn.onclick = () => {
        window.BillingModule.showUpgradePrompt('cam-operations',
          'CAM operations are available in Pro plan');
      };
    });
    return;
  }

  // Enable CAM for Pro/Enterprise
  initCAMUI();
}
```

### Show Pricing Page

```javascript
// In settings or upgrade page
const pricingUI = window.BillingUI.showPricingPage();
document.getElementById('pricing-container').innerHTML = pricingUI.html;
document.head.appendChild(document.createElement('style')).textContent = pricingUI.styles;
```

### Show Trial Banner

```javascript
// At top of app during trial
const banner = window.BillingUI.getTrialBanner();
if (banner) {
  document.body.insertAdjacentHTML('afterbegin', banner);
}
```

## Testing

### Run Test Suite

```bash
# Open in browser
open app/tests/billing-tests.html

# Or serve via server
http://localhost:3000/app/tests/billing-tests.html
```

### Test Key Flows

1. **Upgrade Flow**
   - Click "Upgrade" → Stripe Checkout → Success page
   - Verify user tier changed to Pro
   - Verify usage limits increased

2. **Limit Enforcement**
   - Create 3 projects on Free tier
   - Try to create 4th → Upgrade modal appears
   - Click "Upgrade to Pro" → Checkout flow

3. **Trial Period**
   - Start new account → Get 14-day trial
   - Verify countdown in banner
   - Verify auto-charge on day 15 (test mode)

4. **Payment Failure**
   - Use test card ending in 0002 (fails payment)
   - Verify grace period started
   - Verify reminder emails sent
   - Update payment → Verify recovery

5. **Offline Mode**
   - Disconnect from internet
   - Verify app still loads with cached data
   - Reconnect → Verify sync with server

## Deployment Checklist

### Before Going Live

- [ ] Stripe account created and verified
- [ ] Products and prices created with correct IDs
- [ ] API keys set in environment (.env)
- [ ] Webhook endpoint configured
- [ ] HTTPS enabled on all billing pages
- [ ] Billing module wired into app
- [ ] Server routes mounted
- [ ] All 38 tests passing
- [ ] Checkout flow tested end-to-end
- [ ] Payment method update tested
- [ ] Cancellation tested
- [ ] Invoice generation tested
- [ ] User acceptance testing complete

### After Going Live

- [ ] Monitor webhook delivery in Stripe Dashboard
- [ ] Set up billing alerts (failed payments, disputes)
- [ ] Track MRR and churn metrics
- [ ] Monitor test mode vs live mode
- [ ] Review customer support tickets for billing issues
- [ ] Monthly reconciliation of invoices

## Common Customizations

### Add More Tiers

In `billing-module.js`:

```javascript
tiers: {
  // ... existing tiers ...
  startup: {
    id: 'startup',
    name: 'Startup',
    price: 99 * 100, // €99/mo
    limits: { /* ... */ },
    features: [ /* ... */ ]
  }
}
```

### Custom Pricing

```javascript
// Change Pro price to €79/month
tiers.pro.price = 79 * 100;

// Change Enterprise to €499/month
tiers.enterprise.price = 499 * 100;
```

### Add Promo Code

```javascript
// In applyPromoCode() function
const promoCodes = {
  'SUMMER20': 0.20,
  'NEWUSER25': 0.25,
  'CORPORATE30': 0.30
};
```

### Change Free Tier Limits

```javascript
tiers.free.limits = {
  projects: 5,              // Was 3
  partsPerProject: 200,     // Was 100
  storageGB: 2,             // Was 1
  aiRequestsPerDay: 50,     // Was 20
  // ...
};
```

### Customize Trial Duration

```javascript
config.trialDays = 21;  // 21-day trial instead of 14
```

### Change Grace Period

```javascript
config.gracePeriodDays = 14;  // 14 days instead of 7
```

## Architecture

```
┌─────────────────────────────────────────────┐
│        cycleCAD App (Frontend)              │
├─────────────────────────────────────────────┤
│  BillingModule (state, logic)               │
│  BillingUI (components, display)            │
│  Stripe.js (Checkout, Portal)               │
└─────────────────────────────────────────────┘
           │ HTTP/HTTPS │
┌─────────────────────────────────────────────┐
│      Billing Server (Node.js/Express)       │
├─────────────────────────────────────────────┤
│  /billing/create-checkout                   │
│  /billing/create-portal                     │
│  /billing/webhook (Stripe events)           │
│  /billing/user (status)                     │
│  /billing/usage (tracking)                  │
└─────────────────────────────────────────────┘
           │ HTTPS │
┌─────────────────────────────────────────────┐
│          Stripe API                         │
├─────────────────────────────────────────────┤
│  Checkout Sessions                          │
│  Subscriptions                              │
│  Customers                                  │
│  Invoices                                   │
│  Webhooks                                   │
└─────────────────────────────────────────────┘
```

## Monitoring

### Key Metrics to Track

1. **Conversion**: Free → Pro signups
2. **Churn**: Pro → Free (canceled)
3. **Expansion**: Free → Enterprise upgrades
4. **MRR**: Monthly recurring revenue
5. **LTV**: Lifetime value per customer
6. **Payment Success**: Invoice payment success rate
7. **Trial Conversion**: Trial users who upgrade

### Webhook Monitoring

Monitor in Stripe Dashboard:

```
Developers → Webhooks → Select Endpoint
→ Signed Events → View all events
```

Look for:
- Failed deliveries (retry)
- Unexpected errors (investigate)
- Timing patterns (optimize)

## Support

### User-Facing Help

- Tutorial: `docs/BILLING-TUTORIAL.md` (link in app)
- Help entries: `docs/BILLING-HELP.json` (searchable)
- Contact: support@cyclecad.com

### Developer Support

- Module documentation: `docs/BILLING-README.md`
- API reference: See BillingModule section
- Tests: `app/tests/billing-tests.html`
- Console logging: Check browser console for `[Billing]` messages

### Stripe Support

- Dashboard: https://dashboard.stripe.com
- Documentation: https://stripe.com/docs
- API Reference: https://stripe.com/docs/api

## Next Steps

1. ✅ Implement basic billing (this guide)
2. ⏭️ Add team billing (Pro feature)
3. ⏭️ Add usage-based pricing (overage charges)
4. ⏭️ Add affiliate program (referral commissions)
5. ⏭️ Add invoice customization (logo, payment terms)
6. ⏭️ Add dunning management (failed payment recovery)

## Questions?

See `docs/BILLING-README.md` for comprehensive documentation, or contact:

- **Dev Issues**: Create GitHub issue or PR
- **Stripe Issues**: https://support.stripe.com
- **Billing Questions**: support@cyclecad.com
