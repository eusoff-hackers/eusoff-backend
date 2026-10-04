import * as auth from "@/v2/plugins/auth";
import { reportError } from "@/v2/utils/logger";
import { sendError, sendStatus } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

async function handler(req: FastifyRequest, res: FastifyReply) {
  try {
    await req.session.get(`session`)?.end();
    await auth.logout(req);
    return await sendStatus(res, 200, `Logged out.`);
  } catch (error) {
    reportError(error, `Logout handler error`);
    return sendError(res);
  }
}

const logout: RouteOptions<Server, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `POST`,
  url: `/logout`,
  handler,
};

export { logout };
