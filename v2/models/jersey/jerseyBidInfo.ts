import "@/v2/models/jersey";
import type { iUser } from "@/v2/models/user";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

interface iJerseyBidInfo extends Document {
  user: Types.ObjectId | iUser;
  round: number;
  points: number;
  isAllocated: boolean;
  jersey?: Types.ObjectId;
}

const rJerseyBidInfo = {
  $id: `jerseyBidInfo`,
  type: `object`,
  required: [`round`, `points`],
  properties: {
    round: { type: `number` },
    points: { type: `number` },
    isAllocated: { type: `boolean` },
    jersey: { $ref: `jersey` },
    user: { $ref: `user` },
  },
  additionalProperties: false,
};

const jerseyBidInfoSchema = new Schema<iJerseyBidInfo>({
  user: {
    type: Schema.Types.ObjectId,
    required: true,
    unique: true,
    ref: `User`,
    index: 1,
  },
  round: { type: Number, required: true },
  points: { type: Number, required: true },
  isAllocated: { type: Boolean, required: true, default: false },
  jersey: { type: Schema.Types.ObjectId, ref: `Jersey` },
});

const JerseyBidInfo = model<iJerseyBidInfo>(`JerseyBidInfo`, jerseyBidInfoSchema);

export { iJerseyBidInfo, JerseyBidInfo, rJerseyBidInfo };
