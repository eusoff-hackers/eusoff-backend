/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import { Team, type iTeam } from "@/v2/models/jersey/team";
import mongoose from "mongoose";

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const session = await mongoose.startSession();
  await session.startTransaction({
    readConcern: { level: `snapshot` },
    writeConcern: { w: `majority`, j: true },
  });

  const teamData: iTeam[] = [
    { name: "Badminton M", shareable: true } as iTeam,
    { name: "Badminton F", shareable: true } as iTeam,
    { name: "Basketball M", shareable: false } as iTeam,
    { name: "Basketball F", shareable: false } as iTeam,
    { name: "Floorball M", shareable: false } as iTeam,
    { name: "Floorball F", shareable: false } as iTeam,
    { name: "Ulti", shareable: false } as iTeam,
    { name: "Handball M", shareable: false } as iTeam,
    { name: "Handball F", shareable: false } as iTeam,
    { name: "Netball", shareable: true } as iTeam,
    { name: "RR M", shareable: true } as iTeam,
    { name: "RR F", shareable: true } as iTeam,
    { name: "Football M", shareable: false } as iTeam,
    { name: "Football F", shareable: false } as iTeam,
    { name: "Softball", shareable: false } as iTeam,
    { name: "Squash M", shareable: true } as iTeam,
    { name: "Squash F", shareable: true } as iTeam,
    { name: "Takraw", shareable: true } as iTeam,
    { name: "Swim M", shareable: true } as iTeam,
    { name: "Swim F", shareable: true } as iTeam,
    { name: "Table Tennis M", shareable: true } as iTeam,
    { name: "Table Tennis F", shareable: true } as iTeam,
    { name: "Tennis M", shareable: true } as iTeam,
    { name: "Tennis F", shareable: true } as iTeam,
    { name: "Trug M", shareable: false } as iTeam,
    { name: "Trug F", shareable: false } as iTeam,
    { name: "Track M", shareable: true } as iTeam,
    { name: "Track F", shareable: true } as iTeam,
    { name: "Volleyball M", shareable: false } as iTeam,
    { name: "Volleyball F", shareable: false } as iTeam,
  ];

  try {
    await Team.create(teamData, { session });

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

  console.log(`Finished.`);
})();
