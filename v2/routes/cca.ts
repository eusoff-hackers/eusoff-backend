import { info } from "@/v2/controllers/cca/info";
import { list } from "@/v2/controllers/cca/list";
import { signup } from "@/v2/controllers/cca/signup";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(list);
  fastify.route(info);
  fastify.route(signup);
};
