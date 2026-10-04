/* eslint-disable no-console */
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { User } from "@/v2/models/user";
import { generatePassword } from "@/v2/utils/password";
import bcrypt from "bcrypt";
import mongoose from "mongoose";

/**
 * Create (or reset the password of) a non-resident account and print its password once.
 *
 * Usage: node build/v2/scripts/createAccount.js <username> <ADMIN|USER> [name] [gender] [round]
 * A USER also gets jersey bid info (0 points) so it can be used to test bidding.
 */
(async () => {
  const [username, role, name = username, gender = `male`, round = `1`] = process.argv.slice(2);
  if (!username || ![`ADMIN`, `USER`].includes(role))
    throw new Error(`usage: createAccount <username> <ADMIN|USER> [name] [gender] [round]`);

  await mongoose.connect(process.env.MONGO_URI);
  const password = generatePassword(4);
  const hash = await bcrypt.hash(password, 10);

  const user = await User.findOneAndUpdate(
    { username },
    { $set: { password: hash, role, name }, $setOnInsert: { username, gender, year: 1, room: `-` } },
    { upsert: true, new: true },
  );
  if (role === `USER`) {
    await JerseyBidInfo.updateOne(
      { user: user._id },
      { $setOnInsert: { user: user._id, round: Number(round), points: 0, isAllocated: false } },
      { upsert: true },
    );
  }

  console.log(JSON.stringify({ username, role, password }));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
