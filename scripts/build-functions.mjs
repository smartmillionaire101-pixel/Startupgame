/**
 * Bundles the server runtime for Netlify Functions into one self-contained
 * ES module (netlify/runtime/runtime.mjs): the engine, Fastify and every
 * other dependency inlined. Netlify copies function dependencies as they
 * are, and the engine is a TypeScript workspace package it can't run, so we
 * hand it plain JavaScript instead. The function entry files stay small so
 * Netlify can still read their route and schedule config.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/server/src/serverless/netlify.ts'],
  outfile: 'netlify/runtime/runtime.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: 'inline',
  legalComments: 'none',
  logLevel: 'warning',
  // CommonJS dependencies (Fastify, pino) call require(); give ES modules one.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
console.log('netlify/runtime/runtime.mjs built');
