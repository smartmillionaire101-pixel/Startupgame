import { useEffect } from 'react';

/** An original eight-bar, 96 BPM instrumental: soft keys, bass and a light beat.
 * Rendered locally once per session; no downloads or external audio services. */
let soundtrack: Float32Array | undefined;
const RATE = 22_050;

export function musicSamples(): Float32Array {
  if (soundtrack) return soundtrack;
  const beat = 60 / 96;
  const samples = new Float32Array(Math.round(32 * beat * RATE));
  const note = (midi: number, start: number, duration: number, volume: number, bass = false) => {
    const hz = 440 * 2 ** ((midi - 69) / 12);
    const length = Math.floor(duration * RATE);
    const offset = Math.round(start * RATE);
    for (let i = 0; i < length; i++) {
      const seconds = i / RATE;
      const phase = 2 * Math.PI * hz * seconds;
      const envelope =
        Math.min(1, seconds / 0.015) *
        Math.exp(-seconds * (bass ? 4 : 3)) *
        Math.min(1, (length - i) / (RATE * 0.06));
      const tone = Math.sin(phase) + (bass ? 0.12 : 0.25) * Math.sin(2 * phase);
      const index = (offset + i) % samples.length;
      samples[index] = samples[index]! + tone * envelope * volume;
    }
  };
  const chords = [
    [60, 64, 67, 71],
    [57, 60, 64, 67],
    [53, 57, 60, 64],
    [55, 59, 62, 67],
  ];
  const melody = [76, 79, 74, 71, 72, 76, 79, 76, 77, 76, 72, 69, 71, 74, 79, 74];
  let noise = 17;
  for (let bar = 0; bar < 8; bar++) {
    const chord = chords[bar % chords.length]!;
    chord.forEach((pitch, i) => note(pitch, (bar * 4 + i * 0.04) * beat, beat * 3.5, 0.055));
    note(chord[0]! - 24, bar * 4 * beat, beat * 1.5, 0.17, true);
    note(chord[0]! - 12, (bar * 4 + 2.5) * beat, beat, 0.09, true);
    for (let n = 0; n < 2; n++) {
      note(melody[bar * 2 + n]!, (bar * 4 + 1 + n * 1.5) * beat, beat * 1.2, 0.075);
    }
    for (let step = 0; step < 8; step++) {
      const offset = Math.round((bar * 4 + step / 2) * beat * RATE);
      for (let i = 0; i < RATE * 0.12; i++) {
        const seconds = i / RATE;
        noise = (noise * 16807) % 2147483647;
        const hat = ((noise / 2147483647) * 2 - 1) * Math.exp(-seconds * 90) * 0.018;
        const kick =
          step % 4 === 0
            ? Math.sin(2 * Math.PI * (48 * seconds + 1.8 * (1 - Math.exp(-seconds * 30)))) *
              Math.exp(-seconds * 32) *
              Math.min(1, seconds / 0.004) *
              0.16
            : 0;
        const index = (offset + i) % samples.length;
        samples[index] = samples[index]! + hat + kick;
      }
    }
  }
  soundtrack = samples;
  return samples;
}

/** Browsers require a gesture before sound. Dispose everything on sign-out. */
export function useMusic(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof AudioContext === 'undefined') return;
    let context: AudioContext | undefined;
    let source: AudioBufferSourceNode | undefined;
    let disposed = false;
    const play = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      try {
        if (!context) {
          context = new AudioContext();
          const samples = musicSamples();
          const buffer = context.createBuffer(1, samples.length, RATE);
          buffer.getChannelData(0).set(samples);
          source = context.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          const gain = context.createGain();
          gain.gain.value = 0.35;
          source.connect(gain).connect(context.destination);
          source.start();
        }
        void context.resume().catch(() => {});
      } catch {
        // Sound must never stop gameplay on devices without available audio.
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') void context?.suspend().catch(() => {});
      else if (context) play();
    };
    document.addEventListener('pointerdown', play);
    document.addEventListener('keydown', play);
    document.addEventListener('visibilitychange', visibility);
    if (navigator.userActivation?.hasBeenActive) play();
    return () => {
      disposed = true;
      document.removeEventListener('pointerdown', play);
      document.removeEventListener('keydown', play);
      document.removeEventListener('visibilitychange', visibility);
      source?.stop();
      void context?.close().catch(() => {});
    };
  }, [enabled]);
}
