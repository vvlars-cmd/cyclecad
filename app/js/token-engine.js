/**
 * token-engine.js — $CYCLE Token Engine for cycleCAD
 *
 * Implements a per-operation billing system inspired by the Claude API token model.
 * Every CAD operation costs tokens. Tokens can be purchased (€1 = 100 tokens),
 * earned through the marketplace, or generated through cache hits.
 *
 * The engine handles:
 * - Token balance management with localStorage persistence
 * - Double-entry ledger (debit buyer, credit creator + platform)
 * - Per-operation pricing (export, AI analysis, CAM operations, etc.)
 * - Tier system (FREE/PRO/ENTERPRISE)
 * - Cache discounts (10% repeat access within 24h)
 * - Batch discounts (25% for 10+, 50% for 100+)
 * - Escrow system for manufacturing jobs
 * - Token purchase flow (Stripe placeholder)
 * - Transaction history and analytics
 */

(function() {
  'use strict';

  // ============================================================================
  // Constants
  // ============================================================================

  // Tier definitions: tokens per month, creator royalty, features
  const TIERS = {
    FREE: { tokensPerMonth: 1000, creatorRoyalty: 0.70, color: '#999' },
    PRO: { tokensPerMonth: 10000, creatorRoyalty: 0.80, color: '#58a6ff' },
    ENTERPRISE: { tokensPerMonth: 100000, creatorRoyalty: 0.90, color: '#3fb950' },
  };

  // Operation pricing (in tokens)
  const OPERATION_PRICES = {
    // Model operations
    'model.download.mesh': 50,
    'model.download.parametric': 200,
    'model.download.full_ip': 1000,
    'model.export.step': 10,
    'model.export.stl': 2,
    'model.export.gltf': 3,
    'model.export.obj': 2,
    'model.export.json': 1,
    'model.export.dxf': 5,

    // AI operations
    'ai.identify.part': 5,
    'ai.design_review': 15,
    'ai.suggest_material': 3,
    'ai.suggest_fastener': 4,
    'ai.generative_design': 50,

    // CAM operations
    'cam.slice.model': 20,
    'cam.cnc_toolpath': 75,
    'cam.laser_path': 30,
    'cam.foam_cut': 25,

    // Manufacturing
    'fab.submit.job': 100,  // Escrow
    'fab.quote.request': 10,
    'fab.list.vendors': 5,

    // Marketplace
    'marketplace.publish': 0,
    'marketplace.list': 0,
    'marketplace.download': 25,

    // Analysis
    'analysis.thermal': 20,
    'analysis.stress': 30,
    'analysis.clearance': 15,
    'analysis.weight': 2,
    'analysis.cost': 5,

    // Collaboration
    'collab.share': 0,
    'collab.comment': 0,
    'collab.workspace': 50,

    // Default
    '_default': 5,
  };

  // Storage keys
  const STORAGE_KEYS = {
    balance: 'cyclecad_token_balance',
    ledger: 'cyclecad_token_ledger',
    cache: 'cyclecad_token_cache',
    escrow: 'cyclecad_token_escrow',
    tier: 'cyclecad_user_tier',
    monthStart: 'cyclecad_month_start',
    escrowCounter: 'cyclecad_escrow_counter',
  };

  // ============================================================================
  // State
  // ============================================================================

  let userTier = loadTier();
  let balance = loadBalance();
  let ledger = loadLedger();
  let cache = loadCache();
  let escrow = loadEscrow();
  let monthStart = loadMonthStart();
  let escrowCounter = loadEscrowCounter();
  let eventListeners = {};

  // ============================================================================
  // Initialization & Persistence
  // ============================================================================

  function loadBalance() {
    const stored = localStorage.getItem(STORAGE_KEYS.balance);
    return stored ? parseInt(stored) : getTierTokens(userTier || 'FREE');
  }

  function saveBalance() {
    localStorage.setItem(STORAGE_KEYS.balance, balance.toString());
  }

  function loadLedger() {
    const stored = localStorage.getItem(STORAGE_KEYS.ledger);
    return stored ? JSON.parse(stored) : [];
  }

  function saveLedger() {
    localStorage.setItem(STORAGE_KEYS.ledger, JSON.stringify(ledger));
  }

  function loadCache() {
    const stored = localStorage.getItem(STORAGE_KEYS.cache);
    return stored ? JSON.parse(stored) : {};
  }

  function saveCache() {
    localStorage.setItem(STORAGE_KEYS.cache, JSON.stringify(cache));
  }

  function loadEscrow() {
    const stored = localStorage.getItem(STORAGE_KEYS.escrow);
    return stored ? JSON.parse(stored) : {};
  }

  function saveEscrow() {
    localStorage.setItem(STORAGE_KEYS.escrow, JSON.stringify(escrow));
  }

  function loadTier() {
    return localStorage.getItem(STORAGE_KEYS.tier) || 'FREE';
  }

  function saveTier() {
    localStorage.setItem(STORAGE_KEYS.tier, userTier);
  }

  function loadMonthStart() {
    const stored = localStorage.getItem(STORAGE_KEYS.monthStart);
    return stored ? new Date(stored) : new Date();
  }

  function saveMonthStart() {
    localStorage.setItem(STORAGE_KEYS.monthStart, monthStart.toISOString());
  }

  function loadEscrowCounter() {
    const stored = localStorage.getItem(STORAGE_KEYS.escrowCounter);
    return stored ? parseInt(stored) : 0;
  }

  function saveEscrowCounter() {
    localStorage.setItem(STORAGE_KEYS.escrowCounter, escrowCounter.toString());
  }

  // ============================================================================
  // Public API: Balance Management
  // ============================================================================

  function getBalance() {
    checkMonthlyRefresh();
    return balance;
  }

  function getBalanceInfo() {
    checkMonthlyRefresh();
    const tier = TIERS[userTier];
    const monthlyTokens = getTierTokens(userTier);
    const usedThisMonth = calculateMonthlyUsage();
    return {
      balance,
      tier: userTier,
      monthlyAllowance: monthlyTokens,
      usedThisMonth,
      remainingThisMonth: monthlyTokens - usedThisMonth,
      tierColor: tier.color,
      creatorRoyalty: Math.round(tier.creatorRoyalty * 100) + '%',
    };
  }

  function addTokens(amount, source = 'purchase', metadata = {}) {
    if (typeof amount !== 'number' || amount < 0) {
      throw new Error('Token amount must be a non-negative number');
    }
    balance += amount;
    saveBalance();

    const entry = {
      id: generateTransactionId(),
      timestamp: new Date().toISOString(),
      type: 'credit',
      amount,
      operation: source,
      counterparty: 'system',
      balance_after: balance,
      metadata,
    };
    ledger.push(entry);
    saveLedger();

    emit('token-added', { amount, source, balance });
    return entry;
  }

  function spendTokens(amount, operation, metadata = {}) {
    if (typeof amount !== 'number' || amount < 0) {
      throw new Error('Token amount must be a non-negative number');
    }

    checkMonthlyRefresh();

    if (balance < amount) {
      throw new Error(
        `Insufficient tokens: have ${balance}, need ${amount}. ` +
        `Purchase more tokens to continue.`
      );
    }

    balance -= amount;
    saveBalance();

    const entry = {
      id: generateTransactionId(),
      timestamp: new Date().toISOString(),
      type: 'debit',
      amount,
      operation,
      counterparty: 'platform',
      balance_after: balance,
      metadata,
    };
    ledger.push(entry);
    saveLedger();

    // Split between creator and platform
    const creatorShare = Math.round(amount * TIERS[userTier].creatorRoyalty);
    const platformShare = amount - creatorShare;

    if (metadata.creatorId) {
      ledger.push({
        id: generateTransactionId(),
        timestamp: new Date().toISOString(),
        type: 'credit',
        amount: creatorShare,
        operation,
        counterparty: metadata.creatorId,
        balance_after: balance,
        metadata: { originalTransaction: entry.id, ...metadata },
      });
    }

    saveLedger();
    emit('token-spent', { amount, operation, balance, creatorShare, platformShare });
    return entry;
  }

  // ============================================================================
  // Public API: Operation Pricing
  // ============================================================================

  function getPriceForOperation(operationName, params = {}) {
    // Check cache first
    const cacheKey = getCacheKey(operationName, params);
    const cached = cache[cacheKey];
    const now = Date.now();

    if (cached && now - cached.timestamp < 24 * 60 * 60 * 1000) {
      // Cached within 24h: 10% of full price
      const fullPrice = OPERATION_PRICES[operationName] || OPERATION_PRICES._default;
      return Math.ceil(fullPrice * 0.1);
    }

    return OPERATION_PRICES[operationName] || OPERATION_PRICES._default;
  }

  function chargeForOperation(operationName, params = {}, metadata = {}) {
    const price = getPriceForOperation(operationName, params);
    const batchDiscount = calculateBatchDiscount(params.batchSize || 1);
    const finalPrice = Math.ceil(price * (1 - batchDiscount));

    // Record cache hit if this is a repeat operation
    const cacheKey = getCacheKey(operationName, params);
    cache[cacheKey] = { timestamp: Date.now(), params };
    saveCache();

    // Spend tokens
    spendTokens(finalPrice, operationName, {
      originalPrice: price,
      batchDiscount: Math.round(batchDiscount * 100),
      finalPrice,
      ...metadata,
    });

    return { price: finalPrice, discount: batchDiscount };
  }

  function estimateOperation(operationName, params = {}) {
    const basePrice = getPriceForOperation(operationName, params);
    const batchDiscount = calculateBatchDiscount(params.batchSize || 1);
    const finalPrice = Math.ceil(basePrice * (1 - batchDiscount));
    return {
      operation: operationName,
      basePrice,
      batchSize: params.batchSize || 1,
      batchDiscount: Math.round(batchDiscount * 100),
      finalPrice,
      cached: cache[getCacheKey(operationName, params)] ? true : false,
    };
  }

  // ============================================================================
  // Public API: Transaction History & Analytics
  // ============================================================================

  function getTransactionHistory(filters = {}) {
    let results = ledger;

    if (filters.type) {
      results = results.filter(t => t.type === filters.type);
    }

    if (filters.operation) {
      results = results.filter(t => t.operation === filters.operation);
    }

    if (filters.after) {
      const afterTime = new Date(filters.after).getTime();
      results = results.filter(t => new Date(t.timestamp).getTime() > afterTime);
    }

    if (filters.before) {
      const beforeTime = new Date(filters.before).getTime();
      results = results.filter(t => new Date(t.timestamp).getTime() < beforeTime);
    }

    if (filters.minAmount) {
      results = results.filter(t => t.amount >= filters.minAmount);
    }

    const limit = filters.limit || 100;
    return results.slice(-limit).reverse();
  }

  function getMonthlyUsage() {
    const monthStart = loadMonthStart();
    const now = new Date();

    if (monthStart.getMonth() !== now.getMonth() || monthStart.getFullYear() !== now.getFullYear()) {
      checkMonthlyRefresh();
    }

    return calculateMonthlyUsage();
  }

  function calculateMonthlyUsage() {
    const monthStart = loadMonthStart();
    return ledger
      .filter(t => t.type === 'debit' && new Date(t.timestamp) >= monthStart)
      .reduce((sum, t) => sum + t.amount, 0);
  }

  function getUsageByOperation() {
    return ledger.reduce((acc, t) => {
      if (t.type !== 'debit') return acc;
      if (!acc[t.operation]) {
        acc[t.operation] = { count: 0, totalTokens: 0 };
      }
      acc[t.operation].count++;
      acc[t.operation].totalTokens += t.amount;
      return acc;
    }, {});
  }

  function getCostBreakdown() {
    const usage = getUsageByOperation();
    return Object.entries(usage).map(([op, stats]) => ({
      operation: op,
      count: stats.count,
      totalTokens: stats.totalTokens,
      averagePerOp: Math.round(stats.totalTokens / stats.count),
      costInEuros: (stats.totalTokens / 100).toFixed(2),
    }));
  }

  // ============================================================================
  // Public API: Escrow System
  // ============================================================================

  function createEscrow(amount, jobId, fabId, metadata = {}) {
    if (balance < amount) {
      throw new Error(`Insufficient tokens for escrow: have ${balance}, need ${amount}`);
    }

    const escrowId = `escrow_${++escrowCounter}`;
    saveEscrowCounter();

    escrow[escrowId] = {
      id: escrowId,
      amount,
      jobId,
      fabId,
      status: 'held',
      createdAt: new Date().toISOString(),
      releasedAt: null,
      metadata,
    };

    balance -= amount;
    saveBalance();
    saveEscrow();

    const entry = {
      id: generateTransactionId(),
      timestamp: new Date().toISOString(),
      type: 'escrow_hold',
      amount,
      operation: 'fab.submit.job',
      counterparty: fabId,
      balance_after: balance,
      metadata: { escrowId, jobId, ...metadata },
    };
    ledger.push(entry);
    saveLedger();

    emit('escrow-created', { escrowId, amount, jobId, fabId });
    return { escrowId, amount, status: 'held' };
  }

  function releaseEscrow(escrowId) {
    const esc = escrow[escrowId];
    if (!esc) throw new Error(`Escrow not found: ${escrowId}`);
    if (esc.status !== 'held') throw new Error(`Escrow is not held: ${esc.status}`);

    esc.status = 'released';
    esc.releasedAt = new Date().toISOString();
    saveEscrow();

    const entry = {
      id: generateTransactionId(),
      timestamp: new Date().toISOString(),
      type: 'escrow_release',
      amount: esc.amount,
      operation: 'fab.job_complete',
      counterparty: esc.fabId,
      balance_after: balance,
      metadata: { escrowId, jobId: esc.jobId },
    };
    ledger.push(entry);
    saveLedger();

    emit('escrow-released', { escrowId, amount: esc.amount });
    return esc;
  }

  function cancelEscrow(escrowId) {
    const esc = escrow[escrowId];
    if (!esc) throw new Error(`Escrow not found: ${escrowId}`);
    if (esc.status !== 'held') throw new Error(`Escrow is not held: ${esc.status}`);

    balance += esc.amount;
    saveBalance();

    esc.status = 'cancelled';
    esc.cancelledAt = new Date().toISOString();
    saveEscrow();

    const entry = {
      id: generateTransactionId(),
      timestamp: new Date().toISOString(),
      type: 'escrow_cancel',
      amount: esc.amount,
      operation: 'fab.job_cancelled',
      counterparty: 'system',
      balance_after: balance,
      metadata: { escrowId, jobId: esc.jobId },
    };
    ledger.push(entry);
    saveLedger();

    emit('escrow-cancelled', { escrowId, amount: esc.amount });
    return esc;
  }

  function getEscrowStatus(escrowId) {
    return escrow[escrowId] || null;
  }

  // ============================================================================
  // Public API: Tier Management
  // ============================================================================

  function setTier(newTier) {
    if (!TIERS[newTier]) {
      throw new Error(`Invalid tier: ${newTier}. Must be FREE, PRO, or ENTERPRISE`);
    }

    const oldTier = userTier;
    userTier = newTier;
    saveTier();

    // Reset monthly refresh on tier change
    monthStart = new Date();
    saveMonthStart();

    // Reset balance to new tier's monthly allowance
    balance = getTierTokens(newTier);
    saveBalance();

    emit('tier-changed', { oldTier, newTier, balance });
    return { tier: newTier, monthlyTokens: getTierTokens(newTier) };
  }

  function getTier() {
    return {
      tier: userTier,
      ...TIERS[userTier],
      balance,
      monthlyTokens: getTierTokens(userTier),
    };
  }

  // ============================================================================
  // Public API: Purchase Flow
  // ============================================================================

  function purchaseTokens(amount, method = 'stripe') {
    if (typeof amount !== 'number' || amount < 10) {
      throw new Error('Minimum purchase is 10 tokens (€0.10)');
    }

    // In a real app, this would initiate Stripe checkout
    // For now, we return a checkout session object
    const checkoutSession = {
      id: generateTransactionId(),
      type: 'token_purchase',
      tokens: amount,
      euros: (amount / 100).toFixed(2),
      method,
      status: 'pending',
      createdAt: new Date().toISOString(),
      stripeCheckoutUrl: `https://checkout.stripe.com/pay/cs_test_${generateTransactionId().slice(0, 20)}`,
      metadata: {
        callback: 'onPurchaseComplete',
        environment: 'browser',
      },
    };

    emit('purchase-initiated', checkoutSession);
    return checkoutSession;
  }

  function purchaseWithCrypto(amount, currency = 'USDC') {
    const supportedCurrencies = ['USDC', 'ETH', 'BTC'];
    if (!supportedCurrencies.includes(currency)) {
      throw new Error(`Unsupported currency: ${currency}`);
    }

    const tokenAmount = amount * 100; // Assume 1 unit = €1
    const checkoutSession = {
      id: generateTransactionId(),
      type: 'token_purchase_crypto',
      tokens: tokenAmount,
      amount,
      currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
      walletAddress: null, // Would be set by user or wallet integration
      metadata: { callback: 'onCryptoPurchaseComplete' },
    };

    emit('crypto-purchase-initiated', checkoutSession);
    return checkoutSession;
  }

  function completePurchase(purchaseId, tokens) {
    return addTokens(tokens, 'stripe_purchase', { purchaseId, completedAt: new Date().toISOString() });
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function checkMonthlyRefresh() {
    const now = new Date();
    if (monthStart.getMonth() !== now.getMonth() || monthStart.getFullYear() !== now.getFullYear()) {
      // New month: reset balance to tier allowance
      balance = getTierTokens(userTier);
      monthStart = new Date();
      saveBalance();
      saveMonthStart();
      emit('month-reset', { balance, tier: userTier });
    }
  }

  function getTierTokens(tier) {
    return TIERS[tier]?.tokensPerMonth || TIERS.FREE.tokensPerMonth;
  }

  function calculateBatchDiscount(batchSize) {
    if (batchSize >= 100) return 0.5;
    if (batchSize >= 10) return 0.25;
    return 0;
  }

  function getCacheKey(operation, params) {
    // Simple hash based on operation and param keys
    const paramStr = JSON.stringify(params);
    return `${operation}:${paramStr}`;
  }

  function generateTransactionId() {
    return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  // ============================================================================
  // Event System
  // ============================================================================

  function on(event, listener) {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(listener);
  }

  function off(event, listener) {
    if (!eventListeners[event]) return;
    eventListeners[event] = eventListeners[event].filter(l => l !== listener);
  }

  function emit(event, data) {
    if (!eventListeners[event]) return;
    eventListeners[event].forEach(listener => {
      try {
        listener(data);
      } catch (err) {
        console.error(`Token engine event listener error for "${event}":`, err);
      }
    });
  }

  // ============================================================================
  // Debug & Export
  // ============================================================================

  function exportDataAsJSON() {
    return {
      balance,
      tier: userTier,
      monthStart: monthStart.toISOString(),
      ledger,
      escrow,
      cache: Object.keys(cache).length + ' cached operations',
    };
  }

  function clearAllData() {
    if (!confirm('This will delete all token data. Are you sure?')) return;
    balance = getTierTokens('FREE');
    ledger = [];
    cache = {};
    escrow = {};
    userTier = 'FREE';
    monthStart = new Date();
    escrowCounter = 0;
    saveBalance();
    saveLedger();
    saveCache();
    saveEscrow();
    saveTier();
    saveMonthStart();
    saveEscrowCounter();
    emit('data-cleared', {});
  }

  // ============================================================================
  // Public API Exposure
  // ============================================================================

  window.cycleCAD = window.cycleCAD || {};

  window.cycleCAD.tokens = {
    // Balance
    getBalance,
    getBalanceInfo,
    addTokens,
    spendTokens,

    // Pricing
    getPriceForOperation,
    chargeForOperation,
    estimateOperation,

    // History & Analytics
    getTransactionHistory,
    getMonthlyUsage,
    getUsageByOperation,
    getCostBreakdown,

    // Escrow
    createEscrow,
    releaseEscrow,
    cancelEscrow,
    getEscrowStatus,

    // Tier
    setTier,
    getTier,

    // Purchase
    purchaseTokens,
    purchaseWithCrypto,
    completePurchase,

    // Events
    on,
    off,

    // Debug
    exportDataAsJSON,
    clearAllData,
  };

  console.log('[Token Engine] $CYCLE initialized. Free tier: 1,000 tokens/month. Type window.cycleCAD.tokens to access API.');
})();
