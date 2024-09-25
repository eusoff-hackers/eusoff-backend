/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import { mail } from "@/v2/utils/mailer";
import { MongoSession } from "@/v2/utils/mongoSession";
import mongoose from "mongoose";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const session = new MongoSession();
  await mail(
    {
      subject: `Urgent Alert: Risk of Being Outbidded`,
      title: `Alert: You are in danger of being outbidded!`,
      body: ["Testing"],
      email: "juan.c.vieri@u.nus.edu",
      username: "A12346778",
      userId: new mongoose.Types.ObjectId("65103b7c55c6cc52dfa3b57c"),
    },
    session,
  );
})();
