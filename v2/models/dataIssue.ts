import type { Document } from "mongoose";
import { Schema, model } from "mongoose";

/** Discrepancies found while importing spreadsheets, for admins to review. */
interface iDataIssue extends Document {
  category: string;
  detail: string;
  resolved: boolean;
}

const dataIssueSchema = new Schema<iDataIssue>({
  category: { type: String, required: true, index: 1 },
  detail: { type: String, required: true },
  resolved: { type: Boolean, required: true, default: false },
});

const DataIssue = model<iDataIssue>(`DataIssue`, dataIssueSchema);

export { iDataIssue, DataIssue };
