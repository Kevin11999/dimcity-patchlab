#!/usr/bin/env python3
"""Text to speech for the tutorial videos (English, female voice 'af_heart' of the Kokoro model, runs offline).
Usage:  python3 tools/tts.py lines.json outdir        lines.json = ["sentence", ...]  ->  outdir/<sha1>.wav
Needs:  pip install kokoro-onnx soundfile
        KOKORO_DIR (default /tmp/tts) with kokoro-v1.0.int8.onnx as kokoro-int8.onnx and voices-v1.0.bin as voices.bin
        (github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)"""
import hashlib, json, os, sys
import soundfile as sf
from kokoro_onnx import Kokoro
d = os.environ.get('KOKORO_DIR', '/tmp/tts')
k = Kokoro(os.path.join(d, 'kokoro-int8.onnx'), os.path.join(d, 'voices.bin'))
lines = json.load(open(sys.argv[1], encoding='utf-8')); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
for text in lines:
    h = hashlib.sha1(text.encode('utf-8')).hexdigest(); p = os.path.join(out, h + '.wav')
    if os.path.exists(p): continue
    samples, sr = k.create(text, voice='af_heart', speed=0.96, lang='en-us')
    sf.write(p, samples, sr); print('tts', h[:8], round(len(samples) / sr, 1), 's', flush=True)
