/* eslint-disable no-console */

/* eslint-disable no-await-in-loop */

/* eslint-disable no-restricted-syntax */
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import type { iUser } from "@/v2/models/user";
import { resultEmailFor } from "@/v2/utils/jerseyEmails";
import { closeSmtp, sendMail, verifySmtp } from "@/v2/utils/smtp";
import * as fs from "fs";
import mongoose from "mongoose";

/**
 * Email every allocated resident their jersey number.
 *
 *   node build/v2/scripts/mailJerseyResults.js <sent-log> [--send] [--only A0123456X] [--to me@x.com] [--limit N]
 *
 * Dry run unless --send. Resumable: successful sends are appended to <sent-log> and skipped next time.
 * --to redirects every email to one address (for testing what residents will receive).
 */
(async () => {
  const args = process.argv.slice(2);
  const sentLog = args[0];
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const send = args.includes(`--send`);
  const only = flag(`--only`);
  const to = flag(`--to`);
  const limit = Number(flag(`--limit`) ?? Infinity);
  if (!sentLog || sentLog.startsWith(`--`))
    throw new Error(`usage: mailJerseyResults <sent-log> [--send] [--only MATRIC] [--to EMAIL] [--limit N]`);

  const sent = new Set(fs.existsSync(sentLog) ? fs.readFileSync(sentLog, `utf8`).split(`\n`).filter(Boolean) : []);

  await mongoose.connect(process.env.MONGO_URI);
  if (send) await verifySmtp();

  const infos = await JerseyBidInfo.find({ isAllocated: true }).populate<{ user: iUser }>(`user`);
  const residents = infos
    .map((i) => i.user)
    .filter((u) => u.role === `USER` && /^A\d{7}[A-Z]$/.test(u.username))
    .sort((a, b) => a.username.localeCompare(b.username));

  const summary = {
    allocatedResidents: residents.length,
    sent: 0,
    skippedAlreadySent: 0,
    noEmail: [] as string[],
    failed: [] as string[],
  };
  for (const user of residents) {
    if (only && user.username !== only) continue;
    if (summary.sent >= limit) break;
    if (sent.has(user.username) && !to) {
      summary.skippedAlreadySent += 1;
      continue;
    }
    const recipient = to ?? user.email;
    if (!recipient) {
      summary.noEmail.push(`${user.username} ${user.name}`);
      continue;
    }
    const mail = await resultEmailFor(user);
    if (!send) {
      console.log(`[dry run] would mail ${recipient}: ${user.username} — ${mail.subject}`);
      summary.sent += 1;
      continue;
    }
    try {
      await sendMail({ to: recipient, ...mail });
      if (!to) fs.appendFileSync(sentLog, `${user.username}\n`);
      summary.sent += 1;
      console.log(`sent ${user.username} -> ${recipient}`);
    } catch (error) {
      summary.failed.push(`${user.username}: ${(error as Error).message}`);
      console.error(`FAILED ${user.username}: ${(error as Error).message}`);
    }
  }

  console.log(JSON.stringify({ mode: send ? `send` : `dry-run`, ...summary }, null, 1));
  closeSmtp();
  await mongoose.disconnect();
  // The Mongo log transport keeps the event loop alive; this is a one-shot CLI.
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
