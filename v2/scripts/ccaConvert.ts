/* eslint-disable no-console */
import { Cca } from "@/v2/models/cca/cca";
import { CcaSubcommittee } from "@/v2/models/cca/ccaSubcommittee";
import { parse } from "csv-parse";
import * as fs from "fs";
import mongoose from "mongoose";

interface Data {
  name: string;
  category: string;
  heads: string;
  contacts: string;
  description: string;
  committees: string;
}

function convert(s: string): string[] {
  return s.split(`, `);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const csvFilePath = "./v2/scripts/csv/ccaData.csv";
  const fileContent = fs.readFileSync(csvFilePath, { encoding: "utf-8" });

  parse(
    fileContent,
    {
      delimiter: ",",
      columns: true,
    },
    async (error, result: Data[]) => {
      // eslint-disable-next-line promise/no-promise-in-callback
      await Promise.all(
        result.map(async (x) => {
          const committees = convert(x.committees);
          const cca = await Cca.create({
            name: x.name,
            category: x.category,
            heads: convert(x.heads),
            contacts: convert(x.contacts),
            description: x.description,
          });
          await CcaSubcommittee.create(committees.filter((c) => c !== "").map((c) => ({ name: c, cca })));
        }),
      );

      // await Cca.create(converted);
      console.log(`Finished.`);
    },
  );
}

run();

export {};

// /* eslint-disable no-console */

// import * as fs from 'fs';
// import { User, iUser } from '../models/user';
// import { Jersey } from '../models/jersey';
// import { Member } from '../models/member';
// import { BiddingInfo } from '../models/biddingInfo';

// interface Data {
//   'Name Preferred': string;
//   Gender: 'Male' | 'Female';
//   Nationality: string;
//   'Year of Study': number;
//   NUSNET: string;
//   Email: string;
//   'Room no': string;
// }

// interface oldUser extends iUser {
//   bidding_round: number;
//   points: number;
//   allocatedNumber: number;
//   teams: Types.ObjectId[];
// }

// interface Suggestion {
//   Nickname: string;
//   DisplayName: string;
// }

// interface Body {
//   Body: { ResultSet: Suggestion[] };
// }

// (async () => {
//   await mongoose.connect(process.env.MONGO_URI);
//   const csvFilePath = './v2/scripts/csv/formatted_data.csv';
//   const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

//   parse(
//     fileContent,
//     {
//       delimiter: ',',
//       columns: true,
//     },
//     async (error, result: Data[]) => {
//       if (error) {
//         console.error(error);
//       }
//       for (let user of result) {
//         const old = (await User.findOne({
//           email: user.Email,
//         }))!.toObject() as oldUser;
//         if (!old) {
//           console.error(`USER NOT FOUND: ${user}`);
//           continue;
//         }

//         await User.updateOne(
//           { email: user.Email },
//           {
//             $set: { username: user.NUSNET, room: user['Room no'] },
//             $unset: {
//               teams: 1,
//               bids: 1,
//               isEligible: 1,
//               bidding_round: 1,
//               points: 1,
//               allocatedNumber: 1,
//             },
//           },
//           { strict: false },
//         );
//         // await BiddingInfo.create({
//         //   user: old._id,
//         //   round: old.bidding_round,
//         //   points: old.points,
//         //   allocated: true,
//         //   jersey: (await Jersey.findOne({number: old.allocatedNumber}))!._id
//         // });

//         // const newTeams = Promise.allSettled(old.teams.map(t => {Member.create({user: old._id, team: t})}));
//       }

//       console.log(`Finished.`);
//     },
//   );
// })();
