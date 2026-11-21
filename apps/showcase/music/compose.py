"""
The showcase clips' background music: an original, upbeat lo-fi loop made
entirely in code (no samples, so no licence to track). Run it to remake
upbeat.m4a:

    python3 apps/showcase/music/compose.py

100 BPM in C major, I-V-vi-IV (C, G, Am, F), 8 bars (19.2 s) that loop
seamlessly: soft electric-piano chords, a bass line, an arpeggio and a light
kick / snare / hi-hat groove.
"""
import os
import subprocess
import wave

import numpy as np

SR = 44100
BPM = 100
BEAT = 60 / BPM
BARS = 8
LENGTH = int(SR * BEAT * 4 * BARS)
rng = np.random.default_rng(7)

def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

def add(buf, start_s, sig, gain=1.0):
    i = int(start_s * SR) % LENGTH
    n = len(sig)
    end = min(LENGTH, i + n)
    buf[i:end] += sig[: end - i] * gain
    if i + n > LENGTH:  # wrap into the loop's start, so it loops cleanly
        buf[: i + n - LENGTH] += sig[end - i :] * gain

def env(n, attack=0.005, decay=0.6):
    t = np.arange(n) / SR
    a = np.minimum(1, t / attack)
    return a * np.exp(-t / decay)

def keys(midi, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    tone = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t)
            + 0.12 * np.sin(2 * np.pi * 3 * f * t) + 0.05 * np.sin(2 * np.pi * 4.01 * f * t))
    trem = 1 + 0.08 * np.sin(2 * np.pi * 5 * t)
    return tone * trem * env(n, 0.008, 0.9)

def bass(midi, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    tone = np.tanh(1.6 * np.sin(2 * np.pi * f * t)) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    return tone * env(n, 0.01, 0.35)

def pluck(midi, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.05)
    return tone * env(n, 0.002, 0.18)

def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)

def snare():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = np.convolve(noise, [1, -0.6], 'same')
    body = 0.4 * np.sin(2 * np.pi * 190 * t)
    return (noise * 0.5 + body) * np.exp(-t / 0.07)

def hat(open_=False):
    n = int((0.12 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    noise = np.diff(rng.standard_normal(n + 1))
    return noise * np.exp(-t / (0.05 if open_ else 0.015))

# C, G, Am, F: chord tones (keys voiced around middle C), bass roots.
CHORDS = [[60, 64, 67, 71], [59, 62, 67, 69], [60, 64, 69, 72], [60, 65, 69, 72]]
ROOTS = [36, 43, 45, 41]
ARP = [[72, 76, 79, 76], [71, 74, 79, 74], [72, 76, 81, 76], [72, 77, 81, 77]]

L = np.zeros(LENGTH)
R = np.zeros(LENGTH)
for bar in range(BARS):
    c = bar % 4
    b0 = bar * 4 * BEAT
    for beat, dur in [(0, 1.5), (1.5, 1.0), (2.5, 1.5)]:  # syncopated chord stabs
        for k, note in enumerate(CHORDS[c]):
            s = keys(note, dur * BEAT + 0.6)
            add(L, b0 + beat * BEAT, s, 0.07 * (1.1 if k % 2 else 0.9))
            add(R, b0 + beat * BEAT, s, 0.07 * (0.9 if k % 2 else 1.1))
    for beat, step in [(0, 0), (1.5, 0), (2, 7), (3, 12), (3.5, 7)]:  # bass groove
        s = bass(ROOTS[c] + step, 0.6)
        add(L, b0 + beat * BEAT, s, 0.22)
        add(R, b0 + beat * BEAT, s, 0.22)
    if bar >= 2:  # arpeggio comes in after two bars
        for i in range(8):
            s = pluck(ARP[c][i % 4], 0.3)
            pan = 0.35 + 0.3 * (i % 2)
            add(L, b0 + i * BEAT / 2, s, 0.09 * (1 - pan))
            add(R, b0 + i * BEAT / 2, s, 0.09 * pan)
    for beat in range(4):  # drums
        t = b0 + beat * BEAT
        if beat in (0, 2):
            add(L, t, kick(), 0.5); add(R, t, kick(), 0.5)
        if beat == 2 and bar % 2:
            add(L, t + BEAT * 0.75, kick(), 0.3); add(R, t + BEAT * 0.75, kick(), 0.3)
        if beat in (1, 3):
            add(L, t, snare(), 0.2); add(R, t, snare(), 0.2)
        for half in (0, 0.5):
            h = hat(open_=(beat == 3 and half == 0.5))
            g = 0.06 if half else 0.04
            add(L, t + half * BEAT, h, g * 0.8); add(R, t + half * BEAT, h, g * 1.2)

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)  # gentle glue
mix *= 0.85 / np.max(np.abs(mix))
here = os.path.dirname(os.path.abspath(__file__))
wav_path = os.path.join(here, 'upbeat.wav')
with wave.open(wav_path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_path, '-c:a', 'aac', '-b:a', '160k',
                os.path.join(here, 'upbeat.m4a')], check=True)
os.remove(wav_path)
print('upbeat.m4a', round(LENGTH / SR, 1), 's')
