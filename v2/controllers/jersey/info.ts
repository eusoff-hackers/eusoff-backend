import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import type { iJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Server } from "@/v2/models/server";
import { auth } from "@/v2/plugins/auth";
import { checkUserLegible } from "@/v2/utils/jersey";
import { logAndThrow, reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { Server as HttpServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";

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
        system: {
          type: `object`,
          properties: {
            bidOpen: { type: `number` },
            bidClose: { type: `number` },
            bidRound: { type: `number` },
          },
          additionalProperties: false,
        },
        canBid: { type: `boolean` },
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
      JerseyBidInfo.findOne({ user: user._id })
        .populate(`jersey`)
        .populate({ path: "teams", populate: "team" })
        .lean()
        .session(session.session),
      JerseyBid.find({ user: user._id }).select("-user").populate(`jersey`).session(session.session),
      Server.findOne({ key: `jerseyBidOpen` }).session(session.session),
      Server.findOne({ key: `jerseyBidClose` }).session(session.session),
      Server.findOne({ key: `jerseyBidRound` }).session(session.session),
    ]);
    const info: Partial<iJerseyBidInfo> | null = logAndThrow([p[0]], `Bid info retrieval error`)[0];
    const bidOpen = logAndThrow([p[2]], `BidOpen parse error`)[0]?.value;
    const bidClose = logAndThrow([p[3]], `BidClose parse error`)[0]?.value;
    const bidRound = logAndThrow([p[4]], `BidClose parse error`)[0]?.value;
    const bids = logAndThrow([p[1]], `Bids parse error`)[0].filter((bid) => bid.round === bidRound);
    const canBid = await checkUserLegible(user, session);

    delete info?.user;

    return await success(res, { info, bids, system: { bidOpen, bidClose, bidRound }, canBid });
  } catch (error) {
    reportError(error, `Bid Info handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const info: RouteOptions<HttpServer, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/info`,
  schema,
  preHandler: auth,
  handler,
};

export { info };
