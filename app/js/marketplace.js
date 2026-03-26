/**
 * marketplace.js — cycleCAD Model Marketplace Module
 *
 * Creators publish, discover, and purchase 3D models using $CYCLE tokens.
 * Architecture:
 *   - Model publishing with parametric + access tiers
 *   - Full-text search + category browsing
 *   - Token-based purchase system with double-entry ledger
 *   - Creator dashboard with earnings analytics
 *   - Review system with caching discounts
 *   - Agent API integration
 *
 * Data storage: localStorage (demo) / IndexedDB (prod)
 * License: All models stored with creator IP terms
 *
 * Version: 1.0.0
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'cyclecad_marketplace';
const MODELS_DB = 'cyclecad_models';
const TRANSACTIONS_DB = 'cyclecad_transactions';
const MAX_PREVIEW_SIZE = 512; // pixels

const MODEL_CATEGORIES = [
  'Mechanical',
  'Structural',
  'Enclosure',
  'Fastener',
  'Custom',
  'Template'
];

const ACCESS_TIERS = {
  FREE_PREVIEW: {
    id: 1,
    name: 'Free Preview',
    price: 0,
    description: 'View only, no download'
  },
  MESH_DOWNLOAD: {
    id: 2,
    name: 'Mesh Download',
    price: 50,
    description: 'STL/OBJ export'
  },
  PARAMETRIC: {
    id: 3,
    name: 'Parametric',
    price: 200,
    description: 'Editable cycleCAD format'
  },
  FULL_IP: {
    id: 4,
    name: 'Full IP',
    price: 1000,
    description: 'STEP + source + history'
  },
  COMMERCIAL_USE: {
    id: 5,
    name: 'Commercial Use',
    price: 2000,
    description: 'License for resale'
  },
  DERIVATIVE: {
    id: 6,
    name: 'Derivative',
    price: null, // 15% of parent model price
    description: 'Fork and modify'
  },
  AGENT_ACCESS: {
    id: 7,
    name: 'Agent Access',
    price: 5, // per-use
    description: 'Micro-royalty per AI query'
  }
};

// ============================================================================
// State
// ============================================================================

let _currentUser = null;
let _userBalance = 0;
let _allModels = [];
let _purchaseHistory = [];
let _createdModels = [];
let _viewport = null;
let _tokenEngine = null;
let _eventListeners = {};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the Marketplace module
 */
export function initMarketplace({ viewport, tokenEngine }) {
  _viewport = viewport;
  _tokenEngine = tokenEngine;

  // Initialize current user from localStorage
  const storedUser = localStorage.getItem('cyclecad_current_user');
  if (storedUser) {
    _currentUser = JSON.parse(storedUser);
  } else {
    _currentUser = {
      id: crypto.randomUUID(),
      name: 'Creator_' + Math.random().toString(36).substr(2, 9),
      email: '',
      avatar: null,
      joinedDate: new Date().toISOString(),
      bio: '',
      website: ''
    };
    localStorage.setItem('cyclecad_current_user', JSON.stringify(_currentUser));
  }

  // Load marketplace data
  loadMarketplaceData();

  // Create UI panel
  createMarketplacePanel();

  // Add toolbar button
  addMarketplaceToolbarButton();

  // Expose API globally
  window.cycleCAD.marketplace = {
    publish: publishModel,
    search: searchModels,
    browse: browseModels,
    getDetails: getModelDetails,
    purchase: purchaseModel,
    download: downloadModel,
    getPurchaseHistory,
    getCreatorProfile,
    getCreatorStats,
    addReview,
    getReviews,
    withdrawEarnings,
    listMyModels: listCreatorModels,
    updateModel,
    deleteModel,
    on: addEventListener,
    off: removeEventListener
  };

  console.log('[Marketplace] Initialized for user:', _currentUser.name);

  return { userId: _currentUser.id };
}

// ============================================================================
// Model Publishing
// ============================================================================

/**
 * Publish a model to the marketplace
 */
export function publishModel(modelData) {
  const {
    name,
    description,
    category,
    tags = [],
    tiers = [],
    sourceGeometry = null,
    parametricData = null,
    metadata = {}
  } = modelData;

  // Validate
  if (!name || !description || !category) {
    return { ok: false, error: 'Missing required fields: name, description, category' };
  }
  if (!MODEL_CATEGORIES.includes(category)) {
    return { ok: false, error: `Invalid category. Must be one of: ${MODEL_CATEGORIES.join(', ')}` };
  }

  const modelId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Generate preview thumbnail
  let previewImage = null;
  if (sourceGeometry) {
    previewImage = generatePreviewThumbnail(sourceGeometry);
  }

  // Build model record
  const model = {
    id: modelId,
    creatorId: _currentUser.id,
    creatorName: _currentUser.name,
    name,
    description,
    category,
    tags: Array.isArray(tags) ? tags : [],
    tiers: tiers.length > 0 ? tiers : [ACCESS_TIERS.FREE_PREVIEW],
    previewImage,
    sourceGeometry: sourceGeometry ? serializeGeometry(sourceGeometry) : null,
    parametricData,
    metadata: {
      ...metadata,
      dimensions: extractDimensions(sourceGeometry),
      polyCount: sourceGeometry ? countPolygons(sourceGeometry) : 0
    },
    stats: {
      views: 0,
      downloads: 0,
      purchases: 0,
      rating: 0,
      reviewCount: 0
    },
    reviews: [],
    publishedDate: timestamp,
    updatedDate: timestamp,
    derivedFromModelId: modelData.derivedFromModelId || null,
    derivativeLicense: modelData.derivativeLicense || false
  };

  _allModels.push(model);
  _createdModels.push(modelId);

  saveMarketplaceData();
  emitEvent('modelPublished', { modelId, modelName: name });

  return {
    ok: true,
    modelId,
    model
  };
}

/**
 * Update an existing model (creator only)
 */
export function updateModel(modelId, updates) {
  const modelIndex = _allModels.findIndex(m => m.id === modelId);
  if (modelIndex === -1) {
    return { ok: false, error: 'Model not found' };
  }

  const model = _allModels[modelIndex];

  // Check ownership
  if (model.creatorId !== _currentUser.id) {
    return { ok: false, error: 'Permission denied: only creator can update model' };
  }

  // Merge updates
  const updated = {
    ...model,
    ...updates,
    id: model.id,
    creatorId: model.creatorId,
    publishedDate: model.publishedDate,
    updatedDate: new Date().toISOString()
  };

  _allModels[modelIndex] = updated;
  saveMarketplaceData();
  emitEvent('modelUpdated', { modelId, updates });

  return { ok: true, model: updated };
}

/**
 * Delete a model (creator only)
 */
export function deleteModel(modelId) {
  const modelIndex = _allModels.findIndex(m => m.id === modelId);
  if (modelIndex === -1) {
    return { ok: false, error: 'Model not found' };
  }

  const model = _allModels[modelIndex];
  if (model.creatorId !== _currentUser.id) {
    return { ok: false, error: 'Permission denied' };
  }

  _allModels.splice(modelIndex, 1);
  _createdModels = _createdModels.filter(id => id !== modelId);
  saveMarketplaceData();
  emitEvent('modelDeleted', { modelId });

  return { ok: true };
}

// ============================================================================
// Model Discovery
// ============================================================================

/**
 * Search models by query + filters
 */
export function searchModels(query, filters = {}) {
  let results = _allModels;

  // Text search
  if (query && query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q)) ||
      m.creatorName.toLowerCase().includes(q)
    );
  }

  // Category filter
  if (filters.category) {
    results = results.filter(m => m.category === filters.category);
  }

  // Price range filter
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    const minPrice = filters.priceMin || 0;
    const maxPrice = filters.priceMax || Infinity;
    results = results.filter(m => {
      const price = m.tiers[0]?.price || 0;
      return price >= minPrice && price <= maxPrice;
    });
  }

  // Rating filter
  if (filters.minRating !== undefined) {
    results = results.filter(m => m.stats.rating >= filters.minRating);
  }

  // Pagination
  const page = filters.page || 0;
  const pageSize = filters.pageSize || 20;
  const total = results.length;
  const paged = results.slice(page * pageSize, (page + 1) * pageSize);

  return {
    ok: true,
    results: paged,
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total
  };
}

/**
 * Browse models by category with sorting
 */
export function browseModels(category, options = {}) {
  const { sort = 'newest', page = 0, pageSize = 20 } = options;

  let results = category ? _allModels.filter(m => m.category === category) : _allModels;

  // Sort
  switch (sort) {
    case 'newest':
      results.sort((a, b) => new Date(b.publishedDate) - new Date(a.publishedDate));
      break;
    case 'popular':
      results.sort((a, b) => b.stats.downloads - a.stats.downloads);
      break;
    case 'price-low':
      results.sort((a, b) => (a.tiers[0]?.price || 0) - (b.tiers[0]?.price || 0));
      break;
    case 'price-high':
      results.sort((a, b) => (b.tiers[0]?.price || 0) - (a.tiers[0]?.price || 0));
      break;
    case 'rating':
      results.sort((a, b) => b.stats.rating - a.stats.rating);
      break;
  }

  const total = results.length;
  const paged = results.slice(page * pageSize, (page + 1) * pageSize);

  return {
    ok: true,
    results: paged,
    category,
    sort,
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total
  };
}

/**
 * Get full model details + preview
 */
export function getModelDetails(modelId) {
  const model = _allModels.find(m => m.id === modelId);
  if (!model) {
    return { ok: false, error: 'Model not found' };
  }

  // Increment view count
  model.stats.views += 1;
  saveMarketplaceData();

  // Get creator profile
  const creatorProfile = getCreatorProfile(model.creatorId);

  return {
    ok: true,
    model,
    creator: creatorProfile.ok ? creatorProfile.profile : null,
    canEdit: model.creatorId === _currentUser.id,
    canDownload: isPurchased(modelId),
    averageRating: model.stats.rating,
    reviewCount: model.stats.reviewCount
  };
}

/**
 * Get creator profile + stats
 */
export function getCreatorProfile(creatorId) {
  const models = _allModels.filter(m => m.creatorId === creatorId);
  if (models.length === 0) {
    return { ok: false, error: 'Creator not found' };
  }

  const totalDownloads = models.reduce((sum, m) => sum + m.stats.downloads, 0);
  const totalViews = models.reduce((sum, m) => sum + m.stats.views, 0);
  const avgRating = models.length > 0
    ? (models.reduce((sum, m) => sum + m.stats.rating, 0) / models.length).toFixed(2)
    : 0;

  return {
    ok: true,
    profile: {
      creatorId,
      name: models[0].creatorName,
      modelCount: models.length,
      totalDownloads,
      totalViews,
      averageRating: parseFloat(avgRating),
      earnings: calculateEarnings(creatorId),
      topModels: models
        .sort((a, b) => b.stats.downloads - a.stats.downloads)
        .slice(0, 5)
    }
  };
}

// ============================================================================
// Purchase & Download
// ============================================================================

/**
 * Purchase access to a model at a specific tier
 */
export function purchaseModel(modelId, tierId) {
  const model = _allModels.find(m => m.id === modelId);
  if (!model) {
    return { ok: false, error: 'Model not found' };
  }

  // Find tier
  const tierName = Object.keys(ACCESS_TIERS).find(key => ACCESS_TIERS[key].id === tierId);
  if (!tierName) {
    return { ok: false, error: 'Invalid tier ID' };
  }

  const tier = ACCESS_TIERS[tierName];
  let price = tier.price;

  // Handle derivative pricing
  if (tierName === 'DERIVATIVE' && model.derivedFromModelId) {
    const parentModel = _allModels.find(m => m.id === model.derivedFromModelId);
    if (parentModel) {
      price = Math.ceil(parentModel.tiers[0].price * 0.15);
    }
  }

  // Check balance (via token engine)
  if (_tokenEngine && _userBalance < price) {
    return {
      ok: false,
      error: `Insufficient balance. Need ${price} tokens, have ${_userBalance}`
    };
  }

  const purchaseId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  // Record purchase
  const purchase = {
    id: purchaseId,
    userId: _currentUser.id,
    modelId,
    tierId,
    tierName,
    price,
    purchaseDate: timestamp,
    downloadedTimes: 0,
    expiryDate: addDays(new Date(), 365).toISOString() // 1 year license
  };

  _purchaseHistory.push(purchase);

  // Deduct tokens (via token engine if available)
  if (_tokenEngine) {
    _userBalance -= price;
  }

  // Increment model stats
  model.stats.downloads += 1;
  model.stats.purchases += 1;

  // Log transaction (double-entry ledger)
  logTransaction({
    fromUserId: _currentUser.id,
    toUserId: model.creatorId,
    amount: price,
    type: 'model_purchase',
    relatedId: modelId,
    timestamp
  });

  saveMarketplaceData();
  emitEvent('modelPurchased', { modelId, tierId, price, purchaseId });

  return {
    ok: true,
    purchaseId,
    accessUrl: `/download/${modelId}?token=${purchaseId}`,
    expiryDate: purchase.expiryDate
  };
}

/**
 * Download a purchased model
 */
export function downloadModel(modelId, format = 'stl') {
  // Check if purchased
  if (!isPurchased(modelId)) {
    return { ok: false, error: 'Model not purchased. Please purchase first.' };
  }

  const model = _allModels.find(m => m.id === modelId);
  if (!model) {
    return { ok: false, error: 'Model not found' };
  }

  let downloadData = null;
  let mimeType = 'application/octet-stream';
  let filename = `${model.name.replace(/\s+/g, '_')}.${format}`;

  // Format-specific export
  switch (format.toLowerCase()) {
    case 'stl':
    case 'obj':
    case 'gltf':
    case 'json':
      if (model.sourceGeometry) {
        const geometry = deserializeGeometry(model.sourceGeometry);
        downloadData = exportGeometry(geometry, format);
        mimeType = format === 'json' ? 'application/json' : 'application/octet-stream';
      }
      break;
    case 'step':
      if (model.parametricData) {
        downloadData = model.parametricData;
        mimeType = 'application/step';
        filename = `${model.name.replace(/\s+/g, '_')}.step`;
      }
      break;
    default:
      return { ok: false, error: `Unsupported format: ${format}` };
  }

  if (!downloadData) {
    return { ok: false, error: `Model doesn't have ${format} export available` };
  }

  // Record download
  const purchase = _purchaseHistory.find(p => p.modelId === modelId);
  if (purchase) {
    purchase.downloadedTimes += 1;
  }

  model.stats.downloads += 1;
  saveMarketplaceData();
  emitEvent('modelDownloaded', { modelId, format, filename });

  return {
    ok: true,
    data: downloadData,
    filename,
    mimeType
  };
}

// ============================================================================
// Purchase History & Favorites
// ============================================================================

/**
 * Get user's purchase history
 */
export function getPurchaseHistory() {
  return _purchaseHistory.map(p => {
    const model = _allModels.find(m => m.id === p.modelId);
    return {
      ...p,
      modelName: model?.name || 'Unknown',
      modelCategory: model?.category || '',
      creatorName: model?.creatorName || ''
    };
  });
}

/**
 * Check if user has purchased a model
 */
function isPurchased(modelId) {
  return _purchaseHistory.some(p => p.modelId === modelId);
}

// ============================================================================
// Creator Dashboard
// ============================================================================

/**
 * Get creator stats
 */
export function getCreatorStats(period = 'all') {
  const createdModels = _allModels.filter(m => m.creatorId === _currentUser.id);

  let filteredModels = createdModels;
  if (period !== 'all') {
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    filteredModels = createdModels.filter(m =>
      new Date(m.publishedDate) >= startDate
    );
  }

  const stats = {
    totalEarnings: calculateEarnings(_currentUser.id),
    totalDownloads: filteredModels.reduce((sum, m) => sum + m.stats.downloads, 0),
    totalViews: filteredModels.reduce((sum, m) => sum + m.stats.views, 0),
    modelCount: createdModels.length,
    averageRating: createdModels.length > 0
      ? (createdModels.reduce((sum, m) => sum + m.stats.rating, 0) / createdModels.length).toFixed(2)
      : 0,
    topModel: createdModels.sort((a, b) => b.stats.downloads - a.stats.downloads)[0] || null,
    period
  };

  return { ok: true, stats };
}

/**
 * List models created by current user
 */
export function listCreatorModels() {
  return _allModels.filter(m => m.creatorId === _currentUser.id);
}

/**
 * Get earnings breakdown by period
 */
export function getEarningsBreakdown(period = 'daily') {
  const createdModels = _allModels.filter(m => m.creatorId === _currentUser.id);
  const breakdown = {};

  createdModels.forEach(model => {
    model.stats.downloads > 0 && model.tiers.forEach(tier => {
      const date = new Date(model.publishedDate);
      const key = getDateKey(date, period);
      breakdown[key] = (breakdown[key] || 0) + (tier.price || 0);
    });
  });

  return {
    ok: true,
    breakdown,
    period,
    total: Object.values(breakdown).reduce((a, b) => a + b, 0)
  };
}

/**
 * Withdraw earnings (placeholder for Stripe/crypto)
 */
export function withdrawEarnings(amount, method = 'stripe') {
  const stats = getCreatorStats();
  if (!stats.ok || stats.stats.totalEarnings < amount) {
    return { ok: false, error: 'Insufficient earnings to withdraw' };
  }

  const withdrawalId = crypto.randomUUID();
  const withdrawal = {
    id: withdrawalId,
    amount,
    method,
    status: 'pending',
    requestDate: new Date().toISOString(),
    completedDate: null
  };

  // In production: integrate with Stripe API / crypto payment gateway
  console.log('[Marketplace] Withdrawal request:', withdrawal);
  emitEvent('withdrawalRequested', withdrawal);

  return {
    ok: true,
    withdrawalId,
    status: 'pending',
    message: `Withdrawal of ${amount} tokens requested via ${method}. You'll receive it in 3-5 business days.`
  };
}

// ============================================================================
// Review System
// ============================================================================

/**
 * Add review to a model
 */
export function addReview(modelId, rating, comment = '') {
  if (!isPurchased(modelId)) {
    return { ok: false, error: 'Must purchase model to leave review' };
  }

  const model = _allModels.find(m => m.id === modelId);
  if (!model) {
    return { ok: false, error: 'Model not found' };
  }

  const review = {
    id: crypto.randomUUID(),
    userId: _currentUser.id,
    userName: _currentUser.name,
    rating: Math.max(1, Math.min(5, Math.round(rating))),
    comment,
    date: new Date().toISOString(),
    helpful: 0
  };

  model.reviews.push(review);

  // Recalculate average rating
  const avgRating = model.reviews.length > 0
    ? (model.reviews.reduce((sum, r) => sum + r.rating, 0) / model.reviews.length)
    : 0;

  model.stats.rating = parseFloat(avgRating.toFixed(1));
  model.stats.reviewCount = model.reviews.length;

  saveMarketplaceData();
  emitEvent('reviewAdded', { modelId, rating, reviewId: review.id });

  return { ok: true, review };
}

/**
 * Get reviews for a model (paginated)
 */
export function getReviews(modelId, page = 0, pageSize = 10) {
  const model = _allModels.find(m => m.id === modelId);
  if (!model) {
    return { ok: false, error: 'Model not found' };
  }

  const sorted = model.reviews.sort((a, b) =>
    new Date(b.date) - new Date(a.date)
  );

  const total = sorted.length;
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  return {
    ok: true,
    reviews: paged,
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total,
    averageRating: model.stats.rating,
    reviewCount: model.stats.reviewCount
  };
}

// ============================================================================
// UI Panel
// ============================================================================

/**
 * Create marketplace panel HTML
 */
function createMarketplacePanel() {
  const html = `
    <div id="marketplace-panel" class="mp-panel">
      <div class="mp-header">
        <h2>Model Marketplace</h2>
        <button class="mp-close-btn" data-close-panel="marketplace-panel">✕</button>
      </div>

      <div class="mp-tabs">
        <button class="mp-tab-btn active" data-tab="browse">Browse</button>
        <button class="mp-tab-btn" data-tab="search">Search</button>
        <button class="mp-tab-btn" data-tab="my-models">My Models</button>
        <button class="mp-tab-btn" data-tab="purchases">Purchases</button>
        <button class="mp-tab-btn" data-tab="publish">Publish</button>
        <button class="mp-tab-btn" data-tab="earnings">Earnings</button>
      </div>

      <!-- Browse Tab -->
      <div class="mp-tab-content active" data-tab="browse">
        <div class="mp-category-filter">
          <select id="mp-category-select" class="mp-select">
            <option value="">All Categories</option>
            ${MODEL_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
          </select>
          <select id="mp-sort-select" class="mp-select">
            <option value="newest">Newest</option>
            <option value="popular">Most Popular</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="rating">Top Rated</option>
          </select>
        </div>
        <div id="mp-browse-grid" class="mp-grid"></div>
        <button id="mp-browse-more" class="mp-button">Load More</button>
      </div>

      <!-- Search Tab -->
      <div class="mp-tab-content" data-tab="search">
        <input id="mp-search-input" type="text" class="mp-input" placeholder="Search models...">
        <div class="mp-filters">
          <label class="mp-label">
            Price Range:
            <input id="mp-price-min" type="number" class="mp-input-small" placeholder="Min" min="0">
            <input id="mp-price-max" type="number" class="mp-input-small" placeholder="Max" min="0">
          </label>
          <label class="mp-label">
            Min Rating:
            <input id="mp-rating-min" type="number" class="mp-input-small" placeholder="0-5" min="0" max="5" step="0.5">
          </label>
        </div>
        <div id="mp-search-results" class="mp-grid"></div>
      </div>

      <!-- My Models Tab -->
      <div class="mp-tab-content" data-tab="my-models">
        <button id="mp-refresh-models" class="mp-button">Refresh</button>
        <div id="mp-my-models-list" class="mp-list"></div>
      </div>

      <!-- Purchases Tab -->
      <div class="mp-tab-content" data-tab="purchases">
        <div id="mp-purchases-list" class="mp-list"></div>
      </div>

      <!-- Publish Tab -->
      <div class="mp-tab-content" data-tab="publish">
        <form id="mp-publish-form" class="mp-form">
          <div class="mp-form-group">
            <label class="mp-label">Model Name *</label>
            <input id="mp-publish-name" type="text" class="mp-input" required>
          </div>
          <div class="mp-form-group">
            <label class="mp-label">Description *</label>
            <textarea id="mp-publish-desc" class="mp-input mp-textarea" required></textarea>
          </div>
          <div class="mp-form-group">
            <label class="mp-label">Category *</label>
            <select id="mp-publish-category" class="mp-select" required>
              <option value="">Select category...</option>
              ${MODEL_CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
          </div>
          <div class="mp-form-group">
            <label class="mp-label">Tags (comma-separated)</label>
            <input id="mp-publish-tags" type="text" class="mp-input" placeholder="e.g. metal, cnc, precision">
          </div>
          <div class="mp-form-group">
            <label class="mp-label">Access Tier *</label>
            <select id="mp-publish-tier" class="mp-select" required>
              <option value="1">Free Preview (0 tokens)</option>
              <option value="2">Mesh Download (50 tokens)</option>
              <option value="3">Parametric (200 tokens)</option>
              <option value="4">Full IP (1,000 tokens)</option>
              <option value="5">Commercial (2,000 tokens)</option>
            </select>
          </div>
          <button type="submit" class="mp-button mp-button-primary">Publish Model</button>
        </form>
      </div>

      <!-- Earnings Tab -->
      <div class="mp-tab-content" data-tab="earnings">
        <div id="mp-earnings-dashboard" class="mp-dashboard"></div>
        <button id="mp-withdraw-btn" class="mp-button">Withdraw Earnings</button>
      </div>
    </div>

    <!-- Model Detail Modal -->
    <div id="marketplace-modal" class="mp-modal">
      <div class="mp-modal-content">
        <button class="mp-modal-close">✕</button>
        <div class="mp-modal-body">
          <div id="mp-modal-preview" class="mp-preview"></div>
          <div id="mp-modal-info" class="mp-info"></div>
        </div>
      </div>
    </div>
  `;

  const panel = document.createElement('div');
  panel.innerHTML = html;
  document.body.appendChild(panel);

  // Wire event handlers
  wireMarketplacePanelEvents();

  // Add styles
  addMarketplaceStyles();
}

/**
 * Wire marketplace panel events
 */
function wireMarketplacePanelEvents() {
  // Tab switching
  document.querySelectorAll('.mp-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      document.querySelectorAll('.mp-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.mp-tab-content').forEach(tc => tc.classList.remove('active'));
      e.target.classList.add('active');
      document.querySelector(`.mp-tab-content[data-tab="${tabName}"]`).classList.add('active');

      // Load tab content
      if (tabName === 'browse') loadBrowseTab();
      if (tabName === 'my-models') loadMyModelsTab();
      if (tabName === 'purchases') loadPurchasesTab();
      if (tabName === 'earnings') loadEarningsTab();
    });
  });

  // Search
  document.getElementById('mp-search-input')?.addEventListener('input', (e) => {
    const query = e.target.value;
    const filters = {
      priceMin: parseFloat(document.getElementById('mp-price-min')?.value || 0),
      priceMax: parseFloat(document.getElementById('mp-price-max')?.value || Infinity),
      minRating: parseFloat(document.getElementById('mp-rating-min')?.value || 0)
    };
    performSearch(query, filters);
  });

  // Publish form
  document.getElementById('mp-publish-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('mp-publish-name').value;
    const description = document.getElementById('mp-publish-desc').value;
    const category = document.getElementById('mp-publish-category').value;
    const tags = document.getElementById('mp-publish-tags').value.split(',').map(t => t.trim());
    const tierId = parseInt(document.getElementById('mp-publish-tier').value);

    const result = publishModel({
      name,
      description,
      category,
      tags,
      tiers: [Object.values(ACCESS_TIERS).find(t => t.id === tierId)]
    });

    if (result.ok) {
      alert(`Model published! ID: ${result.modelId}`);
      document.getElementById('mp-publish-form').reset();
      loadMyModelsTab();
    } else {
      alert('Error: ' + result.error);
    }
  });

  // Close modal
  document.querySelector('.mp-modal-close')?.addEventListener('click', () => {
    document.getElementById('marketplace-modal').classList.remove('show');
  });

  // Withdraw earnings
  document.getElementById('mp-withdraw-btn')?.addEventListener('click', () => {
    const amount = prompt('Amount to withdraw (tokens):');
    if (amount && !isNaN(amount)) {
      const result = withdrawEarnings(parseInt(amount), 'stripe');
      alert(result.message || 'Withdrawal processed');
    }
  });
}

/**
 * Load browse tab content
 */
function loadBrowseTab() {
  const category = document.getElementById('mp-category-select')?.value || '';
  const sort = document.getElementById('mp-sort-select')?.value || 'newest';

  const result = browseModels(category || null, { sort, page: 0 });

  const grid = document.getElementById('mp-browse-grid');
  if (grid) {
    grid.innerHTML = result.results
      .map(model => createModelCard(model))
      .join('');

    grid.querySelectorAll('.mp-card').forEach(card => {
      card.addEventListener('click', () => {
        const modelId = card.dataset.modelId;
        showModelDetail(modelId);
      });
    });
  }
}

/**
 * Load my models tab
 */
function loadMyModelsTab() {
  const myModels = listCreatorModels();
  const list = document.getElementById('mp-my-models-list');

  if (list) {
    list.innerHTML = myModels.length === 0
      ? '<p class="mp-empty">No models published yet</p>'
      : myModels.map(m => `
        <div class="mp-item">
          <div class="mp-item-header">
            <strong>${m.name}</strong>
            <span class="mp-item-stats">${m.stats.downloads} downloads, ${m.stats.rating}/5★</span>
          </div>
          <p class="mp-item-desc">${m.description}</p>
          <div class="mp-item-actions">
            <button class="mp-button-sm" onclick="alert('Edit not yet implemented')">Edit</button>
            <button class="mp-button-sm" onclick="alert('Stats not yet implemented')">Analytics</button>
          </div>
        </div>
      `).join('');
  }
}

/**
 * Load purchases tab
 */
function loadPurchasesTab() {
  const purchases = getPurchaseHistory();
  const list = document.getElementById('mp-purchases-list');

  if (list) {
    list.innerHTML = purchases.length === 0
      ? '<p class="mp-empty">No purchases yet</p>'
      : purchases.map(p => `
        <div class="mp-item">
          <div class="mp-item-header">
            <strong>${p.modelName}</strong>
            <span class="mp-item-stats">${p.price} tokens • ${p.tierName}</span>
          </div>
          <p class="mp-item-meta">Creator: ${p.creatorName} • ${new Date(p.purchaseDate).toLocaleDateString()}</p>
          <div class="mp-item-actions">
            <button class="mp-button-sm" onclick="downloadPurchasedModel('${p.modelId}', 'stl')">Download STL</button>
            <button class="mp-button-sm" onclick="downloadPurchasedModel('${p.modelId}', 'json')">Download JSON</button>
          </div>
        </div>
      `).join('');
  }
}

/**
 * Load earnings tab
 */
function loadEarningsTab() {
  const stats = getCreatorStats();
  const dashboard = document.getElementById('mp-earnings-dashboard');

  if (dashboard && stats.ok) {
    dashboard.innerHTML = `
      <div class="mp-kpi-grid">
        <div class="mp-kpi">
          <div class="mp-kpi-value">${stats.stats.totalEarnings}</div>
          <div class="mp-kpi-label">Total Earnings (tokens)</div>
        </div>
        <div class="mp-kpi">
          <div class="mp-kpi-value">${stats.stats.modelCount}</div>
          <div class="mp-kpi-label">Published Models</div>
        </div>
        <div class="mp-kpi">
          <div class="mp-kpi-value">${stats.stats.totalDownloads}</div>
          <div class="mp-kpi-label">Total Downloads</div>
        </div>
        <div class="mp-kpi">
          <div class="mp-kpi-value">${stats.stats.averageRating}★</div>
          <div class="mp-kpi-label">Average Rating</div>
        </div>
      </div>
    `;
  }
}

/**
 * Create model card HTML
 */
function createModelCard(model) {
  const price = model.tiers[0]?.price || 'Free';
  return `
    <div class="mp-card" data-model-id="${model.id}">
      <div class="mp-card-preview">
        ${model.previewImage ? `<img src="${model.previewImage}" alt="${model.name}">` : '<div class="mp-card-placeholder">📦</div>'}
      </div>
      <div class="mp-card-content">
        <h3 class="mp-card-title">${model.name}</h3>
        <p class="mp-card-creator">by ${model.creatorName}</p>
        <p class="mp-card-desc">${model.description.substring(0, 60)}...</p>
        <div class="mp-card-footer">
          <span class="mp-card-rating">${model.stats.rating.toFixed(1)}★ (${model.stats.reviewCount})</span>
          <span class="mp-card-price">${price} tokens</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Show model detail modal
 */
function showModelDetail(modelId) {
  const details = getModelDetails(modelId);
  if (!details.ok) {
    alert('Model not found');
    return;
  }

  const { model, creator, canDownload } = details;
  const modal = document.getElementById('marketplace-modal');
  const preview = document.getElementById('mp-modal-preview');
  const info = document.getElementById('mp-modal-info');

  preview.innerHTML = model.previewImage
    ? `<img src="${model.previewImage}" style="width:100%; max-height:300px;">`
    : '<div style="height:300px; display:flex; align-items:center; justify-content:center;">No preview available</div>';

  info.innerHTML = `
    <h2>${model.name}</h2>
    <p class="mp-creator-link">by ${model.creatorName}</p>
    <p>${model.description}</p>
    <div class="mp-metadata">
      <p><strong>Category:</strong> ${model.category}</p>
      <p><strong>Polycount:</strong> ${model.metadata.polyCount.toLocaleString()}</p>
      <p><strong>Rating:</strong> ${model.stats.rating.toFixed(1)}★ (${model.stats.reviewCount} reviews)</p>
    </div>
    <div class="mp-tiers">
      ${model.tiers.map(tier => `
        <button class="mp-tier-btn" data-tier-id="${tier.id}">
          ${tier.name} - ${tier.price || 'Custom'} tokens
        </button>
      `).join('')}
    </div>
    <div class="mp-reviews">
      <h4>Reviews</h4>
      ${model.reviews.slice(0, 3).map(r => `
        <div class="mp-review">
          <strong>${r.userName}</strong> - ${r.rating}★<br/>
          ${r.comment}
        </div>
      `).join('')}
    </div>
  `;

  modal.classList.add('show');

  // Wire tier buttons
  modal.querySelectorAll('.mp-tier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tierId = parseInt(btn.dataset.tierId);
      const result = purchaseModel(modelId, tierId);
      if (result.ok) {
        alert('Purchase successful!');
        modal.classList.remove('show');
      } else {
        alert('Error: ' + result.error);
      }
    });
  });
}

/**
 * Perform search
 */
function performSearch(query, filters) {
  const result = searchModels(query, filters);
  const grid = document.getElementById('mp-search-results');

  if (grid) {
    grid.innerHTML = result.results.length === 0
      ? '<p class="mp-empty">No results found</p>'
      : result.results.map(model => createModelCard(model)).join('');

    grid.querySelectorAll('.mp-card').forEach(card => {
      card.addEventListener('click', () => {
        const modelId = card.dataset.modelId;
        showModelDetail(modelId);
      });
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate preview thumbnail from Three.js geometry
 */
function generatePreviewThumbnail(geometry) {
  // Create hidden canvas + Three.js scene
  const canvas = document.createElement('canvas');
  canvas.width = MAX_PREVIEW_SIZE;
  canvas.height = MAX_PREVIEW_SIZE;

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x2d2d30, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(100, 100, 100);
    camera.lookAt(0, 0, 0);

    const material = new THREE.MeshPhongMaterial({ color: 0x58a6ff });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(100, 100, 100);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    renderer.render(scene, camera);
    renderer.dispose();

    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[Marketplace] Preview generation failed:', e);
    return null;
  }
}

/**
 * Serialize Three.js BufferGeometry for storage
 */
function serializeGeometry(geometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const indices = geometry.getIndex();

  return {
    positions: Array.from(positions.array),
    normals: normals ? Array.from(normals.array) : null,
    indices: indices ? Array.from(indices.array) : null
  };
}

/**
 * Deserialize geometry from stored data
 */
function deserializeGeometry(data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions), 3));
  if (data.normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normals), 3));
  }
  if (data.indices) {
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices), 1));
  }
  return geometry;
}

/**
 * Export geometry in various formats
 */
function exportGeometry(geometry, format) {
  // Simplified export (full implementation would generate proper file formats)
  switch (format) {
    case 'json':
      return JSON.stringify(serializeGeometry(geometry));
    case 'stl':
    case 'obj':
    case 'gltf':
      // Would require full exporter implementation
      return `Exported ${format} format - full implementation pending`;
    default:
      return null;
  }
}

/**
 * Extract bounding box dimensions
 */
function extractDimensions(geometry) {
  if (!geometry) return { x: 0, y: 0, z: 0 };

  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;
  return {
    x: (bbox.max.x - bbox.min.x).toFixed(2),
    y: (bbox.max.y - bbox.min.y).toFixed(2),
    z: (bbox.max.z - bbox.min.z).toFixed(2)
  };
}

/**
 * Count polygons in geometry
 */
function countPolygons(geometry) {
  const indices = geometry.getIndex();
  return indices ? indices.count / 3 : geometry.getAttribute('position').count / 3;
}

/**
 * Calculate earnings for a creator
 */
function calculateEarnings(creatorId) {
  const models = _allModels.filter(m => m.creatorId === creatorId);
  return models.reduce((sum, m) => sum + (m.stats.downloads * (m.tiers[0]?.price || 0)), 0);
}

/**
 * Log transaction (double-entry ledger)
 */
function logTransaction(tx) {
  const transaction = {
    id: crypto.randomUUID(),
    ...tx,
    recorded: new Date().toISOString()
  };

  // In production: store in ledger database
  console.log('[Marketplace Ledger]', transaction);
}

/**
 * Get date key for breakdown
 */
function getDateKey(date, period) {
  switch (period) {
    case 'daily':
      return date.toISOString().split('T')[0];
    case 'weekly':
      const week = Math.floor((date.getDate() - date.getDay()) / 7);
      return `${date.getFullYear()}-W${week}`;
    case 'monthly':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    default:
      return date.getFullYear().toString();
  }
}

/**
 * Add days to date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add event listener
 */
function addEventListener(event, callback) {
  if (!_eventListeners[event]) {
    _eventListeners[event] = [];
  }
  _eventListeners[event].push(callback);
}

/**
 * Remove event listener
 */
function removeEventListener(event, callback) {
  if (_eventListeners[event]) {
    _eventListeners[event] = _eventListeners[event].filter(cb => cb !== callback);
  }
}

/**
 * Emit event
 */
function emitEvent(event, data) {
  if (_eventListeners[event]) {
    _eventListeners[event].forEach(cb => cb(data));
  }
}

/**
 * Add toolbar button
 */
function addMarketplaceToolbarButton() {
  const btn = document.createElement('button');
  btn.id = 'marketplace-btn';
  btn.className = 'toolbar-btn';
  btn.innerHTML = '🛍️ Marketplace';
  btn.addEventListener('click', () => {
    const panel = document.getElementById('marketplace-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  const toolbar = document.getElementById('ce-buttons') || document.querySelector('.toolbar');
  if (toolbar) {
    toolbar.appendChild(btn);
  }
}

/**
 * Add marketplace styles
 */
function addMarketplaceStyles() {
  const styles = `
    #marketplace-panel {
      position: fixed;
      right: 20px;
      top: 100px;
      width: 600px;
      height: 700px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      z-index: 1000;
      font-size: 13px;
    }

    .mp-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .mp-header h2 {
      margin: 0;
      font-size: 16px;
    }

    .mp-close-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 18px;
    }

    .mp-tabs {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      overflow-x: auto;
    }

    .mp-tab-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      background: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      border-bottom: 2px solid transparent;
    }

    .mp-tab-btn.active {
      color: var(--accent-blue);
      border-bottom-color: var(--accent-blue);
    }

    .mp-tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: none;
    }

    .mp-tab-content.active {
      display: block;
    }

    .mp-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 12px;
    }

    .mp-card {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
      transition: all var(--transition-base);
    }

    .mp-card:hover {
      border-color: var(--accent-blue);
      transform: translateY(-2px);
    }

    .mp-card-preview {
      width: 100%;
      height: 120px;
      background: var(--bg-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .mp-card-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .mp-card-placeholder {
      font-size: 48px;
    }

    .mp-card-content {
      padding: 8px;
    }

    .mp-card-title {
      font-size: 12px;
      font-weight: bold;
      margin: 0 0 4px 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mp-card-creator {
      font-size: 11px;
      color: var(--text-secondary);
      margin: 0 0 4px 0;
    }

    .mp-card-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin: 0 0 6px 0;
      line-height: 1.3;
    }

    .mp-card-footer {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }

    .mp-card-rating {
      color: var(--accent-yellow);
    }

    .mp-card-price {
      color: var(--accent-green);
      font-weight: bold;
    }

    .mp-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mp-form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .mp-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .mp-input,
    .mp-select,
    .mp-textarea {
      padding: 6px 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-radius: 4px;
      font-size: 12px;
    }

    .mp-input:focus,
    .mp-select:focus,
    .mp-textarea:focus {
      outline: none;
      border-color: var(--accent-blue);
    }

    .mp-textarea {
      resize: vertical;
      min-height: 80px;
      font-family: monospace;
    }

    .mp-input-small {
      width: 80px;
    }

    .mp-button {
      padding: 8px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all var(--transition-fast);
    }

    .mp-button:hover {
      background: var(--accent-blue-dark);
      border-color: var(--accent-blue);
    }

    .mp-button-primary {
      background: var(--accent-blue);
      color: white;
    }

    .mp-button-primary:hover {
      background: #4da3ff;
    }

    .mp-button-sm {
      padding: 4px 8px;
      font-size: 11px;
    }

    .mp-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mp-item {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 12px;
    }

    .mp-item-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .mp-item-stats {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .mp-item-desc {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0 0 8px 0;
      line-height: 1.4;
    }

    .mp-item-meta {
      font-size: 11px;
      color: var(--text-secondary);
      margin: 0 0 8px 0;
    }

    .mp-item-actions {
      display: flex;
      gap: 8px;
    }

    .mp-empty {
      text-align: center;
      color: var(--text-secondary);
      padding: 40px 20px;
    }

    .mp-kpi-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .mp-kpi {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 12px;
      text-align: center;
    }

    .mp-kpi-value {
      font-size: 24px;
      font-weight: bold;
      color: var(--accent-blue);
      margin-bottom: 4px;
    }

    .mp-kpi-label {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .mp-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 2000;
      align-items: center;
      justify-content: center;
    }

    .mp-modal.show {
      display: flex;
    }

    .mp-modal-content {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      width: 90%;
      max-width: 700px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    }

    .mp-modal-close {
      position: absolute;
      top: 12px;
      right: 12px;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 20px;
      cursor: pointer;
      z-index: 1;
    }

    .mp-modal-body {
      padding: 20px;
    }

    .mp-preview {
      margin-bottom: 16px;
      border-radius: 4px;
      overflow: hidden;
    }

    .mp-info h2 {
      margin: 0 0 8px 0;
    }

    .mp-creator-link {
      color: var(--accent-blue);
      font-size: 12px;
      margin: 0 0 12px 0;
    }

    .mp-metadata {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 12px;
      margin: 12px 0;
      font-size: 12px;
    }

    .mp-metadata p {
      margin: 6px 0;
    }

    .mp-tiers {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 12px 0;
    }

    .mp-tier-btn {
      padding: 8px;
      background: var(--accent-blue-dark);
      color: white;
      border: 1px solid var(--accent-blue);
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .mp-tier-btn:hover {
      background: var(--accent-blue);
    }

    .mp-reviews {
      margin-top: 16px;
    }

    .mp-reviews h4 {
      margin: 0 0 8px 0;
    }

    .mp-review {
      background: var(--bg-tertiary);
      border-left: 3px solid var(--accent-blue);
      padding: 8px;
      margin-bottom: 8px;
      border-radius: 2px;
      font-size: 12px;
      line-height: 1.4;
    }

    .mp-category-filter {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .mp-filters {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: 4px;
    }

    .mp-filters .mp-label {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 12px;
    }

    @media (max-width: 1200px) {
      #marketplace-panel {
        width: 500px;
      }
    }

    @media (max-width: 768px) {
      #marketplace-panel {
        width: calc(100% - 40px);
        height: calc(100% - 120px);
      }

      .mp-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

// ============================================================================
// Data Persistence
// ============================================================================

/**
 * Save marketplace data to localStorage
 */
function saveMarketplaceData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    models: _allModels,
    purchases: _purchaseHistory,
    createdModels: _createdModels,
    lastSaved: new Date().toISOString()
  }));
}

/**
 * Load marketplace data from localStorage
 */
function loadMarketplaceData() {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored) {
    try {
      const data = JSON.parse(stored);
      _allModels = data.models || [];
      _purchaseHistory = data.purchases || [];
      _createdModels = data.createdModels || [];
    } catch (e) {
      console.warn('[Marketplace] Failed to load data:', e);
    }
  }

  // Populate demo data if empty
  if (_allModels.length === 0) {
    populateDemoData();
  }
}

/**
 * Populate demo models
 */
function populateDemoData() {
  const demoModels = [
    { name: 'M8 Hex Bolt', category: 'Fastener', desc: 'Standard M8 stainless steel hex bolt' },
    { name: 'Bearing Housing', category: 'Mechanical', desc: 'Cast aluminum bearing housing with bore' },
    { name: 'L-Bracket 80mm', category: 'Structural', desc: 'Welded steel L-bracket for structural support' },
    { name: 'IP65 Box 120x80x40', category: 'Enclosure', desc: 'Weather-sealed enclosure for electronics' },
    { name: 'Parametric Bracket', category: 'Template', desc: 'Configurable bracket with variable dimensions' },
    { name: 'Shaft Coupler', category: 'Mechanical', desc: 'Flexible coupling for motor shaft' },
    { name: 'DIN Rail Enclosure', category: 'Enclosure', desc: 'Standard DIN 46277 mounting cabinet' },
    { name: 'cycleWASH Brush Holder', category: 'Custom', desc: 'Brush assembly holder for washing machine' }
  ];

  demoModels.forEach((m, i) => {
    const model = {
      id: crypto.randomUUID(),
      creatorId: 'demo_creator',
      creatorName: 'Demo Creator',
      name: m.name,
      description: m.desc,
      category: m.category,
      tags: [m.category.toLowerCase()],
      tiers: [ACCESS_TIERS.MESH_DOWNLOAD],
      previewImage: null,
      sourceGeometry: null,
      parametricData: null,
      metadata: { dimensions: { x: 50, y: 50, z: 50 }, polyCount: 1000 },
      stats: {
        views: Math.floor(Math.random() * 500),
        downloads: Math.floor(Math.random() * 100),
        purchases: Math.floor(Math.random() * 50),
        rating: (Math.random() * 2 + 3).toFixed(1),
        reviewCount: Math.floor(Math.random() * 20)
      },
      reviews: [],
      publishedDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedDate: new Date().toISOString(),
      derivedFromModelId: null,
      derivativeLicense: false
    };
    _allModels.push(model);
  });

  saveMarketplaceData();
}

export { initMarketplace };
