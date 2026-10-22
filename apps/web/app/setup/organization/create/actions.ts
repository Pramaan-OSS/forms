"use server";

import { z } from "zod";
import { OperationNotAllowedError } from "@forms/types/errors";
import { getHasNoOrganizations } from "@/lib/instance/service";
import { createMembership } from "@/lib/membership/service";
import { createOrganization } from "@/lib/organization/service";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { DEFAULT_WORKSPACE_NAME } from "@/lib/workspace/constants";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import { createWorkspace } from "@/modules/workspaces/settings/lib/workspace";

const ZCreateOrganizationAction = z.object({
  organizationName: z.string(),
});

export const createOrganizationAction = authenticatedActionClient
  .inputSchema(ZCreateOrganizationAction)
  .action(async ({ ctx, parsedInput }) => {
    await applyRateLimit(rateLimitConfigs.actions.createOrganization, ctx.user.id);

    const hasNoOrganizations = await getHasNoOrganizations();

    if (!hasNoOrganizations) {
      throw new OperationNotAllowedError("This action can only be performed on a fresh instance.");
    }

    const newOrganization = await createOrganization({
      name: parsedInput.organizationName,
    });

    await createMembership(newOrganization.id, ctx.user.id, {
      role: "owner",
      accepted: true,
    });

    await createWorkspace(newOrganization.id, {
      name: DEFAULT_WORKSPACE_NAME,
    });

    return newOrganization;
  });
