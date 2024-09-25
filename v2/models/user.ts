import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

interface iUser extends Document {
  username: string;
  password: string;
  role: `USER` | `ADMIN`;
  year: number;
  gender: `male` | `female`;
  email: string;
  room: string;
}

const rUser = {
  $id: `user`,
  type: `object`,
  properties: {
    username: { type: `string` },
    role: { type: `string`, enum: [`USER`, `ADMIN`] },
    year: { type: `number`, minimum: 0, maximum: 5 },
    gender: { type: `string`, enum: [`male`, `female`] },
    room: { type: `string` },
  },
  additionalProperties: false,
};

const userSchema = new Schema<iUser>(
  {
    username: { type: String, required: true, unique: true, index: 1 },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: [`USER`, `ADMIN`],
      default: `USER`,
      required: true,
    },
    year: { type: Number, min: 0, max: 5, required: true },
    gender: { type: String, enum: [`male`, `female`], required: true },
    email: { type: String },
    room: { type: String, required: true },
  },
  { toObject: { virtuals: true } },
);

const User = model<iUser>(`User`, userSchema);

export { iUser, User, rUser };
