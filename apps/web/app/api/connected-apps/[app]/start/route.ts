import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/modules/auth/lib/session";
import { isOfferedApp, startAppConnection } from "@/modules/connected-apps/lib/connected-apps";
import { getWorkspaceAuth } from "@/modules/workspaces/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/connected-apps/[app]/start — send the signed-in person to connect
 * their own account for one app, then back to where they came from. The
 * connection's access is the app's standard one, and it is broad.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ app: string }> }
): Promise<NextResponse> {
  const { app } = await context.params;
  const session = await getSession();
  const url = new URL(request.url);

  if (!session?.user || !isOfferedApp(app)) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const workspaceId = url.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "Choose a workspace." }, { status: 400 });
  const access = await getWorkspaceAuth(workspaceId);
  if (!access.canManage)
    return NextResponse.json({ error: "Workspace management access required." }, { status: 403 });

  const integrationsUrl = new URL(
    `/workspaces/${url.searchParams.get("workspaceId") ?? ""}/settings/workspace/integrations`,
    request.url
  );

  try {
    const connectUrl = await startAppConnection(session.user.id, app, integrationsUrl.toString());
    return NextResponse.redirect(new URL(connectUrl));
  } catch {
    // Not available yet: the person sees one plain sentence, no detail.
    integrationsUrl.searchParams.set("connected", "unavailable");
    return NextResponse.redirect(integrationsUrl);
  }
}
