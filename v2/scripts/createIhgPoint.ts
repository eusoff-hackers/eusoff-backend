/* eslint-disable no-console */
import { Hall } from "@/v2/models/hall";
import { IhgPoint } from "@/v2/models/ihgPoint";
import mongoose from "mongoose";

const { env } = process;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const halls = await Hall.find();

  const points = halls.map((h) => ({
    hall: h._id,
  }));

  console.log(halls, points);
  await IhgPoint.create(points);

  console.log(`Finished.`);
}

run();

export {};
