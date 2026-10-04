import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Server } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { auth } from "@/v2/plugins/auth";
import { checkCache, setCache } from "@/v2/utils/cache_handler";
import { reportError } from "@/v2/utils/logger";
import { resBuilder, sendError, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import type { Server as HttpServer, IncomingMessage, ServerResponse } from "http";

const schema = {
  response: {
    200: resBuilder({
      type: "object",
      patternProperties: {
        "^[0-9]{1,2}$": {
          type: `object`,
          properties: {
            male: {
              type: `array`,
              items: {
                $ref: "jerseyBidInfo",
              },
              additionalProperties: false,
            },
            female: {
              type: `array`,
              items: {
                $ref: "jerseyBidInfo",
              },
            },
            quota: {
              type: `object`,
              properties: {
                male: { type: `number` },
                female: { type: `number` },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    }),
  },
};

/**
 * Every number's bidders for the current round, split by gender and sorted by points.
 * Loads the round's bids and their bidders' info in two queries (this endpoint is polled by everyone).
 */
async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const currentRound = (await Server.findOne({ key: `jerseyBidRound` }).session(session.session).orFail())?.value;
    if (typeof currentRound !== `number`) {
      throw new Error("Unable to fetch round.");
    }

    const [jerseys, bids] = await Promise.all([
      Jersey.find().lean().session(session.session),
      JerseyBid.find({ round: currentRound }).select(`user jersey`).lean().session(session.session),
    ]);
    const infos = await JerseyBidInfo.find({ user: { $in: [...new Set(bids.map((b) => b.user.toString()))] } })
      .populate<{ user: iUser }>("user", "gender room")
      .populate({ path: "teams", populate: "team" })
      .select("-jersey -breakdown -captainOf -previousResident")
      .lean()
      .session(session.session);
    const infoBy = new Map(infos.map((i) => [i.user._id.toString(), i]));

    const biddersOf = new Map<string, typeof infos>();
    for (const b of bids) {
      const info = infoBy.get(b.user.toString());
      if (!info) continue;
      const key = b.jersey.toString();
      biddersOf.set(key, [...(biddersOf.get(key) ?? []), info]);
    }

    const data: Record<number, unknown> = {};
    for (const jersey of jerseys) {
      const users = biddersOf.get(jersey._id.toString()) ?? [];
      data[jersey.number] = {
        male: users.filter((u) => u.user.gender === `male`).sort((a, b) => b.points - a.points),
        female: users.filter((u) => u.user.gender === `female`).sort((a, b) => b.points - a.points),
        quota: jersey.quota,
      };
    }
    return await success(res, data);
  } catch (error) {
    reportError(error, `Jersey Info handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

/**
 * Residents only (rooms + teams of bidders are PDPA-sensitive). A cache hit replies before the
 * handler runs, so close the request's transaction here in that case.
 */
async function guard(req: FastifyRequest, res: FastifyReply) {
  if (!(await auth(req, res))) return;
  await checkCache(req, res);
  if (res.sent) await req.session.get(`session`)?.end();
}

const list: RouteOptions<HttpServer, IncomingMessage, ServerResponse, Record<string, never>> = {
  method: `GET`,
  url: `/list`,
  schema,
  preHandler: guard,
  handler,
  onSend: setCache,
};

export { list };
