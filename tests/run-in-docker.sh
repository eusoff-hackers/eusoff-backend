#!/bin/sh
# Run the jersey scenario tests against a throwaway API + database, next to a running stack.
# On the server:  cd /opt/eusoff && docker compose build backend && sh backend/tests/run-in-docker.sh
# Never touches the production database: everything uses the `eusoff_test` DB and is dropped afterwards.
set -e
NET=${NET:-eusoff_default}
IMAGE=${IMAGE:-eusoff-backend}
DB="mongodb://mongodb:27017/eusoff_test?replicaSet=rs0"

cleanup() {
  docker rm -f jersey-test-api >/dev/null 2>&1 || true
  docker run --rm --network "$NET" mongo:7 mongosh --quiet "$DB" --eval "db.dropDatabase()" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

# No env-cmd here: the image's baked .env would override these with production values.
docker run -d --name jersey-test-api --network "$NET" \
  -e MONGO_URI="$DB" -e BACKEND_PORT=3000 -e NODE_ENV=production -e CACHE_TIME=1 -e JERSEY_TICK_MS=500 \
  -e SESSION_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')" -e FRONTEND_URL=http://localhost \
  --entrypoint node "$IMAGE" build/App.js >/dev/null
sleep 6

docker run --rm --network "$NET" -e API=http://jersey-test-api:3000/v2 -e MONGO_URI="$DB" \
  --entrypoint node "$IMAGE" --test --test-concurrency=1 tests/
