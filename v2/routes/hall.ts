import type { FastifyInstance } from 'fastify';
import { list } from '@/v2/controllers/hall/list';

export default async (fastify: FastifyInstance) => {
  fastify.route(list);
};
