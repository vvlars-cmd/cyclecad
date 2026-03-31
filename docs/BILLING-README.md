# cycleCAD Billing Integration - Complete Documentation

## Overview

A complete Stripe-based billing system for cycleCAD with three pricing tiers (Free, Pro, Enterprise), usage tracking, feature gates, trial periods, and comprehensive test coverage.

## Files Created

### Core Modules

1. **`app/js/modules/billing-module.js`** (800+ lines)
   - Main billing logic module
   - Tier management and limit checking
   - Usage tracking
   - Trial period handling
   - Stripe integration
   - Promo code validation
   - Webhook handling
   - Offline caching

2. **`app/js/billing-ui.js`** (500+ lines)
   - User interface components
   - Pricing page (3-tier comparison)
   - Upgrade modals
   - Usage dashboard
   - Subscription status display
   - Trial countdown banner
   - Feature gate overlays
   - Payment method forms
   - Promo code input

### Server Components

3. **`server/billing-server.js`** (400+ lines)
   - Express.js API server
   - Stripe Checkout session creation
   - Customer Portal integration
   - Webhook handling (subscription lifecycle)
   - Usage tracking endpoint
   - Invoice retrieval
   - Promo code validation

### Documentation

4. **`docs/BILLING-TUTORIAL.md`** (600+ lines)
   - Comprehensive user guide
   - Pricing overview
   - Step-by-step upgrade instructions
   - Usage limit explanations
   - Trial period details
   - Billing & invoices
   - Payment methods
   - Self-hosting guide
   - 40+ FAQ entries

5. **`docs/BILLING-HELP.json`** (30+ entries)
   - Searchable help entries
   - Categorized by billing topics
   - Links to detailed documentation
   - Keywords for quick search

### Testing

6. **`app/tests/billing-tests.html`** (1,400+ lines)
   - Interactive test suite
   - 38 test cases across 9 categories:
     - Tier detection (5 tests)
     - Limit checking (8 tests)
     - Usage tracking (6 tests)
     - Trial period (4 tests)
     - Promo codes (3 tests)
     - Grace period (2 tests)
     - Feature gates (4 tests)
     - Export/CSV (2 tests)
     - Offline mode (2 tests)
   - Live console output
   - Results export (JSON/HTML)
   - Progress tracking

## Quick Start

### 1. Installation

```bash
# Copy files to your cycleCAD project
cp app/js/modules/billing-module.js ~/cyclecad/app/js/modules/
cp app/js/billing-ui.js ~/cyclecad/app/js/
cp server/billing-server.js ~/cyclecad/server/
cp docs/BILLING-TUTORIAL.md ~/cyclecad/docs/
cp docs/BILLING-HELP.json ~/cyclecad/docs/
cp app/tests/billing-tests.html ~/cyclecad/app/tests/
```

### 2. Wire into App

**In `app/index.html`:**

```html
<!-- Load billing module -->
<script src="js/modules/billing-module.js"></script>
<script src="js/billing-ui.js"></script>

<script>
  // Initialize billing after app loads
  window.addEventListener('app-ready', () => {
    window.BillingModule.init().then(() => {
      console.log('Billing system ready');

      // Register billing UI panels
      window.cycleCAD.registerPanel('billing', BillingModule.getUI());
    });
  });
</script>
```

**In server `app.js`:**

```javascript
const billingRouter = require('./billing-server');

// Mount billing routes
app.use('/billing', billingRouter);

// Configure Stripe webhook
app.post('/billing/webhook', express.raw({type: 'application/json'}),
  billingRouter);
```

### 3. Environment Variables

**`.env`:**

```
# Stripe Keys
STRIPE_PUBLIC_KEY=pk_live_51234567890
STRIPE_SECRET_KEY=sk_live_1234567890
STRIPE_WEBHOOK_SECRET=whsec_1234567890

# App Configuration
APP_URL=https://cyclecad.com
BILLING_SERVER_URL=https://api.cyclecad.com

# Pricing (in cents)
STRIPE_PRICE_PRO_MONTHLY=price_1234_pro_monthly
STRIPE_PRICE_PRO_YEARLY=price_1234_pro_yearly
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_1234_ent_monthly
STRIPE_PRICE_ENTERPRISE_YEARLY=price_1234_ent_yearly
```

### 4. Stripe Setup

1. Create Stripe account at [stripe.com](https://stripe.com)
2. Create products and prices:
   - Pro (€49/month, €468/year)
   - Enterprise (€299/month, €2,868/year)
3. Get API keys from Dashboard
4. Create webhook endpoint: `/billing/webhook`
5. Subscribe to events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

## API Reference

### BillingModule

#### Core Methods

```javascript
// Initialize billing system
await window.BillingModule.init();

// Get current tier info
const tier = window.BillingModule.getCurrentTier();
// Returns: {tier, name, features, limits, usage, status, ...}

// Check if feature is allowed
const check = window.BillingModule.checkLimit('ai-requests');
// Returns: {allowed, current, limit, message, upgradeRequired, percentUsed}

// Check if user has a feature
const hasFeature = window.BillingModule.hasFeature('api-access');

// Get remaining quota before hitting limit
const remaining = window.BillingModule.getRemainingQuota('storage');
```

#### Subscription Management

```javascript
// Start checkout for tier
await window.BillingModule.startCheckout('pro', 'monthly');

// Open Stripe Customer Portal
await window.BillingModule.openCustomerPortal();

// Cancel subscription
await window.BillingModule.cancelSubscription();

// Change billing cycle (monthly ↔ yearly)
await window.BillingModule.changeBillingCycle('yearly');
```

#### Promo Codes

```javascript
// Apply promo code
const result = await window.BillingModule.applyPromoCode('STUDENT20');
// Returns: {valid, discount, message}
```

#### Usage Tracking

```javascript
// Track feature usage
window.BillingModule.trackUsage('ai-request');
window.BillingModule.trackUsage('project-created');
window.BillingModule.trackUsage('storage-added', 0.5); // 0.5 GB

// Get all usage stats
const usage = window.BillingModule.getUsage();

// Export usage as CSV
window.BillingModule.exportUsageCSV();
```

#### Invoices

```javascript
// Get past invoices
const invoices = await window.BillingModule.getInvoices();
// Returns: [{id, number, amount, date, status, pdfUrl}, ...]
```

### BillingUI

#### Display Components

```javascript
// Get pricing page component
const pricing = BillingUI.showPricingPage();

// Show upgrade modal when hitting limit
BillingUI.showUpgradeModal('storage', 'Your storage is full');

// Get usage dashboard
const dashboard = BillingUI.getUsageDashboard();

// Get subscription status card
const status = BillingUI.getSubscriptionStatus();

// Get trial countdown banner
const banner = BillingUI.getTrialBanner();

// Get feature gate overlay
const overlay = BillingUI.getFeatureGateOverlay('sso');
```

### Server API

#### Stripe Integration

```
POST /billing/create-checkout
  Body: {priceId, tier, billingCycle, trialDays}
  Returns: {sessionId}

POST /billing/create-portal
  Returns: {url}

POST /billing/webhook
  (Stripe webhook handler)

GET /billing/user
  Returns: {userId, tier, status, usage, ...}

GET /billing/usage/:userId
  Returns: {projects, storage, aiRequests, ...}

POST /billing/track-usage
  Body: {feature, amount}
  Returns: {success, usage}

POST /billing/apply-promo
  Body: {code}
  Returns: {valid, discount, message}

GET /billing/invoices
  Returns: [{id, number, amount, date, ...}, ...]

POST /billing/change-billing-cycle
  Body: {cycle}
  Returns: {success, billingCycle}
```

## Tier Comparison

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Price | €0 | €49/mo | €299/mo |
| Projects | 3 | ∞ | ∞ |
| Parts | 100 | ∞ | ∞ |
| Storage | 1 GB | 50 GB | 500 GB |
| STEP Import | 30 MB | 500 MB | ∞ |
| AI Requests/Day | 20 | 500 | ∞ |
| Collaborators | 0 | 10 | ∞ |
| CAM Operations | No | Yes | Yes |
| Custom Materials | No | Yes | Yes |
| API Access | No | Yes | Yes |
| Custom Branding | No | No | Yes |
| SSO | No | No | Yes |
| Self-Hosting | No | No | Yes |
| 99.9% SLA | No | No | Yes |

## Limit Checking

Limits are checked before operations. When user hits a limit:

1. **Soft limit (70%)**: Yellow warning in dashboard
2. **Hard limit (90%)**: Red warning + upgrade prompt
3. **At limit (100%)**: Operation blocked + "Upgrade Now" modal

Example flow:

```javascript
// User tries to create 4th project on Free tier (limit: 3)
const check = window.BillingModule.checkLimit('projects');
// check.allowed = false
// check.current = 3
// check.limit = 3
// check.message = "Upgrade to Pro to increase projects limit"

// Show upgrade prompt
if (!check.allowed) {
  BillingUI.showUpgradeModal('projects', 'Free users can only create 3 projects');
}
```

## Trial Period

- **Duration**: 14 days
- **Cost**: Free (no charge during trial)
- **Access**: Full Pro features
- **Auto-upgrade**: On day 15, first payment charged
- **Cancellation**: Anytime before day 15, zero charges

Trial countdown banner shows remaining days:

```javascript
// In trial
state.status = 'trialing'
state.trialEndsAt = timestamp

// Banner shows: "Trial expires in 5 days"
const daysLeft = Math.ceil((state.trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24));
```

## Grace Period

When payment fails:

1. **Day 1-7**: 7-day grace period, full access maintained
2. **Reminder emails**: Days 1, 3, 5, 7
3. **Update payment**: User can retry anytime
4. **After 7 days**: If not resolved, subscription canceled

```javascript
state.status = 'payment_failed'
state.gracePeriodEndsAt = Date.now() + (7 * 24 * 60 * 60 * 1000)
```

## Usage Tracking

Track usage throughout the app:

```javascript
// When user creates a project
window.BillingModule.trackUsage('project-created');

// When user uploads a file (500 KB)
window.BillingModule.trackUsage('storage-added', 0.5);

// When user makes an AI request
window.BillingModule.trackUsage('ai-request');

// When user imports STEP file (50 MB)
window.BillingModule.trackUsage('step-import', 50 * 1024 * 1024);
```

Daily/monthly counters reset automatically:

- **AI requests**: Reset at midnight UTC daily
- **STEP imports**: Reset on 1st of month
- Storage/projects: Continuous accumulation

## Feature Gates

Restrict features by tier:

```javascript
// Check if feature is available
if (!window.BillingModule.hasFeature('api-access')) {
  // Show lock overlay
  element.appendChild(BillingUI.getFeatureGateOverlay('api-access'));
}

// Disable CAM button for Free users
if (!window.BillingModule.hasFeature('cam-operations')) {
  camButton.disabled = true;
  camButton.title = 'CAM operations available in Pro tier';
}
```

## Promo Codes

Pre-configured codes:

- **STUDENT20**: 20% off Pro (with .edu verification)
- **NONPROFIT30**: 30% off Pro (with 501(c)(3) verification)
- **ANNUAL20**: 20% off yearly (auto-applied)
- **REFERRAL25**: €12 credit per referral

Apply at checkout:

```javascript
// User enters code "STUDENT20"
const result = await window.BillingModule.applyPromoCode('STUDENT20');

if (result.valid) {
  // Display: "20% discount applied"
  // Final price updates
}
```

## Testing

Run the comprehensive test suite:

```
Open: app/tests/billing-tests.html
Browser: Any modern browser (Chrome, Firefox, Safari, Edge)
```

### Test Categories

1. **Tier Detection** (5 tests)
   - Default tier is Free
   - Pro/Enterprise limits correct
   - Tier switching works
   - Invalid tier fallback

2. **Limit Checking** (8 tests)
   - Under/at/over limit detection
   - Unlimited tier allows anything
   - Storage warning at 80%
   - AI request daily reset
   - Percentage calculations

3. **Usage Tracking** (6 tests)
   - Project creation tracking
   - Storage tracking
   - AI request tracking
   - All metrics returned
   - Concurrent overflow handling
   - Persistence after save

4. **Trial Period** (4 tests)
   - Countdown calculation
   - Expiration detection
   - Auto-conversion to paid
   - Cancellation before expiry

5. **Promo Codes** (3 tests)
   - Valid code acceptance
   - Invalid code rejection
   - Discount application math

6. **Grace Period** (2 tests)
   - Grace period start on failure
   - Access maintained during grace

7. **Feature Gates** (4 tests)
   - Free tier blocks features
   - Pro tier unlocks features
   - Enforcement across tiers
   - Enterprise unlocks everything

8. **Export/CSV** (2 tests)
   - CSV format generation
   - All metrics included

9. **Offline Mode** (2 tests)
   - Cached data usage
   - Sync on reconnect

### Running Tests

1. Click "Run All Tests" to execute all 38 tests
2. View results in real-time with pass/fail status
3. Check console output for detailed logs
4. Export results as JSON or HTML report

```javascript
// Programmatic test run
await suite.run();
// Returns array of test results with status and errors
```

## Error Handling

### Checkout Errors

```javascript
try {
  await window.BillingModule.startCheckout('pro', 'monthly');
} catch (e) {
  console.error('Checkout failed:', e.message);
  // Show user-friendly error message
}
```

### Payment Failures

On webhook:

```javascript
case 'invoice.payment_failed':
  // Send notification email to user
  // Update subscription status to 'payment_failed'
  // Start 7-day grace period
  // Continue showing access (don't downgrade immediately)
```

### Network Errors

Billing module gracefully handles offline:

```javascript
state.offlineMode = true;
// Use cached data from localStorage
// Sync when connection restored
```

## Database Considerations

Production deployment requires:

1. **User Subscriptions Table**
   - userId (PK)
   - tier (free/pro/enterprise)
   - status (active/trialing/canceled/payment_failed)
   - stripeCustomerId
   - subscriptionId
   - currentPeriodStart
   - currentPeriodEnd
   - trialEndsAt
   - billingCycle (monthly/yearly)
   - cancelAtPeriodEnd

2. **User Usage Table**
   - userId (PK)
   - projects
   - totalParts
   - storageGB
   - aiRequests
   - aiRequestsToday
   - stepImportsThisMonth
   - lastResetDate

3. **Invoices Table**
   - invoiceId (PK)
   - userId (FK)
   - amount
   - currency
   - date
   - status
   - pdfUrl

## Deployment Checklist

- [ ] Set Stripe API keys in environment
- [ ] Create Stripe products and prices
- [ ] Configure webhook endpoint and secret
- [ ] Test checkout flow end-to-end
- [ ] Test subscription management in portal
- [ ] Test invoice generation
- [ ] Run complete test suite
- [ ] Deploy to staging environment
- [ ] User acceptance testing
- [ ] Deploy to production
- [ ] Monitor webhook deliveries
- [ ] Set up billing alerts

## Support & Troubleshooting

### Common Issues

**Q: Stripe keys not working**
A: Verify environment variables are set. Use `console.log` to debug.

**Q: Checkout redirects to error page**
A: Check webhook configuration. Ensure endpoint is accessible.

**Q: Usage not persisting**
A: Check localStorage is enabled. Verify `saveState()` is called.

**Q: Trial not counting down**
A: Verify system time is correct. Trial date calculation depends on `Date.now()`.

### Debugging

Enable verbose logging:

```javascript
// In billing-module.js
console.log('[Billing] ...message');

// In browser console
localStorage.setItem('billing_debug', 'true');
```

## Future Enhancements

1. **Multi-currency support** (USD, GBP, JPY, etc.)
2. **Team billing** (shared subscriptions)
3. **Usage-based pricing** (overage charges)
4. **Seat-based pricing** (per collaborator)
5. **Annual commitment discount** (additional 10%)
6. **Dunning management** (retry failed payments)
7. **Revenue recognition** (for accounting)
8. **Affiliate program** (partner commissions)
9. **Coupon management UI** (create/manage codes)
10. **Billing analytics** (MRR, churn, LTV)

## License

Copyright © 2026 cycleWASH. All rights reserved.
