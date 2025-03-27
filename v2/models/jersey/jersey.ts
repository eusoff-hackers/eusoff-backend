import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

interface iJersey extends Document {
  number: number;
  quota: {
    male: number;
    female: number;
  };
}

const rJersey = {
  $id: `jersey`,
  type: `object`,
  required: [`number`],
  properties: {
    number: { type: `number` },
    quota: {
      type: `object`,
      required: [`male`, `female`],
      properties: {
        male: { type: `number` },
        female: { type: `number` },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const jerseySchema = new Schema<iJersey>({
  number: { type: Number, required: true, unique: true, index: 1 },
  quota: {
    male: { type: Number, required: true, default: 3 },
    female: { type: Number, required: true, default: 3 },
  },
});

const Jersey = model<iJersey>(`Jersey`, jerseySchema);

export { iJersey, Jersey, rJersey };
