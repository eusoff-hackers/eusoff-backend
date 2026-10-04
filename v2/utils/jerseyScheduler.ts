import { JerseyRound } from "@/v2/models/jersey/jerseyRound";
import { Server } from "@/v2/models/server";
import { allocateRound } from "@/v2/utils/jerseyAllocation";
import { logEvent, logger, reportError } from "@/v2/utils/logger";
import { MongoSession } from "@/v2/utils/mongoSession";

const TICK_MS = 15_000;

/**
 * The bid endpoints read `jerseyBidRound/Open/Close` from Server. Point them at the round that is
 * open now, else the next one to open, else the last round (so the UI shows a sensible window).
 */
async function syncServerWindow(now: number) {
  const rounds = await JerseyRound.find().sort({ round: 1 }).lean();
  if (rounds.length === 0) return;
  const target =
    rounds.find((r) => r.open <= now && now < r.close) ?? rounds.find((r) => now < r.open) ?? rounds[rounds.length - 1];

  const want = { jerseyBidRound: target.round, jerseyBidOpen: target.open, jerseyBidClose: target.close };
  for (const [key, value] of Object.entries(want)) {
    await Server.updateOne({ key }, { $set: { key, value } }, { upsert: true });
  }
}

/**
 * Allocate rounds that have closed, strictly in order: a round is only allocated once every earlier
 * round is. The status flip to `allocating` is the lock, so overlapping ticks can't double-allocate.
 */
async function allocateClosedRounds(now: number) {
  const rounds = await JerseyRound.find().sort({ round: 1 }).lean();
  for (const r of rounds) {
    if (r.status === `allocated`) continue;
    if (r.status !== `scheduled` || now < r.close) return;

    const locked = await JerseyRound.findOneAndUpdate({ _id: r._id, status: `scheduled` }, { status: `allocating` });
    if (!locked) return;

    const session = new MongoSession();
    try {
      await session.start();
      const summary = await allocateRound(r.round, session);
      await logEvent(`AUTO ALLOCATE ROUND ${r.round}`, session, JSON.stringify(summary));
      await session.commit();
      logger.info(`Round ${r.round} allocated automatically: ${JSON.stringify(summary)}`);
    } catch (error) {
      reportError(error, `Automatic allocation of round ${r.round} failed`);
      await session.abort().catch(() => {});
      await JerseyRound.updateOne({ _id: r._id, status: `allocating` }, { status: `scheduled` });
      return;
    } finally {
      await session.end();
    }
  }
}

async function tick() {
  const now = Date.now();
  try {
    await allocateClosedRounds(now);
    await syncServerWindow(now);
  } catch (error) {
    reportError(error, `Jersey scheduler tick failed`);
  }
}

function startJerseyScheduler() {
  // A crash mid-allocation leaves a round stuck in `allocating`; the transaction was never committed,
  // so it's safe to retry.
  JerseyRound.updateMany({ status: `allocating` }, { status: `scheduled` })
    .then(tick)
    .catch((error) => reportError(error, `Jersey scheduler start failed`));
  setInterval(tick, TICK_MS);
}

export { startJerseyScheduler, syncServerWindow };
