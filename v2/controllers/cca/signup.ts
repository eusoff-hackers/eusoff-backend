import { Cca } from "@/v2/models/cca/cca";
import type { iCca } from "@/v2/models/cca/cca";
import { CcaInfo } from "@/v2/models/cca/ccaInfo";
import type { iCcaInfo } from "@/v2/models/cca/ccaInfo";
import type { iCcaSignup } from "@/v2/models/cca/ccaSignup";
import { CcaSignup } from "@/v2/models/cca/ccaSignup";
import { CcaSubcommittee } from "@/v2/models/cca/ccaSubcommittee";
import { Server } from "@/v2/models/server";
import { auth } from "@/v2/plugins/auth";
import { logAndThrow, logEvent, reportError } from "@/v2/utils/logger";
import { sendError, sendStatus } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { Server as HttpServer, IncomingMessage, ServerResponse } from "http";
import type { FromSchema } from "json-schema-to-ts";
import { ObjectId } from "mongodb";

const schema = {
  body: {
    type: `object`,
    required: [`info`, `signups`],
    properties: {
      info: {
        $ref: `ccaInfo`,
      },
      signups: {
        type: `array`,
        items: {
          $ref: `ccaSignup`,
        },
      },
    },
    additionalProperties: false,
  },
} as const;

type iSchema = FromSchema<typeof schema.body>;
type iBody = Omit<iSchema, keyof { info: iCcaInfo; ccas: iCca[] }> & {
  info: iCcaInfo;
  signups: iCcaSignup[];
};

async function handler(req: FastifyRequest<{ Body: iBody }>, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const isOpen = (await Server.findOne({ key: `ccaOpen` }).session(session.session))?.value;

    if (!isOpen) {
      return await sendStatus(res, 403, `CCA registration not open.`);
    }

    if (
      req.body.signups.some(
        (s) => !ObjectId.isValid(s.cca._id) || s.subcommittees.some((sub) => !ObjectId.isValid(sub._id)),
      )
    ) {
      return await sendStatus(res, 401, `Invalid id(s).`);
    }

    const user = req.session.get(`user`)!;
    const ccas = await Cca.find({
      _id: { $in: req.body.signups.map((s) => s.cca._id) },
    }).session(session.session);
    const info = {
      user: user._id,
      ...req.body.info,
    };

    if (ccas.length !== req.body.signups.length) {
      return await sendStatus(res, 400, `Invalid CCA id(s).`);
    }

    const validSubcommittees = logAndThrow(
      await Promise.allSettled(
        req.body.signups.map(async (signup) => {
          const subcommittees = await CcaSubcommittee.find({
            _id: { $in: signup.subcommittees.map((s) => s._id) },
            cca: signup.cca._id,
          }).session(session.session);

          if (subcommittees.length !== signup.subcommittees.length) return false;
          return true;
        }),
      ),
      `CCA signup subcommittee parse`,
    );

    if (validSubcommittees.some((s) => !s)) {
      return await sendStatus(res, 400, `Invalid subcommittee(s).`);
    }

    const newSignups = req.body.signups.map((c) => ({ user: user._id, ...c }));

    await CcaSignup.deleteMany({ user: user._id }).session(session.session);
    await CcaInfo.deleteOne({ user: user._id }).session(session.session);

    await CcaSignup.create(newSignups, { session: session.session });
    await CcaInfo.create([info], { session: session.session });

    await logEvent(`USER SIGNUP CCA`, session, JSON.stringify({ signups: newSignups, info }), user._id);

    try {
      await session.commit();
    } catch (error) {
      reportError(error, `CCA signup transaction commit error.`);
      await session.abort();
      return await sendStatus(res, 429, `Try again in a few moments`);
    }

    return await sendStatus(res, 200, `CCA signup saved.`);
  } catch (error) {
    reportError(error, `CCA signup handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const signup: RouteOptions<HttpServer, IncomingMessage, ServerResponse, { Body: iBody }> = {
  method: `POST`,
  url: `/signup`,
  schema,
  preHandler: auth,
  handler,
};

export { signup };
