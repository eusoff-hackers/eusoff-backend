import { Cca } from "@/v2/models/cca";
import mongoose from "mongoose";

const { env } = process;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  await Cca.create({ name: `Eating` });
  console.log(`Finished.`);
}

run();

export {};
