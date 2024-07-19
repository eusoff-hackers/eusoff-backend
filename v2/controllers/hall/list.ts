import { Hall } from "@/v2/models/hall";
import { reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `array`,
      items: {
        $ref: `hall`,
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const hall = await Hall.find().session(session.session);
    return await success(res, hall);
  } catch (error) {
    reportError(error, `Hall list handler error`);
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
