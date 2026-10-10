import { logger, reportError } from "@/v2/utils/logger";
import type { ClientSession } from "mongoose";
import mongoose from "mongoose";

const ATTEMPT_LIMIT = 10;

class MongoSession {
  #session: ClientSession | undefined;

  get session(): ClientSession {
    if (!this.#session) {
      throw new Error(`No session.`);
    }
    return this.#session as ClientSession;
  }

  async start() {
    this.#session = await mongoose.startSession();
    (this.#session as ClientSession).startTransaction({
      readConcern: { level: `snapshot` },
      writeConcern: { w: `majority`, j: true },
    });
  }

  async attemptCommit(attemptN: number) {
    try {
      await (this.#session as ClientSession).commitTransaction();
    } catch (error) {
      reportError(error, `Commit error`);
      if (attemptN < ATTEMPT_LIMIT) await this.attemptCommit(attemptN + 1);
      else throw error;
    }
  }

  async commit() {
    if (!this.#session) {
      throw new Error(`No session.`);
    }
    await this.attemptCommit(0);
  }

  async abort() {
    if (!this.#session) {
      throw new Error(`No session.`);
    }
    await (this.#session as ClientSession).abortTransaction();
  }

  async end() {
    try {
      if (!this.#session) {
        throw new Error(`No session.`);
      }
      await (this.#session as ClientSession).endSession();
    } catch (error) {
      logger.error(`Mongo end session error.`);
    }
  }
}

/**
 * Concurrent transactions touching the same documents abort with a write conflict; MongoDB labels
 * those as safe to retry from the start.
 */
function isTransientTxnError(error: unknown) {
  const e = error as { code?: number; errorLabels?: string[]; hasErrorLabel?: (l: string) => boolean } | null;
  return Boolean(
    e &&
      (e.hasErrorLabel?.(`TransientTransactionError`) ||
        e.errorLabels?.includes(`TransientTransactionError`) ||
        e.code === 112 ||
        e.code === 11000),
  );
}

export { MongoSession, isTransientTxnError };
