import { Jersey } from "@/v2/models/jersey/jersey";
import type { iJersey } from "@/v2/models/jersey/jersey";
import type { iTeam } from "@/v2/models/jersey/team";
import { Team } from "@/v2/models/jersey/team";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

Jersey;
Team;

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
