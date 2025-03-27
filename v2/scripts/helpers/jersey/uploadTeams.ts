/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import { Member, type iMember } from "@/v2/models/jersey/member";
import { Team } from "@/v2/models/jersey/team";
import { User } from "@/v2/models/user";
import { parse } from "csv-parse";
import * as fs from "fs";
import mongoose from "mongoose";

interface Data {
  username: string;
  team: string;
  gender: string;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const csvFilePath = "./v2/scripts/csv/team.csv";
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
      await Member.deleteMany({}).session(session);
      const res: iMember[] = [];
      for (const membership of result) {
        const userModel = await User.findOne({ username: membership.username.trim().toUpperCase() }).session(session);
        if (!userModel) continue;
        let teamModel = await Team.findOne({ name: membership.team.trim() }).session(session);
        if (!teamModel) {
          teamModel = await Team.findOne({
            name: membership.team.trim() + " " + (userModel.gender == "male" ? "M" : "F"),
          })
            .session(session)
            .orFail();
        }
        res.push({
          user: userModel._id,
          team: teamModel._id,
        } as iMember);
      }

      try {
        await Member.create(res, { session });

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
