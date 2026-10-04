import crypto from "crypto";
import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

/**
 * `held`: closed but deliberately not auto-allocated (an admin undid it); waits for "Allocate now".
 * Later rounds also wait, since rounds must be allocated in order.
 */
type RoundStatus = `scheduled` | `held` | `allocating` | `allocated`;

interface iJerseyRound extends Document {
  round: number;
  open: number;
  close: number;
  status: RoundStatus;
  /** Seeds the tie-break shuffle so an admin preview matches the real allocation. Never sent to clients. */
  seed: number;
  allocatedAt?: number;
  summary?: {
    bidders: number;
    allocated: number;
    unallocatedBidders: number;
  };
}

const jerseyRoundSchema = new Schema<iJerseyRound>({
  round: { type: Number, required: true, unique: true, min: 1, max: 4 },
  open: { type: Number, required: true },
  close: { type: Number, required: true },
  status: {
    type: String,
    enum: [`scheduled`, `held`, `allocating`, `allocated`],
    default: `scheduled`,
    required: true,
  },
  seed: { type: Number, required: true, default: () => crypto.randomInt(2 ** 31) },
  allocatedAt: { type: Number },
  summary: {
    bidders: { type: Number },
    allocated: { type: Number },
    unallocatedBidders: { type: Number },
  },
});

const JerseyRound = model<iJerseyRound>(`JerseyRound`, jerseyRoundSchema);

/**
 * Status as seen by clients: stored status, refined by the clock for rounds not yet allocated.
 */
function displayStatus(round: Pick<iJerseyRound, `open` | `close` | `status`>, now = Date.now()) {
  if (round.status === `held`) return `closed`;
  if (round.status !== `scheduled`) return round.status;
  if (now < round.open) return `scheduled`;
  if (now < round.close) return `open`;
  return `closed`;
}

function publicRound(round: iJerseyRound, now = Date.now()) {
  return {
    round: round.round,
    open: round.open,
    close: round.close,
    status: displayStatus(round, now),
    allocatedAt: round.allocatedAt,
    summary: round.summary?.bidders === undefined ? undefined : round.summary,
  };
}

export { iJerseyRound, JerseyRound, RoundStatus, displayStatus, publicRound };
