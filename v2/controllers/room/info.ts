import type { iRoomBidInfo } from "@/v2/models/roomBidInfo";
import { RoomBidInfo } from "@/v2/models/roomBidInfo";
import type { iServer } from "@/v2/models/server";
import { Server } from "@/v2/models/server";
import { auth } from "@/v2/utils/auth";
import { logAndThrow, reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, ServerResponse, Server as httpServer } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `object`,
      properties: {
        info: {
          $ref: `roomBidInfo`,
        },
        system: {
          type: `object`,
          properties: {
            bidOpen: { type: `number` },
            bidClose: { tyhpe: `number` },
          },
          additionalProperties: false,
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

    const [info, bidOpen, bidClose]: [iRoomBidInfo | null, iServer | null, iServer | null] = logAndThrow<
      iServer | iRoomBidInfo | null
    >(
      await Promise.allSettled([
        RoomBidInfo.findOne({ user: user._id }).session(session.session).lean(),
        Server.findOne({ key: `roomBidOpen` }).session(session.session),
        Server.findOne({ key: `roomBidClose` }).session(session.session),
      ]),
      `Getting server config error`,
    ) as [iRoomBidInfo | null, iServer | null, iServer | null];

    if (!bidOpen || !bidClose) {
      throw new Error(`Server variables unavailable`);
    }

    if (info) {
      info.user = undefined;
      const curDate = Date.now();
      info.canBid = info.isEligible && (bidOpen.value as number) <= curDate && curDate <= (bidClose.value as number);
    }

    return await success(res, {
      info,
      system: {
        bidOpen: bidOpen.value as number,
        bidClose: bidClose.value as number,
      },
    });
  } catch (error) {
    reportError(error, `Bid Info handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const info: RouteOptions<httpServer, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/info`,
  schema,
  preHandler: auth,
  handler,
};

export { info };
