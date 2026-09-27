import { NextResponse } from "next/server";
import { getAccountSummary, listLinkedAccounts } from "@/lib/account";
import { requireSessionUser, toErrorResponse } from "@/lib/session";

/**
 * The signed-in user's own account: email, verification state, how they last
 * signed in, and which OAuth accounts are connected.
 *
 * Session-only, like every other route on this account surface. These are
 * identity and credential operations, not API data, so a personal access token
 * must not be able to read them — a leaked token should not reveal which
 * providers a person has connected.
 */
export async function GET() {
  try {
    await requireSessionUser();

    const [account, connections] = await Promise.all([
      getAccountSummary(),
      listLinkedAccounts(),
    ]);

    return NextResponse.json({ account, connections });
  } catch (error) {
    const { status, message } = toErrorResponse(error);
    return NextResponse.json({ message }, { status });
  }
}
