"""Aurora's voice: cut one ElevenLabs take of script.txt into one clip per line, and make her robotic and glitchy.

  python aurora-voice/cut.py take.mp3                     the whole script in one take
  python aurora-voice/cut.py part1.mp3 part2.mp3 ...      or in parts, in script order
  python aurora-voice/cut.py --clean take.mp3             cut only, no effects (to compare)
  python aurora-voice/cut.py --fx                         redo only the effects (after changing the knobs below)
  python aurora-voice/cut.py --test                       self-check

Clips land in hub/public/voice/ as 001-another-one-wants-in.mp3 and so on (old clips there are replaced), with
index.json, the list hub/public/voice.js plays them from: every game finds a clip by its line's text. The clean cuts
also go to aurora-voice/raw/ (not in git), which --fx starts from.
Finding the lines: with faster-whisper installed (pip install faster-whisper, about 500 MB once) it listens to the take
and cuts at the pause nearest each line's end. Without it, it cuts at the longest pauses, which breaks when ElevenLabs
runs two lines together. Either way, check the printed list: each clip's length should fit its line.
Needs ffmpeg on PATH and numpy.
"""
import difflib, json, re, subprocess, sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).parent
SR = 44100

# ===== Tuning knobs (tune by ear) =====
SEED = 1                         # change it to reroll where every clip glitches
SILENCE_DB = -45                 # quieter than this (vs. her loudest parts) counts as a pause
PAD_MS = 40                      # silence kept at each end of a clip
WHISPER = 'small.en'             # speech recognition model ('base.en' = faster, less sure)
DRIFT = .3                       # cutting: how much a pause's distance from the heard line end counts against its length
RING_HZ, RING_MIX = 60, .35      # robot warble (ring modulation). Higher mix = more robot
COMB_MS, COMB_FB = 4.5, .45      # metallic ring (comb filter): delay and strength
CRUSH_BITS, CRUSH_HOLD = 9, 2    # always-on digital grit: bit depth (lower = dirtier) and sample hold
GLITCHES = {'hot': (3, 6), 'calm': (0, 2), 'soft': (0, 1)}   # random glitches per clip by mood: (fewest, most)
HOT = ('scream', 'shout', 'angry', 'panic', 'growl')         # tag words that make a line 'hot'
SOFT = ('soft', 'whisper', 'dying', 'quiet')                  # ...or 'soft'; anything else is 'calm'


def lines():                     # [(tag, text)] in script order; a tag holds until the next one, as in ElevenLabs
    out, tag = [], ''
    for p in (HERE / 'script.txt').read_text(encoding='utf-8').splitlines():
        p = p.strip()
        if p.startswith('['):
            if 'pause' not in p and 'silence' not in p: tag = p
        elif p: out.append((tag, p))
    return out


def load(f, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def save(x, f):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '160k', str(f)],
                   input=x.astype(np.float32).tobytes(), check=True)


def env(x, hop=SR // 100):       # loudness per 10 ms
    return np.sqrt(np.mean(x[:len(x) // hop * hop].reshape(-1, hop) ** 2, axis=1))


norm = lambda w: re.sub(r'[^a-z0-9]', '', w.lower())


def takes(files, sr=SR):         # the takes back to back, 3 s apart
    return np.concatenate([np.concatenate([load(f, sr), np.zeros(sr * 3, np.float32)]) for f in files])


def align(files, script):
    """Where each line was heard, [(start s, end s)], by speech recognition. None without faster-whisper."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print('faster-whisper is not installed: cutting at the longest pauses only.\n')
        return None
    print('Listening to the take to find each line (a few minutes)...')
    x16 = takes(files, 16000)
    segs, _ = WhisperModel(WHISPER, device='cpu', compute_type='int8').transcribe(
        x16, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
    heard = [(norm(w.word), w.start, w.end) for s in segs for w in s.words if norm(w.word)]
    mine = [(i, norm(w)) for i, (_, t) in enumerate(script) for w in t.split() if norm(w)]
    times = [[] for _ in script]
    for a, b, k in difflib.SequenceMatcher(None, [w for _, w in mine], [w for w, _, _ in heard], autojunk=False).get_matching_blocks():
        for j in range(k): times[mine[a + j][0]] += heard[b + j][1:]
    where, i = [(min(t), max(t)) if t else None for t in times], 0
    while i < len(where):                        # lines not recognized (whispers, screams): spread them between the
        j = i                                    # recognized lines around them, by text length
        while j < len(where) and not where[j]: j += 1
        if j > i:
            a, b = where[i - 1][1] if i else 0, where[j][0] if j < len(where) else len(x16) / 16000
            at = np.cumsum([0] + [len(script[k][1]) + 10 for k in range(i, j)])
            at = a + (b - a) * at / at[-1]
            for k in range(i, j):
                print(f'  not recognized, placed between its neighbours: {script[k][1]}')
                where[k] = (at[k - i], at[k - i + 1])
        i = j + 1
    return where


def pick(mid, length, ends):
    """One pause per boundary between lines, in order: long ones, near where the recognizer heard the boundary."""
    score = length[None, :] - DRIFT * np.abs(mid[None, :] - ends[:, None])
    best, back, idx = score[0], [], np.arange(len(mid))
    for s in score[1:]:                          # best[j]: the best choice so far with this boundary at pause j
        run = np.maximum.accumulate(best)
        arg = np.maximum.accumulate(np.where(best >= run, idx, 0))
        best = s + np.r_[-np.inf, run[:-1]]; back.append(np.r_[0, arg[:-1]])
    out = [int(np.argmax(best))]
    for b in reversed(back): out.append(int(b[out[-1]]))
    return np.array(out[::-1])


def split(x, n, where=None):
    """Cut x into n clips at pauses: near each heard line end, or else at the n-1 longest ('...' pauses are shorter)."""
    hop, rms = SR // 100, env(x)
    on = np.flatnonzero(rms > np.percentile(rms, 95) * 10 ** (SILENCE_DB / 20))   # frames with sound
    if where: on = on[(on >= (where[0][0] - .5) * 100) & (on <= (where[-1][1] + .5) * 100)]
    gap = np.diff(on)                                                             # > 1 = a pause between them
    if (gap > 1).sum() < n - 1:
        sys.exit(f'Found only {(gap > 1).sum() + 1} pieces of speech for {n} lines. Did the take skip some?')
    if where:
        p = np.flatnonzero(gap > 1)
        ends = np.array([(where[i][1] + where[i + 1][0]) / 2 for i in range(n - 1)]) * 100
        cut = p[pick((on[p] + on[p + 1]) / 2, gap[p].astype(float), ends)]
    else:
        order = np.argsort(-gap, kind='stable')
        cut = np.sort(order[:n - 1])
        if n > 1 and len(gap) >= n and gap[order[n - 1]] * 1.3 > gap[order[n - 2]]:
            print(f'WARNING: the shortest pause cut ({gap[order[n - 2]] * 10} ms) is close to the longest one kept inside a '
                  f'line ({gap[order[n - 1]] * 10} ms). Check the list below; a longer [long pause] in the take fixes it.\n')
    pad = PAD_MS * SR // 1000
    starts, ends = np.r_[on[0], on[cut + 1]], np.r_[on[cut], on[-1]] + 1
    return [x[max(0, s * hop - pad):e * hop + pad] for s, e in zip(starts, ends)]


# ===== The effects =====
def fade(s, ms=4):               # no clicks at slice edges
    s, n = s.copy(), min(len(s) // 2, SR * ms // 1000)
    if n: r = np.linspace(0, 1, n); s[:n] *= r; s[-n:] *= r[::-1]
    return s


def robot(x):
    t = np.arange(len(x)) / SR
    x = x * (1 - RING_MIX + RING_MIX * np.sin(2 * np.pi * RING_HZ * t))
    d, y = int(SR * COMB_MS / 1000), x.copy()
    for k in range(1, 5):
        if k * d < len(x): y[k * d:] += COMB_FB ** k * x[:-k * d]
    q = 2 ** (CRUSH_BITS - 1)
    y = np.round(y / np.abs(y).max() * q) / q
    return np.repeat(y[::CRUSH_HOLD], CRUSH_HOLD)[:len(y)]


def spot(x, rng, ms):            # a random place inside her voice (not the silence around it) and a slice length there
    L, rms = int(SR * ms / 1000), env(x)
    f = np.flatnonzero(rms > rms.max() * .2) * (SR // 100)
    f = f[f < len(x) - L]
    return (int(rng.choice(f)) if len(f) else 0), L


def stutter(x, rng):             # a syllable sticks and repeats
    p, L = spot(x, rng, rng.uniform(40, 100))
    return np.concatenate([x[:p], np.tile(fade(x[p:p + L]), rng.integers(2, 6)), x[p + L:]])


def pitch(x, rng):               # a slice jumps up or down in pitch
    p, L = spot(x, rng, rng.uniform(80, 200))
    s = x[p:p + L]
    s = np.interp(np.arange(0, len(s) - 1, rng.choice([.55, .7, 1.5, 1.9])), np.arange(len(s)), s)
    return np.concatenate([x[:p], fade(s), x[p + L:]])


def dropout(x, rng):             # the signal cuts out: dead air or static
    p, L = spot(x, rng, rng.uniform(30, 80))
    y = x.copy(); y[p:p + L] = rng.uniform(-.25, .25, len(y[p:p + L])) * (rng.random() < .5)
    return y


def reverse(x, rng):
    p, L = spot(x, rng, rng.uniform(60, 120))
    y = x.copy(); y[p:p + L] = fade(x[p:p + L][::-1])
    return y


def crush(x, rng):               # a burst of heavy digital grit
    p, L = spot(x, rng, rng.uniform(100, 250))
    y = x.copy(); s = np.round(y[p:p + L] * 4) / 4
    y[p:p + L] = np.repeat(s[::8], 8)[:len(s)]
    return y


FX = [stutter, stutter, pitch, dropout, reverse, crush]   # stutter twice: it is the "spazzing out" one


def cutoff(x, rng):              # a line that ends in "—": the last syllable sticks, faster and faster, then static
    rms = env(x)
    e = (np.flatnonzero(rms > rms.max() * .2)[-1] + 1) * (SR // 100)
    s = x[max(0, e - SR * 70 // 1000):e]
    reps = [fade(s[:int(len(s) * k)]) for k in (1, 1, .8, .6, .45, .3)]
    return np.concatenate([x[:e], *reps, rng.uniform(-.3, .3, SR * 60 // 1000)])


def tapestop(x, ms=600):         # dying: the end slows down and sinks
    L = min(len(x), SR * ms // 1000)
    pos = np.cumsum(np.linspace(1, .2, int(L / .6)))
    return np.concatenate([x[:-L], fade(np.interp(pos[pos < L - 1], np.arange(L), x[-L:]))])


def mood(tag):
    return 'hot' if any(w in tag for w in HOT) else 'soft' if any(w in tag for w in SOFT) else 'calm'


def glitch(x, i, tag, text, level=1):          # level: this line's loudness vs. the loudest line (whispers stay quiet)
    rng = np.random.default_rng(SEED * 1000 + i)   # the same clip glitches the same way every run
    x = robot(x)
    lo, hi = GLITCHES[mood(tag)]
    for _ in range(rng.integers(lo, hi + 1)): x = FX[rng.integers(len(FX))](x, rng)
    if 'dying' in tag: x = tapestop(x)
    if text.endswith('—'): x = cutoff(x, rng)
    return x / np.abs(x).max() * .89 * level ** .5   # loudest line peaks at -1 dB; quiet ones stay quieter, at half the dB


def test():                      # 5 fake lines of noise: '...' pauses inside two of them, long pauses between them all
    rng = np.random.default_rng(0)
    talk, sil = (lambda s: rng.uniform(-.5, .5, int(SR * s))), (lambda s: np.zeros(int(SR * s)))
    x = np.concatenate([talk(.5), sil(1.5), talk(.3), sil(.5), talk(.4), sil(1.4), talk(1), sil(1.6),
                        talk(.2), sil(.6), talk(.2), sil(1.5), talk(.7)]).astype(np.float32)
    lens = [round(len(c) / SR - 2 * PAD_MS / 1000, 1) for c in split(x, 5)]
    assert lens == [.5, 1.2, 1, 1, .7], lens
    heard = [(.4, .9), (2.4, 3.6), (5, 6), (7.6, 8.6), (10.1, 10.8)]   # the recognizer's times, 0.4 s late
    assert [round(len(c) / SR - 2 * PAD_MS / 1000, 1) for c in split(x, 5, heard)] == lens
    for i, tag in enumerate(['[screaming]', '[coldly]', '[dying, weak whisper]'] * 5):
        assert np.isfinite(glitch(talk(.4), i, tag, 'NO—')).all()
    assert len(lines()) > 100
    print('ok')


def main(args):
    if args == ['--test']: return test()
    script, raw, out = lines(), HERE / 'raw', HERE.parent / 'hub' / 'public' / 'voice'
    if '--fx' in args:                           # the clean cuts from last time
        clips = [load(f) for f in sorted(raw.glob('*.wav'))]
        if len(clips) != len(script): sys.exit(f'raw/ has {len(clips)} clips for {len(script)} lines: cut the take again.')
    else:
        files = [a for a in args if not a.startswith('--')]
        if not files: sys.exit(__doc__)
        clips = split(takes(files), len(script), align(files, script))
        raw.mkdir(exist_ok=True)
        for old in raw.glob('*.wav'): old.unlink()
    out.mkdir(exist_ok=True)
    for old in out.glob('*.mp3'): old.unlink()
    top, index = max(np.abs(c).max() for c in clips), []
    for i, ((tag, text), c) in enumerate(zip(script, clips), 1):
        name = f"{i:03d}-{re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:40].strip('-')}"
        if '--fx' not in args: save(c, raw / f'{name}.wav')
        y = c if '--clean' in args else glitch(c, i, tag, text, np.abs(c).max() / top)
        save(y, out / f'{name}.mp3'); index.append([f'{name}.mp3', text, round(len(y) / SR, 2)])
        print(f'{name:46} {len(c) / SR:5.1f} s   {text}')
    rows = ',\n'.join(json.dumps(e, ensure_ascii=False) for e in index)   # one clip per line: readable diffs
    (out / 'index.json').write_text(f'[\n{rows}\n]\n', encoding='utf-8')
    print(f'\n{len(clips)} clips in {out}')


if __name__ == '__main__':
    main(sys.argv[1:])
