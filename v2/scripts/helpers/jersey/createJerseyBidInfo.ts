/* eslint-disable no-console */
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { MongoSession } from "@/v2/utils/mongoSession";
import mongoose from "mongoose";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const session = new MongoSession();
  await session.start();
  try {
    await JerseyBidInfo.create([{ user: "65103b7c55c6cc52dfa3b57c", round: 2, points: 12 }], {
      session: session.session,
    });
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
