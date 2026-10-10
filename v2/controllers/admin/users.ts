import { HttpError, adminRoute } from "@/v2/controllers/admin/route";
import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBan } from "@/v2/models/jersey/jerseyBan";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import type { iPointsBreakdown } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import type { iUser } from "@/v2/models/user";
import { User } from "@/v2/models/user";
import { MANUAL_ROUND, assignJersey, unassignJersey } from "@/v2/utils/jerseyAllocation";
import { loginEmailFor } from "@/v2/utils/jerseyEmails";
import { logEvent } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";
import { generatePassword } from "@/v2/utils/password";
import { sendMail, smtpConfigured } from "@/v2/utils/smtp";
import bcrypt from "bcrypt";
import type { Types } from "mongoose";

const BREAKDOWN_KEYS = [`finalCut2526`, `firstCut2627`, `captain`, `adjustment`] as const;

function sumBreakdown(b: Partial<iPointsBreakdown> | undefined) {
  return BREAKDOWN_KEYS.reduce((acc, k) => acc + (b?.[k] ?? 0), 0);
}

/** Everything the admin UI shows about residents, in a handful of queries rather than one per user. */
async function loadAdminUsers(session: MongoSession, filter: Record<string, unknown> = {}) {
  const users = await User.find(filter).select(`-password`).lean().session(session.session);
  const ids = users.map((u) => u._id);

  const [infos, members, bids] = await Promise.all([
    JerseyBidInfo.find({ user: { $in: ids } })
      .populate<{ jersey: iJersey | undefined }>(`jersey`)
      .lean()
      .session(session.session),
    Member.find({ user: { $in: ids } })
      .populate<{ team: iTeam }>(`team`)
      .lean()
      .session(session.session),
    JerseyBid.find({ user: { $in: ids } })
      .populate<{ jersey: iJersey }>(`jersey`)
      .sort({ round: 1, priority: 1 })
      .lean()
      .session(session.session),
  ]);

  const infoBy = new Map(infos.map((i) => [i.user.toString(), i]));
  const group = <T extends { user: Types.ObjectId | iUser }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    rows.forEach((r) => map.set(r.user.toString(), [...(map.get(r.user.toString()) ?? []), r]));
    return map;
  };
  const membersBy = group(members);
  const bidsBy = group(bids);

  return users.map((u) => {
    const key = u._id.toString();
    const info = infoBy.get(key);
    const breakdown = { finalCut2526: 0, firstCut2627: 0, captain: 0, adjustment: 0, ...info?.breakdown };
    return {
      _id: key,
      username: u.username,
      name: u.name ?? u.username,
      room: u.room,
      gender: u.gender ?? null,
      year: u.year,
      role: u.role,
      lastLogin: u.lastLogin ? new Date(u.lastLogin).getTime() : null,
      email: u.email ?? null,
      round: info?.round ?? null,
      points: info?.points ?? 0,
      breakdown,
      previousResident: info?.previousResident ?? false,
      captainOf: info?.captainOf ?? [],
      teams: (membersBy.get(key) ?? []).map((m) => m.team.name),
      isAllocated: info?.isAllocated ?? false,
      jersey: info?.jersey?.number ?? null,
      allocatedRound: info?.allocatedRound ?? null,
      bids: (bidsBy.get(key) ?? []).map((b) => ({ number: b.jersey.number, priority: b.priority, round: b.round })),
    };
  });
}

async function loadAdminUser(id: string, session: MongoSession) {
  const [user] = await loadAdminUsers(session, { _id: id });
  if (!user) throw new HttpError(404, `User not found.`);
  return user;
}

const list = adminRoute({
  method: `GET`,
  url: `/users`,
  handler: async (_req, session) =>
    (await loadAdminUsers(session, { role: `USER` })).sort((a, b) => a.room.localeCompare(b.room)),
});

const patchSchema = {
  params: { type: `object`, properties: { id: { type: `string`, pattern: `^[0-9a-f]{24}$` } } },
  body: {
    type: `object`,
    properties: {
      name: { type: `string`, minLength: 1 },
      room: { type: `string`, minLength: 1 },
      gender: { type: `string`, enum: [`male`, `female`] },
      year: { type: `integer`, minimum: 0, maximum: 5 },
      round: { type: `integer`, minimum: 1, maximum: 4 },
      email: { type: `string` },
      breakdown: {
        type: `object`,
        properties: Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, { type: `integer`, minimum: -20, maximum: 50 }])),
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
};

const patch = adminRoute({
  method: `PATCH`,
  url: `/users/:id`,
  schema: patchSchema,
  write: true,
  handler: async (req, session) => {
    const { id } = req.params as { id: string };
    const { breakdown, round, ...userFields } = req.body as Record<string, unknown> & {
      breakdown?: Partial<iPointsBreakdown>;
      round?: number;
    };

    const user = await User.findById(id).session(session.session);
    if (!user) throw new HttpError(404, `User not found.`);
    if (userFields.gender && userFields.gender !== user.gender) {
      const info = await JerseyBidInfo.findOne({ user: id }).session(session.session);
      if (info?.isAllocated) throw new HttpError(400, `Remove their number before changing gender.`);
    }
    await User.updateOne({ _id: id }, { $set: userFields }).session(session.session);

    if (breakdown || round) {
      const info = await JerseyBidInfo.findOne({ user: id }).orFail().session(session.session);
      if (breakdown) {
        const merged = { finalCut2526: 0, firstCut2627: 0, captain: 0, adjustment: 0, ...info.breakdown, ...breakdown };
        info.breakdown = merged;
        info.points = sumBreakdown(merged);
      }
      if (round) info.round = round;
      await info.save({ session: session.session });
    }

    await logEvent(`ADMIN EDIT USER`, session, JSON.stringify({ id, ...(req.body as object) }), req.session.user._id);
    return loadAdminUser(id, session);
  },
});

const resetPassword = adminRoute({
  method: `POST`,
  url: `/users/:id/password`,
  write: true,
  handler: async (req, session) => {
    const { id } = req.params as { id: string };
    const password = generatePassword();
    const res = await User.updateOne({ _id: id }, { password: await bcrypt.hash(password, 10) }).session(
      session.session,
    );
    if (res.matchedCount === 0) throw new HttpError(404, `User not found.`);
    await logEvent(`ADMIN RESET PASSWORD`, session, id, req.session.user._id);
    return { password };
  },
});

const emailPassword = adminRoute({
  method: `POST`,
  url: `/users/:id/email-password`,
  write: true,
  handler: async (req, session) => {
    const { id } = req.params as { id: string };
    const user = await User.findById(id).orFail(new HttpError(404, `User not found.`)).session(session.session);
    if (!user.email) throw new HttpError(400, `No email address on record; add one first.`);
    if (!smtpConfigured) throw new HttpError(503, `Email isn't configured on the server.`);
    const password = generatePassword();
    await User.updateOne({ _id: id }, { password: await bcrypt.hash(password, 10) }).session(session.session);
    // Send before committing: if the email fails, the old password stays valid.
    try {
      await sendMail({ to: user.email, ...(await loginEmailFor(user, password, session)) });
    } catch (error) {
      throw new HttpError(502, `Couldn't send the email: ${(error as Error).message}`);
    }
    await logEvent(`ADMIN EMAIL PASSWORD`, session, user.email, req.session.user._id);
    return { sentTo: user.email };
  },
});

const allocate = adminRoute({
  method: `POST`,
  url: `/users/:id/allocate`,
  schema: {
    body: {
      type: `object`,
      required: [`number`],
      properties: { number: { type: `integer`, minimum: 0, maximum: 99 } },
      additionalProperties: false,
    },
  },
  write: true,
  handler: async (req, session) => {
    const { id } = req.params as { id: string };
    const { number } = req.body as { number: number };

    const user = await User.findById(id).orFail(new HttpError(404, `User not found.`)).session(session.session);
    const info = await JerseyBidInfo.findOne({ user: id }).orFail().session(session.session);
    if (info.isAllocated) throw new HttpError(400, `Already has a number; remove it first.`);

    const jersey = await Jersey.findOne({ number })
      .orFail(new HttpError(400, `No such number.`))
      .session(session.session);
    const { gender } = user;
    if (!gender) throw new HttpError(400, `Set their gender first.`);
    if (jersey.quota[gender] <= 0) throw new HttpError(400, `#${number} has no ${gender} quota left.`);

    const teams = (await Member.find({ user: id }).populate<{ team: iTeam }>(`team`).lean().session(session.session))
      .filter((m) => !m.team.shareable)
      .map((m) => m.team);
    const clash = await JerseyBan.findOne({ jersey: jersey._id, team: { $in: teams.map((t) => t._id) } })
      .populate<{ team: iTeam }>(`team`)
      .session(session.session);
    if (clash) throw new HttpError(400, `A ${clash.team.name} teammate already has #${number}.`);

    await assignJersey(id, jersey, MANUAL_ROUND, session);
    await logEvent(`ADMIN ALLOCATE`, session, JSON.stringify({ id, number }), req.session.user._id);
    return loadAdminUser(id, session);
  },
});

const unallocate = adminRoute({
  method: `DELETE`,
  url: `/users/:id/allocate`,
  write: true,
  handler: async (req, session) => {
    const { id } = req.params as { id: string };
    const info = await JerseyBidInfo.findOne({ user: id })
      .populate<{ user: iUser }>(`user`)
      .orFail(new HttpError(404, `User not found.`))
      .session(session.session);
    if (!info.isAllocated) throw new HttpError(400, `They don't have a number.`);
    await unassignJersey(info, session);
    await logEvent(`ADMIN UNALLOCATE`, session, id, req.session.user._id);
    return loadAdminUser(id, session);
  },
});

export { allocate, emailPassword, list, loadAdminUsers, patch, resetPassword, sumBreakdown, unallocate };
