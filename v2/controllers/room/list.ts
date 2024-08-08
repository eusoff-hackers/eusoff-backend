import { Room } from "@/v2/models/room";
import { RoomBid } from "@/v2/models/roomBid";
import { RoomBlock } from "@/v2/models/roomBlock";
import { checkCache, setCache } from "@/v2/utils/cache_handler";
import { logAndThrow, reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `object`,
      properties: {
        rooms: {
          type: `array`,
          items: {
            $ref: `room`,
          },
        },
        blocks: {
          type: `array`,
          items: {
            $ref: `roomBlock`,
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
    const rooms = await Room.find()
      .populate({
        path: `bidders`,
        select: `user info -room`,
        populate: [`user`, { path: `info`, select: `isEligible points -user` }],
      })
      .sort({ block: 1, number: 1 })
      .session(session.session)
      .lean();

    const blocks = logAndThrow(
      await Promise.allSettled(
        (await RoomBlock.find().session(session.session).lean()).map(async (b) => {
          const currentRooms = (await Room.find({ block: b.block }).session(session.session)).map((r) => r._id);
          return {
            ...b,
            bidderCount: await RoomBid.countDocuments({
              room: { $in: currentRooms },
            }).session(session.session),
          };
        }),
      ),
      `Block retrieve`,
    );

    return await success(res, { rooms, blocks });
  } catch (error) {
    reportError(error, `Room list handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const list: RouteOptions<Server, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/list`,
  schema,
  preHandler: checkCache,
  handler,
  onSend: setCache,
};

export { list };
