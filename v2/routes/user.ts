import { info } from "@/v2/controllers/user/info";
import { login } from "@/v2/controllers/user/login";
import { logout } from "@/v2/controllers/user/logout";
import { passwordReset } from "@/v2/controllers/user/password-reset";
import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.route(login);
  fastify.route(logout);
  fastify.route(info);
  fastify.route(passwordReset);
};
