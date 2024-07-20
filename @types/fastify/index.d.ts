import type { FastifyInstance } from "fastify";

declare module "fastify" {
  export interface FastifyRequest {
    fastify?: FastifyInstance;
  }

  export interface FastifyReply {
    fromCache?: boolean;
  }
}
