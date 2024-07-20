import { auth } from "@/v2/plugins/auth";
import { getEligible } from "@/v2/utils/jersey";
import { reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      jerseys: {
        type: `array`,
        uniqueItems: true,
        items: {
          $ref: `jersey`,
        },
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const user = req.session.get(`user`)!;
    const jerseys = await getEligible(user, session);

    return await success(res, { jerseys });
  } catch (error) {
    reportError(error, `Jersey Eligible handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const eligible: RouteOptions<Server, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/eligible`,
  schema,
  preHandler: auth,
  handler,
};

export { eligible };
