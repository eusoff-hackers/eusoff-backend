import "@/v2/models/team";
import "@/v2/models/user";
import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

interface iMember extends Document {
  user: Types.ObjectId;
  team: Types.ObjectId;
}

const memberSchema = new Schema<iMember>({
  user: { type: Schema.Types.ObjectId, required: true, ref: `User`, index: 1 },
  team: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: `Team`,
  },
});

const Member = model<iMember>(`Member`, memberSchema);

export { iMember, Member };
