import { HttpError, adminRoute } from "@/v2/controllers/admin/route";
import { JerseyRound, displayStatus, publicRound } from "@/v2/models/jersey/jerseyRound";
import type { Bidder } from "@/v2/utils/jerseyAllocation";
import { allocateRound, planAllocation, undoRound } from "@/v2/utils/jerseyAllocation";
import { syncServerWindow } from "@/v2/utils/jerseyScheduler";
import { logEvent } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";

const roundParam = {
  params: { type: `object`, properties: { round: { type: `integer`, minimum: 1, maximum: 4 } }, required: [`round`] },
};

async function getRound(round: number, session: MongoSession) {
  const doc = await JerseyRound.findOne({ round }).session(session.session);
  if (!doc) throw new HttpError(404, `Round ${round} is not scheduled.`);
  return doc;
}

const list = adminRoute({
  method: `GET`,
  url: `/rounds`,
  handler: async (_req, session) => {
    const now = Date.now();
    return (await JerseyRound.find().sort({ round: 1 }).session(session.session)).map((r) => publicRound(r, now));
  },
});

const put = adminRoute({
  method: `PUT`,
  url: `/rounds`,
  schema: {
    body: {
      type: `object`,
      required: [`rounds`],
      properties: {
        rounds: {
          type: `array`,
          minItems: 1,
          maxItems: 4,
          items: {
            type: `object`,
            required: [`round`, `open`, `close`],
            properties: {
              round: { type: `integer`, minimum: 1, maximum: 4 },
              open: { type: `integer` },
              close: { type: `integer` },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  write: true,
  afterCommit: () => syncServerWindow(Date.now()),
  handler: async (req, session) => {
    const { rounds } = req.body as { rounds: { round: number; open: number; close: number }[] };
    const sorted = [...rounds].sort((a, b) => a.round - b.round);
    for (const [i, r] of sorted.entries()) {
      if (r.close <= r.open) throw new HttpError(400, `Round ${r.round} must close after it opens.`);
      if (i > 0 && r.open < sorted[i - 1].close)
        throw new HttpError(400, `Round ${r.round} overlaps round ${sorted[i - 1].round}.`);
    }

    for (const r of sorted) {
      const existing = await JerseyRound.findOne({ round: r.round }).session(session.session);
      if (existing && existing.status !== `scheduled` && existing.status !== `held`) {
        if (existing.open !== r.open || existing.close !== r.close) {
          throw new HttpError(400, `Round ${r.round} is already ${existing.status}; undo it before changing times.`);
        }
        continue;
      }
      if (existing) {
        existing.open = r.open;
        existing.close = r.close;
        // Re-opening a held round puts it back under the scheduler.
        if (existing.status === `held` && r.close > Date.now()) existing.status = `scheduled`;
        await existing.save({ session: session.session });
      } else {
        await JerseyRound.create([r], { session: session.session });
      }
    }
    await logEvent(`ADMIN EDIT SCHEDULE`, session, JSON.stringify(sorted), req.session.user._id);
    const now = Date.now();
    return (await JerseyRound.find().sort({ round: 1 }).session(session.session)).map((r) => publicRound(r, now));
  },
});

const bidderView = (b: Bidder) => ({
  _id: b.userId,
  name: b.name,
  room: b.room,
  gender: b.gender,
  points: b.points,
  year: b.year,
});

const preview = adminRoute({
  method: `POST`,
  url: `/rounds/:round/preview`,
  schema: roundParam,
  handler: async (req, session) => {
    const { round } = req.params as { round: number };
    const roundDoc = await getRound(round, session);
    if (roundDoc.status === `allocated`) throw new HttpError(400, `Round ${round} is already allocated.`);
    const plan = await planAllocation(round, session);
    return {
      results: plan.results.map((r) => ({ user: bidderView(r.bidder), number: r.number, choice: r.choice })),
      unallocated: plan.unallocated.map((b) => ({ user: bidderView(b), choices: b.choices })),
    };
  },
});

const allocate = adminRoute({
  method: `POST`,
  url: `/rounds/:round/allocate`,
  schema: roundParam,
  write: true,
  handler: async (req, session) => {
    const { round } = req.params as { round: number };
    const roundDoc = await getRound(round, session);
    if (displayStatus(roundDoc) !== `closed`) {
      throw new HttpError(
        400,
        `Round ${round} can only be allocated after it closes (it is ${displayStatus(roundDoc)}).`,
      );
    }
    const earlier = await JerseyRound.findOne({ round: { $lt: round }, status: { $ne: `allocated` } }).session(
      session.session,
    );
    if (earlier) throw new HttpError(400, `Allocate round ${earlier.round} first.`);

    // Inside the transaction: a concurrent scheduler/admin run hits a write conflict instead of double-allocating.
    const locked = await JerseyRound.findOneAndUpdate(
      { _id: roundDoc._id, status: { $in: [`scheduled`, `held`] } },
      { status: `allocating` },
    ).session(session.session);
    if (!locked) throw new HttpError(409, `Round ${round} is being allocated already.`);
    const summary = await allocateRound(round, session);
    await logEvent(`ADMIN ALLOCATE ROUND ${round}`, session, JSON.stringify(summary), req.session.user._id);
    return publicRound(await getRound(round, session));
  },
});

const undo = adminRoute({
  method: `POST`,
  url: `/rounds/:round/undo`,
  schema: roundParam,
  write: true,
  handler: async (req, session) => {
    const { round } = req.params as { round: number };
    const roundDoc = await getRound(round, session);
    if (roundDoc.status !== `allocated`) throw new HttpError(400, `Round ${round} isn't allocated.`);
    const later = await JerseyRound.findOne({ round: { $gt: round }, status: `allocated` }).session(session.session);
    if (later) throw new HttpError(400, `Undo round ${later.round} first.`);

    const reverted = await undoRound(round, session);
    await logEvent(`ADMIN UNDO ROUND ${round}`, session, JSON.stringify({ reverted }), req.session.user._id);
    return publicRound(await getRound(round, session));
  },
});

export { allocate, list, preview, put, undo };
