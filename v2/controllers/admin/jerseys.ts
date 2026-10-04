import { HttpError, adminRoute } from "@/v2/controllers/admin/route";
import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBan } from "@/v2/models/jersey/jerseyBan";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import type { iTeam } from "@/v2/models/jersey/team";
import { Server } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { defaultQuota } from "@/v2/utils/jerseyAllocation";
import { logEvent } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";

async function currentRound(session: MongoSession) {
  const round = await Server.findOne({ key: `jerseyBidRound` }).session(session.session);
  return typeof round?.value === `number` ? round.value : 1;
}

async function loadJerseys(session: MongoSession, filter: Record<string, unknown> = {}) {
  const round = await currentRound(session);
  const [jerseys, holders, bans, bids] = await Promise.all([
    Jersey.find(filter).sort({ number: 1 }).lean().session(session.session),
    JerseyBidInfo.find({ isAllocated: true })
      .populate<{ user: iUser }>(`user`, `name username room gender`)
      .lean()
      .session(session.session),
    JerseyBan.find().populate<{ team: iTeam }>(`team`).lean().session(session.session),
    JerseyBid.find({ round }).populate<{ user: iUser }>(`user`, `gender`).lean().session(session.session),
  ]);

  return jerseys.map((j) => {
    const id = j._id.toString();
    const theseBids = bids.filter((b) => b.jersey.toString() === id);
    return {
      number: j.number,
      quota: j.quota,
      defaultQuota: defaultQuota(j.number),
      holders: holders
        .filter((h) => h.jersey?.toString() === id)
        .map((h) => ({
          name: h.user.name ?? h.user.username,
          room: h.user.room,
          gender: h.user.gender,
          round: h.allocatedRound ?? null,
        })),
      bids: {
        male: theseBids.filter((b) => b.user.gender === `male`).length,
        female: theseBids.filter((b) => b.user.gender === `female`).length,
      },
      bannedTeams: bans.filter((b) => b.jersey.toString() === id).map((b) => b.team.name),
    };
  });
}

const list = adminRoute({ method: `GET`, url: `/jerseys`, handler: async (_req, session) => loadJerseys(session) });

const patch = adminRoute({
  method: `PATCH`,
  url: `/jerseys/:number`,
  schema: {
    params: { type: `object`, properties: { number: { type: `integer`, minimum: 0, maximum: 99 } } },
    body: {
      type: `object`,
      required: [`quota`],
      properties: {
        quota: {
          type: `object`,
          required: [`male`, `female`],
          properties: {
            male: { type: `integer`, minimum: 0, maximum: 10 },
            female: { type: `integer`, minimum: 0, maximum: 10 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  write: true,
  handler: async (req, session) => {
    const { number } = req.params as { number: number };
    const { quota } = req.body as { quota: iJersey[`quota`] };
    const res = await Jersey.updateOne({ number }, { quota }).session(session.session);
    if (res.matchedCount === 0) throw new HttpError(404, `No such number.`);
    await logEvent(`ADMIN EDIT QUOTA`, session, JSON.stringify({ number, quota }), req.session.user._id);
    return (await loadJerseys(session, { number }))[0];
  },
});

export { list, patch };
