import { NextResponse } from "next/server";
import {
  getInstallation,
  GitHubError,
  listInstallationRepositories,
  verifyInstallState,
} from "@/lib/github";
import { recordInstallation } from "@/lib/repositories";
import { assertOrgAdmin } from "@/lib/organizations";
import {
  requireUser,
  toErrorResponse,
} from "@/lib/session";
import { installCallbackSchema } from "@/lib/validation";

/**
 * GitHub redirects here after the user installs the App.
 *
 * Two things are deliberate:
 *
 * 1. **No `assertSameOrigin`.** This is a cross-site top-level navigation *from*
 *    github.com, so the CSRF guard would correctly reject it. The signed
 *    `state` is the defence instead: it names the org and the user, and both
 *    are re-checked here.
 * 2. **Failures redirect rather than return JSON**, because the user is
 *    mid-navigation in a browser and a JSON error page is a dead end. The
 *    organization selection is carried back to the repositories UI.
 */
function backToRepositories(request: Request, params: Record<string, string>) {
  const target = new URL("/dashboard/repositories", request.url);

  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }

  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  let callbackOrgId = "";
  try {
    const user = await requireUser(request);
    const query = Object.fromEntries(new URL(request.url).searchParams);

    const parsed = installCallbackSchema.safeParse(query);

    if (!parsed.success) {
      return backToRepositories(request, {
        github: "error",
        message: "GitHub sent an unexpected response.",
      });
    }

    const state = verifyInstallState(parsed.data.state);
    callbackOrgId = state.organizationId;

    // The state names the user who started the flow. A different session
    // completing someone else's install would attach the App to their org.
    if (state.userId !== user.id) {
      return backToRepositories(request, {
        github: "error",
        message: "That install was started by a different account.",
      });
    }

    // An update or request event carries no new grants, so there is nothing to
    // attach. Acknowledging it is enough.
    if (parsed.data.setup_action && parsed.data.setup_action !== "install") {
      return backToRepositories(request, { github: "updated", org: state.organizationId });
    }

    // Re-checked here, not just at the start of the flow: the round trip to
    // github.com is long enough for the admin to have been demoted or removed,
    // and the state is only as old as its signature.
    await assertOrgAdmin(state.organizationId, user);

    const installationId = parsed.data.installation_id;
    const installation = await getInstallation(installationId);
    const repositories = await listInstallationRepositories(installationId);

    const { attached, skipped } = await recordInstallation({
      actor: user,
      organizationId: state.organizationId,
      installationId,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      repositories,
    });

    return backToRepositories(request, {
      github: "connected",
      org: state.organizationId,
      account: installation.account.login,
      attached: String(attached.length),
      skipped: String(skipped.length),
    });
  } catch (error) {
    if (error instanceof GitHubError) {
      console.error("[github] install callback failed:", error.message);
      return backToRepositories(request, { github: "error", message: error.message, ...(callbackOrgId ? { org: callbackOrgId } : {}) });
    }

    const { message } = toErrorResponse(error);
    return backToRepositories(request, { github: "error", message, ...(callbackOrgId ? { org: callbackOrgId } : {}) });
  }
}
