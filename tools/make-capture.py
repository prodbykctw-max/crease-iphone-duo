"""Generate an untracked portrait recording page from the actual game."""
from pathlib import Path
p = Path(__file__).resolve().parents[1]
s = (p/'index.html').read_text()
s = s.replace('v.dpr = Math.min(window.devicePixelRatio || 1, 3);', 'v.dpr = 2;')
s = s.replace('v.vw = window.innerWidth; v.vh = window.innerHeight;', 'v.vw = 540; v.vh = 960;')
s = s.replace("})();\n</script>", r'''
const captureBar=document.createElement('div');captureBar.style='position:fixed;right:0;top:0;z-index:99999;background:#120820;padding:14px;display:grid;gap:10px';
document.body.append(captureBar);
const captureStatus=document.createElement('p');captureStatus.textContent='Ready';captureBar.append(captureStatus);
function captureButton(label,action){const b=document.createElement('button');b.textContent=label;b.onclick=action;captureBar.append(b);}
function downloadCapture(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.textContent='Download '+name;captureBar.append(a);}
async function recordCapture(mode){
  unlockAudio();bus();booted=true;music.start();
  for(const id of ['menu','how','pauseM','over','boot','studio'])show(id,false);
  const stream=cv.captureStream(30),audioOut=ac.createMediaStreamDestination();master.connect(audioOut);
  stream.addTrack(audioOut.stream.getAudioTracks()[0]);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:8000000});
  const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);
  recorder.onstop=()=>{master.disconnect(audioOut);stream.getTracks().forEach(t=>t.stop());downloadCapture(new Blob(chunks,{type:'video/webm'}),'crease-'+mode+'.webm');captureStatus.textContent='Recording complete';};
  if(mode==='intro')playIntro();else{newMatch('demo');game.mode='capture';}
  recorder.start();captureStatus.textContent='Recording '+mode;
  setTimeout(()=>recorder.stop(),mode==='intro'?8500:22000);
}
captureButton('Record intro',()=>recordCapture('intro'));
captureButton('Record CPU exhibition',()=>recordCapture('exhibition'));
for(let i=0;i<10;i++)captureButton('Arena '+i,()=>{setStage(i);newMatch('demo');for(const id of ['menu','boot','studio','over'])show(id,false);});
captureButton('Save arena PNG',()=>cv.toBlob(b=>downloadCapture(b,'crease-arena-'+stageIx+'.png')));
})();
</script>''')
(p/'capture-local.html').write_text(s)
print(p/'capture-local.html')
