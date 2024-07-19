import type { FastifyRequest, FastifyReply, RouteOptions } from 'fastify';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { IhgSport } from '@/v2/models/ihgSport';
import { success, resBuilder, sendError } from '@/v2/utils/req_handler';
import { reportError } from '@/v2/utils/logger';

const schema = {
  response: {
    200: resBuilder({
      type: `array`,
      items: {
        $ref: `ihgSport`,
      },
    }),
  },
} as const;

async function handler(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const sports = await IhgSport.find().session(session.session);
    return await success(res, sports);
  } catch (error) {
    reportError(error, `IHG sports handler error`);
    return sendError(res);
  } finally {
    await session.end();
  }
}

const sports: RouteOptions<
  Server,
  IncomingMessage,
  ServerResponse,
  Record<string, never>
> = {
  method: `GET`,
  url: `/sports`,
  schema,
  handler,
};

export { sports };
