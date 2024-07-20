import "@/v2/models/hall";
import type { iIhgSport } from "@/v2/models/ihgSport";
import type { Document, PopulatedDoc, Types } from "mongoose";
import { Schema, model } from "mongoose";

interface iIhgPlacement extends Document {
  hall: Types.ObjectId;
  sport: PopulatedDoc<iIhgSport>;
  place: number;
}

const rIhgPlacement = {
  $id: `ihgPlacement`,
  type: `object`,
  required: [`hall`, `sport`, `place`],
  properties: {
    hall: { $ref: `hall` },
    sport: { $ref: `ihgSport` },
    place: { type: `number` },
  },
  additionalProperties: false,
};

const ihgPlacementSchema = new Schema<iIhgPlacement>({
  hall: { type: Schema.Types.ObjectId, required: true, ref: `Hall`, index: 1 },
  sport: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: `IhgSport`,
  },
  place: { type: Number, min: 1, max: 6 },
});

const IhgPlacement = model<iIhgPlacement>(`IhgPlacement`, ihgPlacementSchema);

export { iIhgPlacement, IhgPlacement, rIhgPlacement };
