"""Convert CREASE's recorded WebM to a 1080x1920 Instagram-ready MP4.

Usage: python tools/to-instagram-mp4.py crease-intro.webm crease-intro.mp4
"""
import subprocess, sys
if len(sys.argv)!=3: raise SystemExit('usage: python tools/to-instagram-mp4.py input.webm output.mp4')
src,dst=sys.argv[1:]
filter_graph=(
  '[0:v]split=2[bg][fg];'
  '[bg]scale=1080:1920:force_original_aspect_ratio=increase,'
  'crop=1080:1920,boxblur=20:10,eq=brightness=-0.18[back];'
  '[fg]scale=1080:1920:force_original_aspect_ratio=decrease[front];'
  '[back][front]overlay=(W-w)/2:(H-h)/2'
)
subprocess.run(['ffmpeg','-y','-i',src,'-filter_complex',filter_graph,
  '-map','0:a?','-c:v','libx264','-pix_fmt','yuv420p','-crf','19','-preset','medium',
  '-c:a','aac','-b:a','192k','-movflags','+faststart',dst],check=True)
