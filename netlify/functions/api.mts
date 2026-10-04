/** The Runway HTTP API as a Netlify Function (see apps/server/src/serverless/netlify.ts). */
import type { Config, Context } from '@netlify/functions';
import { configFor, createRuntime, handle, kvFor, type Runtime } from '../runtime/runtime.mjs';

let runtime: Promise<Runtime> | undefined;

export default async (req: Request, context: Context) => {
  runtime ??= (async () => {
    const kv = kvFor(context.deploy);
    return createRuntime(kv, await configFor(kv, context.deploy));
  })();
  try {
    return await handle(await runtime, req, context.ip);
  } catch (err) {
    // Rebuild on the next request rather than keep a broken instance.
    runtime = undefined;
    console.error('api failed', err);
    return Response.json(
      { error: { code: 'error', message: 'Something went wrong.' } },
      { status: 500 },
    );
  }
};

export const config: Config = { path: '/api/*' };
