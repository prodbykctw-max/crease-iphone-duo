// CREASE VR online: play another person, on a phone or in a headset, from inside VR.
//
// The network client is the phone game's own (online.html). vr.html loads it in a
// hidden frame with ?vrhost=1 and drives it through window.__creaseOnline, so the
// lobby, the room codes and every message are exactly the phone's, and the server
// (backend/online: it owns the puck, the score and the paddle limits) is unchanged.
//
// Everything above mountOnlineFrame is pure (no DOM, no three.js): the state
// machine, the keypad and panel layouts and the code checks are tested in Node
// by tests/quest-online.test.mjs.

// ---- Room codes --------------------------------------------------------------
// Ten characters. The server generates them from this alphabet (no I, O, 0, 1)
// and accepts /^[A-Z2-9]{10}$/, the same test the phone page uses.
export const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CODE_LEN=10;
const CODE=/^[A-Z2-9]{10}$/;
export const isCode=s=>typeof s==='string'&&CODE.test(s);
export function typeKey(entry,key){
  entry=String(entry||'');
  if(key==='DEL')return entry.slice(0,-1);
  if(key==='CLEAR')return '';
  if(typeof key==='string'&&key.length===1&&CODE_ALPHABET.includes(key)&&entry.length<CODE_LEN)return entry+key;
  return entry;
}
// "ABCDE FGHJK": two groups of five are easier to read out to a friend.
export const formatCode=c=>{c=String(c||'');return c.length>5?c.slice(0,5)+' '+c.slice(5):c;};

// ---- The server's table, seen from your end ----------------------------------
// Server state: x across [0,1], y along [0,1.8], player 0 at the bottom (y 1.6),
// player 1 at the top (y 0.2). Like the phone page, you always play from the
// bottom, so player 1 sees the table turned round. score/winner become
// [yours, theirs] and 1 = you won, 2 = they won.
export function mine(state,player){
  const flip=player===1,f=p=>flip?{x:1-p.x,y:1.8-p.y}:{x:p.x,y:p.y},pk=state.puck;
  return {me:f(state.paddles[flip?1:0]),them:f(state.paddles[flip?0:1]),
    puck:{...f(pk),vx:flip?-pk.vx:pk.vx,vy:flip?-pk.vy:pk.vy},
    score:[state.score[flip?1:0],state.score[flip?0:1]],
    winner:state.winner?(state.winner===(flip?2:1)?1:2):0,countdown:state.countdown||0};
}
// Things worth a controller buzz, from two frames of mine(). `prev` is kept by the caller.
export function feelEvents(prev,v){
  const ev={hit:false,goalFor:0};
  if(!v){prev.score=null;prev.vy=0;return ev;}
  if(prev.score){if(v.score[0]>prev.score[0])ev.goalFor=1;else if(v.score[1]>prev.score[1])ev.goalFor=2;}
  // Your hit: the puck was coming at you and now leaves, right by your paddle.
  if(!ev.goalFor&&prev.vy>0&&v.puck.vy<0&&Math.hypot(v.puck.x-v.me.x,v.puck.y-v.me.y)<.14)ev.hit=true;
  prev.score=v.score.slice();prev.vy=v.puck.vy;return ev;
}

// ---- State machine ------------------------------------------------------------
// phase: idle (ONLINE pages: home, keypad) | searching (quick match) | connecting
// (creating or joining a room) | waiting (your room is open, code shown) | found
// (opponent in, countdown) | playing | over | left (opponent left) | lost (with a reason).
// Connection commands wait in m.next until the client is idle, and events from a
// socket opened before your last choice (sid <= m.after) are ignored.
export const REMATCH_TRIES=8, RETRY_GAP_MS=700, STUCK_MS=4000;
export const LIVE_PHASES=['searching','connecting','waiting','found','playing'];
export function createOnline(){
  return {phase:'idle',page:'home',mode:'',code:'',entry:'',player:0,joined:false,state:null,score:[0,0],winner:0,countdown:0,
    reason:'',hint:'',attempts:0,try:'',next:null,after:0,since:0,closed:false};
}
const enter=(m,phase,now)=>{m.phase=phase;m.since=now;};
export function onlineFail(m,reason,now=0){m.phase='lost';m.reason=reason;m.since=now;m.next=null;return m;}
function reset(m,mode,phase,now){Object.assign(m,{mode,phase,reason:'',hint:'',joined:false,state:null,score:[0,0],winner:0,countdown:0,closed:false,since:now,attempts:0,next:null});}

export function onlineEvent(m,ev,now=0){
  if(!ev||!(ev.sid>m.after)||m.phase==='idle')return m;
  const live=LIVE_PHASES.includes(m.phase);
  if(ev.type==='joined'){
    if(!live)return m;
    m.joined=true;m.closed=false;m.player=ev.player===1?1:0;if(isCode(ev.room))m.code=ev.room;
    if(m.player===1)enter(m,'found',now);
    else if(m.mode==='quick')m.phase='searching'; // you host the room the lobby hands out: still looking
    else enter(m,'waiting',now);
  }else if(ev.type==='ready'){
    if(live&&m.phase!=='playing'&&m.phase!=='found')enter(m,'found',now);
  }else if(ev.type==='state'){
    if(!ev.state||!(live||m.phase==='over'))return m;
    m.state=ev.state;const v=mine(ev.state,m.player);m.score=v.score;m.winner=v.winner;m.countdown=v.countdown;
    if(v.winner){if(m.phase!=='over')enter(m,'over',now);}
    else if(m.phase==='over'||m.phase==='playing'){}
    else if(v.countdown>0&&v.score[0]+v.score[1]===0){if(m.phase!=='found')enter(m,'found',now);}
    else enter(m,'playing',now);
  }else if(ev.type==='close'){
    m.joined=false;const normal=ev.code===1000; // the server closes with 1000 when the match ends or the other player leaves
    if(m.phase==='over')m.closed=true;
    else if(m.phase==='playing'||m.phase==='found'){if(normal)enter(m,'left',now);else onlineFail(m,'dropped',now);}
    else if(m.phase==='waiting')onlineFail(m,normal?'expired':'dropped',now);
    else if(m.phase==='connecting'){
      if(m.mode==='join')onlineFail(m,'noroom',now);
      else if(m.mode==='rematch'){
        // Nobody to join yet, or they made the room first: take turns creating and joining the same code.
        m.attempts++;
        if(m.attempts>=REMATCH_TRIES)onlineFail(m,'rematch',now);
        else{m.try=m.try==='create'?'join':'create';m.next={do:m.try,code:m.code,at:now+RETRY_GAP_MS};}
      }else onlineFail(m,'server',now);
    }
    // searching: the phone client asks the lobby again by itself (onlineTick notices when it gives up)
  }
  return m;
}
// Once a frame with the client's snapshot (poll()). Returns the command to run, if any.
export function onlineTick(m,snap,now=0){
  if(!snap)return null;
  const idle=!snap.busy&&!snap.searching;
  if(m.next){if(now>=m.next.at&&idle){const c=m.next;m.next=null;m.since=now;return c;}return null;}
  if(m.phase==='searching'&&idle&&now-m.since>300){onlineFail(m,snap.tries>6?'nobody':'server',now);return null;}
  if(m.phase==='connecting'&&idle&&now-m.since>STUCK_MS){onlineFail(m,'server',now);return null;}
  // a socket that should not be open (a lobby answer that landed after CANCEL): close it
  if((m.phase==='idle'||m.phase==='lost'||m.phase==='left')&&snap.busy&&!snap.searching)return {do:'leave'};
  return null;
}
// A button on the ONLINE panel. Returns what the scene must also do:
// leave (close the current socket first), exit (back to the options menu), resume (hide the panel).
export function onlineIntent(m,id,{now=0,serial=0}={}){
  const fx={leave:false,exit:false,resume:false};
  const start=(mode,phase,cmd)=>{fx.leave=true;m.after=serial;reset(m,mode,phase,now);m.next={...cmd,at:now};};
  const rematch=()=>{if(!isCode(m.code)){start('quick','searching',{do:'quick'});return;}
    const code=m.code,first=m.player===0?'create':'join';start('rematch','connecting',{do:first,code});m.try=first;};
  const stop=()=>{fx.leave=true;m.after=serial;reset(m,'','idle',now);m.page='home';};
  if(id==='ol:quick'||id==='ol:another')start('quick','searching',{do:'quick'});
  else if(id==='ol:create')start('create','connecting',{do:'create'});
  else if(id==='ol:keypad'){m.page='keypad';m.hint='';}
  else if(id.startsWith('ol:key:')){m.entry=typeKey(m.entry,id.slice(7));m.hint='';}
  else if(id==='ol:del'){m.entry=typeKey(m.entry,'DEL');m.hint='';}
  else if(id==='ol:clear'){m.entry='';m.hint='';}
  else if(id==='ol:join'){
    if(isCode(m.entry)){const code=m.entry;start('join','connecting',{do:'join',code});m.code=code;}
    else m.hint='A ROOM CODE IS TEN LETTERS AND NUMBERS';
  }
  else if(id==='ol:back'){if(m.phase==='idle'&&m.page==='keypad'){m.page='home';m.hint='';}else{stop();fx.exit=true;}}
  else if(id==='ol:cancel'||id==='ol:leave')stop();
  else if(id==='ol:menu'){stop();fx.exit=true;}
  else if(id==='ol:resume')fx.resume=true;
  else if(id==='ol:rematch')rematch();
  else if(id==='ol:retry'){
    if(m.reason==='noroom'){const code=m.code;stop();m.page='keypad';m.entry=code;}
    // a dropped room-code match: the server closed that room, so meet again on the same code
    else if(m.mode==='rematch'||(m.reason==='dropped'&&m.mode!=='quick'))rematch();
    else if(m.mode==='join'&&isCode(m.code)){const code=m.code;start('join','connecting',{do:'join',code});m.code=code;}
    else if(m.mode==='create'){const code=m.code;start('create','connecting',isCode(code)?{do:'create',code}:{do:'create'});}
    else start('quick','searching',{do:'quick'});
  }
  return fx;
}

// ---- What the headset shows ----------------------------------------------------
export const LOST_TEXT={
  dropped:['CONNECTION LOST','The link to the match server dropped.'],
  server:['COULD NOT REACH THE MATCH SERVER','Check the headset is online, then try again.'],
  nobody:['NOBODY IS AROUND RIGHT NOW','Try again, or create a room and send a friend the code.'],
  noroom:['NO ROOM WITH THAT CODE','Check the code with your friend. A room closes a minute after it opens.'],
  expired:['NOBODY JOINED','The room closed after a minute. Open a new one when your friend is ready.'],
  rematch:['REMATCH DID NOT CONNECT','Your opponent may have left. Find a new match, or go back.'],
};
// Scoreboard over the far end of the table: {score, label, sub}. score is '' when there is no match to show.
export function onlineBoard(m,{away=false,notice=''}={}){
  const sc=m.state&&['found','playing','over','left'].includes(m.phase)?m.score.join(' : '):'';
  let label,sub='ONLINE · FIRST TO 7';
  const ph=m.phase;
  if(ph==='idle'){label=m.page==='keypad'?'ENTER YOUR FRIEND’S ROOM CODE':'PLAY ONLINE';sub='TOUCH A BUTTON · OR POINT AND PINCH';}
  else if(ph==='searching'){label='LOOKING FOR AN OPPONENT…';sub='ANYONE ONLINE, ON A PHONE OR A HEADSET';}
  else if(ph==='connecting'){label=m.mode==='join'?'JOINING ROOM '+formatCode(m.code)+'…':m.mode==='rematch'?'SETTING UP THE REMATCH…':'OPENING YOUR ROOM…';sub='ONLINE';}
  else if(ph==='waiting'){label='ROOM '+formatCode(m.code);sub='WAITING FOR YOUR FRIEND · THEY ENTER THIS CODE IN PLAY ONLINE';}
  else if(ph==='found'){label='OPPONENT FOUND';sub=m.countdown>0?'GET READY · FIRST TO 7':'FIRST TO 7';}
  else if(ph==='playing'){label=m.countdown>0?'GET READY':'LIVE';sub='ONLINE · FIRST TO 7';}
  else if(ph==='over'){label=m.winner===1?'YOU WIN':'OPPONENT WINS';sub='REMATCH OR MENU ON THE PANEL';}
  else if(ph==='left'){label='YOUR OPPONENT LEFT';sub='FIND A NEW MATCH OR GO BACK';}
  else {label=(LOST_TEXT[m.reason]||LOST_TEXT.server)[0];sub='RETRY OR MENU ON THE PANEL';}
  if(notice)label=notice;
  if(away){label='QUEST MENU IS OPEN';sub=ph==='found'||ph==='playing'?'THE ONLINE MATCH KEEPS GOING · CLOSE IT TO PLAY':'CLOSE IT (QUEST BUTTON) TO CARRY ON';}
  return {score:sc,label,sub};
}

// Panel pages (same 1024 x 830 canvas and panel as the options menu). Every page
// has a way out (BACK, CANCEL, LEAVE or MENU). env: {loading, failed, configured}.
export const PANEL_W=1024, PANEL_H=830;
export const KEY_COLS=8, KEY_W=104, KEY_H=96, KEY_GAP=12, KEY_X=56, KEY_Y=208;
export function keypadKeys(){
  return [...CODE_ALPHABET].map((ch,i)=>({id:'ol:key:'+ch,label:ch,x:KEY_X+(i%KEY_COLS)*(KEY_W+KEY_GAP),y:KEY_Y+Math.floor(i/KEY_COLS)*(KEY_H+KEY_GAP),w:KEY_W,h:KEY_H,key:true}));
}
export function onlinePage(m,env={}){
  const B=[],btn=(id,label,x,y,w,h,extra={})=>B.push({id,label,x,y,w,h,...extra});
  const page={title:'ONLINE',lines:[],big:'',slots:null,hint:m.hint||'',buttons:B};
  const pair=(a,b)=>{btn(a[0],a[1],56,600,440,110,{accent:true});btn(b[0],b[1],528,600,440,110);};
  const ph=m.phase;
  if(ph==='idle'&&m.page==='keypad'){
    page.title='ENTER ROOM CODE';page.slots=String(m.entry||'').padEnd(CODE_LEN,' ').slice(0,CODE_LEN).split('');
    B.push(...keypadKeys());
    btn('ol:back','BACK',56,648,200,100);btn('ol:del','DEL',272,648,180,100);btn('ol:clear','CLEAR',468,648,200,100);
    btn('ol:join','JOIN',684,648,288,100,{accent:isCode(m.entry),locked:!isCode(m.entry)});
  }else if(ph==='idle'){
    const off=!!(env.loading||env.failed||env.configured===false);
    btn('ol:quick','QUICK MATCH',56,130,912,120,{accent:!off,locked:off,big:true});
    btn('ol:create','CREATE ROOM',56,276,448,100,{locked:off});btn('ol:keypad','ENTER CODE',520,276,448,100,{locked:off});
    if(env.failed)btn('ol:reload','TRY AGAIN',668,706,300,84);
    btn('ol:back','BACK',56,706,300,84);
    page.lines=env.failed?['ONLINE PLAY COULD NOT LOAD.','Check the headset is online, then try again.']
      :env.configured===false?['ONLINE PLAY IS NOT SWITCHED ON YET.','Play the CPU in the meantime.']
      :env.loading?['CONNECTING TO ONLINE PLAY…']
      :['Play another person live: on a phone or in a headset.','QUICK MATCH pairs you with whoever is looking.','CREATE ROOM gives you a code to send a friend;','ENTER CODE joins theirs. First to 7.'];
  }else if(ph==='searching'||ph==='connecting'){
    page.title=ph==='searching'?'QUICK MATCH':'ROOM';
    page.lines=[ph==='searching'?'LOOKING FOR AN OPPONENT':m.mode==='join'?'JOINING ROOM':m.mode==='rematch'?'SETTING UP THE REMATCH':'OPENING YOUR ROOM',
      ph==='searching'?'Anyone online, on a phone or in a headset.':m.mode==='join'?formatCode(m.code):''];
    page.spinner=true;btn('ol:cancel','CANCEL',312,640,400,110);
  }else if(ph==='waiting'){
    page.title=m.mode==='rematch'?'REMATCH':'YOUR ROOM';page.big=formatCode(m.code);
    page.lines=['YOUR ROOM CODE','On a phone: playcrease.app → Play online → room code.','In a headset: ONLINE → ENTER CODE.'];
    page.spinner=true;btn('ol:cancel','CANCEL',312,640,400,110);
  }else if(ph==='found'||ph==='playing'){
    page.title=ph==='found'?'OPPONENT FOUND':'MATCH IS LIVE';page.big=m.score.join(' : ');
    page.lines=[ph==='found'?'GET READY':'ONLINE MATCHES DO NOT PAUSE','First to 7. The server runs the puck and the score.'];
    pair(['ol:resume','BACK TO MATCH'],['ol:leave','LEAVE MATCH']);
  }else if(ph==='over'){
    page.title='MATCH OVER';page.big=m.score.join(' : ');page.lines=[m.winner===1?'YOU WIN':'OPPONENT WINS',''];
    pair(['ol:rematch','REMATCH'],['ol:menu','MENU']);
  }else if(ph==='left'){
    page.title='OPPONENT LEFT';page.big=m.state?m.score.join(' : '):'';page.lines=['YOUR OPPONENT LEFT THE MATCH',''];
    pair(['ol:another','FIND NEW MATCH'],['ol:menu','MENU']);
  }else{
    const [a,b]=LOST_TEXT[m.reason]||LOST_TEXT.server;page.title='ONLINE';page.lines=[a,b];
    pair(['ol:retry',m.reason==='noroom'?'EDIT CODE':'RETRY'],['ol:menu','MENU']);
  }
  return page;
}

function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
// Draws a page from onlinePage() on a 2D canvas context. hot/pressed: Sets of button ids.
export function drawOnlinePanel(c,page,{hot=new Set(),pressed=new Set(),t=0}={}){
  const W=PANEL_W,H=PANEL_H;
  c.clearRect(0,0,W,H);c.fillStyle='#100821f2';rr(c,6,6,W-12,H-12,40);c.fill();c.strokeStyle='#734394';c.lineWidth=6;c.stroke();
  c.textBaseline='middle';c.textAlign='left';c.fillStyle='#36eeee';c.font='bold 54px sans-serif';c.fillText(page.title,56,66);
  c.textAlign='center';
  if(page.slots){ // the code typed so far, one box per character
    const n=page.slots.length,sw=76,gap=10,mid=24,x0=(W-(n*sw+(n-1)*gap+mid))/2; // a wider gap after the fifth, as the code is read out
    page.slots.forEach((ch,i)=>{const x=x0+i*(sw+gap)+(i>=5?mid:0);c.fillStyle=ch.trim()?'#1d1238':'#120a22';rr(c,x,112,sw,84,12);c.fill();c.strokeStyle=ch.trim()?'#36eeee':'#4a2d73';c.lineWidth=3;c.stroke();
      c.fillStyle='#ffffff';c.font='bold 54px sans-serif';c.fillText(ch,x+sw/2,156);});
  }
  const lineY=page.big?[148,430,486]:[300,372,428,484];
  if(page.big){c.fillStyle='#ffffff';c.font='bold '+(page.big.length>8?104:150)+'px sans-serif';c.fillText(page.big,W/2,page.lines[0]?300:330);}
  if(!page.slots)page.lines.forEach((ln,i)=>{if(!ln)return;const first=i===0;c.fillStyle=first?'#ffd15f':'#c9b8e8';c.font=(first?'bold 40px':'30px')+' sans-serif';
    const y=page.big?(i===0?150:lineY[i]):(page.buttons.some(b=>b.id==='ol:quick')?lineY[i]+150:lineY[i]-30);c.fillText(ln,W/2,y);});
  if(page.spinner){const k=Math.floor(t*3)%4;c.fillStyle='#36eeee';for(let i=0;i<3;i++){c.globalAlpha=i<k?1:.25;c.beginPath();c.arc(W/2-40+i*40,page.big?560:500,12,0,7);c.fill();}c.globalAlpha=1;}
  if(page.hint){c.fillStyle='#ff3195';c.font='bold 28px sans-serif';c.fillText(page.hint,W/2,page.slots?772:560);}
  for(const b of page.buttons){
    const down=pressed.has(b.id),on=hot.has(b.id);
    c.fillStyle=down?'#ff3195':b.accent?'#36eeee':b.locked?'#120a22':b.key?'#1d1238':'#1b1032';rr(c,b.x,b.y,b.w,b.h,b.key?14:18);c.fill();
    c.lineWidth=on?8:3;c.strokeStyle=on?'#ff3195':b.accent?'#36eeee':b.locked?'#2c1d45':b.key?'#5a3a8a':'#4a2d73';c.stroke();
    c.fillStyle=down?'#ffffff':b.accent?'#120727':b.locked?'#6a5a8a':'#f5eaff';
    c.font='bold '+(b.key?52:b.big?52:b.label.length>10?32:38)+'px sans-serif';c.fillText(b.label,b.x+b.w/2,b.y+b.h/2+2);
  }
}
// Scoreboard canvas (1024 x 256): the logo and score, then the state, then the hint line.
export function drawOnlineBoard(c,v,logo){
  c.fillStyle='#100821';c.fillRect(0,0,1024,256);c.textAlign='center';c.textBaseline='alphabetic';
  c.save();c.translate(512,95);c.fillStyle='#36eeee';c.font='bold 70px sans-serif';
  if(logo){const lh=58,lw=logo.width(lh);if(!v.score)logo.draw(c,-lw/2,-lh,lh);else{const sw=c.measureText(v.score).width,gap=40,tot=lw+gap+sw;logo.draw(c,-tot/2,-lh,lh);c.textAlign='left';c.fillText(v.score,-tot/2+lw+gap,0);c.textAlign='center';}}
  else c.fillText(v.score?'CREASE   '+v.score:'CREASE',0,0);
  c.restore();c.fillStyle='#fff';c.font=v.label.length>34?'bold 24px sans-serif':'bold 30px sans-serif';c.fillText(v.label,512,174);
  c.fillStyle='#ff3195';c.font='18px sans-serif';c.fillText(v.sub,512,220);
}
// The ONLINE entry on the options menu: the right end of the PLAY row (x > 800),
// which menuButtons leaves free, so no existing button moves.
export const ONLINE_BUTTON=Object.freeze({id:'online',label:'ONLINE',x:800,y:120,w:168,h:84,active:true});

// ---- The hidden client frame (browser only) -------------------------------------
export function mountOnlineFrame(doc,src='online.html?vrhost=1'){
  const o={host:null,state:'loading',frame:null};
  const f=doc.createElement('iframe');f.src=src;f.title='';f.setAttribute('aria-hidden','true');f.tabIndex=-1;
  // display:none: the page's own drawing and focus calls stay inert; its sockets and timers still run.
  f.style.display='none';
  const timer=setTimeout(()=>{if(o.state==='loading')o.state='failed';},20000);
  f.addEventListener('load',()=>{clearTimeout(timer);try{const h=f.contentWindow.__creaseOnline;if(h&&h.version===1){o.host=h;o.state='ready';}else o.state='failed';}catch{o.state='failed';}});
  f.addEventListener('error',()=>{clearTimeout(timer);o.state='failed';});
  doc.body.append(f);o.frame=f;return o;
}
