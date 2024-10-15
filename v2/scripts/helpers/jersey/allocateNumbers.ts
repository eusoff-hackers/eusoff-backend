/* eslint-disable no-console */
import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBan } from "@/v2/models/jersey/jerseyBan";
import { JerseyBid } from "@/v2/models/jersey/jerseyBid";
import type { iJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import { Server } from "@/v2/models/server";
import { type iUser } from "@/v2/models/user";
import { isEligibleWithoutUserLegible } from "@/v2/utils/jersey";
import { logAndThrow } from "@/v2/utils/logger";
import { MongoSession } from "@/v2/utils/mongoSession";
import mongoose from "mongoose";

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

async function allocate(jersey: iJersey, priority: number, round: number, session: MongoSession) {
  // console.log(`Allocating jersey ${jersey.number} with priority ${priority}`);
  const bids = await JerseyBid.find({ jersey: jersey._id, priority, round }).lean().session(session.session);

  let bidders = logAndThrow(
    await Promise.allSettled(
      bids.map(
        async (b) =>
          await JerseyBidInfo.findOne({ user: b.user })
            .populate<{ user: iUser }>("user")
            .session(session.session)
            .orFail(),
      ),
    ),
    "Fail",
  );

  bidders.sort((a, b) => {
    if (a.points != b.points) return a.points - b.points;
    else if (a.user.year != b.user.year) return a.user.year - b.user.year;
    else {
      return getRand() - 0.5;
    }
  });

  while (bidders.length > 0) {
    const tmp = logAndThrow(
      await Promise.allSettled(
        bidders.map(async (b) => {
          return {
            bidder: b,
            eligible:
              (await isEligibleWithoutUserLegible(b.user, [jersey], session)) &&
              (await JerseyBidInfo.findOne({ _id: b._id }).orFail().session(session.session)).isAllocated === false,
          };
        }),
      ),
      "Bidder eligibility parse error",
    );
    bidders = tmp.filter((bidder) => bidder.eligible).map((b) => b.bidder);

    if (bidders.length == 0) break;

    const bidder = bidders.pop();
    if (!bidder) break;

    await allocateUser(bidder, jersey, round, session);
  }
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const session = new MongoSession();
  await session.start();
  try {
    const currentRound = (await Server.findOne({ key: "jerseyBidRound" }).session(session.session).orFail()).value;

    if (typeof currentRound !== "number") throw new Error("Round query error.");

    for (let cur_priority = 0; cur_priority < 5; ++cur_priority) {
      const jerseys = logAndThrow(
        await Promise.allSettled(await Jersey.find().session(session.session)),
        "Fail to parse jerseys",
      );
      for (let i = 0; i < jerseys.length; ++i) {
        await allocate(jerseys[i], cur_priority, currentRound, session);
      }
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
