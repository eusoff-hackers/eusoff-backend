import { Team } from "@/v2/models/jersey/team";
import type { iTeam } from "@/v2/models/jersey/team";
import { User } from "@/v2/models/user";
import type { iUser } from "@/v2/models/user";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

Team;
User;

interface iMember extends Document {
  user: Types.ObjectId | iUser;
  team: Types.ObjectId | iTeam;
}

const memberSchema = new Schema<iMember>({
  user: { type: Schema.Types.ObjectId, required: true, ref: `User` },
  team: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: `Team`,
  },
});

// To make unique (user, team)
memberSchema.index({ user: 1, team: 1 }, { unique: true });

const Member = model<iMember>(`Member`, memberSchema);

export { iMember, Member };
