import type { FastifyInstance } from 'fastify';
import { list } from '@/v2/controllers/cca/list';
import { info } from '@/v2/controllers/cca/info';
import { signup } from '@/v2/controllers/cca/signup';

export default async (fastify: FastifyInstance) => {
  fastify.route(list);
  fastify.route(info);
  fastify.route(signup);
};
