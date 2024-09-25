import { addSchemas } from "@/v2/models/fastify-schemas";
import { addSession } from "@/v2/plugins/addSession";
import cca from "@/v2/routes/cca";
import hall from "@/v2/routes/hall";
import ihg from "@/v2/routes/ihg";
import jersey from "@/v2/routes/jersey";
import room from "@/v2/routes/room";
import sso from "@/v2/routes/sso";
import user from "@/v2/routes/user";
import { success } from "@/v2/utils/req_handler";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  await addSchemas(fastify);
  await addSession(fastify);

  fastify.get(`/`, async (req, res) => {
    success(res, `You have reached v2 backend!`);
  });
  fastify.register(user, { prefix: `/user` });
  fastify.register(jersey, { prefix: `/jersey` });
  fastify.register(sso, { prefix: `/sso` });
  fastify.register(cca, { prefix: `/cca` });
  fastify.register(hall, { prefix: `/hall` });
  fastify.register(ihg, { prefix: `/ihg` });
  fastify.register(room, { prefix: `/room` });
};
