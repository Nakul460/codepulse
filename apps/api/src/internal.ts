import { timingSafeEqual, randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import mongoose from "mongoose";
import { repositoryModel, repositorySyncStateModel } from "./db.js";
import { enqueueRepositorySync } from "./queue.js";

export const internalRouter = express.Router();

function validServiceSecret(request: Request) {
  const expected = process.env.API_INTERNAL_SECRET;
  const authorization = request.header("authorization") ?? "";
  const prefix = "Bearer ";
  if (!expected || !authorization.startsWith(prefix)) return false;
  const given = Buffer.from(authorization.slice(prefix.length));
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

internalRouter.post("/repositories/:repoId/sync", async (request: Request, response: Response) => {
  if (!process.env.API_INTERNAL_SECRET) return response.status(503).json({ message: "Internal API secret is not configured" });
  if (!validServiceSecret(request)) return response.status(401).json({ message: "Unauthorized" });
  const repoId = request.params.repoId;
  if (typeof repoId !== "string") return response.status(404).json({ message: "Repository not found" });
  if (!mongoose.Types.ObjectId.isValid(repoId)) return response.status(404).json({ message: "Repository not found" });

  const repository = await repositoryModel.findById(repoId).lean();
  if (!repository) return response.status(404).json({ message: "Repository not found" });
  const previous = await repositorySyncStateModel.findOne({ repositoryId: repository._id }).select("status").lean();
  if (previous?.status === "queued" || previous?.status === "running") {
    return response.status(409).json({ message: "A sync is already queued or running for this repository" });
  }
  const correlationId = randomUUID();
  await repositorySyncStateModel.updateOne({ repositoryId: repository._id }, {
    $set: { status: "queued", lastError: null, correlationId, truncated: false },
  }, { upsert: true });
  try {
    const job = await enqueueRepositorySync({
      repositoryId: String(repository._id),
      fullName: String(repository.fullName),
      installationId: String(repository.installationId),
      reason: "manual",
      correlationId,
    });
    return response.status(202).json({ queued: true, correlationId, jobId: job[0]?.id ?? null });
  } catch (error) {
    await repositorySyncStateModel.updateOne({ repositoryId: repository._id }, {
      $set: { status: "failed", lastError: error instanceof Error ? error.message.slice(0, 1000) : "Could not enqueue sync" },
    });
    console.error("[api] manual repository sync could not be queued:", error instanceof Error ? error.message : "Unknown error");
    return response.status(503).json({ message: "Could not queue repository sync. Check the API and Redis services, then try again." });
  }
});
