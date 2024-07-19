import { bid } from "@/v2/controllers/room/bid";
import { info } from "@/v2/controllers/room/info";
import { list } from "@/v2/controllers/room/list";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(list);
  fastify.route(info);
  fastify.route(bid);
};
