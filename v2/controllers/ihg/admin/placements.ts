import { Hall } from "@/v2/models/hall";
import type { iIhgPlacement } from "@/v2/models/ihgPlacement";
import { IhgPlacement } from "@/v2/models/ihgPlacement";
import { IhgSport } from "@/v2/models/ihgSport";
import { admin } from "@/v2/plugins/auth";
import { logAndThrow, logEvent, reportError } from "@/v2/utils/logger";
import { sendError, sendStatus } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { IncomingMessage, Server, ServerResponse } from "http";
import type { FromSchema } from "json-schema-to-ts";

const schema = {
  body: {
    type: `array`,
    items: {
      $ref: `ihgPlacement`,
    },
    additionalProperties: false,
  },
} as const;

type iPlacements = FromSchema<typeof schema.body>;
type iBody = Omit<iPlacements, keyof iIhgPlacement[]> & iIhgPlacement[];

async function handler(req: FastifyRequest<{ Body: iBody }>, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const placements = req.body;

    const exists = logAndThrow(
      await Promise.allSettled(
        placements.map(async (p) => {
          if (
            !(
              (await Hall.exists({ _id: p.hall._id }).session(session.session)) &&
              (await IhgSport.exists({ _id: p.sport._id }).session(session.session))
            )
          ) {
            return false;
          }

          return true;
        }),
      ),
      `IHG placement validator`,
    );

    if (exists.includes(false)) {
      return await sendStatus(res, 400, `Invalid ID(s).`);
    }

    const converted = placements.map((p) => ({
      hall: p.hall._id,
      sport: p.sport._id,
      place: p.place,
    }));

    await IhgPlacement.deleteMany({}).session(session.session);
    await IhgPlacement.create(converted, { session: session.session });

    await logEvent(`ADMIN EDIT IHG PLACEMENTS`, session, JSON.stringify(converted), req.session.get(`user`)!._id);

    try {
      await session.commit();
    } catch (error) {
      reportError(error, `IHG placement save transaction commit error.`);
      await session.abort();
      return await sendStatus(res, 429, `Try again in a few moments`);
    }

    return await sendStatus(res, 200, `IHG placement saved.`);
  } catch (error) {
    reportError(error, `IHG placement save handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const placements: RouteOptions<Server, IncomingMessage, ServerResponse, { Body: iBody }> = {
  method: `POST`,
  url: `/placements`,
  schema,
  preHandler: admin,
  handler,
};

export { placements };
