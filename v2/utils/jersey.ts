import type { iJersey } from "@/v2/models/jersey/jersey";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBan } from "@/v2/models/jersey/jerseyBan";
import type { iJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Member } from "@/v2/models/jersey/member";
import type { iServer } from "@/v2/models/server";
import { Server } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { logAndThrow, logger, reportError } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";

/**
 * Check if a user is eligible to make/edit their bids
 *
 * @param user The user in question
 * @param session Mandatory transaction session
 * @returns whether or not the user is eligible to make/edit their bids
 */
async function checkUserLegible(user: iUser, session: MongoSession): Promise<boolean> {
  try {
    const [bidOpen, bidClose, round, bidInfo]: [iServer | null, iServer | null, iServer | null, iJerseyBidInfo | null] =
      logAndThrow<iServer | iJerseyBidInfo | null>(
        await Promise.allSettled([
          Server.findOne({ key: `jerseyBidOpen` }).session(session.session),
          Server.findOne({ key: `jerseyBidClose` }).session(session.session),
          Server.findOne({ key: `jerseyBidRound` }).session(session.session),
          JerseyBidInfo.findOne({ user: user._id }).session(session.session),
        ]),
        `Getting server config error`,
      ) as [iServer | null, iServer | null, iServer | null, iJerseyBidInfo | null];

    if (
      !bidOpen ||
      !(typeof bidOpen.value === "number") ||
      !bidClose ||
      !(typeof bidClose.value === "number") ||
      !round ||
      !bidInfo
    ) {
      logger.error(`Check user   results are null | undefined`);
      throw new Error(`Some datas are null | undefined`);
    }

    if (
      bidInfo.round > (round.value as number) ||
      bidInfo.isAllocated ||
      bidOpen.value > Date.now() ||
      bidClose.value < Date.now()
    )
      return false;

    return true;
  } catch (error) {
    reportError(error, `User eligiblity check error`);
    throw new Error(`User eligiblity check error`);
  }
}

async function getTeams(user: iUser, session: MongoSession) {
  return (await Member.find({ user: user._id }).lean().populate(`team`).session(session.session)).map(
    (team) => team.team._id,
  );
}

async function isEligibleWithoutUserLegible(user: iUser, jerseys: iJersey[], session: MongoSession) {
  try {
    const teams = await getTeams(user, session);

    if (jerseys.some((j) => j.quota[user.gender] === 0)) {
      return false;
    }

    if (
      await JerseyBan.exists({
        team: { $in: teams },
        jersey: { $in: jerseys },
      }).session(session.session)
    ) {
      return false;
    }
    return true;
  } catch (error) {
    reportError(error, `isEligible error`);
    throw new Error(`isEligible error`);
  }
}

/**
 * Check if a user can bid for all the jerseys in `jerseys`.
 *
 * We try our best to optimize this function since it is the core of the operations.
 * Do not pass non-updated jerseys or user. We assume user and jersey is correct.
 *
 * @param user The user in question
 * @param jerseys The jerseys in question
 * @param session Mandatory transaction session
 * @returns whether or not user is eligible to bid for all jerseys
 */
async function isEligible(user: iUser, jerseys: iJersey[], session: MongoSession) {
  try {
    if ((await checkUserLegible(user, session)) === false) return false;

    return await isEligibleWithoutUserLegible(user, jerseys, session);
  } catch (error) {
    reportError(error, `isEligible error`);
    throw new Error(`isEligible error`);
  }
}

async function getEligible(user: iUser, session: MongoSession): Promise<number[]> {
  if ((await checkUserLegible(user, session)) === false) {
    return [];
  }

  const teams = await getTeams(user, session);

  const banned = (
    await JerseyBan.find({ team: { $in: teams } })
      .lean()
      .session(session.session)
  ).map((ban) => ban.jersey);

  const eligibleJerseys = (await Jersey.find({ _id: { $nin: banned } }).session(session.session))
    .filter((j) => j.quota[user.gender] !== 0)
    .map((jersey) => jersey.number);

  return eligibleJerseys;
}

/**
 * Compare between two users.
 *
 * Returns:
 *  1 if user1 should win,
 *  -1 if user2 should win,
 *  0 if it's a draw
 *
 * @param user1
 * @param user2
 * @returns
 */
async function compare(user1: iJerseyBidInfo, user2: iJerseyBidInfo) {
  if (user1.points < user2.points) return -1;
  else if (user1.points > user2.points) return 1;
  else return 0;
}

export { checkUserLegible, isEligible, getEligible, compare, isEligibleWithoutUserLegible };
