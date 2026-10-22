import { z } from "zod";
import { prisma } from "@forms/database";
import { ZWorkspaceTextTools } from "@forms/types/workspace";
import { withV3ApiWrapper } from "@/app/api/v3/lib/api-wrapper";
import { requireSessionWorkspaceAccess } from "@/app/api/v3/lib/auth";
import { textToolSettings } from "@/modules/text-tools/service";

const params = z.object({ workspaceId: z.cuid2() });
export const GET = withV3ApiWrapper({
  auth: "session",
  schemas: { params, query: z.object({}) },
  handler: async ({ parsedInput, authentication, requestId, instance }) => {
    const { workspaceId } = parsedInput.params;
    const access = await requireSessionWorkspaceAccess(
      authentication,
      workspaceId,
      "read",
      requestId,
      instance
    );
    if (access instanceof Response) return access;
    return Response.json({ data: await textToolSettings(workspaceId) });
  },
});
export const PUT = withV3ApiWrapper({
  auth: "session",
  schemas: { params, query: z.object({}), body: ZWorkspaceTextTools },
  handler: async ({ parsedInput, authentication, requestId, instance }) => {
    const { workspaceId } = parsedInput.params;
    const access = await requireSessionWorkspaceAccess(
      authentication,
      workspaceId,
      "manage",
      requestId,
      instance
    );
    if (access instanceof Response) return access;
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { config: true },
    });
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { config: { ...workspace.config, textTools: parsedInput.body } },
    });
    return Response.json({ data: parsedInput.body });
  },
});
