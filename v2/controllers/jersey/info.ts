import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { auth } from "@/v2/plugins/auth";
import { logAndThrow, reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `object`,
      properties: {
        info: {
          $ref: `jerseyBidInfo`,
        },
        bids: {
          type: `array`,
          maxItems: 5,
          items: {
            $ref: `jerseyBid`,
          },
        },
      },
      additionalProperties: false,
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const user = req.session.get(`user`)!;

    const p = await Promise.allSettled([
      JerseyBidInfo.findOne({ user: user._id }).populate(`jersey`).session(session.session),
      JerseyBid.find({ user: user._id }).populate(`jersey`).session(session.session),
    ]);
    const info = logAndThrow([p[0]], `Bid info retrieval error`)[0];
    const bids = logAndThrow([p[1]], `Bids parse error`)[0];

    return await success(res, { info, bids });
  } catch (error) {
    reportError(error, `Bid Info handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const info: RouteOptions<Server, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/info`,
  schema,
  preHandler: auth,
  handler,
};

export { info };
