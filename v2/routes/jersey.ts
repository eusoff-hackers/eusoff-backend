import { bid } from "@/v2/controllers/jersey/bid";
import { eligible } from "@/v2/controllers/jersey/eligible";
import { info } from "@/v2/controllers/jersey/info";
import { list } from "@/v2/controllers/jersey/list";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.decorateRequest(`fastify`, fastify);
  fastify.route(eligible);
  fastify.route(list);
  fastify.route(bid);
  fastify.route(info);
};
