import bid from "./bid";
import cca from "./cca";
import hall from "./hall";
import ihg from "./ihg";
import jersey from "./jersey";
import room from "./room";
import sso from "./sso";
import team from "./team";
import user from "./user";
import { addSchemas } from "@/v2/models/fastify-schemas";
import { addSession } from "@/v2/utils/mongoSession";
import { success } from "@/v2/utils/req_handler";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  await addSchemas(fastify);
  await addSession(fastify);

  fastify.get(`/`, async (req, res) => {
    success(res, `You have reached v2 backend!`);
  });
  fastify.register(user, { prefix: `/user` });
  fastify.register(team, { prefix: `/team` });
  fastify.register(bid, { prefix: `/bid` });
  fastify.register(jersey, { prefix: `/jersey` });
  fastify.register(sso, { prefix: `/sso` });
  fastify.register(cca, { prefix: `/cca` });
  fastify.register(hall, { prefix: `/hall` });
  fastify.register(ihg, { prefix: `/ihg` });
  fastify.register(room, { prefix: `/room` });
};
