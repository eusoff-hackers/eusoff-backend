import type { iJersey } from "@/v2/models/jersey/jersey";
import { JerseyBidInfo } from "@/v2/models/jersey/jerseyBidInfo";
import { Member } from "@/v2/models/jersey/member";
import type { iTeam } from "@/v2/models/jersey/team";
import type { iUser } from "@/v2/models/user";
import { AUTO_ASSIGN_ROUND, MANUAL_ROUND } from "@/v2/utils/jerseyAllocation";
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
    ...p.teams.filter((t) => !p.captainOf.includes(t)).map(displayTeam),
  ];
}

// Hall colours (match the site): warm gradient, crest maroon/gold, green primary action, navy text.
const C = {
  ink: `#1f2937`,
  muted: `#5b6472`,
  faint: `#8a919c`,
  canvas: `#fbf6ef`,
  card: `#ffffff`,
  line: `#efe4d6`,
  maroon: `#7b1e2b`,
  gold: `#b8860b`,
  goldSoft: `#fdf3d7`,
  green: `#378640`,
  sunrise: `#f7db65`,
  apricot: `#efab6a`,
  coral: `#e87d74`,
};

/** "VASANTHARAJ, FREDERICK AMAL" -> "Vasantharaj, Frederick Amal"; mixed-case names are left alone. */
const prettyName = (n: string) =>
  n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s,(-])([a-z])/g, (_m, a, b) => a + b.toUpperCase()) : n;

const LOGO_URL = SITE_URL ? `${SITE_URL}/eusoff-logo.png` : ``;

/** Page frame shared by every resident email: hall-gradient header, white card, footer. */
function shell(body: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${
    C.canvas
  };font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.canvas}" style="background:${
    C.canvas
  }"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

  <tr><td bgcolor="${C.apricot}" style="background:${C.apricot};background-image:linear-gradient(135deg,${C.sunrise},${
    C.apricot
  } 55%,${C.coral});border-radius:16px 16px 0 0;padding:28px 28px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${
        LOGO_URL
          ? `<td style="padding-right:14px;vertical-align:middle"><img src="${LOGO_URL}" width="52" alt="Eusoff Hall crest" style="display:block;border:0"></td>`
          : ``
      }
      <td style="vertical-align:middle">
        <div style="font-size:22px;font-weight:800;color:${C.ink};letter-spacing:-.01em">Eusoff Hall</div>
        <div style="font-size:13px;color:#3d2a12">Jersey Bidding 26/27</div>
      </td></tr></table>
  </td></tr>

  <tr><td bgcolor="${C.card}" style="background:${C.card};padding:28px;border-radius:0 0 16px 16px">
${body}  </td></tr>

  <tr><td style="padding:16px 8px;text-align:center;font-size:12px;color:${
    C.faint
  }">Eusoff Hall · Excellence and Harmony<br>You're receiving this because you're a resident of Eusoff Hall.</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const label = (t: string) =>
  `<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.faint};font-weight:600">${t}</div>`;

function loginEmail(p: LoginEmail) {
  const subject = `Jersey Bidding 26/27 — your login, points and round`;
  const name = esc(prettyName(p.name));
  const chips = facts(p).length
    ? facts(p)
        .map(
          (f) =>
            `<span style="display:inline-block;background:${
              C.goldSoft
            };color:#6b4e00;border-radius:999px;padding:4px 10px;margin:0 6px 6px 0;font-size:13px">${esc(f)}</span>`,
        )
        .join(``)
    : `<span style="color:${C.muted};font-size:14px">No IHG teams on record yet</span>`;
  const rows = ROUNDS.map(([r, when, who], i) => {
    const mine = i + 1 === p.round;
    return `<tr>
      <td style="padding:10px 12px;border-top:1px solid ${C.line};${
        mine ? `background:${C.goldSoft};` : ``
      }font-weight:${mine ? 700 : 500};color:${mine ? C.maroon : C.ink};white-space:nowrap">${r}${
        mine ? ` &nbsp;&#9733; yours` : ``
      }</td>
      <td style="padding:10px 12px;border-top:1px solid ${C.line};${mine ? `background:${C.goldSoft};` : ``}color:${
        C.ink
      }">${when}</td>
      <td style="padding:10px 12px;border-top:1px solid ${C.line};${mine ? `background:${C.goldSoft};` : ``}color:${
        C.muted
      };font-size:13px">${who}</td>
    </tr>`;
  }).join(``);
  // Bulletproof button: a table cell with a background colour renders as a button even in Outlook.
  const button = SITE_URL
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 0"><tr>
        <td bgcolor="${C.green}" style="background:${C.green};border-radius:8px">
          <a href="${SITE_URL}" style="display:inline-block;padding:15px 34px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px">Log in &amp; check your points &rarr;</a>
        </td></tr></table>
       <div style="text-align:center;margin-top:10px;font-size:13px;color:${
         C.muted
       }">or go to <a href="${SITE_URL}" style="color:${C.maroon}">${SITE_URL.replace(/^https?:\/\//, ``)}</a></div>`
    : ``;

  const html = shell(`    <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:${
    C.ink
  }">Your jersey bidding login</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${
      C.muted
    }">Hi ${name} — here are your login details, points and bidding round. Please check them by <b style="color:${
      C.ink
    }">Tue 6 Oct, 12pm</b> and message @kkewinee or @thexianguy if anything looks wrong.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${
      C.line
    };border-radius:12px"><tr><td style="padding:18px 20px">
      ${label(`Username (your matric number)`)}
      <div style="font-size:20px;font-weight:700;color:${
        C.ink
      };font-family:ui-monospace,Menlo,Consolas,monospace;margin:4px 0 14px">${esc(p.username)}</div>
      ${label(`Password`)}
      <div style="font-size:20px;font-weight:700;color:${
        C.ink
      };font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:4px">${esc(p.password)}</div>
    </td></tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
      <td width="50%" style="padding-right:7px;vertical-align:top">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${
          C.line
        };border-radius:12px"><tr><td style="padding:16px 18px">
          ${label(`Your points`)}
          <div style="font-size:40px;line-height:1.1;font-weight:800;color:${C.maroon}">${p.points}</div>
        </td></tr></table>
      </td>
      <td width="50%" style="padding-left:7px;vertical-align:top">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${
          C.goldSoft
        }" style="background:${C.goldSoft};border-radius:12px"><tr><td style="padding:16px 18px">
          ${label(`Your round`)}
          <div style="font-size:40px;line-height:1.1;font-weight:800;color:${C.maroon}">${p.round}</div>
        </td></tr></table>
      </td>
    </tr></table>

    <div style="margin:14px 0 22px">${chips}</div>

    ${button}

    <div style="margin:26px 0 8px">${label(`Schedule · 9am – 9pm each day`)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;border-bottom:1px solid ${
      C.line
    }">${rows}</table>
    <p style="margin:12px 0 0;font-size:13px;line-height:1.55;color:${
      C.muted
    }">Bid in your round. If you don't get a number, you can bid again in later rounds. Numbers are allocated after each round by your choice ranking, then points, then seniority — not first come, first served. <a href="${RULES_URL}" style="color:${
      C.maroon
    }">Full rules</a></p>
`);

  const text = [
    `Hi ${prettyName(p.name)},`,
    ``,
    `Your jersey bidding login:`,
    `  Username: ${p.username}`,
    `  Password: ${p.password}`,
    ``,
    `Points: ${p.points}${facts(p).length ? ` — ${facts(p).join(`, `)}` : ``}`,
    `Your round: ${p.round} (if you don't get a number, you can bid again in later rounds)`,
    ``,
    ...ROUNDS.map(([r, when, who]) => `${r}: ${when} (${who})`),
    ``,
    `Please check your points and round by Tue 6 Oct 12pm; message @kkewinee or @thexianguy about discrepancies.`,
    SITE_URL ? `Site: ${SITE_URL}` : ``,
    `Rules: ${RULES_URL}`,
  ].join(`\n`);

  return { subject, html, text };
}

interface ResultEmail {
  name: string;
  number: number;
  allocatedRound: number;
  teams: string[];
  captainOf: string[];
}

/** How the number was decided, in residents' words. */
function howAllocated(allocatedRound: number) {
  if (allocatedRound === MANUAL_ROUND) return `Allocated by the jersey committee`;
  if (allocatedRound === AUTO_ASSIGN_ROUND) return `Assigned after Round 4 from the numbers still available`;
  return `Won in Round ${allocatedRound}`;
}

function resultEmail(p: ResultEmail) {
  const subject = `Jersey Bidding 26/27 — your jersey number is ${p.number}`;
  const name = esc(prettyName(p.name));
  const teams = [
    ...p.captainOf.map((t) => `Captain · ${displayTeam(t)}`),
    ...p.teams.filter((t) => !p.captainOf.includes(t)).map(displayTeam),
  ];
  const chips = teams
    .map(
      (t) =>
        `<span style="display:inline-block;background:${
          C.goldSoft
        };color:#6b4e00;border-radius:999px;padding:4px 10px;margin:0 6px 6px 0;font-size:13px">${esc(t)}</span>`,
    )
    .join(``);
  const button = SITE_URL
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 0"><tr>
        <td bgcolor="${C.green}" style="background:${C.green};border-radius:8px">
          <a href="${SITE_URL}" style="display:inline-block;padding:15px 34px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px">View on the site &rarr;</a>
        </td></tr></table>`
    : ``;

  const html = shell(`    <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:${
    C.ink
  }">Your jersey number</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:${
      C.muted
    }">Hi ${name} — jersey bidding for 26/27 is done. Here's the number you'll wear.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.goldSoft}" style="background:${
      C.goldSoft
    };border-radius:14px"><tr><td align="center" style="padding:26px 20px 22px">
      ${label(`Your jersey number`)}
      <div style="font-size:84px;line-height:1;font-weight:800;color:${
        C.maroon
      };letter-spacing:-.02em;margin:10px 0 10px;font-variant-numeric:tabular-nums">${p.number}</div>
      <div style="font-size:14px;color:${C.ink}">${howAllocated(p.allocatedRound)}</div>
    </td></tr></table>

    ${
      teams.length
        ? `<div style="margin:18px 0 0">${label(
            `Your teams on record`,
          )}<div style="margin-top:8px">${chips}</div></div>`
        : ``
    }

    ${button}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.55;color:${
      C.muted
    }">Something not right — the number, your teams, or a clash with a teammate? Message @kkewinee or @thexianguy.</p>
`);

  const text = [
    `Hi ${prettyName(p.name)},`,
    ``,
    `Jersey bidding for 26/27 is done. Your jersey number is ${p.number}.`,
    `${howAllocated(p.allocatedRound)}.`,
    ...(teams.length ? [`Teams on record: ${teams.join(`, `)}`] : []),
    ``,
    `Something not right? Message @kkewinee or @thexianguy.`,
    SITE_URL ? `Site: ${SITE_URL}` : ``,
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

/** Build the result email for an allocated resident from their stored record. */
async function resultEmailFor(user: iUser, session?: MongoSession) {
  const [info, members] = await Promise.all([
    JerseyBidInfo.findOne({ user: user._id })
      .populate<{ jersey: iJersey }>(`jersey`)
      .orFail()
      .session(session?.session ?? null),
    Member.find({ user: user._id })
      .populate<{ team: iTeam }>(`team`)
      .session(session?.session ?? null),
  ]);
  if (!info.isAllocated || !info.jersey) throw new Error(`${user.username} has no jersey allocated.`);
  return resultEmail({
    name: user.name ?? user.username,
    number: info.jersey.number,
    allocatedRound: info.allocatedRound ?? MANUAL_ROUND,
    teams: members.map((m) => m.team.name).sort(),
    captainOf: info.captainOf ?? [],
  });
}

export { displayTeam, loginEmail, loginEmailFor, resultEmail, resultEmailFor };
