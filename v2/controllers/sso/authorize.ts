import { reportError } from "@/v2/utils/logger";
import { sendError } from "@/v2/utils/req_handler";
import { oauthController } from "@/v2/utils/sso";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

async function handler(req: FastifyRequest, res: FastifyReply) {
  try {
    const body = {
      response_type: "code" as const,
      client_id: `tenant=${process.env.SSO_TENANT}&product=${process.env.SSO_PRODUCT}`,
      redirect_uri: `${process.env.BACKEND_URL}/sso/callback`,
      state: "a-random-state-value",
      code_challenge: "",
      code_challenge_method: "" as const,
    };

    const { redirect_url: redirectUrl } = await oauthController.authorize(body);

    if (!redirectUrl) {
      throw new Error(`Null redirect url.`);
    }
    return res.redirect(redirectUrl);
  } catch (error) {
    reportError(error, `SSO authorize handler error`);
    return sendError(res);
  } finally {
    await req.session.get(`session`)?.end();
  }
}

const authorize: RouteOptions<Server, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/authorize`,
  handler,
};

export { authorize };
