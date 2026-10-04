import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBan } from "@/v2/models/jersey/jerseyBan";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import type { iJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyRound } from "@/v2/models/jersey/jerseyRound";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import type { iUser } from "@/v2/models/user";
import type { MongoSession } from "@/v2/utils/mongoSession";
import type { Types } from "mongoose";

/** Rules: numbers 0-9 are never shared; everything else up to 3 per gender. */
const defaultQuota = (number: number) => (number < 10 ? 1 : 3);

/** Allocations made by an admin by hand rather than by a round. */
const MANUAL_ROUND = 0;

type Gender = `male` | `female`;

interface Bidder {
  userId: string;
  name: string;
  room: string;
  gender: Gender;
  year: number;
  points: number;
  /** Jersey numbers in preference order (index 0 = top choice). */
  choices: number[];
  /** Non-shareable team ids; a number held by a teammate in one of these is off-limits. */
  exclusiveTeams: string[];
}

interface Assignment {
  bidder: Bidder;
  number: number;
  choice: number;
}

interface AllocationPlan {
  results: Assignment[];
  unallocated: Bidder[];
}

/** Small seeded PRNG (sfc32) so a round's tie-breaks are reproducible between preview and commit. */
function seededRandom(seed: number) {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed | 0;
  const next = () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 16; i += 1) next();
  return next;
}

function shuffle<T>(array: T[], random: () => number): T[] {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function exclusiveTeamsByUser(userIds: Types.ObjectId[], session: MongoSession) {
  const members = await Member.find({ user: { $in: userIds } })
    .populate<{ team: iTeam }>(`team`)
    .lean()
    .session(session.session);
  const map = new Map<string, string[]>();
  for (const m of members) {
    if (m.team.shareable) continue;
    const key = m.user.toString();
    map.set(key, [...(map.get(key) ?? []), m.team._id.toString()]);
  }
  return map;
}

/**
 * Work out who gets which number for `round`, without writing anything.
 *
 * Order (rules doc): choice rank first, then points, then seniority (year), then random.
 * Iterating every bidder in ranked order for choice 0, then choice 1, ... is equivalent to resolving
 * each number's contest separately, because an assignment only consumes that number's quota/bans.
 */
async function planAllocation(round: number, session: MongoSession): Promise<AllocationPlan> {
  const roundDoc = await JerseyRound.findOne({ round }).orFail().session(session.session);

  const bids = await JerseyBid.find({ round })
    .populate<{ jersey: iJersey }>(`jersey`)
    .sort({ priority: 1 })
    .lean()
    .session(session.session);
  const choicesByUser = new Map<string, number[]>();
  for (const bid of bids) {
    const key = bid.user.toString();
    choicesByUser.set(key, [...(choicesByUser.get(key) ?? []), bid.jersey.number]);
  }

  const infos = await JerseyBidInfo.find({
    user: { $in: [...choicesByUser.keys()] },
    isAllocated: false,
    round: { $lte: round },
  })
    .populate<{ user: iUser }>(`user`)
    .lean()
    .session(session.session);
  const teams = await exclusiveTeamsByUser(
    infos.map((i) => i.user._id as Types.ObjectId),
    session,
  );

  const bidders: Bidder[] = infos.map((info) => {
    const userId = info.user._id.toString();
    return {
      userId,
      name: info.user.name ?? info.user.username,
      room: info.user.room,
      gender: info.user.gender,
      year: info.user.year,
      points: info.points,
      choices: choicesByUser.get(userId) ?? [],
      exclusiveTeams: teams.get(userId) ?? [],
    };
  });

  // Shuffle first (seeded), then a stable sort: exact ties keep their random order.
  shuffle(
    bidders.sort((a, b) => a.userId.localeCompare(b.userId)),
    seededRandom(roundDoc.seed),
  );
  bidders.sort((a, b) => b.points - a.points || b.year - a.year);

  const quota = new Map<number, Record<Gender, number>>();
  for (const j of await Jersey.find().lean().session(session.session)) {
    quota.set(j.number, { male: j.quota.male, female: j.quota.female });
  }
  const banned = new Set<string>();
  for (const ban of await JerseyBan.find().populate<{ jersey: iJersey }>(`jersey`).lean().session(session.session)) {
    banned.add(`${ban.team.toString()}:${ban.jersey.number}`);
  }

  const results: Assignment[] = [];
  const done = new Set<string>();
  for (let choice = 0; choice < 5; choice += 1) {
    for (const bidder of bidders) {
      const number = bidder.choices[choice];
      if (done.has(bidder.userId) || number === undefined) continue;

      const q = quota.get(number);
      if (!q || q[bidder.gender] <= 0) continue;
      if (bidder.exclusiveTeams.some((t) => banned.has(`${t}:${number}`))) continue;

      // Round 1 numbers are never shared: the first holder closes the number for their gender.
      q[bidder.gender] = round === 1 ? 0 : q[bidder.gender] - 1;
      bidder.exclusiveTeams.forEach((t) => banned.add(`${t}:${number}`));
      done.add(bidder.userId);
      results.push({ bidder, number, choice });
    }
  }

  return { results, unallocated: bidders.filter((b) => !done.has(b.userId)) };
}

/** Give `userId` number `jersey`, consuming quota and banning their non-shareable teams from it. */
async function assignJersey(userId: Types.ObjectId | string, jersey: iJersey, round: number, session: MongoSession) {
  const info = await JerseyBidInfo.findOne({ user: userId })
    .populate<{ user: iUser }>(`user`)
    .orFail()
    .session(session.session);
  const { gender } = info.user;

  info.isAllocated = true;
  info.jersey = jersey._id as Types.ObjectId;
  info.allocatedRound = round;
  await info.save({ session: session.session });

  const update = round === 1 ? { $set: { [`quota.${gender}`]: 0 } } : { $inc: { [`quota.${gender}`]: -1 } };
  await Jersey.updateOne({ _id: jersey._id }, update).session(session.session);

  const teams =
    (await exclusiveTeamsByUser([info.user._id as Types.ObjectId], session)).get(info.user._id.toString()) ?? [];
  for (const team of teams) {
    await JerseyBan.updateOne(
      { team, jersey: jersey._id },
      { $setOnInsert: { team, jersey: jersey._id } },
      { upsert: true },
    ).session(session.session);
  }
}

/** Reverse `assignJersey`: restore quota and lift bans no remaining teammate needs. */
async function unassignJersey(info: Omit<iJerseyBidInfo, `user`> & { user: iUser }, session: MongoSession) {
  if (!info.isAllocated || !info.jersey) return;
  const jersey = await Jersey.findById(info.jersey).orFail().session(session.session);
  const { gender } = info.user;
  const cap = defaultQuota(jersey.number);

  jersey.quota[gender] = info.allocatedRound === 1 ? cap : Math.min(cap, jersey.quota[gender] + 1);
  await jersey.save({ session: session.session });

  await JerseyBidInfo.updateOne(
    { _id: info._id },
    { $set: { isAllocated: false }, $unset: { jersey: 1, allocatedRound: 1 } },
  ).session(session.session);

  const teams =
    (await exclusiveTeamsByUser([info.user._id as Types.ObjectId], session)).get(info.user._id.toString()) ?? [];
  for (const team of teams) {
    const teammates = (await Member.find({ team }).lean().session(session.session)).map((m) => m.user);
    const stillHeld = await JerseyBidInfo.exists({
      user: { $in: teammates },
      jersey: jersey._id,
      isAllocated: true,
    }).session(session.session);
    if (!stillHeld) await JerseyBan.deleteOne({ team, jersey: jersey._id }).session(session.session);
  }
}

/** Plan and commit a round's allocation inside the caller's transaction. */
async function allocateRound(round: number, session: MongoSession) {
  const plan = await planAllocation(round, session);
  const jerseys = new Map((await Jersey.find().session(session.session)).map((j) => [j.number, j]));
  for (const { bidder, number } of plan.results) {
    await assignJersey(bidder.userId, jerseys.get(number)!, round, session);
  }
  const summary = {
    bidders: plan.results.length + plan.unallocated.length,
    allocated: plan.results.length,
    unallocatedBidders: plan.unallocated.length,
  };
  await JerseyRound.updateOne({ round }, { status: `allocated`, allocatedAt: Date.now(), summary }).session(
    session.session,
  );
  return summary;
}

async function undoRound(round: number, session: MongoSession) {
  const infos = await JerseyBidInfo.find({ allocatedRound: round, isAllocated: true })
    .populate<{ user: iUser }>(`user`)
    .session(session.session);
  for (const info of infos) {
    await unassignJersey(info, session);
  }
  await JerseyRound.updateOne({ round }, { status: `held`, $unset: { allocatedAt: 1, summary: 1 } }).session(
    session.session,
  );
  return infos.length;
}

export {
  AllocationPlan,
  Bidder,
  MANUAL_ROUND,
  allocateRound,
  assignJersey,
  defaultQuota,
  planAllocation,
  unassignJersey,
  undoRound,
};
