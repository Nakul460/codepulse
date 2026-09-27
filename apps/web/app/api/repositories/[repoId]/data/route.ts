import { NextResponse } from "next/server";
import { connectProjectDB } from "@/db/db";
import { githubBranchModel, githubCommitModel, githubDeploymentModel, githubIssueModel, githubPullRequestModel } from "@/db/schema";
import { getRepository } from "@/lib/repositories";
import { requireUser, toErrorResponse } from "@/lib/session";

type Context = RouteContext<"/api/repositories/[repoId]/data">;

function serialize(doc: Record<string, unknown>) {
  const record = { ...doc };
  const id = String(record._id);
  delete record._id;
  delete record.__v;
  return { id, ...record };
}

export async function GET(request: Request, ctx: Context) {
  try {
    const user = await requireUser(request);
    const { repoId } = await ctx.params;
    const repository = await getRepository(repoId, user);
    await connectProjectDB();
    const repositoryId = repository.githubId;
    const [branches, commits, pullRequests, issues, deployments] = await Promise.all([
      githubBranchModel.find({ repositoryId }).sort({ name: 1 }).limit(500).lean(),
      githubCommitModel.find({ repositoryId }).sort({ committedAt: -1 }).limit(100).lean(),
      githubPullRequestModel.find({ repositoryId }).sort({ updatedAtGithub: -1 }).limit(100).lean(),
      githubIssueModel.find({ repositoryId }).sort({ updatedAtGithub: -1 }).limit(100).lean(),
      githubDeploymentModel.find({ repositoryId }).sort({ createdAtGithub: -1 }).limit(100).lean(),
    ]);
    return NextResponse.json({
      repository,
      branches: branches.map((row) => serialize(row as unknown as Record<string, unknown>)),
      commits: commits.map((row) => serialize(row as unknown as Record<string, unknown>)),
      pullRequests: pullRequests.map((row) => serialize(row as unknown as Record<string, unknown>)),
      issues: issues.map((row) => serialize(row as unknown as Record<string, unknown>)),
      deployments: deployments.map((row) => serialize(row as unknown as Record<string, unknown>)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
