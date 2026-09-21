import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {create,catalog}=createRequire(import.meta.url)('../assets/progression.js');
function fixture(seed){let saved=seed;const storage={getItem:()=>saved,setItem:(k,v)=>saved=v};const events=[];return {p:create(storage,e=>events.push(e)),storage,events};}
const begin=p=>p.begin({mode:'solo',stage:0,difficulty:'normal'});
const win=p=>{begin(p);for(let i=0;i<7;i++)p.goal({scorer:1,lastTouch:1});};
test('exactly 1,989 unique achievable catalog entries and 39 special challenges',()=>{
  assert.equal(catalog.length,1989);assert.equal(new Set(catalog.map(a=>a.id)).size,1989);
  assert.equal(catalog.filter(a=>a.category==='Special').length,39);
  for(let i=0;i<10;i++)assert.equal(catalog.filter(a=>a.stage===i).length,195);
});
test('0–7 own-goal loss earns goose egg, wrong address and seven own goals',()=>{
  const {p}=fixture();begin(p);for(let i=0;i<7;i++)p.goal({scorer:2,lastTouch:1});
  for(const id of ['goose','ownfinal','sevenown'])assert.ok(p.state.earned[id]);
  assert.equal(p.state.stages[0].losses,1);assert.equal(p.state.stages[0].conceded,7);
  p.goal({scorer:2,lastTouch:1});assert.equal(p.state.stages[0].conceded,7);
});
test('untouched serves and CPU strikes never count as own goals',()=>{
  for(const lastTouch of [0,2,undefined]){const {p}=fixture();begin(p);for(let i=0;i<7;i++)p.goal({scorer:2,lastTouch});assert.equal(p.state.earned.ownfinal,undefined);assert.equal(p.state.earned.sevenown,undefined);}
});
test('a 0–6 comeback records a win and does not award a shutout',()=>{
  const {p}=fixture();begin(p);for(let i=0;i<6;i++)p.goal({scorer:2,lastTouch:2});for(let i=0;i<7;i++)p.goal({scorer:1,lastTouch:1});
  assert.ok(p.state.earned.reverse);assert.equal(p.state.stages[0].comebacks,1);assert.equal(p.state.stages[0].shutouts,0);
});
test('demos and locked arenas cannot contribute progress',()=>{
  const {p}=fixture();assert.equal(p.begin({mode:'demo',stage:0}),false);p.event('hit',{player:1,rally:100});p.goal({scorer:1});
  assert.equal(p.state.stages[0].hits,0);assert.equal(p.begin({mode:'solo',stage:9}),false);assert.equal(p.canPlay(9),false);
});
test('CPU actions are excluded; a human powerup and smash are counted',()=>{
  const {p}=fixture();begin(p);for(const player of [2,1]){p.event('hit',{player});p.event('smash',{player});p.event('power',{player,kind:'MULTI'});}
  const s=p.state.stages[0];assert.equal(s.hits,1);assert.equal(s.smashes,1);assert.equal(s.powerups,1);
});
test('three completed matches unlock Toxic, survive reload, and do not re-award',()=>{
  const {p,storage,events}=fixture();win(p);win(p);assert.equal(p.canPlay(1),false);win(p);assert.equal(p.canPlay(1),true);
  const next=create(storage);assert.equal(next.canPlay(1),true);assert.equal(next.state.stages[0].matches,3);
  assert.equal(events.filter(e=>e.item?.id==='hello').length,1);
});
test('quitting does not award a completed match or unlock completion stages',()=>{
  const {p}=fixture();for(let i=0;i<4;i++){begin(p);p.goal({scorer:1});p.begin({mode:'demo',stage:0});}
  assert.equal(p.state.stages[0].matches,0);assert.equal(p.canPlay(1),false);
});
test('malformed storage and unavailable storage are handled',()=>{
  for(const seed of ['broken','null','{"earned":{"bogus":123},"unlocked":[-1,40]}']){const {p}=fixture(seed);assert.equal(p.canPlay(0),true);assert.equal(p.canPlay(9),false);assert.equal(Object.keys(p.state.earned).length,0);}
  const p=create({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});win(p);assert.equal(p.saved,false);assert.equal(p.state.stages[0].wins,1);
});
