// Real WebGL smoke test: each arena must produce an opaque, changing mesh.
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:500}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://crease.test/**',route=>{
      const path=new URL(route.request().url()).pathname.slice(1);
      route.fulfill({body:path?fs.readFileSync(path):'<html><body style="margin:0;background:#070613"><canvas id="sheet" width="1000" height="500"></canvas></body></html>',contentType:path.endsWith('.webp')?'image/webp':'text/html'});
    });
    await page.goto('http://crease.test/');
    await page.addScriptTag({content:fs.readFileSync('assets/arena-engine.js','utf8')});
    const results=await page.evaluate(async()=>{
      const a=window.CreaseArenas,results=[],sheet=document.querySelector('#sheet').getContext('2d');
      for(let i=0;i<a.worlds.length;i++){
        await a.select(i);
        const first=a.prepare(0,0,1);if(!first)throw Error('WebGL mesh missing: '+i);
        const c=first.getContext('2d'),p=c.getImageData(0,0,first.width,first.height).data;
        const second=a.prepare(2,.25,1),q=c.getImageData(0,0,second.width,second.height).data;
        let opaque=0,changed=0;for(let k=0;k<p.length;k+=4){if(p[k+3]>240)opaque++;if(Math.abs(p[k]-q[k])+Math.abs(p[k+1]-q[k+1])+Math.abs(p[k+2]-q[k+2])>20)changed++;}
        if(opaque<2000||changed<2000)throw Error('Mesh not visibly animated: '+a.worlds[i].id);
        sheet.drawImage(second,(i%5)*200,Math.floor(i/5)*250,200,200);
        sheet.fillStyle='#fff';sheet.font='16px sans-serif';sheet.fillText(a.worlds[i].id,(i%5)*200+20,Math.floor(i/5)*250+220);
        results.push({stage:a.worlds[i].id,opaque,changed});
      }return results;
    });
    if(errors.length)throw Error(errors.join('\n'));
    await page.screenshot({path:'/tmp/crease-centerpieces.png'});
    console.log(JSON.stringify(results));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
