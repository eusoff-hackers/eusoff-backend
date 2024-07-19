import { User } from "@/v2/models/user";
import * as auth from "@/v2/utils/auth";
import { logEvent, reportError } from "@/v2/utils/logger";
import { sendError, sendStatus } from "@/v2/utils/req_handler";
import { oauthController } from "@/v2/utils/sso";
import type { OIDCAuthzResponsePayload } from "@boxyhq/saml-jackson";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";

async function handler(req: FastifyRequest<{ Querystring: OIDCAuthzResponsePayload }>, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const { code } = req.query;

    if (!code) {
      return sendStatus(res, 400, `Invalid url.`);
    }

    const body = {
      code,
      client_id: `tenant=${process.env.SSO_TENANT}&product=${process.env.SSO_PRODUCT}`,
      client_secret: `dummy`,
      grant_type: `authorization_code` as `authorization_code`,
      redirect_uri: `${process.env.BACKEND_URL}/sso/callback`,
    };

    const { access_token: token } = await oauthController.token(body);

    const profile = await oauthController.userInfo(token);

    const user = (await User.findOne({
      username: profile.id.toLowerCase(),
    }).session(session.session))!;

    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/unauthorized?username=${profile.id}`);
    }

    await auth.login(user, req);
    await logEvent(`USER LOGIN`, session, user._id);

    return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    reportError(error, `SSO callback error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const callback: RouteOptions<Server, IncomingMessage, ServerResponse, { Querystring: OIDCAuthzResponsePayload }> = {
  method: `GET`,
  url: `/callback`,
  handler,
};

export { callback };
