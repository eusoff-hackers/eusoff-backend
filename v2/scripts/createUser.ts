/* eslint-disable no-console */
import { RoomBidInfo } from "@/v2/models/roomBidInfo";
import { User } from "@/v2/models/user";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const { env } = process;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const user = await User.create({
    username: "female4",
    password: await bcrypt.hash(`female4`, 10),
    year: 1,
    role: `ADMIN`,
    gender: `Female`,
    email: `e1129892@u.nus.edu`,
    room: `female4 Room`,
  });

  await RoomBidInfo.create({
    user: user._id,
    isEligible: true,
    points: 40,
    pointsDistribution: [],
  });
  console.log(`Finished.`);
}

run();

export {};
