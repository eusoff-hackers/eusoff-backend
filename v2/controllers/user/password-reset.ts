import { User } from "@/v2/models/user";
import { auth } from "@/v2/plugins/auth";
import { reportError } from "@/v2/utils/logger";
import { sendError, sendStatus } from "@/v2/utils/req_handler";
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";
import type { FromSchema } from "json-schema-to-ts";

const schema = {
  body: {
    type: `object`,
    required: [`credentials`],
    properties: {
      credentials: {
        type: `object`,
        additionalProperties: false,
        required: [`password`],
        properties: {
          password: { type: `string` },
        },
      },
    },
  },
} as const;

type iBody = FromSchema<typeof schema.body>;

async function handler(req: FastifyRequest<{ Body: iBody }>, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const {
      credentials: { password },
    } = req.body;

    const user = req.session.get(`user`)!;

    await User.findOneAndUpdate({ _id: user._id }, { password: await bcrypt.hash(password, 10) }).session(
      session.session,
    );

    try {
      await session.commit();
    } catch (error) {
      await session.abort();
      return await sendStatus(res, 429, `Please wait for a while before making another request.`);
    }

    return await sendStatus(res, 200, `Saved!`);
  } catch (error) {
    reportError(error, `Password Reset handler error.`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const passwordReset: RouteOptions<Server, IncomingMessage, ServerResponse, { Body: iBody }> = {
  method: `POST`,
  url: `/password-reset`,
  schema,
  preHandler: auth,
  handler,
};

export { passwordReset };
