import { User } from "@/v2/models/user";
import * as auth from "@/v2/utils/auth";
import { logEvent, reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, sendStatus, success } from "@/v2/utils/req_handler";
import * as bcrypt from "bcryptjs";
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
        required: [`username`, `password`],
        properties: {
          username: { type: `string` },
          password: { type: `string` },
        },
      },
    },
  },
  response: {
    200: resBuilder({
      type: `object`,
      properties: {
        user: {
          $ref: `user`,
        },
      },
    }),
  },
} as const;

type iBody = FromSchema<typeof schema.body>;

async function handler(req: FastifyRequest<{ Body: iBody }>, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const {
      credentials: { username, password },
    } = req.body;

    if (!(await User.exists({ username }).session(session.session))) {
      return await sendStatus(res, 401, `Invalid credentials.`);
    }
    const user = (await User.findOne({ username }).session(session.session))!;

    if (!(await bcrypt.compare(password, user.password))) {
      return sendStatus(res, 401, `Invalid credentials.`);
    }

    await auth.login(user, req);

    await logEvent(`USER LOGIN`, session, user._id);

    try {
      await session.commit();
    } catch (error) {
      reportError(error, `Login Transaction commit error`);
      await session.abort();
    }
    return await success(res, { user });
  } catch (error) {
    reportError(error, `Error login handler`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const login: RouteOptions<Server, IncomingMessage, ServerResponse, { Body: iBody }> = {
  method: `POST`,
  url: `/login`,
  schema,
  handler,
};

export { login };
