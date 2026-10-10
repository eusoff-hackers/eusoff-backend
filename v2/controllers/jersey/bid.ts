import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { Server } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { auth } from "@/v2/plugins/auth";
import { isEligible } from "@/v2/utils/jersey";
import { logEvent, reportError } from "@/v2/utils/logger";
import { MongoSession, isTransientTxnError } from "@/v2/utils/mongoSession";
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

const MAX_ATTEMPTS = 5;

/** Replace the user's bids for the current round. Returns an error status/message, or null on success. */
async function saveBids(user: iUser, numbers: number[], session: MongoSession): Promise<[number, string] | null> {
  // Only a genuinely unknown number is the client's fault; DB errors (e.g. write conflicts) propagate.
  const found = await Jersey.find({ number: { $in: numbers } }).session(session.session);
  const byNumber = new Map(found.map((j) => [j.number, j]));
  if (numbers.some((n) => !byNumber.has(n))) return [400, `Invalid number(s).`];
  const jerseys: iJersey[] = numbers.map((n) => byNumber.get(n)!);

  if (!(await isEligible(user, jerseys, session))) {
    return [400, `Ineligible to bid requested numbers.`];
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
  return null;
}

async function handler(req: FastifyRequest<{ Body: iBody }>, res: FastifyReply) {
  let session = req.session.get(`session`)!;
  try {
    const user = req.session.get(`user`)!;
    const numbers = req.body.bids.map((j) => j.number);

    // A double-tapped submit (or two devices) makes concurrent transactions on the same user's bids;
    // the loser gets a transient write conflict, so retry it on a fresh transaction.
    for (let attempt = 1; ; attempt += 1) {
      try {
        const failure = await saveBids(user, numbers, session);
        if (failure) return await sendStatus(res, failure[0], failure[1]);
        await session.commit();
        return await sendStatus(res, 200, `Bid saved.`);
      } catch (error) {
        if (!isTransientTxnError(error) || attempt >= MAX_ATTEMPTS) throw error;
        await session.abort().catch(() => {});
        await session.end();
        session = new MongoSession();
        await session.start();
        await new Promise((resolve) => {
          setTimeout(resolve, 20 * attempt + Math.random() * 50);
        });
      }
    }
  } catch (error) {
    if (isTransientTxnError(error)) return sendStatus(res, 429, `Try again in a few moments`);
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
