/* eslint-disable */
/**
 * Jersey bidding scenario tests: black-box over HTTP against a running backend + its Mongo.
 *
 * Needs a DEDICATED test database — every test wipes it. See tests/README.md for how to run.
 *   API=http://localhost:3000/v2  MONGO_URI=mongodb://.../eusoff_test?replicaSet=rs0  node --test tests/
 * The backend under test must run with JERSEY_TICK_MS=500 and CACHE_TIME=1.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";

const API = process.env.API ?? `http://localhost:3000/v2`;
const { MONGO_URI } = process.env;
if (!MONGO_URI || !/test|e2e/.test(MONGO_URI)) throw new Error(`Refusing to run: MONGO_URI must point at a test database.`);

const PW = `pw`;
const S = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let client;
let db;
let HASH;

const TEAMS = [
  `Badminton M`, `Badminton F`, `Basketball M`, `Basketball F`, `Floorball M`, `Floorball F`, `Ulti`,
  `Handball M`, `Handball F`, `Netball`, `RR M`, `RR F`, `Football M`, `Football F`, `Softball`,
  `Squash M`, `Squash F`, `Takraw`, `Swim M`, `Swim F`, `Table Tennis M`, `Table Tennis F`,
  `Tennis M`, `Tennis F`, `Trug M`, `Trug F`, `Track M`, `Track F`, `Volleyball M`, `Volleyball F`,
];
const EXCLUSIVE = [`Basketball`, `Floorball`, `Ulti`, `Handball`, `Football`, `Softball`, `Trug`, `Volleyball`];
const defaultQuota = (n) => (n <= 9 ? 1 : 3);

// ---------------------------------------------------------------- HTTP client
class Client {
  cookie = ``;

  async req(method, path, body) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "x-forwarded-proto": `https`,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined ? { "content-type": `application/json` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get(`set-cookie`);
    if (set) this.cookie = set.split(`;`)[0];
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data: data?.data ?? data };
  }

  bid(...numbers) {
    return this.req(`POST`, `/jersey/bid`, { bids: numbers.map((number) => ({ number })) });
  }
}

async function as(username) {
  const c = new Client();
  const r = await c.req(`POST`, `/user/login`, { credentials: { username, password: PW } });
  assert.equal(r.status, 200, `login ${username}: ${JSON.stringify(r.data)}`);
  return c;
}

// ---------------------------------------------------------------- fixtures
/**
 * users: [{ u, gender='male', round=1, points=0, year=1, teams=[] }]
 * rounds: [{ round, open, close, status?, seed? }] with open/close RELATIVE to now in ms.
 */
async function seed({ users = [], rounds = [], allowLogin = true }) {
  for (const c of await db.collections()) await c.deleteMany({});
  const now = Date.now();
  const teamIds = {};
  for (const name of TEAMS) {
    const _id = new ObjectId();
    teamIds[name] = _id;
    await db.collection(`teams`).insertOne({ _id, name, shareable: !EXCLUSIVE.some((e) => name.startsWith(e)) });
  }
  await db.collection(`jerseys`).insertMany(
    Array.from({ length: 100 }, (_, number) => ({ number, quota: { male: defaultQuota(number), female: defaultQuota(number) } })),
  );
  const ids = {};
  for (const x of [{ u: `admin`, role: `ADMIN` }, ...users]) {
    const _id = new ObjectId();
    ids[x.u] = _id;
    await db.collection(`users`).insertOne({
      _id,
      username: x.u,
      name: x.u,
      password: HASH,
      role: x.role ?? `USER`,
      year: x.year ?? 1,
      room: `R-${x.u}`,
      ...(x.gender === null ? {} : { gender: x.gender ?? `male` }),
    });
    if (x.role === `ADMIN`) continue;
    await db.collection(`jerseybidinfos`).insertOne({
      user: _id,
      round: x.round ?? 1,
      points: x.points ?? 0,
      isAllocated: false,
      breakdown: { finalCut2526: 0, firstCut2627: x.points ?? 0, captain: 0, adjustment: 0 },
    });
    for (const t of x.teams ?? []) await db.collection(`members`).insertOne({ user: _id, team: teamIds[t] });
  }
  for (const r of rounds) {
    await db.collection(`jerseyrounds`).insertOne({
      round: r.round,
      open: now + r.open,
      close: now + r.close,
      status: r.status ?? `scheduled`,
      seed: r.seed ?? 12345,
    });
  }
  await db.collection(`servers`).insertOne({ key: `allowLogin`, value: allowLogin });
  await sleep(1500); // let the scheduler sync the bidding window
  return ids;
}

const OPEN = (round, forMs = 60 * S) => ({ round, open: -5 * S, close: forMs });
const PAST = (round, ago = 120 * S) => ({ round, open: -ago - 60 * S, close: -ago });
const LATER = (round) => ({ round, open: 3600 * S * round, close: 3600 * S * round + 60 * S });

async function waitRound(admin, round, status = `allocated`, timeout = 20 * S) {
  const end = Date.now() + timeout;
  for (;;) {
    const r = (await admin.req(`GET`, `/admin/rounds`)).data.find((x) => x.round === round);
    if (r?.status === status) return r;
    if (Date.now() > end) throw new Error(`round ${round} never reached ${status} (is ${r?.status})`);
    await sleep(300);
  }
}

/** Close `round` now (via the admin schedule API) and wait for the scheduler to allocate it. */
async function closeAndAllocate(admin, round) {
  const rounds = (await admin.req(`GET`, `/admin/rounds`)).data;
  const now = Date.now();
  const edited = rounds
    .filter((r) => r.status !== `allocated`)
    .map((r) => (r.round === round ? { round, open: Math.min(r.open, now - 10 * S), close: now + 300 } : r))
    .map(({ round: n, open, close }) => ({ round: n, open, close }));
  const put = await admin.req(`PUT`, `/admin/rounds`, { rounds: edited });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  return waitRound(admin, round);
}

async function holders() {
  const infos = await db.collection(`jerseybidinfos`).find({ isAllocated: true }).toArray();
  const users = new Map((await db.collection(`users`).find().toArray()).map((u) => [u._id.toString(), u]));
  const jerseys = new Map((await db.collection(`jerseys`).find().toArray()).map((j) => [j._id.toString(), j]));
  return infos.map((i) => ({ ...i, u: users.get(i.user.toString()), number: jerseys.get(i.jersey.toString()).number }));
}

const numberOf = async (u) => (await holders()).find((h) => h.u.username === u)?.number ?? null;

/** Global invariants that must hold after ANY sequence of operations. */
async function assertConsistent() {
  const hs = await holders();
  const jerseys = await db.collection(`jerseys`).find().toArray();
  const bans = await db.collection(`jerseybans`).find().toArray();
  const members = await db.collection(`members`).find().toArray();
  const teams = new Map((await db.collection(`teams`).find().toArray()).map((t) => [t._id.toString(), t]));

  for (const j of jerseys) {
    for (const g of [`male`, `female`]) {
      const mine = hs.filter((h) => h.number === j.number && h.u.gender === g);
      assert.ok(j.quota[g] >= 0, `#${j.number} ${g} quota negative`);
      assert.ok(mine.length <= 3, `#${j.number} has ${mine.length} ${g} holders`);
      if (j.number <= 9) assert.ok(mine.length <= 1, `#${j.number} (0-9) shared by ${g}s`);
      if (mine.some((h) => h.allocatedRound === 1)) {
        assert.equal(mine.length, 1, `round-1 number #${j.number} shared`);
        assert.equal(j.quota[g], 0, `round-1 number #${j.number} still open for ${g}s`);
      } else {
        assert.equal(j.quota[g], defaultQuota(j.number) - mine.length, `#${j.number} ${g} quota out of sync`);
      }
    }
  }
  // non-shareable teammates never share; every such holding has a ban; no orphan bans
  const expectedBans = new Set();
  for (const h of hs) {
    for (const m of members.filter((x) => x.user.toString() === h.user.toString())) {
      const team = teams.get(m.team.toString());
      if (team.shareable) continue;
      const key = `${team._id}:${h.jersey}`;
      const mates = hs.filter(
        (o) => o.jersey.toString() === h.jersey.toString() && members.some((x) => x.user.toString() === o.user.toString() && x.team.toString() === m.team.toString()),
      );
      assert.equal(mates.length, 1, `${team.name} teammates share #${h.number}`);
      expectedBans.add(key);
    }
  }
  const actual = new Set(bans.map((b) => `${b.team}:${b.jersey}`));
  assert.deepEqual([...actual].sort(), [...expectedBans].sort(), `bans out of sync with holders`);
}

before(async () => {
  // Wait for the API under test to come up (cold container start).
  for (let i = 0; ; i += 1) {
    try {
      if ((await fetch(`${API}/`)).ok) break;
    } catch {}
    if (i > 120) throw new Error(`API at ${API} never became ready`);
    await sleep(500);
  }
  client = await MongoClient.connect(MONGO_URI);
  db = client.db();
  HASH = await bcrypt.hash(PW, 4);
});
after(async () => {
  await client?.close();
});

// ================================================================ bidding rules

test(`only your round (or earlier) may bid, and only while the round is open`, async () => {
  await seed({
    users: [{ u: `r1` }, { u: `r2`, round: 2 }],
    rounds: [OPEN(1), LATER(2)],
  });
  const r1 = await as(`r1`);
  const r2 = await as(`r2`);
  assert.equal((await r1.bid(23)).status, 200);
  assert.equal((await r2.bid(23)).status, 400, `round-2 resident bid in round 1`);
  assert.equal((await r2.req(`GET`, `/jersey/info`)).data.canBid, false);

  // before open / after close
  await seed({ users: [{ u: `a` }], rounds: [{ round: 1, open: 60 * S, close: 120 * S }] });
  assert.equal((await (await as(`a`)).bid(23)).status, 400, `bid accepted before round opened`);
  await seed({ users: [{ u: `a` }], rounds: [{ round: 1, open: -120 * S, close: -60 * S, status: `allocated` }] });
  assert.equal((await (await as(`a`)).bid(23)).status, 400, `bid accepted after round closed`);
});

test(`bid validation: max 5, no duplicates, only real numbers, empty clears`, async () => {
  await seed({ users: [{ u: `a` }], rounds: [OPEN(1)] });
  const a = await as(`a`);
  assert.equal((await a.bid(1, 2, 3, 4, 5, 6)).status, 400, `6 bids accepted`);
  assert.equal((await a.bid(10, 10)).status, 400, `duplicate accepted`);
  assert.equal((await a.bid(100)).status, 400, `#100 accepted`);
  assert.equal((await a.bid(-1)).status, 400, `#-1 accepted`);
  assert.equal((await a.req(`POST`, `/jersey/bid`, { bids: [{ number: `seven` }] })).status, 400, `non-number accepted`);
  assert.equal((await a.req(`POST`, `/jersey/bid`, {})).status, 400, `missing bids accepted`);
  assert.equal((await a.bid(10, 11)).status, 200);
  assert.equal((await a.bid()).status, 200);
  assert.equal(await db.collection(`jerseybids`).countDocuments(), 0, `empty submission didn't clear bids`);
});

test(`latest submission replaces the previous one, in the submitted order`, async () => {
  await seed({ users: [{ u: `a` }], rounds: [OPEN(1)] });
  const a = await as(`a`);
  await a.bid(10, 11, 12);
  await a.bid(44, 33);
  const info = (await a.req(`GET`, `/jersey/info`)).data;
  assert.deepEqual(
    info.bids.sort((x, y) => x.priority - y.priority).map((b) => b.jersey.number),
    [44, 33],
  );
});

test(`one user hammering submit concurrently ends with exactly one complete submission`, async () => {
  await seed({ users: [{ u: `a` }], rounds: [OPEN(1)] });
  const a = await as(`a`);
  const sets = [[10, 11, 12, 13, 14], [20, 21, 22], [30], [40, 41, 42, 43], [50, 51]];
  const res = await Promise.all(sets.map((s) => a.bid(...s)));
  assert.ok(res.some((r) => r.status === 200), `no submission succeeded: ${res.map((r) => r.status)}`);
  assert.ok(res.every((r) => r.status === 200), `unexpected status ${res.map((r) => `${r.status}:${r.data}`)}`);
  const bids = await db.collection(`jerseybids`).find().sort({ priority: 1 }).toArray();
  const numbers = await Promise.all(bids.map(async (b) => (await db.collection(`jerseys`).findOne({ _id: b.jersey })).number));
  assert.ok(sets.some((s) => JSON.stringify(s) === JSON.stringify(numbers)), `mixed submissions saved: ${numbers}`);
  assert.deepEqual(bids.map((b) => b.priority), numbers.map((_, i) => i));
});

test(`80 residents bidding at the same moment: all saved, nothing lost or mixed`, async () => {
  const users = Array.from({ length: 80 }, (_, i) => ({ u: `u${i}`, gender: i % 2 ? `female` : `male`, points: i % 7 }));
  await seed({ users, rounds: [OPEN(1)] });
  const clients = await Promise.all(users.map((x) => as(x.u)));
  const want = users.map((_, i) => [10 + (i % 5), 20 + (i % 3), 30 + i % 60]);
  const t0 = Date.now();
  let res = await Promise.all(clients.map((c, i) => c.bid(...want[i])));
  // A 429 means "transaction conflict, try again" — clients retry, as the UI does.
  for (let attempt = 0; attempt < 5 && res.some((r) => r.status === 429); attempt += 1) {
    res = await Promise.all(clients.map((c, i) => (res[i].status === 429 ? c.bid(...want[i]) : res[i])));
  }
  const elapsed = Date.now() - t0;
  assert.ok(res.every((r) => r.status === 200), `failures: ${res.filter((r) => r.status !== 200).map((r) => `${r.status} ${r.data}`)}`);
  assert.equal(await db.collection(`jerseybids`).countDocuments(), 80 * 3);
  const per = await db.collection(`jerseybids`).aggregate([{ $group: { _id: `$user`, n: { $sum: 1 }, p: { $addToSet: `$priority` } } }]).toArray();
  assert.ok(per.every((x) => x.n === 3 && x.p.length === 3), `a user has a partial/duplicated submission`);
  console.log(`    80 concurrent submissions settled in ${elapsed}ms`);
});

// ================================================================ allocation

test(`ranking: choice rank beats points, points beat seniority, seniority beats chance; genders separate`, async () => {
  await seed({
    users: [
      { u: `lowFirst`, points: 1 },
      { u: `highSecond`, points: 9 },
      { u: `senior`, points: 5, year: 4 },
      { u: `junior`, points: 5, year: 1 },
      { u: `richJunior`, points: 6, year: 1 },
      { u: `poorSenior`, points: 5, year: 4 },
      { u: `twinA`, points: 3, year: 2 },
      { u: `twinB`, points: 3, year: 2 },
      { u: `girl`, gender: `female`, points: 0 },
    ],
    rounds: [OPEN(1), LATER(2)],
  });
  const admin = await as(`admin`);
  await (await as(`lowFirst`)).bid(40, 41);
  await (await as(`highSecond`)).bid(42, 40); // 40 only as 2nd choice
  await (await as(`senior`)).bid(50, 51); // same points + same choice rank -> seniority decides
  await (await as(`junior`)).bid(50, 52);
  await (await as(`richJunior`)).bid(60, 61); // more points beats more seniority
  await (await as(`poorSenior`)).bid(60, 62);
  await (await as(`twinA`)).bid(70, 71);
  await (await as(`twinB`)).bid(70, 72);
  await (await as(`girl`)).bid(40);

  const preview = (await admin.req(`POST`, `/admin/rounds/1/preview`)).data;
  await closeAndAllocate(admin, 1);

  assert.equal(await numberOf(`lowFirst`), 40, `top choice should beat a higher-points 2nd choice`);
  assert.equal(await numberOf(`highSecond`), 42);
  assert.equal(await numberOf(`senior`), 50, `seniority should break a points tie`);
  assert.equal(await numberOf(`junior`), 52);
  assert.equal(await numberOf(`richJunior`), 60, `points should beat seniority`);
  assert.equal(await numberOf(`poorSenior`), 62);
  const twins = [await numberOf(`twinA`), await numberOf(`twinB`)].sort();
  assert.ok(JSON.stringify(twins) === `[70,71]` || JSON.stringify(twins) === `[70,72]`, `tie broken badly: ${twins}`);
  assert.equal(await numberOf(`girl`), 40, `female shouldn't compete with males`);

  for (const r of preview.results) {
    const u = (await db.collection(`users`).findOne({ _id: new ObjectId(r.user._id) })).username;
    assert.equal(await numberOf(u), r.number, `preview differs from real allocation for ${u}`);
  }
  await assertConsistent();
});

test(`round-1 numbers are closed for that gender in later rounds; later rounds share up to 3; 0-9 only in round 1`, async () => {
  const users = [
    ...[`a`, `b`].map((u) => ({ u, round: 1, points: u === `a` ? 5 : 1 })),
    { u: `fem`, round: 2, gender: `female` },
    ...[`c`, `d`, `e`, `f`].map((u, i) => ({ u, round: 2, points: 4 - i })),
    ...[`g`, `h`].map((u, i) => ({ u, round: 2, points: 9 - i })),
  ];
  await seed({ users, rounds: [OPEN(1), LATER(2), LATER(3)] });
  const admin = await as(`admin`);
  await (await as(`a`)).bid(23);
  await (await as(`b`)).bid(23, 24);
  await closeAndAllocate(admin, 1);
  assert.equal(await numberOf(`a`), 23);
  assert.equal(await numberOf(`b`), 24, `two round-1 bidders shared a number`);

  await admin.req(`PUT`, `/admin/rounds`, {
    rounds: [
      { round: 2, open: Date.now() - 1000, close: Date.now() + 60 * S },
      { round: 3, open: Date.now() + 3600 * S, close: Date.now() + 3700 * S },
    ],
  });
  await sleep(1500);
  const c = await as(`c`);
  assert.ok(!(await c.req(`GET`, `/jersey/eligible`)).data.jerseys.includes(23), `round-1 number offered to the same gender`);
  assert.equal((await c.bid(23)).status, 400, `could bid for a number won in round 1`);
  assert.equal((await (await as(`fem`)).bid(23)).status, 200, `round-1 male win shouldn't close 23 for females`);
  for (const u of [`c`, `d`, `e`, `f`]) await (await as(u)).bid(33, 34);
  // 0-9 can only be won in round 1: closed to everyone from round 2, even numbers nobody won.
  const g = await as(`g`);
  assert.ok(
    !(await g.req(`GET`, `/jersey/eligible`)).data.jerseys.some((n) => n <= 9),
    `0-9 offered after round 1`,
  );
  assert.equal((await g.bid(7, 60)).status, 400, `could bid for 7 in round 2`);
  assert.equal((await g.bid(0)).status, 400, `could bid for 0 in round 2`);
  await g.bid(60);
  await (await as(`h`)).bid(60);
  await closeAndAllocate(admin, 2);
  assert.equal(await numberOf(`fem`), 23);
  assert.deepEqual([await numberOf(`c`), await numberOf(`d`), await numberOf(`e`)], [33, 33, 33]);
  assert.equal(await numberOf(`f`), 34, `4th person got a full number`);
  assert.deepEqual([await numberOf(`g`), await numberOf(`h`)], [60, 60]);
  await assertConsistent();
});

test(`non-shareable teammates never share (same round or later); shareable teams can`, async () => {
  await seed({
    users: [
      { u: `bball1`, round: 1, teams: [`Basketball M`], points: 3 },
      { u: `bball2`, round: 2, teams: [`Basketball M`], points: 9 },
      { u: `bball3`, round: 2, teams: [`Basketball M`], points: 8 },
      { u: `bball4`, round: 2, teams: [`Basketball M`], points: 1 },
      { u: `bad1`, round: 2, teams: [`Badminton M`], points: 1 },
      { u: `bad2`, round: 2, teams: [`Badminton M`], points: 1 },
      { u: `mixedSoft`, round: 2, gender: `female`, teams: [`Softball`], points: 1 },
      { u: `mixedSoft2`, round: 2, gender: `male`, teams: [`Softball`], points: 9 },
    ],
    rounds: [OPEN(1), LATER(2)],
  });
  const admin = await as(`admin`);
  await (await as(`bball1`)).bid(23);
  await closeAndAllocate(admin, 1);
  await admin.req(`PUT`, `/admin/rounds`, { rounds: [{ round: 2, open: Date.now() - 1000, close: Date.now() + 60 * S }] });
  await sleep(1500);

  const b2 = await as(`bball2`);
  assert.ok(!(await b2.req(`GET`, `/jersey/eligible`)).data.jerseys.includes(23), `23 offered to a teammate`);
  assert.equal((await b2.bid(23)).status, 400, `teammate could bid for a teammate's number`);
  await b2.bid(45, 46);
  await (await as(`bball3`)).bid(45, 47);
  await (await as(`bball4`)).bid(45, 46, 48);
  await (await as(`bad1`)).bid(55);
  await (await as(`bad2`)).bid(55);
  await (await as(`mixedSoft2`)).bid(66);
  await (await as(`mixedSoft`)).bid(66, 67); // mixed team: opposite genders still can't share
  await closeAndAllocate(admin, 2);

  assert.equal(await numberOf(`bball2`), 45);
  assert.equal(await numberOf(`bball3`), 47);
  assert.equal(await numberOf(`bball4`), 46);
  assert.equal(await numberOf(`bad1`), 55);
  assert.equal(await numberOf(`bad2`), 55, `shareable teammates should share`);
  assert.equal(await numberOf(`mixedSoft2`), 66);
  assert.equal(await numberOf(`mixedSoft`), 67, `mixed-team teammates shared across genders`);
  await assertConsistent();
});

test(`carry-over: unallocated round-1 resident bids again in round 2; allocated residents can't`, async () => {
  await seed({
    users: [
      { u: `winner`, round: 1, points: 9 },
      { u: `loser`, round: 1, points: 1 },
      { u: `r2`, round: 2, points: 0 },
    ],
    rounds: [OPEN(1), LATER(2)],
  });
  const admin = await as(`admin`);
  await (await as(`winner`)).bid(11);
  await (await as(`loser`)).bid(11); // only one choice -> unallocated
  await closeAndAllocate(admin, 1);
  assert.equal(await numberOf(`loser`), null);

  await admin.req(`PUT`, `/admin/rounds`, { rounds: [{ round: 2, open: Date.now() - 1000, close: Date.now() + 60 * S }] });
  await sleep(1500);
  const winner = await as(`winner`);
  assert.equal((await winner.bid(12)).status, 400, `allocated resident could bid again`);
  assert.equal((await winner.req(`GET`, `/jersey/info`)).data.canBid, false);
  await (await as(`loser`)).bid(12);
  await (await as(`r2`)).bid(12);
  const nb = (await admin.req(`GET`, `/admin/rounds/2/non-bidders`)).data;
  assert.equal(nb.length, 0, `everyone due in round 2 bid: ${JSON.stringify(nb)}`);
  await closeAndAllocate(admin, 2);
  assert.equal(await numberOf(`loser`), 12);
  assert.equal(await numberOf(`r2`), 12);
  await assertConsistent();
});

test(`resident with no gender on record is blocked until an admin sets it`, async () => {
  const ids = await seed({ users: [{ u: `nog`, gender: null }], rounds: [OPEN(1)] });
  const nog = await as(`nog`);
  const info = (await nog.req(`GET`, `/jersey/info`)).data;
  assert.equal(info.canBid, false);
  assert.match(info.blockedReason ?? ``, /gender/i);
  assert.deepEqual((await nog.req(`GET`, `/jersey/eligible`)).data.jerseys, []);
  assert.equal((await nog.bid(23)).status, 400);

  const admin = await as(`admin`);
  assert.equal((await admin.req(`POST`, `/admin/users/${ids.nog}/allocate`, { number: 23 })).status, 400);
  assert.equal((await admin.req(`PATCH`, `/admin/users/${ids.nog}`, { gender: `female` })).status, 200);
  assert.equal((await nog.bid(23)).status, 200);
});

// ================================================================ failure & concurrency

test(`a round is allocated exactly once even when admins race the scheduler`, async () => {
  const users = Array.from({ length: 30 }, (_, i) => ({ u: `u${i}`, points: i % 4, gender: i % 3 ? `male` : `female` }));
  await seed({ users, rounds: [OPEN(1), LATER(2)] });
  for (const [i, x] of users.entries()) {
    assert.equal((await (await as(x.u)).bid(10 + (i % 4), 20 + (i % 6), 30 + i)).status, 200);
  }
  const admins = await Promise.all([1, 2, 3, 4, 5].map(() => as(`admin`)));
  const close = Date.now() + 1500;
  await admins[0].req(`PUT`, `/admin/rounds`, { rounds: [{ round: 1, open: Date.now() - 60 * S, close }] });
  await sleep(close - Date.now() + 50); // fire right as it closes, racing the scheduler tick
  const res = await Promise.all(admins.map((a) => a.req(`POST`, `/admin/rounds/1/allocate`)));
  const okCount = res.filter((r) => r.status === 200).length;
  assert.ok(okCount <= 1, `allocated ${okCount} times by admins`);
  await waitRound(admins[0], 1);
  await sleep(1500); // a few more scheduler ticks
  const per = await db.collection(`jerseybidinfos`).find({ isAllocated: true }).toArray();
  assert.equal(new Set(per.map((p) => p.user.toString())).size, per.length);
  assert.equal(per.length, 30);
  await assertConsistent();
});

test(`allocation failure rolls back completely and is retried automatically`, async () => {
  const ids = await seed({ users: [{ u: `a`, points: 2 }, { u: `b` }], rounds: [OPEN(1, 3 * S), LATER(2)] });
  await (await as(`a`)).bid(23);
  await (await as(`b`)).bid(24);
  // Corrupt data: a bid pointing at a jersey that doesn't exist makes the allocator throw.
  const bad = await db.collection(`jerseybids`).insertOne({ user: ids.b, jersey: new ObjectId(), priority: 4, round: 1 });
  await sleep(5 * S);
  const admin = await as(`admin`);
  const r = (await admin.req(`GET`, `/admin/rounds`)).data[0];
  assert.equal(r.status, `closed`, `round should be closed-not-allocated after a failure, is ${r.status}`);
  assert.equal(await db.collection(`jerseybidinfos`).countDocuments({ isAllocated: true }), 0, `partial allocation leaked`);
  await assertConsistent();

  await db.collection(`jerseybids`).deleteOne({ _id: bad.insertedId });
  await waitRound(admin, 1);
  assert.equal(await numberOf(`a`), 23);
  assert.equal(await numberOf(`b`), 24);
  await assertConsistent();
});

test(`undo restores quotas and bans exactly; held round waits; re-run is identical`, async () => {
  const users = [
    ...Array.from({ length: 6 }, (_, i) => ({ u: `r1_${i}`, round: 1, points: i, teams: i % 2 ? [`Floorball M`] : [] })),
    ...Array.from({ length: 12 }, (_, i) => ({ u: `r2_${i}`, round: 2, points: i % 3, teams: i % 3 === 0 ? [`Floorball M`] : [`Swim M`] })),
  ];
  await seed({ users, rounds: [OPEN(1), LATER(2), LATER(3)] });
  const admin = await as(`admin`);
  for (const [i, x] of users.slice(0, 6).entries()) await (await as(x.u)).bid(20 + (i % 2), 30 + i, 5);
  await closeAndAllocate(admin, 1);
  const jerseysAfterR1 = await db.collection(`jerseys`).find().sort({ number: 1 }).toArray();
  const bansAfterR1 = (await db.collection(`jerseybans`).find().toArray()).map((b) => `${b.team}:${b.jersey}`).sort();

  await admin.req(`PUT`, `/admin/rounds`, {
    rounds: [
      { round: 2, open: Date.now() - 1000, close: Date.now() + 60 * S },
      { round: 3, open: Date.now() + 3600 * S, close: Date.now() + 3700 * S },
    ],
  });
  await sleep(1500);
  for (const [i, x] of users.slice(6).entries()) await (await as(x.u)).bid(40 + (i % 2), 50 + (i % 4), 60 + i);
  await closeAndAllocate(admin, 2);
  const before = JSON.stringify((await holders()).filter((h) => h.allocatedRound === 2).map((h) => [h.u.username, h.number]).sort());

  assert.equal((await admin.req(`POST`, `/admin/rounds/1/undo`)).status, 400, `undid round 1 while round 2 allocated`);
  const undo = await admin.req(`POST`, `/admin/rounds/2/undo`);
  assert.equal(undo.status, 200);
  assert.deepEqual(await db.collection(`jerseys`).find().sort({ number: 1 }).toArray(), jerseysAfterR1, `quotas not restored`);
  assert.deepEqual(
    (await db.collection(`jerseybans`).find().toArray()).map((b) => `${b.team}:${b.jersey}`).sort(),
    bansAfterR1,
    `bans not restored`,
  );
  await sleep(2000);
  assert.equal((await admin.req(`GET`, `/admin/rounds`)).data[1].status, `closed`, `held round was auto re-allocated`);
  assert.equal((await admin.req(`POST`, `/admin/rounds/2/allocate`)).status, 200);
  const afterRun = JSON.stringify((await holders()).filter((h) => h.allocatedRound === 2).map((h) => [h.u.username, h.number]).sort());
  assert.equal(afterRun, before, `re-running a round gave a different result`);
  await assertConsistent();
});

test(`manual assign respects quota, teams and gender; removing restores everything`, async () => {
  const ids = await seed({
    users: [
      { u: `a`, teams: [`Handball M`] },
      { u: `b`, teams: [`Handball M`] },
      { u: `c` },
    ],
    rounds: [OPEN(1), LATER(2)],
  });
  const admin = await as(`admin`);
  const jBefore = await db.collection(`jerseys`).find().sort({ number: 1 }).toArray();
  assert.equal((await admin.req(`POST`, `/admin/users/${ids.a}/allocate`, { number: 23 })).status, 200);
  assert.equal((await admin.req(`POST`, `/admin/users/${ids.a}/allocate`, { number: 24 })).status, 400, `double assign`);
  const clash = await admin.req(`POST`, `/admin/users/${ids.b}/allocate`, { number: 23 });
  assert.equal(clash.status, 400);
  assert.match(clash.data, /Handball/);
  assert.equal((await admin.req(`POST`, `/admin/users/${ids.c}/allocate`, { number: 5 })).status, 200);
  await db.collection(`jerseybidinfos`).updateOne({ user: ids.b }, { $set: { round: 1 } });
  assert.equal((await admin.req(`POST`, `/admin/users/${ids.b}/allocate`, { number: 5 })).status, 400, `0-9 shared manually`);
  await assertConsistent();
  assert.equal((await admin.req(`DELETE`, `/admin/users/${ids.a}/allocate`)).status, 200);
  assert.equal((await admin.req(`DELETE`, `/admin/users/${ids.c}/allocate`)).status, 200);
  assert.deepEqual(await db.collection(`jerseys`).find().sort({ number: 1 }).toArray(), jBefore);
  assert.equal(await db.collection(`jerseybans`).countDocuments(), 0);
});

test(`after the last round, everyone left is auto-assigned a valid number; undo reverts it; shortages reported`, async () => {
  const users = Array.from({ length: 20 }, (_, i) => ({
    u: `x${i}`,
    round: (i % 4) + 1,
    points: i % 5,
    gender: i % 2 ? `female` : `male`,
    teams: i % 3 === 0 ? [`Football ${i % 2 ? `F` : `M`}`] : [],
  }));
  users.push({ u: `nog`, round: 1, gender: null });
  await seed({ users, rounds: [PAST(1, 400 * S), PAST(2, 300 * S), PAST(3, 200 * S), PAST(4, 100 * S)] });
  const admin = await as(`admin`);
  const r4 = await waitRound(admin, 4);
  assert.equal(r4.summary?.autoAssigned, 20, JSON.stringify(r4.summary));
  assert.equal((await holders()).length, 20, `not everyone got a number`);
  assert.ok(
    (await holders()).every((h) => h.allocatedRound !== 5 || h.number > 9),
    `auto-assign handed out a 0-9 number`,
  );
  assert.equal(await numberOf(`nog`), null);
  const again = (await admin.req(`POST`, `/admin/assign-remaining/preview`, {})).data;
  assert.equal(again.results.length, 0, `leftovers remain after auto-assign`);
  assert.deepEqual(again.impossible.map((x) => x.reason), [`Gender not set`]);
  await assertConsistent();

  assert.equal((await admin.req(`POST`, `/admin/rounds/4/undo`)).status, 200);
  assert.equal((await holders()).length, 0, `undoing the last round left auto-assigned numbers`);
  await assertConsistent();

  // shortage: round 1 isn't the last round here, so assign explicitly after closing every male number but one
  await seed({ users: [{ u: `m1` }, { u: `m2` }], rounds: [PAST(1, 100 * S), LATER(2)] });
  const admin2 = await as(`admin`);
  await waitRound(admin2, 1);
  await db.collection(`jerseys`).updateMany({}, { $set: { "quota.male": 0 } });
  await db.collection(`jerseys`).updateOne({ number: 42 }, { $set: { "quota.male": 1 } });
  const p2 = (await admin2.req(`POST`, `/admin/assign-remaining/preview`, { upToRound: 1 })).data;
  assert.equal(p2.results.length, 1);
  assert.equal(p2.impossible.length, 1);
  const c2 = await admin2.req(`POST`, `/admin/assign-remaining`, { upToRound: 1 });
  assert.equal(c2.status, 200, JSON.stringify(c2.data));
  for (const r of p2.results) {
    const u = (await db.collection(`users`).findOne({ _id: new ObjectId(r.user._id) })).username;
    assert.equal(await numberOf(u), r.number, `commit differs from preview for ${u}`);
  }
});

test(`admin area is admin-only; login switch blocks residents but not admins; logout ends the session`, async () => {
  await seed({ users: [{ u: `a` }], rounds: [OPEN(1)] });
  const anon = new Client();
  for (const [m, p] of [[`GET`, `/admin/overview`], [`GET`, `/admin/users`], [`GET`, `/admin/analytics`], [`POST`, `/admin/rounds/1/allocate`]]) {
    assert.equal((await anon.req(m, p)).status, 401, `anon ${m} ${p}`);
  }
  assert.equal((await anon.req(`GET`, `/jersey/list`)).status, 401, `bid board (rooms/teams) visible without login`);
  const a = await as(`a`);
  assert.equal((await a.req(`GET`, `/jersey/list`)).status, 200);
  assert.equal((await a.req(`GET`, `/admin/users`)).status, 401);
  assert.equal((await a.req(`POST`, `/admin/assign-remaining`, {})).status, 401);
  assert.equal((await a.req(`POST`, `/user/login`, { credentials: { username: `a`, password: `nope` } })).status, 401);

  const admin = await as(`admin`);
  await admin.req(`PATCH`, `/admin/settings`, { allowLogin: false });
  assert.equal((await a.req(`GET`, `/jersey/info`)).status, 401, `resident session survived login switch`);
  const again = new Client();
  assert.equal((await again.req(`POST`, `/user/login`, { credentials: { username: `a`, password: PW } })).status, 401);
  assert.equal((await (await as(`admin`)).req(`GET`, `/admin/overview`)).status, 200);
  await admin.req(`PATCH`, `/admin/settings`, { allowLogin: true });

  const b = await as(`a`);
  await b.req(`POST`, `/user/logout`);
  assert.equal((await b.req(`GET`, `/jersey/info`)).status, 401, `session alive after logout`);
});

test(`schedule validation rejects bad windows and edits to allocated rounds`, async () => {
  await seed({ users: [{ u: `a` }], rounds: [PAST(1), LATER(2)] });
  const admin = await as(`admin`);
  await waitRound(admin, 1);
  const now = Date.now();
  const put = (rounds) => admin.req(`PUT`, `/admin/rounds`, { rounds });
  assert.equal((await put([{ round: 2, open: now + 10 * S, close: now + 5 * S }])).status, 400, `close before open`);
  assert.equal(
    (await put([{ round: 2, open: now, close: now + 60 * S }, { round: 3, open: now + 30 * S, close: now + 90 * S }])).status,
    400,
    `overlap`,
  );
  assert.equal((await put([{ round: 1, open: now, close: now + 60 * S }])).status, 400, `edited allocated round`);
  assert.equal((await put([{ round: 2, open: now + 60 * S, close: now + 120 * S }])).status, 200);
});

test(`analytics and non-bidders add up`, async () => {
  await seed({
    users: [
      { u: `a`, points: 3 },
      { u: `b`, points: 1 },
      { u: `lazy` },
      { u: `r2` , round: 2 },
    ],
    rounds: [OPEN(1), LATER(2)],
  });
  const admin = await as(`admin`);
  await (await as(`a`)).bid(10, 11);
  await (await as(`b`)).bid(10, 12);
  await as(`r2`);
  const nb = (await admin.req(`GET`, `/admin/rounds/1/non-bidders`)).data;
  assert.deepEqual(nb.map((x) => x.username), [`lazy`]);
  assert.equal(nb[0].lastLogin, null);
  await closeAndAllocate(admin, 1);
  const an = (await admin.req(`GET`, `/admin/analytics`)).data;
  const r1 = an.rounds[0];
  assert.equal(r1.eligible, 3);
  assert.equal(r1.bidders, 2);
  assert.equal(r1.nonBidders, 1);
  assert.equal(r1.allocated, 2);
  assert.deepEqual(r1.choiceHits, [1, 1, 0, 0, 0]);
  assert.equal(an.coverage.residents, 4);
  assert.equal(an.coverage.allocated, 2);
  assert.equal(an.coverage.neverLoggedIn, 1);
  assert.equal(an.rounds[1].carryover, 1, `lazy carries over to round 2`);
  const nb2 = (await admin.req(`GET`, `/admin/rounds/2/non-bidders`)).data;
  assert.deepEqual(nb2.map((x) => [x.username, x.carryover]), [[`r2`, false], [`lazy`, true]]);
});
