"""Generates seamless ambient loops for Lockin (no copyrighted audio)."""
import sys, wave
import numpy as np

SR, SECONDS, FADE = 22050, 20, 1.0
rng = np.random.default_rng(42)
n = SR * SECONDS

def one_pole_lowpass(x, alpha):
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc); y[i] = acc
    return y

def loopable(x):
    """Crossfade the tail into the head so the loop has no click."""
    f = int(SR * FADE)
    head, tail = x[:f].copy(), x[-f:]
    ramp = np.linspace(0, 1, f)
    x = x[:-f].copy()
    x[:f] = head * ramp + tail * (1 - ramp)
    return x

def normalize(x, peak):
    return x / np.max(np.abs(x)) * peak

def save(name, x):
    data = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(f"{sys.argv[1]}/{name}.wav", 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())

white = rng.standard_normal(n + SR)

# Soft white noise: slightly darkened so it isn't harsh.
save('white', loopable(normalize(one_pole_lowpass(white, 0.6), 0.35)))

# Brown noise: integrated white noise with a leak, deep and calm.
brown = np.empty_like(white); acc = 0.0
for i, v in enumerate(white):
    acc = 0.997 * acc + v * 0.02; brown[i] = acc
brown -= one_pole_lowpass(brown, 0.0005)  # remove slow drift
save('brown', loopable(normalize(brown, 0.5)))

# Rain: muffled noise bed + lots of small droplets.
bed = one_pole_lowpass(rng.standard_normal(n + SR), 0.15)
bed = normalize(bed, 0.25)
drops = np.zeros(n + SR)
hp = rng.standard_normal(n + SR); hp = hp - one_pole_lowpass(hp, 0.3)
length = int(SR * 0.03); env = np.exp(-np.linspace(0, 6, length))
for start in rng.integers(0, n + SR - length, size=SECONDS * 120):
    drops[start:start + length] += hp[start:start + length] * env * rng.uniform(0.05, 0.4)
save('rain', loopable(normalize(bed + drops, 0.6)))
print('ok')
