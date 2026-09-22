/* Device-local progression. Player 1 owns this profile in local two-player. */
(function(root){
  'use strict';
  const names=['MIDNIGHT','TOXIC','ICE','INFERNO','ULTRAVIOLET','MIAMI','GOLD RUSH','VOID','SAKURA','PRODBY KCTW'];
  const metrics={matches:'Clocked In',wins:'Victory Lap',losses:'Still Standing',goals:'Net Architect',conceded:'Learning Curve',hits:'Paddle Poet',smashes:'Heavy Hands',smashGoals:'Meteor Mail',bankGoals:'Bank Statement',rails:'Rail Rider',powerups:'Power Shopper',shutouts:'Clean Sheet',comebacks:'Plot Twist'};
  const tiers=[1,3,5,10,20,35,50,75,100,150,250,400,650,1000,1989];
  const labels={matches:'completed matches',wins:'wins',losses:'losses',goals:'goals scored',conceded:'goals conceded',hits:'paddle hits',smashes:'smashes',smashGoals:'smash goals',bankGoals:'bumper-bank goals',rails:'rail impacts after your touch',powerups:'power-ups collected',shutouts:'7–0 wins',comebacks:'wins from at least 3 goals behind'};
  const special=[
    ['hello','Welcome to the Crease','Finish your first match.',m=>true],
    ['winner','Main Character','Win a match.',m=>m.win],
    ['loser','We Go Again','Lose a match.',m=>!m.win],
    ['goose','Goose Egg','Lose 0–7.',m=>!m.win&&m.score[0]===0],
    ['clean','Seven, Served Cold','Win 7–0.',m=>m.win&&m.score[1]===0],
    ['ownfinal','Wrong Address','Lose on a puck you last struck into your own goal.',m=>!m.win&&m.lastOwn],
    ['sevenown','I Am My Own Rival','Lose 0–7 with all seven conceded goals last struck by you.',m=>!m.win&&m.score[0]===0&&m.own===7],
    ['closeLoss','One Point from Glory','Lose 6–7.',m=>!m.win&&m.score[0]===6],
    ['closeWin','Clutch Delivery','Win 7–6.',m=>m.win&&m.score[1]===6],
    ['reverse','The Impossible Receipt','Come back from 0–6 to win.',m=>m.win&&m.wasZeroSix],
    ['easy','Training Wheels, Chrome Finish','Win against the easy CPU.',m=>m.win&&m.mode==='solo'&&m.difficulty==='easy'],
    ['normal','Regularly Scheduled Victory','Win against the normal CPU.',m=>m.win&&m.mode==='solo'&&m.difficulty==='normal'],
    ['hard','CPU, Take a Seat','Win against the hard CPU.',m=>m.win&&m.mode==='solo'&&m.difficulty==='hard'],
    ['hardclean','Silicon Goose','Beat the hard CPU 7–0.',m=>m.win&&m.mode==='solo'&&m.difficulty==='hard'&&m.score[1]===0],
    ['couch','Couch Diplomacy','Finish a local two-player match as Player 1.',m=>m.mode==='duo'],
    ['couchwin','My Side of the Sofa','Win as Player 1 in local two-player.',m=>m.mode==='duo'&&m.win],
    ['rematch','Run That Back','Win immediately after a completed loss.',(m,s)=>m.win&&s.previous==='loss'],
    ['redemption','Return to Sender','Win immediately after losing on an own goal.',(m,s)=>m.win&&s.previous==='own-loss'],
    ['comeback','Plot Armor','Win after trailing by 3 or more.',m=>m.win&&m.deficit>=3],
    ['rally','Keep the Conversation Going','Finish a match containing a 20-hit rally.',m=>m.maxRally>=20],
    ['rails','Wall-to-Wall Service','Record 10 rail impacts after your touches in one match.',m=>m.count.rails>=10],
    ['smashes','Five-Star Delivery','Smash the puck 5 times in one match.',m=>m.count.smashes>=5],
    ['smashgoal','Express Shipping','Score a smash goal.',m=>m.count.smashGoals>0],
    ['bank','Interest Paid','Score a bumper-bank goal.',m=>m.count.bankGoals>0],
    ['allbank','The Bank Is Open','Win with all 7 goals being bumper-bank goals.',m=>m.win&&m.count.bankGoals===7],
    ['allsmash','Seven Meteors','Win with all 7 goals being smash goals.',m=>m.win&&m.count.smashGoals===7],
    ['nopower','Factory Settings','Win without collecting a power-up.',m=>m.win&&m.count.powerups===0],
    ['powers','Full Shopping Cart','Collect BIG, MULTI and WALL in one match.',m=>m.types.size===3],
    ['multi','Too Many Pucks, Still Me','Collect MULTI 3 times in one match.',m=>m.multi>=3],
    ['big','Big Paddle Energy','Finish a match after collecting BIG.',m=>m.types.has('BIG')],
    ['wall','Personal Space','Finish a match after collecting WALL.',m=>m.types.has('WALL')],
    ['fast','No Time for Small Talk','Win in under 60 seconds of active play.',m=>m.win&&m.seconds<60],
    ['long','We Live Here Now','Finish a match with 5 minutes of active play.',m=>m.seconds>=300],
    ['triple','Three-Peat, No Pause','Score 3 consecutive goals in a match.',m=>m.maxRun>=3],
    ['run','Seven on the Bounce','Score 7 consecutive goals in a match.',m=>m.maxRun>=7],
    ['travel','Weekend Traveler','Finish matches in 3 different arenas.',(m,s)=>s.stages.filter(x=>x.matches>0).length>=3],
    ['tour','Every World, One Crease','Finish a match in every arena.',(m,s)=>s.stages.every(x=>x.matches>0)],
    ['streak3','Heat Check','Win 3 completed matches consecutively.',(m,s)=>s.streak>=3],
    ['streak10','Somebody Unplug Me','Win 10 completed matches consecutively.',(m,s)=>s.streak>=10],
  ];
  const catalog=special.map(([id,name,description])=>({id,name,description,category:'Special',target:1}));
  for(let stage=0;stage<10;stage++)for(const [metric,name] of Object.entries(metrics))tiers.forEach((target,tier)=>{
    catalog.push({id:`s${stage}.${metric}.${target}`,name:`${name} ${tier+1} · ${names[stage]}`,description:`Record ${target.toLocaleString('en-US')} ${labels[metric]} in ${names[stage]}.`,category:names[stage],stage,metric,target});
  });
  const validIds=new Set(catalog.map(a=>a.id));
  const blank=()=>Object.fromEntries(Object.keys(metrics).map(k=>[k,0]));
  const count=n=>Number.isFinite(n)&&n>=0?Math.min(Math.floor(n),1e9):0;
  function create(storage,notify=()=>{}){
    let raw={};try{raw=JSON.parse(storage.getItem('crease.progress.v1')||'{}')||{};}catch{}
    const state={stages:names.map((_,i)=>Object.fromEntries(Object.keys(metrics).map(k=>[k,count(raw.stages?.[i]?.[k])]))),earned:{},unlocked:[0],streak:count(raw.streak),previous:typeof raw.previous==='string'?raw.previous:''};
    for(const [id,stamp] of Object.entries(raw.earned||{}))if(validIds.has(id)&&Number.isFinite(stamp))state.earned[id]=stamp;
    if(Array.isArray(raw.unlocked))state.unlocked=[...new Set([0,...raw.unlocked.filter(x=>Number.isInteger(x)&&x>=0&&x<10)])];
    let match=null,saveOkay=true;
    const totals=()=>Object.keys(metrics).reduce((o,k)=>(o[k]=state.stages.reduce((n,s)=>n+s[k],0),o),{});
    const rules=[['Always available',()=>true],['Finish 3 matches',t=>t.matches>=3],['Finish 5 matches',t=>t.matches>=5],['Win 5 matches',t=>t.wins>=5],['Score 75 goals',t=>t.goals>=75],['Finish 10 matches',t=>t.matches>=10],['Score 10 bumper-bank goals',t=>t.bankGoals>=10],['Perform 20 smashes',t=>t.smashes>=20],['Win 20 matches',t=>t.wins>=20],['Finish 30 matches and earn 100 achievements',t=>t.matches>=30&&Object.keys(state.earned).length>=100]];
    function save(){try{storage.setItem('crease.progress.v1',JSON.stringify(state));saveOkay=true;}catch{saveOkay=false;}}
    function unlock(id){if(state.earned[id]!==undefined)return;state.earned[id]=Date.now();notify({type:'achievement',item:catalog.find(a=>a.id===id)});}
    function check(){
      for(const a of catalog)if(a.metric&&state.stages[a.stage][a.metric]>=a.target)unlock(a.id);
      const t=totals();rules.forEach((r,i)=>{if(!state.unlocked.includes(i)&&r[1](t)){state.unlocked.push(i);notify({type:'stage',name:names[i]});}});
    }
    function begin({mode,stage,difficulty}){
      if(match)save();match=null;
      if(!['solo','duo'].includes(mode)||!state.unlocked.includes(stage))return false;
      match={mode,stage,difficulty,count:blank(),score:[0,0],own:0,lastOwn:false,deficit:0,wasZeroSix:false,maxRally:0,run:0,maxRun:0,seconds:0,types:new Set(),multi:0};return true;
    }
    function bump(metric,n=1){if(!match||!(metric in metrics))return;match.count[metric]+=n;state.stages[match.stage][metric]+=n;}
    function event(type,p={}){
      if(!match)return;
      if(type==='tick'){match.seconds+=Math.max(0,Math.min(p.dt||0,.1));return;}
      if(type==='hit'){match.maxRally=Math.max(match.maxRally,p.rally||0);if(p.player===1)bump('hits');}
      if(type==='smash'&&p.player===1)bump('smashes');
      if(type==='rail'&&p.player===1)bump('rails');
      if(type==='power'&&p.player===1){bump('powerups');match.types.add(p.kind);if(p.kind==='MULTI')match.multi++;}
    }
    function goal({scorer,lastTouch=0,smash=false,bank=false}){
      if(!match||![1,2].includes(scorer))return;
      match.score[scorer-1]++;
      if(scorer===1){bump('goals');match.run++;match.maxRun=Math.max(match.maxRun,match.run);if(smash)bump('smashGoals');if(bank)bump('bankGoals');}
      else{bump('conceded');match.run=0;if(lastTouch===1)match.own++;}
      match.lastOwn=scorer===2&&lastTouch===1;
      match.deficit=Math.max(match.deficit,match.score[1]-match.score[0]);
      match.wasZeroSix ||= match.score[0]===0&&match.score[1]===6;
      if(match.score[scorer-1]===7)finish();else save();
    }
    function finish(){
      if(!match)return;
      match.win=match.score[0]===7;bump('matches');bump(match.win?'wins':'losses');
      if(match.win&&match.score[1]===0)bump('shutouts');
      if(match.win&&match.deficit>=3)bump('comebacks');
      state.streak=match.win?state.streak+1:0;
      for(const [id,,,condition] of special)if(condition(match,state))unlock(id);
      try{window.CreaseProduct?.record({name:window.CreaseProduct.name?.()||state.profileName||'Player 1',wins:match.win?1:0,streak:state.streak,achievements:Object.keys(state.earned).length,stage:match.stage});}catch{}
      state.previous=match.win?'win':match.lastOwn?'own-loss':'loss';match=null;check();save();
    }
    return {catalog,begin,event,goal,save,canPlay:i=>state.unlocked.includes(i),requirement:i=>rules[i]?.[0]||'',get state(){return state;},get saved(){return saveOkay;},progress:a=>a.metric?state.stages[a.stage][a.metric]:(state.earned[a.id]!==undefined?1:0)};
  }
  const api={create,catalog,names};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.CreaseProgression=api;
})(typeof window==='undefined'?{}:window);
