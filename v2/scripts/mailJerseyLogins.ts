/* eslint-disable no-console */

/* eslint-disable no-await-in-loop */

/* eslint-disable no-restricted-syntax */
import { User } from "@/v2/models/user";
import { loginEmailFor } from "@/v2/utils/jerseyEmails";
import { closeSmtp, sendMail, verifySmtp } from "@/v2/utils/smtp";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import mongoose from "mongoose";

/**
 * Email every resident their jersey-bidding login (from the import's passwords.csv).
 *
 *   node build/v2/scripts/mailJerseyLogins.js <passwords.csv> [--send] [--only A0123456X] [--to me@x.com] [--limit N]
 *
 * Dry run unless --send. Resumable: successful sends are appended to <passwords.csv>.sent and skipped
 * next time. --to redirects every email to one address (for testing what residents will receive).
 * Passwords are checked against the database first, so a stale CSV line can never be mailed.
 */
(async () => {
  const args = process.argv.slice(2);
  const file = args[0];
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const send = args.includes(`--send`);
  const only = flag(`--only`);
  const to = flag(`--to`);
  const limit = Number(flag(`--limit`) ?? Infinity);
  if (!file)
    throw new Error(`usage: mailJerseyLogins <passwords.csv> [--send] [--only MATRIC] [--to EMAIL] [--limit N]`);

  const rows: { username: string; password: string }[] = parse(fs.readFileSync(file, `utf8`), { columns: true });
  const sentLog = `${file}.sent`;
  const sent = new Set(fs.existsSync(sentLog) ? fs.readFileSync(sentLog, `utf8`).split(`\n`).filter(Boolean) : []);

  await mongoose.connect(process.env.MONGO_URI);
  if (send) await verifySmtp();
  const bcrypt = await import(`bcrypt`);

  const summary = {
    sent: 0,
    skippedAlreadySent: 0,
    noEmail: [] as string[],
    stalePassword: [] as string[],
    failed: [] as string[],
  };
  for (const row of rows) {
    if (only && row.username !== only) continue;
    if (summary.sent >= limit) break;
    if (sent.has(row.username) && !to) {
      summary.skippedAlreadySent += 1;
      continue;
    }
    const user = await User.findOne({ username: row.username, role: `USER` });
    if (!user) continue;
    if (!(await bcrypt.compare(row.password, user.password))) {
      summary.stalePassword.push(row.username);
      continue;
    }
    const recipient = to ?? user.email;
    if (!recipient) {
      summary.noEmail.push(`${row.username} ${user.name}`);
      continue;
    }
    const mail = await loginEmailFor(user, row.password);
    if (!send) {
      console.log(
        `[dry run] would mail ${recipient}: ${user.username} — ${mail.text
          .split(`\n`)
          .find((l) => l.startsWith(`Points`))}`,
      );
      summary.sent += 1;
      continue;
    }
    try {
      await sendMail({ to: recipient, ...mail });
      if (!to) fs.appendFileSync(sentLog, `${row.username}\n`);
      summary.sent += 1;
      console.log(`sent ${row.username} -> ${recipient}`);
    } catch (error) {
      summary.failed.push(`${row.username}: ${(error as Error).message}`);
      console.error(`FAILED ${row.username}: ${(error as Error).message}`);
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
