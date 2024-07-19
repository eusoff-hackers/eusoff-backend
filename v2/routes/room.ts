import type { FastifyInstance } from 'fastify';
import { list } from '@/v2/controllers/room/list';
import { info } from '@/v2/controllers/room/info';

export default async (fastify: FastifyInstance) => {
  fastify.route(list);
  fastify.route(info);
};
