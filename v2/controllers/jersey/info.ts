import type { FastifyRequest, FastifyReply, RouteOptions } from 'fastify';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { success, sendError, resBuilder } from '@/v2/utils/req_handler';
import { reportError, logAndThrow } from '@/v2/utils/logger';
import type { iJersey } from '@/v2/models/jersey';
import { Jersey } from '@/v2/models/jersey';
import type { MongoSession } from '@/v2/utils/mongoSession';
import { Bid } from '@/v2/models/bid';
import { BiddingInfo } from '@/v2/models/biddingInfo';
import { setCache, checkCache } from '@/v2/utils/cache_handler';
import type { iUser } from '@/v2/models/user';

const schema = {
  response: {
    200: resBuilder({
      type: 'object',
      patternProperties: {
        '^[0-9]{1,2}$': {
          type: `object`,
          properties: {
            Male: {
              type: `array`,
              items: {
                $ref: 'biddingInfo',
              },
              additionalProperties: false,
            },
            Female: {
              type: `array`,
              items: {
                $ref: 'biddingInfo',
              },
            },
            quota: {
              type: `object`,
              properties: {
                Male: { type: `number` },
                Female: { type: `number` },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    }),
  },
};

async function getJerseyInfo(jersey: iJersey, session: MongoSession) {
  const bidders = await Bid.find({ jersey: jersey._id }).session(
    session.session,
  );
  const users = logAndThrow(
    await Promise.allSettled(
      bidders.map((bidder) =>
        BiddingInfo.findOne({ user: bidder.user })
          .populate<{ user: iUser }>(`user`)
          .orFail()
          .session(session.session),
      ),
    ),
    `Bidder info retrieval error`,
  );

  const Male = users
    .filter((user) => user.user.gender === `Male`)
    .sort((a, b) => b.points - a.points)
    .map(({ user, points, round }) => ({ user, points, round }));
  const Female = users
    .filter((user) => user.user.gender === `Female`)
    .sort((a, b) => b.points - a.points)
    .map(({ user, points, round }) => ({ user, points, round }));

  const { quota } = jersey;
  return { Male, Female, quota };
}

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const jerseys = await Jersey.find().session(session.session);
    const jerseyData = logAndThrow(
      await Promise.allSettled(
        jerseys.map(async (jersey) => {
          const info = await getJerseyInfo(jersey, session);
          return { number: jersey.number, info };
        }),
      ),
      `Jersey info parsing error`,
    );

    const data = jerseyData.reduce(
      (a, v) => ({ ...a, [v.number]: v.info }),
      {},
    );
    return await success(res, data);
  } catch (error) {
    reportError(error, `Jersey Info handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const info: RouteOptions<
  Server,
  IncomingMessage,
  ServerResponse,
  Record<string, never>
> = {
  method: `GET`,
  url: `/info`,
  schema,
  preHandler: checkCache,
  handler,
  onSend: setCache,
};

export { info };
