import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import {
  GITHUB_WEBHOOK_EVENTS,
  type GitHubWebhookEvent,
  type WebhookEnvelope,
} from "@codepulse/shared";
import { deliveryModel } from "../db.js";
import { webhookQueue } from "../queue.js";
import {
  SIGNATURE_HEADER,
  SignatureError,
  verifyWebhookSignature,
} from "./signature.js";

/**
 * The webhook receiver.
 *
 * Contract with GitHub, and the reason the heavy lifting is queued:
 *   - answer 2xx fast, because GitHub retries on anything else;
 *   - a `ping` must be acknowledged without being queued, or GitHub marks the
 *     webhook as failing during App setup.
 *
 * Idempotency is enforced by the unique index on `deliveryId` in db.ts, not by
 * a read-then-write check, which would race two simultaneous redeliveries.
 */

const DELIVERY_HEADER = "x-github-delivery";
const EVENT_HEADER = "x-github-event";

export const webhookRouter = express.Router();

webhookRouter.post(
  "/github",
  // Raw bytes: the signature is computed over them. Must be registered before
  // any JSON body parser, hence the route-local express.raw().
  express.raw({ type: "application/json", limit: "5mb" }),
  async (request: Request, response: Response) => {
    const raw = request.body as Buffer;

    if (!Buffer.isBuffer(raw)) {
      return response.status(400).json({ message: "Expected a JSON body" });
    }

    try {
      verifyWebhookSignature(
        raw,
        request.header(SIGNATURE_HEADER),
        process.env.GITHUB_WEBHOOK_SECRET,
      );
    } catch (error) {
      if (error instanceof SignatureError) {
        // 401, and deliberately no detail: a mismatch must not tell an
        // attacker whether the secret is merely wrong or the body was altered.
        console.warn("[webhook] rejected delivery:", error.message);
        return response.status(401).json({ message: "Invalid signature" });
      }

      throw error;
    }

    const deliveryId = request.header(DELIVERY_HEADER);
    const event = request.header(EVENT_HEADER) as GitHubWebhookEvent | undefined;

    if (!deliveryId || !event) {
      return response
        .status(400)
        .json({ message: "Missing delivery or event header" });
    }

    if (event === "ping") {
      return response.status(200).json({ ok: true, event });
    }

    if (!GITHUB_WEBHOOK_EVENTS.includes(event)) {
      // Subscribed to something we do not model yet. Acknowledge so GitHub
      // does not retry forever, and drop it.
      return response.status(202).json({ ok: true, ignored: event });
    }

    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return response.status(400).json({ message: "Malformed JSON body" });
    }

    const envelope: WebhookEnvelope = {
      correlationId: randomUUID(),
      deliveryId,
      event,
      installationId: readInstallationId(payload),
      repositoryId: readRepositoryId(payload),
      fullName: readFullName(payload),
      payload,
    };

    try {
      // Duplicate key means this delivery was already accepted. Answering 200
      // stops the retry loop without doing the work twice.
      await deliveryModel.create({
        deliveryId,
        correlationId: envelope.correlationId,
        event,
        installationId: envelope.installationId,
        repositoryFullName: envelope.fullName,
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        return response.status(200).json({ ok: true, duplicate: true });
      }

      throw error;
    }

      await webhookQueue().add("deliver", envelope, {
      // GitHub's own retry is the outer loop; these are for transient failures
      // on our side (Mongo blip, Redis blip).
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });

    return response.status(202).json({ ok: true, deliveryId });
  },
);

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

function readInstallationId(payload: Record<string, unknown>) {
  const installation = payload.installation;

  if (typeof installation === "object" && installation !== null) {
    const id = (installation as { id?: unknown }).id;
    if (typeof id === "number" || typeof id === "string") {
      return String(id);
    }
  }

  return null;
}

function readRepositoryId(payload: Record<string, unknown>) {
  const repository = payload.repository;

  if (typeof repository === "object" && repository !== null) {
    const id = (repository as { id?: unknown }).id;
    if (typeof id === "number") {
      return id;
    }
  }

  return null;
}

function readFullName(payload: Record<string, unknown>) {
  const repository = payload.repository;

  if (typeof repository === "object" && repository !== null) {
    const fullName = (repository as { full_name?: unknown }).full_name;
    if (typeof fullName === "string") {
      return fullName.toLowerCase();
    }
  }

  return null;
}
