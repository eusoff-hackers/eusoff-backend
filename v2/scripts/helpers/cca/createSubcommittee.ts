/* eslint-disable no-console */
import { Cca } from "@/v2/models/cca/cca";
import { CcaSubcommittee } from "@/v2/models/cca/ccaSubcommittee";
import mongoose from "mongoose";

const { env } = process;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const cca = await Cca.findOne({ name: "Dance Production" });
  await CcaSubcommittee.create({ name: `Assistant Stage Manager`, cca, description: "" });
  await CcaSubcommittee.create({ name: `Assistant Production Manager`, cca, description: "" });
  console.log(`Finished.`);
}

run();

export {};
