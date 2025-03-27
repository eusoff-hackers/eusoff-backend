/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { MongoSession } from "@/v2/utils/mongoSession";
import mongoose from "mongoose";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const session = new MongoSession();
  await session.start();
  try {
    console.log(
      await JerseyBidInfo.findOne({ user: "670c8e1ccdf95424d35e2c2f" })
        .session(session.session)
        .populate<{ teams: unknown }>({ path: "teams", populate: { path: "team", model: "Team" } }),
    );
  } catch (err) {
    console.error(err);
  } finally {
    await session.abort();
    await session.end();
  }
})();
