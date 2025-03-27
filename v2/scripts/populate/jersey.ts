/* eslint-disable no-console */
import { Jersey } from "@/v2/models/jersey/jersey";
import { MongoSession } from "@/v2/utils/mongoSession";
import mongoose from "mongoose";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const session = new MongoSession();
  await session.start();
  try {
    for (let i = 0; i < 100; ++i) {
      const quota = i < 10 ? 1 : 3;
      await Jersey.create([{ number: i, quota: { male: quota, female: quota } }], { session: session.session });
    }

    await session.commit();
    console.log("SUCCESS");
  } catch (err) {
    console.error(err);
    await session.abort();
  } finally {
    await session.end();
  }
})();

export {};
