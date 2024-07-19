import type { FastifyInstance } from 'fastify';
import { placements } from '@/v2/controllers/ihg/admin/placements';

export default async (fastify: FastifyInstance) => {
  fastify.route(placements);
};
