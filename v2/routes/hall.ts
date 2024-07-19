import { list } from "@/v2/controllers/hall/list";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(list);
};
