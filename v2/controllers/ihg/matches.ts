import { IhgMatch } from "@/v2/models/ihgMatch";
import { reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `array`,
      items: {
        $ref: `ihgMatch`,
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const matches = await IhgMatch.find({ timestamp: { $gt: new Date() } })
      .populate(`red`)
      .populate(`blue`)
      .populate(`sport`)
      .session(session.session);
    return await success(res, matches);
  } catch (error) {
    reportError(error, `IHG matches handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const matches: RouteOptions<Server, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/matches`,
  schema,
  handler,
};

export { matches };
