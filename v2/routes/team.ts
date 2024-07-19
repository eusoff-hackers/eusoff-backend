import { info } from "@/v2/controllers/team/info";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(info);
};
