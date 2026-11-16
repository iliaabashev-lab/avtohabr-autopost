# Ежедневные истории маскота: берёт следующие N готовых историй из viral-factory/stories/<id>/
# (готовый клип video.mp4 из AI Studio, либо кадры 1..5.jpg из Flow — фолбэк + story.json с текстом рассказчика),
# делает голос и готовит props для рендера.
# Голос: нейроголос Microsoft через edge-tts (бесплатно, неофициально); если не работает — Piper.
import asyncio, json, os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REM = os.path.join(ROOT, '..', 'promo-video', 'remotion')
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5
log_path = os.path.join(ROOT, 'knowledge/story-log.json')
log = json.load(open(log_path, encoding='utf-8')) if os.path.exists(log_path) else []
done = {e['id'] for e in log}
sdir = os.path.join(ROOT, 'stories')
def complete(d):
    has_video = (
        os.path.isfile(os.path.join(sdir, d, 'video.mp4'))
        or os.path.isfile(os.path.join(ROOT, '..', 'ai-videos', f'{d}.mp4'))
        or os.path.isfile(os.path.join(ROOT, 'videos', f'{d}.mp4'))
    )
    return os.path.isfile(os.path.join(sdir, d, 'story.json')) and (
        has_video
        or all(os.path.isfile(os.path.join(sdir, d, f'{i}.jpg')) for i in range(1, 6)))
ready = sorted(d for d in os.listdir(sdir) if complete(d))
todo = [d for d in ready if d not in done][:N]
print('готовых историй:', len(ready), 'к рендеру:', todo)

async def tts(text, out):
    import edge_tts
    await edge_tts.Communicate(text, 'ru-RU-SvetlanaNeural', rate='+8%').save(out)

def music(sid, text, dur, out):
    # своя мультяшная музыка для каждого ролика: тональность, темп и мелодия зависят от истории,
    # настроение по смыслу (ночь/холод/беда — мягче и медленнее, остальное — весёлое пиццикато)
    import numpy as np, wave, random
    rnd = random.Random(sid)
    calm = any(w in text.lower() for w in ['ноч', 'холод', 'зим', 'сон', 'спать', 'дожд'])
    sr, bpm = 44100, (84 if calm else 112) + rnd.randint(-6, 6)
    beat = 60 / bpm
    root = 220 * 2 ** (rnd.choice([0, 2, 3, 5, 7]) / 12)
    prog = rnd.choice([[0, 5, 3, 4], [0, 3, 4, 0], [0, 4, 5, 3]])
    major = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]
    n = int(sr * dur); x = np.zeros(n)
    def note(t0, f, length, vol, decay):
        i0 = int(t0 * sr); m = min(int(length * sr), n - i0)
        if m <= 0: return
        tt = np.arange(m) / sr
        x[i0:i0 + m] += vol * np.exp(-tt * decay) * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt))
    t, k = 0.0, 0
    while t < dur:
        deg = major[prog[(k // 4) % 4] % 7]
        note(t, root / 2 * 2 ** (deg / 12), beat * 0.9, 0.35, 3)                       # бас
        for j in range(2):                                                             # мелодия восьмыми
            f = root * 2 ** (major[(prog[(k // 4) % 4] + rnd.choice([0, 2, 4, 7])) % 10] / 12)
            note(t + j * beat / 2, f, beat, 0.22 if calm else 0.28, 6 if calm else 10)
        t += beat; k += 1
    x = x / (np.abs(x).max() + 1e-9) * 0.8
    fade = np.minimum(1, np.minimum(np.arange(n) / (0.3 * sr), (n - np.arange(n)) / (1.0 * sr)))
    with wave.open(out, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * fade * 32767).astype('<i2').tobytes())

jobs = []
os.makedirs('/tmp/sv', exist_ok=True)
for sid in todo:
    st = json.load(open(os.path.join(sdir, sid, 'story.json'), encoding='utf-8'))
    vsrc = os.path.join(sdir, sid, 'video.mp4')
    if not os.path.isfile(vsrc):
        for alt in [os.path.join(ROOT, '..', 'ai-videos', f'{sid}.mp4'), os.path.join(ROOT, 'videos', f'{sid}.mp4')]:
            if os.path.isfile(alt):
                vsrc = alt
                break
    if os.path.isfile(vsrc):
        # готовый клип из AI Studio (уже со звуком и речью): БЕЗ озвучки и рендера — сразу в автопостинг
        shutil.copy(vsrc, f'/tmp/sv/{sid}.mp4')
        jobs.append({'id': sid, 'title': st['title'], 'caption': st['caption'], 'source': 'ai-studio'})
        print(f'{sid}: клип из AI Studio → автопостинг без рендера')
        continue
    dst = os.path.join(REM, 'public/story', sid)
    os.makedirs(dst, exist_ok=True)
    props = {'id': sid, 'voice': f'story/{sid}/voice.mp3', 'cta': st.get('cta', 'Запись в автосервис онлайн'), 'music': f'story/{sid}/music.wav'}
    for i in range(1, 6): shutil.copy(os.path.join(sdir, sid, f'{i}.jpg'), os.path.join(dst, f'{i}.jpg'))
    voice = os.path.join(dst, 'voice.mp3')
    try:
        asyncio.run(tts(st['narration'], voice))
    except Exception as e:
        print('edge-tts не сработал, Piper:', e)
        wav = voice.replace('.mp3', '.wav')
        subprocess.run(['piper', '--model', '/tmp/voice.onnx', '--output_file', wav], input=st['narration'].encode(), check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, voice], check=True)
    # длина ролика по голосу: голос не обрезается, после него 2.2 с рекламы
    vlen = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voice], capture_output=True, text=True).stdout.strip() or 9)
    dur = round(max(12, vlen + 0.6 + 2.2), 2)
    props['dur'] = dur
    music(sid, st['narration'] + st['title'], dur, os.path.join(dst, 'music.wav'))
    json.dump(props, open(f'/tmp/story-{sid}.json', 'w'), ensure_ascii=False)
    jobs.append({'id': sid, 'title': st['title'], 'caption': st['caption']})
json.dump(jobs, open('/tmp/story-jobs.json', 'w'), ensure_ascii=False)
log += [{'id': j['id']} for j in jobs]
json.dump(log, open(log_path, 'w'), indent=1)
