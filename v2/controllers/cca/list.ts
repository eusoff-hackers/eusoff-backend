import { Cca } from "@/v2/models/cca/cca";
import { reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `array`,
      items: {
        $ref: `cca`,
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const ccas = await Cca.find().populate("subcommittees").session(session.session);
    return await success(res, ccas);
  } catch (error) {
    reportError(error, `Cca list handler error`);
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
