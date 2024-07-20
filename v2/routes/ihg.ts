import { matches } from "@/v2/controllers/ihg/matches";
import { placements } from "@/v2/controllers/ihg/placements";
import { points } from "@/v2/controllers/ihg/points";
import { sports } from "@/v2/controllers/ihg/sports";
import admin from "@/v2/routes/ihg/admin";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.decorateRequest(`fastify`, fastify);
  fastify.route(matches);
  fastify.route(points);
  fastify.route(sports);
  fastify.route(placements);

  fastify.register(admin, { prefix: `/admin` });
};
