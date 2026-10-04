import { Jersey } from "@/v2/models/jersey/jersey";
import { Member } from "@/v2/models/jersey/member";
import { User } from "@/v2/models/user";
import type { iUser } from "@/v2/models/user";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

User;
Jersey;
Member;

interface iJerseyBidInfo extends Document {
  user: Types.ObjectId | iUser;
  round: number;
  points: number;
  isAllocated: boolean;
  jersey?: Types.ObjectId;
  allocatedRound?: number;
  breakdown?: iPointsBreakdown;
}

interface iPointsBreakdown {
  finalCut2526: number;
  firstCut2627: number;
  captain: number;
  adjustment: number;
}

const rJerseyBidInfo = {
  $id: `jerseyBidInfo`,
  type: `object`,
  required: [`round`, `points`],
  properties: {
    user: { $ref: `user` },
    round: { type: `number` },
    points: { type: `number` },
    isAllocated: { type: `boolean` },
    jersey: { $ref: `jersey` },
    allocatedRound: { type: `number` },
    breakdown: {
      type: `object`,
      properties: {
        finalCut2526: { type: `number` },
        firstCut2627: { type: `number` },
        captain: { type: `number` },
        adjustment: { type: `number` },
      },
      additionalProperties: false,
    },
    teams: { type: `array`, items: { $ref: `member` } },
  },
  additionalProperties: false,
};

const jerseyBidInfoSchema = new Schema<iJerseyBidInfo>(
  {
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
    allocatedRound: { type: Number },
    breakdown: {
      finalCut2526: { type: Number, default: 0 },
      firstCut2627: { type: Number, default: 0 },
      captain: { type: Number, default: 0 },
      adjustment: { type: Number, default: 0 },
    },
  },
  {
    toObject: { virtuals: true },
    virtuals: {
      teams: {
        options: {
          ref: `Member`,
          localField: `user`,
          foreignField: `user`,
        },
      },
    },
  },
);

const JerseyBidInfo = model<iJerseyBidInfo>(`JerseyBidInfo`, jerseyBidInfoSchema);

export { iJerseyBidInfo, iPointsBreakdown, JerseyBidInfo, rJerseyBidInfo };
