const { env } = process;
import mongoose from 'mongoose';
import { IhgPlacement } from '@/v2/models/ihgPlacement';
import { IhgSport } from '@/v2/models/ihgSport';
import { Hall } from '@/v2/models/hall';

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const halls = await Hall.find();
  const sports = await IhgSport.find();

  await IhgPlacement.create({
    hall: halls[0],
    sport: sports[0],
    place: 3,
  });

  console.log(`Finished.`);
}

run();

export {};
