/* AI Engineering Analyst — RAG v1.0
 *
 * Retrieval-augmented generation scaffold for citing machine-element references
 * in AI Engineering Analyst responses. Browser-only, no server, no npm deps.
 *
 * Architecture:
 *   - Embeddings: @xenova/transformers (MiniLM-L6-v2, 384-dim), loaded from CDN on demand.
 *   - Storage: IndexedDB (db 'cyclecad_engineer_rag'), falls back to in-memory.
 *   - Retrieval: cosine similarity over normalized Float32Array embeddings.
 *   - Citations: MecAgent-style "Open Document" footnote list.
 *
 * Seed corpus: ~10 machine-element fundamentals written in plain language
 * (no copyrighted text). User can replace placeholder URLs via addDocument().
 *
 * Public API: window.CycleCAD.AIEngineerRAG = { init, addDocument, query,
 *   listDocuments, clearAll, buildCitationUI, isReady, getModelLoadProgress }
 */
(function(){
  'use strict';
  window.CycleCAD = window.CycleCAD || {};

  // ===================================================================
  // CONFIG
  // ===================================================================
  const DB_NAME = 'cyclecad_engineer_rag';
  const DB_VERSION = 1;
  const STORE_CHUNKS = 'chunks';
  const STORE_DOCS = 'documents';

  const MODEL_CDN = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';
  const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
  const EMBEDDING_DIM = 384;

  const CHUNK_SIZE = 512;
  const CHUNK_OVERLAP = 50; // ~10%

  // ===================================================================
  // STATE
  // ===================================================================
  let _db = null;           // IDBDatabase or null (fallback to in-memory)
  let _inMemoryChunks = []; // fallback store
  let _inMemoryDocs = [];
  let _usingIDB = false;

  let _extractor = null;    // pipeline instance
  let _modelLoading = false;
  let _modelLoadProgress = 0;
  let _modelReady = false;

  let _initCalled = false;
  let _initPromise = null;

  // ===================================================================
  // UTILITIES
  // ===================================================================

  /**
   * Split text into overlapping chunks. Tries sentence boundaries first.
   * @param {string} text
   * @param {number} size target char count
   * @param {number} overlap char count to re-use at chunk boundary
   * @returns {string[]}
   */
  function chunkText(text, size, overlap) {
    size = size || CHUNK_SIZE;
    overlap = overlap || CHUNK_OVERLAP;

    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) return [];
    if (cleaned.length <= size) return [cleaned];

    const chunks = [];
    let i = 0;
    while (i < cleaned.length) {
      let end = Math.min(i + size, cleaned.length);
      if (end < cleaned.length) {
        // try to break at a sentence boundary within the last 20% of the window
        const windowStart = Math.max(i + Math.floor(size * 0.8), i + 1);
        const slice = cleaned.slice(windowStart, end);
        const sentenceBreak = slice.search(/[.!?](\s|$)/);
        if (sentenceBreak > -1) {
          end = windowStart + sentenceBreak + 1;
        } else {
          // fall back to word boundary
          const wordBreak = cleaned.lastIndexOf(' ', end);
          if (wordBreak > i) end = wordBreak;
        }
      }
      chunks.push(cleaned.slice(i, end).trim());
      if (end >= cleaned.length) break;
      i = Math.max(end - overlap, i + 1);
    }
    return chunks.filter(function(c){ return c.length > 0; });
  }

  /**
   * L2-normalize a Float32Array in place. Returns the same array.
   */
  function normalize(vec) {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }
    return vec;
  }

  /**
   * Cosine similarity of two normalized Float32Arrays = dot product.
   */
  function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }

  // ===================================================================
  // INDEXEDDB LAYER
  // ===================================================================

  function openDB() {
    return new Promise(function(resolve, reject){
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(ev){
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
        }
      };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  function idbPut(storeName, value) {
    return new Promise(function(resolve, reject){
      const tx = _db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = function(){ resolve(); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  function idbGetAll(storeName) {
    return new Promise(function(resolve, reject){
      const tx = _db.transaction([storeName], 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = function(){ resolve(req.result || []); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  function idbClear(storeName) {
    return new Promise(function(resolve, reject){
      const tx = _db.transaction([storeName], 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = function(){ resolve(); };
      req.onerror = function(){ reject(req.error); };
    });
  }

  // ===================================================================
  // STORAGE ABSTRACTION (IDB or in-memory)
  // ===================================================================

  async function putChunk(chunk) {
    if (_usingIDB) return idbPut(STORE_CHUNKS, chunk);
    // replace if same id
    _inMemoryChunks = _inMemoryChunks.filter(function(c){ return c.id !== chunk.id; });
    _inMemoryChunks.push(chunk);
  }

  async function putDocument(doc) {
    if (_usingIDB) return idbPut(STORE_DOCS, doc);
    _inMemoryDocs = _inMemoryDocs.filter(function(d){ return d.id !== doc.id; });
    _inMemoryDocs.push(doc);
  }

  async function getAllChunks() {
    if (_usingIDB) return idbGetAll(STORE_CHUNKS);
    return _inMemoryChunks.slice();
  }

  async function getAllDocuments() {
    if (_usingIDB) return idbGetAll(STORE_DOCS);
    return _inMemoryDocs.slice();
  }

  async function clearStores() {
    if (_usingIDB) {
      await idbClear(STORE_CHUNKS);
      await idbClear(STORE_DOCS);
    } else {
      _inMemoryChunks = [];
      _inMemoryDocs = [];
    }
  }

  // ===================================================================
  // MODEL LOADING
  // ===================================================================

  async function loadModel() {
    if (_modelReady) return _extractor;
    if (_modelLoading) {
      // wait for current load
      while (_modelLoading) {
        await new Promise(function(r){ setTimeout(r, 100); });
      }
      return _extractor;
    }
    _modelLoading = true;
    _modelLoadProgress = 0;
    try {
      const mod = await import(/* @vite-ignore */ MODEL_CDN);
      if (!mod || typeof mod.pipeline !== 'function') {
        throw new Error('transformers module did not expose pipeline()');
      }
      if (mod.env) {
        // allow remote model download from HF hub
        mod.env.allowRemoteModels = true;
      }
      _extractor = await mod.pipeline('feature-extraction', MODEL_ID, {
        progress_callback: function(ev){
          if (ev && typeof ev.progress === 'number') {
            _modelLoadProgress = Math.max(_modelLoadProgress, ev.progress / 100);
          } else if (ev && ev.status === 'ready') {
            _modelLoadProgress = 1;
          }
        }
      });
      _modelLoadProgress = 1;
      _modelReady = true;
      return _extractor;
    } catch (err) {
      console.warn('[AIEngineerRAG] model load failed, embeddings disabled:', err && err.message);
      _modelReady = false;
      throw err;
    } finally {
      _modelLoading = false;
    }
  }

  /**
   * Embed a single string → Float32Array(384), normalized.
   */
  async function embedText(text) {
    const extractor = await loadModel();
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    // out.data is Float32Array of length 384 when pooled
    const src = out && out.data ? out.data : out;
    const vec = new Float32Array(EMBEDDING_DIM);
    const len = Math.min(src.length, EMBEDDING_DIM);
    for (let i = 0; i < len; i++) vec[i] = src[i];
    // transformers returned normalized already, but enforce for safety
    return normalize(vec);
  }

  // ===================================================================
  // SEED CORPUS — plain-language machine-element fundamentals
  // All URLs are placeholders marked with example.com. Users can replace
  // via addDocument() with real PDF URLs or textbook citations.
  // ===================================================================
  const SEED_CORPUS = Object.freeze([
    {
      id: 'shigley-ch8-bolted-preload',
      title: 'Shigley\'s Mechanical Engineering Design — Ch. 8, Bolted Joints',
      url: 'https://example.com/shigley-ch8',
      text: 'A preloaded bolted joint carries transverse shear through friction at the faying surface. '
        + 'The slip-resistance capacity equals the number of bolts times the per-bolt clamp load times '
        + 'the friction coefficient. Required clamp force is the applied shear times the target safety '
        + 'factor against slipping (typically 1.25 to 1.5). When the joint is properly preloaded, external '
        + 'axial load is shared between the bolt and the clamped members according to the joint-stiffness '
        + 'ratio, so only a fraction of the external force increases bolt tension. Rule of thumb for steel '
        + 'on steel with clean dry contact: friction coefficient in the range 0.14 to 0.18.'
    },
    {
      id: 'vdi-2230-moment-distribution',
      title: 'VDI 2230 Part 1 — Systematic Calculation of High-Duty Bolted Joints',
      url: 'https://example.com/vdi-2230',
      text: 'When an in-plane moment acts on a bolt pattern arranged on a circle, each bolt carries a '
        + 'tangential share proportional to its distance from the center of rotation. For uniformly '
        + 'spaced bolts on a bolt circle of radius r, the most loaded bolt sees a tangential force equal '
        + 'to M·r divided by the sum of r-squared terms, which simplifies to M divided by z times r. '
        + 'Add to this the axial share from any external tensile force, divided equally across z bolts. '
        + 'The maximum bolt tension after preload is the preload plus this external share multiplied by '
        + 'the load factor Phi, which is typically between 0.1 and 0.3 for rigid joints without gaskets.'
    },
    {
      id: 'shigley-ch5-combined-stress',
      title: 'Shigley\'s — Ch. 5, Failures Resulting from Static Loading',
      url: 'https://example.com/shigley-ch5',
      text: 'The distortion-energy (von Mises) criterion combines normal and shear stresses into an '
        + 'equivalent tensile stress. For a bolt under axial tension sigma and transverse shear tau, the '
        + 'equivalent stress is the square root of sigma-squared plus three times tau-squared. The bolt '
        + 'is safe under static load when the equivalent stress stays below the proof strength R_p0.2 '
        + 'divided by the chosen safety factor. For ISO 898-1 class 10.9 this proof strength is 830 MPa, '
        + 'for 8.8 it is 580 MPa, and for 12.9 it is 970 MPa. Always divide applied force by the stress '
        + 'cross-section area A_s from DIN 13, not by the nominal bolt area.'
    },
    {
      id: 'agma-bending-spur-gear',
      title: 'AGMA 2001 — Fundamental Rating Factors and Calculation Methods for Spur Gears',
      url: 'https://example.com/agma-2001-bending',
      text: 'Spur-gear tooth bending fatigue strength in US customary units follows the linear fit '
        + 'S_t = 77 HB + 12800 psi for through-hardened steels up to about 400 HB. The applied bending '
        + 'stress in the tooth root is computed with the Lewis form factor adjusted for stress '
        + 'concentration (the J-factor) and amplified by load-distribution, dynamic, and size factors. '
        + 'Finite-life safety factor against bending is the allowable stress times life-factor K_L '
        + 'divided by the applied stress times K_T (temperature) and K_R (reliability).'
    },
    {
      id: 'agma-contact-spur-gear',
      title: 'AGMA 2001 — Pitting Resistance (Contact Stress) for Spur Gears',
      url: 'https://example.com/agma-2001-contact',
      text: 'Surface-durability pitting strength for through-hardened steel follows S_c = 322 HB + 29100 psi '
        + 'as a linear fit up to about 400 HB. The applied contact stress uses the Hertzian contact '
        + 'formula with an elastic coefficient C_p that depends on both materials. Tangential load W_t, '
        + 'pitch diameter, face width, and geometry factor I enter the stress. Pitting safety factor '
        + 'against surface fatigue is the allowable contact stress divided by the applied contact stress, '
        + 'both adjusted for reliability, temperature, and lubrication factors.'
    },
    {
      id: 'shigley-ch6-goodman',
      title: 'Shigley\'s — Ch. 6, Fatigue Failure Resulting from Variable Loading',
      url: 'https://example.com/shigley-ch6',
      text: 'The Goodman criterion evaluates shaft fatigue under combined mean and alternating stress. '
        + 'For a steel shaft with mean normal stress sigma_m and alternating normal stress sigma_a, the '
        + 'infinite-life safety factor is one divided by the quantity sigma_a over S_e plus sigma_m over '
        + 'S_ut. S_e is the endurance limit corrected by surface, size, loading, temperature, and '
        + 'reliability factors (the Marin factors). S_ut is the ultimate tensile strength. For shafts '
        + 'under combined bending and torsion, use von Mises equivalent alternating and mean stresses '
        + 'derived from the DE-Goodman equation in Shigley table 6-6.'
    },
    {
      id: 'shigley-ch6-soderberg',
      title: 'Shigley\'s — Ch. 6, Soderberg Criterion (Conservative Yield-Based)',
      url: 'https://example.com/shigley-ch6-soderberg',
      text: 'The Soderberg fatigue criterion is more conservative than Goodman because it compares the '
        + 'mean stress against the yield strength S_y rather than ultimate strength S_ut. The infinite-'
        + 'life safety factor is one over the quantity sigma_a over S_e plus sigma_m over S_y. Soderberg '
        + 'is often preferred when avoiding yielding is at least as important as avoiding fatigue, for '
        + 'example in precision machine elements or safety-critical shafts. Goodman and Soderberg both '
        + 'assume ductile material and fully reversed loading shifted by a mean offset.'
    },
    {
      id: 'iso-281-bearing-life',
      title: 'ISO 281 — Rolling Bearings, Dynamic Load Ratings and Rating Life',
      url: 'https://example.com/iso-281',
      text: 'The basic L10 life of a rolling bearing in millions of revolutions equals the dynamic load '
        + 'rating C divided by the equivalent dynamic load P, raised to the power p. The exponent p is '
        + '3 for ball bearings and 10 over 3 for roller bearings. Convert to operating hours by dividing '
        + 'L10 by the shaft speed in revolutions per minute, then multiplying by one million over sixty. '
        + 'For combined radial F_r and axial F_a loads, P equals X times F_r plus Y times F_a, where '
        + 'X and Y come from the bearing\'s load-direction factors table (function of e and F_a over F_r).'
    },
    {
      id: 'aws-d1-1-fillet-weld',
      title: 'AWS D1.1 — Structural Welding Code for Fillet Welds',
      url: 'https://example.com/aws-d1-1',
      text: 'A fillet weld is sized by its throat dimension t, which for a 45-degree equal-leg weld equals '
        + 'the leg length divided by the square root of two (about 0.707 times the leg). The shear '
        + 'stress on the throat for an applied load F along the weld length L is F divided by the product '
        + 'of t and L. Most codes compare this throat shear to an allowable equal to 0.3 times the '
        + 'electrode ultimate strength for static loads. AWS D1.1 additionally requires the base metal '
        + 'shear check at the fusion face, which uses the leg length (not the throat) and 0.4 S_y of the '
        + 'base metal as the allowable.'
    },
    {
      id: 'aws-electrodes',
      title: 'AWS A5.1 — Carbon Steel Covered Electrodes',
      url: 'https://example.com/aws-a5-1',
      text: 'Common mild-steel welding electrodes are designated E60xx and E70xx in the AWS system, where '
        + 'the first two digits indicate the electrode\'s minimum tensile strength in thousands of psi '
        + '(60 ksi and 70 ksi, respectively, which is 414 MPa and 483 MPa). Allowable shear stress on the '
        + 'weld throat is typically 18 ksi for E60 and 21 ksi for E70 under static loading. For fatigue '
        + 'loading, apply the AISC or Eurocode detail category reductions. Common practice: match '
        + 'electrode strength to or slightly exceed the weaker base metal to avoid overmatched welds '
        + 'that concentrate stress at the heat-affected zone.'
    }
  ]);

  // ===================================================================
  // CORE OPERATIONS
  // ===================================================================

  /**
   * @param {object} doc {id, title, url, text}
   * @returns {Promise<{chunkCount:number}>}
   */
  async function addDocument(doc) {
    if (!doc || !doc.id || !doc.text) {
      throw new Error('addDocument requires {id, text} (title and url optional)');
    }
    const pieces = chunkText(doc.text, CHUNK_SIZE, CHUNK_OVERLAP);
    if (pieces.length === 0) {
      return { chunkCount: 0 };
    }

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      let embedding = null;
      try {
        embedding = await embedText(piece);
      } catch (err) {
        // degrade to zero-vector so the chunk is still retrievable by listing
        embedding = new Float32Array(EMBEDDING_DIM);
      }
      await putChunk({
        id: doc.id + '#' + i,
        docId: doc.id,
        title: doc.title || doc.id,
        url: doc.url || '',
        text: piece,
        embedding: embedding,
        passageIndex: i,
        total: pieces.length
      });
    }

    await putDocument({
      id: doc.id,
      title: doc.title || doc.id,
      url: doc.url || '',
      addedAt: Date.now(),
      chunkCount: pieces.length
    });

    return { chunkCount: pieces.length };
  }

  /**
   * @param {string} text
   * @param {object} [opts] {topK}
   * @returns {Promise<Array<{chunk, score, docId, title, url, passageIndex}>>}
   */
  async function query(text, opts) {
    opts = opts || {};
    const topK = Math.max(1, Math.min(20, opts.topK || 3));

    if (!text || typeof text !== 'string' || text.trim() === '') return [];

    let queryVec;
    try {
      queryVec = await embedText(text);
    } catch (err) {
      console.warn('[AIEngineerRAG] query embedding failed, returning []');
      return [];
    }

    const chunks = await getAllChunks();
    if (chunks.length === 0) return [];

    const scored = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const emb = c.embedding instanceof Float32Array
        ? c.embedding
        : new Float32Array(c.embedding || []);
      const score = cosineSimilarity(queryVec, emb);
      scored.push({
        chunk: c.text,
        score: score,
        docId: c.docId,
        title: c.title,
        url: c.url,
        passageIndex: c.passageIndex
      });
    }

    scored.sort(function(a, b){ return b.score - a.score; });
    return scored.slice(0, topK);
  }

  async function listDocuments() {
    const docs = await getAllDocuments();
    return docs.map(function(d){
      return {
        id: d.id,
        title: d.title,
        url: d.url,
        chunkCount: d.chunkCount || 0
      };
    });
  }

  async function clearAll() {
    await clearStores();
  }

  // ===================================================================
  // SEEDING
  // ===================================================================

  async function seedIfEmpty() {
    const docs = await getAllDocuments();
    if (docs.length > 0) return false;
    for (let i = 0; i < SEED_CORPUS.length; i++) {
      try {
        await addDocument(SEED_CORPUS[i]);
      } catch (err) {
        console.warn('[AIEngineerRAG] seed failed for', SEED_CORPUS[i].id, err && err.message);
      }
    }
    return true;
  }

  // ===================================================================
  // INIT
  // ===================================================================

  async function init() {
    if (_initPromise) return _initPromise;
    _initCalled = true;
    _initPromise = (async function(){
      // 1. open IDB (optional — fall back to memory)
      try {
        _db = await openDB();
        _usingIDB = true;
      } catch (err) {
        console.warn('[AIEngineerRAG] IndexedDB unavailable, using in-memory store:', err && err.message);
        _db = null;
        _usingIDB = false;
      }

      // 2. kick off model load in background — don't block init
      loadModel().catch(function(){ /* already warned inside loadModel */ });

      // 3. wait for model, then seed if empty (seeding needs embeddings)
      try {
        await loadModel();
        await seedIfEmpty();
      } catch (err) {
        // seed with zero-vector embeddings as fallback so at least listDocuments works
        const docs = await getAllDocuments();
        if (docs.length === 0) {
          for (let i = 0; i < SEED_CORPUS.length; i++) {
            try { await addDocument(SEED_CORPUS[i]); } catch (e) {/* no-op */}
          }
        }
      }

      return true;
    })();
    return _initPromise;
  }

  function isReady() {
    return _initCalled && _modelReady;
  }

  function getModelLoadProgress() {
    return _modelLoadProgress;
  }

  // ===================================================================
  // CITATION UI
  // ===================================================================

  /**
   * Build a footnote-style citation block from query() results.
   * @param {Array<{chunk, score, docId, title, url, passageIndex}>} results
   * @returns {HTMLElement}
   */
  function buildCitationUI(results) {
    const wrap = document.createElement('div');
    wrap.className = 'cc-rag-citations';
    wrap.style.cssText = [
      'margin-top:12px',
      'padding:12px 14px',
      'background:#0f1419',
      'border:1px solid #1f2a33',
      'border-left:3px solid #10b981',
      'border-radius:6px',
      'color:#d1d5db',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:12.5px',
      'line-height:1.55'
    ].join(';');

    const header = document.createElement('div');
    header.textContent = 'Sources (' + (results ? results.length : 0) + ')';
    header.style.cssText = [
      'font-family:"SF Mono",Menlo,monospace',
      'font-size:11px',
      'font-weight:600',
      'color:#10b981',
      'text-transform:uppercase',
      'letter-spacing:0.08em',
      'margin-bottom:8px'
    ].join(';');
    wrap.appendChild(header);

    if (!results || results.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No sources found.';
      empty.style.cssText = 'color:#6b7280;font-style:italic';
      wrap.appendChild(empty);
      return wrap;
    }

    const list = document.createElement('ol');
    list.style.cssText = 'margin:0;padding-left:18px;display:flex;flex-direction:column;gap:8px';

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const item = document.createElement('li');
      item.style.cssText = 'color:#d1d5db';

      const title = document.createElement('div');
      title.style.cssText = 'display:flex;align-items:baseline;gap:8px;flex-wrap:wrap';

      const titleText = document.createElement('span');
      titleText.textContent = r.title || r.docId;
      titleText.style.cssText = 'font-weight:600;color:#e5e7eb';
      title.appendChild(titleText);

      if (r.url) {
        const link = document.createElement('a');
        link.href = r.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open Document \u2197';
        link.style.cssText = [
          'color:#10b981',
          'text-decoration:none',
          'font-family:"SF Mono",Menlo,monospace',
          'font-size:11px',
          'padding:2px 6px',
          'border:1px solid #1f3a2e',
          'border-radius:3px',
          'background:#0a1814'
        ].join(';');
        title.appendChild(link);
      }

      const score = document.createElement('span');
      score.textContent = 'score ' + (r.score != null ? r.score.toFixed(3) : '0.000');
      score.style.cssText = 'font-family:"SF Mono",Menlo,monospace;font-size:10.5px;color:#6b7280';
      title.appendChild(score);

      item.appendChild(title);

      const snippet = document.createElement('div');
      const text = r.chunk || '';
      snippet.textContent = text.length > 120 ? text.slice(0, 120).trim() + '...' : text;
      snippet.style.cssText = 'margin-top:4px;color:#9ca3af;font-size:12px;line-height:1.5';
      item.appendChild(snippet);

      list.appendChild(item);
    }

    wrap.appendChild(list);
    return wrap;
  }

  // ===================================================================
  // PUBLIC API
  // ===================================================================
  window.CycleCAD.AIEngineerRAG = {
    init: init,
    addDocument: addDocument,
    query: query,
    listDocuments: listDocuments,
    clearAll: clearAll,
    buildCitationUI: buildCitationUI,
    isReady: isReady,
    getModelLoadProgress: getModelLoadProgress,
    // internals exposed for testing (not part of the stable contract)
    _chunkText: chunkText,
    _cosineSimilarity: cosineSimilarity,
    _normalize: normalize,
    _SEED_CORPUS: SEED_CORPUS
  };

  console.log('[AIEngineerRAG] RAG v1 loaded');
})();
