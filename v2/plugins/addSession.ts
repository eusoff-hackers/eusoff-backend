import { MongoSession } from "@/v2/utils/mongoSession";
import type { FastifyInstance, FastifyRequest } from "fastify";

async function addSession(fastify: FastifyInstance) {
  fastify.addHook(`preHandler`, async (req: FastifyRequest) => {
    const session = new MongoSession();
    await session.start();
    // Request-scoped only: no need to persist it (it serialises to {}); @fastify/session saves
    // the session itself on send whenever its contents actually change.
    req.session.set(`session`, session);
  });
}

export { addSession };
