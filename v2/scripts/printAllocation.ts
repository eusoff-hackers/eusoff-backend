/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import type { iRoom } from "@/v2/models/room";
import { RoomBidInfo } from "@/v2/models/roomBidInfo";
import type { iUser } from "@/v2/models/user";
import { writeFile } from "fs";
import { json2csv } from "json-2-csv";
import mongoose from "mongoose";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await RoomBidInfo.find({ isAllocated: true }).populate(`user`).populate(`room`);

  const data = users.map((u) => ({
    matric: (u.user as iUser).username,
    room: (u.room as iRoom).block + (u.room as iRoom).number,
  }));

  const csv = await json2csv(data);

  await writeFile(`./v2/scripts/csv/allocatedRooms.csv`, csv, (err) => {
    if (err) console.error(err);
  });

  console.log(`saved`);
})();
