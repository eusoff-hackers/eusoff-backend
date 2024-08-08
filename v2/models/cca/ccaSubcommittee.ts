import { type Document, Schema, type Types, model } from "mongoose";

interface iCcaSubcommittee extends Document {
  _id: Types.ObjectId;
  name: string;
  cca: Types.ObjectId;
  description?: string;
}

const rCcaSubcommittee = {
  $id: `ccaSubcommittee`,
  type: `object`,
  required: [`_id`],
  properties: {
    _id: { type: `string` },
    name: { type: `string` },
    cca: { type: `string` },
    description: { type: `string` },
  },
  additionalProperties: false,
};

const ccaSubcommitteeSchema = new Schema<iCcaSubcommittee>({
  name: { type: String, required: true, index: 1 },
  cca: { type: Schema.Types.ObjectId, required: true, ref: `Cca` },
  description: { type: String },
});

const CcaSubcommittee = model<iCcaSubcommittee>(`CcaSubcommittee`, ccaSubcommitteeSchema);

export { iCcaSubcommittee, CcaSubcommittee, rCcaSubcommittee };
