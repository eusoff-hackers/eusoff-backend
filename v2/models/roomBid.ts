import type { iRoom } from "@/v2/models/room";
import type { iRoomBidInfo } from "@/v2/models/roomBidInfo";
import type { iUser } from "@/v2/models/user";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

interface iRoomBid extends Document {
  user?: Types.ObjectId | iUser;
  room?: Types.ObjectId | iRoom;
  priority: number;
  info?: iRoomBidInfo;
}

const rRoomBid = {
  $id: `roomBid`,
  type: `object`,
  required: [],
  properties: {
    user: { $ref: `user` },
    room: { $ref: `room` },
    priority: { type: `number` },
    info: { $ref: `roomBidInfo` },
  },
  additionalProperties: false,
};

const roomBidSchema = new Schema<iRoomBid>(
  {
    user: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: `User`,
      index: 1,
    },
    room: { type: Schema.Types.ObjectId, required: true, ref: `Room` },
    priority: { type: Number, required: true },
  },
  {
    toObject: { virtuals: true },
    virtuals: {
      info: {
        options: {
          ref: `RoomBidInfo`,
          localField: `user`,
          foreignField: `user`,
          justOne: true,
        },
      },
    },
  },
);

const RoomBid = model<iRoomBid>(`RoomBid`, roomBidSchema);

export { iRoomBid, RoomBid, rRoomBid };
