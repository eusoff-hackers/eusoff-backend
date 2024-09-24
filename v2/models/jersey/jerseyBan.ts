import "@/v2/models/jersey";
import type { iJersey } from "@/v2/models/jersey/jersey";
import type { iTeam } from "@/v2/models/jersey/team";
import "@/v2/models/team";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

interface iJerseyBan extends Document {
  jersey: Types.ObjectId | iJersey;
  team: Types.ObjectId | iTeam;
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
