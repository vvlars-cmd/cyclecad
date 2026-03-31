/**
 * Billing Server - Stripe integration for cycleCAD
 * Express.js server for handling Stripe Checkout, webhooks, and subscription management
 *
 * Endpoints:
 *   POST /billing/create-checkout - Create Stripe Checkout session
 *   POST /billing/create-portal - Create Customer Portal session
 *   POST /billing/webhook - Handle Stripe webhooks
 *   GET /billing/user - Get current user subscription
 *   GET /billing/usage/:userId - Get usage stats
 *   POST /billing/apply-promo - Validate promo code
 *   GET /billing/invoices - List invoices for user
 *   POST /billing/change-billing-cycle - Switch monthly/yearly
 */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_1234567890');
const router = express.Router();

// Middleware
const authMiddleware = (req, res, next) => {
  // In production, verify JWT token from session/cookie
  req.userId = req.session?.userId || req.user?.id || 'test-user-' + Date.now();
  next();
};

router.use(authMiddleware);

// Store for user subscriptions (in production, use database)
const userSubscriptions = new Map();
const userUsage = new Map();

/**
 * POST /billing/create-checkout
 * Create a Stripe Checkout session
 */
router.post('/create-checkout', express.json(), async (req, res) => {
  try {
    const { priceId, tier, billingCycle, trialDays } = req.body;
    const userId = req.userId;

    console.log(`[Billing] Creating checkout for user ${userId}, tier: ${tier}, cycle: ${billingCycle}`);

    // Get or create Stripe customer
    let customerId = userSubscriptions.get(userId)?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId, tier }
      });
      customerId = customer.id;
    }

    // Create checkout session
    const sessionParams = {
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/billing/canceled`,
      subscription_data: {
        metadata: { userId, tier, billingCycle }
      }
    };

    // Add trial period for free users upgrading
    if (trialDays > 0) {
      sessionParams.subscription_data.trial_period_days = trialDays;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(`[Billing] Checkout session created: ${session.id}`);

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('[Billing] Checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /billing/create-portal
 * Create a Stripe Customer Portal session
 */
router.post('/create-portal', express.json(), async (req, res) => {
  try {
    const userId = req.userId;
    const subscription = userSubscriptions.get(userId);

    if (!subscription || !subscription.stripeCustomerId) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: process.env.APP_URL || 'http://localhost:3000'
    });

    console.log(`[Billing] Portal session created: ${session.id}`);

    res.json({ url: session.url });
  } catch (error) {
    console.error('[Billing] Portal error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /billing/webhook
 * Handle Stripe webhook events
 * Must verify webhook signature before processing
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_1234567890';

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Billing] Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Billing] Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`[Billing] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Billing] Webhook processing error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /billing/user
 * Get current user's subscription and usage
 */
router.get('/user', async (req, res) => {
  try {
    const userId = req.userId;
    const subscription = userSubscriptions.get(userId) || createDefaultSubscription(userId);

    res.json({
      userId,
      tier: subscription.tier,
      status: subscription.status,
      stripeCustomerId: subscription.stripeCustomerId,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialEndsAt: subscription.trialEndsAt,
      billingCycle: subscription.billingCycle,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      usage: userUsage.get(userId) || {}
    });
  } catch (error) {
    console.error('[Billing] Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /billing/usage/:userId
 * Get usage stats for a user
 */
router.get('/usage/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Verify user is requesting their own data
    if (userId !== req.userId && !req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const usage = userUsage.get(userId) || {
      projects: 0,
      totalParts: 0,
      storageGB: 0,
      aiRequests: 0,
      aiRequestsToday: 0,
      stepImportsThisMonth: 0,
      stepImportBytesThisMonth: 0
    };

    res.json(usage);
  } catch (error) {
    console.error('[Billing] Get usage error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /billing/track-usage
 * Track usage (called by client when features are used)
 */
router.post('/track-usage', express.json(), async (req, res) => {
  try {
    const userId = req.userId;
    const { feature, amount = 1 } = req.body;

    let usage = userUsage.get(userId) || {};

    switch (feature) {
      case 'ai-request':
        usage.aiRequests = (usage.aiRequests || 0) + 1;
        usage.aiRequestsToday = (usage.aiRequestsToday || 0) + 1;
        break;
      case 'project-created':
        usage.projects = (usage.projects || 0) + 1;
        break;
      case 'part-added':
        usage.totalParts = (usage.totalParts || 0) + 1;
        break;
      case 'storage-added':
        usage.storageGB = (usage.storageGB || 0) + amount;
        break;
      case 'step-import':
        usage.stepImportsThisMonth = (usage.stepImportsThisMonth || 0) + 1;
        usage.stepImportBytesThisMonth = (usage.stepImportBytesThisMonth || 0) + amount;
        break;
    }

    userUsage.set(userId, usage);
    res.json({ success: true, usage });
  } catch (error) {
    console.error('[Billing] Track usage error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /billing/apply-promo
 * Validate and apply promo code
 */
router.post('/apply-promo', express.json(), async (req, res) => {
  try {
    const { code } = req.body;

    // Validate promo code with Stripe
    const promoCodes = await stripe.promotionCodes.list({ code });

    if (promoCodes.data.length === 0) {
      return res.json({
        valid: false,
        message: 'Promo code not found'
      });
    }

    const promoCode = promoCodes.data[0];

    if (!promoCode.active) {
      return res.json({
        valid: false,
        message: 'Promo code is no longer active'
      });
    }

    // Check if code has max redemptions
    if (promoCode.max_redemptions && promoCode.times_redeemed >= promoCode.max_redemptions) {
      return res.json({
        valid: false,
        message: 'Promo code redemption limit reached'
      });
    }

    const coupon = promoCode.coupon;
    const discount = coupon.amount_off ?
      `€${coupon.amount_off / 100}` :
      `${coupon.percent_off}%`;

    res.json({
      valid: true,
      discount,
      message: `Promo code applied: ${discount} off`,
      couponId: coupon.id
    });
  } catch (error) {
    console.error('[Billing] Promo validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /billing/invoices
 * Get list of invoices for current user
 */
router.get('/invoices', async (req, res) => {
  try {
    const userId = req.userId;
    const subscription = userSubscriptions.get(userId);

    if (!subscription || !subscription.stripeCustomerId) {
      return res.json([]);
    }

    const invoices = await stripe.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: 20
    });

    const formattedInvoices = invoices.data.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      amount: invoice.total / 100,
      currency: invoice.currency.toUpperCase(),
      date: new Date(invoice.created * 1000).toISOString(),
      status: invoice.status,
      pdfUrl: invoice.invoice_pdf,
      downloadUrl: invoice.invoice_pdf
    }));

    res.json(formattedInvoices);
  } catch (error) {
    console.error('[Billing] Get invoices error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /billing/change-billing-cycle
 * Switch between monthly and yearly billing
 */
router.post('/change-billing-cycle', express.json(), async (req, res) => {
  try {
    const userId = req.userId;
    const { cycle } = req.body;
    const subscription = userSubscriptions.get(userId);

    if (!subscription || !subscription.stripeCustomriptionId) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    if (!['monthly', 'yearly'].includes(cycle)) {
      return res.status(400).json({ error: 'Invalid billing cycle' });
    }

    // Update subscription (in production, would update Stripe subscription)
    subscription.billingCycle = cycle;
    userSubscriptions.set(userId, subscription);

    res.json({ success: true, billingCycle: cycle });
  } catch (error) {
    console.error('[Billing] Change cycle error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// WEBHOOK HANDLERS
// ============================================================================

/**
 * Handle subscription created or updated
 */
async function handleSubscriptionChange(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  console.log(`[Billing] Subscription updated for user ${userId}`);

  const tierMap = {
    'price_pro_monthly': 'pro',
    'price_pro_yearly': 'pro',
    'price_enterprise_monthly': 'enterprise',
    'price_enterprise_yearly': 'enterprise'
  };

  const priceId = subscription.items.data[0]?.price.id;
  const tier = tierMap[priceId] || 'free';
  const billingCycle = subscription.items.data[0]?.price.recurring?.interval === 'year' ?
    'yearly' : 'monthly';

  const updated = {
    userId,
    tier,
    status: subscription.status,
    stripeCustomerId: subscription.customer,
    subscriptionId: subscription.id,
    currentPeriodStart: subscription.current_period_start * 1000,
    currentPeriodEnd: subscription.current_period_end * 1000,
    trialEndsAt: subscription.trial_end ? subscription.trial_end * 1000 : null,
    billingCycle,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false
  };

  userSubscriptions.set(userId, updated);
  console.log(`[Billing] Updated subscription:`, updated);
}

/**
 * Handle subscription canceled
 */
async function handleSubscriptionCanceled(subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  console.log(`[Billing] Subscription canceled for user ${userId}`);

  const subscription_data = userSubscriptions.get(userId);
  if (subscription_data) {
    subscription_data.status = 'canceled';
    subscription_data.tier = 'free';
    userSubscriptions.set(userId, subscription_data);
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(invoice) {
  const userId = invoice.subscription_details?.metadata?.userId;
  if (!userId) return;

  console.log(`[Billing] Payment succeeded for user ${userId}`);

  const subscription = userSubscriptions.get(userId);
  if (subscription) {
    subscription.status = 'active';
    userSubscriptions.set(userId, subscription);
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  const userId = invoice.subscription_details?.metadata?.userId;
  if (!userId) return;

  console.log(`[Billing] Payment failed for user ${userId}`);

  const subscription = userSubscriptions.get(userId);
  if (subscription) {
    subscription.status = 'payment_failed';
    subscription.gracePeriodEndsAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 day grace
    userSubscriptions.set(userId, subscription);
  }
}

/**
 * Helper: Create default free subscription
 */
function createDefaultSubscription(userId) {
  return {
    userId,
    tier: 'free',
    status: 'active',
    stripeCustomerId: null,
    currentPeriodStart: Date.now(),
    currentPeriodEnd: null,
    trialEndsAt: null,
    billingCycle: 'monthly',
    cancelAtPeriodEnd: false
  };
}

module.exports = router;
