import { User } from "@/v2/models/user";
import { hash } from "bcryptjs";
import mongoose from "mongoose";

const { env } = process;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  await User.create({
    username: "C111",
    password: await hash(`mediumcoock`, 10),
    year: 1,
    role: `ADMIN`,
    gender: `Female`,
    email: `haha@gmail.com`,
  });
  console.log(`Finished.`);
}

run();

export {};
