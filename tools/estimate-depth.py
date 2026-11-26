#!/usr/bin/env python3
"""Estimate a depth map for a CREASE VR world from its painted plate, without the depth model.

A fallback for tools/bake-world.py when the Depth Anything V2 model can't be downloaded. It finds the skyline of each column from the
plate's edges, treats everything below it as scenery standing on the water (taller parts a little further back, busy detail a little
nearer) and everything above it as open sky, then writes depth-<id>.npy next to the model path, which bake-world.py reuses.
  python3 tools/estimate-depth.py ice [--thr 0.03]   then   python3 tools/bake-world.py tools/worlds/ice.json models/model.onnx
Thresholds used for the worlds baked this way: --thr 0.032 for sakura, 0.03 for miami, the default for ice, ultraviolet, void and gold-rush.
Re-bake with the real model later by deleting the .npy.
"""
import json, os, sys, numpy as np
from PIL import Image
from scipy import ndimage as ndi
ROOT=os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'))
OUT=os.environ.get('DEPTH_DIR',os.path.join(ROOT,'models'))
def run(id, out=None, thr=None):
    cfg=json.load(open(f'{ROOT}/tools/worlds/{id}.json'))
    im=Image.open(f'{ROOT}/{cfg["image"]}').convert('RGB')
    H,W=518,int(round(518*im.width/im.height/14))*14
    a=np.asarray(im.resize((W,H),Image.BICUBIC),np.float32)/255
    L=a@np.array([.299,.587,.114],np.float32)
    Lb=ndi.gaussian_filter(L,1.5)
    gy,gx=np.gradient(Lb); g=np.hypot(gx,gy)
    g=ndi.gaussian_filter(g,2.0)
    vB=cfg['vBase']; yB=int(vB*H)
    t=thr if thr else np.percentile(g[:int(.25*H)],85)*2.2
    sk=np.zeros(W,int)
    for x in range(W):
        col=g[:yB,x]; hit=np.where(col>t)[0]
        sk[x]=hit[0] if len(hit) else yB-2
    from numpy.lib.stride_tricks import sliding_window_view as swv
    sk=np.median(swv(np.pad(sk.astype(np.float32),7,mode='edge'),15),axis=1)
    sk=np.minimum(sk,yB-4)
    ys=np.arange(H)[:,None]
    D=np.full((H,W),.02,np.float32)
    # structures: disparity 1 at the foot, easing to .55 at the skyline (taller parts read as further back)
    k=np.clip((yB-ys)/np.maximum(yB-sk[None,:],1),0,1)
    near=1-.45*k
    # brighter, edgier local features pop a little forward
    pop=np.clip(ndi.gaussian_filter(g,4)/ (t+1e-6),0,1.5)*.12
    D=np.where(ys>=sk[None,:],near+pop,D)
    D=np.where(ys>=yB,1.0+(ys-yB)/H,D)
    D=ndi.gaussian_filter(D,1.2).astype(np.float32)
    os.makedirs(OUT,exist_ok=True); np.save(out or os.path.join(OUT,f'depth-{id}.npy'),D)
    print(id,'thr',round(float(t),4),'skyline mean',round(float(sk.mean()/H),3))
if __name__=='__main__':
    a=sys.argv[1:]; thr=float(a[a.index('--thr')+1]) if '--thr' in a else None
    for i in [x for x in a if not x.startswith('--') and not x.replace('.','').isdigit()]: run(i,thr=thr)
