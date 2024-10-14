import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { Server } from "@/v2/models/server";
import { auth } from "@/v2/plugins/auth";
import { isEligible } from "@/v2/utils/jersey";
import { logAndThrow, logEvent, reportError } from "@/v2/utils/logger";
import { sendError, sendStatus } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { Server as HttpServer, IncomingMessage, ServerResponse } from "http";
import type { FromSchema } from "json-schema-to-ts";

const schema = {
  body: {
    type: `object`,
    required: [`bids`],
    properties: {
      bids: {
        type: `array`,
        maxItems: 5,
        uniqueItems: true,
        items: {
          $ref: `jersey`,
        },
      },
    },
    additionalProperties: false,
  },
} as const;

type iBids = FromSchema<typeof schema.body>;
type iBody = Omit<iBids, keyof { bids: iJersey[] }> & { bids: iJersey[] };

async function handler(req: FastifyRequest<{ Body: iBody }>, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const user = req.session.get(`user`)!;

    let jerseys: iJersey[];

    try {
      jerseys = logAndThrow(
        await Promise.allSettled(
          req.body.bids.map(async (j) => await Jersey.findOne({ number: j.number }).orFail().session(session.session)),
        ),
        `Jersey parsing error`,
      );
    } catch (error) {
      return await sendStatus(res, 400, `Invalid number(s).`);
    }

    if (!(await isEligible(user, jerseys, session))) {
      return await sendStatus(res, 400, `Ineligible to bid requested numbers.`);
    }

    const currentRound = (await Server.findOne({ key: `jerseyBidRound` }).orFail().session(session.session))?.value;

    const newBids = jerseys.map((jersey, index) => ({
      user: user._id,
      jersey: jersey._id,
      priority: index,
      round: currentRound,
    }));

    await JerseyBid.deleteMany({ user: user._id, round: currentRound }).session(session.session);
    await JerseyBid.create(newBids, { session: session.session });

    await logEvent(`USER PLACE BIDS`, session, JSON.stringify(newBids), user._id);

    try {
      await session.commit();
    } catch (error) {
      reportError(error, `Bid create transaction commit error.`);
      await session.abort();
      return await sendStatus(res, 429, `Try again in a few moments`);
    }

    return await sendStatus(res, 200, `Bid saved.`);
  } catch (error) {
    reportError(error, `Bid Creation handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const bid: RouteOptions<HttpServer, IncomingMessage, ServerResponse, { Body: iBody }> = {
  method: `POST`,
  url: `/bid`,
  schema,
  preHandler: auth,
  handler,
};

export { bid };
