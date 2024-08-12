import { MongoSession } from "@/v2/utils/mongoSession";
import type { FastifyInstance, FastifyRequest } from "fastify";

async function addSession(fastify: FastifyInstance) {
  fastify.addHook(`preHandler`, async (req: FastifyRequest) => {
    const session = new MongoSession();
    await session.start();
    req.session.set(`session`, session);
    return req.session.save();
  });
}

export { addSession };
