/* eslint-disable */
/**
 * Load test: N residents hit the site at the same moment (login -> page load -> bid -> poll board).
 * Same setup as the scenario tests (dedicated test DB, wiped first):
 *   API=... MONGO_URI=...eusoff_test... USERS=300 node tests/load.mjs
 */
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";

const API = process.env.API ?? `http://localhost:3000/v2`;
const { MONGO_URI } = process.env;
const N = Number(process.env.USERS ?? 300);
if (!MONGO_URI || !/test|e2e/.test(MONGO_URI)) throw new Error(`MONGO_URI must point at a test database`);

const client = await MongoClient.connect(MONGO_URI);
const db = client.db();
for (const c of await db.collections()) await c.deleteMany({});
const hash = await bcrypt.hash(`pw`, 10); // production cost: login CPU is the real bottleneck
await db.collection(`jerseys`).insertMany(
  Array.from({ length: 100 }, (_, number) => ({ number, quota: { male: number < 10 ? 1 : 3, female: number < 10 ? 1 : 3 } })),
);
const users = Array.from({ length: N }, (_, i) => ({ _id: new ObjectId(), username: `load${i}`, name: `load${i}`, password: hash, role: `USER`, year: 1 + (i % 4), room: `L-${i}`, gender: i % 2 ? `male` : `female` }));
await db.collection(`users`).insertMany(users);
await db.collection(`jerseybidinfos`).insertMany(users.map((u, i) => ({ user: u._id, round: 1, points: i % 9, isAllocated: false })));
await db.collection(`jerseyrounds`).insertOne({ round: 1, open: Date.now() - 1000, close: Date.now() + 3600_000, status: `scheduled`, seed: 1 });
await db.collection(`servers`).insertOne({ key: `allowLogin`, value: true });
await new Promise((r) => setTimeout(r, 2000));

const timings = {};
const errors = {};
async function call(name, cookie, method, path, body) {
  const t = performance.now();
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "x-forwarded-proto": `https`, ...(cookie ? { cookie } : {}), ...(body ? { "content-type": `application/json` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    (timings[name] ??= []).push(performance.now() - t);
    if (res.status !== 200) {
      const key = `${name} ${res.status} ${text.slice(0, 60)}`;
      errors[key] = (errors[key] ?? 0) + 1;
    }
    return res;
  } catch (e) {
    errors[`${name} ${e.cause?.code ?? e.message}`] = (errors[`${name} ${e.cause?.code ?? e.message}`] ?? 0) + 1;
    return null;
  }
}

async function login(u) {
  const res = await call(`login`, null, `POST`, `/user/login`, { credentials: { username: u.username, password: `pw` } });
  return res?.headers.get(`set-cookie`)?.split(`;`)[0];
}

async function bidder(cookie, i) {
  if (!cookie) return;
  await Promise.all([call(`info`, cookie, `GET`, `/jersey/info`), call(`eligible`, cookie, `GET`, `/jersey/eligible`), call(`list`, cookie, `GET`, `/jersey/list`)]);
  const picks = [10 + (i % 7), 20 + (i % 11), 30 + (i % 13), 40 + (i % 5), 50 + (i % 17)];
  await call(`bid`, cookie, `POST`, `/jersey/bid`, { bids: picks.map((number) => ({ number })) });
  for (let k = 0; k < 3; k += 1) await call(`list`, cookie, `GET`, `/jersey/list`);
}

function report(title, wall) {
  const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
  console.log(`\n== ${title} — ${(wall / 1000).toFixed(1)}s`);
  for (const [k, v] of Object.entries(timings)) {
    console.log(`${k.padEnd(9)} n=${String(v.length).padStart(4)}  p50=${pct(v, 0.5).toFixed(0).padStart(5)}ms  p95=${pct(v, 0.95).toFixed(0).padStart(5)}ms  max=${Math.max(...v).toFixed(0).padStart(5)}ms`);
  }
  console.log(`errors:`, Object.keys(errors).length ? errors : `none`);
  for (const k of Object.keys(timings)) delete timings[k];
  for (const k of Object.keys(errors)) delete errors[k];
}

// A: everyone logs in during the same second (worst case).
let t0 = performance.now();
const cookies = await Promise.all(users.map(login));
report(`${N} logins at the same moment`, performance.now() - t0);

// B: bidding opens; everyone is already logged in (sessions last 14 days) and acts at once.
t0 = performance.now();
await Promise.all(cookies.map(bidder));
report(`${N} logged-in residents bidding at the same moment`, performance.now() - t0);

console.log(`bids saved: ${await db.collection(`jerseybids`).countDocuments()} / ${N * 5}`);
for (const c of await db.collections()) await c.deleteMany({});
await client.close();
