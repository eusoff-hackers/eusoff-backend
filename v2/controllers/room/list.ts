import { Room } from "@/v2/models/room";
import { reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `array`,
      items: {
        $ref: `room`,
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const rooms = await Room.find().session(session.session);
    return await success(res, rooms);
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
  handler,
};

export { list };
