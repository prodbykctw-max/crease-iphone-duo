/* CREASE product layer: local leaderboard plus provider-verified premium hooks. */
(function(root){
  'use strict';
  const PRODUCT={id:'crease-premium-pass',name:'CREASE Premium Pass'};
  const safe={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
  // Checkout settings live in assets/commerce-config.js and are read at call time.
  const cfg=()=>root.CREASE_COMMERCE||{};
  // Only a Lemon Squeezy or Stripe Payment Link (buy.stripe.com) https link counts as a checkout; anything else
  // (blank, typo, another site) is "not on sale". Which one it is decides how a pass is restored.
  const checkoutUrl=()=>{try{const u=new URL(String(cfg().CHECKOUT_URL||'').trim());return u.protocol==='https:'&&(/(^|\.)lemonsqueezy\.com$/.test(u.hostname)||u.hostname==='buy.stripe.com')?u:null}catch{return null}};
  const checkoutHref=()=>{const u=checkoutUrl();return u?u.href:''};
  const provider=()=>{const u=checkoutUrl();return !u?'':u.hostname==='buy.stripe.com'?'stripe':'lemonsqueezy'};
  const SESSION=/^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
  // A random id this browser makes for itself, so a Stripe purchase can count the devices it unlocked (limit 5).
  // It is not tied to a person and is only ever sent to the license Worker.
  const deviceId=()=>{let d=safe.get('crease.device.v1');if(d&&/^[a-f0-9]{32}$/.test(d))return d;
    const c=root.crypto;if(!c||typeof c.getRandomValues!=='function')return '';
    d=Array.from(c.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');safe.set('crease.device.v1',d);return d};
  const workerBase=()=>{try{const u=new URL(String(cfg().WORKER_URL||'').trim());return u.protocol==='https:'?u.origin:''}catch{return ''}};
  const cleanKey=k=>{const s=String(k==null?'':k).replace(/\s+/g,'');return /^[A-Za-z0-9_-]{8,100}$/.test(s)?s:''};
  const FOUNDER_DAYS=30,FOUNDER_TEXT='Launch-window exclusive: Premium Passes bought in the Pass’s first 30 days on sale. Never sold again.';
  // The saved entitlement: whether a pass is active, the signed token the license Worker issued, whether the
  // Worker counted it as a launch-window (Founder) pass, and the activation instance (so asking again on this
  // device does not use up another activation).
  let ent=null;
  try{const e=JSON.parse(safe.get('crease.entitlement.v1')||'null');if(e&&e.product===PRODUCT.id)ent={verifiedAt:Number(e.verifiedAt)||0,token:typeof e.token==='string'?e.token:'',founder:e.founder===true,instanceId:typeof e.instanceId==='string'?e.instanceId:''}}catch{}
  let premium=!!ent;
  // Premium paddles carry a signature effect (trail sparks on every hit and their own goal explosion),
  // so they read as earned/paid at a glance, in clips and on the share card. Founder's Gold is decided by the
  // license Worker from the purchase time the store (Lemon Squeezy or Stripe) records, never by this device's clock.
  const styles={classic:{name:'Classic Cyan',premium:false,ring:'#2de2e6',core:'#ffffff',trail:'#2de2e6',desc:'Included with every game.'},
    prism:{name:'Prism Glass',premium:true,ring:'#c6a6ff',core:'#ffffff',trail:'#d18cff',fx:['#ff5ea8','#ffd23f','#39ff88','#2de2e6','#a06bff'],desc:'Two looks, Crystal and Lens. Spectrum rays on every hit; rainbow stripes and color beams when you score.'},
    solar:{name:'Solar Flare',premium:true,ring:'#ffc44d',core:'#fff5c2',trail:'#ff713b',fx:['#ff713b','#ffc44d','#fff5c2'],desc:'Two looks, Molten and Eclipse. A star burst on every hit; a 28-ray supernova when you score.'},
    obsidian:{name:'Obsidian Mint',premium:true,ring:'#62f6c6',core:'#d7fff4',trail:'#47cfa4',fx:['#62f6c6','#d7fff4','#0b3a2e'],desc:'Two looks, Circuit and Hex. Hex rings and cracks on every hit; lightning bolts when you score.'},
    founder:{name:"Founder's Gold",premium:true,founder:true,ring:'#ffd23f',core:'#fff7d1',trail:'#ffb020',fx:['#ffd23f','#ffffff','#ffb020'],desc:FOUNDER_TEXT}};
  const leaderboard=(()=>{let rows=[];try{rows=JSON.parse(safe.get('crease.leaderboard.v1')||'[]')||[]}catch{};return rows.filter(r=>r&&typeof r.name==='string').slice(0,100)})();
  // Reads one value from the address (?name= or #name=) and removes it from the address bar straight away.
  const takeParam=(name,clean,loc,hist)=>{try{
    const q=new URLSearchParams(loc.search||''),h=new URLSearchParams(String(loc.hash||'').replace(/^#/,''));
    const found=h.get(name)!==null||q.get(name)!==null,value=clean(h.get(name)||q.get(name));
    if(found&&hist&&hist.replaceState){q.delete(name);h.delete(name);const qs=q.toString(),hs=h.toString();hist.replaceState(null,'',loc.pathname+(qs?'?'+qs:'')+(hs?'#'+hs:''))}
    return value;
  }catch{return ''}};
  // One call to the license Worker. A pass is unlocked only when the Worker answers verified:true for this product.
  const REASONS=['invalid','wrong_product','limit','expired','revoked','unpaid','not_found','unavailable'];
  const ask=async(route,body)=>{
    const base=workerBase();if(!base||typeof root.fetch!=='function')return{ok:false,reason:'offline'};
    let timer=0;const ctl=typeof AbortController==='function'?new AbortController():null;
    try{
      if(ctl)timer=setTimeout(()=>ctl.abort(),15000);
      const res=await root.fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',signal:ctl?ctl.signal:undefined,body:JSON.stringify(body)});
      const data=await res.json();
      if(data&&data.verified===true&&data.product===PRODUCT.id&&typeof data.token==='string'&&api.activateProviderEntitlement({product:data.product,verified:true,token:data.token,founder:data.founder===true,instanceId:data.instanceId}))
        return{ok:true,founder:api.isFounder()};
      return{ok:false,reason:REASONS.includes(data&&data.reason)?data.reason:'invalid'};
    }catch{return{ok:false,reason:'offline'}}
    finally{clearTimeout(timer)}
  };
  // Premium paddle looks. Each signature paddle ships two looks (A and B); owning the paddle unlocks both, and both
  // looks play that paddle's B effects. The chosen look per paddle is remembered next to the equipped paddle.
  // The Design Studio mixes any look/effect set the player owns; saved mixes are cleaned here before they are used.
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const LOOKS={prism:[{id:'A',name:'Crystal'},{id:'B',name:'Lens'}],solar:[{id:'A',name:'Molten'},{id:'B',name:'Eclipse'}],obsidian:[{id:'A',name:'Circuit'},{id:'B',name:'Hex'}]};
  const LOOK_KEY='crease.paddleLook.v1';
  const FX_NAMES={classic:'Classic sparks',prismA:'Prism shards',prismB:'Prism rays',solarA:'Solar embers',solarB:'Solar supernova',obsidianA:'Mint shockwaves',obsidianB:'Obsidian lightning'};
  const SET_KEYS=Object.keys(LOOKS).reduce((a,id)=>a.concat(LOOKS[id].map(l=>id+l.id)),[]);
  const MIX_LIMITS={hue:{min:-180,max:180,def:0},size:{min:.6,max:1.6,def:1},power:{min:.4,max:1.6,def:1}};
  const num=(v,lim)=>{const n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;return Number.isFinite(n)?Math.min(lim.max,Math.max(lim.min,n)):lim.def};
  const pick=(v,list,def)=>typeof v==='string'&&list.indexOf(v)>=0?v:def;
  const storedLooks=()=>{let o=null;try{o=JSON.parse(safe.get(LOOK_KEY)||'null')}catch{}const out={};for(const id of Object.keys(LOOKS)){const v=o&&typeof o==='object'?o[id]:null;out[id]=LOOKS[id].some(l=>l.id===v)?v:'A'}return out};
  let looksMem=null;const looksNow=()=>looksMem||(looksMem=storedLooks());   // read once; the match asks every frame
  const looksApi={
    looks:LOOKS,lookSets:SET_KEYS.slice(),fxNames:FX_NAMES,mixLimits:MIX_LIMITS,
    paddleLook(id){return own(LOOKS,id)?looksNow()[id]:''},
    setPaddleLook(id,look){if(!own(LOOKS,id)||!LOOKS[id].some(l=>l.id===look)||!api.canUse(id))return false;const o=looksNow();o[id]=look;safe.set(LOOK_KEY,JSON.stringify(o));return true},
    // Which effect set a paddle look plays. Both looks of a signature paddle use that paddle's B effects.
    effectsFor(id,look){return own(LOOKS,id)&&LOOKS[id].some(l=>l.id===look)?id+'B':''},
    lookName(key){const id=String(key).slice(0,-1),l=own(LOOKS,id)&&LOOKS[id].find(x=>x.id===String(key).slice(-1));return l?api.styles[id].name+' · '+l.name:key==='founder'?api.styles.founder.name:'Classic Cyan'},
    canUseLook(key){if(key==='classic')return true;if(key==='founder')return api.canUse('founder');return SET_KEYS.indexOf(key)>=0&&api.canUse(key.slice(0,-1))},
    canUseFx(key){return key==='classic'||(SET_KEYS.indexOf(key)>=0&&api.canUse(key.slice(0,-1)))},
    // Cleans a saved or typed Design Studio mix: unknown names fall back to defaults, numbers are clamped. Never throws.
    sanitizeMix(raw){
      const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},t=r.tune&&typeof r.tune==='object'?r.tune:{};
      const L=['classic','founder'].concat(SET_KEYS),F=['classic'].concat(SET_KEYS);
      return{base:pick(r.base,L,'classic'),hit:pick(r.hit,F,'classic'),goal:pick(r.goal,F,'classic'),
        tune:{hue:Math.round(num(t.hue,MIX_LIMITS.hue)),size:Math.round(num(t.size,MIX_LIMITS.size)*100)/100,power:Math.round(num(t.power,MIX_LIMITS.power)*100)/100}};
    },
    // The mix as it may actually play: anything the player does not own is swapped for the classic default.
    resolveMix(raw){const m=looksApi.sanitizeMix(raw);if(!api.canUseLook(m.base))m.base='classic';if(!api.canUseFx(m.hit))m.hit='classic';if(!api.canUseFx(m.goal))m.goal='classic';return m},
  };
  const api={PRODUCT,styles,founderText:FOUNDER_TEXT,isPremium:()=>premium,
    // Checkout: '' means the Pass is not on sale yet (the button shows COMING SOON and links nowhere).
    checkout:checkoutHref,checkoutReady:()=>!!checkoutHref(),provider,restoreReady:()=>!!workerBase(),priceLabel:()=>String(cfg().PRICE_LABEL||'').trim(),
    // Display only: when the 30-day launch window closes, from the SALES_START setting. The Worker decides who gets Founder's Gold.
    founderWindowEnd(){const t=Date.parse(String(cfg().SALES_START||''));return Number.isFinite(t)?t+FOUNDER_DAYS*86400000:null},
    cleanKey,
    // After Lemon Squeezy checkout the buyer can land back here with the key in the link (#pass=KEY, or ?pass=KEY).
    // It is read once and removed from the address bar straight away.
    takeKeyFromUrl(loc=root.location,hist=root.history){return takeParam('pass',cleanKey,loc,hist)},
    // After Stripe checkout the Payment Link sends the buyer back with ?cs={CHECKOUT_SESSION_ID}; read once, then removed.
    takeSessionFromUrl(loc=root.location,hist=root.history){return takeParam('cs',v=>SESSION.test(String(v||'').trim())?String(v).trim():'',loc,hist)},
    // Sends the license key to the license Worker. A pass is unlocked only when the Worker answers verified:true.
    async redeemKey(raw){
      const key=cleanKey(raw);if(!key)return{ok:false,reason:'format'};
      return ask('/license/activate',ent&&ent.instanceId?{license_key:key,instance_id:ent.instanceId}:{license_key:key});
    },
    // Stripe: the Checkout Session id from the return link. The Worker asks Stripe whether it is a paid, unrefunded
    // CREASE Premium purchase and counts this device against the 5-device limit.
    async redeemSession(raw){
      const id=String(raw==null?'':raw).trim();if(!SESSION.test(id))return{ok:false,reason:'format'};
      const device=deviceId();if(!device)return{ok:false,reason:'offline'};
      return ask('/stripe/redeem',{session_id:id,device_id:device});
    },
    // Stripe, on another device: the email used at checkout plus the receipt number or the card's last 4 digits.
    async restorePurchase(email,proof){
      const e=String(email==null?'':email).trim(),p=String(proof==null?'':proof).trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||!/^[A-Za-z0-9 -]{4,40}$/.test(p))return{ok:false,reason:'format'};
      const device=deviceId();if(!device)return{ok:false,reason:'offline'};
      return ask('/stripe/restore',{email:e,proof:p,device_id:device});
    },
    name:()=>safe.get('crease.playerName.v1')||'Player 1',setName(name){const clean=String(name||'').trim().replace(/[^\w .'-]/g,'').slice(0,24);if(!clean)return false;safe.set('crease.playerName.v1',clean);return true;},
    activateProviderEntitlement(payload){
      if(!payload||payload.product!==PRODUCT.id||payload.verified!==true)return false;
      ent={verifiedAt:(ent&&ent.verifiedAt)||Date.now(),token:typeof payload.token==='string'&&payload.token.length<=2048?payload.token:'',founder:payload.founder===true,
        instanceId:typeof payload.instanceId==='string'&&/^[A-Za-z0-9-]{8,64}$/.test(payload.instanceId)?payload.instanceId:((ent&&ent.instanceId)||'')};
      premium=true;safe.set('crease.entitlement.v1',JSON.stringify({product:PRODUCT.id,...ent}));return true;
    },
    isFounder:()=>premium&&!!ent&&ent.founder===true,
    canUse(id){const st=styles[id];return !!st&&(!st.premium||premium)&&(!st.founder||api.isFounder());},paddleStyle(){const id=safe.get('crease.paddle.v1')||'classic';return styles[api.canUse(id)?id:'classic'];},setPaddleStyle(id){if(!api.canUse(id))return false;safe.set('crease.paddle.v1',id);return true;},extendRounds(){return premium;},record(row){if(!row||!row.name)return;leaderboard.push({...row,at:Date.now()});leaderboard.sort((a,b)=>(b.wins-a.wins)||(b.streak-a.streak)||(b.achievements-a.achievements));leaderboard.splice(100);safe.set('crease.leaderboard.v1',JSON.stringify(leaderboard));},scores:()=>leaderboard.slice(),fireThreshold:3,...looksApi};
  root.CreaseProduct=api;
})(window);
