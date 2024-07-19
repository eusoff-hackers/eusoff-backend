import { eligible } from "@/v2/controllers/jersey/eligible";
import { info } from "@/v2/controllers/jersey/info";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.decorateRequest(`fastify`, fastify);
  fastify.route(eligible);
  fastify.route(info);
};
