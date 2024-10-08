import { EventLog } from "@/v2/models/eventLog";
import type { MongoSession } from "@/v2/utils/mongoSession";
import { Types } from "mongoose";
import winston from "winston";
import { MongoDB } from "winston-mongodb";

const { env } = process;
const LOG_LEVEL: `production` | `warn` | `info` = env.NODE_ENV === "production" ? "warn" : "info";

const { format, transports } = winston;

const logFormat = format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`);

const logger = winston.createLogger({
  format: format.combine(format.metadata()),
  transports: [
    new transports.Console({
      level: LOG_LEVEL,
      format: format.combine(format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }), format.cli(), logFormat),
    }),
    new transports.File({
      filename: "combined.log",
      format: format.combine(format.timestamp(), format.json()),
    }),
    new MongoDB({ level: LOG_LEVEL, db: env.MONGO_URI }),
  ],
});

function logAndThrow<Type>(jobs: PromiseSettledResult<Type>[], message: string): Type[] {
  const errors = (jobs.filter((j) => j.status !== "fulfilled") as PromiseRejectedResult[]).map((j) => j.reason);
  errors.forEach((error) => logger.error(`${message} ${error.message}`, { error }));
  if (errors.length) {
    throw new Error(message);
  }
  return (jobs.filter((j) => j.status === "fulfilled") as PromiseFulfilledResult<Type>[]).map((j) => j.value);
}

async function reportError(error: unknown, template: string) {
  try {
    if (error instanceof Error) {
      await logger.error(`${template}: ${error.message}.`, { error });
    } else {
      await logger.error(`Thrown error is not an error: ${template}: ${error}`, {
        error,
      });
    }
  } catch (error2) {
    reportError(error2, `Error report error.`);
  }
}

async function logEvent(action: string, session: MongoSession, data: string): Promise<void>;
async function logEvent(action: string, session: MongoSession, data: string, user: Types.ObjectId): Promise<void>;
async function logEvent(action: string, session: MongoSession, user: Types.ObjectId): Promise<void>;
async function logEvent(
  action: string,
  session: MongoSession,
  second?: string | Types.ObjectId,
  third?: Types.ObjectId,
): Promise<void> {
  try {
    const data = typeof second === `string` ? second : undefined;
    let user: Types.ObjectId | undefined;
    if (second instanceof Types.ObjectId) user = second;
    else if (third instanceof Types.ObjectId) user = third;

    await EventLog.create(
      [
        {
          action,
          data,
          user,
        },
      ],
      { session: session.session },
    );
  } catch (error) {
    reportError(error, `Event report error`);
  }
}

export { logger, logAndThrow, reportError, logEvent };
