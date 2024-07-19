import type { FastifyInstance } from 'fastify';
import { info } from '@/v2/controllers/bid/info';
import { create } from '@/v2/controllers/bid/create';

export default async (fastify: FastifyInstance) => {
  fastify.route(info);
  fastify.route(create);
};
