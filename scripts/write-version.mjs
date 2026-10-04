/**
 * Writes version.json into a build folder so deploy checks can tell which
 * commit a live site is serving. Netlify sets COMMIT_REF during builds.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const commit = process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? 'local';
writeFileSync(
  join(dir, 'version.json'),
  JSON.stringify({ commit, builtAt: new Date().toISOString() }),
);
console.log(`version.json: ${commit}`);
