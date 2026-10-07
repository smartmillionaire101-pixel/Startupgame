/**
 * Read the Overture Maps buildings export of overture.py (newline-delimited
 * JSON, one building or building part per line) into footprints, streaming,
 * so a city of a million buildings never sits in memory as text.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { buildingsFromOverture } from './buildings.mjs';

/**
 * → { buildings, rows, bad }: footprints in the local frame (see
 * buildings.mjs), the number of lines read and the number that failed to parse.
 */
export async function readOverture(file, proj, bounds, core) {
  const buildings = [];
  let rows = 0;
  let bad = 0;
  let batch = [];
  const flush = () => {
    for (const b of buildingsFromOverture(batch, proj, bounds, core)) buildings.push(b);
    batch = [];
  };
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows++;
    try {
      batch.push(JSON.parse(line));
    } catch {
      bad++;
    }
    if (batch.length >= 5000) flush();
  }
  flush();
  return { buildings, rows, bad };
}
