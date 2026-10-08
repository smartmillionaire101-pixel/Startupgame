/**
 * Wave 12 §A: a game in play, polled about once a second by each player's
 * phone (`GET /api/games/:id`). Small and cheap: only that game, as the
 * viewer may see it (never an open question's answer or an opponent's
 * secret move), with an ETag so an unchanged answer is an empty 304.
 *
 * The server is the authority: when the rules say a game is over (the last
 * question's time is up, a shot clock ran out), this route settles it right
 * there with `game.finish` as the viewer, so the pot is paid without anyone
 * having to claim it.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { gameView } from '@runway/engine';
import type { Game } from './game.js';

export function registerGames(
  app: FastifyInstance,
  deps: {
    game: Game;
    now: () => number;
    requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  },
) {
  const { game, now } = deps;
  app.get(
    '/api/games/:id',
    {
      preHandler: deps.requireUser,
      config: {
        rateLimit: {
          max: 150,
          timeWindow: '1 minute',
          keyGenerator: (req: FastifyRequest) => (req.userId ? `g:${req.userId}` : req.ip),
        },
      },
    },
    async (req, reply) => {
      const { id } = z.object({ id: z.string().min(1).max(64) }).parse(req.params);
      let view = gameView(game.current, id, req.userId!, now());
      if (!view)
        return reply.code(404).send({ error: { code: 'game', message: 'That game isn’t on.' } });
      if (view.due && (view.youIn || view.youHost)) {
        const r = await game.execute(req.userId!, { type: 'game.finish', gameId: id });
        if (r.ok) view = gameView(game.current, id, req.userId!, now()) ?? view;
      }
      const json = JSON.stringify({ game: view });
      const tag = `"${createHash('sha1')
        .update(json.replace(/"serverNow":\d+/g, ''))
        .digest('base64url')}"`;
      reply.header('etag', tag).header('cache-control', 'private, no-cache');
      if (req.headers['if-none-match'] === tag) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(json);
    },
  );
}
