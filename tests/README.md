# Jersey bidding scenario tests

Black-box tests over HTTP against a real backend and a real MongoDB replica set (transactions need one).
Each test wipes and re-seeds a **dedicated test database**; the runner refuses a `MONGO_URI` without
`test`/`e2e` in it.

Covered: who may bid when (own round, carry-over, window, allocated users), bid validation, latest
submission wins, concurrent submissions (one user hammering submit; 80 users at once), ranking
(choice rank > points > seniority > seeded random, genders separate), round-1 exclusivity, 0–9 never
shared, sharing up to 3, non-shareable teams (same round, later rounds, mixed teams), unknown gender,
allocation exactly-once under admin/scheduler races, rollback + automatic retry after a failure,
undo/redo determinism with exact quota/ban restoration, manual assign/remove, assign-remaining
(preview == commit, shortages), auth boundaries + login switch + logout, schedule validation, analytics.
After every allocation the suite checks global invariants (quotas == holders, no shared exclusive
numbers, bans exactly match holders).

## Run on the server (recommended)

```sh
cd /opt/eusoff && docker compose build backend && sh backend/tests/run-in-docker.sh
```

## Run against your own stack

Start the API with `JERSEY_TICK_MS=500 CACHE_TIME=1` and a test `MONGO_URI`, then:

```sh
API=http://localhost:3000/v2 MONGO_URI="mongodb://localhost:27017/eusoff_test?replicaSet=rs0" npm test
```
