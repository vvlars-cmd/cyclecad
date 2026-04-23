/* AI Copilot v1.1 — multi-step CAD generation from natural language */
(function(){
  'use strict';
  window.CycleCAD = window.CycleCAD || {};

  const MODELS = {
    'claude-sonnet': {label:'Claude Sonnet 4.6', provider:'anthropic', model:'claude-sonnet-4-5-20250929', keyField:'anthropic', free:false},
    'claude-haiku':  {label:'Claude Haiku 4.5',  provider:'anthropic', model:'claude-haiku-4-5-20251001', keyField:'anthropic', free:false},
    'claude-opus':   {label:'Claude Opus 4.6',   provider:'anthropic', model:'claude-opus-4-5-20250929', keyField:'anthropic', free:false},
    'gemini-flash':  {label:'Gemini 2.0 Flash (free)', provider:'gemini', model:'gemini-2.0-flash', keyField:'gemini', free:true},
    'groq-llama':    {label:'Groq Llama 3.3 70B (free)', provider:'groq', model:'llama-3.3-70b-versatile', keyField:'groq', free:true}
  };

  const KEY_STORE = 'cyclecad_api_keys';
  const LAST_MODEL = 'cyclecad_ai_last_model';

  function getKeys(){ try { return JSON.parse(localStorage.getItem(KEY_STORE)||'{}'); } catch(e){ return {}; } }
  function setKey(f,v){ const k=getKeys(); k[f]=v; localStorage.setItem(KEY_STORE, JSON.stringify(k)); }
  function getLastWorkingModel(){ return localStorage.getItem(LAST_MODEL); }
  function setLastWorkingModel(id){ localStorage.setItem(LAST_MODEL, id); }

  function smartDefault(){
    const k = getKeys();
    const last = getLastWorkingModel();
    if (last && MODELS[last] && k[MODELS[last].keyField]) return last;
    if (k.anthropic) return 'claude-sonnet';
    if (k.gemini) return 'gemini-flash';
    if (k.groq) return 'groq-llama';
    return 'gemini-flash';
  }

  const S = { running:false, abort:false, stepIndex:0, results:[], errors:[], els:{} };

  function log(msg, cls){
    if (!S.els.log) return;
    const d = document.createElement('div');
    d.className = 'aic-entry ' + (cls||'info');
    d.textContent = msg;
    S.els.log.appendChild(d);
    S.els.log.scrollTop = S.els.log.scrollHeight;
  }
  function progress(pct, text){
    if (S.els.prog) S.els.prog.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if (S.els.progText && text) S.els.progText.textContent = text;
  }
  function updateBanner(){
    if (!S.els.banner) return;
    const m = MODELS[S.els.model?.value]; if (!m) return;
    const hasKey = !!getKeys()[m.keyField];
    if (hasKey) {
      S.els.banner.textContent = 'Ready: ' + m.label;
      S.els.banner.style.background = '#065f46';
      S.els.banner.style.color = '#d1fae5';
    } else {
      S.els.banner.textContent = 'No ' + m.keyField + ' API key — click the key icon';
      S.els.banner.style.background = '#7f1d1d';
      S.els.banner.style.color = '#fecaca';
    }
  }
  function classifyError(e, provider){
    const msg = (e && e.message) || String(e);
    if (/credit|balance/i.test(msg)) return {kind:'low_credit', hint:'Your '+provider+' account is out of credits. Switch to Gemini (free).'};
    if (/401|403/.test(msg) || /invalid.*key/i.test(msg)) return {kind:'bad_key', hint:'Your '+provider+' key is invalid.'};
    if (/429|rate/i.test(msg)) return {kind:'rate_limit', hint:'Rate-limited. Wait 60s or switch providers.'};
    if (/404/.test(msg)) return {kind:'model_404', hint:'Model not available. Trying fallback...'};
    return {kind:'unknown', hint:msg.slice(0,200)};
  }
  function showActionableError(e, provider){
    const c = classifyError(e, provider);
    log('x '+c.hint, 'fail');
    if (c.kind === 'low_credit' || c.kind === 'bad_key') {
      const btn = document.createElement('button');
      btn.textContent = 'Switch to Gemini (free)';
      btn.style.cssText = 'margin:6px 0;padding:4px 10px;background:#059669;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:11px';
      btn.onclick = () => { S.els.model.value = 'gemini-flash'; updateBanner(); btn.remove(); };
      S.els.log.appendChild(btn);
    }
  }

  const SYSTEM_PROMPT = 'You are a CAD planning assistant. Given a user goal, output a JSON array of steps. Each step: {"method":"<ns.cmd>","params":{...},"note":"<short>"}. Namespaces: sketch.start, sketch.rect, sketch.circle, sketch.line, sketch.end, ops.extrude, ops.revolve, ops.fillet, ops.chamfer, ops.shell, ops.hole, ops.pattern, view.set, view.fit, query.features, query.bbox, validate.cost, validate.mass. Output ONLY the JSON array, no prose.';

  async function callClaude(model, prompt){
    const k = getKeys().anthropic; if (!k) throw new Error('Missing anthropic key');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':k,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body: JSON.stringify({model, max_tokens:4096, system:SYSTEM_PROMPT, messages:[{role:'user',content:prompt}]})
    });
    if (!r.ok) throw new Error('Claude '+r.status+': '+await r.text());
    const j = await r.json();
    return j.content?.[0]?.text || '';
  }
  async function callGemini(model, prompt){
    const k = getKeys().gemini; if (!k) throw new Error('Missing gemini key');
    const tryModels = [model, 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
    let lastErr;
    for (const m of tryModels) {
      try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+k;
        const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({contents:[{parts:[{text:SYSTEM_PROMPT+'\n\n'+prompt}]}]})});
        if (!r.ok) {
          const t = await r.text();
          if (r.status === 404) { lastErr = new Error('Gemini 404: '+t); continue; }
          throw new Error('Gemini '+r.status+': '+t);
        }
        const j = await r.json();
        return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch(e) { lastErr = e; if (!/404/.test(e.message)) throw e; }
    }
    throw lastErr || new Error('Gemini failed');
  }
  async function callGroq(model, prompt){
    const k = getKeys().groq; if (!k) throw new Error('Missing groq key');
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+k},
      body: JSON.stringify({model, messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:prompt}], max_tokens:4096})
    });
    if (!r.ok) throw new Error('Groq '+r.status+': '+await r.text());
    const j = await r.json();
    return j.choices?.[0]?.message?.content || '';
  }
  async function callLLM(modelId, prompt){
    const m = MODELS[modelId]; if (!m) throw new Error('Unknown model: '+modelId);
    if (m.provider === 'anthropic') return callClaude(m.model, prompt);
    if (m.provider === 'gemini') return callGemini(m.model, prompt);
    if (m.provider === 'groq') return callGroq(m.model, prompt);
    throw new Error('Unknown provider');
  }
  function parseJson(text){
    let t = (text||'').trim();
    t = t.replace(/```(?:json)?/gi, '').trim();
    const start = t.indexOf('[');
    if (start < 0) throw new Error('No JSON array found in: '+t.slice(0,120));
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < t.length; i++) {
      const ch = t[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error('Unclosed JSON array');
    t = t.slice(start, end+1);
    try { return JSON.parse(t); }
    catch(e) {
      const t2 = t.replace(/,(\s*[\]}])/g, '$1');
      return JSON.parse(t2);
    }
  }
  const miniState = { currentSketch: null, lastMesh: null, group: null };
  function miniReset(){
    if (miniState.group && window._scene) window._scene.remove(miniState.group);
    miniState.currentSketch = null; miniState.lastMesh = null; miniState.group = null;
  }
  function miniEnsureGroup(){
    if (!miniState.group) {
      miniState.group = new window.THREE.Group();
      miniState.group.name = 'AICopilotBuild';
      window._scene.add(miniState.group);
    }
  }
  function miniExecute(step){
    const method = step.method, params = step.params || {};
    if (!window._scene || !window.THREE) throw new Error('Scene not available');
    const THREE = window.THREE;
    if (method === 'sketch.start') { miniState.currentSketch = { plane: params.plane||'XY' }; return {ok:true}; }
    if (method === 'sketch.rect')  { miniState.currentSketch = { shape:'rect', width: params.width||params.w||50, height: params.height||params.h||30 }; return {ok:true}; }
    if (method === 'sketch.circle'){ miniState.currentSketch = { shape:'circle', radius: params.radius||params.r||25 }; return {ok:true}; }
    if (method === 'sketch.line' || method === 'sketch.end') return {ok:true};
    if (method === 'ops.extrude') {
      const d = params.depth||params.height||params.distance||20;
      const sk = miniState.currentSketch; let g;
      if (sk && sk.shape==='rect')       g = new THREE.BoxGeometry(sk.width, d, sk.height);
      else if (sk && sk.shape==='circle')g = new THREE.CylinderGeometry(sk.radius, sk.radius, d, 48);
      else                               g = new THREE.BoxGeometry(50, d, 30);
      const mat = new THREE.MeshStandardMaterial({color:0x4a90e2, metalness:0.35, roughness:0.45});
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true;
      miniEnsureGroup(); miniState.group.add(mesh); miniState.lastMesh = mesh;
      return {ok:true};
    }
    if (method === 'ops.revolve') {
      const r = params.radius||20;
      const g = new THREE.TorusGeometry(r, Math.max(2, r/4), 24, 48);
      const mat = new THREE.MeshStandardMaterial({color:0x4a90e2, metalness:0.35, roughness:0.45});
      const mesh = new THREE.Mesh(g, mat);
      miniEnsureGroup(); miniState.group.add(mesh); miniState.lastMesh = mesh;
      return {ok:true};
    }
    if (['ops.fillet','ops.chamfer','ops.shell','ops.hole','ops.pattern'].includes(method)) {
      return {ok:true, note:method+' (visual approximation)'};
    }
    if (method === 'view.fit') {
      const tgt = miniState.group || window._scene;
      if (tgt && window._camera) {
        const box = new THREE.Box3().setFromObject(tgt);
        if (!box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 100;
          const fov = (window._camera.fov||50) * Math.PI/180;
          const dist = maxDim / (2*Math.tan(fov/2)) * 2.2;
          const c = box.getCenter(new THREE.Vector3());
          window._camera.position.set(c.x+dist, c.y+dist, c.z+dist);
          window._camera.lookAt(c);
          if (window._controls) { window._controls.target.copy(c); window._controls.update(); }
        }
      }
      return {ok:true};
    }
    if (method === 'view.set') {
      if (!window._camera) return {ok:true};
      const v = (params.view||params.orientation||'iso').toLowerCase();
      const d = 250;
      if (v === 'top')     window._camera.position.set(0, d, 0);
      else if (v === 'front') window._camera.position.set(0, 0, d);
      else if (v === 'side' || v === 'right') window._camera.position.set(d, 0, 0);
      else                 window._camera.position.set(d*0.7, d*0.7, d*0.7);
      window._camera.lookAt(0,0,0);
      if (window._controls) { window._controls.target.set(0,0,0); window._controls.update(); }
      return {ok:true};
    }
    if (method.startsWith('query.')||method.startsWith('validate.')) return {ok:true, note:'stub'};
    throw new Error('Unknown method: ' + method);
  }
  async function runStep(step){
    if (window.cycleCAD && typeof window.cycleCAD.execute === 'function') {
      return window.cycleCAD.execute({method: step.method, params: step.params || {}});
    }
    return miniExecute(step);
  }
  async function run(){
    if (S.running) { log('Already running', 'fail'); return; }
    const prompt = (S.els.prompt?.value || '').trim();
    if (!prompt) { log('Enter a prompt first', 'fail'); return; }
    const quotedGoals = (prompt.match(/"[^"]{10,}"/g) || []).length;
    if (quotedGoals >= 2) {
      log('Detected '+quotedGoals+' goals in one prompt. Use ONE goal at a time.', 'fail');
      return;
    }
    const modelId = S.els.model?.value;
    const m = MODELS[modelId];
    if (!getKeys()[m.keyField]) { log('Missing '+m.keyField+' key — click the key icon', 'fail'); return; }
    S.running = true; S.abort = false; S.stepIndex = 0; S.results = []; S.errors = [];
    progress(5, 'Planning...');
    log('Planning with '+m.label+'...', 'info');
    let plan;
    try {
      const raw = await callLLM(modelId, prompt);
      plan = parseJson(raw);
      if (!Array.isArray(plan)) throw new Error('Plan is not an array');
      setLastWorkingModel(modelId);
      log('Got '+plan.length+'-step plan. Executing...', 'pass');
    } catch(e) {
      showActionableError(e, m.provider);
      S.running = false; progress(0, 'Failed'); return;
    }
    let recoveries = 0;
    for (let i = 0; i < plan.length; i++) {
      if (S.abort) { log('Aborted', 'fail'); break; }
      S.stepIndex = i;
      const step = plan[i];
      progress(5 + (95*i/plan.length), 'Step '+(i+1)+'/'+plan.length);
      log('step '+(i+1)+': '+step.method+' - '+(step.note||''), 'info');
      try {
        const res = await runStep(step);
        S.results.push(res);
        log('step '+(i+1)+' done', 'pass');
      } catch(e) {
        S.errors.push({step:i, error:e.message});
        log('step '+(i+1)+': '+e.message, 'fail');
        if (recoveries < 2) {
          recoveries++;
          log('Asking for recovery ('+recoveries+'/2)...', 'info');
          try {
            const recPrompt = 'Original goal: '+prompt+'\nFailed step: '+JSON.stringify(step)+'\nError: '+e.message+'\nRemaining: '+JSON.stringify(plan.slice(i+1))+'\nReturn a JSON array of replacement steps.';
            const raw = await callLLM(modelId, recPrompt);
            const fix = parseJson(raw);
            if (Array.isArray(fix)) { plan.splice(i+1, 0, ...fix); log('Inserted '+fix.length+' recovery steps', 'info'); }
          } catch(re) { log('Recovery failed: '+re.message, 'fail'); }
        }
      }
    }
    progress(100, 'Done');
    log('Done - '+S.results.length+'/'+plan.length+' succeeded', S.errors.length?'info':'pass');
    S.running = false;
  }
  function abort(){ S.abort = true; S.running = false; log('Stop requested', 'info'); }
  function askKey(){
    const m = MODELS[S.els.model?.value]; if (!m) return;
    const current = getKeys()[m.keyField] || '';
    const v = window.prompt('Enter '+m.keyField+' API key:', current);
    if (v !== null && v.trim()) { setKey(m.keyField, v.trim()); log(m.keyField+' key saved', 'pass'); updateBanner(); }
  }
  function buildUI(){
    const wrap = document.createElement('div');
    wrap.className = 'aic-panel';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:12px;min-width:420px;max-width:640px;font-family:-apple-system,sans-serif';
    wrap.innerHTML = ''+
      '<div class="aic-banner" style="padding:6px 10px;border-radius:4px;font-size:12px;background:#374151;color:#e5e7eb">Loading...</div>'+
      '<div style="display:flex;gap:6px;align-items:center">'+
        '<select class="aic-model" style="flex:1;padding:6px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:4px;font-size:13px"></select>'+
        '<button class="aic-key" title="Set API key" style="padding:6px 10px;background:#4b5563;color:white;border:0;border-radius:4px;cursor:pointer">Key</button>'+
      '</div>'+
      '<textarea class="aic-prompt" placeholder="e.g. box 100x50x20 with 3mm fillet" style="min-height:80px;padding:8px;background:#0f172a;color:#e2e8f0;border:1px solid #374151;border-radius:4px;font:13px inherit;resize:vertical"></textarea>'+
      '<div style="display:flex;gap:6px">'+
        '<button class="aic-go" style="flex:1;padding:8px;background:#38bdf8;color:#0f172a;border:0;border-radius:4px;font-weight:600;cursor:pointer">Generate</button>'+
        '<button class="aic-stop" style="padding:8px 14px;background:#dc2626;color:white;border:0;border-radius:4px;cursor:pointer">Stop</button>'+
      '</div>'+
      '<div style="background:#1f2937;border-radius:4px;overflow:hidden;height:6px"><div class="aic-prog" style="height:100%;background:#38bdf8;width:0%;transition:width .2s"></div></div>'+
      '<div class="aic-prog-text" style="font-size:11px;color:#94a3b8">Idle</div>'+
      '<div class="aic-log" style="min-height:200px;max-height:400px;overflow-y:auto;padding:8px;background:#0f172a;border:1px solid #374151;border-radius:4px;font:11px/1.5 SF Mono,monospace;color:#e2e8f0"></div>';
    const sel = wrap.querySelector('.aic-model');
    Object.entries(MODELS).forEach(([id, m]) => {
      const o = document.createElement('option');
      o.value = id; o.textContent = m.label;
      sel.appendChild(o);
    });
    sel.value = smartDefault();
    S.els.banner = wrap.querySelector('.aic-banner');
    S.els.model = sel;
    S.els.key = wrap.querySelector('.aic-key');
    S.els.prompt = wrap.querySelector('.aic-prompt');
    S.els.go = wrap.querySelector('.aic-go');
    S.els.stop = wrap.querySelector('.aic-stop');
    S.els.prog = wrap.querySelector('.aic-prog');
    S.els.progText = wrap.querySelector('.aic-prog-text');
    S.els.log = wrap.querySelector('.aic-log');
    S.els.model.addEventListener('change', updateBanner);
    S.els.key.addEventListener('click', askKey);
    S.els.go.addEventListener('click', run);
    S.els.stop.addEventListener('click', abort);
    S.els.prompt.addEventListener('keydown', (e) => {
      if ((e.metaKey||e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    });
    updateBanner();
    return wrap;
  }

  let uiEl = null;
  window.CycleCAD.AICopilot = {
    init: () => true,
    getUI: () => { if (!uiEl) uiEl = buildUI(); return uiEl; },
    execute: (cmd, params) => {
      if (cmd === 'generate') { if (!uiEl) uiEl = buildUI(); if (params && params.prompt) S.els.prompt.value = params.prompt; return run(); }
      if (cmd === 'stop') return abort();
    },
    go: () => { if (!uiEl) uiEl = buildUI(); return run(); },
    abort: () => abort(),
    getState: () => ({ running:S.running, stepIndex:S.stepIndex, results:S.results.length, errors:S.errors.length, model:S.els.model?.value })
  };
  console.log('AI Copilot v1.1 module loaded');
})();
