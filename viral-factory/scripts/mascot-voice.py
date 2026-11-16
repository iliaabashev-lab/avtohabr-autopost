# Озвучка маскота: берёт следующие N реплик из knowledge/mascot-lines.json по кругу,
# синтезирует голос Piper (бесплатно, офлайн в облаке), поднимает тон для мультяшности
# и считает громкость по кадрам (30 fps) — по ней в Remotion открывается рот.
import json, os, subprocess, sys, wave
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REM = os.path.join(ROOT, '..', 'promo-video', 'remotion')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
lines = json.load(open(os.path.join(ROOT, 'knowledge/mascot-lines.json'), encoding='utf-8'))
log_path = os.path.join(ROOT, 'knowledge/mascot-log.json')
log = json.load(open(log_path, encoding='utf-8')) if os.path.exists(log_path) else []
os.makedirs(os.path.join(REM, 'public/voice'), exist_ok=True)
# тренды дня: если в Google Trends есть автотема, первым роликом идёт ситуативная шутка на неё
import glob
trend_line = None
tl = json.load(open(os.path.join(ROOT, 'knowledge/mascot-trend-lines.json'), encoding='utf-8'))
tf = sorted(glob.glob(os.path.join(ROOT, 'out/*/trends.json')))
if tf:
    tr = json.load(open(tf[-1], encoding='utf-8'))
    blob = ' '.join((t.get('title', '') + ' ' + ' '.join(t.get('news', []))).lower() for t in tr.get('google_trends', []))
    used_trends = {e.get('trend') for e in log[-15:]}
    for key, line in tl.items():
        if key in blob and key not in used_trends:
            trend_line = (key, line); break
jobs = []
for k in range(N):
    i = (len(log) + k) % len(lines)
    text = lines[i]
    if k == 0 and trend_line:
        i, text = -1, trend_line[1]
    raw, out = f'/tmp/raw{k}.wav', os.path.join(REM, f'public/voice/v{k}.wav')
    subprocess.run(['piper', '--model', '/tmp/voice.onnx', '--output_file', raw], input=text.encode('utf-8'), check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw, '-af', 'asetrate=22050*1.16,aresample=44100,atempo=0.95,volume=1.6', out], check=True)
    w = wave.open(out); sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    if w.getnchannels() == 2: a = a.reshape(-1, 2).mean(1)
    hop = sr // 30
    env = [float(np.sqrt(np.mean(a[j:j + hop] ** 2))) for j in range(0, len(a), hop)]
    ref = np.percentile(env, 95) or 1
    env = [round(min(1.0, e / ref), 3) for e in env]
    dur = len(a) / sr
    json.dump({'audio': f'voice/v{k}.wav', 'env': env}, open(f'/tmp/props{k}.json', 'w'))
    jobs.append({'k': k, 'line': i, 'text': text, 'seconds': round(dur, 2)})
    print(f'v{k}: {dur:.1f} c — {text[:50]}')
json.dump(jobs, open('/tmp/mascot-jobs.json', 'w'), ensure_ascii=False)
log += [{'line': j['line'], **({'trend': trend_line[0]} if j['line'] == -1 else {})} for j in jobs]
json.dump(log, open(log_path, 'w'), indent=1)
