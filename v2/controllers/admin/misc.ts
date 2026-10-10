import { HttpError, adminRoute } from "@/v2/controllers/admin/route";
import { loadAdminUsers } from "@/v2/controllers/admin/users";
import { DataIssue } from "@/v2/models/dataIssue";
import { EventLog } from "@/v2/models/eventLog";
import type { iJersey } from "@/v2/models/jersey/jersey";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyRound, publicRound } from "@/v2/models/jersey/jerseyRound";
import { Server } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { User } from "@/v2/models/user";
import { logEvent } from "@/v2/utils/logger";

const bids = adminRoute({
  method: `GET`,
  url: `/bids`,
  schema: { querystring: { type: `object`, properties: { round: { type: `integer`, minimum: 1, maximum: 4 } } } },
  handler: async (req, session) => {
    const { round } = req.query as { round?: number };
    const current = await Server.findOne({ key: `jerseyBidRound` }).session(session.session);
    const r = round ?? (typeof current?.value === `number` ? current.value : 1);

    const rows = await JerseyBid.find({ round: r })
      .populate<{ jersey: iJersey }>(`jersey`)
      .populate<{ user: iUser }>(`user`, `name username room gender year`)
      .sort({ priority: 1 })
      .lean()
      .session(session.session);
    const infos = new Map(
      (
        await JerseyBidInfo.find({ user: { $in: rows.map((b) => b.user._id) } })
          .lean()
          .session(session.session)
      ).map((i) => [i.user.toString(), i]),
    );

    const byUser = new Map<string, { user: object; bids: { number: number; priority: number }[] }>();
    for (const b of rows) {
      const key = b.user._id.toString();
      if (!byUser.has(key)) {
        byUser.set(key, {
          user: {
            _id: key,
            name: b.user.name ?? b.user.username,
            room: b.user.room,
            gender: b.user.gender,
            year: b.user.year,
            points: infos.get(key)?.points ?? 0,
          },
          bids: [],
        });
      }
      byUser.get(key)!.bids.push({ number: b.jersey.number, priority: b.priority });
    }
    return [...byUser.values()];
  },
});

const issues = adminRoute({
  method: `GET`,
  url: `/issues`,
  handler: async (_req, session) => DataIssue.find().sort({ category: 1, _id: 1 }).lean().session(session.session),
});

const patchIssue = adminRoute({
  method: `PATCH`,
  url: `/issues/:id`,
  schema: {
    body: {
      type: `object`,
      required: [`resolved`],
      properties: { resolved: { type: `boolean` } },
      additionalProperties: false,
    },
  },
  write: true,
  handler: async (req, session) => {
    const { id } = req.params as { id: string };
    const { resolved } = req.body as { resolved: boolean };
    const issue = await DataIssue.findByIdAndUpdate(id, { resolved }, { new: true }).session(session.session);
    if (!issue) throw new HttpError(404, `Issue not found.`);
    return issue;
  },
});

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? `` : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, `""`)}"` : s;
};

const exportAllocations = adminRoute({
  method: `GET`,
  url: `/export/allocations`,
  handler: async (_req, session, res) => {
    const users = (await loadAdminUsers(session, { role: `USER` })).sort((a, b) => a.room.localeCompare(b.room));
    const header = [`name`, `matric`, `room`, `gender`, `round`, `points`, `number`, `allocatedRound`, `teams`];
    const lines = users.map((u) =>
      [u.name, u.username, u.room, u.gender, u.round, u.points, u.jersey, u.allocatedRound, u.teams.join(`; `)]
        .map(csvCell)
        .join(`,`),
    );
    await res
      .header(`Content-Type`, `text/csv; charset=utf-8`)
      .header(
        `Content-Disposition`,
        `attachment; filename="jersey-allocations-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      .send([header.join(`,`), ...lines].join(`\n`));
    return undefined;
  },
});

const getSettings = adminRoute({
  method: `GET`,
  url: `/settings`,
  handler: async (_req, session) => {
    const allow = await Server.findOne({ key: `allowLogin` }).session(session.session);
    return { allowLogin: Boolean(allow?.value) };
  },
});

const patchSettings = adminRoute({
  method: `PATCH`,
  url: `/settings`,
  schema: {
    body: {
      type: `object`,
      required: [`allowLogin`],
      properties: { allowLogin: { type: `boolean` } },
      additionalProperties: false,
    },
  },
  write: true,
  handler: async (req, session) => {
    const { allowLogin } = req.body as { allowLogin: boolean };
    await Server.updateOne(
      { key: `allowLogin` },
      { $set: { key: `allowLogin`, value: allowLogin } },
      { upsert: true },
    ).session(session.session);
    await logEvent(`ADMIN SET LOGIN ${allowLogin ? `ON` : `OFF`}`, session, req.session.user._id);
    return { allowLogin };
  },
});

const overview = adminRoute({
  method: `GET`,
  url: `/overview`,
  handler: async (_req, session) => {
    const now = Date.now();
    const residents = await User.find({ role: `USER` }).select(`_id gender`).lean().session(session.session);
    const residentIds = residents.map((u) => u._id);
    const [infos, rounds, allBids, issuesOpen, events] = await Promise.all([
      JerseyBidInfo.find({ user: { $in: residentIds } })
        .lean()
        .session(session.session),
      JerseyRound.find().sort({ round: 1 }).session(session.session),
      JerseyBid.find().populate<{ jersey: iJersey }>(`jersey`, `number`).lean().session(session.session),
      DataIssue.countDocuments({ resolved: false }).session(session.session),
      EventLog.find()
        .sort({ timestamp: -1 })
        .limit(30)
        .populate<{ user: iUser | undefined }>(`user`, `name username room`)
        .lean()
        .session(session.session),
    ]);

    const count = <T>(rows: T[], key: (r: T) => string | number | undefined) =>
      rows.reduce<Record<string, number>>((acc, r) => {
        const k = key(r);
        if (k !== undefined) acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});

    const active = rounds.find((r) => r.open <= now && now < r.close);
    const next = rounds.find((r) => now < r.open);
    const shown = active ?? next ?? rounds[rounds.length - 1];
    let phase = `before`;
    if (active) phase = `open`;
    else if (!next && rounds.length) phase = `done`;
    else if (rounds.some((r) => r.close <= now)) phase = `between`;

    const biddersByRound: Record<string, number> = {};
    for (const r of [1, 2, 3, 4]) {
      biddersByRound[r] = new Set(allBids.filter((b) => b.round === r).map((b) => b.user.toString())).size;
    }

    const currentBids = shown ? allBids.filter((b) => b.round === shown.round) : [];
    const topNumbers = Object.entries(count(currentBids, (b) => b.jersey.number))
      .map(([number, n]) => ({ number: Number(number), bids: n }))
      .sort((a, b) => b.bids - a.bids)
      .slice(0, 10);

    const pointsDistribution = Object.entries(count(infos, (i) => i.points))
      .map(([points, n]) => ({ points: Number(points), count: n }))
      .sort((a, b) => a.points - b.points);

    return {
      now,
      residents: residents.length,
      byRound: count(infos, (i) => i.round),
      byGender: count(residents, (u) => u.gender),
      current: shown ? { round: shown.round, open: shown.open, close: shown.close, phase } : null,
      rounds: rounds.map((r) => publicRound(r, now)),
      bidders: biddersByRound,
      allocated: count(
        infos.filter((i) => i.isAllocated),
        (i) => i.allocatedRound ?? 0,
      ),
      unallocated: infos.filter((i) => !i.isAllocated).length,
      issuesOpen,
      pointsDistribution,
      topNumbers,
      recentActivity: events.map((e) => ({
        action: e.action,
        timestamp: new Date(e.timestamp).getTime(),
        user: e.user ? { name: e.user.name ?? e.user.username, room: e.user.room } : undefined,
      })),
    };
  },
});

export { bids, exportAllocations, getSettings, issues, overview, patchIssue, patchSettings };
