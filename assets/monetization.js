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
  const FOUNDER_TEXT='Only 100 will ever exist. Free to the first 100 players who DM @playcrease to claim one. Never sold.';
  // The saved entitlement: whether a pass is active, the signed token the license Worker issued, and the
  // activation instance (so asking again on this device does not use up another activation). A Pass never
  // carries Founder's Gold; that is a separate, free entitlement (below).
  let ent=null;
  try{const e=JSON.parse(safe.get('crease.entitlement.v1')||'null');if(e&&e.product===PRODUCT.id)ent={verifiedAt:Number(e.verifiedAt)||0,token:typeof e.token==='string'?e.token:'',instanceId:typeof e.instanceId==='string'?e.instanceId:''}}catch{}
  let premium=!!ent;
  // Founder's Gold: free to the first 100 players who claim a one-time code. The license Worker signs a token with
  // product 'founder' when a code is redeemed; it is kept under its own key and is independent of the Premium Pass.
  const FOUNDER_KEY='crease.founder.v1',FOUNDER_CODE=/^[A-Z0-9]{6,32}$/;
  const normalizeFounder=v=>String(v==null?'':v).toUpperCase().replace(/[\s-]+/g,'');
  const founderToken=t=>{try{if(typeof t!=='string'||t.length>2048)return false;const s=t.split('.')[0].replace(/-/g,'+').replace(/_/g,'/');
    const p=JSON.parse(atob(s+'='.repeat((4-s.length%4)%4)));return !!p&&p.p==='founder'&&p.f===true}catch{return false}};
  let founder=false;
  try{const e=JSON.parse(safe.get(FOUNDER_KEY)||'null');founder=!!e&&founderToken(e.token)}catch{}
  let leftMem=null;
  // Premium paddles carry a signature effect (trail sparks on every hit and their own goal explosion),
  // so they read as earned/paid at a glance, in clips and on the share card. Founder's Gold is decided by the
  // license Worker when a one-time code is redeemed (it is not bought, and a Premium Pass does not include it).
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
      if(data&&data.verified===true&&data.product===PRODUCT.id&&typeof data.token==='string'&&api.activateProviderEntitlement({product:data.product,verified:true,token:data.token,instanceId:data.instanceId}))
        return{ok:true};
      return{ok:false,reason:REASONS.includes(data&&data.reason)?data.reason:'invalid'};
    }catch{return{ok:false,reason:'offline'}}
    finally{clearTimeout(timer)}
  };
  // Premium paddle looks. Each signature paddle ships two looks (A and B); owning the paddle unlocks both, and both
  // looks play that paddle's B effects. The chosen look per paddle is remembered next to the equipped paddle.
  // The Design Studio mixes any look/effect set the player owns; saved mixes are cleaned here before they are used.
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const LOOKS={prism:[{id:'A',name:'Crystal'},{id:'B',name:'Lens'}],solar:[{id:'A',name:'Molten'},{id:'B',name:'Eclipse'}],obsidian:[{id:'A',name:'Circuit'},{id:'B',name:'Hex'}],founder:[{id:'A',name:'Coin'},{id:'B',name:'Crest'}]};
  const LOOK_KEY='crease.paddleLook.v1';
  const FX_NAMES={classic:'Classic sparks',prismA:'Prism shards',prismB:'Prism rays',solarA:'Solar embers',solarB:'Solar supernova',obsidianA:'Mint shockwaves',obsidianB:'Obsidian lightning',founderA:'Founder coins',founderB:'Founder laurels'};
  const SET_KEYS=Object.keys(LOOKS).reduce((a,id)=>a.concat(LOOKS[id].map(l=>id+l.id)),[]);
  const MIX_LIMITS={hue:{min:-180,max:180,def:0},size:{min:.6,max:1.6,def:1},power:{min:.4,max:1.6,def:1}};
  const SHAPES=[{id:'circle',name:'Circle'},{id:'rounded',name:'Rounded square'},{id:'hexagon',name:'Hexagon'},{id:'octagon',name:'Octagon'},{id:'diamond',name:'Diamond'},{id:'star',name:'Star'},{id:'gear',name:'Gear'},{id:'shield',name:'Shield'}];
  const TEXTURES=[{id:'none',name:'None'},{id:'carbon',name:'Carbon fiber'},{id:'brushed',name:'Brushed metal'},{id:'glass',name:'Glass'},{id:'marble',name:'Marble'},{id:'holo',name:'Holographic'},{id:'wood',name:'Wood grain'},{id:'lava',name:'Lava'},{id:'circuit',name:'Circuit'},{id:'glitter',name:'Glitter'}];
  const PAD_LIMITS={opacity:{min:.3,max:1,def:1},strength:{min:0,max:1,def:.6}};   // transparency never goes below 30%, so the paddle is always visible
  // Color math for the Design Studio picker. RGB is whole numbers 0-255; CMYK and HSB are plain numbers (percent, degrees) so a round trip is exact.
  const COLOR=(()=>{
    const cl=(n,a,b)=>Math.min(b,Math.max(a,n)),h2=n=>Math.round(cl(n,0,255)).toString(16).padStart(2,'0');
    const parseHex=s=>{if(typeof s!=='string')return null;let t=s.trim().replace(/^#/,'');if(/^[0-9a-f]{3}$/i.test(t))t=t.replace(/./g,'$&$&');return/^[0-9a-f]{6}$/i.test(t)?'#'+t.toLowerCase():null};
    const hexToRgb=s=>{const h=parseHex(s);if(!h)return null;const n=parseInt(h.slice(1),16);return{r:n>>16&255,g:n>>8&255,b:n&255}};
    const rgbToHex=(r,g,b)=>'#'+h2(r)+h2(g)+h2(b);
    const rgbToCmyk=(r,g,b)=>{r=cl(r,0,255)/255;g=cl(g,0,255)/255;b=cl(b,0,255)/255;const k=1-Math.max(r,g,b);if(k>=1)return{c:0,m:0,y:0,k:100};return{c:(1-r-k)/(1-k)*100,m:(1-g-k)/(1-k)*100,y:(1-b-k)/(1-k)*100,k:k*100}};
    const cmykToRgb=(c,m,y,k)=>{const f=v=>Math.round(255*(1-cl(+v||0,0,100)/100)*(1-cl(+k||0,0,100)/100));return{r:f(c),g:f(m),b:f(y)}};
    const rgbToHsb=(r,g,b)=>{r=cl(r,0,255)/255;g=cl(g,0,255)/255;b=cl(b,0,255)/255;const mx=Math.max(r,g,b),d=mx-Math.min(r,g,b);let h=0;if(d){h=mx===r?((g-b)/d+6)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return{h,s:mx?d/mx*100:0,b:mx*100}};
    const hsbToRgb=(h,s,v)=>{h=(((+h||0)%360)+360)%360;s=cl(+s||0,0,100)/100;v=cl(+v||0,0,100)/100;const f=n=>{const k=(n+h/60)%6;return Math.round((v-v*s*Math.max(0,Math.min(k,4-k,1)))*255)};return{r:f(5),g:f(3),b:f(1)}};
    return{parseHex,hexToRgb,rgbToHex,rgbToCmyk,cmykToRgb,rgbToHsb,hsbToRgb};
  })();
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
    lookName(key){const id=String(key).slice(0,-1),l=own(LOOKS,id)&&LOOKS[id].find(x=>x.id===String(key).slice(-1));return l?api.styles[id].name+' · '+l.name:'Classic Cyan'},
    canUseLook(key){if(key==='classic')return true;return SET_KEYS.indexOf(key)>=0&&api.canUse(key.slice(0,-1))},
    canUseFx(key){return key==='classic'||(SET_KEYS.indexOf(key)>=0&&api.canUse(key.slice(0,-1)))},
    // Cleans a saved or typed Design Studio mix: unknown names fall back to defaults, numbers are clamped. Never throws.
    sanitizeMix(raw){
      const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{},t=r.tune&&typeof r.tune==='object'?r.tune:{};
      const L=['classic'].concat(SET_KEYS),F=['classic'].concat(SET_KEYS);
      return{base:pick(r.base==='founder'?'founderA':r.base,L,'classic'),hit:pick(r.hit,F,'classic'),goal:pick(r.goal,F,'classic'),
        tune:{hue:Math.round(num(t.hue,MIX_LIMITS.hue)),size:Math.round(num(t.size,MIX_LIMITS.size)*100)/100,power:Math.round(num(t.power,MIX_LIMITS.power)*100)/100}};
    },
    // ---- Design Studio: colors, paddle shape, texture and transparency ----
    // Shapes and textures are visual only; the hitbox stays a circle. They belong to the Custom paddle look (the Classic base).
    shapes:SHAPES,textures:TEXTURES,paddleLimits:PAD_LIMITS,color:COLOR,
    // Any typed or saved color becomes '#rrggbb' (lowercase); anything else becomes def.
    sanitizeColor(v,def){const h=COLOR.parseHex(v);return h||(typeof def==='string'?def:'')},
    // Cleans the saved shape, texture and transparency. Unknown names fall back to defaults, numbers are clamped. Never throws.
    sanitizePaddle(raw){
      const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
      return{shape:pick(r.shape,SHAPES.map(s=>s.id),'circle'),texture:pick(r.texture,TEXTURES.map(s=>s.id),'none'),
        opacity:Math.round(num(r.opacity,PAD_LIMITS.opacity)*100)/100,strength:Math.round(num(r.strength,PAD_LIMITS.strength)*100)/100};
    },
    // What actually draws: shape and texture only apply to the Custom (Classic base) look; transparency applies to every look.
    paddleDesign(rawMix,rawCustom){
      const base=looksApi.resolveMix(rawMix).base,c=looksApi.sanitizePaddle(rawCustom),custom=base==='classic';
      return{base,custom,shape:custom?c.shape:'circle',texture:custom?c.texture:'none',strength:c.strength,opacity:c.opacity};
    },
    // The mix as it may actually play: anything the player does not own is swapped for the classic default.
    resolveMix(raw){const m=looksApi.sanitizeMix(raw);if(!api.canUseLook(m.base))m.base='classic';if(!api.canUseFx(m.hit))m.hit='classic';if(!api.canUseFx(m.goal))m.goal='classic';return m},
  };
  const api={PRODUCT,styles,founderText:FOUNDER_TEXT,isPremium:()=>premium,
    // Checkout: '' means the Pass is not on sale yet (the button shows COMING SOON and links nowhere).
    checkout:checkoutHref,checkoutReady:()=>!!checkoutHref(),provider,restoreReady:()=>!!workerBase(),priceLabel:()=>String(cfg().PRICE_LABEL||'').trim(),
    cleanKey,
    // ---- Founder's Gold (free, by one-time code; separate from the Premium Pass) ----
    cleanFounderCode:v=>{const c=normalizeFounder(v);return FOUNDER_CODE.test(c)?c:''},
    // ?founder=CODE (or #founder=CODE) on the address; read once, then removed.
    takeFounderFromUrl(loc=root.location,hist=root.history){return takeParam('founder',v=>api.cleanFounderCode(v),loc,hist)},
    // Sends a code to the license Worker. Founder's Gold unlocks only when the Worker answers ok:true with a signed founder token.
    // Reasons: invalid, used, offline (no connection, timeout or any server trouble).
    async redeemFounder(raw){
      const code=api.cleanFounderCode(raw);if(!code)return{ok:false,reason:'invalid'};
      const base=workerBase(),device=deviceId();if(!base||!device||typeof root.fetch!=='function')return{ok:false,reason:'offline'};
      let timer=0;const ctl=typeof AbortController==='function'?new AbortController():null;
      try{
        if(ctl)timer=setTimeout(()=>ctl.abort(),15000);
        const res=await root.fetch(base+'/founder/redeem',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',signal:ctl?ctl.signal:undefined,body:JSON.stringify({code,device})});
        if(!res.ok)return{ok:false,reason:'offline'};
        const data=await res.json();
        if(data&&data.ok===true&&data.product==='founder'&&founderToken(data.token)){founder=true;safe.set(FOUNDER_KEY,JSON.stringify({token:data.token,at:Date.now()}));return{ok:true}}
        return{ok:false,reason:data&&data.reason==='used'?'used':'invalid'};
      }catch{return{ok:false,reason:'offline'}}
      finally{clearTimeout(timer)}
    },
    // How many of the 100 free Founder's Gold codes are unclaimed, or null when it can't be read (the Garage then shows no number).
    async founderLeft(){
      if(leftMem&&Date.now()-leftMem.at<30000)return leftMem.left;
      const base=workerBase();if(!base||typeof root.fetch!=='function')return null;
      let timer=0;const ctl=typeof AbortController==='function'?new AbortController():null;
      try{
        if(ctl)timer=setTimeout(()=>ctl.abort(),8000);
        const res=await root.fetch(base+'/founder/left',{method:'GET',credentials:'omit',signal:ctl?ctl.signal:undefined});
        if(!res.ok)return null;
        const data=await res.json(),n=data&&data.left;
        if(!Number.isInteger(n)||n<0||n>100)return null;
        leftMem={at:Date.now(),left:n};return n;
      }catch{return null}
      finally{clearTimeout(timer)}
    },
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
      ent={verifiedAt:(ent&&ent.verifiedAt)||Date.now(),token:typeof payload.token==='string'&&payload.token.length<=2048?payload.token:'',
        instanceId:typeof payload.instanceId==='string'&&/^[A-Za-z0-9-]{8,64}$/.test(payload.instanceId)?payload.instanceId:((ent&&ent.instanceId)||'')};
      premium=true;safe.set('crease.entitlement.v1',JSON.stringify({product:PRODUCT.id,...ent}));return true;
    },
    isFounder:()=>founder,
    // Founder's Gold needs a Founder code and nothing else (no Pass); every other premium style needs the Pass.
    canUse(id){const st=styles[id];return !!st&&(st.founder?api.isFounder():(!st.premium||premium));},paddleStyle(){const id=safe.get('crease.paddle.v1')||'classic';return styles[api.canUse(id)?id:'classic'];},setPaddleStyle(id){if(!api.canUse(id))return false;safe.set('crease.paddle.v1',id);return true;},extendRounds(){return premium;},record(row){if(!row||!row.name)return;leaderboard.push({...row,at:Date.now()});leaderboard.sort((a,b)=>(b.wins-a.wins)||(b.streak-a.streak)||(b.achievements-a.achievements));leaderboard.splice(100);safe.set('crease.leaderboard.v1',JSON.stringify(leaderboard));},scores:()=>leaderboard.slice(),fireThreshold:3,...looksApi};
  root.CreaseProduct=api;
})(window);
