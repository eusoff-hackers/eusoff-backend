import { admin } from "@/v2/plugins/auth";
import { reportError } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";
import { sendError, sendStatus, success } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest, FastifySchema, HTTPMethods, RouteOptions } from "fastify";

/** Throw from an admin handler to answer with a specific status + message. */
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRequest = FastifyRequest<any>;

interface AdminRouteOptions {
  method: HTTPMethods;
  url: string;
  schema?: FastifySchema;
  /** Commit the request transaction before replying. */
  write?: boolean;
  /** Runs after a successful commit (write routes), e.g. to refresh state read outside the transaction. */
  afterCommit?: () => Promise<unknown>;
  /** Return data for `{ success, data }`, or take over `res` yourself and return undefined. */
  handler: (req: AnyRequest, session: MongoSession, res: FastifyReply) => Promise<unknown>;
}

/**
 * Admin route with the boilerplate every handler here needs: admin guard, the per-request Mongo
 * transaction (opened by the addSession hook), commit for writes, and uniform error replies.
 */
function adminRoute({ method, url, schema, write, afterCommit, handler }: AdminRouteOptions): RouteOptions {
  return {
    method,
    url,
    schema,
    preHandler: admin,
    handler: async (req: AnyRequest, res: FastifyReply) => {
      const session = req.session.get(`session`)!;
      try {
        const data = await handler(req, session, res);
        if (res.sent) return res;
        if (write) await session.commit();
        if (afterCommit)
          await afterCommit().catch((error) => reportError(error, `Admin ${method} ${url} afterCommit error`));
        return await success(res, data);
      } catch (error) {
        await session.abort().catch(() => {});
        if (error instanceof HttpError) return sendStatus(res, error.status, error.message);
        reportError(error, `Admin ${method} ${url} error`);
        return sendError(res);
      } finally {
        await session.end();
      }
    },
  };
}

export { HttpError, adminRoute };
