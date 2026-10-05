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

/** Rules: numbers 1-9 are never shared; everything else (0 included) up to 3 per gender. */
const defaultQuota = (number: number) => (number >= 1 && number <= 9 ? 1 : 3);

/** Allocations made by an admin by hand rather than by a round. */
const MANUAL_ROUND = 0;
/** Allocations made by "assign remaining" after the rounds. */
const AUTO_ASSIGN_ROUND = 5;

type Gender = `male` | `female`;

interface Bidder {
  userId: string;
  name: string;
  room: string;
  gender: Gender;
  year: number;
  points: number;
  round: number;
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
  // Residents without a recorded gender can't hold a gendered quota; the bid endpoint already refuses them.
  const bidders = rank(await toBidders(infos, choicesByUser, session), roundDoc.seed);
  const { quota, banned } = await loadState(session);

  const results: Assignment[] = [];
  const done = new Set<string>();
  for (let choice = 0; choice < 5; choice += 1) {
    for (const bidder of bidders) {
      const number = bidder.choices[choice];
      if (done.has(bidder.userId) || number === undefined) continue;
      if (!canTake(bidder, number, quota, banned)) continue;

      // Round 1 numbers are never shared: the winner closes the number for their gender, in this
      // round and every later round.
      take(bidder, number, quota, banned, round === 1);
      done.add(bidder.userId);
      results.push({ bidder, number, choice });
    }
  }

  return { results, unallocated: bidders.filter((b) => !done.has(b.userId)) };
}

interface RemainingPlan {
  results: { bidder: Bidder; number: number }[];
  impossible: { bidder: Bidder; reason: string }[];
}

/**
 * Give every resident of rounds <= `upToRound` who still has no number a random number they are
 * eligible for (same sharing/team rules as a normal round after round 1). Ranked like a round, so
 * when numbers run short the higher-points/more-senior residents are placed first. Seeded from the
 * round, so the preview and the commit produce the same plan.
 */
async function planRemaining(upToRound: number, session: MongoSession): Promise<RemainingPlan> {
  const roundDoc = await JerseyRound.findOne({ round: upToRound }).orFail().session(session.session);
  const infos = await JerseyBidInfo.find({ isAllocated: false, round: { $lte: upToRound } })
    .populate<{ user: iUser }>(`user`)
    .lean()
    .session(session.session);
  const residents = infos.filter((i) => i.user.role === `USER`);

  const impossible: RemainingPlan[`impossible`] = residents
    .filter((i) => !i.user.gender)
    .map((i) => ({ bidder: toBidder(i, [], []), reason: `Gender not set` }));
  const random = seededRandom(roundDoc.seed ^ 0x5bd1e995);
  const people = rank(await toBidders(residents, new Map(), session), roundDoc.seed ^ 0x27d4eb2f);
  const { quota, banned } = await loadState(session);

  const results: RemainingPlan[`results`] = [];
  for (const bidder of people) {
    const options = [...quota.keys()].sort((a, b) => a - b).filter((n) => canTake(bidder, n, quota, banned));
    if (options.length === 0) {
      impossible.push({ bidder, reason: `No eligible number left for ${bidder.gender}s on their teams` });
      continue;
    }
    const number = options[Math.floor(random() * options.length)];
    take(bidder, number, quota, banned, false);
    results.push({ bidder, number });
  }
  return { results, impossible };
}

type Quotas = Map<number, Record<Gender, number>>;

async function loadState(session: MongoSession) {
  const quota: Quotas = new Map();
  for (const j of await Jersey.find().lean().session(session.session)) {
    quota.set(j.number, { male: j.quota.male, female: j.quota.female });
  }
  const banned = new Set<string>();
  for (const ban of await JerseyBan.find().populate<{ jersey: iJersey }>(`jersey`).lean().session(session.session)) {
    banned.add(`${ban.team.toString()}:${ban.jersey.number}`);
  }
  return { quota, banned };
}

function canTake(bidder: Bidder, number: number, quota: Quotas, banned: Set<string>) {
  const q = quota.get(number);
  if (!q || q[bidder.gender] <= 0) return false;
  return !bidder.exclusiveTeams.some((t) => banned.has(`${t}:${number}`));
}

function take(bidder: Bidder, number: number, quota: Quotas, banned: Set<string>, closeNumber: boolean) {
  const q = quota.get(number)!;
  q[bidder.gender] = closeNumber ? 0 : q[bidder.gender] - 1;
  bidder.exclusiveTeams.forEach((t) => banned.add(`${t}:${number}`));
}

type PopulatedInfo = Omit<iJerseyBidInfo, `user`> & { user: iUser };

function toBidder(info: PopulatedInfo, choices: number[], exclusiveTeams: string[]): Bidder {
  return {
    userId: info.user._id.toString(),
    name: info.user.name ?? info.user.username,
    room: info.user.room,
    gender: info.user.gender!,
    year: info.user.year,
    points: info.points,
    round: info.round,
    choices,
    exclusiveTeams,
  };
}

async function toBidders(infos: PopulatedInfo[], choicesByUser: Map<string, number[]>, session: MongoSession) {
  const withGender = infos.filter((i) => i.user.gender);
  const teams = await exclusiveTeamsByUser(
    withGender.map((i) => i.user._id as Types.ObjectId),
    session,
  );
  return withGender.map((i) => {
    const id = i.user._id.toString();
    return toBidder(i, choicesByUser.get(id) ?? [], teams.get(id) ?? []);
  });
}

/** Points, then seniority; exact ties keep a seeded random order (shuffle, then stable sort). */
function rank(bidders: Bidder[], seed: number) {
  shuffle(
    bidders.sort((a, b) => a.userId.localeCompare(b.userId)),
    seededRandom(seed),
  );
  return bidders.sort((a, b) => b.points - a.points || b.year - a.year);
}

/** Give `userId` number `jersey`, consuming quota and banning their non-shareable teams from it. */
async function assignJersey(userId: Types.ObjectId | string, jersey: iJersey, round: number, session: MongoSession) {
  const info = await JerseyBidInfo.findOne({ user: userId })
    .populate<{ user: iUser }>(`user`)
    .orFail()
    .session(session.session);
  const { gender } = info.user;
  if (!gender) throw new Error(`Cannot allocate ${info.user.username}: gender not set.`);

  info.isAllocated = true;
  info.jersey = jersey._id as Types.ObjectId;
  info.allocatedRound = round;
  await info.save({ session: session.session });

  // Round-1 wins close the number for that gender for good.
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
  if (!gender) throw new Error(`Cannot unallocate ${info.user.username}: gender not set.`);
  const cap = defaultQuota(jersey.number);

  // A round-1 holder was the only one of their gender, so removing them reopens the whole quota.
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
  const summary: { bidders: number; allocated: number; unallocatedBidders: number; autoAssigned?: number } = {
    bidders: plan.results.length + plan.unallocated.length,
    allocated: plan.results.length,
    unallocatedBidders: plan.unallocated.length,
  };
  // After the final round, everyone still without a number gets a random allowed one (committee decision).
  if (await isLastRound(round, session)) {
    summary.autoAssigned = (await assignRemaining(round, session)).results.length;
  }
  await JerseyRound.updateOne({ round }, { status: `allocated`, allocatedAt: Date.now(), summary }).session(
    session.session,
  );
  return summary;
}

async function isLastRound(round: number, session: MongoSession) {
  return !(await JerseyRound.exists({ round: { $gt: round } }).session(session.session));
}

async function undoRound(round: number, session: MongoSession) {
  // Undoing the final round also undoes the automatic leftover assignment that followed it.
  const rounds = (await isLastRound(round, session)) ? [round, AUTO_ASSIGN_ROUND] : [round];
  const infos = await JerseyBidInfo.find({ allocatedRound: { $in: rounds }, isAllocated: true })
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

/** Commit `planRemaining` inside the caller's transaction. */
async function assignRemaining(upToRound: number, session: MongoSession) {
  const plan = await planRemaining(upToRound, session);
  const jerseys = new Map((await Jersey.find().session(session.session)).map((j) => [j.number, j]));
  for (const { bidder, number } of plan.results) {
    await assignJersey(bidder.userId, jerseys.get(number)!, AUTO_ASSIGN_ROUND, session);
  }
  return plan;
}

export {
  AUTO_ASSIGN_ROUND,
  AllocationPlan,
  assignRemaining,
  planRemaining,
  Bidder,
  MANUAL_ROUND,
  allocateRound,
  assignJersey,
  defaultQuota,
  planAllocation,
  unassignJersey,
  undoRound,
};
