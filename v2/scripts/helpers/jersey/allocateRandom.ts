/* eslint-disable no-console */
import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBan } from "@/v2/models/jersey/jerseyBan";
import type { iJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import { type iUser } from "@/v2/models/user";
import { getEligible } from "@/v2/utils/jersey";
import { logAndThrow } from "@/v2/utils/logger";
import { MongoSession } from "@/v2/utils/mongoSession";
import mongoose from "mongoose";
import readline from "readline";

function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

const getRand = sfc32(69, 420, 1203823, 2128392839);

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
    // jersey.quota[bidder.user.gender] = 0;
  } else {
    await Jersey.findOneAndUpdate({ _id: jersey._id }, { $inc: { [`quota.${bidder.user.gender}`]: -1 } })
      .orFail()
      .session(session.session);
    // jersey.quota[bidder.user.gender] -= 1;
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

// async function allocate(jersey: iJersey, priority: number, round: number, session: MongoSession) {
//   // console.log(`Allocating jersey ${jersey.number} with priority ${priority}`);
//   const bids = await JerseyBid.find({ jersey: jersey._id, priority, round }).lean().session(session.session);

//   let bidders = logAndThrow(
//     await Promise.allSettled(
//       bids.map(
//         async (b) =>
//           await JerseyBidInfo.findOne({ user: b.user })
//             .populate<{ user: iUser }>("user")
//             .session(session.session)
//             .orFail(),
//       ),
//     ),
//     "Fail",
//   );

//   bidders.sort((a, b) => {
//     if (a.points != b.points) return a.points - b.points;
//     else if (a.user.year != b.user.year) return a.user.year - b.user.year;
//     else {
//       return getRand() - 0.5;
//     }
//   });

//   while (bidders.length > 0) {
//     const tmp = logAndThrow(
//       await Promise.allSettled(
//         bidders.map(async (b) => {
//           return {
//             bidder: b,
//             eligible: await isEligibleWithoutUserLegible(b.user, [jersey], session),
//             isAllocated: (await JerseyBidInfo.findOne({ _id: b._id }).orFail().session(session.session)).isAllocated,
//           };
//         }),
//       ),
//       "Bidder eligibility parse error",
//     );

//     tmp
//       .filter((bidder) => !bidder.eligible)
//       .forEach((b) => console.log(`${b.bidder.user.username} failed to get ${jersey.number}`));
//     tmp
//       .filter((bidder) => bidder.isAllocated)
//       .forEach((b) => console.log(`${b.bidder.user.username} already allocated, skipping..`));

//     bidders = tmp.filter((bidder) => bidder.eligible && !bidder.isAllocated).map((b) => b.bidder);

//     if (bidders.length == 0) break;

//     const bidder = bidders.pop();
//     if (!bidder) break;

//     await allocateUser(bidder, jersey, round, session);
//   }
// }

function shuffle<T>(array: T[]): T[] {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    const randomIndex = Math.floor(getRand() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
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
    const users = shuffle(
      await JerseyBidInfo.find({ isAllocated: false }).populate<{ user: iUser }>("user").session(session.session),
    );

    for (const bidder of users) {
      const { user } = bidder;
      const jerseys = shuffle(await getEligible(user, session));
      if (jerseys.length == 0) {
        throw new Error(`No assignable jersey for ${user.username}`);
      }
      allocateUser(bidder, await Jersey.findOne({ number: jerseys[0] }).orFail().session(session.session), 5, session);
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
