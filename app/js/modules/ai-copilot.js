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

  const SYSTEM_PROMPT = [
    'You are a CAD planning assistant.',
    'Output ONLY a JSON array of steps — no prose, no markdown fences.',
    'Each step: {"method":"<ns.cmd>","params":{...},"note":"<short>"}.',
    '',
    'COORDINATE SYSTEM:',
    '- Everything is centered at world origin (0,0,0).',
    '- X = left/right, Y = up, Z = front/back.',
    '- The MAIN BODY sketch is centered, so a 100x50 rect spans X:[-50,50], Z:[-25,25].',
    '- After ops.extrude with depth=20, it spans Y:[0,20].',
    '- Place features at coordinates RELATIVE to this centered body.',
    '',
    'AVAILABLE METHODS:',
    '- sketch.start {plane:"XY"}',
    '- sketch.rect {width, height}  — rectangle centered at current origin',
    '- sketch.circle {radius}  — OR diameter',
    '- sketch.end',
    '- ops.extrude {depth, position:[x,y,z], subtract:bool}  — create solid. subtract:true carves from last body.',
    '- ops.hole {position:[x,y,z], depth, radius OR width+height}  — carves cylinder OR rectangular hole through last body.',
    '- ops.fillet / ops.chamfer / ops.shell  — visual approximation only',
    '- ops.pattern {count, spacingX, spacingZ}  — duplicate last mesh in a grid',
    '- view.set {view:"iso"|"top"|"front"|"side"}',
    '- view.fit',
    '',
    'RULES:',
    '1. ALWAYS use ops.hole for material removal. NEVER use sketch+extrude to make a cutout.',
    '2. For each feature NOT at origin, pass position:[x,y,z] explicitly.',
    '3. Build in order: main body first, then add features (posts, bosses), then subtract features (holes, cutouts), then view.',
    '4. Case bodies: typical is 12mm internal height on a footprint matching the board (+ wall thickness).',
    '',
    'EXAMPLE — Raspberry Pi 4B case (85x56 board, centered):',
    '[',
    '  {"method":"sketch.start","params":{"plane":"XY"}},',
    '  {"method":"sketch.rect","params":{"width":89,"height":60}},',
    '  {"method":"ops.extrude","params":{"depth":14,"position":[0,0,0]},"note":"case body"},',
    '  {"method":"sketch.start","params":{"plane":"XY"}},',
    '  {"method":"sketch.circle","params":{"radius":2.5}},',
    '  {"method":"ops.extrude","params":{"depth":5,"position":[-40.75,14,-26]},"note":"mounting post NW"},',
    '  {"method":"ops.pattern","params":{"count":2,"spacingX":81.5,"spacingZ":0}},',
    '  {"method":"ops.hole","params":{"position":[44.5,7,-10],"width":15,"height":6,"depth":8},"note":"USB cutout"},',
    '  {"method":"ops.hole","params":{"position":[44.5,4,10],"width":12,"height":4,"depth":8},"note":"HDMI"},',
    '  {"method":"ops.hole","params":{"position":[-44.5,7,0],"width":17,"height":14,"depth":8},"note":"Ethernet"},',
    '  {"method":"view.set","params":{"view":"iso"}},',
    '  {"method":"view.fit","params":{}}',
    ']'
  ].join('\n');

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
    if (window._scene) {
      [...window._scene.children].filter(c => c.name === 'AICopilotBuild').forEach(g => window._scene.remove(g));
    }
    miniState.currentSketch = null; miniState.lastMesh = null; miniState.group = null; miniState.body = null;
  }
  function miniEnsureGroup(){
    if (!miniState.group || miniState.group.parent !== window._scene) {
      miniState.group = new window.THREE.Group();
      miniState.group.name = 'AICopilotBuild';
      window._scene.add(miniState.group);
    }
  }
  function getPos(p){
    if (Array.isArray(p.position)) return p.position;
    if (Array.isArray(p.center))   return p.center;
    if (Array.isArray(p.at))       return p.at;
    return [+p.x||0, +p.y||0, +p.z||0];
  }
  let _csgLib = null, _csgEv = null;
  async function loadCSG(){
    if (_csgLib) return _csgLib;
    try {
      const m = await import('/app/js/vendor/three-bvh-csg.js?v=1');
      _csgLib = { Brush:m.Brush, Evaluator:m.Evaluator, SUBTRACTION:m.SUBTRACTION, ADDITION:m.ADDITION };
      _csgEv = new m.Evaluator();
      return _csgLib;
    } catch(e) { console.warn('[Copilot] CSG load failed:', e.message); return null; }
  }
  async function subtractFromBody(cutMesh){
    const target = miniState.body || miniState.lastMesh;
    const csg = await loadCSG();
    if (!csg || !target) { miniState.group.add(cutMesh); return; }
    try {
      target.updateMatrixWorld(true);
      cutMesh.updateMatrixWorld(true);
      const THREE = window.THREE;
      const brA = new csg.Brush(target.geometry.clone(), target.material);
      brA.position.copy(target.position); brA.quaternion.copy(target.quaternion); brA.scale.copy(target.scale); brA.updateMatrixWorld(true);
      const brB = new csg.Brush(cutMesh.geometry.clone(), cutMesh.material);
      brB.position.copy(cutMesh.position); brB.quaternion.copy(cutMesh.quaternion); brB.scale.copy(cutMesh.scale); brB.updateMatrixWorld(true);
      const res = _csgEv.evaluate(brA, brB, csg.SUBTRACTION);
      res.material = target.material;
      miniState.group.remove(target);
      miniState.group.add(res);
      miniState.lastMesh = res;
      miniState.body = res;
    } catch(e) {
      console.warn('[Copilot] CSG subtract failed, visual fallback:', e.message);
      miniState.group.add(cutMesh);
    }
  }
  async function miniExecute(step){
    const method = step.method, params = step.params || {};
    if (!window._scene || !window.THREE) throw new Error('Scene not available');
    const THREE = window.THREE;
    if (method === 'sketch.start') { miniState.currentSketch = { plane: params.plane||'XY', origin: getPos(params) }; return {ok:true}; }
    if (method === 'sketch.rect')  { miniState.currentSketch = Object.assign(miniState.currentSketch||{}, { shape:'rect', width: params.width||params.w||50, height: params.height||params.h||30, origin: getPos(params) }); return {ok:true}; }
    if (method === 'sketch.circle'){ miniState.currentSketch = Object.assign(miniState.currentSketch||{}, { shape:'circle', radius: params.radius||params.r||(params.diameter?params.diameter/2:25), origin: getPos(params) }); return {ok:true}; }
    if (method === 'sketch.line' || method === 'sketch.end') return {ok:true};
    if (method === 'ops.extrude') {
      const d = params.depth||params.height||params.distance||20;
      const sk = miniState.currentSketch || {};
      const explicitPos = (Array.isArray(params.position)||params.x!==undefined) ? getPos(params) : null;
      const pos = explicitPos || sk.origin || [0,0,0];
      let g;
      if (sk.shape==='rect')         g = new THREE.BoxGeometry(sk.width, d, sk.height);
      else if (sk.shape==='circle')  g = new THREE.CylinderGeometry(sk.radius, sk.radius, d, 48);
      else                           g = new THREE.BoxGeometry(50, d, 30);
      const isSubtract = params.subtract === true || params.operation === 'cut' || params.operation === 'subtract';
      const mat = new THREE.MeshStandardMaterial({color: isSubtract?0x1a1a1a:0x4a90e2, metalness:0.35, roughness:0.45});
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true;
      mesh.position.set(pos[0]||0, (pos[1]||0) + d/2, pos[2]||0);
      miniEnsureGroup();
      if (isSubtract) { await subtractFromBody(mesh); }
      else { miniState.group.add(mesh); miniState.lastMesh = mesh; if (!miniState.body) miniState.body = mesh; }
      miniState.currentSketch = null;
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
    if (method === 'ops.hole' || method === 'ops.subtract' || method === 'ops.cut') {
      const pos = getPos(params);
      const d = params.depth || 25;
      let g;
      if (params.width && params.height) {
        g = new THREE.BoxGeometry(params.width, d, params.height);
      } else {
        const r = params.radius || (params.diameter?params.diameter/2:3);
        g = new THREE.CylinderGeometry(r, r, d, 48);
      }
      const cutMesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color:0x000000}));
      cutMesh.position.set(pos[0]||0, (pos[1]||0) + d/2 - 0.5, pos[2]||0);
      miniEnsureGroup();
      await subtractFromBody(cutMesh);
      return {ok:true};
    }
    if (method === 'ops.pattern') {
      if (!miniState.lastMesh) return {ok:true, note:'no base mesh'};
      const count = Math.max(2, Math.min(20, params.count||4));
      const sx = params.spacingX || (params.direction==='x'?params.spacing:0) || 0;
      const sz = params.spacingZ || (params.direction==='z'?params.spacing:0) || 0;
      const sy = params.spacingY || 0;
      for (let i = 1; i < count; i++) {
        const c = miniState.lastMesh.clone();
        c.position.x += sx*i; c.position.z += sz*i; c.position.y += sy*i;
        miniState.group.add(c);
      }
      return {ok:true};
    }
    if (['ops.fillet','ops.chamfer','ops.shell'].includes(method)) return {ok:true, note:method+' (visual approximation)'};
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
      const d2 = 250;
      if (v === 'top')     window._camera.position.set(0, d2, 0);
      else if (v === 'front') window._camera.position.set(0, 0, d2);
      else if (v === 'side' || v === 'right') window._camera.position.set(d2, 0, 0);
      else                 window._camera.position.set(d2*0.7, d2*0.7, d2*0.7);
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
  function matchTemplate(prompt){
    const p = (prompt||'').toLowerCase();
    // Raspberry Pi 4B case
    if (/raspberry\s*pi|\brpi\b|pi\s*4/.test(p) && /case|enclosure|housing|box/.test(p)) {
      const hasUSB = /usb/.test(p), hasHDMI = /hdmi/.test(p), hasEth = /ethernet|lan|rj-?45/.test(p), hasPosts = /mount|post|stud|boss/.test(p);
      const plan = [
        {method:'sketch.start', params:{plane:'XY'}, note:'base sketch'},
        {method:'sketch.rect', params:{width:89, height:60}, note:'case footprint 89x60'},
        {method:'ops.extrude', params:{depth:14, position:[0,0,0]}, note:'case body'}
      ];
      if (hasPosts) {
        [[-38.75,14,-26],[38.75,14,-26],[-38.75,14,26],[38.75,14,26]].forEach((pos,i) => {
          plan.push({method:'sketch.start', params:{plane:'XY'}});
          plan.push({method:'sketch.circle', params:{radius:2.5}});
          plan.push({method:'ops.extrude', params:{depth:4, position:pos}, note:'mounting post '+(i+1)+'/4'});
        });
      }
      if (hasUSB) plan.push({method:'ops.hole', params:{position:[44.5,7,-10], width:15, height:6, depth:10}, note:'USB cutout'});
      if (hasHDMI) plan.push({method:'ops.hole', params:{position:[44.5,4,10], width:12, height:4, depth:10}, note:'HDMI cutout'});
      if (hasEth) plan.push({method:'ops.hole', params:{position:[-44.5,7,0], width:17, height:14, depth:10}, note:'Ethernet cutout'});
      plan.push({method:'view.set', params:{view:'iso'}});
      plan.push({method:'view.fit', params:{}});
      return plan;
    }
    // Hex nut
    const nutM = p.match(/\bm(\d+)\b.*?(?:hex\s*)?nut|(?:hex\s*)?nut.*?\bm(\d+)\b/);
    if (nutM) {
      const size = parseInt(nutM[1]||nutM[2]);
      const across = {3:5.5, 4:7, 5:8, 6:10, 8:13, 10:17, 12:19}[size] || size*1.7;
      const thick = {3:2.4, 4:3.2, 5:4, 6:5, 8:6.8, 10:8.4, 12:10.8}[size] || size*0.85;
      return [
        {method:'sketch.start', params:{plane:'XY'}},
        {method:'sketch.circle', params:{radius: across/2}},
        {method:'ops.extrude', params:{depth: thick, position:[0,0,0]}, note:'M'+size+' nut body ('+across+'mm across)'},
        {method:'ops.hole', params:{position:[0, thick, 0], radius: size/2, depth: thick+2}, note:'threaded hole M'+size},
        {method:'view.set', params:{view:'iso'}},
        {method:'view.fit', params:{}}
      ];
    }
    // DIN 125 washer (M3-M12)
    const washerM = p.match(/\bm(\d+)\s*washer|washer\s+m(\d+)|din\s*125\s*m?(\d+)/);
    if (washerM) {
      const size = parseInt(washerM[1]||washerM[2]||washerM[3]);
      const outerR = ({3:3.5, 4:4.5, 5:5.3, 6:6.4, 8:8.4, 10:10.5, 12:13})[size] || size*1.2;
      const thick  = ({3:0.5, 4:0.8, 5:1,   6:1.6, 8:1.6, 10:2,    12:2.5})[size] || size*0.2;
      const holeR = (size + 0.4) / 2;
      return [
        {method:'sketch.start', params:{plane:'XY'}},
        {method:'sketch.circle', params:{radius: outerR}},
        {method:'ops.extrude', params:{depth: thick, position:[0,0,0]}, note:'DIN 125 M'+size+' washer'},
        {method:'ops.hole', params:{position:[0, thick, 0], radius: holeR, depth: thick+2}, note:'M'+size+' hole'},
        {method:'view.set', params:{view:'iso'}},
        {method:'view.fit', params:{}}
      ];
    }
    // Flange with bolt circle
    const flangeM = p.match(/flange/);
    if (flangeM) {
      const odM = p.match(/(\d+)\s*mm/);
      const od = odM ? parseInt(odM[1]) : 80;
      const nM = p.match(/(\d+)\s*(?:bolt\s*)?holes?/);
      const nHoles = nM ? parseInt(nM[1]) : 4;
      const pcdM = p.match(/pcd\s*(\d+)|bolt\s*circle\s*(\d+)/);
      const pcd = pcdM ? parseInt(pcdM[1]||pcdM[2]) : Math.round(od*0.7);
      const thick = 8;
      const plan = [
        {method:'sketch.start', params:{plane:'XY'}},
        {method:'sketch.circle', params:{radius: od/2}},
        {method:'ops.extrude', params:{depth: thick, position:[0,0,0]}, note:'flange body Ø'+od},
        {method:'ops.hole', params:{position:[0, thick, 0], radius: Math.max(5, od/8), depth: thick+2}, note:'center bore'}
      ];
      for (let i = 0; i < nHoles; i++) {
        const a = (i / nHoles) * Math.PI * 2;
        const x = Math.cos(a) * pcd/2, z = Math.sin(a) * pcd/2;
        plan.push({method:'ops.hole', params:{position:[x, thick/2, z], radius: 3, depth: thick+2}, note:'bolt hole '+(i+1)+'/'+nHoles});
      }
      plan.push({method:'view.set', params:{view:'iso'}});
      plan.push({method:'view.fit', params:{}});
      return plan;
    }
    // Threaded rod / stud
    const rodM = p.match(/threaded\s*rod|m(\d+)\s*rod|m(\d+)\s*stud|studding/);
    if (rodM) {
      const sM = p.match(/m(\d+)/);
      const size = sM ? parseInt(sM[1]) : 8;
      const lM = p.match(/(\d+)\s*mm/);
      const len = lM ? parseInt(lM[1]) : 100;
      return [
        {method:'sketch.start', params:{plane:'XY'}},
        {method:'sketch.circle', params:{radius: size/2}},
        {method:'ops.extrude', params:{depth: len, position:[0,0,0]}, note:'M'+size+' threaded rod, '+len+'mm long'},
        {method:'view.set', params:{view:'iso'}},
        {method:'view.fit', params:{}}
      ];
    }
    // Mounting plate
    const plateM = p.match(/mounting\s*plate|base\s*plate|flat\s*plate/);
    if (plateM) {
      const dimM = p.match(/(\d+)\s*x\s*(\d+)/);
      const w = dimM ? parseInt(dimM[1]) : 120;
      const h = dimM ? parseInt(dimM[2]) : 80;
      const thick = 6;
      const nM = p.match(/(\d+)\s*holes?/);
      const nHoles = nM ? parseInt(nM[1]) : 4;
      const plan = [
        {method:'sketch.start', params:{plane:'XY'}},
        {method:'sketch.rect', params:{width: w, height: h}},
        {method:'ops.extrude', params:{depth: thick, position:[0,0,0]}, note: w+'x'+h+'x'+thick+' mounting plate'}
      ];
      if (nHoles === 4) {
        const mx = w/2 - 10, mz = h/2 - 10;
        [[-mx,-mz],[mx,-mz],[-mx,mz],[mx,mz]].forEach((pp,i) => {
          plan.push({method:'ops.hole', params:{position:[pp[0], thick/2, pp[1]], radius:3, depth:thick+2}, note:'corner hole '+(i+1)});
        });
      } else {
        for (let i = 0; i < nHoles; i++) {
          const x = -w/2 + 10 + (i/(nHoles-1)) * (w-20);
          plan.push({method:'ops.hole', params:{position:[x, thick/2, 0], radius:3, depth:thick+2}, note:'hole '+(i+1)});
        }
      }
      plan.push({method:'view.set', params:{view:'iso'}});
      plan.push({method:'view.fit', params:{}});
      return plan;
    }
    // Generic box NxNxN with optional fillet
    const boxM = p.match(/\bbox\b|\bblock\b|\bcube\b|\bcuboid\b/);
    const boxDim = p.match(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/);
    if (boxM && boxDim) {
      const w = parseInt(boxDim[1]), h = parseInt(boxDim[2]), d = parseInt(boxDim[3]);
      return [
        {method:'sketch.start', params:{plane:'XY'}},
        {method:'sketch.rect', params:{width: w, height: d}},
        {method:'ops.extrude', params:{depth: h, position:[0,0,0]}, note: w+'x'+h+'x'+d+' box'},
        {method:'view.set', params:{view:'iso'}},
        {method:'view.fit', params:{}}
      ];
    }
        // L-bracket with holes
    if (/l-?bracket|mounting\s*bracket|angle\s*bracket/.test(p)) {
      const lenM = p.match(/(\d+)\s*mm/);
      const length = lenM ? parseInt(lenM[1]) : 100;
      const countM = p.match(/(\d+)\s*holes?/);
      const count = countM ? parseInt(countM[1]) : 4;
      const spreadM = p.match(/(\d+)\s*mm\s*centers?|on\s*(\d+)/);
      const spread = spreadM ? parseInt(spreadM[1]||spreadM[2]) : Math.max(20, length-20);
      const plan = [
        {method:'sketch.start', params:{plane:'XY'}},
        {method:'sketch.rect', params:{width: length, height: 60}},
        {method:'ops.extrude', params:{depth:5, position:[0,0,0]}, note:length+'mm L-bracket plate'}
      ];
      const half = spread/2;
      for (let i = 0; i < count; i++) {
        const x = (count===4) ? (i%2===0?-half:half) : (i - (count-1)/2) * (spread/(count-1));
        const z = (count===4) ? (i<2?-20:20) : 0;
        plan.push({method:'ops.hole', params:{position:[x,3,z], radius:2.5, depth:6}, note:'hole '+(i+1)+'/'+count});
      }
      plan.push({method:'view.set', params:{view:'iso'}});
      plan.push({method:'view.fit', params:{}});
      return plan;
    }
    return null;
  }
  async function run(){
    if (S.running) { log('Already running', 'fail'); return; }
    const prompt = (S.els.prompt?.value || '').trim();
    if (!prompt) { log('Enter a prompt first', 'fail'); return; }
    const quotedMatches = prompt.match(/"([^"]{10,})"/g) || [];
    let effectivePrompt = prompt;
    if (quotedMatches.length >= 2) {
      const first = quotedMatches[0].replace(/^"|"$/g, '');
      log('Detected '+quotedMatches.length+' goals. Running only the first: \"'+first.slice(0,60)+'...\"', 'info');
      log('To run the others, paste them one at a time.', 'info');
      effectivePrompt = first;
    }
    const modelId = S.els.model?.value;
    const m = MODELS[modelId];
    const earlyTpl = matchTemplate(effectivePrompt);
    if (!earlyTpl && !getKeys()[m.keyField]) { log('Missing '+m.keyField+' key — click the key icon', 'fail'); return; }
    S.running = true; S.abort = false; S.stepIndex = 0; S.results = []; S.errors = []; miniReset();
    progress(5, 'Planning...');
    log('Planning with '+m.label+'...', 'info');
    let plan;
    if (earlyTpl) {
      log('Matched built-in template ('+earlyTpl.length+' steps). Skipping LLM.', 'pass');
      plan = earlyTpl;
    }
    try {
      if (!plan) {
        const raw = await callLLM(modelId, effectivePrompt);
        plan = parseJson(raw);
        if (!Array.isArray(plan)) throw new Error('Plan is not an array');
        setLastWorkingModel(modelId);
        log('Got '+plan.length+'-step plan. Executing...', 'pass');
      }
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
