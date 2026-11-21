/**
 * The narrator's voice: each character tells its clip in its own voice,
 * spoken by Piper (open-source, offline text-to-speech). A line is made
 * before it's played, so the clip can wait exactly as long as it's spoken.
 *
 * Piper and its voices are installed by the daily job; locally, set
 * SHOWCASE_VOICES to a folder holding the .onnx voice files.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Line {
  file: string;
  /** Seconds of speech. */
  seconds: number;
}

/** Seconds of audio in a 16-bit mono WAV file. */
export function wavSeconds(file: string): number {
  const buf = readFileSync(file);
  const rate = buf.readUInt32LE(24);
  const channels = buf.readUInt16LE(22);
  const bits = buf.readUInt16LE(34);
  // The data chunk follows the header; find it rather than assume 44 bytes.
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') return size / (rate * channels * (bits / 8));
    off += 8 + size;
  }
  return 0;
}

export class Voice {
  private n = 0;
  constructor(
    /** The voice model (.onnx) to speak with. */
    readonly model: string,
    /** Where the spoken lines are written. */
    readonly outDir: string,
    readonly prefix: string,
  ) {}

  static model(name: string) {
    return join(process.env.SHOWCASE_VOICES ?? 'voices', `${name}.onnx`);
  }

  /** Speak a line into a WAV file. */
  say(text: string): Line {
    const file = join(this.outDir, `${this.prefix}-line-${String(++this.n).padStart(2, '0')}.wav`);
    execFileSync(
      'python3',
      ['-m', 'piper', '-m', this.model, '-f', file, '--sentence_silence', '0.15'],
      {
        input: text,
        stdio: ['pipe', 'ignore', 'pipe'],
      },
    );
    return { file, seconds: wavSeconds(file) };
  }
}
