import { placements } from "@/v2/controllers/ihg/admin/placements";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(placements);
};
