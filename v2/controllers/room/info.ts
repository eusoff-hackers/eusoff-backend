import { RoomBid } from "@/v2/models/roomBid";
import { RoomBidInfo, type iRoomBidInfo } from "@/v2/models/roomBidInfo";
import { Server, type iServer } from "@/v2/models/server";
import { auth } from "@/v2/plugins/auth";
import { logAndThrow, reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import { isEligible } from "@/v2/utils/room";
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
        bids: {
          type: `array`,
          items: {
            $ref: `roomBid`,
          },
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
        RoomBidInfo.findOne({ user: user._id }).select(`-user`).session(session.session).populate(`room`).lean(),
        Server.findOne({ key: `roomBidOpen` }).session(session.session),
        Server.findOne({ key: `roomBidClose` }).session(session.session),
      ]),
      `Getting server config error`,
    ) as [iRoomBidInfo | null, iServer | null, iServer | null];

    if (!bidOpen || !bidClose) {
      throw new Error(`Server variables unavailable`);
    }

    if (info) {
      info.canBid = await isEligible(user, session);
    }

    const bids = await RoomBid.find({ user: user._id })
      .select(`-user`)
      .populate(`room`)
      .session(session.session)
      .lean();

    return await success(res, {
      info,
      bids,
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
