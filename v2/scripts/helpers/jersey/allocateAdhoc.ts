/* eslint-disable no-console */
import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBan } from "@/v2/models/jersey/jerseyBan";
import type { iJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import { User, type iUser } from "@/v2/models/user";
import { isEligibleWithoutUserLegible } from "@/v2/utils/jersey";
import { logAndThrow } from "@/v2/utils/logger";
import { MongoSession } from "@/v2/utils/mongoSession";
import mongoose from "mongoose";
import readline from "readline";

async function allocateUser(
  bidder: Omit<iJerseyBidInfo, "user"> & { user: iUser },
  jersey: iJersey,
  round: number,
  session: MongoSession,
) {
  console.log(`Allocating jersey ${jersey.number} to ${bidder.user.username}`);

  await JerseyBidInfo.findOneAndUpdate({ user: bidder.user._id }, { isAllocated: true, jersey: jersey._id })
    .orFail()
    .session(session.session);

  if (round === 1) {
    await Jersey.findOneAndUpdate({ _id: jersey._id }, { [`quota.${bidder.user.gender}`]: 0 })
      .orFail()
      .session(session.session);
    jersey.quota[bidder.user.gender] = 0;
  } else {
    await Jersey.findOneAndUpdate({ _id: jersey._id }, { $inc: { [`quota.${bidder.user.gender}`]: -1 } })
      .orFail()
      .session(session.session);
    jersey.quota[bidder.user.gender] -= 1;
  }

  const teams = await Member.find({ user: bidder.user._id }).populate<{ team: iTeam }>("team").session(session.session);

  logAndThrow(
    await Promise.allSettled(
      teams.map(async ({ team }) => {
        if (team.shareable === false) {
          console.log(`Creating ban from ${team.name} to ${jersey.number}`);
          await JerseyBan.create([{ jersey: jersey._id, team: team._id }], { session: session.session });
        }
      }),
    ),
    `Team ban creation error`,
  );
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const session = new MongoSession();
  await session.start();
  try {
    const username = "A0308877L";
    const jerseyNumber = 31;
    const round = 3;

    const jersey = await Jersey.findOne({ number: jerseyNumber }).session(session.session).orFail();
    const user = await User.findOne({ username }).session(session.session).orFail();
    const bidInfo = await JerseyBidInfo.findOne({ user: user._id })
      .session(session.session)
      .populate<{ user: iUser }>("user")
      .orFail();

    if ((await isEligibleWithoutUserLegible(user, [jersey], session)) === false) {
      console.log("User not legible.");
    } else if (bidInfo.isAllocated) {
      console.log("User already allocated.");
    } else {
      console.log("Allocating user");
      await allocateUser(bidInfo, jersey, round, session);
    }

    const answer = await new Promise((resolve) => {
      rl.question(`Commit? (y/n) `, resolve);
    });
    if (answer === `y`) await session.commit();

    console.log("SUCCESS");
  } catch (err) {
    console.error(err);
    await session.abort();
  } finally {
    await session.end();
  }
})();

export {};
