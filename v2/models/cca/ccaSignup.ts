import type { Document, Types } from "mongoose";
import { Schema, model } from "mongoose";

interface iCcaSignup extends Document {
  user?: Types.ObjectId;
  cca: Types.ObjectId;
  reason: string;
  subcommittees: Types.ObjectId[];
}

const rCcaSignup = {
  $id: `ccaSignup`,
  type: `object`,
  required: [`cca`, `reason`, `subcommittees`],
  properties: {
    cca: { $ref: `cca` },
    reason: {
      type: "string",
      maxLength: 500,
    },
    subcommittees: { type: `array`, items: { $ref: `ccaSubcommittee` } },
  },
  additionalProperties: false,
};

const ccaSignupSchema = new Schema<iCcaSignup>({
  user: { type: Schema.Types.ObjectId, required: true, ref: `User`, index: 1 },
  cca: { type: Schema.Types.ObjectId, required: true, ref: `Cca` },
  reason: { type: Schema.Types.String, required: true, maxlength: 500 },
  subcommittees: [{ type: Schema.Types.ObjectId, ref: `CcaSubcommittee` }],
});

const CcaSignup = model<iCcaSignup>(`CcaSignup`, ccaSignupSchema);

export { iCcaSignup, CcaSignup, rCcaSignup };
