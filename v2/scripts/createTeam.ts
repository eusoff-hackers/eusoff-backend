/* eslint-disable no-console */
import { Team } from "@/v2/models/jersey/team";
import mongoose from "mongoose";

const { env } = process;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  await Team.create({
    name: `Eusoff Hacker is not a team :(`,
    shareable: true,
  });
  console.log(`Createds team.`);
}

run();

export {};
