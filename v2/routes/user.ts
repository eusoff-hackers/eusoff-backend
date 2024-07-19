import type { FastifyInstance } from 'fastify';
import { login } from '@/v2/controllers/user/login';
import { info } from '@/v2/controllers/user/info';
import { passwordReset } from '@/v2/controllers/user/password-reset';

export default async (fastify: FastifyInstance) => {
  fastify.route(login);
  fastify.route(info);
  fastify.route(passwordReset);
};
