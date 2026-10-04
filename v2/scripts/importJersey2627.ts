/* eslint-disable no-console */

/* eslint-disable no-await-in-loop */

/* eslint-disable no-restricted-syntax */
import { DataIssue } from "@/v2/models/dataIssue";
import { Jersey } from "@/v2/models/jersey/jersey";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { JerseyRound } from "@/v2/models/jersey/jerseyRound";
import { Member } from "@/v2/models/jersey/member";
import { Team } from "@/v2/models/jersey/team";
import { Server } from "@/v2/models/server";
import { User } from "@/v2/models/user";
import { defaultQuota } from "@/v2/utils/jerseyAllocation";
import { generatePassword } from "@/v2/utils/password";
import bcrypt from "bcrypt";
import * as fs from "fs";
import mongoose from "mongoose";
import * as path from "path";

/**
 * Import AY26/27 jersey bidding data produced by the reconcile step (residents.json + issues.json).
 *
 * Usage: node build/v2/scripts/importJersey2627.js <dataDir> <outDir>
 *
 * Idempotent: re-running updates residents/points/teams/rounds without touching passwords or
 * allocations. New accounts' passwords are appended to <outDir>/passwords.csv (keep it private).
 */

interface Resident {
  matric: string;
  name: string;
  gender: `male` | `female`;
  room: string;
  email: string | null;
  year: number;
  round: number;
  teams: string[];
  breakdown: { finalCut2526: number; firstCut2627: number; captain: number };
  points: number;
}

// Rules doc: these team sports never share numbers.
const EXCLUSIVE = [`Basketball`, `Floorball`, `Ulti`, `Handball`, `Football`, `Softball`, `Trug`, `Volleyball`];
const TEAMS = [
  `Badminton M`,
  `Badminton F`,
  `Basketball M`,
  `Basketball F`,
  `Floorball M`,
  `Floorball F`,
  `Ulti`,
  `Handball M`,
  `Handball F`,
  `Netball`,
  `RR M`,
  `RR F`,
  `Football M`,
  `Football F`,
  `Softball`,
  `Squash M`,
  `Squash F`,
  `Takraw`,
  `Swim M`,
  `Swim F`,
  `Table Tennis M`,
  `Table Tennis F`,
  `Tennis M`,
  `Tennis F`,
  `Trug M`,
  `Trug F`,
  `Track M`,
  `Track F`,
  `Volleyball M`,
  `Volleyball F`,
];

// 9am-9pm Singapore time (UTC+8), Wed 7 - Sat 10 Oct 2026.
const ROUNDS = [7, 8, 9, 10].map((day, i) => ({
  round: i + 1,
  open: Date.UTC(2026, 9, day, 1, 0),
  close: Date.UTC(2026, 9, day, 13, 0),
}));

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? `` : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, `""`)}"` : s;
};

async function upsertAccount(
  username: string,
  fields: Record<string, unknown>,
  created: { username: string; name: string; email: string | null; room: string; password: string }[],
) {
  const existing = await User.findOne({ username });
  if (existing) {
    await User.updateOne({ _id: existing._id }, { $set: fields });
    return existing._id;
  }
  const password = generatePassword();
  const user = await User.create({ username, password: await bcrypt.hash(password, 10), ...fields });
  created.push({
    username,
    name: String(fields.name),
    email: (fields.email as string) ?? null,
    room: String(fields.room),
    password,
  });
  return user._id;
}

(async () => {
  const [dataDir, outDir] = process.argv.slice(2);
  if (!dataDir || !outDir) throw new Error(`usage: importJersey2627 <dataDir> <outDir>`);
  const residents: Resident[] = JSON.parse(fs.readFileSync(path.join(dataDir, `residents.json`), `utf8`));
  const issues: Record<string, string[]> = JSON.parse(fs.readFileSync(path.join(dataDir, `issues.json`), `utf8`));

  await mongoose.connect(process.env.MONGO_URI);

  for (const name of TEAMS) {
    const shareable = !EXCLUSIVE.some((e) => name.startsWith(e));
    await Team.updateOne({ name }, { $set: { name, shareable } }, { upsert: true });
  }
  const teamIds = new Map((await Team.find().lean()).map((t) => [t.name, t._id]));

  for (let number = 0; number < 100; number += 1) {
    const q = defaultQuota(number);
    await Jersey.updateOne({ number }, { $setOnInsert: { number, quota: { male: q, female: q } } }, { upsert: true });
  }

  const created: Parameters<typeof upsertAccount>[2] = [];
  for (const r of residents) {
    const unknownTeams = r.teams.filter((t) => !teamIds.has(t));
    if (unknownTeams.length) throw new Error(`${r.matric}: unknown teams ${unknownTeams.join(`, `)}`);

    const userId = await upsertAccount(
      r.matric,
      { name: r.name, gender: r.gender, room: r.room, year: r.year, email: r.email ?? undefined, role: `USER` },
      created,
    );

    const existing = await JerseyBidInfo.findOne({ user: userId });
    const adjustment = existing?.breakdown?.adjustment ?? 0;
    const breakdown = { ...r.breakdown, adjustment };
    await JerseyBidInfo.updateOne(
      { user: userId },
      {
        $set: { round: r.round, breakdown, points: r.points + adjustment },
        $setOnInsert: { user: userId, isAllocated: false },
      },
      { upsert: true },
    );

    const wanted = r.teams.map((t) => teamIds.get(t)!);
    await Member.deleteMany({ user: userId, team: { $nin: wanted } });
    for (const team of wanted) {
      await Member.updateOne({ user: userId, team }, { $setOnInsert: { user: userId, team } }, { upsert: true });
    }
  }

  // Keep admins' "resolved" ticks across re-imports.
  const resolved = new Set(
    (await DataIssue.find({ resolved: true }).lean()).map((i) => `${i.category}\u0000${i.detail}`),
  );
  await DataIssue.deleteMany({});
  await DataIssue.insertMany(
    Object.entries(issues).flatMap(([category, details]) =>
      details.map((detail) => ({ category, detail, resolved: resolved.has(`${category}\u0000${detail}`) })),
    ),
  );

  for (const r of ROUNDS) {
    await JerseyRound.updateOne({ round: r.round }, { $setOnInsert: r }, { upsert: true });
  }
  await Server.updateOne({ key: `allowLogin` }, { $setOnInsert: { key: `allowLogin`, value: true } }, { upsert: true });

  if (created.length) {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `passwords.csv`);
    const header = fs.existsSync(file) ? [] : [`username,name,email,room,password`];
    const lines = created.map((c) => [c.username, c.name, c.email, c.room, c.password].map(csvCell).join(`,`));
    fs.appendFileSync(file, `${[...header, ...lines].join(`\n`)}\n`, { mode: 0o600 });
  }

  console.log(
    JSON.stringify({
      residents: residents.length,
      newAccounts: created.length,
      issues: Object.values(issues).flat().length,
      rounds: ROUNDS.map((r) => ({
        round: r.round,
        open: new Date(r.open).toISOString(),
        close: new Date(r.close).toISOString(),
      })),
    }),
  );
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
