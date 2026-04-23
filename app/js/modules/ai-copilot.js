limit',hint:'Rate-limited. Wait 60s or switch providers.'};
  }
  if(m.includes('missing')&&m.includes('key')){
    return{kind:'no_key',hint:'Click 🔑 to add your API key.'};
  }
  return{kind:'other',hint:''};
}

async function callClaude(m,sys,u,k){const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':k,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:m,max_tokens:4096,system:sys,messages:[{role:'user',content:u}]})});if(!r.ok)throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0,400)}`);return(await r.json()).content?.[0]?.text||''}
async function callGemini(m,sys,u,k){
  // Try the requested model, then fall back to gemini-1.5-flash if the model is not found on v1beta
  const fallbacks=[m,'gemini-1.5-flash','gemini-1.5-flash-latest'];
  let lastErr;
  for(const model of fallbacks){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text:u}]}],generationConfig:{temperature:0.2,maxOutputTokens:4096}})});
      if(r.ok)return(await r.json()).candidates?.[0]?.content?.parts?.[0]?.text||'';
      const errTxt=(await r.text()).slice(0,400);
      lastErr=`Gemini ${r.status}: ${errTxt}`;
      // Only fall through on 404; other errors (401, 429) should surface immediately
      if(r.status!==404)throw new Error(lastErr);
    }catch(e){
      if(!e.message.startsWith('Gemini 404'))throw e;
      lastErr=e.message;
    }
  }
  throw new Error(lastErr||'All Gemini fallbacks failed');
}
async function callGroq(m,sys,u,k){const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'authorization':`Bearer ${k}`,'content-type':'application/json'},body:JSON.stringify({model:m,messages:[{role:'system',content:sys},{role:'user',content:u}],temperature:0.2,max_tokens:4096})});if(!r.ok)throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0,400)}`);return(await r.json()).choices?.[0]?.message?.content||''}
async function callLLM(mk,sys,u){const c=MODELS[mk];if(!c)throw new Error('Unknown model');const ak=keys()[c.keyField];if(!ak)throw new Error(`Missing ${c.keyField} key — click 🔑 to add one`);if(c.provider==='anthropic')return callClaude(c.model,sys,u,ak);if(c.provider==='gemini')return callGemini(c.model,sys,u,ak);if(c.provider==='groq')return callGroq(c.model,sys,u,ak)}

function parseJson(t){let s=t.trim();const f=s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);if(f)s=f[1];const a=s.indexOf('['),b=s.lastIndexOf(']');if(a<0||b<a)throw new Error('No JSON array');return JSON.parse(s.slice(a,b+1))}
async function runStep(st){if(!window.cycleCAD?.execute)throw new Error('window.cycleCAD.execute unavailable');const r=window.cycleCAD.execute({method:st.method,params:st.params||{}});if(r?.ok===false)throw new Error(r.error||'step failed');return r}

function log(kind,txt){
  if(!S.els.log)return;
  const d=document.createElement('div');
  d.className=`aic-log-${kind}`;
  d.textContent=({info:'ℹ',ok:'✓',warn:'⚠',err:'✗',run:'⋯',fail:'✗'})[kind]+' '+txt;
  S.els.log.appendChild(d);
  S.els.log.scrollTop=S.els.log.scrollHeight;
}

function showActionableError(errMsg){
  const cls=classifyError(errMsg);
  log('err',errMsg);
  if(cls.hint){
    const d=document.createElement('div');
    d.className='aic-hint-line';
    d.textContent='💡 '+cls.hint;
    S.els.log.appendChild(d);
  }
  // Auto-suggest switching to a free model if current is paid and failed with no-credit/bad-key
  if(cls.kind==='no_credit'||cls.kind==='bad_key'){
    const cur=MODELS[S.els.model.value];
    if(cur&&!cur.free){
      const freeAvail=FREE_MODELS.filter(m=>keys()[MODELS[m].keyField]);
      if(freeAvail.length){
        const btn=document.createElement('button');
        btn.className='aic-switch-btn';
        btn.textContent=`⚡ Switch to ${MODELS[freeAvail[0]].label}`;
        btn.onclick=()=>{S.els.model.value=freeAvail[0];updateBanner();log('info',`Switched to ${MODELS[freeAvail[0]].label}`);btn.remove()};
        S.els.log.appendChild(btn);
      }else{
        const d=document.createElement('div');
        d.className='aic-hint-line';
        d.textContent='→ Get a free Gemini key at aistudio.google.com/apikey (or Groq at console.groq.com/keys), then click 🔑 to add it.';
        S.els.log.appendChild(d);
      }
    }
  }
  S.els.log.scrollTop=S.els.log.scrollHeight;
}

function progress(c,t){const p=t?Math.round(c/t*100):0;S.els.prog.style.width=p+'%';S.els.stat.textContent=`${c}/${t}`}

function updateBanner(){
  if(!S.els.banner)return;
  const mk=S.els.model?.value;
  if(!mk){S.els.banner.style.display='none';return}
  const cfg=MODELS[mk];
  const ak=keys()[cfg.keyField];
  if(!ak){
    S.els.banner.className='aic-banner aic-banner-warn';
    S.els.banner.innerHTML=`⚠ No <b>${cfg.keyField}</b> key set. Click 🔑 to add one.`;
    S.els.banner.style.display='block';
  }else{
    S.els.banner.className='aic-banner aic-banner-ok';
    S.els.banner.innerHTML=` ✓ Ready — using <b>${cfg.label}</b>${cfg.free?' (free tier)':''}`;
    S.els.banner.style.display='block';
  }
}

async function run(){
  if(S.running)return;
  const p=S.els.prompt.value.trim();
  if(!p){log('warn','Enter a prompt first.');return}
  S.running=true;S.aborted=false;
  S.els.go.disabled=true;S.els.stop.disabled=false;
  S.els.log.innerHTML='';
  log('info',`Planning with ${MODELS[S.els.model.value].label}...`);
  try{
    const t=await callLLM(S.els.model.value,SYS,p);
    // Mark this model as working
    setLastWorkingModel(S.els.model.value);
    let plan;
    try{plan=parseJson(t)}catch(e){
      log('err',`Parse: ${e.message}`);
      log('warn',t.slice(0,300));
      return;
    }
    if(!Array.isArray(plan)||!plan.length){log('warn','Empty plan');return}
    log('ok',`Got ${plan.length}-step plan. Executing...`);
    S.plan=plan;S.results=[];S.errors=[];
    let retries=0;
    for(let i=0;i<S.plan.length;i++){
      if(S.aborted){log('warn','Aborted.');return}
      const st=S.plan[i];
      log('run',`step ${i+1}: ${st.method} — ${st.note||''}`);
      progress(i,S.plan.length);
      await new Promise(r=>setTimeout(r,150));
      try{
        const r=await runStep(st);
        S.results.push(r);
        log('ok',`step ${i+1} done`);
      }catch(e){
        log('fail',`step ${i+1}: ${e.message}`);
        S.errors.push({step:st,error:e.message});
        if(retries>=2){log('warn','Max retries — stopping.');return}
        retries++;
        log('info',`Asking for recovery plan (${retries}/2)...`);
        const rem=S.plan.slice(i+1);
        const rp=`Previous step failed:\nFAILED_STEP: ${JSON.stringify(st)}\nERROR: ${e.message}\nREMAINING: ${JSON.stringify(rem)}\nGoal: ${p}\nReturn replacement JSON array of steps to recover and finish.`;
        try{
          const rt=await callLLM(S.els.model.value,SYS,rp);
          const newPlan=parseJson(rt);
          S.plan=S.plan.slice(0,i+1).concat(newPlan);
          log('info',`Inserted ${newPlan.length} recovery steps`);
        }catch(e2){
          showActionableError(`Recovery failed: ${e2.message}`);
          return;
        }
      }
    }
    progress(S.plan.length,S.plan.length);
    log('ok',`Done — ${S.results.length}/${S.plan.length} succeeded`);
  }catch(e){
    showActionableError(e.message);
  }finally{
    S.running=false;
    S.els.go.disabled=false;
    S.els.stop.disabled=true;
    updateBanner();
  }
}

function abort(){if(S.running){S.aborted=true;log('warn','Abort signaled')}}

function askKey(){
  const f=MODELS[S.els.model.value].keyField;
  const c=keys()[f]||'';
  const n=prompt(`Enter ${f} API key (stored in localStorage):`,c);
  if(n!==null&&n!==c){
    saveKey(f,n.trim());
    log('ok',`${f} key saved`);
    updateBanner();
  }
}

function buildUI(){
  const p=document.createElement('div');
  p.innerHTML=`<style>
.aic{display:flex;flex-direction:column;gap:10px;padding:12px;color:#e2e8f0;background:#1a202c;font:13px -apple-system,sans-serif;min-width:320px;max-width:420px}
.aic h3{margin:0;font-size:15px;color:#38bdf8}
.aic-banner{padding:6px 8px;border-radius:4px;font-size:11px;display:none}
.aic-banner-ok{background:rgba(16,185,129,0.1);color:#10b981;border-left:2px solid #10b981}
.aic-banner-warn{background:rgba(245,158,11,0.1);color:#f59e0b;border-left:2px solid #f59e0b}
.aic-row{display:flex;gap:6px;align-items:center}
.aic-row select{flex:1;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:4px 6px;font-size:12px}
.aic-row button{background:#334155;color:#e2e8f0;border:0;border-radius:4px;padding:4px 8px;cursor:pointer}
.aic textarea{width:100%;min-height:80px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:8px;font:13px inherit;resize:vertical;box-sizing:border-box}
.aic-btns{display:flex;gap:8px}
.aic-btns button{flex:1;padding:8px 12px;border:0;border-radius:4px;font-weight:600;cursor:pointer}
.aic-go{background:#38bdf8;color:#0f172a}
.aic-go:disabled{background:#475569;color:#94a3b8;cursor:not-allowed}
.aic-stop{background:#ef4444;color:#fff}
.aic-stop:disabled{background:#334155;color:#64748b;cursor:not-allowed}
.aic-bar{height:4px;background:#334155;border-radius:2px;overflow:hidden}
.aic-prog{height:100%;width:0;background:linear-gradient(90deg,#38bdf8,#8b5cf6);transition:width .2s}
.aic-stat{font-size:11px;color:#94a3b8;text-align:right}
.aic-log{background:#0f172a;border:1px solid #1e293b;border-radius:4px;padding:8px;min-height:160px;max-height:320px;overflow-y:auto;font:11px 'SF Mono',monospace;line-height:1.5}
.aic-log>div{white-space:pre-wrap}
.aic-log-info{color:#94a3b8}
.aic-log-ok{color:#10b981}
.aic-log-warn{color:#f59e0b}
.aic-log-err,.aic-log-fail{color:#ef4444}
.aic-log-run{color:#38bdf8}
.aic-hint-line{color:#fbbf24;padding:4px 8px;margin-top:4px;background:rgba(251,191,36,0.08);border-radius:4px}
.aic-switch-btn{display:block;margin:6px 0;padding:6px 10px;background:#38bdf8;color:#0f172a;border:0;border-radius:4px;font-weight:600;cursor:pointer;font-size:12px;width:auto}
.aic-switch-btn:hover{background:#0ea5e9}
.aic-hint{font-size:11px;color:#64748b}
</style>
<div class="aic">
<h3>🤖 AI Copilot</h3>
<div class="aic-banner"></div>
<div class="aic-row">
<select class="aic-model"></select>
<button class="aic-key" title="Set API key">🔑</button>
</div>
<textarea class="aic-prompt" placeholder="Describe what to build. Examples:
• create a Raspberry Pi 4B case with port cutouts
• design a 50mm mounting bracket with 4 holes on 40mm PCD
• make a hex nut M10, 8mm thick"></textarea>
<div class="aic-btns">
<button class="aic-go">⚡ Generate</button>
<button class="aic-stop" disabled>⏹ Stop</button>
</div>
<div class="aic-bar"><div class="aic-prog"></div></div>
<div class="aic-stat">0/0</div>
<div class="aic-log"></div>
<div class="aic-hint">Multi-step plan. LLM retries up to 2× on step failure. Cmd/Ctrl+Enter to run.</div>
</div>`;
  S.els.prompt=p.querySelector('.aic-prompt');
  S.els.go=p.querySelector('.aic-go');
  S.els.stop=p.querySelector('.aic-stop');
  S.els.log=p.querySelector('.aic-log');
  S.els.stat=p.querySelector('.aic-stat');
  S.els.prog=p.querySelector('.aic-prog');
  S.els.model=p.querySelector('.aic-model');
  S.els.banner=p.querySelector('.aic-banner');

  for(const[k_c]of Object.entries(MODELS)){
    const o=document.createElement('option');
    o.value=k_;o.textContent=c.label;
    S.els.model.appendChild(o);
  }

  // Smart default: prefer last-working model, else first free model with a key,
  // else first paid model with a key, else gemini
  const storedKeys=keys();
  const lastWorking=getLastWorkingModel();
  if(lastWorking&&MODELS[lastWorking]&&storedKeys[MODELS[lastWorking].keyField]){
    S.els.model.value=lastWorking;
  }else{
    const firstUsable=Object.keys(MODELS).find(k=>storedKeys[MODELS[k].keyField]&&MODELS[k].free)
      ||Object.keys(MODELS).find(k=>storedKeys[MODELS[k].keyField])
      ||'gemini';
    S.els.model.value=firstUsable;
  }

  S.els.go.onclick=run;
  S.els.stop.onclick=abort;
  p.querySelector('.aic-key').onclick=askKey;
  S.els.model.onchange=updateBanner;
  S.els.prompt.onkeydown=e=>{
    if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();run()}
  };

  // Initial banner
  setTimeout(updateBanner,0);
  return p;
}

window.CycleCAD=window.CycleCAD||{};
window.CycleCAD.AICopilot={
  init:()=>true,
  getUI:buildUI,
  execute:(c,a)=>c==='generate'&&a?.prompt?(S.els.prompt&&(S.els.prompt.value=a.prompt),run()):c==='stop'?abort():null,
  go:run,
  abort,
  getState:()=>({running:S.running,stepIndex:S.plan.length-1,results:S.results.length,errors:S.errors.length,model:S.els.model?.value}),
};
console.log('AI Copilot v1.1 module loaded');
})();
