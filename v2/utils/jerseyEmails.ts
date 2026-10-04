import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import type { iUser } from "@/v2/models/user";
import type { MongoSession } from "@/v2/utils/mongoSession";

/** Emails residents receive about jersey bidding. Inline styles only: email clients ignore stylesheets. */

const SITE_URL = process.env.WEB_URL ?? process.env.FRONTEND_URL?.split(`,`)[0] ?? ``;
const RULES_URL = `https://docs.google.com/document/d/1Da-5_QC4qO3-yr_Roy8kNu5amV4m99BTDXMeOf9KvuI/edit?usp=sharing`;

const ROUNDS = [
  [`Round 1`, `Wed 7 Oct, 9am – 9pm`, `played 3+ IHGs`],
  [`Round 2`, `Thu 8 Oct, 9am – 9pm`, `played 2 IHGs`],
  [`Round 3`, `Fri 9 Oct, 9am – 9pm`, `played 1 IHG`],
  [`Round 4`, `Sat 10 Oct, 9am – 9pm`, `never played IHG`],
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

interface LoginEmail {
  name: string;
  username: string;
  password: string;
  round: number;
  points: number;
  teams: string[];
  previousResident: boolean;
  captainOf: string[];
}

/** Resident-facing facts behind the points (the per-category breakdown stays internal). */
function facts(p: LoginEmail) {
  return [
    ...p.captainOf.map((t) => `Captain · ${displayTeam(t)}`),
    ...(p.previousResident ? [`Previous resident`] : []),
    ...p.teams.map(displayTeam),
  ];
}

function loginEmail(p: LoginEmail) {
  const subject = `Jersey Bidding 26/27 — your login, points and round`;
  const rows = ROUNDS.map(
    ([r, when, who], i) =>
      `<tr><td style="padding:6px 0;color:${i + 1 === p.round ? `#fde9ff` : `#bbc7c6`};font-weight:${
        i + 1 === p.round ? 600 : 400
      }">${r}${
        i + 1 === p.round ? ` (yours)` : ``
      }</td><td style="padding:6px 12px;color:#bbc7c6">${when}</td><td style="padding:6px 0;color:#7f9493;font-size:13px">${who}</td></tr>`,
  ).join(``);

  const html = `<!doctype html><html><body style="margin:0;background:#012624;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#bbc7c6">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#bbc7c6">Eusoff Hall · Jersey Bidding 26/27</div>
  <h1 style="margin:12px 0 4px;font-size:28px;line-height:1.1;font-weight:500;color:#ffffff">Hi ${esc(p.name)}</h1>
  <p style="margin:0 0 24px;line-height:1.5">Here's your login for jersey bidding. Please check your points and round by <b style="color:#edfffe">Tue 6 Oct, 12pm</b> and message @kkewinee or @thexianguy if anything looks wrong.</p>
  <div style="background:#003734;border-radius:16px;padding:24px;margin-bottom:16px">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase">Username</div>
    <div style="font-size:20px;color:#ffffff;font-family:ui-monospace,Menlo,monospace;margin:4px 0 16px">${esc(
      p.username,
    )}</div>
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase">Password</div>
    <div style="font-size:20px;color:#ffffff;font-family:ui-monospace,Menlo,monospace;margin-top:4px">${esc(
      p.password,
    )}</div>
  </div>
  <div style="background:#003734;border-radius:16px;padding:24px;margin-bottom:16px">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase">Your points</div>
    <div style="font-size:48px;line-height:1;color:#fde9ff;font-weight:500;margin:8px 0">${p.points}</div>
    <div style="font-size:14px;line-height:1.8">${
      facts(p).length
        ? facts(p)
            .map(
              (f) =>
                `<span style="display:inline-block;border:1px solid rgba(255,255,255,.14);border-radius:6px;padding:2px 8px;margin:0 6px 6px 0">${esc(
                  f,
                )}</span>`,
            )
            .join(``)
        : `No IHG teams on record yet`
    }</div>
  </div>
  <div style="background:#011d1c;border-radius:16px;padding:20px 24px;margin-bottom:24px">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">Schedule (bid in your round only)</div>
    <table style="border-collapse:collapse;font-size:14px">${rows}</table>
  </div>
  ${
    SITE_URL
      ? `<a href="${SITE_URL}" style="display:inline-block;background:linear-gradient(90deg,#cbfffc,#fad1ff);color:#012624;text-decoration:none;padding:14px 22px;border-radius:6px;font-size:14px;letter-spacing:.06em;text-transform:uppercase">Open jersey bidding</a>`
      : ``
  }
  <p style="margin:24px 0 0;font-size:13px;line-height:1.5">Rules: <a href="${RULES_URL}" style="color:#cbfffc">jersey bidding details</a>. Numbers are allocated after each round closes by choice rank, then points, then seniority — not first come, first served.</p>
</div></body></html>`;

  const text = [
    `Hi ${p.name},`,
    ``,
    `Your jersey bidding login:`,
    `  Username: ${p.username}`,
    `  Password: ${p.password}`,
    ``,
    `Points: ${p.points}${facts(p).length ? ` — ${facts(p).join(`, `)}` : ``}`,
    `Your round: ${p.round}`,
    ``,
    ...ROUNDS.map(([r, when, who]) => `${r}: ${when} (${who})`),
    ``,
    `Please check your points and round by Tue 6 Oct 12pm; message @kkewinee or @thexianguy about discrepancies.`,
    SITE_URL ? `Site: ${SITE_URL}` : ``,
    `Rules: ${RULES_URL}`,
  ].join(`\n`);

  return { subject, html, text };
}

const TEAM_NAMES: Record<string, string> = {
  Ulti: `Ultimate Frisbee`,
  Takraw: `Sepak Takraw`,
  "RR M": `Road Relay M`,
  "RR F": `Road Relay F`,
  "Trug M": `Touch Rugby M`,
  "Trug F": `Touch Rugby F`,
};
const displayTeam = (t: string) => TEAM_NAMES[t] ?? t;

/** Build the login email for a resident from their stored record. */
async function loginEmailFor(user: iUser, password: string, session?: MongoSession) {
  const [info, members] = await Promise.all([
    JerseyBidInfo.findOne({ user: user._id })
      .orFail()
      .session(session?.session ?? null),
    Member.find({ user: user._id })
      .populate<{ team: iTeam }>(`team`)
      .session(session?.session ?? null),
  ]);
  return loginEmail({
    name: user.name ?? user.username,
    username: user.username,
    password,
    round: info.round,
    points: info.points,
    teams: members.map((m) => m.team.name).sort(),
    previousResident: Boolean(info.previousResident),
    captainOf: info.captainOf ?? [],
  });
}

export { displayTeam, loginEmail, loginEmailFor };
