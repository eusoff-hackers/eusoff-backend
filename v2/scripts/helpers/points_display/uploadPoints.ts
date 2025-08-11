/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */

/* eslint-disable no-continue */
import type { iRoomBidInfo } from "@/v2/models/room/roomBidInfo";
import { RoomBidInfo } from "@/v2/models/room/roomBidInfo";
import { User } from "@/v2/models/user";
import { parse } from "csv-parse";
import * as fs from "fs";
import mongoose from "mongoose";

const DISTRIBUTIONS = [
  "External CCA",
  "Dean's List",
  "CMC",
  "CHEC",
  "Chorapella",
  "Band",
  "Rockfest",
  "Drama",
  "EDC",
  "DP Main Comm",
  "DP Finance",
  "DP FR",
  "DP Pubs",
  "DP Marketing",
  "DP Logs",
  "DP Tech",
  "DP Sets",
  "DP SM",
  "DP Choreo",
  "DP Cast",
  "DP D1",
  "DP D2",
  "DP D3",
  "DP D4",
  "DP D5",
  "DP D6",
  "DP D7",
  "DU Ephemeral",
  "DU Locomotion",
  "DU Seraphine",
  "DU Combined",
  "Expeds",
  "Elderly Services",
  "MINDS",
  "SSC",
  "SSC Adhoc",
  "Green Comm",
  "SMC",
  "Badminton",
  "Basketball",
  "Floorball",
  "Ultimate Frisbee",
  "Handball",
  "Netball",
  "Road Relay",
  "Takraw",
  "Football",
  "Softball",
  "Squash",
  "Swim",
  "Table Tennis",
  "Tennis",
  "Touch Rugby",
  "Track",
  "Volleyball",
  "TM",
  "A Blk Comm",
  "B Blk Com",
  "C Blk Comm",
  "D Blk Com",
  "E Blk Comm",
  "HMC/APT",
  "HRB",
  "HPB",
  "EW",
  "Audit",
  "Elections",
  "Finance",
  "Hackers",
  "EER",
  "EHOC",
  "Rag Comm",
  "Rag Dancer",
  "Flag",
];

interface Data {
  username: string;
  points: number;
  "External CCA": number;
  "Dean's List": number;
  CMC: number;
  CHEC: number;
  Chorapella: number;
  Band: number;
  Rockfest: number;
  Drama: number;
  EDC: number;
  "DP Main Comm": number;
  "DP Finance": number;
  "DP FR": number;
  "DP Pubs": number;
  "DP Marketing": number;
  "DP Logs": number;
  "DP Tech": number;
  "DP Sets": number;
  "DP SM": number;
  "DP Choreo": number;
  "DP Cast": number;
  "DP D1": number;
  "DP D2": number;
  "DP D3": number;
  "DP D4": number;
  "DP D5": number;
  "DP D6": number;
  "DP D7": number;
  "DU Ephemeral": number;
  "DU Locomotion": number;
  "DU Seraphine": number;
  "DU Combined": number;
  Expeds: number;
  "Elderly Services": number;
  MINDS: number;
  SSC: number;
  "SSC Adhoc": number;
  "Green Comm": number;
  SMC: number;
  Badminton: number;
  Basketball: number;
  Floorball: number;
  "Ultimate Frisbee": number;
  Handball: number;
  Netball: number;
  "Road Relay": number;
  Takraw: number;
  Football: number;
  Softball: number;
  Squash: number;
  Swim: number;
  "Table Tennis": number;
  Tennis: number;
  "Touch Rugby": number;
  Track: number;
  Volleyball: number;
  TM: number;
  "A Blk Comm": number;
  "B Blk Com": number;
  "C Blk Comm": number;
  "D Blk Com": number;
  "E Blk Comm": number;
  "HMC/APT": number;
  HRB: number;
  HPB: number;
  EW: number;
  Audit: number;
  Elections: number;
  Finance: number;
  Hackers: number;
  EER: number;
  EHOC: number;
  "Rag Comm": number;
  "Rag Dancer": number;
  Flag: number;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const csvFilePath = "./v2/scripts/csv/points_display/points.csv";
  const fileContent = fs.readFileSync(csvFilePath, { encoding: "utf-8" });

  parse(
    fileContent,
    {
      delimiter: ",",
      columns: true,
    },
    async (error, result: Data[]) => {
      if (error) {
        console.error(error);
      }
      const session = await mongoose.startSession();

      await session.startTransaction({
        readConcern: { level: `snapshot` },
        writeConcern: { w: `majority`, j: true },
      });
      try {
        const missing: Data[] = [];
        const res: iRoomBidInfo[] = [];

        for (const user of result) {
          const tmp = await User.findOne({ username: user.username }).session(session);
          if (!tmp) missing.push(user);
          else {
            if ((await RoomBidInfo.countDocuments({ user: tmp._id }).session(session)) !== 0) continue;
            res.push({
              user: tmp._id,
              isEligible: false,
              points: user.points,
              pointsDistribution: DISTRIBUTIONS.map((k) => ({
                cca: k,
                points: user[k as keyof Data],
              })).filter((c) => c.points && c.points !== "0"),
            } as iRoomBidInfo);
          }
        }

        console.log(
          "Missing users: ",
          missing.map((u) => u.username),
        );

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

      console.log(`Finished.`);
    },
  );
})();
