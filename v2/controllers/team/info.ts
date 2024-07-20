import { Member } from "@/v2/models/member";
import { auth } from "@/v2/plugins/auth";
import { reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: `object`,
      properties: {
        teams: {
          type: `array`,
          items: {
            $ref: `team`,
          },
        },
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const user = req.session.get(`user`)!;

    const teams = (await Member.find({ user: user._id }).lean().populate(`team`).session(session.session)).map(
      (team) => team.team,
    );
    return await success(res, { teams });
  } catch (error) {
    reportError(error, `Team info handler error`);
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
