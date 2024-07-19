import { create } from "@/v2/controllers/bid/create";
import { info } from "@/v2/controllers/bid/info";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(info);
  fastify.route(create);
};
