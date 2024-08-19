/* eslint-disable no-console */
import { RoomBidInfo } from "@/v2/models/roomBidInfo";
import { User } from "@/v2/models/user";
import mongoose from "mongoose";

const { env } = process;

async function run() {
  await mongoose.connect(env.MONGO_URI);

  const session = await mongoose.startSession();

  await session.startTransaction({
    readConcern: { level: `snapshot` },
    writeConcern: { w: `majority`, j: true },
  });
  try {
    const res = (await User.find().session(session)).map((u) => ({
      user: u._id,
      isEligible: false,
      points: 0,
      isAllocated: false,
    }));
    await RoomBidInfo.create(res, { session });

    try {
      await session.commitTransaction();
    } catch (e) {
      await session.abortTransaction();
      console.error(e);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await session.endSession();
  }

  // await BiddingInfo.create({
  //   user: `65103b7c55c6cc52dfa3b57c`,
  //   round: 1,
  //   points: 1,
  //   allocated: false,
  // });
  console.log(`Finished.`);
}

run();

export {};
