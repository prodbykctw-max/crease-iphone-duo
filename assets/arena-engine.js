/* CREASE hybrid environments. Artwork is decoded on demand; one shared WebGL
 * context renders real geometry once per visual frame for both player views. */
(() => {
  'use strict';
  const worlds = [
    ['midnight', 'Neon metropolis', 'A sculpted sunset above rain-polished towers.', 'sun'],
    ['toxic', 'Reactor garden', 'A living energy core inside an overgrown bioreactor.', 'core'],
    ['ice', 'Glacial cathedral', 'A turning ice crystal beneath the aurora.', 'crystal'],
    ['inferno', 'Obsidian caldera', 'A molten world above lava falls and basalt.', 'molten'],
    ['ultraviolet', 'Orbital observatory', 'A ringed planet beyond the station arms.', 'planet'],
    ['miami', 'After-hours coast', 'A dimensional sunset over neon terrazzo and palms.', 'sun'],
    ['gold-rush', 'Desert monuments', 'A gilded relic suspended between sandstone mesas.', 'gold'],
    ['void', 'Impossible architecture', 'A rotating black prism in a monochrome dimension.', 'prism'],
    ['sakura', 'Moonlit garden', 'A luminous moon above blossoms, timber and stone.', 'moon'],
    ['kctw', 'The sanctuary', 'prodbyKCTW. Speakers, beams and light moving with the beat.', 'studio'],
  ].map(([id, title, description, kind]) => ({id, title, description, kind}));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const images = new Map();
  let current = 0, request = 0, plate = null, readyAt = 0;
  async function select(index) {
    current = index; const token = ++request; plate = null;
    let entry = images.get(index);
    if (!entry) {
      const img = new Image(); img.decoding = 'async';
      img.src = `assets/arenas/${worlds[index].id}.webp`;
      entry = img.decode().then(() => img);
      images.set(index, entry);
    }
    try {
      const img = await entry;
      if (token !== request) return;
      plate = img; readyAt = performance.now();
      // Keep only three decoded environments rather than the entire collection.
      images.delete(index); images.set(index, entry);
      while (images.size > 3) images.delete(images.keys().next().value);
    } catch (err) {
      images.delete(index);
      console.warn('Arena artwork could not load:', worlds[index].id, err.message);
    }
  }

  // GPU geometry: smooth sphere, flat-shaded octahedron, depth-tested ring.
  function sphere() {
    const data = [], point = (a,b) => [Math.sin(a)*Math.cos(b), Math.cos(a), Math.sin(a)*Math.sin(b)];
    const push = p => data.push(...p, ...p);
    for (let j=0;j<24;j++) for(let i=0;i<40;i++) {
      const a=j*Math.PI/24,b=i*Math.PI*2/40,da=Math.PI/24,db=Math.PI*2/40;
      const p=point(a,b),q=point(a+da,b),r=point(a+da,b+db),s=point(a,b+db);
      [p,q,r,p,r,s].forEach(push);
    }
    return new Float32Array(data);
  }
  function crystal() {
    const data=[], ring=[[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]];
    for(const sign of [-1,1]) for(let i=0;i<4;i++) {
      const a=[0,sign*1.4,0],b=ring[i],c=ring[(i+1)%4];
      const u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);
      let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const len=Math.hypot(...n); n=n.map(x=>x/len*-sign);
      [a,b,c].forEach(p=>data.push(...p,...n));
    }
    return new Float32Array(data);
  }
  function ring() {
    const data=[], p=(a,r)=>[Math.cos(a)*r,0,Math.sin(a)*r];
    for(let i=0;i<96;i++) {
      const a=i*Math.PI/48,b=(i+1)*Math.PI/48;
      [p(a,1.35),p(b,1.35),p(b,1.94),p(a,1.35),p(b,1.94),p(a,1.94)].forEach(v=>data.push(...v,0,1,0));
    }
    return new Float32Array(data);
  }
  const vertex = `
    attribute vec3 position; attribute vec3 normal;
    uniform vec2 rotation; uniform float scale;
    varying vec3 N; varying vec3 P;
    void main(){
      float a=rotation.x,b=rotation.y;
      mat3 ry=mat3(cos(a),0.,-sin(a),0.,1.,0.,sin(a),0.,cos(a));
      mat3 rx=mat3(1.,0.,0.,0.,cos(b),sin(b),0.,-sin(b),cos(b));
      vec3 p=rx*ry*position*scale;
      N=rx*ry*normal; P=position;
      float w=4.5-p.z;
      gl_Position=vec4(p.xy*2.0,-p.z*.4,w);
    }`;
  const fragment = `
    precision mediump float;
    varying vec3 N; varying vec3 P;
    uniform float style; uniform float time; uniform float isRing; uniform float beat;
    void main(){
      vec3 n=normalize(N); vec3 light=normalize(vec3(-.65,.8,1.));
      float diffuse=max(dot(n,light),0.);
      float rim=pow(1.-abs(n.z),3.);
      float spec=pow(max(dot(reflect(-light,n),vec3(0.,0.,1.)),0.),35.);
      vec3 col; float emission=0.;
      float bands=sin(P.y*28.+sin(P.x*6.+P.z*4.)*1.1)*.5+.5;
      if(isRing>.5){
        float r=length(P.xz);
        float line=.65+.35*sin(r*110.);
        col=mix(vec3(.32,.14,.57),vec3(.83,.69,1.),line);
        if(style==1.) col=mix(vec3(.05,.4,.12),vec3(.4,1.,.75),line);
        gl_FragColor=vec4(col*(.55+.45*diffuse),1.); return;
      }
      if(style==0.){
        if(P.y<.12 && sin(P.y*34.) < -.22) discard;
        col=mix(vec3(1.,.03,.32),vec3(1.,.77,.16),smoothstep(-1.,1.,P.y)); emission=.55;
      }else if(style==1.){
        float circuit=pow(abs(sin(P.x*14.+sin(P.y*12.))*sin(P.z*13.+time*.4)),12.);
        col=mix(vec3(.015,.08,.045),vec3(.25,1.,.44),circuit);
        emission=.3+circuit*.5;
      }else if(style==2.){col=vec3(.23,.67,.93);}
      else if(style==3.){
        float lava=pow(abs(sin(P.x*9.+sin(P.z*8.))*sin(P.y*11.+sin(P.x*8.))),6.);
        col=mix(vec3(.10,.015,.025),vec3(1.,.36,.035),lava); emission=lava;
      }else if(style==4.){col=mix(vec3(.15,.055,.37),vec3(.63,.38,.82),bands);}
      else if(style==5.){col=vec3(.94,.56,.12);}
      else if(style==6.){col=vec3(.045,.05,.065);}
      else {
        float grain=sin(P.x*42.+sin(P.z*38.))*sin(P.y*53.);
        col=vec3(.76,.8,.9)*( .83+.17*grain );
      }
      vec3 result=col*(.18+.82*diffuse+emission)+vec3(spec*.7)+col*rim*(.8+beat*.3);
      if(style==6.) result+=vec3(rim*.9);
      gl_FragColor=vec4(result,1.);
    }`;
  class Centerpiece {
    constructor() {
      this.canvas=document.createElement('canvas');
      this.canvas.width=this.canvas.height=320;
      this.snapshot=document.createElement('canvas'); this.snapshot.width=this.snapshot.height=320;
      this.paint=this.snapshot.getContext('2d'); this.last=-Infinity; this.stage=-1;
      this.gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
      this.available=false;
      if(!this.gl) return;
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.available=false;});
      this.canvas.addEventListener('webglcontextrestored',()=>this.init());
      this.init();
    }
    init() {
      const gl=this.gl;
      try {
        const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
        const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
        this.program=gl.createProgram(); gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
        if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
        gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(this.program);
        this.uniform={}; for(const key of ['rotation','scale','style','time','isRing','beat'])this.uniform[key]=gl.getUniformLocation(this.program,key);
        this.pos=gl.getAttribLocation(this.program,'position');this.normal=gl.getAttribLocation(this.program,'normal');
        this.mesh={};for(const [name,data] of [['sphere',sphere()],['crystal',crystal()],['ring',ring()]]){
          const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);this.mesh[name]={buffer,count:data.length/6};
        }
        gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);this.available=true;this.last=-Infinity;
      }catch(err){this.available=false;console.warn('3D centerpiece unavailable:',err.message);}
    }
    render(index,t,beat,detail) {
      if(!this.available||index===9)return null;
      const kind=worlds[index].kind,staticTime=reduced.matches?0:t;
      const interval=reduced.matches?Infinity:1/(detail<.7?18:30);
      if(this.stage===index && staticTime>=this.last && staticTime-this.last<interval)return this.snapshot;
      this.stage=index;this.last=staticTime;
      const gl=this.gl,u=this.uniform;
      gl.viewport(0,0,320,320);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
      const styles={sun:0,core:1,crystal:2,molten:3,planet:4,gold:5,prism:6,moon:7};
      gl.uniform1f(u.style,styles[kind]);gl.uniform1f(u.time,staticTime);gl.uniform1f(u.beat,reduced.matches?0:beat);
      const draw=(name,angle,tilt,scale,isRing)=>{
        const mesh=this.mesh[name];gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
        gl.enableVertexAttribArray(this.pos);gl.vertexAttribPointer(this.pos,3,gl.FLOAT,false,24,0);
        gl.enableVertexAttribArray(this.normal);gl.vertexAttribPointer(this.normal,3,gl.FLOAT,false,24,12);
        gl.uniform2f(u.rotation,angle,tilt);gl.uniform1f(u.scale,scale);gl.uniform1f(u.isRing,isRing);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
      };
      const faceted=['crystal','gold','prism'].includes(kind),hasRing=kind==='planet'||kind==='core';
      draw(faceted?'crystal':'sphere',staticTime*(kind==='sun'?.025:.12),faceted?.18:0,hasRing?.82:1.23,0);
      if(hasRing)draw('ring',0,.45+Math.sin(staticTime*.08)*.13,.82,1);
      this.paint.clearRect(0,0,320,320);this.paint.drawImage(this.canvas,0,0);
      return this.snapshot;
    }
  }
  let centerpiece;
  function prepare(t,beat,detail) {
    if(!centerpiece)centerpiece=new Centerpiece();
    return centerpiece.render(current,t,beat,detail);
  }
  // Precomputed composition: 3:1 artwork is never stretched. Player motion shifts
  // the world slightly; the actual 3D object moves independently in front of it.
  function draw(c,{H,t,half,lean,beat,flash,detail,focal}) {
    if(!plate)return false;
    const motion=reduced.matches?0:1, clock=t*motion;
    const drift=Math.sin(clock*.16+half)*.003-lean*.01*motion;
    const studio=current===9, w=studio?.80:1.08, h=w*plate.naturalHeight/plate.naturalWidth;
    const y=H-h*(studio?.66:.91), left=(1-w)/2;
    c.save();c.beginPath();c.rect(0,0,1,H+.014);c.clip();
    c.globalAlpha=Math.min(1,(performance.now()-readyAt)/350);
    c.fillStyle='#030309';c.fillRect(0,0,1,H+.014);
    c.drawImage(plate,left+drift,y,w,h);
    if(focal){
      const size=current===4?.235:.19, x=.5-lean*.022*motion;
      const cy=H*.36+Math.sin(clock*.28)*.003;
      c.drawImage(focal,x-size/2,cy-size/2,size,size);
    }
    atmosphere(c,H,clock,beat*motion,flash*motion,detail,drift);
    c.restore();return true;
  }
  function atmosphere(c,H,t,beat,flash,detail,drift) {
    const kind=worlds[current].kind;
    c.save();c.globalCompositeOperation='screen';
    if(kind==='studio') {
      // Centers traced from the sanctuary plate; cones deform without moving
      // their metal housings. Lasers have slow sweeps, never full-screen strobes.
      const w=.80,h=w*1024/1536,y=H-h*.66;
      for(const x of [.134,.866])for(const [v,r] of [[.351,.029],[.428,.048]]){
        const cx=.10+drift+x*w,cy=y+v*h,rx=r*w,ry=r*h;
        if(cy<0)continue;
        c.save();c.globalCompositeOperation='source-over';
        c.beginPath();c.ellipse(cx,cy,rx*.86,ry*.86,0,0,Math.PI*2);c.clip();
        const pump=1+beat*.09;
        c.drawImage(plate,(x-r)*plate.naturalWidth,(v-r)*plate.naturalHeight,2*r*plate.naturalWidth,2*r*plate.naturalHeight,cx-rx*pump,cy-ry*pump,2*rx*pump,2*ry*pump);
        c.restore();
        const g=c.createRadialGradient(cx,cy,0,cx,cy,rx*1.3);
        g.addColorStop(0,`rgba(50,170,220,${.08+beat*.3})`);g.addColorStop(1,'rgba(0,100,200,0)');
        c.fillStyle=g;c.beginPath();c.ellipse(cx,cy,rx*(1+beat*.13),ry*(1+beat*.13),0,0,Math.PI*2);c.fill();
        c.strokeStyle=`rgba(90,210,255,${.18+beat*.45})`;c.lineWidth=.0015;
        c.beginPath();c.ellipse(cx,cy,rx*(.72+beat*.16),ry*(.72+beat*.16),0,0,Math.PI*2);c.stroke();
      }
      for(let i=0;i<4;i++){
        const x=.14+i*.24,tip=x+Math.sin(t*.35+i*1.8)*.23;
        const g=c.createLinearGradient(x,H,tip,0);
        g.addColorStop(0,`rgba(${i%2?'60,255,160':'70,170,255'},${.08+beat*.12+flash*.12})`);g.addColorStop(1,'rgba(0,0,0,0)');
        c.fillStyle=g;c.beginPath();c.moveTo(x-.003,H);c.lineTo(tip-.055,0);c.lineTo(tip+.055,0);c.lineTo(x+.003,H);c.fill();
      }
    }
    if(current===2){
      // Aurora ribbons are independent of the ice plate and move slowly.
      for(let j=0;j<3;j++){
        c.strokeStyle=`rgba(90,210,255,${.045+j*.018})`;c.lineWidth=.006+j*.002;
        c.beginPath();
        for(let k=0;k<=28;k++){
          const x=k/28,y=H*.12+Math.sin(x*8+t*.17+j)*.025+j*.018;
          k?c.lineTo(x,y):c.moveTo(x,y);
        }
        c.stroke();
      }
    }
    if(current===5){
      // Water highlights stay beneath the horizon instead of crossing play.
      c.lineWidth=.001;
      for(let j=0;j<12;j++){
        const y=H*.75+j*.003,x=.5+Math.sin(t*.24+j*2)*.12;
        c.strokeStyle=`rgba(70,225,230,${.07+.04*Math.sin(t+j)})`;
        c.beginPath();c.moveTo(x-.04,y);c.lineTo(x+.04,y);c.stroke();
      }
    }
    // Distinct spatial effects. Seeded phase, no per-frame random allocations.
    const count=Math.round((kind==='planet'?14:22)*detail);
    for(let i=0;i<count;i++){
      const seed=Math.sin(i*127.1+current*91.7)*43758.5453, f=seed-Math.floor(seed);
      const speed=kind==='molten'?.035:.012;
      let x=((f+t*(kind==='sun'?.008:.003))%1),y=((i*.137+t*speed)%1)*H;
      if(kind==='molten'||kind==='core') y=H-y;
      if(kind==='prism')continue;
      if(kind==='gold'){x=(f+t*.025)%1;y=H*.64+((i*.137)%1)*H*.27;}
      c.fillStyle=kind==='molten'?'#ff7945':kind==='core'?'#81ffac':kind==='moon'?'#ffbedb':kind==='gold'?'#f7c881':'#aadfff';
      c.globalAlpha=.12+.18*Math.sin(i+t*.5)**2;
      c.beginPath();c.ellipse(x,y,kind==='moon'?.0022:.0012,kind==='moon'?.0009:.0012,Math.sin(t+i),0,Math.PI*2);c.fill();
    }
    c.globalAlpha=1;c.globalCompositeOperation='source-over';
    const fade=c.createLinearGradient(0,H*.80,0,H+.014);
    fade.addColorStop(0,'rgba(3,3,9,0)');fade.addColorStop(1,'rgba(3,3,9,.85)');
    c.fillStyle=fade;c.fillRect(0,H*.8,1,H*.2+.014);c.restore();
  }
  window.CreaseArenas={worlds,select,prepare,draw,get ready(){return !!plate;},get gpuReady(){return !!centerpiece?.available;}};
})();
