/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import { JerseyBidInfo, type iJerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { User } from "@/v2/models/user";
import { parse } from "csv-parse";
import * as fs from "fs";
import mongoose from "mongoose";

interface Data {
  username: string;
  // role: string;
  gender: "Male" | "Female";
  // year: number;
  room: string;
  id: string;
  email: string;
  ihg_num: number;
  points: number;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const csvFilePath = "./v2/scripts/csv/points.csv";
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
      for (const user of result) {
        const userModel = await User.findOne({ username: user.username }).session(session).orFail();
        await JerseyBidInfo.findOneAndUpdate({ user: userModel._id }, {
          round: 4 - user.ihg_num,
          points: user.points,
        } as iJerseyBidInfo)
          .orFail()
          .session(session);
      }

      try {
        // await JerseyBidInfo.create(res, { session });

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
