import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Server } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { checkCache, setCache } from "@/v2/utils/cache_handler";
import { logAndThrow, reportError } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { Server as HttpServer, IncomingMessage, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: "object",
      patternProperties: {
        "^[0-9]{1,2}$": {
          type: `object`,
          properties: {
            male: {
              type: `array`,
              items: {
                $ref: "jerseyBidInfo",
              },
              additionalProperties: false,
            },
            female: {
              type: `array`,
              items: {
                $ref: "jerseyBidInfo",
              },
            },
            quota: {
              type: `object`,
              properties: {
                male: { type: `number` },
                female: { type: `number` },
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

async function getJerseyInfo(jersey: iJersey, currentRound: number, session: MongoSession) {
  const bidders = await JerseyBid.find({ jersey: jersey._id, round: currentRound }).session(session.session);
  const users = logAndThrow(
    await Promise.allSettled(
      bidders.map((bidder) =>
        JerseyBidInfo.findOne({ user: bidder.user })
          .populate<{ user: iUser }>("user", "gender room")
          .orFail()
          .session(session.session),
      ),
    ),
    `Bidder info retrieval error`,
  );

  const male = users
    .filter((user) => user.user.gender === `male`)
    .sort((a, b) => b.points - a.points)
    .map(({ user, points, round }) => ({ user, points, round }));
  const female = users
    .filter((user) => user.user.gender === `female`)
    .sort((a, b) => b.points - a.points)
    .map(({ user, points, round }) => ({ user, points, round }));

  const { quota } = jersey;
  return { male, female, quota };
}

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const jerseys = await Jersey.find().session(session.session);
    const currentRound = (await Server.findOne({ key: `jerseyBidRound` }).session(session.session).orFail())?.value;

    if (typeof currentRound !== `number`) {
      throw new Error("Unable to fetch round.");
    }

    const jerseyData = logAndThrow(
      await Promise.allSettled(
        jerseys.map(async (jersey) => {
          const info = await getJerseyInfo(jersey, currentRound, session);
          return { number: jersey.number, info };
        }),
      ),
      `Jersey info parsing error`,
    );

    const data = jerseyData.reduce((a, v) => ({ ...a, [v.number]: v.info }), {});
    return await success(res, data);
  } catch (error) {
    reportError(error, `Jersey Info handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const list: RouteOptions<HttpServer, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/list`,
  schema,
  preHandler: checkCache,
  handler,
  onSend: setCache,
};

export { list };
