import type { FastifyInstance } from 'fastify';
import { info } from '@/v2/controllers/team/info';

export default async (fastify: FastifyInstance) => {
  fastify.route(info);
};
