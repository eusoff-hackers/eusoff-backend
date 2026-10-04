import * as jerseys from "@/v2/controllers/admin/jerseys";
import * as misc from "@/v2/controllers/admin/misc";
import * as rounds from "@/v2/controllers/admin/rounds";
import * as users from "@/v2/controllers/admin/users";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(misc.overview);

  fastify.route(users.list);
  fastify.route(users.patch);
  fastify.route(users.resetPassword);
  fastify.route(users.allocate);
  fastify.route(users.unallocate);

  fastify.route(rounds.list);
  fastify.route(rounds.put);
  fastify.route(rounds.preview);
  fastify.route(rounds.allocate);
  fastify.route(rounds.undo);

  fastify.route(jerseys.list);
  fastify.route(jerseys.patch);

  fastify.route(misc.bids);
  fastify.route(misc.issues);
  fastify.route(misc.patchIssue);
  fastify.route(misc.exportAllocations);
  fastify.route(misc.getSettings);
  fastify.route(misc.patchSettings);
};
