import "@/v2/models/jersey";
import "@/v2/models/team";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

interface iJerseyBan extends Document {
  jersey: Types.ObjectId;
  team: Types.ObjectId;
}

const jerseyBanSchema = new Schema<iJerseyBan>({
  jersey: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: `Jersey`,
    index: 1,
  },
  team: { type: Schema.Types.ObjectId, required: true, ref: `Team`, index: 1 },
});

const JerseyBan = model<iJerseyBan>(`JerseyBan`, jerseyBanSchema);

export { iJerseyBan, JerseyBan };
