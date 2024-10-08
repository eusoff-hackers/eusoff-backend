import { Server } from "@/v2/models/server";
import type { iUser } from "@/v2/models/user";
import { User } from "@/v2/models/user";
import { logger, reportError } from "@/v2/utils/logger";
import type { MongoSession } from "@/v2/utils/mongoSession";
import { sendStatus } from "@/v2/utils/req_handler";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface Session {
    user: iUser;
    session: MongoSession;
  }
}

async function auth(req: FastifyRequest, res: FastifyReply) {
  const session = req.session.get(`session`)!;
  try {
    const allow = await Server.findOne({ key: `allowLogin` }).session(session.session);
    if (!req.session?.user || (req.session.user.role !== "ADMIN" && (!allow || !allow.value))) {
      await sendStatus(res, 401, `Unauthorized.`);
      return false;
    }
    const { user: userSession }: { user: iUser } = req.session as {
      user: iUser;
    };

    const user = (await User.findById(userSession._id).session(session.session))!;

    req.session.set(`user`, user);
    await req.session.save();
    logger.info(`Refreshed user: ${user._id}.`);
    return true;
  } catch (error) {
    reportError(error, `Auth error`);
    await sendStatus(res, 500, `Internal Server Error.`);
    return false;
  }
}

async function admin(req: FastifyRequest, res: FastifyReply) {
  try {
    if (!(await auth(req, res))) return;

    if (req.session?.user?.role !== `ADMIN`) {
      await sendStatus(res, 401, `Unauthorized.`);
      return;
    }

    logger.info(`Authorized admin on: ${req.session.user._id}`);
  } catch (error) {
    reportError(error, `Admin auth error.`);
    await sendStatus(res, 500, `Internal Server Error.`);
  }
}

async function login(user: iUser, req: FastifyRequest) {
  try {
    await req.session.regenerate();
    req.session.set(`user`, user);

    await req.session.save();
  } catch (error) {
    reportError(error, `Login error`);
    throw error;
  }
}

async function logout(req: FastifyRequest) {
  try {
    await req.session.regenerate();

    await req.session.save();
  } catch (error) {
    reportError(error, `Logout error`);
    throw error;
  }
}

export { login, auth, logout, admin };
