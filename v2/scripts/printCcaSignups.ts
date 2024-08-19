/* eslint-disable no-console */
import { Cca } from "@/v2/models/cca/cca";
import type { iCca } from "@/v2/models/cca/cca";
import { CcaInfo } from "@/v2/models/cca/ccaInfo";
import { CcaSignup } from "@/v2/models/cca/ccaSignup";
import type { iCcaSubcommittee } from "@/v2/models/cca/ccaSubcommittee";
import "@/v2/models/cca/ccaSubcommittee";
import "@/v2/models/user";
import type { iUser } from "@/v2/models/user";
import { logAndThrow } from "@/v2/utils/logger";
import { writeFile } from "fs";
import { json2csv } from "json-2-csv";
import mongoose from "mongoose";

async function save(cca: iCca) {
  const signups = await CcaSignup.find({ cca: cca._id }).populate<{ user: iUser }>(`user`).populate<{
    subcommittees: iCcaSubcommittee[];
  }>(`subcommittees`);

  const data = logAndThrow(
    await Promise.allSettled(
      signups.map(async (s) => {
        const info = await CcaInfo.findOne({ user: s.user._id });
        if (!info) throw new Error(`No found info`);
        return {
          name: info.name,
          telegram: info.telegram,
          matric: s.user.username,
          room: s.user.room,
          email: s.user.email,
          reason: s.reason,
          subcommittees: s.subcommittees.map((s) => s.name).join(", "),
        };
      }),
    ),
    "CCA signups conversion",
  );

  const csv = await json2csv(data);
  await writeFile(`./v2/scripts/csv/cca/${cca.name}.csv`, csv, (err) => {
    if (err) console.error(err);
  });
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const ccas = await Cca.find();

  await Promise.allSettled(ccas.map(async (cca) => await save(cca)));

  console.log(`saved`);
})();

export {};
