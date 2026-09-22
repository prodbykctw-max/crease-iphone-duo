/* CREASE product layer: local leaderboard plus provider-verified premium hooks. */
(function(root){
  'use strict';
  const PRODUCT={id:'crease-premium-pass',name:'CREASE Premium Pass',price:'one-time purchase',checkoutUrl:'https://www.instagram.com/prodbykctw/'};
  const safe={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
  let premium=false;
  try{premium=JSON.parse(safe.get('crease.entitlement.v1')||'null')?.product===PRODUCT.id}catch{}
  const styles={classic:{name:'Classic Cyan',premium:false,ring:'#2de2e6',core:'#ffffff',trail:'#2de2e6'},prism:{name:'Prism Glass',premium:true,ring:'#c6a6ff',core:'#ffffff',trail:'#d18cff'},solar:{name:'Solar Flare',premium:true,ring:'#ffc44d',core:'#fff5c2',trail:'#ff713b'},obsidian:{name:'Obsidian Mint',premium:true,ring:'#62f6c6',core:'#d7fff4',trail:'#47cfa4'}};
  const leaderboard=(()=>{let rows=[];try{rows=JSON.parse(safe.get('crease.leaderboard.v1')||'[]')||[]}catch{};return rows.filter(r=>r&&typeof r.name==='string').slice(0,100)})();
  const api={PRODUCT,styles,isPremium:()=>premium,checkout:()=>PRODUCT.checkoutUrl,name:()=>safe.get('crease.playerName.v1')||'Player 1',setName(name){const clean=String(name||'').trim().replace(/[^\w .'-]/g,'').slice(0,24);if(!clean)return false;safe.set('crease.playerName.v1',clean);return true;},activateProviderEntitlement(payload){if(!payload||payload.product!==PRODUCT.id||payload.verified!==true)return false;premium=true;safe.set('crease.entitlement.v1',JSON.stringify({product:PRODUCT.id,verifiedAt:Date.now()}));return true;},paddleStyle(){const id=safe.get('crease.paddle.v1')||'classic';return styles[premium&&styles[id]?id:'classic'];},setPaddleStyle(id){if(!styles[id]||styles[id].premium&&!premium)return false;safe.set('crease.paddle.v1',id);return true;},extendRounds(){return premium;},record(row){if(!row||!row.name)return;leaderboard.push({...row,at:Date.now()});leaderboard.sort((a,b)=>(b.wins-a.wins)||(b.streak-a.streak)||(b.achievements-a.achievements));leaderboard.splice(100);safe.set('crease.leaderboard.v1',JSON.stringify(leaderboard));},scores:()=>leaderboard.slice(),fireThreshold:3};
  root.CreaseProduct=api;
})(window);
