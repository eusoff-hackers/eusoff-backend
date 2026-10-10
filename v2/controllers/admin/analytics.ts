import { HttpError, adminRoute } from "@/v2/controllers/admin/route";
import { EventLog } from "@/v2/models/eventLog";
import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyRound, displayStatus } from "@/v2/models/jersey/jerseyRound";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import { Server } from "@/v2/models/server";
import { User } from "@/v2/models/user";
import type { Bidder } from "@/v2/utils/jerseyAllocation";
import { assignRemaining, planRemaining } from "@/v2/utils/jerseyAllocation";
import { logEvent } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";

const HOUR = 3_600_000;
const ROUNDS = [1, 2, 3, 4];

/** Everything analytics needs, loaded once (a few hundred residents; no per-user queries). */
async function loadSnapshot(session: MongoSession) {
  const residents = await User.find({ role: `USER` }).select(`-password`).lean().session(session.session);
  const ids = residents.map((u) => u._id);
  const [infos, bids, members, rounds, jerseys] = await Promise.all([
    JerseyBidInfo.find({ user: { $in: ids } })
      .lean()
      .session(session.session),
    JerseyBid.find({ user: { $in: ids } })
      .populate<{ jersey: iJersey }>(`jersey`, `number`)
      .lean()
      .session(session.session),
    Member.find({ user: { $in: ids } })
      .populate<{ team: iTeam }>(`team`)
      .lean()
      .session(session.session),
    JerseyRound.find().sort({ round: 1 }).lean().session(session.session),
    Jersey.find().sort({ number: 1 }).lean().session(session.session),
  ]);

  const infoBy = new Map(infos.map((i) => [i.user.toString(), i]));
  const bidsBy = new Map<string, typeof bids>();
  for (const b of bids) {
    const k = `${b.user.toString()}:${b.round}`;
    bidsBy.set(k, [...(bidsBy.get(k) ?? []), b]);
  }
  const jerseyNumberById = new Map(jerseys.map((j) => [j._id.toString(), j.number]));
  return { residents, infos, infoBy, bids, bidsBy, members, rounds, jerseys, jerseyNumberById };
}

type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;

/** Already held a number when `round` opened (earlier round or a manual assignment). */
const hadNumberBefore = (i: { isAllocated: boolean; allocatedRound?: number }, round: number) =>
  i.isAllocated && (i.allocatedRound ?? 0) < round;

/**
 * Who should have bid in `round` but didn't. Own-round residents are expected to bid; residents from
 * earlier rounds who still had no number when this round opened may bid (carry-over).
 */
function nonBiddersOf(snap: Snapshot, round: number) {
  const rows = [];
  for (const u of snap.residents) {
    const id = u._id.toString();
    const info = snap.infoBy.get(id);
    if (!info || info.round > round) continue;
    if (hadNumberBefore(info, round)) continue;
    if (snap.bidsBy.has(`${id}:${round}`)) continue;
    rows.push({
      _id: id,
      name: u.name ?? u.username,
      username: u.username,
      room: u.room,
      gender: u.gender ?? null,
      round: info.round,
      points: info.points,
      carryover: info.round < round,
      lastLogin: u.lastLogin ? new Date(u.lastLogin).getTime() : null,
    });
  }
  return rows.sort((a, b) => Number(a.carryover) - Number(b.carryover) || a.room.localeCompare(b.room));
}

const analytics = adminRoute({
  method: `GET`,
  url: `/analytics`,
  handler: async (_req, session) => {
    const now = Date.now();
    const snap = await loadSnapshot(session);
    const { residents, infos, infoBy, bids, bidsBy, members, rounds, jerseys, jerseyNumberById } = snap;

    const currentRoundDoc = await Server.findOne({ key: `jerseyBidRound` }).session(session.session);
    const currentRound = typeof currentRoundDoc?.value === `number` ? currentRoundDoc.value : 1;

    const roundStats = ROUNDS.map((r) => {
      const doc = rounds.find((x) => x.round === r);
      const bidders = new Set(bids.filter((b) => b.round === r).map((b) => b.user.toString()));
      const allocatedHere = infos.filter((i) => i.isAllocated && i.allocatedRound === r);
      const choiceHits = [0, 0, 0, 0, 0];
      for (const i of allocatedHere) {
        const mine = (bidsBy.get(`${i.user.toString()}:${r}`) ?? []).find(
          (b) => b.jersey._id.toString() === i.jersey?.toString(),
        );
        if (mine) choiceHits[mine.priority] += 1;
      }
      const nb = nonBiddersOf(snap, r);
      return {
        round: r,
        status: doc ? displayStatus(doc, now) : `unscheduled`,
        eligible: infos.filter((i) => i.round === r).length,
        carryover: infos.filter((i) => i.round < r && !hadNumberBefore(i, r)).length,
        bidders: bidders.size,
        nonBidders: nb.filter((x) => !x.carryover).length,
        allocated: allocatedHere.length,
        unallocatedBidders:
          doc?.status === `allocated`
            ? [...bidders].filter((id) => {
                const i = infoBy.get(id);
                return !(i?.isAllocated && i.allocatedRound === r);
              }).length
            : 0,
        choiceHits,
      };
    });

    const currentBids = bids.filter((b) => b.round === currentRound);
    const genderOf = new Map(residents.map((u) => [u._id.toString(), u.gender]));
    const holdersOf = new Map<number, number>();
    for (const i of infos) {
      if (i.isAllocated && i.jersey) {
        const n = jerseyNumberById.get(i.jersey.toString());
        if (n !== undefined) holdersOf.set(n, (holdersOf.get(n) ?? 0) + 1);
      }
    }
    const demand = jerseys.map((j) => {
      const mine = currentBids.filter((b) => b.jersey.number === j.number);
      const byChoice = [0, 0, 0, 0, 0];
      mine.forEach((b) => {
        byChoice[b.priority] += 1;
      });
      return {
        number: j.number,
        total: mine.length,
        byChoice,
        male: mine.filter((b) => genderOf.get(b.user.toString()) === `male`).length,
        female: mine.filter((b) => genderOf.get(b.user.toString()) === `female`).length,
        holders: holdersOf.get(j.number) ?? 0,
      };
    });

    const teamMap = new Map<string, { team: string; members: number; allocated: number; bidders: number }>();
    for (const m of members) {
      const t = teamMap.get(m.team.name) ?? { team: m.team.name, members: 0, allocated: 0, bidders: 0 };
      const id = m.user.toString();
      t.members += 1;
      if (infoBy.get(id)?.isAllocated) t.allocated += 1;
      if (ROUNDS.some((r) => bidsBy.has(`${id}:${r}`))) t.bidders += 1;
      teamMap.set(t.team, t);
    }

    const pointsMap = new Map<number, { points: number; residents: number; allocated: number; gotTopChoice: number }>();
    for (const i of infos) {
      const p = pointsMap.get(i.points) ?? { points: i.points, residents: 0, allocated: 0, gotTopChoice: 0 };
      p.residents += 1;
      if (i.isAllocated) {
        p.allocated += 1;
        const top = (bidsBy.get(`${i.user.toString()}:${i.allocatedRound}`) ?? []).find((b) => b.priority === 0);
        if (top && top.jersey._id.toString() === i.jersey?.toString()) p.gotTopChoice += 1;
      }
      pointsMap.set(i.points, p);
    }

    const since = now - 7 * 24 * HOUR;
    const events = await EventLog.find({
      action: { $in: [`USER LOGIN`, `USER PLACE BIDS`] },
      timestamp: { $gte: new Date(since) },
    })
      .select(`action timestamp user`)
      .lean()
      .session(session.session);
    const bucket = (action: string) => {
      const m = new Map<number, number>();
      for (const e of events.filter((x) => x.action === action)) {
        const h = Math.floor(new Date(e.timestamp).getTime() / HOUR) * HOUR;
        m.set(h, (m.get(h) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count }));
    };

    return {
      generatedAt: now,
      coverage: {
        residents: residents.length,
        allocated: infos.filter((i) => i.isAllocated).length,
        unallocated: infos.filter((i) => !i.isAllocated).length,
        unknownGender: residents.filter((u) => !u.gender).length,
        neverLoggedIn: residents.filter((u) => !u.lastLogin).length,
      },
      rounds: roundStats,
      demand,
      teams: [...teamMap.values()].sort((a, b) => a.team.localeCompare(b.team)),
      points: [...pointsMap.values()].sort((a, b) => a.points - b.points),
      activity: {
        loginsByHour: bucket(`USER LOGIN`),
        bidsByHour: bucket(`USER PLACE BIDS`),
        uniqueLogins: residents.filter((u) => u.lastLogin).length,
      },
    };
  },
});

const roundParam = {
  params: { type: `object`, properties: { round: { type: `integer`, minimum: 1, maximum: 4 } }, required: [`round`] },
};

const nonBidders = adminRoute({
  method: `GET`,
  url: `/rounds/:round/non-bidders`,
  schema: roundParam,
  handler: async (req, session) => nonBiddersOf(await loadSnapshot(session), (req.params as { round: number }).round),
});

const remainingBody = {
  body: {
    type: `object`,
    properties: { upToRound: { type: `integer`, minimum: 1, maximum: 4 } },
    additionalProperties: false,
  },
};

async function resolveUpToRound(body: { upToRound?: number } | undefined, session: MongoSession) {
  if (body?.upToRound) return body.upToRound;
  const latest = await JerseyRound.findOne({ status: `allocated` }).sort({ round: -1 }).session(session.session);
  if (!latest) throw new HttpError(400, `No round has been allocated yet.`);
  return latest.round;
}

const view = (b: Bidder) => ({
  _id: b.userId,
  name: b.name,
  room: b.room,
  gender: b.gender ?? null,
  points: b.points,
  round: b.round,
});

const remainingPreview = adminRoute({
  method: `POST`,
  url: `/assign-remaining/preview`,
  schema: remainingBody,
  handler: async (req, session) => {
    const plan = await planRemaining(
      await resolveUpToRound(req.body as { upToRound?: number } | undefined, session),
      session,
    );
    return {
      results: plan.results.map((r) => ({ user: view(r.bidder), number: r.number })),
      impossible: plan.impossible.map((r) => ({ user: view(r.bidder), reason: r.reason })),
    };
  },
});

const remainingCommit = adminRoute({
  method: `POST`,
  url: `/assign-remaining`,
  schema: remainingBody,
  write: true,
  handler: async (req, session) => {
    const upToRound = await resolveUpToRound(req.body as { upToRound?: number } | undefined, session);
    const open = await JerseyRound.findOne({ round: { $lte: upToRound }, status: { $ne: `allocated` } }).session(
      session.session,
    );
    if (open) throw new HttpError(400, `Round ${open.round} isn't allocated yet; allocate it first.`);
    const plan = await assignRemaining(upToRound, session);
    const summary = { assigned: plan.results.length, impossible: plan.impossible.length };
    await logEvent(`ADMIN ASSIGN REMAINING`, session, JSON.stringify({ upToRound, ...summary }), req.session.user._id);
    return summary;
  },
});

export { analytics, nonBidders, remainingCommit, remainingPreview };
