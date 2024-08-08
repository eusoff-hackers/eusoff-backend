import { Room } from "@/v2/models/room";
import type { iRoom } from "@/v2/models/room";
import { RoomBidInfo } from "@/v2/models/roomBidInfo";
import type { iRoomBidInfo } from "@/v2/models/roomBidInfo";
import { Server } from "@/v2/models/server";
import type { iServer } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { logAndThrow, logger, reportError } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";
import { Types } from "mongoose";

async function isEligible(user: iUser, session: MongoSession): Promise<boolean> {
  try {
    const [info, bidOpen, bidClose]: [iRoomBidInfo | null, iServer | null, iServer | null] = logAndThrow<
      iServer | iRoomBidInfo | null
    >(
      await Promise.allSettled([
        RoomBidInfo.findOne({ user: user._id }).session(session.session).lean(),
        Server.findOne({ key: `roomBidOpen` }).session(session.session),
        Server.findOne({ key: `roomBidClose` }).session(session.session),
      ]),
      `Getting server config error`,
    ) as [iRoomBidInfo | null, iServer | null, iServer | null];

    if (!bidOpen || !bidClose || !info) {
      logger.error(`Room isEligible find results are null | undefined`);
      throw new Error(`Some datas are null | undefined`);
    }

    const curDate = Date.now();
    if (
      !info.isAllocated &&
      info.isEligible &&
      (bidOpen.value as number) <= curDate &&
      curDate <= (bidClose.value as number)
    ) {
      return true;
    }
    return false;
  } catch (error) {
    reportError(error, `Room Bid User eligibility checker error.`);
    throw new Error(`Room Bid User eligibility checker error.`);
  }
}

interface iParseRoom {
  valid: boolean;
  rooms: iRoom[];
}

async function parseRooms(roomIds: string[], session: MongoSession): Promise<iParseRoom> {
  if (roomIds.filter((id) => !Types.ObjectId.isValid(id)).length !== 0) {
    return { valid: false, rooms: [] };
  }

  const rooms = await Room.find({ _id: { $in: roomIds } }).session(session.session);
  if (rooms.length !== roomIds.length || rooms.filter((r) => r.occupancy >= r.capacity).length !== 0) {
    return { valid: false, rooms };
  }

  return { valid: true, rooms };
}

function validateRooms(user: iUser, rooms: iRoom[]) {
  if (
    rooms.filter((r) => r.occupancy >= r.capacity).length +
      rooms.filter((r) => !r.allowedGenders.includes(user.gender)).length !==
    0
  )
    return false;
  return true;
}

export { isEligible, parseRooms, validateRooms };
