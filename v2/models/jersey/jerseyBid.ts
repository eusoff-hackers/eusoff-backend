import { Jersey } from "@/v2/models/jersey/jersey";
import type { iJersey } from "@/v2/models/jersey/jersey";
import { User } from "@/v2/models/user";
import type { iUser } from "@/v2/models/user";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

Jersey;
User;

interface iJerseyBid extends Document {
  user: Types.ObjectId | iUser;
  jersey: Types.ObjectId | iJersey;
  priority: number;
  round: number;
}

const rJerseyBid = {
  $id: `jerseyBid`,
  type: `object`,
  required: [`jersey`, `round`],
  properties: {
    jersey: { $ref: `jersey` },
    priority: { type: `number` },
    round: { type: `number` },
  },
  additionalProperties: false,
};

const jerseyBidSchema = new Schema<iJerseyBid>({
  user: { type: Schema.Types.ObjectId, required: true, ref: `User` },
  jersey: { type: Schema.Types.ObjectId, required: true, ref: `Jersey` },
  priority: { type: Number, required: true },
  round: { type: Number, required: true, min: 1, max: 4 },
});

// To make unique (user, team)
jerseyBidSchema.index({ user: 1, priority: 1 }, { unique: true });

const JerseyBid = model<iJerseyBid>(`JerseyBid`, jerseyBidSchema);

export { iJerseyBid, JerseyBid, rJerseyBid };
