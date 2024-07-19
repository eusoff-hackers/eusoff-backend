import type { FastifyRequest, FastifyReply, RouteOptions } from 'fastify';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { Hall } from '@/v2/models/hall';
import { success, resBuilder, sendError } from '@/v2/utils/req_handler';
import { reportError } from '@/v2/utils/logger';

const schema = {
  response: {
    200: resBuilder({
      type: `array`,
      items: {
        $ref: `hall`,
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const hall = await Hall.find().session(session.session);
    return await success(res, hall);
  } catch (error) {
    reportError(error, `Hall list handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const list: RouteOptions<
  Server,
  IncomingMessage,
  ServerResponse,
  Record<string, never>
> = {
  method: `GET`,
  url: `/list`,
  schema,
  handler,
};

export { list };
