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
  // gender: "Male" | "Female";
  // year: number;
  // room: string;
  // id: string;
  // email: string;
  round: number;
}

interface Data2 {
  username: string;
  points: number;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const csvFilePath = "./v2/scripts/csv/jersey_points.csv";
  const studentList = "./v2/scripts/csv/passworded.csv";
  const fileContent = fs.readFileSync(csvFilePath, { encoding: "utf-8" });
  const studentListContent = fs.readFileSync(studentList, { encoding: "utf-8" });

  parse(
    fileContent,
    {
      delimiter: ",",
      columns: true,
    },
    async (error, result2: Data2[]) => {
      parse(
        studentListContent,
        {
          delimiter: ",",
          columns: true
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
          await JerseyBidInfo.deleteMany({}).session(session);
          const res: iJerseyBidInfo[] = [];
          for (const user of result) {
            const userModel = await User.findOne({ username: user.username }).session(session).orFail();
            const otherUser = result2.filter((u) => u.username == user.username);
            res.push({
              user: userModel._id,
              round: user.round,
              points: otherUser.length > 0 ? otherUser[0].points : 0,
              isAllocated: false,
            } as iJerseyBidInfo);
          }
          
          try {
            await JerseyBidInfo.create(res, { session });

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
        }
      )
    },
  );
})();
