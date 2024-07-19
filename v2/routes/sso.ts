import type { FastifyInstance } from 'fastify';
import { authorize } from '@/v2/controllers/sso/authorize';
import { acs } from '@/v2/controllers/sso/acs';
import { callback } from '@/v2/controllers/sso/callback';

export default async (fastify: FastifyInstance) => {
  fastify.route(authorize);
  fastify.route(acs);
  fastify.route(callback);
};
