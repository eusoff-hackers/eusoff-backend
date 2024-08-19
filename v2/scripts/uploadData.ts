/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import { User } from "@/v2/models/user";
import type { iUser } from "@/v2/models/user";
import bcrypt from "bcrypt";
import { parse } from "csv-parse";
import * as fs from "fs";
import mongoose from "mongoose";

const SALT_ROUNDS = 10;

interface Data {
  username: string;
  // role: string;
  // gender: string;
  // year: number;
  room: string;
  id: string;
  // email: string;
  password: string;
}

async function hashPassword(password: string) {
  const hashedPw = await bcrypt.hash(password, SALT_ROUNDS);
  return hashedPw;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const csvFilePath = "./v2/scripts/csv/passworded.csv";
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
      const res: iUser[] = [];
      for (const user of result) {
        user.password = await hashPassword(user.password);
        res.push({ ...user, year: 0, gender: "Male", id: undefined, email: `${user.id}@u.nus.edu` } as iUser);
      }
      try {
        await User.create(res, { session });

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
