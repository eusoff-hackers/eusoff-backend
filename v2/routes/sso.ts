import { acs } from "@/v2/controllers/sso/acs";
import { authorize } from "@/v2/controllers/sso/authorize";
import { callback } from "@/v2/controllers/sso/callback";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(authorize);
  fastify.route(acs);
  fastify.route(callback);
};
