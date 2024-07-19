import type { FastifyRequest, FastifyReply, RouteOptions } from 'fastify';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import type { SAMLResponsePayload } from '@boxyhq/saml-jackson';
import { oauthController } from '@/v2/utils/sso';
import { reportError } from '@/v2/utils/logger';
import { sendError } from '@/v2/utils/req_handler';

async function handler(
  req: FastifyRequest<{ Body: SAMLResponsePayload }>,
  res: FastifyReply,
) {
  try {
    const { SAMLResponse, RelayState } = req.body;

    const body = {
      SAMLResponse,
      RelayState,
    };

    const { redirect_url: redirectUrl } =
      await oauthController.samlResponse(body);

    if (!redirectUrl) {
      throw new Error(`Null redirect url.`);
    }
    return res.redirect(redirectUrl);
  } catch (error) {
    reportError(error, `SSO acs error`);
    return sendError(res);
  } finally {
    await req.session.get(`session`)?.end();
  }
}

const acs: RouteOptions<
  Server,
  IncomingMessage,
  ServerResponse,
  { Body: SAMLResponsePayload }
> = {
  method: `POST`,
  url: `/acs`,
  handler,
};

export { acs };
