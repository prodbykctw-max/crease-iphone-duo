/* CREASE product layer: local leaderboard plus provider-verified premium hooks. */
(function(root){
  'use strict';
  const PRODUCT={id:'crease-premium-pass',name:'CREASE Premium Pass',price:'one-time purchase',checkoutUrl:'https://www.instagram.com/prodbykctw/'};
  const safe={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
  let premium=false,verifiedAt=0;
  try{const ent=JSON.parse(safe.get('crease.entitlement.v1')||'null');premium=ent?.product===PRODUCT.id;verifiedAt=Number(ent?.verifiedAt)||0}catch{}
  // Premium paddles carry a signature effect (trail sparks on every hit and their own goal explosion),
  // so they read as earned/paid at a glance, in clips and on the share card. Founder's Gold is only for
  // Premium Passes bought before Nov 1, 2026.
  const FOUNDER_UNTIL=Date.parse('2026-11-01T04:00:00Z');
  const styles={classic:{name:'Classic Cyan',premium:false,ring:'#2de2e6',core:'#ffffff',trail:'#2de2e6',desc:'Included with every game.'},
    prism:{name:'Prism Glass',premium:true,ring:'#c6a6ff',core:'#ffffff',trail:'#d18cff',fx:['#ff5ea8','#ffd23f','#39ff88','#2de2e6','#a06bff'],desc:'Rainbow sparks on every hit; a prism burst when you score.'},
    solar:{name:'Solar Flare',premium:true,ring:'#ffc44d',core:'#fff5c2',trail:'#ff713b',fx:['#ff713b','#ffc44d','#fff5c2'],desc:'Embers trail your shots; your goals erupt like a flare.'},
    obsidian:{name:'Obsidian Mint',premium:true,ring:'#62f6c6',core:'#d7fff4',trail:'#47cfa4',fx:['#62f6c6','#d7fff4','#0b3a2e'],desc:'Mint smoke on contact; a cold shockwave on goals.'},
    founder:{name:"Founder's Gold",premium:true,founder:true,ring:'#ffd23f',core:'#fff7d1',trail:'#ffb020',fx:['#ffd23f','#ffffff','#ffb020'],desc:'Launch-window exclusive for Premium Passes bought before Nov 1, 2026. Never sold again.'}};
  const leaderboard=(()=>{let rows=[];try{rows=JSON.parse(safe.get('crease.leaderboard.v1')||'[]')||[]}catch{};return rows.filter(r=>r&&typeof r.name==='string').slice(0,100)})();
  const api={PRODUCT,styles,isPremium:()=>premium,checkout:()=>PRODUCT.checkoutUrl,name:()=>safe.get('crease.playerName.v1')||'Player 1',setName(name){const clean=String(name||'').trim().replace(/[^\w .'-]/g,'').slice(0,24);if(!clean)return false;safe.set('crease.playerName.v1',clean);return true;},activateProviderEntitlement(payload){if(!payload||payload.product!==PRODUCT.id||payload.verified!==true)return false;premium=true;verifiedAt=verifiedAt||Date.now();safe.set('crease.entitlement.v1',JSON.stringify({product:PRODUCT.id,verifiedAt}));return true;},isFounder:()=>premium&&verifiedAt>0&&verifiedAt<FOUNDER_UNTIL,canUse(id){const st=styles[id];return !!st&&(!st.premium||premium)&&(!st.founder||api.isFounder());},paddleStyle(){const id=safe.get('crease.paddle.v1')||'classic';return styles[api.canUse(id)?id:'classic'];},setPaddleStyle(id){if(!api.canUse(id))return false;safe.set('crease.paddle.v1',id);return true;},extendRounds(){return premium;},record(row){if(!row||!row.name)return;leaderboard.push({...row,at:Date.now()});leaderboard.sort((a,b)=>(b.wins-a.wins)||(b.streak-a.streak)||(b.achievements-a.achievements));leaderboard.splice(100);safe.set('crease.leaderboard.v1',JSON.stringify(leaderboard));},scores:()=>leaderboard.slice(),fireThreshold:3};
  root.CreaseProduct=api;
})(window);
