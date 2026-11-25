#!/usr/bin/env python3
"""Bake the depth data of a CREASE VR world from its painted arena plate.

The VR world of an arena IS its painted plate: quest-world-kit.mjs wraps the painting half way round the player and pushes every part of
it out to its own distance, so the city has real depth, parallax and a reflection. This tool makes the small data image that says how far
away each part is (assets/worlds/<id>.png, with its numbers in assets/worlds/<id>.json):

  top half     R,G = 16-bit inverse distance per mesh vertex (0 = open sky), B = how much the vertex sways (painted palms)
  bottom half  R = waterfall mask (where the flowing-water shader runs), G,B = spare

Distances come from a monocular depth model (Depth Anything V2, ONNX). The model is not in the repository; download it once:
  https://huggingface.co/onnx-community/depth-anything-v2-base/resolve/main/onnx/model.onnx   (390 MB)
then
  python3 tools/bake-world.py tools/worlds/midnight.json path/to/model.onnx
Needs: numpy, pillow, scipy, onnxruntime. A cached depth map (.npy next to the model, named depth-<id>.npy) is reused when present.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
INV_NEAR = 4.0  # metres: the 16-bit code is 65535 * INV_NEAR / distance


def depth(model, im, cache):
    if os.path.exists(cache):
        return np.load(cache)
    import onnxruntime as ort
    H, W = 518, int(round(518 * im.width / im.height / 14)) * 14
    x = np.asarray(im.resize((W, H), Image.BICUBIC), dtype=np.float32) / 255.
    x = ((x - np.array([.485, .456, .406], np.float32)) / np.array([.229, .224, .225], np.float32)).transpose(2, 0, 1)[None]
    s = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
    d = s.run(None, {s.get_inputs()[0].name: x})[0].squeeze().astype(np.float32)
    np.save(cache, d)
    return d


def boxes_mask(boxes, W, H, soft, ramp=False):
    m = np.zeros((H, W), np.float32)
    for x0, y0, x1, y1 in boxes:
        if ramp:  # 0 at the foot of the box, 1 at its top: a palm stays planted and its crown moves
            col = np.linspace(1, 0, max(1, y1 - y0), dtype=np.float32)[:, None]
            m[y0:y1, x0:x1] = np.maximum(m[y0:y1, x0:x1], col)
        else:
            m[y0:y1, x0:x1] = 1
    return ndi.gaussian_filter(m, soft) if soft else m


def main():
    cfg = json.load(open(sys.argv[1])); model = sys.argv[2]
    im = Image.open(os.path.join(ROOT, cfg['image'])).convert('RGB'); W, H = im.size
    d = depth(model, im, os.path.join(os.path.dirname(model), f"depth-{cfg['id']}.npy"))
    D = np.asarray(Image.fromarray(d).resize((W, H), Image.BILINEAR), dtype=np.float32)
    D = ndi.median_filter(D, 5)
    GW, GH = cfg['grid']; vE, vB, vBot = cfg['vEye'], cfg['vBase'], cfg['vBottom']
    S = np.pi * H / W                       # the plate wraps half a turn; one image height is S radii tall
    drop = cfg['eyeH'] - cfg['waterY']      # eye above the water
    rB = drop / ((vB - vE) * S)             # distance of the line where the city meets the water
    # per column: the model's disparity where the city meets the water; everything in that column is scaled so its foot stands on the water
    band = D[int((vB - .03) * H):int((vB - .006) * H)]
    base = ndi.gaussian_filter1d(np.median(band, axis=0), W * .03, mode='nearest')
    sky = D < cfg['skyBelow'] * np.median(base)
    rho = rB * base[None, :] / np.maximum(D, 1e-4)
    rho = np.clip(rho, rB * .72, cfg['rFar'])
    # foreground wins at the mesh vertices: a thin spire or palm keeps its own distance, the rubber sheet goes behind it
    cell = max(1, int(round(W / GW * .9)))
    inv = ndi.maximum_filter(np.where(sky, 0, 1 / rho), size=cell)
    us = np.clip(np.round(np.linspace(0, 1, GW + 1) * (W - 1)).astype(int), 0, W - 1)
    vs = np.linspace(0, vBot, GH + 1)
    ys = np.clip(np.round(vs * (H - 1)).astype(int), 0, H - 1)
    g = inv[np.ix_(ys, us)]
    # at and below the waterline the distance is exact: the water plane itself
    for j, v in enumerate(vs):
        if v >= vB:
            g[j, :] = 1 / (drop / ((v - vE) * S))
        elif v > vB - .02:  # ease into it so the city foot has no step
            k = (v - (vB - .02)) / .02; flat = 1 / rB
            g[j, :] = np.where(g[j, :] > 0, g[j, :] * (1 - k) + flat * k, flat * k if k > .5 else 0)
    code = np.clip(np.round(g * INV_NEAR * 65535), 0, 65535).astype(np.uint16)
    sway = boxes_mask(cfg.get('sway', []), W, H, 3, ramp=True)[np.ix_(ys, us)]
    fall = boxes_mask(cfg.get('falls', []), W, H, 2.5)[np.ix_(ys, us)]
    out = np.zeros((2 * (GH + 1), GW + 1, 3), np.uint8)
    out[:GH + 1, :, 0] = code >> 8; out[:GH + 1, :, 1] = code & 255; out[:GH + 1, :, 2] = np.round(np.clip(sway, 0, 1) * 255)
    out[GH + 1:, :, 0] = np.round(np.clip(fall * 1.6, 0, 1) * 255)
    path = os.path.join(ROOT, 'assets', 'worlds', cfg['id'] + '.png')
    Image.fromarray(out, 'RGB').save(path, optimize=True)
    meta = {'id': cfg['id'], 'grid': [GW, GH], 'vEye': vE, 'vBase': vB, 'vBottom': vBot, 'eyeH': cfg['eyeH'], 'waterY': cfg['waterY'], 'rFar': cfg['rFar'],
            'aspect': round(W / H, 5), 'invNear': INV_NEAR, 'rBase': round(float(rB), 3), 'skyShare': round(float((code == 0).mean()), 3)}
    json.dump(meta, open(os.path.join(ROOT, 'assets', 'worlds', cfg['id'] + '.json'), 'w'))
    print(json.dumps(meta)); print(path, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
